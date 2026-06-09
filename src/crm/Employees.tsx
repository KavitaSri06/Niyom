import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee } from './types';
import { fmt, fmtDate } from './utils';
import { Plus, X, Pencil, Users, UserCheck, UserX, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props { employee: NWEmployee; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1E1E24' }}>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} style={{ color: '#4A4A4A' }}><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = { super_admin: 'Super Admin', admin: 'Admin', employee: 'Employee' };
const ROLE_COLORS: Record<string, string> = {
  super_admin: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  admin: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  employee: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
};

export default function Employees({ employee }: Props) {
  const [employees, setEmployees] = useState<NWEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editEmp, setEditEmp] = useState<NWEmployee | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const [addForm, setAddForm] = useState({ full_name: '', email: '', password: '', role: 'employee', employee_code: '' });
  const [editForm, setEditForm] = useState({ full_name: '', phone: '', role: 'employee', status: 'active' });
  const [addError, setAddError] = useState('');

  const isSuperAdmin = employee.role === 'super_admin';

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('nw_employees').select('*').order('created_at', { ascending: false });
    setEmployees((data as NWEmployee[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!addForm.employee_code || !addForm.full_name || !addForm.email || !addForm.password) { setAddError('All fields are required.'); return; }
    if (!/^NIYOM-\d+$/i.test(addForm.employee_code.trim())) { setAddError('Employee ID must be in format NIYOM-001'); return; }
    if (addForm.password.length < 8) { setAddError('Password must be at least 8 characters.'); return; }
    setAddError('');
    setSaving(true);

    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-crm-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email: addForm.email, password: addForm.password, full_name: addForm.full_name, role: addForm.role, employee_code: addForm.employee_code.trim().toUpperCase() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok || json.error) { setAddError(json.error || 'Failed to create employee'); return; }
    setShowAdd(false);
    setAddForm({ full_name: '', email: '', password: '', role: 'employee', employee_code: '' });
    showToast(`Employee created with code ${json.employee_code}`);
    load();
  };

  const handleEdit = async () => {
    if (!editEmp) return;
    setSaving(true);
    const { error } = await supabase.from('nw_employees').update({ full_name: editForm.full_name, phone: editForm.phone, role: editForm.role, status: editForm.status, updated_at: new Date().toISOString() }).eq('id', editEmp.id);
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    setEditEmp(null);
    showToast('Employee updated.');
    load();
  };

  const toggleStatus = async (emp: NWEmployee) => {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('nw_employees').update({ status: newStatus }).eq('id', emp.id);
    if (error) { showToast(error.message, false); return; }
    showToast(`${emp.full_name} marked as ${newStatus}.`);
    load();
  };

  const stats = {
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    inactive: employees.filter(e => e.status === 'inactive').length,
  };

  const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none";
  const inputStyle = { background: '#050505', border: '1px solid #1E1E24' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#D4AF37' }}>Team</p>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
        </div>
        {isSuperAdmin && (
          <button onClick={() => { setShowAdd(true); setAddError(''); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-black" style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
            <Plus className="w-4 h-4" /> Add Employee
          </button>
        )}
      </div>

      {toast && (
        <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: toast.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-red-400" />}
          <p className={`text-sm ${toast.ok ? 'text-emerald-400' : 'text-red-400'}`}>{toast.msg}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Users, color: '#D4AF37' },
          { label: 'Active', value: stats.active, icon: UserCheck, color: '#10B981' },
          { label: 'Inactive', value: stats.inactive, icon: UserX, color: '#ef4444' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl p-5 flex items-center gap-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: s.color + '15' }}>
                <Icon className="w-5 h-5" style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="text-xs" style={{ color: '#4A4A4A' }}>{s.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                {['Employee', 'Code', 'Role', 'Status', 'Joined', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A4A4A' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} /></td></tr>
              ) : employees.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #111' }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = '#0D0D0D')}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37' }}>
                        {e.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{e.full_name}</p>
                        <p className="text-xs" style={{ color: '#4A4A4A' }}>{e.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5"><span className="text-xs font-mono px-2 py-1 rounded" style={{ background: '#111', color: '#D4AF37' }}>{e.employee_code}</span></td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${ROLE_COLORS[e.role]}`}>{ROLE_LABELS[e.role]}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${e.status === 'active' ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20'}`}>
                      {e.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: '#6B6B6B' }}>{fmtDate(e.joining_date || e.created_at)}</td>
                  <td className="px-5 py-3.5">
                    {e.id !== employee.id && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => { setEditEmp(e); setEditForm({ full_name: e.full_name, phone: e.phone || '', role: e.role, status: e.status }); }}
                          className="p-1.5 rounded-lg" style={{ color: '#4A4A4A' }}
                          onMouseEnter={ev => (ev.currentTarget.style.color = '#60a5fa')} onMouseLeave={ev => (ev.currentTarget.style.color = '#4A4A4A')}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleStatus(e)} className="p-1.5 rounded-lg" style={{ color: '#4A4A4A' }}
                          onMouseEnter={ev => (ev.currentTarget.style.color = e.status === 'active' ? '#ef4444' : '#10B981')}
                          onMouseLeave={ev => (ev.currentTarget.style.color = '#4A4A4A')}>
                          {e.status === 'active' ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Employee Modal */}
      {showAdd && (
        <Modal title="Add Employee" onClose={() => setShowAdd(false)}>
          <div className="p-6 space-y-4">
            {addError && <div className="p-3 rounded-xl text-sm text-red-400" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>{addError}</div>}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>Employee ID <span style={{ color: '#D4AF37' }}>*</span></label>
              <input type="text" value={addForm.employee_code} onChange={e => setAddForm(f => ({ ...f, employee_code: e.target.value }))} placeholder="e.g. NIYOM-002" className={inputClass} style={inputStyle} />
              <p className="text-xs mt-1" style={{ color: '#4A4A4A' }}>Client IDs will be generated as NW-002-0001, NW-002-0002, ...</p>
            </div>
            {[['Full Name', 'full_name', 'text'], ['Email', 'email', 'email']].map(([label, key, type]) => (
              <div key={key}>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>{label}</label>
                <input type={type} value={(addForm as any)[key]} onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} style={inputStyle} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>Password</label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={addForm.password} onChange={e => setAddForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 characters" className={`${inputClass} pr-10`} style={inputStyle} />
                <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#4A4A4A' }}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>Role</label>
              <select value={addForm.role} onChange={e => setAddForm(f => ({ ...f, role: e.target.value }))} className={inputClass} style={inputStyle}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
              </select>
            </div>
            <p className="text-xs" style={{ color: '#4A4A4A' }}>Employee will be prompted to change password on first login.</p>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl text-sm" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>Cancel</button>
              <button onClick={handleAdd} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-black disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                {saving ? 'Creating...' : 'Create Employee'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Employee Modal */}
      {editEmp && (
        <Modal title={`Edit — ${editEmp.full_name}`} onClose={() => setEditEmp(null)}>
          <div className="p-6 space-y-4">
            {[['Full Name', 'full_name', 'text'], ['Phone', 'phone', 'tel']].map(([label, key, type]) => (
              <div key={key}>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>{label}</label>
                <input type={type} value={(editForm as any)[key]} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} className={inputClass} style={inputStyle} />
              </div>
            ))}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>Role</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={inputClass} style={inputStyle}>
                <option value="employee">Employee</option>
                <option value="admin">Admin</option>
                {isSuperAdmin && <option value="super_admin">Super Admin</option>}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>Status</label>
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={inputClass} style={inputStyle}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditEmp(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>Cancel</button>
              <button onClick={handleEdit} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-black disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
