// ═══ Scheduler Effects — Canonical Spawn Executor (SCHED3, dilim-3) ═══════
// docs/analysis/scheduler-unify-design-2026-07-11.md — Sprint-3 slice
// ("cascadeSkipped ve fix-task routing koruma garantisi").
//
// Single execution path for "spawn one task": fix-task routing-lineage
// inheritance (forceModel/provider/backend/modelEffort — copy only when the
// fix-task left the field undefined, an explicit override is never touched)
// applied BEFORE prompt/provider/backend/reasoning-effort resolution, then
// the actual backend dispatch, then task persistence — all in one place.
//
// Both the heavyweight respawn path (sprint-spawner.ts respawnEligibleTasks)
// and the local queue-driven paths (result-collector.ts processQueue /
// forceRescanIfIdle / dispatchReadyTasks, via spawnIfNotAssigned) delegate
// here, so a task's routing fate no longer depends on which trigger spawned
// it (born-634/635 finding: previously only the heavyweight path applied
// fix-inheritance and persisted the task; the local path did neither).
//
// OUT OF SCOPE for this slice (stays in the wave-level caller, NOT moved
// here — see the design doc): DEPENDENCY_BLOCKED events, wave.transition /
// wave.respawn metrics, checkpoint writes, emitRotationMetricIfApplicable,
// emitTimeoutEvents. The wave-level caller computes `taskTimeoutSeconds`
// itself and forwards the value through `SpawnTaskEffect`.
//
// This module is intentionally a LEAF — it must never import from
// sprint-spawner.ts or result-collector.ts. Those two files already form an
// established circular pair (bridged there via lazy dynamic import); a third
// static edge back into either would reintroduce that cycle. Caller-specific
// collaborators (prompt resolution, write-target computation) are passed in
// via `SpawnTaskDeps` instead of imported.

import { buildWorkerCoreSystemPrompt } from './prompt-god-template.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, renameSync, appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

import type { Task, ResolvedConfig, TaskResult } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { normalizeTaskResultShape, serializeTaskResultForDisk } from '../core/task-result-schema.js';
import {
  isHostPreDispatchReasonCode,
  resolveHostPreDispatchFailureDisposition,
  type FailureDispositionPolicyConfig,
} from '../core/failure-disposition-policy.js';
import { TASKS_DIR } from '../core/constants.js';
import type { TaskAttemptCustodyDispatchNotDispatchedAuthorityV2 } from '../core/task-attempt-custody-store.js';
import { resolveLiveTraceEnabled } from '../core/config.js';
import { debugLog } from '../core/utils.js';
import { DeckentError } from '../core/errors.js';
import {
  assertExecutionLandingSupport,
  assertLiveUsageBudgetSupport,
} from '../core/live-execution-budget.js';
import { getProviderCommandSpec } from '../core/provider-command-spec.js';
import {
  attendedExecutionProjectId,
  type AttendedExecutionApprovalAuthority,
  type AttendedExecutionApprovalExpectedDispatch,
} from '../core/attended-execution-approval.js';
import {
  createTaskResultSettlementRefForAttempt,
  type TaskResultSettlementRefV1,
} from '../core/task-result-settlement.js';
import {
  createHostPreDispatchNoGoResult,
  type HostPreDispatchReasonCode,
} from '../core/pre-dispatch-settlement.js';
import { requireFinalOnlyUsageContainment } from '../core/final-only-usage-containment.js';
import {
  assertAttendedExecutionProposalMaterial,
  createAttendedExecutionProposalMaterialFromTask,
} from '../core/attended-execution-proposal.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import {
  preflightProviderExecutionIngress,
  ProviderExecutionIngressHoldError,
} from '../core/provider-execution-ingress-authority.js';

import {
  resolveTaskProvider, isTmuxProvider, isAdapterProvider, getProviderAdapterForTask,
} from './sprint-utils.js';
import type { SpawnBackend, SpawnBackendRecoveryReport } from './spawn-backend.js';
import { SpawnBackendFactory } from './spawn-backend.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import {
  bootstrapProviders,
  orderedRoleProviders,
  type ProviderAdapter,
} from '../core/provider.js';
import { spawnWorker } from './tmux.js';
import { buildWorkerApprovalGateEnv } from '../agents/worker-approval-env.js';
import { writeEvent, CHANNELS, getCurrentSprintId } from './event-stream.js';
import { metric } from '../core/observability.js';
import {
  buildWorkerPrompt,
  type WorkerPromptCompilationSinkV2,
} from './task-builder.js';
import { writePromptDeliveryReceipt } from '../core/prompt-delivery-receipt.js';
import {
  inspectTaskArtifactsDeferred,
  publishTaskArtifactsNoClobber,
  transitionTaskArtifactProjectionCas,
} from './task-artifact-projection.js';
import {
  createExactDockerCustodyPolicy,
  createExactDockerDispatchTaskMaterial,
  createExactDockerPromptDeliveryAuthority,
  exactDockerCustodyMaterialDigest,
} from './spawn-backend-docker.js';
import {
  createExactNormalTaskApprovedMaterialV3,
  ExactEvaluationPolicyFailure,
  type ExactNormalTaskApprovedMaterialV3,
} from './exact-evaluation-policy-authority.js';
import type {
  ExactDockerAcceptedResultV2,
  ExactDockerCustodyPredecessorV2,
  ExactDockerCustodyDispatchOutcomeV2,
  ExactDockerCustodyIdentityRefV2,
  ExactDockerCustodyPreparationRefV2,
  ExactDockerCustodyTerminalQueryV2,
} from './spawn-backend.js';
import type {
  ExactAcceptedTaskResultAuthorityMetadata,
  TaskResultAuthorityRead,
} from './task-result-authority.js';
import {
  projectExactAcceptedTaskResult,
  readAuthoritativeTaskResult,
} from './task-result-authority.js';
import type {
  ExactAcceptedTaskTerminalAuthorityRead,
} from './evaluation-audit-trail.js';
import type {
  RevalidateExactAcceptedResultTerminalAuthority,
  SettleExactAcceptedResult,
} from './exact-accepted-result-terminal-authority.js';
import type { DependencyResultEntry } from './prompt-god-template.js';
import type { SchedulerDecision } from './scheduler-reducer.js';
import { schedulerShadowJournalPath } from './scheduler-journal.js';

// ─── Fix-Task Routing-Field Inheritance ───────────────────────────────────
// Relocated from sprint-spawner.ts `preserveFixTaskRoutingFields` (born-476,
// Sprint 361 Task 361-005) — same field-by-field "copy only if undefined,
// preserve explicit override" semantics — now returning an honest `missing`
// outcome instead of the prior fail-soft no-op when the original task file
// cannot be read/parsed. `preserveFixTaskRoutingFields` itself is left as-is
// in sprint-spawner.ts for spawnWorkers' unrelated call (initial spawn wave
// is not one of the two executors this slice unifies).

type FixExecutionField = 'forceModel' | 'provider' | 'backend' | 'modelEffort' | 'type';
const FIX_EXECUTION_FIELDS: readonly FixExecutionField[] = [
  'forceModel',
  'provider',
  'backend',
  'modelEffort',
  'type',
];

interface FixRoutingLineageResult {
  missing: boolean;
  detail?: string;
}

