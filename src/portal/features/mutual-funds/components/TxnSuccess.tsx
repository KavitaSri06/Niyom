import { CheckCircle2, Info } from 'lucide-react';
import { fmtDate } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import type { TxnResult } from '../../../types/funds';

interface Props {
  result: TxnResult;
  onDone: () => void;
}

/** Shared confirmation screen for redeem / switch transactions. */
export function TxnSuccess({ result, onDone }: Props) {
  const title = result.kind === 'redeem' ? 'Redemption Placed' : 'Switch Placed';

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Reference', value: result.orderId },
    { label: 'Fund', value: result.schemeName },
    { label: 'Details', value: result.detail },
    { label: 'Expected NAV Date', value: fmtDate(result.expectedNavDate) },
  ];

  return (
    <div className="mx-auto max-w-md space-y-5 py-4">
      <Card className="text-center animate-fadeInUp">
        <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft/10">
          <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--success)' }} />
        </span>
        <h2 className="font-display text-xl font-bold text-text-primary">{title}</h2>
        <p className="mx-auto mt-1 max-w-xs text-sm text-text-secondary">
          Your request has been submitted successfully.
        </p>

        <dl className="mt-5 space-y-2 text-left">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between gap-3 rounded-token-md bg-bg-surface px-3 py-2.5"
            >
              <dt className="shrink-0 text-xs text-text-secondary">{r.label}</dt>
              <dd className="truncate text-right text-xs font-semibold text-text-primary">{r.value}</dd>
            </div>
          ))}
        </dl>

        {result.isMock && (
          <p className="mt-4 flex items-start gap-1.5 rounded-token-md border border-border-strong bg-bg-surface p-2.5 text-left text-[11px] text-text-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Demo transaction — nothing has been debited or redeemed. Live BSE StAR MF processing connects in a later phase.
          </p>
        )}

        <button
          type="button"
          onClick={onDone}
          className="mt-5 w-full rounded-token-md py-3 text-sm font-bold text-on-accent"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
        >
          Done
        </button>
      </Card>
    </div>
  );
}
