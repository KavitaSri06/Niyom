/*
  # Drop the redundant one-transaction-per-deal index

  20260717090000 added:
      uq_nw_transactions_one_transferred_per_deal
      ON nw_transactions (deal_confirmation_id)
      WHERE deal_confirmation_id IS NOT NULL AND transfer_stage = 'transferred'

  That was a mistake. 20260702100000 already ships:
      uq_nw_transactions_deal
      ON nw_transactions (deal_confirmation_id)
      WHERE deal_confirmation_id IS NOT NULL

  The existing index has the WEAKER predicate, so it constrains strictly MORE
  rows: at most one transaction per deal regardless of transfer_stage. Any
  insert that would violate the new index already violates the old one, so the
  new index can never fire and only costs write throughput.

  Dropping it. The double-booking guarantee is unchanged and still enforced by
  uq_nw_transactions_deal.
*/

DROP INDEX IF EXISTS uq_nw_transactions_one_transferred_per_deal;
