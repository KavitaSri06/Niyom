/*
  # NSDL Security Master — local search cache

  Backs the trading-terminal-style security autocomplete in Deal Confirmation.
  Employees search this local cache first (fast, no external call); on a miss the
  `nsdl-search` edge function queries NSDL server-side and upserts the result here.
  A daily `nsdl-refresh-cache` job re-queries the ISINs already in this table to
  refresh their status/description.

  This is a shared REFERENCE cache (not client-scoped): every authenticated
  employee may read it; only the service role (edge functions / cron) writes it —
  mirroring the existing data_update_log / *_price_history convention
  (migration 20260212141007).

  Field mapping from the NSDL participant-search API response:
    name           <- data[].name                     (issuer / company)
    security_name  <- data[].isin_description__value   (full security description)
    security_type  <- data[].security_description      (EQUITY SHARES / DEBENTURE / …)
    isin_status    <- data[].isin_status               (ACTIVE / SUSPENDED / DELETED)
    isin           <- data[].field_isin
    nsdl_id        <- data[].id

  Only additive schema changes; idempotent.
*/

-- Trigram matching for fast substring / prefix search on company names.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS nsdl_securities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isin           text NOT NULL UNIQUE,
  name           text NOT NULL DEFAULT '',
  security_name  text NOT NULL DEFAULT '',
  security_type  text NOT NULL DEFAULT '',
  isin_status    text NOT NULL DEFAULT '',
  nsdl_id        text NOT NULL DEFAULT '',
  source         text NOT NULL DEFAULT 'nsdl',
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- Fast case-insensitive substring search on company name and security description.
CREATE INDEX IF NOT EXISTS idx_nsdl_securities_name_trgm
  ON nsdl_securities USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_nsdl_securities_secname_trgm
  ON nsdl_securities USING gin (security_name gin_trgm_ops);

-- Status filtering / ACTIVE-first ordering.
CREATE INDEX IF NOT EXISTS idx_nsdl_securities_status
  ON nsdl_securities (isin_status);

-- Staleness scans for the daily refresh job.
CREATE INDEX IF NOT EXISTS idx_nsdl_securities_last_synced
  ON nsdl_securities (last_synced_at);

ALTER TABLE nsdl_securities ENABLE ROW LEVEL SECURITY;

-- Any authenticated employee may read the shared security cache.
CREATE POLICY "Authenticated can read nsdl securities"
  ON nsdl_securities FOR SELECT
  TO authenticated
  USING (true);

-- Only the service role (edge functions / cron) writes the cache.
CREATE POLICY "Service role can manage nsdl securities"
  ON nsdl_securities FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
