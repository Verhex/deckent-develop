// ─── Deckent Embeddable SDK — Client (F2-008-SDK-1) ─────────────────────────
//
// Zero-CLI-prereq programmatic surface over deckent's core primitives.
// `createDeckentClient({ projectRoot })` never writes to disk, and every
// method is a pure read EXCEPT two injectable-spawn probes that default to a
// real subprocess only when the caller doesn't override them: `limits()`
// (probes `claude -p "/usage"`) and `startSprintDetached()` (spawns a
// detached `deckent start` via the existing detached-start.ts mechanism).
// Existing core/orchestra/cli functions are imported and reused as-is; this
// module adds no parsing/query logic of its own beyond the small disk
// readers (`status()`, `getSprintResults()`), which have no existing
// core-level equivalent in scope.
//
// Sprint-360 Task 360-012 (fix pass). Sprint-363 Task 363-006 (F2-008 dilim-2):
// added startSprintDetached/getSprintResults/getRetro.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getCurrentSprintId } from '../core/event-stream.js';
import { TASKS_DIR, DASHBOARD_FILE, BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import { resolveTaskArtifactReadDirs } from '../core/sprint-archive.js';
import type { Task, TaskResult } from '../core/task-types.js';
import type { DashboardState } from '../core/monitoring-types.js';
import { MemoryStore } from '../core/memory-store.js';
import { searchMemory } from '../core/memory-query.js';
import type { MemoryQueryParams, MemorySearchResult, MemoryEntryV2 } from '../core/memory-types.js';
import { parseStructuredDirectives } from '../orchestra/task-builder.js';
import type { ParsedDirectiveTask } from '../orchestra/task-builder.js';
import { extractSprintNumber } from '../orchestra/sprint-metrics.js';
import {
  probeSubscriptionLimits,
  evaluateLimitGate,
  DEFAULT_LIMIT_GATE_THRESHOLDS,
} from '../core/limit-preflight.js';
import type {
  SubscriptionLimitResult,
  LimitGateResult,
  LimitGateThresholds,
  ProbeSubscriptionLimitsOptions,
} from '../core/limit-preflight.js';
// F2-008 dilim-2 (Task 363-006): reuse the existing detached-spawn mechanism
// as-is — startSprintDetached() is a thin argv-builder in front of it, never
// a reimplementation. This is the SDK's only spawn path; every other method
// stays a pure disk/DB read.
import { spawnDetachedDeckent } from '../cli/helpers/detached-start.js';
import type { DetachedSpawnFn, DetachedSpawnResult } from '../cli/helpers/detached-start.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface DeckentClientOptions {
  readonly projectRoot: string;
}

export interface DeckentSdkStatus {
  readonly projectRoot: string;
  readonly sprintId: string | null;
  readonly dashboard: DashboardState | null;
  readonly tasks: Task[];
  /** Task count per `Task.status` value, e.g. `{ DONE: 3, EXECUTING: 1 }`. */
  readonly taskCounts: Record<string, number>;
}

/** `memoryQuery`'s query text is supplied as the method argument, not here. */
export type DeckentMemoryQueryOptions = Partial<Omit<MemoryQueryParams, 'text'>>;

export interface DeckentLimitsOptions {
  readonly probeOptions?: ProbeSubscriptionLimitsOptions;
  readonly thresholds?: LimitGateThresholds;
}

export interface DeckentLimitsResult {
  readonly probe: SubscriptionLimitResult;
  readonly gate: LimitGateResult;
}

export interface StartSprintDetachedOptions {
  /** `deckent start --auto-approve` (`--dangerously-skip-permissions`). */
  readonly autoApprove?: boolean;
  /** `deckent start --sandbox` (memory-cap + path-jail isolation, no Docker required). */
  readonly sandbox?: boolean;
  /** `deckent start --force` (skip doctor pre-flight checks). */
  readonly force?: boolean;
  /** `deckent start --dry-run` (plan without spawning workers). */
  readonly dryRun?: boolean;
  /** `deckent start --timeout <ms>`. */
  readonly timeoutMs?: number;
  /** Inject a fake detached-spawn for hermetic tests; omit for the real node:child_process spawn. */
  readonly spawnFn?: DetachedSpawnFn;
}

