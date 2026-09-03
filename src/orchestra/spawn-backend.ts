import { spawnSync } from 'node:child_process';
import type { ModelType, ResolvedConfig } from '../core/types.js';
import { getLoadedConfig } from '../core/config.js';
import type { ProviderSpawnOptions } from '../core/provider.js';
import { ensureSession, spawnWorker as tmuxSpawnWorker, killWorker as tmuxKillWorker, listWorkers as tmuxListWorkers } from './tmux.js';
import { SubprocessSpawnBackend, CLAUDE_SUBPROCESS_CONFIG } from '../providers/subprocess.js';
import type { SubprocessProviderConfig } from '../providers/subprocess.js';
import { CODEX_USAGE_EMIT_ARGS } from '../providers/codex.js';
import { DockerSpawnBackend } from './spawn-backend-docker.js';
import { createExactProductionWiringHostObserver } from './production-wiring-host-observation.js';
import { assertNotLethalWithoutApproval } from '../nervous/panic-gate.js';
import { SandboxSpawnBackend } from '../providers/sandbox.js';
import type { SandboxOptions } from '../providers/sandbox.js';
import { modelRegistry } from '../core/model-registry.js';
import { getProviderCommandSpec } from '../core/provider-command-spec.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import {
  assertLiveUsageBudgetSupport,
  type ExecutionLandingCapability,
  type LiveUsageBudgetSupport,
} from '../core/live-execution-budget.js';
import { resolveHostExecutionBudget } from './runtime-budget-monitor.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';
import type { ExecutionLandingContextEnvelopeV1 } from '../core/execution-landing-context.js';
import type { ProviderBillingEvidence } from '../core/provider-billing-evidence.js';
import type { TaskResultAttemptCustodySourceBindingV2 } from '../core/task-result-schema.js';
import type { TaskResultV2 } from '../core/task-result-schema.js';
import type { CanonicalIngressAuthority } from './result-ingress.js';
import type { CanonicalIngressEffectAuthorityV1 } from './result-ingress.js';
import type {
  ExactAcceptedTaskResultAuthorityMetadata,
} from './task-result-authority.js';
import type {
  ExactAcceptedTaskTerminalAuthorityRead,
} from './evaluation-audit-trail.js';
import type {
  ExactAcceptedResultTerminalAuthorityV2,
  SettleExactAcceptedResultOutcome,
} from './exact-accepted-result-terminal-authority.js';
import type { ExactAcceptedTaskResultRefV2 } from '../core/task-settlement-authority.js';
import type { ExactExecutionLandingProposalV3 } from '../core/execution-landing-proposal.js';
import type { ExecutionLandingPreparationRefV2 } from '../core/execution-landing-checkpoint.js';
import type {
  Sha256Digest,
  TaskAttemptCustodyAmbiguousReasonCode,
  TaskAttemptCustodyDispatchNotDispatchedAuthorityV2,
  TaskAttemptCustodyIdentityV2,
  TaskAttemptCustodyNotDispatchedReasonCode,
  TaskAttemptCustodyProviderExecutionAttemptV2,
} from '../core/task-attempt-custody-store.js';
import { authHealthCheck } from '../agents/worker.js';

export type { SandboxOptions };
export { SandboxSpawnBackend };

/**
 * Host-only result projection requested by a protocol-aware caller.
 *
 * This is a closed, versioned contract rather than an arbitrary callback: the
 * backend may project only a terminal xverify verdict that it observed in the
 * provider's assistant output before immutable result settlement.
 */
export interface HostTerminalResultContractV1 {
  version: 1;
  kind: 'terminal-verdict';
  protocol: 'xverify-v1';
}

export interface SpawnBackendRecoveryReport {
  adopted: string[];
  closedNotDispatched: string[];
  closedAbsentAfterExit: string[];
  retiredLanded: string[];
  resumedContinuations: string[];
  /**
   * Exact backend entries that were discovered but could not be reconciled.
   * Optional only for backward compatibility with non-exact custom backends;
   * the canonical Docker backend always returns the field, including `[]`.
   */
  held?: SpawnBackendRecoveryHold[];
  /** Opaque process-local exact entries recovered from the same private Store. */
  exactEntries?: readonly SpawnBackendExactRecoveryEntryV2[];
}

export type SpawnBackendExactRecoveryEntryV2 =
  | Readonly<{
      readonly kind: 'not-dispatched';
      readonly taskId: string;
      readonly authority: TaskAttemptCustodyDispatchNotDispatchedAuthorityV2;
    }>
  | Readonly<{
      readonly kind: 'released';
      readonly taskId: string;
      readonly query: ExactDockerCustodyTerminalQueryV2;
    }>
  | Readonly<{
      readonly kind: 'accepted';
      readonly taskId: string;
      readonly query: ExactDockerCustodyTerminalQueryV2;
      readonly accepted: ExactDockerAcceptedResultV2;
    }>;

export type SpawnBackendRecoveryHoldAuthorityState =
  | 'ADMISSION_DISCOVERY_REJECTED'
  | 'RESERVED_PENDING_ADMISSION'
  | 'DISPATCH_ABSENT'
  | 'DISPATCH_TRANSITION_PENDING'
  | 'DISPATCH_AMBIGUOUS'
  | 'DISPATCH_TERMINAL'
  | 'RECOVERY_ENTRY_FAILED';

export type SpawnBackendRecoveryHoldReasonCode =
  | 'DISPATCH_DISCOVERY_TAMPERED_CANDIDATE'
  | 'ADMISSION_RECONCILIATION_REQUIRED'
  | 'PRE_PROVIDER_RECONCILIATION_REQUIRED'
  | 'TERMINAL_RECONCILIATION_REQUIRED'
  | 'ENTRY_RECONCILIATION_FAILED';

export interface SpawnBackendRecoveryHold {
  readonly kind: 'spawn-backend-recovery-hold';
  readonly backend: 'docker';
  readonly dispatchRequestId: string;
  readonly taskId: string;
  readonly admissionRefDigest: string | null;
  readonly authorityState: SpawnBackendRecoveryHoldAuthorityState;
  readonly reasonCode: SpawnBackendRecoveryHoldReasonCode;
  readonly custodyHoldCode?: string;
}

export class SpawnBackendRecoveryHoldError extends Error {
  readonly holds: readonly SpawnBackendRecoveryHold[];

  constructor(holds: readonly SpawnBackendRecoveryHold[]) {
    super('DECKENT_E091:spawn-backend-recovery-hold');
    this.name = 'SpawnBackendRecoveryHoldError';
    this.holds = Object.freeze([...holds]);
  }
}

export interface SpawnBackendRecoveryOptions {
  /**
   * `resume` restores interrupted execution where safe. `contain` is used by
   * destructive shutdown surfaces and must never dispatch replacement work.
   */
  mode?: 'resume' | 'contain' | 'terminal-only';
}

declare const exactDockerCustodyDispatchEnvelopeBrand: unique symbol;
declare const exactDockerAcceptedResultReaderBrand: unique symbol;

/** Process-local, single-backend authority. It intentionally exposes no Store path/capability. */
export interface ExactDockerCustodyDispatchEnvelopeV2 {
  readonly [exactDockerCustodyDispatchEnvelopeBrand]: true;
}

