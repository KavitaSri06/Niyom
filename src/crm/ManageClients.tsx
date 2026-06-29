import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWClient } from './types';
import { fmt, fmtDate, VERIFICATION_LABELS, VERIFICATION_COLORS } from './utils';
import { Search, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, Download, X, CheckCircle2, AlertCircle, Filter, FolderOpen, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';

interface Props { employee: NWEmployee; onNavigate: (page: any, params?: any) => void; }

const PAGE_SIZE = 10;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden max-h-[90vh] flex flex-col" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} style={{ color: 'var(--text-faint)' }}><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}

export default function ManageClients({ employee }: Props) {
  const [clients, setClients] = useState<NWClient[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [employees, setEmployees] = useState<{ id: string; full_name: string; employee_code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewClient, setViewClient] = useState<NWClient | null>(null);
  const [editClient, setEditClient] = useState<NWClient | null>(null);
  const [deleteClient, setDeleteClient] = useState<NWClient | null>(null);
  const [loginClient, setLoginClient] = useState<NWClient | null>(null);
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSaving, setLoginSaving] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);
  const [editForm, setEditForm] = useState<Partial<NWClient>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [editDupWarnings, setEditDupWarnings] = useState<Record<'pan' | 'phone' | 'email', string | null>>({ pan: null, phone: null, email: null });
  const dupTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';

  // Load employee list for admin filter
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('nw_employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name')
      .then(({ data }) => setEmployees(data || []));
  }, [isAdmin]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('nw_clients')
      .select('*, employee:nw_employees(full_name, employee_code)', { count: 'exact' });

    if (search) query = query.or(`full_name.ilike.%${search}%,client_code.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,pan.ilike.%${search}%`);

    if (!isAdmin) {
      query = query.eq('employee_id', employee.id);
    } else if (employeeFilter === 'unassigned') {
      query = query.is('employee_id', null);
    } else if (employeeFilter !== 'all') {
      query = query.eq('employee_id', employeeFilter);
    }

    query = query.order('created_at', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, count } = await query;
    setClients((data as NWClient[]) || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, search, employeeFilter, isAdmin, employee.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, employeeFilter]);

  const checkEditDuplicate = useCallback(async (field: 'pan' | 'phone' | 'email', value: string, excludeId: string) => {
    if (!value || value.length < 3) { setEditDupWarnings(w => ({ ...w, [field]: null })); return; }
    const col = field === 'phone' ? 'phone' : field;
    const { data } = await supabase.from('nw_clients')
      .select('id, full_name, employee:nw_employees(full_name)')
      .eq(col, value).neq('id', excludeId).limit(1);
    if (data && data.length > 0) {
      const match = data[0] as any;
      const empName = match.employee?.full_name || 'Admin';
      setEditDupWarnings(w => ({ ...w, [field]: `Client "${match.full_name}" already exists under ${empName}` }));
    } else {
      setEditDupWarnings(w => ({ ...w, [field]: null }));
    }
  }, []);

  const onEditFieldChange = (field: 'pan' | 'phone' | 'email', value: string, excludeId: string) => {
    setEditForm(f => ({ ...f, [field]: value }));
    clearTimeout(dupTimers.current[field]);
    dupTimers.current[field] = setTimeout(() => checkEditDuplicate(field, value, excludeId), 600);
  };

  const handleEdit = (c: NWClient) => {
    setEditClient(c);
    setEditDupWarnings({ pan: null, phone: null, email: null });
    setEditForm({
      full_name: c.full_name, email: c.email, phone: c.phone, pan: c.pan,
      address: c.address, city: c.city, state: c.state,
      demat_account: c.demat_account, dp_name: c.dp_name,
      bank_account: c.bank_account, bank_ifsc: c.bank_ifsc, bank_name: c.bank_name,
      verification_status: c.verification_status, notes: c.notes,
    });
  };

  const handleSaveEdit = async () => {
    if (!editClient) return;
    setSaving(true);
    const { error } = await supabase.from('nw_clients').update({ ...editForm, updated_at: new Date().toISOString() }).eq('id', editClient.id);
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    setEditClient(null);
    showToast('Client updated.');
    load();
  };

  const handleDelete = async () => {
    if (!deleteClient) return;
    setSaving(true);
    const { error } = await supabase.from('nw_clients').delete().eq('id', deleteClient.id);
    setSaving(false);
    if (error) { showToast(error.message, false); return; }
    setDeleteClient(null);
    showToast('Client deleted.');
    load();
  };

  const handleEnableLogin = async () => {
    if (!loginClient || loginPassword.length < 8) return;
    setLoginSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/create-client-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          client_id: loginClient.id,
          email: loginClient.email,
          pan: loginClient.pan,
          initial_password: loginPassword,
        }),
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        showToast(result.error || 'Failed to enable login', false);
      } else {
        showToast(`Client login enabled for ${loginClient.full_name}`);
        setLoginClient(null);
        setLoginPassword('');
        load();
      }
    } catch {
      showToast('Network error — please try again', false);
    }
    setLoginSaving(false);
  };

  const handleResetClientPassword = async (client: NWClient) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    try {
      await fetch(`${supabaseUrl}/functions/v1/secure-client-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan: client.pan }),
      });
      showToast(`Password reset email sent to ${client.email}`);
    } catch {
      showToast('Failed to send reset email', false);
    }
  };

  const exportCSV = () => {
    const headers = ['Code', 'Name', 'Email', 'Phone', 'PAN', 'Portfolio', 'Status', 'Date'];
    const rows = clients.map(c => [c.client_code, c.full_name, c.email, c.phone, c.pan, c.portfolio_value, c.verification_status, fmtDate(c.created_at)]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv,' + encodeURIComponent(csv); a.download = 'clients.csv'; a.click();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const inputStyle = { background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' };
  const InlineField = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
    </div>
  );
  const EditDupWarn = ({ msg }: { msg: string | null }) => !msg ? null : (
    <div className="mt-1.5 flex items-start gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' }}>
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'rgb(var(--warning-soft-rgb))' }} />
      <p className="text-xs" style={{ color: 'rgb(var(--warning-soft-rgb))' }}>{msg}</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Clients</p>
          <h1 className="text-2xl font-bold text-text-primary">Manage Clients</h1>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      {toast && (
        <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: toast.ok ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4 text-c-emerald" /> : <AlertCircle className="w-4 h-4 text-c-red" />}
          <p className={`text-sm ${toast.ok ? 'text-c-emerald' : 'text-c-red'}`}>{toast.msg}</p>
        </div>
      )}

      {/* Search + Employee Filter */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-faint)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, code, email, phone, PAN..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          />
        </div>
        {isAdmin && (
          <div className="relative flex-shrink-0">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />
            <select
              value={employeeFilter}
              onChange={e => setEmployeeFilter(e.target.value)}
              className="pl-8 pr-8 py-2.5 rounded-xl text-sm text-text-primary outline-none appearance-none"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', minWidth: '180px' }}
            >
              <option value="all">All Employees</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
              ))}
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Client', 'Code', ...(isAdmin ? ['Employee'] : []), 'Portfolio', 'Status', 'Date', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-12"><div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin mx-auto" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} /></td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="text-center py-12 text-sm" style={{ color: 'var(--text-faint)' }}>No clients found</td></tr>
              ) : clients.map(c => (
                <tr key={c.id} className="transition-colors" style={{ borderBottom: '1px solid var(--bg-raised)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-text-primary">{c.full_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{c.phone || c.email || '—'}</p>
                  </td>
                  <td className="px-5 py-3.5"><span className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--bg-raised)', color: 'var(--accent)' }}>{c.client_code}</span></td>
                  {isAdmin && <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{(c.employee as any)?.full_name || 'Admin'}</td>}
                  <td className="px-5 py-3.5 text-sm font-semibold text-text-primary">{fmt(c.portfolio_value || 0)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${VERIFICATION_COLORS[c.verification_status]}`}>
                      {VERIFICATION_LABELS[c.verification_status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(c.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewClient(c)} className="p-1.5 rounded-lg transition-colors" title="View Details" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Eye className="w-4 h-4" /></button>
                      <button onClick={() => onNavigate('documents', { clientId: c.id })} className="p-1.5 rounded-lg transition-colors" title="View Documents" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--success)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><FolderOpen className="w-4 h-4" /></button>
                      <button onClick={() => handleEdit(c)} className="p-1.5 rounded-lg transition-colors" title="Edit" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = 'rgb(var(--info-soft-rgb))')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Pencil className="w-4 h-4" /></button>
                      {c.client_login_enabled
                        ? <button onClick={() => handleResetClientPassword(c)} className="p-1.5 rounded-lg transition-colors" title="Send Password Reset Email" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--success)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><ShieldCheck className="w-4 h-4" /></button>
                        : <button onClick={() => { setLoginClient(c); setLoginPassword(''); setShowLoginPw(false); }} className="p-1.5 rounded-lg transition-colors" title="Enable Client Login" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--warning)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><KeyRound className="w-4 h-4" /></button>
                      }
                      {isAdmin && <button onClick={() => setDeleteClient(c)} className="p-1.5 rounded-lg transition-colors" title="Delete" style={{ color: 'var(--text-faint)' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-text-primary">{page + 1} / {totalPages || 1}</span>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="p-1.5 rounded-lg disabled:opacity-30" style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* View Modal */}
      {viewClient && (
        <Modal title={`${viewClient.full_name} — ${viewClient.client_code}`} onClose={() => setViewClient(null)}>
          <div className="p-6 space-y-5">
            {[
              { title: 'Personal', rows: [['Name', viewClient.full_name], ['Email', viewClient.email], ['Phone', viewClient.phone], ['PAN', viewClient.pan], ['DOB', viewClient.dob ? fmtDate(viewClient.dob) : '—']] },
              { title: 'Address', rows: [['Address', viewClient.address], ['City', viewClient.city], ['State', viewClient.state]] },
              { title: 'Demat & Bank', rows: [['Demat A/C', viewClient.demat_account], ['DP Name', viewClient.dp_name], ['Bank A/C', viewClient.bank_account], ['IFSC', viewClient.bank_ifsc], ['Bank', viewClient.bank_name]] },
              { title: 'Account', rows: [['Client Code', viewClient.client_code], ['Portfolio', fmt(viewClient.portfolio_value || 0)], ['Status', VERIFICATION_LABELS[viewClient.verification_status]], ['Created', fmtDate(viewClient.created_at)]] },
            ].map(s => (
              <div key={s.title}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>{s.title}</p>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                  {s.rows.map(([k, v]) => (
                    <div key={k} className="flex gap-3 px-4 py-2.5" style={{ borderBottom: '1px solid var(--bg-surface)' }}>
                      <p className="text-xs w-28 flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{k}</p>
                      <p className="text-xs text-text-primary">{v || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {viewClient.notes && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--accent)' }}>Notes</p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{viewClient.notes}</p>
              </div>
            )}
            <div className="pt-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={() => { setViewClient(null); onNavigate('documents', { clientId: viewClient.id }); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                style={{ background: 'rgba(16,185,129,0.08)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <FolderOpen className="w-4 h-4" /> View Documents
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editClient && (
        <Modal title={`Edit — ${editClient.full_name}`} onClose={() => setEditClient(null)}>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                ['Full Name', 'full_name', 'text'], ['City', 'city', 'text'], ['State', 'state', 'text'],
                ['Demat A/C', 'demat_account', 'text'], ['DP Name', 'dp_name', 'text'],
                ['Bank A/C', 'bank_account', 'text'], ['IFSC', 'bank_ifsc', 'text'], ['Bank Name', 'bank_name', 'text'],
              ].map(([label, key, type]) => (
                <InlineField key={key} label={label}>
                  <input type={type} value={(editForm as any)[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl text-sm text-text-primary outline-none"
                    style={inputStyle}
                  />
                </InlineField>
              ))}
              <InlineField label="Email">
                <input type="email" value={editForm.email || ''} onChange={e => onEditFieldChange('email', e.target.value, editClient!.id)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-text-primary outline-none" style={inputStyle} />
                <EditDupWarn msg={editDupWarnings.email} />
              </InlineField>
              <InlineField label="Phone">
                <input type="tel" value={editForm.phone || ''} onChange={e => onEditFieldChange('phone', e.target.value.replace(/\D/g, '').slice(0, 10), editClient!.id)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-text-primary outline-none" style={inputStyle} />
                <EditDupWarn msg={editDupWarnings.phone} />
              </InlineField>
              <InlineField label="PAN">
                <input type="text" value={editForm.pan || ''} onChange={e => onEditFieldChange('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10), editClient!.id)}
                  className="w-full px-3 py-2 rounded-xl text-sm text-text-primary outline-none" style={inputStyle} />
                <EditDupWarn msg={editDupWarnings.pan} />
              </InlineField>
              <InlineField label="Verification Status">
                <select value={editForm.verification_status || 'pending'} onChange={e => setEditForm(f => ({ ...f, verification_status: e.target.value as any }))}
                  className="w-full px-3 py-2 rounded-xl text-sm text-text-primary outline-none"
                  style={inputStyle}>
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="verified">Verified</option>
                  <option value="rejected">Rejected</option>
                </select>
              </InlineField>
            </div>
            <InlineField label="Notes">
              <textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm text-text-primary outline-none resize-none"
                style={inputStyle}
              />
            </InlineField>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setEditClient(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-on-accent disabled:opacity-50" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Enable Client Login Modal */}
      {loginClient && (
        <Modal title={`Enable Portal Login — ${loginClient.full_name}`} onClose={() => setLoginClient(null)}>
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-xl" style={{ background: 'rgba(var(--accent-rgb),0.05)', border: '1px solid rgba(var(--accent-rgb),0.15)' }}>
              <div className="flex items-start gap-3">
                <KeyRound className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                <div className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                  <p><span className="text-text-primary font-semibold">Login ID:</span> {loginClient.pan}</p>
                  <p><span className="text-text-primary font-semibold">Email:</span> {loginClient.email}</p>
                  <p className="mt-1.5" style={{ color: 'var(--text-faint)' }}>The client will use their PAN number to log in and will be prompted to change this password on first login.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>First-Time Password <span style={{ color: 'var(--accent)' }}>*</span></label>
              <div className="relative">
                <input
                  type={showLoginPw ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-text-primary outline-none"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingRight: '2.75rem' }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
                <button type="button" onClick={() => setShowLoginPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-faint)' }}>
                  {showLoginPw ? <ShieldOff className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                {[
                  { text: 'At least 8 characters', met: loginPassword.length >= 8 },
                ].map(r => (
                  <p key={r.text} className="text-xs flex items-center gap-1.5" style={{ color: r.met ? 'var(--success)' : 'var(--text-faint)' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.met ? 'var(--success)' : 'var(--text-faint)' }} />
                    {r.text}
                  </p>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setLoginClient(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleEnableLogin} disabled={loginSaving || loginPassword.length < 8}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent disabled:opacity-50 flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
                {loginSaving ? 'Enabling...' : <><KeyRound className="w-3.5 h-3.5" /> Enable Login</>}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Modal */}
      {deleteClient && (
        <Modal title="Delete Client" onClose={() => setDeleteClient(null)}>
          <div className="p-6 space-y-4">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to delete <span className="text-text-primary font-semibold">{deleteClient.full_name}</span>? This will also delete all their holdings, transactions, and documents. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteClient(null)} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleDelete} disabled={saving} className="px-5 py-2 rounded-xl text-sm font-bold text-text-primary disabled:opacity-50" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                {saving ? 'Deleting...' : 'Delete Client'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
