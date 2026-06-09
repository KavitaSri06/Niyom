/*
  # Setup Automatic Price Update Schedule

  1. Enable pg_cron Extension
    - Enable the pg_cron extension for scheduled jobs

  2. Create Cron Job
    - Schedule edge function to run every 6 hours starting at midnight
    - Times: 00:00, 06:00, 12:00, 18:00 UTC

  3. HTTP Request Function
    - Create function to make HTTP requests to edge function
    - Uses pg_net extension to call the update-unlisted-shares function
*/

-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to call the edge function
CREATE OR REPLACE FUNCTION trigger_price_update()
RETURNS void AS $$
DECLARE
  function_url text;
BEGIN
  -- Get the Supabase URL from current settings
  function_url := current_setting('app.settings.supabase_url', true) || '/functions/v1/update-unlisted-shares';
  
  -- Make HTTP POST request to edge function
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

-- Schedule the job to run every 6 hours at 00:00, 06:00, 12:00, 18:00 UTC
DO $$
BEGIN
  -- Remove existing job if it exists
  PERFORM cron.unschedule('update-unlisted-shares-prices');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Schedule new job (every 6 hours: 0, 6, 12, 18)
SELECT cron.schedule(
  'update-unlisted-shares-prices',
  '0 0,6,12,18 * * *',
  $$SELECT trigger_price_update()$$
);