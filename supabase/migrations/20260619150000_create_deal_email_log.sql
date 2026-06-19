/*
  # Deal Confirmation — Email Audit Log

  Additive, append-only audit trail for every deal-confirmation email sent
  (secure-link requests and signed-copy distributions). Each send — including
  every resend — inserts a NEW row; rows are never updated or overwritten.

  ## Table: nw_deal_email_log
  - deal_confirmation_id  FK -> nw_deal_confirmations (cascade with parent)
  - email_type            'secure_link' | 'signed_pdf'
  - sent_to               primary (To) recipient address
  - cc_recipients         text[] of CC addresses
  - sent_by               employee who triggered it (NULL for system sends)
  - is_resend             true when a prior email of this type already existed
  - status                'sent' | 'failed' | 'partial'
  - provider_message_id   Resend message id (when available)
  - metadata              free-form jsonb
  - sent_at / created_at  timestamps

  ## Security
  - RLS enabled.
  - SELECT: owning employee or admin/super_admin.
  - No INSERT/UPDATE/DELETE policies for app roles — rows are written only by
    edge functions using the service role (which bypasses RLS), keeping the log
    append-only and tamper-resistant from the client.
*/

CREATE TABLE IF NOT EXISTS nw_deal_email_log (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_confirmation_id uuid NOT NULL REFERENCES nw_deal_confirmations(id) ON DELETE CASCADE,
  email_type           text NOT NULL CHECK (email_type IN ('secure_link', 'signed_pdf')),
  sent_to              text NOT NULL DEFAULT '',
  cc_recipients        text[] NOT NULL DEFAULT '{}',
  sent_by              uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  is_resend            boolean NOT NULL DEFAULT false,
  status               text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'partial')),
  provider_message_id  text,
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at              timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_deal_email_log ENABLE ROW LEVEL SECURITY;

-- Owning employee or admins can read a deal's email audit trail
CREATE POLICY "Read deal email log for owned or admin deals"
  ON nw_deal_email_log FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nw_deal_confirmations d
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE d.id = nw_deal_email_log.deal_confirmation_id
        AND (d.employee_id = e.id OR e.role IN ('admin', 'super_admin'))
    )
  );

CREATE INDEX IF NOT EXISTS idx_nw_deal_email_log_deal ON nw_deal_email_log(deal_confirmation_id);
CREATE INDEX IF NOT EXISTS idx_nw_deal_email_log_sent_at ON nw_deal_email_log(sent_at);
