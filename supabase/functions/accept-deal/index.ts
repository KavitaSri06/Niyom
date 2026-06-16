import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Public function (verify_jwt = false). Verifies the email OTP, stores the
// e-signature + signed PDF, and permanently locks the deal as accepted.

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

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { token, otp, signatureBase64, signedPdfBase64 } = await req.json().catch(() => ({}));
    if (!token || !otp || !signatureBase64 || !signedPdfBase64) {
      return json({ error: "Missing required fields." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: deal } = await db
      .from("nw_deal_confirmations")
      .select("id, confirmation_number, snap_email, snap_client_name, employee_id, acceptance_status, token_expires_at")
      .eq("secure_token", token)
      .maybeSingle();

    if (!deal) return json({ error: "This link is no longer valid." }, 400);
    if (deal.acceptance_status === "accepted") return json({ error: "This deal has already been accepted." }, 400);
    if (deal.acceptance_status === "rejected") return json({ error: "This deal was rejected and can no longer be accepted." }, 400);
    if (deal.token_expires_at && new Date(deal.token_expires_at) < new Date()) {
      return json({ error: "This link has expired." }, 400);
    }

    // --- Verify OTP ---
    const { data: otpRow } = await db
      .from("nw_deal_otps")
      .select("*")
      .eq("deal_id", deal.id)
      .eq("purpose", "accept")
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

    // --- Store artifacts ---
    const basePath = `deals/${deal.confirmation_number}`;
    const sigPath = `${basePath}/signature.png`;
    const pdfPath = `${basePath}/signed.pdf`;

    const sigUp = await db.storage.from("deal-documents")
      .upload(sigPath, base64ToBytes(signatureBase64), { contentType: "image/png", upsert: true });
    const pdfUp = await db.storage.from("deal-documents")
      .upload(pdfPath, base64ToBytes(signedPdfBase64), { contentType: "application/pdf", upsert: true });

    if (sigUp.error || pdfUp.error) {
      console.error("Storage upload error:", sigUp.error || pdfUp.error);
      return json({ error: "Could not store the signed document. Please try again." }, 500);
    }

    // --- Lock the deal (single UPDATE; OLD.acceptance_status is still 'viewed') ---
    const { error: updErr } = await db.from("nw_deal_confirmations").update({
      acceptance_status: "accepted",
      accepted_at: new Date().toISOString(),
      signer_email: deal.snap_email,
      signer_ip: req.headers.get("x-forwarded-for") ?? null,
      signer_user_agent: req.headers.get("user-agent") ?? null,
      signature_image_path: sigPath,
      signed_pdf_path: pdfPath,
    }).eq("id", deal.id);

    if (updErr) {
      console.error("accept update error:", updErr);
      return json({ error: "Could not finalize acceptance. Please try again." }, 500);
    }

    await db.from("nw_deal_otps").delete().eq("deal_id", deal.id).eq("purpose", "accept");
    await db.from("nw_deal_confirmation_events").insert([
      { deal_id: deal.id, event_type: "otp_verified", actor: "client", metadata: { purpose: "accept" } },
      {
        deal_id: deal.id, event_type: "accepted", actor: "client",
        metadata: { signer_email: deal.snap_email },
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        user_agent: req.headers.get("user-agent") ?? undefined,
      },
    ]);

    // --- Best-effort signed-PDF distribution -----------------------------------
    // Runs AFTER the deal is committed + locked. Email delivery must NEVER roll
    // back acceptance, so the entire block is guarded and any failure is recorded
    // as an audit event only. The signed PDF bytes are already in memory.
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const adminEmail = Deno.env.get("NIYOM_ADMIN_EMAIL");

      let employeeEmail: string | null = null;
      if (deal.employee_id) {
        const { data: emp } = await db.from("nw_employees").select("email").eq("id", deal.employee_id).maybeSingle();
        employeeEmail = emp?.email ?? null;
      }

      // Fallback rule: missing admin email is logged but never fatal.
      if (!adminEmail) {
        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: "admin_email_missing", note: "NIYOM_ADMIN_EMAIL not configured" },
        });
      }

      const valid = (e: unknown): e is string => typeof e === "string" && /\S+@\S+\.\S+/.test(e);
      const recipients = [...new Set(
        [deal.snap_email, employeeEmail, adminEmail].filter(valid).map((e) => e.toLowerCase()),
      )];

      if (RESEND_API_KEY && recipients.length > 0) {
        const filename = `Deal_Confirmation_${deal.confirmation_number}.pdf`;
        const subject = "Deal Confirmation – Signed Copy";
        // Normalize: Resend expects pure base64 in attachment content. Strip any
        // data-URI prefix defensively (the client already sends bare base64).
        const pdfBase64 = signedPdfBase64.includes(",") ? signedPdfBase64.split(",")[1] : signedPdfBase64;
        const text = `Dear Recipient,

The deal has been successfully confirmed and digitally signed.

Please find the attached signed confirmation document for your records.

Regards,
Niyom Team`;
        const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;line-height:1.7;">
  <div style="max-width:620px;margin:0 auto;padding:32px 24px;">
    <div style="border-bottom:2px solid #D4AF37;padding-bottom:20px;margin-bottom:24px;">
      <div style="font-size:20px;font-weight:700;color:#111;">Niyom Wealth</div>
      <div style="font-size:13px;color:#8B7355;font-style:italic;">Wealth Reimagined</div>
    </div>
    <p>Dear Recipient,</p>
    <p>The deal has been successfully confirmed and digitally signed.</p>
    <p>Please find the attached signed confirmation document for your records.</p>
    <p style="margin-top:20px;">Regards,<br/>Niyom Team</p>
    <div style="margin-top:24px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:12px;">
      © Niyom Wealth Distribution LLP — Ref: ${deal.confirmation_number}
    </div>
  </div></body></html>`;

        const results: Record<string, string> = {};
        for (const to of recipients) {
          try {
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: "Niyom Wealth <support@niyomwealth.com>",
                to: [to],
                subject,
                text,
                html,
                attachments: [{ filename, content: pdfBase64 }],
              }),
            });
            results[to] = resp.ok ? "sent" : "failed";
            if (!resp.ok) console.error("signed-pdf email failed for", to, await resp.text().catch(() => ""));
          } catch (sendErr) {
            results[to] = "failed";
            console.error("signed-pdf email exception for", to, sendErr);
          }
        }
        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: Object.values(results).includes("sent") ? "sent" : "failed", recipients: results },
        });
      } else if (!RESEND_API_KEY) {
        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: "failed", note: "RESEND_API_KEY not configured" },
        });
      } else {
        // RESEND_API_KEY present but no valid recipient address resolved.
        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: "no_recipients", note: "No valid client/RM/admin email resolved" },
        });
      }
    } catch (mailErr: any) {
      console.error("signed-pdf distribution error:", mailErr?.message);
      try {
        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: "failed", error: String(mailErr?.message ?? mailErr) },
        });
      } catch { /* audit failure must not affect the response */ }
    }

    return json({ success: true });
  } catch (err: any) {
    console.error("accept-deal error:", err?.message);
    return json({ error: "Internal error." }, 500);
  }
});
