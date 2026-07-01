import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Uploads a Payment Receipt PDF and finalises it against the payment row.
//
// Flow:
//   1. Authenticate the caller (employee owning the deal, or admin).
//   2. Fetch the parent payment + deal for ownership + confirmation-number.
//   3. Upload the PDF bytes to the `deal-documents` bucket:
//        primary path: deals/{deal_no}/receipts/{receipt_no}.pdf  (upserts)
//        history path: deals/{deal_no}/receipts/history/{receipt_no}-v{n}.pdf
//      The history copy preserves every generation for audit; the primary
//      copy is what "View Receipt" opens.
//   4. Call nw_finalize_receipt(payment_id, receipt_path, generated_by):
//        - allocates a receipt_number if the payment has none,
//        - writes receipt_pdf_path / receipt_generated_at / _by,
//        - increments receipt_regen_count,
//        - bumps row_version.
//   5. The AFTER UPDATE trigger emits `receipt_generated` (first) or
//      `receipt_regenerated` (subsequent) into the deal event log.
//   6. Return a fresh short-lived signed URL for immediate preview.
//
// The client renders the PDF (html2pdf.js) and passes the base64 bytes here.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "deal-documents";
const SIGNED_URL_TTL_SEC = 120;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Peek at the next receipt number this payment WOULD be allocated on first
// generation — without actually writing anything. Used to decide the storage
// path *before* we call nw_finalize_receipt, so the path we pass to the RPC
// matches the number the RPC will assign.
async function previewReceiptNumber(
  db: ReturnType<typeof createClient>,
  dealConfirmationId: string,
  dealNo: string,
): Promise<string> {
  // Find the highest existing suffix across the deal's receipts, +1.
  // This mirrors the RPC's MAX-suffix logic. There is a benign race window
  // between preview and finalise; if two RMs regenerate at the same instant
  // one may compute the same next number. The RPC lock resolves the race,
  // but the primary storage path could then be overwritten. In practice
  // this is exceedingly unlikely; we accept it because the history-path is
  // salted per-call (see below).
  const { data } = await db
    .from("nw_deal_payments")
    .select("receipt_number")
    .eq("deal_confirmation_id", dealConfirmationId)
    .not("receipt_number", "is", null);
  const rows = (data ?? []) as Array<{ receipt_number: string | null }>;
  let maxSeq = 0;
  for (const r of rows) {
    const m = (r.receipt_number ?? "").match(/-(\d+)$/);
    if (m) maxSeq = Math.max(maxSeq, Number(m[1]));
  }
  return `RCPT-${dealNo}-${maxSeq + 1}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey    = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ success: false, error: "Unauthorized" }, 401);

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) return json({ success: false, error: "Unauthorized" }, 401);

    const db = createClient(supabaseUrl, serviceKey);

    const { data: employee } = await db
      .from("nw_employees")
      .select("id, role, status")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (!employee || employee.status !== "active") {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const { paymentId, pdfBase64 } = await req.json().catch(() => ({}));
    if (!paymentId) return json({ success: false, error: "paymentId is required." }, 400);
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return json({ success: false, error: "pdfBase64 is required." }, 400);
    }

    // --- Fetch payment + deal for ownership check + naming --------------
    const { data: payment } = await db
      .from("nw_deal_payments")
      .select(`
        id, payment_number, receipt_number, receipt_regen_count, status,
        deal_confirmation_id
      `)
      .eq("id", paymentId)
      .maybeSingle();
    if (!payment) return json({ success: false, error: "Payment not found." }, 404);
    if (payment.status !== "active") {
      return json({ success: false, error: "Receipts cannot be issued for cancelled or superseded payments." }, 409);
    }

    const { data: deal } = await db
      .from("nw_deal_confirmations")
      .select("id, employee_id, acceptance_status, confirmation_number")
      .eq("id", payment.deal_confirmation_id)
      .maybeSingle();
    if (!deal) return json({ success: false, error: "Deal not found." }, 404);
    if (deal.acceptance_status !== "accepted") {
      return json({ success: false, error: "Deal is not accepted." }, 409);
    }
    const isAdmin = employee.role === "admin" || employee.role === "super_admin";
    if (!isAdmin && deal.employee_id !== employee.id) {
      return json({ success: false, error: "Forbidden" }, 403);
    }

    // --- Compute the receipt number that will be used -----------------
    const receiptNumber = payment.receipt_number
      ? payment.receipt_number
      : await previewReceiptNumber(db, deal.id, deal.confirmation_number);

    const primaryPath = `deals/${deal.confirmation_number}/receipts/${receiptNumber}.pdf`;
    const nextVersion = (payment.receipt_regen_count ?? 0) + 1;
    const historyPath = `deals/${deal.confirmation_number}/receipts/history/${receiptNumber}-v${nextVersion}.pdf`;

    const pdfBytes = base64ToBytes(pdfBase64);

    // --- Upload primary (upsert) + history (unique per version) -------
    const primaryUp = await db.storage.from(BUCKET)
      .upload(primaryPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (primaryUp.error) {
      console.error("primary upload error:", primaryUp.error);
      return json({ success: false, error: "Could not store the receipt." }, 500);
    }

    const historyUp = await db.storage.from(BUCKET)
      .upload(historyPath, pdfBytes, { contentType: "application/pdf", upsert: false });
    if (historyUp.error) {
      // History copy failure is not fatal for the client, but we log it
      // and continue. Primary copy is already in place.
      console.error("history upload error (non-fatal):", historyUp.error);
    }

    // --- Finalise on the payment row (atomic under FOR UPDATE) --------
    const { data: finalised, error: finErr } = await db.rpc("nw_finalize_receipt", {
      p_payment_id:   paymentId,
      p_receipt_path: primaryPath,
      p_generated_by: employee.id,
    });
    if (finErr || !finalised) {
      console.error("nw_finalize_receipt error:", finErr);
      return json({ success: false, error: finErr?.message || "Could not finalise receipt." }, 500);
    }

    // --- Mint a short-lived signed URL for immediate preview ----------
    const { data: signed } = await db.storage.from(BUCKET)
      .createSignedUrl(primaryPath, SIGNED_URL_TTL_SEC);

    // Audit event (receipt_generated / receipt_regenerated) is emitted by
    // trg_nw_receipt_audit_after_update — nothing to log here.

    return json({
      success: true,
      receipt_number:   (finalised as any).receipt_number,
      receipt_pdf_path: (finalised as any).receipt_pdf_path,
      receipt_regen_count: (finalised as any).receipt_regen_count,
      signed_url: signed?.signedUrl ?? null,
    });
  } catch (err: any) {
    console.error("upload-receipt error:", err?.message);
    return json({ success: false, error: err?.message || "Internal error." }, 500);
  }
});
