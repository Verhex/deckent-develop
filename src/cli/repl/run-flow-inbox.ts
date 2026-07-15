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

import { join } from 'node:path';
import { getRunFlowCoordinator } from '../../orchestra/run-flow-coordinator-registry.js';
import { scanJobRecords } from './run-completion-watch.js';
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
  const terminalByFlow = new Map<string, { status: 'COMPLETE' | 'FAILED'; done?: number; total?: number }>();
  for (const job of scanJobRecords(jobsDir)) {
    if (job.flowId) {
      terminalByFlow.set(job.flowId, { status: job.status, done: job.done, total: job.totalTasks });
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
    const row: InboxRow = {
      flowId,
      state: terminal ? jobStatusToState(terminal.status) : context.state,
      ...(context.proposal?.intentSummary ? { intentSummary: context.proposal.intentSummary } : {}),
      ...(context.proposal?.revision !== undefined ? { revision: context.proposal.revision } : {}),
      ...(context.updatedAt ? { updatedAt: context.updatedAt } : {}),
      ...(terminal?.done !== undefined ? { done: terminal.done } : {}),
      ...(terminal?.total !== undefined ? { total: terminal.total } : {}),
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
};

const SHORT_ID_LEN = 8;

/** Render one row: "  {n}. {icon-less} {shortId} {state} — {intent}{metrics}". */
function formatRow(row: InboxRow, index: number, labels: InboxLabels): string {
  const shortId = row.flowId.slice(0, SHORT_ID_LEN);
  const state = labels.stateLabels[row.state] ?? row.state;
  const intent = row.intentSummary ? ` ${row.intentSummary}` : '';
  const metrics = row.done !== undefined && row.total !== undefined ? ` (${row.done}/${row.total})` : '';
  return `  ${index + 1}. ${shortId} · ${state}${metrics}${intent}`;
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

/** Render one flow's detail block (D2). Pure + string-free. Field lines are
 *  omitted when their datum is absent (a bare do-flow shows id + state only). */
export function buildInboxDetailLines(row: InboxRow, labels: InboxLabels): string[] {
  const shortId = row.flowId.slice(0, SHORT_ID_LEN);
  const state = labels.stateLabels[row.state] ?? row.state;
  const lines = [labels.detailHeader.replace('{id}', shortId).replace('{state}', state)];
  lines.push(labels.detailFullId.replace('{id}', row.flowId));
  if (row.intentSummary) lines.push(labels.detailIntent.replace('{intent}', row.intentSummary));
  if (row.done !== undefined && row.total !== undefined) {
    lines.push(labels.detailProgress.replace('{done}', String(row.done)).replace('{total}', String(row.total)));
  }
  if (row.updatedAt) lines.push(labels.detailStarted.replace('{started}', row.updatedAt));
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
  if (selection.kind === 'detail') return buildInboxDetailLines(selection.row, labels).join('\n');
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
  };
}
