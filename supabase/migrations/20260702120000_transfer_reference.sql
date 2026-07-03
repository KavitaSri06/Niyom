/*
  # Transfer / Deal Closure — Phase 2 refinement
  # Human-readable Transfer Reference + enriched snapshot metadata

  Adds:
    1. nw_transactions.transfer_reference — TRF-YYYY-NNNNNN, allocated atomically
       inside the RPC under FOR UPDATE. Unique per year.
    2. Updated snapshot metadata keys:
         schema_version       (canonical field name)
         snapshot_taken_at    (canonical field name)
         transfer_reference   (echoes the reference)
         application_version  (fed by the edge function)
    3. RPC signature: adds `p_app_version text` (nullable, defaults NULL).

  Backwards compatible: existing callers pass 3 args; the new arg is
  positional-optional. The RPC's jsonb response gains `transfer_reference`.
*/

-- =====================================================================
-- 1. Human-readable Transfer Reference on nw_transactions
-- =====================================================================

ALTER TABLE nw_transactions
  ADD COLUMN IF NOT EXISTS transfer_reference text;

-- Format guard (belt-and-braces; the RPC also enforces).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'nw_transactions'::regclass
       AND conname  = 'nw_transactions_transfer_reference_fmt_ck'
  ) THEN
    ALTER TABLE nw_transactions
      ADD CONSTRAINT nw_transactions_transfer_reference_fmt_ck
      CHECK (
        transfer_reference IS NULL
        OR transfer_reference ~ '^TRF-\d{4}-\d{6}$'
      );
  END IF;
END $$;

-- Unique per (year prefix) — the reference itself is globally unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nw_transactions_transfer_reference
  ON nw_transactions (transfer_reference)
  WHERE transfer_reference IS NOT NULL;

