/*
  # Create Unlisted Shares and Secondary Bonds Tables

  1. New Tables
    - `unlisted_shares`
      - `id` (uuid, primary key)
      - `symbol` (text, unique) - Stock symbol/ticker
      - `company_name` (text) - Full company name
      - `current_price` (numeric) - Current grey market price
      - `previous_price` (numeric) - Previous price for comparison
      - `price_change_percent` (numeric) - Percentage change
      - `lot_size` (integer) - Minimum lot size
      - `sector` (text) - Industry sector
      - `description` (text) - Company description
      - `last_updated` (timestamptz) - Last price update timestamp
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `secondary_bonds`
      - `id` (uuid, primary key)
      - `bond_name` (text) - Bond name
      - `issuer` (text) - Bond issuer name
      - `isin` (text, unique) - ISIN code
      - `current_yield` (numeric) - Current yield percentage
      - `coupon_rate` (numeric) - Coupon rate
      - `maturity_date` (date) - Maturity date
      - `face_value` (numeric) - Face value
      - `current_price` (numeric) - Current trading price
      - `previous_price` (numeric) - Previous price
      - `price_change_percent` (numeric) - Percentage change
      - `rating` (text) - Credit rating
      - `description` (text) - Bond description
      - `last_updated` (timestamptz) - Last price update timestamp
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `share_news`
      - `id` (uuid, primary key)
      - `share_id` (uuid, foreign key to unlisted_shares)
      - `bond_id` (uuid, foreign key to secondary_bonds)
      - `title` (text) - News headline
      - `content` (text) - News content
      - `source` (text) - News source
      - `published_at` (timestamptz) - Publication date
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for public read access (these are public market data)
    - Only authenticated admins can write (handled via edge functions)

  3. Indexes
    - Add indexes for efficient querying by price and last_updated
*/

-- Unlisted Shares Table
CREATE TABLE IF NOT EXISTS unlisted_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text UNIQUE NOT NULL,
  company_name text NOT NULL,
  current_price numeric NOT NULL DEFAULT 0,
  previous_price numeric DEFAULT 0,
  price_change_percent numeric DEFAULT 0,
  lot_size integer DEFAULT 1,
  sector text DEFAULT '',
  description text DEFAULT '',
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Secondary Bonds Table
CREATE TABLE IF NOT EXISTS secondary_bonds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_name text NOT NULL,
  issuer text NOT NULL,
  isin text UNIQUE NOT NULL,
  current_yield numeric DEFAULT 0,
  coupon_rate numeric DEFAULT 0,
  maturity_date date,
  face_value numeric DEFAULT 1000,
  current_price numeric NOT NULL DEFAULT 0,
  previous_price numeric DEFAULT 0,
  price_change_percent numeric DEFAULT 0,
  rating text DEFAULT '',
  description text DEFAULT '',
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Share News Table (for both shares and bonds)
CREATE TABLE IF NOT EXISTS share_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid REFERENCES unlisted_shares(id) ON DELETE CASCADE,
  bond_id uuid REFERENCES secondary_bonds(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text DEFAULT '',
  source text DEFAULT '',
  published_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT share_or_bond_check CHECK (
    (share_id IS NOT NULL AND bond_id IS NULL) OR 
    (share_id IS NULL AND bond_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE unlisted_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE secondary_bonds ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_news ENABLE ROW LEVEL SECURITY;

-- Public read access for market data
CREATE POLICY "Anyone can view unlisted shares"
  ON unlisted_shares FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can view secondary bonds"
  ON secondary_bonds FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Anyone can view share news"
  ON share_news FOR SELECT
  TO public
  USING (true);

-- Only authenticated users can insert/update (via edge functions with service role)
CREATE POLICY "Authenticated users can insert unlisted shares"
  ON unlisted_shares FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update unlisted shares"
  ON unlisted_shares FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert bonds"
  ON secondary_bonds FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update bonds"
  ON secondary_bonds FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert share news"
  ON share_news FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_unlisted_shares_price ON unlisted_shares(current_price DESC);
CREATE INDEX IF NOT EXISTS idx_unlisted_shares_updated ON unlisted_shares(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_secondary_bonds_yield ON secondary_bonds(current_yield DESC);
CREATE INDEX IF NOT EXISTS idx_secondary_bonds_updated ON secondary_bonds(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_share_news_share_id ON share_news(share_id);
CREATE INDEX IF NOT EXISTS idx_share_news_bond_id ON share_news(bond_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_unlisted_shares_updated_at ON unlisted_shares;
CREATE TRIGGER update_unlisted_shares_updated_at
  BEFORE UPDATE ON unlisted_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_secondary_bonds_updated_at ON secondary_bonds;
CREATE TRIGGER update_secondary_bonds_updated_at
  BEFORE UPDATE ON secondary_bonds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();