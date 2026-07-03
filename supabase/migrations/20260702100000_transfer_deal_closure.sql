/*
  # Transfer / Deal Closure — Phase 1 (Database Schema)

  Design lineage: SDD v3 (approved 2026-07-01).

  This migration lands the entire schema surface Transfer needs so that the
  RPC, edge functions, and frontend can build on top without further DB
  migrations. Strictly additive.

  Key architectural decisions (locked):

    1. nw_transactions represents the EXECUTED transaction of record.
       A row exists if and only if Transfer approval has completed.
    2. Revenue-basis fields (landing_cost / insurance_revenue / trail_percent /
       trail_start_date / brokerage_amount) are captured on the Deal
       Confirmation itself, as INTERNAL-ONLY fields. They are never shown
       on the client-signed PDF. Transfer snapshots them into nw_transactions
       at approval time.
    3. Transfer creates the transaction; Transfer does not update an
       existing pre-created transaction.
    4. Ledger cannot be edited once a deal is transferred.
    5. Transferred transactions are immutable (reversal reserved for Phase 2).
    6. The overall lifecycle stage is DERIVED from four underlying facts via
       a single view (nw_deal_overall_stage) — no new status column is added
       to nw_deal_confirmations.
*/

-- =====================================================================
-- 1. Revenue-basis fields on nw_deal_confirmations (internal-only)
--
--    These are the RM's private inputs used only for MIS revenue calculation.
--    They are captured on the CRM Deal Confirmation form; the client-facing
--    PDF (DealDocument.tsx) never renders them.
-- =====================================================================

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS landing_cost      numeric(18,4),
  ADD COLUMN IF NOT EXISTS insurance_revenue numeric(18,2),
  ADD COLUMN IF NOT EXISTS trail_percent     numeric(9,4),
  ADD COLUMN IF NOT EXISTS trail_start_date  date,
  ADD COLUMN IF NOT EXISTS brokerage_amount  numeric(18,2);

-- =====================================================================
-- 2. Transfer linkage + stage on nw_transactions
--
--    Existing nw_transactions rows (manually created via Transactions.tsx)
--    have deal_confirmation_id = NULL and are treated as LEGACY: never
--    appear in the new MIS Revenue filter unless the admin explicitly
--    toggles "Show legacy manually-recorded transactions" on.
--
--    Rows created by Transfer approval carry:
--      deal_confirmation_id = <the deal's id>
--      transfer_stage       = 'transferred'
--      transferred_at, transferred_by, transfer_remarks
-- =====================================================================

ALTER TABLE nw_transactions
  ADD COLUMN IF NOT EXISTS deal_confirmation_id uuid
    REFERENCES nw_deal_confirmations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS transfer_stage text
    CHECK (transfer_stage IN ('transferred', 'reversed')),
  ADD COLUMN IF NOT EXISTS transferred_at   timestamptz,
  ADD COLUMN IF NOT EXISTS transferred_by   uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_remarks text;

-- One transaction per deal (idempotent Transfer + unique linkage guard).
CREATE UNIQUE INDEX IF NOT EXISTS uq_nw_transactions_deal
  ON nw_transactions (deal_confirmation_id)
  WHERE deal_confirmation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nw_transactions_transfer_stage
  ON nw_transactions (transfer_stage)
  WHERE transfer_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nw_transactions_transferred_at
  ON nw_transactions (transferred_at DESC)
  WHERE transferred_at IS NOT NULL;

-- =====================================================================
-- 3. Immutability guard on transferred transactions
--
--    Once a transaction is transferred, no field on it may change.
--    Reversal is Phase 2 — when enabled, this trigger will be relaxed to
--    allow specific reversal-metadata fields only.
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_check_txn_post_transfer_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.transfer_stage = 'transferred' THEN
    RAISE EXCEPTION
      'Transferred transaction % is immutable. Reversal is not enabled in v1.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_check_txn_post_transfer_immutable ON nw_transactions;
