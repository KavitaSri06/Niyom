import { useState } from 'react';
import { PieChart } from 'lucide-react';
import { Card } from '../../components/Card';
import { Segmented } from '../../components/Segmented';
import { EmptyState } from '../../components/EmptyState';
import type { AllocationDimension, PortfolioData } from '../../types';
import { BreakdownCard } from './BreakdownCard';

type DimId = AllocationDimension['id'];

const DIMENSIONS: Array<{ value: DimId; label: string }> = [
  { value: 'product', label: 'Product' },
  { value: 'assetClass', label: 'Asset Class' },
  { value: 'category', label: 'Category' },
  { value: 'amc', label: 'AMC / Issuer' },
];

export function AllocationPage({ data }: { data: PortfolioData }) {
  const [dim, setDim] = useState<DimId>('product');

  if (data.rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={PieChart} title="Nothing to allocate yet." hint="Allocation views appear once you hold investments." />
      </Card>
    );
  }

  // Show the selected dimension prominently, plus the asset-class split as a
  // constant companion (the most meaningful cut for a wealth view).
  const primary = data.breakdowns[dim];
  const companion = dim === 'assetClass' ? data.breakdowns.product : data.breakdowns.assetClass;

  return (
    <div className="space-y-6">
      <Segmented
        options={DIMENSIONS.map((d) => ({
          ...d,
          count: data.breakdowns[d.value].buckets.length,
        }))}
        value={dim}
        onChange={setDim}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <BreakdownCard dimension={primary} />
        <BreakdownCard dimension={companion} />
      </div>
    </div>
  );
}
