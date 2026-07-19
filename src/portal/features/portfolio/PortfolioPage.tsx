import { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { fmt } from '../../../crm/utils';
import type { ProductType } from '../../../crm/types';
import { Card } from '../../components/Card';
import { KpiStat } from '../../components/KpiStat';
import { Segmented } from '../../components/Segmented';
import { EmptyState } from '../../components/EmptyState';
import type { PortfolioData } from '../../types';
import { HoldingsTable, type SortKey } from './HoldingsTable';

type Filter = ProductType | 'all';

const SORTERS: Record<SortKey, (a: PortfolioData['rows'][number], b: PortfolioData['rows'][number]) => number> = {
  value: (a, b) => a.value - b.value,
  gain: (a, b) => a.gain - b.gain,
  invested: (a, b) => a.invested - b.invested,
  name: (a, b) => a.name.localeCompare(b.name),
};

export function PortfolioPage({ data }: { data: PortfolioData }) {
  const { summary, rows } = data;
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filterOptions = useMemo(() => {
    const opts: Array<{ value: Filter; label: string; count: number }> = [
      { value: 'all', label: 'All', count: rows.length },
    ];
    for (const b of data.breakdowns.product.buckets) {
      opts.push({ value: b.key as ProductType, label: b.label, count: b.count });
    }
    return opts;
  }, [rows.length, data.breakdowns.product.buckets]);

  const visibleRows = useMemo(() => {
    const filtered = filter === 'all' ? rows : rows.filter((r) => r.productType === filter);
    const sorted = [...filtered].sort(SORTERS[sortKey]);
    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }, [rows, filter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={Wallet} title="No holdings yet." hint="Your investments will appear here once you start." />
      </Card>
    );
  }

  const gainUp = summary.gain >= 0;

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <Card padding="lg">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <KpiStat label="Current Value" value={fmt(summary.netWorth)} color="var(--accent)" />
          <KpiStat label="Invested" value={fmt(summary.invested)} />
          <KpiStat
            label={gainUp ? 'Total Gain' : 'Total Loss'}
            value={`${gainUp ? '+' : ''}${fmt(summary.gain)}`}
            color={gainUp ? 'var(--success)' : 'var(--danger)'}
            sub={`${gainUp ? '+' : ''}${summary.gainPercent.toFixed(2)}%`}
            trend={gainUp ? 'up' : 'down'}
          />
          <KpiStat label="Holdings" value={String(summary.holdingsCount)} sub={`${summary.productCount} asset classes`} />
        </div>
      </Card>

      {/* Filter + table */}
      <div className="space-y-3">
        <Segmented options={filterOptions} value={filter} onChange={setFilter} />
        <HoldingsTable rows={visibleRows} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
        <p className="px-1 text-xs text-text-faint">
          Showing {visibleRows.length} of {rows.length} holdings
        </p>
      </div>
    </div>
  );
}
