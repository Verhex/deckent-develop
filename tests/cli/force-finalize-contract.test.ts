/**
 * Force-finalize contract (row 3162).
 *
 * `deckent finalize --sprint <id> --force` is exercised live on stuck sprints:
 * it settles them as ABORTED with a truthful "N of M complete" summary and
 * writes the SPRINT-LOG section. The behaviour existed; the CONTRACT did not.
 * These tests pin it against the REAL evidence reads — every fixture is a real
 * `.tasks/` tree in a tmpdir, and nothing between the tree and the terminal
 * artifacts is mocked (no fs stub, no fake `buildSprintFromTasks`, no fake
 * `forceAbortSprint`). The composition below is the finalize command's own
 * force path: evidence read → sprint projection → forced settlement. Only the
 * coordinator-containment step (process/PID machinery, covered by
 * tests/orchestra/sprint-recovery-operation specs) is outside the seam.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  buildFinalizeSprintProjection,
  buildSprintFromTasks,
} from '../../src/cli/commands/finalize.js';
import { forceAbortSprint } from '../../src/orchestra/sprint-finalizer.js';

const roots: string[] = [];

const SPRINT_STARTED_AT = '2026-08-01T00:00:00.000Z';

function makeRoot(sprintId: string): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-force-finalize-'));
  roots.push(root);
  mkdirSync(join(root, '.tasks'), { recursive: true });
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
    sprintId,
    phase: 'EXECUTE',
    status: 'ACTIVE',
    startedAt: SPRINT_STARTED_AT,
  }));
  return root;
}

function task(id: string, sprintId: string, status: TaskStatus): Task {
  return {
    id,
    title: `task ${id}`,
    description: 'force-finalize contract fixture',
    model: 'claude-opus-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'contract fixture',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'go', noGoCriteria: 'no-go', techDebtAcceptable: 'none' },
    status,
    sprintId,
    createdAt: SPRINT_STARTED_AT,
  };
}

function writeTask(root: string, value: Task): void {
  writeFileSync(join(root, '.tasks', `task-${value.id}.json`), JSON.stringify(value));
}

function result(
  taskId: string,
  selfAssessment: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
  overrides: Partial<TaskResult> = {},
): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: ['src/example.ts'],
    linesAdded: 10,
    linesRemoved: 2,
    testsPassed: selfAssessment !== 'NO_GO',
    coverage: 80,
    selfAssessment,
    notes: 'fixture',
    completedAt: '2026-08-01T01:00:00.000Z',
    // Host-authored claim-time attribution, exactly as the worker protocol
    // stamps it; without it a lineage stays attribution-held (pinned below).
    workAttribution: {
      state: 'VERIFIED',
      attemptId: `attempt-${taskId}`,
      baselineRef: 'HEAD',
      scopeDigest: `sha256:scope-${taskId}`,
    },
    ...overrides,
  };
}

function writeResult(root: string, value: TaskResult): void {
  writeFileSync(join(root, '.tasks', `task-${value.taskId}.result`), JSON.stringify(value));
}

/** The finalize command's force path, composed exactly as the CLI composes it. */
function forceFinalize(root: string, sprintId: string, generation = 1): {
  tasks: readonly Task[];
  evaluations: ReadonlyMap<string, TaskEvaluation>;
  settlement: ReturnType<typeof forceAbortSprint>;
} {
  const { tasks, results, evaluations } = buildSprintFromTasks(root, sprintId, {
    recoverOrphanResults: true,
  });
  const sprint = buildFinalizeSprintProjection(root, sprintId, tasks, true);
  const settlement = forceAbortSprint(root, sprint, evaluations, results, {
    defaultAuthMode: 'subscription',
    runId: sprintId,
    coordinatorGeneration: generation,
  });
  return { tasks, evaluations, settlement };
}

function readSprintLog(root: string): string {
  const path = join(root, 'docs', 'SPRINT-LOG.md');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function readReceipt(root: string, sprintId: string): Record<string, any> {
  return JSON.parse(readFileSync(
    join(root, '.deckent', 'recently-works', `${sprintId}-terminal-receipt.json`),
    'utf-8',
  )) as Record<string, any>;
}

function readSprintState(root: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(root, '.deckent', 'sprint-state.json'), 'utf-8'),
  ) as Record<string, unknown>;
}

function headingCount(log: string, sprintNumber: number, sprintId: string): number {
  return log.split('\n').filter(line => line === `## Sprint ${sprintNumber} — ${sprintId}`).length;
}

/**
 * Nothing without a terminal success verdict may settle as complete — checked
 * on all three surfaces a downstream consumer reads: the logical evaluations
 * the sprint log projects, the completion evidence cleanup/promotion consumes,
 * and the headline metric the operator sees.
 */