function applyFixRoutingLineage(
  task: Task,
  projectRoot: string,
  sprintFallbackId: string,
): FixRoutingLineageResult {
  if (!task.isPriorityFix || !task.fixForTaskId) return { missing: false };

  const originalPath = join(projectRoot, TASKS_DIR, `task-${task.fixForTaskId}.json`);
  let raw: string | null;
  try {
    raw = readFileSync(originalPath, 'utf-8');
  } catch {
    raw = null;
  }
  if (!raw) {
    return {
      missing: true,
      detail: `original task ${task.fixForTaskId} (fix target for ${task.id}) could not be read at ${originalPath}`,
    };
  }

  let original: Task;
  try {
    original = JSON.parse(raw) as Task;
  } catch (e) {
    return {
      missing: true,
      detail: `original task ${task.fixForTaskId} JSON is corrupt: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const taskRecord = task as unknown as Record<FixExecutionField, unknown>;
  const originalRecord = original as unknown as Record<FixExecutionField, unknown>;

  const inherited: Partial<Record<FixExecutionField, unknown>> = {};
  const overridden: Partial<Record<FixExecutionField, { from: unknown; to: unknown }>> = {};

  for (const field of FIX_EXECUTION_FIELDS) {
    const originalValue = originalRecord[field];
    if (originalValue === undefined) continue; // nothing pinned on the original to inherit
    const fixValue = taskRecord[field];
    if (fixValue === undefined) {
      // Silent-drop protection: the producer never carried this field
      // forward — inherit it now so spawn resolution below sees the pin.
      taskRecord[field] = originalValue;
      inherited[field] = originalValue;
    } else if (fixValue !== originalValue) {
      // Already a conscious, explicit value on the fix-task — never
      // silently overwritten, but always surfaced below.
      overridden[field] = { from: originalValue, to: fixValue };
    }
  }

  const inheritedKeys = Object.keys(inherited);
  const overriddenKeys = Object.keys(overridden);
  if (inheritedKeys.length === 0 && overriddenKeys.length === 0) return { missing: false };

  debugLog(
    'executeSpawnTask:fixRoutingLineage',
    `task ${task.id} (fixFor=${task.fixForTaskId}): inherited=${JSON.stringify(inherited)} `
    + `overridden=${JSON.stringify(overridden)}`,
  );

  try {
    const sprintId = getCurrentSprintId(projectRoot) ?? sprintFallbackId;
    writeEvent(
      projectRoot, sprintId, 'brain', '*',
      CHANNELS.METRIC_EMITTED,
      {
        name: 'fix.routing.preserved',
        value: 1,
        taskId: task.id,
        fixForTaskId: task.fixForTaskId,
        inherited,
        overridden,
      },
    );
    metric('fix.routing.preserved', 1, {
      task_id: task.id,
      fields_inherited: String(inheritedKeys.length),
      fields_overridden: String(overriddenKeys.length),
    });
  } catch (e) { debugLog('executeSpawnTask:fixRoutingLineage:emit', e); }

  return { missing: false };
}

// ─── Canonical Spawn Executor ──────────────────────────────────────────────

export interface SpawnTaskEffect {
  task: Task;
  /** Stable pre-mutation public projection digest captured by the caller. */
  existingTaskProjectionContentDigest?: string;
  /**
   * Pre-computed adaptive per-task timeout (Sprint 280 emitTimeoutEvents).
   * Computing it is an event/metric-emitting side effect intentionally kept
   * OUT of this executor for the SCHED3 slice — the wave-level caller
   * computes it and forwards the resulting seconds through so the spawn
   * call still honors it. Omitted entirely by callers that don't compute
   * it (e.g. the local queue path), matching their pre-existing behavior.
   */
  taskTimeoutSeconds?: number;
}

export interface ExactTaskProjectionAdmissionV2 {
  readonly taskIds: readonly string[];
  readonly existingContentDigests: Readonly<Record<string, string>>;
}

export interface CanonicalTaskDispatchBoundaryV2 {
  readonly taskId: string;
  readonly provider: string;
  readonly model: string;
  readonly backend: string;
  readonly executionEvidenceRef: string;
}

type ExactNormalDockerRegistryEntry =
  | Readonly<{
      state: 'prepared';
      preparationRef: ExactDockerCustodyPreparationRefV2;
      backend: SpawnBackend;
      lifecycleOwner: TaskExecutionLifecycleOwnerV2;
    }>
  | Readonly<{
      state: 'pending';
      query: ExactDockerCustodyTerminalQueryV2;
      backend: SpawnBackend;
      lifecycleOwner: TaskExecutionLifecycleOwnerV2;
    }>
  | Readonly<{
      state: 'accepted';
      query: ExactDockerCustodyTerminalQueryV2;
      accepted: ExactDockerAcceptedResultV2;
      terminal: ExactAcceptedTaskTerminalAuthorityRead | null;
      backend: SpawnBackend;
      lifecycleOwner: TaskExecutionLifecycleOwnerV2;
    }>
  | Readonly<{ state: 'legacy'; lifecycleOwner: TaskExecutionLifecycleOwnerV2 | null }>
  | Readonly<{
      state: 'not-dispatched';
      authority: TaskAttemptCustodyDispatchNotDispatchedAuthorityV2 | null;
      predecessor: ExactDockerCustodyPredecessorV2 | null;
      backend: SpawnBackend | null;
      lifecycleOwner: TaskExecutionLifecycleOwnerV2 | null;
    }>
  | Readonly<{
      state: 'hold';
      reasonCode: string;
      backend: SpawnBackend | null;
      lifecycleOwner: TaskExecutionLifecycleOwnerV2 | null;
    }>;

/**
 * Task-scoped worker lifecycle authority. A mixed-backend run must never use
 * the run default to list, reconcile, or kill a worker that another backend
 * actually owns.
 */
export type TaskExecutionLifecycleOwnerV2 = Pick<
  SpawnBackend,
  'name' | 'kill' | 'list' | 'workerInventoryState' | 'reconcilePendingAttempts'
>;

function providerAdapterLifecycleOwner(
  adapter: ProviderAdapter,
): TaskExecutionLifecycleOwnerV2 {
  return Object.freeze({
    name: adapter.name,
    kill: (taskId: string): void => adapter.kill(taskId),
    list: (): string[] => adapter.listWorkers(),
    workerInventoryState: (taskId: string): 'active' | 'absent' =>
      adapter.listWorkers().includes(taskId) ? 'active' : 'absent',
  });
}

export interface ExactNormalDockerDependencyContextV2 {
  readonly dependencyIds: readonly string[];
  readonly dependencyResults: ReadonlyMap<string, DependencyResultEntry>;
  readonly lineageAuthorities: readonly ExactAcceptedTaskResultAuthorityMetadata[];
}

/**
 * Run-scoped bridge between the asynchronous exact backend and the synchronous
 * collector authority port. It stores no paths/capabilities and cannot mint an
 * accepted result; only the backend-owned reader can populate it.
 */
export interface ExactNormalDockerExecutionRegistryV2 {
  resolveExactPredecessor(taskId: string): Readonly<
    | { state: 'none' }
    | { state: 'current'; predecessor: ExactDockerCustodyPredecessorV2 }
    | { state: 'hold'; reasonCode: string }
  >;
  admitPreparedAttempt(
    taskId: string,
    backend: SpawnBackend,
    preparationRef: ExactDockerCustodyPreparationRefV2,
  ): Readonly<{ state: 'admitted' } | { state: 'hold'; reasonCode: string }>;
  registerReleased(
    taskId: string,
    backend: SpawnBackend,
    query: ExactDockerCustodyTerminalQueryV2,
  ): void;
  registerNotDispatched(
    taskId: string,
    backend?: SpawnBackend,
    custodyRef?: ExactDockerCustodyIdentityRefV2,
    zeroWorkReceipt?: Readonly<{ readonly ref: `sha256:${string}`; readonly digest: `sha256:${string}` }>,
  ): void;
  registerHold(
    taskId: string,
    reasonCode: string,
    backend?: SpawnBackend,
  ): void;
  registerLegacy(
    taskId: string,
    lifecycleOwner?: TaskExecutionLifecycleOwnerV2,
  ): boolean;
  isExactTask(taskId: string): boolean;
  resolveLifecycleOwner(taskId: string): TaskExecutionLifecycleOwnerV2 | undefined;
  readonly settleExactAcceptedResult: SettleExactAcceptedResult;
  readonly revalidateExactAcceptedResultTerminalAuthority:
    RevalidateExactAcceptedResultTerminalAuthority;
  readExactTerminalAuthority(taskId: string): ExactAcceptedTaskTerminalAuthorityRead;
  snapshotExactTerminalAuthorities(): ReadonlyMap<string, ExactAcceptedTaskTerminalAuthorityRead>;
  rehydrateRecovery(report: SpawnBackendRecoveryReport, backend: SpawnBackend): void;
  reconcileExactLifecycle(
    mode: 'resume' | 'contain',
  ): Promise<readonly SpawnBackendRecoveryReport[]>;
  readTaskResultAuthority(taskId: string): TaskResultAuthorityRead<TaskResult>;
  awaitTaskResultAuthority(taskId: string): Promise<TaskResultAuthorityRead<TaskResult>>;
  dependencyContext(task: Task): ExactNormalDockerDependencyContextV2 | null;
}

function exactAcceptedAuthority(
  query: ExactDockerCustodyTerminalQueryV2,
  accepted: ExactDockerAcceptedResultV2,
): ExactAcceptedTaskResultAuthorityMetadata {
  return Object.freeze({
    executionMode: 'normal-docker' as const,
    identity: query.custodyRef.identity,
    admissionReceiptDigest: query.custodyRef.admissionReceiptDigest,
    acceptedResultRef: accepted.acceptedResultRef,
    acceptedResultChainDigest: accepted.acceptedResultChainDigest,
    resultDigest: accepted.resultDigest,
  });
}

export function createExactNormalDockerExecutionRegistry(
  projectRoot: string,
): ExactNormalDockerExecutionRegistryV2 {
  const entries = new Map<string, ExactNormalDockerRegistryEntry>();
  const terminalWaits = new Map<string, Promise<void>>();
  /** One project-wide adoption scan per backend kind, regardless of task-local instances. */
  const recoveryOwners = new Map<string, SpawnBackend>();
  const preparedMatchesIdentity = (
    preparationRef: ExactDockerCustodyPreparationRefV2,
    custodyRef: ExactDockerCustodyIdentityRefV2,
  ): boolean => JSON.stringify(preparationRef.privateIdentity) === JSON.stringify(custodyRef.identity)
    && preparationRef.dispatchRequestId === custodyRef.dispatchRequestId
    && preparationRef.admissionReceiptDigest === custodyRef.admissionReceiptDigest
    && preparationRef.admissionRefDigest === custodyRef.admissionRefDigest;
  const predecessorFromNotDispatched = (
    authority: TaskAttemptCustodyDispatchNotDispatchedAuthorityV2,
  ): ExactDockerCustodyPredecessorV2 | null => {
    const admissionRef = authority?.admissionRef;
    const identity = admissionRef?.identity;
    const noEffectEvidence = authority?.noEffectEvidence;
    const isDigest = (value: unknown): value is `sha256:${string}` => typeof value === 'string'
      && /^sha256:[a-f0-9]{64}$/.test(value);
    if (authority?.state !== 'NOT_DISPATCHED'
      || !admissionRef
      || !identity
      || !noEffectEvidence
      || typeof admissionRef.dispatchRequestId !== 'string'
      || !isDigest(admissionRef.admissionReceiptDigest)
      || !isDigest(admissionRef.refDigest)
      || !isDigest(authority.receiptDigest)
      || !isDigest(noEffectEvidence.evidenceDigest)
      || identity.schemaVersion !== 2
      || identity.backend !== 'docker'
      || typeof identity.projectRootSha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(identity.projectRootSha256)
      || typeof identity.projectId !== 'string'
      || identity.projectId.length === 0
      || typeof identity.taskId !== 'string'
      || identity.taskId.length === 0
      || typeof identity.attemptId !== 'string'
      || identity.attemptId.length === 0
      || !Number.isSafeInteger(identity.generation)
      || identity.generation < 1) return null;
    return Object.freeze({
      dispatchRequestId: admissionRef.dispatchRequestId,
      identity,
      admissionReceiptDigest: admissionRef.admissionReceiptDigest,
      admissionRefDigest: admissionRef.refDigest,
      zeroWorkReceipt: Object.freeze({
        ref: authority.receiptDigest,
        digest: noEffectEvidence.evidenceDigest,
      }),
    });
  };
  const readTaskResultAuthority = (
    taskId: string,
  ): TaskResultAuthorityRead<TaskResult> => {
    const rawResultPath = join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
    const entry = entries.get(taskId);
    if (!entry || entry.state === 'pending' || entry.state === 'prepared') {
      return { state: 'pending-settlement', result: null, settlementRef: null, rawResultPath };
    }
    if (entry.state === 'legacy') {
      return readAuthoritativeTaskResult<TaskResult>(projectRoot, taskId);
    }
    if (entry.state === 'not-dispatched') {
      return {
        state: 'not-dispatched',
        result: null,
        settlementRef: null,
        rawResultPath,
        attemptCount: 0,
      };
    }
    if (entry.state === 'hold') {
      return {
        state: 'authority-hold',
        result: null,
        settlementRef: null,
        rawResultPath,
        holdReason: entry.reasonCode,
      };
    }
    const acceptedAuthority = exactAcceptedAuthority(entry.query, entry.accepted);
    return {
      state: 'exact-accepted',
      result: projectExactAcceptedTaskResult(entry.accepted.result, acceptedAuthority),
      settlementRef: null,
      rawResultPath,
      exactAcceptedAuthority: acceptedAuthority,
    };
  };
  const readExactTerminalAuthority = (
    taskId: string,
  ): ExactAcceptedTaskTerminalAuthorityRead => {
    const entry = entries.get(taskId);
    if (!entry) return Object.freeze({
      state: 'hold' as const,
      reasonCode: 'exact-registry-entry-unavailable',
    });
    if (entry.state === 'hold') return Object.freeze({
      state: 'hold' as const,
      reasonCode: entry.reasonCode,
    });
    if (entry.state === 'pending' || entry.state === 'prepared') return Object.freeze({
      state: 'hold' as const,
      reasonCode: 'exact-terminal-pending',
    });
    if (entry.state === 'not-dispatched') return Object.freeze({
      state: 'hold' as const,
      reasonCode: 'exact-not-dispatched',
    });
    if (entry.state === 'legacy') return Object.freeze({
      state: 'hold' as const,
      reasonCode: 'legacy-task-has-no-exact-terminal',
    });
    if (entry.terminal?.state !== 'current') return entry.terminal ?? Object.freeze({
      state: 'hold' as const,
      reasonCode: 'exact-terminal-awaiting-settlement',
    });
    if (!entry.backend.readExactDockerAcceptedTaskTerminalAuthority) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'exact-terminal-port-unavailable' });
    }
    const current = entry.backend.readExactDockerAcceptedTaskTerminalAuthority({
      reader: entry.accepted.reader,
      expectedAcceptedAuthority: exactAcceptedAuthority(entry.query, entry.accepted),
      expectedTerminalAuthority: entry.terminal.terminalAuthority,
    });
    entries.set(taskId, Object.freeze({ ...entry, terminal: current }));
    return current;
  };
  const settleExactAcceptedResult: SettleExactAcceptedResult = async ({ acceptedAuthority }) => {
    const entry = entries.get(acceptedAuthority.identity.taskId);
    if (!entry || entry.state !== 'accepted'
      || JSON.stringify(exactAcceptedAuthority(entry.query, entry.accepted))
        !== JSON.stringify(acceptedAuthority)) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'accepted-registry-mismatch' });
    }
    if (!entry.backend.settleExactDockerAcceptedResult
      || !entry.backend.readExactDockerAcceptedTaskTerminalAuthority) {
      return Object.freeze({ state: 'hold' as const, reasonCode: 'exact-settlement-port-unavailable' });
    }
    const settled = await entry.backend.settleExactDockerAcceptedResult(
      entry.accepted.reader,
      acceptedAuthority,
    );
    if (settled.state !== 'settled') return settled;
    const current = entry.backend.readExactDockerAcceptedTaskTerminalAuthority({
      reader: entry.accepted.reader,
      expectedAcceptedAuthority: acceptedAuthority,
      expectedTerminalAuthority: settled.authority,
    });
    entries.set(acceptedAuthority.identity.taskId, Object.freeze({ ...entry, terminal: current }));
    return current.state === 'current'
      ? settled
      : Object.freeze({ state: 'hold' as const, reasonCode: current.reasonCode });
  };
  const revalidateExactAcceptedResultTerminalAuthority:
    RevalidateExactAcceptedResultTerminalAuthority = async ({
      taskId,
      expectedAcceptedAuthority,
      expectedTerminalAuthority,
    }) => {
      const entry = entries.get(taskId);
      if (!entry || entry.state !== 'accepted'
        || JSON.stringify(exactAcceptedAuthority(entry.query, entry.accepted))
          !== JSON.stringify(expectedAcceptedAuthority)
        || !entry.backend.readExactDockerAcceptedTaskTerminalAuthority) {
        return Object.freeze({ state: 'hold' as const, reasonCode: 'terminal-registry-mismatch' });
      }
      const current = entry.backend.readExactDockerAcceptedTaskTerminalAuthority({
        reader: entry.accepted.reader,
        expectedAcceptedAuthority,
        expectedTerminalAuthority,
      });
      entries.set(taskId, Object.freeze({ ...entry, terminal: current }));
      return current.state === 'current'
        ? Object.freeze({ state: 'current' as const, terminalAuthority: current.terminalAuthority })
        : current;
    };
  return Object.freeze({
    resolveExactPredecessor(taskId: string) {
      const entry = entries.get(taskId);
      if (!entry || entry.state === 'legacy') {
        return Object.freeze({ state: 'none' as const });
      }
      if (entry.state === 'not-dispatched') {
        return entry.predecessor
          ? Object.freeze({ state: 'current' as const, predecessor: entry.predecessor })
          : Object.freeze({
              state: 'hold' as const,
              reasonCode: 'EXACT_NOT_DISPATCHED_PREDECESSOR_UNAVAILABLE',
            });
      }
      return Object.freeze({
        state: 'hold' as const,
        reasonCode: entry.state === 'hold'
          ? entry.reasonCode
          : 'EXACT_ATTEMPT_ALREADY_ACTIVE_OR_TERMINAL',
      });
    },
    admitPreparedAttempt(
      taskId: string,
      backend: SpawnBackend,
      preparationRef: ExactDockerCustodyPreparationRefV2,
    ) {
      if (preparationRef.privateIdentity.taskId !== taskId) {
        return Object.freeze({
          state: 'hold' as const,
          reasonCode: 'EXACT_PREPARED_IDENTITY_MISMATCH',
        });
      }
      const current = entries.get(taskId);
      if (current?.state === 'prepared') {
        return current.backend === backend
          && JSON.stringify(current.preparationRef) === JSON.stringify(preparationRef)
          ? Object.freeze({ state: 'admitted' as const })
          : Object.freeze({
              state: 'hold' as const,
              reasonCode: 'EXACT_PREPARED_REPLAY_MISMATCH',
            });
      }
      if (current?.state === 'not-dispatched') {
        const predecessor = current.predecessor;
        const next = preparationRef.privateIdentity;
        if (!predecessor
          || next.backend !== predecessor.identity.backend
          || next.projectRootSha256 !== predecessor.identity.projectRootSha256
          || next.projectId !== predecessor.identity.projectId
          || next.taskId !== predecessor.identity.taskId
          || next.attemptId !== predecessor.identity.attemptId
          || next.generation !== predecessor.identity.generation + 1
          || preparationRef.admissionReceiptDigest === predecessor.admissionReceiptDigest
          || preparationRef.admissionRefDigest === predecessor.admissionRefDigest) {
          return Object.freeze({
            state: 'hold' as const,
            reasonCode: 'EXACT_REDISPATCH_GENERATION_MISMATCH',
          });
        }
      } else if (current) {
        return Object.freeze({
          state: 'hold' as const,
          reasonCode: 'EXACT_ATTEMPT_ALREADY_ACTIVE_OR_TERMINAL',
        });
      } else if (preparationRef.privateIdentity.generation !== 1) {
        return Object.freeze({
          state: 'hold' as const,
          reasonCode: 'EXACT_INITIAL_GENERATION_MISMATCH',
        });
      }
      if (!recoveryOwners.has(backend.name)) recoveryOwners.set(backend.name, backend);
      entries.set(taskId, Object.freeze({
        state: 'prepared' as const,
        preparationRef,
        backend,
        lifecycleOwner: backend,
      }));
      return Object.freeze({ state: 'admitted' as const });
    },
    registerReleased(
      taskId: string,
      backend: SpawnBackend,
      query: ExactDockerCustodyTerminalQueryV2,
    ): void {
      if (!recoveryOwners.has(backend.name)) recoveryOwners.set(backend.name, backend);
      if (!backend.awaitExactDockerAcceptedResult) {
        entries.set(taskId, Object.freeze({
          state: 'hold',
          reasonCode: 'EXACT_ACCEPTED_RESULT_PORT_UNAVAILABLE',
          backend,
          lifecycleOwner: backend,
        }));
        return;
      }
      const current = entries.get(taskId);
      if (current) {
        const preparedRelease = current.state === 'prepared'
          && current.backend === backend
          && preparedMatchesIdentity(current.preparationRef, query.custodyRef);
        const samePending = current.state === 'pending'
          && current.backend === backend
          && JSON.stringify(current.query) === JSON.stringify(query);
        if (samePending) return;
        if (preparedRelease) entries.delete(taskId);
        else {
          entries.set(taskId, Object.freeze({
            state: 'hold',
            reasonCode: 'EXACT_DISPATCH_REGISTRY_REPLAY_MISMATCH',
            backend: backend ?? null,
            lifecycleOwner: backend ?? null,
          }));
          return;
        }
      }
      entries.set(taskId, Object.freeze({
        state: 'pending',
        query,
        backend,
        lifecycleOwner: backend,
      }));
      const terminalWait = backend.awaitExactDockerAcceptedResult(query).then(outcome => {
        const registered = entries.get(taskId);
        if (!registered || registered.state !== 'pending'
          || registered.backend !== backend
          || JSON.stringify(registered.query) !== JSON.stringify(query)) return;
        if (outcome.kind === 'accepted-result') {
          entries.set(taskId, Object.freeze({
            state: 'accepted',
            query,
            accepted: outcome,
            terminal: null,
            backend,
            lifecycleOwner: backend,
          }));
          return;
        }
        entries.set(taskId, Object.freeze({
          state: 'hold',
          reasonCode: outcome.reasonCode,
          backend,
          lifecycleOwner: backend,
        }));
      }).catch((error: unknown) => {
        debugLog('exact-normal-docker-registry:acceptance', error);
        const registered = entries.get(taskId);
        if (!registered || registered.state !== 'pending'
          || registered.backend !== backend
          || JSON.stringify(registered.query) !== JSON.stringify(query)) return;
        entries.set(taskId, Object.freeze({
          state: 'hold',
          reasonCode: 'EXACT_ACCEPTANCE_FAILED',
          backend,
          lifecycleOwner: backend,
        }));
      });
      terminalWaits.set(taskId, terminalWait);
    },
    registerNotDispatched(
      taskId: string,
      backend?: SpawnBackend,
      custodyRef?: ExactDockerCustodyIdentityRefV2,
      zeroWorkReceipt?: Readonly<{
        readonly ref: `sha256:${string}`;
        readonly digest: `sha256:${string}`;
      }>,
    ): void {
      const current = entries.get(taskId);
      const exactTerminal = backend && custodyRef && zeroWorkReceipt
        ? Object.freeze({ ...custodyRef, zeroWorkReceipt })
        : null;
      if (current && exactTerminal) {
        const validPrepared = current.state === 'prepared'
          && current.backend === backend
          && preparedMatchesIdentity(current.preparationRef, custodyRef!);
        if (!validPrepared) {
          const sameTerminal = current.state === 'not-dispatched'
            && JSON.stringify(current.predecessor) === JSON.stringify(exactTerminal);
          if (sameTerminal) return;
          entries.set(taskId, Object.freeze({
            state: 'hold',
            reasonCode: 'EXACT_NOT_DISPATCHED_REGISTRY_REPLAY_MISMATCH',
            backend: backend ?? null,
            lifecycleOwner: backend ?? null,
          }));
          return;
        }
      } else if (current) {
        const sameTerminal = current.state === 'not-dispatched'
          && current.backend === (backend ?? null)
          && current.predecessor === null;
        if (sameTerminal) return;
        entries.set(taskId, Object.freeze({
          state: 'hold',
          reasonCode: 'EXACT_NOT_DISPATCHED_REGISTRY_REPLAY_MISMATCH',
          backend: backend ?? ('backend' in current ? current.backend : null),
          lifecycleOwner: backend ?? ('lifecycleOwner' in current
            ? current.lifecycleOwner : null),
        }));
        return;
      }
      if (backend && !recoveryOwners.has(backend.name)) {
        recoveryOwners.set(backend.name, backend);
      }
      entries.set(taskId, Object.freeze({
        state: 'not-dispatched',
        authority: null,
        predecessor: exactTerminal,
        backend: backend ?? null,
        lifecycleOwner: backend ?? null,
      }));
    },
    registerHold(
      taskId: string,
      reasonCode: string,
      backend?: SpawnBackend,
    ): void {
      const current = entries.get(taskId);
      const currentOwner = current && 'lifecycleOwner' in current
        ? current.lifecycleOwner
        : null;
      entries.set(taskId, Object.freeze({
        state: 'hold',
        reasonCode,
        backend: backend ?? (current && 'backend' in current ? current.backend : null),
        lifecycleOwner: backend ?? currentOwner,
      }));
    },
    registerLegacy(
      taskId: string,
      lifecycleOwner?: TaskExecutionLifecycleOwnerV2,
    ): boolean {
      const current = entries.get(taskId);
      if (current && current.state !== 'legacy') {
        entries.set(taskId, Object.freeze({
          state: 'hold',
          reasonCode: 'EXECUTION_MODE_AUTHORITY_CHANGED',
          backend: current && 'backend' in current ? current.backend : null,
          lifecycleOwner: 'lifecycleOwner' in current
            ? current.lifecycleOwner
            : lifecycleOwner ?? null,
        }));
        return false;
      }
      entries.set(taskId, Object.freeze({
        state: 'legacy',
        lifecycleOwner: lifecycleOwner ?? current?.lifecycleOwner ?? null,
      }));
      return true;
    },
    isExactTask(taskId: string): boolean {
      const entry = entries.get(taskId);
      return entry !== undefined && entry.state !== 'legacy';
    },
    resolveLifecycleOwner(taskId: string): TaskExecutionLifecycleOwnerV2 | undefined {
      const entry = entries.get(taskId);
      if (!entry || !('lifecycleOwner' in entry)) return undefined;
      return entry.lifecycleOwner ?? undefined;
    },
    settleExactAcceptedResult,
    revalidateExactAcceptedResultTerminalAuthority,
    readExactTerminalAuthority,
    snapshotExactTerminalAuthorities(): ReadonlyMap<string, ExactAcceptedTaskTerminalAuthorityRead> {
      const snapshot = new Map<string, ExactAcceptedTaskTerminalAuthorityRead>();
      for (const [taskId, entry] of entries) {
        if (entry.state === 'legacy') continue;
        snapshot.set(taskId, readExactTerminalAuthority(taskId));
      }
      return snapshot;
    },
    rehydrateRecovery(report: SpawnBackendRecoveryReport, backend: SpawnBackend): void {
      if (!recoveryOwners.has(backend.name)) recoveryOwners.set(backend.name, backend);
      for (const recovered of report.exactEntries ?? []) {
        if (recovered.kind === 'not-dispatched') {
          const predecessor = predecessorFromNotDispatched(recovered.authority);
          if (!predecessor || recovered.taskId !== predecessor.identity.taskId) {
            this.registerHold(recovered.taskId, 'EXACT_RECOVERY_NOT_DISPATCHED_MISMATCH', backend);
            continue;
          }
          const current = entries.get(recovered.taskId);
          if (current && (current.state !== 'not-dispatched'
            || (current.authority !== null
              && JSON.stringify(current.authority) !== JSON.stringify(recovered.authority)))) {
            this.registerHold(recovered.taskId, 'EXACT_RECOVERY_REGISTRY_CONFLICT', backend);
            continue;
          }
          entries.set(recovered.taskId, Object.freeze({
            state: 'not-dispatched' as const,
            authority: recovered.authority,
            predecessor,
            backend,
            lifecycleOwner: backend,
          }));
          continue;
        }
        if (recovered.kind === 'released') {
          const current = entries.get(recovered.taskId);
          if (current) {
            if (current.state !== 'pending'
              || JSON.stringify(current.query) !== JSON.stringify(recovered.query)) {
              this.registerHold(recovered.taskId, 'EXACT_RECOVERY_REGISTRY_CONFLICT', backend);
              continue;
            }
            entries.delete(recovered.taskId);
          }
          this.registerReleased(recovered.taskId, backend, recovered.query);
          continue;
        }
        const reread = backend.readExactDockerAcceptedResult?.(recovered.accepted.reader);
        if (!reread || JSON.stringify(reread) !== JSON.stringify(recovered.accepted)) {
          this.registerHold(recovered.taskId, 'EXACT_RECOVERY_ACCEPTED_REPLAY_MISMATCH', backend);
          continue;
        }
        const current = entries.get(recovered.taskId);
        if (current && (current.state !== 'accepted'
          || JSON.stringify(current.query) !== JSON.stringify(recovered.query)
          || JSON.stringify(exactAcceptedAuthority(current.query, current.accepted))
            !== JSON.stringify(exactAcceptedAuthority(recovered.query, recovered.accepted)))) {
          this.registerHold(recovered.taskId, 'EXACT_RECOVERY_REGISTRY_CONFLICT', backend);
          continue;
        }
        let terminal = current?.state === 'accepted' ? current.terminal : null;
        if (terminal?.state === 'current') {
          if (!backend.readExactDockerAcceptedTaskTerminalAuthority) {
            this.registerHold(
              recovered.taskId,
              'EXACT_RECOVERY_TERMINAL_REVALIDATION_UNAVAILABLE',
              backend,
            );
            continue;
          }
          terminal = backend.readExactDockerAcceptedTaskTerminalAuthority({
            reader: recovered.accepted.reader,
            expectedAcceptedAuthority: exactAcceptedAuthority(
              recovered.query,
              recovered.accepted,
            ),
            expectedTerminalAuthority: terminal.terminalAuthority,
          });
        }
        entries.set(recovered.taskId, Object.freeze({
          state: 'accepted' as const,
          query: recovered.query,
          accepted: recovered.accepted,
          terminal,
          backend,
          lifecycleOwner: backend,
        }));
      }
    },
    async reconcileExactLifecycle(
      mode: 'resume' | 'contain',
    ): Promise<readonly SpawnBackendRecoveryReport[]> {
      const backends = new Map<string, SpawnBackend>(recoveryOwners);
      for (const entry of entries.values()) {
        if ('backend' in entry && entry.backend && !backends.has(entry.backend.name)) {
          backends.set(entry.backend.name, entry.backend);
        }
      }
      const reports: SpawnBackendRecoveryReport[] = [];
      for (const backend of backends.values()) {
        if (!backend.reconcilePendingAttempts) {
          for (const [taskId, entry] of entries) {
            if ('backend' in entry && entry.backend === backend) {
              this.registerHold(taskId, 'EXACT_LIFECYCLE_RECONCILIATION_UNAVAILABLE', backend);
            }
          }
          throw new DeckentError('DECKENT_E091', 'EXACT_LIFECYCLE_RECONCILIATION_UNAVAILABLE');
        }
        const report = await backend.reconcilePendingAttempts({ mode });
        reports.push(report);
        this.rehydrateRecovery(report, backend);
        for (const hold of report.held ?? []) {
          this.registerHold(hold.taskId, hold.reasonCode, backend);
        }
        if ((report.held?.length ?? 0) > 0) {
          throw new DeckentError('DECKENT_E091', `EXACT_LIFECYCLE_${mode.toUpperCase()}_HOLD`);
        }
        if (mode === 'contain') {
          for (const [taskId, entry] of entries) {
            if (!('backend' in entry) || entry.backend !== backend) continue;
            const inventory = backend.workerInventoryState?.(taskId) ?? 'unknown';
            if (inventory !== 'absent') {
              this.registerHold(taskId, 'EXACT_CONTAINMENT_INCOMPLETE', backend);
              throw new DeckentError('DECKENT_E091', 'EXACT_CONTAINMENT_INCOMPLETE');
            }
          }
        }
      }
      return Object.freeze(reports);
    },
    readTaskResultAuthority,
    async awaitTaskResultAuthority(taskId: string): Promise<TaskResultAuthorityRead<TaskResult>> {
      await terminalWaits.get(taskId);
      return readTaskResultAuthority(taskId);
    },
    dependencyContext(task: Task): ExactNormalDockerDependencyContextV2 | null {
      const dependencyIds = [...new Set(
        (task.dependencies ?? []).filter((value): value is string => typeof value === 'string'),
      )];
      const dependencyResults = new Map<string, DependencyResultEntry>();
      const lineageAuthorities: ExactAcceptedTaskResultAuthorityMetadata[] = [];
      for (const dependencyId of dependencyIds) {
        const entry = entries.get(dependencyId);
        const terminal = readExactTerminalAuthority(dependencyId);
        if (!entry || entry.state !== 'accepted' || terminal.state !== 'current') return null;
        dependencyResults.set(dependencyId, {
          verdict: terminal.evaluationReceipt.verdict,
          filesChanged: entry.accepted.result.filesChanged.map(change => change.path),
          linesAdded: entry.accepted.result.totalLinesAdded,
          linesRemoved: entry.accepted.result.totalLinesRemoved,
          notes: entry.accepted.result.notes,
        });
        lineageAuthorities.push(exactAcceptedAuthority(entry.query, entry.accepted));
      }
      return Object.freeze({
        dependencyIds: Object.freeze(dependencyIds),
        dependencyResults,
        lineageAuthorities: Object.freeze(lineageAuthorities),
      });
    },
  }) as ExactNormalDockerExecutionRegistryV2;
}

export interface SpawnTaskDeps {
  projectRoot: string;
  /** Sprint id fallback for getCurrentSprintId() misses. */
  sprintFallbackId: string;
  /** Optional — legacy/test callers may omit config entirely (see result-collector.ts). */
  config: ResolvedConfig | undefined;
  spawnOpts?: {
    autoApprove?: boolean;
    spawnBackend?: SpawnBackend;
    attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
    providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  };
  /** Base backend for this call (e.g. the wave's configured backend, or the queue's spawnOpts.spawnBackend). */
  backend?: SpawnBackend;
  /** Optional one-shot ingress routing, executed after provider admission. */
  routeTask?: (task: Task) => void | Promise<void>;
  resolveAgentPrompt: (projectRoot: string, task: Task) => Promise<string | undefined>;
  resolveSkillPrompts: (projectRoot: string, task: Task) => Promise<Array<{ name: string; content: string }>>;
  /** Caller-specific write-target/allowedTools scope builder (each existing caller keeps its own). */
  buildWriteTargets: (task: Task) => string[];
  /** Live sprint authority used by every trigger for last-moment write collision admission. */
  collisionAuthority?: {
    tasks: readonly Task[];
    collectedIds: ReadonlySet<string>;
  };
  /** Present only for the normal-Docker exact producer cutover. */
  exactDockerRegistry?: ExactNormalDockerExecutionRegistryV2;
  /** Exact-plan public projection state observed before RUN_STARTED. */
  exactTaskProjectionAdmission?: ExactTaskProjectionAdmissionV2;
  /**
   * Process-local uncertainty fence immediately before the backend dispatch
   * call. It is not a durable "started" receipt: callers use it only to avoid
   * falsely settling an unexpected post-boundary throw as zero work.
   */
  onDispatchAttemptBoundary?: (input: Readonly<{
    taskId: string;
    backend: string;
  }>) => void;
  /**
   * Durable started hook at the backend's truthful boundary: immediately
   * before a legacy spawn primitive, or after exact RELEASED + provider-start
   * acceptance. Zero-work exact outcomes never call it.
   */
  onDispatchBoundary?: (boundary: CanonicalTaskDispatchBoundaryV2) => void | Promise<void>;
}

export type SpawnExecutionMode = 'normal-docker-exact' | 'legacy-non-docker';

interface SpawnDispositionExecutionIdentity {
  /** Execution truth resolved at the point this disposition was produced. */
  readonly executionMode: SpawnExecutionMode;
  readonly executionBackend: string;
}

export type SpawnDisposition = SpawnDispositionExecutionIdentity & (
  | {
      kind: 'spawned';
      taskId: string;
      provider?: string;
      legacySettlementRef?: TaskResultSettlementRefV1;
      exactDispatchOutcome?: Extract<ExactDockerCustodyDispatchOutcomeV2, { kind: 'released' }>;
    }
  | {
      kind: 'not-dispatched';
      taskId: string;
      reasonCode: string;
      exactDispatchOutcome?: Extract<ExactDockerCustodyDispatchOutcomeV2, { kind: 'not-dispatched' }>;
    }
  | {
      kind: 'ambiguous';
      taskId: string;
      reasonCode: string;
      exactDispatchOutcome?: Extract<ExactDockerCustodyDispatchOutcomeV2, { kind: 'ambiguous' }>;
    }
  | { kind: 'exact-dependency-authority-hold'; taskId: string }
  | { kind: 'routing-lineage-missing'; taskId: string; fixForTaskId: string; detail: string }
  | { kind: 'provider-unavailable'; taskId: string; provider: string }
  | { kind: 'collision-held'; taskId: string; blockerTaskIds: readonly string[] }
  | { kind: 'no-mint'; taskId: string; fixForTaskId: string; reasonCode: string }
);

// ─── Typed Spawn-Skip Observability (row 3309) ─────────────────────────────
//
// Measured gap: sprint-507's `507-002-fix` sat Queued while 92 consecutive
// watcher passes journaled an empty `spawnedTaskIds` — no heartbeat, no pid,
// no log, and nothing anywhere saying WHY. Every skip site on the way from
// "queued FIX task" to "spawned worker" ended in a bare `continue`/`return []`
// plus at most a `debugLog` (off by default), so a stuck queue was undiagnosable
// from disk.
//
// This block makes a skip VISIBLE; it never makes it different. No admission
// predicate is touched — a task admission legitimately refuses still is not
// spawned, it just says so in the journal now.
//
// File family: the EXISTING scheduler-shadow journal
// (`.deckent/runtime/scheduler-shadow/<sprintId>.jsonl`, path owned by
// scheduler-journal.ts). The record is additive and discriminated by
// `recordKind: 'spawn-skip'`; tick records written by
// `appendSchedulerShadowRecord` carry no `recordKind` at all, so a reader
// dual-reads exactly the way `SchedulerShadowRecord.executedEngine` already
// requires — a missing discriminator means "tick record", never an inferred
// skip. Fail-soft, same contract as the journal module it shares a file with:
// a write fault must NEVER affect scheduling.

export type SchedulerSpawnSkipReasonCode =
  /** `dependency_pipeline_enabled` is off, so the respawn pass returns before looking at the queue. */
  | 'dependency-pipeline-disabled'
  /** At least one dependency is not satisfying yet (single-truth scheduler state). */
  | 'dependency-unsatisfied'
  /** Deferred as the loser of a plan-time scope-collision serialization, or by the RBAC gate. */
  | 'scope-collision-blocked'
  /** Eligible and unblocked, but every worker slot is occupied this pass. */
  | 'worker-slot-exhausted'
  /** The idempotency guard already holds this id (a spawn is in flight for it). */
  | 'already-assigned'
  /** Held behind a live writer of an overlapping `scope.filesWrite` path. */
  | 'collision-held'
  /** Host-only provider with no registered adapter — host wrote a pre-dispatch NO_GO. */
  | 'provider-unavailable'
  /** Fix-task routing lineage could not be read, so the spawn was refused. */
  | 'routing-lineage-missing'
  /** The spawn attempt threw; the id was rolled back out of the assigned set. */
  | 'spawn-threw'
  /** A deterministic pre-dispatch admission failure was durably settled; no retry is valid. */
  | 'spawn-admission-settled'
  /** Exact backend could not prove whether provider work started. */
  | 'exact-dispatch-ambiguous'
  /** Dependency status exists but its exact accepted/terminal authority is absent. */
  | 'exact-dependency-authority-hold'
  | 'repair-no-mint'
  | 'spawn-retry-backoff'
  | 'spawn-retry-held'
  /** A SpawnTask effect named an id the live task map does not contain. */
  | 'task-not-found'
  /** Returned in a wave's overflow queue and never handed to a later dispatcher. */
  | 'queued-not-dispatched';

/** Which scheduler pass observed the skip. */
export type SchedulerSpawnPass = 'initial-wave' | 'fix-wave' | 'respawn-wave' | 'reducer-tick';

export interface SchedulerSpawnSkip {
  readonly taskId: string;
  readonly reasonCode: SchedulerSpawnSkipReasonCode;
  /** Human-readable specifics (which dependency, which blocker, how many slots). */
  readonly detail: string;
  /** Row 3309 is a FIX-task story — carried so a stuck fix is greppable on its own. */
  readonly isPriorityFix: boolean;
}

export interface SchedulerSpawnSkipRecord {
  readonly recordKind: 'spawn-skip';
  readonly ts: string;
  readonly pass: SchedulerSpawnPass;
  /** What the same pass DID spawn — an empty array next to a populated `skips` is the honest "why nothing spawned". */
  readonly spawnedTaskIds: readonly string[];
  readonly skips: readonly SchedulerSpawnSkip[];
}

export function describeSpawnSkip(
  task: Pick<Task, 'id' | 'isPriorityFix'>,
  reasonCode: SchedulerSpawnSkipReasonCode,
  detail: string,
): SchedulerSpawnSkip {
  return { taskId: task.id, reasonCode, detail, isPriorityFix: task.isPriorityFix === true };
}

/** Map a non-'spawned' disposition onto its typed skip. Returns null for a real spawn. */
export function spawnSkipFromDisposition(
  disposition: SpawnDisposition,
  task: Pick<Task, 'id' | 'isPriorityFix'>,
): SchedulerSpawnSkip | null {
  switch (disposition.kind) {
    case 'spawned':
      return null;
    case 'collision-held':
      return describeSpawnSkip(
        task,
        'collision-held',
        `held behind active writer(s) of an overlapping write scope: ${disposition.blockerTaskIds.join(', ')}`,
      );
    case 'provider-unavailable':
      return describeSpawnSkip(
        task,
        'provider-unavailable',
        `provider "${disposition.provider}" has no registered host adapter; the host wrote a pre-dispatch NO_GO instead of degrading the spawn`,
      );
    case 'routing-lineage-missing':
      return describeSpawnSkip(task, 'routing-lineage-missing', disposition.detail);
    case 'not-dispatched':
      return describeSpawnSkip(
        task,
        'spawn-admission-settled',
        `exact backend settled zero provider work: ${disposition.reasonCode}`,
      );
    case 'ambiguous':
      return describeSpawnSkip(
        task,
        'exact-dispatch-ambiguous',
        `exact backend could not prove dispatch state: ${disposition.reasonCode}`,
      );
    case 'exact-dependency-authority-hold':
      return describeSpawnSkip(
        task,
        'exact-dependency-authority-hold',
        'dependency status exists without exact accepted-result plus terminal-decision authority',
      );
    case 'no-mint':
      return describeSpawnSkip(task, 'repair-no-mint', `canonical failure disposition ${disposition.reasonCode} forbids repair`);
  }
}

function resolveRepairDispatchDisposition(
  projectRoot: string,
  task: Task,
  config: FailureDispositionPolicyConfig | undefined,
): { fixEligible: boolean; reasonCode?: string } {
  if (!task.fixForTaskId) return { fixEligible: true };
  try {
    const raw = JSON.parse(readFileSync(
      join(projectRoot, TASKS_DIR, `task-${task.fixForTaskId}.result`),
      'utf-8',
    )) as unknown;
    const result = normalizeTaskResultShape(raw as TaskResult);
    const settlement = result?.preDispatchSettlement;
    if (!settlement) return { fixEligible: true };
    const reasonCode = isHostPreDispatchReasonCode(settlement.reasonCode)
      ? settlement.reasonCode
      : 'LEGACY_HOST_PRE_DISPATCH_REJECTION';
    return {
      fixEligible: resolveHostPreDispatchFailureDisposition(reasonCode, config).fixEligible,
      reasonCode,
    };
  } catch {
    return { fixEligible: true };
  }
}

/**
 * Consecutive-identical-suppression, keyed by `${sprintId}|${pass}`. A genuinely
 * stuck queue is re-observed on every completion tick; row 3309's own evidence
 * was 92 passes in five minutes, so journaling each one verbatim would trade an
 * invisible stall for an unreadable one. The FIRST pass that hits a given skip
 * signature is always written — the diagnosis is present on disk — and the
 * repeats are suppressed until the signature changes. Mirrors the
 * `lastCollisionSignature` debounce in sprint-spawner.ts.
 */
const lastSpawnSkipSignatures = new Map<string, string>();

/** Test seam — mirrors `resetCollisionDebounce` in sprint-spawner.ts. */
export function resetSchedulerSpawnSkipDebounce(): void {
  lastSpawnSkipSignatures.clear();
}

/**
 * Append one typed spawn-skip record to this sprint's scheduler journal.
 * No-op when the pass skipped nothing, or when this exact signature was the
 * previous one published for the same sprint+pass.
 *
 * @returns the record that was published, or null when nothing was published.
 */
export function publishSchedulerSpawnSkips(
  projectRoot: string,
  sprintId: string,
  pass: SchedulerSpawnPass,
  spawnedTaskIds: readonly string[],
  skips: readonly SchedulerSpawnSkip[],
): SchedulerSpawnSkipRecord | null {
  if (skips.length === 0) return null;

  const signature = [...skips]
    .map(skip => `${skip.taskId}:${skip.reasonCode}`)
    .sort()
    .join(';') + '|' + [...spawnedTaskIds].sort().join(',');
  const key = `${sprintId}|${pass}`;
  if (lastSpawnSkipSignatures.get(key) === signature) return null;
  lastSpawnSkipSignatures.set(key, signature);

  const record: SchedulerSpawnSkipRecord = {
    recordKind: 'spawn-skip',
    ts: new Date().toISOString(),
    pass,
    spawnedTaskIds: [...spawnedTaskIds],
    skips: [...skips],
  };
  try {
    const filePath = schedulerShadowJournalPath(projectRoot, sprintId);
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8');
  } catch (err) {
    debugLog('scheduler-effects:publishSchedulerSpawnSkips', err);
  }
  return record;
}

/** Exact active writer overlap checked by the canonical spawn admission. */
export function findActiveWriteCollisions(
  candidate: Task,
  tasks: readonly Task[],
  collectedIds: ReadonlySet<string>,
): readonly string[] {
  const candidateWrites = new Set(
    (candidate.scope?.filesWrite ?? []).map(path => path.replace(/\\/gu, '/').toLowerCase()),
  );
  if (candidateWrites.size === 0) return [];
  return tasks
    .filter(task => task.id !== candidate.id && !collectedIds.has(task.id))
    .filter(task =>
      task.status === TaskStatus.EXECUTING
      || task.status === TaskStatus.CLAIMED
      || task.status === TaskStatus.TESTING
      || task.status === TaskStatus.DOCUMENTING,
    )
    .filter(task => (task.scope?.filesWrite ?? []).some(path =>
      candidateWrites.has(path.replace(/\\/gu, '/').toLowerCase()),
    ))
    .map(task => task.id)
    .sort();
}

function intendedWorkerBackend(
  task: Task,
  provider: ReturnType<typeof resolveTaskProvider>,
  backend: SpawnBackend | undefined,
): string {
  if (task.backend) return task.backend;
  if (isAdapterProvider(provider) && task.budgetPolicy?.finalOnlyUsage === undefined) {
    return 'host-adapter';
  }
  if (backend) return backend.name;
  if (isAdapterProvider(provider)) return 'host-adapter';
  return isTmuxProvider(provider) ? 'tmux' : 'host-adapter';
}

function dispositionExecutionIdentity(
  executionBackend: string,
  executionMode: SpawnExecutionMode,
): SpawnDispositionExecutionIdentity {
  return Object.freeze({ executionBackend, executionMode });
}

function preDispatchExecutionIdentity(
  task: Task,
  backend: SpawnBackend | undefined,
  exactDockerRegistry: ExactNormalDockerExecutionRegistryV2 | undefined,
): SpawnDispositionExecutionIdentity {
  const executionBackend = intendedWorkerBackend(task, resolveTaskProvider(task), backend);
  return dispositionExecutionIdentity(
    executionBackend,
    exactDockerRegistry && executionBackend === 'docker'
      ? 'normal-docker-exact'
      : 'legacy-non-docker',
  );
}

/**
 * Shared Sprint Worker ingress. The current production candidate adapter is
 * intentionally absent, so configured authority can only HOLD. This function
 * must run before prompt construction, provider bootstrap, task assignment or
 * backend dispatch on every scheduler trigger.
 */
export function assertSprintWorkerProviderAuthority(input: {
  readonly authority: ProviderAuthorityRuntimeServiceOpenResult | undefined;
  readonly projectRoot: string;
  readonly task: Task;
  readonly config: ResolvedConfig | undefined;
  readonly sprintFallbackId: string;
  readonly backend: SpawnBackend | undefined;
}): void {
  if (!input.authority) return;
  const provider = resolveTaskProvider(input.task);
  if (!input.config) {
    const request = Object.freeze({
      role: 'worker' as const,
      purpose: 'worker-execution' as const,
      runId: input.task.sprintId ?? input.sprintFallbackId,
      taskId: input.task.id,
      provider,
      model: input.task.model,
      configuredBackend: intendedWorkerBackend(input.task, provider, input.backend),
      fallbackProviders: Object.freeze([] as string[]),
      unattended: input.task.budgetPolicy?.admissionMode !== 'attended',
    });
    throw new ProviderExecutionIngressHoldError(
      'provider_config_unavailable',
      Object.freeze([input.authority.authorityEvidenceRef]),
      request,
      Boolean(writeEvent(
        input.projectRoot,
        request.runId,
        'brain',
        'auditor',
        'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
        {
          ...request,
          reasonCode: 'provider_config_unavailable',
          authorityEvidenceRefs: [input.authority.authorityEvidenceRef],
        },
      )),
    );
  }
  const order = orderedRoleProviders('worker', input.config);
  const request = Object.freeze({
    role: 'worker' as const,
    purpose: 'worker-execution' as const,
    runId: input.task.sprintId ?? input.sprintFallbackId,
    taskId: input.task.id,
    provider,
    model: input.task.model,
    configuredBackend: intendedWorkerBackend(input.task, provider, input.backend),
    fallbackProviders: Object.freeze(
      [order.primary, ...order.fallbacks].filter(candidate => candidate !== provider),
    ),
    unattended: input.task.budgetPolicy?.admissionMode !== 'attended',
  });
  const decision = preflightProviderExecutionIngress(input.authority, request);
  if (decision.decision === 'hold') {
    throw new ProviderExecutionIngressHoldError(
      decision.reasonCode,
      decision.authorityEvidenceRefs,
      request,
      Boolean(writeEvent(
        input.projectRoot,
        request.runId,
        'brain',
        'auditor',
        'BRAIN→AUDITOR:PROVIDER_AUTHORITY_HOLD',
        {
          ...request,
          reasonCode: decision.reasonCode,
          authorityEvidenceRefs: decision.authorityEvidenceRefs,
        },
      )),
    );
  }
}

function persistTask(projectRoot: string, task: Task): void {
  try {
    writeFileSync(
      join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
      JSON.stringify(task, null, 2),
      'utf-8',
    );
  } catch (e) { debugLog('executeSpawnTask:persistTask', e); }
}

/**
 * Canonical single-truth spawn executor (SCHED3 dilim-3). Every trigger path
 * — queue-completion, idle-rescan, dep-ready dispatch, heavyweight dependency
 * respawn — MUST route a task through this function so its resolved model /
 * provider / backend / reasoning-effort and its fix-routing lineage no longer
 * depend on which trigger spawned it. See
 * docs/analysis/scheduler-unify-design-2026-07-11.md.
 */
export async function executeSpawnTask(
  effect: SpawnTaskEffect,
  deps: SpawnTaskDeps,
): Promise<SpawnDisposition> {
  const { task, taskTimeoutSeconds } = effect;
  const { projectRoot, sprintFallbackId, config, spawnOpts, backend } = deps;

  const repairDisposition = resolveRepairDispatchDisposition(
    projectRoot,
    task,
    config as unknown as FailureDispositionPolicyConfig | undefined,
  );
  if (!repairDisposition.fixEligible) {
    const reasonCode = repairDisposition.reasonCode ?? 'LEGACY_HOST_PRE_DISPATCH_REJECTION';
    try {
      writeEvent(projectRoot, getCurrentSprintId(projectRoot) ?? sprintFallbackId, 'brain', 'worker', 'BRAIN→WORKER:REPAIR_NO_MINT', {
        taskId: task.id,
        failedTaskId: task.fixForTaskId,
        reasonCode,
        source: 'scheduler-effects',
      });
    } catch (e) { debugLog('executeSpawnTask:repairNoMint', e); }
    deps.exactDockerRegistry?.registerNotDispatched(task.id);
    return {
      ...preDispatchExecutionIdentity(task, backend, deps.exactDockerRegistry),
      kind: 'no-mint',
      taskId: task.id,
      fixForTaskId: task.fixForTaskId!,
      reasonCode,
    };
  }

  const collisionBlockers = deps.collisionAuthority
    ? findActiveWriteCollisions(
        task,
        deps.collisionAuthority.tasks,
        deps.collisionAuthority.collectedIds,
      )
    : [];
  if (collisionBlockers.length > 0) {
    debugLog(
      'executeSpawnTask:collision',
      `task=${task.id} held behind active writer(s): ${collisionBlockers.join(',')}`,
    );
    return {
      ...preDispatchExecutionIdentity(task, backend, deps.exactDockerRegistry),
      kind: 'collision-held',
      taskId: task.id,
      blockerTaskIds: collisionBlockers,
    };
  }

  // ─── 1. Fix-task routing-lineage inheritance — BEFORE resolution ────────
  const lineage = applyFixRoutingLineage(task, projectRoot, sprintFallbackId);
  if (lineage.missing) {
    const detail = `routing-lineage-missing: ${lineage.detail}`;
    try {
      process.stderr.write(`[scheduler-effects] task ${task.id}: ${detail} — spawn blocked\n`);
    } catch { /* stderr unavailable — non-fatal, debugLog below still records it */ }
    debugLog('executeSpawnTask:routingLineageMissing', `${task.id}: ${detail}`);
    return {
      ...preDispatchExecutionIdentity(task, backend, deps.exactDockerRegistry),
      kind: 'routing-lineage-missing',
      taskId: task.id,
      fixForTaskId: task.fixForTaskId!,
      detail,
    };
  }

  // ─── 2. Provider-authority admission — before prompt/bootstrap/spawn ─────
  assertSprintWorkerProviderAuthority({
    authority: spawnOpts?.providerAuthority,
    projectRoot,
    task,
    config,
    sprintFallbackId,
    backend,
  });
  // Capture any compatibility projection before routing/prompt compilation
  // mutates the in-memory task. Later publication may only advance this exact
  // generation; a concurrent writer becomes a CAS hold, never an overwrite.
  const ingressTaskProjectionContentDigest = effect.existingTaskProjectionContentDigest
    ?? inspectTaskArtifactsDeferred(projectRoot, [task]).contentDigests[task.id];
  await deps.routeTask?.(task);

  // ─── 3. Prompt / provider / backend / reasoning-effort resolution ───────
  const agentPrompt = await deps.resolveAgentPrompt(projectRoot, task);
  const skillPrompts = await deps.resolveSkillPrompts(projectRoot, task);
  const model = task.model;
  const writeTargets = deps.buildWriteTargets(task);
  const allowedTools = writeTargets.length > 0
    ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
    : 'Read,Write,Edit,Bash,Glob,Grep';

  const taskProvider = resolveTaskProvider(task);
  const effectiveBackend: SpawnBackend | undefined =
    task.backend && task.backend !== config?.spawn_backend
      ? SpawnBackendFactory.create({
          backend: task.backend,
          projectDir: projectRoot,
          dockerImage: config?.docker_image,
          dockerTimeoutSeconds: config?.docker_timeout,
          dockerMemoryLimit: config?.worker_memory_limit,
          dockerHomeTmpfsSize: config?.worker_home_tmpfs_size, // WORKER-ENV-TMPFS-001
          dockerMemorySwap: config?.worker_memory_swap,
          dockerKindMemoryLimits: config?.worker_memory_limit_by_kind,
          })
      : backend;
  const finalOnlyUsageContainment = requireFinalOnlyUsageContainment({
    role: 'worker',
    provider: taskProvider,
    providerCommand: getProviderCommandSpec(taskProvider),
    executor: effectiveBackend?.name === 'docker'
      ? { executor: 'docker', finalOnlyUsageContainment: 'wall-clock' }
      : undefined,
    budget: task.budget,
    budgetPolicy: task.budgetPolicy,
  });
  const wantsHostAdapter = isAdapterProvider(taskProvider)
    && !task.backend
    && !finalOnlyUsageContainment;
  const reasoningEffort = resolveReasoningEffort(taskProvider, task.modelEffort);
  const excludeDynamicPromptSections = config?.prompt?.exclude_dynamic_system_prompt_sections !== false;
  // 7094-F3 (default true): externalized worker core → --system-prompt-file.
  const systemPromptCore = config?.prompt?.worker_core_system_prompt === true
    ? buildWorkerCoreSystemPrompt(task)
    : undefined;
  const exactDockerExecution = Boolean(
    deps.exactDockerRegistry
    && effectiveBackend?.name === 'docker'
    && !wantsHostAdapter,
  );
  const resolvedExecutionIdentity = dispositionExecutionIdentity(
    exactDockerExecution
      ? 'docker'
      : wantsHostAdapter
        ? 'host-adapter'
        : intendedWorkerBackend(task, taskProvider, effectiveBackend),
    exactDockerExecution ? 'normal-docker-exact' : 'legacy-non-docker',
  );
  const dependencyContext = exactDockerExecution
    ? deps.exactDockerRegistry!.dependencyContext(task)
    : null;
  if (exactDockerExecution && dependencyContext === null) {
    deps.exactDockerRegistry!.registerHold(
      task.id,
      'EXACT_DEPENDENCY_TERMINAL_AUTHORITY_UNAVAILABLE',
      effectiveBackend,
    );
    return {
      ...resolvedExecutionIdentity,
      kind: 'exact-dependency-authority-hold',
      taskId: task.id,
    };
  }
  if (!exactDockerExecution && deps.exactDockerRegistry) {
    const exactDependencyId = (task.dependencies ?? []).find(
      dependencyId => deps.exactDockerRegistry!.isExactTask(dependencyId),
    );
    if (exactDependencyId) {
      deps.exactDockerRegistry.registerHold(
        task.id,
        'MIXED_EXECUTION_DEPENDENCY_AUTHORITY_UNSUPPORTED',
      );
      return {
        ...resolvedExecutionIdentity,
        kind: 'exact-dependency-authority-hold',
        taskId: task.id,
      };
    }
    if (!deps.exactDockerRegistry.registerLegacy(task.id)) {
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: 'EXECUTION_MODE_AUTHORITY_CHANGED',
      };
    }
  }
  const compileTask = exactDockerExecution ? structuredClone(task) : task;
  const compilationSink: WorkerPromptCompilationSinkV2 | undefined = exactDockerExecution
    ? {} : undefined;
  // The core may only be externalized when the backend that will actually run
  // this task can deliver it; the compiler resolves that from the kind.
  const prompt = buildWorkerPrompt(
    compileTask,
    agentPrompt,
    skillPrompts,
    projectRoot,
    config,
    undefined,
    undefined,
    task.backend ?? config?.spawn_backend,
    exactDockerExecution
      ? {
          publicationMode: 'deferred',
          dependencyIds: dependencyContext!.dependencyIds,
          dependencyResults: dependencyContext!.dependencyResults,
          sink: compilationSink,
        }
      : undefined,
  );
  const approvalExpectedDispatch = (
    backendName: string,
  ): AttendedExecutionApprovalExpectedDispatch | undefined => {
    if (!task.budget
      || !task.budgetPolicy?.landingPolicy
      || !task.budgetPolicy.policyDigest
      || !task.budgetPolicy.approvalProposal) {
      return undefined;
    }
    assertAttendedExecutionProposalMaterial(
      createAttendedExecutionProposalMaterialFromTask(
        task as unknown as Record<string, unknown>,
        prompt,
      ),
      task.budgetPolicy.approvalProposal,
    );
    return {
      ...task.budgetPolicy.approvalProposal,
      tenantId: task.actor?.tenantId ?? 'local',
      projectId: attendedExecutionProjectId(projectRoot),
      runId: task.sprintId ?? sprintFallbackId,
      taskId: task.id,
      provider: taskProvider,
      model,
      backend: backendName,
      budget: task.budget,
      policy: {
        profileRef: task.budgetPolicy.profileRef,
        policyDigest: task.budgetPolicy.policyDigest,
        landing: task.budgetPolicy.landingPolicy,
      },
    };
  };
  const publishDispatchBoundary = async (
    dispatchBackend: string,
    executionEvidenceRef?: string,
  ): Promise<void> => {
    if (!deps.onDispatchBoundary) return;
    const evidenceRef = executionEvidenceRef ?? exactDockerCustodyMaterialDigest({
      schemaVersion: 1,
      kind: 'canonical-task-dispatch-boundary',
      taskId: task.id,
      provider: taskProvider,
      model,
      backend: dispatchBackend,
      promptSha256: createHash('sha256').update(prompt).digest('hex'),
    });
    await deps.onDispatchBoundary(Object.freeze({
      taskId: task.id,
      provider: taskProvider,
      model,
      backend: dispatchBackend,
      executionEvidenceRef: evidenceRef,
    }));
  };

  if (exactDockerExecution) {
    const exactBackend = effectiveBackend!;
    const exactRegistry = deps.exactDockerRegistry!;
    const planProjectionAdmission = deps.exactTaskProjectionAdmission;
    const isApprovedPlanTask = planProjectionAdmission?.taskIds.includes(task.id) === true;
    let existingTaskProjectionContentDigest = ingressTaskProjectionContentDigest;
    if (existingTaskProjectionContentDigest === undefined && isApprovedPlanTask) {
      existingTaskProjectionContentDigest = planProjectionAdmission
        ?.existingContentDigests[task.id];
      if (existingTaskProjectionContentDigest === undefined) {
        const freshSlot = inspectTaskArtifactsDeferred(projectRoot, [task]);
        if (freshSlot.missing.length !== 1) {
          exactRegistry.registerHold(
            task.id,
            'EXACT_TASK_PROJECTION_APPEARED_AFTER_PLAN_ADMISSION',
            exactBackend,
          );
          return {
            ...resolvedExecutionIdentity,
            kind: 'ambiguous',
            taskId: task.id,
            reasonCode: 'EXACT_TASK_PROJECTION_APPEARED_AFTER_PLAN_ADMISSION',
          };
        }
      }
    } else if (existingTaskProjectionContentDigest === undefined) {
      const observed = inspectTaskArtifactsDeferred(projectRoot, [task]);
      existingTaskProjectionContentDigest = observed.contentDigests[task.id];
    }
    if (!exactBackend.prepareExactDockerCustody
      || !exactBackend.dispatchExactDockerCustody
      || !exactBackend.awaitExactDockerAcceptedResult
      || !compilationSink?.artifact
      || !compilationSink.receipt) {
      exactRegistry.registerHold(task.id, 'EXACT_DOCKER_PORT_SET_UNAVAILABLE', exactBackend);
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: 'EXACT_DOCKER_PORT_SET_UNAVAILABLE',
      };
    }
    const taskTimeout = taskTimeoutSeconds ?? config?.docker_timeout;
    if (!Number.isSafeInteger(taskTimeout) || Number(taskTimeout) <= 0) {
      exactRegistry.registerHold(task.id, 'EXACT_TASK_TIMEOUT_AUTHORITY_UNAVAILABLE', exactBackend);
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: 'EXACT_TASK_TIMEOUT_AUTHORITY_UNAVAILABLE',
      };
    }
    const authMode = task.authMode ?? config?.auth_mode;
    if (authMode !== 'api' && authMode !== 'subscription') {
      exactRegistry.registerHold(task.id, 'EXACT_AUTH_MODE_UNRESOLVED', exactBackend);
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: 'EXACT_AUTH_MODE_UNRESOLVED',
      };
    }
    const landingPolicy = task.budgetPolicy?.landingPolicy;
    if (!landingPolicy) {
      exactRegistry.registerHold(task.id, 'EXACT_LANDING_POLICY_UNAVAILABLE', exactBackend);
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: 'EXACT_LANDING_POLICY_UNAVAILABLE',
      };
    }
    assertExecutionLandingSupport({
      budget: task.budget,
      policy: landingPolicy,
      mode: task.budgetPolicy?.admissionMode,
      capability: exactBackend.executionLandingCapability,
      executor: exactBackend.name,
      approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
      approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
      approvalExpectedDispatch: approvalExpectedDispatch(exactBackend.name),
    });
    if (!finalOnlyUsageContainment) {
      assertLiveUsageBudgetSupport(
        task.budget,
        exactBackend.liveUsageBudgetSupport,
        exactBackend.name,
      );
    }
    const workerId = `w-${task.id}`;
    const dispatchTask = createExactDockerDispatchTaskMaterial(compileTask, workerId);
    const dispatchTaskMaterialDigest = exactDockerCustodyMaterialDigest(dispatchTask);
    let approvedTaskMaterial: ExactNormalTaskApprovedMaterialV3;
    try {
      approvedTaskMaterial = createExactNormalTaskApprovedMaterialV3({
        sprintId: task.sprintId ?? sprintFallbackId,
        task: dispatchTask,
        dispatchTaskMaterialDigest,
        config,
        policy: createExactDockerCustodyPolicy(),
      });
    } catch (error) {
      const reasonCode = error instanceof ExactEvaluationPolicyFailure
        ? error.code
        : 'INVALID_EXACT_EVALUATION_POLICY';
      exactRegistry.registerHold(task.id, reasonCode, exactBackend);
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode,
      };
    }
    const predecessorResolution = exactRegistry.resolveExactPredecessor(task.id);
    if (predecessorResolution.state === 'hold') {
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: predecessorResolution.reasonCode,
      };
    }
    const exactPredecessor = predecessorResolution.state === 'current'
      ? predecessorResolution.predecessor
      : null;
    const releasedPredecessor = exactPredecessor && 'providerStartReceipt' in exactPredecessor
      ? exactPredecessor
      : null;
    const zeroWorkPredecessor = exactPredecessor && 'zeroWorkReceipt' in exactPredecessor
      ? exactPredecessor
      : null;
    const lineageMaterial = Object.freeze({
      schemaVersion: 2 as const,
      kind: 'normal-task-lineage-material' as const,
      sprintId: task.sprintId ?? sprintFallbackId,
      taskId: task.id,
      dependencies: dependencyContext!.lineageAuthorities,
      predecessor: releasedPredecessor,
      ...(zeroWorkPredecessor ? { zeroWorkPredecessor } : {}),
    });
    const approvedTaskMaterialDigest = exactDockerCustodyMaterialDigest(approvedTaskMaterial);
    const lineageMaterialDigest = exactDockerCustodyMaterialDigest(lineageMaterial);
    const promptDeliveryAuthority = createExactDockerPromptDeliveryAuthority({
      taskId: task.id,
      prompt,
      promptCompilePlanId: compilationSink.artifact.planId,
      rolePolicyIdentity: compilationSink.artifact.compilePlan.rolePolicyIdentity,
      ...(compileTask.assignedAgent ? { assignedAgentId: compileTask.assignedAgent } : {}),
      ...(compileTask.assignedSkills ? { assignedSkillIds: compileTask.assignedSkills } : {}),
      ...(compileTask.forceSkills ? { forcedSkillIds: compileTask.forceSkills } : {}),
      segments: compilationSink.artifact.segments.map(segment => ({
        tier: segment.tier,
        kind: segment.kind,
        content: segment.content,
      })),
    });
    const dispatchRequestDigest = exactDockerCustodyMaterialDigest({
      schemaVersion: 2,
      kind: 'normal-task-dispatch-request-identity',
      projectId: attendedExecutionProjectId(projectRoot),
      taskId: task.id,
      approvedTaskMaterialDigest,
      dispatchTaskMaterialDigest,
      lineageMaterialDigest,
      promptDeliveryAuthorityDigest: promptDeliveryAuthority.authorityDigest,
    });
    const dispatchRequestId = `dreq-${dispatchRequestDigest.slice('sha256:'.length)}`;
    const prepared = await exactBackend.prepareExactDockerCustody({
      dispatchRequestId,
      projectId: attendedExecutionProjectId(projectRoot),
      taskId: task.id,
      approvedTaskMaterial,
      approvedTaskMaterialDigest,
      dispatchTaskMaterial: dispatchTask,
      dispatchTaskMaterialDigest,
      lineageMaterial,
      lineageMaterialDigest,
      prompt,
      promptDeliveryAuthority,
      systemPromptCore: systemPromptCore ?? null,
      model,
      execution: Object.freeze({
        allowedTools,
        availableTools: null,
        authMode,
        isolatedContext: false,
        reasoningEffort: reasoningEffort ?? null,
        excludeDynamicPromptSections,
        taskTimeoutSeconds: Number(taskTimeout),
        actionId: null,
        executionBudget: task.budget ?? null,
        executionLandingPolicy: landingPolicy,
        executionAdmissionMode: task.budgetPolicy?.admissionMode ?? null,
        executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef ?? null,
        finalOnlyUsageContainment: finalOnlyUsageContainment ?? null,
      }),
      predecessor: releasedPredecessor,
      ...(zeroWorkPredecessor ? { zeroWorkPredecessor } : {}),
    });
    const preparedAdmission = exactRegistry.admitPreparedAttempt(
      task.id,
      exactBackend,
      prepared.preparationRef,
    );
    if (preparedAdmission.state === 'hold') {
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: preparedAdmission.reasonCode,
      };
    }
    deps.onDispatchAttemptBoundary?.({ taskId: task.id, backend: 'docker' });
    const outcome = await exactBackend.dispatchExactDockerCustody(prepared.dispatchEnvelope);
    if (outcome.kind === 'not-dispatched') {
      exactRegistry.registerNotDispatched(
        task.id,
        exactBackend,
        outcome.custodyRef,
        outcome.zeroWorkReceipt,
      );
      return {
        ...resolvedExecutionIdentity,
        kind: 'not-dispatched',
        taskId: task.id,
        reasonCode: outcome.reasonCode,
        exactDispatchOutcome: outcome,
      };
    }
    if (outcome.kind === 'ambiguous') {
      exactRegistry.registerHold(task.id, outcome.reasonCode, exactBackend);
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: outcome.reasonCode,
        exactDispatchOutcome: outcome,
      };
    }
    const query: ExactDockerCustodyTerminalQueryV2 = Object.freeze({
      custodyRef: outcome.custodyRef,
      releaseReceipt: outcome.releaseReceipt,
      providerStartReceipt: outcome.providerStartReceipt,
      projectionFence: outcome.projectionFence,
    });
    exactRegistry.registerReleased(task.id, exactBackend, query);
    // An exact attempt crosses the invocation dispatch boundary only after the
    // backend has durably proved both RELEASED custody and provider-start
    // acceptance. Calling this before dispatch made a durable zero-work outcome
    // look like a started attempt in the invocation ledger.
    await publishDispatchBoundary(
      'docker',
      outcome.providerStartReceipt.ref,
    );

    Object.assign(task, dispatchTask);
    task.status = TaskStatus.EXECUTING;
    if (existingTaskProjectionContentDigest !== undefined) {
      transitionTaskArtifactProjectionCas(
        projectRoot,
        task,
        existingTaskProjectionContentDigest,
        `exact-released:${dispatchRequestId}`,
      );
    } else {
      publishTaskArtifactsNoClobber(
        projectRoot,
        [task],
        `exact-released:${dispatchRequestId}`,
      );
    }
    if (!writePromptDeliveryReceipt(projectRoot, compilationSink.receipt)) {
      throw new DeckentError(
        'DECKENT_E077',
        `PROMPT_DELIVERY_RECEIPT_WRITE_HOLD:${task.id}`,
      );
    }
    const sprintIdForAssign = getCurrentSprintId(projectRoot) ?? sprintFallbackId;
    writeEvent(projectRoot, sprintIdForAssign, 'brain', 'worker', CHANNELS.TASK_ASSIGN, {
      taskId: task.id,
      workerId,
      model: task.model,
      agent: task.assignedAgent ?? 'generic',
      skills: [...promptDeliveryAuthority.deliveredSkillIds],
      scope: {
        directories: task.scope?.directories ?? [],
        filesWrite: task.scope?.filesWrite ?? [],
      },
      provider: taskProvider,
      dispatchRequestId,
      admissionRefDigest: outcome.admissionRef.admissionRefDigest,
      projectionFence: outcome.projectionFence,
    });
    writeEvent(projectRoot, sprintIdForAssign, 'worker', 'brain', CHANNELS.HEARTBEAT, {
      workerId,
      taskId: task.id,
      lifecycleState: 'EXECUTING',
      backend: 'docker',
      dispatchRequestId,
      projectionFence: outcome.projectionFence,
    });
    return {
      ...resolvedExecutionIdentity,
      kind: 'spawned',
      taskId: task.id,
      provider: taskProvider,
      exactDispatchOutcome: outcome,
    };
  }

  let adapterRouted = wantsHostAdapter ? getProviderAdapterForTask(taskProvider) : null;
  if (wantsHostAdapter && !adapterRouted && config) {
    try {
      await bootstrapProviders(config, projectRoot);
      adapterRouted = getProviderAdapterForTask(taskProvider);
    } catch (e) { debugLog('executeSpawnTask:lazyAdapterRebootstrap', e); }
  }

  const sprintIdForAssign = getCurrentSprintId(projectRoot) ?? sprintFallbackId;
  let legacyAdmittedProjectionDigest: string | undefined;
  const publishLegacyDispatchIntent = (dispatchBackend: string): void => {
    if (ingressTaskProjectionContentDigest !== undefined) {
      transitionTaskArtifactProjectionCas(
        projectRoot,
        task,
        ingressTaskProjectionContentDigest,
        `legacy-admitted:${task.sprintId ?? sprintFallbackId}:${dispatchBackend}`,
      );
    } else {
      publishTaskArtifactsNoClobber(
        projectRoot,
        [task],
        `legacy-admitted:${task.sprintId ?? sprintFallbackId}:${dispatchBackend}`,
      );
    }
    legacyAdmittedProjectionDigest = inspectTaskArtifactsDeferred(
      projectRoot,
      [task],
    ).contentDigests[task.id];
    if (!legacyAdmittedProjectionDigest) {
      throw new DeckentError(
        'DECKENT_E077',
        `LEGACY_TASK_PROJECTION_ADMISSION_HOLD:${task.id}`,
      );
    }
    writeEvent(
      projectRoot,
      sprintIdForAssign,
      'brain',
      'worker',
      CHANNELS.TASK_ASSIGN,
      {
        taskId: task.id,
        workerId: `w-${task.id}`,
        model: task.model,
        agent: task.assignedAgent ?? 'generic',
        skills: task.assignedSkills ?? [],
        scope: {
          directories: task.scope?.directories ?? [],
          filesWrite: task.scope?.filesWrite ?? [],
        },
        provider: taskProvider,
        backend: dispatchBackend,
      },
    );
  };

  // ─── 4. Dispatch — single canonical branch set ───────────────────────────
  let dispatchedBackend = 'unknown';
  let legacySettlementRef: TaskResultSettlementRefV1 | undefined;
  if (adapterRouted) {
    const refresh = (adapterRouted as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
    if (typeof refresh === 'function') await refresh.call(adapterRouted);
    assertLiveUsageBudgetSupport(
      task.budget,
      adapterRouted.liveUsageBudgetSupport,
      adapterRouted.name,
      adapterRouted.executionCostClass,
    );
    assertExecutionLandingSupport({
      budget: task.budget,
      policy: task.budgetPolicy?.landingPolicy,
      mode: task.budgetPolicy?.admissionMode,
      capability: adapterRouted.executionLandingCapability,
      executor: adapterRouted.name,
      approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
      approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
      approvalExpectedDispatch: approvalExpectedDispatch('host-adapter'),
      executionCostClass: adapterRouted.executionCostClass,
    });
    const adapterLifecycleOwner = providerAdapterLifecycleOwner(adapterRouted);
    if (!deps.exactDockerRegistry?.registerLegacy(task.id, adapterLifecycleOwner)
      && deps.exactDockerRegistry) {
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: 'EXECUTION_MODE_AUTHORITY_CHANGED',
      };
    }
    publishLegacyDispatchIntent('host-adapter');
    deps.onDispatchAttemptBoundary?.({ taskId: task.id, backend: 'host-adapter' });
    await publishDispatchBoundary('host-adapter');
    adapterRouted.spawn(task.id, model, prompt, {
      allowedTools,
      autoApprove: spawnOpts?.autoApprove ?? false,
      projectDir: projectRoot,
      reasoningEffort,
      excludeDynamicPromptSections,
      taskTimeoutSeconds,
      executionBudget: task.budget,
      executionLandingPolicy: task.budgetPolicy?.landingPolicy,
      executionAdmissionMode: task.budgetPolicy?.admissionMode,
      executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
      env: buildWorkerApprovalGateEnv(config?.approval?.gate_enabled === true, task.sprintId, task.id),
    });
    dispatchedBackend = 'host-adapter';
  } else if (wantsHostAdapter) {
    // Host-only provider wanted but no adapter registered — honest NO_GO,
    // never silently degrade to the docker/claude fallback. Spawn blocked.
    deps.exactDockerRegistry?.registerNotDispatched(task.id);
    return {
      ...resolvedExecutionIdentity,
      kind: 'provider-unavailable',
      taskId: task.id,
      provider: String(task.provider),
    };
  } else if (effectiveBackend) {
    if (!finalOnlyUsageContainment) {
      assertLiveUsageBudgetSupport(
        task.budget,
        effectiveBackend.liveUsageBudgetSupport,
        effectiveBackend.name,
      );
    }
    const approvalGrant = assertExecutionLandingSupport({
      budget: task.budget,
      policy: task.budgetPolicy?.landingPolicy,
      mode: task.budgetPolicy?.admissionMode,
      capability: effectiveBackend.executionLandingCapability,
      executor: effectiveBackend.name,
      approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
      approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
      approvalExpectedDispatch: approvalExpectedDispatch(effectiveBackend.name),
    });
    const settlementRef = effectiveBackend.name === 'docker' && approvalGrant
      ? createTaskResultSettlementRefForAttempt(
        projectRoot,
        task.id,
        approvalGrant.receipt.binding.attemptId,
      )
      : undefined;
    if (!deps.exactDockerRegistry?.registerLegacy(task.id, effectiveBackend)
      && deps.exactDockerRegistry) {
      return {
        ...resolvedExecutionIdentity,
        kind: 'ambiguous',
        taskId: task.id,
        reasonCode: 'EXECUTION_MODE_AUTHORITY_CHANGED',
      };
    }
    publishLegacyDispatchIntent(effectiveBackend.name);
    deps.onDispatchAttemptBoundary?.({ taskId: task.id, backend: effectiveBackend.name });
    await publishDispatchBoundary(effectiveBackend.name);
    effectiveBackend.spawn(task.id, model, prompt, {
      allowedTools,
      autoApprove: spawnOpts?.autoApprove ?? false,
      projectDir: projectRoot,
      reasoningEffort,
      excludeDynamicPromptSections,
      systemPromptCore,
      taskTimeoutSeconds,
      executionBudget: task.budget,
      executionLandingPolicy: task.budgetPolicy?.landingPolicy,
      executionAdmissionMode: task.budgetPolicy?.admissionMode,
      executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
      executionApprovalGrant: approvalGrant,
      executionApprovalExpectedDispatch: approvalExpectedDispatch(effectiveBackend.name),
      settlementRef,
      ...(finalOnlyUsageContainment ? { finalOnlyUsageContainment } : {}),
      // SURF-3 S2/S3 — live tool-by-tool activity (flag-gated; no-op when
      // off). 583/N5: env-twin aware — an interactive-origin coordinator
      // (DECKENT_LIVE_TRACE=1) streams live without a global config flip.
      liveTraceEnabled: resolveLiveTraceEnabled(config),
      sprintId: task.sprintId,
    });
    dispatchedBackend = effectiveBackend.name;
    legacySettlementRef = settlementRef;
  } else if (!isTmuxProvider(taskProvider)) {
    const adapter = getProviderAdapterForTask(taskProvider);
    if (adapter) {
      assertLiveUsageBudgetSupport(
        task.budget,
        adapter.liveUsageBudgetSupport,
        adapter.name,
        adapter.executionCostClass,
      );
      assertExecutionLandingSupport({
        budget: task.budget,
        policy: task.budgetPolicy?.landingPolicy,
        mode: task.budgetPolicy?.admissionMode,
        capability: adapter.executionLandingCapability,
        executor: adapter.name,
        approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
        approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
        approvalExpectedDispatch: approvalExpectedDispatch('host-adapter'),
        executionCostClass: adapter.executionCostClass,
      });
      const adapterLifecycleOwner = providerAdapterLifecycleOwner(adapter);
      if (!deps.exactDockerRegistry?.registerLegacy(task.id, adapterLifecycleOwner)
        && deps.exactDockerRegistry) {
        return {
          ...resolvedExecutionIdentity,
          kind: 'ambiguous',
          taskId: task.id,
          reasonCode: 'EXECUTION_MODE_AUTHORITY_CHANGED',
        };
      }
      publishLegacyDispatchIntent('host-adapter');
      deps.onDispatchAttemptBoundary?.({ taskId: task.id, backend: 'host-adapter' });
      await publishDispatchBoundary('host-adapter');
      adapter.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
        executionBudget: task.budget,
        executionLandingPolicy: task.budgetPolicy?.landingPolicy,
        executionAdmissionMode: task.budgetPolicy?.admissionMode,
        executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
        env: buildWorkerApprovalGateEnv(config?.approval?.gate_enabled === true, task.sprintId, task.id),
      });
      dispatchedBackend = 'host-adapter';
    } else {
      deps.exactDockerRegistry?.registerNotDispatched(task.id);
      return {
        ...resolvedExecutionIdentity,
        kind: 'provider-unavailable',
        taskId: task.id,
        provider: String(task.provider),
      };
    }
  } else {
    assertLiveUsageBudgetSupport(task.budget, undefined, 'tmux');
    assertExecutionLandingSupport({
      budget: task.budget,
      policy: task.budgetPolicy?.landingPolicy,
      mode: task.budgetPolicy?.admissionMode,
      capability: 'unsupported',
      executor: 'tmux',
      approvalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
      approvalAuthority: spawnOpts?.attendedExecutionApprovalAuthority,
      approvalExpectedDispatch: approvalExpectedDispatch('tmux'),
    });
    publishLegacyDispatchIntent('tmux');
    deps.onDispatchAttemptBoundary?.({ taskId: task.id, backend: 'tmux' });
    await publishDispatchBoundary('tmux');
    spawnWorker(task.id, model, prompt, projectRoot, {
      allowedTools,
      autoApprove: spawnOpts?.autoApprove ?? false,
      excludeDynamicPromptSections,
    });
    dispatchedBackend = 'tmux';
  }

  // ─── 4. Persistence — single site ────────────────────────────────────────
  task.status = TaskStatus.EXECUTING;
  if (!legacyAdmittedProjectionDigest) {
    throw new DeckentError(
      'DECKENT_E077',
      `LEGACY_TASK_PROJECTION_ADMISSION_HOLD:${task.id}`,
    );
  }
  transitionTaskArtifactProjectionCas(
    projectRoot,
    task,
    legacyAdmittedProjectionDigest,
    `legacy-dispatched:${task.sprintId ?? sprintFallbackId}:${dispatchedBackend}`,
  );

  return {
    ...dispositionExecutionIdentity(dispatchedBackend, 'legacy-non-docker'),
    kind: 'spawned',
    taskId: task.id,
    provider: taskProvider,
    ...(legacySettlementRef ? { legacySettlementRef } : {}),
  };
}

// ═══ SCHED5 — Reducer-Decision Executor (dilim-5, docs/analysis/ ══════════
// scheduler-unify-design-2026-07-11.md) ═════════════════════════════════════
//
// When `scheduler.engine === 'reducer'` (scheduler-driver.ts's
// resolveSchedulerEngine/createSchedulerDriver), the four previously-separate
// spawn-selection closures (processQueue / maybeRespawn / forceRescanIfIdle /
// dispatchReadyTasks in result-collector.ts) are replaced by ONE
// `reduceSchedulerTick()` decision (scheduler-reducer.ts). This function is
// the single place that turns that decision into real spawn/kill calls —
// every `SpawnTask` effect still routes through `executeSpawnTask` above (the
// same canonical executor SCHED3 already unified queue/idle/ready/respawn
// onto), so "one decision, one executor" holds end-to-end.
//
// Scope (dilim-5, per the design doc's own 8-sprint table): SpawnTask +
// KillWorker. Blocked / ClearBlocked / EmitMetric remain NOT executed here —
// those stay dilim-7 ("FIFO safety/config migration") scope. The pre-existing
// cascadeSkipDeadBlocked / DEPENDENCY_BLOCKED mechanisms in result-collector.ts
// / sprint-spawner.ts keep running unconditionally, independent of engine, so
// nothing regresses.
//
// CascadeSkip + WriteCheckpoint (SCHED6-EFF, task 427-008, dilim-6 "Cascade ve
// restore live") ARE executed below — see their branches in
// `executeSchedulerDecision` and the persist-before-commit contract on
// `SchedulerDecisionExecutionDeps.writeCheckpoint`. Any caller still routing
// through this executor without wiring `writeCheckpoint` (e.g. the current
// scheduler-driver.ts:376 call site) simply gets a documented no-op for that
// one effect kind — CascadeSkip has no such opt-out, since it needs no
// injected collaborator beyond the taskMap/filesystem this module already
// has.

export interface SchedulerDecisionExecutionDeps extends SpawnTaskDeps {
  /** Live task lookup — a `SchedulerEffect` only carries a taskId. */
  readonly taskMap: ReadonlyMap<string, Task>;
  /** Bug-F idempotency guard, mirrors result-collector.ts's spawnIfNotAssigned:
   *  added before the spawn attempt, rolled back on a non-'spawned' disposition. */
  readonly assignedTaskIds: Set<string>;
  /** Abstracts `queueBackend.kill(id)` vs the tmux `killWorker(id)` fallback —
   *  caller-supplied so this module never imports tmux.js directly. */
  readonly killWorker: (taskId: string) => void;
  /**
   * WriteCheckpoint effect executor — caller-supplied so this leaf module never
   * needs a full `Sprint`/`eventStreamOffset`/dependency-graph object (the shape
   * `sprint-checkpoint.ts`'s `writeCheckpoint()` actually requires); the caller
   * binds its own sprint state into a `(reason) => void` closure. Optional — a
   * caller that hasn't wired a real checkpoint writer yet (no live call site
   * does, as of SCHED6-EFF) gets a documented no-op for this one effect kind
   * instead of a hard crash.
   */
  readonly writeCheckpoint?: (reason: string) => void;
}

export interface SchedulerDecisionExecutionResult {
  readonly spawnedTaskIds: string[];
  readonly killedWorkerIds: string[];
  /** Task IDs actually committed (status flipped to NO_GO + persisted) THIS call —
   *  excludes any CascadeSkip effect that was a pure replay no-op (see
   *  `executeSchedulerDecision`'s persist-before-commit contract). */
  readonly cascadeSkippedTaskIds: string[];
  /** Count of WriteCheckpoint effects for which `deps.writeCheckpoint` was
   *  actually invoked without throwing (0 when the dep is omitted). */
  readonly checkpointsWritten: number;
  /** Row 3309: every SpawnTask effect this tick declined to turn into a live
   *  worker, with its typed reason — also published to the scheduler journal. */
  readonly spawnSkips: readonly SchedulerSpawnSkip[];
  readonly decidedEffects: readonly SchedulerDecision['orderedEffects'][number][];
  readonly landedEffects: readonly SchedulerDecision['orderedEffects'][number][];
}

function cascadeSkipResultPath(projectRoot: string, taskId: string): string {
  return join(projectRoot, TASKS_DIR, `task-${taskId}.result`);
}

/**
 * Synthetic NO_GO result for a task the scheduler decided to skip because a
 * dependency it needed already failed terminally — same shape/semantics as
 * the legacy `cascadeSkipDeadBlocked` closure's result (result-collector.ts),
 * notably `cascadeSkipped: true` (task-types.ts) which the fix/cross-fix
 * gates (debt-manager.ts) MUST exempt from spawning follow-up work.
 */
function buildCascadeSkipResult(task: Task, failedDependencyId: string): TaskResult {
  return {
    taskId: task.id,
    workerId: `w-${task.id}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    cascadeSkipped: true,
    notes:
      `Cascade-skipped (SCHED6-EFF persist-before-commit executor): dependency ${failedDependencyId} `
      + 'ended NO_GO/MANUAL_REVIEW, so this dependent was never dispatched. Re-run after the '
      + 'dependency is fixed.',
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider: task.provider,
      model: task.forceModel ?? task.model,
    },
  };
}

