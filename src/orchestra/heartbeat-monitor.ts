// ═══ Host-Lifecycle Heartbeat Monitor (TT553, task 418-002) ══════════════════
//
// PROBLEM (trace-audit 553): worker liveness has historically been decided by the
// worker's OWN `.hb` file-write DISCIPLINE — either the in-file `hb.timestamp`
// (sprint-checkpoint.ts::isStaleHeartbeat / detectStaleWorkers) or the `.hb` file
// mtime (auditor.ts::isWorkerStale, mtime-PRIMARY). A live worker that fails to
// refresh its `.hb`, or writes a hardcoded timestamp (`2026-07-11T00:00:00.000Z`
// was observed 33× in a single trace), is therefore WRONGLY judged dead and
// killed — the 412-003 phantom-fix chain.
//
// FIX: liveness derives from a HOST signal the OS/backend owns, NOT from whether
// or when the worker wrote a file:
//   - docker      → container state (`docker inspect {{.State.Running}}`)
//   - subprocess  → process-alive (POSIX `kill(pid,0)` / Windows `tasklist`)
//                   + host-captured stdout/stderr `.log` activity (secondary)
//   - tmux        → pane liveness (`tmux list-panes … #{pane_dead}`)
// A single adapter interface ({@link HostLivenessProbe}) with the platform
// branches INSIDE it (Yasa #2 — the full matrix up front, Windows branch honest,
// never "this platform first, the rest later").
//
// The `.hb` file stays BACKWARD-COMPATIBLE — every existing reader keeps parsing
// it — but it is now only a `currentAction` CARRIER: {@link decideWorkerLiveness}
// NEVER reads `hb.timestamp`/mtime for the verdict, so a stale/hardcoded timestamp
// can no longer produce a wrong-kill (see host-lifecycle-heartbeat.test.ts RED→GREEN).
// When a kill IS warranted the decision NAMES which host signal died
// ({@link formatKillDecisionLog}).
//
// SCOPE HONESTY (task 418-002): the two PRODUCTION kill paths that still consult
// file-mtime/timestamp — `auditor.ts::isWorkerStale` and
// `sprint-checkpoint.ts::isStaleHeartbeat`/`detectStaleWorkers` — are OUT of this
// task's write scope. This module is the canonical host-primary decision they are
// meant to adopt; that migration is a tracked follow-up (see .result docImpact),
// not done here.

import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { join } from 'node:path';
import type { Heartbeat } from '../core/types.js';
// SSOT: the host-captured HB/log freshness window (90s) is shared with the
// sibling 5-layer liveness check so the two systems never drift apart.
import { LIVENESS_FRESHNESS_MS } from './worker-liveness.js';
// SSOT: the container-name prefix the docker backend actually uses to
// `docker run --name` / `docker wait` — deriving it from the same constant means
// the probe can never target a differently-named container than the backend spawns.
import { CONTAINER_PREFIX } from './spawn-backend-docker.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** The spawn backend a worker runs under — selects which host probe applies. */
export type WorkerBackendKind = 'docker' | 'tmux' | 'subprocess';

/**
 * The host signal a liveness verdict is grounded in. `log-activity` is the
 * within-backend SECONDARY signal (host-captured stdout/stderr freshness); the
 * other three are the PRIMARY per-backend signals.
 */
export type LivenessSignalName = 'container-state' | 'process-pid' | 'tmux-pane' | 'log-activity';

/**
 * Everything the host probe needs to judge a worker — ALL derivable from spawn
 * state, NONE from the worker's `.hb` freshness. `docker`/`tmux` need only the
 * `taskId`/`workerId` (the container/window name is derived); `subprocess` uses
 * `pid` when available and falls back to `.log` activity (via `tasksDir`) honestly.
 */
export interface LivenessTarget {
  backend: WorkerBackendKind;
  taskId: string;
  workerId: string;
  /** subprocess only — the worker process id (POSIX kill/Windows tasklist probe). */
  pid?: number;
  /** project `.tasks/` dir — enables the host-captured `.log`-activity secondary. */
  tasksDir?: string;
}

/** Outcome of a host-liveness decision. */
export interface HostLivenessVerdict {
  /** True ⇒ the worker is alive by a HOST signal — do NOT kill regardless of `.hb`. */
  alive: boolean;
  /** The signal that grounded this verdict (primary for the backend, or `log-activity`). */
  signal: LivenessSignalName;
  /** Only when `alive===false` — the PRIMARY host signal found absent (for the kill log). */
  deadSignal?: LivenessSignalName;
  /** Human-readable diagnostic — always present. */
  reason: string;
}

