/*
  # Debit Note Signing — M3: Audit Events

  ## Purpose
  Immutable-ish audit trail for every debit-note signing state transition and
  major action: generated, link sent, viewed, OTP sent/verified, signed,
  signed-PDF stored, marked paid, ZIP downloaded. Powers the CRM audit timeline
  and provides a compliance record for the e-sign flow.

  ## Table: dsa_debit_note_events
  - debit_note_id  FK -> dsa_debit_notes (cascade delete with parent)
  - event_type     what happened
  - actor          who/what triggered it (employee | dsa | system)
  - metadata       free-form jsonb
  - ip             captured for client-side events
  - user_agent     captured for client-side events
  - created_at     event timestamp

  ## Security
  - RLS enabled.
  - SELECT: the employee who created the parent note, the employee who owns the
    parent DSA, or any admin/super_admin.
  - INSERT: employees may log their own action events (actor = 'employee') for
    notes they can access. DSA/system events are written by edge functions via
    the service role, which bypasses RLS.
  - No UPDATE / DELETE policies: audit rows are append-only for app roles.
*/

CREATE TABLE IF NOT EXISTS dsa_debit_note_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debit_note_id uuid NOT NULL REFERENCES dsa_debit_notes(id) ON DELETE CASCADE,
  event_type    text NOT NULL CHECK (event_type IN (
                  'generated', 'link_sent', 'viewed', 'otp_sent', 'otp_verified',
                  'signed', 'signed_pdf_stored', 'marked_paid', 'cancelled',
                  'zip_downloaded', 'expired'
                )),
  actor         text NOT NULL DEFAULT 'system' CHECK (actor IN ('employee', 'dsa', 'system')),
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip            text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dsa_debit_note_events ENABLE ROW LEVEL SECURITY;

-- Helper predicate: can the current employee see this debit note?
-- (creator OR owns the DSA OR admin) — mirrors dsa_debit_notes SELECT policy.
CREATE POLICY "Read events for accessible debit notes"
  ON dsa_debit_note_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM dsa_debit_notes n
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE n.id = dsa_debit_note_events.debit_note_id
        AND (
          n.created_by = e.id
          OR n.dsa_id IN (SELECT d.id FROM nw_dsa d WHERE d.employee_id = e.id)
          OR e.role IN ('admin', 'super_admin')
        )
    )
  );

CREATE POLICY "Employees append events for accessible debit notes"
  ON dsa_debit_note_events FOR INSERT
  TO authenticated
  WITH CHECK (
    actor = 'employee'
    AND EXISTS (
      SELECT 1
      FROM dsa_debit_notes n
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE n.id = dsa_debit_note_events.debit_note_id
        AND (
          n.created_by = e.id
          OR n.dsa_id IN (SELECT d.id FROM nw_dsa d WHERE d.employee_id = e.id)
          OR e.role IN ('admin', 'super_admin')
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_dsa_debit_note_events_note       ON dsa_debit_note_events(debit_note_id);
CREATE INDEX IF NOT EXISTS idx_dsa_debit_note_events_created_at ON dsa_debit_note_events(created_at);
