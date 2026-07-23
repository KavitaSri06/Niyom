/*
  # Seed the Indian market holiday calendar (fixed-date national holidays)

  Business-day adjustment needs weekends (handled in code) + market holidays.
  Fixed-date national holidays are seeded here for 2026–2035; variable holidays
  (Holi, Diwali, Eid, etc.) and exchange-specific closures can be added later via
  admin / a yearly job. Exact to-the-day coupon dates around variable holidays
  fall back to the Manual Verification Queue + field lock.
*/

INSERT INTO bm_holiday_calendar (holiday_date, name, market)
SELECT make_date(y, m, d), nm, 'IN'
FROM generate_series(2026, 2035) AS y,
LATERAL (VALUES
  (1, 26, 'Republic Day'),
  (5, 1,  'Maharashtra Day / Labour Day'),
  (8, 15, 'Independence Day'),
  (10, 2, 'Gandhi Jayanti'),
  (12, 25, 'Christmas')
) AS h(m, d, nm)
ON CONFLICT (market, holiday_date) DO NOTHING;
