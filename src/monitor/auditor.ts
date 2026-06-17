import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync, statSync, mkdirSync, renameSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { AgentStatus, AlertLevel, SprintPhase, SprintStatus, TaskStatus } from '../core/types.js';
import type {
  Heartbeat,
  LockInfo,
  Task,
  TaskResult,
  TaskScope,
  BoundaryViolation,
  Alert,
  DashboardState,
} from '../core/types.js';
import {
  TASKS_DIR,
  LOCKS_DIR,
  BRAIN_DIR,
  DASHBOARD_FILE,
  ARCHIVE_DIR,
} from '../core/constants.js';

import { readJsonSafe, debugLog } from '../core/utils.js';
import { metric } from '../core/observability.js';
import { writeEvent, CHANNELS } from '../orchestra/event-stream.js';
import { clearOrphanLocks, clearOrphanSpawnLocks, clearStaleSpawnLocks } from '../core/file-lock.js';
import { checkAuthority, emitAuthorityViolation } from '../orchestra/authority-enforcer.js';
import { MemoryStore } from '../core/memory-store.js';
import { MEMORY_DB_FILE } from '../core/constants.js';
import { ACTIVE_EXECUTION_STATUSES, COMPLETED_STATUSES } from '../core/heartbeat-types.js';
import { emitAlert } from './alert-emitter.js';

// ─── Constants ─────────────────────────────────────────────────────

/** Self-assessment values that indicate a successfully completed task. */
export const DONE_SET = new Set(['DONE', 'GO_WITH_TECH_DEBT']);

// ─── Heartbeat Cache (Sprint 139 — mtime-based invalidation) ────────

/** Cached heartbeat entry with filesystem mtime for invalidation */
export interface HeartbeatCacheEntry {
  hb: Heartbeat;
  mtimeMs: number;
  /** Monotonically increasing sequence from last read */
  lastSequence: number;
}

/** Module-level heartbeat cache keyed by file path */
const heartbeatCache = new Map<string, HeartbeatCacheEntry>();

/**
 * Read a heartbeat file with mtime-based cache invalidation.
 * Returns cached HB if file mtime hasn't changed, otherwise re-reads from disk.
 * Sprint 139 fix: eliminates false-positive stale alerts caused by unnecessary re-parsing.
 */
export function readHeartbeatCached(hbPath: string): Heartbeat | null {
  try {
    const st = statSync(hbPath);
    const mtimeMs = st.mtimeMs;

    const cached = heartbeatCache.get(hbPath);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.hb;
    }

    // mtime changed or not cached — re-read
    const hb = readJsonSafe<Heartbeat>(hbPath);
    if (!hb) {
      heartbeatCache.delete(hbPath);
      return null;
    }

    heartbeatCache.set(hbPath, {
      hb,
      mtimeMs,
      lastSequence: hb.sequence ?? 0,
    });
    return hb;
  } catch {
    // File doesn't exist or stat failed — remove from cache
    heartbeatCache.delete(hbPath);
    return null;
  }
}

/** Clear the heartbeat cache (for testing or sprint cleanup) */
export function clearHeartbeatCache(): void {
  heartbeatCache.clear();
}

/** Get cache size (for testing) */
export function getHeartbeatCacheSize(): number {
  return heartbeatCache.size;
}

// ─── Backend-Agnostic Process Check (Sprint 139) ────────────────────

/** Check if a worker process/container is still running based on its backend */
export function isWorkerProcessAlive(hb: Heartbeat): boolean {
  const backend = hb.backend;
  const workerId = hb.workerId;

  try {
    switch (backend) {
      case 'docker': {
        // Docker: check if container named deckent-<workerId> is running
        const result = spawnSync('docker', [
          'ps', '--filter', `name=deckent-${workerId}`, '--format', '{{.Names}}',
        ], {
          encoding: 'utf-8',
          timeout: 5_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return (result.stdout ?? '').trim().length > 0;
      }
      case 'tmux': {
        // tmux: check if session exists
        const result = spawnSync('tmux', ['has-session', '-t', workerId], {
          encoding: 'utf-8',
          timeout: 5_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        return result.status === 0;
      }
      case 'subprocess': {
        // Subprocess: check PID if available in workerId pattern w-NNN-NNN
        // Fallback: cannot verify without PID — assume unknown
        return false; // conservative: subprocess PID not stored in HB
      }
      default:
        // Unknown backend — cannot determine, return false (conservative)
        return false;
    }
  } catch {
    // Any error in process check — fail-safe, assume not alive
    return false;
  }
}

// ─── Async Batch Liveness Probe (Sprint 279 WK-7) ───────────────────
//
// The synchronous `isWorkerProcessAlive` above issues one blocking, synchronous
// docker/tmux probe per worker. Inside the 30s auditor scan that
// is O(n) event-loop blocking — with ≥20 workers it stalls the loop and causes
// resource contention. This block adds a NON-BLOCKING, parallel alternative:
// each worker is probed with async `spawn`, all probes run concurrently via
// `Promise.allSettled`, and the verdicts are memoized in a liveness cache. The
// scan loop pre-warms this cache (see `startScanLoop`), so the synchronous stale
// detection reads cached results instead of blocking on per-worker probes. The
// sync probe remains the cache-miss fallback (cold cache / direct call) so
// standalone behavior is preserved bit-for-bit.

/** Options for the async liveness probe — `spawn` is injectable for tests. */
export interface LivenessProbeOptions {
  /** Inject an async spawn implementation (defaults to node:child_process spawn). */
  spawn?: typeof spawn;
  /** Per-probe timeout in milliseconds (default 5_000 — matches the sync probe). */
  timeoutMs?: number;
}

/**
 * Module-level liveness cache keyed by workerId.
 * Populated by `batchProbeLiveness`; read by `isWorkerStale` (Signal B).
 */
const livenessCache = new Map<string, boolean>();

/** Clear the liveness cache (for testing or sprint cleanup). */
export function clearLivenessCache(): void {
  livenessCache.clear();
}

/** Get the liveness cache size (for testing). */
export function getLivenessCacheSize(): number {
  return livenessCache.size;
}

/** Read a cached liveness verdict (undefined when not yet probed). */
export function getCachedLiveness(workerId: string): boolean | undefined {
  return livenessCache.get(workerId);
}

/**
 * Run a single async liveness probe and resolve a boolean verdict.
 * Never throws — spawn errors, timeouts, and unexpected exits resolve `false`
 * (fail-safe, matching the synchronous probe's catch semantics).
 */
function runAsyncProbe(
  spawnFn: typeof spawn,
  command: string,
  args: string[],
  timeoutMs: number,
  decide: (code: number | null, stdout: string) => boolean,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (verdict: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(verdict);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      finish(false); // spawn threw synchronously (ENOENT etc.) — fail-safe
      return;
    }

    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already gone */ }
      finish(false);
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    let stdout = '';
    child.stdout?.on('data', (chunk: unknown) => { stdout += String(chunk); });
    child.on('error', () => { clearTimeout(timer); finish(false); });
    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      finish(decide(code, stdout));
    });
  });
}

/**
 * Async, non-blocking equivalent of `isWorkerProcessAlive`.
 * Same backend semantics: docker → container `deckent-<id>` running;
 * tmux → session exists (exit 0); subprocess/unknown → false (conservative).
 */
export async function probeWorkerAlive(
  hb: Heartbeat,
  opts: LivenessProbeOptions = {},
): Promise<boolean> {
  const spawnFn = opts.spawn ?? spawn;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const workerId = hb.workerId;

  switch (hb.backend) {
    case 'docker':
      return runAsyncProbe(
        spawnFn, 'docker',
        ['ps', '--filter', `name=deckent-${workerId}`, '--format', '{{.Names}}'],
        timeoutMs,
        (_code, stdout) => stdout.trim().length > 0,
      );
    case 'tmux':
      return runAsyncProbe(
        spawnFn, 'tmux',
        ['has-session', '-t', workerId],
        timeoutMs,
        (code) => code === 0,
      );
    case 'subprocess':
    default:
      return false; // conservative — PID not tracked in HB (matches sync probe)
  }
}

/**
 * Probe every worker's liveness IN PARALLEL and memoize the verdicts.
 *
 * All probes are started concurrently and collected with `Promise.allSettled`,
 * so a single failed probe never affects the others (the rejected branch is
 * skipped; that worker stays uncached and falls back to the sync probe). This
 * replaces the O(n) serial `spawnSync` loop with non-blocking parallelism.
 */
export async function batchProbeLiveness(
  heartbeats: Heartbeat[],
  opts: LivenessProbeOptions = {},
): Promise<Map<string, boolean>> {
  const verdicts = new Map<string, boolean>();
  if (heartbeats.length === 0) return verdicts;

  const settled = await Promise.allSettled(
    heartbeats.map(async (hb) => ({
      workerId: hb.workerId,
      alive: await probeWorkerAlive(hb, opts),
    })),
  );

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      verdicts.set(outcome.value.workerId, outcome.value.alive);
      livenessCache.set(outcome.value.workerId, outcome.value.alive);
    }
    // rejected — defensive only (probeWorkerAlive is fail-safe); leave uncached
  }
  return verdicts;
}

/**
 * Collect active (non-DONE) heartbeats from disk for liveness probing.
 * Reuses the mtime-cached heartbeat reader; returns [] when no .tasks dir.
 */
export function collectActiveHeartbeats(projectRoot: string): Heartbeat[] {
  const out: Heartbeat[] = [];
  let tasksDir: string;
  try {
    tasksDir = join(projectRoot, TASKS_DIR);
    if (!existsSync(tasksDir)) return out;
  } catch {
    return out;
  }

  let files: string[];
  try {
    files = readdirSync(tasksDir).filter((f) => f.endsWith('.hb'));
  } catch {
    return out;
  }

  for (const file of files) {
    const hb = readHeartbeatCached(join(tasksDir, file));
    if (!hb) continue;
    if (hb.status === AgentStatus.DONE) continue; // finished — no probe needed
    out.push(hb);
  }
  return out;
}

/**
 * Read active heartbeats from disk and batch-probe their liveness in parallel,
 * warming the liveness cache for the next synchronous scan. Fail-safe: any
 * error resolves to an empty map (the scan falls back to sync probes).
 */
export async function refreshLivenessFromDisk(
  projectRoot: string,
  opts: LivenessProbeOptions = {},
): Promise<Map<string, boolean>> {
  try {
    const heartbeats = collectActiveHeartbeats(projectRoot);
    return await batchProbeLiveness(heartbeats, opts);
  } catch {
    return new Map<string, boolean>();
  }
}

// ─── Multi-Signal Stale Detection (Sprint 139) ──────────────────────

/**
 * Multi-signal stale detection: checks multiple signals to determine if a worker is alive.
 *
 * Logic:
 * - If HB timestamp is fresh (within timeout) → NOT stale (single signal sufficient)
 * - If HB timestamp is stale → check secondary signals:
 *   - Signal A: .result file exists with successful selfAssessment (DONE/GO_WITH_TECH_DEBT)
 *   - Signal B: Process/container is still running (backend-agnostic)
 *   - Signal C: Monotonic sequence increased since last cache read
 *   If ANY secondary signal is active → NOT stale (suppress false positive)
 *
 * Sprint 139 fix for Sprint 138 false positive stale alert pattern.
 */
export function isWorkerStale(
  hb: Heartbeat,
  projectRoot: string,
  heartbeatTimeoutMs: number,
  hbPath?: string,
): boolean {
  const currentTime = Date.now();
  const parsedTime = new Date(hb.timestamp).getTime();
  if (isNaN(parsedTime)) return true; // malformed timestamp → stale

  // Primary signal: HB timestamp freshness — if fresh, worker is alive
  const elapsed = currentTime - parsedTime;
  if (elapsed <= heartbeatTimeoutMs) {
    return false; // Fresh heartbeat — definitively not stale
  }

  // HB timestamp is stale — check secondary signals to prevent false positives

  // Signal A: .result file exists with successful assessment → worker finished
  const resultPath = join(projectRoot, TASKS_DIR, `task-${hb.taskId}.result`);
  if (existsSync(resultPath)) {
    const result = readJsonSafe<{ selfAssessment?: string }>(resultPath);
    if (result?.selfAssessment && DONE_SET.has(result.selfAssessment)) {
      return false; // Task completed successfully — not stale, just finished
    }
  }

  // Signal B: Process/container is still running.
  // Sprint 279 (WK-7): prefer the async-batch-probed liveness cache (non-blocking,
  // O(n)→parallel) that the scan loop pre-warms; fall back to the synchronous probe
  // on a cache miss (cold cache / direct call) so standalone behavior is preserved.
  const cachedAlive = livenessCache.get(hb.workerId);
  const processAlive = cachedAlive !== undefined ? cachedAlive : isWorkerProcessAlive(hb);
  if (processAlive) {
    return false; // Process alive — worker is running, just slow to update HB
  }

  // Signal C: Monotonic sequence check — sequence increased since last read
  if (hbPath) {
    const cached = heartbeatCache.get(hbPath);
    if (cached && (hb.sequence ?? 0) > cached.lastSequence) {
      return false; // Sequence progressed — worker is active
    }
  }

  // All secondary signals negative → genuinely stale
  return true;
}

