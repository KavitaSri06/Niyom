import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Public function (verify_jwt = false). Records the client's mandatory
// Terms & Conditions acceptance (the step that now precedes OTP verification
// on the public deal page). Idempotent: writes tc_accepted_at + a 'tc_accepted'
// audit event only once. Does not change acceptance_status — the existing
// viewed → accepted/rejected lifecycle and the accepted-deal lock are untouched.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string") {
      return json({ success: false, error: "This link is no longer valid." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: deal } = await db
      .from("nw_deal_confirmations")
      .select("id, acceptance_status, token_expires_at, tc_accepted_at")
      .eq("secure_token", token)
      .maybeSingle();

    if (!deal) return json({ success: false, error: "This link is no longer valid." }, 400);
    if (deal.acceptance_status === "accepted") return json({ success: false, error: "This deal has already been accepted." }, 400);
    if (deal.acceptance_status === "rejected") return json({ success: false, error: "This deal was already responded to." }, 400);
    if (deal.token_expires_at && new Date(deal.token_expires_at) < new Date()) {
      return json({ success: false, error: "This link has expired." }, 400);
    }

    // Record once (idempotent). OLD.acceptance_status is 'viewed' here, so the
    // accepted-deal lock trigger does not fire.
    if (!deal.tc_accepted_at) {
      await db.from("nw_deal_confirmations")
        .update({ tc_accepted_at: new Date().toISOString() })
        .eq("id", deal.id);
      await db.from("nw_deal_confirmation_events").insert({
        deal_id: deal.id,
        event_type: "tc_accepted",
        actor: "client",
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        user_agent: req.headers.get("user-agent") ?? undefined,
      });
    }

    return json({ success: true });
  } catch (err: any) {
    console.error("record-tc-acceptance error:", err?.message);
    return json({ success: false, error: "Internal error." }, 500);
  }
});
