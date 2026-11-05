'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './magnetic-action.module.css';

const proximity = 18;
const stiffness = 220;
const damping = 23;
const mass = 1.1;

export default function MagneticAction({ children }: { children: ReactNode }) {
  const scope = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = scope.current;
    if (!node?.parentElement) return;
    const zone = node;
    const region = node.parentElement;
    const action = zone.querySelector('button, a');
    const preference = matchMedia('(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)');
    const x = { position: 0, velocity: 0, target: 0 };
    const y = { position: 0, velocity: 0, target: 0 };
    let frame = 0;
    let previousTime = 0;
    let pointer: { x: number; y: number } | null = null;

    function reset() {
      cancelAnimationFrame(frame);
      frame = previousTime = 0;
      pointer = null;
      for (const axis of [x, y]) axis.position = axis.velocity = axis.target = 0;
      zone.style.removeProperty('--magnet-x');
      zone.style.removeProperty('--magnet-y');
      zone.style.removeProperty('--light-x');
      zone.style.removeProperty('--light-y');
      delete zone.dataset.illuminated;
    }

    function tick(time: number) {
      const elapsed = previousTime ? Math.min((time - previousTime) / 1000, 1 / 30) : 1 / 60;
      // Bound each integration step so slower frames don't destabilize the spring.
      const iterations = elapsed > 1 / 60 ? 2 : 1;
      const dt = elapsed / iterations;
      previousTime = time;
      if (pointer) {
        // The stationary wrapper supplies geometry even when the button is moving.
        const bounds = zone.getBoundingClientRect();
        const dx = pointer.x - (bounds.left + bounds.width / 2);
        const dy = pointer.y - (bounds.top + bounds.height / 2);
        const reachX = bounds.width / 2 + proximity;
        const reachY = bounds.height / 2 + proximity;
        if (Math.abs(dx) > reachX || Math.abs(dy) > reachY) {
          x.target = y.target = 0;
          delete zone.dataset.illuminated;
        } else {
          const weight = Math.max(0, 1 - Math.hypot(dx / reachX, dy / reachY) / Math.SQRT2);
          x.target = (dx / reachX) * 10 * weight;
          y.target = (dy / reachY) * 10 * weight;
          zone.style.setProperty('--light-x', `${Math.round(dx)}px`);
          zone.style.setProperty('--light-y', `${Math.round(dy)}px`);
          zone.dataset.illuminated = 'true';
        }
        pointer = null;
      }

      let moving = false;
      for (const axis of [x, y]) {
        for (let index = 0; index < iterations; index++) {
          const force = stiffness * (axis.target - axis.position) - damping * axis.velocity;
          axis.velocity += (force / mass) * dt;
          axis.position += axis.velocity * dt;
        }
        if (Math.abs(axis.target - axis.position) > .02 || Math.abs(axis.velocity) > .1) {
          moving = true;
        } else {
          axis.position = axis.target;
          axis.velocity = 0;
        }
      }
      zone.style.setProperty('--magnet-x', `${x.position.toFixed(2)}px`);
      zone.style.setProperty('--magnet-y', `${y.position.toFixed(2)}px`);
      frame = moving ? requestAnimationFrame(tick) : 0;
      if (!frame) previousTime = 0;
    }

    function onMove(event: PointerEvent) {
      if (!preference.matches || event.pointerType !== 'mouse' || event.buttons || action?.matches(':disabled, :focus-visible')) return;
      pointer = { x: event.clientX, y: event.clientY };
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function release() {
      pointer = null;
      x.target = y.target = 0;
      delete zone.dataset.illuminated;
      if (!frame && (x.position || y.position)) frame = requestAnimationFrame(tick);
    }

    region.addEventListener('pointermove', onMove);
    region.addEventListener('pointerleave', release);
    region.addEventListener('pointercancel', release);
    zone.addEventListener('pointerdown', release);
    zone.addEventListener('focusin', release);
    preference.addEventListener('change', reset);
    window.addEventListener('blur', reset);

    return () => {
      region.removeEventListener('pointermove', onMove);
      region.removeEventListener('pointerleave', release);
      region.removeEventListener('pointercancel', release);
      zone.removeEventListener('pointerdown', release);
      zone.removeEventListener('focusin', release);
      preference.removeEventListener('change', reset);
      window.removeEventListener('blur', reset);
      reset();
    };
  }, []);

  return <span ref={scope} className={styles.zone}>
    <span className={styles.glow} aria-hidden="true"/>
    {children}
  </span>;
}
