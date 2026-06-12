import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Public function (verify_jwt = false). Verifies the email OTP and records a
// client rejection. Rejected deals remain editable/resendable by employees.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hashOTP(otp: string, token: string): Promise<string> {
  const pepper = Deno.env.get("DEAL_OTP_PEPPER") ?? "";
  const data = new TextEncoder().encode(`${otp}:${token}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { token, otp, reason } = await req.json().catch(() => ({}));
    if (!token || !otp) return json({ error: "Missing required fields." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: deal } = await db
      .from("nw_deal_confirmations")
      .select("id, snap_email, acceptance_status, token_expires_at")
      .eq("secure_token", token)
      .maybeSingle();

    if (!deal) return json({ error: "This link is no longer valid." }, 400);
    if (deal.acceptance_status === "accepted") return json({ error: "This deal has already been accepted and cannot be rejected." }, 400);
    if (deal.acceptance_status === "rejected") return json({ error: "This deal was already rejected." }, 400);
    if (deal.token_expires_at && new Date(deal.token_expires_at) < new Date()) {
      return json({ error: "This link has expired." }, 400);
    }

    // --- Verify OTP ---
    const { data: otpRow } = await db
      .from("nw_deal_otps")
      .select("*")
      .eq("deal_id", deal.id)
      .eq("purpose", "reject")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRow) return json({ error: "No verification code found. Please request a new one." }, 400);
    if (new Date(otpRow.expires_at) < new Date()) {
      await db.from("nw_deal_otps").delete().eq("id", otpRow.id);
      return json({ error: "Verification code expired. Please request a new one." }, 400);
    }
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await db.from("nw_deal_otps").delete().eq("id", otpRow.id);
      return json({ error: "Too many attempts. Please request a new code." }, 429);
    }
    const candidate = await hashOTP(String(otp).trim(), token);
    if (candidate !== otpRow.otp_hash) {
      await db.from("nw_deal_otps").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
      return json({ error: "Incorrect verification code." }, 400);
    }

    const { error: updErr } = await db.from("nw_deal_confirmations").update({
      acceptance_status: "rejected",
      rejected_at: new Date().toISOString(),
      rejection_reason: typeof reason === "string" ? reason.slice(0, 1000) : null,
      signer_email: deal.snap_email,
      signer_ip: req.headers.get("x-forwarded-for") ?? null,
      signer_user_agent: req.headers.get("user-agent") ?? null,
    }).eq("id", deal.id);

    if (updErr) {
      console.error("reject update error:", updErr);
      return json({ error: "Could not record rejection. Please try again." }, 500);
    }

    await db.from("nw_deal_otps").delete().eq("deal_id", deal.id).eq("purpose", "reject");
    await db.from("nw_deal_confirmation_events").insert([
      { deal_id: deal.id, event_type: "otp_verified", actor: "client", metadata: { purpose: "reject" } },
      {
        deal_id: deal.id, event_type: "rejected", actor: "client",
        metadata: { reason: typeof reason === "string" ? reason.slice(0, 1000) : null },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        user_agent: req.headers.get("user-agent") ?? undefined,
      },
    ]);

    return json({ success: true });
  } catch (err: any) {
    console.error("reject-deal error:", err?.message);
    return json({ error: "Internal error." }, 500);
  }
});
