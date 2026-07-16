// ═══ run-flow-inbox — read-only multi-flow list for the terminal (SURF-3) ════
//
// The terminal's RunFlowController is single-flow-by-design (it tracks the ONE
// flow this REPL proposed). But a user can have several `deckent do` runs going
// at once — each is its own detached process writing to the shared on-disk
// stores. This module is the read-only "inbox" that surfaces ALL of them.
//
// SCOPE (D1, smallest valuable slice): collect + render only. No selection, no
// live refresh, no stdin card — a `/runs` slash prints the list to the
// transcript, mirroring the `/resume` picker (buildResumePickerLines). Focus /
// switch (D2) and a live-refreshing card (D3) are deferred.
//
// DATA — joins the TWO cross-process on-disk sources, because neither alone is
// honest for a `do`-created flow:
//   * run-flow-store (`.deckent/run-flow-store/`) — every flow's LIFECYCLE state
//     (PROPOSAL_READY / AWAITING_APPROVAL / APPROVED / DETACHED_RUNNING) +
//     intentSummary (for API-created flows). A `do`-created flow stalls at
//     DETACHED_RUNNING here (its detached child never writes RUN_COMPLETED to
//     the durable log — a known backend gap), so this source alone would show a
//     finished run as still running.
//   * jobs-dir (`.deckent/runtime/jobs/*.json`) — the EXECUTION truth
//     (COMPLETE / FAILED), correlated by flowId. Overrides the store state when
//     present, so a finished `do` shows COMPLETED not phantom DETACHED_RUNNING.
//
// DEATH-SWEEP DECISION (explicit): this is a PURE READER — it never triggers
// `sweepDeadDetachedRuns`. A flow whose detached child was SIGKILLed without a
// crash-write keeps its last durable state (likely DETACHED_RUNNING) until a
// write-path sweep closes it. Accepted for a read-only list; making the inbox a
// writer would break the read-only contract of this slice.
//
// LIVENESS DERIVATION (F-3, display-honesty): staying a pure reader does NOT
// mean repeating an unverified claim. For a row still claiming a live process
// (STARTING/DETACHED_RUNNING, no terminal jobs-dir record) the collect probes
// the recorded run pid READ-ONLY (`isPidAlive` — zero store writes):
//   * pid recorded + gone  → shown as FAILED with a "process died" mark (the
//     durable RUN_FAILED lands on the next write-path sweep; display agrees
//     with what that sweep will record).
//   * handle predates pid tracking (pre-698) → the "running" claim is
//     unverifiable → shown with an "unverified" mark, state untouched.
//   * pid recorded + alive → "running" is now VERIFIED, no mark.
// Durable closure stays on the write paths (`deckent status` read-path sweep,
// `deckent runs --close-stale`). Known limit (same as the sweep): a recycled
// pid reads as alive.

import { join } from 'node:path';
import { getRunFlowCoordinator } from '../../orchestra/run-flow-coordinator-registry.js';
import { scanJobRecords } from './run-completion-watch.js';
import { loadRunHandle, loadApprovedSnapshot, readFlowEvents } from '../../core/run-flow-store.js';
import { isPidAlive } from '../../core/pid-liveness.js';
import { isTerminalRunFlowState } from '../../core/run-flow-contract.js';
import type { RunFlowState } from '../../core/run-flow-contract.js';

/** One inbox row — language-neutral; `buildInboxLines` renders it via labels. */
export interface InboxRow {
  readonly flowId: string;
  readonly state: RunFlowState;
  /** NL goal, when the flow carries a proposal (API-created flows; `do` flows may lack it). */
  readonly intentSummary?: string;
  readonly revision?: number;
  readonly updatedAt?: string;
  /** Execution metrics when the run finished (from the jobs-dir join). */
  readonly done?: number;
  readonly total?: number;
  /** Completion wall-clock stamp from the jobs-dir join (F-3b). */
  readonly completedAt?: string;
  /** The job's own human outcome summary from the jobs-dir join (F-3b). */
  readonly summary?: string;
  /** Read-only liveness verdict for a live-claiming row with no terminal
   *  jobs-dir record (F-3): 'dead' = the recorded run pid is gone (state is
   *  remapped to FAILED); 'unknown' = the run handle predates pid tracking, so
   *  the "running" claim is unverifiable. Absent = verified alive, terminal,
   *  or no start recorded. */
  readonly liveness?: 'dead' | 'unknown';
  /** The recorded run pid, when the handle carries one (detail-view datum). */
  readonly pid?: number;
}

