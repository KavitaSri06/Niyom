import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { fmt, fmtFull } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { KpiStat } from '../../../components/KpiStat';
import { MockBadge } from '../../../components/StatusPill';
import type { DailyChange, PortfolioSummary, XirrEstimate } from '../../../types';

interface NetWorthHeroProps {
  summary: PortfolioSummary;
  dailyChange: DailyChange;
  xirr: XirrEstimate;
}

export function NetWorthHero({ summary, dailyChange, xirr }: NetWorthHeroProps) {
  const gainUp = summary.gain >= 0;
  const dayUp = dailyChange.amount >= 0;
  const DayIcon = dayUp ? ArrowUpRight : ArrowDownRight;

  return (
    <Card accent padding="lg" className="animate-fadeInUp">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-center">
        {/* Net worth */}
        <div className="lg:border-r lg:border-border-subtle lg:pr-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Net Worth</p>
          <p className="mt-1 font-display text-4xl font-bold tracking-tight text-text-primary sm:text-5xl">
            {fmt(summary.netWorth)}
          </p>
          <p className="mt-1 text-xs text-text-muted">{fmtFull(summary.netWorth)}</p>

          <div className="mt-3 inline-flex items-center gap-1.5 rounded-token-md border px-2.5 py-1 text-xs font-semibold"
            style={{
              color: dayUp ? 'var(--success)' : 'var(--danger)',
              background: dayUp ? 'rgba(var(--success-rgb),0.1)' : 'rgba(var(--danger-rgb),0.1)',
              borderColor: dayUp ? 'rgba(var(--success-rgb),0.2)' : 'rgba(var(--danger-rgb),0.2)',
            }}
          >
            <DayIcon className="h-3.5 w-3.5" />
            {dayUp ? '+' : ''}{fmt(dailyChange.amount)} ({dayUp ? '+' : ''}
            {dailyChange.percent.toFixed(2)}%) today
            <MockBadge />
          </div>
        </div>

        {/* Secondary KPIs */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
          <KpiStat label="Total Invested" value={fmt(summary.invested)} />
          <KpiStat
            label={gainUp ? 'Total Gain' : 'Total Loss'}
            value={`${gainUp ? '+' : ''}${fmt(summary.gain)}`}
            color={gainUp ? 'var(--success)' : 'var(--danger)'}
            sub={`${gainUp ? '+' : ''}${summary.gainPercent.toFixed(2)}%`}
            trend={gainUp ? 'up' : 'down'}
          />
          <KpiStat
            label="Overall Return"
            value={`${gainUp ? '+' : ''}${summary.gainPercent.toFixed(2)}%`}
            color={gainUp ? 'var(--success)' : 'var(--danger)'}
          />
          <KpiStat
            label="XIRR"
            value={`${xirr.percent >= 0 ? '+' : ''}${xirr.percent.toFixed(2)}%`}
            color={xirr.percent >= 0 ? 'var(--success)' : 'var(--danger)'}
            sub="annualised"
          />
          <KpiStat label="Holdings" value={String(summary.holdingsCount)} sub={`${summary.productCount} asset classes`} />
        </div>
      </div>
    </Card>
  );
}
