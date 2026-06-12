/*
  # Deal Confirmation v2 — M4: Deal Locking / Edit Restrictions

  ## Purpose
  Enforce the core business rule: once a deal is ACCEPTED it is permanently
  immutable. Employees cannot edit, resend, regenerate, or delete it. Any
  correction must be a brand-new deal confirmation.

  Deals in every other state (pending, viewed, rejected, expired) remain fully
  editable and deletable by the owning employee / admins.

  ## Enforcement (defense in depth)
  1. RLS — the UPDATE and DELETE policies are narrowed to exclude rows whose
     acceptance_status = 'accepted'. The accept flow itself runs in an edge
     function under the service role, which bypasses RLS, so it can still
     perform the single write that sets acceptance_status = 'accepted'.
  2. Trigger — a BEFORE UPDATE trigger raises if the row was ALREADY accepted
     (OLD.acceptance_status = 'accepted'). This guards ALL roles, including the
     service role, against any post-acceptance mutation. The accept write
     passes because OLD is still 'pending' / 'viewed' at that moment.

  ## Notes
  - The accept edge function must set acceptance_status, signature/pdf paths and
    signer audit fields in a SINGLE UPDATE so the trigger sees OLD <> 'accepted'.
  - Deleting an accepted deal is blocked to preserve the signed-record audit
    trail (compliance).
*/

-- 1. Narrow the UPDATE policy to non-accepted rows ---------------------------
DROP POLICY IF EXISTS "Employees can update own deal confirmations" ON nw_deal_confirmations;

CREATE POLICY "Employees can update non-accepted deal confirmations"
  ON nw_deal_confirmations FOR UPDATE
  TO authenticated
  USING (
    acceptance_status <> 'accepted'
    AND (
      employee_id IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM nw_employees e
        WHERE e.auth_user_id = auth.uid()
          AND (e.role = 'admin' OR e.role = 'super_admin')
      )
    )
  )
  WITH CHECK (
    employee_id IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid()
        AND (e.role = 'admin' OR e.role = 'super_admin')
    )
  );

-- 2. Narrow the DELETE policy to non-accepted rows ---------------------------
DROP POLICY IF EXISTS "Employees can delete own deal confirmations" ON nw_deal_confirmations;

CREATE POLICY "Employees can delete non-accepted deal confirmations"
  ON nw_deal_confirmations FOR DELETE
  TO authenticated
  USING (
    acceptance_status <> 'accepted'
    AND (
      employee_id IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM nw_employees e
        WHERE e.auth_user_id = auth.uid()
          AND (e.role = 'admin' OR e.role = 'super_admin')
      )
    )
  );

-- 3. Hard immutability guard for accepted deals (all roles) ------------------
CREATE OR REPLACE FUNCTION nw_block_accepted_deal_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.acceptance_status = 'accepted' THEN
    RAISE EXCEPTION
      'Accepted deal confirmation % is immutable. Create a new deal confirmation for corrections.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nw_deal_confirmations_block_accepted ON nw_deal_confirmations;

CREATE TRIGGER nw_deal_confirmations_block_accepted
  BEFORE UPDATE ON nw_deal_confirmations
  FOR EACH ROW EXECUTE FUNCTION nw_block_accepted_deal_update();
