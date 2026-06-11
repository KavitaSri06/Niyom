/*
  # Fix snap_depository: enforce NOT NULL and DEFAULT

  ## Problem
  snap_depository was added to nw_deal_confirmations as a nullable column (no NOT NULL,
  no DEFAULT). Migration 20260611100000 used ADD COLUMN IF NOT EXISTS which was a no-op
  because the column already existed. The column therefore remained nullable despite the
  TypeScript type declaring it as string (non-optional).

  ## Fix
  1. Backfill any NULL values to '' before enforcing NOT NULL.
  2. Set NOT NULL on the column.
  3. Set DEFAULT '' so new rows that omit the field get an empty string automatically.

  ## Safety
  The UPDATE runs first — SET NOT NULL will fail if any NULL rows remain, so ordering
  matters. The ALTER COLUMN statements are transactional; if either fails the whole
  migration is rolled back.

  ## Rollback
    ALTER TABLE nw_deal_confirmations ALTER COLUMN snap_depository DROP NOT NULL;
    ALTER TABLE nw_deal_confirmations ALTER COLUMN snap_depository DROP DEFAULT;
*/

-- Step 1: Backfill NULLs before constraining
UPDATE nw_deal_confirmations
  SET snap_depository = ''
  WHERE snap_depository IS NULL;

-- Step 2: Enforce NOT NULL
ALTER TABLE nw_deal_confirmations
  ALTER COLUMN snap_depository SET NOT NULL;

-- Step 3: Ensure DEFAULT '' for future inserts that omit this field
ALTER TABLE nw_deal_confirmations
  ALTER COLUMN snap_depository SET DEFAULT '';
