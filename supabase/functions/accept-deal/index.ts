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
      .select("id, confirmation_number, client_id, snap_email, snap_client_name, employee_id, acceptance_status, token_expires_at")
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
      let employeeName: string | null = null;
      let employeeDesignation: string | null = null;
      let employeePhone: string | null = null;
      if (deal.employee_id) {
        const { data: emp } = await db.from("nw_employees")
          .select("email, full_name, designation, phone")
          .eq("id", deal.employee_id).maybeSingle();
        employeeEmail = emp?.email ?? null;
        employeeName = emp?.full_name ?? null;
        employeeDesignation = emp?.designation ?? null;
        employeePhone = emp?.phone ?? null;
      }

      // Resolve the DSA email via the EXISTING client→DSA relationship
      // (nw_clients.dsa_id). Only clients that belong to a DSA are CC'd; this
      // reuses the same linkage MIS and DSA Payout already rely on — no new logic.
      let dsaEmail: string | null = null;
      if (deal.client_id) {
        const { data: client } = await db.from("nw_clients")
          .select("dsa_id").eq("id", deal.client_id).maybeSingle();
        if (client?.dsa_id) {
          const { data: dsa } = await db.from("nw_dsa")
            .select("email").eq("id", client.dsa_id).maybeSingle();
          dsaEmail = dsa?.email ?? null;
        }
      }

      // Client-facing job title — display-only `designation`, never the internal `role`.
      const formatDesignation = (designation: string | null): string =>
        (designation && designation.trim()) || "Relationship Manager";

      const valid = (e: unknown): e is string => typeof e === "string" && /^\S+@\S+\.\S+$/.test(e.trim());

      // One email, shared communication trail:
      //   To  -> client (primary)
      //   CC  -> creating/owning employee + admin/designated recipient + DSA (if any)
      // CC is de-duplicated against the To address and within itself.
      const clientTo = valid(deal.snap_email) ? deal.snap_email.trim() : null;
      const seen = new Set<string>();
      if (clientTo) seen.add(clientTo.toLowerCase());
      const cc: string[] = [];
      for (const e of [employeeEmail, adminEmail, dsaEmail]) {
        if (!valid(e)) continue;
        const norm = e.trim().toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        cc.push(norm);
      }
      // Client address must be present; if it is somehow invalid we still get the
      // signed copy to the team by promoting the first CC to the primary To.
      const primaryTo = clientTo ?? (cc.length ? cc.shift()! : null);

      const logEmail = async (status: "sent" | "failed", extra: Record<string, unknown> = {}, msgId: string | null = null) => {
        await db.from("nw_deal_email_log").insert({
          deal_confirmation_id: deal.id, email_type: "signed_pdf",
          sent_to: primaryTo ?? "", cc_recipients: cc, sent_by: null,
          is_resend: false, status, provider_message_id: msgId, metadata: extra,
        });
      };

      if (!RESEND_API_KEY) {
        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: "failed", note: "RESEND_API_KEY not configured" },
        });
        await logEmail("failed", { note: "RESEND_API_KEY not configured" });
      } else if (!primaryTo) {
        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: "no_recipients", note: "No valid client/RM/admin email resolved" },
        });
        await logEmail("failed", { note: "no_recipients" });
      } else {
        const subject = `Deal Confirmation completed – Ref ${deal.confirmation_number}`;
        const year = new Date().getFullYear();
        const designation = formatDesignation(employeeDesignation);
        // Secure download link to the already-stored signed PDF (private
        // deal-documents bucket) in place of an attachment. Long-lived signed URL;
        // if it later expires, the RM can always re-share from the CRM.
        const DOWNLOAD_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
        const { data: signedLink } = await db.storage.from("deal-documents")
          .createSignedUrl(pdfPath, DOWNLOAD_TTL_SECONDS);
        const downloadUrl = signedLink?.signedUrl ?? null;

        const rmBlockText = employeeName
          ? `\n\nWarm regards,\n\n${employeeName}\n${designation} | Niyom Wealth Distribution LLP\nM: ${employeePhone ?? "-"}   E: ${employeeEmail ?? "-"}`
          : `\n\nWarm regards,\nNiyom Wealth Distribution LLP`;

        const rmBlockHtml = employeeName
          ? `<p style="margin:18px 0 6px;">Warm regards,</p>
             <div>
               <div style="font-weight:700;color:#111;">${employeeName}</div>
               <div style="color:#555;font-size:13px;line-height:1.7;">
                 ${designation} &nbsp;|&nbsp; Niyom Wealth Distribution LLP<br/>
                 M: ${employeePhone ?? "-"} &nbsp; E: <a href="mailto:${employeeEmail ?? ""}" style="color:#B8961E;">${employeeEmail ?? "-"}</a>
               </div>
             </div>`
          : `<p style="margin:18px 0 0;">Warm regards,<br/><strong>Niyom Wealth Distribution LLP</strong></p>`;

        const text = `Dear ${deal.snap_client_name || "Client"},

The confirmation process for Deal Confirmation Note Ref ${deal.confirmation_number} has been successfully completed.

${downloadUrl
  ? `You can download your signed copy using the secure link below. For your security this link remains active for 30 days:\n\n${downloadUrl}\n\nWe have retained an identical copy on our side, which your Relationship Manager can share again at any time, should you need it.`
  : `We have retained a signed copy on our side. Your Relationship Manager can share it with you at any time, should you need it.`}

For any clarification on this transaction, please feel free to reach out to your Relationship Manager.${rmBlockText}

---
Niyom Wealth Distribution LLP | AMFI Registered Mutual Fund Distributor
ARN-362707 (Valid till 11-JUN-2029)
No 126, 1st Floor, Poonamalle High Road, Maduravoyal, Chennai – 600 095

Mutual fund investments are subject to market risks. Please read all scheme-related documents carefully before investing.

This message is intended for the named recipient only.
© ${year} Niyom Wealth Distribution LLP.   Ref: ${deal.confirmation_number}`;

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.7;margin:0;padding:0;background:#f6f6f6;">
  <div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f6f6f6;">
    The confirmation process has been successfully completed. Your signed copy is ready to download.
  </div>
  <div style="max-width:620px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    <div style="border-bottom:2px solid #D4AF37;padding-bottom:16px;margin-bottom:24px;">
      <div style="font-size:20px;font-weight:700;color:#111;">Niyom Wealth</div>
    </div>
    <p style="font-size:15px;font-weight:600;color:#111;margin:0 0 16px;">Dear ${deal.snap_client_name || "Client"},</p>
    <p style="margin:0 0 14px;">The confirmation process for Deal Confirmation Note <strong>Ref ${deal.confirmation_number}</strong> has been successfully completed.</p>
    ${downloadUrl
      ? `<p style="margin:0 0 14px;">Your signed copy is ready. Please use the secure link below to download it for your records.</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${downloadUrl}" style="background:linear-gradient(135deg,#D4AF37,#B8961E);color:#000;
         text-decoration:none;font-weight:700;padding:14px 28px;border-radius:8px;display:inline-block;">
         Download Signed Copy
      </a>
    </div>
    <p style="font-size:13px;color:#777;margin:0 0 14px;">For your security this link remains active for 30 days. If the button does not open, copy this link into your browser:<br/>
       <a href="${downloadUrl}" style="color:#B8961E;word-break:break-all;">${downloadUrl}</a></p>
    <p style="margin:0 0 14px;">We have retained an identical copy on our side, which your Relationship Manager can share again at any time, should you need it.</p>`
      : `<p style="margin:0 0 14px;">We have retained a signed copy on our side, which your Relationship Manager can share with you at any time, should you need it.</p>`}
    <p style="margin:0 0 14px;">For any clarification on this transaction, please feel free to reach out to your Relationship Manager.</p>
    ${rmBlockHtml}
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#666;line-height:1.7;">
      <p style="margin:0 0 6px;"><strong>Niyom Wealth Distribution LLP</strong> &nbsp;|&nbsp; AMFI Registered Mutual Fund Distributor</p>
      <p style="margin:0 0 6px;">ARN-362707 (Valid till 11-JUN-2029)</p>
      <p style="margin:0 0 12px;">No 126, 1st Floor, Poonamalle High Road, Maduravoyal, Chennai – 600 095</p>
      <p style="margin:0 0 12px;font-size:11px;color:#888;">Mutual fund investments are subject to market risks. Please read all scheme-related documents carefully before investing.</p>
      <p style="margin:0;font-size:11px;color:#888;">This message is intended for the named recipient only.<br/>
         © ${year} Niyom Wealth Distribution LLP. &nbsp; Ref: ${deal.confirmation_number}</p>
    </div>
  </div></body></html>`;

        let ok = false;
        let msgId: string | null = null;
        try {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Niyom Wealth <support@niyomwealth.com>",
              to: [primaryTo],
              ...(cc.length ? { cc } : {}),
              subject,
              text,
              html,
            }),
          });
          ok = resp.ok;
          const respData = await resp.json().catch(() => ({} as Record<string, unknown>));
          msgId = (respData as { id?: string }).id ?? null;
          if (!ok) console.error("signed-pdf email failed:", respData);
        } catch (sendErr) {
          console.error("signed-pdf email exception:", sendErr);
        }

        await db.from("nw_deal_confirmation_events").insert({
          deal_id: deal.id, event_type: "signed_pdf_emailed", actor: "system",
          metadata: { status: ok ? "sent" : "failed", to: primaryTo, cc, emailId: msgId, delivery: "link", hasDownloadLink: !!downloadUrl },
        });
        await logEmail(ok ? "sent" : "failed", { to: primaryTo, cc, delivery: "link", hasDownloadLink: !!downloadUrl }, msgId);
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
