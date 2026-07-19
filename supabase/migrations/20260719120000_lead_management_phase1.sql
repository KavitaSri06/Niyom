/*
  # Enterprise Lead Management — Phase 1 (foundation)

  Adds a complete, normalized lead pipeline alongside the existing CRM. NOTHING in
  this migration alters existing tables' behaviour: the only change to an existing
  table is three NULLABLE, additive columns on nw_alerts (so the existing bell can
  also surface lead notifications) — every existing alert insert keeps working.

  Design notes
  ------------
  * Branch-agnostic by request: no branch table/column/logic anywhere. Auto-captured
    metadata is limited to created_by, owner, created_at, updated_at, lead_origin.
    Schema stays clean so a branch dimension can be added later without refactor.
  * Reuses the project's SECURITY DEFINER RLS helpers nw_current_employee_id() and
    nw_current_emp_is_admin() (see 20260701120000_dsa_ownership_forward_align.sql).
  * owner_employee_id NULL  ==>  the lead sits in the ADMIN LEAD POOL (unassigned);
    only admins can see/act on pool leads until distributed.
  * Lead codes come from a dedicated SEQUENCE (race-safe under bulk import at 100k+).
  * Field-level immutable audit trail via an AFTER UPDATE trigger (old/new/user/time).
  * Everything is idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded policies).
*/

-- Trigram search for fast ILIKE on name/mobile/email/city at scale.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 0. Lead code sequence + generator
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS nw_lead_code_seq;

