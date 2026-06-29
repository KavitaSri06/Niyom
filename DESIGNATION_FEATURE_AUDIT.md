# Audit: Add `designation` to `nw_employees` (display-only) — NO change to authorization

> **Status: ✅ IMPLEMENTED (2026-06-29)** after audit approval.
> Approved decisions: (1) names match exactly; (2) editable Designation field added to Add/Edit forms;
> (3) new hires default to `Relationship Manager`.
> All changes below are now in the working tree. Typecheck shows only **pre-existing** `noUnusedLocals`
> errors in untouched files — none reference `designation` or any edited file.

## 0. Guiding rules (locked)
- `role` column (`super_admin` / `admin` / `employee`) stays the **only** source of truth for
  authentication, authorization, RLS, routing and feature gating. **Not touched.**
- `designation` is a **new, nullable, display-only** text column. Used **only** for what humans/clients see.
- The strings `Super Admin` / `Admin` / `Employee` must never reach a client-facing email, PDF, letter or document.

## 0a. Important scope finding
There are **two separate employee systems** in this codebase:
1. **`nw_employees`** (table) + `NWEmployee` type — the active CRM. **This is in scope.**
2. **`crm_users`** (table) + `CRMUser` type (`src/types/index.ts:33`) — a **legacy** admin/employee
   panel used by `src/pages/AdminDashboard.tsx`, `EmployeeDashboard.tsx`, `AddDeal.tsx`, `CRMLogin.tsx`.
   Its `role` is used **only** for internal routing/gating and is **never rendered to clients or in any
   email/PDF**. → **Out of scope.** (Flagging it so we agree to leave it alone.)

---

## 1. Database migration  (NEW FILE)
**`supabase/migrations/20260629120000_add_designation_to_nw_employees.sql`**

```sql
-- Display-only job title. Authorization stays on nw_employees.role — do NOT change role.
ALTER TABLE nw_employees ADD COLUMN IF NOT EXISTS designation text;

-- Populate per spec (case/space-insensitive name match).
UPDATE nw_employees SET designation = 'Designated Partner'
  WHERE lower(trim(full_name)) IN ('purushothaman s', 'ramya n');

UPDATE nw_employees SET designation = 'Senior Relationship Manager'
  WHERE lower(trim(full_name)) IN ('prabhu s', 'bhuvaneswari r');

-- Everyone else (and any unmatched) → Relationship Manager.
UPDATE nw_employees SET designation = 'Relationship Manager'
  WHERE designation IS NULL;
```

Notes:
- No CHECK constraint (free text, future-proof). No RLS change (column travels with existing `SELECT *`).
- Matching is by `full_name` because these employees are live data, not seeded in any migration.
  **Please confirm the exact stored spelling** of the 4 names (e.g. is it `Purushothaman S` exactly?).
  If a name differs, that row silently falls back to `Relationship Manager` — so confirmation matters.

---

## 2. TypeScript type  (1 file)
**`src/crm/types.ts:1-14`** — add to `NWEmployee`:
```ts
  designation: string | null;
```
`role` stays exactly as-is. CRM fetches use `select('*')` (`src/crm/CRM.tsx:60,76`), so the value
flows through automatically — no query edits needed on the frontend.

---

## 3. Frontend UI — show designation instead of role  (3 files)

| File / line | Now | Change to |
|---|---|---|
| `src/crm/Settings.tsx:92` | `{ROLE_LABELS[employee.role]}` | `{employee.designation ?? 'Relationship Manager'}` |
| `src/crm/Layout.tsx:198` (sidebar under name) | `{employee.role.replace('_',' ')}` | `{employee.designation ?? 'Relationship Manager'}` |
| `src/crm/Employees.tsx:158` (table header) | `'Role'` | `'Designation'` |
| `src/crm/Employees.tsx:183` (table cell) | `ROLE_COLORS[e.role]` + `ROLE_LABELS[e.role]` | render `e.designation ?? 'Relationship Manager'` (drop role color/label) |

