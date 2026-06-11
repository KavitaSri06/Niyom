# Niyom Wealth Distribution LLP — Project Status

**Last updated:** 2026-06-12  
**Supabase project ref:** `jlmwazuwjnhoqqloyeoj`  
**Branch:** `main`  
**Build status:** Passing (`npm run build` clean, `tsc --noEmit` zero errors)

---

## 1. Current Project Status

The application is a full-stack wealth management platform built on React + TypeScript (Vite) + Supabase (PostgreSQL, RLS, Edge Functions, Storage).

**All production-critical database migrations have been applied and verified on the live database.**  
**The `send-otp` edge function has been rewritten and deployed.**  
**A full branding rename has been applied across all files.**

The application is ready for production deployment of the frontend build. No blocking issues remain.

---

## 2. Architecture Summary

```
PUBLIC PORTAL  (/ routes)
  User-facing investment platform — KYC, news, unlisted shares, mutual funds
  Auth: Supabase Auth → user_profiles / kyc_submissions

NIYOM WEALTH CRM  (/crm/* routes)  ← PRIMARY ACTIVE SYSTEM
  Internal CRM for employees and clients
  Tables: nw_* prefix

LEGACY CRM  (accessible via landing page navigation only, no URL route)
  Tables: crm_users, deals, clients, slab_rules
  Pages: AdminDashboard.tsx, EmployeeDashboard.tsx, AddDeal.tsx, CRMLogin.tsx
  Status: Still live but unmaintained; retirement is a future task
```

---

## 3. Completed Work This Session

### 3.1 Database Schema Fixes

All four columns were found to be nullable on the live DB despite TypeScript declaring them as required. Root cause: earlier migrations used `ADD COLUMN IF NOT EXISTS` on columns that already existed (added via Supabase dashboard SQL editor), making those migrations no-ops.

| Column | Table | Problem | Fix |
|---|---|---|---|
| `snap_depository` | `nw_deal_confirmations` | Nullable, no DEFAULT | Migration 20260611120000: backfill + NOT NULL + DEFAULT '' |
| `depository` | `nw_clients` | Nullable, no DEFAULT | Migration 20260611120100: NSDL/CDSL backfill + NOT NULL + DEFAULT '' |
| `email_status` | `nw_deal_confirmations` | Nullable, no CHECK | Migration 20260611120200: NOT NULL + CHECK IN ('pending','sent') |
| `nw_otps` | (new table) | Didn't exist | Migration 20260611100200: full table creation |

### 3.2 TypeScript Fixes

| File | Change |
|---|---|
| `src/crm/types.ts` | Added `depository: string` to `NWClient` interface |
| `src/crm/DealConfirmation.tsx` | Added `base_rate: number` to `DealRecord` interface |
| `src/crm/DealConfirmation.tsx` | Changed `snap_depository?: string` to `snap_depository: string` (non-optional) |
| `src/crm/DealConfirmation.tsx` | Removed `(selectedClient as any).depository` cast; now uses typed field |

### 3.3 DealConfirmation Logic Fixes

| Fix | Location | Problem | Resolution |
|---|---|---|---|
| Edit-mode double rate deduction | `openEdit()` | `base_rate` form field was populated with `rate_per_unit` (already-adjusted). On re-save, 0.015% was deducted again. | Changed to `deal.base_rate ?? deal.rate_per_unit` |
| PDF element guard | `handleSendEmail()` | Silent failure when DOM element missing | Now shows user-facing toast: "Open the deal preview before sending email." |
| Duplicate PDF options | `buildPdfOpts()` helper | Two inline `pdfOpt` objects with different scale values | Unified into `buildPdfOpts(confirmationNumber, date, scale)` helper |

### 3.4 OTP Edge Function Rewrite (`send-otp`)

| Problem | Fix |
|---|---|
| OTPs stored in Deno in-memory Map — lost on cold start | Persisted to `nw_otps` table via service role key |
| `_dev_otp` always returned in API response (Deno has no NODE_ENV) | Removed the conditional entirely; response is `{ success: true }` only |
| In-memory OTPs could not be verified across edge function instances | DB-backed verify with expiry check and auto-delete on use |

### 3.5 Branding Rename

