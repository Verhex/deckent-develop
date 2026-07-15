// ─── RunCompletionWatch — detached-run finish → REPL bg-turn producer (born-642, 408-001) ──
// Closes the gap docs/gap-report-2026-07-11 (halka-7) named: a detached sprint
// started from the REPL finishes on disk (`.deckent/runtime/jobs/*.json`
// transitions RUNNING -> COMPLETE/FAILED) but nothing ever told the live REPL
// session — `ChatTurnQueue.enqueueBg` (chat-turn-queue.ts) has zero production
// callers today. This module is the PRODUCER half; the consumer half
// (app.tsx's `registerBgEventSink` -> bgQueue.enqueueBg -> drain-at-turn-end
// -> render as a 'bg' turn) already exists and is unchanged.
//
// Shape deliberately mirrors `../../core/approval-store-watch.ts`
// (APR-XPROC-CORE): fs.watch (unref'd) + an ALWAYS-ON poll fallback — fs.watch
// is known unreliable on WSL / network filesystems (Yasa #2), so the poll
// timer is never merely a fallback-on-failure. Injectable `watch`/`scan` seams
// for hermetic tests; `dispose()` is idempotent and releases every handle.
//
// Deliberately the INVERSE of ApprovalStoreWatch's store-replay-on-attach: an
// approval that is already pending on disk MUST resurface (it still needs a
// decision), but a sprint job that was ALREADY COMPLETE/FAILED before this
// watcher ever attached must NOT resurface as a brand-new bg-turn every time
// a fresh REPL session starts — that would spam months of historical sprint
// history into the very first turn. The construction-time baseline scan below
// marks every already-terminal jobId as seen WITHOUT invoking `onComplete`;
// only a job that transitions to (or newly appears in) a terminal status
// AFTER the watcher attached ever fires.
//
// String-free (i18n-first quality bar, project CLAUDE.md): this module never
// builds a user-facing sentence — it hands the caller a structured
// `RunCompletionInfo`. Same "resolved by the caller, not this module"
// contract chat-turn-queue.ts's own `ChatTurnBgEvent.summary` doc documents.

