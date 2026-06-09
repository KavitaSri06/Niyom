/*
  # Add Enhanced Fields to Existing Tables

  ## Overview
  This migration adds detailed information fields to existing unlisted_shares
  and secondary_bonds tables, plus creates history and tracking tables.

  ## Changes

  ### 1. unlisted_shares table enhancements
    - Add `face_value` (numeric) - Par value of the share
    - Add `detailed_info` (text) - Detailed company information
    - Add `is_listed_nse` (boolean) - NSE listing status
    - Add `is_listed_bse` (boolean) - BSE listing status  
    - Add `last_verified` (timestamptz) - Last verification timestamp
    - Add `data_sources` (jsonb) - Array of data sources

  ### 2. secondary_bonds table enhancements
    - Add `rating_agency` (text) - CRISIL, ICRA, etc.
    - Add `frequency` (text) - Interest payment frequency
    - Add `bond_type` (text) - Corporate, Government, Tax-free
    - Add `sector` (text) - Industry sector
    - Add `listed_on` (text) - NSE, BSE, or both
    - Add `data_sources` (jsonb) - Array of data sources

  ### 3. New Tables

  #### share_price_history
    - Historical price tracking for 5-year analysis
    - `id` (uuid, primary key)
    - `share_symbol` (text, foreign key)
    - `price` (numeric)
    - `date` (date)
    - `source` (text)
    - `created_at` (timestamptz)

  #### bond_price_history
    - Historical bond pricing data
    - `id` (uuid, primary key)
    - `bond_isin` (text, foreign key)
    - `price` (numeric)
    - `yield` (numeric)
    - `date` (date)
    - `source` (text)
    - `created_at` (timestamptz)

  #### data_update_log
    - Track updates from each data source
    - `id` (uuid, primary key)
    - `source_name` (text)
    - `data_type` (text)
    - `last_update` (timestamptz)
    - `status` (text)
    - `records_updated` (integer)
    - `error_message` (text)

  ## Security
    - Enable RLS on new tables
    - Public read access
    - Service role write access
*/

-- Add new fields to unlisted_shares table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'unlisted_shares' AND column_name = 'face_value') THEN
    ALTER TABLE unlisted_shares ADD COLUMN face_value numeric DEFAULT 10.00;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'unlisted_shares' AND column_name = 'detailed_info') THEN
    ALTER TABLE unlisted_shares ADD COLUMN detailed_info text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'unlisted_shares' AND column_name = 'is_listed_nse') THEN
    ALTER TABLE unlisted_shares ADD COLUMN is_listed_nse boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'unlisted_shares' AND column_name = 'is_listed_bse') THEN
    ALTER TABLE unlisted_shares ADD COLUMN is_listed_bse boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'unlisted_shares' AND column_name = 'last_verified') THEN
    ALTER TABLE unlisted_shares ADD COLUMN last_verified timestamptz DEFAULT now();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'unlisted_shares' AND column_name = 'data_sources') THEN
    ALTER TABLE unlisted_shares ADD COLUMN data_sources jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Add new fields to secondary_bonds table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'secondary_bonds' AND column_name = 'rating_agency') THEN
    ALTER TABLE secondary_bonds ADD COLUMN rating_agency text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'secondary_bonds' AND column_name = 'frequency') THEN
    ALTER TABLE secondary_bonds ADD COLUMN frequency text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'secondary_bonds' AND column_name = 'bond_type') THEN
    ALTER TABLE secondary_bonds ADD COLUMN bond_type text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'secondary_bonds' AND column_name = 'sector') THEN
    ALTER TABLE secondary_bonds ADD COLUMN sector text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'secondary_bonds' AND column_name = 'listed_on') THEN
    ALTER TABLE secondary_bonds ADD COLUMN listed_on text;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'secondary_bonds' AND column_name = 'data_sources') THEN
    ALTER TABLE secondary_bonds ADD COLUMN data_sources jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Create share price history table
CREATE TABLE IF NOT EXISTS share_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_symbol text NOT NULL,
  price numeric NOT NULL,
  date date NOT NULL,
  source text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(share_symbol, date, source)
);

-- Create bond price history table
CREATE TABLE IF NOT EXISTS bond_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_isin text NOT NULL,
  price numeric NOT NULL,
  yield numeric,
  date date NOT NULL,
  source text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(bond_isin, date, source)
);

-- Create data update log table
CREATE TABLE IF NOT EXISTS data_update_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  data_type text NOT NULL,
  last_update timestamptz DEFAULT now(),
  status text DEFAULT 'success',
  records_updated integer DEFAULT 0,
  error_message text
);

-- Enable RLS on new tables
ALTER TABLE share_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE bond_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_update_log ENABLE ROW LEVEL SECURITY;

-- Public read policies
CREATE POLICY "Anyone can view share price history"
  ON share_price_history FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can view bond price history"
  ON bond_price_history FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can view update logs"
  ON data_update_log FOR SELECT
  TO public
  USING (true);

-- Service role policies
CREATE POLICY "Service role can manage share price history"
  ON share_price_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage bond price history"
  ON bond_price_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can manage update logs"
  ON data_update_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_share_price_history_symbol ON share_price_history(share_symbol);
CREATE INDEX IF NOT EXISTS idx_share_price_history_date ON share_price_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_bond_price_history_isin ON bond_price_history(bond_isin);
CREATE INDEX IF NOT EXISTS idx_bond_price_history_date ON bond_price_history(date DESC);
CREATE INDEX IF NOT EXISTS idx_unlisted_shares_sector ON unlisted_shares(sector);
CREATE INDEX IF NOT EXISTS idx_unlisted_shares_listed_status ON unlisted_shares(is_listed_nse, is_listed_bse);
CREATE INDEX IF NOT EXISTS idx_secondary_bonds_issuer ON secondary_bonds(issuer);
CREATE INDEX IF NOT EXISTS idx_secondary_bonds_maturity ON secondary_bonds(maturity_date);
CREATE INDEX IF NOT EXISTS idx_secondary_bonds_rating ON secondary_bonds(rating);