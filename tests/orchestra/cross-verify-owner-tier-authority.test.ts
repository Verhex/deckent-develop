import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readCrossVerifyTaskSettlement,
  runCrossVerify,
  type MandatoryCrossVerifyInvocationComposition,
} from '../../src/orchestra/cross-verify-runner.js';
import type { CrossVerifyInvocationCoordinatorResult } from '../../src/orchestra/cross-verify-invocation-coordinator.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { CrossVerifyConfig, ResolvedConfig, Task, TaskResult } from '../../src/core/types.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';

const AUTHOR_MODEL = 'gpt-5.6-sol';
const VERIFIER_MODEL = 'claude-opus-5';
const DECISION_REF = 'owner-live-2026-08-24-opus5-xverify-accepted';
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';

let root = '';
let hostStateRoot = '';
const originalDeckentHome = process.env.DECKENT_HOME;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-xverify-owner-tier-'));
  hostStateRoot = mkdtempSync(join(tmpdir(), 'deckent-xverify-owner-tier-host-state-'));
  process.env.DECKENT_HOME = join(hostStateRoot, '.deckent');
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
});

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  rmSync(root, { recursive: true, force: true });
  rmSync(hostStateRoot, { recursive: true, force: true });
});

function authority(
  overrides: Partial<CrossVerifyConfig['verifier_tier_authority']['decisions'][number]> = {},
): NonNullable<CrossVerifyConfig['verifier_tier_authority']> {
  return {
    schema_version: 1,
    decisions: [{
      author_model: AUTHOR_MODEL,
      verifier_model: VERIFIER_MODEL,
      decision: 'allow',
      decision_ref: DECISION_REF,
      ...overrides,
    }],
  };
}

function config(input: {
  authority?: CrossVerifyConfig['verifier_tier_authority'];
  mandatory?: boolean;
} = {}): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    execution_budget: {
      roles: { auditor: { default: { maxCacheReadTokens: 100_000, maxTurns: 12 } } },
      landing: { reserve_ratio: 0.25 },
      unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker'] },
    },
    cross_verify: {
      enabled: true,
      high_stakes_only: false,
      enforce_refuted: input.mandatory ?? false,
      verifier_priority: ['claude'],
      verifier_model: { claude: VERIFIER_MODEL },
      ...(input.authority ? { verifier_tier_authority: input.authority } : {}),
    },
  } as ResolvedConfig;
}

function task(): Task {
  return {
    id: '643-owner-tier', title: 'Owner tier authority', description: 'Exact-pair verification',
    model: AUTHOR_MODEL, provider: 'codex', effort: 'high', priority: 'CRITICAL', reason: 'security',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] }, dependencies: [],
    goNogo: { goCriteria: 'verified', noGoCriteria: 'not verified', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE, sprintId: 'sprint-643',
  } as Task;
}

function result(): TaskResult {
  return {
    taskId: task().id, workerId: 'w-643-owner-tier', filesChanged: [], linesAdded: 0,
    linesRemoved: 0, testsPassed: true, coverage: 100, selfAssessment: 'DONE', notes: 'fixture',
  };
}

