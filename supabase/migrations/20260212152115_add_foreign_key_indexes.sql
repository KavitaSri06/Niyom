/*
  # Add Foreign Key Indexes

  1. New Indexes
    - idx_orders_user_id on orders(user_id)
      - Improves performance when querying orders by user
      - Optimizes foreign key constraint checks
    
    - idx_share_news_bond_id on share_news(bond_id)
      - Improves performance when querying news by bond
      - Optimizes foreign key constraint checks
    
    - idx_share_news_share_id on share_news(share_id)
      - Improves performance when querying news by share
      - Optimizes foreign key constraint checks

  2. Performance Impact
    - Speeds up JOIN operations on these foreign keys
    - Improves DELETE operations on parent tables
    - Optimizes foreign key constraint validation
    
  3. Notes
    - These indexes cover foreign key relationships that were previously unindexed
    - Leaked password protection must be enabled in Supabase Dashboard
*/

-- Add index for orders.user_id foreign key
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Add index for share_news.bond_id foreign key
CREATE INDEX IF NOT EXISTS idx_share_news_bond_id ON share_news(bond_id);

-- Add index for share_news.share_id foreign key
CREATE INDEX IF NOT EXISTS idx_share_news_share_id ON share_news(share_id);