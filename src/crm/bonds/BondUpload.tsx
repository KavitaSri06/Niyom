// Admin: upload a bond sheet → parse → verify in a preview grid → save.
//
// Excel is parsed client-side now; PDF/Word show the "coming soon" message from
// the modular parser. Low-confidence rows are highlighted and flagged
// needs_review (persisted), never silently trusted. Pricing uses one knob: a %
// increase applied to each bond's existing price (the imported Price Per 100) to
// derive the selling price. Admin may correct any cell, drop bad rows, then save.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2,
  Loader2, Trash2, Filter, Percent,
} from 'lucide-react';
import { NWEmployee } from '../types';
import { BondStatus, ParsedBond, ParsedBondData } from './bondTypes';
import { BOND_STATUSES } from './bondConstants';
import { computeSellingPrice } from './bondUtils';
import { parseBondFile } from './bondParser';
import { insertBatch, uploadDocument, BondInsertRow } from './bondService';

const DEFAULT_MARKUP = 2;

interface Props {
  employee: NWEmployee;
  employeeId: string | null;
  onBack: () => void;
  onDone: (count: number) => void;
}

interface EditableRow extends ParsedBond {
  included: boolean;
  selling_price: number | null;   // derived from existing price + markup %
  status: BondStatus;
}

type Phase = 'select' | 'parsing' | 'preview' | 'saving';

