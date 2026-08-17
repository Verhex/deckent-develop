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
import {
  resolveExecutionBudgetPolicy,
  resolveXverifyAdjudicationPurposeProfile,
} from '../core/execution-budget-policy.js';
import type { ExecutionTerminationLedger } from '../core/execution-termination-ledger.js';
import { createExecutionAuthorityError } from '../core/errors.js';
import { debugLog } from '../core/utils.js';
import { readExecutionLandingContext } from '../core/execution-landing-context.js';
import type {
  HostRoleInvocationCandidateAuthority,
  HostRoleInvocationNonReservableSubscription,
} from '../core/host-role-invocation-admission-runtime.js';
import { modelRegistry } from '../core/model-registry.js';
import { defaultRoleInvocationPolicy } from '../core/role-invocation-resolver.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import {
  projectExactProviderLimitAuthoritySelector,
} from '../core/provider-limit-policy.js';
import type { ProviderLimitReservationRequest } from '../core/provider-limit-truth.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlementRefForAttempt,
  readClosedTaskResultSettlement,
  readLatestTaskResultSettlementRef,
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
import { budgetFingerprint as computeBudgetFingerprint } from './runtime-budget-monitor.js';

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

type ProducerSettlementBinding =
  | { readonly state: 'ready'; readonly digest: string }
  | { readonly state: 'hold'; readonly reasonCode: string; readonly detail: unknown };

/**
 * Host-authored fields the runtime writes onto a `.result` that the producer's
 * immutable settlement receipt cannot contain. `distMutated` and the
 * attribution totals are patched onto the result object rather than declared on
 * {@link TaskResult}, so they are typed here to keep the allowlist below bound
 * to a real key space at compile time.
 */
interface HostEnrichedResultExtras {
  totalLinesAdded?: number;
  totalLinesRemoved?: number;
  distMutated?: boolean;
}

type HostEnrichableResult = TaskResult & HostEnrichedResultExtras;

/**
 * born 3323 — the post-settlement enrichment classes, and ONLY those.
 *
 * The producer's receipt freezes the `.result` bytes at settlement time; the
 * EVALUATE-phase copy is the same result after the host re-wrote it. Every
 * member below is authored by the host after (or independently of) the receipt:
 * `workAttribution` + `totalLines*` by the docker monitor's claim-time
 * attribution reconcile, `distMutated` by the advisory build-violation patch,
 * and `tokenUsage`/`cost`/`providerBilling` by the collector's token backfill
 * and billing reconciliation. A worker's own pre-settlement claim in these
 * fields carries no verdict authority — the host overwrites it by construction.
 *
 * NOTHING worker-authorable belongs here. `selfAssessment`, `notes`,
 * `testsPassed`, `coverage`, `filesChanged`, `linesAdded`, `linesRemoved`,
 * `taskId` and `workerId` stay byte-compared, and so does every field not
 * listed — including a field neither side is supposed to have.
 *
 * `Extract<keyof HostEnrichableResult, …>` is the compile-time binding: a name
 * that is not a real result key drops out of the union and fails `tsc` at the
 * literal below.
 */
type HostEnrichmentField = Extract<
  keyof HostEnrichableResult,
  | 'workAttribution'
  | 'totalLinesAdded'
  | 'totalLinesRemoved'
  | 'distMutated'
  | 'tokenUsage'
  | 'cost'
  | 'providerBilling'
>;

export const XVERIFY_PRODUCER_ENRICHMENT_FIELDS: readonly HostEnrichmentField[] =
  Object.freeze([
    'workAttribution',
    'totalLinesAdded',
    'totalLinesRemoved',
    'distMutated',
    'tokenUsage',
    'cost',
    'providerBilling',
  ]);

const ENRICHMENT_FIELDS: ReadonlySet<string> =
  new Set<string>(XVERIFY_PRODUCER_ENRICHMENT_FIELDS);

export type CrossVerifyProducerFencingComparison =
  | { readonly state: 'equal' }
  | { readonly state: 'diverged'; readonly divergingFields: readonly string[] };

/**
 * Canonicalize one side of the fence: drop the enrichment classes, and drop
 * `undefined`-valued keys so an in-memory result compares identically to the
 * same result after a JSON round-trip. Nothing else is normalized — a value is
 * carried through verbatim for the byte-comparison.
 */
