/*
  # DSA Employee Ownership — forward alignment to the approved assignment model

  ## Why this migration exists
  Migration 20260629120000 was already applied to production and is treated as
  IMMUTABLE. This forward-only migration transitions the production database from
  whatever that earlier deployment left behind to the FINAL approved state:

      Ownership is determined ONLY by the DSA assignment:  nw_dsa.employee_id

  It removes the earlier "Link A ∪ Link B" (business-through-DSA) model, retires
  the `nw_emp_has_dsa_business` helper, removes the leftover admin DELETE policy
  on nw_dsa (DSA deletion is NOT part of this feature — admin delete behaviour is
  left exactly as it was before that policy), and (re)creates only the final
  assignment-based policies.

  ## Safety
    - Idempotent: every object is DROP ... IF EXISTS + CREATE, or CREATE OR
      REPLACE. Re-running is safe.
    - No destructive schema or data changes: no DROP TABLE / ALTER TABLE / DELETE
      / TRUNCATE / UPDATE. Only functions and RLS policies are (re)defined.
    - All existing production rows are preserved untouched.
    - Base-table stewardship policies (nw_dsa INSERT/UPDATE from the original
      DSA migration, dsa_debit_notes DELETE = admin-only, storage
      INSERT/UPDATE/DELETE) are intentionally left as-is.
*/

-- ---------------------------------------------------------------------------
-- 1. Helper predicates (final versions). SECURITY DEFINER so they can read
--    nw_employees / nw_dsa regardless of the caller's RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_current_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM nw_employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION nw_current_emp_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM nw_employees
    WHERE auth_user_id = auth.uid()
      AND status = 'active'
      AND role IN ('admin', 'super_admin')
  );
$$;

-- Ownership: is this DSA assigned to the current employee?
CREATE OR REPLACE FUNCTION nw_emp_owns_dsa(p_dsa_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM nw_dsa d
    WHERE d.id = p_dsa_id
      AND d.employee_id = nw_current_employee_id()
  );
$$;

GRANT EXECUTE ON FUNCTION nw_current_employee_id()  TO authenticated;
GRANT EXECUTE ON FUNCTION nw_current_emp_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION nw_emp_owns_dsa(uuid)     TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. nw_dsa — directory visibility = assigned employee OR admin.
--    (INSERT/UPDATE stewardship policies from the base migration are untouched.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employees can view their own DSA records" ON nw_dsa;
CREATE POLICY "Employees can view their own DSA records"
  ON nw_dsa FOR SELECT
  TO authenticated
  USING (
    employee_id = nw_current_employee_id()   -- assigned to me
    OR nw_current_emp_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 3. dsa_debit_notes — scope = the note's DSA is assigned to me, or admin.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employees can select own dsa debit notes" ON dsa_debit_notes;
CREATE POLICY "Employees can select own dsa debit notes"
  ON dsa_debit_notes FOR SELECT
  TO authenticated
  USING (
    nw_emp_owns_dsa(dsa_id)
    OR nw_current_emp_is_admin()
  );

DROP POLICY IF EXISTS "Employees can update own dsa debit notes" ON dsa_debit_notes;
CREATE POLICY "Employees can update own dsa debit notes"
  ON dsa_debit_notes FOR UPDATE
  TO authenticated
  USING (
    nw_emp_owns_dsa(dsa_id)
    OR nw_current_emp_is_admin()
  )
  WITH CHECK (
    nw_emp_owns_dsa(dsa_id)
    OR nw_current_emp_is_admin()
  );

DROP POLICY IF EXISTS "Employees can insert dsa debit notes" ON dsa_debit_notes;
CREATE POLICY "Employees can insert dsa debit notes"
  ON dsa_debit_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    (created_by = nw_current_employee_id() AND nw_emp_owns_dsa(dsa_id))
    OR nw_current_emp_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 4. dsa_debit_note_events — same assignment scope as the parent note.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read events for accessible debit notes" ON dsa_debit_note_events;
CREATE POLICY "Read events for accessible debit notes"
  ON dsa_debit_note_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dsa_debit_notes n
      WHERE n.id = dsa_debit_note_events.debit_note_id
        AND (
          nw_emp_owns_dsa(n.dsa_id)
          OR nw_current_emp_is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "Employees append events for accessible debit notes" ON dsa_debit_note_events;
CREATE POLICY "Employees append events for accessible debit notes"
  ON dsa_debit_note_events FOR INSERT
  TO authenticated
  WITH CHECK (
    actor = 'employee'
    AND EXISTS (
      SELECT 1 FROM dsa_debit_notes n
      WHERE n.id = dsa_debit_note_events.debit_note_id
        AND (
          nw_emp_owns_dsa(n.dsa_id)
          OR nw_current_emp_is_admin()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Storage READ scoping for the private dsa-debit-notes bucket.
--    Readable only by the assigned employee of the owning note's DSA, or admin.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Employees can read dsa debit notes objects" ON storage.objects;
CREATE POLICY "Employees can read dsa debit notes objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dsa-debit-notes'
    AND (
      public.nw_current_emp_is_admin()
      OR EXISTS (
        SELECT 1 FROM dsa_debit_notes n
        WHERE (
          n.pdf_url = storage.objects.name
          OR n.signed_pdf_url = storage.objects.name
          OR n.signature_image_path = storage.objects.name
        )
        AND public.nw_emp_owns_dsa(n.dsa_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Remove leftovers from the earlier deployment.
--    - The admin DELETE policy on nw_dsa is NOT part of this feature; drop it so
--      admin DSA-delete behaviour returns to exactly what it was before it.
--    - Retire the Link-B helper. It must be dropped AFTER the policies above are
--      redefined (none of them reference it any longer). IF EXISTS makes this a
--      no-op when the earlier deployment never created it.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can delete DSA records" ON nw_dsa;
DROP FUNCTION IF EXISTS nw_emp_has_dsa_business(uuid);
