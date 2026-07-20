// Bond database — professional table with search, filters, sort, pagination, and
// a quick-view drawer. Admin sees the Landing Cost column + Upload/New actions;
// employees see the confidential-safe catalog.

import { useEffect, useMemo, useState } from 'react';
import {
  Search, SlidersHorizontal, Upload, Plus, Eye, ArrowUpDown, ChevronLeft,
  ChevronRight, Landmark, RefreshCw, X,
} from 'lucide-react';
import { NWEmployee } from '../types';
import { NWBond, NWBondCatalog } from './bondTypes';
import { BOND_STATUSES, bondStatusRgb } from './bondConstants';
import { isAdminRole, formatINR, formatPercent, formatDate, timeAgo, impliedMarginPercent } from './bondUtils';
import { listBonds } from './bondService';
import { Drawer } from '../leads/leadUi';

interface Props {
  employee: NWEmployee;
  refreshKey: number;
  onOpen: (id: string) => void;
  onUpload: () => void;
  onNew: () => void;
}

type SortKey = 'company_name' | 'coupon' | 'yield_ytm' | 'maturity_date' | 'rating' | 'updated_at' | 'selling_price';
type Bond = NWBond | NWBondCatalog;

const PAGE_SIZE = 20;

function BondStatusBadge({ status }: { status: string }) {
  const rgb = bondStatusRgb(status);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg font-semibold whitespace-nowrap text-[11px] px-2 py-0.5"
      style={{ background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`, border: `1px solid rgba(${rgb},0.3)` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${rgb})` }} />
      {status}
    </span>
  );
}

