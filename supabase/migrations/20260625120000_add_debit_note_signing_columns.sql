/*
  # Debit Note Signing — M1: Signature lifecycle + e-sign audit columns

  ## Purpose
  Adds the DSA-facing signature lifecycle and e-signature audit trail to
  `dsa_debit_notes`, mirroring the proven Deal Confirmation acceptance model
  (secure link → email OTP → e-sign → stored signed PDF). The signer is the
  DSA (payee) who acknowledges the debit note.

  This migration is ADDITIVE ONLY and fully backward compatible:
  - The existing `status` column (generated | paid | cancelled) is UNTOUCHED —
    it continues to track PAYMENT state. Signature state lives in the new,
    independent `signature_status` column.
  - The original generated PDF path (`pdf_url`) is preserved; the signed copy
    is stored separately in the new `signed_pdf_url` column. Both are retained.
  - All new columns are nullable / defaulted, so existing rows keep working.

  ## Business rules these columns support
  - Link expiry = 7 days (token_expires_at).
  - Signature lifecycle: not_sent | sent | viewed | signed.
  - Once signed, the note becomes immutable (enforced in M4):
    regenerate / cancel / payout edits are blocked.
*/

ALTER TABLE dsa_debit_notes
  -- Signature lifecycle (independent of payment `status`)
  ADD COLUMN IF NOT EXISTS signature_status text NOT NULL DEFAULT 'not_sent'
    CHECK (signature_status IN ('not_sent', 'sent', 'viewed', 'signed')),
  -- Secure public link token + expiry (rotated on each send)
  ADD COLUMN IF NOT EXISTS secure_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  -- Lifecycle timestamps
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES nw_employees(id) ON DELETE SET NULL,
  -- E-signature audit trail
  ADD COLUMN IF NOT EXISTS signer_email text,
  ADD COLUMN IF NOT EXISTS signer_ip text,
  ADD COLUMN IF NOT EXISTS signer_user_agent text,
  ADD COLUMN IF NOT EXISTS signature_image_path text,
  -- Signed PDF stored SEPARATELY from the original generated PDF (pdf_url)
  ADD COLUMN IF NOT EXISTS signed_pdf_url text,
  -- Immutable snapshot of the exact inputs used to render the generated PDF
  -- (particulars, dsa details, document date, generatedBy). The public signing
  -- page rebuilds the identical document from this snapshot and embeds the DSA
  -- signature, guaranteeing the signed copy == generated copy + signature and
  -- avoiding any recomputation of payout/TDS values.
  ADD COLUMN IF NOT EXISTS pdf_snapshot jsonb;

-- A token, when present, must be globally unique so a public link resolves to
-- exactly one debit note. NULLs are allowed and excluded (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_dsa_debit_notes_secure_token
  ON dsa_debit_notes(secure_token)
  WHERE secure_token IS NOT NULL;

-- Fast filtering by signature state for CRM list / stats
CREATE INDEX IF NOT EXISTS idx_dsa_debit_notes_signature_status
  ON dsa_debit_notes(signature_status);
