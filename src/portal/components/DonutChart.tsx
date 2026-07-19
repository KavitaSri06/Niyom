interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  /** Rendered in the hole (e.g. total value + caption). */
  centerLabel?: string;
  centerSub?: string;
}

/**
 * Lightweight, dependency-free donut. Uses stacked SVG circles with
 * stroke-dasharray so it themes perfectly in light/dark and stays consistent
 * with the app's hand-built data-viz. No Recharts.
 */
export function DonutChart({
  segments,
  size = 168,
  thickness = 20,
  centerLabel,
  centerSub,
}: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label="Asset allocation"
    >
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--bg-raised)"
        strokeWidth={thickness}
      />
      {/* Segments */}
      {total > 0 &&
        segments.map((seg) => {
          const fraction = seg.value / total;
          const dash = fraction * circumference;
          const gap = circumference - dash;
          const circleOffset = circumference * 0.25 - offset; // start at 12 o'clock
          offset += dash;
          return (
            <circle
              key={seg.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={circleOffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${center} ${center})`}
              style={{ transition: 'stroke-dasharray var(--dur-slow) var(--ease-out)' }}
            />
          );
        })}
      {(centerLabel || centerSub) && (
        <g>
          {centerLabel && (
            <text
              x={center}
              y={centerSub ? center - 2 : center + 4}
              textAnchor="middle"
              className="font-display"
              style={{ fill: 'var(--text-primary)', fontSize: 18, fontWeight: 700 }}
            >
              {centerLabel}
            </text>
          )}
          {centerSub && (
            <text
              x={center}
              y={center + 16}
              textAnchor="middle"
              style={{ fill: 'var(--text-muted)', fontSize: 10, letterSpacing: 0.5 }}
            >
              {centerSub}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