export default function BondList({ employee, refreshKey, onOpen, onUpload, onNew }: Props) {
  const isAdmin = isAdminRole(employee);
  const [bonds, setBonds] = useState<Bond[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [fStatus, setFStatus] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fRating, setFRating] = useState('');
  const [fFreq, setFFreq] = useState('');
  const [fMinCoupon, setFMinCoupon] = useState('');
  const [fMinYield, setFMinYield] = useState('');
  const [fTax, setFTax] = useState('');

  const [sortKey, setSortKey] = useState<SortKey>('updated_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [quick, setQuick] = useState<Bond | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listBonds(isAdmin, includeArchived).then(({ data, error }) => {
      if (cancelled) return;
      setBonds(data);
      setError(error);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [isAdmin, refreshKey, includeArchived]);

  const categories = useMemo(() => [...new Set(bonds.map(b => b.security_category).filter(Boolean))].sort(), [bonds]);
  const frequencies = useMemo(() => [...new Set(bonds.map(b => b.interest_frequency).filter(Boolean))].sort(), [bonds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = bonds.filter(b => {
      if (q) {
        const hay = `${b.company_name} ${b.bond_name} ${b.isin} ${b.issuer} ${b.rating}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (fStatus && b.status !== fStatus) return false;
      if (fCategory && b.security_category !== fCategory) return false;
      if (fRating && !b.rating.toLowerCase().includes(fRating.toLowerCase())) return false;
      if (fFreq && b.interest_frequency !== fFreq) return false;
      if (fTax && !b.tax_status.toLowerCase().includes(fTax.toLowerCase())) return false;
      if (fMinCoupon && (b.coupon ?? 0) < parseFloat(fMinCoupon)) return false;
      if (fMinYield && (b.yield_ytm ?? 0) < parseFloat(fMinYield)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey as keyof Bond] as unknown;
      const bv = b[sortKey as keyof Bond] as unknown;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return list;
  }, [bonds, search, fStatus, fCategory, fRating, fFreq, fTax, fMinCoupon, fMinYield, sortKey, sortDir]);

  useEffect(() => { setPage(1); }, [search, fStatus, fCategory, fRating, fFreq, fTax, fMinCoupon, fMinYield]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'company_name' || k === 'rating' ? 'asc' : 'desc'); }
  };

  const activeFilters = [fStatus, fCategory, fRating, fFreq, fTax, fMinCoupon, fMinYield].filter(Boolean).length;
  const clearFilters = () => { setFStatus(''); setFCategory(''); setFRating(''); setFFreq(''); setFTax(''); setFMinCoupon(''); setFMinYield(''); };

  const Th = ({ label, k, right }: { label: string; k?: SortKey; right?: boolean }) => (
    <th className={`px-3 py-2.5 text-xs font-bold uppercase tracking-wider ${right ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-faint)' }}>
      {k ? (
        <button onClick={() => toggleSort(k)} className={`inline-flex items-center gap-1 ${right ? 'flex-row-reverse' : ''}`} style={{ color: sortKey === k ? 'var(--accent)' : 'inherit' }}>
          {label}<ArrowUpDown className="w-3 h-3" />
        </button>
      ) : label}
    </th>
  );

  const inputStyle = { background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Bond Master Database</p>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Bond Creation</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>{filtered.length} bond{filtered.length === 1 ? '' : 's'}{includeArchived ? ' (incl. archived)' : ''}</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={onNew} className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <Plus className="w-4 h-4" /> New Bond
            </button>
            <button onClick={onUpload} className="px-4 py-2.5 rounded-xl text-sm font-bold text-on-accent flex items-center gap-2" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
              <Upload className="w-4 h-4" /> Upload Bond Sheet
            </button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, bond, ISIN, rating…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
        </div>
        <button onClick={() => setShowFilters(s => !s)} className="px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
          style={{ background: showFilters || activeFilters ? 'var(--accent)' : 'var(--bg-surface)', color: showFilters || activeFilters ? 'var(--text-on-accent)' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <SlidersHorizontal className="w-4 h-4" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
        <button onClick={() => setIncludeArchived(a => !a)} className="px-3 py-2.5 rounded-xl text-sm font-semibold" title="Toggle archived"
          style={{ background: includeArchived ? 'var(--accent)' : 'var(--bg-surface)', color: includeArchived ? 'var(--text-on-accent)' : 'var(--text-faint)', border: '1px solid var(--border)' }}>
          Archived
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="p-4 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="px-3 py-2 rounded-xl text-sm outline-none" style={inputStyle}>
            <option value="">All Availability</option>
            {BOND_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={fCategory} onChange={e => setFCategory(e.target.value)} className="px-3 py-2 rounded-xl text-sm outline-none" style={inputStyle}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={fFreq} onChange={e => setFFreq(e.target.value)} className="px-3 py-2 rounded-xl text-sm outline-none" style={inputStyle}>
            <option value="">All Interest Freq.</option>
            {frequencies.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input value={fRating} onChange={e => setFRating(e.target.value)} placeholder="Rating contains…" className="px-3 py-2 rounded-xl text-sm outline-none" style={inputStyle} />
          <input value={fMinCoupon} onChange={e => setFMinCoupon(e.target.value)} type="number" step="0.01" placeholder="Min coupon %" className="px-3 py-2 rounded-xl text-sm outline-none" style={inputStyle} />
          <input value={fMinYield} onChange={e => setFMinYield(e.target.value)} type="number" step="0.01" placeholder="Min yield %" className="px-3 py-2 rounded-xl text-sm outline-none" style={inputStyle} />
          <input value={fTax} onChange={e => setFTax(e.target.value)} placeholder="Tax status contains…" className="px-3 py-2 rounded-xl text-sm outline-none" style={inputStyle} />
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <Th label="Company" k="company_name" />
                <Th label="ISIN" />
                <Th label="Coupon" k="coupon" right />
                <Th label="Yield" k="yield_ytm" right />
                <Th label="Maturity" k="maturity_date" />
                <Th label="Rating" k="rating" />
                {isAdmin && <Th label="Landing" right />}
                <Th label="Selling" k="selling_price" right />
                {isAdmin && <Th label="Margin" right />}
                <Th label="Status" />
                <Th label="Updated" k="updated_at" />
                <Th label="" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-12"><RefreshCw className="w-5 h-5 animate-spin mx-auto" style={{ color: 'var(--accent)' }} /></td></tr>
              ) : error ? (
                <tr><td colSpan={12} className="text-center py-12 text-sm" style={{ color: 'var(--c-red, #ef4444)' }}>{error}</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-16">
                  <Landmark className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-faint)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No bonds found</p>
                  {isAdmin && <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>Upload a bond sheet to populate the database.</p>}
                </td></tr>
              ) : pageRows.map(b => {
                const admin = b as NWBond;
                const margin = isAdmin ? impliedMarginPercent(admin.landing_cost, b.selling_price) : null;
                return (
                  <tr key={b.id} className="crm-row-hover cursor-pointer" style={{ borderBottom: '1px solid var(--border-subtle)' }} onClick={() => onOpen(b.id)}>
                    <td className="px-3 py-2.5 max-w-[240px]">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{b.company_name || b.bond_name || '—'}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-faint)' }}>{b.bond_name}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{b.isin || '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-semibold" style={{ color: 'var(--text-primary)' }}>{formatPercent(b.coupon)}</td>
                    <td className="px-3 py-2.5 text-sm text-right font-semibold" style={{ color: 'var(--accent)' }}>{formatPercent(b.yield_ytm)}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{formatDate(b.maturity_date)}</td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{b.rating || '—'}</td>
                    {isAdmin && <td className="px-3 py-2.5 text-xs text-right" style={{ color: 'var(--text-faint)' }}>{formatINR(admin.landing_cost)}</td>}
                    <td className="px-3 py-2.5 text-sm text-right font-bold" style={{ color: 'var(--text-primary)' }}>{formatINR(b.selling_price)}</td>
                    {isAdmin && <td className="px-3 py-2.5 text-xs text-right" style={{ color: 'var(--text-faint)' }}>{margin !== null ? `${margin}%` : '—'}</td>}
                    <td className="px-3 py-2.5"><BondStatusBadge status={b.status} /></td>
                    <td className="px-3 py-2.5 text-xs" style={{ color: 'var(--text-faint)' }}>{timeAgo(b.updated_at)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={e => { e.stopPropagation(); setQuick(b); }} className="p-1.5 rounded-lg" title="Quick view" style={{ color: 'var(--text-faint)' }}>
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>Page {page} / {pageCount}</span>
              <button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Quick view */}
      <Drawer open={!!quick} onClose={() => setQuick(null)} title={quick?.company_name || 'Bond'} subtitle={quick?.bond_name} width="max-w-lg"
        footer={quick && <button onClick={() => { const id = quick.id; setQuick(null); onOpen(id); }} className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-on-accent" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>Open Full Details</button>}>
        {quick && (
          <div className="space-y-2">
            <Qv label="ISIN" value={quick.isin} mono />
            <Qv label="Coupon" value={formatPercent(quick.coupon)} />
            <Qv label="Yield (YTM)" value={formatPercent(quick.yield_ytm)} />
            <Qv label="Maturity" value={formatDate(quick.maturity_date)} />
            <Qv label="Rating" value={quick.rating} />
            <Qv label="Security Type" value={quick.security_type} />
            <Qv label="Category" value={quick.security_category} />
            <Qv label="Interest Frequency" value={quick.interest_frequency} />
            <Qv label="Min. Investment" value={quick.minimum_investment || quick.face_value_text} />
            <Qv label="Selling Price" value={formatINR(quick.selling_price)} />
            <Qv label="Status" value={quick.status} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Qv({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{label}</span>
      <span className={`text-sm font-semibold text-right ${mono ? 'font-mono' : ''}`} style={{ color: 'var(--text-primary)' }}>{value || '—'}</span>
    </div>
  );
}
