/*
  # Remove Unused Indexes

  1. Changes
    - Drop `idx_orders_user_id` - orders table has no foreign key constraint on user_id
    - Drop `idx_share_news_bond_id` - flagged as unused by monitoring
    
  2. Notes
    - The share_news indexes were created for foreign keys but haven't been used yet
    - Indexes can be recreated later if query patterns show they're needed
    - This reduces index maintenance overhead and storage
*/

-- Drop unused indexes
DROP INDEX IF EXISTS idx_orders_user_id;
DROP INDEX IF EXISTS idx_share_news_bond_id;
DROP INDEX IF EXISTS idx_share_news_share_id;