/**
 * Injectable probe primitives — the test seam. Every default is a real host
 * call; tests inject deterministic stand-ins so they never spawn a real
 * docker/tmux/OS process (hermetic, matching worker-liveness.test.ts).
 */
export interface HostProbeDeps {
  /** docker → is container `<name>` in the Running state. */
  isDockerContainerRunning?: (containerName: string) => boolean;
  /** subprocess → is process `<pid>` alive (POSIX kill(0) / Windows tasklist). */
  isProcessAlive?: (pid: number) => boolean;
  /** tmux → is the window/pane `<target>` alive (not dead). */
  isTmuxPaneAlive?: (windowTarget: string) => boolean;
  /** Clock seam (default Date.now) — used only for the `.log`-activity secondary. */
  now?: () => number;
  /** Platform seam (default process.platform) — selects the subprocess pid-probe branch. */
  platform?: NodeJS.Platform;
}

/** A backend-dispatched host-liveness probe. */
export interface HostLivenessProbe {
  probe(target: LivenessTarget): HostLivenessVerdict;
}

// ─── Name derivation (SSOT) ──────────────────────────────────────────────────

/** Container name for a task — `deckent-w-<taskId>`, same as `docker run --name`. */
export function dockerContainerName(taskId: string): string {
  return `${CONTAINER_PREFIX}${taskId}`;
}

/** tmux window/pane target for a worker — the workerId (`w-<taskId>`). */
export function tmuxWindowTarget(workerId: string): string {
  return workerId;
}

// ─── Default real host probes (all injectable) ───────────────────────────────

const DOCKER_PROBE_TIMEOUT_MS = 3000;
const TMUX_PROBE_TIMEOUT_MS = 3000;
const TASKLIST_PROBE_TIMEOUT_MS = 5000;

/** docker container-state probe — `docker inspect -f {{.State.Running}} <name>` === "true". */
function defaultDockerRunning(containerName: string): boolean {
  try {
    const res = spawnSync(
      'docker',
      ['inspect', '-f', '{{.State.Running}}', containerName],
      { encoding: 'utf-8', timeout: DOCKER_PROBE_TIMEOUT_MS },
    );
    if (res.status !== 0 || typeof res.stdout !== 'string') return false;
    return res.stdout.trim() === 'true';
  } catch {
    return false; // fail-closed — probe error ⇒ treat as not-running
  }
}

/**
 * POSIX process-alive probe: `process.kill(pid, 0)` sends no signal, it only
 * checks existence. Throws ESRCH when the pid is gone (⇒ dead), EPERM when the
 * process exists but is owned by another user (⇒ alive — existence is what we
 * asked). No subprocess spawned.
 */
export function isProcessAlivePosix(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'EPERM'; // exists but not ours ⇒ alive; ESRCH/other ⇒ dead
  }
}

/**
 * Windows process-alive probe — honest branch (Yasa #2), NOT a POSIX-only stub.
 * `tasklist /FI "PID eq <pid>" /NH /FO CSV` lists the process when it exists; an
 * absent pid yields the "INFO: No tasks…" line (no CSV row containing the pid).
 * `spawnImpl` is injectable so tests exercise this branch WITHOUT a Windows host.
 */
export function isProcessAliveWindows(
  pid: number,
  spawnImpl: (cmd: string, args: string[]) => SpawnSyncReturns<string> = (cmd, args) =>
    spawnSync(cmd, args, { encoding: 'utf-8', timeout: TASKLIST_PROBE_TIMEOUT_MS }),
): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    const res = spawnImpl('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']);
    if (res.status !== 0 || typeof res.stdout !== 'string') return false;
    // `tasklist /FO CSV /NH` emits one row per match: "image","<pid>","session",…
    // Anchor on the 2nd CSV field so a small pid (e.g. 1) can never false-match
    // the leading digits of the pid field of a larger process (e.g. "…","1234",…)
    // or the session-number field.
    return new RegExp(`^"[^"]*","${pid}"`, 'm').test(res.stdout);
  } catch {
    return false;
  }
}

/** Platform-dispatched subprocess pid-probe: Windows→tasklist, otherwise POSIX kill(0). */
function defaultProcessAlive(pid: number, platform: NodeJS.Platform): boolean {
  return platform === 'win32' ? isProcessAliveWindows(pid) : isProcessAlivePosix(pid);
}

