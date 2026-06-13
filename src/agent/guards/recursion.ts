// src/agent/guards/recursion.ts
// ═══ Recursion guard (SP-1 §8) ══════════════════════════════════════════════
// Caps the model→tool→model loop so a runaway tool cycle cannot spin forever.
// (The cross-process terminal→sprint→worker depth is a future extension via an
// env-propagated counter; this cut bounds the in-loop iteration count.)

export const DEFAULT_MAX_ITERATIONS = 25;

/** True once the loop has run more than `max` model round-trips this turn. */
export function recursionExceeded(iterations: number, max: number = DEFAULT_MAX_ITERATIONS): boolean {
  return iterations > max;
}