/** Flow states that claim a live external process (mirror of the death-sweep's
 *  LIVE_RUN_STATES — the set a liveness probe is meaningful for). */
const LIVE_CLAIM_STATES: ReadonlySet<RunFlowState> = new Set(['STARTING', 'DETACHED_RUNNING']);

/** Read-only pid probe for one live-claiming flow (F-3) — never writes any
 *  store. No handle record → no start was recorded, nothing to judge (empty). */
function probeRowLiveness(root: string, flowId: string): { liveness?: 'dead' | 'unknown'; pid?: number } {
  const handleRecord = loadRunHandle(root, flowId);
  if (handleRecord === undefined) return {};
  const pid = handleRecord.pid;
  if (typeof pid !== 'number') return { liveness: 'unknown' };
  return isPidAlive(pid) ? { pid } : { liveness: 'dead', pid };
}

/** Cap on inbox rows — a machine with a long run history must not flood the
 *  transcript; the newest N (by updatedAt) win. Same discipline as the
 *  result-evidence 12-task cap / resume-picker RESUME_RECENT_LIMIT. */
export const MAX_INBOX_ROWS = 10;

/** Map a terminal jobs-dir status onto a RunFlowState (COMPLETE→COMPLETED). */
function jobStatusToState(status: 'COMPLETE' | 'FAILED'): RunFlowState {
  return status === 'COMPLETE' ? 'COMPLETED' : 'FAILED';
}

export interface CollectInboxOptions {
  /** Absolute jobs-dir override (tests). Default `<root>/.deckent/runtime/jobs`. */
  jobsDir?: string;
  /** Row cap (tests). Default MAX_INBOX_ROWS. */
  limit?: number;
}

/**
 * Collect every visible run-flow into a sorted, capped list of inbox rows —
 * cross-process, read-only, fail-soft. Mirrors run-flow-death-sweep's
 * store-scan (listFlows → getFlow per id) but joins the jobs-dir for the real
 * terminal state. A flow whose `getFlow` throws (torn/corrupt trace) is skipped,
 * never fatal. Newest-first by `updatedAt`; capped to `opts.limit`.
 */
export function collectInboxRows(root: string, opts: CollectInboxOptions = {}): InboxRow[] {
  const jobsDir = opts.jobsDir ?? join(root, '.deckent', 'runtime', 'jobs');
  const limit = opts.limit ?? MAX_INBOX_ROWS;

  // jobs-dir terminal states, keyed by flowId (a job without a flowId can't be
  // correlated to a store flow, so it's ignored here).
  const terminalByFlow = new Map<string, {
    status: 'COMPLETE' | 'FAILED'; done?: number; total?: number; completedAt?: string; summary?: string;
  }>();
  for (const job of scanJobRecords(jobsDir)) {
    if (job.flowId) {
      terminalByFlow.set(job.flowId, {
        status: job.status, done: job.done, total: job.totalTasks,
        completedAt: job.completedAt, summary: job.summary,
      });
    }
  }

  const coordinator = getRunFlowCoordinator(root);
  const rows: InboxRow[] = [];
  for (const flowId of coordinator.listFlows()) {
    let context;
    try {
      context = coordinator.getFlow(flowId);
    } catch {
      continue; // torn/corrupt trace — skip this flow, never crash the list
    }
    const terminal = terminalByFlow.get(flowId);
    // F-3: probe liveness only when the flow still CLAIMS a live process and
    // the jobs-dir join has no terminal truth to override it with.
    const live = terminal === undefined && LIVE_CLAIM_STATES.has(context.state)
      ? probeRowLiveness(root, flowId)
      : {};
    const row: InboxRow = {
      flowId,
      state: terminal
        ? jobStatusToState(terminal.status)
        : live.liveness === 'dead' ? 'FAILED' : context.state,
      ...(live.liveness !== undefined ? { liveness: live.liveness } : {}),
      ...(live.pid !== undefined ? { pid: live.pid } : {}),
      ...(context.proposal?.intentSummary ? { intentSummary: context.proposal.intentSummary } : {}),
      ...(context.proposal?.revision !== undefined ? { revision: context.proposal.revision } : {}),
      ...(context.updatedAt ? { updatedAt: context.updatedAt } : {}),
      ...(terminal?.done !== undefined ? { done: terminal.done } : {}),
      ...(terminal?.total !== undefined ? { total: terminal.total } : {}),
      ...(terminal?.completedAt !== undefined ? { completedAt: terminal.completedAt } : {}),
      ...(terminal?.summary !== undefined ? { summary: terminal.summary } : {}),
    };
    rows.push(row);
  }

  // Newest-first; rows without updatedAt sort last (stable among themselves).
  rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  return rows.slice(0, limit);
}

