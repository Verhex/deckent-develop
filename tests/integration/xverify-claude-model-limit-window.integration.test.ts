import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ApprovalAuthorityRuntimeService } from '../../src/core/approval-authority-runtime.js';
import type { ProviderLimitsConfig, ResolvedConfig } from '../../src/core/config-types.js';
import { TASKS_DIR } from '../../src/core/constants.js';
import { deriveProviderAccountBackendScopeRefHash } from '../../src/core/provider-evidence-producer.js';
import type { ProviderEvidenceSourceRegistration } from '../../src/core/provider-evidence-source-registry.js';
import { ProviderAuthorityKeyring } from '../../src/core/provider-authority-keyring.js';
import {
  ProviderAuthorityRuntimeService,
  type ProviderAuthorityRuntimeServiceReady,
} from '../../src/core/provider-authority-composition.js';
import { createProviderLimitPolicyAuthoritySnapshot } from '../../src/core/provider-limit-policy.js';
import { deriveProviderQuotaScopeRefHash } from '../../src/core/provider-limit-truth.js';
import { CLAUDE_FABLE_API_ID } from '../../src/core/model-registry.js';
import {
  createTaskResultSettlement,
  writeTaskResultSettlementAtomic,
  writeTaskResultSettlementClosureAtomic,
} from '../../src/core/task-result-settlement.js';
import {
  TaskEvaluation,
  TaskStatus,
  createGoNoGoCriterionItem,
  type Task,
  type TaskResult,
} from '../../src/core/types.js';
import { ClaudeSubscriptionLimitEvidenceSource } from '../../src/providers/claude-subscription-limit-evidence.js';
import { prepareCrossVerifyCandidateEvidence } from '../../src/orchestra/cross-verify-evidence-preparation.js';
import type {
  CrossVerifyInvocationExecutionGrant,
  CrossVerifyStrictLauncher,
  CrossVerifyTerminalEvidenceBundle,
} from '../../src/orchestra/cross-verify-invocation-coordinator.js';
import {
  createCrossVerifyProductionIngressAuthority,
  type CrossVerifyExecutionProfileAuthority,
} from '../../src/orchestra/cross-verify-production-ingress-authority.js';
import { runCrossVerify } from '../../src/orchestra/cross-verify-runner.js';

const NOW = new Date('2026-08-24T12:00:00.000Z');
const AUTHOR_MODEL = 'gpt-5.6-sol';
const OPUS_MODEL = 'claude-opus-5';
const PROFILE_REF = `docker-execution-profile:${'a'.repeat(64)}`;
const RUNTIME_FINGERPRINT = 'f'.repeat(64);
const IMAGE_REF = `sha256:${'1'.repeat(64)}`;
const TOOL_PROFILE_DIGEST = 'd'.repeat(64);
const STABLE_ACCOUNT_SUBJECT = 'claude-subscription-window-fixture';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

interface ScenarioInput {
  readonly id: string;
  readonly verifierModel: typeof OPUS_MODEL | typeof CLAUDE_FABLE_API_ID;
  readonly sessionPct: number;
  readonly weekAllPct: number;
  readonly weekFablePct: number;
}

function task(id: string): Task {
  return {
    id,
    title: 'XVerify Claude model-window production admission',
    description: 'Verify exact model-scoped provider limit admission.',
    model: AUTHOR_MODEL,
    provider: 'codex',
    effort: 'high',
    priority: 'CRITICAL',
    reason: 'production candidate admission integration',
    scope: { directories: [], filesRead: ['evidence.txt'], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: 'Exact candidate is admitted only under its required windows.',
      noGoCriteria: 'An exhausted required window reaches provider dispatch.',
      techDebtAcceptable: 'none',
      items: [createGoNoGoCriterionItem({
        polarity: 'go',
        statement: 'Exact candidate admission follows its required Claude limit windows.',
        evidenceRequirements: ['evidence.txt contains the bounded model-window fixture'],
      })],
    },
    status: TaskStatus.DONE,
    type: 'audit',
    sprintId: `sprint-${id}`,
  };
}

function result(id: string): TaskResult {
  return {
    taskId: id,
    workerId: `worker-${id}`,
    filesChanged: ['evidence.txt'],
    linesAdded: 1,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 100,
    selfAssessment: 'DONE',
    notes: 'bounded production-causal fixture',
  };
}

