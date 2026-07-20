/**
 * BSEService — the single BSE StAR MF boundary
 * =============================================================================
 * NO other module in the portal talks to BSE. Components/hooks/other services
 * depend on this facade only, so the client experience stays 100% NIYOM-native
 * and the real BSE StAR MF wiring can drop in later behind these same methods.
 *
 * CURRENT STATE: fully mocked.
 *   - `getSchemes()` returns an illustrative dev scheme master.
 *   - `placeOrder()` SIMULATES a BSE order and returns an order reference.
 *     It moves NO real money and writes to NO ledger — it is a demo stub until
 *     the BSE order gateway is integrated.
 *
 * When going live, replace the bodies (fetch BSE scheme master, POST orders to
 * the BSE order API) — the public signatures and returned view models stay put.
 */
import type {
  FundScheme,
  OrderRequest,
  OrderResult,
  RedemptionRequest,
  SwitchRequest,
  TxnResult,
} from '../types/funds';
import { fmt } from '../../crm/utils';

const today = new Date();
const navDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  .toISOString()
  .slice(0, 10);

/**
 * Illustrative scheme master. Values are plausible but NOT live — do not treat
 * NAV/returns as real. `isMock` is stamped on every row.
 */
const SCHEME_MASTER: FundScheme[] = [
  {
    schemeCode: 'PPFCF-G', name: 'Parag Parikh Flexi Cap Fund', amc: 'PPFAS Mutual Fund',
    category: 'Equity', subCategory: 'Flexi Cap', riskLevel: 'Very High',
    nav: 78.42, navDate, returns: { '1M': 2.1, '6M': 12.4, '1Y': 24.6, '3Y': 19.2, '5Y': 22.8 },
    expenseRatio: 0.63, aum: 82140, minLumpsum: 1000, minSip: 1000, exitLoad: '2% if redeemed within 365 days',
    fundManager: 'Rajeev Thakkar', benchmark: 'NIFTY 500 TRI', rating: 5, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'MALMC-G', name: 'Mirae Asset Large & Midcap Fund', amc: 'Mirae Asset',
    category: 'Equity', subCategory: 'Large & Mid Cap', riskLevel: 'Very High',
    nav: 132.18, navDate, returns: { '1M': 1.4, '6M': 10.1, '1Y': 21.3, '3Y': 17.6, '5Y': 24.1 },
    expenseRatio: 0.59, aum: 38210, minLumpsum: 5000, minSip: 1000, exitLoad: '1% if redeemed within 365 days',
    fundManager: 'Neelesh Surana', benchmark: 'NIFTY LargeMidcap 250 TRI', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'HDBAF-G', name: 'HDFC Balanced Advantage Fund', amc: 'HDFC Mutual Fund',
    category: 'Hybrid', subCategory: 'Balanced Advantage', riskLevel: 'High',
    nav: 486.9, navDate, returns: { '1M': 0.9, '6M': 7.2, '1Y': 15.8, '3Y': 18.9, '5Y': 19.4 },
    expenseRatio: 0.74, aum: 92310, minLumpsum: 100, minSip: 100, exitLoad: '1% if redeemed within 365 days',
    fundManager: 'Anil Bamboli', benchmark: 'NIFTY 50 Hybrid 65:35', rating: 5, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'ICPCB-G', name: 'ICICI Prudential Corporate Bond Fund', amc: 'ICICI Prudential',
    category: 'Debt', subCategory: 'Corporate Bond', riskLevel: 'Moderate',
    nav: 28.61, navDate, returns: { '1M': 0.6, '6M': 4.1, '1Y': 8.2, '3Y': 7.1, '5Y': 7.4 },
    expenseRatio: 0.34, aum: 27650, minLumpsum: 5000, minSip: 100, exitLoad: 'Nil',
    fundManager: 'Manish Banthia', benchmark: 'NIFTY Corporate Bond Index', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'SBILC-G', name: 'SBI Bluechip Fund', amc: 'SBI Mutual Fund',
    category: 'Equity', subCategory: 'Large Cap', riskLevel: 'Very High',
    nav: 89.7, navDate, returns: { '1M': 1.1, '6M': 8.4, '1Y': 18.1, '3Y': 15.2, '5Y': 18.9 },
    expenseRatio: 0.8, aum: 47120, minLumpsum: 5000, minSip: 500, exitLoad: '1% if redeemed within 365 days',
    fundManager: 'Saurabh Pant', benchmark: 'S&P BSE 100 TRI', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'AXMDC-G', name: 'Axis Midcap Fund', amc: 'Axis Mutual Fund',
    category: 'Equity', subCategory: 'Mid Cap', riskLevel: 'Very High',
    nav: 108.33, navDate, returns: { '1M': 2.6, '6M': 13.9, '1Y': 27.4, '3Y': 20.1, '5Y': 25.6 },
    expenseRatio: 0.56, aum: 29840, minLumpsum: 5000, minSip: 500, exitLoad: '1% if redeemed within 365 days',
    fundManager: 'Shreyash Devalkar', benchmark: 'NIFTY Midcap 150 TRI', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'NIFES-G', name: 'Nippon India Small Cap Fund', amc: 'Nippon India',
    category: 'Equity', subCategory: 'Small Cap', riskLevel: 'Very High',
    nav: 168.05, navDate, returns: { '1M': 3.2, '6M': 16.7, '1Y': 32.1, '3Y': 26.8, '5Y': 31.2 },
    expenseRatio: 0.68, aum: 56230, minLumpsum: 5000, minSip: 100, exitLoad: '1% if redeemed within 30 days',
    fundManager: 'Samir Rachh', benchmark: 'NIFTY Smallcap 250 TRI', rating: 5, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'MTELS-G', name: 'Mirae Asset ELSS Tax Saver Fund', amc: 'Mirae Asset',
    category: 'Equity', subCategory: 'ELSS', riskLevel: 'Very High',
    nav: 45.28, navDate, returns: { '1M': 1.7, '6M': 9.8, '1Y': 20.4, '3Y': 16.9, '5Y': 23.3 },
    expenseRatio: 0.58, aum: 24110, minLumpsum: 500, minSip: 500, exitLoad: 'Nil (3-yr lock-in)',
    fundManager: 'Neelesh Surana', benchmark: 'NIFTY 500 TRI', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'UTINI-G', name: 'UTI Nifty 50 Index Fund', amc: 'UTI Mutual Fund',
    category: 'Equity', subCategory: 'Index', riskLevel: 'Very High',
    nav: 154.9, navDate, returns: { '1M': 1.0, '6M': 7.6, '1Y': 16.9, '3Y': 14.3, '5Y': 17.2 },
    expenseRatio: 0.2, aum: 18990, minLumpsum: 1000, minSip: 500, exitLoad: 'Nil',
    fundManager: 'Sharwan Goyal', benchmark: 'NIFTY 50 TRI', rating: 4, plans: ['Growth'], isMock: true,
  },
  {
    schemeCode: 'KOEQH-G', name: 'Kotak Equity Hybrid Fund', amc: 'Kotak Mahindra',
    category: 'Hybrid', subCategory: 'Aggressive Hybrid', riskLevel: 'High',
    nav: 62.14, navDate, returns: { '1M': 1.2, '6M': 8.1, '1Y': 17.5, '3Y': 16.1, '5Y': 18.3 },
    expenseRatio: 0.51, aum: 6120, minLumpsum: 5000, minSip: 1000, exitLoad: '1% if redeemed within 365 days',
    fundManager: 'Atul Bhole', benchmark: 'NIFTY 50 Hybrid 65:35', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'QNTAC-G', name: 'Quant Active Fund', amc: 'Quant Mutual Fund',
    category: 'Equity', subCategory: 'Multi Cap', riskLevel: 'Very High',
    nav: 712.4, navDate, returns: { '1M': 2.9, '6M': 15.2, '1Y': 29.7, '3Y': 22.4, '5Y': 29.9 },
    expenseRatio: 0.71, aum: 10240, minLumpsum: 5000, minSip: 1000, exitLoad: '1% if redeemed within 15 days',
    fundManager: 'Sandeep Tandon', benchmark: 'NIFTY 500 Multicap TRI', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'ABLIQ-G', name: 'Aditya Birla Sun Life Liquid Fund', amc: 'Aditya Birla Sun Life',
    category: 'Debt', subCategory: 'Liquid', riskLevel: 'Low',
    nav: 398.7, navDate, returns: { '1M': 0.6, '6M': 3.6, '1Y': 7.3, '3Y': 6.1, '5Y': 5.4 },
    expenseRatio: 0.21, aum: 43210, minLumpsum: 1000, minSip: 1000, exitLoad: 'Graded, nil after 7 days',
    fundManager: 'Kaustubh Gupta', benchmark: 'NIFTY Liquid Index', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'HDSTD-G', name: 'HDFC Short Term Debt Fund', amc: 'HDFC Mutual Fund',
    category: 'Debt', subCategory: 'Short Duration', riskLevel: 'Moderately Low',
    nav: 30.12, navDate, returns: { '1M': 0.5, '6M': 3.9, '1Y': 7.8, '3Y': 6.6, '5Y': 7.0 },
    expenseRatio: 0.36, aum: 14320, minLumpsum: 5000, minSip: 100, exitLoad: 'Nil',
    fundManager: 'Anil Bamboli', benchmark: 'NIFTY Short Duration Debt Index', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
  {
    schemeCode: 'CRFLX-G', name: 'Canara Robeco Flexi Cap Fund', amc: 'Canara Robeco',
    category: 'Equity', subCategory: 'Flexi Cap', riskLevel: 'Very High',
    nav: 342.6, navDate, returns: { '1M': 1.5, '6M': 9.1, '1Y': 19.2, '3Y': 15.8, '5Y': 20.6 },
    expenseRatio: 0.58, aum: 12870, minLumpsum: 5000, minSip: 1000, exitLoad: '1% if redeemed within 365 days',
    fundManager: 'Shridatta Bhandwaldar', benchmark: 'S&P BSE 500 TRI', rating: 4, plans: ['Growth', 'IDCW'], isMock: true,
  },
];

/** Simulate a short BSE round-trip so loading/placement states are exercised. */
const delay = <T>(value: T, ms = 350): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), ms));

