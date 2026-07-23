/*
  # New edit process — admin edit/delete for deal confirmations & transactions

  Owner-approved 2026-07-23 (purushothaman@niyomwealth.com).

  Grants admin / super_admin the ability to correct or remove otherwise-immutable
  records, and unwinds every downstream dependency so portfolio, MIS, ledger,
  the Transfer Queue and DSA payouts stay consistent.

  ## Owner decisions
    1. Editing an ACCEPTED (client-signed) deal resets it to 'pending' and
       invalidates the signed link + stored signed PDF reference, so the client
       must re-review and re-accept. Non-signed deals are unchanged.
    2. Delete is FULL CASCADE: removing a deal wipes its payments, its booked
       transaction, that transaction's portfolio holding and its DSA debit-note
       coverage line, and returns the deal to the Transfer Queue. Removing a
       transaction does the same for that one transaction.
    3. Portfolio holdings + client portfolio_value re-sync on every transaction
       edit/delete (previously they synced on insert only, so edits/deletes
       silently drifted).

  ## Non-admins are unaffected
    Every existing immutability / ownership guard still applies to non-admins.
    The accept edge function (service_role, auth.uid() = NULL) is likewise
    unaffected: it transitions a pending row to accepted in a single write, so
    OLD.acceptance_status is never 'accepted' at that moment.

  Relies on existing helpers nw_current_emp_is_admin() and
  nw_current_employee_id() (migration 20260718100000).
*/

-- =====================================================================
-- 1. Admin exemptions on the immutability guards
--
--    Each guard keeps its full force for non-admins; an active admin /
--    super_admin (resolved from the request JWT via nw_current_emp_is_admin)
--    is exempted. auth.uid() is preserved through SECURITY DEFINER, so these
--    exemptions also apply while the cascade RPCs below run as the admin.
-- =====================================================================

-- 1a. Accepted deal confirmations — admins may edit.
CREATE OR REPLACE FUNCTION nw_block_accepted_deal_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.acceptance_status = 'accepted' AND NOT nw_current_emp_is_admin() THEN
    RAISE EXCEPTION
      'Accepted deal confirmation % is immutable. Create a new deal confirmation for corrections.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
-- 1b. Transferred transactions — admins may edit any field; non-admins keep the
--     revenue-basis / txn_date / notes whitelist.
CREATE OR REPLACE FUNCTION nw_check_txn_post_transfer_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.transfer_stage = 'transferred' AND NOT nw_current_emp_is_admin() THEN
    IF (to_jsonb(OLD)
          - 'landing_cost' - 'insurance_revenue' - 'trail_percent'
          - 'trail_start_date' - 'txn_date' - 'notes' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(NEW)
          - 'landing_cost' - 'insurance_revenue' - 'trail_percent'
          - 'trail_start_date' - 'txn_date' - 'notes' - 'updated_at')
    THEN
      RAISE EXCEPTION
        'Transferred transaction % is immutable except revenue-basis fields (landing cost, insurance revenue, MF trail) and the transaction date.',
        OLD.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- 1c. Transferred transactions — admins may delete.
CREATE OR REPLACE FUNCTION nw_check_txn_no_delete_after_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.transfer_stage = 'transferred' AND NOT nw_current_emp_is_admin() THEN
    RAISE EXCEPTION
      'Transferred transaction % cannot be deleted. Ask an admin.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;
-- =====================================================================
-- 2. RLS — admins may UPDATE accepted deal confirmations
--
--    (Deletes are routed through nw_delete_deal_cascade below, which is
--    SECURITY DEFINER and self-authorises, so the DELETE policy is left as-is.)
-- =====================================================================

DROP POLICY IF EXISTS "Employees can update non-accepted deal confirmations" ON nw_deal_confirmations;
CREATE POLICY "Employees can update deal confirmations"
  ON nw_deal_confirmations FOR UPDATE
  TO authenticated
  USING (
    (acceptance_status <> 'accepted' OR nw_current_emp_is_admin())
    AND (
      employee_id = nw_current_employee_id()
      OR nw_current_emp_is_admin()
    )
  )
  WITH CHECK (
    employee_id = nw_current_employee_id()
    OR nw_current_emp_is_admin()
  );
-- =====================================================================
-- 3. Holdings unwind helper
--
--    Reverses one BUY transaction's contribution to its portfolio holding and
--    recomputes the client's portfolio_value. Mirrors the frontend
--    syncTransactionToHolding() aggregation (client_id + product_name +
--    product_type key; secondary bonds value at client_price × qty). A no-op
--    when the transaction never produced a holding (sells, and transactions
--    created by the Transfer Queue RPC, which does not build holdings).
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_unwind_txn_holding(p_txn nw_transactions)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount  numeric;
  v_hold    nw_holdings%ROWTYPE;
  v_new_qty numeric;
  v_new_inv numeric;
