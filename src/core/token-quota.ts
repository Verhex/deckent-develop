// ═══ Token Quota / Throttle Helpers ════════════════════════════════
// Pre-spawn quota gate + inter-worker throttle helpers.
//
// Wraps `computeBackoff` + `parseRateLimitHeaders` from anthropic-http-client.ts
// so callers (sprint-spawner.ts) don't reach into HTTP-layer internals and so
// the dead-code path of `computeBackoff` becomes live (Sprint 198 30k tpm
// felaketi mitigasyonu).
//
// Sprint 202 Task 202-004.
// ADR-010 compliant: pure functions, no new runtime deps, no I/O.

import { computeBackoff, type RateLimitState } from './anthropic-http-client.js';

/**
 * Decide whether a new worker spawn (or API call) should be throttled based on
 * the most recent Anthropic rate-limit header snapshot.
 *
 * Returns true when `computeBackoff` would emit a positive wait — i.e. one of:
 *   - explicit `retry-after` (429)
 *   - RPM remaining < 2
 *   - input-tokens remaining < estimatedTokens × 1.2
 *
 * @param state - Last observed rate-limit state (null when no API call has
 *                happened yet — caller still throttles by config floor).
 * @param estimatedTokens - Forecast input tokens for the next call (default 0).
 * @returns true when a positive backoff is recommended.
 */
export function shouldThrottle(
  state: RateLimitState | null,
  estimatedTokens = 0,
): boolean {
  if (state === null) return false;
  return computeBackoff(state, estimatedTokens) > 0;
}

/**
 * Compute the next delay in milliseconds before spawning the next worker.
 *
 * Resolution order:
 *   1. If `state` is non-null and `computeBackoff` returns a positive number
 *      of seconds, prefer that (converted to ms). This honours retry-after
 *      and exhausted-quota signals.
 *   2. Otherwise fall back to `throttleFloorMs` (the configured pacing knob,
 *      `config.token_throttle_ms`).
 *
 * The two paths are combined with `Math.max` so a small floor cannot suppress
 * a larger backoff dictated by the API.
 *
 * @param state - Last observed rate-limit state (null when unknown).
 * @param estimatedTokens - Forecast input tokens for the next call (default 0).
 * @param throttleFloorMs - Minimum pacing delay in ms (default 0 = no floor).
 * @returns Non-negative delay in milliseconds.
 */
export function nextDelayMs(
  state: RateLimitState | null,
  estimatedTokens = 0,
  throttleFloorMs = 0,
): number {
  const backoffMs = state === null
    ? 0
    : computeBackoff(state, estimatedTokens) * 1000;
  const floor = Math.max(0, throttleFloorMs);
  return Math.max(floor, backoffMs);
}

/**
 * Sleep for `ms` milliseconds. Returns immediately when ms <= 0.
 * Built on `setTimeout` (Node built-in) — ADR-010 compliant.
 */
export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Re-export so callers can stay decoupled from anthropic-http-client.ts.
export { computeBackoff };
export type { RateLimitState };
