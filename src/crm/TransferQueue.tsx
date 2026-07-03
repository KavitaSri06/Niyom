import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee } from './types';
import {
  Send, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
  CheckCircle2, AlertCircle, Loader2, X, Clock,
  IndianRupee, ShieldCheck, Info, RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  employee: NWEmployee;
}

type OverallStage =
  | 'draft' | 'confirmed' | 'accepted'
  | 'partially_paid' | 'transfer_pending' | 'closed'
  | 'rejected' | 'expired' | 'unknown';

interface EligibleDeal {
  deal_id: string;
  confirmation_number: string;
  client_id: string;
  employee_id: string;
  snap_client_name: string;
  snap_pan: string;
  snap_email: string;
  snap_phone: string;
  snap_dp_name: string;
  snap_demat_account: string;
  snap_bank_name: string;
  snap_bank_account: string;
  snap_bank_ifsc: string;
  snap_address: string;
  product_type: string;
  transaction_type: string;
  security_name: string;
  isin: string;
  deal_date: string;
  quantity: number;
  rate_per_unit: number;
  settlement_amount: number;
  stamp_duty: number;
  notes: string;
  accepted_at: string | null;
  signer_email: string | null;
  signed_pdf_path: string | null;
  landing_cost: number | null;
  insurance_revenue: number | null;
  trail_percent: number | null;
  trail_start_date: string | null;
  brokerage_amount: number | null;
  total_paid_amount: number;
  outstanding_amount: number;
  payment_count: number;
  last_payment_at: string | null;
}

// ---------------------------------------------------------------------------
// Formatting helpers (locally scoped to keep this module self-contained)
// ---------------------------------------------------------------------------

