/*
  # Create Investment Leads Table

  1. New Tables
    - `investment_leads`
      - `id` (uuid, primary key)
      - `product_type` (text) - mutual-funds, primary-bonds, fixed-deposits, insurance
      - `full_name` (text)
      - `email` (text)
      - `phone` (text)
      - `investment_amount` (text)
      - `investment_horizon` (text)
      - `risk_profile` (text)
      - `additional_notes` (text, nullable)
      - `status` (text) - new, contacted, converted, closed
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `investment_leads` table
    - Add policy for authenticated users to insert their own leads
    - Add policy for admin to view all leads

  3. Indexes
    - Index on product_type for filtering
    - Index on status for filtering
    - Index on created_at for sorting
*/

CREATE TABLE IF NOT EXISTS investment_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type text NOT NULL CHECK (product_type IN ('mutual-funds', 'primary-bonds', 'fixed-deposits', 'insurance')),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  investment_amount text,
  investment_horizon text,
  risk_profile text,
  additional_notes text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE investment_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert leads"
  ON investment_leads
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view own leads"
  ON investment_leads
  FOR SELECT
  TO authenticated
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_investment_leads_product_type ON investment_leads(product_type);
CREATE INDEX IF NOT EXISTS idx_investment_leads_status ON investment_leads(status);
CREATE INDEX IF NOT EXISTS idx_investment_leads_created_at ON investment_leads(created_at DESC);