/** Process-local read capability; contains no Store path or generic publication authority. */
export interface ExactDockerAcceptedResultReaderV2 {
  readonly [exactDockerAcceptedResultReaderBrand]: true;
}

export interface ExactDockerAcceptedResultV2 {
  readonly kind: 'accepted-result';
  readonly acceptedResultRef: ExactAcceptedTaskResultRefV2;
  readonly acceptedResultChainDigest: Sha256Digest;
  readonly resultDigest: Sha256Digest;
  readonly result: TaskResultV2;
  readonly hostBillingAuthority: Readonly<{
    readonly evidenceDigest: Sha256Digest;
    readonly providerStreamReceiptDigest: Sha256Digest;
    readonly acceptedResultArtifactReceiptDigest: Sha256Digest;
    readonly acceptedResultChainDigest: Sha256Digest;
    readonly bindingDigest: Sha256Digest;
  }>;
  readonly hostEffectAuthority: CanonicalIngressEffectAuthorityV1;
  readonly reader: ExactDockerAcceptedResultReaderV2;
}

export type ExactDockerAcceptResultOutcomeV2 = ExactDockerAcceptedResultV2 | Readonly<{
  readonly kind: 'capture-hold';
  readonly reasonCode:
    | Extract<ExactDockerCustodyCompletionV2, { kind: 'capture-hold' }>['reasonCode']
    | 'HOST_WORK_ATTRIBUTION_HOLD'
    | 'WORKER_SCOPE_CLAIM_HOLD';
  readonly custodyRef: ExactDockerCustodyRefV2;
  readonly releaseReceipt: ExactDockerCustodyReceiptRefV2;
  readonly projectionFence: Sha256Digest;
}>;

export interface AcceptExactDockerCustodyResultInputV2 {
  readonly query: ExactDockerCustodyTerminalQueryV2;
  readonly authority: CanonicalIngressAuthority;
}

export interface ExactDockerCustodyExecutionMaterialV2 {
  readonly allowedTools: string | null;
  readonly availableTools: string | null;
  readonly authMode: 'subscription' | 'api';
  readonly isolatedContext: boolean;
  readonly reasoningEffort: string | null;
  readonly excludeDynamicPromptSections: boolean;
  readonly taskTimeoutSeconds: number;
  readonly actionId: string | null;
  readonly executionBudget: unknown | null;
  readonly executionLandingPolicy: unknown | null;
  readonly executionAdmissionMode: string | null;
  readonly executionApprovalEvidenceRef: string | null;
  readonly finalOnlyUsageContainment: Readonly<{
    readonly maxWallClockSeconds: number;
    readonly profileRef: string;
    readonly policyDigest: string;
  }> | null;
}

export interface ExactDockerPromptDeliveryAuthorityV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-prompt-delivery-authority';
  readonly receiptVersion: 2;
  /** Path-free, content-addressed identity of the compile-time delivery receipt. */
  readonly receiptIdentity: `prompt-delivery-receipt:sha256:${string}`;
  readonly taskId: string;
  readonly basePromptSha256: Sha256Digest;
  readonly promptCompilePlanId: string;
  readonly rolePolicyIdentity: string;
  readonly assignedAgentId: string | null;
  readonly deliveredAgentId: string | null;
  readonly personaSegmentSha256: Sha256Digest | null;
  readonly assignedSkillIds: readonly string[];
  readonly deliveredSkillIds: readonly string[];
  readonly forcedSkillIds: readonly string[];
  readonly undeliveredForcedSkillIds: readonly string[];
  readonly segmentManifest: readonly Readonly<{
    readonly ordinal: number;
    readonly tier: 'T0' | 'T1' | 'T2';
    readonly kind: string;
    readonly contentSha256: Sha256Digest;
    readonly byteLength: number;
  }>[];
  readonly segmentManifestDigest: Sha256Digest;
  readonly authorityDigest: Sha256Digest;
}

export interface ExactDockerCustodyIdentityRefV2 {
  readonly dispatchRequestId: string;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly admissionRefDigest: Sha256Digest;
}

export interface ExactDockerCustodyRefV2 extends ExactDockerCustodyIdentityRefV2 {
  readonly providerStartReceipt: ExactDockerCustodyReceiptRefV2;
}

/** Exact zero-work terminal that may authorize one later Store generation. */
export interface ExactDockerNotDispatchedPredecessorV2
  extends ExactDockerCustodyIdentityRefV2 {
  readonly zeroWorkReceipt: ExactDockerCustodyReceiptRefV2;
}

export type ExactDockerCustodyPredecessorV2 =
  | ExactDockerCustodyRefV2
  | ExactDockerNotDispatchedPredecessorV2;

/**
 * Logical producer material only. T5/Store, never the producer, allocates the
 * custody attempt/generation/admission timestamp and predecessor identity.
 */
export interface PrepareExactDockerCustodyInputV2 {
  readonly dispatchRequestId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly approvedTaskMaterial: unknown;
  readonly approvedTaskMaterialDigest: Sha256Digest;
  readonly dispatchTaskMaterial: unknown;
  readonly dispatchTaskMaterialDigest: Sha256Digest;
  readonly lineageMaterial: unknown;
  readonly lineageMaterialDigest: Sha256Digest;
  readonly prompt: string;
  readonly promptDeliveryAuthority: ExactDockerPromptDeliveryAuthorityV2;
  readonly systemPromptCore: string | null;
  readonly model: ModelType;
  readonly execution: ExactDockerCustodyExecutionMaterialV2;
  readonly predecessor: ExactDockerCustodyRefV2 | null;
  /** Mutually exclusive zero-work predecessor for one Store-owned later generation. */
  readonly zeroWorkPredecessor?: ExactDockerNotDispatchedPredecessorV2;
}

export interface ExactDockerCustodyAdmissionRefV2 {
  readonly dispatchRequestId: string;
  readonly dispatchRequestMaterialDigest: Sha256Digest;
  readonly admissionRefDigest: Sha256Digest;
}

/** Alias only: core owns the single pre-provider landing preparation authority. */
export type ExactDockerCustodyPreparationRefV2 = ExecutionLandingPreparationRefV2;

export interface PreparedExactDockerCustodyV2 {
  readonly kind: 'exact-docker-custody-prepared';
  readonly dispatchEnvelope: ExactDockerCustodyDispatchEnvelopeV2;
  readonly admissionRef: ExactDockerCustodyAdmissionRefV2;
  readonly preparationRef: ExactDockerCustodyPreparationRefV2;
}

export interface ExactDockerCustodyReceiptRefV2 {
  readonly ref: Sha256Digest;
  readonly digest: Sha256Digest;
}

export interface ExactDockerVerifiedArtifactRefV2 {
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionReceiptDigest: Sha256Digest;
  readonly policyDigest: Sha256Digest;
  readonly artifactClass:
    | 'worker-result'
    | 'worker-partial-result'
    | 'worker-landing-proposal'
    | 'worker-provider-observation'
    | 'worker-timeout'
    | 'pristine-provider-stream';
  readonly artifactKey: string;
  readonly contentDigest: Sha256Digest;
  readonly byteLength: number;
  readonly capturedAt: string;
  readonly receiptDigest: Sha256Digest;
}

