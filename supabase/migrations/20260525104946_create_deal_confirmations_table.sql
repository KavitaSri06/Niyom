/*
  # Create Deal Confirmations Table

  ## Purpose
  Stores all deal confirmation documents generated in the CRM for unlisted shares/bonds.
  Supports draft saving, re-generation, and admin template management.

  ## New Tables
  - `nw_deal_confirmations`
    - `id` — primary key
    - `confirmation_number` — unique auto-generated reference (e.g. DC-EMP01-001)
    - `client_id` — FK to nw_clients
    - `employee_id` — FK to nw_employees (creator)
    - `status` — draft | confirmed
    - Deal Information fields: deal_date, transaction_type, product_type
    - Security fields: security_name, isin, quantity, rate_per_unit
    - Auto-calculated: settlement_amount, stamp_duty
    - Snapshot of client details at time of generation (for PDF stability)
    - `created_at`, `updated_at`

  ## Security
  - RLS enabled; employees see own + their clients' deals; admins see all
*/

CREATE TABLE IF NOT EXISTS nw_deal_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  confirmation_number text UNIQUE NOT NULL DEFAULT '',
  client_id uuid REFERENCES nw_clients(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),

  -- Deal information
  deal_date date NOT NULL,
  transaction_type text NOT NULL DEFAULT '' CHECK (transaction_type IN ('Buy', 'Sell')),
  product_type text NOT NULL DEFAULT '',

  -- Security / instrument
  security_name text NOT NULL DEFAULT '',
  isin text NOT NULL DEFAULT '',
  quantity numeric(18,4) NOT NULL DEFAULT 0,
  rate_per_unit numeric(18,4) NOT NULL DEFAULT 0,

  -- Auto-calculated (stored for audit trail)
  settlement_amount numeric(18,2) GENERATED ALWAYS AS (ROUND((quantity * rate_per_unit)::numeric, 2)) STORED,
  stamp_duty numeric(18,4) GENERATED ALWAYS AS (ROUND((quantity * rate_per_unit * 0.015 / 100)::numeric, 4)) STORED,

  -- Snapshot of client details at generation time
  snap_client_name text NOT NULL DEFAULT '',
  snap_pan text NOT NULL DEFAULT '',
  snap_dp_name text NOT NULL DEFAULT '',
  snap_demat_account text NOT NULL DEFAULT '',
  snap_bank_name text NOT NULL DEFAULT '',
  snap_bank_account text NOT NULL DEFAULT '',
  snap_bank_ifsc text NOT NULL DEFAULT '',
  snap_address text NOT NULL DEFAULT '',
  snap_phone text NOT NULL DEFAULT '',
  snap_email text NOT NULL DEFAULT '',

  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_deal_confirmations ENABLE ROW LEVEL SECURITY;

-- Employees can view and manage deal confirmations they created or for their clients
CREATE POLICY "Employees can select own deal confirmations"
  ON nw_deal_confirmations FOR SELECT
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM nw_employees WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
      AND (e.role = 'admin' OR e.role = 'super_admin')
    )
  );

CREATE POLICY "Employees can insert deal confirmations"
  ON nw_deal_confirmations FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id IN (
      SELECT id FROM nw_employees WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
      AND (e.role = 'admin' OR e.role = 'super_admin')
    )
  );

CREATE POLICY "Employees can update own deal confirmations"
  ON nw_deal_confirmations FOR UPDATE
  TO authenticated
  USING (
    employee_id IN (
      SELECT id FROM nw_employees WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
      AND (e.role = 'admin' OR e.role = 'super_admin')
    )
  )
  WITH CHECK (
    employee_id IN (
      SELECT id FROM nw_employees WHERE auth_user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
      AND (e.role = 'admin' OR e.role = 'super_admin')
    )
  );

CREATE POLICY "Admins can delete deal confirmations"
  ON nw_deal_confirmations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
      AND (e.role = 'admin' OR e.role = 'super_admin')
    )
  );

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_nw_deal_confirmations_client ON nw_deal_confirmations(client_id);
CREATE INDEX IF NOT EXISTS idx_nw_deal_confirmations_employee ON nw_deal_confirmations(employee_id);
CREATE INDEX IF NOT EXISTS idx_nw_deal_confirmations_status ON nw_deal_confirmations(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION nw_update_deal_confirmation_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER nw_deal_confirmations_updated_at
  BEFORE UPDATE ON nw_deal_confirmations
  FOR EACH ROW EXECUTE FUNCTION nw_update_deal_confirmation_updated_at();

-- Function to auto-generate confirmation number
CREATE OR REPLACE FUNCTION nw_generate_confirmation_number(p_employee_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp_code text;
  v_seq int;
  v_number text;
BEGIN
  SELECT employee_code INTO v_emp_code FROM nw_employees WHERE id = p_employee_id;
  SELECT COUNT(*) + 1 INTO v_seq FROM nw_deal_confirmations WHERE employee_id = p_employee_id;
  v_number := 'DC-' || COALESCE(v_emp_code, 'ADM') || '-' || LPAD(v_seq::text, 3, '0');
  RETURN v_number;
END;
$$;
