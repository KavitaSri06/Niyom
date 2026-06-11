/*
  # Fix email_status: enforce NOT NULL and add CHECK constraint

  ## Problem
  email_status exists in nw_deal_confirmations as nullable text with DEFAULT 'pending'
  but without a NOT NULL constraint or a CHECK constraint limiting values to the allowed
  set. Migration 20260609170000 used ADD COLUMN IF NOT EXISTS which was a no-op because
  the column already existed, so the NOT NULL and CHECK from that migration were never
  applied.

  ## Fix
  1. Backfill any NULL rows to 'pending' (required before SET NOT NULL).
  2. Set NOT NULL.
  3. Add a named CHECK constraint if one does not already exist for this column.
     The DO block prevents the migration from failing if this is run twice or if a
     differently-named CHECK was already applied.

  ## Rollback
    ALTER TABLE nw_deal_confirmations ALTER COLUMN email_status DROP NOT NULL;
    ALTER TABLE nw_deal_confirmations DROP CONSTRAINT IF EXISTS chk_nw_dc_email_status;

  ## Note on DEFAULT
  The DEFAULT 'pending' was already applied by migration 20260609170000.
  We do not reset it here to avoid a redundant operation.
*/

-- Step 1: Backfill NULLs
UPDATE nw_deal_confirmations
  SET email_status = 'pending'
  WHERE email_status IS NULL;

-- Step 2: Enforce NOT NULL
ALTER TABLE nw_deal_confirmations
  ALTER COLUMN email_status SET NOT NULL;

-- Step 3: Add CHECK constraint idempotently
-- Guards against re-running this migration or a CHECK added under a different name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint c
    JOIN   pg_class      t ON t.oid = c.conrelid
    JOIN   pg_namespace  n ON n.oid = t.relnamespace
    WHERE  n.nspname = 'public'
    AND    t.relname  = 'nw_deal_confirmations'
    AND    c.contype  = 'c'
    AND    pg_get_constraintdef(c.oid) LIKE '%email_status%'
  ) THEN
    ALTER TABLE nw_deal_confirmations
      ADD CONSTRAINT chk_nw_dc_email_status
      CHECK (email_status IN ('pending', 'sent'));
  END IF;
END $$;
