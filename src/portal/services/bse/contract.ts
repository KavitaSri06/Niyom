/**
 * BSE StAR MF — integration contract
 * =============================================================================
 * The single source of truth for how NIYOM talks to BSE StAR MF. Captured from
 * the live v2 portal walkthrough + BSE's Web Services spec (see the analysis
 * dossier). Nothing here calls BSE directly — it defines the SHAPES:
 *
 *   1. Low-level BSE params  → what our SERVER-SIDE PROXY sends to BSE (reference).
 *   2. `BseGateway`          → the client-side boundary the app depends on.
 *   3. Proxy config/endpoints→ how `liveGateway` will reach our proxy.
 *
 * WHY A PROXY (non-negotiable): BSE auth is a per-session `getPassword` token
 * (valid 5 min upload / 1 hr order), IP-whitelisted, over SOAP, with member
 * credentials. None of that can live in the browser. So:
 *
 *   React → BseGateway (this app) → NIYOM proxy (creds, getPassword, SOAP) → BSE
 */
import type {
  FundScheme,
  OrderRequest,
  OrderResult,
  RedemptionRequest,
  SwitchRequest,
  TxnResult,
} from '../../types/funds';

/* ============================================================================
 * 1. LOW-LEVEL BSE PARAMETERS (reference — the proxy builds these; never the UI)
 * ==========================================================================*/

/** Transaction codes for order/SIP entry. */
export type BseTransCode = 'NEW' | 'CXL';
export type BseBuySell = 'P' | 'R'; // Purchase / Redeem
export type BseBuySellType = 'FRESH' | 'ADDITIONAL';
export type BseDpTxn = 'C' | 'N' | 'P'; // CDSL / NSDL / Physical
export type BseYesNo = 'Y' | 'N';
export type BseHoldingNature = 'SI' | 'JO' | 'AS'; // Single / Joint / Anyone-or-Survivor
export type BseSipFreqType = 'MONTHLY' | 'QUARTERLY' | 'WEEKLY' | 'DAILY';
export type BseMandateType = 'X' | 'E' | 'N'; // XSIP / eNACH / NACH (per BSE codes)

/** Session token from `getPassword`; short-lived, proxy-held (never client). */
export interface BseSession {
  encryptedPassword: string;
  issuedAt: string;
  /** ms lifetime — 3_600_000 for order svc, 300_000 for upload svc. */
  ttlMs: number;
}

/** `orderEntryParam` — lumpsum purchase / redemption (Order service). */
export interface BseOrderEntryParams {
  trans_code: BseTransCode;
  trans_no: string;
  order_id: string; // blank for NEW, original id for CXL
  user_id: string;
  member_id: string;
  client_code: string; // BSE UCC
  scheme_cd: string; // BSE scheme code from scheme master
  buy_sell: BseBuySell;
  buy_sell_type: BseBuySellType;
  dp_txn: BseDpTxn;
  order_val: string; // amount (purchase / amount-redeem)
  qty: string; // units (unit-redeem)
  all_redeem: BseYesNo;
  folio_no: string;
  remarks: string;
  kyc_status: BseYesNo;
  ref_no: string;
  sub_br_code: string;
  euin: string;
  euin_val: BseYesNo;
  min_redeem: BseYesNo;
  dpc: BseYesNo;
  ip_add: string;
  password: string; // session encrypted password
  pass_key: string;
}

/** `xsipOrderEntryParam` — SIP registration (Order service). */
export interface BseXsipParams {
  trans_code: BseTransCode;
  trans_no: string;
  scheme_cd: string;
  member_id: string;
  client_code: string;
  user_id: string;
  int_ref_no: string;
  trans_mode: string;
  dp_txn: BseDpTxn;
  start_date: string; // DD/MM/YYYY
  freq_type: BseSipFreqType;
  freq_allowed: string;
  inst_amt: string;
  num_inst: string;
  remarks: string;
  folio_no: string;
  first_order_flag: BseYesNo;
  brokerage: string;
  mandate_id: string;
  sub_br_code: string;
  euin: string;
  euin_val: BseYesNo;
  dpc: BseYesNo;
  xsip_reg_id: string; // for CXL
  ip_add: string;
  password: string;
  pass_key: string;
}

