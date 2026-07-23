/*
  # 'expired' deals behave as live everywhere — only 'rejected' is closed

  Deal DC-1783061408509 (SANJAY GUPTA) is acceptance_status='expired' (a timed-
  out acceptance link — get-deal-by-token still expires links), and every
  payment-side gate blocked both 'rejected' AND 'expired', so recording a
  payment failed and the summary excluded the deal entirely.

  Acceptance is no longer part of the deal → payment → transfer flow, so 'expired'
  must be treated like any live deal. Only a client-REJECTED deal stays closed.
  This aligns four DB objects to block ONLY 'rejected' (the record-payment,
  upload-receipt and send-payment-acknowledgement edge functions are updated in
  code alongside this migration):

    1. nw_check_payment_deal_state()  — payment INSERT trigger
    2. insert_payments_owned_or_admin — payment INSERT RLS policy
    3. nw_deal_payment_summary        — so expired deals get a summary
    4. nw_deal_transfer_eligible      — so a paid expired deal can still transfer
*/

-- 1. Payment INSERT trigger: block only rejected.
CREATE OR REPLACE FUNCTION nw_check_payment_deal_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_status text;
BEGIN
  SELECT acceptance_status INTO v_status
  FROM nw_deal_confirmations
  WHERE id = NEW.deal_confirmation_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Deal % not found', NEW.deal_confirmation_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status = 'rejected' THEN
    RAISE EXCEPTION 'Payments cannot be recorded against a rejected deal.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. RLS INSERT policy: allow all but rejected.
DROP POLICY IF EXISTS "insert_payments_owned_or_admin" ON nw_deal_payments;
CREATE POLICY "insert_payments_owned_or_admin"
  ON nw_deal_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nw_deal_confirmations d
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE d.id = nw_deal_payments.deal_confirmation_id
        AND d.acceptance_status <> 'rejected'
        AND (d.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );

-- 3. Payment summary: include everything except rejected (so expired shows).
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
WHERE d.acceptance_status <> 'rejected'
GROUP BY d.id, d.confirmation_number, d.settlement_amount;

GRANT SELECT ON nw_deal_payment_summary TO authenticated, service_role;

-- 4. Transfer-eligible: paid + not transferred + not rejected (expired allowed).
CREATE OR REPLACE VIEW nw_deal_transfer_eligible
WITH (security_invoker = true) AS
SELECT
  d.id AS deal_id, d.confirmation_number, d.client_id, d.employee_id,
  d.snap_client_name, d.snap_pan, d.snap_email, d.snap_phone, d.snap_dp_name,
  d.snap_demat_account, d.snap_bank_name, d.snap_bank_account, d.snap_bank_ifsc,
  d.snap_address, d.product_type, d.transaction_type, d.security_name, d.isin,
  d.deal_date, d.quantity, d.rate_per_unit, d.settlement_amount, d.stamp_duty,
  d.notes, d.accepted_at, d.signer_email, d.signed_pdf_path, d.landing_cost,
  d.insurance_revenue, d.trail_percent, d.trail_start_date, d.brokerage_amount,
  s.total_paid_amount, s.outstanding_amount, s.payment_count, s.last_payment_at
FROM nw_deal_confirmations d
JOIN nw_deal_payment_summary s ON s.deal_id = d.id
LEFT JOIN nw_transactions t    ON t.deal_confirmation_id = d.id
WHERE d.acceptance_status <> 'rejected'
  AND ABS(s.outstanding_amount) <= 50
  AND (t.id IS NULL OR t.transfer_stage IS DISTINCT FROM 'transferred');
