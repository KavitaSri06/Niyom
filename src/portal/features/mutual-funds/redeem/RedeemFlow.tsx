import { useMemo, useState } from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { fmt } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { Segmented } from '../../../components/Segmented';
import { useMfTransaction } from '../../../hooks/useMfTransaction';
import type { RedeemMode } from '../../../types/funds';
import { AmcAvatar } from '../components/AmcAvatar';
import { TxnSuccess } from '../components/TxnSuccess';
import type { MfHolding } from '../mappers';

interface Props {
  holding: MfHolding;
  clientId: string;
  onBack: () => void;
  onDone: () => void;
}

const inputCls =
  'w-full rounded-token-md border border-border bg-bg-base py-3 pl-9 pr-4 font-display text-xl font-bold text-text-primary outline-none transition-colors focus:border-accent';

export function RedeemFlow({ holding, clientId, onBack, onDone }: Props) {
  const [mode, setMode] = useState<RedeemMode>('amount');
  const [amtInput, setAmtInput] = useState(0);
  const [unitInput, setUnitInput] = useState(0);
  const [step, setStep] = useState<'form' | 'review'>('form');
  const { redeem, placing, result, error } = useMfTransaction();

  const { amount, units } = useMemo(() => {
    if (mode === 'all') return { amount: holding.value, units: holding.units };
    if (mode === 'units') return { units: unitInput, amount: unitInput * holding.nav };
    return { amount: amtInput, units: holding.nav > 0 ? amtInput / holding.nav : 0 };
  }, [mode, amtInput, unitInput, holding]);

  const valid = amount > 0 && amount <= holding.value + 1;

  const confirm = () =>
    redeem({
      clientId,
      schemeCode: holding.schemeCode,
      schemeName: holding.schemeName,
      folioNumber: holding.folioNumber,
      mode,
      amount,
      units,
    });

  if (result) return <TxnSuccess result={result} onDone={onDone} />;

  const reviewRows: Array<{ label: string; value: string }> = [
    { label: 'Fund', value: holding.schemeName },
    { label: 'Type', value: mode === 'all' ? 'Full Redemption' : 'Partial Redemption' },
    { label: 'Redeem Value', value: fmt(amount) },
    { label: 'Approx. Units', value: `${units.toFixed(3)} @ ₹${holding.nav.toFixed(2)}` },
    { label: 'Remaining Value', value: fmt(Math.max(0, holding.value - amount)) },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <button
        type="button"
        onClick={step === 'review' ? () => setStep('form') : onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {step === 'review' ? 'Edit' : 'My Funds'}
      </button>

      <Card padding="md">
        <div className="flex items-center gap-3">
          <AmcAvatar amc={holding.amc || holding.schemeName} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text-primary">{holding.schemeName}</p>
            <p className="text-[11px] text-text-secondary">
              Holding {fmt(holding.value)} · {holding.units.toFixed(3)} units · NAV ₹{holding.nav.toFixed(2)}
            </p>
          </div>
        </div>
      </Card>

      {step === 'form' ? (
        <Card className="space-y-5">
          <Segmented<RedeemMode>
            options={[
              { value: 'amount', label: 'By Amount' },
              { value: 'units', label: 'By Units' },
              { value: 'all', label: 'Redeem All' },
            ]}
            value={mode}
            onChange={setMode}
          />

          {mode === 'amount' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Redemption Amount
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-text-secondary">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={amtInput || ''}
                  onChange={(e) => setAmtInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  placeholder="0"
                  className={inputCls}
                  style={{ borderColor: amount > holding.value + 1 ? 'var(--danger)' : 'var(--border)' }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setAmtInput(Math.floor(holding.value))}
                  className="rounded-token-sm border border-border bg-bg-raised px-2 py-1 text-[11px] font-semibold text-text-secondary hover:border-accent/40 hover:text-accent"
                >
                  Max {fmt(holding.value)}
                </button>
                <p className="text-[11px] text-text-faint">≈ {units.toFixed(3)} units</p>
              </div>
            </div>
          )}

          {mode === 'units' && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Units to Redeem
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-text-secondary">#</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={unitInput || ''}
                  onChange={(e) => setUnitInput(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  className={inputCls}
                  style={{ borderColor: units > holding.units + 1e-3 ? 'var(--danger)' : 'var(--border)' }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setUnitInput(holding.units)}
                  className="rounded-token-sm border border-border bg-bg-raised px-2 py-1 text-[11px] font-semibold text-text-secondary hover:border-accent/40 hover:text-accent"
                >
                  All {holding.units.toFixed(3)} units
                </button>
                <p className="text-[11px] text-text-faint">≈ {fmt(amount)}</p>
              </div>
            </div>
          )}

          {mode === 'all' && (
            <div className="rounded-token-md bg-bg-surface px-4 py-3 text-center">
              <p className="text-xs text-text-secondary">Redeeming entire holding</p>
              <p className="mt-1 font-display text-2xl font-bold text-text-primary">{fmt(holding.value)}</p>
              <p className="text-[11px] text-text-faint">{holding.units.toFixed(3)} units</p>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-text-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Exit load / capital-gains tax (if any) may apply and will be reflected in the final redemption amount.
          </p>

          <button
            type="button"
            disabled={!valid}
            onClick={() => setStep('review')}
            className="w-full rounded-token-md py-3 text-sm font-bold text-on-accent disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
          >
            Review Redemption
          </button>
        </Card>
      ) : (
        <Card className="space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Review & Confirm</h3>
          <dl className="space-y-2">
            {reviewRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 rounded-token-md bg-bg-surface px-3 py-2.5">
                <dt className="text-xs text-text-secondary">{r.label}</dt>
                <dd className="truncate text-right text-xs font-semibold text-text-primary">{r.value}</dd>
              </div>
            ))}
          </dl>

          {error && (
            <div className="rounded-token-md border border-danger-soft/20 bg-danger-soft/10 p-3 text-xs text-danger-soft">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={placing}
            onClick={confirm}
            className="w-full rounded-token-md py-3 text-sm font-bold text-on-accent disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
          >
            {placing ? 'Placing redemption…' : `Confirm Redemption · ${fmt(amount)}`}
          </button>
        </Card>
      )}
    </div>
  );
}
