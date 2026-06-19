/*
  # Enhance DSA Debit Notes (V2.1)

  Additive, backward-compatible enhancements to the debit note module:

  1. Payment status tracking      — status / paid_at / paid_by (+ cancel audit)
  2. Future email support         — email_sent / email_sent_at
  3. Concurrency-safe numbering   — atomic counter table replacing COUNT(*)+1

  Nothing existing is dropped or altered destructively. All ADD COLUMN /
  CREATE statements use IF NOT EXISTS so this migration is safe whether or not
  the previous notes already exist.
*/

-- ---------------------------------------------------------------------------
-- 1. Payment status + audit columns
-- ---------------------------------------------------------------------------
ALTER TABLE dsa_debit_notes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  -- 2. Future email support (schema only — no sending implemented yet)
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- Constrain status to the allowed lifecycle values (idempotent add)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dsa_debit_notes_status_check'
  ) THEN
    ALTER TABLE dsa_debit_notes
      ADD CONSTRAINT dsa_debit_notes_status_check
      CHECK (status IN ('generated', 'paid', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dsa_debit_notes_status ON dsa_debit_notes(status);

-- ---------------------------------------------------------------------------
-- 3. Concurrency-safe debit note number generation
--
--    The previous implementation used COUNT(*) + 1, which is racy: two
--    concurrent transactions can read the same count and mint the same
--    number. We replace it with an atomic per-(year,month) counter using
--    INSERT ... ON CONFLICT DO UPDATE ... RETURNING, which takes a row lock
--    and serialises concurrent allocations — guaranteeing unique numbers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dsa_debit_note_counters (
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  last_seq int NOT NULL DEFAULT 0,
  PRIMARY KEY (year, month)
);

ALTER TABLE dsa_debit_note_counters ENABLE ROW LEVEL SECURITY;
-- No policies: the table is written only by the SECURITY DEFINER function
-- below (which runs as the table owner and bypasses RLS). Direct client
-- access is therefore denied.

-- Seed the counter from any debit notes that already exist, so we never
-- re-issue a number that was minted under the old COUNT(*)+1 logic.
INSERT INTO dsa_debit_note_counters (year, month, last_seq)
SELECT year, month, MAX(NULLIF(split_part(debit_note_number, '-', 4), '')::int)
FROM dsa_debit_notes
WHERE debit_note_number ~ '^DN-[0-9]{4}-[0-9]{2}-[0-9]+$'
GROUP BY year, month
ON CONFLICT (year, month)
DO UPDATE SET last_seq = GREATEST(dsa_debit_note_counters.last_seq, EXCLUDED.last_seq);

CREATE OR REPLACE FUNCTION nw_generate_debit_note_number(p_year int, p_month int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq int;
BEGIN
  INSERT INTO dsa_debit_note_counters (year, month, last_seq)
  VALUES (p_year, p_month, 1)
  ON CONFLICT (year, month)
  DO UPDATE SET last_seq = dsa_debit_note_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'DN-' || p_year::text || '-' || LPAD(p_month::text, 2, '0')
         || '-' || LPAD(v_seq::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION nw_generate_debit_note_number(int, int) TO authenticated;
