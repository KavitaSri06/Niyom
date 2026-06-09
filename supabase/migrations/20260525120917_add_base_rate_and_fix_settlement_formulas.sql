/*
  # Add base_rate column and fix settlement amount formula

  ## Changes
  - Add base_rate column (the given/original rate entered by user)
  - stamp_duty = base_rate * quantity * 0.015 / 100
  - settlement_amount = base_rate * quantity  (given rate × qty)
  - rate_per_unit remains the adjusted rate (base_rate - stamp deduction per unit)
  - Backfill base_rate from existing rate_per_unit for existing rows
*/

-- Add base_rate column
ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS base_rate numeric(18,4) DEFAULT 0;

-- Backfill: reverse-calculate base_rate from rate_per_unit
-- rate_per_unit = base_rate - base_rate * 0.015/100 = base_rate * (1 - 0.00015)
-- base_rate = rate_per_unit / (1 - 0.00015)
UPDATE nw_deal_confirmations
  SET base_rate = ROUND((rate_per_unit / 0.99985)::numeric, 4)
  WHERE base_rate = 0;

-- Drop and recreate generated columns using base_rate
ALTER TABLE nw_deal_confirmations DROP COLUMN IF EXISTS stamp_duty;
ALTER TABLE nw_deal_confirmations DROP COLUMN IF EXISTS settlement_amount;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN stamp_duty numeric(18,2)
    GENERATED ALWAYS AS (
      ROUND((base_rate * quantity * 0.015 / 100)::numeric, 2)
    ) STORED;

ALTER TABLE nw_deal_confirmations
  ADD COLUMN settlement_amount numeric(18,2)
    GENERATED ALWAYS AS (
      ROUND((base_rate * quantity)::numeric, 2)
    ) STORED;