/** Localized labels — injected by the caller (i18n-first; this module is string-free). */
export interface InboxLabels {
  /** Header line, e.g. "Active runs". */
  header: string;
  /** Hint line, e.g. "Tip: run `deckent status` to follow one". */
  hint: string;
  /** Shown when no run-flows exist at all. */
  empty: string;
  /** Per-state short badge (RunFlowState → label). */
  stateLabels: Readonly<Record<RunFlowState, string>>;
  // ── D2 (selection / detail) ──
  /** Detail header, e.g. "Run {id} · {state}" ({id} = short id). */
  detailHeader: string;
  /** Full-id line, e.g. "  id: {id}". */
  detailFullId: string;
  /** Intent line (omitted when the flow carries none), e.g. "  intent: {intent}". */
  detailIntent: string;
  /** Progress line (omitted until finished), e.g. "  progress: {done}/{total}". */
  detailProgress: string;
  /** Started-at line (omitted when unknown), e.g. "  started: {started}". */
  detailStarted: string;
  /** Shown for `/runs <n>` when n is out of range, e.g. "No run #{arg} — `/runs` lists them". */
  notFound: string;
  // ── D3b (in-card focus-nav) — the live card's interactive footer hints ──
  /** LIST-mode footer, e.g. "↑↓ select · ↵ open · Esc close · ⟳ live". */
  followNavHint: string;
  /** DETAIL-mode footer, e.g. "↑↓ browse · Esc back · ⟳ live". */
  followDetailHint: string;
  // ── F-3 (read-only liveness) — row marks + detail lines ──
  /** Row mark when the recorded run process is gone, e.g. "process died". */
  livenessDead: string;
  /** Row mark when liveness is unverifiable (pre-pid record), e.g. "unverified". */
  livenessUnknown: string;
  /** Detail line for a dead run, e.g. "  liveness: process died (pid {pid})". */
  detailLivenessDead: string;
  /** Detail line for an unverifiable run, e.g. "  liveness: unverified — the run predates pid tracking". */
  detailLivenessUnknown: string;
  // ── F-3b (human-readable detail) — rich fields + relative time ──
  /** Origin line, e.g. "  origin: {origin}" (do / api). */
  detailOrigin: string;
  /** Planned-task-count line (shown when no progress yet), e.g. "  tasks: {count}". */
  detailTasks: string;
  /** Last-update line for a NON-terminal flow, e.g. "  updated: {time}". */
  detailUpdated: string;
  /** Closure-time line for a terminal flow, e.g. "  closed: {time}". */
  detailClosed: string;
  /** Runtime line (COMPLETED only — honest runtime), e.g. "  duration: {duration}". */
  detailDuration: string;
  /** The job's own human outcome summary, e.g. "  summary: {summary}". */
  detailSummary: string;
  /** Closure-narrative line, e.g. "  reason: {reason}". */
  detailReason: string;
  /** Relative-age fragments for formatInboxTimestamp. */
  timeJustNow: string;
  timeMinutesAgo: string;
  timeHoursAgo: string;
  timeDaysAgo: string;
}

/** English-default inbox labels (string-free component; the caller injects a
 *  localized set via run.tsx). Same fallback-until-i18n-wired precedent as
 *  DEFAULT_APPROVAL_CARD_LABELS. */
