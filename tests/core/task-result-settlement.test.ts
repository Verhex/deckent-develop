import { createHash, randomUUID } from 'node:crypto';
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
  createTaskResultSettlementV2,
  parseHistoricalTaskResultSettlementV1,
  parseTaskResultSettlementV2,
  taskResultSettlementV2Digest,
  taskResultSettlementV2EvidenceRef,
  verifyTaskResultSettlementV2Chain,
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
  taskResultSettlementActiveClaimDigest,
  taskResultSettlementAttemptPath,
  taskResultSettlementClaimPath,
  taskResultSettlementClosurePath,
  taskResultSettlementDurableClaimFence,
  taskResultSettlementExecutionBudgetAuthorityPath,
  taskResultSettlementExecutionContractPath,
  taskResultSettlementPreparedPath,
  taskResultSettlementPromptEvidenceRef,
  taskResultSettlementPromptMetadataPath,
  taskResultSettlementPromptPath,
  taskResultSettlementWorkAttributionBaselinePath,
  taskResultSettlementPath,
  taskProviderActualCallEvidenceRef,
  taskProviderActualCallReceiptPath,
  taskProviderTerminalBillingEvidenceRef,
  taskProviderTerminalBillingReceiptPath,
  taskProviderTerminalUsageEvidenceRef,
  taskProviderTerminalUsageReceiptPath,
  writeTaskProviderActualCallReceiptAtomic,
  writeTaskProviderActualCallReceiptFromTransportUsageAtomic,
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
  writeTaskResultSettlementWorkAttributionBaselineAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  readTaskResultSettlementLandedRetirement,
  taskResultSettlementLandedRetirementPath,
} from '../../src/core/task-result-settlement.js';
import {
  createTaskResultSettlementV2Fixture,
} from '../helpers/task-result-settlement-v2-fixture.js';
import {
  createExecutionLandingCheckpoint,
  executionAttemptRetirementPath,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
  type CreateExecutionLandingCheckpointInput,
} from '../../src/core/execution-landing-checkpoint.js';
import { budgetFingerprint } from '../../src/orchestra/runtime-budget-monitor.js';
import { canonicalJson } from '../../src/core/audit-writer.js';

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

  it('publishes an immutable private work-attribution baseline under the exact attempt', () => {
    const { root, state } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-attribution-baseline');
    writeTaskResultSettlementAttemptAtomic(ref);
    const manifest = 'deckent-work-attribution-v1\0attempt\0scope\nfile.ts\0blob\n';

    const firstPath = writeTaskResultSettlementWorkAttributionBaselineAtomic(ref, manifest);
    const replayPath = writeTaskResultSettlementWorkAttributionBaselineAtomic(ref, manifest);

    expect(replayPath).toBe(firstPath);
    expect(firstPath).toBe(taskResultSettlementWorkAttributionBaselinePath(ref));
    expect(firstPath).toContain(state);
    expect(firstPath).not.toContain(root);
    expect(readFileSync(firstPath, 'utf-8')).toBe(manifest);
    if (process.platform !== 'win32') {
      expect(statSync(firstPath).mode & 0o077).toBe(0);
    }
    expect(() => writeTaskResultSettlementWorkAttributionBaselineAtomic(
      ref,
      `${manifest}conflict`,
    )).toThrow(/Conflicting immutable/u);
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

  it('derives a subscription actual-call proof from provider-reported usage, forging no usd', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-subscription-call');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const contract = createCrossVerifyEnforcedAttemptContract(xverifyContractInput(ref));
    writeTaskResultSettlementExecutionContractAtomic(ref, contract);
    // Provider-reported terminal usage — NO billing envelope is ever written.
    writeTaskProviderTerminalUsageReceiptAtomic(ref, {
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
          turns: 1, inputTokens: 12, outputTokens: 8, cacheReadTokens: 0,
          cacheCreationTokens: 0, totalTokens: 20, maxContextTokens: 20,
        },
      },
      updatedAt: '2026-07-25T02:00:01.000Z',
    });
    writeTaskResultSettlementPreparedAtomic(ref, contract.model);
    writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-07-25T02:00:02.000Z');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref, exitCode: 0, settledAt: '2026-07-25T02:00:03.000Z',
      result: { taskId: ref.taskId, selfAssessment: 'DONE' },
    }));

    const proof = writeTaskProviderActualCallReceiptFromTransportUsageAtomic(ref);
    expect(proof.proofKind).toBe('subscription_transport_usage');
    expect(proof.usage).toEqual({ inputTokens: 12, outputTokens: 8, totalTokens: 20 });
    expect('providerBillingEvidenceRef' in proof).toBe(false);
    expect(proof.terminalTransportSettlementDigest).toMatch(/^[a-f0-9]{64}$/u);
    // Idempotent + reads back through the discriminated reader.
    expect(writeTaskProviderActualCallReceiptFromTransportUsageAtomic(ref)).toEqual(proof);
    expect(readTaskProviderActualCallReceipt(ref)).toEqual(proof);
    expect(taskProviderActualCallEvidenceRef(proof))
      .toMatch(/^provider-actual-call:sha256:[a-f0-9]{64}$/u);

    // Integrity: a tampered usage count no longer matches the provider-reported
    // terminal usage → the reader rejects it.
    writeFileSync(
      taskProviderActualCallReceiptPath(ref),
      JSON.stringify({ ...proof, usage: { ...proof.usage, totalTokens: 999 } }),
      'utf-8',
    );
    chmodSync(taskProviderActualCallReceiptPath(ref), 0o600);
    expect(readTaskProviderActualCallReceipt(ref)).toBeNull();
  });

  it('refuses a subscription actual-call proof when provider usage is absent', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-subscription-no-usage');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const contract = createCrossVerifyEnforcedAttemptContract(xverifyContractInput(ref));
    writeTaskResultSettlementExecutionContractAtomic(ref, contract);
    writeTaskResultSettlementPreparedAtomic(ref, contract.model);
    writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-07-25T02:00:02.000Z');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref, exitCode: 0, settledAt: '2026-07-25T02:00:03.000Z',
      result: { taskId: ref.taskId, selfAssessment: 'DONE' },
    }));
    // No terminal-usage receipt written → the proof cannot be produced.
    expect(() => writeTaskProviderActualCallReceiptFromTransportUsageAtomic(ref))
      .toThrow();
    expect(readTaskProviderActualCallReceipt(ref)).toBeNull();
  });

  it('holds the subscription actual-call proof when terminal usage exceeds the owner ceiling', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-subscription-overrun');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    const contract = createCrossVerifyEnforcedAttemptContract(xverifyContractInput(ref));
    writeTaskResultSettlementExecutionContractAtomic(ref, contract);
    // The runtime monitor stamped an `exceeded` decision because provider-reported
    // totalTokens ran past the owner-authored maxTokens ceiling in the contract.
    writeTaskProviderTerminalUsageReceiptAtomic(ref, {
      version: 2,
      projectId: ref.projectRootSha256,
      taskId: ref.taskId,
      attemptId: ref.attemptId,
      budgetFingerprint: contract.budgetFingerprint,
      backend: 'docker',
      terminal: true,
      decision: {
        state: 'exceeded',
        counters: {
          turns: 1, inputTokens: 200_000, outputTokens: 5_000, cacheReadTokens: 0,
          cacheCreationTokens: 0, totalTokens: 205_000, maxContextTokens: 0,
        },
      },
      updatedAt: '2026-07-25T02:00:01.000Z',
    });
    writeTaskResultSettlementPreparedAtomic(ref, contract.model);
    writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-07-25T02:00:02.000Z');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref, exitCode: 0, settledAt: '2026-07-25T02:00:03.000Z',
      result: { taskId: ref.taskId, selfAssessment: 'DONE' },
    }));
    // Overrun fails the actual-call proof closed even though the container exited
    // 0 — a successful verdict never promotes an over-ceiling settlement.
    expect(() => writeTaskProviderActualCallReceiptFromTransportUsageAtomic(ref)).toThrow();
    expect(readTaskProviderActualCallReceipt(ref)).toBeNull();
  });

  it('settles docker terminal usage only when the contract carries the runtime-canonical budgetFingerprint (Gate B)', () => {
    const { root } = fixture();
    // The runtime-budget-monitor stamps the live usage receipt with this canonical
    // fingerprint (BUDGET_FIELDS order). The old ingress computed the contract
    // fingerprint via sha256(canonicalJson(budget)) — an alphabetical-key hash that
    // never equalled the monitor's, so writeTaskProviderTerminalUsageReceiptAtomic's
    // exact-equality check aborted every docker adjudication settlement before
    // persist/close (surfaced first by the xverify non_reservable arm, the first to
    // reach settlement). The ingress now uses budgetFingerprint() — this locks it.
    const budget = { maxTurns: 16, maxCacheReadTokens: 1_000_000 };
    const runtimeFingerprint = budgetFingerprint(budget);
    const legacyFingerprint = createHash('sha256').update(canonicalJson(budget)).digest('hex');
    expect(runtimeFingerprint).not.toBe(legacyFingerprint);

    const runtimeUsage = (ref: ReturnType<typeof createTaskResultSettlementRef>) => ({
      version: 2 as const,
      projectId: ref.projectRootSha256,
      taskId: ref.taskId,
      attemptId: ref.attemptId,
      budgetFingerprint: runtimeFingerprint,
      backend: 'docker',
      terminal: true as const,
      decision: {
        state: 'within-budget' as const,
        counters: {
          turns: 1, inputTokens: 12, outputTokens: 8, cacheReadTokens: 0,
          cacheCreationTokens: 0, totalTokens: 20, maxContextTokens: 20,
        },
      },
      updatedAt: '2026-07-25T02:00:01.000Z',
    });

    // A contract carrying the LEGACY canonicalJson fingerprint cannot settle the
    // runtime-stamped usage — the exact abort observed in the smoke.
    const badRef = createTaskResultSettlementRef(root, 'task-gateb-legacy');
    writeTaskResultSettlementAttemptAtomic(badRef);
    claimTaskResultSettlementAttemptAtomic(badRef);
    writeTaskResultSettlementExecutionContractAtomic(badRef, createCrossVerifyEnforcedAttemptContract({
      ...xverifyContractInput(badRef), budget, budgetFingerprint: legacyFingerprint,
    }));
    expect(() => writeTaskProviderTerminalUsageReceiptAtomic(badRef, runtimeUsage(badRef)))
      .toThrow(/differs from the exact execution contract/u);

    // The FIXED ingress stamps budgetFingerprint(budget) — the same canonical hash →
    // settlement proceeds.
    const okRef = createTaskResultSettlementRef(root, 'task-gateb-runtime');
    writeTaskResultSettlementAttemptAtomic(okRef);
    claimTaskResultSettlementAttemptAtomic(okRef);
    writeTaskResultSettlementExecutionContractAtomic(okRef, createCrossVerifyEnforcedAttemptContract({
      ...xverifyContractInput(okRef), budget, budgetFingerprint: runtimeFingerprint,
    }));
    const usage = writeTaskProviderTerminalUsageReceiptAtomic(okRef, runtimeUsage(okRef));
    expect(readTaskProviderTerminalUsageReceipt(okRef)).toEqual(usage);
    expect(usage.budgetFingerprint).toBe(runtimeFingerprint);
  });

  it('resolves the durable claim fence unchanged across settlement closure (verdict-receipt path)', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'task-durable-fence');
    writeTaskResultSettlementAttemptAtomic(ref);
    claimTaskResultSettlementAttemptAtomic(ref);
    // While the claim is active, the durable fence equals the active-claim digest.
    const activeFence = taskResultSettlementActiveClaimDigest(ref);
    expect(taskResultSettlementDurableClaimFence(ref))
      .toMatchObject({ fenceTokenHash: activeFence });

    // Settle + terminally close the attempt — this retires the ACTIVE claim.
    writeTaskResultSettlementPreparedAtomic(ref, 'claude-fable-5');
    writeTaskResultSettlementDispatchAtomic(ref, 'e'.repeat(64), '2026-07-25T02:00:02.000Z');
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref, exitCode: 0, settledAt: '2026-07-25T02:00:03.000Z',
      result: { taskId: ref.taskId, selfAssessment: 'DONE' },
    }));
    writeTaskResultSettlementClosureAtomic(ref, {
      containerDisposition: 'stopped-removed', locksReleased: true,
    });
    expect(readTaskResultSettlementClosure(ref)).not.toBeNull();

    // The active-claim digest now fails closed (retired) — but the DURABLE fence
    // that the host verdict receipt binds to is unchanged: the claim record is
    // never rewritten on closure. A wrong fence still fails closed.
    expect(() => taskResultSettlementActiveClaimDigest(ref)).toThrow();
    expect(taskResultSettlementDurableClaimFence(ref))
      .toEqual({ fenceTokenHash: activeFence, claimedAt: expect.any(String) });
    expect(taskResultSettlementDurableClaimFence(
      createTaskResultSettlementRef(root, 'task-durable-fence-other'),
    )).toBeNull();
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