export type ExactDockerProviderStreamRefV2 = ExactDockerVerifiedArtifactRefV2 & Readonly<{
  readonly artifactClass: 'pristine-provider-stream';
}>;

export type ExactDockerWorkerResultArtifactRefV2 = ExactDockerVerifiedArtifactRefV2 & Readonly<{
  readonly artifactClass: 'worker-result';
}>;

export type ExactDockerLandingProposalArtifactRefV2 = ExactDockerVerifiedArtifactRefV2 & Readonly<{
  readonly artifactClass: 'worker-landing-proposal';
}>;

export interface ExactDockerProviderExitObservationRefV2 {
  readonly containerId: string;
  readonly exitCode: number;
  readonly observedAt: string;
  readonly waitEvidenceDigest: Sha256Digest;
  readonly observationReceiptDigest: Sha256Digest;
  readonly observationEvidenceDigest: Sha256Digest;
}

export interface ExactDockerHostWorkAttributionV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-host-work-attribution';
  readonly state: 'VERIFIED' | 'HOLD';
  readonly attemptId: string;
  readonly dispatchRequestId: string;
  readonly admissionRefDigest: Sha256Digest;
  readonly providerExitObservationReceiptDigest: Sha256Digest;
  readonly baselineRef: string;
  readonly baselineSha256: string;
  readonly scopeDigest: string;
  readonly filesChanged: readonly Readonly<{
    readonly path: string;
    readonly status: 'added' | 'modified' | 'deleted';
    readonly linesAdded: number;
    readonly linesRemoved: number;
  }>[];
  readonly totalLinesAdded: number;
  readonly totalLinesRemoved: number;
  readonly reasonCode: 'NONE' | 'BASELINE_INVALID' | 'DIFF_UNMEASURABLE';
  readonly evidenceDigest: Sha256Digest;
}

export interface ExactDockerCustodyTerminalQueryV2 {
  readonly custodyRef: ExactDockerCustodyRefV2;
  readonly releaseReceipt: ExactDockerCustodyReceiptRefV2;
  readonly providerStartReceipt: ExactDockerCustodyReceiptRefV2;
  readonly projectionFence: Sha256Digest;
}

export type ExactDockerCustodyTerminalHoldReasonCodeV2 =
  | 'DOCKER_WAIT_UNAVAILABLE'
  | 'DOCKER_WAIT_INVALID'
  | 'PRISTINE_PROVIDER_STREAM_INCOMPLETE'
  | 'PROVIDER_BILLING_UNAVAILABLE'
  | 'HOST_WORK_ATTRIBUTION_HOLD'
  | 'WORKER_RESULT_CAPTURE_HOLD'
  | 'LANDING_PROPOSAL_CAPTURE_HOLD'
  | 'LIVE_MONITOR_UNAVAILABLE'
  | 'EFFECT_PREPARE_HOLD'
  | 'EFFECT_PROVIDER_START_HOLD'
  | 'EFFECT_FINAL_CAPTURE_HOLD'
  | 'EFFECT_LANDING_HOLD'
  | 'EFFECT_RELEASE_HOLD'
  | 'EFFECT_PUBLICATION_HOLD';

interface ExactDockerCustodyTerminalBaseV2 {
  readonly custodyRef: ExactDockerCustodyRefV2;
  readonly releaseReceipt: ExactDockerCustodyReceiptRefV2;
  readonly projectionFence: Sha256Digest;
}

interface ExactDockerCustodyCapturedTerminalBaseV2
  extends ExactDockerCustodyTerminalBaseV2 {
  readonly providerExit: ExactDockerProviderExitObservationRefV2;
  readonly hostWorkAttribution: ExactDockerHostWorkAttributionV2;
  readonly hostEffectAuthority: CanonicalIngressEffectAuthorityV1;
  readonly providerStream: ExactDockerProviderStreamRefV2;
  readonly result: TaskResultAttemptCustodySourceBindingV2;
  /** Receipt projection carrying the Store-authoritative result capture time. */
  readonly resultArtifact: ExactDockerWorkerResultArtifactRefV2;
  readonly providerBilling: Readonly<{
    readonly evidence: ProviderBillingEvidence;
    readonly evidenceDigest: Sha256Digest;
    readonly providerStreamReceiptDigest: Sha256Digest;
  }>;
}

export type ExactDockerCustodyCompletionV2 =
  | Readonly<ExactDockerCustodyCapturedTerminalBaseV2 & {
      readonly kind: 'result-captured';
    }>
  | Readonly<ExactDockerCustodyCapturedTerminalBaseV2 & {
      readonly kind: 'landing-captured';
      readonly landingProposal: Readonly<{
        readonly artifact: ExactDockerLandingProposalArtifactRefV2;
        readonly proposal: ExactExecutionLandingProposalV3;
        /** Host timestamp taken only after Store verified the immutable bytes. */
        readonly verifiedAt: string;
      }>;
    }>
  | Readonly<ExactDockerCustodyTerminalBaseV2 & {
      readonly kind: 'capture-hold';
      readonly reasonCode: ExactDockerCustodyTerminalHoldReasonCodeV2;
      readonly evidence:
        | Readonly<{
            readonly kind: 'release-authority';
            readonly receipt: ExactDockerCustodyReceiptRefV2;
          }>
        | Readonly<{
            readonly kind: 'provider-exit-observation';
            readonly providerExit: ExactDockerProviderExitObservationRefV2;
          }>;
    }>;

export type ExactDockerCustodyDispatchOutcomeV2 =
  | Readonly<{
      kind: 'released';
      settlementRef: TaskResultSettlementRefV1;
      admissionRef: ExactDockerCustodyAdmissionRefV2;
      preparationRef: ExactDockerCustodyPreparationRefV2;
      custodyRef: ExactDockerCustodyRefV2;
      providerExecutionAttempt: TaskAttemptCustodyProviderExecutionAttemptV2;
      backendExecutionId: string;
      mountReceiptDigest: Sha256Digest;
      dispatchReceipt: ExactDockerCustodyReceiptRefV2;
      releaseReceipt: ExactDockerCustodyReceiptRefV2;
      providerStartReceipt: ExactDockerCustodyReceiptRefV2;
      projectionFence: Sha256Digest;
      readonly releasedAt: string;
      /** Trusted PID1 accepted the one-shot start authorization; process proof is separate. */
      readonly providerStartAcceptedAt: string;
    }>
  | Readonly<{
      kind: 'not-dispatched';
      admissionRef: ExactDockerCustodyAdmissionRefV2;
      custodyRef: ExactDockerCustodyIdentityRefV2;
      providerAttemptCount: 0;
      providerExecutionAttempt: null;
      reasonCode: TaskAttemptCustodyNotDispatchedReasonCode;
      zeroWorkReceipt: ExactDockerCustodyReceiptRefV2;
      projectionFence: Sha256Digest;
    }>
  | Readonly<{
      kind: 'ambiguous';
      admissionRef: ExactDockerCustodyAdmissionRefV2;
      custodyRef: ExactDockerCustodyIdentityRefV2;
      reasonCode: TaskAttemptCustodyAmbiguousReasonCode;
      reconciliationReceipt: ExactDockerCustodyReceiptRefV2;
      projectionFence: Sha256Digest;
    }>;

