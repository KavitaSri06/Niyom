/*
  # Deal Confirmation v2 — M1: Acceptance & E-Signature Columns

  ## Purpose
  Adds the client-facing acceptance lifecycle and e-signature audit trail to
  nw_deal_confirmations. This is the data-model foundation for the secure-link
  flow (review → email OTP → accept/reject → signed PDF).

  This migration is ADDITIVE ONLY. It does not alter RLS, triggers, the
  accepted-deal lock, the events table, the OTP table, or storage — those are
  M2–M5 and intentionally out of scope here.

  ## Business rules these columns support
  - Link expiry = 7 days (token_expires_at).
  - Acceptance lifecycle: pending | viewed | accepted | rejected | expired.
  - Accepted deals are permanently locked (enforcement added in M4).
  - Expired and rejected deals remain editable/resendable.
  - The email that completed OTP + e-sign is stored for audit (signer_email).

  ## New columns on nw_deal_confirmations
  - acceptance_status     client decision lifecycle (separate from `status`)
  - secure_token          current valid public-link token (rotated on edit)
  - token_expires_at      link expiry timestamp (7 days from send)
  - viewed_at             first time the client opened the public deal page
  - accepted_at           timestamp of acceptance
  - rejected_at           timestamp of rejection
  - rejection_reason      optional free-text reason supplied by client
  - signer_email          email that completed OTP verification + e-sign (audit)
  - signer_ip             IP captured at signing (audit)
  - signer_user_agent     browser UA captured at signing (audit)
  - signature_image_path  storage path to captured signature PNG
  - signed_pdf_path        storage path to final signed PDF

  ## Backfill
  Existing rows default to acceptance_status = 'pending'. All other columns are
  nullable and remain NULL for existing rows (no link sent / not yet signed).
*/

-- Acceptance lifecycle ------------------------------------------------------
ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS acceptance_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (acceptance_status IN ('pending', 'viewed', 'accepted', 'rejected', 'expired'));

-- Secure link token + expiry ------------------------------------------------
ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS secure_token TEXT;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

-- A token, when present, must be globally unique so a public link resolves to
-- exactly one deal. NULLs are allowed and excluded (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_nw_deal_confirmations_secure_token
  ON nw_deal_confirmations(secure_token)
  WHERE secure_token IS NOT NULL;

-- Lifecycle timestamps ------------------------------------------------------
ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- E-signature audit trail ---------------------------------------------------
ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS signer_email TEXT;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS signer_ip TEXT;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS signer_user_agent TEXT;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS signature_image_path TEXT;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS signed_pdf_path TEXT;

-- Fast filtering by acceptance state for CRM list / stats -------------------
CREATE INDEX IF NOT EXISTS idx_nw_deal_confirmations_acceptance_status
  ON nw_deal_confirmations(acceptance_status);
