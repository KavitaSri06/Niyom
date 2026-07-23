/*
  # Excel fallback data — store the sheet's extra columns per bond

  The daily sheet also carries coupon/rating/maturity/IP-dates/face/redemption. We
  keep those in bm_bonds.import_raw (NOT as primary master) so the enrichment
  engine can fill fields that NO external provider covers — the lowest-priority
  source in the merge. The importer now sends an `extra` bag per row.
*/

ALTER TABLE bm_bonds ADD COLUMN IF NOT EXISTS import_raw jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION bm_import_prices(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid := nw_current_employee_id();
  r jsonb; v_isin text; v_name text; v_price numeric; v_extra jsonb;
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
    v_extra := COALESCE(r->'extra', '{}'::jsonb);
    IF v_isin !~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$' THEN skipped := skipped + 1; CONTINUE; END IF;

    SELECT * INTO v_bond FROM bm_bonds WHERE isin = v_isin;
    IF FOUND THEN
      UPDATE bm_bonds
         SET latest_price = COALESCE(v_price, latest_price),
             price_updated_at = now(), modified_by = emp,
             import_raw = CASE WHEN v_extra <> '{}'::jsonb THEN v_extra ELSE import_raw END,
             extracted_name = CASE WHEN extracted_name = '' THEN v_name ELSE extracted_name END
       WHERE id = v_bond.id;
      IF v_price IS NOT NULL THEN
        INSERT INTO bm_price_history(bond_id, isin, price, as_of, source)
          VALUES (v_bond.id, v_isin, v_price, current_date, 'excel_upload')
          ON CONFLICT (bond_id, as_of) DO UPDATE SET price = EXCLUDED.price;
      END IF;
      updated := updated + 1;
    ELSE
      INSERT INTO bm_bonds(isin, bond_name, extracted_name, latest_price, price_updated_at,
                           import_raw, verification_status, created_by, modified_by)
        VALUES (v_isin, v_name, v_name, v_price, now(), v_extra, 'pending', emp, emp)
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
