/**
 * useDashboardData
 * -----------------------------------------------------------------------------
 * Orchestrates the service layer into a single dashboard aggregate. The UI reads
 * only `{ data, loading, error, refresh }` — it has no knowledge of Supabase,
 * aggregation, or which sections are mocked.
 */
import { useCallback, useEffect, useState } from 'react';
import { HoldingService } from '../services/HoldingService';
import { PortfolioService } from '../services/PortfolioService';
import { MockService } from '../services/MockService';
import type { NWClient } from '../../crm/types';
import type { DashboardData } from '../types';

interface DashboardState {
  client: NWClient | null;
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refreshedAt: Date | null;
}

export function useDashboardData(clientId: string) {
  const [state, setState] = useState<DashboardState>({
    client: null,
    data: null,
    loading: true,
    error: null,
    refreshedAt: null,
  });

  const load = useCallback(
    async (silent = false) => {
      setState((s) => ({ ...s, loading: !silent, error: null }));
      try {
        const { client, holdings, transactions } =
          await HoldingService.getSnapshot(clientId);

        const summary = PortfolioService.buildSummary(holdings);
        const data: DashboardData = {
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

        setState({ client, data, loading: false, error: null, refreshedAt: new Date() });
      } catch (err) {
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load your portfolio.',
        }));
      }
    },
    [clientId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { ...state, refresh };
}
