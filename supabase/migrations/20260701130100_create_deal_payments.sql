/*
  # Payment Management — Phase 1 (M2)
  # Create nw_deal_payments

  Child table of nw_deal_confirmations. One row = one payment leg.
  Payments can only be inserted against ACCEPTED deals (trigger below).
  Cancellation is soft (status = 'cancelled'); rows are never deleted.

  Fintech-grade schema: gateway and accounting fields are inert in Phase 1 but
  load-bearing for later phases (Razorpay/Cashfree/Stripe, Tally/Zoho) so no
  schema migration is required to enable them.

  See docs/DESIGN.md § 3 (or the SDD) for full column rationale.
*/

CREATE TABLE IF NOT EXISTS nw_deal_payments (
  -- Identity ------------------------------------------------------------
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_confirmation_id  uuid NOT NULL REFERENCES nw_deal_confirmations(id) ON DELETE RESTRICT,
  payment_number        text UNIQUE NOT NULL,
  receipt_number        text UNIQUE,   -- populated in Phase 2

  -- Money leg -----------------------------------------------------------
  amount                numeric(18,2) NOT NULL CHECK (amount <> 0),
  currency              text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  fx_rate_to_inr        numeric(18,6),
  amount_inr            numeric(18,2) GENERATED ALWAYS AS (
                          CASE WHEN currency = 'INR' THEN amount
                               ELSE ROUND((amount * COALESCE(fx_rate_to_inr, 1))::numeric, 2)
                          END
                        ) STORED,

  -- Classification -------------------------------------------------------
  direction             text NOT NULL DEFAULT 'inflow'
                          CHECK (direction IN ('inflow', 'refund', 'adjustment')),
  payment_mode          text NOT NULL
                          CHECK (payment_mode IN (
                            'imps', 'neft', 'rtgs', 'upi', 'cheque', 'cash',
                            'bank_transfer', 'online_gateway', 'demand_draft',
                            'internal_adjustment'
                          )),

  -- Bank / instrument identifiers (nullable per mode) -------------------
  transaction_reference text,
  utr_number            text,
  cheque_number         text,
  cheque_bank           text,
  cheque_dated          date,
  demand_draft_number   text,

  -- Dates ---------------------------------------------------------------
  payment_date          date NOT NULL,
  value_date            date,
  received_at           timestamptz NOT NULL DEFAULT now(),

  -- Parties -------------------------------------------------------------
  received_by           uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  received_from_name    text NOT NULL DEFAULT '',
  received_from_account text,
  received_from_bank    text,

  -- Reconciliation (Phase 4 UX) ----------------------------------------
  reconciliation_status text NOT NULL DEFAULT 'unreconciled'
                          CHECK (reconciliation_status IN (
                            'unreconciled', 'matched', 'disputed', 'reversed'
                          )),
  reconciled_at         timestamptz,
  reconciled_by         uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  bank_statement_ref    text,

  -- Payment gateway (Phase 5) ------------------------------------------
  provider              text CHECK (provider IN ('manual', 'razorpay', 'cashfree', 'stripe', 'bank_api')),
  provider_payment_id   text,
  provider_order_id     text,
  provider_signature    text,
  provider_payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_status       text,

  -- Accounting integration (Phase 5) -----------------------------------
  external_ref          text,
  posted_at             timestamptz,
  posted_by             uuid REFERENCES nw_employees(id) ON DELETE SET NULL,

  -- Reversal linkage (refund / cheque bounce) --------------------------
  reverses_payment_id   uuid REFERENCES nw_deal_payments(id) ON DELETE RESTRICT,

  -- Receipt lifecycle (Phase 2) ----------------------------------------
  receipt_pdf_path        text,
  receipt_generated_at    timestamptz,
  receipt_generated_by    uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  receipt_regen_count     int NOT NULL DEFAULT 0,
  receipt_last_emailed_at timestamptz,

  -- Documents ----------------------------------------------------------
  supporting_docs       jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- State & audit ------------------------------------------------------
  remarks               text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'cancelled', 'superseded')),
  cancelled_at          timestamptz,
  cancelled_by          uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  cancellation_reason   text,

  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  row_version           int NOT NULL DEFAULT 1,

  -- Cross-field constraints --------------------------------------------
  CONSTRAINT chk_fx_rate_iff_foreign_currency
    CHECK (
      (currency = 'INR' AND fx_rate_to_inr IS NULL)
      OR (currency <> 'INR' AND fx_rate_to_inr IS NOT NULL AND fx_rate_to_inr > 0)
    ),
  CONSTRAINT chk_refund_has_source
    CHECK (direction <> 'refund' OR reverses_payment_id IS NOT NULL),
  CONSTRAINT chk_cheque_fields
    CHECK (
      payment_mode <> 'cheque'
      OR (cheque_number IS NOT NULL AND cheque_bank IS NOT NULL)
    )
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

