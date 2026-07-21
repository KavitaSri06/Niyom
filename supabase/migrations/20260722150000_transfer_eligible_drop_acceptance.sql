/*
  # Deal is transfer-ready once PAID — digital acceptance no longer required

  New flow (owner-confirmed): create deal → email it → client pays → employee
  records payment → deal appears in the Transfer Queue for review → transfer.
  There is no digital acceptance/signature step.

  nw_deal_transfer_eligible previously required acceptance_status='accepted'.
  Drop that: a deal is eligible once it is settled (|outstanding| <= 50) and not
  already transferred. Explicitly-dead deals (rejected/expired, only reachable
  on old records) are still excluded. Columns are unchanged.

  The transfer RPC (nw_transfer_deal) already supports transferring a non-
  accepted paid deal via p_override_acceptance; the Transfer Queue now always
  passes it, so no RPC change is needed.
*/

CREATE OR REPLACE VIEW nw_deal_transfer_eligible
WITH (security_invoker = true) AS
SELECT
  d.id                        AS deal_id,
  d.confirmation_number,
  d.client_id,
  d.employee_id,
  d.snap_client_name,
  d.snap_pan,
  d.snap_email,
  d.snap_phone,
  d.snap_dp_name,
  d.snap_demat_account,
  d.snap_bank_name,
  d.snap_bank_account,
  d.snap_bank_ifsc,
  d.snap_address,
  d.product_type,
  d.transaction_type,
  d.security_name,
  d.isin,
  d.deal_date,
  d.quantity,
  d.rate_per_unit,
  d.settlement_amount,
  d.stamp_duty,
  d.notes,
  d.accepted_at,
  d.signer_email,
  d.signed_pdf_path,
  d.landing_cost,
  d.insurance_revenue,
  d.trail_percent,
  d.trail_start_date,
  d.brokerage_amount,
  s.total_paid_amount,
  s.outstanding_amount,
  s.payment_count,
  s.last_payment_at
FROM nw_deal_confirmations d
JOIN nw_deal_payment_summary s ON s.deal_id = d.id
LEFT JOIN nw_transactions t    ON t.deal_confirmation_id = d.id
WHERE d.acceptance_status NOT IN ('rejected', 'expired')   -- accepted no longer required
  AND ABS(s.outstanding_amount) <= 50
  AND (t.id IS NULL OR t.transfer_stage IS DISTINCT FROM 'transferred');
