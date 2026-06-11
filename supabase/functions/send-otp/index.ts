import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is an authenticated employee
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for nw_otps — bypasses RLS (table has no user-facing policies)
    const db = createClient(supabaseUrl, serviceKey);

    const { action, phone, otp } = await req.json();

    if (action === "send") {
      if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ""))) {
        return new Response(JSON.stringify({ error: "Enter a valid 10-digit mobile number." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanPhone = phone.replace(/\s/g, "");
      const code = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Replace any existing OTP for this phone, then write the new one
      await db.from("nw_otps").delete().eq("phone", cleanPhone);
      await db.from("nw_otps").insert({ phone: cleanPhone, otp: code, expires_at: expiresAt });

      // Best-effort sweep of expired rows across all phones
      await db.from("nw_otps").delete().lt("expires_at", new Date().toISOString());

      console.log(`OTP for ${cleanPhone}: ${code}`);

      const msg91Key = Deno.env.get("MSG91_AUTH_KEY");
      const msg91TemplateId = Deno.env.get("MSG91_TEMPLATE_ID");
      if (msg91Key && msg91TemplateId) {
        try {
          await fetch("https://control.msg91.com/api/v5/flow/", {
            method: "POST",
            headers: { "Content-Type": "application/json", authkey: msg91Key },
            body: JSON.stringify({
              template_id: msg91TemplateId,
              recipients: [{ mobiles: `91${cleanPhone}`, otp: code }],
            }),
          });
        } catch (_) {
          // SMS failure is non-fatal — OTP is still persisted in DB
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "verify") {
      if (!phone || !otp) {
        return new Response(JSON.stringify({ error: "Phone and OTP are required." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanPhone = phone.replace(/\s/g, "");

      const { data: stored, error: fetchErr } = await db
        .from("nw_otps")
        .select("otp, expires_at")
        .eq("phone", cleanPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchErr || !stored) {
        return new Response(JSON.stringify({ error: "No OTP found. Please request a new one." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(stored.expires_at) < new Date()) {
        await db.from("nw_otps").delete().eq("phone", cleanPhone);
        return new Response(JSON.stringify({ error: "OTP expired. Please request a new one." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (stored.otp !== otp.trim()) {
        return new Response(JSON.stringify({ error: "Incorrect OTP. Please try again." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await db.from("nw_otps").delete().eq("phone", cleanPhone);
      return new Response(
        JSON.stringify({ success: true, verified: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use 'send' or 'verify'." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
