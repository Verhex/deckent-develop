import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
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
  PatternEntry,
} from '../core/types.js';
import {
  TASKS_DIR,
  LOCKS_DIR,
  BRAIN_DIR,
  DASHBOARD_FILE,
  PATTERNS_FILE,
  PATTERNS_MAX_LINES,
} from '../core/constants.js';

import { readJsonSafe, debugLog } from '../core/utils.js';
import { metric } from '../core/observability.js';
import { writeEvent, CHANNELS } from '../orchestra/event-stream.js';

// ─── Constants ─────────────────────────────────────────────────────

/** Self-assessment values that indicate a successfully completed task. */
export const DONE_SET = new Set(['DONE', 'GO_WITH_TECH_DEBT']);

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
    const hb = readJsonSafe<Heartbeat>(join(tasksDir, file));
    if (!hb) continue;

    heartbeats.push(hb);

    // Skip stale check for heartbeats with DONE status — worker already completed
    if (hb.status === AgentStatus.DONE) continue;

    const parsedTime = new Date(hb.timestamp).getTime();
    if (isNaN(parsedTime)) continue; // malformed timestamp — skip, do not mark as stale
    const elapsed = currentTime - parsedTime;
    if (elapsed > heartbeatTimeoutMs) {
      // Reconcile HB with .result file: suppress stale alert if task completed successfully
      // (DONE or GO_WITH_TECH_DEBT). NO_GO results still trigger honest alerts.
      // Defensive fix for Sprint 134 Docker bug (SIGKILL → HB "FAILED exitCode 137" + 47 false alerts).
      if (!shouldReportStale(projectRoot, hb.taskId, hb)) continue;

      // Check if the worker's task is already completed (DONE or NO_GO).
      // Completed workers stop updating heartbeats — this is expected, not a real stale agent.
      const taskFilePath = join(tasksDir, `task-${hb.taskId}.json`);
      const task = readJsonSafe<Task>(taskFilePath);
      const isCompleted = task?.status === TaskStatus.DONE || task?.status === TaskStatus.NO_GO;

      if (isCompleted) {
        // Downgrade to WARNING — worker finished its task, stale heartbeat is expected
        alerts.push(
          createAlert(
            AlertLevel.WARNING,
            `Stale heartbeat from completed worker: ${hb.workerId} (task: ${hb.taskId}, status: ${task?.status})`,
            hb.workerId,
          ),
        );
      } else {
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
    }
  }

  return { heartbeats, staleAgents, alerts };
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

