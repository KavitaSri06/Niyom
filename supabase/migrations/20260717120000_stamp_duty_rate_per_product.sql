/*
  # Stamp duty rate per product type

  Until now stamp_duty was a generated column with 0.015% hardcoded for EVERY
  product:

      stamp_duty = ROUND(base_rate * quantity * 0.015 / 100, 2)

  Correct statutory rates differ by instrument:

      Unlisted Share   0.015%
      Secondary Bond   0.0001%
      everything else  0%      (Primary Bond, Fixed Deposit, Mutual Fund,
                                Insurance, Other)

  ## Why the rate is STORED per deal rather than resolved in the formula

  stamp_duty is GENERATED, so redefining it recomputes every existing row. A
  plain CASE on product_type would therefore retroactively rewrite the duty on
  deals the client has already accepted and signed — e.g. a ₹5,00,821 bond deal
  would drop from ₹75.12 to ₹0.50 and no longer match its signed PDF.

  So each deal now carries the rate that applied to it:

    - existing rows are backfilled with 0.015, which reproduces their current
      stamp_duty EXACTLY — signed history does not move;
    - new deals get the correct per-product rate, assigned by the database on
      insert. Nothing to remember and nothing to check at call sites.

  settlement_amount is untouched: it is base_rate * quantity and never included
  stamp duty, so no client's payable changes here either way.

  Additive; the generated column is rebuilt from the same inputs.
*/

-- =====================================================================
-- 1. Rate resolver — the single source of truth for the rates
-- =====================================================================
CREATE OR REPLACE FUNCTION nw_stamp_duty_rate(p_product_type text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_product_type
    WHEN 'Unlisted Share' THEN 0.015
    WHEN 'Secondary Bond' THEN 0.0001
    ELSE 0
  END::numeric;
$$;

COMMENT ON FUNCTION nw_stamp_duty_rate(text) IS
  'Stamp duty rate (percent) by deal product_type. Unlisted Share 0.015, Secondary Bond 0.0001, all other products 0.';

-- =====================================================================
-- 2. Per-deal rate column, backfilled so history is frozen
--
--    Every pre-existing deal was charged 0.015% regardless of product.
--    Recording that verbatim is what keeps their recomputed stamp_duty
--    identical.
--
--    The backfill is done with a column DEFAULT rather than an UPDATE: this
--    table has a BEFORE UPDATE trigger (nw_deal_confirmations_block_accepted)
--    that makes accepted deals immutable, so an UPDATE touching them is
--    rejected outright — as it should be. ADD COLUMN ... DEFAULT is DDL, fills
--    every existing row, and fires no row triggers.
-- =====================================================================
ALTER TABLE nw_deal_confirmations
  ADD COLUMN IF NOT EXISTS stamp_duty_rate numeric(9,6) DEFAULT 0.015;

-- New deals must NOT inherit 0.015 — they fall through to the trigger below,
-- which derives the rate from product_type.
ALTER TABLE nw_deal_confirmations
  ALTER COLUMN stamp_duty_rate DROP DEFAULT;

-- Safety net: normally matches zero rows (the DEFAULT above filled everything).
-- It only bites if the column somehow pre-existed unfilled, in which case an
-- accepted deal would trip the immutability guard and abort loudly rather than
-- leave rates half-populated.
UPDATE nw_deal_confirmations
   SET stamp_duty_rate = 0.015
 WHERE stamp_duty_rate IS NULL;

-- =====================================================================
-- 3. Assign the rate on write
--
--    INSERT           -> derive from product_type
--    UPDATE           -> keep the stored rate, EXCEPT when the product type is
--                        changed on a deal the client has not accepted yet
--                        (drafts are still editable), which re-derives it.
--    An accepted deal's rate can never drift.
-- =====================================================================
CREATE OR REPLACE FUNCTION nw_apply_stamp_duty_rate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stamp_duty_rate := COALESCE(NEW.stamp_duty_rate,
                                    nw_stamp_duty_rate(NEW.product_type));
  ELSIF NEW.product_type IS DISTINCT FROM OLD.product_type
        AND COALESCE(OLD.acceptance_status, 'pending') <> 'accepted' THEN
    NEW.stamp_duty_rate := nw_stamp_duty_rate(NEW.product_type);
  ELSE
    NEW.stamp_duty_rate := OLD.stamp_duty_rate;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_nw_apply_stamp_duty_rate ON nw_deal_confirmations;
CREATE TRIGGER trg_nw_apply_stamp_duty_rate
  BEFORE INSERT OR UPDATE ON nw_deal_confirmations
  FOR EACH ROW EXECUTE FUNCTION nw_apply_stamp_duty_rate();

-- =====================================================================
-- 4. Rebuild stamp_duty from the stored rate
--
--    Existing rows carry stamp_duty_rate = 0.015, so this recomputes them to
--    exactly the values they already held.
--
--    That is the whole safety claim of this migration, so it is verified rather
--    than assumed: the old values are snapshotted, the column is rebuilt, and
--    the two are compared. Any drift on an existing deal aborts the migration
--    and rolls the whole thing back.
-- =====================================================================
CREATE TEMP TABLE _stamp_duty_before ON COMMIT DROP AS
  SELECT id, stamp_duty FROM nw_deal_confirmations;

-- Redefined in place rather than DROP + ADD: the nw_deal_transfer_eligible view
-- depends on this column, so dropping it would force the view to be dropped and
-- rebuilt from a copy of its definition — an easy way to silently lose a column
-- or a predicate. SET EXPRESSION (PostgreSQL 17+) rewrites the stored values
-- while leaving the column, and therefore the view, intact.
ALTER TABLE nw_deal_confirmations
  ALTER COLUMN stamp_duty
  SET EXPRESSION AS (
    ROUND((base_rate * quantity * COALESCE(stamp_duty_rate, 0) / 100)::numeric, 2)
  );

DO $$
DECLARE
  v_drifted int;
  v_total   int;
BEGIN
  SELECT count(*) INTO v_total FROM _stamp_duty_before;

  SELECT count(*) INTO v_drifted
    FROM _stamp_duty_before b
    JOIN nw_deal_confirmations d ON d.id = b.id
   WHERE COALESCE(b.stamp_duty, 0) IS DISTINCT FROM COALESCE(d.stamp_duty, 0);

  IF v_drifted > 0 THEN
    RAISE EXCEPTION
      'Aborting: stamp_duty changed on % of % existing deals. Signed history must not move.',
      v_drifted, v_total;
  END IF;

  RAISE NOTICE 'stamp_duty verified unchanged on all % existing deals.', v_total;
END $$;
