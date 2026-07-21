// Bond detail screen — sectioned view of every field, an embedded margin
// calculator, "Generate Marketing PDF", and (admin) edit / status / archive /
// version history. Loads the full master for admins and the confidential-safe
// catalog for employees.

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, ImageDown, FileText, Megaphone, Pencil, Archive, ArchiveRestore, Loader2, History,
  RotateCcw, Trash2, ChevronDown, Minus, Plus, AlertTriangle,
} from 'lucide-react';
import { NWEmployee } from '../types';
import { NWBond, NWBondCatalog, NWBondVersion, BondStatus } from './bondTypes';
import { BOND_SECTIONS, BOND_STATUSES, bondStatusRgb } from './bondConstants';
import {
  isAdminRole, formatINR, formatINRFull, formatPercent, formatDate, timeAgo,
  bondMinInvestment, minUnitsFor, computeBondInvestment, inferFrequency,
} from './bondUtils';
import { buildCashflow, yieldFromPrice, CashflowInput } from './bondCashflow';
import {
  getBond, listVersions, restoreVersion, archiveBond, unarchiveBond, deleteBond, setStatus, logMarketingPdf,
} from './bondService';
import { generateMarketingImage, generateMarketingPdf } from './marketingPdf';
import { EmployeeContact } from './cashflowPdf';
import { generatePromoImage } from './promoImage';
import BondMarginCalculator, { MarginState } from './BondMarginCalculator';

interface Props {
  employee: NWEmployee;
  bondId: string;
  onBack: () => void;
  onEdit: (bond: NWBond) => void;
  onChanged: () => void;
  refreshKey: number;
}

