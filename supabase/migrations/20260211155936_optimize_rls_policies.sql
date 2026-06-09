/*
  # Optimize RLS Policies for Performance

  This migration optimizes Row Level Security policies to improve query performance
  at scale by preventing re-evaluation of auth.uid() for each row.

  ## Changes Made
  
  1. **user_profiles table policies**
     - Drops and recreates "Users can view own profile" policy
     - Drops and recreates "Users can update own profile" policy  
     - Drops and recreates "Users can insert own profile" policy
     - All policies now use (select auth.uid()) instead of auth.uid()

  2. **kyc_submissions table policies**
     - Drops and recreates "Users can view own KYC submission" policy
     - Drops and recreates "Users can update own KYC submission" policy
     - Drops and recreates "Users can insert own KYC submission" policy
     - All policies now use (select auth.uid()) instead of auth.uid()

  ## Security Impact
  
  - No change to security model - same access controls apply
  - Significant performance improvement for queries at scale
  - Follows Supabase best practices for RLS optimization
*/

-- Drop existing policies for user_profiles
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profiles;

-- Recreate optimized policies for user_profiles
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

-- Drop existing policies for kyc_submissions
DROP POLICY IF EXISTS "Users can view own KYC submission" ON kyc_submissions;
DROP POLICY IF EXISTS "Users can update own KYC submission" ON kyc_submissions;
DROP POLICY IF EXISTS "Users can insert own KYC submission" ON kyc_submissions;

-- Recreate optimized policies for kyc_submissions
CREATE POLICY "Users can view own KYC submission"
  ON kyc_submissions FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own KYC submission"
  ON kyc_submissions FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own KYC submission"
  ON kyc_submissions FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);