// Bond profile — master fields + internally-computed analytics + cashflow
// schedule. Pending bonds can be mastered on demand.

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Sparkles, Percent, ImageDown, ReceiptText, Megaphone, Minus, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { NWEmployee } from '../types';
import { bondKeys, useEnrichOne, useSaveMargin } from './bondClient';
import { BondPublic, CashflowScheduleRow } from './bondTypes';
import { EmployeeContact } from './bondConstants';
import { generateCashflowPdf, generateMarketingImage, generatePromoImage } from './bondOutputs';

interface Props { bondId: string; isAdmin: boolean; employee: NWEmployee; onBack: () => void; }

function useBond(id: string) {
  return useQuery({
    queryKey: bondKeys.detail(id),
    queryFn: async (): Promise<BondPublic | null> => {
      const { data, error } = await supabase.from('bm_bonds_public').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return (data as unknown as BondPublic) ?? null;
    },
  });
}
function useCashflow(id: string, ready: boolean) {
  return useQuery({
    queryKey: ['bm_cashflow', id],
    enabled: ready,
    queryFn: async (): Promise<CashflowScheduleRow[]> => {
      const { data, error } = await supabase.from('bm_cashflow_schedule').select('seq,cf_date,interest_per_100,principal_per_100,total_per_100,remark').eq('bond_id', id).order('seq');
      if (error) throw error;
      return (data as CashflowScheduleRow[]) ?? [];
    },
  });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
const S = (v: unknown) => { const s = String(v ?? '').trim(); return s || '—'; };
const PCT = (v: number | null | undefined) => v === null || v === undefined ? '—' : `${Number(v).toFixed(4)}%`;
const NUM = (v: number | null | undefined) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });

export default function BondProfile({ bondId, isAdmin, employee, onBack }: Props) {
  const { data: b, isLoading, refetch } = useBond(bondId);
  const enrichMut = useEnrichOne();
  const saveMargin = useSaveMargin();
  const ready = !!b && (b.verification_status === 'verified' || b.verification_status === 'needs_review');
  const { data: cashflow = [] } = useCashflow(bondId, ready);

  const [markup, setMarkup] = useState(2);
  const [qty, setQty] = useState(1);
  const [gen, setGen] = useState<false | 'cashflow' | 'image' | 'promo'>(false);

  const contact: EmployeeContact = { name: employee.full_name, phone: employee.phone || undefined, email: employee.email || undefined, designation: employee.designation || undefined };
  const basePrice = b?.latest_price ?? null;
  const sellingPrice = basePrice !== null ? +(basePrice * (1 + markup / 100)).toFixed(4) : (b?.selling_price ?? null);

  // Default the quantity to the minimum lot.
  useEffect(() => {
    if (b?.min_investment && b?.face_value) setQty(Math.max(1, Math.ceil(Number(b.min_investment) / Number(b.face_value))));
  }, [b?.id]);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>;
  if (!b) return (
    <div className="text-center py-24">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Bond not found.</p>
      <button onClick={onBack} className="mt-3 text-sm font-semibold" style={{ color: 'var(--accent)' }}>Back to master</button>
    </div>
  );

  const a = b.analytics;
  const notMastered = b.verification_status === 'pending' || b.verification_status === 'failed';
  const doEnrich = async () => { await enrichMut.mutateAsync(b.isin); await refetch(); };
  const outputPrice = isAdmin ? sellingPrice : (b.selling_price ?? b.latest_price ?? null);
  const doOutput = async (kind: 'cashflow' | 'image' | 'promo') => {
    setGen(kind);
    try {
      const opts = { contact, quantity: qty, sellingPricePer100: outputPrice };
      if (kind === 'cashflow') await generateCashflowPdf(b, a, cashflow, opts);
      else if (kind === 'image') await generateMarketingImage(b, a, opts);
      else await generatePromoImage(b, opts);
    } finally { setGen(false); }
  };
  const doSaveMargin = async () => { if (sellingPrice === null) return; await saveMargin.mutateAsync({ id: b.id, marginValue: markup, sellingPrice }); await refetch(); };
  const faceAmt = b.face_value ? b.face_value * qty : null;
  const perUnit = (b.face_value && outputPrice) ? +(b.face_value * outputPrice / 100).toFixed(2) : null;
  const investAmt = perUnit ? +(perUnit * qty).toFixed(2) : null;

  const q = Math.round(b.data_quality_score);
  const qrgb = q >= 90 ? '16,185,129' : q >= 60 ? '245,158,11' : '239,68,68';

  const master: { title: string; rows: [string, string][] }[] = [
    { title: 'General', rows: [
      ['Issuer', S(b.issuer_name)], ['ISIN', S(b.isin)], ['Security Type', S(b.security_type)],
      ['Seniority', S(b.seniority)], ['Secured', b.secured === null ? '—' : b.secured ? 'Secured' : 'Unsecured'],
      ['Tax Status', S(b.tax_status)], ['Trustee', S(b.trustee)], ['Listing', S(b.exchange_listed)],
    ]},
    { title: 'Coupon & Redemption', rows: [
      ['Coupon Rate', PCT(b.coupon_rate)], ['Coupon Type', S(b.coupon_type)], ['Frequency', S(b.coupon_frequency).replace('_', '-')],
      ['Interest Payment Dates', S(b.interest_payment_dates)], ['Next Coupon', fmtDate(b.next_coupon_date)],
      ['Day Count', S(b.day_count_convention)], ['Business-Day', S(b.business_day_convention)],
      ['Issue Date', fmtDate(b.issue_date)], ['Maturity', fmtDate(b.maturity_date)],
      ['Redemption', S(b.principal_repayment_structure)], ['Face Value', NUM(b.face_value)],
    ]},
    { title: 'Rating', rows: [
      ['Rating', S(b.rating)], ['Agency', S(b.rating_agency)], ['Rating Date', fmtDate(b.rating_date)],
    ]},
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft className="w-4 h-4" /> Bond master
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{b.bond_name || b.issuer_name || b.isin}</h1>
            <span className="text-[11px] px-2 py-0.5 rounded-lg font-bold" style={{ background: `rgba(${qrgb},0.12)`, color: `rgb(${qrgb})` }}>Data quality {q}%</span>
            <span className="text-[11px] px-2 py-0.5 rounded-lg font-semibold capitalize" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>{b.verification_status.replace('_', ' ')}</span>
          </div>
          <p className="text-sm mt-1 font-mono" style={{ color: 'var(--text-faint)' }}>{b.isin}</p>
        </div>
        {notMastered && (
          <button onClick={doEnrich} disabled={enrichMut.isPending} className="px-4 py-2.5 rounded-xl text-sm font-bold text-on-accent disabled:opacity-50 flex items-center gap-2" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
            {enrichMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {enrichMut.isPending ? 'Mastering…' : 'Master this bond'}
          </button>
        )}
      </div>

      {notMastered && !enrichMut.isPending && (
        <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Only name + price are known so far. Click “Master this bond” to fetch the full master and compute analytics.</span>
        </div>
      )}

      {/* Analytics */}
      {a && a.ok && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>Analytics (computed) · settlement {fmtDate(a.settlement_date)}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              ['YTM', PCT(a.ytm)], ['Current Yield', PCT(a.current_yield)],
              ['Clean Price', NUM(a.clean_price)], ['Dirty Price', NUM(a.dirty_price)],
              ['Accrued /100', NUM(a.accrued_per_100)], ['Modified Duration', NUM(a.modified_duration)],
              ['Macaulay Duration', NUM(a.macaulay_duration)], ['Years to Maturity', NUM(a.years_to_maturity)],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{k}</p>
                <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{v}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-3" style={{ color: 'var(--text-faint)' }}>Indicative, computed internally from the verified master (Actual/365 unless noted). {a.assumed_bullet ? 'Bullet redemption.' : 'Amortizing redemption.'}</p>
        </div>
      )}

      {/* Client pricing, quantity & outputs */}
      {ready && (
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>Client Pricing &amp; Outputs</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {/* Pricing (admin sets markup; employee sees selling price) */}
            <div>
              {isAdmin ? (
                <>
                  <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-faint)' }}>Existing Price /100</span><span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{NUM(basePrice)}</span></div>
                  <label className="block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-faint)' }}>% Increase</label>
                  <div className="relative mb-2">
                    <Percent className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }} />
                    <input type="number" step="0.01" value={markup} onChange={e => setMarkup(parseFloat(e.target.value) || 0)} className="w-full pl-8 pr-2 py-2 rounded-lg text-sm outline-none" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 rounded-lg mb-2" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}><span className="text-[10px] uppercase tracking-wider font-bold text-on-accent" style={{ opacity: 0.9 }}>Selling /100</span><span className="text-sm font-extrabold text-on-accent">{NUM(sellingPrice)}</span></div>
                  <button onClick={doSaveMargin} disabled={saveMargin.isPending} className="w-full text-xs font-semibold py-1.5 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{saveMargin.isPending ? 'Saving…' : 'Save selling price'}</button>
                </>
              ) : (
                <><span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-faint)' }}>Selling Price /100</span><p className="text-2xl font-extrabold mt-1" style={{ color: 'var(--text-primary)' }}>{NUM(b.selling_price ?? b.latest_price)}</p></>
              )}
            </div>
            {/* Quantity → investment */}
            <div>
              <div className="flex items-center justify-between mb-2"><span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-faint)' }}>Quantity (units)</span></div>
              <div className="flex items-center gap-2 mb-3">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Minus className="w-3.5 h-3.5" /></button>
                <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} className="flex-1 min-w-0 px-2 py-2 rounded-lg text-sm text-center font-bold outline-none" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
                <button onClick={() => setQty(q => q + 1)} className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}><Plus className="w-3.5 h-3.5" /></button>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span style={{ color: 'var(--text-faint)' }}>Face value</span><span style={{ color: 'var(--text-primary)' }}>{faceAmt ? `₹${faceAmt.toLocaleString('en-IN')}` : '—'}</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-faint)' }}>Investment</span><span className="font-bold" style={{ color: 'var(--text-primary)' }}>{investAmt ? `₹${investAmt.toLocaleString('en-IN')}` : '—'}</span></div>
                <div className="flex justify-between"><span style={{ color: 'var(--text-faint)' }}>Annual income</span><span style={{ color: 'var(--text-primary)' }}>{(b.coupon_rate && faceAmt) ? `₹${(faceAmt * b.coupon_rate / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—'}</span></div>
              </div>
            </div>
            {/* Outputs */}
            <div className="flex flex-col gap-2 justify-center">
              <button onClick={() => doOutput('image')} disabled={!!gen} className="px-3 py-2.5 rounded-xl text-sm font-bold text-on-accent disabled:opacity-50 flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>{gen === 'image' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageDown className="w-4 h-4" />} Marketing Image</button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => doOutput('promo')} disabled={!!gen} className="px-3 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{gen === 'promo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Promo</button>
                <button onClick={() => doOutput('cashflow')} disabled={!!gen || cashflow.length === 0} className="px-3 py-2.5 rounded-xl text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{gen === 'cashflow' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />} Cashflow</button>
              </div>
              <p className="text-[10px] text-center" style={{ color: 'var(--text-faint)' }}>Client-facing — no internal cost shown.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-5">
        {master.map(section => (
          <div key={section.title} className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>{section.title}</h2>
            <div className="space-y-2">
              {section.rows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4">
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{k}</span>
                  <span className="text-sm font-medium text-right break-words max-w-[62%]" style={{ color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Cashflow schedule */}
      {cashflow.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--accent)' }}>Cash Flow Schedule (per ₹100 face)</h2>
          </div>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: 'var(--bg-surface)' }}>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['#', 'Date', 'Interest', 'Principal', 'Total', 'Remark'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cashflow.map(r => (
                  <tr key={r.seq} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-1.5" style={{ color: 'var(--text-faint)' }}>{r.seq}</td>
                    <td className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>{fmtDate(r.cf_date)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-secondary)' }}>{NUM(r.interest_per_100)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: 'var(--text-secondary)' }}>{r.principal_per_100 > 0 ? NUM(r.principal_per_100) : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--text-primary)' }}>{NUM(r.total_per_100)}</td>
                    <td className="px-3 py-1.5" style={{ color: 'var(--text-faint)' }}>{r.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