/** tmux pane-liveness probe — a window with at least one non-dead pane is alive. */
function defaultTmuxPaneAlive(windowTarget: string): boolean {
  try {
    const res = spawnSync(
      'tmux',
      ['list-panes', '-t', windowTarget, '-F', '#{pane_dead}'],
      { encoding: 'utf-8', timeout: TMUX_PROBE_TIMEOUT_MS },
    );
    if (res.status !== 0 || typeof res.stdout !== 'string') return false;
    // Any pane reporting `0` (not dead) ⇒ the worker's pane is still alive.
    return res.stdout.split('\n').some((line) => line.trim() === '0');
  } catch {
    return false;
  }
}

// ─── Secondary signal: host-captured `.log` activity ─────────────────────────

/**
 * True when the worker's host-captured `.tasks/task-<id>.log` (the spawn
 * backend writes the provider CLI's stdout/stderr there — NOT the worker's own
 * `.hb`) has been touched within the freshness window. This is a HOST signal:
 * the backend owns the write, so it stays fresh even when the worker never
 * updates its `.hb`. Used only as the subprocess/secondary vote.
 */
export function isLogActivityFresh(
  tasksDir: string | undefined,
  taskId: string,
  now: () => number = () => Date.now(),
  freshnessMs: number = LIVENESS_FRESHNESS_MS,
): boolean {
  if (!tasksDir) return false;
  const logPath = join(tasksDir, `task-${taskId}.log`);
  if (!existsSync(logPath)) return false;
  try {
    return now() - statSync(logPath).mtimeMs < freshnessMs;
  } catch {
    return false;
  }
}

// ─── The adapter ─────────────────────────────────────────────────────────────

/**
 * Build a backend-dispatched {@link HostLivenessProbe}. The platform branches
 * (Windows subprocess, docker, tmux) all live INSIDE `probe()` behind the single
 * interface — a caller never selects a platform, it just hands over a
 * {@link LivenessTarget}. Every host call is injectable via `deps` for hermetic
 * tests.
 */
export function createHostLivenessProbe(deps: HostProbeDeps = {}): HostLivenessProbe {
  const now = deps.now ?? (() => Date.now());
  const platform = deps.platform ?? process.platform;
  const dockerRunning = deps.isDockerContainerRunning ?? defaultDockerRunning;
  const processAlive = deps.isProcessAlive ?? ((pid: number) => defaultProcessAlive(pid, platform));
  const tmuxPaneAlive = deps.isTmuxPaneAlive ?? defaultTmuxPaneAlive;

  return {
    probe(target: LivenessTarget): HostLivenessVerdict {
      switch (target.backend) {
        case 'docker': {
          const name = dockerContainerName(target.taskId);
          let alive = false;
          try {
            alive = dockerRunning(name);
          } catch {
            alive = false; // fail-closed
          }
          return {
            alive,
            signal: 'container-state',
            deadSignal: alive ? undefined : 'container-state',
            reason: `docker container ${name} running=${alive}`,
          };
        }
        case 'tmux': {
          const wt = tmuxWindowTarget(target.workerId);
          let alive = false;
          try {
            alive = tmuxPaneAlive(wt);
          } catch {
            alive = false;
          }
          return {
            alive,
            signal: 'tmux-pane',
            deadSignal: alive ? undefined : 'tmux-pane',
            reason: `tmux window ${wt} pane-alive=${alive}`,
          };
        }
        case 'subprocess': {
          // PRIMARY: process-alive by pid. When the pid is unavailable (a
          // CLI-driven worker whose pid never reached the .hb), fall back HONESTLY
          // to the host-captured .log-activity signal rather than silently
          // declaring the worker dead.
          if (typeof target.pid === 'number') {
            let alive = false;
            try {
              alive = processAlive(target.pid);
            } catch {
              alive = false;
            }
            if (alive) {
              return { alive: true, signal: 'process-pid', reason: `pid ${target.pid} alive` };
            }
            // pid says dead — a fresh host `.log` still proves activity.
            if (isLogActivityFresh(target.tasksDir, target.taskId, now)) {
              return { alive: true, signal: 'log-activity', reason: `pid ${target.pid} gone but .log active` };
            }
            return {
              alive: false,
              signal: 'process-pid',
              deadSignal: 'process-pid',
              reason: `pid ${target.pid} not alive and .log inactive`,
            };
          }
          // No pid — log-activity is the only honest host signal available.
          const logFresh = isLogActivityFresh(target.tasksDir, target.taskId, now);
          return {
            alive: logFresh,
            signal: 'log-activity',
            deadSignal: logFresh ? undefined : 'process-pid',
            reason: logFresh
              ? 'pidUnavailable — .log active (host-captured stdout fresh)'
              : 'pidUnavailable and .log inactive',
          };
        }
        default: {
          // Unknown backend — fail-closed, never silently "alive" (Yasa #2 honest-fail).
          return {
            alive: false,
            signal: 'process-pid',
            deadSignal: 'process-pid',
            reason: `unknown backend "${String(target.backend)}" — no host probe available`,
          };
        }
      }
    },
  };
}

