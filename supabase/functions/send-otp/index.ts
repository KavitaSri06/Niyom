import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// In-memory OTP store (per function instance, short-lived — good enough for ephemeral verification)
const otpStore = new Map<string, { otp: string; expires: number }>();

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
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await callerClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, phone, otp } = await req.json();

    if (action === "send") {
      if (!phone || !/^\d{10}$/.test(phone.replace(/\s/g, ""))) {
        return new Response(JSON.stringify({ error: "Enter a valid 10-digit mobile number." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanPhone = phone.replace(/\s/g, "");
      const code = generateOTP();
      otpStore.set(cleanPhone, { otp: code, expires: Date.now() + 10 * 60 * 1000 }); // 10 min expiry

      // Log OTP in console for now (SMS gateway can be wired here)
      console.log(`OTP for ${cleanPhone}: ${code}`);

      // If TWILIO or MSG91 keys are present, send SMS
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
          // SMS send failure is non-fatal — OTP still stored
        }
      }

      return new Response(JSON.stringify({ success: true, ...(Deno.env.get("NODE_ENV") !== "production" ? { _dev_otp: code } : {}) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify") {
      if (!phone || !otp) {
        return new Response(JSON.stringify({ error: "Phone and OTP are required." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanPhone = phone.replace(/\s/g, "");
      const stored = otpStore.get(cleanPhone);

      if (!stored) {
        return new Response(JSON.stringify({ error: "No OTP found. Please request a new one." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (Date.now() > stored.expires) {
        otpStore.delete(cleanPhone);
        return new Response(JSON.stringify({ error: "OTP expired. Please request a new one." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (stored.otp !== otp.trim()) {
        return new Response(JSON.stringify({ error: "Incorrect OTP. Please try again." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      otpStore.delete(cleanPhone);
      return new Response(JSON.stringify({ success: true, verified: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