const inr = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
};

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const fmtDateTime = (d: string | null | undefined) => {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ---------------------------------------------------------------------------
// Preview group config — extensible without touching this component.
// Each group is a titled block of labelled fields; each field is one cell.
// ---------------------------------------------------------------------------

interface PreviewField {
  label: string;
  value: React.ReactNode;
  span?: 1 | 2 | 3;
}
interface PreviewGroup {
  key: string;
  title: string;
  fields: PreviewField[];
}

function buildPreviewGroups(d: EligibleDeal): PreviewGroup[] {
  return [
    {
      key: 'client',
      title: 'Client Snapshot',
      fields: [
        { label: 'Full Name',      value: d.snap_client_name || '—' },
        { label: 'PAN',            value: d.snap_pan || '—' },
        { label: 'Email',          value: d.snap_email || '—' },
        { label: 'Phone',          value: d.snap_phone || '—' },
        { label: 'DP Name',        value: d.snap_dp_name || '—' },
        { label: 'Demat Account',  value: d.snap_demat_account || '—' },
        { label: 'Bank',           value: d.snap_bank_name || '—' },
        { label: 'A/C No.',        value: d.snap_bank_account || '—' },
        { label: 'IFSC',           value: d.snap_bank_ifsc || '—' },
        { label: 'Address',        value: d.snap_address || '—', span: 3 },
      ],
    },
    {
      key: 'instrument',
      title: 'Instrument & Deal Terms',
      fields: [
        { label: 'Product',           value: d.product_type || '—' },
        { label: 'Transaction Type',  value: d.transaction_type || '—' },
        { label: 'Deal Date',         value: fmtDate(d.deal_date) },
        { label: 'Security',          value: d.security_name || '—', span: 2 },
        { label: 'ISIN',              value: d.isin || '—' },
        { label: 'Quantity',          value: Number(d.quantity).toLocaleString('en-IN') },
        { label: 'Rate per Unit',     value: inr(d.rate_per_unit) },
        { label: 'Stamp Duty',        value: inr(d.stamp_duty) },
      ],
    },
    {
      key: 'revenue_basis',
      title: 'Revenue Basis (internal, from Deal Confirmation)',
      fields: [
        { label: 'Landing Cost',       value: d.landing_cost      == null ? '—' : inr(d.landing_cost) },
        { label: 'Brokerage',          value: d.brokerage_amount  == null ? '—' : inr(d.brokerage_amount) },
        { label: 'Insurance Revenue',  value: d.insurance_revenue == null ? '—' : inr(d.insurance_revenue) },
        { label: 'Trail %',            value: d.trail_percent     == null ? '—' : `${d.trail_percent}%` },
        { label: 'Trail Start Date',   value: fmtDate(d.trail_start_date) },
      ],
    },
    {
      key: 'acceptance',
      title: 'Acceptance & Signed Documents',
      fields: [
        { label: 'Accepted On',     value: fmtDateTime(d.accepted_at) },
        { label: 'Signer Email',    value: d.signer_email || '—' },
        { label: 'Signed PDF',      value: d.signed_pdf_path ? 'On record' : '—' },
      ],
    },
    {
      key: 'notes',
      title: 'Deal Notes',
      fields: [
        { label: 'Notes', value: d.notes || '—', span: 3 },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Confirmation checklist — the six-item verification checklist
// ---------------------------------------------------------------------------

const CHECKLIST_ITEMS = [
  { key: 'kyc',        label: 'Client KYC verified' },
  { key: 'payment',    label: 'Payment fully received' },
  { key: 'ledger',     label: 'Ledger verified' },
  { key: 'docs',       label: 'Documents verified' },
  { key: 'investment', label: 'Investment details verified' },
  { key: 'attest',     label: 'I confirm this deal is ready for official transfer and closure.' },
] as const;

type ChecklistKey = typeof CHECKLIST_ITEMS[number]['key'];

// ---------------------------------------------------------------------------
// Style tokens (matching existing CRM)
// ---------------------------------------------------------------------------

const OVERALL_STAGE_STYLES: Record<OverallStage, { label: string; bg: string; color: string; border: string }> = {
  draft:            { label: 'Draft',            bg: 'rgba(107,107,107,0.10)', color: 'var(--text-secondary)', border: 'rgba(107,107,107,0.25)' },
  confirmed:        { label: 'Confirmed',        bg: 'rgba(96,165,250,0.10)',  color: 'rgb(var(--info-soft-rgb))', border: 'rgba(96,165,250,0.25)' },
  accepted:         { label: 'Accepted',         bg: 'rgba(16,185,129,0.08)',  color: 'var(--success)',        border: 'rgba(16,185,129,0.20)' },
  partially_paid:   { label: 'Partially Paid',   bg: 'rgba(245,158,11,0.10)',  color: 'var(--warning)',        border: 'rgba(245,158,11,0.25)' },
  transfer_pending: { label: 'Transfer Pending', bg: 'rgba(245,158,11,0.15)',  color: 'var(--warning)',        border: 'rgba(245,158,11,0.30)' },
  closed:           { label: 'Closed',           bg: 'rgba(16,185,129,0.15)',  color: 'var(--success)',        border: 'rgba(16,185,129,0.30)' },
  rejected:         { label: 'Rejected',         bg: 'rgba(239,68,68,0.10)',   color: 'var(--danger)',         border: 'rgba(239,68,68,0.25)' },
  expired:          { label: 'Expired',          bg: 'rgba(107,107,107,0.10)', color: 'var(--text-muted)',     border: 'rgba(107,107,107,0.25)' },
  unknown:          { label: 'Unknown',          bg: 'rgba(107,107,107,0.10)', color: 'var(--text-muted)',     border: 'rgba(107,107,107,0.25)' },
};

function OverallStagePill({ stage }: { stage: OverallStage }) {
  const s = OVERALL_STAGE_STYLES[stage] ?? OVERALL_STAGE_STYLES.unknown;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg uppercase tracking-wider"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

const PAGE_SIZE = 10;

// ===========================================================================
// Main component
// ===========================================================================

export default function TransferQueue({ employee }: Props) {
  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';

  const [view, setView] = useState<'list' | 'preview' | 'success'>('list');
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<EligibleDeal[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [preview, setPreview] = useState<EligibleDeal | null>(null);
  const [previewStage, setPreviewStage] = useState<OverallStage>('transfer_pending');
  const [rmName, setRmName] = useState<string>('');

  const [showConfirm, setShowConfirm] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [checks, setChecks] = useState<Record<ChecklistKey, boolean>>({
    kyc: false, payment: false, ledger: false, docs: false, investment: false, attest: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [successResult, setSuccessResult] = useState<{
    transfer_reference: string;
    transaction_id: string;
    transferred_at: string;
    email_status: string;
    email_error: string | null;
    deal: EligibleDeal;
  } | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // -------------------------------------------------------------------------
  // Guard: this page is admin-only. The nav already hides it for RMs, but
  // in case someone deep-links to /crm/transfer_queue, we degrade gracefully.
  // -------------------------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <ShieldCheck className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          The Transfer Queue is available to administrators only.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadList = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;

    let q = supabase
      .from('nw_deal_transfer_eligible')
      .select('*', { count: 'exact' })
      .order('accepted_at', { ascending: false })
      .range(from, to);

    if (search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or([
        `confirmation_number.ilike.${s}`,
        `snap_client_name.ilike.${s}`,
        `security_name.ilike.${s}`,
        `isin.ilike.${s}`,
      ].join(','));
    }
    if (dateFrom) q = q.gte('accepted_at', dateFrom);
    if (dateTo)   q = q.lte('accepted_at', `${dateTo}T23:59:59`);

    const { data, count: c } = await q;
    setDeals((data as EligibleDeal[]) ?? []);
    setCount(c ?? 0);
    setLoading(false);
  }, [page, search, dateFrom, dateTo]);

  useEffect(() => { loadList(); }, [loadList]);

  // -------------------------------------------------------------------------
  // Open preview — also fetch the RM's name + overall_stage
  // -------------------------------------------------------------------------

  const openPreview = async (d: EligibleDeal) => {
    setPreview(d);
    setView('preview');
    setChecks({ kyc: false, payment: false, ledger: false, docs: false, investment: false, attest: false });
    setRemarks('');
    setError('');
    // Fetch RM full_name
    const { data: emp } = await supabase.from('nw_employees')
      .select('full_name').eq('id', d.employee_id).maybeSingle();
    setRmName(emp?.full_name ?? '—');
    // Fetch overall stage (should be transfer_pending, but read live for accuracy)
    const { data: st } = await supabase.from('nw_deal_overall_stage')
      .select('overall_stage').eq('deal_id', d.deal_id).maybeSingle();
    setPreviewStage(((st as any)?.overall_stage as OverallStage) ?? 'transfer_pending');
  };

  const closePreview = () => {
    setPreview(null);
    setView('list');
  };

  // -------------------------------------------------------------------------
  // Approve Transfer
  // -------------------------------------------------------------------------

  const allChecked = useMemo(
    () => CHECKLIST_ITEMS.every(i => checks[i.key]),
    [checks]
  );

  const submit = async () => {
    if (!preview || !allChecked || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('transfer-deal', {
        body: { dealId: preview.deal_id, remarks: remarks.trim() || null },
      });
      if (fnErr || !data?.success) {
        throw new Error(data?.error || fnErr?.message || 'Could not complete transfer.');
      }
      setSuccessResult({
        transfer_reference: data.transfer_reference,
        transaction_id:     data.transaction_id,
        transferred_at:     data.transferred_at,
        email_status:       data.email_status,
        email_error:        data.email_error,
        deal:               preview,
      });
      setShowConfirm(false);
      setView('success');
    } catch (err: any) {
      setError(err?.message || 'Could not complete transfer.');
    } finally {
      setSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Retry closure email — direct admin call to send-deal-closure-email
  // -------------------------------------------------------------------------
  const resendClosureEmail = async () => {
    if (!successResult) return;
    setResending(true);
    setResendMessage(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-deal-closure-email', {
        body: { dealId: successResult.deal.deal_id },
      });
      if (fnErr || !data?.success) {
        throw new Error(data?.error || fnErr?.message || 'Could not resend closure email.');
      }
      setSuccessResult(prev => prev ? { ...prev, email_status: 'sent', email_error: null } : prev);
      setResendMessage({ ok: true, text: 'Closure email resent successfully.' });
    } catch (err: any) {
      setResendMessage({ ok: false, text: err?.message || 'Could not resend closure email.' });
    } finally {
      setResending(false);
    }
  };

  // =========================================================================
  // Render
  // =========================================================================

  // ---- SUCCESS SCREEN ------------------------------------------------------
  if (view === 'success' && successResult) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="rounded-2xl p-6" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
          <div className="flex items-start gap-4">
            <div className="rounded-full p-2" style={{ background: 'rgba(16,185,129,0.15)' }}>
              <CheckCircle2 className="w-6 h-6" style={{ color: 'var(--success)' }} />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-text-primary">Transfer Approved</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                The deal has been closed and the official transaction has been recorded.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <SummaryTile label="Transfer Reference"     value={successResult.transfer_reference} mono strong />
            <SummaryTile label="Transferred On"         value={fmtDateTime(successResult.transferred_at)} />
            <SummaryTile label="Deal Number"            value={successResult.deal.confirmation_number} mono />
            <SummaryTile label="Client"                 value={successResult.deal.snap_client_name} />
            <SummaryTile label="Settlement Amount"      value={inr(successResult.deal.settlement_amount)} />
            <SummaryTile
              label="Client Notification"
              value={
                successResult.email_status === 'sent'
                  ? 'Sent'
                  : successResult.email_status === 'skipped'
                    ? 'Skipped (idempotent)'
                    : `Failed — ${successResult.email_error ?? 'unknown error'}`
              }
              tone={successResult.email_status === 'sent' ? 'success' :
                    successResult.email_status === 'failed' ? 'warning' : 'muted'}
            />
          </div>

          {resendMessage && (
            <div
              className="mt-4 rounded-xl px-4 py-3 flex items-start gap-2 text-sm"
              style={
                resendMessage.ok
                  ? { background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', color: 'var(--success)' }
                  : { background: 'rgba(239,68,68,0.08)',  border: '1px solid rgba(239,68,68,0.25)',  color: 'var(--danger)'  }
              }
            >
              {resendMessage.ok
                ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                : <AlertCircle  className="w-4 h-4 mt-0.5 shrink-0" />}
              <span>{resendMessage.text}</span>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
            <button
              onClick={() => { setSuccessResult(null); setResendMessage(null); setPreview(null); setView('list'); setPage(0); loadList(); }}
              className="text-sm"
              style={{ color: 'var(--text-secondary)' }}
            >
              ← Back to Transfer Queue
            </button>
            {successResult.email_status !== 'sent' && (
              <button
                onClick={resendClosureEmail}
                disabled={resending}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{
                  background: 'var(--bg-base)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  opacity: resending ? 0.6 : 1,
                }}
              >
                {resending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Resending…</>
                  : <><RefreshCw className="w-4 h-4" /> Retry Send</>}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- PREVIEW SCREEN ------------------------------------------------------
  if (view === 'preview' && preview) {
    const groups = buildPreviewGroups(preview);
    return (
      <div className="space-y-6">
        {/* Preview header */}
        <div className="flex items-center gap-3">
          <button onClick={closePreview} className="flex items-center gap-2 text-sm"
            style={{ color: 'var(--text-secondary)' }}>
            <ChevronLeft className="w-4 h-4" /> Back to Queue
          </button>
        </div>

        {/* Summary header — shows Transfer Reference (pending), Overall Stage,
             Deal Number, Client, RM, Transfer Status */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>
                Transfer Preview
              </p>
              <h1 className="text-xl font-bold text-text-primary">
                {preview.confirmation_number} — {preview.snap_client_name}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>
                A Transfer Reference (TRF-YYYY-NNNNNN) will be allocated on approval.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <OverallStagePill stage={previewStage} />
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg uppercase tracking-wider"
                style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <Clock className="w-3 h-3" /> Awaiting Approval
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <SummaryTile label="Transfer Reference"     value="— pending —" mono />
            <SummaryTile label="Deal Number"            value={preview.confirmation_number} mono />
            <SummaryTile label="Client"                 value={preview.snap_client_name} />
            <SummaryTile label="Relationship Manager"   value={rmName || '—'} />
            <SummaryTile label="Overall Stage"          value={<OverallStagePill stage={previewStage} />} />
            <SummaryTile label="Transfer Status"        value="Awaiting Approval" tone="warning" />
          </div>
        </div>

        {/* Payment Summary card */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
          <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2"
            style={{ color: 'var(--accent)' }}>
            <IndianRupee className="w-4 h-4" /> Payment Summary
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryTile label="Settlement Amount"   value={inr(preview.settlement_amount)} strong />
            <SummaryTile label="Total Paid"          value={inr(preview.total_paid_amount)} tone="success" strong />
            <SummaryTile label="Outstanding"         value={inr(preview.outstanding_amount)}
              tone={preview.outstanding_amount > 0 ? 'warning' : 'success'} />
            <SummaryTile label="Number of Payments"  value={String(preview.payment_count)} />
            <SummaryTile label="Payment Status"      value="Fully Paid" tone="success" strong />
          </div>
        </div>

        {/* Read-only preview groups */}
        {groups.map(g => (
          <PreviewGroupBlock key={g.key} group={g} />
        ))}

        {/* Approve action */}
        <div className="sticky bottom-0 z-10 rounded-2xl px-5 py-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', backdropFilter: 'blur(6px)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Info className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            All fields above are read-only. Approval creates the official transaction and closes the deal.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={closePreview}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              Cancel
            </button>
            <button onClick={() => setShowConfirm(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent"
              style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
              <Send className="w-4 h-4" /> Approve Transfer
            </button>
          </div>
        </div>

        {/* Confirmation dialog */}
        {showConfirm && (
          <ConfirmDialog
            deal={preview}
            checks={checks}
            setChecks={setChecks}
            remarks={remarks}
            setRemarks={setRemarks}
            error={error}
            submitting={submitting}
            allChecked={allChecked}
            onCancel={() => { if (!submitting) { setShowConfirm(false); setError(''); } }}
            onConfirm={submit}
          />
        )}
      </div>
    );
  }

  // ---- LIST SCREEN ---------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--accent)' }}>Operations</p>
        <h1 className="text-2xl font-bold text-text-primary">Transfer Queue</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Accepted deals with fully-received payments, awaiting operations approval to close.
        </p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: 'var(--text-faint)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by reference, client, security or ISIN…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-text-primary outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-secondary)' }}>Accepted From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }}
            className="w-full px-3.5 py-2 rounded-xl text-sm text-text-primary outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-secondary)' }}>Accepted To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }}
            className="w-full px-3.5 py-2 rounded-xl text-sm text-text-primary outline-none"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : deals.length === 0 ? (
          <div className="text-center py-16">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--border-strong)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-faint)' }}>
              No deals awaiting transfer
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--border-strong)' }}>
              Deals appear here once accepted by the client and fully paid.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {['Deal Number', 'Client', 'Security', 'Type', 'Settlement', 'Accepted', 'Fully Paid', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: 'var(--text-faint)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {deals.map(d => (
                  <tr key={d.deal_id} style={{ borderBottom: '1px solid var(--bg-raised)' }}>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-mono font-bold" style={{ color: 'var(--accent)' }}>
                        {d.confirmation_number}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-medium text-text-primary">{d.snap_client_name}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{d.snap_pan}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm text-text-primary">{d.security_name}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--text-faint)' }}>{d.isin || '—'}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold px-2 py-1 rounded-lg"
                        style={{ background: 'var(--bg-raised)', color: 'var(--text-secondary)' }}>
                        {d.transaction_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-sm font-bold text-text-primary">{inr(d.settlement_amount)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDate(d.accepted_at)}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{fmtDate(d.last_payment_at)}</p>
                      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{d.payment_count} pmt(s)</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => openPreview(d)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-on-accent"
                        style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
                        Review <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {count > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm" style={{ color: 'var(--text-secondary)' }}>
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              Previous
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= count}
              className="px-3 py-1.5 rounded-lg text-xs disabled:opacity-40"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Small subcomponents
// ===========================================================================

function SummaryTile({
  label, value, mono, strong, tone,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
  tone?: 'success' | 'warning' | 'danger' | 'muted';
}) {
  const color =
    tone === 'success' ? 'var(--success)' :
    tone === 'warning' ? 'var(--warning)' :
    tone === 'danger'  ? 'var(--danger)' :
    tone === 'muted'   ? 'var(--text-muted)' :
    'var(--text-bright)';
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p
        className={`text-sm ${mono ? 'font-mono' : ''} ${strong ? 'font-bold' : 'font-semibold'}`}
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}

function PreviewGroupBlock({ group }: { group: PreviewGroup }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3 text-left">
        <h3 className="text-sm font-bold uppercase tracking-wider"
          style={{ color: 'var(--text-secondary)' }}>{group.title}</h3>
        {open ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              : <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 md:grid-cols-3 gap-3">
          {group.fields.map(f => (
            <div key={f.label} className={f.span === 2 ? 'md:col-span-2' : f.span === 3 ? 'md:col-span-3' : ''}>
              <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</p>
              <p className="text-sm font-medium text-text-primary">{f.value ?? '—'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({
  deal, checks, setChecks, remarks, setRemarks,
  error, submitting, allChecked, onCancel, onConfirm,
}: {
  deal: EligibleDeal;
  checks: Record<ChecklistKey, boolean>;
  setChecks: React.Dispatch<React.SetStateAction<Record<ChecklistKey, boolean>>>;
  remarks: string;
  setRemarks: (v: string) => void;
  error: string;
  submitting: boolean;
  allChecked: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            <h2 className="text-lg font-bold text-text-primary">Confirm Deal Closure</h2>
          </div>
          <button onClick={onCancel} disabled={submitting}
            className="p-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              You are about to close deal <strong className="font-mono" style={{ color: 'var(--accent)' }}>{deal.confirmation_number}</strong>{' '}
              for <strong>{deal.snap_client_name}</strong>. Approving this Transfer will:
            </p>
            <ul className="mt-3 space-y-1.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                Create the official transaction (with a new Transfer Reference).
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                Close the deal and mark it non-editable.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                Record the full audit trail (event, actor, timestamp, remarks).
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                Trigger the client notification email.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />
                Make the transaction available for MSI Revenue.
              </li>
            </ul>
            <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              This action cannot be easily reversed.
            </p>
          </div>

          <div className="rounded-xl p-4 space-y-2"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-1"
              style={{ color: 'var(--text-secondary)' }}>Transfer Checklist</p>
            {CHECKLIST_ITEMS.map(item => (
              <label key={item.key} className="flex items-start gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={checks[item.key]}
                  onChange={e => setChecks(prev => ({ ...prev, [item.key]: e.target.checked }))}
                  disabled={submitting}
                  className="mt-0.5"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span style={{ color: 'var(--text-primary)' }}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--text-secondary)' }}>Remarks (optional)</label>
            <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)}
              maxLength={500}
              placeholder="Any internal note for this closure…"
              disabled={submitting}
              className="w-full px-3.5 py-2.5 rounded-xl text-sm text-text-primary outline-none"
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }} />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 flex items-start gap-2 text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--danger)' }}>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 flex items-center justify-end gap-2"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-raised)' }}>
          <button onClick={onCancel} disabled={submitting}
            className="px-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={!allChecked || submitting}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent disabled:cursor-not-allowed"
            style={{
              background: allChecked && !submitting
                ? 'linear-gradient(135deg, var(--accent), var(--accent-strong))'
                : 'var(--bg-base)',
              color: allChecked && !submitting ? undefined : 'var(--text-muted)',
              opacity: allChecked && !submitting ? 1 : 0.6,
              border: allChecked && !submitting ? 'none' : '1px solid var(--border)',
            }}>
            {submitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Approving…</>
              : <><Send className="w-4 h-4" /> Approve Transfer</>}
          </button>
        </div>
      </div>
    </div>
  );
}
