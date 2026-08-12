import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ResolvedConfig } from '../../src/core/config-types.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../../src/core/provider-authority-composition.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  TaskStatus,
  createGoNoGoCriterionItem,
  type Task,
  type TaskResult,
} from '../../src/core/task-types.js';
import {
  CrossVerifyProductionIngressAuthority,
  XVERIFY_PRODUCER_ENRICHMENT_FIELDS,
  compareProducerFencedResult,
} from '../../src/orchestra/cross-verify-production-ingress-authority.js';

const TASK_ID = 'born-3323-001';

/**
 * The pre-enrichment core exactly as the producer's settlement receipt freezes
 * it. Shape taken from the archived pairs under
 * `.brain/archive/sprints/sprint-522-tasks` and `sprint-523-tasks`.
 */
function settledResult(): TaskResult {
  return {
    taskId: TASK_ID,
    workerId: `w-${TASK_ID}`,
    filesChanged: ['src/orchestra/example.ts'],
    linesAdded: 12,
    linesRemoved: 3,
    testsPassed: true,
    coverage: 0,
    selfAssessment: 'DONE',
    notes: 'bounded producer note',
    workAttribution: {
      state: 'VERIFIED',
      attemptId: '3f919bef-c540-40cb-a0ec-d869ebe1143b',
      baselineRef:
        'task-result-work-attribution-baseline:sha256:'
        + 'd099419b0ac827622d689ed4c9f605724b17598b5edbdfbf87a2822ab327163b',
      baselineSha256:
        'd099419b0ac827622d689ed4c9f605724b17598b5edbdfbf87a2822ab327163b',
      scopeDigest: 'scope:sha256:0f435f7952555f4b398cb5802168f1063c86e00a0e47b08da3531b7baad14564',
    },
  };
}

/**
 * The same result after the host re-wrote it post-settlement: token backfill,
 * cost + provider billing reconciliation, the attribution totals and the
 * advisory dist-mutation flag. Every added field is an enrichment class; not
 * one core field moved.
 */
function enrichedResult(): TaskResult {
  return {
    ...settledResult(),
    tokenUsage: {
      inputTokens: 15241,
      outputTokens: 25184,
      cacheReadTokens: 1013442,
      cacheCreationTokens: 74352,
      source: 'cli-log',
      provider: 'claude',
      model: 'claude-opus-5',
    },
    cost: {
      usd: 0,
      currency: 'USD',
      referenceUsd: 1.6862499999999996,
      billingMode: 'subscription',
      pricingSource: 'subscription-reference:provider-envelope',
      isLocal: false,
    },
    providerBilling: {
      source: 'provider-envelope',
      provider: 'claude',
      currency: 'USD',
      providerReportedUsd: 1.6862499999999996,
    },
    totalLinesAdded: 12,
    totalLinesRemoved: 3,
    distMutated: true,
  } as TaskResult;
}

function task(): Task {
  return {
    id: TASK_ID,
    title: 'Producer fencing compares the pre-enrichment core',
    description: 'Verify one bounded change',
    model: 'claude-sonnet-5',
    provider: 'claude',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'producer fencing test',
    scope: { directories: [], filesRead: ['src/orchestra/example.ts'], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: 'The pre-enrichment core matches',
      noGoCriteria: 'The core was mutated after settlement',
      techDebtAcceptable: 'none',
      items: [
        createGoNoGoCriterionItem({
          polarity: 'go',
          statement: 'The pre-enrichment core matches',
          evidenceRequirements: ['src/orchestra/example.ts'],
        }),
      ],
    },
    status: TaskStatus.DONE,
    type: 'audit',
    sprintId: 'sprint-born-3323',
  };
}

function config(): ResolvedConfig {
  return {
    cross_verify: {
      enabled: true,
      enforce_refuted: true,
      high_stakes_only: false,
      verifier_priority: ['codex'],
    },
  } as unknown as ResolvedConfig;
}

/**
 * Drive the real production ingress over a real settlement lifecycle
 * (attempt → claim → settle → close) and return the terminal composition state
 * for one evaluate-phase copy.
 */
async function composeAgainstClosedProducer(
  evaluateCopy: TaskResult,
): Promise<{ state: string; reasonCode?: string }> {
  const base = mkdtempSync(join(tmpdir(), 'deckent-born-3323-'));
  const projectRoot = join(base, 'project');
  const stateRoot = join(base, 'host-state');
  const originalDeckentHome = process.env.DECKENT_HOME;
  try {
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(stateRoot, { recursive: true });
    process.env.DECKENT_HOME = stateRoot;
    const ref = createTaskResultSettlementRefForAttempt(projectRoot, TASK_ID, randomUUID());
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: settledResult(),
    }));
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    const providerAuthority = {
      state: 'ready',
      tenantId: 'tenant-a',
      projectId: 'project-a',
      authorityEvidenceRef: 'provider-authority:test',
      service: new Proxy({}, {
        get() { throw new Error('profile authority should be the next boundary'); },
      }),
      close() {},
    } as unknown as ProviderAuthorityRuntimeServiceOpenResult;
    const ingress = new CrossVerifyProductionIngressAuthority({ providerAuthority });
    return await ingress.compose({
      projectRoot,
      task: task(),
      result: evaluateCopy,
      config: config(),
      operationClass: 'verify-implementation',
      timeoutMs: 120_000,
    }) as { state: string; reasonCode?: string };
  } finally {
    if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
    else process.env.DECKENT_HOME = originalDeckentHome;
    rmSync(base, { recursive: true, force: true });
  }
}

