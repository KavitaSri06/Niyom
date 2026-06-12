/*
  # Deal Confirmation v2 — M3: Email OTP Verification

  ## Purpose
  Stores hashed, single-purpose, short-lived OTPs for the public deal page's
  accept / reject flow. Email OTP ONLY — there is no phone column and no SMS
  path. This is a separate table from nw_otps (which is the phone-based,
  employee-facing OTP store) so the two flows never interfere.

  ## Table: nw_deal_otps
  - deal_id     FK -> nw_deal_confirmations (cascade)
  - token       the secure link token the OTP was issued against
  - email       the address the OTP was sent to (the deal's client email)
  - otp_hash    SHA-256 hash of the OTP (never store plaintext)
  - purpose     'accept' | 'reject'
  - attempts    failed verification counter (lock out after N tries)
  - expires_at  10 minutes from creation
  - created_at  audit / rate-limiting timestamp

  ## Security
  - RLS enabled with NO policies. The table is accessed exclusively by edge
    functions using the service role key, which bypasses RLS. The anon and
    authenticated roles can never read OTP hashes.
*/

CREATE TABLE IF NOT EXISTS nw_deal_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     uuid NOT NULL REFERENCES nw_deal_confirmations(id) ON DELETE CASCADE,
  token       text NOT NULL,
  email       text NOT NULL,
  otp_hash    text NOT NULL,
  purpose     text NOT NULL CHECK (purpose IN ('accept', 'reject')),
  attempts    int  NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_deal_otps ENABLE ROW LEVEL SECURITY;
-- No RLS policies: service-role-only access from edge functions.

CREATE INDEX IF NOT EXISTS idx_nw_deal_otps_deal       ON nw_deal_otps(deal_id);
CREATE INDEX IF NOT EXISTS idx_nw_deal_otps_token      ON nw_deal_otps(token);
CREATE INDEX IF NOT EXISTS idx_nw_deal_otps_expires_at ON nw_deal_otps(expires_at);
