/**
 * dashboardModel
 * -----------------------------------------------------------------------------
 * Pure assembly of the Wealth Dashboard view model from a client snapshot.
 * Combines REAL aggregates (PortfolioService) with typed placeholders
 * (MockService). Extracted so both the hook layer and any future SSR/preview
 * can build the same model without React.
 */
import type { ClientWealthSnapshot } from './HoldingService';
import { PortfolioService } from './PortfolioService';
import { MockService } from './MockService';
import type { DashboardData } from '../types';

export function buildDashboardData(
  snapshot: ClientWealthSnapshot,
  clientId: string,
): DashboardData {
  const { holdings, transactions } = snapshot;
  const summary = PortfolioService.buildSummary(holdings);

  return {
    summary,
    mutualFunds: PortfolioService.buildMutualFundSummary(holdings),
    recentTransactions: PortfolioService.buildRecentTransactions(transactions),
    dailyChange: MockService.dailyChange(summary, clientId),
    xirr: MockService.xirr(summary, clientId),
    upcomingSips: MockService.upcomingSips(holdings, clientId),
    goals: MockService.goals(summary),
    marketUpdates: MockService.marketUpdates(),
    notices: MockService.notices(),
  };
}
