/*
  # Create CRM System for Employees and Admins

  1. New Tables
    - `crm_users` - CRM employees and admins
      - `id` (uuid, primary key)
      - `email` (text, unique)
      - `full_name` (text)
      - `role` (text) - 'admin' or 'employee'
      - `level` (text) - employee level/designation
      - `monthly_salary` (numeric)
      - `auth_user_id` (uuid) - links to auth.users
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `deals` - Sales deals tracked by employees
      - `id` (uuid, primary key)
      - `employee_id` (uuid, foreign key to crm_users)
      - `product_type` (text) - mutual_funds, insurance, fixed_deposits, bonds, unlisted_shares, etc.
      - `amount` (numeric) - deal amount
      - `revenue` (numeric) - revenue generated
      - `status` (text) - 'pending', 'closed', 'cancelled'
      - `closed_at` (timestamptz) - when deal was closed
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `incentive_slabs` - Revenue share percentages based on X multiple
      - `id` (uuid, primary key)
      - `min_multiple` (numeric) - minimum X multiple
      - `max_multiple` (numeric) - maximum X multiple (null for unlimited)
      - `revenue_share_percentage` (numeric) - percentage of revenue
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - CRM users can only see their own data (employees)
    - Admins can see all data
    - Proper authentication checks

  3. Indexes
    - Foreign key indexes
    - Query optimization indexes
*/

-- Create crm_users table
CREATE TABLE IF NOT EXISTS crm_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'employee')),
  level text DEFAULT 'Junior Executive',
  monthly_salary numeric NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create deals table
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES crm_users(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN (
    'mutual_funds', 'insurance', 'fixed_deposits', 'bonds', 
    'unlisted_shares', 'primary_bonds', 'other'
  )),
  amount numeric NOT NULL CHECK (amount >= 0),
  revenue numeric NOT NULL CHECK (revenue >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'closed', 'cancelled')),
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create incentive_slabs table
CREATE TABLE IF NOT EXISTS incentive_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  min_multiple numeric NOT NULL CHECK (min_multiple >= 0),
  max_multiple numeric CHECK (max_multiple IS NULL OR max_multiple > min_multiple),
  revenue_share_percentage numeric NOT NULL CHECK (revenue_share_percentage >= 0 AND revenue_share_percentage <= 100),
  created_at timestamptz DEFAULT now()
);

-- Insert default incentive slabs
INSERT INTO incentive_slabs (min_multiple, max_multiple, revenue_share_percentage) VALUES
  (0, 1, 10),
  (1, 2, 15),
  (2, 3, 20),
  (3, 5, 25),
  (5, NULL, 30)
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_crm_users_auth_user_id ON crm_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_users_role ON crm_users(role);
CREATE INDEX IF NOT EXISTS idx_deals_employee_id ON deals(employee_id);
CREATE INDEX IF NOT EXISTS idx_deals_product_type ON deals(product_type);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_closed_at ON deals(closed_at DESC) WHERE closed_at IS NOT NULL;

-- Enable RLS
ALTER TABLE crm_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentive_slabs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crm_users
CREATE POLICY "Users can view own profile"
  ON crm_users FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Admins can view all users"
  ON crm_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.auth_user_id = auth.uid()
      AND crm_users.role = 'admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON crm_users FOR UPDATE
  TO authenticated
  USING (auth.uid() = auth_user_id)
  WITH CHECK (auth.uid() = auth_user_id);

-- RLS Policies for deals
CREATE POLICY "Employees can view own deals"
  ON deals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.id = deals.employee_id
      AND crm_users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all deals"
  ON deals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.auth_user_id = auth.uid()
      AND crm_users.role = 'admin'
    )
  );

CREATE POLICY "Employees can insert own deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.id = deals.employee_id
      AND crm_users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can update own deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.id = deals.employee_id
      AND crm_users.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.id = deals.employee_id
      AND crm_users.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update all deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.auth_user_id = auth.uid()
      AND crm_users.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_users
      WHERE crm_users.auth_user_id = auth.uid()
      AND crm_users.role = 'admin'
    )
  );

-- RLS Policies for incentive_slabs (read-only for all authenticated users)
CREATE POLICY "Authenticated users can view incentive slabs"
  ON incentive_slabs FOR SELECT
  TO authenticated
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public, pg_temp;

-- Triggers for updated_at
CREATE TRIGGER update_crm_users_updated_at
  BEFORE UPDATE ON crm_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate employee metrics
CREATE OR REPLACE FUNCTION get_employee_metrics(employee_uuid uuid)
RETURNS json AS $$
DECLARE
  total_revenue numeric;
  monthly_salary numeric;
  x_multiple numeric;
  incentive_amount numeric;
  product_categories integer;
  result json;
BEGIN
  -- Get employee salary
  SELECT crm_users.monthly_salary INTO monthly_salary
  FROM crm_users
  WHERE id = employee_uuid;

  -- Calculate total revenue from closed deals
  SELECT COALESCE(SUM(revenue), 0) INTO total_revenue
  FROM deals
  WHERE employee_id = employee_uuid
  AND status = 'closed';

  -- Count distinct product categories
  SELECT COUNT(DISTINCT product_type) INTO product_categories
  FROM deals
  WHERE employee_id = employee_uuid
  AND status = 'closed';

  -- Calculate X multiple
  IF monthly_salary > 0 THEN
    x_multiple := total_revenue / monthly_salary;
  ELSE
    x_multiple := 0;
  END IF;

  -- Calculate incentive based on slab
  IF product_categories >= 3 THEN
    SELECT (total_revenue * revenue_share_percentage / 100) INTO incentive_amount
    FROM incentive_slabs
    WHERE min_multiple <= x_multiple
    AND (max_multiple IS NULL OR x_multiple < max_multiple)
    ORDER BY min_multiple DESC
    LIMIT 1;
  ELSE
    incentive_amount := 0;
  END IF;

  -- Build result JSON
  result := json_build_object(
    'total_revenue', COALESCE(total_revenue, 0),
    'x_multiple', COALESCE(x_multiple, 0),
    'incentive_amount', COALESCE(incentive_amount, 0),
    'product_categories', COALESCE(product_categories, 0)
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Add comment
COMMENT ON FUNCTION get_employee_metrics(uuid) IS 
  'Calculates employee revenue metrics, X multiple, and incentive based on slabs. Requires minimum 3 product categories.';