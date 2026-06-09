/*
  # Fix RLS and Function Security Issues

  ## Summary
  This migration addresses multiple security vulnerabilities identified in the database:

  ## 1. RLS Policies with `WITH CHECK (true)` (unrestricted INSERT)

  Three audit/log tables had INSERT policies allowing any authenticated user to insert
  any row without restriction. These are replaced with ownership-scoped policies:

  - `nw_client_login_audit`: No user-owned column exists on this table (only client_id).
    The table is meant to be written by edge functions via service role. The authenticated
    policy is replaced with a service_role-only policy so direct API callers cannot insert.
  - `nw_document_logs`: Restrict inserts so `employee_id` matches auth.uid().
  - `nw_login_audit`: Restrict inserts so `employee_id` matches auth.uid().

  ## 2. SECURITY DEFINER Functions Accessible Without Restriction

  - `get_client_login_by_pan(text)`: Revoke from anon and authenticated — only called
    from edge functions using the service role key.
  - `nw2_generate_dsa_code(uuid)`: Revoke anon execute.
  - `nw2_generate_client_code(uuid)`: Revoke anon and PUBLIC execute.
  - `nw_is_active_employee(uuid)`: Revoke anon; keep authenticated (used in RLS policies).

  ## Security Changes
  - DROP and recreate the three unrestricted INSERT policies with proper ownership checks
  - REVOKE EXECUTE on sensitive SECURITY DEFINER functions from anon/PUBLIC where unneeded
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix nw_client_login_audit INSERT policy
--    Table has no user-ownership column — it's written by edge functions (service role).
--    Drop the over-broad authenticated policy; service role bypasses RLS anyway.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role can insert client login audit" ON public.nw_client_login_audit;

-- No authenticated INSERT policy needed: the edge function uses the service role key
-- which bypasses RLS. Direct authenticated users should not write audit rows.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fix nw_document_logs INSERT policy
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert logs" ON public.nw_document_logs;

CREATE POLICY "Employees can insert own document logs"
  ON public.nw_document_logs FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fix nw_login_audit INSERT policy
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated users can insert login events" ON public.nw_login_audit;

CREATE POLICY "Employees can insert own login audit events"
  ON public.nw_login_audit FOR INSERT
  TO authenticated
  WITH CHECK (employee_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Revoke get_client_login_by_pan from anon and authenticated
--    (called only from edge functions with service role key)
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.get_client_login_by_pan(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_login_by_pan(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_client_login_by_pan(text) FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Revoke nw2_generate_dsa_code from anon / PUBLIC
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.nw2_generate_dsa_code(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nw2_generate_dsa_code(uuid) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Revoke nw2_generate_client_code from anon / PUBLIC
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.nw2_generate_client_code(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nw2_generate_client_code(uuid) FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Revoke nw_is_active_employee from anon / PUBLIC; keep authenticated
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.nw_is_active_employee(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nw_is_active_employee(uuid) FROM anon;
-- Ensure authenticated retains access (used by RLS policies across the CRM)
GRANT EXECUTE ON FUNCTION public.nw_is_active_employee(uuid) TO authenticated;