function providerLimits(
  accountRefHash: string,
  quotaScopeRefHash: string,
): ProviderLimitsConfig {
  return {
    schemaVersion: 1,
    authorityRef: 'provider-limit-authority:xverify-claude-window',
    policies: [{
      selector: {
        tenantId: 'main',
        provider: 'claude',
        accountRefHash,
        quotaScopeRefHash,
        authMode: 'subscription',
        backend: {
          transport: 'cli',
          executionBackend: 'docker',
          endpointRefHash: null,
        },
        requiredWindowIds: [
          'claude.session',
          'claude.week-all',
          'claude.week-fable',
        ],
        sourceScopes: [{
          sourceKind: 'provider-cli',
          authority: 'advisory',
          transport: 'cli',
          executionBackend: 'docker',
          endpointRefHash: null,
        }],
      },
      values: {
        warnAtRatio: 0.8,
        blockAtRatio: 0.95,
        minimumRemaining: {},
      },
    }],
  };
}

function config(limits: ProviderLimitsConfig, verifierModel: string): ResolvedConfig {
  return {
    auth_mode: 'subscription',
    spawn_backend: 'docker',
    provider_limit_authority: createProviderLimitPolicyAuthoritySnapshot({
      parent: limits,
      project: null,
    }),
    execution_budget: {
      roles: {
        auditor: {
          default: {
            maxCacheReadTokens: 100_000,
            maxTurns: 12,
          },
        },
      },
      landing: { reserve_ratio: 0.25 },
      unmetered_backend: {
        action: 'reroute-or-hold',
        ordered_backends: ['docker'],
      },
      purposes: {
        'reachability-probe': {
          maxInputTokens: 32_768,
          maxOutputTokens: 512,
          maxTokens: 33_280,
          timeoutMs: 60_000,
        },
        'xverify-adjudication': {
          maxTokens: 2_000_000,
          maxWallClockSeconds: 3_600,
          maxVerificationsPerSprint: 8,
        },
      },
    },
    cross_verify: {
      enabled: true,
      high_stakes_only: false,
      enforce_refuted: true,
      verifier_priority: ['claude'],
      verifier_model: { claude: verifierModel },
      verifier_tier_authority: {
        schema_version: 1,
        decisions: [{
          author_model: AUTHOR_MODEL,
          verifier_model: OPUS_MODEL,
          decision: 'allow',
          decision_ref: 'owner-tier-authority:sol-opus-5',
        }],
      },
      allow_non_reservable_subscription_adjudication: true,
    },
  } as ResolvedConfig;
}

function approvalRuntime(): ApprovalAuthorityRuntimeService {
  return {
    attendedExecutionApprovalAuthority: {
      submitProviderEvidenceProbe: vi.fn(),
      verifyAndClaimProviderEvidenceProbe: vi.fn((requestId, subject) => ({
        schemaVersion: 1,
        kind: 'provider-evidence-probe-claim',
        claimId: `aprpc-${'2'.repeat(32)}`,
        requestId,
        subjectDigest: '3'.repeat(64),
        subject,
        evidenceRef: `approval:aprp-${'4'.repeat(64)}`,
        grantedAt: NOW.toISOString(),
        expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
        claimedAt: NOW.toISOString(),
      })),
    },
  } as unknown as ApprovalAuthorityRuntimeService;
}

function terminalEvidence(
  grant: Readonly<CrossVerifyInvocationExecutionGrant>,
): CrossVerifyTerminalEvidenceBundle {
  return {
    output: 'VERDICT: CONFIRMED exact model-window production dispatch completed',
    actualCall: {
      provider: grant.provider,
      model: grant.model,
      backend: grant.backend,
      auth: grant.auth,
      evidenceRef: 'provider-call:xverify-claude-window',
    },
    execution: {
      outcome: 'completed',
      initialAttemptId: grant.attemptId,
      terminalAttemptId: grant.attemptId,
      cumulativeUsage: {
        turns: 1,
        inputTokens: 8,
        outputTokens: 5,
        cacheReadTokens: 1,
        cacheCreationTokens: 0,
        totalTokens: 14,
        maxContextTokens: 14,
      },
    },
    lineage: {
      coverage: 'complete',
      attemptIds: [grant.attemptId],
      settlementEvidenceRefs: ['task-result-settlement:xverify-claude-window'],
    },
    usageEvidenceRefs: ['provider-usage-source:xverify-claude-window'],
    transportEvent: {
      eventId: `transport-${grant.attemptId}`,
      type: 'transport_settled',
      payload: {
        outcome: 'succeeded',
        exitCode: 0,
        signal: null,
        reasonCode: 'none',
        durationMs: 1,
      },
    },
    consumerEvent: {
      eventId: `consumer-${grant.attemptId}`,
      type: 'consumer_settled',
      payload: { outcome: 'accepted', reasonCode: 'none' },
    },
  };
}

