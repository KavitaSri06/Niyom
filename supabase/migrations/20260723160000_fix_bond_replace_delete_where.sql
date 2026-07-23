/*
  # Fix: replace-on-upload fails with "DELETE requires a WHERE clause"

  The project's DB blocks unqualified DELETE/UPDATE (the safeupdate guard), so the
  `DELETE FROM nw_bonds` in nw_bond_insert_batch(p_replace) was rejected. Add a
  WHERE that still matches every row (id is the PK, always non-null) so the full
  refresh works while satisfying the guard. Only that one line changes.
*/

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

  -- Fresh sheet replaces the whole list. WHERE id IS NOT NULL matches every row
  -- (satisfies the no-unqualified-DELETE guard). One transaction, so a failed
  -- insert rolls the delete back too.
  IF p_replace THEN
    DELETE FROM nw_bonds WHERE id IS NOT NULL;
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
