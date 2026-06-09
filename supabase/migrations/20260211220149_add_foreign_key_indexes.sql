/*
  # Add Foreign Key Indexes for Performance

  1. Performance Optimization
    - Add index on `orders.user_id` for foreign key `orders_user_id_fkey`
    - Add index on `share_news.bond_id` for foreign key `share_news_bond_id_fkey`  
    - Add index on `share_news.share_id` for foreign key `share_news_share_id_fkey`

  ## Important Notes
  - These indexes significantly improve query performance for:
    - JOIN operations on these foreign keys
    - CASCADE operations on UPDATE/DELETE
    - Queries filtering by these foreign key columns
  - Without these indexes, queries can experience table scans leading to poor performance
  - These are covering indexes for the foreign key constraints identified in security audit
*/

-- Add index for orders.user_id foreign key
-- Improves performance when querying orders by user or joining with auth.users
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);

-- Add index for share_news.bond_id foreign key  
-- Improves performance when querying news by bond or joining with secondary_bonds
CREATE INDEX IF NOT EXISTS idx_share_news_bond_id ON public.share_news(bond_id);

-- Add index for share_news.share_id foreign key
-- Improves performance when querying news by share or joining with unlisted_shares  
CREATE INDEX IF NOT EXISTS idx_share_news_share_id ON public.share_news(share_id);