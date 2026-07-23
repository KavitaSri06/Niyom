/*
  # Fix duplicate ICEX/Fusion booking for PATERSON (14 Jul 2026, 5000 qty)

  The same business was recorded twice for PATERSON WEALTH (a DSA client):
    - f8f5bfce (Indian Commodity Exchange, old name) — the REAL record: correct
      DSA price 2.2, carries the ₹1,500 DSA payout line + the portfolio holding,
      but had no deal link. MIS revenue (2.2 − 2.1) × 5000 = +₹500.
    - c58635ea (Fusion Techstack, new name) — a DUPLICATE created from deal
      4e2b9643 with NO DSA price, no payout line, no holding. Because PATERSON is
      a DSA client MIS uses the DSA price (null → 0), giving (0 − 2.1) × 5000 =
      −₹10,500. This negative is the reported bug.

  Owner authorised: delete the duplicate c58635ea and link the real record
  (f8f5bfce) to the deal so the deal doesn't bounce back into the Transfer Queue.
  Net MIS effect: −₹10,500 removed, correct +₹500 kept. DSA payout + holding are
  untouched.
*/

-- Bypass the post-transfer immutability guards for this single reconciliation.
ALTER TABLE nw_transactions DISABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;
ALTER TABLE nw_transactions DISABLE TRIGGER trg_nw_check_txn_post_transfer_immutable;

-- 1. Remove any documents on the duplicate (none expected), then the duplicate.
DELETE FROM nw_txn_documents WHERE txn_id = 'c58635ea-c09c-4d21-a018-1aba0a5c4080';
DELETE FROM nw_transactions  WHERE id     = 'c58635ea-c09c-4d21-a018-1aba0a5c4080';

-- 2. Link the real transaction to the (now free) deal so it's booked, not queued.
UPDATE nw_transactions
   SET deal_confirmation_id = '4e2b9643-dc09-4a89-ae86-7380d93b6953',
       updated_at = now()
 WHERE id = 'f8f5bfce-dc59-4644-aa96-cff9fc7dab03';

ALTER TABLE nw_transactions ENABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;
ALTER TABLE nw_transactions ENABLE TRIGGER trg_nw_check_txn_post_transfer_immutable;

-- 3. Recompute PATERSON's portfolio value (the duplicate had no holding).
UPDATE nw_clients c
   SET portfolio_value = COALESCE(
     (SELECT SUM(current_value) FROM nw_holdings WHERE client_id = c.id), 0)
 WHERE c.id = '682a18ca-38a2-44a5-9ef5-da931e4d9655';

DO $$
DECLARE v_dup int; v_link uuid;
BEGIN
  SELECT count(*) INTO v_dup FROM nw_transactions WHERE id = 'c58635ea-c09c-4d21-a018-1aba0a5c4080';
  SELECT deal_confirmation_id INTO v_link FROM nw_transactions WHERE id = 'f8f5bfce-dc59-4644-aa96-cff9fc7dab03';
  IF v_dup <> 0 THEN RAISE EXCEPTION 'Duplicate c58635ea still present'; END IF;
  IF v_link IS DISTINCT FROM '4e2b9643-dc09-4a89-ae86-7380d93b6953'::uuid THEN
    RAISE EXCEPTION 'Real txn not linked to deal (got %)', v_link;
  END IF;
  RAISE NOTICE 'PATERSON ICEX duplicate fixed: c58635ea deleted, f8f5bfce linked to deal.';
END $$;
