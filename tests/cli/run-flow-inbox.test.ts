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
  type InboxRow,
  type InboxNavState,
} from '../../src/cli/repl/run-flow-inbox.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
import { saveApprovedSnapshot, saveRunHandle } from '../../src/core/run-flow-store.js';
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
function doFlowOnDisk(root: string, flowId: string, startedAt: string, intent?: string): void {
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
  });
}

/** Write a jobs-dir terminal record correlated to a flowId. */
function writeJob(root: string, flowId: string, status: 'COMPLETE' | 'FAILED', done = 0, total = 0): void {
  const jobsDir = join(root, '.deckent', 'runtime', 'jobs');
  mkdirSync(jobsDir, { recursive: true });
  writeFileSync(
    join(jobsDir, `${flowId}.json`),
    JSON.stringify({ status, sprintId: flowId, metrics: { totalTasks: total, done, techDebt: 0, noGo: 0 }, completionRecord: { flowId } }),
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
    // short-id + running badge, NO trailing intent text.
    expect(lines[1]).toBe('  1. do-flow- · running');
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
    expect(lines[1]).toBe('  1. do-flow- · running add rate limiting');
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

describe('buildInboxDetailLines — single-flow detail (D2)', () => {
  const labels = DEFAULT_INBOX_LABELS;

  it('renders header + full id + intent + progress + started when all present', () => {
    const row: InboxRow = {
      flowId: '9c3d577a-5c24-45c6-86e2-abcdef012345', state: 'COMPLETED',
      intentSummary: 'add auth', done: 3, total: 4, updatedAt: '2026-07-15T10:00:00.000Z', revision: 1,
    };
    expect(buildInboxDetailLines(row, labels)).toEqual([
      'Run 9c3d577a · completed',
      '  id: 9c3d577a-5c24-45c6-86e2-abcdef012345',
      '  intent: add auth',
      '  progress: 3/4',
      '  started: 2026-07-15T10:00:00.000Z',
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
    for (const key of ['header', 'hint', 'empty', 'detailIntent', 'detailProgress', 'detailStarted', 'notFound', 'followNavHint', 'followDetailHint'] as const) {
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
