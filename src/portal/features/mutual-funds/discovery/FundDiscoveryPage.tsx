import { useMemo, useState } from 'react';
import { SearchX } from 'lucide-react';
import { Card } from '../../../components/Card';
import { EmptyState } from '../../../components/EmptyState';
import { MockBadge } from '../../../components/StatusPill';
import { FundService } from '../../../services/FundService';
import type { FundFacets } from '../../../services/FundService';
import { DEFAULT_FUND_FILTERS, type FundFilters as Filters, type FundScheme } from '../../../types/funds';
import { FundFilters } from './FundFilters';
import { FundCard } from './FundCard';

interface Props {
  schemes: FundScheme[];
  facets: FundFacets;
  onOpenFund: (schemeCode: string) => void;
  onInvest: (schemeCode: string) => void;
}

export function FundDiscoveryPage({ schemes, facets, onOpenFund, onInvest }: Props) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FUND_FILTERS);
  const patch = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  const results = useMemo(() => FundService.apply(schemes, filters), [schemes, filters]);
  const anyMock = schemes.some((s) => s.isMock);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          <span className="font-bold text-text-primary">{results.length}</span> funds
        </p>
        {anyMock && <MockBadge />}
      </div>

      <FundFilters filters={filters} facets={facets} onChange={patch} />

      {results.length === 0 ? (
        <Card>
          <EmptyState icon={SearchX} title="No funds match your filters." hint="Try clearing a filter or searching differently." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((s) => (
            <FundCard
              key={s.schemeCode}
              scheme={s}
              onOpen={() => onOpenFund(s.schemeCode)}
              onInvest={() => onInvest(s.schemeCode)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
