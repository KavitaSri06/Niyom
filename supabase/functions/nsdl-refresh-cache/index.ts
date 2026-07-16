import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Daily maintenance job (called by pg_cron via pg_net — see the schedule
// migration). Re-queries NSDL for the ISINs ALREADY in our cache to refresh
// their status / description / last_synced_at. It does NOT try to mirror the
// full NSDL master (the API is search-only, so a full dump isn't possible).
//
// verify_jwt = false (set in config.toml): pg_net calls it with the service-role
// bearer, same as the existing update-unlisted-shares job.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NSDL_BASE = "https://nsdl.com/web/api/v1/participant/search";
const UPSTREAM_TIMEOUT_MS = 8000;
const BATCH_DELAY_MS = 250;   // polite pacing between upstream calls
const MAX_PER_RUN = 500;      // cap work per daily run

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Security {
  isin: string;
  name: string;
  security_name: string;
  security_type: string;
  isin_status: string;
  nsdl_id: string;
}

function mapNsdlRow(r: Record<string, unknown>): Security | null {
  const isin = String(r?.field_isin ?? "").trim().toUpperCase();
  if (!isin) return null;
  return {
    isin,
    name: String(r?.name ?? "").trim(),
    security_name: String(r?.isin_description__value ?? "").trim(),
    security_type: String(r?.security_description ?? "").trim(),
    isin_status: String(r?.isin_status ?? "").trim(),
    nsdl_id: String(r?.id ?? "").trim(),
  };
}

async function fetchIsin(isin: string): Promise<Security | null> {
  const url = `${NSDL_BASE}?search_type=DetailedSearch&isin=${encodeURIComponent(isin)}&page=1&per_page=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`NSDL responded ${res.status}`);
    const json = await res.json();
    const row = Array.isArray(json?.data) ? json.data[0] : null;
    return row ? mapNsdlRow(row) : null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseKey) {
    return json({ success: false, error: "Missing Supabase environment variables" }, 500);
  }
  const supabase = createClient(supabaseUrl, supabaseKey);

  let refreshed = 0;
  let failed = 0;

  try {
    // Oldest-synced first so a capped run still makes progress across days.
    const { data: rows, error } = await supabase
      .from("nsdl_securities")
      .select("isin")
      .order("last_synced_at", { ascending: true })
      .limit(MAX_PER_RUN);
    if (error) throw error;

    const isins = (rows ?? []).map((r: { isin: string }) => r.isin);

    for (const isin of isins) {
      try {
        const sec = await fetchIsin(isin);
        if (sec) {
          const { error: upErr } = await supabase
            .from("nsdl_securities")
            .upsert({ ...sec, source: "nsdl", last_synced_at: new Date().toISOString() }, { onConflict: "isin" });
          if (upErr) throw upErr;
          refreshed++;
        } else {
          // ISIN no longer returned by NSDL — bump timestamp so it rotates out
          // of the "oldest" window rather than being retried every run.
          await supabase.from("nsdl_securities")
            .update({ last_synced_at: new Date().toISOString() })
            .eq("isin", isin);
        }
      } catch (_) {
        failed++;
      }
      await sleep(BATCH_DELAY_MS);
    }

    const status = failed === 0 ? "success" : refreshed > 0 ? "partial" : "error";
    await supabase.from("data_update_log").insert({
      source_name: "nsdl",
      data_type: "security_refresh",
      last_update: new Date().toISOString(),
      status,
      records_updated: refreshed,
      error_message: failed > 0 ? `${failed} ISIN refresh(es) failed` : null,
    });

    return json({ success: true, refreshed, failed, total: isins.length }, 200);
  } catch (error) {
    await supabase.from("data_update_log").insert({
      source_name: "nsdl",
      data_type: "security_refresh",
      last_update: new Date().toISOString(),
      status: "error",
      records_updated: refreshed,
      error_message: (error as Error).message,
    });
    return json({ success: false, error: (error as Error).message, refreshed, failed }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
