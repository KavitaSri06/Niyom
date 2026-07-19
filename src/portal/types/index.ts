/**
 * Portal view models
 * -----------------------------------------------------------------------------
 * The Wealth Portal never renders raw DB rows. Services map the CRM entities
 * (NWClient / NWHolding / NWTransaction) into these presentation-facing view
 * models, so the UI depends on a stable, product-agnostic shape.
 *
 * Anything sourced from a real table is marked REAL; anything stubbed until a
 * backend feed exists is marked MOCK and carries `isMock: true` so the UI can
 * render an honest indicator.
 */
import type { ProductType } from '../../crm/types';

/** A single row on the six-way asset-allocation ring. */
export interface AllocationSlice {
  productType: ProductType;
  label: string;
  /** Vivid, theme-constant hex (from PRODUCT_CHART_COLORS). */
  color: string;
  value: number;
  /** 0–100, share of net worth. */
  percent: number;
  holdings: number;
}

/** Top-line wealth aggregates — REAL, computed across every product. */
export interface PortfolioSummary {
  netWorth: number;
  invested: number;
  gain: number;
  gainPercent: number;
  holdingsCount: number;
  productCount: number;
  allocation: AllocationSlice[];
}

/** Mutual-fund-only rollup for the dashboard MF card — REAL. */
export interface MutualFundSummary {
  value: number;
  invested: number;
  gain: number;
  gainPercent: number;
  folioCount: number;
  topFunds: MutualFundLine[];
}

export interface MutualFundLine {
  name: string;
  fundHouse?: string;
  folioNumber?: string;
  value: number;
  invested: number;
  gain: number;
  gainPercent: number;
}

/** A recent transaction row for the dashboard — REAL when present. */
export interface RecentTransaction {
  id: string;
  productType: ProductType;
  productName: string;
  txnType: 'buy' | 'sell';
  amount: number;
  date: string;
}

/* ---------------------------------------------------------------------------
 * MOCK view models — replaced by real feeds (BSE NAV, goals, SIP mandates,
 * notices) in later phases. Every one carries isMock so the UI stays honest.
 * ------------------------------------------------------------------------- */

/** Intraday movement — MOCK until BSE NAV / index feed lands. */
export interface DailyChange {
  amount: number;
  percent: number;
  asOf: string;
  isMock: boolean;
}

/** Portfolio XIRR — MOCK until a cashflow-based engine lands. */
export interface XirrEstimate {
  percent: number;
  isMock: boolean;
}

export interface UpcomingSip {
  id: string;
  fundName: string;
  amount: number;
  nextDate: string;
  frequency: 'Monthly' | 'Quarterly' | 'Weekly';
  isMock: boolean;
}

export interface GoalProgress {
  id: string;
  name: string;
  target: number;
  current: number;
  /** 0–100 */
  percent: number;
  targetYear: number;
  isMock: boolean;
}

export interface MarketUpdate {
  id: string;
  label: string;
  value: string;
  changePercent: number;
  isMock: boolean;
}

export interface Notice {
  id: string;
  title: string;
  body: string;
  date: string;
  tone: 'info' | 'success' | 'warning';
  isMock: boolean;
}

/** Everything the Wealth Dashboard needs in one aggregate. */
export interface DashboardData {
  summary: PortfolioSummary;
  mutualFunds: MutualFundSummary;
  recentTransactions: RecentTransaction[];
  dailyChange: DailyChange;
  xirr: XirrEstimate;
  upcomingSips: UpcomingSip[];
  goals: GoalProgress[];
  marketUpdates: MarketUpdate[];
  notices: Notice[];
}