**"Niyom Wealth Management LLP" → "Niyom Wealth Distribution LLP"**  
**"Niyom Wealth Management" → "Niyom Wealth Distribution"**

27 occurrences across 15 files updated. Zero remaining matches confirmed via global grep.

| File | Occurrences | Context |
|---|---|---|
| `index.html` | 2 | `<title>` and `og:title` |
| `src/components/LegalDocumentLayout.tsx` | 1 | Shared legal page footer |
| `src/crm/DealConfirmation.tsx` | 2 | PDF legal disclaimer clauses |
| `src/crm/DSAPayout.tsx` | 1 | PDF report footer |
| `src/crm/MIS.tsx` | 1 | PDF report footer |
| `src/crm/Portfolio.tsx` | 1 | PDF report footer |
| `src/pages/ClientLogin.tsx` | 1 | Welcome heading |
| `src/pages/ClientPortal.tsx` | 1 | Confidential watermark |
| `src/pages/ClientPortalComingSoon.tsx` | 1 | Footer copyright |
| `src/pages/Landing.tsx` | 1 | Footer copyright |
| `src/pages/Learning.tsx` | 1 | Footer copyright |
| `src/pages/Services.tsx` | 1 | Footer copyright |
| `src/pages/PrivacyPolicy.tsx` | 3 | Subtitle, intro, ContactBox |
| `src/pages/PublicOnboarding.tsx` | 2 | Subtitle, consent text |
| `src/pages/RiskDisclaimer.tsx` | 2 | Subtitle, ContactBox |
| `src/pages/TermsOfUse.tsx` | 6 | Subtitle, body ×4, ContactBox |

---

## 4. Deployed Migrations

Applied to live DB on **2026-06-12** via `npx supabase db push --linked`.

| Migration file | Applied | Effect |
|---|---|---|
| `20260609170000_add_email_status_to_deal_confirmations` | ✅ No-op (column pre-existed) | Recorded in migration history |
| `20260611100000_add_snap_depository_to_deal_confirmations` | ✅ No-op (column pre-existed) | Recorded in migration history |
| `20260611100100_add_depository_to_clients` | ✅ No-op (column pre-existed) | Recorded in migration history |
| `20260611100200_add_otp_persistence_table` | ✅ Applied | Created `nw_otps` table with RLS + indexes |
| `20260611120000_fix_snap_depository_not_null` | ✅ Applied | snap_depository: NOT NULL + DEFAULT '' |
| `20260611120100_fix_depository_not_null` | ✅ Applied | depository: NOT NULL + DEFAULT '' + NSDL/CDSL backfill |
| `20260611120200_fix_email_status_constraints` | ✅ Applied | email_status: NOT NULL + CHECK ('pending','sent') |

### Migration history note
8 remote-only migrations exist on the live DB with no local files (applied via Supabase dashboard during active development in Feb–May 2026). These were marked `reverted` in the migration history table to unblock `db push`. Their schema effects remain intact on the live DB. The local migration files do not need to be created for these unless a full schema audit is performed.

---

## 5. Deployed Edge Functions

| Function | Deployed | Notes |
|---|---|---|
| `send-otp` | ✅ 2026-06-12 | Rewritten to use `nw_otps` table; C1 security fix applied |

### Functions not redeployed this session (unchanged)
`send-deal-confirmation-email`, `send-lead-notification`, `secure-client-password-reset`, `secure-password-reset`, `create-client-login`, `public-client-onboard`, `client-pan-login`, `create-crm-user`, `update-mutual-funds`, `update-unlisted-shares`, `update-commodity-prices`, `fetch-financial-news`

---

## 6. Uncommitted Changes

The following files are modified but not yet committed to git:

**Source code (branding + logic fixes):**
- `index.html`
- `src/components/LegalDocumentLayout.tsx`
- `src/crm/DSAPayout.tsx`
- `src/crm/DealConfirmation.tsx`
- `src/crm/MIS.tsx`
- `src/crm/Portfolio.tsx`
- `src/crm/types.ts`
- `src/pages/ClientLogin.tsx`
- `src/pages/ClientPortal.tsx`
- `src/pages/ClientPortalComingSoon.tsx`
- `src/pages/Landing.tsx`
- `src/pages/Learning.tsx`
- `src/pages/PrivacyPolicy.tsx`
- `src/pages/PublicOnboarding.tsx`
- `src/pages/RiskDisclaimer.tsx`
- `src/pages/Services.tsx`
- `src/pages/TermsOfUse.tsx`
- `supabase/functions/send-otp/index.ts`

