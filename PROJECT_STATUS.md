# Niyom Wealth Distribution LLP — CRM Platform

## Internal Engineering Status Report

**Last updated:** 2026-06-26 (supersedes the 2026-06-20 roadmap revision)
**Audience:** Senior engineer (project hand-over)
**Repository:** `niyom` · branch `main` · HEAD `361dece`
**Current release:** Version 1 released/deployed; Version 2 (debit-note signing) feature-complete in repo.

> **Method note.** This report was produced by reading the codebase, the 82 Supabase
> migrations, the 26 edge functions, and the email templates directly. Where the
> repository cannot prove a fact (e.g. whether a migration/function is live in the
> hosted Supabase project), the limitation is stated rather than guessed. See §3, §4, §7.

---

## 1. Architecture Summary

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React 18.3 + TypeScript 5.5, Vite 5.4, Tailwind CSS 3.4, `lucide-react` icons | Single-page app. **No router library** — routing is hand-rolled in `src/App.tsx` via `window.location.pathname` + `popstate`. Public secure pages (`/deal/<token>`, `/debit-note/<token>`) short-circuit before auth. |
| **Backend** | Supabase (managed Postgres + PostgREST + GoTrue Auth + Storage) | No bespoke app server. Business logic lives in (a) the React client, (b) Postgres functions/RLS, (c) Supabase Edge Functions. |
| **Database** | PostgreSQL (Supabase) | 82 migrations under `supabase/migrations/`. RLS across CRM, client-portal, deal, and debit-note tables. `SECURITY DEFINER` helpers (pinned `search_path`) for code generation & numbering. |
| **Edge Functions** | Deno runtime, 26 functions under `supabase/functions/` | Secure signing flows, OTP issue/verify, transactional email, lead notifications, market-data refresh, password reset, client onboarding. Shared primitives in `_shared/signing.ts`. |
| **Storage** | Supabase Storage buckets | `crm-documents`, `nw-documents`, `deal-documents` (signed deal PDFs), plus debit-note signed-PDF storage. Bucket policies created via migrations. |
| **Authentication** | Supabase Auth (email/password) for CRM employees; PAN-based client portal (`client-pan-login`); token-based public links (no login) for signing; legacy admin query-key for KYC view. | Employee identity via `nw_employees` / `crm_users`. |
| **Email** | Resend API (`https://api.resend.com/emails`) | Sender `Niyom Wealth <support@niyomwealth.com>`. CC de-dup + admin CC in `_shared/signing.ts`. AMFI/ARN footer (ARN-362707, valid till 11-JUN-2029). |
| **PDF generation** | Client-side: `jspdf` 4.2, `html2pdf.js` 0.14 | Deal documents (`DealDocument.tsx`), debit notes (`dsaDebitNote.ts`), MIS report (print window). Signed copies rebuilt from an immutable `pdf_snapshot`. |
| **Signing workflows** | Secure link → email OTP → drawn e-signature → signed PDF stored separately | Two parallel pipelines: **Deal Confirmation** (client signs) and **Debit Note** (DSA signs). Each has its own token, OTP, events, and lock-on-sign. |
| **Deployment** | Vite build (`npm run build`); Supabase CLI for migrations/functions | See §7. Live deployment state cannot be verified from the repo alone. |

**Key libraries:** `@supabase/supabase-js` 2.57, `jszip` 3.10 (monthly debit-note ZIP), `jspdf`, `html2pdf.js`.

---

## 2. Features Completed

### 2.1 Public Website (`src/pages/`)

