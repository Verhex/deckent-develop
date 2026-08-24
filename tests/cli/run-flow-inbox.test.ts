// SURF-3 multi-flow-inbox (D1) — read-only cross-process run-flow list.
//
// Hermetic: a tmpdir root with real run-flow-store + jobs-dir fixtures drives
// collectInboxRows through the REAL coordinator store-scan + jobs-dir join;
// buildInboxLines is pure. `_resetRunFlowCoordinatorsForTests` clears the
// per-process coordinator cache between cases.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  collectInboxRows,
  buildInboxLines,
  buildInboxLabels,
  resolveInboxSelection,
  buildInboxDetailLines,
  renderRunsCommand,
  DEFAULT_INBOX_LABELS,
  MAX_INBOX_ROWS,
  // D3b — in-card focus-nav pure logic
  mapInboxKey,
  realignInboxSelection,
  reduceInboxNav,
  formatInboxRowBody,
  EMPTY_INBOX_NAV,
  // F-3b — rich human-readable detail
  formatInboxTimestamp,
  formatInboxDuration,
  collectRunDetail,
  buildRunDetailLines,
  // SURF-6 — in-card decision gating
  decidableInboxVerbs,
  mapInboxDecisionKey,
  type InboxRow,
  type InboxNavState,
} from '../../src/cli/repl/run-flow-inbox.js';
import { sweepStaleRuns } from '../../src/orchestra/run-flow-death-sweep.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { collectAddressableInboxRows, resolveDecideTarget, runDecide } from '../../src/cli/commands/runs.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
import { saveApprovedSnapshot, saveRunHandle } from '../../src/core/run-flow-store.js';
import { openTaskSettlementProjection } from '../../src/core/task-settlement-authority.js';
import type { RunProposal, PlanPreview } from '../../src/core/run-flow-contract.js';

function proposal(flowId: string, intent: string, revision = 1): RunProposal {
  return { flowId, tenant: 'local', project: 'p', actor: { id: 'u' }, origin: 'api', revision, intentSummary: intent };
}
function preview(flowId: string): PlanPreview {
  return { flowId, revision: 1, planDigest: 'd-1', taskSummaries: [], policyDecision: { decision: 'allow' } as never, gateResult: 'pass' as never };
}

/** Drive a flow through the coordinator to AWAITING_APPROVAL (carries proposal → intentSummary). */
function proposedFlow(root: string, flowId: string, intent: string): void {
  const c = getRunFlowCoordinator(root);
  c.proposeFlow({ proposal: proposal(flowId, intent) });
  c.recordPreview({ preview: preview(flowId) });
}

/**
 * Simulate a REAL concurrent `deckent do` flow: another process wrote the
 * snapshot + handle stores directly (NO events.jsonl, NO proposeFlow), so a
 * fresh coordinator resolves it via deriveLegacyContext — snapshot+handle →
 * DETACHED_RUNNING, NO proposal → NO intentSummary → bare short-id. This is the
 * headline case the proposeFlow-based fixtures never exercise.
 */
function doFlowOnDisk(root: string, flowId: string, startedAt: string, intent?: string, pid?: number): void {
  const sprint = { id: flowId, tasks: [], directives: '', createdAt: startedAt } as never;
  saveApprovedSnapshot(root, {
    flowId, revision: 1, planDigest: 'd-1',
    approvedBy: { id: 'u' }, approvedAt: startedAt, sprint,
    // G1 durable-fix: a do-flow that persisted its proposal carries intentSummary.
    ...(intent !== undefined ? { proposal: proposal(flowId, intent) } : {}),
  });
  saveRunHandle(root, {
    flowId, revision: 1, planDigest: 'd-1',
    handle: { flowId, jobId: `j-${flowId}`, logRef: 'log' },
    startedAt,
    // F-3: a post-698 handle records the run process's own pid.
    ...(pid !== undefined ? { pid } : {}),
  });
}

/** A pid that provably no longer exists (mirror of the death-sweep test's
 *  fixture): probe high pids for one where kill(pid, 0) throws ESRCH. */
function deadPid(): number {
  for (let pid = 999_999; pid > 990_000; pid--) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') return pid;
    }
  }
  throw new Error('no dead pid found in probe range');
}

/** Write a jobs-dir terminal record correlated to a flowId. */
function writeJob(
  root: string, flowId: string, status: 'COMPLETE' | 'FAILED', done = 0, total = 0,
  extra: { completedAt?: string; summary?: string } = {},
): void {
  const jobsDir = join(root, '.deckent', 'runtime', 'jobs');
  mkdirSync(jobsDir, { recursive: true });
  writeFileSync(
    join(jobsDir, `${flowId}.json`),
    JSON.stringify({ status, sprintId: flowId, metrics: { totalTasks: total, done, techDebt: 0, noGo: 0 }, completionRecord: { flowId }, ...extra }),
  );
}

