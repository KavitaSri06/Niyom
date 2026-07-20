// Bond Creation module — constants: statuses, margin presets, detail sections.

import { BondStatus } from './bondTypes';

export const BOND_STATUSES: BondStatus[] = [
  'Available', 'Sold Out', 'Reserved', 'Expired', 'Matured', 'Archived',
];

// Theme-constant status colors (also used inside print/PDF HTML where CSS vars
// do not resolve) — kept as literal RGB triples like the Lead module.
export function bondStatusRgb(status: string): string {
  switch (status) {
    case 'Available':  return '16,185,129';   // emerald
    case 'Reserved':   return '245,158,11';   // amber
    case 'Sold Out':   return '239,68,68';    // red
    case 'Expired':    return '148,163,184';  // slate
    case 'Matured':    return '59,130,246';   // blue
    case 'Archived':   return '113,113,122';  // zinc
    default:           return '148,163,184';
  }
}

// Margin presets offered in the calculator / PDF flow.
export const MARGIN_PRESETS: { label: string; value: number }[] = [
  { label: '1%',    value: 1 },
  { label: '2%',    value: 2 },
  { label: '2.50%', value: 2.5 },
];

// NIYOM brand palette for the marketing brochure (literal hex — embedded in PDF).
export const NIYOM_BRAND = {
  darkBlue: '#0B1F3A',
  navy: '#12294d',
  gold: '#C8A24B',
  goldSoft: '#E4CE92',
  white: '#FFFFFF',
  ink: '#1a2436',
  mist: '#F4F6FB',
  line: '#DCE3EF',
};

// Detail-screen section layout. `admin` sections render only for admins.
export interface BondFieldDef { key: string; label: string; type?: 'currency' | 'percent' | 'date' | 'text'; }
export interface BondSectionDef { title: string; admin?: boolean; fields: BondFieldDef[]; }

export const BOND_SECTIONS: BondSectionDef[] = [
  {
    title: 'General',
    fields: [
      { key: 'company_name', label: 'Company Name' },
      { key: 'issuer', label: 'Issuer' },
      { key: 'isin', label: 'ISIN' },
      { key: 'bond_name', label: 'Bond Name' },
      { key: 'security_type', label: 'Security Type' },
      { key: 'security_category', label: 'Security Category' },
      { key: 'seniority', label: 'Seniority' },
      { key: 'listing_exchange', label: 'Listing Exchange' },
      { key: 'tax_status', label: 'Tax Status' },
    ],
  },
  {
    title: 'Pricing',
    fields: [
      { key: 'face_value_text', label: 'Face Value' },
      { key: 'purchase_price', label: 'Existing Price (per 100)', type: 'text' },  // admin row only — base for markup
      { key: 'selling_price', label: 'Selling Price', type: 'currency' },
      { key: 'minimum_investment', label: 'Minimum Investment' },
      { key: 'multiples', label: 'Multiples' },
      { key: 'available_quantity', label: 'Available Quantity' },
      { key: 'issue_size', label: 'Issue Size' },
    ],
  },
  {
    title: 'Coupon & Yield',
    fields: [
      { key: 'coupon', label: 'Coupon', type: 'percent' },
      { key: 'yield_ytm', label: 'Yield (YTM)', type: 'percent' },
      { key: 'ytc_ytp', label: 'YTC / YTP', type: 'percent' },
    ],
  },
  {
    title: 'Rating & Risk',
    fields: [
      { key: 'rating', label: 'Rating' },
      { key: 'rating_agency', label: 'Rating Agency' },
      { key: 'credit_enhancement', label: 'Credit Enhancement' },
    ],
  },
  {
    title: 'Interest & Redemption',
    fields: [
      { key: 'interest_frequency', label: 'Interest Frequency' },
      { key: 'interest_payment_dates', label: 'Interest Payment Dates' },
      { key: 'maturity_date', label: 'Maturity Date', type: 'date' },
      { key: 'maturity_text', label: 'Maturity / Redemption Detail' },
      { key: 'tenure', label: 'Tenure' },
      { key: 'put_option', label: 'Put Option' },
      { key: 'call_option', label: 'Call Option' },
      { key: 'principal_repayment', label: 'Principal Repayment' },
      { key: 'trustee', label: 'Trustee' },
    ],
  },
  {
    title: 'Notes & Disclaimers',
    fields: [
      { key: 'remarks', label: 'Remarks' },
      { key: 'notes', label: 'Notes' },
      { key: 'footnotes', label: 'Footnotes' },
      { key: 'disclaimers', label: 'Disclaimers' },
    ],
  },
  {
    title: 'Internal (Admin Only)',
    admin: true,
    fields: [
      { key: 'landing_cost', label: 'Landing Cost', type: 'currency' },
      { key: 'internal_notes', label: 'Internal Notes' },
      { key: 'admin_remarks', label: 'Admin Remarks' },
    ],
  },
];

// Default disclaimer printed on every marketing PDF.
export const BOND_PDF_DISCLAIMER =
  'This document is for information purposes only and does not constitute an offer, ' +
  'solicitation, or investment advice. Investments in bonds and debt securities are ' +
  'subject to market, credit, interest-rate, and liquidity risks, including possible ' +
  'loss of principal. Yields (YTM/YTC/YTP) are indicative, computed on the quoted price ' +
  'and assume the security is held to maturity/call; actual returns may differ. Ratings ' +
  'are assigned by third-party agencies and are subject to revision. Prices and ' +
  'availability are indicative and subject to change without notice. Please read all ' +
  'scheme/issue documents and consult your financial advisor before investing. ' +
  'Niyom Wealth Distribution LLP acts as a distributor.';
