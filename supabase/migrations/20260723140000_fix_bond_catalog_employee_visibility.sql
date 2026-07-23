/*
  # Fix: employees see an EMPTY bond list

  Symptom: admins see the bond database, employees see nothing.

  Cause: employees read the confidential-safe view `nw_bonds_catalog` (the base
  table `nw_bonds` is admin-only by RLS — see 20260720120000). For that to work,
  the view must run with the privileges of its OWNER (SECURITY DEFINER
  semantics), so it can read `nw_bonds` on the employee's behalf and return only
  the safe columns. If the view instead runs with `security_invoker = on`, it
  inherits the CALLER's RLS — `nw_bonds_select = nw_current_emp_is_admin()` — and
  returns ZERO rows to any non-admin. That is exactly the reported symptom.

  Fix: force definer semantics. The view owner equals the `nw_bonds` table owner
  (both created in the same migration) and `nw_bonds` is not FORCE ROW LEVEL
  SECURITY, so the owner bypasses RLS as the table owner. The staff gate stays
  intact: the view's own `WHERE EXISTS (active nw_employees for auth.uid())`
  still restricts rows to signed-in staff (and returns nothing to client-portal
  users, who have no nw_employees row).

  Idempotent and safe: no data change, only the view's execution context.
*/

ALTER VIEW nw_bonds_catalog SET (security_invoker = false);

-- Re-assert the grant in case it was ever dropped.
GRANT SELECT ON nw_bonds_catalog TO authenticated;
