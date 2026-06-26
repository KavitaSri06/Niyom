import React, { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWHolding, NWClient, NWDSA, NWDSADebitNote } from './types';
import { fmt, PRODUCT_LABELS } from './utils';
import { Wallet, Download, ChevronDown, FileText, RefreshCw, Loader2, FileCheck2, CheckCircle2, XCircle, Eye, Send, Lock, FileArchive } from 'lucide-react';
import JSZip from 'jszip';
import { generateDebitNotePdfBlob, DebitNoteParticular, computePayoutTds } from './dsaDebitNote';

const DEBIT_NOTE_BUCKET = 'dsa-debit-notes';

type StageStyle = { label: string; bg: string; color: string; border: string };

// Combined lifecycle stage derived from payment `status` + `signature_status`:
//   Generated → Sent for Signature → Viewed → Signed → Paid   (Cancelled is terminal)
function deriveStage(note: NWDSADebitNote): StageStyle {
  if (note.status === 'cancelled') return { label: 'Cancelled', bg: 'rgba(239,68,68,0.12)', color: '#F87171', border: 'rgba(239,68,68,0.4)' };
  if (note.status === 'paid') return { label: 'Paid', bg: 'rgba(16,185,129,0.12)', color: '#10B981', border: 'rgba(16,185,129,0.4)' };
  switch (note.signature_status) {
    case 'signed': return { label: 'Signed', bg: 'rgba(52,211,153,0.12)', color: '#34D399', border: 'rgba(52,211,153,0.4)' };
    case 'viewed': return { label: 'Viewed', bg: 'rgba(96,165,250,0.12)', color: '#60A5FA', border: 'rgba(96,165,250,0.4)' };
    case 'sent': return { label: 'Sent for Signature', bg: 'rgba(168,139,250,0.12)', color: '#A78BFA', border: 'rgba(168,139,250,0.4)' };
    default: return { label: 'Generated', bg: 'rgba(212,175,55,0.12)', color: '#D4AF37', border: 'rgba(212,175,55,0.4)' };
  }
}

const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }) : null;

interface Props { employee: NWEmployee; }

interface PayoutRow {
  dsa_id: string;
  dsa_code: string;
  dsa_name: string;
  client_id: string;
  client_name: string;
  client_code: string;
  product_type: string;
  product_name: string;
  quantity: number;
  dsa_price: number;
  client_price: number;
  payout: number;
}

interface DSAGroup {
  dsa_id: string;
  dsa_code: string;
  dsa_name: string;
  rows: PayoutRow[];
  total: number;
}

