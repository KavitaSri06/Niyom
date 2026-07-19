import { fmt } from '../../../../crm/utils';

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  quickAdds?: number[];
  label?: string;
}

/** ₹ amount field with quick-add chips. Used by the invest flow. */
export function AmountInput({
  value,
  onChange,
  min,
  quickAdds = [5000, 10000, 25000],
  label = 'Amount',
}: AmountInputProps) {
  const belowMin = value > 0 && value < min;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-text-secondary">
          ₹
        </span>
        <input
          type="number"
          inputMode="numeric"
          value={value || ''}
          min={min}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          placeholder={String(min)}
          className="w-full rounded-token-md border bg-bg-base py-3 pl-9 pr-4 font-display text-xl font-bold text-text-primary outline-none transition-colors focus:border-accent"
          style={{ borderColor: belowMin ? 'var(--danger)' : 'var(--border)' }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-1.5">
          {quickAdds.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onChange(value + q)}
              className="rounded-token-sm border border-border bg-bg-raised px-2 py-1 text-[11px] font-semibold text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              +{fmt(q)}
            </button>
          ))}
        </div>
        <p className="text-[11px]" style={{ color: belowMin ? 'var(--danger)' : 'var(--text-faint)' }}>
          Min {fmt(min)}
        </p>
      </div>
    </div>
  );
}
