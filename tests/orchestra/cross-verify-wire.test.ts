// tests/orchestra/cross-verify-wire.test.ts
//
// Hermetic tests for the XVER-1 cross-verify dispatch runner (Sprint 276 Task 276-007).
//
// All tests inject `spawnVerifier`, so NO real worker/provider is ever spawned and the
// provider registry is never consulted. File I/O happens entirely under os.tmpdir().
// No gitignored state read; no spawnSync; passes on a fresh checkout (CI-hermetic).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runCrossVerify,
  type CrossVerifyInvocationReceiptContext,
  type MandatoryCrossVerifyInvocationComposition,
  type SpawnVerifierInput,
  type SpawnVerifierFn,
} from '../../src/orchestra/cross-verify-runner.js';
import type {
  CrossVerifyInvocationCoordinatorResult,
} from '../../src/orchestra/cross-verify-invocation-coordinator.js';
import { TaskEvaluation, TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult, ResolvedConfig, ProviderName, CrossVerifyConfig } from '../../src/core/types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { ensureOllamaModelRegistered, modelRegistry } from '../../src/core/model-registry.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  claimExecutionContinuationAtomic,
  createExecutionLandingCheckpoint,
  writeExecutionAttemptRetirementAtomic,
  writeExecutionLandingCheckpointAtomic,
} from '../../src/core/execution-landing-checkpoint.js';
import { RuntimeBudgetMonitor } from '../../src/orchestra/runtime-budget-monitor.js';
import type { VerifierEligibilityCandidate } from '../../src/core/cross-verify.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import type { InvocationReceipt, InvocationReceiptLedger } from '../../src/core/invocation-receipt.js';
import {
  CROSS_VERIFY_ADJUDICATION_PROTOCOL,
  CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
  createCrossVerifyAdjudicationContractV2,
} from '../../src/core/cross-verify-adjudication.js';
import { CROSS_VERIFY_ADJUDICATION_RESPONSE_PREFIX } from '../../src/core/cross-verify-prompt.js';

const defaultSpawnMocks = vi.hoisted(() => ({
  spawnWorkerMultiProvider: vi.fn(async () => ({ backend: 'docker', provider: 'claude' })),
  finalizeTaskStatusFromSettlement: vi.fn(() => 'DONE'),
  pollForResultFile: vi.fn(async () => ({ notes: 'VERDICT: CONFIRMED default path' })),
}));

vi.mock('../../src/cli/commands/spawn.js', () => ({
  spawnWorkerMultiProvider: defaultSpawnMocks.spawnWorkerMultiProvider,
  finalizeTaskStatusFromSettlement: defaultSpawnMocks.finalizeTaskStatusFromSettlement,
}));
vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  pollForResultFile: defaultSpawnMocks.pollForResultFile,
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

let root: string;
const originalDeckentHome = process.env.DECKENT_HOME;
let receiptStores: InvocationReceiptStore[] = [];

beforeEach(() => {
  defaultSpawnMocks.spawnWorkerMultiProvider.mockClear();
  defaultSpawnMocks.finalizeTaskStatusFromSettlement.mockClear();
  defaultSpawnMocks.pollForResultFile.mockClear();
  root = mkdtempSync(join(tmpdir(), 'deckent-xverify-'));
  mkdirSync(join(root, TASKS_DIR), { recursive: true });
  process.env.DECKENT_HOME = `${root}-host-state`;
  receiptStores = [];
});

afterEach(() => {
  for (const store of receiptStores) store.close();
  if (originalDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = originalDeckentHome;
  try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(`${root}-host-state`, { recursive: true, force: true }); } catch { /* ignore */ }
});

/** High-stakes by default (priority CRITICAL); override to make it low-stakes. */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '276-001',
    title: 'Harden auth token validation',
    description: 'Add JWT signature checks to the login endpoint',
    model: 'claude-sonnet-5',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'security',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/auth.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'JWT verified', noGoCriteria: 'bypass possible', techDebtAcceptable: 'none' },
    status: TaskStatus.DONE,
    sprintId: 'sprint-276',
    provider: 'claude',
    ...overrides,
  } as Task;
}

/** A clearly LOW-stakes task: no security keywords, NORMAL priority, neutral scope. */
function makeLowStakesTask(overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: '276-002',
    title: 'Tidy up the config loader formatting',
    description: 'Reorder fields and reflow comments in the loader',
    priority: 'NORMAL',
    reason: 'cleanup',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/loader.ts'] },
    ...overrides,
  });
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '276-001',
    workerId: 'w-276-001',
    filesChanged: ['src/core/auth.ts'],
    linesAdded: 40,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE',
    notes: 'Added JWT verification.',
    ...overrides,
  };
}

function makeConfig(
  crossVerify?: Partial<CrossVerifyConfig> & { enabled: boolean },
  overrides: Partial<ResolvedConfig> = {},
): ResolvedConfig {
  return {
    spawn_backend: 'docker',
    execution_budget: {
      roles: { auditor: { default: { maxCacheReadTokens: 1_000_000, maxTurns: 12 } } },
      landing: { reserve_ratio: 0.25 },
      unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker', 'subprocess'] },
      // codex/gemini report usage only at call end; the owner authorizes them for
      // the auditor role under host wall-clock containment (mirrors the project's
      // authored policy). Tests that assert the fail-closed path drop this block.
      final_only_usage: {
        action: 'allow-wall-clock-containment',
        roles: ['auditor'],
        max_wall_clock_seconds: 300,
      },
    },
    cross_verify: crossVerify,
    ...overrides,
  } as unknown as ResolvedConfig;
}

function writeResultFile(taskId: string, result: TaskResult): void {
  writeFileSync(
    join(root, TASKS_DIR, `task-${taskId}.result`),
    JSON.stringify(result, null, 2),
    'utf-8',
  );
}

function readResultFile(taskId: string): TaskResult & {
  crossVerify?: {
    outcome: string;
    verifier?: string;
    verifierModel?: string;
    verdict?: string;
    reason: string;
    authorityEvidenceRef?: string;
    execution?: { outcome: string; terminalAttemptId: string };
    eligibility?: {
      reachabilityRef: string;
      limitEvidenceRefs: string[];
    };
    invocationReceiptRef?: {
      schemaVersion: number;
      invocationId: string;
      tenantId: string;
      projectId: string;
    };
  };
} {
  return JSON.parse(
    readFileSync(join(root, TASKS_DIR, `task-${taskId}.result`), 'utf-8'),
  );
}

/** A spawn spy that records its last input and returns a fixed output. */
function makeSpawnSpy(output: string): { fn: SpawnVerifierFn; calls: SpawnVerifierInput[] } {
  const calls: SpawnVerifierInput[] = [];
  const fn = vi.fn(async (input: SpawnVerifierInput) => {
    calls.push(input);
    return output;
  });
  return { fn, calls };
}

function exactCoordinatorSettled(
  output: string,
  overrides: Partial<Extract<
    CrossVerifyInvocationCoordinatorResult,
    { state: 'settled' }
  >> = {},
): Extract<CrossVerifyInvocationCoordinatorResult, { state: 'settled' }> {
  const attemptId = '11111111-1111-4111-8111-111111111111';
  return {
    state: 'settled',
    output,
    execution: {
      outcome: 'completed',
      initialAttemptId: attemptId,
      terminalAttemptId: attemptId,
      cumulativeUsage: {
        turns: 2,
        inputTokens: 4,
        outputTokens: 100,
        cacheReadTokens: 20,
        cacheCreationTokens: 10,
        totalTokens: 134,
        maxContextTokens: 34,
      },
    },
    invocationReceiptRef: {
      schemaVersion: 1,
      tenantId: 'tenant-a',
      projectId: 'project-a',
      invocationId: 'invocation-mandatory-xverify',
    },
    providerLimitReservationId: 'reservation-mandatory-xverify',
    providerLimitDispatchEvidenceRef: 'provider-limit-dispatch:mandatory-xverify',
    providerLimitSettlementEvidenceRef: 'provider-limit-settlement:mandatory-xverify',
    executionContractEvidenceRef: 'xverify-contract:mandatory-xverify',
    outputArtifactRef: 'task-result-output:mandatory-xverify',
    hostObservationEvidenceRef: 'xverify-host-observation:mandatory-xverify',
    terminalSettlementRef: createTaskResultSettlementRefForAttempt(
      root,
      '276-001-xverify',
      attemptId,
    ),
    calledProvider: 'codex',
    calledModel: 'gpt-5.6-sol',
    ...overrides,
  };
}

