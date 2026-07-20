import { useMemo } from 'react';
import { CalendarClock, Plus, TrendingUp } from 'lucide-react';
import { fmt, fmtDate } from '../../../crm/utils';
import type { NWHolding } from '../../../crm/types';
import { Card } from '../../components/Card';
import { KpiStat } from '../../components/KpiStat';
import { EmptyState } from '../../components/EmptyState';
import { MockBadge, StatusPill } from '../../components/StatusPill';
import { MockService } from '../../services/MockService';
import type { PortalView } from '../../layout/navigation';

interface Props {
  clientId: string;
  holdings: NWHolding[];
  onNavigate: (view: PortalView) => void;
}

export function SipPage({ clientId, holdings, onNavigate }: Props) {
  const mandates = useMemo(() => MockService.sipMandates(holdings, clientId), [holdings, clientId]);

  const monthly = mandates.reduce((s, m) => s + (m.frequency === 'Monthly' ? m.amount : 0), 0);
  const investedSoFar = mandates.reduce((s, m) => s + m.investedSoFar, 0);

  const startCta = (
    <button
      type="button"
      onClick={() => onNavigate('mutual-funds')}
      className="inline-flex items-center gap-2 rounded-token-md px-4 py-2 text-sm font-bold text-on-accent"
      style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
    >
      <Plus className="h-4 w-4" /> Start a SIP
    </button>
  );

  if (mandates.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarClock} title="No active SIPs yet." hint="Automate your investing with a Systematic Investment Plan." />
        <div className="flex justify-center pt-1">{startCta}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card padding="lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid flex-1 grid-cols-3 gap-4">
            <KpiStat label="Monthly Commitment" value={fmt(monthly)} color="var(--accent)" />
            <KpiStat label="Active SIPs" value={String(mandates.length)} />
            <KpiStat label="Invested via SIP" value={fmt(investedSoFar)} />
          </div>
          <div className="flex items-center gap-2">
            <MockBadge />
            {startCta}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {mandates.map((m) => {
          const progress = m.totalInstallments
            ? Math.min(100, (m.installmentsDone / m.totalInstallments) * 100)
            : null;
          return (
            <Card key={m.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-text-primary">{m.fundName}</p>
                  <p className="text-[11px] text-text-secondary">{m.amc}</p>
                </div>
                <StatusPill tone={m.status === 'active' ? 'success' : 'warning'}>
                  {m.status === 'active' ? 'Active' : 'Paused'}
                </StatusPill>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="font-display text-2xl font-bold text-text-primary">{fmt(m.amount)}</p>
                  <p className="text-[11px] text-text-secondary">{m.frequency}</p>
                </div>
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1 text-[11px] text-text-faint">
                    <CalendarClock className="h-3 w-3" /> Next debit
                  </p>
                  <p className="text-sm font-semibold text-text-primary">{fmtDate(m.nextDate)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-text-secondary">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-success" /> {m.installmentsDone} installments · {fmt(m.investedSoFar)}
                </span>
                <span>Since {fmtDate(m.startedOn)}</span>
              </div>

              {progress !== null && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-raised">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p className="px-1 text-[11px] text-text-faint">
        SIP mandates shown are illustrative. To pause, modify or cancel a SIP, contact your NIYOM
        relationship manager — live mandate management connects to BSE StAR MF in a later phase.
      </p>
    </div>
  );
}