async function runScenario(input: ScenarioInput) {
  const base = mkdtempSync(join(tmpdir(), `deckent-xverify-window-${input.id}-`));
  tempRoots.push(base);
  const projectRoot = join(base, 'project');
  const globalRoot = join(base, 'global');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(globalRoot, { recursive: true });
  mkdirSync(join(projectRoot, TASKS_DIR), { recursive: true });
  writeFileSync(join(projectRoot, 'evidence.txt'), 'bounded model-window fixture\n', 'utf8');

  const { keyring } = ProviderAuthorityKeyring.create({
    dataDir: globalRoot,
    projectRoot,
    keyringIdFactory: () => `par-${input.id}-window`,
    keyIdFactory: () => `pak-${input.id}-window`,
    randomBytesFactory: size => Buffer.alloc(size, 0x61),
    now: () => NOW,
  });
  const accountRefHash = keyring.pseudonymizeAccount({
    tenantId: 'main',
    provider: 'claude',
    authMode: 'subscription',
    stableAccountIdentity: STABLE_ACCOUNT_SUBJECT,
  });
  const quotaScopeRefHash = deriveProviderQuotaScopeRefHash({
    tenantId: 'main',
    provider: 'claude',
    accountRefHash,
    authMode: 'subscription',
    backend: {
      transport: 'cli',
      executionBackend: 'docker',
      endpointRefHash: null,
    },
  });
  const limits = providerLimits(accountRefHash, quotaScopeRefHash);
  const limitProbe = vi.fn(async () => ({
    unavailable: false as const,
    sessionPct: input.sessionPct,
    sessionResetAt: null,
    weekAllPct: input.weekAllPct,
    weekAllResetAt: null,
    weekFablePct: input.weekFablePct,
    raw: `bounded-window-${input.id}`,
  }));
  const reachabilityProbe = vi.fn(async (request: { provider: string; model: string }) => ({
    outcome: 'succeeded' as const,
    calledProvider: request.provider,
    calledModel: request.model,
    providerRequestRefHash: '9'.repeat(64),
    latencyMs: 1,
  }));
  const limitSource = new ClaudeSubscriptionLimitEvidenceSource({
    now: () => NOW,
    probe: limitProbe,
  });
  const registration: ProviderEvidenceSourceRegistration = {
    provider: 'claude',
    authMode: 'subscription',
    transport: 'cli',
    executionBackend: 'docker',
    sources: {
      account: {
        authorityRef: 'provider-account-authority:claude-window',
        resolve: async request => ({
          state: 'ready',
          provider: request.provider,
          authMode: request.authMode,
          identityKind: 'provider-account',
          assurance: 'provider-verified',
          issuer: 'fixture-provider',
          stableSubject: STABLE_ACCOUNT_SUBJECT,
          evidenceRef: 'provider-account:claude-window-0001',
          credentialGenerationRef: 'credential-generation:claude-window-0001',
          backendScopeRefHash: deriveProviderAccountBackendScopeRefHash(request),
          fetchedAt: NOW.toISOString(),
          expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
        }),
      },
      limit: {
        authorityRef: limitSource.authorityRef,
        kind: limitSource.kind,
        authority: limitSource.authority,
        observe: observedInput => limitSource.observe(observedInput),
      },
      reachability: {
        authorityRef: 'provider-reachability-authority:claude-window',
        probe: reachabilityProbe,
      },
    },
  };

  const opened = ProviderAuthorityRuntimeService.open({
    mode: 'solo',
    projectRoot,
    platform: 'linux',
    env: { HOME: projectRoot, DECKENT_HOME: globalRoot },
    parentPolicy: { scope: 'global', config: limits },
    sourceRegistrations: [registration],
    receiptStoreOptions: {
      idFactory: () => `project-${input.id}-window`,
      now: () => NOW.toISOString(),
    },
    reachabilityTtlMs: 60_000,
    now: () => NOW,
  });
  expect(opened.state).toBe('ready');
  if (opened.state !== 'ready') {
    throw new Error(`provider authority fixture held: ${opened.reasonCode}`);
  }
  const providerAuthority: ProviderAuthorityRuntimeServiceReady = opened;

  const launcher = vi.fn(async (grant: Readonly<CrossVerifyInvocationExecutionGrant>) => {
    const settlementRef = grant.executionContract.settlementAttemptRef;
    writeTaskResultSettlementAtomic(createTaskResultSettlement({
      ref: settlementRef,
      exitCode: 0,
      result: {
        taskId: grant.executionContract.verifierTaskId,
        workerId: `verifier-${input.id}`,
        filesChanged: [],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: true,
        coverage: 100,
        selfAssessment: 'DONE',
        notes: 'VERDICT: CONFIRMED production-causal fixture',
      },
    }));
    writeTaskResultSettlementClosureAtomic(settlementRef, {
      containerDisposition: 'stopped-removed',
      locksReleased: true,
    });
    return {
      settlementRef,
      outputArtifactRef: `xverify-output:${input.id}-window`,
    };
  });
  const projectNonReservable = vi.fn(() => ({
    state: 'settled' as const,
    usage: { totalTokens: 14, inputTokens: 8, outputTokens: 5 },
    usageEvidenceRef: `provider-usage:${input.id}-window`,
    authorityEvidenceRef: `xverify-non-reservable-usage:${input.id}-window`,
  }));
  const executionProfiles: CrossVerifyExecutionProfileAuthority = {
    resolve: async ({ provider, model }) => ({
      state: 'ready',
      provider,
      model,
      authMode: 'subscription',
      transport: 'cli',
      executionBackend: 'docker',
      endpointRefHash: null,
      runtimeFingerprint: RUNTIME_FINGERPRINT,
      immutableImageRef: IMAGE_REF,
      executionProfileRef: PROFILE_REF,
      authLabel: 'subscription',
      toolProfileDigest: TOOL_PROFILE_DIGEST,
      launcher: launcher as CrossVerifyStrictLauncher,
      usageAuthority: {
        preflight: () => {
          throw new Error('reserved usage preflight must not run for subscription percent windows');
        },
        project: () => {
          throw new Error('reserved usage settlement must not run for subscription percent windows');
        },
        projectNonReservable,
      },
      observationAuthority: {
        observe: async ({ grant }) => ({
          state: 'settled',
          terminal: terminalEvidence(grant),
          authorityEvidenceRef: `xverify-observation:${input.id}-window`,
        }),
      },
      authorityEvidenceRef: `xverify-execution-profile:${input.id}-window`,
    }),
  };
  const scenarioConfig = config(limits, input.verifierModel);
  const scenarioTask = task(input.id);
  const scenarioResult = result(input.id);
  writeFileSync(
    join(projectRoot, TASKS_DIR, `task-${input.id}.result`),
    `${JSON.stringify(scenarioResult)}\n`,
    'utf8',
  );

  try {
    const preparation = await prepareCrossVerifyCandidateEvidence({
      projectRoot,
      config: scenarioConfig,
      providerAuthority,
      approvalRuntime: approvalRuntime(),
      candidate: { provider: 'claude', model: input.verifierModel },
      dockerBackend: {
        inspectExactCrossVerifyRuntime: vi.fn(async () => ({
          state: 'ready',
          imageId: IMAGE_REF,
          runtimeFingerprint: RUNTIME_FINGERPRINT,
          executionProfileRef: PROFILE_REF,
          toolProfileDigest: TOOL_PROFILE_DIGEST,
          authorityEvidenceRef: `docker-xverify-runtime:${input.id}-window`,
        })),
      } as never,
      requester: { role: 'brain', instanceId: `brain-${input.id}` },
      userId: 'owner-window-fixture',
      approvalSummary: 'Allow bounded Claude reachability probe.',
      runId: `run-${input.id}`,
      decisionWindowMs: 50,
      decisionPollMs: 1,
      now: () => NOW,
      sleepFn: async () => {},
    });

    const mandatoryInvocationFactory = createCrossVerifyProductionIngressAuthority({
      providerAuthority,
      executionProfiles,
      now: () => NOW,
    });
    const run = await runCrossVerify(
      projectRoot,
      scenarioTask,
      scenarioResult,
      TaskEvaluation.DONE,
      scenarioConfig,
      {
        authorModel: AUTHOR_MODEL,
        verifierModel: input.verifierModel,
        operationClass: 'adjudicate-claim',
        mandatoryInvocationFactory,
      },
    );

    return {
      preparation,
      run,
      launcher,
      limitProbe,
      reachabilityProbe,
      projectNonReservable,
    };
  } finally {
    opened.close();
  }
}

