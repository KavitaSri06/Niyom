import { ChevronRight, TrendingUp } from 'lucide-react';
import { fmt } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { SectionHeader } from '../../../components/SectionHeader';
import { EmptyState } from '../../../components/EmptyState';
import type { MutualFundSummary } from '../../../types';

interface Props {
  mf: MutualFundSummary;
  onViewAll: () => void;
}

export function MutualFundSummaryCard({ mf, onViewAll }: Props) {
  const gainUp = mf.gain >= 0;
  const hasMf = mf.value > 0 || mf.topFunds.length > 0;

  return (
    <Card className="animate-fadeInUp animate-delay-200">
      <SectionHeader
        title="Mutual Funds"
        icon={TrendingUp}
        action={
          hasMf ? (
            <button
              type="button"
              onClick={onViewAll}
              className="flex items-center gap-0.5 text-xs font-semibold text-accent hover:text-accent-soft"
            >
              View all <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : undefined
        }
      />

      {!hasMf ? (
        <EmptyState icon={TrendingUp} title="No mutual fund holdings yet." hint="Explore funds to start investing." compact />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-secondary">Value</p>
              <p className="mt-0.5 font-display text-lg font-bold text-text-primary">{fmt(mf.value)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-secondary">Invested</p>
              <p className="mt-0.5 font-display text-lg font-bold text-text-primary">{fmt(mf.invested)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-text-secondary">Returns</p>
              <p
                className="mt-0.5 font-display text-lg font-bold"
                style={{ color: gainUp ? 'var(--success)' : 'var(--danger)' }}
              >
                {gainUp ? '+' : ''}{mf.gainPercent.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            {mf.topFunds.map((f) => {
              const up = f.gain >= 0;
              return (
                <div
                  key={`${f.name}-${f.folioNumber ?? ''}`}
                  className="flex items-center gap-3 rounded-token-md bg-bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-text-primary">{f.name}</p>
                    {f.fundHouse && (
                      <p className="truncate text-[11px] text-text-secondary">{f.fundHouse}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-text-primary">{fmt(f.value)}</p>
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: up ? 'var(--success)' : 'var(--danger)' }}
                    >
                      {up ? '+' : ''}{f.gainPercent.toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