export default function BondDetail({ employee, bondId, onBack, onEdit, onChanged, refreshKey }: Props) {
  const isAdmin = isAdminRole(employee);
  const [bond, setBond] = useState<NWBond | NWBondCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [margin, setMargin] = useState<MarginState>({ marginType: 'percent', marginValue: 2, sellingPrice: null });
  const [quantity, setQuantity] = useState<number>(1);
  const [generating, setGenerating] = useState<false | 'image' | 'pdf' | 'promo'>(false);
  const [versions, setVersions] = useState<NWBondVersion[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getBond(isAdmin, bondId).then(b => { if (!cancelled) { setBond(b); setLoading(false); } });
    return () => { cancelled = true; };
  }, [isAdmin, bondId, refreshKey]);

  // Existing (cost) price to mark up from: an explicit landing cost wins, else the
  // price the bond was imported with (Price Per 100). Admin only.
  const basePrice = isAdmin ? ((bond as NWBond)?.landing_cost ?? (bond as NWBond)?.purchase_price ?? null) : null;

  // Default the quantity to the minimum lot so a client is never quoted below the
  // minimum investment.
  const minInvestment = bond ? bondMinInvestment(bond.minimum_investment, bond.multiples, bond.face_value) : null;
  const minUnits = bond ? minUnitsFor(bond.face_value, minInvestment) : 1;
  useEffect(() => { setQuantity(minUnits); }, [minUnits, bondId]);

  const loadVersions = async () => {
    setVersions(await listVersions(bondId));
    setShowVersions(true);
  };

  // Relationship-manager contact printed on every client output.
  const contact: EmployeeContact = {
    name: employee.full_name, phone: employee.phone || undefined,
    email: employee.email || undefined, designation: employee.designation || undefined,
  };

  // Shared cashflow-engine input for the current price + quantity.
  const cfInput = (price: number | null): CashflowInput => ({
    faceValuePerUnit: bond?.face_value, coupon: bond?.coupon, maturityISO: bond?.maturity_date,
    frequencyHint: bond?.interest_frequency, ipDates: bond?.interest_payment_dates,
    redemptionText: bond?.maturity_text, quantity, cleanPricePer100: price,
  });


  const doGenerate = async (format: 'image' | 'pdf') => {
    if (!bond) return;
    setGenerating(format);
    try {
      const price = margin.sellingPrice ?? bond.selling_price ?? null;
      const cf = buildCashflow(cfInput(price));
      const opts = {
        sellingPrice: price, quantity, contact, generatedByName: employee.full_name,
        accruedInterest: cf.ok ? cf.accruedInterest : null,
        investmentAmount: cf.ok ? cf.investmentAmount : null,
        yieldAtPrice: yieldFromPrice({ ...cfInput(price), pricePer100: price }),
      };
      // marketingPdf only reads confidential-safe fields; NWBond is a superset.
      if (format === 'image') await generateMarketingImage(bond as NWBondCatalog, opts);
      else await generateMarketingPdf(bond as NWBondCatalog, opts);
      await logMarketingPdf(bondId, margin.marginType, margin.marginValue, price);
    } finally {
      setGenerating(false);
    }
  };

  const doPromo = async () => {
    if (!bond) return;
    setGenerating('promo');
    try {
      await generatePromoImage(bond as NWBondCatalog, { contact });
    } finally {
      setGenerating(false);
    }
  };

  const doStatus = async (s: BondStatus) => {
    setStatusOpen(false); setBusy(true);
    await setStatus(bondId, s);
    setBusy(false); onChanged();
  };
  const doArchive = async () => { setBusy(true); await archiveBond(bondId); setBusy(false); onChanged(); };
  const doUnarchive = async () => { setBusy(true); await unarchiveBond(bondId); setBusy(false); onChanged(); };
  const doDelete = async () => { setBusy(true); const err = await deleteBond(bondId); setBusy(false); if (!err) onBack(); };
  const doRestore = async (v: NWBondVersion) => {
    setBusy(true); await restoreVersion(bondId, v.snapshot); setBusy(false); setShowVersions(false); onChanged();
  };

  const sections = useMemo(() => BOND_SECTIONS.filter(s => !s.admin || isAdmin), [isAdmin]);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>;
  }
  if (!bond) {
    return (
      <div className="text-center py-24">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Bond not found or you don't have access.</p>
        <button onClick={onBack} className="mt-3 text-sm font-semibold" style={{ color: 'var(--accent)' }}>Back to database</button>
      </div>
    );
  }

  const rgb = bondStatusRgb(bond.status);
  const record = bond as unknown as Record<string, unknown>;

  const renderValue = (key: string, type?: string): string => {
    // Payout frequency is often blank in the sheet — infer it from the IP dates
    // so every bond shows a payout.
    if (key === 'interest_frequency') {
      return inferFrequency(bond.interest_frequency, bond.interest_payment_dates);
    }
    const v = record[key];
    if (v === null || v === undefined || v === '') return '';
    if (type === 'currency') return formatINR(v as number);
    if (type === 'percent') return formatPercent(v as number);
    if (type === 'date') return formatDate(v as string);
    return String(v);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft className="w-4 h-4" /> Bond database
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{bond.company_name || bond.bond_name || 'Bond'}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-lg font-semibold text-xs px-2.5 py-1"
              style={{ background: `rgba(${rgb},0.12)`, color: `rgb(${rgb})`, border: `1px solid rgba(${rgb},0.3)` }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(${rgb})` }} />{bond.status}
            </span>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>
            {bond.bond_name} · <span className="font-mono">{bond.bond_code}</span> · Updated {timeAgo(bond.updated_at)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              <div className="relative">
                <button onClick={() => setStatusOpen(o => !o)} disabled={busy} className="px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  Status <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {statusOpen && (
                  <div className="absolute right-0 top-12 z-30 w-44 rounded-xl overflow-hidden shadow-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                    {BOND_STATUSES.map(s => (
                      <button key={s} onClick={() => doStatus(s)} className="w-full text-left px-3 py-2 text-sm crm-row-hover" style={{ color: 'var(--text-secondary)' }}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => onEdit(bond as NWBond)} className="px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <Pencil className="w-4 h-4" /> Edit
              </button>
              <button onClick={loadVersions} className="px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <History className="w-4 h-4" /> History
              </button>
              {bond.is_archived
                ? <button onClick={doUnarchive} className="px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><ArchiveRestore className="w-4 h-4" /> Unarchive</button>
                : <button onClick={doArchive} className="px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Archive className="w-4 h-4" /> Archive</button>}
              <button onClick={() => setConfirmDelete(true)} className="crm-icon-danger p-2.5 rounded-xl" title="Delete bond" style={{ border: '1px solid var(--border)' }}><Trash2 className="w-4 h-4" /></button>
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Left: sections */}
        <div className="lg:col-span-2 space-y-5">
          {sections.map(section => {
            const rows = section.fields
              .map(fd => ({ fd, value: renderValue(fd.key, fd.type) }))
              .filter(r => r.value !== '');
            if (rows.length === 0) return null;
            return (
              <div key={section.title} className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: `1px solid ${section.admin ? 'rgba(245,158,11,0.4)' : 'var(--border)'}` }}>
                <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: section.admin ? 'rgb(245,158,11)' : 'var(--accent)' }}>{section.title}</h2>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {rows.map(({ fd, value }) => (
                    <div key={fd.key} className="flex flex-col">
                      <span className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-faint)' }}>{fd.label}</span>
                      <span className="text-sm font-medium break-words" style={{ color: 'var(--text-primary)' }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: pricing + quantity + output */}
        <div className="space-y-5">
          <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Client Pricing</span>
              {bond.selling_price != null && <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{formatINRFull(bond.selling_price)}<span className="text-[10px] font-medium" style={{ color: 'var(--text-faint)' }}> /₹100</span></span>}
            </div>
            <BondMarginCalculator bondId={bondId} isAdmin={isAdmin} basePrice={basePrice} defaultSellingPrice={bond.selling_price} onChange={setMargin} />

            {/* Quantity → precise investment (incl. accrued interest) */}
            {(() => {
              const per100 = margin.sellingPrice ?? bond.selling_price ?? null;
              const inv = computeBondInvestment({ faceValue: bond.face_value, sellingPricePer100: per100, coupon: bond.coupon, quantity });
              const cf = buildCashflow(cfInput(per100));
              const exactInvestment = cf.ok ? cf.investmentAmount : inv.investmentAmount;
              const adjYield = yieldFromPrice({ ...cfInput(per100), pricePer100: per100 }) ?? bond.yield_ytm;
              const belowMin = bond.face_value != null && minInvestment != null && quantity * bond.face_value < minInvestment;
              const stat = (label: string, value: string, sub?: string) => (
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{label}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{value}</span>
                  {sub && <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{sub}</span>}
                </div>
              );
              return (
                <div className="mt-4 rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Quantity (units)</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>Min {minUnits.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <button onClick={() => setQuantity(q => Math.max(minUnits, q - 1))} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Minus className="w-4 h-4" /></button>
                    <input type="number" min={1} value={quantity}
                      onChange={e => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm text-center font-bold outline-none"
                      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                    <button onClick={() => setQuantity(q => q + 1)} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Plus className="w-4 h-4" /></button>
                  </div>
                  {belowMin && (
                    <div className="flex items-start gap-1.5 mb-3 text-[11px] px-2.5 py-2 rounded-lg" style={{ background: 'rgba(245,158,11,0.12)', color: 'rgb(180,120,10)', border: '1px solid rgba(245,158,11,0.3)' }}>
                      <AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />
                      <span>Below the minimum investment of {formatINR(minInvestment)}. Increase the quantity to at least {minUnits.toLocaleString('en-IN')} units.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {stat('Total Investment', exactInvestment !== null ? formatINRFull(exactInvestment) : '—',
                      cf.ok && cf.accruedInterest > 0 ? `incl. ${formatINRFull(cf.accruedInterest)} accrued`
                        : cf.ok && cf.exInterest ? `ex-interest · −${formatINRFull(Math.abs(cf.accruedInterest))} rebate`
                        : (inv.pricePerUnit !== null ? `${formatINRFull(inv.pricePerUnit)}/unit` : undefined))}
                    {stat('Annual Income', inv.annualIncome !== null ? formatINRFull(inv.annualIncome) : '—', bond.coupon !== null ? `at ${formatPercent(bond.coupon)}` : undefined)}
                    {stat('Face Value', inv.faceValueAmount !== null ? formatINR(inv.faceValueAmount) : (bond.face_value_text || '—'))}
                    {stat('Yield at this price', formatPercent(adjYield), bond.yield_ytm !== null && adjYield !== null && Math.abs((adjYield ?? 0) - bond.yield_ytm) >= 0.01 ? `sheet ${formatPercent(bond.yield_ytm)}` : undefined)}
                  </div>
                </div>
              );
            })()}

            <div className="grid grid-cols-3 gap-2 mt-4">
              <button onClick={() => doGenerate('image')} disabled={!!generating} className="col-span-2 px-4 py-3 rounded-xl text-sm font-bold text-on-accent disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
                {generating === 'image' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />}
                {generating === 'image' ? 'Generating…' : 'Marketing Image'}
              </button>
              <button onClick={() => doGenerate('pdf')} disabled={!!generating} title="Download brochure as PDF instead" className="px-3 py-3 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {generating === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                PDF
              </button>
            </div>
            <div className="mt-2">
              <button onClick={doPromo} disabled={!!generating} title="Promotional image — core details only, no price" className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                {generating === 'promo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                Promo Image
              </button>
            </div>
            <p className="text-[11px] mt-2 text-center" style={{ color: 'var(--text-faint)' }}>Client-facing — landing cost is never included. Figures indicative.</p>
          </div>

          {bond.needs_review && (
            <div className="rounded-2xl p-4 text-xs" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>This bond was flagged for review during extraction (confidence {Math.round(bond.ocr_confidence)}%). Please verify the details{isAdmin ? ' and edit as needed.' : '.'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Version history */}
      {showVersions && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'var(--bg-overlay)' }} onClick={() => setShowVersions(false)} />
          <div className="relative w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Version History</h3>
              <button onClick={() => setShowVersions(false)} style={{ color: 'var(--text-faint)' }}>✕</button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {versions.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text-faint)' }}>No previous versions yet. Edits create a new version.</p>
              ) : versions.map(v => (
                <div key={v.id} className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Version {v.version_no}</p>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{v.changed_by_employee?.full_name || 'System'} · {formatDate(v.created_at)}</p>
                  </div>
                  <button onClick={() => doRestore(v)} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0" style={{ background: 'var(--bg-overlay)' }} onClick={() => setConfirmDelete(false)} />
          <div className="relative w-full max-w-sm rounded-2xl shadow-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Delete this bond?</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text-faint)' }}>This permanently removes {bond.bond_code} and its history. Consider archiving instead.</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
              <button onClick={doDelete} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: 'rgb(239,68,68)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
