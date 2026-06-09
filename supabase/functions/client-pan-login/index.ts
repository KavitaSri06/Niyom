import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Generic error to avoid leaking whether a PAN exists
const INVALID = { error: "Invalid PAN or password." };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pan: string = (body.pan || "").trim().toUpperCase();

    if (!pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      return new Response(JSON.stringify(INVALID), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Look up the client by PAN using the service role (bypasses RLS safely)
    const { data: client } = await adminClient
      .from("nw_clients")
      .select("id, email, client_password_changed, client_login_enabled")
      .eq("pan", pan)
      .eq("client_login_enabled", true)
      .maybeSingle();

    if (!client || !client.email) {
      return new Response(JSON.stringify(INVALID), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Return only what the frontend needs to proceed with signInWithPassword
    return new Response(
      JSON.stringify({
        client_id: client.id,
        client_email: client.email,
        password_changed: client.client_password_changed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("client-pan-login error:", err?.message);
    return new Response(JSON.stringify(INVALID), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
