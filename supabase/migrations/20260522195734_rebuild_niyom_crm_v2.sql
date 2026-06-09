/*
  # Niyom Wealth CRM v2 - Complete Schema Rebuild

  ## Summary
  This migration drops the old nw_* tables and recreates them with updated requirements:

  1. **New Tables**
    - `nw_employees` - Employee records with NIYOM-001 format codes, password_changed flag
    - `nw_clients` - Client records with NIYOM-001-0001 / ADMIN-0001 format codes
    - `nw_client_documents` - KYC documents per client
    - `nw_holdings` - Portfolio holdings per client
    - `nw_transactions` - Transaction records with product-specific fields
    - `nw_txn_documents` - Deal confirmation docs per transaction
    - `nw_activity_logs` - Audit trail
    - `nw_alerts` - Employee notifications

  2. **Key Changes from v1**
    - Employee code format: NIYOM-001 (not NIYOM-EMP-001)
    - Admin client codes: ADMIN-0001
    - Employee client codes: NIYOM-001-0001
    - Added `password_changed` boolean for forced first-login password reset
    - Transaction product types: unlisted_share, secondary_bond, primary_bond, mutual_fund, fixed_deposit, insurance
    - Auto-calculation fields: quantity, per_unit_price, consolidated_amount
    - FD/Insurance use amount directly (no auto-calc)

  3. **Security**
    - RLS enabled on all tables
    - Employees can only see their own clients (unless admin)
    - Admins see all data

  4. **Helper Functions**
    - `nw2_generate_employee_code()` - generates NIYOM-001 format
    - `nw2_generate_client_code(p_employee_id)` - generates NIYOM-001-0001 or ADMIN-0001
*/

-- Drop old tables if they exist
DROP TABLE IF EXISTS nw_alerts CASCADE;
DROP TABLE IF EXISTS nw_activity_logs CASCADE;
DROP TABLE IF EXISTS nw_txn_documents CASCADE;
DROP TABLE IF EXISTS nw_txn CASCADE;
DROP TABLE IF EXISTS nw_portfolio_holdings CASCADE;
DROP TABLE IF EXISTS nw_client_documents CASCADE;
DROP TABLE IF EXISTS nw_clients CASCADE;
DROP TABLE IF EXISTS nw_employees CASCADE;

-- Drop old functions
DROP FUNCTION IF EXISTS nw_generate_employee_code();
DROP FUNCTION IF EXISTS nw_generate_client_code(uuid);

-- =====================
-- EMPLOYEES TABLE
-- =====================
CREATE TABLE nw_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_code text UNIQUE NOT NULL,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text DEFAULT '',
  role text NOT NULL DEFAULT 'employee' CHECK (role IN ('super_admin', 'admin', 'employee')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  password_changed boolean NOT NULL DEFAULT false,
  joining_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE nw_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view all employees"
  ON nw_employees FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active'));

CREATE POLICY "Employees can update own record"
  ON nw_employees FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Service role can insert employees"
  ON nw_employees FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update employees"
  ON nw_employees FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete employees"
  ON nw_employees FOR DELETE
  TO service_role
  USING (true);

-- =====================
-- CLIENTS TABLE
-- =====================
CREATE TABLE nw_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code text UNIQUE NOT NULL,
  employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text DEFAULT '',
  phone text DEFAULT '',
  pan text DEFAULT '',
  dob date,
  address text DEFAULT '',
  city text DEFAULT '',
  state text DEFAULT '',
  demat_account text DEFAULT '',
  dp_name text DEFAULT '',
  bank_account text DEFAULT '',
  bank_ifsc text DEFAULT '',
  bank_name text DEFAULT '',
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'partial', 'verified', 'rejected')),
  portfolio_value numeric DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE nw_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their clients or admin sees all"
  ON nw_clients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = nw_clients.employee_id)
    )
  );

CREATE POLICY "Employees can insert clients"
  ON nw_clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active')
  );

CREATE POLICY "Employees can update their clients or admin updates all"
  ON nw_clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = nw_clients.employee_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = nw_clients.employee_id)
    )
  );

CREATE POLICY "Admins can delete clients"
  ON nw_clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.role IN ('admin', 'super_admin') AND e.status = 'active')
  );

-- =====================
-- CLIENT DOCUMENTS
-- =====================
CREATE TABLE nw_client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES nw_clients(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nw_client_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view client docs for accessible clients"
  ON nw_client_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_client_documents.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can insert client docs"
  ON nw_client_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active')
  );

CREATE POLICY "Admins can delete client docs"
  ON nw_client_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.role IN ('admin', 'super_admin') AND e.status = 'active')
  );

-- =====================
-- HOLDINGS TABLE
-- =====================
CREATE TABLE nw_holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES nw_clients(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('unlisted_share', 'secondary_bond', 'primary_bond', 'mutual_fund', 'fixed_deposit', 'insurance')),
  product_name text NOT NULL,
  quantity numeric DEFAULT 0,
  avg_cost numeric DEFAULT 0,
  current_value numeric DEFAULT 0,
  invested_amount numeric DEFAULT 0,
  maturity_date date,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE nw_holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view holdings for accessible clients"
  ON nw_holdings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_holdings.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can insert holdings for accessible clients"
  ON nw_holdings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_holdings.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can update holdings for accessible clients"
  ON nw_holdings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_holdings.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_holdings.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can delete holdings for accessible clients"
  ON nw_holdings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_holdings.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