/**
 * The "persist" half of persist-before-commit: atomic tmp-write + rename (same
 * atomic-write idiom as sprint-checkpoint.ts/evaluation-audit-trail.ts) so a
 * crash mid-write never leaves a half-serialized `.result` file. Throws on
 * failure — the caller must NOT advance task status/collected state when this
 * throws (that in-spite-of-failure commit is the exact legacy bug, see the
 * `.plan` file / design doc "Riskler" section for the persist-before-commit
 * risk this executor closes).
 */
function persistCascadeSkipResultAtomic(projectRoot: string, result: TaskResult): void {
  const filePath = cascadeSkipResultPath(projectRoot, result.taskId);
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, serializeTaskResultForDisk(result), 'utf-8');
  renameSync(tmpPath, filePath);
}

export type SchedulerSpawnFailure =
  | {
    readonly kind: 'deterministic-admission';
    readonly reasonCode: Exclude<HostPreDispatchReasonCode, 'LEGACY_HOST_PRE_DISPATCH_REJECTION'>;
    readonly detail: string;
  }
  | { readonly kind: 'transient-host'; readonly detail: string };

const DETERMINISTIC_ADMISSION_CODES = new Map<
  string,
  Exclude<HostPreDispatchReasonCode, 'LEGACY_HOST_PRE_DISPATCH_REJECTION'>
