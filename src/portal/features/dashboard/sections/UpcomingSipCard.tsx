import { CalendarClock } from 'lucide-react';
import { fmt, fmtDate } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { SectionHeader } from '../../../components/SectionHeader';
import { EmptyState } from '../../../components/EmptyState';
import type { UpcomingSip } from '../../../types';

export function UpcomingSipCard({ sips }: { sips: UpcomingSip[] }) {
  const isMock = sips.some((s) => s.isMock);
  const monthlyTotal = sips.reduce((sum, s) => sum + s.amount, 0);

  return (
    <Card className="animate-fadeInUp animate-delay-300">
      <SectionHeader
        title="Upcoming SIPs"
        icon={CalendarClock}
        isMock={isMock}
        action={
          sips.length > 0 ? (
            <span className="text-xs font-semibold text-text-secondary">
              {fmt(monthlyTotal)}<span className="text-text-faint">/mo</span>
            </span>
          ) : undefined
        }
      />

      {sips.length === 0 ? (
        <EmptyState icon={CalendarClock} title="No active SIPs." hint="Start a SIP to automate investing." compact />
      ) : (
        <ul className="space-y-1.5">
          {sips.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-3 rounded-token-md bg-bg-surface px-3 py-2.5"
            >
              <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-token-md bg-accent/10">
                <span className="text-[9px] font-semibold uppercase text-accent">
                  {new Date(s.nextDate).toLocaleDateString('en-IN', { month: 'short' })}
                </span>
                <span className="text-xs font-bold leading-none text-accent">
                  {new Date(s.nextDate).getDate()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-text-primary">{s.fundName}</p>
                <p className="text-[11px] text-text-secondary">
                  {s.frequency} · {fmtDate(s.nextDate)}
                </p>
              </div>
              <p className="text-xs font-bold text-text-primary">{fmt(s.amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