describe('exact-attempt TaskResult settlement V2', { timeout: 60_000 }, () => {
  it('creates, parses, digests and independently verifies the full archive chain', () => {
    const fixtureV2 = createTaskResultSettlementV2Fixture();
    expect(Buffer.from(fixtureV2.rawWorkerResultBytes).toString('utf8'))
      .toContain('worker-claimed-provider');
    expect(fixtureV2.settlement.result.provider).toBe('fixture-provider');
    const parsed = parseTaskResultSettlementV2(
      fixtureV2.settlement,
      fixtureV2.policy.jsonBounds,
    );
    expect(parsed).toEqual(fixtureV2.settlement);
    const digest = taskResultSettlementV2Digest(
      fixtureV2.settlement,
      fixtureV2.policy.jsonBounds,
    );
    expect(taskResultSettlementV2EvidenceRef(
      fixtureV2.settlement,
      fixtureV2.policy.jsonBounds,
    )).toBe(`task-result-settlement-v2:${digest}`);
    expect(verifyTaskResultSettlementV2Chain({
      creation: fixtureV2.creation,
      settlement: fixtureV2.settlement,
      settlementArtifact: fixtureV2.settlementArtifact,
      settlementChain: fixtureV2.settlementChain,
      archivePayload: fixtureV2.archivePayload,
      archiveArtifact: fixtureV2.archiveArtifact,
      archiveChain: fixtureV2.archiveChain,
    })).toEqual({
      ok: true,
      settlementDigest: digest,
      archiveChainDigest: fixtureV2.archiveChain.receiptDigest,
    });
  });

  it('keeps V1 historical parsing separate from V2 normal parsing', () => {
    const { root } = fixture();
    const ref = createTaskResultSettlementRef(root, 'historical-v1');
    const historical = createTaskResultSettlement({
      ref,
      exitCode: 0,
      settledAt: '2026-08-30T20:00:00.000Z',
      result: { taskId: ref.taskId, selfAssessment: 'DONE' },
    });
    expect(parseHistoricalTaskResultSettlementV1(historical)).toEqual(historical);
    const fixtureV2 = createTaskResultSettlementV2Fixture();
    expect(parseTaskResultSettlementV2(historical, fixtureV2.policy.jsonBounds)).toBeNull();
    expect(parseHistoricalTaskResultSettlementV1(fixtureV2.settlement)).toBeNull();
  });

  it('rejects result tampering, sibling identity replay and unknown fields', () => {
    const fixtureV2 = createTaskResultSettlementV2Fixture();
    const tamperedResult = {
      ...fixtureV2.settlement,
      result: { ...fixtureV2.settlement.result, taskId: 'sibling-task' },
    };
    expect(parseTaskResultSettlementV2(tamperedResult, fixtureV2.policy.jsonBounds)).toBeNull();
    const siblingIdentity = {
      ...fixtureV2.settlement,
      identity: { ...fixtureV2.identity, generation: fixtureV2.identity.generation + 1 },
    };
    expect(parseTaskResultSettlementV2(siblingIdentity, fixtureV2.policy.jsonBounds)).toBeNull();
    expect(parseTaskResultSettlementV2(
      { ...fixtureV2.settlement, legacyFallback: true },
      fixtureV2.policy.jsonBounds,
    )).toBeNull();
  });

  it('rejects a broken evaluation predecessor instead of selecting another attempt', () => {
    const fixtureV2 = createTaskResultSettlementV2Fixture();
    const brokenCreation = {
      ...fixtureV2.creation,
      evaluationChain: {
        ...fixtureV2.creation.evaluationChain,
        predecessorDigest: `sha256:${'9'.repeat(64)}` as const,
      },
    };
    expect(() => createTaskResultSettlementV2Fixture().settlement).not.toThrow();
    expect(verifyTaskResultSettlementV2Chain({
      creation: brokenCreation,
      settlement: fixtureV2.settlement,
      settlementArtifact: fixtureV2.settlementArtifact,
      settlementChain: fixtureV2.settlementChain,
      archivePayload: fixtureV2.archivePayload,
      archiveArtifact: fixtureV2.archiveArtifact,
      archiveChain: fixtureV2.archiveChain,
    }).ok).toBe(false);
  });

  it('rejects a fully self-consistent archive tail that was persisted only in another store', () => {
    const authoritative = createTaskResultSettlementV2Fixture();
    const foreign = createTaskResultSettlementV2Fixture({
      tailArtifactKey: 'foreign-tail',
    });
    expect(verifyTaskResultSettlementV2Chain({
      creation: authoritative.creation,
      settlement: foreign.settlement,
      settlementArtifact: foreign.settlementArtifact,
      settlementChain: foreign.settlementChain,
      archivePayload: foreign.archivePayload,
      archiveArtifact: foreign.archiveArtifact,
      archiveChain: foreign.archiveChain,
    })).toEqual({
      ok: false,
      reason: 'unpersisted-or-mismatched-archive-tail',
    });
  });

  it('rejects settlement time before the persisted finalizer tail', () => {
    const fixtureV2 = createTaskResultSettlementV2Fixture();
    expect(() => createTaskResultSettlementV2({
      ...fixtureV2.creation,
      settledAt: '2026-08-30T20:06:59.999Z',
    })).toThrow(/terminal metadata/);
  });

  it('refuses to persist an archive artifact captured before the settlement chain event', () => {
    expect(() => createTaskResultSettlementV2Fixture({
      archiveCapturedAt: '2026-08-30T20:09:30.000Z',
    })).toThrow(/CHAIN_PREDECESSOR_MISMATCH/);
  });

  it('requires exactly one archive authority reference to the exact settlement digest', () => {
    const fixtureV2 = createTaskResultSettlementV2Fixture();
    const wrongArchive = {
      ...fixtureV2.archivePayload,
      externalAuthorityRefs: [{
        authorityType: 'task-result-settlement-v2' as const,
        digest: `sha256:${'f'.repeat(64)}` as const,
      }],
    };
    expect(verifyTaskResultSettlementV2Chain({
      creation: fixtureV2.creation,
      settlement: fixtureV2.settlement,
      settlementArtifact: fixtureV2.settlementArtifact,
      settlementChain: fixtureV2.settlementChain,
      archivePayload: wrongArchive,
      archiveArtifact: fixtureV2.archiveArtifact,
      archiveChain: fixtureV2.archiveChain,
    }).ok).toBe(false);

    const multiple = {
      ...fixtureV2.archivePayload,
      externalAuthorityRefs: [
        ...fixtureV2.archivePayload.externalAuthorityRefs,
        ...fixtureV2.archivePayload.externalAuthorityRefs,
      ],
    } as unknown as typeof fixtureV2.archivePayload;
    expect(verifyTaskResultSettlementV2Chain({
      creation: fixtureV2.creation,
      settlement: fixtureV2.settlement,
      settlementArtifact: fixtureV2.settlementArtifact,
      settlementChain: fixtureV2.settlementChain,
      archivePayload: multiple,
      archiveArtifact: fixtureV2.archiveArtifact,
      archiveChain: fixtureV2.archiveChain,
    }).ok).toBe(false);
  });

  it('keeps settlement digest stable across object key order', () => {
    const fixtureV2 = createTaskResultSettlementV2Fixture();
    const reordered = Object.fromEntries(
      Object.entries(fixtureV2.settlement).reverse(),
    );
    const parsed = parseTaskResultSettlementV2(reordered, fixtureV2.policy.jsonBounds);
    expect(parsed).not.toBeNull();
    if (!parsed) return;
    expect(taskResultSettlementV2Digest(parsed, fixtureV2.policy.jsonBounds)).toBe(
      taskResultSettlementV2Digest(fixtureV2.settlement, fixtureV2.policy.jsonBounds),
    );
  });
});
