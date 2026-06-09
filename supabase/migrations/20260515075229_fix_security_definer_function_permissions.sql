/*
  # Fix SECURITY DEFINER Function Permissions

  ## Summary
  Revokes EXECUTE on SECURITY DEFINER functions from anon and authenticated roles
  to prevent unauthorized RPC access via the REST API.

  ## Functions Fixed
  - public.calculate_monthly_incentive(emp_id uuid, calc_month date)
  - public.check_lead_rate_limit()
  - public.delete_old_news()
  - public.get_employee_metrics(employee_uuid uuid)
  - public.store_monthly_incentive(emp_id uuid, calc_month date)
  - public.trigger_price_update()

  ## Security Changes
  - Revoke EXECUTE from anon role on all six functions
  - Revoke EXECUTE from authenticated role on all six functions
  - These functions are only intended for internal/service-role use
*/

-- calculate_monthly_incentive
REVOKE EXECUTE ON FUNCTION public.calculate_monthly_incentive(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_monthly_incentive(uuid, date) FROM authenticated;

-- check_lead_rate_limit
REVOKE EXECUTE ON FUNCTION public.check_lead_rate_limit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_lead_rate_limit() FROM authenticated;

-- delete_old_news
REVOKE EXECUTE ON FUNCTION public.delete_old_news() FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_old_news() FROM authenticated;

-- get_employee_metrics
REVOKE EXECUTE ON FUNCTION public.get_employee_metrics(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_employee_metrics(uuid) FROM authenticated;

-- store_monthly_incentive
REVOKE EXECUTE ON FUNCTION public.store_monthly_incentive(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.store_monthly_incentive(uuid, date) FROM authenticated;

-- trigger_price_update
REVOKE EXECUTE ON FUNCTION public.trigger_price_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_price_update() FROM authenticated;
