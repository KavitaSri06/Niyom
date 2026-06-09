/*
  # Client Portal RLS Policies

  ## Summary
  Adds RLS policies so authenticated clients (logged in via client portal)
  can read their own client record and holdings.

  ## Changes

  ### nw_clients
  - New SELECT policy: clients can read their own record using client_auth_user_id

  ### nw_holdings
  - New SELECT policy: clients can read their own holdings via client_auth_user_id join

  ### nw_clients UPDATE
  - New UPDATE policy: clients can update client_password_changed on their own record

  ## Notes
  - All policies use auth.uid() matched against client_auth_user_id
  - Read-only access for clients on holdings (no insert/update/delete)
*/

-- Clients can read their own nw_clients record
CREATE POLICY "Clients can read own client record"
  ON nw_clients FOR SELECT
  TO authenticated
  USING (client_auth_user_id = auth.uid());

-- Clients can update their own password_changed flag
CREATE POLICY "Clients can update own password changed flag"
  ON nw_clients FOR UPDATE
  TO authenticated
  USING (client_auth_user_id = auth.uid())
  WITH CHECK (client_auth_user_id = auth.uid());

-- Clients can read their own holdings
CREATE POLICY "Clients can read own holdings"
  ON nw_holdings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_clients
      WHERE nw_clients.id = nw_holdings.client_id
        AND nw_clients.client_auth_user_id = auth.uid()
    )
  );
