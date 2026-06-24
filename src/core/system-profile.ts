import os from 'node:os';
import type { SystemProfile } from './types.js';

/**
 * Returns the recommended max workers based on available system resources.
 * Formula: max(1, min(floor(freeMemMB / 400), cpuCores - 1, 30))
 * where freeMemMB = freeMemBytes / (1024 * 1024)
 *
 * This is the **CANONICAL RUNTIME** worker-count algorithm: free-memory + cpu
 * based, surfaced via {@link getSystemProfile}'s `recommendedMaxWorkers` and
 * consumed by `config.ts::resolveEffectiveWorkers` to size each sprint's worker
 * pool. It is distinct from the init-time, total-RAM-tier suggestion in
 * `system-capacity.ts::suggestMaxWorkersFromCapacity` (the persisted-config seed
 * shown by `deckent init`) and from `host-detector.ts`'s per-worker RAM budget.
 */
export function calcRecommendedMaxWorkers(freeMemMB: number, cpuCores: number): number {
  const byMem = Math.floor(freeMemMB / 400);
  const byCpu = cpuCores - 1;
  return Math.max(1, Math.min(byMem, byCpu, 30));
}

/**
 * Collects system resource information and computes a recommended worker count.
 */
export function getSystemProfile(): SystemProfile {
  const cpuCores = os.cpus().length;
  const totalMemMB = Math.floor(os.totalmem() / (1024 * 1024));
  const freeMemMB = Math.floor(os.freemem() / (1024 * 1024));
  const recommendedMaxWorkers = calcRecommendedMaxWorkers(freeMemMB, cpuCores);

  return {
    cpuCores,
    totalMemMB,
    freeMemMB,
    recommendedMaxWorkers,
  };
}
