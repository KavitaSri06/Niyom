import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWClient } from './types';
import { DOC_FOLDERS, DocFolderKey, buildFileName, validateFile } from './Documents';
import {
  Search, Download, Trash2, Eye, Filter, RefreshCw, Pencil,
  FileText, FileImage, File, X, CheckCircle2, AlertCircle,
  ChevronRight, FolderOpen, Users, Shield, Clock, BarChart3,
} from 'lucide-react';

interface Props { employee: NWEmployee; }

interface NWDocument {
  id: string;
  client_id: string;
  employee_id: string | null;
  document_type: DocFolderKey;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_name: string;
  uploaded_at: string;
  client?: { full_name: string; client_code: string };
  emp?: { full_name: string; employee_code: string };
}

interface DocLog {
  id: string;
  action_type: string;
  file_name: string;
  created_at: string;
  employee?: { full_name: string };
  client?: { full_name: string; client_code: string };
}

function fmtSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fileIcon(mime: string) {
  if (mime?.startsWith('image/')) return FileImage;
  if (mime === 'application/pdf') return FileText;
  return File;
}

const ACTION_COLOR: Record<string, string> = {
  upload: '#10B981', download: '#3B82F6', delete: '#EF4444', view: '#D4AF37',
};

export default function AdminDocuments({ employee }: Props) {
  const [documents, setDocuments] = useState<NWDocument[]>([]);
  const [logs, setLogs] = useState<DocLog[]>([]);
  const [clients, setClients] = useState<NWClient[]>([]);
  const [employees, setEmployees] = useState<NWEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'documents' | 'logs'>('documents');

  // Filters
  const [search, setSearch] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Preview / delete
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<NWDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<NWDocument | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Replace-in-place (Feature #5 V1): overwrite the existing storage object and
  // refresh the same nw_documents row. No versioning, no history.
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<NWDocument | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    supabase.from('nw_clients').select('id, full_name, client_code').order('full_name').then(({ data }) => setClients((data as NWClient[]) || []));
    supabase.from('nw_employees').select('id, full_name, employee_code').order('full_name').then(({ data }) => setEmployees((data as NWEmployee[]) || []));
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('nw_documents')
      .select('*, client:nw_clients(full_name, client_code), emp:nw_employees(full_name, employee_code)')
      .order('uploaded_at', { ascending: false });
    if (filterClient) q = q.eq('client_id', filterClient);
    if (filterEmployee) q = q.eq('employee_id', filterEmployee);
    if (filterType) q = q.eq('document_type', filterType);
    if (filterFrom) q = q.gte('uploaded_at', filterFrom);
    if (filterTo) q = q.lte('uploaded_at', filterTo + 'T23:59:59');
    const { data } = await q.limit(500);
    setDocuments((data as NWDocument[]) || []);
    setLoading(false);
  }, [filterClient, filterEmployee, filterType, filterFrom, filterTo]);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase.from('nw_document_logs')
      .select('*, employee:nw_employees(full_name), client:nw_clients(full_name, client_code)')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs((data as DocLog[]) || []);
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab, loadLogs]);

  const filtered = documents.filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return d.file_name.toLowerCase().includes(s)
      || (d.client as any)?.full_name?.toLowerCase().includes(s)
      || (d.client as any)?.client_code?.toLowerCase().includes(s)
      || d.uploaded_by_name.toLowerCase().includes(s);
  });

  const logAction = async (action: string, doc: NWDocument) => {
    await supabase.from('nw_document_logs').insert([{
      action_type: action,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      employee_id: employee.id,
      document_id: doc.id,
      client_id: doc.client_id,
      file_name: doc.file_name,
    }]);
  };

  const getSignedUrl = async (doc: NWDocument): Promise<string | null> => {
    const { data, error } = await supabase.storage.from('crm-documents').createSignedUrl(doc.file_path, 120);
    if (error || !data?.signedUrl) { showToast('error', 'Could not generate access URL'); return null; }
    return data.signedUrl;
  };

  const handlePreview = async (doc: NWDocument) => {
    const url = await getSignedUrl(doc);
    if (url) { setPreviewUrl(url); setPreviewDoc(doc); await logAction('view', doc); }
  };

  const handleDownload = async (doc: NWDocument) => {
    const url = await getSignedUrl(doc);
    if (!url) return;
    await logAction('download', doc);
    const a = document.createElement('a'); a.href = url; a.download = doc.file_name; a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('success', `Downloading ${doc.file_name}`);
  };

  const handleBulkDownload = async () => {
    const docs = filtered.filter(d => selected.has(d.id));
    for (const doc of docs) await handleDownload(doc);
    showToast('success', `Downloading ${docs.length} files`);
    setSelected(new Set());
  };

  const handleDelete = async () => {
    if (!deleteDoc) return;
    await supabase.storage.from('crm-documents').remove([deleteDoc.file_path]);
    await logAction('delete', deleteDoc);
    await supabase.from('nw_documents').delete().eq('id', deleteDoc.id);
    setDeleteDoc(null);
    loadDocuments();
    showToast('success', 'Document deleted');
  };

  // Open the file picker for a specific document.
  const triggerReplace = (doc: NWDocument) => {
    replaceTargetRef.current = doc;
    replaceInputRef.current?.click();
  };

  // Replace in place: overwrite the same storage object (same file_path) and
  // refresh the same nw_documents row so only the latest document remains.
  const handleReplaceFile = async (file: File) => {
    const doc = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!doc) return;

    const err = validateFile(file);
    if (err) { showToast('error', err); return; }

    setReplacingId(doc.id);

    // Overwrite the existing object at the same path (no new copy, no orphan).
    const { error: upErr } = await supabase.storage
      .from('crm-documents')
      .upload(doc.file_path, file, { upsert: true, contentType: file.type });

    if (upErr) { setReplacingId(null); showToast('error', upErr.message); return; }

    // Refresh display metadata on the same row; document_type/file_path unchanged.
    const { error: dbErr } = await supabase.from('nw_documents').update({
      file_name: buildFileName(file.name),
      file_size: file.size,
      mime_type: file.type,
      uploaded_by_name: employee.full_name,
      uploaded_at: new Date().toISOString(),
    }).eq('id', doc.id);

    setReplacingId(null);
    if (dbErr) { showToast('error', dbErr.message); return; }

    await loadDocuments();
    showToast('success', 'Document replaced successfully');
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  const toggleAll = () => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(d => d.id)));

  // Stats
  const totalDocs = documents.length;
  const totalSize = documents.reduce((s, d) => s + (d.file_size || 0), 0);
  const uniqueClients = new Set(documents.map(d => d.client_id)).size;
  const typeCounts = DOC_FOLDERS.map(f => ({ ...f, count: documents.filter(d => d.document_type === f.key).length }));

  const clearFilters = () => { setFilterClient(''); setFilterEmployee(''); setFilterType(''); setFilterFrom(''); setFilterTo(''); };
  const hasFilters = filterClient || filterEmployee || filterType || filterFrom || filterTo;

  const selStyle = { background: '#050505', border: '1px solid #1E1E24', color: '#fff', borderRadius: '12px', padding: '8px 14px', fontSize: '13px', outline: 'none', width: '100%' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs uppercase tracking-widest" style={{ color: '#D4AF37' }}>Admin Panel</p>
            <span className="text-xs px-2 py-0.5 rounded-lg font-bold" style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}>
              <Shield className="w-3 h-3 inline mr-1" />FULL ACCESS
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">Document Repository</h1>
          <p className="text-sm mt-0.5" style={{ color: '#6B6B6B' }}>System-wide document management &amp; audit trail</p>
        </div>
        <button onClick={() => { loadDocuments(); loadLogs(); }}
          className="p-2.5 rounded-xl flex-shrink-0" style={{ background: '#111', border: '1px solid #1E1E24' }}>
          <RefreshCw className="w-4 h-4" style={{ color: '#6B6B6B' }} />
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold"
          style={{ background: toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`, color: toast.type === 'success' ? '#10B981' : '#ef4444' }}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Hidden input for in-place document replacement */}
      <input ref={replaceInputRef} type="file" className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ''; }} />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Documents', value: totalDocs.toLocaleString(), icon: FileText, color: '#D4AF37' },
          { label: 'Storage Used', value: fmtSize(totalSize), icon: BarChart3, color: '#3B82F6' },
          { label: 'Clients with Docs', value: uniqueClients.toLocaleString(), icon: Users, color: '#10B981' },
          { label: 'Document Types', value: typeCounts.filter(t => t.count > 0).length + '/' + DOC_FOLDERS.length, icon: FolderOpen, color: '#F59E0B' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
              <p className="text-xs" style={{ color: '#6B6B6B' }}>{s.label}</p>
            </div>
            <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Type breakdown */}
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {typeCounts.map(f => (
          <button key={f.key} onClick={() => setFilterType(filterType === f.key ? '' : f.key)}
            className="p-3 rounded-xl text-center transition-all"
            style={{ background: filterType === f.key ? f.color + '15' : '#0B0B0F', border: `1px solid ${filterType === f.key ? f.color + '40' : '#1E1E24'}` }}>
            <p className="text-lg font-bold" style={{ color: filterType === f.key ? f.color : '#fff' }}>{f.count}</p>
            <p className="text-xs mt-0.5 leading-tight" style={{ color: filterType === f.key ? f.color : '#4A4A4A' }}>{f.label}</p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#0B0B0F', border: '1px solid #1E1E24', width: 'fit-content' }}>
        {(['documents', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all"
            style={{ background: tab === t ? '#1A1A1A' : 'transparent', color: tab === t ? '#D4AF37' : '#6B6B6B', border: tab === t ? '1px solid #2A2A2A' : '1px solid transparent' }}>
            {t === 'documents' ? 'All Documents' : 'Audit Log'}
          </button>
        ))}
      </div>

      {tab === 'documents' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          {/* Toolbar */}
          <div className="px-5 py-4 space-y-3" style={{ borderBottom: '1px solid #1A1A1A' }}>
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#4A4A4A' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by filename, client, or uploader..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#050505', border: '1px solid #1E1E24' }} />
              </div>
              <button onClick={() => setShowFilters(v => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: hasFilters ? 'rgba(212,175,55,0.1)' : '#111', color: hasFilters ? '#D4AF37' : '#6B6B6B', border: `1px solid ${hasFilters ? 'rgba(212,175,55,0.3)' : '#1E1E24'}` }}>
                <Filter className="w-3.5 h-3.5" /> Filters {hasFilters ? '•' : ''}
              </button>
              {selected.size > 0 && (
                <button onClick={handleBulkDownload}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
                  style={{ background: 'rgba(59,130,246,0.1)', color: '#3B82F6', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <Download className="w-3.5 h-3.5" /> Download {selected.size}
                </button>
              )}
            </div>

            {showFilters && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2" style={{ borderTop: '1px solid #1A1A1A' }}>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#4A4A4A' }}>Client</label>
                  <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={selStyle}>
                    <option value="">All Clients</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#4A4A4A' }}>Employee</label>
                  <select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} style={selStyle}>
                    <option value="">All Employees</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#4A4A4A' }}>Document Type</label>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selStyle}>
                    <option value="">All Types</option>
                    {DOC_FOLDERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#4A4A4A' }}>From</label>
                  <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={selStyle} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#4A4A4A' }}>To</label>
                  <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={selStyle} />
                </div>
                {hasFilters && (
                  <div className="flex items-end">
                    <button onClick={clearFilters} className="text-xs px-3 py-2 rounded-xl" style={{ color: '#6B6B6B', border: '1px solid #1E1E24', background: '#111' }}>
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Table header */}
          {!loading && filtered.length > 0 && (
            <div className="grid gap-0 px-5 py-2.5 text-xs font-bold uppercase tracking-wider" style={{ gridTemplateColumns: '32px 1fr 140px 110px 80px 90px 124px', color: '#4A4A4A', borderBottom: '1px solid #1A1A1A' }}>
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                onChange={toggleAll} className="rounded" style={{ accentColor: '#D4AF37' }} />
              <span>Document</span>
              <span>Client</span>
              <span>Type</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span>Actions</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <Search className="w-10 h-10" style={{ color: '#2A2A2A' }} />
              <p className="text-sm" style={{ color: '#4A4A4A' }}>No documents found</p>
              {hasFilters && <button onClick={clearFilters} className="text-xs" style={{ color: '#D4AF37' }}>Clear filters</button>}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#1A1A1A' }}>
              {filtered.map(doc => {
                const Icon = fileIcon(doc.mime_type);
                const folder = DOC_FOLDERS.find(f => f.key === doc.document_type);
                const isSelected = selected.has(doc.id);
                return (
                  <div key={doc.id}
                    className="grid items-center gap-0 px-5 py-3 hover:bg-white/[0.015] transition-colors"
                    style={{ gridTemplateColumns: '32px 1fr 140px 110px 80px 90px 124px' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(doc.id)}
                      className="rounded" style={{ accentColor: '#D4AF37' }} />
                    <div className="flex items-center gap-3 min-w-0 pr-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (folder?.color || '#6B7280') + '15' }}>
                        <Icon className="w-3.5 h-3.5" style={{ color: folder?.color || '#6B7280' }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{doc.file_name}</p>
                        <p className="text-xs truncate mt-0.5" style={{ color: '#4A4A4A' }}>by {doc.uploaded_by_name}</p>
                      </div>
                    </div>
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-medium text-white truncate">{(doc as any).client?.full_name || '—'}</p>
                      <p className="text-xs truncate" style={{ color: '#4A4A4A' }}>{(doc as any).client?.client_code}</p>
                    </div>
                    <span className="text-xs px-1.5 py-0.5 rounded font-medium inline-block" style={{ background: (folder?.color || '#6B7280') + '15', color: folder?.color || '#6B7280', width: 'fit-content' }}>
                      {folder?.label}
                    </span>
                    <span className="text-xs" style={{ color: '#6B6B6B' }}>{fmtSize(doc.file_size)}</span>
                    <div>
                      <p className="text-xs" style={{ color: '#6B6B6B' }}>{new Date(doc.uploaded_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                      <p className="text-xs" style={{ color: '#4A4A4A' }}>{new Date(doc.uploaded_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handlePreview(doc)} title="Preview" className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        <Eye className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                      </button>
                      <button onClick={() => handleDownload(doc)} title="Download" className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                        <Download className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                      </button>
                      <button onClick={() => triggerReplace(doc)} title="Edit / Replace" disabled={replacingId === doc.id}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50">
                        {replacingId === doc.id
                          ? <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
                          : <Pencil className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />}
                      </button>
                      <button onClick={() => setDeleteDoc(doc)} title="Delete" className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && filtered.length > 0 && (
            <div className="px-5 py-3 text-xs flex items-center justify-between" style={{ borderTop: '1px solid #1A1A1A', color: '#4A4A4A' }}>
              <span>{filtered.length} document{filtered.length !== 1 ? 's' : ''} · {fmtSize(filtered.reduce((s, d) => s + (d.file_size || 0), 0))}</span>
              {selected.size > 0 && <span style={{ color: '#D4AF37' }}>{selected.size} selected</span>}
            </div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: '1px solid #1A1A1A' }}>
            <Clock className="w-4 h-4" style={{ color: '#D4AF37' }} />
            <p className="text-sm font-bold text-white">Audit Log</p>
            <span className="text-xs px-2 py-0.5 rounded-lg ml-auto" style={{ background: 'rgba(212,175,55,0.08)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.15)' }}>
              Last 200 actions
            </span>
          </div>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2">
              <Clock className="w-8 h-8" style={{ color: '#2A2A2A' }} />
              <p className="text-sm" style={{ color: '#4A4A4A' }}>No activity logs yet</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#1A1A1A' }}>
              {logs.map(log => (
                <div key={log.id} className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.015]">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: (ACTION_COLOR[log.action_type] || '#6B7280') + '15' }}>
                    <span className="text-xs font-bold" style={{ color: ACTION_COLOR[log.action_type] || '#6B7280' }}>
                      {log.action_type.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold capitalize" style={{ color: ACTION_COLOR[log.action_type] || '#6B7280' }}>{log.action_type}</span>
                      <ChevronRight className="w-3 h-3" style={{ color: '#2A2A2A' }} />
                      <span className="text-xs text-white truncate">{log.file_name}</span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: '#4A4A4A' }}>
                      {(log as any).employee?.full_name || 'Unknown'} &middot; {(log as any).client?.full_name || '—'} ({(log as any).client?.client_code || '—'})
                    </p>
                  </div>
                  <p className="text-xs flex-shrink-0" style={{ color: '#4A4A4A' }}>{fmtDate(log.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && previewDoc && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.95)' }}>
          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: '#0B0B0F', borderBottom: '1px solid #1A1A1A' }}>
            <div>
              <p className="text-sm font-bold text-white truncate max-w-md">{previewDoc.file_name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>
                {(previewDoc as any).client?.full_name} · {fmtSize(previewDoc.file_size)} · {fmtDate(previewDoc.uploaded_at)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleDownload(previewDoc)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}>
                <Download className="w-3.5 h-3.5" /> Download
              </button>
              <button onClick={() => { setPreviewUrl(null); setPreviewDoc(null); }}
                className="p-2 rounded-xl" style={{ background: '#111', border: '1px solid #1E1E24' }}>
                <X className="w-4 h-4" style={{ color: '#6B6B6B' }} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {previewDoc.mime_type?.startsWith('image/') ? (
              <img src={previewUrl} alt={previewDoc.file_name} className="max-w-full max-h-full rounded-xl object-contain" />
            ) : previewDoc.mime_type === 'application/pdf' ? (
              <iframe src={previewUrl} className="w-full h-full rounded-xl" style={{ minHeight: '70vh' }} title={previewDoc.file_name} />
            ) : (
              <div className="text-center space-y-4">
                <File className="w-16 h-16 mx-auto" style={{ color: '#2A2A2A' }} />
                <p className="text-sm" style={{ color: '#6B6B6B' }}>Preview not available.</p>
                <button onClick={() => handleDownload(previewDoc)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-black" style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                  Download to View
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-3xl p-6 space-y-4" style={{ background: '#0B0B0F', border: '1px solid rgba(239,68,68,0.2)' }}>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <Trash2 className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Delete Document?</p>
              <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>This will permanently delete <strong className="text-white">{deleteDoc.file_name}</strong> from Supabase storage. Cannot be undone.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteDoc(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#111', color: '#8A8A8A', border: '1px solid #1E1E24' }}>Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: '#DC2626' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