describe('collectInboxRows — cross-process store-scan + jobs-dir join (SURF-3)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'inbox-'));
    _resetRunFlowCoordinatorsForTests();
  });
  afterEach(() => {
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('empty project → no rows', () => {
    expect(collectInboxRows(root)).toEqual([]);
  });

  it('lists a proposed flow with its intentSummary + store state', () => {
    proposedFlow(root, 'flow-a', 'add auth');
    const rows = collectInboxRows(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ flowId: 'flow-a', state: 'AWAITING_APPROVAL', intentSummary: 'add auth' });
  });

  it('jobs-dir COMPLETE overrides the store state (a finished do no longer shows as running)', () => {
    proposedFlow(root, 'flow-b', 'refactor');
    writeJob(root, 'flow-b', 'COMPLETE', 3, 4);
    const rows = collectInboxRows(root);
    expect(rows[0]).toMatchObject({ flowId: 'flow-b', state: 'COMPLETED', done: 3, total: 4 });
  });

  it('jobs-dir FAILED overrides to FAILED', () => {
    proposedFlow(root, 'flow-c', 'migrate');
    writeJob(root, 'flow-c', 'FAILED');
    expect(collectInboxRows(root)[0]).toMatchObject({ flowId: 'flow-c', state: 'FAILED' });
  });

  it('sorts newest-first by updatedAt and caps at the limit', () => {
    for (let i = 0; i < MAX_INBOX_ROWS + 3; i++) proposedFlow(root, `flow-${i}`, `intent ${i}`);
    const rows = collectInboxRows(root);
    expect(rows.length).toBe(MAX_INBOX_ROWS);
    // updatedAt descending (later-proposed flows sort first).
    const stamps = rows.map((r) => r.updatedAt ?? '');
    expect([...stamps].sort((a, b) => b.localeCompare(a))).toEqual(stamps);
  });

  it('respects an explicit limit override', () => {
    proposedFlow(root, 'flow-1', 'one');
    proposedFlow(root, 'flow-2', 'two');
    expect(collectInboxRows(root, { limit: 1 })).toHaveLength(1);
  });

  // ── HEADLINE CASE — a real concurrent `deckent do` flow (snapshot-only, no
  //    events.jsonl): a FRESH coordinator must disk-fold it via deriveLegacyContext.
  it('lists a snapshot-only do-flow (cache-miss, disk-fold) as DETACHED_RUNNING with a bare short-id', () => {
    doFlowOnDisk(root, 'do-flow-live-01', '2026-07-15T10:00:00.000Z');
    _resetRunFlowCoordinatorsForTests(); // force getFlow through the disk-fold branch, not the cache
    const rows = collectInboxRows(root);
    expect(rows).toHaveLength(1);
    // deriveLegacyContext: snapshot+handle → DETACHED_RUNNING, NO proposal.
    expect(rows[0]).toMatchObject({ flowId: 'do-flow-live-01', state: 'DETACHED_RUNNING' });
    expect(rows[0]!.intentSummary).toBeUndefined(); // bare short-id, no intent (G1)
  });

  it('a snapshot-only do-flow that finished shows COMPLETED via the jobs-dir override (disk-fold path)', () => {
    doFlowOnDisk(root, 'do-flow-done-02', '2026-07-15T11:00:00.000Z');
    writeJob(root, 'do-flow-done-02', 'COMPLETE', 5, 5);
    _resetRunFlowCoordinatorsForTests();
    const rows = collectInboxRows(root);
    // store says DETACHED_RUNNING (deriveLegacyContext) but the jobs-dir override wins.
    expect(rows[0]).toMatchObject({ flowId: 'do-flow-done-02', state: 'COMPLETED', done: 5, total: 5 });
    expect(rows[0]!.intentSummary).toBeUndefined();
  });

  it('renders a bare do-flow row with no intent (short-id + state only)', () => {
    doFlowOnDisk(root, 'do-flow-render-03', '2026-07-15T12:00:00.000Z');
    _resetRunFlowCoordinatorsForTests();
    const lines = buildInboxLines(collectInboxRows(root), DEFAULT_INBOX_LABELS);
    // short-id + running badge, NO trailing intent text. The pid-less handle
    // earns the honest F-3 unverified mark.
    expect(lines[1]).toBe('  1. do-flow- · running (unverified)');
  });

  // G1 durable-fix — a do-flow that persisted its proposal (snapshot.proposal)
  // reads back with its intentSummary via deriveLegacyContext, so the inbox
  // shows the goal instead of a bare UUID (no events.jsonl, disk-fold path).
  it('a do-flow with a persisted proposal shows its intentSummary (not a bare UUID)', () => {
    doFlowOnDisk(root, 'do-flow-intent-04', '2026-07-15T13:00:00.000Z', 'add rate limiting');
    _resetRunFlowCoordinatorsForTests();
    const rows = collectInboxRows(root);
    expect(rows[0]).toMatchObject({ flowId: 'do-flow-intent-04', state: 'DETACHED_RUNNING', intentSummary: 'add rate limiting' });
    const lines = buildInboxLines(rows, DEFAULT_INBOX_LABELS);
    // (unverified) = F-3 mark: this fixture's handle carries no pid.
    expect(lines[1]).toBe('  1. do-flow- · running (unverified) add rate limiting');
  });
});

