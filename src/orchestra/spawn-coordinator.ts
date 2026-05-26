/**
 * Spawn Coordinator — Adaptive max_workers wire-point (Sprint 194 Task 194-005).
 *
 * Bridges the pure host-detector helpers (src/core/host-detector.ts) with
 * the spawn pipeline. The intent expressed in the W-M M-3 task is "startup
 * tespit → suggestMaxWorkers if config max_workers is missing/auto", which
 * this module realises as a callable function rather than an implicit
 * side-effect; that keeps the wire testable.
 *
 * The legacy auto-resolution path
 * (`sprint-utils.ts::resolveMaxWorkersNumeric` →
 * `system-profile.ts::getSystemProfile`) is intentionally untouched in this
 * task — that file is outside the task's filesWrite scope. A follow-up
 * sprint can swap the formula by routing the same call through
 * {@link resolveAutoMaxWorkers}. Until then, this module is the canonical
 * entry-point for callers that want WSL2-aware sizing (such as
 * `deckent doctor --memory`).
 */

import {
  DEFAULT_WORKER_MEM_GB,
  detectHostMemory,
  suggestMaxWorkers,
  type HostMemoryDetection,
} from '../core/host-detector.js';

/**
 * Cached detection — `/proc/meminfo` does not change during a process
 * lifetime, so we read once and reuse. Tests can reset via
 * {@link _resetSpawnCoordinatorCache} (underscored to signal "test seam").
 */
let cachedDetection: HostMemoryDetection | null = null;

/**
 * Returns the cached host memory reading, performing the detection lazily
 * on first call. The detection itself is documented in
 * {@link detectHostMemory}.
 */
export function getDetectedHostMemory(): HostMemoryDetection {
  if (cachedDetection === null) {
    cachedDetection = detectHostMemory();
  }
  return cachedDetection;
}

/** Test seam — clears the cache so repeated detections can be exercised. */
export function _resetSpawnCoordinatorCache(): void {
  cachedDetection = null;
}

/**
 * Resolve `max_workers` for the active spawn pipeline.
 *
 * Behaviour:
 *   - If `configured` is a number, it wins (operator override is respected).
 *   - If `configured` is `'auto'` or `undefined`, the host RAM is detected
 *     once and {@link suggestMaxWorkers} produces the recommendation using
 *     the per-worker budget (default 2 GB, matches `worker_memory_limit`).
 *
 * The return value is always clamped to a positive integer by
 * `suggestMaxWorkers` so spawn callers never see zero workers.
 */
export function resolveAutoMaxWorkers(
  configured: number | 'auto' | undefined,
  workerMemGB: number = DEFAULT_WORKER_MEM_GB,
): number {
  if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }
  const detection = getDetectedHostMemory();
  return suggestMaxWorkers(detection.totalGB, workerMemGB);
}
