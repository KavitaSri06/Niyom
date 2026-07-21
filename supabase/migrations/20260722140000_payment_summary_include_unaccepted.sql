/*
  # Payment summary must include deals paid before acceptance

  nw_deal_payment_summary was scoped to `acceptance_status = 'accepted'`. Once
  payments are allowed before the client signs (20260722130000), that filter
  hid the summary row for pending/viewed deals entirely, so:
    - the deal's payment status always read "not paid",
    - nw_deal_transfer_pending_acceptance (which JOINs this view) never listed
      the deal, and
    - nw_transfer_deal's payment check found no summary row → override transfer
      would fail the money gate.

  Broaden the view to every live deal (all but rejected/expired). Consumers that
  only want accepted deals already apply their own acceptance filter
  (nw_deal_transfer_eligible), so this is safe. Columns are unchanged, so the
  dependent transfer views stay valid under CREATE OR REPLACE.
*/

CREATE OR REPLACE VIEW nw_deal_payment_summary
WITH (security_invoker = true) AS
SELECT
  d.id                                                                              AS deal_id,
  d.confirmation_number,
  d.settlement_amount                                                               AS deal_amount,
  COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0)::numeric(18,2)  AS total_paid_amount,
  (d.settlement_amount
    - COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0))::numeric(18,2)
                                                                                    AS outstanding_amount,
  CASE
    WHEN COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0) = 0
      THEN 'not_paid'
    WHEN COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0) < d.settlement_amount
      THEN 'partially_paid'
    WHEN COALESCE(SUM(p.amount_inr) FILTER (WHERE p.status = 'active'), 0) = d.settlement_amount
      THEN 'fully_paid'
    ELSE 'over_paid'
  END                                                                               AS payment_status,
  COUNT(p.id) FILTER (WHERE p.status = 'active')                                    AS payment_count,
  MAX(p.received_at) FILTER (WHERE p.status = 'active')                             AS last_payment_at
FROM nw_deal_confirmations d
LEFT JOIN nw_deal_payments p ON p.deal_confirmation_id = d.id
WHERE d.acceptance_status NOT IN ('rejected', 'expired')
GROUP BY d.id, d.confirmation_number, d.settlement_amount;

GRANT SELECT ON nw_deal_payment_summary TO authenticated, service_role;
