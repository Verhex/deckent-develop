import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { spawnSync } from 'node:child_process';
import type {
  Heartbeat,
  LockInfo,
  Task,
  TaskScope,
  BoundaryViolation,
  Alert,
  AlertLevel,
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

    const elapsed = currentTime - new Date(hb.timestamp).getTime();
    if (elapsed > HEARTBEAT_STALE_THRESHOLD_MS) {
      staleAgents.push({
        type: 'stale_heartbeat',
        agentId: hb.workerId,
        detail: `Heartbeat stale for ${Math.round(elapsed / 1000)}s (task: ${hb.taskId})`,
        timestamp: now(),
      });
      alerts.push(
        createAlert(
          'CRITICAL' as AlertLevel,
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

export function checkStaleLocks(projectRoot: string): {
  locks: LockInfo[];
  staleLocks: BoundaryViolation[];
  alerts: Alert[];
} {
  const locksDir = join(projectRoot, LOCKS_DIR);
  const locks: LockInfo[] = [];
  const staleLocks: BoundaryViolation[] = [];
  const alerts: Alert[] = [];

  if (!existsSync(locksDir)) {
    return { locks, staleLocks, alerts };
  }

  const files = readdirSync(locksDir).filter((f) => f.endsWith('.lock'));
  const currentTime = Date.now();

  for (const file of files) {
    const lock = readJsonSafe<LockInfo>(join(locksDir, file));
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
      alerts.push(
        createAlert(
          'WARNING' as AlertLevel,
          `Stale lock: ${lock.filePath} by ${lock.ownerWorkerId}`,
          lock.ownerWorkerId,
        ),
      );
    }
  }

  return { locks, staleLocks, alerts };
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
      adjList.get(dep)!.push(task.id);
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
    const current = queue.shift()!;
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
    // Remove oldest unresolved patterns first
    existingPatterns.sort((a, b) => a.occurrences - b.occurrences);
    while (
      JSON.stringify(existingPatterns, null, 2).split('\n').length > PATTERNS_MAX_LINES &&
      existingPatterns.length > 1
    ) {
      existingPatterns.shift();
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

export function runScanCycle(
  projectRoot: string,
  currentSprintId: string,
): {
  heartbeats: Heartbeat[];
  violations: BoundaryViolation[];
  alerts: Alert[];
  locks: LockInfo[];
} {
  try {
    const hbResult = scanHeartbeats(projectRoot);
    const workerScopes = buildWorkerScopeMap(projectRoot);
    const boundaryViolations = checkBoundaryViolations(projectRoot, workerScopes);
    const lockResult = checkStaleLocks(projectRoot);

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
): ReturnType<typeof setInterval> {
  const interval = intervalMs ?? AUDITOR_SCAN_INTERVAL_MS;
  return setInterval(() => {
    try {
      runScanCycle(projectRoot, currentSprintId);
    } catch {
      // Scan loop must not die
    }
  }, interval);
}