function producerFencedCore(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const core: Record<string, unknown> = {};
  for (const [field, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined || ENRICHMENT_FIELDS.has(field)) continue;
    core[field] = entry;
  }
  return core;
}

/**
 * Byte-compare the producer's CLOSED settlement result against the
 * evaluate-phase copy over the pre-enrichment core.
 *
 * The comparison walks the UNION of both sides' remaining keys, so a field that
 * exists on only one side canonicalizes against `undefined` and diverges. An
 * unknown extra field is therefore a mismatch, not a silent pass: the allowlist
 * is an exclusion list, never a "trust everything else the host might add" rule.
 */
export function compareProducerFencedResult(
  settled: unknown,
  evaluated: unknown,
): CrossVerifyProducerFencingComparison {
  const settledCore = producerFencedCore(settled);
  const evaluatedCore = producerFencedCore(evaluated);
  if (!settledCore || !evaluatedCore) {
    return { state: 'diverged', divergingFields: ['<result-is-not-a-json-object>'] };
  }
  const fields = [...new Set([
    ...Object.keys(settledCore),
    ...Object.keys(evaluatedCore),
  ])].sort();
  const divergingFields = fields.filter(field =>
    canonicalJson(settledCore[field]) !== canonicalJson(evaluatedCore[field]));
  return divergingFields.length === 0
    ? { state: 'equal' }
    : { state: 'diverged', divergingFields };
}

/**
 * Bind semantic evidence capture to the producer's immutable settlement, not
 * to whatever bytes happen to exist when EVALUATE later starts. Standalone
 * attended claim adjudication has no implementation worker, so its wx-created
 * host claim/result pair is the producer receipt by construction.
 */