// ─── SpawnBackend Interface ───────────────────────────────────────────────────

/**
 * SpawnBackend — abstract interface for worker spawning backends.
 *
 * Implementations:
 *   - TmuxBackend: wraps tmux.ts (default on Linux/macOS/WSL2)
 *   - SubprocessBackend: wraps SubprocessSpawnBackend (Windows, no tmux)
 *
 * Brain uses SpawnBackendFactory.create() to obtain the appropriate backend.
 */
export interface SpawnBackend {
  /** Human-readable backend name (e.g. 'tmux', 'subprocess') */
  readonly name: string;
  readonly liveUsageBudgetSupport?: LiveUsageBudgetSupport;
  readonly executionLandingCapability?: ExecutionLandingCapability;
  /**
   * Whether this backend can actually hand the task-invariant worker core to
   * the provider through its system-prompt channel (`opts.systemPromptCore`).
   *
   * The prompt compiler suppresses the inline core blocks only when a backend
   * declares this, because suppressing them without delivery would silently
   * strip the worker's execution contract. Omitting the field means "cannot
   * deliver" — fail-closed, so a new backend keeps the core inline until it
   * proves the channel.
   */
  readonly canDeliverWorkerCore?: boolean;

  /**
   * Spawn a worker process for the given task.
   * @param taskId  Unique task identifier
   * @param model   Model to use
   * @param prompt  Prompt string sent to the worker
   * @param opts    Optional spawn options (projectDir, allowedTools, autoApprove)
   */
  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void;

  /**
   * Docker-only pre-publication admission seam. Other backends omit it and the
   * producer must return a typed unsupported/HOLD instead of synthesizing a
   * public attempt or falling back to shared `.tasks`.
   */
  /**
   * Async normal-Docker cutover port. Producers publish TASK_ASSIGN/EXECUTING
   * only after `released`; `not-dispatched` is zero provider work and
   * `ambiguous` is a typed HOLD. The historical synchronous `spawn()` remains
   * only for callers not yet moved by T6/T7.
   */
  prepareExactDockerCustody?(
    input: PrepareExactDockerCustodyInputV2,
  ): Promise<PreparedExactDockerCustodyV2>;

  dispatchExactDockerCustody?(
    envelope: ExactDockerCustodyDispatchEnvelopeV2,
  ): Promise<ExactDockerCustodyDispatchOutcomeV2>;

  awaitExactDockerCustodyTerminal?(
    query: ExactDockerCustodyTerminalQueryV2,
  ): Promise<ExactDockerCustodyCompletionV2>;

  /**
   * Backend-owned acceptance/read port for normal producers. It never exposes
   * the private CanonicalIngressAuthority or lets a caller mint a reader.
   */
  awaitExactDockerAcceptedResult?(
    query: ExactDockerCustodyTerminalQueryV2,
  ): Promise<ExactDockerAcceptResultOutcomeV2>;

  acceptExactDockerCustodyResult?(
    input: AcceptExactDockerCustodyResultInputV2,
  ): Promise<ExactDockerAcceptResultOutcomeV2>;

  readExactDockerAcceptedResult?(
    reader: ExactDockerAcceptedResultReaderV2,
  ): ExactDockerAcceptedResultV2;

  settleExactDockerAcceptedResult?(
    reader: ExactDockerAcceptedResultReaderV2,
    expectedAcceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata,
  ): Promise<SettleExactAcceptedResultOutcome>;

  readExactDockerAcceptedTaskTerminalAuthority?(input: Readonly<{
    readonly expectedAcceptedAuthority: ExactAcceptedTaskResultAuthorityMetadata;
    readonly expectedTerminalAuthority: ExactAcceptedResultTerminalAuthorityV2;
    readonly reader?: ExactDockerAcceptedResultReaderV2;
  }>): ExactAcceptedTaskTerminalAuthorityRead;

  /**
   * Kill a running worker by task ID.
   * @param taskId  Task identifier of the worker to kill
   */
  kill(taskId: string): void;

  /**
   * List currently active worker task IDs.
   */
  list(): string[];

  /**
   * Classify this coordinator's authority over a task's worker inventory.
   * Process-local backends return `unknown` for task ids they have never
   * observed, which prevents a freshly restarted coordinator from treating an
   * empty in-memory registry as proof that a live child vanished.
   */
  workerInventoryState?(taskId: string): 'active' | 'absent' | 'unknown';

  /**
   * Check whether this backend is available in the current environment.
   * For TmuxBackend: checks if tmux is installed.
   * For SubprocessBackend: always true (requires only Node.js).
   */
  isAvailable(): Promise<boolean>;

  /**
   * Reconcile durable pre-crash attempts after the coordinator holds project
   * leadership and before checkpoint state is interpreted. Backends without a
   * host-owned attempt journal omit this method.
   */
  reconcilePendingAttempts?(
    options?: SpawnBackendRecoveryOptions,
  ): Promise<SpawnBackendRecoveryReport>;
}

// ─── SpawnBackendOptions ──────────────────────────────────────────────────────

export interface SpawnBackendOptions extends ProviderSpawnOptions {
  /** Override project directory for this spawn */
  projectDir?: string;
  /** Tools the worker is allowed to use */
  allowedTools?: string;
  /**
   * Provider-visible built-in tool schema for a finite protocol worker.
   * Unlike `allowedTools`, this removes unused tool definitions from model
   * context. Currently consumed only by provider specs that declare support.
   */
  availableTools?: string;
  /** 7094-F3 (flag-gated): task-invariant worker core content for
   *  `claude --system-prompt-file <file>`; absent → today's args. */
  systemPromptCore?: string;
  /**
   * Run with the provider's isolated finite-context flags. This is opt-in and
   * protocol-scoped; ordinary implementation workers keep their existing
   * project instructions, hooks, plugins, and session behavior.
   */
  isolatedContext?: boolean;
  /** Whether to auto-approve all Claude prompts */
  autoApprove?: boolean;
  /** Log file path override (for subprocess backend) */
  logPath?: string;
  /** Whether this is a fix/retry spawn — adds -fix suffix to prompt filename */
  isPriorityFix?: boolean;
  /**
   * Per-task adaptive timeout in seconds, computed by brainEstimateTimeout().
   * When set, overrides the backend's default timeout constant.
   * Passed as TASK_TIMEOUT env var to Docker containers and as timeoutSeconds
   * parameter to tmux/subprocess backends.
   */
  taskTimeoutSeconds?: number;
  /**
   * Optional action id for the toggle-independent SAFETY_FLOOR guard (GATE-W2).
   * When set, `checkLethalGuard` checks the action against the 5 locked
   * SAFETY_FLOOR actions before any process is spawned — regardless of whether
   * `nervous.enabled` is true. Lethal actions throw SpawnBackendError.
   */
  actionId?: string;
  /** Exact host-owned attempt authority for Docker result finalization. */
  settlementRef?: TaskResultSettlementRefV1;
  /** Host-owned pre-mount landing context; Docker-only and never worker-authored. */
  executionLandingContext?: ExecutionLandingContextEnvelopeV1;
  /** Optional protocol-specific host projection applied before settlement. */
  hostTerminalResultContract?: HostTerminalResultContractV1;
  /**
   * Owner authorization to run a final-only-usage provider (no incremental
   * measured stream) under host wall-clock containment. Absent = fail closed:
   * a live token ceiling is refused rather than silently unenforced.
   */
  finalOnlyUsageContainment?: {
    readonly maxWallClockSeconds: number;
    readonly profileRef: string;
    readonly policyDigest: string;
  };
}

