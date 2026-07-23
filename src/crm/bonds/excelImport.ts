// Daily price-file importer — extracts ONLY { isin, bond_name, price } from the
// vendor Excel, by matching HEADER NAMES (not fixed positions) so it keeps working
// when the vendor changes the layout. SheetJS is dynamically imported (heavy).

import { ISIN_RE, ParsedImportRow } from './bondTypes';

// Header aliases → the field we keep. Matched case-insensitively as a substring
// after normalizing spaces/punctuation.
const HEADER_ALIASES: { field: 'isin' | 'name' | 'price'; patterns: string[] }[] = [
  { field: 'isin',  patterns: ['isin'] },
  { field: 'name',  patterns: ['name of security', 'security name', 'bond name', 'security description', 'scrip name', 'name'] },
  { field: 'price', patterns: ['price per 100', 'clean price', 'price per100', 'price/100', 'offer price', 'price'] },
];

function norm(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/[_\-/.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function numeric(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ₹]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Find the header row: the first row that contains an ISIN header AND at least a
// name or price header. Returns the row index + a column-index map.
function locateHeader(rows: unknown[][]): { headerIdx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i] || [];
    const cols: Record<string, number> = {};
    row.forEach((cell, c) => {
      const h = norm(cell);
      if (!h) return;
      for (const { field, patterns } of HEADER_ALIASES) {
        if (cols[field] !== undefined) continue;
        if (patterns.some(p => h === p || h.includes(p))) { cols[field] = c; break; }
      }
    });
    if (cols.isin !== undefined && (cols.name !== undefined || cols.price !== undefined)) {
      return { headerIdx: i, cols };
    }
  }
  return null;
}

export interface ExcelParseResult {
  rows: ParsedImportRow[];
  matchedHeaders: { isin: boolean; name: boolean; price: boolean };
  message?: string;
}

export async function parsePriceFile(file: File): Promise<ExcelParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  // Prefer the sheet whose header row we can locate.
  let best: { rows: unknown[][]; loc: NonNullable<ReturnType<typeof locateHeader>> } | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) continue;
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as unknown[][];
    const loc = locateHeader(grid);
    if (loc) { best = { rows: grid, loc }; break; }
  }
  if (!best) {
    return { rows: [], matchedHeaders: { isin: false, name: false, price: false },
      message: 'Could not find ISIN / Name / Price headers in this file. Check the sheet has those column headers.' };
  }

  const { cols } = best.loc;
  const out: ParsedImportRow[] = [];
  const seen = new Set<string>();
  for (let i = best.loc.headerIdx + 1; i < best.rows.length; i++) {
    const row = best.rows[i] || [];
    const isin = String(cols.isin !== undefined ? row[cols.isin] ?? '' : '').trim().toUpperCase();
    if (!isin) continue;
    const bond_name = String(cols.name !== undefined ? row[cols.name] ?? '' : '').trim();
    const price = cols.price !== undefined ? numeric(row[cols.price]) : null;
    const valid = ISIN_RE.test(isin) && !seen.has(isin);
    if (ISIN_RE.test(isin)) seen.add(isin);
    out.push({
      rowNumber: i + 1, isin, bond_name, price, valid,
      issue: !ISIN_RE.test(isin) ? 'Malformed ISIN' : (seen.has(isin) && !valid ? 'Duplicate ISIN in file' : undefined),
    });
  }

  return {
    rows: out,
    matchedHeaders: { isin: cols.isin !== undefined, name: cols.name !== undefined, price: cols.price !== undefined },
    message: out.length === 0 ? 'No data rows found under the detected headers.' : undefined,
  };
}