/** Expected NAV allotment date: same day before 3pm cut-off, else next day. */
function expectedNavDate(): string {
  const d = new Date();
  if (d.getHours() >= 15) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const BSEService = {
  /** Full scheme master (mock). */
  async getSchemes(): Promise<FundScheme[]> {
    return delay(SCHEME_MASTER);
  },

  /** A single scheme by BSE code. */
  async getScheme(schemeCode: string): Promise<FundScheme | null> {
    return delay(SCHEME_MASTER.find((s) => s.schemeCode === schemeCode) ?? null);
  },

  /**
   * SIMULATED order placement. Returns a BSE-style order reference. Moves no
   * real money and persists nothing — swap for the live BSE order gateway later.
   */
  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const scheme = SCHEME_MASTER.find((s) => s.schemeCode === req.schemeCode);
    const ref = `NIYOM${Date.now().toString().slice(-8)}`;
    return delay(
      {
        orderId: ref,
        schemeCode: req.schemeCode,
        schemeName: scheme?.name ?? req.schemeCode,
        type: req.type,
        amount: req.amount,
        status: 'confirmed' as const,
        placedAt: new Date().toISOString(),
        expectedNavDate: expectedNavDate(),
        isMock: true,
      },
      700,
    );
  },

  /** SIMULATED redemption. Returns a confirmation ref; moves no real money. */
  async placeRedemption(req: RedemptionRequest): Promise<TxnResult> {
    const detail =
      req.mode === 'all'
        ? `Full redemption · ${req.units.toFixed(3)} units`
        : `${fmt(req.amount)} redeemed`;
    return delay(
      {
        orderId: `NIYOM${Date.now().toString().slice(-8)}`,
        kind: 'redeem' as const,
        schemeName: req.schemeName,
        detail,
        amount: req.amount,
        status: 'confirmed' as const,
        placedAt: new Date().toISOString(),
        expectedNavDate: expectedNavDate(),
        isMock: true,
      },
      700,
    );
  },

  /** SIMULATED switch. Returns a confirmation ref; moves no real money. */
  async placeSwitch(req: SwitchRequest): Promise<TxnResult> {
    return delay(
      {
        orderId: `NIYOM${Date.now().toString().slice(-8)}`,
        kind: 'switch' as const,
        schemeName: req.fromSchemeName,
        detail: `Switched ${fmt(req.amount)} to ${req.toSchemeName}`,
        amount: req.amount,
        status: 'confirmed' as const,
        placedAt: new Date().toISOString(),
        expectedNavDate: expectedNavDate(),
        isMock: true,
      },
      700,
    );
  },
};
