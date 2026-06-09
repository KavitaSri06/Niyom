/*
  # Fix settlement_amount formula in nw_deal_confirmations

  ## Change
  - `settlement_amount` was: quantity × rate_per_unit
  - `settlement_amount` is now: (quantity × rate_per_unit) + stamp_duty
    = quantity × rate_per_unit × (1 + 0.015/100)

  Generated columns cannot reference other generated columns, so the full
  stamp_duty expression is inlined.
*/

ALTER TABLE nw_deal_confirmations
  DROP COLUMN settlement_amount;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN settlement_amount numeric(18,2)
    GENERATED ALWAYS AS (
      ROUND(
        (quantity * rate_per_unit + quantity * rate_per_unit * 0.015 / 100)::numeric,
        2
      )
    ) STORED;
