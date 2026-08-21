// tests/mcp/nervous-undo-compensating.test.ts
//
// Task 382-004 (born-574, NERVOUS-UNDO real compensating-executor).
//
// REPL/audit finding: `deckent_nervous_undo` (src/mcp/tools/nervous-edit.ts)
// only ever returns an undo PLAN — nothing in the codebase executed a real
// compensating action, so nothing could actually be undone (silent no-op).
//
// Covers `runNervousCompensatingAction` (src/mcp/tools/nervous.ts): a real,
// disk-verifiable reversal for `ORPHAN_TASK_ARCHIVE` — the one registry
// action Nervous both self-executes with a real disk effect AND marks
// reversible (ADR-037) — and an honest `applied:false` + specific reason for
// every other action id (Brain-proposal-only; Nervous never touched that
// resource, so there is nothing on disk to reverse).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  handleNervousAccept,
  runNervousCompensatingAction,
  type NervousCompensatingHistorySink,
} from '../../src/mcp/tools/nervous.js';
import { handleNervousUndo } from '../../src/mcp/tools/nervous-edit.js';
import { archiveOrphanTasks } from '../../src/orchestra/sprint-docs-updater.js';
import { NervousHistory } from '../../src/nervous/history.js';
import { BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR } from '../../src/core/constants.js';
import type { ExecutionRecord } from '../../src/core/nervous-types.js';

const SPRINT_ID = 'sprint-999';

function makeRecord(overrides: Partial<ExecutionRecord> = {}): ExecutionRecord {
  return {
    id: `rec-${Math.random().toString(36).slice(2, 8)}`,
    notificationId: 'ns-orphan-archive-001',
    actionId: 'ORPHAN_TASK_ARCHIVE',
    decision: 'accepted',
    decidedBy: 'user',
    executedAt: new Date().toISOString(),
    outcome: 'success',
    reversible: true,
    payload: { sprintId: SPRINT_ID },
    ...overrides,
  };
}

function archiveDirFor(root: string, sprintId = SPRINT_ID): string {
  return join(root, BRAIN_DIR, ARCHIVE_DIR, ARCHIVE_SPRINTS_SUBDIR, `${sprintId}-tasks`);
}

