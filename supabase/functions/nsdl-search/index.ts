import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Employee-facing security search. Runs with the default verify_jwt = true, so
// only authenticated CRM users reach it. It serves the local nsdl_securities
// cache first and only falls through to NSDL on a cache miss, then caches the
// result. NSDL is NEVER called from the browser (CORS-blocked and would leak the
// integration); this function is the single server-side proxy.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NSDL_BASE = "https://nsdl.com/web/api/v1/participant/search";
const UPSTREAM_TIMEOUT_MS = 8000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

interface Security {
  isin: string;
  name: string;
  security_name: string;
  security_type: string;
  isin_status: string;
  nsdl_id: string;
}

// NSDL returns a status string; surface ACTIVE first in the UI.
function activeFirst(a: Security, b: Security): number {
  const rank = (s: string) => (s?.toUpperCase() === "ACTIVE" ? 0 : 1);
  const d = rank(a.isin_status) - rank(b.isin_status);
  return d !== 0 ? d : a.name.localeCompare(b.name);
}

// Escape LIKE/ILIKE wildcards so user input can't act as a pattern.
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => `\\${m}`);
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

async function fetchNsdl(url: string): Promise<Record<string, unknown>[]> {
  // One attempt + one retry, each with its own timeout.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`NSDL responded ${res.status}`);
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 1) throw err;
    }
  }
  return [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawQuery = String(body?.query ?? "").trim();
    let mode: "name" | "isin" = body?.mode === "isin" ? "isin" : "name";
    const limit = Math.min(Math.max(parseInt(String(body?.limit ?? DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    // Auto-detect an ISIN paste even if the client asked for name mode.
    const looksLikeIsin = /^[A-Z]{2}[A-Z0-9]{9,10}$/i.test(rawQuery);
    if (looksLikeIsin) mode = "isin";

    // --- Validation / sanitization -------------------------------------------
    if (mode === "name" && rawQuery.length < 2) {
      return json({ results: [], source: "cache", count: 0 }, 200);
    }
    const query = mode === "isin" ? rawQuery.toUpperCase() : rawQuery;
    if (mode === "isin" && !/^[A-Z0-9]{2,12}$/.test(query)) {
      return json({ results: [], source: "cache", count: 0 }, 200);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase environment variables");
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- 1) Cache-first ------------------------------------------------------
    const esc = escapeLike(query);
    let cacheQ = supabase.from("nsdl_securities").select("isin,name,security_name,security_type,isin_status,nsdl_id");
    cacheQ = mode === "isin"
      ? cacheQ.ilike("isin", `${esc}%`)
      : cacheQ.or(`name.ilike.%${esc}%,security_name.ilike.%${esc}%`);
    const { data: cached, error: cacheErr } = await cacheQ.limit(limit);
    if (cacheErr) throw cacheErr;

    if (cached && cached.length > 0) {
      const results = (cached as Security[]).sort(activeFirst);
      return json({ results, source: "cache", count: results.length }, 200);
    }

    // --- 2) Cache miss → NSDL live ------------------------------------------
    const url = mode === "isin"
      ? `${NSDL_BASE}?search_type=DetailedSearch&isin=${encodeURIComponent(query)}&page=1&per_page=${limit}`
      : `${NSDL_BASE}?search_type=DetailedSearch&name=${encodeURIComponent(query)}&page=1&per_page=${limit}`;

    let rows: Record<string, unknown>[];
    try {
      rows = await fetchNsdl(url);
    } catch (err) {
      // Upstream down and nothing cached — degrade softly so the form stays usable.
      await logUpdate(supabase, "error", 0, `nsdl fetch failed: ${(err as Error).message}`);
      return json({ results: [], source: "degraded", count: 0 }, 200);
    }

    const mapped = rows.map(mapNsdlRow).filter((r): r is Security => r !== null);

    // Cache the results (idempotent upsert on isin).
    if (mapped.length > 0) {
      const nowIso = new Date().toISOString();
      const { error: upsertErr } = await supabase
        .from("nsdl_securities")
        .upsert(
          mapped.map((m) => ({ ...m, source: "nsdl", last_synced_at: nowIso })),
          { onConflict: "isin" },
        );
      if (upsertErr) console.error("nsdl_securities upsert error:", upsertErr.message);
    }

    await logUpdate(supabase, "success", mapped.length, null);

    const results = mapped.sort(activeFirst);
    return json({ results, source: "nsdl", count: results.length }, 200);
  } catch (error) {
    console.error("nsdl-search error:", error);
    return json({ results: [], source: "degraded", error: (error as Error).message }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logUpdate(
  supabase: ReturnType<typeof createClient>,
  status: string,
  records: number,
  errorMessage: string | null,
): Promise<void> {
  try {
    await supabase.from("data_update_log").insert({
      source_name: "nsdl",
      data_type: "security_search",
      last_update: new Date().toISOString(),
      status,
      records_updated: records,
      error_message: errorMessage,
    });
  } catch (_) {
    // Logging must never break the request path.
  }
}