function assertNoUnresolvedPromotion(
  settlement: ReturnType<typeof forceAbortSprint>,
  resolvedTaskIds: readonly string[],
): void {
  const expected = [...resolvedTaskIds].sort();
  const promoted = [...settlement.terminalTruth.logicalEvaluations.entries()]
    .filter(([, evaluation]) => evaluation === TaskEvaluation.DONE
      || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT)
    .map(([taskId]) => taskId)
    .sort();
  expect(promoted).toEqual(expected);
  expect(settlement.terminalTruth.terminalEvidence.completed
    .map(item => item.logicalTaskId).sort()).toEqual(expected);
  expect(settlement.terminalTruth.logicalMetrics.completedTasks).toBe(expected.length);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('force-finalize contract — every result present', () => {
  it('settles ABORTED with a truthful summary and promotes only resolved lineages', () => {
    const sprintId = 'sprint-900';
    const root = makeRoot(sprintId);
    writeTask(root, task('900-001', sprintId, TaskStatus.DONE));
    writeTask(root, task('900-002', sprintId, TaskStatus.DONE));
    writeTask(root, task('900-003', sprintId, TaskStatus.NO_GO));
    writeResult(root, result('900-001', 'DONE'));
    writeResult(root, result('900-002', 'GO_WITH_TECH_DEBT'));
    writeResult(root, result('900-003', 'NO_GO'));

    const { settlement } = forceFinalize(root, sprintId);

    expect(settlement.outcome).toBe('ABORTED');
    expect(settlement.terminalTruth.logicalMetrics).toMatchObject({
      totalTasks: 3,
      completedTasks: 2,
      techDebtTasks: 1,
      noGoTasks: 1,
    });
    assertNoUnresolvedPromotion(settlement, ['900-001', '900-002']);
    expect(readReceipt(root, sprintId)).toMatchObject({
      terminalOutcome: 'ABORTED',
      receipt: { sprintId, terminalOutcome: 'ABORTED', coordinatorGeneration: 1 },
      logicalProgress: { total: 3, done: 2 },
    });
    expect(readSprintState(root)).toMatchObject({ sprintId, status: 'ABORTED' });

    const log = readSprintLog(root);
    expect(headingCount(log, 900, sprintId)).toBe(1);
    expect(log).toContain('**Status:** ABORTED');
    expect(log).toContain('| Completed | 2 |');
    expect(log).toContain('| No-Go | 1 |');
    expect(log).toContain('- 900-003: task 900-003 (NO_GO)');
  });

  it('never counts a DONE result that carries no host attribution as verified completion', () => {
    const sprintId = 'sprint-907';
    const root = makeRoot(sprintId);
    writeTask(root, task('907-001', sprintId, TaskStatus.DONE));
    writeResult(root, result('907-001', 'DONE', { workAttribution: undefined }));

    const { settlement } = forceFinalize(root, sprintId);
    const evidence = settlement.terminalTruth.terminalEvidence;

    expect(evidence.completed).toHaveLength(0);
    expect(evidence.holds.length).toBeGreaterThan(0);
    expect(evidence.cleanupEligibility.candidate).toBe(false);
    expect(settlement.terminalTruth.logicalEvaluations.size).toBe(0);
  });

  it('never deletes the task evidence it settled from', () => {
    const sprintId = 'sprint-901';
    const root = makeRoot(sprintId);
    writeTask(root, task('901-001', sprintId, TaskStatus.NO_GO));
    writeResult(root, result('901-001', 'NO_GO'));

    forceFinalize(root, sprintId);

    expect(existsSync(join(root, '.tasks', 'task-901-001.json'))).toBe(true);
    expect(existsSync(join(root, '.tasks', 'task-901-001.result'))).toBe(true);
  });
});

describe('force-finalize contract — results missing', () => {
  it('settles unresolved lineages as unresolved instead of promoting them', () => {
    const sprintId = 'sprint-902';
    const root = makeRoot(sprintId);
    // Resolved: worker verdict on disk.
    writeTask(root, task('902-001', sprintId, TaskStatus.DONE));
    writeResult(root, result('902-001', 'DONE'));
    // Dispatched, died mid-flight: no `.result` at all.
    writeTask(root, task('902-002', sprintId, TaskStatus.EXECUTING));
    // Never dispatched: pending work must not become a failed attempt either.
    writeTask(root, task('902-003', sprintId, TaskStatus.PENDING));

    const { evaluations, settlement } = forceFinalize(root, sprintId);

    expect(evaluations.get('902-002')).toBe(TaskEvaluation.NO_GO);
    expect(evaluations.get('902-003')).toBe(TaskEvaluation.DEFERRED);
    assertNoUnresolvedPromotion(settlement, ['902-001']);
    expect(settlement.terminalTruth.logicalMetrics).toMatchObject({
      totalTasks: 3,
      completedTasks: 1,
      noGoTasks: 1,
      unevaluatedTasks: 1,
    });
    // Unresolved evidence must survive settlement so cleanup stays blocked.
    expect(readReceipt(root, sprintId).terminalEvidence.cleanupEligibility.candidate).toBe(false);
    expect(readSprintLog(root)).toContain('| Completed | 1 |');
  });
});

describe('force-finalize contract — lost task projection', () => {
  it('still reaches a truthful terminal state from the surviving result evidence', () => {
    const sprintId = 'sprint-903';
    const root = makeRoot(sprintId);
    // The task JSONs are gone (crash / partial archive); only results survive.
    writeResult(root, result('903-001', 'DONE'));
    writeResult(root, result('903-002', 'NO_GO'));

    // Normal (non-forced) finalize keeps ignoring orphan results — a COMPLETE
    // run may only ever count planned work.
    expect(buildSprintFromTasks(root, sprintId).tasks).toHaveLength(0);

    const { tasks, settlement } = forceFinalize(root, sprintId);

    expect(tasks.map(t => t.id).sort()).toEqual(['903-001', '903-002']);
    expect(settlement.outcome).toBe('ABORTED');
    expect(settlement.terminalTruth.logicalMetrics).toMatchObject({
      totalTasks: 2,
      completedTasks: 1,
      noGoTasks: 1,
    });
    assertNoUnresolvedPromotion(settlement, ['903-001']);
    expect(readReceipt(root, sprintId)).toMatchObject({
      terminalOutcome: 'ABORTED',
      receipt: { sprintId, terminalOutcome: 'ABORTED' },
    });
    expect(readSprintState(root)).toMatchObject({ sprintId, status: 'ABORTED' });
    expect(headingCount(readSprintLog(root), 903, sprintId)).toBe(1);
    // The recovered records are evidence projections, not invented plan work.
    const recovered = tasks.find(t => t.id === '903-002');
    expect(recovered).toMatchObject({ description: '', reason: '', dependencies: [] });
    expect(recovered?.scope).toEqual({ directories: [], filesRead: [], filesWrite: [] });
  });

  it('recovers a partially lost projection without double-counting surviving tasks', () => {
    const sprintId = 'sprint-904';
    const root = makeRoot(sprintId);
    writeTask(root, task('904-001', sprintId, TaskStatus.DONE));
    writeResult(root, result('904-001', 'DONE'));
    writeResult(root, result('904-002', 'NO_GO')); // task JSON lost

    const { tasks, settlement } = forceFinalize(root, sprintId);

    expect(tasks.map(t => t.id).sort()).toEqual(['904-001', '904-002']);
    expect(tasks.find(t => t.id === '904-001')?.title).toBe('task 904-001');
    assertNoUnresolvedPromotion(settlement, ['904-001']);
    expect(settlement.terminalTruth.logicalMetrics).toMatchObject({
      totalTasks: 2,
      completedTasks: 1,
      noGoTasks: 1,
    });
  });

  it('reports nothing to settle when no evidence of any kind survives', () => {
    const sprintId = 'sprint-905';
    const root = makeRoot(sprintId);

    const built = buildSprintFromTasks(root, sprintId, { recoverOrphanResults: true });

    expect(built.tasks).toHaveLength(0);
    expect(built.results).toHaveLength(0);
  });
});

describe('force-finalize contract — idempotency', () => {
  it('re-forcing an already-finalized sprint republishes the same terminal truth', () => {
    const sprintId = 'sprint-906';
    const root = makeRoot(sprintId);
    writeTask(root, task('906-001', sprintId, TaskStatus.DONE));
    writeTask(root, task('906-002', sprintId, TaskStatus.EXECUTING));
    writeResult(root, result('906-001', 'DONE'));

    const first = forceFinalize(root, sprintId);
    // A prior sprint log section is exactly what an already-finalized sprint
    // looks like on disk; --force must still settle, and settle identically.
    const second = forceFinalize(root, sprintId);

    expect(second.settlement.terminalTruth.logicalSettlementDigest)
      .toBe(first.settlement.terminalTruth.logicalSettlementDigest);
    expect(second.settlement.receiptPublication.receipt)
      .toEqual(first.settlement.receiptPublication.receipt);
    assertNoUnresolvedPromotion(second.settlement, ['906-001']);

    const receipt = readReceipt(root, sprintId);
    expect(receipt.terminalOutcome).toBe('ABORTED');
    expect(receipt.receipt.authorityVersion)
      .toBe(first.settlement.receiptPublication.receipt.authorityVersion);
    expect(readSprintState(root)).toMatchObject({ sprintId, status: 'ABORTED' });
    // The SPRINT-LOG section is written exactly once, not appended per run.
    expect(headingCount(readSprintLog(root), 906, sprintId)).toBe(1);
  });
});
