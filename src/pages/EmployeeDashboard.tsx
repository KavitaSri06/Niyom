import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CRMUser, Deal, EmployeeMetrics } from '../types';
import {
  TrendingUp, DollarSign, Award, LogOut, Plus, CheckCircle2, Clock,
  XCircle, BarChart3, Users, CreditCard as Edit2, X, AlertCircle,
  Briefcase, UserPlus, Phone, Mail, ChevronRight, ArrowUpRight, Target
} from 'lucide-react';

const PRODUCT_LABELS: Record<string, string> = {
  mutual_funds: 'Mutual Funds',
  insurance: 'Insurance',
  fixed_deposits: 'Fixed Deposits',
  bonds: 'Bonds',
  unlisted_shares: 'Unlisted Shares',
  primary_bonds: 'Primary Bonds',
  other: 'Other',
};

const PRODUCT_COLORS: Record<string, string> = {
  mutual_funds: 'bg-blue-100 text-blue-700',
  insurance: 'bg-emerald-100 text-emerald-700',
  fixed_deposits: 'bg-amber-100 text-amber-700',
  bonds: 'bg-bg-raised text-text-secondary',
  unlisted_shares: 'bg-rose-100 text-rose-700',
  primary_bonds: 'bg-cyan-100 text-cyan-700',
  other: 'bg-bg-raised text-text-secondary',
};