| Module | File | Status |
|--------|------|--------|
| Landing Page | `Landing.tsx` | ✅ Complete |
| Services | `Services.tsx` | ✅ Complete |
| Learning | `Learning.tsx` | ✅ Complete |
| About / company info | `RegulatoryInfo.tsx` + footer | ✅ Complete (embedded, no standalone route) |
| Contact | Landing/footer contact blocks | ✅ Complete |
| Legal layout shell | `LegalDocumentLayout.tsx` | ✅ Complete |
| Privacy Policy | `PrivacyPolicy.tsx` | ✅ Complete |
| Terms & Conditions / Terms of Use | `TermsOfUse.tsx` | ✅ Complete |
| Risk Disclaimer | `RiskDisclaimer.tsx` | ✅ Complete |
| Disclaimer page | `Disclaimer.tsx` | ✅ Complete |
| Lead funnels | `MutualFundsLead`, `PrimaryBondsLead`, `FixedDepositsLead`, `InsuranceLead`, `UnlistedShares` | ✅ Complete |
| Calculator / MF Research / News | `Calculator.tsx`, `MFResearch.tsx`, `News.tsx` | ✅ Complete |

### 2.2 CRM (`src/crm/`)

| Module | File | Status |
|--------|------|--------|
| Dashboard | `Dashboard.tsx` | ✅ Complete |
| Leads | lead funnels + `send-lead-notification` | ✅ Complete |
| Clients | `ManageClients.tsx`, `ClientOnboarding.tsx` | ✅ Complete |
| DSA Management | `DSAManagement.tsx` | ✅ Complete |
| Transactions | `Transactions.tsx` | ✅ Complete |
| Portfolio | `Portfolio.tsx` | ✅ Complete |
| MIS Report | `MIS.tsx` | ✅ Complete (see §2.6) |
| Reports | `Reports.tsx` | ✅ Complete |
| Employee Management | `Employees.tsx` | ✅ Complete |
| Documents / Replace-in-place | `Documents.tsx`, `AdminDocuments.tsx` | ✅ Complete |
| Activity Logs | `nw_activity_logs` + employee-scoped RLS | ✅ Complete |
| Deal Confirmation | `DealConfirmation.tsx`, `DealDocument.tsx` | ✅ Complete (see §2.4) |
| DSA Payout / Debit Notes | `DSAPayout.tsx`, `dsaDebitNote.ts` | ✅ Complete (see §2.5) |
| Settings / Change Password | `Settings.tsx`, `ChangePassword.tsx` | ✅ Complete |

**Platform-level features carried from Version 1 (still active):**
- **Forgot Password with OTP** — email→OTP→reset for CRM staff (hashed OTPs, rate-limited, single-use, enumeration-protected); `send-reset-otp` / `reset-password-with-otp` / `secure-password-reset`.
- **Admin login alert emails** — notification on every admin sign-in (security monitoring/audit).
- **Document Edit / Replace (V1)** — overwrite-in-place on every document row in Documents and the admin Vault; additive RLS deployed to production; admins replace any document, employees replace their own clients'.

### 2.3 Client Portal
- PAN-based login (`client-pan-login`), forced password change on first login, self-service portfolio view (`ClientPortal.tsx`), public onboarding intake (`public-client-onboard`). ✅ Complete.

### 2.4 Deal Confirmation Workflow — Final Implementation

End-to-end client e-signature flow, fully implemented:

- **Secure email** — `send-deal-confirmation-email` issues a tokenised link (`/deal/<token>`); no PDF attached.
- **OTP verification** — `send-deal-otp` / `verify-deal-otp`; OTP hashed `SHA-256(otp:token:pepper)`, persisted in `deal_otps`.
- **Client signature** — drawn via `SignaturePad.tsx` on `PublicDealView.tsx` (fully unauthenticated). Client must **read deal details + T&C before** signing.
- **Signed PDF generation** — rebuilt from an immutable snapshot so the signed copy equals the generated copy plus the client signature; both signatures embedded.
- **Storage** — `deal-documents` bucket (`20260612100400`).
- **Audit trail** — `deal_confirmation_events` records each lifecycle step; `20260616130000` adds T&C-acceptance auditing.
- **Email templates** — see §5. On confirmation the PDF is emailed to client, assigned employee, and admin; on rejection no PDF is sent.
- **Designated Partner signature** — embedded on the Niyom side of the PDF. **Currently rendered as "Purushothaman S — Designated Partner"** (see §5 note re: the "Ramya" request).
- **Full client name support** — `snap_client_name` snapshot; full legal name flows into the signed document.
- **Deal locking** — `20260612100300` makes accepted deals immutable.
- *Open detail:* Transaction/Bank Details section uses **placeholder account details** pending final client bank data (carried from V1).

