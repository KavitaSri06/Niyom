/**
 * MockService
 * -----------------------------------------------------------------------------
 * Typed, clearly-labelled placeholders for dashboard sections that have no
 * backend source yet (intraday NAV movement, XIRR, SIP mandates, goals, market
 * indices, notices). Every value carries `isMock: true` so the UI renders an
 * honest indicator — nothing is silently faked.
 *
 * When the real feed arrives (BSE NAV, goals table, SIP mandate table), swap the
 * matching method for a live source; the view models and UI stay unchanged.
 *
 * Values are derived deterministically from the real portfolio so the demo looks
 * plausible and stable across refreshes rather than random.
 */
import type { NWHolding } from '../../crm/types';
import type {
  DailyChange,
  GoalProgress,
  MarketUpdate,
  Notice,
  PortfolioSummary,
  UpcomingSip,
  XirrEstimate,
} from '../types';

/** Stable pseudo-random in [0,1) seeded by a string — no Math.random flicker. */
const seeded = (seed: string): number => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
};

const addDays = (base: Date, days: number): string => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export const MockService = {
  /** Intraday movement — a small deterministic swing on net worth. */
  dailyChange(summary: PortfolioSummary, clientId: string): DailyChange {
    const drift = (seeded(clientId + ':day') - 0.45) * 0.018; // ~ -0.8%..+1.0%
    const amount = summary.netWorth * drift;
    return {
      amount,
      percent: drift * 100,
      asOf: new Date().toISOString(),
      isMock: true,
    };
  },

  /** Portfolio XIRR estimate — anchored near the realised return. */
  xirr(summary: PortfolioSummary, clientId: string): XirrEstimate {
    const base = summary.gainPercent;
    const jitter = (seeded(clientId + ':xirr') - 0.5) * 4;
    return { percent: base + jitter, isMock: true };
  },

  /** Upcoming SIP debits — seeded from the client's actual MF holdings. */
  upcomingSips(holdings: NWHolding[], clientId: string): UpcomingSip[] {
    const mf = holdings.filter((h) => h.product_type === 'mutual_fund').slice(0, 3);
    const today = new Date();
    return mf.map((h, i) => {
      const amount = Math.max(
        1000,
        Math.round(((h.invested_amount || 60000) / 24 / 500)) * 500,
      );
      return {
        id: `sip-${h.id}`,
        fundName: h.product_name,
        amount,
        nextDate: addDays(today, 5 + i * 7 + Math.floor(seeded(clientId + h.id) * 6)),
        frequency: 'Monthly' as const,
        isMock: true,
      };
    });
  },

  /** Financial goals — placeholder until a goals module exists. */
  goals(summary: PortfolioSummary): GoalProgress[] {
    const nw = summary.netWorth;
    const defs: Array<Omit<GoalProgress, 'percent' | 'isMock'>> = [
      { id: 'goal-retire', name: 'Retirement', target: Math.max(nw * 4, 5000000), current: nw * 0.55, targetYear: 2045 },
      { id: 'goal-education', name: "Child's Education", target: Math.max(nw * 1.5, 2500000), current: nw * 0.3, targetYear: 2035 },
      { id: 'goal-home', name: 'Dream Home', target: Math.max(nw * 2, 8000000), current: nw * 0.18, targetYear: 2032 },
    ];
    return defs.map((g) => ({
      ...g,
      percent: g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0,
      isMock: true,
    }));
  },

  /** Market indices / NAV movers — static until a live feed lands. */
  marketUpdates(): MarketUpdate[] {
    return [
      { id: 'nifty', label: 'NIFTY 50', value: '24,312.45', changePercent: 0.62, isMock: true },
      { id: 'sensex', label: 'SENSEX', value: '79,986.12', changePercent: 0.58, isMock: true },
      { id: 'nifty-bank', label: 'NIFTY BANK', value: '51,240.30', changePercent: -0.21, isMock: true },
      { id: 'gold', label: 'Gold (10g)', value: '₹73,180', changePercent: 0.34, isMock: true },
    ];
  },

  /** NIYOM notices — placeholder until a notices table exists. */
  notices(): Notice[] {
    return [
      {
        id: 'notice-cas',
        title: 'Consolidated statement ready',
        body: 'Your latest CAS is available under Reports → Downloads.',
        date: new Date().toISOString(),
        tone: 'info',
        isMock: true,
      },
      {
        id: 'notice-kyc',
        title: 'Keep your KYC current',
        body: 'Review your KYC & FATCA details to ensure uninterrupted transactions.',
        date: new Date(Date.now() - 2 * 864e5).toISOString(),
        tone: 'warning',
        isMock: true,
      },
    ];
  },
};
