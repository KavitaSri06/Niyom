/*
  # Transfer / Deal Closure — Phase 4 (Revenue Basis Audit)

  This migration hardens the internal revenue-basis fields added in Phase 1.

  Adds:

    1. Audit stamps on nw_deal_confirmations:
         revenue_basis_entered_by / _at
         revenue_basis_last_modified_by / _at
    2. Value CHECK constraints:
         landing_cost      >= 0
         insurance_revenue >= 0
         brokerage_amount  >= 0
         trail_percent     BETWEEN 0 AND 100
         trail_start_date  >= deal_date
    3. BEFORE INSERT/UPDATE trigger nw_track_revenue_basis_changes:
         - Stamps entered_by/_at when the RM first sets any revenue value.
         - Stamps last_modified_by/_at on every subsequent change.
         - Blocks any change once the deal has been transferred (the linked
           nw_transactions row exists with transfer_stage='transferred').
         - Appends a 'revenue_basis_updated' audit event with a per-field diff.
    4. Enum widening: 'revenue_basis_updated' becomes a valid event_type.

  Additive-only. Nothing existing is dropped or reshaped.
*/

-- =====================================================================
-- 1. Audit-stamp columns
-- =====================================================================

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS revenue_basis_entered_by       uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_basis_entered_at       timestamptz,
  ADD COLUMN IF NOT EXISTS revenue_basis_last_modified_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revenue_basis_last_modified_at timestamptz;

-- =====================================================================
-- 2. Value CHECK constraints
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nw_deal_conf_landing_cost_nonneg_ck') THEN
    ALTER TABLE nw_deal_confirmations
      ADD CONSTRAINT nw_deal_conf_landing_cost_nonneg_ck
      CHECK (landing_cost IS NULL OR landing_cost >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nw_deal_conf_insurance_revenue_nonneg_ck') THEN
    ALTER TABLE nw_deal_confirmations
      ADD CONSTRAINT nw_deal_conf_insurance_revenue_nonneg_ck
      CHECK (insurance_revenue IS NULL OR insurance_revenue >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nw_deal_conf_brokerage_amount_nonneg_ck') THEN
    ALTER TABLE nw_deal_confirmations
      ADD CONSTRAINT nw_deal_conf_brokerage_amount_nonneg_ck
      CHECK (brokerage_amount IS NULL OR brokerage_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nw_deal_conf_trail_percent_range_ck') THEN
    ALTER TABLE nw_deal_confirmations
      ADD CONSTRAINT nw_deal_conf_trail_percent_range_ck
      CHECK (trail_percent IS NULL OR (trail_percent >= 0 AND trail_percent <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nw_deal_conf_trail_start_after_deal_ck') THEN
    ALTER TABLE nw_deal_confirmations
      ADD CONSTRAINT nw_deal_conf_trail_start_after_deal_ck
      CHECK (trail_start_date IS NULL OR trail_start_date >= deal_date);
  END IF;
END $$;

-- =====================================================================
-- 3. event_type enum widening — add 'revenue_basis_updated'
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
    'link_sent','viewed','otp_sent','otp_verified',
    'accepted','rejected','edited','token_invalidated','expired',
    'tc_accepted','signed_pdf_emailed',
    'payment_recorded','payment_updated','payment_cancelled',
    'payment_reversed','payment_completed','outstanding_updated',
    'receipt_generated','receipt_regenerated','receipt_downloaded','receipt_emailed',
    'reconciliation_matched','reconciliation_disputed',
    'transferred','closure_emailed','closure_email_failed','transfer_reversed',
    -- Phase 4
    'revenue_basis_updated'
  ));

-- =====================================================================
-- 4. Change-tracking trigger
--
--    BEFORE INSERT / UPDATE. Stamps audit columns on NEW and appends an
--    audit event for UPDATEs. Blocks changes once the deal has been
--    transferred (preserves financial integrity).
-- =====================================================================

CREATE OR REPLACE FUNCTION nw_track_revenue_basis_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_uid  uuid;
  v_employee_id uuid;
  v_was_set     boolean;
  v_now_set     boolean;
  v_changed     boolean;
BEGIN
  -- Resolve the caller's employee id (best-effort). auth.uid() may be NULL
  -- for service-role writes (e.g. accept-deal), in which case entered_by
  -- / last_modified_by stay NULL — legitimate for system-driven updates.
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NOT NULL THEN
    SELECT id INTO v_employee_id FROM nw_employees WHERE auth_user_id = v_caller_uid LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_now_set :=
      NEW.landing_cost      IS NOT NULL OR
      NEW.insurance_revenue IS NOT NULL OR
      NEW.brokerage_amount  IS NOT NULL OR
      NEW.trail_percent     IS NOT NULL OR
      NEW.trail_start_date  IS NOT NULL;

    IF v_now_set THEN
      NEW.revenue_basis_entered_by       := COALESCE(NEW.revenue_basis_entered_by,       v_employee_id);
      NEW.revenue_basis_entered_at       := COALESCE(NEW.revenue_basis_entered_at,       now());
      NEW.revenue_basis_last_modified_by := COALESCE(NEW.revenue_basis_last_modified_by, v_employee_id);
      NEW.revenue_basis_last_modified_at := COALESCE(NEW.revenue_basis_last_modified_at, now());
    END IF;

    RETURN NEW;
  END IF;

  -- --- UPDATE path ---
  v_changed :=
    NEW.landing_cost      IS DISTINCT FROM OLD.landing_cost      OR
    NEW.insurance_revenue IS DISTINCT FROM OLD.insurance_revenue OR
    NEW.brokerage_amount  IS DISTINCT FROM OLD.brokerage_amount  OR
    NEW.trail_percent     IS DISTINCT FROM OLD.trail_percent     OR
    NEW.trail_start_date  IS DISTINCT FROM OLD.trail_start_date;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  -- Block edits after the deal has been transferred (closed).
  IF EXISTS (
    SELECT 1 FROM nw_transactions
     WHERE deal_confirmation_id = OLD.id
       AND transfer_stage = 'transferred'
  ) THEN
    RAISE EXCEPTION
      'Revenue-basis fields cannot be modified: deal % has been transferred and closed.',
      OLD.confirmation_number USING ERRCODE = 'check_violation';
  END IF;

  v_was_set :=
    OLD.landing_cost      IS NOT NULL OR
    OLD.insurance_revenue IS NOT NULL OR
    OLD.brokerage_amount  IS NOT NULL OR
    OLD.trail_percent     IS NOT NULL OR
    OLD.trail_start_date  IS NOT NULL;

  v_now_set :=
    NEW.landing_cost      IS NOT NULL OR
    NEW.insurance_revenue IS NOT NULL OR
    NEW.brokerage_amount  IS NOT NULL OR
    NEW.trail_percent     IS NOT NULL OR
    NEW.trail_start_date  IS NOT NULL;

  IF (NOT v_was_set) AND v_now_set THEN
    NEW.revenue_basis_entered_by := COALESCE(NEW.revenue_basis_entered_by, v_employee_id);
    NEW.revenue_basis_entered_at := COALESCE(NEW.revenue_basis_entered_at, now());
  END IF;

  NEW.revenue_basis_last_modified_by := v_employee_id;
  NEW.revenue_basis_last_modified_at := now();

  -- Append audit event with a per-field diff. Written via SECURITY DEFINER
  -- so the events-table RLS INSERT policy (actor='employee' only) is bypassed.
  INSERT INTO nw_deal_confirmation_events (deal_id, event_type, actor, metadata)
  VALUES (
    OLD.id,
    'revenue_basis_updated',
    CASE WHEN v_employee_id IS NULL THEN 'system' ELSE 'employee' END,
    jsonb_build_object(
      'employee_id', v_employee_id,
      'first_time',  (NOT v_was_set) AND v_now_set,
      'changes', jsonb_strip_nulls(jsonb_build_object(
        'landing_cost',      CASE WHEN NEW.landing_cost      IS DISTINCT FROM OLD.landing_cost
                                  THEN jsonb_build_object('from', OLD.landing_cost,      'to', NEW.landing_cost)      END,
        'insurance_revenue', CASE WHEN NEW.insurance_revenue IS DISTINCT FROM OLD.insurance_revenue
                                  THEN jsonb_build_object('from', OLD.insurance_revenue, 'to', NEW.insurance_revenue) END,
        'brokerage_amount',  CASE WHEN NEW.brokerage_amount  IS DISTINCT FROM OLD.brokerage_amount
                                  THEN jsonb_build_object('from', OLD.brokerage_amount,  'to', NEW.brokerage_amount)  END,
        'trail_percent',     CASE WHEN NEW.trail_percent     IS DISTINCT FROM OLD.trail_percent
                                  THEN jsonb_build_object('from', OLD.trail_percent,     'to', NEW.trail_percent)     END,
        'trail_start_date',  CASE WHEN NEW.trail_start_date  IS DISTINCT FROM OLD.trail_start_date
                                  THEN jsonb_build_object('from', OLD.trail_start_date,  'to', NEW.trail_start_date)  END
      ))
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_track_revenue_basis_changes ON nw_deal_confirmations;
CREATE TRIGGER trg_nw_track_revenue_basis_changes
  BEFORE INSERT OR UPDATE ON nw_deal_confirmations
  FOR EACH ROW EXECUTE FUNCTION nw_track_revenue_basis_changes();
