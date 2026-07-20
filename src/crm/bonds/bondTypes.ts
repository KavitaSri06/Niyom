// Bond Creation module — shared types. Two shapes exist for a bond:
//   NWBond        — the full master row, ADMIN only (includes landing_cost etc.).
//   NWBondCatalog — the employee-safe projection from the nw_bonds_catalog view
//                   (NO landing_cost / purchase_price / margin internals).
// The service layer picks the source by role so employees can never receive
// confidential pricing over REST.

export type BondStatus =
  | 'Available' | 'Sold Out' | 'Reserved' | 'Expired' | 'Matured' | 'Archived';

export type MarginType = 'none' | 'percent' | 'flat' | 'manual';

export type BondSource = 'excel_upload' | 'pdf_upload' | 'word_upload' | 'api' | 'manual';

// Fields shared by both the admin row and the employee catalog view.
export interface NWBondBase {
  id: string;
  bond_code: string;
  company_name: string;
  isin: string;
  bond_name: string;
  issuer: string;
  security_type: string;
  security_category: string;
  seniority: string;
  listing_exchange: string;
  face_value: number | null;
  face_value_text: string;
  available_quantity: string;
  minimum_investment: string;
  multiples: string;
  issue_size: string;
  selling_price: number | null;      // client-facing price (safe to show)
  coupon: number | null;             // percent
  coupon_text: string;
  yield_ytm: number | null;          // percent
  ytc_ytp: number | null;            // percent
  maturity_date: string | null;
  maturity_text: string;
  tenure: string;
  rating: string;
  rating_agency: string;
  interest_frequency: string;
  interest_payment_dates: string;
  put_option: string;
  call_option: string;
  principal_repayment: string;
  credit_enhancement: string;
  trustee: string;
  tax_status: string;
  remarks: string;
  notes: string;
  footnotes: string;
  disclaimers: string;
  status: BondStatus;
  is_archived: boolean;
  source: BondSource;
  ocr_confidence: number;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

// Employee-safe view row.
export type NWBondCatalog = NWBondBase;

// Full admin master row — adds the confidential + provenance fields.
export interface NWBond extends NWBondBase {
  purchase_price: number | null;       // INTERNAL
  landing_cost: number | null;         // INTERNAL / CONFIDENTIAL
  default_margin_type: 'none' | 'percent' | 'flat';
  default_margin_value: number | null; // INTERNAL
  internal_notes: string;              // INTERNAL
  admin_remarks: string;               // INTERNAL
  extracted_json: unknown;
  document_id: string | null;
  created_by: string | null;
  modified_by: string | null;
}

export interface NWBondDocument {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  doc_format: 'excel' | 'pdf' | 'word' | 'other';
  bond_count: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface NWBondVersion {
  id: string;
  bond_id: string;
  version_no: number;
  snapshot: Record<string, unknown>;
  changed_by: string | null;
  change_note: string;
  created_at: string;
  changed_by_employee?: { full_name: string } | null;
}

export interface NWGeneratedMarketingPdf {
  id: string;
  bond_id: string;
  employee_id: string | null;
  margin_type: MarginType;
  margin_value: number | null;
  selling_price: number | null;
  bond_name_snapshot: string;
  created_at: string;
}

// ---- Parser types (modular; Excel implemented, PDF/Word pluggable) ----

// A single parsed bond ready for the preview grid. Values map 1:1 to nw_bonds
// columns. Confidence + flagged reasons drive the review UI.
export interface ParsedBond {
  rowNumber: number;
  data: ParsedBondData;
  confidence: number;            // 0-100
  needsReview: boolean;
  issues: string[];              // human-readable reasons a row needs review
}

export interface ParsedBondData {
  company_name: string;
  isin: string;
  bond_name: string;
  issuer: string;
  security_type: string;
  security_category: string;
  face_value: number | null;
  face_value_text: string;
  available_quantity: string;
  minimum_investment: string;
  multiples: string;
  purchase_price: number | null;
  coupon: number | null;
  coupon_text: string;
  yield_ytm: number | null;
  ytc_ytp: number | null;
  maturity_date: string | null;  // ISO date or null
  maturity_text: string;
  tenure: string;
  rating: string;
  rating_agency: string;
  interest_frequency: string;
  interest_payment_dates: string;
  put_option: string;
  call_option: string;
  tax_status: string;
  remarks: string;
  extracted_json: Record<string, unknown>;
}

export interface BondParseResult {
  supported: boolean;
  format: 'excel' | 'pdf' | 'word' | 'unknown';
  bonds: ParsedBond[];
  message?: string;              // shown when supported === false
  categories: string[];          // distinct categories found
}
