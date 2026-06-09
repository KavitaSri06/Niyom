/*
  # Login Security Audit Table

  ## Summary
  Adds a server-side audit table that records all CRM login events
  (success and failure) for admin visibility and forensic analysis.
  This complements the client-side rate limiting in the frontend.

  ## New Table: nw_login_audit
  - `id` — UUID primary key
  - `email` — attempted email (stored for audit, not linked via FK)
  - `employee_id` — FK to nw_employees if login was successful
  - `event` — 'success' | 'failure' | 'locked_out' | 'unauthorized_user'
  - `ip_hint` — optional client metadata
  - `created_at` — timestamp

  ## Security
  - RLS enabled: only admins can SELECT
  - Authenticated users can INSERT (login events written server-side via service role or client)
  - No UPDATE or DELETE policies (immutable audit log)
*/

CREATE TABLE IF NOT EXISTS nw_login_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL DEFAULT '',
  employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  event       text NOT NULL DEFAULT 'failure',
  ip_hint     text DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_login_audit ENABLE ROW LEVEL SECURITY;

-- Only admins/super_admins can view the audit log
CREATE POLICY "Admins can view login audit log"
  ON nw_login_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
        AND status = 'active'
    )
  );

-- Any authenticated user can insert their own login event
CREATE POLICY "Authenticated users can insert login events"
  ON nw_login_audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_nw_login_audit_email ON nw_login_audit(email);
CREATE INDEX IF NOT EXISTS idx_nw_login_audit_created_at ON nw_login_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nw_login_audit_event ON nw_login_audit(event);