>([
  ['E_ATTRIBUTION_BASELINE_CAPTURE_FAILED', 'ATTRIBUTION_BASELINE_CAPTURE_FAILED'],
  ['E_PROMPT_COMPILE_FAILED', 'PROMPT_COMPILE_FAILED'],
  ['E_SCOPE_COMPILE_FAILED', 'SCOPE_COMPILE_FAILED'],
  ['E_SCOPE_UNSATISFIABLE', 'SCOPE_UNSATISFIABLE'],
]);

export function classifySchedulerSpawnFailure(error: unknown): SchedulerSpawnFailure {
  if (error instanceof DeckentError) {
    const reasonCode = DETERMINISTIC_ADMISSION_CODES.get(error.code);
    if (reasonCode) {
      return { kind: 'deterministic-admission', reasonCode, detail: `${error.code}:${error.message}` };
    }
  }
  return { kind: 'transient-host', detail: error instanceof Error ? `${error.name}:${error.message}` : String(error) };
}

function emitSpawnFailureOutcome(
  deps: Pick<SchedulerDecisionExecutionDeps, 'projectRoot' | 'sprintFallbackId'>,
  task: Task,
  failure: SchedulerSpawnFailure,
  outcome: 'settled' | 'retry-scheduled' | 'held',
  attempt: number,
): void {
  try {
    const sprintId = getCurrentSprintId(deps.projectRoot) ?? deps.sprintFallbackId;
    writeEvent(deps.projectRoot, sprintId, 'brain', 'worker', CHANNELS.METRIC_EMITTED, {
      name: 'scheduler.spawn_failure', value: 1, taskId: task.id,
      failureKind: failure.kind, outcome, attempt,
    });
    metric('scheduler.spawn_failure', 1, {
      task_id: task.id, failure_kind: failure.kind, outcome, attempt: String(attempt),
    });
  } catch (emitError) { debugLog('executeSchedulerDecision:spawnFailure:emit', emitError); }
}

