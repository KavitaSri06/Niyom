import { Star } from 'lucide-react';

/** 1–5 star rating in gold. */
export function RatingStars({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < rating ? 'text-accent' : 'text-border-strong'}
          fill={i < rating ? 'var(--accent)' : 'none'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}
