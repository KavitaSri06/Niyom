import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { NWClient, NWHolding } from '../crm/types';
import { fmt, fmtDate, PRODUCT_LABELS, PRODUCT_COLORS, PRODUCT_CHART_COLORS } from '../crm/utils';
import { LogOut, TrendingUp, Shield, PieChart, RefreshCw, KeyRound, X, Eye, EyeOff } from 'lucide-react';
import { ThemeToggle } from '../theme/ThemeToggle';

interface Props {
  clientId: string;
  onLogout: () => void;
}

const BOND_TYPES = ['secondary_bond', 'primary_bond', 'fixed_deposit'];
const PAYOUT_FREQ: Record<string, string> = { annual: 'Annual', halfyearly: 'Half-Yearly', quarterly: 'Quarterly', monthly: 'Monthly' };

export default function ClientPortal({ clientId, onLogout }: Props) {
  const [client, setClient] = useState<NWClient | null>(null);
  const [holdings, setHoldings] = useState<NWHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'holdings'>('overview');
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: clientData }, { data: holdingData }] = await Promise.all([
        supabase.from('nw_clients').select('*').eq('id', clientId).maybeSingle(),
        supabase.from('nw_holdings').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      ]);
      setClient(clientData as NWClient);
      setHoldings((holdingData as NWHolding[]) || []);
      setLoading(false);
    };
    load();
  }, [clientId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    onLogout();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.next.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.'); return; }
    setPwLoading(true);

    // Re-authenticate first to verify current password
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setPwError('Session expired. Please log in again.'); setPwLoading(false); return; }

    const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email: user.email, password: pwForm.current });
    if (reAuthErr) { setPwError('Current password is incorrect.'); setPwLoading(false); return; }

    const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.next });
    if (updateErr) { setPwError(updateErr.message); setPwLoading(false); return; }

    await supabase.from('nw_clients').update({ client_password_changed: true }).eq('id', clientId);

    setPwLoading(false);
    setPwSuccess('Password changed successfully.');
    setPwForm({ current: '', next: '', confirm: '' });
    setTimeout(() => { setShowChangePw(false); setPwSuccess(''); }, 2000);
  };

  const totalValue = holdings.reduce((s, h) => s + (h.current_value || 0), 0);
  const totalInvested = holdings.reduce((s, h) => s + (h.invested_amount || 0), 0);
  const gainLoss = totalValue - totalInvested;
  const gainPct = totalInvested > 0 ? ((gainLoss / totalInvested) * 100).toFixed(2) : '0.00';

  // Product allocation
  const productTotals = [...new Set(holdings.map(h => h.product_type))].map(pt => ({
    label: PRODUCT_LABELS[pt] || pt,
    value: holdings.filter(h => h.product_type === pt).reduce((s, h) => s + (h.current_value || 0), 0),
    color: PRODUCT_CHART_COLORS[pt] || 'var(--text-muted)',
  })).filter(p => p.value > 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Topbar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-3">
          <img src="/niyomlogo.png" alt="Niyom Wealth" className="h-8 w-auto object-contain" />
          <div>
            <p className="font-bold text-sm" style={{ color: 'var(--accent-soft)' }}>Niyom Wealth</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Client Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle variant="icon" />
          {client && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(var(--accent-rgb),0.15)', color: 'var(--accent)' }}>
                {client.full_name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-xs font-semibold text-text-primary leading-none">{client.full_name}</p>
                <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>{client.client_code}</p>
              </div>
            </div>
          )}
          <button onClick={() => { setShowChangePw(true); setPwError(''); setPwSuccess(''); }} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(var(--accent-rgb),0.3)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
            <KeyRound className="w-4 h-4" />
            <span className="hidden sm:inline">Change Password</span>
          </button>
          <button onClick={handleLogout} className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all" style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(239,68,68,0.3)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome */}
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Portfolio Overview</p>
          <h1 className="text-2xl font-bold text-text-primary">Welcome, {client?.full_name?.split(' ')[0] || 'Investor'}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Here is your investment summary as of today.</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Portfolio Value', value: fmt(totalValue), color: 'var(--accent)', sub: null },
            { label: 'Total Invested', value: fmt(totalInvested), color: 'var(--text-muted)', sub: null },
            { label: gainLoss >= 0 ? 'Total Gain' : 'Total Loss', value: `${gainLoss >= 0 ? '+' : ''}${fmt(gainLoss)}`, color: gainLoss >= 0 ? 'var(--success)' : 'var(--danger)', sub: `${gainLoss >= 0 ? '+' : ''}${gainPct}%` },
            { label: 'Holdings', value: holdings.length.toString(), color: 'var(--chart-5)', sub: `${new Set(holdings.map(h => h.product_type)).size} types` },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
              {s.sub && <p className="text-xs mt-1" style={{ color: `color-mix(in srgb, ${s.color} 60%, transparent)` }}>{s.sub}</p>}
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            { key: 'overview', label: 'Overview', icon: PieChart },
            { key: 'holdings', label: 'My Holdings', icon: TrendingUp },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={activeTab === tab.key
                ? { background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.25)' }
                : { background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Allocation */}
            {productTotals.length > 0 && (
              <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <h2 className="text-sm font-bold text-text-primary">Product Allocation</h2>
                <div className="space-y-3">
                  {productTotals.map(p => {
                    const pct = totalValue > 0 ? ((p.value / totalValue) * 100).toFixed(1) : '0';
                    return (
                      <div key={p.label} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: p.color }} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-semibold text-text-primary">{p.label}</p>
                            <p className="text-xs text-text-primary">{fmt(p.value)} <span style={{ color: 'var(--text-secondary)' }}>({pct}%)</span></p>
                          </div>
                          <div className="h-1.5 rounded-full" style={{ background: 'var(--bg-raised)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Client Details */}
            {client && (
              <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <h2 className="text-sm font-bold text-text-primary">Account Details</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Client Code', value: client.client_code },
                    { label: 'PAN Number', value: client.pan },
                    { label: 'Mobile', value: client.phone },
                    { label: 'Email', value: client.email },
                    { label: 'City', value: client.city },
                    { label: 'State', value: client.state },
                  ].map(f => (
                    <div key={f.label} className="flex gap-3 p-3 rounded-xl" style={{ background: 'var(--bg-surface)' }}>
                      <p className="text-xs w-24 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>{f.label}</p>
                      <p className="text-xs font-medium text-text-primary">{f.value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'holdings' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {holdings.length === 0 ? (
              <div className="py-16 text-center">
                <RefreshCw className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--border)' }} />
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No holdings recorded yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Product', 'Type', 'Qty', 'Invested', 'Current Value', 'P&L'].map(h => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map(h => {
                      const pl = (h.current_value || 0) - (h.invested_amount || 0);
                      const plPct = h.invested_amount > 0 ? ((pl / h.invested_amount) * 100).toFixed(1) : '0';
                      // For DSA clients, show client_price instead of avg_cost
                      const displayPrice = h.client_price ?? h.avg_cost;
                      return (
                        <tr key={h.id} style={{ borderBottom: '1px solid var(--bg-raised)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <td className="px-5 py-3.5">
                            <p className="text-sm font-medium text-text-primary">{h.product_name}</p>
                            {BOND_TYPES.includes(h.product_type) && h.coupon_rate && (
                              <p className="text-xs mt-0.5" style={{ color: 'var(--success)' }}>{h.coupon_rate}% · {PAYOUT_FREQ[h.payout_frequency || 'annual']}</p>
                            )}
                            {h.product_type === 'mutual_fund' && h.folio_number && (
                              <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--chart-4)' }}>{h.folio_number}</p>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${PRODUCT_COLORS[h.product_type]}`}>
                              {PRODUCT_LABELS[h.product_type]}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-text-primary">{h.quantity || '—'}</td>
                          <td className="px-5 py-3.5 text-sm text-text-primary">{fmt(h.invested_amount || 0)}</td>
                          <td className="px-5 py-3.5 text-sm font-bold text-text-primary">{fmt(h.current_value || 0)}</td>
                          <td className="px-5 py-3.5">
                            <p className={`text-sm font-bold ${pl >= 0 ? 'text-c-emerald' : 'text-c-red'}`}>
                              {pl >= 0 ? '+' : ''}{fmt(pl)}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{pl >= 0 ? '+' : ''}{plPct}%</p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs py-4" style={{ color: 'var(--border-strong)' }}>
          Niyom Wealth Distribution &nbsp;&middot;&nbsp; Confidential &nbsp;&middot;&nbsp; For your eyes only
        </p>
      </main>

      {/* Change Password Modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <h3 className="text-sm font-bold text-text-primary">Change Password</h3>
              </div>
              <button onClick={() => setShowChangePw(false)} style={{ color: 'var(--text-secondary)' }}><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleChangePassword} className="p-6 space-y-4">
              {pwError && (
                <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'rgb(var(--danger-soft-rgb))' }}>{pwError}</div>
              )}
              {pwSuccess && (
                <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)' }}>{pwSuccess}</div>
              )}
              {[
                { label: 'Current Password', key: 'current' as const },
                { label: 'New Password', key: 'next' as const },
                { label: 'Confirm New Password', key: 'confirm' as const },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{f.label}</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={pwForm[f.key]}
                      onChange={e => setPwForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder="••••••••"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-text-primary outline-none transition-all"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
                      onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                    />
                    {f.key === 'confirm' && (
                      <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }}>
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div className="space-y-1">
                {[
                  { text: 'At least 8 characters', met: pwForm.next.length >= 8 },
                  { text: 'Passwords match', met: pwForm.next === pwForm.confirm && pwForm.confirm.length > 0 },
                ].map(r => (
                  <p key={r.text} className="text-xs flex items-center gap-1.5" style={{ color: r.met ? 'var(--success)' : 'var(--text-secondary)' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.met ? 'var(--success)' : 'var(--text-secondary)' }} />
                    {r.text}
                  </p>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowChangePw(false)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--bg-raised)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Cancel</button>
                <button type="submit" disabled={pwLoading || pwForm.next.length < 8 || pwForm.next !== pwForm.confirm}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
                  {pwLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
