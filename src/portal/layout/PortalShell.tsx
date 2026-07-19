import { useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import type { PortalView } from './navigation';
import type { NWClient } from '../../crm/types';

interface PortalShellProps {
  view: PortalView;
  title: string;
  client: NWClient | null;
  refreshing: boolean;
  onNavigate: (view: PortalView) => void;
  onRefresh: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  children: ReactNode;
}

/** App frame: persistent sidebar + sticky topbar + scrolling content region. */
export function PortalShell({
  view,
  title,
  client,
  refreshing,
  onNavigate,
  onRefresh,
  onChangePassword,
  onLogout,
  children,
}: PortalShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <div className="flex">
        <Sidebar
          view={view}
          onNavigate={onNavigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar
            title={title}
            client={client}
            refreshing={refreshing}
            onOpenMobile={() => setMobileOpen(true)}
            onRefresh={onRefresh}
            onChangePassword={onChangePassword}
            onLogout={onLogout}
          />
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
