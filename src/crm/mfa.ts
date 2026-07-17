// Two-factor auth (TOTP) for privileged CRM accounts.
//
// Uses Supabase's native MFA rather than a hand-rolled scheme. That matters for
// more than convenience: a verified TOTP challenge raises the session's
// Authenticator Assurance Level to aal2 and stamps it into the JWT, which means
// the guarantee can eventually be enforced in RLS — the database itself can
// refuse an unverified session. A bolt-on second factor could only ever gate the
// UI, leaving the REST API wide open to anyone holding a stolen password.
//
// Scope: admin + super_admin only, per the rollout decision. RMs are unaffected.
//
// NOTE ON ENFORCEMENT (read before extending):
// This layer is APPLICATION-level — it gates the CRM UI. It raises the bar a lot
// (a stolen password alone no longer gets you into the CRM) but it is not the
// same as RLS enforcement. Requiring aal2 in RLS policies is the stronger step
// and should only be switched on once every admin is enrolled, or they will be
// locked out of their own data.

import { supabase } from '../lib/supabase';
import { NWEmployee } from './types';

/** Roles required to carry a second factor. */
export function isPrivileged(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'super_admin';
}

export function employeeIsPrivileged(emp: Pick<NWEmployee, 'role'> | null | undefined): boolean {
  return isPrivileged(emp?.role);
}

export type MfaGate =
  | 'ok'          // nothing to do — proceed into the CRM
  | 'challenge'   // enrolled, but this session is still aal1 — ask for the code
  | 'enroll';     // privileged and no verified factor yet — must set one up

/**
 * True when the PROJECT has TOTP switched off (Supabase dashboard → Auth → MFA).
 *
 * This is the one case where the gate must NOT be enforced. If the platform
 * offers no TOTP, nobody can enrol, so demanding a factor would lock out every
 * admin — including the person who needs the dashboard to turn it back on. It is
 * not a meaningful weakening either: flipping that switch requires Supabase
 * project access, which is already a total compromise.
 */
export function isMfaUnavailable(err: unknown): boolean {
  const e = err as { message?: string; code?: string; status?: number } | undefined;
  const msg = (e?.message ?? '').toLowerCase();
  return (
    e?.code === 'mfa_totp_enroll_disabled' ||
    e?.code === 'mfa_totp_verify_disabled' ||
    /totp.*(disabled|not enabled)/.test(msg) ||
    /mfa.*(disabled|not enabled|unsupported)/.test(msg) ||
    /enroll.*disabled/.test(msg)
  );
}

/**
 * What, if anything, stands between this session and the CRM.
 *
 * Supabase reports nextLevel='aal2' only once a verified factor exists, so the
 * two cases are distinguished by the factor list rather than by AAL alone.
 */
export async function evaluateMfaGate(emp: Pick<NWEmployee, 'role'>): Promise<MfaGate> {
  if (!employeeIsPrivileged(emp)) return 'ok';

  const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalErr) {
    if (isMfaUnavailable(aalErr)) return 'ok'; // TOTP off project-wide — see isMfaUnavailable
    throw aalErr;
  }

  // Already stepped up in this session.
  if (aal?.currentLevel === 'aal2') return 'ok';

  // A verified factor exists -> Supabase wants us at aal2 -> challenge.
  if (aal?.nextLevel === 'aal2') return 'challenge';

  // No verified factor: a privileged account must create one before entering.
  return 'enroll';
}

/** Verified TOTP factors on the current user, if any. */
export async function listVerifiedTotpFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return (data?.totp ?? []).filter((f) => f.status === 'verified');
}

export interface TotpEnrollment {
  factorId: string;
  /** SVG data-URI produced by Supabase — renderable directly, no QR library. */
  qrCode: string;
  /** Shown so the code can be typed in by hand when a camera isn't available. */
  secret: string;
}

/**
 * Begin TOTP enrolment.
 *
 * Any unverified factor left behind by an abandoned attempt is removed first:
 * Supabase rejects a second enrolment with the same friendly name, so a user who
 * bailed out halfway would otherwise be permanently unable to retry.
 */
export async function startTotpEnrollment(friendlyName = 'Niyom CRM'): Promise<TotpEnrollment> {
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.totp ?? []) {
    if (f.status === 'unverified') {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName,
  });
  if (error) throw error;

  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Submit a 6-digit code against a factor. Used for both the final step of
 * enrolment and for the per-login challenge — Supabase treats them the same.
 * On success the session is upgraded to aal2.
 */
export async function verifyTotpCode(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId });
  if (cErr) throw cErr;

  const { error: vErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: code.trim(),
  });
  if (vErr) throw vErr;
}

/** Drop a half-finished enrolment (user cancelled the setup screen). */
export async function cancelEnrollment(factorId: string): Promise<void> {
  try {
    await supabase.auth.mfa.unenroll({ factorId });
  } catch {
    // Best-effort: a stale unverified factor is cleaned up on the next attempt.
  }
}

/** Turn Supabase's auth errors into something a person can act on. */
export function mfaErrorMessage(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? '';
  if (/invalid|incorrect/i.test(msg) && /code|totp/i.test(msg)) {
    return 'That code is not right. Check your authenticator app and try again.';
  }
  if (/expired/i.test(msg)) {
    return 'That code has expired. Enter the current one from your app.';
  }
  if (/rate|too many/i.test(msg)) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  // Surfaced when TOTP is switched off for the project.
  if (/disabled|not enabled|unsupported/i.test(msg)) {
    return 'Two-factor authentication is not enabled for this project yet.';
  }
  return msg || 'Could not verify the code. Please try again.';
}