export interface DeckentSprintResults {
  readonly sprintId: string;
  readonly tasks: Task[];
  readonly results: TaskResult[];
  /**
   * Where the data came from: `'live'` = still in `.tasks/` (sprint not yet
   * finalized), `'archive'` = read from `.brain/archive/<sprintId>-tasks/`
   * (post-finalize, written by `archiveOrphanTasks`), `'none'` = neither
   * location has files for this sprint.
   */
  readonly source: 'live' | 'archive' | 'none';
}

export interface DeckentClient {
  /** Current sprint id, `.dashboard` snapshot, and parsed `.tasks/*.json` — read-only, no spawn. */
  status(): Promise<DeckentSdkStatus>;
  /** Full-text search over `.brain/memory.db`. Returns `[]` when the DB doesn't exist yet. */
  memoryQuery(query: string, options?: DeckentMemoryQueryOptions): Promise<MemorySearchResult[]>;
  /** Parse DIRECTIVES-style text into structured tasks WITHOUT writing anything to disk. */
  planStructured(directivesText: string): Promise<ParsedDirectiveTask[]>;
  /** Probe + evaluate the live subscription usage window (Task 360-002 module). */
  limits(options?: DeckentLimitsOptions): Promise<DeckentLimitsResult>;
  /**
   * Spawn a detached `deckent start` (fire-and-forget, own process group,
   * logged under `.deckent/recently-works/`) and return immediately with its
   * pid + log path. The ONLY method on this client that spawns a process —
   * every other method is a pure read. Real subprocess only fires when
   * `options.spawnFn` is omitted.
   */
  startSprintDetached(options?: StartSprintDetachedOptions): Promise<DetachedSpawnResult>;
  /**
   * Task + result files for `sprintId` — live `.tasks/` if the sprint hasn't
   * finalized yet, else the post-finalize `.brain/archive/` copy. No spawn.
   */
  getSprintResults(sprintId: string): Promise<DeckentSprintResults>;
  /** The `retro-<sprintId>` entry from `.brain/memory.db`, or `null` if absent. */
  getRetro(sprintId: string): Promise<MemoryEntryV2 | null>;
}

// ─── status() disk readers ───────────────────────────────────────────────
// No existing core-level aggregator covers these — assembled here from
// in-scope primitives (constants + types). Fail-honest: missing/unparseable
// input resolves to null/[]/skip, never a throw.

function readDashboardState(projectRoot: string): DashboardState | null {
  const path = join(projectRoot, DASHBOARD_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as DashboardState;
  } catch {
    return null;
  }
}

function readTaskFiles(projectRoot: string): Task[] {
  const dir = join(projectRoot, TASKS_DIR);
  if (!existsSync(dir)) return [];

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const tasks: Task[] = [];
  for (const entry of entries) {
    if (!/^task-.+\.json$/.test(entry)) continue;
    try {
      tasks.push(JSON.parse(readFileSync(join(dir, entry), 'utf-8')) as Task);
    } catch {
      // unparseable/partial task file — skip, not fatal to status()
    }
  }
  return tasks;
}

function tallyTaskCounts(tasks: readonly Task[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
  }
  return counts;
}

// ─── getSprintResults() disk reader ─────────────────────────────────────
// Shared by both the live `.tasks/` dir and the canonical/legacy archives.
// copy — same `task-<prefix>-*.json` / `.result` file-name convention in both
// locations (archiveOrphanTasks moves files verbatim, it doesn't rename them).

function readTaskAndResultFiles(dir: string, prefix: string): { tasks: Task[]; results: TaskResult[] } {
  const empty = { tasks: [], results: [] };
  if (!existsSync(dir)) return empty;

  const tasks: Task[] = [];
  const results: TaskResult[] = [];
  const files: string[] = [];
  const pending = [dir];
  while (pending.length > 0) {
    const current = pending.pop()!;
    try {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, entry.name);
        if (entry.isDirectory()) pending.push(full);
        else if (entry.isFile()) files.push(full);
      }
    } catch { /* unreadable branch is not fatal to the SDK read model */ }
  }
  for (const full of files.sort()) {
    const entry = basename(full);
    if (!entry.startsWith(prefix)) continue;
    if (entry.endsWith('.json')) {
      try {
        tasks.push(JSON.parse(readFileSync(full, 'utf-8')) as Task);
      } catch {
        // unparseable/partial task file — skip, not fatal
      }
    } else if (entry.endsWith('.result')) {
      try {
        results.push(JSON.parse(readFileSync(full, 'utf-8')) as TaskResult);
      } catch {
        // unparseable/partial result file — skip, not fatal
      }
    }
  }
  return { tasks, results };
}

