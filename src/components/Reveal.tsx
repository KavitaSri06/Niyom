import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

/**
 * Motion primitives shared across the public site.
 *
 *  <Reveal>   — fades + lifts children in when they scroll into view (once).
 *  <Counter>  — counts a number up from 0 the first time it becomes visible.
 *
 * Both honour `prefers-reduced-motion` by rendering the final state instantly,
 * and both use a single IntersectionObserver per instance that disconnects
 * after firing, so they add no ongoing scroll cost.
 */

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fires `onShow` once, the first time `ref` enters the viewport. */
function useInView<T extends Element>(onShow: () => void, rootMargin = '0px 0px -10% 0px') {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) {
      onShow();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onShow();
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
    // onShow is stable enough for this one-shot; intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

interface RevealProps {
  children: ReactNode;
  /** Stagger delay in ms. */
  delay?: number;
  className?: string;
  as?: ElementType;
}

export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }: RevealProps) {
  const [shown, setShown] = useState(false);
  const ref = useInView<HTMLElement>(() => setShown(true));
  return (
    <Tag
      ref={ref as never}
      className={`reveal ${shown ? 'is-visible' : ''} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}

interface CounterProps {
  value: number;
  /** Rendered before the number, e.g. "₹". */
  prefix?: string;
  /** Rendered after the number, e.g. "+", "%". */
  suffix?: string;
  decimals?: number;
  durationMs?: number;
  className?: string;
}

export function Counter({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  durationMs = 1600,
  className = '',
}: CounterProps) {
  const [display, setDisplay] = useState(0);
  const ref = useInView<HTMLSpanElement>(() => {
    if (prefersReduced()) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — quick then settles, a premium counter feel.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) requestAnimationFrame(tick);
      else setDisplay(value);
    };
    requestAnimationFrame(tick);
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display.toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
