/*
  # Niyom Wealth Complete CRM System

  ## Overview
  Complete financial services CRM system for managing employees, clients, deals, and incentive calculations.
  This migration creates new tables and extends existing ones.

  ## Tables Created

  ### 1. employees (extends existing crm_users)
  - Alias/view for existing employee data
  - Uses crm_users table as base

  ### 2. clients
  - Customer records created by employees
  - Tracks which employee created each client

  ### 3. deals (extends existing table)
  - Adds client_id, retention tracking, and clawback fields
  - Updates product types to match new requirements

  ### 4. product_rules
  - Configuration for each product type
  - Defines minimum values, revenue rates, retention periods

  ### 5. slab_rules
  - Incentive tier structure based on X multiple
  - 10 tiers from 2.1x to 20x+
  - Progressive revenue share percentages

  ### 6. incentives
  - Monthly incentive calculations per employee
  - Tracks eligibility, X multiple, and final payout

  ## Business Logic
  - X Multiple = total_revenue / salary
  - Minimum 3 products required for eligibility
  - Clawback tracking for retention violations
  - Cap at 60% of total revenue for 20x+ performers
*/

-- ========================================
-- 1. CLIENTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  created_by uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- ========================================
-- 2. EXTEND DEALS TABLE
-- ========================================
-- Add new columns to existing deals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE deals ADD COLUMN client_id uuid REFERENCES clients(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'retention_required'
  ) THEN
    ALTER TABLE deals ADD COLUMN retention_required integer DEFAULT 0 CHECK (retention_required >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'retention_actual'
  ) THEN
    ALTER TABLE deals ADD COLUMN retention_actual integer DEFAULT 0 CHECK (retention_actual >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'clawback'
  ) THEN
    ALTER TABLE deals ADD COLUMN clawback boolean DEFAULT false;
  END IF;
END $$;

-- Update status check constraint to match new requirements
DO $$
BEGIN
  ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_status_check;
  ALTER TABLE deals ADD CONSTRAINT deals_status_check 
    CHECK (status IN ('active', 'closed', 'pending', 'cancelled'));
END $$;

-- ========================================
-- 3. PRODUCT_RULES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS product_rules (
  product_type text PRIMARY KEY,
  min_value numeric NOT NULL CHECK (min_value >= 0),
  revenue_rate numeric NOT NULL CHECK (revenue_rate >= 0),
  retention_months integer NOT NULL CHECK (retention_months >= 0)
);

-- Insert default product rules
INSERT INTO product_rules (product_type, min_value, revenue_rate, retention_months) VALUES
  ('Mutual Fund', 300000, 0.0075, 3),
  ('Demat Account', 5, 600, 3),
  ('Bond/FD', 500000, 0.01, 6),
  ('Unlisted/Pre-IPO', 100000, 0.015, 12),
  ('Insurance', 25000, 0.12, 12)
ON CONFLICT (product_type) DO NOTHING;

-- ========================================
-- 4. SLAB_RULES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS slab_rules (
  id serial PRIMARY KEY,
  x_min numeric NOT NULL CHECK (x_min >= 0),
  x_max numeric CHECK (x_max IS NULL OR x_max >= x_min),
  level text NOT NULL,
  share_percentage numeric NOT NULL CHECK (share_percentage >= 0 AND share_percentage <= 1)
);

-- Insert slab rules
INSERT INTO slab_rules (x_min, x_max, level, share_percentage) VALUES
  (2.1, 3.0, 'Level 1', 0.10),
  (3.1, 4.0, 'Level 1', 0.125),
  (4.1, 5.0, 'Level 1', 0.15),
  (5.0, 7.0, 'Level 2', 0.18),
  (7.1, 9.0, 'Level 2', 0.22),
  (9.1, 11.0, 'Level 2', 0.25),
  (11.1, 14.0, 'Level 3', 0.30),
  (14.1, 17.0, 'Level 3', 0.35),
  (17.1, 20.0, 'Level 3', 0.40),
  (20.0, NULL, 'Level 4', 0.60)
ON CONFLICT DO NOTHING;

-- ========================================
-- 5. INCENTIVES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  month date NOT NULL,
  total_revenue numeric NOT NULL DEFAULT 0 CHECK (total_revenue >= 0),
  x_multiple numeric NOT NULL DEFAULT 0 CHECK (x_multiple >= 0),
  level text,
  product_count integer NOT NULL DEFAULT 0 CHECK (product_count >= 0),
  eligible boolean NOT NULL DEFAULT false,
  incentive numeric NOT NULL DEFAULT 0 CHECK (incentive >= 0),
  final_payout numeric NOT NULL DEFAULT 0 CHECK (final_payout >= 0),
  created_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, month)
);