CREATE TRIGGER trg_nw_check_txn_post_transfer_immutable
  BEFORE UPDATE ON nw_transactions
  FOR EACH ROW EXECUTE FUNCTION nw_check_txn_post_transfer_immutable();

-- Also block DELETE of a transferred transaction — preserves the
-- executed-transaction ledger for compliance.
CREATE OR REPLACE FUNCTION nw_check_txn_no_delete_after_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.transfer_stage = 'transferred' THEN
    RAISE EXCEPTION
      'Transferred transaction % cannot be deleted. Reversal is not enabled in v1.',
      OLD.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_check_txn_no_delete_after_transfer ON nw_transactions;
CREATE TRIGGER trg_nw_check_txn_no_delete_after_transfer
  BEFORE DELETE ON nw_transactions
  FOR EACH ROW EXECUTE FUNCTION nw_check_txn_no_delete_after_transfer();

-- =====================================================================
-- 4. Extend the payment-state guard so ledger writes are blocked once
--    the deal has been transferred (closed).
--
--    Original guard (Phase 1): payment INSERTs allowed only on accepted
--    deals. Now we additionally reject INSERTs when a transferred
--    nw_transactions row exists for the deal.
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_check_payment_deal_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status      text;
  v_transferred boolean;
BEGIN
  SELECT acceptance_status INTO v_status
    FROM nw_deal_confirmations WHERE id = NEW.deal_confirmation_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Deal % not found', NEW.deal_confirmation_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION
      'Payments can only be recorded against an accepted deal (deal is %).', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM nw_transactions
     WHERE deal_confirmation_id = NEW.deal_confirmation_id
       AND transfer_stage = 'transferred'
  ) INTO v_transferred;

  IF v_transferred THEN
    RAISE EXCEPTION
      'This deal has been transferred and closed. Ledger changes are no longer permitted.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- 5. Event and email-log enum widenings
--
--    Both enums preserve every existing value (verified against migrations
--    20260616130000 and 20260701150000) and add the Transfer / Closure
--    lifecycle values. transfer_reversed is reserved for Phase 2.
-- =====================================================================

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'nw_deal_confirmation_events'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%event_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE nw_deal_confirmation_events DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE nw_deal_confirmation_events
  ADD CONSTRAINT nw_deal_confirmation_events_event_type_check
  CHECK (event_type IN (
    -- Deal Confirmation v2
    'link_sent', 'viewed', 'otp_sent', 'otp_verified',
    'accepted', 'rejected', 'edited', 'token_invalidated', 'expired',
    -- Added 2026-06-16 (T&C acceptance + signed-PDF distribution)
    'tc_accepted', 'signed_pdf_emailed',
    -- Payment lifecycle (Phase 1)
    'payment_recorded', 'payment_updated', 'payment_cancelled',
    'payment_reversed', 'payment_completed', 'outstanding_updated',
    -- Receipt lifecycle (Phase 2)
    'receipt_generated', 'receipt_regenerated', 'receipt_downloaded', 'receipt_emailed',
    -- Reconciliation (reserved for Phase 4)
    'reconciliation_matched', 'reconciliation_disputed',
    -- Transfer / Deal Closure (this migration)
    'transferred', 'closure_emailed', 'closure_email_failed', 'transfer_reversed'
  ));

DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'nw_deal_email_log'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%email_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE nw_deal_email_log DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE nw_deal_email_log
  ADD CONSTRAINT nw_deal_email_log_email_type_check
  CHECK (email_type IN (
    'secure_link', 'signed_pdf',
    'payment_reminder', 'payment_partial', 'payment_final',
    'deal_closure'
  ));

-- =====================================================================
-- 6. nw_deal_overall_stage — single derived lifecycle view
--
--    Composes the four lifecycle facts (deal status, acceptance,
--    payment status, transfer stage) into one Overall Stage label.
--    Used by the Deal Confirmation list Overall-Stage pill.
-- =====================================================================