function mandatoryComposition(
  result: CrossVerifyInvocationCoordinatorResult | Error,
): {
  composition: MandatoryCrossVerifyInvocationComposition;
  execute: ReturnType<typeof vi.fn>;
  launcher: ReturnType<typeof vi.fn>;
} {
  const execute = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const launcher = vi.fn();
  const composition: MandatoryCrossVerifyInvocationComposition = {
    coordinator: { execute },
    input: {} as MandatoryCrossVerifyInvocationComposition['input'],
    launcher: launcher as MandatoryCrossVerifyInvocationComposition['launcher'],
  };
  return { composition, execute, launcher };
}

function typedAdjudicationFixture(status: 'supported' | 'contradicted') {
  const contentDigest = `sha256:${'1'.repeat(64)}`;
  const contract = createCrossVerifyAdjudicationContractV2({
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    claimId: 'claim-276-001',
    summary: 'JWT validation is enforced.',
    assertions: [{
      id: 'A1',
      kind: 'factual',
      polarity: 'go',
      statement: 'JWT validation is enforced before request acceptance.',
      evidenceRequirements: [{
        id: 'R1',
        statement: 'The exact middleware snapshot shows validation.',
        anyOfEvidenceIds: ['E1'],
      }],
    }],
  }, {
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    entries: [{
      evidenceId: 'E1',
      kind: 'file-snapshot',
      locator: 'src/core/auth.ts',
      contentSha256: contentDigest,
    }],
  });
  const response = {
    schemaVersion: CROSS_VERIFY_ADJUDICATION_SCHEMA_VERSION,
    protocol: CROSS_VERIFY_ADJUDICATION_PROTOCOL,
    claimDigest: contract.claimDigest,
    evidenceManifestDigest: contract.evidenceManifestDigest,
    assertionResults: [{
      assertionId: 'A1',
      status,
      citations: [{
        evidenceId: 'E1',
        locator: 'src/core/auth.ts',
        evidenceSha256: contentDigest,
      }],
      reason: status === 'supported'
        ? 'The exact snapshot supports validation.'
        : 'The exact snapshot contradicts validation.',
    }],
  };
  return { contract, response };
}

const TWO_PROVIDERS: readonly ProviderName[] = ['claude', 'codex'];

/**
 * The model tier equivalence answers with for the standard-tier fixture task
 * (`claude-sonnet-5` → codex). These tests audit that the runner HONORS tier
 * equivalence and persists what it dispatched — not what the answer happens to
 * be, which MASTER-PLAN 670 redesignated and which
 * cross-verify-config-verifier-model.test.ts pins explicitly.
 */
const TIER_EQUIVALENT_VERIFIER_MODEL = modelRegistry.getEquivalent('claude-sonnet-5', 'codex');

function exactCandidate(
  overrides: Partial<VerifierEligibilityCandidate> = {},
): VerifierEligibilityCandidate {
  return {
    provider: 'codex',
    // Host-supplied eligibility evidence must name the SAME model the runner
    // resolves, or the 669 contract check fail-louds. Derived from the registry
    // rather than pinned: these tests audit receipt lifecycle, not which model a
    // tier answers with, and a literal here went stale the moment MASTER-PLAN
    // 670 redesignated codex/standard. The identity itself is pinned by
    // tests/orchestra/cross-verify-config-verifier-model.test.ts.
    model: modelRegistry.getEquivalent('claude-sonnet-5', 'codex'),
    auth: { mode: 'subscription', accountRefHash: 'a'.repeat(64) },
    backend: {
      transport: 'cli',
      executionBackend: 'docker',
      endpointRefHash: null,
      executionProfileRef: 'profile-codex-docker',
    },
    reachability: {
      state: 'known',
      reachable: true,
      evidenceRef: 'provider-reachability:codex-exact-evidence',
    },
    limits: {
      state: 'known',
      limited: false,
      evidenceRefs: ['provider-limit:codex-exact-evidence'],
    },
    ...overrides,
  };
}

function exactInvocationReceipt(
  candidate: VerifierEligibilityCandidate,
  overrides: Partial<InvocationReceipt> = {},
): {
  store: InvocationReceiptStore;
  receipt: InvocationReceipt;
  context: CrossVerifyInvocationReceiptContext;
} {
  const store = new InvocationReceiptStore(root);
  receiptStores.push(store);
  const receipt: InvocationReceipt = {
    schemaVersion: 1,
    invocationId: 'inv-xverify-276-001',
    idempotencyKey: 'sprint-276:276-001-xverify:auditor:1',
    tenantId: 'tenant-a',
    projectId: store.projectId,
    runId: 'sprint-276',
    taskId: '276-001-xverify',
    callId: 'call-xverify-276-001-1',
    role: 'auditor',
    purpose: 'audit-evaluation',
    configured: {
      provider: candidate.provider,
      model: candidate.model,
      source: 'config',
      reasonCode: 'none',
    },
    requested: {
      provider: candidate.provider,
      model: candidate.model,
      source: 'directive',
      reasonCode: 'none',
    },
    resolved: {
      provider: candidate.provider,
      model: candidate.model,
      source: 'router',
      reasonCode: 'none',
    },
    called: {
      provider: candidate.provider,
      model: candidate.model,
      source: 'wire',
      reasonCode: 'none',
    },
    backend: {
      transport: candidate.backend.transport,
      executionBackend: candidate.backend.executionBackend,
    },
    auth: {
      mode: candidate.auth.mode,
      accountRefHash: candidate.auth.accountRefHash,
    },
    fallbackChain: [],
    reachability: {
      state: candidate.reachability.state,
      evidenceRef: candidate.reachability.evidenceRef,
    },
    limits: {
      state: candidate.limits.state,
      evidenceRefs: [...candidate.limits.evidenceRefs],
    },
    createdAt: '2026-07-25T00:00:00.000Z',
    ...overrides,
  };
  let eventSequence = 0;
  return {
    store,
    receipt,
    context: {
      ledger: store,
      receipt,
      now: () => '2026-07-25T00:00:01.000Z',
      eventIdFactory: () => `xverify-event-${++eventSequence}`,
    },
  };
}

function normalizedLogEvent(seq: number, type: string, content: unknown): string {
  return JSON.stringify({
    ts: '2026-07-23T00:00:00.000Z',
    seq,
    type,
    content,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('runCrossVerify — config gate', () => {
  it('disabled config → skip "disabled", spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig(undefined), // no cross_verify block at all
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('disabled');
    expect(res.disposition).toBe('not-applicable');
    expect(res.skippedReason).toBe('disabled');
    expect(res.refuted).toBe(false);
    expect(calls.length).toBe(0);
  });

  it('enabled:false → skip "disabled"', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: false }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('disabled');
    expect(res.skippedReason).toBe('disabled');
    expect(calls.length).toBe(0);
  });
});

describe('runCrossVerify — evaluation gate', () => {
  it('NO_GO evaluation → skip "not-passing", spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult({ selfAssessment: 'NO_GO' }), TaskEvaluation.NO_GO,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('not-applicable');
    expect(res.disposition).toBe('not-applicable');
    expect(res.skippedReason).toBe('not-passing');
    expect(calls.length).toBe(0);
  });
});

