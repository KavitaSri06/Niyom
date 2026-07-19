interface KpiStatProps {
  label: string;
  value: string;
  sub?: string;
  /** CSS color token for the value, e.g. 'var(--accent)'. */
  color?: string;
  /** Directional tint for the sub line (gain/loss). */
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

const TREND_COLOR: Record<NonNullable<KpiStatProps['trend']>, string> = {
  up: 'var(--success)',
  down: 'var(--danger)',
  neutral: 'var(--text-muted)',
};

/**
 * A single KPI figure. Same visual language as the original portal summary cards
 * (uppercase micro-label, large display-font value), now reusable.
 */
export function KpiStat({
  label,
  value,
  sub,
  color = 'var(--text-primary)',
  trend = 'neutral',
  className = '',
}: KpiStatProps) {
  return (
    <div className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        {label}
      </p>
      <p
        className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
        style={{ color }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-1 text-xs font-medium" style={{ color: TREND_COLOR[trend] }}>
          {sub}
        </p>
      )}
    </div>
  );
}
