/*
  # Payment Management — Phase 2 (M5)
  # Receipt number allocation (atomic) + AFTER UPDATE audit trigger

  Phase 2 introduces client-facing Payment Receipt PDFs. Each payment
  can carry one receipt number for its lifetime (regeneration preserves
  the number; only the stored PDF and receipt_regen_count change).

  Two additions here:

  1. nw_finalize_receipt(p_payment_id, p_receipt_path, p_generated_by)
     — atomic RPC that:
       * locks the payment row (FOR UPDATE),
       * allocates 'RCPT-{deal_no}-{seq}' if the payment has no receipt
         number yet (seq is derived from MAX suffix across the deal,
         safe against gaps),
       * writes receipt_pdf_path, receipt_generated_at,
         receipt_generated_by, and increments receipt_regen_count,
       * bumps row_version so the existing optimistic-concurrency trigger
         accepts the write.
     Everything happens under a single lock, so two concurrent
     regenerations for the same payment cannot allocate different
     numbers or corrupt the counter.

  2. trg_nw_receipt_audit_after_update
     — AFTER UPDATE trigger that emits either 'receipt_generated' (when
     receipt_pdf_path transitions from NULL to non-NULL) or
     'receipt_regenerated' (subsequent changes) into
     nw_deal_confirmation_events. As with the AFTER INSERT audit trigger
     for payments, this ensures the audit trail cannot be bypassed by
     any write path.

  Additive only. Nothing existing is dropped.
*/

-- ---------------------------------------------------------------------
-- Receipt-number + PDF-path finalisation RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_finalize_receipt(
  p_payment_id     uuid,
  p_receipt_path   text,
  p_generated_by   uuid
)
RETURNS nw_deal_payments
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deal_id      uuid;
  v_deal_no      text;
  v_existing_no  text;
  v_seq          int;
  v_rcpt_no      text;
  v_row          nw_deal_payments;
BEGIN
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_receipt_path IS NULL OR length(p_receipt_path) = 0 THEN
    RAISE EXCEPTION 'receipt_path is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Serialise concurrent regenerations for this payment.
  SELECT deal_confirmation_id, receipt_number
    INTO v_deal_id, v_existing_no
  FROM nw_deal_payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF v_deal_id IS NULL THEN
    RAISE EXCEPTION 'Payment % not found', p_payment_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- Allocate a receipt number only on first generation.
  IF v_existing_no IS NULL THEN
    SELECT confirmation_number INTO v_deal_no
    FROM nw_deal_confirmations WHERE id = v_deal_id;

    SELECT COALESCE(
      MAX(
        CAST(
          NULLIF(regexp_replace(receipt_number, '^RCPT-.*-', ''), '')
          AS integer
        )
      ), 0
    ) + 1
    INTO v_seq
    FROM nw_deal_payments
    WHERE deal_confirmation_id = v_deal_id
      AND receipt_number IS NOT NULL;

    v_rcpt_no := 'RCPT-' || v_deal_no || '-' || v_seq::text;
  ELSE
    v_rcpt_no := v_existing_no;
  END IF;

  -- Single UPDATE that:
  --   * sets receipt_number (idempotent on regen — assigns the same value),
  --   * records the new stored path and audit fields,
  --   * increments regen count (0 → 1 on first, 1 → 2 on regen, etc.),
  --   * bumps row_version so nw_payment_bump_version accepts the write.
  UPDATE nw_deal_payments SET
    receipt_number         = v_rcpt_no,
    receipt_pdf_path       = p_receipt_path,
    receipt_generated_at   = now(),
    receipt_generated_by   = p_generated_by,
    receipt_regen_count    = receipt_regen_count + 1,
    row_version            = row_version + 1
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION nw_finalize_receipt(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nw_finalize_receipt(uuid, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- AFTER UPDATE audit trigger — emits receipt_generated / receipt_regenerated
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_receipt_audit_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor text;
BEGIN
  -- Only fire when receipt_pdf_path actually changed to a non-null value.
  IF NEW.receipt_pdf_path IS DISTINCT FROM OLD.receipt_pdf_path
     AND NEW.receipt_pdf_path IS NOT NULL THEN

    v_actor := CASE
      WHEN NEW.receipt_generated_by IS NOT NULL THEN 'employee'
      ELSE 'system'
    END;

    IF OLD.receipt_pdf_path IS NULL THEN
      -- First generation
      INSERT INTO nw_deal_confirmation_events (deal_id, event_type, actor, metadata)
      VALUES (
        NEW.deal_confirmation_id, 'receipt_generated', v_actor,
        jsonb_build_object(
          'payment_id',      NEW.id,
          'payment_number',  NEW.payment_number,
          'receipt_number',  NEW.receipt_number,
          'receipt_path',    NEW.receipt_pdf_path,
          'version',         NEW.receipt_regen_count
        )
      );
    ELSE
      -- Regeneration
      INSERT INTO nw_deal_confirmation_events (deal_id, event_type, actor, metadata)
      VALUES (
        NEW.deal_confirmation_id, 'receipt_regenerated', v_actor,
        jsonb_build_object(
          'payment_id',      NEW.id,
          'payment_number',  NEW.payment_number,
          'receipt_number',  NEW.receipt_number,
          'receipt_path',    NEW.receipt_pdf_path,
          'version',         NEW.receipt_regen_count
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_receipt_audit_after_update ON nw_deal_payments;
CREATE TRIGGER trg_nw_receipt_audit_after_update
  AFTER UPDATE ON nw_deal_payments
  FOR EACH ROW EXECUTE FUNCTION nw_receipt_audit_after_update();
