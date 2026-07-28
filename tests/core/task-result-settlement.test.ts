import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createCrossVerifyEnforcedAttemptContract,
  type CrossVerifyEnforcedAttemptContractInputV1,
} from '../../src/core/cross-verify-execution-contract.js';
import { DeckentError } from '../../src/core/errors.js';
import {
  assertTaskResultSettlementRef,
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  dockerAttemptLabels,
  dockerContainerNameForTask,
  inspectTaskResultSettlementAuthority,
  listPendingTaskResultSettlementAttempts,
  readTaskProviderActualCallReceipt,
  readTaskProviderTerminalBillingReceipt,
  readTaskProviderTerminalUsageReceipt,
  readClosedTaskResultSettlement,
  readLatestTaskResultSettlementRef,
  readTaskResultSettlementActiveClaim,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementExecutionBudgetAuthority,
  readTaskResultSettlementExecutionContract,
  readTaskResultSettlementPrepared,
  readTaskResultSettlementPrompt,
  readTaskResultSettlement,
  taskResultSettlementAttemptPath,
  taskResultSettlementClaimPath,
  taskResultSettlementClosurePath,
  taskResultSettlementExecutionBudgetAuthorityPath,
  taskResultSettlementExecutionContractPath,
  taskResultSettlementPreparedPath,
  taskResultSettlementPromptEvidenceRef,
  taskResultSettlementPromptMetadataPath,
  taskResultSettlementPromptPath,
  taskResultSettlementPath,
  taskProviderActualCallEvidenceRef,
  taskProviderActualCallReceiptPath,
  taskProviderTerminalBillingEvidenceRef,
  taskProviderTerminalBillingReceiptPath,
  taskProviderTerminalUsageEvidenceRef,
  taskProviderTerminalUsageReceiptPath,
  writeTaskProviderActualCallReceiptAtomic,
  writeTaskProviderTerminalBillingReceiptAtomic,
  writeTaskProviderTerminalUsageReceiptAtomic,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementExecutionBudgetAuthorityAtomic,
  writeTaskResultSettlementExecutionContractAtomic,
  writeTaskResultSettlementPreparedAtomic,
  writeTaskResultSettlementPromptAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  readTaskResultSettlementLandedRetirement,
  taskResultSettlementLandedRetirementPath,
} from '../../src/core/task-result-settlement.js';
import {
  createExecutionLandingCheckpoint,
  executionAttemptRetirementPath,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
} from '../../src/core/execution-landing-checkpoint.js';

const roots: string[] = [];
const originalDeckentHome = process.env.DECKENT_HOME;

function fixture(): { root: string; state: string } {
  const base = mkdtempSync(join(tmpdir(), 'deckent-settlement-'));
  roots.push(base);
  const root = join(base, 'project');
  const state = join(base, 'host-state');
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  process.env.DECKENT_HOME = state;
  return { root, state };
}

function landingInput(
  taskId: string,
  attemptId: string,
): CreateExecutionLandingCheckpointInput {
  return {
    taskId,
    attemptId,
    tenantId: 'tenant-a',
    originalRequestDigest: '1'.repeat(64),
    taskDigest: '2'.repeat(64),
    role: 'worker',
    kind: 'code-development',
    admissionMode: 'unattended',
    identity: {
      configuredProvider: 'anthropic',
      configuredModel: 'claude-fable-5',
      requestedProvider: 'anthropic',
      requestedModel: 'claude-fable-5',
      resolvedProvider: 'anthropic',
      resolvedModel: 'claude-fable-5',
      calledProvider: 'anthropic',
      calledModel: 'claude-fable-5',
      backend: 'docker',
      auth: 'subscription',
      fallbackReason: null,
    },
    policyDigest: '3'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    hardBudget: { maxTokens: 1_000, maxCacheReadTokens: 800 },
    cumulativeUsage: {
      turns: 2,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 500,
      cacheCreationTokens: 50,
      totalTokens: 700,
      maxContextTokens: 650,
    },
    attemptFence: 'fence-parent',
    providerSequence: {
      firstSequence: 1,
      lastSequence: 4,
      eventCount: 4,
      eventDigest: '4'.repeat(64),
    },
    semanticState: {
      summary: 'The attempt reached its owner-authored landing threshold.',
      completedWork: ['Checkpoint authority implemented.'],
      remainingWork: ['Continue from the immutable checkpoint.'],
      nextAction: 'Claim the continuation attempt.',
      unresolvedRisks: [],
    },
    scope: {
      filesRead: ['src/core/task-result-settlement.ts'],
      filesWrite: ['src/core/task-result-settlement.ts'],
    },
    diskDiffRefs: [`disk-diff:sha256:${'5'.repeat(64)}`],
    evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
    acceptanceCriteria: 'The next same-task attempt must cite this retirement authority.',
    landingRequestedAt: '2026-07-23T18:00:00.000Z',
    landedAt: '2026-07-23T18:00:01.000Z',
  };
}

