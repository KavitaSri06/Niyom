import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is authenticated
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser();
    if (callerErr || !callerUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Check caller is admin or super_admin in nw_employees
    const { data: caller } = await adminClient
      .from("nw_employees")
      .select("role, status")
      .eq("auth_user_id", callerUser.id)
      .maybeSingle();

    const isAuthorized = caller && ["admin", "super_admin"].includes(caller.role) && caller.status === "active";

    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Forbidden: admin access required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, password, full_name, role, employee_code } = await req.json();

    if (!email || !password || !full_name || !employee_code) {
      return new Response(JSON.stringify({ error: "Missing required fields: email, password, full_name, employee_code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate employee code format
    const empCodeClean = employee_code.trim().toUpperCase();
    if (!/^NIYOM-\d+$/.test(empCodeClean)) {
      return new Response(JSON.stringify({ error: "Employee ID must be in format NIYOM-001" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if employee code already in use
    const { data: codeConflict } = await adminClient
      .from("nw_employees")
      .select("id")
      .eq("employee_code", empCodeClean)
      .maybeSingle();

    if (codeConflict) {
      return new Response(JSON.stringify({ error: `Employee ID ${empCodeClean} is already taken.` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this email already has an nw_employees record
    const { data: existingEmp } = await adminClient
      .from("nw_employees")
      .select("id, employee_code")
      .eq("email", email)
      .maybeSingle();

    if (existingEmp) {
      return new Response(JSON.stringify({ error: "An employee with this email already exists in the CRM." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to find existing auth user by email
    let authUserId: string;
    let createdNewAuthUser = false;

    const { data: { users: existingUsers } } = await adminClient.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.find((u: any) => u.email === email);

    if (existingAuthUser) {
      authUserId = existingAuthUser.id;
      await adminClient.auth.admin.updateUserById(authUserId, { password, email_confirm: true });
    } else {
      const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) throw createErr;
      if (!newUser.user) throw new Error("Failed to create auth user");
      authUserId = newUser.user.id;
      createdNewAuthUser = true;
    }

    // Insert into nw_employees with the manually provided code
    const { error: insertErr } = await adminClient.from("nw_employees").insert([{
      auth_user_id: authUserId,
      employee_code: empCodeClean,
      full_name,
      email,
      role: role || "employee",
      status: "active",
      password_changed: false,
    }]);

    if (insertErr) {
      if (createdNewAuthUser) {
        await adminClient.auth.admin.deleteUser(authUserId);
      }
      throw insertErr;
    }

    return new Response(JSON.stringify({ success: true, employee_code: empCodeClean }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
