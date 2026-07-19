import { Target } from 'lucide-react';
import { fmt } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { SectionHeader } from '../../../components/SectionHeader';
import type { GoalProgress } from '../../../types';

export function GoalProgressCard({ goals }: { goals: GoalProgress[] }) {
  const isMock = goals.some((g) => g.isMock);

  return (
    <Card className="animate-fadeInUp animate-delay-200">
      <SectionHeader title="Goal Progress" icon={Target} isMock={isMock} />
      <div className="space-y-4">
        {goals.map((g) => (
          <div key={g.id}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-xs font-semibold text-text-primary">{g.name}</p>
              <p className="text-[11px] text-text-secondary">
                {fmt(g.current)} <span className="text-text-faint">/ {fmt(g.target)}</span>
                <span className="ml-1.5 text-text-faint">· {g.targetYear}</span>
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-bg-raised">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${g.percent}%`, transitionDuration: 'var(--dur-slow)' }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
