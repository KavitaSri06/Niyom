// Renders children into document.body so a position:fixed overlay always anchors
// to the viewport — never trapped inside a transformed/scrolling ancestor (which
// would push a "centered" modal far down a long page). Locks body scroll while open.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function Portal({ children }: { children: React.ReactNode }) {
  const [el] = useState(() => document.createElement('div'));
  useEffect(() => {
    document.body.appendChild(el);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; document.body.removeChild(el); };
  }, [el]);
  return createPortal(children, el);
}
