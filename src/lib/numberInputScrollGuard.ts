// Stop a focused <input type="number"> from being silently edited by scroll.
//
// Browsers treat a wheel/trackpad gesture over a FOCUSED number input as an
// increment/decrement. On a laptop trackpad this fires constantly: you type a
// rate, brush the trackpad while reading the rest of the form, and the value
// has quietly changed underneath you. Nothing on screen suggests an edit
// happened.
//
// The damage is real money. A deal rate field carries step="0.01", so four
// stray ticks turned 2050 into 2049.96 — the deal then settled at ₹2,04,996
// instead of ₹2,05,000, and that figure flows on into MIS. It looks random
// because it depends on whether the cursor happened to be over the field.
//
// This is installed once, at the document level, rather than as an onWheel on
// each of the ~52 number inputs in the app: a per-field fix would miss any
// field added later, and this class of bug is silent when it regresses.
//
// Behaviour: the first wheel event over a focused number input is swallowed and
// the field is blurred, so the value cannot change. Focus is released, so the
// user's next scroll scrolls the page as normal. Typing, arrow keys and the
// spinner buttons are untouched — only the accidental gesture is blocked.

export function installNumberInputScrollGuard(): void {
  document.addEventListener(
    'wheel',
    (e) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement &&
        el.type === 'number' &&
        el === e.target &&
        !el.readOnly &&
        !el.disabled
      ) {
        // Blur first so the browser has no focused number input to apply the
        // default increment to, then cancel this gesture outright. Requires a
        // non-passive listener for preventDefault to be honoured.
        el.blur();
        e.preventDefault();
      }
    },
    { passive: false },
  );
}
