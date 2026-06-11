import React, { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWHolding, NWClient, NWDSA } from './types';
import { fmt, PRODUCT_LABELS } from './utils';
import { Wallet, Download, ChevronDown } from 'lucide-react';

interface Props { employee: NWEmployee; }

interface PayoutRow {
  dsa_id: string;
  dsa_code: string;
  dsa_name: string;
  client_id: string;
  client_name: string;
  client_code: string;
  product_type: string;
  product_name: string;
  quantity: number;
  dsa_price: number;
  client_price: number;
  payout: number;
}

interface DSAGroup {
  dsa_id: string;
  dsa_code: string;
  dsa_name: string;
  rows: PayoutRow[];
  total: number;
}

const DSA_PRICE_TYPES = ['unlisted_share', 'secondary_bond', 'primary_bond'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function DSAPayout({ employee }: Props) {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [groups, setGroups] = useState<DSAGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [empList, setEmpList] = useState<{ id: string; full_name: string; employee_code: string }[]>([]);
  const [empFilter, setEmpFilter] = useState('all');

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  React.useEffect(() => {
    if (!isAdmin) return;
    supabase.from('nw_employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name')
      .then(({ data }) => setEmpList((data as any[]) || []));
  }, [isAdmin]);

  function getLastDay(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(getLastDay(selectedYear, selectedMonth)).padStart(2, '0')}`;

  const calculate = useCallback(async () => {
    setLoading(true);

    // Fetch clients with DSA mapping
    let clientQuery = supabase
      .from('nw_clients')
      .select('id, full_name, client_code, employee_id, sourced_via, dsa_id, dsa:nw_dsa(id, dsa_code, full_name)')
      .eq('sourced_via', 'dsa');
    if (!isAdmin) clientQuery = clientQuery.eq('employee_id', employee.id);
    else if (empFilter !== 'all') clientQuery = clientQuery.eq('employee_id', empFilter);
    const { data: clientData } = await clientQuery;
    const dsaClients = (clientData as (NWClient & { dsa: NWDSA })[]) || [];

    if (dsaClients.length === 0) { setGroups([]); setLoading(false); setHasLoaded(true); return; }

    const clientIds = dsaClients.map(c => c.id);

    // Fetch holdings created within the selected month for DSA applicable product types
    const { data: holdingData } = await supabase
      .from('nw_holdings')
      .select('*')
      .in('client_id', clientIds)
      .in('product_type', DSA_PRICE_TYPES);

    const holdings = (holdingData as NWHolding[]) || [];

    const rows: PayoutRow[] = [];

    for (const h of holdings) {
      const createdAt = h.created_at ? h.created_at.split('T')[0] : '';
      if (createdAt < startDate || createdAt > endDate) continue;

      const dsaPrice = h.dsa_price;
      const clientPrice = h.client_price;
      if (dsaPrice == null || clientPrice == null) continue;

      const qty = h.quantity || 0;
      const payout = (clientPrice - dsaPrice) * qty;

      const client = dsaClients.find(c => c.id === h.client_id);
      if (!client || !client.dsa) continue;

      rows.push({
        dsa_id: client.dsa.id,
        dsa_code: client.dsa.dsa_code,
        dsa_name: client.dsa.full_name,
        client_id: client.id,
        client_name: client.full_name,
        client_code: client.client_code,
        product_type: h.product_type,
        product_name: h.product_name,
        quantity: qty,
        dsa_price: dsaPrice,
        client_price: clientPrice,
        payout,
      });
    }

    // Group by DSA
    const dsaMap = new Map<string, DSAGroup>();
    for (const r of rows) {
      if (!dsaMap.has(r.dsa_id)) {
        dsaMap.set(r.dsa_id, {
          dsa_id: r.dsa_id,
          dsa_code: r.dsa_code,
          dsa_name: r.dsa_name,
          rows: [],
          total: 0,
        });
      }
      const g = dsaMap.get(r.dsa_id)!;
      g.rows.push(r);
      g.total += r.payout;
    }

    setGroups(Array.from(dsaMap.values()));
    setLoading(false);
    setHasLoaded(true);
  }, [selectedYear, selectedMonth, empFilter, isAdmin, employee.id, startDate, endDate]);

  const totalPayout = groups.reduce((s, g) => s + g.total, 0);

  const printPayout = () => {
    const groupsHtml = groups.map(g => {
      const rowsHtml = g.rows.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${r.client_name}</strong><br><span style="color:#888;font-size:11px">${r.client_code}</span></td>
          <td>${PRODUCT_LABELS[r.product_type] || r.product_type}</td>
          <td>${r.product_name}</td>
          <td style="text-align:right">${r.quantity.toLocaleString('en-IN')}</td>
          <td style="text-align:right">&#8377;${r.dsa_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td style="text-align:right">&#8377;${r.client_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
          <td style="text-align:right;font-weight:700;color:${r.payout >= 0 ? '#059669' : '#DC2626'}">
            ${r.payout >= 0 ? '' : '-'}&#8377;${Math.abs(r.payout).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </td>
        </tr>`).join('');

      return `
        <div style="margin-bottom:24px">
          <div style="background:#f5f5f5;padding:10px 14px;border-left:4px solid #D4AF37;margin-bottom:0;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-weight:800;font-size:13px">${g.dsa_name} <span style="font-weight:400;color:#888">(${g.dsa_code})</span></span>
            <span style="font-weight:800;font-size:14px;color:#059669">&#8377;${g.total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
          </div>
          <table>
            <thead><tr><th>#</th><th>Client</th><th>Product Type</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">DSA Price</th><th style="text-align:right">Client Price</th><th style="text-align:right">Payout</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>DSA Payout — ${MONTHS[selectedMonth]} ${selectedYear}</title>
  <style>
    @page { margin: 18mm 14mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
    .header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #D4AF37; padding-bottom:12px; margin-bottom:20px; }
    .stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:20px; }
    .stat { background:#f8f8f8; border-radius:6px; padding:10px 12px; border-top:3px solid #eee; }
    .stat-label { font-size:9px; color:#999; text-transform:uppercase; letter-spacing:0.08em; }
    .stat-value { font-size:16px; font-weight:800; margin-top:3px; }
    table { width:100%; border-collapse:collapse; margin-bottom:0; }
    th { background:#f2f2f2; padding:7px 9px; text-align:left; font-size:10px; text-transform:uppercase; color:#777; border-bottom:1px solid #e0e0e0; }
    td { padding:7px 9px; border-bottom:1px solid #f0f0f0; font-size:11px; vertical-align:top; }
    .footer { margin-top:28px; text-align:center; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-weight:900;font-size:22px;color:#111;font-family:Georgia,serif;">Niyom Wealth</div>
      <div style="font-size:11px;color:#888">DSA Payout Report &nbsp;&middot;&nbsp; ${MONTHS[selectedMonth]} ${selectedYear} &nbsp;&middot;&nbsp; ${startDate} to ${endDate}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:22px;font-weight:800;color:#059669">&#8377;${totalPayout.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
      <div style="font-size:10px;color:#888">Total Payout</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat" style="border-top-color:#059669"><div class="stat-label">Total Payout</div><div class="stat-value" style="color:#059669">&#8377;${totalPayout.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div></div>
    <div class="stat" style="border-top-color:#D4AF37"><div class="stat-label">DSAs Involved</div><div class="stat-value">${groups.length}</div></div>
    <div class="stat" style="border-top-color:#6B7280"><div class="stat-label">Total Transactions</div><div class="stat-value">${groups.reduce((s, g) => s + g.rows.length, 0)}</div></div>
  </div>
  ${groupsHtml || '<p style="text-align:center;color:#aaa;padding:20px">No DSA payout entries for this period</p>'}
  <div class="footer">Niyom Wealth Distribution &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; Generated ${new Date().toLocaleString('en-IN')}</div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#D4AF37' }}>DSA</p>
          <h1 className="text-2xl font-bold text-white">DSA Payout</h1>
          <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>Automated payout based on client price − DSA price × quantity</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasLoaded && groups.length > 0 && (
            <button onClick={printPayout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
              <Download className="w-4 h-4" /> Download PDF
            </button>
          )}
          <button onClick={calculate} disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
            <Wallet className="w-4 h-4" />
            {loading ? 'Calculating...' : 'Calculate Payout'}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="rounded-2xl p-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6B6B6B' }}>Select Period</p>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && (
            <div className="relative">
              <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
                className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                style={{ background: '#050505', border: '1px solid rgba(212,175,55,0.4)' }}>
                <option value="all">All Employees</option>
                {empList.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#D4AF37' }} />
            </div>
          )}
          <div className="relative">
            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
              style={{ background: '#050505', border: '1px solid #1E1E24' }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#4A4A4A' }} />
          </div>
          <div className="relative">
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
              style={{ background: '#050505', border: '1px solid #1E1E24' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#4A4A4A' }} />
          </div>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
            {startDate} &rarr; {endDate}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {hasLoaded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Total Payout', value: fmt(totalPayout), color: '#10B981' },
            { label: 'DSAs Involved', value: String(groups.length), color: '#D4AF37' },
            { label: 'Total Entries', value: String(groups.reduce((s, g) => s + g.rows.length, 0)), color: '#8A8A8A' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4A4A4A' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* DSA Groups */}
      {hasLoaded && (
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <Wallet className="w-10 h-10 mx-auto mb-3" style={{ color: '#2A2A2A' }} />
              <p className="text-sm font-semibold" style={{ color: '#4A4A4A' }}>No DSA payout entries for {MONTHS[selectedMonth]} {selectedYear}</p>
              <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>DSA payouts are generated from holdings added in the selected period with DSA pricing</p>
            </div>
          ) : groups.map(g => (
            <div key={g.dsa_id} className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'rgba(212,175,55,0.04)', borderBottom: '1px solid #1E1E24' }}>
                <div>
                  <p className="text-sm font-bold text-white">{g.dsa_name}</p>
                  <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{g.dsa_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: '#4A4A4A' }}>Total Payout</p>
                  <p className="text-lg font-bold text-emerald-400">{fmt(g.total)}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                      {['Client', 'Product', 'Qty', 'DSA Price', 'Client Price', 'Payout'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A4A4A' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #111' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#0D0D0D')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-white">{r.client_name}</p>
                          <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{r.client_code}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm text-white">{r.product_name}</p>
                          <p className="text-xs" style={{ color: '#6B6B6B' }}>{PRODUCT_LABELS[r.product_type]}</p>
                        </td>
                        <td className="px-5 py-3 text-sm text-white">{r.quantity.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm text-white">{fmt(r.dsa_price)}</td>
                        <td className="px-5 py-3 text-sm text-white">{fmt(r.client_price)}</td>
                        <td className="px-5 py-3">
                          <p className={`text-sm font-bold ${r.payout >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.payout >= 0 ? '' : '-'}{fmt(Math.abs(r.payout))}
                          </p>
                          <p className="text-xs" style={{ color: '#4A4A4A' }}>
                            Spread: {fmt(r.client_price - r.dsa_price)} × {r.quantity}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid #1E1E24' }}>
                      <td colSpan={5} className="px-5 py-3 text-xs font-bold" style={{ color: '#4A4A4A' }}>Subtotal — {g.dsa_name}</td>
                      <td className="px-5 py-3 text-sm font-bold text-emerald-400">{fmt(g.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ))}

          {groups.length > 1 && (
            <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <p className="text-sm font-bold text-white">Grand Total — All DSAs</p>
              <p className="text-xl font-bold text-emerald-400">{fmt(totalPayout)}</p>
            </div>
          )}
        </div>
      )}

      {!hasLoaded && (
        <div className="rounded-2xl p-12 text-center" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <Wallet className="w-10 h-10 mx-auto mb-3" style={{ color: '#2A2A2A' }} />
          <p className="text-sm font-semibold" style={{ color: '#4A4A4A' }}>Select a period and click Calculate Payout</p>
          <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>Payout = (Client Price − DSA Price) × Quantity for each DSA holding</p>
        </div>
      )}
    </div>
  );
}
