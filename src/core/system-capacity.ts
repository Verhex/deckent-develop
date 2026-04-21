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
 * Suggest optimal max_workers based on system capacity.
 *
 * Heuristic (MVP):
 *   <4GB RAM  → 1 worker
 *   4-8GB     → 2 workers
 *   8-16GB    → 3-4 workers (CPU-dependent)
 *   >16GB     → min(cpuCores - 2, 8)
 */
export function suggestMaxWorkers(cap: SystemCapacity): number {
  if (cap.totalRamGB < 4) return 1;
  if (cap.totalRamGB < 8) return 2;
  if (cap.totalRamGB < 16) {
    return cap.cpuCores >= 8 ? 4 : 3;
  }
  // >16GB: scale with cores, cap at 8
  return Math.min(Math.max(cap.cpuCores - 2, 2), 8);
}

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
