/*
  # One-off reversal: un-book ANSHUL BHARDWAJ's deal (booked via the old
    Add New Business picker) so it returns to the Transfer Queue

  Deal DC-1784622031623 (id 2080b061-…) — ANSHUL BHARDWAJ, DEEPAK HOUSEWARE &
  TOYS LIMITED, 5000 @ ₹287,500 — was accidentally booked through the Add New
  Business deal-picker on 2026-07-22 (transfer_remarks 'Booked via Add New
  Business', transfer_reference NULL), which auto-transferred it and removed it
  from the Transfer Queue. The picker no longer books deals (it now pre-fills
  only); this reverses the one accidental booking.

  Verified before writing (owner authorised, single deal):
    - transaction 81c5dc0c-… is direct-sourced (no dsa_debit_note_lines),
    - has no nw_txn_documents,
    - the deal has no 'transferred' event (it bypassed nw_transfer_deal),
    - exactly one holding (3d6921c6-…, qty 5000 = the transaction's qty) came
      from this booking.

  After this, deal 2080b061 (acceptance pending, fully paid, no transferred
  transaction) reappears in nw_deal_transfer_eligible → the Transfer Queue.
*/

-- 1. Remove the portfolio holding this booking created.
DELETE FROM nw_holdings WHERE id = '3d6921c6-c5c7-490c-8c26-78c569e0d560';

-- 2. Delete the transferred transaction. The no-delete-after-transfer guard is
--    bypassed for this single administrative reversal, then restored.
ALTER TABLE nw_transactions DISABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;
DELETE FROM nw_transactions WHERE id = '81c5dc0c-085e-4aef-bdbb-d6ee2d1149b7';
ALTER TABLE nw_transactions ENABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;

-- 3. Recompute ANSHUL's portfolio value from remaining holdings.
UPDATE nw_clients c
   SET portfolio_value = COALESCE(
     (SELECT SUM(current_value) FROM nw_holdings WHERE client_id = c.id), 0)
 WHERE c.id = 'd9fc4a96-7a91-4145-8f74-f331bf206796';

DO $$
DECLARE v_txn int; v_hold int;
BEGIN
  SELECT count(*) INTO v_txn FROM nw_transactions WHERE id = '81c5dc0c-085e-4aef-bdbb-d6ee2d1149b7';
  SELECT count(*) INTO v_hold FROM nw_holdings WHERE id = '3d6921c6-c5c7-490c-8c26-78c569e0d560';
  IF v_txn <> 0 OR v_hold <> 0 THEN
    RAISE EXCEPTION 'Reversal incomplete: txn=% holding=% still present', v_txn, v_hold;
  END IF;
  RAISE NOTICE 'ANSHUL booking reversed: deal 2080b061 is back in the Transfer Queue.';
END $$;
