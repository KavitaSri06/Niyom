import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { NWEmployee, NWClient } from './types';
import {
  Folder, FolderOpen, Upload, Download, Trash2, Eye, Search,
  FileText, FileImage, File, X, CheckCircle2, AlertCircle,
  ChevronRight, ChevronDown, RefreshCw, ArrowLeft, Plus, Pencil,
} from 'lucide-react';

interface Props {
  employee: NWEmployee;
  initialClientId?: string;
  onBack?: () => void;
}

export const DOC_FOLDERS = [
  { key: 'PAN',              label: 'PAN Card',           color: '#F59E0B' },
  { key: 'CML',              label: 'CML',                color: '#3B82F6' },
  { key: 'BANK',             label: 'Bank Documents',     color: '#10B981' },
  { key: 'DEAL_CONFIRMATION',label: 'Deal Confirmation',  color: '#8B5CF6' },
  { key: 'MANDATE',          label: 'Mandate',            color: '#EF4444' },
  { key: 'DSA_DOCUMENTS',    label: 'DSA Documents',      color: '#D4AF37' },
  { key: 'OTHER_DOCUMENTS',  label: 'Other Documents',    color: '#6B7280' },
] as const;

export type DocFolderKey = typeof DOC_FOLDERS[number]['key'];

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
}

const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.docx', '.xlsx'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function fmtSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return FileImage;
  if (mime === 'application/pdf') return FileText;
  return File;
}