CREATE OR REPLACE VIEW nw_deal_overall_stage
WITH (security_invoker = true) AS
SELECT
  d.id                                     AS deal_id,
  d.confirmation_number,
  d.status                                 AS deal_status,
  d.acceptance_status,
  COALESCE(s.payment_status, 'not_paid')   AS payment_status,
  t.id                                     AS transaction_id,
  t.transfer_stage,
  CASE
    WHEN d.status = 'draft'                                                    THEN 'draft'
    WHEN d.acceptance_status = 'rejected'                                      THEN 'rejected'
    WHEN d.acceptance_status = 'expired'                                       THEN 'expired'
    WHEN d.acceptance_status IN ('pending','viewed')                           THEN 'confirmed'
    WHEN d.acceptance_status = 'accepted'
         AND COALESCE(s.payment_status,'not_paid') = 'not_paid'                THEN 'accepted'
    WHEN COALESCE(s.payment_status,'not_paid') = 'partially_paid'              THEN 'partially_paid'
    WHEN COALESCE(s.payment_status,'not_paid') = 'fully_paid'
         AND t.transfer_stage IS DISTINCT FROM 'transferred'                   THEN 'transfer_pending'
    WHEN t.transfer_stage = 'transferred'                                      THEN 'closed'
    ELSE 'unknown'
  END                                      AS overall_stage
FROM nw_deal_confirmations d
LEFT JOIN nw_deal_payment_summary s ON s.deal_id = d.id
LEFT JOIN nw_transactions t         ON t.deal_confirmation_id = d.id;

GRANT SELECT ON nw_deal_overall_stage TO authenticated, service_role;

-- =====================================================================
-- 7. nw_deal_transfer_eligible — feeds the admin Transfer list
--
--    A deal is eligible iff:
--      - acceptance_status = 'accepted'
--      - payment_status    = 'fully_paid'
--      - no transferred nw_transactions row exists for it yet
--
--    The rich SELECT list exposes everything the read-only Transfer
--    Preview may want to display (deal + client snapshot + ledger
--    summary + revenue basis).
-- =====================================================================

CREATE OR REPLACE VIEW nw_deal_transfer_eligible
WITH (security_invoker = true) AS
SELECT
  d.id                        AS deal_id,
  d.confirmation_number,
  d.client_id,
  d.employee_id,

  -- Client snapshot (as captured at deal creation)
  d.snap_client_name,
  d.snap_pan,
  d.snap_email,
  d.snap_phone,
  d.snap_dp_name,
  d.snap_demat_account,
  d.snap_bank_name,
  d.snap_bank_account,
  d.snap_bank_ifsc,
  d.snap_address,

  -- Deal terms
  d.product_type,
  d.transaction_type,
  d.security_name,
  d.isin,
  d.deal_date,
  d.quantity,
  d.rate_per_unit,
  d.settlement_amount,
  d.stamp_duty,
  d.notes,

  -- Acceptance
  d.accepted_at,
  d.signer_email,
  d.signed_pdf_path,

  -- Revenue basis (internal — needed by Transfer to snapshot into txn)
  d.landing_cost,
  d.insurance_revenue,
  d.trail_percent,
  d.trail_start_date,
  d.brokerage_amount,

  -- Ledger summary
  s.total_paid_amount,
  s.outstanding_amount,
  s.payment_count,
  s.last_payment_at

FROM nw_deal_confirmations d
JOIN nw_deal_payment_summary s ON s.deal_id = d.id
LEFT JOIN nw_transactions t    ON t.deal_confirmation_id = d.id
WHERE d.acceptance_status = 'accepted'
  AND s.payment_status    = 'fully_paid'
  AND (t.id IS NULL OR t.transfer_stage IS DISTINCT FROM 'transferred');

GRANT SELECT ON nw_deal_transfer_eligible TO authenticated, service_role;
