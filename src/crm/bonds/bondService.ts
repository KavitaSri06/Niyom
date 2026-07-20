// Bond Creation module — Supabase data access.
//
// Role-aware by design: admins read the full `nw_bonds` master; employees read
// the confidential-safe `nw_bonds_catalog` view (no landing_cost / purchase_price
// / margin internals). Selling price for employees is computed server-side via
// the nw_bond_selling_price RPC so landing_cost never reaches the browser.

import { supabase } from '../../lib/supabase';
import {
  NWBond, NWBondCatalog, NWBondVersion, MarginType, ParsedBondData,
} from './bondTypes';

const BOND_DOCS_BUCKET = 'bond-documents';

export interface ListResult<T> { data: T[]; error: string | null; }

// List bonds. Admins get the full master; employees get the safe catalog view.
// At this scale (hundreds of rows) we fetch and let the UI filter/sort/paginate.
export async function listBonds(isAdmin: boolean, includeArchived = false):
  Promise<ListResult<NWBond | NWBondCatalog>> {
  const source = isAdmin ? 'nw_bonds' : 'nw_bonds_catalog';
  let q = supabase.from(source).select('*').order('created_at', { ascending: false }).limit(5000);
  if (!includeArchived) q = q.eq('is_archived', false);
  const { data, error } = await q;
  return { data: (data as (NWBond | NWBondCatalog)[]) || [], error: error?.message || null };
}

export async function getBond(isAdmin: boolean, id: string): Promise<NWBond | NWBondCatalog | null> {
  const source = isAdmin ? 'nw_bonds' : 'nw_bonds_catalog';
  const { data } = await supabase.from(source).select('*').eq('id', id).maybeSingle();
  return (data as NWBond | NWBondCatalog) || null;
}

// Admin bulk insert of verified parsed rows. `landing_cost`, margin, and selling
// price are applied per row if the admin set them in the preview.
export interface BondInsertRow extends Partial<ParsedBondData> {
  landing_cost?: number | null;
  selling_price?: number | null;
  status?: string;
  source?: string;
  ocr_confidence?: number;
  needs_review?: boolean;
}

export async function insertBatch(rows: BondInsertRow[], documentId: string | null):
  Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase.rpc('nw_bond_insert_batch', {
    p_rows: rows, p_document_id: documentId,
  });
  return { count: (data as number) ?? 0, error: error?.message || null };
}

export async function updateBond(id: string, patch: Partial<NWBond>): Promise<string | null> {
  const { error } = await supabase.from('nw_bonds').update(patch).eq('id', id);
  return error?.message || null;
}

export async function setStatus(id: string, status: NWBond['status']): Promise<string | null> {
  const { error } = await supabase.from('nw_bonds').update({ status }).eq('id', id);
  return error?.message || null;
}

export async function archiveBond(id: string): Promise<string | null> {
  const { error } = await supabase.from('nw_bonds').update({ is_archived: true, status: 'Archived' }).eq('id', id);
  return error?.message || null;
}

export async function unarchiveBond(id: string): Promise<string | null> {
  const { error } = await supabase.from('nw_bonds').update({ is_archived: false, status: 'Available' }).eq('id', id);
  return error?.message || null;
}

export async function deleteBond(id: string): Promise<string | null> {
  const { error } = await supabase.from('nw_bonds').delete().eq('id', id);
  return error?.message || null;
}

export async function listVersions(bondId: string): Promise<NWBondVersion[]> {
  const { data } = await supabase
    .from('nw_bond_versions')
    .select('*, changed_by_employee:nw_employees!nw_bond_versions_changed_by_fkey(full_name)')
    .eq('bond_id', bondId)
    .order('version_no', { ascending: false });
  return (data as unknown as NWBondVersion[]) || [];
}

// Restore a prior version's editable fields (admin only). Confidential + provenance
// fields (codes, ids, audit timestamps) are never overwritten.
const NON_RESTORABLE = new Set([
  'id', 'bond_code', 'created_at', 'updated_at', 'created_by', 'document_id',
]);
export async function restoreVersion(bondId: string, snapshot: Record<string, unknown>): Promise<string | null> {
  const patch: Record<string, unknown> = {};
  Object.entries(snapshot).forEach(([k, v]) => { if (!NON_RESTORABLE.has(k)) patch[k] = v; });
  const { error } = await supabase.from('nw_bonds').update(patch).eq('id', bondId);
  return error?.message || null;
}

// Server-side selling price from the confidential landing cost (never exposed).
export async function computeSellingPriceServer(
  bondId: string, marginType: MarginType, marginValue: number | null,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('nw_bond_selling_price', {
    p_bond_id: bondId, p_margin_type: marginType, p_margin_value: marginValue,
  });
  if (error) return null;
  return data === null || data === undefined ? null : Number(data);
}

export async function logMarketingPdf(
  bondId: string, marginType: MarginType, marginValue: number | null, sellingPrice: number | null,
): Promise<void> {
  await supabase.rpc('nw_bond_log_marketing_pdf', {
    p_bond_id: bondId, p_margin_type: marginType, p_margin_value: marginValue, p_selling_price: sellingPrice,
  });
}

// Upload the original document to storage and create its metadata row. Best-effort
// storage upload — if the bucket write fails, still record the extracted JSON so
// the import can proceed (the file is a nice-to-have archive, not a hard block).
export async function uploadDocument(
  file: File, format: 'excel' | 'pdf' | 'word' | 'other',
  extracted: unknown, bondCount: number, employeeId: string | null,
): Promise<{ id: string | null; error: string | null }> {
  const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
  let storagePath = '';
  const up = await supabase.storage.from(BOND_DOCS_BUCKET).upload(path, file, { upsert: false });
  if (!up.error) storagePath = path;

  const { data, error } = await supabase
    .from('nw_bond_documents')
    .insert({
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type,
      file_size: file.size,
      doc_format: format,
      extracted_json: extracted,
      bond_count: bondCount,
      uploaded_by: employeeId,
    })
    .select('id')
    .single();
  return { id: (data?.id as string) || null, error: error?.message || null };
}
