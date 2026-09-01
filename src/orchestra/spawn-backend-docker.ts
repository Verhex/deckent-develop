// ─── Docker Spawn Backend ─────────────────────────────────────────────────
// Spawns workers in isolated Docker containers.
// Each worker gets its own filesystem namespace — no cross-worker interference.
// Results collected via shared .tasks/ volume mount.

import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync, readdirSync, renameSync, chmodSync, statSync, rmdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { homedir, tmpdir, totalmem } from 'node:os';
import { types as nodeTypes } from 'node:util';
import type { ModelType } from '../core/types.js';
import { canonicalJson } from '../core/audit-writer.js';
import {
  assertCrossVerifyEnforcedAttemptContract,
  type CrossVerifyEnforcedAttemptContract,
} from '../core/cross-verify-execution-contract.js';
import {
  getProviderForModel,
  TaskStatus,
  type KnownWorkAttributionReasonCode,
  type ProviderName,
  type Task,
  type TaskResult,
} from '../core/task-types.js';
import { modelRegistry } from '../core/model-registry.js';
import { attendedExecutionProjectId } from '../core/attended-execution-approval.js';
import { getProviderCommandSpec, buildProviderCommand, PROMPT_CAT_TOKEN, type ProviderCommandSpec } from '../core/provider-command-spec.js';
import type {
  BoundedReachabilityProbeRequest,
  ProviderNativeProbeObservation,
} from '../core/provider-evidence-probe-contract.js';
import { createClaudeAdapter } from '../providers/claude.js';
import { createCodexAdapter } from '../providers/codex.js';
import { createCursorAdapter } from '../providers/cursor.js';
import { createGeminiAdapter } from '../providers/gemini.js';
import { buildSuggestedImageCmd } from '../core/worker-image-check.js';
import { LOCKS_DIR, TASKS_DIR } from '../core/constants.js';
import { archiveTaskArtifacts } from '../core/sprint-archive.js';
import {
  crossVerifyEvidenceBrokerDirectory,
  crossVerifyEvidenceReceiptRef,
  readCrossVerifyEvidenceReceipt,
} from '../core/cross-verify-evidence-broker.js';
import { DECK_FILE_NAME } from '../core/deck-file.js';
import { debugLog } from '../core/utils.js';
import { createDockerLifecycleError, DeckentError } from '../core/errors.js';
import { normalizeStreamEvent, writeLogEvent, type StreamLogEvent } from '../core/log-event.js';
import {
  extractTerminalAssistantOutputFromLog,
} from '../core/cross-verify-prompt.js';
import {
  assertExecutionBudgetShape,
  assertExecutionLandingSupport,
  assertLiveUsageBudgetSupport,
  hasLiveUsageCeiling,
} from '../core/live-execution-budget.js';
import { assertExecutionLandingPolicyConfig } from '../core/execution-budget-policy.js';
import {
  acquireSpawnLocks,
  releaseAllSpawnLocks,
  releaseStaleSpawnLocksForTask,
  SpawnLockError,
} from '../core/file-lock.js';
import { ProviderExecutionObservationStore } from '../core/provider-execution-observation-store.js';
import {
  parseProviderExecutionObservationInput,
  type ProviderExecutionObservationInput,
} from '../core/provider-execution-observation.js';
import { markPending, markActive, clearPending } from '../core/active-workers.js';
import { authHealthCheck } from '../agents/worker.js';
import {
  TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES,
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
  canonicalTaskAttemptCustodyJson,
  createTaskAttemptCustodyPolicy,
  type Sha256Digest,
  type TaskAttemptCustodyAdmissionV2,
  type TaskAttemptCustodyAmbiguousReasonCode,
  type TaskAttemptCustodyArtifactClass,
  type TaskAttemptCustodyArtifactLimit,
  type TaskAttemptCustodyArtifactReceiptV2,
  type TaskAttemptCustodyAttemptAccess,
  type TaskAttemptCustodyBackendMountTransferReceipt,
  type TaskAttemptCustodyDispatchAdmissionRefV2,
  type TaskAttemptCustodyDispatchObservationClass,
  type TaskAttemptCustodyDispatchPredecessorRefV2,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyNotDispatchedReasonCode,
  type TaskAttemptCustodyPolicyV2,
} from '../core/task-attempt-custody-store.js';
import {
  createTaskAttemptCustodyPosixAdapter,
  type TaskAttemptCustodyPosixDockerMountObservation,
  type TaskAttemptCustodyPosixMountConsumerInput,
} from '../core/task-attempt-custody-posix-adapter.js';
import {
  normalizeGlobalScopePlatform,
  resolveGlobalScopePaths,
} from '../core/global-scope-resolver.js';
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';
import {
  WorkerHeartbeatAuthorityStore,
  type WorkerHeartbeatAuthorityWrite,
} from '../core/worker-heartbeat-authority-store.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  createTaskResultSettlementRefForAttempt,
  DOCKER_ATTEMPT_LABELS,
  dockerAttemptLabels,
  dockerContainerNameForTask,
  assertTaskResultSettlementRef,
  listPendingTaskResultSettlementAttempts,
  parseTaskResultSettlementAttempt,
  readTaskProviderTerminalBillingReceipt,
  readTaskResultSettlementExecutionBudgetAuthority,
  readTaskResultSettlementExecutionContract,
  readTaskResultSettlement,
  readTaskResultSettlementClosure,
  readTaskResultSettlementDispatch,
  readTaskResultSettlementPrepared,
  readTaskResultSettlementPrompt,
  taskResultSettlementActiveClaimDigest,
  taskResultSettlementPromptEvidenceRef,
  taskResultSettlementPromptPath,
  taskResultSettlementAttemptPath,
  taskResultSettlementWorkAttributionBaselinePath,
  taskResultSettlementPath,
  taskProviderTerminalBillingEvidenceRef,
  writeTaskProviderActualCallReceiptAtomic,
  writeTaskProviderTerminalUsageReceiptAtomic,
  writeTaskProviderTerminalBillingReceiptAtomic,
  writeTaskResultSettlementLandedRetirementAtomic,
  writeTaskResultSettlementAttemptAtomic,
  writeTaskResultSettlementClosureAtomic,
  writeTaskResultSettlementDispatchAtomic,
  writeTaskResultSettlementExecutionBudgetAuthorityAtomic,
  writeTaskResultSettlementExecutionContractAtomic,
  writeTaskResultSettlementPreparedAtomic,
  writeTaskResultSettlementPromptAtomic,
  writeTaskResultSettlementWorkAttributionBaselineAtomic,
  writeTaskResultSettlementAtomic,
  type TaskProviderTerminalBillingReceiptV1,
  type TaskProviderTerminalUsageSourceV1,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import { projectDockerRecoveryPreDispatchSettlement } from '../core/pre-dispatch-settlement.js';
import { normalizeTaskResultShape } from '../core/task-result-schema.js';
import {
  taskResultV2Digest,
  validateProductionTaskResultV2,
  type TaskResultV2,
} from '../core/task-result-schema.js';
import {
  EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
  type ExecutionEffectCaptureLimits,
  type ExecutionEffectNativeCaptureEntryV1,
  type ExecutionEffectNativeCaptureTreeV1,
} from '../core/execution-effect-containment.js';
import { loadExecAuthorityNative } from '../core/exec-authority-native.js';
import {
  EXECUTION_EFFECT_PROTECTED_TREES,
  EXECUTION_EFFECT_PORTABLE_PATH_LIMITS,
  isExecutionEffectProtectedPath,
  parseExecutionEffectPortablePath,
  type CanonicalScopeManifest,
  type ScopeSelector,
} from '../core/execution-write-scope-policy.js';
import {
  createExecutionEffectLandingTerminalSealV1,
  createExecutionEffectLandingNativeReceiptEvidenceV1,
  createExecutionEffectLandingFinalReceiptEvidenceV1,
  createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1,
  createExecutionEffectLandingLeaseResumeContextV1,
  createExecutionEffectPersistenceOperationV1,
  executionEffectLandingIntentDigestV1,
  executionEffectLandingDeterministicBoundaryIdV1,
  type ExecutionEffectLandingReceiptV1,
  type ExecutionEffectLandingLeaseResumeContextV1,
  type ExecutionEffectLandingLeaseV1,
  type ExecutionEffectLandingBoundaryV1,
  type ExecutionEffectLandingTerminalSealV1,
  type ExecutionEffectPersistenceDigest,
  type ExecutionEffectPersistenceOperationV1,
} from '../core/execution-effect-persistence-contract.js';
import {
  finalizePromptDeliveryReceipt,
  publishWorkerCoreArtifact,
  readPromptDeliveryReceipt,
  resolvePromptDeliveryAttribution,
  type PromptInjectionChannel,
  type WorkerCoreArtifact,
} from '../core/prompt-delivery-receipt.js';
import {
  createWorkerActivityHeartbeat,
  serializeWorkerActivityHeartbeat,
} from '../core/worker-activity-heartbeat.js';
import {
  listRetiredExecutionLandings,
  createExecutionLandingPreparationRefV2,
  readExecutionLandingCheckpointByRef,
  executionLandingCheckpointPath,
  writeExecutionAttemptRetirementAtomic,
  type ExecutionLandingCheckpointRefV1,
} from '../core/execution-landing-checkpoint.js';
import {
  buildExactExecutionLandingProposalPromptSegment,
  parseExactExecutionLandingProposalJsonV3,
  type ExactExecutionLandingProposalV3,
} from '../core/execution-landing-proposal.js';
import { BASE_PROVIDER_CREDENTIAL_ENV } from '../providers/cross-provider-keys.js';
import type {
  HostTerminalResultContractV1,
  SpawnBackend,
  SpawnBackendOptions,
  SpawnBackendRecoveryOptions,
  SpawnBackendRecoveryReport,
  SpawnBackendRecoveryHold,
  SpawnBackendRecoveryHoldAuthorityState,
  SpawnBackendRecoveryHoldReasonCode,
  ExactDockerCustodyDispatchOutcomeV2,
  ExactDockerCustodyCompletionV2,
  ExactDockerCustodyDispatchEnvelopeV2,
  ExactDockerAcceptedResultReaderV2,
  ExactDockerAcceptedResultV2,
  ExactDockerAcceptResultOutcomeV2,
  AcceptExactDockerCustodyResultInputV2,
  ExactDockerCustodyIdentityRefV2,
  ExactDockerCustodyPreparationRefV2,
  ExactDockerCustodyTerminalQueryV2,
  ExactDockerCustodyRefV2,
  ExactDockerLandingProposalArtifactRefV2,
  ExactDockerHostWorkAttributionV2,
  ExactDockerProviderExitObservationRefV2,
  ExactDockerProviderStreamRefV2,
  ExactDockerPromptDeliveryAuthorityV2,
  ExactDockerVerifiedArtifactRefV2,
  PreparedExactDockerCustodyV2,
  PrepareExactDockerCustodyInputV2,
} from './spawn-backend.js';
import { SpawnBackendError, checkLethalGuard } from './spawn-backend.js';
import { getDefaultProviderName } from './sprint-utils.js';
import {
  assembleCanonicalIngressResult,
  assembleCanonicalIngressResultV2,
  type CanonicalIngressAuthority,
  type CanonicalIngressCustodyAuthority,
} from './result-ingress.js';
import {
  createExactAcceptedTaskResultRefV2,
  type ExactAcceptedTaskResultRefV2,
} from '../core/task-settlement-authority.js';
import { installGitGuard, buildDockerGitGuardArgs, buildGitGuardDir, CONTAINER_GIT_PATH } from './git-worker-guard.js';
import { captureStreamToLog } from './spawn-backend-subprocess.js';
import { makeActivityOnEvent, type ActivityTapContext } from '../agents/worker-activity.js';
import {
  aggregateProviderBillingEvidence,
  extractProviderBillingEvidence,
  type ProviderBillingEvidence,
} from '../core/provider-billing-evidence.js';
import {
  createRuntimeBudgetMonitor,
  readRuntimeBudgetExhaustion,
  readRuntimeBudgetLandingRequest,
  readRuntimeBudgetUsage,
  resolveHostExecutionBudget,
  type RuntimeBudgetLandingEvidence,
  type RuntimeBudgetStopEvidence,
  type RuntimeBudgetUsageEvidence,
} from './runtime-budget-monitor.js';
import {
  dispatchExecutionContinuation,
  type ExecutionContinuationDispatchResult,
} from './execution-continuation-runner.js';
import {
  prepareDockerExecutionLanding,
  stampDockerExecutionLandingCheckpoint,
} from './execution-landing-coordinator.js';
import {
  authorizeExecutionEffectDockerProviderStartV1,
  captureExecutionEffectDockerFinalV1,
  createExecutionEffectDockerDependencyAuthorityReceiptV1,
  createExecutionEffectDockerExclusiveAttachmentReceiptV1,
  createExecutionEffectDockerImageObservationV1,
  createExecutionEffectDockerLifecycleCaptureReceiptV1,
  createExecutionEffectDockerPopulationReceiptV1,
  createExecutionEffectDockerProviderStoppedReceiptV1,
  createExecutionEffectDockerReconciledAbsenceReceiptV1,
  createExecutionEffectDockerResourceAbsenceReceiptV1,
  createExecutionEffectDockerResourceDeletionReceiptV1,
  createExecutionEffectDockerVolumeCreationReceiptV1,
  createExecutionEffectDockerVolumeObservationV1,
  createExecutionEffectDockerWorkspacePlanV1,
  isExecutionEffectDockerDaemonTimestampV1,
  allocateExecutionEffectDockerWorkspaceV1,
  authorizeDurableExecutionEffectDockerAllocationV1,
  prepareAllocatedExecutionEffectDockerWorkspaceV1,
  rehydrateExecutionEffectDockerLifecycleV1,
  executionEffectDockerVolumeIdentityDigestV1,
  type ExecutionEffectDockerLifecycleAdapterV1,
  type ExecutionEffectDockerRawCaptureV1,
  type ExecutionEffectDockerWorkspacePlanV1,
} from './execution-effect-docker-lifecycle.js';
import {
  createExecutionEffectLandingNativeAdapterV1,
  type ExecutionEffectNativeAdapterClockV1,
  type ExecutionEffectNativeAdapterLimitsV1,
  type ExecutionEffectDockerWorkspaceRuntimeV1,
  type ExecutionEffectNativeSourceAuthorityV1,
} from './execution-effect-native-adapter.js';
import {
  EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS,
  EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES,
  applyExecutionEffectLandingV1,
  prepareExecutionEffectLandingV1,
  readExecutionEffectLandingLocatorV1,
  reconcileExecutionEffectLandingV1,
  type ExecutionEffectLandingOutcomeV1,
  type ExecutionEffectLandingFinalVerificationReceiptV1,
  type ExecutionEffectLandingNativeMutationReceiptV1,
  type ExecutionEffectLandingOperationV1,
  type ExecutionEffectLandingTransactionRefV1,
} from './execution-effect-landing-coordinator.js';
import { createExecutionEffectLockAdapterV1 } from './execution-effect-lock-adapter.js';
import {
  createExecutionEffectLifecycleStoreAdmissionAdapterV1,
  createExecutionEffectStoreAdapterV1,
  executionEffectStoreCleanupArtifactKeyV1,
  type ExecutionEffectStoreAcceptedAuthorityV1,
  type ExecutionEffectStoreAdapterV1,
  type ExecutionEffectStorePreparedWorkspaceAuthorityV1,
} from './execution-effect-store-adapter.js';
import { readCompletedExecutionLockBoundary } from '../core/file-lock.js';

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_IMAGE = 'deckent-worker:latest';
/** @deprecated Use adaptive timeout via brainEstimateTimeout() + SpawnBackendOptions.taskTimeoutSeconds instead. Kept for backward compat fallback. */
const DEFAULT_TIMEOUT_SECONDS = 1200; // 20 minutes
const CONTAINER_WORKSPACE = '/workspace';
const CONTAINER_GIT_COMMON_DIR = '/run/deckent-git/common';
const CONTAINER_EXACT_XVERIFY_PROMPT = '/run/deckent-xverify-prompt.txt';
const DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15;
const EXACT_DOCKER_TASK_SNAPSHOT_PATH = '/run/deckent/task.json';
const EXACT_DOCKER_WORKER_OUTPUT_PATH = '/workspace/.tasks';
const EXACT_DOCKER_RELEASE_INTENT_FILE = '/run/deckent/release-intent';
const EXACT_DOCKER_RELEASE_COMMIT_FILE = '/run/deckent/release-commit';
const EXACT_DOCKER_GATE_ACK_FILE = '/run/deckent/gate-ack.json';
const EXACT_DOCKER_RELEASE_ARMED_ACK_FILE = '/run/deckent/release-armed-ack.json';
const EXACT_DOCKER_PROVIDER_START_FILE = '/run/deckent/provider-start';
const EXACT_DOCKER_PROVIDER_START_ACK_FILE = '/run/deckent/provider-start-ack.json';
const EXACT_DOCKER_EXECUTION_COMMIT_FILE = '/run/deckent/execution-commit';
const EXACT_DOCKER_PROVIDER_EXECUTION_ACK_FILE = '/run/deckent/provider-execution-ack.json';
const EXACT_DOCKER_CUSTODY_STATE_DIR = 'task-attempt-custody';
const EXACT_DOCKER_CUSTODY_METADATA_MAX_BYTES = 1024 * 1024;

export interface ExactDockerProviderStartAuthorizationExpectationV2 {
  readonly admissionRefDigest: Sha256Digest;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly providerInvocationDigest: Sha256Digest;
  readonly authorityLabelsDigest: Sha256Digest;
  readonly providerStartNonceSha256: Sha256Digest;
  readonly executionCommitNonceSha256: Sha256Digest;
}

/**
 * Shared strict parser for the one-shot PID1 start authorization. The exact
 * function body is embedded below, so unit evidence exercises the same parser
 * that guards provider creation in the container rather than a fixture copy.
 */
export function verifyExactDockerProviderStartAuthorization(
  value: unknown,
  expected: ExactDockerProviderStartAuthorizationExpectationV2,
  nonceDigest: (bytes: Uint8Array) => string,
): boolean {
  const keys = [
    'schemaVersion', 'kind', 'nonce', 'admissionRefDigest',
    'taskSnapshotSha256', 'providerInvocationDigest', 'authorityLabelsDigest',
    'executionCommitNonceSha256',
    'providerExecutionAttemptId', 'providerExecutionAttemptIdentityDigest',
    'dispatchReceiptDigest', 'releaseReceiptRef', 'releaseReceiptDigest',
    'projectionFence',
  ];
  if (!value || typeof value !== 'object') return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length
    || ownKeys.some(key => typeof key !== 'string' || !keys.includes(key))) return false;
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return false;
    record[key] = descriptor.value;
  }
  const isDigest = (candidate: unknown): boolean =>
    typeof candidate === 'string' && /^sha256:[a-f0-9]{64}$/u.test(candidate);
  return record.schemaVersion === 2
    && record.kind === 'exact-docker-provider-start-authorization'
    && typeof record.nonce === 'string'
    && /^[a-f0-9]{64}$/u.test(record.nonce)
    && nonceDigest(Buffer.from(record.nonce, 'hex')) === expected.providerStartNonceSha256
    && record.admissionRefDigest === expected.admissionRefDigest
    && record.taskSnapshotSha256 === expected.taskSnapshotSha256
    && record.providerInvocationDigest === expected.providerInvocationDigest
    && record.authorityLabelsDigest === expected.authorityLabelsDigest
    && record.executionCommitNonceSha256 === expected.executionCommitNonceSha256
    && typeof record.providerExecutionAttemptId === 'string'
    && record.providerExecutionAttemptId.length > 0
    && isDigest(record.providerExecutionAttemptIdentityDigest)
    && isDigest(record.dispatchReceiptDigest)
    && isDigest(record.releaseReceiptRef)
    && isDigest(record.releaseReceiptDigest)
    && isDigest(record.projectionFence);
}

const EXACT_DOCKER_PID1_SOURCE = String.raw`
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';

const snapshotPath = '/run/deckent/task.json';
const releaseIntentPath = '/run/deckent/release-intent';
const releaseCommitPath = '/run/deckent/release-commit';
const gateAckPath = '/run/deckent/gate-ack.json';
const releaseArmedAckPath = '/run/deckent/release-armed-ack.json';
const providerStartPath = '/run/deckent/provider-start';
const providerStartAckPath = '/run/deckent/provider-start-ack.json';
const executionCommitPath = '/run/deckent/execution-commit';
const providerExecutionAckPath = '/run/deckent/provider-execution-ack.json';
const promptPath = '/run/deckent/prompt.txt';
const corePath = '/run/deckent/system-core.md';
const baselinePath = '/run/deckent/scope-baseline.txt';
const sha256 = value => 'sha256:' + createHash('sha256').update(value).digest('hex');
const isDigest = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
const verifyProviderStartAuthorization = ${verifyExactDockerProviderStartAuthorization.toString()};
const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
const dispatch = snapshot?.dispatch;
if (!dispatch
  || snapshot?.schemaVersion !== 2
  || snapshot?.kind !== 'exact-docker-dispatch-snapshot'
  || sha256(dispatch.prompt) !== dispatch.promptSha256
  || sha256(dispatch.scopeBaseline) !== dispatch.scopeBaselineSha256
  || sha256(dispatch.runnerSource) !== dispatch.runnerSourceSha256
  || (dispatch.systemPromptCore === null
    ? dispatch.systemPromptCoreSha256 !== null
    : sha256(dispatch.systemPromptCore) !== dispatch.systemPromptCoreSha256)) process.exit(78);
writeFileSync(promptPath, dispatch.prompt, { flag: 'wx', mode: 0o400 });
writeFileSync(baselinePath, dispatch.scopeBaseline, { flag: 'wx', mode: 0o400 });
if (dispatch.systemPromptCore !== null) {
  writeFileSync(corePath, dispatch.systemPromptCore, { flag: 'wx', mode: 0o400 });
}
writeFileSync('/run/deckent/runner.mjs', dispatch.runnerSource, { flag: 'wx', mode: 0o500 });
const readNonce = async (path, expected) => {
  for (;;) {
    try {
      const nonce = readFileSync(path);
      if (nonce.byteLength > 0 && nonce.byteLength <= 256 && sha256(nonce) === expected) {
        unlinkSync(path);
        return;
      }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 25));
  }
};
await readNonce(releaseIntentPath, dispatch.releaseIntentNonceSha256);
writeFileSync(gateAckPath, JSON.stringify({
  schemaVersion: 2,
  kind: 'exact-docker-pid1-gate-ack',
  admissionRefDigest: process.env.DECKENT_CUSTODY_ADMISSION_REF_DIGEST,
  releaseIntentNonceSha256: dispatch.releaseIntentNonceSha256,
  releaseCommitNonceSha256: dispatch.releaseCommitNonceSha256,
  providerInvocationDigest: dispatch.providerInvocationDigest,
  pid1Sha256: process.env.DECKENT_CUSTODY_PID1_SHA256,
  taskSnapshotSha256: process.env.DECKENT_CUSTODY_TASK_SNAPSHOT_SHA256,
  state: 'GATED_ACKNOWLEDGED',
  providerState: 'NOT_STARTED',
}) + '\n', { flag: 'wx', mode: 0o400 });
await readNonce(releaseCommitPath, dispatch.releaseCommitNonceSha256);
writeFileSync(releaseArmedAckPath, JSON.stringify({
  schemaVersion: 2,
  kind: 'exact-docker-pid1-release-armed-ack',
  admissionRefDigest: process.env.DECKENT_CUSTODY_ADMISSION_REF_DIGEST,
  providerInvocationDigest: dispatch.providerInvocationDigest,
  releaseCommitNonceSha256: dispatch.releaseCommitNonceSha256,
  state: 'RELEASE_ARMED',
  providerState: 'NOT_STARTED',
}) + '\n', { flag: 'wx', mode: 0o400 });
let acceptedAuthorization = null;
let providerStartAckBytes = null;
for (;;) {
  try {
    const raw = readFileSync(providerStartPath);
    if (raw.byteLength <= 4096) {
      const authorization = JSON.parse(raw.toString('utf8'));
      if (verifyProviderStartAuthorization(authorization, {
        admissionRefDigest: process.env.DECKENT_CUSTODY_ADMISSION_REF_DIGEST,
        taskSnapshotSha256: process.env.DECKENT_CUSTODY_TASK_SNAPSHOT_SHA256,
        providerInvocationDigest: dispatch.providerInvocationDigest,
        authorityLabelsDigest: process.env.DECKENT_CUSTODY_LABELS_DIGEST,
        providerStartNonceSha256: dispatch.providerStartNonceSha256,
        executionCommitNonceSha256: dispatch.executionCommitNonceSha256,
      }, sha256)) {
        unlinkSync(providerStartPath);
        if (existsSync(executionCommitPath)) process.exit(78);
        acceptedAuthorization = authorization;
        const providerStartAck = {
          schemaVersion: 2,
          kind: 'exact-docker-pid1-provider-start-ack',
          admissionRefDigest: authorization.admissionRefDigest,
          taskSnapshotSha256: authorization.taskSnapshotSha256,
          providerInvocationDigest: authorization.providerInvocationDigest,
          authorityLabelsDigest: authorization.authorityLabelsDigest,
          providerStartNonceSha256: dispatch.providerStartNonceSha256,
          executionCommitNonceSha256: authorization.executionCommitNonceSha256,
          providerExecutionAttemptId: authorization.providerExecutionAttemptId,
          providerExecutionAttemptIdentityDigest: authorization.providerExecutionAttemptIdentityDigest,
          dispatchReceiptDigest: authorization.dispatchReceiptDigest,
          releaseReceiptRef: authorization.releaseReceiptRef,
          releaseReceiptDigest: authorization.releaseReceiptDigest,
          projectionFence: authorization.projectionFence,
          startAuthorizationDigest: sha256(raw),
          state: 'START_AUTHORIZATION_ACCEPTED',
          providerState: 'NOT_STARTED',
        };
        providerStartAckBytes = JSON.stringify(providerStartAck) + '\n';
        writeFileSync(providerStartAckPath, providerStartAckBytes, { flag: 'wx', mode: 0o400 });
        break;
      }
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 25));
}
await readNonce(executionCommitPath, dispatch.executionCommitNonceSha256);
const child = spawn(process.execPath, ['/run/deckent/runner.mjs'], { stdio: 'inherit' });
await new Promise((resolve, reject) => {
  const onSpawn = () => { child.off('error', onError); resolve(); };
  const onError = error => { child.off('spawn', onSpawn); reject(error); };
  child.once('spawn', onSpawn);
  child.once('error', onError);
}).catch(() => process.exit(79));
if (!acceptedAuthorization || !providerStartAckBytes
  || !Number.isSafeInteger(child.pid) || child.pid <= 0) process.exit(78);
writeFileSync(providerExecutionAckPath, JSON.stringify({
  schemaVersion: 2,
  kind: 'exact-docker-pid1-provider-execution-ack',
  admissionRefDigest: acceptedAuthorization.admissionRefDigest,
  taskSnapshotSha256: acceptedAuthorization.taskSnapshotSha256,
  providerInvocationDigest: acceptedAuthorization.providerInvocationDigest,
  authorityLabelsDigest: acceptedAuthorization.authorityLabelsDigest,
  executionCommitNonceSha256: acceptedAuthorization.executionCommitNonceSha256,
  providerExecutionAttemptId: acceptedAuthorization.providerExecutionAttemptId,
  providerExecutionAttemptIdentityDigest: acceptedAuthorization.providerExecutionAttemptIdentityDigest,
  dispatchReceiptDigest: acceptedAuthorization.dispatchReceiptDigest,
  releaseReceiptRef: acceptedAuthorization.releaseReceiptRef,
  releaseReceiptDigest: acceptedAuthorization.releaseReceiptDigest,
  projectionFence: acceptedAuthorization.projectionFence,
  startAuthorizationDigest: sha256(Buffer.from(JSON.stringify(acceptedAuthorization))),
  providerStartAckBytesSha256: sha256(Buffer.from(providerStartAckBytes)),
  childPid: child.pid,
  state: 'PROVIDER_PROCESS_SPAWNED',
  providerState: 'STARTED',
}) + '\n', { flag: 'wx', mode: 0o400 });
const forward = signal => { try { child.kill(signal); } catch {} };
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));
child.on('error', () => process.exit(79));
child.on('exit', (code, signal) => process.exit(signal ? 128 : (code ?? 79)));
`;
const EXACT_DOCKER_NATIVE_PROBE_SOURCE = String.raw`
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { loadExecAuthorityNative } from '/app/dist/core/exec-authority-native.js';
const loaded = loadExecAuthorityNative();
if (!loaded.available || loaded.manifest.platform !== 'linux') process.exit(78);
const custody = loaded.custody;
const opened = [];
try {
  const taskRoot = custody.invoke('open-root', { path: '/run/deckent', disposition: 'OPEN_EXISTING', privacyPolicy: 'OWNER_PRIVATE' });
  opened.push(taskRoot.handle);
  const task = custody.invoke('open-file-at', { parent: taskRoot.handle, name: 'task.json', disposition: 'OPEN_EXISTING', privacyPolicy: 'OWNER_PRIVATE' });
  opened.push(task.handle);
  const output = custody.invoke('open-root', { path: '/workspace/.tasks', disposition: 'OPEN_EXISTING', privacyPolicy: 'OWNER_PRIVATE' });
  opened.push(output.handle);
  const separation = custody.invoke('prove-root-separation', { custodyRoot: output.handle, canonicalProjectRoot: '/workspace' });
  const candidates = [
    '/app/native/exec-authority/build/Release',
    '/app/native/exec-authority/prebuilds/linux-' + process.arch + '/napi-v8',
  ];
  const complete = candidates.filter(path => existsSync(path + '/artifact.json') && existsSync(path + '/exec_authority.node'));
  if (complete.length !== 1) process.exit(78);
  const artifact = JSON.parse(readFileSync(complete[0] + '/artifact.json', 'utf8'));
  const binarySha256 = 'sha256:' + createHash('sha256').update(readFileSync(complete[0] + '/exec_authority.node')).digest('hex');
  if (binarySha256 !== artifact.binarySha256
    || artifact.abiName !== loaded.manifest.abiName
    || artifact.abiVersion !== loaded.manifest.abiVersion
    || artifact.handleAbi !== loaded.manifest.handleAbi
    || artifact.packageName !== loaded.manifest.packageName
    || artifact.packageVersion !== loaded.manifest.packageVersion) process.exit(78);
  process.stdout.write(JSON.stringify({
    taskIdentity: task.identity,
    outputIdentity: output.identity,
    taskContentDigest: 'sha256:' + createHash('sha256').update(readFileSync('/run/deckent/task.json')).digest('hex'),
    bootstrap: {
      abiName: loaded.manifest.abiName,
      abiVersion: loaded.manifest.abiVersion,
      napiVersion: loaded.manifest.napiVersion,
      handleAbi: loaded.manifest.handleAbi,
      packageName: loaded.manifest.packageName,
      packageVersion: loaded.manifest.packageVersion,
      platform: loaded.manifest.platform,
      arch: loaded.manifest.arch,
      binarySha256,
      rootSeparationEvidenceBits: separation.featureEvidenceBits,
    },
  }) + '\n');
} finally {
  for (const handle of opened.reverse()) { try { custody.closeHandle(handle); } catch {} }
}
`;

/** Test/audit projection; the provider cannot replace image-owned native bootstrap code. */
export function exactDockerCustodyNativeProbeSource(): string {
  return EXACT_DOCKER_NATIVE_PROBE_SOURCE;
}

/** Verification projection of the immutable PID1 program used by the real launch argv. */
export function exactDockerCustodyPid1Source(): string {
  return EXACT_DOCKER_PID1_SOURCE;
}
// Exported as the SSOT container-name prefix so the host-liveness probe
// (heartbeat-monitor.ts) derives `deckent-w-<taskId>` from the SAME constant the
// backend uses to `docker run --name` / `docker wait` — no drifting duplicate.
export const CONTAINER_PREFIX = 'deckent-w-';

type ExactDockerCustodyState =
  | 'PREPARED'
  | 'MOUNT_CONSUMING'
  | 'MOUNTED_GATED'
  | 'RELEASED'
  | 'HOLD';

type ExactDockerCustodyFailureReasonCode =
  | 'EXACT_DOCKER_ARTIFACT_CLASS_INVALID'
  | 'EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID'
  | 'EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH'
  | 'EXACT_DOCKER_ENVELOPE_CONSUMED'
  | 'EXACT_DOCKER_EXECUTION_COMMIT_RECONCILIATION_REQUIRED'
  | 'EXACT_DOCKER_ENVELOPE_INVALID'
  | 'EXACT_DOCKER_IDEMPOTENCY_REPLAY_MISMATCH'
  | 'EXACT_DOCKER_INPUT_INVALID'
  | 'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED'
  | 'EXACT_DOCKER_OBSERVATION_INVALID'
  | 'EXACT_DOCKER_OBSERVATION_REREAD_INVALID'
  | 'EXACT_DOCKER_PREDECESSOR_INVALID'
  | 'EXACT_DOCKER_PRIVATE_ADMISSION_HOLD'
  | 'EXACT_DOCKER_PROMPT_DELIVERY_AUTHORITY_HOLD'
  | 'EXACT_DOCKER_PROVIDER_EXIT_OBSERVATION_INVALID'
  | 'EXACT_DOCKER_PROVIDER_START_GATE_UNCONFIRMED'
  | 'EXACT_DOCKER_PROVIDER_START_RECONCILIATION_REQUIRED'
  | 'EXACT_DOCKER_PROVIDER_UNAVAILABLE'
  | 'EXACT_DOCKER_RECONCILIATION_REQUIRED'
  | 'EXACT_DOCKER_RELEASE_AUTHORITY_MISSING'
  | 'EXACT_DOCKER_RELEASE_REREAD_HOLD'
  | 'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED';

class ExactDockerCustodyFailure extends Error {
  constructor(
    readonly reasonCode: ExactDockerCustodyFailureReasonCode,
    readonly afterAdmission: boolean,
  ) {
    super(reasonCode);
    this.name = 'ExactDockerCustodyFailure';
  }
}

interface ExactDockerCustodyLaunchContext {
  readonly taskId: string;
  readonly image: string;
  /** Contains no Store callback path. Mount args are appended only inside mountConsumer. */
  readonly dockerBaseArgs: readonly string[];
  readonly providerInvocationDigest: Sha256Digest;
  readonly releaseIntentToken: Uint8Array;
  readonly releaseIntentTokenSha256: Sha256Digest;
  readonly releaseCommitToken: Uint8Array;
  readonly releaseCommitTokenSha256: Sha256Digest;
  readonly providerStartToken: Uint8Array;
  readonly providerStartTokenSha256: Sha256Digest;
  readonly executionCommitToken: Uint8Array;
  readonly executionCommitTokenSha256: Sha256Digest;
  readonly expectedContainerName: string;
  readonly workspaceVolumeName: string;
  readonly dependencyVolumeName: string;
  readonly workspaceInventory: ExactDockerWorkspaceInventoryV1;
  readonly effect: ExactDockerEffectLaunchAuthorityV1;
  authorityLabelsDigest: Sha256Digest | null;
  spawnOutcome: Readonly<{
    containerId: string;
    imageDigest: Sha256Digest | null;
  }> | null;
}

type ExactDockerEffectPreparedV1 = Extract<
  Awaited<ReturnType<typeof prepareAllocatedExecutionEffectDockerWorkspaceV1>>,
  { state: 'PREPARED' }
>;
type ExactDockerEffectAuthorizedV1 = Extract<
  Awaited<ReturnType<typeof authorizeExecutionEffectDockerProviderStartV1>>,
  { state: 'PROVIDER_START_AUTHORIZED' }
>;
type ExactDockerEffectReadyV1 = Extract<
  Awaited<ReturnType<typeof captureExecutionEffectDockerFinalV1>>,
  { state: 'READY_FOR_LANDING' }
>;
type ExactDockerEffectReadyAuthorityV1 = Omit<
  ExactDockerEffectReadyV1,
  'session'
> & Readonly<{
  readonly session: ExactDockerEffectReadyV1['session'] | null;
}>;
type ExactDockerEffectPreparedAuthorityV1 = Omit<
  ExactDockerEffectPreparedV1,
  'session'
> & Readonly<{
  readonly session: ExactDockerEffectPreparedV1['session'] | null;
}>;

interface ExactDockerEffectLaunchAuthorityV1 {
  readonly imageAuthority: ExactDockerEffectImageAuthorityV1;
  readonly captureLimits: ExecutionEffectCaptureLimits;
  readonly lifecycleAdapter: ExecutionEffectDockerLifecycleAdapterV1;
  readonly prepared: ExactDockerEffectPreparedAuthorityV1;
  readonly preparedWorkspace: ExecutionEffectStorePreparedWorkspaceAuthorityV1;
  readonly storeAdapter: ExecutionEffectStoreAdapterV1;
  readonly stagingRoot: string;
  readonly clock: ExecutionEffectNativeAdapterClockV1;
  readonly limits: ExecutionEffectNativeAdapterLimitsV1;
  readonly landingCapabilityDigest: Sha256Digest;
  authorized: ExactDockerEffectAuthorizedV1 | null;
  ready: ExactDockerEffectReadyAuthorityV1 | null;
}

interface ExactDockerCommittedEffectLandingV1 {
  readonly captured: ExactDockerEffectReadyAuthorityV1;
  readonly receipt: ExecutionEffectLandingReceiptV1;
  readonly terminalSeal: ExecutionEffectLandingTerminalSealV1;
  readonly storeAdapter: ExecutionEffectStoreAdapterV1;
  readonly containerIdentityDigest: Sha256Digest;
}

interface ExactDockerDispatchSnapshotV2 {
  readonly schemaVersion: typeof TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION;
  readonly kind: 'exact-docker-dispatch-snapshot';
  readonly dispatchRequestId: string;
  readonly projectId: string;
  readonly taskId: string;
  readonly material: Readonly<{
    readonly approved: unknown;
    readonly approvedSha256: Sha256Digest;
    readonly dispatch: Task;
    readonly dispatchSha256: Sha256Digest;
    readonly lineage: unknown;
    readonly lineageSha256: Sha256Digest;
  }>;
  readonly dispatch: Readonly<{
    readonly model: ModelType;
    readonly provider: ProviderName;
    readonly execution: PrepareExactDockerCustodyInputV2['execution'];
    readonly prompt: string;
    readonly promptSha256: Sha256Digest;
    readonly promptDeliveryAuthority: ExactDockerPromptDeliveryAuthorityV2;
    readonly systemPromptCore: string | null;
    readonly systemPromptCoreSha256: Sha256Digest | null;
    readonly scopeBaseline: string;
    readonly scopeBaselineSha256: Sha256Digest;
    readonly runnerSource: string;
    readonly runnerSourceSha256: Sha256Digest;
    readonly providerInvocationDigest: Sha256Digest;
    readonly releaseIntentNonceSha256: Sha256Digest;
    readonly releaseCommitNonceSha256: Sha256Digest;
    readonly providerStartNonceSha256: Sha256Digest;
    readonly executionCommitNonceSha256: Sha256Digest;
  }>;
}

function exactDockerBasePromptFromDispatchedPrompt(
  dispatchedPrompt: string,
  executionLandingPolicy: unknown,
  taskId: string,
  dispatchRequestId: string,
): string | null {
  if (executionLandingPolicy === null) return dispatchedPrompt;
  const suffix = `\n\n${buildExactExecutionLandingProposalPromptSegment(
    taskId,
    dispatchRequestId,
  )}`;
  return dispatchedPrompt.endsWith(suffix)
    ? dispatchedPrompt.slice(0, -suffix.length)
    : null;
}

function parseExactDockerDispatchSnapshot(
  bytes: Uint8Array,
): ExactDockerDispatchSnapshotV2 | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
  } catch {
    return null;
  }
  const snapshot = snapshotExactPlainData(decoded);
  if (!snapshot.ok) return null;
  const root = exactOwnDataRecord(snapshot.value, [
    'schemaVersion', 'kind', 'dispatchRequestId', 'projectId', 'taskId', 'material', 'dispatch',
  ]);
  const material = exactOwnDataRecord(root?.material, [
    'approved', 'approvedSha256', 'dispatch', 'dispatchSha256', 'lineage', 'lineageSha256',
  ]);
  const dispatch = exactOwnDataRecord(root?.dispatch, [
    'model', 'provider', 'execution', 'prompt', 'promptSha256',
    'promptDeliveryAuthority',
    'systemPromptCore', 'systemPromptCoreSha256', 'scopeBaseline', 'scopeBaselineSha256',
    'runnerSource', 'runnerSourceSha256', 'providerInvocationDigest',
    'releaseIntentNonceSha256', 'releaseCommitNonceSha256', 'providerStartNonceSha256',
    'executionCommitNonceSha256',
  ]);
  const execution = exactOwnDataRecord(dispatch?.execution, [
    'allowedTools', 'availableTools', 'authMode', 'isolatedContext',
    'reasoningEffort', 'excludeDynamicPromptSections', 'taskTimeoutSeconds',
    'actionId', 'executionBudget', 'executionLandingPolicy',
    'executionAdmissionMode', 'executionApprovalEvidenceRef', 'finalOnlyUsageContainment',
  ]);
  const task = material?.dispatch as Task | undefined;
  const basePrompt = root && dispatch && execution
    && typeof dispatch.prompt === 'string'
    && typeof root.taskId === 'string'
    && typeof root.dispatchRequestId === 'string'
    ? exactDockerBasePromptFromDispatchedPrompt(
        dispatch.prompt,
        execution.executionLandingPolicy,
        root.taskId,
        root.dispatchRequestId,
      )
    : null;
  if (!root || !material || !dispatch || !execution || !task
    || root.schemaVersion !== TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION
    || root.kind !== 'exact-docker-dispatch-snapshot'
    || typeof root.dispatchRequestId !== 'string'
    || typeof root.projectId !== 'string'
    || typeof root.taskId !== 'string'
    || !isExactDigest(material.approvedSha256)
    || !isExactDigest(material.dispatchSha256)
    || !isExactDigest(material.lineageSha256)
    || exactCustodyJsonDigest(material.approved) !== material.approvedSha256
    || exactCustodyJsonDigest(task) !== material.dispatchSha256
    || exactCustodyJsonDigest(material.lineage) !== material.lineageSha256
    || !hasOnlyExactOwnKeys(task, EXACT_DOCKER_TASK_KEYS)
    || !hasExactAcceptedAuthorityTaskFields(task)
    || task.id !== root.taskId
    || !hasOnlyExactOwnKeys(task.scope, ['directories', 'filesRead', 'filesWrite'])
    || !Array.isArray(task.scope.directories)
    || !Array.isArray(task.scope.filesRead)
    || !Array.isArray(task.scope.filesWrite)
    || ![...task.scope.directories, ...task.scope.filesRead, ...task.scope.filesWrite]
      .every(entry => typeof entry === 'string')
    || !hasOnlyExactOwnKeys(task.goNogo, [
      'goCriteria', 'noGoCriteria', 'techDebtAcceptable', 'items',
    ])
    || typeof dispatch.model !== 'string'
    || typeof dispatch.provider !== 'string'
    || typeof dispatch.prompt !== 'string'
    || !isExactDigest(dispatch.promptSha256)
    || exactCustodyDigest(dispatch.prompt) !== dispatch.promptSha256
    || basePrompt === null
    || !parseExactDockerPromptDeliveryAuthority(
      dispatch.promptDeliveryAuthority,
      basePrompt,
      task,
    )
    || (dispatch.systemPromptCore !== null && typeof dispatch.systemPromptCore !== 'string')
    || (dispatch.systemPromptCore === null
      ? dispatch.systemPromptCoreSha256 !== null
      : !isExactDigest(dispatch.systemPromptCoreSha256)
        || exactCustodyDigest(dispatch.systemPromptCore) !== dispatch.systemPromptCoreSha256)
    || typeof dispatch.scopeBaseline !== 'string'
    || !isExactDigest(dispatch.scopeBaselineSha256)
    || exactCustodyDigest(dispatch.scopeBaseline) !== dispatch.scopeBaselineSha256
    || typeof dispatch.runnerSource !== 'string'
    || !isExactDigest(dispatch.runnerSourceSha256)
    || exactCustodyDigest(dispatch.runnerSource) !== dispatch.runnerSourceSha256
    || !isExactDigest(dispatch.providerInvocationDigest)
    || !isExactDigest(dispatch.releaseIntentNonceSha256)
    || !isExactDigest(dispatch.releaseCommitNonceSha256)
    || !isExactDigest(dispatch.providerStartNonceSha256)
    || !isExactDigest(dispatch.executionCommitNonceSha256)
    || (execution.allowedTools !== null && typeof execution.allowedTools !== 'string')
    || (execution.availableTools !== null && typeof execution.availableTools !== 'string')
    || !['api', 'subscription'].includes(String(execution.authMode))
    || typeof execution.isolatedContext !== 'boolean'
    || (execution.reasoningEffort !== null && typeof execution.reasoningEffort !== 'string')
    || typeof execution.excludeDynamicPromptSections !== 'boolean'
    || !Number.isSafeInteger(execution.taskTimeoutSeconds)
    || (execution.taskTimeoutSeconds as number) <= 0) return null;
  return snapshot.value as ExactDockerDispatchSnapshotV2;
}

interface PreparedExactDockerCustodyScope {
  readonly store: TaskAttemptCustodyStore;
  readonly policy: TaskAttemptCustodyPolicyV2;
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admission: TaskAttemptCustodyAdmissionV2;
  readonly admissionRef: TaskAttemptCustodyDispatchAdmissionRefV2;
  readonly access: TaskAttemptCustodyAttemptAccess;
  readonly taskSnapshot: ExactDockerDispatchSnapshotV2;
  readonly model: ModelType;
  readonly provider: ProviderName;
  readonly providerSpec: ProviderCommandSpec | null;
  readonly providerAuth: ProviderAuthIsolation | null;
  readonly execution: PrepareExactDockerCustodyInputV2['execution'];
  state: ExactDockerCustodyState;
  launch: ExactDockerCustodyLaunchContext | null;
  mountTransferReceipt: TaskAttemptCustodyBackendMountTransferReceipt | null;
}

type ExactDockerDurableAdmissionV2 = Extract<
  ReturnType<TaskAttemptCustodyStore['readDispatchAdmission']>,
  { readonly state: 'admitted' }
>;

function exactDockerCustodyArtifactLimits(): Record<
  TaskAttemptCustodyArtifactClass,
  TaskAttemptCustodyArtifactLimit
> {
  const mib = 1024 * 1024;
  const maxBytes: Record<TaskAttemptCustodyArtifactClass, number> = {
    'task-admission-snapshot': 8 * mib,
    'worker-result': 16 * mib,
    'worker-partial-result': 16 * mib,
    'worker-landing-proposal': 4 * mib,
    'worker-provider-observation': 4 * mib,
    'worker-timeout': mib,
    'worker-log': 256 * mib,
    'worker-ipc-question': 2 * mib,
    'worker-ipc-answer': 2 * mib,
    'pristine-provider-stream': 256 * mib,
    'host-work-attribution': 4 * mib,
    'execution-workspace-snapshot': 64 * mib,
    'execution-effect-lifecycle-authority': 64 * mib,
    'execution-effect-manifest': 256 * mib,
    'execution-effect-staged-content': 64 * mib,
    'execution-effect-landing-journal': 64 * mib,
    'execution-effect-landing-receipt-evidence': 8 * mib,
    'execution-effect-landing-receipt': 8 * mib,
    'execution-workspace-release': 8 * mib,
    'canonical-accepted-result': 16 * mib,
    'evaluation-receipt': 8 * mib,
    'finalizer-receipt': 8 * mib,
    'settlement-receipt': 8 * mib,
    'archive-receipt': 8 * mib,
  };
  return Object.fromEntries(TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES.map(artifactClass => [
    artifactClass,
    Object.freeze({
      minBytes: artifactClass === 'pristine-provider-stream'
        || artifactClass === 'execution-effect-staged-content'
        ? 0
        : 1,
      maxBytes: maxBytes[artifactClass],
      requireSingleLink: true as const,
    }),
  ])) as Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>;
}

/** T5-owned policy. Producers never duplicate or serialize it. */
export function createExactDockerCustodyPolicy(): TaskAttemptCustodyPolicyV2 {
  return createTaskAttemptCustodyPolicy({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    metadataMaxBytes: EXACT_DOCKER_CUSTODY_METADATA_MAX_BYTES,
    jsonBounds: {
      maxDepth: 64,
      maxNodes: 100_000,
      maxStringBytes: 8 * 1024 * 1024,
      maxArrayLength: 25_000,
      maxObjectKeys: 4_096,
      maxCanonicalBytes: 16 * 1024 * 1024,
    },
    artifactLimits: exactDockerCustodyArtifactLimits(),
  });
}

function canonicalExactDockerProjectRoot(projectRoot: string): string {
  try { return realpathSync.native(projectRoot); } catch { return resolve(projectRoot); }
}

function exactCustodyDigest(value: string | Uint8Array): Sha256Digest {
  return `sha256:${createHash('sha256').update(value).digest('hex')}` as Sha256Digest;
}

function exactCustodyJsonDigest(value: unknown): Sha256Digest {
  return exactCustodyDigest(canonicalJson(value));
}

function exactEffectDomainDigest(domain: string, value: unknown): ExecutionEffectPersistenceDigest {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function isExactDigest(value: unknown): value is Sha256Digest {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function exactOwnDataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || nodeTypes.isProxy(value)) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) {
    return null;
  }
  const record = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
    record[key] = descriptor.value;
  }
  return record;
}

type ExactPlainDataSnapshot =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false };

/**
 * Copy an untrusted graph without invoking accessors or Proxy traps. The copy
 * is the only caller-owned material allowed to reach hashing, Store admission,
 * provider routing, or a retained dispatch scope.
 */
function snapshotExactPlainData(value: unknown): ExactPlainDataSnapshot {
  const maxBytes = 16 * 1024 * 1024;
  const maxStringBytes = 8 * 1024 * 1024;
  const maxNodes = 100_000;
  const maxArrayLength = 25_000;
  const maxObjectKeys = 4_096;
  let byteBudget = maxBytes;
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): ExactPlainDataSnapshot => {
    nodes += 1;
    if (depth > 64 || nodes > maxNodes) return { ok: false };
    if (candidate === null || typeof candidate === 'boolean') {
      byteBudget -= candidate === null ? 4 : candidate ? 4 : 5;
      return byteBudget >= 0 ? { ok: true, value: candidate } : { ok: false };
    }
    if (typeof candidate === 'string') {
      const stringBytes = Buffer.byteLength(candidate, 'utf8');
      if (stringBytes > maxStringBytes) return { ok: false };
      byteBudget -= stringBytes + 2;
      return byteBudget >= 0 ? { ok: true, value: candidate } : { ok: false };
    }
    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) return { ok: false };
      byteBudget -= 24;
      return byteBudget >= 0 ? { ok: true, value: candidate } : { ok: false };
    }
    if (!candidate || typeof candidate !== 'object' || nodeTypes.isProxy(candidate)) {
      return { ok: false };
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > maxArrayLength) return { ok: false };
      const own = Reflect.ownKeys(candidate);
      if (own.length !== candidate.length + 1
        || own.some(key => typeof key === 'symbol'
          || (key !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(key)))) return { ok: false };
      const result: unknown[] = [];
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return { ok: false };
        const item = visit(descriptor.value, depth + 1);
        if (!item.ok) return item;
        result.push(item.value);
      }
      return { ok: true, value: Object.freeze(result) };
    }
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) return { ok: false };
    const own = Reflect.ownKeys(candidate);
    if (own.length > maxObjectKeys || own.some(key => typeof key !== 'string')) return { ok: false };
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of own as string[]) {
      byteBudget -= Buffer.byteLength(key, 'utf8') + 2;
      if (byteBudget < 0) return { ok: false };
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return { ok: false };
      const item = visit(descriptor.value, depth + 1);
      if (!item.ok) return item;
      result[key] = item.value;
    }
    return { ok: true, value: Object.freeze(result) };
  };
  return visit(value, 0);
}

function hasOnlyExactOwnKeys(value: unknown, allowed: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || nodeTypes.isProxy(value)) return false;
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key));
}

const EXACT_DOCKER_TASK_KEYS = Object.freeze([
  'id', 'title', 'description', 'model', 'effort', 'priority', 'reason', 'scope',
  'dependencies', 'goNogo', 'verification', 'promptCompilePlanId', 'status', 'type',
  'sprintId', 'assignedWorker', 'isPriorityFix', 'fixForTaskId', 'provider', 'forceModel',
  'forceEffort', 'forceAgent', 'forceSkills', 'excludeAgent', 'excludeSkills', 'authMode',
  'backend', 'modelEffort', 'fixMode', 'smoke', 'assignedAgent', 'assignedSkills',
  'estimatedTokens', 'routingMeta', 'actor', 'budget', 'budgetPolicy', 'productionWiring',
  'runPolicy', 'promptCostCanary', 'postSettlementProjection', 'createdAt', 'updatedAt',
] as const);

/**
 * Produce the one strict task projection accepted by exact Docker custody.
 * Unknown fields, accessors, proxies and undefined-valued own properties are
 * rejected/omitted before hashing so scheduler and backend cannot maintain two
 * independent task schemas.
 */
export function createExactDockerDispatchTaskMaterial(
  task: Task,
  assignedWorker: string,
): Task {
  if (typeof assignedWorker !== 'string' || assignedWorker.trim().length === 0) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  if (!task || typeof task !== 'object' || nodeTypes.isProxy(task)) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  const projection = Object.create(null) as Record<string, unknown>;
  for (const key of EXACT_DOCKER_TASK_KEYS) {
    if (key === 'assignedWorker') continue;
    const descriptor = Object.getOwnPropertyDescriptor(task, key);
    if (!descriptor) continue;
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
    }
    if (descriptor.value !== undefined) projection[key] = descriptor.value;
  }
  projection.assignedWorker = assignedWorker;
  const snapshot = snapshotExactPlainData(projection);
  if (!snapshot.ok) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  const material = snapshot.value as Task;
  if (!hasOnlyExactOwnKeys(material, EXACT_DOCKER_TASK_KEYS)
    || !hasExactAcceptedAuthorityTaskFields(material)
    || !material.scope
    || !hasOnlyExactOwnKeys(material.scope, ['directories', 'filesRead', 'filesWrite'])
    || !material.goNogo
    || !hasOnlyExactOwnKeys(material.goNogo, [
      'goCriteria', 'noGoCriteria', 'techDebtAcceptable', 'items',
    ])) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  return material;
}

/** Path-free canonical digest used by the producer's exact prepare envelope. */
export function exactDockerCustodyMaterialDigest(value: unknown): Sha256Digest {
  const snapshot = snapshotExactPlainData(value);
  if (!snapshot.ok) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  return exactCustodyJsonDigest(snapshot.value);
}

function hasExactAcceptedAuthorityTaskFields(task: Task): boolean {
  const verification = task.verification;
  return typeof task.assignedWorker === 'string'
    && task.assignedWorker.trim().length > 0
    && (task.sprintId === undefined || typeof task.sprintId === 'string')
    && (task.promptCompilePlanId === undefined || typeof task.promptCompilePlanId === 'string')
    && (task.isPriorityFix === undefined || typeof task.isPriorityFix === 'boolean')
    && (task.fixForTaskId === undefined || task.fixForTaskId === null
      || typeof task.fixForTaskId === 'string')
    && (verification === undefined
      || (Boolean(exactOwnDataRecord(verification, ['version', 'source', 'commands']))
        && verification.version === 1
        && ['directive', 'planner', 'legacy-ingress'].includes(verification.source)
        && Array.isArray(verification.commands)
        && verification.commands.length <= 512
        && verification.commands.every(command => typeof command === 'string'
          && Buffer.byteLength(command, 'utf8') <= 16 * 1024)));
}

function canonicalExactIds(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

export interface CreateExactDockerPromptDeliveryAuthorityInputV2 {
  readonly taskId: string;
  readonly prompt: string;
  readonly promptCompilePlanId: string;
  readonly rolePolicyIdentity: string;
  readonly assignedAgentId?: string;
  readonly assignedSkillIds?: readonly string[];
  readonly forcedSkillIds?: readonly string[];
  /** Ordered exactly as delivered. Cache tier order is descriptive, not monotonic. */
  readonly segments: readonly Readonly<{
    readonly tier: 'T0' | 'T1' | 'T2';
    readonly kind: string;
    readonly content: string;
  }>[];
}

function exactPromptDeliveryReceiptIdentity(
  receiptMaterial: unknown,
): `prompt-delivery-receipt:sha256:${string}` {
  return `prompt-delivery-receipt:${exactCustodyJsonDigest(receiptMaterial)}`;
}

function exactRenderedPromptDelivery(
  segments: readonly Readonly<{ readonly kind: string; readonly content: string }>[],
): Readonly<{
  deliveredAgentId: string | null;
  personaSegmentSha256: Sha256Digest | null;
  deliveredSkillIds: readonly string[];
}> | null {
  const personaSegments = segments.filter(segment => segment.kind === 'persona');
  let deliveredAgentId: string | null = null;
  let personaSegmentSha256: Sha256Digest | null = null;
  if (personaSegments.length === 1) {
    const persona = personaSegments[0]!;
    const match = /^=== Agent: ([^=\n]+) ===(?:\n|$)/u.exec(persona.content);
    if (!match || match[1]!.trim().length === 0
      || Buffer.byteLength(match[1]!.trim(), 'utf8') > 256) return null;
    deliveredAgentId = match[1]!.trim();
    personaSegmentSha256 = exactCustodyDigest(persona.content);
  } else if (personaSegments.length > 1) return null;
  const deliveredSkillIds: string[] = [];
  for (const segment of segments.filter(item => item.kind === 'skills')) {
    for (const match of segment.content.matchAll(/^--- ([a-z0-9][a-z0-9-]*) ---$/gmu)) {
      deliveredSkillIds.push(match[1]!);
    }
  }
  return Object.freeze({
    deliveredAgentId,
    personaSegmentSha256,
    deliveredSkillIds: Object.freeze(canonicalExactIds(deliveredSkillIds)),
  });
}

/**
 * Build the path-free prompt authority from the final ordered prompt segments.
 * No task assignment claim can substitute for rendered persona/skill bytes.
 */
export function createExactDockerPromptDeliveryAuthority(
  input: CreateExactDockerPromptDeliveryAuthorityInputV2,
): ExactDockerPromptDeliveryAuthorityV2 {
  const snapshot = snapshotExactPlainData(input);
  const builderKeys = [
    'taskId', 'prompt', 'promptCompilePlanId', 'rolePolicyIdentity',
    'assignedAgentId', 'assignedSkillIds', 'forcedSkillIds', 'segments',
  ] as const;
  const record = snapshot.ok && hasOnlyExactOwnKeys(snapshot.value, builderKeys)
    ? snapshot.value as Record<string, unknown> : null;
  if (!record
    || typeof record.taskId !== 'string' || record.taskId.length === 0
    || typeof record.prompt !== 'string'
    || typeof record.promptCompilePlanId !== 'string'
    || !/^prompt-compile-plan:sha256:[a-f0-9]{64}$/u.test(record.promptCompilePlanId)
    || typeof record.rolePolicyIdentity !== 'string'
    || Buffer.byteLength(record.rolePolicyIdentity, 'utf8') > 512
    || (record.assignedAgentId !== undefined
      && (typeof record.assignedAgentId !== 'string' || record.assignedAgentId.length === 0
        || Buffer.byteLength(record.assignedAgentId, 'utf8') > 256))
    || (record.assignedSkillIds !== undefined && !Array.isArray(record.assignedSkillIds))
    || (record.forcedSkillIds !== undefined && !Array.isArray(record.forcedSkillIds))
    || !Array.isArray(record.segments)
    || record.segments.length === 0 || record.segments.length > 4_096) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  const assignedSkillIds = canonicalExactIds(
    (record.assignedSkillIds as string[] | undefined) ?? [],
  );
  const forcedSkillIds = canonicalExactIds(
    (record.forcedSkillIds as string[] | undefined) ?? [],
  );
  if ([assignedSkillIds, forcedSkillIds].some(values => values.length > 512
    || values.some(id => typeof id !== 'string' || id.length === 0
      || Buffer.byteLength(id, 'utf8') > 256))) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  const segments: Array<Readonly<{
    tier: 'T0' | 'T1' | 'T2'; kind: string; content: string;
  }>> = [];
  const segmentManifest: Array<Readonly<{
    ordinal: number; tier: 'T0' | 'T1' | 'T2'; kind: string;
    contentSha256: Sha256Digest; byteLength: number;
  }>> = [];
  for (let index = 0; index < record.segments.length; index += 1) {
    const segment = exactOwnDataRecord(record.segments[index], ['tier', 'kind', 'content']);
    if (!segment || !['T0', 'T1', 'T2'].includes(String(segment.tier))
      || typeof segment.kind !== 'string' || segment.kind.length === 0
      || Buffer.byteLength(segment.kind, 'utf8') > 256
      || typeof segment.content !== 'string') {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
    }
    const typed = Object.freeze({
      tier: segment.tier as 'T0' | 'T1' | 'T2',
      kind: segment.kind,
      content: segment.content,
    });
    segments.push(typed);
    segmentManifest.push(Object.freeze({
      ordinal: index,
      tier: typed.tier,
      kind: typed.kind,
      contentSha256: exactCustodyDigest(typed.content),
      byteLength: Buffer.byteLength(typed.content, 'utf8'),
    }));
  }
  if (segments.map(segment => segment.content).join('\n\n') !== record.prompt) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  const rendered = exactRenderedPromptDelivery(segments);
  if (!rendered) throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  const assignedAgentId = (record.assignedAgentId as string | undefined) ?? null;
  if (record.rolePolicyIdentity !== `worker:${assignedAgentId ?? 'generic'}`) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
  }
  const undeliveredForcedSkillIds = forcedSkillIds.filter(
    id => !rendered.deliveredSkillIds.includes(id),
  );
  if (undeliveredForcedSkillIds.length > 0) {
    throw new ExactDockerCustodyFailure(
      'EXACT_DOCKER_PROMPT_DELIVERY_AUTHORITY_HOLD', false,
    );
  }
  const receiptMaterial = Object.freeze({
    schemaVersion: 2 as const,
    kind: 'exact-docker-prompt-delivery-authority' as const,
    receiptVersion: 2 as const,
    taskId: record.taskId,
    basePromptSha256: exactCustodyDigest(record.prompt as string),
    promptCompilePlanId: record.promptCompilePlanId,
    rolePolicyIdentity: record.rolePolicyIdentity,
    assignedAgentId,
    deliveredAgentId: rendered.deliveredAgentId,
    personaSegmentSha256: rendered.personaSegmentSha256,
    assignedSkillIds: Object.freeze(assignedSkillIds),
    deliveredSkillIds: rendered.deliveredSkillIds,
    forcedSkillIds: Object.freeze(forcedSkillIds),
    undeliveredForcedSkillIds: Object.freeze([]) as readonly string[],
    segmentManifest: Object.freeze(segmentManifest),
    segmentManifestDigest: exactCustodyJsonDigest(segmentManifest),
  });
  const receiptIdentity = exactPromptDeliveryReceiptIdentity(receiptMaterial);
  const body = Object.freeze({ ...receiptMaterial, receiptIdentity });
  return Object.freeze({ ...body, authorityDigest: exactCustodyJsonDigest(body) });
}

function parseExactDockerPromptDeliveryAuthority(
  value: unknown,
  basePrompt: string,
  task: Task,
): ExactDockerPromptDeliveryAuthorityV2 | null {
  if (!task || typeof task !== 'object' || nodeTypes.isProxy(task)) return null;
  const record = exactOwnDataRecord(value, [
    'schemaVersion', 'kind', 'receiptVersion', 'receiptIdentity', 'taskId', 'basePromptSha256',
    'promptCompilePlanId', 'rolePolicyIdentity', 'assignedAgentId', 'deliveredAgentId',
    'personaSegmentSha256', 'assignedSkillIds', 'deliveredSkillIds', 'forcedSkillIds',
    'undeliveredForcedSkillIds', 'segmentManifest', 'segmentManifestDigest',
    'authorityDigest',
  ]);
  if (!record || record.schemaVersion !== 2
    || record.kind !== 'exact-docker-prompt-delivery-authority'
    || record.receiptVersion !== 2
    || typeof record.receiptIdentity !== 'string'
    || !/^prompt-delivery-receipt:sha256:[a-f0-9]{64}$/u.test(record.receiptIdentity)
    || record.taskId !== task.id
    || !isExactDigest(record.basePromptSha256)
    || record.basePromptSha256 !== exactCustodyDigest(basePrompt)
    || typeof record.promptCompilePlanId !== 'string'
    || record.promptCompilePlanId !== task.promptCompilePlanId
    || !/^prompt-compile-plan:sha256:[a-f0-9]{64}$/u.test(record.promptCompilePlanId)
    || typeof record.rolePolicyIdentity !== 'string'
    || Buffer.byteLength(record.rolePolicyIdentity, 'utf8') > 512
    || (record.assignedAgentId !== null
      && (typeof record.assignedAgentId !== 'string' || record.assignedAgentId.length === 0
        || Buffer.byteLength(record.assignedAgentId, 'utf8') > 256))
    || (record.deliveredAgentId !== null
      && (typeof record.deliveredAgentId !== 'string' || record.deliveredAgentId.length === 0
        || Buffer.byteLength(record.deliveredAgentId, 'utf8') > 256))
    || (record.personaSegmentSha256 !== null && !isExactDigest(record.personaSegmentSha256))
    || !Array.isArray(record.assignedSkillIds)
    || !Array.isArray(record.deliveredSkillIds)
    || !Array.isArray(record.forcedSkillIds)
    || !Array.isArray(record.undeliveredForcedSkillIds)
    || !Array.isArray(record.segmentManifest)
    || record.segmentManifest.length === 0 || record.segmentManifest.length > 4_096
    || !isExactDigest(record.segmentManifestDigest)
    || !isExactDigest(record.authorityDigest)) return null;
  const idArrays = [
    record.assignedSkillIds,
    record.deliveredSkillIds,
    record.forcedSkillIds,
    record.undeliveredForcedSkillIds,
  ] as unknown[][];
  if (idArrays.some(values => values.length > 512
    || values.some(id => typeof id !== 'string' || id.length === 0
      || Buffer.byteLength(id, 'utf8') > 256)
    || canonicalJson(values) !== canonicalJson(canonicalExactIds(values as string[])))) return null;
  const manifest: Array<{
    ordinal: number;
    tier: 'T0' | 'T1' | 'T2';
    kind: string;
    contentSha256: Sha256Digest;
    byteLength: number;
  }> = [];
  for (let index = 0; index < record.segmentManifest.length; index += 1) {
    const entry = exactOwnDataRecord(record.segmentManifest[index], [
      'ordinal', 'tier', 'kind', 'contentSha256', 'byteLength',
    ]);
    if (!entry || entry.ordinal !== index
      || !['T0', 'T1', 'T2'].includes(String(entry.tier))
      || typeof entry.kind !== 'string' || entry.kind.length === 0
      || Buffer.byteLength(entry.kind, 'utf8') > 256
      || !isExactDigest(entry.contentSha256)
      || !Number.isSafeInteger(entry.byteLength) || Number(entry.byteLength) < 0) return null;
    manifest.push({
      ordinal: index,
      tier: entry.tier as 'T0' | 'T1' | 'T2',
      kind: entry.kind,
      contentSha256: entry.contentSha256,
      byteLength: Number(entry.byteLength),
    });
  }
  if (exactCustodyJsonDigest(manifest) !== record.segmentManifestDigest) return null;
  const promptBytes = Buffer.from(basePrompt, 'utf8');
  const renderedSegments: Array<{ kind: string; content: string; digest: Sha256Digest }> = [];
  let cursor = 0;
  for (let index = 0; index < manifest.length; index += 1) {
    const entry = manifest[index]!;
    const end = cursor + entry.byteLength;
    if (end > promptBytes.byteLength) return null;
    const bytes = promptBytes.subarray(cursor, end);
    const content = bytes.toString('utf8');
    if (!Buffer.from(content, 'utf8').equals(bytes)
      || exactCustodyDigest(bytes) !== entry.contentSha256) return null;
    renderedSegments.push({ kind: entry.kind, content, digest: entry.contentSha256 });
    cursor = end;
    if (index < manifest.length - 1) {
      if (promptBytes[cursor] !== 0x0a || promptBytes[cursor + 1] !== 0x0a) return null;
      cursor += 2;
    }
  }
  if (cursor !== promptBytes.byteLength) return null;
  const rendered = exactRenderedPromptDelivery(renderedSegments);
  if (!rendered) return null;
  if ((task.assignedAgent !== undefined && typeof task.assignedAgent !== 'string')
    || (task.assignedSkills !== undefined
      && (!Array.isArray(task.assignedSkills)
        || task.assignedSkills.some(id => typeof id !== 'string')))
    || (task.forceSkills !== undefined
      && (!Array.isArray(task.forceSkills)
        || task.forceSkills.some(id => typeof id !== 'string')))) return null;
  const assignedSkillIds = canonicalExactIds((task.assignedSkills ?? []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  ));
  const forcedSkillIds = canonicalExactIds((task.forceSkills ?? []).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  ));
  const assignedAgentId = task.assignedAgent ?? null;
  if (record.assignedAgentId !== assignedAgentId
    || record.deliveredAgentId !== rendered.deliveredAgentId
    || record.personaSegmentSha256 !== rendered.personaSegmentSha256
    || record.rolePolicyIdentity !== `worker:${assignedAgentId ?? 'generic'}`
    || canonicalJson(record.assignedSkillIds) !== canonicalJson(assignedSkillIds)
    || canonicalJson(record.deliveredSkillIds) !== canonicalJson(rendered.deliveredSkillIds)
    || canonicalJson(record.forcedSkillIds) !== canonicalJson(forcedSkillIds)
    || canonicalJson(record.undeliveredForcedSkillIds)
      !== canonicalJson(forcedSkillIds.filter(id => !rendered.deliveredSkillIds.includes(id)))
    || (record.undeliveredForcedSkillIds as unknown[]).length !== 0) return null;
  const {
    authorityDigest: _authorityDigest,
    receiptIdentity: _receiptIdentity,
    ...receiptMaterial
  } = record;
  if (exactPromptDeliveryReceiptIdentity(receiptMaterial) !== record.receiptIdentity) return null;
  const body = { ...receiptMaterial, receiptIdentity: record.receiptIdentity };
  if (exactCustodyJsonDigest(body) !== record.authorityDigest) return null;
  return value as ExactDockerPromptDeliveryAuthorityV2;
}

/** Strict, getter-free snapshot used by the prepare ingress and adversarial callers. */
export function parseExactDockerCustodyPrepareInput(
  value: unknown,
): PrepareExactDockerCustodyInputV2 | null {
  const snapshot = snapshotExactPlainData(value);
  if (!snapshot.ok) return null;
  const record = exactOwnDataRecord(snapshot.value, [
    'dispatchRequestId', 'projectId', 'taskId',
    'approvedTaskMaterial', 'approvedTaskMaterialDigest',
    'dispatchTaskMaterial', 'dispatchTaskMaterialDigest',
    'lineageMaterial', 'lineageMaterialDigest',
    'prompt', 'promptDeliveryAuthority', 'systemPromptCore', 'model', 'execution', 'predecessor',
  ]);
  const execution = exactOwnDataRecord(record?.execution, [
    'allowedTools', 'availableTools', 'authMode', 'isolatedContext',
    'reasoningEffort', 'excludeDynamicPromptSections', 'taskTimeoutSeconds',
    'actionId', 'executionBudget', 'executionLandingPolicy',
    'executionAdmissionMode', 'executionApprovalEvidenceRef',
    'finalOnlyUsageContainment',
  ]);
  const task = record?.dispatchTaskMaterial as Task | undefined;
  if (!record || !execution || !task
    || typeof record.dispatchRequestId !== 'string'
    || typeof record.projectId !== 'string'
    || typeof record.taskId !== 'string'
    || typeof record.prompt !== 'string'
    || (record.systemPromptCore !== null && typeof record.systemPromptCore !== 'string')
    || typeof record.model !== 'string'
    || !isExactDigest(record.approvedTaskMaterialDigest)
    || !isExactDigest(record.dispatchTaskMaterialDigest)
    || !isExactDigest(record.lineageMaterialDigest)
    || exactCustodyJsonDigest(record.approvedTaskMaterial) !== record.approvedTaskMaterialDigest
    || exactCustodyJsonDigest(task) !== record.dispatchTaskMaterialDigest
    || exactCustodyJsonDigest(record.lineageMaterial) !== record.lineageMaterialDigest
    || !hasOnlyExactOwnKeys(task, EXACT_DOCKER_TASK_KEYS)
    || !hasExactAcceptedAuthorityTaskFields(task)
    || !parseExactDockerPromptDeliveryAuthority(record.promptDeliveryAuthority, record.prompt, task)
    || task.id !== record.taskId
    || !hasOnlyExactOwnKeys(task.scope, ['directories', 'filesRead', 'filesWrite'])
    || !Array.isArray(task.scope.directories)
    || !Array.isArray(task.scope.filesRead)
    || !Array.isArray(task.scope.filesWrite)
    || ![...task.scope.directories, ...task.scope.filesRead, ...task.scope.filesWrite]
      .every(entry => typeof entry === 'string')
    || !hasOnlyExactOwnKeys(task.goNogo, [
      'goCriteria', 'noGoCriteria', 'techDebtAcceptable', 'items',
    ])
    || (execution.allowedTools !== null && typeof execution.allowedTools !== 'string')
    || (execution.availableTools !== null && typeof execution.availableTools !== 'string')
    || !['api', 'subscription'].includes(String(execution.authMode))
    || typeof execution.isolatedContext !== 'boolean'
    || (execution.reasoningEffort !== null && typeof execution.reasoningEffort !== 'string')
    || typeof execution.excludeDynamicPromptSections !== 'boolean'
    || !Number.isSafeInteger(execution.taskTimeoutSeconds)
    || (execution.taskTimeoutSeconds as number) <= 0
    || (execution.actionId !== null && typeof execution.actionId !== 'string')
    || (execution.executionBudget !== null
      && (!execution.executionBudget || typeof execution.executionBudget !== 'object'))
    || (execution.executionLandingPolicy !== null
      && !isExactDockerEffectLandingPolicyAdmitted(execution.executionLandingPolicy))
    || (execution.executionAdmissionMode !== null
      && typeof execution.executionAdmissionMode !== 'string')
    || (execution.executionApprovalEvidenceRef !== null
      && typeof execution.executionApprovalEvidenceRef !== 'string')
    || (execution.finalOnlyUsageContainment !== null
      && !exactOwnDataRecord(execution.finalOnlyUsageContainment, [
        'maxWallClockSeconds', 'profileRef', 'policyDigest',
      ]))) return null;
  return snapshot.value as PrepareExactDockerCustodyInputV2;
}

interface ExactDockerGateAckBundleV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-gate-ack';
  readonly admissionRefDigest: Sha256Digest;
  readonly containerId: string;
  readonly imageDigest: Sha256Digest;
  readonly mountTransferReceiptDigest: Sha256Digest;
  readonly mountTransferEvidenceDigest: Sha256Digest;
  readonly daemonAuthorityLabelDigest: Sha256Digest;
  readonly releaseIntentNonceSha256: Sha256Digest;
  readonly releaseCommitNonceSha256: Sha256Digest;
  readonly providerInvocationDigest: Sha256Digest;
  readonly pid1Sha256: Sha256Digest;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly nativeBootstrapEvidenceDigest: Sha256Digest;
  readonly preGateAckDigest: Sha256Digest;
  readonly releaseArmedAckDigest: Sha256Digest;
  readonly providerState: 'NOT_STARTED';
  readonly releaseState: 'ARMED';
  readonly preGateObservedAt: string;
  readonly releaseArmedAt: string;
  readonly observedAt: string;
}

interface ExactDockerNoEffectBundleV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-no-effect';
  readonly admissionRefDigest: Sha256Digest;
  readonly reasonCode: TaskAttemptCustodyNotDispatchedReasonCode;
  readonly containerName: string;
  readonly daemonContainerState: 'ABSENT';
  readonly providerReleaseState: 'ABSENT';
  readonly daemonInspectionReceiptDigest: Sha256Digest;
  readonly providerReleaseProbeEvidenceDigest: Sha256Digest;
  readonly backendProbeEvidenceDigest: Sha256Digest;
  readonly containmentEvidenceDigest: Sha256Digest;
  readonly preMountCompensation: Readonly<{
    readonly artifactKey: string;
    readonly artifactReceiptDigest: Sha256Digest;
    readonly evidenceDigest: Sha256Digest;
  }> | null;
  readonly observedAt: string;
}

interface ExactDockerEffectPreparationCompensationRefV1 {
  readonly artifactKey: string;
  readonly artifactReceiptDigest: Sha256Digest;
  readonly evidenceDigest: Sha256Digest;
}

interface ExactDockerReconciliationBundleV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-reconciliation';
  readonly admissionRefDigest: Sha256Digest;
  readonly reasonCode: TaskAttemptCustodyAmbiguousReasonCode;
  readonly containerState: 'ABSENT' | 'PRESENT' | 'UNKNOWN';
  readonly containerId: string | null;
  readonly imageDigest: Sha256Digest | null;
  readonly mountReceiptDigest: Sha256Digest | null;
  readonly releaseState: 'NOT_ATTEMPTED' | 'UNCONFIRMED' | 'ACKNOWLEDGED' | 'UNKNOWN';
  readonly releaseNonceDigest: Sha256Digest | null;
  readonly providerInvocationDigest: Sha256Digest | null;
  readonly containmentEvidenceDigest: Sha256Digest;
  readonly backendProbeEvidenceDigest: Sha256Digest;
  readonly observedAt: string;
}

interface ExactDockerProviderExitBundleV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-provider-exit';
  readonly admissionRefDigest: Sha256Digest;
  readonly containerId: string;
  readonly exitCode: number;
  readonly dockerWaitProcessExitCode: 0;
  readonly dockerWaitSignal: null;
  readonly stdoutSha256: Sha256Digest;
  readonly stderrSha256: Sha256Digest;
  readonly waitEvidenceDigest: Sha256Digest;
  readonly observedAt: string;
}

interface ExactDockerProviderStartBundleV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-provider-start';
  readonly admissionRefDigest: Sha256Digest;
  readonly containerId: string;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly providerInvocationDigest: Sha256Digest;
  readonly authorityLabelsDigest: Sha256Digest;
  readonly providerStartNonceSha256: Sha256Digest;
  readonly executionCommitNonceSha256: Sha256Digest;
  readonly providerExecutionAttemptId: string;
  readonly providerExecutionAttemptIdentityDigest: Sha256Digest;
  readonly dispatchReceiptDigest: Sha256Digest;
  readonly releaseReceiptRef: Sha256Digest;
  readonly releaseReceiptDigest: Sha256Digest;
  readonly projectionFence: Sha256Digest;
  readonly startAuthorizationDigest: Sha256Digest;
  readonly pid1StartAckDigest: Sha256Digest;
  readonly state: 'START_AUTHORIZATION_ACCEPTED';
  readonly providerState: 'NOT_STARTED';
  readonly observedAt: string;
}

interface ExactDockerProviderExecutionBundleV2
  extends ExactDockerProviderExecutionAckV2 {
  readonly containerId: string;
  readonly providerExecutionAckBytesSha256: Sha256Digest;
  readonly observedAt: string;
}

export interface ExactDockerProviderStartAckExpectationV2 {
  readonly admissionRefDigest: Sha256Digest;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly providerInvocationDigest: Sha256Digest;
  readonly authorityLabelsDigest: Sha256Digest;
  readonly providerStartNonceSha256: Sha256Digest;
  readonly executionCommitNonceSha256: Sha256Digest;
  readonly providerExecutionAttemptId: string;
  readonly providerExecutionAttemptIdentityDigest: Sha256Digest;
  readonly dispatchReceiptDigest: Sha256Digest;
  readonly releaseReceiptRef: Sha256Digest;
  readonly releaseReceiptDigest: Sha256Digest;
  readonly projectionFence: Sha256Digest;
  readonly startAuthorizationDigest: Sha256Digest;
}

export interface ExactDockerProviderStartAckV2
  extends ExactDockerProviderStartAckExpectationV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-pid1-provider-start-ack';
  readonly state: 'START_AUTHORIZATION_ACCEPTED';
  readonly providerState: 'NOT_STARTED';
}

export interface ExactDockerProviderExecutionAckExpectationV2 {
  readonly admissionRefDigest: Sha256Digest;
  readonly taskSnapshotSha256: Sha256Digest;
  readonly providerInvocationDigest: Sha256Digest;
  readonly authorityLabelsDigest: Sha256Digest;
  readonly executionCommitNonceSha256: Sha256Digest;
  readonly providerExecutionAttemptId: string;
  readonly providerExecutionAttemptIdentityDigest: Sha256Digest;
  readonly dispatchReceiptDigest: Sha256Digest;
  readonly releaseReceiptRef: Sha256Digest;
  readonly releaseReceiptDigest: Sha256Digest;
  readonly projectionFence: Sha256Digest;
  readonly startAuthorizationDigest: Sha256Digest;
  readonly providerStartAckBytesSha256: Sha256Digest;
}

export interface ExactDockerProviderExecutionAckV2
  extends ExactDockerProviderExecutionAckExpectationV2 {
  readonly schemaVersion: 2;
  readonly kind: 'exact-docker-pid1-provider-execution-ack';
  readonly childPid: number;
  readonly state: 'PROVIDER_PROCESS_SPAWNED';
  readonly providerState: 'STARTED';
}

/** Proves that PID1 crossed the actual child-process creation boundary. */
export function verifyExactDockerProviderExecutionAck(
  value: unknown,
  expected: ExactDockerProviderExecutionAckExpectationV2,
): value is ExactDockerProviderExecutionAckV2 {
  const record = exactOwnDataRecord(value, [
    'schemaVersion', 'kind', 'admissionRefDigest', 'taskSnapshotSha256',
    'providerInvocationDigest', 'authorityLabelsDigest', 'executionCommitNonceSha256',
    'providerExecutionAttemptId', 'providerExecutionAttemptIdentityDigest',
    'dispatchReceiptDigest', 'releaseReceiptRef', 'releaseReceiptDigest', 'projectionFence',
    'startAuthorizationDigest', 'providerStartAckBytesSha256', 'childPid',
    'state', 'providerState',
  ]);
  return Boolean(record
    && record.schemaVersion === 2
    && record.kind === 'exact-docker-pid1-provider-execution-ack'
    && record.admissionRefDigest === expected.admissionRefDigest
    && record.taskSnapshotSha256 === expected.taskSnapshotSha256
    && record.providerInvocationDigest === expected.providerInvocationDigest
    && record.authorityLabelsDigest === expected.authorityLabelsDigest
    && record.executionCommitNonceSha256 === expected.executionCommitNonceSha256
    && record.providerExecutionAttemptId === expected.providerExecutionAttemptId
    && record.providerExecutionAttemptIdentityDigest
      === expected.providerExecutionAttemptIdentityDigest
    && record.dispatchReceiptDigest === expected.dispatchReceiptDigest
    && record.releaseReceiptRef === expected.releaseReceiptRef
    && record.releaseReceiptDigest === expected.releaseReceiptDigest
    && record.projectionFence === expected.projectionFence
    && record.startAuthorizationDigest === expected.startAuthorizationDigest
    && record.providerStartAckBytesSha256 === expected.providerStartAckBytesSha256
    && Number.isSafeInteger(record.childPid) && Number(record.childPid) > 0
    && record.state === 'PROVIDER_PROCESS_SPAWNED'
    && record.providerState === 'STARTED');
}

/** Exact host-side acceptance gate for the trusted PID1 start acknowledgement. */
export function verifyExactDockerProviderStartAck(
  value: unknown,
  expected: ExactDockerProviderStartAckExpectationV2,
): value is ExactDockerProviderStartAckV2 {
  const record = exactOwnDataRecord(value, [
    'schemaVersion', 'kind', 'admissionRefDigest', 'taskSnapshotSha256',
    'providerInvocationDigest', 'authorityLabelsDigest',
    'providerStartNonceSha256', 'executionCommitNonceSha256',
    'providerExecutionAttemptId',
    'providerExecutionAttemptIdentityDigest', 'dispatchReceiptDigest',
    'releaseReceiptRef', 'releaseReceiptDigest', 'projectionFence',
    'startAuthorizationDigest', 'state', 'providerState',
  ]);
  return Boolean(record
    && record.schemaVersion === 2
    && record.kind === 'exact-docker-pid1-provider-start-ack'
    && record.admissionRefDigest === expected.admissionRefDigest
    && record.taskSnapshotSha256 === expected.taskSnapshotSha256
    && record.providerInvocationDigest === expected.providerInvocationDigest
    && record.authorityLabelsDigest === expected.authorityLabelsDigest
    && record.providerStartNonceSha256 === expected.providerStartNonceSha256
    && record.executionCommitNonceSha256 === expected.executionCommitNonceSha256
    && record.providerExecutionAttemptId === expected.providerExecutionAttemptId
    && record.providerExecutionAttemptIdentityDigest
      === expected.providerExecutionAttemptIdentityDigest
    && record.dispatchReceiptDigest === expected.dispatchReceiptDigest
    && record.releaseReceiptRef === expected.releaseReceiptRef
    && record.releaseReceiptDigest === expected.releaseReceiptDigest
    && record.projectionFence === expected.projectionFence
    && record.startAuthorizationDigest === expected.startAuthorizationDigest
    && record.state === 'START_AUTHORIZATION_ACCEPTED'
    && record.providerState === 'NOT_STARTED');
}

/** Strict one-shot raw commit check shared by the host evidence and PID1 contract tests. */
export function verifyExactDockerExecutionCommit(
  value: unknown,
  expectedDigest: Sha256Digest,
): value is Uint8Array {
  return value instanceof Uint8Array
    && value.byteLength > 0
    && value.byteLength <= 256
    && exactCustodyDigest(value) === expectedDigest;
}

function strictRoundTrip<T>(value: T): { readonly bytes: Uint8Array; readonly value: T } {
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  const parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as T;
  if (canonicalJson(parsed) !== canonicalJson(value)) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  return Object.freeze({ bytes, value: Object.freeze(parsed as object) as T });
}

/** A failed inspect is not absence unless the daemon identifies this exact name as absent. */
export function isExactDockerContainerAbsent(
  outcome: Readonly<{
    status: number | null;
    stdout: string | null | undefined;
    stderr: string | null | undefined;
    error?: unknown;
  }>,
  containerName: string,
): boolean {
  if (outcome.status !== 1 || outcome.error || (outcome.stdout ?? '').trim() !== '') {
    return false;
  }
  const escaped = containerName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(
    `^(?:Error: No such object:|Error response from daemon: No such container:) ${escaped}$`,
    'u',
  ).test((outcome.stderr ?? '').trim());
}

/** Docker daemon absence is authoritative only when it names the exact volume. */
export function isExactDockerVolumeAbsent(
  outcome: Readonly<{
    status: number | null;
    stdout: string | null | undefined;
    stderr: string | null | undefined;
    error?: unknown;
  }>,
  volumeName: string,
): boolean {
  if (!/^deckent-x[wd]-[a-f0-9]{48}$/u.test(volumeName)
    || outcome.status !== 1 || outcome.error || (outcome.stdout ?? '').trim() !== '') {
    return false;
  }
  const escaped = volumeName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^Error: No such volume: ${escaped}$`, 'u')
    .test((outcome.stderr ?? '').trim());
}

export interface ExactDockerWorkspaceVolumeInspectV1 {
  readonly name: string;
  readonly driver: 'local';
  /** Daemon-issued creation instant; identity-bound so delete/recreate is never the same resource. */
  readonly createdAt: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly scope: 'local';
  readonly options: Readonly<Record<string, string>>;
  readonly mountpoint: string;
}

export interface ExactDockerWorkspaceCommandInputV1 {
  readonly command: 'git' | 'docker';
  readonly args: readonly string[];
  readonly stdin: Uint8Array;
  readonly timeoutMs: number;
  readonly stdoutCeiling: number;
  readonly stderrCeiling: number;
}

export interface ExactDockerWorkspaceCommandResultV1 {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
  readonly error: boolean;
  readonly overflow: boolean;
}

export type ExactDockerWorkspaceCommandRunnerV1 = (
  input: ExactDockerWorkspaceCommandInputV1,
) => Promise<ExactDockerWorkspaceCommandResultV1>;

function exactDockerWorkspaceCommandSucceeded(
  result: ExactDockerWorkspaceCommandResultV1,
): boolean {
  return result.status === 0 && result.signal === null && !result.error && !result.overflow
    && result.stderr.byteLength === 0;
}

function exactDockerWorkspaceCommandStdout(
  result: ExactDockerWorkspaceCommandResultV1,
): string {
  return Buffer.from(result.stdout).toString('utf8');
}

function exactDockerWorkspaceCommandObservation(
  result: ExactDockerWorkspaceCommandResultV1,
): Readonly<{
  status: number | null;
  stdout: string;
  stderr: string;
  error: boolean;
}> {
  return Object.freeze({
    status: result.status,
    stdout: exactDockerWorkspaceCommandStdout(result),
    stderr: Buffer.from(result.stderr).toString('utf8'),
    error: result.error || result.overflow || result.signal !== null,
  });
}

export interface ExactDockerWorkspaceInventoryV1 {
  readonly version: 1;
  readonly paths: readonly string[];
  readonly pathCount: number;
  readonly totalPathBytes: number;
  readonly inventoryDigest: Sha256Digest;
  /** Exact NUL-delimited bytes delivered to the trusted population helper. */
  readonly nulDelimitedPaths: Uint8Array;
}

const EXACT_DOCKER_WORKSPACE_INVENTORY_BYTES_MAX =
  EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxTotalPathBytes
  + EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxEntries;

function exactDockerWorkspaceInventoryFromPaths(
  values: readonly string[],
): ExactDockerWorkspaceInventoryV1 | null {
  if (values.length > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxEntries) return null;
  const paths: string[] = [];
  const keys = new Map<string, string>();
  let totalPathBytes = 0;
  for (const value of values) {
    const portable = parseExecutionEffectPortablePath(value);
    if (!portable || portable.path !== value || isExecutionEffectProtectedPath(portable.path)
      || keys.has(portable.key)) return null;
    totalPathBytes += Buffer.byteLength(portable.path, 'utf8');
    if (!Number.isSafeInteger(totalPathBytes)
      || totalPathBytes > EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxTotalPathBytes) return null;
    keys.set(portable.key, portable.path);
    paths.push(portable.path);
  }
  paths.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const nulDelimitedPaths = paths.length === 0
    ? Buffer.alloc(0) : Buffer.from(`${paths.join('\0')}\0`, 'utf8');
  if (nulDelimitedPaths.byteLength > EXACT_DOCKER_WORKSPACE_INVENTORY_BYTES_MAX) return null;
  const body = Object.freeze({
    version: 1 as const,
    paths: Object.freeze(paths),
    pathCount: paths.length,
    totalPathBytes,
  });
  return Object.freeze({
    ...body,
    inventoryDigest: exactCustodyJsonDigest(body),
    nulDelimitedPaths,
  });
}

export function parseExactDockerWorkspaceInventory(
  bytes: Uint8Array,
): ExactDockerWorkspaceInventoryV1 | null {
  if (bytes.byteLength > EXACT_DOCKER_WORKSPACE_INVENTORY_BYTES_MAX) return null;
  const raw = Buffer.from(bytes);
  if (raw.byteLength > 0 && raw[raw.byteLength - 1] !== 0) return null;
  const segments = raw.byteLength === 0
    ? [] : raw.subarray(0, raw.byteLength - 1).toString('utf8').split('\0');
  const inventory = exactDockerWorkspaceInventoryFromPaths(segments);
  return inventory && Buffer.from(inventory.nulDelimitedPaths).equals(raw) ? inventory : null;
}

export function runExactDockerWorkspaceCommand(
  input: ExactDockerWorkspaceCommandInputV1,
): Promise<ExactDockerWorkspaceCommandResultV1> {
  const valid = (input.command === 'git' || input.command === 'docker')
    && Array.isArray(input.args) && input.args.length <= 512
    && input.args.every(value => typeof value === 'string' && !value.includes('\0')
      && Buffer.byteLength(value, 'utf8') <= 64 * 1024)
    && input.stdin instanceof Uint8Array
    && input.stdin.byteLength <= EXECUTION_EFFECT_PORTABLE_PATH_LIMITS.maxTotalPathBytes
    && Number.isSafeInteger(input.timeoutMs) && input.timeoutMs > 0 && input.timeoutMs <= 3_600_000
    && Number.isSafeInteger(input.stdoutCeiling) && input.stdoutCeiling >= 0
    && input.stdoutCeiling <= 32 * 1024 * 1024
    && Number.isSafeInteger(input.stderrCeiling) && input.stderrCeiling >= 0
    && input.stderrCeiling <= 16 * 1024 * 1024;
  if (!valid) {
    return Promise.resolve(Object.freeze({
      status: null,
      signal: null,
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      error: true,
      overflow: false,
    }));
  }
  return new Promise(resolveCommand => {
    let child: ReturnType<typeof nodeSpawn>;
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let error = false;
    let overflow = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (status: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveCommand(Object.freeze({
        status,
        signal,
        stdout,
        stderr,
        error,
        overflow,
      }));
    };
    const append = (
      current: Buffer<ArrayBufferLike>,
      value: string | Buffer<ArrayBufferLike>,
      ceiling: number,
    ): Buffer<ArrayBufferLike> => {
      const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
      const remaining = ceiling - current.byteLength;
      if (bytes.byteLength > remaining) {
        overflow = true;
        try { child.kill('SIGKILL'); } catch { /* exact HOLD still follows */ }
      }
      return remaining <= 0
        ? current : Buffer.concat([current, bytes.subarray(0, Math.max(0, remaining))]);
    };
    try {
      child = nodeSpawn(input.command, [...input.args], {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      resolveCommand(Object.freeze({
        status: null,
        signal: null,
        stdout,
        stderr,
        error: true,
        overflow: false,
      }));
      return;
    }
    child.stdout?.on('data', value => {
      stdout = append(stdout, value as string | Buffer<ArrayBufferLike>, input.stdoutCeiling);
    });
    child.stderr?.on('data', value => {
      stderr = append(stderr, value as string | Buffer<ArrayBufferLike>, input.stderrCeiling);
    });
    child.stdin?.once('error', () => {
      error = true;
      try { child.kill('SIGKILL'); } catch { /* close resolves */ }
    });
    child.once('error', () => { error = true; });
    child.once('close', (status, signal) => finish(status, signal));
    child.stdin?.end(Buffer.from(input.stdin));
    timer = setTimeout(() => {
      error = true;
      try { child.kill('SIGKILL'); } catch { /* close may already be pending */ }
      finish(null, null);
    }, input.timeoutMs);
    timer.unref();
  });
}

export async function readExactDockerWorkspaceInventory(
  canonicalProjectRoot: string,
  runner: ExactDockerWorkspaceCommandRunnerV1 = runExactDockerWorkspaceCommand,
): Promise<ExactDockerWorkspaceInventoryV1 | null> {
  if (!isAbsolute(canonicalProjectRoot) || canonicalProjectRoot.includes('\0')
    || resolve(canonicalProjectRoot) !== canonicalProjectRoot) return null;
  const outcome = await runner(Object.freeze({
    command: 'git' as const,
    args: Object.freeze([
      '-C', canonicalProjectRoot, 'ls-files', '-z', '--cached', '--others',
      '--exclude-standard', '--', '.',
      ...EXECUTION_EFFECT_PROTECTED_TREES.flatMap(tree => [
        `:(top,exclude)${tree}`,
        `:(top,exclude)${tree}/**`,
      ]),
    ]),
    stdin: Buffer.alloc(0),
    timeoutMs: 60_000,
    stdoutCeiling: EXACT_DOCKER_WORKSPACE_INVENTORY_BYTES_MAX,
    stderrCeiling: 64 * 1024,
  }));
  if (outcome.status !== 0 || outcome.signal !== null || outcome.error || outcome.overflow
    || outcome.stderr.byteLength !== 0) return null;
  const raw = Buffer.from(outcome.stdout);
  if (raw.byteLength > 0 && raw[raw.byteLength - 1] !== 0) return null;
  const paths = raw.byteLength === 0
    ? [] : raw.subarray(0, raw.byteLength - 1).toString('utf8').split('\0');
  return exactDockerWorkspaceInventoryFromPaths(paths);
}

/** Strict daemon projection for an attempt-private local volume. */
export function parseExactDockerWorkspaceVolumeInspect(
  raw: string,
): ExactDockerWorkspaceVolumeInspectV1 | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const row = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : null;
  if (!row || typeof row !== 'object' || nodeTypes.isProxy(row)) return null;
  const record = row as Record<string, unknown>;
  const labels = record.Labels;
  const options = record.Options === null ? Object.freeze({}) : record.Options;
  const rawCreatedAt = record.CreatedAt;
  if (typeof record.Name !== 'string'
    || !/^deckent-x[wd]-[a-f0-9]{48}$/u.test(record.Name)
    || record.Driver !== 'local'
    || record.Scope !== 'local'
    || !isExecutionEffectDockerDaemonTimestampV1(rawCreatedAt)
    || typeof record.Mountpoint !== 'string'
    || !isAbsolute(record.Mountpoint)
    || record.Mountpoint.includes('\0')
    || resolve(record.Mountpoint) !== record.Mountpoint
    || !labels || typeof labels !== 'object' || Array.isArray(labels) || nodeTypes.isProxy(labels)
    || !options || typeof options !== 'object' || Array.isArray(options) || nodeTypes.isProxy(options)
    || Object.values(labels as Record<string, unknown>).some(value => typeof value !== 'string')
    || Object.values(options as Record<string, unknown>).some(value => typeof value !== 'string')) {
    return null;
  }
  return Object.freeze({
    name: record.Name,
    driver: 'local',
    // Preserve the daemon's exact bounded RFC3339 representation. Truncating Docker's
    // nanoseconds to JavaScript milliseconds would collapse distinct delete/recreate
    // generations into one resource identity.
    createdAt: rawCreatedAt,
    labels: Object.freeze({ ...(labels as Record<string, string>) }),
    scope: 'local',
    options: Object.freeze({ ...(options as Record<string, string>) }),
    mountpoint: record.Mountpoint,
  });
}

export function verifyExactDockerWorkspaceVolumeInspect(
  observed: ExactDockerWorkspaceVolumeInspectV1,
  expected: Readonly<{
    readonly name: string;
    readonly labels: Readonly<Record<string, string>>;
    readonly canonicalProjectRoot: string;
  }>,
): boolean {
  if (!/^deckent-x[wd]-[a-f0-9]{48}$/u.test(expected.name)
    || observed.name !== expected.name
    || canonicalJson(observed.labels) !== canonicalJson(expected.labels)
    || Object.keys(observed.options).length !== 0
    || !isAbsolute(expected.canonicalProjectRoot)
    || resolve(expected.canonicalProjectRoot) !== expected.canonicalProjectRoot) return false;
  const lexicalRelative = relative(expected.canonicalProjectRoot, observed.mountpoint);
  if (lexicalRelative === ''
    || (lexicalRelative !== '..'
      && !lexicalRelative.startsWith(`..${sep}`)
      && !isAbsolute(lexicalRelative))) return false;
  let mountpoint: string;
  try { mountpoint = realpathSync.native(observed.mountpoint); } catch {
    // Docker Desktop/remote daemons may expose a daemon-local absolute path
    // which is not resolvable in the client namespace. Empty local-driver
    // options plus exact daemon labels/name remain the admission authority.
    return true;
  }
  const relativeMountpoint = relative(expected.canonicalProjectRoot, mountpoint);
  return relativeMountpoint !== ''
    && (relativeMountpoint === '..'
      || relativeMountpoint.startsWith(`..${sep}`)
      || isAbsolute(relativeMountpoint));
}

export function buildExactDockerWorkspaceVolumeCreateArgs(
  volumeName: string,
  labels: Readonly<Record<string, string>>,
): readonly string[] {
  if (!/^deckent-x[wd]-[a-f0-9]{48}$/u.test(volumeName)
    || Object.keys(labels).length === 0
    || Object.entries(labels).some(([key, value]) => !/^[a-z0-9][a-z0-9._-]{0,127}$/u.test(key)
      || typeof value !== 'string' || value.length === 0 || value.includes('\0')
      || Buffer.byteLength(value, 'utf8') > 1024)) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
  }
  return Object.freeze([
    'volume', 'create', '--driver', 'local',
    ...Object.entries(labels).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .flatMap(([key, value]) => ['--label', `${key}=${value}`]),
    volumeName,
  ]);
}

const EXACT_DOCKER_EFFECT_CAPTURE_TIMEOUT_MS = 60_000;
const EXACT_DOCKER_EFFECT_RECEIPT_CEILING = 20 * 1024 * 1024;

const EXACT_DOCKER_EFFECT_CAPTURE_HELPER = String.raw`
import { loadExecAuthorityNative } from '/app/dist/core/exec-authority-native.js';
const authority = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));
const native = loadExecAuthorityNative();
if (!native.available || !native.effect || native.effect.available === false) process.exit(78);
let root;
try {
  root = native.effect.openRoot('WORKSPACE', '/workspace');
  const rootInspection = native.effect.inspectEntry(root.handle, '.');
  const nativeCapture = native.effect.captureTree(root.handle, {
    ...authority.limits,
    deadlineUnixMs: authority.deadlineUnixMs,
  }, 'ACTIVE');
  const rootIdentityDigest = root.identityDigest;
  native.effect.closeHandle(root.handle); root = undefined;
  process.stdout.write(JSON.stringify({
    rootIdentityDigest,
    rootEntry: rootInspection.entry,
    nativeCapture,
  }));
} finally {
  if (root) native.effect.closeHandle(root.handle);
}
`;

const EXACT_DOCKER_EFFECT_POPULATE_HELPER = String.raw`
import { createHash } from 'node:crypto';
import {
  constants, closeSync, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readSync, writeSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { loadExecAuthorityNative } from '/app/dist/core/exec-authority-native.js';
const authority = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));
const raw = readFileSync(0);
if (raw.length !== authority.inventoryByteLength
  || (raw.length > 0 && raw[raw.length - 1] !== 0)) process.exit(78);
const paths = raw.length === 0 ? [] : raw.subarray(0, raw.length - 1).toString('utf8').split('\0');
const {
  maxEntries: MAX_ENTRIES, maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: MAX_TOTAL_BYTES,
  maxPathBytes: MAX_PATH_BYTES, maxNameBytes: MAX_NAME_BYTES, maxDepth: MAX_DEPTH,
} = authority.limits;
if (paths.length !== authority.pathCount || paths.length > MAX_ENTRIES
  || !Number.isSafeInteger(authority.deadlineUnixMs)
  || !/^sha256:[a-f0-9]{64}$/.test(authority.inventoryDigest)
  || !/^sha256:[a-f0-9]{64}$/.test(authority.inventoryAdmissionReceiptDigest)
  || ![MAX_ENTRIES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_PATH_BYTES, MAX_NAME_BYTES, MAX_DEPTH]
    .every(Number.isSafeInteger)) process.exit(78);
const checkDeadline = () => { if (Date.now() > authority.deadlineUnixMs) process.exit(78); };
const same = (a,b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode
  && a.size === b.size && a.mtimeNs === b.mtimeNs && a.nlink === b.nlink;
let previous = null;
for (const relative of paths) {
  if (!relative || relative.startsWith('/') || relative.includes('\\')
    || Buffer.byteLength(relative, 'utf8') > MAX_PATH_BYTES
    || relative.split('/').length > MAX_DEPTH
    || relative.split('/').some(part => !part || part === '.' || part === '..'
      || Buffer.byteLength(part, 'utf8') > MAX_NAME_BYTES)
    || (previous !== null && previous >= relative)) process.exit(78);
  previous = relative;
}
const inspectParents = (root, relative) => {
  const parts = relative.split('/');
  for (let index = 1; index < parts.length; index += 1) {
    const parent = lstatSync(join(root, ...parts.slice(0, index)), { bigint: true });
    if (!parent.isDirectory() || parent.isSymbolicLink()) process.exit(78);
  }
};
const readEntry = (root, relative) => {
  checkDeadline();
  inspectParents(root, relative);
  const absolute = join(root, ...relative.split('/'));
  const before = lstatSync(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) process.exit(78);
  if (before.size < 0n || before.size > BigInt(MAX_FILE_BYTES)
    || before.size > BigInt(Number.MAX_SAFE_INTEGER)) process.exit(78);
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  const content = createHash('sha256');
  let byteLength = 0;
  try {
    const opened = fstatSync(fd, { bigint: true });
    if (!same(before, opened) || opened.nlink !== 1n) process.exit(78);
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      checkDeadline();
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      byteLength += count;
      if (!Number.isSafeInteger(byteLength) || byteLength > MAX_FILE_BYTES) process.exit(78);
      content.update(buffer.subarray(0, count));
    }
    const after = fstatSync(fd, { bigint: true });
    if (!same(opened, after) || BigInt(byteLength) !== opened.size) process.exit(78);
  } finally { closeSync(fd); }
  return Object.freeze({
    mode: Number(before.mode & 0o777n),
    byteLength,
    contentDigest: 'sha256:' + content.digest('hex'),
  });
};
const scan = (root, retainEntries) => {
  const hash = createHash('sha256')
    .update('execution-effect-population-content-manifest-v1', 'utf8').update('\0', 'utf8')
    .update(JSON.stringify({
      inventoryDigest: authority.inventoryDigest,
      inventoryAdmissionReceiptDigest: authority.inventoryAdmissionReceiptDigest,
      pathCount: paths.length,
    }), 'utf8').update('\0', 'utf8');
  const entries = retainEntries ? new Map() : null;
  let entryCount = 0;
  let totalBytes = 0;
  for (const relative of paths) {
    const entry = readEntry(root, relative);
    totalBytes += entry.byteLength;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) process.exit(78);
    entryCount += 1;
    if (entries) entries.set(relative, entry);
    hash.update(JSON.stringify([
      'regular-file', relative, entry.mode, entry.byteLength, entry.contentDigest,
    ]), 'utf8').update('\n', 'utf8');
  }
  return Object.freeze({
    digest: 'sha256:' + hash.digest('hex'),
    entryCount,
    totalBytes,
    entries,
  });
};
const sourcePre = scan('/source', true);
for (const relative of paths) {
  checkDeadline();
  const parts = relative.split('/');
  inspectParents('/source', relative);
  const source = join('/source', ...parts);
  const before = lstatSync(source, { bigint: true });
  const expected = sourcePre.entries.get(relative);
  if (!expected || !before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || Number(before.mode & 0o777n) !== expected.mode
    || before.size !== BigInt(expected.byteLength)) process.exit(78);
  const destination = join('/workspace', ...parts);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o755 });
  const sourceFd = openSync(source, constants.O_RDONLY | constants.O_NOFOLLOW);
  const destinationFd = openSync(
    destination,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    Number(before.mode & 0o777n),
  );
  try {
    const opened = fstatSync(sourceFd, { bigint: true });
    if (!same(before, opened) || opened.nlink !== 1n) process.exit(78);
    const content = createHash('sha256');
    let byteLength = 0;
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      checkDeadline();
      const count = readSync(sourceFd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      byteLength += count;
      if (!Number.isSafeInteger(byteLength) || byteLength > MAX_FILE_BYTES) process.exit(78);
      content.update(buffer.subarray(0, count));
      let offset = 0;
      while (offset < count) {
        checkDeadline();
        const written = writeSync(destinationFd, buffer, offset, count - offset);
        if (!Number.isSafeInteger(written) || written <= 0) process.exit(78);
        offset += written;
      }
    }
    const after = fstatSync(sourceFd, { bigint: true });
    if (!same(opened, after) || byteLength !== expected.byteLength
      || 'sha256:' + content.digest('hex') !== expected.contentDigest) process.exit(78);
    fchmodSync(destinationFd, Number(before.mode & 0o777n));
    fsyncSync(destinationFd);
  } finally {
    closeSync(destinationFd);
    closeSync(sourceFd);
  }
}
sourcePre.entries.clear();
const destination = scan('/workspace', false);
const sourcePost = scan('/source', false);
if (sourcePre.digest !== destination.digest || destination.digest !== sourcePost.digest
  || sourcePre.entryCount !== destination.entryCount
  || destination.entryCount !== sourcePost.entryCount
  || sourcePre.totalBytes !== destination.totalBytes
  || destination.totalBytes !== sourcePost.totalBytes) process.exit(78);
const native = loadExecAuthorityNative();
if (!native.available || !native.effect || native.effect.available === false) process.exit(78);
let root;
try {
  root = native.effect.openRoot('WORKSPACE', '/workspace');
  const rootInspection = native.effect.inspectEntry(root.handle, '.');
  const nativeCapture = native.effect.captureTree(root.handle, {
    ...authority.limits,
    deadlineUnixMs: authority.deadlineUnixMs,
  }, 'ACTIVE');
  const rootIdentityDigest = root.identityDigest;
  native.effect.closeHandle(root.handle); root = undefined;
  process.stdout.write(JSON.stringify({
    rootIdentityDigest,
    rootEntry: rootInspection.entry,
    nativeCapture,
    sourcePreManifestDigest: sourcePre.digest,
    destinationManifestDigest: destination.digest,
    sourcePostManifestDigest: sourcePost.digest,
    manifestEntryCount: sourcePre.entryCount,
    manifestTotalBytes: sourcePre.totalBytes,
  }));
} finally {
  if (root) native.effect.closeHandle(root.handle);
}
`;

/** Test/audit projection of the immutable, inventory-bound workspace population verifier. */
export function exactDockerEffectPopulationHelperSource(): string {
  return EXACT_DOCKER_EFFECT_POPULATE_HELPER;
}

const EXACT_DOCKER_EFFECT_DEPENDENCY_HELPER = String.raw`
import { createHash } from 'node:crypto';
import {
  closeSync, constants, cpSync, lstatSync, openSync, opendirSync, readSync, readlinkSync,
} from 'node:fs';
import { join, relative } from 'node:path';
const authority = JSON.parse(Buffer.from(process.argv[1], 'base64url').toString('utf8'));
const source = '/app/node_modules';
const destination = '/dependencies';
const {
  maxEntries: MAX_ENTRIES, maxDepth: MAX_DEPTH, maxFileBytes: MAX_FILE_BYTES,
  maxTotalBytes: MAX_TOTAL_BYTES, maxPathBytes: MAX_PATH_BYTES,
  maxNameBytes: MAX_NAME_BYTES,
} = authority.limits;
if (![MAX_ENTRIES, MAX_DEPTH, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_PATH_BYTES, MAX_NAME_BYTES]
  .every(Number.isSafeInteger)) process.exit(78);
const readNames = absolute => {
  const names = [];
  const directory = opendirSync(absolute);
  try {
    for (;;) {
      const entry = directory.readSync();
      if (!entry) break;
      names.push(entry.name);
      if (names.length > MAX_ENTRIES) process.exit(78);
    }
  } finally { directory.closeSync(); }
  return names.sort((a,b) => a < b ? -1 : a > b ? 1 : 0);
};
const hashFile = absolute => {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    for (;;) {
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
    }
  } finally { closeSync(fd); }
  return hash.digest('hex');
};
const tree = root => {
  const treeHash = createHash('sha256')
    .update('execution-effect-dependency-tree-v1', 'utf8').update('\0', 'utf8')
    .update(JSON.stringify(authority.limits), 'utf8').update('\0', 'utf8');
  const stack = [{ absolute: root, depth: 0 }];
  let entryCount = 0;
  let totalBytes = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || current.depth > MAX_DEPTH) process.exit(78);
    const names = readNames(current.absolute);
    const directories = [];
    for (const name of names) {
      if (!name || Buffer.byteLength(name, 'utf8') > MAX_NAME_BYTES) process.exit(78);
      const absolute = join(current.absolute, name);
      const rel = relative(root, absolute).split('\\').join('/');
      if (!rel || rel.startsWith('../') || Buffer.byteLength(rel, 'utf8') > MAX_PATH_BYTES) process.exit(78);
      const stat = lstatSync(absolute);
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) process.exit(78);
      let row;
      if (stat.isDirectory()) {
        row = ['d', rel, stat.mode & 0o777];
        directories.push({ absolute, depth: current.depth + 1 });
      } else if (stat.isFile()) {
        if (stat.nlink !== 1 || stat.size > MAX_FILE_BYTES) process.exit(78);
        totalBytes += stat.size;
        if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TOTAL_BYTES) process.exit(78);
        row = ['f', rel, stat.mode & 0o777, stat.size, hashFile(absolute)];
      } else if (stat.isSymbolicLink()) {
        const target = readlinkSync(absolute);
        if (Buffer.byteLength(target, 'utf8') > MAX_PATH_BYTES) process.exit(78);
        row = ['l', rel, target];
      } else process.exit(78);
      treeHash.update(JSON.stringify(row), 'utf8').update('\n', 'utf8');
    }
    for (let index = directories.length - 1; index >= 0; index -= 1) stack.push(directories[index]);
  }
  return { entryCount, totalBytes, digest: 'sha256:' + treeHash.digest('hex') };
};
const before = tree(source);
for (const name of readNames(source)) {
  cpSync(join(source, name), join(destination, name), {
    recursive: true, dereference: false, errorOnExist: true, force: false,
  });
}
const after = tree(destination);
if (before.entryCount !== after.entryCount || before.totalBytes !== after.totalBytes
  || before.digest !== after.digest) process.exit(78);
process.stdout.write(JSON.stringify({
  entryCount: after.entryCount,
  dependencyTreeDigest: after.digest,
}));
`;

/** Test/audit projection of the immutable, image-owned dependency copy verifier. */
export function exactDockerEffectDependencyHelperSource(): string {
  return EXACT_DOCKER_EFFECT_DEPENDENCY_HELPER;
}

/** Strict host/image manifest parity; expected is supplied by the validated host native loader. */
export function verifyExactDockerEffectNativeManifestParity(
  observed: unknown,
  expected: unknown,
): boolean {
  const observedSnapshot = snapshotExactPlainData(observed);
  const expectedSnapshot = snapshotExactPlainData(expected);
  return observedSnapshot.ok && expectedSnapshot.ok
    && canonicalJson(observedSnapshot.value) === canonicalJson(expectedSnapshot.value);
}

/** Exact effect custody has no safe provider path without an admitted landing policy. */
export function isExactDockerEffectLandingPolicyAdmitted(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || nodeTypes.isProxy(value)) return false;
  try {
    assertExecutionLandingPolicyConfig(value, 'exact Docker execution landing policy');
    return true;
  } catch {
    return false;
  }
}

const EXACT_DOCKER_EFFECT_NATIVE_PROBE_HELPER = String.raw`
import { loadExecAuthorityNative } from '/app/dist/core/exec-authority-native.js';
const native = loadExecAuthorityNative();
if (!native.available || !native.effect || native.effect.available === false) process.exit(78);
process.stdout.write(JSON.stringify({ manifest: native.manifest }));
`;

export interface ExactDockerEffectImageAuthorityV1 {
  readonly imageReference: string;
  readonly imageDigest: Sha256Digest;
  readonly imageIdentityDigest: Sha256Digest;
}

function parseExactDockerEffectImageAuthority(
  raw: string,
): ExactDockerEffectImageAuthorityV1 | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const row = Array.isArray(value) && value.length === 1 ? value[0] : null;
  if (!row || typeof row !== 'object' || nodeTypes.isProxy(row)) return null;
  const record = row as Record<string, unknown>;
  const repoDigests = Array.isArray(record.RepoDigests)
    ? record.RepoDigests.filter((item): item is string => typeof item === 'string').sort()
    : [];
  const repoDigestValues = new Set(repoDigests.map(item => item.slice(item.lastIndexOf('@') + 1)));
  const imageReference = repoDigests.length > 0 && repoDigestValues.size === 1
    ? repoDigests[0]! : null;
  const match = imageReference ? /@(?<digest>sha256:[a-f0-9]{64})$/u.exec(imageReference) : null;
  if (!match?.groups?.digest || typeof record.Id !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(record.Id)
    || (record.Os !== 'linux') || typeof record.Architecture !== 'string') return null;
  return Object.freeze({
    imageReference: imageReference as string,
    imageDigest: match.groups.digest as Sha256Digest,
    imageIdentityDigest: exactEffectDomainDigest('execution-effect-docker-image-identity-v1', {
      id: record.Id,
      repoDigests,
      architecture: record.Architecture,
      os: record.Os,
    }) as Sha256Digest,
  });
}

export function exactDockerEffectVolumeIdentity(
  observed: ExactDockerWorkspaceVolumeInspectV1,
  authority: Readonly<{
    readonly labelsDigest: Sha256Digest;
    readonly resourceInstanceDigest: Sha256Digest;
    readonly mountPlanDigest: Sha256Digest;
  }>,
): Sha256Digest {
  return executionEffectDockerVolumeIdentityDigestV1({
    volumeName: observed.name,
    labelsDigest: authority.labelsDigest,
    resourceInstanceDigest: authority.resourceInstanceDigest,
    mountPlanDigest: authority.mountPlanDigest,
    daemonCreatedAt: observed.createdAt,
  }) as Sha256Digest;
}

export interface CreateExactDockerEffectLifecycleAdapterV1Input {
  readonly canonicalProjectRoot: string;
  readonly imageAuthority: ExactDockerEffectImageAuthorityV1;
  readonly inventory: ExactDockerWorkspaceInventoryV1;
  readonly runner: ExactDockerWorkspaceCommandRunnerV1;
  readonly nowIso: () => string;
}

function exactDockerEffectTimestamp(nowIso: () => string): string {
  const value = nowIso();
  if (!Number.isFinite(Date.parse(value)) || new Date(Date.parse(value)).toISOString() !== value) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  return value;
}

function exactDockerEffectCaptureLimitsWithDeadline(
  limits: ExecutionEffectCaptureLimits,
  deadlineUnixMs: number,
): object {
  return Object.freeze({
    maxEntries: limits.maxEntries,
    maxFileBytes: limits.maxFileBytes,
    maxTotalBytes: limits.maxTotalBytes,
    maxDepth: limits.maxDepth,
    maxPathBytes: limits.maxPathBytes,
    maxNameBytes: limits.maxNameBytes,
    maxManifestBytes: limits.maxManifestBytes,
    deadlineUnixMs,
  });
}

function parseExactDockerEffectRawCapture(
  value: unknown,
  input: Readonly<{
    operation: Parameters<typeof createExecutionEffectDockerLifecycleCaptureReceiptV1>[0]['operation'];
    authorityDigest: Sha256Digest;
    plan: ExecutionEffectDockerWorkspacePlanV1;
    volumeIdentityDigest: Sha256Digest;
    limits: ExecutionEffectCaptureLimits;
    startedAt: string;
    completedAt: string;
    deadlineAt: string;
  }>,
): ExecutionEffectDockerRawCaptureV1 | null {
  const record = exactOwnDataRecord(value, ['rootIdentityDigest', 'rootEntry', 'nativeCapture']);
  const root = exactOwnDataRecord(record?.rootEntry, [
    'schemaVersion', 'path', 'kind', 'mode', 'size', 'objectIdentityDigest', 'contentDigest',
  ]);
  const capture = exactOwnDataRecord(record?.nativeCapture, [
    'schemaVersion', 'kind', 'state', 'entries', 'entryCount', 'totalBytes', 'manifestDigest',
  ]);
  if (!record || !root || !capture || !isExactDigest(record.rootIdentityDigest)
    || root.schemaVersion !== 1 || root.path !== '.' || root.kind !== 'DIRECTORY'
    || !isExactDigest(root.objectIdentityDigest) || capture.schemaVersion !== 1
    || capture.kind !== 'execution-effect-manifest' || capture.state !== 'CAPTURED'
    || !Array.isArray(capture.entries) || !Number.isSafeInteger(capture.entryCount)
    || !Number.isSafeInteger(capture.totalBytes) || !isExactDigest(capture.manifestDigest)) {
    return null;
  }
  const workspaceIdentity = Object.freeze({
    filesystemId: input.volumeIdentityDigest,
    directoryId: root.objectIdentityDigest as Sha256Digest,
    rootHandleEvidenceDigest: record.rootIdentityDigest as Sha256Digest,
  });
  try {
    const receipt = createExecutionEffectDockerLifecycleCaptureReceiptV1({
      operation: input.operation,
      authorityDigest: input.authorityDigest,
      phase: input.operation.startsWith('FINAL_QUIESCENCE_') ? 'final' : 'baseline',
      volumeName: input.plan.volumeName,
      volumeIdentityDigest: input.volumeIdentityDigest,
      workspaceIdentity,
      nativeManifestDigest: capture.manifestDigest as Sha256Digest,
      rootObjectIdentityDigest: root.objectIdentityDigest as Sha256Digest,
      entryCount: capture.entryCount as number,
      totalBytes: capture.totalBytes as number,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      deadlineAt: input.deadlineAt,
    });
    return Object.freeze({
      workspaceIdentity,
      rootEntry: Object.freeze({ ...root }) as unknown as ExecutionEffectNativeCaptureEntryV1,
      nativeCapture: Object.freeze({
        ...capture,
        entries: Object.freeze([...(capture.entries as ExecutionEffectNativeCaptureEntryV1[])]),
      }) as unknown as ExecutionEffectNativeCaptureTreeV1,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
      deadlineAt: input.deadlineAt,
      receipt,
    });
  } catch {
    return null;
  }
}

/** Production lifecycle adapter: every Docker effect crosses the bounded async runner. */
export function createExactDockerEffectLifecycleAdapterV1(
  input: CreateExactDockerEffectLifecycleAdapterV1Input,
): ExecutionEffectDockerLifecycleAdapterV1 {
  const canonicalProjectRoot = canonicalExactDockerProjectRoot(input.canonicalProjectRoot);
  if (canonicalProjectRoot !== input.canonicalProjectRoot
    || input.inventory.inventoryDigest !== exactCustodyJsonDigest({
      version: input.inventory.version,
      paths: input.inventory.paths,
      pathCount: input.inventory.pathCount,
      totalPathBytes: input.inventory.totalPathBytes,
    })) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
  }
  const run = input.runner;
  const now = input.nowIso;
  const inspectVolume = async (name: string): Promise<ExactDockerWorkspaceVolumeInspectV1 | null> => {
    const result = await run(Object.freeze({
      command: 'docker' as const,
      args: Object.freeze(['volume', 'inspect', name]),
      stdin: Buffer.alloc(0), timeoutMs: 10_000,
      stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
    }));
    return exactDockerWorkspaceCommandSucceeded(result)
      ? parseExactDockerWorkspaceVolumeInspect(exactDockerWorkspaceCommandStdout(result)) : null;
  };
  const inspectExactVolumeGeneration = async (
    name: string,
    authority: Readonly<{
      readonly labels: Readonly<Record<string, string>>;
      readonly labelsDigest: Sha256Digest;
      readonly resourceInstanceDigest: Sha256Digest;
      readonly mountPlanDigest: Sha256Digest;
      readonly volumeIdentityDigest: Sha256Digest;
    }>,
  ): Promise<ExactDockerWorkspaceVolumeInspectV1 | null> => {
    const inspected = await inspectVolume(name);
    return inspected && verifyExactDockerWorkspaceVolumeInspect(inspected, {
      name,
      labels: authority.labels,
      canonicalProjectRoot,
    }) && exactDockerEffectVolumeIdentity(inspected, authority) === authority.volumeIdentityDigest
      ? inspected : null;
  };
  const runCapture = async (
    captureInput: Parameters<ExecutionEffectDockerLifecycleAdapterV1['captureWorkspace']>[0]
      | Parameters<ExecutionEffectDockerLifecycleAdapterV1['populateWorkspace']>[0],
    operation: Parameters<typeof createExecutionEffectDockerLifecycleCaptureReceiptV1>[0]['operation'],
    populate: boolean,
  ): Promise<Readonly<{
    capture: ExecutionEffectDockerRawCaptureV1;
    populationManifest: Readonly<{
      sourcePreManifestDigest: Sha256Digest;
      destinationManifestDigest: Sha256Digest;
      sourcePostManifestDigest: Sha256Digest;
      manifestEntryCount: number;
      manifestTotalBytes: number;
    }> | null;
  }>> => {
    const expectedVolumeIdentityDigest = ('workspaceSnapshot' in captureInput
      ? captureInput.workspaceSnapshot.workspaceResource.volumeIdentityDigest
      : captureInput.volumeIdentityDigest) as Sha256Digest;
    const workspaceAuthority = Object.freeze({
      labels: captureInput.plan.workspaceLabels,
      labelsDigest: captureInput.plan.workspaceLabelsDigest as Sha256Digest,
      resourceInstanceDigest:
        captureInput.plan.workspaceResourceInstanceDigest as Sha256Digest,
      mountPlanDigest: captureInput.plan.mountPlanDigest as Sha256Digest,
      volumeIdentityDigest: expectedVolumeIdentityDigest,
    });
    const beforeGeneration = await inspectExactVolumeGeneration(
      captureInput.plan.volumeName,
      workspaceAuthority,
    );
    if (!beforeGeneration) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    const startedAt = exactDockerEffectTimestamp(now);
    const startedMs = Date.parse(startedAt);
    const deadlineMs = startedMs + EXACT_DOCKER_EFFECT_CAPTURE_TIMEOUT_MS;
    const deadlineAt = new Date(deadlineMs).toISOString();
    const encoded = Buffer.from(canonicalJson({
      limits: exactDockerEffectCaptureLimitsWithDeadline(captureInput.captureLimits, deadlineMs),
      deadlineUnixMs: deadlineMs,
      ...(populate ? {
        inventoryByteLength: input.inventory.nulDelimitedPaths.byteLength,
        pathCount: input.inventory.pathCount,
        inventoryDigest: input.inventory.inventoryDigest,
        inventoryAdmissionReceiptDigest: captureInput.plan.inventoryAdmissionReceiptDigest,
      } : {}),
    }), 'utf8').toString('base64url');
    const args = [
      'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges',
      '--memory', '2g', '--memory-swap', '2g', '--pids-limit', '256',
      '--tmpfs', '/tmp:size=64m,mode=0700',
      ...(populate ? [
        '--mount', `type=bind,src=${canonicalProjectRoot},dst=/source,readonly,bind-propagation=rprivate`,
      ] : []),
      '--mount', `type=volume,src=${captureInput.plan.volumeName},dst=/workspace,volume-nocopy`,
      input.imageAuthority.imageReference,
      'node', '--input-type=module', '-e',
      populate ? EXACT_DOCKER_EFFECT_POPULATE_HELPER : EXACT_DOCKER_EFFECT_CAPTURE_HELPER,
      encoded,
    ];
    const result = await run(Object.freeze({
      command: 'docker' as const,
      args: Object.freeze(args),
      stdin: populate ? input.inventory.nulDelimitedPaths : Buffer.alloc(0),
      timeoutMs: EXACT_DOCKER_EFFECT_CAPTURE_TIMEOUT_MS,
      stdoutCeiling: EXACT_DOCKER_EFFECT_RECEIPT_CEILING,
      stderrCeiling: 64 * 1024,
    }));
    if (!exactDockerWorkspaceCommandSucceeded(result)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    const afterGeneration = await inspectExactVolumeGeneration(
      captureInput.plan.volumeName,
      workspaceAuthority,
    );
    if (!afterGeneration || beforeGeneration.createdAt !== afterGeneration.createdAt) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    const completedAt = exactDockerEffectTimestamp(now);
    if (Date.parse(completedAt) < startedMs || Date.parse(completedAt) > deadlineMs) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    let decoded: unknown;
    try { decoded = JSON.parse(exactDockerWorkspaceCommandStdout(result)); } catch { decoded = null; }
    const captureRecord = exactOwnDataRecord(decoded, populate ? [
      'rootIdentityDigest', 'rootEntry', 'nativeCapture',
      'sourcePreManifestDigest', 'destinationManifestDigest', 'sourcePostManifestDigest',
      'manifestEntryCount', 'manifestTotalBytes',
    ] : ['rootIdentityDigest', 'rootEntry', 'nativeCapture']);
    const populationManifest = populate && captureRecord
      && isExactDigest(captureRecord.sourcePreManifestDigest)
      && isExactDigest(captureRecord.destinationManifestDigest)
      && isExactDigest(captureRecord.sourcePostManifestDigest)
      && captureRecord.sourcePreManifestDigest === captureRecord.destinationManifestDigest
      && captureRecord.destinationManifestDigest === captureRecord.sourcePostManifestDigest
      && Number.isSafeInteger(captureRecord.manifestEntryCount)
      && Number(captureRecord.manifestEntryCount) === input.inventory.pathCount
      && Number(captureRecord.manifestEntryCount) <= captureInput.captureLimits.maxEntries
      && Number.isSafeInteger(captureRecord.manifestTotalBytes)
      && Number(captureRecord.manifestTotalBytes) >= 0
      && Number(captureRecord.manifestTotalBytes) <= captureInput.captureLimits.maxTotalBytes
      ? Object.freeze({
          sourcePreManifestDigest: captureRecord.sourcePreManifestDigest as Sha256Digest,
          destinationManifestDigest: captureRecord.destinationManifestDigest as Sha256Digest,
          sourcePostManifestDigest: captureRecord.sourcePostManifestDigest as Sha256Digest,
          manifestEntryCount: Number(captureRecord.manifestEntryCount),
          manifestTotalBytes: Number(captureRecord.manifestTotalBytes),
        })
      : null;
    const raw = captureRecord ? parseExactDockerEffectRawCapture({
      rootIdentityDigest: captureRecord.rootIdentityDigest,
      rootEntry: captureRecord.rootEntry,
      nativeCapture: captureRecord.nativeCapture,
    }, {
      operation,
      authorityDigest: captureInput.authorityDigest as Sha256Digest,
      plan: captureInput.plan,
      volumeIdentityDigest: expectedVolumeIdentityDigest,
      limits: captureInput.captureLimits,
      startedAt,
      completedAt,
      deadlineAt,
    }) : null;
    if (!raw || (populate && populationManifest === null)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    return Object.freeze({ capture: raw, populationManifest });
  };
  const adapter: ExecutionEffectDockerLifecycleAdapterV1 = {
    async inspectImage(authority) {
      const observed = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['image', 'inspect', authority.imageReference]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 8 * 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      const image = exactDockerWorkspaceCommandSucceeded(observed)
        ? parseExactDockerEffectImageAuthority(exactDockerWorkspaceCommandStdout(observed)) : null;
      if (!image || canonicalJson(image) !== canonicalJson(input.imageAuthority)
        || image.imageDigest !== authority.expectedImageDigest) return null;
      return createExecutionEffectDockerImageObservationV1({
        authorityDigest: authority.authorityDigest,
        imageReference: image.imageReference,
        imageDigest: image.imageDigest,
        imageIdentityDigest: image.imageIdentityDigest,
        observedAt: exactDockerEffectTimestamp(now),
      });
    },
    async prepareDependencies(authority) {
      const startedAt = exactDockerEffectTimestamp(now);
      const absent = await run(Object.freeze({
        command: 'docker' as const, args: Object.freeze(['volume', 'inspect', authority.dependencyPlan.volumeName]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000, stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      if (!isExactDockerVolumeAbsent(
        exactDockerWorkspaceCommandObservation(absent), authority.dependencyPlan.volumeName,
      )) return null;
      const absenceDigest = exactEffectDomainDigest('execution-effect-docker-dependency-absence-v1', {
        name: authority.dependencyPlan.volumeName,
        observedAt: startedAt,
      });
      const created = await run(Object.freeze({
        command: 'docker' as const,
        args: buildExactDockerWorkspaceVolumeCreateArgs(
          authority.dependencyPlan.volumeName,
          authority.labels,
        ),
        stdin: Buffer.alloc(0), timeoutMs: 10_000, stdoutCeiling: 1024, stderrCeiling: 64 * 1024,
      }));
      if (!exactDockerWorkspaceCommandSucceeded(created)
        || exactDockerWorkspaceCommandStdout(created).trim() !== authority.dependencyPlan.volumeName) return null;
      const inspected = await inspectVolume(authority.dependencyPlan.volumeName);
      if (!inspected || !verifyExactDockerWorkspaceVolumeInspect(inspected, {
        name: authority.dependencyPlan.volumeName,
        labels: authority.labels,
        canonicalProjectRoot,
      })) return null;
      const volumeIdentityDigest = exactDockerEffectVolumeIdentity(inspected, {
        labelsDigest: authority.labelsDigest as Sha256Digest,
        resourceInstanceDigest: authority.resourceInstanceDigest as Sha256Digest,
        mountPlanDigest: authority.dependencyPlanDigest as Sha256Digest,
      });
      const dependencyVolumeAuthority = Object.freeze({
        labels: authority.labels,
        labelsDigest: authority.labelsDigest as Sha256Digest,
        resourceInstanceDigest: authority.resourceInstanceDigest as Sha256Digest,
        mountPlanDigest: authority.dependencyPlanDigest as Sha256Digest,
        volumeIdentityDigest,
      });
      const beforePopulation = await inspectExactVolumeGeneration(
        authority.dependencyPlan.volumeName,
        dependencyVolumeAuthority,
      );
      if (!beforePopulation || beforePopulation.createdAt !== inspected.createdAt) return null;
      const dependencyHelperAuthority = Buffer.from(canonicalJson({
        limits: EXECUTION_EFFECT_CAPTURE_HARD_LIMITS,
      }), 'utf8').toString('base64url');
      const population = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze([
          'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges',
          '--memory', '2g', '--memory-swap', '2g', '--pids-limit', '256',
          '--tmpfs', '/tmp:size=64m,mode=0700',
          '--mount', `type=volume,src=${authority.dependencyPlan.volumeName},dst=/dependencies,volume-nocopy`,
          authority.imageReference, 'node', '--input-type=module', '-e',
          EXACT_DOCKER_EFFECT_DEPENDENCY_HELPER, dependencyHelperAuthority,
        ]),
        stdin: Buffer.alloc(0), timeoutMs: 120_000,
        stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      let populationValue: Record<string, unknown> | null = null;
      try {
        populationValue = exactOwnDataRecord(
          JSON.parse(exactDockerWorkspaceCommandStdout(population)),
          ['entryCount', 'dependencyTreeDigest'],
        );
      } catch { populationValue = null; }
      if (!exactDockerWorkspaceCommandSucceeded(population) || !populationValue
        || !Number.isSafeInteger(populationValue.entryCount)
        || !isExactDigest(populationValue.dependencyTreeDigest)) return null;
      const afterPopulation = await inspectExactVolumeGeneration(
        authority.dependencyPlan.volumeName,
        dependencyVolumeAuthority,
      );
      if (!afterPopulation || afterPopulation.createdAt !== beforePopulation.createdAt) return null;
      const completedAt = exactDockerEffectTimestamp(now);
      const creationReceiptDigest = exactEffectDomainDigest(
        'execution-effect-docker-dependency-create-v1',
        {
          absenceDigest,
          volumeIdentityDigest,
          resourceInstanceDigest: authority.resourceInstanceDigest,
          daemonCreatedAt: beforePopulation.createdAt,
          completedAt,
        },
      );
      const inspectDigest = exactEffectDomainDigest(
        'execution-effect-docker-dependency-inspect-v1', beforePopulation,
      );
      const populationReceiptDigest = exactEffectDomainDigest(
        'execution-effect-docker-dependency-population-v1',
        { volumeIdentityDigest, dependencyTreeDigest: populationValue.dependencyTreeDigest },
      );
      return createExecutionEffectDockerDependencyAuthorityReceiptV1({
        authorityDigest: authority.authorityDigest,
        imageObservationReceiptDigest: authority.imageObservationReceiptDigest,
        imageIdentityDigest: authority.imageIdentityDigest,
        dependencyPlanDigest: authority.dependencyPlanDigest,
        labelsDigest: authority.labelsDigest,
        resourceInstanceDigest: authority.resourceInstanceDigest,
        volumeName: authority.dependencyPlan.volumeName,
        volumeIdentityDigest,
        absenceObservationDigest: absenceDigest,
        creationReceiptDigest,
        verifiedInspectDigest: inspectDigest,
        populationReceiptDigest,
        dependencyTreeDigest: populationValue.dependencyTreeDigest as Sha256Digest,
        daemonCreatedAt: beforePopulation.createdAt,
        startedAt,
        completedAt,
      });
    },
    async verifyExclusiveAttachments(authority) {
      const workspaceAuthority = Object.freeze({
        labels: authority.workspacePlan.workspaceLabels,
        labelsDigest: authority.workspacePlan.workspaceLabelsDigest as Sha256Digest,
        resourceInstanceDigest:
          authority.workspacePlan.workspaceResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: authority.workspacePlan.mountPlanDigest as Sha256Digest,
        volumeIdentityDigest: authority.workspaceVolumeIdentityDigest as Sha256Digest,
      });
      const dependencyAuthority = Object.freeze({
        labels: authority.workspacePlan.dependencyLabels,
        labelsDigest: authority.workspacePlan.dependencyLabelsDigest as Sha256Digest,
        resourceInstanceDigest:
          authority.workspacePlan.dependencyResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: authority.workspacePlan.dependencyPlanDigest as Sha256Digest,
        volumeIdentityDigest: authority.dependencyVolumeIdentityDigest as Sha256Digest,
      });
      if (authority.workspaceVolumeName !== authority.workspacePlan.volumeName
        || authority.dependencyVolumeName !== authority.workspacePlan.dependencyPlan.volumeName
        || authority.dependencyAuthority.volumeName !== authority.dependencyVolumeName
        || authority.dependencyAuthority.volumeIdentityDigest
          !== authority.dependencyVolumeIdentityDigest
        || authority.dependencyAuthority.resourceInstanceDigest
          !== authority.workspacePlan.dependencyResourceInstanceDigest) return null;
      for (const [volumeName, expected] of [
        [authority.workspaceVolumeName, workspaceAuthority],
        [authority.dependencyVolumeName, dependencyAuthority],
      ] as const) {
        const beforeGeneration = await inspectExactVolumeGeneration(volumeName, expected);
        if (!beforeGeneration) return null;
        const observed = await run(Object.freeze({
          command: 'docker' as const,
          args: Object.freeze(['ps', '-q', '--filter', `volume=${volumeName}`]),
          stdin: Buffer.alloc(0), timeoutMs: 10_000,
          stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
        }));
        if (!exactDockerWorkspaceCommandSucceeded(observed)
          || exactDockerWorkspaceCommandStdout(observed).trim() !== '') return null;
        const afterGeneration = await inspectExactVolumeGeneration(volumeName, expected);
        if (!afterGeneration || beforeGeneration.createdAt !== afterGeneration.createdAt) {
          return null;
        }
      }
      return createExecutionEffectDockerExclusiveAttachmentReceiptV1({
        phase: authority.phase,
        authorityDigest: authority.authorityDigest,
        workspaceVolumeName: authority.workspaceVolumeName,
        workspaceVolumeIdentityDigest: authority.workspaceVolumeIdentityDigest,
        dependencyVolumeName: authority.dependencyVolumeName,
        dependencyVolumeIdentityDigest: authority.dependencyVolumeIdentityDigest,
        observedAt: exactDockerEffectTimestamp(now),
      });
    },
    async inspectVolume(authority) {
      const observedAt = exactDockerEffectTimestamp(now);
      const result = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['volume', 'inspect', authority.plan.volumeName]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      if (authority.phase === 'EXPECT_ABSENT') {
        return isExactDockerVolumeAbsent(
          exactDockerWorkspaceCommandObservation(result), authority.plan.volumeName,
        ) ? createExecutionEffectDockerVolumeObservationV1({
          state: 'ABSENT', authorityDigest: authority.authorityDigest,
          volumeName: authority.plan.volumeName,
          resourceInstanceDigest: authority.plan.workspaceResourceInstanceDigest,
          observedAt,
        }) : null;
      }
      const inspected = exactDockerWorkspaceCommandSucceeded(result)
        ? parseExactDockerWorkspaceVolumeInspect(exactDockerWorkspaceCommandStdout(result)) : null;
      if (!inspected || !verifyExactDockerWorkspaceVolumeInspect(inspected, {
        name: authority.plan.volumeName,
        labels: authority.plan.workspaceLabels,
        canonicalProjectRoot,
      })) return null;
      const volumeIdentityDigest = exactDockerEffectVolumeIdentity(inspected, {
        labelsDigest: authority.plan.workspaceLabelsDigest as Sha256Digest,
        resourceInstanceDigest: authority.plan.workspaceResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: authority.plan.mountPlanDigest as Sha256Digest,
      });
      return createExecutionEffectDockerVolumeObservationV1({
        state: 'PRESENT', authorityDigest: authority.authorityDigest,
        volumeName: authority.plan.volumeName, driver: 'local', scope: 'local',
        labelsDigest: authority.plan.workspaceLabelsDigest,
        resourceInstanceDigest: authority.plan.workspaceResourceInstanceDigest,
        mountPlanDigest: authority.plan.mountPlanDigest,
        volumeIdentityDigest, daemonCreatedAt: inspected.createdAt, observedAt,
      });
    },
    async createVolume(authority) {
      const createRequestedAt = exactDockerEffectTimestamp(now);
      const created = await run(Object.freeze({
        command: 'docker' as const,
        args: buildExactDockerWorkspaceVolumeCreateArgs(
          authority.plan.volumeName,
          authority.plan.workspaceLabels,
        ),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 1024, stderrCeiling: 64 * 1024,
      }));
      if (!exactDockerWorkspaceCommandSucceeded(created)
        || exactDockerWorkspaceCommandStdout(created).trim() !== authority.plan.volumeName) return null;
      const inspected = await inspectVolume(authority.plan.volumeName);
      if (!inspected || !verifyExactDockerWorkspaceVolumeInspect(inspected, {
        name: authority.plan.volumeName,
        labels: authority.plan.workspaceLabels,
        canonicalProjectRoot,
      })) return null;
      const volumeIdentityDigest = exactDockerEffectVolumeIdentity(inspected, {
        labelsDigest: authority.plan.workspaceLabelsDigest as Sha256Digest,
        resourceInstanceDigest: authority.plan.workspaceResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: authority.plan.mountPlanDigest as Sha256Digest,
      });
      const createCompletedAt = exactDockerEffectTimestamp(now);
      return createExecutionEffectDockerVolumeCreationReceiptV1({
        authorityDigest: authority.authorityDigest,
        absenceObservationDigest: authority.absenceObservationDigest,
        volumeName: authority.plan.volumeName,
        labelsDigest: authority.plan.workspaceLabelsDigest,
        resourceInstanceDigest: authority.plan.workspaceResourceInstanceDigest,
        mountPlanDigest: authority.plan.mountPlanDigest,
        volumeIdentityDigest,
        createRequestedAt,
        createCompletedAt,
        daemonCreatedAt: inspected.createdAt,
      });
    },
    async populateWorkspace(authority) {
      const result = await runCapture(authority, 'POPULATION_BASELINE', true);
      const populationManifest = result.populationManifest;
      if (!populationManifest) return null;
      return Object.freeze({
        populationReceipt: createExecutionEffectDockerPopulationReceiptV1({
          authorityDigest: authority.authorityDigest,
          volumeName: authority.plan.volumeName,
          volumeIdentityDigest: authority.volumeIdentityDigest,
          inventoryDigest: authority.plan.inventoryDigest,
          inventoryAdmissionReceiptDigest: authority.plan.inventoryAdmissionReceiptDigest,
          dependencyPlanDigest: authority.plan.dependencyPlanDigest,
          dependencyAuthorityReceiptDigest: authority.dependencyAuthorityReceiptDigest,
          rejectedPathCount: 0,
          rejectedPathsDigest: authority.plan.inventoryRejectedPathsDigest,
          captureReceiptDigest: result.capture.receipt.receiptDigest,
          populatedPathCount: authority.plan.inventoryPathCount,
          ...populationManifest,
          completedAt: result.capture.completedAt,
        }),
        capture: result.capture,
      });
    },
    async captureWorkspace(authority) {
      return (await runCapture(authority, authority.operation, false)).capture;
    },
  };
  return Object.freeze(adapter);
}

interface ExactDockerEffectPreparedJournalV1 {
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly operations: readonly ExecutionEffectLandingOperationV1[];
  readonly recordDigest: ExecutionEffectPersistenceDigest;
}

interface ExactDockerEffectStepJournalV1 {
  readonly index: number;
  readonly operationDigest: ExecutionEffectPersistenceDigest;
  readonly nativeReceipt: ExecutionEffectLandingNativeMutationReceiptV1;
  readonly recordDigest: ExecutionEffectPersistenceDigest;
}

interface ExactDockerEffectCommittedJournalV1 {
  readonly disposition: 'COMMITTED' | 'COMMITTED_NO_CHANGE';
  readonly transaction: ExecutionEffectLandingTransactionRefV1;
  readonly preparedJournalDigest: ExecutionEffectPersistenceDigest;
  readonly applyingJournalDigest: ExecutionEffectPersistenceDigest | null;
  readonly operationReceiptDigests: readonly ExecutionEffectPersistenceDigest[];
  readonly finalVerificationReceipt: ExecutionEffectLandingFinalVerificationReceiptV1 | null;
  readonly committedAt: string;
  readonly recordDigest: ExecutionEffectPersistenceDigest;
}

function exactDockerEffectJournalKey(
  transactionDigest: ExecutionEffectPersistenceDigest,
  phase: 'prepared' | 'applying' | 'committed' | `step-${string}`,
): string {
  return `effect-landing/${transactionDigest.slice(7)}/${phase}.json`;
}

function readExactDockerEffectJournalRecord(
  adapter: ExecutionEffectStoreAdapterV1,
  key: string,
): Readonly<Record<string, unknown>> | null {
  const artifact = adapter.journal.readImmutable(key);
  if (!artifact || artifact.key !== key
    || artifact.byteLength !== artifact.bytes.byteLength
    || artifact.contentDigest !== exactCustodyDigest(artifact.bytes)) return null;
  let value: unknown;
  try { value = JSON.parse(Buffer.from(artifact.bytes).toString('utf8')); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value) || nodeTypes.isProxy(value)
    || !isExactDigest(Reflect.get(value, 'recordDigest'))) return null;
  return value as Readonly<Record<string, unknown>>;
}

function persistenceOperationFromExactDockerJournal(
  operation: ExecutionEffectLandingOperationV1,
  receipt: ExecutionEffectLandingNativeMutationReceiptV1,
): ExecutionEffectPersistenceOperationV1 {
  if (operation.operationDigest !== receipt.operationDigest) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  return createExecutionEffectPersistenceOperationV1({
    index: operation.index,
    kind: operation.kind,
    path: operation.path,
    effectDigests: operation.effectDigests as readonly ExecutionEffectPersistenceDigest[],
    derivedParent: operation.derivedParent,
    stagedSource: operation.stagedSource as ExecutionEffectPersistenceOperationV1['stagedSource'],
    entryPreimages:
      operation.entryPreimages as ExecutionEffectPersistenceOperationV1['entryPreimages'],
    entryPostimages:
      operation.entryPostimages as ExecutionEffectPersistenceOperationV1['entryPostimages'],
    parentAuthorities:
      operation.parentAuthorities as ExecutionEffectPersistenceOperationV1['parentAuthorities'],
    nativeReceiptDigest: receipt.receiptDigest as ExecutionEffectPersistenceDigest,
    durabilityEvidenceDigest: receipt.durabilityEvidenceDigest as ExecutionEffectPersistenceDigest,
  });
}

function createExactDockerEffectTerminalSeal(input: Readonly<{
  readonly scope: PreparedExactDockerCustodyScope;
  readonly captured: ExactDockerEffectReadyAuthorityV1;
  readonly storeAdapter: ExecutionEffectStoreAdapterV1;
  readonly receipt: ExecutionEffectLandingReceiptV1;
  readonly projectRoot: string;
}>): ExecutionEffectLandingTerminalSealV1 {
  const transaction = input.receipt.transaction;
  const preparedKey = exactDockerEffectJournalKey(transaction.transactionDigest, 'prepared');
  const committedKey = exactDockerEffectJournalKey(transaction.transactionDigest, 'committed');
  const preparedRaw = readExactDockerEffectJournalRecord(input.storeAdapter, preparedKey);
  const committedRaw = readExactDockerEffectJournalRecord(input.storeAdapter, committedKey);
  if (!preparedRaw || !committedRaw
    || preparedRaw.kind !== 'execution-effect-landing-prepared'
    || preparedRaw.phase !== 'PREPARED'
    || committedRaw.kind !== 'execution-effect-landing-committed'
    || committedRaw.phase !== 'COMMITTED'
    || canonicalJson(preparedRaw.transaction) !== canonicalJson(transaction)
    || canonicalJson(committedRaw.transaction) !== canonicalJson(transaction)
    || committedRaw.recordDigest !== input.receipt.committedJournalDigest
    || !Array.isArray(preparedRaw.operations)
    || committedRaw.disposition !== input.receipt.state
    || !Array.isArray(committedRaw.operationReceiptDigests)
    || canonicalJson(committedRaw.operationReceiptDigests)
      !== canonicalJson(input.receipt.operationReceiptDigests)) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const prepared = preparedRaw as unknown as ExactDockerEffectPreparedJournalV1;
  const committed = committedRaw as unknown as ExactDockerEffectCommittedJournalV1;
  if (!isExactDigest(prepared.recordDigest)
    || committed.preparedJournalDigest !== prepared.recordDigest
    || !isExactDigest(committed.recordDigest)
    || !Number.isFinite(Date.parse(committed.committedAt))
    || committed.transaction.transactionDigest !== transaction.transactionDigest
    || prepared.operations.length !== input.receipt.operationReceiptDigests.length) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const preparedRef = input.storeAdapter.readJournalReference(preparedKey, prepared.recordDigest);
  const committedRef = input.storeAdapter.readJournalReference(committedKey, committed.recordDigest);
  if (!preparedRef || !committedRef) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const stepRecords: ExactDockerEffectStepJournalV1[] = [];
  const stepRefs = [] as NonNullable<ExecutionEffectLandingTerminalSealV1['journalArtifacts']['steps']>[number][];
  for (let index = 0; index < prepared.operations.length; index += 1) {
    const key = exactDockerEffectJournalKey(
      transaction.transactionDigest,
      `step-${String(index).padStart(7, '0')}`,
    );
    const raw = readExactDockerEffectJournalRecord(input.storeAdapter, key);
    if (!raw || raw.kind !== 'execution-effect-landing-step' || raw.phase !== 'STEP'
      || raw.index !== index || !isExactDigest(raw.recordDigest)
      || !isExactDigest(raw.operationDigest) || !raw.nativeReceipt
      || typeof raw.nativeReceipt !== 'object') {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    const record = raw as unknown as ExactDockerEffectStepJournalV1;
    if (record.operationDigest !== prepared.operations[index]?.operationDigest
      || record.nativeReceipt.receiptDigest !== input.receipt.operationReceiptDigests[index]) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    const ref = input.storeAdapter.readJournalReference(key, record.recordDigest);
    if (!ref) throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    stepRecords.push(record);
    stepRefs.push(ref);
  }
  let applyingRef: ExecutionEffectLandingTerminalSealV1['journalArtifacts']['applying'] = null;
  if (prepared.operations.length > 0) {
    const applyingKey = exactDockerEffectJournalKey(transaction.transactionDigest, 'applying');
    const applyingRaw = readExactDockerEffectJournalRecord(input.storeAdapter, applyingKey);
    if (!applyingRaw || applyingRaw.kind !== 'execution-effect-landing-applying'
      || applyingRaw.phase !== 'APPLYING' || !isExactDigest(applyingRaw.recordDigest)
      || applyingRaw.recordDigest !== committed.applyingJournalDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    applyingRef = input.storeAdapter.readJournalReference(
      applyingKey,
      applyingRaw.recordDigest as ExecutionEffectPersistenceDigest,
    );
    if (!applyingRef) throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  } else if (committed.applyingJournalDigest !== null) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const operations = prepared.operations.map((operation, index) => (
    persistenceOperationFromExactDockerJournal(operation, stepRecords[index]!.nativeReceipt)
  ));
  const nativeEvidence = operations.map((operation, index) => (
    createExecutionEffectLandingNativeReceiptEvidenceV1({
      operation,
      entryPostimages: stepRecords[index]!.nativeReceipt.entryPostimages as Parameters<
        typeof createExecutionEffectLandingNativeReceiptEvidenceV1
      >[0]['entryPostimages'],
      durabilityEvidenceDigest: stepRecords[index]!.nativeReceipt
        .durabilityEvidenceDigest as ExecutionEffectPersistenceDigest,
    })
  ));
  const nativeReceiptRefs = nativeEvidence.map((evidence, index) => (
    input.storeAdapter.publishNativeReceiptEvidence({
      artifactKey: `effect-native-${transaction.transactionDigest.slice(7, 31)}-${index.toString(36)}`,
      capturedAt: committed.committedAt,
      operation: operations[index]!,
      evidence,
    })
  ));
  let finalEvidenceRef: ExecutionEffectLandingTerminalSealV1['receiptArtifacts']['finalVerificationReceipt'] = null;
  if (operations.length > 0) {
    const finalReceipt = committed.finalVerificationReceipt;
    if (!finalReceipt || finalReceipt.receiptDigest !== input.receipt.finalVerificationReceiptDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    const evidence = createExecutionEffectLandingFinalReceiptEvidenceV1({
      transactionDigest: transaction.transactionDigest as ExecutionEffectPersistenceDigest,
      planDigest: transaction.planDigest as ExecutionEffectPersistenceDigest,
      operations,
      nativeReceipts: nativeEvidence,
      durabilityEvidenceDigest: finalReceipt.durabilityEvidenceDigest as ExecutionEffectPersistenceDigest,
    });
    if (evidence.receiptDigest !== finalReceipt.receiptDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
    }
    finalEvidenceRef = input.storeAdapter.publishFinalReceiptEvidence({
      artifactKey: `effect-final-${transaction.transactionDigest.slice(7, 39)}`,
      capturedAt: committed.committedAt,
      transactionDigest: transaction.transactionDigest as ExecutionEffectPersistenceDigest,
      planDigest: transaction.planDigest as ExecutionEffectPersistenceDigest,
      operations,
      nativeReceipts: nativeEvidence,
      evidence,
    });
  } else if (committed.finalVerificationReceipt !== null
    || input.receipt.finalVerificationReceiptDigest !== null) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const boundaryId = executionEffectLandingDeterministicBoundaryIdV1(
    transaction.transactionDigest as ExecutionEffectPersistenceDigest,
  );
  const terminalEvent = readCompletedExecutionLockBoundary(input.projectRoot, boundaryId);
  if (!terminalEvent || terminalEvent.action !== 'completed'
    || !('evidenceRefs' in terminalEvent.payload)
    || terminalEvent.quarantineId !== boundaryId
    || terminalEvent.payload.quarantineId !== boundaryId) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const leaseTerminal = input.receipt.state === 'COMMITTED'
    ? 'COMPLETED' as const : 'RELEASED_NO_CHANGE' as const;
  const leaseEvidence = createExecutionEffectLandingLeaseTerminalReceiptEvidenceV1({
    transactionDigest: transaction.transactionDigest as ExecutionEffectPersistenceDigest,
    terminal: leaseTerminal,
    committedJournalDigest: committed.recordDigest,
    eventId: terminalEvent.eventId,
    quarantineId: terminalEvent.quarantineId,
    fencingToken: terminalEvent.fencingToken,
    occurredAt: terminalEvent.occurredAt,
    evidenceRefs: Object.freeze([...terminalEvent.payload.evidenceRefs].sort((left, right) => (
      left < right ? -1 : left > right ? 1 : 0
    ))),
  });
  if (leaseEvidence.terminalReceiptDigest !== input.receipt.leaseTerminalReceiptDigest) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const leaseEvidenceRef = input.storeAdapter.publishLeaseTerminalReceiptEvidence({
    artifactKey: `effect-lease-${transaction.transactionDigest.slice(7, 39)}`,
    capturedAt: terminalEvent.occurredAt,
    evidence: leaseEvidence,
  });
  return createExecutionEffectLandingTerminalSealV1({
    attempt: input.captured.workspaceSnapshot.attempt,
    attemptDigest: input.captured.workspaceSnapshot.attemptDigest as ExecutionEffectPersistenceDigest,
    disposition: input.receipt.state,
    workspaceSnapshotSealDigest: input.captured.workspaceSnapshot.sealDigest as ExecutionEffectPersistenceDigest,
    baselineManifestDigest: input.captured.baselineManifest.digest as ExecutionEffectPersistenceDigest,
    finalManifestDigest: input.captured.finalManifest.digest as ExecutionEffectPersistenceDigest,
    effectDecisionDigest: input.captured.decision.decisionDigest as ExecutionEffectPersistenceDigest,
    planId: transaction.planId,
    operations,
    preparedJournalDigest: prepared.recordDigest,
    applyingJournalDigest: committed.applyingJournalDigest,
    stepJournalDigests: Object.freeze(stepRecords.map(record => record.recordDigest)),
    committedJournalDigest: committed.recordDigest,
    finalVerificationReceiptDigest: input.receipt.finalVerificationReceiptDigest,
    journalArtifacts: Object.freeze({
      prepared: preparedRef,
      applying: applyingRef,
      steps: Object.freeze(stepRefs),
      committed: committedRef,
    }),
    receiptArtifacts: Object.freeze({
      nativeReceipts: Object.freeze(nativeReceiptRefs),
      finalVerificationReceipt: finalEvidenceRef,
      leaseTerminalReceipt: leaseEvidenceRef,
    }),
    leaseTerminal,
    leaseTerminalReceiptDigest: input.receipt.leaseTerminalReceiptDigest,
    committedAt: committed.committedAt,
  });
}

function createExactDockerEffectLandingRecoveryContext(input: Readonly<{
  readonly receipt: ExecutionEffectLandingReceiptV1;
  readonly terminalSeal: ExecutionEffectLandingTerminalSealV1;
  readonly storeAdapter: ExecutionEffectStoreAdapterV1;
}>): ExecutionEffectLandingLeaseResumeContextV1 {
  const transaction = input.receipt.transaction;
  const preparedRaw = readExactDockerEffectJournalRecord(
    input.storeAdapter,
    input.terminalSeal.journalArtifacts.prepared.artifactKey,
  );
  const committedRaw = readExactDockerEffectJournalRecord(
    input.storeAdapter,
    input.terminalSeal.journalArtifacts.committed.artifactKey,
  );
  const applyingRaw = input.terminalSeal.journalArtifacts.applying
    ? readExactDockerEffectJournalRecord(
      input.storeAdapter,
      input.terminalSeal.journalArtifacts.applying.artifactKey,
    ) : null;
  if (!preparedRaw || !committedRaw
    || preparedRaw.recordDigest !== input.terminalSeal.preparedJournalDigest
    || committedRaw.recordDigest !== input.terminalSeal.committedJournalDigest
    || (input.receipt.state === 'COMMITTED') !== (applyingRaw !== null)
    || (applyingRaw && applyingRaw.recordDigest !== input.terminalSeal.applyingJournalDigest)) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_INVALID', true);
  }
  const journalRef = (
    phase: 'PREPARED' | 'APPLYING' | 'COMMITTED',
    artifact: ExecutionEffectLandingTerminalSealV1['journalArtifacts']['prepared'],
    recordDigest: ExecutionEffectPersistenceDigest,
  ) => Object.freeze({
    phase,
    artifactKey: artifact.artifactKey,
    artifactReceiptDigest: artifact.artifactReceiptDigest,
    contentDigest: artifact.contentDigest,
    byteLength: artifact.byteLength,
    recordDigest,
  });
  const applyingArtifact = input.terminalSeal.journalArtifacts.applying;
  return createExecutionEffectLandingLeaseResumeContextV1({
    transaction,
    priorLease: preparedRaw.acquiredLease as ExecutionEffectLandingLeaseV1,
    prepared: journalRef(
      'PREPARED',
      input.terminalSeal.journalArtifacts.prepared,
      input.terminalSeal.preparedJournalDigest,
    ),
    applying: applyingArtifact && applyingRaw
      ? Object.freeze({
        journal: journalRef(
          'APPLYING', applyingArtifact,
          input.terminalSeal.applyingJournalDigest as ExecutionEffectPersistenceDigest,
        ),
        previousBoundary: applyingRaw.boundary as ExecutionEffectLandingBoundaryV1,
      }) : null,
    committed: Object.freeze({
      journal: journalRef(
        'COMMITTED',
        input.terminalSeal.journalArtifacts.committed,
        input.terminalSeal.committedJournalDigest,
      ),
      disposition: input.receipt.state,
    }),
  });
}

interface ExactDockerProviderInvocation {
  readonly binary: string;
  readonly args: readonly string[];
  readonly promptFeed: 'stdin' | 'inline' | 'argument';
}

const EXACT_DOCKER_INLINE_PROMPT_SENTINEL = '{DECKENT_EXACT_PROMPT_CONTENT}';

/** Array-native provider invocation; no shell reparse or public prompt file authority. */
export function buildExactDockerProviderInvocation(
  spec: ProviderCommandSpec,
  apiId: string,
  options: Readonly<{
    allowedTools?: string;
    availableTools?: string;
    isolatedContext?: boolean;
    reasoningEffort?: string;
    excludeDynamicPromptSections?: boolean;
    systemPromptCorePresent?: boolean;
    codexCoreChannel?: boolean;
    codexSuppressProjectDoc?: boolean;
  }> = {},
): ExactDockerProviderInvocation {
  const baseArgs = spec.binary === 'claude'
    ? claudeStreamJsonBaseArgs(spec.baseArgs)
    : [...spec.baseArgs];
  const corePath = '/run/deckent/system-core.md';
  const coreArgs = options.systemPromptCorePresent
    ? spec.binary === 'claude'
      ? ['--system-prompt-file', corePath, '--disable-slash-commands']
      : options.codexCoreChannel && spec.systemPromptCoreArgs
        ? spec.systemPromptCoreArgs(corePath)
        : []
    : [];
  const args = [
    ...coreArgs,
    ...(spec.binary === 'codex' && options.codexSuppressProjectDoc
      ? spec.contextSuppressionArgs ?? []
      : []),
    ...baseArgs.map(arg => arg === PROMPT_CAT_TOKEN
      ? EXACT_DOCKER_INLINE_PROMPT_SENTINEL
      : arg),
    spec.modelFlag,
    apiId,
  ];
  if (spec.allowedToolsFlag && options.allowedTools) {
    args.push(spec.allowedToolsFlag, options.allowedTools);
  }
  if (spec.availableToolsFlag && options.availableTools) {
    args.push(spec.availableToolsFlag, options.availableTools);
  }
  if (options.isolatedContext) args.push(...spec.isolatedContextArgs);
  args.push(...spec.approvalArgs);
  if (options.reasoningEffort && spec.reasoningEffortArgs) {
    args.push(...spec.reasoningEffortArgs(options.reasoningEffort));
  }
  if (options.excludeDynamicPromptSections && spec.excludeDynamicPromptSectionsFlag) {
    args.push(spec.excludeDynamicPromptSectionsFlag);
  }
  if (spec.promptFeed === 'argument') {
    args.push('--', EXACT_DOCKER_INLINE_PROMPT_SENTINEL);
  }
  return Object.freeze({
    binary: spec.binary,
    args: Object.freeze(args),
    promptFeed: spec.promptFeed,
  });
}

export function buildExactDockerRunnerSource(input: Readonly<{
  taskId: string;
  model: string;
  provider: string;
  invocation: ExactDockerProviderInvocation;
  timeoutSeconds: number;
  authBootstrapLines: readonly string[];
  authWritebackLines: readonly string[];
}>): string {
  const config = JSON.stringify(input);
  return String.raw`
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
const config = Object.freeze(${config});
const outputRoot = '/workspace/.tasks';
const resultPath = outputRoot + '/task-' + config.taskId + '.result';
const partialPath = outputRoot + '/task-' + config.taskId + '.partial-result';
const timeoutPath = outputRoot + '/task-' + config.taskId + '.timeout';
const heartbeatPath = outputRoot + '/task-' + config.taskId + '.hb';
const SHELL_PHASE_OUTPUT_MAX_BYTES = 1024 * 1024;
const SHELL_PHASE_TIMEOUT_MS = Math.min(60_000, config.timeoutSeconds * 1000);
const shellPhase = lines => new Promise(resolve => {
  if (!Array.isArray(lines) || lines.length === 0) { resolve(true); return; }
  let child;
  let settled = false;
  let forcedFailure = false;
  let outputBytes = 0;
  let phaseTimeout;
  const finish = ok => {
    if (settled) return;
    settled = true;
    if (phaseTimeout) clearTimeout(phaseTimeout);
    resolve(ok);
  };
  const observe = (stream, destination) => stream?.on('data', chunk => {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    outputBytes += bytes.byteLength;
    if (!Number.isSafeInteger(outputBytes) || outputBytes > SHELL_PHASE_OUTPUT_MAX_BYTES) {
      forcedFailure = true;
      try { child.kill('SIGKILL'); } catch { finish(false); }
      return;
    }
    destination.write(bytes);
  });
  try {
    child = spawn('sh', ['-c', lines.join('\n')], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch { finish(false); return; }
  observe(child.stdout, process.stdout);
  observe(child.stderr, process.stderr);
  child.once('error', () => finish(false));
  child.once('close', (code, signal) => finish(
    forcedFailure === false && code === 0 && signal === null,
  ));
  phaseTimeout = setTimeout(() => {
    forcedFailure = true;
    try { child.kill('SIGKILL'); } catch { finish(false); }
  }, SHELL_PHASE_TIMEOUT_MS);
});
if (!await shellPhase(config.authBootstrapLines)) process.exit(78);
const prompt = readFileSync('/run/deckent/prompt.txt', 'utf8');
const args = config.invocation.args.map(arg => arg === ${JSON.stringify(EXACT_DOCKER_INLINE_PROMPT_SENTINEL)} ? prompt : arg);
const partial = { taskId: config.taskId, selfAssessment: 'NO_GO', partialMarker: true,
  notes: 'EXACT_DOCKER_PROVIDER_STARTED_WITHOUT_TERMINAL_RESULT',
  tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    provider: config.provider, model: config.model } };
writeFileSync(partialPath, JSON.stringify(partial) + '\n', { flag: 'wx', mode: 0o600 });
let sequence = 0;
const heartbeat = () => writeFileSync(heartbeatPath, JSON.stringify({
  schemaVersion: 1, taskId: config.taskId, status: 'working', sequence: ++sequence,
  timestamp: new Date().toISOString(), currentAction: 'exact-provider-execution',
}) + '\n', { mode: 0o600 });
heartbeat();
const timer = setInterval(heartbeat, 15_000);
const child = spawn(config.invocation.binary, args, {
  cwd: '/workspace', env: process.env, stdio: [config.invocation.promptFeed === 'stdin' ? 'pipe' : 'ignore', 'inherit', 'inherit'],
});
if (config.invocation.promptFeed === 'stdin') child.stdin.end(prompt);
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, config.timeoutSeconds * 1000);
const forward = signal => { try { child.kill(signal); } catch {} };
process.on('SIGTERM', () => forward('SIGTERM'));
process.on('SIGINT', () => forward('SIGINT'));
child.on('error', () => process.exit(79));
child.on('exit', async (code, signal) => {
  clearInterval(timer); clearTimeout(timeout);
  if (!await shellPhase(config.authWritebackLines)) code = 78;
  if (timedOut) writeFileSync(timeoutPath, 'WORKER_TIMEOUT\n', { flag: 'wx', mode: 0o600 });
  if (!existsSync(resultPath)) {
    const marker = { taskId: config.taskId, workerId: 'docker-' + config.taskId,
      filesChanged: [], linesAdded: 0, linesRemoved: 0, testsPassed: false,
      selfAssessment: 'NO_GO', markerType: timedOut ? 'WORKER_TIMEOUT' : 'EXIT_WITHOUT_RESULT',
      exitCode: code ?? (signal ? 128 : 79), notes: timedOut
        ? 'EXACT_DOCKER_PROVIDER_TIMEOUT'
        : 'EXACT_DOCKER_PROVIDER_EXITED_WITHOUT_RESULT',
      tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
        provider: config.provider, model: config.model } };
    writeFileSync(resultPath, JSON.stringify(marker) + '\n', { flag: 'wx', mode: 0o600 });
  }
  try { unlinkSync(partialPath); } catch {}
  process.exit(signal ? 128 : (code ?? 79));
});
`;
}

/** Host-global, project-namespaced state; never below the worker-mounted project. */
export function resolveExactDockerCustodyRoot(
  projectRoot: string,
  options: Readonly<{
    platform?: NodeJS.Platform;
    env?: NodeJS.ProcessEnv;
    stateDir?: string;
  }> = {},
): string {
  const canonicalRoot = canonicalExactDockerProjectRoot(projectRoot);
  const projectDigest = createHash('sha256').update(canonicalRoot).digest('hex');
  const env = options.env ?? process.env;
  const stateDir = options.stateDir ?? resolveGlobalScopePaths(
    normalizeGlobalScopePlatform(options.platform ?? process.platform, env),
    env,
  ).stateDir;
  return join(stateDir, 'runtime', EXACT_DOCKER_CUSTODY_STATE_DIR, projectDigest);
}

const EXACT_DOCKER_CUSTODY_LABELS = Object.freeze({
  managed: 'io.deckent.exact-custody.managed',
  rootId: 'io.deckent.exact-custody.root-id',
  scopeDigest: 'io.deckent.exact-custody.scope-digest',
  effectOpDigest: 'io.deckent.exact-custody.effect-op-digest',
  attemptId: 'io.deckent.exact-custody.attempt-id',
  generation: 'io.deckent.exact-custody.generation',
  releaseNonceSha256: 'io.deckent.exact-custody.release-nonce-sha256',
  providerInvocationDigest: 'io.deckent.exact-custody.provider-invocation-digest',
  pid1Sha256: 'io.deckent.exact-custody.pid1-sha256',
  workspaceVolume: 'io.deckent.exact-custody.workspace-volume',
  dependencyVolume: 'io.deckent.exact-custody.dependency-volume',
  preparedWorkspace: 'io.deckent.exact-custody.prepared-workspace-authority',
  workspaceResourceInstance: 'io.deckent.exact-custody.workspace-resource-instance',
  dependencyResourceInstance: 'io.deckent.exact-custody.dependency-resource-instance',
} as const);

const EXACT_DOCKER_WORKSPACE_VOLUME_PREFIX = 'deckent-xw-';
const EXACT_DOCKER_DEPENDENCY_VOLUME_PREFIX = 'deckent-xd-';

/**
 * Daemon-global resource identity for one exact attempt. The name contains no
 * project path and is reproducible after a host-process restart.
 */
export function exactDockerWorkspaceVolumeName(input: Readonly<{
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionRefDigest: Sha256Digest;
}>): string {
  if (!isExactDigest(input.admissionRefDigest)
    || input.identity.backend !== 'docker'
    || !Number.isSafeInteger(input.identity.generation)
    || input.identity.generation <= 0) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
  }
  const suffix = createHash('sha256').update(canonicalJson({
    projectRootSha256: input.identity.projectRootSha256,
    projectId: input.identity.projectId,
    taskId: input.identity.taskId,
    attemptId: input.identity.attemptId,
    generation: input.identity.generation,
    admissionRefDigest: input.admissionRefDigest,
  })).digest('hex').slice(0, 48);
  return `${EXACT_DOCKER_WORKSPACE_VOLUME_PREFIX}${suffix}`;
}

/** Attempt-private image-owned dependency authority; never a host-path projection. */
export function exactDockerDependencyVolumeName(input: Readonly<{
  readonly identity: TaskAttemptCustodyIdentityV2;
  readonly admissionRefDigest: Sha256Digest;
}>): string {
  if (!isExactDigest(input.admissionRefDigest)
    || input.identity.backend !== 'docker'
    || !Number.isSafeInteger(input.identity.generation)
    || input.identity.generation <= 0) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
  }
  const suffix = createHash('sha256').update(canonicalJson({
    resource: 'image-owned-node-modules',
    projectRootSha256: input.identity.projectRootSha256,
    projectId: input.identity.projectId,
    taskId: input.identity.taskId,
    attemptId: input.identity.attemptId,
    generation: input.identity.generation,
    admissionRefDigest: input.admissionRefDigest,
  })).digest('hex').slice(0, 48);
  return `${EXACT_DOCKER_DEPENDENCY_VOLUME_PREFIX}${suffix}`;
}

function exactDockerCustodyAuthorityLabels(
  input: TaskAttemptCustodyPosixMountConsumerInput,
  launch: ExactDockerCustodyLaunchContext,
): Readonly<Record<string, string>> {
  return Object.freeze({
    [EXACT_DOCKER_CUSTODY_LABELS.managed]: 'true',
    [EXACT_DOCKER_CUSTODY_LABELS.rootId]: input.rootId,
    [EXACT_DOCKER_CUSTODY_LABELS.scopeDigest]: input.scopeDigest,
    [EXACT_DOCKER_CUSTODY_LABELS.effectOpDigest]: input.effectOpDigest,
    [EXACT_DOCKER_CUSTODY_LABELS.attemptId]: input.attemptId,
    [EXACT_DOCKER_CUSTODY_LABELS.generation]: String(input.generation),
    [EXACT_DOCKER_CUSTODY_LABELS.releaseNonceSha256]: launch.releaseCommitTokenSha256,
    [EXACT_DOCKER_CUSTODY_LABELS.providerInvocationDigest]: launch.providerInvocationDigest,
    [EXACT_DOCKER_CUSTODY_LABELS.pid1Sha256]: exactCustodyDigest(EXACT_DOCKER_PID1_SOURCE),
    [EXACT_DOCKER_CUSTODY_LABELS.workspaceVolume]: launch.workspaceVolumeName,
    [EXACT_DOCKER_CUSTODY_LABELS.dependencyVolume]: launch.dependencyVolumeName,
    [EXACT_DOCKER_CUSTODY_LABELS.preparedWorkspace]:
      launch.effect.preparedWorkspace.authorityDigest,
    [EXACT_DOCKER_CUSTODY_LABELS.workspaceResourceInstance]:
      launch.effect.prepared.workspacePlan.workspaceResourceInstanceDigest,
    [EXACT_DOCKER_CUSTODY_LABELS.dependencyResourceInstance]:
      launch.effect.prepared.workspacePlan.dependencyResourceInstanceDigest,
  });
}

/** Source paths enter and leave only inside the adapter callback. */
export function buildExactDockerCustodyMountArgs(
  input: TaskAttemptCustodyPosixMountConsumerInput,
  workspaceVolumeName: string,
  dependencyVolumeName: string,
): readonly string[] {
  if (!/^deckent-xw-[a-f0-9]{48}$/u.test(workspaceVolumeName)
    || !/^deckent-xd-[a-f0-9]{48}$/u.test(dependencyVolumeName)) {
    throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
  }
  return Object.freeze([
    '--mount',
    `type=volume,src=${workspaceVolumeName},dst=${CONTAINER_WORKSPACE},volume-nocopy`,
    '--mount',
    `type=volume,src=${dependencyVolumeName},dst=${CONTAINER_WORKSPACE}/node_modules,readonly,volume-nocopy`,
    '--mount',
    `type=bind,src=${input.taskSnapshot.sourcePath},dst=${EXACT_DOCKER_TASK_SNAPSHOT_PATH},readonly,bind-propagation=rprivate`,
    '--mount',
    `type=bind,src=${input.workerOutput.sourcePath},dst=${EXACT_DOCKER_WORKER_OUTPUT_PATH},bind-propagation=rprivate`,
  ]);
}

interface ExactDockerInspectProjection {
  readonly containerId: string;
  readonly imageDigest: Sha256Digest;
  readonly labels: Readonly<Record<string, string>>;
  readonly workspaceMount: Readonly<{
    name: string | null;
    source: string;
    destination: string;
    rw: boolean;
    propagation: string;
    type: string;
  }>;
  readonly dependencyMount: Readonly<{
    name: string | null;
    source: string;
    destination: string;
    rw: boolean;
    propagation: string;
    type: string;
  }>;
  readonly taskMount: Readonly<{
    name: string | null;
    source: string;
    destination: string;
    rw: boolean;
    propagation: string;
    type: string;
  }>;
  readonly outputMount: Readonly<{
    name: string | null;
    source: string;
    destination: string;
    rw: boolean;
    propagation: string;
    type: string;
  }>;
  readonly mounts: readonly Readonly<{
    name: string | null;
    source: string;
    destination: string;
    rw: boolean;
    propagation: string;
    type: string;
  }>[];
  readonly entrypoint: readonly string[];
  readonly command: readonly string[];
}

export function parseExactDockerCustodyInspect(
  raw: string,
): ExactDockerInspectProjection | null {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const row = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : null;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const config = record.Config as Record<string, unknown> | null;
  const mounts = Array.isArray(record.Mounts) ? record.Mounts : [];
  const taskMount = mounts.find(value => (
    value && typeof value === 'object'
      && (value as Record<string, unknown>).Destination === EXACT_DOCKER_TASK_SNAPSHOT_PATH
  )) as Record<string, unknown> | undefined;
  const outputMount = mounts.find(value => (
    value && typeof value === 'object'
      && (value as Record<string, unknown>).Destination === EXACT_DOCKER_WORKER_OUTPUT_PATH
  )) as Record<string, unknown> | undefined;
  const workspaceMount = mounts.find(value => (
    value && typeof value === 'object'
      && (value as Record<string, unknown>).Destination === CONTAINER_WORKSPACE
  )) as Record<string, unknown> | undefined;
  const dependencyMount = mounts.find(value => (
    value && typeof value === 'object'
      && (value as Record<string, unknown>).Destination === `${CONTAINER_WORKSPACE}/node_modules`
  )) as Record<string, unknown> | undefined;
  if (
    typeof record.Id !== 'string'
    || !/^[a-f0-9]{64}$/u.test(record.Id)
    || typeof record.Image !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(record.Image)
    || !config
    || !config.Labels
    || typeof config.Labels !== 'object'
    || !taskMount
    || !outputMount
    || !workspaceMount
    || !dependencyMount
    || !Array.isArray(config.Entrypoint)
    || !config.Entrypoint.every(value => typeof value === 'string')
    || !Array.isArray(config.Cmd)
    || !config.Cmd.every(value => typeof value === 'string')
  ) return null;
  const mountProjection = (mount: Record<string, unknown>) => ({
    name: typeof mount.Name === 'string' ? mount.Name : null,
    source: mount.Source,
    destination: mount.Destination,
    rw: mount.RW,
    propagation: mount.Propagation,
    type: mount.Type,
  });
  const allMounts = mounts.map(value => mountProjection(value as Record<string, unknown>));
  const task = mountProjection(taskMount);
  const output = mountProjection(outputMount);
  const workspace = mountProjection(workspaceMount);
  const dependency = mountProjection(dependencyMount);
  if (
    typeof task.source !== 'string'
    || typeof task.destination !== 'string'
    || typeof task.rw !== 'boolean'
    || typeof task.propagation !== 'string'
    || typeof task.type !== 'string'
    || typeof output.source !== 'string'
    || typeof output.destination !== 'string'
    || typeof output.rw !== 'boolean'
    || typeof output.propagation !== 'string'
    || typeof output.type !== 'string'
    || typeof workspace.source !== 'string'
    || typeof workspace.destination !== 'string'
    || typeof workspace.rw !== 'boolean'
    || typeof workspace.propagation !== 'string'
    || typeof workspace.type !== 'string'
    || typeof dependency.source !== 'string'
    || typeof dependency.destination !== 'string'
    || typeof dependency.rw !== 'boolean'
    || typeof dependency.propagation !== 'string'
    || typeof dependency.type !== 'string'
    || allMounts.some(mount => typeof mount.source !== 'string'
      || typeof mount.destination !== 'string'
      || typeof mount.rw !== 'boolean'
      || typeof mount.propagation !== 'string'
      || typeof mount.type !== 'string')
  ) return null;
  return Object.freeze({
    containerId: record.Id,
    imageDigest: record.Image as Sha256Digest,
    labels: Object.freeze({ ...(config.Labels as Record<string, string>) }),
    workspaceMount: Object.freeze(workspace as ExactDockerInspectProjection['workspaceMount']),
    dependencyMount: Object.freeze(
      dependency as ExactDockerInspectProjection['dependencyMount'],
    ),
    taskMount: Object.freeze(task as ExactDockerInspectProjection['taskMount']),
    outputMount: Object.freeze(output as ExactDockerInspectProjection['outputMount']),
    mounts: Object.freeze(allMounts.map(mount => Object.freeze({
      name: mount.name,
      source: mount.source as string,
      destination: mount.destination as string,
      rw: mount.rw as boolean,
      propagation: mount.propagation as string,
      type: mount.type as string,
    }))),
    entrypoint: Object.freeze([...(config.Entrypoint as string[])]),
    command: Object.freeze([...(config.Cmd as string[])]),
  });
}

function exactDockerMountAliasesCanonicalProject(
  mount: ExactDockerInspectProjection['mounts'][number],
  canonicalProjectRoot: string,
): boolean {
  if (mount.type !== 'bind') return false;
  let source: string;
  try { source = realpathSync.native(mount.source); } catch { return true; }
  const relativeSource = relative(canonicalProjectRoot, source);
  return relativeSource === ''
    || (relativeSource !== '..'
      && !relativeSource.startsWith(`..${sep}`)
      && !isAbsolute(relativeSource));
}

interface ExactDockerNativeProbeProjection {
  readonly taskIdentity: TaskAttemptCustodyPosixDockerMountObservation['taskSnapshotMount']['identity'];
  readonly outputIdentity: TaskAttemptCustodyPosixDockerMountObservation['workerOutputMount']['identity'];
  readonly taskContentDigest: Sha256Digest;
  readonly bootstrap: TaskAttemptCustodyPosixDockerMountObservation['bootstrap'];
}

export function parseExactDockerNativeProbe(
  raw: string,
): ExactDockerNativeProbeProjection | null {
  let value: unknown;
  try { value = JSON.parse(raw.trim()); } catch { return null; }
  if (!value || typeof value !== 'object' || nodeTypes.isProxy(value)) return null;
  const record = value as Record<string, unknown>;
  const snapshotIdentity = (
    candidate: unknown,
    expectedObjectType: 'REGULAR_FILE' | 'DIRECTORY',
  ): TaskAttemptCustodyPosixDockerMountObservation['taskSnapshotMount']['identity'] | null => {
    if (!candidate || typeof candidate !== 'object' || nodeTypes.isProxy(candidate)) return null;
    const identity = candidate as Record<string, unknown>;
    if (
      identity.platform !== 'linux'
      || identity.objectType !== expectedObjectType
      || !['dev', 'ino', 'mntId', 'fsMagic', 'ownerUid', 'mode', 'size', 'linkCount']
        .every(key => typeof identity[key] === 'string')
    ) return null;
    return Object.freeze({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-posix-mounted-identity' as const,
      platform: 'linux' as const,
      objectType: expectedObjectType,
      dev: identity.dev as string,
      ino: identity.ino as string,
      mntId: identity.mntId as string,
      fsMagic: identity.fsMagic as string,
      ownerUid: identity.ownerUid as string,
      mode: identity.mode as string,
      size: identity.size as string,
      linkCount: identity.linkCount as string,
    });
  };
  const taskIdentity = snapshotIdentity(record.taskIdentity, 'REGULAR_FILE');
  const outputIdentity = snapshotIdentity(record.outputIdentity, 'DIRECTORY');
  const bootstrap = record.bootstrap as Record<string, unknown> | null;
  if (
    !taskIdentity
    || !outputIdentity
    || typeof record.taskContentDigest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(record.taskContentDigest)
    || !bootstrap
    || typeof bootstrap.abiName !== 'string'
    || typeof bootstrap.abiVersion !== 'string'
    || typeof bootstrap.napiVersion !== 'number'
    || typeof bootstrap.handleAbi !== 'string'
    || typeof bootstrap.packageName !== 'string'
    || typeof bootstrap.packageVersion !== 'string'
    || bootstrap.platform !== 'linux'
    || typeof bootstrap.arch !== 'string'
    || typeof bootstrap.binarySha256 !== 'string'
    || !/^sha256:[a-f0-9]{64}$/u.test(bootstrap.binarySha256)
    || !Number.isSafeInteger(bootstrap.rootSeparationEvidenceBits)
  ) return null;
  return Object.freeze({
    taskIdentity,
    outputIdentity: outputIdentity as ExactDockerNativeProbeProjection['outputIdentity'],
    taskContentDigest: record.taskContentDigest as Sha256Digest,
    bootstrap: Object.freeze({
      abiName: bootstrap.abiName,
      abiVersion: bootstrap.abiVersion,
      napiVersion: bootstrap.napiVersion,
      handleAbi: bootstrap.handleAbi,
      packageName: bootstrap.packageName,
      packageVersion: bootstrap.packageVersion,
      platform: 'linux' as const,
      arch: bootstrap.arch,
      binarySha256: bootstrap.binarySha256 as Sha256Digest,
      rootSeparationEvidenceBits: bootstrap.rootSeparationEvidenceBits as number,
    }),
  });
}

/** Shared by the in-container producer and the host ingestion seam. */
export const PROVIDER_EXECUTION_OBSERVATION_DIR_NAME = 'provider-execution-observations';
const CONTAINER_PROVIDER_EXECUTION_OBSERVATION_DIR =
  `${CONTAINER_WORKSPACE}/${TASKS_DIR}/${PROVIDER_EXECUTION_OBSERVATION_DIR_NAME}`;
export const DOCKER_PROVIDER_EXECUTION_CLOSED_RETENTION_LIMIT = 256;

export interface DockerProviderExecutionObservationBinding {
  readonly executionId: string;
  /** Host-owned run identity; never sourced from the container. */
  readonly runId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly providerPrincipalDigest: string;
}

/**
 * Deterministic execution id for the exact Docker attempt. The spawn site and
 * the host ingestion seam derive it from the SAME settlement identity, so a
 * container-emitted observation can never be attributed to another attempt.
 */
export function dockerProviderExecutionId(input: {
  readonly projectRootSha256: string;
  readonly taskId: string;
  readonly attemptId: string;
}): string {
  return createHash('sha256').update(canonicalJson({
    backend: 'docker',
    projectRootSha256: input.projectRootSha256,
    taskId: input.taskId,
    attemptId: input.attemptId,
  })).digest('hex');
}

export interface DockerProviderPrincipalDigestInput {
  readonly provider: string;
  readonly authMode: 'api' | 'subscription';
  readonly accountRefHash?: string | null;
  readonly apiCredential?: string;
  readonly credentialSources?: Readonly<Record<string, string>>;
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/gu, `'"'"'`)}'`;
}

function assertObservationIdentityField(name: string, value: string): void {
  if (!/^[A-Za-z0-9._:-]{1,512}$/u.test(value)) {
    throw new SpawnBackendError(
      `Docker provider execution observation ${name} is not a safe canonical identity`,
      'docker',
    );
  }
}

/**
 * Derive a stable, secret-free principal pseudonym from the exact auth material
 * selected by the host. Raw credentials and host paths never enter an
 * observation. An exact admission account hash wins when one exists.
 */
export function resolveDockerProviderPrincipalDigest(
  input: DockerProviderPrincipalDigestInput,
): string {
  assertObservationIdentityField('provider', input.provider);
  if (input.accountRefHash !== undefined && input.accountRefHash !== null) {
    if (!/^[a-f0-9]{64}$/u.test(input.accountRefHash)) {
      throw new SpawnBackendError(
        'Docker provider execution accountRefHash is malformed',
        'docker',
      );
    }
    return createHash('sha256').update(canonicalJson({
      provider: input.provider,
      authMode: input.authMode,
      accountRefHash: input.accountRefHash,
    })).digest('hex');
  }

  const materialDigests: string[] = [];
  if (input.authMode === 'api' && input.apiCredential) {
    materialDigests.push(
      createHash('sha256').update(input.apiCredential).digest('hex'),
    );
  }
  if (input.authMode === 'subscription') {
    for (const [name, path] of Object.entries(input.credentialSources ?? {})
      .sort(([left], [right]) => left.localeCompare(right))) {
      if (!existsSync(path) || !statSync(path).isFile()) continue;
      materialDigests.push(`${name}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`);
    }
  }
  if (materialDigests.length === 0) {
    throw new SpawnBackendError(
      `Authenticated Docker provider process has no host-resolved principal material for ${input.provider}`,
      'docker',
    );
  }
  return createHash('sha256').update(canonicalJson({
    provider: input.provider,
    authMode: input.authMode,
    materialDigests,
  })).digest('hex');
}

/**
 * Host-authored POSIX wrapper fragment for the provider process boundary.
 *
 * The caller installs these functions after auth bootstrap, calls
 * `record_provider_execution_start` immediately before launching the provider,
 * and calls `record_provider_execution_end` immediately after its wait returns.
 * Files are immutable first-writer events. Closed pairs have a finite retention
 * ceiling; start-only intervals are deliberately never selected for pruning so
 * settlement diagnostics retain provider processes whose end was not observed.
 */
export function buildDockerProviderExecutionObservationShell(
  binding: Readonly<DockerProviderExecutionObservationBinding>,
  options: {
    readonly observationDirectory?: string;
    readonly closedRetentionLimit?: number;
  } = {},
): readonly string[] {
  assertObservationIdentityField('executionId', binding.executionId);
  assertObservationIdentityField('runId', binding.runId);
  assertObservationIdentityField('taskId', binding.taskId);
  assertObservationIdentityField('attemptId', binding.attemptId);
  if (!/^[a-f0-9]{64}$/u.test(binding.providerPrincipalDigest)) {
    throw new SpawnBackendError(
      'Docker provider execution principal digest is malformed',
      'docker',
    );
  }
  const retentionLimit = options.closedRetentionLimit
    ?? DOCKER_PROVIDER_EXECUTION_CLOSED_RETENTION_LIMIT;
  if (!Number.isSafeInteger(retentionLimit) || retentionLimit < 1) {
    throw new SpawnBackendError(
      'Docker provider execution closed retention limit must be a positive safe integer',
      'docker',
    );
  }
  const directory = options.observationDirectory
    ?? CONTAINER_PROVIDER_EXECUTION_OBSERVATION_DIR;
  if (!directory || /[\u0000\r\n]/u.test(directory)) {
    throw new SpawnBackendError(
      'Docker provider execution observation directory is malformed',
      'docker',
    );
  }
  const prefix = `${directory}/${binding.executionId}`;
  const startJson = `{"type":"start","executionId":"${binding.executionId}",`
    + `"runId":"${binding.runId}",`
    + `"taskId":"${binding.taskId}","attemptId":"${binding.attemptId}",`
    + `"providerPrincipalDigest":"${binding.providerPrincipalDigest}",`
    + `"fence":"$DECKENT_PROVIDER_EXECUTION_FENCE","sequence":1,`
    + `"observedAt":"$PROVIDER_OBSERVED_AT"}`;
  const endJson = `{"type":"end","executionId":"${binding.executionId}",`
    + `"runId":"${binding.runId}",`
    + `"taskId":"${binding.taskId}","attemptId":"${binding.attemptId}",`
    + `"providerPrincipalDigest":"${binding.providerPrincipalDigest}",`
    + `"fence":"$DECKENT_PROVIDER_EXECUTION_FENCE","sequence":2,`
    + `"observedAt":"$PROVIDER_OBSERVED_AT","outcome":"$PROVIDER_OBSERVATION_OUTCOME"}`;
  const startPayload = startJson.replace(/"/gu, '\\"');
  const endPayload = endJson.replace(/"/gu, '\\"');
  return [
    `PROVIDER_OBSERVATION_DIR=${shellSingleQuote(directory)}`,
    `PROVIDER_OBSERVATION_PREFIX=${shellSingleQuote(prefix)}`,
    `PROVIDER_OBSERVATION_CLOSED_RETENTION=${retentionLimit}`,
    'PROVIDER_OBSERVATION_STARTED=0',
    'persist_provider_execution_observation() {',
    '  PROVIDER_OBSERVATION_TARGET="$1"',
    '  PROVIDER_OBSERVATION_PAYLOAD="$2"',
    '  mkdir -p "$PROVIDER_OBSERVATION_DIR" || return 79',
    '  chmod 700 "$PROVIDER_OBSERVATION_DIR" 2>/dev/null || true',
    '  [ ! -e "$PROVIDER_OBSERVATION_TARGET" ] || return 0',
    '  PROVIDER_OBSERVATION_TMP="$PROVIDER_OBSERVATION_TARGET.tmp.$$"',
    '  (umask 077; printf "%s\\n" "$PROVIDER_OBSERVATION_PAYLOAD" > "$PROVIDER_OBSERVATION_TMP") || return 79',
    '  if ln "$PROVIDER_OBSERVATION_TMP" "$PROVIDER_OBSERVATION_TARGET" 2>/dev/null; then',
    '    fsync_file "$PROVIDER_OBSERVATION_TARGET"',
    '  fi',
    '  rm -f "$PROVIDER_OBSERVATION_TMP" 2>/dev/null',
    '}',
    'prune_closed_provider_execution_observations() {',
    '  PROVIDER_OBSERVATION_COUNT=0',
    '  for PROVIDER_OBSERVATION_END in "$PROVIDER_OBSERVATION_DIR"/*.end.json; do',
    '    [ -f "$PROVIDER_OBSERVATION_END" ] || continue',
    '    PROVIDER_OBSERVATION_COUNT=$((PROVIDER_OBSERVATION_COUNT + 1))',
    '  done',
    '  [ "$PROVIDER_OBSERVATION_COUNT" -le "$PROVIDER_OBSERVATION_CLOSED_RETENTION" ] && return 0',
    '  for PROVIDER_OBSERVATION_END in $(ls -1tr "$PROVIDER_OBSERVATION_DIR"/*.end.json 2>/dev/null); do',
    '    [ "$PROVIDER_OBSERVATION_COUNT" -le "$PROVIDER_OBSERVATION_CLOSED_RETENTION" ] && break',
    '    PROVIDER_OBSERVATION_START="${PROVIDER_OBSERVATION_END%.end.json}.start.json"',
    '    rm -f "$PROVIDER_OBSERVATION_END" "$PROVIDER_OBSERVATION_START" 2>/dev/null || return 79',
    '    PROVIDER_OBSERVATION_COUNT=$((PROVIDER_OBSERVATION_COUNT - 1))',
    '  done',
    '}',
    'record_provider_execution_start() {',
    '  [ -n "$DECKENT_PROVIDER_EXECUTION_FENCE" ] || return 79',
    '  PROVIDER_OBSERVED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" || return 79',
    `  persist_provider_execution_observation "$PROVIDER_OBSERVATION_PREFIX.start.json" "${startPayload}" || return 79`,
    '  PROVIDER_OBSERVATION_STARTED=1',
    '}',
    'record_provider_execution_end() {',
    '  [ "$PROVIDER_OBSERVATION_STARTED" -eq 1 ] || return 0',
    '  PROVIDER_OBSERVATION_OUTCOME="$1"',
    '  case "$PROVIDER_OBSERVATION_OUTCOME" in completed|failed|aborted) ;; *) return 79 ;; esac',
    '  PROVIDER_OBSERVED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" || return 79',
    `  persist_provider_execution_observation "$PROVIDER_OBSERVATION_PREFIX.end.json" "${endPayload}" || return 79`,
    '  prune_closed_provider_execution_observations || return 79',
    '}',
  ];
}

export interface DockerExactCrossVerifySpawnInput {
  readonly taskId: string;
  readonly model: ModelType;
  readonly prompt: string;
  readonly executionContract: Readonly<CrossVerifyEnforcedAttemptContract>;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly options: SpawnBackendOptions;
  readonly terminationAuthority: DockerExactCrossVerifyTerminationAuthority;
}

export interface DockerExactCrossVerifyTerminationBinding {
  readonly bindingId: string;
  readonly evidenceRef: string;
  readonly authorityRef: string;
}

export interface DockerExactCrossVerifyTerminationAuthority {
  bindPreparedAttempt(input: {
    readonly settlementRef: Readonly<TaskResultSettlementRefV1>;
    readonly executionContract: Readonly<CrossVerifyEnforcedAttemptContract>;
  }): Readonly<DockerExactCrossVerifyTerminationBinding>;
}

export interface DockerExactCrossVerifyDispatchHandle {
  readonly settlementRef: Readonly<TaskResultSettlementRefV1>;
  readonly outputArtifactRef: string;
}

interface DockerExactCrossVerifyContext {
  readonly executionContract: Readonly<CrossVerifyEnforcedAttemptContract>;
  readonly terminationAuthority: DockerExactCrossVerifyTerminationAuthority;
  readonly promptSha256: string;
  readonly taskSnapshotSha256: string;
  readonly promptEvidenceRef: string;
  readonly promptHostPath: string;
  readonly executionContractEvidenceRef: string;
  readonly executionContractSha256: string;
}

function sameExactSettlementRef(
  left: Readonly<TaskResultSettlementRefV1>,
  right: Readonly<TaskResultSettlementRefV1>,
): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.taskId === right.taskId
    && left.backend === right.backend
    && left.projectRootSha256 === right.projectRootSha256
    && left.attemptId === right.attemptId;
}

function exactCrossVerifyOutputArtifactRef(
  ref: TaskResultSettlementRefV1,
): string {
  return `task-result-output:${createHash('sha256')
    .update(JSON.stringify(ref))
    .digest('hex')}`;
}

function exactCrossVerifyPromptMountArgs(promptHostPath: string): string[] {
  if (!isAbsolute(promptHostPath)
    || /[,\u0000\r\n]/u.test(promptHostPath)
    || !existsSync(promptHostPath)
    || !statSync(promptHostPath).isFile()) {
    throw new SpawnBackendError(
      'Exact xverify prompt path cannot be represented as a safe Docker bind mount',
      'docker',
    );
  }
  return [
    '--mount',
    `type=bind,source=${promptHostPath},target=${CONTAINER_EXACT_XVERIFY_PROMPT},readonly`,
  ];
}

function exactCrossVerifyEvidenceMountArgs(
  contract: Readonly<CrossVerifyEnforcedAttemptContract>,
  projectRoot: string,
): string[] {
  if (contract.schemaVersion !== 2) return [];
  const evidence = readCrossVerifyEvidenceReceipt(
    projectRoot,
    contract.settlementAttemptRef,
  );
  if (evidence.manifestSha256
      !== contract.adjudication.evidenceBrokerManifestSha256
    || crossVerifyEvidenceReceiptRef(evidence)
      !== contract.adjudication.evidenceBrokerRef) {
    throw new SpawnBackendError(
      'Typed xverify evidence broker differs from the execution contract',
      'docker',
    );
  }
  const evidenceHostPath = crossVerifyEvidenceBrokerDirectory(
    contract.settlementAttemptRef,
  );
  if (!isAbsolute(evidenceHostPath)
    || /[,\u0000\r\n]/u.test(evidenceHostPath)
    || !existsSync(evidenceHostPath)
    || !statSync(evidenceHostPath).isDirectory()) {
    throw new SpawnBackendError(
      'Typed xverify evidence broker cannot be represented as a safe Docker bind mount',
      'docker',
    );
  }
  return [
    '--mount',
    `type=bind,source=${evidenceHostPath},target=${contract.adjudication.evidenceMountPath},readonly`,
  ];
}

const PROVIDER_AUTH_FILES: Readonly<Record<string, readonly { file: string; required: boolean }[]>> = {
  claude: [{ file: '.credentials.json', required: true }],
  codex: [{ file: 'auth.json', required: true }],
  gemini: [
    { file: 'gemini-credentials.json', required: true },
    { file: 'google_accounts.json', required: false },
  ],
  cursor: [{ file: 'auth.json', required: true }],
};

export interface ProviderAuthIsolation {
  mountArgs: string[];
  bootstrapLines: string[];
  writebackLines?: string[];
  credentialCount: number;
  missingRequiredFiles: string[];
  /** Provider execution never owns the shared credential-mutation lease. */
  executionConcurrency: 'isolated-parallel' | 'not-applicable';
  /** Exact shared-state critical section guarded by the broker lease. */
  credentialMutationLockScope: 'bootstrap-and-writeback' | 'none';
}

export interface ProviderAuthIsolationOptions {
  /** Host-owned runtime credential broker files keyed by allowlisted filename. */
  credentialSources?: Readonly<Record<string, string>>;
  /** Shared host lock file serializing refresh-capable provider sessions. */
  lockPath?: string;
  /** Exact sanitized host directory containing the allowlisted credential files. */
  hostCredentialRoot?: string | null;
}

function safeHostConfigRoot(value: string | undefined, platform: NodeJS.Platform): string | null {
  if (!value || /[,\u0000\r\n]/u.test(value)) return null;
  const pathApi = platform === 'win32' ? win32 : posix;
  return pathApi.isAbsolute(value) ? pathApi.normalize(value) : null;
}

function joinHostCredentialPath(root: string, file: string): string {
  return /^(?:[a-zA-Z]:[\\/]|\\\\)/u.test(root) ? win32.join(root, file) : join(root, file);
}

/**
 * Resolve Cursor's host credential directory without granting the container
 * access to the surrounding host configuration tree. Cursor's container-side
 * destination remains `$HOME/.config/cursor`; this authority is source-only.
 */
export function resolveCursorHostCredentialRoot(
  home: string,
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | null {
  const pathApi = platform === 'win32' ? win32 : posix;
  const override = platform === 'win32' ? env.APPDATA : env.XDG_CONFIG_HOME;
  const safeOverride = safeHostConfigRoot(override, platform);
  if (safeOverride) return pathApi.join(safeOverride, 'cursor');
  const safeHome = safeHostConfigRoot(home, platform);
  return safeHome ? pathApi.join(safeHome, '.config', 'cursor') : null;
}

function resolveProviderHostCredentialRoot(
  home: string,
  provider: string,
  oauthHomeDir: string | undefined,
  platform: NodeJS.Platform,
): string | null {
  if (!oauthHomeDir) return null;
  if (provider === 'cursor') {
    return resolveCursorHostCredentialRoot(home, platform);
  }
  return join(home, oauthHomeDir);
}

export interface GeminiAuthSelectionBootstrap {
  selectedType: string;
  bootstrapLines: string[];
}

/** Attribute a non-zero Docker exit using host-owned budget evidence before
 * falling back to the necessarily ambiguous exit-code heuristic. */
/**
 * Settle a task whose attempt LANDED but whose continuation was held.
 *
 * MASTER-PLAN 664: a held continuation used to be invisible (debugLog only) AND
 * non-terminal — the landing checkpoint is by design neither DONE nor NO_GO, so
 * the sprint waited forever for a `.result` that no attempt could ever write
 * (measured 2026-07-25: task 457-002 hung the run past its own timeout).
 *
 * The checkpoint stays the authoritative attempt evidence; this only gives the
 * PRODUCT outcome a terminal, typed value so evaluation/FIX can act on it.
 * Never overwrites an existing result — a real worker result always wins.
 */
export function settleHeldExecutionContinuation(
  projectDir: string,
  taskId: string,
  exitCode: number,
  reason: string,
): boolean {
  const resultPath = join(projectDir, TASKS_DIR, `task-${taskId}.result`);
  if (existsSync(resultPath)) return false;
  try {
    writeFileSync(resultPath, `${JSON.stringify({
      taskId,
      workerId: `docker-${taskId}`,
      selfAssessment: 'NO_GO',
      exitCode,
      testsPassed: false,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      notes: `Execution landed at a host checkpoint but the continuation was held: ${reason}. `
        + 'No further provider work was dispatched. The landing checkpoint remains the '
        + 'authoritative attempt evidence; this result only settles the product outcome.',
      continuationHeld: { version: 1, reason },
    }, null, 2)}\n`, 'utf-8');
    const fd = openSync(resultPath, 'r');
    try { fsyncSync(fd); } finally { closeSync(fd); }
    return true;
  } catch (error) {
    debugLog(
      'docker-backend:continuation-hold-settle-failed',
      `taskId=${taskId} ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Measure whether the container was actually OOM-killed.
 *
 * MASTER-PLAN 660/664: exit 137 only means SIGKILL. It was previously ASSERTED
 * to be an OOM whenever no budget-stop evidence was matched, which sent a real
 * 2026-07-25 debugging session toward "raise the memory limit" when the true
 * cause was a turn-ceiling kill. Docker knows the answer; ask it. A removed or
 * unreachable container yields `null` = unmeasured, never a guess.
 */
export function probeContainerOomKilled(containerId: string): boolean | null {
  if (!containerId.trim()) return null;
  try {
    const probe = spawnSync(
      'docker',
      ['inspect', '--format', '{{.State.OOMKilled}}', containerId],
      { encoding: 'utf-8', timeout: 5_000 },
    );
    if (probe.status !== 0) return null;
    const value = (probe.stdout ?? '').trim();
    return value === 'true' ? true : value === 'false' ? false : null;
  } catch {
    return null;
  }
}

export function describeDockerPartialResultTermination(
  exitCode: number,
  budgetStop: RuntimeBudgetStopEvidence | null,
  /** Measured OOM truth; `null` means it could not be measured. Never assumed. */
  oomKilled: boolean | null = null,
): string {
  if (budgetStop) {
    const reason = budgetStop.decision.reasons.join('; ') || 'execution budget exceeded';
    return `Runtime budget circuit breaker stopped the worker (exitCode=${exitCode}): ${reason}. Partial-result promoted by host monitor. attemptId=${budgetStop.attemptId}; evidenceSource=${budgetStop.evidenceSource ?? 'stop-marker'}.`;
  }
  if (exitCode === 137) {
    if (oomKilled === true) {
      return 'Container OOM-killed (exit 137, SIGKILL; docker reported OOMKilled=true). Partial-result promoted by host monitor. No .result was written by worker.';
    }
    if (oomKilled === false) {
      // `OOMKilled` reflects PID 1 only. Under cgroup v2 the kernel OOM killer
      // frequently kills a CHILD (the provider CLI) while the shell entrypoint
      // survives and exits 137 — the flag stays false even though memory WAS the
      // cause. Measured 2026-07-25 (task 458-005, 3 GB limit). So a false flag
      // narrows the cause, it does not clear memory pressure.
      return 'Container SIGKILLed (exit 137) with docker OOMKilled=false and no matching budget-stop evidence. That flag only covers PID 1: under cgroup v2 a child process (the provider CLI) can still be OOM-killed while the entrypoint survives. Check the container memory limit against peak worker usage before ruling memory out. Partial-result promoted by host monitor.';
    }
    return 'Container SIGKILLed (exit 137). OOM status could not be measured and no budget-stop evidence matched; cause undetermined — neither assume nor rule out memory pressure. Partial-result promoted by host monitor.';
  }
  const signalInfo = exitCode > 128 ? ` signal=${exitCode - 128}` : '';
  return `Container killed (exitCode=${exitCode}${signalInfo}). Partial-result promoted by host monitor.`;
}

/**
 * Host-owned terminal budget evidence vetoes any worker-authored success,
 * including a natural process exit with code 0. The provider's final billing
 * evidence remains a separate truth channel and is intentionally preserved.
 */
export function reconcileDockerRuntimeBudgetResult(
  result: TaskResult,
  exitCode: number,
  budgetStop: RuntimeBudgetStopEvidence | null,
): boolean {
  if (!budgetStop) return false;

  result.selfAssessment = 'NO_GO';
  result.testsPassed = false;
  const previousUsage = result.tokenUsage;
  const counters = budgetStop.decision.counters;
  result.tokenUsage = {
    inputTokens: counters.inputTokens,
    outputTokens: counters.outputTokens,
    cacheReadTokens: counters.cacheReadTokens,
    cacheCreationTokens: counters.cacheCreationTokens,
    // 7093: totalTokens is never left empty — the guard's own aggregate
    // (fresh input + output + both cache legs) is the host-measured total.
    totalTokens: counters.totalTokens,
    source: 'host-runtime-budget',
    ...(previousUsage?.provider ? { provider: previousUsage.provider } : {}),
    ...(previousUsage?.model ? { model: previousUsage.model } : {}),
  };
  // A cost computed from the worker's previous usage claim is no longer valid.
  // Provider-final billing evidence, when present, is retained for later
  // authoritative reconciliation by the result collector.
  delete result.cost;

  const reason = budgetStop.decision.reasons.join('; ') || 'execution budget exceeded';
  const evidenceNote = `Runtime budget circuit breaker invalidated the worker result (exitCode=${exitCode}): ${reason}. attemptId=${budgetStop.attemptId}; evidenceSource=${budgetStop.evidenceSource ?? 'stop-marker'}; counterEvidenceSource=${budgetStop.counterEvidenceSource ?? 'stop-marker'}; budgetFingerprint=${budgetStop.budgetFingerprint}.`;
  const previousNotes = result.notes ?? '';
  const notesAreAmbiguousHostAttribution = previousNotes.includes('Partial-result promoted by host monitor.');
  if (!previousNotes.includes(`attemptId=${budgetStop.attemptId}`)) {
    result.notes = notesAreAmbiguousHostAttribution
      ? evidenceNote
      : `${evidenceNote} ${previousNotes}`.trim();
  }
  return true;
}

/**
 * Persist host-measured partial-stream usage for a successful budgeted run even
 * when the provider emitted no final billing envelope. This is usage truth only:
 * assessment and provider billing remain independent and untouched.
 */
export function reconcileDockerRuntimeBudgetUsage(
  result: TaskResult,
  usage: RuntimeBudgetUsageEvidence | null,
  identity?: { provider: ProviderName; model: ModelType },
): boolean {
  if (!usage?.terminal || usage.decision.state !== 'within-budget') return false;
  return projectDockerRuntimeBudgetUsage(result, usage, identity);
}

/**
 * Preserve terminal host counters when an attempt exited during graceful
 * landing but could not mint an immutable landing checkpoint. This is usage
 * truth only; the recovery-containment projection below owns the NO_GO verdict.
 */
export function reconcileDockerLandingRequestedRuntimeBudgetUsage(
  result: TaskResult,
  usage: RuntimeBudgetUsageEvidence | null,
  identity?: { provider: ProviderName; model: ModelType },
): boolean {
  if (!usage?.terminal || usage.decision.state !== 'landing-requested') return false;
  return projectDockerRuntimeBudgetUsage(result, usage, identity);
}

function projectDockerRuntimeBudgetUsage(
  result: TaskResult,
  usage: RuntimeBudgetUsageEvidence,
  identity?: { provider: ProviderName; model: ModelType },
): boolean {
  const counters = usage.decision.counters;
  const measurableTokens = counters.inputTokens
    + counters.outputTokens
    + counters.cacheReadTokens
    + counters.cacheCreationTokens;
  if (measurableTokens <= 0) return false;

  const previousUsage = result.tokenUsage;
  result.tokenUsage = {
    inputTokens: counters.inputTokens,
    outputTokens: counters.outputTokens,
    cacheReadTokens: counters.cacheReadTokens,
    cacheCreationTokens: counters.cacheCreationTokens,
    // 7093: totalTokens is never left empty (see reconcileDockerRuntimeBudgetResult).
    totalTokens: counters.inputTokens + counters.outputTokens
      + counters.cacheReadTokens + counters.cacheCreationTokens,
    source: 'host-runtime-budget',
    ...(previousUsage?.provider || identity?.provider
      ? { provider: previousUsage?.provider ?? identity!.provider }
      : {}),
    ...(previousUsage?.model || identity?.model
      ? { model: previousUsage?.model ?? identity!.model }
      : {}),
  };
  // Any pre-exit local cost was computed from the stale usage claim. Real
  // providerBilling, when present, remains authoritative and is not fabricated.
  delete result.cost;
  return true;
}

/** A missing terminal measurement is a veto, never evidence of zero usage. */
export function reconcileDockerUnmeasurableRuntimeBudgetResult(
  result: TaskResult,
  usage: RuntimeBudgetUsageEvidence | null,
): boolean {
  if (!usage || (usage.terminal && usage.decision.state !== 'unmeasurable')) return false;
  result.selfAssessment = 'NO_GO';
  result.testsPassed = false;
  const evidence = `Host runtime-budget evidence is not terminally measurable: state=${usage.decision.state}, terminal=${usage.terminal}, attemptId=${usage.attemptId}, budgetFingerprint=${usage.budgetFingerprint}.`;
  if (!result.notes?.includes('Host runtime-budget evidence is not terminally measurable')) {
    result.notes = `${evidence} ${result.notes ?? ''}`.trim();
  }
  delete result.tokenUsage;
  delete result.cost;
  return true;
}

export interface DockerTerminalProviderBillingEvidence {
  receipt: TaskProviderTerminalBillingReceiptV1;
  billing: ProviderBillingEvidence;
  evidenceRef: string;
}

/**
 * Persist the last canonical provider billing envelope observed by the host log
 * stream under the exact settlement attempt. The project-mounted `.log` is
 * evidence input only; the immutable host receipt is the recovery authority.
 */
export function persistDockerTerminalProviderBillingReceipt(
  ref: TaskResultSettlementRefV1,
  provider: string,
  normalizedLog: string,
): DockerTerminalProviderBillingEvidence | null {
  let observed: {
    billing: ProviderBillingEvidence;
    sourceEventSha256: string;
    observedAt: string;
  } | null = null;
  for (const line of normalizedLog.split(/\r?\n/)) {
    const event = line.trim();
    if (!event.startsWith('{')) continue;
    let observedAt: string | undefined;
    let providerEnvelope: unknown;
    try {
      const parsed = JSON.parse(event) as {
        ts?: unknown;
        type?: unknown;
        content?: unknown;
        total_cost_usd?: unknown;
      };
      if (
        typeof parsed.ts === 'string'
        && Number.isFinite(Date.parse(parsed.ts))
      ) observedAt = parsed.ts;
      providerEnvelope = parsed.type === 'usage'
        && parsed.content
        && typeof parsed.content === 'object'
        && !Array.isArray(parsed.content)
        ? parsed.content
        : parsed.total_cost_usd !== undefined
          ? parsed
          : null;
    } catch {
      continue;
    }
    if (!providerEnvelope) continue;
    const stableProviderEvent = JSON.stringify(providerEnvelope);
    const billing = extractProviderBillingEvidence(
      provider,
      stableProviderEvent,
      observedAt ?? new Date().toISOString(),
    );
    if (!billing) continue;
    observed = {
      billing,
      sourceEventSha256: createHash('sha256').update(stableProviderEvent).digest('hex'),
      observedAt: observedAt ?? billing.capturedAt,
    };
  }
  if (!observed) return null;
  writeTaskProviderTerminalBillingReceiptAtomic(
    ref,
    observed.billing,
    observed.sourceEventSha256,
    observed.observedAt,
  );
  const receipt = readTaskProviderTerminalBillingReceipt(ref);
  if (!receipt) {
    throw createDockerLifecycleError('Docker provider terminal billing receipt was not readable');
  }
  if (readTaskResultSettlementExecutionContract(ref)) {
    writeTaskProviderActualCallReceiptAtomic(ref);
  }
  return {
    receipt,
    billing: receipt.billing,
    evidenceRef: taskProviderTerminalBillingEvidenceRef(receipt),
  };
}

function reconcileDockerProviderBillingReceiptResultFile(
  resultPath: string,
  taskId: string,
  receipt: TaskProviderTerminalBillingReceiptV1 | null,
): boolean {
  if (!receipt || !existsSync(resultPath)) return false;
  const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
  if (result.taskId !== taskId || receipt.taskId !== taskId) {
    throw createDockerLifecycleError('Docker provider billing result task identity mismatch');
  }
  result.providerBilling = receipt.billing;
  delete result.cost;
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return true;
}

interface DockerRecoveryContainment {
  attemptId: string;
  reason:
    | 'host-restart-budget-observer-loss'
    | 'docker-wait-evidence-loss'
    | 'landing-checkpoint-unavailable';
  evidence?: string;
}

function reconcileDockerRecoveryContainmentResultFile(
  resultPath: string,
  taskId: string,
  recovery: DockerRecoveryContainment | undefined,
): boolean {
  if (!recovery || !existsSync(resultPath)) return false;
  const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
  if (result.taskId !== taskId) {
    throw new Error(`Docker recovery result taskId mismatch: expected ${taskId}`);
  }
  result.selfAssessment = 'NO_GO';
  result.testsPassed = false;
  const evidence = recovery.reason === 'host-restart-budget-observer-loss'
    ? `Host restart contained a live Docker attempt because its pre-crash budget observer did not survive. attemptId=${recovery.attemptId}.`
    : recovery.reason === 'docker-wait-evidence-loss'
      ? `Host contained the exact Docker attempt because docker wait lost trustworthy terminal evidence. attemptId=${recovery.attemptId}.${recovery.evidence ? ` evidence=${recovery.evidence}.` : ''}`
      : `Host contained the exact Docker attempt at LANDING_REQUESTED, but no valid immutable checkpoint could be created from the final exact-attempt proposal. attemptId=${recovery.attemptId}.${recovery.evidence ? ` evidence=${recovery.evidence}.` : ''}`;
  const evidenceMarker = recovery.reason === 'host-restart-budget-observer-loss'
    ? 'pre-crash budget observer did not survive'
    : recovery.reason === 'docker-wait-evidence-loss'
      ? 'docker wait lost trustworthy terminal evidence'
      : 'no valid immutable checkpoint could be created';
  if (!result.notes?.includes(evidenceMarker)) {
    result.notes = `${evidence} ${result.notes ?? ''}`.trim();
  }
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return true;
}

/** Persist the host's final, content-addressed Docker result receipt. */
export function persistDockerTaskResultSettlement(
  projectRoot: string,
  tasksDir: string,
  ref: TaskResultSettlementRefV1 | undefined,
  exitCode: number | null,
  model = 'unknown',
): boolean {
  if (!ref) return false;
  assertTaskResultSettlementRef(projectRoot, ref.taskId, ref);
  const resultPath = join(tasksDir, `task-${ref.taskId}.result`);
  if (!existsSync(resultPath)) return false;
  const raw = readFileSync(resultPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf-8')) as unknown;
  } catch {
    persistDockerCorruptResultRecovery({ ref, raw, exitCode, model });
    return true;
  }
  if (!isValidDockerWorkerResult(parsed, ref)) {
    persistDockerCorruptResultRecovery({ ref, raw, exitCode, model });
    return true;
  }
  const result = normalizeTaskResultShape(
    parsed as Record<string, unknown> & { notes?: unknown },
  ) as Record<string, unknown>;
  let task: Task | null = null;
  try {
    const taskValue = JSON.parse(
      readFileSync(join(tasksDir, `task-${ref.taskId}.json`), 'utf8'),
    ) as Task;
    if (taskValue.id === ref.taskId) task = taskValue;
  } catch {
    // Legacy/recovery attempts may no longer have a readable task projection.
  }
  const resultAgentId = typeof result.agentId === 'string' ? result.agentId : null;
  const resultSkillIds = Array.isArray(result.skillIds)
    ? result.skillIds.filter((value): value is string => typeof value === 'string')
    : [];
  const delivery = resolvePromptDeliveryAttribution({
    projectRoot,
    taskId: ref.taskId,
    requireCurrentReceipt: typeof task?.promptCompilePlanId === 'string',
    legacyAgentId: resultAgentId ?? task?.assignedAgent ?? null,
    legacySkillIds: resultSkillIds.length > 0 ? resultSkillIds : task?.assignedSkills,
  });
  if (delivery.agentId === null) delete result.agentId;
  else result.agentId = delivery.agentId;
  result.skillIds = [...delivery.skillIds];
  result.promptDeliveryAttribution = {
    state: delivery.state,
    ...(delivery.state === 'HOLD' ? { reason: delivery.reason } : {}),
  };
  const effectiveModel = model === 'unknown'
    ? (typeof task?.model === 'string' ? task.model : 'unknown')
    : model;
  let effectiveProvider = getDefaultProviderName();
  try {
    effectiveProvider = getProviderForModel(effectiveModel as ModelType);
  } catch {
    // Recovery of old attempts may not retain a registered model identity.
  }
  const canonical = assembleCanonicalIngressResult(result, {
    taskId: ref.taskId,
    workerId: typeof result.workerId === 'string' ? result.workerId : `docker-${ref.taskId}`,
    provider: effectiveProvider,
    model: effectiveModel,
    ...(task?.sprintId ? { sprintId: task.sprintId } : {}),
    ...(task?.promptCompilePlanId
      ? { promptCompilePlanId: task.promptCompilePlanId }
      : {}),
    ...(task?.verification
      ? { verificationCommands: task.verification.commands }
      : {}),
    isPriorityFix: task?.isPriorityFix ?? false,
    fixForTaskId: task?.fixForTaskId ?? null,
  });
  // Compatibility aliases are projections only; the canonical V1 fields above
  // remain the sole parsed authority consumed downstream.
  const settledResult: Record<string, unknown> = {
    ...canonical,
    ...(canonical.agent ? { agentId: canonical.agent } : {}),
    skillIds: [...canonical.skills],
  };
  atomicWriteFileSync(resultPath, `${JSON.stringify(settledResult, null, 2)}\n`);
  const settlement = createTaskResultSettlement({ ref, exitCode, result: settledResult });
  writeTaskResultSettlementAtomic(settlement);
  return true;
}

/**
 * A task-level result is shared by every attempt for that logical task. A
 * coordinator crash can leave more than one unprepared attempt behind before
 * the first recovery pass runs. Once the first attempt is recovered, later
 * attempts must preserve that raw result while receiving their own immutable
 * attempt settlement. Only Deckent's exact, content-addressed zero-work
 * recovery projection is eligible; a worker-authored or malformed result still
 * fails closed.
 */
function isCanonicalPriorUnpreparedRecoveryResult(
  value: unknown,
  currentRef: TaskResultSettlementRefV1,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const notes = record['notes'];
  const prefix = 'DECKENT_E091:coordinator-crashed-before-docker-prepare:';
  if (
    record['taskId'] !== currentRef.taskId
    || record['workerId'] !== `docker-recovery-${currentRef.taskId}`
    || !Array.isArray(record['filesChanged'])
    || record['filesChanged'].length !== 0
    || record['linesAdded'] !== 0
    || record['linesRemoved'] !== 0
    || record['testsPassed'] !== false
    || record['selfAssessment'] !== 'NO_GO'
    || typeof notes !== 'string'
    || !notes.startsWith(prefix)
  ) return false;

  const priorAttemptId = notes.slice(prefix.length);
  if (!/^[0-9a-f-]{36}$/iu.test(priorAttemptId) || priorAttemptId === currentRef.attemptId) {
    return false;
  }
  const priorRef: TaskResultSettlementRefV1 = {
    schemaVersion: currentRef.schemaVersion,
    taskId: currentRef.taskId,
    backend: currentRef.backend,
    projectRootSha256: currentRef.projectRootSha256,
    attemptId: priorAttemptId,
  };
  const authorities: TaskResultSettlementRefV1[] = [priorRef];
  try {
    const priorAttempt = parseTaskResultSettlementAttempt(JSON.parse(
      readFileSync(taskResultSettlementAttemptPath(priorRef), 'utf-8'),
    ) as unknown);
    if (priorAttempt) authorities.push(priorAttempt);
  } catch { /* an exact v1 authority below can still validate */ }

  const { preDispatchSettlement: _ignored, ...baseResult } = record;
  return authorities.some(authority => {
    const projected = projectDockerRecoveryPreDispatchSettlement(
      baseResult,
      authority,
    ) as Record<string, unknown>;
    return canonicalJson(projected['preDispatchSettlement'])
      === canonicalJson(record['preDispatchSettlement']);
  });
}

function exactDockerRecoveryAuthority(
  ref: TaskResultSettlementRefV1,
): TaskResultSettlementRefV1 {
  return {
    schemaVersion: ref.schemaVersion,
    taskId: ref.taskId,
    backend: ref.backend,
    projectRootSha256: ref.projectRootSha256,
    attemptId: ref.attemptId,
  };
}

const MAX_RECOVERY_FORENSIC_BYTES = 1024 * 1024;

function isValidDockerWorkerResult(
  value: unknown,
  ref: TaskResultSettlementRefV1,
): value is Record<string, unknown> & { notes?: unknown } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result['taskId'] !== ref.taskId) return false;
  if (result['attemptId'] !== undefined && result['attemptId'] !== ref.attemptId) return false;
  if (!['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO'].includes(String(result['selfAssessment']))) return false;
  if (result['workerId'] !== undefined && typeof result['workerId'] !== 'string') return false;
  if (result['filesChanged'] !== undefined && !Array.isArray(result['filesChanged'])) return false;
  if (result['testsPassed'] !== undefined && typeof result['testsPassed'] !== 'boolean'
    && !Array.isArray(result['testsPassed'])) return false;
  for (const field of ['linesAdded', 'linesRemoved'] as const) {
    const count = result[field];
    if (count !== undefined && (!Number.isSafeInteger(count) || Number(count) < 0)) return false;
  }
  const coverage = result['coverage'];
  if (coverage !== undefined && (typeof coverage !== 'number' || !Number.isFinite(coverage)
    || coverage < 0 || coverage > 100)) return false;
  return true;
}

function buildDockerCorruptResultRecovery(input: {
  readonly ref: TaskResultSettlementRefV1;
  readonly raw: Buffer;
  readonly exitCode: number | null;
  readonly model: string;
}): { readonly capturedAt: string; readonly result: Record<string, unknown> } {
  const rawSha256 = createHash('sha256').update(input.raw).digest('hex');
  const captured = input.raw.subarray(0, MAX_RECOVERY_FORENSIC_BYTES);
  const forensicPath = join(dirname(taskResultSettlementPath(input.ref)), 'invalid-worker-result.json');
  let capturedAt: string;
  if (existsSync(forensicPath)) {
    const existing = JSON.parse(readFileSync(forensicPath, 'utf-8')) as {
      rawSha256?: string; taskId?: string; attemptId?: string; capturedAt?: string;
    };
    if (existing.rawSha256 !== rawSha256 || existing.taskId !== input.ref.taskId
      || existing.attemptId !== input.ref.attemptId || typeof existing.capturedAt !== 'string') {
      throw new SpawnBackendError(
        `DECKENT_E091:recovery-forensic-conflict:${input.ref.taskId}/${input.ref.attemptId}`,
        'docker',
      );
    }
    capturedAt = existing.capturedAt;
  } else {
    capturedAt = new Date().toISOString();
    atomicWriteFileSync(forensicPath, `${JSON.stringify({
      schemaVersion: 1,
      taskId: input.ref.taskId,
      attemptId: input.ref.attemptId,
      artifactState: 'corrupt',
      rawSha256,
      rawBytes: input.raw.byteLength,
      capturedBytes: captured.byteLength,
      truncated: captured.byteLength !== input.raw.byteLength,
      rawBase64: captured.toString('base64'),
      capturedAt,
    }, null, 2)}\n`);
  }
  const provider = modelRegistry.get(input.model)?.provider ?? 'unknown';
  const evidenceRef = `invalid-worker-result:sha256:${rawSha256}`;
  const result: Record<string, unknown> = {
    taskId: input.ref.taskId,
    workerId: `docker-recovery-${input.ref.taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    markerType: 'RECOVERY_RESULT_INVALID',
    exitCode: input.exitCode,
    recovery: {
      attemptId: input.ref.attemptId,
      resultArtifactState: 'corrupt',
      resultArtifactSha256: rawSha256,
      forensicEvidenceRef: evidenceRef,
    },
    notes: `Host rejected an invalid Docker worker result and contained the attempt as NO_GO; container exit ${input.exitCode ?? 'unknown'} is not success authority. attemptId=${input.ref.attemptId}. evidence=${evidenceRef}.`,
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider, model: input.model },
  };
  return { capturedAt, result };
}

function persistDockerCorruptResultRecovery(input: {
  readonly ref: TaskResultSettlementRefV1;
  readonly raw: Buffer;
  readonly exitCode: number | null;
  readonly model: string;
}): void {
  const recovery = buildDockerCorruptResultRecovery(input);
  writeTaskResultSettlementAtomic(createTaskResultSettlement({
    ref: input.ref,
    exitCode: input.exitCode,
    result: recovery.result,
    settledAt: recovery.capturedAt,
  }));
}

/**
 * Make a proven-absent Docker attempt settleable without inventing success.
 *
 * A worker result can be missing when the host dies between container exit and
 * result flush, or malformed when a provider shell emitted unescaped text.
 * Neither condition is operational ambiguity once Docker authoritatively
 * proves the exact container absent. Preserve malformed bytes under the
 * host-owned attempt journal, then project an explicit host-authored NO_GO
 * result so recovery can settle, close and release locks automatically.
 */
export function ensureDockerRecoveryResultFile(input: {
  readonly projectRoot: string;
  readonly tasksDir: string;
  readonly ref: TaskResultSettlementRefV1;
  readonly model: string;
}): 'worker-result' | 'recovered-missing' | 'recovered-malformed' {
  assertTaskResultSettlementRef(input.projectRoot, input.ref.taskId, input.ref);
  const resultPath = join(input.tasksDir, `task-${input.ref.taskId}.result`);
  let artifactState: 'missing' | 'malformed' = 'missing';
  let rawSha256: string | null = null;
  let forensicEvidenceRef: string | null = null;

  if (existsSync(resultPath)) {
    const raw = readFileSync(resultPath);
    rawSha256 = createHash('sha256').update(raw).digest('hex');
    try {
      const parsed = JSON.parse(raw.toString('utf-8')) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new SyntaxError('worker result root is not a JSON object');
      }
      const record = parsed as Record<string, unknown> & { notes?: unknown };
      if (!isValidDockerWorkerResult(record, input.ref)) {
        throw new SyntaxError('worker result failed schema or attempt identity validation');
      }
      const normalized = normalizeTaskResultShape(record) as Record<string, unknown>;
      atomicWriteFileSync(resultPath, `${JSON.stringify(normalized, null, 2)}\n`);
      return 'worker-result';
    } catch (error) {
      if (error instanceof SpawnBackendError) throw error;
      artifactState = 'malformed';
      forensicEvidenceRef = `invalid-worker-result:sha256:${rawSha256}`;
      persistDockerCorruptResultRecovery({ ref: input.ref, raw, exitCode: null, model: input.model });
      return 'recovered-malformed';
    }
  }

  const provider = modelRegistry.get(input.model)?.provider ?? 'unknown';
  const recoveryResult = {
    taskId: input.ref.taskId,
    workerId: `docker-recovery-${input.ref.taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    markerType: 'RECOVERY_RESULT_UNAVAILABLE',
    exitCode: null,
    recovery: {
      attemptId: input.ref.attemptId,
      resultArtifactState: artifactState,
      resultArtifactSha256: rawSha256,
      forensicEvidenceRef,
    },
    notes:
      `Host recovery proved the exact Docker container absent, but its worker result was ${artifactState}. `
      + `The attempt was contained as NO_GO; no successful outcome was inferred. attemptId=${input.ref.attemptId}.`
      + (forensicEvidenceRef ? ` evidence=${forensicEvidenceRef}.` : ''),
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider,
      model: input.model,
    },
  };
  atomicWriteFileSync(resultPath, `${JSON.stringify(recoveryResult, null, 2)}\n`);
  return artifactState === 'missing' ? 'recovered-missing' : 'recovered-malformed';
}

export function closeDockerTaskResultSettlement(
  ref: TaskResultSettlementRefV1 | undefined,
  containerDisposition: 'not-dispatched' | 'stopped-removed' | 'absent-after-exit',
): boolean {
  if (!ref || !readTaskResultSettlement(ref)) return false;
  writeTaskResultSettlementClosureAtomic(ref, {
    containerDisposition,
    locksReleased: true,
  });
  return true;
}

/**
 * Project a completed host-only terminal protocol into the Docker result before
 * immutable settlement. Generic worker results are never promoted: the exact
 * xverify contract, task identity and host EXIT_WITHOUT_RESULT marker must all
 * match, and the verdict must come from a normalized assistant-output event.
 */
export function reconcileDockerHostTerminalResultFile(
  resultPath: string,
  normalizedLogPath: string,
  taskId: string,
  contract: HostTerminalResultContractV1 | undefined,
): string | null {
  if (contract?.version !== 1
    || contract.kind !== 'terminal-verdict'
    || contract.protocol !== 'xverify-v1'
    || !existsSync(resultPath)
    || !existsSync(normalizedLogPath)) {
    return null;
  }

  const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
  if (result['taskId'] !== taskId
    || result['selfAssessment'] !== 'NO_GO'
    || result['markerType'] !== 'EXIT_WITHOUT_RESULT'
    || result['exitCode'] !== 0) {
    return null;
  }

  const terminalOutput = extractTerminalAssistantOutputFromLog(
    readFileSync(normalizedLogPath, 'utf-8'),
  );
  if (!terminalOutput) return null;
  const terminalVerdict = terminalOutput.trim().split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .at(-1)!.trim();

  const preTerminalHeartbeat = {
    status: typeof result['lastHbStatus'] === 'string' && result['lastHbStatus'].length > 0
      ? result['lastHbStatus']
      : 'unknown',
    sequence: typeof result['lastHbSequence'] === 'number'
      ? result['lastHbSequence']
      : 0,
  };
  result['selfAssessment'] = 'DONE';
  result['testsPassed'] = true;
  result['notes'] = `Host-observed terminal xverify protocol completed.\n${terminalOutput}`;
  result['hostTerminalProjection'] = {
    version: 1,
    protocol: contract.protocol,
    observedBy: 'host',
    sourceMarker: {
      type: 'EXIT_WITHOUT_RESULT',
      exitCode: result['exitCode'],
      preTerminalHeartbeat,
    },
  };
  if (typeof result['completedAt'] !== 'string') result['completedAt'] = new Date().toISOString();
  delete result['markerType'];
  delete result['workPresent'];
  delete result['diffStat'];
  delete result['lastHbStatus'];
  delete result['lastHbSequence'];
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return terminalVerdict;
}

function hasSpawnLocksForTask(projectRoot: string, taskId: string): boolean {
  const locksDir = join(projectRoot, LOCKS_DIR);
  if (!existsSync(locksDir)) return false;
  try {
    return readdirSync(locksDir)
      .filter(file => file.endsWith('.spawnlock'))
      .some(file => {
        try {
          const lock = JSON.parse(readFileSync(join(locksDir, file), 'utf-8')) as { taskId?: string };
          return lock.taskId === taskId;
        } catch {
          return false;
        }
      });
  } catch {
    return true;
  }
}

/**
 * Preserve worker-writable landing artefacts outside the project mount before
 * removing them from `.tasks`; a continuation must never consume a prior
 * attempt's TERM-generated result or startup partial marker.
 */
export function archiveLandedAttemptArtifacts(
  tasksDir: string,
  taskId: string,
  ref: ExecutionLandingCheckpointRefV1,
): string[] {
  const archiveDir = resolve(dirname(executionLandingCheckpointPath(ref)), 'worker-artifacts');
  mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
  const names = [
    `task-${taskId}.result`,
    `task-${taskId}.partial-result`,
    `task-${taskId}.timeout`,
    `task-${taskId}.landing-proposal.json`,
    `task-${taskId}.log`,
  ];
  const evidenceRefs: string[] = [];
  for (const name of names) {
    const source = join(tasksDir, name);
    if (!existsSync(source)) {
      const archived = readdirSync(archiveDir)
        .filter(file => file.startsWith(`${name}.`) && file.endsWith('.archive'));
      if (archived.length > 1) {
        throw createDockerLifecycleError(`Conflicting LANDED worker artefact archives for ${name}`);
      }
      if (archived.length === 1) {
        const match = archived[0]!.match(/\.([a-f0-9]{64})\.archive$/);
        if (!match) throw createDockerLifecycleError(`Invalid LANDED worker artefact archive name: ${archived[0]}`);
        const content = readFileSync(resolve(archiveDir, archived[0]!));
        if (createHash('sha256').update(content).digest('hex') !== match[1]) {
          throw createDockerLifecycleError(`Corrupt LANDED worker artefact archive: ${archived[0]}`);
        }
        evidenceRefs.push(`worker-artifact:${name}:sha256:${match[1]}`);
      }
      continue;
    }
    const sourceStat = statSync(source);
    if (!sourceStat.isFile()) {
      throw createDockerLifecycleError(`LANDED worker artefact is not a regular file: ${source}`);
    }
    const content = readFileSync(source);
    const digest = createHash('sha256').update(content).digest('hex');
    const destination = resolve(archiveDir, `${name}.${digest}.archive`);
    if (existsSync(destination)) {
      const existing = readFileSync(destination);
      if (!existing.equals(content)) {
        throw createDockerLifecycleError(`Conflicting LANDED worker artefact archive: ${destination}`);
      }
    } else {
      const tmp = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
      try {
        writeFileSync(tmp, content, { mode: 0o600 });
        const fd = openSync(tmp, 'r');
        try { fsyncSync(fd); } finally { closeSync(fd); }
        renameSync(tmp, destination);
      } finally {
        try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* best effort */ }
      }
    }
    unlinkSync(source);
    evidenceRefs.push(`worker-artifact:${name}:sha256:${digest}`);
  }
  return evidenceRefs;
}

export interface ArchivedLandedAttemptLog {
  content: string;
  evidenceRef: string;
}

/**
 * Read one exact parent-attempt log from host authority and verify its
 * content-addressed archive name before exposing it as billing evidence.
 */
export function readArchivedLandedAttemptLog(
  ref: ExecutionLandingCheckpointRefV1,
): ArchivedLandedAttemptLog | null {
  const name = `task-${ref.taskId}.log`;
  const archiveDir = resolve(dirname(executionLandingCheckpointPath(ref)), 'worker-artifacts');
  if (!existsSync(archiveDir)) return null;
  const archived = readdirSync(archiveDir)
    .filter(file => file.startsWith(`${name}.`) && file.endsWith('.archive'));
  if (archived.length > 1) {
    throw createDockerLifecycleError(`Conflicting LANDED worker artefact archives for ${name}`);
  }
  if (archived.length === 0) return null;
  const match = archived[0]!.match(/\.([a-f0-9]{64})\.archive$/);
  if (!match) {
    throw createDockerLifecycleError(`Invalid LANDED worker artefact archive name: ${archived[0]}`);
  }
  const path = resolve(archiveDir, archived[0]!);
  const content = readFileSync(path);
  const actualDigest = createHash('sha256').update(content).digest('hex');
  if (actualDigest !== match[1]) {
    throw createDockerLifecycleError(`Corrupt LANDED worker artefact archive: ${archived[0]}`);
  }
  return {
    content: content.toString('utf-8'),
    evidenceRef: `worker-artifact:${name}:sha256:${actualDigest}`,
  };
}

function assertFiniteRuntimeCounters(
  usage: RuntimeBudgetUsageEvidence,
): RuntimeBudgetUsageEvidence['decision']['counters'] {
  const counters = usage.decision.counters;
  for (const field of [
    'turns',
    'inputTokens',
    'outputTokens',
    'cacheReadTokens',
    'cacheCreationTokens',
    'totalTokens',
    'maxContextTokens',
  ] as const) {
    const value = counters[field];
    if (!Number.isInteger(value) || value < 0) {
      throw createDockerLifecycleError(
        `Docker continuation runtime counter is invalid: ${field}=${String(value)}`,
      );
    }
  }
  return counters;
}

export interface ReconcileDockerContinuationLineageInput {
  resultPath: string;
  projectRoot: string;
  taskId: string;
  model: ModelType;
  settlementRef: TaskResultSettlementRefV1;
  executionContinuation: NonNullable<SpawnBackendOptions['executionContinuation']>;
  terminalUsage: RuntimeBudgetUsageEvidence | null;
  terminalBilling: ProviderBillingEvidence | null;
  terminalBillingEvidenceRef: string | null;
}

/**
 * Project the exact parent checkpoint + exact terminal attempt into the result
 * before immutable settlement. Token usage is mandatory host truth. Provider
 * billing is complete only when both exact provider envelopes survive.
 */
export function reconcileDockerContinuationLineageResultFile(
  input: ReconcileDockerContinuationLineageInput,
): boolean {
  assertTaskResultSettlementRef(input.projectRoot, input.taskId, input.settlementRef);
  if (
    input.executionContinuation.continuationAttemptId !== input.settlementRef.attemptId
    || input.executionContinuation.parentAttemptId === input.settlementRef.attemptId
  ) {
    throw createDockerLifecycleError('Docker continuation settlement lineage identity mismatch');
  }
  const parentRef: ExecutionLandingCheckpointRefV1 = {
    schemaVersion: 1,
    projectId: input.settlementRef.projectRootSha256,
    taskId: input.taskId,
    attemptId: input.executionContinuation.parentAttemptId,
  };
  const parent = readExecutionLandingCheckpointByRef(parentRef);
  if (
    !parent
    || parent.checkpointSha256 !== input.executionContinuation.checkpointSha256
    || parent.checkpoint.attemptId !== input.executionContinuation.parentAttemptId
  ) {
    throw createDockerLifecycleError('Docker continuation parent checkpoint authority mismatch');
  }
  if (
    !input.terminalUsage?.terminal
    || input.terminalUsage.projectId !== input.settlementRef.projectRootSha256
    || input.terminalUsage.taskId !== input.taskId
    || input.terminalUsage.attemptId !== input.settlementRef.attemptId
  ) {
    throw createDockerLifecycleError('Docker continuation terminal runtime evidence mismatch');
  }
  if (!existsSync(input.resultPath)) {
    throw createDockerLifecycleError('Docker continuation result is missing before lineage settlement');
  }
  const result = JSON.parse(readFileSync(input.resultPath, 'utf-8')) as TaskResult;
  if (result.taskId !== input.taskId) {
    throw createDockerLifecycleError('Docker continuation result task identity mismatch');
  }

  const parentCounters = parent.checkpoint.cumulativeUsage;
  const terminalCounters = assertFiniteRuntimeCounters(input.terminalUsage);
  const previousUsage = result.tokenUsage;
  result.tokenUsage = {
    inputTokens: parentCounters.inputTokens + terminalCounters.inputTokens,
    outputTokens: parentCounters.outputTokens + terminalCounters.outputTokens,
    cacheReadTokens: parentCounters.cacheReadTokens + terminalCounters.cacheReadTokens,
    cacheCreationTokens:
      parentCounters.cacheCreationTokens + terminalCounters.cacheCreationTokens,
    source: 'host-runtime-budget-lineage',
    provider: previousUsage?.provider ?? getProviderForModel(input.model),
    model: previousUsage?.model ?? input.model,
  };
  delete result.cost;

  const parentLog = readArchivedLandedAttemptLog(parentRef);
  if (input.terminalBilling && input.terminalBillingEvidenceRef) {
    const terminalReceipt = readTaskProviderTerminalBillingReceipt(input.settlementRef);
    const terminalBillingSha256 = createHash('sha256')
      .update(JSON.stringify({
        source: input.terminalBilling.source,
        provider: input.terminalBilling.provider,
        currency: input.terminalBilling.currency,
        providerReportedUsd: input.terminalBilling.providerReportedUsd,
        modelUsage: input.terminalBilling.modelUsage,
      }))
      .digest('hex');
    if (
      !terminalReceipt
      || input.terminalBillingEvidenceRef
        !== taskProviderTerminalBillingEvidenceRef(terminalReceipt)
      || terminalReceipt.billingSha256 !== terminalBillingSha256
    ) {
      throw createDockerLifecycleError('Docker continuation terminal billing evidence reference is invalid');
    }
    const parentBilling = parentLog
      ? extractProviderBillingEvidence(input.terminalBilling.provider, parentLog.content)
      : null;
    result.providerBilling = parentBilling
      ? aggregateProviderBillingEvidence([
          {
            attemptId: input.executionContinuation.parentAttemptId,
            evidenceRef: parentLog!.evidenceRef,
            billing: parentBilling,
          },
          {
            attemptId: input.settlementRef.attemptId,
            evidenceRef: input.terminalBillingEvidenceRef,
            billing: input.terminalBilling,
          },
        ])
      : {
          ...input.terminalBilling,
          lineage: {
            coverage: 'partial',
            attemptIds: [input.settlementRef.attemptId],
            evidenceRefs: [input.terminalBillingEvidenceRef],
            missingAttemptIds: [input.executionContinuation.parentAttemptId],
          },
        };
  } else {
    // A worker-authored or stale attempt-level total cannot represent this
    // cumulative result without an exact host-captured terminal envelope.
    delete result.providerBilling;
  }

  atomicWriteFileSync(input.resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return true;
}

interface DockerContinuationRecoveryAuthority {
  executionContinuation: NonNullable<SpawnBackendOptions['executionContinuation']>;
  executionBudget: NonNullable<SpawnBackendOptions['executionBudget']>;
  executionLandingPolicy: NonNullable<SpawnBackendOptions['executionLandingPolicy']>;
}

function settledContinuationCarriesLineage(
  settlement: NonNullable<ReturnType<typeof readTaskResultSettlement>>,
  authority: DockerContinuationRecoveryAuthority,
  terminalReceipt: TaskProviderTerminalBillingReceiptV1 | null,
): boolean {
  const result = settlement.result;
  const tokenUsage = result['tokenUsage'];
  if (
    !tokenUsage
    || typeof tokenUsage !== 'object'
    || Array.isArray(tokenUsage)
    || (tokenUsage as Record<string, unknown>)['source'] !== 'host-runtime-budget-lineage'
  ) {
    return false;
  }
  const billing = result['providerBilling'];
  if (!terminalReceipt) return billing === undefined;
  if (!billing || typeof billing !== 'object' || Array.isArray(billing)) return false;
  const lineage = (billing as Record<string, unknown>)['lineage'];
  if (!lineage || typeof lineage !== 'object' || Array.isArray(lineage)) return false;
  const record = lineage as Record<string, unknown>;
  const attemptIds = record['attemptIds'];
  const evidenceRefs = record['evidenceRefs'];
  const missingAttemptIds = record['missingAttemptIds'];
  if (
    !Array.isArray(attemptIds)
    || !attemptIds.includes(authority.executionContinuation.continuationAttemptId)
    || !Array.isArray(evidenceRefs)
    || !evidenceRefs.includes(taskProviderTerminalBillingEvidenceRef(terminalReceipt))
  ) {
    return false;
  }
  return record['coverage'] === 'complete'
    ? attemptIds.includes(authority.executionContinuation.parentAttemptId)
    : record['coverage'] === 'partial'
      && Array.isArray(missingAttemptIds)
      && missingAttemptIds.includes(authority.executionContinuation.parentAttemptId);
}

function finalizeDockerHostTerminalResult(
  projectRoot: string,
  tasksDir: string,
  taskId: string,
  settlementRef: TaskResultSettlementRefV1 | undefined,
  exitCode: number | null,
): boolean {
  clearPending(taskId);
  releaseAllSpawnLocks(projectRoot, taskId);
  releaseStaleSpawnLocksForTask(projectRoot, taskId);
  if (hasSpawnLocksForTask(projectRoot, taskId)) {
    throw new Error(`Docker host-terminal task ${taskId} still owns spawn locks`);
  }
  return persistDockerTaskResultSettlement(projectRoot, tasksDir, settlementRef, exitCode);
}

function reconcileDockerRuntimeBudgetResultFile(
  resultPath: string,
  taskId: string,
  model: ModelType,
  exitCode: number,
  budgetStop: RuntimeBudgetStopEvidence | null,
): boolean {
  if (!budgetStop) return false;
  let result: TaskResult;
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
  } catch {
    result = buildExitWithoutResultMarker({
      taskId,
      model,
      exitCode,
      workPresent: false,
      source: 'host',
    }) as unknown as TaskResult;
  }
  reconcileDockerRuntimeBudgetResult(result, exitCode, budgetStop);
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return true;
}

function reconcileDockerRuntimeBudgetUsageFile(
  resultPath: string,
  model: ModelType,
  usage: RuntimeBudgetUsageEvidence | null,
): boolean {
  if (!usage?.terminal || usage.decision.state !== 'within-budget' || !existsSync(resultPath)) {
    return false;
  }
  let result: TaskResult;
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
  } catch {
    // Usage evidence cannot manufacture a successful TaskResult. Missing or
    // corrupt result truth remains owned by the existing host fallback path.
    return false;
  }
  const changed = reconcileDockerRuntimeBudgetUsage(result, usage, {
    provider: getProviderForModel(model),
    model,
  });
  if (!changed) return false;
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return true;
}

function reconcileDockerLandingRequestedRuntimeBudgetUsageFile(
  resultPath: string,
  model: ModelType,
  usage: RuntimeBudgetUsageEvidence | null,
): boolean {
  if (!usage?.terminal || usage.decision.state !== 'landing-requested' || !existsSync(resultPath)) {
    return false;
  }
  let result: TaskResult;
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
  } catch {
    return false;
  }
  const changed = reconcileDockerLandingRequestedRuntimeBudgetUsage(result, usage, {
    provider: getProviderForModel(model),
    model,
  });
  if (!changed) return false;
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return true;
}

function reconcileDockerUnmeasurableRuntimeBudgetResultFile(
  resultPath: string,
  taskId: string,
  model: ModelType,
  exitCode: number,
  usage: RuntimeBudgetUsageEvidence | null,
): boolean {
  if (!usage || (usage.terminal && usage.decision.state !== 'unmeasurable')) return false;
  let result: TaskResult;
  try {
    result = JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
  } catch {
    result = buildExitWithoutResultMarker({
      taskId,
      model,
      exitCode,
      workPresent: false,
      source: 'host',
    }) as unknown as TaskResult;
  }
  reconcileDockerUnmeasurableRuntimeBudgetResult(result, usage);
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return true;
}

export function buildProviderPrivateHomeBootstrap(
  containerHome: string,
  providerBinary: string,
): string[] {
  return providerBinary === 'claude'
    ? [`mkdir -p "${containerHome}/.claude/session-env" || exit 78`]
    : [];
}

export interface DockerGitIsolation {
  available: boolean;
  mountArgs: string[];
  envArgs: string[];
  hostCommonDir?: string;
  containerGitDir?: string;
  /**
   * Linked-worktree adapter materialized immediately before `docker run`.
   * It replaces the host-absolute `.git` pointer with a container-native one
   * without exporting process-global GIT_DIR/GIT_WORK_TREE variables.
   */
  adapter?: Readonly<{
    hostPath: string;
    content: string;
  }>;
}

function readGitPointer(dotGitPath: string): string {
  const pointer = readFileSync(dotGitPath, 'utf-8').trim();
  const match = /^gitdir:\s*(.+)$/i.exec(pointer);
  if (!match?.[1]) {
    throw new Error(`Malformed Git worktree pointer at ${dotGitPath}`);
  }
  return match[1].trim();
}

/**
 * Build a read-only Git metadata view for Docker workers.
 *
 * A linked worktree's `.git` is a file containing an absolute host path. That
 * path does not exist in a Linux container (and is meaningless for a Windows
 * host path), so mounting only the worktree at `/workspace` breaks even
 * read-only `git status`. Explicit Git environment paths avoid host-path
 * leakage while preserving the common-dir/worktree-dir relationship.
 */
export function buildDockerGitIsolation(projectDir: string): DockerGitIsolation {
  const projectRoot = resolve(projectDir);
  const dotGitPath = join(projectRoot, '.git');
  if (!existsSync(dotGitPath)) {
    return { available: false, mountArgs: [], envArgs: [] };
  }

  let hostGitDir: string;
  let linkedWorktree = false;
  if (existsSync(join(dotGitPath, 'HEAD'))) {
    hostGitDir = dotGitPath;
  } else {
    linkedWorktree = true;
    const pointer = readGitPointer(dotGitPath);
    hostGitDir = resolve(isAbsolute(pointer) ? pointer : resolve(projectRoot, pointer));
  }

  const commonDirPointer = join(hostGitDir, 'commondir');
  const hostCommonDir = linkedWorktree && existsSync(commonDirPointer)
    ? resolve(hostGitDir, readFileSync(commonDirPointer, 'utf-8').trim())
    : hostGitDir;
  const relativeGitDir = relative(hostCommonDir, hostGitDir);
  if (relativeGitDir === '..' || relativeGitDir.startsWith(`..${sep}`) || isAbsolute(relativeGitDir)) {
    throw new Error(`Git worktree directory ${hostGitDir} escapes common directory ${hostCommonDir}`);
  }
  const containerRelativeGitDir = relativeGitDir.split(sep).join('/');
  const containerGitDir = containerRelativeGitDir
    ? `${CONTAINER_GIT_COMMON_DIR}/${containerRelativeGitDir}`
    : CONTAINER_GIT_COMMON_DIR;

  // Never export GIT_DIR/GIT_COMMON_DIR/GIT_WORK_TREE to the provider
  // process. Those variables are inherited by every child Git invocation and
  // make `git init <tmpdir>` or a nested repository operate on Deckent's
  // read-only metadata instead of its own target. Git's native repository
  // discovery is the isolation boundary: a primary checkout can consume its
  // mounted `.git` directory directly; a linked worktree receives an immutable
  // container-native gitfile pointing into the read-only common-dir mount.
  const adapter = linkedWorktree
    ? (() => {
        const identity = createHash('sha256')
          .update(`${projectRoot}\0${hostGitDir}\0${containerGitDir}`)
          .digest('hex');
        return {
          hostPath: join(tmpdir(), 'deckent-docker-git-adapters', identity, 'gitdir'),
          content: `gitdir: ${containerGitDir}\n`,
        } as const;
      })()
    : undefined;

  return {
    available: true,
    mountArgs: linkedWorktree
      ? [
          '--mount', `type=bind,src=${adapter!.hostPath},dst=${CONTAINER_WORKSPACE}/.git,readonly`,
          '--mount', `type=bind,src=${hostCommonDir},dst=${CONTAINER_GIT_COMMON_DIR},readonly`,
        ]
      : [
          '--mount', `type=bind,src=${dotGitPath},dst=${CONTAINER_WORKSPACE}/.git,readonly`,
        ],
    envArgs: [],
    hostCommonDir,
    containerGitDir,
    ...(adapter ? { adapter } : {}),
  };
}

/** Materialize the immutable linked-worktree pointer only when a spawn is imminent. */
export function materializeDockerGitIsolation(isolation: DockerGitIsolation): void {
  const adapter = isolation.adapter;
  if (!adapter) return;
  const adapterDir = dirname(adapter.hostPath);
  mkdirSync(adapterDir, { recursive: true, mode: 0o700 });
  if (existsSync(adapter.hostPath)) {
    const current = readFileSync(adapter.hostPath, 'utf-8');
    if (current !== adapter.content) {
      throw new DeckentError('DECKENT_E004', `Docker Git adapter identity conflict at ${adapter.hostPath}`);
    }
    return;
  }
  try {
    writeFileSync(adapter.hostPath, adapter.content, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  } catch (error) {
    // A concurrent worker for the same immutable worktree may win the first
    // write. Equal bytes are safe to share; any other state fails closed.
    if (!existsSync(adapter.hostPath) || readFileSync(adapter.hostPath, 'utf-8') !== adapter.content) {
      throw error;
    }
  }
}

function cleanupDockerGitAdapter(adapterHostPath: string | undefined): void {
  if (!adapterHostPath) return;
  try {
    if (existsSync(adapterHostPath)) unlinkSync(adapterHostPath);
  } catch (error) {
    debugLog('docker-backend:git-adapter-cleanup', error);
    return;
  }
  try {
    rmdirSync(dirname(adapterHostPath));
  } catch {
    // Concurrent attempts may still share or have recreated the directory.
  }
}

/**
 * Copy only Gemini's selected auth mechanism into the private worker HOME.
 * The full settings.json is intentionally not mounted because it may grow MCP,
 * tool, plugin, trust, or IDE configuration unrelated to the worker task.
 */
export function buildGeminiAuthSelectionBootstrap(
  home: string,
  readText: (path: string) => string = (path) => readFileSync(path, 'utf-8'),
): GeminiAuthSelectionBootstrap | null {
  try {
    const parsed = JSON.parse(readText(join(home, '.gemini', 'settings.json'))) as {
      security?: { auth?: { selectedType?: unknown } };
    };
    const selectedType = parsed.security?.auth?.selectedType;
    if (typeof selectedType !== 'string' || !/^[a-zA-Z0-9._-]{1,64}$/.test(selectedType)) return null;
    const minimalSettings = JSON.stringify({ security: { auth: { selectedType } } });
    return {
      selectedType,
      bootstrapLines: [
        `printf '%s\\n' '${minimalSettings}' > "$HOME/.gemini/settings.json" || exit 78`,
        'chmod 600 "$HOME/.gemini/settings.json" || exit 78',
      ],
    };
  } catch {
    return null;
  }
}

/**
 * Mount only provider credential files, never the host provider home. Full
 * homes contain MCP servers, skills, plugins, transcripts, and global rules;
 * mounting them made a scoped worker inherit a large unrelated context surface.
 */
export function buildProviderAuthIsolation(
  home: string,
  provider: string,
  oauthHomeDir: string | undefined,
  useApiOnly: boolean,
  fileExists: (path: string) => boolean = existsSync,
  options: ProviderAuthIsolationOptions = {},
): ProviderAuthIsolation {
  if (useApiOnly || !oauthHomeDir) {
    return {
      mountArgs: [],
      bootstrapLines: [],
      credentialCount: 0,
      missingRequiredFiles: [],
      executionConcurrency: 'not-applicable',
      credentialMutationLockScope: 'none',
    };
  }
  const mountArgs: string[] = [];
  const bootstrapLines: string[] = [];
  const writebackLines: string[] = [];
  const missingRequiredFiles: string[] = [];
  let credentialCount = 0;
  const lockTarget = `/run/deckent-auth-${provider}.lock`;
  if (options.lockPath) {
    mountArgs.push('--mount', `type=bind,src=${options.lockPath},dst=${lockTarget}`);
    bootstrapLines.push('command -v flock >/dev/null 2>&1 || exit 78');
    bootstrapLines.push(`exec 8<>"${lockTarget}" || exit 78`);
    bootstrapLines.push('flock -x 8 || exit 78');
  }
  for (const entry of PROVIDER_AUTH_FILES[provider] ?? []) {
    const { file } = entry;
    const hostRoot = Object.prototype.hasOwnProperty.call(options, 'hostCredentialRoot')
      ? options.hostCredentialRoot
      : join(home, oauthHomeDir);
    if (!hostRoot) {
      if (entry.required) missingRequiredFiles.push(file);
      continue;
    }
    const hostPath = joinHostCredentialPath(hostRoot, file);
    const credentialSource = options.credentialSources?.[file] ?? hostPath;
    if (!options.credentialSources?.[file] && !fileExists(credentialSource)) {
      if (entry.required) missingRequiredFiles.push(file);
      continue;
    }
    const source = `/run/deckent-auth-${provider}-${file.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const destination = `$HOME/${oauthHomeDir}/${file}`;
    // `--mount` handles Windows drive-letter colons correctly; legacy `-v
    // C:\\...:/target:ro` is ambiguous on native Windows Docker clients.
    mountArgs.push(
      '--mount',
      options.credentialSources?.[file]
        ? `type=bind,src=${credentialSource},dst=${source}`
        : `type=bind,src=${credentialSource},dst=${source},readonly`,
    );
    bootstrapLines.push(`mkdir -p "$HOME/${oauthHomeDir}" || exit 78`);
    bootstrapLines.push(`cp "${source}" "${destination}" || exit 78`);
    bootstrapLines.push(`chmod 600 "${destination}" || exit 78`);
    if (options.credentialSources?.[file]) {
      writebackLines.push(
        `[ ! -s "${destination}" ] || cp "${destination}" "${source}" || exit 78`,
      );
      writebackLines.push(`chmod 600 "${source}" || exit 78`);
    }
    credentialCount += 1;
  }
  if (options.lockPath) {
    // The provider runs against its task-private HOME. Keeping fd 8 open is
    // harmless, but retaining the exclusive lease here serializes the entire
    // model invocation and makes advertised worker concurrency fictitious.
    // Release immediately after the bounded broker -> private copy.
    bootstrapLines.push('flock -u 8 || exit 78');
  }
  if (writebackLines.length > 0) {
    bootstrapLines.push('sync_provider_auth() {');
    if (options.lockPath) bootstrapLines.push('  flock -x 8 || return 78');
    bootstrapLines.push(...writebackLines.map((line) => {
      const operation = line.replace(/ \|\| exit 78$/u, '');
      return options.lockPath
        ? `  ${operation} || { flock -u 8; return 78; }`
        : `  ${line}`;
    }));
    if (options.lockPath) bootstrapLines.push('  flock -u 8 || return 78');
    bootstrapLines.push('}');
  }
  return {
    mountArgs,
    bootstrapLines,
    ...(writebackLines.length > 0 ? { writebackLines: ['sync_provider_auth || exit 78'] } : {}),
    credentialCount,
    missingRequiredFiles,
    executionConcurrency: 'isolated-parallel',
    credentialMutationLockScope: options.lockPath ? 'bootstrap-and-writeback' : 'none',
  };
}

/**
 * Create a project-scoped, host-owned credential broker outside the repository.
 *
 * Concurrent containers share this broker under an exclusive lease, allowing
 * refresh-token rotation to flow from one worker to the next without exposing
 * the complete provider home. A newer explicit host login supersedes an older
 * broker snapshot; a newer broker is retained so a stale host file cannot
 * revoke the session mid-sprint.
 */
function prepareProviderAuthBroker(
  projectDir: string,
  provider: string,
  hostCredentialRoot: string | null,
): ProviderAuthIsolationOptions {
  if (!hostCredentialRoot) return { hostCredentialRoot: null };
  const projectKey = createHash('sha256').update(resolve(projectDir)).digest('hex').slice(0, 24);
  const brokerDir = join(tmpdir(), 'deckent-provider-auth', projectKey, provider);
  mkdirSync(brokerDir, { recursive: true, mode: 0o700 });
  chmodSync(brokerDir, 0o700);

  const credentialSources: Record<string, string> = {};
  for (const entry of PROVIDER_AUTH_FILES[provider] ?? []) {
    const hostPath = joinHostCredentialPath(hostCredentialRoot, entry.file);
    if (!existsSync(hostPath)) continue;
    const safeName = entry.file.replace(/[^a-zA-Z0-9._-]/g, '_');
    const brokerPath = join(brokerDir, safeName);
    const hostStat = statSync(hostPath);
    const brokerStat = existsSync(brokerPath) ? statSync(brokerPath) : null;
    if (!brokerStat || hostStat.mtimeMs > brokerStat.mtimeMs) {
      const tmpPath = `${brokerPath}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
      writeFileSync(tmpPath, readFileSync(hostPath), { mode: 0o600 });
      renameSync(tmpPath, brokerPath);
    }
    chmodSync(brokerPath, 0o600);
    credentialSources[entry.file] = brokerPath;
  }

  const lockPath = join(brokerDir, 'refresh.lock');
  if (!existsSync(lockPath)) writeFileSync(lockPath, '', { mode: 0o600 });
  chmodSync(lockPath, 0o600);
  return { credentialSources, lockPath, hostCredentialRoot };
}

/**
 * born-468 (WRAPPER-HB-GATE): the in-container wrapper's own heartbeat tick
 * writes a skeletal fallback heartbeat every 15s so the auditor's stale-worker
 * detector stays quiet even between the worker's own updates. Left unguarded,
 * that tick unconditionally overwrites $HBFILE and clobbers any richer
 * heartbeat the worker itself just wrote (currentAction etc., per
 * WORKER-GUIDE.md). 40s = ~2.5 wrapper ticks of slack — long enough that a
 * normal worker write cadence always wins, short enough that a genuinely
 * stalled worker's heartbeat still refreshes well before the auditor's >2min
 * stale threshold (auditor.md).
 *
 * TT553 (task 418-002) note: this wrapper tick is a CURRENTACTION-CARRIER
 * refresh, NOT the liveness authority. A docker worker's real liveness is the
 * HOST container-state signal (`docker wait`/`docker inspect`, see
 * monitorContainer + heartbeat-monitor.ts). Once the auditor/checkpoint kill
 * paths adopt heartbeat-monitor.ts::decideWorkerLiveness (host-primary), this
 * mtime-appeasement tick becomes vestigial — a container that stops updating
 * its `.hb` but is still Running must NOT be killed. Kept for now because those
 * two kill paths are out of this task's write scope (see .result docImpact).
 */
export const WRAPPER_HB_STALE_THRESHOLD_SECONDS = 40;

/**
 * Sprint 191 T-001: WSL2-safe memory defaults. Pre-191 hardcoded `8g/12g` proved
 * OOM-hostile on WSL2 hosts (~12-14GB total); cut to 4g/6g to break the exit-137
 * cycle. Cross-checked with `.deckent/config.json` worker_memory_limit/swap.
 */
export const DEFAULT_WORKER_MEMORY_LIMIT = '4g';
/** WORKER-ENV-TMPFS-001: default writable HOME tmpfs size for docker workers.
 *  A named default (config overrides it), mirroring DEFAULT_WORKER_MEMORY_LIMIT.
 *  100m was the historical hardcode that the 2026-08-08 smoke measured ENOSPC on. */
export const DEFAULT_WORKER_HOME_TMPFS_SIZE = '100m';
export const DEFAULT_WORKER_MEMORY_SWAP = '6g';

/**
 * Sprint 191 T-001: pure helper to normalize docker memory strings (e.g. `4g`,
 * `4096m`, `4194304k`, `0.5g`, `4294967296`, `4294967296b`) into bytes for
 * comparison. Returns null for malformed/missing/non-positive input.
 *
 * Exported for unit tests; backend internals use it to guard against config
 * drift between `--memory` and `--memory-swap`.
 */
export function parseMemoryString(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([0-9]*\.?[0-9]+)\s*([kmgtb]?)$/i);
  if (!match) return null;
  const num = Number.parseFloat(match[1]!);
  if (!Number.isFinite(num) || num <= 0) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const multipliers: Record<string, number> = {
    '': 1,
    b: 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
    t: 1024 ** 4,
  };
  const mul = multipliers[unit];
  if (mul === undefined) return null;
  return Math.floor(num * mul);
}

/**
 * F1-LIM faz-2a (Sprint 272): Derive the docker `--memory-swap` value from a
 * limit byte count, matching the 4g/6g default ratio (× 1.5).
 *
 * The result is an integer MB string (e.g. '1152m') — docker accepts this
 * format directly. Exported for unit tests.
 */
export function deriveSwapFromLimitBytes(limitBytes: number): string {
  const swapBytes = Math.floor(limitBytes * 1.5);
  const mb = Math.floor(swapBytes / (1024 * 1024));
  return `${mb}m`;
}

// ─── Sprint 272 T-003: exit-without-result enriched marker ──────────────────
// Live pattern (3 sprints running): a worker finishes its work (git diff on disk,
// heartbeat seq high) but exits — often CLEANLY, exitCode 0, on a usage-limit /
// stream interruption — WITHOUT writing `.result`. The old EXIT-trap else-branch
// wrote a blind NO_GO ("Worker exited without writing result"), indistinguishable
// from a worker that did nothing. These two helpers (a) add a last-chance flush
// window and (b) enrich the partial with a discriminator so the FIX phase
// (Task 272-004) can tell "work present, result missing" (→ verify-and-complete)
// apart from "nothing done". The marker stays a NO_GO candidate: existing
// evaluation is unchanged; the new fields are purely additive.

/** Input for {@link buildExitWithoutResultMarker}. */
export interface ExitWithoutResultMarkerInput {
  taskId: string;
  model: string;
  /** Container exit code (`docker wait`). >128 ⇒ signal (137 = SIGKILL/OOM). */
  exitCode: number;
  /** true when a `git diff` shows ≥1 changed file on the shared volume. */
  workPresent: boolean;
  /** `git diff --shortstat` summary, e.g. `3 files changed, 45 insertions(+)`. */
  diffStat?: string;
  /** Last heartbeat status read from the `.hb` file (best-effort). */
  lastHbStatus?: string;
  /** Last heartbeat sequence read from the `.hb` file (best-effort). */
  lastHbSequence?: number;
  /** Where the marker was synthesized: container EXIT trap or host monitor. */
  source?: 'wrapper' | 'host';
}

/** Canonical EXIT_WITHOUT_RESULT partial — a NO_GO candidate carrying FIX-routing hints. */
export interface ExitWithoutResultMarker {
  taskId: string;
  workerId: string;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  testsPassed: boolean;
  coverage: number;
  selfAssessment: 'NO_GO';
  markerType: 'EXIT_WITHOUT_RESULT';
  workPresent: boolean;
  diffStat: string;
  lastHbStatus: string;
  lastHbSequence: number;
  exitCode: number;
  notes: string;
  tokenUsage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; provider: string; model: string };
}

/**
 * Build the canonical EXIT_WITHOUT_RESULT marker. `selfAssessment` stays `NO_GO`
 * so the evaluator is unchanged; `markerType`/`workPresent` are additive
 * discriminators the FIX phase consumes. The TS shape mirrors the JSON the
 * container EXIT trap writes (see {@link buildOnExitTrap}) so both origins
 * (wrapper + host monitor) are schema-compatible for the evaluator.
 */
export function buildExitWithoutResultMarker(input: ExitWithoutResultMarkerInput): ExitWithoutResultMarker {
  const signalInfo = input.exitCode > 128 ? ` signal=${input.exitCode - 128}` : '';
  const diffStat = (input.diffStat ?? '').trim();
  const source = input.source ?? 'host';
  const workNote = input.workPresent
    ? `work present on disk (${diffStat || 'diff detected'}) — FIX should verify-and-complete the partial work rather than restart from scratch`
    : 'no changed files detected — nothing to recover';
  return {
    taskId: input.taskId,
    workerId: `docker-${input.taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    markerType: 'EXIT_WITHOUT_RESULT',
    workPresent: input.workPresent,
    diffStat,
    lastHbStatus: input.lastHbStatus ?? 'unknown',
    lastHbSequence: input.lastHbSequence ?? 0,
    exitCode: input.exitCode,
    // Keeps the lowercase `code=<n>` form of the historical host-fallback note (the
    // wrapper EXIT trap uses `exitCode=`). The canonical classifier phrase "Worker
    // exited without writing result" is preserved either way (result-collector /
    // result-evaluator NO_RESULT_CRASH_PATTERN).
    notes:
      `Worker exited without writing result (code=${input.exitCode}${signalInfo}, source=${source}). `
      + `EXIT_WITHOUT_RESULT marker — workPresent=${input.workPresent}; ${workNote}.`,
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: input.model },
  };
}

/**
 * born-667b (RECON-DIFF, task 427-024): POSIX-single-quote every entry of a
 * task's `scope.filesWrite` list and join them into a `git ... -- <pathspec>`
 * argument string. Embedded `'` is escaped via the standard `'\''` POSIX idiom
 * (close quote, escaped literal quote, reopen quote). Blank/non-string entries
 * are dropped. Pure — exported for unit tests.
 */
export function buildScopedDiffPathspec(scopeFilesWrite: readonly string[]): string {
  return scopeFilesWrite
    .map((f) => (typeof f === 'string' ? f.trim() : ''))
    .filter((f) => f.length > 0)
    .map((f) => `'${f.split('\'').join('\'\\\'\'')}'`)
    .join(' ');
}

/** Delimiter between a path and its baseline hash in the scope-baseline manifest. */
export const SCOPE_BASELINE_DELIM = '\t';

/**
 * 455-003 (TIMEOUT-BASELINE-TRUTH): capture a task-start CONTENT baseline for the
 * scoped files so the container EXIT-trap can tell THIS worker's partial work
 * apart from files that were ALREADY dirty when the task started — a previous
 * task's leftover, an operator's local edit, or (the born-667b sibling case) a
 * concurrent worker mid-edit whose changes leak through the shared bind-mount.
 *
 * born-667b narrowed the diff to `scope.filesWrite` (sibling isolation across
 * DIFFERENT files); this closes the remaining hole: a file that IS in scope but
 * was dirty BEFORE the worker started would still have produced a false
 * TIMEOUT_WITH_WORK. The fix is a per-file content fingerprint captured at spawn.
 *
 * For each scoped entry that exists on disk at spawn, records
 * `<path>\t<gitHashObject>` — the SAME `git hash-object` blob id the in-container
 * trap recomputes at exit. The host writes the content-addressed blob into Git's
 * object store so post-exit numstat can compare exact claim-time bytes without a
 * worktree copy. A file that does not yet
 * exist is omitted (no entry ⇒ "created by the worker" at exit ⇒ counted as work,
 * so genuine new task-local work stays recoverable).
 *
 * Never throws — a per-file failure just omits that file (fail-open ⇒ at worst
 * that one file is counted, the pre-455-003 behavior). Exported for unit tests
 * (real-git repo). Returns '' when nothing could be baselined (⇒ the trap falls
 * through to its unfiltered legacy behavior).
 */
export async function computeScopeBaselineManifest(
  dir: string,
  scopeFilesWrite: readonly string[],
): Promise<string> {
  const lines: string[] = [];
  for (const raw of scopeFilesWrite) {
    const rel = typeof raw === 'string' ? raw.trim() : '';
    if (!rel) continue;
    let abs: string;
    try { abs = resolve(dir, rel); } catch { continue; }
    if (!existsSync(abs)) continue;
    // sprint-686 canlı vakası: tek transient git-hatası (index/object-db yarışı
    // sınıfı) fail-closed capture-throw'una dönüşüp bütün spawn'ı düşürdü ve
    // stderr yalnız debugLog'a gitti. Bir kez kısa-beklemeli retry + son-deneme
    // stderr'inin görünür loglanması; kalıcı hata yine dürüstçe omit edilir
    // (dış katman typed E_ATTRIBUTION_BASELINE_CAPTURE_FAILED üretir).
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await runGitCommandAsync(dir, ['hash-object', '-w', '--', rel]);
        const hash = res.stdout.toString('utf-8').trim();
        if (res.status === 0 && /^[0-9a-f]{40,64}$/.test(hash)) {
          lines.push(`${rel}${SCOPE_BASELINE_DELIM}${hash}`);
          break;
        }
        if (attempt === 1) {
          console.error(`[deckent] scope-baseline capture failed for ${rel}: status=${String(res.status)} stderr=${res.stderr.toString('utf-8').slice(0, 200)}`);
        }
      } catch (e) {
        debugLog('docker-backend:scope-baseline', e);
        if (attempt === 1) break;
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 150));
    }
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}

export const SCOPE_ATTRIBUTION_HEADER = '#deckent-scope-attribution-v1';

function normalizedScopeFiles(values: readonly string[]): string[] {
  const normalized = values
    .map(value => value.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(Boolean);
  for (const value of normalized) {
    if (
      value.startsWith('/')
      || /^[A-Za-z]:\//.test(value)
      || value.split('/').some(segment => segment === '..' || segment.length === 0)
    ) {
      throw new TypeError(`invalid attribution scope path:${value}`);
    }
  }
  return [...new Set(normalized)]
    .sort((a, b) => a.localeCompare(b));
}

function globSelectorRegex(pattern: string): RegExp {
  const normalized = normalizedScopeFiles([pattern])[0];
  if (!normalized) throw new TypeError('empty attribution glob');
  let source = '^';
  for (let index = 0; index < normalized.length; index++) {
    const char = normalized[index]!;
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        source += '.*';
        index++;
      } else source += '[^/]*';
    } else if (char === '?') source += '[^/]';
    else if ('\\^$+?.()|{}[]'.includes(char)) source += `\\${char}`;
    else source += char;
  }
  return new RegExp(`${source}$`, 'u');
}

function selectorMatches(selector: ScopeSelector, path: string): boolean {
  if (selector.kind === 'exact-file') return path === selector.path;
  if (selector.kind === 'directory-tree') {
    return path === selector.path || path.startsWith(`${selector.path}/`);
  }
  return globSelectorRegex(selector.pattern).test(path);
}

/**
 * Expand only the compiled selector authority. Raw authored strings never take
 * part in settlement comparison. Portable case collisions fail closed.
 */
export function resolveCanonicalAttributionFiles(
  manifest: CanonicalScopeManifest,
  inventory: readonly string[],
): string[] {
  const normalizedInventory = normalizedScopeFiles(inventory);
  const byPortableKey = new Map<string, string>();
  for (const path of normalizedInventory) {
    const key = path.normalize('NFC').toLowerCase();
    const previous = byPortableKey.get(key);
    if (previous && previous !== path) {
      throw new TypeError(`portable attribution path collision:${previous}|${path}`);
    }
    byPortableKey.set(key, path);
  }
  const selectors = manifest.selectors.filesWrite;
  const exact = selectors
    .filter((selector): selector is Extract<ScopeSelector, { kind: 'exact-file' }> => selector.kind === 'exact-file')
    .map(selector => selector.path);
  return normalizedScopeFiles([
    ...exact,
    ...normalizedInventory.filter(path => selectors.some(selector => selectorMatches(selector, path))),
  ]);
}

function scopeAttributionDigest(values: readonly string[]): string {
  return createHash('sha256').update(canonicalJson(normalizedScopeFiles(values))).digest('hex');
}

export function buildScopeAttributionManifest(
  attemptId: string,
  scopeFilesWrite: readonly string[],
  contentManifest: string,
): string {
  const header = [
    SCOPE_ATTRIBUTION_HEADER,
    attemptId,
    scopeAttributionDigest(scopeFilesWrite),
  ].join(SCOPE_BASELINE_DELIM);
  return `${header}\n${contentManifest}`;
}

export async function captureScopeAttributionManifest(
  projectRoot: string,
  attemptId: string,
  scopeFilesWrite: readonly string[],
): Promise<string> {
  const scopeFiles = normalizedScopeFiles(scopeFilesWrite);
  const contentManifest = await computeScopeBaselineManifest(projectRoot, scopeFiles);
  const captured = new Set(contentManifest
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => line.slice(0, line.indexOf(SCOPE_BASELINE_DELIM))));
  for (const path of scopeFiles) {
    if (existsSync(resolve(projectRoot, path)) && !captured.has(path)) {
      throw new DeckentError('E_ATTRIBUTION_BASELINE_CAPTURE_FAILED', `attribution-baseline-capture-failed:${path}`);
    }
  }
  return buildScopeAttributionManifest(attemptId, scopeFiles, contentManifest);
}

export interface ReconcileDockerResultWorkAttributionInput {
  readonly projectRoot: string;
  readonly resultPath: string;
  readonly baselinePath: string;
  readonly attemptId: string | undefined;
  readonly scopeFilesWrite: readonly string[];
  /** Preferred single authority; raw scope is compatibility-only when absent. */
  readonly scopeManifest?: CanonicalScopeManifest;
  /** Spawn-time inventory plus matching files created during the attempt. */
  readonly scopeInventory?: readonly string[];
  /**
   * Host-owned durable limit-death evidence for THIS attempt (born 3324). Only
   * a stop record the host itself persisted counts; nothing here is ever read
   * from the worker's own result fields.
   */
  readonly providerLimitDeath?: RuntimeBudgetStopEvidence | null;
}

export interface DockerResultWorkAttributionOutcome {
  readonly state: 'VERIFIED' | 'HOLD';
  readonly filesChanged: readonly string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly reasonCode?: KnownWorkAttributionReasonCode;
}

/**
 * Exactness for the limit-death class: the stop record must belong to the same
 * attempt the baseline was captured for, and must be a terminal `exceeded`
 * decision. A foreign or non-terminal marker is not evidence of this attempt's
 * death, so it never mints the class.
 */
function isExactProviderLimitDeath(
  evidence: RuntimeBudgetStopEvidence | null | undefined,
  attemptId: string | undefined,
): boolean {
  return !!evidence
    && !!attemptId
    && evidence.attemptId === attemptId
    && evidence.state === 'exceeded'
    && evidence.decision.state === 'exceeded';
}

/** Default Node child_process maxBuffer (1 MiB) — matches the spawnSync default these calls replace. */
const GIT_ASYNC_COMMAND_MAX_BUFFER_BYTES = 1024 * 1024;
const GIT_ASYNC_COMMAND_TIMEOUT_MS = 5_000;

interface GitAsyncCommandResult {
  readonly status: number | null;
  readonly stdout: Buffer<ArrayBufferLike>;
  readonly stderr: Buffer<ArrayBufferLike>;
}

/**
 * Async, non-blocking `git` subprocess runner for the result-attribution evidence
 * path (born-511-001). Mirrors the spawnSync options it replaces (`cwd`,
 * `timeout: 5_000`) but never blocks the Node.js event loop while the subprocess
 * runs. Returns raw Buffer output — unlike {@link runBoundedCrossVerifyRuntimeCommand}
 * this must not coerce to utf-8 internally, since `git cat-file blob` output can be
 * arbitrary (binary) file content.
 */
function runGitCommandAsync(cwd: string, args: readonly string[]): Promise<GitAsyncCommandResult> {
  return new Promise(resolveCommand => {
    let settled = false;
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let child: ReturnType<typeof nodeSpawn>;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: GitAsyncCommandResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveCommand(result);
    };
    const append = (current: Buffer<ArrayBufferLike>, chunk: string | Buffer): Buffer<ArrayBufferLike> => {
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = GIT_ASYNC_COMMAND_MAX_BUFFER_BYTES - current.length;
      if (remaining <= 0) return current;
      return Buffer.concat([current, incoming.subarray(0, remaining)]);
    };

    try {
      child = nodeSpawn('git', [...args], { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolveCommand({
        status: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.from(error instanceof Error ? error.message : String(error)),
      });
      return;
    }

    child.stdout?.on('data', chunk => { stdout = append(stdout, chunk as string | Buffer); });
    child.stderr?.on('data', chunk => { stderr = append(stderr, chunk as string | Buffer); });
    child.once('error', error => finish({ status: null, stdout, stderr: Buffer.from(error.message) }));
    child.once('close', code => finish({ status: code, stdout, stderr }));

    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // The process may already have exited.
      }
      finish({ status: null, stdout, stderr: Buffer.from('git command timed out') });
    }, GIT_ASYNC_COMMAND_TIMEOUT_MS);
    timer.unref();
  });
}

async function gitBlobHash(projectRoot: string, path: string): Promise<string | null> {
  if (!existsSync(resolve(projectRoot, path))) return null;
  const result = await runGitCommandAsync(projectRoot, ['hash-object', '-w', '--', path]);
  const hash = result.stdout.toString('utf-8').trim();
  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/.test(hash)) {
    throw new DeckentError('E_BLOB_HASH_UNAVAILABLE', `blob-hash-unavailable:${path}`);
  }
  return hash;
}

function countTextLines(bytes: Buffer): number {
  if (bytes.includes(0)) throw new DeckentError('E_BINARY_OR_UNMEASURABLE_NUMSTAT', 'binary-or-unmeasurable-numstat');
  if (bytes.length === 0) return 0;
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines++;
  return bytes[bytes.length - 1] === 0x0a ? lines : lines + 1;
}

async function gitBlobLineCount(projectRoot: string, hash: string): Promise<number> {
  const result = await runGitCommandAsync(projectRoot, ['cat-file', 'blob', hash]);
  if (result.status !== 0) {
    throw new DeckentError('E_BASELINE_BLOB_UNAVAILABLE', 'baseline-blob-unavailable');
  }
  return countTextLines(result.stdout);
}

async function blobNumstat(
  projectRoot: string,
  beforeHash: string,
  afterHash: string,
): Promise<{ added: number; removed: number }> {
  const result = await runGitCommandAsync(projectRoot, ['diff', '--numstat', beforeHash, afterHash]);
  const first = result.stdout.toString('utf-8').trim().split(/\r?\n/, 1)[0] ?? '';
  const [addedRaw, removedRaw] = first.split('\t');
  if (
    result.status !== 0
    || !/^\d+$/.test(addedRaw ?? '')
    || !/^\d+$/.test(removedRaw ?? '')
  ) {
    throw new DeckentError('E_BINARY_OR_UNMEASURABLE_NUMSTAT', 'binary-or-unmeasurable-numstat');
  }
  return { added: Number(addedRaw), removed: Number(removedRaw) };
}

async function measureExactDockerHostWorkAttribution(input: Readonly<{
  projectRoot: string;
  identity: TaskAttemptCustodyIdentityV2;
  admissionRefDigest: Sha256Digest;
  dispatchRequestId: string;
  scopeFilesWrite: readonly string[];
  scopeBaseline: string;
  scopeBaselineSha256: Sha256Digest;
  providerExitObservationReceiptDigest: Sha256Digest;
}>): Promise<ExactDockerHostWorkAttributionV2> {
  let scopeFiles: string[] = [];
  let expectedScopeDigest = ''.padStart(64, '0');
  const baselineSha256 = createHash('sha256').update(input.scopeBaseline).digest('hex');
  const finish = (
    state: 'VERIFIED' | 'HOLD',
    reasonCode: ExactDockerHostWorkAttributionV2['reasonCode'],
    filesChanged: ExactDockerHostWorkAttributionV2['filesChanged'] = [],
  ): ExactDockerHostWorkAttributionV2 => {
    const body = Object.freeze({
      schemaVersion: 2 as const,
      kind: 'exact-docker-host-work-attribution' as const,
      state,
      attemptId: input.identity.attemptId,
      dispatchRequestId: input.dispatchRequestId,
      admissionRefDigest: input.admissionRefDigest,
      providerExitObservationReceiptDigest: input.providerExitObservationReceiptDigest,
      baselineRef: `task-attempt-custody-provider-exit:${input.providerExitObservationReceiptDigest}#scope-baseline:sha256:${baselineSha256}`,
      baselineSha256,
      scopeDigest: expectedScopeDigest,
      filesChanged: Object.freeze(filesChanged.map(change => Object.freeze({ ...change }))),
      totalLinesAdded: filesChanged.reduce((total, change) => total + change.linesAdded, 0),
      totalLinesRemoved: filesChanged.reduce((total, change) => total + change.linesRemoved, 0),
      reasonCode,
    });
    return Object.freeze({ ...body, evidenceDigest: exactCustodyJsonDigest(body) });
  };
  let lines: string[];
  try {
    scopeFiles = normalizedScopeFiles(input.scopeFilesWrite);
    expectedScopeDigest = scopeAttributionDigest(scopeFiles);
    if (input.scopeBaselineSha256 !== `sha256:${baselineSha256}`) {
      return finish('HOLD', 'BASELINE_INVALID');
    }
    lines = input.scopeBaseline.split(/\r?\n/u);
    const [marker, subject, manifestScopeDigest] = (lines.shift() ?? '')
      .split(SCOPE_BASELINE_DELIM);
    if (marker !== SCOPE_ATTRIBUTION_HEADER
      || subject !== input.dispatchRequestId
      || manifestScopeDigest !== expectedScopeDigest) {
      return finish('HOLD', 'BASELINE_INVALID');
    }
  } catch {
    return finish('HOLD', 'BASELINE_INVALID');
  }
  const scopeSet = new Set(scopeFiles);
  const baseline = new Map<string, string>();
  for (const line of lines!) {
    if (!line) continue;
    const delimiter = line.indexOf(SCOPE_BASELINE_DELIM);
    const path = delimiter > 0 ? line.slice(0, delimiter) : '';
    const hash = delimiter > 0 ? line.slice(delimiter + 1) : '';
    if (!scopeSet.has(path) || baseline.has(path) || !/^[0-9a-f]{40,64}$/u.test(hash)) {
      return finish('HOLD', 'BASELINE_INVALID');
    }
    baseline.set(path, hash);
  }
  const changes: Array<{
    path: string;
    status: 'added' | 'modified' | 'deleted';
    linesAdded: number;
    linesRemoved: number;
  }> = [];
  try {
    for (const path of scopeFiles) {
      const beforeHash = baseline.get(path) ?? null;
      const afterHash = await gitBlobHash(input.projectRoot, path);
      if (beforeHash === afterHash) continue;
      const counts = beforeHash === null
        ? { added: countTextLines(readFileSync(resolve(input.projectRoot, path))), removed: 0 }
        : afterHash === null
          ? { added: 0, removed: await gitBlobLineCount(input.projectRoot, beforeHash) }
          : await blobNumstat(input.projectRoot, beforeHash, afterHash);
      changes.push({
        path,
        status: beforeHash === null ? 'added' : afterHash === null ? 'deleted' : 'modified',
        linesAdded: counts.added,
        linesRemoved: counts.removed,
      });
    }
  } catch (error) {
    debugLog('docker-backend:exact-host-work-attribution', error);
    return finish('HOLD', 'DIFF_UNMEASURABLE');
  }
  return finish('VERIFIED', 'NONE', changes);
}

function exactCanonicalHostWorkAuthority(
  evidence: ExactDockerHostWorkAttributionV2,
  scope: PreparedExactDockerCustodyScope,
  providerExit: ExactDockerProviderExitObservationRefV2,
): CanonicalIngressCustodyAuthority['hostWorkAuthority'] | null {
  const record = exactOwnDataRecord(evidence, [
    'schemaVersion', 'kind', 'state', 'attemptId', 'dispatchRequestId',
    'admissionRefDigest', 'providerExitObservationReceiptDigest', 'baselineRef',
    'baselineSha256', 'scopeDigest', 'filesChanged', 'totalLinesAdded',
    'totalLinesRemoved', 'reasonCode', 'evidenceDigest',
  ]);
  if (!record || record.schemaVersion !== 2
    || record.kind !== 'exact-docker-host-work-attribution'
    || record.state !== 'VERIFIED' || record.reasonCode !== 'NONE'
    || record.attemptId !== scope.identity.attemptId
    || record.dispatchRequestId !== scope.admissionRef.dispatchRequestId
    || record.admissionRefDigest !== scope.admissionRef.refDigest
    || record.providerExitObservationReceiptDigest
      !== providerExit.observationReceiptDigest
    || record.baselineSha256
      !== scope.taskSnapshot.dispatch.scopeBaselineSha256.slice('sha256:'.length)
    || record.scopeDigest
      !== scopeAttributionDigest(scope.taskSnapshot.material.dispatch.scope.filesWrite)
    || record.baselineRef
      !== `task-attempt-custody-provider-exit:${providerExit.observationReceiptDigest}#scope-baseline:sha256:${String(record.baselineSha256)}`
    || !Array.isArray(record.filesChanged)
    || !Number.isSafeInteger(record.totalLinesAdded)
    || !Number.isSafeInteger(record.totalLinesRemoved)
    || !isExactDigest(record.evidenceDigest)) return null;
  const scopeSet = new Set(normalizedScopeFiles(
    scope.taskSnapshot.material.dispatch.scope.filesWrite,
  ));
  const filesChanged = record.filesChanged.flatMap((entry) => {
    const change = exactOwnDataRecord(entry, [
      'path', 'status', 'linesAdded', 'linesRemoved',
    ]);
    if (!change || typeof change.path !== 'string' || !scopeSet.has(change.path)
      || !['added', 'modified', 'deleted'].includes(String(change.status))
      || !Number.isSafeInteger(change.linesAdded) || Number(change.linesAdded) < 0
      || !Number.isSafeInteger(change.linesRemoved) || Number(change.linesRemoved) < 0) return [];
    return [Object.freeze({
      path: change.path,
      status: change.status as 'added' | 'modified' | 'deleted',
      linesAdded: Number(change.linesAdded),
      linesRemoved: Number(change.linesRemoved),
    })];
  });
  if (filesChanged.length !== record.filesChanged.length
    || filesChanged.reduce((sum, change) => sum + change.linesAdded, 0)
      !== record.totalLinesAdded
    || filesChanged.reduce((sum, change) => sum + change.linesRemoved, 0)
      !== record.totalLinesRemoved) return null;
  const { evidenceDigest: _evidenceDigest, ...body } = evidence;
  if (exactCustodyJsonDigest(body) !== record.evidenceDigest) return null;
  const authorityBody = Object.freeze({
    filesChanged: Object.freeze(filesChanged),
    totalLinesAdded: Number(record.totalLinesAdded),
    totalLinesRemoved: Number(record.totalLinesRemoved),
    workAttribution: Object.freeze({
      state: 'VERIFIED' as const,
      attemptId: scope.identity.attemptId,
      baselineRef: record.baselineRef as string,
      baselineSha256: record.baselineSha256 as string,
      scopeDigest: record.scopeDigest as string,
    }),
    providerExitObservationReceiptDigest: providerExit.observationReceiptDigest,
  });
  return Object.freeze({
    ...authorityBody,
    evidenceDigest: exactCustodyJsonDigest(authorityBody),
  });
}

function resultClaimedPaths(result: Record<string, unknown>): string[] {
  if (!Array.isArray(result.filesChanged)) return [];
  return result.filesChanged.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    if (entry && typeof entry === 'object' && typeof (entry as { path?: unknown }).path === 'string') {
      return [(entry as { path: string }).path];
    }
    return [];
  }).map(path => path.replace(/\\/g, '/').replace(/^\.\//, ''));
}

function previouslyMeasuredChanges(result: Record<string, unknown>): Array<{
  path: string;
  status: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesRemoved: number;
}> {
  if (!Array.isArray(result.filesChanged)) return [];
  return result.filesChanged.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const value = entry as Record<string, unknown>;
    if (typeof value.path !== 'string') return [];
    const status = value.status;
    if (status !== 'added' && status !== 'modified' && status !== 'deleted') return [];
    if (!Number.isSafeInteger(value.linesAdded) || !Number.isSafeInteger(value.linesRemoved)) return [];
    return [{
      path: value.path,
      status,
      linesAdded: Number(value.linesAdded),
      linesRemoved: Number(value.linesRemoved),
    }];
  });
}

function writeAttributionResult(
  input: ReconcileDockerResultWorkAttributionInput,
  result: Record<string, unknown>,
  outcome: DockerResultWorkAttributionOutcome,
  scopeDigest: string,
  claimedOutsideScope: readonly string[],
  changes: readonly { path: string; status: 'added' | 'modified' | 'deleted'; linesAdded: number; linesRemoved: number }[],
  baselineSha256?: string,
): void {
  const priorClaim = result.workerWorkClaim && typeof result.workerWorkClaim === 'object'
    ? result.workerWorkClaim as Record<string, unknown> : undefined;
  const workerClaim = {
    filesChanged: Array.isArray(priorClaim?.filesChanged)
      ? priorClaim.filesChanged.filter((path): path is string => typeof path === 'string')
      : resultClaimedPaths(result),
    linesAdded: priorClaim && (priorClaim.linesAdded === null || Number.isSafeInteger(priorClaim.linesAdded))
      ? priorClaim.linesAdded as number | null
      : Number.isSafeInteger(result.linesAdded) ? Number(result.linesAdded) : null,
    linesRemoved: priorClaim && (priorClaim.linesRemoved === null || Number.isSafeInteger(priorClaim.linesRemoved))
      ? priorClaim.linesRemoved as number | null
      : Number.isSafeInteger(result.linesRemoved) ? Number(result.linesRemoved) : null,
  };
  const canonicalShape = result.schemaVersion === '1.0' || result.schemaVersion === 1
    || (Array.isArray(result.filesChanged) && result.filesChanged.some(entry => entry && typeof entry === 'object'));
  result.filesChanged = canonicalShape ? changes : [...outcome.filesChanged];
  result.linesAdded = outcome.linesAdded;
  result.linesRemoved = outcome.linesRemoved;
  result.totalLinesAdded = outcome.linesAdded;
  result.totalLinesRemoved = outcome.linesRemoved;
  result.workAttribution = {
    state: outcome.state,
    attemptId: input.attemptId ?? 'unbound',
    baselineRef: baselineSha256
      ? `task-result-work-attribution-baseline:sha256:${baselineSha256}`
      : 'task-result-work-attribution-baseline:unavailable',
    ...(baselineSha256 ? { baselineSha256 } : {}),
    scopeDigest,
    ...(outcome.reasonCode ? { reasonCode: outcome.reasonCode } : {}),
    ...(claimedOutsideScope.length > 0 ? { claimedOutsideScope } : {}),
  };
  result.workerWorkClaim = {
    ...workerClaim,
    mismatch: JSON.stringify([...workerClaim.filesChanged].sort())
      !== JSON.stringify([...outcome.filesChanged].sort())
      || (workerClaim.linesAdded !== null && workerClaim.linesAdded !== outcome.linesAdded)
      || (workerClaim.linesRemoved !== null && workerClaim.linesRemoved !== outcome.linesRemoved),
  };
  if (outcome.state === 'HOLD') {
    result.selfAssessment = 'NO_GO';
    const existing = typeof result.notes === 'string' ? result.notes : '';
    result.notes = `${existing}${existing ? '\n' : ''}WORK_ATTRIBUTION_HOLD:${outcome.reasonCode ?? 'unknown'}`;
  }
  atomicWriteFileSync(input.resultPath, `${JSON.stringify(result, null, 2)}\n`);
}

/**
 * Replace worker-authored shared-tree diff claims with claim-time-baseline
 * evidence. Missing/foreign authority is a durable HOLD, never an authorship
 * guess from the final repository diff.
 */
export async function reconcileDockerResultWorkAttribution(
  input: ReconcileDockerResultWorkAttributionInput,
): Promise<DockerResultWorkAttributionOutcome> {
  const result = JSON.parse(readFileSync(input.resultPath, 'utf-8')) as Record<string, unknown>;
  let scopeFiles: string[];
  try {
    scopeFiles = input.scopeManifest
      ? resolveCanonicalAttributionFiles(
          input.scopeManifest,
          input.scopeInventory ?? input.scopeManifest.scope.filesWrite,
        )
      : normalizedScopeFiles(input.scopeFilesWrite);
  } catch (error) {
    debugLog('docker-backend:scope-selector', error);
    const fallbackScope = normalizedScopeFiles(input.scopeFilesWrite);
    const scopeDigest = scopeAttributionDigest(fallbackScope);
    const outcome = { state: 'HOLD' as const, filesChanged: [] as string[], linesAdded: 0, linesRemoved: 0, reasonCode: 'ATTRIBUTION_AUTHORITY_MISMATCH' as const };
    writeAttributionResult(input, result, outcome, scopeDigest, [], []);
    return outcome;
  }
  const scopeSet = new Set(scopeFiles);
  const scopeDigest = scopeAttributionDigest(scopeFiles);
  const claimedOutsideScope = resultClaimedPaths(result).filter(path => !scopeSet.has(path));
  const baselineSha256 = existsSync(input.baselinePath)
    ? createHash('sha256').update(readFileSync(input.baselinePath)).digest('hex')
    : undefined;
  const hold = (reasonCode: KnownWorkAttributionReasonCode): DockerResultWorkAttributionOutcome => {
    const priorMeasured = (result.workAttribution as { state?: unknown } | undefined)?.state === 'VERIFIED'
      ? previouslyMeasuredChanges(result) : [];
    const outcome = {
      state: 'HOLD' as const,
      filesChanged: priorMeasured.map(change => change.path),
      linesAdded: priorMeasured.reduce((sum, change) => sum + change.linesAdded, 0),
      linesRemoved: priorMeasured.reduce((sum, change) => sum + change.linesRemoved, 0),
      reasonCode,
    };
    writeAttributionResult(
      input, result, outcome, scopeDigest, claimedOutsideScope, priorMeasured, baselineSha256,
    );
    return outcome;
  };
  if (!input.attemptId || !existsSync(input.baselinePath)) return hold('ATTRIBUTION_AUTHORITY_UNAVAILABLE');

  const lines = readFileSync(input.baselinePath, 'utf-8').split(/\r?\n/);
  const [marker, manifestAttemptId, manifestScopeDigest] = (lines.shift() ?? '').split(SCOPE_BASELINE_DELIM);
  if (
    marker !== SCOPE_ATTRIBUTION_HEADER
    || manifestAttemptId !== input.attemptId
    || manifestScopeDigest !== scopeDigest
  ) return hold('ATTRIBUTION_AUTHORITY_MISMATCH');

  const baseline = new Map<string, string>();
  for (const line of lines) {
    if (!line) continue;
    const delimiter = line.indexOf(SCOPE_BASELINE_DELIM);
    if (delimiter <= 0) return hold('ATTRIBUTION_BASELINE_INVALID');
    baseline.set(line.slice(0, delimiter), line.slice(delimiter + 1));
  }

  const changes: Array<{ path: string; status: 'added' | 'modified' | 'deleted'; linesAdded: number; linesRemoved: number }> = [];
  try {
    for (const path of scopeFiles) {
      const beforeHash = baseline.get(path) ?? null;
      const afterHash = await gitBlobHash(input.projectRoot, path);
      if (beforeHash === afterHash) continue;
      const counts = beforeHash === null
        ? {
            added: countTextLines(readFileSync(resolve(input.projectRoot, path))),
            removed: 0,
          }
        : afterHash === null
          ? { added: 0, removed: await gitBlobLineCount(input.projectRoot, beforeHash) }
          : await blobNumstat(input.projectRoot, beforeHash, afterHash);
      changes.push({
        path,
        status: beforeHash === null ? 'added' : afterHash === null ? 'deleted' : 'modified',
        linesAdded: counts.added,
        linesRemoved: counts.removed,
      });
    }
  } catch (error) {
    debugLog('docker-backend:work-attribution', error);
    return hold('ATTRIBUTION_DIFF_UNMEASURABLE');
  }
  // born 3324: the diff IS measured past this point, so a limit-killed attempt
  // that wrote nothing is not an attribution gap — it is a known death class.
  // An out-of-scope claim still outranks it: a boundary violation must never be
  // masked by the way the worker happened to die. A live provider with a
  // measured empty change set is left alone and stays the honest no-work NO_GO.
  if (
    changes.length === 0
    && claimedOutsideScope.length === 0
    && isExactProviderLimitDeath(input.providerLimitDeath, input.attemptId)
  ) {
    return hold('PROVIDER_LIMIT_DEATH_ZERO_WRITE');
  }
  const outcome: DockerResultWorkAttributionOutcome = {
    state: claimedOutsideScope.length > 0 ? 'HOLD' : 'VERIFIED',
    filesChanged: changes.map(change => change.path),
    linesAdded: changes.reduce((sum, change) => sum + change.linesAdded, 0),
    linesRemoved: changes.reduce((sum, change) => sum + change.linesRemoved, 0),
    ...(claimedOutsideScope.length > 0 ? { reasonCode: 'CLAIM_OUTSIDE_WRITE_SCOPE' } : {}),
  };
  writeAttributionResult(input, result, outcome, scopeDigest, claimedOutsideScope, changes, baselineSha256);
  return outcome;
}

function publishWorkAttributionBaseline(
  ref: TaskResultSettlementRefV1,
  manifest: string,
): string {
  return writeTaskResultSettlementWorkAttributionBaselineAtomic(ref, manifest);
}

/**
 * Build the container EXIT-trap shell function (`on_exit`). Extracted from the
 * inline `spawn()` body so it is unit-testable. Behavior:
 *  - `.result` already present → fsync + return (normal worker exit; unchanged).
 *  - Sprint 272 T-003 last-chance window: if `.result` is missing, wait up to 5s
 *    re-checking — catches a late flush from a clean exit-0 (limit/stream cut).
 *  - non-zero exit + git diff ⇒ TIMEOUT_WITH_WORK (unchanged; Brain reconciles).
 *  - else ⇒ enriched EXIT_WITHOUT_RESULT marker (workPresent + diffStat + last hb),
 *    still a NO_GO candidate. The JSON mirrors {@link buildExitWithoutResultMarker}.
 *
 * born-667b (RECON-DIFF, task 427-024): `scopeFilesWrite` narrows BOTH the
 * TIMEOUT_WITH_WORK file-count and the EXIT_WITHOUT_RESULT workPresent/diffStat
 * signal to this task's own `scope.filesWrite` via a native git `-- <pathspec>`
 * filter — the docker backend bind-mounts the WHOLE project root read-write, so
 * an UNFILTERED `git diff` inside one worker's container also shows every OTHER
 * concurrently-running worker's uncommitted changes (TT550 phantom-vakası: a
 * worker that touched nothing itself still got workPresent=true because a
 * sibling worker was mid-edit). Optional + defaults to the pre-existing
 * unscoped behavior so the 2-arg call in
 * tests/orchestra/docker-exit-marker.test.ts is untouched. An explicitly empty
 * list (as opposed to omitted) has an empty intersection by construction —
 * `changed_files`/`diff_stat` are set directly with no git call at all, the
 * honest answer per born-667b's goCriteria ("kesişim-boş → workPresent=false
 * dürüst yazılır").
 */
export function buildOnExitTrap(taskId: string, model: string, scopeFilesWrite?: readonly string[]): string {
  const scoped = scopeFilesWrite !== undefined;
  const pathspec = scoped ? buildScopedDiffPathspec(scopeFilesWrite) : '';
  const scopedButEmpty = scoped && pathspec.length === 0;

  const changedFilesLine = !scoped
    ? '  changed_files=$({ git diff --name-only; git ls-files --others --exclude-standard; } 2>/dev/null | sort -u || true)'
    : scopedButEmpty
      ? '  changed_files=""'
      : `  changed_files=$({ git diff --name-only -- ${pathspec}; git ls-files --others --exclude-standard -- ${pathspec}; } 2>/dev/null | sort -u || true)`;

  const diffStatLine = !scoped
    ? '    diff_stat=$(git diff --shortstat 2>/dev/null | sed \'s/^[[:space:]]*//\' | tr -d \'"\' || true)'
    : scopedButEmpty
      ? '    diff_stat=""'
      : `    diff_stat=$(git diff --shortstat -- ${pathspec} 2>/dev/null | sed 's/^[[:space:]]*//' | tr -d '"' || true)`;

  return [
    'on_exit() {',
    // born-466: $? here is the LAST command's code (rm/echo masked it to 0 on
    // every path) — prefer CLAUDE_EXIT captured right after the worker command,
    // so TIMEOUT_WITH_WORK and signal_info see the REAL worker exit code.
    '  local exit_code=${CLAUDE_EXIT:-$?}',
    // 455-003: default BASEFILE so an unset var never errors (2-arg legacy trap
    // and any caller that does not export a scope-baseline manifest).
    '  BASEFILE="${BASEFILE:-}"',
    // If .result already exists (worker wrote it normally), just fsync and exit
    '  if [ -f "$RFILE" ]; then',
    '    fsync_file "$RFILE"',
    '    fsync_file "$HBFILE"',
    '    rm -f "$PRFILE" 2>/dev/null',
    '    return',
    '  fi',
    // Sprint 272 T-003: last-chance window — a clean exit-0 (usage-limit / stream
    // interruption) can land just before the worker's .result write flushes to the
    // shared volume. Wait up to 5s, re-checking, before synthesizing a marker.
    '  lc_wait=0',
    '  while [ ! -f "$RFILE" ] && [ "$lc_wait" -lt 5 ]; do',
    '    sleep 1',
    '    lc_wait=$((lc_wait + 1))',
    '  done',
    '  if [ -f "$RFILE" ]; then',
    '    fsync_file "$RFILE"',
    '    fsync_file "$HBFILE"',
    '    rm -f "$PRFILE" 2>/dev/null',
    '    return',
    '  fi',
    // Non-zero exit: check git diff for partial work
    `  cd "${CONTAINER_WORKSPACE}" 2>/dev/null || true`,
    '  local changed_files=""',
    // born-467: tracked diff alone misses NEW files (most deckent tasks create
    // new test files) — include untracked-but-not-ignored so workPresent is
    // honest when a worker produced only new files before dying.
    // born-667b: scoped to scope.filesWrite when provided — see buildScopedDiffPathspec.
    changedFilesLine,
    // 455-003 (TIMEOUT-BASELINE-TRUTH): subtract files whose CURRENT content is
    // byte-identical to the task-start baseline (BASEFILE manifest, computed by
    // computeScopeBaselineManifest at spawn). A scoped file that was ALREADY dirty
    // when the worker started — a previous task's leftover, an operator's local
    // edit, or a sibling worker's leak through the shared bind-mount — is NOT this
    // worker's partial work and must never produce a false TIMEOUT_WITH_WORK. A
    // file whose hash CHANGED since baseline (further edited) or that has no
    // baseline entry (newly created) is kept, so genuine task-local work stays
    // recoverable. No BASEFILE (2-arg legacy / no manifest) ⇒ unfiltered, exactly
    // as before this task. `git hash-object` is read-only + not git-guard-denied.
    '  if [ -n "$BASEFILE" ] && [ -f "$BASEFILE" ] && [ -n "$changed_files" ]; then',
    '    baseline_filtered=""',
    '    while IFS= read -r bf; do',
    '      [ -z "$bf" ] && continue',
    '      bf_cur=$(git hash-object "$bf" 2>/dev/null || echo __MISSING__)',
    '      bf_base=$(awk -F "\\t" -v p="$bf" \'$1==p{print $2; exit}\' "$BASEFILE" 2>/dev/null || true)',
    '      if [ -n "$bf_base" ] && [ "$bf_base" = "$bf_cur" ]; then continue; fi',
    '      baseline_filtered="$baseline_filtered$bf',
    '"',
    '    done <<BASEEOF',
    '$changed_files',
    'BASEEOF',
    '    changed_files=$(printf \'%s\' "$baseline_filtered" | sed \'/^$/d\')',
    '  fi',
    '  if [ -n "$changed_files" ] && [ "$exit_code" -ne 0 ]; then',
    // Build JSON array from changed files using pure POSIX sh (no jq dependency)
    '    local json_array="["',
    '    local first=1',
    '    local count=0',
    '    while IFS= read -r f; do',
    '      [ -z "$f" ] && continue',
    '      count=$((count + 1))',
    '      if [ "$first" -eq 1 ]; then',
    '        first=0',
    '      else',
    '        json_array="$json_array,"',
    '      fi',
    '      local escaped=$(printf "%s" "$f" | sed \'s/\\\\/\\\\\\\\/g; s/"/\\\\"/g\')',
    '      json_array="$json_array\\"$escaped\\""',
    '    done <<GITEOF',
    '$changed_files',
    'GITEOF',
    '    json_array="$json_array]"',
    // Sprint 149: Add signal_info for signal-killed containers
    '    local signal_info=""',
    '    [ "$exit_code" -gt 128 ] && signal_info=" signal=$((exit_code - 128))"',
    '    cat > "$RFILE" <<RESULTEOF',
    `{"taskId":"${taskId}","selfAssessment":"TIMEOUT_WITH_WORK","filesChanged":$json_array,"exitCode":$exit_code,"notes":"Worker timeout/killed (exitCode=$exit_code$signal_info) but git diff shows $count files modified. Brain should reconcile via Spurious NO_GO helper.","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"${model}"}}`,
    'RESULTEOF',
    '  else',
    // Sprint 272 T-003: enriched EXIT_WITHOUT_RESULT marker (was a blind NO_GO).
    // workPresent = git diff shows >=1 file; diffStat = shortstat summary; last
    // heartbeat status/sequence pulled from $HBFILE. Stays a NO_GO candidate so the
    // evaluator is unchanged, but the FIX phase can verify-and-complete disk work.
    // The "exited without writing result (exitCode=" phrase is preserved — note
    // classifiers match it (nogo-note-accuracy).
    '    local work_present=false',
    '    [ -n "$changed_files" ] && work_present=true',
    '    local diff_stat=""',
    // born-667b: scoped to scope.filesWrite when provided — see buildScopedDiffPathspec.
    // 455-003: gate the shortstat on the (baseline-filtered) changed_files so a
    // pre-existing-dirty file removed by the baseline filter can never leak back
    // into diffStat while workPresent is already false.
    '    if [ -n "$changed_files" ]; then',
    diffStatLine,
    '    fi',
    '    local hb_status="unknown"',
    '    local hb_seq=0',
    '    if [ -f "$HBFILE" ]; then',
    '      hb_status=$(sed -n \'s/.*"status":"\\([^"]*\\)".*/\\1/p\' "$HBFILE" 2>/dev/null | head -1)',
    '      hb_seq=$(sed -n \'s/.*"sequence":\\([0-9][0-9]*\\).*/\\1/p\' "$HBFILE" 2>/dev/null | head -1)',
    '      [ -z "$hb_status" ] && hb_status="unknown"',
    '      [ -z "$hb_seq" ] && hb_seq=0',
    '    fi',
    '    local signal_info_nw=""',
    '    [ "$exit_code" -gt 128 ] && signal_info_nw=" signal=$((exit_code - 128))"',
    '    cat > "$RFILE" <<NORESULTEOF',
    `{"taskId":"${taskId}","workerId":"docker-${taskId}","filesChanged":[],"linesAdded":0,"linesRemoved":0,"testsPassed":false,"coverage":0,"selfAssessment":"NO_GO","markerType":"EXIT_WITHOUT_RESULT","workPresent":$work_present,"diffStat":"$diff_stat","lastHbStatus":"$hb_status","lastHbSequence":$hb_seq,"exitCode":$exit_code,"notes":"Worker exited without writing result (exitCode=$exit_code$signal_info_nw, source=wrapper). EXIT_WITHOUT_RESULT marker workPresent=$work_present diff [$diff_stat]. Brain FIX: workPresent=true -> verify-and-complete disk work.","tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"claude","model":"${model}"}}`,
    'NORESULTEOF',
    '  fi',
    '  fsync_file "$RFILE"',
    '  fsync_file "$HBFILE"',
    // Sprint 151: Clean up .partial-result — EXIT trap wrote a proper .result
    '  rm -f "$PRFILE" 2>/dev/null',
    '}',
  ].join('\n');
}

// ─── Sprint 163 T-002: Health Check + Retry Policy ──────────────────────────
// container_start_failed previously masked four distinct failure modes
// (image-missing, port-collision, resource-limit, instant-exit-success).
// We retry transient failures up to MAX_SPAWN_ATTEMPTS times and surface a
// stable error code so Brain/Auditor can act on it.

/** How long to wait (ms) after `docker run -d` before inspecting state. */
export const HEALTH_CHECK_DELAY_MS = 3_000;
/** Maximum number of spawn attempts (1 = no retry). */
export const MAX_SPAWN_ATTEMPTS = 2;
/** Delay (ms) between consecutive spawn attempts. */
export const SPAWN_RETRY_DELAY_MS = 5_000;

/** Stable error codes for container_start_failed root causes. */
export const DOCKER_ERROR_CODES = {
  IMAGE_NOT_FOUND: 'DECKENT_E081',
  PORT_COLLISION: 'DECKENT_E082',
  RESOURCE_LIMIT: 'DECKENT_E083',
  UNKNOWN: 'DECKENT_E084',
  // 455-003 (DOCKER-PREFLIGHT-TRUTH): distinct pre-spawn failure classes. These
  // MUST never collapse into IMAGE_NOT_FOUND — a down/forbidden daemon or an
  // absent docker binary is a fundamentally different operator remedy than a
  // missing image, and reporting one as the other sends the operator to the
  // wrong fix (rebuild an image when the real problem is `sudo`/`dockerd`).
  DAEMON_UNAVAILABLE: 'DECKENT_E085', // docker CLI present, daemon not reachable (socket down / dockerd stopped)
  DAEMON_PERMISSION: 'DECKENT_E086', // docker CLI present, daemon reachable, but the socket is permission-denied
  DOCKER_ABSENT: 'DECKENT_E087',     // docker binary itself is not on PATH (spawn ENOENT / status 127)
  IMAGE_CLI_MISSING: 'DECKENT_E088', // image present, but the provider's CLI binary was not baked into it
  OWNERSHIP_CONFLICT: 'DECKENT_E089', // daemon-global name is owned by a foreign project/task/attempt
  AUTHORITY_UNAVAILABLE: 'DECKENT_E090', // exact-name ownership could not be proven present or absent
} as const;

export type DockerErrorCode = (typeof DOCKER_ERROR_CODES)[keyof typeof DOCKER_ERROR_CODES];

interface DockerAttemptIdentity {
  ref: TaskResultSettlementRefV1;
  containerName: string;
  labels: Readonly<Record<string, string>>;
}

export interface DockerAuthorityInspection {
  containerId: string;
  running: boolean;
  exitCode: number;
  labels: Readonly<Record<string, string>>;
}

type DockerAuthorityProbe =
  | { state: 'present'; inspection: DockerAuthorityInspection }
  | { state: 'absent' }
  | { state: 'unavailable'; evidence: string };

/** Parse the exact ID/state/label projection used for collision decisions. */
export function parseDockerAuthorityInspectOutput(raw: string): DockerAuthorityInspection | null {
  const [containerId, runningRaw, exitCodeRaw, managed, project, task, attempt] = raw.trim().split('|');
  const exitCode = Number(exitCodeRaw);
  if (
    !containerId
    || !/^[a-f0-9]{64}$/i.test(containerId)
    || !['true', 'false'].includes(runningRaw ?? '')
    || !Number.isInteger(exitCode)
  ) return null;
  return {
    containerId,
    running: runningRaw === 'true',
    exitCode,
    labels: {
      [DOCKER_ATTEMPT_LABELS.managed]: managed ?? '',
      [DOCKER_ATTEMPT_LABELS.project]: project ?? '',
      [DOCKER_ATTEMPT_LABELS.task]: task ?? '',
      [DOCKER_ATTEMPT_LABELS.attempt]: attempt ?? '',
    },
  };
}

/** Distinct pre-spawn Docker failure classes (455-003). */
export type DockerPreflightCode =
  | typeof DOCKER_ERROR_CODES.DOCKER_ABSENT
  | typeof DOCKER_ERROR_CODES.DAEMON_PERMISSION
  | typeof DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE;

/** Structured verdict of a Docker daemon preflight probe. `null` ⇒ daemon healthy. */
export interface DockerPreflightFailure {
  code: DockerPreflightCode;
  message: string;
  /** Raw probe evidence (trimmed stderr / spawn-error text) that justified the code. */
  evidence: string;
}

/**
 * 455-003 (DOCKER-PREFLIGHT-TRUTH): classify the result of a `docker info` (or
 * `docker images`) probe into a DISTINCT daemon/permission/absent failure — or
 * `null` when the daemon is healthy. Pure function — exported for unit tests.
 *
 * Separation of concerns vs {@link classifyDockerError}: that classifier reasons
 * about a container that already tried to start (image-missing, port-collision,
 * resource-limit). THIS classifier reasons about whether we can talk to the
 * Docker daemon AT ALL, before any image lookup — so a permission-denied socket
 * or a stopped daemon is never mis-reported as "image not ready".
 *
 * Discrimination (matched against real docker CLI phrasing):
 *  - DOCKER_ABSENT      — the spawn itself failed (ENOENT) or exited 127: the
 *    `docker` binary is not installed / not on PATH.
 *  - DAEMON_PERMISSION  — "permission denied" while dialing the socket
 *    (`dial unix /var/run/docker.sock: connect: permission denied`,
 *    `Got permission denied while trying to connect to the Docker daemon socket`).
 *  - DAEMON_UNAVAILABLE — daemon unreachable for any other reason
 *    ("Cannot connect to the Docker daemon", "Is the docker daemon running?").
 *
 * A permission-denied string is checked BEFORE the generic can't-connect string
 * because docker emits BOTH together ("...connect: permission denied. ... Is the
 * docker daemon running?") and permission is the more actionable, specific cause.
 */
export function classifyDockerPreflight(probe: {
  status: number | null;
  stderr: string | null | undefined;
  spawnError?: Error | { code?: string } | null;
}): DockerPreflightFailure | null {
  const stderr = (probe.stderr ?? '').trim();
  const s = stderr.toLowerCase();

  // 1) docker binary absent — the spawn never reached a daemon at all.
  const spawnErrCode = (probe.spawnError as { code?: string } | undefined)?.code;
  if (
    probe.spawnError != null ||
    spawnErrCode === 'ENOENT' ||
    probe.status === 127 ||
    s.includes('command not found') ||
    s.includes('executable file not found') ||
    s.includes('no such file or directory')
  ) {
    return {
      code: DOCKER_ERROR_CODES.DOCKER_ABSENT,
      message: `${DOCKER_ERROR_CODES.DOCKER_ABSENT}: docker binary not found on PATH (install Docker / add it to PATH)`,
      evidence: stderr || spawnErrCode || 'spawn failed (ENOENT)',
    };
  }

  // Daemon healthy — nothing to report (status 0 with no error).
  if (probe.status === 0) return null;

  // 2) permission denied on the docker socket (checked before generic connect).
  if (
    s.includes('permission denied') ||
    s.includes('got permission denied') ||
    s.includes('dial unix') && s.includes('connect: permission denied')
  ) {
    return {
      code: DOCKER_ERROR_CODES.DAEMON_PERMISSION,
      message: `${DOCKER_ERROR_CODES.DAEMON_PERMISSION}: permission denied talking to the Docker daemon socket (add the user to the docker group or run with sufficient privileges)`,
      evidence: stderr,
    };
  }

  // 3) daemon unreachable / not running.
  if (
    s.includes('cannot connect to the docker daemon') ||
    s.includes('is the docker daemon running') ||
    s.includes('docker daemon is not running') ||
    s.includes('error during connect')
  ) {
    return {
      code: DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE,
      message: `${DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE}: cannot connect to the Docker daemon (is dockerd running?)`,
      evidence: stderr,
    };
  }

  // Non-zero status with an unrecognized reason: still a daemon-unavailable class
  // (we could not confirm a healthy daemon) — honest fail, never image-missing.
  return {
    code: DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE,
    message: `${DOCKER_ERROR_CODES.DAEMON_UNAVAILABLE}: docker daemon probe failed (status=${probe.status ?? 'null'})`,
    evidence: stderr || `status=${probe.status ?? 'null'}`,
  };
}

/**
 * 455-003: run the `docker info` daemon preflight synchronously and classify it.
 * Returns `null` when the daemon is healthy. Kept as a thin seam (spawnSync +
 * {@link classifyDockerPreflight}) so the pure classifier stays unit-testable
 * without a real docker. Exported for the backend's own use + tests.
 */
export function probeDockerDaemon(): DockerPreflightFailure | null {
  const probe = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return classifyDockerPreflight({
    status: probe.status,
    stderr: probe.stderr,
    spawnError: probe.error ?? null,
  });
}

// Sprint 194 T-004 (W-M M-2): tell V8 inside the worker container to size its
// max old-space heap as a percentage of the container's memory cgroup, rather
// than the host RAM. Requires Node ≥20.6 (`--max-old-space-size-percentage`
// landed in Node 20.6; Deckent runtime is Node ≥24).
export const WORKER_NODE_OPTIONS = 'NODE_OPTIONS=--max-old-space-size-percentage=75';

/** Provider CLI binary → adapter factory, for parsing the worker's usage envelope. */
const USAGE_ADAPTER_FACTORIES: Record<string, (root: string) => { extractUsage?: (raw: string) => unknown }> = {
  claude: createClaudeAdapter,
  codex: createCodexAdapter,
  'cursor-agent': createCursorAdapter,
  gemini: createGeminiAdapter,
};

/**
 * Patch a worker's `.result` with the REAL token usage parsed from its CLI envelope
 * (captured container stdout). Provider-agnostic: dispatches to the model's provider
 * adapter, whose extractUsage parses its native usage shape incl. cacheCreation. The
 * agent cannot self-report token counts (they live only in the CLI envelope), and the
 * orchestrator's post-collect enrichment races the post-exit `.log` dump — so writing
 * the real usage HERE (at the source, the moment the envelope is captured) is the
 * authoritative fix. No-op + never throws when no parseable envelope is present.
 */
export function patchResultUsageFromEnvelope(
  tasksDir: string,
  taskId: string,
  model: ModelType,
  logContent: string,
): void {
  try {
    const factory = USAGE_ADAPTER_FACTORIES[getProviderBinaryForModel(model)];
    if (!factory) return;
    const usage = factory(process.cwd()).extractUsage?.(logContent) as
      | { inputTokens?: number; outputTokens?: number; provider?: string; model?: string }
      | null
      | undefined;
    if (!usage || ((usage.inputTokens ?? 0) <= 0 && (usage.outputTokens ?? 0) <= 0)) return;
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    if (!existsSync(resultPath)) return;
    const r = JSON.parse(readFileSync(resultPath, 'utf-8')) as {
      tokenUsage?: { provider?: string; model?: string };
      providerBilling?: unknown;
    };
    r.tokenUsage = {
      ...usage,
      provider: usage.provider ?? r.tokenUsage?.provider,
      model: r.tokenUsage?.model ?? usage.model ?? model,
    };
    const provider = getProviderBinaryForModel(model);
    const billing = extractProviderBillingEvidence(provider, logContent);
    if (billing) r.providerBilling = billing;
    writeFileSync(resultPath, JSON.stringify(r, null, 2), 'utf-8');
  } catch (e) {
    debugLog('docker-backend:usage-patch', e);
  }
}

/**
 * born-637 (TRACE-CONTENT-PARITY docker-parity): normalize a captured
 * `docker logs` blob into the structured LogEvent JSONL contract
 * (`writeLogEvent`/`normalizeStreamEvent`, core/log-event.ts) and write it to
 * `logPath` — the SAME contract the subprocess backend's reference
 * implementation targets (spawn-backend-subprocess.ts `captureStreamToLog`),
 * adapted for a post-exit blob instead of a live stream (`docker logs` only
 * arrives once the container has already exited — see `monitorContainer`).
 *
 * Never throws: a malformed/plain-text line degrades to a `text` event
 * (`normalizeStreamEvent` never drops), and `writeLogEvent` itself is
 * fail-safe. Blank lines are skipped (NDJSON inter-record whitespace).
 *
 * Exported for unit tests (tests/orchestra/trace-content-parity.test.ts) —
 * proves a stream-json docker-logs fixture round-trips through
 * `OutputCollector.readLogEvents` with a non-zero event count.
 *
 * @returns The number of LogEvent rows written.
 */
export function writeNormalizedDockerLog(logPath: string, logContent: string, provider: string): number {
  let seq = maxDockerLogSequence(logPath) + 1;
  // born-639 (404-005 TRACE-TAIL): a provider whose docker spec has no NDJSON
  // stream flag (gemini's docker spec is `--output-format json` — ONE envelope,
  // which may be pretty-printed across several lines) dumps a SINGLE JSON value
  // for the whole run. Splitting that by newline FIRST would shred it into
  // unparsable fragments (each individually degrading to a raw-text passthrough
  // instead of one coherent event). Try the whole trimmed content as one JSON
  // value first — a genuine NDJSON stream (claude stream-json, codex --json) is
  // always MULTIPLE top-level JSON values and fails this parse, falling through
  // to the per-line path below completely unchanged.
  const trimmed = logContent.trim();
  if (trimmed.length > 0 && isSingleJsonValue(trimmed)) {
    const raw = normalizeDockerLogLine(trimmed, provider);
    writeLogEvent(logPath, normalizeStreamEvent(raw, provider), seq);
    return 1;
  }

  let written = 0;
  for (const line of logContent.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const raw = normalizeDockerLogLine(line, provider);
    writeLogEvent(logPath, normalizeStreamEvent(raw, provider), seq);
    seq += 1;
    written += 1;
  }
  return written;
}

function maxDockerLogSequence(logPath: string): number {
  if (!existsSync(logPath)) return 0;
  try {
    let max = 0;
    for (const line of readFileSync(logPath, 'utf-8').split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        const parsed = JSON.parse(line) as { seq?: unknown };
        if (typeof parsed.seq === 'number' && Number.isFinite(parsed.seq) && parsed.seq > max) {
          max = parsed.seq;
        }
      } catch {
        // Ignore malformed historical rows; valid rows still provide the floor.
      }
    }
    return max;
  } catch (error: unknown) {
    debugLog('docker-backend:max-log-sequence', error);
    return 0;
  }
}

/** True iff `text` parses as exactly one JSON value (object/array/scalar). */
function isSingleJsonValue(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * born-639 (404-005 TRACE-TAIL): pre-normalization bridge applied to a single
 * docker-logs line/envelope BEFORE it reaches `normalizeStreamEvent`. Provider
 * event shapes that `normalizeStreamEvent` cannot classify on its own are
 * translated onto one of its own recognized literal `type` values (see
 * {@link bridgeCodexEvent}). A no-op for every provider other than codex
 * (gemini's single-envelope shape is ALREADY correctly classified by
 * `normalizeStreamEvent`'s generic `response`-field detection — no bridge
 * needed), and a no-op for any line that is not a JSON object — both fall
 * through to `normalizeStreamEvent`'s own text-fallback exactly as before this
 * task, so claude's existing, already-tested behavior is byte-identical.
 */
function normalizeDockerLogLine(line: string, provider: string): string | Record<string, unknown> {
  if (provider !== 'codex') return line;
  const trimmed = line.trim();
  if (trimmed[0] !== '{') return line;
  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return line;
  }
  return isPlainObject(obj) ? bridgeCodexEvent(obj) : line;
}

/**
 * born-639 (404-005 TRACE-TAIL): bridge codex's real v2 thread/turn/item event
 * stream (verified against a live capture, codex-cli 0.138.0 —
 * `.brain/archive/sprints/sprint-366-tasks/task-366-001.log`, the born-366-001
 * evidence) onto normalizeStreamEvent's own recognized literal `type` values
 * (LOG_EVENT_TYPES, core/log-event.ts). Codex's flat event names
 * (`thread.started`, `turn.started`, `item.started`/`item.completed`,
 * `turn.completed`) match none of `normalizeStreamEvent`'s `directType()`
 * cases, so every one of them previously degraded to a generic `text`
 * passthrough (safe — never dropped — but flat: a real turn/tool_use/
 * tool_result/lifecycle distinction was available and simply unused).
 * `turn.completed` was ALREADY correctly detected as `usage` via
 * `hasUsageShape` (its payload carries a `usage` object) — mapped here too,
 * explicitly, purely for self-documentation; it changes nothing.
 *
 * Never throws, never drops: an event/item-type this function does not
 * recognize (anything outside the two item types verified in the reference
 * capture — `file_change`, `agent_message` — or any unlisted top-level type)
 * is returned UNCHANGED, so `normalizeStreamEvent`'s own passthrough still
 * classifies it (degrading to `text`, exactly as before this task). Whenever
 * this function DOES override `type`, the original codex discriminator string
 * is preserved under a `codexEventType` sibling key — no information is lost.
 *
 * Exported for unit tests (tests/orchestra/trace-tail-parity.test.ts).
 */
export function bridgeCodexEvent(obj: Record<string, unknown>): Record<string, unknown> {
  const t = obj['type'];
  const remap = (logType: string): Record<string, unknown> => ({
    ...obj,
    type: logType,
    // Generic consumers use providerEventType. codexEventType remains as a
    // compatibility alias for persisted logs and external trace readers.
    providerEventType: t,
    codexEventType: t,
  });
  if (t === 'thread.started') return remap('lifecycle');
  if (t === 'turn.started') return remap('turn');
  if (t === 'turn.completed') return remap('usage');
  if (t === 'item.started' || t === 'item.completed') {
    const item = obj['item'];
    const itemType = isPlainObject(item) ? item['type'] : undefined;
    if (itemType === 'file_change') return remap(t === 'item.started' ? 'tool_use' : 'tool_result');
    if (itemType === 'agent_message') return remap('text');
  }
  return obj;
}

/** Narrow to a plain object (not null, not array). */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * A retired landing is restart-relevant only while its exact top-level task
 * projection still exists. Landing journals intentionally outlive task
 * cleanup for audit; absence, malformed JSON, or an id mismatch makes the
 * journal historical evidence rather than current recovery authority.
 */
function hasCurrentTaskProjection(tasksDir: string, taskId: string): boolean {
  const taskPath = join(tasksDir, `task-${taskId}.json`);
  if (!existsSync(taskPath)) return false;
  try {
    const projection = JSON.parse(readFileSync(taskPath, 'utf-8')) as unknown;
    return (
      typeof projection === 'object'
      && projection !== null
      && !Array.isArray(projection)
      && (projection as Record<string, unknown>)['id'] === taskId
    );
  } catch {
    return false;
  }
}

/**
 * born-637 (TRACE-CONTENT-PARITY docker-parity): docker-container-LOCAL
 * override of the claude {@link ProviderCommandSpec}'s `baseArgs` —
 * `--output-format json` (a single final envelope) becomes `--output-format
 * stream-json` (the full NDJSON event stream) + `--verbose` (required by the
 * claude CLI alongside `--print` + `stream-json`; mirrors
 * cli/entry.ts:streamingArgsForProvider's own flag pairing).
 *
 * This is a LOCAL clone applied only to the docker-spawned command string —
 * the shared `PROVIDER_COMMAND_SPECS.claude` (core/provider-command-spec.ts)
 * is never mutated, so tmux.ts's claude invocation (and any other consumer of
 * the shared spec) keeps requesting the single envelope, unaffected.
 *
 * Why this is safe for token-usage capture: `ClaudeAdapter.extractUsage`
 * (providers/claude.ts) already scans EVERY line of the captured output for a
 * usage-bearing JSON payload and keeps the last match — stream-json's final
 * `type:"result"` NDJSON line carries the identical `usage{...}` shape as the
 * old single-envelope dump, so real token counts are unchanged (proven by the
 * usage-patch regression fixture in tests/orchestra/trace-content-parity.test.ts).
 *
 * A no-op (returns a shallow copy) when `baseArgs` does not carry
 * `--output-format json` in the exact expected shape — defensive against a
 * future spec edit changing the flag pairing out from under this override.
 *
 * Exported for unit tests.
 */
export function claudeStreamJsonBaseArgs(baseArgs: readonly string[]): string[] {
  const idx = baseArgs.indexOf('--output-format');
  if (idx === -1 || baseArgs[idx + 1] !== 'json') return [...baseArgs];
  const next = [...baseArgs];
  next[idx + 1] = 'stream-json';
  next.push('--verbose');
  return next;
}

/**
 * Resolve only a registered CLI provider's exact Docker binary.
 *
 * Unknown model identities retain `UnknownModelError`. Ollama and OpenRouter
 * are host-adapter providers; reaching this boundary is a routing invariant
 * violation and fails before a different provider binary can be selected.
 * Fallback policy belongs to the admitted route/receipt authority, never this
 * final binary projection.
 */
export function getProviderBinaryForModel(model: ModelType): string {
  const provider = getProviderForModel(model);
  if (provider === 'claude') return 'claude';
  if (provider === 'codex') return 'codex';
  if (provider === 'cursor') return 'cursor-agent';
  if (provider === 'gemini') return 'gemini';
  if (provider === 'ollama') {
    throw createDockerLifecycleError(
      `Ollama provider cannot use the Docker CLI backend for model "${model}"; `
      + 'host adapter routing must resolve this task before binary selection',
    );
  }
  if (provider === 'openrouter') {
    throw createDockerLifecycleError(
      `OpenRouter provider cannot use the Docker CLI backend for model "${model}"; `
      + 'host API adapter routing must resolve this task before binary selection',
    );
  }
  throw createDockerLifecycleError(
    `Provider "${provider}" has no Docker CLI binary authority for model "${model}"`,
  );
}

// ─── SURF-3 S3 — live tool-by-tool activity from `docker logs -f` ─────────────

/** Injectable spawn for {@link followContainerActivity} (tests pass a fake). */
export type FollowSpawnFn = typeof nodeSpawn;

export interface DockerBudgetTerminationEvidence {
  containerName: string;
  escalation: 'docker-stop' | 'sigterm' | 'sigkill';
  terminationConfirmed: true;
  exitCode: number;
}

export interface DockerSyncCommandResult {
  status: number | null;
  stdout?: string | null;
  stderr?: string | null;
  error?: Error;
}

export type DockerSyncCommand = (
  command: string,
  args: string[],
  options: { encoding: 'utf-8'; timeout: number; stdio?: ['pipe', 'pipe', 'pipe'] },
) => DockerSyncCommandResult;

const runDockerSync: DockerSyncCommand = (command, args, options) => {
  const result = spawnSync(command, args, options);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    ...(result.error ? { error: result.error } : {}),
  };
};

/**
 * Freeze and terminate one exact Docker checkpoint-stop attempt.
 *
 * Docker declares `checkpoint-stop`, not provider-cooperative landing. Pausing
 * the container cgroup first prevents the provider CLI (and its descendants)
 * from opening another remote call while the exact SIGKILL is delivered.
 * `docker wait`, log capture and host checkpoint validation remain the terminal
 * authorities. If kill delivery fails, unpause best-effort before failing loud
 * so the caller's hard-containment path can adopt a runnable container.
 */
export function requestDockerContainerLanding(
  containerName: string,
  run: DockerSyncCommand = runDockerSync,
): void {
  const pause = run('docker', ['pause', containerName], {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (pause.status !== 0 || pause.error) {
    const detail = pause.error?.message ?? pause.stderr ?? `status=${String(pause.status)}`;
    throw createDockerLifecycleError(
      `Budget landing could not freeze Docker container "${containerName}": ${detail}`,
    );
  }

  const kill = run('docker', ['kill', '--signal=SIGKILL', containerName], {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (kill.status === 0 && !kill.error) return;

  const unpause = run('docker', ['unpause', containerName], {
    encoding: 'utf-8',
    timeout: 10_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const killDetail = kill.error?.message ?? kill.stderr ?? `status=${String(kill.status)}`;
  const recoveryDetail = unpause.status === 0 && !unpause.error
    ? 'container unpaused for hard-containment adoption'
    : `unpause failed: ${unpause.error?.message ?? unpause.stderr ?? `status=${String(unpause.status)}`}`;
  throw createDockerLifecycleError(
    `Budget landing could not terminate frozen Docker container "${containerName}": ${killDetail}; ${recoveryDetail}`,
  );
}

/**
 * Bounded fail-closed container termination used by the budget circuit
 * breaker. A successful Docker CLI exit is not enough: the final authority is
 * an inspect result proving `.State.Running == false`.
 */
export function terminateDockerContainerForBudget(
  containerName: string,
  graceSeconds: number,
  run: DockerSyncCommand = runDockerSync,
): DockerBudgetTerminationEvidence {
  const inspectState = (): { running: boolean; exitCode: number } | null => {
    const result = run(
      'docker',
      ['inspect', '--format', '{{.State.Running}}|{{.State.ExitCode}}', containerName],
      { encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    if (result.status !== 0 || result.error) return null;
    return parseInspectOutput(result.stdout ?? '');
  };
  const confirmed = (escalation: DockerBudgetTerminationEvidence['escalation']): DockerBudgetTerminationEvidence | null => {
    const state = inspectState();
    return state && !state.running
      ? { containerName, escalation, terminationConfirmed: true, exitCode: state.exitCode }
      : null;
  };

  run('docker', ['stop', `--time=${graceSeconds}`, containerName], {
    encoding: 'utf-8', timeout: (graceSeconds + 5) * 1_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stopped = confirmed('docker-stop');
  if (stopped) return stopped;

  run('docker', ['kill', '--signal=SIGTERM', containerName], {
    encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  run('docker', ['wait', containerName], {
    encoding: 'utf-8', timeout: (graceSeconds + 2) * 1_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const terminated = confirmed('sigterm');
  if (terminated) return terminated;

  run('docker', ['kill', '--signal=SIGKILL', containerName], {
    encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  run('docker', ['wait', containerName], {
    encoding: 'utf-8', timeout: 10_000, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const killed = confirmed('sigkill');
  if (killed) return killed;
  throw new Error(`Budget containment could not verify that Docker container "${containerName}" stopped after SIGKILL.`);
}

/**
 * Start a `docker logs -f <container>` follow child and stream its output
 * through the activity tap: each Claude-CLI stream-json line → per-tool
 * `WORKER→*:ACTIVITY` (SURF-3 S3). ADDITIVE + ACTIVITY-ONLY — the authoritative
 * `.log` is still written post-exit by writeNormalizedDockerLog, so
 * captureStreamToLog runs with `writeLog:false` (no double-write). When
 * `ctx.enabled` is false it is a zero-cost no-op. Fully fail-soft: a spawn/read
 * error only loses live activity, never touches the container or the .result.
 * Returns a stop() the caller invokes on container exit.
 *
 * The `docker logs -f` SPAWN itself is a thin shim (the real-docker path is the
 * honest verification gap); the activity mapping is exercised via
 * captureStreamToLog + a fake stream in tests.
 */
export function followContainerActivity(
  containerName: string,
  provider: string,
  ctx: ActivityTapContext | undefined,
  spawnFn: FollowSpawnFn = nodeSpawn,
  eventTap?: (event: StreamLogEvent, sequence: number) => void,
  onCriticalFailure?: (error: Error) => void,
): () => void {
  if (!ctx?.enabled && !eventTap && !onCriticalFailure) return () => { /* no observer needs the stream */ };
  let child: ReturnType<FollowSpawnFn> | undefined;
  let intentionallyStopped = false;
  let failureReported = false;
  const reportFailure = (error: Error): void => {
    if (!onCriticalFailure || intentionallyStopped || failureReported) return;
    failureReported = true;
    onCriticalFailure(error);
  };
  try {
    child = spawnFn('docker', ['logs', '-f', containerName], {
      stdio: ['ignore', 'pipe', onCriticalFailure ? 'pipe' : 'ignore'],
    });
  } catch (error) {
    reportFailure(error instanceof Error ? error : new Error(String(error)));
    return () => { intentionallyStopped = true; };
  }
  child.once('error', error => reportFailure(error));
  child.stderr?.resume(); // critical stderr is piped; always drain to avoid follower backpressure
  child.once('close', (code, signal) => {
    if (code !== 0 && code !== null) {
      reportFailure(new Error(`docker logs follower exited with code=${code} signal=${signal ?? 'none'}`));
    }
  });
  if (child.stdout) {
    const activityTap = ctx?.enabled ? makeActivityOnEvent(ctx) : undefined;
    void captureStreamToLog(child.stdout, {
      logPath: '', // unused: writeLog:false skips the .log append (post-exit writer is authoritative)
      provider,
      writeLog: false,
      failOnEventError: onCriticalFailure !== undefined,
      onEvent: (event, sequence) => {
        activityTap?.(event);
        eventTap?.(event, sequence);
      },
    }).catch(error => reportFailure(error instanceof Error ? error : new Error(String(error))));
  } else {
    reportFailure(new Error('docker logs follower started without a readable stdout stream'));
  }
  return () => {
    intentionallyStopped = true;
    try { child?.kill(); } catch { /* already exited */ }
  };
}

/**
 * F1-005 (Sprint 332): assemble the provider-aware `docker build` invocation a
 * worker's provider needs — the build-arg threading the spawn side surfaces when
 * the worker image cannot run the requested provider's CLI.
 *
 * Delegates the build-arg mapping to {@link buildSuggestedImageCmd} (core, the
 * single source of truth shared with `deckent image build` / doctor /
 * `checkWorkerImage`) so the codex/gemini opt-in args stay in lock-step with
 * `Dockerfile.worker`:
 *   - claude → no `--build-arg` (today's lean default image, byte-for-byte);
 *   - codex  → `--build-arg INSTALL_CODEX=true`;
 *   - gemini → `--build-arg INSTALL_GEMINI=true`;
 *   - any other / host-only (e.g. ollama, which never reaches the docker backend)
 *     → no `--build-arg` (lean image).
 *
 * Pure — exported for unit tests; never executed here. We only surface the command
 * in an honest-fail so the operator rebuilds the image with the right CLI, instead
 * of a silent claude fallback that would run a codex/gemini task on a claude-only
 * image (Yasa #2 + the ADR-076 auth-precedence lesson). The build context stays
 * the literal `.` from buildSuggestedImageCmd (operator runs it from the project
 * root) — no `process.cwd()` is consulted.
 */
export function workerImageBuildCmdForProvider(image: string, provider: string): string {
  return buildSuggestedImageCmd(image, [provider]);
}

/**
 * F1-IMG-SPAWN (364-004 DOCKER-PROVIDER-CLI): synchronous "image-reality" probe —
 * is `binary` actually on PATH inside `image` (not merely: does an image with
 * this tag exist)? `docker images -q` (the existing runSpawn() guard) only proves
 * the latter — a stale image (built before a codex/gemini opt-in, or without the
 * INSTALL_CODEX/INSTALL_GEMINI build-arg, F1-005/Sprint 332) passes it and only
 * fails deep inside the container ("command not found") instead of an actionable
 * pre-flight error.
 *
 * core/worker-image-check.ts's `checkWorkerImage()` already answers this exact
 * question for doctor/init/upgrade, but it is Promise-based (its injectable
 * `spawnImpl` is async `node:child_process.spawn`) while this backend's `spawn()`
 * is synchronous end-to-end (`SpawnBackend.spawn(...): void`, and every other
 * pre-container-start guard in this file uses `spawnSync`). This mirrors its
 * `command -v <bin>` probe technique via `spawnSync` instead of importing the
 * async function, to stay inside that sync contract.
 *
 * Fail-open (returns true) when the probe itself could not run at all (docker
 * daemon hiccup, timeout) — mirrors `healthCheckContainer`'s existing fail-open
 * convention in this file. The real `docker run -d` right after this still has
 * its own retry + health-check path (runDockerWithRetry) for genuine docker
 * failures; this probe's only job is to catch "image built without the CLI".
 *
 * Exported for unit tests (spawnSync mock seam, same pattern as the rest of
 * this file's docker-arg helpers).
 */
export function probeProviderCliPresentInImage(image: string, binary: string): boolean {
  const probe = spawnSync(
    'docker',
    ['run', '--rm', image, 'sh', '-c', `command -v ${binary}`],
    { encoding: 'utf-8', timeout: 15_000, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  if (probe.error || probe.status === null || probe.status === undefined) return true;
  return probe.status === 0;
}

/** Result of a single health-check inspect call. */
export interface HealthCheckResult {
  /** Container is running normally — proceed with monitor. */
  healthy: boolean;
  /** Container started then exited with code 0 (gracefully). */
  instantExitSuccess: boolean;
  /** Exit code reported by docker inspect, -1 if inspect failed entirely. */
  exitCode: number;
  /** Raw inspect stdout (debug). */
  raw: string;
}

/**
 * Classify a docker stderr blob into a stable error code.
 * Pure function — exported for unit tests.
 */
export function classifyDockerError(stderr: string, exitCode: number): {
  code: DockerErrorCode;
  message: string;
} {
  const s = (stderr ?? '').toLowerCase();
  if (
    s.includes('pull access denied') ||
    s.includes('image not found') ||
    s.includes('unable to find image') ||
    s.includes('no such image') ||
    s.includes('manifest unknown')
  ) {
    return {
      code: DOCKER_ERROR_CODES.IMAGE_NOT_FOUND,
      message: `${DOCKER_ERROR_CODES.IMAGE_NOT_FOUND}: Docker image bulunamadı`,
    };
  }
  if (
    s.includes('port is already allocated') ||
    s.includes('address already in use') ||
    s.includes('bind: address already in use') ||
    s.includes('port already in use')
  ) {
    return {
      code: DOCKER_ERROR_CODES.PORT_COLLISION,
      message: `${DOCKER_ERROR_CODES.PORT_COLLISION}: Port çakışması`,
    };
  }
  if (
    s.includes('cannot allocate memory') ||
    s.includes('resource temporarily unavailable') ||
    s.includes('no space left on device') ||
    s.includes('memory limit') ||
    s.includes('oom')
  ) {
    return {
      code: DOCKER_ERROR_CODES.RESOURCE_LIMIT,
      message: `${DOCKER_ERROR_CODES.RESOURCE_LIMIT}: Docker resource limit`,
    };
  }
  const stderrSummary = (stderr ?? '').trim().slice(0, 200);
  return {
    code: DOCKER_ERROR_CODES.UNKNOWN,
    message: `${DOCKER_ERROR_CODES.UNKNOWN}: container_start_failed (exitCode=${exitCode}, stderr=${stderrSummary})`,
  };
}

/**
 * Parse `docker inspect --format '{{.State.Running}}|{{.State.ExitCode}}'` output.
 * Format: "true|0" or "false|137". Returns null on malformed input.
 */
export function parseInspectOutput(stdout: string): { running: boolean; exitCode: number } | null {
  const trimmed = (stdout ?? '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('|');
  if (parts.length !== 2) return null;
  const runningRaw = parts[0];
  const exitCodeRaw = parts[1];
  if (runningRaw === undefined || exitCodeRaw === undefined) return null;
  const running = runningRaw.trim() === 'true';
  const exitCode = parseInt(exitCodeRaw.trim(), 10);
  if (Number.isNaN(exitCode)) return null;
  return { running, exitCode };
}

/**
 * DECK-WORKER-ISOLATION (ADR-G-005): build the read-only shadow mount that hides
 * the project's `.deck` secret file from a worker container.
 *
 * The docker backend bind-mounts the WHOLE project root read-write at
 * `/workspace`, and `.deck` lives in the project root — so without this a worker
 * can `read('/workspace/.deck')` and see every deckent secret (verified live).
 * Overlaying an empty regular file at that path read-only makes the worker see a
 * 0-byte `.deck` while the host file is untouched; the provider credential the
 * worker legitimately needs still arrives via the per-provider env allowlist
 * (F1-014r), so nothing breaks.
 *
 * **CONDITIONAL by design — only shadow when the host `.deck` exists.** A nested
 * bind mount materializes its target on the host underlying dir before mounting,
 * and `/workspace` IS the project root (same inode). Shadowing a non-existent
 * `.deck` therefore makes docker CREATE a phantom empty `${dir}/.deck` on the
 * host that persists after the container exits (verified: regular empty file) —
 * deckent silently writing a secret file into the user's repo and colliding with
 * `createDeckTemplate` / DECK-OVERWRITE-GUARD. No file to hide ⇒ no mount.
 *
 * Pure — exported for unit tests. The caller creates the empty shadow source file
 * (a regular 0-byte file, so docker cannot create a `.deck` *directory* instead).
 *
 * NOTE (honest scope): this closes the file-exposure half of zero-worker-exposure
 * for the DOCKER backend only. The subprocess backend runs the worker as a host
 * process inside the project root, so `.deck` stays disk-readable there (mitigated
 * by env-scrubbing, not mount-isolation) until the host-side credential broker
 * lands — see ADR-G-005.
 */
export function buildDeckShadowMountArgs(deckExists: boolean, shadowHostPath: string): string[] {
  if (!deckExists) return [];
  return ['-v', `${shadowHostPath}:${CONTAINER_WORKSPACE}/${DECK_FILE_NAME}:ro`];
}

/**
 * DECK-WORKER-ISOLATION (ADR-G-005): create/refresh the empty host file that the
 * `.deck` shadow mount overlays, returning its path.
 *
 * The shadow source lives at `${tasksDir}/.deck-shadow` — a single path shared by
 * EVERY worker in a sprint, so the write MUST be idempotent. It is written
 * owner-writable (`0o600`), never `0o400`: a read-only file would make the second
 * worker's `writeFileSync` (which opens `O_WRONLY|O_TRUNC`) throw `EACCES` and
 * crash the spawn, breaking every multi-worker docker sprint. Read-only INSIDE the
 * container is enforced by the mount's `:ro` flag (buildDeckShadowMountArgs), not
 * by the host file mode, so host write permission does not weaken the isolation.
 *
 * Exported for unit tests (idempotency regression).
 *
 * STALE-SHADOW-PERMS fix (Sprint 349): `writeFileSync`'s `mode` option only
 * applies when the file is CREATED — against a pre-existing file the call
 * opens `O_WRONLY|O_TRUNC` and `mode` is ignored entirely. A shadow left
 * read-only (0o400) by an older build (or a foreign-permission artifact)
 * therefore makes the O_TRUNC write throw `EACCES` and fail the whole SPAWN
 * phase (live-observed: sprint-347 first launch). Converge ANY pre-existing
 * perm state to writable before writing: try `chmodSync` first (cheap,
 * preserves the file/inode); if that fails (e.g. Windows ACL semantics, or a
 * foreign-owned file chmod can't fix), fall back to removing the stale file
 * so the write below re-creates it fresh via its CREATE-path `mode`. Both
 * guards are best-effort and never throw through — a genuinely unwritable
 * path still surfaces an honest error from the final `writeFileSync`.
 */
export function ensureDeckShadowFile(tasksDir: string): string {
  const shadowHostPath = join(tasksDir, '.deck-shadow');
  if (existsSync(shadowHostPath)) {
    try {
      chmodSync(shadowHostPath, 0o600);
    } catch (e) {
      debugLog('docker-backend:deck-shadow-chmod', e);
      try {
        unlinkSync(shadowHostPath);
      } catch (unlinkErr) {
        debugLog('docker-backend:deck-shadow-unlink', unlinkErr);
      }
    }
  }
  writeFileSync(shadowHostPath, '', { mode: 0o600 });
  return shadowHostPath;
}

// ─── born-644 (428-012 BUILD-VIOLATION-GUARD, B542): dist read-only mount guard ──
// The dist-mtime sentinel further below (computeDistFingerprint/distFingerprintsChanged/
// applyDistMutationAdvisory, wired in monitorContainer) only DETECTS a dist/ mutation
// AFTER the container has already exited — advisory-only, mirroring the NPM-ADVISORY
// precedent (born-454), never blocking. This is the MECHANICAL half: a nested read-only
// bind mount of the host `dist/` directory over the container's `${CONTAINER_WORKSPACE}/dist`
// — same overlay technique as buildDeckShadowMountArgs (ADR-G-005): the whole project
// root is already bind-mounted READ-WRITE at CONTAINER_WORKSPACE, and a nested
// `-v ...:ro` mount on top of one subtree shadows only that subtree read-only. A worker
// container that runs `npm run build`/`tsc`/`build:all` now hits a real filesystem-level
// EROFS/EACCES immediately, instead of silently writing through to host dist/ — the
// WORKER-GUIDE.md "no build in worker" rule becomes structurally unavoidable rather than
// advisory-only. The two layers are independent and both stay wired: this mount blocks
// the write; the sentinel still catches it (defense-in-depth) if the mount is ever
// bypassed or misconfigured.

/**
 * Build the read-only dist/ overlay mount args for `docker run`.
 *
 * **CONDITIONAL by design — only mounts when the host `dist/` already exists.**
 * Mirrors {@link buildDeckShadowMountArgs}: a nested bind mount over a MISSING target
 * materializes a phantom directory on the host underlying dir before mounting
 * (CONTAINER_WORKSPACE IS the project root, same inode) — mounting a not-yet-built
 * `dist/` read-only would make docker create an empty, host-created `dist/` directory
 * that then blocks the very next legitimate `npm run build`. No `dist/` yet (fresh
 * clone / pre-first-build) ⇒ no mount; the dist-mtime sentinel already treats a null
 * fingerprint as the honest "not built yet" state, so nothing regresses.
 *
 * Pure — exported for unit tests.
 */
export function buildDistReadOnlyMountArgs(distExists: boolean, distHostPath: string): string[] {
  if (!distExists) return [];
  return ['-v', `${distHostPath}:${CONTAINER_WORKSPACE}/dist:ro`];
}

// ─── 593-001 F2c: design-catalog mount mask (flag-gated, default OFF) ────────
// Measured leak: the project root is bind-mounted whole at CONTAINER_WORKSPACE,
// so the repo's DESIGN CATALOGS ride into every worker container — `.claude/skills/`
// (11 SKILL.md, ~118.8KB) + `.claude/agents/` (3 files, ~8KB) — none of which the
// typical worker task needs. Same overlay technique as buildDeckShadowMountArgs /
// buildDistReadOnlyMountArgs: a nested read-only bind of an EMPTY host directory
// over the catalog path makes the worker see it empty while the host tree is
// untouched.
//
// ADR-G-027 boundary (binding): this masks MOUNT-side DISCOVERY only. The bodies of
// the skills actually ASSIGNED to the task are injected verbatim INTO the prompt by
// buildSkillBlock (prompt-god-template.ts) and are not touched here — no skill/ADR
// content is truncated, and the worker's ACCESS to its own assigned skill is
// unchanged. Only unassigned catalog browsing goes away.

/** Project-relative catalog directories the mask empties in the worker's view. */
export const CATALOG_MASK_RELATIVE_PATHS: readonly string[] = ['.claude/skills', '.claude/agents'];

/** Name of the shared empty host directory the catalog mask overlays. */
const CATALOG_MASK_DIR_NAME = '.catalog-mask';

/**
 * Build the read-only catalog-mask overlay mount args for `docker run`.
 *
 * **CONDITIONAL by design — the caller passes only catalog paths that EXIST on the
 * host.** Mirrors {@link buildDeckShadowMountArgs} / {@link buildDistReadOnlyMountArgs}:
 * a nested bind mount over a MISSING target materializes a phantom directory on the
 * host underlying dir before mounting (CONTAINER_WORKSPACE IS the project root, same
 * inode), so masking a non-existent `.claude/agents` would make docker CREATE an empty
 * `.claude/agents/` in the user's repo that outlives the container. No catalog ⇒ no
 * mount.
 *
 * **Flag-gated:** `enabled === false` (the default, `prompt.catalog_mount_mask`) returns
 * an empty arg list, so the produced `docker run` argv stays byte-identical to the
 * pre-mask behavior.
 *
 * Pure — exported for unit tests. The caller creates the empty mask source directory
 * (see {@link ensureCatalogMaskDir}).
 */
export function buildCatalogMaskMountArgs(
  enabled: boolean,
  maskDirHostPath: string,
  presentCatalogRelativePaths: readonly string[],
): string[] {
  if (!enabled) return [];
  return presentCatalogRelativePaths.flatMap(
    rel => ['-v', `${maskDirHostPath}:${CONTAINER_WORKSPACE}/${rel}:ro`],
  );
}

/**
 * Create/refresh the empty host directory that the catalog mask overlays, returning
 * its path.
 *
 * The mask source lives at `${tasksDir}/.catalog-mask` — a single path shared by EVERY
 * worker in a sprint, so the create MUST be idempotent (`recursive: true` never throws
 * on an existing directory). It stays EMPTY: the overlay's whole purpose is that the
 * container sees nothing at the catalog paths. Unlike the `.deck` shadow this needs no
 * permission convergence — nothing ever writes into it.
 *
 * Exported for unit tests.
 */
export function ensureCatalogMaskDir(tasksDir: string): string {
  const maskDir = join(tasksDir, CATALOG_MASK_DIR_NAME);
  mkdirSync(maskDir, { recursive: true });
  return maskDir;
}

// ─── Docker heartbeat wrapper compatibility ────────────────────────────────
// Host observations are now published only through WorkerHeartbeatAuthorityStore.
// Keep exported wrapper builders as inert compatibility seams; they must never
// supply a shell timestamp or write a competing raw heartbeat.

/**
 * Build the POSIX `sh` `write_hb_if_stale()` function definition. Extracted
 * from {@link buildHeartbeatWrapperLoop} so it is independently invokable in
 * tests (write it to a script, call `write_hb_if_stale <seq>`) without
 * running the real 15s-interval background loop.
 */
export function buildHeartbeatGateFn(taskId: string): string {
  void taskId;
  return 'write_hb_if_stale() { return 0; }';
}

/**
 * INERT compatibility seam (537 doc-drift fix): heartbeat authority moved
 * host-primary to WorkerHeartbeatAuthorityStore — the wrapper NO LONGER runs
 * any in-container heartbeat loop. This export stays only so historical
 * callsites keep a stable, pinned no-op shape (see
 * tests/orchestra/wrapper-hb-allowlist.test.ts); it must never regain a
 * driver.
 */
export function buildHeartbeatWrapperLoop(taskId: string): string {
  return buildHeartbeatGateFn(taskId);
}

/**
 * Persist one host-observed Docker heartbeat.  The authority store owns the
 * sequence and timestamp; Docker, the wrapper, and worker result only supply
 * independently observable process and verdict facts.
 */
export function observeDockerHeartbeatAuthority(input: {
  readonly tasksDir: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  readonly hostProcessOutcome: WorkerHeartbeatAuthorityWrite['hostProcessOutcome'];
  readonly workerTaskVerdict: WorkerHeartbeatAuthorityWrite['workerTaskVerdict'];
  readonly liveness: WorkerHeartbeatAuthorityWrite['liveness'];
  /**
   * PROD-LANDED-FENCE-ORDER-001: a caller that has already closed (or is about
   * to close) the active claim chain must capture the fence while the claim is
   * still active and pass it here — the default lookup fails closed once a
   * LANDED retirement or closure is durable.
   */
  readonly activeClaimFence?: string;
}): void {
  const { settlementRef } = input;
  const identity = {
    runId: settlementRef.projectRootSha256,
    taskId: settlementRef.taskId,
    attemptId: settlementRef.attemptId,
    workerId: `docker-${settlementRef.taskId}`,
    fence: input.activeClaimFence ?? taskResultSettlementActiveClaimDigest(settlementRef),
  };
  const store = new WorkerHeartbeatAuthorityStore(join(input.tasksDir, 'worker-heartbeat-authority'));
  const initialized = store.initialize(identity);
  if (initialized.state === 'HOLD') {
    debugLog('docker-backend:heartbeat-authority-hold', initialized.detail);
    return;
  }
  const expectedHostSequence = store.read(identity)?.latest?.hostSequence ?? 0;
  const observed = store.observe({
    identity,
    expectedHostSequence,
    hostProcessOutcome: input.hostProcessOutcome,
    workerTaskVerdict: input.workerTaskVerdict,
    liveness: input.liveness,
  });
  if (observed.state === 'HOLD') {
    debugLog('docker-backend:heartbeat-authority-hold', observed.detail);
    return;
  }

  // Runtime surfaces consume `.hb` as an activity projection, while the
  // append-only host authority above owns liveness, sequence and terminal
  // truth. Project the exact accepted host observation here so a worker can
  // never leave an ambiguous legacy heartbeat (`EXECUTING` forever) after the
  // container has exited. The projection carries the same attempt identity and
  // host timestamp; every consumer can deterministically join it back to the
  // authority journal and result settlement.
  const latest = observed.authority.latest;
  if (!latest) return;
  const terminal = latest.hostProcessOutcome.state === 'exited';
  const status = terminal
    ? latest.workerTaskVerdict === 'done' ? 'DONE'
      : latest.workerTaskVerdict === 'no-go' ? 'NO_GO'
        : 'HOLD'
    : 'EXECUTING';
  const currentAction = terminal
    ? `Host settled attempt: ${latest.workerTaskVerdict}`
    : 'Host admitted provider process';
  const heartbeat = createWorkerActivityHeartbeat({
    taskId: settlementRef.taskId,
    workerId: identity.workerId,
    attemptId: settlementRef.attemptId,
    backend: 'docker',
    status,
    currentAction,
    observedAt: latest.hostObservedAt,
  });
  atomicWriteFileSync(
    join(input.tasksDir, `task-${settlementRef.taskId}.hb`),
    serializeWorkerActivityHeartbeat(heartbeat),
  );
}

export interface DockerProviderExecutionObservationIngest {
  readonly ingested: number;
  readonly duplicates: number;
  readonly contradictions: number;
  /** Files that did not belong to this exact attempt, or were unreadable/malformed. */
  readonly rejected: number;
}

/**
 * Host ingestion of the provider execution window a container emitted.
 *
 * The container is the only producer: it writes one immutable `.start.json` at
 * the exact provider invocation and one `.end.json` at exact process
 * settlement. The host copies those files into the provider observation store
 * and NOTHING else — a missing `.end.json` stays an open interval rather than
 * being closed from container exit, and a missing `.start.json` never yields a
 * synthesized start. Every file is bound to the exact attempt identity before
 * it is forwarded, so a stale or foreign emission cannot manufacture overlap.
 */
export function ingestDockerProviderExecutionObservations(input: {
  readonly tasksDir: string;
  readonly settlementRef: TaskResultSettlementRefV1;
  /** Exact host-authored producer identity, retained outside the container. */
  readonly binding: Readonly<DockerProviderExecutionObservationBinding>;
  readonly store: ProviderExecutionObservationStore;
}): DockerProviderExecutionObservationIngest {
  const executionId = dockerProviderExecutionId({
    projectRootSha256: input.settlementRef.projectRootSha256,
    taskId: input.settlementRef.taskId,
    attemptId: input.settlementRef.attemptId,
  });
  const expectedFence = taskResultSettlementActiveClaimDigest(input.settlementRef);
  const directory = join(input.tasksDir, PROVIDER_EXECUTION_OBSERVATION_DIR_NAME);
  let ingested = 0;
  let duplicates = 0;
  let contradictions = 0;
  let rejected = 0;
  // Start before end: the reducer rejects an end that precedes its start.
  for (const suffix of ['start', 'end'] as const) {
    const path = join(directory, `${executionId}.${suffix}.json`);
    if (!existsSync(path)) continue;
    let observation: ProviderExecutionObservationInput;
    try {
      observation = parseProviderExecutionObservationInput(
        JSON.parse(readFileSync(path, 'utf-8')),
      );
    } catch (error) {
      debugLog('docker-backend:provider-observation-malformed', error);
      rejected += 1;
      continue;
    }
    if (
      observation.type !== suffix
      || observation.executionId !== executionId
      || input.binding.executionId !== executionId
      || observation.runId !== input.binding.runId
      || observation.taskId !== input.settlementRef.taskId
      || observation.attemptId !== input.settlementRef.attemptId
      || observation.providerPrincipalDigest !== input.binding.providerPrincipalDigest
      || observation.fence !== expectedFence
    ) {
      debugLog(
        'docker-backend:provider-observation-foreign',
        `expected ${executionId} ${suffix}, got ${observation.executionId} ${observation.type}`,
      );
      rejected += 1;
      continue;
    }
    try {
      const written = input.store.put({ source: 'provider-runtime', observation });
      if (written.contradiction !== null) contradictions += 1;
      else if (written.duplicate) duplicates += 1;
      else ingested += 1;
    } catch (error) {
      debugLog('docker-backend:provider-observation-hold', error);
      rejected += 1;
    }
  }
  return { ingested, duplicates, contradictions, rejected };
}

function workerTaskVerdictFromDockerResult(resultPath: string): WorkerHeartbeatAuthorityWrite['workerTaskVerdict'] {
  if (!existsSync(resultPath)) return 'no-go';
  try {
    const result = JSON.parse(readFileSync(resultPath, 'utf-8')) as { selfAssessment?: unknown };
    if (result.selfAssessment === 'DONE' || result.selfAssessment === 'GO_WITH_TECH_DEBT') return 'done';
    if (result.selfAssessment === 'HOLD') return 'hold';
    return 'no-go';
  } catch {
    return 'no-go';
  }
}

// ─── born-471 → row 4061: WRITE-SCOPE AUTHORITY (single deriver) ────────────
// The worker PROMPT (prompt-god-template.ts PCOMP-W1, "single write authority")
// states that once an explicit filesWrite list exists it is the SOLE write
// authority and the directory list is READ/context scope only — a worker told
// "you may only write these N files" must not simultaneously hold a
// --allowedTools grant of Write()/Edit() over an entire read-context directory
// (e.g. docs/adr/ listed for read-context, with no matching docs/ entry in
// filesWrite, would otherwise still be writable).
//
// Row 4061 measured that this rule lived HERE only, while sprint-spawner.ts
// derived `['.tasks/', ...directories, ...filesWrite]` unconditionally — two
// backends, two divergent derivations of the same authority, so an
// inspection-only task got a different write scope depending on which backend
// ran it. `deriveWorkerWriteTargets` below is now the ONE typed place where the
// directories-into-write-scope decision is made; sprint-spawner.ts imports it
// (and `formatAllowedToolsFlag`) instead of re-deriving.
//
// Why the authority is hosted in this module rather than in sprint-spawner.ts:
// the reverse import direction is a real cycle
// (sprint-spawner → spawn-backend → spawn-backend-docker → sprint-spawner),
// while sprint-spawner → spawn-backend-docker is an edge that already exists
// transitively. A backend-neutral home would be nicer still, but creating one
// is outside row 4061's write authority.

/**
 * ADR-013 protected paths — workers must NEVER write these files.
 * CLAUDE.md and DECKENT.md are adapter files managed exclusively by Brain/init.
 */
const ADR013_PROTECTED_PATHS = new Set(['CLAUDE.md', 'DECKENT.md']);

/**
 * File extension pattern — matches bare extension entries like `.json`, `.ts`, `.md`.
 * Must have NO path separators (so `.tasks/` is not matched), and the dot must be followed
 * by only short word characters typical of file extensions (max 5 chars).
 * Examples that match (invalid scope entries): `.json`, `.ts`, `.md`, `.mjs`
 * Examples that do NOT match (valid): `.tasks/`, `.deckent/`, `.tasks`, `src/core/`
 */
const EXTENSION_ONLY_RE = /^\.[a-z]{1,5}$/i;

/**
 * Normalize a single scope path:
 * - Trims whitespace
 * - Rejects bare file-extension entries (e.g. `.json`, `.ts`, `.md`) — not valid paths
 * - Removes trailing slash ONLY from file paths (basename has a non-leading-dot extension)
 *   e.g. `DECKENT.md/` → `DECKENT.md`, but `src/core/` stays `src/core/`, `.tasks/` stays `.tasks/`
 * - Rejects ADR-013 protected paths (`CLAUDE.md`, `DECKENT.md`)
 *
 * @returns The normalized path, or null if the path should be excluded
 */
export function normalizeScopePath(rawPath: string): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) return null;

  // Reject bare extension entries like ".json", ".ts" — they have no slash and match
  // the extension pattern. Must check trimmed (not without-slash) to avoid catching ".tasks/".
  if (EXTENSION_ONLY_RE.test(trimmed)) return null;

  // Compute the basename (without trailing slash) for extension detection
  const basenameForCheck = trimmed.replace(/\/$/, '').split('/').pop() ?? '';

  // Remove trailing slash only when the basename looks like a file:
  // it has an extension (dot that is NOT the first character of the basename).
  // This keeps directory entries like `src/core/`, `.tasks/`, `.deckent/` unchanged.
  const hasFileExtension = basenameForCheck.includes('.') && !basenameForCheck.startsWith('.');
  const normalized = (trimmed.endsWith('/') && hasFileExtension)
    ? trimmed.slice(0, -1)
    : trimmed;

  // Compute final basename for ADR-013 check
  const basename = normalized.replace(/\/$/, '').split('/').pop() ?? normalized;

  // Reject ADR-013 protected adapter files (full basename match)
  if (ADR013_PROTECTED_PATHS.has(basename)) return null;

  return normalized;
}

/** Pure scope shape the write-scope authority needs — subset of `TaskScope` (core/task-types.ts). */
export interface WorkerWriteScopeInput {
  directories?: readonly string[];
  filesRead?: readonly string[];
  filesWrite?: readonly string[];
}

/**
 * THE canonical write-target deriver — every backend's `--allowedTools`
 * Write()/Edit() target list comes from here and nowhere else.
 *
 * The directories-into-write-scope decision is made in exactly one place below:
 * - `filesWrite` present → SOLE write authority (directories excluded — they
 *   stay read-only context, reachable only via the unscoped Read/Glob/Grep).
 * - An exact `filesRead` list with no `filesWrite` targets is inspection-only:
 *   directories remain read context and the write scope narrows to `.tasks/`.
 * - When both file lists are absent/empty, directories remain the legacy
 *   write-fallback target.
 *
 * `.tasks/` is always the first target so the worker can write its own
 * heartbeat/result files — this also means a task with neither directories nor
 * filesWrite still narrows Write/Edit to `.tasks/` only, never falls open to
 * unrestricted Write/Edit (a scope-less task must not silently get the widest
 * possible grant). Entries are normalized (`normalizeScopePath`: ADR-013
 * protection, extension-only rejection, file trailing-slash strip) and deduped.
 *
 * Pure — exported for unit tests and for sprint-spawner.ts.
 */
export function deriveWorkerWriteTargets(scope: WorkerWriteScopeInput | undefined): string[] {
  const directories = normalizeNonEmptyStrings(scope?.directories);
  const filesRead = normalizeNonEmptyStrings(scope?.filesRead);
  const filesWrite = normalizeNonEmptyStrings(scope?.filesWrite);
  const inspectionOnly = filesWrite.length === 0 && filesRead.length > 0;
  const writeSource = filesWrite.length > 0 ? filesWrite : inspectionOnly ? [] : directories;
  return dedupeNormalized(['.tasks/', ...writeSource]);
}

/**
 * Render the provider CLI `--allowedTools` flag value for a derived write-target
 * list. Formatting only — it makes no scope decision, so both call sites emit a
 * byte-identical flag for a byte-identical target list.
 */
/**
 * The ONE worker tool-name list. `formatAllowedToolsFlag` renders the
 * permission allowlist from it (with write-target qualifiers) and
 * `WORKER_AVAILABLE_TOOLS` renders the schema-narrowing `--tools` value from
 * it — one source, two projections, no parallel literals.
 */
const WORKER_TOOL_NAMES = ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'] as const;

/**
 * 7094-F2a (owner-approved 2026-08-19): the `--tools` value for a worker.
 * `--allowedTools` only gates permissions — the CLI still loads its FULL
 * tool-schema catalog (32 tools; the measured 18,264-token stable prefix,
 * sprint-563 logs); `--tools` narrows the provider-visible schema itself to
 * the tools a worker can actually use.
 */
export const WORKER_AVAILABLE_TOOLS: string = WORKER_TOOL_NAMES.join(',');

export function formatAllowedToolsFlag(writeTargets: readonly string[]): string {
  const targets = writeTargets.join(',');
  const qualified = WORKER_TOOL_NAMES
    .map((name) => (name === 'Write' || name === 'Edit' ? `${name}(${targets})` : name));
  return qualified.join(',');
}

/**
 * Derive the docker backend's `--allowedTools` string from a task's scope.
 * Thin formatter over the canonical deriver — kept as the backend's named entry
 * point (and for its existing unit tests). Pure.
 */
export function buildDockerAllowedTools(scope: WorkerWriteScopeInput): string {
  return formatAllowedToolsFlag(deriveWorkerWriteTargets(scope));
}

function normalizeNonEmptyStrings(values: readonly string[] | undefined): string[] {
  return (values ?? []).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function dedupeNormalized(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of paths) {
    const normalized = normalizeScopePath(raw);
    if (normalized === null || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

// ─── born-644 (408-002 BUILD-VIOLATION-GUARD): dist-mtime sentinel ─────────
// Live incident (2026-07-11): host `dist/` was found rebuilt mid-sprint — suspected an
// in-container `npm run build`/`tsc`/`build:all`. The docker backend bind-mounts the WHOLE
// project root read-write (`-v ${dir}:${CONTAINER_WORKSPACE}`, see runSpawn's dockerArgs), so
// any such command run inside a container writes straight through to host `dist/`, poisoning
// every other worker's ESM module cache mid-sprint (a live-loaded `dist/` module can be
// half-rewritten under a concurrent worker's require). This is advisory-only, mirroring the
// NPM-ADVISORY precedent (born-454, see the worker-prompt's own dependency-mutation
// escalation contract): it NEVER blocks a spawn or alters a worker's own selfAssessment — it
// only flags `.result.distMutated` + a loud stderr warning once the mutation is observed after
// container exit, so Brain/the operator see it without any worker being punished for it.

/** Cheap content-mutation snapshot of a directory tree — not a cryptographic hash. */
export interface DistFingerprint {
  fileCount: number;
  maxMtimeMs: number;
}

/**
 * Snapshot `distDir` for later mutation comparison. Returns null when the directory does not
 * exist (fresh clone / pre-first-build — absence is not itself a mutation signal).
 *
 * Per-entry `statSync` failures are swallowed (entry vanished mid-walk, e.g. a concurrent
 * build actively deleting/recreating files) — never let the sentinel itself crash a spawn.
 * Exported for unit tests.
 */
export function computeDistFingerprint(distDir: string): DistFingerprint | null {
  if (!existsSync(distDir)) return null;
  let entries: string[];
  try {
    entries = readdirSync(distDir, { recursive: true }) as string[];
  } catch (e) {
    debugLog('docker-backend:dist-fingerprint', e);
    return null;
  }
  let fileCount = 0;
  let maxMtimeMs = 0;
  for (const rel of entries) {
    try {
      const st = statSync(join(distDir, rel));
      if (!st.isFile()) continue;
      fileCount++;
      if (st.mtimeMs > maxMtimeMs) maxMtimeMs = st.mtimeMs;
    } catch (e) {
      debugLog('docker-backend:dist-fingerprint-entry', e);
    }
  }
  return { fileCount, maxMtimeMs };
}

/**
 * Pure comparison — true iff the two snapshots indicate `dist/` was mutated (file added,
 * removed, or an existing file's content rewritten) between capture points. A null<->non-null
 * transition (dist/ appeared or disappeared entirely) also counts as a mutation.
 */
export function distFingerprintsChanged(
  before: DistFingerprint | null,
  after: DistFingerprint | null,
): boolean {
  if (before === null && after === null) return false;
  if (before === null || after === null) return true;
  return before.fileCount !== after.fileCount || before.maxMtimeMs !== after.maxMtimeMs;
}

/**
 * Advisory-only `.result` patch: merges `distMutated: true` into the existing result JSON when
 * `mutated` is true AND the file exists. A no-op (returns false, writes nothing) when not
 * mutated, when `.result` is missing, or when the existing JSON cannot be parsed — this must
 * never throw out and never fabricate a `.result` the worker did not write itself (that would
 * cross from advisory into blocking). Exported for unit tests.
 */
export function applyDistMutationAdvisory(resultPath: string, mutated: boolean): boolean {
  if (!mutated || !existsSync(resultPath)) return false;
  try {
    const parsed = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
    parsed.distMutated = true;
    writeFileSync(resultPath, JSON.stringify(parsed, null, 2), 'utf-8');
    return true;
  } catch (e) {
    debugLog('docker-backend:dist-mutation-patch', e);
    return false;
  }
}

// ─── born-671 (416-001 CAPTURE-TRUTH): streamed docker-logs capture ─────────
// TT549 live incident (CC-doğrulandı): monitorContainer captured `docker logs`
// via spawnSync with NO maxBuffer → Node's 1 MiB default SILENTLY truncated 44%
// (16/36) of the trace corpus at the 1.075–1.171 MB band, AND the ENOBUFS error
// spawnSync sets on that overflow was never checked. The cut dropped the terminal
// usage envelope → patchResultUsageFromEnvelope got truncated input → cost-heuristic
// 293× drift (413-001). This replaces the fixed-buffer spawnSync with an async
// STREAM: chunks accumulate with only a generous 256 MiB SAFETY ceiling (an honest
// on-disk marker + loud warn on the rare overflow — NEVER a silent cut), and a
// spawn-error / non-zero-exit / terminating-signal is surfaced (captureIncomplete +
// named loud warn) with the partial data STILL returned, never hidden. A raw
// maxBuffer bump cannot do any of this — the streaming child + honest ceiling are
// the structural difference (why the NO_GO "stream'siz maxBuffer-büyütme" is avoided).

/**
 * Safety ceiling for a single streamed `docker logs` capture (256 MiB). This is
 * NOT the old 1 MiB maxBuffer cut — it exists only to stop a runaway/adversarial
 * log from exhausting host memory, and hitting it is surfaced HONESTLY (marker +
 * warn + captureIncomplete), never silently. Realistic worker traces are 1–10 MB.
 */
export const DOCKER_LOG_CAPTURE_CEILING_BYTES = 256 * 1024 * 1024;

/**
 * Wall-clock cap for reading `docker logs` off an already-exited container (30 s).
 * On timeout the child is killed and the partial capture returned as incomplete so
 * a hung `docker logs` never stalls the downstream exact-ID `docker rm` / lock release.
 * Deliberately higher than the old spawnSync 10 s — a large (but legitimate) log must
 * not be cut for speed; completeness wins (the whole point of this fix).
 */
export const DOCKER_LOG_CAPTURE_TIMEOUT_MS = 30_000;

/**
 * Honest, self-identifying marker appended to captured content when the safety
 * ceiling is hit. It flows into the `.log` as a `text` LogEvent (writeNormalizedDockerLog
 * splits on newline), so the truncation is visible ON DISK, not merely in a warning.
 */
export const DOCKER_LOG_TRUNCATION_MARKER =
  '\n[deckent:docker-logs-capture] TRUNCATED at the 256MiB safety ceiling — capture '
  + 'stopped here (honest marker, NOT a silent 1MiB cut). captureIncomplete=true\n';

/**
 * Minimal child shape {@link captureDockerLogs} needs — the SpawnImpl pattern from
 * core/worker-image-check.ts, extended with `kill()` for the ceiling cut. A real
 * `node:child_process` ChildProcess satisfies it structurally.
 */
export interface DockerLogsChildLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  kill(signal?: NodeJS.Signals): boolean;
}

/** Injectable async spawn for {@link captureDockerLogs} (defaults to node spawn). */
export type DockerLogsSpawnImpl = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => DockerLogsChildLike;

export interface DockerCrossVerifyRuntimeCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type DockerCrossVerifyRuntimeCommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<DockerCrossVerifyRuntimeCommandResult>;

/** Internal execution seam; the public probe surface never exposes Docker arguments. */
export type DockerReachabilityProbeCommandRunner = (input: Readonly<{
  readonly args: readonly string[];
  readonly stdin: Uint8Array;
  readonly timeoutMs: number;
  readonly outputCeiling: number;
}>) => Promise<Readonly<DockerCrossVerifyRuntimeCommandResult>>;

export interface DockerSpawnBackendConstructionOptions {
  readonly image?: string;
  readonly timeoutSeconds?: number;
  readonly gracefulTimeoutSeconds?: number;
  readonly memoryLimit?: string;
  readonly memorySwap?: string;
  readonly kindMemoryLimits?: Record<string, string>;
  /** WORKER-ENV-TMPFS-001: writable HOME tmpfs size (e.g. '256m'). */
  readonly homeTmpfsSize?: string;
  readonly verifyProviderCliInImage?: boolean;
  /**
   * 593-001 F2c: mask the repo design catalogs (`.claude/skills`, `.claude/agents`)
   * from the worker's mount view. Config source: `prompt.catalog_mount_mask`
   * (default false). Opt-in, exactly like {@link verifyProviderCliInImage}: the
   * SpawnBackendFactory wiring that reads the config key lives outside this task's
   * write scope, so today the flag is set by the constructor caller.
   */
  readonly catalogMountMask?: boolean;
  /** Enable the spec-defined system-prompt core channel for capable providers. */
  readonly codexCoreChannel?: boolean;
  /** Suppress project-document auto-loading through the provider command spec. */
  readonly codexSuppressProjectDoc?: boolean;
  readonly crossVerifyRuntimeCommandRunner?: DockerCrossVerifyRuntimeCommandRunner;
  readonly reachabilityProbeCommandRunner?: DockerReachabilityProbeCommandRunner;
  /** Injectable host adapter selector for hermetic platform-matrix tests. */
  readonly platform?: NodeJS.Platform;
  /** Test-only HOME projection; production defaults to the host HOME. */
  readonly homeDir?: string;
  /** Hermetic state-root injection; production resolves the platform-global state dir. */
  readonly custodyStateDir?: string;
  /** Async, bounded git/docker seam for exact private-workspace lifecycle. */
  readonly exactWorkspaceCommandRunner?: ExactDockerWorkspaceCommandRunnerV1;
}

/** Result of a streamed docker-logs capture. */
export interface DockerLogCapture {
  /** Full captured output — stdout THEN stderr, matching the old `(stdout)+(stderr)` concat. */
  content: string;
  /** True when the 256 MiB safety ceiling was hit — `content` carries the honest marker. */
  truncated: boolean;
  /** True when data may be missing: truncation, spawn error, non-zero exit, or signal. */
  captureIncomplete: boolean;
  /** docker-logs exit code, or null when the spawn errored / was killed before a clean exit. */
  exitCode: number | null;
  /** Terminating signal, if any. */
  signal: NodeJS.Signals | null;
  /** Bytes retained (equals the ceiling when truncated). */
  bytesCaptured: number;
}

export type DockerExactCrossVerifyRuntimeIdentity =
  | {
      readonly state: 'ready';
      readonly imageId: string;
      readonly runtimeFingerprint: string;
      readonly executionProfileRef: string;
      readonly toolProfileDigest: string;
      readonly authorityEvidenceRef: string;
    }
  | {
      readonly state: 'hold';
      readonly reasonCode:
        | 'docker_image_identity_unavailable'
        | 'docker_provider_cli_unavailable'
        | 'docker_provider_model_mismatch';
      readonly authorityEvidenceRef: string;
    };

const CROSS_VERIFY_RUNTIME_COMMAND_TIMEOUT_MS = 15_000;
const CROSS_VERIFY_RUNTIME_COMMAND_OUTPUT_CEILING_BYTES = 64 * 1024;

function runBoundedCrossVerifyRuntimeCommand(
  command: string,
  args: readonly string[],
): Promise<DockerCrossVerifyRuntimeCommandResult> {
  return new Promise(resolveCommand => {
    let settled = false;
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let child: ReturnType<typeof nodeSpawn>;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: DockerCrossVerifyRuntimeCommandResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveCommand(Object.freeze(result));
    };
    const appendBounded = (
      current: Buffer<ArrayBufferLike>,
      chunk: string | Buffer,
    ): { readonly value: Buffer<ArrayBufferLike>; readonly exceeded: boolean } => {
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = CROSS_VERIFY_RUNTIME_COMMAND_OUTPUT_CEILING_BYTES - current.length;
      if (remaining <= 0) return { value: current, exceeded: incoming.length > 0 };
      return {
        value: Buffer.concat([current, incoming.subarray(0, remaining)]),
        exceeded: incoming.length > remaining,
      };
    };

    try {
      child = nodeSpawn(command, [...args], {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolveCommand(Object.freeze({
        status: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
      }));
      return;
    }

    child.stdout?.on('data', chunk => {
      const absorbed = appendBounded(stdout, chunk as string | Buffer);
      stdout = absorbed.value;
      if (absorbed.exceeded) {
        try {
          child.kill('SIGKILL');
        } catch {
          // The process may already have exited.
        }
        finish({
          status: null,
          stdout: stdout.toString('utf8'),
          stderr: 'cross-verify runtime command output exceeded the safety ceiling',
        });
      }
    });
    child.stderr?.on('data', chunk => {
      const absorbed = appendBounded(stderr, chunk as string | Buffer);
      stderr = absorbed.value;
      if (absorbed.exceeded) {
        try {
          child.kill('SIGKILL');
        } catch {
          // The process may already have exited.
        }
        finish({
          status: null,
          stdout: stdout.toString('utf8'),
          stderr: 'cross-verify runtime command output exceeded the safety ceiling',
        });
      }
    });
    child.once('error', error => {
      finish({ status: null, stdout: stdout.toString('utf8'), stderr: error.message });
    });
    child.once('close', code => {
      finish({
        status: code,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
      });
    });

    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // The process may already have exited; the bounded result still fails closed.
      }
      finish({
        status: null,
        stdout: stdout.toString('utf8'),
        stderr: 'cross-verify runtime command timed out',
      });
    }, CROSS_VERIFY_RUNTIME_COMMAND_TIMEOUT_MS);
    timer.unref();
  });
}

function runBoundedReachabilityProbeCommand(input: Readonly<{
  readonly args: readonly string[];
  readonly stdin: Uint8Array;
  readonly timeoutMs: number;
  readonly outputCeiling: number;
}>): Promise<DockerCrossVerifyRuntimeCommandResult> {
  return new Promise(resolveCommand => {
    let settled = false;
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let child: ReturnType<typeof nodeSpawn>;
    const finish = (result: DockerCrossVerifyRuntimeCommandResult): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolveCommand(Object.freeze(result));
    };
    const append = (current: Buffer<ArrayBufferLike>, chunk: string | Buffer): {
      value: Buffer<ArrayBufferLike>;
      exceeded: boolean;
    } => {
      const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = input.outputCeiling - current.length;
      if (remaining <= 0) return { value: current, exceeded: incoming.length > 0 };
      return {
        value: Buffer.concat([current, incoming.subarray(0, remaining)]),
        exceeded: incoming.length > remaining,
      };
    };
    try {
      child = nodeSpawn('docker', [...input.args], { shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) {
      finish({ status: null, stdout: '', stderr: error instanceof Error ? error.message : String(error) });
      return;
    }
    const exceed = (): void => {
      try { child.kill('SIGKILL'); } catch { /* process may already have exited */ }
      finish({ status: null, stdout: stdout.toString('utf8'), stderr: 'probe output ceiling exceeded' });
    };
    child.stdout?.on('data', chunk => {
      const next = append(stdout, chunk as string | Buffer);
      stdout = next.value;
      if (next.exceeded) exceed();
    });
    child.stderr?.on('data', chunk => {
      const next = append(stderr, chunk as string | Buffer);
      stderr = next.value;
      if (next.exceeded) exceed();
    });
    child.once('error', error => finish({ status: null, stdout: stdout.toString('utf8'), stderr: error.message }));
    child.once('close', status => finish({ status, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') }));
    child.stdin?.end(Buffer.from(input.stdin));
    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* process may already have exited */ }
      finish({ status: null, stdout: stdout.toString('utf8'), stderr: 'probe timeout' });
    }, input.timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

// The provider token budget and the CLI transport envelope are different
// units. Claude/Codex/Gemini can wrap a tiny answer in JSON metadata that is
// much larger than maxOutputTokens bytes. Keep the transport independently
// bounded against output floods while leaving token admission to the
// owner-projected probe budget.
export const BOUNDED_REACHABILITY_CAPTURE_CEILING_BYTES = 64 * 1024;

/**
 * Stream `docker logs <container>` into memory with NO fixed 1 MiB cap — the core
 * fix for TT549. stdout+stderr chunks accumulate as they arrive; the only bound is
 * the generous {@link DOCKER_LOG_CAPTURE_CEILING_BYTES} safety ceiling, and hitting
 * it (or any spawn-error / non-zero-exit / signal) is surfaced honestly rather than
 * swallowed. The returned `content` is the SAME pristine string the old spawnSync
 * path produced, so its two consumers (writeNormalizedDockerLog +
 * patchResultUsageFromEnvelope) are byte-for-byte unchanged — only their INPUT is
 * now full-data instead of 1 MiB-truncated.
 *
 * Injectable `spawnImpl` (SpawnImpl pattern, core/worker-image-check.ts) keeps the
 * regression tests hermetic — no real docker. Exported for unit tests. Never throws:
 * a synchronous spawn failure resolves to an empty, `captureIncomplete` result.
 */
export function captureDockerLogs(
  containerName: string,
  spawnImpl?: DockerLogsSpawnImpl,
  opts?: { ceilingBytes?: number; timeoutMs?: number },
): Promise<DockerLogCapture> {
  const ceiling = opts?.ceilingBytes ?? DOCKER_LOG_CAPTURE_CEILING_BYTES;
  const timeoutMs = opts?.timeoutMs ?? DOCKER_LOG_CAPTURE_TIMEOUT_MS;
  const doSpawn: DockerLogsSpawnImpl =
    spawnImpl ?? ((command, args, options) => nodeSpawn(command, args, options));

  return new Promise<DockerLogCapture>((resolveCapture) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let totalBytes = 0;
    let truncated = false;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (outcome: {
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      spawnError?: Error;
    }): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      let content =
        Buffer.concat(stdoutChunks).toString('utf8') + Buffer.concat(stderrChunks).toString('utf8');
      // A deliberate ceiling-kill sets neither exitCode nor signal here (we own the
      // cut) — `truncated` alone carries that meaning, so it is NOT double-counted as
      // an abnormal exit below.
      const exitDishonest =
        outcome.spawnError !== undefined ||
        outcome.signal !== null ||
        (outcome.exitCode !== null && outcome.exitCode !== 0);
      const captureIncomplete = truncated || exitDishonest;
      if (truncated) {
        content += DOCKER_LOG_TRUNCATION_MARKER;
        console.warn(
          `[deckent:spawn-backend-docker] captureDockerLogs: '${containerName}' hit the `
          + `${ceiling}-byte capture ceiling — output truncated with an honest on-disk marker `
          + `(retained ${totalBytes} bytes). SAFETY cap, not the old 1MiB silent cut.`,
        );
      }
      if (outcome.spawnError !== undefined) {
        console.warn(
          `[deckent:spawn-backend-docker] captureDockerLogs: docker logs spawn/read error for `
          + `'${containerName}' — ${outcome.spawnError.message}. captureIncomplete=true; returning `
          + `${totalBytes} bytes of partial log (loss surfaced, not hidden).`,
        );
      } else if (exitDishonest) {
        console.warn(
          `[deckent:spawn-backend-docker] captureDockerLogs: docker logs for '${containerName}' `
          + `exited abnormally (exitCode=${outcome.exitCode}, signal=${outcome.signal}). `
          + `captureIncomplete=true; returning ${totalBytes} bytes of partial log (loss surfaced, not hidden).`,
        );
      }
      resolveCapture({
        content,
        truncated,
        captureIncomplete,
        exitCode: outcome.exitCode,
        signal: outcome.signal,
        bytesCaptured: totalBytes,
      });
    };

    let child: DockerLogsChildLike;
    try {
      child = doSpawn('docker', ['logs', containerName], { shell: false });
    } catch (err) {
      finish({ exitCode: null, signal: null, spawnError: err instanceof Error ? err : new Error(String(err)) });
      return;
    }

    const absorb = (chunks: Buffer[], chunk: string | Buffer): void => {
      if (truncated || settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      const remaining = ceiling - totalBytes;
      if (buf.length >= remaining) {
        // Ceiling hit — retain only what fits, mark truncated, stop the stream.
        if (remaining > 0) {
          chunks.push(buf.subarray(0, remaining));
          totalBytes += remaining;
        }
        truncated = true;
        try { child.kill('SIGKILL'); } catch { /* best-effort — process may already be gone */ }
        finish({ exitCode: null, signal: null });
        return;
      }
      chunks.push(buf);
      totalBytes += buf.length;
    };

    child.stdout?.on('data', (c: string | Buffer) => absorb(stdoutChunks, c));
    child.stderr?.on('data', (c: string | Buffer) => absorb(stderrChunks, c));
    child.on('error', (err) => finish({ exitCode: null, signal: null, spawnError: err }));
    child.on('close', (code, signal) => finish({ exitCode: code, signal }));

    timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* best-effort */ }
      finish({
        exitCode: null,
        signal: null,
        spawnError: new Error(`docker logs read timed out after ${timeoutMs}ms`),
      });
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
  });
}

// ─── Docker Spawn Backend ─────────────────────────────────────────────────

export class DockerSpawnBackend implements SpawnBackend {
  readonly name = 'docker';
  readonly liveUsageBudgetSupport = 'measured-stream' as const;
  /** Builds the provider system-prompt core argv, so an externalized core is delivered. */
  readonly canDeliverWorkerCore = true as const;
  /** ADR-G-037: host-stamped semantic checkpoint followed by exact-container stop. */
  readonly executionLandingCapability = 'checkpoint-stop' as const;

  private readonly projectDir: string;
  private readonly image: string;
  private readonly timeoutSeconds: number;
  private readonly gracefulTimeoutSeconds: number;
  private readonly memoryLimit: string;
  private readonly memorySwap: string;
  private readonly kindMemoryLimits: Record<string, string>;
  private readonly homeTmpfsSize: string;
  private readonly verifyProviderCliInImage: boolean;
  /** 593-001 F2c: `prompt.catalog_mount_mask` — default false (byte-identical argv). */
  private readonly catalogMountMask: boolean;
  private readonly codexCoreChannel: boolean;
  private readonly codexSuppressProjectDoc: boolean;
  private readonly crossVerifyRuntimeCommandRunner: DockerCrossVerifyRuntimeCommandRunner;
  private readonly reachabilityProbeCommandRunner: DockerReachabilityProbeCommandRunner;
  private readonly platform: NodeJS.Platform;
  private readonly homeDir: string;
  private readonly custodyStateDir: string | undefined;
  private readonly exactWorkspaceCommandRunner: ExactDockerWorkspaceCommandRunnerV1;
  private readonly exactCustodyScopes = new WeakMap<object, PreparedExactDockerCustodyScope>();
  private readonly exactCustodyTokens = new WeakMap<object, Readonly<{
    releaseIntent: Uint8Array;
    releaseCommit: Uint8Array;
    providerStart: Uint8Array;
    executionCommit: Uint8Array;
  }>>();
  private readonly exactCustodyPreparedByRequest = new Map<string, Readonly<{
    inputDigest: Sha256Digest;
    prepared: PreparedExactDockerCustodyV2;
  }>>();
  private readonly exactCustodyCompletions = new Map<Sha256Digest, Readonly<{
    scope: PreparedExactDockerCustodyScope;
    query: ExactDockerCustodyTerminalQueryV2;
    providerStartReceipt: Readonly<{ ref: Sha256Digest; digest: Sha256Digest }>;
    providerExecutionReceipt: Readonly<{ ref: Sha256Digest; digest: Sha256Digest }>;
    promise: Promise<ExactDockerCustodyCompletionV2>;
  }>>();
  private readonly exactCustodyProviderStarts = new Map<
    Sha256Digest,
    Readonly<{ ref: Sha256Digest; digest: Sha256Digest }>
  >();
  private readonly exactCustodyProviderExecutions = new Map<
    Sha256Digest,
    Readonly<{ ref: Sha256Digest; digest: Sha256Digest }>
  >();
  /** Serializes restart installation for one durable admission within this backend. */
  private readonly exactCustodyRecoverySetups = new Map<Sha256Digest, Promise<void>>();
  private readonly exactCustodyAcceptanceSetups = new Map<
    Sha256Digest,
    Promise<ExactDockerAcceptResultOutcomeV2>
  >();
  /** Terminal production acceptance, retained so callers observe failures instead of debug-only loss. */
  private readonly exactCustodyAutomaticAcceptances = new Map<
    Sha256Digest,
    Promise<ExactDockerAcceptResultOutcomeV2>
  >();
  /** Keeps the opaque reader capability alive after a cold durable acceptance reread. */
  private readonly exactRecoveredAcceptedResults = new Map<
    Sha256Digest,
    Readonly<{
      query: ExactDockerCustodyTerminalQueryV2;
      authority: CanonicalIngressAuthority;
      accepted: ExactDockerAcceptedResultV2;
    }>
  >();
  private readonly exactAcceptedResultReaders = new WeakMap<object, Readonly<{
    scope: PreparedExactDockerCustodyScope;
    query: ExactDockerCustodyTerminalQueryV2;
    acceptedResultRef: ExactAcceptedTaskResultRefV2;
    acceptedResultChainDigest: Sha256Digest;
    resultDigest: Sha256Digest;
    providerStream: ExactDockerVerifiedArtifactRefV2;
    providerExit: ExactDockerProviderExitObservationRefV2;
    hostBillingAuthority: ExactDockerAcceptedResultV2['hostBillingAuthority'];
    hostEffectAuthority: ExactDockerAcceptedResultV2['hostEffectAuthority'];
  }>>();
  /**
   * Son spawn'ın async-kuyruğu (capture + launch). Üretim fire-and-forget'tir ve
   * bunu BEKLEMEZ; test/exact-xverify tüketicileri tamamlanma/red gözlemi için
   * await edebilir. Aşağıdaki catch zinciri bağlı olduğundan reddi yetim kalamaz.
   */
  lastSpawnCompletion: Promise<void> = Promise.resolve();
  private readonly containers = new Map<string, {
    containerId: string;
    containerName: string;
    model: string;
    projectDir: string;
    tasksDir: string;
    settlementRef?: TaskResultSettlementRefV1;
    gitAdapterHostPath?: string;
  }>(); // taskId → effective execution context

  constructor(projectDir: string, opts?: DockerSpawnBackendConstructionOptions) {
    // WORKER-ENV-TMPFS-001: config-resolved HOME tmpfs size; default preserves 100m.
    this.projectDir = resolve(projectDir);
    this.image = opts?.image ?? DEFAULT_IMAGE;
    this.timeoutSeconds = opts?.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
    this.gracefulTimeoutSeconds = opts?.gracefulTimeoutSeconds ?? DEFAULT_GRACEFUL_TIMEOUT_SECONDS;
    this.memoryLimit = opts?.memoryLimit ?? DEFAULT_WORKER_MEMORY_LIMIT;
    this.homeTmpfsSize = opts?.homeTmpfsSize ?? DEFAULT_WORKER_HOME_TMPFS_SIZE;
    // MASTER-PLAN 666: swap must follow the limit, not a fixed constant. The
    // documented rule (and the 4g/6g default pair) is limit × 1.5; pinning the
    // constant meant raising `worker_memory_limit` to 6g silently produced
    // `--memory-swap == --memory`, i.e. swap fully DISABLED, so a transient
    // spike became an immediate kill (measured 2026-07-25, task 458-005).
    // An explicit `memorySwap` still wins; it must never be below the limit.
    const derivedSwap = (() => {
      // The documented default PAIR stays byte-for-byte ('4g'/'6g'): deriving it
      // would only reformat the same number ('6144m') and churn every consumer
      // that asserts the default contract. Derivation exists for the case that
      // actually broke — a limit the owner changed.
      if (this.memoryLimit === DEFAULT_WORKER_MEMORY_LIMIT) return DEFAULT_WORKER_MEMORY_SWAP;
      const limitBytes = parseMemoryString(this.memoryLimit);
      return limitBytes === null ? DEFAULT_WORKER_MEMORY_SWAP : deriveSwapFromLimitBytes(limitBytes);
    })();
    this.memorySwap = opts?.memorySwap ?? derivedSwap;
    const limitBytesForCheck = parseMemoryString(this.memoryLimit);
    const swapBytesForCheck = parseMemoryString(this.memorySwap);
    if (
      limitBytesForCheck !== null
      && swapBytesForCheck !== null
      && swapBytesForCheck < limitBytesForCheck
    ) {
      throw new DeckentError(
        'DECKENT_E004',
        `Worker memory swap '${this.memorySwap}' is below the memory limit '${this.memoryLimit}'. `
        + 'Docker requires --memory-swap >= --memory; set worker_memory_swap at or above worker_memory_limit '
        + '(or leave it unset to derive limit × 1.5).',
      );
    }
    const rawKindLimits = opts?.kindMemoryLimits ?? {};
    // Validate kind limits at construction time — fail fast on invalid values
    for (const [kind, limitStr] of Object.entries(rawKindLimits)) {
      if (parseMemoryString(limitStr) === null) {
        throw new DeckentError('DECKENT_E004', `Invalid memory limit for kind '${kind}': '${limitStr}'. Expected docker memory string (e.g. '768m', '1536m', '1.5g').`);
      }
    }
    this.kindMemoryLimits = rawKindLimits;
    // F1-IMG-SPAWN (364-004): opt-in, default false — see probeProviderCliPresentInImage
    // doc comment for why this cannot be default-on yet (SpawnBackendFactory wiring
    // is out of this task's DISTINCT-FILE scope, and several existing docker-backend
    // test suites assert exactly one `docker run` call per spawn).
    this.verifyProviderCliInImage = opts?.verifyProviderCliInImage ?? false;
    // 593-001 F2c: opt-in catalog mount mask; default false keeps `docker run`
    // argv byte-identical (DEFAULT_PROMPT_CONFIG.catalog_mount_mask === false).
    this.catalogMountMask = opts?.catalogMountMask ?? false;
    this.codexCoreChannel = opts?.codexCoreChannel ?? false;
    this.codexSuppressProjectDoc = opts?.codexSuppressProjectDoc ?? false;
    this.crossVerifyRuntimeCommandRunner =
      opts?.crossVerifyRuntimeCommandRunner ?? runBoundedCrossVerifyRuntimeCommand;
    this.reachabilityProbeCommandRunner =
      opts?.reachabilityProbeCommandRunner ?? runBoundedReachabilityProbeCommand;
    this.platform = opts?.platform ?? process.platform;
    this.homeDir = opts?.homeDir ?? homedir();
    this.custodyStateDir = opts?.custodyStateDir;
    this.exactWorkspaceCommandRunner =
      opts?.exactWorkspaceCommandRunner ?? runExactDockerWorkspaceCommand;
  }

  async prepareExactDockerCustody(
    input: PrepareExactDockerCustodyInputV2,
  ): Promise<PreparedExactDockerCustodyV2> {
    const trustedInput = parseExactDockerCustodyPrepareInput(input);
    const record = trustedInput ? exactOwnDataRecord(trustedInput, [
      'dispatchRequestId', 'projectId', 'taskId',
      'approvedTaskMaterial', 'approvedTaskMaterialDigest',
      'dispatchTaskMaterial', 'dispatchTaskMaterialDigest',
      'lineageMaterial', 'lineageMaterialDigest',
      'prompt', 'promptDeliveryAuthority', 'systemPromptCore', 'model', 'execution', 'predecessor',
    ]) : null;
    if (!record
      || typeof record.dispatchRequestId !== 'string'
      || typeof record.projectId !== 'string'
      || typeof record.taskId !== 'string'
      || typeof record.prompt !== 'string'
      || (record.systemPromptCore !== null && typeof record.systemPromptCore !== 'string')
      || typeof record.model !== 'string'
      || !isExactDigest(record.approvedTaskMaterialDigest)
      || !isExactDigest(record.dispatchTaskMaterialDigest)
      || !isExactDigest(record.lineageMaterialDigest)
      || exactCustodyJsonDigest(record.approvedTaskMaterial) !== record.approvedTaskMaterialDigest
      || exactCustodyJsonDigest(record.dispatchTaskMaterial) !== record.dispatchTaskMaterialDigest
      || exactCustodyJsonDigest(record.lineageMaterial) !== record.lineageMaterialDigest
      || !parseExactDockerPromptDeliveryAuthority(
        record.promptDeliveryAuthority,
        record.prompt as string,
        record.dispatchTaskMaterial as Task,
      )
    ) throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
    if (record.projectId !== attendedExecutionProjectId(this.projectDir)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
    }

    const execution = exactOwnDataRecord(record.execution, [
      'allowedTools', 'availableTools', 'authMode', 'isolatedContext',
      'reasoningEffort', 'excludeDynamicPromptSections', 'taskTimeoutSeconds',
      'actionId', 'executionBudget', 'executionLandingPolicy',
      'executionAdmissionMode', 'executionApprovalEvidenceRef',
      'finalOnlyUsageContainment',
    ]);
    if (!execution
      || (execution.allowedTools !== null && typeof execution.allowedTools !== 'string')
      || (execution.availableTools !== null && typeof execution.availableTools !== 'string')
      || !['api', 'subscription'].includes(String(execution.authMode))
      || typeof execution.isolatedContext !== 'boolean'
      || (execution.reasoningEffort !== null && typeof execution.reasoningEffort !== 'string')
      || typeof execution.excludeDynamicPromptSections !== 'boolean'
      || !Number.isSafeInteger(execution.taskTimeoutSeconds)
      || (execution.taskTimeoutSeconds as number) <= 0
      || (execution.actionId !== null && typeof execution.actionId !== 'string')
      || (execution.executionBudget !== null
        && (!execution.executionBudget || typeof execution.executionBudget !== 'object'))
      || (execution.executionLandingPolicy !== null
        && !isExactDockerEffectLandingPolicyAdmitted(execution.executionLandingPolicy))
      || (execution.executionAdmissionMode !== null
        && typeof execution.executionAdmissionMode !== 'string')
      || (execution.executionApprovalEvidenceRef !== null
        && typeof execution.executionApprovalEvidenceRef !== 'string')
      || (execution.finalOnlyUsageContainment !== null
        && !exactOwnDataRecord(execution.finalOnlyUsageContainment, [
          'maxWallClockSeconds', 'profileRef', 'policyDigest',
        ]))
    ) throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);

    const task = record.dispatchTaskMaterial as Task;
    if (!task || typeof task !== 'object' || nodeTypes.isProxy(task)
      || !hasOnlyExactOwnKeys(task, EXACT_DOCKER_TASK_KEYS)
      || !hasExactAcceptedAuthorityTaskFields(task)
      || task.id !== record.taskId
      || !task.scope || !hasOnlyExactOwnKeys(task.scope, ['directories', 'filesRead', 'filesWrite'])
      || !Array.isArray(task.scope.directories)
      || !task.scope.directories.every(value => typeof value === 'string')
      || !Array.isArray(task.scope.filesRead)
      || !Array.isArray(task.scope.filesWrite)
      || !task.scope.filesRead.every(value => typeof value === 'string')
      || !task.scope.filesWrite.every(value => typeof value === 'string')
      || !hasOnlyExactOwnKeys(task.goNogo, [
        'goCriteria', 'noGoCriteria', 'techDebtAcceptable', 'items',
      ])) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', false);
    }
    const inputDigest = exactCustodyJsonDigest(record);
    const processReplay = this.exactCustodyPreparedByRequest.get(record.dispatchRequestId);
    if (processReplay) {
      if (processReplay.inputDigest !== inputDigest) {
        throw new ExactDockerCustodyFailure('EXACT_DOCKER_IDEMPOTENCY_REPLAY_MISMATCH', false);
      }
      return processReplay.prepared;
    }
    const model = record.model as ModelType;
    const modelDefinition = modelRegistry.get(model);
    const provider = modelDefinition?.provider;
    const providerSpec = provider ? getProviderCommandSpec(provider) : null;
    if (!modelDefinition || !provider || !providerSpec) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_PROVIDER_UNAVAILABLE', false);
    }
    const typedExecution = record.execution as PrepareExactDockerCustodyInputV2['execution'];
    const exactPrompt = typedExecution.executionLandingPolicy === null
      ? record.prompt
      : `${record.prompt}\n\n${buildExactExecutionLandingProposalPromptSegment(
          record.taskId,
          record.dispatchRequestId,
        )}`;
    const providerAuth = buildProviderAuthIsolation(
      this.homeDir,
      provider,
      providerSpec.oauthHomeDir ?? undefined,
      typedExecution.authMode === 'api',
    );
    if (provider === 'gemini' && typedExecution.authMode === 'subscription') {
      const selection = buildGeminiAuthSelectionBootstrap(this.homeDir);
      if (selection) providerAuth.bootstrapLines.push(...selection.bootstrapLines);
    }
    const invocation = buildExactDockerProviderInvocation(
      providerSpec,
      modelDefinition.apiId,
      {
        ...(typedExecution.allowedTools ? { allowedTools: typedExecution.allowedTools } : {}),
        ...(typedExecution.availableTools ? { availableTools: typedExecution.availableTools } : {}),
        isolatedContext: typedExecution.isolatedContext,
        ...(typedExecution.reasoningEffort ? { reasoningEffort: typedExecution.reasoningEffort } : {}),
        excludeDynamicPromptSections: typedExecution.excludeDynamicPromptSections,
        systemPromptCorePresent: record.systemPromptCore !== null,
        codexCoreChannel: this.codexCoreChannel,
        codexSuppressProjectDoc: this.codexSuppressProjectDoc,
      },
    );
    const providerInvocationDigest = exactCustodyJsonDigest(invocation);
    const releaseIntentToken = randomBytes(32);
    const releaseCommitToken = randomBytes(32);
    const providerStartToken = randomBytes(32);
    const executionCommitToken = randomBytes(32);
    const releaseIntentNonceSha256 = exactCustodyDigest(releaseIntentToken);
    const releaseCommitNonceSha256 = exactCustodyDigest(releaseCommitToken);
    const providerStartNonceSha256 = exactCustodyDigest(providerStartToken);
    const executionCommitNonceSha256 = exactCustodyDigest(executionCommitToken);
    const runnerSource = buildExactDockerRunnerSource({
      taskId: record.taskId,
      model,
      provider,
      invocation,
      timeoutSeconds: typedExecution.taskTimeoutSeconds,
      authBootstrapLines: providerAuth.bootstrapLines,
      authWritebackLines: providerAuth.writebackLines ?? [],
    });
    const canonicalProjectRoot = canonicalExactDockerProjectRoot(this.projectDir);
    const scopeBaseline = await captureScopeAttributionManifest(
      canonicalProjectRoot,
      record.dispatchRequestId,
      [...task.scope.filesWrite],
    );
    const taskSnapshot: ExactDockerDispatchSnapshotV2 = Object.freeze({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'exact-docker-dispatch-snapshot',
      dispatchRequestId: record.dispatchRequestId,
      projectId: record.projectId,
      taskId: record.taskId,
      material: Object.freeze({
        approved: record.approvedTaskMaterial,
        approvedSha256: record.approvedTaskMaterialDigest,
        dispatch: task,
        dispatchSha256: record.dispatchTaskMaterialDigest,
        lineage: record.lineageMaterial,
        lineageSha256: record.lineageMaterialDigest,
      }),
      dispatch: Object.freeze({
        model,
        provider,
        execution: typedExecution,
        prompt: exactPrompt,
        promptSha256: exactCustodyDigest(exactPrompt),
        promptDeliveryAuthority:
          record.promptDeliveryAuthority as ExactDockerPromptDeliveryAuthorityV2,
        systemPromptCore: record.systemPromptCore as string | null,
        systemPromptCoreSha256: record.systemPromptCore === null
          ? null : exactCustodyDigest(record.systemPromptCore as string),
        scopeBaseline,
        scopeBaselineSha256: exactCustodyDigest(scopeBaseline),
        runnerSource,
        runnerSourceSha256: exactCustodyDigest(runnerSource),
        providerInvocationDigest,
        releaseIntentNonceSha256,
        releaseCommitNonceSha256,
        providerStartNonceSha256,
        executionCommitNonceSha256,
      }),
    });
    let envelope!: ExactDockerCustodyDispatchEnvelopeV2;
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: mountInput => this.consumeExactDockerCustodyMount(envelope, mountInput),
    });
    const store = TaskAttemptCustodyStore.open({
      adapter,
      absoluteRoot: resolveExactDockerCustodyRoot(canonicalProjectRoot, {
        platform: this.platform,
        env: process.env,
        ...(this.custodyStateDir ? { stateDir: this.custodyStateDir } : {}),
      }),
      canonicalProjectRoot,
      projectId: record.projectId,
      create: true,
    });
    const policy = createExactDockerCustodyPolicy();
    let predecessor: TaskAttemptCustodyDispatchPredecessorRefV2 | null = null;
    if (record.predecessor !== null) {
      const predecessorRecord = exactOwnDataRecord(record.predecessor, [
        'dispatchRequestId', 'identity', 'admissionReceiptDigest', 'admissionRefDigest',
        'providerStartReceipt',
      ]);
      const predecessorStart = exactOwnDataRecord(
        predecessorRecord?.providerStartReceipt,
        ['ref', 'digest'],
      );
      if (!predecessorRecord || !predecessorStart
        || typeof predecessorRecord.dispatchRequestId !== 'string'
        || !isExactDigest(predecessorStart.ref)
        || !isExactDigest(predecessorStart.digest)) {
        throw new ExactDockerCustodyFailure('EXACT_DOCKER_PREDECESSOR_INVALID', false);
      }
      const prior = store.readDispatchAdmission({
        dispatchRequestId: predecessorRecord.dispatchRequestId,
        policy,
      });
      if (prior.state !== 'admitted'
        || canonicalJson(prior.ref.identity) !== canonicalJson(predecessorRecord.identity)
        || prior.ref.admissionReceiptDigest !== predecessorRecord.admissionReceiptDigest
        || prior.ref.refDigest !== predecessorRecord.admissionRefDigest) {
        throw new ExactDockerCustodyFailure('EXACT_DOCKER_PREDECESSOR_INVALID', false);
      }
      const priorStart = store.readDispatchObservation({
        admissionRef: prior.ref,
        policy,
        observationClass: 'PROVIDER_START',
        receiptDigest: predecessorStart.ref,
      });
      if (priorStart.receipt.evidenceDigest !== predecessorStart.digest) {
        throw new ExactDockerCustodyFailure('EXACT_DOCKER_PREDECESSOR_INVALID', false);
      }
      predecessor = Object.freeze({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-dispatch-predecessor-ref',
        identity: prior.ref.identity,
        admissionReceiptDigest: prior.ref.admissionReceiptDigest,
      });
    }
    const dispatchRequestMaterial = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-docker-dispatch-request',
      dispatchRequestId: record.dispatchRequestId,
      projectId: record.projectId,
      taskId: record.taskId,
      approvedTaskMaterialDigest: record.approvedTaskMaterialDigest,
      dispatchTaskMaterialDigest: record.dispatchTaskMaterialDigest,
      lineageMaterialDigest: record.lineageMaterialDigest,
      promptSha256: taskSnapshot.dispatch.promptSha256,
      promptDeliveryReceiptIdentity:
        taskSnapshot.dispatch.promptDeliveryAuthority.receiptIdentity,
      promptDeliveryAuthorityDigest:
        taskSnapshot.dispatch.promptDeliveryAuthority.authorityDigest,
      systemPromptCoreSha256: taskSnapshot.dispatch.systemPromptCoreSha256,
      model,
      provider,
      execution: typedExecution,
      providerInvocationDigest,
      predecessor,
    });
    const durableReplay = store.readDispatchAdmission({
      dispatchRequestId: record.dispatchRequestId,
      policy,
    });
    if (durableReplay.state !== 'absent') {
      if (durableReplay.state !== 'admitted') {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED', false,
        );
      }
      if (durableReplay.reservation.dispatchRequestMaterialDigest
        !== exactCustodyJsonDigest(dispatchRequestMaterial)) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_IDEMPOTENCY_REPLAY_MISMATCH', true,
        );
      }
      const durableSnapshotRead = store.readTaskSnapshot({
        identity: durableReplay.ref.identity,
        policy,
        admissionReceiptDigest: durableReplay.ref.admissionReceiptDigest,
      });
      const durableSnapshot = durableSnapshotRead
        ? parseExactDockerDispatchSnapshot(durableSnapshotRead.bytes)
        : null;
      if (!durableSnapshot
        || durableSnapshot.kind !== 'exact-docker-dispatch-snapshot'
        || durableSnapshot.dispatchRequestId !== record.dispatchRequestId
        || durableSnapshot.projectId !== record.projectId
        || durableSnapshot.taskId !== record.taskId
        || durableSnapshot.material.approvedSha256 !== record.approvedTaskMaterialDigest
        || durableSnapshot.material.dispatchSha256 !== record.dispatchTaskMaterialDigest
        || durableSnapshot.material.lineageSha256 !== record.lineageMaterialDigest
        || durableSnapshot.dispatch.promptSha256 !== exactCustodyDigest(exactPrompt)
        || canonicalJson(durableSnapshot.dispatch.promptDeliveryAuthority)
          !== canonicalJson(record.promptDeliveryAuthority)
        || durableSnapshot.dispatch.systemPromptCoreSha256 !== taskSnapshot.dispatch.systemPromptCoreSha256
        || durableSnapshot.dispatch.model !== model
        || durableSnapshot.dispatch.provider !== provider
        || canonicalJson(durableSnapshot.dispatch.execution) !== canonicalJson(typedExecution)) {
        throw new ExactDockerCustodyFailure('EXACT_DOCKER_IDEMPOTENCY_REPLAY_MISMATCH', true);
      }
      const durableAccess = store.openAttemptAccess({
        identity: durableReplay.ref.identity,
        policy,
        admissionReceiptDigest: durableReplay.ref.admissionReceiptDigest,
      });
      if (!durableAccess) {
        throw new ExactDockerCustodyFailure('EXACT_DOCKER_PRIVATE_ADMISSION_HOLD', true);
      }
      const authority = store.readDispatchAuthority({
        admissionRef: durableReplay.ref,
        policy,
      });
      if (authority.state === 'absent' || authority.state === 'transition-pending') {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED', true,
        );
      }
      envelope = Object.freeze(Object.create(null)) as ExactDockerCustodyDispatchEnvelopeV2;
      const replayScope: PreparedExactDockerCustodyScope = {
        store,
        policy,
        identity: durableReplay.ref.identity,
        admission: durableReplay.admission,
        admissionRef: durableReplay.ref,
        access: durableAccess,
        taskSnapshot: durableSnapshot,
        model: durableSnapshot.dispatch.model,
        provider: durableSnapshot.dispatch.provider,
        providerSpec,
        providerAuth,
        execution: durableSnapshot.dispatch.execution,
        state: authority.state === 'terminal' && authority.authority.state === 'RELEASED'
          ? 'RELEASED' : 'HOLD',
        launch: null,
        mountTransferReceipt: null,
      };
      this.exactCustodyScopes.set(envelope, replayScope);
      const prepared = Object.freeze({
        kind: 'exact-docker-custody-prepared' as const,
        dispatchEnvelope: envelope,
        admissionRef: Object.freeze({
          dispatchRequestId: durableReplay.ref.dispatchRequestId,
          dispatchRequestMaterialDigest: durableReplay.ref.dispatchRequestMaterialDigest,
          admissionRefDigest: durableReplay.ref.refDigest,
        }),
        preparationRef: this.exactPreparationProjection(replayScope),
      }) satisfies PreparedExactDockerCustodyV2;
      this.exactCustodyPreparedByRequest.set(record.dispatchRequestId, Object.freeze({
        inputDigest,
        prepared,
      }));
      return prepared;
    }
    const admitted = store.reserveDispatchAdmission({
      dispatchRequestId: record.dispatchRequestId,
      dispatchRequestMaterial,
      taskId: record.taskId,
      taskSnapshot,
      policy,
      reservedAt: new Date().toISOString(),
      predecessor,
    });
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    const verifiedSnapshot = store.readTaskSnapshot({
      identity: admitted.ref.identity,
      policy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    const trustedTaskSnapshot = verifiedSnapshot
      ? parseExactDockerDispatchSnapshot(verifiedSnapshot.bytes)
      : null;
    if (!access || !verifiedSnapshot || !trustedTaskSnapshot
      || canonicalJson(trustedTaskSnapshot) !== canonicalJson(taskSnapshot)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_PRIVATE_ADMISSION_HOLD', true);
    }
    envelope = Object.freeze(Object.create(null)) as ExactDockerCustodyDispatchEnvelopeV2;
    this.exactCustodyTokens.set(envelope, Object.freeze({
      releaseIntent: Uint8Array.from(releaseIntentToken),
      releaseCommit: Uint8Array.from(releaseCommitToken),
      providerStart: Uint8Array.from(providerStartToken),
      executionCommit: Uint8Array.from(executionCommitToken),
    }));
    const preparedScope: PreparedExactDockerCustodyScope = {
      store,
      policy,
      identity: admitted.ref.identity,
      admission: admitted.admission,
      admissionRef: admitted.ref,
      access,
      taskSnapshot: trustedTaskSnapshot,
      model: trustedTaskSnapshot.dispatch.model,
      provider: trustedTaskSnapshot.dispatch.provider,
      providerSpec,
      providerAuth,
      execution: trustedTaskSnapshot.dispatch.execution,
      state: 'PREPARED',
      launch: null,
      mountTransferReceipt: null,
    };
    this.exactCustodyScopes.set(envelope, preparedScope);
    const prepared = Object.freeze({
      kind: 'exact-docker-custody-prepared',
      dispatchEnvelope: envelope,
      admissionRef: Object.freeze({
        dispatchRequestId: admitted.ref.dispatchRequestId,
        dispatchRequestMaterialDigest: admitted.ref.dispatchRequestMaterialDigest,
        admissionRefDigest: admitted.ref.refDigest,
      }),
      preparationRef: this.exactPreparationProjection(preparedScope),
    }) satisfies PreparedExactDockerCustodyV2;
    this.exactCustodyPreparedByRequest.set(record.dispatchRequestId, Object.freeze({
      inputDigest,
      prepared,
    }));
    return prepared;
  }

  private async consumeExactDockerCustodyMount(
    envelope: object,
    input: TaskAttemptCustodyPosixMountConsumerInput,
  ): Promise<TaskAttemptCustodyPosixDockerMountObservation> {
    const scope = this.exactCustodyScopes.get(envelope);
    if (!scope || scope.state !== 'PREPARED' || !scope.launch) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED', true);
    }
    scope.state = 'MOUNT_CONSUMING';
    const launch = scope.launch;
    const labels = exactDockerCustodyAuthorityLabels(input, launch);
    const authorityLabelsDigest = exactCustodyJsonDigest(labels);
    const authorityLabels = Object.freeze({
      rootId: input.rootId,
      scopeDigest: input.scopeDigest,
      effectOpDigest: input.effectOpDigest,
      attemptId: input.attemptId,
      generation: input.generation,
    });
    const callbackLocalArgs = [
      ...launch.dockerBaseArgs,
      ...Object.entries(labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]),
      ...buildExactDockerCustodyMountArgs(
        input,
        launch.workspaceVolumeName,
        launch.dependencyVolumeName,
      ),
      '-e', `DECKENT_CUSTODY_ADMISSION_REF_DIGEST=${scope.admissionRef.refDigest}`,
      '-e', `DECKENT_CUSTODY_PID1_SHA256=${exactCustodyDigest(EXACT_DOCKER_PID1_SOURCE)}`,
      '-e', `DECKENT_CUSTODY_TASK_SNAPSHOT_SHA256=${scope.admission.taskSnapshot.sha256}`,
      '-e', `DECKENT_CUSTODY_LABELS_DIGEST=${authorityLabelsDigest}`,
      '--entrypoint', 'node',
      launch.image,
      '--input-type=module', '-e', EXACT_DOCKER_PID1_SOURCE,
    ];
    let started: ExactDockerWorkspaceCommandResultV1;
    try {
      started = await this.exactWorkspaceCommandRunner(Object.freeze({
        command: 'docker',
        args: Object.freeze(callbackLocalArgs),
        stdin: Buffer.alloc(0),
        timeoutMs: 30_000,
        stdoutCeiling: 1024,
        stderrCeiling: 64 * 1024,
      }));
    } catch {
      scope.state = 'HOLD';
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED', true);
    }
    const containerId = exactDockerWorkspaceCommandStdout(started).trim();
    if (!exactDockerWorkspaceCommandSucceeded(started) || !/^[a-f0-9]{64}$/u.test(containerId)) {
      scope.state = 'HOLD';
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED', true);
    }
    launch.spawnOutcome = Object.freeze({ containerId, imageDigest: null });
    const inspected = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['inspect', containerId]),
      stdin: Buffer.alloc(0),
      timeoutMs: 10_000,
      stdoutCeiling: 8 * 1024 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    const daemon = exactDockerWorkspaceCommandSucceeded(inspected)
      ? parseExactDockerCustodyInspect(exactDockerWorkspaceCommandStdout(inspected))
      : null;
    const labelsMatch = daemon !== null && Object.entries(labels).every(
      ([key, expected]) => daemon.labels[key] === expected,
    );
    if (
      !daemon
      || daemon.containerId !== containerId
      || !labelsMatch
      || daemon.workspaceMount.name !== launch.workspaceVolumeName
      || daemon.workspaceMount.destination !== CONTAINER_WORKSPACE
      || daemon.workspaceMount.type !== 'volume'
      || daemon.workspaceMount.rw !== true
      || daemon.mounts.filter(mount => mount.destination === CONTAINER_WORKSPACE).length !== 1
      || daemon.dependencyMount.name !== launch.dependencyVolumeName
      || daemon.dependencyMount.destination !== `${CONTAINER_WORKSPACE}/node_modules`
      || daemon.dependencyMount.type !== 'volume'
      || daemon.dependencyMount.rw !== false
      || daemon.mounts.filter(
        mount => mount.destination === `${CONTAINER_WORKSPACE}/node_modules`,
      ).length !== 1
      || daemon.mounts.some(mount => exactDockerMountAliasesCanonicalProject(
        mount,
        canonicalExactDockerProjectRoot(this.projectDir),
      ))
      || daemon.taskMount.source !== input.taskSnapshot.sourcePath
      || daemon.taskMount.destination !== EXACT_DOCKER_TASK_SNAPSHOT_PATH
      || daemon.taskMount.type !== 'bind'
      || daemon.taskMount.propagation !== 'rprivate'
      || daemon.taskMount.rw !== false
      || daemon.mounts.filter(
        mount => mount.destination === EXACT_DOCKER_TASK_SNAPSHOT_PATH,
      ).length !== 1
      || daemon.outputMount.source !== input.workerOutput.sourcePath
      || daemon.outputMount.destination !== EXACT_DOCKER_WORKER_OUTPUT_PATH
      || daemon.outputMount.type !== 'bind'
      || daemon.outputMount.propagation !== 'rprivate'
      || daemon.outputMount.rw !== true
      || daemon.mounts.filter(
        mount => mount.destination === EXACT_DOCKER_WORKER_OUTPUT_PATH,
      ).length !== 1
      || canonicalJson(daemon.entrypoint) !== canonicalJson(['node'])
      || canonicalJson(daemon.command)
        !== canonicalJson(['--input-type=module', '-e', EXACT_DOCKER_PID1_SOURCE])
    ) {
      scope.state = 'HOLD';
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED', true);
    }
    launch.spawnOutcome = Object.freeze({ containerId, imageDigest: daemon.imageDigest });
    const probed = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze([
        'exec', containerId, 'node', '--input-type=module', '-e', EXACT_DOCKER_NATIVE_PROBE_SOURCE,
      ]),
      stdin: Buffer.alloc(0),
      timeoutMs: 30_000,
      stdoutCeiling: 1024 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    const native = exactDockerWorkspaceCommandSucceeded(probed)
      ? parseExactDockerNativeProbe(exactDockerWorkspaceCommandStdout(probed))
      : null;
    if (!native
      || native.taskContentDigest !== scope.admission.taskSnapshot.sha256
      || native.bootstrap.rootSeparationEvidenceBits <= 0) {
      scope.state = 'HOLD';
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED', true);
    }
    const observation: TaskAttemptCustodyPosixDockerMountObservation = Object.freeze({
      schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      kind: 'task-attempt-custody-posix-docker-mount-observation',
      state: 'MOUNTED_GATED',
      backend: 'docker',
      containerId,
      imageDigest: daemon.imageDigest,
      authorityLabels,
      taskSnapshotMount: Object.freeze({
        sourcePath: input.taskSnapshot.sourcePath,
        targetPath: EXACT_DOCKER_TASK_SNAPSHOT_PATH,
        mountType: 'bind',
        propagation: 'rprivate',
        readOnly: true,
        access: 'READ_ONLY',
        identity: native.taskIdentity,
        contentDigest: native.taskContentDigest,
      }),
      workerOutputMount: Object.freeze({
        sourcePath: input.workerOutput.sourcePath,
        targetPath: EXACT_DOCKER_WORKER_OUTPUT_PATH,
        mountType: 'bind',
        propagation: 'rprivate',
        readOnly: false,
        access: 'READ_WRITE',
        identity: native.outputIdentity,
      }),
      bootstrap: native.bootstrap,
      daemon: Object.freeze({
        containerId,
        imageDigest: daemon.imageDigest,
        authorityLabels,
        taskSnapshotMount: Object.freeze({
          sourcePath: input.taskSnapshot.sourcePath,
          targetPath: EXACT_DOCKER_TASK_SNAPSHOT_PATH,
          mountType: 'bind',
          propagation: 'rprivate',
          readOnly: true,
        }),
        workerOutputMount: Object.freeze({
          sourcePath: input.workerOutput.sourcePath,
          targetPath: EXACT_DOCKER_WORKER_OUTPUT_PATH,
          mountType: 'bind',
          propagation: 'rprivate',
          readOnly: false,
        }),
      }),
    });
    // The callback-local observation carries adapter-required source identities.
    // Retained launch state deliberately contains only daemon-native IDs/digests.
    launch.authorityLabelsDigest = authorityLabelsDigest;
    scope.state = 'MOUNTED_GATED';
    return observation;
  }

  private exactAdmissionProjection(scope: PreparedExactDockerCustodyScope) {
    return Object.freeze({
      dispatchRequestId: scope.admissionRef.dispatchRequestId,
      dispatchRequestMaterialDigest: scope.admissionRef.dispatchRequestMaterialDigest,
      admissionRefDigest: scope.admissionRef.refDigest,
    });
  }

  private exactPreparationProjection(
    scope: PreparedExactDockerCustodyScope,
  ): ExactDockerCustodyPreparationRefV2 {
    return createExecutionLandingPreparationRefV2({
      dispatchRequestId: scope.admissionRef.dispatchRequestId,
      dispatchRequestMaterialDigest: scope.admissionRef.dispatchRequestMaterialDigest,
      privateIdentity: scope.identity,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      admissionRefDigest: scope.admissionRef.refDigest,
      admittedAt: scope.admission.admittedAt,
      policyDigest: scope.policy.policyDigest,
      taskSnapshotDigest: scope.admission.taskSnapshot.sha256,
      providerInvocationDigest: scope.taskSnapshot.dispatch.providerInvocationDigest,
    });
  }

  private exactCustodyProjection(
    scope: PreparedExactDockerCustodyScope,
  ): ExactDockerCustodyIdentityRefV2 {
    return Object.freeze({
      dispatchRequestId: scope.admissionRef.dispatchRequestId,
      identity: scope.identity,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      admissionRefDigest: scope.admissionRef.refDigest,
    });
  }

  private exactReleasedCustodyProjection(
    scope: PreparedExactDockerCustodyScope,
    providerStartReceipt: Readonly<{ ref: Sha256Digest; digest: Sha256Digest }>,
  ): ExactDockerCustodyRefV2 {
    return Object.freeze({
      ...this.exactCustodyProjection(scope),
      providerStartReceipt,
    });
  }

  private publishAndRereadExactObservation<T extends object>(
    scope: PreparedExactDockerCustodyScope,
    observationClass: TaskAttemptCustodyDispatchObservationClass,
    bundle: T,
    observedAt: string,
  ) {
    const roundTrip = strictRoundTrip(bundle);
    const receipt = scope.store.publishDispatchObservation({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass,
      observedAt,
      bytes: roundTrip.bytes,
    });
    const verified = scope.store.readDispatchObservation({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass,
      receiptDigest: receipt.receiptDigest,
    });
    if (verified.receipt.evidenceDigest !== receipt.evidenceDigest
      || Buffer.compare(Buffer.from(verified.bytes), Buffer.from(roundTrip.bytes)) !== 0
      || canonicalJson(JSON.parse(Buffer.from(verified.bytes).toString('utf8')))
        !== canonicalJson(roundTrip.value)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_REREAD_INVALID', true);
    }
    return Object.freeze({
      ...verified.receipt,
      bytes: Uint8Array.from(verified.bytes),
    });
  }

  private async deliverExactDockerExecutionCommit(
    scope: PreparedExactDockerCustodyScope,
    launch: ExactDockerCustodyLaunchContext,
    containerId: string,
    providerStartObservation: Readonly<{
      readonly receiptDigest: Sha256Digest;
      readonly evidenceDigest: Sha256Digest;
      readonly bytes: Uint8Array;
    }>,
    startBundle: ExactDockerProviderStartBundleV2,
  ): Promise<void> {
    // Re-read at the exact irreversible delivery boundary. The earlier
    // publish helper is not enough: no raw commit byte may cross into PID1 if
    // the Store receipt disappeared, drifted, or belongs to a sibling admission.
    const durable = scope.store.readDispatchObservation({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass: 'PROVIDER_START',
      receiptDigest: providerStartObservation.receiptDigest,
    });
    let durableBundle: unknown;
    try { durableBundle = JSON.parse(Buffer.from(durable.bytes).toString('utf8')) as unknown; }
    catch { durableBundle = null; }
    if (durable.receipt.receiptDigest !== providerStartObservation.receiptDigest
      || durable.receipt.evidenceDigest !== providerStartObservation.evidenceDigest
      || Buffer.compare(Buffer.from(durable.bytes), Buffer.from(providerStartObservation.bytes)) !== 0
      || !durableBundle
      || canonicalJson(durableBundle) !== canonicalJson(startBundle)
      || startBundle.admissionRefDigest !== scope.admissionRef.refDigest
      || startBundle.taskSnapshotSha256 !== scope.admission.taskSnapshot.sha256
      || startBundle.startAuthorizationDigest
        !== exactCustodyDigest(Buffer.from(canonicalJson({
          schemaVersion: 2,
          kind: 'exact-docker-provider-start-authorization',
          nonce: Buffer.from(launch.providerStartToken).toString('hex'),
          admissionRefDigest: startBundle.admissionRefDigest,
          taskSnapshotSha256: startBundle.taskSnapshotSha256,
          providerInvocationDigest: startBundle.providerInvocationDigest,
          authorityLabelsDigest: startBundle.authorityLabelsDigest,
          executionCommitNonceSha256: startBundle.executionCommitNonceSha256,
          providerExecutionAttemptId: startBundle.providerExecutionAttemptId,
          providerExecutionAttemptIdentityDigest:
            startBundle.providerExecutionAttemptIdentityDigest,
          dispatchReceiptDigest: startBundle.dispatchReceiptDigest,
          releaseReceiptRef: startBundle.releaseReceiptRef,
          releaseReceiptDigest: startBundle.releaseReceiptDigest,
          projectionFence: startBundle.projectionFence,
        }), 'utf8'))
      || !verifyExactDockerExecutionCommit(
        launch.executionCommitToken,
        startBundle.executionCommitNonceSha256,
      )) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_REREAD_INVALID', true);
    }
    const commit = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['exec', '-i', containerId, 'sh', '-c',
        `umask 077; cat > ${EXACT_DOCKER_EXECUTION_COMMIT_FILE}`]),
      stdin: Buffer.from(launch.executionCommitToken),
      timeoutMs: 10_000,
      stdoutCeiling: 64 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    if (!exactDockerWorkspaceCommandSucceeded(commit)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_EXECUTION_COMMIT_RECONCILIATION_REQUIRED', true,
      );
    }
  }

  private async observeExactDockerProviderExecution(
    scope: PreparedExactDockerCustodyScope,
    containerId: string,
    startBundle: ExactDockerProviderStartBundleV2,
    providerStartAckBytes: string,
  ): Promise<Readonly<{ ref: Sha256Digest; digest: Sha256Digest }>> {
    const executionAckRead = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker' as const,
      args: Object.freeze(['exec', containerId, 'sh', '-c',
        `i=0; while [ "$i" -lt 400 ]; do if [ -f ${EXACT_DOCKER_PROVIDER_EXECUTION_ACK_FILE} ]; then exec cat ${EXACT_DOCKER_PROVIDER_EXECUTION_ACK_FILE}; fi; i=$((i+1)); sleep 0.025; done; exit 79`]),
      stdin: Buffer.alloc(0),
      timeoutMs: 15_000,
      stdoutCeiling: 1024 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    const rawAckBytes = Buffer.from(exactDockerWorkspaceCommandStdout(executionAckRead), 'utf8');
    let ack: unknown = null;
    try { ack = JSON.parse(rawAckBytes.toString('utf8')) as unknown; } catch { ack = null; }
    const expected: ExactDockerProviderExecutionAckExpectationV2 = Object.freeze({
      admissionRefDigest: startBundle.admissionRefDigest,
      taskSnapshotSha256: startBundle.taskSnapshotSha256,
      providerInvocationDigest: startBundle.providerInvocationDigest,
      authorityLabelsDigest: startBundle.authorityLabelsDigest,
      executionCommitNonceSha256: startBundle.executionCommitNonceSha256,
      providerExecutionAttemptId: startBundle.providerExecutionAttemptId,
      providerExecutionAttemptIdentityDigest:
        startBundle.providerExecutionAttemptIdentityDigest,
      dispatchReceiptDigest: startBundle.dispatchReceiptDigest,
      releaseReceiptRef: startBundle.releaseReceiptRef,
      releaseReceiptDigest: startBundle.releaseReceiptDigest,
      projectionFence: startBundle.projectionFence,
      startAuthorizationDigest: startBundle.startAuthorizationDigest,
      providerStartAckBytesSha256: exactCustodyDigest(
        Buffer.from(providerStartAckBytes, 'utf8'),
      ),
    });
    if (!exactDockerWorkspaceCommandSucceeded(executionAckRead)
      || !verifyExactDockerProviderExecutionAck(ack, expected)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_PROVIDER_START_RECONCILIATION_REQUIRED', true,
      );
    }
    const observedAt = new Date().toISOString();
    const bundle: ExactDockerProviderExecutionBundleV2 = Object.freeze({
      ...(ack as ExactDockerProviderExecutionAckV2),
      containerId,
      providerExecutionAckBytesSha256: exactCustodyDigest(rawAckBytes),
      observedAt,
    });
    const observation = this.publishAndRereadExactObservation(
      scope, 'PROVIDER_EXECUTION', bundle, observedAt,
    );
    return Object.freeze({
      ref: observation.receiptDigest,
      digest: observation.evidenceDigest,
    });
  }

  private async settleExactNoEffect(
    scope: PreparedExactDockerCustodyScope,
    reasonCode: TaskAttemptCustodyNotDispatchedReasonCode,
    preMountCompensation: ExactDockerEffectPreparationCompensationRefV1 | null = null,
  ): Promise<ExactDockerCustodyDispatchOutcomeV2> {
    const containerName = `deckent-x-${scope.identity.attemptId.replace(/[^a-zA-Z0-9_.-]/gu, '').slice(-40)}`;
    const inspection = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['inspect', '--type', 'container', containerName]),
      stdin: Buffer.alloc(0),
      timeoutMs: 10_000,
      stdoutCeiling: 8 * 1024 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    const projectedInspection = exactDockerWorkspaceCommandObservation(inspection);
    const absent = isExactDockerContainerAbsent(projectedInspection, containerName);
    if (!absent) {
      return await this.recordExactAmbiguity(
        scope,
        'PRE_MOUNT_RECONCILIATION_REQUIRED',
        'NOT_ATTEMPTED',
      );
    }
    const observedAt = new Date().toISOString();
    const daemonProbe = Object.freeze({
      command: 'docker-inspect-exact-container',
      containerName,
      status: inspection.status,
      stdoutSha256: exactCustodyDigest(projectedInspection.stdout),
      stderrSha256: exactCustodyDigest(projectedInspection.stderr),
    });
    const providerProbe = Object.freeze({
      admissionRefDigest: scope.admissionRef.refDigest,
      mountState: 'ABSENT',
      providerReleaseState: 'ABSENT',
    });
    const daemonInspectionReceiptDigest = exactCustodyJsonDigest(daemonProbe);
    const providerReleaseProbeEvidenceDigest = exactCustodyJsonDigest(providerProbe);
    const backendProbeEvidenceDigest = exactCustodyJsonDigest({ daemonProbe, providerProbe });
    const containmentEvidenceDigest = exactCustodyJsonDigest({
      admissionRefDigest: scope.admissionRef.refDigest,
      containerName,
      daemonInspectionReceiptDigest,
      providerReleaseProbeEvidenceDigest,
      reasonCode,
      preMountCompensation,
    });
    const bundle: ExactDockerNoEffectBundleV2 = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-docker-no-effect',
      admissionRefDigest: scope.admissionRef.refDigest,
      reasonCode,
      containerName,
      daemonContainerState: 'ABSENT',
      providerReleaseState: 'ABSENT',
      daemonInspectionReceiptDigest,
      providerReleaseProbeEvidenceDigest,
      backendProbeEvidenceDigest,
      containmentEvidenceDigest,
      preMountCompensation,
      observedAt,
    });
    const observation = this.publishAndRereadExactObservation(
      scope, 'NO_EFFECT', bundle, observedAt,
    );
    const authority = scope.store.settleNotDispatched({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      reasonCode,
      noEffectObservation: {
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-no-effect-observation',
        daemonContainerState: 'ABSENT',
        providerReleaseState: 'ABSENT',
        daemonInspectionReceiptDigest,
        providerReleaseProbeEvidenceDigest,
        backendProbeEvidenceDigest,
        containmentEvidenceDigest,
        observationReceiptDigest: observation.receiptDigest,
        observationEvidenceDigest: observation.evidenceDigest,
        observedAt,
      },
    });
    scope.state = 'HOLD';
    return Object.freeze({
      kind: 'not-dispatched',
      admissionRef: this.exactAdmissionProjection(scope),
      custodyRef: this.exactCustodyProjection(scope),
      providerAttemptCount: 0,
      providerExecutionAttempt: null,
      reasonCode: authority.reasonCode,
      zeroWorkReceipt: Object.freeze({
        ref: authority.receiptDigest,
        digest: authority.noEffectEvidence.evidenceDigest,
      }),
      projectionFence: authority.projectionFence,
    });
  }

  private async recordExactAmbiguity(
    scope: PreparedExactDockerCustodyScope,
    reasonCode: TaskAttemptCustodyAmbiguousReasonCode,
    releaseState: ExactDockerReconciliationBundleV2['releaseState'],
  ): Promise<ExactDockerCustodyDispatchOutcomeV2> {
    const spawned = scope.launch?.spawnOutcome ?? null;
    const inspected = spawned
      ? await this.exactWorkspaceCommandRunner(Object.freeze({
        command: 'docker',
        args: Object.freeze(['inspect', spawned.containerId]),
        stdin: Buffer.alloc(0),
        timeoutMs: 10_000,
        stdoutCeiling: 8 * 1024 * 1024,
        stderrCeiling: 64 * 1024,
      }))
      : null;
    const projectedInspection = inspected
      ? exactDockerWorkspaceCommandObservation(inspected) : null;
    const daemon = inspected && exactDockerWorkspaceCommandSucceeded(inspected)
      ? parseExactDockerCustodyInspect(exactDockerWorkspaceCommandStdout(inspected)) : null;
    const containerState = daemon ? 'PRESENT' as const
      : projectedInspection && spawned
        && isExactDockerContainerAbsent(projectedInspection, spawned.containerId)
        ? 'ABSENT' as const : 'UNKNOWN' as const;
    const observedAt = new Date().toISOString();
    const backendProbeEvidenceDigest = exactCustodyJsonDigest({
      containerState,
      expectedContainerId: spawned?.containerId ?? null,
      status: inspected?.status ?? null,
      stdoutSha256: exactCustodyDigest(projectedInspection?.stdout ?? ''),
      stderrSha256: exactCustodyDigest(projectedInspection?.stderr ?? ''),
    });
    const containmentEvidenceDigest = exactCustodyJsonDigest({
      admissionRefDigest: scope.admissionRef.refDigest,
      containerState,
      containerId: daemon?.containerId ?? spawned?.containerId ?? null,
      releaseState,
      reasonCode,
    });
    const bundle: ExactDockerReconciliationBundleV2 = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-docker-reconciliation',
      admissionRefDigest: scope.admissionRef.refDigest,
      reasonCode,
      containerState,
      containerId: daemon?.containerId ?? spawned?.containerId ?? null,
      imageDigest: daemon?.imageDigest ?? spawned?.imageDigest ?? null,
      mountReceiptDigest: scope.mountTransferReceipt?.receiptDigest ?? null,
      releaseState,
      releaseNonceDigest: scope.launch?.releaseCommitTokenSha256 ?? null,
      providerInvocationDigest: scope.launch?.providerInvocationDigest ?? null,
      containmentEvidenceDigest,
      backendProbeEvidenceDigest,
      observedAt,
    });
    const observation = this.publishAndRereadExactObservation(
      scope, 'RECONCILIATION', bundle, observedAt,
    );
    const reconciliation = scope.store.recordAmbiguousDispatch({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      reasonCode,
      reconciliationEvidence: {
        containerState,
        containerId: bundle.containerId,
        imageDigest: bundle.imageDigest,
        mountReceiptDigest: bundle.mountReceiptDigest,
        releaseState,
        releaseNonceDigest: bundle.releaseNonceDigest,
        providerInvocationDigest: bundle.providerInvocationDigest,
        containmentEvidenceDigest,
        backendProbeEvidenceDigest,
        observationReceiptDigest: observation.receiptDigest,
        observationEvidenceDigest: observation.evidenceDigest,
        observedAt,
      },
    });
    scope.state = 'HOLD';
    return Object.freeze({
      kind: 'ambiguous',
      admissionRef: this.exactAdmissionProjection(scope),
      custodyRef: this.exactCustodyProjection(scope),
      reasonCode: reconciliation.reasonCode,
      reconciliationReceipt: Object.freeze({
        ref: reconciliation.reconciliationRef,
        digest: reconciliation.receiptDigest,
      }),
      projectionFence: reconciliation.reconciliationRef,
    });
  }

  private async compensateExactDockerEffectPreparation(
    scope: PreparedExactDockerCustodyScope,
    resources: Readonly<{
      readonly workspace: Readonly<{
        readonly name: string;
        readonly labels: Readonly<Record<string, string>>;
        readonly labelsDigest: Sha256Digest;
        readonly resourceInstanceDigest: Sha256Digest;
        readonly mountPlanDigest: Sha256Digest;
      }>;
      readonly dependency: Readonly<{
        readonly name: string;
        readonly labels: Readonly<Record<string, string>>;
        readonly labelsDigest: Sha256Digest;
        readonly resourceInstanceDigest: Sha256Digest;
        readonly mountPlanDigest: Sha256Digest;
      }>;
    }>,
    storeAdapter: ExecutionEffectStoreAdapterV1,
  ): Promise<ExactDockerEffectPreparationCompensationRefV1 | null> {
    try {
      const durableProgress = <T extends {
        readonly progress: { readonly progressDigest: string };
      }>(publication: T): T['progress'] | null => {
        const reread = storeAdapter.readLatestCompensationProgress();
        return reread && reread.progressDigest === publication.progress.progressDigest
          && canonicalJson(reread) === canonicalJson(publication.progress)
          ? publication.progress : null;
      };
      const observeVolume = async (
        expected: typeof resources.workspace,
        authorityDigest: Sha256Digest,
      ) => {
        const result = await this.exactWorkspaceCommandRunner(Object.freeze({
          command: 'docker' as const,
          args: Object.freeze(['volume', 'inspect', expected.name]),
          stdin: Buffer.alloc(0), timeoutMs: 10_000,
          stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
        }));
        const observedAt = new Date().toISOString();
        if (isExactDockerVolumeAbsent(
          exactDockerWorkspaceCommandObservation(result), expected.name,
        )) {
          return createExecutionEffectDockerVolumeObservationV1({
            state: 'ABSENT', authorityDigest, volumeName: expected.name,
            resourceInstanceDigest: expected.resourceInstanceDigest, observedAt,
          });
        }
        const volume = exactDockerWorkspaceCommandSucceeded(result)
          ? parseExactDockerWorkspaceVolumeInspect(exactDockerWorkspaceCommandStdout(result))
          : null;
        if (!volume || !verifyExactDockerWorkspaceVolumeInspect(volume, {
          name: expected.name,
          labels: expected.labels,
          canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
        })) return null;
        const identityDigest = exactDockerEffectVolumeIdentity(volume, expected);
        return createExecutionEffectDockerVolumeObservationV1({
          state: 'PRESENT', authorityDigest, volumeName: expected.name,
          driver: 'local', scope: 'local', labelsDigest: expected.labelsDigest,
          resourceInstanceDigest: expected.resourceInstanceDigest,
          mountPlanDigest: expected.mountPlanDigest,
          volumeIdentityDigest: identityDigest, daemonCreatedAt: volume.createdAt, observedAt,
        });
      };
      const cleanupVolume = async (
        resourceKind: 'workspace-volume' | 'dependency-volume',
        expected: typeof resources.workspace,
        resourceIdentityDigest: Sha256Digest | null,
        cleanupAuthorityDigest: Sha256Digest,
        deleteIntentDigest: Sha256Digest,
      ): Promise<Parameters<
        ExecutionEffectStoreAdapterV1['publishCleanupAbsence']
      >[0]['evidence'] | null> => {
        const before = await this.exactWorkspaceCommandRunner(Object.freeze({
          command: 'docker' as const,
          args: Object.freeze(['volume', 'inspect', expected.name]),
          stdin: Buffer.alloc(0), timeoutMs: 10_000,
          stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
        }));
        if (isExactDockerVolumeAbsent(
          exactDockerWorkspaceCommandObservation(before), expected.name,
        )) {
          return Object.freeze({
            disposition: 'RECONCILED_ABSENCE' as const,
            absence: createExecutionEffectDockerReconciledAbsenceReceiptV1({
              resourceKind, resourceName: expected.name, resourceIdentityDigest,
              cleanupAuthorityDigest, deleteIntentDigest,
              observedAt: new Date().toISOString(),
            }),
          });
        }
        const observed = exactDockerWorkspaceCommandSucceeded(before)
          ? parseExactDockerWorkspaceVolumeInspect(exactDockerWorkspaceCommandStdout(before))
          : null;
        if (!observed || !resourceIdentityDigest
          || !verifyExactDockerWorkspaceVolumeInspect(observed, {
            name: expected.name,
            labels: expected.labels,
            canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
          }) || exactDockerEffectVolumeIdentity(observed, expected) !== resourceIdentityDigest) {
          return null;
        }
        const deleted = await this.exactWorkspaceCommandRunner(Object.freeze({
          command: 'docker' as const,
          args: Object.freeze(['volume', 'rm', expected.name]),
          stdin: Buffer.alloc(0), timeoutMs: 30_000,
          stdoutCeiling: 1024, stderrCeiling: 64 * 1024,
        }));
        if (!exactDockerWorkspaceCommandSucceeded(deleted)
          || exactDockerWorkspaceCommandStdout(deleted).trim() !== expected.name) return null;
        const deletion = createExecutionEffectDockerResourceDeletionReceiptV1({
          resourceKind, resourceName: expected.name, resourceIdentityDigest,
          cleanupAuthorityDigest, deleteIntentDigest, deletedAt: new Date().toISOString(),
        });
        const after = await this.exactWorkspaceCommandRunner(Object.freeze({
          command: 'docker' as const,
          args: Object.freeze(['volume', 'inspect', expected.name]),
          stdin: Buffer.alloc(0), timeoutMs: 10_000,
          stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
        }));
        if (!isExactDockerVolumeAbsent(
          exactDockerWorkspaceCommandObservation(after), expected.name,
        )) return null;
        const absence = createExecutionEffectDockerResourceAbsenceReceiptV1({
          resourceKind, resourceName: expected.name, resourceIdentityDigest,
          deleteIntentDigest, deletionReceiptDigest: deletion.receiptDigest,
          observedAt: new Date().toISOString(),
        });
        return Object.freeze({ disposition: 'EXECUTED_DELETION' as const, deletion, absence });
      };
      let progress = storeAdapter.readLatestCompensationProgress();
      if (!progress) {
        const lifecycle = storeAdapter.readLatestLifecycleAuthority();
        if (!lifecycle || (lifecycle.state !== 'ALLOCATING' && lifecycle.state !== 'PREPARED'
          && lifecycle.state !== 'PROVIDER_START_AUTHORIZED')) {
          return null;
        }
        const observationAuthorityDigest = exactEffectDomainDigest(
          'execution-effect-docker-compensation-observation-authority-v1',
          {
            admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
            lifecycleAuthorityDigest: lifecycle.authorityDigest,
          },
        ) as Sha256Digest;
        const workspaceObservation = await observeVolume(
          resources.workspace, observationAuthorityDigest,
        );
        const dependencyObservation = await observeVolume(
          resources.dependency, observationAuthorityDigest,
        );
        if (!workspaceObservation || !dependencyObservation) return null;
        progress = durableProgress(storeAdapter.publishCompensationPrepared({
          lifecycleAuthorityDigest: lifecycle.authorityDigest as Sha256Digest,
          workspaceObservation,
          dependencyObservation,
          progressedAt: [workspaceObservation.observedAt, dependencyObservation.observedAt]
            .sort().at(-1)!,
        }));
      }
      for (;;) {
        if (!progress) return null;
        if (progress.state === 'COMPENSATED') break;
        if (progress.state === 'COMPENSATION_PREPARED'
          || progress.state === 'COMPENSATION_WORKSPACE_VOLUME_ABSENT') {
          progress = durableProgress(storeAdapter.publishCleanupDeleteIntent({
            mode: 'COMPENSATION',
            resourceKind: progress.state === 'COMPENSATION_PREPARED'
              ? 'workspace-volume' : 'dependency-volume',
            progressedAt: new Date().toISOString(),
          }));
          continue;
        }
        if (progress.state === 'COMPENSATION_DEPENDENCY_VOLUME_ABSENT') {
          progress = durableProgress(storeAdapter.publishCleanupTerminal({
            mode: 'COMPENSATION', progressedAt: new Date().toISOString(),
          }));
          continue;
        }
        if (!progress.deleteIntentDigest) return null;
        const target = progress.state === 'COMPENSATION_WORKSPACE_VOLUME_DELETE_INTENT'
          ? Object.freeze({ kind: 'workspace-volume' as const, expected: resources.workspace })
          : progress.state === 'COMPENSATION_DEPENDENCY_VOLUME_DELETE_INTENT'
            ? Object.freeze({ kind: 'dependency-volume' as const, expected: resources.dependency })
            : null;
        if (!target) return null;
        const resource = progress.resources.find(entry => entry.resourceKind === target.kind);
        if (!resource) return null;
        const evidence = await cleanupVolume(
          target.kind,
          target.expected,
          resource.resourceIdentityDigest,
          progress.lifecycleAuthorityDigest,
          progress.deleteIntentDigest,
        );
        if (!evidence) return null;
        progress = durableProgress(storeAdapter.publishCleanupAbsence({
          mode: 'COMPENSATION', evidence, progressedAt: new Date().toISOString(),
        }));
      }
      const artifactKey = executionEffectStoreCleanupArtifactKeyV1(
        scope.admissionRef.admissionReceiptDigest,
        'COMPENSATION',
        'COMPENSATED',
      );
      const receipt = scope.store.readArtifactReceipt({
        identity: scope.identity,
        policy: scope.policy,
        artifactClass: 'execution-effect-lifecycle-authority',
        artifactKey,
      });
      if (!receipt) return null;
      const reread = scope.store.readVerifiedArtifact({
        identity: scope.identity,
        policy: scope.policy,
        artifactClass: 'execution-effect-lifecycle-authority',
        artifactKey,
        receiptDigest: receipt.receiptDigest,
      });
      if (!reread || reread.proof.sha256 !== receipt.artifact.sha256
        || canonicalJson(JSON.parse(Buffer.from(reread.bytes).toString('utf8')))
          !== canonicalJson(progress)) return null;
      return Object.freeze({
        artifactKey,
        artifactReceiptDigest: receipt.receiptDigest,
        evidenceDigest: reread.proof.sha256,
      });
    } catch (error) {
      debugLog('docker-backend:exact-effect-preparation-compensation-hold', error);
      return null;
    }
  }

  async dispatchExactDockerCustody(
    envelope: ExactDockerCustodyDispatchEnvelopeV2,
  ): Promise<ExactDockerCustodyDispatchOutcomeV2> {
    const scope = this.exactCustodyScopes.get(envelope);
    if (!scope) throw new ExactDockerCustodyFailure('EXACT_DOCKER_ENVELOPE_INVALID', false);
    const preparedCache = this.exactCustodyPreparedByRequest.get(
      scope.admissionRef.dispatchRequestId,
    );
    if (preparedCache?.prepared.dispatchEnvelope === envelope) {
      // Dispatch consumes the only process-local replay shortcut. Durable Store
      // admission remains the authority for every later/restart query.
      this.exactCustodyPreparedByRequest.delete(scope.admissionRef.dispatchRequestId);
    }
    const existing = scope.store.readDispatchAuthority({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
    });
    if (existing.state === 'terminal') {
      const authority = existing.authority;
      if (authority.state === 'NOT_DISPATCHED') {
        return Object.freeze({
          kind: 'not-dispatched',
          admissionRef: this.exactAdmissionProjection(scope),
          custodyRef: this.exactCustodyProjection(scope),
          providerAttemptCount: 0,
          providerExecutionAttempt: null,
          reasonCode: authority.reasonCode,
          zeroWorkReceipt: Object.freeze({
            ref: authority.receiptDigest,
            digest: authority.noEffectEvidence.evidenceDigest,
          }),
          projectionFence: authority.projectionFence,
        });
      }
      const providerStartReceipt = this.exactCustodyProviderStarts.get(
        scope.admissionRef.refDigest,
      );
      const providerExecutionReceipt = this.exactCustodyProviderExecutions.get(
        scope.admissionRef.refDigest,
      );
      const completionEntry = this.exactCustodyCompletions.get(
        scope.admissionRef.refDigest,
      );
      const completionScopeMatches = completionEntry
        && completionEntry.scope.admissionRef.refDigest === scope.admissionRef.refDigest
        && completionEntry.scope.admissionRef.dispatchRequestId
          === scope.admissionRef.dispatchRequestId
        && completionEntry.scope.admissionRef.admissionReceiptDigest
          === scope.admissionRef.admissionReceiptDigest
        && completionEntry.scope.policy.policyDigest === scope.policy.policyDigest
        && canonicalJson(completionEntry.scope.identity) === canonicalJson(scope.identity)
        && completionEntry.scope.admission.taskSnapshot.sha256
          === scope.admission.taskSnapshot.sha256;
      if (!providerStartReceipt || !providerExecutionReceipt
        || !completionEntry || !completionScopeMatches) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED', true,
        );
      }
      const providerStart = scope.store.readDispatchObservation({
        admissionRef: scope.admissionRef,
        policy: scope.policy,
        observationClass: 'PROVIDER_START',
        receiptDigest: providerStartReceipt.ref,
      });
      if (providerStart.receipt.evidenceDigest !== providerStartReceipt.digest) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_PROVIDER_START_RECONCILIATION_REQUIRED', true,
        );
      }
      const providerExecution = scope.store.readDispatchObservation({
        admissionRef: scope.admissionRef,
        policy: scope.policy,
        observationClass: 'PROVIDER_EXECUTION',
        receiptDigest: providerExecutionReceipt.ref,
      });
      if (providerExecution.receipt.evidenceDigest !== providerExecutionReceipt.digest) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_PROVIDER_START_RECONCILIATION_REQUIRED', true,
        );
      }
      const replayQuery: ExactDockerCustodyTerminalQueryV2 = Object.freeze({
        custodyRef: this.exactReleasedCustodyProjection(scope, providerStartReceipt),
        releaseReceipt: Object.freeze({
          ref: authority.releaseReceiptDigest,
          digest: authority.releaseEvidenceDigest,
        }),
        providerStartReceipt,
        projectionFence: authority.projectionFence,
      });
      if (canonicalJson(completionEntry.query) !== canonicalJson(replayQuery)
        || canonicalJson(completionEntry.providerStartReceipt)
          !== canonicalJson(providerStartReceipt)
        || canonicalJson(completionEntry.providerExecutionReceipt)
          !== canonicalJson(providerExecutionReceipt)) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED', true,
        );
      }
      return Object.freeze({
        kind: 'released',
        settlementRef: createTaskResultSettlementRefForAttempt(
          this.projectDir,
          scope.identity.taskId,
          authority.providerExecutionAttempt.providerExecutionAttemptId,
        ),
        admissionRef: this.exactAdmissionProjection(scope),
        preparationRef: this.exactPreparationProjection(scope),
        custodyRef: replayQuery.custodyRef,
        providerExecutionAttempt: authority.providerExecutionAttempt,
        backendExecutionId: authority.backendExecutionId,
        mountReceiptDigest: authority.mountReceiptDigest,
        dispatchReceipt: Object.freeze({ ref: authority.receiptDigest, digest: authority.receiptDigest }),
        releaseReceipt: replayQuery.releaseReceipt,
        providerStartReceipt,
        projectionFence: authority.projectionFence,
        releasedAt: authority.releaseEvidence.releasedAt,
        providerStartAcceptedAt: providerStart.receipt.observedAt,
      });
    }
    if (existing.state === 'ambiguous') {
      return Object.freeze({
        kind: 'ambiguous',
        admissionRef: this.exactAdmissionProjection(scope),
        custodyRef: this.exactCustodyProjection(scope),
        reasonCode: existing.reconciliation.reasonCode,
        reconciliationReceipt: Object.freeze({
          ref: existing.reconciliation.reconciliationRef,
          digest: existing.reconciliation.receiptDigest,
        }),
        projectionFence: existing.reconciliation.reconciliationRef,
      });
    }
    if (existing.state === 'transition-pending') {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_RECONCILIATION_REQUIRED', true);
    }
    if (scope.state !== 'PREPARED') {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ENVELOPE_CONSUMED', true);
    }
    if (this.platform !== 'linux') return this.settleExactNoEffect(scope, 'PLATFORM_UNSUPPORTED');
    if (!isExactDockerEffectLandingPolicyAdmitted(scope.execution.executionLandingPolicy)) {
      return this.settleExactNoEffect(scope, 'EXECUTION_POLICY_REJECTED');
    }
    const providerSpec = scope.providerSpec;
    const providerAuth = scope.providerAuth;
    if (!providerSpec || !providerAuth) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    if (providerAuth.missingRequiredFiles.length > 0
      || (scope.execution.authMode === 'api'
        && !process.env[(BASE_PROVIDER_CREDENTIAL_ENV as Record<string, string | undefined>)[scope.provider] ?? ''])) {
      return this.settleExactNoEffect(scope, 'PROVIDER_AUTH_UNAVAILABLE');
    }
    const daemonPreflight = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['info', '--format', '{{.ServerVersion}}']),
      stdin: Buffer.alloc(0),
      timeoutMs: 10_000,
      stdoutCeiling: 64 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    if (!exactDockerWorkspaceCommandSucceeded(daemonPreflight)
      || exactDockerWorkspaceCommandStdout(daemonPreflight).trim().length === 0) {
      return this.settleExactNoEffect(scope, 'DAEMON_ABSENT');
    }
    const imageCheck = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['image', 'inspect', this.image]),
      stdin: Buffer.alloc(0),
      timeoutMs: 10_000,
      stdoutCeiling: 8 * 1024 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    if (!exactDockerWorkspaceCommandSucceeded(imageCheck)) {
      return this.settleExactNoEffect(scope, 'PROVIDER_UNAVAILABLE');
    }
    const effectImageAuthority = parseExactDockerEffectImageAuthority(
      exactDockerWorkspaceCommandStdout(imageCheck),
    );
    if (!effectImageAuthority) {
      return this.settleExactNoEffect(scope, 'PROVIDER_UNAVAILABLE');
    }

    const hostNativeAuthority = loadExecAuthorityNative();
    if (!hostNativeAuthority.available
      || !hostNativeAuthority.manifest.effectContract.available) {
      return this.settleExactNoEffect(scope, 'PROVIDER_UNAVAILABLE');
    }
    const nativeCapabilityDigest = exactEffectDomainDigest(
      'execution-effect-docker-image-native-capability-v1',
      hostNativeAuthority.manifest,
    );

    const workspaceInventory = await readExactDockerWorkspaceInventory(
      canonicalExactDockerProjectRoot(this.projectDir),
      this.exactWorkspaceCommandRunner,
    );
    if (!workspaceInventory) {
      return this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED');
    }

    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const containerHome = '/tmp/deckent-home';
    const containerName = `deckent-x-${scope.identity.attemptId.replace(/[^a-zA-Z0-9_.-]/gu, '').slice(-40)}`;
    const workspaceVolumeName = exactDockerWorkspaceVolumeName({
      identity: scope.identity,
      admissionRefDigest: scope.admissionRef.refDigest,
    });
    const dependencyVolumeName = exactDockerDependencyVolumeName({
      identity: scope.identity,
      admissionRefDigest: scope.admissionRef.refDigest,
    });
    const effectBaseLabels = Object.freeze({
      'io.deckent.execution-effect.managed': 'true',
      'io.deckent.execution-effect.project': scope.identity.projectRootSha256,
      'io.deckent.execution-effect.attempt': scope.identity.attemptId,
      'io.deckent.execution-effect.generation': String(scope.identity.generation),
      'io.deckent.execution-effect.admission': scope.admissionRef.refDigest,
    });
    const workspaceResourceInstanceNonce = randomBytes(32).toString('hex');
    const dependencyResourceInstanceNonce = randomBytes(32).toString('hex');
    let effectPlan: ExecutionEffectDockerWorkspacePlanV1;
    let effectPrepared: ExactDockerEffectPreparedV1;
    const captureLimits = Object.freeze({ ...EXECUTION_EFFECT_CAPTURE_HARD_LIMITS });
    const lifecyclePlatform = process.env.WSL_DISTRO_NAME
      ? 'wsl2-linux' as const : 'linux' as const;
    const effectLifecycleAdapter = createExactDockerEffectLifecycleAdapterV1({
      canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
      imageAuthority: effectImageAuthority,
      inventory: workspaceInventory,
      runner: this.exactWorkspaceCommandRunner,
      nowIso: () => new Date().toISOString(),
    });
    try {
      effectPlan = createExecutionEffectDockerWorkspacePlanV1({
        imageReference: effectImageAuthority.imageReference,
        imageDigest: effectImageAuthority.imageDigest,
        volumeName: workspaceVolumeName,
        baseLabels: effectBaseLabels,
        workspaceResourceInstanceNonce,
        dependencyResourceInstanceNonce,
        mountPlan: Object.freeze({
          type: 'volume' as const,
          providerTarget: '/workspace' as const,
          providerAccess: 'read-write' as const,
          helperTarget: '/workspace' as const,
          helperAccess: 'read-only' as const,
        }),
        dependencyPlan: Object.freeze({
          sourceAuthority: 'image-owned-read-only-volume' as const,
          imageSource: '/app/node_modules' as const,
          volumeName: dependencyVolumeName,
          populationTarget: '/dependencies' as const,
          providerTarget: '/workspace/node_modules' as const,
          providerAccess: 'read-only' as const,
          networkAccess: 'none' as const,
          manifestScope: 'excluded-mount-overlay' as const,
        }),
        inventoryPaths: workspaceInventory.paths,
      });
    } catch {
      return this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED');
    }
    const preparationResources = Object.freeze({
      workspace: Object.freeze({
        name: workspaceVolumeName,
        labels: effectPlan.workspaceLabels,
        labelsDigest: effectPlan.workspaceLabelsDigest as Sha256Digest,
        resourceInstanceDigest: effectPlan.workspaceResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: effectPlan.mountPlanDigest as Sha256Digest,
      }),
      dependency: Object.freeze({
        name: dependencyVolumeName,
        labels: effectPlan.dependencyLabels,
        labelsDigest: effectPlan.dependencyLabelsDigest as Sha256Digest,
        resourceInstanceDigest: effectPlan.dependencyResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: effectPlan.dependencyPlanDigest as Sha256Digest,
      }),
    });
    const lifecycleStoreAdapter = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: scope.store,
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      platform: lifecyclePlatform,
      now: () => new Date().toISOString(),
    });
    try {
      const allocation = allocateExecutionEffectDockerWorkspaceV1({
        platform: process.env.WSL_DISTRO_NAME ? 'wsl' : 'linux',
        attempt: Object.freeze({
          projectId: scope.identity.projectId,
          taskId: scope.identity.taskId,
          attemptId: scope.identity.attemptId,
          generation: scope.identity.generation,
        }),
        admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
        custodyPolicyDigest: scope.policy.policyDigest,
        admittedAt: scope.admission.admittedAt,
        filesWrite: scope.taskSnapshot.material.dispatch.scope.filesWrite,
        nativeCapabilityDigest,
        workspacePlan: effectPlan,
        captureLimits,
      });
      if (allocation.state !== 'ALLOCATING') {
        return this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED');
      }
      const allocatingPublication = lifecycleStoreAdapter.publishLifecycleAuthority(
        allocation.lifecycleAuthority,
      );
      const allocatingReread = lifecycleStoreAdapter.readLifecycleAuthority('ALLOCATING');
      if (!allocatingReread
        || allocatingReread.authorityDigest !== allocation.lifecycleAuthority.authorityDigest
        || allocatingPublication.authority.authorityDigest !== allocatingReread.authorityDigest) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED',
          true,
        );
      }
      const durableAllocation = authorizeDurableExecutionEffectDockerAllocationV1(
        allocation.session,
        lifecycleStoreAdapter,
      );
      if ('state' in durableAllocation && durableAllocation.state === 'HOLD') {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED',
          true,
        );
      }
      const nativeProbe = await this.exactWorkspaceCommandRunner(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze([
          'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
          '--security-opt', 'no-new-privileges',
          '--memory', '256m', '--memory-swap', '256m', '--pids-limit', '64',
          '--tmpfs', '/tmp:size=16m,mode=0700',
          effectImageAuthority.imageReference,
          'node', '--input-type=module', '-e', EXACT_DOCKER_EFFECT_NATIVE_PROBE_HELPER,
        ]),
        stdin: Buffer.alloc(0), timeoutMs: 30_000,
        stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      let nativeProbeRecord: Record<string, unknown> | null = null;
      try {
        nativeProbeRecord = exactOwnDataRecord(
          JSON.parse(exactDockerWorkspaceCommandStdout(nativeProbe)),
          ['manifest'],
        );
      } catch { nativeProbeRecord = null; }
      if (!exactDockerWorkspaceCommandSucceeded(nativeProbe) || !nativeProbeRecord
        || !nativeProbeRecord.manifest || typeof nativeProbeRecord.manifest !== 'object'
        || !verifyExactDockerEffectNativeManifestParity(
          nativeProbeRecord.manifest,
          hostNativeAuthority.manifest,
        )) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_PROVIDER_UNAVAILABLE',
          true,
        );
      }
      const durableAllocationSession = durableAllocation as Parameters<
        typeof prepareAllocatedExecutionEffectDockerWorkspaceV1
      >[0];
      const preparedEffect = await prepareAllocatedExecutionEffectDockerWorkspaceV1(
        durableAllocationSession,
        effectLifecycleAdapter,
        Object.freeze({ nowIso: () => new Date().toISOString() }),
      );
      if (preparedEffect.state !== 'PREPARED') {
        const compensated = await this.compensateExactDockerEffectPreparation(
          scope,
          preparationResources,
          lifecycleStoreAdapter,
        );
        return compensated
          ? this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED', compensated)
          : this.recordExactAmbiguity(
              scope,
              'MOUNT_RECONCILIATION_REQUIRED',
              'NOT_ATTEMPTED',
            );
      }
      effectPrepared = preparedEffect;
      const preparedPublication = lifecycleStoreAdapter.publishLifecycleAuthority(
        preparedEffect.lifecycleAuthority,
      );
      const preparedReread = lifecycleStoreAdapter.readLifecycleAuthority('PREPARED');
      if (!preparedReread
        || preparedReread.authorityDigest !== preparedEffect.lifecycleAuthority.authorityDigest
        || preparedPublication.authority.authorityDigest !== preparedReread.authorityDigest) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED',
          true,
        );
      }
    } catch {
      const compensated = await this.compensateExactDockerEffectPreparation(
        scope,
        preparationResources,
        lifecycleStoreAdapter,
      );
      return compensated
        ? this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED', compensated)
        : this.recordExactAmbiguity(
            scope,
            'MOUNT_RECONCILIATION_REQUIRED',
            'NOT_ATTEMPTED',
          );
    }
    let effectStoreAdapter: ExecutionEffectStoreAdapterV1;
    let preparedWorkspaceAuthority: ExecutionEffectStorePreparedWorkspaceAuthorityV1;
    let effectStagingRoot: string;
    let effectClock: ExecutionEffectNativeAdapterClockV1;
    let effectLimits: ExecutionEffectNativeAdapterLimitsV1;
    let landingCapabilityDigest: Sha256Digest;
    try {
      const custodyRoot = resolveExactDockerCustodyRoot(this.projectDir, {
        platform: this.platform,
        env: process.env,
        ...(this.custodyStateDir ? { stateDir: this.custodyStateDir } : {}),
      });
      effectStagingRoot = join(
        custodyRoot,
        'execution-effect-staging',
        scope.identity.attemptId,
      );
      mkdirSync(effectStagingRoot, { recursive: true, mode: 0o700 });
      chmodSync(effectStagingRoot, 0o700);
      let clockMs = Date.now();
      effectClock = Object.freeze({
        nowIso(): string {
          clockMs = Date.now();
          return new Date(clockMs).toISOString();
        },
        nowUnixMs(): number { return clockMs; },
      });
      effectLimits = Object.freeze({
        maxStagedChunkBytes:
          scope.policy.artifactLimits['execution-effect-staged-content'].maxBytes,
        maxOperations: EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS,
        maxPlanEnvelopeBytes: EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES,
        sourceReadTimeoutMs: 60_000,
        dockerTimeoutMs: 60_000,
        dockerReceiptMaxBytes: 1024 * 1024,
      });
      const baselineRuntime: ExecutionEffectDockerWorkspaceRuntimeV1 = Object.freeze({
        version: 1,
        state: 'SEALED',
        imageReference: effectImageAuthority.imageReference,
        imageDigest: effectImageAuthority.imageDigest,
        volumeName: workspaceVolumeName,
        volumeNameDigest: effectPrepared.workspaceSnapshot.workspaceResource.volumeNameDigest,
        volumeIdentityDigest: effectPrepared.volumeCreationReceipt.volumeIdentityDigest,
        mountTarget: '/workspace',
        mountIdentityDigest: effectPlan.mountPlanDigest,
        workspaceResourceDigest: effectPrepared.workspaceSnapshot.workspaceResource.resourceDigest,
        workspaceSnapshotSealDigest: effectPrepared.workspaceSnapshot.sealDigest,
        manifestDigest: effectPrepared.baselineManifest.digest as ExecutionEffectPersistenceDigest,
      });
      const provisional = await createExecutionEffectLandingNativeAdapterV1(Object.freeze({
        platform: process.env.WSL_DISTRO_NAME ? 'wsl' as const : 'linux' as const,
        canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
        hostPrivateStagingRoot: effectStagingRoot,
        attempt: Object.freeze({
          projectId: scope.identity.projectId,
          taskId: scope.identity.taskId,
          attemptId: scope.identity.attemptId,
          generation: scope.identity.generation,
        }),
        identity: scope.identity,
        admission: scope.admission,
        policy: scope.policy,
        workspaceSnapshot: effectPrepared.workspaceSnapshot,
        workspaceRuntime: baselineRuntime,
        sourceAuthorities: Object.freeze([]),
        store: scope.store,
        clock: effectClock,
        limits: effectLimits,
      }));
      if (provisional.state !== 'READY') {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED',
          true,
        );
      }
      landingCapabilityDigest =
        provisional.adapter.capability.capabilityDigest as Sha256Digest;
      effectStoreAdapter = createExecutionEffectStoreAdapterV1({
        store: scope.store,
        identity: scope.identity,
        policy: scope.policy,
        admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
        projectRootIdentityDigest:
          provisional.adapter.capability.projectRootIdentityDigest as Sha256Digest,
        platform: effectPrepared.workspaceSnapshot.platform,
        now: () => new Date().toISOString(),
      });
      const lifecyclePrepared = effectStoreAdapter.readLifecycleAuthority('PREPARED');
      if (!lifecyclePrepared
        || lifecyclePrepared.authorityDigest
          !== effectPrepared.lifecycleAuthority.authorityDigest) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED',
          true,
        );
      }
      preparedWorkspaceAuthority = effectStoreAdapter.publishPreparedWorkspace({
        workspaceSnapshot: effectPrepared.workspaceSnapshot,
        baseline: effectPrepared.baselineManifest,
        baselineCapturedAt: effectPrepared.baselineManifest.captureAuthority.completedAt,
        lifecycleAuthority: lifecyclePrepared,
      });
      const durablePrepared = effectStoreAdapter.readPreparedWorkspace();
      if (!durablePrepared
        || canonicalJson(durablePrepared) !== canonicalJson(preparedWorkspaceAuthority)) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED',
          true,
        );
      }
    } catch {
      const compensated = await this.compensateExactDockerEffectPreparation(
        scope,
        preparationResources,
        lifecycleStoreAdapter,
      );
      return compensated
        ? this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED', compensated)
        : this.recordExactAmbiguity(
            scope,
            'MOUNT_RECONCILIATION_REQUIRED',
            'NOT_ATTEMPTED',
          );
    }
    const dockerBaseArgs: string[] = [
      'run', '-d', '--name', containerName,
      '--user', `${uid}:${gid}`,
      '-e', `HOME=${containerHome}`,
      '-e', `DECKENT_TASK_ID=${scope.identity.taskId}`,
      '-e', `DECKENT_PROJECT_ROOT=${CONTAINER_WORKSPACE}`,
      '-e', `DECKENT_AUTH_MODE=${scope.execution.authMode}`,
      '-e', `TASK_TIMEOUT=${scope.execution.taskTimeoutSeconds}`,
      '-e', WORKER_NODE_OPTIONS,
      '--memory', this.memoryLimit,
      '--memory-swap', this.memorySwap,
      '--tmpfs', `${containerHome}:size=${this.homeTmpfsSize},uid=${uid},gid=${gid}`,
      '--tmpfs', `/run/deckent:size=64m,uid=${uid},gid=${gid},mode=0700`,
      '--tmpfs', `${CONTAINER_WORKSPACE}/.locks:size=16m,uid=${uid},gid=${gid},mode=0700`,
      ...providerAuth.mountArgs,
      '-w', CONTAINER_WORKSPACE,
    ];
    if (existsSync(join(this.projectDir, DECK_FILE_NAME))) {
      dockerBaseArgs.push('--mount', `type=bind,src=/dev/null,dst=${CONTAINER_WORKSPACE}/${DECK_FILE_NAME},readonly`);
    }
    const credentialEnv = (BASE_PROVIDER_CREDENTIAL_ENV as Record<string, string | undefined>)[scope.provider];
    if (scope.execution.authMode === 'api' && credentialEnv && process.env[credentialEnv]) {
      dockerBaseArgs.push('-e', `${credentialEnv}=${process.env[credentialEnv]}`);
    }
    if (scope.taskSnapshot.dispatch.systemPromptCore !== null && providerSpec.binary === 'claude') {
      dockerBaseArgs.push('-e', 'CLAUDE_CODE_DISABLE_CLAUDE_MDS=1');
    }
    scope.launch = {
      taskId: scope.identity.taskId,
      image: effectImageAuthority.imageReference,
      dockerBaseArgs: Object.freeze(dockerBaseArgs),
      providerInvocationDigest: scope.taskSnapshot.dispatch.providerInvocationDigest,
      releaseIntentToken: randomBytes(0),
      releaseIntentTokenSha256: scope.taskSnapshot.dispatch.releaseIntentNonceSha256,
      releaseCommitToken: randomBytes(0),
      releaseCommitTokenSha256: scope.taskSnapshot.dispatch.releaseCommitNonceSha256,
      providerStartToken: randomBytes(0),
      providerStartTokenSha256: scope.taskSnapshot.dispatch.providerStartNonceSha256,
      executionCommitToken: randomBytes(0),
      executionCommitTokenSha256: scope.taskSnapshot.dispatch.executionCommitNonceSha256,
      expectedContainerName: containerName,
      workspaceVolumeName,
      dependencyVolumeName,
      workspaceInventory,
      effect: {
        imageAuthority: effectImageAuthority,
        captureLimits,
        lifecycleAdapter: effectLifecycleAdapter,
        prepared: effectPrepared,
        preparedWorkspace: preparedWorkspaceAuthority,
        storeAdapter: effectStoreAdapter,
        stagingRoot: effectStagingRoot,
        clock: effectClock,
        limits: effectLimits,
        landingCapabilityDigest,
        authorized: null,
        ready: null,
      },
      authorityLabelsDigest: null,
      spawnOutcome: null,
    };
    // Raw nonces are process-local only. Re-derive is impossible by design; the
    // prepare scope therefore retains them outside every durable/public value.
    const preparedTokens = this.exactCustodyTokens.get(envelope);
    if (!preparedTokens) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_RELEASE_AUTHORITY_MISSING', true);
    }
    scope.launch = { ...scope.launch,
      releaseIntentToken: preparedTokens.releaseIntent,
      releaseCommitToken: preparedTokens.releaseCommit,
      providerStartToken: preparedTokens.providerStart,
      executionCommitToken: preparedTokens.executionCommit,
    };
    const launch = scope.launch;
    let transfer: TaskAttemptCustodyBackendMountTransferReceipt;
    try {
      const authorizedEffect = await authorizeExecutionEffectDockerProviderStartV1(
        launch.effect.prepared.session!,
      );
      if (authorizedEffect.state !== 'PROVIDER_START_AUTHORIZED'
        || authorizedEffect.workspacePlan.volumeName !== launch.workspaceVolumeName
        || authorizedEffect.workspacePlan.dependencyPlan.volumeName
          !== launch.dependencyVolumeName) {
        const compensated = await this.compensateExactDockerEffectPreparation(
          scope,
          preparationResources,
          lifecycleStoreAdapter,
        );
        return compensated
          ? this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED', compensated)
          : this.recordExactAmbiguity(
              scope,
              'MOUNT_RECONCILIATION_REQUIRED',
              'NOT_ATTEMPTED',
            );
      }
      const providerPublication = launch.effect.storeAdapter.publishLifecycleAuthority(
        authorizedEffect.lifecycleAuthority,
      );
      const providerReread = launch.effect.storeAdapter.readLifecycleAuthority(
        'PROVIDER_START_AUTHORIZED',
      );
      if (!providerReread
        || providerReread.authorityDigest
          !== authorizedEffect.lifecycleAuthority.authorityDigest
        || providerPublication.authority.authorityDigest !== providerReread.authorityDigest) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_MOUNT_RECONCILIATION_REQUIRED',
          true,
        );
      }
      launch.effect.authorized = authorizedEffect;
      const lease = scope.store.issueAttemptMountLease({ access: scope.access, policy: scope.policy });
      transfer = await scope.store.consumeAttemptMountLease(lease);
      scope.mountTransferReceipt = transfer;
    } catch (error) {
      if (launch.spawnOutcome === null) {
        const compensated = await this.compensateExactDockerEffectPreparation(
          scope,
          preparationResources,
          lifecycleStoreAdapter,
        );
        if (compensated) {
          return this.settleExactNoEffect(scope, 'PRE_MOUNT_ABORTED', compensated);
        }
      }
      if (error instanceof TaskAttemptCustodyHold) {
        return this.recordExactAmbiguity(scope, 'MOUNT_RECONCILIATION_REQUIRED', 'NOT_ATTEMPTED');
      }
      throw error;
    }
    const spawned = launch.spawnOutcome;
    if (!spawned?.imageDigest
      || transfer.state !== 'CONSUMED'
      || transfer.backendExecutionId !== spawned.containerId
      || transfer.backendImageDigest !== spawned.imageDigest
      || !transfer.backendAuthorityLabelDigest
      || !transfer.backendBootstrapProbeEvidenceDigest) {
      return this.recordExactAmbiguity(scope, 'DAEMON_EFFECT_UNCONFIRMED', 'NOT_ATTEMPTED');
    }
    const releaseIntent = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['exec', '-i', spawned.containerId, 'sh', '-c',
        `umask 077; cat > ${EXACT_DOCKER_RELEASE_INTENT_FILE}`]),
      stdin: Buffer.from(launch.releaseIntentToken),
      timeoutMs: 10_000,
      stdoutCeiling: 64 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    if (!exactDockerWorkspaceCommandSucceeded(releaseIntent)) {
      return this.recordExactAmbiguity(scope, 'PROVIDER_RELEASE_UNCONFIRMED', 'UNCONFIRMED');
    }
    const gateRead = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['exec', spawned.containerId, 'sh', '-c',
        `i=0; while [ "$i" -lt 400 ]; do if [ -f ${EXACT_DOCKER_GATE_ACK_FILE} ]; then exec cat ${EXACT_DOCKER_GATE_ACK_FILE}; fi; i=$((i+1)); sleep 0.025; done; exit 79`]),
      stdin: Buffer.alloc(0),
      timeoutMs: 15_000,
      stdoutCeiling: 1024 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    let pid1Ack: Record<string, unknown> | null = null;
    try { pid1Ack = exactOwnDataRecord(JSON.parse(exactDockerWorkspaceCommandStdout(gateRead)), [
      'schemaVersion', 'kind', 'admissionRefDigest', 'releaseIntentNonceSha256',
      'releaseCommitNonceSha256', 'providerInvocationDigest', 'pid1Sha256',
      'taskSnapshotSha256', 'state', 'providerState',
    ]); } catch { pid1Ack = null; }
    if (!exactDockerWorkspaceCommandSucceeded(gateRead) || !pid1Ack
      || pid1Ack.schemaVersion !== 2 || pid1Ack.kind !== 'exact-docker-pid1-gate-ack'
      || pid1Ack.admissionRefDigest !== scope.admissionRef.refDigest
      || pid1Ack.releaseIntentNonceSha256 !== launch.releaseIntentTokenSha256
      || pid1Ack.releaseCommitNonceSha256 !== launch.releaseCommitTokenSha256
      || pid1Ack.providerInvocationDigest !== launch.providerInvocationDigest
      || pid1Ack.pid1Sha256 !== exactCustodyDigest(EXACT_DOCKER_PID1_SOURCE)
      || pid1Ack.taskSnapshotSha256 !== scope.admission.taskSnapshot.sha256
      || pid1Ack.state !== 'GATED_ACKNOWLEDGED' || pid1Ack.providerState !== 'NOT_STARTED') {
      return this.recordExactAmbiguity(scope, 'PROVIDER_RELEASE_UNCONFIRMED', 'UNCONFIRMED');
    }
    const preGateObservedAt = new Date().toISOString();
    const preGateAckDigest = exactCustodyJsonDigest(pid1Ack);
    const commit = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['exec', '-i', spawned.containerId, 'sh', '-c',
        `umask 077; cat > ${EXACT_DOCKER_RELEASE_COMMIT_FILE}`]),
      stdin: Buffer.from(launch.releaseCommitToken),
      timeoutMs: 10_000,
      stdoutCeiling: 64 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    const releaseArmedRead = exactDockerWorkspaceCommandSucceeded(commit)
      ? await this.exactWorkspaceCommandRunner(Object.freeze({
        command: 'docker',
        args: Object.freeze(['exec', spawned.containerId, 'sh', '-c',
          `i=0; while [ "$i" -lt 400 ]; do if [ -f ${EXACT_DOCKER_RELEASE_ARMED_ACK_FILE} ]; then exec cat ${EXACT_DOCKER_RELEASE_ARMED_ACK_FILE}; fi; i=$((i+1)); sleep 0.025; done; exit 79`]),
        stdin: Buffer.alloc(0),
        timeoutMs: 15_000,
        stdoutCeiling: 1024 * 1024,
        stderrCeiling: 64 * 1024,
      })) : null;
    let releaseArmedAck: Record<string, unknown> | null = null;
    try { releaseArmedAck = releaseArmedRead
      ? exactOwnDataRecord(JSON.parse(exactDockerWorkspaceCommandStdout(releaseArmedRead)), [
      'schemaVersion', 'kind', 'admissionRefDigest', 'providerInvocationDigest',
      'releaseCommitNonceSha256', 'state', 'providerState',
    ]) : null; } catch { releaseArmedAck = null; }
    if (!releaseArmedRead || !exactDockerWorkspaceCommandSucceeded(releaseArmedRead) || !releaseArmedAck
      || releaseArmedAck.schemaVersion !== 2
      || releaseArmedAck.kind !== 'exact-docker-pid1-release-armed-ack'
      || releaseArmedAck.admissionRefDigest !== scope.admissionRef.refDigest
      || releaseArmedAck.providerInvocationDigest !== launch.providerInvocationDigest
      || releaseArmedAck.releaseCommitNonceSha256 !== launch.releaseCommitTokenSha256
      || releaseArmedAck.state !== 'RELEASE_ARMED'
      || releaseArmedAck.providerState !== 'NOT_STARTED') {
      return this.recordExactAmbiguity(scope, 'PROVIDER_RELEASE_UNCONFIRMED', 'UNCONFIRMED');
    }
    const releaseArmedAt = new Date().toISOString();
    const releaseArmedAckDigest = exactCustodyJsonDigest(releaseArmedAck);
    const gateBundle: ExactDockerGateAckBundleV2 = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-docker-gate-ack',
      admissionRefDigest: scope.admissionRef.refDigest,
      containerId: spawned.containerId,
      imageDigest: spawned.imageDigest,
      mountTransferReceiptDigest: transfer.receiptDigest,
      mountTransferEvidenceDigest: transfer.transferEvidenceDigest,
      daemonAuthorityLabelDigest: transfer.backendAuthorityLabelDigest,
      releaseIntentNonceSha256: launch.releaseIntentTokenSha256,
      releaseCommitNonceSha256: launch.releaseCommitTokenSha256,
      providerInvocationDigest: launch.providerInvocationDigest,
      pid1Sha256: exactCustodyDigest(EXACT_DOCKER_PID1_SOURCE),
      taskSnapshotSha256: scope.admission.taskSnapshot.sha256,
      nativeBootstrapEvidenceDigest: transfer.backendBootstrapProbeEvidenceDigest,
      preGateAckDigest,
      releaseArmedAckDigest,
      providerState: 'NOT_STARTED',
      releaseState: 'ARMED',
      preGateObservedAt,
      releaseArmedAt,
      observedAt: releaseArmedAt,
    });
    const gateObservation = this.publishAndRereadExactObservation(
      scope, 'GATE_ACK', gateBundle, releaseArmedAt,
    );
    const releasedAt = new Date().toISOString();
    const authority = scope.store.settleReleasedDispatch({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      mountTransferReceipt: transfer,
      releaseEvidence: {
        containerId: spawned.containerId,
        imageDigest: spawned.imageDigest,
        mountReceiptDigest: transfer.receiptDigest,
        mountTransferEvidenceDigest: transfer.transferEvidenceDigest,
        daemonAuthorityLabelDigest: transfer.backendAuthorityLabelDigest,
        releaseNonceDigest: launch.releaseCommitTokenSha256,
        providerInvocationDigest: launch.providerInvocationDigest,
        gateAckReceiptDigest: gateObservation.receiptDigest,
        gateAckEvidenceDigest: gateObservation.evidenceDigest,
        releasedAt,
        ackMethod: 'HOST_RELEASE_GATE',
        ackStatus: 'ACKNOWLEDGED',
      },
      recordedAt: releasedAt,
    });
    scope.state = 'RELEASED';
    const reread = scope.store.readDispatchAuthority({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
    });
    if (reread.state !== 'terminal'
      || reread.authority.state !== 'RELEASED'
      || reread.authority.receiptDigest !== authority.receiptDigest
      || reread.authority.releaseReceiptDigest !== authority.releaseReceiptDigest
      || reread.authority.releaseEvidenceDigest !== authority.releaseEvidenceDigest
      || reread.authority.projectionFence !== authority.projectionFence
      || reread.authority.providerExecutionAttempt.identityDigest
        !== authority.providerExecutionAttempt.identityDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_RELEASE_REREAD_HOLD', true);
    }
    if (!launch.authorityLabelsDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_PROVIDER_START_GATE_UNCONFIRMED', true);
    }
    const startAuthorization = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-docker-provider-start-authorization',
      nonce: Buffer.from(launch.providerStartToken).toString('hex'),
      admissionRefDigest: scope.admissionRef.refDigest,
      taskSnapshotSha256: scope.admission.taskSnapshot.sha256,
      providerInvocationDigest: launch.providerInvocationDigest,
      authorityLabelsDigest: launch.authorityLabelsDigest,
      executionCommitNonceSha256: launch.executionCommitTokenSha256,
      providerExecutionAttemptId:
        authority.providerExecutionAttempt.providerExecutionAttemptId,
      providerExecutionAttemptIdentityDigest:
        authority.providerExecutionAttempt.identityDigest,
      dispatchReceiptDigest: authority.receiptDigest,
      releaseReceiptRef: authority.releaseReceiptDigest,
      releaseReceiptDigest: authority.releaseEvidenceDigest,
      projectionFence: authority.projectionFence,
    });
    const startAuthorizationBytes = Buffer.from(canonicalJson(startAuthorization), 'utf8');
    const startAuthorizationDigest = exactCustodyDigest(startAuthorizationBytes);
    const startWrite = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker',
      args: Object.freeze(['exec', '-i', spawned.containerId, 'sh', '-c',
        `umask 077; cat > ${EXACT_DOCKER_PROVIDER_START_FILE}`]),
      stdin: startAuthorizationBytes,
      timeoutMs: 10_000,
      stdoutCeiling: 64 * 1024,
      stderrCeiling: 64 * 1024,
    }));
    const startAckRead = exactDockerWorkspaceCommandSucceeded(startWrite)
      ? await this.exactWorkspaceCommandRunner(Object.freeze({
        command: 'docker',
        args: Object.freeze(['exec', spawned.containerId, 'sh', '-c',
          `i=0; while [ "$i" -lt 400 ]; do if [ -f ${EXACT_DOCKER_PROVIDER_START_ACK_FILE} ]; then exec cat ${EXACT_DOCKER_PROVIDER_START_ACK_FILE}; fi; i=$((i+1)); sleep 0.025; done; exit 79`]),
        stdin: Buffer.alloc(0),
        timeoutMs: 15_000,
        stdoutCeiling: 1024 * 1024,
        stderrCeiling: 64 * 1024,
      })) : null;
    let startAck: unknown = null;
    try { startAck = startAckRead
      ? JSON.parse(exactDockerWorkspaceCommandStdout(startAckRead)) as unknown
      : null; } catch { startAck = null; }
    const startAckExpected: ExactDockerProviderStartAckExpectationV2 = Object.freeze({
      admissionRefDigest: startAuthorization.admissionRefDigest,
      taskSnapshotSha256: startAuthorization.taskSnapshotSha256,
      providerInvocationDigest: startAuthorization.providerInvocationDigest,
      authorityLabelsDigest: startAuthorization.authorityLabelsDigest,
      providerStartNonceSha256: launch.providerStartTokenSha256,
      executionCommitNonceSha256: launch.executionCommitTokenSha256,
      providerExecutionAttemptId: startAuthorization.providerExecutionAttemptId,
      providerExecutionAttemptIdentityDigest:
        startAuthorization.providerExecutionAttemptIdentityDigest,
      dispatchReceiptDigest: startAuthorization.dispatchReceiptDigest,
      releaseReceiptRef: startAuthorization.releaseReceiptRef,
      releaseReceiptDigest: startAuthorization.releaseReceiptDigest,
      projectionFence: startAuthorization.projectionFence,
      startAuthorizationDigest,
    });
    if (!startAckRead || !exactDockerWorkspaceCommandSucceeded(startAckRead)
      || !verifyExactDockerProviderStartAck(startAck, startAckExpected)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_PROVIDER_START_GATE_UNCONFIRMED', true,
      );
    }
    const providerStartObservedAt = new Date().toISOString();
    const startBundle: ExactDockerProviderStartBundleV2 = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-docker-provider-start',
      admissionRefDigest: scope.admissionRef.refDigest,
      containerId: spawned.containerId,
      taskSnapshotSha256: scope.admission.taskSnapshot.sha256,
      providerInvocationDigest: launch.providerInvocationDigest,
      authorityLabelsDigest: launch.authorityLabelsDigest,
      providerStartNonceSha256: launch.providerStartTokenSha256,
      executionCommitNonceSha256: launch.executionCommitTokenSha256,
      providerExecutionAttemptId:
        authority.providerExecutionAttempt.providerExecutionAttemptId,
      providerExecutionAttemptIdentityDigest:
        authority.providerExecutionAttempt.identityDigest,
      dispatchReceiptDigest: authority.receiptDigest,
      releaseReceiptRef: authority.releaseReceiptDigest,
      releaseReceiptDigest: authority.releaseEvidenceDigest,
      projectionFence: authority.projectionFence,
      startAuthorizationDigest,
      pid1StartAckDigest: exactCustodyJsonDigest(startAck),
      state: 'START_AUTHORIZATION_ACCEPTED',
      providerState: 'NOT_STARTED',
      observedAt: providerStartObservedAt,
    });
    const providerStartObservation = this.publishAndRereadExactObservation(
      scope, 'PROVIDER_START', startBundle, providerStartObservedAt,
    );
    const startStored = exactOwnDataRecord(
      JSON.parse(Buffer.from(providerStartObservation.bytes).toString('utf8')),
      [
        'schemaVersion', 'kind', 'admissionRefDigest', 'containerId',
        'taskSnapshotSha256', 'providerInvocationDigest', 'authorityLabelsDigest',
        'providerStartNonceSha256', 'executionCommitNonceSha256',
        'providerExecutionAttemptId',
        'providerExecutionAttemptIdentityDigest', 'dispatchReceiptDigest',
        'releaseReceiptRef', 'releaseReceiptDigest', 'projectionFence',
        'startAuthorizationDigest', 'pid1StartAckDigest', 'state',
        'providerState', 'observedAt',
      ],
    );
    if (!startStored || canonicalJson(startStored) !== canonicalJson(startBundle)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_PROVIDER_START_GATE_UNCONFIRMED', true,
      );
    }
    await this.deliverExactDockerExecutionCommit(
      scope,
      launch,
      spawned.containerId,
      providerStartObservation,
      startBundle,
    );
    const providerExecutionReceipt = await this.observeExactDockerProviderExecution(
      scope,
      spawned.containerId,
      startBundle,
      exactDockerWorkspaceCommandStdout(startAckRead),
    );
    const providerStartReceipt = Object.freeze({
      ref: providerStartObservation.receiptDigest,
      digest: providerStartObservation.evidenceDigest,
    });
    this.exactCustodyTokens.delete(envelope);
    this.exactCustodyProviderStarts.set(scope.admissionRef.refDigest, providerStartReceipt);
    this.exactCustodyProviderExecutions.set(
      scope.admissionRef.refDigest, providerExecutionReceipt,
    );
    const terminalQuery = Object.freeze({
      custodyRef: this.exactReleasedCustodyProjection(scope, providerStartReceipt),
      releaseReceipt: Object.freeze({
        ref: authority.releaseReceiptDigest,
        digest: authority.releaseEvidenceDigest,
      }),
      providerStartReceipt,
      projectionFence: authority.projectionFence,
    });
    const completion = this.monitorExactDockerCustody(
      scope,
      spawned.containerId,
      terminalQuery,
      providerExecutionReceipt,
    );
    this.exactCustodyCompletions.set(scope.admissionRef.refDigest, Object.freeze({
      scope,
      query: terminalQuery,
      providerStartReceipt,
      providerExecutionReceipt,
      promise: completion,
    }));
    this.observeExactDockerCompletionAcceptance(scope, terminalQuery, completion);
    return Object.freeze({
      kind: 'released',
      settlementRef: createTaskResultSettlementRefForAttempt(
        this.projectDir, scope.identity.taskId,
        authority.providerExecutionAttempt.providerExecutionAttemptId,
      ),
      admissionRef: this.exactAdmissionProjection(scope),
      preparationRef: this.exactPreparationProjection(scope),
      custodyRef: this.exactReleasedCustodyProjection(scope, providerStartReceipt),
      providerExecutionAttempt: authority.providerExecutionAttempt,
      backendExecutionId: authority.backendExecutionId,
      mountReceiptDigest: authority.mountReceiptDigest,
      dispatchReceipt: Object.freeze({ ref: authority.receiptDigest, digest: authority.receiptDigest }),
      releaseReceipt: Object.freeze({
        ref: authority.releaseReceiptDigest,
        digest: authority.releaseEvidenceDigest,
      }),
      providerStartReceipt,
      projectionFence: authority.projectionFence,
      releasedAt: authority.releaseEvidence.releasedAt,
      providerStartAcceptedAt: providerStartObservation.observedAt,
    });
  }

  async awaitExactDockerCustodyTerminal(
    query: ExactDockerCustodyTerminalQueryV2,
  ): Promise<ExactDockerCustodyCompletionV2> {
    const observed = await this.awaitExactDockerCustodyTerminalInternal(query, false);
    const acceptance = this.exactCustodyAutomaticAcceptances.get(
      query.custodyRef.admissionRefDigest,
    );
    if (!acceptance || observed.kind === 'capture-hold') return observed;
    const accepted = await acceptance;
    if (accepted.kind === 'accepted-result') return observed;
    return Object.freeze({
      kind: 'capture-hold',
      custodyRef: observed.custodyRef,
      releaseReceipt: observed.releaseReceipt,
      projectionFence: observed.projectionFence,
      reasonCode: accepted.reasonCode === 'HOST_WORK_ATTRIBUTION_HOLD'
        ? 'HOST_WORK_ATTRIBUTION_HOLD'
        : 'EFFECT_PUBLICATION_HOLD',
      evidence: Object.freeze({
        kind: 'provider-exit-observation' as const,
        providerExit: observed.providerExit,
      }),
    });
  }

  async awaitExactDockerAcceptedResult(
    query: ExactDockerCustodyTerminalQueryV2,
  ): Promise<ExactDockerAcceptResultOutcomeV2> {
    const completion = await this.awaitExactDockerCustodyTerminal(query);
    if (completion.kind === 'capture-hold') {
      return Object.freeze({
        kind: 'capture-hold',
        reasonCode: completion.reasonCode,
        custodyRef: completion.custodyRef,
        releaseReceipt: completion.releaseReceipt,
        projectionFence: completion.projectionFence,
      });
    }
    const admissionRefDigest = query.custodyRef.admissionRefDigest;
    const cached = this.exactRecoveredAcceptedResults.get(admissionRefDigest);
    if (cached) {
      if (canonicalJson(cached.query) !== canonicalJson(query)) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH',
          true,
        );
      }
      return this.readExactDockerAcceptedResult(cached.accepted.reader);
    }
    const acceptance = this.exactCustodyAutomaticAcceptances.get(admissionRefDigest);
    if (!acceptance) {
      return Object.freeze({
        kind: 'capture-hold',
        reasonCode: 'EFFECT_PUBLICATION_HOLD',
        custodyRef: query.custodyRef,
        releaseReceipt: query.releaseReceipt,
        projectionFence: query.projectionFence,
      });
    }
    const accepted = await acceptance;
    return accepted.kind === 'accepted-result'
      ? this.readExactDockerAcceptedResult(accepted.reader)
      : accepted;
  }

  private async awaitExactDockerCustodyTerminalInternal(
    query: ExactDockerCustodyTerminalQueryV2,
    evictCompleted: boolean,
  ): Promise<ExactDockerCustodyCompletionV2> {
    const querySnapshot = snapshotExactPlainData(query);
    if (!querySnapshot.ok) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    query = querySnapshot.value as ExactDockerCustodyTerminalQueryV2;
    const queryRecord = exactOwnDataRecord(query, [
      'custodyRef', 'releaseReceipt', 'providerStartReceipt', 'projectionFence',
    ]);
    const custodyRecord = exactOwnDataRecord(queryRecord?.custodyRef, [
      'dispatchRequestId', 'identity', 'admissionReceiptDigest', 'admissionRefDigest',
      'providerStartReceipt',
    ]);
    const releaseRecord = exactOwnDataRecord(queryRecord?.releaseReceipt, ['ref', 'digest']);
    const providerStartRecord = exactOwnDataRecord(
      queryRecord?.providerStartReceipt,
      ['ref', 'digest'],
    );
    const custodyStartRecord = exactOwnDataRecord(
      custodyRecord?.providerStartReceipt,
      ['ref', 'digest'],
    );
    if (!queryRecord || !custodyRecord || !releaseRecord
      || !providerStartRecord || !custodyStartRecord
      || typeof custodyRecord.dispatchRequestId !== 'string'
      || !isExactDigest(custodyRecord.admissionReceiptDigest)
      || !isExactDigest(custodyRecord.admissionRefDigest)
      || !isExactDigest(releaseRecord.ref)
      || !isExactDigest(releaseRecord.digest)
      || !isExactDigest(providerStartRecord.ref)
      || !isExactDigest(providerStartRecord.digest)
      || canonicalJson(providerStartRecord) !== canonicalJson(custodyStartRecord)
      || !isExactDigest(queryRecord.projectionFence)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const entry = this.exactCustodyCompletions.get(custodyRecord.admissionRefDigest);
    if (!entry) {
      return Object.freeze({
        kind: 'capture-hold',
        custodyRef: query.custodyRef,
        releaseReceipt: query.releaseReceipt,
        projectionFence: query.projectionFence,
        reasonCode: 'LIVE_MONITOR_UNAVAILABLE',
        evidence: Object.freeze({
          kind: 'release-authority',
          receipt: query.releaseReceipt,
        }),
      });
    }
    if (canonicalJson(entry.query) !== canonicalJson(query)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const authorityRead = entry.scope.store.readDispatchAuthority({
      admissionRef: entry.scope.admissionRef,
      policy: entry.scope.policy,
    });
    if (authorityRead.state !== 'terminal'
      || authorityRead.authority.state !== 'RELEASED'
      || canonicalJson(authorityRead.authority.admissionRef.identity)
        !== canonicalJson(query.custodyRef.identity)
      || authorityRead.authority.admissionRef.admissionReceiptDigest
        !== query.custodyRef.admissionReceiptDigest
      || authorityRead.authority.admissionRef.refDigest
        !== query.custodyRef.admissionRefDigest
      || authorityRead.authority.admissionRef.dispatchRequestId
        !== query.custodyRef.dispatchRequestId
      || authorityRead.authority.releaseReceiptDigest !== query.releaseReceipt.ref
      || authorityRead.authority.releaseEvidenceDigest !== query.releaseReceipt.digest
      || authorityRead.authority.projectionFence !== query.projectionFence) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const providerStart = entry.scope.store.readDispatchObservation({
      admissionRef: entry.scope.admissionRef,
      policy: entry.scope.policy,
      observationClass: 'PROVIDER_START',
      receiptDigest: query.providerStartReceipt.ref,
    });
    if (providerStart.receipt.evidenceDigest !== query.providerStartReceipt.digest
      || canonicalJson(entry.providerStartReceipt)
        !== canonicalJson(query.providerStartReceipt)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const providerExecution = entry.scope.store.readDispatchObservation({
      admissionRef: entry.scope.admissionRef,
      policy: entry.scope.policy,
      observationClass: 'PROVIDER_EXECUTION',
      receiptDigest: entry.providerExecutionReceipt.ref,
    });
    if (providerExecution.receipt.evidenceDigest !== entry.providerExecutionReceipt.digest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const observed = await entry.promise;
    if (canonicalJson(observed.custodyRef) !== canonicalJson(query.custodyRef)
      || canonicalJson(observed.releaseReceipt) !== canonicalJson(query.releaseReceipt)
      || observed.projectionFence !== query.projectionFence) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    if (evictCompleted && observed.kind !== 'capture-hold') {
      const terminalReread = entry.scope.store.readDispatchAuthority({
        admissionRef: entry.scope.admissionRef,
        policy: entry.scope.policy,
      });
      const startReread = entry.scope.store.readDispatchObservation({
        admissionRef: entry.scope.admissionRef,
        policy: entry.scope.policy,
        observationClass: 'PROVIDER_START',
        receiptDigest: query.providerStartReceipt.ref,
      });
      if (terminalReread.state !== 'terminal'
        || terminalReread.authority.state !== 'RELEASED'
        || terminalReread.authority.admissionRef.refDigest
          !== query.custodyRef.admissionRefDigest
        || terminalReread.authority.projectionFence !== query.projectionFence
        || startReread.receipt.evidenceDigest !== query.providerStartReceipt.digest) {
        throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
      }
      this.exactCustodyCompletions.delete(query.custodyRef.admissionRefDigest);
      this.exactCustodyProviderStarts.delete(query.custodyRef.admissionRefDigest);
      this.exactCustodyProviderExecutions.delete(query.custodyRef.admissionRefDigest);
    }
    return observed;
  }

  async acceptExactDockerCustodyResult(
    input: AcceptExactDockerCustodyResultInputV2,
  ): Promise<ExactDockerAcceptResultOutcomeV2> {
    const snapshot = snapshotExactPlainData(input);
    const inputRecord = snapshot.ok
      ? exactOwnDataRecord(snapshot.value, ['query', 'authority']) : null;
    const queryRecord = exactOwnDataRecord(inputRecord?.query, [
      'custodyRef', 'releaseReceipt', 'providerStartReceipt', 'projectionFence',
    ]);
    const custodyRecord = exactOwnDataRecord(queryRecord?.custodyRef, [
      'dispatchRequestId', 'identity', 'admissionReceiptDigest', 'admissionRefDigest',
      'providerStartReceipt',
    ]);
    if (!inputRecord || !custodyRecord || !isExactDigest(custodyRecord.admissionRefDigest)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
    }
    const admissionRefDigest = custodyRecord.admissionRefDigest;
    const cached = this.exactRecoveredAcceptedResults.get(admissionRefDigest);
    if (cached) {
      if (canonicalJson(cached.query) !== canonicalJson(inputRecord.query)
        || canonicalJson(cached.authority) !== canonicalJson(inputRecord.authority)) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH',
          true,
        );
      }
      return cached.accepted;
    }
    const inFlight = this.exactCustodyAcceptanceSetups.get(admissionRefDigest);
    if (inFlight) return await inFlight;
    const acceptance = this.acceptExactDockerCustodyResultInternal(
      inputRecord as unknown as AcceptExactDockerCustodyResultInputV2,
    );
    this.exactCustodyAcceptanceSetups.set(admissionRefDigest, acceptance);
    try {
      const accepted = await acceptance;
      if (accepted.kind === 'accepted-result') {
        this.exactRecoveredAcceptedResults.set(admissionRefDigest, Object.freeze({
          query: inputRecord.query as ExactDockerCustodyTerminalQueryV2,
          authority: inputRecord.authority as CanonicalIngressAuthority,
          accepted,
        }));
      } else {
        this.clearExactDockerLiveAttempt(admissionRefDigest);
      }
      return accepted;
    } finally {
      if (this.exactCustodyAcceptanceSetups.get(admissionRefDigest) === acceptance) {
        this.exactCustodyAcceptanceSetups.delete(admissionRefDigest);
      }
    }
  }

  private async acceptExactDockerCustodyResultInternal(
    input: AcceptExactDockerCustodyResultInputV2,
  ): Promise<ExactDockerAcceptResultOutcomeV2> {
    const snapshot = snapshotExactPlainData(input);
    const inputRecord = snapshot.ok
      ? exactOwnDataRecord(snapshot.value, ['query', 'authority']) : null;
    const authority = inputRecord?.authority;
    const authorityKeys = [
      'taskId', 'workerId', 'provider', 'model', 'sprintId', 'promptCompilePlanId',
      'verificationCommands', 'isPriorityFix', 'fixForTaskId',
    ] as const;
    if (!inputRecord || !hasOnlyExactOwnKeys(authority, authorityKeys)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
    }
    const authorityRecord = authority as Record<string, unknown>;
    if (typeof authorityRecord.taskId !== 'string'
      || typeof authorityRecord.workerId !== 'string'
      || typeof authorityRecord.provider !== 'string'
      || typeof authorityRecord.model !== 'string'
      || (authorityRecord.sprintId !== undefined && typeof authorityRecord.sprintId !== 'string')
      || (authorityRecord.promptCompilePlanId !== undefined
        && typeof authorityRecord.promptCompilePlanId !== 'string')
      || (authorityRecord.verificationCommands !== undefined
        && (!Array.isArray(authorityRecord.verificationCommands)
          || !authorityRecord.verificationCommands.every(value => typeof value === 'string')))
      || (authorityRecord.isPriorityFix !== undefined
        && typeof authorityRecord.isPriorityFix !== 'boolean')
      || (authorityRecord.fixForTaskId !== undefined
        && authorityRecord.fixForTaskId !== null
        && typeof authorityRecord.fixForTaskId !== 'string')) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
    }
    const query = inputRecord.query as ExactDockerCustodyTerminalQueryV2;
    const completion = await this.awaitExactDockerCustodyTerminalInternal(query, false);
    if (completion.kind === 'capture-hold') {
      return Object.freeze({
        kind: 'capture-hold',
        reasonCode: completion.reasonCode,
        custodyRef: completion.custodyRef,
        releaseReceipt: completion.releaseReceipt,
        projectionFence: completion.projectionFence,
      });
    }
    const entry = this.exactCustodyCompletions.get(
      completion.custodyRef.admissionRefDigest,
    );
    if (!entry || entry.query.custodyRef.admissionRefDigest
      !== completion.custodyRef.admissionRefDigest
      ) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    this.rereadExactProviderExitObservation(entry.scope, completion.providerExit);
    const hostWorkAuthority = exactCanonicalHostWorkAuthority(
      completion.hostWorkAttribution,
      entry.scope,
      completion.providerExit,
    );
    if (!hostWorkAuthority) {
      return Object.freeze({
        kind: 'capture-hold',
        reasonCode: 'HOST_WORK_ATTRIBUTION_HOLD',
        custodyRef: completion.custodyRef,
        releaseReceipt: completion.releaseReceipt,
        projectionFence: completion.projectionFence,
      });
    }
    const hostWorkArtifactKey = `host-work-${entry.scope.identity.attemptId}`;
    const hostWorkReceipt = entry.scope.store.readArtifactReceipt({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'host-work-attribution',
      artifactKey: hostWorkArtifactKey,
    });
    const hostWorkArtifact = hostWorkReceipt ? entry.scope.store.readVerifiedArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'host-work-attribution',
      artifactKey: hostWorkArtifactKey,
      receiptDigest: hostWorkReceipt.receiptDigest,
    }) : null;
    const expectedHostWorkBytes = canonicalTaskAttemptCustodyJson(
      completion.hostWorkAttribution,
      entry.scope.policy.jsonBounds,
    );
    if (!hostWorkReceipt || !hostWorkArtifact
      || hostWorkReceipt.capturedAt !== completion.providerExit.observedAt
      || Buffer.compare(
        Buffer.from(hostWorkArtifact.bytes),
        Buffer.from(expectedHostWorkBytes),
      ) !== 0) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const hostWorkArtifactBinding = Object.freeze({
      artifactClass: 'host-work-attribution' as const,
      artifactKey: hostWorkReceipt.artifactKey,
      artifactReceiptDigest: hostWorkReceipt.receiptDigest,
      artifactSha256: hostWorkReceipt.artifact.sha256,
      byteLength: hostWorkReceipt.artifact.byteLength,
    });
    const durableAuthority = this.exactCanonicalIngressAuthority(entry.scope);
    if (canonicalJson(authorityRecord) !== canonicalJson(durableAuthority)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const hostPromptDeliveryAuthority = this.exactCanonicalHostPromptDeliveryAuthority(
      entry.scope,
      query,
    );
    const source = entry.scope.store.readVerifiedArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'worker-result',
      artifactKey: completion.resultArtifact.artifactKey,
      receiptDigest: completion.resultArtifact.receiptDigest,
    });
    if (!source
      || source.receipt.receiptDigest !== completion.result.sourceResult.artifactReceiptDigest
      || source.receipt.artifact.sha256 !== completion.result.sourceResult.artifactSha256
      || source.receipt.artifact.byteLength !== completion.result.sourceResult.byteLength
      || source.receipt.capturedAt !== completion.providerExit.observedAt
      || source.receipt.admissionReceiptDigest !== entry.scope.admissionRef.admissionReceiptDigest
      || source.receipt.policyDigest !== entry.scope.policy.policyDigest
      || canonicalJson(source.receipt.identity) !== canonicalJson(entry.scope.identity)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const providerStream = entry.scope.store.readVerifiedArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: completion.providerStream.artifactKey,
      receiptDigest: completion.providerStream.receiptDigest,
    });
    if (!providerStream
      || providerStream.receipt.receiptDigest
        !== completion.providerBilling.providerStreamReceiptDigest
      || providerStream.receipt.artifact.sha256 !== completion.providerStream.contentDigest
      || providerStream.receipt.artifact.sha256 !== exactCustodyDigest(providerStream.bytes)
      || providerStream.receipt.artifact.byteLength !== completion.providerStream.byteLength
      || providerStream.receipt.artifact.byteLength !== providerStream.bytes.byteLength
      || providerStream.receipt.capturedAt !== completion.providerStream.capturedAt
      || providerStream.receipt.admissionReceiptDigest
        !== entry.scope.admissionRef.admissionReceiptDigest
      || providerStream.receipt.policyDigest !== entry.scope.policy.policyDigest
      || canonicalJson(providerStream.receipt.identity) !== canonicalJson(entry.scope.identity)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const durableBilling = extractProviderBillingEvidence(
      entry.scope.provider,
      Buffer.from(providerStream.bytes).toString('utf8'),
      providerStream.receipt.capturedAt,
    );
    if (!durableBilling
      || exactCustodyJsonDigest(durableBilling) !== completion.providerBilling.evidenceDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(source.bytes).toString('utf8')) as unknown; }
    catch { decoded = null; }
    const ingressSnapshot = snapshotExactPlainData(decoded);
    if (!ingressSnapshot.ok || !ingressSnapshot.value
      || typeof ingressSnapshot.value !== 'object'
      || Array.isArray(ingressSnapshot.value)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
    }
    const scopeSet = new Set(normalizedScopeFiles(
      entry.scope.taskSnapshot.material.dispatch.scope.filesWrite,
    ));
    if (resultClaimedPaths(ingressSnapshot.value as Record<string, unknown>)
      .some(path => !scopeSet.has(path))) {
      return Object.freeze({
        kind: 'capture-hold',
        reasonCode: 'WORKER_SCOPE_CLAIM_HOLD',
        custodyRef: completion.custodyRef,
        releaseReceipt: completion.releaseReceipt,
        projectionFence: completion.projectionFence,
      });
    }
    const durableAttemptCustody = Object.freeze({
      version: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      identity: entry.scope.identity,
      policyDigest: entry.scope.policy.policyDigest,
      admissionReceiptDigest: entry.scope.admissionRef.admissionReceiptDigest,
      sourceResult: Object.freeze({
        artifactClass: 'worker-result' as const,
        artifactKey: source.receipt.artifactKey,
        artifactReceiptDigest: source.receipt.receiptDigest,
        artifactSha256: source.receipt.artifact.sha256,
        byteLength: source.receipt.artifact.byteLength,
      }),
    });
    if (canonicalJson(completion.result) !== canonicalJson(durableAttemptCustody)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    const result = assembleCanonicalIngressResultV2(
      ingressSnapshot.value as Record<string, unknown>,
      durableAuthority,
      Object.freeze({
        attemptCustody: durableAttemptCustody,
        hostWorkArtifact: hostWorkArtifactBinding,
        jsonBounds: entry.scope.policy.jsonBounds,
        hostTerminalBilling: Object.freeze({
          evidence: Object.freeze(durableBilling),
          evidenceDigest: completion.providerBilling.evidenceDigest,
          providerStreamReceiptDigest: completion.providerBilling.providerStreamReceiptDigest,
          billingMode: entry.scope.execution.authMode,
        }),
        hostWorkAuthority,
        hostPromptDeliveryAuthority,
        hostEffectAuthority: completion.hostEffectAuthority,
      }),
    );
    const acceptedBytes = canonicalTaskAttemptCustodyJson(result, entry.scope.policy.jsonBounds);
    const effectLanding = entry.scope.store.readVerifiedEffectLanding({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactKey: completion.hostEffectAuthority.binding.landingArtifactKey,
    });
    const effectLandingChain = entry.scope.store.readChain(
      entry.scope.identity,
      entry.scope.policy,
      'effect-landing',
    );
    if (!effectLanding || !effectLandingChain
      || effectLanding.landing.receiptDigest
        !== completion.hostEffectAuthority.binding.landingReceiptDigest
      || effectLandingChain.receiptDigest
        !== completion.hostEffectAuthority.binding.effectLandingChainDigest
      || effectLandingChain.artifactReceiptDigest
        !== completion.hostEffectAuthority.binding.landingArtifactReceiptDigest
      || effectLandingChain.occurredAt !== effectLanding.landing.releasedAt
      || Date.parse(effectLanding.landing.releasedAt) < Date.parse(source.receipt.capturedAt)
      || Date.parse(effectLanding.landing.releasedAt) < Date.parse(durableBilling.capturedAt)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_COMPLETION_IDENTITY_MISMATCH', true);
    }
    // The accepted stage follows effect-landing, so its deterministic time and
    // predecessor come from that durable stage—not the earlier provider EXIT.
    const capturedAt = effectLanding.landing.releasedAt;
    const acceptedArtifact = entry.scope.store.publishHostArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      admissionReceiptDigest: entry.scope.admissionRef.admissionReceiptDigest,
      artifactClass: 'canonical-accepted-result',
      artifactKey: `accepted-${entry.scope.identity.attemptId}`,
      capturedAt,
      bytes: acceptedBytes,
    });
    const acceptedChain = entry.scope.store.appendChain({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      admissionReceiptDigest: entry.scope.admissionRef.admissionReceiptDigest,
      stage: 'accepted-result',
      occurredAt: capturedAt,
      predecessorDigest: effectLandingChain.receiptDigest,
      artifactReceipt: acceptedArtifact,
    });
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(acceptedArtifact);
    const reader = Object.freeze(Object.create(null)) as ExactDockerAcceptedResultReaderV2;
    const resultDigest = taskResultV2Digest(result, entry.scope.policy.jsonBounds);
    const hostBillingAuthority = Object.freeze({
      evidenceDigest: completion.providerBilling.evidenceDigest,
      providerStreamReceiptDigest: completion.providerBilling.providerStreamReceiptDigest,
      acceptedResultArtifactReceiptDigest: acceptedResultRef.artifactReceiptDigest,
      acceptedResultChainDigest: acceptedChain.receiptDigest,
      bindingDigest: exactCustodyJsonDigest({
        evidenceDigest: completion.providerBilling.evidenceDigest,
        providerStreamReceiptDigest: completion.providerBilling.providerStreamReceiptDigest,
        acceptedResultArtifactReceiptDigest: acceptedResultRef.artifactReceiptDigest,
        acceptedResultChainDigest: acceptedChain.receiptDigest,
      }),
    });
    this.exactAcceptedResultReaders.set(reader, Object.freeze({
      scope: entry.scope,
      query: entry.query,
      acceptedResultRef,
      acceptedResultChainDigest: acceptedChain.receiptDigest,
      resultDigest,
      providerStream: completion.providerStream,
      providerExit: completion.providerExit,
      hostBillingAuthority,
      hostEffectAuthority: completion.hostEffectAuthority,
    }));
    const reread = this.readExactDockerAcceptedResult(reader);
    this.exactCustodyCompletions.delete(completion.custodyRef.admissionRefDigest);
    this.exactCustodyProviderStarts.delete(completion.custodyRef.admissionRefDigest);
    this.exactCustodyProviderExecutions.delete(completion.custodyRef.admissionRefDigest);
    return reread;
  }

  readExactDockerAcceptedResult(
    reader: ExactDockerAcceptedResultReaderV2,
  ): ExactDockerAcceptedResultV2 {
    if (!reader || typeof reader !== 'object' || nodeTypes.isProxy(reader)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    const entry = this.exactAcceptedResultReaders.get(reader);
    if (!entry) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    this.rereadExactProviderExitObservation(entry.scope, entry.providerExit);
    const hostPromptDeliveryAuthority = this.exactCanonicalHostPromptDeliveryAuthority(
      entry.scope,
      entry.query,
    );
    const terminal = entry.scope.store.readDispatchAuthority({
      admissionRef: entry.scope.admissionRef,
      policy: entry.scope.policy,
    });
    const artifact = entry.scope.store.readVerifiedArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'canonical-accepted-result',
      artifactKey: entry.acceptedResultRef.artifactKey,
      receiptDigest: entry.acceptedResultRef.artifactReceiptDigest,
    });
    const chain = entry.scope.store.readChain(
      entry.scope.identity,
      entry.scope.policy,
      'accepted-result',
    );
    const providerStream = entry.scope.store.readVerifiedArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: entry.providerStream.artifactKey,
      receiptDigest: entry.providerStream.receiptDigest,
    });
    const effectLanding = entry.scope.store.readVerifiedEffectLanding({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactKey: entry.hostEffectAuthority.binding.landingArtifactKey,
    });
    const effectLandingChain = entry.scope.store.readChain(
      entry.scope.identity,
      entry.scope.policy,
      'effect-landing',
    );
    if (terminal.state !== 'terminal' || terminal.authority.state !== 'RELEASED'
      || terminal.authority.admissionRef.refDigest !== entry.query.custodyRef.admissionRefDigest
      || terminal.authority.projectionFence !== entry.query.projectionFence
      || !artifact
      || artifact.receipt.receiptDigest !== entry.acceptedResultRef.artifactReceiptDigest
      || artifact.receipt.artifactClass !== 'canonical-accepted-result'
      || artifact.receipt.captureMode !== 'host-authority-publication'
      || artifact.receipt.artifactKey !== entry.acceptedResultRef.artifactKey
      || canonicalJson(artifact.receipt.identity) !== canonicalJson(entry.scope.identity)
      || artifact.receipt.admissionReceiptDigest
        !== entry.scope.admissionRef.admissionReceiptDigest
      || artifact.receipt.policyDigest !== entry.scope.policy.policyDigest
      || artifact.receipt.artifact.sha256 !== exactCustodyDigest(artifact.bytes)
      || artifact.receipt.artifact.byteLength !== artifact.bytes.byteLength
      || !chain
      || chain.receiptDigest !== entry.acceptedResultChainDigest
      || !effectLanding
      || !effectLandingChain
      || effectLanding.landing.receiptDigest
        !== entry.hostEffectAuthority.binding.landingReceiptDigest
      || effectLandingChain.receiptDigest
        !== entry.hostEffectAuthority.binding.effectLandingChainDigest
      || chain.predecessorDigest !== effectLandingChain.receiptDigest
      || chain.artifactReceiptDigest !== entry.acceptedResultRef.artifactReceiptDigest
      || chain.artifactKey !== entry.acceptedResultRef.artifactKey
      || chain.occurredAt !== artifact.receipt.capturedAt
      || artifact.receipt.capturedAt !== effectLanding.landing.releasedAt
      || !providerStream
      || providerStream.receipt.receiptDigest
        !== entry.hostBillingAuthority.providerStreamReceiptDigest
      || providerStream.receipt.artifact.sha256 !== entry.providerStream.contentDigest
      || providerStream.receipt.artifact.sha256 !== exactCustodyDigest(providerStream.bytes)
      || providerStream.receipt.artifact.byteLength !== entry.providerStream.byteLength
      || providerStream.receipt.capturedAt !== entry.providerExit.observedAt
      || providerStream.receipt.admissionReceiptDigest
        !== entry.scope.admissionRef.admissionReceiptDigest
      || providerStream.receipt.policyDigest !== entry.scope.policy.policyDigest
      || canonicalJson(providerStream.receipt.identity) !== canonicalJson(entry.scope.identity)
      || entry.hostBillingAuthority.bindingDigest !== exactCustodyJsonDigest({
        evidenceDigest: entry.hostBillingAuthority.evidenceDigest,
        providerStreamReceiptDigest: entry.hostBillingAuthority.providerStreamReceiptDigest,
        acceptedResultArtifactReceiptDigest: entry.acceptedResultRef.artifactReceiptDigest,
        acceptedResultChainDigest: chain.receiptDigest,
      })) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    const durableBilling = extractProviderBillingEvidence(
      entry.scope.provider,
      Buffer.from(providerStream.bytes).toString('utf8'),
      providerStream.receipt.capturedAt,
    );
    if (!durableBilling
      || exactCustodyJsonDigest(durableBilling) !== entry.hostBillingAuthority.evidenceDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(artifact.bytes).toString('utf8')) as unknown; }
    catch { decoded = null; }
    const result = validateProductionTaskResultV2(decoded, entry.scope.policy.jsonBounds);
    const immutableResult = result.ok ? snapshotExactPlainData(result.value) : { ok: false } as const;
    if (!result.ok || !immutableResult.ok
      || (immutableResult.value as TaskResultV2).attemptCustody.admissionReceiptDigest
        !== entry.scope.admissionRef.admissionReceiptDigest
      || canonicalJson((immutableResult.value as TaskResultV2).attemptCustody.identity)
        !== canonicalJson(entry.scope.identity)
      || (immutableResult.value as TaskResultV2).attemptCustody.policyDigest
        !== entry.scope.policy.policyDigest
      || exactCustodyJsonDigest((immutableResult.value as TaskResultV2).providerBilling)
        !== entry.hostBillingAuthority.evidenceDigest
      || taskResultV2Digest(immutableResult.value as TaskResultV2, entry.scope.policy.jsonBounds)
        !== entry.resultDigest
      || Buffer.compare(
        Buffer.from(canonicalTaskAttemptCustodyJson(
          immutableResult.value as TaskResultV2,
          entry.scope.policy.jsonBounds,
        )),
        Buffer.from(artifact.bytes),
      ) !== 0) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    const acceptedResult = immutableResult.value as TaskResultV2;
    const hostWorkAuthority = this.exactCanonicalHostWorkAuthorityFromAccepted(
      entry.scope,
      entry.providerExit,
      acceptedResult,
      hostPromptDeliveryAuthority,
    );
    const hostWorkBinding = acceptedResult.attemptCustody.hostWorkAttribution;
    const durableHostWork = entry.scope.store.readVerifiedArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'host-work-attribution',
      artifactKey: hostWorkBinding.artifactKey,
      receiptDigest: hostWorkBinding.artifactReceiptDigest as Sha256Digest,
    });
    let decodedHostWork: unknown = null;
    try {
      decodedHostWork = durableHostWork
        ? JSON.parse(Buffer.from(durableHostWork.bytes).toString('utf8')) : null;
    } catch { decodedHostWork = null; }
    const hostWorkSnapshot = snapshotExactPlainData(decodedHostWork);
    const durableHostWorkAuthority = hostWorkSnapshot.ok
      ? exactCanonicalHostWorkAuthority(
          hostWorkSnapshot.value as ExactDockerHostWorkAttributionV2,
          entry.scope,
          entry.providerExit,
        )
      : null;
    if (!durableHostWork
      || durableHostWork.receipt.artifactClass !== 'host-work-attribution'
      || durableHostWork.receipt.artifactKey !== hostWorkBinding.artifactKey
      || durableHostWork.receipt.receiptDigest !== hostWorkBinding.artifactReceiptDigest
      || durableHostWork.receipt.artifact.sha256 !== hostWorkBinding.artifactSha256
      || durableHostWork.receipt.artifact.byteLength !== hostWorkBinding.byteLength
      || durableHostWork.receipt.capturedAt !== entry.providerExit.observedAt
      || !durableHostWorkAuthority
      || canonicalJson(durableHostWorkAuthority) !== canonicalJson(hostWorkAuthority)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    const sourceBinding = acceptedResult.attemptCustody.sourceResult;
    const source = entry.scope.store.readVerifiedArtifact({
      identity: entry.scope.identity,
      policy: entry.scope.policy,
      artifactClass: 'worker-result',
      artifactKey: sourceBinding.artifactKey,
      receiptDigest: sourceBinding.artifactReceiptDigest as Sha256Digest,
    });
    if (!source
      || source.receipt.receiptDigest !== sourceBinding.artifactReceiptDigest
      || source.receipt.artifactClass !== 'worker-result'
      || source.receipt.artifactKey !== sourceBinding.artifactKey
      || source.receipt.artifact.sha256 !== sourceBinding.artifactSha256
      || source.receipt.artifact.sha256 !== exactCustodyDigest(source.bytes)
      || source.receipt.artifact.byteLength !== sourceBinding.byteLength
      || source.receipt.admissionReceiptDigest
        !== entry.scope.admissionRef.admissionReceiptDigest
      || source.receipt.policyDigest !== entry.scope.policy.policyDigest
      || canonicalJson(source.receipt.identity) !== canonicalJson(entry.scope.identity)
      || source.receipt.capturedAt !== entry.providerExit.observedAt
      || Date.parse(artifact.receipt.capturedAt) < Date.parse(entry.providerExit.observedAt)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    let sourceDecoded: unknown;
    try { sourceDecoded = JSON.parse(Buffer.from(source.bytes).toString('utf8')) as unknown; }
    catch { sourceDecoded = null; }
    const sourceSnapshot = snapshotExactPlainData(sourceDecoded);
    if (!sourceSnapshot.ok || !sourceSnapshot.value
      || typeof sourceSnapshot.value !== 'object' || Array.isArray(sourceSnapshot.value)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    let reassembled: TaskResultV2;
    try {
      reassembled = assembleCanonicalIngressResultV2(
        sourceSnapshot.value as Record<string, unknown>,
        this.exactCanonicalIngressAuthority(entry.scope),
        Object.freeze({
          attemptCustody: Object.freeze({
            version: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
            identity: entry.scope.identity,
            policyDigest: entry.scope.policy.policyDigest,
            admissionReceiptDigest: entry.scope.admissionRef.admissionReceiptDigest,
            sourceResult: Object.freeze({
              artifactClass: 'worker-result' as const,
              artifactKey: source.receipt.artifactKey,
              artifactReceiptDigest: source.receipt.receiptDigest,
              artifactSha256: source.receipt.artifact.sha256,
              byteLength: source.receipt.artifact.byteLength,
            }),
          }),
          hostWorkArtifact: acceptedResult.attemptCustody.hostWorkAttribution,
          jsonBounds: entry.scope.policy.jsonBounds,
          hostTerminalBilling: Object.freeze({
            evidence: Object.freeze(durableBilling),
            evidenceDigest: entry.hostBillingAuthority.evidenceDigest,
            providerStreamReceiptDigest:
              entry.hostBillingAuthority.providerStreamReceiptDigest,
            billingMode: entry.scope.execution.authMode,
          }),
          hostWorkAuthority,
          hostPromptDeliveryAuthority,
          hostEffectAuthority: entry.hostEffectAuthority,
        }),
      );
    } catch {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    if (Buffer.compare(
      Buffer.from(canonicalTaskAttemptCustodyJson(reassembled, entry.scope.policy.jsonBounds)),
      Buffer.from(artifact.bytes),
    ) !== 0
      || taskResultV2Digest(reassembled, entry.scope.policy.jsonBounds) !== entry.resultDigest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    return Object.freeze({
      kind: 'accepted-result',
      acceptedResultRef: entry.acceptedResultRef,
      acceptedResultChainDigest: entry.acceptedResultChainDigest,
      resultDigest: entry.resultDigest,
      result: acceptedResult,
      hostBillingAuthority: entry.hostBillingAuthority,
      hostEffectAuthority: entry.hostEffectAuthority,
      reader,
    });
  }

  /**
   * Rebuild the opaque read capability for an already accepted attempt from
   * durable Store authority only. No provider, Docker resource, registry,
   * credential or current host-work measurement participates in this path.
   */
  private readColdExactDockerAcceptedResult(
    scope: PreparedExactDockerCustodyScope,
    query: ExactDockerCustodyTerminalQueryV2,
    providerExit: ExactDockerProviderExitObservationRefV2,
  ): ExactDockerAcceptedResultV2 | null {
    const artifactKey = `accepted-${scope.identity.attemptId}`;
    const acceptedReceipt = scope.store.readArtifactReceipt({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'canonical-accepted-result',
      artifactKey,
    });
    let acceptedChain = scope.store.readChain(
      scope.identity,
      scope.policy,
      'accepted-result',
    );
    if (!acceptedReceipt && !acceptedChain) return null;
    if (!acceptedReceipt) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const acceptedArtifact = scope.store.readVerifiedArtifact({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'canonical-accepted-result',
      artifactKey,
      receiptDigest: acceptedReceipt.receiptDigest,
    });
    if (!acceptedArtifact
      || (acceptedChain !== null
        && (acceptedChain.artifactReceiptDigest !== acceptedReceipt.receiptDigest
          || acceptedChain.artifactKey !== artifactKey
          || acceptedChain.occurredAt !== acceptedArtifact.receipt.capturedAt))) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    let decoded: unknown = null;
    try { decoded = JSON.parse(Buffer.from(acceptedArtifact.bytes).toString('utf8')); }
    catch { decoded = null; }
    const parsed = validateProductionTaskResultV2(decoded, scope.policy.jsonBounds);
    if (!parsed.ok) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const result = parsed.value;
    const effectBinding = result.attemptCustody.effectLanding;
    const lifecycleStoreAdapter = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: scope.store,
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      platform: process.env.WSL_DISTRO_NAME ? 'wsl2-linux' : 'linux',
      now: () => new Date().toISOString(),
    });
    let acceptedEffect: ExecutionEffectStoreAcceptedAuthorityV1;
    try {
      acceptedEffect = lifecycleStoreAdapter.readAcceptedAuthority(
        effectBinding.landingArtifactKey,
      );
    } catch {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    if (canonicalJson(acceptedEffect.binding) !== canonicalJson(effectBinding)
      || (acceptedChain !== null && acceptedChain.predecessorDigest
        !== acceptedEffect.binding.effectLandingChainDigest)
      || acceptedArtifact.receipt.capturedAt
        !== acceptedEffect.verifiedLanding.landing.releasedAt
      || Date.parse(acceptedArtifact.receipt.capturedAt) < Date.parse(providerExit.observedAt)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    if (!acceptedChain) {
      acceptedChain = scope.store.appendChain({
        identity: scope.identity,
        policy: scope.policy,
        admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
        stage: 'accepted-result',
        occurredAt: acceptedArtifact.receipt.capturedAt,
        predecessorDigest: acceptedEffect.binding.effectLandingChainDigest,
        artifactReceipt: acceptedReceipt,
      });
    }
    const streamArtifactKey = `provider-${scope.identity.attemptId}`;
    const streamReceipt = scope.store.readArtifactReceipt({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: streamArtifactKey,
    });
    const providerStream = streamReceipt ? scope.store.readVerifiedArtifact({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: streamArtifactKey,
      receiptDigest: streamReceipt.receiptDigest,
    }) : null;
    if (!providerStream || providerStream.receipt.capturedAt !== providerExit.observedAt) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const billing = extractProviderBillingEvidence(
      scope.provider,
      Buffer.from(providerStream.bytes).toString('utf8'),
      providerStream.receipt.capturedAt,
    );
    if (!billing
      || exactCustodyJsonDigest(billing) !== exactCustodyJsonDigest(result.providerBilling)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const acceptedResultRef = createExactAcceptedTaskResultRefV2(acceptedReceipt);
    const hostBillingAuthority = Object.freeze({
      evidenceDigest: exactCustodyJsonDigest(billing),
      providerStreamReceiptDigest: providerStream.receipt.receiptDigest,
      acceptedResultArtifactReceiptDigest: acceptedResultRef.artifactReceiptDigest,
      acceptedResultChainDigest: acceptedChain.receiptDigest,
      bindingDigest: exactCustodyJsonDigest({
        evidenceDigest: exactCustodyJsonDigest(billing),
        providerStreamReceiptDigest: providerStream.receipt.receiptDigest,
        acceptedResultArtifactReceiptDigest: acceptedResultRef.artifactReceiptDigest,
        acceptedResultChainDigest: acceptedChain.receiptDigest,
      }),
    });
    const reader = Object.freeze(Object.create(null)) as ExactDockerAcceptedResultReaderV2;
    this.exactAcceptedResultReaders.set(reader, Object.freeze({
      scope,
      query,
      acceptedResultRef,
      acceptedResultChainDigest: acceptedChain.receiptDigest,
      resultDigest: taskResultV2Digest(result, scope.policy.jsonBounds),
      providerStream: this.exactArtifactProjection(providerStream.receipt) as
        ExactDockerVerifiedArtifactRefV2,
      providerExit,
      hostBillingAuthority,
      hostEffectAuthority: Object.freeze({
        projection: acceptedEffect.projection,
        binding: acceptedEffect.binding,
      }),
    }));
    return this.readExactDockerAcceptedResult(reader);
  }

  /**
   * Recover the narrow crash window after durable effect release but before
   * canonical accepted-result publication. Every input was persisted before
   * cleanup; current host disk and removed Docker resources are never sampled.
   */
  private readColdExactDockerCompletion(
    scope: PreparedExactDockerCustodyScope,
    query: ExactDockerCustodyTerminalQueryV2,
    providerExit: ExactDockerProviderExitObservationRefV2,
  ): ExactDockerCustodyCompletionV2 | null {
    const hostWorkArtifactKey = `host-work-${scope.identity.attemptId}`;
    const hostWorkReceipt = scope.store.readArtifactReceipt({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'host-work-attribution',
      artifactKey: hostWorkArtifactKey,
    });
    if (!hostWorkReceipt) return null;
    const hostWorkArtifact = scope.store.readVerifiedArtifact({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'host-work-attribution',
      artifactKey: hostWorkArtifactKey,
      receiptDigest: hostWorkReceipt.receiptDigest,
    });
    let decodedHostWork: unknown = null;
    try {
      decodedHostWork = hostWorkArtifact
        ? JSON.parse(Buffer.from(hostWorkArtifact.bytes).toString('utf8')) : null;
    } catch { decodedHostWork = null; }
    const hostWorkSnapshot = snapshotExactPlainData(decodedHostWork);
    const hostWorkAttribution = hostWorkSnapshot.ok
      ? hostWorkSnapshot.value as ExactDockerHostWorkAttributionV2 : null;
    if (!hostWorkArtifact || hostWorkArtifact.receipt.capturedAt !== providerExit.observedAt
      || !hostWorkAttribution
      || !exactCanonicalHostWorkAuthority(hostWorkAttribution, scope, providerExit)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const lifecycleStoreAdapter = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: scope.store,
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      platform: process.env.WSL_DISTRO_NAME ? 'wsl2-linux' : 'linux',
      now: () => new Date().toISOString(),
    });
    const recoveryAnchor = lifecycleStoreAdapter.readLandingRecoveryAnchor();
    if (!recoveryAnchor) return null;
    const landingArtifactKey =
      `effect-landing-${recoveryAnchor.transactionDigest.slice(7, 39)}`;
    let acceptedEffect: ExecutionEffectStoreAcceptedAuthorityV1;
    try {
      acceptedEffect = lifecycleStoreAdapter.readAcceptedAuthority(landingArtifactKey);
    } catch {
      // Host-work is published before cleanup. Its presence with no accepted
      // effect means release did not finish and the live lifecycle must resume.
      return null;
    }
    const streamArtifactKey = `provider-${scope.identity.attemptId}`;
    const resultArtifactKey = `result-${scope.identity.attemptId}`;
    const landingProposalArtifactKey = `landing-${scope.identity.attemptId}`;
    const landingRequired = scope.execution.executionLandingPolicy !== null;
    const streamReceipt = scope.store.readArtifactReceipt({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: streamArtifactKey,
    });
    const resultReceipt = scope.store.readArtifactReceipt({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'worker-result',
      artifactKey: resultArtifactKey,
    });
    const landingReceipt = scope.store.readArtifactReceipt({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'worker-landing-proposal',
      artifactKey: landingProposalArtifactKey,
    });
    const streamArtifact = streamReceipt ? scope.store.readVerifiedArtifact({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: streamArtifactKey,
      receiptDigest: streamReceipt.receiptDigest,
    }) : null;
    const resultArtifact = resultReceipt ? scope.store.readVerifiedArtifact({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'worker-result',
      artifactKey: resultArtifactKey,
      receiptDigest: resultReceipt.receiptDigest,
    }) : null;
    const landingArtifact = landingReceipt ? scope.store.readVerifiedArtifact({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'worker-landing-proposal',
      artifactKey: landingProposalArtifactKey,
      receiptDigest: landingReceipt.receiptDigest,
    }) : null;
    if (!streamReceipt || !streamArtifact || !resultReceipt || !resultArtifact
      || (landingRequired && (!landingReceipt || !landingArtifact))
      || (!landingRequired && (landingReceipt !== null || landingArtifact !== null))
      || streamReceipt.capturedAt !== providerExit.observedAt
      || resultReceipt.capturedAt !== providerExit.observedAt
      || (landingReceipt !== null
        && landingReceipt.capturedAt !== providerExit.observedAt)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const billing = extractProviderBillingEvidence(
      scope.provider,
      Buffer.from(streamArtifact.bytes).toString('utf8'),
      streamReceipt.capturedAt,
    );
    let proposal: ExactExecutionLandingProposalV3 | null = null;
    if (landingArtifact) {
      try {
        proposal = parseExactExecutionLandingProposalJsonV3(
          Buffer.from(landingArtifact.bytes).toString('utf8'),
          {
            taskId: scope.identity.taskId,
            dispatchRequestId: scope.admissionRef.dispatchRequestId,
          },
        );
      } catch { proposal = null; }
    }
    if (!billing || (landingRequired && !proposal)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const sourceBinding = Object.freeze({
      version: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
      identity: scope.identity,
      policyDigest: scope.policy.policyDigest,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      sourceResult: Object.freeze({
        artifactClass: 'worker-result' as const,
        artifactKey: resultReceipt.artifactKey,
        artifactReceiptDigest: resultReceipt.receiptDigest,
        artifactSha256: resultReceipt.artifact.sha256,
        byteLength: resultReceipt.artifact.byteLength,
      }),
    });
    const base = Object.freeze({
      custodyRef: query.custodyRef,
      releaseReceipt: query.releaseReceipt,
      projectionFence: query.projectionFence,
      providerExit,
      hostWorkAttribution,
      hostEffectAuthority: Object.freeze({
        projection: acceptedEffect.projection,
        binding: acceptedEffect.binding,
      }),
      providerStream: this.exactArtifactProjection(streamReceipt) as
        ExactDockerProviderStreamRefV2,
      result: sourceBinding,
      resultArtifact: this.exactArtifactProjection(resultReceipt) as
        Extract<ExactDockerCustodyCompletionV2, { kind: 'result-captured' }>['resultArtifact'],
      providerBilling: Object.freeze({
        evidence: billing,
        evidenceDigest: exactCustodyJsonDigest(billing),
        providerStreamReceiptDigest: streamReceipt.receiptDigest,
      }),
    });
    if (!landingRequired) {
      return Object.freeze({ kind: 'result-captured' as const, ...base });
    }
    if (!landingReceipt || !proposal) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    return Object.freeze({
      kind: 'landing-captured' as const,
      ...base,
      landingProposal: Object.freeze({
        artifact: this.exactArtifactProjection(landingReceipt) as
          ExactDockerLandingProposalArtifactRefV2,
        proposal: Object.freeze(proposal),
        verifiedAt: providerExit.observedAt,
      }),
    });
  }

  private exactCanonicalIngressAuthority(
    scope: PreparedExactDockerCustodyScope,
  ): CanonicalIngressAuthority {
    const durableTask = scope.taskSnapshot.material.dispatch;
    const durableWorkerId = durableTask.assignedWorker;
    if (!hasExactAcceptedAuthorityTaskFields(durableTask)
      || !durableWorkerId || durableWorkerId.trim().length === 0) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_INPUT_INVALID', true);
    }
    return Object.freeze({
      taskId: scope.identity.taskId,
      workerId: durableWorkerId,
      provider: scope.provider,
      model: scope.model,
      ...(durableTask.sprintId ? { sprintId: durableTask.sprintId } : {}),
      ...(durableTask.promptCompilePlanId
        ? { promptCompilePlanId: durableTask.promptCompilePlanId } : {}),
      ...(durableTask.verification
        ? { verificationCommands: Object.freeze([...durableTask.verification.commands]) } : {}),
      isPriorityFix: durableTask.isPriorityFix ?? false,
      fixForTaskId: durableTask.fixForTaskId ?? null,
    });
  }

  private rereadExactTaskSnapshot(
    scope: PreparedExactDockerCustodyScope,
  ): ExactDockerDispatchSnapshotV2 {
    const durable = scope.store.readTaskSnapshot({
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
    });
    const snapshot = durable ? parseExactDockerDispatchSnapshot(durable.bytes) : null;
    if (!durable || !snapshot
      || durable.admission.receiptDigest !== scope.admissionRef.admissionReceiptDigest
      || durable.proof.sha256 !== scope.admission.taskSnapshot.sha256
      || durable.proof.sha256 !== exactCustodyDigest(durable.bytes)
      || durable.proof.byteLength !== durable.bytes.byteLength
      || canonicalJson(snapshot) !== canonicalJson(scope.taskSnapshot)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    return snapshot;
  }

  private rereadExactProviderStartObservation(
    scope: PreparedExactDockerCustodyScope,
    query: ExactDockerCustodyTerminalQueryV2,
    taskSnapshot = this.rereadExactTaskSnapshot(scope),
  ): ExactDockerProviderStartBundleV2 {
    const terminal = scope.store.readDispatchAuthority({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
    });
    const observation = scope.store.readDispatchObservation({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass: 'PROVIDER_START',
      receiptDigest: query.providerStartReceipt.ref,
    });
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(observation.bytes).toString('utf8')) as unknown; }
    catch { decoded = null; }
    const record = exactOwnDataRecord(decoded, [
      'schemaVersion', 'kind', 'admissionRefDigest', 'containerId',
      'taskSnapshotSha256', 'providerInvocationDigest', 'authorityLabelsDigest',
      'providerStartNonceSha256', 'executionCommitNonceSha256',
      'providerExecutionAttemptId', 'providerExecutionAttemptIdentityDigest',
      'dispatchReceiptDigest', 'releaseReceiptRef', 'releaseReceiptDigest',
      'projectionFence', 'startAuthorizationDigest', 'pid1StartAckDigest',
      'state', 'providerState', 'observedAt',
    ]);
    if (terminal.state !== 'terminal' || terminal.authority.state !== 'RELEASED'
      || !record || record.schemaVersion !== 2
      || record.kind !== 'exact-docker-provider-start'
      || observation.receipt.receiptDigest !== query.providerStartReceipt.ref
      || observation.receipt.evidenceDigest !== query.providerStartReceipt.digest
      || record.admissionRefDigest !== scope.admissionRef.refDigest
      || record.containerId !== terminal.authority.backendExecutionId
      || record.taskSnapshotSha256 !== scope.admission.taskSnapshot.sha256
      || record.providerInvocationDigest !== taskSnapshot.dispatch.providerInvocationDigest
      || record.providerInvocationDigest
        !== terminal.authority.releaseEvidence.providerInvocationDigest
      || record.authorityLabelsDigest
        !== terminal.authority.releaseEvidence.daemonAuthorityLabelDigest
      || record.providerStartNonceSha256
        !== taskSnapshot.dispatch.providerStartNonceSha256
      || record.executionCommitNonceSha256
        !== taskSnapshot.dispatch.executionCommitNonceSha256
      || record.providerExecutionAttemptId
        !== terminal.authority.providerExecutionAttempt.providerExecutionAttemptId
      || record.providerExecutionAttemptIdentityDigest
        !== terminal.authority.providerExecutionAttempt.identityDigest
      || record.dispatchReceiptDigest !== terminal.authority.receiptDigest
      || record.releaseReceiptRef !== terminal.authority.releaseReceiptDigest
      || record.releaseReceiptDigest !== terminal.authority.releaseEvidenceDigest
      || record.projectionFence !== terminal.authority.projectionFence
      || record.projectionFence !== query.projectionFence
      || !isExactDigest(record.startAuthorizationDigest)
      || !isExactDigest(record.pid1StartAckDigest)
      || record.state !== 'START_AUTHORIZATION_ACCEPTED'
      || record.providerState !== 'NOT_STARTED'
      || typeof record.observedAt !== 'string'
      || observation.receipt.observedAt !== record.observedAt
      || !Number.isFinite(Date.parse(record.observedAt))) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    return record as unknown as ExactDockerProviderStartBundleV2;
  }

  private exactCanonicalHostPromptDeliveryAuthority(
    scope: PreparedExactDockerCustodyScope,
    query: ExactDockerCustodyTerminalQueryV2,
  ): CanonicalIngressCustodyAuthority['hostPromptDeliveryAuthority'] {
    const taskSnapshot = this.rereadExactTaskSnapshot(scope);
    const providerStart = this.rereadExactProviderStartObservation(
      scope,
      query,
      taskSnapshot,
    );
    const basePrompt = exactDockerBasePromptFromDispatchedPrompt(
      taskSnapshot.dispatch.prompt,
      taskSnapshot.dispatch.execution.executionLandingPolicy,
      taskSnapshot.taskId,
      taskSnapshot.dispatchRequestId,
    );
    const authority = basePrompt === null ? null : parseExactDockerPromptDeliveryAuthority(
      taskSnapshot.dispatch.promptDeliveryAuthority,
      basePrompt,
      taskSnapshot.material.dispatch,
    );
    if (!authority) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    const bindingBody = Object.freeze({
      promptDeliveryAttribution: Object.freeze({ state: 'CURRENT' as const }),
      agentId: authority.deliveredAgentId,
      skillIds: Object.freeze([...authority.deliveredSkillIds]),
      promptCompilePlanId: authority.promptCompilePlanId,
      receiptIdentity: authority.receiptIdentity,
      promptDeliveryAuthorityDigest: authority.authorityDigest,
      basePromptSha256: authority.basePromptSha256,
      segmentManifestDigest: authority.segmentManifestDigest,
      taskSnapshotSha256: providerStart.taskSnapshotSha256,
      providerInvocationDigest: providerStart.providerInvocationDigest,
      providerStartObservationReceiptDigest: query.providerStartReceipt.ref,
      providerStartObservationEvidenceDigest: query.providerStartReceipt.digest,
      executionCommitNonceSha256: providerStart.executionCommitNonceSha256,
    });
    return Object.freeze({
      ...bindingBody,
      bindingDigest: exactCustodyJsonDigest(bindingBody),
    });
  }

  private rereadExactProviderExitObservation(
    scope: PreparedExactDockerCustodyScope,
    providerExit: ExactDockerProviderExitObservationRefV2,
  ): void {
    const observation = scope.store.readDispatchObservation({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass: 'PROVIDER_EXIT',
      receiptDigest: providerExit.observationReceiptDigest,
    });
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(observation.bytes).toString('utf8')) as unknown; }
    catch { decoded = null; }
    const record = exactOwnDataRecord(decoded, [
      'schemaVersion', 'kind', 'admissionRefDigest', 'containerId', 'exitCode',
      'dockerWaitProcessExitCode', 'dockerWaitSignal', 'stdoutSha256',
      'stderrSha256', 'waitEvidenceDigest', 'observedAt',
    ]);
    const waitEvidence = record ? Object.freeze({
      admissionRefDigest: record.admissionRefDigest,
      containerId: record.containerId,
      exitCode: record.exitCode,
      dockerWaitProcessExitCode: record.dockerWaitProcessExitCode,
      dockerWaitSignal: record.dockerWaitSignal,
      stdoutSha256: record.stdoutSha256,
      stderrSha256: record.stderrSha256,
      observedAt: record.observedAt,
    }) : null;
    if (!record || !waitEvidence
      || observation.receipt.receiptDigest !== providerExit.observationReceiptDigest
      || observation.receipt.evidenceDigest !== providerExit.observationEvidenceDigest
      || record.schemaVersion !== 2 || record.kind !== 'exact-docker-provider-exit'
      || record.admissionRefDigest !== scope.admissionRef.refDigest
      || record.containerId !== providerExit.containerId
      || record.exitCode !== providerExit.exitCode
      || record.dockerWaitProcessExitCode !== 0 || record.dockerWaitSignal !== null
      || !isExactDigest(record.stdoutSha256) || !isExactDigest(record.stderrSha256)
      || record.waitEvidenceDigest !== providerExit.waitEvidenceDigest
      || record.waitEvidenceDigest !== exactCustodyJsonDigest(waitEvidence)
      || observation.receipt.observedAt !== providerExit.observedAt
      || record.observedAt !== providerExit.observedAt) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_PROVIDER_EXIT_OBSERVATION_INVALID', true);
    }
  }

  private exactCanonicalHostWorkAuthorityFromAccepted(
    scope: PreparedExactDockerCustodyScope,
    providerExit: ExactDockerProviderExitObservationRefV2,
    result: TaskResultV2,
    prompt: CanonicalIngressCustodyAuthority['hostPromptDeliveryAuthority'],
  ): CanonicalIngressCustodyAuthority['hostWorkAuthority'] {
    const work = result.workAttribution;
    const scopeFiles = normalizedScopeFiles(
      scope.taskSnapshot.material.dispatch.scope.filesWrite,
    );
    const scopeSet = new Set(scopeFiles);
    const expectedBaselineSha256 = scope.taskSnapshot.dispatch.scopeBaselineSha256
      .slice('sha256:'.length);
    const expectedBaselineRef = `task-attempt-custody-provider-exit:${providerExit.observationReceiptDigest}#scope-baseline:sha256:${expectedBaselineSha256}`;
    if (!work || work.state !== 'VERIFIED'
      || work.attemptId !== scope.identity.attemptId
      || work.baselineRef !== expectedBaselineRef
      || work.baselineSha256 !== expectedBaselineSha256
      || work.scopeDigest !== scopeAttributionDigest(scopeFiles)
      || result.diskVerified !== true || result.boundaryViolations.length !== 0
      || result.promptDeliveryAttribution?.state !== 'CURRENT'
      || result.agent !== prompt.agentId
      || canonicalJson(result.skills) !== canonicalJson(prompt.skillIds)
      || result.hostTerminalProjection !== undefined
      || result.filesChanged.some(change => !scopeSet.has(change.path))
      || new Set(result.filesChanged.map(change => change.path)).size
        !== result.filesChanged.length
      || result.filesChanged.reduce((sum, change) => sum + change.linesAdded, 0)
        !== result.totalLinesAdded
      || result.filesChanged.reduce((sum, change) => sum + change.linesRemoved, 0)
        !== result.totalLinesRemoved) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ACCEPTED_RESULT_READER_INVALID', true);
    }
    const authorityBody = Object.freeze({
      filesChanged: Object.freeze(result.filesChanged.map(change => Object.freeze({ ...change }))),
      totalLinesAdded: result.totalLinesAdded,
      totalLinesRemoved: result.totalLinesRemoved,
      workAttribution: Object.freeze({
        state: 'VERIFIED' as const,
        attemptId: work.attemptId,
        baselineRef: work.baselineRef,
        baselineSha256: work.baselineSha256,
        scopeDigest: work.scopeDigest,
      }),
      providerExitObservationReceiptDigest: providerExit.observationReceiptDigest,
    });
    return Object.freeze({
      ...authorityBody,
      evidenceDigest: exactCustodyJsonDigest(authorityBody),
    });
  }

  private exactArtifactProjection(
    receipt: TaskAttemptCustodyArtifactReceiptV2,
  ): ExactDockerVerifiedArtifactRefV2 {
    if (![
      'worker-result', 'worker-partial-result', 'worker-landing-proposal',
      'worker-provider-observation', 'worker-timeout', 'pristine-provider-stream',
    ].includes(receipt.artifactClass)) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_ARTIFACT_CLASS_INVALID', true);
    }
    return Object.freeze({
      identity: receipt.identity,
      admissionReceiptDigest: receipt.admissionReceiptDigest,
      policyDigest: receipt.policyDigest,
      artifactClass: receipt.artifactClass as ExactDockerVerifiedArtifactRefV2['artifactClass'],
      artifactKey: receipt.artifactKey,
      contentDigest: receipt.artifact.sha256,
      byteLength: receipt.artifact.byteLength,
      capturedAt: receipt.capturedAt,
      receiptDigest: receipt.receiptDigest,
    });
  }

  private async commitExactDockerEffectLanding(
    scope: PreparedExactDockerCustodyScope,
    providerExit: ExactDockerProviderExitObservationRefV2,
  ): Promise<ExactDockerCommittedEffectLandingV1 | null> {
    const launch = scope.launch;
    const spawned = launch?.spawnOutcome;
    if (!launch || !spawned || spawned.containerId !== providerExit.containerId
      || !spawned.imageDigest || !launch.authorityLabelsDigest) return null;
    try {
      let captured = launch.effect.ready;
      if (captured) {
        if (captured.lifecycleAuthority.providerStopped.containerName
          !== launch.expectedContainerName
          || captured.lifecycleAuthority.providerStopped.exitCode !== providerExit.exitCode
          || captured.lifecycleAuthority.providerStopped.exitObservationReceiptDigest
            !== providerExit.observationReceiptDigest) return null;
      } else {
        const authorized = launch.effect.authorized;
        if (!authorized) return null;
        const providerStartAuthorityDigest = authorized.providerStartAuthorityDigest;
        const containerIdentityDigest = exactEffectDomainDigest(
          'execution-effect-docker-provider-container-identity-v1',
          {
            containerId: spawned.containerId,
            containerName: launch.expectedContainerName,
            imageReference: launch.effect.imageAuthority.imageReference,
            imageDigest: spawned.imageDigest,
            authorityLabelsDigest: launch.authorityLabelsDigest,
            providerStartAuthorityDigest,
          },
        ) as Sha256Digest;
        const stopped = createExecutionEffectDockerProviderStoppedReceiptV1({
          providerStartAuthorityDigest,
          containerName: launch.expectedContainerName,
          containerIdentityDigest,
          exitCode: providerExit.exitCode,
          exitObservationReceiptDigest: providerExit.observationReceiptDigest,
          stoppedAt: providerExit.observedAt,
        });
        const finalCapture = await captureExecutionEffectDockerFinalV1(
          authorized.session,
          stopped,
        );
        if (finalCapture.state !== 'READY_FOR_LANDING') return null;
        const readyPublication = launch.effect.storeAdapter.publishLifecycleAuthority(
          finalCapture.lifecycleAuthority,
        );
        const readyReread = launch.effect.storeAdapter.readLifecycleAuthority('READY_FOR_LANDING');
        if (!readyReread
          || readyReread.authorityDigest !== finalCapture.lifecycleAuthority.authorityDigest
          || readyPublication.authority.authorityDigest !== readyReread.authorityDigest) return null;
        captured = finalCapture;
        launch.effect.ready = finalCapture;
      }
      const containerIdentityDigest = exactEffectDomainDigest(
        'execution-effect-docker-provider-container-identity-v1',
        {
          containerId: spawned.containerId,
          containerName: launch.expectedContainerName,
          imageReference: launch.effect.imageAuthority.imageReference,
          imageDigest: spawned.imageDigest,
          authorityLabelsDigest: launch.authorityLabelsDigest,
          providerStartAuthorityDigest:
            captured.lifecycleAuthority.providerStartAuthorityDigest,
        },
      ) as Sha256Digest;
      const workspaceRuntime: ExecutionEffectDockerWorkspaceRuntimeV1 = Object.freeze({
        version: 1,
        state: 'SEALED',
        imageReference: launch.effect.imageAuthority.imageReference,
        imageDigest: launch.effect.imageAuthority.imageDigest,
        volumeName: launch.workspaceVolumeName,
        volumeNameDigest: captured.workspaceSnapshot.workspaceResource.volumeNameDigest,
        volumeIdentityDigest:
          launch.effect.prepared.volumeCreationReceipt.volumeIdentityDigest,
        mountTarget: '/workspace',
        mountIdentityDigest: captured.workspacePlan.mountPlanDigest,
        workspaceResourceDigest: captured.workspaceSnapshot.workspaceResource.resourceDigest,
        workspaceSnapshotSealDigest: captured.workspaceSnapshot.sealDigest,
        manifestDigest: captured.finalManifest.digest as ExecutionEffectPersistenceDigest,
      });
      const platform = process.env.WSL_DISTRO_NAME ? 'wsl' as const : 'linux' as const;
      const attempt = Object.freeze({
        projectId: scope.identity.projectId,
        taskId: scope.identity.taskId,
        attemptId: scope.identity.attemptId,
        generation: scope.identity.generation,
      });
      const nativeInput = (sourceAuthorities: readonly ExecutionEffectNativeSourceAuthorityV1[]) =>
        Object.freeze({
          platform,
          canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
          hostPrivateStagingRoot: launch.effect.stagingRoot,
          attempt,
          identity: scope.identity,
          admission: scope.admission,
          policy: scope.policy,
          workspaceSnapshot: captured.workspaceSnapshot,
          workspaceRuntime,
          sourceAuthorities,
          store: scope.store,
          clock: launch.effect.clock,
          limits: launch.effect.limits,
        });
      const planId = `effect-${scope.admissionRef.refDigest.slice(7, 39)}`;
      const landingIntentDigest = executionEffectLandingIntentDigestV1({
        attemptDigest: captured.baselineManifest.attemptDigest as ExecutionEffectPersistenceDigest,
        baselineManifestDigest: captured.baselineManifest.digest as ExecutionEffectPersistenceDigest,
        finalManifestDigest: captured.finalManifest.digest as ExecutionEffectPersistenceDigest,
        containmentDecisionDigest: captured.decision.decisionDigest as ExecutionEffectPersistenceDigest,
        planId,
        nativeCapabilityDigest: launch.effect.landingCapabilityDigest,
      });
      const sourceAuthorities = captured.decision.effects.flatMap(effect => (
        (effect.kind === 'add' || effect.kind === 'modify')
          && effect.after?.kind === 'regular-file'
          ? [Object.freeze({
              path: effect.path,
              entry: effect.after,
              landingIntentDigest,
            })]
          : []
      ));
      const finalNative = await createExecutionEffectLandingNativeAdapterV1(
        nativeInput(Object.freeze(sourceAuthorities)),
      );
      if (finalNative.state !== 'READY'
        || finalNative.adapter.capability.capabilityDigest
          !== launch.effect.landingCapabilityDigest) return null;
      const durablePrepared = launch.effect.storeAdapter.readPreparedWorkspace();
      if (!durablePrepared
        || canonicalJson(durablePrepared)
          !== canonicalJson(launch.effect.preparedWorkspace)) return null;
      const storeAdapter = launch.effect.storeAdapter;
      const lease = createExecutionEffectLockAdapterV1(this.projectDir, {
        projectRootIdentityDigest: finalNative.adapter.capability.projectRootIdentityDigest,
      });
      const adapters = Object.freeze({
        native: finalNative.adapter,
        journal: storeAdapter.journal,
        lease,
      });
      const located = readExecutionEffectLandingLocatorV1({
        projectId: scope.identity.projectId,
        taskId: scope.identity.taskId,
        attemptId: scope.identity.attemptId,
        generation: scope.identity.generation,
        attemptDigest: captured.baselineManifest.attemptDigest,
        baselineManifestDigest: captured.baselineManifest.digest,
        finalManifestDigest: captured.finalManifest.digest,
        containmentDecisionDigest: captured.decision.decisionDigest,
        planId,
        nativeCapabilityDigest: launch.effect.landingCapabilityDigest,
        adapters,
      });
      let outcome: ExecutionEffectLandingOutcomeV1;
      if (located.state === 'LOCATED') {
        outcome = await reconcileExecutionEffectLandingV1({
          transaction: located.transaction,
          adapters,
        });
      } else {
        const prepared = await prepareExecutionEffectLandingV1({
          planId,
          baseline: captured.baselineManifest,
          final: captured.finalManifest,
          decision: captured.decision,
          adapters,
        });
        if (prepared.state !== 'PREPARED') return null;
        outcome = await applyExecutionEffectLandingV1(prepared.session);
        if (outcome.state !== 'COMMITTED' && outcome.state !== 'COMMITTED_NO_CHANGE') {
          outcome = await reconcileExecutionEffectLandingV1({
            transaction: prepared.transaction,
            adapters,
          });
        }
      }
      if (outcome.state !== 'COMMITTED' && outcome.state !== 'COMMITTED_NO_CHANGE') return null;
      const receipt: ExecutionEffectLandingReceiptV1 = outcome;
      const terminalSeal = createExactDockerEffectTerminalSeal({
        scope,
        captured,
        storeAdapter,
        receipt,
        projectRoot: this.projectDir,
      });
      const recoveryContext = createExactDockerEffectLandingRecoveryContext({
        receipt,
        terminalSeal,
        storeAdapter,
      });
      const recoveryAnchor = storeAdapter.publishLandingRecoveryAnchor({
        readyLifecycleAuthorityDigest: captured.lifecycleAuthority.authorityDigest as Sha256Digest,
        transactionDigest: receipt.transaction.transactionDigest as Sha256Digest,
        resumeContext: recoveryContext,
        publishedAt: terminalSeal.committedAt,
      });
      const durableRecoveryAnchor = storeAdapter.readLandingRecoveryAnchor();
      if (!durableRecoveryAnchor
        || durableRecoveryAnchor.anchorDigest !== recoveryAnchor.anchorDigest
        || canonicalJson(durableRecoveryAnchor) !== canonicalJson(recoveryAnchor)) return null;
      return Object.freeze({
        captured,
        receipt,
        terminalSeal,
        storeAdapter,
        containerIdentityDigest,
      });
    } catch (error) {
      debugLog('docker-backend:exact-effect-landing-hold', error);
      return null;
    }
  }

  private async releaseExactDockerEffectLanding(
    scope: PreparedExactDockerCustodyScope,
    committed: ExactDockerCommittedEffectLandingV1,
  ): Promise<ExecutionEffectStoreAcceptedAuthorityV1 | null> {
    const dispatch = scope.store.readDispatchAuthority({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
    });
    const ready = committed.captured.lifecycleAuthority;
    const preparedWorkspace = committed.storeAdapter.readPreparedWorkspace();
    if (dispatch.state !== 'terminal' || dispatch.authority.state !== 'RELEASED'
      || typeof dispatch.authority.backendExecutionId !== 'string'
      || !dispatch.authority.releaseEvidence.imageDigest
      || !dispatch.authority.releaseEvidence.daemonAuthorityLabelDigest
      || ready.state !== 'READY_FOR_LANDING'
      || ready.providerStopped.containerIdentityDigest !== committed.containerIdentityDigest
      || !preparedWorkspace
      || preparedWorkspace.workspaceSnapshotSealDigest !== ready.workspaceSnapshot.sealDigest
      || preparedWorkspace.baselineManifestDigest !== ready.baselineManifest.digest) return null;
    const containerName = ready.providerStopped.containerName;
    const containerId = dispatch.authority.backendExecutionId;
    const imageDigest = dispatch.authority.releaseEvidence.imageDigest;
    const authorityLabelsDigest = dispatch.authority.releaseEvidence.daemonAuthorityLabelDigest;
    const run = this.exactWorkspaceCommandRunner;
    const landingReceiptDigest = committed.receipt.receiptDigest as Sha256Digest;
    const durableProgress = <T extends { readonly progress: { readonly progressDigest: string } }>(
      publication: T,
    ): T['progress'] | null => {
      const reread = committed.storeAdapter.readLatestReleaseProgress();
      return reread && reread.progressDigest === publication.progress.progressDigest
        && canonicalJson(reread) === canonicalJson(publication.progress)
        ? publication.progress : null;
    };
    const deleteContainer = async (deleteIntentDigest: Sha256Digest) => {
      const before = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['inspect', containerName]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 8 * 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      if (isExactDockerContainerAbsent(
        exactDockerWorkspaceCommandObservation(before), containerName,
      )) {
        return Object.freeze({
          disposition: 'RECONCILED_ABSENCE' as const,
          absence: createExecutionEffectDockerReconciledAbsenceReceiptV1({
            resourceKind: 'provider-container',
            resourceName: containerName,
            resourceIdentityDigest: committed.containerIdentityDigest,
            cleanupAuthorityDigest: landingReceiptDigest,
            deleteIntentDigest,
            observedAt: new Date().toISOString(),
          }),
        });
      }
      const daemon = exactDockerWorkspaceCommandSucceeded(before)
        ? parseExactDockerCustodyInspect(exactDockerWorkspaceCommandStdout(before)) : null;
      if (!daemon || daemon.containerId !== containerId
        || daemon.imageDigest !== imageDigest
        || exactCustodyJsonDigest(daemon.labels) !== authorityLabelsDigest) return null;
      const deleted = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['rm', containerId]),
        stdin: Buffer.alloc(0), timeoutMs: 30_000,
        stdoutCeiling: 1024, stderrCeiling: 64 * 1024,
      }));
      if (!exactDockerWorkspaceCommandSucceeded(deleted)
        || exactDockerWorkspaceCommandStdout(deleted).trim() !== containerId) return null;
      const deletion = createExecutionEffectDockerResourceDeletionReceiptV1({
        resourceKind: 'provider-container',
        resourceName: containerName,
        resourceIdentityDigest: committed.containerIdentityDigest,
        cleanupAuthorityDigest: landingReceiptDigest,
        deleteIntentDigest,
        deletedAt: new Date().toISOString(),
      });
      const inspected = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['inspect', containerName]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      if (!isExactDockerContainerAbsent(
        exactDockerWorkspaceCommandObservation(inspected),
        containerName,
      )) return null;
      const absence = createExecutionEffectDockerResourceAbsenceReceiptV1({
        resourceKind: 'provider-container',
        resourceName: containerName,
        resourceIdentityDigest: committed.containerIdentityDigest,
        deleteIntentDigest,
        deletionReceiptDigest: deletion.receiptDigest,
        observedAt: new Date().toISOString(),
      });
      return Object.freeze({ disposition: 'EXECUTED_DELETION' as const, deletion, absence });
    };
    const deleteVolume = async (
      resourceKind: 'workspace-volume' | 'dependency-volume',
      volumeName: string,
      identityDigest: Sha256Digest,
      labels: Readonly<Record<string, string>>,
      labelsDigest: Sha256Digest,
      resourceInstanceDigest: Sha256Digest,
      mountPlanDigest: Sha256Digest,
      deleteIntentDigest: Sha256Digest,
    ) => {
      const before = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['volume', 'inspect', volumeName]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      if (isExactDockerVolumeAbsent(
        exactDockerWorkspaceCommandObservation(before), volumeName,
      )) {
        return Object.freeze({
          disposition: 'RECONCILED_ABSENCE' as const,
          absence: createExecutionEffectDockerReconciledAbsenceReceiptV1({
            resourceKind,
            resourceName: volumeName,
            resourceIdentityDigest: identityDigest,
            cleanupAuthorityDigest: landingReceiptDigest,
            deleteIntentDigest,
            observedAt: new Date().toISOString(),
          }),
        });
      }
      const observation = exactDockerWorkspaceCommandSucceeded(before)
        ? parseExactDockerWorkspaceVolumeInspect(exactDockerWorkspaceCommandStdout(before)) : null;
      if (!observation || !verifyExactDockerWorkspaceVolumeInspect(observation, {
        name: volumeName,
        labels,
        canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
      }) || exactDockerEffectVolumeIdentity(observation, {
        labelsDigest,
        resourceInstanceDigest,
        mountPlanDigest,
      }) !== identityDigest) return null;
      const deleted = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['volume', 'rm', volumeName]),
        stdin: Buffer.alloc(0), timeoutMs: 30_000,
        stdoutCeiling: 1024, stderrCeiling: 64 * 1024,
      }));
      if (!exactDockerWorkspaceCommandSucceeded(deleted)
        || exactDockerWorkspaceCommandStdout(deleted).trim() !== volumeName) return null;
      const deletion = createExecutionEffectDockerResourceDeletionReceiptV1({
        resourceKind,
        resourceName: volumeName,
        resourceIdentityDigest: identityDigest,
        cleanupAuthorityDigest: landingReceiptDigest,
        deleteIntentDigest,
        deletedAt: new Date().toISOString(),
      });
      const after = await run(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['volume', 'inspect', volumeName]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
      }));
      if (!isExactDockerVolumeAbsent(exactDockerWorkspaceCommandObservation(after), volumeName)) {
        return null;
      }
      const absence = createExecutionEffectDockerResourceAbsenceReceiptV1({
        resourceKind,
        resourceName: volumeName,
        resourceIdentityDigest: identityDigest,
        deleteIntentDigest,
        deletionReceiptDigest: deletion.receiptDigest,
        observedAt: new Date().toISOString(),
      });
      return Object.freeze({ disposition: 'EXECUTED_DELETION' as const, deletion, absence });
    };
    try {
      const landingArtifactKey =
        `effect-landing-${committed.receipt.transaction.transactionDigest.slice(7, 39)}`;
      try {
        return committed.storeAdapter.readAcceptedAuthority(landingArtifactKey);
      } catch { /* Release cleanup may still be in progress. */ }
      let progress = committed.storeAdapter.readLatestReleaseProgress();
      if (!progress) {
        const preparedPublication = committed.storeAdapter.publishReleasePrepared({
          lifecycleAuthorityDigest: committed.captured.lifecycleAuthority
            .authorityDigest as Sha256Digest,
          landingReceipt: committed.receipt,
          terminalSeal: committed.terminalSeal,
          // Stable replay authority: this timestamp is part of the immutable committed seal.
          progressedAt: committed.terminalSeal.committedAt,
        });
        progress = durableProgress(preparedPublication);
      }
      for (;;) {
        if (!progress) return null;
        if (progress.state === 'RELEASED') break;
        if (progress.state === 'RELEASE_PREPARED'
          || progress.state === 'CONTAINER_ABSENT'
          || progress.state === 'WORKSPACE_VOLUME_ABSENT') {
          const resourceKind = progress.state === 'RELEASE_PREPARED'
            ? 'provider-container' as const
            : progress.state === 'CONTAINER_ABSENT'
              ? 'workspace-volume' as const : 'dependency-volume' as const;
          progress = durableProgress(committed.storeAdapter.publishCleanupDeleteIntent({
            mode: 'RELEASE', resourceKind, progressedAt: new Date().toISOString(),
          }));
          continue;
        }
        if (!progress.deleteIntentDigest) return null;
        let evidence: Parameters<
          ExecutionEffectStoreAdapterV1['publishCleanupAbsence']
        >[0]['evidence'] | null = null;
        if (progress.state === 'CONTAINER_DELETE_INTENT') {
          evidence = await deleteContainer(progress.deleteIntentDigest);
        } else if (progress.state === 'WORKSPACE_VOLUME_DELETE_INTENT') {
          evidence = await deleteVolume(
            'workspace-volume',
            ready.workspacePlan.volumeName,
            ready.presentObservation.volumeIdentityDigest as Sha256Digest,
            committed.captured.workspacePlan.workspaceLabels,
            committed.captured.workspacePlan.workspaceLabelsDigest as Sha256Digest,
            committed.captured.workspacePlan.workspaceResourceInstanceDigest as Sha256Digest,
            committed.captured.workspacePlan.mountPlanDigest as Sha256Digest,
            progress.deleteIntentDigest,
          );
        } else if (progress.state === 'DEPENDENCY_VOLUME_DELETE_INTENT') {
          evidence = await deleteVolume(
            'dependency-volume',
            ready.workspacePlan.dependencyPlan.volumeName,
            ready.dependencyAuthority.volumeIdentityDigest as Sha256Digest,
            committed.captured.workspacePlan.dependencyLabels,
            committed.captured.workspacePlan.dependencyLabelsDigest as Sha256Digest,
            committed.captured.workspacePlan.dependencyResourceInstanceDigest as Sha256Digest,
            committed.captured.workspacePlan.dependencyPlanDigest as Sha256Digest,
            progress.deleteIntentDigest,
          );
        } else if (progress.state === 'DEPENDENCY_VOLUME_ABSENT') {
          progress = durableProgress(committed.storeAdapter.publishCleanupTerminal({
            mode: 'RELEASE', progressedAt: new Date().toISOString(),
          }));
          continue;
        } else {
          return null;
        }
        if (!evidence) return null;
        progress = durableProgress(committed.storeAdapter.publishCleanupAbsence({
          mode: 'RELEASE', evidence, progressedAt: new Date().toISOString(),
        }));
      }
      const outcomes = committed.storeAdapter.readReleaseOutcomes();
      if (outcomes.releasedProgressDigest !== progress.progressDigest) return null;
      const released = committed.storeAdapter.projectWorkspaceReleaseFromDurableCleanup();
      if (released.state !== 'RELEASED') return null;
      const published = committed.storeAdapter.publishLanding({
        preparedWorkspace,
        final: committed.captured.finalManifest,
        finalCapturedAt: committed.captured.finalManifest.captureAuthority.completedAt,
        terminalSeal: committed.terminalSeal,
        workspaceRelease: released.workspaceRelease,
        landingArtifactKey,
      });
      const reread = committed.storeAdapter.readAcceptedAuthority(landingArtifactKey);
      if (canonicalJson(reread.projection) !== canonicalJson(published.projection)
        || canonicalJson(reread.binding) !== canonicalJson(published.binding)
        || reread.verifiedLanding.landing.receiptDigest
          !== published.verifiedLanding.landing.receiptDigest) return null;
      return reread;
    } catch (error) {
      debugLog('docker-backend:exact-effect-release-hold', error);
      return null;
    }
  }

  private async resumeExactDockerEffectRelease(
    scope: PreparedExactDockerCustodyScope,
  ): Promise<ExecutionEffectStoreAcceptedAuthorityV1 | null> {
    const releasePreparedKey = executionEffectStoreCleanupArtifactKeyV1(
      scope.admissionRef.admissionReceiptDigest,
      'RELEASE',
      'RELEASE_PREPARED',
    );
    const releasePrepared = scope.store.readArtifactReceipt({
      identity: scope.identity,
      policy: scope.policy,
      artifactClass: 'execution-effect-lifecycle-authority',
      artifactKey: releasePreparedKey,
    });
    // Absence means cleanup never crossed its first durable boundary, so normal
    // READY rehydration remains the only legal path. Once the receipt exists,
    // every parse/reread failure below is a typed recovery HOLD rather than a
    // fallback to live-volume rehydration after a possible delete.
    if (!releasePrepared) return null;
    const storeAdapter = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: scope.store,
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      platform: process.env.WSL_DISTRO_NAME ? 'wsl2-linux' : 'linux',
      now: () => new Date().toISOString(),
    });
    const recovery = storeAdapter.readReleaseRecoveryAuthority();
    if (!recovery) return null;
    const ready = recovery.readyLifecycleAuthority;
    const captured: ExactDockerEffectReadyAuthorityV1 = Object.freeze({
      state: 'READY_FOR_LANDING',
      landingAuthorityDigest: ready.landingAuthorityDigest,
      baselineManifest: ready.baselineManifest,
      finalManifest: ready.finalManifest,
      decision: ready.decision,
      exclusiveAttachmentReceipt: ready.postProviderAttachmentReceipt,
      quiescenceSeal: ready.quiescenceSeal,
      finalCaptureReceipt: ready.finalCaptureReceipt,
      workspacePlan: ready.workspacePlan,
      dependencyAuthority: ready.dependencyAuthority,
      workspaceSnapshot: ready.workspaceSnapshot,
      lifecycleAuthority: ready,
      session: null,
    });
    return this.releaseExactDockerEffectLanding(scope, Object.freeze({
      captured,
      receipt: recovery.landingReceipt,
      terminalSeal: recovery.terminalSeal,
      storeAdapter,
      containerIdentityDigest:
        ready.providerStopped.containerIdentityDigest as Sha256Digest,
    }));
  }

  private openExactDockerRecoveryStore(): Readonly<{
    store: TaskAttemptCustodyStore;
    policy: TaskAttemptCustodyPolicyV2;
  }> | null {
    const canonicalProjectRoot = canonicalExactDockerProjectRoot(this.projectDir);
    const absoluteRoot = resolveExactDockerCustodyRoot(canonicalProjectRoot, {
      platform: this.platform,
      env: process.env,
      ...(this.custodyStateDir ? { stateDir: this.custodyStateDir } : {}),
    });
    if (!existsSync(absoluteRoot)) return null;
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async () => {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
          true,
        );
      },
    });
    return Object.freeze({
      store: TaskAttemptCustodyStore.open({
        adapter,
        absoluteRoot,
        canonicalProjectRoot,
        projectId: attendedExecutionProjectId(this.projectDir),
        create: false,
      }),
      policy: createExactDockerCustodyPolicy(),
    });
  }

  private reconstructExactDockerRecoveryScope(
    store: TaskAttemptCustodyStore,
    policy: TaskAttemptCustodyPolicyV2,
    admitted: ExactDockerDurableAdmissionV2,
  ): PreparedExactDockerCustodyScope {
    const durableSnapshot = store.readTaskSnapshot({
      identity: admitted.ref.identity,
      policy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    const taskSnapshot = durableSnapshot
      ? parseExactDockerDispatchSnapshot(durableSnapshot.bytes) : null;
    const access = store.openAttemptAccess({
      identity: admitted.ref.identity,
      policy,
      admissionReceiptDigest: admitted.ref.admissionReceiptDigest,
    });
    if (!taskSnapshot || !access
      || taskSnapshot.dispatchRequestId !== admitted.ref.dispatchRequestId
      || taskSnapshot.projectId !== admitted.ref.identity.projectId
      || taskSnapshot.taskId !== admitted.ref.identity.taskId
      || taskSnapshot.projectId !== attendedExecutionProjectId(this.projectDir)
      || durableSnapshot?.proof.sha256 !== admitted.admission.taskSnapshot.sha256) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    // Restart recovery consumes the provider/model authority that was admitted
    // into the durable task snapshot. It must not re-resolve today's registry,
    // command installation or credentials: recovery never starts a provider,
    // and those mutable capabilities may legitimately differ after a restart.
    const provider = taskSnapshot.dispatch.provider;
    return {
      store,
      policy,
      identity: admitted.ref.identity,
      admission: admitted.admission,
      admissionRef: admitted.ref,
      access,
      taskSnapshot,
      model: taskSnapshot.dispatch.model,
      provider,
      providerSpec: null,
      providerAuth: null,
      execution: taskSnapshot.dispatch.execution,
      state: 'RELEASED',
      launch: null,
      mountTransferReceipt: null,
    };
  }

  private readExactDockerRecoveryProviderExecution(
    scope: PreparedExactDockerCustodyScope,
    start: ExactDockerProviderStartBundleV2,
  ): Readonly<{ ref: Sha256Digest; digest: Sha256Digest }> {
    const terminal = scope.store.readDispatchAuthority({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
    });
    const observation = scope.store.readDispatchObservationByClass({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass: 'PROVIDER_EXECUTION',
    });
    let decoded: unknown = null;
    try {
      decoded = observation
        ? JSON.parse(Buffer.from(observation.bytes).toString('utf8')) : null;
    } catch { decoded = null; }
    const record = exactOwnDataRecord(decoded, [
      'schemaVersion', 'kind', 'admissionRefDigest', 'taskSnapshotSha256',
      'providerInvocationDigest', 'authorityLabelsDigest',
      'executionCommitNonceSha256', 'providerExecutionAttemptId',
      'providerExecutionAttemptIdentityDigest', 'dispatchReceiptDigest',
      'releaseReceiptRef', 'releaseReceiptDigest', 'projectionFence',
      'startAuthorizationDigest', 'providerStartAckBytesSha256', 'childPid',
      'state', 'providerState', 'containerId',
      'providerExecutionAckBytesSha256', 'observedAt',
    ]);
    if (!observation || !record
      || terminal.state !== 'terminal' || terminal.authority.state !== 'RELEASED'
      || record.schemaVersion !== 2
      || record.kind !== 'exact-docker-pid1-provider-execution-ack'
      || record.admissionRefDigest !== scope.admissionRef.refDigest
      || record.taskSnapshotSha256 !== scope.admission.taskSnapshot.sha256
      || record.providerInvocationDigest !== start.providerInvocationDigest
      || record.authorityLabelsDigest !== start.authorityLabelsDigest
      || record.executionCommitNonceSha256 !== start.executionCommitNonceSha256
      || record.providerExecutionAttemptId !== start.providerExecutionAttemptId
      || record.providerExecutionAttemptIdentityDigest
        !== start.providerExecutionAttemptIdentityDigest
      || record.dispatchReceiptDigest !== terminal.authority.receiptDigest
      || record.releaseReceiptRef !== terminal.authority.releaseReceiptDigest
      || record.releaseReceiptDigest !== terminal.authority.releaseEvidenceDigest
      || record.projectionFence !== terminal.authority.projectionFence
      || record.startAuthorizationDigest !== start.startAuthorizationDigest
      || !isExactDigest(record.providerStartAckBytesSha256)
      || !Number.isSafeInteger(record.childPid) || Number(record.childPid) <= 0
      || record.state !== 'PROVIDER_PROCESS_SPAWNED'
      || record.providerState !== 'STARTED'
      || record.containerId !== terminal.authority.backendExecutionId
      || !isExactDigest(record.providerExecutionAckBytesSha256)
      || typeof record.observedAt !== 'string'
      || observation.receipt.observedAt !== record.observedAt
      || !Number.isFinite(Date.parse(record.observedAt))
      || Date.parse(record.observedAt) < Date.parse(start.observedAt)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_PROVIDER_START_RECONCILIATION_REQUIRED',
        true,
      );
    }
    return Object.freeze({
      ref: observation.receipt.receiptDigest,
      digest: observation.receipt.evidenceDigest,
    });
  }

  private readExactDockerRecoveryProviderExit(
    scope: PreparedExactDockerCustodyScope,
  ): ExactDockerProviderExitObservationRefV2 | null {
    const observation = scope.store.readDispatchObservationByClass({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass: 'PROVIDER_EXIT',
    });
    if (!observation) return null;
    let decoded: unknown = null;
    try { decoded = JSON.parse(Buffer.from(observation.bytes).toString('utf8')); }
    catch { decoded = null; }
    const record = exactOwnDataRecord(decoded, [
      'schemaVersion', 'kind', 'admissionRefDigest', 'containerId', 'exitCode',
      'dockerWaitProcessExitCode', 'dockerWaitSignal', 'stdoutSha256',
      'stderrSha256', 'waitEvidenceDigest', 'observedAt',
    ]);
    if (!record || record.schemaVersion !== 2
      || record.kind !== 'exact-docker-provider-exit'
      || record.admissionRefDigest !== scope.admissionRef.refDigest
      || typeof record.containerId !== 'string'
      || !Number.isSafeInteger(record.exitCode)
      || !isExactDigest(record.waitEvidenceDigest)
      || typeof record.observedAt !== 'string'
      || observation.receipt.observedAt !== record.observedAt) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_PROVIDER_EXIT_OBSERVATION_INVALID',
        true,
      );
    }
    const providerExit: ExactDockerProviderExitObservationRefV2 = Object.freeze({
      containerId: record.containerId,
      exitCode: Number(record.exitCode),
      observedAt: record.observedAt,
      waitEvidenceDigest: record.waitEvidenceDigest,
      observationReceiptDigest: observation.receipt.receiptDigest,
      observationEvidenceDigest: observation.receipt.evidenceDigest,
    });
    this.rereadExactProviderExitObservation(scope, providerExit);
    return providerExit;
  }

  private async rehydrateExactDockerEffectLaunch(
    scope: PreparedExactDockerCustodyScope,
    terminal: Extract<
      ReturnType<TaskAttemptCustodyStore['readDispatchAuthority']>,
      { readonly state: 'terminal' }
    >['authority'] & { readonly state: 'RELEASED' },
    start: ExactDockerProviderStartBundleV2,
  ): Promise<void> {
    const lifecyclePlatform = process.env.WSL_DISTRO_NAME
      ? 'wsl2-linux' as const : 'linux' as const;
    const lifecycleStoreAdapter = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: scope.store,
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      platform: lifecyclePlatform,
      now: () => new Date().toISOString(),
    });
    const latest = lifecycleStoreAdapter.readLatestLifecycleAuthority();
    const preparedLifecycle = lifecycleStoreAdapter.readLifecycleAuthority('PREPARED');
    if (!latest || !preparedLifecycle
      || (latest.state !== 'PROVIDER_START_AUTHORIZED'
        && latest.state !== 'READY_FOR_LANDING')) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const workspaceInventory = exactDockerWorkspaceInventoryFromPaths(
      latest.workspacePlan.inventoryPaths,
    );
    if (!workspaceInventory) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const imageAuthority: ExactDockerEffectImageAuthorityV1 = Object.freeze({
      imageReference: latest.imageObservation.imageReference,
      imageDigest: latest.imageObservation.imageDigest as Sha256Digest,
      imageIdentityDigest: latest.imageObservation.imageIdentityDigest as Sha256Digest,
    });
    const lifecycleAdapter = createExactDockerEffectLifecycleAdapterV1({
      canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
      imageAuthority,
      inventory: workspaceInventory,
      runner: this.exactWorkspaceCommandRunner,
      nowIso: () => new Date().toISOString(),
    });
    let clockMs = Date.now();
    const clock: ExecutionEffectNativeAdapterClockV1 = Object.freeze({
      nowIso(): string {
        clockMs = Date.now();
        return new Date(clockMs).toISOString();
      },
      nowUnixMs(): number { return clockMs; },
    });
    const limits: ExecutionEffectNativeAdapterLimitsV1 = Object.freeze({
      maxStagedChunkBytes:
        scope.policy.artifactLimits['execution-effect-staged-content'].maxBytes,
      maxOperations: EXECUTION_EFFECT_LANDING_HARD_MAX_OPERATIONS,
      maxPlanEnvelopeBytes: EXECUTION_EFFECT_LANDING_HARD_MAX_PLAN_ENVELOPE_BYTES,
      sourceReadTimeoutMs: 60_000,
      dockerTimeoutMs: 60_000,
      dockerReceiptMaxBytes: 1024 * 1024,
    });
    const custodyRoot = resolveExactDockerCustodyRoot(this.projectDir, {
      platform: this.platform,
      env: process.env,
      ...(this.custodyStateDir ? { stateDir: this.custodyStateDir } : {}),
    });
    const stagingRoot = join(
      custodyRoot,
      'execution-effect-staging',
      scope.identity.attemptId,
    );
    mkdirSync(stagingRoot, { recursive: true, mode: 0o700 });
    chmodSync(stagingRoot, 0o700);
    const workspaceRuntime: ExecutionEffectDockerWorkspaceRuntimeV1 = Object.freeze({
      version: 1,
      state: 'SEALED',
      imageReference: imageAuthority.imageReference,
      imageDigest: imageAuthority.imageDigest,
      volumeName: latest.workspacePlan.volumeName,
      volumeNameDigest: latest.workspaceSnapshot.workspaceResource.volumeNameDigest,
      volumeIdentityDigest: latest.creationReceipt.volumeIdentityDigest,
      mountTarget: '/workspace',
      mountIdentityDigest: latest.workspacePlan.mountPlanDigest,
      workspaceResourceDigest: latest.workspaceSnapshot.workspaceResource.resourceDigest,
      workspaceSnapshotSealDigest: latest.workspaceSnapshot.sealDigest,
      manifestDigest: latest.baselineManifest.digest as ExecutionEffectPersistenceDigest,
    });
    const provisional = await createExecutionEffectLandingNativeAdapterV1(Object.freeze({
      platform: process.env.WSL_DISTRO_NAME ? 'wsl' as const : 'linux' as const,
      canonicalProjectRoot: canonicalExactDockerProjectRoot(this.projectDir),
      hostPrivateStagingRoot: stagingRoot,
      attempt: Object.freeze({
        projectId: scope.identity.projectId,
        taskId: scope.identity.taskId,
        attemptId: scope.identity.attemptId,
        generation: scope.identity.generation,
      }),
      identity: scope.identity,
      admission: scope.admission,
      policy: scope.policy,
      workspaceSnapshot: latest.workspaceSnapshot,
      workspaceRuntime,
      sourceAuthorities: Object.freeze([]),
      store: scope.store,
      clock,
      limits,
    }));
    if (provisional.state !== 'READY') {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const storeAdapter = createExecutionEffectStoreAdapterV1({
      store: scope.store,
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      projectRootIdentityDigest:
        provisional.adapter.capability.projectRootIdentityDigest as Sha256Digest,
      platform: latest.workspaceSnapshot.platform,
      now: () => new Date().toISOString(),
    });
    const preparedWorkspace = storeAdapter.readPreparedWorkspace();
    if (!preparedWorkspace) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const rehydrated = await rehydrateExecutionEffectDockerLifecycleV1({
      authority: latest,
      adapter: lifecycleAdapter,
      clock: Object.freeze({ nowIso: () => new Date().toISOString() }),
    });
    if (rehydrated.state !== 'REHYDRATED' || rehydrated.phase !== latest.state) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    let authorized: ExactDockerEffectAuthorizedV1 | null = null;
    let ready: ExactDockerEffectReadyAuthorityV1 | null = null;
    if (latest.state === 'PROVIDER_START_AUTHORIZED'
      && rehydrated.phase === 'PROVIDER_START_AUTHORIZED') {
      authorized = Object.freeze({
        state: 'PROVIDER_START_AUTHORIZED',
        providerStartAuthorityDigest: latest.providerStartAuthorityDigest,
        exclusiveAttachmentReceipt: latest.preProviderAttachmentReceipt,
        baselineRevalidationReceipt: latest.baselineRevalidationReceipt,
        authorizedAt: latest.authorizedAt,
        workspacePlan: latest.workspacePlan,
        dependencyAuthority: latest.dependencyAuthority,
        workspaceSnapshot: latest.workspaceSnapshot,
        lifecycleAuthority: latest,
        session: rehydrated.session,
      });
    } else if (latest.state === 'READY_FOR_LANDING'
      && rehydrated.phase === 'READY_FOR_LANDING') {
      ready = Object.freeze({
        state: 'READY_FOR_LANDING',
        landingAuthorityDigest: latest.landingAuthorityDigest,
        baselineManifest: latest.baselineManifest,
        finalManifest: latest.finalManifest,
        decision: latest.decision,
        exclusiveAttachmentReceipt: latest.postProviderAttachmentReceipt,
        quiescenceSeal: latest.quiescenceSeal,
        finalCaptureReceipt: latest.finalCaptureReceipt,
        workspacePlan: latest.workspacePlan,
        dependencyAuthority: latest.dependencyAuthority,
        workspaceSnapshot: latest.workspaceSnapshot,
        lifecycleAuthority: latest,
        session: rehydrated.session,
      });
    } else {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const prepared: ExactDockerEffectPreparedAuthorityV1 = Object.freeze({
      state: 'PREPARED',
      preparationAuthorityDigest: preparedLifecycle.preparationAuthorityDigest,
      workspacePlan: preparedLifecycle.workspacePlan,
      imageObservation: preparedLifecycle.imageObservation,
      dependencyAuthority: preparedLifecycle.dependencyAuthority,
      volumeCreationReceipt: preparedLifecycle.creationReceipt,
      populationReceipt: preparedLifecycle.populationReceipt,
      baselineManifest: preparedLifecycle.baselineManifest,
      workspaceResource: preparedLifecycle.workspaceResource,
      workspaceSnapshot: preparedLifecycle.workspaceSnapshot,
      lifecycleAuthority: preparedLifecycle,
      session: null,
    });
    const expectedContainerName = `deckent-x-${scope.identity.attemptId
      .replace(/[^a-zA-Z0-9_.-]/gu, '').slice(-40)}`;
    if (start.containerId !== terminal.backendExecutionId
      || (latest.state === 'READY_FOR_LANDING'
        && latest.providerStopped.containerName !== expectedContainerName)) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    scope.launch = {
      taskId: scope.identity.taskId,
      image: imageAuthority.imageReference,
      dockerBaseArgs: Object.freeze([]),
      providerInvocationDigest: scope.taskSnapshot.dispatch.providerInvocationDigest,
      releaseIntentToken: new Uint8Array(),
      releaseIntentTokenSha256: scope.taskSnapshot.dispatch.releaseIntentNonceSha256,
      releaseCommitToken: new Uint8Array(),
      releaseCommitTokenSha256: scope.taskSnapshot.dispatch.releaseCommitNonceSha256,
      providerStartToken: new Uint8Array(),
      providerStartTokenSha256: scope.taskSnapshot.dispatch.providerStartNonceSha256,
      executionCommitToken: new Uint8Array(),
      executionCommitTokenSha256: scope.taskSnapshot.dispatch.executionCommitNonceSha256,
      expectedContainerName,
      workspaceVolumeName: latest.workspacePlan.volumeName,
      dependencyVolumeName: latest.workspacePlan.dependencyPlan.volumeName,
      workspaceInventory,
      effect: {
        imageAuthority,
        captureLimits: latest.captureLimits,
        lifecycleAdapter,
        prepared,
        preparedWorkspace,
        storeAdapter,
        stagingRoot,
        clock,
        limits,
        landingCapabilityDigest:
          provisional.adapter.capability.capabilityDigest as Sha256Digest,
        authorized,
        ready,
      },
      authorityLabelsDigest: start.authorityLabelsDigest,
      spawnOutcome: Object.freeze({
        containerId: terminal.backendExecutionId,
        imageDigest: terminal.releaseEvidence.imageDigest,
      }),
    };
  }

  private clearExactDockerLiveAttempt(admissionRefDigest: Sha256Digest): void {
    this.exactCustodyCompletions.delete(admissionRefDigest);
    this.exactCustodyProviderStarts.delete(admissionRefDigest);
    this.exactCustodyProviderExecutions.delete(admissionRefDigest);
  }

  /**
   * Canonical production consumer for exact monitor completion. A completed
   * provider attempt is not accepted by the monitor's self-report: it must
   * traverse the same durable ingress authority used by explicit callers.
   */
  private observeExactDockerCompletionAcceptance(
    scope: PreparedExactDockerCustodyScope,
    query: ExactDockerCustodyTerminalQueryV2,
    completion: Promise<ExactDockerCustodyCompletionV2>,
  ): void {
    const acceptance = completion.then(async observed => {
      if (observed.kind === 'capture-hold') {
        this.clearExactDockerLiveAttempt(scope.admissionRef.refDigest);
        return Object.freeze({
          kind: 'capture-hold' as const,
          reasonCode: observed.reasonCode,
          custodyRef: observed.custodyRef,
          releaseReceipt: observed.releaseReceipt,
          projectionFence: observed.projectionFence,
        });
      }
      const accepted = await this.acceptExactDockerCustodyResult({
        query,
        authority: this.exactCanonicalIngressAuthority(scope),
      });
      if (accepted.kind !== 'accepted-result') {
        this.clearExactDockerLiveAttempt(scope.admissionRef.refDigest);
      }
      return accepted;
    });
    this.exactCustodyAutomaticAcceptances.set(scope.admissionRef.refDigest, acceptance);
    void acceptance.catch(error => {
      this.clearExactDockerLiveAttempt(scope.admissionRef.refDigest);
      debugLog('docker-backend:exact-custody-monitor-acceptance', error);
    });
  }

  /**
   * Owner-authorized containment stops only the exact durable container and
   * records its terminal observation. It never lands effects, accepts a
   * result, removes the container/volumes, or dispatches replacement work.
   */
  private async containExactDockerCustodyAttempt(
    scope: PreparedExactDockerCustodyScope,
    terminal: Extract<
      ReturnType<TaskAttemptCustodyStore['readDispatchAuthority']>,
      { readonly state: 'terminal' }
    >['authority'] & { readonly state: 'RELEASED' },
    start: ExactDockerProviderStartBundleV2,
    recoveredExit: ExactDockerProviderExitObservationRefV2 | null,
  ): Promise<ExactDockerProviderExitObservationRefV2> {
    if (recoveredExit) return recoveredExit;
    await this.rehydrateExactDockerEffectLaunch(scope, terminal, start);
    const containerId = terminal.backendExecutionId;
    if (typeof containerId !== 'string') {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    const inspect = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker' as const,
      args: Object.freeze([
        'inspect', '--format', '{{.State.Running}}|{{.State.ExitCode}}', containerId,
      ]),
      stdin: Buffer.alloc(0),
      timeoutMs: 10_000,
      stdoutCeiling: 1024,
      stderrCeiling: 64 * 1024,
    }));
    const state = exactDockerWorkspaceCommandSucceeded(inspect)
      ? parseInspectOutput(exactDockerWorkspaceCommandStdout(inspect)) : null;
    if (!state) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
        true,
      );
    }
    if (state.running) {
      const stopped = await this.exactWorkspaceCommandRunner(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze([
          'stop', `--time=${this.gracefulTimeoutSeconds}`, containerId,
        ]),
        stdin: Buffer.alloc(0),
        timeoutMs: (this.gracefulTimeoutSeconds + 10) * 1_000,
        stdoutCeiling: 1024,
        stderrCeiling: 64 * 1024,
      }));
      if (!exactDockerWorkspaceCommandSucceeded(stopped)) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
          true,
        );
      }
    }
    const wait = await this.exactWorkspaceCommandRunner(Object.freeze({
      command: 'docker' as const,
      args: Object.freeze(['wait', containerId]),
      stdin: Buffer.alloc(0),
      timeoutMs: 30_000,
      stdoutCeiling: 1024,
      stderrCeiling: 64 * 1024,
    }));
    const exitText = exactDockerWorkspaceCommandStdout(wait).trim();
    const exitCode = exactDockerWorkspaceCommandSucceeded(wait)
      && /^(?:0|[1-9][0-9]{0,2})$/u.test(exitText)
      ? Number(exitText) : Number.NaN;
    if (!Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255) {
      throw new ExactDockerCustodyFailure(
        'EXACT_DOCKER_PROVIDER_EXIT_OBSERVATION_INVALID',
        true,
      );
    }
    const observedAt = new Date().toISOString();
    const waitStdout = exactDockerWorkspaceCommandStdout(wait);
    const waitStderr = Buffer.from(wait.stderr).toString('utf8');
    const waitEvidence = Object.freeze({
      admissionRefDigest: scope.admissionRef.refDigest,
      containerId,
      exitCode,
      dockerWaitProcessExitCode: 0 as const,
      dockerWaitSignal: null,
      stdoutSha256: exactCustodyDigest(waitStdout),
      stderrSha256: exactCustodyDigest(waitStderr),
      observedAt,
    });
    const bundle: ExactDockerProviderExitBundleV2 = Object.freeze({
      schemaVersion: 2,
      kind: 'exact-docker-provider-exit',
      ...waitEvidence,
      waitEvidenceDigest: exactCustodyJsonDigest(waitEvidence),
    });
    const observation = this.publishAndRereadExactObservation(
      scope,
      'PROVIDER_EXIT',
      bundle,
      observedAt,
    );
    const providerExit = Object.freeze({
      containerId,
      exitCode,
      observedAt,
      waitEvidenceDigest: bundle.waitEvidenceDigest,
      observationReceiptDigest: observation.receiptDigest,
      observationEvidenceDigest: observation.evidenceDigest,
    });
    this.rereadExactProviderExitObservation(scope, providerExit);
    return providerExit;
  }

  private exactDockerRecoveryHasProviderObservation(
    scope: PreparedExactDockerCustodyScope,
  ): boolean {
    return (['PROVIDER_START', 'PROVIDER_EXECUTION', 'PROVIDER_EXIT'] as const).some(
      observationClass => scope.store.readDispatchObservationByClass({
        admissionRef: scope.admissionRef,
        policy: scope.policy,
        observationClass,
      }) !== null,
    );
  }

  private async exactDockerRecoveryResourcesAreAbsent(
    scope: PreparedExactDockerCustodyScope,
  ): Promise<boolean> {
    const containerName = `deckent-x-${scope.identity.attemptId
      .replace(/[^a-zA-Z0-9_.-]/gu, '').slice(-40)}`;
    const workspaceVolumeName = exactDockerWorkspaceVolumeName({
      identity: scope.identity,
      admissionRefDigest: scope.admissionRef.refDigest,
    });
    const dependencyVolumeName = exactDockerDependencyVolumeName({
      identity: scope.identity,
      admissionRefDigest: scope.admissionRef.refDigest,
    });
    const observations = await Promise.all([
      this.exactWorkspaceCommandRunner(Object.freeze({
        command: 'docker' as const,
        args: Object.freeze(['inspect', '--type', 'container', containerName]),
        stdin: Buffer.alloc(0), timeoutMs: 10_000,
        stdoutCeiling: 8 * 1024 * 1024, stderrCeiling: 64 * 1024,
      })),
      ...[workspaceVolumeName, dependencyVolumeName].map(volumeName => (
        this.exactWorkspaceCommandRunner(Object.freeze({
          command: 'docker' as const,
          args: Object.freeze(['volume', 'inspect', volumeName]),
          stdin: Buffer.alloc(0), timeoutMs: 10_000,
          stdoutCeiling: 1024 * 1024, stderrCeiling: 64 * 1024,
        }))
      )),
    ]);
    return isExactDockerContainerAbsent(
      exactDockerWorkspaceCommandObservation(observations[0]!), containerName,
    ) && isExactDockerVolumeAbsent(
      exactDockerWorkspaceCommandObservation(observations[1]!), workspaceVolumeName,
    ) && isExactDockerVolumeAbsent(
      exactDockerWorkspaceCommandObservation(observations[2]!), dependencyVolumeName,
    );
  }

  private completePendingExactDockerNoEffect(
    scope: PreparedExactDockerCustodyScope,
    transition: Extract<
      ReturnType<TaskAttemptCustodyStore['readDispatchAuthority']>,
      { readonly state: 'transition-pending' }
    >['transition'] & { readonly state: 'NOT_DISPATCHED_CLAIMED' },
  ): boolean {
    const observation = scope.store.readDispatchObservationByClass({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass: 'NO_EFFECT',
    });
    let decoded: unknown = null;
    try {
      decoded = observation
        ? JSON.parse(Buffer.from(observation.bytes).toString('utf8')) : null;
    } catch { decoded = null; }
    const record = exactOwnDataRecord(decoded, [
      'schemaVersion', 'kind', 'admissionRefDigest', 'reasonCode', 'containerName',
      'daemonContainerState', 'providerReleaseState', 'daemonInspectionReceiptDigest',
      'providerReleaseProbeEvidenceDigest', 'backendProbeEvidenceDigest',
      'containmentEvidenceDigest', 'preMountCompensation', 'observedAt',
    ]);
    if (!observation || !record || transition.reasonCode === null
      || record.schemaVersion !== 2 || record.kind !== 'exact-docker-no-effect'
      || record.admissionRefDigest !== scope.admissionRef.refDigest
      || record.reasonCode !== transition.reasonCode
      || record.daemonContainerState !== 'ABSENT'
      || record.providerReleaseState !== 'ABSENT'
      || !isExactDigest(record.daemonInspectionReceiptDigest)
      || !isExactDigest(record.providerReleaseProbeEvidenceDigest)
      || !isExactDigest(record.backendProbeEvidenceDigest)
      || !isExactDigest(record.containmentEvidenceDigest)
      || typeof record.observedAt !== 'string'
      || record.observedAt !== observation.receipt.observedAt) return false;
    const authority = scope.store.settleNotDispatched({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      reasonCode: transition.reasonCode,
      noEffectObservation: {
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-no-effect-observation',
        daemonContainerState: 'ABSENT',
        providerReleaseState: 'ABSENT',
        daemonInspectionReceiptDigest: record.daemonInspectionReceiptDigest,
        providerReleaseProbeEvidenceDigest: record.providerReleaseProbeEvidenceDigest,
        backendProbeEvidenceDigest: record.backendProbeEvidenceDigest,
        containmentEvidenceDigest: record.containmentEvidenceDigest,
        observationReceiptDigest: observation.receipt.receiptDigest,
        observationEvidenceDigest: observation.receipt.evidenceDigest,
        observedAt: record.observedAt,
      },
    });
    const reread = scope.store.readDispatchAuthority({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
    });
    return reread.state === 'terminal' && reread.authority.state === 'NOT_DISPATCHED'
      && reread.authority.receiptDigest === authority.receiptDigest;
  }

  private async reconcileExactDockerPreProviderAdmission(
    scope: PreparedExactDockerCustodyScope,
    authorityRead: ReturnType<TaskAttemptCustodyStore['readDispatchAuthority']>,
  ): Promise<boolean> {
    if (authorityRead.state === 'ambiguous') return false;
    if (authorityRead.state === 'transition-pending') {
      if (authorityRead.transition.state !== 'NOT_DISPATCHED_CLAIMED'
        || authorityRead.mountEffectState !== 'ABSENT'
        || this.exactDockerRecoveryHasProviderObservation(scope)) return false;
      return this.completePendingExactDockerNoEffect(
        scope,
        authorityRead.transition as typeof authorityRead.transition & {
          readonly state: 'NOT_DISPATCHED_CLAIMED';
        },
      );
    }
    if (authorityRead.state !== 'absent'
      || this.exactDockerRecoveryHasProviderObservation(scope)) return false;
    const storeAdapter = createExecutionEffectLifecycleStoreAdmissionAdapterV1({
      store: scope.store,
      identity: scope.identity,
      policy: scope.policy,
      admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
      platform: process.env.WSL_DISTRO_NAME ? 'wsl2-linux' : 'linux',
      now: () => new Date().toISOString(),
    });
    const lifecycle = storeAdapter.readLatestLifecycleAuthority();
    const reasonCode = isExactDockerEffectLandingPolicyAdmitted(
      scope.execution.executionLandingPolicy,
    ) ? 'PRE_MOUNT_ABORTED' as const : 'EXECUTION_POLICY_REJECTED' as const;
    if (!lifecycle) {
      if (!(await this.exactDockerRecoveryResourcesAreAbsent(scope))) return false;
      const settled = await this.settleExactNoEffect(scope, reasonCode);
      return settled.kind === 'not-dispatched';
    }
    if (lifecycle.state !== 'ALLOCATING' && lifecycle.state !== 'PREPARED'
      && lifecycle.state !== 'PROVIDER_START_AUTHORIZED') return false;
    const resources = Object.freeze({
      workspace: Object.freeze({
        name: lifecycle.workspacePlan.volumeName,
        labels: lifecycle.workspacePlan.workspaceLabels,
        labelsDigest: lifecycle.workspacePlan.workspaceLabelsDigest as Sha256Digest,
        resourceInstanceDigest:
          lifecycle.workspacePlan.workspaceResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: lifecycle.workspacePlan.mountPlanDigest as Sha256Digest,
      }),
      dependency: Object.freeze({
        name: lifecycle.workspacePlan.dependencyPlan.volumeName,
        labels: lifecycle.workspacePlan.dependencyLabels,
        labelsDigest: lifecycle.workspacePlan.dependencyLabelsDigest as Sha256Digest,
        resourceInstanceDigest:
          lifecycle.workspacePlan.dependencyResourceInstanceDigest as Sha256Digest,
        mountPlanDigest: lifecycle.workspacePlan.dependencyPlanDigest as Sha256Digest,
      }),
    });
    const compensated = await this.compensateExactDockerEffectPreparation(
      scope,
      resources,
      storeAdapter,
    );
    if (!compensated) return false;
    const settled = await this.settleExactNoEffect(scope, reasonCode, compensated);
    return settled.kind === 'not-dispatched';
  }

  /**
   * Rebuild process-local exact-attempt monitors from the host-private Store.
   *
   * The Store remains the only durable authority. Discovery is deliberately
   * unavailable to leadership-free and containment sweeps: neither may adopt
   * a provider process or advance landing/release state.
   */
  private async reconcileExactDockerCustodyAdmissions(
    report: SpawnBackendRecoveryReport,
    options: SpawnBackendRecoveryOptions,
  ): Promise<void> {
    if (options.mode === 'terminal-only') return;
    const appendHold = (hold: SpawnBackendRecoveryHold): void => {
      const held = report.held ?? (report.held = []);
      if (held.some(existing => existing.dispatchRequestId === hold.dispatchRequestId
        && existing.authorityState === hold.authorityState
        && existing.reasonCode === hold.reasonCode)) return;
      held.push(Object.freeze({ ...hold }));
    };
    const opened = this.openExactDockerRecoveryStore();
    if (!opened) return;
    const discovered = opened.store.listDispatchAdmissions({
      policy: opened.policy,
      maxEntries: 100_000,
      maxNameBytes: 128,
      deadlineAt: new Date(Date.now() + 10_000).toISOString(),
    });
    for (const entry of discovered.entries) {
      let holdAuthorityState: SpawnBackendRecoveryHoldAuthorityState = 'RECOVERY_ENTRY_FAILED';
      let holdReasonCode: SpawnBackendRecoveryHoldReasonCode = 'ENTRY_RECONCILIATION_FAILED';
      try {
        if (entry.state !== 'admitted') {
          appendHold(Object.freeze({
            kind: 'spawn-backend-recovery-hold' as const,
            backend: 'docker' as const,
            dispatchRequestId: entry.reservation.dispatchRequestId,
            taskId: entry.reservation.identity.taskId,
            admissionRefDigest: null,
            authorityState: 'RESERVED_PENDING_ADMISSION' as const,
            reasonCode: 'ADMISSION_RECONCILIATION_REQUIRED' as const,
          }));
          debugLog(
            'docker-backend:exact-custody-recovery-entry-hold',
            `dispatchRequestId=${entry.reservation.dispatchRequestId};state=${entry.state}`,
          );
          continue;
        }
        const scope = this.reconstructExactDockerRecoveryScope(
          opened.store,
          opened.policy,
          entry,
        );
        const authorityRead = opened.store.readDispatchAuthority({
          admissionRef: entry.ref,
          policy: opened.policy,
        });
        holdAuthorityState = authorityRead.state === 'absent' ? 'DISPATCH_ABSENT'
          : authorityRead.state === 'transition-pending' ? 'DISPATCH_TRANSITION_PENDING'
            : authorityRead.state === 'ambiguous' ? 'DISPATCH_AMBIGUOUS'
              : 'DISPATCH_TERMINAL';
        if (authorityRead.state !== 'terminal') {
          holdReasonCode = 'PRE_PROVIDER_RECONCILIATION_REQUIRED';
          const reconciled = options.mode !== 'contain'
            && await this.reconcileExactDockerPreProviderAdmission(scope, authorityRead);
          if (reconciled) {
            if (!report.closedNotDispatched.includes(scope.identity.taskId)) {
              report.closedNotDispatched.push(scope.identity.taskId);
            }
          } else {
            appendHold(Object.freeze({
              kind: 'spawn-backend-recovery-hold' as const,
              backend: 'docker' as const,
              dispatchRequestId: entry.ref.dispatchRequestId,
              taskId: entry.ref.identity.taskId,
              admissionRefDigest: entry.ref.refDigest,
              authorityState: holdAuthorityState,
              reasonCode: holdReasonCode,
            }));
            debugLog(
              'docker-backend:exact-custody-recovery-entry-hold',
              `dispatchRequestId=${entry.ref.dispatchRequestId};authorityState=${authorityRead.state}`,
            );
          }
          continue;
        }
        holdReasonCode = 'TERMINAL_RECONCILIATION_REQUIRED';
        if (authorityRead.authority.state === 'NOT_DISPATCHED') {
        const lifecycleObservations = [
          'PROVIDER_START', 'PROVIDER_EXECUTION', 'PROVIDER_EXIT',
        ] as const;
        if (lifecycleObservations.some(observationClass => (
          opened.store.readDispatchObservationByClass({
            admissionRef: entry.ref,
            policy: opened.policy,
            observationClass,
          }) !== null
        ))) {
          throw new ExactDockerCustodyFailure(
            'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
            true,
          );
        }
        if (!report.closedNotDispatched.includes(entry.ref.identity.taskId)) {
          report.closedNotDispatched.push(entry.ref.identity.taskId);
        }
        continue;
        }
        const releasedAuthority = authorityRead.authority;
        if (releasedAuthority.state !== 'RELEASED'
          || typeof releasedAuthority.backendExecutionId !== 'string'
          || !isExactDockerEffectLandingPolicyAdmitted(
            scope.execution.executionLandingPolicy,
          )) {
          throw new ExactDockerCustodyFailure(
            'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
            true,
          );
        }
      const startObservation = opened.store.readDispatchObservationByClass({
        admissionRef: scope.admissionRef,
        policy: scope.policy,
        observationClass: 'PROVIDER_START',
      });
      if (!startObservation) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_PROVIDER_START_RECONCILIATION_REQUIRED',
          true,
        );
      }
      const providerStartReceipt = Object.freeze({
        ref: startObservation.receipt.receiptDigest,
        digest: startObservation.receipt.evidenceDigest,
      });
      const query: ExactDockerCustodyTerminalQueryV2 = Object.freeze({
        custodyRef: this.exactReleasedCustodyProjection(scope, providerStartReceipt),
        releaseReceipt: Object.freeze({
          ref: releasedAuthority.releaseReceiptDigest,
          digest: releasedAuthority.releaseEvidenceDigest,
        }),
        providerStartReceipt,
        projectionFence: releasedAuthority.projectionFence,
      });
      const start = this.rereadExactProviderStartObservation(scope, query);
      const providerExit = this.readExactDockerRecoveryProviderExit(scope);
      if (options.mode === 'contain') {
        await this.containExactDockerCustodyAttempt(
          scope,
          releasedAuthority,
          start,
          providerExit,
        );
        if (!report.adopted.includes(scope.identity.taskId)) {
          report.adopted.push(scope.identity.taskId);
        }
        continue;
      }
      const providerExecutionReceipt = this.readExactDockerRecoveryProviderExecution(
        scope,
        start,
      );
      if (providerExit) {
        const coldAccepted = this.readColdExactDockerAcceptedResult(
          scope,
          query,
          providerExit,
        );
        if (coldAccepted) {
          this.exactRecoveredAcceptedResults.set(scope.admissionRef.refDigest, Object.freeze({
            query,
            authority: this.exactCanonicalIngressAuthority(scope),
            accepted: coldAccepted,
          }));
          if (!report.closedAbsentAfterExit.includes(scope.identity.taskId)) {
            report.closedAbsentAfterExit.push(scope.identity.taskId);
          }
          continue;
        }
        const coldCompletion = this.readColdExactDockerCompletion(
          scope,
          query,
          providerExit,
        );
        if (coldCompletion) {
          const completion = Promise.resolve(coldCompletion);
          this.exactCustodyProviderStarts.set(
            scope.admissionRef.refDigest,
            providerStartReceipt,
          );
          this.exactCustodyProviderExecutions.set(
            scope.admissionRef.refDigest,
            providerExecutionReceipt,
          );
          this.exactCustodyCompletions.set(scope.admissionRef.refDigest, Object.freeze({
            scope,
            query,
            providerStartReceipt,
            providerExecutionReceipt,
            promise: completion,
          }));
          this.observeExactDockerCompletionAcceptance(scope, query, completion);
          if (!report.adopted.includes(scope.identity.taskId)) {
            report.adopted.push(scope.identity.taskId);
          }
          continue;
        }
        const resumedEffectRelease = await this.resumeExactDockerEffectRelease(scope);
        if (resumedEffectRelease) {
          const resumedCompletion = this.readColdExactDockerCompletion(
            scope,
            query,
            providerExit,
          );
          if (!resumedCompletion) {
            throw new ExactDockerCustodyFailure(
              'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
              true,
            );
          }
          const completion = Promise.resolve(resumedCompletion);
          this.exactCustodyProviderStarts.set(
            scope.admissionRef.refDigest,
            providerStartReceipt,
          );
          this.exactCustodyProviderExecutions.set(
            scope.admissionRef.refDigest,
            providerExecutionReceipt,
          );
          this.exactCustodyCompletions.set(scope.admissionRef.refDigest, Object.freeze({
            scope,
            query,
            providerStartReceipt,
            providerExecutionReceipt,
            promise: completion,
          }));
          this.observeExactDockerCompletionAcceptance(scope, query, completion);
          if (!report.adopted.includes(scope.identity.taskId)) {
            report.adopted.push(scope.identity.taskId);
          }
          continue;
        }
      }
      const existingCompletion = this.exactCustodyCompletions.get(
        scope.admissionRef.refDigest,
      );
      if (existingCompletion) {
        if (canonicalJson(existingCompletion.query) !== canonicalJson(query)
          || canonicalJson(existingCompletion.providerStartReceipt)
            !== canonicalJson(providerStartReceipt)
          || canonicalJson(existingCompletion.providerExecutionReceipt)
            !== canonicalJson(providerExecutionReceipt)) {
          throw new ExactDockerCustodyFailure(
            'EXACT_DOCKER_RESTART_RECONCILIATION_REQUIRED',
            true,
          );
        }
      } else {
        const recoveryKey = scope.admissionRef.refDigest;
        let setup = this.exactCustodyRecoverySetups.get(recoveryKey);
        if (!setup) {
          setup = (async () => {
            await this.rehydrateExactDockerEffectLaunch(
              scope,
              releasedAuthority,
              start,
            );
            if (this.exactCustodyCompletions.has(recoveryKey)) return;
            const completion = this.monitorExactDockerCustody(
              scope,
              releasedAuthority.backendExecutionId,
              query,
              providerExecutionReceipt,
              providerExit,
            );
            this.exactCustodyProviderStarts.set(recoveryKey, providerStartReceipt);
            this.exactCustodyProviderExecutions.set(recoveryKey, providerExecutionReceipt);
            this.exactCustodyCompletions.set(recoveryKey, Object.freeze({
              scope,
              query,
              providerStartReceipt,
              providerExecutionReceipt,
              promise: completion,
            }));
            this.observeExactDockerCompletionAcceptance(scope, query, completion);
          })();
          this.exactCustodyRecoverySetups.set(recoveryKey, setup);
        }
        try {
          await setup;
        } finally {
          if (this.exactCustodyRecoverySetups.get(recoveryKey) === setup) {
            this.exactCustodyRecoverySetups.delete(recoveryKey);
          }
        }
      }
        if (!report.adopted.includes(scope.identity.taskId)) {
          report.adopted.push(scope.identity.taskId);
        }
      } catch (error) {
        appendHold(Object.freeze({
          kind: 'spawn-backend-recovery-hold' as const,
          backend: 'docker' as const,
          dispatchRequestId: entry.state === 'admitted'
            ? entry.ref.dispatchRequestId : entry.reservation.dispatchRequestId,
          taskId: entry.state === 'admitted'
            ? entry.ref.identity.taskId : entry.reservation.identity.taskId,
          admissionRefDigest: entry.state === 'admitted' ? entry.ref.refDigest : null,
          authorityState: holdAuthorityState,
          reasonCode: holdReasonCode,
        }));
        debugLog('docker-backend:exact-custody-recovery-entry-hold', error);
      }
    }
  }

  private async monitorExactDockerCustody(
    scope: PreparedExactDockerCustodyScope,
    containerId: string,
    query: ExactDockerCustodyTerminalQueryV2,
    providerExecutionReceipt: Readonly<{ ref: Sha256Digest; digest: Sha256Digest }>,
    recoveredProviderExit: ExactDockerProviderExitObservationRefV2 | null = null,
  ): Promise<ExactDockerCustodyCompletionV2> {
    const providerExecution = scope.store.readDispatchObservation({
      admissionRef: scope.admissionRef,
      policy: scope.policy,
      observationClass: 'PROVIDER_EXECUTION',
      receiptDigest: providerExecutionReceipt.ref,
    });
    if (providerExecution.receipt.evidenceDigest !== providerExecutionReceipt.digest) {
      throw new ExactDockerCustodyFailure('EXACT_DOCKER_OBSERVATION_REREAD_INVALID', true);
    }
    const hold = (
      reasonCode: Extract<ExactDockerCustodyCompletionV2, { kind: 'capture-hold' }>['reasonCode'],
      providerExit: ExactDockerProviderExitObservationRefV2 | null = null,
    ): ExactDockerCustodyCompletionV2 => Object.freeze({
      kind: 'capture-hold',
      custodyRef: query.custodyRef,
      releaseReceipt: query.releaseReceipt,
      projectionFence: query.projectionFence,
      reasonCode,
      evidence: providerExit
        ? Object.freeze({ kind: 'provider-exit-observation' as const, providerExit })
        : Object.freeze({
            kind: 'release-authority' as const,
            receipt: query.releaseReceipt,
          }),
    });
    let providerExit = recoveredProviderExit;
    if (providerExit) {
      if (providerExit.containerId !== containerId) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_PROVIDER_EXIT_OBSERVATION_INVALID',
          true,
        );
      }
      this.rereadExactProviderExitObservation(scope, providerExit);
    } else {
      const wait = await new Promise<Readonly<{
      stdout: string;
      stderr: string;
      processExitCode: number | null;
      signal: NodeJS.Signals | null;
      error: boolean;
      overflow: boolean;
      }>>(resolveWait => {
      const child = nodeSpawn('docker', ['wait', containerId], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const ceiling = 4 * 1024;
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let overflow = false;
      let error = false;
      let settled = false;
      const append = (
        current: Buffer<ArrayBufferLike>,
        chunk: Buffer<ArrayBufferLike>,
      ): Buffer<ArrayBufferLike> => {
        if (current.byteLength + chunk.byteLength > ceiling) {
          overflow = true;
          try { child.kill('SIGKILL'); } catch { /* bounded wait capture */ }
          return current;
        }
        return Buffer.concat([current, chunk]);
      };
      child.stdout?.on('data', (chunk: Buffer) => { stdout = append(stdout, chunk); });
      child.stderr?.on('data', (chunk: Buffer) => { stderr = append(stderr, chunk); });
      child.once('error', () => { error = true; });
      child.once('close', (processExitCode, signal) => {
        if (settled) return;
        settled = true;
        resolveWait(Object.freeze({
          stdout: stdout.toString('utf8'),
          stderr: stderr.toString('utf8'),
          processExitCode,
          signal,
          error,
          overflow,
        }));
      });
      });
      if (wait.error) return hold('DOCKER_WAIT_UNAVAILABLE');
      const exitText = wait.stdout.trim();
      const exitCode = /^(?:0|[1-9][0-9]{0,2})$/u.test(exitText)
        ? Number(exitText) : Number.NaN;
      if (wait.overflow || wait.processExitCode !== 0 || wait.signal !== null
        || !Number.isSafeInteger(exitCode) || exitCode < 0 || exitCode > 255) {
        return hold('DOCKER_WAIT_INVALID');
      }
      const observedAt = new Date().toISOString();
      const waitEvidence = Object.freeze({
        admissionRefDigest: scope.admissionRef.refDigest,
        containerId,
        exitCode,
        dockerWaitProcessExitCode: 0 as const,
        dockerWaitSignal: null,
        stdoutSha256: exactCustodyDigest(wait.stdout),
        stderrSha256: exactCustodyDigest(wait.stderr),
        observedAt,
      });
      const exitBundle: ExactDockerProviderExitBundleV2 = Object.freeze({
        schemaVersion: 2,
        kind: 'exact-docker-provider-exit',
        ...waitEvidence,
        waitEvidenceDigest: exactCustodyJsonDigest(waitEvidence),
      });
      const exitObservation = this.publishAndRereadExactObservation(
        scope,
        'PROVIDER_EXIT',
        exitBundle,
        observedAt,
      );
      const exitRecord = exactOwnDataRecord(
        JSON.parse(Buffer.from(exitObservation.bytes).toString('utf8')),
        [
          'schemaVersion', 'kind', 'admissionRefDigest', 'containerId', 'exitCode',
          'dockerWaitProcessExitCode', 'dockerWaitSignal', 'stdoutSha256',
          'stderrSha256', 'waitEvidenceDigest', 'observedAt',
        ],
      );
      if (!exitRecord
        || exitRecord.schemaVersion !== 2
        || exitRecord.kind !== 'exact-docker-provider-exit'
        || exitRecord.admissionRefDigest !== scope.admissionRef.refDigest
        || exitRecord.containerId !== containerId
        || exitRecord.exitCode !== exitCode
        || exitRecord.dockerWaitProcessExitCode !== 0
        || exitRecord.dockerWaitSignal !== null
        || exitRecord.stdoutSha256 !== waitEvidence.stdoutSha256
        || exitRecord.stderrSha256 !== waitEvidence.stderrSha256
        || exitRecord.waitEvidenceDigest !== exactCustodyJsonDigest(waitEvidence)
        || exitRecord.observedAt !== observedAt) {
        throw new ExactDockerCustodyFailure(
          'EXACT_DOCKER_PROVIDER_EXIT_OBSERVATION_INVALID',
          true,
        );
      }
      providerExit = Object.freeze({
        containerId,
        exitCode,
        observedAt,
        waitEvidenceDigest: exitBundle.waitEvidenceDigest,
        observationReceiptDigest: exitObservation.receiptDigest,
        observationEvidenceDigest: exitObservation.evidenceDigest,
      });
    }
    const committedEffect = await this.commitExactDockerEffectLanding(scope, providerExit);
    if (!committedEffect) return hold('EFFECT_LANDING_HOLD', providerExit);
    const retainOnHold = async (
      reasonCode: Extract<ExactDockerCustodyCompletionV2, { kind: 'capture-hold' }>['reasonCode'],
    ): Promise<ExactDockerCustodyCompletionV2> => hold(reasonCode, providerExit);
    let streamReceipt: TaskAttemptCustodyArtifactReceiptV2;
    let streamBytes: Uint8Array;
    const streamArtifactKey = `provider-${scope.identity.attemptId}`;
    try {
      const existing = scope.store.readArtifactReceipt({
        identity: scope.identity,
        policy: scope.policy,
        artifactClass: 'pristine-provider-stream',
        artifactKey: streamArtifactKey,
      });
      if (existing) {
        const verified = scope.store.readVerifiedArtifact({
          identity: scope.identity,
          policy: scope.policy,
          artifactClass: 'pristine-provider-stream',
          artifactKey: streamArtifactKey,
          receiptDigest: existing.receiptDigest,
        });
        if (!verified || verified.receipt.capturedAt !== providerExit.observedAt) {
          return await retainOnHold('PRISTINE_PROVIDER_STREAM_INCOMPLETE');
        }
        streamReceipt = verified.receipt;
        streamBytes = Uint8Array.from(verified.bytes);
      } else {
        const capture = await captureDockerLogs(containerId);
        if (capture.captureIncomplete) {
          return await retainOnHold('PRISTINE_PROVIDER_STREAM_INCOMPLETE');
        }
        streamBytes = Buffer.from(capture.content, 'utf8');
        streamReceipt = scope.store.publishProviderStreamCapture({
          admissionRef: scope.admissionRef,
          policy: scope.policy,
          artifactKey: streamArtifactKey,
          capturedAt: providerExit.observedAt,
          bytes: streamBytes,
        });
      }
    } catch {
      return await retainOnHold('PRISTINE_PROVIDER_STREAM_INCOMPLETE');
    }
    const billing = extractProviderBillingEvidence(
      scope.provider,
      Buffer.from(streamBytes).toString('utf8'),
      streamReceipt.capturedAt,
    );
    if (!billing) return await retainOnHold('PROVIDER_BILLING_UNAVAILABLE');
    let resultReceipt: TaskAttemptCustodyArtifactReceiptV2;
    try {
      const artifactKey = `result-${scope.identity.attemptId}`;
      const existing = scope.store.readArtifactReceipt({
        identity: scope.identity,
        policy: scope.policy,
        artifactClass: 'worker-result',
        artifactKey,
      });
      if (existing) {
        const verified = scope.store.readVerifiedArtifact({
          identity: scope.identity,
          policy: scope.policy,
          artifactClass: 'worker-result',
          artifactKey,
          receiptDigest: existing.receiptDigest,
        });
        if (!verified || verified.receipt.capturedAt !== providerExit.observedAt) {
          throw new Error('worker result durable reread failed');
        }
        resultReceipt = verified.receipt;
      } else {
        const source = scope.store.issueAttemptOutputCaptureSource({
          access: scope.access,
          childRelativePath: `task-${scope.identity.taskId}.result`,
          artifactClass: 'worker-result',
          artifactKey,
        });
        resultReceipt = scope.store.captureAttemptOutputArtifact({
          identity: scope.identity,
          policy: scope.policy,
          admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
          artifactClass: 'worker-result',
          artifactKey,
          capturedAt: providerExit.observedAt,
          source,
        });
      }
    } catch {
      return await retainOnHold('WORKER_RESULT_CAPTURE_HOLD');
    }
    let landingProposal: Extract<
      ExactDockerCustodyCompletionV2,
      { kind: 'landing-captured' }
    >['landingProposal'] | null = null;
    if (scope.execution.executionLandingPolicy !== null) {
      let landingReceipt: TaskAttemptCustodyArtifactReceiptV2;
      try {
        const artifactKey = `landing-${scope.identity.attemptId}`;
        const existing = scope.store.readArtifactReceipt({
          identity: scope.identity,
          policy: scope.policy,
          artifactClass: 'worker-landing-proposal',
          artifactKey,
        });
        if (existing) {
          const verified = scope.store.readVerifiedArtifact({
            identity: scope.identity,
            policy: scope.policy,
            artifactClass: 'worker-landing-proposal',
            artifactKey,
            receiptDigest: existing.receiptDigest,
          });
          if (!verified || verified.receipt.capturedAt !== providerExit.observedAt) {
            throw new Error('landing proposal durable reread failed');
          }
          landingReceipt = verified.receipt;
        } else {
          const source = scope.store.issueAttemptOutputCaptureSource({
            access: scope.access,
            childRelativePath: `task-${scope.identity.taskId}.landing-proposal.json`,
            artifactClass: 'worker-landing-proposal',
            artifactKey,
          });
          landingReceipt = scope.store.captureAttemptOutputArtifact({
            identity: scope.identity,
            policy: scope.policy,
            admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
            artifactClass: 'worker-landing-proposal',
            artifactKey,
            capturedAt: providerExit.observedAt,
            source,
          });
        }
      } catch {
        return await retainOnHold('LANDING_PROPOSAL_CAPTURE_HOLD');
      }
      const verifiedLanding = scope.store.readVerifiedArtifact({
        identity: scope.identity,
        policy: scope.policy,
        artifactClass: 'worker-landing-proposal',
        artifactKey: landingReceipt.artifactKey,
        receiptDigest: landingReceipt.receiptDigest,
      });
      const landingVerifiedAt = providerExit.observedAt;
      let proposal;
      try {
        proposal = verifiedLanding
          ? parseExactExecutionLandingProposalJsonV3(
              Buffer.from(verifiedLanding.bytes).toString('utf8'),
              {
                taskId: scope.identity.taskId,
                dispatchRequestId: scope.admissionRef.dispatchRequestId,
              },
            )
          : null;
      } catch {
        proposal = null;
      }
      if (!verifiedLanding
        || verifiedLanding.receipt.receiptDigest !== landingReceipt.receiptDigest
        || verifiedLanding.proof.sha256 !== landingReceipt.artifact.sha256
        || !proposal) {
        return await retainOnHold('LANDING_PROPOSAL_CAPTURE_HOLD');
      }
      landingProposal = Object.freeze({
        artifact: this.exactArtifactProjection(landingReceipt) as
          ExactDockerLandingProposalArtifactRefV2,
        proposal: Object.freeze(proposal),
        verifiedAt: landingVerifiedAt,
      });
    }
    const hostWorkAttribution = await measureExactDockerHostWorkAttribution({
      projectRoot: this.projectDir,
      identity: scope.identity,
      admissionRefDigest: scope.admissionRef.refDigest,
      dispatchRequestId: scope.admissionRef.dispatchRequestId,
      scopeFilesWrite: scope.taskSnapshot.material.dispatch.scope.filesWrite,
      scopeBaseline: scope.taskSnapshot.dispatch.scopeBaseline,
      scopeBaselineSha256: scope.taskSnapshot.dispatch.scopeBaselineSha256,
      providerExitObservationReceiptDigest: providerExit.observationReceiptDigest,
    });
    if (hostWorkAttribution.state !== 'VERIFIED') {
      return await retainOnHold('HOST_WORK_ATTRIBUTION_HOLD');
    }
    const hostWorkArtifactKey = `host-work-${scope.identity.attemptId}`;
    try {
      const hostWorkBytes = canonicalTaskAttemptCustodyJson(
        hostWorkAttribution,
        scope.policy.jsonBounds,
      );
      const existingHostWork = scope.store.readArtifactReceipt({
        identity: scope.identity,
        policy: scope.policy,
        artifactClass: 'host-work-attribution',
        artifactKey: hostWorkArtifactKey,
      });
      const hostWorkReceipt = existingHostWork ?? scope.store.publishHostArtifact({
        identity: scope.identity,
        policy: scope.policy,
        admissionReceiptDigest: scope.admissionRef.admissionReceiptDigest,
        artifactClass: 'host-work-attribution',
        artifactKey: hostWorkArtifactKey,
        capturedAt: providerExit.observedAt,
        bytes: hostWorkBytes,
      });
      const verifiedHostWork = scope.store.readVerifiedArtifact({
        identity: scope.identity,
        policy: scope.policy,
        artifactClass: 'host-work-attribution',
        artifactKey: hostWorkArtifactKey,
        receiptDigest: hostWorkReceipt.receiptDigest,
      });
      if (!verifiedHostWork
        || verifiedHostWork.receipt.capturedAt !== providerExit.observedAt
        || Buffer.compare(Buffer.from(verifiedHostWork.bytes), Buffer.from(hostWorkBytes)) !== 0) {
        return await retainOnHold('HOST_WORK_ATTRIBUTION_HOLD');
      }
    } catch {
      return await retainOnHold('HOST_WORK_ATTRIBUTION_HOLD');
    }
    const acceptedEffect = await this.releaseExactDockerEffectLanding(scope, committedEffect);
    if (!acceptedEffect) return hold('EFFECT_RELEASE_HOLD', providerExit);
    const base = Object.freeze({
      custodyRef: query.custodyRef,
      releaseReceipt: query.releaseReceipt,
      projectionFence: query.projectionFence,
      providerExit,
      hostWorkAttribution,
      hostEffectAuthority: Object.freeze({
        projection: acceptedEffect.projection,
        binding: acceptedEffect.binding,
      }),
      providerStream: this.exactArtifactProjection(streamReceipt) as
        Extract<ExactDockerCustodyCompletionV2, { kind: 'result-captured' }>['providerStream'],
      result: Object.freeze({
        version: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        identity: resultReceipt.identity,
        policyDigest: resultReceipt.policyDigest,
        admissionReceiptDigest: resultReceipt.admissionReceiptDigest,
        sourceResult: Object.freeze({
          artifactClass: 'worker-result' as const,
          artifactKey: resultReceipt.artifactKey,
          artifactReceiptDigest: resultReceipt.receiptDigest,
          artifactSha256: resultReceipt.artifact.sha256,
          byteLength: resultReceipt.artifact.byteLength,
        }),
      }),
      resultArtifact: this.exactArtifactProjection(resultReceipt) as
        Extract<ExactDockerCustodyCompletionV2, { kind: 'result-captured' }>['resultArtifact'],
      providerBilling: Object.freeze({
        evidence: Object.freeze(billing),
        evidenceDigest: exactCustodyJsonDigest(billing),
        providerStreamReceiptDigest: streamReceipt.receiptDigest,
      }),
    });
    return landingProposal
      ? Object.freeze({ kind: 'landing-captured' as const, ...base, landingProposal })
      : Object.freeze({ kind: 'result-captured' as const, ...base });
  }

  /**
   * Resolve immutable local execution identity without invoking a provider.
   * Image digest and in-image CLI presence are both fail-closed authority.
   */
  async inspectExactCrossVerifyRuntime(
    provider: ProviderName,
    model: string,
  ): Promise<DockerExactCrossVerifyRuntimeIdentity> {
    const detailDigest = (reasonCode: string, detail: unknown): string =>
      `docker-xverify-runtime:${createHash('sha256')
        .update(canonicalJson({ reasonCode, detail }))
        .digest('hex')}`;
    if (modelRegistry.get(model)?.provider !== provider) {
      return {
        state: 'hold',
        reasonCode: 'docker_provider_model_mismatch',
        authorityEvidenceRef: detailDigest(
          'docker_provider_model_mismatch',
          { provider, model },
        ),
      };
    }
    const spec = getProviderCommandSpec(provider);
    if (!spec) {
      return {
        state: 'hold',
        reasonCode: 'docker_provider_cli_unavailable',
        authorityEvidenceRef: detailDigest(
          'docker_provider_cli_unavailable',
          { provider, model, reason: 'command-spec-missing' },
        ),
      };
    }
    const inspected = await this.crossVerifyRuntimeCommandRunner(
      'docker',
      ['image', 'inspect', '--format', '{{.Id}}', this.image],
    );
    const imageId = inspected.status === 0 ? inspected.stdout.trim() : '';
    if (!/^sha256:[a-f0-9]{64}$/u.test(imageId)) {
      return {
        state: 'hold',
        reasonCode: 'docker_image_identity_unavailable',
        authorityEvidenceRef: detailDigest(
          'docker_image_identity_unavailable',
          { image: this.image, status: inspected.status ?? null },
        ),
      };
    }
    const binary = await this.crossVerifyRuntimeCommandRunner(
      'docker',
      [
        'run',
        '--rm',
        '--network',
        'none',
        imageId,
        'sh',
        '-c',
        'command -v "$1"',
        'deckent-xverify-probe',
        spec.binary,
      ],
    );
    const binaryPath = binary.status === 0 ? binary.stdout.trim() : '';
    if (!binaryPath?.startsWith('/')) {
      return {
        state: 'hold',
        reasonCode: 'docker_provider_cli_unavailable',
        authorityEvidenceRef: detailDigest(
          'docker_provider_cli_unavailable',
          { provider, model, imageId, status: binary.status },
        ),
      };
    }
    const profile = {
      provider,
      model,
      imageId,
      binary: spec.binary,
      binaryPath,
      baseArgs: spec.baseArgs,
      modelFlag: spec.modelFlag,
      approvalArgs: spec.approvalArgs,
      isolatedContextArgs: spec.isolatedContextArgs,
      promptFeed: spec.promptFeed,
      liveUsage: spec.liveUsage,
    };
    const runtimeFingerprint = createHash('sha256')
      .update(canonicalJson(profile))
      .digest('hex');
    const toolProfileDigest = createHash('sha256')
      .update(canonicalJson({
        binary: spec.binary,
        baseArgs: spec.baseArgs,
        modelFlag: spec.modelFlag,
        approvalArgs: spec.approvalArgs,
        allowedToolsFlag: spec.allowedToolsFlag,
        availableToolsFlag: spec.availableToolsFlag,
        isolatedContextArgs: spec.isolatedContextArgs,
        promptFeed: spec.promptFeed,
        liveUsage: spec.liveUsage,
      }))
      .digest('hex');
    return Object.freeze({
      state: 'ready',
      imageId,
      runtimeFingerprint,
      executionProfileRef: `docker-execution-profile:${runtimeFingerprint}`,
      toolProfileDigest,
      authorityEvidenceRef: `docker-xverify-runtime:${runtimeFingerprint}`,
    });
  }

  /**
   * Execute one provider-neutral, bounded probe through the Docker backend.
   * Docker details remain internal: callers supply only the frozen contract's
   * scalar request and receive only its sanitized observation union.
   */
  async invokeBoundedReachabilityProbe(
    request: Readonly<BoundedReachabilityProbeRequest>,
  ): Promise<Readonly<ProviderNativeProbeObservation>> {
    const startedAt = Date.now();
    const elapsed = (): number => Math.max(0, Date.now() - startedAt);
    const transportError = (errorCode: string, retryable: boolean): Readonly<ProviderNativeProbeObservation> =>
      Object.freeze({ outcome: 'transport-error', errorCode, retryable, elapsedMs: elapsed() });
    const provider = request.provider as ProviderName;
    const spec = getProviderCommandSpec(provider);
    if (!spec || this.platform !== 'darwin' && this.platform !== 'linux' && this.platform !== 'win32') {
      return transportError('backend_unsupported', false);
    }
    const runtime = await this.inspectExactCrossVerifyRuntime(provider, request.model);
    if (runtime.state !== 'ready' || runtime.executionProfileRef !== request.executionProfileRef) {
      return transportError('backend_unsupported', false);
    }
    const home = this.homeDir;
    const hostCredentialRoot = resolveProviderHostCredentialRoot(
      home,
      provider,
      spec.oauthHomeDir ?? undefined,
      this.platform,
    );
    const authBroker = prepareProviderAuthBroker(
      this.projectDir,
      provider,
      hostCredentialRoot,
    );
    const auth = buildProviderAuthIsolation(
      home,
      provider,
      spec.oauthHomeDir ?? undefined,
      false,
      existsSync,
      authBroker,
    );
    if (auth.missingRequiredFiles.length > 0) {
      return transportError('credential_unavailable', false);
    }
    const containerHome = '/tmp/deckent-home';
    const command = buildProviderCommand(spec, modelRegistry.get(request.model)?.apiId ?? request.model, '/dev/stdin', {
      isolatedContext: true,
      autoApprove: false,
    });
    // `-i` attaches the container's stdin so the bounded prompt bytes actually
    // reach the provider CLI (codex reads its prompt from stdin). Without it the
    // CLI exits "No prompt provided via stdin" and the probe misreads a dead
    // container for an unreachable backend. No network flag is set here:
    // provider dispatch owns its effective network policy.
    const args = [
      'run', '--rm', '-i',
      '--tmpfs', `${containerHome}:size=${this.homeTmpfsSize}`,
      '-e', `HOME=${containerHome}`,
      ...auth.mountArgs,
      runtime.imageId,
      'sh', '-c',
      `${auth.bootstrapLines.join('\n')}\nexec ${command}`,
    ];
    let result: Readonly<DockerCrossVerifyRuntimeCommandResult>;
    try {
      result = await this.reachabilityProbeCommandRunner({
        args,
        stdin: request.promptBytes,
        timeoutMs: request.timeoutMs,
        outputCeiling: BOUNDED_REACHABILITY_CAPTURE_CEILING_BYTES,
      });
    } catch {
      return transportError('backend_unreachable', true);
    }
    if (result.status === null && result.stderr === 'probe timeout') {
      return Object.freeze({ outcome: 'timed-out', elapsedMs: elapsed() });
    }
    if (result.status === null && result.stderr === 'probe output ceiling exceeded') {
      return transportError('response_too_large', false);
    }
    // `classifyDockerPreflight` treats every unrecognized non-zero result as a
    // daemon failure because its canonical caller is `docker info`. Here the
    // command is a provider process inside an already-started container: a
    // normal provider refusal is therefore `rejected`, not evidence that the
    // daemon is down. Only runner-level failure or Docker's explicit daemon /
    // socket language may become backend_unreachable.
    const stderrLower = result.stderr.toLowerCase();
    const explicitDockerTransportFailure = result.status === null
      || stderrLower.includes('cannot connect to the docker daemon')
      || stderrLower.includes('is the docker daemon running')
      || stderrLower.includes('docker daemon is not running')
      || stderrLower.includes('error during connect')
      || stderrLower.includes('permission denied while trying to connect to the docker daemon')
      || (stderrLower.includes('dial unix')
        && stderrLower.includes('connect: permission denied'));
    if (explicitDockerTransportFailure) {
      return transportError('backend_unreachable', true);
    }
    if (result.status === 0) {
      return Object.freeze({ outcome: 'completed', providerRequestRef: null, outputBytes: Buffer.byteLength(result.stdout), latencyMs: elapsed() });
    }
    return Object.freeze({ outcome: 'rejected', providerCode: null, retryable: false, latencyMs: elapsed() });
  }

  /**
   * Recover attempts left behind by a dead coordinator. The caller must hold
   * project leadership: this method adopts an exact container into the normal
   * monitor before containment, and a second coordinator must never install a
   * competing monitor for the same attempt.
   */
  async reconcilePendingAttempts(
    options: SpawnBackendRecoveryOptions = {},
  ): Promise<SpawnBackendRecoveryReport> {
    const report: SpawnBackendRecoveryReport = {
      adopted: [],
      closedNotDispatched: [],
      closedAbsentAfterExit: [],
      retiredLanded: [],
      resumedContinuations: [],
      held: [],
    };
    await this.reconcileExactDockerCustodyAdmissions(report, options);
    const tasksDir = join(this.projectDir, TASKS_DIR);
    const resumedAttemptIds = new Set<string>();
    const continuationRecoveryByKey =
      new Map<string, DockerContinuationRecoveryAuthority>();
    for (const landed of listRetiredExecutionLandings(this.projectDir)) {
      const taskId = landed.checkpoint.checkpoint.taskId;
      if (!hasCurrentTaskProjection(tasksDir, taskId)) {
        debugLog(
          'docker-backend:historical-landing-skipped',
          `taskId=${taskId} reason=no-current-task-projection`,
        );
        continue;
      }
      if (options.mode === 'terminal-only') {
        continue;
      }
      if (options.mode === 'contain') {
        settleHeldExecutionContinuation(
          this.projectDir,
          taskId,
          143,
          'operator kill requested containment; continuation dispatch is forbidden',
        );
        report.retiredLanded.push(taskId);
        continue;
      }
      // MASTER-PLAN 664: a landing whose remaining budget can no longer finance
      // any continuation is permanently un-continuable. Recovery must settle it
      // and move on — propagating the hold here aborted EVERY later run on the
      // machine (measured 2026-07-26: sprint-458 died on sprint-457's stale
      // landing with `remaining=1, required=2`). The in-flight path already
      // settles this case; recovery now matches it.
      let continuation: ExecutionContinuationDispatchResult;
      try {
        continuation = dispatchExecutionContinuation({
          projectRoot: this.projectDir,
          checkpointRef: landed.checkpoint.checkpoint,
          backend: this,
          historicalV1Recovery: true,
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        debugLog(
          'docker-backend:recovery-continuation-held',
          `taskId=${taskId} ${reason}`,
        );
        settleHeldExecutionContinuation(
          this.projectDir,
          taskId,
          137,
          reason,
        );
        report.retiredLanded.push(taskId);
        continue;
      }
      const recoveryAuthority: DockerContinuationRecoveryAuthority = {
        executionContinuation: {
          version: 1,
          checkpointSha256: landed.checkpoint.checkpointSha256,
          parentAttemptId: landed.checkpoint.checkpoint.attemptId,
          continuationAttemptId: continuation.claim.continuationAttemptId,
          continuationFence: continuation.claim.continuationFence,
        },
        executionBudget: landed.checkpoint.checkpoint.remainingBudget,
        executionLandingPolicy: landed.checkpoint.checkpoint.landingPolicy,
      };
      const recoveryKey =
        `${landed.checkpoint.checkpoint.taskId}\0${continuation.claim.continuationAttemptId}`;
      const existingRecovery = continuationRecoveryByKey.get(recoveryKey);
      if (
        existingRecovery
        && JSON.stringify(existingRecovery) !== JSON.stringify(recoveryAuthority)
      ) {
        throw new SpawnBackendError(
          `DECKENT_E091:continuation-recovery-authority-conflict:${landed.checkpoint.checkpoint.taskId}/${continuation.claim.continuationAttemptId}`,
          this.name,
        );
      }
      continuationRecoveryByKey.set(recoveryKey, recoveryAuthority);
      if (continuation.state === 'dispatched') {
        resumedAttemptIds.add(continuation.settlementRef.attemptId);
        report.resumedContinuations.push(landed.checkpoint.checkpoint.taskId);
      }
    }

    for (const pending of listPendingTaskResultSettlementAttempts(this.projectDir)) {
      const { attempt, prepared, dispatch, settlement } = pending;
      if (resumedAttemptIds.has(attempt.attemptId)) continue;
      if (
        options.mode === 'terminal-only'
        && (!pending.claim || !prepared || !dispatch)
      ) {
        // This mode runs without project leadership at task/run/do/autonomous
        // ingress. Only a dispatched exact attempt can be proven terminal
        // without racing a live coordinator between prepare and docker run.
        continue;
      }
      const continuationRecovery = continuationRecoveryByKey.get(
        `${attempt.taskId}\0${attempt.attemptId}`,
      );
      const landingRef: ExecutionLandingCheckpointRefV1 = {
        schemaVersion: 1,
        projectId: attempt.projectRootSha256,
        taskId: attempt.taskId,
        attemptId: attempt.attemptId,
      };
      const landingCheckpoint = readExecutionLandingCheckpointByRef(landingRef);
      if (landingCheckpoint) {
        if (settlement || !prepared || !dispatch) {
          throw new SpawnBackendError(
            `DECKENT_E091:landed-attempt-authority-conflict:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        const authority = this.inspectContainerAuthority(dispatch.containerId);
        if (authority.state === 'unavailable') {
          throw new SpawnBackendError(
            `${DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE}:${authority.evidence}`,
            this.name,
          );
        }
        if (authority.state === 'present' && authority.inspection.running) {
          terminateDockerContainerForBudget(dispatch.containerId, this.gracefulTimeoutSeconds);
        }
        const retired = await this.finalizeLandedAttempt({
          taskId: attempt.taskId,
          containerId: dispatch.containerId,
          tasksDir,
          model: prepared.model,
          projectDir: this.projectDir,
          settlementRef: attempt,
          checkpointSha256: landingCheckpoint.checkpointSha256,
          exitCode: authority.state === 'present' ? authority.inspection.exitCode : -1,
          containerAlreadyAbsent: authority.state === 'absent',
        });
        if (!retired) {
          throw new SpawnBackendError(
            `DECKENT_E091:landed-attempt-retirement-incomplete:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        report.retiredLanded.push(attempt.taskId);
        continue;
      }
      const pendingLanding = readRuntimeBudgetLandingRequest(
        this.projectDir,
        attempt.taskId,
      );
      if (settlement && !prepared && !dispatch) {
        const candidateContainerNames = new Set([
          `${CONTAINER_PREFIX}${attempt.taskId}`,
          dockerContainerNameForTask(this.projectDir, attempt.taskId),
        ]);
        for (const containerName of candidateContainerNames) {
          const authority = this.inspectContainerAuthority(containerName);
          if (authority.state === 'unavailable') {
            throw new SpawnBackendError(
              `${DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE}:${containerName}:${authority.evidence}`,
              this.name,
            );
          }
          if (authority.state === 'present') {
            throw new SpawnBackendError(
              `${DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT}:legacy-settlement-container-present:${attempt.taskId}/${attempt.attemptId}:${containerName}`,
              this.name,
            );
          }
        }

        const resultPath = join(tasksDir, `task-${attempt.taskId}.result`);
        const taskPath = join(tasksDir, `task-${attempt.taskId}.json`);
        let rawResult: Record<string, unknown>;
        let taskProjection: Record<string, unknown>;
        try {
          rawResult = JSON.parse(readFileSync(resultPath, 'utf-8')) as Record<string, unknown>;
          taskProjection = JSON.parse(readFileSync(taskPath, 'utf-8')) as Record<string, unknown>;
        } catch (error) {
          throw new SpawnBackendError(
            `DECKENT_E091:legacy-settlement-projection-unreadable:${attempt.taskId}/${attempt.attemptId}:${error instanceof Error ? error.message : String(error)}`,
            this.name,
          );
        }
        const rawResultDigest = createTaskResultSettlement({
          ref: attempt,
          exitCode: settlement.exitCode,
          result: rawResult,
        }).resultSha256;
        if (rawResultDigest !== settlement.resultSha256) {
          throw new SpawnBackendError(
            `DECKENT_E091:legacy-settlement-result-mismatch:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        if (taskProjection['id'] !== attempt.taskId) {
          throw new SpawnBackendError(
            `DECKENT_E091:legacy-settlement-task-mismatch:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        const assessment = settlement.result['selfAssessment'];
        const terminalStatus = assessment === 'DONE' || assessment === 'GO_WITH_TECH_DEBT'
          ? TaskStatus.DONE
          : assessment === 'NO_GO'
            ? TaskStatus.NO_GO
            : null;
        if (terminalStatus === null) {
          throw new SpawnBackendError(
            `DECKENT_E091:legacy-settlement-assessment-unknown:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        const currentStatus = taskProjection['status'];
        const activeStatuses = new Set<string>([
          TaskStatus.PENDING,
          TaskStatus.CLAIMED,
          TaskStatus.EXECUTING,
          TaskStatus.TESTING,
          TaskStatus.DOCUMENTING,
          TaskStatus.PAUSED,
          TaskStatus.MANUAL_REVIEW_REQUIRED,
        ]);
        if (currentStatus !== terminalStatus && !activeStatuses.has(String(currentStatus))) {
          throw new SpawnBackendError(
            `DECKENT_E091:legacy-settlement-status-conflict:${attempt.taskId}/${attempt.attemptId}:${String(currentStatus)}->${terminalStatus}`,
            this.name,
          );
        }

        if (!pending.claim) claimTaskResultSettlementAttemptAtomic(attempt);
        if (currentStatus !== terminalStatus) {
          taskProjection['status'] = terminalStatus;
          atomicWriteFileSync(taskPath, `${JSON.stringify(taskProjection, null, 2)}\n`);
        }
        releaseAllSpawnLocks(this.projectDir, attempt.taskId);
        releaseStaleSpawnLocksForTask(this.projectDir, attempt.taskId);
        if (hasSpawnLocksForTask(this.projectDir, attempt.taskId)) {
          throw new SpawnBackendError(
            `DECKENT_E091:recovery-lock-release-failed:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        writeTaskResultSettlementClosureAtomic(attempt, {
          containerDisposition: 'absent-after-exit',
          locksReleased: true,
          evidenceRef: 'legacy-lifecycle-adoption:v1',
        });
        report.closedAbsentAfterExit.push(attempt.taskId);
        continue;
      }
      if (!pending.claim) {
        if (prepared || dispatch || settlement) {
          throw new SpawnBackendError(
            `DECKENT_E091:pending-attempt-without-active-claim:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        claimTaskResultSettlementAttemptAtomic(attempt);
      }

      if (!prepared) {
        const resultPath = join(tasksDir, `task-${attempt.taskId}.result`);
        if (existsSync(resultPath)) {
          let existingResult: unknown;
          try {
            existingResult = JSON.parse(readFileSync(resultPath, 'utf-8')) as unknown;
          } catch {
            existingResult = null;
          }
          if (!isCanonicalPriorUnpreparedRecoveryResult(existingResult, attempt)) {
            throw new SpawnBackendError(
              `DECKENT_E091:unprepared-attempt-has-worker-result:${attempt.taskId}/${attempt.attemptId}`,
              this.name,
            );
          }
        }
        const recoveryResult = projectDockerRecoveryPreDispatchSettlement({
          taskId: attempt.taskId,
          workerId: `docker-recovery-${attempt.taskId}`,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          selfAssessment: 'NO_GO',
          notes: `DECKENT_E091:coordinator-crashed-before-docker-prepare:${attempt.attemptId}`,
          exitCode: null,
          tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
        }, exactDockerRecoveryAuthority(attempt));
        if (!existsSync(resultPath)) {
          atomicWriteFileSync(resultPath, `${JSON.stringify(recoveryResult, null, 2)}\n`);
        }
        this.settleRecoveredAttempt(
          attempt,
          tasksDir,
          null,
          'not-dispatched',
          recoveryResult,
        );
        report.closedNotDispatched.push(attempt.taskId);
        continue;
      }

      const selector = dispatch?.containerId ?? prepared.containerName;
      const authority = this.inspectContainerAuthority(selector);
      if (authority.state === 'unavailable') {
        throw new SpawnBackendError(
          `${DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE}:${authority.evidence}`,
          this.name,
        );
      }
      if (authority.state === 'absent') {
        const resultPath = join(tasksDir, `task-${attempt.taskId}.result`);
        const terminalReceipt = readTaskProviderTerminalBillingReceipt(attempt);
        if (!settlement) {
          ensureDockerRecoveryResultFile({
            projectRoot: this.projectDir,
            tasksDir,
            ref: attempt,
            model: prepared.model,
          });
        }
        if (continuationRecovery) {
          if (settlement) {
            if (!settledContinuationCarriesLineage(
              settlement,
              continuationRecovery,
              terminalReceipt,
            )) {
              throw new SpawnBackendError(
                `DECKENT_E091:continuation-settlement-lineage-missing:${attempt.taskId}/${attempt.attemptId}`,
                this.name,
              );
            }
          } else {
            reconcileDockerContinuationLineageResultFile({
              resultPath,
              projectRoot: this.projectDir,
              taskId: attempt.taskId,
              model: prepared.model as ModelType,
              settlementRef: attempt,
              executionContinuation: continuationRecovery.executionContinuation,
              terminalUsage: readRuntimeBudgetUsage(this.projectDir, attempt.taskId),
              terminalBilling: terminalReceipt?.billing ?? null,
              terminalBillingEvidenceRef: terminalReceipt
                ? taskProviderTerminalBillingEvidenceRef(terminalReceipt)
                : null,
            });
          }
        } else if (settlement) {
          if (terminalReceipt) {
            const settledBilling = settlement.result['providerBilling'];
            if (
              JSON.stringify(settledBilling)
              !== JSON.stringify(terminalReceipt.billing)
            ) {
              throw new SpawnBackendError(
                `DECKENT_E091:terminal-billing-settlement-conflict:${attempt.taskId}/${attempt.attemptId}`,
                this.name,
              );
            }
          }
        } else {
          reconcileDockerProviderBillingReceiptResultFile(
            resultPath,
            attempt.taskId,
            terminalReceipt,
          );
        }
        this.settleRecoveredAttempt(attempt, tasksDir, settlement?.exitCode ?? null, 'absent-after-exit');
        report.closedAbsentAfterExit.push(attempt.taskId);
        continue;
      }

      if (options.mode === 'terminal-only') {
        // A present container still belongs to its live/recovering coordinator.
        // Never adopt, stop or resume it from a leadership-free ingress sweep.
        continue;
      }

      const inspection = authority.inspection;
      const identity: DockerAttemptIdentity = {
        ref: attempt,
        containerName: prepared.containerName,
        labels: prepared.labels,
      };
      if (
        !this.inspectionMatchesAttempt(inspection, identity)
        || (dispatch && inspection.containerId !== dispatch.containerId)
      ) {
        throw new SpawnBackendError(
          `${DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT}:recovery-authority-mismatch:${attempt.taskId}/${attempt.attemptId}`,
          this.name,
        );
      }
      if (!dispatch) writeTaskResultSettlementDispatchAtomic(attempt, inspection.containerId);

      if (
        pendingLanding
        && pendingLanding.attemptId === attempt.attemptId
        && pendingLanding.projectId === attempt.projectRootSha256
      ) {
        const stopped = inspection.running
          ? terminateDockerContainerForBudget(inspection.containerId, this.gracefulTimeoutSeconds)
          : {
              containerName: inspection.containerId,
              escalation: 'docker-stop' as const,
              terminationConfirmed: true as const,
              exitCode: inspection.exitCode,
            };
        let checkpoint: ReturnType<typeof stampDockerExecutionLandingCheckpoint>;
        try {
          checkpoint = stampDockerExecutionLandingCheckpoint({
            projectRoot: this.projectDir,
            settlementRef: attempt,
            landing: pendingLanding,
            terminalUsage: readRuntimeBudgetUsage(this.projectDir, attempt.taskId),
          });
        } catch (error) {
          const evidence = error instanceof Error ? error.message : String(error);
          debugLog(
            'docker-backend:landing-request-recovery-held',
            `taskId=${attempt.taskId} ${evidence}`,
          );
          await this.adoptAndSettleRecoveredAttempt(
            attempt,
            inspection.containerId,
            prepared.model,
            tasksDir,
            false,
            {
              attemptId: attempt.attemptId,
              reason: 'landing-checkpoint-unavailable',
              evidence: evidence.slice(0, 500),
            },
          );
          report.adopted.push(attempt.taskId);
          continue;
        }
        const retired = await this.finalizeLandedAttempt({
          taskId: attempt.taskId,
          containerId: inspection.containerId,
          tasksDir,
          model: prepared.model,
          projectDir: this.projectDir,
          settlementRef: attempt,
          checkpointSha256: checkpoint.checkpointSha256,
          exitCode: stopped.exitCode,
        });
        if (!retired) {
          throw new SpawnBackendError(
            `DECKENT_E091:landing-request-retirement-incomplete:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        report.retiredLanded.push(attempt.taskId);
        continue;
      }

      await this.adoptAndSettleRecoveredAttempt(
        attempt,
        inspection.containerId,
        prepared.model,
        tasksDir,
        inspection.running,
        undefined,
        continuationRecovery,
      );
      report.adopted.push(attempt.taskId);
    }
    return report;
  }

  private settleRecoveredAttempt(
    ref: TaskResultSettlementRefV1,
    tasksDir: string,
    exitCode: number | null,
    disposition: 'not-dispatched' | 'absent-after-exit',
    recoveryResult?: Record<string, unknown>,
  ): void {
    if (!readTaskResultSettlement(ref)) {
      if (recoveryResult) {
        writeTaskResultSettlementAtomic(createTaskResultSettlement({
          ref,
          exitCode,
          result: recoveryResult,
        }));
      } else {
        const persisted = persistDockerTaskResultSettlement(this.projectDir, tasksDir, ref, exitCode);
        if (!persisted) {
          throw new SpawnBackendError(
            `DECKENT_E091:recovery-result-missing:${ref.taskId}/${ref.attemptId}`,
            this.name,
          );
        }
      }
    }
    releaseAllSpawnLocks(this.projectDir, ref.taskId);
    releaseStaleSpawnLocksForTask(this.projectDir, ref.taskId);
    if (hasSpawnLocksForTask(this.projectDir, ref.taskId)) {
      throw new SpawnBackendError(
        `DECKENT_E091:recovery-lock-release-failed:${ref.taskId}/${ref.attemptId}`,
        this.name,
      );
    }
    closeDockerTaskResultSettlement(ref, disposition);
  }

  private async adoptAndSettleRecoveredAttempt(
    ref: TaskResultSettlementRefV1,
    containerId: string,
    model: string,
    tasksDir: string,
    running: boolean,
    recoveryContainment?: DockerRecoveryContainment,
    continuationRecovery?: DockerContinuationRecoveryAuthority,
  ): Promise<void> {
    const recoveredBudgetAuthority =
      readTaskResultSettlementExecutionBudgetAuthority(ref);
    if (recoveredBudgetAuthority && recoveredBudgetAuthority.model !== model) {
      throw new SpawnBackendError(
        `${DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT}:recovery-budget-model-mismatch:${ref.taskId}`,
        this.name,
      );
    }
    const recoveredExecutionBudget =
      continuationRecovery?.executionBudget ?? recoveredBudgetAuthority?.budget;
    const recoveredExecutionLandingPolicy =
      continuationRecovery?.executionLandingPolicy
      ?? recoveredBudgetAuthority?.landingPolicy;
    const existing = this.containers.get(ref.taskId);
    if (existing && existing.containerId !== containerId) {
      throw new SpawnBackendError(
        `${DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT}:recovery-monitor-conflict:${ref.taskId}`,
        this.name,
      );
    }
    this.containers.set(ref.taskId, {
      containerId,
      containerName: dockerContainerNameForTask(this.projectDir, ref.taskId),
      model,
      projectDir: this.projectDir,
      tasksDir,
      settlementRef: ref,
    });
    this.monitorContainer(
      ref.taskId,
      containerId,
      tasksDir,
      model,
      this.projectDir,
      computeDistFingerprint(join(this.projectDir, 'dist')),
      undefined,
      recoveredExecutionBudget,
      recoveredExecutionLandingPolicy,
      continuationRecovery?.executionContinuation,
      undefined,
      ref,
      undefined,
      undefined,
      recoveryContainment ?? (running
        ? { attemptId: ref.attemptId, reason: 'host-restart-budget-observer-loss' }
        : undefined),
    );
    if (running) {
      terminateDockerContainerForBudget(containerId, this.gracefulTimeoutSeconds);
    }

    const deadline = Date.now() + ((this.gracefulTimeoutSeconds + 45) * 1_000);
    while (Date.now() < deadline) {
      if (readTaskResultSettlementClosure(ref)) return;
      await new Promise<void>(resolveWait => setTimeout(resolveWait, 25));
    }
    throw new SpawnBackendError(
      `DECKENT_E091:recovery-settlement-timeout:${ref.taskId}/${ref.attemptId}`,
      this.name,
    );
  }

  /**
   * Spawn a worker in an isolated Docker container.
   *
   * Container setup:
   * - Project directory mounted READ-WRITE at /workspace (worker writes code);
   *   dist/ is remounted read-only on top (born-644 host-dist-ezme guard'ı)
   * - .tasks/ mounted read-write (shared volume for results)
   * - Claude auth cache mounted read-only
   * - API keys passed as env vars if available
  * - timeout wrapper kills container after limit
  */
  spawn(taskId: string, model: ModelType, prompt: string, opts?: SpawnBackendOptions): void {
    // SpawnBackend arayüz-sözleşmesi (spawn-backend.ts:82) SYNC fire-and-forget'tir
    // ve üretim-spawner await'siz çağırır. 684-003 async'leştirmesi bu sözleşmeyi
    // kırıp guard-throw'ları yetim-rejection'a çevirmişti (full-suite 76-dosya
    // regresyonu + sprint-686 FATAL sınıfı). Guard/hazırlık yeniden sync;
    // yalnız capture+launch kuyruğu içeride async akar (spawnInternal).
    this.spawnInternal(taskId, model, prompt, opts);
  }

  /**
   * Dedicated exact-xverify entrypoint.
   *
   * This never routes through `SpawnBackendFactory` and never reads its prompt
   * from the project `.tasks/` mount. The returned handle contains no
   * actual-call, usage or terminal facts.
   */
  async spawnExactCrossVerify(
    input: DockerExactCrossVerifySpawnInput,
  ): Promise<DockerExactCrossVerifyDispatchHandle> {
    assertCrossVerifyEnforcedAttemptContract(input.executionContract);
    const contract = input.executionContract;
    if (!input.terminationAuthority
      || typeof input.terminationAuthority.bindPreparedAttempt !== 'function') {
      throw new SpawnBackendError(
        'Exact xverify requires a pre-dispatch termination binding authority',
        this.name,
      );
    }
    if (createHash('sha256').update(input.prompt).digest('hex')
      !== contract.dispatchedPromptSha256) {
      throw new SpawnBackendError(
        'Exact xverify prompt bytes differ from the execution contract',
        this.name,
      );
    }
    if (contract.schemaVersion === 2
      && (
        `sha256:${contract.dispatchedPromptSha256}`
          !== contract.adjudication.finalPromptDigest
        || input.prompt.length !== contract.adjudication.finalPromptChars
        || contract.adjudication.evidenceAccess !== 'snapshot-read-only'
        || contract.adjudication.artifactMutationPolicy
          !== 'attempt-private-output-only'
      )) {
      throw new SpawnBackendError(
        'Typed xverify prompt or isolation policy differs from the execution contract',
        this.name,
      );
    }
    const dir = input.options.projectDir ?? this.projectDir;
    assertTaskResultSettlementRef(dir, input.taskId, input.settlementRef);
    if (input.taskId !== contract.verifierTaskId
      || input.model !== contract.model
      || contract.executionBackend !== 'docker'
      || getProviderForModel(input.model) !== contract.provider
      || !sameExactSettlementRef(input.settlementRef, contract.settlementAttemptRef)
      || canonicalJson(input.options.executionBudget) !== canonicalJson(contract.budget)
      || canonicalJson(input.options.executionLandingPolicy)
        !== canonicalJson(contract.landingPolicy)
      || (input.options.executionAdmissionMode ?? 'unattended') !== contract.attendanceMode
      || input.options.taskTimeoutSeconds !== contract.timeoutMs / 1_000
      || input.options.isolatedContext !== contract.isolatedContext) {
      throw new SpawnBackendError(
        'Exact xverify Docker request differs from the execution contract',
        this.name,
      );
    }
    this.spawnInternal(
      input.taskId,
      input.model,
      input.prompt,
      {
        ...input.options,
        settlementRef: input.settlementRef,
        hostTerminalResultContract: {
          version: 1,
          kind: 'terminal-verdict',
          protocol: 'xverify-v1',
        },
      },
      {
        executionContract: contract,
        terminationAuthority: input.terminationAuthority,
        promptSha256: contract.dispatchedPromptSha256,
        taskSnapshotSha256: contract.taskSnapshotSha256,
        executionContractEvidenceRef: contract.evidenceRef,
        executionContractSha256: contract.contractSha256,
      },
    );
    await this.lastSpawnCompletion;
    const dispatch = readTaskResultSettlementDispatch(input.settlementRef);
    if (!dispatch) {
      throw new SpawnBackendError(
        'Exact xverify Docker dispatch did not produce immutable dispatch evidence',
        this.name,
      );
    }
    return Object.freeze({
      settlementRef: Object.freeze({ ...input.settlementRef }),
      outputArtifactRef: exactCrossVerifyOutputArtifactRef(input.settlementRef),
    });
  }

  private spawnInternal(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts?: SpawnBackendOptions,
    exact?: Pick<
      DockerExactCrossVerifyContext,
      | 'executionContract'
      | 'terminationAuthority'
      | 'promptSha256'
      | 'taskSnapshotSha256'
      | 'executionContractEvidenceRef'
      | 'executionContractSha256'
    >,
  ): void {
    // GATE-W2 toggle-independent SAFETY_FLOOR guard — MUST run before any side
    // effect (markPending/mkdir/docker). The default backend previously skipped
    // it while tmux/subprocess enforced it: a lethal actionId could spawn here.
    checkLethalGuard(opts?.actionId, this.name);
    const dir = opts?.projectDir ?? this.projectDir;
    const exactV2 = exact?.executionContract.schemaVersion === 2;
    if (opts?.settlementRef) {
      assertTaskResultSettlementRef(dir, taskId, opts.settlementRef);
    }
    const executionBudget = resolveHostExecutionBudget(dir, taskId, opts?.executionBudget);
    assertExecutionBudgetShape(executionBudget, this.name);
    if (typeof executionBudget?.maxUsd === 'number') {
      assertLiveUsageBudgetSupport(executionBudget, undefined, this.name);
    }
    // A final-only provider CLI (codex/gemini) reports usage once, at the end of
    // the call, so a token ceiling cannot be enforced in flight. Default stays
    // fail-closed. With an explicit owner authorization the ceilings become
    // post-hoc settlement evidence and the ONLY in-flight containment is the
    // host wall clock bounded below — the runtime never claims a live cap it
    // cannot enforce.
    let finalOnlyWallClockSeconds: number | undefined;
    if (hasLiveUsageCeiling(executionBudget)) {
      const provider = getProviderForModel(model);
      const spec = getProviderCommandSpec(provider);
      if (spec?.liveUsage !== 'incremental') {
        const containment = opts?.finalOnlyUsageContainment;
        if (!containment) {
          throw new SpawnBackendError(
            `Docker provider "${provider}" does not expose incremental measured usage; live execution budget cannot be enforced. Spawn blocked before provider work.`,
            this.name,
          );
        }
        if (!Number.isInteger(containment.maxWallClockSeconds) || containment.maxWallClockSeconds <= 0) {
          throw new SpawnBackendError(
            `Final-only usage containment for provider "${provider}" requires a positive integer wall clock. Spawn blocked before provider work.`,
            this.name,
          );
        }
        finalOnlyWallClockSeconds = containment.maxWallClockSeconds;
      }
    }
      assertExecutionLandingSupport({
        budget: executionBudget,
        policy: opts?.executionLandingPolicy,
        mode: opts?.executionAdmissionMode,
        capability: this.executionLandingCapability,
        executor: this.name,
        approvalEvidenceRef: opts?.executionApprovalEvidenceRef,
        approvalGrant: opts?.executionApprovalGrant,
        approvalExpectedDispatch: opts?.executionApprovalExpectedDispatch,
      });
    let gitIsolation: DockerGitIsolation = {
      available: false,
      mountArgs: [],
      envArgs: [],
    };
    if (!exactV2) {
      try {
        gitIsolation = buildDockerGitIsolation(dir);
      } catch (error) {
        throw new SpawnBackendError(
          `Cannot construct a read-only Docker Git view for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
          this.name,
        );
      }
    }
    // Adaptive timeout: prefer per-task override from brainEstimateTimeout(),
    // fall back to constructor value, then DEFAULT_TIMEOUT_SECONDS. An authorized
    // final-only call is additionally bounded by the owner's wall clock — that
    // window IS its containment, so it may only narrow, never widen, the timeout.
    const requestedTimeout = opts?.taskTimeoutSeconds ?? this.timeoutSeconds;
    const effectiveTimeout = finalOnlyWallClockSeconds === undefined
      ? requestedTimeout
      : Math.min(requestedTimeout, finalOnlyWallClockSeconds);
    const settlementRef = opts?.settlementRef ?? createTaskResultSettlementRef(dir, taskId);
    assertTaskResultSettlementRef(dir, taskId, settlementRef);
    const projectTasksDir = join(dir, TASKS_DIR);
    const tasksDir = exactV2
      ? join(dirname(taskResultSettlementAttemptPath(settlementRef)), 'provider-output')
      : projectTasksDir;
    mkdirSync(tasksDir, { recursive: true, mode: exactV2 ? 0o700 : undefined });
    if (exactV2) {
      const taskFileName = `task-${taskId}.json`;
      const sourceTaskPath = join(projectTasksDir, taskFileName);
      const isolatedTaskPath = join(tasksDir, taskFileName);
      if (!existsSync(sourceTaskPath)) {
        throw new SpawnBackendError(
          'Typed xverify isolated output authority has no immutable task snapshot',
          this.name,
        );
      }
      const taskBytes = readFileSync(sourceTaskPath);
      if (existsSync(isolatedTaskPath)) {
        if (!readFileSync(isolatedTaskPath).equals(taskBytes)) {
          throw new SpawnBackendError(
            'Typed xverify isolated task snapshot conflicts with its first writer',
            this.name,
          );
        }
      } else {
        writeFileSync(isolatedTaskPath, taskBytes, { flag: 'wx', mode: 0o600 });
      }
    }
    writeTaskResultSettlementAttemptAtomic(settlementRef);
    writeTaskResultSettlementExecutionBudgetAuthorityAtomic(settlementRef, {
      model,
      budget: executionBudget,
      landingPolicy: opts?.executionLandingPolicy,
      admissionMode: opts?.executionAdmissionMode,
      approvalEvidenceRef: opts?.executionApprovalEvidenceRef,
    });
    let preparedPrompt = prompt;
    let executionLandingContext = opts?.executionLandingContext;
    if (
      exact
      && opts?.executionLandingPolicy
      && hasLiveUsageCeiling(executionBudget)
      && !executionLandingContext
    ) {
      throw new SpawnBackendError(
        'Exact xverify requires a precompiled immutable execution landing context',
        this.name,
      );
    }
    if (
      !exact
      &&
      opts?.executionLandingPolicy
      && hasLiveUsageCeiling(executionBudget)
      && !opts.executionContinuation
    ) {
      let task: Task;
      try {
        task = JSON.parse(readFileSync(join(tasksDir, `task-${taskId}.json`), 'utf-8')) as Task;
      } catch (error) {
        throw new SpawnBackendError(
          `Budget landing context for task ${taskId} could not read the persisted task: ${error instanceof Error ? error.message : String(error)}`,
          this.name,
        );
      }
      // RECOVERY-DO-DOGFOOD diagnosability: this gate compared six fields and
      // reported one opaque sentence, so an operator could not tell WHICH leg
      // disagreed — measured 2026-08-09, it killed spawn attempt 1 on three
      // consecutive dogfood runs and source reading could not resolve it.
      // Same class as the exact-plan drift diagnosis: the decision is unchanged,
      // it only becomes explainable. Values are truncated — this rides an
      // operator message, it is not a data channel.
      const envelopeMismatches = ([
        ['id', task.id, taskId],
        ['model', task.model, model],
        // Compared canonically (sorted keys), NOT with raw JSON.stringify.
        // Measured 2026-08-09: the persisted artifact and the host envelope held
        // byte-equal budget VALUES in a different key order
        // (maxCacheReadTokens 2nd on disk, 4th on host), and the order-sensitive
        // string compare rejected two semantically identical envelopes — killing
        // spawn attempt 1 on every dogfood run. Identity here is the value set,
        // never the serialization order; a genuinely different budget still fails.
        ['budget', canonicalJson(task.budget), canonicalJson(executionBudget)],
        [
          'budgetPolicy.landingPolicy',
          canonicalJson(task.budgetPolicy?.landingPolicy),
          canonicalJson(opts.executionLandingPolicy),
        ],
        [
          'budgetPolicy.admissionMode',
          task.budgetPolicy?.admissionMode,
          opts.executionAdmissionMode ?? 'unattended',
        ],
        [
          'budgetPolicy.approvalEvidenceRef',
          task.budgetPolicy?.approvalEvidenceRef ?? undefined,
          opts.executionApprovalEvidenceRef,
        ],
      ] as const)
        .filter(([, disk, host]) => disk !== host)
        .map(([field, disk, host]) => {
          const render = (value: unknown): string => {
            const text = value === undefined ? '(absent)' : String(value);
            return text.length > 160 ? `${text.slice(0, 160)}…` : text;
          };
          return `${field}: disk=${render(disk)} host=${render(host)}`;
        });
      if (envelopeMismatches.length > 0) {
        throw new SpawnBackendError(
          `Budget landing context for task ${taskId} does not match the host admission envelope`
          + ` — ${envelopeMismatches.length} field(s): ${envelopeMismatches.join('; ')}`,
          this.name,
        );
      }
      const provider = getProviderForModel(model);
      const prepared = prepareDockerExecutionLanding({
        projectRoot: dir,
        task,
        prompt,
        calledProvider: provider,
        calledModel: model,
        auth: task.authMode ?? this.readTaskAuthMode(dir, taskId) ?? 'subscription',
        settlementRef,
        ...(opts.hostTerminalResultContract?.protocol === 'xverify-v1'
          ? { terminalProtocol: 'xverify-v1' as const }
          : {}),
      });
      preparedPrompt = prepared.prompt;
      executionLandingContext = prepared.context ?? undefined;
    }
    let exactContext: DockerExactCrossVerifyContext | undefined;
    if (exact) {
      const executionContract = writeTaskResultSettlementExecutionContractAtomic(
        settlementRef,
        exact.executionContract,
      );
      const promptArtifact = writeTaskResultSettlementPromptAtomic(settlementRef, preparedPrompt);
      if (promptArtifact.promptSha256 !== exact.promptSha256) {
        throw new SpawnBackendError(
          'Exact xverify prompt artifact differs from the execution contract',
          this.name,
        );
      }
      exactContext = Object.freeze({
        ...exact,
        executionContractEvidenceRef: executionContract.evidenceRef,
        executionContractSha256: executionContract.contractSha256,
        promptEvidenceRef: taskResultSettlementPromptEvidenceRef(promptArtifact),
        promptHostPath: taskResultSettlementPromptPath(settlementRef),
      });
    }
    const resolvedOpts: SpawnBackendOptions = {
      ...opts,
      executionBudget,
      settlementRef,
      ...(executionLandingContext ? { executionLandingContext } : {}),
    };

    // Sprint 170 P0-5: mark as pending BEFORE prompt write + lock acquisition.
    // Bridges the ~3s race window between prompt write and .hb creation during
    // which a concurrent cleanup (sibling kill()) would see no .hb and delete
    // the new worker's prompt file. clearPending is called on all error paths.
    markPending(taskId);

    // Sprint 156 Task 10: spawn-time per-file lock acquisition.
    // Reject the spawn if any file in this task's scope.filesWrite is already
    // claimed by a different active task — prevents concurrent worker writes
    // to the same file. Acquired locks are released on container exit
    // (monitorContainer) or forced kill().
    this.acquireSpawnTimeLocks(dir, taskId);

    // Sprint 156 Task 10 (fix): every code path between here and the
    // successful handoff to monitorContainer() must release the spawn locks
    // if it fails — otherwise a transient docker error permanently blocks
    // the file scope for the next worker. monitorContainer's exit handler
    // is what releases on the happy path.
    // Async kuyruk (capture + container-launch) fire-and-forget sözleşmesini
    // bozmadan içeride akar; başarısızlık YETİM-rejection olamaz — temizlik +
    // canonical EXIT_WITHOUT_RESULT-sınıfı typed marker ile attempt settle-edilebilir
    // kalır (FIX-yolu tüketir; sprint-686 FATAL sınıfının kalıcı kapanışı).
    const spawnTail = this.runSpawn(
      taskId,
      model,
      preparedPrompt,
      resolvedOpts,
      dir,
      effectiveTimeout,
      tasksDir,
      gitIsolation,
      exactContext,
    ).then(() => {
      if (!this.containers.has(taskId)) {
        cleanupDockerGitAdapter(gitIsolation.adapter?.hostPath);
      }
    });
    this.lastSpawnCompletion = spawnTail;
    spawnTail.catch((err: unknown) => {
      clearPending(taskId);
      try { releaseAllSpawnLocks(dir, taskId); } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }
      cleanupDockerGitAdapter(gitIsolation.adapter?.hostPath);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[deckent] docker spawn async-tail failed for ${taskId}: ${message}`);
      try {
        const resultPath = join(tasksDir, `task-${taskId}.result`);
        if (!existsSync(resultPath)) {
          const marker = buildExitWithoutResultMarker({
            taskId,
            model,
            exitCode: 1,
            workPresent: false,
            source: 'host',
          }) as unknown as Record<string, unknown>;
          marker['notes'] = `${String(marker['notes'] ?? '')} | spawn-async-tail: ${message}`.trim();
          atomicWriteFileSync(resultPath, `${JSON.stringify(marker, null, 2)}\n`);
        }
      } catch (writeErr) {
        debugLog('docker-backend:spawn-async-fail-marker', writeErr);
      }
    });
  }

  private async runSpawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts: SpawnBackendOptions | undefined,
    dir: string,
    effectiveTimeout: number,
    tasksDir: string,
    gitIsolation: DockerGitIsolation,
    exact?: DockerExactCrossVerifyContext,
  ): Promise<void> {
    const exactV2 = exact?.executionContract.schemaVersion === 2;
    // F1-005 (Sprint 332): resolve this worker's provider up-front so the image
    // readiness honest-fail below can name the EXACT provider-aware rebuild
    // command. codex/gemini CLIs are opt-in build-args in Dockerfile.worker; claude
    // is the lean default. (Re-used downstream for the ProviderCommandSpec lookup.)
    const provider = modelRegistry.get(model)?.provider ?? getDefaultProviderName();
    const attemptRef = opts?.settlementRef;
    if (!attemptRef) {
      throw new SpawnBackendError(
        `Docker settlement authority was not prepared for task ${taskId}`,
        this.name,
      );
    }
    const attemptIdentity: DockerAttemptIdentity = {
      ref: attemptRef,
      containerName: dockerContainerNameForTask(dir, taskId),
      labels: dockerAttemptLabels(attemptRef),
    };
    const prepareAttempt = (): void => {
      claimTaskResultSettlementAttemptAtomic(attemptRef);
      writeTaskResultSettlementPreparedAtomic(attemptRef, model);
    };
    const finalizeNotDispatched = (exitCode: number | null): void => {
      const persisted = finalizeDockerHostTerminalResult(
        dir,
        tasksDir,
        taskId,
        attemptRef,
        exitCode,
      );
      if (!persisted || !closeDockerTaskResultSettlement(attemptRef, 'not-dispatched')) {
        throw new SpawnBackendError(
          `Docker host-terminal settlement could not be durably closed for task ${taskId}`,
          this.name,
        );
      }
    };

    // 455-003 (DOCKER-PREFLIGHT-TRUTH): daemon preflight BEFORE the image lookup.
    // A stopped/forbidden daemon (or an absent docker binary) makes `docker images
    // -q` return empty stdout too — the pre-455-003 code then threw the SAME
    // "image not ready" error, mis-reporting a daemon/permission problem as a
    // missing image and sending the operator to rebuild an image that was never
    // the issue. Classify the daemon reachability first so daemon-permission /
    // daemon-unavailable / docker-absent surface as their OWN distinct codes with
    // evidence, never collapsed into IMAGE_NOT_FOUND.
    const daemonPreflight = probeDockerDaemon();
    if (daemonPreflight) {
      throw new SpawnBackendError(
        `${daemonPreflight.message} (task ${taskId}, provider '${provider}', evidence: ${daemonPreflight.evidence})`,
        'docker',
      );
    }

    // Guard: verify Docker image exists before attempting spawn.
    const executionImage = exactV2
      ? exact.executionContract.adjudication.runtimeImageRef
      : this.image;
    const imageCheck = spawnSync('docker', ['images', '-q', this.image], {
      encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Defensive re-check: if the image query ITSELF reports a daemon/permission/
    // absent failure (the daemon could drop between the preflight and here), honor
    // that distinct classification rather than falling through to image-missing.
    if (!exactV2
      && (imageCheck.error || (imageCheck.status !== null && imageCheck.status !== 0))) {
      const pf = classifyDockerPreflight({
        status: imageCheck.status,
        stderr: imageCheck.stderr,
        spawnError: imageCheck.error ?? null,
      });
      if (pf) {
        throw new SpawnBackendError(
          `${pf.message} (task ${taskId}, provider '${provider}', evidence: ${pf.evidence})`,
          'docker',
        );
      }
    }
    if (!exactV2 && !imageCheck.stdout?.trim()) {
      // Distinct IMAGE-MISSING failure (daemon already confirmed healthy above):
      // the image TAG does not exist locally — a genuinely different remedy than a
      // missing provider-CLI (E088 below) or an unreachable daemon (E085/E086).
      // Provider-aware rebuild command: codex/gemini need their build-arg, claude
      // is the lean default image (Yasa #2 + the ADR-076 auth-precedence lesson).
      throw new SpawnBackendError(
        `${DOCKER_ERROR_CODES.IMAGE_NOT_FOUND}: Docker image '${this.image}' not found locally for provider '${provider}' `
        + `(task ${taskId}) — the image tag does not exist on this host. This is an IMAGE-MISSING failure, `
        + `distinct from an unreachable daemon or a missing provider CLI. `
        + `Build it with: ${workerImageBuildCmdForProvider(this.image, provider)}`,
        'docker',
      );
    }

    // WSL2 memory warning — Docker containers share WSL2 memory pool
    if (process.platform === 'linux') {
      try {
        const procVersion = readFileSync('/proc/version', 'utf-8');
        if (procVersion.includes('microsoft') || procVersion.includes('WSL')) {
          const totalGB = Math.round(totalmem() / (1024 * 1024 * 1024));
          if (totalGB < 6) {
            debugLog('docker-backend:wsl2-memory',
              `WSL2 total memory ${totalGB}GB — Docker workers need ~4GB each. Consider increasing .wslconfig memory.`);
          }
        }
      } catch { /* /proc/version not readable — skip WSL2 check */ }
    }

    // Write prompt to shared .tasks/ volume
    // Hash-based naming: .prompt-{taskId}-{hash} for initial workers,
    // .prompt-{taskId}-{hash}-fix for fix/retry workers (isPriorityFix flag)
    const promptId = randomBytes(8).toString('hex');
    const fixSuffix = opts?.isPriorityFix ? '-fix' : '';
    const promptFileName = `.prompt-${taskId}-${promptId}${fixSuffix}.txt`;
    if (!exact) {
      writeFileSync(join(tasksDir, promptFileName), prompt, 'utf-8');
    }

    // Build the in-container worker command from the provider's declarative
    // ProviderCommandSpec (PSL-1, Sprint 252) — NO claude-hardcode. The spec is
    // the single, centrally-maintained per-provider command definition; this
    // replaces the old block that emitted claude-CLI syntax (`-p -`,
    // `--dangerously-skip-permissions`) for EVERY provider (Sprint 249 root
    // cause: codex/gemini binaries rejected the claude-only flags).
    const containerPromptPath = exact
      ? CONTAINER_EXACT_XVERIFY_PROMPT
      : `${CONTAINER_WORKSPACE}/${TASKS_DIR}/${promptFileName}`;
    const spec = getProviderCommandSpec(provider);
    if (!spec) {
      // Host-only / unknown provider (e.g. ollama) reached the docker backend.
      // MF-2 routes host-adapter providers away before here; if one slips
      // through with no container command spec, honest-fail instead of degrading
      // to the claude CLI (which produced misleading results in Sprint 249).
      const reason =
        `Docker backend has no ProviderCommandSpec for provider "${provider}" (task ${taskId}). `
        + `Host-only providers (e.g. ollama) must run via their host adapter (isAdapterProvider). `
        + `Refusing to spawn a degraded worker.`;
      const honestFail = {
        taskId,
        workerId: `docker-honestfail-${taskId}`,
        filesChanged: [] as string[],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: false,
        selfAssessment: 'NO_GO',
        notes: reason,
        tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider, model },
      };
      prepareAttempt();
      atomicWriteFileSync(
        join(tasksDir, `task-${taskId}.result`),
        `${JSON.stringify(honestFail, null, 2)}\n`,
      );
      finalizeNotDispatched(null);
      console.warn(`[deckent:spawn-backend-docker] ${reason}`);
      return;
    }
    const providerBinary = spec.binary;

    // F1-IMG-SPAWN (364-004 DOCKER-PROVIDER-CLI): image-reality gate — opt-in
    // (see probeProviderCliPresentInImage doc comment for why this cannot be
    // default-on yet). claude is always baked in (no build-arg) so it is never
    // probed. codex/gemini absent from the image → honest-fail BEFORE any
    // `docker run -d` for the actual worker, never a silent claude fallback
    // (Yasa #2). Suggests both the exact rebuild command (workerImageBuildCmdForProvider)
    // and the subprocess backend as an alternative — 364-002 (SUBPROC-PROVIDER-CLI)
    // fixed that backend to resolve the correct CLI per provider, so it is now a
    // genuinely correct fallback route for codex/gemini, not a degraded one.
    if (
      this.verifyProviderCliInImage
      && providerBinary !== 'claude'
      && !probeProviderCliPresentInImage(this.image, providerBinary)
    ) {
      throw new SpawnBackendError(
        `${DOCKER_ERROR_CODES.IMAGE_CLI_MISSING}: Docker image '${this.image}' does not have the '${providerBinary}' CLI `
        + `installed for provider '${provider}' (task ${taskId}) — the image EXISTS but was built without it. `
        + `This is a CLI-MISSING failure, distinct from a missing image or an unreachable daemon. `
        + `Rebuild with: ${workerImageBuildCmdForProvider(this.image, provider)} `
        + `— or route this task to the subprocess backend instead by adding `
        + `\`- Backend: subprocess\` to its directive.`,
        'docker',
      );
    }

    // Sprint 194 W-AUTH A-1 (host-side wire — A23): before spawning a claude
    // container we run the auth health-check on the HOST. The container executes
    // the raw `claude` CLI (no Deckent JS worker process), so the documented
    // CLAUDE_AUTH_REQUIRED check could never fire container-side — authHealthCheck
    // was a zero-caller dead mechanism, and a worker losing Claude auth produced a
    // silent exit-0 with no `.result` (the exact bug it was built to prevent). The
    // container mounts the host ~/.claude credentials, so the host's `claude
    // --version` is representative. On failure authHealthCheck writes an honest
    // AUTH_FAILED NO_GO `.result` (+ emits WORKER→BRAIN:AUTH_FAILED); we then skip
    // the doomed container spawn — Brain collects the real NO_GO instead of timing
    // out on a phantom worker. DECKENT_AUTH_SKIP=1 bypasses the check (test/local).
    if (providerBinary === 'claude') {
      const auth = authHealthCheck(dir, taskId, undefined, { ...process.env, CLAUDE_AUTH_REQUIRED: '1' });
      if (!auth.ok) {
        console.warn(
          `[deckent:spawn-backend-docker] claude auth health-check failed for task ${taskId} `
          + `— wrote AUTH_FAILED NO_GO, skipping container spawn`,
        );
        prepareAttempt();
        finalizeNotDispatched(null);
        return;
      }
    }

    // Sprint 237/252: wire model name (apiId, e.g. claude-opus-4-8, gpt-5.5), not alias.
    const apiId = modelRegistry.get(model)?.apiId ?? model;
    // born-637 (TRACE-CONTENT-PARITY docker-parity): claude-only, docker-local
    // stream-json override — see claudeStreamJsonBaseArgs for why this is safe
    // (token-usage capture unaffected) and why it does NOT touch the shared
    // spec (tmux.ts's claude command is untouched). codex/gemini keep spec as-is
    // (their docker-parity is a tracked follow-up, not silently changed here).
    // 7094-F3 (flag-gated via opts.systemPromptCore, default true): the
    // task-invariant worker core rides `--system-prompt-file <file>` —
    // auto-discovery (CLAUDE.md/skills/hooks/MCP) off, composition fully
    // deckent-owned. The core file is content-addressed so an unchanged core
    // maps to the same path across workers (stable system-prompt identity).
    let coreArgs: readonly string[] = [];
    let coreArtifact: WorkerCoreArtifact | null = null;
    let injectionChannel: PromptInjectionChannel | null = null;
    if (providerBinary === 'claude' && opts?.systemPromptCore) {
      coreArtifact = publishWorkerCoreArtifact(dir, opts.systemPromptCore);
      const coreName = `.worker-core-${coreArtifact.sha256}.md`;
      injectionChannel = 'claude-system-prompt-file';
      // F3-v2 (measured 2026-08-19, sprint-570): `--bare` also bypassed
      // credential discovery in the container (init apiKeySource:"none" →
      // "Not logged in", two $0 honest NO_GOs, scheduler fail-fast). The
      // composition goal is met WITHOUT bare: --system-prompt-file replaces
      // the default system prompt, and CLAUDE.md loading is disabled via the
      // official CLAUDE_CODE_DISABLE_CLAUDE_MDS env (injected below) — auth
      // and the normal tool set stay intact.
      // 7094-F2b (measured with the F3 core, 2026-08-19): under deckent-owned
      // composition the CLI's own slash-command/skill catalog is dead prefix
      // weight — deckent injects task-relevant skills through the prompt
      // itself (F1c domain-overlap selection), never through the CLI catalog
      // (the workspace mount was feeding unrelated repo design skills to
      // every worker). Rides WITH systemPromptCore so the two ship as one
      // "deckent-owned composition" mode; plain (core-off) spawns keep the
      // stock catalog untouched.
      coreArgs = [
        '--system-prompt-file', `${CONTAINER_WORKSPACE}/.tasks/${coreName}`,
        '--disable-slash-commands',
      ];
    } else if (
      spec.systemPromptCoreArgs
      && this.codexCoreChannel
      && opts?.systemPromptCore
    ) {
      coreArtifact = publishWorkerCoreArtifact(dir, opts.systemPromptCore);
      const coreName = `.worker-core-${coreArtifact.sha256}.md`;
      injectionChannel = 'codex-model-instructions-file';
      const containerCorePath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/${coreName}`;
      coreArgs = spec.systemPromptCoreArgs(containerCorePath);
    }
    const dockerSpec: ProviderCommandSpec = providerBinary === 'claude'
      ? { ...spec, baseArgs: [...coreArgs, ...claudeStreamJsonBaseArgs(spec.baseArgs)] }
      : {
          ...spec,
          baseArgs: [
            ...coreArgs,
            ...(this.codexSuppressProjectDoc ? spec.contextSuppressionArgs ?? [] : []),
            ...spec.baseArgs,
          ],
        };
    // IMMUTABLE — deckent workers run with full autonomy (autoApprove). The spec
    // maps that to the correct per-provider flag (claude --dangerously-skip-
    // permissions, codex --dangerously-bypass-approvals-and-sandbox, gemini yolo).
    const workerCmd = buildProviderCommand(dockerSpec, apiId, containerPromptPath, {
      // born-471 (ALLOWLIST-SSOT): re-derived from the task's own on-disk
      // scope, not trusted verbatim from opts.allowedTools — see the
      // ALLOWLIST-SSOT block comment above resolveAllowedTools.
      allowedTools: this.resolveAllowedTools(dir, taskId, opts?.allowedTools),
      // `availableTools` narrows the provider-visible schema itself — distinct
      // from the write/permission authority above. 7094-F2a MEASURED AND
      // REJECTED (2026-08-19, sprint-568 vs 569 single-variable A/B): defaulting
      // claude workers to the six-name `--tools` set RAISED cost +20-38% —
      // cacheWrite +70% (21.5k→36.6k simple-task), fresh input collapsed
      // 3.38k→~6 (the excluded-dynamic first-message block became cached
      // 1.25×-priced write), cacheRead +38%. The narrowed schema changes the
      // CLI's prompt/cache composition unfavorably; the 32-tool catalog prefix
      // was already cache-shared across workers. Default stays undefined; a
      // protocol-scoped caller (xverify-v1) still sets it explicitly.
      availableTools: opts?.availableTools,
      isolatedContext: opts?.isolatedContext,
      autoApprove: true,
      // F1-RE (Sprint 252): resolved model reasoning-effort (claude --effort,
      // codex -c model_reasoning_effort); undefined → no flag (CLI default).
      reasoningEffort: opts?.reasoningEffort,
      // F3.1: prefix-stable system prompt inside the container (per-machine sections
      // → first user message). Only the claude spec emits the flag; others ignore it.
      // F3: with --system-prompt-file the default system prompt is replaced,
      // so the exclude-dynamic flag is meaningless — drop it for a clean argv.
      excludeDynamicPromptSections: opts?.systemPromptCore
        ? undefined
        : opts?.excludeDynamicPromptSections,
    });
    if (coreArtifact && injectionChannel) {
      const compileReceipt = readPromptDeliveryReceipt(dir, taskId);
      if (compileReceipt.state !== 'AVAILABLE') {
        throw new SpawnBackendError(
          `Prompt delivery receipt unavailable for exact runtime binding: ${compileReceipt.reason}`,
          this.name,
        );
      }
      finalizePromptDeliveryReceipt({
        projectRoot: dir,
        taskId,
        attemptId: attemptRef.attemptId,
        provider: providerBinary,
        coreArtifactPath: coreArtifact.relativePath,
        coreSha256: coreArtifact.sha256,
        coreBytes: coreArtifact.bytes,
        roleProfile: compileReceipt.receipt.rolePolicyIdentity,
        injectionChannel,
        contextSuppressionFlags: providerBinary === 'claude'
          ? ['CLAUDE_CODE_DISABLE_CLAUDE_MDS=1', '--disable-slash-commands']
          : this.codexSuppressProjectDoc ? [...(spec.contextSuppressionArgs ?? [])] : [],
        providerArgv: workerCmd,
      });
    }
    // WORKER-GIT-GUARD (381-001): shadow `git` inside the container with a
    // denylist shim (stash/reset/checkout/clean/rebase/commit/revert -> exit
    // 97). Host-writes the shim then bind-mounts it READ-ONLY (same
    // technique as the .deck shadow-mount below) so a worker cannot
    // delete/edit it to bypass the guard. See git-worker-guard.ts's
    // CONTAINER_GIT_PATH doc comment for why the real-git path is a hardcoded
    // constant rather than probed per-spawn.
    //
    // The mount-args/PATH-export are pure string computations, resolved here;
    // the actual shim FILE is written further below, right after the real
    // worker script (scriptHostPath) is written. Both scripts start with the
    // literal `#!/bin/sh` line, and this repo's test suite is already
    // grandfathered on finding the worker script via a
    // `startsWith('#!/bin/sh')` scan of every writeFileSync call — writing
    // the shim first would make it the (wrong) first match. `docker run`
    // itself happens well after both writes, so the container never sees an
    // unfinished mount either way.
    const gitGuardHostDir = buildGitGuardDir(taskId);
    const gitGuard = buildDockerGitGuardArgs(gitGuardHostDir, CONTAINER_WORKSPACE);

    const resultPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.result`;
    const timeoutPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.timeout`;
    // Build docker run args
    // Run as host user to avoid root — Claude CLI blocks --dangerously-skip-permissions as root
    const uid = process.getuid?.() ?? 1000;
    const gid = process.getgid?.() ?? 1000;
    const home = this.homeDir;

    // Container HOME: use /tmp/deckent-home to avoid missing host HOME directory
    // Host HOME (e.g. /home/alperen) doesn't exist in container filesystem.
    // Claude CLI needs a writable HOME for config + cache.
    const containerHome = '/tmp/deckent-home';

    // Per-task auth mode override (Sprint 193+). Subscription workers receive
    // only credential files; global provider homes/settings/MCP/skills never
    // enter the container.
    const taskAuthMode = this.readTaskAuthMode(dir, taskId);
    const useApiOnly = taskAuthMode === 'api';
    // OPENROUTER-PROVIDER (row 477): `BASE_PROVIDER_CREDENTIAL_ENV` intentionally
    // does NOT cover every ProviderName — it is the ADR-076 cross-leak/scrub map of
    // providers whose credential travels through `process.env`. `ollama` (local, no
    // key) and `openrouter` are both absent BY DESIGN: OpenRouter's key is read from
    // `.deck` host-side and injected only into its own spawned child's env, never
    // into this process's `process.env` (`applyDeckSecretsToEnv` has no OpenRouter
    // branch), so there is nothing here to leak or scrub. Adding an entry to satisfy
    // the compiler would encode a credential path that does not exist. The lookup is
    // typed as possibly-absent instead; the `!providerCredentialEnv` guard below
    // already handles that case and is the pre-existing behavior for `ollama`.
    const providerCredentialEnv: string | undefined =
      (BASE_PROVIDER_CREDENTIAL_ENV as Record<string, string | undefined>)[provider];
    if (useApiOnly && (!providerCredentialEnv || !process.env[providerCredentialEnv])) {
      throw new SpawnBackendError(
        `Task ${taskId} declares "Auth: api" but ${providerCredentialEnv ?? 'the provider credential env'} ` +
        `for ${providerBinary} is not set. ` +
        `Either set the env var or change the task to "Auth: subscription".`,
        'docker',
      );
    }
    const providerAuthBroker: ProviderAuthIsolationOptions = useApiOnly
      ? {}
      : prepareProviderAuthBroker(
          dir,
          provider,
          resolveProviderHostCredentialRoot(
            home,
            provider,
            spec.oauthHomeDir ?? undefined,
            this.platform,
          ),
        );
    const providerAuth = buildProviderAuthIsolation(
      home,
      provider,
      // `ProviderCommandSpec.oauthHomeDir` is `string | null` (null = provider has
      // no host OAuth home to isolate — true for key-only providers); the helper
      // takes `string | undefined`. Both spell "nothing to mount", so normalize.
      // Surfaced by the row-477 ProviderName widening, but pre-existing.
      spec.oauthHomeDir ?? undefined,
      useApiOnly,
      existsSync,
      providerAuthBroker,
    );
    if (!useApiOnly && spec.oauthHomeDir && providerAuth.missingRequiredFiles.length > 0) {
      throw new SpawnBackendError(
        `Required isolated ${providerBinary} credential file(s) are unavailable for task ${taskId}: ` +
        `${providerAuth.missingRequiredFiles.join(', ')}. ` +
        `refusing to mount the full host provider home.`,
        'docker',
      );
    }
    if (!useApiOnly && providerBinary === 'gemini') {
      const geminiAuthSelection = buildGeminiAuthSelectionBootstrap(home);
      if (!geminiAuthSelection) {
        throw new SpawnBackendError(
          `Gemini subscription auth selection is unavailable for task ${taskId}; ` +
          `refusing to mount the full host provider settings.`,
          'docker',
        );
      }
      providerAuth.bootstrapLines.push(...geminiAuthSelection.bootstrapLines);
    }
    const providerPrincipalDigest = resolveDockerProviderPrincipalDigest({
      provider,
      authMode: useApiOnly ? 'api' : 'subscription',
      accountRefHash: exact?.executionContract.accountRefHash,
      apiCredential: providerCredentialEnv
        ? process.env[providerCredentialEnv]
        : undefined,
      credentialSources: providerAuthBroker.credentialSources,
    });
    const providerExecutionObservationBinding: DockerProviderExecutionObservationBinding = {
      executionId: dockerProviderExecutionId({
        projectRootSha256: attemptRef.projectRootSha256,
        taskId,
        attemptId: attemptRef.attemptId,
      }),
      runId: attemptRef.projectRootSha256,
      taskId,
      attemptId: attemptRef.attemptId,
      providerPrincipalDigest,
    };
    const providerExecutionObservationShell =
      buildDockerProviderExecutionObservationShell(providerExecutionObservationBinding);

    // Write worker script to .tasks/ — avoids shell quoting issues with allowedTools parentheses
    const scriptFileName = `.worker-${taskId}.sh`;
    const scriptHostPath = join(tasksDir, scriptFileName);
    const hbContainerPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.hb`;
    // Sprint 139: fsync_file helper ensures data hits disk before SIGKILL arrives.
    // Uses dd + sync as POSIX-portable fsync (no Python/perl dependency in Alpine).
    // Sprint 145: TIMEOUT_WITH_WORK EXIT trap function — detects partial work via git diff
    // When worker is killed (non-zero exit) but has modified files, writes TIMEOUT_WITH_WORK
    // result instead of blind NO_GO. Brain can then reconcile via Spurious NO_GO helper.
    // Sprint 272 T-003: EXIT-trap extracted to buildOnExitTrap() — adds a
    // last-chance flush window + enriched EXIT_WITHOUT_RESULT marker (workPresent +
    // diffStat + last hb) for clean exit-0 without .result, while preserving the
    // TIMEOUT_WITH_WORK path. See buildOnExitTrap above.
    // born-667b (RECON-DIFF, task 427-024): narrow the container's git-diff
    // work-present signal to THIS task's own scope.filesWrite — see
    // buildOnExitTrap's doc comment for why an unfiltered diff false-positives
    // on concurrent sibling workers (TT550 phantom-vakası).
    const scopeFilesWrite = this.readTaskFilesWrite(dir, taskId);
    const onExitFn = buildOnExitTrap(taskId, model, scopeFilesWrite);

    // 455-003 (TIMEOUT-BASELINE-TRUTH): the container path of the task-start
    // content baseline manifest (written host-side below, before `docker run`).
    // buildOnExitTrap reads $BASEFILE to subtract pre-existing / sibling dirt from
    // the TIMEOUT_WITH_WORK / workPresent signal.
    const baselineContainerPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.scope-baseline`;

    // Sprint 151: .partial-result path — intermediate checkpoint for OOM kill recovery
    const partialResultPath = `${CONTAINER_WORKSPACE}/${TASKS_DIR}/task-${taskId}.partial-result`;
    const scriptContent = [
      '#!/bin/sh',
      // WORKER-GIT-GUARD (381-001): shadow real git for the whole script,
      // including whatever the worker CLI's own tool-calls spawn.
      gitGuard.exportPathLine,
      `RFILE="${resultPath}"`,
      `HBFILE="${hbContainerPath}"`,
      `PRFILE="${partialResultPath}"`,
      `BASEFILE="${baselineContainerPath}"`,
      // POSIX-portable fsync: copy file to itself via dd conv=fsync
      // This forces OS buffer cache → disk. Survives SIGKILL after return.
      'fsync_file() { [ -f "$1" ] && dd if="$1" of="$1.fsync" bs=4096 conv=fsync 2>/dev/null && mv "$1.fsync" "$1" 2>/dev/null; }',
      ...providerExecutionObservationShell,
      // Sprint 145: git-diff-aware EXIT trap function
      onExitFn,
      // Claude CLI stores per-session state below session-env/<session-id>.
      // This must be a directory inside the task-private tmpfs HOME. Creating a
      // file here caused ENOTDIR and made workers appear logged out/broken.
      ...buildProviderPrivateHomeBootstrap(containerHome, providerBinary),
      ...providerAuth.bootstrapLines,
      // Sprint 151: Write .partial-result BEFORE Claude CLI starts — OOM kill safety net.
      // If container is SIGKILL'd (OOM), this file survives on the shared volume.
      // Host-side monitorContainer promotes it to .result with NO_GO_PARTIAL assessment.
      `cat > "$PRFILE" <<PARTIALEOF`,
      `{"taskId":"${taskId}","selfAssessment":"NO_GO","notes":"Worker started but did not complete — partial-result written at startup. If you see this, the container was likely OOM-killed or force-stopped before the worker CLI could write a .result.","partialMarker":true,"tokenUsage":{"inputTokens":0,"outputTokens":0,"cacheReadTokens":0,"provider":"${provider}","model":"${model}"}}`,
      'PARTIALEOF',
      'fsync_file "$PRFILE"',
      // EXIT trap: Sprint 145 — calls on_exit() which detects partial work via git diff
      'trap on_exit EXIT',
      // Docker signals PID1 only. A POSIX shell defers TERM traps while it waits
      // on a foreground child, so the provider used to keep spending until the
      // hard-stop timer even after a cooperative landing request. Track the
      // existing timeout supervisor as a child and forward TERM to it; coreutils
      // timeout then forwards TERM to the provider command it already supervises.
      'PROVIDER_PID=""',
      'on_provider_term() {',
      '  trap "" TERM',
      '  if [ -n "$PROVIDER_PID" ]; then',
      '    kill -TERM "$PROVIDER_PID" 2>/dev/null || true',
      '    wait "$PROVIDER_PID" 2>/dev/null || true',
      '  fi',
      '  CLAUDE_EXIT=143',
      '  record_provider_execution_end aborted || CLAUDE_EXIT=79',
      ...(providerAuth.writebackLines ?? []).map(line => `  ${line}`),
      '  fsync_file "$RFILE"',
      '  fsync_file "$HBFILE"',
      '  exit 143',
      '}',
      'trap on_provider_term TERM',
      `TIMEOUT=\${TASK_TIMEOUT:-${effectiveTimeout}}`,
      // PSL-1 (Sprint 252): feed the prompt per the spec's promptFeed — 'stdin'
      // providers (claude `-p -`, codex `exec`) read the prompt FILE via `< …`;
      // 'inline' providers (gemini `-p "$(cat …)"`) already embed it in workerCmd.
      // born-466: -k 30 hard-KILLs a TERM-swallowing worker; the exit code is
      // captured in CLAUDE_EXIT (read by on_exit) instead of being masked by
      // `|| echo` + the trailing rm. The .timeout marker is timeout-PURE now:
      // only 124 (TERM-timeout) / 137 (KILL) qualify — a crash/CLI-arg error is
      // NOT a timeout — and never when a real .result already exists.
      'record_provider_execution_start || exit 79',
      `timeout -k 30 $TIMEOUT ${workerCmd}${spec.promptFeed === 'stdin' ? ` < "${containerPromptPath}"` : ''} &`,
      'PROVIDER_PID=$!',
      'wait "$PROVIDER_PID"',
      'CLAUDE_EXIT=$?',
      'PROVIDER_PID=""',
      'if [ "$CLAUDE_EXIT" -eq 0 ]; then PROVIDER_OBSERVATION_OUTCOME=completed; elif [ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 137 ] || [ "$CLAUDE_EXIT" -eq 143 ]; then PROVIDER_OBSERVATION_OUTCOME=aborted; else PROVIDER_OBSERVATION_OUTCOME=failed; fi',
      'record_provider_execution_end "$PROVIDER_OBSERVATION_OUTCOME" || CLAUDE_EXIT=79',
      ...(providerAuth.writebackLines ?? []),
      `if [ "$CLAUDE_EXIT" -eq 124 ] || [ "$CLAUDE_EXIT" -eq 137 ]; then [ ! -f "$RFILE" ] && echo "WORKER_TIMEOUT" > "${timeoutPath}"; fi`,
      // Sprint 151: Clean up .partial-result on normal exit — on_exit/EXIT trap handles abnormal exit
      'rm -f "$PRFILE" 2>/dev/null',
    ].join('\n');
    writeFileSync(scriptHostPath, scriptContent, { mode: 0o755 });

    // WORKER-GIT-GUARD (381-001): materialize the shim now (see the
    // gitGuardHostDir/gitGuard comment above for why this write is deferred
    // to after the real worker script). `docker run` — the earliest point the
    // container could actually read the bind-mounted shim — still happens
    // well after this synchronous call returns.
    installGitGuard(gitGuardHostDir, CONTAINER_GIT_PATH);
    materializeDockerGitIsolation(gitIsolation);

    const containerCmd = `sh ${CONTAINER_WORKSPACE}/${TASKS_DIR}/${scriptFileName}`;

    const containerName = attemptIdentity.containerName;

    // F1-LIM faz-2a (Sprint 272): kind-based memory limit — opt-in override.
    // Falls back to constructor memoryLimit/memorySwap when kind not configured.
    const kindLimits = this.resolveKindMemoryLimits(dir, taskId);
    const effectiveMemory = kindLimits?.memory ?? this.memoryLimit;
    const effectiveSwap = kindLimits?.swap ?? this.memorySwap;
    // DECK-WORKER-ISOLATION (ADR-G-005): hide the project's `.deck` secret file
    // from the worker. The project root is bind-mounted read-write at /workspace,
    // so `.deck` would otherwise be worker-readable. Overlay an empty read-only
    // file at /workspace/.deck — ONLY when a real `.deck` exists (shadowing a
    // missing file would materialize a phantom host `.deck` via the nested bind
    // mount; see buildDeckShadowMountArgs). The shadow source is a regular 0-byte
    // file so docker cannot create a `.deck` directory on the target.
    const deckExists = !exactV2 && existsSync(join(dir, DECK_FILE_NAME));
    const deckShadowHostPath = deckExists
      ? ensureDeckShadowFile(tasksDir)
      : join(tasksDir, '.deck-shadow');
    const deckShadowMountArgs = buildDeckShadowMountArgs(deckExists, deckShadowHostPath);

    // born-644 (428-012 BUILD-VIOLATION-GUARD, B542): read-only dist/ overlay — see
    // buildDistReadOnlyMountArgs doc comment. Mechanical enforcement of the
    // WORKER-GUIDE.md "no build in worker" rule, complementing (not replacing) the
    // post-exit dist-mtime sentinel (distFingerprintBefore/After below).
    const distHostPath = join(dir, 'dist');
    const distReadOnlyMountArgs = exactV2
      ? []
      : buildDistReadOnlyMountArgs(existsSync(distHostPath), distHostPath);

    // 593-001 F2c (flag-gated, default OFF): empty read-only overlays that hide the
    // repo's design catalogs (.claude/skills, .claude/agents) from the worker's mount
    // view — see buildCatalogMaskMountArgs. Only catalogs that EXIST on the host are
    // masked (a nested bind over a missing target would phantom-create it in the repo).
    // ADR-G-027: prompt-side skill injection (buildSkillBlock) is untouched.
    const catalogMaskEnabled = !exactV2 && this.catalogMountMask;
    const presentCatalogPaths = catalogMaskEnabled
      ? CATALOG_MASK_RELATIVE_PATHS.filter(rel => existsSync(join(dir, rel)))
      : [];
    const catalogMaskMountArgs = buildCatalogMaskMountArgs(
      catalogMaskEnabled,
      catalogMaskEnabled && presentCatalogPaths.length > 0
        ? ensureCatalogMaskDir(tasksDir)
        : join(tasksDir, CATALOG_MASK_DIR_NAME),
      presentCatalogPaths,
    );

    const dockerArgs: string[] = [
      'run', '-d',
      '--name', containerName,
      ...Object.entries(attemptIdentity.labels).flatMap(([key, value]) => ['--label', `${key}=${value}`]),
      // Run as host user (non-root) — required for --dangerously-skip-permissions
      '--user', `${uid}:${gid}`,
      // HOME must point to a directory that EXISTS in the container
      '-e', `HOME=${containerHome}`,
      // Memory limits — Claude CLI peak ~4-6GB (Sprint 166 Bug G OOM forensic), 8g + 12g headroom
      // F1-LIM faz-2a: kind-based override when worker_memory_limit_by_kind configured
      '--memory', effectiveMemory,
      '--memory-swap', effectiveSwap,
      // Writable HOME via tmpfs — Claude CLI needs to write config/cache here
      '--tmpfs', `${containerHome}:size=${this.homeTmpfsSize},uid=${uid},gid=${gid}`,
      // Typed xverify receives an empty ephemeral workspace; implementation
      // workers retain the project read-write mount.
      ...(exactV2
        ? ['--tmpfs', `${CONTAINER_WORKSPACE}:size=64m,uid=${uid},gid=${gid}`]
        : ['-v', `${dir}:${CONTAINER_WORKSPACE}`]),
      // Git metadata is control-plane state, not worker output. Overlay the
      // worktree's .git entry read-only and expose the common/worktree metadata
      // through container-native paths so linked worktrees work on every host.
      ...gitIsolation.mountArgs,
      ...gitIsolation.envArgs,
      // born-644 (428-012 BUILD-VIOLATION-GUARD, B542): read-only dist/ overlay —
      // mechanical "no build in worker" enforcement (nested mount, shadows only
      // /workspace/dist as read-only; see buildDistReadOnlyMountArgs).
      ...distReadOnlyMountArgs,
      // DECK-WORKER-ISOLATION (ADR-G-005): read-only empty overlay hiding .deck
      // (nested mount, applied after the project root so it shadows /workspace/.deck)
      ...deckShadowMountArgs,
      // 593-001 F2c: flag-gated empty read-only overlays masking the design catalogs
      // (nested mounts, applied after the project root so they shadow
      // /workspace/.claude/skills + /workspace/.claude/agents). Zero args when
      // `prompt.catalog_mount_mask` is false (the default).
      ...catalogMaskMountArgs,
      // WORKER-GIT-GUARD (381-001): read-only git-shim overlay (see above).
      ...gitGuard.mountArgs,
      ...(exact ? exactCrossVerifyPromptMountArgs(exact.promptHostPath) : []),
      ...(exact ? exactCrossVerifyEvidenceMountArgs(exact.executionContract, dir) : []),
      // .tasks/ mounted read-write (results, heartbeats, prompts)
      '-v', `${tasksDir}:${CONTAINER_WORKSPACE}/${TASKS_DIR}`,
      // .locks/ mounted read-write (file locking)
      ...(!exactV2
        ? ['-v', `${join(dir, '.locks')}:${CONTAINER_WORKSPACE}/.locks`]
        : []),
      // Auth-only isolation: never mount the complete host provider home. The
      // worker script copies read-only credential mounts into its private tmpfs
      // HOME before invoking the provider CLI.
      ...providerAuth.mountArgs,
      // Working directory
      '-w', CONTAINER_WORKSPACE,
    ];

    // Pass Deckent worker context env vars (for SIGTERM handler in worker.ts)
    dockerArgs.push('-e', `DECKENT_TASK_ID=${taskId}`);
    dockerArgs.push('-e', `DECKENT_PROJECT_ROOT=${CONTAINER_WORKSPACE}`);
    // 7094-F3-v2: when the worker core rides --system-prompt-file, CLAUDE.md
    // memory loading is disabled via the official env switch (code.claude.com
    // env-vars) instead of --bare, which also killed credential discovery
    // (sprint-570 measured: apiKeySource "none" → "Not logged in").
    if (opts?.systemPromptCore && providerBinary === 'claude') {
      dockerArgs.push('-e', 'CLAUDE_CODE_DISABLE_CLAUDE_MDS=1');
    }
    // Adaptive timeout: pass computed timeout to container as env var
    dockerArgs.push('-e', `TASK_TIMEOUT=${effectiveTimeout}`);
    // Sprint 156 T-006: stable per-spawn idempotency key — promptId is already a fresh
    // 16-hex-char random token unique to this worker invocation. Workers should use this
    // value as the `Idempotency-Key` header for any external API call so retries are safe.
    dockerArgs.push('-e', `IDEMPOTENCY_KEY=${promptId}`);
    // Surface effective auth mode to the container (used by worker prompt for
    // model self-awareness; not required by Claude CLI itself).
    dockerArgs.push('-e', `DECKENT_AUTH_MODE=${useApiOnly ? 'api' : 'subscription'}`);
    // Sprint 194 W-AUTH A-1: surface the auth-required state to the container
    // (used by the worker prompt / DECKENT_AUTH_MODE self-awareness). The ACTUAL
    // auth health-check now runs HOST-side, pre-spawn (see A23 wire above) —
    // because the container executes the raw claude CLI with no Deckent JS worker
    // to read this flag, the original container-side check could never fire. This
    // env var is kept for parity/observability and the WM-5 provider-gate contract.
    // WM-5: gate to claude-only — codex/gemini/ollama must not receive this flag.
    if (providerBinary === 'claude') {
      dockerArgs.push('-e', 'CLAUDE_AUTH_REQUIRED=1');
    }
    // Sprint 194 T-004 (W-M M-2): bind V8 heap to the container memory cap.
    // Explicit -e overrides any leaked process.env.NODE_OPTIONS — workers must
    // get the deterministic Deckent value, not whatever the host shell carries.
    dockerArgs.push('-e', WORKER_NODE_OPTIONS);

    // Sprint 214 T-214-001 + F1-014r (Sprint 331) — provider + auth-aware env
    // forwarding with a RUNTIME per-worker NON-LEAK invariant: each container
    // receives ONLY its own provider's credential env var, never a foreign one
    // (canonical provider→key map mirrors provider.ts applyDeckSecretsToEnv:
    // claude→ANTHROPIC_API_KEY, codex→OPENAI_API_KEY, gemini→GOOGLE_API_KEY).
    //
    // - claude: ANTHROPIC_API_KEY MUST NOT leak in subscription mode — the claude
    //   CLI prefers the env var over the mounted ~/.claude session, so forwarding
    //   the host key silently demotes `auth_mode: subscription` into API mode →
    //   Tier-1 timeout → the exact mass-synthetic-NO_GO that killed Sprint 213
    //   (ADR-076). Forward it ONLY in api mode (useApiOnly; the throw above already
    //   requires the key to be present for that branch).
    // - codex API mode → OPENAI_API_KEY only; gemini API mode → GOOGLE_API_KEY
    //   only. Subscription mode uses the isolated OAuth credential files above
    //   and MUST NOT inherit an API key that changes billing/auth precedence.
    //   The previous
    //   blanket `providerBinary !== 'claude'` guard forwarded BOTH OPENAI and
    //   GOOGLE to ANY non-claude worker, so a codex worker leaked GOOGLE_API_KEY
    //   and a gemini worker leaked OPENAI_API_KEY whenever a dev had several
    //   provider keys in the host env (mixed-provider sprint). Gating each key to
    //   its own provider makes the cross-leak structurally impossible (F1-014r).
    // - ollama is host-only: getProviderCommandSpec returns null and the spawn
    //   honest-fails above before reaching here, so it never receives any key.
    // This is an explicit per-provider allowlist by design — a new provider must
    // add its own credential forward here (auditable), never inherit one.
    // DECKENT_DEBUG is auth-orthogonal and always forwarded when set on the host.
    //
    // F1-014 phase-2: the credential env var NAME for each provider is sourced from
    // the shared BASE_PROVIDER_CREDENTIAL_ENV map (providers/cross-provider-keys.ts)
    // — the SAME single source of truth the subprocess backend's scrub set derives
    // from, so the two allowlists can never drift. Behaviour is byte-for-byte the
    // prior explicit literals while applying the auth-mode gate uniformly:
    // claude/codex/gemini forward their own credential env ONLY in api mode.
    const claudeKeyEnv = BASE_PROVIDER_CREDENTIAL_ENV.claude;
    const codexKeyEnv = BASE_PROVIDER_CREDENTIAL_ENV.codex;
    const geminiKeyEnv = BASE_PROVIDER_CREDENTIAL_ENV.gemini;
    if (providerBinary === 'claude') {
      if (useApiOnly && process.env[claudeKeyEnv]) {
        dockerArgs.push('-e', `${claudeKeyEnv}=${process.env[claudeKeyEnv]}`);
      }
    } else if (providerBinary === 'codex' && useApiOnly && process.env[codexKeyEnv]) {
      dockerArgs.push('-e', `${codexKeyEnv}=${process.env[codexKeyEnv]}`);
    } else if (providerBinary === 'gemini' && useApiOnly && process.env[geminiKeyEnv]) {
      dockerArgs.push('-e', `${geminiKeyEnv}=${process.env[geminiKeyEnv]}`);
    }
    if (process.env.DECKENT_DEBUG) {
      dockerArgs.push('-e', `DECKENT_DEBUG=${process.env.DECKENT_DEBUG}`);
    }

    debugLog('docker-backend:spawn', `taskId=${taskId} container=${containerName} model=${model}`);

    // born-644 (BUILD-VIOLATION-GUARD): snapshot dist/ BEFORE the container starts — see the
    // dist-mtime sentinel block comment above computeDistFingerprint for why this is the
    // right moment (this is the last host-side checkpoint before the container gains write
    // access to the mounted project root).
    const distFingerprintBefore = computeDistFingerprint(join(dir, 'dist'));

    // 455-003 (TIMEOUT-BASELINE-TRUTH): capture the task-start CONTENT baseline of
    // this task's scoped files — SAME host-side checkpoint as the dist snapshot,
    // the last moment before the container can write to the shared bind-mount. The
    // in-container EXIT-trap reads it via $BASEFILE to subtract pre-existing /
    // sibling dirt from the TIMEOUT_WITH_WORK / workPresent signal. Attribution
    // authority is mandatory: capture failure blocks before provider process
    // birth instead of degrading to a final shared-tree diff.
    try {
      const baselineManifest = await captureScopeAttributionManifest(
        dir,
        attemptRef.attemptId,
        scopeFilesWrite,
      );
      publishWorkAttributionBaseline(attemptRef, baselineManifest);
      writeFileSync(join(tasksDir, `task-${taskId}.scope-baseline`), baselineManifest, 'utf-8');
    } catch (e) {
      throw new SpawnBackendError(
        `Task ${taskId} attribution baseline could not be captured: ${e instanceof Error ? e.message : String(e)}`,
        this.name,
      );
    }

    // Sprint 163 T-002: retry spawn with health check.
    // Each attempt: docker run + 3s wait + docker inspect. If inspect reports
    // Running=true OR Running=false+ExitCode=0 (instant-exit success), proceed.
    // Otherwise, classify stderr and retry up to MAX_SPAWN_ATTEMPTS.
    prepareAttempt();
    if (exact) {
      const artifact = readTaskResultSettlementPrompt(attemptRef);
      const executionContract = readTaskResultSettlementExecutionContract(attemptRef);
      const prepared = readTaskResultSettlementPrepared(attemptRef);
      let taskSnapshotSha256: string | null = null;
      try {
        const taskSnapshot = JSON.parse(
          readFileSync(join(tasksDir, `task-${taskId}.json`), 'utf-8'),
        ) as unknown;
        taskSnapshotSha256 = createHash('sha256')
          .update(canonicalJson(taskSnapshot))
          .digest('hex');
      } catch {
        taskSnapshotSha256 = null;
      }
      if (!artifact
        || artifact.promptSha256 !== exact.promptSha256
        || taskResultSettlementPromptEvidenceRef(artifact) !== exact.promptEvidenceRef
        || taskResultSettlementPromptPath(attemptRef) !== exact.promptHostPath
        || !prepared
        || prepared.model !== model
        || taskSnapshotSha256 !== exact.taskSnapshotSha256
        || !executionContract
        || executionContract.evidenceRef !== exact.executionContractEvidenceRef
        || executionContract.contractSha256 !== exact.executionContractSha256) {
        throw new SpawnBackendError(
          'Exact xverify final pre-dispatch authority verification failed',
          this.name,
        );
      }
      const terminationBinding = exact.terminationAuthority.bindPreparedAttempt({
        settlementRef: attemptRef,
        executionContract,
      });
      if (!terminationBinding
        || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(terminationBinding.bindingId)
        || !terminationBinding.evidenceRef
        || !terminationBinding.authorityRef
        || /[\u0000-\u001f\u007f]/u.test(
          `${terminationBinding.evidenceRef}${terminationBinding.authorityRef}`,
        )) {
        throw new SpawnBackendError(
          'Exact xverify termination binding authority returned invalid evidence',
          this.name,
        );
      }
    }
    const providerExecutionFence = taskResultSettlementActiveClaimDigest(attemptRef);
    dockerArgs.push('-e', `DECKENT_PROVIDER_EXECUTION_FENCE=${providerExecutionFence}`);
    // Image and command must remain last: Docker treats every following token as
    // container argv, so the host-owned fence is injected before this boundary.
    dockerArgs.push(executionImage, 'sh', '-c', containerCmd);
    const spawnOutcome = this.runDockerWithRetry(taskId, attemptIdentity, dockerArgs);

    if (!spawnOutcome.ok) {
      debugLog('docker-backend:spawn-error', `taskId=${taskId} ${spawnOutcome.error.message}`);
      // Write .timeout marker with the stable error code so result-collector and
      // downstream tools can act on the failure category, not the bare string.
      // Marker payload is 'container_start_failed' base + ":<code>:<message>" suffix
      // so legacy substring grep ('container_start_failed') still matches.
      const baseMarker = 'container_start_failed';
      writeFileSync(
        join(tasksDir, `task-${taskId}.timeout`),
        `${baseMarker}:${spawnOutcome.error.code}:${spawnOutcome.error.message}`,
        'utf-8',
      );
      if (spawnOutcome.error.code === DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE) {
        // The daemon did not prove whether `docker run` created the exact
        // attempt. Sealing not-dispatched here could hide a live orphan and
        // permit a duplicate dispatch. Keep the durable prepared claim open
        // for restart reconciliation and surface the ambiguity fail-loud.
        throw new SpawnBackendError(spawnOutcome.error.message, this.name);
      }
      // Sprint 156 Task 10 (fix): release spawn locks so a retry / fix-worker
      // for this scope is not permanently blocked by a transient docker error.
      try { releaseAllSpawnLocks(dir, taskId); } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }
      // Sprint 170 P0-5: spawn failed — clear pending so Set doesn't leak
      clearPending(taskId);
      const startFailureResult = {
        taskId,
        workerId: `docker-host-${taskId}`,
        filesChanged: [] as string[],
        linesAdded: 0,
        linesRemoved: 0,
        testsPassed: false,
        selfAssessment: 'NO_GO',
        notes: `${spawnOutcome.error.code}: ${spawnOutcome.error.message}`,
        exitCode: spawnOutcome.error.exitCode,
        tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider, model },
      };
      atomicWriteFileSync(
        join(tasksDir, `task-${taskId}.result`),
        `${JSON.stringify(startFailureResult, null, 2)}\n`,
      );
      finalizeNotDispatched(spawnOutcome.error.exitCode);
      return;
    }

    const { containerId, instantExitSuccess } = spawnOutcome;
    this.containers.set(taskId, {
      containerId,
      containerName,
      model,
      projectDir: dir,
      tasksDir,
      settlementRef: attemptRef,
      ...(gitIsolation.adapter ? { gitAdapterHostPath: gitIsolation.adapter.hostPath } : {}),
    });
    debugLog(
      'docker-backend:spawn-ok',
      `taskId=${taskId} containerId=${containerId.slice(0, 12)} instantExit=${instantExitSuccess}`,
    );

    // The host authority store, rather than a raw .hb file, owns the initial
    // sequence and timestamp for this exact Docker attempt.
    observeDockerHeartbeatAuthority({
      tasksDir,
      settlementRef: attemptRef,
      hostProcessOutcome: { state: 'running', exitCode: null },
      workerTaskVerdict: 'pending',
      liveness: 'alive',
    });

    // Sprint 170 P0-5: .hb is now on disk — heartbeat is authoritative, race window closed
    markActive(taskId);

    // SURF-3 S3 — live tool-by-tool activity context (flag-gated; a no-op when
    // live_trace is off). Coordinator-process config is the source of truth
    // (opts.liveTraceEnabled), NOT the worker's disk-cache.
    const liveCtx: ActivityTapContext = {
      projectRoot: dir,
      taskId,
      workerId: `docker-${taskId}`,
      enabled: opts?.liveTraceEnabled === true,
      ...(opts?.sprintId ? { sprintId: opts.sprintId } : {}),
    };

    // Set up container monitoring (async, fire-and-forget)
    this.monitorContainer(
      taskId,
      containerId,
      tasksDir,
      model,
      dir,
      distFingerprintBefore,
      liveCtx,
      opts?.executionBudget,
      opts?.executionLandingPolicy,
      opts?.executionContinuation,
      opts?.executionLandingContext,
      attemptRef,
      opts?.hostTerminalResultContract,
      providerExecutionObservationBinding,
    );
  }

  /**
   * Sprint 163 T-002: attempt `docker run` up to MAX_SPAWN_ATTEMPTS times,
   * verifying container health after each attempt via `docker inspect`.
   *
   * Returns:
   * - `{ ok: true, containerId, instantExitSuccess: false }` — container is running
   * - `{ ok: true, containerId, instantExitSuccess: true }` — container started and gracefully exited (ExitCode 0)
   * - `{ ok: false, error }` — all attempts failed, error classified into a stable code
   *
   * A retry is allowed only when exact-name inspection proves no container was
   * created. Existing containers are adopted only for the exact attempt labels;
   * every foreign/different-attempt collision fails closed without removal.
   */
  private runDockerWithRetry(
    taskId: string,
    identity: DockerAttemptIdentity,
    dockerArgs: string[],
  ): { ok: true; containerId: string; instantExitSuccess: boolean }
    | { ok: false; error: { code: DockerErrorCode; message: string; exitCode: number; stderr: string } } {
    let lastStderr = '';
    let lastExitCode = -1;

    for (let attempt = 1; attempt <= MAX_SPAWN_ATTEMPTS; attempt++) {
      debugLog('docker-backend:spawn-attempt', `taskId=${taskId} attempt=${attempt}/${MAX_SPAWN_ATTEMPTS}`);

      const result = spawnSync('docker', dockerArgs, {
        encoding: 'utf-8',
        timeout: 30_000, // 30s to start container
      });

      if (result.status !== 0) {
        // docker run itself failed (image missing, syntax error, daemon down, …)
        lastStderr = result.stderr ?? '';
        lastExitCode = result.status ?? -1;
        debugLog(
          'docker-backend:spawn-attempt-fail',
          `taskId=${taskId} attempt=${attempt} status=${result.status} stderr=${lastStderr.trim().slice(0, 200)}`,
        );
        const authority = this.inspectContainerAuthority(identity.containerName);
        if (authority.state === 'present') {
          const existing = authority.inspection;
          if (this.inspectionMatchesAttempt(existing, identity)) {
            writeTaskResultSettlementDispatchAtomic(identity.ref, existing.containerId);
            return {
              ok: true,
              containerId: existing.containerId,
              instantExitSuccess: !existing.running && existing.exitCode === 0,
            };
          }
          const message = `${DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT}: Docker container name '${identity.containerName}' is owned by a foreign project/task/attempt; refusing removal and redispatch.`;
          return {
            ok: false,
            error: {
              code: DOCKER_ERROR_CODES.OWNERSHIP_CONFLICT,
              message,
              exitCode: result.status ?? -1,
              stderr: lastStderr,
            },
          };
        }
        if (authority.state === 'unavailable') {
          return {
            ok: false,
            error: {
              code: DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE,
              message: `${DOCKER_ERROR_CODES.AUTHORITY_UNAVAILABLE}:${authority.evidence}`,
              exitCode: result.status ?? -1,
              stderr: authority.evidence,
            },
          };
        }
        if (attempt < MAX_SPAWN_ATTEMPTS) {
          this.sleepSync(SPAWN_RETRY_DELAY_MS);
        }
        continue;
      }

      const containerId = result.stdout?.trim() ?? '';
      try {
        writeTaskResultSettlementDispatchAtomic(identity.ref, containerId);
      } catch (error) {
        try { terminateDockerContainerForBudget(containerId, this.gracefulTimeoutSeconds); } catch { /* exact ID containment is best-effort here; the original error remains authoritative */ }
        throw error;
      }

      // docker run succeeded — now confirm the container is actually alive.
      const health = this.healthCheckContainer(containerId);
      if (health.healthy) {
        return { ok: true, containerId, instantExitSuccess: false };
      }
      if (health.instantExitSuccess) {
        // Container started and gracefully exited with code 0 — this is not a
        // failure. Workers that complete inside the health-check window are rare
        // but legitimate.
        return { ok: true, containerId, instantExitSuccess: true };
      }

      // The provider may already have run. A stopped non-zero container belongs
      // to this exact attempt and is finalized by the monitor; never redrive it.
      debugLog(
        'docker-backend:spawn-health-fail',
        `taskId=${taskId} attempt=${attempt} exitCode=${health.exitCode} — handing exact container to settlement without redrive`,
      );
      return { ok: true, containerId, instantExitSuccess: false };
    }

    const classification = classifyDockerError(lastStderr, lastExitCode);
    return {
      ok: false,
      error: {
        code: classification.code,
        message: classification.message,
        exitCode: lastExitCode,
        stderr: lastStderr,
      },
    };
  }

  private inspectContainerAuthority(containerName: string): DockerAuthorityProbe {
    const format = [
      '{{.Id}}',
      '{{.State.Running}}',
      '{{.State.ExitCode}}',
      `{{index .Config.Labels "${DOCKER_ATTEMPT_LABELS.managed}"}}`,
      `{{index .Config.Labels "${DOCKER_ATTEMPT_LABELS.project}"}}`,
      `{{index .Config.Labels "${DOCKER_ATTEMPT_LABELS.task}"}}`,
      `{{index .Config.Labels "${DOCKER_ATTEMPT_LABELS.attempt}"}}`,
    ].join('|');
    let inspected: ReturnType<typeof spawnSync>;
    try {
      inspected = spawnSync(
        'docker',
        ['inspect', containerName, '--format', format],
        { encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
      );
    } catch (error) {
      return {
        state: 'unavailable',
        evidence: `inspect-threw:${error instanceof Error ? error.message : String(error)}`.slice(0, 500),
      };
    }
    const stderr = typeof inspected.stderr === 'string' ? inspected.stderr.trim() : '';
    if (inspected.status !== 0) {
      if (/\bNo such (?:container|object)\b/i.test(stderr)) return { state: 'absent' };
      const spawnError = inspected.error instanceof Error ? inspected.error.message : '';
      const evidence = [
        `status=${inspected.status ?? 'null'}`,
        stderr,
        spawnError,
      ].filter(Boolean).join(':').slice(0, 500);
      return { state: 'unavailable', evidence };
    }
    const parsed = parseDockerAuthorityInspectOutput(inspected.stdout?.toString() ?? '');
    if (!parsed) {
      return { state: 'unavailable', evidence: 'status=0:malformed-inspect-authority-projection' };
    }
    return { state: 'present', inspection: parsed };
  }

  private inspectionMatchesAttempt(
    inspection: DockerAuthorityInspection,
    identity: DockerAttemptIdentity,
  ): boolean {
    return Object.entries(identity.labels).every(([key, value]) => inspection.labels[key] === value);
  }

  /**
   * Sprint 163 T-002: after `docker run -d` returns successfully, wait
   * HEALTH_CHECK_DELAY_MS then ask docker about the container's real state.
   *
   * - Running=true             → healthy (proceed)
   * - Running=false, exit=0    → graceful instant exit (proceed, no error)
   * - Running=false, exit>0    → real container_start_failed (retry candidate)
   * - inspect fails / malformed → fail-open: assume healthy. We have a clean
   *   `docker run` ack already; optimistically hand off to monitorContainer
   *   instead of burning a retry on inspect noise. Real failures still trip
   *   the `Running=false + ExitCode>0` branch because docker inspect emits
   *   exactly that format in real environments.
   */
  healthCheckContainer(containerName: string, delayMs: number = HEALTH_CHECK_DELAY_MS): HealthCheckResult {
    if (delayMs > 0) this.sleepSync(delayMs);

    const inspect = spawnSync(
      'docker',
      ['inspect', containerName, '--format', '{{.State.Running}}|{{.State.ExitCode}}'],
      { encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    if (inspect.status !== 0) {
      // inspect command itself failed — fail-open. `docker wait` in the
      // monitor will catch genuine container death.
      return { healthy: true, instantExitSuccess: false, exitCode: 0, raw: inspect.stderr ?? '' };
    }

    const parsed = parseInspectOutput(inspect.stdout ?? '');
    if (!parsed) {
      // Malformed inspect output — same reasoning, fail-open.
      return { healthy: true, instantExitSuccess: false, exitCode: 0, raw: inspect.stdout ?? '' };
    }

    if (parsed.running) {
      return { healthy: true, instantExitSuccess: false, exitCode: parsed.exitCode, raw: inspect.stdout ?? '' };
    }
    if (parsed.exitCode === 0) {
      return { healthy: false, instantExitSuccess: true, exitCode: 0, raw: inspect.stdout ?? '' };
    }
    return { healthy: false, instantExitSuccess: false, exitCode: parsed.exitCode, raw: inspect.stdout ?? '' };
  }

  /**
   * Blocking sleep using `spawnSync('sleep', …)` so the retry loop stays
   * synchronous (matches the rest of this file's spawn-time path).
   */
  private sleepSync(ms: number): void {
    if (ms <= 0) return;
    const seconds = (ms / 1000).toFixed(3);
    spawnSync('sleep', [seconds], { timeout: ms + 2_000 });
  }

  private resolveExecutionContext(taskId: string): {
    projectDir: string;
    tasksDir: string;
    containerId: string;
    gitAdapterHostPath?: string;
  } {
    const execution = this.containers.get(taskId);
    if (!execution) {
      throw new SpawnBackendError(
        `No exact Docker container authority is registered for task ${taskId}; refusing name-derived lifecycle mutation.`,
        this.name,
      );
    }
    const projectDir = execution.projectDir;
    return {
      projectDir,
      tasksDir: execution.tasksDir,
      containerId: execution.containerId,
      ...(execution.gitAdapterHostPath ? { gitAdapterHostPath: execution.gitAdapterHostPath } : {}),
    };
  }

  /**
   * Gracefully stop a running worker container.
   *
   * Sprint 139 fix: increased grace period from 10s to 15s and added post-stop
   * result file verification. The sequence:
   * 1. `docker stop --time=15` sends SIGTERM → worker's trap runs fsync_file
   * 2. If .result exists after stop, verify it's readable (fsync confirmation)
   * 3. If .result missing + non-zero exit, write fallback NO_GO result
   * 4. Remove container
   *
   * This closes the 5-sprint exit-137 bug: even if SIGKILL fires after 15s,
   * the SIGTERM trap has already fsync'd .result to disk.
   */
  kill(taskId: string): void {
    const { projectDir, tasksDir, containerId, gitAdapterHostPath } = this.resolveExecutionContext(taskId);
    const grace = this.gracefulTimeoutSeconds;
    debugLog('docker-backend:kill', `taskId=${taskId} (graceful stop --time=${grace})`);

    try {
      // Graceful: SIGTERM + configurable grace period (Sprint 151: was hardcoded 15s, now configurable)
      const stopResult = spawnSync('docker', ['stop', `--time=${grace}`, containerId], {
        encoding: 'utf-8', timeout: (grace + 5) * 1000, // grace + 5s buffer to avoid race
      });
      if (stopResult.status !== 0) {
        // Fallback: send SIGTERM (not SIGKILL) so EXIT trap can still run
        // Sprint 149: changed from bare `docker kill` (SIGKILL) to --signal=SIGTERM
        debugLog('docker-backend:stop-failed', `Falling back to docker kill --signal=SIGTERM: ${stopResult.stderr?.trim()}`);
        spawnSync('docker', ['kill', '--signal=SIGTERM', containerId], { encoding: 'utf-8', timeout: 10_000 });
      }
    } catch (e) { debugLog('docker-backend:kill-error', e); }

    // Sprint 149: Poll for .result file after stop (max 5s, 500ms intervals)
    // Gives EXIT trap time to write result after SIGTERM
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    if (!existsSync(resultPath)) {
      for (let i = 0; i < 10; i++) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
        if (existsSync(resultPath)) break;
      }
    }

    // Post-stop verification: ensure .result was persisted to disk
    this.verifyResultAfterStop(taskId, tasksDir);

    try {
      spawnSync('docker', ['rm', containerId], { encoding: 'utf-8', timeout: 10_000 });
    } catch (e) { debugLog('docker-backend:rm-error', e); }

    // Sprint 156 Task 10: forced shutdown — release any spawn locks left over
    try {
      const released = releaseAllSpawnLocks(projectDir, taskId);
      if (released > 0) debugLog('docker-backend:spawn-lock', `taskId=${taskId} released ${released} spawn lock(s) on kill`);
    } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }

    cleanupDockerGitAdapter(gitAdapterHostPath);
    this.containers.delete(taskId);
  }

  /**
   * Verify .result file exists and is readable after container stop.
   * If the file exists, fsync it from host side as belt-and-suspenders.
   * If missing, log a warning (monitorContainer EXIT trap should have written fallback).
   */
  private verifyResultAfterStop(taskId: string, tasksDir: string): void {
    const resultPath = join(tasksDir, `task-${taskId}.result`);
    try {
      if (existsSync(resultPath)) {
        // Belt-and-suspenders: fsync from host side to ensure container writes are flushed
        const fd = openSync(resultPath, 'r');
        try { fsyncSync(fd); } finally { closeSync(fd); }
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result verified + fsynced`);
      } else {
        debugLog('docker-backend:post-stop-verify', `taskId=${taskId} .result MISSING after stop — EXIT trap should write fallback`);
      }
    } catch (e) {
      debugLog('docker-backend:post-stop-verify-error', `taskId=${taskId} ${e}`);
    }
  }

  /**
   * List currently active worker task IDs.
   */
  list(): string[] {
    return [...this.containers.keys()];
  }

  /**
   * Check if Docker is available.
   */
  async isAvailable(): Promise<boolean> {
    const result = spawnSync('docker', ['info'], {
      encoding: 'utf-8',
      timeout: 5_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return result.status === 0;
  }

  /**
   * Acquire spawn-time `.spawnlock` files for every entry in the task's
   * `scope.filesWrite`. Reads `<tasksDir>/task-<taskId>.json` to recover
   * the file list — if the JSON is missing or malformed, locking is
   * silently skipped (graceful degradation; we never block a spawn over
   * a parse failure). Throws `SpawnBackendError` on a real conflict so
   * the caller can surface the conflicting task id.
   */
  /**
   * F1-LIM faz-2a (Sprint 272): Resolve kind-based memory limits for a task.
   * Reads the task JSON to get the canonical TaskKind (`type` field), then
   * looks it up in `this.kindMemoryLimits`. Returns undefined when no kind
   * limit is configured for this task (caller falls back to constructor defaults).
   */
  private resolveKindMemoryLimits(projectDir: string, taskId: string): { memory: string; swap: string } | undefined {
    if (Object.keys(this.kindMemoryLimits).length === 0) return undefined;
    const taskKind = this.readTaskKind(projectDir, taskId);
    if (!taskKind) return undefined;
    const limitStr = this.kindMemoryLimits[taskKind];
    if (!limitStr) return undefined;
    const limitBytes = parseMemoryString(limitStr);
    if (limitBytes === null) return undefined; // already validated in constructor; guard for safety
    const swapStr = deriveSwapFromLimitBytes(limitBytes);
    return { memory: limitStr, swap: swapStr };
  }

  /**
   * Read the canonical TaskKind from `task-<taskId>.json` (`type` field).
   * Returns undefined when the file is missing, malformed, or type is unset.
   */
  private readTaskKind(projectDir: string, taskId: string): string | undefined {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return undefined;
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { type?: unknown };
      if (typeof parsed.type === 'string' && parsed.type.length > 0) {
        return parsed.type;
      }
    } catch (err) {
      debugLog('docker-backend:kind-limit', `taskId=${taskId} failed to read task kind: ${(err as Error).message}`);
    }
    return undefined;
  }

  /**
   * Read the per-task auth mode override from `task-<taskId>.json`.
   * Returns 'api' or 'subscription' when explicitly set on the task, or
   * undefined when missing/malformed (caller treats undefined as subscription
   * for backward compatibility).
   */
  private readTaskAuthMode(projectDir: string, taskId: string): 'subscription' | 'api' | undefined {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return undefined;
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { authMode?: unknown };
      if (parsed.authMode === 'api' || parsed.authMode === 'subscription') {
        return parsed.authMode;
      }
    } catch (err) {
      debugLog('docker-backend:auth-mode', `taskId=${taskId} failed to read authMode: ${(err as Error).message}`);
    }
    return undefined;
  }

  /**
   * born-667b (RECON-DIFF, task 427-024): read `scope.filesWrite` from
   * `task-<taskId>.json` for {@link buildOnExitTrap}'s scoped git-diff signal.
   * Returns `[]` (never throws/blocks a spawn) when the task JSON is missing,
   * unreadable, or malformed — mirrors {@link readTaskKind}/{@link readTaskAuthMode}'s
   * graceful-degradation contract. An empty return is itself meaningful here:
   * buildOnExitTrap treats "task JSON has no filesWrite entries" the same as
   * "task JSON unreadable" — both produce an honest empty-intersection signal
   * rather than silently reverting to the unscoped sprint-wide diff.
   */
  private readTaskFilesWrite(projectDir: string, taskId: string): string[] {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return [];
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { scope?: { filesWrite?: unknown } };
      const candidate = parsed.scope?.filesWrite;
      return Array.isArray(candidate) ? candidate.filter((f): f is string => typeof f === 'string' && f.length > 0) : [];
    } catch (err) {
      debugLog('docker-backend:diff-scope', `taskId=${taskId} failed to parse task JSON: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * born-471 (ALLOWLIST-SSOT): read `scope.directories` + exact file scopes
   * from `task-<taskId>.json` and derive the `--allowedTools` string via
   * {@link buildDockerAllowedTools}. Falls back to the caller-supplied value
   * when the task JSON is missing/malformed — never blocks a spawn over a
   * parse failure, mirroring {@link readTaskAuthMode}/{@link readTaskKind}.
   */
  private resolveAllowedTools(projectDir: string, taskId: string, fallback: string | undefined): string | undefined {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) return fallback;
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { scope?: { directories?: unknown; filesRead?: unknown; filesWrite?: unknown } };
      const rawDirs = parsed.scope?.directories;
      const rawReadFiles = parsed.scope?.filesRead;
      const rawFiles = parsed.scope?.filesWrite;
      const directories = Array.isArray(rawDirs) ? rawDirs.filter((d): d is string => typeof d === 'string') : [];
      const filesRead = Array.isArray(rawReadFiles) ? rawReadFiles.filter((f): f is string => typeof f === 'string') : [];
      const filesWrite = Array.isArray(rawFiles) ? rawFiles.filter((f): f is string => typeof f === 'string') : [];
      return buildDockerAllowedTools({ directories, filesRead, filesWrite });
    } catch (err) {
      debugLog('docker-backend:allowed-tools', `taskId=${taskId} failed to parse task JSON: ${(err as Error).message}`);
      return fallback;
    }
  }

  private acquireSpawnTimeLocks(projectDir: string, taskId: string): void {
    const taskJsonPath = join(projectDir, TASKS_DIR, `task-${taskId}.json`);
    if (!existsSync(taskJsonPath)) {
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} no task JSON found at ${taskJsonPath} — skipping spawn locks`);
      return;
    }

    let filesWrite: string[] = [];
    try {
      const raw = readFileSync(taskJsonPath, 'utf-8');
      const parsed = JSON.parse(raw) as { scope?: { filesWrite?: unknown } };
      const candidate = parsed.scope?.filesWrite;
      if (Array.isArray(candidate)) {
        filesWrite = candidate.filter((f): f is string => typeof f === 'string' && f.length > 0);
      }
    } catch (err) {
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} failed to parse task JSON: ${(err as Error).message}`);
      return;
    }

    if (filesWrite.length === 0) return;

    try {
      acquireSpawnLocks(projectDir, taskId, filesWrite);
      debugLog('docker-backend:spawn-lock', `taskId=${taskId} acquired ${filesWrite.length} spawn lock(s)`);
    } catch (err) {
      if (err instanceof SpawnLockError) {
        throw new SpawnBackendError(
          `Spawn lock conflict on ${err.filePath}: file is currently held by task ${err.conflictingTaskId}`,
          'docker',
        );
      }
      throw err;
    }
  }

  private async finalizeLandedAttempt(input: {
    taskId: string;
    containerId: string;
    tasksDir: string;
    model: string;
    projectDir: string;
    settlementRef: TaskResultSettlementRefV1;
    checkpointSha256: string;
    exitCode: number;
    containerAlreadyAbsent?: boolean;
  }): Promise<boolean> {
    const landingRef: ExecutionLandingCheckpointRefV1 = {
      schemaVersion: 1,
      projectId: input.settlementRef.projectRootSha256,
      taskId: input.taskId,
      attemptId: input.settlementRef.attemptId,
    };
    const checkpoint = readExecutionLandingCheckpointByRef(landingRef);
    if (!checkpoint || checkpoint.checkpointSha256 !== input.checkpointSha256) {
      throw createDockerLifecycleError('Docker LANDED finalization has no matching immutable checkpoint');
    }

    if (!input.containerAlreadyAbsent) {
      try {
        const capture = await captureDockerLogs(input.containerId);
        if (capture.content.trim()) {
          writeNormalizedDockerLog(
            join(input.tasksDir, `task-${input.taskId}.log`),
            capture.content,
            getProviderBinaryForModel(input.model),
          );
        }
      } catch (error) {
        debugLog('docker-backend:landed-log-capture', error);
      }

      const removal = spawnSync('docker', ['rm', input.containerId], {
        encoding: 'utf-8',
        timeout: 10_000,
      });
      if (removal.status !== 0) {
        debugLog('docker-backend:landed-cleanup', `container removal failed: ${removal.stderr ?? ''}`);
        return false;
      }
    }

    let artefactRefs: string[];
    try {
      artefactRefs = archiveLandedAttemptArtifacts(input.tasksDir, input.taskId, landingRef);
      releaseAllSpawnLocks(input.projectDir, input.taskId);
      releaseStaleSpawnLocksForTask(input.projectDir, input.taskId);
      if (hasSpawnLocksForTask(input.projectDir, input.taskId)) {
        throw createDockerLifecycleError(`Task ${input.taskId} still owns spawn locks after LANDED cleanup`);
      }
      const baselinePath = join(input.tasksDir, `task-${input.taskId}.scope-baseline`);
      if (existsSync(baselinePath)) unlinkSync(baselinePath);
    } catch (error) {
      debugLog('docker-backend:landed-authority-release', error);
      return false;
    }

    writeExecutionAttemptRetirementAtomic(
      input.projectDir,
      landingRef,
      {
        checkpointSha256: checkpoint.checkpointSha256,
        runtimeDisposition: 'stopped-removed',
        resourcesReleased: true,
        evidenceRefs: [
          `docker-container-retired:${input.containerId}`,
          'docker-spawn-locks-released',
          ...artefactRefs,
        ],
      },
    );
    // PROD-LANDED-FENCE-ORDER-001: the LANDED retirement below closes the
    // active claim chain, after which taskResultSettlementActiveClaimDigest
    // fails closed (DECKENT_E077 "no matching active claim fence"). Capture the
    // heartbeat identity fence while the claim is still active and carry it
    // into the observe — otherwise the landed heartbeat record and the
    // continuation dispatch below are lost on the monitor path and the whole
    // restart reconciliation rejects on the recovery path.
    const activeClaimFence = taskResultSettlementActiveClaimDigest(input.settlementRef);
    writeTaskResultSettlementLandedRetirementAtomic(input.settlementRef);
    observeDockerHeartbeatAuthority({
      tasksDir: input.tasksDir,
      settlementRef: input.settlementRef,
      hostProcessOutcome: { state: 'exited', exitCode: input.exitCode },
      workerTaskVerdict: 'hold',
      liveness: 'not-alive',
      activeClaimFence,
    });
    cleanupDockerGitAdapter(this.containers.get(input.taskId)?.gitAdapterHostPath);
    this.containers.delete(input.taskId);
    try {
      dispatchExecutionContinuation({
        projectRoot: input.projectDir,
        checkpointRef: landingRef,
        backend: this,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      debugLog('docker-backend:landing-continuation-held', `taskId=${input.taskId} ${reason}`);
      // MASTER-PLAN 664: never leave a held continuation both silent and
      // non-terminal — that hangs the run on a result no attempt can write.
      settleHeldExecutionContinuation(input.projectDir, input.taskId, input.exitCode, reason);
    }
    return true;
  }

  /**
   * Monitor container until it exits, then update heartbeat and cleanup.
   *
   * `projectDir` + `distFingerprintBefore` (born-644 BUILD-VIOLATION-GUARD): the pre-spawn
   * dist/ snapshot from runSpawn, carried through so the exit handler can compare against the
   * post-exit state — see the dist-mtime sentinel block comment above computeDistFingerprint.
   */
  private monitorContainer(
    taskId: string,
    containerId: string,
    tasksDir: string,
    model: string,
    projectDir: string,
    distFingerprintBefore: DistFingerprint | null,
    liveCtx?: ActivityTapContext,
    executionBudget?: import('../core/work-model.js').ExecutionBudget,
    executionLandingPolicy?: import('../core/config-types.js').ExecutionLandingPolicyConfig,
    executionContinuation?: SpawnBackendOptions['executionContinuation'],
    executionLandingContext?: SpawnBackendOptions['executionLandingContext'],
    settlementRef?: TaskResultSettlementRefV1,
    hostTerminalResultContract?: HostTerminalResultContractV1,
    providerExecutionObservationBinding?: Readonly<DockerProviderExecutionObservationBinding>,
    recoveryContainment?: DockerRecoveryContainment,
  ): void {
    const child = nodeSpawn('docker', ['wait', containerId], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // SURF-3 S3 — start the live activity follow WHILE the container runs
    // (a no-op when live_trace is off); stop it once the container exits below.
    let finalizationStarted = false;
    let containmentState: 'none' | 'landing' | 'hard' = 'none';
    let landingEscalationTimer: ReturnType<typeof setTimeout> | null = null;
    const clearLandingEscalation = (): void => {
      if (!landingEscalationTimer) return;
      clearTimeout(landingEscalationTimer);
      landingEscalationTimer = null;
    };
    const hardContain = (reason: string): void => {
      if (containmentState === 'hard') return;
      containmentState = 'hard';
      clearLandingEscalation();
      try {
        terminateDockerContainerForBudget(containerId, 0);
      } catch (error) {
        debugLog('docker-backend:budget-containment', `${reason}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    const requestLanding = (): void => {
      if (containmentState !== 'none') return;
      containmentState = 'landing';
      try {
        requestDockerContainerLanding(containerId);
      } catch (error) {
        debugLog(
          'docker-backend:budget-landing-checkpoint-stop',
          error instanceof Error ? error.message : String(error),
        );
        hardContain('budget-landing-checkpoint-stop-failed');
        return;
      }
      // The exact container is already frozen and SIGKILL-delivered. This timer
      // is only a post-containment liveness guard for lost `docker wait`
      // evidence; it grants the provider no additional spending window.
      landingEscalationTimer = setTimeout(() => {
        if (!finalizationStarted) hardContain('budget-landing-exit-evidence-timeout');
      }, this.gracefulTimeoutSeconds * 1_000);
      landingEscalationTimer.unref?.();
    };
    let landedCheckpointSha256: string | null = null;
    let pendingLandingEvidence: RuntimeBudgetLandingEvidence | null = null;
    const budgetMonitor = createRuntimeBudgetMonitor({
      projectRoot: projectDir,
      taskId,
      ...(settlementRef ? { attemptId: settlementRef.attemptId } : {}),
      backend: this.name,
      budget: executionBudget,
      landingPolicy: executionLandingPolicy,
      landingAlreadySatisfied: executionContinuation !== undefined,
      counterScope: executionContinuation ? 'attempt' : 'lineage',
      onLandingRequested: executionLandingContext && settlementRef
        ? evidence => {
            // The usage event that crosses the reserve can be the first chunk of
            // a logical assistant turn whose proposal-update tool call is still
            // in flight. Publishing an immutable checkpoint here would freeze
            // the previous semantic proposal forever. Persisted landing evidence
            // already owns the threshold decision; stop the exact container now,
            // then bind the newest exact-attempt proposal after observed exit.
            pendingLandingEvidence = evidence;
            requestLanding();
          }
        : undefined,
      onStop: () => hardContain('budget-exceeded'),
    });
    const logProviderBinary = getProviderBinaryForModel(model);
    let terminalBillingReceiptError: Error | null = null;
    const stopFollow = followContainerActivity(
      containerId,
      logProviderBinary,
      liveCtx,
      nodeSpawn,
      budgetMonitor || settlementRef
        ? (event, sequence) => {
            if (settlementRef) {
              try {
                persistDockerTerminalProviderBillingReceipt(
                  settlementRef,
                  logProviderBinary,
                  JSON.stringify(event),
                );
              } catch (error) {
                terminalBillingReceiptError =
                  error instanceof Error ? error : new Error(String(error));
                throw terminalBillingReceiptError;
              }
            }
            budgetMonitor?.observe(event, sequence);
          }
        : undefined,
      budgetMonitor || settlementRef
          ? error => {
            try {
              budgetMonitor?.failObservation(error);
            } catch (settleError) {
              debugLog('docker-backend:budget-settle-after-observer-failure', settleError);
            }
            hardContain(`budget-observer-failed: ${error.message}`);
          }
        : undefined,
    );

    let waitFailureHandlingStarted = false;
    let waitStdout = '';
    let effectiveRecoveryContainment = recoveryContainment;

    const finalizeObservedExit = async (exitCode: number): Promise<void> => {
      if (finalizationStarted) return;
      finalizationStarted = true;
      clearLandingEscalation();
      let capturedProviderBilling: ProviderBillingEvidence | null = null;
      let capturedProviderBillingEvidenceRef: string | null = null;
      debugLog('docker-backend:exit', `taskId=${taskId} exitCode=${exitCode}`);
      stopFollow(); // container exited — the `docker logs -f` follow can end.
      try { budgetMonitor?.settle(); } catch (e) { debugLog('docker-backend:budget-settle-before-result', e); }

      if (settlementRef) {
        const landingRef: ExecutionLandingCheckpointRefV1 = {
          schemaVersion: 1,
          projectId: settlementRef.projectRootSha256,
          taskId,
          attemptId: settlementRef.attemptId,
        };
        if (pendingLandingEvidence && !readExecutionLandingCheckpointByRef(landingRef)) {
          try {
            const checkpoint = stampDockerExecutionLandingCheckpoint({
              projectRoot: projectDir,
              settlementRef,
              landing: pendingLandingEvidence,
              terminalUsage: readRuntimeBudgetUsage(projectDir, taskId),
            });
            landedCheckpointSha256 = checkpoint.checkpointSha256;
          } catch (error) {
            // The exact container is already contained. A missing/stale/corrupt
            // proposal cannot mint LANDED or a continuation; fall through to the
            // ordinary non-success settlement path.
            const evidence = error instanceof Error ? error.message : String(error);
            effectiveRecoveryContainment = {
              attemptId: settlementRef.attemptId,
              reason: 'landing-checkpoint-unavailable',
              evidence: evidence.slice(0, 500),
            };
            debugLog(
              'docker-backend:budget-landing-held',
              `taskId=${taskId} ${evidence}`,
            );
          }
        }
        const checkpoint = readExecutionLandingCheckpointByRef(landingRef);
        if (checkpoint) {
          if (
            landedCheckpointSha256 !== null
            && landedCheckpointSha256 !== checkpoint.checkpointSha256
          ) {
            debugLog(
              'docker-backend:landed-held',
              `taskId=${taskId} in-memory checkpoint digest conflicts with durable authority`,
            );
            return;
          }
          try {
            await this.finalizeLandedAttempt({
              taskId,
              containerId,
              tasksDir,
              model,
              projectDir,
              settlementRef,
              checkpointSha256: checkpoint.checkpointSha256,
              exitCode,
            });
          } catch (error) {
            debugLog('docker-backend:landed-finalize', error);
          }
          return;
        }
      }

      // Sprint 139: fsync .result from host side before reading
      // Container's fsync_file trap may have run, but belt-and-suspenders from host
      const resultPath = join(tasksDir, `task-${taskId}.result`);
      // Process exit status is transport evidence, not budget truth. A worker can
      // naturally exit 0 after the host monitor has already persisted exhaustion.
      const runtimeBudgetExhaustion = readRuntimeBudgetExhaustion(projectDir, taskId);
      try {
        if (existsSync(resultPath)) {
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
        }
      } catch { /* fsync best-effort — continue with reconciliation */ }

      try {
        reconcileDockerRuntimeBudgetResultFile(
          resultPath,
          taskId,
          model,
          exitCode,
          runtimeBudgetExhaustion,
        );
      } catch (e) {
        debugLog('docker-backend:budget-result-reconcile', e);
      }

      // If no .result file and exit != 0, write fallback result + timeout marker.
      // Sprint 148 root cause fix: SIGKILL (exit 137, OOM kill) bypasses all shell
      // traps — the container's EXIT trap never runs. The host-side monitor must
      // write the fallback .result so Brain's result-collector doesn't wait forever.
      const timeoutPath = join(tasksDir, `task-${taskId}.timeout`);
      // Partial/invalid write detection is independent of process exit status.
      // A provider can exit 0 after writing malformed JSON (for example an
      // unescaped newline in notes); treating exit 0 as syntax authority leaves
      // work-attribution stuck on an unreadable result forever. Preserve the raw
      // bytes in the exact-attempt forensic journal, then project a host-authored
      // NO_GO result before attribution and terminal settlement.
      if (existsSync(resultPath)) {
        let invalidRaw: Buffer | undefined;
        try {
          invalidRaw = readFileSync(resultPath);
          const parsed = JSON.parse(invalidRaw.toString('utf-8')) as unknown;
          if (settlementRef && !isValidDockerWorkerResult(parsed, settlementRef)) {
            throw new SyntaxError('worker result failed schema or attempt identity validation');
          }
        } catch {
          debugLog('docker-backend:partial-write', `taskId=${taskId} .result exists but is corrupt JSON/schema — containing as NO_GO`);
          if (!invalidRaw) {
            // A non-file path or unreadable artifact is not safely replaceable.
            // Preserve container/claim/locks for typed recovery.
            return;
          }
          if (settlementRef) {
            const recovery = buildDockerCorruptResultRecovery({
              ref: settlementRef,
              raw: invalidRaw,
              exitCode,
              model,
            });
            atomicWriteFileSync(resultPath, `${JSON.stringify(recovery.result, null, 2)}\n`);
          } else {
            try { unlinkSync(resultPath); } catch { /* ok */ }
            // Without an exact attempt reference the generic fallback below is
            // the only honest projection available.
          }
        }
      }

      // Sprint 151: Promote .partial-result → .result when container died without writing .result
      // This catches OOM kills (exit 137) where SIGKILL bypasses all shell traps but the
      // .partial-result file written at script start survives on the shared volume.
      const partialPath = join(tasksDir, `task-${taskId}.partial-result`);
      if (!existsSync(resultPath) && exitCode !== 0 && existsSync(partialPath)) {
        try {
          const partialRaw = readFileSync(partialPath, 'utf-8');
          const partial = JSON.parse(partialRaw) as Record<string, unknown>;
          // A budget circuit breaker may terminate with the same exit code as
          // an OOM. Durable host evidence outranks that ambiguous heuristic.
          partial.notes = describeDockerPartialResultTermination(
            exitCode,
            runtimeBudgetExhaustion,
            exitCode === 137 ? probeContainerOomKilled(containerId) : null,
          );
          partial.exitCode = exitCode;
          partial.selfAssessment = 'NO_GO';
          const enrichedResult = JSON.stringify(partial);
          writeFileSync(resultPath, enrichedResult, 'utf-8');
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
          try { unlinkSync(partialPath); } catch { /* ok */ }
          debugLog('docker-backend:partial-promote', `taskId=${taskId} exitCode=${exitCode} → promoted .partial-result to .result`);
        } catch (e) {
          debugLog('docker-backend:partial-promote-error', `taskId=${taskId} ${e}`);
          // Fall through to host fallback below
          try { unlinkSync(partialPath); } catch { /* ok */ }
        }
      }

      // Clean up .partial-result if .result already exists (normal exit or promoted above)
      if (existsSync(partialPath)) {
        try { unlinkSync(partialPath); } catch { /* ok */ }
      }

      if (!existsSync(resultPath)) {
        // Sprint 272 T-003: enriched EXIT_WITHOUT_RESULT marker. This host fallback
        // fires when the container EXIT trap was bypassed (e.g. SIGKILL/OOM), so the
        // wrapper never wrote a marker. workPresent is unknown host-side (the container
        // is gone) → false; lastHb defaults to unknown (the .hb was already clobbered
        // with the host verdict above). Keeps the same NO_GO + "exited without writing
        // result (exitCode=" shape, now schema-compatible with the wrapper marker.
        const hostFallbackResult = JSON.stringify(
          buildExitWithoutResultMarker({
            taskId,
            model,
            exitCode,
            workPresent: false,
            source: 'host',
          }),
        );
        try {
          writeFileSync(resultPath, hostFallbackResult, 'utf-8');
          // fsync from host side to ensure data hits disk
          const fd = openSync(resultPath, 'r');
          try { fsyncSync(fd); } finally { closeSync(fd); }
          debugLog('docker-backend:host-fallback', `taskId=${taskId} exitCode=${exitCode} → wrote fallback .result`);
        } catch (e) {
          debugLog('docker-backend:host-fallback-error', `taskId=${taskId} ${e}`);
        }
        // Also write .timeout marker for backward compat
        if (!existsSync(timeoutPath)) {
          writeFileSync(timeoutPath, `container_exit_${exitCode}`, 'utf-8');
        }
      }

      if (settlementRef) {
        observeDockerHeartbeatAuthority({
          tasksDir,
          settlementRef,
          hostProcessOutcome: { state: 'exited', exitCode },
          workerTaskVerdict: workerTaskVerdictFromDockerResult(resultPath),
          liveness: 'not-alive',
        });
        // Container exit is NOT provider settlement: only the window the
        // container itself emitted around the provider process is persisted.
        if (!providerExecutionObservationBinding) {
          debugLog(
            'docker-backend:provider-observation-ingest-hold',
            'unsupported/HOLD: exact host-authored Docker provider observation binding is unavailable',
          );
        } else {
          try {
            const observationStore = new ProviderExecutionObservationStore(projectDir);
            try {
              ingestDockerProviderExecutionObservations({
                tasksDir,
                settlementRef,
                binding: providerExecutionObservationBinding,
                store: observationStore,
              });
            } finally {
              observationStore.close();
            }
          } catch (error) {
            debugLog('docker-backend:provider-observation-ingest-hold', error);
          }
        }
      }

      // RECOVERY-BORN-480-ATTRIBUTION-001: a normal worker result is still a
      // claim until the host compares scoped bytes with the exact attempt's
      // spawn-time baseline. This runs before any result enrichment or
      // settlement receipt. A missing/mismatched baseline becomes a durable
      // NO_GO/HOLD; it never falls back to the final shared-worktree diff.
      try {
        await reconcileDockerResultWorkAttribution({
          projectRoot: projectDir,
          resultPath,
          baselinePath: settlementRef
            ? taskResultSettlementWorkAttributionBaselinePath(settlementRef)
            : join(tasksDir, `task-${taskId}.scope-baseline`),
          attemptId: settlementRef?.attemptId,
          scopeFilesWrite: this.readTaskFilesWrite(projectDir, taskId),
          providerLimitDeath: runtimeBudgetExhaustion,
        });
      } catch (e) {
        debugLog('docker-backend:work-attribution-held', e);
        // Preserve container/claim/locks for typed recovery. Settling the raw
        // worker diff after losing attribution authority would fabricate work.
        return;
      }

      // born-644 (BUILD-VIOLATION-GUARD): advisory-only dist/ mutation check — compares
      // against the pre-spawn snapshot from runSpawn. Runs AFTER the fallback/reconciliation
      // block above so whatever `.result` ends up on disk (worker-written or host-fallback)
      // is the one that gets flagged. Never blocks: wrapped in its own try/catch, and
      // applyDistMutationAdvisory/computeDistFingerprint already swallow their own errors.
      try {
        const distFingerprintAfter = computeDistFingerprint(join(projectDir, 'dist'));
        if (distFingerprintsChanged(distFingerprintBefore, distFingerprintAfter)) {
          const patched = applyDistMutationAdvisory(resultPath, true);
          const warning =
            `[deckent:spawn-backend-docker] BUILD-VIOLATION-GUARD: dist/ mutated during the `
            + `container run for task ${taskId} (advisory only — NOT blocking). Suspect an `
            + `in-container build command (npm run build / tsc / build:all) — the docker `
            + `backend mounts the project root read-write, so this writes straight through to `
            + `host dist/. resultPatched=${patched}`;
          console.warn(warning);
          debugLog('docker-backend:dist-mutation', warning);
        }
      } catch (e) {
        debugLog('docker-backend:dist-fingerprint-after', e);
      }

      // Extract container logs BEFORE removal (docker logs requires container to exist).
      // born-671 (416-001 CAPTURE-TRUTH): STREAM the capture instead of the old
      // spawnSync — that path had NO maxBuffer, so Node's 1 MiB default silently cut
      // 44% of trace corpora at ~1.1 MB and killed the terminal usage envelope (293×
      // cost drift, 413-001). captureDockerLogs streams stdout+stderr with only a
      // 256 MiB honest-marker safety ceiling and surfaces any error/non-zero-exit
      // instead of swallowing it. AWAITED so the exact-ID `docker rm` below never races the
      // reader off the still-existing container. `content` is the SAME pristine string
      // the old path produced, so the two consumers below are byte-for-byte unchanged.
      try {
        const capture = await captureDockerLogs(containerId);
        const logContent = capture.content;
        if (logContent.trim()) {
          const logPath = join(tasksDir, `task-${taskId}.log`);
          // born-637 (TRACE-CONTENT-PARITY docker-parity): claude's container CLI
          // runs `--output-format stream-json` (claudeStreamJsonBaseArgs, runSpawn)
          // — its docker-logs dump is the FULL NDJSON event stream, not one final
          // envelope. born-639 (404-005 TRACE-TAIL): codex (already `--json`
          // NDJSON, provider-command-spec.ts) and gemini (`--output-format json`,
          // a single envelope) get the SAME normalize-write treatment now —
          // writeNormalizedDockerLog is provider-agnostic (whole-envelope fast
          // path + the codex event-bridge + normalizeStreamEvent's own never-drop
          // fallback), so readLogEvents/recordSprintWorkerTrace (dashboard SSE
          // tail + TRN-1 training-trace) see every provider's real trace instead
          // of the previous raw dump, which those readers always saw as zero
          // events (no `ts`/`seq`/`content` LogEvent shape on a raw CLI line).
          if (budgetMonitor) {
            for (const line of logContent.split(/\r?\n/)) {
              if (!line.trim()) continue;
              try { budgetMonitor.observe(normalizeStreamEvent(line, logProviderBinary)); } catch { /* marker/stop already handled */ }
            }
          }
          writeNormalizedDockerLog(logPath, logContent, logProviderBinary);
          const normalizedLog = readFileSync(logPath);
          let terminalEvidence: DockerTerminalProviderBillingEvidence | null = null;
          if (settlementRef) {
            try {
              terminalEvidence = persistDockerTerminalProviderBillingReceipt(
                settlementRef,
                logProviderBinary,
                normalizedLog.toString('utf-8'),
              );
            } catch (error) {
              terminalBillingReceiptError =
                error instanceof Error ? error : new Error(String(error));
              throw terminalBillingReceiptError;
            }
          }
          capturedProviderBilling = terminalEvidence?.billing
            ?? extractProviderBillingEvidence(
              logProviderBinary,
              normalizedLog.toString('utf-8'),
            );
          if (terminalEvidence) {
            capturedProviderBillingEvidenceRef = terminalEvidence.evidenceRef;
          } else if (capturedProviderBilling) {
            capturedProviderBillingEvidenceRef =
              `worker-log:task-${taskId}:sha256:${createHash('sha256').update(normalizedLog).digest('hex')}`;
          }
          // Patch the .result with REAL token usage parsed from the CLI envelope in the
          // captured container stdout — at the SOURCE, sidestepping the orchestrator
          // enrich-timing race (the .log lands only after the container exits, which can
          // lag the agent-written .result by 20-30s). The agent cannot know its own token
          // counts; they live only in the --output-format json / --json envelope here.
          // Uses the PRISTINE logContent (not the normalized .log now on disk) —
          // extractUsage already scans every line for a usage-bearing envelope
          // (providers/claude.ts), so this stays byte-identical across both the old
          // single-envelope and the new stream-json format (see the usage-patch
          // regression fixture in tests/orchestra/trace-content-parity.test.ts).
          patchResultUsageFromEnvelope(tasksDir, taskId, model, logContent);
          if (!capture.captureIncomplete) {
            try {
              reconcileDockerHostTerminalResultFile(
                resultPath,
                logPath,
                taskId,
                hostTerminalResultContract,
              );
            } catch (e) {
              // Projection failure remains visible as the existing NO_GO marker;
              // never manufacture success or prevent the host receipt from settling.
              debugLog('docker-backend:host-terminal-result', e);
            }
          }
        }
      } catch (e) { debugLog('docker-backend:log-extract', e); }
      if (terminalBillingReceiptError) {
        debugLog(
          'docker-backend:provider-terminal-receipt-held',
          `taskId=${taskId} ${terminalBillingReceiptError.message}`,
        );
        return;
      }
      if (settlementRef) {
        const terminalReceipt = readTaskProviderTerminalBillingReceipt(settlementRef);
        if (terminalReceipt) {
          capturedProviderBilling = terminalReceipt.billing;
          capturedProviderBillingEvidenceRef =
            taskProviderTerminalBillingEvidenceRef(terminalReceipt);
          try {
            reconcileDockerProviderBillingReceiptResultFile(
              resultPath,
              taskId,
              terminalReceipt,
            );
          } catch (error) {
            debugLog('docker-backend:provider-terminal-result-held', error);
            return;
          }
        }
      }
      let budgetSettleError: unknown;
      try {
        budgetMonitor?.settle();
      } catch (error) {
        budgetSettleError = error;
        debugLog('docker-backend:budget-settle', error);
      }
      if (settlementRef && readTaskResultSettlementExecutionContract(settlementRef)) {
        if (budgetSettleError) return;
        const terminalUsage = readRuntimeBudgetUsage(projectDir, taskId);
        if (!terminalUsage
          || terminalUsage.terminal !== true
          || terminalUsage.attemptId !== settlementRef.attemptId) {
          debugLog(
            'docker-backend:strict-terminal-usage-held',
            `taskId=${taskId} attemptId=${settlementRef.attemptId}`,
          );
          return;
        }
        try {
          writeTaskProviderTerminalUsageReceiptAtomic(
            settlementRef,
            terminalUsage as TaskProviderTerminalUsageSourceV1,
          );
        } catch (error) {
          debugLog('docker-backend:strict-terminal-usage-held', error);
          return;
        }
      }

      // When live activity tracing is disabled, budget events are observed from
      // the captured provider log above. Re-read after settle so that path gets
      // the same fail-closed result and heartbeat truth as live-follow mode.
      if (budgetMonitor) {
        try {
          budgetMonitor.settle();
        } catch (e) {
          debugLog('docker-backend:budget-final-settle-held', e);
          return;
        }
      }
      const finalRuntimeBudgetUsage = readRuntimeBudgetUsage(projectDir, taskId);
      const finalRuntimeBudgetExhaustion = readRuntimeBudgetExhaustion(projectDir, taskId)
        ?? runtimeBudgetExhaustion;
      if (
        settlementRef
        && finalRuntimeBudgetUsage?.terminal
        && finalRuntimeBudgetUsage.decision.state === 'landing-requested'
        && !effectiveRecoveryContainment
        && !readExecutionLandingCheckpointByRef({
          schemaVersion: 1,
          projectId: settlementRef.projectRootSha256,
          taskId,
          attemptId: settlementRef.attemptId,
        })
      ) {
        effectiveRecoveryContainment = {
          attemptId: settlementRef.attemptId,
          reason: 'landing-checkpoint-unavailable',
          evidence: 'Terminal runtime usage remained landing-requested without an immutable landing checkpoint.',
        };
      }
      try {
        let budgetReconciled = false;
        if (finalRuntimeBudgetExhaustion) {
          budgetReconciled = reconcileDockerRuntimeBudgetResultFile(
            resultPath,
            taskId,
            model,
            exitCode,
            finalRuntimeBudgetExhaustion,
          );
        } else if (finalRuntimeBudgetUsage && (
          !finalRuntimeBudgetUsage.terminal
          || finalRuntimeBudgetUsage.decision.state === 'unmeasurable'
        )) {
          budgetReconciled = reconcileDockerUnmeasurableRuntimeBudgetResultFile(
            resultPath,
            taskId,
            model,
            exitCode,
            finalRuntimeBudgetUsage,
          );
        } else if (
          finalRuntimeBudgetUsage?.terminal
          && finalRuntimeBudgetUsage.decision.state === 'within-budget'
        ) {
          budgetReconciled = reconcileDockerRuntimeBudgetUsageFile(
            resultPath,
            model,
            finalRuntimeBudgetUsage,
          );
        } else if (
          finalRuntimeBudgetUsage?.terminal
          && finalRuntimeBudgetUsage.decision.state === 'landing-requested'
        ) {
          budgetReconciled = reconcileDockerLandingRequestedRuntimeBudgetUsageFile(
            resultPath,
            model,
            finalRuntimeBudgetUsage,
          );
        }

        if ((budgetMonitor || finalRuntimeBudgetUsage) && !budgetReconciled) {
          debugLog('docker-backend:budget-final-reconcile-held', `taskId=${taskId} durable budget evidence could not be projected`);
          return;
        }
        if (finalRuntimeBudgetExhaustion || effectiveRecoveryContainment || (
          finalRuntimeBudgetUsage
          && (!finalRuntimeBudgetUsage.terminal || finalRuntimeBudgetUsage.decision.state === 'unmeasurable')
        )) {
          if (settlementRef) {
            observeDockerHeartbeatAuthority({
              tasksDir,
              settlementRef,
              hostProcessOutcome: { state: 'exited', exitCode },
              workerTaskVerdict: 'no-go',
              liveness: 'not-alive',
            });
          }
        }
      } catch (e) {
        debugLog('docker-backend:budget-final-reconcile-held', e);
        return;
      }
      try {
        reconcileDockerRecoveryContainmentResultFile(
          resultPath,
          taskId,
          effectiveRecoveryContainment,
        );
      } catch (e) {
        debugLog('docker-backend:recovery-result-reconcile', e);
        // Keep the stopped container, claim and spawn locks intact. A later
        // coordinator can re-adopt the exact attempt; sealing a receipt after
        // losing the host containment verdict would manufacture success.
        return;
      }

      if (!settlementRef) {
        debugLog(
          'docker-backend:result-settlement-held',
          `taskId=${taskId} settlement reference unavailable; preserving container authority and locks`,
        );
        return;
      }
      if (executionContinuation) {
        try {
          reconcileDockerContinuationLineageResultFile({
            resultPath,
            projectRoot: projectDir,
            taskId,
            model: model as ModelType,
            settlementRef,
            executionContinuation,
            terminalUsage: readRuntimeBudgetUsage(projectDir, taskId),
            terminalBilling: capturedProviderBilling,
            terminalBillingEvidenceRef: capturedProviderBillingEvidenceRef,
          });
        } catch (e) {
          debugLog('docker-backend:continuation-lineage-held', e);
          // The container has exited but its cumulative host truth is not
          // settlement-ready. Preserve container/claim/locks so recovery can
          // retry the exact attempt; never seal an attempt-only projection.
          return;
        }
      }

      // Cleanup container
      let lifecycleSettled = true;
      try {
        const removal = spawnSync('docker', ['rm', containerId], { encoding: 'utf-8', timeout: 10_000 });
        if (removal.status !== 0) {
          lifecycleSettled = false;
          debugLog('docker-backend:cleanup', `container removal failed: ${removal.stderr ?? ''}`);
        }
      } catch (e) {
        lifecycleSettled = false;
        debugLog('docker-backend:cleanup', e);
      }

      // Container authority must be settled before concurrency authority is
      // released. If exact-ID removal failed, keep the claim, locks and
      // registry entry intact for deterministic recovery.
      if (lifecycleSettled) {
        try {
          const released = releaseAllSpawnLocks(projectDir, taskId);
          if (released > 0) debugLog('docker-backend:spawn-lock', `taskId=${taskId} released ${released} spawn lock(s) on exit`);
        } catch (e) {
          lifecycleSettled = false;
          debugLog('docker-backend:spawn-lock-release', e);
        }
      }

      // Sprint 168 C0b: defensive sad-path safety net — releaseStaleSpawnLocksForTask
      // catches any spawnlock missed by releaseAllSpawnLocks (e.g. corrupted file,
      // partial unlink). Both helpers are idempotent and cheap when no locks remain.
      if (lifecycleSettled) {
        try {
          releaseStaleSpawnLocksForTask(projectDir, taskId);
        } catch (e) {
          lifecycleSettled = false;
          debugLog('docker-backend:spawn-lock-stale-release', e);
        }
      }

      if (lifecycleSettled && hasSpawnLocksForTask(projectDir, taskId)) {
        lifecycleSettled = false;
        debugLog('docker-backend:spawn-lock-release', `taskId=${taskId} still owns spawn locks after cleanup`);
      }

      // 455-003: the container has exited, so the in-container EXIT-trap has
      // already consumed $BASEFILE (the task-start scope baseline). Remove it —
      // it is a per-spawn transient with no post-exit value, and unlike the
      // .prompt/.worker forensic tmpfiles below it carries no debugging signal.
      if (lifecycleSettled) {
        try {
          const baselinePath = join(tasksDir, `task-${taskId}.scope-baseline`);
          if (existsSync(baselinePath)) unlinkSync(baselinePath);
        } catch (e) {
          lifecycleSettled = false;
          debugLog('docker-backend:scope-baseline-cleanup', e);
        }
      }

      // Last authority action: only a fully reconciled result whose container,
      // registry, locks and transient baseline are settled earns a receipt.
      if (lifecycleSettled) {
        try {
          if (!persistDockerTaskResultSettlement(projectDir, tasksDir, settlementRef, exitCode, model)) {
            lifecycleSettled = false;
            debugLog('docker-backend:result-settlement', `taskId=${taskId} result receipt was not persisted`);
          }
        } catch (e) {
          lifecycleSettled = false;
          debugLog('docker-backend:result-settlement', e);
        }
      }
      if (lifecycleSettled) {
        try {
          if (!closeDockerTaskResultSettlement(settlementRef, 'stopped-removed')) {
            lifecycleSettled = false;
            debugLog('docker-backend:result-settlement-closure', `taskId=${taskId} lifecycle closure was not persisted`);
          }
        } catch (e) {
          lifecycleSettled = false;
          debugLog('docker-backend:result-settlement-closure', e);
        }
      }

      if (lifecycleSettled) {
        cleanupDockerGitAdapter(this.containers.get(taskId)?.gitAdapterHostPath);
        this.containers.delete(taskId);
      }

      // Sprint 156 Task 4: .prompt-*.txt AND .worker-*.sh tmpfiles persist until sprint cleanup.
      // Both are archived together by archivePromptFiles() during sprint cleanup phase.
      // Rationale: worker scripts (.worker-*.sh) contain spawn invocation and env state useful for
      // post-mortem debugging when a container fails mid-execution. Previous behavior deleted them
      // immediately after each container exit, losing forensic value.
    };

    const finalizeWaitFailure = async (reason: string): Promise<void> => {
      if (waitFailureHandlingStarted || finalizationStarted) return;
      waitFailureHandlingStarted = true;
      stopFollow();
      try { budgetMonitor?.settle(); } catch (settleError) { debugLog('docker-backend:budget-settle-after-wait-failure', settleError); }

      let termination: DockerBudgetTerminationEvidence;
      try {
        termination = terminateDockerContainerForBudget(containerId, this.gracefulTimeoutSeconds);
      } catch (error) {
        debugLog(
          'docker-backend:monitor-containment-failed',
          `taskId=${taskId} ${reason}: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Exact containment was not proved. Preserve container registry, claim
        // and locks; no result receipt or closure may be manufactured.
        return;
      }
      if (!settlementRef) {
        debugLog('docker-backend:monitor-containment-held', `taskId=${taskId} ${reason}: settlement reference unavailable`);
        return;
      }
      effectiveRecoveryContainment = {
        attemptId: settlementRef.attemptId,
        reason: 'docker-wait-evidence-loss',
        evidence: reason.slice(0, 500),
      };
      await finalizeObservedExit(termination.exitCode);
    };

    child.stdout?.on('data', (data: Buffer | string) => {
      waitStdout += data.toString();
    });
    child.once('error', error => {
      debugLog('docker-backend:monitor-error', `taskId=${taskId} ${error.message}`);
      void finalizeWaitFailure(`docker-wait-error:${error.message}`);
    });
    child.once('close', (code, signal) => {
      if (finalizationStarted || waitFailureHandlingStarted) return;
      const rawExitCode = waitStdout.trim();
      if (/^\d+$/.test(rawExitCode)) {
        const exitCode = Number(rawExitCode);
        if (Number.isSafeInteger(exitCode)) {
          void finalizeObservedExit(exitCode);
          return;
        }
      }
      const evidence = rawExitCode || '<empty>';
      void finalizeWaitFailure(
        `docker-wait-invalid-exit-evidence:${evidence.slice(0, 200)}:code=${code ?? 'null'}:signal=${signal ?? 'none'}`,
      );
    });
  }
}

// ─── Docker Availability Check (sync) ─────────────────────────────────────

export function isDockerAvailable(): boolean {
  const result = spawnSync('docker', ['info'], {
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

// ─── Prompt File Archive ───────────────────────────────────────────────────

/**
 * Archive .prompt-*.txt AND .worker-*.sh tmpfiles into the canonical
 * `<archive_path>/<sprintId>/tasks/` evidence namespace.
 *
 * Called during sprint finalize/cleanup — tmpfiles persist during the sprint
 * for analysis, then are moved to the archive directory on completion.
 *
 * Sprint 156 Task 4 extension: worker scripts (.worker-*.sh) are archived alongside
 * prompt files. They contain spawn invocation context (env, claude args, taskId) that is
 * essential for post-mortem debugging when a container fails mid-execution.
 *
 * @param tasksDir  Absolute path to .tasks/ directory
 * @param sprintId  Sprint identifier (e.g. "sprint-139")
 * @param retentionSprints  How many past sprint archives to keep (default 5)
 */
export function archivePromptFiles(
  tasksDir: string,
  sprintId: string,
  _retentionSprints = 5,
  taskIdPrefix?: string,
): { archived: number; cleaned: number } {
  if (!existsSync(tasksDir)) return { archived: 0, cleaned: 0 };
  const segment = sprintId.replace(/^sprint-/u, '');
  const prefix = taskIdPrefix ?? `${segment}-`;
  let candidates: string[] = [];
  try {
    candidates = (readdirSync(tasksDir) as string[]).filter(file => (
      (file.startsWith(`.prompt-${prefix}`) && file.endsWith('.txt'))
      || (file.startsWith(`.worker-${prefix}`) && file.endsWith('.sh'))
    ));
  } catch { /* the caller receives an honest zero */ }
  const result = archiveTaskArtifacts(dirname(tasksDir), sprintId, {
    archive: candidates,
    preserve: [],
    sweepResidue: false,
  });
  return { archived: result.archived.length + result.consolidated.length, cleaned: 0 };
}
