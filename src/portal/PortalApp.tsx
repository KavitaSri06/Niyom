import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PortalShell } from './layout/PortalShell';
import { VIEW_TITLES, type PortalView } from './layout/navigation';
import { usePortalRouter } from './routing/usePortalRouter';
import { useClientSnapshot } from './hooks/useClientSnapshot';
import { buildDashboardData } from './services/dashboardModel';
import { PortfolioService } from './services/PortfolioService';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { PortfolioPage } from './features/portfolio/PortfolioPage';
import { AllocationPage } from './features/allocation/AllocationPage';
import { PlaceholderPage } from './features/PlaceholderPage';
import { ChangePasswordModal } from './features/profile/ChangePasswordModal';

interface PortalAppProps {
  clientId: string;
  onLogout: () => void;
}

/** Phase → label for placeholder views, so the roadmap is transparent. */
const VIEW_PHASE: Partial<Record<PortalView, string>> = {
  'mutual-funds': 'Phase 3',
  transactions: 'Phase 4',
  sip: 'Phase 3',
  reports: 'Phase 4',
  documents: 'Phase 4',
  notifications: 'Phase 4',
  support: 'Phase 4',
  profile: 'Phase 4',
};

/**
 * Wealth Portal root. Fetches one client snapshot and derives every view's
 * model from it, so navigation between Dashboard / Portfolio / Allocation never
 * re-queries. Owns internal routing; leaves the host router in App.tsx untouched.
 */
export default function PortalApp({ clientId, onLogout }: PortalAppProps) {
  const { view, navigate } = usePortalRouter();
  const { snapshot, loading, error, refreshedAt, refresh } = useClientSnapshot(clientId);
  const [showChangePw, setShowChangePw] = useState(false);

  const client = snapshot.client;
  const hasData = !!refreshedAt; // first load completed

  const dashboardData = useMemo(
    () => (hasData ? buildDashboardData(snapshot, clientId) : null),
    [hasData, snapshot, clientId],
  );
  const portfolioData = useMemo(
    () => (hasData ? PortfolioService.buildPortfolioData(snapshot.holdings) : null),
    [hasData, snapshot.holdings],
  );

  const renderView = () => {
    if (loading && !hasData) return <LoadingState />;
    if (error) return <ErrorState message={error} onRetry={refresh} />;

    switch (view) {
      case 'dashboard':
        return dashboardData ? (
          <DashboardPage
            client={client}
            data={dashboardData}
            refreshedAt={refreshedAt}
            onNavigate={navigate}
          />
        ) : (
          <LoadingState />
        );
      case 'portfolio':
        return portfolioData ? <PortfolioPage data={portfolioData} /> : <LoadingState />;
      case 'allocation':
        return portfolioData ? <AllocationPage data={portfolioData} /> : <LoadingState />;
      default:
        return <PlaceholderPage title={VIEW_TITLES[view]} phase={VIEW_PHASE[view]} />;
    }
  };

  return (
    <>
      <PortalShell
        view={view}
        title={VIEW_TITLES[view]}
        client={client}
        refreshing={loading}
        onNavigate={navigate}
        onRefresh={refresh}
        onChangePassword={() => setShowChangePw(true)}
        onLogout={onLogout}
      >
        {renderView()}
      </PortalShell>

      {showChangePw && (
        <ChangePasswordModal clientId={clientId} onClose={() => setShowChangePw(false)} />
      )}
    </>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
        style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
      />
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" />
      <p className="text-sm text-text-primary">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-token-md border border-border bg-bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:text-accent"
      >
        Try again
      </button>
    </div>
  );
}
