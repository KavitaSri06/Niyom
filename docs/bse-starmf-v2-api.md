# BSE StAR MF 2.0 (v2 REST) — Integration Reference

> Extracted from BSE's official **StARMF 2.0 Integration Portal**
> (`https://starmfv2wrapper.bseindia.com/home`) on 21-Jul-2026. This settles the
> open questions from the BSE analysis dossier: **NIYOM integrates the v2 REST
> (JSON) API** — not the classic SOAP v3.5.

## 1. Environments

| Env | Base URL |
|---|---|
| **Sandbox / Demo (UAT)** | `https://starmfv2demo.bseindia.com/api` |
| **Production** | `https://v2.bsestarmf.in/api` |
| Docs portal | `https://starmfv2wrapper.bseindia.com/home` |

Sandbox facts (from the portal FAQ): dummy PANs accepted (e.g. `AAAAA0000A`);
webhooks testable via public endpoints (ngrok/requestbin); APIs are stateless and
support concurrent calls.

## 2. Authentication & headers

- `POST /api/login` with `{"data": {"username": "…", "password": "…"}}` →
  response contains **`access_token`**.
- Every subsequent call: `Authorization: Bearer <access_token>`.
- `Content-Type: application/json` **or** `application/jose` (encrypted payload
  mode). JOSE mode also uses `X-API-Org-ID: <org-code>:<fingerprint>`.
- Optional `X-STARMFv2-Trace-ID: <trace-id>` for diagnostics.
- **Envelope**: every request body is wrapped as `{"data": { … }}`; responses are
  `{"status": "success" | …, "data": { … }, "messages": …}`.
- List endpoints share a common shape:
  `start, length, fields:["ALL"], format:"json", count_only, sort_dir:"a"|"d",
  is_compressed, search:{value}, filter_param:{…}`.

## 3. Endpoint catalog (all `POST`)

### Auth
- `/api/login`

### Orders (lumpsum purchase / redemption / switch)
- `/v2/order_new` · `/v2/order_get` · `/v2/order_list` · `/v2/order_update` · `/v2/order_cancel`
- `order_new` required: `member (Object)`, `investor (Object — UCC client code)`,
  `mem_ord_ref_id (String 1-32, numbers+hyphen)`, `type (Enum p/r/s —
  purchase/redemption/switch)`, `scheme (BSE scheme code)`, `cur ("INR")`,
  `is_fresh (Boolean — new folio)`, plus holder/nomination/phys-demat details.
- Order status lifecycle strings include: *Order Sent to RTA, Order Accepted by
  RTA, Order Match is Pending, Order Expired, Order Cancellation Failed, Order
  Not Allowed*.
- **No cross-AMC switch** — switches must be within the same AMC.

### SXP — unified systematic plans (SIP / SWP / STP / TOPUP / SPROD)
- `/v2/sxp_register` · `sxp_get` · `sxp_list` · `sxp_get_history` · `sxp_cancel`
  · `sxp_set_pause` · `sxp_resume` · `sxp_topup` (+ `sxp_update`)
- `sxp_register` required: `sxp_type (SIP/SWP/STP/TOPUP/SPROD)`,
  `mem_sxp_ref_id (1-32)`, `investor`, `member`, `src_scheme`, `amount`, `cur`,
  `start_date (YYYY-MM-DD)`, `freq (m/w/d/f/q/h/y)`, `phys_or_demat (p/d)`,
  `is_fresh`, `is_nomination_opted`, `holder[] (max 3)`.
  Optional: `parent_client_code`, `dest_scheme` (mandatory for STP, same AMC),
  `amc_code`, `exch_mandate_id` (**mandatory for XSIP-type registration**).
- Returns `sxp_reg_num`.

### Mandates
- `mandate_register` · `mandate_get` · `mandate_list` · `mandate_update` ·
  `mandate_cancel` · `mandate_delink` · `link_mandate`
- Response fields seen: `exch_mandate_id, ucc, man_2fa, man_2fa_action_at,
  member_code, amount, cur, ifsc, acct_no, bank_name, bank_branch, acct_type,
  mode, frequency ("AS AND WHEN PRESENTED"), debit_type ("Maximum"), reg_date,
  start_date, end_date, type (e.g. X / N / U), umrn, max_txn_amt, valid_till,
  is_active, is_verified, verified_on`.
- eNACH has a dedicated 2FA event (`mandate_enach`) with hosted view object
  (`/api/s4/2fa_view_object/mandate_enach/<id>`).

