/*
  # Fix infinite recursion in crm_users RLS policies

  The existing policies check admin role by querying crm_users from within
  crm_users policies, causing infinite recursion. This fix:

  1. Creates a security definer function `is_crm_admin()` that checks the
     caller's role without triggering RLS (bypasses it via SECURITY DEFINER).
  2. Drops and recreates all crm_users policies to use this function instead
     of inline subqueries back to crm_users.
*/

-- Helper function that checks if the current user is a CRM admin.
-- SECURITY DEFINER bypasses RLS so it won't recurse.
CREATE OR REPLACE FUNCTION is_crm_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM crm_users
    WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$$;

-- Drop old policies
DROP POLICY IF EXISTS "CRM users can view profiles" ON crm_users;
DROP POLICY IF EXISTS "Admins can insert crm users" ON crm_users;
DROP POLICY IF EXISTS "Admins can update crm users" ON crm_users;
DROP POLICY IF EXISTS "Users can update own profile" ON crm_users;

-- SELECT: own row OR admin
CREATE POLICY "crm_users select own or admin"
  ON crm_users FOR SELECT
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR is_crm_admin()
  );

-- INSERT: only admins
CREATE POLICY "crm_users insert admin only"
  ON crm_users FOR INSERT
  TO authenticated
  WITH CHECK (is_crm_admin());

-- UPDATE own row
CREATE POLICY "crm_users update own"
  ON crm_users FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- UPDATE by admin
CREATE POLICY "crm_users update by admin"
  ON crm_users FOR UPDATE
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());
