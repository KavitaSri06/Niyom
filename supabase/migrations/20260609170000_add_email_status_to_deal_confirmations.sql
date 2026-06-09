/*
  # Add Email Status Tracking to Deal Confirmations

  ## Purpose
  Tracks whether a deal confirmation email has been sent to the client.

  ## Changes
  - `email_status`   TEXT DEFAULT 'pending'  — 'pending' | 'sent'
  - `email_sent_at`  TIMESTAMPTZ             — when the email was sent
  - `email_sent_by`  UUID                    — which employee sent it (FK nw_employees)

  ## Backfill
  Existing records are set to email_status = 'pending'
*/

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent'));

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS email_sent_by UUID REFERENCES nw_employees(id) ON DELETE SET NULL;

-- Backfill existing rows
UPDATE nw_deal_confirmations
SET email_status = 'pending'
WHERE email_status IS NULL;

-- Index for quick filtering
CREATE INDEX IF NOT EXISTS idx_nw_deal_confirmations_email_status
  ON nw_deal_confirmations(email_status);
