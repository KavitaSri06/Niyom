import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWClient } from './types';
import {
  FileText, Plus, Search, ChevronDown, Eye, Pencil, Trash2,
  Download, CheckCircle2, AlertCircle, ChevronLeft, Send, Lock,
} from 'lucide-react';
import html2pdf from 'html2pdf.js';
import DealDocument from './DealDocument';

type AcceptanceStatus = 'pending' | 'viewed' | 'accepted' | 'rejected' | 'expired';


interface Props { employee: NWEmployee; }

interface DealForm {
  client_id: string;
  deal_date: string;
  transaction_type: 'Buy' | 'Sell' | '';
  product_type: string;
  security_name: string;
  isin: string;
  quantity: string;
  base_rate: string;       // raw value user types
  rate_per_unit: string;   // adjusted = base_rate - (base_rate * 0.015/100)
  notes: string;
}

interface DealRecord {
  id: string;
  confirmation_number: string;
  client_id: string;
  employee_id: string;
  status: 'draft' | 'confirmed';
  deal_date: string;
  transaction_type: string;
  product_type: string;
  security_name: string;
  isin: string;
  quantity: number;
  rate_per_unit: number;
  base_rate: number;
  settlement_amount: number;
  stamp_duty: number;
  snap_client_name: string;
  snap_pan: string;
  snap_dp_name: string;
  snap_demat_account: string;
  snap_depository: string;
  snap_bank_name: string;
  snap_bank_account: string;
  snap_bank_ifsc: string;
  snap_address: string;
  snap_phone: string;
  snap_email: string;
  notes: string;
  created_at: string;
  email_status: 'pending' | 'sent';
  email_sent_at?: string;
  email_sent_by?: string;
  acceptance_status: AcceptanceStatus;
  secure_token?: string | null;
  token_expires_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  signer_email?: string | null;
  signed_pdf_path?: string | null;
  client?: { full_name: string; client_code: string };
}

const PRODUCT_TYPES = [
  'Unlisted Share', 'Secondary Bond', 'Primary Bond', 'Fixed Deposit', 'Mutual Fund', 'Insurance', 'Other',
];

const emptyForm = (): DealForm => ({
  client_id: '',
  deal_date: new Date().toISOString().split('T')[0],
  transaction_type: '',
  product_type: '',
  security_name: '',
  isin: '',
  quantity: '',
  base_rate: '',
  rate_per_unit: '',
  notes: '',
});

function adjustRate(base: string): string {
  const n = parseFloat(base);
  if (!base || isNaN(n) || n <= 0) return '';
  return (Math.round((n - n * 0.015 / 100) * 100) / 100).toFixed(2);
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildPdfOpts(confirmationNumber: string, dealDate: string, scale: number) {
  return {
    margin: 0,
    filename: `DEAL-CONFIRMATION-${confirmationNumber}-${dealDate}.pdf`,
    image: { type: 'png' as const, quality: 1 },
    html2canvas: { scale, useCORS: true, logging: false, windowWidth: 794, letterRendering: true },
    jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const },
    pagebreak: { mode: ['css', 'legacy'] as string[] },
  };
}

// ---------- Read-only field ----------
function ROField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <div className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
        style={{ background: 'rgba(var(--accent-rgb),0.04)', border: '1px solid rgba(var(--accent-rgb),0.12)', color: 'var(--text-bright)' }}>
        {value || '—'}
      </div>
    </div>
  );
}