function settleNonRetryableSpawnAdmission(
  projectRoot: string,
  task: Task,
  failure: Extract<SchedulerSpawnFailure, { kind: 'deterministic-admission' }>,
): string | null {
  const detail = failure.detail;
  const resultPath = cascadeSkipResultPath(projectRoot, task.id);
  try {
    if (!existsSync(resultPath)) {
      persistCascadeSkipResultAtomic(
        projectRoot,
        createHostPreDispatchNoGoResult(
          task,
          failure.reasonCode,
          detail,
        ),
      );
    }
  } catch (persistError) {
    debugLog('executeSchedulerDecision:spawnAdmission:persist', persistError);
    return null;
  }
  task.status = TaskStatus.NO_GO;
  persistTask(projectRoot, task);
  return detail;
}

const MAX_TRANSIENT_SPAWN_ATTEMPTS = 3;
const TRANSIENT_SPAWN_BACKOFF_MS = 1_000;
type RetryTask = Task & { schedulerSpawnAttempts?: number; retryAfter?: number };

function recordTransientSpawnFailure(task: Task, projectRoot: string): {
  readonly held: boolean; readonly attempt: number; readonly retryAfter?: number;
} {
  const retryTask = task as RetryTask;
  const attempt = (retryTask.schedulerSpawnAttempts ?? 0) + 1;
  retryTask.schedulerSpawnAttempts = attempt;
  if (attempt >= MAX_TRANSIENT_SPAWN_ATTEMPTS) {
    delete retryTask.retryAfter;
    task.status = TaskStatus.PAUSED;
    persistTask(projectRoot, task);
    return { held: true, attempt };
  }
  retryTask.retryAfter = Date.now() + TRANSIENT_SPAWN_BACKOFF_MS * (2 ** (attempt - 1));
  task.status = TaskStatus.PENDING;
  persistTask(projectRoot, task);
  return { held: false, attempt, retryAfter: retryTask.retryAfter };
}

