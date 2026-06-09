import { ProductType } from './types';

export function fmt(amount: number): string {
  if (!amount && amount !== 0) return '₹0';
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
  return `${sign}₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function fmtFull(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function fmtDate(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeAgo(d: string): string {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(d);
}

export const PRODUCT_LABELS: Record<ProductType, string> = {
  unlisted_share: 'Unlisted Share',
  secondary_bond: 'Secondary Bond',
  primary_bond: 'Primary Bond',
  mutual_fund: 'Mutual Fund',
  fixed_deposit: 'Fixed Deposit',
  insurance: 'Insurance',
};

export const PRODUCT_COLORS: Record<ProductType, string> = {
  unlisted_share: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  secondary_bond: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  primary_bond: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  mutual_fund: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
  fixed_deposit: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  insurance: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
};

export const PRODUCT_CHART_COLORS: Record<ProductType, string> = {
  unlisted_share: '#F59E0B',
  secondary_bond: '#10B981',
  primary_bond: '#3B82F6',
  mutual_fund: '#EC4899',
  fixed_deposit: '#06B6D4',
  insurance: '#F97316',
};

// Products where qty × price = consolidated_amount
export const AUTO_CALC_PRODUCTS: ProductType[] = ['unlisted_share', 'secondary_bond', 'primary_bond', 'mutual_fund'];

export const TXN_LABELS: Record<string, string> = {
  buy: 'Buy',
  sell: 'Sell',
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
};

export const TXN_COLORS: Record<string, string> = {
  buy: 'text-emerald-400 bg-emerald-400/10',
  sell: 'text-red-400 bg-red-400/10',
  transfer_in: 'text-blue-400 bg-blue-400/10',
  transfer_out: 'text-orange-400 bg-orange-400/10',
};

export const VERIFICATION_LABELS: Record<string, string> = {
  pending: 'Pending',
  partial: 'Partial',
  verified: 'Verified',
  rejected: 'Rejected',
};

export const VERIFICATION_COLORS: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  partial: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  verified: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
};
