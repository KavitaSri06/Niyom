import type { ReactNode } from 'react';

type Tone = 'accent' | 'success' | 'danger' | 'warning' | 'info' | 'muted';

const TONE: Record<Tone, string> = {
  accent: 'text-accent bg-accent/10 border-accent/20',
  success: 'text-success-soft bg-success-soft/10 border-success-soft/20',
  danger: 'text-danger-soft bg-danger-soft/10 border-danger-soft/20',
  warning: 'text-warning-soft bg-warning-soft/10 border-warning-soft/20',
  info: 'text-info-soft bg-info-soft/10 border-info-soft/20',
  muted: 'text-text-muted bg-bg-surface border-border',
};

interface StatusPillProps {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}

/** Small tinted status chip using the shared category tints. */
export function StatusPill({ children, tone = 'muted', className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-token-sm border px-1.5 py-0.5 text-[11px] font-semibold ${TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** "Coming Soon" chip for roadmap products in the sidebar. */
export function ComingSoonBadge() {
  return (
    <span className="rounded-token-sm border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      Soon
    </span>
  );
}

/** Honesty chip for sections backed by MockService. */
export function MockBadge() {
  return (
    <span
      title="Illustrative sample data — live feed connects in a later phase"
      className="rounded-token-sm border border-border-strong bg-bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-faint"
    >
      Sample
    </span>
  );
}
