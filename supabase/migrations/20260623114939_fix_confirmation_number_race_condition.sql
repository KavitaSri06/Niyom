-- Replace the confirmation number generator with a race-condition-safe version.
-- Uses MAX() on the numeric suffix instead of COUNT(), so concurrent inserts
-- that haven't committed yet don't interfere, and wraps the row in a lock.
CREATE OR REPLACE FUNCTION nw_generate_confirmation_number(p_employee_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_emp_code text;
  v_max_seq  int;
  v_number   text;
BEGIN
  -- Lock the employee row to serialize concurrent calls for the same employee
  SELECT employee_code INTO v_emp_code
  FROM nw_employees
  WHERE id = p_employee_id
  FOR UPDATE;

  -- Derive next sequence from the highest existing suffix, not from COUNT
  -- This is safe against gaps left by deleted records and concurrent inserts
  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(regexp_replace(confirmation_number, '^DC-[^-]+-0*', ''), '')
        AS integer
      )
    ), 0
  ) + 1
  INTO v_max_seq
  FROM nw_deal_confirmations
  WHERE employee_id = p_employee_id;

  v_number := 'DC-' || COALESCE(v_emp_code, 'ADM') || '-' || LPAD(v_max_seq::text, 3, '0');
  RETURN v_number;
END;
$$;