/**
 * Execute a `SchedulerDecision`'s effects, IN ORDER, through the canonical
 * single executor (`executeSpawnTask` for SpawnTask). Never throws — a single
 * effect's failure is logged and skipped so the rest of the tick's effects
 * still apply.
 *
 * CascadeSkip (SCHED6-EFF persist-before-commit contract): the synthetic
 * `.result` is written to disk FIRST (atomically); task status/collected
 * state is only "committed" (status → NO_GO, task json persisted, id added to
 * `cascadeSkippedTaskIds`) AFTER that persist succeeds. PENDING and PAUSED
 * tasks are both eligible for that commit: the continuous-quiescence reducer
 * deliberately emits CascadeSkip for a PAUSED descendant once repair is
 * disabled and the branch is proven dead. If the `.result`
 * already exists on disk (a replay of an already-applied — or
 * crash-interrupted — decision), the persist step is skipped entirely so a
 * duplicate skip is never written; the commit step still runs if-and-only-if
 * `task.status` is still PENDING, which correctly finishes a commit that a
 * prior crash interrupted between persist and commit, while being a total
 * no-op once both halves have already landed.
 */
export async function executeSchedulerDecision(
  decision: SchedulerDecision,
  deps: SchedulerDecisionExecutionDeps,
): Promise<SchedulerDecisionExecutionResult> {
  const spawnedTaskIds: string[] = [];
  const killedWorkerIds: string[] = [];
  const cascadeSkippedTaskIds: string[] = [];
  const spawnSkips: SchedulerSpawnSkip[] = [];
  const landedEffects: SchedulerDecision['orderedEffects'][number][] = [];
  let checkpointsWritten = 0;
  let terminalPersistenceFailed = false;

  for (const effect of decision.orderedEffects) {
    if (effect.kind === 'NoMintRepair') {
      try {
        writeEvent(deps.projectRoot, getCurrentSprintId(deps.projectRoot) ?? deps.sprintFallbackId, 'brain', 'worker', 'BRAIN→WORKER:REPAIR_NO_MINT', {
          taskId: effect.taskId,
          failedTaskId: effect.failedTaskId,
          reasonCode: effect.reasonCode,
          source: 'scheduler-reducer',
          idempotencyKey: effect.idempotencyKey,
        });
        landedEffects.push(effect);
      } catch (e) { debugLog('executeSchedulerDecision:repairNoMint', e); }
      continue;
    }
    if (effect.kind === 'KillWorker') {
      try {
        deps.killWorker(effect.taskId);
        landedEffects.push(effect);
      } catch (e) { debugLog('executeSchedulerDecision:killWorker', e); }
      killedWorkerIds.push(effect.taskId);
      continue;
    }
    if (effect.kind === 'CascadeSkip') {
      const task = deps.taskMap.get(effect.taskId);
      if (!task) {
        debugLog('executeSchedulerDecision:cascadeSkip:missingTask', `CascadeSkip effect for unknown task ${effect.taskId}`);
        continue;
      }
      if (!existsSync(cascadeSkipResultPath(deps.projectRoot, task.id))) {
        try {
          persistCascadeSkipResultAtomic(deps.projectRoot, buildCascadeSkipResult(task, effect.failedDependencyId));
        } catch (e) {
          debugLog('executeSchedulerDecision:cascadeSkip:persist', `${effect.idempotencyKey}: ${String(e)}`);
          terminalPersistenceFailed = true;
          continue; // persist failed — task stays PENDING, retryable next tick with the same key
        }
      }
      if (task.status === TaskStatus.PENDING || task.status === TaskStatus.PAUSED) {
        task.status = TaskStatus.NO_GO;
        persistTask(deps.projectRoot, task);
        cascadeSkippedTaskIds.push(task.id);
        landedEffects.push(effect);
      }
      continue;
    }
    if (effect.kind === 'WriteCheckpoint') {
      // A checkpoint must never claim this ordered decision landed when an
      // earlier terminal receipt in the same tick did not persist. The next
      // bounded tick will re-decide it with the same idempotency key.
      if (terminalPersistenceFailed) continue;
      try {
        if (deps.writeCheckpoint) {
          deps.writeCheckpoint(effect.reason);
          checkpointsWritten++;
          landedEffects.push(effect);
        }
      } catch (e) { debugLog('executeSchedulerDecision:writeCheckpoint', e); }
      continue;
    }
    if (effect.kind !== 'SpawnTask') continue; // Blocked/ClearBlocked/EmitMetric — dilim-7 scope

    const task = deps.taskMap.get(effect.taskId);
    if (!task) {
      debugLog('executeSchedulerDecision:missingTask', `SpawnTask effect for unknown task ${effect.taskId}`);
      spawnSkips.push(describeSpawnSkip(
        { id: effect.taskId },
        'task-not-found',
        'the tick decided to spawn this id but the live task map does not contain it',
      ));
      continue;
    }
    if (deps.assignedTaskIds.has(effect.taskId)) {
      // idempotency (Bug F parity) — a legitimate no-op, but an invisible one
      // until now: a queue that never drains looks identical to one whose spawn
      // is already in flight.
      spawnSkips.push(describeSpawnSkip(
        task,
        'already-assigned',
        'a spawn for this task is already in flight (idempotency guard); no second dispatch',
      ));
      continue;
    }
    const retryTask = task as RetryTask;
    if (task.status === TaskStatus.NO_GO && existsSync(cascadeSkipResultPath(deps.projectRoot, task.id))) {
      spawnSkips.push(describeSpawnSkip(
        task,
        'spawn-admission-settled',
        'a durable terminal pre-dispatch result already exists; replay did not dispatch or re-emit settlement telemetry',
      ));
      continue;
    }
    if (task.status === TaskStatus.PAUSED && (retryTask.schedulerSpawnAttempts ?? 0) >= MAX_TRANSIENT_SPAWN_ATTEMPTS) {
      spawnSkips.push(describeSpawnSkip(task, 'spawn-retry-held', 'bounded transient spawn attempts exhausted; task remains on HOLD'));
      continue;
    }
    if ((retryTask.retryAfter ?? 0) > Date.now()) {
      spawnSkips.push(describeSpawnSkip(task, 'spawn-retry-backoff', `retry is durably deferred until ${new Date(retryTask.retryAfter!).toISOString()}`));
      continue;
    }
    deps.assignedTaskIds.add(effect.taskId);
    try {
      const disposition = await executeSpawnTask({ task }, deps);
      if (disposition.kind === 'spawned') {
        spawnedTaskIds.push(effect.taskId);
        landedEffects.push(effect);
      } else {
        deps.assignedTaskIds.delete(effect.taskId);
        const skip = spawnSkipFromDisposition(disposition, task);
        if (skip) spawnSkips.push(skip);
      }
    } catch (e) {
      debugLog('executeSchedulerDecision:spawn', e);
      deps.assignedTaskIds.delete(effect.taskId);
      const failure = classifySchedulerSpawnFailure(e);
      if (failure.kind === 'deterministic-admission') {
        const settledAdmission = settleNonRetryableSpawnAdmission(deps.projectRoot, task, failure);
        if (settledAdmission === null) {
          spawnSkips.push(describeSpawnSkip(task, 'spawn-threw', `deterministic admission settlement could not persist: ${failure.detail}`));
          emitSpawnFailureOutcome(deps, task, failure, 'retry-scheduled', 1);
          continue;
        }
        spawnSkips.push(describeSpawnSkip(
          task,
          'spawn-admission-settled',
          `non-retryable pre-dispatch admission failure settled as zero-work NO_GO: ${settledAdmission}`,
        ));
        emitSpawnFailureOutcome(deps, task, failure, 'settled', 1);
        continue;
      }
      const retry = recordTransientSpawnFailure(task, deps.projectRoot);
      spawnSkips.push(describeSpawnSkip(
        task,
        retry.held ? 'spawn-retry-held' : 'spawn-threw',
        retry.held
          ? `transient host failure reached bounded attempt ${retry.attempt}; task placed on HOLD: ${failure.detail}`
          : `transient host failure attempt ${retry.attempt}/${MAX_TRANSIENT_SPAWN_ATTEMPTS}; retry after ${new Date(retry.retryAfter!).toISOString()}: ${failure.detail}`,
      ));
      emitSpawnFailureOutcome(deps, task, failure, retry.held ? 'held' : 'retry-scheduled', retry.attempt);
    }
  }

  publishSchedulerSpawnSkips(
    deps.projectRoot,
    getCurrentSprintId(deps.projectRoot) ?? deps.sprintFallbackId,
    'reducer-tick',
    spawnedTaskIds,
    spawnSkips,
  );

  return {
    spawnedTaskIds, killedWorkerIds, cascadeSkippedTaskIds, checkpointsWritten, spawnSkips,
    decidedEffects: [...decision.orderedEffects], landedEffects,
  };
}
