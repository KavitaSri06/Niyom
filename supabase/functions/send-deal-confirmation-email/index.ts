import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured.");
    }

    const {
      dealId,
      confirmationNumber,
      clientName,
      clientEmail,
      employeeName,
      employeeDesignation,
      employeeEmail,
      employeePhone,
      pdfBase64,
    } = await req.json();

    // Validate required fields
    if (!confirmationNumber || !clientName || !clientEmail || !pdfBase64) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = `Deal Confirmation & Acceptance Request – Ref: ${confirmationNumber}`;

    const emailBody = `Dear ${clientName},

Greetings from Niyom Wealth.

Please find attached the Deal Confirmation Note for the proposed transaction.

We request you to kindly review the attached document and confirm your acceptance by replying to this email with:

"Accepted"

or

"I confirm the above transaction details and agree to proceed with the purchase."

Upon receipt of your acceptance, you may proceed with remitting the settlement amount to the bank account mentioned in the attached Deal Confirmation Note.

Kindly note that payment should be initiated only after reviewing and accepting the transaction details contained in the attached confirmation.

Once the payment has been completed, we request you to share the payment confirmation/UTR details for our records and further processing.

Should you require any clarification regarding the transaction, please feel free to contact us.

Thank you for your trust and association with Niyom Wealth.

Warm Regards,

${employeeName} - ${employeeDesignation}
Niyom Wealth Distribution LLP
Mobile: ${employeePhone}
Email: ${employeeEmail}
Website: www.niyomwealth.com

---
This email and the attached Deal Confirmation Note are intended solely for the recipient. The transaction shall be deemed confirmed only upon receipt of the client's acceptance and completion of settlement obligations as per the terms specified in the Deal Confirmation Note.`;

    const htmlBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    body { font-family: Arial, sans-serif; font-size: 14px; color: #222; line-height: 1.7; margin: 0; padding: 0; background: #fff; }
    .container { max-width: 620px; margin: 0 auto; padding: 32px 24px; }
    .header { border-bottom: 2px solid #D4AF37; padding-bottom: 20px; margin-bottom: 24px; }
    .logo-row { display: flex; align-items: center; gap: 12px; }
    .company { font-size: 20px; font-weight: 700; color: #111; }
    .tagline { font-size: 13px; color: #8B7355; font-style: italic; margin-top: 2px; }
    .greeting { font-size: 15px; font-weight: 600; margin-bottom: 16px; color: #111; }
    p { margin: 0 0 14px 0; color: #333; }
    .acceptance-box { background: #FFF9EC; border: 1px solid #D4AF37; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
    .acceptance-box p { margin: 6px 0; color: #7A5C00; font-style: italic; }
    .signature { margin-top: 28px; padding-top: 20px; border-top: 1px solid #eee; }
    .sig-name { font-weight: 700; font-size: 15px; color: #111; }
    .sig-detail { color: #555; font-size: 13px; line-height: 1.8; }
    .disclaimer { margin-top: 28px; padding: 14px 18px; background: #F7F7F7; border-radius: 6px; font-size: 11px; color: #888; line-height: 1.6; }
    .footer { margin-top: 28px; text-align: center; font-size: 11px; color: #BBB; border-top: 1px solid #eee; padding-top: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company">Niyom Wealth</div>
      <div class="tagline">Wealth Reimagined</div>
    </div>

    <p class="greeting">Dear ${clientName},</p>

    <p>Greetings from Niyom Wealth.</p>

    <p>Please find attached the Deal Confirmation Note for the proposed transaction.</p>

    <p>We request you to kindly review the attached document and confirm your acceptance by replying to this email with:</p>

    <div class="acceptance-box">
      <p>"Accepted"</p>
      <p style="margin: 10px 0; color: #999; font-style: normal;">or</p>
      <p>"I confirm the above transaction details and agree to proceed with the purchase."</p>
    </div>

    <p>Upon receipt of your acceptance, you may proceed with remitting the settlement amount to the bank account mentioned in the attached Deal Confirmation Note.</p>

    <p>Kindly note that payment should be initiated only after reviewing and accepting the transaction details contained in the attached confirmation.</p>

    <p>Once the payment has been completed, we request you to share the payment confirmation/UTR details for our records and further processing.</p>

    <p>Should you require any clarification regarding the transaction, please feel free to contact us.</p>

    <p>Thank you for your trust and association with Niyom Wealth.</p>

    <div class="signature">
      <div class="sig-name">${employeeName} — ${employeeDesignation}</div>
      <div class="sig-detail">
        Niyom Wealth Distribution LLP<br/>
        Mobile: ${employeePhone}<br/>
        Email: <a href="mailto:${employeeEmail}" style="color: #D4AF37;">${employeeEmail}</a><br/>
        Website: <a href="https://www.niyomwealth.com" style="color: #D4AF37;">www.niyomwealth.com</a>
      </div>
    </div>

    <div class="disclaimer">
      This email and the attached Deal Confirmation Note are intended solely for the recipient. The transaction shall be deemed confirmed only upon receipt of the client's acceptance and completion of settlement obligations as per the terms specified in the Deal Confirmation Note.
    </div>

    <div class="footer">© Niyom Wealth Distribution LLP — Ref: ${confirmationNumber}</div>
  </div>
</body>
</html>`;

    const filename = `Deal-Confirmation-${confirmationNumber}.pdf`;

    const resendPayload = {
      from: "Niyom Wealth <support@niyomwealth.com>",
      to: [clientEmail],
      cc: ["purushothaman@niyomwealth.com"],
      subject,
      text: emailBody,
      html: htmlBody,
      attachments: [
        {
          filename,
          content: pdfBase64,
        },
      ],
    };

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendData);
      return new Response(
        JSON.stringify({
          success: false,
          error: resendData?.message || "Failed to send email via Resend.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Deal confirmation email sent for ${confirmationNumber} to ${clientEmail}. Resend ID: ${resendData.id}`);

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Internal server error." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
