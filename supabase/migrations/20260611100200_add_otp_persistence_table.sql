/*
  # Add nw_otps table for persistent OTP storage

  ## Problem
  send-otp edge function stores OTPs in a Deno in-memory Map.  Edge
  functions can be cold-started on any instance; an OTP written on
  Instance A cannot be read back on Instance B, making verification
  unreliable under any concurrent load.

  ## Fix
  Persist OTPs in a DB table.  The edge function uses the service role
  key, so RLS is bypassed — no policies are needed.  Expired rows are
  cleaned up proactively on every send request.

  ## Columns
  phone       10-digit mobile number (no country prefix)
  otp         6-digit code
  expires_at  10 minutes from creation
  created_at  audit timestamp
*/

CREATE TABLE IF NOT EXISTS nw_otps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       text        NOT NULL,
  otp         text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_otps ENABLE ROW LEVEL SECURITY;
-- No RLS policies: table is accessed exclusively via service role key
-- from edge functions, which bypasses RLS entirely.

CREATE INDEX IF NOT EXISTS idx_nw_otps_phone      ON nw_otps(phone);
CREATE INDEX IF NOT EXISTS idx_nw_otps_expires_at ON nw_otps(expires_at);
