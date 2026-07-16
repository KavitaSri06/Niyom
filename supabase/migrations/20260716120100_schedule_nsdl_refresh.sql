/*
  # Schedule the daily NSDL security-cache refresh

  Reuses the existing pg_cron + pg_net pattern (see 20260211200549_setup_cron_jobs.sql):
  a SECURITY DEFINER trigger function reads the app settings and POSTs to the
  nsdl-refresh-cache edge function, which re-queries NSDL for the ISINs already in
  nsdl_securities and refreshes their status/description/last_synced_at.

  Schedule: 01:00 UTC daily (~06:30 IST — before the trading day / office hours),
  keeping it off the 00:00 UTC slot already used by update-unlisted-shares.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION trigger_nsdl_refresh()
RETURNS void AS $$
DECLARE
  function_url text;
BEGIN
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/nsdl-refresh-cache';

  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace any prior schedule of the same name.
DO $$
BEGIN
  PERFORM cron.unschedule('nsdl-refresh-cache');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Daily at 01:00 UTC.
SELECT cron.schedule(
  'nsdl-refresh-cache',
  '0 1 * * *',
  $$SELECT trigger_nsdl_refresh()$$
);