// ─── Internal Helpers ───────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

/**
 * Determines whether a stale heartbeat should be reported as a CRITICAL alert.
 *
 * Returns `false` (suppress alert) when:
 *  - The task's `.result` file exists, is valid JSON, and its `selfAssessment`
 *    is in DONE_SET (DONE or GO_WITH_TECH_DEBT).
 *
 * Returns `true` (report alert) in all other cases:
 *  - No `.result` file → normal stale
 *  - `.result` with selfAssessment NO_GO → honest failure, should alert
 *  - Malformed JSON → fail-safe, should alert
 *
 * Defensive fix for Sprint 134 Docker bug: containers SIGKILL'd after task
 * completion wrote "FAILED exitCode 137" to HB, causing 47 false CRITICAL alerts.
 */
export function shouldReportStale(projectRoot: string, taskId: string, _hbContent?: unknown): boolean {
  const resultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
  if (!existsSync(resultPath)) return true;

  const result = readJsonSafe<{ selfAssessment?: string }>(resultPath);
  if (result?.selfAssessment && DONE_SET.has(result.selfAssessment)) {
    return false; // Task completed successfully — suppress stale alert
  }
  return true; // selfAssessment is NO_GO, missing, or malformed JSON — honest alert
}

// ─── Public API ─────────────────────────────────────────────────────

export function createAlert(
  level: AlertLevel,
  message: string,
  source?: string,
): Alert {
  return {
    level,
    message,
    source,
    timestamp: now(),
  };
}

export function scanHeartbeats(projectRoot: string, heartbeatTimeoutMs = 120_000): {
  heartbeats: Heartbeat[];
  staleAgents: BoundaryViolation[];
  alerts: Alert[];
} {
  const tasksDir = join(projectRoot, TASKS_DIR);
  const heartbeats: Heartbeat[] = [];
  const staleAgents: BoundaryViolation[] = [];
  const alerts: Alert[] = [];

  if (!existsSync(tasksDir)) {
    return { heartbeats, staleAgents, alerts };
  }

  const files = readdirSync(tasksDir).filter((f) => f.endsWith('.hb'));
  const currentTime = Date.now();

  for (const file of files) {
    const hbPath = join(tasksDir, file);
    // Sprint 139: Use mtime-cached reader to avoid re-parsing unchanged HB files
    const hb = readHeartbeatCached(hbPath);
    if (!hb) continue;

    heartbeats.push(hb);

    // Skip stale check for heartbeats with DONE status — worker already completed
    if (hb.status === AgentStatus.DONE) continue;

    // Sprint 139: Multi-signal stale detection replaces simple elapsed-time check
    // Checks HB freshness + .result existence + process/container alive + sequence monotonicity
    if (!isWorkerStale(hb, projectRoot, heartbeatTimeoutMs, hbPath)) {
      continue; // Worker is alive by multi-signal consensus — skip stale reporting
    }

    // Worker is stale by multi-signal check — apply existing reconciliation layers
    const parsedTime = new Date(hb.timestamp).getTime();
    if (isNaN(parsedTime)) continue; // malformed timestamp — skip
    const elapsed = currentTime - parsedTime;

    // Reconcile HB with .result file: suppress stale alert if task completed successfully
    // (DONE or GO_WITH_TECH_DEBT). NO_GO results still trigger honest alerts.
    // Defensive fix for Sprint 134 Docker bug (SIGKILL → HB "FAILED exitCode 137" + 47 false alerts).
    if (!shouldReportStale(projectRoot, hb.taskId, hb)) continue;

    // Check the worker's task lifecycle state before generating stale alerts.
    // Sprint 149 fix: Only generate stale alerts for tasks in EXECUTING state.
    // PENDING/CLAIMED/DRAFT/PAUSED tasks haven't started yet — no heartbeat expected.
    const taskFilePath = join(tasksDir, `task-${hb.taskId}.json`);
    const task = readJsonSafe<Task>(taskFilePath);

    // Sprint 149: Skip stale check for non-EXECUTING tasks (race condition fix)
    // Tasks in PENDING, CLAIMED, DRAFT, or PAUSED state should never trigger stale alerts
    // because the worker hasn't started executing yet (or is paused).
    // Sprint 150: Use shared ACTIVE_EXECUTION_STATUSES from heartbeat-types.ts (DRY).
    if (task && !ACTIVE_EXECUTION_STATUSES.has(task.status)) {
      const isCompleted = COMPLETED_STATUSES.has(task.status);
      if (isCompleted) {
        // Downgrade to WARNING — worker finished its task, stale heartbeat is expected
        alerts.push(
          createAlert(
            AlertLevel.WARNING,
            `Stale heartbeat from completed worker: ${hb.workerId} (task: ${hb.taskId}, status: ${task.status})`,
            hb.workerId,
          ),
        );
      }
      // Non-executing, non-completed tasks (PENDING/CLAIMED/DRAFT/PAUSED) — skip entirely
      continue;
    }

    // Task is in EXECUTING/TESTING/DOCUMENTING state (or task.json missing) — genuine stale
    staleAgents.push({
      type: 'stale_heartbeat',
      agentId: hb.workerId,
      detail: `Heartbeat stale for ${Math.round(elapsed / 1000)}s (task: ${hb.taskId})`,
      timestamp: now(),
    });
    metric('hb.stale', 1, { taskId: hb.taskId });

    alerts.push(
      createAlert(
        AlertLevel.CRITICAL,
        `Stale agent detected: ${hb.workerId} (task: ${hb.taskId})`,
        hb.workerId,
      ),
    );
  }

  return { heartbeats, staleAgents, alerts };
}

// ─── Authority Enforcement (Sprint 139 Task 035, ADR-037) ─────────

/**
 * Run authority checks for all active workers based on boundary violations.
 * Soft enforcement: violations emit warnings + event stream entries.
 */
export function runAuthorityChecks(
  projectRoot: string,
  currentSprintId: string,
  workerScopes: Map<string, TaskScope>,
  boundaryViolations: BoundaryViolation[],
): Alert[] {
  const alerts: Alert[] = [];

  for (const violation of boundaryViolations) {
    if (violation.type !== 'file_outside_scope') continue;

    const filePath = violation.detail.replace('File outside scope: ', '');
    const workerId = violation.agentId;

    const scope = workerScopes.get(workerId);
    const result = checkAuthority({
      role: 'worker',
      action: 'write',
      target: filePath,
      taskId: workerId,
      scopeDirectories: scope?.directories,
      scopeFilesWrite: scope?.filesWrite,
    });

    if (!result.allowed) {
      alerts.push(
        createAlert(
          AlertLevel.WARNING,
          `[ADR-037 soft] Authority violation: worker ${workerId} attempted to write ${filePath} — ${result.reason}`,
          workerId,
        ),
      );

      // Emit to event stream for audit trail
      emitAuthorityViolation(projectRoot, currentSprintId, {
        role: 'worker',
        action: 'write',
        target: filePath,
        taskId: workerId,
      }, result);
    }
  }

  return alerts;
}

export function checkBoundaryViolations(
  projectRoot: string,
  workerScopes: Map<string, TaskScope>,
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  const result = spawnSync('git', ['diff', '--stat'], {
    cwd: projectRoot,
    encoding: 'utf-8',
  });

  if (result.status !== 0 || !result.stdout) {
    return violations;
  }

  const lines = result.stdout.trim().split('\n');
  // Last line is summary, skip it
  const fileLines = lines.slice(0, -1);

  for (const line of fileLines) {
    const filePath = line.split('|')[0]?.trim();
    if (!filePath) continue;

    const normalizedFile = normalize(filePath);

    for (const [workerId, scope] of workerScopes) {
      const inScope = isFileInScope(normalizedFile, scope);
      if (!inScope) {
        // Check if file was changed by this worker — simplified: flag all out-of-scope files
        violations.push({
          type: 'file_outside_scope',
          agentId: workerId,
          detail: `File outside scope: ${filePath}`,
          timestamp: now(),
        });
      }
    }
  }

  return violations;
}

export function isFileInScope(filePath: string, scope: TaskScope): boolean {
  const normalizedFile = normalize(filePath).replace(/\\/g, '/');

  for (const dir of scope.directories) {
    const normalizedDir = normalize(dir).replace(/\\/g, '/');
    const dirWithSlash = normalizedDir.endsWith('/') ? normalizedDir : `${normalizedDir}/`;
    if (normalizedFile.startsWith(dirWithSlash) || normalizedFile === normalizedDir) {
      return true;
    }
  }

  for (const f of scope.filesWrite) {
    const normalizedWrite = normalize(f).replace(/\\/g, '/');
    if (normalizedFile === normalizedWrite) {
      return true;
    }
  }

  return false;
}

export function checkStaleLocks(projectRoot: string, autoClean = false, lockStaleThresholdMs = 300_000): {
  locks: LockInfo[];
  staleLocks: BoundaryViolation[];
  alerts: Alert[];
  removedLocks: string[];
} {
  const locksDir = join(projectRoot, LOCKS_DIR);
  const locks: LockInfo[] = [];
  const staleLocks: BoundaryViolation[] = [];
  const alerts: Alert[] = [];
  const removedLocks: string[] = [];

  if (!existsSync(locksDir)) {
    return { locks, staleLocks, alerts, removedLocks };
  }

  const files = readdirSync(locksDir).filter((f) => f.endsWith('.lock'));
  const currentTime = Date.now();

  for (const file of files) {
    const lockPath = join(locksDir, file);
    const lock = readJsonSafe<LockInfo>(lockPath);
    if (!lock) continue;

    locks.push(lock);

    const elapsed = currentTime - new Date(lock.acquiredAt).getTime();
    if (elapsed > lockStaleThresholdMs) {
      staleLocks.push({
        type: 'stale_lock',
        agentId: lock.ownerWorkerId,
        detail: `Stale lock on ${lock.filePath} held for ${Math.round(elapsed / 1000)}s`,
        timestamp: now(),
      });

      if (autoClean) {
        try {
          unlinkSync(lockPath);
          removedLocks.push(lock.filePath);
          alerts.push(
            createAlert(
              AlertLevel.INFO,
              `Auto-removed stale lock: ${lock.filePath} by ${lock.ownerWorkerId}`,
              lock.ownerWorkerId,
            ),
          );
        } catch {
          // Lock file may already be removed by another process — non-fatal
          alerts.push(
            createAlert(
              AlertLevel.WARNING,
              `Stale lock: ${lock.filePath} by ${lock.ownerWorkerId}`,
              lock.ownerWorkerId,
            ),
          );
        }
      } else {
        alerts.push(
          createAlert(
            AlertLevel.WARNING,
            `Stale lock: ${lock.filePath} by ${lock.ownerWorkerId}`,
            lock.ownerWorkerId,
          ),
        );
      }
    }
  }

  return { locks, staleLocks, alerts, removedLocks };
}

export function detectDeadlocks(tasks: Task[]): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const taskMap = new Map<string, Task>();

  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  // Kahn's algorithm for cycle detection
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const task of tasks) {
    if (!inDegree.has(task.id)) inDegree.set(task.id, 0);
    if (!adjList.has(task.id)) adjList.set(task.id, []);

    for (const dep of task.dependencies) {
      if (!adjList.has(dep)) adjList.set(dep, []);
      const depList = adjList.get(dep);
      if (depList) depList.push(task.id); // narrowed: set() called above
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
      if (!inDegree.has(dep)) inDegree.set(dep, 0);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift(); // length > 0 guarantees defined
    if (current === undefined) break;
    processed++;
    for (const neighbor of adjList.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  const totalNodes = inDegree.size;
  if (processed < totalNodes) {
    // Cycle detected — find nodes still with inDegree > 0
    const cyclicNodes: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree > 0) cyclicNodes.push(id);
    }

    violations.push({
      type: 'circular_dependency',
      agentId: cyclicNodes.join(','),
      detail: `Circular dependency detected among tasks: ${cyclicNodes.join(', ')}`,
      timestamp: now(),
    });
  }

  return violations;
}

