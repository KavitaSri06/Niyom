import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWTransaction, NWClient } from './types';
import { fmt, PRODUCT_LABELS } from './utils';
import { BarChart3, Download, ChevronDown } from 'lucide-react';

interface Props { employee: NWEmployee; }

interface MISRow {
  client_id: string;
  client_name: string;
  client_code: string;
  product_type: string;
  product_name: string;
  revenue_type: 'landing_cost' | 'insurance' | 'trail';
  revenue: number;
  notes: string;
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function isTrailAnniversaryInMonth(trailStartDate: string, year: number, month: number): boolean {
  try {
    const start = new Date(trailStartDate);
    if (isNaN(start.getTime())) return false;
    // Anniversary falls in this month if start month === selected month (any year after start)
    const startYear = start.getFullYear();
    const startMonth = start.getMonth();
    if (startMonth !== month) return false;
    // Must have been at least 1 year since investment
    const anniversaryYear = year;
    if (anniversaryYear <= startYear) return false;
    return true;
  } catch { return false; }
}

export default function MIS({ employee }: Props) {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth()); // 0-indexed
  const [rows, setRows] = useState<MISRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [empList, setEmpList] = useState<{ id: string; full_name: string; employee_code: string }[]>([]);
  const [empFilter, setEmpFilter] = useState('all');

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('nw_employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name')
      .then(({ data }) => setEmpList((data as any[]) || []));
  }, [isAdmin]);

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  const endDay = getLastDayOfMonth(selectedYear, selectedMonth);
  const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;

  const calculate = useCallback(async () => {
    setLoading(true);

    // Fetch clients (admin = all or filtered by employee, employee = own)
    let clientQuery = supabase.from('nw_clients').select('id, full_name, client_code, employee_id, sourced_via');;
    if (!isAdmin) clientQuery = clientQuery.eq('employee_id', employee.id);
    else if (empFilter !== 'all') clientQuery = clientQuery.eq('employee_id', empFilter);
    const { data: clientData } = await clientQuery;
    const clientList = (clientData as NWClient[]) || [];
    const clientIds = clientList.map(c => c.id);

    if (clientIds.length === 0) { setRows([]); setLoading(false); setHasLoaded(true); return; }

    // Fetch transactions within the selected period (new business only)
    const { data: txnData } = await supabase
      .from('nw_transactions')
      .select('*')
      .in('client_id', clientIds)
      .gte('txn_date', startDate)
      .lte('txn_date', endDate);

    const txns = (txnData as NWTransaction[]) || [];

    const computed: MISRow[] = [];

    for (const t of txns) {
      const client = clientList.find(c => c.id === t.client_id);
      if (!client) continue;

      const baseRow = {
        client_id: t.client_id,
        client_name: client.full_name,
        client_code: client.client_code,
        product_type: t.product_type,
        product_name: t.product_name,
      };

      // Unlisted shares / secondary bonds / primary bonds → (per_unit_price - landing_cost) × qty
      if (['unlisted_share', 'secondary_bond', 'primary_bond'].includes(t.product_type)) {
        const landingCost = (t as any).landing_cost || 0;
const qty = t.quantity || 0;

const client = clientList.find(c => c.id === t.client_id);


const price =
  client?.sourced_via === 'dsa'
    ? ((t as any).dsa_price || 0)
    : ((t as any).per_unit_price || 0);

const revenue = (price - landingCost) * qty;
        if (revenue !== 0) {
          computed.push({
            ...baseRow,
            revenue_type: 'landing_cost',
            revenue,
notes: `Price: ${fmt(price)} | Landing Cost: ${fmt(landingCost)} | Qty: ${qty}`,          });
        }
      }

      // Insurance → flat insurance_revenue
      if (t.product_type === 'insurance') {
        const rev = (t as any).insurance_revenue || 0;
        if (rev > 0) {
          computed.push({
            ...baseRow,
            revenue_type: 'insurance',
            revenue: rev,
            notes: `Policy: ${t.policy_number || '—'} | ${t.insurer_name || '—'}`,
          });
        }
      }

      // Mutual fund → trail commission at anniversary month of txn_date
      if (t.product_type === 'mutual_fund' && (t as any).trail_percent && (t as any).trail_start_date) {
        if (isTrailAnniversaryInMonth((t as any).trail_start_date, selectedYear, selectedMonth)) {
          const invested = t.consolidated_amount || 0;
          const trail = (t as any).trail_percent || 0;
          const revenue = (invested * trail) / 100;
          if (revenue > 0) {
            const yrs = selectedYear - new Date((t as any).trail_start_date).getFullYear();
            computed.push({
              ...baseRow,
              revenue_type: 'trail',
              revenue,
              notes: `Invested: ${fmt(invested)} | Trail: ${trail}% p.a. | Year ${yrs} anniversary`,
            });
          }
        }
      }
    }

    setRows(computed);
    setLoading(false);
    setHasLoaded(true);
  }, [selectedYear, selectedMonth, empFilter, isAdmin, employee.id, startDate, endDate]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const byType = {
    landing_cost: rows.filter(r => r.revenue_type === 'landing_cost').reduce((s, r) => s + r.revenue, 0),
    insurance: rows.filter(r => r.revenue_type === 'insurance').reduce((s, r) => s + r.revenue, 0),
    trail: rows.filter(r => r.revenue_type === 'trail').reduce((s, r) => s + r.revenue, 0),
  };

  const revenueTypeLabel: Record<string, string> = {
    landing_cost: 'Unlisted / Bonds',
    insurance: 'Insurance',
    trail: 'MF Trail',
  };
  const revenueTypeColor: Record<string, string> = {
    landing_cost: '#D4AF37',
    insurance: '#F97316',
    trail: '#EC4899',
  };

  const printMIS = () => {
    const logoHtml = `<div style="font-weight:900;font-size:22px;color:#111;font-family:Georgia,serif;">Niyom Wealth</div>`;

    const rowsHtml = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.client_name}</strong><br><span style="color:#888;font-size:11px">${r.client_code}</span></td>
        <td>${PRODUCT_LABELS[r.product_type] || r.product_type}</td>
        <td>${r.product_name}</td>
        <td>${revenueTypeLabel[r.revenue_type]}</td>
        <td>${r.notes}</td>
        <td style="text-align:right;font-weight:700;color:${r.revenue >= 0 ? '#059669' : '#DC2626'}">
          ${r.revenue >= 0 ? '' : '-'}&#8377;${Math.abs(r.revenue).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>MIS Report — ${MONTHS[selectedMonth]} ${selectedYear}</title>
  <style>
    @page { margin: 18mm 14mm; }
    body { font-family: Arial, sans-serif; color: #111; font-size: 12px; }
    .header { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #D4AF37; padding-bottom:12px; margin-bottom:16px; }
    .period { font-size:11px; color:#888; }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
    .stat { background:#f8f8f8; border-radius:6px; padding:10px 12px; border-top:3px solid #eee; }
    .stat-label { font-size:9px; color:#999; text-transform:uppercase; letter-spacing:0.08em; }
    .stat-value { font-size:16px; font-weight:800; margin-top:3px; }
    table { width:100%; border-collapse:collapse; }
    th { background:#f2f2f2; padding:7px 9px; text-align:left; font-size:10px; text-transform:uppercase; color:#777; border-bottom:1px solid #e0e0e0; }
    td { padding:7px 9px; border-bottom:1px solid #f0f0f0; font-size:11px; vertical-align:top; }
    .footer { margin-top:28px; text-align:center; font-size:10px; color:#aaa; border-top:1px solid #eee; padding-top:10px; }
  </style>
</head>
<body>
  <div class="header">
    <div>${logoHtml}<div class="period">MIS Report &nbsp;&middot;&nbsp; ${MONTHS[selectedMonth]} ${selectedYear} &nbsp;&middot;&nbsp; ${startDate} to ${endDate}</div></div>
    <div style="text-align:right"><div style="font-size:20px;font-weight:800;color:#059669">&#8377;${totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div><div style="font-size:10px;color:#888">Total Revenue</div></div>
  </div>
  <div class="stats">
    <div class="stat" style="border-top-color:#D4AF37"><div class="stat-label">Unlisted / Bonds</div><div class="stat-value" style="color:#D4AF37">&#8377;${byType.landing_cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div></div>
    <div class="stat" style="border-top-color:#F97316"><div class="stat-label">Insurance</div><div class="stat-value" style="color:#F97316">&#8377;${byType.insurance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div></div>
    <div class="stat" style="border-top-color:#EC4899"><div class="stat-label">MF Trail</div><div class="stat-value" style="color:#EC4899">&#8377;${byType.trail.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div></div>
    <div class="stat" style="border-top-color:#059669"><div class="stat-label">Total Entries</div><div class="stat-value">${rows.length}</div></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Client</th><th>Product Type</th><th>Product</th><th>Revenue Type</th><th>Details</th><th style="text-align:right">Revenue</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="7" style="text-align:center;padding:20px;color:#aaa">No revenue entries for this period</td></tr>'}</tbody>
  </table>
  <div class="footer">Niyom Wealth Distribution &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; Generated ${new Date().toLocaleString('en-IN')}</div>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#D4AF37' }}>Revenue</p>
          <h1 className="text-2xl font-bold text-white">MIS Report</h1>
          <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>Management Information System — monthly revenue overview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasLoaded && rows.length > 0 && (
            <button onClick={printMIS}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
              <Download className="w-4 h-4" /> Download PDF
            </button>
          )}
          <button onClick={calculate} disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
            <BarChart3 className="w-4 h-4" />
            {loading ? 'Calculating...' : 'Generate MIS'}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue', value: fmt(totalRevenue), color: '#10B981' },
            { label: 'Unlisted / Bonds', value: fmt(byType.landing_cost), color: '#D4AF37' },
            { label: 'Insurance', value: fmt(byType.insurance), color: '#F97316' },
            { label: 'MF Trail', value: fmt(byType.trail), color: '#EC4899' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4A4A4A' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Revenue table */}
      {hasLoaded && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1E1E24' }}>
            <p className="text-sm font-bold text-white">Revenue Breakdown — {MONTHS[selectedMonth]} {selectedYear}</p>
            <p className="text-xs" style={{ color: '#4A4A4A' }}>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                  {['Client', 'Product', 'Type', 'Revenue Type', 'Details', 'Revenue'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A4A4A' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-sm" style={{ color: '#4A4A4A' }}>
                    No revenue entries for {MONTHS[selectedMonth]} {selectedYear}
                  </td></tr>
                ) : rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #111' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#0D0D0D')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-white">{r.client_name}</p>
                      <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{r.client_code}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-white">{r.product_name}</p>
                      <p className="text-xs" style={{ color: '#6B6B6B' }}>{PRODUCT_LABELS[r.product_type] || r.product_type}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold px-1.5 py-0.5 rounded border" style={{ color: '#8A8A8A', borderColor: '#2A2A2A' }}>
                        {PRODUCT_LABELS[r.product_type]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-bold px-2 py-1 rounded-lg"
                        style={{ background: `${revenueTypeColor[r.revenue_type]}15`, color: revenueTypeColor[r.revenue_type] }}>
                        {revenueTypeLabel[r.revenue_type]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 max-w-[200px]">
                      <p className="text-xs" style={{ color: '#6B6B6B' }}>{r.notes}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className={`text-sm font-bold ${r.revenue >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.revenue >= 0 ? '' : '-'}{fmt(Math.abs(r.revenue))}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: '2px solid #1E1E24' }}>
                    <td colSpan={5} className="px-5 py-3.5 text-sm font-bold text-white">Total Revenue</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-emerald-400">{fmt(totalRevenue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {!hasLoaded && (
        <div className="rounded-2xl p-12 text-center" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <BarChart3 className="w-10 h-10 mx-auto mb-3" style={{ color: '#2A2A2A' }} />
          <p className="text-sm font-semibold" style={{ color: '#4A4A4A' }}>Select a period and click Generate MIS</p>
          <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>Revenue is calculated based on holdings data entered by your team</p>
        </div>
      )}
    </div>

    
  );
}
