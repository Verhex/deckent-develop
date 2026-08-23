import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TaskEvaluation } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  buildFinalizerTerminalTruth,
  publishFencedSprintTerminalReceipt,
  publishFinalSprintAuthority,
  publishTestModeSprintTerminalReceipt,
  shouldEmitStandardLifecycleEvents,
} from '../../src/orchestra/sprint-finalizer.js';
import { readCanonicalRunStatusReadModel } from '../../src/core/run-status-read-model.js';
import { runRetroPhase } from '../../src/orchestra/sprint-phases.js';

const temporaryRoots: string[] = [];

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-terminal-receipt-'));
  temporaryRoots.push(root);
  return root;
}

function task(): Task {
  return {
    id: '487-002',
    title: 'Fenced receipt before archive',
    description: '',
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'terminal receipt test',
    provider: 'codex',
    authMode: 'subscription',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'receipt', noGoCriteria: 'early archive', techDebtAcceptable: 'none' },
    status: 'DONE',
    sprintId: 'sprint-487',
    assignedWorker: 'w-487-002',
    createdAt: '2026-07-31T00:00:00.000Z',
  } as Task;
}

function result(verdict: 'DONE' | 'NO_GO'): TaskResult {
  return {
    taskId: '487-002',
    workerId: 'w-487-002',
    filesChanged: ['src/orchestra/sprint-finalizer.ts'],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: verdict === 'DONE',
    coverage: 100,
    selfAssessment: verdict,
    notes: verdict,
    workAttribution: {
      state: 'VERIFIED',
      attemptId: `attempt-${verdict.toLowerCase()}`,
      baselineRef: `baseline:${verdict}`,
      scopeDigest: verdict === 'DONE' ? 'd'.repeat(64) : 'f'.repeat(64),
    },
  };
}