### 2.5 Debit Note Workflow — Final Implementation

DSA-facing payout debit-note system with its own signing pipeline:

- **Gross payout** — directional DSA margin × quantity (see §2.6 / §6).
- **Fixed 2% TDS** — `tds_amount = round(gross × 0.02, 2)` (`20260620120000`); gross/TDS/net stored on each note.
- **Net payable** — `net_payable_amount = gross − tds`; amount-in-words uses Net Payable.
- **PDF generation** — `dsaDebitNote.ts`, monochrome A4 accounting layout, ruled particulars per transaction.
- **Dual signatures** — left block = DSA (payee) e-signature; right block = Niyom Designated Partner ("S. Purushothaman").
- **Client (DSA) signing workflow** — `/debit-note/<token>` public page (`PublicDebitNoteView.tsx`).
- **OTP** — `send-debit-note-otp` / `verify-debit-note-otp`; hashed + stored in `dsa_debit_note_otps`.
- **Signed PDF storage** — stored separately in `signed_pdf_url`; original `pdf_url` preserved.
- **ZIP download** — `jszip` bundles a month's debit-note PDFs (`Debit_Notes_YYYY_MM.zip`).
- **Status lifecycle** — payment `status`: `generated → paid → cancelled`; independent `signature_status`: `not_sent → sent → viewed → signed`.
- **Audit events** — `dsa_debit_note_events` (generated, link_sent, viewed, signed, cancelled, paid).
- **Signed → Paid** — admin marks `paid` (sets `paid_at`, `paid_by`); only `generated` notes eligible.
- **Cancel & regeneration** — cancellation requires a reason (`cancel_reason`); guarded against re-cancellation.
- **Partial unique index for cancelled notes** — `dsa_debit_notes_active_period_uniq ON (dsa_id, month, year) WHERE status <> 'cancelled'` (`20260626120000`).
- **Active-note constraint** — at most one non-cancelled note per DSA/month/year.
- **Signed PDF preview/download** — available from the CRM list.
- **Email workflow** — `send-debit-note-email` mints/rotates token, sets `signature_status='sent'`, CCs owner + admin. *(This closes the V1 gap "email sending not yet implemented".)*
- **DSA signing** — `sign-debit-note` embeds the signature and writes the signed copy.
- **Regeneration after cancellation** — a fresh sequential-numbered note can be generated for the same period; the cancelled row remains an immutable audit record. `generated` notes regenerate in place reusing their number.
- **Immutability** — signed notes are locked (`20260625120300`): no regenerate, cancel, or payout edit.

### 2.6 MIS — Calculation Logic

Implemented in `src/crm/MIS.tsx`; revenue computed per transaction within the selected month (new business only; filter on `txn_date`).

**Unlisted shares / secondary bonds / primary bonds (vs. landing cost):**
```
price        = sourced_via === 'dsa' ? dsa_price : per_unit_price
BUY  revenue = (price − landing_cost) × quantity
SELL revenue = (landing_cost − price) × quantity   // direction reversed
```
**Insurance:** flat `insurance_revenue`.
**Mutual fund (trail):** at the anniversary month of `trail_start_date`, `revenue = invested × trail_percent / 100` (≥ 1 year since investment).

**Directional DSA payout (debit notes, `DSAPayout.tsx`):**
```
BUY  payout = (client_price − dsa_price) × quantity
SELL payout = (dsa_price − client_price) × quantity
```
DSA payout direction is the inverse of MIS revenue by design — MIS measures firm margin vs. landing cost; the debit note measures what is owed to the DSA.

