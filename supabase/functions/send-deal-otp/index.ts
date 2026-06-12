import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Public function (verify_jwt = false). Emails a 6-digit OTP to the deal's
// registered client email for the accept/reject flow. EMAIL ONLY — no SMS.

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

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashOTP(otp: string, token: string): Promise<string> {
  const pepper = Deno.env.get("DEAL_OTP_PEPPER") ?? "";
  const data = new TextEncoder().encode(`${otp}:${token}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "";
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");

    const { token, purpose } = await req.json().catch(() => ({}));
    if (!token || (purpose !== "accept" && purpose !== "reject")) {
      return json({ error: "Invalid request." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: deal } = await db
      .from("nw_deal_confirmations")
      .select("id, snap_email, snap_client_name, confirmation_number, acceptance_status, token_expires_at")
      .eq("secure_token", token)
      .maybeSingle();

    if (!deal) return json({ error: "This link is no longer valid." }, 400);
    if (deal.acceptance_status === "accepted") return json({ error: "This deal has already been accepted." }, 400);
    if (deal.token_expires_at && new Date(deal.token_expires_at) < new Date()) {
      return json({ error: "This link has expired." }, 400);
    }
    if (!deal.snap_email) return json({ error: "No email is on record for this deal." }, 400);

    // Rate limit: one OTP per (deal, purpose) per 60s
    const { data: recent } = await db
      .from("nw_deal_otps")
      .select("created_at")
      .eq("deal_id", deal.id)
      .eq("purpose", purpose)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
      return json({ error: "Please wait a minute before requesting another code." }, 429);
    }

    const otp = generateOTP();
    const otpHash = await hashOTP(otp, token);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Replace any prior OTP for this deal/purpose
    await db.from("nw_deal_otps").delete().eq("deal_id", deal.id).eq("purpose", purpose);
    await db.from("nw_deal_otps").insert({
      deal_id: deal.id,
      token,
      email: deal.snap_email,
      otp_hash: otpHash,
      purpose,
      expires_at: expiresAt,
    });
    // Best-effort sweep of expired OTPs
    await db.from("nw_deal_otps").delete().lt("expires_at", new Date().toISOString());

    const action = purpose === "accept" ? "accept" : "reject";
    const subject = `Your verification code – Deal ${deal.confirmation_number}`;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,sans-serif;color:#222;">
  <div style="max-width:520px;margin:0 auto;padding:28px 24px;">
    <div style="font-size:20px;font-weight:700;color:#111;">Niyom Wealth</div>
    <div style="font-size:13px;color:#8B7355;font-style:italic;margin-bottom:20px;">Wealth Reimagined</div>
    <p>Dear ${deal.snap_client_name || "Client"},</p>
    <p>Use the verification code below to <strong>${action}</strong> Deal Confirmation
       <strong>${deal.confirmation_number}</strong>.</p>
    <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#B8961E;
                background:#FFF9EC;border:1px solid #D4AF37;border-radius:8px;
                text-align:center;padding:16px 0;margin:20px 0;">${otp}</div>
    <p style="color:#555;font-size:13px;">This code expires in 10 minutes. If you did not
       request this, please ignore this email.</p>
    <div style="margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px;">
      © Niyom Wealth Distribution LLP — Ref: ${deal.confirmation_number}
    </div>
  </div>
</body></html>`;

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Niyom Wealth <support@niyomwealth.com>",
        to: [deal.snap_email],
        subject,
        html,
        text: `Your verification code to ${action} Deal ${deal.confirmation_number} is ${otp}. It expires in 10 minutes.`,
      }),
    });

    if (!resendResponse.ok) {
      const e = await resendResponse.json().catch(() => ({}));
      console.error("Resend error (send-deal-otp):", e);
      return json({ error: "Could not send the verification email. Please try again." }, 500);
    }

    await db.from("nw_deal_confirmation_events").insert({
      deal_id: deal.id, event_type: "otp_sent", actor: "client",
      metadata: { purpose },
      ip: req.headers.get("x-forwarded-for") ?? undefined,
      user_agent: req.headers.get("user-agent") ?? undefined,
    });

    return json({ success: true, email_masked: maskEmail(deal.snap_email) });
  } catch (err: any) {
    console.error("send-deal-otp error:", err?.message);
    return json({ error: "Internal error." }, 500);
  }
});
