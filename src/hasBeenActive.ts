import { signal, type ReadonlySignal } from '@preact/signals-core'

/**
 * Returns a read-only signal that flips to `true` the first time the user
 * performs any “activation” gesture (keydown, pointer-down, …).
 *
 * SSR-safe: if `window` is undefined it just returns `false` (you can hydrate
 * later on the client).
 */
export function createHasBeenActiveSignal(): ReadonlySignal<boolean> {
  const active = signal(
    // navigator.userActivation may be undefined on older browsers / SSR.
    typeof navigator !== 'undefined' && navigator.userActivation
      ? navigator.userActivation.hasBeenActive
      : false,
  )

  if (typeof window !== 'undefined' && !active.peek()) {
    const events = [
      'keydown',
      'mousedown',
      'touchstart',
      'pointerdown',
    ] as const

    const onActivate = () => {
      active.value = true
      // clean up every listener once the job is done
      events.forEach((ev) => window.removeEventListener(ev, onActivate))
    }

    events.forEach((ev) =>
      window.addEventListener(ev, onActivate, { once: true }),
    )
  }

  return active
}

/* Optional helper: a singleton so callers don’t need to remember to reuse one. */
export const hasBeenActive = createHasBeenActiveSignal()
