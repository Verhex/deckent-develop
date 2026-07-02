// ─── Deckent Embeddable SDK — Client (F2-008-SDK-1) ─────────────────────────
//
// Zero-CLI-prereq programmatic surface over deckent's core primitives.
// `createDeckentClient({ projectRoot })` never spawns the `deckent`/`claude`
// binaries and never writes to disk — every method is a pure read (or, for
// `limits()`, an injectable-spawn probe that defaults to a real subprocess
// only when the caller doesn't override it). Existing core/orchestra
// functions are imported as-is; this module adds no parsing/query logic of
// its own beyond the two small `status()` disk readers, which have no
// existing core-level equivalent in scope.
//
// Sprint-360 Task 360-012 (fix pass).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentSprintId } from '../core/event-stream.js';
import { TASKS_DIR, DASHBOARD_FILE, BRAIN_DIR, MEMORY_DB_FILE } from '../core/constants.js';
import type { Task } from '../core/task-types.js';
import type { DashboardState } from '../core/monitoring-types.js';
import { MemoryStore } from '../core/memory-store.js';
import { searchMemory } from '../core/memory-query.js';
import type { MemoryQueryParams, MemorySearchResult } from '../core/memory-types.js';
import { parseStructuredDirectives } from '../orchestra/task-builder.js';
import type { ParsedDirectiveTask } from '../orchestra/task-builder.js';
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

export interface DeckentClient {
  /** Current sprint id, `.dashboard` snapshot, and parsed `.tasks/*.json` — read-only, no spawn. */
  status(): Promise<DeckentSdkStatus>;
  /** Full-text search over `.brain/memory.db`. Returns `[]` when the DB doesn't exist yet. */
  memoryQuery(query: string, options?: DeckentMemoryQueryOptions): Promise<MemorySearchResult[]>;
  /** Parse DIRECTIVES-style text into structured tasks WITHOUT writing anything to disk. */
  planStructured(directivesText: string): Promise<ParsedDirectiveTask[]>;
  /** Probe + evaluate the live subscription usage window (Task 360-002 module). */
  limits(options?: DeckentLimitsOptions): Promise<DeckentLimitsResult>;
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
}

/**
 * Create a programmatic deckent client scoped to `projectRoot`. Every method
 * is CLI-binary-free: `status`/`memoryQuery`/`planStructured` never spawn a
 * process, and `limits` only spawns `claude -p "/usage"` when the caller
 * doesn't supply `probeOptions.spawnImpl` (see `ProbeSubscriptionLimitsOptions`).
 */
export function createDeckentClient(options: DeckentClientOptions): DeckentClient {
  return new DeckentClientImpl(options.projectRoot);
}