describe('XVerify Claude model-limit-window production candidate fan-in', () => {
  it('dispatches exact Opus 5 through the real factory when only Fable is exhausted', async () => {
    const scenario = await runScenario({
      id: 'opus-fable-only',
      verifierModel: OPUS_MODEL,
      sessionPct: 22,
      weekAllPct: 44,
      weekFablePct: 100,
    });

    expect(scenario.preparation).toMatchObject({ state: 'ready', reused: false });
    expect(scenario.limitProbe).toHaveBeenCalledOnce();
    expect(scenario.reachabilityProbe).toHaveBeenCalledOnce();
    expect(scenario.run).toMatchObject({
      ran: true,
      advisory: {
        verifier: 'claude',
        verifierModel: OPUS_MODEL,
        invocationReceiptRef: { invocationId: expect.any(String) },
      },
    });
    expect(scenario.run.validatedAdjudicationReceipt).toBeDefined();
    expect(scenario.launcher).toHaveBeenCalledOnce();
    expect(scenario.projectNonReservable).toHaveBeenCalledOnce();
    expect(scenario.launcher.mock.calls[0]?.[0]).toMatchObject({
      admissionMode: 'non_reservable_subscription',
      provider: 'claude',
      model: OPUS_MODEL,
    });
  });

  it('holds exact Opus before reachability and dispatch when the shared week-all window is exhausted', async () => {
    const scenario = await runScenario({
      id: 'opus-shared-exhausted',
      verifierModel: OPUS_MODEL,
      sessionPct: 22,
      weekAllPct: 100,
      weekFablePct: 10,
    });

    expect(scenario.preparation).toMatchObject({
      state: 'hold',
      reasonCode: 'evidence_refresh_hold',
      producerReasonCode: 'limit_hold',
    });
    expect(scenario.limitProbe).toHaveBeenCalledOnce();
    expect(scenario.reachabilityProbe).not.toHaveBeenCalled();
    expect(scenario.launcher).not.toHaveBeenCalled();
    expect(scenario.projectNonReservable).not.toHaveBeenCalled();
    expect(scenario.run).toMatchObject({
      ran: false,
      outcome: 'unavailable',
      blocked: true,
      verifier: 'claude',
      verifierModel: OPUS_MODEL,
    });
    expect(scenario.run.skippedReason).toContain('xverify_candidate_not_eligible');
  });

  it('holds exact Fable before reachability and dispatch when its model-only window is exhausted', async () => {
    const scenario = await runScenario({
      id: 'fable-model-exhausted',
      verifierModel: CLAUDE_FABLE_API_ID,
      sessionPct: 22,
      weekAllPct: 44,
      weekFablePct: 100,
    });

    expect(scenario.preparation).toMatchObject({
      state: 'hold',
      reasonCode: 'evidence_refresh_hold',
      producerReasonCode: 'limit_hold',
    });
    expect(scenario.limitProbe).toHaveBeenCalledOnce();
    expect(scenario.reachabilityProbe).not.toHaveBeenCalled();
    expect(scenario.launcher).not.toHaveBeenCalled();
    expect(scenario.projectNonReservable).not.toHaveBeenCalled();
    expect(scenario.run).toMatchObject({
      ran: false,
      outcome: 'unavailable',
      blocked: true,
      verifier: 'claude',
      verifierModel: CLAUDE_FABLE_API_ID,
    });
    expect(scenario.run.skippedReason).toContain('xverify_candidate_not_eligible');
    expect(scenario.run.skippedReason).not.toContain('verifier-tier-below-author');
  });
});
