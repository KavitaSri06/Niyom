import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee } from './types';
import {
  ChevronLeft, Plus, X, Loader2, CheckCircle2, AlertCircle,
  Wallet, IndianRupee, Receipt, Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PaymentStatus = 'not_paid' | 'partially_paid' | 'fully_paid' | 'over_paid';

type PaymentMode =
  | 'imps' | 'neft' | 'rtgs' | 'upi' | 'cheque' | 'cash'
  | 'bank_transfer' | 'online_gateway' | 'demand_draft' | 'internal_adjustment';

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'imps',                label: 'IMPS' },
  { value: 'neft',                label: 'NEFT' },
  { value: 'rtgs',                label: 'RTGS' },
  { value: 'upi',                 label: 'UPI' },
  { value: 'bank_transfer',       label: 'Bank Transfer' },
  { value: 'cheque',              label: 'Cheque' },
  { value: 'demand_draft',        label: 'Demand Draft' },
  { value: 'online_gateway',      label: 'Online Gateway' },
  { value: 'cash',                label: 'Cash' },
  { value: 'internal_adjustment', label: 'Internal Adjustment' },
];

const MODE_LABEL: Record<PaymentMode, string> =
  PAYMENT_MODES.reduce((a, m) => ({ ...a, [m.value]: m.label }), {} as Record<PaymentMode, string>);

interface DealBrief {
  id: string;
  confirmation_number: string;
  snap_client_name: string;
  snap_pan: string;
  settlement_amount: number;
  employee_id: string;
}

interface Summary {
  deal_id: string;
  deal_amount: number;
  total_paid_amount: number;
  outstanding_amount: number;
  payment_status: PaymentStatus;
  payment_count: number;
  last_payment_at: string | null;
}

interface PaymentRow {
  id: string;
  payment_number: string;
  receipt_number: string | null;
  amount: number;
  amount_inr: number;
  currency: string;
  direction: 'inflow' | 'refund' | 'adjustment';
  payment_mode: PaymentMode;
  utr_number: string | null;
  cheque_number: string | null;
  cheque_bank: string | null;
  transaction_reference: string | null;
  payment_date: string;
  value_date: string | null;
  received_from_name: string;
  remarks: string;
  status: 'active' | 'cancelled' | 'superseded';
  created_at: string;
}

