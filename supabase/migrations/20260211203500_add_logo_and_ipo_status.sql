/*
  # Add Logo and IPO Status Fields

  1. Changes to `unlisted_shares` table
    - Add `logo_url` (text, nullable) - URL to company logo image
    - Add `ipo_status` (text, default 'unlisted') - Track IPO status: 'unlisted', 'ipo_filed', 'listed'
    - Add check constraint to ensure valid IPO status values

  2. Changes to `secondary_bonds` table
    - Add `logo_url` (text, nullable) - URL to issuer logo image

  3. Notes
    - Uses IF NOT EXISTS to prevent errors on re-run
    - Default ipo_status is 'unlisted' for pre-IPO companies
    - Companies with status 'listed' should be filtered out in the UI
*/

-- Add logo_url and ipo_status to unlisted_shares table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unlisted_shares' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE unlisted_shares ADD COLUMN logo_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unlisted_shares' AND column_name = 'ipo_status'
  ) THEN
    ALTER TABLE unlisted_shares ADD COLUMN ipo_status text DEFAULT 'unlisted';
  END IF;
END $$;

-- Add check constraint for ipo_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unlisted_shares_ipo_status_check'
  ) THEN
    ALTER TABLE unlisted_shares
    ADD CONSTRAINT unlisted_shares_ipo_status_check
    CHECK (ipo_status IN ('unlisted', 'ipo_filed', 'listed'));
  END IF;
END $$;

-- Add logo_url to secondary_bonds table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'secondary_bonds' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE secondary_bonds ADD COLUMN logo_url text;
  END IF;
END $$;