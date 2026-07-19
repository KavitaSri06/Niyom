interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Pill segmented control — the portal's tab/filter primitive. Horizontally
 * scrollable on overflow so it never breaks the mobile layout.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = '',
  size = 'md',
}: SegmentedProps<T>) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-2 text-xs';

  return (
    <div className={`flex gap-1.5 overflow-x-auto ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-token-md border font-semibold transition-colors ${pad} ${
              active
                ? 'border-accent/25 bg-selected text-accent'
                : 'border-border bg-bg-raised text-text-muted hover:text-text-primary'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span
                className={`rounded-token-sm px-1 text-[10px] ${
                  active ? 'bg-accent/15 text-accent' : 'bg-bg-surface text-text-faint'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