describe('runNervousCompensatingAction — real reversal for ORPHAN_TASK_ARCHIVE (disk-check, no mocks)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nervous-undo-compensating-'));
    mkdirSync(join(root, '.tasks'), { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function seedTaskFiles(): void {
    writeFileSync(join(root, '.tasks', 'task-999-001.json'), JSON.stringify({ id: '999-001' }), 'utf-8');
    writeFileSync(join(root, '.tasks', 'task-999-001.result'), JSON.stringify({ selfAssessment: 'DONE' }), 'utf-8');
  }

  it('accept → real forward archive → runNervousCompensatingAction restores the exact files to .tasks/ (proof-of-function)', async () => {
    seedTaskFiles();

    // Real accept flow — nervous.ts's own handler, this task's write scope.
    const acceptResult = await handleNervousAccept({ id: 'ns-orphan-archive-001', root });
    expect(acceptResult.accepted).toBe(true);

    // Real forward effect — the production archiving function, not a mock.
    const archivedCount = archiveOrphanTasks(root, SPRINT_ID);
    expect(archivedCount).toBe(2);
    expect(existsSync(join(root, '.tasks', 'task-999-001.json'))).toBe(false);
    const archiveDir = archiveDirFor(root);
    expect(readdirSync(archiveDir).sort()).toEqual(['task-999-001.json', 'task-999-001.result']);

    const history = new NervousHistory(root);
    const record = makeRecord();
    await history.append(record);

    const result = await runNervousCompensatingAction(record, root);

    expect(result.applied).toBe(true);
    expect([...(result.restoredFiles ?? [])].sort()).toEqual(['task-999-001.json', 'task-999-001.result']);

    // Disk-check: the real files are back, with their original content.
    expect(existsSync(join(root, '.tasks', 'task-999-001.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(root, '.tasks', 'task-999-001.json'), 'utf-8'))).toEqual({ id: '999-001' });
    expect(existsSync(join(root, '.tasks', 'task-999-001.result'))).toBe(true);
    // Archive dir is now empty — files were moved, not copied.
    expect(readdirSync(archiveDir)).toEqual([]);

    // Real reversal appends a compensation record to the audit trail.
    const all = await history.readAll();
    const undoRecord = all.find(r => r.id === `undo-${record.id}`);
    expect(undoRecord).toBeDefined();
    expect(undoRecord?.decision).toBe('rejected');
    expect((undoRecord?.payload as Record<string, unknown>).undoOf).toBe(record.id);
  });

  it('chains with the existing plan-builder (handleNervousUndo, nervous-edit.ts): plan.record → real reversal', async () => {
    seedTaskFiles();
    archiveOrphanTasks(root, SPRINT_ID);

    const history = new NervousHistory(root);
    await history.append(makeRecord({ id: 'chained-rec' }));

    const plan = await handleNervousUndo({ root });
    expect(plan.supported).toBe(true);
    if (!plan.supported) throw new Error('unreachable');
    expect(plan.plan.record.id).toBe('chained-rec');

    const result = await runNervousCompensatingAction(plan.plan.record, root);
    expect(result.applied).toBe(true);
    expect(existsSync(join(root, '.tasks', 'task-999-001.json'))).toBe(true);
  });

  it('destination conflict — a live file with the same name is never clobbered', async () => {
    seedTaskFiles();
    archiveOrphanTasks(root, SPRINT_ID);
    // A new live file reappears at the same path after archiving.
    writeFileSync(join(root, '.tasks', 'task-999-001.json'), JSON.stringify({ id: 'live-conflict' }), 'utf-8');

    const history = new NervousHistory(root);
    const record = makeRecord();
    await history.append(record);
    const result = await runNervousCompensatingAction(record, root);

    expect(result.applied).toBe(true); // task-999-001.result still restores
    expect(result.restoredFiles).toEqual(['task-999-001.result']);
    expect(result.detail).toContain('skipped');
    // The live conflicting file was never overwritten.
    expect(JSON.parse(readFileSync(join(root, '.tasks', 'task-999-001.json'), 'utf-8'))).toEqual({ id: 'live-conflict' });
  });

  it('all destinations conflict → honest applied:false, nothing clobbered', async () => {
    seedTaskFiles();
    archiveOrphanTasks(root, SPRINT_ID);
    writeFileSync(join(root, '.tasks', 'task-999-001.json'), 'LIVE', 'utf-8');
    writeFileSync(join(root, '.tasks', 'task-999-001.result'), 'LIVE', 'utf-8');

    const record = makeRecord();
    const result = await runNervousCompensatingAction(record, root);

    expect(result.applied).toBe(false);
    expect(result.detail).toContain('already exist in .tasks/');
    expect(readFileSync(join(root, '.tasks', 'task-999-001.json'), 'utf-8')).toBe('LIVE');
  });

  it('no archive directory on disk → honest applied:false (never archived, or already restored)', async () => {
    const record = makeRecord({ payload: { sprintId: 'sprint-777' } });
    const result = await runNervousCompensatingAction(record, root);

    expect(result.applied).toBe(false);
    expect(result.detail).toContain('No archive directory found');
  });

  it('empty archive directory → honest applied:false', async () => {
    mkdirSync(archiveDirFor(root), { recursive: true });
    const record = makeRecord();
    const result = await runNervousCompensatingAction(record, root);

    expect(result.applied).toBe(false);
    expect(result.detail).toContain('is empty');
  });

  it('missing payload.sprintId → honest applied:false, does not throw', async () => {
    const record = makeRecord({ payload: {} });
    const result = await runNervousCompensatingAction(record, root);

    expect(result.applied).toBe(false);
    expect(result.detail).toContain('payload.sprintId');
  });

  it('does NOT append a markUndone compensation record when nothing was applied', async () => {
    const history = new NervousHistory(root);
    const record = makeRecord({ payload: {} });
    await history.append(record);

    await runNervousCompensatingAction(record, root);

    const all = await history.readAll();
    expect(all).toHaveLength(1); // only the original record — no fake compensation
  });

  it('injected historySink is used instead of a real NervousHistory', async () => {
    seedTaskFiles();
    archiveOrphanTasks(root, SPRINT_ID);
    const record = makeRecord();

    const calls: Array<{ id: string; detail: Record<string, unknown> }> = [];
    const fakeSink: NervousCompensatingHistorySink = {
      markUndone: async (id, detail) => {
        calls.push({ id, detail });
      },
    };

    const result = await runNervousCompensatingAction(record, root, fakeSink);

    expect(result.applied).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.id).toBe(record.id);

    // Real NervousHistory file was never touched by markUndone (fake sink used).
    const history = new NervousHistory(root);
    const all = await history.readAll();
    expect(all).toEqual([]);
  });
});

describe('runNervousCompensatingAction — honest applied:false for Brain-proposal-only actions (ADR-037)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'nervous-undo-compensating-recommend-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const RECOMMENDATION_ONLY_ACTION_IDS = [
    'DIRECTIVES_WRITE',
    'PROMPT_BUILDER_TWEAK',
    'SRC_MODIFICATION',
    'COMMIT_CREATE',
    'AGENT_DISABLE',
  ];

  it.each(RECOMMENDATION_ONLY_ACTION_IDS)(
    '%s (reversible:true in the registry, but never self-executed by Nervous) → honest applied:false',
    async (actionId) => {
      const record: ExecutionRecord = {
        id: `rec-${actionId}`,
        notificationId: 'ns-test',
        actionId,
        decision: 'accepted',
        decidedBy: 'user',
        executedAt: new Date().toISOString(),
        outcome: 'success',
        reversible: true,
        payload: {},
      };

      const result = await runNervousCompensatingAction(record, root);

      expect(result.applied).toBe(false);
      expect(result.actionId).toBe(actionId);
      expect(result.detail).toContain(actionId);
      // 595-003 stale-ADR sweep: the catalog text now cites the MECHANISM
      // (advisory authority) instead of the numeric ADR id — the pin's intent
      // (a specific "why nothing was reversed" reason) is unchanged.
      expect(result.detail).toContain('advisory authority');
    },
  );

  it('never silently fakes success — result always carries recordId + actionId + a specific detail', async () => {
    const record: ExecutionRecord = {
      id: 'rec-honest',
      notificationId: 'ns-test',
      actionId: 'AGENT_DISABLE',
      decision: 'accepted',
      decidedBy: 'user',
      executedAt: new Date().toISOString(),
      outcome: 'success',
      reversible: true,
      payload: {},
    };

    const result = await runNervousCompensatingAction(record, root);

    expect(result).toEqual({
      applied: false,
      recordId: 'rec-honest',
      actionId: 'AGENT_DISABLE',
      detail: expect.stringContaining('No compensating action available'),
    });
  });
});
