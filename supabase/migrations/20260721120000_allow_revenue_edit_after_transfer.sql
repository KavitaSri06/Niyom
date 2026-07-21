/*
  # Allow correcting internal revenue-basis fields on transferred transactions

  20260702100000 made every transferred transaction FULLY immutable (the
  executed-ledger compliance guard). But transactions booked from a confirmed
  deal via "Add New Business" are auto-stamped transfer_stage='transferred' at
  creation (they never pass through the Transfer Queue — see the pickedDeal
  branch in src/crm/Transactions.tsx). That meant the internal landing cost
  captured at booking could never be corrected afterwards, so MIS revenue was
  permanently stuck with whatever was first typed — with no way in or out.

  Landing cost, insurance revenue and MF trail are INTERNAL margin figures, not
  executed trade terms. This relaxes the guard to allow ONLY those revenue-basis
  fields (plus notes / updated_at) to change after transfer. Everything else —
  client, product, quantity, price, amount, ISIN, dates, transfer state,
  payment state, deal link, ownership — stays locked.

  The check is a WHITELIST via jsonb subtraction: strip the allowed keys from
  both OLD and NEW and compare the remainder; if anything else differs, block.
  Any column not explicitly whitelisted therefore stays immutable, and future
  columns are locked by default (fail-safe for compliance). The jsonb `-`
  operator is a no-op on absent keys, so the list is safe even if a column is
  renamed later.

  DELETE of a transferred transaction stays fully blocked (unchanged).
*/

CREATE OR REPLACE FUNCTION nw_check_txn_post_transfer_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.transfer_stage = 'transferred' THEN
    IF (to_jsonb(OLD)
          - 'landing_cost' - 'insurance_revenue' - 'trail_percent'
          - 'trail_start_date' - 'notes' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(NEW)
          - 'landing_cost' - 'insurance_revenue' - 'trail_percent'
          - 'trail_start_date' - 'notes' - 'updated_at')
    THEN
      RAISE EXCEPTION
        'Transferred transaction % is immutable except internal revenue-basis fields (landing cost, insurance revenue, MF trail). Reversal is not enabled in v1.',
        OLD.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
