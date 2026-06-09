/*
  # Create Orders Table

  1. New Tables
    - `orders`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `share_symbol` (text, references unlisted_shares)
      - `company_name` (text)
      - `order_type` (text, 'buy' or 'sell')
      - `quantity` (integer, must be multiple of lot size)
      - `price_per_share` (decimal)
      - `total_amount` (decimal)
      - `status` (text, default 'pending')
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `orders` table
    - Add policy for users to view their own orders
    - Add policy for users to create their own orders
    - Add policy for users to update their own orders
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  share_symbol text NOT NULL,
  company_name text NOT NULL,
  order_type text NOT NULL CHECK (order_type IN ('buy', 'sell')),
  quantity integer NOT NULL CHECK (quantity > 0),
  price_per_share decimal(15, 2) NOT NULL CHECK (price_per_share > 0),
  total_amount decimal(15, 2) NOT NULL CHECK (total_amount > 0),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON orders
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders"
  ON orders
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders"
  ON orders
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_share_symbol ON orders(share_symbol);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);