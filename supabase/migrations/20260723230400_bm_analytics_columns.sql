/*
  # Bond Master — cached analytics + trustee; expose in the staff-safe view

  The enrichment/analytics engine caches scalar analytics (accrued, dirty price,
  YTM, current yield, durations, days/years to maturity) as one jsonb blob on the
  master, and records the debenture trustee. Add both, and surface them (plus
  computed next/previous coupon dates) in bm_bonds_public.
*/

ALTER TABLE bm_bonds ADD COLUMN IF NOT EXISTS analytics jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bm_bonds ADD COLUMN IF NOT EXISTS analytics_computed_at timestamptz;
ALTER TABLE bm_bonds ADD COLUMN IF NOT EXISTS trustee text NOT NULL DEFAULT '';

DROP VIEW IF EXISTS bm_bonds_public;
CREATE VIEW bm_bonds_public
WITH (security_invoker = false) AS
  SELECT
    b.id, b.isin, b.issuer_id, i.name AS issuer_name, i.industry, i.sector,
    b.bond_name, b.security_description, b.series,
    b.issue_date, b.listing_date, b.maturity_date, b.redemption_date,
    b.face_value, b.issue_price, b.redemption_value,
    b.coupon_rate, b.coupon_type, b.coupon_frequency, b.interest_payment_dates,
    b.first_coupon_date, b.next_coupon_date, b.previous_coupon_date,
    b.day_count_convention, b.business_day_convention,
    b.principal_repayment_structure, b.redemption_schedule,
    b.callable, b.puttable, b.perpetual, b.floating, b.put_call_date, b.put_call_type,
    b.seniority, b.security_type, b.secured, b.tax_status, b.trustee,
    b.exchange_listed, b.listing_status, b.nse_symbol, b.bse_code,
    b.min_investment, b.lot_size, b.currency,
    b.rating, b.rating_agency, b.rating_date, b.issuer_docs,
    b.selling_price, b.latest_price, b.price_updated_at,
    b.active_status, b.verification_status, b.data_quality_score, b.enriched_at,
    b.analytics, b.analytics_computed_at,
    b.created_at, b.updated_at
  FROM bm_bonds b
  LEFT JOIN bm_issuers i ON i.id = b.issuer_id
  WHERE EXISTS (
    SELECT 1 FROM nw_employees e
     WHERE e.auth_user_id = auth.uid() AND e.status = 'active'
  );
GRANT SELECT ON bm_bonds_public TO authenticated;
