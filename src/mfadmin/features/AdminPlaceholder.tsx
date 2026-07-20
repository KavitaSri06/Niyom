import { Hammer, type LucideIcon } from 'lucide-react';
import { Card } from '../../portal/components/Card';

/** "In development" surface for admin modules not yet built out. */
export function AdminPlaceholder({ title, icon: Icon = Hammer }: { title: string; icon?: LucideIcon }) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card padding="lg" className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-token-xl bg-accent/10">
          <Icon className="h-6 w-6 text-accent" />
        </span>
        <h2 className="font-display text-xl font-bold text-text-primary">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
          This BSE StAR MF operations module is being built as a native NIYOM workflow. Coming soon.
        </p>
      </Card>
    </div>
  );
}