// ─── SpawnBackendError ────────────────────────────────────────────────────────

export class SpawnBackendError extends Error {
  constructor(
    message: string,
    public readonly backendName: string,
  ) {
    super(message);
    this.name = 'SpawnBackendError';
  }
}

// ─── Toggle-Independent Lethal Guard Helper ───────────────────────────────────

/**
 * Run the toggle-independent SAFETY_FLOOR guard before spawning a worker.
 *
 * Delegates to `assertNotLethalWithoutApproval` (panic-gate.ts) which fires
 * regardless of whether `config.nervous_system.enabled` is true. Non-lethal or
 * absent `actionId` is a no-op. Lethal actions (KILL_LIVE_SPRINT,
 * DESTRUCTIVE_GIT, MANUAL_FILE_DELETE, COST_OVER_THRESHOLD,
 * ADR_DEPRECATE_ACCEPTED) throw immediately — no process is ever spawned.
 *
 * @toggleIndependent — active even when nervous system is disabled.
 */
export function checkLethalGuard(actionId: string | undefined, backendName: string): void {
  if (!actionId) return;
  const result = assertNotLethalWithoutApproval(actionId);
  if (result.blocked) {
    throw new SpawnBackendError(result.reason, backendName);
  }
}

export function preflightClaudeAuthForLocalBackend(
  projectDir: string,
  taskId: string,
  provider: string | undefined,
  opts?: SpawnBackendOptions,
): boolean {
  if (provider !== 'claude') return true;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts?.env ?? {}),
    CLAUDE_AUTH_REQUIRED: '1',
  };
  if (!opts?.env?.['ANTHROPIC_API_KEY']) {
    delete env.ANTHROPIC_API_KEY;
    delete env.DECKENT_CLAUDE_API_KEY;
  }
  return authHealthCheck(projectDir, taskId, undefined, env).ok;
}

// ─── TmuxBackend ─────────────────────────────────────────────────────────────

/**
 * TmuxBackend — wraps tmux.ts functions behind the SpawnBackend interface.
 *
 * This preserves existing tmux functionality while making it swappable.
 * Requires tmux to be installed and running.
 */