- `ROLE_LABELS` / `ROLE_COLORS` (`Settings.tsx:9`, `Employees.tsx:23-24`) become unused for display
  and will be removed (or kept only if still referenced).
- **Auth-only `role` reads stay untouched** in: `CRM.tsx`, `ClientOnboarding.tsx`, `Dashboard.tsx`,
  `DealConfirmation.tsx`, `DSAManagement.tsx`, `DSAPayout.tsx`, `Portfolio.tsx`, `MIS.tsx`,
  `Reports.tsx`, `ManageClients.tsx`, `Transactions.tsx`, `Documents.tsx`, `Layout.tsx:40`
  (all `isAdmin = role === 'admin' || role === 'super_admin'`).
- **The Add/Edit Employee form** (`Employees.tsx`) keeps the `role` selector (that drives authorization).
  → **Decision needed:** add an optional `designation` text field to the add/edit form so new hires get
  a proper title? (Recommended — otherwise new employees rely on the create-crm-user default below.)
- Dashboard cards, User Details, Employee Directory, Profile: audited — none render the role string
  today **except** the Settings profile card and the sidebar above, which are both covered.

---

## 4. Client-facing EMAILS — use designation, never role  (3 functions + 1 shared)

These currently convert `role → title` via `formatRole`/`formatRmRole`, which leaks **"Super Admin"**
for a super_admin RM. They must use the employee's `designation` instead.

| File | Now | Change |
|---|---|---|
| `supabase/functions/_shared/signing.ts:71-78` | `formatRole(role)` returns "Super Admin"/"Admin"/"Relationship Manager" | repurpose to `formatDesignation(designation)` → `designation || 'Relationship Manager'` |
| `supabase/functions/send-debit-note-email/index.ts:44,103` | selects `role`; `formatRole(employee.role)` | select `role, designation`; use `employee.designation ?? 'Relationship Manager'` |
| `supabase/functions/send-deal-confirmation-email/index.ts:31-36,85,148` | inline `formatRole`; selects `role` | select `role, designation`; use `designation` directly |
| `supabase/functions/accept-deal/index.ts:146,150,153-160,207` | selects `role`; inline `formatRmRole` | select `role, designation`; use `designation ?? 'Relationship Manager'` |

Important: each of these also reads `role` for an **authorization** check
(`isAdmin = role === 'admin' || 'super_admin'` in the two send-* functions) — so we **add**
`designation` to the select, we do **not** remove `role`.

---

## 5. Client-facing PDFs / documents — verified, mostly already correct

- **Deal Confirmation PDF** `src/crm/DealDocument.tsx:252,262` — signatory block is **hardcoded**
  `Purushothaman S` / **`Designated Partner`**. Already compliant. No role string present. *(No change;
  it is a fixed company signatory, not the logged-in RM.)*
- **DSA Debit Note PDF** `src/crm/dsaDebitNote.ts:295-300` — fixed company signature, label
  **`Designated Partner`** / `Authorized Signatory`. Already compliant. *(No change.)*
- OTP emails (`send-deal-otp`, `send-debit-note-otp`) only say "Relationship Manager" generically — fine.
- `send-lead-notification` — no employee title rendered — fine.

→ **No PDF currently prints the internal role.** The role leak today is **only** in the three emails in §4.

---

## 6. Future-proofing (recommended, optional — please confirm)
So new employees never fall back to a bare/empty title:
- **`supabase/functions/create-crm-user/index.ts:125`** — when inserting the employee, also set
  `designation: 'Relationship Manager'` (or a value passed from the form).
- If §3 add-form field is approved, pass `designation` through
  `Employees.tsx` → `create-crm-user` body, and include it in the edit `update()` at `Employees.tsx:84`.

---

