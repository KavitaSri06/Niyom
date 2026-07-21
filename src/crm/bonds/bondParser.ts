// Bond Creation module — modular document parser.
//
// `parseBondFile(file)` dispatches by extension. Excel is fully implemented
// (SheetJS is dynamically imported so the heavy parser stays out of the main
// bundle). PDF / Word return `{ supported:false }` with a message — they are the
// pluggable seam: drop in an OCR/table-extraction engine (or a Supabase edge
// function) behind `parsePdf` / `parseWord` later WITHOUT touching the UI or DB.
//
// The Excel implementation targets the SMC-style bond-offer layout: preamble
// rows, one or more "Category : X" blocks, each with a header row
// (Coupon Rate / ISIN / Name of Security / CATEGORY / Rating & Agency / Maturity
// Date / IP Dates / Put-Call / Price Per 100 / YTM / YTC-YTP / Face Value /
// Quantum) followed by data rows. It is defensive: columns are mapped from the
// detected header, coupons/yields are normalized to percent, Excel-serial and
// text dates both resolve, and rows with a missing/invalid ISIN, name, or coupon
// are flagged `needsReview` (never silently saved).

import {
  BondParseResult, ParsedBond, ParsedBondData,
} from './bondTypes';
import {
  normalizeRateToPercent, excelSerialToISO, parseLeadingDateToISO,
  parseIndianAmount, formatDate, inferFrequency,
} from './bondUtils';

type Row = (string | number)[];

const RATING_AGENCIES = ['CRISIL', 'ICRA', 'CARE', 'IND', 'ACUITE', 'ACQUITE', 'IVR', 'BWR', 'INFOMERICS', 'INFOMERICES', 'BRICKWORK'];

export async function parseBondFile(file: File): Promise<BondParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return parseExcel(file);
  }
  if (name.endsWith('.pdf')) {
    return {
      supported: false, format: 'pdf', bonds: [], categories: [],
      message: 'PDF extraction is not yet enabled. The parser is modular — an OCR / table-extraction engine can be plugged in without any UI or database change. For now, please upload the Excel version of this bond sheet.',
    };
  }
  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    return {
      supported: false, format: 'word', bonds: [], categories: [],
      message: 'Word extraction is not yet enabled. The parser is modular — a document-parsing engine can be plugged in later. For now, please upload the Excel version of this bond sheet.',
    };
  }
  return {
    supported: false, format: 'unknown', bonds: [], categories: [],
    message: 'Unsupported file type. Please upload an Excel (.xlsx), PDF, or Word document.',
  };
}

async function parseExcel(file: File): Promise<BondParseResult> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  // Prefer a sheet that actually contains bond rows (has an ISIN header).
  let bestRows: Row[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as Row[];
    if (rows.some(r => rowHasHeader(r)) && rows.length > bestRows.length) bestRows = rows;
  }
  if (bestRows.length === 0) {
    // Fall back to the first non-empty sheet.
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws || !ws['!ref']) continue;
      bestRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false }) as Row[];
      if (bestRows.length) break;
    }
  }

  return extractBonds(bestRows);
}

function norm(v: unknown): string {
  return String(v ?? '').replace(/\s+/g, ' ').trim();
}

function rowHasHeader(row: Row): boolean {
  const joined = row.map(c => String(c).toLowerCase()).join('|');
  return joined.includes('isin') && (joined.includes('coupon') || joined.includes('name of security'));
}

// Build a column-index map from a detected header row so extraction is robust to
// column shifts between sheets.
function mapHeader(row: Row): Record<string, number> {
  const map: Record<string, number> = {};
  row.forEach((cell, i) => {
    const h = String(cell).toLowerCase();
    if (!h.trim()) return;
    if (h.includes('coupon')) map.coupon = i;
    else if (h.includes('isin')) map.isin = i;
    else if (h.includes('name of security') || h === 'name') map.name = i;
    else if (h.includes('category')) map.secType = i;
    else if (h.includes('rating')) map.rating = i;
    else if (h.includes('maturity')) map.maturity = i;
    else if (h.includes('ip date') || h.includes('interest payment')) map.ipDates = i;
    else if (h.includes('put') || h.includes('call')) map.putCall = i;
    else if (h.includes('price')) map.price = i;
    else if (h.includes('ytm')) map.ytm = i;
    else if (h.includes('ytc') || h.includes('ytp')) map.ytcYtp = i;
    else if (h.includes('face')) map.faceValue = i;
    else if (h.includes('quantum') || h.includes('quantity')) map.quantum = i;
  });
  return map;
}

function isCategoryRow(row: Row): boolean {
  const first = norm(row[0]).toLowerCase();
  return first.startsWith('category') && first.includes(':');
}

function looksLikeISIN(v: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9A-Z]$/i.test(v.trim());
}

