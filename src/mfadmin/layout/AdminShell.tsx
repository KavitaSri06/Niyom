import { useState, type ReactNode } from 'react';
import type { NWEmployee } from '../../crm/types';
import { AdminSidebar } from './AdminSidebar';
import { AdminTopbar } from './AdminTopbar';
import type { AdminView } from './adminNav';

interface Props {
  view: AdminView;
  title: string;
  employee: NWEmployee | null;
  refreshing: boolean;
  onNavigate: (view: AdminView) => void;
  onRefresh: () => void;
  onLogout: () => void;
  children: ReactNode;
}

/** App frame for the MF Admin console. */
export function AdminShell({ view, title, employee, refreshing, onNavigate, onRefresh, onLogout, children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">
      <div className="flex">
        <AdminSidebar
          view={view}
          onNavigate={onNavigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <AdminTopbar
            title={title}
            employee={employee}
            refreshing={refreshing}
            onOpenMobile={() => setMobileOpen(true)}
            onRefresh={onRefresh}
            onLogout={onLogout}
          />
          <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