// ─── F-3 — read-only liveness derivation (display-honesty, zero writes) ──────

describe('collectInboxRows — read-only liveness derivation (F-3)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'inbox-live-'));
    _resetRunFlowCoordinatorsForTests();
  });
  afterEach(() => {
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('a dead recorded pid shows FAILED + liveness dead — WITHOUT writing any store (pure reader)', () => {
    const pid = deadPid();
    doFlowOnDisk(root, 'flow-dead-pid', '2026-07-16T10:00:00.000Z', undefined, pid);
    _resetRunFlowCoordinatorsForTests();
    const rows = collectInboxRows(root);
    expect(rows[0]).toMatchObject({ flowId: 'flow-dead-pid', state: 'FAILED', liveness: 'dead', pid });
    // PURE READER pin: the durable state is untouched — a fresh coordinator
    // still derives DETACHED_RUNNING (closure is the write paths' job).
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('flow-dead-pid').state).toBe('DETACHED_RUNNING');
  });

  it('an alive recorded pid stays running with NO liveness mark (verified alive)', () => {
    doFlowOnDisk(root, 'flow-alive-pid', '2026-07-16T10:00:00.000Z', undefined, process.pid);
    _resetRunFlowCoordinatorsForTests();
    const rows = collectInboxRows(root);
    expect(rows[0]).toMatchObject({ flowId: 'flow-alive-pid', state: 'DETACHED_RUNNING', pid: process.pid });
    expect(rows[0]!.liveness).toBeUndefined();
  });

  it('a pid-less legacy handle (pre-698) marks liveness unknown, state unchanged', () => {
    doFlowOnDisk(root, 'flow-legacy-01', '2026-07-16T10:00:00.000Z');
    _resetRunFlowCoordinatorsForTests();
    const rows = collectInboxRows(root);
    expect(rows[0]).toMatchObject({ flowId: 'flow-legacy-01', state: 'DETACHED_RUNNING', liveness: 'unknown' });
    expect(rows[0]!.pid).toBeUndefined();
  });

  it('a terminal jobs-dir record is never probed (jobs truth wins, no liveness field)', () => {
    doFlowOnDisk(root, 'flow-done-01', '2026-07-16T10:00:00.000Z', undefined, deadPid());
    writeJob(root, 'flow-done-01', 'COMPLETE', 2, 2);
    _resetRunFlowCoordinatorsForTests();
    const rows = collectInboxRows(root);
    expect(rows[0]).toMatchObject({ flowId: 'flow-done-01', state: 'COMPLETED', done: 2, total: 2 });
    expect(rows[0]!.liveness).toBeUndefined();
  });

  it('renders the liveness marks in the row body and the detail lines', () => {
    const dead: InboxRow = { flowId: 'aaaaaaaa-dead', state: 'FAILED', liveness: 'dead', pid: 4242 };
    const unknown: InboxRow = { flowId: 'bbbbbbbb-unkn', state: 'DETACHED_RUNNING', liveness: 'unknown' };
    const lines = buildInboxLines([dead, unknown], DEFAULT_INBOX_LABELS);
    expect(lines[1]).toBe('  1. aaaaaaaa · failed (process died)');
    expect(lines[2]).toBe('  2. bbbbbbbb · running (unverified)');

    expect(buildInboxDetailLines(dead, DEFAULT_INBOX_LABELS)).toContain('  liveness: process died (pid 4242)');
    expect(buildInboxDetailLines(unknown, DEFAULT_INBOX_LABELS)).toContain(
      '  liveness: unverified — the run predates pid tracking',
    );
  });
});