function writeParentResult(): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${task().id}.result`),
    `${JSON.stringify(result(), null, 2)}\n`,
    'utf8',
  );
}

function settled(calledModel = VERIFIER_MODEL): Extract<
  CrossVerifyInvocationCoordinatorResult,
  { state: 'settled' }
> {
  const verifierTaskId = `${task().id}-xverify`;
  const terminalSettlementRef = createTaskResultSettlementRefForAttempt(
    root,
    verifierTaskId,
    ATTEMPT_ID,
  );
  writeTaskResultSettlementAttemptAtomic(terminalSettlementRef);
  claimTaskResultSettlementAttemptAtomic(terminalSettlementRef);
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref: terminalSettlementRef,
    exitCode: 0,
    result: {
      ...result(),
      taskId: verifierTaskId,
      workerId: 'w-643-owner-tier-xverify',
      notes: 'VERDICT: CONFIRMED exact coordinator fixture',
    },
  }));
  writeTaskResultSettlementClosureAtomic(terminalSettlementRef, {
    containerDisposition: 'stopped-removed',
    locksReleased: true,
  });
  return {
    state: 'settled',
    output: 'VERDICT: CONFIRMED exact coordinator fixture',
    execution: {
      outcome: 'completed', initialAttemptId: ATTEMPT_ID, terminalAttemptId: ATTEMPT_ID,
      cumulativeUsage: {
        turns: 1, inputTokens: 10, outputTokens: 8, cacheReadTokens: 2,
        cacheCreationTokens: 0, totalTokens: 20, maxContextTokens: 20,
      },
    },
    invocationReceiptRef: {
      schemaVersion: 1, tenantId: 'tenant-a', projectId: 'project-a', invocationId: 'invocation-owner-tier',
    },
    providerLimitReservationId: 'reservation-owner-tier',
    providerLimitDispatchEvidenceRef: 'provider-limit-dispatch:owner-tier',
    providerLimitSettlementEvidenceRef: 'provider-limit-settlement:owner-tier',
    executionContractEvidenceRef: 'xverify-contract:owner-tier',
    outputArtifactRef: 'task-result-output:owner-tier',
    hostObservationEvidenceRef: 'xverify-host-observation:owner-tier',
    terminalSettlementRef,
    calledProvider: 'claude',
    calledModel,
  };
}

function composition(coordinatorResult: CrossVerifyInvocationCoordinatorResult) {
  const execute = vi.fn(async () => coordinatorResult);
  const composition: MandatoryCrossVerifyInvocationComposition = {
    producerProvider: 'codex',
    coordinator: { execute },
    input: {
      executionContract: {
        verifierTaskId: `${task().id}-xverify`,
        attemptId: ATTEMPT_ID,
        provider: 'claude',
      },
      projection: {
        invocationReceipt: { receipt: { invocationId: 'invocation-owner-tier' } },
      },
    } as MandatoryCrossVerifyInvocationComposition['input'],
    launcher: vi.fn() as MandatoryCrossVerifyInvocationComposition['launcher'],
  };
  return { composition, execute };
}

describe('runCrossVerify exact owner-pair tier authority', () => {
  it('keeps requested-model floor #1 fail-closed before mandatory execution without authority', async () => {
    writeParentResult();
    const exact = composition({
      state: 'hold', reasonCode: 'must-not-execute', authorityEvidenceRef: 'xverify-authority:test',
      invocationReceiptRef: null,
    });
    const run = await runCrossVerify(root, task(), result(), TaskEvaluation.DONE, config({ mandatory: true }), {
      verifierModel: VERIFIER_MODEL,
      mandatoryInvocation: exact.composition,
    });

    expect(run).toMatchObject({ outcome: 'unavailable', ran: false, blocked: true });
    expect(run.skippedReason).toContain('xverify_verifier_tier_below_author');
    expect(exact.execute).not.toHaveBeenCalled();
  });

  it('admits the requested and actual called model and binds the decision ref into terminal settlement', async () => {
    writeParentResult();
    const exact = composition(settled());
    const run = await runCrossVerify(
      root, task(), result(), TaskEvaluation.DONE,
      config({ authority: authority(), mandatory: true }),
      { verifierModel: VERIFIER_MODEL, mandatoryInvocation: exact.composition },
    );

    expect(exact.execute).toHaveBeenCalledOnce();
    expect(run).toMatchObject({
      outcome: 'confirmed', disposition: 'allow', ran: true,
      advisory: { verifierModel: VERIFIER_MODEL, authorityEvidenceRef: DECISION_REF },
      taskSettlementReceipt: { authorityEvidenceRef: DECISION_REF },
    });
    expect(run.taskSettlementReceipt?.evidenceRefs).toContain(DECISION_REF);
    expect(readCrossVerifyTaskSettlement({
      projectRoot: root,
      taskId: `${task().id}-xverify`,
      attemptId: ATTEMPT_ID,
    })).toMatchObject({
      authorityEvidenceRef: DECISION_REF,
      settlementDigest: run.taskSettlementReceipt?.settlementDigest,
    });
  });

  it('revokes the requested grant when the production composition calls a different model', async () => {
    writeParentResult();
    const exact = composition(settled('claude-sonnet-5'));
    const run = await runCrossVerify(
      root, task(), result(), TaskEvaluation.DONE,
      config({ authority: authority(), mandatory: true }),
      { verifierModel: VERIFIER_MODEL, mandatoryInvocation: exact.composition },
    );

    expect(exact.execute).toHaveBeenCalledOnce();
    expect(run).toMatchObject({ outcome: 'unavailable', ran: true, blocked: true });
    expect(run.skippedReason).toContain('xverify_verifier_tier_below_author');
    expect(run.advisory).toBeUndefined();
  });

  it('uses the same authority at resolved-model floor #3 without opening a CLI-only bypass', async () => {
    writeParentResult();
    const spawnVerifier = vi.fn(async () => 'VERDICT: CONFIRMED direct branch');
    const run = await runCrossVerify(
      root, task(), result(), TaskEvaluation.DONE,
      config({ authority: authority() }),
      { availableProviders: ['claude'], spawnVerifier },
    );

    expect(spawnVerifier).toHaveBeenCalledOnce();
    expect(run).toMatchObject({
      outcome: 'confirmed', ran: true,
      advisory: { verifierModel: VERIFIER_MODEL, authorityEvidenceRef: DECISION_REF },
    });
  });

  it('never lets malformed same-provider authority weaken the floor', async () => {
    writeParentResult();
    const spawnVerifier = vi.fn(async () => 'VERDICT: CONFIRMED must not run');
    const sameProviderAuthority = authority({ verifier_model: 'gpt-5.6-terra' });
    const run = await runCrossVerify(
      root, task(), result(), TaskEvaluation.DONE,
      config({ authority: sameProviderAuthority }),
      {
        availableProviders: ['claude'],
        verifierModel: 'gpt-5.6-terra',
        spawnVerifier,
      },
    );

    expect(run).toMatchObject({ outcome: 'unavailable', ran: false });
    expect(run.skippedReason).toContain('xverify_verifier_tier_below_author');
    expect(spawnVerifier).not.toHaveBeenCalled();
  });
});