interface Props {
  deal: DealBrief;
  employee: NWEmployee;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const inr = (n: number) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_STYLES: Record<PaymentStatus, { label: string; bg: string; color: string; border: string }> = {
  not_paid:       { label: 'Not Paid',       bg: 'rgba(107,107,107,0.10)', color: 'var(--text-secondary)', border: 'rgba(107,107,107,0.25)' },
  partially_paid: { label: 'Partially Paid', bg: 'rgba(245,158,11,0.10)',  color: 'var(--warning)',        border: 'rgba(245,158,11,0.25)' },
  fully_paid:     { label: 'Fully Paid',     bg: 'rgba(16,185,129,0.10)',  color: 'var(--success)',        border: 'rgba(16,185,129,0.25)' },
  over_paid:      { label: 'Over Paid',      bg: 'rgba(239,68,68,0.10)',   color: 'var(--danger)',         border: 'rgba(239,68,68,0.25)' },
};

function StatusPill({ status }: { status: PaymentStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-lg uppercase tracking-wider"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {status === 'fully_paid' && <CheckCircle2 className="w-3.5 h-3.5" />}
      {(status === 'over_paid' || status === 'partially_paid') && <AlertCircle className="w-3.5 h-3.5" />}
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form controls (kept local; DealConfirmation.tsx patterns without importing)
// ---------------------------------------------------------------------------

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

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <select {...props}
      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-text-primary outline-none transition-all"
      style={{ background: 'var(--bg-base)', border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}` }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea {...props}
      className="w-full px-3.5 py-2.5 rounded-xl text-sm text-text-primary outline-none transition-all"
      style={{ background: 'var(--bg-base)', border: `1px solid ${focused ? 'var(--accent)' : 'var(--border)'}` }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

// ---------------------------------------------------------------------------
// Record-payment form state
// ---------------------------------------------------------------------------

interface PaymentForm {
  amount: string;
  paymentMode: PaymentMode | '';
  paymentDate: string;
  valueDate: string;
  utrNumber: string;
  transactionReference: string;
  chequeNumber: string;
  chequeBank: string;
  chequeDated: string;
  demandDraftNumber: string;
  receivedFromName: string;
  receivedFromBank: string;
  receivedFromAccount: string;
  remarks: string;
}

const emptyForm = (defaultName: string): PaymentForm => ({
  amount: '',
  paymentMode: '',
  paymentDate: new Date().toISOString().split('T')[0],
  valueDate: '',
  utrNumber: '',
  transactionReference: '',
  chequeNumber: '',
  chequeBank: '',
  chequeDated: '',
  demandDraftNumber: '',
  receivedFromName: defaultName,
  receivedFromBank: '',
  receivedFromAccount: '',
  remarks: '',
});

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DealPayments({ deal, employee, onBack }: Props) {
  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PaymentForm>(emptyForm(deal.snap_client_name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const set = <K extends keyof PaymentForm>(k: K, v: PaymentForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [sumRes, payRes] = await Promise.all([
      supabase.from('nw_deal_payment_summary')
        .select('deal_id, deal_amount, total_paid_amount, outstanding_amount, payment_status, payment_count, last_payment_at')
        .eq('deal_id', deal.id).maybeSingle(),
      supabase.from('nw_deal_payments')
        .select('id, payment_number, receipt_number, amount, amount_inr, currency, direction, payment_mode, utr_number, cheque_number, cheque_bank, transaction_reference, payment_date, value_date, received_from_name, remarks, status, created_at')
        .eq('deal_confirmation_id', deal.id)
        .order('created_at', { ascending: false }),
    ]);
    // If no payments yet, the view returns a row with zeros. Fall back to a
    // synthesised summary from the deal amount when maybeSingle returns null.
    setSummary(sumRes.data as Summary ?? {
      deal_id: deal.id,
      deal_amount: deal.settlement_amount,
      total_paid_amount: 0,
      outstanding_amount: deal.settlement_amount,
      payment_status: 'not_paid',
      payment_count: 0,
      last_payment_at: null,
    });
    setPayments((payRes.data as PaymentRow[]) ?? []);
    setLoading(false);
  }, [deal.id, deal.settlement_amount]);

  useEffect(() => { load(); }, [load]);

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const validate = (): string | null => {
    if (!form.amount) return 'Amount is required.';
    const amt = Number(form.amount);
    if (!Number.isFinite(amt) || amt <= 0) return 'Amount must be a positive number.';
    if (!form.paymentMode) return 'Payment mode is required.';
    if (!form.paymentDate) return 'Payment date is required.';
    if (form.paymentMode === 'cheque' && (!form.chequeNumber.trim() || !form.chequeBank.trim())) {
      return 'Cheque number and bank are required for cheque payments.';
    }
    return null;
  };

  const submit = async () => {
    setError('');
    const v = validate();
    if (v) { setError(v); return; }

    setSaving(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('record-payment', {
        body: {
          dealId: deal.id,
          amount: Number(form.amount),
          currency: 'INR',
          paymentMode: form.paymentMode,
          paymentDate: form.paymentDate,
          valueDate: form.valueDate || undefined,
          utrNumber: form.utrNumber.trim() || undefined,
          transactionReference: form.transactionReference.trim() || undefined,
          chequeNumber: form.chequeNumber.trim() || undefined,
          chequeBank: form.chequeBank.trim() || undefined,
          chequeDated: form.chequeDated || undefined,
          demandDraftNumber: form.demandDraftNumber.trim() || undefined,
          receivedFromName: form.receivedFromName.trim(),
          receivedFromBank: form.receivedFromBank.trim() || undefined,
          receivedFromAccount: form.receivedFromAccount.trim() || undefined,
          remarks: form.remarks.trim() || undefined,
        },
      });
      if (fnErr || !data?.success) {
        throw new Error(data?.error || fnErr?.message || 'Could not record payment.');
      }
      showToast('Payment recorded successfully.');
      setForm(emptyForm(deal.snap_client_name));
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const modeNeedsUtr = useMemo(() => {
    const m = form.paymentMode;
    return m === 'imps' || m === 'neft' || m === 'rtgs' || m === 'upi' || m === 'bank_transfer';
  }, [form.paymentMode]);

  const modeIsCheque = form.paymentMode === 'cheque';
  const modeIsDd    = form.paymentMode === 'demand_draft';

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ChevronLeft className="w-4 h-4" /> Back to Deal
        </button>
        <div className="flex-1" />
        {!showForm && summary && summary.payment_status !== 'fully_paid' && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
          >
            <Plus className="w-4 h-4" /> Record Payment
          </button>
        )}
      </div>

      {/* Title */}
      <div>
        <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'var(--accent)' }}>
          Payment Ledger
        </p>
        <h1 className="text-xl font-bold text-text-primary">
          {deal.confirmation_number} — {deal.snap_client_name}
        </h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>PAN: {deal.snap_pan || '—'}</p>
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <SummaryCard icon={<Receipt className="w-4 h-4" />} label="Deal Amount" value={inr(summary.deal_amount)} />
          <SummaryCard icon={<IndianRupee className="w-4 h-4" />} label="Total Paid" value={inr(summary.total_paid_amount)} tone="success" />
          <SummaryCard
            icon={<Wallet className="w-4 h-4" />}
            label="Outstanding"
            value={inr(summary.outstanding_amount)}
            tone={summary.outstanding_amount > 0 ? 'warning' : summary.outstanding_amount < 0 ? 'danger' : 'success'}
          />
          <div
            className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
          >
            <div>
              <p className="text-xs uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Status</p>
              <StatusPill status={summary.payment_status} />
            </div>
          </div>
        </div>
      )}

      {/* Over-paid warning */}
      {summary?.payment_status === 'over_paid' && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-2 text-sm"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)' }}
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Total payments exceed the deal amount by <strong>{inr(Math.abs(summary.outstanding_amount))}</strong>.
            Review the ledger and record a refund entry if appropriate.
          </span>
        </div>
      )}

      {/* Record-payment inline form */}
      {showForm && (
        <div
          className="rounded-2xl p-5 space-y-5"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              Record Payment
            </h2>
            <button
              onClick={() => { setShowForm(false); setError(''); }}
              className="p-1.5 rounded-lg"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div
              className="rounded-xl px-4 py-3 flex items-start gap-2 text-sm"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: 'var(--danger)' }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Amount (INR)" required>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="Payment Mode" required>
              <Select
                value={form.paymentMode}
                onChange={e => set('paymentMode', e.target.value as PaymentMode | '')}
              >
                <option value="">Select a mode…</option>
                {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>

            <Field label="Payment Date" required>
              <Input type="date" value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)} />
            </Field>
            <Field label="Value Date" hint="Credit-realised date (optional).">
              <Input type="date" value={form.valueDate} onChange={e => set('valueDate', e.target.value)} />
            </Field>

            {/* Mode-specific instrument fields */}
            {modeNeedsUtr && (
              <>
                <Field label="UTR Number" hint="Unique Transaction Reference from the bank.">
                  <Input value={form.utrNumber} onChange={e => set('utrNumber', e.target.value.trim())} placeholder="e.g. HDFCN12345678" />
                </Field>
                <Field label="Transaction Reference">
                  <Input value={form.transactionReference} onChange={e => set('transactionReference', e.target.value)} placeholder="RRN / bank txn id" />
                </Field>
              </>
            )}
            {modeIsCheque && (
              <>
                <Field label="Cheque Number" required>
                  <Input value={form.chequeNumber} onChange={e => set('chequeNumber', e.target.value.trim())} placeholder="123456" />
                </Field>
                <Field label="Cheque Bank" required>
                  <Input value={form.chequeBank} onChange={e => set('chequeBank', e.target.value)} placeholder="HDFC Bank" />
                </Field>
                <Field label="Cheque Dated">
                  <Input type="date" value={form.chequeDated} onChange={e => set('chequeDated', e.target.value)} />
                </Field>
              </>
            )}
            {modeIsDd && (
              <Field label="Demand Draft Number">
                <Input value={form.demandDraftNumber} onChange={e => set('demandDraftNumber', e.target.value.trim())} />
              </Field>
            )}

            <Field label="Received From (Name)">
              <Input value={form.receivedFromName} onChange={e => set('receivedFromName', e.target.value)} placeholder="Payer name" />
            </Field>
            <Field label="Payer Bank">
              <Input value={form.receivedFromBank} onChange={e => set('receivedFromBank', e.target.value)} placeholder="e.g. HDFC Bank" />
            </Field>
            <Field label="Payer Account (last few digits)">
              <Input value={form.receivedFromAccount} onChange={e => set('receivedFromAccount', e.target.value)} placeholder="e.g. XXXX1234" />
            </Field>
          </div>

          <Field label="Remarks">
            <TextArea rows={2} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Any internal note for this payment…" />
          </Field>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setError(''); }}
              className="px-4 py-2.5 rounded-xl text-sm"
              style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent"
              style={{
                background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
                opacity: saving ? 0.75 : 1,
              }}
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Recording…</> : <>Record Payment</>}
            </button>
          </div>
        </div>
      )}

      {/* Ledger */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
      >
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            Ledger
          </h3>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {payments.length} {payments.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> Loading payments…
          </div>
        ) : payments.length === 0 ? (
          <div className="p-10 text-center">
            <Info className="w-6 h-6 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No payments recorded yet.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
              Record the first payment to begin the receipt ledger.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-base)', color: 'var(--text-muted)' }}>
                  <Th>Date</Th>
                  <Th>Payment #</Th>
                  <Th>Mode</Th>
                  <Th>Reference</Th>
                  <Th>Received From</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <Td>{fmtDate(p.payment_date)}</Td>
                    <Td mono>{p.payment_number}</Td>
                    <Td>{MODE_LABEL[p.payment_mode]}</Td>
                    <Td mono>
                      {p.utr_number ||
                        p.cheque_number ||
                        p.transaction_reference ||
                        '—'}
                    </Td>
                    <Td>{p.received_from_name || '—'}</Td>
                    <Td align="right" strong>
                      {p.direction === 'refund' ? '-' : ''}{inr(Math.abs(p.amount_inr))}
                    </Td>
                    <Td>
                      {p.status === 'active' ? (
                        <span className="text-xs" style={{ color: 'var(--success)' }}>Active</span>
                      ) : (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.status}</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin footnote */}
      {!isAdmin && (
        <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
          You may record payments and view the ledger for deals you own. Cancellation of a recorded
          payment is restricted to administrators.
        </p>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 rounded-xl px-4 py-3 text-sm shadow-lg z-50 flex items-center gap-2"
          style={{
            background: toast.ok ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
            color: '#fff',
          }}
        >
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function SummaryCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success' ? 'var(--success)' :
    tone === 'warning' ? 'var(--warning)' :
    tone === 'danger'  ? 'var(--danger)'  : 'var(--text-bright)';
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
        {icon} {label}
      </p>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider"
      style={{ textAlign: align ?? 'left' }}
    >
      {children}
    </th>
  );
}

function Td({
  children, align, mono, strong,
}: { children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean; strong?: boolean }) {
  return (
    <td
      className={`px-4 py-3 ${mono ? 'font-mono text-xs' : ''} ${strong ? 'font-bold' : ''}`}
      style={{ textAlign: align ?? 'left', color: 'var(--text-primary)' }}
    >
      {children}
    </td>
  );
}
