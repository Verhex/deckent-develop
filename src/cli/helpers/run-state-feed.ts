// ─── STATE-FEED — live-footer real state source (Sprint 354, Task 354-014) ──
//
// Wires buildLiveFooter's state-seam (LiveFooterState, see live-footer.ts) to
// real on-disk sprint state: .tasks/task-<id>.hb heartbeats + the single
// .deckent/sprint-state.json snapshot. All fs access goes through an
// injectable seam (StateFeedFs) so this reader stays fs-fake-testable without
// touching real project files (see tests/cli/run-state-feed.test.ts).
//
// Provider-health/auth: read-only from an optional on-disk cache
// (PROVIDER_HEALTH_CACHE_FILE) IF some other module has ever written one.
// This module never probes a provider or auth state itself — no writer for
// that cache exists yet anywhere in the codebase (checked: provider-auth-probe.ts
// and health-snapshot.ts both perform LIVE probes, session-interface.ts's
// Connector.healthCache is a private in-memory Map with no getter); until a
// writer lands, provider/auth simply stay undefined — the same
// "file-absence -> honest idle" rule applied uniformly across every input.
//
// A missing or corrupt file at any seam degrades to "absent", never to a
// thrown error or fabricated state.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  TASKS_DIR,
  SPRINT_STATE_FILE,
  RUNTIME_DIR,
  JOBS_DIR,
  RUN_STATUS_READ_MODEL_FILE,
} from '../../core/constants.js';
import type { LiveFooterState, LiveFooterProviderState, LiveFooterAuthState } from './live-footer.js';
import { readWorkerProgress, type ProgressReaderFs, type WorkerProgressSummary } from './progress-reader.js';
import {
  readCanonicalRunStatusReadModel,
  type CanonicalRunStatusReadModel,
} from '../../core/run-status-read-model.js';

// ─── fs seam ────────────────────────────────────────────────────────────────

export interface StateFeedFs {
  existsSync(path: string): boolean;
  readFileSync(path: string): string;
  readdirSync(path: string): string[];
}

const REAL_FS: StateFeedFs = {
  existsSync: (path) => existsSync(path),
  readFileSync: (path) => readFileSync(path, 'utf-8'),
  readdirSync: (path) => readdirSync(path),
};

/** Forward seam: no writer exists yet — see file header. Path is stable so a
 * future probe-cache writer can target it without any change to this reader. */
export const PROVIDER_HEALTH_CACHE_FILE = join(RUNTIME_DIR, 'provider-health-cache.json');

// ─── Raw on-disk shapes ─────────────────────────────────────────────────────
// Deliberately permissive: real .hb writers in this codebase (docker backend)
// omit fields the canonical `Heartbeat` type (core/monitoring-types.ts) marks
// required (currentAction, filesChangedCount, progress) — this reader must not
// throw or drop a heartbeat just because of that.

interface RawSprintState {
  sprintId?: unknown;
  phase?: unknown;
  startedAt?: unknown;
  taskIds?: unknown;
}

interface RawHeartbeat {
  taskId?: unknown;
  currentAction?: unknown;
}

interface RawProviderHealthCache {
  provider?: { name?: unknown; healthy?: unknown };
  auth?: unknown;
}

// TERM5-FEED (sprint-427, task 2) — tolerant raw shape for
// `.deckent/runtime/jobs/<sprintId>.json`. Deliberately decoupled from
// orchestra/sprint-finalizer.ts's `SprintCompletionRecord` export (ADR-D-004
// C2/C3 — cli/ helpers stay independent of orchestra/'s internal types) —
// mirrors run-completion-watch.ts's own `RawJobRecord` precedent of a local,
// permissive shape rather than importing the writer's type.
interface RawCompletionRecord {
  flowId?: unknown;
  verdictSummary?: { done?: unknown; techDebt?: unknown; noGo?: unknown };
}

interface RawJobRecord {
  jobId?: unknown;
  sprintId?: unknown;
  status?: unknown;
  /** Additive field (427-001, TERM5-FIN) — absent on every job file written
   *  before that change and on any job never started via the run-flow-v2
   *  path. Its absence (or a missing/mismatched `flowId` within it) is the
   *  "legacy-yol" this task's correlation logic must leave untouched. */
  completionRecord?: RawCompletionRecord;
}

// ─── Pure core ──────────────────────────────────────────────────────────────

