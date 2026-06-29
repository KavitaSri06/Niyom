import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CRMUser, Deal, EmployeeMetrics } from '../types';
import {
  Users, TrendingUp, LogOut, Award, BarChart3, CheckCircle2, Clock,
  XCircle, Plus, Trash2, X, AlertCircle, Search, UserCheck, UserX,
  Briefcase, Settings, FileText, CreditCard as Edit2, ChevronRight,
  ArrowUpRight, Activity, Shield, Star
} from 'lucide-react';

interface EmployeeWithMetrics extends CRMUser {
  metrics?: EmployeeMetrics & { is_eligible?: boolean };
  is_active?: boolean;
}

interface SlabRule {
  id: number;
  x_min: number;
  x_max: number | null;
  level: string;
  share_percentage: number;
}

type Tab = 'overview' | 'employees' | 'deals' | 'clients' | 'incentives';

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
      {s.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-sm', lg: 'w-11 h-11 text-base' };
  const colors = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700', 'bg-violet-100 text-violet-700'];
  const color = colors[name.charCodeAt(0) % colors.length];
  return (
    <div className={`${sizes[size]} ${color} rounded-full flex items-center justify-center font-semibold flex-shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Employee Modal ────────────────────────────────────────────────────────────
function EmployeeModal({ employee, onClose, onSaved }: { employee?: CRMUser | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    full_name: employee?.full_name || '',
    email: employee?.email || '',
    password: '',
    level: employee?.level || 'RELATIONSHIP MANAGER',
    role: employee?.role || 'employee',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (employee) {
        const { error: updateErr } = await supabase.from('crm_users').update({
          full_name: form.full_name,
          level: form.level,
          role: form.role as 'admin' | 'employee',
        }).eq('id', employee.id);
        if (updateErr) throw updateErr;
      } else {
        if (!form.password || form.password.length < 6) throw new Error('Password must be at least 6 characters');
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-crm-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
            'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ email: form.email, password: form.password, full_name: form.full_name, level: form.level, role: form.role }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to create employee');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save employee');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle">
          <div>
            <h2 className="text-base font-bold text-text-primary">{employee ? 'Edit Employee' : 'Add New Employee'}</h2>
            <p className="text-xs text-text-muted mt-0.5">{employee ? 'Update employee details' : 'Create a new CRM account'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-raised rounded-xl transition-colors">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Full Name *</label>
            <input type="text" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base focus:bg-bg-elevated transition-colors"
              placeholder="John Doe" required />
          </div>
          {!employee && (
            <>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base focus:bg-bg-elevated transition-colors"
                  placeholder="employee@niyomwealth.com" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Password *</label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base focus:bg-bg-elevated transition-colors"
                  placeholder="Min. 6 characters" required />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Designation</label>
            <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base focus:bg-bg-elevated transition-colors">
              {['RELATIONSHIP MANAGER', 'SENIOR RELATIONSHIP MANAGER', 'TEAM LEADER-WEALTH', 'SALES MANAGER-WEALTH', 'HEAD OF SALES', 'DESIGNATED PARTNER'].map(d => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(['employee', 'admin'] as const).map(r => (
                <button key={r} type="button" onClick={() => setForm({ ...form, role: r })}
                  className={`py-2.5 text-sm rounded-xl border font-medium transition-all ${form.role === r ? 'bg-gray-900 border-gray-900 text-white' : 'border-border text-text-secondary hover:border-gray-400 bg-bg-base'}`}>
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border text-text-secondary rounded-xl hover:bg-bg-base transition-colors text-sm font-medium">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-semibold disabled:opacity-50">
              {loading ? 'Saving...' : employee ? 'Save Changes' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Deal Modal ────────────────────────────────────────────────────────────────
function DealModal({ deal, onClose, onSaved }: { deal: Deal & { employee_name?: string; client_name?: string; notes?: string }; onClose: () => void; onSaved: () => void }) {
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
      const { error: updateErr } = await supabase.from('deals').update({
        client_name: form.client_name,
        product_type: form.product_type,
        amount: parseFloat(form.amount),
        revenue: parseFloat(form.revenue),
        status: form.status,
        notes: form.notes,
        closed_at: form.status === 'closed' ? new Date().toISOString() : null,
      }).eq('id', deal.id);
      if (updateErr) throw updateErr;
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
          <div>
            <h2 className="text-base font-bold text-text-primary">Edit Deal</h2>
            <p className="text-xs text-text-muted mt-0.5">{deal.employee_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-bg-raised rounded-xl transition-colors">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Client Name</label>
            <input type="text" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base focus:bg-bg-elevated transition-colors"
              placeholder="Client name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Product</label>
              <select value={form.product_type} onChange={e => setForm({ ...form, product_type: e.target.value as any })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base">
                {Object.entries(PRODUCT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as any })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base">
                <option value="pending">Pending</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base"
                required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Revenue (₹)</label>
              <input type="number" value={form.revenue} onChange={e => setForm({ ...form, revenue: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base"
                required />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full px-3.5 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-bg-base resize-none"
              placeholder="Optional notes..." />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-border text-text-secondary rounded-xl hover:bg-bg-base text-sm font-medium">Cancel</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-gray-800 text-sm font-semibold disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [admin, setAdmin] = useState<CRMUser | null>(null);
  const [employees, setEmployees] = useState<EmployeeWithMetrics[]>([]);
  const [deals, setDeals] = useState<(Deal & { employee_name?: string; client_name?: string; notes?: string })[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [slabRules, setSlabRules] = useState<SlabRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<CRMUser | null>(null);
  const [editingDeal, setEditingDeal] = useState<(Deal & { employee_name?: string; client_name?: string; notes?: string }) | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'employee' | 'deal'; id: string } | null>(null);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/crm/login'; return; }
      const { data: crmUser } = await supabase.from('crm_users').select('*').eq('auth_user_id', user.id).maybeSingle();
      if (!crmUser || crmUser.role !== 'admin') { window.location.href = '/crm/login'; return; }
      setAdmin(crmUser);
      await Promise.all([loadEmployees(), loadDeals(), loadClients(), loadSlabRules()]);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadEmployees = async () => {
    const { data } = await supabase.from('crm_users').select('*').eq('role', 'employee').order('created_at', { ascending: false });
    if (!data) return;
    const withMetrics = await Promise.all(data.map(async emp => {
      const { data: m } = await supabase.rpc('get_employee_metrics', { employee_uuid: emp.id });
      return { ...emp, metrics: m };
    }));
    setEmployees(withMetrics);
  };

  const loadDeals = async () => {
    const { data: dealsData } = await supabase.from('deals').select('*').order('created_at', { ascending: false });
    const { data: empData } = await supabase.from('crm_users').select('id, full_name').eq('role', 'employee');
    const empMap: Record<string, string> = {};
    empData?.forEach(e => { empMap[e.id] = e.full_name; });
    setDeals((dealsData || []).map(d => ({ ...d, employee_name: empMap[d.employee_id] || 'Unknown' })));
  };

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('*, crm_users!created_by(full_name)').order('created_at', { ascending: false });
    setClients(data || []);
  };

  const loadSlabRules = async () => {
    const { data } = await supabase.from('slab_rules').select('*').order('x_min');
    setSlabRules(data || []);
  };

  const handleToggleActive = async (emp: EmployeeWithMetrics) => {
    await supabase.from('crm_users').update({ is_active: !emp.is_active }).eq('id', emp.id);
    await loadEmployees();
  };

  const handleDeleteEmployee = async (id: string) => {
    await supabase.from('crm_users').delete().eq('id', id);
    setDeleteConfirm(null);
    await loadEmployees();
  };

  const handleDeleteDeal = async (id: string) => {
    await supabase.from('deals').delete().eq('id', id);
    setDeleteConfirm(null);
    await loadDeals();
  };

  const totalRevenue = employees.reduce((s, e) => s + (e.metrics?.total_revenue || 0), 0);
  const totalIncentives = employees.reduce((s, e) => s + (e.metrics?.incentive_amount || 0), 0);
  const closedDeals = deals.filter(d => d.status === 'closed').length;

  const filteredDeals = deals.filter(d =>
    !searchQuery ||
    d.employee_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (d.client_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    PRODUCT_LABELS[d.product_type]?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredEmployees = employees.filter(e =>
    !searchQuery ||
    e.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <p className="text-text-muted text-sm font-medium">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Activity className="w-4 h-4" /> },
    { id: 'employees', label: 'Employees', icon: <Users className="w-4 h-4" /> },
    { id: 'deals', label: 'All Deals', icon: <Briefcase className="w-4 h-4" /> },
    { id: 'clients', label: 'Clients', icon: <FileText className="w-4 h-4" /> },
    { id: 'incentives', label: 'Incentive Slabs', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-bg-base/50">
      {/* Navbar */}
      <nav className="bg-bg-elevated border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-white" />
              </div>
              <div>
                <span className="text-sm font-bold text-text-primary">Niyom CRM</span>
                <span className="ml-2 text-xs bg-bg-raised text-text-secondary px-2 py-0.5 rounded-full font-medium">Admin</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2">
                <Avatar name={admin?.full_name || 'A'} size="sm" />
                <span className="text-sm font-medium text-text-secondary">{admin?.full_name}</span>
              </div>
              <button onClick={() => { supabase.auth.signOut(); window.location.href = '/crm/login'; }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-text-muted hover:text-text-primary hover:bg-bg-raised rounded-lg transition-colors text-sm">
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:block">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Total Employees', value: employees.length.toString(), sub: `${employees.filter(e => e.is_active !== false).length} active`,
              icon: <Users className="w-4 h-4" />, iconBg: 'bg-blue-500', trend: null,
            },
            {
              label: 'Total Revenue', value: formatCurrency(totalRevenue), sub: `${closedDeals} closed deals`,
              icon: <TrendingUp className="w-4 h-4" />, iconBg: 'bg-emerald-500', trend: null,
            },
            {
              label: 'Total Incentives', value: formatCurrency(totalIncentives), sub: `${employees.filter(e => e.metrics?.is_eligible).length} eligible`,
              icon: <Award className="w-4 h-4" />, iconBg: 'bg-amber-500', trend: null,
            },
            {
              label: 'Closed Deals', value: closedDeals.toString(), sub: `of ${deals.length} total`,
              icon: <CheckCircle2 className="w-4 h-4" />, iconBg: 'bg-gray-700', trend: null,
            },
          ].map((card, i) => (
            <div key={i} className="bg-bg-elevated rounded-2xl border border-border p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className={`${card.iconBg} w-9 h-9 rounded-xl flex items-center justify-center text-white`}>
                  {card.icon}
                </div>
                <ArrowUpRight className="w-4 h-4 text-text-faint" />
              </div>
              <p className="text-2xl font-bold text-text-primary tracking-tight">{card.value}</p>
              <p className="text-xs text-text-muted mt-1">{card.label}</p>
              <p className="text-xs text-text-muted mt-0.5 font-medium">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Main Panel */}
        <div className="bg-bg-elevated rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Tab Bar */}
          <div className="border-b border-border-subtle px-2 overflow-x-auto">
            <div className="flex">
              {TABS.map(tab => (
                <button key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                    activeTab === tab.id
                      ? 'border-gray-900 text-text-primary'
                      : 'border-transparent text-text-muted hover:text-text-secondary hover:border-border-strong'
                  }`}>
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Performers */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-text-primary">Top Performers</h3>
                  <button onClick={() => setActiveTab('employees')} className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors">
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1">
                  {employees
                    .sort((a, b) => (b.metrics?.total_revenue || 0) - (a.metrics?.total_revenue || 0))
                    .slice(0, 6)
                    .map((emp, idx) => (
                      <div key={emp.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-bg-base transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            idx === 0 ? 'bg-amber-100 text-amber-700' :
                            idx === 1 ? 'bg-bg-raised text-text-secondary' :
                            idx === 2 ? 'bg-orange-100 text-orange-700' :
                            'bg-bg-raised text-text-muted'
                          }`}>{idx + 1}</div>
                          <Avatar name={emp.full_name} size="sm" />
                          <div>
                            <p className="text-sm font-semibold text-text-primary">{emp.full_name}</p>
                            <p className="text-xs text-text-muted">{emp.level}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-text-primary">{formatCurrency(emp.metrics?.total_revenue || 0)}</p>
                          <p className="text-xs text-text-muted">{(emp.metrics?.x_multiple || 0).toFixed(2)}x</p>
                        </div>
                      </div>
                    ))}
                  {employees.length === 0 && (
                    <div className="text-center py-10">
                      <Users className="w-8 h-8 text-text-faint mx-auto mb-2" />
                      <p className="text-sm text-text-muted">No employees yet</p>
                    </div>
                  )}
                </div>
              </div>
              {/* Recent Deals */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-text-primary">Recent Deals</h3>
                  <button onClick={() => setActiveTab('deals')} className="text-xs text-text-muted hover:text-text-secondary flex items-center gap-1 transition-colors">
                    View all <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="space-y-1">
                  {deals.slice(0, 6).map(deal => (
                    <div key={deal.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-bg-base transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`px-2 py-1 rounded-lg text-xs font-medium ${PRODUCT_COLORS[deal.product_type] || 'bg-bg-raised text-text-secondary'}`}>
                          {PRODUCT_LABELS[deal.product_type]?.split(' ')[0]}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-text-primary">{deal.employee_name}</p>
                          <p className="text-xs text-text-muted">{deal.client_name || 'No client'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-text-primary">{formatCurrency(deal.revenue)}</p>
                        <StatusBadge status={deal.status} />
                      </div>
                    </div>
                  ))}
                  {deals.length === 0 && (
                    <div className="text-center py-10">
                      <Briefcase className="w-8 h-8 text-text-faint mx-auto mb-2" />
                      <p className="text-sm text-text-muted">No deals yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── EMPLOYEES ── */}
          {activeTab === 'employees' && (
            <div>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input type="text" placeholder="Search employees..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent w-60 bg-bg-base" />
                </div>
                <button onClick={() => { setEditingEmployee(null); setShowEmployeeModal(true); }}
                  className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors text-sm font-semibold">
                  <Plus className="w-4 h-4" /> Add Employee
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      {['Employee', 'Designation', 'Revenue', 'X Multiple', 'Incentive', 'Categories', 'Status', ''].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredEmployees.length === 0 && (
                      <tr><td colSpan={8} className="px-5 py-12 text-center text-text-muted text-sm">No employees found</td></tr>
                    )}
                    {filteredEmployees.map(emp => (
                      <tr key={emp.id} className="hover:bg-bg-base/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={emp.full_name} size="md" />
                            <div>
                              <p className="text-sm font-semibold text-text-primary">{emp.full_name}</p>
                              <p className="text-xs text-text-muted">{emp.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-medium text-text-secondary bg-bg-raised px-2 py-1 rounded-lg">{emp.level}</span>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-text-primary">{formatCurrency(emp.metrics?.total_revenue || 0)}</td>
                        <td className="px-5 py-4">
                          <span className={`text-sm font-bold ${(emp.metrics?.x_multiple || 0) >= 2.1 ? 'text-emerald-600' : 'text-text-muted'}`}>
                            {(emp.metrics?.x_multiple || 0).toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-emerald-600">{formatCurrency(emp.metrics?.incentive_amount || 0)}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold ${
                            (emp.metrics?.product_categories || 0) >= 3 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                          }`}>
                            {emp.metrics?.product_categories || 0}/3+
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                            emp.is_active !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-bg-raised text-text-muted'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${emp.is_active !== false ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                            {emp.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditingEmployee(emp); setShowEmployeeModal(true); }}
                              className="p-1.5 hover:bg-bg-raised rounded-lg transition-colors text-text-muted hover:text-text-secondary">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleToggleActive(emp)}
                              className="p-1.5 hover:bg-bg-raised rounded-lg transition-colors text-text-muted hover:text-text-secondary"
                              title={emp.is_active !== false ? 'Deactivate' : 'Activate'}>
                              {emp.is_active !== false ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setDeleteConfirm({ type: 'employee', id: emp.id })}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-text-faint hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── DEALS ── */}
          {activeTab === 'deals' && (
            <div>
              <div className="flex items-center gap-4 px-6 py-4 border-b border-border-subtle">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input type="text" placeholder="Search by employee, client, product..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent w-full bg-bg-base" />
                </div>
                <span className="text-sm text-text-muted font-medium">{filteredDeals.length} deals</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      {['Employee', 'Client', 'Product', 'Amount', 'Revenue', 'Status', 'Date', ''].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredDeals.length === 0 && (
                      <tr><td colSpan={8} className="px-5 py-12 text-center text-text-muted text-sm">No deals found</td></tr>
                    )}
                    {filteredDeals.map(deal => (
                      <tr key={deal.id} className="hover:bg-bg-base/50 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Avatar name={deal.employee_name || '?'} size="sm" />
                            <span className="text-sm font-semibold text-text-primary whitespace-nowrap">{deal.employee_name}</span>
                          </div>
                        </td>
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
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditingDeal(deal)}
                              className="p-1.5 hover:bg-bg-raised rounded-lg transition-colors text-text-faint hover:text-text-secondary">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteConfirm({ type: 'deal', id: deal.id })}
                              className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-text-faint hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── CLIENTS ── */}
          {activeTab === 'clients' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-subtle">
                    {['Client', 'Phone', 'Email', 'Added By', 'Date', 'Notes'].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {clients.length === 0 && (
                    <tr><td colSpan={6} className="px-5 py-12 text-center text-text-muted text-sm">No clients yet</td></tr>
                  )}
                  {clients.map((c: any) => (
                    <tr key={c.id} className="hover:bg-bg-base/50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Avatar name={c.name} size="sm" />
                          <span className="text-sm font-semibold text-text-primary">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-text-secondary">{c.phone || <span className="text-text-faint">—</span>}</td>
                      <td className="px-5 py-4 text-sm text-text-secondary">{c.email || <span className="text-text-faint">—</span>}</td>
                      <td className="px-5 py-4 text-sm text-text-secondary">{c.crm_users?.full_name || '—'}</td>
                      <td className="px-5 py-4 text-xs text-text-muted">
                        {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-4 text-sm text-text-muted max-w-[200px] truncate">{c.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── INCENTIVE SLABS ── */}
          {activeTab === 'incentives' && (
            <div className="p-6">
              <div className="flex items-start gap-4 mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-amber-900">Incentive Slab System</p>
                  <p className="text-xs text-amber-700 mt-0.5">Revenue share % based on X Multiple (Total Revenue ÷ Monthly Salary). Requires ≥ 3 product categories and ≥ 2.1x multiple.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      {['X Min', 'X Max', 'Level', 'Revenue Share'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {slabRules.map(slab => (
                      <tr key={slab.id} className="hover:bg-bg-base/50">
                        <td className="px-5 py-3.5 text-sm font-bold text-text-primary">{slab.x_min}x</td>
                        <td className="px-5 py-3.5 text-sm text-text-secondary">{slab.x_max != null ? `${slab.x_max}x` : <span className="text-text-muted">No limit</span>}</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            slab.level === 'Level 4' ? 'bg-amber-100 text-amber-800' :
                            slab.level === 'Level 3' ? 'bg-blue-100 text-blue-800' :
                            slab.level === 'Level 2' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-bg-raised text-text-secondary'
                          }`}>{slab.level}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-bold text-emerald-600">{(slab.share_percentage * 100).toFixed(1)}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-6 p-4 bg-bg-base border border-border rounded-xl">
                <p className="text-xs font-bold text-text-secondary flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Eligibility Requirements</p>
                <ul className="mt-2 space-y-1.5 text-xs text-text-muted">
                  {['Minimum X Multiple of 2.1x required to earn incentive', 'Minimum 3 distinct product categories required', 'At 20x+, payout is capped at 60% of total revenue', 'Only closed, non-clawback deals count toward metrics'].map((r, i) => (
                    <li key={i} className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showEmployeeModal && (
        <EmployeeModal employee={editingEmployee} onClose={() => { setShowEmployeeModal(false); setEditingEmployee(null); }} onSaved={loadEmployees} />
      )}
      {editingDeal && (
        <DealModal deal={editingDeal} onClose={() => setEditingDeal(null)} onSaved={loadDeals} />
      )}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-bg-elevated rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-bold text-text-primary text-center mb-1">Delete {deleteConfirm.type}?</h3>
            <p className="text-sm text-text-muted text-center mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2.5 border border-border text-text-secondary rounded-xl hover:bg-bg-base text-sm font-medium">Cancel</button>
              <button onClick={() => deleteConfirm.type === 'employee' ? handleDeleteEmployee(deleteConfirm.id) : handleDeleteDeal(deleteConfirm.id)}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
