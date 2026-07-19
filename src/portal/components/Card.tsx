import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Adds the subtle hover-lift used across the portal. */
  interactive?: boolean;
  /** Gold-accented left edge for hero/emphasis cards. */
  accent?: boolean;
  padding?: 'sm' | 'md' | 'lg' | 'none';
}

const PAD: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

/**
 * The single card surface for the whole portal. Mirrors the existing portal card
 * treatment (elevated bg, hairline border, token card-shadow, xl radius) so new
 * sections are visually indistinguishable from what already shipped.
 */
export function Card({
  children,
  className = '',
  interactive = false,
  accent = false,
  padding = 'lg',
}: CardProps) {
  return (
    <div
      className={`relative rounded-token-xl border border-border bg-bg-elevated shadow-token-card ${
        interactive ? 'lift' : ''
      } ${PAD[padding]} ${className}`}
    >
      {accent && (
        <span
          aria-hidden
          className="absolute left-0 top-5 bottom-5 w-1 rounded-full bg-accent"
        />
      )}
      {children}
    </div>
  );
}