const DSA_PRICE_TYPES = ['unlisted_share', 'secondary_bond', 'primary_bond'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export default function DSAPayout({ employee }: Props) {
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [groups, setGroups] = useState<DSAGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [empList, setEmpList] = useState<{ id: string; full_name: string; employee_code: string }[]>([]);
  const [empFilter, setEmpFilter] = useState('all');

  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';
  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - i);

  React.useEffect(() => {
    if (!isAdmin) return;
    supabase.from('nw_employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name')
      .then(({ data }) => setEmpList((data as any[]) || []));
  }, [isAdmin]);

  function getLastDay(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
  }

  const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
  const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(getLastDay(selectedYear, selectedMonth)).padStart(2, '0')}`;

  const calculate = useCallback(async () => {
    setLoading(true);

    // Fetch clients with DSA mapping
    let clientQuery = supabase
      .from('nw_clients')
      .select('id, full_name, client_code, employee_id, sourced_via, dsa_id, dsa:nw_dsa(id, dsa_code, full_name)')
      .eq('sourced_via', 'dsa');
    if (!isAdmin) clientQuery = clientQuery.eq('employee_id', employee.id);
    else if (empFilter !== 'all') clientQuery = clientQuery.eq('employee_id', empFilter);
    const { data: clientData } = await clientQuery;
    const dsaClients = (clientData as (NWClient & { dsa: NWDSA })[]) || [];

    if (dsaClients.length === 0) { setGroups([]); setLoading(false); setHasLoaded(true); return; }

    const clientIds = dsaClients.map(c => c.id);

    // Fetch holdings created within the selected month for DSA applicable product types
    const { data: holdingData } = await supabase
      .from('nw_holdings')
      .select('*')
      .in('client_id', clientIds)
      .in('product_type', DSA_PRICE_TYPES);

    const holdings = (holdingData as NWHolding[]) || [];

    const rows: PayoutRow[] = [];

    for (const h of holdings) {
      const createdAt = h.created_at ? h.created_at.split('T')[0] : '';
      if (createdAt < startDate || createdAt > endDate) continue;

      const dsaPrice = h.dsa_price;
      const clientPrice = h.client_price;
      if (dsaPrice == null || clientPrice == null) continue;

      const qty = h.quantity || 0;
      const payout = (clientPrice - dsaPrice) * qty;

      const client = dsaClients.find(c => c.id === h.client_id);
      if (!client || !client.dsa) continue;

      rows.push({
        dsa_id: client.dsa.id,
        dsa_code: client.dsa.dsa_code,
        dsa_name: client.dsa.full_name,
        client_id: client.id,
        client_name: client.full_name,
        client_code: client.client_code,
        product_type: h.product_type,
        product_name: h.product_name,
        quantity: qty,
        dsa_price: dsaPrice,
        client_price: clientPrice,
        payout,
      });
    }

    // Group by DSA
    const dsaMap = new Map<string, DSAGroup>();
    for (const r of rows) {
      if (!dsaMap.has(r.dsa_id)) {
        dsaMap.set(r.dsa_id, {
          dsa_id: r.dsa_id,
          dsa_code: r.dsa_code,
          dsa_name: r.dsa_name,
          rows: [],
          total: 0,
        });
      }
      const g = dsaMap.get(r.dsa_id)!;
      g.rows.push(r);
      g.total += r.payout;
    }

    setGroups(Array.from(dsaMap.values()));
    setLoading(false);
    setHasLoaded(true);
  }, [selectedYear, selectedMonth, empFilter, isAdmin, employee.id, startDate, endDate]);

  const totalPayout = groups.reduce((s, g) => s + g.total, 0);
  // Fixed 2% TDS applied to every payout → net total actually payable.
  const totalTds = computePayoutTds(totalPayout).tds;
  const totalNet = totalPayout - totalTds;

  // ---------- Debit Note state ----------
  const month = selectedMonth + 1; // 1-12
  const [debitNotes, setDebitNotes] = useState<NWDSADebitNote[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [regenDsaId, setRegenDsaId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<NWDSADebitNote | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState('');

  const loadDebitNotes = useCallback(async () => {
    const { data } = await supabase
      .from('dsa_debit_notes')
      .select('*, dsa:nw_dsa(full_name, dsa_code), paid_by_employee:nw_employees!paid_by(full_name), cancelled_by_employee:nw_employees!cancelled_by(full_name)')
      .eq('year', selectedYear)
      .eq('month', month)
      .order('debit_note_number', { ascending: true });
    setDebitNotes((data as NWDSADebitNote[]) || []);
  }, [selectedYear, month]);

  React.useEffect(() => { loadDebitNotes(); }, [loadDebitNotes]);

  // Generate (or regenerate) a debit note for a single DSA group
  async function generateForGroup(g: DSAGroup, existing: NWDSADebitNote | undefined) {
    // Full DSA details for the PDF (bank, pan, address, etc.)
    const { data: dsaData } = await supabase.from('nw_dsa').select('*').eq('id', g.dsa_id).single();
    const dsa = dsaData as NWDSA;
    if (!dsa) throw new Error(`DSA ${g.dsa_code} not found`);

    // Reuse the existing number on regenerate, else mint a new one
    let number = existing?.debit_note_number;
    if (!number) {
      const { data: num, error: numErr } = await supabase.rpc('nw_generate_debit_note_number', {
        p_year: selectedYear, p_month: month,
      });
      if (numErr) throw numErr;
      number = num as string;
    }

    const particulars: DebitNoteParticular[] = g.rows.map(r => ({
      client_name: r.client_name,
      client_code: r.client_code,
      product_type: r.product_type,
      product_name: r.product_name,
      quantity: r.quantity,
      payout: r.payout,
    }));

    // Fixed 2% TDS on the gross payout → net amount actually paid out.
    const { gross, tds, net } = computePayoutTds(g.total);

    // Single document date shared by the rendered PDF and the snapshot, so the
    // signed copy (rebuilt from the snapshot) is byte-for-byte equivalent.
    const documentDate = new Date();
    const noteInput = {
      debitNoteNumber: number!,
      date: documentDate,
      month, year: selectedYear,
      dsa, particulars, total: gross,
      tdsAmount: tds, netPayable: net,
      generatedBy: employee.full_name,
    };

    const blob = await generateDebitNotePdfBlob(noteInput);

    const path = `${selectedYear}/${String(month).padStart(2, '0')}/${number}.pdf`;
    const { error: upErr } = await supabase.storage
      .from(DEBIT_NOTE_BUCKET)
      .upload(path, blob, { upsert: true, contentType: 'application/pdf' });
    if (upErr) throw upErr;

    // Immutable render snapshot (serializable DebitNoteInput) — lets the public
    // signing page rebuild the identical document and embed the DSA signature
    // without recomputing any payout/TDS values.
    const pdf_snapshot = {
      debitNoteNumber: number,
      dateISO: documentDate.toISOString(),
      month, year: selectedYear,
      dsa, particulars,
      total: gross, tdsAmount: tds, netPayable: net,
      generatedBy: employee.full_name,
    };

    // `existing` is only ever an ACTIVE (non-cancelled) note — a cancelled note
    // is an immutable audit record and is never passed in here. So we update an
    // active note in place (regenerate, same number) or insert a brand-new note
    // (first generation, or a replacement after a prior note was cancelled).
    let savedId: string | undefined;
    if (existing) {
      const { data: updated, error: dbErr } = await supabase.from('dsa_debit_notes')
        .update({
          payout_amount: gross,
          tds_amount: tds,
          net_payable_amount: net,
          generated_at: documentDate.toISOString(),
          pdf_url: path,
          pdf_snapshot,
          created_by: employee.id,
        })
        .eq('id', existing.id)
        .select('id').single();
      if (dbErr) throw dbErr;
      savedId = updated?.id;
    } else {
      const { data: inserted, error: dbErr } = await supabase.from('dsa_debit_notes')
        .insert({
          dsa_id: g.dsa_id,
          month, year: selectedYear,
          payout_amount: gross,
          tds_amount: tds,
          net_payable_amount: net,
          debit_note_number: number,
          generated_at: documentDate.toISOString(),
          pdf_url: path,
          pdf_snapshot,
          created_by: employee.id,
        })
        .select('id').single();
      if (dbErr) throw dbErr;
      savedId = inserted?.id;
    }

    // Audit: record generation (best-effort; never block the generate flow)
    if (savedId) {
      await supabase.from('dsa_debit_note_events').insert({
        debit_note_id: savedId, event_type: 'generated', actor: 'employee',
        metadata: { debit_note_number: number, regenerated: !!existing },
      });
    }
  }

  const generateAllDebitNotes = async () => {
    if (groups.length === 0) return;
    setGenerating(true);
    setGenStatus('');
    try {
      // Only an ACTIVE (non-cancelled) note counts as "existing". A cancelled
      // note is an immutable audit record and must NOT block a fresh note for
      // the same DSA/period — generation creates a new note (next sequential
      // number) reflecting the corrected payout.
      const activeByDsa = new Map(
        debitNotes.filter(n => n.status !== 'cancelled').map(n => [n.dsa_id, n])
      );
      let done = 0;
      let skipped = 0;
      for (const g of groups) {
        const existing = activeByDsa.get(g.dsa_id);
        // A signed note is locked (audit record) — never regenerate over it.
        if (existing && existing.signature_status === 'signed') {
          skipped++;
          continue;
        }
        setGenStatus(`Generating ${++done}/${groups.length} — ${g.dsa_name}`);
        await generateForGroup(g, existing);
      }
      await loadDebitNotes();
      const note = skipped ? ` (${skipped} signed skipped)` : '';
      setGenStatus(`Generated ${done} debit note${done === 1 ? '' : 's'} for ${MONTHS[selectedMonth]} ${selectedYear}${note}`);
    } catch (e) {
      setGenStatus(`Error: ${e instanceof Error ? e.message : 'Failed to generate debit notes'}`);
    } finally {
      setGenerating(false);
    }
  };

  const regenerateOne = async (note: NWDSADebitNote) => {
    if (note.signature_status === 'signed') {
      setGenStatus('Signed debit notes are locked and cannot be regenerated.');
      return;
    }
    if (note.status !== 'generated') {
      setGenStatus(`Cannot regenerate a ${note.status} debit note.`);
      return;
    }
    const g = groups.find(x => x.dsa_id === note.dsa_id);
    if (!g) {
      setGenStatus('Recalculate payout for this period before regenerating.');
      return;
    }
    setRegenDsaId(note.dsa_id);
    setGenStatus('');
    try {
      await generateForGroup(g, note);
      await loadDebitNotes();
      setGenStatus(`Regenerated ${note.debit_note_number}`);
    } catch (e) {
      setGenStatus(`Error: ${e instanceof Error ? e.message : 'Failed to regenerate'}`);
    } finally {
      setRegenDsaId(null);
    }
  };

  // When a signed copy exists, Preview/Download act on it; otherwise on the
  // original generated PDF. The original is always preserved separately.
  const noteObjectPath = (note: NWDSADebitNote) => note.signed_pdf_url || note.pdf_url;
  const noteFileName = (note: NWDSADebitNote) =>
    note.signed_pdf_url ? `${note.debit_note_number}-signed.pdf` : `${note.debit_note_number}.pdf`;

  const downloadNote = async (note: NWDSADebitNote) => {
    setDownloadingId(note.id);
    try {
      const { data, error } = await supabase.storage
        .from(DEBIT_NOTE_BUCKET)
        .createSignedUrl(noteObjectPath(note), 120, { download: noteFileName(note) });
      if (error || !data) throw error || new Error('Could not create download link');
      window.open(data.signedUrl, '_blank');
    } catch (e) {
      setGenStatus(`Error: ${e instanceof Error ? e.message : 'Download failed'}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const previewNote = async (note: NWDSADebitNote) => {
    setPreviewingId(note.id);
    try {
      // No `download` option → the PDF opens inline in a new browser tab
      const { data, error } = await supabase.storage
        .from(DEBIT_NOTE_BUCKET)
        .createSignedUrl(noteObjectPath(note), 120);
      if (error || !data) throw error || new Error('Could not create preview link');
      window.open(data.signedUrl, '_blank');
    } catch (e) {
      setGenStatus(`Error: ${e instanceof Error ? e.message : 'Preview failed'}`);
    } finally {
      setPreviewingId(null);
    }
  };

  // Send (or resend) the secure signing link to the DSA via the edge function.
  const sendForSignature = async (note: NWDSADebitNote) => {
    if (sendingId) return;
    if (note.signature_status === 'signed') { setGenStatus('This debit note is already signed.'); return; }
    setSendingId(note.id);
    setGenStatus('');
    try {
      const { data, error } = await supabase.functions.invoke('send-debit-note-email', {
        body: { debitNoteId: note.id },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Failed to send link');
      await loadDebitNotes();
      setGenStatus(note.signature_status === 'not_sent'
        ? `Signing link sent to ${note.dsa?.full_name || 'DSA'}`
        : `Signing link resent to ${note.dsa?.full_name || 'DSA'}`);
    } catch (e) {
      setGenStatus(`Error: ${e instanceof Error ? e.message : 'Failed to send signing link'}`);
    } finally {
      setSendingId(null);
    }
  };

  // Monthly ZIP: bundle one PDF per debit note (signed copy when available,
  // else the generated copy), preserving the debit note number as the filename.
  const downloadZip = async () => {
    if (zipping) return;
    const notes = debitNotes.filter(n => noteObjectPath(n));
    if (notes.length === 0) { setGenStatus('No debit notes to download for this period.'); return; }
    setZipping(true);
    setGenStatus('');
    try {
      const zip = new JSZip();
      let added = 0;
      for (const n of notes) {
        const { data, error } = await supabase.storage
          .from(DEBIT_NOTE_BUCKET)
          .createSignedUrl(noteObjectPath(n), 300);
        if (error || !data?.signedUrl) continue;
        const resp = await fetch(data.signedUrl);
        if (!resp.ok) continue;
        const buf = await resp.arrayBuffer();
        zip.file(`${n.debit_note_number}.pdf`, buf);
        added++;
      }
      if (added === 0) throw new Error('Could not retrieve any debit note PDFs');

      const blob = await zip.generateAsync({ type: 'blob' });
      const fileName = `Debit_Notes_${selectedYear}_${String(month).padStart(2, '0')}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);

      // Audit: per-document event trail + a single activity-log entry.
      await supabase.from('dsa_debit_note_events').insert(
        notes.map(n => ({ debit_note_id: n.id, event_type: 'zip_downloaded', actor: 'employee', metadata: { fileName } }))
      );
      await supabase.from('nw_activity_logs').insert([{
        employee_id: employee.id,
        action: 'Debit Notes ZIP Downloaded',
        description: `${fileName} — ${added} debit note${added === 1 ? '' : 's'} for ${MONTHS[selectedMonth]} ${selectedYear}`,
      }]);

      setGenStatus(`Downloaded ${fileName} (${added} debit note${added === 1 ? '' : 's'})`);
    } catch (e) {
      setGenStatus(`Error: ${e instanceof Error ? e.message : 'ZIP download failed'}`);
    } finally {
      setZipping(false);
    }
  };

  const markAsPaid = async (note: NWDSADebitNote) => {
    setStatusBusyId(note.id);
    setGenStatus('');
    try {
      const { error } = await supabase.from('dsa_debit_notes')
        .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: employee.id })
        .eq('id', note.id);
      if (error) throw error;
      await supabase.from('dsa_debit_note_events').insert({
        debit_note_id: note.id, event_type: 'marked_paid', actor: 'employee',
        metadata: { net_payable: note.net_payable_amount ?? note.payout_amount },
      });
      await loadDebitNotes();
      setGenStatus(`${note.debit_note_number} marked as Paid`);
    } catch (e) {
      setGenStatus(`Error: ${e instanceof Error ? e.message : 'Failed to mark as paid'}`);
    } finally {
      setStatusBusyId(null);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const reason = cancelReason.trim();
    if (!reason) { setCancelError('A cancellation reason is required.'); return; }
    const note = cancelTarget;
    if (note.signature_status === 'signed') { setCancelError('Signed debit notes are locked and cannot be cancelled.'); return; }
    setStatusBusyId(note.id);
    setCancelError('');
    setGenStatus('');
    try {
      const cancelledAt = new Date().toISOString();
      const { error } = await supabase.from('dsa_debit_notes')
        .update({ status: 'cancelled', cancelled_at: cancelledAt, cancelled_by: employee.id, cancel_reason: reason })
        .eq('id', note.id)
        .eq('status', 'generated'); // guard: never re-cancel / overwrite an existing cancellation
      if (error) throw error;
      // Audit trail
      await supabase.from('nw_activity_logs').insert([{
        employee_id: employee.id,
        action: 'Debit Note Cancelled',
        description: `${note.debit_note_number} (${note.dsa?.full_name || 'DSA'}) — ${fmt(note.net_payable_amount ?? note.payout_amount)} net payable cancelled. Reason: ${reason}`,
      }]);
      await supabase.from('dsa_debit_note_events').insert({
        debit_note_id: note.id, event_type: 'cancelled', actor: 'employee',
        metadata: { reason },
      });
      await loadDebitNotes();
      setGenStatus(`${note.debit_note_number} cancelled`);
      setCancelTarget(null);
      setCancelReason('');
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'Failed to cancel');
    } finally {
      setStatusBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#D4AF37' }}>DSA</p>
          <h1 className="text-2xl font-bold text-white">DSA Payout</h1>
          <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>Automated payout based on client price − DSA price × quantity</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {debitNotes.length > 0 && (
            <button onClick={downloadZip} disabled={zipping}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
              {zipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
              {zipping ? 'Preparing ZIP...' : 'Download ZIP'}
            </button>
          )}
          {hasLoaded && groups.length > 0 && (
            <button onClick={generateAllDebitNotes} disabled={generating}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.4)' }}>
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {generating ? 'Generating...' : 'Generate Debit Note'}
            </button>
          )}
          <button onClick={calculate} disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-black disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
            <Wallet className="w-4 h-4" />
            {loading ? 'Calculating...' : 'Calculate Payout'}
          </button>
        </div>
      </div>

      {/* Period selector */}
      <div className="rounded-2xl p-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#6B6B6B' }}>Select Period</p>
        <div className="flex items-center gap-3 flex-wrap">
          {isAdmin && (
            <div className="relative">
              <select value={empFilter} onChange={e => setEmpFilter(e.target.value)}
                className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                style={{ background: '#050505', border: '1px solid rgba(212,175,55,0.4)' }}>
                <option value="all">All Employees</option>
                {empList.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#D4AF37' }} />
            </div>
          )}
          <div className="relative">
            <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
              className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
              style={{ background: '#050505', border: '1px solid #1E1E24' }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#4A4A4A' }} />
          </div>
          <div className="relative">
            <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
              style={{ background: '#050505', border: '1px solid #1E1E24' }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#4A4A4A' }} />
          </div>
          <div className="px-3 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37' }}>
            {startDate} &rarr; {endDate}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {hasLoaded && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Gross Payout', value: fmt(totalPayout), color: '#8A8A8A' },
            { label: 'TDS @ 2%', value: `- ${fmt(totalTds)}`, color: '#F87171' },
            { label: 'Net Payable', value: fmt(totalNet), color: '#10B981' },
            { label: 'DSAs Involved', value: String(groups.length), color: '#D4AF37' },
            { label: 'Total Entries', value: String(groups.reduce((s, g) => s + g.rows.length, 0)), color: '#8A8A8A' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#4A4A4A' }}>{s.label}</p>
              <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Debit Note status banner */}
      {(generating || genStatus) && (
        <div className="rounded-xl px-4 py-3 flex items-center gap-3 text-sm"
          style={{
            background: genStatus.startsWith('Error') ? 'rgba(239,68,68,0.08)' : 'rgba(212,175,55,0.08)',
            border: `1px solid ${genStatus.startsWith('Error') ? 'rgba(239,68,68,0.3)' : 'rgba(212,175,55,0.25)'}`,
            color: genStatus.startsWith('Error') ? '#F87171' : '#D4AF37',
          }}>
          {generating && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{generating ? genStatus || 'Generating debit notes...' : genStatus}</span>
        </div>
      )}

      {/* Previous Debit Notes for the selected month */}
      {debitNotes.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'rgba(212,175,55,0.04)', borderBottom: '1px solid #1E1E24' }}>
            <div className="flex items-center gap-2">
              <FileCheck2 className="w-4 h-4" style={{ color: '#D4AF37' }} />
              <p className="text-sm font-bold text-white">Debit Notes — {MONTHS[selectedMonth]} {selectedYear}</p>
            </div>
            <p className="text-xs" style={{ color: '#4A4A4A' }}>{debitNotes.length} generated</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                  {['Debit Note No.', 'DSA', 'Net Payable', 'Status', 'Timeline', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A4A4A' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {debitNotes.map(note => {
                  const stage = deriveStage(note);
                  const busy = statusBusyId === note.id;
                  const signed = note.signature_status === 'signed';
                  const locked = signed || note.status === 'cancelled';
                  // payout_amount is the gross; fall back to deriving TDS/net for
                  // any pre-TDS legacy rows that have not been backfilled yet.
                  const gross = note.payout_amount;
                  const tds = note.tds_amount ?? computePayoutTds(gross).tds;
                  const net = note.net_payable_amount ?? (gross - tds);
                  // Completed-step timestamps for the Generated→…→Paid timeline.
                  const steps: { label: string; at: string | null; color: string }[] = [
                    { label: 'Sent', at: fmtDateTime(note.sent_at), color: '#A78BFA' },
                    { label: 'Viewed', at: fmtDateTime(note.viewed_at), color: '#60A5FA' },
                    { label: 'Signed', at: fmtDateTime(note.signed_at), color: '#34D399' },
                    { label: 'Paid', at: note.paid_at ? fmtDateTime(note.paid_at) : null, color: '#10B981' },
                  ].filter(s => s.at);
                  return (
                  <tr key={note.id} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-5 py-3 text-sm font-mono" style={{ color: '#D4AF37' }}>
                      {note.debit_note_number}
                      {signed && <Lock className="w-3 h-3 inline-block ml-1.5 -mt-0.5" style={{ color: '#34D399' }} />}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-white">{note.dsa?.full_name || '—'}</p>
                      <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{note.dsa?.dsa_code || ''}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-bold text-emerald-400">{fmt(net)}</p>
                      <p className="text-xs" style={{ color: '#4A4A4A' }}>Gross {fmt(gross)} · TDS {fmt(tds)}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{ background: stage.bg, color: stage.color, border: `1px solid ${stage.border}` }}>
                        {stage.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs" style={{ color: '#6B6B6B' }}>
                      {note.status === 'cancelled' ? (
                        <div className="max-w-[240px]">
                          <p style={{ color: '#F87171' }}>Cancelled {note.cancelled_at ? new Date(note.cancelled_at).toLocaleDateString('en-IN') : ''}</p>
                          <p style={{ color: '#4A4A4A' }}>by {note.cancelled_by_employee?.full_name || '—'}</p>
                          {note.cancel_reason && (
                            <p className="mt-1" style={{ color: '#8A8A8A' }}>
                              <span style={{ color: '#5A5A5A' }}>Reason: </span>{note.cancel_reason}
                            </p>
                          )}
                        </div>
                      ) : steps.length ? (
                        <div className="space-y-0.5">
                          {steps.map(s => (
                            <p key={s.label}><span style={{ color: s.color }}>{s.label} On:</span> {s.at}</p>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: '#4A4A4A' }}>—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={() => previewNote(note)} disabled={previewingId === note.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                          style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
                          {previewingId === note.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                          {signed ? 'Preview Signed' : 'Preview'}
                        </button>
                        <button onClick={() => downloadNote(note)} disabled={downloadingId === note.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                          style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
                          {downloadingId === note.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          {signed ? 'Download Signed' : 'Download'}
                        </button>
                        {/* Send / Resend for signature — until signed, while active */}
                        {!locked && (
                          <button onClick={() => sendForSignature(note)} disabled={sendingId === note.id}
                            title={note.signature_status === 'not_sent' ? 'Email the DSA a secure signing link' : 'Resend the secure signing link'}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{ background: 'rgba(168,139,250,0.1)', color: '#A78BFA', border: '1px solid rgba(168,139,250,0.3)' }}>
                            {sendingId === note.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            {note.signature_status === 'not_sent' ? 'Send for Signature' : 'Resend Link'}
                          </button>
                        )}
                        {/* Regenerate / Cancel — disabled once signed or cancelled */}
                        {note.status === 'generated' && !signed && (
                          <>
                            <button onClick={() => regenerateOne(note)}
                              disabled={regenDsaId === note.dsa_id || !groups.some(g => g.dsa_id === note.dsa_id)}
                              title={groups.some(g => g.dsa_id === note.dsa_id) ? 'Regenerate PDF' : 'Recalculate payout to regenerate'}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                              style={{ background: 'rgba(212,175,55,0.08)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.25)' }}>
                              {regenDsaId === note.dsa_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              Regenerate
                            </button>
                            {isAdmin && (
                              <button onClick={() => { setCancelTarget(note); setCancelReason(''); setCancelError(''); }} disabled={busy}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                                style={{ background: 'rgba(239,68,68,0.08)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                                <XCircle className="w-3.5 h-3.5" />
                                Cancel
                              </button>
                            )}
                          </>
                        )}
                        {/* Mark as Paid — admin; available for generated notes (incl. after signing) */}
                        {isAdmin && note.status === 'generated' && (
                          <button onClick={() => markAsPaid(note)} disabled={busy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
                            style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)' }}>
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            Mark as Paid
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DSA Groups */}
      {hasLoaded && (
        <div className="space-y-4">
          {groups.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <Wallet className="w-10 h-10 mx-auto mb-3" style={{ color: '#2A2A2A' }} />
              <p className="text-sm font-semibold" style={{ color: '#4A4A4A' }}>No DSA payout entries for {MONTHS[selectedMonth]} {selectedYear}</p>
              <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>DSA payouts are generated from holdings added in the selected period with DSA pricing</p>
            </div>
          ) : groups.map(g => {
            const gTds = computePayoutTds(g.total).tds;
            const gNet = g.total - gTds;
            return (
            <div key={g.dsa_id} className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'rgba(212,175,55,0.04)', borderBottom: '1px solid #1E1E24' }}>
                <div>
                  <p className="text-sm font-bold text-white">{g.dsa_name}</p>
                  <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{g.dsa_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: '#4A4A4A' }}>Net Payable (after 2% TDS)</p>
                  <p className="text-lg font-bold text-emerald-400">{fmt(gNet)}</p>
                  <p className="text-xs" style={{ color: '#4A4A4A' }}>Gross {fmt(g.total)} · TDS {fmt(gTds)}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                      {['Client', 'Product', 'Qty', 'DSA Price', 'Client Price', 'Payout'].map(h => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#4A4A4A' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #111' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#0D0D0D')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td className="px-5 py-3">
                          <p className="text-sm font-medium text-white">{r.client_name}</p>
                          <p className="text-xs font-mono" style={{ color: '#4A4A4A' }}>{r.client_code}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm text-white">{r.product_name}</p>
                          <p className="text-xs" style={{ color: '#6B6B6B' }}>{PRODUCT_LABELS[r.product_type]}</p>
                        </td>
                        <td className="px-5 py-3 text-sm text-white">{r.quantity.toLocaleString('en-IN')}</td>
                        <td className="px-5 py-3 text-sm text-white">{fmt(r.dsa_price)}</td>
                        <td className="px-5 py-3 text-sm text-white">{fmt(r.client_price)}</td>
                        <td className="px-5 py-3">
                          <p className={`text-sm font-bold ${r.payout >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.payout >= 0 ? '' : '-'}{fmt(Math.abs(r.payout))}
                          </p>
                          <p className="text-xs" style={{ color: '#4A4A4A' }}>
                            Spread: {fmt(r.client_price - r.dsa_price)} × {r.quantity}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid #1E1E24' }}>
                      <td colSpan={5} className="px-5 py-2.5 text-xs font-bold" style={{ color: '#4A4A4A' }}>Gross Payout — {g.dsa_name}</td>
                      <td className="px-5 py-2.5 text-sm font-semibold" style={{ color: '#8A8A8A' }}>{fmt(g.total)}</td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-5 py-2.5 text-xs font-bold" style={{ color: '#4A4A4A' }}>TDS @ 2%</td>
                      <td className="px-5 py-2.5 text-sm font-semibold" style={{ color: '#F87171' }}>- {fmt(gTds)}</td>
                    </tr>
                    <tr style={{ borderTop: '1px solid #1E1E24' }}>
                      <td colSpan={5} className="px-5 py-3 text-xs font-bold" style={{ color: '#D4AF37' }}>Net Payable — {g.dsa_name}</td>
                      <td className="px-5 py-3 text-sm font-bold text-emerald-400">{fmt(gNet)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            );
          })}

          {groups.length > 1 && (
            <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
              <div>
                <p className="text-sm font-bold text-white">Net Payable — All DSAs</p>
                <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>Gross {fmt(totalPayout)} · TDS @ 2% {fmt(totalTds)}</p>
              </div>
              <p className="text-xl font-bold text-emerald-400">{fmt(totalNet)}</p>
            </div>
          )}
        </div>
      )}

      {!hasLoaded && (
        <div className="rounded-2xl p-12 text-center" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <Wallet className="w-10 h-10 mx-auto mb-3" style={{ color: '#2A2A2A' }} />
          <p className="text-sm font-semibold" style={{ color: '#4A4A4A' }}>Select a period and click Calculate Payout</p>
          <p className="text-xs mt-1" style={{ color: '#2A2A2A' }}>Payout = (Client Price − DSA Price) × Quantity for each DSA holding</p>
        </div>
      )}

      {/* Cancel Debit Note — confirmation modal (reason required) */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => { if (statusBusyId !== cancelTarget.id) setCancelTarget(null); }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #1E1E24' }}>
              <XCircle className="w-5 h-5" style={{ color: '#F87171' }} />
              <p className="text-sm font-bold text-white">Cancel Debit Note</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p style={{ color: '#F87171' }} className="font-mono font-semibold">{cancelTarget.debit_note_number}</p>
                <p className="text-xs mt-0.5" style={{ color: '#8A8A8A' }}>
                  {cancelTarget.dsa?.full_name || 'DSA'} · {fmt(cancelTarget.net_payable_amount ?? cancelTarget.payout_amount)} net payable
                </p>
              </div>
              <p className="text-xs" style={{ color: '#6B6B6B' }}>
                Cancellation is permanent and recorded in the audit log. The reason cannot be edited afterwards.
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8A8A8A' }}>
                  Cancellation Reason <span style={{ color: '#F87171' }}>*</span>
                </label>
                <textarea
                  value={cancelReason}
                  onChange={e => { setCancelReason(e.target.value); if (cancelError) setCancelError(''); }}
                  rows={3}
                  placeholder="Enter the reason for cancelling this debit note"
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none resize-none"
                  style={{ background: '#050505', border: `1px solid ${cancelError ? '#F87171' : '#1E1E24'}` }}
                />
                {cancelError && <p className="text-xs mt-1.5" style={{ color: '#F87171' }}>{cancelError}</p>}
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-end gap-2" style={{ borderTop: '1px solid #1E1E24' }}>
              <button onClick={() => setCancelTarget(null)} disabled={statusBusyId === cancelTarget.id}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>
                Keep Debit Note
              </button>
              <button onClick={confirmCancel} disabled={statusBusyId === cancelTarget.id || !cancelReason.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.4)' }}>
                {statusBusyId === cancelTarget.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
