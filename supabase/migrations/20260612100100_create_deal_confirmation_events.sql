/*
  # Deal Confirmation v2 — M2: Audit Events

  ## Purpose
  Immutable-ish audit trail for every deal-confirmation state transition:
  link sent, client viewed, OTP sent/verified, accepted, rejected, edited,
  token invalidated, expired. Powers the CRM audit timeline and provides a
  compliance record for the e-sign flow.

  ## Table: nw_deal_confirmation_events
  - deal_id      FK -> nw_deal_confirmations (cascade delete with parent)
  - event_type   what happened
  - actor        who/what triggered it (employee | client | system)
  - metadata     free-form jsonb (e.g. email masked, reason, resend count)
  - ip           captured for client-side events
  - user_agent   captured for client-side events
  - created_at   event timestamp

  ## Security
  - RLS enabled.
  - SELECT: the employee who owns the parent deal, or any admin/super_admin.
  - INSERT: employees may log events (actor = 'employee') for deals they own.
            Client/system events are written by edge functions via the service
            role, which bypasses RLS.
  - No UPDATE / DELETE policies: audit rows are append-only for app roles.
*/

CREATE TABLE IF NOT EXISTS nw_deal_confirmation_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     uuid NOT NULL REFERENCES nw_deal_confirmations(id) ON DELETE CASCADE,
  event_type  text NOT NULL CHECK (event_type IN (
                'link_sent', 'viewed', 'otp_sent', 'otp_verified',
                'accepted', 'rejected', 'edited', 'token_invalidated', 'expired'
              )),
  actor       text NOT NULL DEFAULT 'system' CHECK (actor IN ('employee', 'client', 'system')),
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip          text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE nw_deal_confirmation_events ENABLE ROW LEVEL SECURITY;

-- Owning employee or admins can read a deal's audit trail
CREATE POLICY "Read events for owned or admin deals"
  ON nw_deal_confirmation_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM nw_deal_confirmations d
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE d.id = nw_deal_confirmation_events.deal_id
        AND (
          d.employee_id = e.id
          OR e.role IN ('admin', 'super_admin')
        )
    )
  );

-- Employees may append their own action events (e.g. 'edited') for owned deals
CREATE POLICY "Employees append events for owned deals"
  ON nw_deal_confirmation_events FOR INSERT
  TO authenticated
  WITH CHECK (
    actor = 'employee'
    AND EXISTS (
      SELECT 1
      FROM nw_deal_confirmations d
      JOIN nw_employees e ON e.auth_user_id = auth.uid()
      WHERE d.id = nw_deal_confirmation_events.deal_id
        AND (
          d.employee_id = e.id
          OR e.role IN ('admin', 'super_admin')
        )
    )
  );

CREATE INDEX IF NOT EXISTS idx_nw_deal_events_deal       ON nw_deal_confirmation_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_nw_deal_events_created_at ON nw_deal_confirmation_events(created_at);
