/*
  # One booked transaction per deal — DB-level guard

  Context
    A deal can become business via two paths:
      1. Transfer Queue  -> nw_transfer_deal() RPC (admin)
      2. Add New Business -> operator picks the deal in Transactions

    The RPC is idempotent, but that only protects path 1 from re-running on
    the same deal. Nothing stopped a second row being created for a deal that
    was already booked — which would double-count revenue in MIS.

  This index makes that impossible at the database level, for ANY path:
  at most one 'transferred' transaction may exist per deal.

  A 'reversed' row is deliberately NOT covered by the predicate, so a deal can
  be reversed and re-booked later without tripping the constraint.

  Safety: verified against production before adding — 2 rows carry a
  deal_confirmation_id, both 'transferred', zero duplicates. The index builds
  cleanly.

  Additive-only. Nothing is dropped or reshaped.
*/

CREATE UNIQUE INDEX IF NOT EXISTS uq_nw_transactions_one_transferred_per_deal
  ON nw_transactions (deal_confirmation_id)
  WHERE deal_confirmation_id IS NOT NULL
    AND transfer_stage = 'transferred';
