/**
 * System Capacity Auto-Detection MVP
 *
 * Detects hardware capabilities and suggests optimal config values.
 * Sprint 150 MVP — Sprint 151+ will add GPU, network, disk quota detection.
 */

import { totalmem, freemem, cpus, platform } from 'node:os';
import { spawnSync } from 'node:child_process';

// ─── Types ──────────────────────────────────────────────────────────

export interface SystemCapacity {
  /** Total system RAM in GB */
  totalRamGB: number;
  /** Free (available) system RAM in GB */
  freeRamGB: number;
  /** Number of logical CPU cores */
  cpuCores: number;
  /** Whether Docker CLI is available and responsive */
  dockerAvailable: boolean;
  /** OS platform identifier */
  platform: NodeJS.Platform;
}

// ─── Detection ──────────────────────────────────────────────────────

/**
 * Detect current system capacity.
 * All detection is synchronous and best-effort — failures return safe defaults.
 */
export function detectSystemCapacity(): SystemCapacity {
  const totalBytes = totalmem();
  const freeBytes = freemem();
  const cores = cpus().length;
  const plat = platform();

  let dockerAvailable = false;
  try {
    const result = spawnSync('docker', ['--version'], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    dockerAvailable = result.status === 0 && (result.stdout?.includes('Docker') ?? false);
  } catch {
    // Docker not available — expected on many systems
  }

  return {
    totalRamGB: Math.round((totalBytes / 1e9) * 10) / 10,
    freeRamGB: Math.round((freeBytes / 1e9) * 10) / 10,
    cpuCores: cores,
    dockerAvailable,
    platform: plat,
  };
}

// ─── Suggestions ────────────────────────────────────────────────────

/**
 * Suggest an **init-time** `max_workers` value from total system capacity.
 *
 * This is the conservative, TOTAL-RAM-tier suggestion used by the `deckent init`
 * wizard to seed a durable `max_workers` value into `config.json`. It is one of
 * three deliberately-distinct worker-sizing helpers — do not conflate them:
 *
 *   - {@link suggestMaxWorkersFromCapacity} (here) — INIT-TIME, total-RAM tiers,
 *     conservative; the persisted config default shown to the user.
 *   - `system-profile.ts::calcRecommendedMaxWorkers(freeMemMB, cpuCores)` —
 *     the **CANONICAL RUNTIME** algorithm: free-memory + cpu based, consumed by
 *     `config.ts::resolveEffectiveWorkers` to decide how many workers to spawn now.
 *   - `host-detector.ts::suggestMaxWorkers(totalGB, workerMemGB)` — a different
 *     concern entirely: per-worker RAM *budget* (floor(totalGB/workerMemGB)-1).
 *
 * Renamed from `suggestMaxWorkers` (sprint-322 R-MAXWORKERS-CANONICAL) to remove
 * the bare-name collision with `host-detector::suggestMaxWorkers` and to make the
 * canonical-vs-init distinction explicit at every call-site.
 *
 * Heuristic (total RAM):
 *   <4GB RAM  → 1 worker
 *   4-8GB     → 2 workers
 *   8-16GB    → 3-4 workers (CPU-dependent)
 *   >16GB     → min(max(cpuCores - 2, 2), 8)
 */
export function suggestMaxWorkersFromCapacity(cap: SystemCapacity): number {
  if (cap.totalRamGB < 4) return 1;
  if (cap.totalRamGB < 8) return 2;
  if (cap.totalRamGB < 16) {
    return cap.cpuCores >= 8 ? 4 : 3;
  }
  // >16GB: scale with cores, cap at 8
  return Math.min(Math.max(cap.cpuCores - 2, 2), 8);
}

/**
 * @deprecated Backward-compat alias for {@link suggestMaxWorkersFromCapacity}.
 * Retained only for the out-of-scope caller `src/cli/commands/init-steps.ts`
 * (this task's scope is `src/core/` + `tests/`). A follow-up cli-scoped task
 * should migrate that caller to {@link suggestMaxWorkersFromCapacity} and then
 * remove this alias, finishing the disambiguation. Identical behavior.
 */
export const suggestMaxWorkers = suggestMaxWorkersFromCapacity;

/**
 * Suggest optimal spawn backend based on system capacity.
 *
 * Heuristic:
 *   win32         → 'subprocess' (no tmux, Docker support varies)
 *   Docker avail  → 'docker' (best isolation)
 *   default       → 'subprocess'
 */
export function suggestSpawnBackend(cap: SystemCapacity): 'docker' | 'subprocess' | 'tmux' {
  if (cap.platform === 'win32') return 'subprocess';
  if (cap.dockerAvailable) return 'docker';
  return 'subprocess';
}
