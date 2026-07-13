/*
  # Sprint 5 — Multiple client bank accounts (1 Primary + up to 4 Secondary)

  New model:
    nw_client_bank_accounts — one row per client bank account, with a single
    is_primary row per client (DB-enforced by a partial unique index).

  Backward compatibility:
    nw_clients.bank_account / bank_ifsc / bank_name are RETAINED and remain the
    "primary mirror" — the application updates them explicitly whenever the
    primary account is created / changed / edited / deleted. All existing
    downstream readers (deal snapshots, Transfer Queue, receipts) therefore
    keep working unchanged. NO trigger is used — the mirror is maintained in
    application code so the write path stays explicit and debuggable.

  nw_deal_confirmations.snap_bank_* is NOT touched — signed deal snapshots
  remain immutable.

  D1: nw_documents gains a nullable bank_account_id so a Bank document can be
  tied to a specific account. Existing BANK docs stay unassigned (NULL).

  Only additive schema changes; safe idempotent backfill.
*/

-- =====================================================================
-- 1. Client bank accounts
-- =====================================================================
CREATE TABLE IF NOT EXISTS nw_client_bank_accounts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL REFERENCES nw_clients(id) ON DELETE CASCADE,
  account_number text NOT NULL,
  ifsc           text NOT NULL DEFAULT '',
  bank_name      text NOT NULL DEFAULT '',
  holder_name    text NOT NULL DEFAULT '',
  label          text NOT NULL DEFAULT '',
  is_primary     boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nw_client_bank_accounts_client
  ON nw_client_bank_accounts(client_id);

-- Invariant: at most one PRIMARY account per client (application guarantees
-- at least one primary whenever any account exists).
CREATE UNIQUE INDEX IF NOT EXISTS uq_nw_client_bank_accounts_primary
  ON nw_client_bank_accounts(client_id)
  WHERE is_primary;

ALTER TABLE nw_client_bank_accounts ENABLE ROW LEVEL SECURITY;

-- Owner-RM-or-admin access, mirroring other nw_clients child tables. Reuses the
-- existing SECURITY DEFINER RLS helpers (nw_current_employee_id / _emp_is_admin).
CREATE POLICY "nw_cba_select" ON nw_client_bank_accounts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nw_clients c
     WHERE c.id = client_id
       AND (c.employee_id = nw_current_employee_id() OR nw_current_emp_is_admin())
  ));

CREATE POLICY "nw_cba_insert" ON nw_client_bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM nw_clients c
     WHERE c.id = client_id
       AND (c.employee_id = nw_current_employee_id() OR nw_current_emp_is_admin())
  ));

CREATE POLICY "nw_cba_update" ON nw_client_bank_accounts
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nw_clients c
     WHERE c.id = client_id
       AND (c.employee_id = nw_current_employee_id() OR nw_current_emp_is_admin())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM nw_clients c
     WHERE c.id = client_id
       AND (c.employee_id = nw_current_employee_id() OR nw_current_emp_is_admin())
  ));

CREATE POLICY "nw_cba_delete" ON nw_client_bank_accounts
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM nw_clients c
     WHERE c.id = client_id
       AND (c.employee_id = nw_current_employee_id() OR nw_current_emp_is_admin())
  ));

-- =====================================================================
-- 2. D1 — link a Bank document to a specific account (nullable)
-- =====================================================================
ALTER TABLE nw_documents
  ADD COLUMN IF NOT EXISTS bank_account_id uuid
  REFERENCES nw_client_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nw_documents_bank_account
  ON nw_documents(bank_account_id);

-- =====================================================================
-- 3. Safe idempotent backfill — seed one PRIMARY row per existing client that
--    already has bank data and has no bank-account row yet.
-- =====================================================================
INSERT INTO nw_client_bank_accounts (client_id, account_number, ifsc, bank_name, is_primary)
SELECT c.id,
       COALESCE(c.bank_account, ''),
       COALESCE(c.bank_ifsc, ''),
       COALESCE(c.bank_name, ''),
       true
FROM nw_clients c
WHERE (COALESCE(c.bank_account, '') <> ''
       OR COALESCE(c.bank_ifsc, '') <> ''
       OR COALESCE(c.bank_name, '') <> '')
  AND NOT EXISTS (
    SELECT 1 FROM nw_client_bank_accounts b WHERE b.client_id = c.id
  );