BEGIN
  IF p_txn.txn_type <> 'buy' THEN
    RETURN;
  END IF;

  v_amount := CASE
    WHEN p_txn.product_type = 'secondary_bond' AND p_txn.client_price IS NOT NULL
      THEN p_txn.client_price * COALESCE(p_txn.quantity, 0)
    ELSE COALESCE(p_txn.consolidated_amount, 0)
  END;

  SELECT * INTO v_hold
    FROM nw_holdings
   WHERE client_id    = p_txn.client_id
     AND product_name = p_txn.product_name
     AND product_type = p_txn.product_type
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;  -- transaction never contributed to a holding
  END IF;

  v_new_qty := COALESCE(v_hold.quantity, 0)        - COALESCE(p_txn.quantity, 0);
  v_new_inv := COALESCE(v_hold.invested_amount, 0) - v_amount;

  IF v_new_qty <= 0 OR v_new_inv <= 0 THEN
    DELETE FROM nw_holdings WHERE id = v_hold.id;
  ELSE
    UPDATE nw_holdings
       SET quantity        = v_new_qty,
           invested_amount = v_new_inv,
           avg_cost        = v_new_inv / v_new_qty,
           current_value   = v_new_inv,
           updated_at      = now()
     WHERE id = v_hold.id;
  END IF;

  UPDATE nw_clients c
     SET portfolio_value = COALESCE(
           (SELECT SUM(current_value) FROM nw_holdings WHERE client_id = c.id), 0)
   WHERE c.id = p_txn.client_id;
END;
$$;
REVOKE ALL ON FUNCTION nw_unwind_txn_holding(nw_transactions) FROM PUBLIC;
-- =====================================================================
-- 4. Cascade-delete a single transaction
--
--    Authorises the caller (admin, or the owning RM for their own client),
--    blocks non-admins from deleting a transferred / DSA-covered row, unwinds
--    the DSA coverage line + portfolio holding, then deletes the row
--    (nw_txn_documents cascades). A deal it was booked from returns to the
--    Transfer Queue automatically (nw_deal_transfer_eligible is a view).
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_delete_transaction_cascade(p_txn_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_txn     nw_transactions%ROWTYPE;
  v_emp_id  uuid    := nw_current_employee_id();
  v_admin   boolean := nw_current_emp_is_admin();
  v_owner   boolean := false;
  v_has_dsa boolean;
BEGIN
  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_txn FROM nw_transactions WHERE id = p_txn_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found', p_txn_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT (c.employee_id = v_emp_id) INTO v_owner
    FROM nw_clients c WHERE c.id = v_txn.client_id;

  IF NOT v_admin AND NOT COALESCE(v_owner, false) THEN
    RAISE EXCEPTION 'Not authorised to delete this transaction'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_txn.transfer_stage = 'transferred' AND NOT v_admin THEN
    RAISE EXCEPTION 'Transferred transaction % cannot be deleted. Ask an admin.', p_txn_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (SELECT 1 FROM dsa_debit_note_lines WHERE transaction_id = p_txn_id)
    INTO v_has_dsa;
  IF v_has_dsa THEN
    IF NOT v_admin THEN
      RAISE EXCEPTION 'This transaction is on a DSA debit note. Ask an admin to remove it.'
        USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM dsa_debit_note_lines WHERE transaction_id = p_txn_id;
  END IF;

  PERFORM nw_unwind_txn_holding(v_txn);

  DELETE FROM nw_transactions WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true, 'deal_id', v_txn.deal_confirmation_id);
END;
$$;
REVOKE ALL ON FUNCTION nw_delete_transaction_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nw_delete_transaction_cascade(uuid) TO authenticated;
-- =====================================================================
-- 5. Cascade-delete a deal confirmation
--
--    Admins may delete any deal; an owning RM may delete only their own
--    non-accepted deals. Cascades the booked transaction (DSA line, holding,
--    row), then the deal's payments (refund/reversal rows first, to satisfy the
--    reverses_payment_id RESTRICT self-reference), then the deal itself
--    (events + email log cascade via their FKs).
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_delete_deal_cascade(p_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal   nw_deal_confirmations%ROWTYPE;
  v_txn    nw_transactions%ROWTYPE;
  v_emp_id uuid    := nw_current_employee_id();
  v_admin  boolean := nw_current_emp_is_admin();
BEGIN
  IF v_emp_id IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_deal FROM nw_deal_confirmations WHERE id = p_deal_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal % not found', p_deal_id USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_admin AND v_deal.employee_id <> v_emp_id THEN
    RAISE EXCEPTION 'Not authorised to delete this deal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_deal.acceptance_status = 'accepted' AND NOT v_admin THEN
    RAISE EXCEPTION 'Accepted deal % can only be deleted by an admin.', p_deal_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Booked transaction(s) — normally at most one (uq_nw_transactions_deal).
  FOR v_txn IN SELECT * FROM nw_transactions WHERE deal_confirmation_id = p_deal_id LOOP
    DELETE FROM dsa_debit_note_lines WHERE transaction_id = v_txn.id;
    PERFORM nw_unwind_txn_holding(v_txn);
    DELETE FROM nw_transactions WHERE id = v_txn.id;
  END LOOP;

  -- Payments (FK RESTRICT). Delete reversal rows first so the self-reference
  -- (reverses_payment_id) does not block the parent payment's removal.
  DELETE FROM nw_deal_payments
   WHERE deal_confirmation_id = p_deal_id AND reverses_payment_id IS NOT NULL;
  DELETE FROM nw_deal_payments
   WHERE deal_confirmation_id = p_deal_id;

  DELETE FROM nw_deal_confirmations WHERE id = p_deal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION nw_delete_deal_cascade(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nw_delete_deal_cascade(uuid) TO authenticated;
