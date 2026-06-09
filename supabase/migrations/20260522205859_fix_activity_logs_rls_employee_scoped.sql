/*
  # Fix nw_activity_logs RLS — employees see only their own logs

  Previously all active employees could read ALL activity logs (global SELECT policy).
  This is a serious data leak — employee A can see employee B's client activity.

  Changes:
  - Drop the broad "Employees can view all activity logs" SELECT policy
  - Add two scoped SELECT policies:
      1. An employee sees only logs they created (employee_id = their id)
      2. Admins/super_admins see all logs
  - INSERT policy unchanged (each employee inserts their own logs)
*/

-- Drop the overly broad SELECT policy
DROP POLICY IF EXISTS "Employees can view all activity logs" ON nw_activity_logs;

-- Non-admin employees: see only their own activity logs
CREATE POLICY "Employees can view own activity logs"
  ON nw_activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
        AND e.status = 'active'
        AND e.role = 'employee'
        AND e.id = nw_activity_logs.employee_id
    )
  );

-- Admins can view all activity logs
CREATE POLICY "Admins can view all activity logs"
  ON nw_activity_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
        AND e.status = 'active'
        AND e.role IN ('admin', 'super_admin')
    )
  );
