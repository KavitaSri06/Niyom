/*
  # Fix deal confirmations DELETE policy

  ## Changes
  - Drop the admin-only DELETE policy
  - Recreate it to allow employees to delete their own deal confirmations
    (or admins to delete any)
*/

DROP POLICY IF EXISTS "Admins can delete deal confirmations" ON nw_deal_confirmations;

CREATE POLICY "Employees can delete own deal confirmations"
  ON nw_deal_confirmations
  FOR DELETE
  TO authenticated
  USING (
    (employee_id IN (
      SELECT id FROM nw_employees WHERE auth_user_id = auth.uid()
    ))
    OR
    (EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
        AND (e.role = 'admin' OR e.role = 'super_admin')
    ))
  );
