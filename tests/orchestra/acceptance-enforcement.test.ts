// ─── Acceptance enforcement + confirmation store (ADR-G-040 runtime) ────────
//
// Pins: (1) observe mode never changes an evaluation; (2) enforce REJECT caps
// at NO_GO with a salvage-proof `acceptance:` row and a B1 cause; (3) enforce
// ROUTE downgrades DONE to tech-debt, emits the pending-confirmation intent
// (kernel undecidable statements + author provider) and never fires on NO_GO;
// (4) the store is idempotent by deterministic id and settles single-shot;
// (5) the human-adapter CLI decide settles behind the interactive seam and
// refuses wrong-adapter ids.

import { describe, expect, it, onTestFinished } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { applyAcceptanceEnforcement } from '../../src/orchestra/acceptance-enforcement.js';
import { hasUnsalvageableContractFailure } from '../../src/orchestra/criterion-evaluation.js';
import {
  createConfirmationRequest,
  listPendingConfirmations,
  readConfirmation,
  settleConfirmation,
} from '../../src/core/confirmation-store.js';
import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import type { EvaluationResult } from '../../src/core/task-types.js';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: '920-001',
    title: 'enforcement test',
    description: 'adapter runtime',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src'], filesRead: [], filesWrite: ['src/core/config.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'delivered per contract', noGoCriteria: 'broken', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...over,
  } as Task;
}

function makeResult(over: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '920-001',
    workerId: 'w-920',
    filesChanged: ['src/core/config.ts'],
    linesAdded: 3,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 90,
    selfAssessment: 'DONE',
    notes: 'vitest run: 4/4 passed (exit 0).',
    tokenUsage: { inputTokens: 1, outputTokens: 1, provider: 'claude' } as TaskResult['tokenUsage'],
    ...over,
  };
}

function makeEvaluation(over: Partial<EvaluationResult> = {}): EvaluationResult {
  return { decision: 'DONE', totalScore: 95, rubricScores: [], retryCount: 0, ...over };
}

const routeAuthority = { tenantId: 'tenant-920', projectId: 'project-920', generation: 2 } as const;

