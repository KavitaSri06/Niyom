import { useMemo, useState } from 'react';
import {
  Bell,
  CalendarClock,
  CheckCheck,
  FileText,
  Receipt,
  ShieldCheck,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { timeAgo } from '../../../crm/utils';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { MockBadge } from '../../components/StatusPill';
import { Segmented } from '../../components/Segmented';
import { MockService } from '../../services/MockService';
import type { NotificationCategory } from '../../types/engagement';

const META: Record<NotificationCategory, { icon: LucideIcon; color: string }> = {
  transaction: { icon: Receipt, color: 'var(--accent)' },
  sip: { icon: CalendarClock, color: 'var(--info)' },
  nav: { icon: TrendingUp, color: 'var(--success)' },
  kyc: { icon: ShieldCheck, color: 'var(--success)' },
  document: { icon: FileText, color: 'var(--info)' },
  general: { icon: Bell, color: 'var(--text-muted)' },
};

export function NotificationsPage({ clientId }: { clientId: string }) {
  const initial = useMemo(() => MockService.notificationsFeed(clientId), [clientId]);
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const unreadCount = items.filter((n) => !n.read).length;
  const visible = filter === 'unread' ? items.filter((n) => !n.read) : items;

  const markAllRead = () => setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: string) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Segmented<'all' | 'unread'>
            options={[
              { value: 'all', label: 'All', count: items.length },
              { value: 'unread', label: 'Unread', count: unreadCount || undefined },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <MockBadge />
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-1.5 rounded-token-md border border-border bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <Card><EmptyState icon={Bell} title="You're all caught up." compact /></Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <ul className="divide-y divide-border-subtle">
            {visible.map((n) => {
              const meta = META[n.category];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-hover"
                  >
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-token-md"
                      style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                    >
                      <meta.icon className="h-4 w-4" style={{ color: meta.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-text-primary">{n.title}</p>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-text-secondary">{n.body}</p>
                      <p className="mt-1 text-[10px] text-text-faint">{timeAgo(n.date)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
