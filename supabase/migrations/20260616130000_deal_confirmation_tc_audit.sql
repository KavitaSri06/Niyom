/*
  # Deal Confirmation — T&C Acceptance Audit (additive)

  ## Purpose
  Adds auditability for the mandatory Terms & Conditions acceptance step that
  now precedes OTP verification on the public deal page, and registers the new
  audit event types used by the signed-PDF email distribution.

  ## Changes (ADDITIVE ONLY)
  - nw_deal_confirmations.tc_accepted_at  — timestamp the client accepted T&C
  - nw_deal_confirmation_events event_type CHECK widened to allow:
      'tc_accepted'        — client ticked the mandatory T&C box
      'signed_pdf_emailed' — outcome of the post-acceptance signed-PDF email

  ## Safety
  - No existing rows are modified.
  - RLS, the accepted-deal lock trigger, the OTP flow, and signed-PDF
    generation are untouched.
  - Widening a CHECK constraint only permits new values; all existing event
    rows remain valid.
*/

-- 1. T&C acceptance timestamp ------------------------------------------------
ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS tc_accepted_at timestamptz;

-- 2. Allow the two new audit event types -------------------------------------
ALTER TABLE nw_deal_confirmation_events
  DROP CONSTRAINT IF EXISTS nw_deal_confirmation_events_event_type_check;

ALTER TABLE nw_deal_confirmation_events
  ADD CONSTRAINT nw_deal_confirmation_events_event_type_check
  CHECK (event_type IN (
    'link_sent', 'viewed', 'otp_sent', 'otp_verified',
    'accepted', 'rejected', 'edited', 'token_invalidated', 'expired',
    'tc_accepted', 'signed_pdf_emailed'
  ));
