import { useCallback, useEffect, useRef } from 'react';

// High-resolution signature pad shared by the public Deal Confirmation and
// Debit Note signing pages. The drawing buffer is sized to the *displayed*
// dimensions × devicePixelRatio × an oversample factor, while the drawing
// context is transformed to CSS-pixel space. This keeps strokes aligned to the
// pointer (regardless of responsive width) and exports a crisp, print-quality
// PNG that no longer blurs when scaled in the signed PDF.
const SIG_OVERSAMPLE = 2;

export default function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || 520;
    const cssH = rect.height || 160;
    const ratio = (window.devicePixelRatio || 1) * SIG_OVERSAMPLE;
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
    // Map drawing units to CSS pixels so pointer coords line up 1:1.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
  }, []);

  useEffect(() => {
    initCanvas();
    // Re-init on resize only when the pad is still empty, so we never wipe a
    // signature the client has already drawn.
    const onResize = () => { if (!hasInk.current) initCanvas(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [initCanvas]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    hasInk.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) onChange(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    initCanvas();
    hasInk.current = false;
    onChange(null);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        style={{ width: '100%', maxWidth: 520, height: 160, border: '1px solid #d4d4d8', borderRadius: 10, touchAction: 'none', background: '#fff', cursor: 'crosshair' }}
      />
      <button onClick={clear} type="button" style={{ marginTop: 8, fontSize: 13, color: '#6b7280', textDecoration: 'underline' }}>
        Clear signature
      </button>
    </div>
  );
}
