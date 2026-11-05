'use client';

import { useLayoutEffect, useRef } from 'react';

// Keep the controls visually anchored while the new step takes its natural height.
export function useLayoutMotion(layoutKey: number) {
  const element = useRef<HTMLDivElement>(null);
  const previousTop = useRef<number | null>(null);
  const animation = useRef<Animation | null>(null);

  function capture() {
    const node = element.current;
    if (node && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      previousTop.current = node.getBoundingClientRect().top + window.scrollY;
    }
  }

  useLayoutEffect(() => {
    const node = element.current;
    const before = previousTop.current;
    previousTop.current = null;
    animation.current?.cancel();
    if (!node || before === null || typeof node.animate !== 'function') return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const delta = before - node.getBoundingClientRect().top - window.scrollY;
    if (Math.abs(delta) < 1) return;
    // Limit travel so the controls never start far outside the incoming form.
    const distance = Math.max(-56, Math.min(56, delta));
    const spring = getComputedStyle(node).getPropertyValue('--zen-spring').trim();
    const movement = node.animate(
      [{ transform: `translate3d(0, ${distance}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
      { duration: 420, easing: spring },
    );

    animation.current = movement;
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const cancelIfReduced = () => { if (preference.matches) animation.current?.cancel(); };
    preference.addEventListener('change', cancelIfReduced);
    return () => {
      movement.cancel();
      preference.removeEventListener('change', cancelIfReduced);
    };
  }, [layoutKey]);

  return { element, capture };
}
