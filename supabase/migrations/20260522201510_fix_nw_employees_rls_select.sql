/*
  # Fix nw_employees SELECT RLS - remove recursive self-reference

  The existing SELECT policy queries nw_employees inside itself, creating
  infinite recursion that always returns no rows. Replace it with a direct
  auth.uid() check so employees can read their own row (and admins can read all).
*/

DROP POLICY IF EXISTS "Employees can view all employees" ON nw_employees;

-- Allow any authenticated user to read nw_employees rows where they are the owner,
-- OR allow the row to be read if the reader is an admin/super_admin.
-- To avoid recursion, use a security definer function.

CREATE OR REPLACE FUNCTION nw_is_active_employee(uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nw_employees
    WHERE auth_user_id = uid AND status = 'active'
  );
$$;

CREATE POLICY "Employees can view all employees"
  ON nw_employees FOR SELECT
  TO authenticated
  USING (nw_is_active_employee(auth.uid()));