CREATE OR REPLACE FUNCTION nw_next_lead_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'LEAD-' || LPAD(nextval('nw_lead_code_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- 1. Core table: nw_leads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nw_leads (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_code             text NOT NULL UNIQUE DEFAULT nw_next_lead_code(),

  -- Identity / entry fields
  lead_name             text NOT NULL,
  mobile                text NOT NULL DEFAULT '',
  alternate_number      text NOT NULL DEFAULT '',
  email                 text NOT NULL DEFAULT '',
  pan                   text NOT NULL DEFAULT '',           -- optional; '' when unknown
  address               text NOT NULL DEFAULT '',
  city                  text NOT NULL DEFAULT '',
  state                 text NOT NULL DEFAULT '',
  occupation            text NOT NULL DEFAULT '',
  company_name          text NOT NULL DEFAULT '',
  age                   int,
  annual_income         numeric,
  investment_capacity   numeric,
  interested_product    text NOT NULL DEFAULT '',
  lead_source           text NOT NULL DEFAULT '',
  campaign              text NOT NULL DEFAULT '',
  priority              text NOT NULL DEFAULT 'medium'
                          CHECK (priority IN ('low','medium','high','urgent')),
  remarks               text NOT NULL DEFAULT '',

  -- Workflow
  status                text NOT NULL DEFAULT 'New' CHECK (status IN (
                          'New','Assigned','Attempted','Connected','Interested',
                          'Meeting Scheduled','Follow-up','Documentation Pending',
                          'KYC Pending','Investment Under Process','Waiting for Client',
                          'No Response','Call Back Later','Wrong Number','Not Interested',
                          'Lost','Closed - Converted','Closed - Rejected')),
  lead_origin           text NOT NULL CHECK (lead_origin IN
                          ('admin_upload','admin_manual','employee_manual')),
  owner_employee_id     uuid REFERENCES nw_employees(id) ON DELETE SET NULL,  -- NULL = admin pool
  created_by_employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  is_locked             boolean NOT NULL DEFAULT false,   -- admin freeze
  is_archived           boolean NOT NULL DEFAULT false,
  converted_client_id   uuid REFERENCES nw_clients(id) ON DELETE SET NULL,

  -- Scoring (cached; recomputed by trigger)
  lead_score            int NOT NULL DEFAULT 0,
  score_band            text NOT NULL DEFAULT 'Cold' CHECK (score_band IN ('Hot','Warm','Cold')),

  -- SLA timestamps
  assigned_at           timestamptz,
  first_call_at         timestamptz,
  first_contact_at      timestamptz,
  last_activity_at      timestamptz,
  last_followup_at      timestamptz,
  converted_at          timestamptz,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Indexes tuned for filtering, ownership scoping, and search at 100k+ rows.
CREATE INDEX IF NOT EXISTS idx_nw_leads_owner       ON nw_leads(owner_employee_id);
CREATE INDEX IF NOT EXISTS idx_nw_leads_created_by  ON nw_leads(created_by_employee_id);
CREATE INDEX IF NOT EXISTS idx_nw_leads_status      ON nw_leads(status);
CREATE INDEX IF NOT EXISTS idx_nw_leads_priority    ON nw_leads(priority);
CREATE INDEX IF NOT EXISTS idx_nw_leads_origin      ON nw_leads(lead_origin);
CREATE INDEX IF NOT EXISTS idx_nw_leads_created_at  ON nw_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nw_leads_archived    ON nw_leads(is_archived);
CREATE INDEX IF NOT EXISTS idx_nw_leads_score       ON nw_leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_nw_leads_converted   ON nw_leads(converted_client_id);
-- Admin pool: partial index over unassigned, non-archived leads.
CREATE INDEX IF NOT EXISTS idx_nw_leads_pool
  ON nw_leads(created_at DESC) WHERE owner_employee_id IS NULL AND is_archived = false;
-- Duplicate lookups.
CREATE INDEX IF NOT EXISTS idx_nw_leads_mobile      ON nw_leads(mobile) WHERE mobile <> '';
CREATE INDEX IF NOT EXISTS idx_nw_leads_email       ON nw_leads(lower(email)) WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_nw_leads_pan         ON nw_leads(upper(pan)) WHERE pan <> '';
-- Trigram search.
CREATE INDEX IF NOT EXISTS idx_nw_leads_name_trgm   ON nw_leads USING gin (lead_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nw_leads_mobile_trgm ON nw_leads USING gin (mobile gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nw_leads_email_trgm  ON nw_leads USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nw_leads_city_trgm   ON nw_leads USING gin (city gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Child tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nw_lead_activities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  employee_id  uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  action       text NOT NULL,
  description  text NOT NULL DEFAULT '',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_activities_lead ON nw_lead_activities(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nw_lead_notes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  employee_id    uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  status_at_time text NOT NULL DEFAULT '',
  remarks        text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_notes_lead ON nw_lead_notes(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nw_lead_followups (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  employee_id      uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  scheduled_at     timestamptz NOT NULL,
  priority         text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  purpose          text NOT NULL DEFAULT '',
  mode             text NOT NULL DEFAULT 'phone'
                     CHECK (mode IN ('phone','whatsapp','office_visit','zoom','google_meet')),
  reminder_minutes int NOT NULL DEFAULT 30,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','completed','missed','cancelled')),
  completed_at     timestamptz,
  outcome          text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_followups_lead      ON nw_lead_followups(lead_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_nw_lead_followups_due
  ON nw_lead_followups(scheduled_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_nw_lead_followups_employee  ON nw_lead_followups(employee_id, scheduled_at);

-- Click-to-call-ready communication log (duration/history extensible later).
CREATE TABLE IF NOT EXISTS nw_lead_communications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  employee_id      uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  comm_type        text NOT NULL DEFAULT 'call' CHECK (comm_type IN ('call','whatsapp','email')),
  outcome          text NOT NULL DEFAULT '',
  remarks          text NOT NULL DEFAULT '',
  duration_seconds int,                       -- reserved for future click-to-call
  direction        text NOT NULL DEFAULT 'outbound' CHECK (direction IN ('outbound','inbound')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_comms_lead ON nw_lead_communications(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nw_lead_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  employee_id      uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  doc_type         text NOT NULL DEFAULT 'Other',
  file_name        text NOT NULL,
  file_path        text NOT NULL,
  file_size        bigint NOT NULL DEFAULT 0,
  mime_type        text NOT NULL DEFAULT '',
  uploaded_by_name text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_documents_lead ON nw_lead_documents(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nw_lead_assignments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id                uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  from_employee_id       uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  to_employee_id         uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  assigned_by_employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  reason                 text NOT NULL DEFAULT '',
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_assignments_lead ON nw_lead_assignments(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nw_lead_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  from_status text NOT NULL DEFAULT '',
  to_status   text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_status_history_lead ON nw_lead_status_history(lead_id, created_at DESC);

-- Immutable field-level audit.
CREATE TABLE IF NOT EXISTS nw_lead_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES nw_leads(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  field_name  text NOT NULL,
  old_value   text,
  new_value   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_audit_lead ON nw_lead_audit(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nw_lead_saved_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES nw_employees(id) ON DELETE CASCADE,
  name        text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_saved_views_emp ON nw_lead_saved_views(employee_id);

CREATE TABLE IF NOT EXISTS nw_lead_duplicate_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  existing_lead_id       uuid REFERENCES nw_leads(id) ON DELETE SET NULL,
  requested_by_employee_id uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  payload                jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                 text NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','reviewed','dismissed')),
  reviewed_by            uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_lead_dup_requests_status ON nw_lead_duplicate_requests(status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. nw_alerts additive columns (non-breaking) — lets the existing bell carry
--    lead notifications. All existing inserts leave these NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE nw_alerts ADD COLUMN IF NOT EXISTS lead_id    uuid REFERENCES nw_leads(id) ON DELETE CASCADE;
ALTER TABLE nw_alerts ADD COLUMN IF NOT EXISTS category   text;
ALTER TABLE nw_alerts ADD COLUMN IF NOT EXISTS action_url text;

-- ---------------------------------------------------------------------------
-- 4. Scoring — cached on write. Static-field model now (potential + priority +
--    status weighting); engagement signals fold in during later phases.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_lead_score_for(
  p_investment_capacity numeric, p_annual_income numeric,
  p_priority text, p_status text
) RETURNS int LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE s int := 0; cap numeric := COALESCE(p_investment_capacity, p_annual_income, 0);
BEGIN
  -- Investment potential (0-45)
  IF    cap >= 10000000 THEN s := s + 45;
  ELSIF cap >=  5000000 THEN s := s + 38;
  ELSIF cap >=  2500000 THEN s := s + 30;
  ELSIF cap >=  1000000 THEN s := s + 22;
  ELSIF cap >=   500000 THEN s := s + 14;
  ELSIF cap >        0  THEN s := s + 7;
  END IF;
  -- Priority (0-20)
  s := s + CASE p_priority WHEN 'urgent' THEN 20 WHEN 'high' THEN 15 WHEN 'medium' THEN 8 ELSE 3 END;
  -- Pipeline stage weighting (0-35)
  s := s + CASE p_status
    WHEN 'Closed - Converted' THEN 35 WHEN 'Investment Under Process' THEN 32
    WHEN 'KYC Pending' THEN 30 WHEN 'Documentation Pending' THEN 28
    WHEN 'Meeting Scheduled' THEN 26 WHEN 'Interested' THEN 24
    WHEN 'Connected' THEN 18 WHEN 'Follow-up' THEN 16 WHEN 'Call Back Later' THEN 14
    WHEN 'Waiting for Client' THEN 14 WHEN 'Attempted' THEN 8 WHEN 'Assigned' THEN 6
    WHEN 'New' THEN 4 WHEN 'No Response' THEN 2
    ELSE 0  -- Wrong Number / Not Interested / Lost / Closed - Rejected
  END;
  RETURN LEAST(s, 100);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

-- 5a. Ownership / lock guard for non-admins (BEFORE UPDATE).
CREATE OR REPLACE FUNCTION nw_leads_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF nw_current_emp_is_admin() THEN RETURN NEW; END IF;
  -- Non-admin: cannot edit a locked lead, and cannot change ownership/origin/lock.
  IF OLD.is_locked THEN
    RAISE EXCEPTION 'This lead is locked and can only be edited by an administrator.';
  END IF;
  IF NEW.owner_employee_id IS DISTINCT FROM OLD.owner_employee_id
     OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
     OR NEW.lead_origin IS DISTINCT FROM OLD.lead_origin
     OR NEW.is_locked IS DISTINCT FROM OLD.is_locked THEN
    RAISE EXCEPTION 'You are not allowed to change ownership, origin, or lock state of a lead.';
  END IF;
  RETURN NEW;
END;
$$;

-- 5b. Touch + score + light SLA stamping (BEFORE INSERT OR UPDATE).
CREATE OR REPLACE FUNCTION nw_leads_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.lead_score := nw_lead_score_for(NEW.investment_capacity, NEW.annual_income, NEW.priority, NEW.status);
  NEW.score_band := CASE WHEN NEW.lead_score >= 70 THEN 'Hot'
                         WHEN NEW.lead_score >= 40 THEN 'Warm' ELSE 'Cold' END;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    -- assigned_at: first time an owner is set (or owner changes).
    IF NEW.owner_employee_id IS DISTINCT FROM OLD.owner_employee_id
       AND NEW.owner_employee_id IS NOT NULL THEN
      NEW.assigned_at := now();
    END IF;
    -- converted_at when entering the converted state.
    IF NEW.status = 'Closed - Converted' AND OLD.status IS DISTINCT FROM 'Closed - Converted' THEN
      NEW.converted_at := COALESCE(NEW.converted_at, now());
    END IF;
  ELSE
    IF NEW.owner_employee_id IS NOT NULL THEN NEW.assigned_at := COALESCE(NEW.assigned_at, now()); END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 5c. Field-level audit + status history (AFTER UPDATE).
CREATE OR REPLACE FUNCTION nw_leads_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid := nw_current_employee_id();
  oj jsonb := to_jsonb(OLD);
  nj jsonb := to_jsonb(NEW);
  col text;
  audited text[] := ARRAY['lead_name','mobile','alternate_number','email','pan','address',
    'city','state','occupation','company_name','age','annual_income','investment_capacity',
    'interested_product','lead_source','campaign','priority','remarks','status',
    'owner_employee_id','is_locked','is_archived'];
BEGIN
  FOREACH col IN ARRAY audited LOOP
    IF (oj->>col) IS DISTINCT FROM (nj->>col) THEN
      INSERT INTO nw_lead_audit(lead_id, employee_id, field_name, old_value, new_value)
      VALUES (NEW.id, emp, col, oj->>col, nj->>col);
    END IF;
  END LOOP;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO nw_lead_status_history(lead_id, employee_id, from_status, to_status)
    VALUES (NEW.id, emp, OLD.status, NEW.status);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_leads_guard  ON nw_leads;
DROP TRIGGER IF EXISTS trg_nw_leads_touch  ON nw_leads;
DROP TRIGGER IF EXISTS trg_nw_leads_audit  ON nw_leads;
CREATE TRIGGER trg_nw_leads_guard BEFORE UPDATE ON nw_leads
  FOR EACH ROW EXECUTE FUNCTION nw_leads_guard();
CREATE TRIGGER trg_nw_leads_touch BEFORE INSERT OR UPDATE ON nw_leads
  FOR EACH ROW EXECUTE FUNCTION nw_leads_touch();
CREATE TRIGGER trg_nw_leads_audit AFTER UPDATE ON nw_leads
  FOR EACH ROW EXECUTE FUNCTION nw_leads_audit();

-- ---------------------------------------------------------------------------
-- 6. RPCs
-- ---------------------------------------------------------------------------

-- Assign / reassign one or many leads (admin only). Atomic: updates owner,
-- records assignment history + activity, and notifies the new owner.
CREATE OR REPLACE FUNCTION nw_assign_leads(
  p_lead_ids uuid[], p_to_employee uuid, p_reason text DEFAULT ''
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_emp uuid := nw_current_employee_id();
  rec record;
  n int := 0;
  to_name text;
BEGIN
  IF NOT nw_current_emp_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can assign leads.';
  END IF;
  SELECT full_name INTO to_name FROM nw_employees WHERE id = p_to_employee;
  IF to_name IS NULL THEN RAISE EXCEPTION 'Target employee not found.'; END IF;

  FOR rec IN SELECT * FROM nw_leads WHERE id = ANY(p_lead_ids) LOOP
    IF rec.owner_employee_id IS DISTINCT FROM p_to_employee THEN
      UPDATE nw_leads
        SET owner_employee_id = p_to_employee,
            status = CASE WHEN status = 'New' THEN 'Assigned' ELSE status END
        WHERE id = rec.id;
      INSERT INTO nw_lead_assignments(lead_id, from_employee_id, to_employee_id, assigned_by_employee_id, reason)
        VALUES (rec.id, rec.owner_employee_id, p_to_employee, admin_emp, p_reason);
      INSERT INTO nw_lead_activities(lead_id, employee_id, action, description)
        VALUES (rec.id, admin_emp, 'Assigned', 'Assigned to ' || to_name ||
                CASE WHEN p_reason <> '' THEN ' — ' || p_reason ELSE '' END);
      INSERT INTO nw_alerts(employee_id, title, message, category, lead_id, action_url)
        VALUES (p_to_employee, 'New Lead Assigned',
                rec.lead_name || ' (' || rec.lead_code || ') was assigned to you',
                'lead_assigned', rec.id, '/crm/leads');
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END;
$$;

-- Mark a lead converted once the existing onboarding flow created the client.
CREATE OR REPLACE FUNCTION nw_mark_lead_converted(
  p_lead_id uuid, p_client_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp uuid := nw_current_employee_id();
BEGIN
  UPDATE nw_leads
    SET status = 'Closed - Converted', converted_client_id = p_client_id,
        converted_at = now(), is_archived = true, is_locked = true
    WHERE id = p_lead_id;
  INSERT INTO nw_lead_activities(lead_id, employee_id, action, description)
    VALUES (p_lead_id, emp, 'Converted', 'Lead converted to client and onboarded');
END;
$$;

-- Duplicate scan across the WHOLE CRM (leads + clients) by mobile / email / pan.
-- SECURITY DEFINER so an employee gets a yes/no + non-confidential summary without
-- being able to read leads/clients they don't own. Returns at most a few matches.
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
   WHERE (p_exclude_lead_id IS NULL OR l.id <> p_exclude_lead_id)
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
   WHERE ( (p_mobile <> '' AND c.phone = p_mobile)
        OR (p_email  <> '' AND lower(c.email) = lower(p_email))
        OR (p_pan    <> '' AND upper(c.pan)   = upper(p_pan)) )
  LIMIT 10;
$$;

-- Employee raises a duplicate-review request; every admin is notified. Runs as
-- definer so the alert fan-out to admins isn't blocked by the employee's RLS.
CREATE OR REPLACE FUNCTION nw_request_duplicate_review(
  p_existing_lead_id uuid, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid := nw_current_employee_id();
  emp_name text;
  a record;
BEGIN
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

GRANT EXECUTE ON FUNCTION nw_request_duplicate_review(uuid,jsonb)  TO authenticated;
GRANT EXECUTE ON FUNCTION nw_check_lead_duplicate(text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION nw_next_lead_code()                       TO authenticated;
GRANT EXECUTE ON FUNCTION nw_lead_score_for(numeric,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION nw_assign_leads(uuid[],uuid,text)         TO authenticated;
GRANT EXECUTE ON FUNCTION nw_mark_lead_converted(uuid,uuid)         TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE nw_leads                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_activities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_notes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_followups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_communications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_assignments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_status_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_audit               ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_saved_views         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_lead_duplicate_requests  ENABLE ROW LEVEL SECURITY;

-- Predicate helper: can the current user see this lead?
CREATE OR REPLACE FUNCTION nw_can_see_lead(p_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM nw_leads l
     WHERE l.id = p_lead_id
       AND (nw_current_emp_is_admin()
            OR l.owner_employee_id = nw_current_employee_id()
            OR l.created_by_employee_id = nw_current_employee_id())
  );
$$;
GRANT EXECUTE ON FUNCTION nw_can_see_lead(uuid) TO authenticated;

-- nw_leads policies
DROP POLICY IF EXISTS nw_leads_select ON nw_leads;
CREATE POLICY nw_leads_select ON nw_leads FOR SELECT TO authenticated
  USING (nw_current_emp_is_admin()
         OR owner_employee_id = nw_current_employee_id()
         OR created_by_employee_id = nw_current_employee_id());

DROP POLICY IF EXISTS nw_leads_insert ON nw_leads;
CREATE POLICY nw_leads_insert ON nw_leads FOR INSERT TO authenticated
  WITH CHECK (
    nw_current_emp_is_admin()
    OR (lead_origin = 'employee_manual'
        AND created_by_employee_id = nw_current_employee_id()
        AND owner_employee_id = nw_current_employee_id())
  );

DROP POLICY IF EXISTS nw_leads_update ON nw_leads;
CREATE POLICY nw_leads_update ON nw_leads FOR UPDATE TO authenticated
  USING (nw_current_emp_is_admin() OR owner_employee_id = nw_current_employee_id())
  WITH CHECK (nw_current_emp_is_admin() OR owner_employee_id = nw_current_employee_id());

DROP POLICY IF EXISTS nw_leads_delete ON nw_leads;
CREATE POLICY nw_leads_delete ON nw_leads FOR DELETE TO authenticated
  USING (nw_current_emp_is_admin());

-- Child tables: SELECT/INSERT when the parent lead is visible.
-- (helper macro applied per table)
DO $$
DECLARE t text;
  child_tables text[] := ARRAY['nw_lead_activities','nw_lead_notes','nw_lead_followups',
    'nw_lead_communications','nw_lead_documents','nw_lead_assignments',
    'nw_lead_status_history','nw_lead_audit'];
BEGIN
  FOREACH t IN ARRAY child_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_select', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR SELECT TO authenticated
      USING (nw_can_see_lead(lead_id));$p$, t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR INSERT TO authenticated
      WITH CHECK (nw_can_see_lead(lead_id));$p$, t||'_insert', t);
  END LOOP;
END $$;

-- Audit, status history, and assignments are written ONLY by system code
-- (SECURITY DEFINER triggers / RPCs, which bypass RLS as table owner). Revoke
-- the generic client INSERT the loop granted so staff can't forge these rows.
DROP POLICY IF EXISTS nw_lead_audit_insert          ON nw_lead_audit;
DROP POLICY IF EXISTS nw_lead_status_history_insert ON nw_lead_status_history;
DROP POLICY IF EXISTS nw_lead_assignments_insert    ON nw_lead_assignments;

-- Notes/followups/communications: allow the owner or admin to UPDATE
-- (e.g. complete a follow-up); only admins DELETE. Activities/audit/status
-- history stay append-only (no UPDATE/DELETE policy at all).
DROP POLICY IF EXISTS nw_lead_notes_delete ON nw_lead_notes;
CREATE POLICY nw_lead_notes_delete ON nw_lead_notes FOR DELETE TO authenticated
  USING (nw_current_emp_is_admin());

DROP POLICY IF EXISTS nw_lead_followups_update ON nw_lead_followups;
CREATE POLICY nw_lead_followups_update ON nw_lead_followups FOR UPDATE TO authenticated
  USING (nw_can_see_lead(lead_id)) WITH CHECK (nw_can_see_lead(lead_id));
DROP POLICY IF EXISTS nw_lead_followups_delete ON nw_lead_followups;
CREATE POLICY nw_lead_followups_delete ON nw_lead_followups FOR DELETE TO authenticated
  USING (nw_current_emp_is_admin());

DROP POLICY IF EXISTS nw_lead_documents_delete ON nw_lead_documents;
CREATE POLICY nw_lead_documents_delete ON nw_lead_documents FOR DELETE TO authenticated
  USING (nw_current_emp_is_admin());

-- Saved views: each employee manages own; shared views are readable by all staff.
DROP POLICY IF EXISTS nw_lead_saved_views_select ON nw_lead_saved_views;
CREATE POLICY nw_lead_saved_views_select ON nw_lead_saved_views FOR SELECT TO authenticated
  USING (employee_id = nw_current_employee_id() OR is_shared OR nw_current_emp_is_admin());
DROP POLICY IF EXISTS nw_lead_saved_views_insert ON nw_lead_saved_views;
CREATE POLICY nw_lead_saved_views_insert ON nw_lead_saved_views FOR INSERT TO authenticated
  WITH CHECK (employee_id = nw_current_employee_id());
DROP POLICY IF EXISTS nw_lead_saved_views_update ON nw_lead_saved_views;
CREATE POLICY nw_lead_saved_views_update ON nw_lead_saved_views FOR UPDATE TO authenticated
  USING (employee_id = nw_current_employee_id()) WITH CHECK (employee_id = nw_current_employee_id());
DROP POLICY IF EXISTS nw_lead_saved_views_delete ON nw_lead_saved_views;
CREATE POLICY nw_lead_saved_views_delete ON nw_lead_saved_views FOR DELETE TO authenticated
  USING (employee_id = nw_current_employee_id() OR nw_current_emp_is_admin());

-- Duplicate requests: employee raises own; admin reviews all.
DROP POLICY IF EXISTS nw_lead_dup_select ON nw_lead_duplicate_requests;
CREATE POLICY nw_lead_dup_select ON nw_lead_duplicate_requests FOR SELECT TO authenticated
  USING (nw_current_emp_is_admin() OR requested_by_employee_id = nw_current_employee_id());
DROP POLICY IF EXISTS nw_lead_dup_insert ON nw_lead_duplicate_requests;
CREATE POLICY nw_lead_dup_insert ON nw_lead_duplicate_requests FOR INSERT TO authenticated
  WITH CHECK (requested_by_employee_id = nw_current_employee_id());
DROP POLICY IF EXISTS nw_lead_dup_update ON nw_lead_duplicate_requests;
CREATE POLICY nw_lead_dup_update ON nw_lead_duplicate_requests FOR UPDATE TO authenticated
  USING (nw_current_emp_is_admin()) WITH CHECK (nw_current_emp_is_admin());
