/*
  # Add txn_date to nw_holdings

  ## Summary
  Adds a `txn_date` column to `nw_holdings` to record the date of the original
  transaction when a holding is added as existing/past business.

  ## Changes
  - `nw_holdings`: add optional `txn_date` (date) column
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_holdings' AND column_name = 'txn_date'
  ) THEN
    ALTER TABLE nw_holdings ADD COLUMN txn_date date;
  END IF;
END $$;