describe('buildInboxLines — pure render (string-free, SURF-3)', () => {
  const labels = DEFAULT_INBOX_LABELS;

  it('empty rows → the single empty notice', () => {
    expect(buildInboxLines([], labels)).toEqual([labels.empty]);
  });

  it('renders header + numbered rows + hint, with short-id, state, metrics, intent', () => {
    const rows: InboxRow[] = [
      { flowId: '9c3d577a-5c24-45c6-86e2-abcdef012345', state: 'COMPLETED', intentSummary: 'add auth', done: 3, total: 4, updatedAt: 'z' },
      { flowId: '18fb63df-b390-46e9-9c71-000000000000', state: 'DETACHED_RUNNING', updatedAt: 'a' },
    ];
    const lines = buildInboxLines(rows, labels);
    expect(lines[0]).toBe(labels.header);
    expect(lines[1]).toBe('  1. 9c3d577a · completed (3/4) add auth');
    expect(lines[2]).toBe('  2. 18fb63df · running');
    expect(lines[lines.length - 1]).toBe(labels.hint);
  });

  it('omits the metrics parenthetical when done/total are absent', () => {
    const lines = buildInboxLines([{ flowId: 'abcdef0123', state: 'APPROVED' }], labels);
    expect(lines[1]).toBe('  1. abcdef01 · approved');
  });
});

describe('resolveInboxSelection — /runs <n> numbered pick (D2)', () => {
  const rows: InboxRow[] = [
    { flowId: 'flow-a', state: 'COMPLETED' },
    { flowId: 'flow-b', state: 'DETACHED_RUNNING' },
  ];

  it('bare / whitespace arg → list', () => {
    expect(resolveInboxSelection('', rows)).toEqual({ kind: 'list' });
    expect(resolveInboxSelection('   ', rows)).toEqual({ kind: 'list' });
  });

  it('a valid 1-based index → that row detail', () => {
    expect(resolveInboxSelection('1', rows)).toEqual({ kind: 'detail', row: rows[0] });
    expect(resolveInboxSelection(' 2 ', rows)).toEqual({ kind: 'detail', row: rows[1] });
  });

  it('out-of-range / zero → not-found (honest, never a silent list)', () => {
    expect(resolveInboxSelection('3', rows)).toEqual({ kind: 'not-found', arg: '3' });
    expect(resolveInboxSelection('0', rows)).toEqual({ kind: 'not-found', arg: '0' });
  });

  it('a non-numeric arg → list (a stray arg is not an error)', () => {
    expect(resolveInboxSelection('foo', rows)).toEqual({ kind: 'list' });
  });
});

describe('runs addressing — complete durable inbox reachability (501-001)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'runs-address-'));
    _resetRunFlowCoordinatorsForTests();
  });
  afterEach(() => {
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('finds a unique prefix beyond the default listing window and retains ambiguity refusal', () => {
    for (let i = 0; i < MAX_INBOX_ROWS; i++) proposedFlow(root, `recent-${i}`, `recent ${i}`);
    proposedFlow(root, 'older-unique-flow', 'older');
    proposedFlow(root, 'shared-prefix-a', 'first');
    proposedFlow(root, 'shared-prefix-b', 'second');

    expect(collectInboxRows(root)).toHaveLength(MAX_INBOX_ROWS);
    const allRows = collectAddressableInboxRows(root);
    expect(allRows).toHaveLength(MAX_INBOX_ROWS + 3);
    expect(resolveDecideTarget('older-unique', allRows)).toMatchObject({
      kind: 'row', row: { flowId: 'older-unique-flow' },
    });
    expect(resolveDecideTarget('shared-prefix', allRows)).toEqual({ kind: 'not-found', arg: 'shared-prefix' });
  });
});

describe('runs explicit retirement (505-001)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'runs-retire-'));
    _resetRunFlowCoordinatorsForTests();
  });
  afterEach(() => {
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('retires an approved, unstarted flow through the existing abort command', () => {
    const flowId = 'approved-to-retire';
    const task = {
      id: '626-001', title: 'Retire exact task', description: 'Retire exact task',
      model: 'gpt-5.6-sol', effort: 'normal', priority: 'NORMAL', reason: 'test',
      scope: { directories: [], filesRead: [], filesWrite: [] }, dependencies: [],
      goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
      status: 'PENDING', sprintId: 'sprint-626', provider: 'codex',
      createdAt: '2026-08-24T12:00:00.000Z',
    } as const;
    proposedFlow(root, flowId, 'retire me');
    getRunFlowCoordinator(root).grantApproval({
      flowId, revision: 1, planDigest: 'd-1', approvedBy: { id: 'approver' },
    });
    saveApprovedSnapshot(root, {
      flowId, revision: 1, planDigest: 'd-1',
      approvedBy: { id: 'approver' }, approvedAt: '2026-08-24T12:00:01.000Z',
      proposal: proposal(flowId, 'retire me'),
      sprint: {
        id: 'sprint-626', number: 626, status: 'PLANNING', phase: 'PLAN',
        tasks: [task], workers: [],
      } as never,
    });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', 'task-626-001.json'), JSON.stringify(task, null, 2));

    runDecide(root, flowId, { retire: true }, 'en', DEFAULT_INBOX_LABELS);

    expect(getRunFlowCoordinator(root).getFlow(flowId)).toMatchObject({
      state: 'CANCELLED', cancelReason: 'aborted',
    });
    const projection = openTaskSettlementProjection(root);
    expect(projection.projectTaskExecutionState('626-001', 'PENDING', 'local'))
      .toMatchObject({ effectiveStatus: 'NOT_DISPATCHED', reasonCode: 'projected' });
    projection.close();
  });

  it('keeps rejection for an awaiting-approval flow and refuses a terminal retirement', () => {
    const rejectableId = 'still-rejectable';
    proposedFlow(root, rejectableId, 'reject me');
    runDecide(root, rejectableId, { reject: true }, 'en', DEFAULT_INBOX_LABELS);
    expect(getRunFlowCoordinator(root).getFlow(rejectableId)).toMatchObject({
      state: 'CANCELLED', cancelReason: 'rejected',
    });

    expect(() => runDecide(root, rejectableId, { retire: true }, 'en', DEFAULT_INBOX_LABELS)).toThrow();
    expect(getRunFlowCoordinator(root).getFlow(rejectableId)).toMatchObject({
      state: 'CANCELLED', cancelReason: 'rejected',
    });
  });
});

