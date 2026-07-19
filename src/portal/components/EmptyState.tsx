import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
  compact?: boolean;
}

/** Consistent, calm empty state for sections with no data yet. */
export function EmptyState({ icon: Icon, title, hint, compact = false }: EmptyStateProps) {
  return (
    <div className={`text-center ${compact ? 'py-8' : 'py-14'}`}>
      <Icon className="mx-auto mb-3 h-7 w-7 text-border-strong" />
      <p className="text-sm text-text-secondary">{title}</p>
      {hint && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
    </div>
  );
}
