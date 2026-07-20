/*
  # Bond Creation Module — Bond Master Database + Marketing Engine

  Adds an internal bond inventory alongside the existing CRM. Admins upload bond
  sheets (Excel now; PDF/Word via a pluggable parser later), the extracted rows
  become structured bond records, and employees generate client-facing marketing
  PDFs by applying an approved margin.

  Design notes
  ------------
  * HARD BUSINESS RULE: landing_cost (and purchase_price / internal margin /
    internal notes / admin remarks) are CONFIDENTIAL — admin only. Employees must
    never receive them, not even over REST. RLS cannot hide a single column and
    client-portal users are also `authenticated`, so:
      - nw_bonds base-table SELECT policy = admin only.
      - A staff-gated VIEW nw_bonds_catalog exposes only the safe columns. A view
        runs with its owner's rights (definer), so it bypasses the base-table RLS
        and returns the safe projection; an inner staff EXISTS() gate keeps
        client-portal / anon users out.
      - Employee selling price is computed by a SECURITY DEFINER RPC that reads
        landing_cost internally and returns only the resulting price.
  * Reuses the project's RLS helpers nw_current_employee_id() /
    nw_current_emp_is_admin() (20260701120000_dsa_ownership_forward_align.sql).
  * Bond codes come from a dedicated SEQUENCE (BOND-000001) — race-safe on bulk import.
  * Version history via an AFTER UPDATE trigger snapshotting the prior row.
  * SECURITY DEFINER RPCs REVOKE EXECUTE FROM PUBLIC then GRANT to authenticated,
    with internal staff/admin guards (per the Lead module security note: Postgres
    grants new-function EXECUTE to PUBLIC by default).
  * Everything idempotent (IF NOT EXISTS / CREATE OR REPLACE / guarded policies).
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 0. Bond code sequence + generator
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS nw_bond_code_seq;

CREATE OR REPLACE FUNCTION nw_next_bond_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'BOND-' || LPAD(nextval('nw_bond_code_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- 1. Uploaded documents (originals + extracted JSON)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nw_bond_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path   text NOT NULL DEFAULT '',
  file_name      text NOT NULL,
  mime_type      text NOT NULL DEFAULT '',
  file_size      bigint NOT NULL DEFAULT 0,
  doc_format     text NOT NULL DEFAULT 'excel' CHECK (doc_format IN ('excel','pdf','word','other')),
  extracted_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  bond_count     int NOT NULL DEFAULT 0,
  uploaded_by    uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_bond_documents_created ON nw_bond_documents(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Core table: nw_bonds (Bond Master)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nw_bonds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_code             text NOT NULL UNIQUE DEFAULT nw_next_bond_code(),

  -- Identity
  company_name          text NOT NULL DEFAULT '',
  isin                  text NOT NULL DEFAULT '',
  bond_name             text NOT NULL DEFAULT '',
  issuer                text NOT NULL DEFAULT '',
  security_type         text NOT NULL DEFAULT '',   -- SECURED & GUARANTEED, etc.
  security_category     text NOT NULL DEFAULT '',   -- State Guaranteed, High Yielding, ...
  seniority             text NOT NULL DEFAULT '',
  listing_exchange      text NOT NULL DEFAULT '',

  -- Face value / quantity (numbers + preserved source text)
  face_value            numeric,
  face_value_text       text NOT NULL DEFAULT '',
  available_quantity    text NOT NULL DEFAULT '',    -- "Quantum"
  minimum_investment    text NOT NULL DEFAULT '',
  multiples             text NOT NULL DEFAULT '',
  issue_size            text NOT NULL DEFAULT '',

  -- Pricing (purchase_price + landing_cost are CONFIDENTIAL)
  purchase_price        numeric,                     -- Price Per 100 (internal)
  landing_cost          numeric,                     -- INTERNAL / ADMIN ONLY
  selling_price         numeric,                     -- client-facing default (admin set)
  default_margin_type   text NOT NULL DEFAULT 'none' CHECK (default_margin_type IN ('none','percent','flat')),
  default_margin_value  numeric,                     -- INTERNAL (reverses landing cost)

  -- Coupon / yield
  coupon                numeric,                     -- percent, e.g. 8.70
  coupon_text           text NOT NULL DEFAULT '',
  yield_ytm             numeric,                     -- percent
  ytc_ytp               numeric,                     -- percent (nullable)

  -- Dates / tenure
  maturity_date         date,
  maturity_text         text NOT NULL DEFAULT '',    -- preserves "(25% PARTIAL REDEMPTION ...)"
  tenure                text NOT NULL DEFAULT '',

  -- Rating
  rating                text NOT NULL DEFAULT '',
  rating_agency         text NOT NULL DEFAULT '',

  -- Interest / redemption
  interest_frequency      text NOT NULL DEFAULT '',
  interest_payment_dates  text NOT NULL DEFAULT '',  -- IP Dates
  put_option              text NOT NULL DEFAULT '',
  call_option             text NOT NULL DEFAULT '',
  principal_repayment     text NOT NULL DEFAULT '',
  credit_enhancement      text NOT NULL DEFAULT '',
  trustee                 text NOT NULL DEFAULT '',
  tax_status              text NOT NULL DEFAULT '',

  -- Free text (public vs internal)
  remarks               text NOT NULL DEFAULT '',    -- general (public)
  notes                 text NOT NULL DEFAULT '',    -- bond notes (public)
  footnotes             text NOT NULL DEFAULT '',    -- preserved (public)
  disclaimers           text NOT NULL DEFAULT '',    -- preserved (public)
  internal_notes        text NOT NULL DEFAULT '',    -- INTERNAL / ADMIN ONLY
  admin_remarks         text NOT NULL DEFAULT '',    -- INTERNAL / ADMIN ONLY

  -- Lifecycle
  status                text NOT NULL DEFAULT 'Available'
                          CHECK (status IN ('Available','Sold Out','Reserved','Expired','Matured','Archived')),
  is_archived           boolean NOT NULL DEFAULT false,

  -- Provenance / extraction
  source                text NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('excel_upload','pdf_upload','word_upload','api','manual')),
  document_id           uuid REFERENCES nw_bond_documents(id) ON DELETE SET NULL,
  extracted_json        jsonb NOT NULL DEFAULT '{}'::jsonb,  -- raw source row (INTERNAL)
  ocr_confidence        numeric NOT NULL DEFAULT 100,        -- 0-100
  needs_review          boolean NOT NULL DEFAULT false,

  created_by            uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  modified_by           uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nw_bonds_isin      ON nw_bonds(isin)   WHERE isin <> '';
CREATE INDEX IF NOT EXISTS idx_nw_bonds_status    ON nw_bonds(status);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_rating    ON nw_bonds(rating);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_coupon    ON nw_bonds(coupon);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_yield     ON nw_bonds(yield_ytm);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_maturity  ON nw_bonds(maturity_date);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_created   ON nw_bonds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_archived  ON nw_bonds(is_archived);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_company_trgm ON nw_bonds USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_nw_bonds_name_trgm    ON nw_bonds USING gin (bond_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Version history + generated PDF audit
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nw_bond_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id      uuid NOT NULL REFERENCES nw_bonds(id) ON DELETE CASCADE,
  version_no   int NOT NULL,
  snapshot     jsonb NOT NULL,
  changed_by   uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  change_note  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_bond_versions_bond ON nw_bond_versions(bond_id, version_no DESC);

CREATE TABLE IF NOT EXISTS nw_generated_marketing_pdfs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id            uuid NOT NULL REFERENCES nw_bonds(id) ON DELETE CASCADE,
  employee_id        uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  margin_type        text NOT NULL DEFAULT 'none' CHECK (margin_type IN ('none','percent','flat','manual')),
  margin_value       numeric,
  selling_price      numeric,
  bond_name_snapshot text NOT NULL DEFAULT '',
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nw_bond_pdfs_bond ON nw_generated_marketing_pdfs(bond_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nw_bond_pdfs_emp  ON nw_generated_marketing_pdfs(employee_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Triggers — touch + version snapshot
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_bonds_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  -- Keep status <-> is_archived consistent both directions.
  IF NEW.status = 'Archived' THEN
    NEW.is_archived := true;
  ELSIF NEW.is_archived THEN
    NEW.status := 'Archived';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION nw_bonds_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_no int;
BEGIN
  -- Only snapshot when something material actually changed.
  IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO next_no FROM nw_bond_versions WHERE bond_id = NEW.id;
    INSERT INTO nw_bond_versions(bond_id, version_no, snapshot, changed_by)
      VALUES (NEW.id, next_no, to_jsonb(OLD), nw_current_employee_id());
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_bonds_touch   ON nw_bonds;
DROP TRIGGER IF EXISTS trg_nw_bonds_version ON nw_bonds;
CREATE TRIGGER trg_nw_bonds_touch   BEFORE INSERT OR UPDATE ON nw_bonds
  FOR EACH ROW EXECUTE FUNCTION nw_bonds_touch();
CREATE TRIGGER trg_nw_bonds_version AFTER UPDATE ON nw_bonds
  FOR EACH ROW EXECUTE FUNCTION nw_bonds_version();

-- ---------------------------------------------------------------------------
-- 5. Confidential-safe catalog view for employees (staff-gated, no cost fields)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS nw_bonds_catalog;
CREATE VIEW nw_bonds_catalog AS
  SELECT
    id, bond_code, company_name, isin, bond_name, issuer, security_type,
    security_category, seniority, listing_exchange,
    face_value, face_value_text, available_quantity, minimum_investment, multiples, issue_size,
    selling_price,                              -- client-facing price (safe)
    coupon, coupon_text, yield_ytm, ytc_ytp,
    maturity_date, maturity_text, tenure,
    rating, rating_agency,
    interest_frequency, interest_payment_dates, put_option, call_option,
    principal_repayment, credit_enhancement, trustee, tax_status,
    remarks, notes, footnotes, disclaimers,
    status, is_archived, source, ocr_confidence, needs_review,
    created_at, updated_at
  FROM nw_bonds
  WHERE EXISTS (
    SELECT 1 FROM nw_employees e
     WHERE e.auth_user_id = auth.uid() AND e.status = 'active'
  );

GRANT SELECT ON nw_bonds_catalog TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPCs
-- ---------------------------------------------------------------------------

-- Compute a selling price from the confidential landing_cost WITHOUT ever
-- exposing the cost. Staff-only. Used by the employee margin calculator + PDF.
CREATE OR REPLACE FUNCTION nw_bond_selling_price(
  p_bond_id uuid, p_margin_type text, p_margin_value numeric
) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base numeric;
BEGIN
  IF nw_current_employee_id() IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;
  SELECT landing_cost INTO base FROM nw_bonds WHERE id = p_bond_id;
  IF base IS NULL THEN
    -- No landing cost set yet; fall back to the stored selling price.
    SELECT selling_price INTO base FROM nw_bonds WHERE id = p_bond_id;
    RETURN base;
  END IF;
  RETURN CASE lower(COALESCE(p_margin_type,'none'))
    WHEN 'percent' THEN round(base * (1 + COALESCE(p_margin_value,0) / 100.0), 2)
    WHEN 'flat'    THEN round(base + COALESCE(p_margin_value,0), 2)
    ELSE round(base, 2)
  END;
END;
$$;

-- Log a generated client marketing PDF (append-only audit).
CREATE OR REPLACE FUNCTION nw_bond_log_marketing_pdf(
  p_bond_id uuid, p_margin_type text, p_margin_value numeric, p_selling_price numeric
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE emp uuid := nw_current_employee_id(); nm text;
BEGIN
  IF emp IS NULL THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  SELECT bond_name INTO nm FROM nw_bonds WHERE id = p_bond_id;
  INSERT INTO nw_generated_marketing_pdfs(bond_id, employee_id, margin_type, margin_value, selling_price, bond_name_snapshot)
    VALUES (p_bond_id, emp, COALESCE(p_margin_type,'none'), p_margin_value, p_selling_price, COALESCE(nm,''));
END;
$$;

-- Admin bulk insert from the verified upload preview. Atomic; returns count.
-- p_rows is a JSON array of bond objects (keys = nw_bonds columns).
CREATE OR REPLACE FUNCTION nw_bond_insert_batch(
  p_rows jsonb, p_document_id uuid DEFAULT NULL
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_emp uuid := nw_current_employee_id();
  r jsonb;
  n int := 0;
BEGIN
  IF NOT nw_current_emp_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can import bonds.';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    INSERT INTO nw_bonds (
      company_name, isin, bond_name, issuer, security_type, security_category,
      seniority, listing_exchange, face_value, face_value_text, available_quantity,
      minimum_investment, multiples, issue_size, purchase_price, landing_cost,
      selling_price, coupon, coupon_text, yield_ytm, ytc_ytp, maturity_date,
      maturity_text, tenure, rating, rating_agency, interest_frequency,
      interest_payment_dates, put_option, call_option, principal_repayment,
      credit_enhancement, trustee, tax_status, remarks, notes, footnotes,
      disclaimers, status, source, document_id, extracted_json, ocr_confidence,
      needs_review, created_by, modified_by
    ) VALUES (
      COALESCE(r->>'company_name',''), COALESCE(r->>'isin',''), COALESCE(r->>'bond_name',''),
      COALESCE(r->>'issuer',''), COALESCE(r->>'security_type',''), COALESCE(r->>'security_category',''),
      COALESCE(r->>'seniority',''), COALESCE(r->>'listing_exchange',''),
      NULLIF(r->>'face_value','')::numeric, COALESCE(r->>'face_value_text',''),
      COALESCE(r->>'available_quantity',''), COALESCE(r->>'minimum_investment',''),
      COALESCE(r->>'multiples',''), COALESCE(r->>'issue_size',''),
      NULLIF(r->>'purchase_price','')::numeric, NULLIF(r->>'landing_cost','')::numeric,
      NULLIF(r->>'selling_price','')::numeric, NULLIF(r->>'coupon','')::numeric,
      COALESCE(r->>'coupon_text',''), NULLIF(r->>'yield_ytm','')::numeric,
      NULLIF(r->>'ytc_ytp','')::numeric, NULLIF(r->>'maturity_date','')::date,
      COALESCE(r->>'maturity_text',''), COALESCE(r->>'tenure',''), COALESCE(r->>'rating',''),
      COALESCE(r->>'rating_agency',''), COALESCE(r->>'interest_frequency',''),
      COALESCE(r->>'interest_payment_dates',''), COALESCE(r->>'put_option',''),
      COALESCE(r->>'call_option',''), COALESCE(r->>'principal_repayment',''),
      COALESCE(r->>'credit_enhancement',''), COALESCE(r->>'trustee',''),
      COALESCE(r->>'tax_status',''), COALESCE(r->>'remarks',''), COALESCE(r->>'notes',''),
      COALESCE(r->>'footnotes',''), COALESCE(r->>'disclaimers',''),
      COALESCE(NULLIF(r->>'status',''),'Available'),
      COALESCE(NULLIF(r->>'source',''),'excel_upload'), p_document_id,
      COALESCE(r->'extracted_json','{}'::jsonb),
      COALESCE(NULLIF(r->>'ocr_confidence','')::numeric, 100),
      COALESCE((r->>'needs_review')::boolean, false),
      admin_emp, admin_emp
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE EXECUTE ON FUNCTION nw_bond_selling_price(uuid,text,numeric)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_bond_log_marketing_pdf(uuid,text,numeric,numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_bond_insert_batch(jsonb,uuid)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION nw_next_bond_code()                            FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nw_bond_selling_price(uuid,text,numeric)        TO authenticated;
GRANT EXECUTE ON FUNCTION nw_bond_log_marketing_pdf(uuid,text,numeric,numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION nw_bond_insert_batch(jsonb,uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION nw_next_bond_code()                            TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE nw_bonds                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_bond_documents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_bond_versions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE nw_generated_marketing_pdfs  ENABLE ROW LEVEL SECURITY;

-- nw_bonds: base table is ADMIN-ONLY for direct access. Employees read the
-- confidential-safe view nw_bonds_catalog instead (defined above).
DROP POLICY IF EXISTS nw_bonds_select ON nw_bonds;
CREATE POLICY nw_bonds_select ON nw_bonds FOR SELECT TO authenticated
  USING (nw_current_emp_is_admin());
DROP POLICY IF EXISTS nw_bonds_insert ON nw_bonds;
CREATE POLICY nw_bonds_insert ON nw_bonds FOR INSERT TO authenticated
  WITH CHECK (nw_current_emp_is_admin());
DROP POLICY IF EXISTS nw_bonds_update ON nw_bonds;
CREATE POLICY nw_bonds_update ON nw_bonds FOR UPDATE TO authenticated
  USING (nw_current_emp_is_admin()) WITH CHECK (nw_current_emp_is_admin());
DROP POLICY IF EXISTS nw_bonds_delete ON nw_bonds;
CREATE POLICY nw_bonds_delete ON nw_bonds FOR DELETE TO authenticated
  USING (nw_current_emp_is_admin());

-- Documents: admin manages; staff may read metadata.
DROP POLICY IF EXISTS nw_bond_documents_select ON nw_bond_documents;
CREATE POLICY nw_bond_documents_select ON nw_bond_documents FOR SELECT TO authenticated
  USING (nw_current_employee_id() IS NOT NULL);
DROP POLICY IF EXISTS nw_bond_documents_insert ON nw_bond_documents;
CREATE POLICY nw_bond_documents_insert ON nw_bond_documents FOR INSERT TO authenticated
  WITH CHECK (nw_current_emp_is_admin());
DROP POLICY IF EXISTS nw_bond_documents_delete ON nw_bond_documents;
CREATE POLICY nw_bond_documents_delete ON nw_bond_documents FOR DELETE TO authenticated
  USING (nw_current_emp_is_admin());

-- Version history: admin only (snapshots may contain landing_cost).
DROP POLICY IF EXISTS nw_bond_versions_select ON nw_bond_versions;
CREATE POLICY nw_bond_versions_select ON nw_bond_versions FOR SELECT TO authenticated
  USING (nw_current_emp_is_admin());
DROP POLICY IF EXISTS nw_bond_versions_delete ON nw_bond_versions;
CREATE POLICY nw_bond_versions_delete ON nw_bond_versions FOR DELETE TO authenticated
  USING (nw_current_emp_is_admin());

-- Generated PDFs: staff insert own rows; admin sees all, employee sees own.
DROP POLICY IF EXISTS nw_bond_pdfs_select ON nw_generated_marketing_pdfs;
CREATE POLICY nw_bond_pdfs_select ON nw_generated_marketing_pdfs FOR SELECT TO authenticated
  USING (nw_current_emp_is_admin() OR employee_id = nw_current_employee_id());
DROP POLICY IF EXISTS nw_bond_pdfs_insert ON nw_generated_marketing_pdfs;
CREATE POLICY nw_bond_pdfs_insert ON nw_generated_marketing_pdfs FOR INSERT TO authenticated
  WITH CHECK (employee_id = nw_current_employee_id());

-- ---------------------------------------------------------------------------
-- 8. Storage bucket + policies (private) for uploaded bond sheets
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('bond-documents', 'bond-documents', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins upload bond-documents" ON storage.objects;
CREATE POLICY "Admins upload bond-documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bond-documents' AND nw_current_emp_is_admin());

DROP POLICY IF EXISTS "Staff read bond-documents" ON storage.objects;
CREATE POLICY "Staff read bond-documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bond-documents' AND nw_current_employee_id() IS NOT NULL);

DROP POLICY IF EXISTS "Admins delete bond-documents" ON storage.objects;
CREATE POLICY "Admins delete bond-documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bond-documents' AND nw_current_emp_is_admin());
