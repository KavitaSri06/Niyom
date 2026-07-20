import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { fmt } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { Segmented } from '../../../components/Segmented';
import { useMfTransaction } from '../../../hooks/useMfTransaction';
import type { FundScheme, RedeemMode } from '../../../types/funds';
import { AmcAvatar } from '../components/AmcAvatar';
import { TxnSuccess } from '../components/TxnSuccess';
import type { MfHolding } from '../mappers';

interface Props {
  holding: MfHolding;
  schemes: FundScheme[];
  clientId: string;
  onBack: () => void;
  onDone: () => void;
}

const selectCls =
  'w-full rounded-token-md border border-border bg-bg-surface px-3 py-2.5 text-sm font-semibold text-text-primary outline-none focus:border-accent';

export function SwitchFlow({ holding, schemes, clientId, onBack, onDone }: Props) {
  // Candidate targets: every catalog scheme except the source fund.
  const targets = useMemo(
    () => schemes.filter((s) => s.name.toLowerCase() !== holding.schemeName.toLowerCase()),
    [schemes, holding.schemeName],
  );

  const [toCode, setToCode] = useState(targets[0]?.schemeCode ?? '');
  const [mode, setMode] = useState<Extract<RedeemMode, 'amount' | 'all'>>('all');
  const [amtInput, setAmtInput] = useState(0);
  const [step, setStep] = useState<'form' | 'review'>('form');
  const { switchFund, placing, result, error } = useMfTransaction();

  const target = targets.find((s) => s.schemeCode === toCode) ?? null;
  const amount = mode === 'all' ? holding.value : amtInput;
  const units = holding.nav > 0 ? amount / holding.nav : 0;
  const valid = !!target && amount > 0 && amount <= holding.value + 1;

  const confirm = () => {
    if (!target) return;
    return switchFund({
      clientId,
      fromSchemeCode: holding.schemeCode,
      fromSchemeName: holding.schemeName,
      toSchemeCode: target.schemeCode,
      toSchemeName: target.name,
      folioNumber: holding.folioNumber,
      mode,
      amount,
      units,
    });
  };

  if (result) return <TxnSuccess result={result} onDone={onDone} />;

  const reviewRows: Array<{ label: string; value: string }> = [
    { label: 'From', value: holding.schemeName },
    { label: 'To', value: target?.name ?? '—' },
    { label: 'Type', value: mode === 'all' ? 'Full Switch' : 'Partial Switch' },
    { label: 'Switch Value', value: fmt(amount) },
    { label: 'Approx. Units Redeemed', value: `${units.toFixed(3)} @ ₹${holding.nav.toFixed(2)}` },
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

      {/* From → To */}
      <Card padding="md">
        <div className="flex items-center gap-3">
          <AmcAvatar amc={holding.amc || holding.schemeName} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-text-faint">Switch from</p>
            <p className="truncate text-sm font-bold text-text-primary">{holding.schemeName}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-text-faint">Switch to</p>
            <p className="truncate text-sm font-bold text-text-primary">{target?.name ?? 'Select fund'}</p>
          </div>
        </div>
      </Card>

      {step === 'form' ? (
        <Card className="space-y-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
              Target Fund
            </label>
            <select value={toCode} onChange={(e) => setToCode(e.target.value)} className={selectCls}>
              {targets.map((s) => (
                <option key={s.schemeCode} value={s.schemeCode}>
                  {s.name} · {s.category}
                </option>
              ))}
            </select>
          </div>

          <Segmented<'amount' | 'all'>
            options={[
              { value: 'all', label: 'Switch All' },
              { value: 'amount', label: 'By Amount' },
            ]}
            value={mode}
            onChange={setMode}
          />

          {mode === 'amount' ? (
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
                Switch Amount
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-text-secondary">₹</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={amtInput || ''}
                  onChange={(e) => setAmtInput(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  placeholder="0"
                  className="w-full rounded-token-md border bg-bg-base py-3 pl-9 pr-4 font-display text-xl font-bold text-text-primary outline-none transition-colors focus:border-accent"
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
          ) : (
            <div className="rounded-token-md bg-bg-surface px-4 py-3 text-center">
              <p className="text-xs text-text-secondary">Switching entire holding</p>
              <p className="mt-1 font-display text-2xl font-bold text-text-primary">{fmt(holding.value)}</p>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-text-faint">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            A switch redeems from the source fund and invests into the target. Exit load / capital-gains tax may apply.
          </p>

          <button
            type="button"
            disabled={!valid}
            onClick={() => setStep('review')}
            className="w-full rounded-token-md py-3 text-sm font-bold text-on-accent disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
          >
            Review Switch
          </button>
        </Card>
      ) : (
        <Card className="space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Review & Confirm</h3>
          <dl className="space-y-2">
            {reviewRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 rounded-token-md bg-bg-surface px-3 py-2.5">
                <dt className="shrink-0 text-xs text-text-secondary">{r.label}</dt>
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
            {placing ? 'Placing switch…' : `Confirm Switch · ${fmt(amount)}`}
          </button>
        </Card>
      )}
    </div>
  );
}
