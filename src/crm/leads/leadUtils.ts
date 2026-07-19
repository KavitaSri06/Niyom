// Lead Management — presentation & formatting helpers (no side effects).

import { NWEmployee } from '../types';
import { LeadScoreBand } from './leadTypes';

export const isAdminRole = (e: Pick<NWEmployee, 'role'>): boolean =>
  e.role === 'admin' || e.role === 'super_admin';

// Indian currency, compact where large (₹1.2 Cr / ₹5.0 L / ₹80,000).
export function formatMoney(v: number | null | undefined): string {
  if (v == null || isNaN(v as number)) return '—';
  const n = Number(v);
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000)   return `₹${(n / 100000).toFixed(2)} L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

export const scoreBandRgb = (band: LeadScoreBand): string =>
  band === 'Hot' ? '239,68,68' : band === 'Warm' ? '249,115,22' : '148,163,184';

export function initials(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

// Absolute date/time for the CRM's en-IN locale.
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// "3d ago", "5h ago", "just now" — for timelines and SLA columns.
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

// Compact elapsed duration between two instants (SLA display), e.g. "2d 4h".
export function elapsed(fromIso: string | null | undefined, toIso?: string | null): string {
  if (!fromIso) return '—';
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  let s = Math.max(0, Math.round((to - new Date(fromIso).getTime()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600);  s -= h * 3600;
  const m = Math.floor(s / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// Human label for an audited field name (audit trail rendering).
const FIELD_LABELS: Record<string, string> = {
  lead_name: 'Lead Name', mobile: 'Mobile', alternate_number: 'Alternate Number',
  email: 'Email', pan: 'PAN', address: 'Address', city: 'City', state: 'State',
  occupation: 'Occupation', company_name: 'Company', age: 'Age',
  annual_income: 'Annual Income', investment_capacity: 'Investment Capacity',
  interested_product: 'Interested Product', lead_source: 'Lead Source', campaign: 'Campaign',
  priority: 'Priority', remarks: 'Remarks', status: 'Status',
  owner_employee_id: 'Lead Owner', is_locked: 'Locked', is_archived: 'Archived',
};
export const fieldLabel = (f: string): string => FIELD_LABELS[f] ?? f;

// Indian mobile: exactly 10 digits starting 6-9.
export const isValidMobile = (v: string): boolean => /^[6-9]\d{9}$/.test(v);
export const isValidEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export const isValidPan = (v: string): boolean => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v);