-- =====================================================================
-- 2. Updated Transfer RPC — adds p_app_version, allocates transfer_reference,
--    refreshes snapshot keys, and returns transfer_reference to callers.
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_transfer_deal(
  p_deal_id     uuid,
  p_admin_id    uuid,
  p_remarks     text,
  p_app_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_employee        nw_employees%ROWTYPE;
  v_deal            nw_deal_confirmations%ROWTYPE;
  v_summary         record;
  v_client          nw_clients%ROWTYPE;
  v_rm              nw_employees%ROWTYPE;
  v_existing_txn    nw_transactions%ROWTYPE;
  v_event_id        uuid;
  v_txn_id          uuid;
  v_txn_type        text;
  v_product_type    text;
  v_sourcing_type   text;
  v_snapshot        jsonb;
  v_now             timestamptz := now();
  v_year            int         := EXTRACT(YEAR FROM v_now)::int;
  v_year_str        text        := lpad(v_year::text, 4, '0');
  v_next_seq        int;
  v_transfer_ref    text;
BEGIN
  IF p_deal_id IS NULL THEN
    RAISE EXCEPTION 'deal_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- (a) Verify the passed-in admin
  SELECT * INTO v_employee
    FROM nw_employees
   WHERE id = p_admin_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorised: admin employee not found or inactive'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_employee.role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Not authorised: admin role required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (b) Lock the deal row
  SELECT * INTO v_deal
    FROM nw_deal_confirmations
   WHERE id = p_deal_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deal % not found', p_deal_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- (c) Idempotency check
  SELECT * INTO v_existing_txn
    FROM nw_transactions
   WHERE deal_confirmation_id = p_deal_id
     AND transfer_stage       = 'transferred'
   LIMIT 1;

  IF FOUND THEN
    SELECT id INTO v_event_id
      FROM nw_deal_confirmation_events
     WHERE deal_id = p_deal_id AND event_type = 'transferred'
     ORDER BY created_at DESC LIMIT 1;

    RETURN jsonb_build_object(
      'transaction_id',          v_existing_txn.id,
      'transfer_audit_id',       v_event_id,
      'transfer_reference',      v_existing_txn.transfer_reference,
      'idempotent',              true,
      'transferred_at',          v_existing_txn.transferred_at,
      'existing_transferred_at', v_existing_txn.transferred_at
    );
  END IF;

  -- (d) Re-verify eligibility
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

  -- (e) Map deal-side values to nw_transactions enums
  v_txn_type := LOWER(COALESCE(v_deal.transaction_type, ''));
  IF v_txn_type NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'Unsupported transaction_type on deal: %', v_deal.transaction_type
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

  -- (f) Master-data snapshot
  SELECT * INTO v_client FROM nw_clients   WHERE id = v_deal.client_id;
  SELECT * INTO v_rm     FROM nw_employees WHERE id = v_deal.employee_id;
  v_sourcing_type := COALESCE(v_client.sourced_via, 'direct');

  -- (g) Allocate the human-readable Transfer Reference under the deal lock.
  --     MAX-of-suffix pattern (mirrors the debit-note and deal-confirmation
  --     numbering) — safe against gaps left by cancelled rows in Phase 2.
  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(regexp_replace(transfer_reference, '^TRF-\d{4}-', ''), '')
        AS integer
      )
    ), 0
  ) + 1
  INTO v_next_seq
  FROM nw_transactions
  WHERE transfer_reference LIKE 'TRF-' || v_year_str || '-%';

  v_transfer_ref := 'TRF-' || v_year_str || '-' || lpad(v_next_seq::text, 6, '0');

  -- (h) Build the enriched snapshot
  v_snapshot := jsonb_build_object(
    'schema_version',      1,
    'snapshot_taken_at',   v_now,
    'transfer_reference',  v_transfer_ref,
    'application_version', p_app_version,

    'deal', jsonb_build_object(
      'id',                  v_deal.id,
      'confirmation_number', v_deal.confirmation_number,
      'deal_date',           v_deal.deal_date,
      'accepted_at',         v_deal.accepted_at,
      'signer_email',        v_deal.signer_email,
      'signed_pdf_path',     v_deal.signed_pdf_path
    ),

    'client', jsonb_build_object(
      'id',            v_deal.client_id,
      'client_code',   v_client.client_code,
      'full_name',     v_deal.snap_client_name,
      'pan',           v_deal.snap_pan,
      'email',         v_deal.snap_email,
      'phone',         v_deal.snap_phone,
      'dp_name',       v_deal.snap_dp_name,
      'demat_account', v_deal.snap_demat_account,
      'bank_name',     v_deal.snap_bank_name,
      'bank_account',  v_deal.snap_bank_account,
      'bank_ifsc',     v_deal.snap_bank_ifsc,
      'address',       v_deal.snap_address,
      'sourced_via',   v_client.sourced_via,
      'dsa_id',        v_client.dsa_id
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

  -- (i) INSERT the executed transaction row
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
    transfer_remarks,
    transfer_reference
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
    NULLIF(p_remarks, ''),
    v_transfer_ref
  )
  RETURNING id INTO v_txn_id;

  -- (j) Audit event — now carries the transfer_reference
  INSERT INTO nw_deal_confirmation_events
    (deal_id, event_type, actor, metadata)
  VALUES (
    p_deal_id,
    'transferred',
    'employee',
    jsonb_build_object(
      'transaction_id',       v_txn_id,
      'transfer_reference',   v_transfer_ref,
      'transferred_by',       v_employee.id,
      'transferred_by_name',  v_employee.full_name,
      'transferred_by_role',  v_employee.role,
      'remarks',              NULLIF(p_remarks, ''),
      'payment_count',        v_summary.payment_count,
      'total_paid_amount',    v_summary.total_paid_amount,
      'product_type',         v_product_type,
      'txn_type',             v_txn_type,
      'settlement_amount',    v_deal.settlement_amount,
      'application_version',  p_app_version,
      'schema_version',       1
    )
  )
  RETURNING id INTO v_event_id;

  RETURN jsonb_build_object(
    'transaction_id',     v_txn_id,
    'transfer_audit_id',  v_event_id,
    'transfer_reference', v_transfer_ref,
    'idempotent',         false,
    'transferred_at',     v_now
  );
END;
$$;

-- Access model unchanged: service_role only.
REVOKE ALL ON FUNCTION nw_transfer_deal(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION nw_transfer_deal(uuid, uuid, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION nw_transfer_deal(uuid, uuid, text, text) TO service_role;

-- Drop the old 3-arg signature to prevent accidental use.
DROP FUNCTION IF EXISTS nw_transfer_deal(uuid, uuid, text);
