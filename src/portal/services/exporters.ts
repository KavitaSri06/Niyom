/**
 * Report exporters
 * -----------------------------------------------------------------------------
 * Client-side .xlsx generation from data already in memory (no server, no BSE).
 * Uses the app's existing `xlsx` dependency via dynamic import so it never
 * weighs on the initial bundle. Amounts are written as raw numbers so the sheet
 * stays analysable in Excel.
 */
import type { NWClient } from '../../crm/types';
import { fmtDate } from '../../crm/utils';
import type { HoldingRow } from '../types';
import type { TransactionRow } from '../types/activity';

const stamp = () => new Date().toISOString().slice(0, 10);
const safeCode = (c: NWClient | null) => (c?.client_code || 'client').replace(/[^\w-]/g, '');

async function writeSheet(aoa: (string | number)[][], sheetName: string, fileName: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

export async function exportTransactionsXlsx(rows: TransactionRow[], client: NWClient | null) {
  const header = ['Date', 'Product', 'Scheme / Security', 'Type', 'Units', 'Price', 'Amount (INR)'];
  const body = rows.map((r) => [
    fmtDate(r.date),
    r.productLabel,
    r.name,
    r.txnType === 'buy' ? 'Buy' : 'Sell',
    r.units ?? '',
    r.price ?? '',
    r.amount,
  ]);
  await writeSheet(
    [header, ...body],
    'Transactions',
    `niyom_transactions_${safeCode(client)}_${stamp()}.xlsx`,
  );
}

export async function exportHoldingsXlsx(rows: HoldingRow[], client: NWClient | null) {
  const header = [
    'Product', 'Scheme / Security', 'Asset Class', 'Units', 'Invested (INR)',
    'Current Value (INR)', 'P&L (INR)', 'P&L %',
  ];
  const body = rows.map((r) => [
    r.productLabel,
    r.name,
    r.assetClass,
    r.units ?? '',
    r.invested,
    r.value,
    r.gain,
    Number(r.gainPercent.toFixed(2)),
  ]);
  await writeSheet(
    [header, ...body],
    'Holdings',
    `niyom_holdings_${safeCode(client)}_${stamp()}.xlsx`,
  );
}