export class TmuxBackend implements SpawnBackend {
  readonly name = 'tmux';
  readonly liveUsageBudgetSupport = undefined;
  /** No system-prompt core channel: `opts.systemPromptCore` is ignored here. */
  readonly canDeliverWorkerCore = false as const;

  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    checkLethalGuard(opts?.actionId, this.name);
    const dir = opts?.projectDir ?? this.projectDir;
    const executionBudget = resolveHostExecutionBudget(dir, taskId, opts?.executionBudget);
    assertLiveUsageBudgetSupport(executionBudget, this.liveUsageBudgetSupport, this.name);
    // Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
    // archived together by archivePromptFiles() during sprint cleanup phase.
    // (Same as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
    // Sprint 170 P0-3: tmux worker prompt files embed taskId
    // (`.prompt-{taskId}-{hash}.txt`, see tmux.ts writePromptFile), so the
    // active-worker selective filter in claude.ts._cleanupOrphanedPromptFiles
    // DOES protect them. Only the taskId-less Auditor prompt keeps the legacy
    // hex-only name — see ADR-048 Consequences (Negative) for the history.
    ensureSession();
    tmuxSpawnWorker(taskId, model, prompt, dir, {
      allowedTools: opts?.allowedTools,
      autoApprove: opts?.autoApprove,
      taskTimeoutSeconds: opts?.taskTimeoutSeconds,
      reasoningEffort: opts?.reasoningEffort, // F1-RE: native model reasoning depth
      excludeDynamicPromptSections: opts?.excludeDynamicPromptSections, // F3.1: prefix-stable cache
    });
  }

  kill(taskId: string): void {
    tmuxKillWorker(taskId);
  }

  list(): string[] {
    return tmuxListWorkers();
  }

  async isAvailable(): Promise<boolean> {
    const result = spawnSync('tmux', ['-V'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return result.status === 0;
  }
}

// ─── Subprocess Provider→CLI Resolution (SUBPROC-PROVIDER-CLI, 364-002) ───────
//
// born-481 (log-evidenced): SubprocessBackend always defaulted to
// CLAUDE_SUBPROCESS_CONFIG regardless of the spawned task's actual provider —
// a provider:codex task (model apiId gpt-5.5) was fed to the claude CLI's
// `--model` flag, which the Claude API rejects (404 -> worker exit 1). The
// CLI-binary + arg-table must be selected FROM THE PROVIDER, reusing
// PROVIDER_COMMAND_SPECS (core/provider-command-spec.ts) — the same SSOT
// spawn-backend-docker.ts's runSpawn() already keys off — so the docker and
// subprocess backends' provider→CLI mapping can never drift apart.
//
// Only STDIN-fed CLIs can be represented here: SubprocessProviderConfig.
// buildArgs(model, opts) has no prompt parameter — SubprocessSpawnBackend
// writes the prompt to the child's stdin separately (providers/subprocess.ts
// spawn(), after buildArgs() runs) — so an 'inline' promptFeed provider
// (gemini's `-p <text>`) cannot be expressed without changing that interface
// (out of this task's write scope). Any such provider, or one with no
// ProviderCommandSpec at all (ollama — host-only, ADR: use its host adapter),
// is an honest SpawnBackendError — never a silent claude-CLI fallback (Yasa #2).

let codexSubprocessConfig: SubprocessProviderConfig | undefined;

/**
 * Build (once, memoized) the codex SubprocessProviderConfig from
 * PROVIDER_COMMAND_SPECS.codex — the CLI binary + flag table are read from
 * that single source of truth, not re-hardcoded here.
 */
function getCodexSubprocessConfig(): SubprocessProviderConfig {
  if (codexSubprocessConfig) return codexSubprocessConfig;

  const spec = getProviderCommandSpec('codex');
  if (!spec) {
    // Unreachable in practice — codex is a built-in PROVIDER_COMMAND_SPECS
    // entry — kept as an honest failure instead of a non-null assertion.
    throw new SpawnBackendError(
      'No ProviderCommandSpec registered for "codex" — cannot build its subprocess CLI config.',
      'subprocess',
    );
  }

  // spec.baseArgs carries '--json' inline (the docker convention); the
  // subprocess backend applies a usage-emit flag ONLY at live-spawn time via
  // SubprocessProviderConfig.usageEmitArgs (mirrors CLAUDE_SUBPROCESS_CONFIG),
  // which keeps buildArgs()/buildCommandString() dry-run-stable — no
  // usage-telemetry flag leaking into the unit-tested arg shape or display string.
  const baseArgs = spec.baseArgs.filter(arg => !CODEX_USAGE_EMIT_ARGS.includes(arg));

  const config: SubprocessProviderConfig = {
    cliCommand: spec.binary,
    name: 'codex-subprocess',
    supportedModels: modelRegistry.getByProvider('codex').map(m => m.id) as ModelType[],
    buildArgs(model, opts) {
      const wireModel = modelRegistry.get(model)?.apiId ?? model;
      const args = [...baseArgs, spec.modelFlag, wireModel];
      if (opts?.autoApprove) {
        args.push(...spec.approvalArgs);
      }
      const effort = resolveReasoningEffort('codex', opts?.reasoningEffort);
      if (effort && spec.reasoningEffortArgs) {
        args.push(...spec.reasoningEffortArgs(effort));
      }
      return args;
    },
    buildCommandString(model, promptPath, opts) {
      const args = config.buildArgs(model, opts);
      return `${spec.binary} ${args.join(' ')} < ${promptPath}`;
    },
    usageEmitArgs: CODEX_USAGE_EMIT_ARGS,
  };

  codexSubprocessConfig = config;
  return config;
}

/**
 * Resolve the SubprocessProviderConfig for a non-claude provider. 'claude' is
 * handled by the caller as a direct CLAUDE_SUBPROCESS_CONFIG passthrough
 * (byte-identical to pre-364-002 behavior — see SubprocessBackend below).
 * 'codex' builds a matching config from PROVIDER_COMMAND_SPECS; any other
 * provider is an honest SpawnBackendError (born-481 — no silent claude
 * fallback), with a specific reason when the provider IS known but its CLI
 * cannot be expressed over this backend's stdin-only prompt delivery.
 */
function resolveSubprocessProviderConfig(provider: string): SubprocessProviderConfig {
  if (provider === 'codex') return getCodexSubprocessConfig();

  const spec = getProviderCommandSpec(provider);
  if (spec && spec.promptFeed !== 'stdin') {
    throw new SpawnBackendError(
      `Subprocess backend cannot spawn provider "${provider}": its CLI ("${spec.binary}") `
      + `expects the prompt as an inline argument, but SubprocessProviderConfig.buildArgs() has `
      + `no prompt access (the subprocess backend only supports stdin-fed CLIs). Use the docker `
      + `backend for this provider instead.`,
      'subprocess',
    );
  }
  throw new SpawnBackendError(
    `Subprocess backend has no CLI command mapping for provider "${provider}" `
    + `(supported: claude, codex). Refusing to silently spawn the claude CLI for a `
    + `mismatched provider — born-481.`,
    'subprocess',
  );
}

// ─── SubprocessBackend ────────────────────────────────────────────────────────

/**
 * SubprocessBackend — wraps SubprocessSpawnBackend behind the SpawnBackend interface.
 *
 * Runs workers as child processes without requiring tmux.
 * Works on any platform with Node.js (including Windows without WSL2).
 */
export class SubprocessBackend implements SpawnBackend {
  readonly name = 'subprocess';
  readonly liveUsageBudgetSupport = undefined;
  /** No system-prompt core channel: `opts.systemPromptCore` is ignored here. */
  readonly canDeliverWorkerCore = false as const;

  private readonly projectDir: string;
  private readonly timeoutMs: number;
  /**
   * One SubprocessSpawnBackend PER PROVIDER (364-002) — each instance owns
   * exactly one CLI binary, fixed at construction via providerConfig. Keyed
   * by provider so a mixed-provider sprint on spawn_backend=subprocess (e.g.
   * claude + codex tasks) gives each task its own CLI instead of every task
   * silently defaulting to claude's (born-481).
   */
  private readonly backendsByProvider = new Map<string, SubprocessSpawnBackend>();
  /** Per-task timeout backends are not provider-cached; retain their inventory authority. */
  private readonly taskBackends = new Map<string, SubprocessSpawnBackend>();
  private readonly observedTaskIds = new Set<string>();

  constructor(projectDir: string, opts?: { timeoutMs?: number }) {
    this.projectDir = projectDir;
    this.timeoutMs = opts?.timeoutMs ?? 0;
  }

  private getBackendForProvider(provider: string, timeoutOverrideMs?: number): SubprocessSpawnBackend {
    // 'claude' resolves the SAME CLAUDE_SUBPROCESS_CONFIG singleton
    // SubprocessSpawnBackend defaults to internally — byte-identical spawn
    // args to pre-364-002 behavior.
    const providerConfig = provider === 'claude' ? CLAUDE_SUBPROCESS_CONFIG : resolveSubprocessProviderConfig(provider);
    // When a per-task timeout is provided, create a fresh backend with that timeout
    // (SubprocessSpawnBackend.defaultTimeoutMs is protected, so we can't mutate it)
    if (timeoutOverrideMs != null) {
      return new SubprocessSpawnBackend(this.projectDir, {
        defaultTimeoutMs: timeoutOverrideMs,
        providerConfig,
      });
    }
    let backend = this.backendsByProvider.get(provider);
    if (!backend) {
      backend = new SubprocessSpawnBackend(this.projectDir, {
        defaultTimeoutMs: this.timeoutMs,
        providerConfig,
      });
      this.backendsByProvider.set(provider, backend);
    }
    return backend;
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    checkLethalGuard(opts?.actionId, this.name);
    // Sprint 168 C0e Cross-Backend Contract: tmpfiles persist until sprint cleanup,
    // archived together by archivePromptFiles() during sprint cleanup phase.
    // (Same as Docker backend spawn-backend-docker.ts:941-942 — Sprint 156 Task 4.)
    // Subprocess backend does NOT currently write `.prompt-*.txt` files (prompts
    // are passed via child_process argv / stdin), so the cross-backend contract
    // here is a marker that future prompt persistence MUST follow this lifecycle.
    // 364-002 (born-481): resolve the CLI-binary from the TASK'S ACTUAL PROVIDER,
    // not a fixed claude default — mirrors spawn-backend-docker.ts's runSpawn().
    const modelDefinition = modelRegistry.get(model);
    if (!modelDefinition) {
      throw new SpawnBackendError(
        `Subprocess backend cannot resolve a provider for unregistered model "${model}". `
        + 'Register the canonical API model identity with its explicit provider before dispatch.',
        'subprocess',
      );
    }
    const provider = modelDefinition.provider;
    const dir = opts?.projectDir ?? this.projectDir;
    if (!preflightClaudeAuthForLocalBackend(dir, taskId, provider, opts)) return;
    const timeoutOverrideMs = opts?.taskTimeoutSeconds != null
      ? opts.taskTimeoutSeconds * 1000
      : undefined;
    const taskBackend = this.getBackendForProvider(provider, timeoutOverrideMs);
    taskBackend.spawn(taskId, model, prompt, opts);
    this.taskBackends.set(taskId, taskBackend);
    this.observedTaskIds.add(taskId);
  }

  kill(taskId: string): void {
    const taskBackend = this.taskBackends.get(taskId);
    if (taskBackend?.listWorkers().includes(taskId)) {
      taskBackend.kill(taskId);
      this.taskBackends.delete(taskId);
      return;
    }
    // Scan every provider backend this instance has spawned through — a
    // mixed-provider sprint may hold the taskId on any one of them.
    for (const backend of this.backendsByProvider.values()) {
      if (backend.listWorkers().includes(taskId)) {
        backend.kill(taskId);
        return;
      }
    }
    // No cached backend currently tracks this taskId — surface the SAME
    // "No running worker" error SubprocessSpawnBackend itself throws (matches
    // pre-364-002 behavior for an unknown/already-exited task).
    this.getBackendForProvider('claude').kill(taskId);
  }

  list(): string[] {
    const backends = new Set([
      ...this.backendsByProvider.values(),
      ...this.taskBackends.values(),
    ]);
    const active = new Set(Array.from(backends).flatMap(b => b.listWorkers() as string[]));
    for (const taskId of this.taskBackends.keys()) {
      if (!active.has(taskId)) this.taskBackends.delete(taskId);
    }
    return [...active];
  }

  workerInventoryState(taskId: string): 'active' | 'absent' | 'unknown' {
    if (this.list().includes(taskId)) return 'active';
    return this.observedTaskIds.has(taskId) ? 'absent' : 'unknown';
  }

  async isAvailable(): Promise<boolean> {
    // Subprocess backend only needs Node.js — always available
    return true;
  }
}

// ─── SandboxBackend ───────────────────────────────────────────────────────────

/**
 * SandboxBackend — adapts SandboxSpawnBackend to the SpawnBackend interface.
 *
 * SandboxSpawnBackend extends SubprocessSpawnBackend (providers/) which exposes
 * listWorkers() instead of list(). This thin adapter bridges the gap so that
 * SandboxSpawnBackend can be used wherever SpawnBackend is expected.
 *
 * Activated with `deckent start --sandbox`.
 */
export class SandboxBackend implements SpawnBackend {
  readonly name = 'claude-sandbox';
  readonly liveUsageBudgetSupport = undefined;

  private readonly projectDir: string;
  private readonly inner: SandboxSpawnBackend;
  private readonly observedTaskIds = new Set<string>();

  constructor(projectDir: string, opts?: SandboxOptions) {
    this.projectDir = projectDir;
    this.inner = new SandboxSpawnBackend(projectDir, opts);
  }

  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    checkLethalGuard(opts?.actionId, this.name);
    const dir = opts?.projectDir ?? this.projectDir;
    const provider = modelRegistry.get(model)?.provider;
    if (!preflightClaudeAuthForLocalBackend(dir, taskId, provider, opts)) return;
    this.inner.spawn(taskId, model, prompt, opts);
    this.observedTaskIds.add(taskId);
  }

  kill(taskId: string): void {
    this.inner.kill(taskId);
  }

  list(): string[] {
    return this.inner.listWorkers() as string[];
  }

  workerInventoryState(taskId: string): 'active' | 'absent' | 'unknown' {
    if (this.list().includes(taskId)) return 'active';
    return this.observedTaskIds.has(taskId) ? 'absent' : 'unknown';
  }

  async isAvailable(): Promise<boolean> {
    return this.inner.isAvailable();
  }
}