function xverifyContractInput(
  ref: ReturnType<typeof createTaskResultSettlementRef>,
): CrossVerifyEnforcedAttemptContractInputV1 {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    runId: 'run-a',
    taskId: 'task-author',
    verifierTaskId: ref.taskId,
    callId: 'call-a',
    attemptId: ref.attemptId,
    fenceTokenHash: '1'.repeat(64),
    operationClass: 'verify-implementation',
    basePromptSha256: '2'.repeat(64),
    dispatchedPromptSha256: '3'.repeat(64),
    taskSnapshotSha256: '4'.repeat(64),
    budget: { maxTurns: 3 },
    budgetFingerprint: '5'.repeat(64),
    budgetProfileRef: 'execution-budget:xverify-test',
    budgetPolicyDigest: '6'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25 },
    attendanceMode: 'unattended',
    provider: 'claude',
    model: 'claude-fable-5',
    authMode: 'subscription',
    accountRefHash: '7'.repeat(64),
    transport: 'cli',
    executionBackend: 'docker',
    endpointRefHash: null,
    executionProfileRef: 'execution-profile:xverify-test',
    providerLimitEstimates: [{
      windowId: 'tokens-all',
      unit: 'tokens',
      amount: 100,
    }],
    timeoutMs: 120_000,
    modelEffort: 'low',
    toolProfileDigest: '8'.repeat(64),
    isolatedContext: true,
    settlementAttemptRef: ref,
  };
}

