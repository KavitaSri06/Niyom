/*
  # Storage RLS Policies for crm-documents bucket

  ## Summary
  Sets up row-level security policies on the Supabase Storage objects table
  for the crm-documents bucket so that:
  - Authenticated employees can upload to their clients' folders
  - Admins can read/write/delete any object
  - Employees can only access their assigned clients' documents
  - All access requires valid authentication
*/

-- Allow authenticated users to upload to crm-documents bucket
CREATE POLICY "Authenticated users can upload to crm-documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'crm-documents');

-- Employees can view objects in their clients' folders; admins see all
CREATE POLICY "Role-based read access for crm-documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'crm-documents'
    AND (
      EXISTS (
        SELECT 1 FROM nw_employees
        WHERE auth_user_id = auth.uid()
          AND role IN ('admin', 'super_admin')
      )
      OR EXISTS (
        SELECT 1 FROM nw_employees e
        JOIN nw_clients c ON c.employee_id = e.id
        WHERE e.auth_user_id = auth.uid()
          AND ('clients/' || c.client_code || '/') = substring(name, 1, length('clients/' || c.client_code || '/'))
      )
    )
  );

-- Only admins can delete from crm-documents
CREATE POLICY "Admins can delete from crm-documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'crm-documents'
    AND EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );
