/*
  # Transfer / Deal Closure — Phase 2 (Backend)

  This migration lands the atomic Transfer RPC plus the historical-snapshot
  column on nw_transactions. Purely additive.

  Design principles (from Phase 2 approval):

    1. RPC is DATABASE-ONLY. No email, no external calls, no side effects
       outside the DB transaction.
    2. RPC is IDEMPOTENT. Re-invocation on the same deal returns the
       existing transaction rather than raising.
    3. RPC is SELF-AUTHENTICATING. It resolves the caller's admin identity
       and re-verifies eligibility inside the FOR UPDATE lock. Direct call
       from an untrusted context is blocked by REVOKE.
    4. Transaction row carries a rich SNAPSHOT of the deal, client, RM,
       ledger, instrument and revenue basis — preserving historical accuracy
       even if master data changes later.
*/

-- =====================================================================
-- 1. Rich snapshot column on nw_transactions
--
--    JSONB so future audit needs (e.g. capturing insurance policy details,
--    trail history) can be added without a further schema change.
-- =====================================================================

ALTER TABLE nw_transactions
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Index for audit / compliance queries by client PAN historically
CREATE INDEX IF NOT EXISTS idx_nw_transactions_snapshot_client_pan
  ON nw_transactions ((snapshot->'client'->>'pan'))
  WHERE snapshot IS NOT NULL AND snapshot ? 'client';