export const DEFAULT_INBOX_LABELS: InboxLabels = {
  header: 'Active runs',
  hint: 'Tip: `deckent status <id>` follows one',
  empty: 'No runs yet — start one with `deckent do "<goal>"`',
  stateLabels: {
    COLLECTING: 'collecting',
    PROPOSAL_READY: 'proposed',
    PREVIEWING: 'previewing',
    AWAITING_APPROVAL: 'awaiting approval',
    APPROVED: 'approved',
    STARTING: 'starting',
    DETACHED_RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
    BLOCKED: 'blocked',
  },
  detailHeader: 'Run {id} · {state}',
  detailFullId: '  id: {id}',
  detailIntent: '  intent: {intent}',
  detailProgress: '  progress: {done}/{total}',
  detailStarted: '  started: {started}',
  notFound: 'No run #{arg} — `/runs` lists them',
  followNavHint: '↑↓ select · ↵ open · Esc close · ⟳ live',
  followDetailHint: '↑↓ browse · Esc back · ⟳ live',
  livenessDead: 'process died',
  livenessUnknown: 'unverified',
  detailLivenessDead: '  liveness: process died (pid {pid})',
  detailLivenessUnknown: '  liveness: unverified — the run predates pid tracking',
  detailOrigin: '  origin: {origin}',
  detailTasks: '  tasks: {count}',
  detailUpdated: '  updated: {time}',
  detailClosed: '  closed: {time}',
  detailDuration: '  duration: {duration}',
  detailSummary: '  summary: {summary}',
  detailReason: '  reason: {reason}',
  timeJustNow: 'just now',
  timeMinutesAgo: '{n} min ago',
  timeHoursAgo: '{n} h ago',
  timeDaysAgo: '{n} d ago',
};

const SHORT_ID_LEN = 8;

/** Render one row's BODY (no leading indent): "{n}. {shortId} · {state}{metrics}{intent}".
 *  Exported so the InboxCard (D3b) prepends its OWN focus gutter (❯ / spaces)
 *  around the identical body the transcript path renders — one source of truth. */
/** The row/header state text: state label + the F-3 liveness mark when present,
 *  e.g. "running (unverified)" — ONE source for the list row and both detail
 *  headers, so no surface ever shows a bare unqualified claim. */
function formatStateWithLiveness(row: InboxRow, labels: InboxLabels): string {
  const state = labels.stateLabels[row.state] ?? row.state;
  const mark =
    row.liveness === 'dead' ? ` (${labels.livenessDead})`
    : row.liveness === 'unknown' ? ` (${labels.livenessUnknown})`
    : '';
  return `${state}${mark}`;
}

export function formatInboxRowBody(row: InboxRow, index: number, labels: InboxLabels): string {
  const shortId = row.flowId.slice(0, SHORT_ID_LEN);
  const intent = row.intentSummary ? ` ${row.intentSummary}` : '';
  const metrics = row.done !== undefined && row.total !== undefined ? ` (${row.done}/${row.total})` : '';
  return `${index + 1}. ${shortId} · ${formatStateWithLiveness(row, labels)}${metrics}${intent}`;
}

/** Render one transcript row: two-space indent + the shared body. */
function formatRow(row: InboxRow, index: number, labels: InboxLabels): string {
  return `  ${formatInboxRowBody(row, index, labels)}`;
}

/**
 * Render the inbox as transcript lines (SURF-3 `/runs`). Pure + string-free:
 * header + one numbered line per row (or the empty notice). Mirrors
 * `buildResumePickerLines`'s numbered-picker shape so `/runs <n>` (D2) can reuse
 * the same numbering later.
 */
export function buildInboxLines(rows: readonly InboxRow[], labels: InboxLabels): string[] {
  if (rows.length === 0) return [labels.empty];
  const lines = [labels.header];
  rows.forEach((row, i) => lines.push(formatRow(row, i, labels)));
  lines.push(labels.hint);
  return lines;
}

// ─── D2 — selection / detail ─────────────────────────────────────────────────

/** What `/runs [arg]` resolves to against the current row list. Pure — mirrors
 *  session-resume's `resolveResumeInput` numbered-pick shape. */
