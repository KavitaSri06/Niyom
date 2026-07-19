import { Search } from 'lucide-react';
import { Segmented } from '../../../components/Segmented';
import type { FundFacets } from '../../../services/FundService';
import type { FundCategory, FundFilters as Filters, FundSort, RiskLevel } from '../../../types/funds';

interface FundFiltersProps {
  filters: Filters;
  facets: FundFacets;
  onChange: (patch: Partial<Filters>) => void;
}

const SORTS: Array<{ value: FundSort; label: string }> = [
  { value: 'returns1Y', label: '1Y Returns' },
  { value: 'returns3Y', label: '3Y Returns' },
  { value: 'aum', label: 'Fund Size' },
  { value: 'rating', label: 'Rating' },
  { value: 'expense', label: 'Lowest Cost' },
];

const selectCls =
  'rounded-token-md border border-border bg-bg-surface px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-accent';

export function FundFilters({ filters, facets, onChange }: FundFiltersProps) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={filters.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Search funds, AMCs, categories…"
          className="w-full rounded-token-md border border-border bg-bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary outline-none transition-colors focus:border-accent"
        />
      </div>

      {/* Category segmented */}
      <Segmented<FundCategory | 'all'>
        options={[
          { value: 'all', label: 'All' },
          ...facets.categories.map((c) => ({ value: c, label: c })),
        ]}
        value={filters.category}
        onChange={(category) => onChange({ category })}
      />

      {/* Selects */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.amc}
          onChange={(e) => onChange({ amc: e.target.value })}
          className={selectCls}
          aria-label="Filter by AMC"
        >
          <option value="all">All AMCs</option>
          {facets.amcs.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={filters.risk}
          onChange={(e) => onChange({ risk: e.target.value as RiskLevel | 'all' })}
          className={selectCls}
          aria-label="Filter by risk"
        >
          <option value="all">Any Risk</option>
          {facets.risks.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-text-faint">Sort</span>
          <select
            value={filters.sort}
            onChange={(e) => onChange({ sort: e.target.value as FundSort })}
            className={selectCls}
            aria-label="Sort funds"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