describe('runCrossVerify — dispatch + advisory write', () => {
  it('default path writes audit budget provenance and forwards Docker execution options', async () => {
    const task = makeTask({
      provider: 'codex',
      model: 'gpt-5.6-sol',
      scope: {
        directories: ['src/core/'],
        filesRead: ['src/core/auth.ts', 'src/core/auth.ts'],
        filesWrite: ['src/core/auth.ts'],
      },
    });
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(
      async (taskId, _model, _prompt, projectRoot) => {
        expect(readFileSync(
          join(projectRoot, TASKS_DIR, `task-${taskId}.plan`),
          'utf-8',
        )).toContain(`# Exact xverify plan — ${taskId}`);
        return { backend: 'docker', provider: 'claude' };
      },
    );
    const res = await runCrossVerify(
      root, task, makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }, { docker_image: 'deckent-worker:test', docker_timeout: 321 }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res.outcome).toBe('confirmed');
    expect(defaultSpawnMocks.spawnWorkerMultiProvider).toHaveBeenCalledTimes(1);
    const call = defaultSpawnMocks.spawnWorkerMultiProvider.mock.calls[0]!;
    expect(call[1]).toBe('claude-fable-5');
    expect(call[4]).toMatchObject({
      provider: 'claude',
      spawnBackend: 'docker',
      dockerImage: 'deckent-worker:test',
      dockerTimeout: 321,
      executionBudget: { maxCacheReadTokens: 1_000_000, maxTurns: 12 },
      availableTools: 'Bash',
      isolatedContext: true,
      modelEffort: 'low',
      hostTerminalResultContract: {
        version: 1,
        kind: 'terminal-verdict',
        protocol: 'xverify-v1',
      },
    });

    const verifierTask = JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(verifierTask).toMatchObject({
      model: 'claude-fable-5',
      provider: 'claude',
      modelEffort: 'low',
      type: 'audit',
      backend: 'docker',
      budget: { maxCacheReadTokens: 1_000_000, maxTurns: 12 },
      budgetPolicy: {
        state: 'allow',
        role: 'auditor',
        taskKind: 'audit',
        resolvedProvider: 'claude',
        executionCostClass: 'remote',
        profileRef: 'execution_budget.roles.auditor.default',
        policyDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
        admissionMode: 'unattended',
        landingPolicy: { reserve_ratio: 0.25 },
      },
      scope: {
        directories: [],
        filesRead: ['src/core/auth.ts'],
        filesWrite: [],
      },
    });
    const verifierPlan = readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.plan'),
      'utf-8',
    );
    expect(verifierPlan).toContain('# Exact xverify plan — 276-001-xverify');
    expect(verifierPlan).toContain('- Provider: claude');
    expect(verifierPlan).toContain('- Model: claude-fable-5');
    expect(verifierPlan).toContain('inspection-only; project writes are forbidden');
    expect(verifierPlan).toContain('- "src/core/auth.ts"');
    expect(verifierPlan).toContain('exactly one terminal VERDICT');
  });

  it('returns UNCLEAR without spawn when exact verifier artifacts cannot be prepared', async () => {
    const notADirectory = join(root, 'not-a-directory');
    writeFileSync(notADirectory, 'file', 'utf-8');

    const res = await runCrossVerify(
      notADirectory,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'unclear',
      advisory: { verdict: 'unclear' },
    });
    expect(defaultSpawnMocks.spawnWorkerMultiProvider).not.toHaveBeenCalled();
  });

  it('does not apply the Claude finite-verifier effort profile to another provider', async () => {
    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'claude', model: 'claude-sonnet-5' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['claude', 'codex'], verifierModel: 'gpt-5.6-sol' },
    );

    expect(res.outcome).toBe('confirmed');
    const call = defaultSpawnMocks.spawnWorkerMultiProvider.mock.calls[0]!;
    expect(call[4]).toMatchObject({ provider: 'codex' });
    expect(call[4]).not.toHaveProperty('modelEffort');

    const verifierTask = JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(verifierTask.provider).toBe('codex');
    expect(verifierTask).not.toHaveProperty('modelEffort');
  });

  it('consumes a terminal Docker receipt and finalizes task projection from that receipt', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      const ref = createTaskResultSettlementRef(projectRoot, taskId);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 0,
        result: {
          taskId,
          selfAssessment: 'DONE',
          testsPassed: true,
          notes: 'Host-observed terminal xverify protocol completed.\nVERDICT: CONFIRMED settled evidence',
        },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
      return { backend: 'docker', provider: 'claude', settlementRef: ref };
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      outcome: 'confirmed',
      advisory: { verdict: 'confirmed', reason: 'settled evidence' },
    });
    expect(defaultSpawnMocks.finalizeTaskStatusFromSettlement).toHaveBeenCalledOnce();
    expect(defaultSpawnMocks.pollForResultFile).not.toHaveBeenCalled();
  });

  it('does not accept a verifier receipt without lifecycle closure as a verdict', async () => {
    defaultSpawnMocks.finalizeTaskStatusFromSettlement.mockReturnValueOnce(null);
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      const ref = createTaskResultSettlementRef(projectRoot, taskId);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 0,
        result: {
          taskId,
          selfAssessment: 'DONE',
          testsPassed: true,
          notes: 'VERDICT: CONFIRMED receipt-only evidence',
        },
      }));
      return { backend: 'docker', provider: 'claude', settlementRef: ref };
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5', timeoutMs: 30 },
    );

    expect(res).toMatchObject({ outcome: 'unclear', advisory: { verdict: 'unclear' } });
    expect(defaultSpawnMocks.finalizeTaskStatusFromSettlement).toHaveBeenCalledOnce();
    expect(defaultSpawnMocks.pollForResultFile).not.toHaveBeenCalled();
  });

  it('does not override a settled NO_GO with a later provider-log verdict', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      const ref = createTaskResultSettlementRef(projectRoot, taskId);
      writeTaskResultSettlementAttemptAtomic(ref);
      claimTaskResultSettlementAttemptAtomic(ref);
      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref,
        exitCode: 0,
        result: {
          taskId,
          selfAssessment: 'NO_GO',
          testsPassed: false,
          markerType: 'EXIT_WITHOUT_RESULT',
          notes: 'Worker exited without writing result.',
        },
      }));
      writeTaskResultSettlementClosureAtomic(ref, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
        'VERDICT: CONFIRMED contradictory raw log',
        'utf-8',
      );
      return { backend: 'docker', provider: 'claude', settlementRef: ref };
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({ outcome: 'unclear', advisory: { verdict: 'unclear' } });
    expect(defaultSpawnMocks.finalizeTaskStatusFromSettlement).toHaveBeenCalledOnce();
    expect(defaultSpawnMocks.pollForResultFile).not.toHaveBeenCalled();
  });

  it('follows a LANDED parent to its exact exhausted continuation without hiding either truth', async () => {
    let continuationRef: ReturnType<typeof createTaskResultSettlementRefForAttempt> | undefined;
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      const parentRef = createTaskResultSettlementRef(projectRoot, taskId);
      writeTaskResultSettlementAttemptAtomic(parentRef);
      claimTaskResultSettlementAttemptAtomic(parentRef);
      const checkpoint = createExecutionLandingCheckpoint(projectRoot, {
        taskId,
        attemptId: parentRef.attemptId,
        tenantId: 'tenant-a',
        originalRequestDigest: '1'.repeat(64),
        taskDigest: '2'.repeat(64),
        role: 'auditor',
        kind: 'audit',
        admissionMode: 'unattended',
        identity: {
          configuredProvider: 'claude',
          configuredModel: 'claude-fable-5',
          requestedProvider: 'claude',
          requestedModel: 'claude-fable-5',
          resolvedProvider: 'claude',
          resolvedModel: 'claude-fable-5',
          calledProvider: 'claude',
          calledModel: 'claude-fable-5',
          backend: 'docker',
          auth: 'subscription',
          fallbackReason: null,
        },
        policyDigest: '3'.repeat(64),
        landingPolicy: { reserve_ratio: 0.25 },
        hardBudget: { maxTurns: 12, maxCacheReadTokens: 800 },
        cumulativeUsage: {
          turns: 2,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 500,
          cacheCreationTokens: 50,
          totalTokens: 700,
          maxContextTokens: 650,
        },
        attemptFence: 'xverify-parent-fence',
        providerSequence: {
          firstSequence: 1,
          lastSequence: 2,
          eventCount: 2,
          eventDigest: '4'.repeat(64),
        },
        semanticState: {
          summary: 'Bounded evidence pass completed before landing.',
          completedWork: ['read the exact evidence'],
          remainingWork: ['emit the terminal verdict'],
          nextAction: 'continue from this checkpoint once',
          unresolvedRisks: [],
        },
        scope: {
          filesRead: ['src/core/auth.ts'],
          filesWrite: [],
        },
        diskDiffRefs: [`scope-diff:sha256:${'5'.repeat(64)}`],
        evidenceRefs: [`budget-usage:sha256:${'6'.repeat(64)}`],
        acceptanceCriteria: 'Emit one terminal verifier verdict.',
        landingRequestedAt: '2026-07-24T00:00:00.000Z',
        landedAt: '2026-07-24T00:00:01.000Z',
      });
      writeExecutionLandingCheckpointAtomic(projectRoot, checkpoint);
      writeExecutionAttemptRetirementAtomic(projectRoot, checkpoint.checkpoint, {
        checkpointSha256: checkpoint.checkpointSha256,
        runtimeDisposition: 'stopped-removed',
        resourcesReleased: true,
        evidenceRefs: [`runtime-release:sha256:${'7'.repeat(64)}`],
      });
      writeTaskResultSettlementLandedRetirementAtomic(parentRef);

      const continuationAttemptId = randomUUID();
      claimExecutionContinuationAtomic(projectRoot, checkpoint.checkpoint, {
        checkpointSha256: checkpoint.checkpointSha256,
        continuationAttemptId,
        continuationFence: 'xverify-continuation-fence',
      });
      continuationRef = createTaskResultSettlementRefForAttempt(
        projectRoot,
        taskId,
        continuationAttemptId,
      );
      writeTaskResultSettlementAttemptAtomic(continuationRef);
      claimTaskResultSettlementAttemptAtomic(continuationRef);

      const monitor = new RuntimeBudgetMonitor({
        projectRoot,
        taskId,
        attemptId: continuationAttemptId,
        backend: 'docker',
        budget: { maxTurns: 10, maxCacheReadTokens: 300 },
        landingAlreadySatisfied: true,
        counterScope: 'attempt',
        onStop: vi.fn(),
      });
      monitor.observe({
        type: 'text',
        content: {
          type: 'assistant',
          message: {
            id: 'msg-continuation',
            usage: {
              input_tokens: 20,
              output_tokens: 5,
              cache_read_input_tokens: 301,
              cache_creation_input_tokens: 10,
            },
            content: [],
          },
        },
      });

      writeTaskResultSettlementAtomic(createTaskResultSettlement({
        ref: continuationRef,
        exitCode: 0,
        result: {
          taskId,
          selfAssessment: 'NO_GO',
          testsPassed: false,
          notes: `Runtime budget circuit breaker invalidated the worker result. attemptId=${continuationAttemptId}`,
        },
      }));
      writeTaskResultSettlementClosureAtomic(continuationRef, {
        containerDisposition: 'stopped-removed',
        locksReleased: true,
      });
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
        normalizedLogEvent(1, 'text', {
          type: 'assistant',
          message: {
            content: [{
              type: 'text',
              text: 'Bounded claim supported.\nVERDICT: CONFIRMED exact continuation evidence',
            }],
          },
        }),
        'utf-8',
      );
      return { backend: 'docker', provider: 'claude', settlementRef: parentRef };
    });

    const task = makeTask({ provider: 'codex', model: 'gpt-5.6-sol' });
    const originalResult = makeResult();
    writeResultFile(task.id, originalResult);
    const res = await runCrossVerify(
      root,
      task,
      originalResult,
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'unclear',
      disposition: 'advisory',
      advisory: {
        verdict: 'unclear',
        reason: 'host-execution-not-completed:budget-exhausted',
        execution: {
          outcome: 'budget-exhausted',
          terminalAttemptId: continuationRef!.attemptId,
          reason: 'cache-read token budget exceeded (301 > 300)',
          cumulativeUsage: {
            turns: 3,
            inputTokens: 120,
            outputTokens: 55,
            cacheReadTokens: 801,
            cacheCreationTokens: 60,
            totalTokens: 1036,
            maxContextTokens: 650,
          },
        },
      },
    });
    expect(res.advisory?.execution?.initialAttemptId)
      .not.toBe(res.advisory?.execution?.terminalAttemptId);
    expect(defaultSpawnMocks.finalizeTaskStatusFromSettlement)
      .toHaveBeenCalledWith(root, `${task.id}-xverify`, continuationRef);
    expect(readResultFile(task.id).crossVerify).toMatchObject({
      outcome: 'unclear',
      execution: {
        outcome: 'budget-exhausted',
        terminalAttemptId: continuationRef!.attemptId,
      },
    });
  });

  it('uses a provider-log verdict only as advisory evidence without synthesizing settlement', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
        JSON.stringify({
          taskId,
          workerId: `docker-${taskId}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          markerType: 'EXIT_WITHOUT_RESULT',
          workPresent: false,
          diffStat: '',
          exitCode: 0,
          notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
          tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
          providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
        }),
        'utf-8',
      );
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
        [
          normalizedLogEvent(1, 'text', {
            type: 'user',
            message: { content: [{ type: 'text', text: 'VERDICT: REFUTED prompt example' }] },
          }),
          normalizedLogEvent(2, 'text', {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Bounded evidence was insufficient.\nVERDICT: UNCLEAR exact receipt was not present' }] },
          }),
          normalizedLogEvent(3, 'usage', {
            type: 'result',
            result: 'VERDICT: CONFIRMED copied usage envelope',
          }),
        ].join('\n'),
        'utf-8',
      );
      return { backend: 'docker', provider: 'claude' };
    });
    defaultSpawnMocks.pollForResultFile.mockResolvedValueOnce({
      notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'unclear',
      advisory: {
        verdict: 'unclear',
        reason: 'exact receipt was not present',
      },
    });

    const unreconciled = JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.result'),
      'utf-8',
    )) as Record<string, unknown>;
    expect(unreconciled).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      markerType: 'EXIT_WITHOUT_RESULT',
      workPresent: false,
      diffStat: '',
      exitCode: 0,
      tokenUsage: { inputTokens: 11, outputTokens: 22, cacheReadTokens: 33 },
      providerBilling: { source: 'provider-envelope', providerReportedUsd: 0.25 },
    });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    ))).toMatchObject({ id: '276-001-xverify', status: 'FAILED' });
  });

  it('waits for a provider log finalized shortly after the wrapper marker', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
        JSON.stringify({
          taskId,
          workerId: `docker-${taskId}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          markerType: 'EXIT_WITHOUT_RESULT',
          notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
          tokenUsage: { inputTokens: 101, outputTokens: 202, cacheReadTokens: 303 },
        }),
        'utf-8',
      );
      setTimeout(() => {
        writeFileSync(
          join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
          [
            normalizedLogEvent(1, 'text', {
              type: 'user',
              message: { content: [{ type: 'text', text: 'VERDICT: REFUTED prompt example' }] },
            }),
            normalizedLogEvent(2, 'text', {
              type: 'assistant',
              message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED delayed normalized log is authoritative' }] },
            }),
          ].join('\n'),
          'utf-8',
        );
      }, 25);
      return { backend: 'docker', provider: 'claude' };
    });
    defaultSpawnMocks.pollForResultFile.mockResolvedValueOnce({
      notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['codex', 'claude'], verifierModel: 'claude-fable-5' },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'confirmed',
      advisory: {
        verdict: 'confirmed',
        reason: 'delayed normalized log is authoritative',
      },
    });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.result'),
      'utf-8',
    ))).toMatchObject({
      selfAssessment: 'NO_GO',
      testsPassed: false,
      markerType: 'EXIT_WITHOUT_RESULT',
      tokenUsage: { inputTokens: 101, outputTokens: 202, cacheReadTokens: 303 },
    });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    ))).toMatchObject({ id: '276-001-xverify', status: 'DONE' });
  });

  it('settles the verifier twin FAILED (never fabricated DONE) when no terminal verdict exists', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
        JSON.stringify({
          taskId,
          selfAssessment: 'NO_GO',
          testsPassed: false,
          markerType: 'EXIT_WITHOUT_RESULT',
          notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
        }),
        'utf-8',
      );
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.log`),
        [
          normalizedLogEvent(1, 'text', {
            type: 'user',
            message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED prompt echo' }] },
          }),
          normalizedLogEvent(2, 'text', {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED premature' }] },
          }),
          normalizedLogEvent(3, 'text', {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'I kept working after the verdict.' }] },
          }),
          normalizedLogEvent(4, 'usage', {
            type: 'result',
            result: 'VERDICT: CONFIRMED usage echo',
          }),
        ].join('\n'),
        'utf-8',
      );
      return { backend: 'docker', provider: 'claude' };
    });
    defaultSpawnMocks.pollForResultFile.mockResolvedValueOnce({
      notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      {
        availableProviders: ['codex', 'claude'],
        verifierModel: 'claude-fable-5',
        timeoutMs: 0,
      },
    );

    expect(res).toMatchObject({ ran: true, outcome: 'unclear' });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.result'),
      'utf-8',
    ))).toMatchObject({ selfAssessment: 'NO_GO', markerType: 'EXIT_WITHOUT_RESULT' });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.json'),
      'utf-8',
    ))).toMatchObject({ id: '276-001-xverify', status: 'FAILED' });
  });

  it('waits through finalization and rejects a verdict followed by a later assistant continuation', async () => {
    defaultSpawnMocks.spawnWorkerMultiProvider.mockImplementationOnce(async (taskId, _model, _prompt, projectRoot) => {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${taskId}.result`),
        JSON.stringify({
          taskId,
          selfAssessment: 'NO_GO',
          testsPassed: false,
          markerType: 'EXIT_WITHOUT_RESULT',
          notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
        }),
        'utf-8',
      );
      const logPath = join(projectRoot, TASKS_DIR, `task-${taskId}.log`);
      writeFileSync(
        logPath,
        normalizedLogEvent(1, 'text', {
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'VERDICT: CONFIRMED premature' }] },
        }),
        'utf-8',
      );
      setTimeout(() => {
        appendFileSync(
          logPath,
          `\n${normalizedLogEvent(2, 'text', {
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'I kept working after the verdict.' }] },
          })}`,
          'utf-8',
        );
      }, 25);
      return { backend: 'docker', provider: 'claude' };
    });
    defaultSpawnMocks.pollForResultFile.mockResolvedValueOnce({
      notes: 'Worker exited without writing result. EXIT_WITHOUT_RESULT marker.',
    });

    const res = await runCrossVerify(
      root,
      makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      {
        availableProviders: ['codex', 'claude'],
        verifierModel: 'claude-fable-5',
        timeoutMs: 100,
      },
    );

    expect(res).toMatchObject({ ran: true, outcome: 'unclear' });
    expect(JSON.parse(readFileSync(
      join(root, TASKS_DIR, 'task-276-001-xverify.result'),
      'utf-8',
    ))).toMatchObject({ selfAssessment: 'NO_GO', markerType: 'EXIT_WITHOUT_RESULT' });
  });

  it('enabled + high-stakes + 2 providers + CONFIRMED → runs, writes advisory, not refuted', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('Examined the diff.\nVERDICT: CONFIRMED jwt checks present');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.outcome).toBe('confirmed');
    expect(res.refuted).toBe(false);
    expect(res.advisory?.verdict).toBe('confirmed');
    expect(res.advisory?.verifier).toBe('codex'); // different from claude task provider
    // spawn received the adversarial refute prompt
    expect(calls.length).toBe(1);
    expect(calls[0]!.prompt).toMatch(/REFUTE/i);
    expect(calls[0]!.verifierProvider).toBe('codex');
    expect(calls[0]!.verifierModel).toBe(TIER_EQUIVALENT_VERIFIER_MODEL);
    expect(calls[0]!.executionBudget).toEqual({ maxCacheReadTokens: 1_000_000, maxTurns: 12 });
    expect(calls[0]!.spawnBackend).toBe('docker');
    // advisory persisted to .result, original fields preserved
    const persisted = readResultFile('276-001');
    expect(persisted.crossVerify?.verdict).toBe('confirmed');
    expect(persisted.crossVerify?.verifier).toBe('codex');
    expect(persisted.crossVerify?.verifierModel).toBe(TIER_EQUIVALENT_VERIFIER_MODEL);
    expect(persisted.selfAssessment).toBe('DONE');
  });

  it('threads an explicit claim-adjudication operation class into the verifier prompt', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED dependency order supported');
    const res = await runCrossVerify(
      root,
      makeTask({
        description: 'M1 should precede M2 because M2 consumes the budget M1 protects.',
        goNogo: {
          goCriteria: 'Bounded evidence supports the material premises and dependency order.',
          noGoCriteria: 'A prerequisite reversal is proven.',
          techDebtAcceptable: 'none',
        },
      }),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      {
        availableProviders: TWO_PROVIDERS,
        spawnVerifier: fn,
        operationClass: 'adjudicate-claim',
      },
    );

    expect(res).toMatchObject({
      outcome: 'unclear',
      disposition: 'advisory',
      advisory: {
        verdict: 'unclear',
        reason: 'legacy-free-form-cannot-confirm',
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.prompt).toContain('Operation class: `adjudicate-claim`');
    expect(calls[0]!.prompt).toContain('Do not require a future milestone behavior to');
  });

  it('REFUTED verdict → refuted=true, advisory written, evaluation NOT downgraded', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: REFUTED signature check is missing on the refresh path');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.outcome).toBe('refuted');
    expect(res.refuted).toBe(true);
    // Default (enforce_refuted unset) → advisory-only: blocked is false (323-004).
    expect(res.blocked).toBe(false);
    expect(res.advisory?.verdict).toBe('refuted');
    expect(res.advisory?.reason).toMatch(/signature check is missing/);
    // No downgrade: the runner never touches selfAssessment / evaluation.
    const persisted = readResultFile('276-001');
    expect(persisted.selfAssessment).toBe('DONE');
    expect(persisted.crossVerify?.verdict).toBe('refuted');
  });

  it('unparseable verifier output → verdict "unclear" (honest non-result), still runs', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('I looked at it and have no strong opinion.');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.outcome).toBe('unclear');
    expect(res.disposition).toBe('advisory');
    expect(res.refuted).toBe(false);
    expect(res.advisory?.verdict).toBe('unclear');
  });
});