export type InboxSelection =
  | { readonly kind: 'list' }
  | { readonly kind: 'detail'; readonly row: InboxRow }
  | { readonly kind: 'not-found'; readonly arg: string };

/**
 * Resolve a `/runs` argument against `rows` (the SAME list `/runs` just showed —
 * collectInboxRows is deterministic, so the numbering stays aligned):
 *  - empty / whitespace → the list;
 *  - a valid 1-based index → that row's detail;
 *  - a numeric-but-out-of-range index → not-found (honest, never a silent list);
 *  - anything non-numeric → the list (a stray arg shows the list, not an error).
 */
export function resolveInboxSelection(arg: string, rows: readonly InboxRow[]): InboxSelection {
  const trimmed = arg.trim();
  if (trimmed.length === 0) return { kind: 'list' };
  if (!/^\d+$/.test(trimmed)) return { kind: 'list' };
  const n = Number.parseInt(trimmed, 10);
  const row = rows[n - 1];
  if (n < 1 || row === undefined) return { kind: 'not-found', arg: trimmed };
  return { kind: 'detail', row };
}

// ─── F-3b — human-readable timestamps + duration (pure, injectable now) ─────

const pad2 = (n: number): string => String(n).padStart(2, '0');

const MINUTE_MS = 60_000;

/**
 * Format an ISO timestamp as LOCAL "YYYY-MM-DD HH:mm" plus a localized
 * relative-age suffix, e.g. "2026-07-14 11:23 (2 d ago)". Pure given `now`;
 * an unparsable stamp is returned verbatim (honest, never throws), and a
 * future stamp gets no relative claim.
 */
export function formatInboxTimestamp(iso: string, labels: InboxLabels, now: number = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const abs = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const diffMin = Math.floor((now - d.getTime()) / MINUTE_MS);
  if (diffMin < 0) return abs;
  const rel =
    diffMin < 1 ? labels.timeJustNow
    : diffMin < 60 ? labels.timeMinutesAgo.replace('{n}', String(diffMin))
    : diffMin < 24 * 60 ? labels.timeHoursAgo.replace('{n}', String(Math.floor(diffMin / 60)))
    : labels.timeDaysAgo.replace('{n}', String(Math.floor(diffMin / (24 * 60))));
  return `${abs} (${rel})`;
}

/** Language-free elapsed time between two ISO stamps: "m:ss" or "h:mm:ss".
 *  Undefined when either stamp is unparsable or the interval is negative. */