/**
 * Factory — create a SandboxBackend for the given project root.
 * Use this from CLI/API surfaces (e.g. `deckent start --sandbox`).
 */
export function createSandboxBackend(projectDir: string, opts?: SandboxOptions): SandboxBackend {
  return new SandboxBackend(projectDir, opts);
}

// ─── Tmux Deprecation Warning ─────────────────────────────────────────────────

/**
 * Tracks sprint-scoped tmux deprecation warnings.
 * Populated by resolveBackend() when explicit 'tmux' is requested.
 * Reset at process start and can be reset for testing via resetTmuxDeprecationWarning().
 */
const _tmuxDeprecationWarned = new Set<string>();

/**
 * Reset the tmux deprecation warning tracker.
 * Call this at sprint start or in tests to allow the warning to be re-emitted.
 */
export function resetTmuxDeprecationWarning(): void {
  _tmuxDeprecationWarned.clear();
}

/**
 * Resolve the effective backend type to use.
 *
 * - 'auto' always resolves to 'docker' (Sprint 177 — default changed from tmux to docker).
 *   This eliminates the old auto→tmux fallback that caused Sprint 176 issues.
 * - 'tmux' emits a one-time deprecation warning. tmux support will be removed in Sprint 178.
 * - All other values pass through unchanged.
 *
 * @param backend  Requested backend type ('auto' | 'docker' | 'tmux' | 'subprocess')
 * @returns        Resolved backend type to actually instantiate
 */
let _dockerProbe: boolean | null = null;
let _autoFallbackWarned = false;

/** Probe once per process whether a docker daemon is actually reachable.
 *  `docker info` exits 0 only when the CLI exists AND the daemon answers —
 *  a bounded sync call (same spawnSync(binary,[args]) security pattern as the
 *  rest of the codebase), memoized so 'auto' resolution stays cheap. */
export function isDockerDaemonReachable(): boolean {
  if (_dockerProbe !== null) return _dockerProbe;
  try {
    const r = spawnSync('docker', ['info'], { timeout: 2_000, stdio: 'ignore' });
    _dockerProbe = r.status === 0;
  } catch {
    _dockerProbe = false;
  }
  return _dockerProbe;
}

/** Test-only: reset the memoized docker probe. */
export function _resetDockerProbeForTests(value?: boolean | null): void {
  _dockerProbe = value ?? null;
  _autoFallbackWarned = false;
}

/**
 * Backend kinds that can carry an externalized worker core.
 *
 * Only the docker backend builds the provider system-prompt argv for it
 * (`--system-prompt-file` for claude, `model_instructions_file=` for codex).
 * Every other kind ignores `opts.systemPromptCore`, so the core must stay
 * inline in the compiled prompt or the worker loses it entirely.
 */
const WORKER_CORE_DELIVERING_BACKENDS: ReadonlySet<string> = new Set(['docker']);

/**
 * Compile-time twin of {@link SpawnBackend.canDeliverWorkerCore}.
 *
 * The prompt is compiled before the per-task backend instance exists, so the
 * decision resolves from the backend kind. Unknown or absent kind resolves to
 * `false` (fail-closed): the core stays inline rather than being suppressed
 * with nothing delivering it.
 */
export function spawnBackendKindDeliversWorkerCore(backend: string | undefined): boolean {
  if (backend === undefined) return false;
  return WORKER_CORE_DELIVERING_BACKENDS.has(resolveBackend(backend));
}

