/*
  # Round stamp_duty to 2 decimal places

  ## Change
  - `stamp_duty` generated column was ROUND(..., 4) — now ROUND(..., 2)
  - Aligns database precision with frontend display (all financials at 2dp)
*/

ALTER TABLE nw_deal_confirmations DROP COLUMN stamp_duty;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN stamp_duty numeric(18,2)
    GENERATED ALWAYS AS (
      ROUND((quantity * rate_per_unit * 0.015 / 100)::numeric, 2)
    ) STORED;