export interface StateFeedInput {
  /** Validated persisted lifecycle/logical-work authority. */
  runStatusReadModel?: CanonicalRunStatusReadModel | null;
  sprintState: RawSprintState | null;
  /** One raw parsed object per readable task-<id>.hb file. */
  heartbeats: RawHeartbeat[];
  /** taskIds with a task-<id>.result file already written (order-independent). */
  finishedTaskIds: ReadonlySet<string>;
  /** Parsed provider-health-cache.json, if present + well-formed. */
  providerCache: RawProviderHealthCache | null;
  /** WLT-READ progress summaries (progress-reader.ts), keyed by taskId.
   * Optional — omitted entirely when the caller has no progress data (e.g.
   * pure-core unit tests), in which case worker detail falls back to hb. */
  workerProgress?: Record<string, WorkerProgressSummary>;
  /** Raw parsed `.deckent/runtime/jobs/*.json` records. Optional — omitted
   *  entirely when the caller has no job data (e.g. pure-core unit tests, or
   *  `flowId` below is unset so `readLiveFooterState` never scanned
   *  JOBS_DIR), in which case no `completion` event is ever produced. */
  jobRecords?: RawJobRecord[];
  /** The flowId of the currently-watched detached run-handle
   *  (`DetachedSpawnResult.flowId`, detached-start.ts) to correlate
   *  against. When omitted, or when no `jobRecords` entry's
   *  `completionRecord.flowId` matches it, the legacy (no-correlation) path
   *  applies unchanged — no `completion` field is added to the result. */
  flowId?: string;
}

// ─── WLT-FEED-WIRE — per-worker detail (Sprint 356, Task 356-005) ──────────
// `LiveFooterState` (live-footer.ts) is out of this task's write-scope, so the
// worker-detail field is added via a local superset type rather than editing
// that interface. `StateFeedState` is structurally assignable wherever
// `LiveFooterState` is expected (extra optional field only), so this stays
// backward-compatible with any existing/future `() => LiveFooterState` caller.

export interface WorkerFeedDetail {
  /** "şu an ne yapıyor" for this worker: progress-reader's last step (preferred),
   * hb.currentAction fallback, or the sentinel 'unknown' if neither has data. */
  currentAction: string;
}

// ─── TERM5-FEED — flowId-correlated completion (Sprint 427, Task 427-002) ──
// Correlates Task-1's (427-001) additive `completionRecord.flowId` against
// the flowId of a caller-watched detached run-handle
// (`DetachedSpawnResult.flowId`, detached-start.ts). Purely additive/opt-in:
// a caller that never supplies `StateFeedOptions.flowId` (every caller
// today) gets the exact pre-existing behavior — no `completion` field, no
// extra fs work (see `readLiveFooterState`).

export interface CorrelatedCompletionEvent {
  /** The flowId this event matched against — always equals the `flowId`
   *  the caller supplied. */
  readonly flowId: string;
  /** Stable job identifier: `job.jobId` if present, else `job.sprintId`,
   *  else falls back to `flowId` itself (mirrors run-completion-watch.ts's
   *  `firstNonEmptyString` fallback chain — never empty). */
  readonly jobId: string;
  readonly sprintId?: string;
  /** Raw on-disk job status string (e.g. "COMPLETE") — passed through
   *  untyped since this reader must not throw on an unrecognized value. */
  readonly status?: string;
  readonly verdictSummary?: {
    readonly done: number;
    readonly techDebt: number;
    readonly noGo: number;
  };
}

export interface StateFeedState extends LiveFooterState {
  /** Per-active-worker detail, keyed by taskId. Omitted entirely when there
   * are zero active workers (same omit-when-absent convention as `next`). */
  workers?: Record<string, WorkerFeedDetail>;
  /** Set only when `StateFeedOptions.flowId`/`StateFeedInput.flowId` was
   *  supplied AND a job record's `completionRecord.flowId` matches it.
   *  Omitted for every legacy record (no `completionRecord`, or no `flowId`
   *  watched) — same omit-when-absent convention as `next`/`workers`. */
  completion?: CorrelatedCompletionEvent;
  /** Revision identity consumed by Terminal; omitted on legacy/missing authority. */
  statusReadModel?: {
    readonly state: 'persisted' | 'unavailable-or-stale';
    readonly revision?: number;
    readonly modelDigest?: string;
  };
}

