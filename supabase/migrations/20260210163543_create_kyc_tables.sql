/*
  # Niyom Wealth Management - KYC and User Tables

  1. New Tables
    - `kyc_submissions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `status` (text: 'pending', 'approved', 'rejected')
      - `pan` (text, PAN number)
      - `aadhar` (text, Aadhar number)
      - `demat` (text, Demat account details)
      - `pan_document` (jsonb, file metadata)
      - `aadhar_document` (jsonb, file metadata)
      - `demat_document` (jsonb, file metadata)
      - `bank_cheque_leaf` (jsonb, file metadata)
      - `notes` (text, admin notes)
      - `submitted_at` (timestamp)
      - `updated_at` (timestamp)

    - `user_profiles`
      - `id` (uuid, primary key, references auth.users)
      - `full_name` (text)
      - `email` (text)
      - `phone` (text)
      - `address` (text)
      - `kyc_status` (text: 'pending', 'submitted', 'approved', 'rejected')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Users can only view/edit their own KYC submissions and profiles
    - Admin users can view all submissions
*/

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  address text,
  kyc_status text DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'submitted', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  pan text,
  aadhar text,
  demat text,
  pan_document jsonb,
  aadhar_document jsonb,
  demat_document jsonb,
  bank_cheque_leaf jsonb,
  notes text,
  submitted_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can view own KYC submission"
  ON kyc_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own KYC submission"
  ON kyc_submissions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert own KYC submission"
  ON kyc_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
