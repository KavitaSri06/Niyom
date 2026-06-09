/*
  # Fix Security Issues

  1. Remove Unused Indexes
    - Drop 11 unused indexes that are consuming resources without providing value
    - Improves write performance and reduces storage overhead
    
    Indexes to be removed:
    - idx_orders_user_id (orders table)
    - idx_share_news_bond_id (share_news table)
    - idx_share_news_share_id (share_news table)
    - idx_share_price_history_symbol (share_price_history table)
    - idx_bond_price_history_isin (bond_price_history table)
    - idx_bond_price_history_date (bond_price_history table)
    - idx_unlisted_shares_sector (unlisted_shares table)
    - idx_unlisted_shares_listed_status (unlisted_shares table)
    - idx_secondary_bonds_issuer (secondary_bonds table)
    - idx_secondary_bonds_maturity (secondary_bonds table)
    - idx_secondary_bonds_rating (secondary_bonds table)

  2. Fix Function Search Path Security
    - Recreate delete_old_news function with immutable search_path
    - Prevents potential security vulnerabilities from search_path manipulation
    
  3. Notes
    - Leaked password protection must be enabled in Supabase Dashboard under Authentication settings
    - Cannot be configured via SQL migrations
*/

-- Drop unused indexes
DROP INDEX IF EXISTS idx_orders_user_id;
DROP INDEX IF EXISTS idx_share_news_bond_id;
DROP INDEX IF EXISTS idx_share_news_share_id;
DROP INDEX IF EXISTS idx_share_price_history_symbol;
DROP INDEX IF EXISTS idx_bond_price_history_isin;
DROP INDEX IF EXISTS idx_bond_price_history_date;
DROP INDEX IF EXISTS idx_unlisted_shares_sector;
DROP INDEX IF EXISTS idx_unlisted_shares_listed_status;
DROP INDEX IF EXISTS idx_secondary_bonds_issuer;
DROP INDEX IF EXISTS idx_secondary_bonds_maturity;
DROP INDEX IF EXISTS idx_secondary_bonds_rating;

-- Fix function search path security issue
-- Drop the existing function and recreate with proper security settings
DROP FUNCTION IF EXISTS delete_old_news();

CREATE OR REPLACE FUNCTION delete_old_news()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM news 
  WHERE published_at < NOW() - INTERVAL '30 days';
END;
$$;