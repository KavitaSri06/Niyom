import { useEffect, useRef } from 'react';

/**
 * HeroBackground — GPU-light animated fintech backdrop.
 * -----------------------------------------------------------------------------
 * Replaces stock hero photography with an original "financial network"
 * animation: drifting nodes joined by proximity links, layered over slow
 * mesh-gradient blooms and a faint data grid. Designed for the dark navy
 * hero sections (renders in the brand's navy + gold), so colors are pinned
 * rather than theme-derived.
 *
 * Performance contract:
 *   - Single 2D canvas, DPR capped at 2, node count scales with area then caps.
 *   - requestAnimationFrame loop that PAUSES when the tab is hidden or the hero
 *     scrolls out of view (IntersectionObserver), so it never burns cycles
 *     off-screen.
 *   - `prefers-reduced-motion` → paints one static frame, no loop.
 * The mesh blooms + grid are pure CSS (compositor-friendly); only the network
 * needs the canvas.
 */
export function HeroBackground({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const parent = canvas.parentElement!;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Node = { x: number; y: number; vx: number; vy: number; r: number };
    let nodes: Node[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    let running = false;

    const GOLD = '200, 164, 93';
    const LIGHT = '226, 232, 240';

    const seed = () => {
      const count = Math.min(70, Math.max(22, Math.round((w * h) / 22000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.6 + 0.7,
      }));
    };

    const resize = () => {
      w = parent.clientWidth;
      h = parent.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const linkDist = Math.min(160, w * 0.14);

      // Proximity links first, so nodes sit on top of the web.
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist < linkDist) {
            const alpha = (1 - dist / linkDist) * 0.28;
            ctx.strokeStyle = `rgba(${GOLD}, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.r > 1.6 ? `rgba(${GOLD}, 0.9)` : `rgba(${LIGHT}, 0.55)`;
        ctx.fill();
      }
    };

    const step = () => {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -20) n.x = w + 20;
        else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20;
        else if (n.y > h + 20) n.y = -20;
      }
      draw();
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (running || reduceMotion) return;
      running = true;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    draw(); // paint an initial frame regardless of motion preference

    const ro = new ResizeObserver(() => {
      resize();
      if (!running) draw();
    });
    ro.observe(parent);

    // Pause when off-screen.
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? start() : stop()),
      { threshold: 0.01 },
    );
    io.observe(parent);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);

    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* Base navy wash */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, #061321 0%, #081B33 55%, #0b2544 100%)' }} />
      {/* Mesh blooms — slow drifting gold + blue light */}
      <div className="hb-bloom hb-bloom--gold" />
      <div className="hb-bloom hb-bloom--blue" />
      {/* Faint data grid */}
      <div className="hb-grid absolute inset-0" />
      {/* Animated network */}
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Vignette to seat headline contrast */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(80% 60% at 50% 38%, transparent 0%, rgba(6,16,28,0.35) 78%, rgba(6,16,28,0.7) 100%)',
        }}
      />
    </div>
  );
}