-- =====================
-- TRANSACTIONS TABLE
-- =====================
CREATE TABLE nw_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES nw_clients(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  txn_type text NOT NULL CHECK (txn_type IN ('buy', 'sell', 'transfer_in', 'transfer_out')),
  product_type text NOT NULL CHECK (product_type IN ('unlisted_share', 'secondary_bond', 'primary_bond', 'mutual_fund', 'fixed_deposit', 'insurance')),
  product_name text NOT NULL,
  quantity numeric,
  per_unit_price numeric,
  consolidated_amount numeric NOT NULL DEFAULT 0,
  txn_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE nw_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view transactions for accessible clients"
  ON nw_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_transactions.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can insert transactions for accessible clients"
  ON nw_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_transactions.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can update transactions for accessible clients"
  ON nw_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_transactions.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_transactions.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can delete transactions for accessible clients"
  ON nw_transactions FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_transactions.client_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

-- =====================
-- TRANSACTION DOCUMENTS
-- =====================
CREATE TABLE nw_txn_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_id uuid NOT NULL REFERENCES nw_transactions(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  uploaded_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nw_txn_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view txn docs for accessible transactions"
  ON nw_txn_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_transactions t
      JOIN nw_clients c ON c.id = t.client_id
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE t.id = nw_txn_documents.txn_id AND e.status = 'active'
      AND (e.role IN ('admin', 'super_admin') OR e.id = c.employee_id)
    )
  );

CREATE POLICY "Employees can insert txn docs"
  ON nw_txn_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active')
  );

CREATE POLICY "Employees can delete txn docs"
  ON nw_txn_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active')
  );

-- =====================
-- ACTIVITY LOGS
-- =====================
CREATE TABLE nw_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  client_id uuid REFERENCES nw_clients(id) ON DELETE SET NULL,
  action text NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nw_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view all activity logs"
  ON nw_activity_logs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active'));

CREATE POLICY "Employees can insert activity logs"
  ON nw_activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active'));

-- =====================
-- ALERTS
-- =====================
CREATE TABLE nw_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES nw_employees(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text DEFAULT '',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE nw_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own alerts"
  ON nw_alerts FOR SELECT
  TO authenticated
  USING (
    employee_id IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Employees can update own alerts"
  ON nw_alerts FOR UPDATE
  TO authenticated
  USING (employee_id IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid()))
  WITH CHECK (employee_id IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid()));

CREATE POLICY "Employees can insert alerts"
  ON nw_alerts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM nw_employees e WHERE e.auth_user_id = auth.uid() AND e.status = 'active'));

-- =====================
-- HELPER FUNCTIONS
-- =====================

-- Generate employee code: NIYOM-001, NIYOM-002, ...
CREATE OR REPLACE FUNCTION nw2_generate_employee_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num int;
  new_code text;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(employee_code, '-', 2) AS int)), 0) + 1
  INTO next_num
  FROM nw_employees
  WHERE employee_code ~ '^NIYOM-[0-9]+$';
  new_code := 'NIYOM-' || LPAD(next_num::text, 3, '0');
  RETURN new_code;
END;
$$;

-- Generate client code:
-- If employee is admin/super_admin: ADMIN-0001
-- Otherwise: NIYOM-001-0001 (employee_code + sequential)
CREATE OR REPLACE FUNCTION nw2_generate_client_code(p_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_record record;
  next_num int;
  new_code text;
BEGIN
  SELECT employee_code, role INTO emp_record FROM nw_employees WHERE id = p_employee_id;
  
  IF emp_record.role IN ('admin', 'super_admin') THEN
    SELECT COALESCE(MAX(CAST(SPLIT_PART(client_code, '-', 2) AS int)), 0) + 1
    INTO next_num
    FROM nw_clients
    WHERE client_code ~ '^ADMIN-[0-9]+$';
    new_code := 'ADMIN-' || LPAD(next_num::text, 4, '0');
  ELSE
    SELECT COALESCE(MAX(CAST(SPLIT_PART(client_code, '-', 3) AS int)), 0) + 1
    INTO next_num
    FROM nw_clients c
    JOIN nw_employees e ON e.id = c.employee_id
    WHERE e.id = p_employee_id;
    new_code := emp_record.employee_code || '-' || LPAD(next_num::text, 4, '0');
  END IF;
  
  RETURN new_code;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nw_employees_auth ON nw_employees(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_nw_employees_code ON nw_employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_nw_clients_employee ON nw_clients(employee_id);
CREATE INDEX IF NOT EXISTS idx_nw_clients_code ON nw_clients(client_code);
CREATE INDEX IF NOT EXISTS idx_nw_holdings_client ON nw_holdings(client_id);
CREATE INDEX IF NOT EXISTS idx_nw_transactions_client ON nw_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_nw_transactions_date ON nw_transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_nw_activity_employee ON nw_activity_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_nw_alerts_employee ON nw_alerts(employee_id);
