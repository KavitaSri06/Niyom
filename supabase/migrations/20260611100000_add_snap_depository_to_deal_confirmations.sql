/*
  # Add snap_depository to nw_deal_confirmations

  ## Problem
  DealConfirmation.tsx writes `snap_depository` on every insert/update
  (line 306) but the column was never added to the table. The value was
  silently dropped by Postgres.

  ## Fix
  Add the column with an empty-string default so existing rows are
  valid and the next save for any deal will populate it correctly.
*/

ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS snap_depository TEXT NOT NULL DEFAULT '';
