/*
  # Add payout_date_pattern column to holdings and transactions

  ## Summary
  The interest_payout_date column is type DATE and cannot store DD/MM or DD patterns.
  This migration adds a text column payout_date_pattern to both tables to store
  the recurring payout day/month pattern (e.g. "15/03" for annual, "15" for monthly).
  The interest_payout_date column will hold the next computed actual payout date.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_holdings' AND column_name = 'payout_date_pattern'
  ) THEN
    ALTER TABLE nw_holdings ADD COLUMN payout_date_pattern text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_transactions' AND column_name = 'payout_date_pattern'
  ) THEN
    ALTER TABLE nw_transactions ADD COLUMN payout_date_pattern text;
  END IF;
END $$;
