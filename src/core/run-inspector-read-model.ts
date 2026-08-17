import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import {
  BRAIN_DIR,
  DASHBOARD_FILE,
  DECKENT_DIR,
  LOCKS_DIR,
  SPRINT_ACTIVE_FILE,
  SPRINT_PAUSE_STATE_FILE,
  SPRINT_STATE_FILE,
  SPRINTS_DIR,
  TASKS_DIR,
} from './constants.js';
import {
  readCanonicalRunStatus,
  type CanonicalRunStatus,
} from './run-status-authority.js';

export const SPRINT_DETAIL_TEXT_CAP = 64_000;
export const SPRINT_TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;

export interface RunInspectorHeartbeat {
  readonly status: string | null;
  readonly currentAction: string | null;
  readonly currentFile: string | null;
  readonly filesChangedCount: number;
  readonly sequence: number;
  readonly ageMs: number | null;
}

export interface RunInspectorWorker {
  readonly taskId: string;
  readonly title: string;
  readonly status: string | null;
  readonly agent: string | null;
  readonly model: string | null;
  readonly filesWrite: readonly string[];
  readonly hb: RunInspectorHeartbeat | null;
}

export interface RunInspectorLock {
  readonly filePath: string;
  readonly ownerWorkerId: string;
  readonly acquiredAt: string;
  readonly taskId: string;
}

export interface RunInspectorSnapshot {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly revision: number;
  readonly lifecycle: CanonicalRunStatus;
  readonly sprintId: string | null;
  readonly phase: string | null;
  readonly workers: readonly RunInspectorWorker[];
  readonly locks: readonly RunInspectorLock[];
}

export interface RunInspectorTaskPlan {
  readonly text: string;
  readonly truncated: boolean;
}

export interface RunInspectorTaskDetail {
  readonly task: Record<string, unknown>;
  readonly plan: RunInspectorTaskPlan | null;
  readonly result: Record<string, unknown> | null;
  readonly hb: RunInspectorHeartbeat | null;
  readonly lineage: RunInspectorTaskLineage;
}

export interface RunInspectorTaskLineage {
  readonly logPath: string | null;
  readonly logTailAvailable: boolean;
  readonly resultEvidence: {
    readonly selfAssessment: string | null;
    readonly filesChanged: readonly string[];
    readonly notesPresent: boolean;
  } | null;
}

export interface RunInspectorTaskCounts {
  readonly total: number | null;
  readonly completed: number | null;
  readonly noGo: number | null;
  readonly techDebt: number | null;
}

export type RunInspectorRun = {
  readonly runId: string | null;
  readonly lifecycle: CanonicalRunStatus['lifecycle'];
  readonly recordState?: never;
  readonly source: 'authority';
  readonly startedAt: string | null;
  readonly settledAt: string | null;
  readonly taskCounts: RunInspectorTaskCounts | null;
} | {
  readonly runId: string | null;
  readonly lifecycle?: never;
  readonly recordState: string | null;
  readonly source: 'archive';
  readonly startedAt: string | null;
  readonly settledAt: string | null;
  readonly taskCounts: RunInspectorTaskCounts | null;
};

export interface RunInspectorRunList {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly revision: number;
  readonly runs: readonly RunInspectorRun[];
}

interface SnapshotOptions {
  readonly nowMs?: number;
}

interface ReadTracker {
  maxMtimeMs: number;
}

function recordMtime(path: string, tracker: ReadTracker): void {
  try {
    tracker.maxMtimeMs = Math.max(tracker.maxMtimeMs, statSync(path).mtimeMs);
  } catch {
    // A source may disappear between directory enumeration and inspection.
  }
}

function readText(path: string, tracker?: ReadTracker): string | null {
  if (!existsSync(path)) return null;
  try {
    const value = readFileSync(path, 'utf8');
    if (tracker) recordMtime(path, tracker);
    return value;
  } catch {
    return null;
  }
}

function readJson(path: string, tracker?: ReadTracker): Record<string, unknown> | null {
  const raw = readText(path, tracker);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^\d+$/u.test(value.trim())) return null;
  return Number(value.trim());
}

function markdownField(value: string, names: readonly string[]): string | null {
  const normalized = value.replaceAll('**', '');
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const match = normalized.match(new RegExp(
      `^\\s*(?:[-*]\\s*)?${escaped}\\s*:\\s*(.+?)\\s*$`,
      'imu',
    ));
    if (match?.[1]) return match[1].replace(/^`|`$/gu, '').trim() || null;
  }
  return null;
}

function runIdFromName(name: string): string | null {
  return name.match(/(?:^|[^A-Za-z0-9])(sprint-[A-Za-z0-9._-]+)/u)?.[1] ?? null;
}

interface ArchivedRunCandidate {
  run: Extract<RunInspectorRun, { source: 'archive' }>;
  sortTime: number;
}

