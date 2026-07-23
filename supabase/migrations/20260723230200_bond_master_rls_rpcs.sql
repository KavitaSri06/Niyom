/*
  # Bond Security Master — RLS, staff-safe view, importer + margin RPCs

  - bm_bonds base table: ADMIN-ONLY direct access (holds landing_cost/margin).
  - bm_bonds_public: staff-gated DEFINER view with the client-safe factual columns
    (no landing_cost / margin internals). MUST be security_invoker=false so it can
    read the admin-only base on a staff member's behalf (lesson from the old module).
  - Factual children (schedules, price/rating history, corporate actions) are
    readable by any signed-in staff; writes are admin/service only.
  - Provenance / verification / provider log: admin-only.
  - bm_import_prices: the header-detected importer (create-or-price-update).
  - bm_selling_price: margin applied server-side (cost never exposed) — the seam
    the future client portal reuses.
*/

ALTER TABLE bm_issuers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_bonds              ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_coupon_schedule    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_cashflow_schedule  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_price_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_rating_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_corporate_actions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_field_provenance   ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_verification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_provider_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bm_holiday_calendar   ENABLE ROW LEVEL SECURITY;

-- Admin-only master + issuer + internal tables.
DO $$
DECLARE t text; admin_tables text[] := ARRAY['bm_bonds','bm_issuers','bm_field_provenance',
  'bm_verification_queue','bm_provider_log'];
BEGIN
  FOREACH t IN ARRAY admin_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_admin_all', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO authenticated
      USING (nw_current_emp_is_admin()) WITH CHECK (nw_current_emp_is_admin());$p$, t||'_admin_all', t);
  END LOOP;
END $$;

-- Factual children: any signed-in staff may READ; only admins write.
DO $$
DECLARE t text; staff_read_tables text[] := ARRAY['bm_coupon_schedule','bm_cashflow_schedule',
  'bm_price_history','bm_rating_history','bm_corporate_actions','bm_holiday_calendar'];
