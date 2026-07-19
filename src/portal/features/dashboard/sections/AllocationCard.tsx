import { PieChart } from 'lucide-react';
import { fmt } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { SectionHeader } from '../../../components/SectionHeader';
import { DonutChart } from '../../../components/DonutChart';
import { EmptyState } from '../../../components/EmptyState';
import type { PortfolioSummary } from '../../../types';

export function AllocationCard({ summary }: { summary: PortfolioSummary }) {
  const { allocation, netWorth } = summary;

  return (
    <Card className="animate-fadeInUp animate-delay-100">
      <SectionHeader title="Asset Allocation" icon={PieChart} />

      {allocation.length === 0 ? (
        <EmptyState icon={PieChart} title="No holdings to allocate yet." compact />
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <DonutChart
            segments={allocation.map((a) => ({ label: a.label, value: a.value, color: a.color }))}
            centerLabel={fmt(netWorth)}
            centerSub="TOTAL"
          />
          <ul className="w-full flex-1 space-y-2.5">
            {allocation.map((slice) => (
              <li key={slice.productType} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: slice.color }}
                />
                <span className="flex-1 truncate text-xs font-medium text-text-primary">
                  {slice.label}
                </span>
                <span className="text-xs font-semibold text-text-primary">{fmt(slice.value)}</span>
                <span className="w-12 text-right text-xs text-text-secondary">
                  {slice.percent.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
