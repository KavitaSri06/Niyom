/*
  # Fix Function Search Path Security Vulnerability

  1. Security Fix
    - Set immutable search_path on check_lead_rate_limit function
    - Prevents search_path manipulation attacks
    - Ensures function always uses the correct schema

  2. Notes
    - Unused indexes are expected on a new database
    - They will be used as data accumulates and queries are performed
    - The indexes are essential for:
      * orders.user_id - User's order history queries
      * share_news.bond_id - News by bond lookups
      * share_news.share_id - News by share lookups
      * investment_leads filters - Admin dashboard filtering/sorting
*/

-- Drop and recreate the function with a fixed search_path
CREATE OR REPLACE FUNCTION check_lead_rate_limit()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the same email has submitted more than 3 leads in the last hour
  IF (
    SELECT COUNT(*) 
    FROM public.investment_leads 
    WHERE email = NEW.email 
    AND created_at > NOW() - INTERVAL '1 hour'
  ) >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please try again later.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, pg_temp;

-- Add comment for documentation
COMMENT ON FUNCTION check_lead_rate_limit() IS 
  'Prevents spam by limiting lead submissions to 3 per email per hour. Uses fixed search_path for security.';