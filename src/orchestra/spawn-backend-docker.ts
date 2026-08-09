// ─── Docker Spawn Backend ─────────────────────────────────────────────────
// Spawns workers in isolated Docker containers.
// Each worker gets its own filesystem namespace — no cross-worker interference.
// Results collected via shared .tasks/ volume mount.

import { spawnSync, spawn as nodeSpawn } from 'node:child_process';
import type { SpawnOptionsWithoutStdio } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync, openSync, fsyncSync, closeSync, readdirSync, renameSync, rmdirSync, chmodSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { homedir, tmpdir, totalmem } from 'node:os';
import type { ModelType } from '../core/types.js';
import { canonicalJson } from '../core/audit-writer.js';
import {
  assertCrossVerifyEnforcedAttemptContract,
  type CrossVerifyEnforcedAttemptContract,
} from '../core/cross-verify-execution-contract.js';
import { getProviderForModel, TaskStatus, type ProviderName, type Task, type TaskResult } from '../core/task-types.js';
import { modelRegistry } from '../core/model-registry.js';
import { getProviderCommandSpec, buildProviderCommand, type ProviderCommandSpec } from '../core/provider-command-spec.js';
import { createClaudeAdapter } from '../providers/claude.js';
import { createCodexAdapter } from '../providers/codex.js';
import { createGeminiAdapter } from '../providers/gemini.js';
import { buildSuggestedImageCmd } from '../core/worker-image-check.js';
import { LOCKS_DIR, TASKS_DIR } from '../core/constants.js';
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
import { atomicWriteFileSync } from '../agents/worker-lifecycle.js';
import {
  WorkerHeartbeatAuthorityStore,
  type WorkerHeartbeatAuthorityWrite,
} from '../core/worker-heartbeat-authority-store.js';
import {
  claimTaskResultSettlementAttemptAtomic,
  createTaskResultSettlement,
  createTaskResultSettlementRef,
  DOCKER_ATTEMPT_LABELS,
  dockerAttemptLabels,
  dockerContainerNameForTask,
  assertTaskResultSettlementRef,
  listPendingTaskResultSettlementAttempts,
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
import { normalizeTaskResultShape } from '../core/task-result-schema.js';
import {
  listRetiredExecutionLandings,
  readExecutionLandingCheckpointByRef,
  executionLandingCheckpointPath,
  writeExecutionAttemptRetirementAtomic,
  type ExecutionLandingCheckpointRefV1,
} from '../core/execution-landing-checkpoint.js';
import { BASE_PROVIDER_CREDENTIAL_ENV } from '../providers/cross-provider-keys.js';
import type {
  HostTerminalResultContractV1,
  SpawnBackend,
  SpawnBackendOptions,
  SpawnBackendRecoveryOptions,
  SpawnBackendRecoveryReport,
} from './spawn-backend.js';
import { SpawnBackendError, checkLethalGuard } from './spawn-backend.js';
import { getDefaultProviderName } from './sprint-utils.js';
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

// ─── Constants ────────────────────────────────────────────────────────────

const DEFAULT_IMAGE = 'deckent-worker:latest';
/** @deprecated Use adaptive timeout via brainEstimateTimeout() + SpawnBackendOptions.taskTimeoutSeconds instead. Kept for backward compat fallback. */
const DEFAULT_TIMEOUT_SECONDS = 1200; // 20 minutes
const CONTAINER_WORKSPACE = '/workspace';
const CONTAINER_GIT_COMMON_DIR = '/run/deckent-git/common';
const CONTAINER_EXACT_XVERIFY_PROMPT = '/run/deckent-xverify-prompt.txt';
const DEFAULT_GRACEFUL_TIMEOUT_SECONDS = 15;
// Exported as the SSOT container-name prefix so the host-liveness probe
// (heartbeat-monitor.ts) derives `deckent-w-<taskId>` from the SAME constant the
// backend uses to `docker run --name` / `docker wait` — no drifting duplicate.
export const CONTAINER_PREFIX = 'deckent-w-';

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
): boolean {
  if (!ref) return false;
  assertTaskResultSettlementRef(projectRoot, ref.taskId, ref);
  const resultPath = join(tasksDir, `task-${ref.taskId}.result`);
  if (!existsSync(resultPath)) return false;
  const parsed = JSON.parse(readFileSync(resultPath, 'utf-8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new DeckentError('E_DOCKER_RESULT_SETTLEMENT_IS_NOT_A_JSON_OBJECT', `Docker result settlement is not a JSON object: ${resultPath}`);
  }
  const result = normalizeTaskResultShape(
    parsed as Record<string, unknown> & { notes?: unknown },
  ) as Record<string, unknown>;
  atomicWriteFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  const settlement = createTaskResultSettlement({ ref, exitCode, result });
  writeTaskResultSettlementAtomic(settlement);
  return true;
}

const MAX_RECOVERY_FORENSIC_BYTES = 1024 * 1024;

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
      if (record.taskId !== input.ref.taskId) {
        throw new SpawnBackendError(
          `DECKENT_E091:recovery-result-task-mismatch:${input.ref.taskId}/${input.ref.attemptId}`,
          'docker',
        );
      }
      const normalized = normalizeTaskResultShape(record) as Record<string, unknown>;
      atomicWriteFileSync(resultPath, `${JSON.stringify(normalized, null, 2)}\n`);
      return 'worker-result';
    } catch (error) {
      if (error instanceof SpawnBackendError) throw error;
      artifactState = 'malformed';
      const captured = raw.subarray(0, MAX_RECOVERY_FORENSIC_BYTES);
      const forensicReceipt = {
        schemaVersion: 1,
        taskId: input.ref.taskId,
        attemptId: input.ref.attemptId,
        artifactState,
        rawSha256,
        rawBytes: raw.byteLength,
        capturedBytes: captured.byteLength,
        truncated: captured.byteLength !== raw.byteLength,
        rawBase64: captured.toString('base64'),
        capturedAt: new Date().toISOString(),
      };
      const forensicPath = join(
        dirname(taskResultSettlementPath(input.ref)),
        'invalid-worker-result.json',
      );
      if (existsSync(forensicPath)) {
        const existing = JSON.parse(readFileSync(forensicPath, 'utf-8')) as {
          rawSha256?: string;
          taskId?: string;
          attemptId?: string;
        };
        if (
          existing.rawSha256 !== rawSha256
          || existing.taskId !== input.ref.taskId
          || existing.attemptId !== input.ref.attemptId
        ) {
          throw new SpawnBackendError(
            `DECKENT_E091:recovery-forensic-conflict:${input.ref.taskId}/${input.ref.attemptId}`,
            'docker',
          );
        }
      } else {
        atomicWriteFileSync(forensicPath, `${JSON.stringify(forensicReceipt, null, 2)}\n`);
      }
      forensicEvidenceRef = `invalid-worker-result:sha256:${rawSha256}`;
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

  return {
    available: true,
    mountArgs: [
      '--mount', `type=bind,src=${dotGitPath},dst=${CONTAINER_WORKSPACE}/.git,readonly`,
      '--mount', `type=bind,src=${hostCommonDir},dst=${CONTAINER_GIT_COMMON_DIR},readonly`,
    ],
    envArgs: [
      '-e', `GIT_WORK_TREE=${CONTAINER_WORKSPACE}`,
      '-e', `GIT_COMMON_DIR=${CONTAINER_GIT_COMMON_DIR}`,
      '-e', `GIT_DIR=${containerGitDir}`,
    ],
    hostCommonDir,
    containerGitDir,
  };
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
    const hostPath = join(home, oauthHomeDir, file);
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
  home: string,
  provider: string,
  oauthHomeDir: string | undefined,
): ProviderAuthIsolationOptions {
  if (!oauthHomeDir) return {};
  const projectKey = createHash('sha256').update(resolve(projectDir)).digest('hex').slice(0, 24);
  const brokerDir = join(tmpdir(), 'deckent-provider-auth', projectKey, provider);
  mkdirSync(brokerDir, { recursive: true, mode: 0o700 });
  chmodSync(brokerDir, 0o700);

  const credentialSources: Record<string, string> = {};
  for (const entry of PROVIDER_AUTH_FILES[provider] ?? []) {
    const hostPath = join(home, oauthHomeDir, entry.file);
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
  return { credentialSources, lockPath };
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
export function computeScopeBaselineManifest(dir: string, scopeFilesWrite: readonly string[]): string {
  const lines: string[] = [];
  for (const raw of scopeFilesWrite) {
    const rel = typeof raw === 'string' ? raw.trim() : '';
    if (!rel) continue;
    let abs: string;
    try { abs = resolve(dir, rel); } catch { continue; }
    if (!existsSync(abs)) continue;
    try {
      const res = spawnSync('git', ['hash-object', '-w', '--', rel], {
        cwd: dir, encoding: 'utf-8', timeout: 5_000, stdio: ['pipe', 'pipe', 'pipe'],
      });
      const hash = (res.stdout ?? '').trim();
      if (res.status === 0 && /^[0-9a-f]{40,64}$/.test(hash)) {
        lines.push(`${rel}${SCOPE_BASELINE_DELIM}${hash}`);
      }
    } catch (e) {
      debugLog('docker-backend:scope-baseline', e);
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

export function captureScopeAttributionManifest(
  projectRoot: string,
  attemptId: string,
  scopeFilesWrite: readonly string[],
): string {
  const scopeFiles = normalizedScopeFiles(scopeFilesWrite);
  const contentManifest = computeScopeBaselineManifest(projectRoot, scopeFiles);
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
}

export interface DockerResultWorkAttributionOutcome {
  readonly state: 'VERIFIED' | 'HOLD';
  readonly filesChanged: readonly string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
  readonly reasonCode?: string;
}

function gitBlobHash(projectRoot: string, path: string): string | null {
  if (!existsSync(resolve(projectRoot, path))) return null;
  const result = spawnSync('git', ['hash-object', '-w', '--', path], {
    cwd: projectRoot,
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const hash = (result.stdout ?? '').trim();
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

function gitBlobLineCount(projectRoot: string, hash: string): number {
  const result = spawnSync('git', ['cat-file', 'blob', hash], {
    cwd: projectRoot,
    encoding: null,
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    throw new DeckentError('E_BASELINE_BLOB_UNAVAILABLE', 'baseline-blob-unavailable');
  }
  return countTextLines(result.stdout);
}

function blobNumstat(
  projectRoot: string,
  beforeHash: string,
  afterHash: string,
): { added: number; removed: number } {
  const result = spawnSync('git', ['diff', '--numstat', beforeHash, afterHash], {
    cwd: projectRoot,
    encoding: 'utf-8',
    timeout: 5_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const first = (result.stdout ?? '').trim().split(/\r?\n/, 1)[0] ?? '';
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

function writeAttributionResult(
  input: ReconcileDockerResultWorkAttributionInput,
  result: Record<string, unknown>,
  outcome: DockerResultWorkAttributionOutcome,
  scopeDigest: string,
  claimedOutsideScope: readonly string[],
  changes: readonly { path: string; status: 'added' | 'modified' | 'deleted'; linesAdded: number; linesRemoved: number }[],
  baselineSha256?: string,
): void {
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
export function reconcileDockerResultWorkAttribution(
  input: ReconcileDockerResultWorkAttributionInput,
): DockerResultWorkAttributionOutcome {
  const result = JSON.parse(readFileSync(input.resultPath, 'utf-8')) as Record<string, unknown>;
  const scopeFiles = normalizedScopeFiles(input.scopeFilesWrite);
  const scopeSet = new Set(scopeFiles);
  const scopeDigest = scopeAttributionDigest(scopeFiles);
  const claimedOutsideScope = resultClaimedPaths(result).filter(path => !scopeSet.has(path));
  const baselineSha256 = existsSync(input.baselinePath)
    ? createHash('sha256').update(readFileSync(input.baselinePath)).digest('hex')
    : undefined;
  const hold = (reasonCode: string): DockerResultWorkAttributionOutcome => {
    const outcome = { state: 'HOLD' as const, filesChanged: [], linesAdded: 0, linesRemoved: 0, reasonCode };
    writeAttributionResult(input, result, outcome, scopeDigest, claimedOutsideScope, [], baselineSha256);
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
      const afterHash = gitBlobHash(input.projectRoot, path);
      if (beforeHash === afterHash) continue;
      const counts = beforeHash === null
        ? {
            added: countTextLines(readFileSync(resolve(input.projectRoot, path))),
            removed: 0,
          }
        : afterHash === null
          ? { added: 0, removed: gitBlobLineCount(input.projectRoot, beforeHash) }
          : blobNumstat(input.projectRoot, beforeHash, afterHash);
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
    writeLogEvent(logPath, normalizeStreamEvent(raw, provider), 1);
    return 1;
  }

  let seq = 1;
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
  }
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

// ─── born-471: ALLOWLIST-SSOT ───────────────────────────────────────────────
// sprint-spawner.ts's buildAllowedWriteTargets merges scope.directories into
// the SAME Write()/Edit() target list as scope.filesWrite unconditionally.
// The worker PROMPT disagrees (prompt-god-template.ts PCOMP-W1, "single write
// authority"): once an explicit filesWrite list exists it is the SOLE write
// authority and the directory list is READ/context scope only — a worker told
// "you may only write these N files" must not simultaneously hold a
// --allowedTools grant of Write()/Edit() over an entire read-context
// directory (e.g. docs/adr/ listed for read-context, with no matching docs/
// entry in filesWrite, would otherwise still be writable). The docker backend
// is the last hop before the flag reaches the CLI, so it re-derives the
// allowlist HERE from the task's own on-disk scope, applying the same
// canonical rule as the prompt — independent of whatever opts.allowedTools
// the caller computed. (sprint-spawner.ts itself is out of this task's write
// scope; importing its helpers here would also create an import cycle —
// sprint-spawner → spawn-backend → spawn-backend-docker → sprint-spawner.)

/** Pure scope shape this module needs — subset of `TaskScope` (core/task-types.ts). */
export interface DockerAllowedToolsScope {
  directories?: readonly string[];
  filesRead?: readonly string[];
  filesWrite?: readonly string[];
}

/**
 * Derive the docker backend's `--allowedTools` string from a task's scope.
 * `filesWrite` present → SOLE write authority (directories excluded — they
 * stay read-only context, reachable only via the unscoped Read/Glob/Grep).
 * An exact `filesRead` list with no `filesWrite` targets is inspection-only:
 * directories remain read context and Write/Edit is narrowed to `.tasks/`.
 * When both file lists are absent/empty, directories remain the legacy
 * write-fallback target. `.tasks/` is always included
 * so the worker can write its own heartbeat/result files — this also means
 * a task with neither directories nor filesWrite still narrows Write/Edit to
 * `.tasks/` only, never falls open to unrestricted Write/Edit (a scope-less
 * task must not silently get the widest possible grant). Pure — exported for
 * unit tests.
 */
export function buildDockerAllowedTools(scope: DockerAllowedToolsScope): string {
  const directories = normalizeNonEmptyStrings(scope.directories);
  const filesRead = normalizeNonEmptyStrings(scope.filesRead);
  const filesWrite = normalizeNonEmptyStrings(scope.filesWrite);
  const inspectionOnly = filesWrite.length === 0 && filesRead.length > 0;
  const writeSource = filesWrite.length > 0 ? filesWrite : inspectionOnly ? [] : directories;
  const writeTargets = dedupeTrimmed(['.tasks/', ...writeSource]);
  return `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`;
}

function normalizeNonEmptyStrings(values: readonly string[] | undefined): string[] {
  return (values ?? []).filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function dedupeTrimmed(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of paths) {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
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
  readonly crossVerifyRuntimeCommandRunner?: DockerCrossVerifyRuntimeCommandRunner;
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
  private readonly crossVerifyRuntimeCommandRunner: DockerCrossVerifyRuntimeCommandRunner;
  private readonly containers = new Map<string, {
    containerId: string;
    containerName: string;
    model: string;
    projectDir: string;
    tasksDir: string;
    settlementRef?: TaskResultSettlementRefV1;
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
    this.crossVerifyRuntimeCommandRunner =
      opts?.crossVerifyRuntimeCommandRunner ?? runBoundedCrossVerifyRuntimeCommand;
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
    };
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
          throw new SpawnBackendError(
            `DECKENT_E091:unprepared-attempt-has-worker-result:${attempt.taskId}/${attempt.attemptId}`,
            this.name,
          );
        }
        atomicWriteFileSync(resultPath, `${JSON.stringify({
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
        }, null, 2)}\n`);
        this.settleRecoveredAttempt(attempt, tasksDir, null, 'not-dispatched');
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
  ): void {
    if (!readTaskResultSettlement(ref)) {
      const persisted = persistDockerTaskResultSettlement(this.projectDir, tasksDir, ref, exitCode);
      if (!persisted) {
        throw new SpawnBackendError(
          `DECKENT_E091:recovery-result-missing:${ref.taskId}/${ref.attemptId}`,
          this.name,
        );
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
    this.spawnInternal(taskId, model, prompt, opts);
  }

  /**
   * Dedicated exact-xverify entrypoint.
   *
   * This never routes through `SpawnBackendFactory` and never reads its prompt
   * from the project `.tasks/` mount. The returned handle contains no
   * actual-call, usage or terminal facts.
   */
  spawnExactCrossVerify(
    input: DockerExactCrossVerifySpawnInput,
  ): DockerExactCrossVerifyDispatchHandle {
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
    try {
      this.runSpawn(
        taskId,
        model,
        preparedPrompt,
        resolvedOpts,
        dir,
        effectiveTimeout,
        tasksDir,
        gitIsolation,
        exactContext,
      );
    } catch (err) {
      clearPending(taskId);
      try { releaseAllSpawnLocks(dir, taskId); } catch (e) { debugLog('docker-backend:spawn-lock-release', e); }
      throw err;
    }
  }

  private runSpawn(
    taskId: string,
    model: ModelType,
    prompt: string,
    opts: SpawnBackendOptions | undefined,
    dir: string,
    effectiveTimeout: number,
    tasksDir: string,
    gitIsolation: DockerGitIsolation,
    exact?: DockerExactCrossVerifyContext,
  ): void {
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
    const dockerSpec: ProviderCommandSpec = providerBinary === 'claude'
      ? { ...spec, baseArgs: claudeStreamJsonBaseArgs(spec.baseArgs) }
      : spec;
    // IMMUTABLE — deckent workers run with full autonomy (autoApprove). The spec
    // maps that to the correct per-provider flag (claude --dangerously-skip-
    // permissions, codex --dangerously-bypass-approvals-and-sandbox, gemini yolo).
    const workerCmd = buildProviderCommand(dockerSpec, apiId, containerPromptPath, {
      // born-471 (ALLOWLIST-SSOT): re-derived from the task's own on-disk
      // scope, not trusted verbatim from opts.allowedTools — see the
      // ALLOWLIST-SSOT block comment above resolveAllowedTools.
      allowedTools: this.resolveAllowedTools(dir, taskId, opts?.allowedTools),
      // `availableTools` narrows the provider-visible schema itself. It is
      // protocol-scoped by the caller (xverify-v1) and distinct from the
      // write/permission authority above.
      availableTools: opts?.availableTools,
      isolatedContext: opts?.isolatedContext,
      autoApprove: true,
      // F1-RE (Sprint 252): resolved model reasoning-effort (claude --effort,
      // codex -c model_reasoning_effort); undefined → no flag (CLI default).
      reasoningEffort: opts?.reasoningEffort,
      // F3.1: prefix-stable system prompt inside the container (per-machine sections
      // → first user message). Only the claude spec emits the flag; others ignore it.
      excludeDynamicPromptSections: opts?.excludeDynamicPromptSections,
    });
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
    const home = homedir();

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
          home,
          providerBinary,
          spec.oauthHomeDir ?? undefined,
        );
    const providerAuth = buildProviderAuthIsolation(
      home,
      providerBinary,
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
      const baselineManifest = captureScopeAttributionManifest(
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

  private resolveExecutionContext(taskId: string): { projectDir: string; tasksDir: string; containerId: string } {
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
    const { projectDir, tasksDir, containerId } = this.resolveExecutionContext(taskId);
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
      // Sprint 149: Partial write detection — .result exists but corrupt JSON
      // This catches cases where container was SIGKILL'd mid-write
      if (existsSync(resultPath) && exitCode !== 0) {
        try {
          const raw = readFileSync(resultPath, 'utf-8');
          JSON.parse(raw); // Just validate — if corrupt, overwrite below
        } catch {
          debugLog('docker-backend:partial-write', `taskId=${taskId} .result exists but corrupt JSON — overwriting with NO_GO`);
          try { unlinkSync(resultPath); } catch { /* ok */ }
          // Fall through to the fallback writer below
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
        reconcileDockerResultWorkAttribution({
          projectRoot: projectDir,
          resultPath,
          baselinePath: settlementRef
            ? taskResultSettlementWorkAttributionBaselinePath(settlementRef)
            : join(tasksDir, `task-${taskId}.scope-baseline`),
          attemptId: settlementRef?.attemptId,
          scopeFilesWrite: this.readTaskFilesWrite(projectDir, taskId),
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
          if (!persistDockerTaskResultSettlement(projectDir, tasksDir, settlementRef, exitCode)) {
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

      if (lifecycleSettled) this.containers.delete(taskId);

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
 * Archive .prompt-*.txt AND .worker-*.sh tmpfiles from .tasks/ into .tasks/archive/sprint-{sprintId}/.
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
  retentionSprints = 5,
  taskIdPrefix?: string,
): { archived: number; cleaned: number } {
  let archived = 0;
  let cleaned = 0;

  if (!existsSync(tasksDir)) return { archived, cleaned };

  // Create archive directory for this sprint
  const archiveDir = join(tasksDir, 'archive', sprintId);
  mkdirSync(archiveDir, { recursive: true });

  // Move all .prompt-*.txt AND .worker-*.sh tmpfiles to archive
  try {
    const files = readdirSync(tasksDir) as string[];
    for (const f of files) {
      const isPromptFile = f.startsWith('.prompt-') && f.endsWith('.txt');
      const isWorkerScript = f.startsWith('.worker-') && f.endsWith('.sh');
      const belongsToSprint = taskIdPrefix === undefined
        || f.startsWith(`.prompt-${taskIdPrefix}`)
        || f.startsWith(`.worker-${taskIdPrefix}`);
      if ((isPromptFile || isWorkerScript) && belongsToSprint) {
        const src = join(tasksDir, f);
        const dst = join(archiveDir, f);
        try {
          renameSync(src, dst);
          archived++;
        } catch { /* skip files that can't be moved */ }
      }
    }
  } catch { /* ok — tasksDir may be empty */ }

  // F0.3: drain the mid-sprint orphan staging bucket (.tasks/archive/_orphaned/,
  // populated by ClaudeAdapter.archiveOrphanPromptFile when a prompt is cleaned
  // before sprint-end) into this sprint's archive dir, so those prompts inherit
  // the same retention instead of accumulating unbounded in staging.
  const orphanStaging = join(tasksDir, 'archive', '_orphaned');
  if (taskIdPrefix === undefined && existsSync(orphanStaging)) {
    try {
      for (const f of readdirSync(orphanStaging) as string[]) {
        try { renameSync(join(orphanStaging, f), join(archiveDir, f)); archived++; }
        catch { /* skip files that can't be moved */ }
      }
    } catch { /* ok */ }
  }

  // Apply retention policy: remove old sprint archives beyond retentionSprints
  if (retentionSprints > 0) {
    const archiveRoot = join(tasksDir, 'archive');
    try {
      const sprintDirs = (readdirSync(archiveRoot) as string[])
        .filter(d => d.startsWith('sprint-'))
        .sort(); // alphabetical sort = chronological for sprint-NNN format
      const toRemove = sprintDirs.slice(0, Math.max(0, sprintDirs.length - retentionSprints));
      for (const dir of toRemove) {
        const dirPath = join(archiveRoot, dir);
        try {
          // Remove all files in the old archive sprint dir
          const oldFiles = readdirSync(dirPath) as string[];
          for (const f of oldFiles) {
            try { unlinkSync(join(dirPath, f)); cleaned++; } catch { /* ok */ }
          }
          // Remove the now-empty directory
          rmdirSync(dirPath);
        } catch { /* ok */ }
      }
    } catch { /* archive root may not exist yet */ }
  }

  return { archived, cleaned };
}