afterEach(() => {
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('host-authoritative Docker TaskResult settlement', () => {
  it('provides a deterministic read-only backend authority inspection', () => {
    const { root } = fixture();
    const absent = inspectTaskResultSettlementAuthority(root, 'task-probe');
    expect(absent).toMatchObject({ state: 'absent' });
    expect(absent.evidenceRef).toMatch(
      /^task-result-settlement:absent:sha256:[a-f0-9]{64}$/u,
    );

    const ref = createTaskResultSettlementRef(root, 'task-probe');
    writeTaskResultSettlementAttemptAtomic(ref, '2026-07-27T12:00:00.000Z');
    const pending = inspectTaskResultSettlementAuthority(root, 'task-probe');
    expect(pending).toMatchObject({
      state: 'pending',
      ref,
    });
    expect(pending.evidenceRef).toMatch(
      /^task-result-settlement:pending:sha256:[a-f0-9]{64}$/u,
    );
  });

  it('publishes one private content-addressed prompt outside the worker project', () => {
    const { root, state } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-prompt');
    writeTaskResultSettlementAttemptAtomic(ref, '2026-07-25T01:00:00.000Z');

    const first = writeTaskResultSettlementPromptAtomic(
      ref,
      'exact verifier prompt\n',
      '2026-07-25T01:00:01.000Z',
    );
    const replay = writeTaskResultSettlementPromptAtomic(
      ref,
      'exact verifier prompt\n',
      '2026-07-25T01:00:02.000Z',
    );

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      ...ref,
      state: 'prompt-prepared',
      preparedAt: '2026-07-25T01:00:01.000Z',
      byteLength: Buffer.byteLength('exact verifier prompt\n'),
    });
    expect(first.promptSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(taskResultSettlementPromptPath(ref)).toContain(state);
    expect(taskResultSettlementPromptPath(ref)).not.toContain(root);
    expect(taskResultSettlementPromptMetadataPath(ref)).toContain(state);
    if (process.platform !== 'win32') {
      expect(statSync(taskResultSettlementPromptPath(ref)).mode & 0o077).toBe(0);
      expect(statSync(taskResultSettlementPromptMetadataPath(ref)).mode & 0o077).toBe(0);
    }
    expect(readFileSync(taskResultSettlementPromptPath(ref), 'utf-8'))
      .toBe('exact verifier prompt\n');
    expect(readTaskResultSettlementPrompt(ref)).toEqual(first);
    expect(taskResultSettlementPromptEvidenceRef(first))
      .toMatch(/^task-result-prompt:[a-f0-9]{64}$/u);
  });

  it('fails prompt overwrite and detects byte or permission drift on read', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-prompt-conflict');
    writeTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementPromptAtomic(ref, 'first immutable prompt');

    expect(() => writeTaskResultSettlementPromptAtomic(ref, 'substituted prompt'))
      .toThrow(/Conflicting immutable/);
    expect(readFileSync(taskResultSettlementPromptPath(ref), 'utf-8'))
      .toBe('first immutable prompt');

    writeFileSync(taskResultSettlementPromptPath(ref), 'tampered prompt', 'utf-8');
    expect(readTaskResultSettlementPrompt(ref)).toBeNull();
    writeFileSync(taskResultSettlementPromptPath(ref), 'first immutable prompt', 'utf-8');
    if (process.platform !== 'win32') {
      chmodSync(taskResultSettlementPromptPath(ref), 0o644);
      expect(readTaskResultSettlementPrompt(ref)).toBeNull();
      chmodSync(taskResultSettlementPromptPath(ref), 0o600);
      chmodSync(taskResultSettlementPromptMetadataPath(ref), 0o644);
      expect(readTaskResultSettlementPrompt(ref)).toBeNull();
    }
  });

  it('publishes one private content-addressed execution contract and rejects drift', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-contract');
    writeTaskResultSettlementAttemptAtomic(ref);
    const contract = createCrossVerifyEnforcedAttemptContract(xverifyContractInput(ref));

    const first = writeTaskResultSettlementExecutionContractAtomic(ref, contract);
    const replay = writeTaskResultSettlementExecutionContractAtomic(ref, contract);

    expect(replay).toEqual(first);
    const persisted = readTaskResultSettlementExecutionContract(ref);
    expect(persisted).toEqual(contract);
    expect(Object.isFrozen(persisted)).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(taskResultSettlementExecutionContractPath(ref)).mode & 0o077).toBe(0);
    }

    const drifted = createCrossVerifyEnforcedAttemptContract({
      ...xverifyContractInput(ref),
      timeoutMs: 121_000,
    });
    expect(() => writeTaskResultSettlementExecutionContractAtomic(ref, drifted))
      .toThrow(/Conflicting immutable/);
    if (process.platform !== 'win32') {
      chmodSync(taskResultSettlementExecutionContractPath(ref), 0o644);
      expect(readTaskResultSettlementExecutionContract(ref)).toBeNull();
    }
  });

  it('persists immutable host-owned execution budget authority for restart recovery', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-budget-authority');
    writeTaskResultSettlementAttemptAtomic(ref);

    const input = {
      model: 'claude-fable-5',
      budget: { maxTurns: 4, maxCacheReadTokens: 250_000 },
      landingPolicy: { reserve_ratio: 0.25 },
      admissionMode: 'unattended' as const,
      writtenAt: '2026-07-25T06:00:00.000Z',
    };
    const first = writeTaskResultSettlementExecutionBudgetAuthorityAtomic(ref, input);
    const replay = writeTaskResultSettlementExecutionBudgetAuthorityAtomic(ref, input);

    expect(replay).toEqual(first);
    expect(readTaskResultSettlementExecutionBudgetAuthority(ref)).toEqual(first);
    expect(first.evidenceRef).toMatch(/^docker-execution-budget:sha256:[a-f0-9]{64}$/);
    expect(taskResultSettlementExecutionBudgetAuthorityPath(ref)).not.toContain(root);
    if (process.platform !== 'win32') {
      expect(
        statSync(taskResultSettlementExecutionBudgetAuthorityPath(ref)).mode & 0o077,
      ).toBe(0);
    }

    expect(() => writeTaskResultSettlementExecutionBudgetAuthorityAtomic(ref, {
      ...input,
      budget: { maxTurns: 5, maxCacheReadTokens: 250_000 },
    })).toThrow(/Conflicting immutable/);

    const path = taskResultSettlementExecutionBudgetAuthorityPath(ref);
    const tampered = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    tampered.model = 'gpt-5.6-sol';
    writeFileSync(path, JSON.stringify(tampered), 'utf-8');
    expect(readTaskResultSettlementExecutionBudgetAuthority(ref)).toBeNull();
  });

  it('derives immutable actual-call and terminal-usage receipts from exact host evidence', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-observation');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const contract = createCrossVerifyEnforcedAttemptContract(xverifyContractInput(ref));
    writeTaskResultSettlementExecutionContractAtomic(ref, contract);
    const billing = {
      source: 'provider-envelope' as const,
      provider: 'claude',
      currency: 'USD' as const,
      providerReportedUsd: 0.125,
      modelUsage: {
        'claude-fable-5': {
          inputTokens: 4,
          outputTokens: 100,
          cacheReadTokens: 20,
          cacheCreationTokens: 10,
          costUsd: 0.12,
        },
        'claude-haiku-4-5-20251001': {
          inputTokens: 5,
          outputTokens: 1,
          costUsd: 0.005,
        },
      },
      capturedAt: '2026-07-25T02:00:00.000Z',
    };
    writeTaskProviderTerminalBillingReceiptAtomic(ref, billing, '9'.repeat(64));

    const actualCall = writeTaskProviderActualCallReceiptAtomic(ref);
    const usage = writeTaskProviderTerminalUsageReceiptAtomic(ref, {
      version: 2,
      projectId: ref.projectRootSha256,
      taskId: ref.taskId,
      attemptId: ref.attemptId,
      budgetFingerprint: contract.budgetFingerprint,
      backend: 'docker',
      terminal: true,
      decision: {
        state: 'within-budget',
        counters: {
          turns: 2,
          inputTokens: 4,
          outputTokens: 100,
          cacheReadTokens: 20,
          cacheCreationTokens: 10,
          totalTokens: 134,
          maxContextTokens: 120,
        },
      },
      updatedAt: '2026-07-25T02:00:01.000Z',
    });

    expect(writeTaskProviderActualCallReceiptAtomic(ref)).toEqual(actualCall);
    expect(readTaskProviderActualCallReceipt(ref)).toEqual(actualCall);
    expect(actualCall).toMatchObject({
      provider: contract.provider,
      model: contract.model,
      executionBackend: 'docker',
      executionContractEvidenceRef: contract.evidenceRef,
    });
    expect(taskProviderActualCallEvidenceRef(actualCall))
      .toMatch(/^provider-actual-call:sha256:[a-f0-9]{64}$/u);
    expect(readTaskProviderTerminalUsageReceipt(ref)).toEqual(usage);
    expect(taskProviderTerminalUsageEvidenceRef(usage))
      .toMatch(/^provider-terminal-usage:sha256:[a-f0-9]{64}$/u);
    if (process.platform !== 'win32') {
      expect(statSync(taskProviderActualCallReceiptPath(ref)).mode & 0o077).toBe(0);
      expect(statSync(taskProviderTerminalUsageReceiptPath(ref)).mode & 0o077).toBe(0);
    }

    writeFileSync(taskProviderActualCallReceiptPath(ref), '{}', 'utf-8');
    expect(readTaskProviderActualCallReceipt(ref)).toBeNull();
  });

  it('refuses actual-call evidence when the exact contract model is absent from the envelope', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-call-missing');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementExecutionContractAtomic(
      ref,
      createCrossVerifyEnforcedAttemptContract(xverifyContractInput(ref)),
    );
    writeTaskProviderTerminalBillingReceiptAtomic(ref, {
      source: 'provider-envelope',
      provider: 'claude',
      currency: 'USD',
      providerReportedUsd: 0.01,
      modelUsage: {
        'claude-haiku-4-5-20251001': {
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0.01,
        },
      },
      capturedAt: '2026-07-25T02:01:00.000Z',
    }, 'a'.repeat(64));

    expect(() => writeTaskProviderActualCallReceiptAtomic(ref))
      .toThrow(/positive exact-model provider envelope/i);
    expect(readTaskProviderActualCallReceipt(ref)).toBeNull();
  });

  it('persists an exact pending attempt before publishing an immutable embedded result', () => {
    const { root, state } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-a');
    writeTaskResultSettlementAttemptAtomic(ref, '2026-07-22T00:00:00.000Z');
    writeTaskResultSettlementAttemptAtomic(ref, '2026-07-22T00:00:01.000Z');

    expect(taskResultSettlementAttemptPath(ref)).toContain(state);
    expect(JSON.parse(readFileSync(taskResultSettlementAttemptPath(ref), 'utf-8'))).toMatchObject({
      ...ref,
      state: 'pending',
      createdAt: '2026-07-22T00:00:00.000Z',
    });

    const result = { taskId: 'task-a', selfAssessment: 'NO_GO', testsPassed: false };
    const first = createTaskResultSettlement({
      ref,
      exitCode: 137,
      result,
      settledAt: '2026-07-22T00:01:00.000Z',
    });
    writeTaskResultSettlementAtomic(first);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 137,
      result,
      settledAt: '2026-07-22T00:02:00.000Z',
    }));

    expect(readTaskResultSettlement(ref)).toMatchObject({
      ...ref,
      state: 'settled',
      exitCode: 137,
      result,
    });
    expect(() => writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: { ...result, selfAssessment: 'DONE' },
    }))).toThrow(/Conflicting immutable/);
  });

  it('rejects wrong-task, forged-path and cross-project authorities', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const ref = createTaskResultSettlementRef(root, 'task-a');

    expect(() => createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: { taskId: 'task-b', selfAssessment: 'DONE' },
    })).toThrow(/does not match/);
    expect(() => assertTaskResultSettlementRef(otherRoot, 'task-a', ref)).toThrow(/authority/);
    expect(() => taskResultSettlementPath({ ...ref, attemptId: '../../escape' })).toThrow(/Invalid/);
  });

  it('fails closed when host state resolves inside the worker-mounted project', () => {
    const { root } = fixture();
    process.env.DECKENT_HOME = join(root, '.deckent-host');
    expect(() => createTaskResultSettlementRef(root, 'task-a')).toThrow(/outside/);

    const link = join(root, '..', 'state-link');
    symlinkSync(root, link, 'dir');
    process.env.DECKENT_HOME = link;
    expect(() => createTaskResultSettlementRef(root, 'task-b')).toThrow(/outside/);
  });

  it('detects embedded-result tampering instead of trusting outer metadata', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-a');
    writeTaskResultSettlementAttemptAtomic(ref);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref,
      exitCode: 0,
      result: { taskId: 'task-a', selfAssessment: 'DONE' },
    }));
    const path = taskResultSettlementPath(ref);
    const tampered = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
    tampered.result = { taskId: 'task-a', selfAssessment: 'NO_GO' };
    writeFileSync(path, JSON.stringify(tampered), 'utf-8');
    expect(readTaskResultSettlement(ref)).toBeNull();
    expect(() => readClosedTaskResultSettlement(ref))
      .toThrow(/Corrupt host-owned Docker result settlement/);
  });

  it('exposes a product result only after a matching lifecycle closure', () => {
    const { root } = fixture();
    const pending = createTaskResultSettlementRef(root, 'task-pending-closure');
    writeTaskResultSettlementAttemptAtomic(pending);
    claimTaskResultSettlementAttemptAtomic(pending);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: pending,
      exitCode: 0,
      result: { taskId: pending.taskId, selfAssessment: 'DONE' },
    }));
    expect(readClosedTaskResultSettlement(pending)).toBeNull();

    writeTaskResultSettlementClosureAtomic(pending, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(readClosedTaskResultSettlement(pending)).toMatchObject({
      ...pending,
      state: 'settled',
      result: { taskId: pending.taskId, selfAssessment: 'DONE' },
    });
  });

  it('fails loudly on existing corrupt or digest-mismatched closure evidence', () => {
    const { root } = fixture();
    const dangling = createTaskResultSettlementRef(root, 'task-dangling-closure');
    writeTaskResultSettlementAttemptAtomic(dangling);
    writeFileSync(taskResultSettlementClosurePath(dangling), '{}', 'utf-8');
    expect(() => readClosedTaskResultSettlement(dangling))
      .toThrow(/closure without receipt/);

    const corrupt = createTaskResultSettlementRef(root, 'task-corrupt-closure');
    writeTaskResultSettlementAttemptAtomic(corrupt);
    claimTaskResultSettlementAttemptAtomic(corrupt);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: corrupt,
      exitCode: 1,
      result: { taskId: corrupt.taskId, selfAssessment: 'NO_GO' },
    }));
    writeFileSync(taskResultSettlementClosurePath(corrupt), '{}', 'utf-8');
    expect(() => readClosedTaskResultSettlement(corrupt))
      .toThrow(/Corrupt Docker result settlement closure/);

    const mismatched = createTaskResultSettlementRef(root, 'task-mismatched-closure');
    writeTaskResultSettlementAttemptAtomic(mismatched);
    claimTaskResultSettlementAttemptAtomic(mismatched);
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: mismatched,
      exitCode: 0,
      result: { taskId: mismatched.taskId, selfAssessment: 'DONE' },
    }));
    writeTaskResultSettlementClosureAtomic(mismatched, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    const receiptPath = taskResultSettlementPath(mismatched);
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf-8')) as Record<string, unknown>;
    receipt.settledAt = `${String(receipt.settledAt)}-tampered`;
    writeFileSync(receiptPath, JSON.stringify(receipt), 'utf-8');
    expect(() => readClosedTaskResultSettlement(mismatched))
      .toThrow(/Corrupt Docker result settlement closure/);
  });

  it('derives daemon-global names and labels from project, task and attempt authority', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const ref = createTaskResultSettlementRef(root, 'same-task');

    expect(dockerContainerNameForTask(root, 'same-task')).toMatch(/^deckent-w-[a-f0-9]{12}-[a-f0-9]{16}$/);
    expect(dockerContainerNameForTask(otherRoot, 'same-task')).not.toBe(
      dockerContainerNameForTask(root, 'same-task'),
    );
    expect(dockerAttemptLabels(ref)).toEqual({
      'io.deckent.managed': 'true',
      'io.deckent.project': ref.projectRootSha256,
      'io.deckent.task': expect.stringMatching(/^[a-f0-9]{64}$/),
      'io.deckent.attempt': ref.attemptId,
    });
  });

  it('serializes same-task attempts through an append-only settlement/closure claim chain', () => {
    const { root } = fixture();
    const first = createTaskResultSettlementRef(root, 'task-chain');
    const second = createTaskResultSettlementRef(root, 'task-chain');
    writeTaskResultSettlementAttemptAtomic(first, '2026-07-22T00:00:00.000Z');
    writeTaskResultSettlementAttemptAtomic(second, '2026-07-22T00:00:01.000Z');

    claimTaskResultSettlementAttemptAtomic(first, '2026-07-22T00:00:02.000Z');
    claimTaskResultSettlementAttemptAtomic(first, '2026-07-22T00:00:03.000Z');
    expect(readTaskResultSettlementActiveClaim(first)).toMatchObject(first);
    expect(() => claimTaskResultSettlementAttemptAtomic(second)).toThrow(/Conflicting active/);

    writeTaskResultSettlementPreparedAtomic(first, 'claude-fable-5');
    writeTaskResultSettlementDispatchAtomic(first, 'a'.repeat(64));
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: first,
      exitCode: 0,
      result: { taskId: first.taskId, selfAssessment: 'DONE' },
    }));
    expect(() => claimTaskResultSettlementAttemptAtomic(second)).toThrow(/Conflicting active/);
    writeTaskResultSettlementClosureAtomic(first, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });

    expect(readTaskResultSettlementActiveClaim(first)).toBeNull();
    claimTaskResultSettlementAttemptAtomic(first);
    expect(readTaskResultSettlementActiveClaim(first)).toBeNull();
    expect(() => listPendingTaskResultSettlementAttempts(root)).not.toThrow();
    claimTaskResultSettlementAttemptAtomic(second);
    expect(readTaskResultSettlementActiveClaim(second)).toMatchObject(second);
    expect(readTaskResultSettlementClosure(first)).toMatchObject({
      state: 'closed',
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
  });

  it('resolves the active or latest closed project/task authority without in-memory state', () => {
    const { root } = fixture();
    const first = createTaskResultSettlementRef(root, 'task-latest');
    writeTaskResultSettlementAttemptAtomic(first);
    claimTaskResultSettlementAttemptAtomic(first);
    writeTaskResultSettlementPreparedAtomic(first, 'claude-fable-5');

    expect(readLatestTaskResultSettlementRef(root, 'task-latest')).toEqual(first);

    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: first,
      exitCode: 0,
      result: { taskId: first.taskId, selfAssessment: 'DONE' },
    }));
    writeTaskResultSettlementClosureAtomic(first, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    expect(readLatestTaskResultSettlementRef(root, 'task-latest')).toEqual(first);

    const second = createTaskResultSettlementRef(root, 'task-latest');
    writeTaskResultSettlementAttemptAtomic(second);
    claimTaskResultSettlementAttemptAtomic(second);
    writeTaskResultSettlementPreparedAtomic(second, 'gpt-5.6-sol');
    expect(readLatestTaskResultSettlementRef(root, 'task-latest')).toEqual(second);
  });

  it('keeps latest-authority lookup project-scoped and fails loud on corrupt chain evidence', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const ref = createTaskResultSettlementRef(root, 'task-corrupt-latest');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);

    expect(readLatestTaskResultSettlementRef(otherRoot, ref.taskId)).toBeNull();

    const claimPath = taskResultSettlementClaimPath(ref);
    const corrupt = JSON.parse(readFileSync(claimPath, 'utf-8')) as Record<string, unknown>;
    corrupt.projectRootSha256 = 'f'.repeat(64);
    writeFileSync(claimPath, JSON.stringify(corrupt), 'utf-8');
    expect(() => readLatestTaskResultSettlementRef(root, ref.taskId)).toThrow(/Corrupt Docker result settlement claim chain/);
  });

  it('rejects a claim whose durable attempt evidence is missing or corrupt', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-missing-attempt');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    writeFileSync(taskResultSettlementAttemptPath(ref), '{}', 'utf-8');

    expect(() => readLatestTaskResultSettlementRef(root, ref.taskId))
      .toThrow(/Corrupt Docker result settlement authority/);
  });

  it('requires a durable attempt before claim and binds dispatch to immutable prepared metadata', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-dispatch');
    expect(() => claimTaskResultSettlementAttemptAtomic(ref)).toThrow(/no matching durable pending attempt/);

    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const prepared = writeTaskResultSettlementPreparedAtomic(ref, 'gpt-5.6-sol');
    const dispatch = writeTaskResultSettlementDispatchAtomic(ref, 'b'.repeat(64));
    expect(readTaskResultSettlementPrepared(ref)).toEqual(prepared);
    expect(readTaskResultSettlementDispatch(ref)).toEqual(dispatch);
    expect(dispatch.preparedSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(() => writeTaskResultSettlementDispatchAtomic(ref, 'c'.repeat(64))).toThrow(/Conflicting immutable/);

    const tampered = JSON.parse(readFileSync(taskResultSettlementPreparedPath(ref), 'utf-8')) as Record<string, unknown>;
    tampered.model = 'claude-fable-5';
    writeFileSync(taskResultSettlementPreparedPath(ref), JSON.stringify(tampered), 'utf-8');
    expect(readTaskResultSettlementDispatch(ref)).toBeNull();
  });

  it('persists exact-attempt terminal provider billing outside the project with first-writer authority', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-terminal-billing');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const billing = {
      source: 'provider-envelope' as const,
      provider: 'claude',
      currency: 'USD' as const,
      providerReportedUsd: 0.25,
      modelUsage: {
        'claude-fable-5': {
          inputTokens: 2,
          outputTokens: 3,
          cacheReadTokens: 5,
          cacheCreationTokens: 7,
          costUsd: 0.25,
        },
      },
      capturedAt: '2026-07-24T02:00:00.000Z',
    };
    const receipt = writeTaskProviderTerminalBillingReceiptAtomic(
      ref,
      billing,
      'a'.repeat(64),
    );

    expect(readTaskProviderTerminalBillingReceipt(ref)).toEqual(receipt);
    expect(taskProviderTerminalBillingEvidenceRef(receipt))
      .toMatch(/^provider-terminal-receipt:sha256:[a-f0-9]{64}$/);
    try {
      taskProviderTerminalBillingEvidenceRef({} as typeof receipt);
      expect.unreachable('invalid terminal billing evidence must fail closed');
    } catch (error) {
      expect(error).toBeInstanceOf(DeckentError);
      expect((error as DeckentError).code).toBe('DECKENT_E079');
    }
    expect(taskProviderTerminalBillingReceiptPath(ref)).not.toContain(root);

    expect(writeTaskProviderTerminalBillingReceiptAtomic(
      ref,
      billing,
      'a'.repeat(64),
    )).toEqual(receipt);
    expect(() => writeTaskProviderTerminalBillingReceiptAtomic(
      ref,
      { ...billing, providerReportedUsd: 0.5 },
      'b'.repeat(64),
    )).toThrow(/Conflicting immutable/);

    const tampered = JSON.parse(
      readFileSync(taskProviderTerminalBillingReceiptPath(ref), 'utf-8'),
    ) as Record<string, unknown>;
    (tampered.billing as Record<string, unknown>).providerReportedUsd = 10;
    writeFileSync(
      taskProviderTerminalBillingReceiptPath(ref),
      JSON.stringify(tampered),
      'utf-8',
    );
    expect(readTaskProviderTerminalBillingReceipt(ref)).toBeNull();
  });

  it('enumerates only project-scoped lifecycle-pending attempts and fails loud on corrupt records', () => {
    const { root } = fixture();
    const otherRoot = join(root, '..', 'other-project');
    mkdirSync(otherRoot, { recursive: true });
    const active = createTaskResultSettlementRef(root, 'task-active');
    const other = createTaskResultSettlementRef(otherRoot, 'task-other');
    writeTaskResultSettlementAttemptAtomic(active, '2026-07-22T00:00:00.000Z');
    writeTaskResultSettlementAttemptAtomic(other, '2026-07-22T00:00:01.000Z');
    claimTaskResultSettlementAttemptAtomic(active);
    writeTaskResultSettlementPreparedAtomic(active, 'claude-fable-5');

    expect(listPendingTaskResultSettlementAttempts(root)).toEqual([
      expect.objectContaining({
        attempt: expect.objectContaining({ attemptId: active.attemptId }),
        claim: expect.objectContaining({ attemptId: active.attemptId }),
        prepared: expect.objectContaining({ model: 'claude-fable-5' }),
        dispatch: null,
        settlement: null,
      }),
    ]);

    writeFileSync(taskResultSettlementAttemptPath(active), '{}', 'utf-8');
    expect(() => listPendingTaskResultSettlementAttempts(root)).toThrow(/Corrupt Docker result settlement attempt/);
  });

  it('retires LANDED without a terminal result and opens one same-task continuation slot', () => {
    const { root } = fixture();
    const first = createTaskResultSettlementRef(root, 'task-landed-chain');
    writeTaskResultSettlementAttemptAtomic(first);
    claimTaskResultSettlementAttemptAtomic(first);

    expect(() => writeTaskResultSettlementLandedRetirementAtomic(first))
      .toThrow(/requires matching checkpoint/);

    const checkpoint = createExecutionLandingCheckpoint(
      root,
      landingInput(first.taskId, first.attemptId),
    );
    writeExecutionLandingCheckpointAtomic(root, checkpoint);
    writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
      retiredAt: '2026-07-23T18:00:02.000Z',
    });
    const retirement = writeTaskResultSettlementLandedRetirementAtomic(first);

    expect(retirement).toMatchObject({
      state: 'retired-landed',
      landingCheckpointSha256: checkpoint.checkpointSha256,
    });
    expect(readTaskResultSettlement(first)).toBeNull();
    expect(readTaskResultSettlementLandedRetirement(first)).toEqual(retirement);
    expect(readTaskResultSettlementActiveClaim(first)).toBeNull();
    expect(listPendingTaskResultSettlementAttempts(root)).toEqual([]);
    expect(() => writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: first,
      exitCode: 0,
      result: { taskId: first.taskId, selfAssessment: 'DONE' },
    }))).toThrow(/after LANDED/);

    const second = createTaskResultSettlementRef(root, first.taskId);
    writeTaskResultSettlementAttemptAtomic(second);
    claimTaskResultSettlementAttemptAtomic(second);
    expect(readTaskResultSettlementActiveClaim(second)).toMatchObject({
      ...second,
      lifecycleVersion: 2,
      state: 'claimed',
      previousAuthoritySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(() => claimTaskResultSettlementAttemptAtomic({
      ...second,
      attemptId: randomUUID(),
    })).toThrow(/no matching durable pending attempt/);
  });

  it('fails the claim chain closed when external LANDED retirement evidence is tampered', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-landed-tamper');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const checkpoint = createExecutionLandingCheckpoint(
      root,
      landingInput(ref.taskId, ref.attemptId),
    );
    writeExecutionLandingCheckpointAtomic(root, checkpoint);
    writeExecutionAttemptRetirementAtomic(root, checkpoint.checkpoint, {
      checkpointSha256: checkpoint.checkpointSha256,
      runtimeDisposition: 'stopped-removed',
      resourcesReleased: true,
      evidenceRefs: [`runtime-release:sha256:${'8'.repeat(64)}`],
    });
    writeTaskResultSettlementLandedRetirementAtomic(ref);

    writeFileSync(executionAttemptRetirementPath(checkpoint.checkpoint), '{}', 'utf-8');
    expect(() => readTaskResultSettlementLandedRetirement(ref))
      .toThrow(/Corrupt execution attempt retirement/);
    expect(() => readTaskResultSettlementActiveClaim(ref))
      .toThrow(/Corrupt execution attempt retirement/);
    expect(() => listPendingTaskResultSettlementAttempts(root))
      .toThrow(/Corrupt execution attempt retirement/);
    expect(taskResultSettlementLandedRetirementPath(ref)).toContain('landed-retirement.json');
  });
});
