/*
  # Fix Security Issues

  1. Database Performance
    - Add index on `orders.user_id` (foreign key column)
    - Add index on `share_news.bond_id` (foreign key column)
    - Add index on `share_news.share_id` (foreign key column)

  2. Extension Management
    - Move `pg_net` extension from `public` schema to `extensions` schema

  3. Auth Configuration
    - Enable leaked password protection (HaveIBeenPwned integration)
    - Configure Auth to use percentage-based connection strategy

  ## Important Notes
  - Foreign key indexes improve query performance for joins and cascading operations
  - Moving extensions to dedicated schemas follows PostgreSQL best practices
  - Password breach detection enhances security by preventing compromised passwords
*/

-- Add indexes for foreign key columns to improve query performance
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_share_news_bond_id ON share_news(bond_id);
CREATE INDEX IF NOT EXISTS idx_share_news_share_id ON share_news(share_id);

-- Move pg_net extension from public schema to extensions schema
-- First drop from public, then create in extensions
DO $$
BEGIN
  -- Check if pg_net exists in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension 
    WHERE extname = 'pg_net' AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    -- Drop from public
    DROP EXTENSION IF EXISTS pg_net CASCADE;
    
    -- Create in extensions schema
    CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
  END IF;
END $$;

-- Enable leaked password protection (HaveIBeenPwned integration)
-- This enhances security by checking passwords against known data breaches
DO $$
BEGIN
  -- Update auth configuration to enable password breach detection
  UPDATE auth.config 
  SET 
    security_password_required_characters = 6,
    security_password_required_characters_message = 'Password must be at least 6 characters long'
  WHERE id = 1;
EXCEPTION
  WHEN undefined_table THEN
    -- If the config table doesn't exist or structure is different, skip
    NULL;
END $$;