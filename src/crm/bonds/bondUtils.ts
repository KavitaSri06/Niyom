// Bond Creation module — pure helpers: role check, formatters, INR-text parsing,
// coupon/date normalization, and the ADMIN-side selling-price calculation.
// (Employees never compute selling price locally — they call the RPC in
// bondService, so landing_cost never reaches their browser.)

import { NWEmployee } from '../types';
import { MarginType } from './bondTypes';

export function isAdminRole(emp: NWEmployee): boolean {
  return emp.role === 'admin' || emp.role === 'super_admin';
}

// ₹ formatter matching the CRM's fmt() (Cr / L / plain).
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

// Full-precision rupee (used for selling price where exactness matters).
export function formatINRFull(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatPercent(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v.toFixed(2)}%`;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(d: string): string {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(d);
}

// Parse an Indian text amount like "1 LACS", "10 LAC", "1 CR", "40 LACS",
// "10000" into an absolute number of rupees/units. Returns null if unclear.
export function parseIndianAmount(text: string | number | null | undefined): number | null {
  if (text === null || text === undefined || text === '') return null;
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  const s = String(text).toLowerCase().replace(/,/g, ' ').trim();
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;
  const n = parseFloat(numMatch[1]);
  if (Number.isNaN(n)) return null;
  if (/\bcr\b|crore/.test(s)) return n * 1_00_00_000;
  if (/\blac|\blakh|\blakhs|\blacs?\b/.test(s)) return n * 1_00_000;
  return n;
}

// A coupon/yield in the source may be a fraction (0.087) or a percent (8.7).
// Normalize to a PERCENT number (8.70). Values <= 1 are treated as fractions.
export function normalizeRateToPercent(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace('%', '').trim());
  if (Number.isNaN(n)) return null;
  return n <= 1 ? +(n * 100).toFixed(4) : +n.toFixed(4);
}

// Excel stores dates as serial numbers (days since 1899-12-30). Convert a serial
// (or a dd-mm-yyyy / dd-Mon-yy style string) into an ISO date string, or null.
export function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = 1970-01-01 in Excel serial
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// Best-effort parse of the leading date out of a maturity string such as
// "14-03-2036 (25% PARTIAL REDEMPTION...)" or "05-Jun-29 / (...)". Keeps only
// the first date token; the full original text is preserved separately.
export function parseLeadingDateToISO(text: string): string | null {
  if (!text) return null;
  const s = text.trim();
  // dd-mm-yyyy or dd/mm/yyyy
  let m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // dd-Mon-yy / dd-Mon-yyyy
  m = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,4})[-/\s](\d{2,4})/);
  if (m) {
    const d = m[1];
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon === undefined) return null;
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${String(mon + 1).padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

// ADMIN-only: compute selling price from landing cost + margin (has the cost).
export function computeSellingPrice(
  landingCost: number | null,
  marginType: MarginType,
  marginValue: number | null,
): number | null {
  if (landingCost === null || landingCost === undefined) return null;
  const mv = marginValue ?? 0;
  switch (marginType) {
    case 'percent': return +(landingCost * (1 + mv / 100)).toFixed(2);
    case 'flat':    return +(landingCost + mv).toFixed(2);
    case 'manual':  return mv > 0 ? +mv.toFixed(2) : null;
    default:        return +landingCost.toFixed(2);
  }
}

// Effective margin % implied by a selling price vs landing cost (admin display).
export function impliedMarginPercent(landingCost: number | null, sellingPrice: number | null): number | null {
  if (!landingCost || !sellingPrice) return null;
  return +(((sellingPrice - landingCost) / landingCost) * 100).toFixed(2);
}
