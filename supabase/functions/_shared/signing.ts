// Shared helpers for the secure client-signing flows (Deno edge runtime).
//
// Extracted so the Debit Note signing functions don't copy-paste the proven
// Deal Confirmation primitives. The existing Deal Confirmation functions are
// intentionally left untouched and do NOT import this module — keeping the
// production deal flow byte-for-byte unchanged (backward compatibility).

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// 256-bit random hex token for a secure public link.
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// SHA-256(otp:token:pepper). The pepper is an environment secret so a DB leak
// of otp_hash alone is not sufficient to reverse the codes.
export async function hashOTP(otp: string, token: string, pepper: string): Promise<string> {
  const data = new TextEncoder().encode(`${otp}:${token}:${pepper}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function maskEmail(email: string): string {
  const [user, domain] = (email || "").split("@");
  if (!domain) return "";
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}

export const isValidEmail = (e: unknown): e is string =>
  typeof e === "string" && /^\S+@\S+\.\S+$/.test(e.trim());

// Build a de-duplicated CC list (lowercased) that never repeats the To address.
export function buildCc(candidates: (string | null | undefined)[], to: string): string[] {
  const seen = new Set<string>([to.trim().toLowerCase()]);
  const cc: string[] = [];
  for (const c of candidates) {
    if (!isValidEmail(c)) continue;
    const norm = c.trim().toLowerCase();
    if (seen.has(norm)) continue;
    seen.add(norm);
    cc.push(norm);
  }
  return cc;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Client-facing job title. NEVER derive this from `role` (super_admin/admin/employee are
// internal authorization values and must never reach a client). Use the employee's
// display-only `designation`, falling back to a safe generic title.
export function formatDesignation(designation: string | null | undefined): string {
  return (designation && designation.trim()) || "Relationship Manager";
}

export const INR = (n: number): string =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface SendEmailArgs {
  apiKey: string;
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text: string;
}

// Thin Resend wrapper returning a normalized result. Never throws on a non-2xx
// response — callers decide how to record the outcome.
export async function sendEmail(args: SendEmailArgs): Promise<{ ok: boolean; id: string | null; error?: unknown }> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${args.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Niyom Wealth <support@niyomwealth.com>",
        to: [args.to],
        ...(args.cc && args.cc.length ? { cc: args.cc } : {}),
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    });
    const data = await resp.json().catch(() => ({} as Record<string, unknown>));
    return { ok: resp.ok, id: (data as { id?: string }).id ?? null, error: resp.ok ? undefined : data };
  } catch (err) {
    return { ok: false, id: null, error: err };
  }
}
