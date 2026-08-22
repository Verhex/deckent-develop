import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveApprovalLifecyclePolicy } from '../../src/core/approval-lifecycle-policy.js';
import { attendedExecutionProjectId } from '../../src/core/attended-execution-approval.js';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { EvaluationResult, ResolvedConfig, Task, TaskResult } from '../../src/core/types.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import { applyAcceptanceEnforcement } from '../../src/orchestra/acceptance-enforcement.js';
import type { AcceptanceConfirmationComposition } from '../../src/orchestra/acceptance-confirmation-composition.js';
import {
  persistDurableAcceptanceConfirmation,
  prepareResultEvaluationAttempt,
  writeTaskEvaluationAudit,
} from '../../src/orchestra/sprint-phases.js';

const roots: string[] = [];
const requestedAt = '2026-08-22T12:00:00.000Z';
const lifecycle = resolveApprovalLifecyclePolicy({ enabled: true });

function fixture(): { task: Task; result: TaskResult; evaluation: EvaluationResult } {
  const task = {
    id: '614-011-canary', title: 'main acceptance route', description: 'route owner decision',
    model: 'gpt-5.6-sol', effort: 'high', priority: 'NORMAL', reason: 'canary',
    scope: { directories: ['src'], filesRead: [], filesWrite: ['src/canary.ts'] },
    dependencies: [], status: TaskStatus.PENDING, type: 'security',
    actor: { id: 'brain', tenantId: 'tenant-canary' },
    goNogo: {
      goCriteria: 'owner confirms release', noGoCriteria: 'owner refuses', techDebtAcceptable: '',
      items: [{ id: 'owner', statement: 'Owner confirms release', evidenceRequirements: ['owner.receipt'] }],
    },
  } as Task;
  const result: TaskResult = {
    taskId: task.id, workerId: 'w-canary', filesChanged: ['src/canary.ts'],
    linesAdded: 1, linesRemoved: 0, testsPassed: true, coverage: 100,
    selfAssessment: 'DONE', notes: 'owner decision remains external',
    workAttribution: {
      state: 'VERIFIED', attemptId: 'attempt-main-1', baselineRef: 'baseline-main', scopeDigest: 'scope-main',
    },
  };
  const evaluation: EvaluationResult = {
    decision: 'DONE', totalScore: 100, rubricScores: [], retryCount: 0,
    contractSummary: {
      decided: 0, total: 1,
      undecidableItems: [{ itemId: 'owner', statement: 'Owner confirms release' }],
    },
  };
  return { task, result, evaluation };
}

function makeRoot(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-main-enforce-'));
  roots.push(value);
  mkdirSync(join(value, '.brain'), { recursive: true });
  new MemoryStore(join(value, '.brain', 'memory.db')).close();
  return value;
}

afterEach(() => {
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('main EVALUATE acceptance create-route wiring', () => {
  it('runs evaluator intent through production confirmation→debt and audits the exact HOLD receipt', async () => {
    const projectRoot = makeRoot();
    const { task, result } = fixture();
    const sprint = { id: 'sprint-614', tasks: [task] } as Parameters<typeof prepareResultEvaluationAttempt>[0]['sprint'];
    const prepared = await prepareResultEvaluationAttempt({
      projectRoot, sprint, task, result, branch: 'main',
      config: { acceptance_enforcement: 'enforce', approval: { lifecycle } } as ResolvedConfig,
    });

    const claim = prepared.acceptanceEnforcement?.routeClaim;
    expect(claim?.lineage).toMatchObject({
      tenantId: 'tenant-canary', projectId: attendedExecutionProjectId(projectRoot),
      attemptId: 'attempt-main-1', generation: 1,
      resultDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(claim?.evaluationDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepared.evaluation).toBe(TaskEvaluation.GO_WITH_TECH_DEBT);
    const confirmationId = claim!.confirmationId;
    const memory = new MemoryStore(join(projectRoot, '.brain', 'memory.db'));
    expect(memory.getById(`debt-${confirmationId}`)).toMatchObject({ status: 'active' });
    memory.close();

    writeTaskEvaluationAudit(
      projectRoot, sprint.id, task, prepared.evaluation, prepared.rubric,
      undefined, prepared.postRubricCauses, prepared.acceptanceEnforcement,
    );
    const audit = readFileSync(
      join(projectRoot, '.deckent', 'runtime', 'evaluations', sprint.id, `${task.id}-attempt-1.json`),
      'utf8',
    );
    expect(audit).toMatch(
      /acceptance-policy:route:human:receipt=[a-f0-9]{64}:debt/u,
    );
  });

  it('keeps baseline when only confirmation is durable and returns the exact debt HOLD reference', async () => {
    const projectRoot = makeRoot();
    const { task, result, evaluation } = fixture();
    const projectId = attendedExecutionProjectId(projectRoot);
    const intent = applyAcceptanceEnforcement(
      evaluation, task, result, 'sprint-614', { acceptance_enforcement: 'enforce' },
      { tenantId: 'tenant-canary', projectId, generation: 1 },
    );
    const durable = await persistDurableAcceptanceConfirmation({
      projectRoot, sprint: { id: 'sprint-614', tasks: [task] }, task, result,
      baselineEvaluation: evaluation, enforcement: intent, requestedAt, lifecycle,
      openComposition: authority => ({
        authority,
        service: {} as AcceptanceConfirmationComposition['service'],
        reconciler: {
          reconcile: async id => ({
            state: 'HOLD', reasonCode: 'COMPOSITION_CLOSED', receiptRef: `${id}:prepared`,
          }),
        },
        createAndRoute: async route => ({
          state: 'HOLD', reasonCode: 'ROUTE_DEBT_WRITE_PENDING',
          receiptRef: `${route.confirmationId}:debt`,
        }),
        settle: async id => ({
          state: 'HOLD', reasonCode: 'COMPOSITION_CLOSED', receiptRef: `${id}:prepared`,
        }),
        close: () => undefined,
      }),
    });

    expect(durable.writeError).toBeInstanceOf(Error);
    expect(durable.confirmation?.created).toBe(true);
    expect(durable.routeResult).toEqual({
      state: 'HOLD', reasonCode: 'ROUTE_DEBT_WRITE_PENDING',
      receiptRef: `${durable.confirmation!.id}:debt`,
    });
    expect(durable.enforcement.evaluation).toBe(evaluation);
    expect(durable.enforcement.enforced).toBe(false);
    const memory = new MemoryStore(join(projectRoot, '.brain', 'memory.db'));
    expect(memory.getById(`debt-${durable.confirmation!.id}`)).toBeNull();
    memory.close();
  });
});
