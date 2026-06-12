/*
  # Deal Confirmation v2 — M5: Signed Document Storage

  ## Purpose
  Private storage bucket for client-signed deal artifacts:
    deals/<confirmation_number>/signature.png   (captured e-signature)
    deals/<confirmation_number>/signed.pdf       (final signed deal note)

  ## Access model
  - WRITE: only via edge functions using the service role key (accept-deal).
    No INSERT/UPDATE policy is granted to anon/authenticated, so the bucket
    cannot be written to from the browser.
  - READ (employees/admins): direct SELECT policy below, for the CRM to fetch
    or sign URLs.
  - READ (clients): clients are unauthenticated; they receive a short-lived
    signed URL minted server-side by the accept-deal / get-deal-by-token
    functions. Signed URLs work regardless of RLS.
  - DELETE: admins only (rare; primarily for cleanup of non-accepted artifacts).

  Bucket is PRIVATE (public = false).
*/

-- Create the private bucket (id == name)
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-documents', 'deal-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Employees / admins can read objects in the deal-documents bucket
CREATE POLICY "Employees can read deal documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'deal-documents'
    AND EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
    )
  );

-- Only admins can delete deal documents
CREATE POLICY "Admins can delete deal documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'deal-documents'
    AND EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );
