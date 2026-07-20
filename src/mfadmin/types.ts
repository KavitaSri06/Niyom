/**
 * MF Admin Portal — view models
 * -----------------------------------------------------------------------------
 * The employee-facing operations console over BSE StAR MF. Staff never touch
 * BSE's own UI: everything routes through AdminService (real MF aggregates from
 * the CRM tables) + BSEService (order/scheme boundary, mocked).
 */

/** AUM split bucket (by AMC, category, etc.). */
export interface AumBucket {
  key: string;
  label: string;
  color: string;
  value: number;
  percent: number;
  count: number;
}

/** A cross-client MF order row for the operations feed. */
export interface AdminOrderRow {
  id: string;
  clientName: string;
  clientCode: string;
  scheme: string;
  type: 'buy' | 'sell';
  amount: number;
  date: string;
  /** Operational state — pending/confirmed are BSE-side (mocked for now). */
  status: 'confirmed' | 'pending' | 'rejected';
}

/** A client ranked by MF assets under management. */
export interface ClientAum {
  clientId: string;
  name: string;
  code: string;
  aum: number;
  invested: number;
  gainPercent: number;
  holdings: number;
}

/** Everything the admin dashboard needs in one aggregate. */
export interface AdminDashboardData {
  /* Real — computed from nw_holdings (mutual_fund) across all clients. */
  mfAum: number;
  mfInvested: number;
  mfGainPercent: number;
  activeClients: number;
  totalClients: number;
  amcSplit: AumBucket[];
  topClients: ClientAum[];
  recentOrders: AdminOrderRow[];

  /* Mock — BSE-side operational metrics until the gateway is wired. */
  liveSips: number;
  pendingOrders: number;
  todaysOrders: number;
  /** Estimated trail brokerage month-to-date. */
  trailMtd: number;
  isMockOps: boolean;
}