function archivedRunFromMarkdown(
  path: string,
  file: string,
  tracker: ReadTracker,
): ArchivedRunCandidate | null {
  const value = readText(path, tracker);
  if (value === null) return null;
  const runId = markdownField(value, ['Sprint ID', 'Sprint', 'Run ID', 'Run'])
    ?? runIdFromName(basename(file, '.md'));
  const startedAt = markdownField(value, ['Started At', 'Started', 'Start Time']);
  const settledAt = markdownField(value, ['Settled At', 'Completed At', 'Finished At', 'Ended At']);
  const recordState = markdownField(value, ['Record State', 'Status', 'Outcome', 'Result']);
  const count = (names: readonly string[]): number | null => nullableNumber(markdownField(value, names));
  const taskCounts: RunInspectorTaskCounts = {
    total: count(['Total Tasks', 'Tasks Total']),
    completed: count(['Completed Tasks', 'Tasks Completed']),
    noGo: count(['No-Go Tasks', 'NO_GO Tasks', 'No Go Tasks']),
    techDebt: count(['Tech Debt Tasks', 'GO_WITH_TECH_DEBT Tasks']),
  };
  const hasTaskCounts = Object.values(taskCounts).some(item => item !== null);
  let mtimeMs = 0;
  try { mtimeMs = statSync(path).mtimeMs; } catch { /* Tolerate a disappearing record. */ }
  const settledMs = settledAt === null ? Number.NaN : Date.parse(settledAt);
  return {
    run: {
      runId,
      recordState,
      source: 'archive',
      startedAt,
      settledAt,
      taskCounts: hasTaskCounts ? taskCounts : null,
    },
    sortTime: Number.isFinite(settledMs) ? settledMs : mtimeMs,
  };
}

