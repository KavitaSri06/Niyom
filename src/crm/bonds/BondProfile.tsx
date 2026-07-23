// Bond profile — master fields + data-quality/verification status.
// Analytics (cashflow, accrued, YTM, duration) + schedules land in later phases.

import { ArrowLeft, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { bondKeys } from './bondClient';
import { BondPublic } from './bondTypes';

interface Props { bondId: string; isAdmin: boolean; onBack: () => void; }

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

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
const S = (v: unknown) => { const s = String(v ?? '').trim(); return s || '—'; };
const PCT = (v: number | null) => v === null || v === undefined ? '—' : `${Number(v).toFixed(4)}%`;
const NUM = (v: number | null) => v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: 4 });

export default function BondProfile({ bondId, onBack }: Props) {
  const { data: b, isLoading } = useBond(bondId);

  if (isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} /></div>;
  if (!b) return (
    <div className="text-center py-24">
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Bond not found.</p>
      <button onClick={onBack} className="mt-3 text-sm font-semibold" style={{ color: 'var(--accent)' }}>Back to master</button>
    </div>
  );

  const sections: { title: string; rows: [string, string][] }[] = [
    { title: 'General', rows: [
      ['Issuer', S(b.issuer_name)], ['ISIN', S(b.isin)], ['Series', S(b.series)],
      ['Security Description', S(b.security_description)], ['Security Type', S(b.security_type)],
      ['Seniority', S(b.seniority)], ['Secured', b.secured === null ? '—' : b.secured ? 'Secured' : 'Unsecured'],
      ['Tax Status', S(b.tax_status)], ['Listing', S(b.exchange_listed)], ['Status', S(b.listing_status)],
    ]},
    { title: 'Coupon & Redemption', rows: [
      ['Coupon Rate', PCT(b.coupon_rate)], ['Coupon Type', S(b.coupon_type)], ['Frequency', S(b.coupon_frequency)],
      ['Interest Payment Dates', S(b.interest_payment_dates)], ['Day Count', S(b.day_count_convention)],
      ['Business-Day Conv.', S(b.business_day_convention)], ['Issue Date', fmtDate(b.issue_date)],
      ['Maturity Date', fmtDate(b.maturity_date)], ['Redemption', S(b.principal_repayment_structure)],
      ['Face Value', NUM(b.face_value)], ['Redemption Value', NUM(b.redemption_value)],
    ]},
    { title: 'Rating & Trading', rows: [
      ['Rating', S(b.rating)], ['Rating Agency', S(b.rating_agency)], ['Rating Date', fmtDate(b.rating_date)],
      ['Min Investment', NUM(b.min_investment)], ['Lot Size', NUM(b.lot_size)], ['Currency', S(b.currency)],
      ['NSE Symbol', S(b.nse_symbol)], ['BSE Code', S(b.bse_code)],
    ]},
    { title: 'Pricing', rows: [
      ['Latest Price (per 100)', NUM(b.latest_price)], ['Price Updated', fmtDate(b.price_updated_at)],
      ['Selling Price', NUM(b.selling_price)],
    ]},
  ];

  const q = Math.round(b.data_quality_score);
  const qrgb = q >= 90 ? '16,185,129' : q >= 60 ? '245,158,11' : '239,68,68';

  return (
    <div className="space-y-5">
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

      {b.verification_status === 'pending' && (
        <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}>
          <span style={{ color: 'var(--text-secondary)' }}>This bond was just added from the price file. Master data is fetched automatically by the enrichment engine (next phase); analytics and schedules appear once it's verified.</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {sections.map(section => (
          <div key={section.title} className="rounded-2xl p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--accent)' }}>{section.title}</h2>
            <div className="space-y-2">
              {section.rows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4">
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>{k}</span>
                  <span className="text-sm font-medium text-right break-words max-w-[60%]" style={{ color: 'var(--text-primary)' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
