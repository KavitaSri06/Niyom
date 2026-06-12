import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Public function (verify_jwt = false). Validates an email OTP WITHOUT
// consuming it, so the public page can verify the code before the client
// signs. The authoritative consume happens later in accept-deal / reject-deal,
// which re-verify and then delete the OTP.

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
    const { token, otp, purpose } = await req.json().catch(() => ({}));
    if (!token || !otp || (purpose !== "accept" && purpose !== "reject")) {
      return json({ verified: false, error: "Invalid request." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: deal } = await db
      .from("nw_deal_confirmations")
      .select("id, acceptance_status, token_expires_at")
      .eq("secure_token", token)
      .maybeSingle();

    if (!deal) return json({ verified: false, error: "This link is no longer valid." }, 400);
    if (deal.acceptance_status === "accepted") return json({ verified: false, error: "This deal has already been accepted." }, 400);
    if (deal.token_expires_at && new Date(deal.token_expires_at) < new Date()) {
      return json({ verified: false, error: "This link has expired." }, 400);
    }

    const { data: otpRow } = await db
      .from("nw_deal_otps")
      .select("*")
      .eq("deal_id", deal.id)
      .eq("purpose", purpose)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRow) return json({ verified: false, error: "No verification code found. Please request a new one." }, 400);
    if (new Date(otpRow.expires_at) < new Date()) {
      await db.from("nw_deal_otps").delete().eq("id", otpRow.id);
      return json({ verified: false, error: "Verification code expired. Please request a new one." }, 400);
    }
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await db.from("nw_deal_otps").delete().eq("id", otpRow.id);
      return json({ verified: false, error: "Too many attempts. Please request a new code." }, 429);
    }

    const candidate = await hashOTP(String(otp).trim(), token);
    if (candidate !== otpRow.otp_hash) {
      await db.from("nw_deal_otps").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
      return json({ verified: false, error: "Incorrect verification code." }, 400);
    }

    // Valid — do NOT delete; accept-deal / reject-deal consume it on the final step.
    return json({ verified: true });
  } catch (err: any) {
    console.error("verify-deal-otp error:", err?.message);
    return json({ verified: false, error: "Internal error." }, 500);
  }
});