function formatCurrency(amount: number) {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)}Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)}L`;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function formatCurrencyFull(amount: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    closed: { cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
    pending: { cls: 'bg-amber-50 text-amber-700 border border-amber-200', icon: <Clock className="w-3 h-3" /> },
    cancelled: { cls: 'bg-red-50 text-red-600 border border-red-200', icon: <XCircle className="w-3 h-3" /> },
  };
  const s = map[status] || { cls: 'bg-bg-raised text-text-secondary border border-border', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${s.cls}`}>
      {s.icon}{status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-12 h-12 text-base' };
  const colors = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`${sizes[size]} ${color} rounded-full flex items-center justify-center font-bold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Edit Deal Modal ───────────────────────────────────────────────────────────
function EditDealModal({ deal, onClose, onSaved }: { deal: Deal & { client_name?: string; notes?: string }; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    client_name: deal.client_name || '',
    product_type: deal.product_type,
    amount: deal.amount.toString(),
    revenue: deal.revenue.toString(),
    status: deal.status,
    notes: deal.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.from('deals').update({
        client_name: form.client_name,
        product_type: form.product_type,
        amount: parseFloat(form.amount),
        revenue: parseFloat(form.revenue),
        status: form.status,
        notes: form.notes,
        closed_at: form.status === 'closed' ? new Date().toISOString() : null,
      }).eq('id', deal.id);
      if (err) throw err;
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update deal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
          <h2 className="text-base font-bold text-text-primary">Edit Deal</h2>
          <button onClick={onClose} className="p-2 hover:bg-bg-raised rounded-xl transition-colors">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Client Name</label>
            <input type="text" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-bg-base"
              placeholder="Client name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Product</label>
              <select value={form.product_type} onChange={e => setForm({ ...form, product_type: e.target.value as any })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base">
                {Object.entries(PRODUCT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base">
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base" required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Revenue (₹)</label>
              <input type="number" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base" required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base resize-none"
              placeholder="Optional notes..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border text-text-secondary rounded-xl hover:bg-bg-base text-sm font-medium">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 text-sm font-semibold disabled:opacity-50">
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Client Modal ──────────────────────────────────────────────────────────
function AddClientModal({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: err } = await supabase.from('clients').insert([{ name: form.name, phone: form.phone, email: form.email, notes: form.notes, created_by: employeeId }]);
      if (err) throw err;
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add client');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
          <h2 className="text-base font-bold text-text-primary">Add New Client</h2>
          <button onClick={onClose} className="p-2 hover:bg-bg-raised rounded-xl transition-colors">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Full Name *</label>
            <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base"
              placeholder="Client full name" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Phone</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base"
                placeholder="+91 ..." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base"
                placeholder="client@email.com" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:ring-2 focus:ring-gray-900 bg-bg-base resize-none"
              placeholder="Any relevant notes..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border text-text-secondary rounded-xl hover:bg-bg-base text-sm font-medium">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 text-sm font-semibold disabled:opacity-50">
              {loading ? 'Saving...' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
type Tab = 'deals' | 'clients';

export default function EmployeeDashboard() {
  const [employee, setEmployee] = useState<CRMUser | null>(null);
  const [metrics, setMetrics] = useState<(EmployeeMetrics & { is_eligible?: boolean }) | null>(null);
  const [deals, setDeals] = useState<(Deal & { client_name?: string; notes?: string })[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('deals');
  const [editingDeal, setEditingDeal] = useState<(Deal & { client_name?: string; notes?: string }) | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/crm/login'; return; }
      const { data: crmUser, error: userError } = await supabase.from('crm_users').select('*').eq('auth_user_id', user.id).maybeSingle();
      if (userError || !crmUser || crmUser.role !== 'employee') { window.location.href = '/crm/login'; return; }
      setEmployee(crmUser);
      await Promise.all([loadMetrics(crmUser.id), loadDeals(crmUser.id), loadClients(crmUser.id)]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadMetrics = async (empId: string) => {
    const { data } = await supabase.rpc('get_employee_metrics', { employee_uuid: empId });
    if (data) setMetrics(data);
  };

  const loadDeals = async (empId: string) => {
    const { data } = await supabase.from('deals').select('*').eq('employee_id', empId).order('created_at', { ascending: false });
    setDeals(data || []);
  };

  const loadClients = async (empId: string) => {
    const { data } = await supabase.from('clients').select('*').eq('created_by', empId).order('created_at', { ascending: false });
    setClients(data || []);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  const xMultiple = metrics?.x_multiple || 0;
  const isEligible = metrics?.is_eligible || false;
  const productCategories = metrics?.product_categories || 0;
  const closedCount = deals.filter(d => d.status === 'closed').length;

  return (
    <div className="min-h-screen bg-bg-base/50">
      {/* Navbar */}
      <nav className="bg-bg-elevated border-b border-border sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <Briefcase className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-bold text-text-primary">{employee?.full_name}</span>
                <span className="ml-2 text-xs text-text-muted font-medium hidden sm:inline">{employee?.level}</span>
              </div>
            </div>
            <button onClick={() => { supabase.auth.signOut(); window.location.href = '/crm/login'; }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted hover:text-text-primary hover:bg-bg-raised rounded-lg transition-colors text-sm">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:block">Sign out</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Revenue */}
          <div className="bg-bg-elevated rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="bg-emerald-500 w-9 h-9 rounded-xl flex items-center justify-center text-white">
                <DollarSign className="w-4 h-4" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-text-faint" />
            </div>
            <p className="text-2xl font-bold text-text-primary tracking-tight">{formatCurrency(metrics?.total_revenue || 0)}</p>
            <p className="text-xs text-text-muted mt-1">Total Revenue</p>
            <p className="text-xs text-text-muted font-medium mt-0.5">{closedCount} closed deals</p>
          </div>

          {/* X Multiple */}
          <div className="bg-bg-elevated rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="bg-blue-500 w-9 h-9 rounded-xl flex items-center justify-center text-white">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-lg ${xMultiple >= 2.1 ? 'bg-emerald-100 text-emerald-700' : 'bg-bg-raised text-text-muted'}`}>
                {xMultiple >= 2.1 ? '✓' : '×'}
              </span>
            </div>
            <p className="text-2xl font-bold text-text-primary tracking-tight">{xMultiple.toFixed(2)}x</p>
            <p className="text-xs text-text-muted mt-1">X Multiple</p>
            <p className="text-xs text-text-muted font-medium mt-0.5">Revenue ÷ Salary</p>
          </div>

          {/* Incentive */}
          <div className={`bg-bg-elevated rounded-2xl border p-5 shadow-sm hover:shadow-md transition-shadow ${isEligible ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-border'}`}>
            <div className="flex items-start justify-between mb-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${isEligible ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <Award className="w-4 h-4" />
              </div>
              {isEligible && <span className="text-xs font-bold px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700">Eligible</span>}
            </div>
            <p className="text-2xl font-bold text-text-primary tracking-tight">{formatCurrency(metrics?.incentive_amount || 0)}</p>
            <p className="text-xs text-text-muted mt-1">Incentive</p>
            {!isEligible && (
              <p className="text-xs text-red-500 font-medium mt-0.5">
                {productCategories < 3 ? `${3 - productCategories} more ${3 - productCategories === 1 ? 'category' : 'categories'} needed` : 'Need 2.1x minimum'}
              </p>
            )}
            {isEligible && <p className="text-xs text-emerald-600 font-medium mt-0.5">Payout eligible</p>}
          </div>

          {/* Categories */}
          <div className="bg-bg-elevated rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${productCategories >= 3 ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                <BarChart3 className="w-4 h-4" />
              </div>
              <Target className="w-4 h-4 text-text-faint" />
            </div>
            <p className="text-2xl font-bold text-text-primary tracking-tight">{productCategories}<span className="text-sm font-normal text-text-muted ml-1">/ 3</span></p>
            <p className="text-xs text-text-muted mt-1">Categories</p>
            <div className="mt-2 flex gap-1">
              {[1, 2, 3].map(n => (
                <div key={n} className={`flex-1 h-1.5 rounded-full transition-all ${productCategories >= n ? 'bg-emerald-500' : 'bg-bg-raised'}`} />
              ))}
            </div>
          </div>
        </div>

        {/* Tabs Panel */}
        <div className="bg-bg-elevated rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="border-b border-border-subtle">
            <div className="flex">
              {[
                { id: 'deals' as Tab, label: 'My Deals', icon: <Briefcase className="w-4 h-4" />, count: deals.length },
                { id: 'clients' as Tab, label: 'My Clients', icon: <Users className="w-4 h-4" />, count: clients.length },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3.5 text-sm font-medium border-b-2 transition-all ${
                    activeTab === tab.id ? 'border-gray-900 text-text-primary' : 'border-transparent text-text-muted hover:text-text-secondary'
                  }`}>
                  {tab.icon}
                  {tab.label}
                  <span className={`px-1.5 py-0.5 rounded-lg text-xs font-semibold ${activeTab === tab.id ? 'bg-bg-raised text-text-secondary' : 'bg-bg-raised text-text-muted'}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Deals Tab */}
          {activeTab === 'deals' && (
            <div>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
                <p className="text-sm text-text-muted font-medium">{deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
                <button onClick={() => window.location.href = '/crm/employee/deals/new'}
                  className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors text-sm font-semibold">
                  <Plus className="w-4 h-4" /> Add Deal
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      {['Client', 'Product', 'Amount', 'Revenue', 'Status', 'Date', ''].map((h, i) => (
                        <th key={i} className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {deals.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-14 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-14 h-14 bg-bg-raised rounded-2xl flex items-center justify-center">
                              <Briefcase className="w-6 h-6 text-text-muted" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text-secondary">No deals yet</p>
                              <p className="text-xs text-text-muted mt-0.5">Add your first deal to get started</p>
                            </div>
                            <button onClick={() => window.location.href = '/crm/employee/deals/new'}
                              className="flex items-center gap-1.5 text-sm text-text-primary font-semibold hover:underline">
                              Add your first deal <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {deals.map(deal => (
                      <tr key={deal.id} className="hover:bg-bg-base/50 transition-colors">
                        <td className="px-5 py-4 text-sm text-text-secondary">{deal.client_name || <span className="text-text-faint">—</span>}</td>
                        <td className="px-5 py-4">
                          <span className={`text-xs font-medium px-2 py-1 rounded-lg ${PRODUCT_COLORS[deal.product_type] || 'bg-bg-raised text-text-secondary'}`}>
                            {PRODUCT_LABELS[deal.product_type] || deal.product_type}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-text-secondary whitespace-nowrap">{formatCurrencyFull(deal.amount)}</td>
                        <td className="px-5 py-4 text-sm font-bold text-text-primary whitespace-nowrap">{formatCurrency(deal.revenue)}</td>
                        <td className="px-5 py-4 whitespace-nowrap"><StatusBadge status={deal.status} /></td>
                        <td className="px-5 py-4 text-xs text-text-muted whitespace-nowrap">
                          {new Date(deal.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-4">
                          <button onClick={() => setEditingDeal(deal)}
                            className="p-1.5 hover:bg-bg-raised rounded-lg transition-colors text-text-faint hover:text-text-secondary">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Clients Tab */}
          {activeTab === 'clients' && (
            <div>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
                <p className="text-sm text-text-muted font-medium">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowAddClient(true)}
                  className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors text-sm font-semibold">
                  <UserPlus className="w-4 h-4" /> Add Client
                </button>
              </div>
              {clients.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14">
                  <div className="w-14 h-14 bg-bg-raised rounded-2xl flex items-center justify-center">
                    <Users className="w-6 h-6 text-text-muted" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-text-secondary">No clients yet</p>
                    <p className="text-xs text-text-muted mt-0.5">Add your first client to get started</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {clients.map((c: any) => (
                    <div key={c.id} className="px-6 py-4 hover:bg-bg-base/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <Avatar name={c.name} size="md" />
                          <div>
                            <p className="text-sm font-semibold text-text-primary">{c.name}</p>
                            <div className="flex items-center gap-3 mt-1">
                              {c.phone && (
                                <span className="flex items-center gap-1 text-xs text-text-muted">
                                  <Phone className="w-3 h-3" />{c.phone}
                                </span>
                              )}
                              {c.email && (
                                <span className="flex items-center gap-1 text-xs text-text-muted">
                                  <Mail className="w-3 h-3" />{c.email}
                                </span>
                              )}
                            </div>
                            {c.notes && <p className="text-xs text-text-muted mt-1">{c.notes}</p>}
                          </div>
                        </div>
                        <p className="text-xs text-text-faint whitespace-nowrap">
                          {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editingDeal && (
        <EditDealModal deal={editingDeal} onClose={() => setEditingDeal(null)}
          onSaved={() => { if (employee) { loadDeals(employee.id); loadMetrics(employee.id); } }} />
      )}
      {showAddClient && employee && (
        <AddClientModal employeeId={employee.id} onClose={() => setShowAddClient(false)} onSaved={() => loadClients(employee.id)} />
      )}
    </div>
  );
}
