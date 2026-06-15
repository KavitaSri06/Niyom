# Niyom Wealth Distribution LLP — Product Roadmap & Release Status

**Last updated:** 2026-06-15
**Platform:** React + TypeScript (Vite) · Supabase (PostgreSQL, RLS, Edge Functions, Storage)
**Current release:** Version 1 — **Released / Deployed**

---

## Overview

Niyom Wealth Distribution LLP operates a full-stack wealth-management platform consisting of a
public investor portal and an internal CRM for employees and clients. This document is the
single source of truth for **what has shipped, what is in progress, and what is planned**.

### System architecture (at a glance)

| Surface | Routes | Purpose | Auth |
|---|---|---|---|
| **Public Portal** | `/` | Investor-facing platform — KYC, news, unlisted shares, mutual funds, leads | Supabase Auth → `user_profiles` |
| **Niyom Wealth CRM** *(primary)* | `/crm/*` | Employee & client operations — deals, clients, portfolios, payouts | Supabase Auth → `nw_employees` / `nw_clients` |
| **Client Portal** | `/client-login` | Client self-service portfolio view | PAN-based login → `nw_clients` |

All business data lives behind Row-Level Security. Privileged operations run through Supabase
Edge Functions using the service role; secrets are never exposed to the frontend bundle.

---

# Version 1 Release

**Status: RELEASED / DEPLOYED**

### 1. Forgot Password with OTP Authentication — ✅ Completed

Email-OTP password reset for CRM staff, replacing the legacy magic-link flow.

- Employee forgot-password flow (email → OTP → new password)
- Email OTP delivery via the platform email service
- Secure 6-digit OTP generation and verification
- Full password-reset functionality with strength enforcement
- OTP audit logging of every reset event
- Cryptographically secure OTP hashing (never stored in plaintext)
- Rate limiting, single-use OTPs, attempt limits, and email-enumeration protection
- Supabase Edge Functions deployed to production
- Production database tables deployed (additive, RLS-locked)

### 2. Admin Login Alert Emails — ✅ Completed

- Email notification whenever an admin account signs in
- Security monitoring for privileged access
- Audit visibility for administrator activity

### 3. Deal Confirmation Workflow (Core System) — ✅ Completed & Active

The flagship workflow enabling employees to issue deal confirmations and clients to review and
sign them digitally end to end.

**Employee actions**
- Create a deal confirmation
- Confirm & save
- Preview the deal
- Send a secure deal link via email

**Client actions** *(in the correct order)*
1. Open the secure deal link
2. **Read the complete deal details**
3. **Read the Terms & Conditions**
4. **Review and accept**, then sign digitally with a note/comment
5. Confirm the deal

> **Workflow rule:** the client must read the deal details and Terms & Conditions **before**
> signing. The digital signature is only captured **after** review and acceptance.

**After confirmation**
- Deal status updated to **Confirmed**
- Updated PDF regenerated with both signatures
- PDF automatically emailed to the **Client**, the **assigned Employee**, and the **Admin**

**If rejected**
- Deal status updated to **Rejected**
- No confirmation PDF is sent

**Enhancements shipped with this workflow**
- Corporate-style success confirmation page after signing
- Transaction / Bank Details section
- *Note:* bank details currently use placeholders pending final account details from the client

---

# Version 2 Roadmap

### 4. DSA Payout Debit Note Module — 🔜 Planned
- Debit note generation
- PDF generation
- Payout tracking
- Download and email support

### 5. DSA Document Editing System — 🔜 Planned
- Employees can edit uploaded DSA documents
- Admins can edit uploaded DSA documents
- Existing historical documents also editable
- Database permission and audit controls

### 6. Calculation Module — 🔜 Planned
- New Calculation section for Employees and Admins
- Financial calculators
- Business calculators

> *Calculation formulas/details pending from the business team.*

### 7. Security Audit & Hardening — 🔜 Planned
- Full security audit
- Authentication review
- Permission review
- Database security review
- Edge Function security review
- Vulnerability remediation

### 8. ARN Number & Legal Footer Compliance — 🔜 Planned
- ARN number integration
- Legal disclaimer updates
- Footer compliance updates
- Regulatory information display

---

# Product Maturity

### ✅ Completed
- CRM authentication
- Employee login
- Password reset (OTP)
- Deal confirmation workflow
- OTP systems
- Email automation
- PDF generation
- Digital signature flow
- Admin login alerts

### 🔄 In Progress
- Production refinement
- UI improvements
- Compliance updates

### 🔜 Planned
- DSA modules (payout debit notes, document editing)
- Calculation module
- Security audit & hardening
- Compliance enhancements (ARN, legal footers)

---

*Maintained for Niyom Wealth Distribution LLP. Update this document whenever a feature changes
release status (Planned → In Progress → Completed → Released).*
