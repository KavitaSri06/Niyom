/**
 * PortfolioService
 * -----------------------------------------------------------------------------
 * Pure, product-agnostic aggregation. Given raw holdings/transactions it derives
 * the REAL view models the dashboard renders. No I/O, no React — trivially
 * unit-testable, and every aggregate spans ALL products so Bonds / FD / Insurance
 * require zero changes here when they go live.
 */
import type { NWHolding, NWTransaction, ProductType } from '../../crm/types';
import { PRODUCT_LABELS, PRODUCT_CHART_COLORS } from '../../crm/utils';
import type {
  AllocationSlice,
  MutualFundLine,
  MutualFundSummary,
  PortfolioSummary,
  RecentTransaction,
} from '../types';

const holdingValue = (h: NWHolding): number => h.current_value || 0;
const holdingInvested = (h: NWHolding): number => h.invested_amount || 0;

const pct = (part: number, whole: number): number =>
  whole > 0 ? (part / whole) * 100 : 0;

export const PortfolioService = {
  /** Top-line wealth summary + six-way allocation, across every product. */
  buildSummary(holdings: NWHolding[]): PortfolioSummary {
    const netWorth = holdings.reduce((s, h) => s + holdingValue(h), 0);
    const invested = holdings.reduce((s, h) => s + holdingInvested(h), 0);
    const gain = netWorth - invested;

    const productTypes = [...new Set(holdings.map((h) => h.product_type))];
    const allocation: AllocationSlice[] = productTypes
      .map((pt) => {
        const rows = holdings.filter((h) => h.product_type === pt);
        const value = rows.reduce((s, h) => s + holdingValue(h), 0);
        return {
          productType: pt,
          label: PRODUCT_LABELS[pt] ?? pt,
          color: PRODUCT_CHART_COLORS[pt] ?? '#94a0b3',
          value,
          percent: pct(value, netWorth),
          holdings: rows.length,
        };
      })
      .filter((slice) => slice.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
      netWorth,
      invested,
      gain,
      gainPercent: pct(gain, invested),
      holdingsCount: holdings.length,
      productCount: allocation.length,
      allocation,
    };
  },

  /** Mutual-fund-only rollup with the top holdings by current value. */
  buildMutualFundSummary(holdings: NWHolding[]): MutualFundSummary {
    const mf = holdings.filter((h) => h.product_type === 'mutual_fund');
    const value = mf.reduce((s, h) => s + holdingValue(h), 0);
    const invested = mf.reduce((s, h) => s + holdingInvested(h), 0);
    const gain = value - invested;

    const topFunds: MutualFundLine[] = mf
      .slice(0, 3)
      .map((h) => {
        const v = holdingValue(h);
        const inv = holdingInvested(h);
        return {
          name: h.product_name,
          fundHouse: h.fund_house,
          folioNumber: h.folio_number,
          value: v,
          invested: inv,
          gain: v - inv,
          gainPercent: pct(v - inv, inv),
        };
      });

    const folios = new Set(mf.map((h) => h.folio_number).filter(Boolean));

    return {
      value,
      invested,
      gain,
      gainPercent: pct(gain, invested),
      folioCount: folios.size,
      topFunds,
    };
  },

  /** Map recent transactions into lightweight dashboard rows. */
  buildRecentTransactions(txns: NWTransaction[], limit = 5): RecentTransaction[] {
    return txns.slice(0, limit).map((t) => ({
      id: t.id,
      productType: t.product_type as ProductType,
      productName: t.product_name,
      txnType: t.txn_type,
      amount: t.consolidated_amount || 0,
      date: t.txn_date,
    }));
  },
};
