import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import { AgentStatus, AlertLevel, SprintPhase, SprintStatus } from '../core/types.js';
import type {
  Heartbeat,
  LockInfo,
  Task,
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
  HEARTBEAT_STALE_THRESHOLD_MS,
  LOCK_STALE_THRESHOLD_MS,
  AUDITOR_SCAN_INTERVAL_MS,
  PATTERNS_MAX_LINES,
} from '../core/constants.js';

// ─── Internal Helpers ───────────────────────────────────────────────

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    // safe: generic T is caller-provided; JSON.parse returns unknown, cast defers validation to caller
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

function now(): string {
  return new Date().toISOString();
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

export function scanHeartbeats(projectRoot: string): {
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

    const parsedTime = new Date(hb.timestamp).getTime();
    if (isNaN(parsedTime)) continue; // malformed timestamp — skip, do not mark as stale
    const elapsed = currentTime - parsedTime;
    if (elapsed > HEARTBEAT_STALE_THRESHOLD_MS) {
      staleAgents.push({
        type: 'stale_heartbeat',
        agentId: hb.workerId,
        detail: `Heartbeat stale for ${Math.round(elapsed / 1000)}s (task: ${hb.taskId})`,
        timestamp: now(),
      });
      alerts.push(
        createAlert(
          AlertLevel.CRITICAL,
          `Stale agent detected: ${hb.workerId} (task: ${hb.taskId})`,
          hb.workerId,
        ),
      );
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

export function checkStaleLocks(projectRoot: string, autoClean = false): {
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
    if (elapsed > LOCK_STALE_THRESHOLD_MS) {
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
    usage: { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
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

export interface ScanResult {
  heartbeats: Heartbeat[];
  violations: BoundaryViolation[];
  alerts: Alert[];
  locks: LockInfo[];
}

export function runScanCycle(
  projectRoot: string,
  currentSprintId: string,
  autoCleanLocks = false,
): ScanResult {
  try {
    const hbResult = scanHeartbeats(projectRoot);
    const workerScopes = buildWorkerScopeMap(projectRoot);
    const boundaryViolations = checkBoundaryViolations(projectRoot, workerScopes);
    const lockResult = checkStaleLocks(projectRoot, autoCleanLocks);

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
): ReturnType<typeof setInterval> {
  const interval = intervalMs ?? AUDITOR_SCAN_INTERVAL_MS;
  return setInterval(() => {
    try {
      const result = runScanCycle(projectRoot, currentSprintId, autoCleanLocks);
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
    usage: existing?.usage ?? { fiveHourPercent: 0, weeklyPercent: 0, measuredAt: new Date().toISOString() },
    alerts: mergedAlerts,
    updatedAt: new Date().toISOString(),
    auditorLastScan: new Date().toISOString(),
    violations: scanResult.violations.length,
  });
}
