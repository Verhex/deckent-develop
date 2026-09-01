import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProductionWiringTaskHoldError,
  buildWorkerPrompt,
  createTask,
  plannerTaskToParams,
  type CreateTaskParams,
  type WorkerPromptCompilationSinkV2,
} from '../../src/orchestra/task-builder.js';
import {
  createProductionWiringPlanEvidence,
  TaskStatus,
  type PlannerTask,
  type ProductionWiringPlanEvidence,
} from '../../src/core/types.js';
import type {
  ProductionWiringContractV1,
  ProductionWiringEvidence,
} from '../../src/core/production-wiring-contract.js';

const authorityEvidence: ProductionWiringEvidence = {
  state: 'complete',
  basis: 'authority-record',
  evidenceRefs: ['plan:487-025:wiring-contract'],
};

const executionEvidence: ProductionWiringEvidence = {
  state: 'complete',
  basis: 'host-attested-execution',
  evidenceRefs: ['host:487-025:consumer-execution'],
};

function wiringContract(
  overrides: Partial<ProductionWiringContractV1> = {},
): ProductionWiringContractV1 {
  return {
    version: 1,
    changeKind: 'runtime-change',
    producer: { producerId: 'plan wiring contract', evidence: authorityEvidence },
    canonicalConsumer: {
      consumerId: 'buildTask',
      relationship: 'invokes-producer',
      evidence: executionEvidence,
    },
    affectedIngresses: ['structured-plan', 'AI-plan', 'RunFlow', 'Do'].map(ingressId => ({
      ingressId,
      kind: 'ingress' as const,
      evidence: executionEvidence,
    })),
    enablementAuthority: {
      authorityId: 'production mutation classification',
      mechanism: 'policy',
      evidence: authorityEvidence,
    },
    disposition: { kind: 'production-wiring' },
    proofTargets: [{
      proofTargetId: 'production-wiring-task-builder',
      kind: 'consumer-execution',
      evidence: executionEvidence,
    }],
    ...overrides,
  };
}

function params(productionWiring?: ProductionWiringPlanEvidence): CreateTaskParams {
  return {
    title: 'Wire production mutation',
    description: 'Explicit contract test',
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'HIGH',
    reason: 'production wiring',
    scope: {
      directories: ['src/orchestra/'],
      filesRead: [],
      filesWrite: ['src/orchestra/task-builder.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'wired', noGoCriteria: 'not wired', techDebtAcceptable: '' },
    sprintId: 'sprint-487',
    productionWiring,
  };
}

describe('production wiring task-builder authority', () => {
  it('binds a complete explicit contract at the common task creation boundary', () => {
    const authority = createProductionWiringPlanEvidence(wiringContract());

    const task = createTask(params(authority), 25);

    expect(task.productionWiring).toEqual(authority);
    expect(task.productionWiring?.contract.canonicalConsumer.consumerId).toBe('buildTask');
    expect(task.productionWiring?.contract.affectedIngresses.map(entry => entry.ingressId)).toEqual([
      'structured-plan',
      'AI-plan',
      'RunFlow',
      'Do',
    ]);
  });

  it('returns typed HOLD evidence when the declared consumer scope is impossible', () => {
    const authority = createProductionWiringPlanEvidence(wiringContract({
      canonicalConsumer: {
        consumerId: 'buildTask',
        relationship: 'invokes-producer',
        evidence: {
          state: 'unsupported',
          reasonCode: 'capability-unavailable',
          evidenceRefs: ['scope-review:consumer-unavailable'],
        },
      },
    }));

    expect(() => createTask(params(authority), 25)).toThrowError(ProductionWiringTaskHoldError);
    try {
      createTask(params(authority), 25);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ProductionWiringTaskHoldError);
      if (!(error instanceof ProductionWiringTaskHoldError)) throw error;
      expect(error.decision).toMatchObject({
        decision: 'unsupported',
        disposition: 'hold',
        outerSettlement: 'blocked',
      });
    }
  });

  it('rejects a mutated contract whose digest still claims the reviewed plan', () => {
    const authority = createProductionWiringPlanEvidence(wiringContract());
    const tampered = {
      ...authority,
      contract: wiringContract({
        canonicalConsumer: {
          consumerId: 'filename-inferred-consumer',
          relationship: 'invokes-producer',
          evidence: executionEvidence,
        },
      }),
    };

    expect(() => createTask(params(tampered), 25)).toThrowError(
      expect.objectContaining({ code: 'E_PRODUCTION_WIRING_DIGEST_MISMATCH' }),
    );
  });

  it('accepts foundation work only with exact same-DAG closure IDs and barrier', () => {
    const closureTaskIds = ['487-025', '487-026', '487-027', '487-028', '487-029'];
    const authority = createProductionWiringPlanEvidence(wiringContract({
      changeKind: 'foundation',
      disposition: {
        kind: 'staged-foundation',
        foundationTaskId: '487-024',
        dagId: 'sprint-487',
        closureTasks: closureTaskIds.map(taskId => ({ taskId, dagId: 'sprint-487' })),
        outerSettlementBarrier: {
          kind: 'block-until-exact-closure-settles',
          dagId: 'sprint-487',
          closureTaskIds,
        },
      },
    }));

    const task = createTask(params(authority), 24);

    expect(task.productionWiring?.contract.disposition).toMatchObject({
      kind: 'staged-foundation',
      closureTasks: closureTaskIds.map(taskId => ({ taskId, dagId: 'sprint-487' })),
    });
  });

  it('threads AI planner authority without deriving a consumer from task filenames', () => {
    const productionWiring = createProductionWiringPlanEvidence(wiringContract());
    const plannerTask: PlannerTask & { productionWiring: ProductionWiringPlanEvidence } = {
      ...params(),
      productionWiring,
    };

    const converted = plannerTaskToParams(plannerTask, 'sprint-487', 'gpt-5.6-sol', TaskStatus.DRAFT);

    expect(converted.productionWiring).toBe(productionWiring);
    expect(converted.productionWiring?.contract.canonicalConsumer.consumerId).toBe('buildTask');
  });

  it('preserves legacy non-production tasks without silently manufacturing wiring authority', () => {
    const task = createTask(params(), 30);

    expect(task).not.toHaveProperty('productionWiring', expect.anything());
  });

  it('compiles the exact prompt entirely in memory before public admission', () => {
    const root = mkdtempSync(join(tmpdir(), 'task-builder-exact-'));
    try {
      mkdirSync(join(root, '.tasks'), { recursive: true });
      const sourceTask = createTask(params(), 31);
      const compileTask = structuredClone(sourceTask);
      const sink: WorkerPromptCompilationSinkV2 = {};

      const prompt = buildWorkerPrompt(
        compileTask,
        undefined,
        [],
        root,
        undefined,
        undefined,
        undefined,
        'docker',
        {
          publicationMode: 'deferred',
          dependencyIds: [],
          dependencyResults: new Map(),
          sink,
        },
      );

      expect(sink.artifact).toMatchObject({ prompt });
      expect(sink.artifact?.segments.length).toBeGreaterThan(0);
      expect(sink.receipt).toMatchObject({
        taskId: sourceTask.id,
        promptCompilePlanId: sink.artifact?.planId,
      });
      expect(sourceTask).not.toHaveProperty('promptCompilePlanId');
      expect(compileTask.promptCompilePlanId).toBe(sink.artifact?.planId);
      expect(existsSync(join(root, '.tasks', `task-${sourceTask.id}.skill-delivery.json`)))
        .toBe(false);
      expect(existsSync(join(root, '.deckent', 'runtime', 'prompt-lint.jsonl')))
        .toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