export function resolveBackend(backend: string): string {
  if (backend === 'auto') {
    if (process.platform === 'win32') return 'subprocess';
    // KN2 (GR-2026-08-08-DOGFOOD-KN2-01): 'auto' is capability-probed. The
    // 2026-08-07 cold-start smoke measured a docker-less host getting the
    // docker backend anyway, so every spawn died before provider work. An
    // unreachable daemon now resolves to subprocess with a ONE-TIME typed log
    // (explicit adaptation, never silent — Yasa 2); a user who writes
    // 'docker' explicitly keeps the honest hard failure.
    if (isDockerDaemonReachable()) return 'docker';
    if (!_autoFallbackWarned) {
      _autoFallbackWarned = true;
      console.warn(
        '[deckent] spawn_backend=auto: docker daemon is not reachable — using the subprocess backend for this process. '
        + 'Install/start docker for container isolation, or set spawn_backend explicitly to silence this notice.',
      );
    }
    return 'subprocess';
  }

  if (backend === 'tmux') {
    const warnKey = 'tmux-deprecation';
    if (!_tmuxDeprecationWarned.has(warnKey)) {
      _tmuxDeprecationWarned.add(warnKey);
      console.warn(
        '[deckent] DEPRECATION: spawn_backend="tmux" is deprecated and will be removed in Sprint 178. ' +
        'Migrate to spawn_backend="docker" (recommended) or spawn_backend="subprocess" (Windows fallback). ' +
        'See docs/guide/troubleshooting.md for migration instructions.',
      );
    }
  }

  return backend;
}

// ─── SpawnBackendFactory ──────────────────────────────────────────────────────

export type BackendType = 'tmux' | 'subprocess' | 'docker' | 'auto' | 'sandbox';

export interface SpawnBackendFactoryOptions {
  /**
   * Backend type to use.
   * - 'docker': isolated Docker containers (recommended)
   * - 'tmux': tmux windows (legacy, DEPRECATED — will be removed Sprint 178)
   * - 'subprocess': child processes (Windows fallback)
   * - 'auto' (default): resolves to 'docker' (Sprint 177 — changed from tmux fallback)
   */
  backend?: BackendType;

  /** Project root directory for spawned workers */
  projectDir: string;

  /** Default worker timeout in ms (0 = no timeout) */
  defaultTimeoutMs?: number;

  /** Docker image for worker containers (default: deckent-worker:latest) */
  dockerImage?: string;

  /** Docker container timeout in seconds (default: 1200 = 20 minutes) */
  dockerTimeoutSeconds?: number;

  /** Docker graceful shutdown timeout in seconds (default: 15). SIGTERM → grace → SIGKILL. */
  dockerGracefulTimeoutSeconds?: number;

  /**
   * Per-worker Docker memory limit (docker `--memory`), e.g. "2g". Sprint 318
   * (B-WORKERMEM): wired from config.worker_memory_limit. Undefined → the backend
   * default DEFAULT_WORKER_MEMORY_LIMIT ('4g').
   */
  dockerMemoryLimit?: string;
  /** WORKER-ENV-TMPFS-001: config-driven worker HOME tmpfs size. */
  dockerHomeTmpfsSize?: string;

  /**
   * Per-worker Docker swap ceiling (docker `--memory-swap`). Wired from
   * `config.worker_memory_swap`. Undefined → the backend derives it from the
   * memory limit at × 1.5, the documented ratio. Must never be below the limit.
   */
  dockerMemorySwap?: string;

  /**
   * Opt-in per-TaskKind Docker memory limits, wired from
   * `config.worker_memory_limit_by_kind`. Swap for a kind is auto-derived at
   * limit × 1.5. Undefined/empty → every kind uses the default limit.
   */
  dockerKindMemoryLimits?: Record<string, string>;

  /**
   * Already-resolved prompt config. Production normally uses the project-bound
   * snapshot populated by loadConfig(); this seam keeps factory tests explicit.
   */
  effectiveConfig?: Pick<ResolvedConfig, 'prompt'>;

  /**
   * Sandbox backend options (memory limit, allowed dirs, network block).
   * Only consulted when backend is 'sandbox'.
   */
  sandboxOptions?: SandboxOptions;
}

/**
 * SpawnBackendFactory — selects and creates the appropriate SpawnBackend.
 *
 * Selection logic (Sprint 177 — updated):
 * 1. resolveBackend() is called first: 'auto' → 'docker'; 'tmux' → deprecation warning.
 * 2. Resolved type maps directly to the corresponding backend class.
 *    No more auto→tmux→subprocess chain (Sprint 176 root cause eliminated).
 */
export class SpawnBackendFactory {
  /**
   * Create a SpawnBackend based on the given options.
   *
   * @param opts  Factory options including backend preference and projectDir
   * @returns     A SpawnBackend instance ready to use
   */
  static create(opts: SpawnBackendFactoryOptions): SpawnBackend {
    const resolved = resolveBackend(opts.backend ?? 'auto');

    if (resolved === 'docker') {
      const effectiveConfig = opts.effectiveConfig ?? getLoadedConfig(opts.projectDir);
      return new DockerSpawnBackend(opts.projectDir, {
        image: opts.dockerImage,
        timeoutSeconds: opts.dockerTimeoutSeconds
          ?? (opts.defaultTimeoutMs ? Math.floor(opts.defaultTimeoutMs / 1000) : undefined),
        gracefulTimeoutSeconds: opts.dockerGracefulTimeoutSeconds,
        memoryLimit: opts.dockerMemoryLimit, // B-WORKERMEM (Sprint 318): config-driven --memory
        // MASTER-PLAN 666: both were previously unreachable from config — swap
        // fell back to a fixed constant and per-kind limits were never passed.
        memorySwap: opts.dockerMemorySwap,
        kindMemoryLimits: opts.dockerKindMemoryLimits,
        homeTmpfsSize: opts.dockerHomeTmpfsSize, // WORKER-ENV-TMPFS-001: config-driven HOME tmpfs
        catalogMountMask: effectiveConfig?.prompt?.catalog_mount_mask,
        codexCoreChannel: effectiveConfig?.prompt?.codex_core_channel,
        codexSuppressProjectDoc: effectiveConfig?.prompt?.codex_suppress_project_doc,
        productionWiringHostObserverFactory: ({ projectRoot, image, platform }) => (
          createExactProductionWiringHostObserver({ projectRoot, image, platform })
        ),
      });
    }

    if (resolved === 'subprocess') {
      return new SubprocessBackend(opts.projectDir, {
        timeoutMs: opts.defaultTimeoutMs,
      });
    }

    if (resolved === 'tmux') {
      return new TmuxBackend(opts.projectDir);
    }

    if (resolved === 'sandbox') {
      return new SandboxBackend(opts.projectDir, opts.sandboxOptions);
    }

    // Fallback — should not be reached after resolveBackend() normalisation
    return new SubprocessBackend(opts.projectDir, {
      timeoutMs: opts.defaultTimeoutMs,
    });
  }

  /**
   * Synchronous check for tmux availability (used during factory creation).
   */
  static isTmuxAvailable(): boolean {
    const result = spawnSync('tmux', ['-V'], {
      encoding: 'utf-8',
      timeout: 3_000,
    });
    return result.status === 0;
  }

  /**
   * Asynchronous backend creation — checks availability then creates.
   * Use this when you want the backend to confirm its own readiness.
   */
  static async createAsync(opts: SpawnBackendFactoryOptions): Promise<SpawnBackend> {
    const backend = SpawnBackendFactory.create(opts);
    const available = await backend.isAvailable();
    if (!available) {
      throw new SpawnBackendError(
        `Backend "${backend.name}" is not available in the current environment`,
        backend.name,
      );
    }
    return backend;
  }
}