function resolveProducerSettlementBinding(input: {
  readonly projectRoot: string;
  readonly task: Task;
  readonly result: TaskResult;
  readonly operationClass: CrossVerifyOperationClass;
}): ProducerSettlementBinding {
  if (input.operationClass === 'adjudicate-claim') {
    return {
      state: 'ready',
      digest: `sha256:${sha256(canonicalJson({
        kind: 'host-authored-claim-receipt-v1',
        task: input.task,
        result: input.result,
      }))}`,
    };
  }
  const ref = readLatestTaskResultSettlementRef(input.projectRoot, input.task.id);
  if (!ref) {
    return {
      state: 'hold',
      reasonCode: 'xverify_producer_settlement_missing',
      detail: input.task.id,
    };
  }
  const closed = readClosedTaskResultSettlement(ref);
  if (!closed) {
    return {
      state: 'hold',
      reasonCode: 'xverify_producer_settlement_open',
      detail: ref,
    };
  }
  const fenced = compareProducerFencedResult(closed.result, input.result);
  if (fenced.state === 'diverged') {
    return {
      state: 'hold',
      reasonCode: 'xverify_producer_result_mismatch',
      detail: { ref, divergingFields: fenced.divergingFields },
    };
  }
  return {
    state: 'ready',
    digest: `sha256:${sha256(canonicalJson({
      kind: 'closed-task-result-settlement-v1',
      ref,
      settlement: closed,
    }))}`,
  };
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
            // Owner-authorized final-only containment, scoped to the
            // non-reservable subscription adjudication ONLY (an admission-mode
            // gate, NOT a provider-name bypass). A subscription verifier CLI
            // reports usage only at the end, so no live token cap can be
            // enforced: the owner-authored execution-budget wall clock is the sole
            // in-flight containment (the process is killed at expiry) and the
            // token ceilings settle post-hoc against the real transport usage.
            // The metered / incremental-usage (reserved) arm is untouched.
            ...(grant.admissionMode === 'non_reservable_subscription'
              ? {
                  finalOnlyUsageContainment: {
                    maxWallClockSeconds: Math.floor(grant.executionContract.timeoutMs / 1_000),
                    profileRef: grant.executionContract.budgetProfileRef,
                    policyDigest: grant.executionContract.budgetPolicyDigest,
                  },
                }
              : {}),
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
    const producerSettlement = resolveProducerSettlementBinding({
      projectRoot: input.projectRoot,
      task: input.task,
      result: input.result,
      operationClass: input.operationClass,
    });
    if (producerSettlement.state === 'hold') {
      return hold(producerSettlement.reasonCode, producerSettlement.detail);
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
    // The owner-authored budget policy yields a config-path profileRef
    // (`execution_budget.roles.<role>`), but the xverify execution contract binds
    // an OPAQUE durable reference. Derive the canonical opaque budget profile ref
    // from the owner-authored policy DIGEST — never relaxed, never a config path.
    // Used consistently by the verifier task's budget policy and the contract so
    // the coordinator's exact cross-check holds.
    const budgetProfileRef = `execution-budget:${budgetDecision.policyDigest}`;
    const estimates = estimatesFor(candidate.requiredWindows, model, budgetDecision.budget);
    // Non-reservable subscription arm (owner-bounded): when the required windows
    // are advisory `percent`-unit (never numerically reservable) on a SUBSCRIPTION
    // provider, the owner flag is set, the advisory floor still admits, and the
    // budget already resolved above, admit via the typed non-reservable outcome
    // instead of holding. NO reservation is forged. Any missing condition keeps
    // the byte-identical `xverify_limit_unit_unreservable` HOLD.
    const verifierCandidate = candidate.candidate;
    const nonReservableBaseEligible = estimates === null
      && input.config.cross_verify?.allow_non_reservable_subscription_adjudication === true
      && profile.authMode === 'subscription'
      && candidate.requiredWindows.length > 0
      && candidate.requiredWindows.every(window => window.unit === 'percent')
      && verifierCandidate.limits.limited === false
      && verifierCandidate.reachability.reachable === true
      && verifierCandidate.reachability.evidenceRef !== null;
    // A non-reservable subscription adjudication may dispatch ONLY under the
    // owner-authored xverify-adjudication purpose profile (positive maxTokens +
    // wall clock, config not code). Its absence — when the arm would otherwise be
    // eligible — is a typed HOLD, never a dispatch without a total-token ceiling.
    const adjudicationProfile = resolveXverifyAdjudicationPurposeProfile({
      policy: input.config.execution_budget,
    });
    if (!estimates && nonReservableBaseEligible && adjudicationProfile.state !== 'available') {
      return selectedHold('xverify_adjudication_budget_unavailable', {
        reasonCode: adjudicationProfile.reasonCode,
        profileRef: adjudicationProfile.profileRef,
      });
    }
    const nonReservableEligible = nonReservableBaseEligible
      && adjudicationProfile.state === 'available';
    if (!estimates && !nonReservableEligible) {
      return selectedHold('xverify_limit_unit_unreservable', candidate.requiredWindows);
    }
    const nonReservableAdmission: HostRoleInvocationNonReservableSubscription | undefined = estimates
      ? undefined
      : {
          decision: 'non_reservable_subscription',
          reservation: null,
          attempts: [],
          authorityEvidenceRef: evidenceRef('non-reservable-admission', {
            provider,
            model,
            selector: selected.authorityEvidenceRef,
            candidate: candidate.authorityEvidenceRef,
            ownerBound: 'cross_verify.allow_non_reservable_subscription_adjudication',
          }),
          basis: {
            advisoryLimitEvidenceRefs: verifierCandidate.limits.evidenceRefs,
            ownerBoundRef: 'config:cross_verify.allow_non_reservable_subscription_adjudication',
            requiredWindows: candidate.requiredWindows.map(window => ({
              windowId: window.windowId,
              unit: 'percent' as const,
              model: window.model,
            })),
          },
          resolution: {
            role: 'auditor',
            purpose: 'audit-evaluation',
            policy: defaultRoleInvocationPolicy('auditor'),
            selected: { provider, model, source: 'config', sequence: 1 },
            attempts: [],
            rejected: [],
            decisionReasonCode: 'none',
            configured: { provider, model, source: 'config', reasonCode: 'none' },
            resolved: { provider, model, source: 'wire', reasonCode: 'none' },
            fallbackChain: [],
            reachability: {
              state: verifierCandidate.reachability.state,
              evidenceRef: verifierCandidate.reachability.evidenceRef,
            },
            limits: {
              state: verifierCandidate.limits.state,
              evidenceRefs: verifierCandidate.limits.evidenceRefs,
            },
          },
        } satisfies HostRoleInvocationNonReservableSubscription;

    // Arm-aware owner-authored ceilings. The non-reservable subscription
    // adjudication carries the owner's maxTokens into the execution-contract
    // budget (so the runtime monitor enforces the total-token cap post-hoc from
    // the provider-reported terminal usage) and its wall clock through timeoutMs
    // (the optionsFor final-only containment kills the process at expiry). The
    // reserved / metered arm keeps budgetDecision.budget and input.timeoutMs
    // byte-identical.
    const adjudicationBudget = nonReservableAdmission && adjudicationProfile.state === 'available'
      ? { ...budgetDecision.budget, maxTokens: adjudicationProfile.profile.maxTokens }
      : budgetDecision.budget;
    const adjudicationTimeoutMs = nonReservableAdmission && adjudicationProfile.state === 'available'
      ? adjudicationProfile.profile.maxWallClockSeconds * 1_000
      : input.timeoutMs;

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
      budget: adjudicationBudget,
      policyDigest: budgetDecision.policyDigest,
      criteria: input.task.goNogo.items ?? null,
      evidencePaths,
      operationClass: input.operationClass,
      producerSettlementDigest: producerSettlement.digest,
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
        producerSettlementDigest: producerSettlement.digest,
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
        allowAdvisorySubscriptionLimits: nonReservableEligible,
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
          // The Docker execution landing requires a bounded scope with at least
          // one path. The verifier is inspection-only, so its scope is exactly the
          // claim's evidence files (read-only). Scoped to the non-reservable arm to
          // keep the reserved path byte-identical; the reserved-metered path hits
          // the same empty-scope landing gate and is tracked as a separate finding.
          filesRead: nonReservableEligible ? evidencePaths : [],
          filesWrite: [],
        },
        dependencies: [],
        status: TaskStatus.PENDING,
        type: 'audit',
        backend: 'docker',
        authMode: profile.authMode === 'api' ? 'api' : 'subscription',
        // The task snapshot MUST carry the same arm-aware budget the execution
        // contract binds below (adjudicationBudget adds the owner's maxTokens on
        // the non-reservable subscription arm; reserved arm is byte-identical) —
        // the coordinator's exact identity cross-check compares the two.
        budget: { ...adjudicationBudget },
        budgetPolicy: {
          state: 'allow',
          role: 'auditor',
          taskKind: 'audit',
          resolvedProvider: provider,
          executionCostClass: 'remote',
          profileRef: budgetProfileRef,
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
        budget: adjudicationBudget,
        // Budget identity MUST use the runtime-budget-monitor's canonical
        // `budgetFingerprint()` (BUDGET_FIELDS order) — the same function that
        // stamps the live usage/stop/guard evidence (runtime-budget-monitor.ts).
        // The old `sha256(canonicalJson(budget))` produced an alphabetical-key
        // hash that never equalled the monitor's, so the terminal-usage receipt
        // writer's `source.budgetFingerprint === contract.budgetFingerprint`
        // check aborted every docker adjudication settlement before persist/close
        // (surfaced first by the xverify non_reservable arm, the first to settle).
        budgetFingerprint: computeBudgetFingerprint(adjudicationBudget),
        budgetProfileRef,
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
        providerLimitEstimates: estimates ?? [],
        timeoutMs: adjudicationTimeoutMs,
        modelEffort: provider === 'claude' ? MODEL_EFFORT : 'default',
        toolProfileDigest: profile.toolProfileDigest,
        isolatedContext: true,
        settlementAttemptRef: settlementRef,
        adjudication: bootstrap.executionBinding,
      }, { allowEmptyProviderLimitEstimates: nonReservableEligible });
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
          // Dead for the non-reservable arm (the coordinator uses
          // nonReservableAdmission and never calls buildReservation); reserved
          // always has non-null estimates so `?? []` is a no-op there.
          estimates: estimates ?? [],
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
            ...(nonReservableAdmission ? { nonReservableAdmission } : {}),
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
      // A bare hashed hold ref hides why composition failed. Record it ONLY via
      // the bounded/sanitized debug sink (message-only, 200-char cap, stderr just
      // under DECKENT_DEBUG, skipped in tests) — never a raw stack to the user
      // surface. The typed hold below stays the authoritative, opaque signal.
      debugLog('cross-verify-ingress:composition-failed', error);
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