**Known limitations (MIS):**
- MF trail recognition keys off calendar month of `trail_start_date`, not day-level accrual.
- Revenue recognised only for transactions whose `txn_date` falls inside the selected month; rows with missing/incorrect `txn_date` are not retro-corrected.

---

## 3. Database — Migrations

**Total:** 82 migration files in `supabase/migrations/`, all version-controlled.

- **Applied status:** All are idempotent/additive (`IF NOT EXISTS`, guarded constraint drops) and assumed applied to the working/dev DB in timestamp order.
- **Production status:** Not verifiable from the repo. HEAD migration `20260626120000` (regeneration-after-cancel) and the Jun-2026 debit-note migrations should be confirmed live before sign-off (`supabase migration list`). See §7.

**Foundational / platform (Feb–May 2026):**

| Migration group | Purpose |
|-----------|---------|
| `20260210163543` | KYC tables |
| `20260211*`–`20260213*` | Mutual funds, news, unlisted shares/bonds, orders, cron jobs, FK indexes, security fixes |
| `20260220*` / `20260222*` | News de-dup constraint, investment-leads table |
| `20260319*` | Missing indexes, function `search_path` hardening |
| `20260403*` | **Core CRM**: `create_niyom_wealth_complete_crm`, `create_crm_system`, employees table, RLS perf |
| `20260515*` | Commodity prices, security-definer permissions |
| `20260522*` | **CRM v2 rebuild**, code-format updates, RLS recursion fixes, pincode, activity-log scoping |
| `20260523*` | DSA system & pricing, document-management, storage policies, client login, login-security audit, MIS revenue fields, PAN lookup RPC |
| `20260525*` | **Deal confirmations table** + numbering, settlement/stamp-duty/base-rate fixes, holdings `txn_date` |

**Deal Confirmation signing (Jun 2026):**

| Migration | Purpose |
|-----------|---------|
| `20260609170000` | Email status on deal confirmations |
| `20260611100000`–`20260611120200` | Snapshot depository, client depository, OTP persistence, NOT NULL + constraint fixes |
| `20260612100000`–`20260612100400` | Acceptance columns, `deal_confirmation_events`, `deal_otps`, lock accepted deals, `deal-documents` bucket |
| `20260615120000` / `20260615130000` | Password-reset OTPs, `nw_documents` policy replace |
| `20260616130000` | T&C acceptance audit |
| `20260623114939` | Race-safe confirmation numbering |

**Debit Note signing (Jun 2026):**

| Migration | Purpose |
|-----------|---------|
| `20260619120000` | Debit notes table |
| `20260619130000` | Counter table + `nw_generate_debit_note_number` |
| `20260619140000` | Cancellation reason |
| `20260619150000` | Deal email log |
| `20260620120000` | Fixed 2% TDS + net-payable, backfill |
| `20260625120000` | Signature lifecycle, token, e-sign audit, `signed_pdf_url`, `pdf_snapshot` |
| `20260625120100` | Debit-note OTP persistence |
| `20260625120200` | Event audit trail |
| `20260625120300` | Immutability on signed notes |
| `20260626120000` | **Partial unique index** — regeneration after cancellation (HEAD) |

---

## 4. Edge Functions

26 functions in `supabase/functions/`. JWT column reflects `supabase/config.toml` (`verify_jwt`); functions not explicitly listed default to `verify_jwt = true`. Deployment state not verifiable from the repo (§7).

