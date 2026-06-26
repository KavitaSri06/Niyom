import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, generateOTP, hashOTP, maskEmail, sendEmail } from "../_shared/signing.ts";

// Public function (verify_jwt = false). Emails a 6-digit OTP to the debit
// note's DSA email for the signing flow. EMAIL ONLY — no SMS.

function pepper(): string { return Deno.env.get("DEBIT_NOTE_OTP_PEPPER") ?? Deno.env.get("DEAL_OTP_PEPPER") ?? ""; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured.");

    const { token } = await req.json().catch(() => ({}));
    if (!token) return json({ error: "Invalid request." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: note } = await db
      .from("dsa_debit_notes")
      .select("id, debit_note_number, signature_status, status, token_expires_at, dsa:nw_dsa(full_name, email)")
      .eq("secure_token", token)
      .maybeSingle();

    if (!note) return json({ error: "This link is no longer valid." }, 400);
    if (note.signature_status === "signed") return json({ error: "This debit note has already been signed." }, 400);
    if (note.status === "cancelled") return json({ error: "This debit note has been cancelled." }, 400);
    if (note.token_expires_at && new Date(note.token_expires_at) < new Date()) {
      return json({ error: "This link has expired." }, 400);
    }

    const dsa = (note as any).dsa as { full_name: string; email: string } | null;
    if (!dsa || !dsa.email) return json({ error: "No email is on record for this debit note." }, 400);

    // Rate limit: one OTP per note per 60s
    const { data: recent } = await db
      .from("dsa_debit_note_otps")
      .select("created_at")
      .eq("debit_note_id", note.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < 60_000) {
      return json({ error: "Please wait a minute before requesting another code." }, 429);
    }

    const otp = generateOTP();
    const otpHash = await hashOTP(otp, token, pepper());
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.from("dsa_debit_note_otps").delete().eq("debit_note_id", note.id);
    await db.from("dsa_debit_note_otps").insert({
      debit_note_id: note.id, token, email: dsa.email, otp_hash: otpHash, purpose: "sign", expires_at: expiresAt,
    });
    // Best-effort sweep of expired OTPs
    await db.from("dsa_debit_note_otps").delete().lt("expires_at", new Date().toISOString());

    const year = new Date().getFullYear();
    const subject = `OTP to sign Debit Note – ${note.debit_note_number}`;

    const text = `Dear ${dsa.full_name || "Partner"},

Please use the code below to sign Debit Note ${note.debit_note_number}:

${otp}

This code is valid for 10 minutes.

For your security, Niyom Wealth will never ask you to share this code. If you did not request it, please reach out to your Relationship Manager.

Niyom Wealth Distribution LLP

---
Niyom Wealth Distribution LLP | AMFI Registered Mutual Fund Distributor
ARN-362707 (Valid till 11-JUN-2029)

This is a system-generated message. Please do not reply.
© ${year} Niyom Wealth Distribution LLP.   Ref: ${note.debit_note_number}`;

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.7;margin:0;padding:0;background:#f6f6f6;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f6;">
    Use this code to sign your Debit Note.
  </div>
  <div style="max-width:520px;margin:0 auto;padding:28px 24px;background:#ffffff;">
    <div style="font-size:20px;font-weight:700;color:#111;margin-bottom:20px;border-bottom:2px solid #D4AF37;padding-bottom:14px;">Niyom Wealth</div>
    <p style="margin:0 0 14px;">Dear ${dsa.full_name || "Partner"},</p>
    <p style="margin:0 0 14px;">Please use the code below to sign Debit Note <strong>${note.debit_note_number}</strong>:</p>
    <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#B8961E;
                background:#FFF9EC;border:1px solid #D4AF37;border-radius:8px;
                text-align:center;padding:16px 0;margin:18px 0;">${otp}</div>
    <p style="margin:0 0 14px;color:#555;font-size:13px;">This code is valid for 10 minutes.</p>
    <p style="margin:0 0 14px;color:#555;font-size:13px;">For your security, Niyom Wealth will never ask you to share this code. If you did not request it, please reach out to your Relationship Manager.</p>
    <p style="margin:18px 0 0;color:#111;font-weight:600;">Niyom Wealth Distribution LLP</p>
    <div style="margin-top:24px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#888;line-height:1.7;">
      <p style="margin:0 0 4px;"><strong>Niyom Wealth Distribution LLP</strong> &nbsp;|&nbsp; AMFI Registered Mutual Fund Distributor</p>
      <p style="margin:0 0 10px;">ARN-362707 (Valid till 11-JUN-2029)</p>
      <p style="margin:0;">This is a system-generated message. Please do not reply.<br/>
         © ${year} Niyom Wealth Distribution LLP. &nbsp; Ref: ${note.debit_note_number}</p>
    </div>
  </div>
</body></html>`;

    const result = await sendEmail({ apiKey: RESEND_API_KEY, to: dsa.email, subject, html, text });
    if (!result.ok) {
      console.error("Resend error (send-debit-note-otp):", result.error);
      return json({ error: "Could not send the verification email. Please try again." }, 500);
    }

    await db.from("dsa_debit_note_events").insert({
      debit_note_id: note.id, event_type: "otp_sent", actor: "dsa",
      ip: req.headers.get("x-forwarded-for") ?? undefined,
      user_agent: req.headers.get("user-agent") ?? undefined,
    });

    return json({ success: true, email_masked: maskEmail(dsa.email) });
  } catch (err: any) {
    console.error("send-debit-note-otp error:", err?.message);
    return json({ error: "Internal error." }, 500);
  }
});
