import { useMemo, useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { fmt } from '../../../../crm/utils';
import { Card } from '../../../components/Card';
import { Segmented } from '../../../components/Segmented';
import { usePlaceOrder } from '../../../hooks/usePlaceOrder';
import type {
  FundPlan,
  FundScheme,
  OrderType,
  SipFrequency,
} from '../../../types/funds';
import { AmcAvatar } from '../components/AmcAvatar';
import { AmountInput } from '../components/AmountInput';
import { OrderSuccess } from './OrderSuccess';

interface Props {
  scheme: FundScheme;
  clientId: string;
  initialType: OrderType;
  onBack: () => void;
  onDone: () => void;
}

const SIP_DAYS = [1, 5, 7, 10, 15, 20, 25, 28];
const INSTALLMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '0', label: 'Until cancelled' },
  { value: '12', label: '12' },
  { value: '24', label: '24' },
  { value: '36', label: '36' },
  { value: '60', label: '60' },
];

const selectCls =
  'rounded-token-md border border-border bg-bg-surface px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-accent';

export function InvestFlow({ scheme, clientId, initialType, onBack, onDone }: Props) {
  const [type, setType] = useState<OrderType>(initialType);
  const [plan, setPlan] = useState<FundPlan>(scheme.plans[0]);
  const [amount, setAmount] = useState(type === 'sip' ? scheme.minSip : scheme.minLumpsum);
  const [frequency, setFrequency] = useState<SipFrequency>('Monthly');
  const [sipDay, setSipDay] = useState(5);
  const [installments, setInstallments] = useState(0); // 0 = until cancelled
  const [step, setStep] = useState<'form' | 'review'>('form');

  const { submit, placing, result, error } = usePlaceOrder();

  const min = type === 'sip' ? scheme.minSip : scheme.minLumpsum;
  const valid = amount >= min;
  const estUnits = useMemo(() => (scheme.nav > 0 ? amount / scheme.nav : 0), [amount, scheme.nav]);

  const switchType = (next: OrderType) => {
    setType(next);
    setAmount(next === 'sip' ? scheme.minSip : scheme.minLumpsum);
  };

  const confirm = () =>
    submit({
      schemeCode: scheme.schemeCode,
      clientId,
      type,
      plan,
      amount,
      ...(type === 'sip'
        ? { sipFrequency: frequency, sipDay, installments: installments || undefined }
        : {}),
    });

  if (result) return <OrderSuccess result={result} onDone={onDone} />;

  const reviewRows: Array<{ label: string; value: string }> = [
    { label: 'Fund', value: scheme.name },
    { label: 'Plan', value: `${plan} · Direct` },
    { label: 'Type', value: type === 'sip' ? 'SIP' : 'Lumpsum' },
    { label: type === 'sip' ? 'Per Installment' : 'Amount', value: fmt(amount) },
    ...(type === 'sip'
      ? [
          { label: 'Frequency', value: frequency },
          { label: 'SIP Date', value: `${sipDay}${nth(sipDay)} of every period` },
          { label: 'Installments', value: installments ? String(installments) : 'Until cancelled' },
        ]
      : []),
    { label: 'Approx. Units', value: `${estUnits.toFixed(3)} @ ₹${scheme.nav.toFixed(2)}` },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <button
        type="button"
        onClick={step === 'review' ? () => setStep('form') : onBack}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-muted hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> {step === 'review' ? 'Edit order' : 'Back'}
      </button>

      {/* Fund header */}
      <Card padding="md">
        <div className="flex items-center gap-3">
          <AmcAvatar amc={scheme.amc} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text-primary">{scheme.name}</p>
            <p className="text-[11px] text-text-secondary">
              {scheme.category} · {scheme.subCategory} · NAV ₹{scheme.nav.toFixed(2)}
            </p>
          </div>
        </div>
      </Card>

      {step === 'form' ? (
        <Card className="space-y-5">
          <Segmented<OrderType>
            options={[
              { value: 'lumpsum', label: 'One-time' },
              { value: 'sip', label: 'SIP' },
            ]}
            value={type}
            onChange={switchType}
          />

          <AmountInput
            value={amount}
            onChange={setAmount}
            min={min}
            label={type === 'sip' ? 'Monthly Amount' : 'Investment Amount'}
            quickAdds={type === 'sip' ? [1000, 2500, 5000] : [5000, 10000, 25000]}
          />

          {scheme.plans.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted">Option</span>
              <Segmented<FundPlan>
                size="sm"
                options={scheme.plans.map((p) => ({ value: p, label: p }))}
                value={plan}
                onChange={setPlan}
              />
            </div>
          )}

          {type === 'sip' && (
            <div className="grid grid-cols-3 gap-3">
              <label className="text-xs">
                <span className="mb-1.5 block font-semibold uppercase tracking-wider text-text-muted">
                  Frequency
                </span>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as SipFrequency)}
                  className={`${selectCls} w-full`}
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1.5 block font-semibold uppercase tracking-wider text-text-muted">
                  SIP Date
                </span>
                <select
                  value={sipDay}
                  onChange={(e) => setSipDay(Number(e.target.value))}
                  className={`${selectCls} w-full`}
                >
                  {SIP_DAYS.map((d) => (
                    <option key={d} value={d}>{d}{nth(d)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                <span className="mb-1.5 block font-semibold uppercase tracking-wider text-text-muted">
                  Installments
                </span>
                <select
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                  className={`${selectCls} w-full`}
                >
                  {INSTALLMENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between rounded-token-md bg-bg-surface px-3 py-2.5">
            <span className="text-xs text-text-secondary">Approx. units allotted</span>
            <span className="text-sm font-bold text-text-primary">{estUnits.toFixed(3)}</span>
          </div>

          <button
            type="button"
            disabled={!valid}
            onClick={() => setStep('review')}
            className="w-full rounded-token-md py-3 text-sm font-bold text-on-accent disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))' }}
          >
            Review Order
          </button>
        </Card>
      ) : (
        <Card className="space-y-4">
          <h3 className="text-sm font-bold text-text-primary">Review & Confirm</h3>
          <dl className="space-y-2">
            {reviewRows.map((r) => (
              <div
                key={r.label}
                className="flex items-center justify-between gap-3 rounded-token-md bg-bg-surface px-3 py-2.5"
              >
                <dt className="text-xs text-text-secondary">{r.label}</dt>
                <dd className="truncate text-right text-xs font-semibold text-text-primary">{r.value}</dd>
              </div>
            ))}
          </dl>

          <p className="flex items-start gap-1.5 text-[11px] text-text-faint">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            Orders placed before 3:00 PM are processed at today's NAV, subject to BSE StAR MF cut-off and fund realisation.
          </p>

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
            {placing ? 'Placing order…' : `Confirm · ${fmt(amount)}${type === 'sip' ? '/mo' : ''}`}
          </button>
        </Card>
      )}
    </div>
  );
}

function nth(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}
