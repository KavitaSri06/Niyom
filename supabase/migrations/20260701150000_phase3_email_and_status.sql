/*
  # Payment Management — Phase 3
  # Email acknowledgements + status enum narrowed

  Changes:

  1. nw_deal_payment_summary — payment_status collapses 'over_paid' into
     'fully_paid'. Any total >= deal_amount now reports 'fully_paid'.
     outstanding_amount is unchanged (may still be negative to reflect an
     excess payment on record); only the status label is capped at 3 values:
       not_paid | partially_paid | fully_paid

  2. nw_deal_email_log.email_type enum widened with the three Phase 3 types:
       payment_reminder   (Not Paid — reminder, no attachment)
       payment_partial    (Partially Paid — with attached latest receipt)
       payment_final      (Fully Paid — with attached latest receipt)

     Preserves the existing values so historical rows remain valid.

  3. nw_deal_email_log.payment_id (nullable FK to nw_deal_payments) so the
     Ledger UI can display "Last Emailed" per payment row. NULL for the
     deal-level 'payment_reminder' emails.

  Additive only. Nothing existing is dropped or modified.
*/

-- ---------------------------------------------------------------------
-- 1. Summary view: drop over_paid, cap at fully_paid
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW nw_deal_payment_summary
WITH (security_invoker = true) AS
SELECT
  d.id                                                                              AS deal_id,
  d.confirmation_number,
  d.settlement_amount                                                               AS deal_amount,
  COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0)::numeric(18,2)  AS total_paid_amount,
  (d.settlement_amount
    - COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0))::numeric(18,2)
                                                                                    AS outstanding_amount,
  CASE
    WHEN COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0) = 0
      THEN 'not_paid'
    WHEN COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0) < d.settlement_amount
      THEN 'partially_paid'
    ELSE 'fully_paid'
  END                                                                               AS payment_status,
  COUNT(p.id) FILTER (WHERE p.status = 'active')                                    AS payment_count,
  MAX(p.received_at) FILTER (WHERE p.status = 'active')                             AS last_payment_at
FROM nw_deal_confirmations d
LEFT JOIN nw_deal_payments p ON p.deal_confirmation_id = d.id
WHERE d.acceptance_status = 'accepted'
GROUP BY d.id, d.confirmation_number, d.settlement_amount;

GRANT SELECT ON nw_deal_payment_summary TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Widen nw_deal_email_log.email_type
-- ---------------------------------------------------------------------
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
    -- Existing
    'secure_link', 'signed_pdf',
    -- Phase 3 (payment acknowledgements)
    'payment_reminder', 'payment_partial', 'payment_final'
  ));

-- ---------------------------------------------------------------------
-- 3. Optional payment_id linkage on email log (nullable)
-- ---------------------------------------------------------------------
ALTER TABLE nw_deal_email_log
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES nw_deal_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nw_deal_email_log_payment
  ON nw_deal_email_log (payment_id)
  WHERE payment_id IS NOT NULL;
