/*
  # Payment Management — Phase 1 (M1)
  # Extend deal event types for payment lifecycle

  Additive-only widening of the event_type CHECK on nw_deal_confirmation_events.
  Adds Phase 1 payment events plus reserved slots for Phase 2 (receipts) and
  Phase 4 (reconciliation) so no further enum widening is needed later.

  Preserves every value from the current live constraint:
    - the original set (20260612100100_create_deal_confirmation_events.sql)
    - the June 16 widening (20260616130000_deal_confirmation_tc_audit.sql)
      which added 'tc_accepted' and 'signed_pdf_emailed'.

  The original constraint has an auto-generated name (it was declared inline
  in the CREATE TABLE), while the June 16 rewrite gave it a stable name.
  Either way, we look up ANY CHECK constraint on this table whose definition
  mentions event_type and drop it before adding the new (stable-named) one.

  Reversible: drop the new constraint and re-add the previous list.
*/

DO $$
DECLARE
  cname text;
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
    -- Original set (Deal Confirmation v2)
    'link_sent', 'viewed', 'otp_sent', 'otp_verified',
    'accepted', 'rejected', 'edited', 'token_invalidated', 'expired',
    -- Added 2026-06-16 (T&C acceptance + signed-PDF distribution)
    'tc_accepted', 'signed_pdf_emailed',
    -- Payment lifecycle (Phase 1)
    'payment_recorded', 'payment_updated', 'payment_cancelled',
    'payment_reversed', 'payment_completed', 'outstanding_updated',
    -- Receipt lifecycle (reserved for Phase 2)
    'receipt_generated', 'receipt_regenerated', 'receipt_downloaded', 'receipt_emailed',
    -- Reconciliation (reserved for Phase 4)
    'reconciliation_matched', 'reconciliation_disputed'
  ));
