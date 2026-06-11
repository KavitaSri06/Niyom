/*
  # Add depository column to nw_clients

  ## Problem
  ClientOnboarding.tsx sets `depository` on insert and DealConfirmation.tsx
  reads it when building the deal snapshot, but the column was never created
  in the schema.  New clients written via onboarding were silently dropping
  the value; DealConfirmation was casting the client record with `as any` to
  avoid the TypeScript error.

  ## Fix
  Add the column and backfill existing rows using the same detection logic
  that ClientOnboarding uses:
    demat_account starts with "IN"  →  NSDL
    anything else                   →  CDSL
  Rows with no demat account are left as empty string.
*/

ALTER TABLE nw_clients
  ADD COLUMN IF NOT EXISTS depository TEXT NOT NULL DEFAULT '';

-- Backfill rows that have a demat account recorded
UPDATE nw_clients
SET depository = CASE
  WHEN UPPER(TRIM(demat_account)) LIKE 'IN%' THEN 'NSDL'
  WHEN TRIM(demat_account) <> ''             THEN 'CDSL'
  ELSE ''
END
WHERE depository = '';
