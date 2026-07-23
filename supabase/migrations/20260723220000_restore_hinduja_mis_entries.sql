/*
  # Restore the two HINDUJA transactions (legitimate MIS business)

  20260723210000 deleted them as DSA-payout duplicates, but the DSA payout was
  the only duplicate part — the transactions themselves are genuine firm revenue
  and their removal wrongly dropped MIS revenue + portfolio. Owner asked to add
  them back "from the old one" (DN-2026-07-0002).

  Re-created with the exact prices (verified via activity logs: ₹1.20 L and
  ₹2.40 L) and marked as covered by DN-2026-07-0002 so they do NOT re-appear in
  the pending DSA payout (the DSA was already paid for them):

    SANJAY GUPTA (NW-006-0006) HINDUJA 500  @ client 240,   dsa 232, landing 230
    PAYAL GARG   (NW-006-0005) HINDUJA 1000 @ client 239.96, dsa 232, landing 228

  MIS revenue restored: (dsa-landing)*qty = 1000 + 4000 = ₹5,000.
*/

CREATE TEMP TABLE _new AS
WITH ins AS (
  INSERT INTO nw_transactions
    (client_id, employee_id, txn_type, product_type, product_name, quantity,
     per_unit_price, consolidated_amount, txn_date, isin, notes, sourcing_type,
     dsa_price, client_price, landing_cost, transfer_stage, transferred_at,
     transferred_by, transfer_remarks)
  VALUES
    ('e510c684-08ec-4fe7-abec-13d18a853ab5','6561291d-d7fd-4b8a-80ba-7c54c4371dbe',
     'buy','unlisted_share','HINDUJA LEYLAND FINANCE',500,240,120000,'2026-07-03',
     'INE146O01014','','direct',232,240,230,'transferred',now(),
     '6561291d-d7fd-4b8a-80ba-7c54c4371dbe','Restored — genuine MIS business; DSA payout already completed (DN-2026-07-0002)'),
    ('cb8f451c-3545-4053-9a23-4d15a868a402','6561291d-d7fd-4b8a-80ba-7c54c4371dbe',
     'buy','unlisted_share','HINDUJA LEYLAND FINANCE',1000,239.96,239960,'2026-07-03',
     'INE146O01014','','direct',232,239.96,228,'transferred',now(),
     '6561291d-d7fd-4b8a-80ba-7c54c4371dbe','Restored — genuine MIS business; DSA payout already completed (DN-2026-07-0002)')
  RETURNING id, client_id, product_type, product_name, quantity, per_unit_price,
            consolidated_amount, isin, txn_date, dsa_price, client_price, landing_cost
)
SELECT * FROM ins;

-- Portfolio holdings (as the app's holding-sync would create them).
INSERT INTO nw_holdings
  (client_id, product_type, product_name, txn_date, isin, quantity, avg_cost,
   invested_amount, current_value, notes, landing_cost, dsa_price, client_price)
SELECT client_id, product_type, product_name, txn_date, isin, quantity, per_unit_price,
       consolidated_amount, consolidated_amount, '', landing_cost, dsa_price, client_price
FROM _new;

-- Mark them covered by the note that already paid the DSA (DN-2026-07-0002),
-- so they are excluded from the pending payout.
INSERT INTO dsa_debit_note_lines (debit_note_id, transaction_id, payout)
SELECT (SELECT id FROM dsa_debit_notes WHERE debit_note_number = 'DN-2026-07-0002'),
       n.id,
       (n.client_price - n.dsa_price) * n.quantity
FROM _new n;

UPDATE nw_clients c
   SET portfolio_value = COALESCE(
     (SELECT SUM(current_value) FROM nw_holdings WHERE client_id = c.id), 0)
 WHERE c.id IN (SELECT client_id FROM _new);

DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM _new;
  RAISE NOTICE 'Restored % HINDUJA transaction(s) to MIS + portfolio, covered by DN-2026-07-0002.', v;
END $$;

DROP TABLE _new;