const cellInput = 'w-full px-2 py-1 rounded-md text-xs outline-none';
const cellStyle = { background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' };

export default function BondUpload({ employeeId, onBack, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('select');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [markup, setMarkup] = useState<number>(DEFAULT_MARKUP);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setError(null);
    setMessage(null);
    setPhase('parsing');
    try {
      const result = await parseBondFile(f);
      if (!result.supported) {
        setMessage(result.message || 'This file type cannot be parsed yet.');
        setPhase('select');
        return;
      }
      if (result.bonds.length === 0) {
        setMessage(result.message || 'No bonds were detected in this file.');
        setPhase('select');
        return;
      }
      setCategories(result.categories);
      setRows(result.bonds.map(b => ({
        ...b,
        included: true,
        selling_price: computeSellingPrice(b.data.purchase_price, 'percent', DEFAULT_MARKUP),
        status: 'Available' as BondStatus,
      })));
      setPhase('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read the file.');
      setPhase('select');
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const patchRow = (i: number, patch: Partial<EditableRow>) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const patchData = (i: number, patch: Partial<ParsedBondData>) =>
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, data: { ...r.data, ...patch } } : r)));

  // Apply the single markup % to every row: selling price = existing price + %.
  const applyMarkup = (pct: number) =>
    setRows(rs => rs.map(r => ({ ...r, selling_price: computeSellingPrice(r.data.purchase_price, 'percent', pct) })));

  const flaggedCount = useMemo(() => rows.filter(r => r.needsReview).length, [rows]);
  const includedCount = useMemo(() => rows.filter(r => r.included).length, [rows]);
  const visibleRows = useMemo(() => rows.map((r, i) => ({ r, i })).filter(({ r }) => !onlyFlagged || r.needsReview), [rows, onlyFlagged]);

  const save = async () => {
    setPhase('saving');
    setError(null);
    try {
      const docFormat = file?.name.toLowerCase().endsWith('.pdf') ? 'pdf'
        : file?.name.toLowerCase().endsWith('.doc') || file?.name.toLowerCase().endsWith('.docx') ? 'word' : 'excel';
      let documentId: string | null = null;
      if (file) {
        const extracted = rows.filter(r => r.included).map(r => r.data);
        const up = await uploadDocument(file, docFormat, extracted, includedCount, employeeId);
        documentId = up.id;
      }
      const payload: BondInsertRow[] = rows.filter(r => r.included).map(r => ({
        ...r.data,
        face_value: r.data.face_value,
        selling_price: r.selling_price,
        status: r.status,
        source: 'excel_upload',
        ocr_confidence: r.confidence,
        needs_review: r.needsReview,
      }));
      const { count, error: insErr } = await insertBatch(payload, documentId);
      if (insErr) { setError(insErr); setPhase('preview'); return; }
      onDone(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save bonds.');
      setPhase('preview');
    }
  };

  // ---- Select / upload screen ----
  if (phase === 'select' || phase === 'parsing') {
    return (
      <div className="max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold mb-5" style={{ color: 'var(--text-secondary)' }}>
          <ArrowLeft className="w-4 h-4" /> Back to database
        </button>
        <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Upload Bond Sheet</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-faint)' }}>Accepted: Excel (.xlsx) — fully parsed. PDF / Word are accepted and will be supported once an extraction engine is enabled.</p>

        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className="rounded-2xl p-12 text-center cursor-pointer transition-all"
          style={{ background: 'var(--bg-surface)', border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}` }}>
          {phase === 'parsing' ? (
            <>
              <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin" style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Extracting bonds…</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Drop a bond sheet here, or click to browse</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>.xlsx, .xls, .csv, .pdf, .docx</p>
            </>
          )}
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv,.pdf,.doc,.docx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>

        {message && (
          <div className="mt-4 p-4 rounded-xl flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgb(245,158,11)' }} />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{message}</p>
          </div>
        )}
        {error && <p className="mt-4 text-sm" style={{ color: 'rgb(239,68,68)' }}>{error}</p>}
      </div>
    );
  }

  // ---- Preview / verify screen ----
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Verify & Save</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
            <span className="flex items-center gap-1" style={{ color: 'var(--text-faint)' }}><FileSpreadsheet className="w-3.5 h-3.5" />{file?.name}</span>
            <span style={{ color: 'var(--text-faint)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)' }}>{includedCount} to import</span>
            {flaggedCount > 0 && <><span style={{ color: 'var(--text-faint)' }}>·</span><span className="font-semibold" style={{ color: 'rgb(245,158,11)' }}>{flaggedCount} need review</span></>}
            {categories.length > 0 && <><span style={{ color: 'var(--text-faint)' }}>·</span><span style={{ color: 'var(--text-faint)' }}>{categories.length} categor{categories.length === 1 ? 'y' : 'ies'}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Single pricing knob: % increase from each bond's existing price */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <Percent className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-semibold" style={{ color: 'var(--text-faint)' }}>Increase</span>
            <input type="number" step="0.01" value={markup} onChange={e => setMarkup(e.target.value === '' ? 0 : parseFloat(e.target.value))}
              className="w-16 px-2 py-1 rounded-lg text-sm outline-none text-right" style={cellStyle} />
            <button onClick={() => applyMarkup(markup)} className="px-2.5 py-1 rounded-lg text-xs font-bold text-on-accent" style={{ background: 'var(--accent)' }}>Apply to all</button>
          </div>
          {flaggedCount > 0 && (
            <button onClick={() => setOnlyFlagged(v => !v)} className="px-3 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
              style={{ background: onlyFlagged ? 'var(--accent)' : 'var(--bg-surface)', color: onlyFlagged ? 'var(--text-on-accent)' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
              <Filter className="w-4 h-4" /> {onlyFlagged ? 'Show all' : 'Only flagged'}
            </button>
          )}
          <button disabled={includedCount === 0} onClick={save} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-accent disabled:opacity-40 flex items-center gap-2"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}>
            <CheckCircle2 className="w-4 h-4" /> Save {includedCount} Bond{includedCount === 1 ? '' : 's'}
          </button>
        </div>
      </div>

      {flaggedCount > 0 && (
        <div className="p-3 rounded-xl flex items-start gap-2 text-xs" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(245,158,11)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>Rows highlighted in amber had low extraction confidence. Please review and correct them before saving — they will be saved marked "needs review".</span>
        </div>
      )}
      {error && <p className="text-sm" style={{ color: 'rgb(239,68,68)' }}>{error}</p>}

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['', 'Company', 'ISIN', 'Coupon', 'Yield', 'Maturity', 'Rating', 'Sec. Type', 'Existing Price', 'Selling Price', 'Status'].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ r, i }) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: r.needsReview ? 'rgba(245,158,11,0.06)' : undefined, opacity: r.included ? 1 : 0.4 }}>
                  <td className="px-2 py-1.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={r.included} onChange={e => patchRow(i, { included: e.target.checked })} title="Include in import" />
                      {r.needsReview && <span title={r.issues.join('; ')}><AlertTriangle className="w-3.5 h-3.5" style={{ color: 'rgb(245,158,11)' }} /></span>}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 min-w-[200px]">
                    <input className={cellInput} style={cellStyle} value={r.data.company_name} onChange={e => patchData(i, { company_name: e.target.value })} />
                    <input className={`${cellInput} mt-1`} style={cellStyle} value={r.data.bond_name} onChange={e => patchData(i, { bond_name: e.target.value })} title="Bond name" />
                  </td>
                  <td className="px-2 py-1.5"><input className={`${cellInput} font-mono min-w-[120px]`} style={cellStyle} value={r.data.isin} onChange={e => patchData(i, { isin: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cellInput} w-20 text-right`} style={cellStyle} value={r.data.coupon ?? ''} onChange={e => patchData(i, { coupon: e.target.value === '' ? null : parseFloat(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><input type="number" step="0.01" className={`${cellInput} w-20 text-right`} style={cellStyle} value={r.data.yield_ytm ?? ''} onChange={e => patchData(i, { yield_ytm: e.target.value === '' ? null : parseFloat(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><input className={`${cellInput} min-w-[110px]`} style={cellStyle} value={r.data.maturity_text} onChange={e => patchData(i, { maturity_text: e.target.value })} title={r.data.maturity_date ?? 'no ISO date'} /></td>
                  <td className="px-2 py-1.5"><input className={`${cellInput} min-w-[120px]`} style={cellStyle} value={r.data.rating} onChange={e => patchData(i, { rating: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={`${cellInput} min-w-[130px]`} style={cellStyle} value={r.data.security_type} onChange={e => patchData(i, { security_type: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input type="number" step="0.01" placeholder="—" title="Existing price (Price Per 100) — the base to mark up from" className={`${cellInput} w-24 text-right`} style={cellStyle} value={r.data.purchase_price ?? ''} onChange={e => patchData(i, { purchase_price: e.target.value === '' ? null : parseFloat(e.target.value) })} /></td>
                  <td className="px-2 py-1.5"><input type="number" step="0.01" placeholder="—" className={`${cellInput} w-24 text-right`} style={cellStyle} value={r.selling_price ?? ''} onChange={e => patchRow(i, { selling_price: e.target.value === '' ? null : parseFloat(e.target.value) })} /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <select className={`${cellInput} cursor-pointer`} style={cellStyle} value={r.status} onChange={e => patchRow(i, { status: e.target.value as BondStatus })}>
                        {BOND_STATUSES.filter(s => s !== 'Archived').map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => patchRow(i, { included: false })} title="Drop row" className="p-1 rounded" style={{ color: 'var(--text-faint)' }}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {phase === 'saving' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'var(--bg-overlay)' }}>
          <div className="px-6 py-5 rounded-2xl flex items-center gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Saving bonds to database…</span>
          </div>
        </div>
      )}
    </div>
  );
}