-- =====================================================================
-- 2. nw_transfer_deal(p_deal_id, p_remarks) — atomic Transfer RPC
--
--    Idempotent, self-authenticating, race-safe under FOR UPDATE.
--    Returns jsonb: { transaction_id, transfer_audit_id, idempotent,
--                     transferred_at, existing_transferred_at }
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_transfer_deal(
  p_deal_id  uuid,
  p_admin_id uuid,
  p_remarks  text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_employee      nw_employees%ROWTYPE;
  v_deal          nw_deal_confirmations%ROWTYPE;
  v_summary       record;
  v_client        nw_clients%ROWTYPE;
  v_rm            nw_employees%ROWTYPE;
  v_existing_txn  nw_transactions%ROWTYPE;
  v_event_id      uuid;
  v_txn_id        uuid;
  v_txn_type      text;
  v_product_type  text;
  v_sourcing_type text;
  v_snapshot      jsonb;
  v_now           timestamptz := now();
BEGIN
  IF p_deal_id IS NULL THEN
    RAISE EXCEPTION 'deal_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- ------------------------------------------------------------------
  -- (a) Verify the passed-in admin. The edge function is the trust
  --     boundary that binds this identity to the JWT owner; here we
  --     re-verify the row still exists, is active, and has admin role.
  --     Because EXECUTE is GRANTed only to service_role, no path
  --     other than the edge function can reach this function.
  -- ------------------------------------------------------------------
  SELECT * INTO v_employee
    FROM nw_employees
   WHERE id = p_admin_id
     AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorised: admin employee not found or inactive'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_employee.role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorised: admin role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ------------------------------------------------------------------
  -- (b) Lock the deal row for the duration of this transaction
  -- ------------------------------------------------------------------
  SELECT * INTO v_deal
    FROM nw_deal_confirmations
   WHERE id = p_deal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal % not found', p_deal_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- ------------------------------------------------------------------
  -- (c) IDEMPOTENCY CHECK — if a transferred transaction already exists
  --     for this deal, return the existing identifiers verbatim.
  --     The unique index (uq_nw_transactions_deal) remains the final
  --     safety net for any race that slips past this check.
  -- ------------------------------------------------------------------
  SELECT * INTO v_existing_txn
    FROM nw_transactions
   WHERE deal_confirmation_id = p_deal_id
     AND transfer_stage = 'transferred'
   LIMIT 1;

  IF FOUND THEN
    SELECT id INTO v_event_id
      FROM nw_deal_confirmation_events
     WHERE deal_id = p_deal_id
       AND event_type = 'transferred'
     ORDER BY created_at DESC
     LIMIT 1;

    RETURN jsonb_build_object(
      'transaction_id',           v_existing_txn.id,
      'transfer_audit_id',        v_event_id,
      'idempotent',               true,
      'transferred_at',           v_existing_txn.transferred_at,
      'existing_transferred_at',  v_existing_txn.transferred_at
    );
  END IF;

  -- ------------------------------------------------------------------
  -- (d) Re-verify eligibility — never trust the caller's list snapshot
  -- ------------------------------------------------------------------
  IF v_deal.acceptance_status <> 'accepted' THEN
    RAISE EXCEPTION
      'Deal is no longer accepted (current acceptance_status: %)',
      v_deal.acceptance_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT total_paid_amount, outstanding_amount, payment_status,
         payment_count, last_payment_at
    INTO v_summary
    FROM nw_deal_payment_summary
   WHERE deal_id = p_deal_id;

  IF NOT FOUND OR v_summary.payment_status <> 'fully_paid' THEN
    RAISE EXCEPTION
      'Deal is not fully paid (payment_status: %, outstanding: %)',
      COALESCE(v_summary.payment_status, 'not_paid'),
      COALESCE(v_summary.outstanding_amount, 0)
      USING ERRCODE = 'check_violation';
  END IF;

  -- ------------------------------------------------------------------
  -- (e) Map deal-side values to nw_transactions enums
  -- ------------------------------------------------------------------
  v_txn_type := LOWER(COALESCE(v_deal.transaction_type, ''));
  IF v_txn_type NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION
      'Unsupported transaction_type on deal: %', v_deal.transaction_type
      USING ERRCODE = 'check_violation';
  END IF;

  v_product_type := CASE v_deal.product_type
    WHEN 'Unlisted Share' THEN 'unlisted_share'
    WHEN 'Secondary Bond' THEN 'secondary_bond'
    WHEN 'Primary Bond'   THEN 'primary_bond'
    WHEN 'Fixed Deposit'  THEN 'fixed_deposit'
    WHEN 'Mutual Fund'    THEN 'mutual_fund'
    WHEN 'Insurance'      THEN 'insurance'
    ELSE NULL
  END;
  IF v_product_type IS NULL THEN
    RAISE EXCEPTION
      'Transfer is not enabled for product_type "%" in v1.', v_deal.product_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- ------------------------------------------------------------------
  -- (f) Fetch client + RM master data for the snapshot (live values —
  --     falls back to deal's snap_* fields if master rows were deleted)
  -- ------------------------------------------------------------------
  SELECT * INTO v_client   FROM nw_clients   WHERE id = v_deal.client_id;
  SELECT * INTO v_rm       FROM nw_employees WHERE id = v_deal.employee_id;

  v_sourcing_type := COALESCE(v_client.sourced_via, 'direct');

  -- ------------------------------------------------------------------
  -- (g) Build the rich historical snapshot (JSONB)
  -- ------------------------------------------------------------------
  v_snapshot := jsonb_build_object(
    'snapshot_version', 1,
    'snapshotted_at',   v_now,

    'deal', jsonb_build_object(
      'id',                   v_deal.id,
      'confirmation_number',  v_deal.confirmation_number,
      'deal_date',            v_deal.deal_date,
      'accepted_at',          v_deal.accepted_at,
      'signer_email',         v_deal.signer_email,
      'signed_pdf_path',      v_deal.signed_pdf_path
    ),

    'client', jsonb_build_object(
      'id',                   v_deal.client_id,
      'client_code',          v_client.client_code,
      'full_name',            v_deal.snap_client_name,
      'pan',                  v_deal.snap_pan,
      'email',                v_deal.snap_email,
      'phone',                v_deal.snap_phone,
      'dp_name',              v_deal.snap_dp_name,
      'demat_account',        v_deal.snap_demat_account,
      'bank_name',            v_deal.snap_bank_name,
      'bank_account',         v_deal.snap_bank_account,
      'bank_ifsc',            v_deal.snap_bank_ifsc,
      'address',              v_deal.snap_address,
      'sourced_via',          v_client.sourced_via,
      'dsa_id',               v_client.dsa_id
    ),

    'relationship_manager', jsonb_build_object(
      'id',            v_deal.employee_id,
      'employee_code', v_rm.employee_code,
      'full_name',     v_rm.full_name,
      'email',         v_rm.email
    ),

    'instrument', jsonb_build_object(
      'product_type_raw',  v_deal.product_type,
      'product_type_norm', v_product_type,
      'transaction_type',  v_deal.transaction_type,
      'security_name',     v_deal.security_name,
      'isin',              NULLIF(v_deal.isin, ''),
      'quantity',          v_deal.quantity,
      'rate_per_unit',     v_deal.rate_per_unit,
      'settlement_amount', v_deal.settlement_amount,
      'stamp_duty',        v_deal.stamp_duty
    ),

    'revenue_basis', jsonb_build_object(
      'landing_cost',      v_deal.landing_cost,
      'insurance_revenue', v_deal.insurance_revenue,
      'trail_percent',     v_deal.trail_percent,
      'trail_start_date',  v_deal.trail_start_date,
      'brokerage_amount',  v_deal.brokerage_amount
    ),

    'payment_summary', jsonb_build_object(
      'total_paid_amount',  v_summary.total_paid_amount,
      'outstanding_amount', v_summary.outstanding_amount,
      'payment_count',      v_summary.payment_count,
      'last_payment_at',    v_summary.last_payment_at
    ),

    'transferred_by', jsonb_build_object(
      'id',            v_employee.id,
      'employee_code', v_employee.employee_code,
      'full_name',     v_employee.full_name,
      'role',          v_employee.role
    )
  );

  -- ------------------------------------------------------------------
  -- (h) INSERT the transaction row — the executed record of truth
  --     (the unique index uq_nw_transactions_deal remains the final
  --      safety net for any race that slipped past step (c))
  -- ------------------------------------------------------------------
  INSERT INTO nw_transactions (
    deal_confirmation_id,
    client_id,
    employee_id,
    sourcing_type,
    txn_type,
    product_type,
    product_name,
    quantity,
    per_unit_price,
    consolidated_amount,
    txn_date,
    isin,
    landing_cost,
    insurance_revenue,
    trail_percent,
    trail_start_date,
    notes,
    snapshot,
    transfer_stage,
    transferred_at,
    transferred_by,
    transfer_remarks
  ) VALUES (
    p_deal_id,
    v_deal.client_id,
    v_deal.employee_id,
    v_sourcing_type,
    v_txn_type,
    v_product_type,
    v_deal.security_name,
    v_deal.quantity,
    v_deal.rate_per_unit,
    v_deal.settlement_amount,
    v_deal.deal_date,
    NULLIF(v_deal.isin, ''),
    v_deal.landing_cost,
    v_deal.insurance_revenue,
    v_deal.trail_percent,
    v_deal.trail_start_date,
    COALESCE(NULLIF(p_remarks, ''), ''),
    v_snapshot,
    'transferred',
    v_now,
    v_employee.id,
    NULLIF(p_remarks, '')
  )
  RETURNING id INTO v_txn_id;

  -- ------------------------------------------------------------------
  -- (i) Append the audit event within the same transaction
  -- ------------------------------------------------------------------
  INSERT INTO nw_deal_confirmation_events
    (deal_id, event_type, actor, metadata)
  VALUES (
    p_deal_id,
    'transferred',
    'employee',
    jsonb_build_object(
      'transaction_id',       v_txn_id,
      'transferred_by',       v_employee.id,
      'transferred_by_name',  v_employee.full_name,
      'transferred_by_role',  v_employee.role,
      'remarks',              NULLIF(p_remarks, ''),
      'payment_count',        v_summary.payment_count,
      'total_paid_amount',    v_summary.total_paid_amount,
      'product_type',         v_product_type,
      'txn_type',             v_txn_type,
      'settlement_amount',    v_deal.settlement_amount
    )
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'transaction_id',    v_txn_id,
    'transfer_audit_id', v_event_id,
    'idempotent',        false,
    'transferred_at',    v_now
  );
END;
$$;

-- ------------------------------------------------------------------
-- Access model: the RPC is EXECUTABLE ONLY BY service_role (i.e. via
-- the transfer-deal edge function). Authenticated frontend clients
-- cannot invoke it directly — this prevents an authenticated non-admin
-- from bypassing the edge function's admin gate.
-- ------------------------------------------------------------------
REVOKE ALL ON FUNCTION nw_transfer_deal(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION nw_transfer_deal(uuid, uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION nw_transfer_deal(uuid, uuid, text) TO service_role;
