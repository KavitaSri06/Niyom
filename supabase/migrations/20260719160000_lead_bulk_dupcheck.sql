/*
  # Lead Management — Phase 3: bulk duplicate check for import

  nw_check_lead_duplicates_bulk: given arrays of mobiles/emails/pans from an
  uploaded sheet, return which values already exist anywhere in the CRM (leads
  OR clients). One round-trip instead of one RPC per row, so a 5,000-row import
  dedupes fast. Employees only (clients get nothing); hardened like the rest.
*/

CREATE OR REPLACE FUNCTION nw_check_lead_duplicates_bulk(
  p_mobiles text[] DEFAULT '{}', p_emails text[] DEFAULT '{}', p_pans text[] DEFAULT '{}'
) RETURNS TABLE (kind text, value text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'mobile', m FROM (
    SELECT mobile m FROM nw_leads WHERE nw_current_employee_id() IS NOT NULL AND mobile = ANY(p_mobiles)
    UNION SELECT phone FROM nw_clients WHERE nw_current_employee_id() IS NOT NULL AND phone = ANY(p_mobiles)
  ) x
  UNION ALL
  SELECT 'email', e FROM (
    SELECT lower(email) e FROM nw_leads WHERE nw_current_employee_id() IS NOT NULL AND lower(email) = ANY(SELECT lower(unnest(p_emails)))
    UNION SELECT lower(email) FROM nw_clients WHERE nw_current_employee_id() IS NOT NULL AND lower(email) = ANY(SELECT lower(unnest(p_emails)))
  ) y
  UNION ALL
  SELECT 'pan', p FROM (
    SELECT upper(pan) p FROM nw_leads WHERE nw_current_employee_id() IS NOT NULL AND upper(pan) = ANY(SELECT upper(unnest(p_pans)))
    UNION SELECT upper(pan) FROM nw_clients WHERE nw_current_employee_id() IS NOT NULL AND upper(pan) = ANY(SELECT upper(unnest(p_pans)))
  ) z;
$$;

REVOKE EXECUTE ON FUNCTION nw_check_lead_duplicates_bulk(text[],text[],text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nw_check_lead_duplicates_bulk(text[],text[],text[]) TO authenticated;
