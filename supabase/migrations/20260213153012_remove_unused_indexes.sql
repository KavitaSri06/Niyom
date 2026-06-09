/*
  # Remove Unused Indexes

  1. Security Improvements
    - Drop unused index `idx_orders_user_id` from orders table
    - Drop unused index `idx_share_news_bond_id` from share_news table
    - Drop unused index `idx_share_news_share_id` from share_news table
  
  2. Notes
    - These indexes were created but never utilized by queries
    - Foreign key constraints on these columns provide sufficient query performance
    - Removing unused indexes improves write performance and reduces storage overhead
*/

-- Drop unused indexes
DROP INDEX IF EXISTS public.idx_orders_user_id;
DROP INDEX IF EXISTS public.idx_share_news_bond_id;
DROP INDEX IF EXISTS public.idx_share_news_share_id;