function persistTaskAuthority(root: string, sprintTask: Task): void {
  mkdirSync(join(root, '.tasks'), { recursive: true });
  writeFileSync(
    join(root, '.tasks', `task-${sprintTask.id}.json`),
    `${JSON.stringify(sprintTask, null, 2)}\n`,
  );
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('fenced sprint terminal receipt archive boundary', () => {
  it('does not replay ordinary lifecycle events during completed-checkpoint recovery', () => {
    expect(shouldEmitStandardLifecycleEvents()).toBe(true);
    expect(shouldEmitStandardLifecycleEvents({ lifecycleContext: 'live-execution' })).toBe(true);
    expect(shouldEmitStandardLifecycleEvents({
      lifecycleContext: 'completed-checkpoint-recovery',
    })).toBe(false);
  });

  it('publishes one generation-fenced receipt carrying the exact logical settlement digest', () => {
    const sprintTask = task();
    const truth = buildFinalizerTerminalTruth({
      tasks: [sprintTask],
      evaluations: new Map([['487-002', TaskEvaluation.DONE]]),
      results: [result('DONE')],
    });
    const sprint = {
      id: 'sprint-487',
      number: 487,
      tasks: [sprintTask],
    } as Parameters<typeof publishFencedSprintTerminalReceipt>[0]['sprint'];
    const root = projectRoot();
    persistTaskAuthority(root, sprintTask);

    const first = publishFencedSprintTerminalReceipt({
      projectRoot: root,
      sprint,
      truth,
      runId: 'run-487',
      coordinatorGeneration: 7,
      now: () => '2026-07-31T12:00:00.000Z',
    });
    const second = publishFencedSprintTerminalReceipt({
      projectRoot: root,
      sprint,
      truth,
      runId: 'run-487',
      coordinatorGeneration: 7,
      now: () => '2026-07-31T12:01:00.000Z',
    });
    const artifact = JSON.parse(readFileSync(first.artifactPath, 'utf-8')) as {
      receipt: { logicalSettlementDigest: string; coordinatorGeneration: number; authorityVersion: number };
      terminalEvidence: { cleanupEligibility: { candidate: boolean } };
      logicalProgress: {
        lineages: readonly {
          logicalTaskId: string;
          attemptIds: readonly string[];
          attemptCount: number;
          status: string;
        }[];
      };
    };

    expect(second.receipt).toEqual(first.receipt);
    expect(artifact.receipt).toMatchObject({
      logicalSettlementDigest: truth.logicalSettlementDigest,
      coordinatorGeneration: 7,
      authorityVersion: 1,
    });
    expect(artifact.terminalEvidence.cleanupEligibility.candidate).toBe(true);

    // 488-002: the persisted receipt must expose the plain canonical root task id —
    // never a composite `taskId + NUL + attemptId` string — while still retaining
    // the exact per-attempt identity in `attemptIds`.
    expect(artifact.logicalProgress.lineages).toEqual([
      { logicalTaskId: '487-002', attemptIds: ['487-002'], attemptCount: 1, status: 'done' },
    ]);
    const nulChar = String.fromCharCode(0);
    const artifactRaw = readFileSync(first.artifactPath, 'utf-8');
    expect(artifactRaw.includes(nulChar)).toBe(false);
  });

  it('refuses to publish a settled NO_GO as COMPLETE (typed fail-closed, was: published with BLOCKED eligibility)', () => {
    const sprintTask = task();
    const truth = buildFinalizerTerminalTruth({
      tasks: [sprintTask],
      evaluations: new Map([['487-002', TaskEvaluation.NO_GO]]),
      results: [result('NO_GO')],
    });

    // A' terminal-publication fail-closed (sprint-537 wave, 2026-08-17): a run
    // whose lineages did not complete can no longer be PUBLISHED as COMPLETE
    // at all — the old behavior (publish + record BLOCKED eligibility) is
    // superseded by the typed refusal; force-abort is the closure path.
    const root = projectRoot();
    persistTaskAuthority(root, sprintTask);
    expect(() => publishFencedSprintTerminalReceipt({
      projectRoot: root,
      sprint: { id: 'sprint-487', number: 487, tasks: [sprintTask] } as Parameters<
        typeof publishFencedSprintTerminalReceipt
      >[0]['sprint'],
      truth,
    })).toThrow(/TERMINAL_PUBLICATION_NOT_CLEANUP_CANDIDATE_BLOCKED/);
  });

  it('publishes test-mode terminal authority without invoking the learning finalizer', () => {
    const sprintTask = task();
    const sprint = {
      id: 'sprint-487',
      number: 487,
      tasks: [sprintTask],
    } as Parameters<typeof publishFencedSprintTerminalReceipt>[0]['sprint'];
    const root = projectRoot();
    persistTaskAuthority(root, sprintTask);

    const settlement = publishTestModeSprintTerminalReceipt(
      root,
      sprint,
      new Map([['487-002', TaskEvaluation.DONE]]),
      [result('DONE')],
      { runId: 'test-run-487', coordinatorGeneration: 9 },
    );

    expect(settlement.receiptPublication.receipt).toMatchObject({
      sprintId: 'sprint-487',
      runId: 'test-run-487',
      coordinatorGeneration: 9,
    });
    expect(settlement.terminalTruth.logicalMetrics).toMatchObject({
      totalTasks: 1,
      completedTasks: 1,
      noGoTasks: 0,
      unevaluatedTasks: 0,
    });
    expect(settlement.receiptPublication.terminalEvidence.cleanupEligibility).toMatchObject({
      state: 'CANDIDATE',
      candidate: true,
    });
  });

  it('wires the reduced test RETRO phase to the fenced terminal receipt', async () => {
    const sprintTask = task();
    const sprint = {
      id: 'sprint-487',
      number: 487,
      tasks: [sprintTask],
      status: 'EVALUATING',
      phase: 'EVALUATE',
      workers: ['w-487-002'],
      startedAt: '2026-07-31T00:00:00.000Z',
    } as Parameters<typeof runRetroPhase>[1];
    const root = projectRoot();
    persistTaskAuthority(root, sprintTask);

    const outcome = await runRetroPhase(
      root,
      sprint,
      new Map([['487-002', TaskEvaluation.DONE]]),
      [result('DONE')],
      { auth_mode: 'subscription', language: 'en' } as Parameters<typeof runRetroPhase>[4],
      true,
      'test-flow-487',
    );

    expect(outcome).toMatchObject({ totalTasks: 1, completedTasks: 1, noGoTasks: 0 });
    const receipt = JSON.parse(readFileSync(
      join(root, '.deckent', 'recently-works', 'sprint-487-terminal-receipt.json'),
      'utf-8',
    )) as { receipt: { runId: string; sprintId: string } };
    expect(receipt.receipt).toEqual(expect.objectContaining({
      runId: 'test-flow-487',
      sprintId: 'sprint-487',
    }));
  });

  it('publishes dashboard before the canonical COMPLETE read model so status retains the receipt', () => {
    const root = projectRoot();
    const sprintTask = task();
    const sprint = {
      id: 'sprint-487',
      number: 487,
      tasks: [sprintTask],
      workers: [],
      status: 'PAUSED',
      phase: 'FIX',
      startedAt: '2026-07-31T00:00:00.000Z',
    } as Parameters<typeof publishFinalSprintAuthority>[1];
    mkdirSync(join(root, '.deckent', 'recently-works'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.tasks', 'task-487-002.json'), JSON.stringify(sprintTask));
    writeFileSync(join(root, '.tasks', 'task-487-002.result'), JSON.stringify(result('DONE')));
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: sprint.id,
      status: 'PAUSED',
      phase: 'FIX',
      taskIds: [sprintTask.id],
    }));
    writeFileSync(join(root, '.dashboard'), JSON.stringify({
      sprint: { id: sprint.id, number: sprint.number, status: 'PAUSED', phase: 'FIX' },
      agents: [],
      progress: { done: 0, active: 0, blocked: 1, total: 1 },
      alerts: [],
      updatedAt: '2026-07-31T00:00:00.000Z',
    }));
    publishTestModeSprintTerminalReceipt(
      root,
      sprint,
      new Map([['487-002', TaskEvaluation.DONE]]),
      [result('DONE')],
    );

    publishFinalSprintAuthority(root, sprint, {
      totalTasks: 1,
      completedTasks: 1,
      techDebtTasks: 0,
      noGoTasks: 0,
      unevaluatedTasks: 0,
      durationMs: 1,
      coveragePercent: 100,
      noGoRate: 0,
      newDebtCount: 0,
      resolvedDebtCount: 0,
      totalOpenDebt: 0,
      boundaryViolations: 0,
      crossAssignments: 0,
      contextLinesUsed: 0,
    });

    const model = readCanonicalRunStatusReadModel(root);
    expect(model?.authority.lifecycle).toBe('COMPLETE');
    expect(model?.terminalPublication.state).toBe('receipt-observed');
    expect(model?.authority.conflicts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ surface: 'dashboard' }),
    ]));
  });

  it('wires one receipt publication before archive and guards every cleanup step with receipt evidence', () => {
    const source = readFileSync(
      new URL('../../src/orchestra/sprint-finalizer.ts', import.meta.url),
      'utf-8',
    );
    const finalizeSource = source.slice(source.indexOf('export async function finalizeSprint('));
    const publishIndex = finalizeSource.indexOf(
      'terminalReceiptPublication = publishFencedSprintTerminalReceipt({',
    );
    const guardIndex = finalizeSource.indexOf('if (receiptAllowsArchive) {');
    const archiveIndex = finalizeSource.indexOf(
      "archiveDirectives(projectRoot, sprint.id, 'CLEANUP'",
    );
    // Sprint-512 (archive authority) retired the blanket archiveOrphanTasks
    // step — orphan artifacts settle through the archive authority instead.
    const retiredOrphanIndex = finalizeSource.indexOf('archiveOrphanTasks(');

    expect(finalizeSource.match(/publishFencedSprintTerminalReceipt\(\{/gu)).toHaveLength(1);
    expect(finalizeSource).toContain(
      'terminalReceiptPublication?.terminalEvidence.cleanupEligibility.candidate === true',
    );
    expect(finalizeSource).toContain(
      "throw new FinalizerTerminalEvidenceError('TERMINAL_RECEIPT_NOT_CLEANUP_ELIGIBLE')",
    );
    expect(finalizeSource).toContain(
      'if (e instanceof FinalizerTerminalEvidenceError) throw e;',
    );
    expect(publishIndex).toBeGreaterThan(0);
    expect(guardIndex).toBeGreaterThan(publishIndex);
    expect(archiveIndex).toBeGreaterThan(guardIndex);
    expect(retiredOrphanIndex).toBe(-1);
  });

  it('publishes terminal lifecycle authority before the single outer archive seal and only then projects EventBus completion', () => {
    const controller = readFileSync(
      new URL('../../src/orchestra/sprint-controller.ts', import.meta.url),
      'utf-8',
    );
    const terminalTail = controller.slice(controller.indexOf(
      'const terminalPublication = commitSprintTerminalHandoff(terminalHandoff);',
    ));
    const authorityIndex = terminalTail.indexOf('publishFinalSprintAuthority(');
    const archivePublisherIndex = terminalTail.indexOf('publishOutermostSprintTerminalArchive({');
    const phaseProjectionIndex = terminalTail.indexOf(
      'emitPhaseChange(SprintPhase.DECAY, SprintPhase.COMPLETE, sprint.id);',
    );
    const completedProjectionIndex = terminalTail.indexOf(
      "emitSprintEvent('SPRINT_COMPLETED', { sprintId: sprint.id });",
    );

    expect(authorityIndex).toBeGreaterThan(0);
    expect(archivePublisherIndex).toBeGreaterThan(authorityIndex);
    expect(phaseProjectionIndex).toBeGreaterThan(archivePublisherIndex);
    expect(completedProjectionIndex).toBeGreaterThan(phaseProjectionIndex);
    expect(terminalTail.match(/publishOutermostSprintTerminalArchive\(\{/gu)).toHaveLength(1);
  });
});
