/*
  # Ensure the one-note-per-DSA-per-month unique constraint is gone

  20260718100000 tried to drop UNIQUE (dsa_id, month, year) with a dynamic
  lookup that compared conkey WITHOUT sorting, so it silently reported "not
  found" and may have left the constraint in place. With it present, a second
  note for the same DSA+month (the whole point of the fix) would fail.

  This drops it by the conventional auto-generated name, plus a corrected
  set-based dynamic lookup as a fallback. Idempotent and safe.
*/

-- Conventional Postgres name for UNIQUE (dsa_id, month, year).
ALTER TABLE dsa_debit_notes DROP CONSTRAINT IF EXISTS dsa_debit_notes_dsa_id_month_year_key;

-- Fallback: find any remaining unique constraint whose column SET is exactly
-- {dsa_id, month, year}, order-independent.
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'dsa_debit_notes'::regclass
     AND contype = 'u'
     AND (SELECT array_agg(k ORDER BY k) FROM unnest(conkey) k) = (
       SELECT array_agg(attnum ORDER BY attnum)
         FROM pg_attribute
        WHERE attrelid = 'dsa_debit_notes'::regclass
          AND attname IN ('dsa_id', 'month', 'year')
     );
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE dsa_debit_notes DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'Dropped remaining unique constraint %.', v_name;
  ELSE
    RAISE NOTICE 'No (dsa_id, month, year) unique constraint present — good.';
  END IF;
END $$;
