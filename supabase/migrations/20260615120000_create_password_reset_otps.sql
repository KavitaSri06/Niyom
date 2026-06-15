/*
  # Forgot Password with OTP — CRM staff (nw_employees)

  ## Purpose
  Backs the OTP-based password-reset flow for the Niyom Wealth CRM staff login.
  Mirrors the existing nw_deal_otps design (hashed OTP, attempts counter,
  short expiry, single-use) but is keyed by employee email instead of a deal.

  ## Table: nw_password_reset_otps
  - email       the registered staff email the OTP was issued for (lowercased)
  - employee_id FK -> nw_employees (audit/traceability; cascade on delete)
  - otp_hash    SHA-256 hash of `${otp}:${email}:${pepper}` — never plaintext
  - attempts    failed verification counter; locked out after 3 tries
  - expires_at  5 minutes from creation
  - used        flips true the instant the OTP successfully resets a password
  - created_at  audit + rate-limiting timestamp

  ## Table: nw_password_reset_logs
  Append-only audit trail of every reset-related event (request, send,
  verify success/fail, password change, rate-limit, enumeration attempt).

  ## Security
  RLS is enabled on BOTH tables with NO policies. They are reachable only by
  the edge functions using the service-role key, which bypasses RLS. The anon
  and authenticated roles can never read OTP hashes or the audit log.
*/

CREATE TABLE IF NOT EXISTS nw_password_reset_otps (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text        NOT NULL,
  employee_id uuid        REFERENCES nw_employees(id) ON DELETE CASCADE,
  otp_hash    text        NOT NULL,
  attempts    int         NOT NULL DEFAULT 0,
  expires_at  timestamptz NOT NULL,
  used        boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_password_reset_otps ENABLE ROW LEVEL SECURITY;
-- No RLS policies: service-role-only access from edge functions.

CREATE INDEX IF NOT EXISTS idx_nw_pwd_reset_otps_email      ON nw_password_reset_otps(email);
CREATE INDEX IF NOT EXISTS idx_nw_pwd_reset_otps_expires_at ON nw_password_reset_otps(expires_at);

CREATE TABLE IF NOT EXISTS nw_password_reset_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text,
  event       text        NOT NULL,
  ip          text,
  user_agent  text,
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_password_reset_logs ENABLE ROW LEVEL SECURITY;
-- No RLS policies: service-role-only access from edge functions.

CREATE INDEX IF NOT EXISTS idx_nw_pwd_reset_logs_email      ON nw_password_reset_logs(email);
CREATE INDEX IF NOT EXISTS idx_nw_pwd_reset_logs_created_at ON nw_password_reset_logs(created_at);
