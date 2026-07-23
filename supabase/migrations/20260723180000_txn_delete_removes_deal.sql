/*
  # Deleting a booked transaction must delete its deal — never re-queue it

  Owner-reported 2026-07-23: deleting a transferred transaction left its deal
  fully-paid-and-unbooked, so the deal reappeared in the Transfer Queue for
  re-booking. Owner decision: deleting the transaction removes the deal (and
  its payments) with it. Deleting is a full unwind, not an un-booking.

  Also fixes: the previously deployed frontend deletes transactions with a
  plain DELETE (no cascade RPC). Since the admin exemptions (20260723170000)
  made such deletes succeed for admins, they bypassed the holding unwind and
  the deal cleanup entirely. Moving the cascade into row triggers makes every
  delete path — RPC, plain frontend delete, SQL console — behave identically.

  ## Changes
    1. BEFORE DELETE trigger on nw_transactions: guards DSA-covered rows
       (admin-only), removes the DSA debit-note line, unwinds the portfolio
       holding (nw_unwind_txn_holding) and recomputes portfolio_value.
    2. AFTER DELETE trigger on nw_transactions: if the row was a transferred
       booking of a deal, deletes that deal's payments and the deal itself so
       it can never re-enter nw_deal_transfer_eligible.
    3. nw_delete_transaction_cascade / nw_delete_deal_cascade are reduced to
       authorisation + DELETE — the triggers now own the cascade. (Previously
       the RPCs unwound the holding themselves; with the new triggers that
       would double-subtract.)
    4. One-off cleanup: removes the four deals already orphaned into the
       Transfer Queue by earlier transaction deletions (verified live:
       transferred event exists, no transaction row remains, no holdings were
       left behind because Transfer-Queue bookings never create holdings).

  ## Maintenance note
    A future administrative "un-book but keep the deal" reversal (the old
    ANSHUL pattern, 20260722160000) must now disable
    trg_nw_txn_delete_cascade_deal for its single statement, otherwise the
    deal will be deleted along with the transaction.
*/

-- =====================================================================
-- 1. BEFORE DELETE — DSA guard + line removal + holding unwind
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_txn_before_delete_unwind()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM dsa_debit_note_lines WHERE transaction_id = OLD.id) THEN
    IF NOT nw_current_emp_is_admin() THEN
      RAISE EXCEPTION 'This transaction is on a DSA debit note. Ask an admin to remove it.'
        USING ERRCODE = 'check_violation';
    END IF;
    DELETE FROM dsa_debit_note_lines WHERE transaction_id = OLD.id;
  END IF;

  PERFORM nw_unwind_txn_holding(OLD);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_txn_before_delete_unwind ON nw_transactions;
CREATE TRIGGER trg_nw_txn_before_delete_unwind
  BEFORE DELETE ON nw_transactions
  FOR EACH ROW EXECUTE FUNCTION nw_txn_before_delete_unwind();

-- =====================================================================
-- 2. AFTER DELETE — a deleted booking takes its deal (and payments) with it
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_txn_after_delete_remove_deal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.deal_confirmation_id IS NOT NULL AND OLD.transfer_stage = 'transferred' THEN
    -- Reversal rows first: reverses_payment_id is ON DELETE RESTRICT.
    DELETE FROM nw_deal_payments
     WHERE deal_confirmation_id = OLD.deal_confirmation_id
       AND reverses_payment_id IS NOT NULL;
    DELETE FROM nw_deal_payments
     WHERE deal_confirmation_id = OLD.deal_confirmation_id;
    -- Events / OTPs / email log cascade via their FKs.
    DELETE FROM nw_deal_confirmations WHERE id = OLD.deal_confirmation_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_txn_delete_cascade_deal ON nw_transactions;
CREATE TRIGGER trg_nw_txn_delete_cascade_deal
  AFTER DELETE ON nw_transactions
  FOR EACH ROW EXECUTE FUNCTION nw_txn_after_delete_remove_deal();

-- =====================================================================
-- 3. RPCs slim down to authorisation + DELETE (triggers own the cascade)
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_delete_transaction_cascade(p_txn_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_txn    nw_transactions%ROWTYPE;
  v_emp_id uuid    := nw_current_employee_id();
  v_admin  boolean := nw_current_emp_is_admin();
  v_owner  boolean := false;
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

  -- The BEFORE/AFTER DELETE triggers unwind the DSA line + holding and remove
  -- the source deal + its payments.
  DELETE FROM nw_transactions WHERE id = p_txn_id;

  RETURN jsonb_build_object('ok', true, 'deal_id', v_txn.deal_confirmation_id);
END;
$$;

CREATE OR REPLACE FUNCTION nw_delete_deal_cascade(p_deal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal   nw_deal_confirmations%ROWTYPE;
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

  -- Deleting the booked transaction fires the triggers, which also delete this
  -- deal and its payments. The statements after the loop cover deals that were
  -- never booked (no transaction row).
  DELETE FROM nw_transactions WHERE deal_confirmation_id = p_deal_id;

  DELETE FROM nw_deal_payments
   WHERE deal_confirmation_id = p_deal_id AND reverses_payment_id IS NOT NULL;
  DELETE FROM nw_deal_payments
   WHERE deal_confirmation_id = p_deal_id;

  DELETE FROM nw_deal_confirmations WHERE id = p_deal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- =====================================================================
-- 4. One-off cleanup: the four deals already orphaned into the queue
--
--    Verified on the live DB before writing (2026-07-23): each has a
--    'transferred' event but no nw_transactions row, and sits in
--    nw_deal_transfer_eligible:
--      2c0afe52-…  DC-1783079211750  E. Aharon Samuel  SBI Funds        ₹99,000
--      7c325996-…  DC-1783079328619  E. Aharon Samuel  ORAVEL (OYO)     ₹1,00,716
--      5f659992-…  DC-1784278577516  PURUSHOTHAMAN S   CSK              ₹2,50,000
--      31761c95-…  DC-NIYOM-004-001  E. Aharon Samuel  NSE              ₹96,165
--    No portfolio holdings were left by the deleted bookings (Transfer-Queue
--    bookings never create holdings), so no holding unwind is needed here.
-- =====================================================================

DO $$
DECLARE
  v_ids uuid[] := ARRAY[
    '2c0afe52-ff03-4971-9346-6d00d6f00084',
    '7c325996-8f0d-48a6-9df9-e32aab4b4c16',
    '5f659992-682c-469a-9aac-388c751b5085',
    '31761c95-ceaa-4f69-b38e-5af12aae2fac'
  ]::uuid[];
  v_id uuid;
  v_left int;
BEGIN
  FOREACH v_id IN ARRAY v_ids LOOP
    -- Safety: only delete while the deal still matches the orphan signature.
    IF EXISTS (SELECT 1 FROM nw_transactions t WHERE t.deal_confirmation_id = v_id) THEN
      RAISE NOTICE 'Deal % has a transaction again — skipping cleanup.', v_id;
      CONTINUE;
    END IF;
    DELETE FROM nw_deal_payments
     WHERE deal_confirmation_id = v_id AND reverses_payment_id IS NOT NULL;
    DELETE FROM nw_deal_payments WHERE deal_confirmation_id = v_id;
    DELETE FROM nw_deal_confirmations WHERE id = v_id;
  END LOOP;

  SELECT count(*) INTO v_left
    FROM nw_deal_confirmations WHERE id = ANY(v_ids);
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'Cleanup incomplete: % orphaned deal(s) still present', v_left;
  END IF;
  RAISE NOTICE 'Orphaned deals removed from the Transfer Queue.';
END $$;
