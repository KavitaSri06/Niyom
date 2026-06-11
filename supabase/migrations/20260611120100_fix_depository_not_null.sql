/*
  # Fix nw_clients.depository: enforce NOT NULL and DEFAULT

  ## Problem
  depository was added to nw_clients as a nullable column (no NOT NULL, no DEFAULT).
  Migration 20260611100100 used ADD COLUMN IF NOT EXISTS which was a no-op because the
  column already existed. The column remained nullable despite NWClient.depository being
  typed as string (non-optional) in types.ts.

  ## Fix
  1. Backfill NULL rows using the same NSDL/CDSL detection logic that ClientOnboarding
     uses at insert time:
       demat_account starts with "IN"  →  NSDL
       any other non-empty value       →  CDSL
       empty / no demat account        →  ''
  2. Set NOT NULL.
  3. Set DEFAULT '' so new rows that omit the field get an empty string.

  ## Safety
  The UPDATE runs first so no NULL rows remain before SET NOT NULL is applied.
  Both ALTER statements are transactional.

  ## Rollback
    ALTER TABLE nw_clients ALTER COLUMN depository DROP NOT NULL;
    ALTER TABLE nw_clients ALTER COLUMN depository DROP DEFAULT;
*/

-- Step 1: Backfill NULLs with NSDL/CDSL detection
UPDATE nw_clients
  SET depository = CASE
    WHEN UPPER(TRIM(demat_account)) LIKE 'IN%' THEN 'NSDL'
    WHEN TRIM(demat_account) <> ''             THEN 'CDSL'
    ELSE ''
  END
  WHERE depository IS NULL;

-- Step 2: Enforce NOT NULL
ALTER TABLE nw_clients
  ALTER COLUMN depository SET NOT NULL;

-- Step 3: Ensure DEFAULT '' for future inserts that omit this field
ALTER TABLE nw_clients
  ALTER COLUMN depository SET DEFAULT '';
