/*
  # Update employee and client code format

  1. Changes
    - Drop nw2_generate_employee_code (employee codes are now set manually by admin)
    - Update nw2_generate_client_code to produce NW-XXX-0001 format
      where NW-XXX is derived from the employee's NIYOM-XXX code
      e.g. employee NIYOM-001 → client prefix NW-001
*/

DROP FUNCTION IF EXISTS nw2_generate_employee_code();

CREATE OR REPLACE FUNCTION nw2_generate_client_code(p_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  emp_record record;
  prefix text;
  next_num int;
  new_code text;
BEGIN
  SELECT employee_code, role INTO emp_record FROM nw_employees WHERE id = p_employee_id;

  -- Convert NIYOM-001 → NW-001, or use NW-ADM for admin/super_admin without standard code
  IF emp_record.employee_code ~ '^NIYOM-[0-9]+$' THEN
    prefix := 'NW-' || SPLIT_PART(emp_record.employee_code, '-', 2);
  ELSE
    prefix := 'NW-' || REGEXP_REPLACE(emp_record.employee_code, '[^A-Z0-9]', '', 'g');
  END IF;

  SELECT COALESCE(MAX(CAST(SPLIT_PART(client_code, '-', 3) AS int)), 0) + 1
  INTO next_num
  FROM nw_clients
  WHERE client_code LIKE (prefix || '-%');

  new_code := prefix || '-' || LPAD(next_num::text, 4, '0');
  RETURN new_code;
END;
$$;
