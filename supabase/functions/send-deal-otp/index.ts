import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { emailFooterHtml, emailFooterText, NOTICE_AUTOMATED } from "../_shared/email_footer.ts";

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

    const action = purpose === "accept" ? "confirm" : "decline";
    const year = new Date().getFullYear();
    const subject = `OTP for Deal Confirmation – Ref ${deal.confirmation_number}`;

    const text = `Dear ${deal.snap_client_name || "Client"},

Please use the code below to ${action} Deal Confirmation Note Ref ${deal.confirmation_number}:

${otp}

This code is valid for 10 minutes.

For your security, Niyom Wealth will never ask you to share this code. If you did not request it, please reach out to your Relationship Manager.

Niyom Wealth Distribution LLP

${emailFooterText({ year, ref: deal.confirmation_number, notice: NOTICE_AUTOMATED })}`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.7;margin:0;padding:0;background:#f6f6f6;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f6;">
    Use this code to confirm or decline your Deal Confirmation Note.
  </div>
  <div style="max-width:520px;margin:0 auto;padding:28px 24px;background:#ffffff;">
    <div style="font-size:20px;font-weight:700;color:#111;margin-bottom:20px;border-bottom:2px solid #D4AF37;padding-bottom:14px;">Niyom Wealth</div>
    <p style="margin:0 0 14px;">Dear ${deal.snap_client_name || "Client"},</p>
    <p style="margin:0 0 14px;">Please use the code below to <strong>${action}</strong> Deal Confirmation Note Ref <strong>${deal.confirmation_number}</strong>:</p>
    <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#B8961E;
                background:#FFF9EC;border:1px solid #D4AF37;border-radius:8px;
                text-align:center;padding:16px 0;margin:18px 0;">${otp}</div>
    <p style="margin:0 0 14px;color:#555;font-size:13px;">This code is valid for 10 minutes.</p>
    <p style="margin:0 0 14px;color:#555;font-size:13px;">For your security, Niyom Wealth will never ask you to share this code. If you did not request it, please reach out to your Relationship Manager.</p>
    <p style="margin:18px 0 0;color:#111;font-weight:600;">Niyom Wealth Distribution LLP</p>
    ${emailFooterHtml({ year, ref: deal.confirmation_number, notice: NOTICE_AUTOMATED })}
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
        text,
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
