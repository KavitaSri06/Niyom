/*
  # Allow recording deal payments before the client digitally accepts

  Some clients stay out of reach and never sign the deal confirmation, yet they
  have paid. That payment must be captured so the deal can later be transferred
  into MIS via the admin override (20260722120000). Previously payments were
  hard-gated to acceptance_status = 'accepted' in THREE places:
    - the record-payment edge function (relaxed in code), and here:
    - the nw_check_payment_deal_state() BEFORE INSERT trigger (service-role path),
    - the insert_payments_owned_or_admin RLS policy (authenticated path).

  Both DB guards are relaxed to block only truly closed deals (rejected /
  expired). Ownership/admin authorisation is unchanged.
*/

-- 1. Trigger: block payments only on rejected/expired deals.
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
  IF v_status IN ('rejected', 'expired') THEN
    RAISE EXCEPTION
      'Payments cannot be recorded against a % deal.', v_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. RLS INSERT policy: same relaxation for the authenticated path.
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
        AND d.acceptance_status NOT IN ('rejected', 'expired')
        AND (d.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );
