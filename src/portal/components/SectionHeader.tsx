import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { MockBadge } from './StatusPill';

interface SectionHeaderProps {
  title: string;
  icon?: LucideIcon;
  /** Renders the "Sample data" chip when a section is backed by MockService. */
  isMock?: boolean;
  action?: ReactNode;
}

/** Consistent card/section title row: icon + label, optional mock chip + action. */
export function SectionHeader({ title, icon: Icon, isMock, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-accent" />}
        <h2 className="text-sm font-bold text-text-primary">{title}</h2>
        {isMock && <MockBadge />}
      </div>
      {action}
    </div>
  );
}
