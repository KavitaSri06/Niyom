/*
  # Lead Management — Phase 3: admin merge

  nw_merge_leads(p_primary, p_duplicate): fold a duplicate lead into a surviving
  ("primary") lead. All child history — activities, notes, follow-ups,
  communications, documents, assignments, status history, field-level audit — is
  re-pointed to the primary so nothing is lost. The duplicate is archived + locked
  (kept as a tombstone so its lead_code is never reused), and any open duplicate
  requests touching either lead are closed. Admin only.

  Hardened like the other lead RPCs: SECURITY DEFINER + internal admin guard +
  EXECUTE revoked from PUBLIC (only `authenticated` keeps it).
*/

CREATE OR REPLACE FUNCTION nw_merge_leads(p_primary uuid, p_duplicate uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid := nw_current_employee_id();
  dup_code text;
  pri_code text;
BEGIN
  IF NOT nw_current_emp_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can merge leads.';
  END IF;
  IF p_primary = p_duplicate THEN
    RAISE EXCEPTION 'Cannot merge a lead into itself.';
  END IF;
  SELECT lead_code INTO dup_code FROM nw_leads WHERE id = p_duplicate;
  SELECT lead_code INTO pri_code FROM nw_leads WHERE id = p_primary;
  IF dup_code IS NULL OR pri_code IS NULL THEN
    RAISE EXCEPTION 'Both leads must exist.';
  END IF;

  -- Re-point every child row from duplicate -> primary.
  UPDATE nw_lead_activities     SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_lead_notes          SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_lead_followups      SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_lead_communications SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_lead_documents      SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_lead_assignments    SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_lead_status_history SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_lead_audit          SET lead_id = p_primary WHERE lead_id = p_duplicate;
  UPDATE nw_alerts              SET lead_id = p_primary WHERE lead_id = p_duplicate;

  -- Archive + lock the duplicate (kept as a tombstone).
  UPDATE nw_leads
     SET is_archived = true, is_locked = true,
         remarks = TRIM(BOTH ' ' FROM COALESCE(remarks,'') || ' [merged into ' || pri_code || ']')
   WHERE id = p_duplicate;

  -- Close any duplicate-review requests touching either lead.
  UPDATE nw_lead_duplicate_requests
     SET status = 'reviewed', reviewed_by = emp
   WHERE status = 'pending' AND existing_lead_id IN (p_primary, p_duplicate);

  -- Audit the merge on the primary.
  INSERT INTO nw_lead_activities(lead_id, employee_id, action, description)
    VALUES (p_primary, emp, 'Merged', 'Merged duplicate lead ' || dup_code || ' into this lead');
END;
$$;

REVOKE EXECUTE ON FUNCTION nw_merge_leads(uuid,uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nw_merge_leads(uuid,uuid) TO authenticated;
