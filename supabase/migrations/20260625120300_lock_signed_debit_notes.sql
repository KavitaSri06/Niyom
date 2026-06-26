/*
  # Debit Note Signing — M4: Immutability of SIGNED notes

  ## Purpose
  Once a debit note has been SIGNED by the DSA it becomes an audit record.
  The following must be blocked for ALL roles (defense in depth, including the
  service role):
    - Regenerate (would overwrite payout amounts / pdf_url)
    - Cancel    (status -> 'cancelled')
    - Editing payout values (payout_amount / tds_amount / net_payable_amount)
    - Re-issuing / mutating the signed artifacts or signer audit trail

  The ONE remaining permitted transition after signing is payment completion:
  Signed -> Paid (status 'generated' -> 'paid', plus paid_at / paid_by). Every
  other protected column is frozen.

  The signing write itself (sign-debit-note edge function) sets
  signature_status = 'signed' in a SINGLE update where OLD.signature_status is
  still 'viewed', so it passes the guard.

  This migration is additive: it only adds a BEFORE UPDATE trigger. Existing
  RLS policies are unchanged.
*/

CREATE OR REPLACE FUNCTION nw_block_signed_debit_note_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only guard rows that are ALREADY signed.
  IF OLD.signature_status <> 'signed' THEN
    RETURN NEW;
  END IF;

  -- Cancellation is permanently disabled for a signed note.
  IF NEW.status = 'cancelled' THEN
    RAISE EXCEPTION
      'Debit note % is signed and locked. It cannot be cancelled.', OLD.debit_note_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- Financial, document, numbering, period, signer and signature columns are
  -- frozen. Any attempt to change them (e.g. a regenerate) is rejected.
  IF NEW.payout_amount       IS DISTINCT FROM OLD.payout_amount
     OR NEW.tds_amount        IS DISTINCT FROM OLD.tds_amount
     OR NEW.net_payable_amount IS DISTINCT FROM OLD.net_payable_amount
     OR NEW.pdf_url            IS DISTINCT FROM OLD.pdf_url
     OR NEW.signed_pdf_url     IS DISTINCT FROM OLD.signed_pdf_url
     OR NEW.signature_image_path IS DISTINCT FROM OLD.signature_image_path
     OR NEW.debit_note_number  IS DISTINCT FROM OLD.debit_note_number
     OR NEW.dsa_id             IS DISTINCT FROM OLD.dsa_id
     OR NEW.month              IS DISTINCT FROM OLD.month
     OR NEW.year               IS DISTINCT FROM OLD.year
     OR NEW.signature_status   IS DISTINCT FROM OLD.signature_status
     OR NEW.secure_token       IS DISTINCT FROM OLD.secure_token
     OR NEW.signed_at          IS DISTINCT FROM OLD.signed_at
     OR NEW.signer_email       IS DISTINCT FROM OLD.signer_email
  THEN
    RAISE EXCEPTION
      'Debit note % is signed and locked. Payout values and documents are immutable; create a new debit note for corrections.', OLD.debit_note_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dsa_debit_notes_block_signed ON dsa_debit_notes;

CREATE TRIGGER dsa_debit_notes_block_signed
  BEFORE UPDATE ON dsa_debit_notes
  FOR EACH ROW EXECUTE FUNCTION nw_block_signed_debit_note_update();