-- ========================================
-- INDEXES FOR PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_clients_created_by_fk ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_deals_client_id_fk ON deals(client_id);
CREATE INDEX IF NOT EXISTS idx_deals_clawback ON deals(clawback) WHERE clawback = true;
CREATE INDEX IF NOT EXISTS idx_incentives_employee_id_fk ON incentives(employee_id);
CREATE INDEX IF NOT EXISTS idx_incentives_month ON incentives(month DESC);

-- ========================================
-- ENABLE ROW LEVEL SECURITY
-- ========================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE slab_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentives ENABLE ROW LEVEL SECURITY;

-- ========================================
-- RLS POLICIES - CLIENTS
-- ========================================
CREATE POLICY "Employees can view clients"
  ON clients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.id = clients.created_by
      AND e.auth_user_id = (SELECT auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.auth_user_id = (SELECT auth.uid())
      AND e.role = 'admin'
    )
  );

CREATE POLICY "Employees can create clients"
  ON clients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.id = clients.created_by
      AND e.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Employees can update own clients"
  ON clients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.id = clients.created_by
      AND e.auth_user_id = (SELECT auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.auth_user_id = (SELECT auth.uid())
      AND e.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete clients"
  ON clients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.auth_user_id = (SELECT auth.uid())
      AND e.role = 'admin'
    )
  );

-- ========================================
-- RLS POLICIES - PRODUCT_RULES & SLAB_RULES
-- ========================================
CREATE POLICY "Authenticated users can view product rules"
  ON product_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage product rules"
  ON product_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.auth_user_id = (SELECT auth.uid())
      AND e.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can view slab rules"
  ON slab_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage slab rules"
  ON slab_rules FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.auth_user_id = (SELECT auth.uid())
      AND e.role = 'admin'
    )
  );

-- ========================================
-- RLS POLICIES - INCENTIVES
-- ========================================
CREATE POLICY "Employees can view own incentives"
  ON incentives FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.id = incentives.employee_id
      AND e.auth_user_id = (SELECT auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.auth_user_id = (SELECT auth.uid())
      AND e.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage incentives"
  ON incentives FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users e
      WHERE e.auth_user_id = (SELECT auth.uid())
      AND e.role = 'admin'
    )
  );

-- ========================================
-- BUSINESS LOGIC FUNCTIONS
-- ========================================

-- Function to calculate monthly incentive for an employee
CREATE OR REPLACE FUNCTION calculate_monthly_incentive(
  emp_id uuid,
  calc_month date
)
RETURNS json AS $$
DECLARE
  emp_salary numeric;
  total_rev numeric;
  x_mult numeric;
  prod_count integer;
  is_eligible boolean;
  slab_level text;
  share_pct numeric;
  incentive_amt numeric;
  final_pay numeric;
  result json;
BEGIN
  -- Get employee salary
  SELECT monthly_salary INTO emp_salary
  FROM crm_users
  WHERE id = emp_id;

  IF emp_salary IS NULL OR emp_salary = 0 THEN
    RETURN json_build_object(
      'error', 'Employee not found or salary is 0',
      'eligible', false,
      'incentive', 0,
      'final_payout', 0
    );
  END IF;

  -- Calculate total revenue from closed deals (excluding clawbacks)
  SELECT COALESCE(SUM(revenue), 0) INTO total_rev
  FROM deals
  WHERE employee_id = emp_id
  AND status = 'closed'
  AND COALESCE(clawback, false) = false
  AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', calc_month);

  -- Count distinct product types
  SELECT COUNT(DISTINCT product_type) INTO prod_count
  FROM deals
  WHERE employee_id = emp_id
  AND status = 'closed'
  AND COALESCE(clawback, false) = false
  AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', calc_month);

  -- Calculate X multiple
  x_mult := total_rev / emp_salary;

  -- Check eligibility (minimum 3 products required)
  is_eligible := prod_count >= 3 AND x_mult >= 2.1;

  IF NOT is_eligible THEN
    RETURN json_build_object(
      'total_revenue', total_rev,
      'x_multiple', ROUND(x_mult, 2),
      'product_count', prod_count,
      'eligible', false,
      'level', NULL,
      'share_percentage', 0,
      'incentive', 0,
      'final_payout', emp_salary
    );
  END IF;

  -- Get applicable slab
  SELECT level, share_percentage INTO slab_level, share_pct
  FROM slab_rules
  WHERE x_min <= x_mult
  AND (x_max IS NULL OR x_mult <= x_max)
  ORDER BY x_min DESC
  LIMIT 1;

  IF share_pct IS NULL THEN
    share_pct := 0;
    slab_level := 'No slab';
  END IF;

  -- Calculate incentive
  incentive_amt := total_rev * share_pct;

  -- Calculate final payout
  final_pay := emp_salary + incentive_amt;

  -- Apply cap rule for 20x+ performers (60% of total revenue including salary)
  IF x_mult >= 20 THEN
    final_pay := LEAST(final_pay, total_rev * 0.60);
    incentive_amt := final_pay - emp_salary;
  END IF;

  RETURN json_build_object(
    'total_revenue', total_rev,
    'x_multiple', ROUND(x_mult, 2),
    'product_count', prod_count,
    'eligible', true,
    'level', slab_level,
    'share_percentage', share_pct,
    'incentive', ROUND(incentive_amt, 2),
    'final_payout', ROUND(final_pay, 2)
  );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Function to update clawback status