describe('runCrossVerify — mandatory exact-coordinator enforcement', () => {
  it('allows only a typed host-derived confirmation with a durable verdict receipt', async () => {
    writeResultFile('276-001', makeResult());
    const typed = typedAdjudicationFixture('supported');
    const output = `${CROSS_VERIFY_ADJUDICATION_RESPONSE_PREFIX}${JSON.stringify(typed.response)}\n`
      + 'VERDICT: CONFIRMED typed response agrees';
    const exact = mandatoryComposition(exactCoordinatorSettled(output));
    const persist = vi.fn(() => ({
      verdictReceiptRef: `cross-verify-verdict:sha256:${'a'.repeat(64)}`,
    }));

    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        mandatoryInvocation: {
          ...exact.composition,
          adjudication: { contract: typed.contract, persist },
        },
      },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'confirmed',
      disposition: 'allow',
      blocked: false,
      advisory: {
        verdict: 'confirmed',
        assurance: 'typed-host-adjudicated',
        adjudicationReceiptRef:
          `cross-verify-verdict:sha256:${'a'.repeat(64)}`,
      },
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(persist.mock.calls[0]![0].adjudication).toMatchObject({
      verdict: 'confirmed',
      disposition: 'accepted',
      reasonCode: 'confirmed-all-criteria-satisfied',
    });
  });

  it('HOLDs when provider terminal CONFIRMED disagrees with typed host derivation', async () => {
    writeResultFile('276-001', makeResult());
    const typed = typedAdjudicationFixture('contradicted');
    const output = `${CROSS_VERIFY_ADJUDICATION_RESPONSE_PREFIX}${JSON.stringify(typed.response)}\n`
      + 'VERDICT: CONFIRMED provider attempted to override the host';
    const exact = mandatoryComposition(exactCoordinatorSettled(output));
    const persist = vi.fn(() => ({
      verdictReceiptRef: `cross-verify-verdict:sha256:${'b'.repeat(64)}`,
    }));

    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        mandatoryInvocation: {
          ...exact.composition,
          adjudication: { contract: typed.contract, persist },
        },
      },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'unclear',
      disposition: 'hold',
      blocked: true,
      refuted: false,
      advisory: {
        verdict: 'unclear',
        assurance: 'typed-host-adjudicated',
      },
    });
    expect(persist.mock.calls[0]![0].adjudication).toMatchObject({
      verdict: 'unclear',
      disposition: 'fail-closed',
      reasonCode: 'provider-verdict-mismatch',
    });
  });

  it('projects a settled exact coordinator result without touching legacy spawn', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: REFUTED legacy path must not run');
    const exact = mandatoryComposition(
      exactCoordinatorSettled('VERDICT: CONFIRMED exact host authority is complete'),
    );

    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        mandatoryInvocation: exact.composition,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'confirmed',
      disposition: 'allow',
      refuted: false,
      blocked: false,
      advisory: {
        verifier: 'codex',
        verifierModel: 'gpt-5.6-sol',
        verdict: 'confirmed',
        execution: {
          outcome: 'completed',
          terminalAttemptId: '11111111-1111-4111-8111-111111111111',
        },
        invocationReceiptRef: {
          invocationId: 'invocation-mandatory-xverify',
        },
      },
    });
    expect(exact.execute).toHaveBeenCalledOnce();
    expect(exact.execute).toHaveBeenCalledWith(
      exact.composition.input,
      exact.composition.launcher,
    );
    expect(fn).not.toHaveBeenCalled();
    expect(exact.launcher).not.toHaveBeenCalled();
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'confirmed',
      verifier: 'codex',
      verifierModel: 'gpt-5.6-sol',
      invocationReceiptRef: {
        invocationId: 'invocation-mandatory-xverify',
      },
    });
  });

  it.each([
    ['REFUTED', 'refuted', true, 'no-go'],
    ['UNCLEAR', 'unclear', true, 'hold'],
  ] as const)(
    'maps exact terminal %s without opening a second verifier',
    async (protocolVerdict, outcome, blocked, disposition) => {
      writeResultFile('276-001', makeResult());
      const { fn } = makeSpawnSpy('VERDICT: CONFIRMED legacy path must not run');
      const exact = mandatoryComposition(
        exactCoordinatorSettled(
          `VERDICT: ${protocolVerdict} exact bounded rationale`,
        ),
      );

      const res = await runCrossVerify(
        root,
        makeTask(),
        makeResult(),
        TaskEvaluation.DONE,
        makeConfig({ enabled: true, enforce_refuted: true }),
        {
          mandatoryInvocation: exact.composition,
          spawnVerifier: fn,
        },
      );

      expect(res).toMatchObject({
        ran: true,
        outcome,
        blocked,
        disposition,
        refuted: outcome === 'refuted',
      });
      expect(exact.execute).toHaveBeenCalledOnce();
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['failed', 'worker exited before settlement'],
    ['budget-exhausted', 'output token budget exceeded'],
  ] as const)(
    'does not promote provider CONFIRMED when host execution is %s',
    async (executionOutcome, executionReason) => {
      writeResultFile('276-001', makeResult());
      const exact = mandatoryComposition(exactCoordinatorSettled(
        'VERDICT: CONFIRMED provider text is not host authority',
        {
          execution: {
            outcome: executionOutcome,
            initialAttemptId: '11111111-1111-4111-8111-111111111111',
            terminalAttemptId: '11111111-1111-4111-8111-111111111111',
            reason: executionReason,
          },
        },
      ));

      const res = await runCrossVerify(
        root,
        makeTask(),
        makeResult(),
        TaskEvaluation.DONE,
        makeConfig({ enabled: true, enforce_refuted: true }),
        { mandatoryInvocation: exact.composition },
      );

      expect(res).toMatchObject({
        ran: true,
        outcome: 'unclear',
        disposition: 'hold',
        blocked: true,
        refuted: false,
        advisory: {
          verdict: 'unclear',
          reason: `host-execution-not-completed:${executionOutcome}`,
          execution: { outcome: executionOutcome },
        },
      });
      expect(readResultFile('276-001').crossVerify).toMatchObject({
        outcome: 'unclear',
        verdict: 'unclear',
      });
    },
  );

  it('holds mandatory confirmation when canonical evidence cannot be persisted', async () => {
    const exact = mandatoryComposition(
      exactCoordinatorSettled('VERDICT: CONFIRMED provider text is not enough'),
    );

    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      { mandatoryInvocation: exact.composition },
    );

    expect(res).toMatchObject({
      ran: true,
      outcome: 'unavailable',
      disposition: 'hold',
      blocked: true,
      refuted: false,
      evidencePersisted: false,
      advisory: {
        verdict: 'unclear',
        reason: 'verifier-evidence-persistence-failed',
      },
    });
  });

  it.each([
    {
      state: 'hold' as const,
      reasonCode: 'XVERIFY_INVOCATION_USAGE_HOLD:window_mapper_unavailable',
      authorityEvidenceRef: 'xverify-authority-hold:mandatory',
      invocationReceiptRef: null,
    },
    {
      state: 'reconciliation-required' as const,
      reasonCode: 'XVERIFY_INVOCATION_OBSERVATION_HOLD:settlement_incomplete',
      authorityEvidenceRef: 'xverify-authority-reconcile:mandatory',
      invocationReceiptRef: {
        schemaVersion: 1 as const,
        tenantId: 'tenant-a',
        projectId: 'project-a',
        invocationId: 'invocation-mandatory-xverify',
      },
      providerLimitDispatchEvidenceRef: 'provider-limit-dispatch:mandatory',
    },
  ])(
    'maps exact coordinator $state to unavailable+blocked without fallback',
    async coordinatorResult => {
      writeResultFile('276-001', makeResult());
      const { fn } = makeSpawnSpy('VERDICT: CONFIRMED legacy path must not run');
      const exact = mandatoryComposition(coordinatorResult);

      const res = await runCrossVerify(
        root,
        makeTask(),
        makeResult(),
        TaskEvaluation.DONE,
        makeConfig({ enabled: true, enforce_refuted: true }),
        {
          mandatoryInvocation: exact.composition,
          spawnVerifier: fn,
        },
      );

      expect(res).toMatchObject({
        ran: false,
        outcome: 'unavailable',
        disposition: 'hold',
        blocked: true,
        skippedReason:
          `verifier-exact-invocation-${coordinatorResult.state}:${coordinatorResult.reasonCode}`,
      });
      expect(exact.execute).toHaveBeenCalledOnce();
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it('maps an exact coordinator fault to unavailable+blocked without legacy fallback', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: CONFIRMED legacy path must not run');
    const exact = mandatoryComposition(new Error('authority storage unavailable'));

    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        mandatoryInvocation: exact.composition,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      outcome: 'unavailable',
      disposition: 'hold',
      blocked: true,
      skippedReason: 'unexpected-error: authority storage unavailable',
    });
    expect(exact.execute).toHaveBeenCalledOnce();
    expect(fn).not.toHaveBeenCalled();
  });

  it('keeps config default-off ahead of the exact coordinator', async () => {
    const exact = mandatoryComposition(
      exactCoordinatorSettled('VERDICT: CONFIRMED must not execute'),
    );
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig(undefined),
      { mandatoryInvocation: exact.composition },
    );

    expect(res).toMatchObject({
      ran: false,
      outcome: 'disabled',
      disposition: 'not-applicable',
      blocked: false,
    });
    expect(exact.execute).not.toHaveBeenCalled();
  });

  it('does not let a legacy REFUTED spawn satisfy mandatory verification', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: REFUTED signature check is missing on the refresh path');
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );
    expect(res.ran).toBe(false);
    expect(res.refuted).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res).toMatchObject({
      outcome: 'unavailable',
      skippedReason: 'verifier-exact-invocation-coordinator-not-composed',
    });
    expect(fn).not.toHaveBeenCalled();
    const persisted = readResultFile('276-001');
    expect(persisted.selfAssessment).toBe('DONE');
    expect(persisted.crossVerify).toEqual({
      outcome: 'unavailable',
      reason: 'verifier-exact-invocation-coordinator-not-composed',
    });
  });

  it('does not let a legacy CONFIRMED spawn fabricate mandatory success', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: CONFIRMED jwt checks present');
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );
    expect(res.ran).toBe(false);
    expect(res.refuted).toBe(false);
    expect(res.blocked).toBe(true);
    expect(res.skippedReason).toBe(
      'verifier-exact-invocation-coordinator-not-composed',
    );
    expect(fn).not.toHaveBeenCalled();
  });

  it('enforce_refuted=false (explicit) + REFUTED → blocked=false (advisory-only)', async () => {
    writeResultFile('276-001', makeResult());
    const { fn } = makeSpawnSpy('VERDICT: REFUTED missing check on the refresh path');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.refuted).toBe(true);
    expect(res.blocked).toBe(false);
    expect(res.disposition).toBe('advisory');
  });
});

