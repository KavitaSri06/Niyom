/*
  # Add Secure Client PAN Lookup RPC

  ## Purpose
  The client login flow needs to look up a client's email by their PAN number
  BEFORE the user is authenticated (they need the email to call signInWithPassword).
  Direct table access via anon key is blocked by RLS.

  ## Solution
  A SECURITY DEFINER function that safely returns only the minimal fields
  needed for login: id, email, client_password_changed. It never reveals
  sensitive data and only works when client_login_enabled = true.

  ## Security
  - Only returns id, email, client_password_changed (no PAN, no financial data)
  - Only works when client_login_enabled = true
  - Granted to anon and authenticated roles (needed pre-auth)
  - SET search_path = '' to prevent search path injection
*/

CREATE OR REPLACE FUNCTION public.get_client_login_by_pan(p_pan text)
RETURNS TABLE(
  client_id uuid,
  client_email text,
  password_changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS client_id,
    c.email AS client_email,
    c.client_password_changed AS password_changed
  FROM public.nw_clients c
  WHERE c.pan = upper(trim(p_pan))
    AND c.client_login_enabled = true
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_login_by_pan(text) TO anon, authenticated;
