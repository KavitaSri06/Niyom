/*
  # Allow multiple active debit notes per DSA per month

  20260626120000 replaced the original UNIQUE (dsa_id, month, year) table
  constraint with a PARTIAL unique index — dsa_debit_notes_active_period_uniq,
  UNIQUE (dsa_id, month, year) WHERE status <> 'cancelled' — enforcing one
  ACTIVE note per DSA per month. (That's why the earlier migrations in this batch
  found no matching table constraint to drop: it was already an index.)

  That guard is exactly what stranded a payout arriving after a DSA's monthly
  note was paid. The protection against double-billing now lives at the
  transaction grain instead: dsa_debit_note_lines.UNIQUE(transaction_id) means a
  payout can belong to at most one active note, while a DSA may hold several
  notes in a month. So this index must go.

  Regeneration-after-cancel (the original purpose of 20260626120000) still works:
  cancelling a note deletes its lines, freeing those transactions for a new note.
*/

DROP INDEX IF EXISTS dsa_debit_notes_active_period_uniq;
