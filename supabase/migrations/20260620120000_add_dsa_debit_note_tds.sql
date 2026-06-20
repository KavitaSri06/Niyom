/*
  # DSA Debit Notes — Fixed 2% TDS Deduction

  Adds TDS accounting to the debit note module. Every DSA payout now carries a
  fixed 2% TDS deduction:

    Gross Payout      = payout_amount        (unchanged meaning)
    TDS @ 2%          = round(gross * 0.02)
    Net Payable       = gross - tds

  Additive and backward-compatible:
  - `payout_amount` keeps its existing meaning as the GROSS payout.
  - `tds_amount` and `net_payable_amount` are new, stored alongside it.
  - Existing numbering, status, audit, and cancellation columns are untouched.

  ADD COLUMN IF NOT EXISTS keeps the migration safe to re-run.
*/

ALTER TABLE dsa_debit_notes
  ADD COLUMN IF NOT EXISTS tds_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable_amount numeric(18,2) NOT NULL DEFAULT 0;

-- Backfill existing notes at the fixed 2% rate so history and PDFs stay
-- consistent with the new calculation. Only touches rows that have not yet
-- been given a net amount (net = 0) and have a non-zero gross.
UPDATE dsa_debit_notes
SET tds_amount = round(payout_amount * 0.02, 2),
    net_payable_amount = payout_amount - round(payout_amount * 0.02, 2)
WHERE net_payable_amount = 0 AND payout_amount <> 0;
