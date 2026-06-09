/*
  # CRM Enhancements Migration

  ## Changes
  1. Add `client_name` and `notes` columns to deals table for quick client reference
  2. Add `phone` column to clients table if missing
  3. Add `is_active` column to crm_users for employee activation/deactivation
  4. Fix get_employee_metrics function to return correct type
  5. Add missing RLS insert/update/delete policies for incentives

  ## Notes
  - All changes are additive (no data loss)
  - Uses IF NOT EXISTS guards throughout
*/

-- Add client_name to deals for denormalized quick reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'client_name'
  ) THEN
    ALTER TABLE deals ADD COLUMN client_name text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'notes'
  ) THEN
    ALTER TABLE deals ADD COLUMN notes text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'crm_users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE crm_users ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'address'
  ) THEN
    ALTER TABLE clients ADD COLUMN address text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'notes'
  ) THEN
    ALTER TABLE clients ADD COLUMN notes text DEFAULT '';
  END IF;
END $$;

-- Drop and recreate get_employee_metrics to return proper structure
CREATE OR REPLACE FUNCTION get_employee_metrics(employee_uuid uuid)
RETURNS json AS $$
DECLARE
  emp_salary numeric;
  total_rev numeric;
  x_mult numeric;
  prod_count integer;
  incentive_amt numeric;
  share_pct numeric;
  is_eligible boolean;
BEGIN
  SELECT monthly_salary INTO emp_salary
  FROM crm_users WHERE id = employee_uuid;

  IF emp_salary IS NULL THEN emp_salary := 0; END IF;

  SELECT COALESCE(SUM(revenue), 0) INTO total_rev
  FROM deals
  WHERE employee_id = employee_uuid
  AND status = 'closed'
  AND COALESCE(clawback, false) = false;

  SELECT COUNT(DISTINCT product_type) INTO prod_count
  FROM deals
  WHERE employee_id = employee_uuid
  AND status = 'closed'
  AND COALESCE(clawback, false) = false;

  IF emp_salary > 0 THEN
    x_mult := total_rev / emp_salary;
  ELSE
    x_mult := 0;
  END IF;

  is_eligible := prod_count >= 3 AND x_mult >= 2.1;

  IF is_eligible THEN
    SELECT share_percentage INTO share_pct
    FROM slab_rules
    WHERE x_min <= x_mult
    AND (x_max IS NULL OR x_mult <= x_max)
    ORDER BY x_min DESC
    LIMIT 1;

    incentive_amt := COALESCE(share_pct, 0) * total_rev;
  ELSE
    incentive_amt := 0;
  END IF;

  RETURN json_build_object(
    'total_revenue', ROUND(total_rev, 2),
    'x_multiple', ROUND(x_mult, 2),
    'incentive_amount', ROUND(incentive_amt, 2),
    'product_categories', prod_count,
    'is_eligible', is_eligible
  );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Add insert/update policies for incentives (admin only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'incentives' AND policyname = 'Admins can insert incentives'
  ) THEN
    CREATE POLICY "Admins can insert incentives"
      ON incentives FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'incentives' AND policyname = 'Admins can update incentives'
  ) THEN
    CREATE POLICY "Admins can update incentives"
      ON incentives FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'incentives' AND policyname = 'Admins can delete incentives'
  ) THEN
    CREATE POLICY "Admins can delete incentives"
      ON incentives FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      );
  END IF;
END $$;

-- Allow admin to update deals (for status changes, edits)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'deals' AND policyname = 'Admins can update any deal'
  ) THEN
    CREATE POLICY "Admins can update any deal"
      ON deals FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'deals' AND policyname = 'Admins can delete any deal'
  ) THEN
    CREATE POLICY "Admins can delete any deal"
      ON deals FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      );
  END IF;

  -- Employees can update their own deals
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'deals' AND policyname = 'Employees can update own deals'
  ) THEN
    CREATE POLICY "Employees can update own deals"
      ON deals FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.id = deals.employee_id
          AND e.auth_user_id = (SELECT auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.id = deals.employee_id
          AND e.auth_user_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;

-- Allow admin to manage crm_users (add/edit/deactivate employees)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_users' AND policyname = 'Admins can insert crm users'
  ) THEN
    CREATE POLICY "Admins can insert crm users"
      ON crm_users FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_users' AND policyname = 'Admins can update crm users'
  ) THEN
    CREATE POLICY "Admins can update crm users"
      ON crm_users FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm_users e
          WHERE e.auth_user_id = (SELECT auth.uid())
          AND e.role = 'admin'
        )
      );
  END IF;
END $$;