### UCC (client registration)
- `/v2/add_ucc` · `/v2/get_ucc` · `/v2/list_ucc` · `/v2/update_ucc`
- `/v2/get_2fa_link` · `/v2/get_kyc_link` (**KYC via API**)
- Granular status reads: `ucc_status_pan / _kyc / _fatca / _bank_account /
  _depository / _holder / _aof / _aof_ria / _elog / _elog_ria / _nominee_2fa /
  _transaction_ready`, `ucc_count_status`, `ucc_inactive`, `ucc_mandatorydoc`.
- Section updates: `update_bank_details, update_communication, update_contact,
  update_depository, update_fatca, update_foreign, update_identifier,
  update_person`; UBO endpoints for corporates (`ubo, ubo_detail, ubo_person…`).
- Bank account object: `ifsc (Y)`, `no (Y, 9-20 digits incl. leading zeros)`, …
- **NFT (non-financial transactions)**: `/v2/nft_bank_account_change`,
  `/v2/nft_contact_change`, `/v2/nft_nominee_change`.

### 2FA (client authorisation — required per transaction event)
Events: `verify_order_new, verify_order_update, verify_order_cancel,
verify_sxp_reg, verify_sxp_topup, verify_sxp_cancel, verify_sxp_pause,
verify_sxp_resume, verify_mandate_cancel, mandate_enach, ucc_elog, ucc_nom,
nft_bank_acct_change, nft_contact_change, nft_nominee_change` (+ `2fa_NFO`).
Flow: obtain link via `/v2/get_2fa_link` (or event-specific `get_2fa_ucc_*`),
client approves on BSE-hosted page (`2fa_view_object/<id>`), status flows back.

### Payments (BSE Payment Gateway)
- `GeneratePaymentLink` (Single Payment BSE PG) · `send_payment_info` /
  `send_pg_payment_info` (Send Payment Info) · `get_bse_pg_payment_status` ·
  `get_payment_detail` / `/v2/get_payment_detail` / `/v2/list_payment_detail` ·
  `get_exchpg_service` · `submitpayment-aggregation`.

### Reference data & reports
- `/v2/master_scheme_list` (scheme master) · `/v2/nav_master_list` (NAVs)
- `/v2/get_mis_detail` (MIS) · `allotment-details` · `annexure/scheme-list`
- Scheme constraints: `scheme_transaction_amounts / _units / _mode_allowed /
  _single_details`.
- Dozens of enum/reference endpoints: `tax_status, tax_residency, country,
  gender, occupation, holding nature, depository_code, comm_mode, div_pay_mode,
  wealth_source, exemption_code, fatca_identifier_type, …`

### Webhooks
Supported for **UCC, orders, mandates, nominee** events. Endpoint must return
**HTTP 200**; **3 retries within a 30-minute window** (exponential backoff);
email alert to registered admin on failure; ack route `webhook-ack`.

## 4. Error model

Numbered error catalog with per-error cause/fix in the docs, grouped as
`errors/general, errors/order, errors/sxp, errors/mandate, errors/miscellaneous`.
Samples: `3663` ID does not exist · `3676` member not found · `3675` invalid file
type · `3669` invalid field value · `3580` invalid date-time format.

## 5. Implications for NIYOM's integration (vs. the old SOAP plan)

1. **JSON REST end-to-end** — no SOAP/WSDL; simpler proxy (fetch + Bearer).
2. Auth = login → `access_token` (Bearer), optionally JOSE-encrypted payloads.
   Credentials still live **server-side only** (our proxy) — unchanged decision.
3. **2FA is client-facing**: for each order/SIP/mandate action the *investor*
   approves via a BSE-hosted 2FA link. Our portal flows (Invest/Redeem/Switch/
   SIP) must surface that link/redirect after placement. This is the biggest UX
   addition vs. our current mock flow.
4. **SXP replaces XSIP**: one API family covers SIP/STP/SWP/topup — matches our
   Admin console nav 1:1.
5. **Webhooks** let the proxy push order/UCC/mandate status into Supabase instead
   of polling.
6. `src/portal/services/bse/contract.ts` keeps the same `BseGateway` boundary;
   the low-level SOAP parameter types there are superseded by these v2 shapes
   (kept for reference until the proxy is built).

## 6. Still needed from BSE (updated)

- Sandbox **credentials** (username/password for `/api/login` on the demo env)
  and whether IP whitelisting applies to the demo.
- JOSE signing details if BSE mandates `application/jose` in production
  (org code + key fingerprint issuance).
- Webhook registration process (where to configure our endpoint URL).