import { watch as fsWatch, readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Terminal job statuses this watcher reports — a RUNNING job carries nothing
 *  to report yet and is filtered out before it ever reaches the fired-set. */
export type RunCompletionStatus = 'COMPLETE' | 'FAILED';

/** One evaluated task's evidence, read from the job's `completionRecord.taskSummary`
 *  (SURF-3 result-evidence). Language-neutral — run.tsx renders it via i18n. */
export interface RunTaskEvidence {
  readonly taskId: string;
  readonly title: string;
  /** Brain verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO' (kept as the raw string). */
  readonly evaluation: string;
  readonly selfAssessment: string;
  readonly filesChanged: number;
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly testsPassed: boolean;
  readonly coverage: number;
}

/** Structured, language-neutral summary of one finished detached run — the
 *  caller (run.tsx's `buildBgTurnEvent`) turns this into a `ChatTurnBgEvent`. */
export interface RunCompletionInfo {
  readonly jobId: string;
  readonly sprintId?: string;
  readonly status: RunCompletionStatus;
  readonly totalTasks?: number;
  readonly done?: number;
  readonly techDebt?: number;
  readonly noGo?: number;
  readonly error?: string;
  /** Run-flow correlation id (TERM5-WATCH, sprint-427 task 3) — mirrors
   *  run-state-feed.ts's `CorrelatedCompletionEvent.flowId`. Populated from
   *  `completionRecord.flowId` when present on disk (427-001's additive
   *  field); `undefined` for every legacy job record. */
  readonly flowId?: string;
  /** Per-task evidence (SURF-3 result-evidence) — from `completionRecord.taskSummary`.
   *  `undefined`/empty for a FAILED run (no rich record written) or a legacy job. */
  readonly tasks?: readonly RunTaskEvidence[];
}

export interface RunCompletionWatchHandlers {
  /** Fired once per jobId the first time its status is observed as
   *  COMPLETE/FAILED AFTER this watcher attached (never for the
   *  construction-time baseline — see module docs). */
  onComplete: (info: RunCompletionInfo) => void;
}

/** Injectable fs.watch seam (tests substitute a controllable stub). Must
 *  never throw — the poll fallback is what carries correctness when this is
 *  unavailable (mirrors approval-store-watch.ts's ApprovalStoreWatchFsWatcher). */
export type RunCompletionWatchFsWatcher = (dir: string, onChange: () => void) => { close(): void };

export interface RunCompletionWatchOptions {
  /** Poll-fallback cadence. ALWAYS runs alongside fs.watch. Default 1000ms. */
  pollIntervalMs?: number;
  /** Injectable fs.watch seam (tests). Default: real `node:fs` `watch`. */
  watch?: RunCompletionWatchFsWatcher;
  /** Injectable one-shot directory scan (tests). Default: real fs read of `jobsDir`. */
  scan?: (dir: string) => RunCompletionInfo[];
  /**
   * Run-flow correlation id to filter against (TERM5-WATCH, sprint-427 task
   * 3 — mirrors run-state-feed.ts's `StateFeedOptions.flowId`). When set,
   * `onComplete` fires only for a record whose `flowId` matches; a record
   * with no `flowId` (every legacy job) never matches. When omitted
   * (every caller today), the watcher is unfiltered — byte-identical to the
   * pre-427-003 behavior of firing for any terminal job project-wide.
   */
  flowId?: string;
}

export interface RunCompletionWatchHandle {
  /** Stop watching + polling and release every OS handle/timer. Idempotent;
   *  no handler fires again after this returns, even for an in-flight event. */
  dispose(): void;
}

// ─── Tolerant on-disk parsing ────────────────────────────────────────────────
// Two writer shapes exist on disk for the SAME job file across its lifetime:
// `job-runner.ts`'s `writeJobState` (`tasks: TaskSummary[]`, used for the
// initial RUNNING write and the FAILED catch-branch in sprint-runner-entry.ts)
// and `sprint-finalizer.ts`'s direct `writeFileSync` (`evaluations: {...}`, the
// normal COMPLETE path). This parser only reads fields common to both —
// mirrors `session-resume.ts`'s `parseSessionRecord` tolerance exactly.

interface RawJobRecord {
  jobId?: unknown;
  sprintId?: unknown;
  status?: unknown;
  error?: unknown;
  metrics?: {
    totalTasks?: unknown;
    done?: unknown;
    techDebt?: unknown;
    noGo?: unknown;
  };
  /** Additive field (427-001, TERM5-FIN). `flowId` + `taskSummary` (SURF-3
   *  result-evidence) are read here — the same tolerant "local, permissive
   *  shape" precedent run-state-feed.ts's own `RawCompletionRecord` follows,
   *  not an import of the writer's type (ADR-D-004 C2/C3). */
  completionRecord?: {
    flowId?: unknown;
    taskSummary?: unknown;
  };
}

/** Tolerant parse of one `completionRecord.taskSummary` entry — every field is
 *  defended so a legacy/partial record degrades to a low-detail evidence line
 *  rather than throwing. */
function parseTaskEvidence(entry: unknown): RunTaskEvidence | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const e = entry as Record<string, unknown>;
  const taskId = firstNonEmptyString(e['taskId']);
  if (!taskId) return null;
  return {
    taskId,
    title: firstNonEmptyString(e['title']) ?? '',
    evaluation: firstNonEmptyString(e['evaluation']) ?? '',
    selfAssessment: firstNonEmptyString(e['selfAssessment']) ?? '',
    filesChanged: numberOrUndefined(e['filesChanged']) ?? 0,
    linesAdded: numberOrUndefined(e['linesAdded']) ?? 0,
    linesRemoved: numberOrUndefined(e['linesRemoved']) ?? 0,
    testsPassed: e['testsPassed'] === true,
    coverage: numberOrUndefined(e['coverage']) ?? 0,
  };
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Parses one job file's raw text into a `RunCompletionInfo`, or `null` when
 * the file is corrupt/unusable OR not yet in a terminal status (RUNNING has
 * nothing to report). `fallbackJobId` (the filename stem) is used when the
 * record itself carries neither `jobId` nor `sprintId` — every returned
 * record always has SOME stable id so the caller's dedup set works reliably.
 */
export function parseRunCompletionRecord(raw: string, fallbackJobId: string): RunCompletionInfo | null {
  let job: RawJobRecord;
  try {
    job = JSON.parse(raw) as RawJobRecord;
  } catch {
    return null;
  }
  if (typeof job !== 'object' || job === null) return null;

  const status = job.status === 'COMPLETE' || job.status === 'FAILED' ? job.status : undefined;
  if (!status) return null;

  const jobId = firstNonEmptyString(job.jobId, job.sprintId) ?? fallbackJobId;
  const metrics = job.metrics;

  const rawTaskSummary = job.completionRecord?.taskSummary;
  const tasks = Array.isArray(rawTaskSummary)
    ? rawTaskSummary.map(parseTaskEvidence).filter((t): t is RunTaskEvidence => t !== null)
    : [];

  return {
    jobId,
    sprintId: firstNonEmptyString(job.sprintId),
    status,
    totalTasks: numberOrUndefined(metrics?.totalTasks),
    done: numberOrUndefined(metrics?.done),
    techDebt: numberOrUndefined(metrics?.techDebt),
    noGo: numberOrUndefined(metrics?.noGo),
    error: firstNonEmptyString(job.error),
    flowId: firstNonEmptyString(job.completionRecord?.flowId),
    ...(tasks.length > 0 ? { tasks } : {}),
  };
}

/** Default one-shot scan: reads every `*.json` file in `dir` and parses the
 *  terminal ones. Tolerant end-to-end — a missing dir, an unreadable file, or
 *  a corrupt file all degrade to "skip that entry", never a throw. */
/** One-shot read of every TERMINAL (COMPLETE/FAILED) job record in `dir`.
 *  Exported for reuse by the run-flow inbox (SURF-3 multi-flow-inbox) — the
 *  jobs-dir is the cross-process execution truth (RUNNING jobs parse to null,
 *  so this returns only finished ones). Tolerant: a missing dir / unreadable
 *  file / corrupt json is skipped, never thrown. */
export function scanJobRecords(dir: string): RunCompletionInfo[] {
  if (!existsSync(dir)) return [];

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }

  const records: RunCompletionInfo[] = [];
  for (const file of files) {
    let raw: string;
    try {
      raw = readFileSync(join(dir, file), 'utf-8');
    } catch {
      continue;
    }
    const record = parseRunCompletionRecord(raw, file.replace(/\.json$/, ''));
    if (record !== null) records.push(record);
  }
  return records;
}

