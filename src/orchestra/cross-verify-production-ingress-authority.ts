import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '../core/audit-writer.js';
import type { ResolvedConfig } from '../core/config-types.js';
import {
  crossVerifyVerdictReceiptRef,
  writeCrossVerifyVerdictReceiptAtomic,
} from '../core/cross-verify-evidence-broker.js';
import type { CrossVerifyOperationClass } from '../core/cross-verify-prompt.js';
import { createCrossVerifyEnforcedAttemptContractV2 } from '../core/cross-verify-execution-contract.js';
import { resolveExecutionBudgetPolicy } from '../core/execution-budget-policy.js';
import type { ExecutionTerminationLedger } from '../core/execution-termination-ledger.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import { readExecutionLandingContext } from '../core/execution-landing-context.js';
import type {
  HostRoleInvocationCandidateAuthority,
} from '../core/host-role-invocation-admission-runtime.js';
import { modelRegistry } from '../core/model-registry.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import {
  projectExactProviderLimitAuthoritySelector,
} from '../core/provider-limit-policy.js';
import type { ProviderLimitReservationRequest } from '../core/provider-limit-truth.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  readTaskResultSettlementActiveClaim,
  taskResultSettlementActiveClaimDigest,
  writeTaskResultSettlementAttemptAtomic,
} from '../core/task-result-settlement.js';
import {
  TaskStatus,
  type ProviderName,
  type Task,
  type TaskResult,
} from '../core/task-types.js';
import {
  deriveCrossVerifyReservationIdentity,
  projectCrossVerifyInvocation,
} from './cross-verify-invocation-authority.js';
import {
  CrossVerifyInvocationCoordinator,
  type CrossVerifyHostObservationAuthority,
  type CrossVerifyProviderUsageAuthority,
  type CrossVerifyStrictLauncher,
} from './cross-verify-invocation-coordinator.js';
import {
  CrossVerifyDockerHostObservationAuthority,
  CrossVerifyDockerProviderUsageAuthority,
  createCrossVerifyDockerStrictLauncher,
} from './cross-verify-docker-runtime-authority.js';
import type {
  MandatoryCrossVerifyInvocationFactory,
  MandatoryCrossVerifyInvocationFactoryResult,
} from './cross-verify-runner.js';
import { prepareDockerExecutionLanding } from './execution-landing-coordinator.js';
import type { DockerSpawnBackend } from './spawn-backend-docker.js';
import { bootstrapCrossVerifyRuntimeV2 } from './cross-verify-runtime-bootstrap.js';

