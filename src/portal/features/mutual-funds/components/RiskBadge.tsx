import type { RiskLevel } from '../../../types/funds';

const RISK_META: Record<RiskLevel, { color: string; step: number }> = {
  Low: { color: 'var(--success)', step: 1 },
  'Moderately Low': { color: '#22B8CF', step: 2 },
  Moderate: { color: 'var(--warning)', step: 3 },
  'Moderately High': { color: '#F97316', step: 4 },
  High: { color: '#F45B5B', step: 5 },
  'Very High': { color: 'var(--danger)', step: 6 },
};

/** Compact riskometer: label + 6-step severity bar in the risk color. */
export function RiskBadge({ risk, showBar = true }: { risk: RiskLevel; showBar?: boolean }) {
  const { color, step } = RISK_META[risk];
  return (
    <div className="flex items-center gap-2">
      {showBar && (
        <div className="flex items-center gap-0.5" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i < step ? color : 'var(--bg-raised)' }}
            />
          ))}
        </div>
      )}
      <span className="text-[11px] font-semibold" style={{ color }}>
        {risk} Risk
      </span>
    </div>
  );
}
