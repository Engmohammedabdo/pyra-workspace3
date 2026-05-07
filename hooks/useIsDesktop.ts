'use client';

import { useEffect, useState } from 'react';

/**
 * True when the viewport is at or above Tailwind's `md` breakpoint (768px).
 *
 * Used to gate desktop-only behaviors (e.g. @dnd-kit drag-drop on the CRM
 * pipeline). Matches `matchMedia('(min-width: 768px)')`.
 *
 * SSR-safe: returns `false` during the first render so the server-rendered
 * markup matches the initial client state, then updates after hydration.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
