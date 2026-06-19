/*
  # DSA Debit Notes — Cancellation Reason (Compliance)

  Additive, backward-compatible: captures a mandatory cancellation reason
  alongside the existing cancel audit fields (cancelled_at / cancelled_by).

  Nothing existing is altered destructively; ADD COLUMN IF NOT EXISTS keeps
  this migration safe to re-run and independent of apply order.
*/

ALTER TABLE dsa_debit_notes
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Integrity: a cancelled note must carry a non-empty reason; non-cancelled
-- notes must not. Added idempotently so re-runs are safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dsa_debit_notes_cancel_reason_check'
  ) THEN
    ALTER TABLE dsa_debit_notes
      ADD CONSTRAINT dsa_debit_notes_cancel_reason_check
      CHECK (
        (status = 'cancelled' AND cancel_reason IS NOT NULL AND length(btrim(cancel_reason)) > 0)
        OR (status <> 'cancelled' AND cancel_reason IS NULL)
      );
  END IF;
END $$;
