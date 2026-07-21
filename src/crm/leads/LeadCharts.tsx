// Lead Management — hand-built, dependency-free SVG charts. Theme-aware via CSS
// variables; a small categorical palette keeps series legible in light & dark.

import React from 'react';

export interface Datum { label: string; count: number; }

// Brand-adjacent categorical palette (distinct hues, readable on both themes).
export const PALETTE = [
  '99,102,241', '16,185,129', '249,115,22', '59,130,246', '234,179,8',
  '168,85,247', '6,182,212', '244,63,94', '132,204,22', '20,184,166',
];
export const paletteAt = (i: number) => PALETTE[i % PALETTE.length];

export function Card({ title, subtitle, children, className }:
  { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-5 ${className ?? ''}`} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <div className="mb-4">
        <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: 'var(--text-faint)' }}>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatTile({ label, value, tone, hint }:
  { label: string; value: string | number; tone?: string; hint?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
      <p className="text-xs" style={{ color: 'var(--text-faint)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: tone ? `rgb(${tone})` : 'var(--text-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
      </p>
      {hint && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-faint)' }}>{hint}</p>}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-center py-8" style={{ color: 'var(--text-faint)' }}>No data yet</p>;
}

// Horizontal ranked bars.
export function BarList({ data, colorFor }: { data: Datum[]; colorFor?: (d: Datum, i: number) => string }) {
  if (!data.length || data.every(d => d.count === 0)) return <Empty />;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => {
        const rgb = colorFor ? colorFor(d, i) : paletteAt(i);
        return (
          <div key={d.label + i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{d.count}</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${(d.count / max) * 100}%`, background: `rgb(${rgb})` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Vertical columns (trend over time).
export function Columns({ data, color = '99,102,241' }: { data: Datum[]; color?: string }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end justify-between gap-1.5 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
          <span className="text-[10px] font-bold" style={{ color: 'var(--text-secondary)' }}>{d.count}</span>
          <div className="w-full rounded-t-md transition-all" style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 0, background: `rgb(${color})` }} />
          <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Donut with legend.
export function Donut({ data, colorFor }: { data: Datum[]; colorFor?: (d: Datum, i: number) => string }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <Empty />;
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  const segs = data.map((d, i) => {
    const frac = d.count / total;
    const rgb = colorFor ? colorFor(d, i) : paletteAt(i);
    const seg = { rgb, dash: frac * C, offset: offset * C, label: d.label, count: d.count, pct: Math.round(frac * 100) };
    offset += frac;
    return seg;
  });
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg width="132" height="132" viewBox="0 0 132 132" className="flex-shrink-0">
        <circle cx="66" cy="66" r={R} fill="none" stroke="var(--bg-raised)" strokeWidth="16" />
        {segs.map((s, i) => (
          <circle key={i} cx="66" cy="66" r={R} fill="none" stroke={`rgb(${s.rgb})`} strokeWidth="16"
            strokeDasharray={`${s.dash} ${C - s.dash}`} strokeDashoffset={-s.offset}
            transform="rotate(-90 66 66)" strokeLinecap="butt" />
        ))}
        <text x="66" y="62" textAnchor="middle" className="font-bold" style={{ fill: 'var(--text-primary)', fontSize: 20 }}>{total}</text>
        <text x="66" y="80" textAnchor="middle" style={{ fill: 'var(--text-faint)', fontSize: 10 }}>total</text>
      </svg>
      <div className="space-y-1.5 flex-1 min-w-[140px]">
        {segs.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: `rgb(${s.rgb})` }} />
            <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{s.count}</span>
            <span className="text-[10px] w-8 text-right" style={{ color: 'var(--text-faint)' }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Conversion funnel (stacked, decreasing).
export function Funnel({ data }: { data: Datum[] }) {
  if (!data.length) return <Empty />;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const rgb = paletteAt(i);
        const w = Math.max((d.count / max) * 100, 6);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-[11px] w-24 flex-shrink-0 truncate" style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
            <div className="flex-1 flex items-center">
              <div className="h-7 rounded-md flex items-center justify-end px-2 transition-all" style={{ width: `${w}%`, background: `rgb(${rgb})`, minWidth: 34 }}>
                <span className="text-[11px] font-bold text-white">{d.count}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Area line trend.
export function TrendLine({ data, color = '16,185,129' }: { data: Datum[]; color?: string }) {
  if (data.length < 2) return <Empty />;
  const W = 300, H = 120, P = 8;
  const max = Math.max(...data.map(d => d.count), 1);
  const step = (W - P * 2) / (data.length - 1);
  const pts = data.map((d, i) => [P + i * step, H - P - (d.count / max) * (H - P * 2)] as const);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]},${H - P} L${pts[0][0]},${H - P} Z`;
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 120 }}>
        <path d={area} fill={`rgba(${color},0.12)`} />
        <path d={line} fill="none" stroke={`rgb(${color})`} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={`rgb(${color})`} />)}
      </svg>
      <div className="flex justify-between mt-1">
        {data.map((d, i) => <span key={i} className="text-[10px]" style={{ color: 'var(--text-faint)' }}>{d.label}</span>)}
      </div>
    </div>
  );
}
