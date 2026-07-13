/*
  Sprint 2 — Cashfree Payment Link email
  ------------------------------------------------------------------
  Adds 'payment_link' to nw_deal_email_log.email_type.

  Why this migration is required:
    nw_deal_email_log.email_type is a closed CHECK allow-list. The new
    send-payment-link Edge Function must record its send under an honest,
    dedicated type so every deal email stays auditable (and so a future
    Cashfree webhook can correlate the link via the logged metadata).
    Inserting 'payment_link' without widening the CHECK would fail.

  Why the existing schema cannot be reused as-is:
    No existing email_type value semantically represents a payment link
    (reusing 'payment_reminder' would corrupt audit meaning). A single
    additive value is the minimal correct change.

  Why this is production-safe:
    Widening a CHECK is additive and backward-compatible — it never
    invalidates existing rows and removes no existing value. Follows the
    exact discover-by-name drop pattern used when 'deal_closure' was added
    (20260702100000_transfer_deal_closure.sql).
*/

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
    'deal_closure', 'payment_link'
  ));