// ─── The decision (host-primary — NEVER reads hb.timestamp/mtime) ────────────

/** Extra secondary inputs for {@link decideWorkerLiveness}. */
export interface LivenessDecisionDeps extends HostProbeDeps {
  /** Reuse an already-built probe (avoids rebuilding closures per call). */
  probe?: HostLivenessProbe;
}

/**
 * Decide whether a worker is alive from its HOST signal — the single authority.
 *
 * This is the inversion at the heart of TT553: the host signal is PRIMARY. The
 * worker's `.hb` timestamp/mtime is NEVER consulted, so a stale or hardcoded
 * `hb.timestamp` cannot cause a wrong-kill as long as the host says the worker
 * is alive. Only when the host PRIMARY signal is absent does a host-captured
 * `.log`-activity SECONDARY get a grace vote; if both are absent the worker is
 * genuinely dead and `deadSignal` names the host signal that died.
 */
export function decideWorkerLiveness(
  target: LivenessTarget,
  deps: LivenessDecisionDeps = {},
): HostLivenessVerdict {
  const probe = deps.probe ?? createHostLivenessProbe(deps);
  const primary = probe.probe(target);
  if (primary.alive) return primary;

  // Host primary is absent — a fresh host-captured `.log` still proves the
  // worker is doing work (grace). The subprocess arm already folded this in;
  // apply it uniformly for docker/tmux so a container/pane blip mid-write does
  // not race the kill.
  if (primary.signal !== 'log-activity') {
    const now = deps.now ?? (() => Date.now());
    if (isLogActivityFresh(target.tasksDir, target.taskId, now)) {
      return {
        alive: true,
        signal: 'log-activity',
        reason: `${primary.reason}; but host .log active — grace`,
      };
    }
  }

  return {
    alive: false,
    signal: primary.signal,
    deadSignal: primary.deadSignal ?? primary.signal,
    reason: primary.reason,
  };
}

// ─── Kill-decision log (names the dead signal) ───────────────────────────────

/**
 * Format the one-line kill-decision log for a DEAD verdict. The message NAMES
 * which host signal was absent (`deadSignal`) so a post-mortem reads "killed
 * because the container-state signal died", never an ambiguous "stale heartbeat".
 * Returns a distinct `[host-lifecycle] alive` line for a live verdict so callers
 * can log both paths through one function.
 */
export function formatKillDecisionLog(target: LivenessTarget, verdict: HostLivenessVerdict): string {
  if (verdict.alive) {
    return `[host-lifecycle] ${target.workerId} (task ${target.taskId}, ${target.backend}) alive — `
      + `host signal "${verdict.signal}" present`;
  }
  const dead = verdict.deadSignal ?? verdict.signal;
  return `[host-lifecycle] KILL ${target.workerId} (task ${target.taskId}, ${target.backend}) — `
    + `host signal "${dead}" died (${verdict.reason})`;
}

// ─── `.hb` as a currentAction carrier ────────────────────────────────────────

/**
 * The ONLY thing liveness reads from a `.hb`: the semantic `currentAction`. The
 * `.hb` is no longer a liveness source — its timestamp is deliberately ignored
 * by {@link decideWorkerLiveness}. Backward-compatible: accepts any object that
 * structurally carries a `currentAction`, so a legacy `.hb` (no `pid`, no
 * `livenessSource`) is read unchanged. Returns undefined when absent/blank.
 */
export function readHeartbeatCurrentAction(hb: Pick<Heartbeat, 'currentAction'> | null | undefined): string | undefined {
  if (!hb || typeof hb.currentAction !== 'string') return undefined;
  const trimmed = hb.currentAction.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Build a {@link LivenessTarget} from a worker's spawn identity. The single place
 * callers turn `(taskId, backend)` into the probe input — keeps the `w-<taskId>`
 * workerId derivation and the optional pid/tasksDir plumbing consistent across
 * spawn paths.
 */
export function buildLivenessTarget(
  taskId: string,
  backend: WorkerBackendKind,
  opts: { workerId?: string; pid?: number; tasksDir?: string } = {},
): LivenessTarget {
  return {
    backend,
    taskId,
    workerId: opts.workerId ?? `w-${taskId}`,
    pid: opts.pid,
    tasksDir: opts.tasksDir,
  };
}
