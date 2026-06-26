/*
  # DSA Debit Notes — allow regeneration after cancellation

  ## Problem
  The original blanket `UNIQUE (dsa_id, month, year)` allowed only ONE debit
  note per DSA/month/year regardless of status. Once a note was cancelled, its
  row permanently occupied that slot, so no new note could ever be generated
  for that period — even after the underlying payout was corrected.

  ## Fix
  Replace the blanket unique constraint with a PARTIAL unique index that
  ignores cancelled notes. This keeps the business rule "at most one ACTIVE
  (generated/paid) note per DSA/month/year" while allowing any number of
  cancelled notes to coexist as immutable audit records alongside the new one.

  ## Scope / safety
  - Additive + behavioural only. No rows are modified or deleted.
  - Numbering logic is untouched (a new note still draws the next sequential
    number from `nw_generate_debit_note_number`).
  - The global `UNIQUE (debit_note_number)` is left intact, so every note —
    cancelled or active — keeps its own distinct number.
  - The constraint is dropped by matching its definition (not a hard-coded
    name), so the migration is robust regardless of the auto-generated name.
*/

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'dsa_debit_notes'
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) = 'UNIQUE (dsa_id, month, year)';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE dsa_debit_notes DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

-- At most one non-cancelled note per DSA/month/year; cancelled notes are
-- excluded so corrected re-generations can coexist with the audit record.
CREATE UNIQUE INDEX IF NOT EXISTS dsa_debit_notes_active_period_uniq
  ON dsa_debit_notes (dsa_id, month, year)
  WHERE status <> 'cancelled';