CREATE OR REPLACE FUNCTION check_and_update_clawback()
RETURNS trigger AS $$
BEGIN
  -- Check if retention_actual < retention_required
  IF NEW.status = 'closed' AND 
     COALESCE(NEW.retention_actual, 0) < COALESCE(NEW.retention_required, 0) THEN
    NEW.clawback := true;
  ELSE
    NEW.clawback := false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

-- Trigger to auto-update clawback status
DROP TRIGGER IF EXISTS update_clawback_status ON deals;
CREATE TRIGGER update_clawback_status
  BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION check_and_update_clawback();

-- Function to auto-populate retention_required from product_rules
CREATE OR REPLACE FUNCTION set_retention_required()
RETURNS trigger AS $$
BEGIN
  -- Only set if not already provided
  IF NEW.retention_required IS NULL OR NEW.retention_required = 0 THEN
    SELECT retention_months INTO NEW.retention_required
    FROM product_rules
    WHERE product_type = NEW.product_type;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

-- Trigger to set retention_required on insert
DROP TRIGGER IF EXISTS auto_set_retention ON deals;
CREATE TRIGGER auto_set_retention
  BEFORE INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION set_retention_required();

-- Function to store monthly incentive calculation
CREATE OR REPLACE FUNCTION store_monthly_incentive(
  emp_id uuid,
  calc_month date
)
RETURNS incentives AS $$
DECLARE
  calc_result json;
  new_incentive incentives;
BEGIN
  -- Calculate the incentive
  calc_result := calculate_monthly_incentive(emp_id, calc_month);

  -- Insert or update the incentive record
  INSERT INTO incentives (
    employee_id,
    month,
    total_revenue,
    x_multiple,
    level,
    product_count,
    eligible,
    incentive,
    final_payout
  ) VALUES (
    emp_id,
    DATE_TRUNC('month', calc_month)::date,
    (calc_result->>'total_revenue')::numeric,
    (calc_result->>'x_multiple')::numeric,
    calc_result->>'level',
    (calc_result->>'product_count')::integer,
    (calc_result->>'eligible')::boolean,
    (calc_result->>'incentive')::numeric,
    (calc_result->>'final_payout')::numeric
  )
  ON CONFLICT (employee_id, month)
  DO UPDATE SET
    total_revenue = EXCLUDED.total_revenue,
    x_multiple = EXCLUDED.x_multiple,
    level = EXCLUDED.level,
    product_count = EXCLUDED.product_count,
    eligible = EXCLUDED.eligible,
    incentive = EXCLUDED.incentive,
    final_payout = EXCLUDED.final_payout,
    created_at = now()
  RETURNING * INTO new_incentive;

  RETURN new_incentive;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Add helpful comments
COMMENT ON TABLE clients IS 'Customer records created and managed by employees';
COMMENT ON TABLE product_rules IS 'Configuration rules for each product type with min values and revenue rates';
COMMENT ON TABLE slab_rules IS 'Incentive tier structure based on X multiple performance (10 levels)';
COMMENT ON TABLE incentives IS 'Monthly incentive calculations and payouts per employee';
COMMENT ON FUNCTION calculate_monthly_incentive(uuid, date) IS 'Calculates monthly incentive based on revenue, products, and slab rules. Returns JSON with all metrics.';
COMMENT ON FUNCTION check_and_update_clawback() IS 'Automatically sets clawback flag if retention requirements not met';
COMMENT ON FUNCTION set_retention_required() IS 'Auto-populates retention_required from product_rules when deal is created';
COMMENT ON FUNCTION store_monthly_incentive(uuid, date) IS 'Calculates and stores monthly incentive record for an employee';