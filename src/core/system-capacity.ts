/**
 * System Capacity Auto-Detection MVP
 *
 * Detects hardware capabilities and suggests optimal config values.
 * Sprint 150 MVP — Sprint 151+ will add GPU, network, disk quota detection.
 */

import { totalmem, freemem, cpus, platform } from 'node:os';
import { spawnSync, spawn as nodeSpawn } from 'node:child_process';

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

// ─── Docker Daemon Probe (RC2-B / INIT-02, Sprint 412 — 412-002) ─────

/** Minimal async child-process shape used by {@link probeDockerDaemon} — mockable in tests. */
export interface DaemonProbeProcessLike {
  on(event: 'close', listener: (code: number | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill?(signal?: NodeJS.Signals | number): boolean;
}

/** Injectable async spawn for {@link probeDockerDaemon} — defaults to node:child_process spawn. */
export type DaemonSpawnImpl = (command: string, args: string[]) => DaemonProbeProcessLike;

const DOCKER_DAEMON_PROBE_TIMEOUT_MS = 4_000;

/**
 * Probe docker DAEMON reachability via async `docker info` — deliberately a
 * SEPARATE signal from the CLI-presence probe in {@link detectSystemCapacity}
 * (`docker --version`, synchronous). A host can have the CLI installed while
 * the daemon is dead (Docker Desktop not started, dockerd crashed, socket
 * permission denied) — conflating the two let `spawn_backend: docker` get
 * written for a daemon that will never answer a worker's first `docker run`.
 * Timeout-bounded (never hangs init) and injectable (never depends on a real
 * docker install in tests). Any spawn error, non-zero exit, or timeout
 * resolves `false` — this never throws.
 */
export function probeDockerDaemon(spawnImpl?: DaemonSpawnImpl): Promise<boolean> {
  const spawn: DaemonSpawnImpl = spawnImpl ?? ((command, args) => nodeSpawn(command, args, { stdio: 'ignore' }));
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child: DaemonProbeProcessLike;
    try {
      child = spawn('docker', ['info']);
    } catch {
      done(false);
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill?.();
      } catch {
        // best-effort — we're already resolving false
      }
      done(false);
    }, DOCKER_DAEMON_PROBE_TIMEOUT_MS);
    timer.unref?.();

    child.on('error', () => {
      clearTimeout(timer);
      done(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done(code === 0);
    });
  });
}

/** Result of a transactional backend decision — see {@link decideSpawnBackendTransaction}. */
export interface SpawnBackendDecision {
  backend: 'docker' | 'subprocess' | 'tmux';
  /** True when the CLI-only suggestion was 'docker' but the daemon probe failed — downgraded to subprocess. */
  daemonDowngraded: boolean;
}

/**
 * Transactional backend decision (RC2-B / INIT-02): docker is chosen ONLY when
 * BOTH signals are alive — the CLI-based heuristic ({@link suggestSpawnBackend})
 * says docker AND the caller's independent daemon probe ({@link probeDockerDaemon})
 * confirmed it. CLI-present-daemon-dead never returns 'docker' — it downgrades
 * to 'subprocess' and flags `daemonDowngraded` so the caller can surface an
 * honest, actionable message instead of silently writing a broken config.
 */
export function decideSpawnBackendTransaction(
  cap: SystemCapacity,
  daemonAvailable: boolean,
): SpawnBackendDecision {
  const cliSuggestion = suggestSpawnBackend(cap);
  if (cliSuggestion === 'docker' && !daemonAvailable) {
    return { backend: 'subprocess', daemonDowngraded: true };
  }
  return { backend: cliSuggestion, daemonDowngraded: false };
}