const TASKS_DIR = '.tasks';
const MODEL_EFFORT = 'low';
const MINIMUM_CONTINUATION_TURNS = 3;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function deterministicAttemptId(digest: string): string {
  const bytes = Buffer.from(digest.slice(0, 32), 'hex');
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-`
    + `${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function evidenceRef(kind: string, detail: unknown): string {
  return `xverify-production-ingress:${sha256(`${kind}\0${canonicalJson(detail)}`)}`;
}

function hold(
  reasonCode: string,
  detail: unknown,
  identity?: {
    readonly verifierProvider?: ProviderName;
    readonly verifierModel?: string;
  },
): MandatoryCrossVerifyInvocationFactoryResult {
  return {
    state: 'hold',
    reasonCode,
    authorityEvidenceRef: evidenceRef(reasonCode, detail),
    ...identity,
  };
}

export interface CrossVerifyExecutionProfileReady {
  readonly state: 'ready';
  readonly provider: ProviderName;
  readonly model: string;
  readonly authMode: 'subscription' | 'api' | 'hybrid' | 'local';
  readonly transport: 'cli' | 'api' | 'http' | 'local-runtime';
  readonly executionBackend: 'docker';
  readonly endpointRefHash: string | null;
  readonly runtimeFingerprint: string;
  readonly immutableImageRef: string;
  readonly executionProfileRef: string;
  readonly authLabel: string;
  readonly toolProfileDigest: string;
  readonly launcher: CrossVerifyStrictLauncher;
  readonly usageAuthority: CrossVerifyProviderUsageAuthority;
  readonly observationAuthority: CrossVerifyHostObservationAuthority;
  readonly authorityEvidenceRef: string;
}

export type CrossVerifyExecutionProfileResolution =
  | CrossVerifyExecutionProfileReady
  | {
      readonly state: 'hold';
      readonly reasonCode: string;
      readonly authorityEvidenceRef: string;
    };

/**
 * Adapter-owned runtime identity. It may inspect already-authored local state,
 * but must never refresh evidence, probe a provider, provision credentials or
 * derive identity from a mutable image tag.
 */
export interface CrossVerifyExecutionProfileAuthority {
  resolve(input: {
    readonly provider: ProviderName;
    readonly model: string;
    readonly projectRoot: string;
  }): CrossVerifyExecutionProfileResolution | Promise<CrossVerifyExecutionProfileResolution>;
}

export interface CrossVerifyProductionIngressOptions {
  readonly providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  readonly executionProfiles?: CrossVerifyExecutionProfileAuthority;
  readonly now?: () => Date;
}

export interface AuthoredDockerCrossVerifyExecutionProfile {
  readonly provider: ProviderName;
  readonly model: string;
  readonly authMode: CrossVerifyExecutionProfileReady['authMode'];
  readonly transport: CrossVerifyExecutionProfileReady['transport'];
  readonly endpointRefHash: string | null;
  readonly runtimeFingerprint: string;
  readonly immutableImageRef: string;
  readonly executionProfileRef: string;
  readonly authLabel: string;
  readonly toolProfileDigest: string;
  readonly authorityEvidenceRef: string;
}

/**
 * Adapter-owned strict Docker profile composition. Merely constructing this
 * resolver performs no Docker/provider work. Profiles are exact authored
 * records; zero or multiple matches HOLD rather than using declaration order.
 */
export function createDockerCrossVerifyExecutionProfileAuthority(input: {
  readonly projectRoot: string;
  readonly backend: DockerSpawnBackend;
  readonly terminationLedger: ExecutionTerminationLedger;
  readonly profiles: readonly AuthoredDockerCrossVerifyExecutionProfile[];
  readonly now?: () => Date;
}): CrossVerifyExecutionProfileAuthority {
  return Object.freeze({
    resolve(query: {
      readonly provider: ProviderName;
      readonly model: string;
      readonly projectRoot: string;
    }): CrossVerifyExecutionProfileResolution {
      const matches = input.profiles.filter(profile =>
        profile.provider === query.provider && profile.model === query.model);
      if (matches.length !== 1) {
        return {
          state: 'hold',
          reasonCode: matches.length === 0
            ? 'xverify_execution_profile_unavailable'
            : 'xverify_execution_profile_ambiguous',
          authorityEvidenceRef: evidenceRef('profile-selection', {
            provider: query.provider,
            model: query.model,
            matches: matches.map(profile => profile.authorityEvidenceRef),
          }),
        };
      }
      const profile = matches[0]!;
      if (!/^sha256:[a-f0-9]{64}$/u.test(profile.immutableImageRef)) {
        return {
          state: 'hold',
          reasonCode: 'xverify_execution_profile_invalid',
          authorityEvidenceRef: evidenceRef('profile-image-identity', {
            provider: query.provider,
            model: query.model,
          }),
        };
      }
      const launcher = createCrossVerifyDockerStrictLauncher({
        backend: input.backend,
        terminationLedger: input.terminationLedger,
        now: input.now,
        optionsFor: (grant) => {
          const settlement = grant.executionContract.settlementAttemptRef;
          const landing = readExecutionLandingContext(input.projectRoot, {
            schemaVersion: 1,
            projectId: settlement.projectRootSha256,
            taskId: settlement.taskId,
            attemptId: settlement.attemptId,
          });
          return {
            projectDir: input.projectRoot,
            availableTools: 'Bash',
            isolatedContext: true,
            autoApprove: true,
            taskTimeoutSeconds: grant.executionContract.timeoutMs / 1_000,
            settlementRef: settlement,
            executionBudget: grant.executionContract.budget,
            executionLandingPolicy: grant.executionContract.landingPolicy,
            executionAdmissionMode: grant.executionContract.attendanceMode,
            executionLandingContext: landing,
            modelEffort: grant.executionContract.modelEffort,
          };
        },
      });
      return Object.freeze({
        state: 'ready' as const,
        ...profile,
        executionBackend: 'docker' as const,
        launcher,
        usageAuthority: new CrossVerifyDockerProviderUsageAuthority(
          input.terminationLedger,
          new Set([profile.provider]),
          input.now,
        ),
        observationAuthority: new CrossVerifyDockerHostObservationAuthority(
          input.terminationLedger,
          { now: input.now },
        ),
      });
    },
  });
}

/**
 * Production Docker profile authority backed by an immutable image identity and
 * an in-image provider CLI proof. No provider request is made.
 */
export function createLiveDockerCrossVerifyExecutionProfileAuthority(input: {
  readonly projectRoot: string;
  readonly backend: DockerSpawnBackend;
  readonly terminationLedger: ExecutionTerminationLedger;
  readonly authMode: 'subscription' | 'api';
  readonly now?: () => Date;
}): CrossVerifyExecutionProfileAuthority {
  return Object.freeze({
    async resolve(query: {
      readonly provider: ProviderName;
      readonly model: string;
      readonly projectRoot: string;
    }): Promise<CrossVerifyExecutionProfileResolution> {
      if (query.projectRoot !== input.projectRoot) {
        return {
          state: 'hold',
          reasonCode: 'xverify_execution_profile_project_mismatch',
          authorityEvidenceRef: evidenceRef('profile-project-mismatch', {
            expected: input.projectRoot,
            actual: query.projectRoot,
          }),
        };
      }
      const inspected = await input.backend.inspectExactCrossVerifyRuntime(
        query.provider,
        query.model,
      );
      if (inspected.state === 'hold') {
        return {
          state: 'hold',
          reasonCode: inspected.reasonCode,
          authorityEvidenceRef: inspected.authorityEvidenceRef,
        };
      }
      return createDockerCrossVerifyExecutionProfileAuthority({
        projectRoot: input.projectRoot,
        backend: input.backend,
        terminationLedger: input.terminationLedger,
        now: input.now,
        profiles: [{
          provider: query.provider,
          model: query.model,
          authMode: input.authMode,
          transport: 'cli',
          endpointRefHash: null,
          runtimeFingerprint: inspected.runtimeFingerprint,
          immutableImageRef: inspected.imageId,
          executionProfileRef: inspected.executionProfileRef,
          authLabel: input.authMode,
          toolProfileDigest: inspected.toolProfileDigest,
          authorityEvidenceRef: inspected.authorityEvidenceRef,
        }],
      }).resolve(query);
    },
  });
}

function exactVerifierProvider(task: Task, config: ResolvedConfig): ProviderName | null {
  const taskProvider = task.provider;
  const authored = config.cross_verify?.verifier_priority ?? [];
  const selected = authored.find(provider => provider !== taskProvider);
  return selected as ProviderName | undefined ?? null;
}

function immutableArtifact(path: string, content: string): void {
  if (!existsSync(path)) {
    writeFileSync(path, content, { encoding: 'utf-8', flag: 'wx', mode: 0o600 });
    return;
  }
  if (readFileSync(path, 'utf-8') !== content) {
    throw createExecutionAuthorityError(`Immutable xverify artifact conflict: ${path}`);
  }
}

function estimatesFor(
  windows: readonly { windowId: string; unit: string; model: string | null }[],
  model: string,
  budget: Readonly<NonNullable<Task['budget']>>,
): ProviderLimitReservationRequest['estimates'] | null {
  const estimates: ProviderLimitReservationRequest['estimates'][number][] = [];
  for (const window of windows) {
    if (window.model !== null && window.model !== model) return null;
    const amount = window.unit === 'tokens'
      ? budget.maxTokens
      : window.unit === 'usd'
        ? budget.maxUsd
        : window.unit === 'requests'
          ? budget.maxTurns
          : undefined;
    if (amount === undefined || !Number.isFinite(amount) || amount <= 0) return null;
    estimates.push({
      windowId: window.windowId,
      unit: window.unit as 'tokens' | 'usd' | 'requests',
      amount,
    });
  }
  return Object.freeze(estimates);
}

function activeClaimMatches(
  ref: ReturnType<typeof createTaskResultSettlementRefForAttempt>,
  fenceDigest: string,
): boolean {
  try {
    return readTaskResultSettlementActiveClaim(ref)?.attemptId === ref.attemptId
      && taskResultSettlementActiveClaimDigest(ref) === fenceDigest;
  } catch {
    return false;
  }
}

/**
 * One production ingress shared by sprint and CLI surfaces. The constructor is
 * provider-free; `compose` reads only existing immutable authority and local
 * evidence. Missing production profile authority is an expected typed HOLD.
 */
export class CrossVerifyProductionIngressAuthority
implements MandatoryCrossVerifyInvocationFactory {
  private readonly now: () => Date;

  constructor(private readonly options: CrossVerifyProductionIngressOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async compose(input: {
    readonly projectRoot: string;
    readonly task: Task;
    readonly result: TaskResult;
    readonly config: ResolvedConfig;
    readonly operationClass: CrossVerifyOperationClass;
    readonly timeoutMs: number;
    readonly verifierModel?: string;
  }): Promise<MandatoryCrossVerifyInvocationFactoryResult> {
    if (input.config.cross_verify?.enabled !== true) {
      return hold('xverify_disabled', input.task.id);
    }
    const provider = exactVerifierProvider(input.task, input.config);
    if (!provider) {
      return hold('xverify_provider_scope_unavailable', input.task.id);
    }
    let model: string;
    try {
      const authoredModel =
        input.verifierModel
        ?? input.config.cross_verify?.verifier_model?.[provider];
      const definition = authoredModel
        ? modelRegistry.getOrThrow(authoredModel)
        : modelRegistry.getOrThrow(
            modelRegistry.getEquivalent(input.task.model, provider),
          );
      model = definition.id;
      if (definition.provider !== provider || definition.status === 'deprecated') {
        return hold(
          'xverify_model_scope_mismatch',
          { provider, model },
          { verifierProvider: provider },
        );
      }
    } catch (error) {
      return hold(
        'xverify_model_scope_mismatch',
        error instanceof Error ? error.message : String(error),
        { verifierProvider: provider },
      );
    }
    const selectedHold = (
      reasonCode: string,
      detail: unknown,
    ): MandatoryCrossVerifyInvocationFactoryResult =>
      hold(reasonCode, detail, {
        verifierProvider: provider,
        verifierModel: model,
      });
    const opened = this.options.providerAuthority;
    if (!opened || opened.state !== 'ready') {
      return selectedHold(
        'xverify_provider_authority_unavailable',
        opened?.authorityEvidenceRef ?? input.task.id,
      );
    }
    if (!this.options.executionProfiles) {
      return selectedHold('xverify_execution_profile_unavailable', { provider, model });
    }
    const profile = await this.options.executionProfiles.resolve({
      provider,
      model,
      projectRoot: input.projectRoot,
    });
    if (profile.state === 'hold') {
      return selectedHold(profile.reasonCode, profile.authorityEvidenceRef);
    }
    if (profile.provider !== provider || profile.model !== model
      || profile.executionBackend !== 'docker') {
      return selectedHold(
        'xverify_execution_profile_mismatch',
        profile.authorityEvidenceRef,
      );
    }

    const selected = projectExactProviderLimitAuthoritySelector(
      input.config.provider_limit_authority,
      {
        tenantId: opened.tenantId,
        provider,
        authMode: profile.authMode,
        transport: profile.transport,
        executionBackend: profile.executionBackend,
        endpointRefHash: profile.endpointRefHash,
      },
    );
    if (selected.state === 'hold') {
      return selectedHold(selected.reasonCode, selected.authorityEvidenceRef);
    }
    const source = opened.service.preflightUnattendedScope({
      provider,
      authMode: profile.authMode,
      transport: profile.transport,
      executionBackend: profile.executionBackend,
    });
    if (source.decision === 'hold') {
      return selectedHold(`xverify_${source.reasonCode}`, source.authorityEvidenceRef);
    }

    const authority: HostRoleInvocationCandidateAuthority = {
      provider,
      model,
      reachabilityQuery: {
        tenantId: opened.tenantId,
        projectId: opened.projectId,
        provider,
        model,
        authMode: profile.authMode,
        accountRefHash: selected.selector.accountRefHash,
        transport: profile.transport,
        executionBackend: profile.executionBackend,
        endpointRefHash: profile.endpointRefHash,
        runtimeFingerprint: profile.runtimeFingerprint,
        executionProfileRef: profile.executionProfileRef,
        capability: 'inference',
      },
      limitQuery: {
        tenantId: opened.tenantId,
        provider,
        accountRefHash: selected.selector.accountRefHash,
        quotaScopeRefHash: selected.selector.quotaScopeRefHash,
        authMode: profile.authMode,
      },
    };
    const candidate = opened.service.roleAdmissionRuntime.projectVerifierCandidate(authority);
    if (candidate.state === 'hold') {
      return selectedHold(`xverify_${candidate.reasonCode}`, candidate.authorityEvidenceRef);
    }
    if (candidate.requiredWindows.some(window =>
      !selected.selector.requiredWindowIds.includes(window.windowId))) {
      return selectedHold(
        'xverify_provider_window_scope_mismatch',
        candidate.authorityEvidenceRef,
      );
    }

    const budgetDecision = resolveExecutionBudgetPolicy({
      policy: input.config.execution_budget,
      role: 'auditor',
      taskKind: 'audit',
      executionCostClass: 'remote',
      minimumContinuationTurns: MINIMUM_CONTINUATION_TURNS,
    });
    if (budgetDecision.state === 'hold' || !budgetDecision.budget
      || !budgetDecision.landingPolicy || !budgetDecision.policyDigest) {
      return selectedHold(
        `xverify_execution_budget_${budgetDecision.state === 'hold'
          ? budgetDecision.reasonCode
          : 'incomplete'}`,
        budgetDecision.profileRef,
      );
    }
    const estimates = estimatesFor(candidate.requiredWindows, model, budgetDecision.budget);
    if (!estimates) {
      return selectedHold('xverify_limit_unit_unreservable', candidate.requiredWindows);
    }

    const runId = input.task.sprintId ?? `xverify-${sha256(input.task.id).slice(0, 16)}`;
    const verifierTaskId = `${input.task.id}-xverify`;
    const evidencePaths = [...new Set(
      (input.task.scope.filesRead.length > 0
        ? input.task.scope.filesRead
        : input.result.filesChanged ?? [])
        .map(path => path.trim())
        .filter(Boolean),
    )];
    const attemptDigest = sha256(canonicalJson({
      tenantId: opened.tenantId,
      projectId: opened.projectId,
      runId,
      taskId: input.task.id,
      provider,
      model,
      selectorDigest: selected.selectorDigest,
      executionProfileRef: profile.executionProfileRef,
      runtimeFingerprint: profile.runtimeFingerprint,
      budget: budgetDecision.budget,
      policyDigest: budgetDecision.policyDigest,
      criteria: input.task.goNogo.items ?? null,
      evidencePaths,
      operationClass: input.operationClass,
    }));
    const attemptId = deterministicAttemptId(attemptDigest);
    const settlementRef = createTaskResultSettlementRefForAttempt(
      input.projectRoot,
      verifierTaskId,
      attemptId,
    );

    try {
      const claimedAt = this.now().toISOString();
      writeTaskResultSettlementAttemptAtomic(settlementRef, claimedAt);
      claimTaskResultSettlementAttemptAtomic(settlementRef, claimedAt);
      const claim = readTaskResultSettlementActiveClaim(settlementRef);
      if (!claim) return selectedHold('xverify_attempt_claim_unavailable', attemptId);
      const fenceTokenHash = taskResultSettlementActiveClaimDigest(settlementRef);
      const bootstrap = bootstrapCrossVerifyRuntimeV2({
        projectRoot: input.projectRoot,
        task: input.task,
        result: input.result,
        settlementRef,
        fenceTokenHash,
        runtimeImageRef: profile.immutableImageRef,
      });
      if (bootstrap.state === 'hold') {
        return selectedHold(bootstrap.reasonCode, bootstrap.detail);
      }
      const basePrompt = bootstrap.prompt;
      const projected = projectCrossVerifyInvocation({
        projection: candidate,
        ledger: opened.service.invocationReceiptLedger,
        tenantId: opened.tenantId,
        projectId: opened.projectId,
        runId,
        taskId: input.task.id,
        attempt: 1,
        attemptId,
        fenceTokenHash,
        createdAt: claim.claimedAt,
      });
      if (projected.state === 'hold') {
        return selectedHold(
          `xverify_${projected.reasonCode}`,
          projected.authorityEvidenceRef,
        );
      }

      const verifierTask: Task = {
        ...input.task,
        id: verifierTaskId,
        title: `Adversarial cross-verify of ${input.task.id}`,
        description: basePrompt,
        model,
        provider,
        forceModel: model,
        modelEffort: provider === 'claude' ? MODEL_EFFORT : undefined,
        priority: 'HIGH',
        reason: 'cross-verify adversarial verification',
        scope: {
          directories: [],
          filesRead: [],
          filesWrite: [],
        },
        dependencies: [],
        status: TaskStatus.PENDING,
        type: 'audit',
        backend: 'docker',
        authMode: profile.authMode === 'api' ? 'api' : 'subscription',
        budget: { ...budgetDecision.budget },
        budgetPolicy: {
          state: 'allow',
          role: 'auditor',
          taskKind: 'audit',
          resolvedProvider: provider,
          executionCostClass: 'remote',
          profileRef: budgetDecision.profileRef,
          policyDigest: budgetDecision.policyDigest,
          admissionMode: 'unattended',
          landingPolicy: { ...budgetDecision.landingPolicy },
        },
        createdAt: claim.claimedAt,
        updatedAt: claim.claimedAt,
      };
      const prepared = prepareDockerExecutionLanding({
        projectRoot: input.projectRoot,
        task: verifierTask,
        prompt: basePrompt,
        calledProvider: provider,
        calledModel: model,
        auth: profile.authLabel,
        settlementRef,
        terminalProtocol: 'xverify-v2-host-only',
      });
      if (!prepared.context) {
        return selectedHold('xverify_landing_context_unavailable', attemptId);
      }
      const executionRequest = Object.freeze({
        basePrompt,
        dispatchedPrompt: prepared.prompt,
        taskSnapshot: Object.freeze(JSON.parse(JSON.stringify(verifierTask)) as Record<string, unknown>),
      });
      const executionContract = createCrossVerifyEnforcedAttemptContractV2({
        tenantId: opened.tenantId,
        projectId: opened.projectId,
        runId,
        taskId: input.task.id,
        verifierTaskId,
        callId: projected.identity.callId,
        attemptId,
        fenceTokenHash,
        operationClass: input.operationClass,
        basePromptSha256: sha256(basePrompt),
        dispatchedPromptSha256: sha256(prepared.prompt),
        taskSnapshotSha256: sha256(canonicalJson(executionRequest.taskSnapshot)),
        budget: budgetDecision.budget,
        budgetFingerprint: sha256(canonicalJson(budgetDecision.budget)),
        budgetProfileRef: budgetDecision.profileRef,
        budgetPolicyDigest: budgetDecision.policyDigest,
        landingPolicy: budgetDecision.landingPolicy,
        attendanceMode: 'unattended',
        provider,
        model,
        authMode: profile.authMode,
        accountRefHash: selected.selector.accountRefHash,
        transport: profile.transport,
        executionBackend: profile.executionBackend,
        endpointRefHash: profile.endpointRefHash,
        executionProfileRef: profile.executionProfileRef,
        providerLimitEstimates: estimates,
        timeoutMs: input.timeoutMs,
        modelEffort: provider === 'claude' ? MODEL_EFFORT : 'default',
        toolProfileDigest: profile.toolProfileDigest,
        isolatedContext: true,
        settlementAttemptRef: settlementRef,
        adjudication: bootstrap.executionBinding,
      });
      const reservationIdentity = deriveCrossVerifyReservationIdentity(
        projected.identity,
        provider,
        model,
      );
      const admission = {
        invocation: {
          role: 'auditor' as const,
          purpose: 'audit-evaluation' as const,
          primaryProvider: provider,
          model,
          fallbackProviders: [],
        },
        candidates: { [provider]: authority },
        buildReservation: (): ProviderLimitReservationRequest => ({
          tenantId: opened.tenantId,
          projectId: opened.projectId,
          provider,
          model,
          accountRefHash: selected.selector.accountRefHash,
          quotaScopeRefHash: selected.selector.quotaScopeRefHash,
          authMode: profile.authMode,
          backend: {
            transport: profile.transport,
            executionBackend: profile.executionBackend,
            endpointRefHash: profile.endpointRefHash,
          },
          ...reservationIdentity,
          runId,
          taskId: verifierTaskId,
          callId: projected.identity.callId,
          attemptId,
          fenceTokenHash,
          receiptRef: projected.identity.receiptRef,
          reachabilityEvidenceRef: projected.verifierCandidates[0].reachability.evidenceRef!,
          estimates,
          estimateEvidenceRefs: [
            selected.authorityEvidenceRef,
            executionContract.evidenceRef,
          ],
          requestedAt: claim.claimedAt,
          leaseExpiresAt: candidate.expiresAt,
        }),
      };
      const tasksDir = join(input.projectRoot, TASKS_DIR);
      mkdirSync(tasksDir, { recursive: true });
      immutableArtifact(
        join(tasksDir, `task-${verifierTaskId}.json`),
        `${JSON.stringify(verifierTask, null, 2)}\n`,
      );
      immutableArtifact(
        join(tasksDir, `task-${verifierTaskId}.plan`),
        `# Exact xverify plan — ${verifierTaskId}\n\n`
          + `- Provider: ${provider}\n- Model: ${model}\n`
          + '- Mode: inspection-only; project writes are forbidden.\n'
          + '- Emit one terminal VERDICT; do not reverify.\n',
      );
      const coordinator = new CrossVerifyInvocationCoordinator({
        admissionRuntime: opened.service.roleAdmissionRuntime,
        usageAuthority: profile.usageAuthority,
        observationAuthority: profile.observationAuthority,
      });
      return {
        state: 'ready',
        authorityEvidenceRef: evidenceRef('ready', {
          attemptId,
          fenceTokenHash,
          selector: selected.authorityEvidenceRef,
          profile: profile.authorityEvidenceRef,
          source: source.authorityEvidenceRef,
        }),
        composition: {
          coordinator,
          input: {
            projection: projected,
            admission,
            executionContract,
            executionRequest,
            buildDispatchEvent: allowed => ({
              eventId: `xv-dispatch-${sha256(allowed.reservation.reservationId).slice(0, 48)}`,
              type: 'dispatched',
              occurredAt: this.now().toISOString(),
              fenceTokenHash,
              evidenceRef: evidenceRef('dispatch', allowed.reservation.reservationId),
            }),
            isClaimActive: () => activeClaimMatches(settlementRef, fenceTokenHash),
          },
          launcher: profile.launcher,
          adjudication: {
            contract: bootstrap.adjudicationContract,
            persist: ({ adjudication, output }) => {
              const receipt = writeCrossVerifyVerdictReceiptAtomic({
                projectRoot: input.projectRoot,
                settlementRef,
                claimSha256: bootstrap.evidenceClaim.claimSha256,
                evidenceManifestSha256: bootstrap.evidenceSnapshot.manifestSha256,
                effectiveVerdict: adjudication.verdict.toUpperCase() as
                  | 'CONFIRMED'
                  | 'REFUTED'
                  | 'UNCLEAR',
                disposition: adjudication.verdict === 'confirmed'
                  ? 'allow'
                  : adjudication.verdict === 'refuted'
                    ? 'no-go'
                    : 'hold',
                adjudicationReceiptSha256: sha256(canonicalJson(adjudication)),
                outputSha256: sha256(output),
                outputByteLength: Buffer.byteLength(output, 'utf8'),
              });
              return {
                verdictReceiptRef: crossVerifyVerdictReceiptRef(receipt),
                validatedReceipt: receipt,
              };
            },
          },
        },
      };
    } catch (error) {
      return selectedHold(
        'xverify_attempt_composition_failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}

export function createCrossVerifyProductionIngressAuthority(
  options: CrossVerifyProductionIngressOptions,
): MandatoryCrossVerifyInvocationFactory {
  return new CrossVerifyProductionIngressAuthority(options);
}
