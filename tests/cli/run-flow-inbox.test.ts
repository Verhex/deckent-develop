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
  DEFAULT_INBOX_LABELS,
  MAX_INBOX_ROWS,
  type InboxRow,
} from '../../src/cli/repl/run-flow-inbox.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
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

describe('buildInboxLabels — i18n (SURF-3)', () => {
  it('resolves every label in en + tr (en !== tr), covering all states', () => {
    const en = buildInboxLabels((k) => getMessage(k, 'en'));
    const tr = buildInboxLabels((k) => getMessage(k, 'tr'));
    for (const key of ['header', 'hint', 'empty'] as const) {
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