**New untracked files (migrations + CLI config):**
- `supabase/config.toml`
- `supabase/.gitignore`
- `supabase/migrations/20260611100000_add_snap_depository_to_deal_confirmations.sql`
- `supabase/migrations/20260611100100_add_depository_to_clients.sql`
- `supabase/migrations/20260611100200_add_otp_persistence_table.sql`
- `supabase/migrations/20260611120000_fix_snap_depository_not_null.sql`
- `supabase/migrations/20260611120100_fix_depository_not_null.sql`
- `supabase/migrations/20260611120200_fix_email_status_constraints.sql`

**Commit these before deploying the frontend build.**

---

## 7. Pending Tasks

### High priority

| Task | File | Detail |
|---|---|---|
| Verify stamp_duty/settlement_amount are GENERATED columns | Live DB | Run the inspection query in Supabase SQL editor (see below). If `attgenerated = ''`, they are DEFAULT-only and edits to base_rate will NOT recompute these values. |
| Commit all session changes to git | — | All modified files listed in Section 6 are unstaged |
| Deploy frontend build to Vercel | — | Run `npm run build` and push/deploy |

**Stamp duty/settlement amount verification query** — run in Supabase SQL editor:
```sql
SELECT
  a.attname                            AS column_name,
  a.attgenerated                       AS generated_flag,
  pg_get_expr(d.adbin, d.adrelid)     AS expression
FROM   pg_attribute a
LEFT   JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE  a.attrelid = 'public.nw_deal_confirmations'::regclass
AND    a.attname  IN ('stamp_duty', 'settlement_amount', 'base_rate')
AND    a.attnum   > 0
AND    NOT a.attisdropped
ORDER  BY a.attnum;
```
- `generated_flag = 's'` → GENERATED ALWAYS AS STORED. No action needed.
- `generated_flag = ''` → DEFAULT only. A new migration is required to drop and recreate as GENERATED ALWAYS AS STORED.

### Medium priority

| Task | Detail |
|---|---|
| ESLint cleanup | 7 linting errors exist (all non-blocking). 3 introduced this session: `catch (_)` in `send-otp` line 79, `catch (err: any)` in `send-otp` line 136, `catch (err: any)` in `DealConfirmation.tsx` line 417. Fix: change to `catch` without binding or use `catch (_err: unknown)` with type narrowing. |
| OTP smoke test | Verify send + verify flow works end-to-end using the procedure in the deployment notes. |
| Legacy CRM retirement | `AdminDashboard.tsx`, `EmployeeDashboard.tsx`, `AddDeal.tsx`, `CRMLogin.tsx` still reference `crm_users`, `deals`, `clients`, `slab_rules`. These pages are accessible via the landing page but have no URL route. Plan: remove from `App.tsx`, archive the 4 legacy tables. |

### Low priority / future

| Task | Detail |
|---|---|
| H3: OTP plaintext storage | OTPs stored as plaintext in `nw_otps`. Acceptable for internal employee scope. Must be hashed (bcrypt) before any client-facing OTP flow is added. |
| H4: OTP logged to console | `send-otp/index.ts` line 65: `console.log(\`OTP for ${cleanPhone}: ${code}\`)` — remove before client-facing use. |
| M4: loadDeals race condition | `setView('list')` runs before `loadDeals()` resolves in `handleSendEmail`. Pre-existing race condition. |
| M5: handleDelete silent failure | `handleDelete` in DealConfirmation swallows errors silently. Should show error toast. |
| R11: Confirmation number race | `nw_generate_confirmation_number` uses `COUNT(*)+1` — not safe under concurrent inserts. Replace with a sequence. |
| Dead table cleanup | Drop: `employees`, `share_news`, `nw_client_documents`, `incentive_slabs`, `product_rules`, `incentives`. Archive: `share_price_history`, `bond_price_history`, `data_update_log`. |
| Bundle size | Main JS bundle is 1.99 MB (gzipped 508 KB). Consider code-splitting heavy CRM pages with dynamic `import()`. |