function isFileInScope(filePath: string, scope: TaskScope): boolean {
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

export function detectPatterns(
  projectRoot: string,
  violations: BoundaryViolation[],
  currentSprintId: string,
): void {
  if (violations.length === 0) return;

  const patternsPath = join(projectRoot, BRAIN_DIR, PATTERNS_FILE);

  // Read existing patterns
  let existingPatterns: PatternEntry[] = [];
  try {
    const content = readFileSync(patternsPath, 'utf-8');
    // safe: PatternEntry[] shape validated by detectPatterns logic (occurrences, pattern, etc.)
    existingPatterns = JSON.parse(content) as PatternEntry[];
  } catch {
    existingPatterns = [];
  }

  // Group violations by type to create/update patterns
  const violationTypes = new Map<string, number>();
  for (const v of violations) {
    violationTypes.set(v.type, (violationTypes.get(v.type) ?? 0) + 1);
  }

  for (const [type, count] of violationTypes) {
    const existing = existingPatterns.find((p) => p.pattern === type);
    if (existing) {
      existing.occurrences += count;
      existing.lastDetectedInSprint = currentSprintId;
    } else {
      existingPatterns.push({
        pattern: type,
        occurrences: count,
        firstDetectedInSprint: currentSprintId,
        lastDetectedInSprint: currentSprintId,
        resolved: false,
      });
    }
  }

  // Truncate if exceeding max lines
  const serialized = JSON.stringify(existingPatterns, null, 2);
  const lineCount = serialized.split('\n').length;
  if (lineCount > PATTERNS_MAX_LINES) {
    // Sort descending so lowest-occurrence patterns are at the end — pop() is O(1) vs shift() O(n)
    existingPatterns.sort((a, b) => b.occurrences - a.occurrences);
    while (
      JSON.stringify(existingPatterns, null, 2).split('\n').length > PATTERNS_MAX_LINES &&
      existingPatterns.length > 1
    ) {
      existingPatterns.pop();
    }
  }

  writeFileSync(patternsPath, JSON.stringify(existingPatterns, null, 2), 'utf-8');
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

    const allViolations = [
      ...hbResult.staleAgents,
      ...boundaryViolations,
      ...lockResult.staleLocks,
      ...deadlocks,
    ];
    const allAlerts = [...hbResult.alerts, ...lockResult.alerts];

    // Detect patterns from violations
    detectPatterns(projectRoot, allViolations, currentSprintId);

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
    };
  } catch {
    return {
      heartbeats: [],
      violations: [],
      alerts: [],
      locks: [],
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
  return setInterval(() => {
    try {
      const result = runScanCycle(projectRoot, currentSprintId, mergedOpts);
      if (onScanComplete) {
        try { onScanComplete(result); } catch { /* callback must not kill loop */ }
      }
    } catch {
      // Scan loop must not die
    }
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
 */
export async function verifyWorkerResult(
  taskId: string,
  projectRoot: string,
  result: TaskResult,
): Promise<VerificationResult> {
  switch (result.selfAssessment) {
    case 'NO_GO': {
      const codeVerify = await tryCodeVerifiedDone(taskId, projectRoot);
      if (codeVerify.triggered && codeVerify.verified) {
        return { verdict: 'PASS', reason: `CODE_VERIFIED_DONE: ${codeVerify.reason}` };
      }
      return { verdict: 'FAIL', reason: `Honest NO_GO: ${codeVerify.reason}` };
    }
    case 'GO_WITH_TECH_DEBT':
      return validateTechDebt(taskId, projectRoot, result);
    case 'DONE':
      return verifyFunctional(taskId, projectRoot, result);
    default:
      return { verdict: 'FAIL', reason: `Unknown selfAssessment: ${result.selfAssessment}` };
  }
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
 */
export function checkADRCompliance(
  projectRoot: string,
  changedFiles: string[],
): ADRViolation[] {
  const violations: ADRViolation[] = [];
  let decisionsContent: string;
  try {
    decisionsContent = readFileSync(join(projectRoot, BRAIN_DIR, 'DECISIONS.md'), 'utf-8');
  } catch {
    return violations; // No DECISIONS.md — skip compliance check
  }

  const adrs = parseADRs(decisionsContent);

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

  return violations;
}

// ═══════════════════════════════════════════════════════════════════════
// Event Stream Hook Point (Sprint 138 — Task 4 coordination)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Write a verification event to the event stream.
 * Fail-safe: if event-stream module is not available (Task 4 not yet merged),
 * falls back to debugLog.
 */
export function emitVerificationEvent(
  projectRoot: string,
  payload: { taskId: string; verdict: string; status?: string; reason: string },
): void {
  try {
    // Dynamic import attempt — Task 4 will create event-stream.ts
    // Until then, this is a no-op with debug logging
    const eventFile = join(projectRoot, '.deckent', 'sprint-events.jsonl');
    const event = {
      timestamp: new Date().toISOString(),
      source: 'auditor',
      target: 'brain',
      channel: 'AUDITOR→BRAIN:VERIFICATION_RESULT',
      payload,
    };
    try {
      const { appendFileSync } = require('node:fs') as typeof import('node:fs');
      appendFileSync(eventFile, JSON.stringify(event) + '\n');
    } catch {
      debugLog('emitVerificationEvent', `Event stream write failed (Task 4 pending): ${JSON.stringify(payload)}`);
    }
  } catch {
    // Fail-safe — never crash on event emission
  }
}
