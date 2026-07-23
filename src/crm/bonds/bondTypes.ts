// Bond Security Master — shared types (Zod-validated where it matters).
//
// The Excel contributes only { isin, bond_name, price }. Everything else lives
// in the master (bm_bonds / bm_bonds_public) and is enriched or computed.

import { z } from 'zod';

// ISIN: 2 country letters + 9 alphanumeric + 1 check digit.
export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

// A single row extracted from the daily Excel.
export const ImportRowSchema = z.object({
  isin: z.string().trim().toUpperCase().regex(ISIN_RE, 'Invalid ISIN'),
  bond_name: z.string().trim().default(''),
  price: z.number().positive().nullable().default(null),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;

// A parsed row plus its status for the preview grid (before hitting the RPC).
export interface ParsedImportRow {
  rowNumber: number;
  isin: string;
  bond_name: string;
  price: number | null;
  valid: boolean;      // ISIN well-formed
  issue?: string;      // why it's invalid, if so
}

export interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  new_bond_ids: string[];
}

export type VerificationStatus = 'pending' | 'enriching' | 'verified' | 'needs_review' | 'failed';
export type ActiveStatus = 'active' | 'matured' | 'suspended' | 'inactive';

// Client-safe master projection (mirror of bm_bonds_public; no landing cost).
export interface BondPublic {
  id: string;
  isin: string;
  issuer_id: string | null;
  issuer_name: string | null;
  industry: string;
  sector: string;
  bond_name: string;
  security_description: string;
  series: string;
  issue_date: string | null;
  listing_date: string | null;
  maturity_date: string | null;
  redemption_date: string | null;
  face_value: number | null;
  issue_price: number | null;
  redemption_value: number | null;
  coupon_rate: number | null;
  coupon_type: string;
  coupon_frequency: string;
  interest_payment_dates: string;
  first_coupon_date: string | null;
  next_coupon_date: string | null;
  previous_coupon_date: string | null;
  day_count_convention: string;
  business_day_convention: string;
  principal_repayment_structure: string;
  redemption_schedule: unknown;
  callable: boolean;
  puttable: boolean;
  perpetual: boolean;
  floating: boolean;
  put_call_date: string | null;
  put_call_type: string;
  seniority: string;
  security_type: string;
  secured: boolean | null;
  tax_status: string;
  exchange_listed: string;
  listing_status: string;
  nse_symbol: string;
  bse_code: string;
  min_investment: number | null;
  lot_size: number | null;
  currency: string;
  rating: string;
  rating_agency: string;
  rating_date: string | null;
  issuer_docs: Record<string, unknown>;
  selling_price: number | null;
  latest_price: number | null;
  price_updated_at: string | null;
  active_status: ActiveStatus;
  verification_status: VerificationStatus;
  data_quality_score: number;
  enriched_at: string | null;
  created_at: string;
  updated_at: string;
}
