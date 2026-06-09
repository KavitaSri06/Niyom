/*
  # Update Cron Schedule to Run Daily at Midnight

  ## Overview
  Updates the automated price update schedule to run once daily at 12:00 AM (midnight) UTC
  instead of every 6 hours. This ensures data is refreshed once per day at a consistent time.

  ## Changes
  1. Unschedule existing job
  2. Create new schedule for daily midnight execution
  3. Schedule: 0 0 * * * (every day at 00:00 UTC)

  ## Important Notes
  - Time is in UTC timezone
  - Function will update both unlisted shares and secondary bonds prices
  - Price history will be automatically tracked
*/

-- Remove existing cron job
DO $$
BEGIN
  PERFORM cron.unschedule('update-unlisted-shares-prices');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Schedule new job to run daily at midnight (00:00 UTC)
SELECT cron.schedule(
  'update-unlisted-shares-prices',
  '0 0 * * *',
  $$SELECT trigger_price_update()$$
);