describe('applyAcceptanceEnforcement', () => {
  it('observe mode (default) never changes the evaluation', () => {
    const evaluation = makeEvaluation();
    const out = applyAcceptanceEnforcement(evaluation, makeTask(), makeResult(), 'sprint-920');
    expect(out.evaluation).toBe(evaluation);
    expect(out.enforced).toBe(false);
    expect(out.outcome).toMatchObject({ action: 'ACCEPT', source: 'default' });
  });

  it('enforce REJECT caps at NO_GO with a salvage-proof row and a B1 cause', () => {
    const out = applyAcceptanceEnforcement(
      makeEvaluation({ decision: 'GO_WITH_TECH_DEBT' }), makeTask(), makeResult(), 'sprint-920',
      {
        acceptance_enforcement: 'enforce',
        acceptance_matrix: { 'code-development': { QUALIFIED: { action: 'REJECT' } } },
      });
    expect(out.evaluation.decision).toBe('NO_GO');
    expect(out.enforced).toBe(true);
    expect(out.postRubricCause).toBe('acceptance-policy:reject:code-development·QUALIFIED');
    expect(hasUnsalvageableContractFailure(out.evaluation.rubricScores)).toBe(true);
  });

  it('enforce ROUTE downgrades DONE, carries statements + author, never fires on NO_GO', () => {
    const task = makeTask({ type: 'security' });
    const routed = applyAcceptanceEnforcement(
      makeEvaluation({
        decision: 'DONE',
        contractSummary: {
          decided: 1, total: 2,
          undecidableItems: [{ itemId: 'it-1', statement: 'process owner signs off' }],
        },
      }),
      task, makeResult({ workAttribution: {
        state: 'VERIFIED', attemptId: 'attempt-920', baselineRef: 'baseline', scopeDigest: 'scope',
      } }), 'sprint-920', { acceptance_enforcement: 'enforce' }, routeAuthority);
    expect(routed.evaluation.decision).toBe('GO_WITH_TECH_DEBT');
    expect(routed.postRubricCause).toBe('acceptance-policy:route:human');
    expect(routed.pendingConfirmation).toMatchObject({
      taskId: '920-001', kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human',
      statements: ['process owner signs off'], authorProvider: 'claude',
    });
    expect(routed.routeClaim).toMatchObject({
      schemaVersion: 2,
      sourceVerdict: 'UNDECIDABLE',
      adapter: 'human',
      lineage: {
        tenantId: 'tenant-920', projectId: 'project-920', sprintId: 'sprint-920',
        taskId: '920-001', attemptId: 'attempt-920', generation: 2,
        evaluationDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        resultDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
        sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      evaluationDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      claimDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(routed.routeClaim!.evaluationDigest).toBe(routed.routeClaim!.lineage.evaluationDigest);
    expect(routed.routeClaim!.lineage.resultDigest).not.toBe(routed.routeClaim!.lineage.evaluationDigest);
    expect(new Set([
      routed.routeClaim!.lineage.evaluationDigest, routed.routeClaim!.lineage.resultDigest,
      routed.routeClaim!.lineage.policyDigest, routed.routeClaim!.lineage.sourceDigest,
    ])).toHaveLength(4);

    const noGo = applyAcceptanceEnforcement(
      makeEvaluation({ decision: 'NO_GO' }), task, makeResult(), 'sprint-920',
      { acceptance_enforcement: 'enforce' });
    expect(noGo.evaluation.decision).toBe('NO_GO');
    expect(noGo.pendingConfirmation).toBeUndefined();
  });

  it('does not create or apply a ROUTE intent without complete explicit authority', () => {
    const evaluation = makeEvaluation({
      contractSummary: {
        decided: 0, total: 1,
        undecidableItems: [{ itemId: 'owner', statement: 'owner confirms' }],
      },
    });
    const out = applyAcceptanceEnforcement(
      evaluation, makeTask({ type: 'security' }), makeResult(), 'sprint-920',
      { acceptance_enforcement: 'enforce' },
    );
    expect(out.evaluation).toBe(evaluation);
    expect(out.enforced).toBe(false);
    expect(out.pendingConfirmation).toBeUndefined();
    expect(out.routeClaim).toBeUndefined();
  });

  it('derives identical route claims from identical canonical inputs', () => {
    const evaluation = makeEvaluation({
      contractSummary: {
        decided: 0, total: 1,
        undecidableItems: [{ itemId: 'owner', statement: 'owner confirms' }],
      },
    });
    const result = makeResult({ workAttribution: {
      state: 'VERIFIED', attemptId: 'attempt-920', baselineRef: 'baseline', scopeDigest: 'scope',
    } });
    const args = [evaluation, makeTask({ type: 'security' }), result, 'sprint-920',
      { acceptance_enforcement: 'enforce' } as const, routeAuthority] as const;
    expect(applyAcceptanceEnforcement(...args).routeClaim)
      .toEqual(applyAcceptanceEnforcement(...args).routeClaim);
  });

  it('binds producer inputs to exact sprint/task/attempt/generation authority', () => {
    const evaluation = makeEvaluation({ contractSummary: {
      decided: 0, total: 1,
      undecidableItems: [{ itemId: 'owner', statement: 'owner confirms' }],
    } });
    const result = makeResult({ workAttribution: {
      state: 'VERIFIED', attemptId: 'attempt-920', baselineRef: 'baseline', scopeDigest: 'scope',
    } });
    const produce = (nextEvaluation: EvaluationResult, nextTask: Task, nextResult: TaskResult,
      nextSprint: string, nextAuthority = routeAuthority) => applyAcceptanceEnforcement(
      nextEvaluation, nextTask, nextResult, nextSprint,
      { acceptance_enforcement: 'enforce' }, nextAuthority,
    ).routeClaim!;
    const base = produce(evaluation, makeTask({ type: 'security' }), result, 'sprint-920');

    expect(produce({ ...evaluation, totalScore: 94 }, makeTask({ type: 'security' }), result,
      'sprint-920').lineage.evaluationDigest).not.toBe(base.lineage.evaluationDigest);
    expect(produce(evaluation, makeTask({ type: 'security' }), { ...result, notes: 'changed' },
      'sprint-920').lineage.resultDigest).not.toBe(base.lineage.resultDigest);
    expect(produce(evaluation, makeTask({ type: 'security' }), result,
      'sprint-other').lineage.sprintId).toBe('sprint-other');
    expect(produce(evaluation, makeTask({ id: '920-002', type: 'security' }),
      { ...result, taskId: '920-002' }, 'sprint-920').lineage.taskId).toBe('920-002');
    expect(produce(evaluation, makeTask({ type: 'security' }), result, 'sprint-920',
      { ...routeAuthority, generation: 3 }).lineage.generation).toBe(3);
  });
});

describe('confirmation store + human CLI decide', () => {
  it('is idempotent by deterministic id and settles single-shot', () => {
    const root = mkdtempSync(join(tmpdir(), 'confirmation-store-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    const base = {
      sprintId: 'sprint-920', taskId: '920-001', itemIds: ['it-1'],
      kind: 'security', verdict: 'UNDECIDABLE', adapter: 'human',
      statements: ['process owner signs off'], evidenceRequirements: [],
      requestedAt: '2026-08-20T12:00:00.000Z', source: 'acceptance-matrix',
    } as const;
    const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });
    const clock = () => new Date('2026-08-20T12:00:00.000Z');
    const storeOptions = { lifecycle, clock };
    const first = createConfirmationRequest(root, base, storeOptions);
    expect(first.created).toBe(true);
    expect(createConfirmationRequest(root, base, storeOptions)).toEqual({ id: first.id, created: false });
    expect(listPendingConfirmations(root, storeOptions)).toHaveLength(1);

    const settled = settleConfirmation(root, first.id, {
      verdict: 'CONFIRMED', decidedBy: 'human', reason: 'signed', decidedAt: '2026-08-20T12:01:00.000Z',
    }, storeOptions);
    expect(settled.outcome.verdict).toBe('CONFIRMED');
    expect(listPendingConfirmations(root, storeOptions)).toHaveLength(0);
    expect(readConfirmation(root, first.id, storeOptions)?.state).toBe('settled');
    expect(() => settleConfirmation(root, first.id, {
      verdict: 'FAILED', decidedBy: 'human', reason: 'again', decidedAt: '2026-08-20T12:02:00.000Z',
    }, storeOptions)).toThrow(/not pending/);
    // A settled id can never be re-created as pending.
    expect(createConfirmationRequest(root, base, storeOptions)).toEqual({ id: first.id, created: false });
  });

});