describe('buildInboxDetailLines — compact single-flow detail (D2 + F-3b relabel)', () => {
  const labels = DEFAULT_INBOX_LABELS;
  const NOW = new Date('2026-07-16T10:00:00.000Z').getTime();

  it('renders header + full id + intent + progress + honestly-labeled updated line', () => {
    const row: InboxRow = {
      flowId: '9c3d577a-5c24-45c6-86e2-abcdef012345', state: 'COMPLETED',
      intentSummary: 'add auth', done: 3, total: 4, updatedAt: '2026-07-15T10:00:00.000Z', revision: 1,
    };
    // F-3b mislabel fix: updatedAt is the LAST transition, so the compact view
    // labels it "updated" (never "started") and humanizes the timestamp.
    expect(buildInboxDetailLines(row, labels, NOW)).toEqual([
      'Run 9c3d577a · completed',
      '  id: 9c3d577a-5c24-45c6-86e2-abcdef012345',
      '  intent: add auth',
      '  progress: 3/4',
      labels.detailUpdated.replace('{time}', formatInboxTimestamp('2026-07-15T10:00:00.000Z', labels, NOW)),
    ]);
  });

  it('omits absent fields — a bare do-flow shows id + state only', () => {
    const row: InboxRow = { flowId: 'do-flow-bare-01', state: 'DETACHED_RUNNING' };
    expect(buildInboxDetailLines(row, labels)).toEqual([
      'Run do-flow- · running',
      '  id: do-flow-bare-01',
    ]);
  });
});

// ─── F-3b — human-readable timestamps, duration, rich detail ─────────────────

