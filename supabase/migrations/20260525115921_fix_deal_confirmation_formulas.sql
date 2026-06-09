/*
  # Fix Deal Confirmation Formulas

  ## Changes
  - stamp_duty = (rate_per_unit * quantity) * 0.015 / 100  (rounded to 2dp)
  - settlement_amount = (rate_per_unit * quantity) - stamp_duty  (rounded to 2dp)

  Previously settlement_amount was adding stamp_duty instead of subtracting it.
*/

ALTER TABLE nw_deal_confirmations DROP COLUMN IF EXISTS stamp_duty;
ALTER TABLE nw_deal_confirmations DROP COLUMN IF EXISTS settlement_amount;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN stamp_duty numeric(18,2)
    GENERATED ALWAYS AS (
      ROUND((rate_per_unit * quantity * 0.015 / 100)::numeric, 2)
    ) STORED;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN settlement_amount numeric(18,2)
    GENERATED ALWAYS AS (
      ROUND(((rate_per_unit * quantity) - ROUND((rate_per_unit * quantity * 0.015 / 100)::numeric, 2))::numeric, 2)
    ) STORED;