export function resetDashboard(
  projectRoot: string,
  sprintId: string,
  taskCount: number,
): void {
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  const freshState: DashboardState = {
    sprint: { id: sprintId, number: 0, phase: SprintPhase.PLAN, status: SprintStatus.PLANNING },
    agents: [],
    progress: { done: 0, active: 0, blocked: 0, total: taskCount },
    alerts: [],
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(dashPath, JSON.stringify(freshState, null, 2), 'utf-8');
}

export function updateDashboard(
  projectRoot: string,
  state: DashboardState,
): void {
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  writeFileSync(dashPath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Record auditor boundary-violation patterns into the Memory V2 DB as
 * `type='pattern'` entries — one upserted row per (sprint, violation-type).
 *
 * B7 (Memory V2): replaces the legacy `.brain/PATTERNS.md` JSON writer.
 * memory.db is the single source of truth for patterns; the auditor scan
 * loop calls this once per scan with the sprint's accumulated violations.
 * A missing DB or write failure is a graceful no-op — pattern recording
 * must never break the scan loop.
 */
export function detectPatterns(
  projectRoot: string,
  violations: BoundaryViolation[],
  currentSprintId: string,
): void {
  if (violations.length === 0) return;

  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return;

  // Group violations by type — one pattern entry per type, occurrence count
  // carried in metadata.
  const violationTypes = new Map<string, number>();
  for (const v of violations) {
    violationTypes.set(v.type, (violationTypes.get(v.type) ?? 0) + 1);
  }

  try {
    const store = new MemoryStore(dbPath);
    try {
      for (const [type, count] of violationTypes) {
        store.upsert({
          id: `pattern-${currentSprintId}-${type}`,
          type: 'pattern',
          title: `Violation pattern: ${type}`,
          content: `${count} occurrence(s) of ${type} detected in ${currentSprintId}`,
          sprint_id: currentSprintId,
          tags: ['auditor', 'pattern', type],
          status: 'active',
          metadata: { violationType: type, occurrences: count },
          decay_exempt: true,
        }, 'auditor');
      }
    } finally {
      store.close();
    }
  } catch {
    // DB write failure must not break the auditor scan loop.
  }
}

// ─── Bug Y2: Doc-Sync Ground-Truth Verification (Sprint 166) ──────────
//
// Sprint 164 commit a4f3be4 wrongly injected "16 agent + test-writer" into
// coordinator agent prompt; the actual count is 15. Five anchor .md files
// were updated with the wrong number. This module provides 3-layer
// defense-in-depth: prompt claim verification at plan-time, integration
// retro assertion, and Auditor runtime mismatch detection.

/** A ground-truth metric that can be measured against the filesystem. */
export interface GroundTruthMetric {
  /** Metric identifier (e.g. "agents_count") */
  metric: string;
  /** Measured value from filesystem (source of truth) */
  measured: number;
  /** Optional source path used for the measurement */
  source?: string;
}

/** A claim parsed from a task description (e.g. "16 agents") */
export interface GroundTruthClaim {
  metric: string;
  claimed: number;
  /** Original matched substring for diagnostics */
  raw: string;
}

/** Result of a single mismatch check */
export interface GroundTruthMismatch {
  metric: string;
  claimed: number;
  measured: number;
  /** Override applied (if any) — overrides suppress the violation */
  overrideApplied?: boolean;
  /** Original matched substring */
  raw: string;
}

/** Ground-truth whitelist override schema (.deckent/ground-truth-overrides.json) */
export interface GroundTruthOverride {
  metric: string;
  expected: number;
  approvedBy: string;
  until_sprint: number;
  reason: string;
}

export interface GroundTruthOverridesFile {
  version: string;
  overrides: GroundTruthOverride[];
}

/**
 * Measure the canonical agents count by counting directories under
 * src/core/builtins/agents/. Returns -1 if directory does not exist
 * (caller treats -1 as "no ground truth available, skip check").
 */
export function measureAgentsCount(projectRoot: string): number {
  const agentsDir = join(projectRoot, 'src/core/builtins/agents');
  if (!existsSync(agentsDir)) return -1;
  try {
    return readdirSync(agentsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .length;
  } catch {
    return -1;
  }
}

/**
 * Parse "N agents" claims from a task description / prompt text.
 * Matches phrases like "16 agents", "15 built-in agents", "16 agent + test-writer".
 * Returns each match as a claim entry (the same metric may appear multiple times).
 */
export function parseAgentsClaims(text: string): GroundTruthClaim[] {
  if (!text) return [];
  const claims: GroundTruthClaim[] = [];
  // Word boundary protects against matching "16 agents" inside e.g. "1160 agents"
  const re = /\b(\d{1,3})\s+(?:built-?in\s+)?agents?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const numStr = m[1];
    if (!numStr) continue;
    const claimed = Number.parseInt(numStr, 10);
    if (!Number.isFinite(claimed)) continue;
    claims.push({
      metric: 'agents_count',
      claimed,
      raw: m[0],
    });
  }
  return claims;
}

/**
 * Load whitelist overrides from .deckent/ground-truth-overrides.json.
 * Returns empty list when the file is missing or malformed (fail-safe).
 */
export function loadGroundTruthOverrides(projectRoot: string): GroundTruthOverride[] {
  const path = join(projectRoot, '.deckent', 'ground-truth-overrides.json');
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as GroundTruthOverridesFile;
    if (!parsed || !Array.isArray(parsed.overrides)) return [];
    return parsed.overrides;
  } catch {
    return [];
  }
}

/**
 * Parse the numeric portion of a sprint id (e.g. "sprint-166" → 166).
 * Returns NaN if the id is malformed.
 */
function parseSprintNumber(sprintId: string | undefined | null): number {
  if (!sprintId) return Number.NaN;
  const m = /sprint-(\d+)/i.exec(sprintId);
  if (!m || !m[1]) return Number.NaN;
  return Number.parseInt(m[1], 10);
}

/**
 * Resolve whether an override applies for a (metric, claimed, currentSprint).
 * Override applies when metric matches, the expected value equals the claim,
 * and current sprint number is strictly less than until_sprint.
 */
export function overrideApplies(
  overrides: GroundTruthOverride[],
  metric: string,
  claimed: number,
  currentSprintId: string,
): boolean {
  const current = parseSprintNumber(currentSprintId);
  for (const o of overrides) {
    if (o.metric !== metric) continue;
    if (o.expected !== claimed) continue;
    // If sprint id is malformed, treat as ALWAYS active override (fail-open for whitelist)
    if (Number.isNaN(current)) return true;
    if (current < o.until_sprint) return true;
  }
  return false;
}

/**
 * Find overrides whose `until_sprint` has passed (current sprint >= until_sprint).
 * Expired overrides are already inert — `overrideApplies` never returns true for
 * them — but they linger in the whitelist file. Surfacing them lets the auditor
 * prompt cleanup so the whitelist does not accumulate stale entries.
 *
 * Returns empty when the sprint id is malformed (cannot decide expiry).
 */
export function findExpiredOverrides(
  overrides: GroundTruthOverride[],
  currentSprintId: string,
): GroundTruthOverride[] {
  const current = parseSprintNumber(currentSprintId);
  if (Number.isNaN(current)) return [];
  return overrides.filter((o) => current >= o.until_sprint);
}

/**
 * Verify doc-sync ground-truth claims in a task description.
 *
 * Returns the list of mismatches detected (empty when all claims match
 * measured values or are covered by a whitelist override).
 *
 * Falsifiable predicate: a mismatch is any (metric, claimed) where
 * `claimed !== measured` AND no whitelist override applies.
 *
 * The function never throws — measurement or override-load failures
 * yield an empty result set (fail-safe).
 */
export function verifyDocSyncGroundTruth(
  projectRoot: string,
  task: { description?: string; title?: string; id?: string },
  currentSprintId: string,
  opts: { overrides?: GroundTruthOverride[]; metrics?: GroundTruthMetric[] } = {},
): GroundTruthMismatch[] {
  const text = `${task.title ?? ''}\n${task.description ?? ''}`;
  if (!text.trim()) return [];

  const overrides = opts.overrides ?? loadGroundTruthOverrides(projectRoot);

  // Default metric set: agents_count from src/core/builtins/agents/
  const defaultMetrics: GroundTruthMetric[] = [];
  const agentsMeasured = measureAgentsCount(projectRoot);
  if (agentsMeasured >= 0) {
    defaultMetrics.push({ metric: 'agents_count', measured: agentsMeasured });
  }
  const metrics = opts.metrics ?? defaultMetrics;
  const byMetric = new Map<string, GroundTruthMetric>();
  for (const m of metrics) byMetric.set(m.metric, m);

  const mismatches: GroundTruthMismatch[] = [];
  const claims = parseAgentsClaims(text);
  for (const claim of claims) {
    const gt = byMetric.get(claim.metric);
    if (!gt) continue; // no ground truth available — skip
    if (claim.claimed === gt.measured) continue;
    const overrideApplied = overrideApplies(overrides, claim.metric, claim.claimed, currentSprintId);
    if (overrideApplied) continue;
    mismatches.push({
      metric: claim.metric,
      claimed: claim.claimed,
      measured: gt.measured,
      overrideApplied: false,
      raw: claim.raw,
    });
  }
  return mismatches;
}

/**
 * Build BoundaryViolation entries from ground-truth mismatches.
 * Threshold is zero-tolerance: any mismatch produces one violation.
 */
export function groundTruthMismatchesToViolations(
  taskId: string,
  mismatches: GroundTruthMismatch[],
): BoundaryViolation[] {
  return mismatches.map((m) => ({
    type: 'doc_sync_ground_truth_mismatch',
    agentId: taskId,
    detail: `Task ${taskId} claim "${m.raw}" (${m.metric}=${m.claimed}) does not match measured value ${m.measured}`,
    timestamp: now(),
  }));
}

/**
 * Scan all active tasks for doc-sync ground-truth mismatches.
 * Used by runScanCycle to integrate into the existing audit loop.
 */
export function scanTasksForGroundTruthMismatches(
  projectRoot: string,
  currentSprintId: string,
): BoundaryViolation[] {
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  const overrides = loadGroundTruthOverrides(projectRoot);
  const violations: BoundaryViolation[] = [];
  let taskFiles: string[];
  try {
    taskFiles = readdirSync(tasksDir).filter(
      (f) => f.startsWith('task-') && f.endsWith('.json'),
    );
  } catch {
    return [];
  }
  for (const file of taskFiles) {
    const task = readJsonSafe<Task>(join(tasksDir, file));
    if (!task) continue;
    const mismatches = verifyDocSyncGroundTruth(
      projectRoot,
      { id: task.id, title: task.title, description: task.description },
      currentSprintId,
      { overrides },
    );
    if (mismatches.length === 0) continue;
    violations.push(...groundTruthMismatchesToViolations(task.id ?? file, mismatches));
  }
  return violations;
}

export function buildWorkerScopeMap(
  projectRoot: string,
): Map<string, TaskScope> {
  const scopeMap = new Map<string, TaskScope>();
  const tasksDir = join(projectRoot, TASKS_DIR);

  if (!existsSync(tasksDir)) return scopeMap;

  const files = readdirSync(tasksDir).filter(
    (f) => f.startsWith('task-') && f.endsWith('.json'),
  );

  for (const file of files) {
    const task = readJsonSafe<Task>(join(tasksDir, file));
    if (!task?.assignedWorker || !task.scope) continue;
    scopeMap.set(task.assignedWorker, task.scope);
  }

  return scopeMap;
}

export interface ScanOptions {
  autoCleanLocks?: boolean;
  heartbeatTimeoutMs?: number;
  lockStaleThresholdMs?: number;
}

export interface ScanResult {
  heartbeats: Heartbeat[];
  violations: BoundaryViolation[];
  alerts: Alert[];
  locks: LockInfo[];
  /** Dependency order violations detected in this scan cycle (Sprint 139) */
  dependencyViolations?: DependencyViolation[];
}

export function runScanCycle(
  projectRoot: string,
  currentSprintId: string,
  autoCleanLocksOrOpts: boolean | ScanOptions = false,
): ScanResult {
  const opts: ScanOptions = typeof autoCleanLocksOrOpts === 'boolean'
    ? { autoCleanLocks: autoCleanLocksOrOpts }
    : autoCleanLocksOrOpts;
  try {
    const hbResult = scanHeartbeats(projectRoot, opts.heartbeatTimeoutMs);
    const workerScopes = buildWorkerScopeMap(projectRoot);
    const boundaryViolations = checkBoundaryViolations(projectRoot, workerScopes);
    const lockResult = checkStaleLocks(projectRoot, opts.autoCleanLocks ?? false, opts.lockStaleThresholdMs);

    // Read tasks for deadlock detection
    const tasksDir = join(projectRoot, TASKS_DIR);
    let tasks: Task[] = [];
    if (existsSync(tasksDir)) {
      const taskFiles = readdirSync(tasksDir).filter(
        (f) => f.startsWith('task-') && f.endsWith('.json'),
      );
      for (const file of taskFiles) {
        const task = readJsonSafe<Task>(join(tasksDir, file));
        if (task) tasks.push(task);
      }
    }
    const deadlocks = detectDeadlocks(tasks);

    // Sprint 139: Dependency violation detection — workers executing before deps are done
    const depViolations = detectDependencyViolations(projectRoot, currentSprintId);

    // Sprint 139 Task 035: Authority enforcement check (ADR-037, soft mode)
    const authorityAlerts = runAuthorityChecks(projectRoot, currentSprintId, workerScopes, boundaryViolations);
    const depAlerts: Alert[] = depViolations.map(v =>
      createAlert(
        AlertLevel.WARNING,
        `Dependency violation: worker ${v.workerId} (task ${v.taskId}) executing before deps done: ${v.unresolvedDeps.join(', ')}`,
        v.workerId,
      ),
    );

    // Sprint 166 Task 4 (Bug Y2): Doc-sync ground-truth mismatch detection.
    // Catches stale numeric claims in task descriptions vs filesystem reality
    // (e.g. "16 agents" when src/core/builtins/agents/ has 15 directories).
    const groundTruthViolations = scanTasksForGroundTruthMismatches(projectRoot, currentSprintId);
    const groundTruthAlerts: Alert[] = groundTruthViolations.map((v) =>
      createAlert(AlertLevel.WARNING, `Doc-sync ground-truth mismatch: ${v.detail}`, v.agentId),
    );

    // Audit hygiene: surface expired ground-truth overrides so the whitelist
    // does not accumulate stale entries. An expired override is already inert
    // (overrideApplies returns false for it) — this alert only prompts cleanup.
    for (const o of findExpiredOverrides(loadGroundTruthOverrides(projectRoot), currentSprintId)) {
      groundTruthAlerts.push(createAlert(
        AlertLevel.WARNING,
        `[expired_override] ground-truth override "${o.metric}" expired at sprint ${o.until_sprint} — remove or renew it in .deckent/ground-truth-overrides.json`,
        'auditor:ground-truth',
      ));
    }

    // ─── Sprint 168 C0b: SpawnLock orphan + stale cleanup (RC4 Bug E) ─
    // Mirror L485 stale_lock paterni for `.spawnlock` files.
    // Active task IDs derive from .tasks/*.json in non-terminal status —
    // anything else is orphan (worker crashed / Brain stalled mid-sprint).
    const spawnLockAlerts: Alert[] = [];
    try {
      const activeTaskIds = tasks
        .filter(t => t.status !== TaskStatus.DONE && t.status !== TaskStatus.NO_GO)
        .map(t => t.id);
      const orphanCleared = clearOrphanSpawnLocks(projectRoot, activeTaskIds);
      if (orphanCleared > 0) {
        spawnLockAlerts.push(
          createAlert(
            AlertLevel.WARNING,
            `[stale_spawn_lock] Auto-removed ${orphanCleared} orphan spawn lock(s)`,
            'auditor:spawn-lock',
          ),
        );
      }
      const staleCleared = clearStaleSpawnLocks(projectRoot, 300_000); // 5min TTL
      if (staleCleared > 0) {
        spawnLockAlerts.push(
          createAlert(
            AlertLevel.WARNING,
            `[stale_spawn_lock] Auto-removed ${staleCleared} stale spawn lock(s) (TTL > 5min)`,
            'auditor:spawn-lock',
          ),
        );
      }
    } catch {
      // SpawnLock cleanup failure must not break the scan loop
    }

    const allViolations = [
      ...hbResult.staleAgents,
      ...boundaryViolations,
      ...lockResult.staleLocks,
      ...deadlocks,
      ...groundTruthViolations,
    ];
    const allAlerts = [
      ...hbResult.alerts,
      ...lockResult.alerts,
      ...depAlerts,
      ...authorityAlerts,
      ...groundTruthAlerts,
      ...spawnLockAlerts,
    ];

    // Detect patterns from violations → memory.db `pattern` entries.
    // B7: detectPatterns is now the single (DB-first) pattern writer — the
    // former inline upsert block + legacy `.brain/PATTERNS.md` file write
    // were folded into it.
    detectPatterns(projectRoot, allViolations, currentSprintId);

    // Sprint 166 Bug W: stale_md detector (M4 monitoring).
    // CLAUDE.md mtime > 70 min triggers emitAlert so the dashboard surface shows staleness.
    try {
      const claudeMdPath = join(projectRoot, 'CLAUDE.md');
      if (existsSync(claudeMdPath)) {
        const { mtimeMs } = statSync(claudeMdPath);
        const staleThresholdMs = 70 * 60 * 1000;
        if (Date.now() - mtimeMs > staleThresholdMs) {
          emitAlert(projectRoot, currentSprintId, {
            type: 'stale_md',
            message: `CLAUDE.md has not been updated in over 70 minutes (mtime: ${new Date(mtimeMs).toISOString()})`,
            source: 'auditor:stale_md_detector',
            mtimeMs,
          });
        }
      }
    } catch {
      // stale_md check failure must not break scan loop
    }

    // Sprint 138: Emit lock state snapshot to event stream
    if (lockResult.locks.length > 0) {
      try {
        writeEvent(
          projectRoot, currentSprintId, 'auditor', 'brain',
          CHANNELS.SCOPE_COLLISION_DETECTED,
          {
            type: 'lock_state_snapshot',
            lockCount: lockResult.locks.length,
            staleLockCount: lockResult.staleLocks.length,
            locks: lockResult.locks.map(l => ({
              filePath: l.filePath,
              ownerWorkerId: l.ownerWorkerId,
            })),
          },
        );
      } catch {
        // Event stream write failure must not break scan loop
      }
    }

    return {
      heartbeats: hbResult.heartbeats,
      violations: allViolations,
      alerts: allAlerts,
      locks: lockResult.locks,
      dependencyViolations: depViolations,
    };
  } catch {
    return {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
      dependencyViolations: [],
    };
  }
}

export function startScanLoop(
  projectRoot: string,
  currentSprintId: string,
  intervalMs?: number,
  onScanComplete?: (result: ScanResult) => void,
  autoCleanLocks = false,
  scanOpts?: ScanOptions,
): ReturnType<typeof setInterval> {
  const interval = intervalMs ?? 30_000;
  const mergedOpts: ScanOptions = { autoCleanLocks, ...scanOpts };

  const runScan = (): void => {
    try {
      const result = runScanCycle(projectRoot, currentSprintId, mergedOpts);
      if (onScanComplete) {
        try { onScanComplete(result); } catch { /* callback must not kill loop */ }
      }
    } catch {
      // Scan loop must not die
    }
  };

  return setInterval(() => {
    // Sprint 279 (WK-7): warm the liveness cache with parallel async probes BEFORE
    // the synchronous scan, so per-worker stale detection reads cached verdicts
    // instead of blocking on O(n) serial spawnSync probes. When there are no active
    // workers the async path is skipped (no await), so the scan still runs
    // synchronously within this tick — preserving the existing loop timing.
    let active: Heartbeat[] = [];
    try { active = collectActiveHeartbeats(projectRoot); } catch { active = []; }
    if (active.length === 0) {
      runScan();
      return;
    }
    void batchProbeLiveness(active)
      .catch(() => undefined) // probe refresh must never kill the loop
      .then(runScan);
  }, interval);
}

export function scanResultFiles(projectRoot: string): {
  resultCount: number;
  doneTaskIds: Set<string>;
} {
  const tasksDir = join(projectRoot, TASKS_DIR);
  const doneTaskIds = new Set<string>();

  if (!existsSync(tasksDir)) {
    return { resultCount: 0, doneTaskIds };
  }

  const files = readdirSync(tasksDir).filter(
    (f) => f.startsWith('task-') && f.endsWith('.result'),
  );

  for (const file of files) {
    // Extract task ID from filename: task-{id}.result
    const taskId = file.replace(/^task-/, '').replace(/\.result$/, '');
    doneTaskIds.add(taskId);
  }

  return { resultCount: files.length, doneTaskIds };
}

const ALERT_MAX = 50;

/**
 * Merges incoming alerts into existing ones with dedup by source+message.
 * Duplicate alerts increment `count` rather than creating a new entry.
 * Result is capped at ALERT_MAX (oldest alerts removed first).
 */
export function deduplicateAlerts(existing: Alert[], incoming: Alert[]): Alert[] {
  const merged = [...existing];

  for (const alert of incoming) {
    const key = `${alert.source ?? ''}::${alert.message}`;
    const idx = merged.findIndex(
      (a) => `${a.source ?? ''}::${a.message}` === key,
    );

    if (idx !== -1) {
      const existing = merged[idx];
      if (existing) {
        merged[idx] = {
          ...existing,
          count: (existing.count ?? 1) + 1,
          timestamp: alert.timestamp,
        };
      }
    } else {
      merged.push({ ...alert, count: 1 });
    }
  }

  return merged.slice(-ALERT_MAX);
}

export function writeScanToDashboard(
  projectRoot: string,
  sprintInfo: { id: string; number: number; phase: string; status: string },
  scanResult: ScanResult,
): void {
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  let existing: DashboardState | null = null;
  try {
    if (existsSync(dashPath)) {
      // safe: dashboard file is always written by updateDashboard with DashboardState shape
      existing = JSON.parse(readFileSync(dashPath, 'utf-8')) as DashboardState;
    }
  } catch { /* start fresh */ }

  // Merge alerts with deduplication
  const mergedAlerts = deduplicateAlerts(existing?.alerts ?? [], scanResult.alerts);

  // Scan .result files to determine done task count
  const { resultCount, doneTaskIds } = scanResultFiles(projectRoot);

  // Active workers = heartbeats whose task does NOT yet have a .result file
  const activeWorkerCount = scanResult.heartbeats.filter(
    (hb) => !doneTaskIds.has(hb.taskId),
  ).length;

  // Update agent statuses from heartbeats and .result files
  const agents = (existing?.agents ?? []).map(agent => {
    // If agent's task has a result file, mark as DONE
    if (agent.taskId && doneTaskIds.has(agent.taskId)) {
      return { ...agent, status: AgentStatus.DONE };
    }
    const hb = scanResult.heartbeats.find(h => h.workerId === agent.id);
    if (hb) {
      return { ...agent, status: hb.status, currentAction: hb.currentAction, lastHeartbeat: hb.timestamp };
    }
    return agent;
  });

  const existingProgress = existing?.progress ?? { done: 0, active: 0, blocked: 0, total: 0 };

  updateDashboard(projectRoot, {
    // safe: sprintInfo fields (id, number, phase, status) match DashboardState['sprint'] — caller provides correct shape
    sprint: sprintInfo as DashboardState['sprint'],
    agents,
    progress: {
      ...existingProgress,
      done: resultCount,
      active: activeWorkerCount,
    },
    alerts: mergedAlerts,
    updatedAt: new Date().toISOString(),
    auditorLastScan: new Date().toISOString(),
    violations: scanResult.violations.length,
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Code-Verified DONE Reconciliation (migrated from result-evaluator.ts — Sprint 138)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Sentinel constant for tasks that were physically verified as DONE despite
 * a missing or spurious NO_GO `.result` file.
 *
 * Pattern: Docker worker writes code but container dies before writing `.result`
 * → Brain auto-generates NO_GO → FIX worker confirms "code already there" → loop.
 * This flag breaks the cycle by letting Brain verify code on disk directly.
 */
export const CODE_VERIFIED_DONE = 'CODE_VERIFIED_DONE' as const;

/**
 * Auto-generated NO_GO note pattern produced by spawn-backend-docker.ts
 * when a Docker worker exits without writing a .result file.
 */
const DOCKER_NO_RESULT_PATTERN = 'Docker worker exited without writing result file';

/**
 * Options for dependency injection in tryCodeVerifiedDone.
 * Allows tests to override shell commands and filesystem access.
 */
export interface CodeVerifyOptions {
  /** Override git status check (for testing) */
  runGitStatus?: (filePath: string, projectRoot: string) => { modified: boolean; error?: string } | Promise<{ modified: boolean; error?: string }>;
  /** Override grep/evidence check (for testing) */
  runGrepEvidence?: (cmd: string, projectRoot: string) => { hit: boolean; error?: string } | Promise<{ hit: boolean; error?: string }>;
  /** Override file existence check (for testing) */
  fileExists?: (filePath: string) => boolean | Promise<boolean>;
  /** Override task JSON reader (for testing) */
  readTaskJson?: (taskId: string, projectRoot: string) => Task | null | Promise<Task | null>;
  /** Override result file reader (for testing) */
  readResultJson?: (taskId: string, projectRoot: string) => TaskResult | null | Promise<TaskResult | null>;
}

/**
 * Result of tryCodeVerifiedDone — describes whether code was physically
 * verified on disk and the reconciliation outcome.
 */
export interface CodeVerifyResult {
  /** Whether reconciliation was triggered (conditions met) */
  triggered: boolean;
  /** Whether code was verified as done (all checks passed) */
  verified: boolean;
  /** Human-readable reason for the outcome */
  reason: string;
  /** List of files that were verified as modified/created */
  verifiedFiles: string[];
  /** Whether evidence grep command matched */
  evidenceMatched: boolean;
}

/**
 * Attempt to reconcile a spurious NO_GO by physically verifying code on disk.
 *
 * This helper is called during EVALUATE or FIX phase when a task's `.result`
 * is either MISSING or contains a NO_GO with the Docker auto-generated note.
 *
 * Algorithm:
 * 1. Read task JSON → get `scope.filesWrite`
 * 2. For each file: `git status --porcelain {file}` → check if new/modified
 * 3. Parse "Kanıt" (evidence) grep command from task description
 * 4. Run evidence command if found
 * 5. If files modified + evidence hit → CODE_VERIFIED_DONE
 * 6. Otherwise → honest NO_GO
 *
 * Fail-safe: any error → returns { verified: false } (honest NO_GO preserved).
 */
export async function tryCodeVerifiedDone(
  taskId: string,
  projectRoot: string,
  options?: CodeVerifyOptions,
): Promise<CodeVerifyResult> {
  const NOT_TRIGGERED: CodeVerifyResult = {
    triggered: false,
    verified: false,
    reason: 'Reconciliation not triggered',
    verifiedFiles: [],
    evidenceMatched: false,
  };

  const fileExistsFn = options?.fileExists ?? defaultAsyncFileExists;
  const readTaskJsonFn = options?.readTaskJson ?? defaultReadTaskJson;
  const readResultJsonFn = options?.readResultJson ?? defaultReadResultJson;
  const runGitStatusFn = options?.runGitStatus ?? defaultRunGitStatus;
  const runGrepEvidenceFn = options?.runGrepEvidence ?? defaultRunGrepEvidence;

  // ── Step 0: Check if reconciliation should be triggered ──────────
  const resultPath = join(projectRoot, '.tasks', `task-${taskId}.result`);
  const resultExists = await fileExistsFn(resultPath);
  let isDockerNoResult = false;

  if (resultExists) {
    // Result file exists — check if it's a Docker auto-generated NO_GO
    const result = await readResultJsonFn(taskId, projectRoot);
    if (!result) {
      return { ...NOT_TRIGGERED, reason: 'Result file exists but unreadable' };
    }
    // If selfAssessment is already DONE → no reconciliation needed
    if (result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT') {
      return { ...NOT_TRIGGERED, reason: `Result already ${result.selfAssessment} — no reconciliation needed` };
    }
    // Check for Docker auto-generated NO_GO pattern
    if (result.selfAssessment === 'NO_GO' && result.notes?.includes(DOCKER_NO_RESULT_PATTERN)) {
      isDockerNoResult = true;
    } else {
      return { ...NOT_TRIGGERED, reason: 'NO_GO is not Docker auto-generated — honest failure' };
    }
  } else {
    // Result file missing entirely — Docker worker died before writing
    isDockerNoResult = true;
  }

  if (!isDockerNoResult) {
    return NOT_TRIGGERED;
  }

  debugLog('tryCodeVerifiedDone', `Reconciliation triggered for task ${taskId}`);

  // ── Step 1: Read task JSON → get scope.filesWrite ────────────────
  let task: Task | null;
  try {
    task = await readTaskJsonFn(taskId, projectRoot);
  } catch {
    return {
      triggered: true,
      verified: false,
      reason: 'Failed to read task JSON — fail-safe NO_GO',
      verifiedFiles: [],
      evidenceMatched: false,
    };
  }

  if (!task) {
    return {
      triggered: true,
      verified: false,
      reason: 'Task JSON not found — fail-safe NO_GO',
      verifiedFiles: [],
      evidenceMatched: false,
    };
  }

  const filesWrite = task.scope?.filesWrite ?? [];
  if (filesWrite.length === 0) {
    return {
      triggered: true,
      verified: false,
      reason: 'No filesWrite in task scope — cannot verify code',
      verifiedFiles: [],
      evidenceMatched: false,
    };
  }

  // ── Step 2: Check git status for each filesWrite ─────────────────
  const verifiedFiles: string[] = [];
  for (const filePath of filesWrite) {
    try {
      const status = await runGitStatusFn(filePath, projectRoot);
      if (status.error) {
        debugLog('tryCodeVerifiedDone:gitStatus', `Error for ${filePath}: ${status.error}`);
        continue;
      }
      if (status.modified) {
        verifiedFiles.push(filePath);
      }
    } catch (e) {
      debugLog('tryCodeVerifiedDone:gitStatus', `Exception for ${filePath}: ${e}`);
      // Fail-safe: skip this file, don't crash
    }
  }

  if (verifiedFiles.length === 0) {
    return {
      triggered: true,
      verified: false,
      reason: 'No files were modified/created on disk — honest NO_GO',
      verifiedFiles: [],
      evidenceMatched: false,
    };
  }

  // ── Step 3: Parse evidence grep from task description ────────────
  const evidenceCmd = parseEvidenceCommand(task.description);
  let evidenceMatched = false;

  if (evidenceCmd) {
    try {
      const grepResult = await runGrepEvidenceFn(evidenceCmd, projectRoot);
      if (grepResult.error) {
        debugLog('tryCodeVerifiedDone:evidence', `Evidence check error: ${grepResult.error}`);
        // Evidence failed → code is there but unverified
        // Still count as verified if files are modified (evidence is bonus)
      } else {
        evidenceMatched = grepResult.hit;
      }
    } catch (e) {
      debugLog('tryCodeVerifiedDone:evidence', `Evidence check exception: ${e}`);
    }
  } else {
    // No evidence command in description — files-only verification
    // Treat as evidence matched if we can't test it
    evidenceMatched = true;
  }

  // ── Step 4: Final decision ───────────────────────────────────────
  // Files verified + (evidence matched OR no evidence command) → CODE_VERIFIED_DONE
  if (verifiedFiles.length > 0 && evidenceMatched) {
    const reason = `Code physically verified despite missing .result (Sprint 135 docker HB shutdown bug pattern). ` +
      `Verified files: ${verifiedFiles.join(', ')}`;

    debugLog('tryCodeVerifiedDone', `CODE_VERIFIED_DONE for task ${taskId}: ${verifiedFiles.length} files verified`);

    return {
      triggered: true,
      verified: true,
      reason,
      verifiedFiles,
      evidenceMatched,
    };
  }

  // Files exist but evidence didn't match — code might be incomplete
  return {
    triggered: true,
    verified: false,
    reason: `Files modified (${verifiedFiles.join(', ')}) but evidence check failed — honest NO_GO`,
    verifiedFiles,
    evidenceMatched: false,
  };
}

/**
 * Rewrite a task's .result file with CODE_VERIFIED_DONE status.
 * Called after tryCodeVerifiedDone confirms code is on disk.
 */
export async function writeCodeVerifiedResult(
  taskId: string,
  projectRoot: string,
  verifyResult: CodeVerifyResult,
): Promise<void> {
  const resultPath = join(projectRoot, '.tasks', `task-${taskId}.result`);
  const result: Record<string, unknown> = {
    taskId,
    filesChanged: verifyResult.verifiedFiles,
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: verifyResult.reason,
    codeVerified: CODE_VERIFIED_DONE,
  };
  try {
    await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
    debugLog('writeCodeVerifiedResult', `Wrote CODE_VERIFIED_DONE result for task ${taskId}`);
  } catch (e) {
    debugLog('writeCodeVerifiedResult', `Failed to write result for task ${taskId}: ${e}`);
  }
}

/**
 * Parse evidence (Kanıt) grep command from task description.
 * Looks for patterns like:
 *   **Kanıt:** `grep -n "pattern" file` → hit
 *   **Kanıt:** `command` → expected
 */
export function parseEvidenceCommand(description: string): string | null {
  // Match: **Kanıt:** `command` or **Kanıt:** `command` → ...
  const match = description.match(/\*\*Kan[ıi]t:?\*\*\s*`([^`]+)`/i);
  if (!match?.[1]) return null;
  const cmd = match[1].trim();
  // Only allow grep-like commands for safety
  if (cmd.startsWith('grep') || cmd.startsWith('wc') || cmd.startsWith('ls') || cmd.startsWith('cat') || cmd.startsWith('test')) {
    return cmd;
  }
  return null;
}

// ─── Async file existence helper ─────────────────────────────────────

async function defaultAsyncFileExists(filePath: string): Promise<boolean> {
  return stat(filePath).then(() => true, () => false);
}

// ─── Default implementations for tryCodeVerifiedDone ────────────────

async function defaultReadTaskJson(taskId: string, projectRoot: string): Promise<Task | null> {
  try {
    const taskPath = join(projectRoot, '.tasks', `task-${taskId}.json`);
    const content = await readFile(taskPath, 'utf-8');
    return JSON.parse(content) as Task;
  } catch {
    return null;
  }
}

async function defaultReadResultJson(taskId: string, projectRoot: string): Promise<TaskResult | null> {
  try {
    const resultPath = join(projectRoot, '.tasks', `task-${taskId}.result`);
    const content = await readFile(resultPath, 'utf-8');
    return JSON.parse(content) as TaskResult;
  } catch {
    return null;
  }
}

function defaultRunGitStatus(filePath: string, projectRoot: string): { modified: boolean; error?: string } {
  try {
    const result = spawnSync('git', ['status', '--porcelain', filePath], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.error) {
      return { modified: false, error: `git status failed: ${result.error}` };
    }
    const output = (result.stdout ?? '').trim();
    // git status --porcelain output: ' M file', 'M  file', 'A  file', '?? file', 'AM file', etc.
    // Any non-empty output means the file has been modified/added/created
    return { modified: output.length > 0 };
  } catch (e) {
    return { modified: false, error: `git status exception: ${e}` };
  }
}

function defaultRunGrepEvidence(cmd: string, projectRoot: string): { hit: boolean; error?: string } {
  try {
    // Run the evidence command via shell
    const result = spawnSync('sh', ['-c', cmd], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 15_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // grep returns 0 if match found, 1 if no match, 2+ on error
    if (result.error) {
      return { hit: false, error: `Evidence command failed: ${result.error}` };
    }
    return { hit: result.status === 0 };
  } catch (e) {
    return { hit: false, error: `Evidence command exception: ${e}` };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 3-Pipeline Verification System (Sprint 138 — KILLER FEATURE)
// ═══════════════════════════════════════════════════════════════════════

/** Verification verdict from the 3-pipeline system */
export type VerificationVerdict = 'PASS' | 'DOWNGRADE' | 'FAIL';

/** Result of the 3-pipeline verification */
export interface VerificationResult {
  verdict: VerificationVerdict;
  reason: string;
  /** New status to set if verdict is DOWNGRADE */
  newStatus?: 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** Affected test files that were checked */
  affectedTests?: string[];
  /** Test run results (if applicable) */
  testResults?: { pass: number; fail: number; total: number };
}

/**
 * Infer which test files are affected by a set of changed source files.
 * Convention: `src/foo/bar.ts` → `tests/foo/bar.test.ts`
 */
export function inferAffectedTests(filesChanged: string[]): string[] {
  const testFiles: string[] = [];
  for (const file of filesChanged) {
    // Skip non-source files
    if (!file.startsWith('src/')) continue;
    // Skip test files themselves
    if (file.includes('.test.') || file.includes('.spec.')) continue;

    // src/foo/bar.ts → tests/foo/bar.test.ts
    const testPath = file
      .replace(/^src\//, 'tests/')
      .replace(/\.ts$/, '.test.ts');
    testFiles.push(testPath);
  }
  return testFiles;
}

/**
 * Run vitest on specific test files and return pass/fail counts.
 * Fail-safe: on any error, returns { pass: 0, fail: 0, total: 0 }.
 */
export function runVitestOnFiles(testFiles: string[], projectRoot: string): { pass: number; fail: number; total: number } {
  if (testFiles.length === 0) return { pass: 0, fail: 0, total: 0 };

  // Filter to only test files that exist
  const existingFiles = testFiles.filter(f => existsSync(join(projectRoot, f)));
  if (existingFiles.length === 0) return { pass: 0, fail: 0, total: 0 };

  try {
    const result = spawnSync('npx', ['vitest', 'run', '--reporter=json', ...existingFiles], {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Try to parse JSON output
    const stdout = result.stdout ?? '';
    try {
      // Vitest JSON reporter outputs JSON to stdout
      const jsonMatch = stdout.match(/\{[\s\S]*"testResults"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          numPassedTests?: number;
          numFailedTests?: number;
          numTotalTests?: number;
          testResults?: Array<{ numPassingTests?: number; numFailingTests?: number }>;
        };
        const pass = parsed.numPassedTests ?? 0;
        const fail = parsed.numFailedTests ?? 0;
        return { pass, fail, total: pass + fail };
      }
    } catch { /* JSON parse failed, fall through to heuristic */ }

    // Heuristic fallback: check exit code
    if (result.status === 0) {
      return { pass: existingFiles.length, fail: 0, total: existingFiles.length };
    }
    // Non-zero exit = some tests failed
    return { pass: 0, fail: existingFiles.length, total: existingFiles.length };
  } catch {
    return { pass: 0, fail: 0, total: 0 };
  }
}

/**
 * Verify a DONE self-assessment by running affected tests.
 * If tests fail, the task is downgraded to GO_WITH_TECH_DEBT.
 */
export async function verifyFunctional(
  _taskId: string,
  projectRoot: string,
  result: TaskResult,
): Promise<VerificationResult> {
  const affectedTests = inferAffectedTests(result.filesChanged);

  if (affectedTests.length === 0) {
    return { verdict: 'PASS', reason: 'No affected test files found — pass by default' };
  }

  const vitestResult = runVitestOnFiles(affectedTests, projectRoot);

  if (vitestResult.total === 0) {
    return { verdict: 'PASS', reason: 'No existing test files found for affected sources', affectedTests };
  }

  if (vitestResult.fail === 0) {
    return {
      verdict: 'PASS',
      reason: `All ${vitestResult.pass} affected tests pass`,
      affectedTests,
      testResults: vitestResult,
    };
  }

  return {
    verdict: 'DOWNGRADE',
    newStatus: 'GO_WITH_TECH_DEBT',
    reason: `${vitestResult.fail}/${vitestResult.total} tests still failing — downgrade to TECH_DEBT`,
    affectedTests,
    testResults: vitestResult,
  };
}

/**
 * Validate a GO_WITH_TECH_DEBT self-assessment.
 * Checks that the worker actually documented the tech debt.
 */
export async function validateTechDebt(
  _taskId: string,
  _projectRoot: string,
  result: TaskResult,
): Promise<VerificationResult> {
  // Check that notes explain the tech debt
  if (!result.notes || result.notes.length < 20) {
    return {
      verdict: 'DOWNGRADE',
      newStatus: 'NO_GO',
      reason: 'GO_WITH_TECH_DEBT but no meaningful tech debt explanation in notes',
    };
  }
  return { verdict: 'PASS', reason: 'Tech debt self-assessment accepted — notes provided' };
}

/**
 * 3-Pipeline Verification — dispatch to the appropriate verification pipeline
 * based on the worker's self-assessment.
 *
 * Pipeline 1 (NO_GO): tryCodeVerifiedDone — check if code exists despite NO_GO
 * Pipeline 2 (GO_WITH_TECH_DEBT): validateTechDebt — check notes quality
 * Pipeline 3 (DONE): verifyFunctional — run affected tests
 *
 * Sprint 139: emits AUDITOR→BRAIN:VERIFICATION_RESULT to event stream after verification.
 * @param sprintId - Active sprint ID for event stream routing. If omitted, event is skipped.
 */
export async function verifyWorkerResult(
  taskId: string,
  projectRoot: string,
  result: TaskResult,
  sprintId?: string,
): Promise<VerificationResult> {
  let verification: VerificationResult;

  switch (result.selfAssessment) {
    case 'NO_GO': {
      const codeVerify = await tryCodeVerifiedDone(taskId, projectRoot);
      if (codeVerify.triggered && codeVerify.verified) {
        verification = { verdict: 'PASS', reason: `CODE_VERIFIED_DONE: ${codeVerify.reason}` };
      } else {
        verification = { verdict: 'FAIL', reason: `Honest NO_GO: ${codeVerify.reason}` };
      }
      break;
    }
    case 'GO_WITH_TECH_DEBT':
      verification = await validateTechDebt(taskId, projectRoot, result);
      break;
    case 'DONE':
      verification = await verifyFunctional(taskId, projectRoot, result);
      break;
    default:
      verification = { verdict: 'FAIL', reason: `Unknown selfAssessment: ${result.selfAssessment}` };
  }

  // Emit VERIFICATION_RESULT event (ADR-035, channel: AUDITOR→BRAIN:VERIFICATION_RESULT)
  if (sprintId) {
    emitVerificationEvent(projectRoot, sprintId, {
      taskId,
      verdict: verification.verdict,
      status: verification.newStatus,
      reason: verification.reason,
    });
  }

  return verification;
}

// ═══════════════════════════════════════════════════════════════════════
// ADR Compliance Check — Pilot (Sprint 138)
// ═══════════════════════════════════════════════════════════════════════

/** A parsed ADR entry from DECISIONS.md */
export interface ParsedADR {
  id: string;
  title: string;
  status: string;
  enforcementRule?: ADREnforcementRule;
}

/** An enforcement rule for an ADR */
export interface ADREnforcementRule {
  type: 'grep_forbid' | 'grep_require' | 'count_check';
  pattern?: string;
  targetFiles?: string[];
  maxCount?: number;
}

/** An ADR violation found by compliance check */
export interface ADRViolation {
  adrId: string;
  adrTitle: string;
  violation: string;
  severity: 'error' | 'warning';
}

/**
 * Parse ADR entries from DECISIONS.md markdown content.
 * Extracts: ADR ID, title, status.
 */
export function parseADRs(content: string): ParsedADR[] {
  const adrs: ParsedADR[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Match: ## ADR-NNN: Title or ## ADR-NNN Title
    const adrMatch = line.match(/^##\s+ADR-(\d+)[:\s]+(.+)/);
    if (!adrMatch) continue;

    const id = `ADR-${adrMatch[1]}`;
    const title = (adrMatch[2] ?? '').trim();

    // Look for Status in next few lines
    let status = 'accepted';
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const statusLine = lines[j] ?? '';
      const statusMatch = statusLine.match(/^\*\*Status:\*\*\s*(.+)/i);
      if (statusMatch) {
        status = (statusMatch[1] ?? 'accepted').trim().toLowerCase();
        break;
      }
      // Stop if we hit another heading
      if (statusLine.startsWith('## ')) break;
    }

    adrs.push({ id, title, status });
  }

  return adrs;
}

// Pilot enforcement rules for Sprint 138
const PILOT_ADR_RULES: Map<string, ADREnforcementRule> = new Map([
  // ADR-006: spawnSync must use array args, not shell:true
  ['ADR-006', {
    type: 'grep_forbid',
    pattern: 'spawnSync.*shell.*true',
    targetFiles: ['src/'],
  } as ADREnforcementRule],
  // ADR-008: Brain is the ONLY module that imports tmux/auditor/worker
  ['ADR-008', {
    type: 'grep_forbid',
    pattern: 'from.*brain',
    targetFiles: ['src/orchestra/tmux.ts', 'src/monitor/auditor.ts', 'src/agents/worker.ts'],
  } as ADREnforcementRule],
  // ADR-010: Minimal runtime dependencies
  ['ADR-010', {
    type: 'count_check',
    maxCount: 3,
  } as ADREnforcementRule],
]);

/**
 * Check ADR compliance for changed files against pilot enforcement rules.
 * Returns violations found.
 *
 * Sprint 139: emits AUDITOR→BRAIN:ADR_VIOLATION to event stream when violations exist.
 * @param sprintId - Active sprint ID for event stream routing. If omitted, event is skipped.
 */
export function checkADRCompliance(
  projectRoot: string,
  changedFiles: string[],
  sprintId?: string,
): ADRViolation[] {
  const violations: ADRViolation[] = [];

  // DB-first: load ADRs from MemoryStore
  let adrs: ParsedADR[] = [];
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  try {
    if (existsSync(dbPath)) {
      const store = new MemoryStore(dbPath);
      try {
        const adrEntries = store.getByType('adr');
        adrs = adrEntries.map(e => ({
          id: e.id.replace(/^adr-/i, 'ADR-'),  // adr-006 → ADR-006 (match PILOT_ADR_RULES keys)
          title: e.title,
          status: e.status,
        }));
      } finally { store.close(); }
    }
  } catch { /* DB failed, fall through to V1 */ }

  // No DB or no ADR entries — skip compliance check
  if (adrs.length === 0) {
    return violations;
  }

  for (const adr of adrs) {
    if (adr.status !== 'accepted') continue;

    const rule = PILOT_ADR_RULES.get(adr.id);
    if (!rule) continue;

    // Attach rule to parsed ADR for reporting
    adr.enforcementRule = rule;

    switch (rule.type) {
      case 'grep_forbid': {
        if (!rule.pattern) break;
        const regex = new RegExp(rule.pattern, 'i');
        const filesToCheck = rule.targetFiles
          ? changedFiles.filter(f => rule.targetFiles!.some(t => f.startsWith(t) || f === t))
          : changedFiles;

        for (const file of filesToCheck) {
          const fullPath = join(projectRoot, file);
          try {
            const content = readFileSync(fullPath, 'utf-8');
            if (regex.test(content)) {
              violations.push({
                adrId: adr.id,
                adrTitle: adr.title,
                violation: `File ${file} matches forbidden pattern: ${rule.pattern}`,
                severity: 'error',
              });
            }
          } catch { /* file not readable — skip */ }
        }
        break;
      }
      case 'count_check': {
        if (rule.maxCount === undefined) break;
        try {
          const pkgPath = join(projectRoot, 'package.json');
          const pkgContent = readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgContent) as { dependencies?: Record<string, string> };
          const depCount = Object.keys(pkg.dependencies ?? {}).length;
          if (depCount > rule.maxCount) {
            violations.push({
              adrId: adr.id,
              adrTitle: adr.title,
              violation: `Runtime dependency count (${depCount}) exceeds max (${rule.maxCount})`,
              severity: 'warning',
            });
          }
        } catch { /* package.json not readable — skip */ }
        break;
      }
    }
  }

  // Emit ADR_VIOLATION event if violations found (Sprint 139 real wire)
  if (sprintId && violations.length > 0) {
    emitADRViolationEvent(projectRoot, sprintId, violations, changedFiles);
  }

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// Event Stream Hook Points (Sprint 139 — Real Wire)
// Replaces Sprint 138 fallback mode (require() CommonJS pattern removed).
// All 5 channels now use writeEvent() directly per ADR-035 V1.0.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Write a VERIFICATION_RESULT event to the event stream.
 * Sprint 138 fallback (require+appendFileSync) replaced with writeEvent().
 * Fail-safe: write failure never crashes the caller.
 */
export function emitVerificationEvent(
  projectRoot: string,
  sprintId: string,
  payload: { taskId: string; verdict: string; status?: string; reason: string },
): void {
  try {
    writeEvent(
      projectRoot,
      sprintId,
      'auditor',
      'brain',
      CHANNELS.VERIFICATION_RESULT,
      payload,
    );
  } catch {
    // Fail-safe — never crash on event emission
    debugLog('emitVerificationEvent', `writeEvent failed for ${JSON.stringify(payload)}`);
  }
}

/**
 * Write an ADR_VIOLATION event to the event stream.
 * Called by checkADRCompliance when violations are found.
 */
export function emitADRViolationEvent(
  projectRoot: string,
  sprintId: string,
  violations: ADRViolation[],
  changedFiles: string[],
): void {
  if (violations.length === 0) return;
  try {
    writeEvent(
      projectRoot,
      sprintId,
      'auditor',
      'brain',
      CHANNELS.ADR_VIOLATION,
      {
        violationCount: violations.length,
        violations: violations.map(v => ({
          adrId: v.adrId,
          adrTitle: v.adrTitle,
          violation: v.violation,
          severity: v.severity,
        })),
        changedFiles,
      },
    );
  } catch {
    // Fail-safe
    debugLog('emitADRViolationEvent', `writeEvent failed for ${violations.length} violations`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Orphan HB Cleanup (Sprint 139 — Task 016)
// Coordinator restart recovery: Brain crash → new Brain → old worker HB files orphan.
// ═══════════════════════════════════════════════════════════════════════

/** Result of an orphan HB detection scan. */
export interface OrphanHBResult {
  /** Task IDs found in .tasks/*.hb that are NOT in the active sprint task list */
  orphanTaskIds: string[];
  /** Full paths to orphan HB files */
  orphanHBPaths: string[];
}

/**
 * Detect orphan heartbeat files.
 *
 * A heartbeat is "orphan" when its task ID does not appear in any
 * currently active task JSON file (i.e., the coordinator crashed and
 * was restarted with a fresh task list, leaving old .hb files behind).
 *
 * Sprint 134 canlı kanıt: Brain crash → yeni Brain → eski worker HB dosyaları orphan.
 *
 * @param projectRoot - Project root directory
 * @param activeTaskIds - Set of task IDs belonging to the current sprint.
 *   If omitted, the function reads all `.tasks/task-*.json` files to build
 *   the active set (auto-discovery mode for Brain boot use).
 */
export function detectOrphans(
  projectRoot: string,
  activeTaskIds?: Set<string>,
): OrphanHBResult {
  const tasksDir = join(projectRoot, TASKS_DIR);
  const orphanTaskIds: string[] = [];
  const orphanHBPaths: string[] = [];

  if (!existsSync(tasksDir)) {
    return { orphanTaskIds, orphanHBPaths };
  }

  // Build active task ID set from disk if not provided (auto-discovery)
  let activeTasks: Set<string>;
  if (activeTaskIds) {
    activeTasks = activeTaskIds;
  } else {
    activeTasks = new Set<string>();
    const jsonFiles = readdirSync(tasksDir).filter(
      (f) => f.startsWith('task-') && f.endsWith('.json'),
    );
    for (const f of jsonFiles) {
      const taskId = f.replace(/^task-/, '').replace(/\.json$/, '');
      activeTasks.add(taskId);
    }
  }

  // Scan all HB files — any whose task ID is absent from active set is an orphan
  const hbFiles = readdirSync(tasksDir).filter((f) => f.endsWith('.hb'));
  for (const hbFile of hbFiles) {
    // task-{id}.hb → id
    const taskId = hbFile.replace(/^task-/, '').replace(/\.hb$/, '');
    if (!activeTasks.has(taskId)) {
      orphanTaskIds.push(taskId);
      orphanHBPaths.push(join(tasksDir, hbFile));
    }
  }

  return { orphanTaskIds, orphanHBPaths };
}

/**
 * Clean up orphan HB files.
 *
 * For each orphan task:
 * 1. Moves the .hb file to `.brain/archive/sprint-NNN-orphan-hb/`
 * 2. Releases any file locks held by the orphan worker (via clearOrphanLocks)
 * 3. Emits `AUDITOR→BRAIN:ORPHAN_HB_DETECTED` event to the event stream
 *
 * Fail-safe: any I/O error for a single orphan is logged and skipped —
 * other orphans are still processed.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID (used for archive directory name and event stream)
 * @param activeTaskIds - Optional set of active task IDs (passed to detectOrphans)
 */
export function cleanupOrphanHBs(
  projectRoot: string,
  sprintId: string,
  activeTaskIds?: Set<string>,
): {
  archived: string[];
  locksReleased: string[];
  orphanCount: number;
} {
  const { orphanTaskIds, orphanHBPaths } = detectOrphans(projectRoot, activeTaskIds);

  if (orphanTaskIds.length === 0) {
    return { archived: [], locksReleased: [], orphanCount: 0 };
  }

  // Prepare archive directory: .brain/archive/{sprintId}-orphan-hb/
  const archiveDir = join(projectRoot, BRAIN_DIR, ARCHIVE_DIR, `${sprintId}-orphan-hb`);
  try {
    mkdirSync(archiveDir, { recursive: true });
  } catch {
    // If archive dir cannot be created, we still attempt lock cleanup and event emit
  }

  const archived: string[] = [];

  // 1. Archive each orphan HB file
  for (const hbPath of orphanHBPaths) {
    try {
      const fileName = hbPath.split('/').pop() ?? hbPath.split('\\').pop() ?? hbPath;
      const dest = join(archiveDir, fileName);
      renameSync(hbPath, dest);
      archived.push(hbPath);
      debugLog('auditor:cleanupOrphanHBs', `Archived orphan HB: ${hbPath} → ${dest}`);
    } catch {
      // Non-fatal: log and continue
      debugLog('auditor:cleanupOrphanHBs', `Failed to archive orphan HB: ${hbPath}`);
    }
  }

  // 2. Build set of active worker IDs from active task HB files (post-cleanup)
  //    and release locks whose owner is not in the active set
  const tasksDir = join(projectRoot, TASKS_DIR);
  const activeWorkerIds = new Set<string>();
  if (existsSync(tasksDir)) {
    const remainingHBFiles = readdirSync(tasksDir).filter((f) => f.endsWith('.hb'));
    for (const f of remainingHBFiles) {
      const hbPath = join(tasksDir, f);
      const hb = readJsonSafe<{ workerId?: string }>(hbPath);
      if (hb?.workerId) activeWorkerIds.add(hb.workerId);
    }
  }
  // Also add worker IDs from orphan HBs so we know which ones to purge
  // (already moved — we get their IDs from the task IDs, but they're gone from disk)
  const locksReleased = clearOrphanLocks(projectRoot, activeWorkerIds);

  // 3. Emit event to stream
  try {
    writeEvent(
      projectRoot, sprintId, 'auditor', 'brain',
      CHANNELS.ORPHAN_HB_DETECTED,
      {
        orphanCount: orphanTaskIds.length,
        archivedCount: archived.length,
        locksReleasedCount: locksReleased.length,
        orphanTaskIds,
        locksReleased,
      },
    );
  } catch {
    // Fail-safe — event stream write must not crash cleanup
  }

  metric('orphan_hb.detected', orphanTaskIds.length, { sprintId });

  return { archived, locksReleased, orphanCount: orphanTaskIds.length };
}

// ═══════════════════════════════════════════════════════════════════════
// Dependency Violation Alert (Sprint 139 — Task 032)
// Detects workers executing before their declared dependencies are done.
// ═══════════════════════════════════════════════════════════════════════

/** A dependency violation: worker started before its dep was completed. */
export interface DependencyViolation {
  /** Worker ID that violated dependency order */
  workerId: string;
  /** Task ID being executed by the violating worker */
  taskId: string;
  /** Dependency task IDs that are not yet DONE */
  unresolvedDeps: string[];
  /** Status of each unresolved dependency (for context) */
  depStatuses: Record<string, string>;
  /** ISO timestamp of detection */
  timestamp: string;
}

/**
 * Detect workers that are executing before their declared dependencies are done.
 *
 * Algorithm:
 * 1. Read all active heartbeats (.hb files with EXECUTING/CLAIMING status)
 * 2. For each active worker, read its task JSON to get `dependencies`
 * 3. Read each dep task JSON and check its status
 * 4. If any dep is not DONE or GO_WITH_TECH_DEBT → violation
 * 5. Emit AUDITOR→BRAIN:DEPENDENCY_VIOLATION event to event stream
 *
 * Note: DONE_SET (DONE, GO_WITH_TECH_DEBT) is treated as "dependency satisfied".
 * A dep with NO_GO triggers cascade blocking (handled in sprint-spawner), not here.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID (for event stream)
 * @returns List of dependency violations detected
 */
export function detectDependencyViolations(
  projectRoot: string,
  sprintId: string,
): DependencyViolation[] {
  const violations: DependencyViolation[] = [];
  const tasksDir = join(projectRoot, TASKS_DIR);

  if (!existsSync(tasksDir)) return violations;

  // Step 1: Collect all active heartbeats
  const hbFiles = readdirSync(tasksDir).filter(f => f.endsWith('.hb'));

  for (const hbFile of hbFiles) {
    const hbPath = join(tasksDir, hbFile);
    const hb = readJsonSafe<Heartbeat>(hbPath);
    if (!hb) continue;

    // Only check actively-executing workers
    const activeStatuses = new Set([
      'EXECUTING', 'CLAIMING', 'CLAIMED', 'TESTING', 'DOCUMENTING',
    ]);
    if (!activeStatuses.has(hb.status ?? '')) continue;

    // Step 2: Read task JSON for this worker
    const taskId = hb.taskId;
    const taskPath = join(tasksDir, `task-${taskId}.json`);
    const task = readJsonSafe<Task>(taskPath);
    if (!task || !task.dependencies || task.dependencies.length === 0) continue;

    // Step 3: Check each dependency
    const unresolvedDeps: string[] = [];
    const depStatuses: Record<string, string> = {};

    for (const depId of task.dependencies) {
      const depTaskPath = join(tasksDir, `task-${depId}.json`);
      const depTask = readJsonSafe<Task>(depTaskPath);

      if (!depTask) {
        // Dep task file missing — check if .result exists (may have been archived)
        const depResultPath = join(tasksDir, `task-${depId}.result`);
        if (existsSync(depResultPath)) {
          const depResult = readJsonSafe<{ selfAssessment?: string }>(depResultPath);
          const assessment = depResult?.selfAssessment ?? 'UNKNOWN';
          depStatuses[depId] = assessment;
          if (!DONE_SET.has(assessment)) {
            unresolvedDeps.push(depId);
          }
        } else {
          // Dep completely unknown — conservative: not a violation (task may be pre-sprint)
          depStatuses[depId] = 'UNKNOWN';
        }
        continue;
      }

      const depStatus = depTask.status ?? 'UNKNOWN';
      depStatuses[depId] = depStatus;

      // DONE and NO_GO are terminal states. We only flag if dep is still pending/executing.
      // A DONE dep (either status DONE or having a DONE result) is satisfied.
      // Check result file too: worker may have finished but task JSON not yet updated
      const depResultPath = join(tasksDir, `task-${depId}.result`);
      if (existsSync(depResultPath)) {
        const depResult = readJsonSafe<{ selfAssessment?: string }>(depResultPath);
        const assessment = depResult?.selfAssessment ?? '';
        if (DONE_SET.has(assessment)) {
          depStatuses[depId] = assessment;
          continue; // Dep completed successfully — satisfied
        }
      }

      // Check task status for terminal completion states
      if (depTask.status === TaskStatus.DONE) continue; // satisfied

      // Not done yet — violation
      unresolvedDeps.push(depId);
    }

    if (unresolvedDeps.length === 0) continue;

    const violation: DependencyViolation = {
      workerId: hb.workerId,
      taskId,
      unresolvedDeps,
      depStatuses,
      timestamp: now(),
    };
    violations.push(violation);

    // Step 4: Emit to event stream (fail-safe)
    try {
      writeEvent(
        projectRoot, sprintId, 'auditor', 'brain',
        'AUDITOR→BRAIN:DEPENDENCY_VIOLATION',
        {
          workerId: hb.workerId,
          taskId,
          unresolvedDeps,
          depStatuses,
        },
      );
    } catch {
      // Event stream write must not break detection loop
    }
  }

  return violations;
}

// ─── CI Baseline Gather (Sprint 156 T-005) ─────────────────────────────
//
// Sprint 155 produced a bogus baseline (testPassed=0/testFailed=11) because
// the vitest subprocess failed to spawn yet the caller treated absence of
// output as "11 tests failed". This block adds an auditor-side helper that
// distinguishes three outcomes:
//
//   OK         — vitest ran AND output parsed; counts are trustworthy.
//   SPAWN_FAIL — child process never produced an exit code (after retry).
//   PARSE_FAIL — subprocess returned an exit code but output could not be
//                parsed into pass/fail counts.
//
// The result is written to `.deckent/ci-baseline.json` with a new
// `vitest_invocation_status` field so downstream consumers
// (CI guardian / sprint reporter) can ignore SPAWN_FAIL / PARSE_FAIL
// baselines instead of mistaking them for regressions.

/** Tagged status describing how the vitest subprocess actually behaved. */
export type CiBaselineInvocationStatus = 'OK' | 'SPAWN_FAIL' | 'PARSE_FAIL';

/** Parsed vitest counts plus a flag describing whether parsing succeeded. */
export interface VitestBaselineParse {
  testCount: number;
  testPassed: number;
  testFailed: number;
  parseOk: boolean;
}

/** Full result of `gatherCiBaseline` — counts + status + diagnostics. */
export interface CiBaselineGatherResult {
  status: CiBaselineInvocationStatus;
  testCount: number;
  testPassed: number;
  testFailed: number;
  exitCode: number | null;
  attempts: number;
  /** Truncated stderr (last 2KB) preserved for forensic logging. */
  stderrTail: string;
  /** Why parse / spawn failed — empty string when status is OK. */
  failureReason: string;
}

/** Options influencing how `gatherCiBaseline` invokes the subprocess. */
export interface GatherCiBaselineOptions {
  /** Subprocess timeout (ms). Default: 180_000. */
  timeoutMs?: number;
  /** Allow retry-on-spawn-fail once. Default: true. */
  retryOnSpawnFail?: boolean;
  /** Inject a custom spawn function (for testing). Default: spawnSync. */
  spawnFn?: typeof spawnSync;
}

/** Disk record written to `.deckent/ci-baseline.json`. */
export interface CiBaselineRecord {
  sprintId: string;
  baseline: {
    tscPassed: boolean;
    testCount: number;
    testPassed: number;
    testFailed: number;
    coverage: number;
    timestamp: string;
  };
  /**
   * Sprint 156 T-005: distinguishes subprocess health from test outcomes.
   *   OK         — counts are trustworthy.
   *   SPAWN_FAIL — vitest never ran cleanly even after one retry — ignore counts.
   *   PARSE_FAIL — vitest exited but output was not interpretable — ignore counts.
   */
  vitest_invocation_status: CiBaselineInvocationStatus;
}

/**
 * Parse vitest output (stdout preferred, stderr fallback) into pass/fail counts.
 *
 * Recognises two formats:
 *   1. `--reporter=json` JSON object containing `numPassedTests` / `numFailedTests`.
 *   2. Human-readable footer "Tests  3 failed | 11312 passed (11315)".
 *
 * Returns `parseOk: false` when neither path yielded a value, allowing the
 * caller to flag the invocation as PARSE_FAIL instead of silently recording
 * zeros.
 *
 * Pure function — no I/O, safe to unit-test.
 */
export function parseVitestBaselineOutput(stdout: string, stderr: string): VitestBaselineParse {
  // Path 1 — JSON reporter (preferred, structured)
  const combined = `${stdout}\n${stderr}`;
  const jsonMatch = combined.match(/\{[\s\S]*"numTotalTests"[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        numPassedTests?: number;
        numFailedTests?: number;
        numTotalTests?: number;
      };
      const passed = parsed.numPassedTests ?? 0;
      const failed = parsed.numFailedTests ?? 0;
      const total = parsed.numTotalTests ?? passed + failed;
      // Accept JSON only when total is consistent (>= passed + failed).
      if (total >= passed + failed) {
        return { testCount: total, testPassed: passed, testFailed: failed, parseOk: true };
      }
    } catch {
      // fall through to text path
    }
  }

  // Path 2 — human-readable footer
  //
  // Sprint 165 Task 3 (Bug Z) fix: the `passed (NNN)` joined regex used to fail
  // whenever vitest interleaved a skipped count between "passed" and the total
  // ("16253 passed | 66 skipped (16321)"). That broke parity with the worker,
  // which sees the line directly. Now: each count is matched independently and
  // the bracketed total is anchored to end-of-line.
  const testsLine = combined.match(/^\s*Tests\s+.+$/m)?.[0] ?? '';
  const failedMatch = testsLine.match(/(\d+)\s+failed/);
  const passedMatch = testsLine.match(/(\d+)\s+passed/);
  const skippedMatch = testsLine.match(/(\d+)\s+skipped/);
  const totalMatch = testsLine.match(/\((\d+)\)\s*$/);

  const testFailed = failedMatch?.[1] ? parseInt(failedMatch[1], 10) : 0;
  const testPassed = passedMatch?.[1] ? parseInt(passedMatch[1], 10) : 0;
  const testCount = totalMatch?.[1] ? parseInt(totalMatch[1], 10) : 0;

  // Either the bracketed total OR an explicit passed/failed/skipped count
  // is required to call this a successful parse.
  const haveExplicitNumbers = Boolean(passedMatch || failedMatch || skippedMatch || totalMatch);
  if (haveExplicitNumbers && testCount === 0 && testPassed === 0 && testFailed === 0) {
    // Saw "Tests" line but no numeric capture — not a clean parse.
    return { testCount: 0, testPassed: 0, testFailed: 0, parseOk: false };
  }
  if (!haveExplicitNumbers) {
    return { testCount: 0, testPassed: 0, testFailed: 0, parseOk: false };
  }

  return {
    testCount: testCount > 0 ? testCount : testPassed + testFailed,
    testPassed,
    testFailed,
    parseOk: true,
  };
}

/**
 * Run vitest as a subprocess and produce a structured baseline gather result.
 *
 * Retries ONCE when the first attempt fails to spawn (no exit code or
 * `result.error` populated — typical ENOENT / signal kill). Subsequent
 * "ran but produced nothing parseable" cases surface as PARSE_FAIL without
 * a retry, since the same invocation will reproduce.
 *
 * Never throws — the caller can write the returned record verbatim.
 */
export function gatherCiBaseline(
  projectRoot: string,
  opts: GatherCiBaselineOptions = {},
): CiBaselineGatherResult {
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const retryOnSpawnFail = opts.retryOnSpawnFail ?? true;
  const spawnFn = opts.spawnFn ?? spawnSync;

  let attempts = 0;
  let lastResult: ReturnType<typeof spawnSync> | null = null;
  let lastSpawnError: Error | null = null;

  const maxAttempts = retryOnSpawnFail ? 2 : 1;
  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      // ADR-006: array args, no shell, no concat.
      lastResult = spawnFn('npx', ['vitest', 'run', '--reporter=json'], {
        cwd: projectRoot,
        timeout: timeoutMs,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      lastSpawnError = (lastResult.error as Error | undefined) ?? null;
    } catch (e) {
      lastSpawnError = e instanceof Error ? e : new Error(String(e));
      lastResult = null;
    }

    const spawnFailed =
      lastResult == null ||
      lastSpawnError !== null ||
      (lastResult.status === null && lastResult.signal == null);

    if (!spawnFailed) break; // good enough to parse
    if (!retryOnSpawnFail) break; // no retry allowed
  }

  // Compute stderr tail (last 2KB) for diagnostics in either branch.
  const stderr = (lastResult?.stderr ?? '').toString();
  const stdout = (lastResult?.stdout ?? '').toString();
  const stderrTail = stderr.length > 2048 ? stderr.slice(-2048) : stderr;

  // Was this still a spawn failure after all attempts?
  if (
    lastResult == null ||
    lastSpawnError !== null ||
    (lastResult.status === null && lastResult.signal == null)
  ) {
    return {
      status: 'SPAWN_FAIL',
      testCount: 0,
      testPassed: 0,
      testFailed: 0,
      exitCode: lastResult?.status ?? null,
      attempts,
      stderrTail,
      failureReason: lastSpawnError ? `spawn error: ${lastSpawnError.message}` : 'no exit code from subprocess',
    };
  }

  // We got an exit code — parse output.
  const parsed = parseVitestBaselineOutput(stdout, stderr);
  if (!parsed.parseOk) {
    return {
      status: 'PARSE_FAIL',
      testCount: 0,
      testPassed: 0,
      testFailed: 0,
      exitCode: lastResult.status,
      attempts,
      stderrTail,
      failureReason: `vitest exited with code ${String(lastResult.status)} but output was not parseable`,
    };
  }

  return {
    status: 'OK',
    testCount: parsed.testCount,
    testPassed: parsed.testPassed,
    testFailed: parsed.testFailed,
    exitCode: lastResult.status,
    attempts,
    stderrTail,
    failureReason: '',
  };
}

/**
 * Build a `CiBaselineRecord` from a gather result and persist it to
 * `.deckent/ci-baseline.json`. The returned record is the same value
 * written to disk so callers can also feed it into the event stream.
 *
 * On SPAWN_FAIL / PARSE_FAIL the counts are forced to zero AND
 * `tscPassed` is recorded as supplied — downstream readers must consult
 * `vitest_invocation_status` before trusting the count fields.
 */
export function writeCiBaselineRecord(
  projectRoot: string,
  sprintId: string,
  gather: CiBaselineGatherResult,
  tscPassed: boolean,
  coverage = 0,
): CiBaselineRecord {
  const record: CiBaselineRecord = {
    sprintId,
    baseline: {
      tscPassed,
      testCount: gather.status === 'OK' ? gather.testCount : 0,
      testPassed: gather.status === 'OK' ? gather.testPassed : 0,
      testFailed: gather.status === 'OK' ? gather.testFailed : 0,
      coverage,
      timestamp: new Date().toISOString(),
    },
    vitest_invocation_status: gather.status,
  };

  const dir = join(projectRoot, '.deckent');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ci-baseline.json'), JSON.stringify(record, null, 2), 'utf-8');
  return record;
}

// ─── Vitest Audit Gate (Sprint 165 Task 3 — Bug Z fix) ─────────────────
//
// Sprint 159-164 (6 sprints) carried a chronic `vitestDelta.fail = 1` regression
// even when workers reported "0 failures" via their own `npx vitest run`. Root
// cause: src/orchestra/baseline-tracker.ts::parseVitestOutput uses a loose
// regex `(\d+)\s+failed` that matches the first "N failed" anywhere in the
// vitest summary — typically the `Test Files  1 failed | 742 passed (743)`
// line — and reports that as the test failure count. Worker, running the
// same suite, sees `Tests  2 failed | 16253 passed (16321)` and reports the
// authoritative count.
//
// This module provides an alternative audit path that uses the strict parser
// already implemented above (`parseVitestBaselineOutput` — JSON reporter
// preferred, text fallback constrained to the Tests line via `^\s*Tests\s+`
// multiline anchor). The standalone `scripts/run-self-audit.ts` consumer
// produces results identical to a worker's `npx vitest run`, restoring
// worker↔brain parity.

/** Audit gate counts shared by baseline and current snapshots. */
export interface AuditGateBaseline {
  testCount: number;
  testPassed: number;
  testFailed: number;
  testSkipped: number;
}

/** Delta between two audit snapshots — positive fail = regression. */
export interface AuditGateDelta {
  count: number;
  pass: number;
  fail: number;
  skipped: number;
}

/** Dependency-injection seam: how to gather the current vitest counts. */
export type VitestGatherFn = () => CiBaselineGatherResult;

/** Dependency-injection seam: how to read the pre-sprint baseline. */
export type VitestBaselineReadFn = () => AuditGateBaseline | null;

/** Options for `runVitestAuditGate`. */
export interface VitestAuditGateOptions {
  projectRoot: string;
  sprintId: string;
  /** Inject a gather function (defaults to `gatherCiBaseline` over project root). */
  gatherFn?: VitestGatherFn;
  /** Inject a baseline reader (defaults to reading `.deckent/<sprint>-baseline.json`). */
  readBaselineFn?: VitestBaselineReadFn;
}

/** Result of an audit gate evaluation. */
export interface VitestAuditGateResult {
  status: CiBaselineInvocationStatus;
  current: AuditGateBaseline;
  baseline: AuditGateBaseline | null;
  delta: AuditGateDelta;
  /**
   * PASS         — delta.fail <= 0 and gather succeeded
   * GATE_FAILURE — delta.fail > 0 (regression introduced)
   * INCONCLUSIVE — gather failed (SPAWN_FAIL / PARSE_FAIL), counts untrustworthy
   */
  gateStatus: 'PASS' | 'GATE_FAILURE' | 'INCONCLUSIVE';
}

/**
 * Pure delta computation — exposed for unit testing.
 *
 * When baseline is null, delta equals current (no comparison reference).
 */
export function computeVitestDelta(
  baseline: AuditGateBaseline | null,
  current: AuditGateBaseline,
): AuditGateDelta {
  if (!baseline) {
    return {
      count: current.testCount,
      pass: current.testPassed,
      fail: current.testFailed,
      skipped: current.testSkipped,
    };
  }
  return {
    count: current.testCount - baseline.testCount,
    pass: current.testPassed - baseline.testPassed,
    fail: current.testFailed - baseline.testFailed,
    skipped: current.testSkipped - baseline.testSkipped,
  };
}

/**
 * Default baseline reader — accepts both legacy `<sprint>-baseline.json`
 * (TestBaseline shape from baseline-tracker) and CiBaselineRecord shape from
 * `ci-baseline.json`. Returns null when no readable baseline exists.
 */
export function readAuditBaseline(projectRoot: string, sprintId: string): AuditGateBaseline | null {
  // Try sprint-specific baseline first (baseline-tracker legacy shape)
  const sprintBaselinePath = join(projectRoot, '.deckent', `${sprintId}-baseline.json`);
  if (existsSync(sprintBaselinePath)) {
    try {
      const raw = JSON.parse(readFileSync(sprintBaselinePath, 'utf-8')) as {
        files?: number; pass?: number; fail?: number; skipped?: number;
      };
      if (typeof raw.pass === 'number' && typeof raw.fail === 'number') {
        return {
          testCount: (raw.pass ?? 0) + (raw.fail ?? 0) + (raw.skipped ?? 0),
          testPassed: raw.pass ?? 0,
          testFailed: raw.fail ?? 0,
          testSkipped: raw.skipped ?? 0,
        };
      }
    } catch { /* fall through */ }
  }

  // Fall back to CiBaselineRecord (.deckent/ci-baseline.json)
  const ciBaselinePath = join(projectRoot, '.deckent', 'ci-baseline.json');
  if (existsSync(ciBaselinePath)) {
    try {
      const raw = JSON.parse(readFileSync(ciBaselinePath, 'utf-8')) as CiBaselineRecord;
      if (raw?.baseline && raw.vitest_invocation_status === 'OK') {
        return {
          testCount: raw.baseline.testCount,
          testPassed: raw.baseline.testPassed,
          testFailed: raw.baseline.testFailed,
          testSkipped: 0,
        };
      }
    } catch { /* ignore */ }
  }

  return null;
}

/**
 * Run a Bug Z-immune vitest audit gate.
 *
 * Differences from sprint-finalizer's `runSelfAuditGate`:
 *   1. Uses `gatherCiBaseline` (JSON reporter preferred) — bypasses the
 *      ambiguous `(\d+)\s+failed` regex in `baseline-tracker::parseVitestOutput`.
 *   2. Distinguishes SPAWN_FAIL / PARSE_FAIL from GATE_FAILURE — a failed
 *      subprocess no longer masquerades as a regression.
 *   3. Honors pre-existing failures as the baseline — workers who fix
 *      pre-existing failures (negative delta) get PASS, not GATE_FAILURE.
 *
 * This is the function `scripts/run-self-audit.ts` invokes; the contract is
 * pinned by `tests/audit/worker-brain-audit-parity.test.ts`.
 */
export async function runVitestAuditGate(
  options: VitestAuditGateOptions,
): Promise<VitestAuditGateResult> {
  const gather = options.gatherFn
    ? options.gatherFn()
    : gatherCiBaseline(options.projectRoot);

  // SPAWN_FAIL / PARSE_FAIL — counts not trustworthy, do not penalise
  if (gather.status !== 'OK') {
    return {
      status: gather.status,
      current: {
        testCount: 0,
        testPassed: 0,
        testFailed: 0,
        testSkipped: 0,
      },
      baseline: null,
      delta: { count: 0, pass: 0, fail: 0, skipped: 0 },
      gateStatus: 'INCONCLUSIVE',
    };
  }

  const current: AuditGateBaseline = {
    testCount: gather.testCount,
    testPassed: gather.testPassed,
    testFailed: gather.testFailed,
    // gather does not currently surface skipped — best-effort: 0
    testSkipped: 0,
  };

  const baseline = options.readBaselineFn
    ? options.readBaselineFn()
    : readAuditBaseline(options.projectRoot, options.sprintId);

  const delta = computeVitestDelta(baseline, current);

  const gateStatus: 'PASS' | 'GATE_FAILURE' = delta.fail > 0 ? 'GATE_FAILURE' : 'PASS';

  return {
    status: 'OK',
    current,
    baseline,
    delta,
    gateStatus,
  };
}
