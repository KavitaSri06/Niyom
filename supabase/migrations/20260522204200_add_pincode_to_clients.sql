/*
  # Add pincode column to nw_clients

  Adds a pincode field to the client address section.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'nw_clients' AND column_name = 'pincode'
  ) THEN
    ALTER TABLE nw_clients ADD COLUMN pincode text DEFAULT '';
  END IF;
END $$;
