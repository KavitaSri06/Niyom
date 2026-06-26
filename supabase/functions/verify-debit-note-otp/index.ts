import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, hashOTP } from "../_shared/signing.ts";

// Public function (verify_jwt = false). Validates the email OTP WITHOUT
// consuming it, so the page can verify the code before the DSA signs. The
// authoritative consume happens later in sign-debit-note, which re-verifies and
// then deletes the OTP.

const MAX_ATTEMPTS = 5;
function pepper(): string { return Deno.env.get("DEBIT_NOTE_OTP_PEPPER") ?? Deno.env.get("DEAL_OTP_PEPPER") ?? ""; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const { token, otp } = await req.json().catch(() => ({}));
    if (!token || !otp) return json({ verified: false, error: "Invalid request." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const db = createClient(supabaseUrl, serviceKey);

    const { data: note } = await db
      .from("dsa_debit_notes")
      .select("id, signature_status, status, token_expires_at")
      .eq("secure_token", token)
      .maybeSingle();

    if (!note) return json({ verified: false, error: "This link is no longer valid." }, 400);
    if (note.signature_status === "signed") return json({ verified: false, error: "This debit note has already been signed." }, 400);
    if (note.status === "cancelled") return json({ verified: false, error: "This debit note has been cancelled." }, 400);
    if (note.token_expires_at && new Date(note.token_expires_at) < new Date()) {
      return json({ verified: false, error: "This link has expired." }, 400);
    }

    const { data: otpRow } = await db
      .from("dsa_debit_note_otps")
      .select("*")
      .eq("debit_note_id", note.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!otpRow) return json({ verified: false, error: "No verification code found. Please request a new one." }, 400);
    if (new Date(otpRow.expires_at) < new Date()) {
      await db.from("dsa_debit_note_otps").delete().eq("id", otpRow.id);
      return json({ verified: false, error: "Verification code expired. Please request a new one." }, 400);
    }
    if (otpRow.attempts >= MAX_ATTEMPTS) {
      await db.from("dsa_debit_note_otps").delete().eq("id", otpRow.id);
      return json({ verified: false, error: "Too many attempts. Please request a new code." }, 429);
    }

    const candidate = await hashOTP(String(otp).trim(), token, pepper());
    if (candidate !== otpRow.otp_hash) {
      await db.from("dsa_debit_note_otps").update({ attempts: otpRow.attempts + 1 }).eq("id", otpRow.id);
      return json({ verified: false, error: "Incorrect verification code." }, 400);
    }

    // Valid — do NOT delete; sign-debit-note consumes it on the final step.
    return json({ verified: true });
  } catch (err: any) {
    console.error("verify-debit-note-otp error:", err?.message);
    return json({ verified: false, error: "Internal error." }, 500);
  }
});
