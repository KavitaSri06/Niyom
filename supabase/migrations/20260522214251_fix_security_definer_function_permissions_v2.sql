/*
  # Fix SECURITY DEFINER Function Permissions (v2)

  ## Summary
  The previous migration (20260515075229) revoked EXECUTE from anon and authenticated roles,
  but PostgreSQL also grants EXECUTE to PUBLIC by default. Since anon and authenticated
  inherit from PUBLIC, the REVOKE must also target PUBLIC to be effective.

  This migration:
  1. Revokes EXECUTE from PUBLIC on all internal SECURITY DEFINER functions
  2. Re-grants EXECUTE only where legitimately needed (nw2_generate_client_code for authenticated CRM employees)
  3. Covers three functions missed in the previous migration: is_crm_admin, nw2_generate_client_code, nw_is_active_employee

  ## Functions locked down (no public access)
  - calculate_monthly_incentive — internal incentive engine, called by store_monthly_incentive only
  - check_lead_rate_limit — trigger function, fires automatically on INSERT
  - delete_old_news — cron job, runs via pg_cron scheduler only
  - get_employee_metrics — legacy pages; access revoked (pages use direct queries now)
  - is_crm_admin — RLS helper, called only by RLS policies
  - nw_is_active_employee — RLS helper, called only by RLS policies
  - store_monthly_incentive — incentive storage, called internally only
  - trigger_price_update — cron/service-role function, not for client use

  ## Functions with restricted access
  - nw2_generate_client_code — needed by authenticated CRM employees to generate client codes;
    revoked from anon and PUBLIC, re-granted only to authenticated role
*/

-- =====================================================================
-- STEP 1: Revoke from PUBLIC (this also covers anon + authenticated
--         since they inherit EXECUTE from PUBLIC by default)
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.calculate_monthly_incentive(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_lead_rate_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_old_news() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_employee_metrics(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_crm_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nw2_generate_client_code(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.nw_is_active_employee(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.store_monthly_incentive(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trigger_price_update() FROM PUBLIC;

-- Also explicitly revoke from anon and authenticated for defence in depth
REVOKE EXECUTE ON FUNCTION public.calculate_monthly_incentive(uuid, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_lead_rate_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_old_news() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_employee_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_crm_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nw2_generate_client_code(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.nw_is_active_employee(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_monthly_incentive(uuid, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_price_update() FROM anon, authenticated;

-- =====================================================================
-- STEP 2: Re-grant nw2_generate_client_code to authenticated only
--         (CRM employees call this via RPC to generate client codes)
-- =====================================================================
GRANT EXECUTE ON FUNCTION public.nw2_generate_client_code(uuid) TO authenticated;
