/*
  # Fix nw_is_active_employee EXECUTE permission for RLS

  ## Problem
  The migration 20260522214251 revoked EXECUTE on nw_is_active_employee from PUBLIC
  and authenticated. However, the nw_employees SELECT RLS policy uses this function
  in its USING clause. PostgreSQL requires the calling role (authenticated) to have
  EXECUTE permission on the function even when it is SECURITY DEFINER — the SECURITY
  DEFINER only controls what privileges the function body runs with, not whether the
  caller can invoke it. Without this grant, authenticated employees cannot SELECT
  from nw_employees, so all CRM logins fail.

  ## Fix
  Re-grant EXECUTE on nw_is_active_employee to authenticated so the RLS policy
  evaluates correctly. The function remains SECURITY DEFINER so its body bypasses
  RLS internally, preventing recursion.
*/

GRANT EXECUTE ON FUNCTION public.nw_is_active_employee(uuid) TO authenticated;
