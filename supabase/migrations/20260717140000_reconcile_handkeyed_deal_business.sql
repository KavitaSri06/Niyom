/*
  # Reconcile hand-keyed business back to its deal

  ## The problem

  Business could be recorded two ways, and they never knew about each other:

    1. Transfer Queue  -> nw_transfer_deal() writes nw_transactions with
                          deal_confirmation_id + transfer_stage='transferred'
    2. Add New Business -> a plain nw_transactions row with NO link to any deal

  In practice route 2 was used for ~95% of business (42 of 44 rows carry no
  transfer_reference). The deals themselves stayed 'accepted + fully paid + not
  transferred', so they sat in the Transfer Queue looking like outstanding work
  — while their business was already booked by hand.

  Pressing Transfer on any of them would have created a SECOND transaction for
  business already in the book, double-counting the revenue in MIS. The
  uq_nw_transactions_deal index could not prevent it: a hand-keyed row has no
  deal_confirmation_id, so there was nothing to collide with.

  ## The repair

  Link each hand-keyed transaction to the deal it was booked from. The
  transaction IS the business — nothing is created, deleted, or re-priced, so
  MIS is unchanged. The deal simply leaves the Transfer Queue and can no longer
  be booked twice.

  Matching is deliberately strict — same client AND same ISIN AND same quantity
  AND the same amount (within ₹0.50) — and only 1:1 pairs are touched. A deal
  with two plausible transactions, or a transaction that could belong to two
  deals, is left alone for a human. Guessing here would mis-attribute revenue.

  Idempotent: already-linked rows are excluded, so re-running is a no-op.
*/

-- =====================================================================
-- 1. Candidate pairs — strict equality only
-- =====================================================================
CREATE TEMP TABLE _cand ON COMMIT DROP AS
SELECT e.deal_id,
       t.id AS txn_id
  FROM nw_deal_transfer_eligible e
  JOIN nw_transactions t
    ON t.deal_confirmation_id IS NULL
   AND t.client_id = e.client_id
   AND NULLIF(upper(trim(t.isin)), '') IS NOT DISTINCT FROM NULLIF(upper(trim(e.isin)), '')
   AND NULLIF(upper(trim(t.isin)), '') IS NOT NULL
   AND t.quantity = e.quantity
   AND abs(COALESCE(t.consolidated_amount, 0) - COALESCE(e.settlement_amount, 0)) < 0.5;

-- =====================================================================
-- 2. Keep only unambiguous 1:1 pairs
-- =====================================================================
CREATE TEMP TABLE _pairs ON COMMIT DROP AS
SELECT c.deal_id, c.txn_id
  FROM _cand c
 WHERE (SELECT count(*) FROM _cand x WHERE x.deal_id = c.deal_id) = 1
   AND (SELECT count(*) FROM _cand y WHERE y.txn_id = c.txn_id) = 1;

-- =====================================================================
-- 3. Link
--
--    transferred_at is the moment the business was actually recorded (the
--    transaction's own created_at), not now() — this is a back-fill of a link
--    that should always have existed, not a transfer happening today.
--    transferred_by stays NULL: no person performed this, the reconciliation
--    did, and the remark says so.
-- =====================================================================
UPDATE nw_transactions t
   SET deal_confirmation_id = p.deal_id,
       transfer_stage       = 'transferred',
       transferred_at       = t.created_at,
       transfer_remarks     = 'Reconciled: business was hand-keyed in Add New Business before the deal link existed'
  FROM _pairs p
 WHERE t.id = p.txn_id;

-- =====================================================================
-- 4. Report + guard
-- =====================================================================
DO $$
DECLARE
  v_cand     int;
  v_pairs    int;
  v_skipped  int;
  v_left     int;
BEGIN
  SELECT count(*) INTO v_cand  FROM _cand;
  SELECT count(*) INTO v_pairs FROM _pairs;
  v_skipped := v_cand - v_pairs;

  SELECT count(*) INTO v_left FROM nw_deal_transfer_eligible;

  RAISE NOTICE 'Reconciled % deal(s) to their hand-keyed transaction.', v_pairs;
  IF v_skipped > 0 THEN
    RAISE NOTICE '% ambiguous candidate(s) left untouched for manual review.', v_skipped;
  END IF;
  RAISE NOTICE '% deal(s) still awaiting transfer (genuinely unbooked).', v_left;
END $$;
