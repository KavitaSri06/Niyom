/*
  # Remove re-entered HINDUJA duplicates (already completed via DN-2026-07-0002)

  Owner confirmed these two HINDUJA LEYLAND FINANCE transactions are re-entries of
  business already completed & paid out earlier (DN-2026-07-0002); they must not
  exist in pending payout, MIS, or the portfolio:

    0122daf5-100d-405b-8352-1271fd707063  SANJAY GUPTA (NW-006-0006)  500 @ 2026-07-03
    e32d207c-97cd-451f-8c52-c2892c419594  PAYAL GARG  (NW-006-0005) 1000 @ 2026-07-03

  Verified: no dsa_debit_note_lines reference them (removed from DN-2026-07-0016),
  they are the only HINDUJA transactions for these two clients, and only SANJAY's
  holding was created from one of them. Deleting is safe. Details above allow
  re-entry if ever needed. The no-delete-after-transfer guard is bypassed for this
  one reconciliation.
*/

CREATE TEMP TABLE _affected AS
  SELECT DISTINCT client_id FROM nw_transactions
   WHERE id IN ('0122daf5-100d-405b-8352-1271fd707063',
                'e32d207c-97cd-451f-8c52-c2892c419594');

ALTER TABLE nw_transactions DISABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;

DELETE FROM nw_txn_documents
 WHERE txn_id IN ('0122daf5-100d-405b-8352-1271fd707063',
                  'e32d207c-97cd-451f-8c52-c2892c419594');

-- Duplicate holdings created by these transactions (their only HINDUJA txns).
DELETE FROM nw_holdings h
 USING nw_transactions t
 WHERE t.id IN ('0122daf5-100d-405b-8352-1271fd707063',
                'e32d207c-97cd-451f-8c52-c2892c419594')
   AND h.client_id = t.client_id
   AND h.product_name = t.product_name;

DELETE FROM nw_transactions
 WHERE id IN ('0122daf5-100d-405b-8352-1271fd707063',
              'e32d207c-97cd-451f-8c52-c2892c419594');

ALTER TABLE nw_transactions ENABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;

UPDATE nw_clients c
   SET portfolio_value = COALESCE(
     (SELECT SUM(current_value) FROM nw_holdings WHERE client_id = c.id), 0)
 WHERE c.id IN (SELECT client_id FROM _affected);

DROP TABLE _affected;

DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM nw_transactions
   WHERE id IN ('0122daf5-100d-405b-8352-1271fd707063',
                'e32d207c-97cd-451f-8c52-c2892c419594');
  IF v <> 0 THEN RAISE EXCEPTION 'Duplicates still present (%).', v; END IF;
  RAISE NOTICE 'Re-entered HINDUJA duplicates removed.';
END $$;