// ---------- Editable field ----------
function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && <span className="ml-0.5" style={{ color: 'var(--accent)' }}>*</span>}
      </label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>{hint}</p>}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input {...props}
      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-text-primary outline-none transition-all"
      style={{ background: 'var(--bg-base)', border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}` }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ---------- Acceptance Status Badge ----------
const ACCEPTANCE_STYLES: Record<AcceptanceStatus, { label: string; bg: string; color: string }> = {
  pending:  { label: 'Pending',  bg: 'rgba(107,107,107,0.1)', color: 'var(--text-secondary)' },
  viewed:   { label: 'Viewed',   bg: 'rgba(96,165,250,0.12)', color: 'rgb(var(--info-soft-rgb))' },
  accepted: { label: 'Accepted', bg: 'rgba(16,185,129,0.1)',  color: 'var(--success)' },
  rejected: { label: 'Rejected', bg: 'rgba(239,68,68,0.1)',   color: 'var(--danger)' },
  expired:  { label: 'Expired',  bg: 'rgba(245,158,11,0.1)',  color: 'var(--warning)' },
};

function AcceptanceBadge({ status }: { status: AcceptanceStatus }) {
  const s = ACCEPTANCE_STYLES[status] ?? ACCEPTANCE_STYLES.pending;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg"
      style={{ background: s.bg, color: s.color, border: `1px solid color-mix(in srgb, ${s.color} 20%, transparent)` }}
    >
      {status === 'accepted' && <CheckCircle2 className="w-3 h-3" />}
      {s.label}
    </span>
  );
}

// ============================================================
export default function DealConfirmation({ employee }: Props) {
  const [view, setView] = useState<'list' | 'form' | 'preview'>('list');
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [clients, setClients] = useState<NWClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<DealForm>(emptyForm());
  const [selectedClient, setSelectedClient] = useState<NWClient | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDrop, setShowClientDrop] = useState(false);
  const [editDeal, setEditDeal] = useState<DealRecord | null>(null);
  const [previewDeal, setPreviewDeal] = useState<DealRecord | null>(null);
  const [deleteDeal, setDeleteDeal] = useState<DealRecord | null>(null);
  const [search, setSearch] = useState('');
  const [emailSending, setEmailSending] = useState(false);

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';
  const clientDropRef = useRef<HTMLDivElement>(null);

  const qty = parseFloat(form.quantity) || 0;
  const adjRate = parseFloat(form.rate_per_unit) || 0;
  const baseAmount = Math.round(qty * adjRate * 100) / 100;
  const stampDuty = Math.round(baseAmount * 0.015 / 100 * 100) / 100;
  const settlementAmount = Math.round((baseAmount + stampDuty) * 100) / 100;

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const loadDeals = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('nw_deal_confirmations')
      .select('*, client:nw_clients(full_name, client_code)')
      .order('created_at', { ascending: false });
    if (!isAdmin) q = q.eq('employee_id', employee.id);
    const { data } = await q;
    setDeals((data as DealRecord[]) || []);
    setLoading(false);
  }, [isAdmin, employee.id]);

  useEffect(() => { loadDeals(); }, [loadDeals]);

  useEffect(() => {
    let q = supabase
      .from('nw_clients')
      .select('id, client_code, full_name, pan, phone, email, dp_name, demat_account, depository, bank_name, bank_account, bank_ifsc, address, city, state, pincode, employee_id')
      .order('full_name');
    if (!isAdmin) q = (q as any).eq('employee_id', employee.id);
    q.then(({ data }) => setClients((data as unknown as NWClient[]) || []));
  }, [isAdmin, employee.id]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientDropRef.current && !clientDropRef.current.contains(e.target as Node)) {
        setShowClientDrop(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredClientOptions = clients.filter(c =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.client_code.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const openCreate = () => {
    setForm(emptyForm());
    setSelectedClient(null);
    setClientSearch('');
    setEditDeal(null);
    setError('');
    setView('form');
  };

  const openEdit = (deal: DealRecord) => {
    if (deal.acceptance_status === 'accepted') {
      showToast('Accepted deals are locked. Create a new deal for corrections.', false);
      return;
    }
    setEditDeal(deal);
    setForm({
      client_id: deal.client_id,
      deal_date: deal.deal_date,
      transaction_type: deal.transaction_type as 'Buy' | 'Sell',
      product_type: deal.product_type,
      security_name: deal.security_name,
      isin: deal.isin,
      quantity: String(deal.quantity),
      base_rate: String(deal.base_rate ?? deal.rate_per_unit),
      rate_per_unit: String(deal.rate_per_unit),
      notes: deal.notes,
    });
    const c = clients.find(c => c.id === deal.client_id);
    setSelectedClient(c || null);
    setClientSearch(c ? `${c.full_name} (${c.client_code})` : '');
    setError('');
    setView('form');
  };

  const selectClient = (c: NWClient) => {
    setSelectedClient(c);
    setForm(f => ({ ...f, client_id: c.id }));
    setClientSearch(`${c.full_name} (${c.client_code})`);
    setShowClientDrop(false);
  };

  const validate = (): boolean => {
    if (!form.client_id) { setError('Please select a client.'); return false; }
    if (!form.deal_date) { setError('Deal date is required.'); return false; }
    if (!form.transaction_type) { setError('Transaction type is required.'); return false; }
    if (!form.product_type.trim()) { setError('Product type is required.'); return false; }
    if (!form.security_name.trim()) { setError('Security / Company name is required.'); return false; }
    if (!form.isin.trim()) { setError('ISIN number is required.'); return false; }
    if (!form.quantity || isNaN(parseFloat(form.quantity)) || parseFloat(form.quantity) <= 0) { setError('Valid quantity is required.'); return false; }
    if (!form.base_rate || isNaN(parseFloat(form.base_rate)) || parseFloat(form.base_rate) <= 0) { setError('Valid rate per unit is required.'); return false; }
    setError('');
    return true;
  };

  const handleSave = async (status: 'draft' | 'confirmed') => {
    if (!validate()) return;
    if (!selectedClient) return;
    setSaving(true);

    const addr = [selectedClient.address, selectedClient.city, selectedClient.state].filter(Boolean).join(', ');

    const payload: Record<string, any> = {
      client_id: form.client_id,
      employee_id: employee.id,
      status,
      deal_date: form.deal_date,
      transaction_type: form.transaction_type,
      product_type: form.product_type,
      security_name: form.security_name.trim(),
      isin: form.isin.trim().toUpperCase(),
      quantity: parseFloat(form.quantity),
      base_rate: parseFloat(form.base_rate),
      rate_per_unit: parseFloat(form.rate_per_unit),
      snap_client_name: selectedClient.full_name,
      snap_pan: selectedClient.pan,
      snap_dp_name: selectedClient.dp_name,
      snap_demat_account: selectedClient.demat_account,
      snap_depository: selectedClient.depository,
      snap_bank_name: selectedClient.bank_name,
      snap_bank_account: selectedClient.bank_account,
      snap_bank_ifsc: selectedClient.bank_ifsc,
      snap_address: addr,
      snap_phone: selectedClient.phone,
      snap_email: selectedClient.email,
      notes: form.notes,
    };

    if (editDeal) {
      if (editDeal.acceptance_status === 'accepted') {
        setSaving(false);
        setError('Accepted deals are locked and cannot be edited. Create a new deal confirmation.');
        return;
      }
      // Editing invalidates any outstanding secure link and resets the
      // acceptance lifecycle so the client must review the updated deal afresh.
      const wasSent = editDeal.email_status === 'sent' || !!editDeal.secure_token;
      payload.acceptance_status = 'pending';
      payload.secure_token = null;
      payload.token_expires_at = null;
      payload.viewed_at = null;
      payload.rejected_at = null;
      payload.rejection_reason = null;
      payload.email_status = 'pending';

      const { error: err } = await supabase.from('nw_deal_confirmations').update(payload).eq('id', editDeal.id);
      setSaving(false);
      if (err) { setError(err.message); return; }

      if (wasSent) {
        await supabase.from('nw_deal_confirmation_events').insert([
          { deal_id: editDeal.id, event_type: 'edited', actor: 'employee' },
          { deal_id: editDeal.id, event_type: 'token_invalidated', actor: 'employee' },
        ]);
        showToast('Deal updated. The old link is now invalid — resend to the client.');
      } else {
        showToast('Deal confirmation updated.');
      }
    } else {
      const confNum = await supabase.rpc('nw_generate_confirmation_number', { p_employee_id: employee.id });
      payload.confirmation_number = confNum.data || `DC-${Date.now()}`;
      const { error: err } = await supabase.from('nw_deal_confirmations').insert([payload]);
      setSaving(false);
      if (err) { setError(err.message); return; }
      showToast(status === 'confirmed' ? 'Deal confirmation created.' : 'Draft saved.');
    }

    loadDeals();
    setView('list');
  };

  const handleDelete = async () => {
    if (!deleteDeal) return;
    await supabase.from('nw_deal_confirmations').delete().eq('id', deleteDeal.id);
    setDeleteDeal(null);
    loadDeals();
    showToast('Deleted.');
  };

  // ---------- Send / Resend Secure Link ----------
  // The edge function mints the secure token + 7-day expiry, resets the deal to
  // 'pending', emails the link (no PDF attachment), and logs the event.
  const handleSendSecureLink = async (deal: DealRecord) => {
    if (emailSending) return;
    if (deal.acceptance_status === 'accepted') {
      showToast('Accepted deals are locked and cannot be resent.', false);
      return;
    }
    setEmailSending(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke(
        'send-deal-confirmation-email',
        { body: { dealId: deal.id } }
      );
      if (fnError || !fnData?.success) {
        throw new Error(fnData?.error || fnError?.message || 'Failed to send secure link');
      }
      setPreviewDeal(prev =>
        prev && prev.id === deal.id
          ? { ...prev, email_status: 'sent', acceptance_status: 'pending', email_sent_at: new Date().toISOString() }
          : prev
      );
      await loadDeals();
      showToast(deal.email_status === 'sent' ? 'Updated secure link sent.' : 'Secure link sent to client.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to send secure link', false);
    } finally {
      setEmailSending(false);
    }
  };

  // ---------- Download the stored signed PDF (accepted deals) ----------
  const handleDownloadSigned = async (deal: DealRecord) => {
    if (!deal.signed_pdf_path) { showToast('No signed document available yet.', false); return; }
    const { data, error: err } = await supabase
      .storage.from('deal-documents')
      .createSignedUrl(deal.signed_pdf_path, 120);
    if (err || !data?.signedUrl) { showToast('Could not open signed document.', false); return; }
    window.open(data.signedUrl, '_blank');

  };

  const filteredDeals = deals.filter(d =>
    !search ||
    d.confirmation_number.toLowerCase().includes(search.toLowerCase()) ||
    d.snap_client_name.toLowerCase().includes(search.toLowerCase()) ||
    d.security_name.toLowerCase().includes(search.toLowerCase())
  );

  // ===================== PREVIEW ======================
  if (view === 'preview' && previewDeal) {
    const alreadyAccepted = previewDeal.acceptance_status === 'accepted';
    const pdfOpt = buildPdfOpts(previewDeal.confirmation_number, previewDeal.deal_date, 3);

    return (
      <div className="space-y-6">
        {/* Top Action Bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <ChevronLeft className="w-4 h-4" /> Back to List
          </button>
          <div className="flex-1" />
          {/* Download PDF */}
          <button
            onClick={() => {
              const element = document.getElementById('deal-confirmation-pdf-content');
              if (!element) return;
              html2pdf().set(pdfOpt).from(element).save();
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent"
            style={{ background: 'linear-gradient(135deg, var(--accent-strong), var(--accent-strong-deep))' }}
          >
            <Download className="w-4 h-4" /> Download PDF
          </button>
          {/* Secure Link / Locked actions */}
          {alreadyAccepted ? (
            <>
              <span
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)', border: '1px solid rgba(16,185,129,0.25)' }}
              >
                <Lock className="w-4 h-4" /> Accepted & Locked
              </span>
              {previewDeal.signed_pdf_path && (
                <button
                  onClick={() => handleDownloadSigned(previewDeal)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent"
                  style={{ background: 'linear-gradient(135deg, var(--success), var(--success-deep))' }}
                >
                  <Download className="w-4 h-4" /> Signed PDF
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => handleSendSecureLink(previewDeal)}
              disabled={emailSending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent transition-all disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', opacity: emailSending ? 0.75 : 1 }}
            >
              {emailSending ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {previewDeal.email_status === 'sent' ? 'Resend Secure Link' : 'Send Secure Link'}
                </>
              )}
            </button>
          )}
        </div>

        {/* Acceptance audit banner */}
        {previewDeal.acceptance_status === 'accepted' && (
          <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs"
            style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <span style={{ color: 'var(--success)' }} className="font-semibold">Accepted &amp; locked</span>
            {previewDeal.accepted_at && <span style={{ color: 'var(--text-secondary)' }}>On: {new Date(previewDeal.accepted_at).toLocaleString('en-IN')}</span>}
            {previewDeal.signer_email && <span style={{ color: 'var(--text-secondary)' }}>By: {previewDeal.signer_email}</span>}
          </div>
        )}
        {previewDeal.acceptance_status === 'rejected' && (
          <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <span style={{ color: 'var(--danger)' }} className="font-semibold">Rejected by client</span>
            {previewDeal.rejected_at && <span style={{ color: 'var(--text-secondary)' }}>On: {new Date(previewDeal.rejected_at).toLocaleString('en-IN')}</span>}
            {previewDeal.rejection_reason && <span style={{ color: 'var(--text-secondary)' }}>Reason: {previewDeal.rejection_reason}</span>}
          </div>
        )}

        {/* ===== Deal Note (shared 2-page A4 layout) ===== */}
        <DealDocument deal={previewDeal} />
      </div>
    );
  }

  // ===================== FORM ======================
  if (view === 'form') {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <div>
            <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'var(--accent)' }}>Deal Confirmation</p>
            <h1 className="text-xl font-bold text-text-primary">{editDeal ? 'Edit Deal' : 'Create Deal Confirmation'}</h1>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-2xl flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-4 h-4 text-c-red flex-shrink-0" />
            <p className="text-sm text-c-red">{error}</p>
          </div>
        )}

        {/* Client Selection */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Step 1 — Select Client</p>
          <div ref={clientDropRef} className="relative">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Client Code / Name <span style={{ color: 'var(--accent)' }}>*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-faint)' }} />
              <input
                value={clientSearch}
                onChange={e => { setClientSearch(e.target.value); setShowClientDrop(true); setSelectedClient(null); setForm(f => ({ ...f, client_id: '' })); }}
                onFocus={() => setShowClientDrop(true)}
                placeholder="Search by client name or code..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
                style={{ background: 'var(--bg-base)', border: `1px solid ${selectedClient ? 'var(--success)' : 'var(--border)'}` }}
              />
              {selectedClient && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-c-emerald" />}
            </div>
            {showClientDrop && filteredClientOptions.length > 0 && (
              <div className="absolute z-20 w-full mt-1 rounded-xl overflow-hidden shadow-2xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto' }}>
                {filteredClientOptions.slice(0, 30).map(c => (
                  <button key={c.id} onClick={() => selectClient(c)}
                    className="w-full text-left px-4 py-3 text-sm transition-colors"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--bg-raised)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--accent-rgb),0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span className="font-mono text-xs mr-2" style={{ color: 'var(--accent)' }}>{c.client_code}</span>
                    {c.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Auto-filled client details */}
        {selectedClient && (
          <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Buyer Details (Auto-filled)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ROField label="Client Name" value={selectedClient.full_name} />
              <ROField label="PAN Number" value={selectedClient.pan} />
              <ROField label="Mobile Number" value={selectedClient.phone} />
              <ROField label="Email ID" value={selectedClient.email} />
              <ROField label="DP Name" value={selectedClient.dp_name} />
              <ROField label="Demat Account" value={selectedClient.demat_account} />
              <ROField label="DP ID (First 8 digits)" value={selectedClient.demat_account?.slice(0, 8) || '—'} />
              <ROField label="Client ID (Last 8 digits)" value={selectedClient.demat_account?.slice(-8) || '—'} />
              <ROField label="Bank Name" value={selectedClient.bank_name} />
              <ROField label="Bank Account" value={selectedClient.bank_account} />
              <ROField label="IFSC Code" value={selectedClient.bank_ifsc} />
            </div>
            <ROField label="Address" value={[selectedClient.address, selectedClient.city, selectedClient.state].filter(Boolean).join(', ')} />
          </div>
        )}

        {/* Deal Details */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Step 2 — Deal Information</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Deal Date" required>
              <Input type="date" value={form.deal_date} onChange={e => setForm(f => ({ ...f, deal_date: e.target.value }))} />
            </Field>
            <Field label="Transaction Type" required>
              <div className="relative">
                <select value={form.transaction_type} onChange={e => setForm(f => ({ ...f, transaction_type: e.target.value as 'Buy' | 'Sell' }))}
                  className="w-full pl-3 pr-8 py-2.5 rounded-xl text-sm text-text-primary outline-none appearance-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                  <option value="">Select type</option>
                  <option value="Buy">Buy</option>
                  <option value="Sell">Sell</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
              </div>
            </Field>
            <Field label="Product Type" required>
              <div className="relative">
                <select value={form.product_type} onChange={e => setForm(f => ({ ...f, product_type: e.target.value }))}
                  className="w-full pl-3 pr-8 py-2.5 rounded-xl text-sm text-text-primary outline-none appearance-none"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                  <option value="">Select product</option>
                  {PRODUCT_TYPES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-faint)' }} />
              </div>
            </Field>
          </div>
        </div>

        {/* Security Details */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Step 3 — Security / Instrument Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Security / Company Name" required>
              <Input value={form.security_name} onChange={e => setForm(f => ({ ...f, security_name: e.target.value }))} placeholder="e.g. Tata Motors Ltd" />
            </Field>
            <Field label="ISIN Number" required>
              <Input value={form.isin} onChange={e => setForm(f => ({ ...f, isin: e.target.value.toUpperCase() }))} placeholder="INE001A01036" maxLength={12} />
            </Field>
            <Field label="Quantity" required>
              <Input type="number" min="0" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" />
            </Field>
            <Field label="Rate per Unit (₹)" required hint="Rate automatically adjusted after applicable charges deduction.">
              <Input
                type="number" min="0" step="0.01"
                value={form.base_rate}
                onChange={e => {
                  const adj = adjustRate(e.target.value);
                  setForm(f => ({ ...f, base_rate: e.target.value, rate_per_unit: adj }));
                }}
                placeholder="Enter base rate"
              />
              {form.rate_per_unit && (
                <p className="text-xs mt-1.5 font-semibold" style={{ color: 'var(--accent)' }}>
                  Adjusted Rate: ₹{parseFloat(form.rate_per_unit).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </Field>
          </div>

          {/* Auto-calculated values */}
          {(qty > 0 && adjRate > 0) && (
            <div className="rounded-xl p-4 grid grid-cols-2 gap-4 mt-2" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Stamp Duty / Charges</p>
                <p className="text-lg font-black" style={{ color: 'var(--accent)' }}>{fmt(stampDuty)}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--border-stronger)' }}>(Rate × Qty) × 0.015%</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-faint)' }}>Settlement Amount</p>
                <p className="text-lg font-black" style={{ color: 'var(--success)' }}>{fmt(settlementAmount)}</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--border-stronger)' }}>(Rate × Qty) + Stamp Duty</p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setView('list')} className="px-4 py-2.5 rounded-xl text-sm" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <div className="flex-1" />
          <button onClick={() => handleSave('draft')} disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--bg-raised)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb),0.3)' }}>
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={() => handleSave('confirmed')} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-on-accent disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
            <CheckCircle2 className="w-4 h-4" />
            {saving ? 'Saving...' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    );
  }

  // ===================== LIST ======================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Documents</p>
          <h1 className="text-2xl font-bold text-text-primary">Deal Confirmations</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Generate, preview and email deal confirmation notes</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
          <Plus className="w-4 h-4" /> Create Deal Confirmation
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-semibold transition-all ${toast.ok ? 'text-c-emerald' : 'text-c-red'}`}
          style={{ background: 'var(--bg-surface)', border: `1px solid ${toast.ok ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: deals.length, color: 'var(--accent)' },
          { label: 'Accepted', value: deals.filter(d => d.acceptance_status === 'accepted').length, color: 'var(--success)' },
          { label: 'Rejected', value: deals.filter(d => d.acceptance_status === 'rejected').length, color: 'var(--danger)' },
          { label: 'Awaiting Client', value: deals.filter(d => d.acceptance_status === 'pending' || d.acceptance_status === 'viewed').length, color: 'rgb(var(--info-soft-rgb))' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-faint)' }}>{s.label}</p>
            <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-faint)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by reference, client or security..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--border-strong)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>No deal confirmations yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--border-strong)' }}>Click "Create Deal Confirmation" to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Reference', 'Client', 'Security', 'Type', 'Date', 'Settlement', 'Status', 'Acceptance', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--bg-raised)' }}>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent)' }}>{d.confirmation_number}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-text-primary">{d.snap_client_name}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{(d.client as any)?.client_code}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-text-primary">{d.security_name}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{d.isin}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${d.transaction_type === 'Buy' ? 'text-c-emerald bg-emerald-900/20' : 'text-c-red bg-red-900/20'}`}>
                        {d.transaction_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDate(d.deal_date)}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-bold text-text-primary">{fmt(d.settlement_amount || 0)}</p>
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>Qty: {d.quantity?.toLocaleString('en-IN')}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${d.status === 'confirmed' ? 'text-c-emerald bg-emerald-900/20' : 'text-c-amber bg-amber-900/20'}`}>
                        {d.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                      </span>
                    </td>
                    {/* Acceptance lifecycle */}
                    <td className="px-5 py-3.5">
                      <AcceptanceBadge status={d.acceptance_status ?? 'pending'} />
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setPreviewDeal(d); setView('preview'); }}
                          className="p-1.5 rounded-lg transition-colors" title="Preview"
                          style={{ color: 'var(--text-faint)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                          <Eye className="w-4 h-4" />
                        </button>
                        {d.acceptance_status === 'accepted' ? (
                          <>
                            <span className="p-1.5" title="Accepted & locked" style={{ color: 'var(--success)' }}>
                              <Lock className="w-4 h-4" />
                            </span>
                            {d.signed_pdf_path && (
                              <button
                                onClick={() => handleDownloadSigned(d)}
                                className="p-1.5 rounded-lg transition-colors" title="Download signed PDF"
                                style={{ color: 'var(--text-faint)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--success)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                                <Download className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleSendSecureLink(d)}
                              disabled={emailSending}
                              className="p-1.5 rounded-lg transition-colors disabled:opacity-40"
                              title={d.email_status === 'sent' ? 'Resend secure link' : 'Send secure link'}
                              style={{ color: 'var(--text-faint)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => openEdit(d)}
                              className="p-1.5 rounded-lg transition-colors" title="Edit"
                              style={{ color: 'var(--text-faint)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'rgb(var(--info-soft-rgb))')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteDeal(d)}
                              className="p-1.5 rounded-lg transition-colors" title="Delete"
                              style={{ color: 'var(--text-faint)' }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <Trash2 className="w-5 h-5 text-c-red" />
              </div>
              <div>
                <p className="text-sm font-bold text-text-primary">Delete Deal Confirmation</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{deleteDeal.confirmation_number}</p>
              </div>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>This action is permanent and cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteDeal(null)} className="flex-1 py-2.5 rounded-xl text-sm" style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'var(--danger)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
