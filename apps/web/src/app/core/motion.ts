import { type ApplicationRef } from '@angular/core';

/** True when the user asked the system for less motion. */
export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Runs a same-page state change inside a View Transition so named elements
 * morph between the old and the new layout. `vt-local` and `cls` are put on <html> while
 * the transition runs, so CSS can name elements or pick animations for it.
 * Falls back to a plain update when the API is missing or motion is reduced.
 */
export function morph(appRef: ApplicationRef, update: () => void, cls?: string): void {
  if (!('startViewTransition' in document) || reducedMotion()) {
    update();
    return;
  }
  const root = document.documentElement;
  const classes = ['vt-local', ...(cls ? [cls] : [])];
  root.classList.add(...classes);
  const t = document.startViewTransition(() => {
    update();
    appRef.tick();
  });
  void t.finished.finally(() => root.classList.remove(...classes));
}