## 7. Files touched — summary
**New (1):** `supabase/migrations/20260629120000_add_designation_to_nw_employees.sql`
**Edited (6–8):**
- `src/crm/types.ts`
- `src/crm/Settings.tsx`
- `src/crm/Layout.tsx`
- `src/crm/Employees.tsx`
- `supabase/functions/_shared/signing.ts`
- `supabase/functions/send-debit-note-email/index.ts`
- `supabase/functions/send-deal-confirmation-email/index.ts`
- `supabase/functions/accept-deal/index.ts`
- *(optional §6)* `supabase/functions/create-crm-user/index.ts`

**Explicitly NOT touched:** every `role`-based `isAdmin`/auth/RLS/routing check, all RLS policies,
the `crm_users` legacy system, and the already-compliant hardcoded PDF signatory blocks.

---

## 8. Open questions — RESOLVED
1. Names match exactly → migration uses them verbatim (case/space-insensitive).
2. ✅ Editable Designation field added to Add/Edit forms.
3. ✅ New hires default to `Relationship Manager` in `create-crm-user`.

---

## 9. FINAL FULL-CODEBASE AUDIT (2026-06-29)

Swept every `employee.role` / `role` / `formatRole` / `Super Admin` / `Employee` reference.

### Client-facing outputs — all clean ✅
| Surface | Result |
|---|---|
| Employee list / profile / sidebar (`Employees`, `Settings`, `Layout`) | show `designation` (fallback `Relationship Manager`) |
| Dashboard cards & Activity feed (`Dashboard.tsx`) | renders `full_name` only — never role; internal CRM only |
| Emails: `accept-deal`, `send-deal-confirmation-email`, `send-debit-note-email` | use `designation` via `formatDesignation`; `role` only for `isAdmin` auth |
| Deal Confirmation PDF (`DealDocument.tsx`) | hardcoded "Designated Partner" signatory — clean |
| DSA Debit Note PDF (`dsaDebitNote.ts`) | hardcoded "Designated Partner" signatory — clean |
| Reports CSV export (`Reports.tsx`) | "Employee" is a column header; value = `full_name`, not role — clean |
| Public client views (`PublicDealView`, `PublicDebitNoteView`, `ClientPortal`) | generic "relationship manager" wording only; no role/title from DB |
| OTP / lead-notification emails | generic wording; no employee role |

### Remaining `role` references = authorization only (correct, untouched) ✅
- All `isAdmin = role === 'admin' || 'super_admin'` (12 CRM files + 2 edge fns).
- `Employees.tsx` Role `<select>` (incl. "Super Admin" option) — **internal admin tool**, visible only to a super_admin managing staff; not client-facing.
- Auth guards: `create-crm-user`, `secure-password-reset`, `send-reset-otp`.
- Legacy `crm_users` system (`AdminDashboard`, `EmployeeDashboard`, `AddDeal`, `CRMLogin`, `types/index.ts`) — separate, internal routing only, never client-facing. Out of scope.
- No `case "super_admin"/"admin"/"employee"` role→title mapping exists anywhere anymore.

### Other verifications ✅
- **Blank-safe:** every UI read uses `?? 'Relationship Manager'`; every email/insert uses `(designation && trim) || 'Relationship Manager'`; migration backfills all rows. No blank possible.
- **Validation:** `handleAdd` blocks empty designation ("Designation is required."); `handleEdit` blocks empty designation; form uses a `<select>` so an empty value is not selectable; `create-crm-user` server-side coerces empty → `Relationship Manager`.
- **Migration idempotent:** `ADD COLUMN IF NOT EXISTS` + idempotent `UPDATE`s; tracked by Supabase so runs once. Safe.
- **Authorization/RLS untouched:** no RLS policy changed; no policy references `designation`; all access control still keys off `role`/`status`.

### Pre-existing (NOT introduced here)
- `Employees.tsx:4` `'fmt' is declared but never read` — pre-existing unused import (one of many project-wide `noUnusedLocals` warnings); esbuild build unaffected.

## Verdict: ✅ PRODUCTION-READY — no client-facing role leaks remain.
**To deploy:** apply the migration and redeploy 4 edge functions
(`accept-deal`, `send-deal-confirmation-email`, `send-debit-note-email`, `create-crm-user`).