/** `task-<sprintNum>-` prefix used by both `.tasks/` and the archive (matches archiveOrphanTasks). */
function taskFilePrefix(sprintId: string): string {
  const sprintNum = extractSprintNumber(sprintId);
  return sprintNum !== null ? `task-${sprintNum}-` : `task-${sprintId}-`;
}

// ─── Client ──────────────────────────────────────────────────────────────

class DeckentClientImpl implements DeckentClient {
  constructor(private readonly projectRoot: string) {}

  async status(): Promise<DeckentSdkStatus> {
    const tasks = readTaskFiles(this.projectRoot);
    return {
      projectRoot: this.projectRoot,
      sprintId: getCurrentSprintId(this.projectRoot),
      dashboard: readDashboardState(this.projectRoot),
      tasks,
      taskCounts: tallyTaskCounts(tasks),
    };
  }

  async memoryQuery(
    query: string,
    options: DeckentMemoryQueryOptions = {},
  ): Promise<MemorySearchResult[]> {
    const dbPath = join(this.projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
    if (!existsSync(dbPath)) return [];

    const store = new MemoryStore(dbPath);
    try {
      return searchMemory(store, { ...options, text: query });
    } finally {
      store.close();
    }
  }

  async planStructured(directivesText: string): Promise<ParsedDirectiveTask[]> {
    return parseStructuredDirectives(directivesText);
  }

  async limits(options: DeckentLimitsOptions = {}): Promise<DeckentLimitsResult> {
    const probe = await probeSubscriptionLimits(options.probeOptions);
    const gate = evaluateLimitGate(probe, options.thresholds ?? DEFAULT_LIMIT_GATE_THRESHOLDS);
    return { probe, gate };
  }

  async startSprintDetached(options: StartSprintDetachedOptions = {}): Promise<DetachedSpawnResult> {
    const argv: string[] = ['start'];
    if (options.autoApprove) argv.push('--auto-approve');
    if (options.sandbox) argv.push('--sandbox');
    if (options.force) argv.push('--force');
    if (options.dryRun) argv.push('--dry-run');
    if (typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)) {
      argv.push('--timeout', String(options.timeoutMs));
    }
    return spawnDetachedDeckent(argv, {
      projectRoot: this.projectRoot,
      spawnFn: options.spawnFn,
    });
  }

  async getSprintResults(sprintId: string): Promise<DeckentSprintResults> {
    const prefix = taskFilePrefix(sprintId);

    const live = readTaskAndResultFiles(join(this.projectRoot, TASKS_DIR), prefix);
    if (live.tasks.length > 0 || live.results.length > 0) {
      return { sprintId, tasks: live.tasks, results: live.results, source: 'live' };
    }

    const taskById = new Map<string, Task>();
    const resultById = new Map<string, TaskResult>();
    for (const archiveDir of resolveTaskArtifactReadDirs(this.projectRoot, sprintId)) {
      const archived = readTaskAndResultFiles(archiveDir, prefix);
      for (const task of archived.tasks) if (!taskById.has(task.id)) taskById.set(task.id, task);
      for (const result of archived.results) if (!resultById.has(result.taskId)) resultById.set(result.taskId, result);
    }
    if (taskById.size > 0 || resultById.size > 0) return {
      sprintId,
      tasks: [...taskById.values()],
      results: [...resultById.values()],
      source: 'archive',
    };

    return { sprintId, tasks: [], results: [], source: 'none' };
  }

  async getRetro(sprintId: string): Promise<MemoryEntryV2 | null> {
    const dbPath = join(this.projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
    if (!existsSync(dbPath)) return null;

    const store = new MemoryStore(dbPath);
    try {
      return store.getById(`retro-${sprintId}`);
    } finally {
      store.close();
    }
  }
}

/**
 * Create a programmatic deckent client scoped to `projectRoot`.
 * `status`/`memoryQuery`/`planStructured`/`getSprintResults`/`getRetro` never
 * spawn a process. `limits` only spawns `claude -p "/usage"` when the caller
 * doesn't supply `probeOptions.spawnImpl` (see `ProbeSubscriptionLimitsOptions`),
 * and `startSprintDetached` only spawns `deckent start` when the caller
 * doesn't supply `options.spawnFn`.
 */
export function createDeckentClient(options: DeckentClientOptions): DeckentClient {
  return new DeckentClientImpl(options.projectRoot);
}
