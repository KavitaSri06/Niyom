/*
  # Lead Management — RPC hardening (security)

  Postgres grants EXECUTE on new functions to PUBLIC by default, and Supabase's
  `anon` and client-portal `authenticated` (client) sessions inherit that. The
  lead RPCs are SECURITY DEFINER (they bypass RLS by design), so left open they
  would let a non-employee enumerate or mutate lead data. This migration:

    1. REVOKEs EXECUTE FROM PUBLIC on every lead RPC, leaving only the explicit
       GRANT TO authenticated from the earlier migrations.
    2. Adds an *employee* gate inside the definer functions (a logged-in client
       has role `authenticated` but no nw_employees row, so nw_current_employee_id()
       is NULL for them) and a per-lead permission check on conversion.

  Idempotent; safe to re-run.
*/

-- 1. Lock execution to authenticated only (removes the implicit PUBLIC grant).
REVOKE EXECUTE ON FUNCTION nw_next_lead_code()                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_lead_score_for(numeric,numeric,text,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_assign_leads(uuid[],uuid,text)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_mark_lead_converted(uuid,uuid)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_check_lead_duplicate(text,text,text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_request_duplicate_review(uuid,jsonb)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_can_see_lead(uuid)                      FROM PUBLIC;

-- 2a. Duplicate scan — employees only (clients get an empty result, never data).
CREATE OR REPLACE FUNCTION nw_check_lead_duplicate(
  p_mobile text DEFAULT '', p_email text DEFAULT '', p_pan text DEFAULT '',
  p_exclude_lead_id uuid DEFAULT NULL
) RETURNS TABLE (
  entity text, entity_id uuid, matched_on text, display_name text,
  owner_name text, status text, created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'lead', l.id,
         CASE WHEN p_mobile <> '' AND l.mobile = p_mobile THEN 'mobile'
              WHEN p_email  <> '' AND lower(l.email) = lower(p_email) THEN 'email'
              ELSE 'pan' END,
         l.lead_name, e.full_name, l.status, l.created_at
    FROM nw_leads l
    LEFT JOIN nw_employees e ON e.id = l.owner_employee_id
   WHERE nw_current_employee_id() IS NOT NULL
     AND (p_exclude_lead_id IS NULL OR l.id <> p_exclude_lead_id)
     AND ( (p_mobile <> '' AND l.mobile = p_mobile)
        OR (p_email  <> '' AND lower(l.email) = lower(p_email))
        OR (p_pan    <> '' AND upper(l.pan)   = upper(p_pan)) )
  UNION ALL
  SELECT 'client', c.id,
         CASE WHEN p_mobile <> '' AND c.phone = p_mobile THEN 'mobile'
              WHEN p_email  <> '' AND lower(c.email) = lower(p_email) THEN 'email'
              ELSE 'pan' END,
         c.full_name, e.full_name, c.verification_status, c.created_at
    FROM nw_clients c
    LEFT JOIN nw_employees e ON e.id = c.employee_id
   WHERE nw_current_employee_id() IS NOT NULL
     AND ( (p_mobile <> '' AND c.phone = p_mobile)
        OR (p_email  <> '' AND lower(c.email) = lower(p_email))
        OR (p_pan    <> '' AND upper(c.pan)   = upper(p_pan)) )
  LIMIT 10;
$$;
REVOKE EXECUTE ON FUNCTION nw_check_lead_duplicate(text,text,text,uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nw_check_lead_duplicate(text,text,text,uuid) TO authenticated;

-- 2b. Conversion — only an admin or the lead's owner may convert/lock it.
CREATE OR REPLACE FUNCTION nw_mark_lead_converted(
  p_lead_id uuid, p_client_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp uuid := nw_current_employee_id();
BEGIN
  IF NOT (nw_current_emp_is_admin() OR EXISTS (
            SELECT 1 FROM nw_leads WHERE id = p_lead_id AND owner_employee_id = emp)) THEN
    RAISE EXCEPTION 'Not authorized to convert this lead.';
  END IF;
  UPDATE nw_leads
    SET status = 'Closed - Converted', converted_client_id = p_client_id,
        converted_at = now(), is_archived = true, is_locked = true
    WHERE id = p_lead_id;
  INSERT INTO nw_lead_activities(lead_id, employee_id, action, description)
    VALUES (p_lead_id, emp, 'Converted', 'Lead converted to client and onboarded');
END;
$$;
REVOKE EXECUTE ON FUNCTION nw_mark_lead_converted(uuid,uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nw_mark_lead_converted(uuid,uuid) TO authenticated;

-- 2c. Duplicate-review request — employees only.
CREATE OR REPLACE FUNCTION nw_request_duplicate_review(
  p_existing_lead_id uuid, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid := nw_current_employee_id();
  emp_name text;
  a record;
BEGIN
  IF emp IS NULL THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  SELECT full_name INTO emp_name FROM nw_employees WHERE id = emp;
  INSERT INTO nw_lead_duplicate_requests(existing_lead_id, requested_by_employee_id, payload)
    VALUES (p_existing_lead_id, emp, COALESCE(p_payload, '{}'::jsonb));
  FOR a IN SELECT id FROM nw_employees WHERE status = 'active' AND role IN ('admin','super_admin') LOOP
    INSERT INTO nw_alerts(employee_id, title, message, category, lead_id, action_url)
      VALUES (a.id, 'Duplicate Lead Request',
              COALESCE(emp_name,'An employee') || ' flagged a possible duplicate lead for review',
              'duplicate_request', p_existing_lead_id, '/crm/leads');
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION nw_request_duplicate_review(uuid,jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nw_request_duplicate_review(uuid,jsonb) TO authenticated;
