import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CRMUser } from '../types';
import { ArrowLeft, CheckCircle2, AlertCircle, Briefcase } from 'lucide-react';

const PRODUCT_TYPES = [
  { value: 'mutual_funds', label: 'Mutual Funds', color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100', active: 'bg-blue-600 border-blue-600 text-white' },
  { value: 'insurance', label: 'Insurance', color: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100', active: 'bg-emerald-600 border-emerald-600 text-white' },
  { value: 'fixed_deposits', label: 'Fixed Deposits', color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100', active: 'bg-amber-600 border-amber-600 text-white' },
  { value: 'bonds', label: 'Bonds', color: 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100', active: 'bg-slate-700 border-slate-700 text-white' },
  { value: 'unlisted_shares', label: 'Unlisted Shares', color: 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100', active: 'bg-rose-600 border-rose-600 text-white' },
  { value: 'primary_bonds', label: 'Primary Bonds', color: 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100', active: 'bg-cyan-600 border-cyan-600 text-white' },
  { value: 'other', label: 'Other', color: 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100', active: 'bg-gray-700 border-gray-700 text-white' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', active: 'bg-amber-500 border-amber-500 text-white', inactive: 'border-gray-200 text-gray-600 hover:border-amber-300 hover:bg-amber-50' },
  { value: 'closed', label: 'Closed', active: 'bg-emerald-600 border-emerald-600 text-white', inactive: 'border-gray-200 text-gray-600 hover:border-emerald-300 hover:bg-emerald-50' },
  { value: 'cancelled', label: 'Cancelled', active: 'bg-red-600 border-red-600 text-white', inactive: 'border-gray-200 text-gray-600 hover:border-red-300 hover:bg-red-50' },
];

export default function AddDeal() {
  const [employee, setEmployee] = useState<CRMUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    client_name: '',
    product_type: '',
    amount: '',
    revenue: '',
    status: 'pending',
    notes: '',
  });

  useEffect(() => { loadEmployee(); }, []);

  const loadEmployee = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/crm/login'; return; }
      const { data: crmUser } = await supabase.from('crm_users').select('*').eq('auth_user_id', user.id).maybeSingle();
      if (!crmUser || crmUser.role !== 'employee') { window.location.href = '/crm/login'; return; }
      setEmployee(crmUser);
    } catch (err) { console.error(err); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!employee) throw new Error('Employee not found');
      const amount = parseFloat(formData.amount);
      const revenue = parseFloat(formData.revenue);
      if (isNaN(amount) || amount <= 0) throw new Error('Please enter a valid deal amount');
      if (isNaN(revenue) || revenue < 0) throw new Error('Please enter a valid revenue amount');
      const { error: insertError } = await supabase.from('deals').insert([{
        employee_id: employee.id,
        client_name: formData.client_name,
        product_type: formData.product_type,
        amount,
        revenue,
        status: formData.status,
        notes: formData.notes,
        closed_at: formData.status === 'closed' ? new Date().toISOString() : null,
      }]);
      if (insertError) throw insertError;
      setSuccess(true);
      setTimeout(() => { window.location.href = '/crm/employee'; }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to add deal');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-10 text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Deal Added!</h2>
          <p className="text-sm text-gray-400">Redirecting to your dashboard...</p>
          <div className="mt-4 w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center h-14 gap-3">
            <button onClick={() => window.location.href = '/crm/employee'}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gray-900 rounded-lg flex items-center justify-center">
                <Briefcase className="w-3 h-3 text-white" />
              </div>
              <span className="text-sm font-bold text-gray-900">Record a Deal</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">New Deal</h1>
          <p className="text-sm text-gray-400 mt-0.5">{employee?.full_name} · {employee?.level}</p>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Client Name */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Client Name</label>
            <input type="text" value={formData.client_name}
              onChange={e => setFormData({ ...formData, client_name: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
              placeholder="Client full name (optional)" />
          </div>

          {/* Product Type */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Product Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRODUCT_TYPES.map(type => (
                <button key={type.value} type="button"
                  onClick={() => setFormData({ ...formData, product_type: type.value })}
                  className={`px-3 py-2.5 text-sm rounded-xl border font-medium transition-all text-left ${
                    formData.product_type === type.value ? type.active : type.color
                  }`}>
                  {type.label}
                </button>
              ))}
            </div>
            {!formData.product_type && <input type="text" required className="sr-only" value={formData.product_type} readOnly />}
          </div>

          {/* Amounts */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Deal Amount (₹) <span className="text-red-500">*</span>
                </label>
                <input type="number" step="1" min="1" value={formData.amount}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                  placeholder="e.g. 500000" required />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Revenue Earned (₹) <span className="text-red-500">*</span>
                </label>
                <input type="number" step="1" min="0" value={formData.revenue}
                  onChange={e => setFormData({ ...formData, revenue: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors"
                  placeholder="e.g. 5000" required />
                <p className="text-xs text-gray-400 mt-1.5">Commission / brokerage earned</p>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Status <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {STATUS_OPTIONS.map(s => (
                <button key={s.value} type="button"
                  onClick={() => setFormData({ ...formData, status: s.value })}
                  className={`flex-1 py-2.5 text-sm rounded-xl border font-semibold transition-all ${
                    formData.status === s.value ? s.active : s.inactive
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Notes</label>
            <textarea value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-transparent text-sm bg-gray-50 focus:bg-white transition-colors resize-none"
              placeholder="Any relevant notes about this deal..." />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button type="button" onClick={() => window.location.href = '/crm/employee'}
              className="flex-1 px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={loading || !formData.product_type}
              className="flex-1 px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-all text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow-md">
              {loading ? 'Adding...' : 'Add Deal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
