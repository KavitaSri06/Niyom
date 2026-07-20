/*
  # Bond selling price — base on the existing (imported) price

  Simplifies the pricing model per admin feedback: instead of keying a separate
  landing cost, the selling price is a single % increase applied to the price the
  bond already carries (the imported "Price Per 100" = purchase_price). An
  explicit landing_cost, when set, still wins as the base (advanced override).

  The base stays confidential — it is only ever read inside this SECURITY DEFINER
  RPC and via the admin-only base table; employees receive just the resulting
  price.
*/

CREATE OR REPLACE FUNCTION nw_bond_selling_price(
  p_bond_id uuid, p_margin_type text, p_margin_value numeric
) RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE base numeric; fallback numeric;
BEGIN
  IF nw_current_employee_id() IS NULL THEN
    RAISE EXCEPTION 'Not authorized.';
  END IF;
  -- Base = explicit landing cost if set, else the existing imported price.
  SELECT COALESCE(landing_cost, purchase_price), selling_price
    INTO base, fallback
    FROM nw_bonds WHERE id = p_bond_id;
  IF base IS NULL THEN
    RETURN fallback;  -- nothing to mark up from; use the stored selling price
  END IF;
  RETURN CASE lower(COALESCE(p_margin_type,'none'))
    WHEN 'percent' THEN round(base * (1 + COALESCE(p_margin_value,0) / 100.0), 2)
    WHEN 'flat'    THEN round(base + COALESCE(p_margin_value,0), 2)
    ELSE round(base, 2)
  END;
END;
$$;