export function formatInboxDuration(fromIso: string, toIso: string): string | undefined {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return undefined;
  const totalSec = Math.floor((to - from) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** Render one flow's COMPACT detail block (the live `/runs --follow` card —
 *  space-constrained). Pure + string-free. Field lines are omitted when their
 *  datum is absent. `row.updatedAt` is honestly labeled "updated" (it is the
 *  LAST transition, not the start — the F-3b mislabel fix); the transcript's
 *  rich view (`buildRunDetailLines`) carries the real start/close split. */
export function buildInboxDetailLines(row: InboxRow, labels: InboxLabels, now: number = Date.now()): string[] {
  const shortId = row.flowId.slice(0, SHORT_ID_LEN);
  const lines = [labels.detailHeader.replace('{id}', shortId).replace('{state}', formatStateWithLiveness(row, labels))];
  lines.push(labels.detailFullId.replace('{id}', row.flowId));
  if (row.intentSummary) lines.push(labels.detailIntent.replace('{intent}', row.intentSummary));
  if (row.done !== undefined && row.total !== undefined) {
    lines.push(labels.detailProgress.replace('{done}', String(row.done)).replace('{total}', String(row.total)));
  }
  if (row.liveness === 'dead') lines.push(labels.detailLivenessDead.replace('{pid}', String(row.pid ?? '?')));
  if (row.liveness === 'unknown') lines.push(labels.detailLivenessUnknown);
  if (row.updatedAt) lines.push(labels.detailUpdated.replace('{time}', formatInboxTimestamp(row.updatedAt, labels, now)));
  return lines;
}

// ─── F-3b — rich run detail (`/runs <n>` + `deckent runs <n>`) ───────────────

/** Everything the rich detail view knows about one run — gathered read-only
 *  from the same cross-process stores the inbox already scans. */
export interface InboxRunDetail {
  readonly row: InboxRow;
  /** proposal.origin when the flow carries one (context first, snapshot fallback). */
  readonly origin?: string;
  /** Planned task count from the approved snapshot's captured Sprint. */
  readonly tasksTotal?: number;
  /** REAL start (the run handle's startedAt) — NOT the row's updatedAt. */
  readonly startedAt?: string;
  /** Closure narrative: the last durable RUN_FAILED.error / FLOW_ABORTED.reason /
   *  APPROVAL_REJECTED.reason, else the folded context's failureReason. */
  readonly reason?: string;
}

/** Gather the rich detail for one row — read-only, fail-soft (a torn store
 *  never breaks the view; whatever was readable is shown). */
export function collectRunDetail(root: string, row: InboxRow): InboxRunDetail {
  let origin: string | undefined;
  let tasksTotal: number | undefined;
  let startedAt: string | undefined;
  let reason: string | undefined;
  try {
    const snapshot = loadApprovedSnapshot(root, row.flowId);
    if (snapshot !== undefined) {
      const tasks = (snapshot.sprint as { tasks?: unknown } | undefined)?.tasks;
      if (Array.isArray(tasks)) tasksTotal = tasks.length;
      origin = snapshot.proposal?.origin;
    }

    startedAt = loadRunHandle(root, row.flowId)?.startedAt;

    // Closure narrative — the durable event log carries the rich text (the
    // folded context flattens FLOW_ABORTED's reason to a bare 'aborted').
    for (const event of [...readFlowEvents(root, row.flowId)].reverse()) {
      if (event.type === 'RUN_FAILED') { reason = event.error; break; }
      if (event.type === 'FLOW_ABORTED' && event.reason !== undefined) { reason = event.reason; break; }
      if (event.type === 'APPROVAL_REJECTED' && event.reason !== undefined) { reason = event.reason; break; }
    }

    const context = getRunFlowCoordinator(root).getFlow(row.flowId);
    origin = context.proposal?.origin ?? origin;
    reason = reason ?? context.failureReason;
  } catch {
    // fail-soft: render whatever was gathered before the bad read
  }
  return {
    row,
    ...(origin !== undefined ? { origin } : {}),
    ...(tasksTotal !== undefined ? { tasksTotal } : {}),
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * Render the RICH detail block (F-3b — the transcript `/runs <n>` and the CLI
 * `deckent runs <n>`). Pure + string-free; every line is omitted when its
 * datum is absent. Honesty rules: `started` is the run handle's real start
 * (never updatedAt); a terminal flow's updatedAt renders as `closed`, a live
 * one as `updated`; `duration` only for COMPLETED (a sweep-closure time span
 * is not a runtime).
 */
export function buildRunDetailLines(detail: InboxRunDetail, labels: InboxLabels, now: number = Date.now()): string[] {
  const { row } = detail;
  const shortId = row.flowId.slice(0, SHORT_ID_LEN);
  const terminal = isTerminalRunFlowState(row.state);

  const lines = [labels.detailHeader.replace('{id}', shortId).replace('{state}', formatStateWithLiveness(row, labels))];
  lines.push(labels.detailFullId.replace('{id}', row.flowId));
  if (row.intentSummary) lines.push(labels.detailIntent.replace('{intent}', row.intentSummary));
  if (detail.origin) lines.push(labels.detailOrigin.replace('{origin}', detail.origin));
  if (row.done !== undefined && row.total !== undefined) {
    lines.push(labels.detailProgress.replace('{done}', String(row.done)).replace('{total}', String(row.total)));
  } else if (detail.tasksTotal !== undefined) {
    lines.push(labels.detailTasks.replace('{count}', String(detail.tasksTotal)));
  }
  if (row.liveness === 'dead') lines.push(labels.detailLivenessDead.replace('{pid}', String(row.pid ?? '?')));
  if (row.liveness === 'unknown') lines.push(labels.detailLivenessUnknown);
  if (detail.startedAt) {
    lines.push(labels.detailStarted.replace('{started}', formatInboxTimestamp(detail.startedAt, labels, now)));
  }
  // Closure stamp: the jobs record's completedAt is the execution truth; a
  // store-side updatedAt is only shown when it says something the start line
  // does not (a legacy DETACHED_RUNNING context recycles startedAt here).
  const closedAt = row.completedAt ?? (row.updatedAt !== detail.startedAt ? row.updatedAt : undefined);
  if (closedAt) {
    const template = terminal ? labels.detailClosed : labels.detailUpdated;
    lines.push(template.replace('{time}', formatInboxTimestamp(closedAt, labels, now)));
  }
  if (row.state === 'COMPLETED' && detail.startedAt && closedAt) {
    const duration = formatInboxDuration(detail.startedAt, closedAt);
    if (duration !== undefined) lines.push(labels.detailDuration.replace('{duration}', duration));
  }
  if (row.summary) lines.push(labels.detailSummary.replace('{summary}', row.summary));
  if (detail.reason) lines.push(labels.detailReason.replace('{reason}', detail.reason));
  return lines;
}

/**
 * The `/runs [arg]` command entry point (D1 list + D2 detail): collect the rows
 * once, then render the list, one flow's detail, or an honest not-found — all
 * from the same deterministic snapshot so `/runs <n>` selects exactly the row
 * `/runs` numbered. `input` is the raw slash line (`/runs` or `/runs 2`).
 */
export function renderRunsCommand(root: string, input: string, labels: InboxLabels, opts: CollectInboxOptions = {}): string {
  const rows = collectInboxRows(root, opts);
  const arg = input.replace(/^\s*\/runs\b/i, '');
  const selection = resolveInboxSelection(arg, rows);
  if (selection.kind === 'detail') {
    return buildRunDetailLines(collectRunDetail(root, selection.row), labels).join('\n');
  }
  if (selection.kind === 'not-found') return labels.notFound.replace('{arg}', selection.arg);
  return buildInboxLines(rows, labels).join('\n');
}

/**
 * Build a localized `InboxLabels` from an injected `t` (getMessage-backed) — the
 * i18n adapter, kept in this React-free module so BOTH the Ink path (run.tsx)
 * and the legacy loop (chat-native.ts) import it without a run.tsx↔chat-native
 * cycle. Same "pull labels out of the render call" precedent as buildReplLabels.
 */
export function buildInboxLabels(t: (key: string) => string): InboxLabels {
  return {
    header: t('tui.inbox_header'),
    hint: t('tui.inbox_hint'),
    empty: t('tui.inbox_empty'),
    stateLabels: {
      COLLECTING: t('tui.inbox_state_collecting'),
      PROPOSAL_READY: t('tui.inbox_state_proposed'),
      PREVIEWING: t('tui.inbox_state_previewing'),
      AWAITING_APPROVAL: t('tui.inbox_state_awaiting_approval'),
      APPROVED: t('tui.inbox_state_approved'),
      STARTING: t('tui.inbox_state_starting'),
      DETACHED_RUNNING: t('tui.inbox_state_running'),
      COMPLETED: t('tui.inbox_state_completed'),
      FAILED: t('tui.inbox_state_failed'),
      CANCELLED: t('tui.inbox_state_cancelled'),
      BLOCKED: t('tui.inbox_state_blocked'),
    },
    detailHeader: t('tui.inbox_detail_header'),
    detailFullId: t('tui.inbox_detail_id'),
    detailIntent: t('tui.inbox_detail_intent'),
    detailProgress: t('tui.inbox_detail_progress'),
    detailStarted: t('tui.inbox_detail_started'),
    notFound: t('tui.inbox_not_found'),
    followNavHint: t('tui.inbox_follow_nav_hint'),
    followDetailHint: t('tui.inbox_follow_detail_hint'),
    livenessDead: t('tui.inbox_liveness_dead'),
    livenessUnknown: t('tui.inbox_liveness_unknown'),
    detailLivenessDead: t('tui.inbox_detail_liveness_dead'),
    detailLivenessUnknown: t('tui.inbox_detail_liveness_unknown'),
    detailOrigin: t('tui.inbox_detail_origin'),
    detailTasks: t('tui.inbox_detail_tasks'),
    detailUpdated: t('tui.inbox_detail_updated'),
    detailClosed: t('tui.inbox_detail_closed'),
    detailDuration: t('tui.inbox_detail_duration'),
    detailSummary: t('tui.inbox_detail_summary'),
    detailReason: t('tui.inbox_detail_reason'),
    timeJustNow: t('tui.inbox_time_just_now'),
    timeMinutesAgo: t('tui.inbox_time_minutes_ago'),
    timeHoursAgo: t('tui.inbox_time_hours_ago'),
    timeDaysAgo: t('tui.inbox_time_days_ago'),
  };
}

// ─── D3b — in-card focus navigation (pure, Ink-free — unit-testable) ─────────
//
// The live `/runs --follow` card (inbox-card.tsx) gains ↑↓ selection + ↵ detail.
// All the navigation LOGIC lives here (framework-free) so it's unit-testable
// without ink-testing-library, mirroring onboarding-ui's mapOnboardingKey and
// app.tsx's createConfirmQueue split. The card is the thin render + stdin shell.

/** Structural subset of Ink's `Key` — only the flags the inbox nav consumes
 *  (mirrors OnboardingKeyFlags in onboarding-ui.ts). */
export interface InboxKeyFlags {
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
  escape?: boolean;
}

/** A focus-nav action, or null for an unmapped key (never an implicit move). */
export type InboxNavAction = 'up' | 'down' | 'open' | 'close';

/** Map a keypress to a nav action. ↑/↓ move the cursor, Enter opens the focused
 *  row's detail, Esc closes (detail first, then the card — the card resolves the
 *  card-close). Any other key is a no-op. Mirrors mapOnboardingKey's shape. */
export function mapInboxKey(_input: string, key: InboxKeyFlags): InboxNavAction | null {
  if (key.escape === true) return 'close';
  if (key.upArrow === true) return 'up';
  if (key.downArrow === true) return 'down';
  if (key.return === true) return 'open';
  return null;
}

/** In-card selection state: which flow is focused (by STABLE id, not index — the
 *  list re-sorts newest-first every poll, so an index would drift under the
 *  cursor) and whether its detail block is expanded. */
export interface InboxNavState {
  readonly selectedFlowId: string | null;
  readonly detailOpen: boolean;
}

export const EMPTY_INBOX_NAV: InboxNavState = { selectedFlowId: null, detailOpen: false };

/** Re-derive the focused flow after a poll: keep the current selection if it's
 *  still present, else fall back to the first row (or null when empty). Keeps the
 *  highlight glued to a run across live-refresh reorders. */
export function realignInboxSelection(selectedFlowId: string | null, rows: readonly InboxRow[]): string | null {
  if (selectedFlowId !== null && rows.some((r) => r.flowId === selectedFlowId)) return selectedFlowId;
  return rows[0]?.flowId ?? null;
}

/** Advance the nav state for one action against the CURRENT rows. Pure — the
 *  caller (InboxCard) owns React state + the onClose side effect: a `close` while
 *  the LIST is showing is a no-op here (the caller reads that as "close card").
 *  up/down wrap (like the slash-menu) and work in detail view too (browse
 *  detail-by-detail). */
export function reduceInboxNav(state: InboxNavState, action: InboxNavAction, rows: readonly InboxRow[]): InboxNavState {
  if (action === 'open') {
    // Realign first so opening always targets a live row (rows[0] when nothing
    // was focused yet); an empty list has nothing to open.
    const current = realignInboxSelection(state.selectedFlowId, rows);
    return current !== null ? { selectedFlowId: current, detailOpen: true } : state;
  }
  if (action === 'close') {
    return state.detailOpen ? { ...state, detailOpen: false } : state;
  }
  const n = rows.length;
  if (n === 0) return { ...state, selectedFlowId: null };
  const current = realignInboxSelection(state.selectedFlowId, rows);
  const idx = Math.max(0, rows.findIndex((r) => r.flowId === current));
  const nextIdx = action === 'up' ? (idx - 1 + n) % n : (idx + 1) % n;
  return { ...state, selectedFlowId: rows[nextIdx]!.flowId };
}
