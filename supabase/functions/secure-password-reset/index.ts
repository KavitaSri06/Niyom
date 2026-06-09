import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Generic response — never reveals whether email exists
const GENERIC_RESPONSE = { message: "If this email is registered, reset instructions will be sent." };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const email: string = (body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Return generic OK — never leak email format info
      return new Response(JSON.stringify(GENERIC_RESPONSE), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // SECURITY CHECK: verify email exists in nw_employees with active status
    const { data: employee, error: empErr } = await adminClient
      .from("nw_employees")
      .select("id, email, status, role")
      .eq("email", email)
      .eq("status", "active")
      .maybeSingle();

    // If employee not found OR has invalid role — return generic message, do NOT send reset
    if (empErr || !employee) {
      return new Response(JSON.stringify(GENERIC_RESPONSE), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Additional role guard — only admin/super_admin/employee can reset
    const allowedRoles = ["admin", "super_admin", "employee"];
    if (!allowedRoles.includes(employee.role)) {
      return new Response(JSON.stringify(GENERIC_RESPONSE), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Employee is valid — trigger the actual password reset via admin API
    const origin = req.headers.get("Origin") || req.headers.get("Referer") || "";
    const baseUrl = origin.split("/").slice(0, 3).join("/");
    const redirectTo = baseUrl ? `${baseUrl}/crm` : `${supabaseUrl.replace(".supabase.co", "")}/crm`;

    const { error: resetErr } = await adminClient.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });

    if (resetErr) {
      // Log but still return generic message
      console.error("Reset link generation error:", resetErr.message);
    }

    // Always return the same generic message regardless of outcome
    return new Response(JSON.stringify(GENERIC_RESPONSE), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Unexpected error:", err?.message);
    return new Response(JSON.stringify(GENERIC_RESPONSE), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
