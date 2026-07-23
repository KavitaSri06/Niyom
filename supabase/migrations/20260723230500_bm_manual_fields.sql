/*
  # Manual verification — set + lock master fields

  For bonds no provider covers (or that need a correction), an admin can key the
  master fields. bm_set_fields writes the whitelisted columns, records manual
  provenance at 100% confidence, and (optionally) LOCKS them so enrichment never
  overwrites them. The caller then re-runs enrichment for that ISIN, which
  recomputes analytics/schedules from the now-present values (the orchestrator
  already uses existing values when a provider returns nothing, and respects locks).
*/

CREATE OR REPLACE FUNCTION bm_set_fields(p_bond_id uuid, p_fields jsonb, p_lock boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  emp uuid := nw_current_employee_id();
  editable text[] := ARRAY['bond_name','coupon_rate','coupon_type','coupon_frequency',
    'interest_payment_dates','maturity_date','issue_date','redemption_date','face_value',
    'rating','rating_agency','seniority','security_type','tax_status','trustee',
    'day_count_convention','business_day_convention','principal_repayment_structure'];
  k text; v text; setclause text := '';
BEGIN
  IF NOT nw_current_emp_is_admin() THEN RAISE EXCEPTION 'Only administrators can verify bonds.'; END IF;
  FOR k IN SELECT jsonb_object_keys(p_fields) LOOP
    IF k = ANY(editable) THEN
      v := p_fields->>k;
      IF k IN ('coupon_rate','face_value') THEN
        setclause := setclause || format('%I = %L::numeric, ', k, NULLIF(v,''));
      ELSIF k IN ('maturity_date','issue_date','redemption_date') THEN
        setclause := setclause || format('%I = %L::date, ', k, NULLIF(v,''));
      ELSE
        setclause := setclause || format('%I = %L, ', k, COALESCE(v,''));
      END IF;
      INSERT INTO bm_field_provenance(bond_id, field_name, value, source, confidence, is_locked, verified_by, verified_at)
        VALUES (p_bond_id, k, v, 'manual', 100, p_lock, emp, now())
        ON CONFLICT (bond_id, field_name) DO UPDATE
          SET value = EXCLUDED.value, source = 'manual', confidence = 100,
              is_locked = p_lock, verified_by = emp, verified_at = now(), updated_at = now();
    END IF;
  END LOOP;
  IF setclause <> '' THEN
    EXECUTE 'UPDATE bm_bonds SET ' || left(setclause, length(setclause) - 2) || ', modified_by = $1 WHERE id = $2'
      USING emp, p_bond_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION bm_set_fields(uuid, jsonb, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bm_set_fields(uuid, jsonb, boolean) TO authenticated;
