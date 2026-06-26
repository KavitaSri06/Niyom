/*
  # Debit Note Signing — M2: Email OTP Verification

  ## Purpose
  Stores hashed, single-purpose, short-lived OTPs for the public debit-note
  signing page. Email OTP ONLY (sent to the DSA's registered email). This is a
  separate table from nw_deal_otps so the deal-confirmation flow is never
  touched and the two flows can never interfere.

  ## Table: dsa_debit_note_otps
  - debit_note_id  FK -> dsa_debit_notes (cascade)
  - token          the secure link token the OTP was issued against
  - email          the address the OTP was sent to (the DSA email)
  - otp_hash       SHA-256 hash of the OTP (never store plaintext)
  - purpose        'sign'
  - attempts       failed verification counter (lock out after N tries)
  - expires_at     10 minutes from creation
  - created_at     audit / rate-limiting timestamp

  ## Security
  - RLS enabled with NO policies. The table is accessed exclusively by edge
    functions using the service role key, which bypasses RLS. The anon and
    authenticated roles can never read OTP hashes.
*/

CREATE TABLE IF NOT EXISTS dsa_debit_note_otps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id uuid NOT NULL REFERENCES dsa_debit_notes(id) ON DELETE CASCADE,
  token         text NOT NULL,
  email         text NOT NULL,
  otp_hash      text NOT NULL,
  purpose       text NOT NULL DEFAULT 'sign' CHECK (purpose IN ('sign')),
  attempts      int  NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dsa_debit_note_otps ENABLE ROW LEVEL SECURITY;
-- No RLS policies: service-role-only access from edge functions.

CREATE INDEX IF NOT EXISTS idx_dsa_debit_note_otps_note       ON dsa_debit_note_otps(debit_note_id);
CREATE INDEX IF NOT EXISTS idx_dsa_debit_note_otps_token      ON dsa_debit_note_otps(token);
CREATE INDEX IF NOT EXISTS idx_dsa_debit_note_otps_expires_at ON dsa_debit_note_otps(expires_at);
