/*
  # Replace-on-upload for the bond database

  Each fresh bond sheet is the new source of truth — the previous day's prices and
  availability are stale, and re-importing on top of them creates duplicates. Add
  an admin-only `p_replace` switch to nw_bond_insert_batch: when true it wipes
  every existing bond before inserting the new set, atomically in one transaction.

  Deleting bonds cascades to their versions and generated-PDF audit rows
  (ON DELETE CASCADE); uploaded document rows are preserved (bonds.document_id is
  ON DELETE SET NULL, and documents are not touched here).

  The old 2-arg function is dropped so every caller uses the replace-aware version.
*/

DROP FUNCTION IF EXISTS nw_bond_insert_batch(jsonb, uuid);

CREATE OR REPLACE FUNCTION nw_bond_insert_batch(
  p_rows jsonb, p_document_id uuid DEFAULT NULL, p_replace boolean DEFAULT false
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  admin_emp uuid := nw_current_employee_id();
  r jsonb;
  n int := 0;
BEGIN
  IF NOT nw_current_emp_is_admin() THEN
    RAISE EXCEPTION 'Only administrators can import bonds.';
  END IF;

  -- Fresh sheet replaces the whole list. One transaction, so a failed insert
  -- rolls the delete back too.
  IF p_replace THEN
    DELETE FROM nw_bonds;
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

REVOKE EXECUTE ON FUNCTION nw_bond_insert_batch(jsonb,uuid,boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION nw_bond_insert_batch(jsonb,uuid,boolean) TO authenticated;