| Function | Purpose | JWT | Status |
|----------|---------|-----|--------|
| `send-deal-confirmation-email` | Email secure deal link to client | Required (default) | ✅ |
| `get-deal-by-token` | Resolve deal by public token | **Public** | ✅ |
| `send-deal-otp` | Issue deal-signing OTP | **Public** | ✅ |
| `verify-deal-otp` | Verify deal OTP | **Public** | ✅ |
| `accept-deal` | Record acceptance + signed PDF | **Public** | ✅ |
| `reject-deal` | Record rejection | **Public** | ✅ |
| `record-tc-acceptance` | Audit T&C acceptance | **Public** | ✅ |
| `send-debit-note-email` | Email secure debit-note link to DSA | Required (default) | ✅ |
| `get-debit-note-by-token` | Resolve debit note by public token | **Public** | ✅ |
| `send-debit-note-otp` | Issue debit-note signing OTP | **Public** | ✅ |
| `verify-debit-note-otp` | Verify debit-note OTP | **Public** | ✅ |
| `sign-debit-note` | Embed DSA signature, store signed PDF | **Public** | ✅ |
| `send-reset-otp` | Password-reset OTP | **Public** | ✅ |
| `reset-password-with-otp` | Reset password via OTP | **Public** | ✅ |
| `secure-password-reset` | Employee password reset | Required (default) | ✅ |
| `secure-client-password-reset` | Client portal password reset | Required (default) | ✅ |
| `create-crm-user` | Provision CRM employee + auth user | Required (default) | ✅ |
| `create-client-login` | Provision client-portal login | Required (default) | ✅ |
| `client-pan-login` | PAN-based client login | Default¹ | ✅ |
| `public-client-onboard` | Public onboarding intake | Default¹ | ✅ |
| `send-otp` | Generic OTP issuance | Required (default) | ✅ |
| `send-lead-notification` | Notify team of new lead | Required (default) | ✅ |
| `fetch-financial-news` | Pull financial news feed | Required (default) | ✅ |
| `update-mutual-funds` | Refresh MF data | Required (default) | ✅ |
| `update-unlisted-shares` | Refresh unlisted-share prices | Required (default) | ✅ |
| `update-commodity-prices` | Refresh commodity prices | Required (default) | ✅ |

¹ Default `verify_jwt = true`; public client pages call them with the Supabase anon key (a valid JWT), so they are reachable without an end-user session while still requiring the project key. Confirm intended exposure during hand-over.

`_shared/signing.ts` provides shared signing primitives (token/OTP generation, OTP hashing with pepper, email masking, CC de-dup, Resend wrapper, INR + role formatting). The original Deal Confirmation functions intentionally do **not** import it, to keep that production flow byte-for-byte unchanged.

---

## 5. Email Templates (Production)

All email via Resend from `Niyom Wealth <support@niyomwealth.com>`, HTML + plain-text, with the AMFI/ARN regulatory footer.

| Template | Function | Contents |
|----------|----------|----------|
| **Deal Confirmation** | `send-deal-confirmation-email` | Secure review-&-sign link; no attachment; CCs owner + admin. |
| **Deal OTP** | `send-deal-otp` | 6-digit OTP authorising client signature. |
| **Signed Confirmation** | post-`accept-deal` | Confirmation of signed deal + signed PDF to client/employee/admin. |
| **Debit Note Signature Request** | `send-debit-note-email` | Gross / TDS @ 2% / Net payable summary + secure "Review & Sign" link; 7-day expiry; CCs owner + admin. |
| **Debit Note OTP** | `send-debit-note-otp` | 6-digit OTP to sign a specific debit note. |

> **⚠️ Discrepancy to resolve — Designated Partner signatory.**
> The task brief asks to state that **Ramya signs as Designated Partner**. The
> current code does **not** reflect this — both signed documents render
> **"Purushothaman S" / "S. Purushothaman" — Designated Partner**:
> - `src/crm/DealDocument.tsx` (~line 252): *Authorized Signatory Name: Purushothaman S*, *Designated Partner*.
> - `src/crm/dsaDebitNote.ts` (~line 297): *S. Purushothaman — Designated Partner*, with `NIYOM_SIGNATURE` image.
> - Admin CC default in `send-debit-note-email`: `purushothaman@niyomwealth.com`.
>
> No reference to "Ramya" exists anywhere in the codebase. If Ramya is now the
> Designated Partner of record, this is an **open action item** (update signatory
> name + signature image in both PDF generators and the admin CC) — not a
> completed feature. Tracked in §8 / §9.