/** UCC / client master (Upload `MFAPI` fn '02'; pipe-delimited on the wire). */
export interface BseUccParams {
  code: string; // UCC
  holding: BseHoldingNature;
  taxStatus: string;
  occupationCode: string;
  appName1: string;
  appName2?: string;
  appName3?: string;
  dob: string; // DD/MM/YYYY
  gender: 'M' | 'F' | 'O';
  pan: string;
  type: string; // e.g. resident/NRI
  defaultDp: BseDpTxn;
  cdslDpId?: string;
  cdslCltId?: string;
  nsdlDpId?: string;
  nsdlCltId?: string;
  banks: BseUccBank[]; // up to 5
  chequeName?: string;
  add1: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  email: string;
  commMode: 'P' | 'E' | 'M';
  divPayMode: string;
}

export interface BseUccBank {
  accType: string;
  accNo: string;
  micrNo?: string;
  ifsc: string;
  defaultFlag: BseYesNo;
}

/** Mandate registration (Upload `MFAPI` fn '06'). */
export interface BseMandateParams {
  memberCode: string;
  clientCode: string;
  amount: string;
  ifsc: string;
  accountNumber: string;
  mandateType: BseMandateType;
}

/* ============================================================================
 * 2. CLIENT-FACING VIEW MODELS + GATEWAY BOUNDARY
 *    (the app only ever sees these; the proxy maps them to §1)
 * ==========================================================================*/

/** What the UI knows about a client's BSE registration (UCC). */
export interface UccRegistrationRequest {
  clientId: string; // NIYOM internal id
  holdingNature: BseHoldingNature;
  taxStatus: string;
  primaryHolderName: string;
  pan: string;
  dob: string;
  gender: 'M' | 'F' | 'O';
  email: string;
  mobile: string;
  bank: { accountNumber: string; ifsc: string; accountType: string };
  address: { line1: string; city: string; state: string; pincode: string; country: string };
}

export interface UccRegistrationResult {
  clientCode: string; // assigned BSE UCC
  status: 'DRAFT' | 'PENDING_AUTH' | 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED';
  isMock: boolean;
}

export interface MandateRegistrationRequest {
  clientCode: string;
  amount: number;
  bank: { accountNumber: string; ifsc: string };
  mandateType: BseMandateType;
}

export interface MandateRegistrationResult {
  mandateId: string;
  status: 'PENDING' | 'REGISTERED' | 'REJECTED';
  /** eNACH redirect the client completes to authorise the mandate. */
  authUrl?: string;
  isMock: boolean;
}

export interface PaymentLinkRequest {
  clientCode: string;
  orderId: string;
  returnUrl: string;
}

export interface PaymentLinkResult {
  paymentUrl: string;
  isMock: boolean;
}

export interface PaymentStatusResult {
  orderId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'NOT_INITIATED';
  isMock: boolean;
}

/**
 * The only boundary the app depends on. `mockGateway` (now) and `liveGateway`
 * (proxy, later) both implement it — swapping is a config change, not a rewrite.
 * Every method keeps the app's existing view models so callers never change.
 */
export interface BseGateway {
  getSchemes(): Promise<FundScheme[]>;
  getScheme(schemeCode: string): Promise<FundScheme | null>;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  placeRedemption(req: RedemptionRequest): Promise<TxnResult>;
  placeSwitch(req: SwitchRequest): Promise<TxnResult>;
  cancelOrder(orderId: string): Promise<TxnResult>;
  registerUcc(req: UccRegistrationRequest): Promise<UccRegistrationResult>;
  registerMandate(req: MandateRegistrationRequest): Promise<MandateRegistrationResult>;
  getPaymentLink(req: PaymentLinkRequest): Promise<PaymentLinkResult>;
  getPaymentStatus(orderId: string): Promise<PaymentStatusResult>;
}

/* ============================================================================
 * 3. PROXY CONFIG (liveGateway targets these; server-side proxy owns BSE creds)
 * ==========================================================================*/

/** Endpoint paths the NIYOM proxy will expose (see dossier §5). */
export const BSE_PROXY_ROUTES = {
  schemes: '/schemes',
  order: '/order',
  redemption: '/redemption',
  switch: '/switch',
  cancel: '/cancel',
  ucc: '/ucc',
  mandate: '/mandate',
  paymentLink: '/payment/link',
  paymentStatus: '/payment/status',
} as const;

/** Runtime mode. `mock` (default) keeps the app fully offline-demoable. */
export type BseMode = 'mock' | 'live';

export interface BseProxyConfig {
  mode: BseMode;
  /** Base URL of the NIYOM BSE proxy (e.g. a Supabase Edge Function). */
  baseUrl: string | null;
}