export function buildFileName(originalName: string): string {
  const ext = originalName.substring(originalName.lastIndexOf('.'));
  const now = new Date();
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}${now.getHours() < 12 ? 'AM' : 'PM'}`;
  const base = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  return `${base}_${ts}${ext}`;
}

export function validateFile(file: File): string | null {
  if (file.size > MAX_SIZE) return `${file.name}: exceeds 10MB limit (${fmtSize(file.size)})`;
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) return `${file.name}: unsupported format. Allowed: PDF, JPG, PNG, DOCX, XLSX`;
  return null;
}

interface UploadItem {
  file: File;
  name: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

export default function Documents({ employee, initialClientId, onBack }: Props) {
  const isAdmin = employee.role === 'admin' || employee.role === 'super_admin';
  const [clients, setClients] = useState<NWClient[]>([]);
  const [empList, setEmpList] = useState<{ id: string; full_name: string; employee_code: string }[]>([]);
  const [empFilter, setEmpFilter] = useState('all');
  const [selectedClientId, setSelectedClientId] = useState(initialClientId || '');
  const [selectedFolder, setSelectedFolder] = useState<DocFolderKey | null>(null);
  const [documents, setDocuments] = useState<NWDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Upload state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFolder, setUploadFolder] = useState<DocFolderKey>('OTHER_DOCUMENTS');
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview/download
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<NWDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<NWDocument | null>(null);
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

  // Load clients and employee list
  useEffect(() => {
    let q = supabase.from('nw_clients').select('id, full_name, client_code, employee_id').order('full_name');
    if (!isAdmin) q = q.eq('employee_id', employee.id);
    q.then(({ data }) => setClients((data as NWClient[]) || []));
    if (isAdmin) {
      supabase.from('nw_employees').select('id, full_name, employee_code').eq('status', 'active').order('full_name')
        .then(({ data }) => setEmpList((data as any[]) || []));
    }
  }, [isAdmin, employee.id]);

  // Load documents
  const loadDocuments = useCallback(async () => {
    if (!selectedClientId) { setDocuments([]); return; }
    setLoading(true);
    let q = supabase.from('nw_documents')
      .select('*, client:nw_clients(full_name, client_code)')
      .eq('client_id', selectedClientId)
      .order('uploaded_at', { ascending: false });
    if (selectedFolder) q = q.eq('document_type', selectedFolder);
    const { data } = await q;
    setDocuments((data as NWDocument[]) || []);
    setLoading(false);
  }, [selectedClientId, selectedFolder]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  // Folder stats
  const folderCounts = DOC_FOLDERS.map(f => ({
    ...f,
    count: documents.filter(d => d.document_type === f.key).length,
    size: documents.filter(d => d.document_type === f.key).reduce((s, d) => s + (d.file_size || 0), 0),
  }));

  const visibleDocs = documents.filter(d => {
    const matchFolder = !selectedFolder || d.document_type === selectedFolder;
    const matchSearch = !search || d.file_name.toLowerCase().includes(search.toLowerCase()) || d.uploaded_by_name.toLowerCase().includes(search.toLowerCase());
    return matchFolder && matchSearch;
  });

  // File add handler
  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const items: UploadItem[] = arr.map(f => {
      const err = validateFile(f);
      return { file: f, name: buildFileName(f.name), progress: 0, status: err ? 'error' : 'pending', error: err || undefined };
    });
    setUploadItems(prev => [...prev, ...items]);
  };

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

  const handleUpload = async () => {
    if (!selectedClientId || uploadItems.filter(i => i.status === 'pending').length === 0) return;
    if (!selectedClient) return;
    setUploading(true);

    for (let i = 0; i < uploadItems.length; i++) {
      const item = uploadItems[i];
      if (item.status !== 'pending') continue;

      setUploadItems(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'uploading', progress: 10 } : x));

      const path = `clients/${selectedClient.client_code}/${uploadFolder}/${item.name}`;
      const { error: upErr } = await supabase.storage.from('crm-documents').upload(path, item.file, { upsert: true });

      if (upErr) {
        setUploadItems(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'error', error: upErr.message, progress: 0 } : x));
        continue;
      }

      setUploadItems(prev => prev.map((x, idx) => idx === i ? { ...x, progress: 80 } : x));

      const { error: dbErr } = await supabase.from('nw_documents').insert([{
        client_id: selectedClientId,
        employee_id: employee.id,
        document_type: uploadFolder,
        file_name: item.name,
        file_path: path,
        file_size: item.file.size,
        mime_type: item.file.type,
        uploaded_by_name: employee.full_name,
      }]);

      if (dbErr) {
        setUploadItems(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'error', error: dbErr.message, progress: 0 } : x));
      } else {
        setUploadItems(prev => prev.map((x, idx) => idx === i ? { ...x, status: 'done', progress: 100 } : x));
      }
    }

    setUploading(false);
    const allDone = uploadItems.every(i => i.status !== 'pending');
    if (allDone) {
      setTimeout(() => {
        setShowUpload(false);
        setUploadItems([]);
        loadDocuments();
        showToast('success', 'Files uploaded successfully');
      }, 800);
    } else {
      loadDocuments();
    }
  };

  const getSignedUrl = async (doc: NWDocument, download = false): Promise<string | null> => {
    const { data, error } = await supabase.storage.from('crm-documents').createSignedUrl(doc.file_path, 120);
    if (error || !data?.signedUrl) { showToast('error', 'Could not generate access URL'); return null; }
    await logAction(download ? 'download' : 'view', doc);
    return data.signedUrl;
  };

  const handlePreview = async (doc: NWDocument) => {
    const url = await getSignedUrl(doc, false);
    if (url) { setPreviewUrl(url); setPreviewDoc(doc); }
  };

  const handleDownload = async (doc: NWDocument) => {
    const url = await getSignedUrl(doc, true);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url; a.download = doc.file_name; a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast('success', `Downloading ${doc.file_name}`);
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

  const folderInfo = DOC_FOLDERS.find(f => f.key === selectedFolder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        {onBack && (
          <button onClick={onBack} className="p-2 rounded-xl transition-colors" style={{ background: '#111', border: '1px solid #1E1E24' }}>
            <ArrowLeft className="w-4 h-4 text-white" />
          </button>
        )}
        <div className="flex-1">
          <p className="text-xs uppercase tracking-widest mb-0.5" style={{ color: '#D4AF37' }}>Document Manager</p>
          <h1 className="text-2xl font-bold text-white">
            {selectedClient ? selectedClient.full_name : 'Client Documents'}
          </h1>
          {selectedClient && <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>{selectedClient.client_code}</p>}
        </div>
        {selectedClientId && (
          <button onClick={() => { setShowUpload(true); setUploadItems([]); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-black"
            style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
            <Plus className="w-4 h-4" /> Upload
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-sm font-semibold transition-all`}
          style={{ background: toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`, color: toast.type === 'success' ? '#10B981' : '#ef4444' }}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Hidden input for in-place document replacement */}
      <input ref={replaceInputRef} type="file" className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceFile(f); e.target.value = ''; }} />

      {/* Client selector (if no initialClientId) */}
      {!initialClientId && (
        <div className="rounded-2xl p-5 flex flex-wrap gap-4 items-end" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B6B6B' }}>Employee</label>
              <div className="relative">
                <select value={empFilter} onChange={e => { setEmpFilter(e.target.value); setSelectedClientId(''); setSelectedFolder(null); }}
                  className="pl-3 pr-8 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                  style={{ background: '#050505', border: '1px solid rgba(212,175,55,0.4)' }}>
                  <option value="all">All Employees</option>
                  {empList.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: '#D4AF37' }} />
              </div>
            </div>
          )}
          <div className="flex-1 min-w-52">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#6B6B6B' }}>Select Client</label>
            <select value={selectedClientId} onChange={e => { setSelectedClientId(e.target.value); setSelectedFolder(null); }}
              className="w-full sm:max-w-sm px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
              style={{ background: '#050505', border: '1px solid #1E1E24' }}>
              <option value="">— Choose a client —</option>
              {clients
                .filter(c => empFilter === 'all' || c.employee_id === empFilter)
                .map(c => <option key={c.id} value={c.id}>{c.full_name} ({c.client_code})</option>)}
            </select>
          </div>
        </div>
      )}

      {selectedClientId && (
        <>
          {/* Folder Grid */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#6B6B6B' }}>
                {selectedFolder ? (
                  <button onClick={() => setSelectedFolder(null)} className="flex items-center gap-1.5" style={{ color: '#D4AF37' }}>
                    <ArrowLeft className="w-3 h-3" /> All Folders
                  </button>
                ) : 'Folders'}
              </p>
              {selectedFolder && (
                <p className="text-sm font-semibold" style={{ color: folderInfo?.color }}>
                  {folderInfo?.label}
                </p>
              )}
            </div>

            {!selectedFolder && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {folderCounts.map(f => (
                  <button key={f.key} onClick={() => setSelectedFolder(f.key)}
                    className="text-left p-4 rounded-2xl transition-all hover:scale-[1.02]"
                    style={{ background: '#0B0B0F', border: `1px solid ${f.count > 0 ? f.color + '30' : '#1E1E24'}` }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: f.color + '15' }}>
                        {f.count > 0 ? <FolderOpen className="w-4.5 h-4.5" style={{ color: f.color }} /> : <Folder className="w-4.5 h-4.5" style={{ color: f.color + '80' }} />}
                      </div>
                      {f.count > 0 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-lg font-bold" style={{ background: f.color + '15', color: f.color }}>{f.count}</span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-white leading-tight">{f.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#4A4A4A' }}>
                      {f.count > 0 ? `${f.count} file${f.count > 1 ? 's' : ''} · ${fmtSize(f.size)}` : 'Empty'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Document List */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid #1A1A1A' }}>
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#4A4A4A' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#050505', border: '1px solid #1E1E24' }} />
              </div>
              <button onClick={loadDocuments} className="p-2 rounded-xl" style={{ background: '#111', border: '1px solid #1E1E24' }}>
                <RefreshCw className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
              </div>
            ) : visibleDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Folder className="w-10 h-10" style={{ color: '#2A2A2A' }} />
                <p className="text-sm" style={{ color: '#4A4A4A' }}>
                  {selectedFolder ? `No files in ${folderInfo?.label}` : 'No documents uploaded yet'}
                </p>
                <button onClick={() => setShowUpload(true)}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ background: 'rgba(212,175,55,0.1)', color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)' }}>
                  Upload First Document
                </button>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: '#1A1A1A' }}>
                {visibleDocs.map(doc => {
                  const Icon = fileIcon(doc.mime_type);
                  const folder = DOC_FOLDERS.find(f => f.key === doc.document_type);
                  return (
                    <div key={doc.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: (folder?.color || '#6B7280') + '15' }}>
                        <Icon className="w-4 h-4" style={{ color: folder?.color || '#6B7280' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{doc.file_name}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: (folder?.color || '#6B7280') + '15', color: folder?.color || '#6B7280' }}>{folder?.label}</span>
                          <span className="text-xs" style={{ color: '#4A4A4A' }}>{fmtSize(doc.file_size)}</span>
                          <span className="text-xs" style={{ color: '#4A4A4A' }}>{fmtDate(doc.uploaded_at)}</span>
                          <span className="text-xs" style={{ color: '#4A4A4A' }}>by {doc.uploaded_by_name}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => handlePreview(doc)} title="Preview"
                          className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
                          <Eye className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                        </button>
                        <button onClick={() => handleDownload(doc)} title="Download"
                          className="p-1.5 rounded-lg transition-colors hover:bg-white/5">
                          <Download className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />
                        </button>
                        <button onClick={() => triggerReplace(doc)} title="Edit / Replace" disabled={replacingId === doc.id}
                          className="p-1.5 rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50">
                          {replacingId === doc.id
                            ? <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: '#D4AF37', borderTopColor: 'transparent' }} />
                            : <Pencil className="w-3.5 h-3.5" style={{ color: '#6B6B6B' }} />}
                        </button>
                        {isAdmin && (
                          <button onClick={() => setDeleteDoc(doc)} title="Delete"
                            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-lg rounded-3xl overflow-hidden" style={{ background: '#0B0B0F', border: '1px solid #1E1E24' }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid #1A1A1A' }}>
              <div>
                <p className="text-sm font-bold text-white">Upload Documents</p>
                <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>{selectedClient?.full_name} · {selectedClient?.client_code}</p>
              </div>
              <button onClick={() => { setShowUpload(false); setUploadItems([]); }}
                className="p-2 rounded-xl" style={{ background: '#111', border: '1px solid #1E1E24' }}>
                <X className="w-4 h-4" style={{ color: '#6B6B6B' }} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Folder select */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#6B6B6B' }}>Upload to Folder</label>
                <select value={uploadFolder} onChange={e => setUploadFolder(e.target.value as DocFolderKey)}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#050505', border: '1px solid #1E1E24' }}>
                  {DOC_FOLDERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
                onClick={() => fileInputRef.current?.click()}
                className="relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl cursor-pointer transition-all"
                style={{ border: `2px dashed ${dragOver ? '#D4AF37' : '#1E1E24'}`, background: dragOver ? 'rgba(212,175,55,0.04)' : '#050505' }}>
                <Upload className="w-8 h-8" style={{ color: dragOver ? '#D4AF37' : '#2A2A2A' }} />
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">Drag & drop files here</p>
                  <p className="text-xs mt-0.5" style={{ color: '#4A4A4A' }}>or click to browse · PDF, JPG, PNG, DOCX, XLSX · max 10MB each</p>
                </div>
                <input ref={fileInputRef} type="file" multiple className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
              </div>

              {/* Upload items */}
              {uploadItems.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {uploadItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: '#050505', border: `1px solid ${item.status === 'error' ? 'rgba(239,68,68,0.2)' : item.status === 'done' ? 'rgba(16,185,129,0.2)' : '#1A1A1A'}` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: item.status === 'error' ? 'rgba(239,68,68,0.1)' : item.status === 'done' ? 'rgba(16,185,129,0.1)' : 'rgba(212,175,55,0.08)' }}>
                        {item.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#10B981' }} />
                          : item.status === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                          : <FileText className="w-3.5 h-3.5" style={{ color: '#D4AF37' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-white truncate">{item.name}</p>
                        {item.status === 'error' && <p className="text-xs text-red-400 mt-0.5">{item.error}</p>}
                        {item.status === 'uploading' && (
                          <div className="w-full h-1 rounded-full mt-1.5" style={{ background: '#1A1A1A' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${item.progress}%`, background: '#D4AF37' }} />
                          </div>
                        )}
                      </div>
                      {item.status === 'pending' && (
                        <button onClick={() => setUploadItems(prev => prev.filter((_, idx) => idx !== i))}>
                          <X className="w-3.5 h-3.5" style={{ color: '#4A4A4A' }} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading || uploadItems.filter(i => i.status === 'pending').length === 0}
                className="w-full py-3 rounded-2xl text-sm font-bold text-black disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
                {uploading ? 'Uploading...' : `Upload ${uploadItems.filter(i => i.status === 'pending').length} File${uploadItems.filter(i => i.status === 'pending').length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewUrl && previewDoc && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.95)' }}>
          <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ background: '#0B0B0F', borderBottom: '1px solid #1A1A1A' }}>
            <div>
              <p className="text-sm font-bold text-white truncate max-w-md">{previewDoc.file_name}</p>
              <p className="text-xs mt-0.5" style={{ color: '#6B6B6B' }}>
                {fmtSize(previewDoc.file_size)} · Uploaded {fmtDate(previewDoc.uploaded_at)} by {previewDoc.uploaded_by_name}
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
            {previewDoc.mime_type.startsWith('image/') ? (
              <img src={previewUrl} alt={previewDoc.file_name} className="max-w-full max-h-full rounded-xl object-contain" />
            ) : previewDoc.mime_type === 'application/pdf' ? (
              <iframe src={previewUrl} className="w-full h-full rounded-xl" style={{ minHeight: '70vh' }} title={previewDoc.file_name} />
            ) : (
              <div className="text-center space-y-4">
                <File className="w-16 h-16 mx-auto" style={{ color: '#2A2A2A' }} />
                <p className="text-sm" style={{ color: '#6B6B6B' }}>Preview not available for this file type.</p>
                <button onClick={() => handleDownload(previewDoc)}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-black"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #B8961E)' }}>
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
              <p className="text-xs mt-1" style={{ color: '#6B6B6B' }}>This will permanently delete <strong className="text-white">{deleteDoc.file_name}</strong> from storage. This cannot be undone.</p>
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
