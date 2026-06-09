/*
  # Fix CRM System Security and Performance Issues

  1. Performance Optimizations
    - Update all RLS policies to use subqueries for auth.uid() calls
    - This prevents re-evaluation of auth functions for each row
  
  2. Policy Consolidation
    - Combine multiple permissive policies into single policies
    - Improves query planning and performance
  
  3. Index Cleanup
    - Remove unused indexes that are not being utilized
    - Reduces maintenance overhead and storage

  ## Changes Made

  ### RLS Policy Updates
  - Replace `auth.uid()` with `(SELECT auth.uid())` in all policies
  - Consolidate SELECT policies for crm_users table
  - Consolidate SELECT and UPDATE policies for deals table

  ### Index Removal
  - Remove unused indexes on crm_users, deals, and investment_leads tables
  - Keep only foreign key indexes that are actively used
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON crm_users;
DROP POLICY IF EXISTS "Admins can view all users" ON crm_users;
DROP POLICY IF EXISTS "Users can update own profile" ON crm_users;
DROP POLICY IF EXISTS "Employees can view own deals" ON deals;
DROP POLICY IF EXISTS "Admins can view all deals" ON deals;
DROP POLICY IF EXISTS "Employees can insert own deals" ON deals;
DROP POLICY IF EXISTS "Employees can update own deals" ON deals;
DROP POLICY IF EXISTS "Admins can update all deals" ON deals;

-- Create optimized RLS policies for crm_users (consolidated)
CREATE POLICY "CRM users can view profiles"
  ON crm_users FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = auth_user_id
    OR
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.auth_user_id = (SELECT auth.uid())
      AND cu.role = 'admin'
    )
  );

CREATE POLICY "Users can update own profile"
  ON crm_users FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = auth_user_id)
  WITH CHECK ((SELECT auth.uid()) = auth_user_id);

-- Create optimized RLS policies for deals (consolidated)
CREATE POLICY "CRM users can view deals"
  ON deals FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.id = deals.employee_id
      AND cu.auth_user_id = (SELECT auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.auth_user_id = (SELECT auth.uid())
      AND cu.role = 'admin'
    )
  );

CREATE POLICY "Employees can insert own deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.id = deals.employee_id
      AND cu.auth_user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "CRM users can update deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.id = deals.employee_id
      AND cu.auth_user_id = (SELECT auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.auth_user_id = (SELECT auth.uid())
      AND cu.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.id = deals.employee_id
      AND cu.auth_user_id = (SELECT auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM crm_users cu
      WHERE cu.auth_user_id = (SELECT auth.uid())
      AND cu.role = 'admin'
    )
  );

-- Drop unused indexes
DROP INDEX IF EXISTS idx_crm_users_auth_user_id;
DROP INDEX IF EXISTS idx_crm_users_role;
DROP INDEX IF EXISTS idx_deals_employee_id;
DROP INDEX IF EXISTS idx_deals_product_type;
DROP INDEX IF EXISTS idx_deals_status;
DROP INDEX IF EXISTS idx_deals_created_at;
DROP INDEX IF EXISTS idx_deals_closed_at;
DROP INDEX IF EXISTS idx_investment_leads_product_type;
DROP INDEX IF EXISTS idx_investment_leads_status;
DROP INDEX IF EXISTS idx_investment_leads_created_at;
DROP INDEX IF EXISTS idx_orders_user_id;
DROP INDEX IF EXISTS idx_share_news_bond_id;
DROP INDEX IF EXISTS idx_share_news_share_id;

-- Keep only essential foreign key indexes for referential integrity
CREATE INDEX IF NOT EXISTS idx_deals_employee_id_fk ON deals(employee_id);
CREATE INDEX IF NOT EXISTS idx_crm_users_auth_user_id_fk ON crm_users(auth_user_id);