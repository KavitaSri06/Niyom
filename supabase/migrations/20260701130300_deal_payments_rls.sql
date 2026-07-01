/*
  # Payment Management — Phase 1 (M4)
  # RLS for nw_deal_payments

  Mirrors the deal-confirmations policy shape:
    - Owning RM (via nw_deal_confirmations.employee_id) OR admin/super_admin.
    - INSERT additionally requires the parent deal to be ACCEPTED
      (belt-and-braces with trg_nw_check_payment_deal_state).
    - UPDATE only allowed on active rows; cancelled/superseded rows are frozen.
    - No DELETE policy — cancellation is a soft-delete via UPDATE status='cancelled'.
*/

ALTER TABLE nw_deal_payments ENABLE ROW LEVEL SECURITY;

-- SELECT --------------------------------------------------------------
DROP POLICY IF EXISTS "read_payments_owned_or_admin" ON nw_deal_payments;
CREATE POLICY "read_payments_owned_or_admin"
  ON nw_deal_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nw_deal_confirmations d
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE d.id = nw_deal_payments.deal_confirmation_id
        AND (d.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );

-- INSERT --------------------------------------------------------------
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
        AND d.acceptance_status = 'accepted'
        AND (d.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );

-- UPDATE (active rows only) -------------------------------------------
DROP POLICY IF EXISTS "update_active_payments_owned_or_admin" ON nw_deal_payments;
CREATE POLICY "update_active_payments_owned_or_admin"
  ON nw_deal_payments FOR UPDATE
  TO authenticated
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1
      FROM nw_deal_confirmations d
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE d.id = nw_deal_payments.deal_confirmation_id
        AND (d.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM nw_deal_confirmations d
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE d.id = nw_deal_payments.deal_confirmation_id
        AND (d.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );

-- (No DELETE policy — soft-delete only.)