// ─── Default fs.watch seam ───────────────────────────────────────────────────

function defaultFsWatcher(dir: string, onChange: () => void): { close(): void } {
  const watcher = fsWatch(dir, () => onChange());
  if (typeof watcher.unref === 'function') watcher.unref();
  return { close: () => watcher.close() };
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;

// ─── createRunCompletionWatch ────────────────────────────────────────────────

/**
 * Watch `jobsDir` for job files transitioning into a terminal status and
 * report each one via `handlers.onComplete`, exactly once per jobId. Runs one
 * synchronous BASELINE scan before returning — unlike ApprovalStoreWatch's
 * store-replay, this baseline never invokes `onComplete` (see module docs):
 * it only seeds the dedup set so pre-existing history never resurfaces.
 */
export function createRunCompletionWatch(
  jobsDir: string,
  handlers: RunCompletionWatchHandlers,
  opts: RunCompletionWatchOptions = {},
): RunCompletionWatchHandle {
  const scan = opts.scan ?? scanJobRecords;
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  // TERM5-WATCH (sprint-427 task 3): opt-in flowId filter — `undefined` when
  // the caller doesn't supply one, which keeps the guard below always-false
  // and the scan loop byte-identical to the pre-427-003 unfiltered behavior.
  const watchFlowId = opts.flowId;

  const fired = new Set<string>();
  let disposed = false;

  function runScan(isBaseline: boolean): void {
    if (disposed) return;

    let records: RunCompletionInfo[];
    try {
      records = scan(jobsDir);
    } catch {
      return; // tolerant — mirrors ApprovalStoreWatch's own torn-read tolerance
    }

    for (const record of records) {
      // Multi-session false-match guard: a record with no flowId (every
      // legacy job) never matches a supplied filter — mirrors
      // run-state-feed.ts's "legacy job record ... never matches" invariant.
      if (watchFlowId !== undefined && record.flowId !== watchFlowId) continue;
      if (fired.has(record.jobId)) continue;
      fired.add(record.jobId);
      if (isBaseline) continue; // seed dedup only — never notify for pre-existing history
      handlers.onComplete(record);
    }
  }

  let fsWatcher: { close(): void } | undefined;
  try {
    fsWatcher = (opts.watch ?? defaultFsWatcher)(jobsDir, () => runScan(false));
  } catch {
    fsWatcher = undefined; // unsupported platform/EMFILE/etc. — poll fallback still runs
  }

  const pollTimer = setInterval(() => runScan(false), pollIntervalMs);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();

  runScan(true); // baseline — seeds `fired` for everything already-terminal on disk

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearInterval(pollTimer);
      fsWatcher?.close();
    },
  };
}