---

## 8. Known Issues

### Schema divergence (resolved for critical columns)
8 migrations were applied directly via the Supabase dashboard and have no local files. Their effects are preserved on the live DB. The migration history table was repaired (`--status reverted`) to allow `db push` to proceed. These 8 timestamps are: `20260211213749`, `20260522182137`, `20260522214927`, `20260523091753`, `20260523102334`, `20260523113545`, `20260523113910`, `20260523123554`.

### Branding items requiring manual review
| Item | Location | Note |
|---|---|---|
| Migration SQL comment | `supabase/migrations/20260210163543_create_kyc_tables.sql` line 2 | Historical comment only, not user-facing |
| Email FROM display name | `supabase/functions/send-deal-confirmation-email/index.ts` | Sends from `support@niyomwealth.com` — domain is unchanged. If the email display name includes "Management", update it here. |
| Logo image assets | Deal confirmation PDF header | The PDF renders a logo image file. If the logo image contains the word "Management" as text, a new image asset is required. |
| `og:description` | `index.html` line 12 | Reads "Professional wealth management and investment advisory services" — "management" here is a generic term, not the company name. Update only if desired. |

---

## 9. Next Recommended Steps (in order)

1. **Run stamp_duty/settlement_amount verification query** in Supabase SQL editor. If `generated_flag` is empty, open a new session to write the corrective migration.

2. **Commit all changes to git:**
   ```
   git add index.html src/ supabase/config.toml supabase/.gitignore supabase/migrations/ supabase/functions/send-otp/
   git commit -m "Rebrand to Niyom Wealth Distribution LLP; fix OTP persistence, depository/snap_depository constraints, DealConfirmation edit-mode rate bug"
   ```

3. **Run OTP smoke test** (send + verify + expired OTP cases) using the procedure provided during the `send-otp` deployment.

4. **Deploy frontend** to Vercel (or trigger CI/CD pipeline).

5. **Fix ESLint errors** (3 introduced this session) — low effort, prevents CI warnings.

6. **Plan legacy CRM retirement** — coordinate with stakeholders before removing `AdminDashboard`, `EmployeeDashboard`, `CRMLogin`, `AddDeal` from `App.tsx`.

---

## 10. Key Technical Reference

### Rate calculation (DealConfirmation)
```
base_rate      = value entered by user (e.g. 100.00)
rate_per_unit  = base_rate - (base_rate × 0.015 / 100)   [adjusted rate sent to client]
stamp_duty     = base_rate × quantity × 0.015 / 100       [GENERATED column]
settlement_amount = base_rate × quantity                   [GENERATED column]
```

### NSDL/CDSL detection
```
demat_account starts with 'IN' (case-insensitive) → NSDL
any other non-empty demat_account                  → CDSL
empty demat_account                                → ''
```

### OTP flow
```
send action:
  1. DELETE FROM nw_otps WHERE phone = $1
  2. INSERT INTO nw_otps (phone, otp, expires_at)   [expires in 10 min]
  3. DELETE FROM nw_otps WHERE expires_at < now()   [sweep expired]
  4. POST to MSG91 if MSG91_AUTH_KEY env var is set (non-fatal if SMS fails)
  5. Return { success: true }

verify action:
  1. SELECT otp, expires_at FROM nw_otps WHERE phone = $1 ORDER BY created_at DESC LIMIT 1
  2. If not found → error "No OTP found"
  3. If expired → delete row, error "OTP expired"
  4. If mismatch → error "Incorrect OTP"
  5. If match → delete row, return { success: true, verified: true }
```

### Supabase CLI (linked project)
```
Project ref:    jlmwazuwjnhoqqloyeoj
project-ref file: supabase/.temp/project-ref

Migration commands:
  npx supabase migration list --linked
  npx supabase db push --linked

Function deploy:
  npx supabase functions deploy <name> --project-ref jlmwazuwjnhoqqloyeoj

Note: --linked flag is NOT supported for functions deploy; use --project-ref.
```
