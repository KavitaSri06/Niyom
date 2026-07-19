/*
  # Enterprise Lead Management — Phase 2 (workspace, SLA, documents)

  Additive only. Builds on Phase 1 (20260719120000). No existing table's behaviour
  changes. Adds:
    1. SLA auto-stamping triggers driven by engagement rows (communications /
       follow-ups / notes) so first_call_at, first_contact_at, last_activity_at and
       last_followup_at fill in without the app having to maintain them.
    2. A storage read policy so an employee can read the lead documents they upload
       under leads/<lead_code>/... (the existing crm-documents read policy only
       covers clients/<code>/... paths; admins already read everything).

  nw_mark_lead_converted (Phase 1) already handles the convert→onboard hand-off.
*/

-- ---------------------------------------------------------------------------
-- 1. SLA stamping
-- ---------------------------------------------------------------------------

-- Communications drive first_call_at / first_contact_at / last_activity_at.
-- "Contact made" = an outcome where the customer was actually reached.
CREATE OR REPLACE FUNCTION nw_lead_comm_sla() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE reached boolean;
BEGIN
  reached := NEW.outcome IN ('Connected','Interested','Not Interested','Meeting Fixed',
    'Need Information','Call Back Later','Follow-up Required','Converted');
  UPDATE nw_leads SET
    last_activity_at = now(),
    first_call_at    = CASE WHEN NEW.comm_type = 'call' THEN COALESCE(first_call_at, now()) ELSE first_call_at END,
    first_contact_at = CASE WHEN reached THEN COALESCE(first_contact_at, now()) ELSE first_contact_at END
  WHERE id = NEW.lead_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_lead_comm_sla ON nw_lead_communications;
CREATE TRIGGER trg_nw_lead_comm_sla AFTER INSERT ON nw_lead_communications
  FOR EACH ROW EXECUTE FUNCTION nw_lead_comm_sla();

-- Follow-ups drive last_followup_at + last_activity_at.
CREATE OR REPLACE FUNCTION nw_lead_followup_sla() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE nw_leads SET last_followup_at = now(), last_activity_at = now()
    WHERE id = NEW.lead_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_lead_followup_sla ON nw_lead_followups;
CREATE TRIGGER trg_nw_lead_followup_sla AFTER INSERT OR UPDATE ON nw_lead_followups
  FOR EACH ROW EXECUTE FUNCTION nw_lead_followup_sla();

-- Notes bump last_activity_at.
CREATE OR REPLACE FUNCTION nw_lead_note_sla() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE nw_leads SET last_activity_at = now() WHERE id = NEW.lead_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_lead_note_sla ON nw_lead_notes;
CREATE TRIGGER trg_nw_lead_note_sla AFTER INSERT ON nw_lead_notes
  FOR EACH ROW EXECUTE FUNCTION nw_lead_note_sla();

-- ---------------------------------------------------------------------------
-- 2. Storage: let employees read their own leads' documents (leads/<code>/...).
--    Admins already have full read via an existing policy; this only adds the
--    owner/creator case for lead paths. Multiple SELECT policies are OR-ed.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employee read access for lead documents" ON storage.objects;
CREATE POLICY "Employee read access for lead documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'crm-documents'
    AND EXISTS (
      SELECT 1 FROM nw_leads l
       WHERE ('leads/' || l.lead_code || '/') = substring(name, 1, length('leads/' || l.lead_code || '/'))
         AND (l.owner_employee_id = nw_current_employee_id()
              OR l.created_by_employee_id = nw_current_employee_id())
    )
  );