function num(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// A maturity cell is either an Excel serial (number) or a string beginning with
// a date and possibly a redemption annotation. Return [isoDate|null, displayText].
function resolveMaturity(cell: string | number): [string | null, string] {
  if (typeof cell === 'number') {
    const iso = excelSerialToISO(cell);
    return [iso, iso ? formatDate(iso) : ''];
  }
  const text = norm(cell);
  if (!text || text.toUpperCase() === 'NA') return [null, text];
  return [parseLeadingDateToISO(text), text];
}

function splitRating(raw: string): { rating: string; agency: string } {
  const text = norm(raw);
  if (!text) return { rating: '', agency: '' };
  const found = RATING_AGENCIES.filter(a => text.toUpperCase().includes(a));
  return { rating: text, agency: found.join(', ') };
}

// Derive the issuer/company from the security name by stripping a leading coupon
// ("8.70%"), a trailing year, and any "/ (...)" note.
function deriveIssuer(name: string): string {
  return norm(
    name
      .replace(/^\s*\d+(?:\.\d+)?\s*%/, '')      // leading coupon %
      .replace(/\s*\/?\s*\([^)]*\)\s*$/, '')     // trailing (note)
      .replace(/\b(19|20)\d{2}\b\s*$/, '')       // trailing year
      .replace(/\s+/g, ' '),
  );
}

function parseQuantum(raw: string): { multiples: string; minimum: string; available: string } {
  const text = norm(raw);
  const multiples = /multiple of ([^/()]+)/i.exec(text)?.[1]?.trim() ?? '';
  const minimum = /(?:minimum of|min of|upto)\s+([^/()]+)/i.exec(text)?.[1]?.trim() ?? '';
  return { multiples, minimum, available: text };
}

function extractBonds(rows: Row[]): BondParseResult {
  const bonds: ParsedBond[] = [];
  const categories = new Set<string>();
  let currentCategory = '';
  let map: Record<string, number> | null = null;
  let sawData = false;

  rows.forEach((row, idx) => {
    if (isCategoryRow(row)) {
      currentCategory = norm(row[0]).replace(/^category\s*:?\s*/i, '').trim();
      if (currentCategory) categories.add(currentCategory);
      map = null; // a fresh header is expected for the new block
      return;
    }
    if (rowHasHeader(row)) { map = mapHeader(row); return; }
    if (!map) return; // preamble / not inside a table yet

    const get = (k: string): string | number => {
      const i = map![k];
      return i === undefined ? '' : row[i];
    };

    const isinRaw = norm(get('isin'));
    const nameRaw = norm(get('name'));
    const couponRaw = get('coupon');
    const couponPct = normalizeRateToPercent(couponRaw as number);

    // Decide whether this row is a bond at all. Require at least a name plus one
    // of ISIN / coupon, otherwise it's a spacer/note row — skip it.
    const hasName = nameRaw.length > 2;
    const hasIsin = looksLikeISIN(isinRaw);
    if (!hasName && !hasIsin) return;
    if (!hasName && !couponPct) return;

    sawData = true;

    const [maturityISO, maturityText] = resolveMaturity(get('maturity'));
    const { rating, agency } = splitRating(norm(get('rating')));
    const ytm = normalizeRateToPercent(get('ytm') as number);
    // YTC/YTP occasionally lands in the blank column just after its header cell.
    let ytc = normalizeRateToPercent(get('ytcYtp') as number);
    if (ytc === null && map.ytcYtp !== undefined) {
      ytc = normalizeRateToPercent(row[map.ytcYtp + 1] as number);
    }
    const faceText = norm(get('faceValue'));
    const quantum = parseQuantum(norm(get('quantum')));
    const putCall = norm(get('putCall'));
    const ipDates = norm(get('ipDates'));

    const data: ParsedBondData = {
      company_name: deriveIssuer(nameRaw),
      isin: isinRaw,
      bond_name: nameRaw,
      issuer: deriveIssuer(nameRaw),
      security_type: norm(get('secType')),
      security_category: currentCategory,
      face_value: parseIndianAmount(faceText),
      face_value_text: faceText,
      available_quantity: quantum.available,
      minimum_investment: quantum.minimum,
      multiples: quantum.multiples,
      purchase_price: num(get('price')),
      coupon: couponPct,
      coupon_text: couponPct !== null ? `${couponPct.toFixed(2)}%` : norm(couponRaw),
      yield_ytm: ytm,
      ytc_ytp: ytc,
      maturity_date: maturityISO,
      maturity_text: maturityText,
      tenure: '',
      rating,
      rating_agency: agency,
      interest_frequency: inferFrequency('', ipDates),
      interest_payment_dates: ipDates,
      put_option: /put/i.test(putCall) ? putCall : '',
      call_option: /call/i.test(putCall) ? putCall : (putCall && putCall.toUpperCase() !== 'NA' ? putCall : ''),
      tax_status: '',
      remarks: '',
      extracted_json: rawRowObject(map, row),
    };

    // Confidence scoring.
    const issues: string[] = [];
    let confidence = 100;
    if (!hasIsin) { confidence -= 40; issues.push('ISIN missing or invalid'); }
    if (couponPct === null) { confidence -= 20; issues.push('Coupon could not be read'); }
    if (!maturityISO && !maturityText) { confidence -= 15; issues.push('Maturity date could not be read'); }
    if (ytm === null) { confidence -= 10; issues.push('Yield (YTM) could not be read'); }
    if (data.purchase_price === null) { confidence -= 5; issues.push('Price could not be read'); }
    confidence = Math.max(0, confidence);

    bonds.push({
      rowNumber: idx + 1,
      data,
      confidence,
      needsReview: confidence < 70,
      issues,
    });
  });

  return {
    supported: true,
    format: 'excel',
    bonds,
    categories: [...categories],
    message: sawData ? undefined : 'No bond rows were detected in this file. Please check the sheet layout.',
  };
}

function rawRowObject(map: Record<string, number>, row: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(map).forEach(([k, i]) => { out[k] = row[i] ?? ''; });
  return out;
}