---

## 6. Current Business Rules

| Rule | Definition |
|------|-----------|
| **Debit Note numbering** | `DN-YYYY-MM-NNN`, sequential per year/month via `dsa_debit_note_counters` + `nw_generate_debit_note_number`. Every note (active or cancelled) keeps a globally unique number. |
| **Deal Confirmation numbering** | `DC-<EMP_CODE>-NNN` (e.g. `DC-NIYOM-001`) via `nw_generate_confirmation_number`; race-condition-hardened. |
| **Employee codes** | `NIYOM-NNN` / `<PREFIX>-NNNN`. |
| **Client codes** | `ADMIN-NNNN` or `<emp_code>-NNNN`. |
| **TDS** | Fixed **2%** of gross: `tds = round(gross × 0.02, 2)`; `net = gross − tds`. |
| **DSA payout** | Directional: BUY `(client_price − dsa_price) × qty`; SELL `(dsa_price − client_price) × qty`. |
| **MIS revenue** | §2.6: landing-cost margin (unlisted/bonds), flat insurance revenue, MF trail at anniversary. |
| **BUY formula (MIS)** | `(price − landing_cost) × qty`, `price = dsa_price | per_unit_price` by `sourced_via`. |
| **SELL formula (MIS)** | `(landing_cost − price) × qty` (reversed). |
| **Signature workflow** | Secure tokenised link → email OTP (SHA-256 + server pepper) → drawn e-signature → signed PDF stored separately; signing locks the record. Link TTL = 7 days. |
| **Cancellation rules** | Only `generated` notes may be cancelled; reason mandatory; re-cancellation guarded; signed notes cannot be cancelled. |
| **Regeneration rules** | `generated` notes regenerate in place reusing the same number; after cancellation a new sequential number is minted; signed notes never regenerate. |
| **ZIP download rules** | Monthly bundle of all debit-note PDFs: `Debit_Notes_YYYY_MM.zip`. |
| **Active-note constraint** | At most one non-cancelled debit note per `(dsa_id, month, year)`. |

---

## 7. Deployment Status

> **Important:** Git records source, migrations, and function code — **not** what
> is live in the hosted Supabase project or web host. Confirm live state during
> hand-over (`supabase migration list`, `supabase functions list`).

### Production (committed to `main`, deployed / presumed deployed)
- Public website + CRM application (all modules in §2).
- Version 1: OTP password reset, admin login alerts, document replace-in-place, deal confirmation signing pipeline.
- Debit Note signing pipeline incl. TDS, dual signatures, ZIP, lifecycle, audit, **email sending** — commits through `361dece`.
- Migrations through `20260626120000` (HEAD).

### Local only (not yet committed / not deployed)
- **Uncommitted change in `src/crm/DSAPayout.tsx`** (`git status`: modified):
  - Adds a **period safety guard** excluding transactions whose `txn_date` is outside the selected month before any debit note is built, with `console.warn` audit logging and a `skippedOutOfPeriod` audit array.
  - Contains a **stray blank line** near the "Net Payable (after 2% TDS)" label (cosmetic; clean before commit).
  - Not committed → not deployed.

### Pending
- Confirm migration `20260626120000` and the Jun-2026 debit-note functions are applied/deployed to the live project.
- Resolve and deploy the Designated Partner signatory decision (§5).
- Commit (or revert) the local `DSAPayout.tsx` change after review.
- Finalise deal-confirmation bank/account details (currently placeholders).

---

## 8. Known Issues / Technical Debt

Genuine open items only:

1. **Historical debit notes pre-dating the `txn_date` fix remain unchanged** — not retro-recomputed; only newly generated notes use the corrected period logic.
2. **Theme system intentionally reverted** — rolled back to the safe original theme (`361dece`); deliberate, not a regression.
3. **Designated Partner signatory mismatch (§5)** — brief says "Ramya"; code signs as "Purushothaman S". Needs a business decision + code/image update.
4. **Uncommitted `DSAPayout.tsx` change with a stray blank line (§7)** — review, clean, commit (or revert).
5. **Deal-confirmation bank details are placeholders** pending final client account data.
6. **No standalone "About" route** — company info embedded in `RegulatoryInfo.tsx`/footer; future UI refactor.
7. **Hand-rolled routing in `App.tsx`** — functional but brittle; migrating to a router library is a future refactor.
8. **Legacy admin access via query key** (`?admin=niyom_admin_2024`) for the KYC admin view — retire in favour of role-based auth.
9. **Public onboarding/login functions default to `verify_jwt = true`** relying on the anon key — review whether the exposure model is intended.

---

## 9. Next Roadmap

### High Priority
1. **Resolve Designated Partner signatory** (Ramya vs. Purushothaman): update both PDF generators, signature image, and admin CC; redeploy.
2. **Verify live deployment** of latest migrations + Jun-2026 edge functions; reconcile drift.
3. **Review & commit the `DSAPayout.tsx` period guard** (remove stray blank line) so the fix reaches production.
4. **Finalise deal-confirmation bank/account details** (replace placeholders).
5. **Retire the legacy admin query-key** in favour of role-based authentication.

### Medium Priority
6. Security audit & hardening (auth, permissions, DB, edge functions) — planned V2 item.
7. Backfill / one-time recompute tooling for historical debit notes affected by the `txn_date` fix (if business wants consistency).
8. Tighten public-function exposure model (§4 note 1); document per-function auth contract.
9. Add automated tests around payout/TDS/MIS formulas (no test suite currently).
10. Calculation module for Employees/Admins (financial + business calculators) — pending formulas from business.

### Low Priority
11. Introduce a router library to replace hand-rolled routing in `App.tsx`.
12. Split a dedicated "About" page out of `RegulatoryInfo.tsx`.
13. Centralise email footer/branding into a shared template.
14. General UI refactoring / component extraction across CRM screens.

---

## 10. Overall Project Health

| Dimension | Assessment |
|-----------|-----------|
| **Completion** | **~95%.** All public-site, CRM, deal-confirmation, and debit-note modules are feature-complete. Remaining ~5% is the signatory decision, deployment verification, bank-detail finalisation, and one uncommitted cleanup. |
| **Production readiness** | **High.** Core flows committed and functioning. Release-blockers before a clean cut: signatory resolution (§5) and committing the local `DSAPayout.tsx` change. |
| **Security** | **Strong.** OTPs hashed (SHA-256 + server pepper); single-use secure tokens with 7-day expiry; signed documents locked/immutable; RLS across CRM, portal, deal, and debit-note tables; `SECURITY DEFINER` functions with pinned `search_path`; rate-limiting + enumeration protection on resets. Retire the legacy admin query-key. |
| **Database health** | **Good.** 82 idempotent, additive migrations; race-safe numbering; partial unique indexes; FK + filtering indexes; documented intent in migration headers. Confirm live application state. |
| **Technical debt** | **Low–moderate.** Mostly cosmetic/structural (routing, embedded About page, no test suite). No critical debt blocking operation. |
| **Deployment readiness** | **Ready pending verification.** Build + migration + function tooling in place; confirm live state and close the §7 "Pending" items before final sign-off. |

**Summary:** A feature-complete, security-hardened CRM with two mature e-signature
pipelines (Deal Confirmation and Debit Note). Ready for production hand-over once the
Designated Partner signatory is confirmed, the latest migrations/functions are verified
live, and the single uncommitted `DSAPayout.tsx` change is reviewed and committed.

---

*Maintained for Niyom Wealth Distribution LLP. Update whenever a feature changes release
status or a workflow rule changes. Generated 2026-06-26 — documentation only; no application
code, migrations, or deployments were modified.*