function normalizeAuth(value: unknown): LiveFooterAuthState | undefined {
  return value === 'logged-in' || value === 'logged-out' || value === 'unknown' ? value : undefined;
}

function normalizeProvider(raw: RawProviderHealthCache['provider']): LiveFooterProviderState | undefined {
  if (!raw || typeof raw.name !== 'string') return undefined;
  const healthy: boolean | 'unknown' = raw.healthy === true ? true : raw.healthy === false ? false : 'unknown';
  return { name: raw.name, healthy };
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function normalizeVerdictSummary(
  raw: RawCompletionRecord['verdictSummary'],
): CorrelatedCompletionEvent['verdictSummary'] {
  if (!raw) return undefined;
  const { done, techDebt, noGo } = raw;
  if (typeof done !== 'number' || typeof techDebt !== 'number' || typeof noGo !== 'number') return undefined;
  return { done, techDebt, noGo };
}

/**
 * Scans already-parsed job records for one whose `completionRecord.flowId`
 * matches `flowId`, returning a typed `CorrelatedCompletionEvent` for the
 * first hit. Returns `undefined` — no correlation attempted at all — when
 * either `flowId` or `jobRecords` is absent, which is exactly the
 * "flowId'siz eski kayıtlar aynen çalışır" legacy path.
 */
function findCorrelatedCompletion(
  jobRecords: RawJobRecord[] | undefined,
  flowId: string | undefined,
): CorrelatedCompletionEvent | undefined {
  if (!flowId || !jobRecords) return undefined;

  for (const job of jobRecords) {
    const recordFlowId = job.completionRecord?.flowId;
    if (recordFlowId !== flowId) continue;

    const sprintId = firstNonEmptyString(job.sprintId);
    const status = firstNonEmptyString(job.status);
    const verdictSummary = normalizeVerdictSummary(job.completionRecord?.verdictSummary);

    return {
      flowId,
      jobId: firstNonEmptyString(job.jobId, job.sprintId) ?? flowId,
      ...(sprintId !== undefined ? { sprintId } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(verdictSummary !== undefined ? { verdictSummary } : {}),
    };
  }
  return undefined;
}

function resolveWorkerCurrentAction(
  taskId: string,
  heartbeat: RawHeartbeat | undefined,
  workerProgress: Record<string, WorkerProgressSummary> | undefined,
): string {
  const progressAction = workerProgress?.[taskId]?.currentAction;
  if (typeof progressAction === 'string' && progressAction.length > 0) return progressAction;

  const hbAction = heartbeat?.currentAction;
  if (typeof hbAction === 'string' && hbAction.length > 0) return hbAction;

  return 'unknown';
}

/**
 * Pure — computes LiveFooterState from already-parsed inputs, zero I/O.
 * Missing sprint-state (`sprintState: null`) yields an entirely empty result
 * (buildLiveFooter then honestly collapses to "idle").
 */
export function computeLiveFooterState(input: StateFeedInput): StateFeedState {
  const {
    runStatusReadModel,
    sprintState,
    heartbeats,
    finishedTaskIds,
    providerCache,
    workerProgress,
    jobRecords,
    flowId,
  } = input;
  const state: StateFeedState = {};

  if (runStatusReadModel) {
    state.statusReadModel = {
      state: 'persisted',
      revision: runStatusReadModel.revision,
      modelDigest: runStatusReadModel.modelDigest,
    };
  }

  const heartbeatTaskIds = heartbeats
    .map((hb) => (typeof hb.taskId === 'string' ? hb.taskId : null))
    .filter((id): id is string => id !== null);
  const modelActiveAttemptIds = runStatusReadModel
    ? new Set(
        runStatusReadModel.logicalProgress.lineages
          .filter(lineage => lineage.status === 'active')
          .flatMap(lineage => lineage.attemptIds),
      )
    : null;
  const lifecycleAllowsWorkers = !runStatusReadModel
    || runStatusReadModel.authority.lifecycle === 'ACTIVE';
  const activeTaskIds = lifecycleAllowsWorkers
    ? heartbeatTaskIds.filter(id => (
        !finishedTaskIds.has(id)
        && (modelActiveAttemptIds === null || modelActiveAttemptIds.has(id))
      ))
    : [];

  if (activeTaskIds.length > 0) {
    const heartbeatsByTaskId = new Map(heartbeats.filter((hb) => typeof hb.taskId === 'string').map((hb) => [hb.taskId as string, hb]));
    state.workers = {};
    for (const taskId of activeTaskIds) {
      state.workers[taskId] = {
        currentAction: resolveWorkerCurrentAction(taskId, heartbeatsByTaskId.get(taskId), workerProgress),
      };
    }
  }

  const modelAuthority = runStatusReadModel?.authority;
  const lifecycleHasRun = modelAuthority
    ? modelAuthority.lifecycle === 'ACTIVE'
      || modelAuthority.lifecycle === 'PAUSED'
      || modelAuthority.lifecycle === 'ORPHANED'
    : true;
  const sprintId = lifecycleHasRun && typeof modelAuthority?.sprintId === 'string'
    ? modelAuthority.sprintId
    : lifecycleHasRun && typeof sprintState?.sprintId === 'string'
      ? sprintState.sprintId
      : undefined;
  const phase = lifecycleHasRun && typeof modelAuthority?.phase === 'string'
    ? modelAuthority.phase
    : lifecycleHasRun && typeof sprintState?.phase === 'string'
      ? sprintState.phase
      : undefined;

  if (sprintId !== undefined && phase !== undefined) {
    if (activeTaskIds.length === 1) {
      state.running = `${activeTaskIds[0]} · ${phase}`;
    } else if (activeTaskIds.length > 1) {
      state.running = `${activeTaskIds.length} tasks · ${phase}`;
    } else {
      state.running = `${sprintId} · ${phase}`;
    }
  }

  if (typeof sprintState?.startedAt === 'string') {
    state.startedAt = sprintState.startedAt;
  }

  const provider = normalizeProvider(providerCache?.provider);
  if (provider !== undefined) state.provider = provider;

  const auth = normalizeAuth(providerCache?.auth);
  if (auth !== undefined) state.auth = auth;

  const rawTaskIds = sprintState?.taskIds;
  const taskIds: string[] = Array.isArray(rawTaskIds)
    ? rawTaskIds.filter((id): id is string => typeof id === 'string')
    : [];
  const startedTaskIds = new Set(heartbeatTaskIds);
  const next = taskIds.find((id) => !startedTaskIds.has(id) && !finishedTaskIds.has(id));
  if (next !== undefined) state.next = next;

  const completion = findCorrelatedCompletion(jobRecords, flowId);
  if (completion !== undefined) state.completion = completion;

  return state;
}

// ─── fs-seam reader ─────────────────────────────────────────────────────────

export interface StateFeedOptions {
  /** Absolute project root — .tasks/, .deckent/sprint-state.json etc. are
   * resolved relative to it. */
  projectRoot: string;
  /** Defaults to real node:fs. Inject a fake for hermetic tests. */
  fs?: StateFeedFs;
  /** Progress-reader's own fs seam (distinct shape: fd-based tail reads, not
   * existsSync/readFileSync/readdirSync). Defaults to real node:fs — same
   * "inject a fake for hermetic tests" precedent as `fs` above, just a
   * separate seam because `readWorkerProgress` needs different primitives. */
  progressFs?: ProgressReaderFs;
  /** Canonical read-model seam for hermetic adapters/tests. Production uses
   * the persisted reader; supplying raw sprint-state is never a substitute. */
  readRunStatusReadModel?: (projectRoot: string) => CanonicalRunStatusReadModel | null;
  /** The flowId of a currently-watched detached run-handle
   *  (`DetachedSpawnResult.flowId`, detached-start.ts) to correlate
   *  against — see `StateFeedState.completion`. When omitted (every caller
   *  today), `readLiveFooterState` never scans `JOBS_DIR` at all: zero extra
   *  fs work, byte-identical legacy behavior. */
  flowId?: string;
}

function readJson<T>(fs: StateFeedFs, path: string): T | null {
  if (!fs.existsSync(path)) return null;
  try {
    return JSON.parse(fs.readFileSync(path)) as T;
  } catch {
    return null;
  }
}

function readHeartbeatsAndResults(
  fs: StateFeedFs,
  tasksDir: string,
): { heartbeats: RawHeartbeat[]; finishedTaskIds: Set<string> } {
  const heartbeats: RawHeartbeat[] = [];
  const finishedTaskIds = new Set<string>();
  if (!fs.existsSync(tasksDir)) return { heartbeats, finishedTaskIds };

  let files: string[];
  try {
    files = fs.readdirSync(tasksDir);
  } catch {
    return { heartbeats, finishedTaskIds };
  }

  for (const file of files) {
    if (!file.endsWith('.result')) continue;
    finishedTaskIds.add(file.replace(/^task-/, '').replace(/\.result$/, ''));
  }

  for (const file of files) {
    if (!file.endsWith('.hb')) continue;
    try {
      heartbeats.push(JSON.parse(fs.readFileSync(join(tasksDir, file))) as RawHeartbeat);
    } catch {
      // malformed .hb — skip silently (matches sprint-state-tracker.ts precedent)
    }
  }

  return { heartbeats, finishedTaskIds };
}

/**
 * Reads every `*.json` file under `jobsDir` (TERM5-FEED, sprint-427 task 2).
 * Only ever called when `options.flowId` is set — see `readLiveFooterState`.
 * Degrade-safe end-to-end, matching `readHeartbeatsAndResults`: a missing
 * dir, an unreadable dir, or a single malformed file all skip rather than throw.
 */
function readJobRecords(fs: StateFeedFs, jobsDir: string): RawJobRecord[] {
  const records: RawJobRecord[] = [];
  if (!fs.existsSync(jobsDir)) return records;

  let files: string[];
  try {
    files = fs.readdirSync(jobsDir);
  } catch {
    return records;
  }

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      records.push(JSON.parse(fs.readFileSync(join(jobsDir, file))) as RawJobRecord);
    } catch {
      // malformed job file — skip silently (matches readHeartbeatsAndResults precedent)
    }
  }

  return records;
}

/**
 * Reads .tasks/*.hb + .deckent/sprint-state.json (+ optional provider-health
 * cache) through `options.fs` and returns the resulting LiveFooterState.
 * Never triggers a provider/auth probe; a missing or corrupt file at any seam
 * degrades to "absent" rather than throwing. When `options.flowId` is set,
 * also scans `JOBS_DIR` for a flowId-correlated completion event
 * (TERM5-FEED, sprint-427 task 2) — omitted entirely, with zero extra fs
 * work, when `options.flowId` is not supplied (legacy path).
 */
export function readLiveFooterState(options: StateFeedOptions): StateFeedState {
  const fs = options.fs ?? REAL_FS;
  const tasksDir = join(options.projectRoot, TASKS_DIR);
  const sprintStateFile = join(options.projectRoot, SPRINT_STATE_FILE);
  const providerCacheFile = join(options.projectRoot, PROVIDER_HEALTH_CACHE_FILE);

  const sprintState = readJson<RawSprintState>(fs, sprintStateFile);
  let runStatusReadModel: CanonicalRunStatusReadModel | null = null;
  let runStatusReadModelInvalid = false;
  try {
    runStatusReadModel = (options.readRunStatusReadModel ?? readCanonicalRunStatusReadModel)(
      options.projectRoot,
    );
  } catch {
    runStatusReadModelInvalid = true;
  }
  if (
    !runStatusReadModel
    && (runStatusReadModelInvalid || fs.existsSync(join(options.projectRoot, RUN_STATUS_READ_MODEL_FILE)) || sprintState !== null)
  ) {
    return { statusReadModel: { state: 'unavailable-or-stale' } };
  }
  const { heartbeats, finishedTaskIds } = readHeartbeatsAndResults(fs, tasksDir);
  const providerCache = readJson<RawProviderHealthCache>(fs, providerCacheFile);
  const workerProgress = readWorkerProgress(tasksDir, { fs: options.progressFs });
  const jobRecords = options.flowId ? readJobRecords(fs, join(options.projectRoot, JOBS_DIR)) : undefined;

  return computeLiveFooterState({
    runStatusReadModel,
    sprintState,
    heartbeats,
    finishedTaskIds,
    providerCache,
    workerProgress,
    jobRecords,
    flowId: options.flowId,
  });
}

/**
 * Factory matching the `stateFeed?: () => LiveFooterState` seam consumed by
 * ReplApp (src/cli/repl/app.tsx) — each call re-reads a fresh snapshot, so
 * the caller's poll interval controls freshness; no caching is done here.
 * `StateFeedState` (with the added `workers` detail) stays structurally
 * assignable to `() => LiveFooterState` for that seam.
 */
export function createRunStateFeed(options: StateFeedOptions): () => StateFeedState {
  return () => readLiveFooterState(options);
}