-- No duplicate UTR against the same deal (cross-deal reuse is allowed but
-- rare — flagged in UI as a warning, never blocked at the DB layer).
CREATE UNIQUE INDEX IF NOT EXISTS uq_nw_deal_payments_utr_per_deal
  ON nw_deal_payments (deal_confirmation_id, utr_number)
  WHERE utr_number IS NOT NULL AND status = 'active';

-- No duplicate gateway transaction id — prevents webhook replays inserting
-- the same payment twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_nw_deal_payments_provider_txn
  ON nw_deal_payments (provider, provider_payment_id)
  WHERE provider IS NOT NULL AND provider_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nw_deal_payments_deal
  ON nw_deal_payments (deal_confirmation_id);

CREATE INDEX IF NOT EXISTS idx_nw_deal_payments_received_by
  ON nw_deal_payments (received_by);

CREATE INDEX IF NOT EXISTS idx_nw_deal_payments_recon
  ON nw_deal_payments (reconciliation_status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_nw_deal_payments_created_at
  ON nw_deal_payments (created_at DESC);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

-- Payments allowed only on ACCEPTED deals (defence in depth: RLS also
-- enforces this at the auth layer, but service-role writes bypass RLS).
CREATE OR REPLACE FUNCTION nw_check_payment_deal_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  SELECT acceptance_status INTO v_status
  FROM nw_deal_confirmations
  WHERE id = NEW.deal_confirmation_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Deal % not found', NEW.deal_confirmation_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION
      'Payments can only be recorded against an accepted deal (deal is %).', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_check_payment_deal_state ON nw_deal_payments;
CREATE TRIGGER trg_nw_check_payment_deal_state
  BEFORE INSERT ON nw_deal_payments
  FOR EACH ROW EXECUTE FUNCTION nw_check_payment_deal_state();

-- Optimistic concurrency + auto-update updated_at.
-- Every UPDATE must submit a strictly-greater row_version.
CREATE OR REPLACE FUNCTION nw_payment_bump_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.row_version <= OLD.row_version THEN
    RAISE EXCEPTION
      'Stale write on payment %: server v=%, submitted v=%',
      OLD.id, OLD.row_version, NEW.row_version
      USING ERRCODE = 'serialization_failure';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_payment_bump_version ON nw_deal_payments;
CREATE TRIGGER trg_nw_payment_bump_version
  BEFORE UPDATE ON nw_deal_payments
  FOR EACH ROW EXECUTE FUNCTION nw_payment_bump_version();

-- ---------------------------------------------------------------------
-- Atomic payment insertion RPC
--
-- Combines payment-number allocation AND the INSERT under a single
-- FOR UPDATE lock on the parent deal row, so two concurrent RMs
-- writing on the same deal are strictly serialised and can never
-- collide on payment_number.
--
-- This is STRONGER than the debit-note/deal-confirmation numbering
-- helpers (which have an unavoidable race window between the number
-- RPC and the subsequent INSERT statement — two separate transactions).
-- Here the number allocation and the INSERT happen in the same
-- transaction, so the lock holds for both.
--
-- Format: PMT-{deal_confirmation_number}-{n}   e.g. PMT-DC-EMP01-001-3
-- Sequence is derived from MAX(suffix) — not COUNT(*) — so gaps left
-- by soft-cancelled rows never cause a re-use.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_insert_payment(p_data jsonb)
RETURNS nw_deal_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal_id uuid := (p_data->>'deal_confirmation_id')::uuid;
  v_deal_no text;
  v_seq     int;
  v_pmt_no  text;
  v_row     nw_deal_payments;
BEGIN
  IF v_deal_id IS NULL THEN
    RAISE EXCEPTION 'deal_confirmation_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialise concurrent inserts for the same deal.
  -- FOR UPDATE holds the row lock until this transaction commits, and
  -- the INSERT below is part of the same transaction, so no other call
  -- can pass this point until we release.
  SELECT confirmation_number INTO v_deal_no
  FROM nw_deal_confirmations
  WHERE id = v_deal_id
  FOR UPDATE;

  IF v_deal_no IS NULL THEN
    RAISE EXCEPTION 'Deal % not found', v_deal_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Derive next sequence from the highest existing numeric suffix
  -- (safe against gaps from soft-cancelled rows; safe under concurrency
  -- because the row lock above serialises us).
  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(regexp_replace(payment_number, '^PMT-.*-', ''), '')
        AS integer
      )
    ), 0
  ) + 1
  INTO v_seq
  FROM nw_deal_payments
  WHERE deal_confirmation_id = v_deal_id;

  v_pmt_no := 'PMT-' || v_deal_no || '-' || v_seq::text;

  INSERT INTO nw_deal_payments (
    deal_confirmation_id, payment_number,
    amount, currency, fx_rate_to_inr,
    direction, payment_mode,
    transaction_reference, utr_number,
    cheque_number, cheque_bank, cheque_dated, demand_draft_number,
    payment_date, value_date,
    received_by, received_from_name, received_from_account, received_from_bank,
    provider, remarks, created_by, updated_by
  ) VALUES (
    v_deal_id,
    v_pmt_no,
    (p_data->>'amount')::numeric,
    COALESCE(p_data->>'currency', 'INR'),
    NULLIF(p_data->>'fx_rate_to_inr', '')::numeric,
    COALESCE(p_data->>'direction', 'inflow'),
    p_data->>'payment_mode',
    NULLIF(p_data->>'transaction_reference', ''),
    NULLIF(p_data->>'utr_number', ''),
    NULLIF(p_data->>'cheque_number', ''),
    NULLIF(p_data->>'cheque_bank', ''),
    NULLIF(p_data->>'cheque_dated', '')::date,
    NULLIF(p_data->>'demand_draft_number', ''),
    (p_data->>'payment_date')::date,
    NULLIF(p_data->>'value_date', '')::date,
    NULLIF(p_data->>'received_by', '')::uuid,
    COALESCE(p_data->>'received_from_name', ''),
    NULLIF(p_data->>'received_from_account', ''),
    NULLIF(p_data->>'received_from_bank', ''),
    COALESCE(p_data->>'provider', 'manual'),
    COALESCE(p_data->>'remarks', ''),
    NULLIF(p_data->>'created_by', '')::uuid,
    NULLIF(p_data->>'updated_by', '')::uuid
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION nw_insert_payment(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nw_insert_payment(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- AFTER INSERT audit trigger — REQUIRED so audit-event creation is
-- atomic with the payment write and cannot be bypassed by any direct
-- INSERT (edge function, PostgREST, psql, future gateway webhook).
--
-- Writes up to three events per payment:
--   1. payment_recorded       (always)
--   2. outstanding_updated    (always, carries the recomputed summary)
--   3. payment_completed      (only when the deal tips to fully_paid)
--
-- Runs SECURITY DEFINER so it can INSERT into
-- nw_deal_confirmation_events (whose RLS INSERT policy would otherwise
-- reject actor='system' from a non-service session).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_payment_audit_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor        text;
  v_total_paid   numeric;
  v_outstanding  numeric;
  v_status       text;
BEGIN
  v_actor := CASE WHEN NEW.created_by IS NOT NULL THEN 'employee' ELSE 'system' END;

  -- The summary view is defined WITH (security_invoker = true), but this
  -- trigger runs as the definer (postgres, which has BYPASSRLS), so RLS
  -- is not enforced here. The view sees the just-inserted row because we
  -- are within the same transaction.
  SELECT total_paid_amount, outstanding_amount, payment_status
    INTO v_total_paid, v_outstanding, v_status
  FROM nw_deal_payment_summary
  WHERE deal_id = NEW.deal_confirmation_id;

  -- 1. payment_recorded
  INSERT INTO nw_deal_confirmation_events (deal_id, event_type, actor, metadata)
  VALUES (
    NEW.deal_confirmation_id, 'payment_recorded', v_actor,
    jsonb_build_object(
      'payment_id',      NEW.id,
      'payment_number',  NEW.payment_number,
      'amount_inr',      NEW.amount_inr,
      'mode',            NEW.payment_mode,
      'direction',       NEW.direction,
      'utr_present',     NEW.utr_number IS NOT NULL,
      'provider',        NEW.provider
    )
  );

  -- 2. outstanding_updated
  INSERT INTO nw_deal_confirmation_events (deal_id, event_type, actor, metadata)
  VALUES (
    NEW.deal_confirmation_id, 'outstanding_updated', 'system',
    jsonb_build_object(
      'total_paid_amount',  v_total_paid,
      'outstanding_amount', v_outstanding,
      'payment_status',     v_status
    )
  );

  -- 3. payment_completed (only when we tip to fully_paid)
  IF v_status = 'fully_paid' THEN
    INSERT INTO nw_deal_confirmation_events (deal_id, event_type, actor, metadata)
    VALUES (
      NEW.deal_confirmation_id, 'payment_completed', 'system',
      jsonb_build_object('total_paid_amount', v_total_paid)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_payment_audit_after_insert ON nw_deal_payments;
CREATE TRIGGER trg_nw_payment_audit_after_insert
  AFTER INSERT ON nw_deal_payments
  FOR EACH ROW EXECUTE FUNCTION nw_payment_audit_after_insert();
