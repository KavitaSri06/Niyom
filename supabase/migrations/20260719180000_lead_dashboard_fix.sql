/*
  # Lead Management — dashboard RPC fix

  nw_lead_dashboard()'s daily_calls series used generate_series(date, date,
  interval), which can resolve ambiguously between the timestamp/timestamptz
  overloads. Replaced with an unambiguous integer series (today - g). Everything
  else is identical to 20260719170000. CREATE OR REPLACE — no behaviour change
  beyond the fix.
*/

CREATE OR REPLACE FUNCTION nw_lead_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := nw_current_employee_id();
  adm boolean := nw_current_emp_is_admin();
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  result jsonb;
BEGIN
  IF me IS NULL THEN RETURN '{}'::jsonb; END IF;

  WITH scoped AS (
    SELECT * FROM nw_leads
     WHERE adm OR owner_employee_id = me OR created_by_employee_id = me
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE NOT is_archived)                              AS active,
      count(*) FILTER (WHERE created_at::date = today)                     AS today,
      count(*) FILTER (WHERE owner_employee_id IS NOT NULL AND NOT is_archived) AS assigned,
      count(*) FILTER (WHERE status = 'Interested')                        AS interested,
      count(*) FILTER (WHERE status = 'Closed - Converted')               AS converted,
      count(*) FILTER (WHERE status IN ('Lost','Not Interested','Closed - Rejected')) AS lost,
      count(*)                                                             AS all_leads
    FROM scoped
  ),
  fu AS (
    SELECT
      count(*) FILTER (WHERE f.status = 'pending' AND (f.scheduled_at AT TIME ZONE 'Asia/Kolkata')::date = today) AS today_cnt,
      count(*) FILTER (WHERE f.status = 'pending' AND f.scheduled_at < now())  AS overdue_cnt,
      count(*) FILTER (WHERE f.status = 'missed')                              AS missed_cnt
    FROM nw_lead_followups f WHERE f.lead_id IN (SELECT id FROM scoped)
  ),
  calls AS (
    SELECT count(*) FILTER (WHERE c.comm_type = 'call' AND c.created_at::date = today) AS today_calls
    FROM nw_lead_communications c WHERE c.lead_id IN (SELECT id FROM scoped)
  )
  SELECT jsonb_build_object(
    'scope', CASE WHEN adm THEN 'admin' ELSE 'employee' END,
    'totals', (SELECT jsonb_build_object(
        'active', active, 'today', today, 'assigned', assigned, 'interested', interested,
        'converted', converted, 'lost', lost, 'all', all_leads,
        'conversion_rate', CASE WHEN all_leads > 0 THEN round(converted::numeric*100/all_leads,1) ELSE 0 END
      ) FROM totals),
    'followups', (SELECT jsonb_build_object('today', today_cnt, 'overdue', overdue_cnt, 'missed', missed_cnt) FROM fu),
    'today_calls', (SELECT today_calls FROM calls),
    'by_status', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', status, 'count', c) ORDER BY c DESC), '[]')
                    FROM (SELECT status, count(*) c FROM scoped WHERE NOT is_archived GROUP BY status) s),
    'by_source', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', COALESCE(NULLIF(lead_source,''),'Unknown'), 'count', c) ORDER BY c DESC), '[]')
                    FROM (SELECT lead_source, count(*) c FROM scoped GROUP BY lead_source ORDER BY count(*) DESC LIMIT 8) s),
    'by_product', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', COALESCE(NULLIF(interested_product,''),'Unknown'), 'count', c) ORDER BY c DESC), '[]')
                    FROM (SELECT interested_product, count(*) c FROM scoped GROUP BY interested_product ORDER BY count(*) DESC LIMIT 8) s),
    'by_priority', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', priority, 'count', c)), '[]')
                    FROM (SELECT priority, count(*) c FROM scoped GROUP BY priority) s),
    'by_origin', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', lead_origin, 'count', c)), '[]')
                    FROM (SELECT lead_origin, count(*) c FROM scoped GROUP BY lead_origin) s),
    'funnel', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', lbl, 'count', c) ORDER BY ord), '[]')
                 FROM (
                   SELECT 1 ord, 'New/Assigned' lbl, count(*) FILTER (WHERE status IN ('New','Assigned')) c FROM scoped
                   UNION ALL SELECT 2, 'Contacted', count(*) FILTER (WHERE status IN ('Attempted','Connected','Follow-up','Call Back Later')) FROM scoped
                   UNION ALL SELECT 3, 'Interested', count(*) FILTER (WHERE status IN ('Interested','Meeting Scheduled')) FROM scoped
                   UNION ALL SELECT 4, 'In Process', count(*) FILTER (WHERE status IN ('Documentation Pending','KYC Pending','Investment Under Process','Waiting for Client')) FROM scoped
                   UNION ALL SELECT 5, 'Converted', count(*) FILTER (WHERE status = 'Closed - Converted') FROM scoped
                 ) s),
    'monthly_trend', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', to_char(m,'Mon'), 'count', COALESCE(c,0)) ORDER BY m), '[]')
                        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
                        LEFT JOIN (SELECT date_trunc('month', created_at) mm, count(*) c FROM scoped GROUP BY 1) t ON t.mm = m),
    'self_vs_assigned', (SELECT jsonb_build_object(
        'self', count(*) FILTER (WHERE lead_origin = 'employee_manual'),
        'assigned', count(*) FILTER (WHERE lead_origin IN ('admin_manual','admin_upload'))) FROM scoped),
    'daily_calls', (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', to_char(dd,'Dy'), 'count', COALESCE(c,0)) ORDER BY dd), '[]')
                      FROM (SELECT (today - g)::date dd FROM generate_series(0,6) g) days
                      LEFT JOIN (SELECT c.created_at::date cdate, count(*) c FROM nw_lead_communications c
                                  WHERE c.comm_type='call' AND c.lead_id IN (SELECT id FROM scoped) GROUP BY 1) t ON t.cdate = days.dd),
    'by_employee', (CASE WHEN adm THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('label', name, 'total', tot, 'converted', conv) ORDER BY tot DESC), '[]')
          FROM (SELECT e.full_name name, count(l.*) tot, count(*) FILTER (WHERE l.status='Closed - Converted') conv
                  FROM nw_employees e JOIN nw_leads l ON l.owner_employee_id = e.id
                 GROUP BY e.full_name ORDER BY count(l.*) DESC LIMIT 10) s
      ) ELSE '[]'::jsonb END)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION nw_lead_dashboard() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nw_lead_dashboard() TO authenticated;
