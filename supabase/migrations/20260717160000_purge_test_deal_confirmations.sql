/*
  # One-off purge of test deal confirmations

  Six deals were created while testing, using staff members' own names as the
  client (PURUSHOTHAMAN S / KAVITA SRI G). They are indistinguishable from real
  business in the deal list and MIS, so they are being removed at the owner's
  explicit instruction:

    DC-1784227550477  PURUSHOTHAMAN S  NATIONAL STOCK EXCHANGE  ₹2,04,996  (paid, booked)
    DC-NIYOM-001-006  PURUSHOTHAMAN S  NSE                      ₹19,50,000
    DC-1784003874855  PURUSHOTHAMAN S  Hinduja                  ₹250
    DC-1783957511242  KAVITA SRI G     sew                      ₹250
    DC-1783938198966  KAVITA SRI G     nsi                      ₹200
    DC-NIYOM-002-002  KAVITA SRI G     csk                      ₹249.90    (paid, booked)

  Impact confirmed before running: 6 deals, 3 payment rows, 2 booked
  transactions, 1 holding. ₹2,05,245.90 leaves MIS. This is intended — that
  revenue was never real.

  ## Why a migration rather than the app

  Accepted deals cannot be deleted through the app: the RLS DELETE policy is
  `acceptance_status <> 'accepted'`, and nw_deal_payments / nw_transactions both
  reference the deal with ON DELETE RESTRICT. Those guards are correct and are
  deliberately NOT being relaxed — no "delete anything" button is being added
  for what is a one-time cleanup. This migration runs as the table owner, does
  the work once, and is reviewable in history.

  ## Order matters

    transactions -> payments -> deals -> orphaned holdings

  RESTRICT means the children must go first. Events, OTPs and the email log
  cascade off the deal automatically; txn documents cascade off the transaction.

  nw_holdings has NO foreign key to nw_transactions — Portfolio positions are
  maintained in application code (syncTransactionToHolding). Deleting a
  transaction therefore leaves the holding behind as a phantom position, so any
  holding with no surviving transaction for that client+ISIN is removed too.
  Only PURUSHOTHAMAN S's NSE holding qualifies; every other NSE holding is fed
  by a different client's own transactions and is untouched.

  Idempotent: re-running finds no matching deals and is a no-op.
*/

-- =====================================================================
-- 1. Resolve the targets by explicit reference — never by pattern.
-- =====================================================================
CREATE TEMP TABLE _doomed ON COMMIT DROP AS
SELECT id, confirmation_number, snap_client_name, settlement_amount
  FROM nw_deal_confirmations
 WHERE confirmation_number IN (
   'DC-1784227550477',
   'DC-NIYOM-001-006',
   'DC-1784003874855',
   'DC-1783957511242',
   'DC-1783938198966',
   'DC-NIYOM-002-002'
 );

-- Guard: on the first run this must be exactly the six approved deals. Anything
-- else means the list drifted and the purge must not proceed blind.
DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM _doomed;
  IF v_n = 0 THEN
    RAISE NOTICE 'No matching test deals found — already purged. Nothing to do.';
  ELSIF v_n <> 6 THEN
    RAISE EXCEPTION 'Expected 6 approved test deals, found %. Aborting rather than delete an unreviewed set.', v_n;
  END IF;
END $$;

-- Client + ISIN pairs whose holdings may be orphaned once the transactions go.
CREATE TEMP TABLE _affected ON COMMIT DROP AS
SELECT DISTINCT t.client_id, upper(trim(t.isin)) AS isin
  FROM nw_transactions t
  JOIN _doomed d ON d.id = t.deal_confirmation_id
 WHERE NULLIF(trim(t.isin), '') IS NOT NULL;

-- =====================================================================
-- 2. Delete children first (both are ON DELETE RESTRICT)
--
--    Two of these transactions carry transfer_stage='transferred', which
--    trg_nw_check_txn_no_delete_after_transfer blocks outright — that guard
--    exists to "preserve the executed-transaction ledger for compliance", and
--    it is doing its job. They only carry that flag because the reconciliation
--    in 20260717140000 linked the hand-keyed rows to their deals.
--
--    Overriding a compliance guard is not something to do casually, so it is
--    scoped as tightly as possible: disabled for these statements only,
--    re-enabled immediately, and — since DDL here is transactional — restored
--    automatically if anything below fails. The records being removed are
--    demonstrably fabricated (securities 'csk'/'sew'/'nsi', ISINs like
--    IN123456), so retaining them corrupts the very ledger the guard protects.
--
--    The trigger itself is left intact for all normal operation.
-- =====================================================================
ALTER TABLE nw_transactions DISABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;

DELETE FROM nw_transactions
 WHERE deal_confirmation_id IN (SELECT id FROM _doomed);

ALTER TABLE nw_transactions ENABLE TRIGGER trg_nw_check_txn_no_delete_after_transfer;

DELETE FROM nw_deal_payments
 WHERE deal_confirmation_id IN (SELECT id FROM _doomed);

-- =====================================================================
-- 3. Delete the deals (events / OTPs / email log cascade)
-- =====================================================================
DELETE FROM nw_deal_confirmations
 WHERE id IN (SELECT id FROM _doomed);

-- =====================================================================
-- 4. Remove holdings left with no transaction behind them
-- =====================================================================
DELETE FROM nw_holdings h
 USING _affected a
 WHERE h.client_id = a.client_id
   AND upper(trim(h.isin)) = a.isin
   AND NOT EXISTS (
     SELECT 1 FROM nw_transactions t
      WHERE t.client_id = h.client_id
        AND upper(trim(t.isin)) = a.isin
   );

-- =====================================================================
-- 5. Report
-- =====================================================================
DO $$
DECLARE
  v_left    int;
  v_enabled char;
BEGIN
  SELECT count(*) INTO v_left
    FROM nw_deal_confirmations
   WHERE confirmation_number IN (
     'DC-1784227550477','DC-NIYOM-001-006','DC-1784003874855',
     'DC-1783957511242','DC-1783938198966','DC-NIYOM-002-002'
   );
  IF v_left > 0 THEN
    RAISE EXCEPTION 'Purge incomplete: % test deal(s) still present.', v_left;
  END IF;

  -- Leaving a compliance guard disabled would be far worse than the test data
  -- this migration removes. Refuse to commit unless it is demonstrably back on.
  SELECT t.tgenabled INTO v_enabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'nw_transactions'
     AND t.tgname  = 'trg_nw_check_txn_no_delete_after_transfer';

  IF v_enabled IS DISTINCT FROM 'O' THEN
    RAISE EXCEPTION
      'Refusing to commit: trg_nw_check_txn_no_delete_after_transfer is not re-enabled (tgenabled=%).',
      COALESCE(v_enabled::text, 'MISSING');
  END IF;

  RAISE NOTICE 'Purge complete — six test deal confirmations removed; delete guard verified re-enabled.';
END $$;
