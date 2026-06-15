/*
  # Feature #5 (V1) — Replace Document support

  Adds the minimum additive RLS policies needed to REPLACE an existing
  document in place (Option A: overwrite the same storage object, update the
  same nw_documents row). No new tables, no new columns, no versioning.

  Idempotent: each policy is created only if an equivalent one does not
  already exist, so re-running cannot create duplicates.
*/

-- 1. Allow UPDATE on nw_documents for the owning employee or an admin
--    (mirrors the existing INSERT/SELECT permission). Skipped if any UPDATE
--    policy already exists on the table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'nw_documents' AND cmd = 'UPDATE'
  ) THEN
    CREATE POLICY "Employees and admins can update their documents"
      ON nw_documents FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM nw_clients c
          JOIN nw_employees e ON e.auth_user_id = auth.uid()
          WHERE c.id = nw_documents.client_id
            AND (c.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM nw_clients c
          JOIN nw_employees e ON e.auth_user_id = auth.uid()
          WHERE c.id = nw_documents.client_id
            AND (c.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
        )
      );
  END IF;
END $$;

-- 2. Allow UPDATE (overwrite) on storage.objects in the crm-documents bucket
--    for admins (all) and employees (their own clients' folders) — mirrors the
--    existing role-based SELECT policy. Guarded by exact name so it never
--    clashes with UPDATE policies that other buckets may define.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Role-based overwrite for crm-documents'
  ) THEN
    CREATE POLICY "Role-based overwrite for crm-documents"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'crm-documents' AND (
          EXISTS (
            SELECT 1 FROM nw_employees
            WHERE auth_user_id = auth.uid() AND role IN ('admin', 'super_admin')
          )
          OR EXISTS (
            SELECT 1 FROM nw_employees e
            JOIN nw_clients c ON c.employee_id = e.id
            WHERE e.auth_user_id = auth.uid()
              AND ('clients/' || c.client_code || '/') = substring(name, 1, length('clients/' || c.client_code || '/'))
          )
        )
      )
      WITH CHECK (
        bucket_id = 'crm-documents' AND (
          EXISTS (
            SELECT 1 FROM nw_employees
            WHERE auth_user_id = auth.uid() AND role IN ('admin', 'super_admin')
          )
          OR EXISTS (
            SELECT 1 FROM nw_employees e
            JOIN nw_clients c ON c.employee_id = e.id
            WHERE e.auth_user_id = auth.uid()
              AND ('clients/' || c.client_code || '/') = substring(name, 1, length('clients/' || c.client_code || '/'))
          )
        )
      );
  END IF;
END $$;
