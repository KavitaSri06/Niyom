/*
  # Document Management System

  ## Summary
  Creates a full document management system for the CRM with permanent structured
  storage in Supabase Storage, database tracking, audit logs, and role-based access.

  ## 1. New Table: nw_documents
  Tracks every uploaded document linked to a client.
  - `id` — UUID primary key
  - `client_id` — FK to nw_clients
  - `employee_id` — FK to nw_employees (uploader)
  - `document_type` — enum: PAN, CML, BANK, DEAL_CONFIRMATION, MANDATE, DSA_DOCUMENTS, OTHER_DOCUMENTS
  - `file_name` — original file name (timestamped)
  - `file_path` — full storage path e.g. clients/NIYOM-001-0001/PAN/pan_2026-05-23.pdf
  - `file_size` — in bytes
  - `mime_type` — content type
  - `uploaded_at` — timestamp
  - `uploaded_by_name` — denormalized employee name for display

  ## 2. New Table: nw_document_logs
  Audit trail for all document actions (upload/download/delete/view).
  - `id` — UUID primary key
  - `action_type` — upload | download | delete | view
  - `user_id` — auth.uid()
  - `employee_id` — FK to nw_employees
  - `document_id` — FK to nw_documents (nullable for delete after record removal)
  - `client_id` — FK to nw_clients
  - `file_name` — for reference after deletion
  - `timestamp` — when action occurred
  - `ip_note` — optional metadata

  ## 3. Security
  - RLS on both tables
  - Employees see only their clients' documents
  - Admins see all documents system-wide
  - Only admins can delete documents
*/

-- ============================================================
-- 1. Create nw_documents table
-- ============================================================
CREATE TABLE IF NOT EXISTS nw_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid NOT NULL REFERENCES nw_clients(id) ON DELETE CASCADE,
  employee_id      uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  document_type    text NOT NULL DEFAULT 'OTHER_DOCUMENTS',
  file_name        text NOT NULL DEFAULT '',
  file_path        text NOT NULL DEFAULT '',
  file_size        bigint DEFAULT 0,
  mime_type        text DEFAULT '',
  uploaded_by_name text DEFAULT '',
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view their own client documents"
  ON nw_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_documents.client_id
        AND (c.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );

CREATE POLICY "Employees can insert documents for their clients"
  ON nw_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_documents.client_id
        AND (c.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );

CREATE POLICY "Admins can delete any document"
  ON nw_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_nw_documents_client_id ON nw_documents(client_id);
CREATE INDEX IF NOT EXISTS idx_nw_documents_employee_id ON nw_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_nw_documents_document_type ON nw_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_nw_documents_uploaded_at ON nw_documents(uploaded_at DESC);

-- ============================================================
-- 2. Create nw_document_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS nw_document_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type  text NOT NULL DEFAULT 'upload',
  user_id      uuid,
  employee_id  uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  document_id  uuid,
  client_id    uuid REFERENCES nw_clients(id) ON DELETE SET NULL,
  file_name    text DEFAULT '',
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_document_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all document logs"
  ON nw_document_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid()
        AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Employees can view logs for their clients"
  ON nw_document_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients c
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE c.id = nw_document_logs.client_id
        AND c.employee_id = e.id
    )
  );

CREATE POLICY "Authenticated users can insert logs"
  ON nw_document_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_nw_document_logs_document_id ON nw_document_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_nw_document_logs_client_id ON nw_document_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_nw_document_logs_created_at ON nw_document_logs(created_at DESC);