describe('runCrossVerify — advisory InvocationReceipt lifecycle', () => {
  it('holds enforced verification before dispatch when receipt authority is missing', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const onVerifierDispatch = vi.fn();
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        verifierCandidates: [exactCandidate()],
        spawnVerifier: fn,
        onVerifierDispatch,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: true,
      outcome: 'unavailable',
      skippedReason: 'verifier-exact-invocation-coordinator-not-composed',
    });
    expect(calls).toHaveLength(0);
    expect(onVerifierDispatch).not.toHaveBeenCalled();
  });

  it('settles an explicit terminal UNCLEAR as an accepted verifier protocol result', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const { fn } = makeSpawnSpy('VERDICT: UNCLEAR bounded evidence is insufficient');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({ ran: true, blocked: false, outcome: 'unclear' });
    const view = invocation.store.get(
      { tenantId: 'tenant-a', projectId: invocation.store.projectId },
      invocation.receipt.invocationId,
    );
    expect(view?.transportOutcome).toBe('succeeded');
    expect(view?.consumerOutcome).toBe('accepted');
    expect(view?.events.at(-1)?.payload).toEqual({
      outcome: 'accepted',
      reasonCode: 'none',
    });
  });

  it('records malformed output as a consumer parse rejection without fabricating success', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const { fn } = makeSpawnSpy('No terminal protocol line was emitted.');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({ ran: true, outcome: 'unclear' });
    const view = invocation.store.get(
      { tenantId: 'tenant-a', projectId: invocation.store.projectId },
      invocation.receipt.invocationId,
    );
    expect(view?.transportOutcome).toBe('succeeded');
    expect(view?.consumerOutcome).toBe('rejected');
    expect(view?.events.at(-1)?.payload).toEqual({
      outcome: 'rejected',
      reasonCode: 'parse_failed',
    });
  });

  it('settles a thrown spawn as failed transport and rejected consumer', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const fn: SpawnVerifierFn = vi.fn(async () => {
      throw new Error('provider transport failed');
    });
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: false,
      outcome: 'unavailable',
      skippedReason: 'spawn-error',
      evidencePersisted: true,
    });
    const view = invocation.store.get(
      { tenantId: 'tenant-a', projectId: invocation.store.projectId },
      invocation.receipt.invocationId,
    );
    expect(view?.events.map(event => event.type)).toEqual([
      'dispatch_started',
      'transport_settled',
      'consumer_settled',
    ]);
    expect(view?.transportOutcome).toBe('failed');
    expect(view?.consumerOutcome).toBe('rejected');
  });

  it('rejects an immutable receipt binding mismatch before declaration or dispatch', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate, {
      backend: { transport: 'api', executionBackend: 'api' },
    });
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: false,
      outcome: 'unavailable',
      skippedReason: 'verifier-invocation-receipt-binding-failed:backend-binding-mismatch',
    });
    expect(calls).toHaveLength(0);
    expect(invocation.store.get(
      { tenantId: 'tenant-a', projectId: invocation.store.projectId },
      invocation.receipt.invocationId,
    )).toBeNull();
  });

  it('accepts a contiguous fallback chain ending at the admitted exact candidate', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate, {
      requested: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        source: 'directive',
        reasonCode: 'none',
      },
      fallbackChain: [{
        sequence: 1,
        fromProvider: 'gemini',
        fromModel: 'gemini-2.5-flash',
        toProvider: candidate.provider,
        toModel: candidate.model,
        reasonCode: 'fallback_unreachable',
        reachabilityRef: candidate.reachability.evidenceRef,
        limitEvidenceRefs: [...candidate.limits.evidenceRefs],
      }],
    });
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED fallback provenance is exact');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({ ran: true, outcome: 'confirmed', blocked: false });
    expect(calls).toHaveLength(1);
  });

  it('blocks an invalid fallback chain before declaration or provider work', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate, {
      requested: {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        source: 'directive',
        reasonCode: 'none',
      },
      fallbackChain: [{
        sequence: 2,
        fromProvider: 'gemini',
        fromModel: 'gemini-2.5-flash',
        toProvider: candidate.provider,
        toModel: candidate.model,
        reasonCode: 'fallback_unreachable',
        reachabilityRef: candidate.reachability.evidenceRef,
        limitEvidenceRefs: [...candidate.limits.evidenceRefs],
      }],
    });
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );

    expect(res.skippedReason).toBe(
      'verifier-invocation-receipt-binding-failed:fallback-chain-invalid',
    );
    expect(res.blocked).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('blocks a duplicate receipt declaration without a second provider call', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED exactly once');
    const options = {
      verifierCandidates: [candidate],
      invocationReceipt: invocation.context,
      spawnVerifier: fn,
    } as const;

    const first = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }), options,
    );
    const replay = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }), options,
    );

    expect(first.outcome).toBe('confirmed');
    expect(replay).toMatchObject({
      ran: false,
      blocked: false,
      outcome: 'unavailable',
      skippedReason: 'verifier-invocation-receipt-replay-blocked',
    });
    expect(calls).toHaveLength(1);
    expect(readResultFile('276-001').crossVerify?.invocationReceiptRef)
      .toMatchObject({ invocationId: invocation.receipt.invocationId });
  });

  it('blocks before provider work when dispatch_started cannot be persisted', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const failingLedger: InvocationReceiptLedger = {
      projectId: invocation.store.projectId,
      declare: invocation.store.declare.bind(invocation.store),
      append: () => {
        throw new Error('disk unavailable');
      },
      get: invocation.store.get.bind(invocation.store),
      close: () => {},
    };
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: { ...invocation.context, ledger: failingLedger },
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: false,
      outcome: 'unavailable',
      skippedReason: 'verifier-invocation-receipt-pre-dispatch-write-failed',
    });
    expect(calls).toHaveLength(0);
  });

  it('does not expose a semantic verdict when terminal receipt settlement fails', async () => {
    writeResultFile('276-001', makeResult());
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const failingLedger: InvocationReceiptLedger = {
      projectId: invocation.store.projectId,
      declare: invocation.store.declare.bind(invocation.store),
      append: (scope, invocationId, event) => {
        if (event.type === 'consumer_settled') throw new Error('consumer settlement unavailable');
        return invocation.store.append(scope, invocationId, event);
      },
      get: invocation.store.get.bind(invocation.store),
      close: () => {},
    };
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED provider completed');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: { ...invocation.context, ledger: failingLedger },
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: false,
      outcome: 'unavailable',
      skippedReason: 'verifier-invocation-receipt-settlement-write-failed',
    });
    expect(calls).toHaveLength(1);
    expect(invocation.store.get(
      { tenantId: 'tenant-a', projectId: invocation.store.projectId },
      invocation.receipt.invocationId,
    )?.events.map(event => event.type)).toEqual([
      'dispatch_started',
      'transport_settled',
    ]);
  });
});

