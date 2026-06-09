/*
  # DSA System & Pricing Columns

  ## Summary
  Introduces a full DSA (Direct Selling Agent) management system alongside
  DSA-specific pricing fields for applicable holdings and transactions.

  ## 1. New Table: nw_dsa
  Stores DSA profiles linked to the employee who registered them.
  - `id` — UUID primary key
  - `dsa_code` — Unique code in format NWDSA-EEE-NNN (employee seq - dsa seq)
  - `employee_id` — The employee who registered this DSA (FK → nw_employees)
  - `full_name`, `email`, `phone`, `pan`, `address` — DSA personal details
  - `bank_name`, `bank_account`, `bank_ifsc` — DSA bank details
  - `photo_url`, `pan_url`, `bank_doc_url` — Document URLs
  - `status` — active / inactive
  - `created_at`, `updated_at`

  ## 2. Updated Table: nw_clients
  - `sourced_via` — 'direct' | 'dsa' (default 'direct')
  - `dsa_id` — FK to nw_dsa (nullable)

  ## 3. Updated Tables: nw_holdings & nw_transactions
  - `dsa_price` — price paid to DSA (visible to employee/admin only)
  - `client_price` — price charged to client (shown in print portfolio)
  These are only used for unlisted_share, secondary_bond, primary_bond.

  ## 4. DSA Code Generator Function
  `nw2_generate_dsa_code(p_employee_id uuid)` — generates the next
  sequential NWDSA-EEE-NNN code for a given employee.

  ## 5. Security
  - RLS enabled on nw_dsa
  - Authenticated employees can insert/select their own DSA records
  - Admins can view all DSA records
*/

-- ============================================================
-- 1. Create nw_dsa table
-- ============================================================
CREATE TABLE IF NOT EXISTS nw_dsa (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dsa_code      text UNIQUE NOT NULL,
  employee_id   uuid NOT NULL REFERENCES nw_employees(id) ON DELETE RESTRICT,
  full_name     text NOT NULL DEFAULT '',
  email         text NOT NULL DEFAULT '',
  phone         text NOT NULL DEFAULT '',
  pan           text NOT NULL DEFAULT '',
  address       text NOT NULL DEFAULT '',
  bank_name     text NOT NULL DEFAULT '',
  bank_account  text NOT NULL DEFAULT '',
  bank_ifsc     text NOT NULL DEFAULT '',
  photo_url     text,
  pan_url       text,
  bank_doc_url  text,
  status        text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_dsa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own DSA records"
  ON nw_dsa FOR SELECT
  TO authenticated
  USING (
    employee_id = (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Employees can insert their own DSA records"
  ON nw_dsa FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "Employees can update their own DSA records"
  ON nw_dsa FOR UPDATE
  TO authenticated
  USING (
    employee_id = (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    employee_id = (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid() LIMIT 1)
    OR EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_nw_dsa_employee_id ON nw_dsa(employee_id);
CREATE INDEX IF NOT EXISTS idx_nw_dsa_dsa_code ON nw_dsa(dsa_code);

-- ============================================================
-- 2. Add sourced_via + dsa_id to nw_clients
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_clients' AND column_name = 'sourced_via'
  ) THEN
    ALTER TABLE nw_clients ADD COLUMN sourced_via text NOT NULL DEFAULT 'direct';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_clients' AND column_name = 'dsa_id'
  ) THEN
    ALTER TABLE nw_clients ADD COLUMN dsa_id uuid REFERENCES nw_dsa(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nw_clients_dsa_id ON nw_clients(dsa_id);

-- ============================================================
-- 3. Add dsa_price + client_price to nw_holdings
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_holdings' AND column_name = 'dsa_price'
  ) THEN
    ALTER TABLE nw_holdings ADD COLUMN dsa_price numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_holdings' AND column_name = 'client_price'
  ) THEN
    ALTER TABLE nw_holdings ADD COLUMN client_price numeric;
  END IF;
END $$;

-- ============================================================
-- 4. Add dsa_price + client_price to nw_transactions
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_transactions' AND column_name = 'dsa_price'
  ) THEN
    ALTER TABLE nw_transactions ADD COLUMN dsa_price numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_transactions' AND column_name = 'client_price'
  ) THEN
    ALTER TABLE nw_transactions ADD COLUMN client_price numeric;
  END IF;
END $$;

-- ============================================================
-- 5. DSA Code Generator Function
-- Format: NWDSA-EEE-NNN
-- EEE = employee's sequential number (from their employee_code NWE-EEE)
-- NNN = next DSA number for that employee (001, 002, ...)
-- ============================================================
CREATE OR REPLACE FUNCTION nw2_generate_dsa_code(p_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_emp_code text;
  v_emp_seq  text;
  v_dsa_seq  int;
  v_dsa_code text;
BEGIN
  SELECT employee_code INTO v_emp_code
  FROM nw_employees WHERE id = p_employee_id;

  -- Extract numeric part from employee code (e.g. NWE-001 → 001)
  v_emp_seq := regexp_replace(v_emp_code, '[^0-9]', '', 'g');
  IF v_emp_seq = '' THEN v_emp_seq := '001'; END IF;

  -- Count existing DSA records for this employee
  SELECT COUNT(*) + 1 INTO v_dsa_seq
  FROM nw_dsa WHERE employee_id = p_employee_id;

  v_dsa_code := 'NWDSA-' || lpad(v_emp_seq, 3, '0') || '-' || lpad(v_dsa_seq::text, 3, '0');
  RETURN v_dsa_code;
END;
$$;

GRANT EXECUTE ON FUNCTION nw2_generate_dsa_code(uuid) TO authenticated;
