import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { canonicalJson } from '../core/audit-writer.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { buildRefutePrompt, type CrossVerifyOperationClass } from '../core/cross-verify-prompt.js';
import { createCrossVerifyEnforcedAttemptContract } from '../core/cross-verify-execution-contract.js';
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

const TASKS_DIR = '.tasks';
const MODEL_EFFORT = 'low';
const MINIMUM_CONTINUATION_TURNS = 3;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function evidenceRef(kind: string, detail: unknown): string {
  return `xverify-production-ingress:${sha256(`${kind}\0${canonicalJson(detail)}`)}`;
}

function hold(
  reasonCode: string,
  detail: unknown,
): MandatoryCrossVerifyInvocationFactoryResult {
  return {
    state: 'hold',
    reasonCode,
    authorityEvidenceRef: evidenceRef(reasonCode, detail),
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
  }): CrossVerifyExecutionProfileResolution;
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

  compose(input: {
    readonly projectRoot: string;
    readonly task: Task;
    readonly result: TaskResult;
    readonly config: ResolvedConfig;
    readonly operationClass: CrossVerifyOperationClass;
    readonly timeoutMs: number;
  }): MandatoryCrossVerifyInvocationFactoryResult {
    if (input.config.cross_verify?.enabled !== true
      || input.config.cross_verify.enforce_refuted !== true) {
      return hold('xverify_enforcement_disabled', input.task.id);
    }
    const opened = this.options.providerAuthority;
    if (!opened || opened.state !== 'ready') {
      return hold(
        'xverify_provider_authority_unavailable',
        opened?.authorityEvidenceRef ?? input.task.id,
      );
    }
    const provider = exactVerifierProvider(input.task, input.config);
    if (!provider) {
      return hold('xverify_provider_scope_unavailable', input.task.id);
    }
    let model: string;
    try {
      model = modelRegistry.getEquivalent(input.task.model, provider);
      if (modelRegistry.get(model)?.provider !== provider) {
        return hold('xverify_model_scope_mismatch', { provider, model });
      }
    } catch (error) {
      return hold(
        'xverify_model_scope_mismatch',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (!this.options.executionProfiles) {
      return hold('xverify_execution_profile_unavailable', { provider, model });
    }
    const profile = this.options.executionProfiles.resolve({
      provider,
      model,
      projectRoot: input.projectRoot,
    });
    if (profile.state === 'hold') {
      return hold(profile.reasonCode, profile.authorityEvidenceRef);
    }
    if (profile.provider !== provider || profile.model !== model
      || profile.executionBackend !== 'docker') {
      return hold('xverify_execution_profile_mismatch', profile.authorityEvidenceRef);
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
      return hold(selected.reasonCode, selected.authorityEvidenceRef);
    }
    const source = opened.service.preflightUnattendedScope({
      provider,
      authMode: profile.authMode,
      transport: profile.transport,
      executionBackend: profile.executionBackend,
    });
    if (source.decision === 'hold') {
      return hold(`xverify_${source.reasonCode}`, source.authorityEvidenceRef);
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
      return hold(`xverify_${candidate.reasonCode}`, candidate.authorityEvidenceRef);
    }
    if (candidate.requiredWindows.some(window =>
      !selected.selector.requiredWindowIds.includes(window.windowId))) {
      return hold('xverify_provider_window_scope_mismatch', candidate.authorityEvidenceRef);
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
      return hold(
        `xverify_execution_budget_${budgetDecision.state === 'hold'
          ? budgetDecision.reasonCode
          : 'incomplete'}`,
        budgetDecision.profileRef,
      );
    }
    const estimates = estimatesFor(candidate.requiredWindows, model, budgetDecision.budget);
    if (!estimates) {
      return hold('xverify_limit_unit_unreservable', candidate.requiredWindows);
    }

    const basePrompt = buildRefutePrompt(input.task, input.result, {
      verifier: provider,
      operationClass: input.operationClass,
    });
    const runId = input.task.sprintId ?? `xverify-${sha256(input.task.id).slice(0, 16)}`;
    const verifierTaskId = `${input.task.id}-xverify`;
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
      basePromptSha256: sha256(basePrompt),
      operationClass: input.operationClass,
    }));
    const attemptId = `xv-${attemptDigest.slice(0, 48)}`;
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
      if (!claim) return hold('xverify_attempt_claim_unavailable', attemptId);
      const fenceTokenHash = taskResultSettlementActiveClaimDigest(settlementRef);
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
        return hold(`xverify_${projected.reasonCode}`, projected.authorityEvidenceRef);
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
          filesRead: [...new Set(
            (input.task.scope.filesRead.length > 0
              ? input.task.scope.filesRead
              : input.result.filesChanged ?? [])
              .map(path => path.trim())
              .filter(Boolean),
          )],
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
        terminalProtocol: 'xverify-v1',
      });
      if (!prepared.context) {
        return hold('xverify_landing_context_unavailable', attemptId);
      }
      const executionRequest = Object.freeze({
        basePrompt,
        dispatchedPrompt: prepared.prompt,
        taskSnapshot: Object.freeze(JSON.parse(JSON.stringify(verifierTask)) as Record<string, unknown>),
      });
      const executionContract = createCrossVerifyEnforcedAttemptContract({
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
        },
      };
    } catch (error) {
      return hold(
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
