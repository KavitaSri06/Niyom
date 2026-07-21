/*
  # Also allow correcting the transaction date on transferred transactions

  Follow-up to 20260721120000. Owner confirmed the booking date must be
  correctable after transfer (a mistyped date otherwise strands the revenue in
  the wrong MIS month with no way to fix it). txn_date is what MIS filters and
  attributes revenue by, so editing it moves the transaction to the corrected
  month — which is the intent.

  Adds txn_date to the post-transfer whitelist. Everything else that defines the
  executed trade — client, product, quantity, price, total amount, ISIN,
  transfer/payment state, ownership — stays immutable. Whitelist remains
  fail-safe: any column not listed is locked by default.
*/

CREATE OR REPLACE FUNCTION nw_check_txn_post_transfer_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.transfer_stage = 'transferred' THEN
    IF (to_jsonb(OLD)
          - 'landing_cost' - 'insurance_revenue' - 'trail_percent'
          - 'trail_start_date' - 'txn_date' - 'notes' - 'updated_at')
       IS DISTINCT FROM
       (to_jsonb(NEW)
          - 'landing_cost' - 'insurance_revenue' - 'trail_percent'
          - 'trail_start_date' - 'txn_date' - 'notes' - 'updated_at')
    THEN
      RAISE EXCEPTION
        'Transferred transaction % is immutable except revenue-basis fields (landing cost, insurance revenue, MF trail) and the transaction date. Reversal is not enabled in v1.',
        OLD.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
