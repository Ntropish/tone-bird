import { ReadonlySignal } from '@preact/signals-core';
/**
 * Returns a read-only signal that flips to `true` the first time the user
 * performs any “activation” gesture (keydown, pointer-down, …).
 *
 * SSR-safe: if `window` is undefined it just returns `false` (you can hydrate
 * later on the client).
 */
export declare function createHasBeenActiveSignal(): ReadonlySignal<boolean>;
export declare const hasBeenActive: ReadonlySignal<boolean>;
