/*
  # Payment Management — Phase 1 (M3)
  # nw_deal_payment_summary view

  Read-only, always-fresh derivation of payment status per accepted deal.
  Payment status is NEVER stored on the parent deal (that row is frozen
  post-acceptance by nw_block_accepted_deal_update).

  Status rules:
    total_paid = 0                        → not_paid
    0 < total_paid < deal_amount          → partially_paid
    total_paid = deal_amount              → fully_paid
    total_paid > deal_amount              → over_paid

  Refunds are stored as negative-amount rows (direction='refund') and are
  summed alongside inflows, so a refund on a fully_paid deal automatically
  flips it back to partially_paid.

  security_invoker=true — RLS from nw_deal_confirmations and
  nw_deal_payments is enforced when a non-privileged role queries the view.
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
WHERE d.acceptance_status = 'accepted'
GROUP BY d.id, d.confirmation_number, d.settlement_amount;

GRANT SELECT ON nw_deal_payment_summary TO authenticated, service_role;