function readArchivedRuns(projectRoot: string, tracker: ReadTracker): ArchivedRunCandidate[] {
  const recordsDir = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  const byRunId = new Map<string, ArchivedRunCandidate>();
  try {
    recordMtime(recordsDir, tracker);
    for (const file of readdirSync(recordsDir).filter(name => name.endsWith('.md')).sort()) {
      const candidate = archivedRunFromMarkdown(join(recordsDir, file), file, tracker);
      if (!candidate) continue;
      byRunId.set(candidate.run.runId ?? `record:${file}`, candidate);
    }
  } catch {
    // Historical settlement records are optional in a new or migrated project.
  }

  const archiveDir = join(projectRoot, DECKENT_DIR, 'archive', 'sprints');
  try {
    recordMtime(archiveDir, tracker);
    for (const entry of readdirSync(archiveDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const runId = runIdFromName(entry.name) ?? entry.name;
      const path = join(archiveDir, entry.name);
      recordMtime(path, tracker);
      if (byRunId.has(runId)) continue;
      let mtimeMs = 0;
      try { mtimeMs = statSync(path).mtimeMs; } catch { /* Tolerate concurrent retention. */ }
      byRunId.set(runId, {
        run: {
          runId,
          recordState: null,
          source: 'archive',
          startedAt: null,
          settledAt: null,
          taskCounts: null,
        },
        sortTime: mtimeMs,
      });
    }
  } catch {
    // The runtime archive is optional until retention has archived a run.
  }
  return [...byRunId.values()].sort((a, b) =>
    b.sortTime - a.sortTime
    // Numeric-aware tiebreak so equal record times (retention touches archives
    // in batches) still list sprint-542 before sprint-532.
    || (b.run.runId ?? '').localeCompare(a.run.runId ?? '', undefined, { numeric: true }),
  );
}

function taskFiles(projectRoot: string): string[] {
  const dir = join(projectRoot, TASKS_DIR);
  try {
    return readdirSync(dir)
      .filter(file => /^task-.+\.json$/u.test(file))
      .sort();
  } catch {
    return [];
  }
}

function heartbeatFor(
  projectRoot: string,
  taskFile: string,
  tracker: ReadTracker,
  nowMs: number,
): RunInspectorHeartbeat | null {
  const path = join(projectRoot, TASKS_DIR, taskFile.replace(/\.json$/u, '.hb'));
  const hb = readJson(path, tracker);
  if (!hb) return null;
  const timestamp = text(hb.timestamp);
  const timestampMs = timestamp === null ? Number.NaN : Date.parse(timestamp);
  return {
    status: text(hb.status),
    currentAction: text(hb.currentAction),
    currentFile: text(hb.currentFile),
    filesChangedCount: number(hb.filesChangedCount),
    sequence: number(hb.sequence),
    ageMs: Number.isFinite(timestampMs) ? Math.max(0, nowMs - timestampMs) : null,
  };
}

function readWorkers(
  projectRoot: string,
  tracker: ReadTracker,
  nowMs: number,
): RunInspectorWorker[] {
  const workers: RunInspectorWorker[] = [];
  for (const file of taskFiles(projectRoot)) {
    const task = readJson(join(projectRoot, TASKS_DIR, file), tracker);
    if (!task) continue;
    const description = text(task.description) ?? '';
    const scope = task.scope !== null && typeof task.scope === 'object' && !Array.isArray(task.scope)
      ? task.scope as Record<string, unknown>
      : null;
    workers.push({
      taskId: text(task.id) ?? basename(file, '.json').replace(/^task-/u, ''),
      title: description.split(/\r?\n/u, 1)[0] ?? '',
      status: text(task.status),
      agent: text(task.assignedAgent) ?? text(task.agent),
      model: text(task.model),
      filesWrite: stringArray(scope?.filesWrite),
      hb: heartbeatFor(projectRoot, file, tracker, nowMs),
    });
  }
  return workers;
}

function readLocks(projectRoot: string, tracker: ReadTracker): RunInspectorLock[] {
  const dir = join(projectRoot, LOCKS_DIR);
  let files: string[];
  try {
    files = readdirSync(dir).filter(file => file.endsWith('.lock')).sort();
  } catch {
    return [];
  }
  const locks: RunInspectorLock[] = [];
  for (const file of files) {
    const lock = readJson(join(dir, file), tracker);
    if (!lock) continue;
    locks.push({
      filePath: text(lock.filePath) ?? file.replace(/\.lock$/u, '').replaceAll('__', '/'),
      ownerWorkerId: text(lock.ownerWorkerId) ?? '',
      acquiredAt: text(lock.acquiredAt) ?? '',
      taskId: text(lock.taskId) ?? '',
    });
  }
  return locks;
}

function recordAuthoritySources(projectRoot: string, tracker: ReadTracker): void {
  const fixed = [
    SPRINT_ACTIVE_FILE,
    SPRINT_STATE_FILE,
    SPRINT_PAUSE_STATE_FILE,
    DASHBOARD_FILE,
    join(DECKENT_DIR, 'sprint.lock'),
    join(DECKENT_DIR, 'config.json'),
  ];
  for (const relative of fixed) recordMtime(join(projectRoot, relative), tracker);
  const pidsDir = join(projectRoot, DECKENT_DIR, 'pids');
  try {
    for (const file of readdirSync(pidsDir)) recordMtime(join(pidsDir, file), tracker);
  } catch {
    // No coordinator authority directory is an ordinary idle input.
  }
}

export function buildRunInspectorSnapshot(
  projectRoot: string,
  options: SnapshotOptions = {},
): RunInspectorSnapshot {
  const nowMs = options.nowMs ?? Date.now();
  const tracker: ReadTracker = { maxMtimeMs: 0 };
  const lifecycle = readCanonicalRunStatus(projectRoot, { nowMs });
  recordAuthoritySources(projectRoot, tracker);
  const workers = readWorkers(projectRoot, tracker, nowMs);
  const locks = readLocks(projectRoot, tracker);
  return {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    revision: Math.max(0, Math.ceil(tracker.maxMtimeMs)),
    lifecycle,
    sprintId: lifecycle.sprintId,
    phase: lifecycle.phase,
    workers,
    locks,
  };
}

export function listRunInspectorRuns(
  projectRoot: string,
  options: SnapshotOptions = {},
): RunInspectorRunList {
  const nowMs = options.nowMs ?? Date.now();
  const tracker: ReadTracker = { maxMtimeMs: 0 };
  const authority = readCanonicalRunStatus(projectRoot, { nowMs });
  recordAuthoritySources(projectRoot, tracker);
  const archives = readArchivedRuns(projectRoot, tracker)
    .filter(candidate => candidate.run.runId !== authority.sprintId);
  return {
    schemaVersion: 1,
    generatedAt: new Date(nowMs).toISOString(),
    revision: Math.max(0, Math.ceil(tracker.maxMtimeMs)),
    runs: [{
      runId: authority.sprintId,
      lifecycle: authority.lifecycle,
      source: 'authority',
      startedAt: null,
      settledAt: null,
      taskCounts: null,
    }, ...archives.map(candidate => candidate.run)],
  };
}

function cappedPlan(path: string): RunInspectorTaskPlan | null {
  const value = readText(path);
  if (value === null) return null;
  // Ported honesty rule from the retired sprint-live-service: a hard slice plus
  // an explicit typed `truncated` flag — never an in-band ellipsis marker.
  const truncated = value.length > SPRINT_DETAIL_TEXT_CAP;
  return { text: truncated ? value.slice(0, SPRINT_DETAIL_TEXT_CAP) : value, truncated };
}

export function readRunInspectorTaskDetail(
  projectRoot: string,
  taskId: string,
): RunInspectorTaskDetail | null {
  if (!SPRINT_TASK_ID_RE.test(taskId)) return null;
  const base = join(projectRoot, TASKS_DIR, `task-${taskId}`);
  const task = readJson(`${base}.json`);
  if (!task) return null;
  const result = readJson(`${base}.result`);
  const logRelativePath = join(TASKS_DIR, `task-${taskId}.log`);
  const logPath = existsSync(join(projectRoot, logRelativePath)) ? logRelativePath : null;
  const worker = buildRunInspectorSnapshot(projectRoot).workers
    .find(entry => entry.taskId === taskId);
  return {
    task,
    plan: cappedPlan(`${base}.plan`),
    result,
    hb: worker?.hb ?? null,
    lineage: {
      logPath,
      logTailAvailable: logPath !== null,
      resultEvidence: result === null ? null : {
        selfAssessment: text(result.selfAssessment),
        filesChanged: stringArray(result.filesChanged),
        notesPresent: text(result.notes) !== null,
      },
    },
  };
}