describe('born 3323 — producer fencing compares the pre-enrichment core', () => {
  it('accepts the real archived raw-vs-enriched shape', () => {
    expect(compareProducerFencedResult(settledResult(), enrichedResult()))
      .toEqual({ state: 'equal' });
  });

  it('accepts an enriched copy that arrived through a JSON round-trip', () => {
    const transported = JSON.parse(JSON.stringify(enrichedResult())) as unknown;
    expect(compareProducerFencedResult(
      JSON.parse(JSON.stringify(settledResult())) as unknown,
      transported,
    )).toEqual({ state: 'equal' });
  });

  it('treats an explicit undefined value as an absent field, not a divergence', () => {
    expect(compareProducerFencedResult(
      settledResult(),
      { ...enrichedResult(), agentId: undefined },
    )).toEqual({ state: 'equal' });
  });

  it.each([
    ['notes', { notes: 'ambient evaluate-time mutation' }],
    ['selfAssessment', { selfAssessment: 'NO_GO' as const }],
    ['testsPassed', { testsPassed: false }],
    ['filesChanged', { filesChanged: ['src/orchestra/example.ts', 'src/core/smuggled.ts'] }],
    ['linesAdded', { linesAdded: 999 }],
    ['coverage', { coverage: 100 }],
    ['workerId', { workerId: 'w-someone-else' }],
  ])('holds when the core field %s is tampered with', (field, patch) => {
    expect(compareProducerFencedResult(
      settledResult(),
      { ...enrichedResult(), ...patch },
    )).toEqual({ state: 'diverged', divergingFields: [field] });
  });

  it('holds when an UNKNOWN extra field is smuggled onto the evaluate copy', () => {
    expect(compareProducerFencedResult(
      settledResult(),
      { ...enrichedResult(), auditorValidation: 'APPROVED' },
    )).toEqual({ state: 'diverged', divergingFields: ['auditorValidation'] });
  });

  it('holds when an UNKNOWN field is dropped from the evaluate copy', () => {
    const settled = { ...settledResult(), exitCode: 0 } as TaskResult;
    expect(compareProducerFencedResult(settled, enrichedResult()))
      .toEqual({ state: 'diverged', divergingFields: ['exitCode'] });
  });

  it('holds when a core field is removed rather than changed', () => {
    const evaluated = enrichedResult() as Record<string, unknown>;
    delete evaluated.notes;
    expect(compareProducerFencedResult(settledResult(), evaluated))
      .toEqual({ state: 'diverged', divergingFields: ['notes'] });
  });

  it('reports every diverging core field, sorted', () => {
    expect(compareProducerFencedResult(settledResult(), {
      ...enrichedResult(),
      notes: 'rewritten',
      coverage: 100,
    })).toEqual({ state: 'diverged', divergingFields: ['coverage', 'notes'] });
  });

  it.each([null, undefined, 'a string', 42, ['array']])(
    'holds when a side is not a JSON object (%s)',
    (side) => {
      expect(compareProducerFencedResult(settledResult(), side))
        .toEqual({ state: 'diverged', divergingFields: ['<result-is-not-a-json-object>'] });
      expect(compareProducerFencedResult(side, settledResult()))
        .toEqual({ state: 'diverged', divergingFields: ['<result-is-not-a-json-object>'] });
    },
  );

  it('allowlists only host-authored enrichment — never a worker-authorable field', () => {
    expect([...XVERIFY_PRODUCER_ENRICHMENT_FIELDS].sort()).toEqual([
      'cost',
      'distMutated',
      'providerBilling',
      'tokenUsage',
      'totalLinesAdded',
      'totalLinesRemoved',
      'workAttribution',
    ]);
    for (const workerAuthorable of [
      'taskId',
      'workerId',
      'filesChanged',
      'linesAdded',
      'linesRemoved',
      'testsPassed',
      'coverage',
      'selfAssessment',
      'notes',
      'agentId',
      'skillIds',
      'feedbackLoop',
      'productionWiringEvidence',
    ]) {
      expect(XVERIFY_PRODUCER_ENRICHMENT_FIELDS as readonly string[])
        .not.toContain(workerAuthorable);
    }
  });
});

describe('born 3323 — production ingress wiring', () => {
  it('advances past the fence for the post-settlement-enriched evaluate copy', async () => {
    // Before born 3323 this returned xverify_producer_result_mismatch for every
    // healthy run — the structural inequality that produced zero in-sprint verifies.
    await expect(composeAgainstClosedProducer(enrichedResult()))
      .resolves.toMatchObject({
        state: 'hold',
        reasonCode: 'xverify_execution_profile_unavailable',
      });
  });

  it('holds the fence when a core field was mutated after settlement', async () => {
    await expect(composeAgainstClosedProducer({
      ...enrichedResult(),
      selfAssessment: 'DONE',
      notes: 'ambient evaluate-time mutation',
    })).resolves.toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_producer_result_mismatch',
    });
  });

  it('holds the fence when an UNKNOWN field is smuggled in', async () => {
    await expect(composeAgainstClosedProducer({
      ...enrichedResult(),
      auditorValidation: 'APPROVED',
    } as TaskResult)).resolves.toMatchObject({
      state: 'hold',
      reasonCode: 'xverify_producer_result_mismatch',
    });
  });
});
