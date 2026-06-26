import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, maskEmail } from "../_shared/signing.ts";

// Public function (verify_jwt = false). Resolves a secure debit-note link,
// lazily marks the note as viewed/expired, and returns the data needed for the
// DSA to review and re-render the document for signing.

// Fields safe to expose on the public page. This is the DSA's own payout data
// (no other DSA's notes, no internal employee ids beyond the snapshot).
function sanitize(note: Record<string, any>) {
  const dsa = note.dsa || {};
  return {
    debit_note_number: note.debit_note_number,
    month: note.month,
    year: note.year,
    payout_amount: note.payout_amount,
    tds_amount: note.tds_amount,
    net_payable_amount: note.net_payable_amount,
    signature_status: note.signature_status,
    generated_at: note.generated_at,
    // Full render snapshot so the page rebuilds the identical document.
    pdf_snapshot: note.pdf_snapshot ?? null,
    dsa: {
      full_name: dsa.full_name,
      dsa_code: dsa.dsa_code,
      email_masked: maskEmail(dsa.email || ""),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || typeof token !== "string") return json({ valid: false, reason: "invalid" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: note } = await db
      .from("dsa_debit_notes")
      .select("*, dsa:nw_dsa(full_name, dsa_code, email)")
      .eq("secure_token", token)
      .maybeSingle();

    if (!note) return json({ valid: false, reason: "invalid" });

    // Terminal states short-circuit
    if (note.signature_status === "signed") return json({ valid: false, reason: "signed" });
    if (note.status === "cancelled") return json({ valid: false, reason: "cancelled" });

    // Expiry check (lazy transition: just report expired; the token stays put)
    if (note.token_expires_at && new Date(note.token_expires_at) < new Date()) {
      await db.from("dsa_debit_note_events").insert({
        debit_note_id: note.id, event_type: "expired", actor: "system",
      });
      return json({ valid: false, reason: "expired" });
    }

    // First open → mark viewed
    if (note.signature_status === "sent") {
      await db.from("dsa_debit_notes")
        .update({ signature_status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", note.id);
      await db.from("dsa_debit_note_events").insert({
        debit_note_id: note.id,
        event_type: "viewed",
        actor: "dsa",
        ip: req.headers.get("x-forwarded-for") ?? undefined,
        user_agent: req.headers.get("user-agent") ?? undefined,
      });
      note.signature_status = "viewed";
    }

    return json({ valid: true, note: sanitize(note) });
  } catch (err: any) {
    console.error("get-debit-note-by-token error:", err?.message);
    return json({ valid: false, reason: "error" }, 500);
  }
});
