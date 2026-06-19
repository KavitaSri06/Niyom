/*
  # Create DSA Debit Notes Module (V2)

  ## Purpose
  Stores debit notes generated from the DSA Payout module. One debit note per
  DSA per payout month, carrying the calculated payout amount, a unique
  debit-note number (DN-YYYY-MM-XXXX), and the path to the generated PDF in
  Supabase Storage. Supports regeneration (same row, refreshed PDF) and
  viewing previous notes for a selected month.

  ## New Tables
  - `dsa_debit_notes`
    - `id`                 — primary key
    - `dsa_id`             — FK to nw_dsa
    - `month`              — payout month (1-12)
    - `year`               — payout year
    - `payout_amount`      — debit note amount (= calculated payout)
    - `debit_note_number`  — unique reference, DN-YYYY-MM-XXXX
    - `generated_at`       — last generation timestamp
    - `pdf_url`            — storage object path of the generated PDF
    - `created_by`         — FK to nw_employees (generator)
    - One note per (dsa_id, month, year) — regeneration updates the same row.

  ## New Storage
  - Private bucket `dsa-debit-notes` holding the generated PDFs.

  ## Security
  - RLS enabled; employees manage notes they created or for their own DSAs;
    admins manage all. Storage access scoped to authenticated employees.

  This migration is additive only — it does not alter any existing table.
*/

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dsa_debit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dsa_id uuid REFERENCES nw_dsa(id) ON DELETE CASCADE,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  year int NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  payout_amount numeric(18,2) NOT NULL DEFAULT 0,
  debit_note_number text UNIQUE NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  pdf_url text NOT NULL DEFAULT '',
  created_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dsa_id, month, year)
);

ALTER TABLE dsa_debit_notes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dsa_debit_notes_dsa ON dsa_debit_notes(dsa_id);
CREATE INDEX IF NOT EXISTS idx_dsa_debit_notes_period ON dsa_debit_notes(year, month);
CREATE INDEX IF NOT EXISTS idx_dsa_debit_notes_created_by ON dsa_debit_notes(created_by);

-- ---------------------------------------------------------------------------
-- RLS policies (mirrors nw_deal_confirmations access model)
-- ---------------------------------------------------------------------------
CREATE POLICY "Employees can select own dsa debit notes"
  ON dsa_debit_notes FOR SELECT
  TO authenticated
  USING (
    created_by IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
    OR dsa_id IN (
      SELECT d.id FROM nw_dsa d
      JOIN nw_employees e ON e.id = d.employee_id
      WHERE e.auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Employees can insert dsa debit notes"
  ON dsa_debit_notes FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Employees can update own dsa debit notes"
  ON dsa_debit_notes FOR UPDATE
  TO authenticated
  USING (
    created_by IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    created_by IN (SELECT id FROM nw_employees WHERE auth_user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Admins can delete dsa debit notes"
  ON dsa_debit_notes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM nw_employees e
      WHERE e.auth_user_id = auth.uid() AND e.role IN ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_update_dsa_debit_note_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER dsa_debit_notes_updated_at
  BEFORE UPDATE ON dsa_debit_notes
  FOR EACH ROW EXECUTE FUNCTION nw_update_dsa_debit_note_updated_at();

-- ---------------------------------------------------------------------------
-- Debit note number generator: DN-YYYY-MM-XXXX (sequential per month)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION nw_generate_debit_note_number(p_year int, p_month int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq int;
  v_number text;
BEGIN
  SELECT COUNT(*) + 1 INTO v_seq
  FROM dsa_debit_notes
  WHERE year = p_year AND month = p_month;

  v_number := 'DN-' || p_year::text || '-' || LPAD(p_month::text, 2, '0')
              || '-' || LPAD(v_seq::text, 4, '0');
  RETURN v_number;
END;
$$;

-- ---------------------------------------------------------------------------
-- Private storage bucket for generated debit note PDFs
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('dsa-debit-notes', 'dsa-debit-notes', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Employees can upload dsa debit notes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'dsa-debit-notes'
    AND EXISTS (SELECT 1 FROM nw_employees WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Employees can update dsa debit notes objects"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'dsa-debit-notes'
    AND EXISTS (SELECT 1 FROM nw_employees WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Employees can read dsa debit notes objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'dsa-debit-notes'
    AND EXISTS (SELECT 1 FROM nw_employees WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Admins can delete dsa debit notes objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'dsa-debit-notes'
    AND EXISTS (
      SELECT 1 FROM nw_employees
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );
