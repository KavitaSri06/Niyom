import { ArrowLeftRight, Minus } from 'lucide-react';
import { fmt } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { AmcAvatar } from '../components/AmcAvatar';
import type { MfHolding } from '../mappers';

interface Props {
  holding: MfHolding;
  onRedeem: () => void;
  onSwitch: () => void;
}

export function HoldingFundCard({ holding, onRedeem, onSwitch }: Props) {
  const up = holding.gain >= 0;

  return (
    <Card padding="md" className="flex flex-col">
      <div className="flex items-start gap-3">
        <AmcAvatar amc={holding.amc || holding.schemeName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text-primary">{holding.schemeName}</p>
          {holding.folioNumber && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-text-secondary">
              Folio {holding.folioNumber}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint">Current</p>
          <p className="text-sm font-bold text-text-primary">{fmt(holding.value)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint">Invested</p>
          <p className="text-sm font-semibold text-text-primary">{fmt(holding.invested)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-faint">Returns</p>
          <p className="text-sm font-bold" style={{ color: up ? 'var(--success)' : 'var(--danger)' }}>
            {up ? '+' : ''}{holding.gainPercent.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-[11px] text-text-secondary">
        <span>{holding.units.toFixed(3)} units</span>
        <span>NAV ₹{holding.nav.toFixed(2)}</span>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onSwitch}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-token-md border border-border bg-bg-surface py-2 text-xs font-semibold text-text-primary transition-colors hover:border-accent/40 hover:text-accent"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" /> Switch
        </button>
        <button
          type="button"
          onClick={onRedeem}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-token-md border border-border bg-bg-surface py-2 text-xs font-semibold text-text-primary transition-colors hover:border-danger-soft/40 hover:text-danger-soft"
        >
          <Minus className="h-3.5 w-3.5" /> Redeem
        </button>
      </div>
    </Card>
  );
}
