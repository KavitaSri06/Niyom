import { fmt } from '../../../crm/utils';
import { Card } from '../../components/Card';
import { DonutChart } from '../../components/DonutChart';
import type { AllocationDimension } from '../../types';

/**
 * A single allocation dimension rendered as donut + ranked legend/table.
 * Reused for Product / Asset Class / Category / AMC.
 */
export function BreakdownCard({ dimension }: { dimension: AllocationDimension }) {
  const { title, buckets, total } = dimension;

  return (
    <Card className="animate-fadeInUp">
      <h2 className="mb-4 text-sm font-bold text-text-primary">{title}</h2>

      {buckets.length === 0 ? (
        <p className="py-10 text-center text-xs text-text-secondary">No data for this view.</p>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <DonutChart
            segments={buckets.map((b) => ({ label: b.label, value: b.value, color: b.color }))}
            centerLabel={fmt(total)}
            centerSub="TOTAL"
          />
          <div className="w-full flex-1">
            <table className="w-full">
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.key} className="border-b border-border-subtle last:border-0">
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ background: b.color }}
                        />
                        <span className="truncate text-xs font-medium text-text-primary">
                          {b.label}
                        </span>
                        <span className="text-[10px] text-text-faint">×{b.count}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right text-xs font-semibold text-text-primary">
                      {fmt(b.value)}
                    </td>
                    <td className="w-14 whitespace-nowrap py-2 pl-2 text-right text-xs text-text-secondary">
                      {b.percent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
