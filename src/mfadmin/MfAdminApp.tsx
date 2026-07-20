/**
 * MfAdminApp — the NIYOM Mutual Fund Admin Portal (employee-facing).
 * -----------------------------------------------------------------------------
 * A completely custom NIYOM console over BSE StAR MF, so staff never open BSE's
 * own interface. Reuses the existing employee Supabase session (same
 * nw_employees gate as the CRM); it does not re-implement login/MFA — an
 * unauthenticated visitor is routed to the CRM sign-in.
 *
 * Isolated in src/mfadmin; mounted additively at /mf-admin.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { NWEmployee } from '../crm/types';
import { AdminShell } from './layout/AdminShell';
import { ADMIN_VIEW_TITLES } from './layout/adminNav';
import { useAdminRouter } from './routing/useAdminRouter';
import { useAdminDashboard } from './hooks/useAdminDashboard';
import { AdminDashboardPage } from './features/dashboard/AdminDashboardPage';
import { AdminPlaceholder } from './features/AdminPlaceholder';

export default function MfAdminApp() {
  const [employee, setEmployee] = useState<NWEmployee | null>(null);
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        if (alive) setAuthState('denied');
        return;
      }
      const { data } = await supabase
        .from('nw_employees')
        .select('*')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setEmployee(data as NWEmployee);
        setAuthState('ok');
      } else {
        setAuthState('denied');
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (authState === 'loading') return <FullScreen><Spinner /></FullScreen>;
  if (authState === 'denied') return <AccessGate />;

  return <AdminConsole employee={employee} />;
}

function AdminConsole({ employee }: { employee: NWEmployee | null }) {
  const { view, navigate } = useAdminRouter();
  const { data, loading, error, refresh } = useAdminDashboard();

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/crm';
  };

  const renderView = () => {
    if (view === 'dashboard') {
      if (loading && !data) return <Spinner />;
      if (error) return <ErrorState message={error} onRetry={refresh} />;
      if (data) return <AdminDashboardPage data={data} />;
      return <Spinner />;
    }
    return <AdminPlaceholder title={ADMIN_VIEW_TITLES[view]} />;
  };

  return (
    <AdminShell
      view={view}
      title={ADMIN_VIEW_TITLES[view]}
      employee={employee}
      refreshing={loading}
      onNavigate={navigate}
      onRefresh={refresh}
      onLogout={logout}
    >
      {renderView()}
    </AdminShell>
  );
}

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-bg-base">{children}</div>;
}

function Spinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
    </div>
  );
}

function AccessGate() {
  return (
    <FullScreen>
      <div className="mx-auto max-w-sm px-6 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-token-xl bg-accent/10">
          <ShieldAlert className="h-6 w-6 text-accent" />
        </span>
        <h1 className="font-display text-xl font-bold text-text-primary">NIYOM MF Admin</h1>
        <p className="mx-auto mt-2 text-sm text-text-secondary">
          This console is for NIYOM employees. Please sign in through the CRM to continue.
        </p>
        <a
          href="/crm"
          className="mt-5 inline-flex items-center justify-center rounded-token-md px-5 py-2.5 text-sm font-bold text-on-accent"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
        >
          Go to CRM Sign-in
        </a>
      </div>
    </FullScreen>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" />
      <p className="text-sm text-text-primary">{message}</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-token-md border border-border bg-bg-surface px-4 py-2 text-xs font-semibold text-text-primary hover:text-accent">
        Try again
      </button>
    </div>
  );
}