BEGIN
  FOREACH t IN ARRAY staff_read_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_staff_read', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR SELECT TO authenticated
      USING (nw_current_employee_id() IS NOT NULL);$p$, t||'_staff_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t||'_admin_write', t);
    EXECUTE format($p$CREATE POLICY %I ON %I FOR ALL TO authenticated
      USING (nw_current_emp_is_admin()) WITH CHECK (nw_current_emp_is_admin());$p$, t||'_admin_write', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Staff-safe projection (no landing_cost / margin internals). DEFINER.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS bm_bonds_public;
CREATE VIEW bm_bonds_public
WITH (security_invoker = false) AS
  SELECT
    b.id, b.isin, b.issuer_id, i.name AS issuer_name, i.industry, i.sector,
    b.bond_name, b.security_description, b.series,
    b.issue_date, b.listing_date, b.maturity_date, b.redemption_date,
    b.face_value, b.issue_price, b.redemption_value,
    b.coupon_rate, b.coupon_type, b.coupon_frequency, b.interest_payment_dates,
    b.first_coupon_date, b.next_coupon_date, b.previous_coupon_date,
    b.day_count_convention, b.business_day_convention,
    b.principal_repayment_structure, b.redemption_schedule,
    b.callable, b.puttable, b.perpetual, b.floating, b.put_call_date, b.put_call_type,
    b.seniority, b.security_type, b.secured, b.tax_status,
    b.exchange_listed, b.listing_status, b.nse_symbol, b.bse_code,
    b.min_investment, b.lot_size, b.currency,
    b.rating, b.rating_agency, b.rating_date, b.issuer_docs,
    b.selling_price,                          -- client-facing price (safe)
    b.latest_price, b.price_updated_at,
    b.active_status, b.verification_status, b.data_quality_score, b.enriched_at,
    b.created_at, b.updated_at
  FROM bm_bonds b
  LEFT JOIN bm_issuers i ON i.id = b.issuer_id
  WHERE EXISTS (
    SELECT 1 FROM nw_employees e
     WHERE e.auth_user_id = auth.uid() AND e.status = 'active'
  );
GRANT SELECT ON bm_bonds_public TO authenticated;

-- ---------------------------------------------------------------------------
-- Importer: create-or-price-update from {isin, bond_name, price} rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bm_import_prices(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid := nw_current_employee_id();
  r jsonb; v_isin text; v_name text; v_price numeric;
  v_bond bm_bonds%ROWTYPE; v_id uuid;
  created int := 0; updated int := 0; skipped int := 0;
  new_ids uuid[] := '{}';
BEGIN
  IF NOT nw_current_emp_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can import the bond price file.';
  END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    v_isin  := upper(trim(COALESCE(r->>'isin','')));
    v_name  := trim(COALESCE(r->>'bond_name',''));
    v_price := NULLIF(trim(COALESCE(r->>'price','')), '')::numeric;
    -- ISIN = 2 letters + 9 alnum + 1 check digit.
    IF v_isin !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' THEN skipped := skipped + 1; CONTINUE; END IF;

    SELECT * INTO v_bond FROM bm_bonds WHERE isin = v_isin;
    IF FOUND THEN
      -- Existing verified master: touch ONLY the price.
      UPDATE bm_bonds
         SET latest_price = COALESCE(v_price, latest_price),
             price_updated_at = now(), modified_by = emp,
             extracted_name = CASE WHEN extracted_name = '' THEN v_name ELSE extracted_name END
       WHERE id = v_bond.id;
      IF v_price IS NOT NULL THEN
        INSERT INTO bm_price_history(bond_id, isin, price, as_of, source)
          VALUES (v_bond.id, v_isin, v_price, current_date, 'excel_upload')
          ON CONFLICT (bond_id, as_of) DO UPDATE SET price = EXCLUDED.price;
      END IF;
      updated := updated + 1;
    ELSE
      -- New ISIN: stub master pending enrichment.
      INSERT INTO bm_bonds(isin, bond_name, extracted_name, latest_price, price_updated_at,
                           verification_status, created_by, modified_by)
        VALUES (v_isin, v_name, v_name, v_price, now(), 'pending', emp, emp)
        RETURNING id INTO v_id;
      IF v_price IS NOT NULL THEN
        INSERT INTO bm_price_history(bond_id, isin, price, as_of, source)
          VALUES (v_id, v_isin, v_price, current_date, 'excel_upload');
      END IF;
      new_ids := array_append(new_ids, v_id);
      created := created + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('created', created, 'updated', updated,
                            'skipped', skipped, 'new_bond_ids', to_jsonb(new_ids));
END;
$$;

-- ---------------------------------------------------------------------------
-- Margin applied server-side — selling price without exposing landing cost.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bm_selling_price(
  p_bond_id uuid, p_margin_type text, p_margin_value numeric
) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base numeric; fallback numeric;
BEGIN
  IF nw_current_employee_id() IS NULL THEN RAISE EXCEPTION 'Not authorized.'; END IF;
  SELECT COALESCE(landing_cost, latest_price), selling_price
    INTO base, fallback FROM bm_bonds WHERE id = p_bond_id;
  IF base IS NULL THEN RETURN fallback; END IF;
  RETURN CASE lower(COALESCE(p_margin_type,'none'))
    WHEN 'percent' THEN round(base * (1 + COALESCE(p_margin_value,0)/100.0), 4)
    WHEN 'flat'    THEN round(base + COALESCE(p_margin_value,0), 4)
    ELSE round(base, 4)
  END;
END;
$$;

REVOKE ALL ON FUNCTION bm_import_prices(jsonb)              FROM PUBLIC;
REVOKE ALL ON FUNCTION bm_selling_price(uuid,text,numeric)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bm_import_prices(jsonb)             TO authenticated;
GRANT  EXECUTE ON FUNCTION bm_selling_price(uuid,text,numeric) TO authenticated;