describe('runCrossVerify — honest-skip paths', () => {
  it('blocks enforced verification when only a provider-name list is supplied', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: true,
      outcome: 'unavailable',
      skippedReason: 'verifier-exact-invocation-coordinator-not-composed',
      evidencePersisted: true,
    });
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toEqual({
      outcome: 'unavailable',
      reason: 'verifier-exact-invocation-coordinator-not-composed',
    });
  });

  it('does not let exact evidence plus a legacy receipt bypass the mandatory coordinator', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED exact evidence');
    const candidate = exactCandidate();
    const invocation = exactInvocationReceipt(candidate);
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: true }),
      {
        verifierCandidates: [candidate],
        invocationReceipt: invocation.context,
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: true,
      outcome: 'unavailable',
      skippedReason: 'verifier-exact-invocation-coordinator-not-composed',
    });
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toEqual({
      outcome: 'unavailable',
      reason: 'verifier-exact-invocation-coordinator-not-composed',
    });
    expect(invocation.store.get(
      { tenantId: 'tenant-a', projectId: invocation.store.projectId },
      'inv-xverify-276-001',
    )).toBeNull();
  });

  it('blocks advisory exact verification for unknown reachability before dispatch', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [exactCandidate({
          reachability: {
            state: 'unknown',
            reachable: true,
            evidenceRef: 'provider-reachability:unknown-evidence',
          },
        })],
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: false,
      outcome: 'unavailable',
      skippedReason: expect.stringMatching(/no second provider/i),
    });
    expect(calls).toHaveLength(0);
  });

  it('blocks an advisory exact candidate whose model is not capability-equivalent', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      {
        verifierCandidates: [exactCandidate({ model: 'gpt-5.6-sol' })],
        spawnVerifier: fn,
      },
    );

    expect(res).toMatchObject({
      ran: false,
      blocked: false,
      outcome: 'unavailable',
      skippedReason: expect.stringContaining('does not match capability-equivalent'),
    });
    expect(calls).toHaveLength(0);
  });

  it('does not promote registry/catalog presence into verifier eligibility', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { spawnVerifier: fn },
    );

    expect(res).toMatchObject({
      ran: false,
      outcome: 'unavailable',
      skippedReason: 'verifier-eligibility-evidence-missing',
      evidencePersisted: true,
    });
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toEqual({
      outcome: 'unavailable',
      reason: 'verifier-eligibility-evidence-missing',
    });
  });

  it('uses catalog local economics for an Ollama verifier without owner remote budget', async () => {
    writeResultFile('276-001', makeResult());
    ensureOllamaModelRegistered('qwen3.6:27b');
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED local verifier completed');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, high_stakes_only: false }, { execution_budget: undefined }),
      {
        availableProviders: ['claude', 'ollama'],
        verifierModel: 'qwen3.6:27b',
        spawnVerifier: fn,
      },
    );
    expect(res.outcome).toBe('confirmed');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ verifierProvider: 'ollama', executionBudget: undefined });
  });

  it('final-only verifier without owner authorization → durable HOLD before any spend', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const config = makeConfig({ enabled: true });
    // Owner authored no final-only allowance: codex reports usage only at call
    // end, so its token ceilings could not be enforced in flight.
    delete (config.execution_budget as { final_only_usage?: unknown }).final_only_usage;
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE, config,
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toBe('verifier-final-only-usage-hold:codex:final-only');
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unavailable',
      verifier: 'codex',
      reason: 'verifier-final-only-usage-hold:codex:final-only',
    });
  });

  it('authorized final-only verifier carries the owner wall-clock containment into the spawn', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED codex verified the bounded evidence');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.outcome).toBe('confirmed');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      verifierProvider: 'codex',
      finalOnlyUsageContainment: {
        maxWallClockSeconds: 300,
        profileRef: 'execution_budget.final_only_usage',
      },
    });
  });

  it('an incremental-usage verifier never receives a final-only containment grant', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED claude verified the bounded evidence');
    const res = await runCrossVerify(
      root, makeTask({ provider: 'codex', model: 'gpt-5.6-sol' }), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_priority: ['claude'] }),
      { availableProviders: ['claude', 'codex'], spawnVerifier: fn },
    );
    expect(res.outcome).toBe('confirmed');
    expect(calls[0]?.verifierProvider).toBe('claude');
    expect(calls[0]?.finalOnlyUsageContainment).toBeUndefined();
  });

  it('missing auditor budget policy → durable HOLD before verifier dispatch', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }, { execution_budget: undefined }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toContain('verifier-budget-hold:budget-policy-missing');
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unavailable',
      reason: expect.stringContaining('verifier-budget-hold:budget-policy-missing'),
    });
  });

  it('holds before verifier dispatch when the owner turn reserve cannot finish the finite protocol', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED must not run');
    const onVerifierDispatch = vi.fn();
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }, {
        execution_budget: {
          roles: { auditor: { default: { maxCacheReadTokens: 200_000, maxTurns: 4 } } },
          landing: { reserve_ratio: 0.25 },
          unmetered_backend: { action: 'reroute-or-hold', ordered_backends: ['docker'] },
        },
      } as Partial<ResolvedConfig>),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn, onVerifierDispatch },
    );
    expect(res).toMatchObject({
      ran: false,
      outcome: 'unavailable',
      skippedReason: expect.stringContaining(
        'landing-turn-reserve-insufficient:execution_budget.roles.auditor.default.maxTurns:guaranteed=1:required=3',
      ),
    });
    expect(calls).toHaveLength(0);
    expect(onVerifierDispatch).not.toHaveBeenCalled();
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unavailable',
      reason: expect.stringContaining('landing-turn-reserve-insufficient'),
    });
  });

  it('single provider (no different provider) → honest-skip, spawn never called', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: ['claude'], spawnVerifier: fn }, // only the task's own provider
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toMatch(/no second provider/i);
    expect(res.evidencePersisted).toBe(true);
    expect(calls.length).toBe(0);
    expect(readResultFile('276-001').crossVerify).toEqual({
      outcome: 'unavailable',
      reason: 'no second provider available; honest-skip',
    });
  });

  it('low-stakes task with high_stakes_only=true (default) → skip, spawn never called', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeLowStakesTask(), makeResult({ taskId: '276-002' }), TaskEvaluation.DONE,
      makeConfig({ enabled: true }), // high_stakes_only defaults true
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('not-applicable');
    expect(res.skippedReason).toMatch(/not high-stakes/i);
    expect(calls.length).toBe(0);
  });

  it('low-stakes task with high_stakes_only=false → verifies anyway', async () => {
    writeResultFile('276-002', makeResult({ taskId: '276-002' }));
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED clean refactor');
    const onVerifierDispatch = vi.fn();
    const res = await runCrossVerify(
      root, makeLowStakesTask(), makeResult({ taskId: '276-002' }), TaskEvaluation.DONE,
      makeConfig({ enabled: true, high_stakes_only: false }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn, onVerifierDispatch },
    );
    expect(res.ran).toBe(true);
    expect(res.advisory?.verdict).toBe('confirmed');
    expect(calls.length).toBe(1);
    expect(onVerifierDispatch).toHaveBeenCalledOnce();
    expect(onVerifierDispatch).toHaveBeenCalledWith({
      verifierProvider: 'codex',
      verifierModel: TIER_EQUIVALENT_VERIFIER_MODEL,
      // codex settles usage only at call end — the caller learns the honest
      // containment window before any spend.
      finalOnlyContainment: { maxWallClockSeconds: 300 },
    });
  });
});

describe('runCrossVerify — fail-safe + verifier selection', () => {
  it('preserves exact API IDs and auditor budget for a Codex-authored Fable verification', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED exact API IDs preserved');
    const task = makeTask({ provider: 'codex', model: 'gpt-5.6-sol' });
    const res = await runCrossVerify(
      root, task, makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      {
        availableProviders: ['codex', 'claude'],
        spawnVerifier: fn,
        verifierModel: 'claude-fable-5',
      },
    );
    expect(res.outcome).toBe('confirmed');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.verifierProvider).toBe('claude');
    expect(calls[0]!.verifierModel).toBe('claude-fable-5');
    expect(calls[0]!.executionBudget).toEqual({ maxCacheReadTokens: 1_000_000, maxTurns: 12 });
    expect(calls[0]!.spawnBackend).toBe('docker');
  });

  it('spawn throws → does NOT throw, records explicit unavailable evidence', async () => {
    writeResultFile('276-001', makeResult());
    const fn: SpawnVerifierFn = vi.fn(async () => { throw new Error('verifier boom'); });
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.ran).toBe(false);
    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toBe('spawn-error');
    expect(res.evidencePersisted).toBe(true);
    expect(res.refuted).toBe(false);
    // Original result remains intact and the non-result is durable/auditable.
    const persisted = readResultFile('276-001');
    expect(persisted.crossVerify).toEqual({
      outcome: 'unavailable',
      verifier: 'codex',
      verifierModel: TIER_EQUIVALENT_VERIFIER_MODEL,
      reason: 'spawn-error',
    });
    expect(persisted.selfAssessment).toBe('DONE');
  });

  it('reports evidencePersisted=false when the canonical result is missing', async () => {
    const fn: SpawnVerifierFn = vi.fn(async () => { throw new Error('verifier boom'); });
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn },
    );
    expect(res.outcome).toBe('unavailable');
    expect(res.evidencePersisted).toBe(false);
  });

  it('uses the production factory in both policy modes and preserves typed HOLD semantics', async () => {
    writeResultFile('276-001', makeResult());
    const compose = vi.fn(() => ({
      state: 'hold' as const,
      reasonCode: 'xverify_execution_profile_unavailable',
      authorityEvidenceRef: 'xverify-production-ingress:test-hold',
      verifierProvider: 'codex' as const,
      verifierModel: 'gpt-5.6-sol',
    }));
    const mandatory = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({
        enabled: true,
        enforce_refuted: true,
        high_stakes_only: false,
      }),
      {
        mandatoryInvocationFactory: { compose },
        verifierModel: 'gpt-5.6-sol',
      },
    );
    expect(compose).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledWith(expect.objectContaining({
      verifierModel: 'gpt-5.6-sol',
    }));
    expect(mandatory).toMatchObject({
      outcome: 'unavailable',
      blocked: true,
      verifier: 'codex',
      verifierModel: 'gpt-5.6-sol',
      skippedReason: expect.stringContaining('xverify_execution_profile_unavailable'),
    });
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unavailable',
      verifier: 'codex',
      verifierModel: 'gpt-5.6-sol',
      authorityEvidenceRef: 'xverify-production-ingress:test-hold',
    });

    compose.mockClear();
    const advisory = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      { mandatoryInvocationFactory: { compose }, availableProviders: [] },
    );
    expect(compose).toHaveBeenCalledTimes(1);
    expect(advisory).toMatchObject({
      outcome: 'unavailable',
      disposition: 'advisory',
      blocked: false,
      verifier: 'codex',
      verifierModel: 'gpt-5.6-sol',
    });
  });

  it('records exact advisory UNCLEAR without allowing it to block settlement', async () => {
    writeResultFile('276-001', makeResult());
    const exact = mandatoryComposition(
      exactCoordinatorSettled('VERDICT: UNCLEAR exact bounded evidence is insufficient'),
    );
    const res = await runCrossVerify(
      root,
      makeTask(),
      makeResult(),
      TaskEvaluation.DONE,
      makeConfig({ enabled: true, enforce_refuted: false }),
      { mandatoryInvocation: exact.composition },
    );

    expect(res).toMatchObject({
      outcome: 'unclear',
      disposition: 'advisory',
      ran: true,
      blocked: false,
      advisory: {
        verdict: 'unclear',
        reason: 'exact bounded evidence is insufficient',
      },
    });
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unclear',
      verdict: 'unclear',
    });
  });

  it('verifier_priority config is respected when several providers qualify', async () => {
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED ok');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true, verifier_priority: ['gemini', 'codex'] }),
      { availableProviders: ['claude', 'codex', 'gemini'], spawnVerifier: fn },
    );
    expect(res.ran).toBe(true);
    expect(res.advisory?.verifier).toBe('gemini'); // first in priority among available ≠ claude
    expect(calls[0]!.verifierProvider).toBe('gemini');
    expect(calls[0]!.verifierModel).toBe('gemini-2.5-flash');
  });

  it('rejects an explicit verifier model owned by a different provider before spawn', async () => {
    writeResultFile('276-001', makeResult());
    const { fn, calls } = makeSpawnSpy('VERDICT: CONFIRMED should not run');
    const res = await runCrossVerify(
      root, makeTask(), makeResult(), TaskEvaluation.DONE,
      makeConfig({ enabled: true }),
      { availableProviders: TWO_PROVIDERS, spawnVerifier: fn, verifierModel: 'claude-opus-4-8' },
    );

    expect(res.outcome).toBe('unavailable');
    expect(res.skippedReason).toMatch(/belongs to claude, not codex/);
    expect(calls).toHaveLength(0);
    expect(readResultFile('276-001').crossVerify).toMatchObject({
      outcome: 'unavailable',
      verifier: 'codex',
      reason: expect.stringContaining('model-resolution-error'),
    });
  });
});
