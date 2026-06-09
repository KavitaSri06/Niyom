/*
  # MIS Revenue Fields

  ## Summary
  Adds revenue-tracking columns required for the automated MIS (Monthly Information System)
  report and DSA payout calculation.

  ## Changes to nw_holdings

  ### Unlisted Shares, Secondary Bonds, Primary Bonds
  - `landing_cost`         — Admin's actual cost price per unit (internal)
  - `revenue_per_unit`     — Derived: avg_cost − landing_cost (auto-display only)

  ### Insurance
  - `insurance_revenue`    — Flat revenue amount entered by employee/admin for this policy

  ### Mutual Funds
  - `trail_percent`        — Annual trail commission % (e.g. 0.50 for 0.50%)
  - `trail_start_date`     — Date from which trail is calculated (typically investment date)
  - `trail_revenue`        — Computed yearly at anniversary: invested_amount × trail_percent / 100

  ## Changes to nw_transactions
  Same subset of columns for per-transaction revenue capture.

  ## Notes
  - landing_cost is internal; never shown in client-facing prints
  - trail_revenue is only computed at end of year from investment date
  - All new columns are nullable with no default (intentional — not all products use all fields)
*/

-- ============================================================
-- nw_holdings additions
-- ============================================================

-- For unlisted_share / secondary_bond / primary_bond
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_holdings' AND column_name='landing_cost') THEN
    ALTER TABLE nw_holdings ADD COLUMN landing_cost numeric;
  END IF;
END $$;

-- For insurance
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_holdings' AND column_name='insurance_revenue') THEN
    ALTER TABLE nw_holdings ADD COLUMN insurance_revenue numeric;
  END IF;
END $$;

-- For mutual_fund trail commission
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_holdings' AND column_name='trail_percent') THEN
    ALTER TABLE nw_holdings ADD COLUMN trail_percent numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_holdings' AND column_name='trail_start_date') THEN
    ALTER TABLE nw_holdings ADD COLUMN trail_start_date date;
  END IF;
END $$;

-- ============================================================
-- nw_transactions additions
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_transactions' AND column_name='landing_cost') THEN
    ALTER TABLE nw_transactions ADD COLUMN landing_cost numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_transactions' AND column_name='insurance_revenue') THEN
    ALTER TABLE nw_transactions ADD COLUMN insurance_revenue numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_transactions' AND column_name='trail_percent') THEN
    ALTER TABLE nw_transactions ADD COLUMN trail_percent numeric;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='nw_transactions' AND column_name='trail_start_date') THEN
    ALTER TABLE nw_transactions ADD COLUMN trail_start_date date;
  END IF;
END $$;
