import { Hammer, type LucideIcon } from 'lucide-react';
import { Card } from '../components/Card';

interface PlaceholderPageProps {
  title: string;
  icon?: LucideIcon;
  phase?: string;
}

/**
 * Elegant "in development" surface for views scaffolded but not yet built out.
 * Keeps navigation honest and dead-end-free until each phase lands.
 */
export function PlaceholderPage({ title, icon: Icon = Hammer, phase }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-lg py-16">
      <Card padding="lg" className="text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-token-xl bg-accent/10">
          <Icon className="h-6 w-6 text-accent" />
        </span>
        <h2 className="font-display text-xl font-bold text-text-primary">{title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-text-secondary">
          This module is being crafted with the same care as your dashboard.
          {phase ? ` Arriving in ${phase}.` : ' Coming soon.'}
        </p>
      </Card>
    </div>
  );
}
