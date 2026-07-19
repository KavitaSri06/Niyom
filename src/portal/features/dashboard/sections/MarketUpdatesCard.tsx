import { Activity, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '../../../components/Card';
import { SectionHeader } from '../../../components/SectionHeader';
import type { MarketUpdate } from '../../../types';

export function MarketUpdatesCard({ updates }: { updates: MarketUpdate[] }) {
  const isMock = updates.some((u) => u.isMock);

  return (
    <Card className="animate-fadeInUp animate-delay-400">
      <SectionHeader title="Market Updates" icon={Activity} isMock={isMock} />
      <ul className="grid grid-cols-2 gap-2">
        {updates.map((u) => {
          const up = u.changePercent >= 0;
          const Icon = up ? TrendingUp : TrendingDown;
          return (
            <li key={u.id} className="rounded-token-md bg-bg-surface px-3 py-2.5">
              <p className="text-[11px] font-medium text-text-secondary">{u.label}</p>
              <p className="mt-0.5 text-sm font-bold text-text-primary">{u.value}</p>
              <p
                className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold"
                style={{ color: up ? 'var(--success)' : 'var(--danger)' }}
              >
                <Icon className="h-3 w-3" />
                {up ? '+' : ''}{u.changePercent.toFixed(2)}%
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