describe('formatInboxTimestamp — local absolute + localized relative age (F-3b)', () => {
  const labels = DEFAULT_INBOX_LABELS;

  it('renders "YYYY-MM-DD HH:mm (relative)" for each age tier', () => {
    const base = new Date('2026-07-16T10:00:00.000Z').getTime();
    const at = (msAgo: number) => new Date(base - msAgo).toISOString();
    expect(formatInboxTimestamp(at(10_000), labels, base)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} \(just now\)$/);
    expect(formatInboxTimestamp(at(5 * 60_000), labels, base)).toMatch(/\(5 min ago\)$/);
    expect(formatInboxTimestamp(at(3 * 3_600_000), labels, base)).toMatch(/\(3 h ago\)$/);
    expect(formatInboxTimestamp(at(2 * 86_400_000), labels, base)).toMatch(/\(2 d ago\)$/);
  });

  it('a future stamp gets the absolute part only (no relative claim)', () => {
    const base = new Date('2026-07-16T10:00:00.000Z').getTime();
    expect(formatInboxTimestamp(new Date(base + 60_000).toISOString(), labels, base)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it('an unparsable stamp is returned verbatim (honest, never throws)', () => {
    expect(formatInboxTimestamp('not-a-date', labels, 0)).toBe('not-a-date');
  });
});

describe('formatInboxDuration — language-free elapsed (F-3b)', () => {
  it('renders m:ss under an hour and h:mm:ss above', () => {
    expect(formatInboxDuration('2026-07-16T10:00:00.000Z', '2026-07-16T10:02:13.000Z')).toBe('2:13');
    expect(formatInboxDuration('2026-07-16T10:00:00.000Z', '2026-07-16T11:05:09.000Z')).toBe('1:05:09');
  });

  it('is undefined for unparsable or negative intervals', () => {
    expect(formatInboxDuration('bad', '2026-07-16T10:00:00.000Z')).toBeUndefined();
    expect(formatInboxDuration('2026-07-16T10:00:00.000Z', '2026-07-16T09:00:00.000Z')).toBeUndefined();
  });
});

describe('collectRunDetail + buildRunDetailLines — rich `/runs <n>` view (F-3b)', () => {
  let root: string;
  const NOW = new Date('2026-07-16T12:00:00.000Z').getTime();
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'inbox-detail-'));
    _resetRunFlowCoordinatorsForTests();
  });
  afterEach(() => {
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('a finished do-flow shows origin, REAL start (never updatedAt), closed + duration + progress', () => {
    doFlowOnDisk(root, 'rich-done-01', '2026-07-16T09:00:00.000Z', 'ship the feature');
    writeJob(root, 'rich-done-01', 'COMPLETE', 4, 4);
    _resetRunFlowCoordinatorsForTests();

    const rows = collectInboxRows(root);
    const detail = collectRunDetail(root, rows[0]!);
    expect(detail.startedAt).toBe('2026-07-16T09:00:00.000Z'); // the run handle's start
    expect(detail.origin).toBe('api'); // the test proposal fixture's origin
    expect(detail.tasksTotal).toBe(0); // captured Sprint has no tasks in this fixture

    const lines = buildRunDetailLines(detail, DEFAULT_INBOX_LABELS, NOW);
    expect(lines).toContain('  intent: ship the feature');
    expect(lines).toContain('  origin: api');
    expect(lines).toContain('  progress: 4/4');
    // SURF-6 parity line: the FULL plan digest (the same hash Desktop shows).
    expect(lines).toContain('  digest: d-1');
    expect(lines).toContain(
      DEFAULT_INBOX_LABELS.detailStarted.replace(
        '{started}', formatInboxTimestamp('2026-07-16T09:00:00.000Z', DEFAULT_INBOX_LABELS, NOW)),
    );
  });

  it('a sweep-closed legacy flow shows real start, a "closed" label and the operator narrative — the exact view Alperen flagged', () => {
    doFlowOnDisk(root, 'rich-swept-02', '2026-07-14T08:33:00.000Z');
    _resetRunFlowCoordinatorsForTests();
    sweepStaleRuns(root, { apply: true });
    _resetRunFlowCoordinatorsForTests();

    const rows = collectInboxRows(root);
    expect(rows[0]!.state).toBe('CANCELLED');
    const detail = collectRunDetail(root, rows[0]!);
    const lines = buildRunDetailLines(detail, DEFAULT_INBOX_LABELS, NOW);

    // REAL start (2026-07-14 from the handle) — NOT the abort stamp.
    expect(lines.find((l) => l.startsWith('  started:'))).toContain(
      formatInboxTimestamp('2026-07-14T08:33:00.000Z', DEFAULT_INBOX_LABELS, NOW).slice(0, 16),
    );
    // Terminal flow → its updatedAt renders under "closed", never "started".
    expect(lines.some((l) => l.startsWith('  closed:'))).toBe(true);
    // The durable abort narrative surfaces as the reason line.
    expect(lines.find((l) => l.startsWith('  reason:'))).toContain('closed by operator stale-run sweep');
    // No duration — a sweep-closure span is not a runtime.
    expect(lines.some((l) => l.startsWith('  duration:'))).toBe(false);
  });

  it('duration renders only for COMPLETED (honest runtime)', () => {
    const row: InboxRow = {
      flowId: 'dur-1', state: 'COMPLETED', done: 1, total: 1, updatedAt: '2026-07-16T09:02:13.000Z',
    };
    const lines = buildRunDetailLines(
      { row, startedAt: '2026-07-16T09:00:00.000Z' }, DEFAULT_INBOX_LABELS, NOW,
    );
    expect(lines).toContain('  duration: 2:13');
  });

  it('a jobs record with completedAt + summary drives closed, REAL duration and the summary line', () => {
    doFlowOnDisk(root, 'rich-job-03', '2026-07-16T09:00:00.000Z', 'deploy it');
    writeJob(root, 'rich-job-03', 'COMPLETE', 4, 4, {
      completedAt: '2026-07-16T09:32:02.000Z',
      summary: 'Sprint done (32m 2s) — 4/4 tasks',
    });
    _resetRunFlowCoordinatorsForTests();

    const rows = collectInboxRows(root);
    expect(rows[0]).toMatchObject({ completedAt: '2026-07-16T09:32:02.000Z', summary: 'Sprint done (32m 2s) — 4/4 tasks' });

    const lines = buildRunDetailLines(collectRunDetail(root, rows[0]!), DEFAULT_INBOX_LABELS, NOW);
    expect(lines.find((l) => l.startsWith('  closed:'))).toContain(
      formatInboxTimestamp('2026-07-16T09:32:02.000Z', DEFAULT_INBOX_LABELS, NOW),
    );
    expect(lines).toContain('  duration: 32:02');
    expect(lines).toContain('  summary: Sprint done (32m 2s) — 4/4 tasks');
  });

  it('a legacy jobs record WITHOUT completedAt never shows a bogus 0:00 duration (updatedAt recycles startedAt)', () => {
    doFlowOnDisk(root, 'rich-nodur-04', '2026-07-16T09:00:00.000Z');
    writeJob(root, 'rich-nodur-04', 'COMPLETE', 2, 4);
    _resetRunFlowCoordinatorsForTests();

    const rows = collectInboxRows(root);
    const lines = buildRunDetailLines(collectRunDetail(root, rows[0]!), DEFAULT_INBOX_LABELS, NOW);
    expect(lines.some((l) => l.startsWith('  duration:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('  closed:'))).toBe(false); // completion time genuinely unknown
  });
});

describe('renderRunsCommand — /runs entry point (D1 list + D2 detail)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'runs-cmd-')); _resetRunFlowCoordinatorsForTests(); });
  afterEach(() => { _resetRunFlowCoordinatorsForTests(); rmSync(root, { recursive: true, force: true }); });

  it('bare /runs → the list; /runs <n> → that flow detail; /runs <bad> → not-found', () => {
    proposedFlow(root, 'flow-only', 'the intent');
    const labels = DEFAULT_INBOX_LABELS;

    const list = renderRunsCommand(root, '/runs', labels);
    expect(list).toContain(labels.header);
    expect(list).toContain('the intent');

    const detail = renderRunsCommand(root, '/runs 1', labels);
    expect(detail).toContain('  id: flow-only');
    expect(detail).toContain('  intent: the intent');

    expect(renderRunsCommand(root, '/runs 9', labels)).toBe('No run #9 — `/runs` lists them');
  });

  it('empty project → the empty notice for a bare /runs', () => {
    expect(renderRunsCommand(root, '/runs', DEFAULT_INBOX_LABELS)).toBe(DEFAULT_INBOX_LABELS.empty);
  });
});

describe('buildInboxLabels — i18n (SURF-3)', () => {
  it('resolves every label in en + tr (en !== tr), covering all states', () => {
    const en = buildInboxLabels((k) => getMessage(k, 'en'));
    const tr = buildInboxLabels((k) => getMessage(k, 'tr'));
    for (const key of ['header', 'hint', 'empty', 'detailIntent', 'detailProgress', 'detailStarted', 'notFound', 'followNavHint', 'followDetailHint', 'livenessDead', 'livenessUnknown', 'detailLivenessDead', 'detailLivenessUnknown', 'detailOrigin', 'detailTasks', 'detailUpdated', 'detailClosed', 'detailDuration', 'detailSummary', 'detailReason', 'detailDigest', 'timeJustNow', 'timeMinutesAgo', 'timeHoursAgo', 'timeDaysAgo'] as const) {
      expect(en[key].length).toBeGreaterThan(0);
      expect(tr[key].length).toBeGreaterThan(0);
      expect(en[key]).not.toBe(tr[key]);
    }
    // Every RunFlowState badge resolves in both languages (no {key} fallback leaked).
    for (const state of Object.keys(en.stateLabels) as (keyof typeof en.stateLabels)[]) {
      expect(en.stateLabels[state]).not.toMatch(/^tui\.inbox_state_/);
      expect(tr.stateLabels[state]).not.toMatch(/^tui\.inbox_state_/);
    }
    expect(en.stateLabels.COMPLETED).toBe('completed');
    expect(tr.stateLabels.COMPLETED).toBe('tamamlandı');
  });
});

// ─── D3b — in-card focus navigation (pure logic, Ink-free) ───────────────────

describe('formatInboxRowBody — shared row body (no leading indent)', () => {
  const labels = DEFAULT_INBOX_LABELS;

  it('renders the SAME body buildInboxLines indents by two spaces (one source of truth)', () => {
    const row: InboxRow = { flowId: '9c3d577a-xyz', state: 'COMPLETED', intentSummary: 'add auth', done: 3, total: 4 };
    const body = formatInboxRowBody(row, 0, labels);
    expect(body).toBe('1. 9c3d577a · completed (3/4) add auth');
    // the transcript path is exactly the body plus a two-space gutter
    expect(buildInboxLines([row], labels)[1]).toBe(`  ${body}`);
  });
});

describe('mapInboxKey — pure keypress → nav action (D3b)', () => {
  it('maps ↑↓ / Enter / Esc to their actions', () => {
    expect(mapInboxKey('', { upArrow: true })).toBe('up');
    expect(mapInboxKey('', { downArrow: true })).toBe('down');
    expect(mapInboxKey('', { return: true })).toBe('open');
    expect(mapInboxKey('', { escape: true })).toBe('close');
  });

  it('any unmapped key is a no-op (never an implicit move/decision)', () => {
    expect(mapInboxKey('x', {})).toBeNull();
    expect(mapInboxKey('j', {})).toBeNull();
    expect(mapInboxKey(' ', {})).toBeNull();
  });
});

describe('realignInboxSelection — highlight survives live-refresh reorders (D3b)', () => {
  const rows: InboxRow[] = [
    { flowId: 'flow-a', state: 'COMPLETED' },
    { flowId: 'flow-b', state: 'DETACHED_RUNNING' },
  ];

  it('keeps a still-present selection unchanged (even after a reorder)', () => {
    expect(realignInboxSelection('flow-b', rows)).toBe('flow-b');
    // reordered list: flow-b is still there → selection unchanged, NOT snapped to [0]
    expect(realignInboxSelection('flow-b', [rows[1]!, rows[0]!])).toBe('flow-b');
  });

  it('falls back to the first row when the selection is null or vanished', () => {
    expect(realignInboxSelection(null, rows)).toBe('flow-a');
    expect(realignInboxSelection('flow-gone', rows)).toBe('flow-a');
  });

  it('is null for an empty list', () => {
    expect(realignInboxSelection('anything', [])).toBeNull();
    expect(realignInboxSelection(null, [])).toBeNull();
  });
});

describe('reduceInboxNav — selection + detail reducer (D3b)', () => {
  const rows: InboxRow[] = [
    { flowId: 'a', state: 'COMPLETED' },
    { flowId: 'b', state: 'DETACHED_RUNNING' },
    { flowId: 'c', state: 'APPROVED' },
  ];
  const listAt = (flowId: string | null): InboxNavState => ({ selectedFlowId: flowId, detailOpen: false });

  it('↓ moves to the next row, ↑ to the previous — both wrap', () => {
    expect(reduceInboxNav(listAt('a'), 'down', rows).selectedFlowId).toBe('b');
    expect(reduceInboxNav(listAt('c'), 'down', rows).selectedFlowId).toBe('a'); // wrap
    expect(reduceInboxNav(listAt('a'), 'up', rows).selectedFlowId).toBe('c'); // wrap
  });

  it('↵ opens the focused row detail (realigning a null selection to the first row)', () => {
    expect(reduceInboxNav(listAt('b'), 'open', rows)).toEqual({ selectedFlowId: 'b', detailOpen: true });
    expect(reduceInboxNav(EMPTY_INBOX_NAV, 'open', rows)).toEqual({ selectedFlowId: 'a', detailOpen: true });
  });

  it('Esc collapses an open detail; from the list it is a no-op (caller closes the card)', () => {
    expect(reduceInboxNav({ selectedFlowId: 'b', detailOpen: true }, 'close', rows)).toEqual({ selectedFlowId: 'b', detailOpen: false });
    expect(reduceInboxNav(listAt('b'), 'close', rows)).toEqual(listAt('b')); // unchanged
  });

  it('↑↓ still move the cursor while a detail is open (browse detail-by-detail)', () => {
    const next = reduceInboxNav({ selectedFlowId: 'b', detailOpen: true }, 'down', rows);
    expect(next).toEqual({ selectedFlowId: 'c', detailOpen: true });
  });

  it('an empty list nulls the selection and cannot open a detail', () => {
    expect(reduceInboxNav(listAt('a'), 'down', [])).toEqual({ selectedFlowId: null, detailOpen: false });
    expect(reduceInboxNav(EMPTY_INBOX_NAV, 'open', [])).toEqual(EMPTY_INBOX_NAV);
  });
});

describe('decidableInboxVerbs + mapInboxDecisionKey — in-card decision gating (SURF-6)', () => {
  const rowIn = (state: InboxRow['state']): InboxRow => ({ flowId: 'f', state });

  it('AWAITING_APPROVAL offers the three Telegraph verbs; APPROVED offers only start', () => {
    expect(decidableInboxVerbs(rowIn('AWAITING_APPROVAL'))).toEqual(['approve', 'full-ahead', 'reject']);
    expect(decidableInboxVerbs(rowIn('APPROVED'))).toEqual(['start']);
  });

  it('every other state offers NOTHING (running/terminal flows are not decidable)', () => {
    for (const state of ['COLLECTING', 'PROPOSAL_READY', 'PREVIEWING', 'STARTING', 'DETACHED_RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED'] as const) {
      expect(decidableInboxVerbs(rowIn(state)), state).toEqual([]);
    }
  });

  it('maps exactly a/f/r/s — every other key is null (disjoint from the nav map)', () => {
    expect(mapInboxDecisionKey('a')).toBe('approve');
    expect(mapInboxDecisionKey('f')).toBe('full-ahead');
    expect(mapInboxDecisionKey('r')).toBe('reject');
    expect(mapInboxDecisionKey('s')).toBe('start');
    for (const other of ['A', 'x', 'q', '1', '', ' ']) expect(mapInboxDecisionKey(other), other).toBeNull();
  });
});
