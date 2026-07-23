/*
  # Bond Security Master — normalized schema

  One master row per ISIN (bm_bonds) + normalized children. The Excel supplies
  only isin / bond_name / latest_price; everything else is enriched by providers
  or computed by the analytics engine. bm_* prefix throughout. Idempotent.
*/

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Issuer master (deduplicated across bonds)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_issuers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  category     text NOT NULL DEFAULT '',
  industry     text NOT NULL DEFAULT '',
  sector       text NOT NULL DEFAULT '',
  pan          text NOT NULL DEFAULT '',
  external_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bm_issuers_name ON bm_issuers (lower(name));
CREATE INDEX IF NOT EXISTS idx_bm_issuers_name_trgm ON bm_issuers USING gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Bond master
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_bonds (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isin                  text NOT NULL UNIQUE,
  issuer_id             uuid REFERENCES bm_issuers(id) ON DELETE SET NULL,

  -- Identity
  bond_name             text NOT NULL DEFAULT '',
  security_description   text NOT NULL DEFAULT '',
  series                text NOT NULL DEFAULT '',

  -- Dates
  issue_date            date,
  listing_date          date,
  maturity_date         date,
  redemption_date       date,

  -- Coupon / structure
  face_value            numeric,
  issue_price           numeric,
  redemption_value      numeric,
  coupon_rate           numeric,
  coupon_type           text NOT NULL DEFAULT 'fixed'
                          CHECK (coupon_type IN ('fixed','floating','zero','')),
  coupon_frequency      text NOT NULL DEFAULT ''
                          CHECK (coupon_frequency IN ('monthly','quarterly','half_yearly','annual','zero','custom','')),
  interest_payment_dates text NOT NULL DEFAULT '',      -- seed IP-date list from provider
  first_coupon_date     date,
  next_coupon_date      date,
  previous_coupon_date  date,
  day_count_convention  text NOT NULL DEFAULT 'actual_365'
                          CHECK (day_count_convention IN ('actual_actual','actual_365','30_360','')),
  business_day_convention text NOT NULL DEFAULT 'following'
                          CHECK (business_day_convention IN ('following','modified_following','none','')),
  principal_repayment_structure text NOT NULL DEFAULT '',   -- bullet | amortizing | text
  redemption_schedule   jsonb NOT NULL DEFAULT '[]'::jsonb, -- parsed partial-redemption events

  -- Flags
  callable              boolean NOT NULL DEFAULT false,
  puttable              boolean NOT NULL DEFAULT false,
  perpetual             boolean NOT NULL DEFAULT false,
  floating              boolean NOT NULL DEFAULT false,
  put_call_date         date,
  put_call_type         text NOT NULL DEFAULT '',

  -- Classification
  seniority             text NOT NULL DEFAULT '',
  security_type         text NOT NULL DEFAULT '',
  secured               boolean,
  tax_status            text NOT NULL DEFAULT '',

  -- Listing
  exchange_listed       text NOT NULL DEFAULT '',
  listing_status        text NOT NULL DEFAULT '',
  nse_symbol            text NOT NULL DEFAULT '',
  bse_code              text NOT NULL DEFAULT '',

  -- Trading
  min_investment        numeric,
  lot_size              numeric,
  currency              text NOT NULL DEFAULT 'INR',

  -- Rating (latest; history in bm_rating_history)
  rating                text NOT NULL DEFAULT '',
  rating_agency         text NOT NULL DEFAULT '',
  rating_date           date,

  issuer_docs           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- IM / termsheet / rating URLs

  -- Internal pricing (admin-only; never in the public projection)
  landing_cost          numeric,
  default_margin_type   text NOT NULL DEFAULT 'percent'
                          CHECK (default_margin_type IN ('none','percent','flat')),
  default_margin_value  numeric,
  selling_price         numeric,

  -- Daily price (from the Excel)
  latest_price          numeric,
  price_updated_at      timestamptz,
  extracted_name        text NOT NULL DEFAULT '',            -- name as seen in the Excel

  -- Quality / lifecycle
  active_status         text NOT NULL DEFAULT 'active'
                          CHECK (active_status IN ('active','matured','suspended','inactive')),
  verification_status   text NOT NULL DEFAULT 'pending'
                          CHECK (verification_status IN ('pending','enriching','verified','needs_review','failed')),
  data_quality_score    numeric NOT NULL DEFAULT 0,
  source_summary        jsonb NOT NULL DEFAULT '{}'::jsonb,
  enriched_at           timestamptz,

  created_by            uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  modified_by           uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_issuer      ON bm_bonds (issuer_id);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_maturity    ON bm_bonds (maturity_date);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_rating      ON bm_bonds (rating);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_active      ON bm_bonds (active_status);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_verif       ON bm_bonds (verification_status);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_coupon      ON bm_bonds (coupon_rate);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_name_trgm   ON bm_bonds USING gin (bond_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bm_bonds_isin_trgm   ON bm_bonds USING gin (isin gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Generated schedules (analytics engine writes these)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_coupon_schedule (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id             uuid NOT NULL REFERENCES bm_bonds(id) ON DELETE CASCADE,
  seq                 int NOT NULL,
  period_start        date,
  period_end          date,
  scheduled_date      date,
  pay_date            date,                 -- business-day adjusted
  coupon_per_100      numeric NOT NULL DEFAULT 0,
  outstanding_per_100 numeric NOT NULL DEFAULT 100,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bm_coupon_sched_bond ON bm_coupon_schedule (bond_id, seq);

CREATE TABLE IF NOT EXISTS bm_cashflow_schedule (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id          uuid NOT NULL REFERENCES bm_bonds(id) ON DELETE CASCADE,
  seq              int NOT NULL,
  cf_date          date NOT NULL,
  interest_per_100 numeric NOT NULL DEFAULT 0,
  principal_per_100 numeric NOT NULL DEFAULT 0,
  total_per_100    numeric NOT NULL DEFAULT 0,
  remark           text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bm_cashflow_sched_bond ON bm_cashflow_schedule (bond_id, seq);

-- ---------------------------------------------------------------------------
-- History + reference
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bm_price_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id    uuid NOT NULL REFERENCES bm_bonds(id) ON DELETE CASCADE,
  isin       text NOT NULL,
  price      numeric NOT NULL,
  as_of      date NOT NULL DEFAULT current_date,
  source     text NOT NULL DEFAULT 'excel_upload',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bond_id, as_of)
);
CREATE INDEX IF NOT EXISTS idx_bm_price_hist_bond ON bm_price_history (bond_id, as_of DESC);

CREATE TABLE IF NOT EXISTS bm_rating_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id     uuid NOT NULL REFERENCES bm_bonds(id) ON DELETE CASCADE,
  rating      text NOT NULL DEFAULT '',
  agency      text NOT NULL DEFAULT '',
  rating_date date,
  source      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bm_rating_hist_bond ON bm_rating_history (bond_id, rating_date DESC);

CREATE TABLE IF NOT EXISTS bm_corporate_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id     uuid NOT NULL REFERENCES bm_bonds(id) ON DELETE CASCADE,
  action_type text NOT NULL DEFAULT '',
  ex_date     date,
  record_date date,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  source      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bm_corp_actions_bond ON bm_corporate_actions (bond_id, ex_date DESC);

-- Field-level provenance + lock (drives data-quality + "never overwrite verified").
CREATE TABLE IF NOT EXISTS bm_field_provenance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id     uuid NOT NULL REFERENCES bm_bonds(id) ON DELETE CASCADE,
  field_name  text NOT NULL,
  value       text,
  source      text NOT NULL DEFAULT '',
  confidence  numeric NOT NULL DEFAULT 0,
  is_locked   boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  verified_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bond_id, field_name)
);
CREATE INDEX IF NOT EXISTS idx_bm_provenance_bond ON bm_field_provenance (bond_id);

CREATE TABLE IF NOT EXISTS bm_verification_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bond_id       uuid NOT NULL REFERENCES bm_bonds(id) ON DELETE CASCADE UNIQUE,
  missing_fields text[] NOT NULL DEFAULT '{}',
  conflicts     jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence    numeric NOT NULL DEFAULT 0,
  reason        text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_by   uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  resolved_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_bm_verif_queue_status ON bm_verification_queue (status, created_at DESC);

-- Every external fetch (audit + rate-limit accounting).
CREATE TABLE IF NOT EXISTS bm_provider_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isin           text NOT NULL DEFAULT '',
  bond_id        uuid REFERENCES bm_bonds(id) ON DELETE SET NULL,
  provider_id    text NOT NULL DEFAULT '',
  status         text NOT NULL DEFAULT '',
  http_status    int,
  latency_ms     int,
  fields_returned int NOT NULL DEFAULT 0,
  error          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bm_provider_log_isin ON bm_provider_log (isin, created_at DESC);

-- Market holiday calendar for business-day adjustment.
CREATE TABLE IF NOT EXISTS bm_holiday_calendar (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name         text NOT NULL DEFAULT '',
  market       text NOT NULL DEFAULT 'IN',
  UNIQUE (market, holiday_date)
);

-- Touch trigger for updated_at on the master + issuers.
CREATE OR REPLACE FUNCTION bm_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_bm_bonds_touch   ON bm_bonds;
DROP TRIGGER IF EXISTS trg_bm_issuers_touch ON bm_issuers;
CREATE TRIGGER trg_bm_bonds_touch   BEFORE UPDATE ON bm_bonds   FOR EACH ROW EXECUTE FUNCTION bm_touch_updated_at();
CREATE TRIGGER trg_bm_issuers_touch BEFORE UPDATE ON bm_issuers FOR EACH ROW EXECUTE FUNCTION bm_touch_updated_at();
