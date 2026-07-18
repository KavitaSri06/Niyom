/*
  # DSA debit notes — link a note to the exact payouts it covers

  Until now a debit note was a live re-aggregation of ALL a DSA's transactions
  for a month (DSAPayout.tsx groups by dsa_id), stored nothing about which
  transactions it covered, and the table enforced UNIQUE (dsa_id, month, year) —
  exactly one note per DSA per month. Result: a second payout arriving after a
  note was paid/signed merged into the live total but could never get its own
  note.

  This migration makes a note cover a specific set of transactions, and lets a
  DSA hold several notes in a month:

    1. Drop the one-note-per-DSA-per-month unique constraint.
    2. Add dsa_debit_note_lines(note, transaction) with UNIQUE(transaction_id)
       so a payout belongs to AT MOST ONE active note — the financial guard
       against double-billing. Cancelling a note deletes its lines (done in the
       app), freeing those transactions; the cancelled note's pdf_snapshot keeps
       the audit trail.

  Backfill of existing notes' coverage is a SEPARATE migration
  (20260718100100) so the schema and the data step can be verified independently.

  Additive except for the deliberate constraint drop; nothing is destroyed.
*/

-- ---------------------------------------------------------------------------
-- 1. Drop the one-note-per-DSA-per-month rule (auto-named table constraint)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
    FROM pg_constraint
   WHERE conrelid = 'dsa_debit_notes'::regclass
     AND contype = 'u'
     AND conkey = (
       SELECT array_agg(attnum ORDER BY attnum)
         FROM pg_attribute
        WHERE attrelid = 'dsa_debit_notes'::regclass
          AND attname IN ('dsa_id', 'month', 'year')
     );
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE dsa_debit_notes DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'Dropped unique constraint % (dsa_id, month, year).', v_name;
  ELSE
    RAISE NOTICE 'No (dsa_id, month, year) unique constraint found — already dropped.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Coverage lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dsa_debit_note_lines (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id  uuid NOT NULL REFERENCES dsa_debit_notes(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES nw_transactions(id) ON DELETE RESTRICT,
  payout         numeric(18,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- A payout belongs to at most one ACTIVE note. Cancelling a note deletes its
  -- lines (in the app), so the transaction can be re-covered by a new note.
  CONSTRAINT uq_dsa_debit_note_lines_txn UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_dsa_debit_note_lines_note
  ON dsa_debit_note_lines(debit_note_id);

ALTER TABLE dsa_debit_note_lines ENABLE ROW LEVEL SECURITY;

-- Access inherits the parent note: dsa_debit_notes is itself RLS-filtered, so an
-- EXISTS against it grants a line exactly to whoever may see/write that note.
CREATE POLICY "Access lines via parent note (select)"
  ON dsa_debit_note_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM dsa_debit_notes n WHERE n.id = debit_note_id));

CREATE POLICY "Access lines via parent note (insert)"
  ON dsa_debit_note_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM dsa_debit_notes n WHERE n.id = debit_note_id));

CREATE POLICY "Access lines via parent note (delete)"
  ON dsa_debit_note_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM dsa_debit_notes n WHERE n.id = debit_note_id));
