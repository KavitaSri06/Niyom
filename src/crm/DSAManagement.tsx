import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWDSA } from './types';
import {
  Handshake, Plus, X, Upload, CheckCircle2, AlertCircle,
  Search, Phone, Mail, CreditCard, Building2, User, Eye, EyeOff,
  ToggleLeft, ToggleRight, Trash2, ChevronDown,
} from 'lucide-react';

interface Props { employee: NWEmployee; }

interface DSAFormData {
  full_name: string;
  email: string;
  mobile: string;
  pan: string;
  address: string;
  bank_name: string;
  bank_account: string;
  bank_ifsc: string;
}

const EMPTY_FORM: DSAFormData = {
  full_name: '', email: '', mobile: '', pan: '',
  address: '', bank_name: '', bank_account: '', bank_ifsc: '',
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8A8A8A' }}>
        {label}{required && <span className="ml-0.5" style={{ color: '#D4AF37' }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      className={`w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none transition-all ${props.className || ''}`}
      style={{
        background: '#0D0D0D',
        border: `1px solid ${focused ? '#D4AF37' : '#1E1E24'}`,
        ...props.style,
      }}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      className={`w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none transition-all resize-none ${props.className || ''}`}
      style={{
        background: '#0D0D0D',
        border: `1px solid ${focused ? '#D4AF37' : '#1E1E24'}`,
        ...props.style,
      }}
      onFocus={e => { setFocused(true); props.onFocus?.(e); }}
      onBlur={e => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

export default function DSAManagement({ employee }: Props) {
  const [dsas, setDsas] = useState<NWDSA[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<DSAFormData>(EMPTY_FORM);
  const [docs, setDocs] = useState<{ photo: File | null; pan: File | null; bank: File | null }>({ photo: null, pan: null, bank: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [viewDSA, setViewDSA] = useState<NWDSA | null>(null);
  const [deleteDSA, setDeleteDSA] = useState<NWDSA | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [empList, setEmpList] = useState<{ id: string; full_name: string; employee_code: string }[]>([]);
  const [empFilter, setEmpFilter] = useState('all');

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';

  const fetchDSAs = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('nw_dsa').select('*, employee:nw_employees(full_name, employee_code)').order('dsa_code');
    if (!isAdmin) q = q.eq('employee_id', employee.id);
    else if (empFilter !== 'all') q = q.eq('employee_id', empFilter);
    const { data } = await q;
    setDsas((data as NWDSA[]) || []);
    setLoading(false);
  }, [isAdmin, employee.id, empFilter]);

  useEffect(() => { fetchDSAs(); }, [fetchDSAs]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('nw_employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name')
      .then(({ data }) => setEmpList((data as any[]) || []));
  }, [isAdmin]);

  const set = (k: keyof DSAFormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    if (!form.full_name.trim()) { setError('Full name is required.'); return false; }
    if (!form.mobile.trim() || !/^[6-9]\d{9}$/.test(form.mobile)) { setError('Valid 10-digit mobile number is required.'); return false; }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { setError('Valid email is required.'); return false; }
    if (!form.pan.trim() || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan)) { setError('Valid PAN (e.g. ABCDE1234F) is required.'); return false; }
    if (!form.bank_name.trim()) { setError('Bank name is required.'); return false; }
    if (!form.bank_account.trim()) { setError('Bank account number is required.'); return false; }
    if (!form.bank_ifsc.trim() || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bank_ifsc)) { setError('Valid IFSC code is required.'); return false; }
    return true;
  };

  const uploadDoc = async (file: File, path: string): Promise<string | null> => {
    const { error } = await supabase.storage.from('crm-documents').upload(path, file, { upsert: true });
    if (error) return null;
    const { data } = supabase.storage.from('crm-documents').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setSaving(true);
    try {
      const { data: dsaCode, error: codeErr } = await supabase.rpc('nw2_generate_dsa_code', { p_employee_id: employee.id });
      if (codeErr || !dsaCode) throw new Error('Failed to generate DSA code.');

      const slot = `dsa/${dsaCode}`;
      const [photoUrl, panUrl, bankUrl] = await Promise.all([
        docs.photo ? uploadDoc(docs.photo, `${slot}/photo`) : Promise.resolve(null),
        docs.pan   ? uploadDoc(docs.pan,   `${slot}/pan`)   : Promise.resolve(null),
        docs.bank  ? uploadDoc(docs.bank,  `${slot}/bank`)  : Promise.resolve(null),
      ]);

      const { error: insertErr } = await supabase.from('nw_dsa').insert([{
        dsa_code: dsaCode,
        employee_id: employee.id,
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile: form.mobile,
        pan: form.pan.toUpperCase(),
        address: form.address.trim(),
        bank_name: form.bank_name.trim(),
        bank_account: form.bank_account.trim(),
        bank_ifsc: form.bank_ifsc.toUpperCase(),
        photo_url: photoUrl,
        pan_doc_url: panUrl,
        bank_doc_url: bankUrl,
        status: 'active',
      }]);

      if (insertErr) throw insertErr;

      setSuccess(`DSA created successfully with code ${dsaCode}.`);
      setForm(EMPTY_FORM);
      setDocs({ photo: null, pan: null, bank: null });
      setShowForm(false);
      fetchDSAs();
    } catch (err: any) {
      setError(err.message || 'Failed to create DSA.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDSA) return;
    setDeleting(true);
    await supabase.from('nw_dsa').delete().eq('id', deleteDSA.id);
    setDeleting(false);
    setDeleteDSA(null);
    fetchDSAs();
  };

  const toggleStatus = async (dsa: NWDSA) => {
    const newStatus = dsa.status === 'active' ? 'inactive' : 'active';
    await supabase.from('nw_dsa').update({ status: newStatus }).eq('id', dsa.id);
    fetchDSAs();
  };

  const filtered = dsas.filter(d =>
    !search ||
    d.full_name.toLowerCase().includes(search.toLowerCase()) ||
    d.dsa_code.toLowerCase().includes(search.toLowerCase()) ||
    d.mobile.includes(search) ||
    d.pan.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#D4AF37' }}>DSA</p>
          <h1 className="text-2xl font-bold text-white">DSA Management</h1>
          <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>Create and manage Direct Selling Agents</p>
        </div>
        <button onClick={() => { setShowForm(true); setError(''); setSuccess(''); }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black"
          style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
          <Plus className="w-4 h-4" /> New DSA
        </button>
      </div>

      {/* Feedback */}
      {success && (
        <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#10B981' }} />
          <p className="text-sm" style={{ color: '#10B981' }}>{success}</p>
          <button onClick={() => setSuccess('')} className="ml-auto" style={{ color: '#4A4A4A' }}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Create DSA Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col max-h-[90vh]" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #1E1E24' }}>
              <div>
                <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: '#D4AF37' }}>New DSA</p>
                <h2 className="text-lg font-bold text-white">Create DSA Code</h2>
              </div>
              <button onClick={() => { setShowForm(false); setError(''); }} style={{ color: '#4A4A4A' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#A8A8A8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="overflow-y-auto">
              <div className="px-6 py-5 space-y-5">
                {error && (
                  <div className="p-3 rounded-xl flex items-center gap-2.5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* Personal */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#4A4A4A' }}>Personal Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Field label="Full Name" required>
                        <Input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Full name as per PAN" />
                      </Field>
                    </div>
                    <Field label="Mobile Number" required>
                      <Input type="tel" value={form.mobile} onChange={e => set('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9876543210" />
                    </Field>
                    <Field label="Email" required>
                      <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="dsa@example.com" />
                    </Field>
                    <Field label="PAN Number" required>
                      <Input value={form.pan} onChange={e => set('pan', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))} placeholder="ABCDE1234F" className="font-mono tracking-widest" />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Address">
                        <Textarea rows={2} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full address" />
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Bank */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#4A4A4A' }}>Bank Details</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Bank Name" required>
                      <Input value={form.bank_name} onChange={e => set('bank_name', e.target.value)} placeholder="HDFC Bank" />
                    </Field>
                    <Field label="IFSC Code" required>
                      <Input value={form.bank_ifsc} onChange={e => set('bank_ifsc', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))} placeholder="HDFC0001234" className="font-mono" />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Account Number" required>
                        <Input value={form.bank_account} onChange={e => set('bank_account', e.target.value.replace(/\D/g, ''))} placeholder="Account number" className="font-mono" />
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Documents */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#4A4A4A' }}>Documents (Optional)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {([
                      { key: 'photo', label: 'Photo' },
                      { key: 'pan',   label: 'PAN Card' },
                      { key: 'bank',  label: 'Bank Cheque' },
                    ] as const).map(({ key, label }) => (
                      <label key={key} className="flex flex-col items-center gap-2 p-4 rounded-xl cursor-pointer transition-all"
                        style={{ border: `1px dashed ${docs[key] ? '#10B981' : '#2A2A2A'}`, background: docs[key] ? 'rgba(16,185,129,0.04)' : 'transparent' }}>
                        {docs[key]
                          ? <CheckCircle2 className="w-5 h-5" style={{ color: '#10B981' }} />
                          : <Upload className="w-5 h-5" style={{ color: '#4A4A4A' }} />}
                        <span className="text-xs text-center" style={{ color: docs[key] ? '#10B981' : '#6B6B6B' }}>
                          {docs[key] ? docs[key]!.name.slice(0, 18) : label}
                        </span>
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) setDocs(d => ({ ...d, [key]: f })); }} />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 flex items-center justify-end gap-3" style={{ borderTop: '1px solid #1E1E24' }}>
                <button type="button" onClick={() => { setShowForm(false); setError(''); }}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50 flex items-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                  {saving ? 'Creating...' : <><Plus className="w-4 h-4" /> Create DSA</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail view modal */}
      {viewDSA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #1E1E24' }}>
              <div>
                <p className="text-xs font-mono" style={{ color: '#D4AF37' }}>{viewDSA.dsa_code}</p>
                <h2 className="text-lg font-bold text-white">{viewDSA.full_name}</h2>
              </div>
              <button onClick={() => setViewDSA(null)} style={{ color: '#4A4A4A' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#A8A8A8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-3">
              {[
                { label: 'Mobile', value: viewDSA.mobile, icon: Phone },
                { label: 'Email', value: viewDSA.email, icon: Mail },
                { label: 'PAN', value: viewDSA.pan, icon: CreditCard },
                { label: 'Bank', value: `${viewDSA.bank_name} · ${viewDSA.bank_account}`, icon: Building2 },
                { label: 'IFSC', value: viewDSA.bank_ifsc, icon: Building2 },
                { label: 'Address', value: viewDSA.address || '—', icon: User },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: '#0D0D0D', border: '1px solid #1A1A1A' }}>
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#4A4A4A' }} />
                  <div>
                    <p className="text-xs" style={{ color: '#4A4A4A' }}>{label}</p>
                    <p className="text-sm font-medium text-white font-mono">{value}</p>
                  </div>
                </div>
              ))}
              {/* Document links */}
              {(viewDSA.photo_url || viewDSA.pan_doc_url || viewDSA.bank_doc_url) && (
                <div className="flex gap-2 flex-wrap pt-1">
                  {viewDSA.photo_url && <a href={viewDSA.photo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.08)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}><Eye className="w-3.5 h-3.5" /> Photo</a>}
                  {viewDSA.pan_doc_url && <a href={viewDSA.pan_doc_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.08)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}><Eye className="w-3.5 h-3.5" /> PAN Card</a>}
                  {viewDSA.bank_doc_url && <a href={viewDSA.bank_doc_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'rgba(212,175,55,0.08)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}><Eye className="w-3.5 h-3.5" /> Bank Doc</a>}
                </div>
              )}
            </div>
            <div className="px-6 pb-5">
              <button onClick={() => setViewDSA(null)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteDSA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <div className="px-6 py-5" style={{ borderBottom: '1px solid #1E1E24' }}>
              <h2 className="text-sm font-bold text-white">Delete DSA</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm" style={{ color: '#8A8A8A' }}>
                Are you sure you want to permanently delete{' '}
                <span className="text-white font-semibold">{deleteDSA.full_name}</span>{' '}
                <span className="font-mono text-xs" style={{ color: '#D4AF37' }}>({deleteDSA.dsa_code})</span>?
              </p>
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.06)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                This action cannot be undone. Clients linked to this DSA will remain but lose their DSA association.
              </p>
            </div>
            <div className="px-6 pb-5 flex justify-end gap-3">
              <button onClick={() => setDeleteDSA(null)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center gap-2" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting...' : 'Delete DSA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#4A4A4A' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, code, mobile or PAN..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
            style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }} />
        </div>
        {isAdmin && (
          <div className="relative">
            <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
              className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
              style={{ background: '#0B0B0F', border: '1px solid rgba(212,175,55,0.4)' }}>
              <option value="all">All Employees</option>
              {empList.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#D4AF37' }} />
          </div>
        )}
        <div className="flex items-center gap-3">
          {[
            { label: 'Total', value: dsas.length, color: '#D4AF37' },
            { label: 'Active', value: dsas.filter(d => d.status === 'active').length, color: '#10B981' },
            { label: 'Inactive', value: dsas.filter(d => d.status === 'inactive').length, color: '#6B6B6B' },
          ].map(s => (
            <div key={s.label} className="px-4 py-2 rounded-xl text-center" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <p className="text-xs font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs" style={{ color: '#4A4A4A' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* DSA List */}
      <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Handshake className="w-10 h-10 mx-auto mb-3" style={{ color: '#2A2A2A' }} />
            <p className="text-sm font-semibold" style={{ color: '#4A4A4A' }}>{search ? 'No DSAs match your search' : 'No DSAs yet'}</p>
            {!search && <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>Click "New DSA" to create one</p>}
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_1fr_auto] px-5 py-3 gap-4" style={{ borderBottom: '1px solid #1A1A1A' }}>
              {['DSA', 'Contact', 'PAN', 'Bank', 'Actions'].map(h => (
                <p key={h} className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A4A4A' }}>{h}</p>
              ))}
            </div>
            {filtered.map((dsa, i) => (
              <div key={dsa.id}
                className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr_auto] px-5 py-4 gap-4 items-center"
                style={{ borderBottom: i < filtered.length - 1 ? '1px solid #111' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0D0D0D')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                {/* DSA info */}
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-white">{dsa.full_name}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-md font-semibold ${dsa.status === 'active' ? '' : ''}`}
                      style={{
                        background: dsa.status === 'active' ? 'rgba(16,185,129,0.1)' : 'rgba(107,107,107,0.1)',
                        color: dsa.status === 'active' ? '#10B981' : '#6B6B6B',
                      }}>
                      {dsa.status}
                    </span>
                  </div>
                  <p className="text-xs font-mono font-bold" style={{ color: '#D4AF37' }}>{dsa.dsa_code}</p>
                  {dsa.employee && <p className="text-xs mt-0.5" style={{ color: '#4A4A4A' }}>by {dsa.employee.full_name}</p>}
                </div>
                {/* Contact */}
                <div>
                  <p className="text-sm text-white">{dsa.mobile}</p>
                  <p className="text-xs mt-0.5 truncate" style={{ color: '#6B6B6B' }}>{dsa.email}</p>
                </div>
                {/* PAN */}
                <div>
                  <p className="text-sm font-mono text-white">{dsa.pan}</p>
                </div>
                {/* Bank */}
                <div>
                  <p className="text-sm text-white truncate">{dsa.bank_name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: '#6B6B6B' }}>{dsa.bank_ifsc}</p>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewDSA(dsa)} title="View details"
                    className="p-2 rounded-lg transition-colors"
                    style={{ background: '#111', color: '#6B6B6B', border: '1px solid #1E1E24' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#D4AF37')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#6B6B6B')}>
                    <Eye className="w-4 h-4" />
                  </button>
                  {isAdmin && (
                    <>
                      <button onClick={() => toggleStatus(dsa)} title={dsa.status === 'active' ? 'Deactivate' : 'Activate'}
                        className="p-2 rounded-lg transition-colors"
                        style={{ background: '#111', border: '1px solid #1E1E24', color: dsa.status === 'active' ? '#10B981' : '#4A4A4A' }}
                        onMouseEnter={e => (e.currentTarget.style.color = dsa.status === 'active' ? '#ef4444' : '#10B981')}
                        onMouseLeave={e => (e.currentTarget.style.color = dsa.status === 'active' ? '#10B981' : '#4A4A4A')}>
                        {dsa.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>
                      <button onClick={() => setDeleteDSA(dsa)} title="Delete DSA"
                        className="p-2 rounded-lg transition-colors"
                        style={{ background: '#111', border: '1px solid #1E1E24', color: '#4A4A4A' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#4A4A4A')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
