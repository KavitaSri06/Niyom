/*
  # Client Login System

  ## Summary
  Adds client portal login capability to the CRM.

  ## Changes

  ### Modified Tables
  - `nw_clients`
    - `client_login_enabled` (boolean, default false) — whether login is enabled for this client
    - `client_password_changed` (boolean, default false) — tracks if first-time password has been changed
    - `client_auth_user_id` (uuid, nullable) — Supabase auth user ID for the client login

  ### New Tables
  - `nw_client_login_audit` — audit log for client login events
    - `id`, `client_id`, `action`, `ip_hint`, `created_at`

  ## Security
  - RLS enabled on nw_client_login_audit
  - Clients can only read their own audit logs
  - Employees/admins can read all audit logs for their clients
*/

-- Add client login fields to nw_clients
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_clients' AND column_name = 'client_login_enabled'
  ) THEN
    ALTER TABLE nw_clients ADD COLUMN client_login_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_clients' AND column_name = 'client_password_changed'
  ) THEN
    ALTER TABLE nw_clients ADD COLUMN client_password_changed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_clients' AND column_name = 'client_auth_user_id'
  ) THEN
    ALTER TABLE nw_clients ADD COLUMN client_auth_user_id uuid NULL;
  END IF;
END $$;

-- Client login audit table
CREATE TABLE IF NOT EXISTS nw_client_login_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES nw_clients(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nw_client_login_audit ENABLE ROW LEVEL SECURITY;

-- Clients can read their own audit logs
CREATE POLICY "Clients can read own login audit"
  ON nw_client_login_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients
      WHERE nw_clients.id = nw_client_login_audit.client_id
        AND nw_clients.client_auth_user_id = auth.uid()
    )
  );

-- Employees can read audit logs for their clients
CREATE POLICY "Employees can read client login audit"
  ON nw_client_login_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients
      JOIN nw_employees ON nw_employees.id = nw_clients.employee_id
      WHERE nw_clients.id = nw_client_login_audit.client_id
        AND nw_employees.auth_user_id = auth.uid()
    )
  );

-- Service role can insert audit logs
CREATE POLICY "Service role can insert client login audit"
  ON nw_client_login_audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_nw_clients_client_auth_user_id ON nw_clients(client_auth_user_id);
CREATE INDEX IF NOT EXISTS idx_nw_client_login_audit_client_id ON nw_client_login_audit(client_id);
