// ═══ Task Mode Runner ════════════════════════════════════════════════
// Sprint 149 — Task 149-003
//
// Centralized one-shot task execution for `deckent_style === 'task'`.
// Bypasses the full sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE→FIX→RETRO→DECAY→COMPLETE)
// and runs a single task directly via the spawn backend.
//
// Used by:
//   - `deckent run "description"` CLI command (task mode)
//   - `deckent_run` MCP tool (task mode)
//   - Any future task-mode entrypoint

import { randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import type { ModelType, Task, TaskResult } from '../core/types.js';
import type { ResolvedConfig } from '../core/config-types.js';
import type { ExecutionBudget } from '../core/work-model.js';
import type { AttendedExecutionApprovalAuthority } from '../core/attended-execution-approval.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import { resolveDefaultModel } from '../core/config.js';
import { applyWorkerExecutionBudgetPolicy } from '../core/execution-plan-digest.js';
import { buildExecutionRequest, resolveExecutionModelIdentity, resolveToTask } from './execution-request-builder.js';
import { isModelExecutable } from '../core/model-equivalence.js';
import { DeckentError } from '../core/errors.js';
import { enrichResultCost, enrichResultTokenUsage, resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';
import { eventBus } from './event-bus.js';
import { TASKS_DIR } from '../core/constants.js';
import { debugLog, readJsonSafe } from '../core/utils.js';
import { normalizeTaskResultShape, serializeTaskResultForDisk } from '../core/task-result-schema.js';
import type { TaskResultSettlementRefV1 } from '../core/task-result-settlement.js';
import {
  openTaskSettlementAuthority,
  type OpenTaskSettlementAuthorityResult,
  type TaskExecutionDeclaration,
  type TaskSettlementInspection,
} from '../core/task-settlement-authority.js';
import type {
  InvocationExecutionBackend,
  InvocationPreDispatchReasonCode,
  InvocationReceiptRef,
  InvocationTransport,
} from '../core/invocation-receipt.js';
import { resolveTenant } from '../core/tenant-context.js';
import { SpawnBackendFactory } from './spawn-backend.js';
import { deriveWorkerWriteTargets } from './spawn-backend-docker.js';
import {
  createExactNormalDockerExecutionRegistry,
  executeSpawnTask,
  type CanonicalTaskDispatchBoundaryV2,
  type SpawnDisposition,
} from './scheduler-effects.js';
import type { TaskResultAuthorityRead } from './task-result-authority.js';
import { inspectTaskArtifactsDeferred } from './task-artifact-projection.js';
import { isAdapterProvider } from './sprint-utils.js';
import { isProviderExecutionIngressHoldError } from '../core/provider-execution-ingress-authority.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface TaskModeContext {
  /** Human-readable description of what the task should accomplish */
  description: string;
  /** Optional scope constraints */
  scope?: {
    directories?: string[];
    filesWrite?: string[];
  };
  /** Model to use (default: config's canonical default-model, resolved via
   *  {@link resolveDefaultModel} — never a bare alias literal). */
  model?: ModelType;
  /**
   * Provider hint forwarded from the autonomous dispatcher's backlog entry.
   * When set to 'ollama', spawnWorkerMultiProvider calls ensureOllamaModelRegistered
   * before getProviderForModel so dynamic tags (e.g. qwen3.6:27b) resolve correctly.
   */
  provider?: string;
  /** Timeout in milliseconds (default: 300_000 = 5 minutes) */
  timeoutMs?: number;
  /** Auto-approve tool calls */
  autoApprove?: boolean;
  /** Optional request ceiling. Owner config remains authority; this may only narrow it. */
  budget?: ExecutionBudget;
  /** Trusted host composition; absence keeps attended hard-stop execution on HOLD. */
  attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
  /** Process-scoped provider authority; never constructed by the task runner. */
  providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  /** Exact tenant/run identity for an attended approval request. */
  executionTenantId?: string;
  executionRunId?: string;
  /** Project root override */
  projectRoot?: string;
}

export interface TaskModeResult {
  /** Unique task identifier */
  taskId: string;
  /** Backend used for spawning */
  backend: string;
  /** Provider used */
  provider: string;
  /** Effective root used to bind result authority. */
  projectRoot: string;
  /** Exact Docker attempt authority; absent for legacy/non-Docker backends. */
  settlementRef?: TaskResultSettlementRefV1;
  /** Exact Docker never returns a V1 settlement; this is its Store-backed result state. */
  resultAuthority?: TaskResultAuthorityRead<TaskResult>;
  executionMode: 'normal-docker-exact' | 'legacy-non-docker';
  /** Durable invocation truth shared with CLI/MCP/manual ingress. */
  invocation: TaskIngressInvocationAuthority;
}

export interface TaskIngressExecutionInput {
  readonly projectRoot: string;
  readonly config: ResolvedConfig;
  readonly task: Task;
  readonly timeoutMs: number;
  readonly autoApprove?: boolean;
  readonly attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
  readonly providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
  readonly executionRunId?: string;
  readonly executionTenantId?: string;
  /** Surface transport is evidence, never a separate execution engine. */
  readonly transport?: InvocationTransport;
  /** Injectable only for hermetic composition tests. Production uses the canonical store. */
  readonly openTaskSettlementAuthority?: (
    projectRoot: string,
  ) => OpenTaskSettlementAuthorityResult;
  /** One invocation call is unique even when manual spawn reuses a task id. */
  readonly invocationCallId?: string;
  readonly onDispatchBoundary?: (
    boundary: CanonicalTaskDispatchBoundaryV2,
    invocation: TaskIngressInvocationAuthority,
  ) => void | Promise<void>;
}

export interface TaskIngressInvocationAuthority {
  readonly receiptRef: InvocationReceiptRef;
  readonly executionBackend: InvocationExecutionBackend;
  readonly transport: InvocationTransport;
  readonly state: 'not-dispatched' | 'dispatch-started' | 'reconciliation-required';
  readonly executionMode?: 'normal-docker-exact' | 'legacy-non-docker';
  readonly executionEvidenceRef?: string;
  /** Backend-owned exact zero-work/reconciliation evidence, retained verbatim. */
  readonly authorityEvidenceRefs?: readonly string[];
  /** Backend reason code; never inferred from a public task projection. */
  readonly reasonCode?: string;
  readonly dispatchStartedAt?: string;
  readonly settlement?: TaskSettlementInspection;
}

export interface TaskIngressExecutionResult {
  readonly disposition: SpawnDisposition;
  readonly executionMode: 'normal-docker-exact' | 'legacy-non-docker';
  readonly backend: string;
  readonly provider: string;
  readonly resultAuthority?: TaskResultAuthorityRead<TaskResult>;
  readonly invocation: TaskIngressInvocationAuthority;
}

function createTaskIngressTaskId(): string {
  return `run-${Date.now()}-${randomBytes(8).readBigUInt64BE().toString(10)}`;
}

function timestampNotBefore(reference: string): string {
  const referenceMs = Date.parse(reference);
  const nowMs = Date.now();
  return new Date(Number.isFinite(referenceMs) ? Math.max(referenceMs, nowMs) : nowMs)
    .toISOString();
}

export class TaskIngressDispositionError extends DeckentError {
  constructor(readonly execution: TaskIngressExecutionResult) {
    super(
      'TASK_INGRESS_NOT_DISPATCHED',
      `TASK_INGRESS_NOT_DISPATCHED:${execution.disposition.kind}:`
      + `${execution.disposition.taskId}`,
    );
    this.name = 'TaskIngressDispositionError';
  }
}

export interface TaskIngressErrorAuthority {
  readonly schemaVersion: 1;
  readonly reasonCode: string;
  readonly invocation: TaskIngressInvocationAuthority;
  readonly settlementFailure?: string;
}

type ErrorWithTaskIngressAuthority = Error & {
  readonly taskIngressAuthority: TaskIngressErrorAuthority;
};

export function readTaskIngressErrorAuthority(
  error: unknown,
): TaskIngressErrorAuthority | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const authority = (error as Partial<ErrorWithTaskIngressAuthority>).taskIngressAuthority;
  if (
    !authority
    || authority.schemaVersion !== 1
    || typeof authority.reasonCode !== 'string'
    || !authority.invocation
  ) return undefined;
  return authority;
}

function taskIngressCauseCode(error: unknown): string {
  if (isProviderExecutionIngressHoldError(error)) return error.code;
  if (error instanceof DeckentError) return error.code;
  if (
    error
    && typeof error === 'object'
    && 'code' in error
    && typeof (error as { code?: unknown }).code === 'string'
  ) return (error as { code: string }).code;
  if (error instanceof Error && error.name) return error.name;
  return 'TASK_INGRESS_EXECUTION_FAILED';
}

function attachTaskIngressErrorAuthority(
  error: unknown,
  authority: TaskIngressErrorAuthority,
): Error {
  const target = error instanceof Error
    ? error
    : new DeckentError('TASK_INGRESS_EXECUTION_FAILED', String(error));
  try {
    Object.defineProperty(target, 'taskIngressAuthority', {
      value: Object.freeze(authority),
      enumerable: true,
      configurable: false,
      writable: false,
    });
    return target;
  } catch {
    const wrapper = new DeckentError(
      'TASK_INGRESS_AUTHORITY_HOLD',
      `TASK_INGRESS_AUTHORITY_HOLD:${authority.reasonCode}:`
      + authority.invocation.receiptRef.invocationId,
    ) as unknown as ErrorWithTaskIngressAuthority;
    Object.defineProperty(wrapper, 'taskIngressAuthority', {
      value: Object.freeze(authority),
      enumerable: true,
      configurable: false,
      writable: false,
    });
    return wrapper;
  }
}

function normalizeInvocationBackend(backend: string | undefined): InvocationExecutionBackend {
  if (backend === 'docker' || backend === 'tmux') return backend;
  if (backend === 'subprocess' || backend === 'host-adapter') return 'host-subprocess';
  if (backend === 'api') return 'api';
  if (backend === 'in-process') return 'in-process';
  if (backend === 'auto') return process.platform === 'win32' ? 'host-subprocess' : 'docker';
  return 'unknown';
}

function declaredInvocationBackend(task: Task, config: ResolvedConfig): InvocationExecutionBackend {
  if (
    !task.backend
    && task.provider !== undefined
    && isAdapterProvider(task.provider)
    && task.budgetPolicy?.finalOnlyUsage === undefined
  ) return 'host-subprocess';
  const configured = task.backend ?? config.spawn_backend;
  if (configured) return normalizeInvocationBackend(configured);
  return task.provider === 'claude' ? 'tmux' : 'host-subprocess';
}

function preDispatchReason(error: unknown): InvocationPreDispatchReasonCode {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  if (code.includes('PROVIDER_AUTHORITY')) return 'provider_authority_rejected';
  if (code.includes('ROUTING')) return 'routing_authority_rejected';
  if (code.includes('BUDGET')) return 'budget_capability_unsupported';
  if (code.includes('PROVIDER') || code.includes('MODEL')) return 'no_provider';
  if (code.includes('PROMPT') || code.includes('COMMAND')) return 'command_build_failed';
  return 'execution_admission_rejected';
}

function preDispatchEvidenceRefs(error: unknown): readonly string[] {
  return isProviderExecutionIngressHoldError(error)
    ? error.authorityEvidenceRefs
    : Object.freeze([] as string[]);
}

function dispositionPreDispatchReason(
  disposition: Exclude<SpawnDisposition, { readonly kind: 'spawned' }>,
): InvocationPreDispatchReasonCode {
  if (disposition.kind === 'provider-unavailable') return 'no_provider';
  if (disposition.kind === 'routing-lineage-missing') return 'routing_authority_rejected';
  return 'execution_admission_rejected';
}

// ─── Guard ──────────────────────────────────────────────────────────

/**
 * Validate that config is in task mode.
 * Throws if deckent_style !== 'task'.
 */
function assertTaskMode(config: ResolvedConfig): void {
  if (config.deckent_style !== 'task') {
    throw new Error(
      'runTaskMode called but config.deckent_style !== "task". ' +
      'Set deckent_style=task in config or run `deckent mode task`.',
    );
  }
}

// ─── Token-usage enrichment (357-013 / TOK-AUT) ────────────────────────

/**
 * Persist an enriched TaskResult back to disk (atomic temp+rename). Mirrors
 * result-collector.ts's private `persistEnrichedResult` — that helper is not
 * exported, so this is a minimal local equivalent (same on-disk contract:
 * `.tasks/task-{id}.result`). Best-effort: a write failure is logged, never thrown.
 */
function persistTaskModeResult(projectRoot: string, result: TaskResult): void {
  try {
    const path = join(projectRoot, TASKS_DIR, `task-${result.taskId}.result`);
    const tmp = `${path}.enrich-tmp`;
    writeFileSync(tmp, serializeTaskResultForDisk(result), 'utf-8');
    renameSync(tmp, path);
  } catch (err) {
    debugLog('task-mode-runner:persistTaskModeResult', err);
  }
}

/**
 * Enrich a task-mode `.result` file with real tokenUsage + cost data.
 *
 * The sprint lifecycle (result-collector.ts `waitForResults`) fills tokenUsage/cost
 * inline as part of its own result-collection loop. Task-mode has no equivalent
 * loop of its own — `spawnWorkerMultiProvider` is fire-and-forget (the backend
 * launches a detached docker/tmux/subprocess and returns immediately) and
 * `runTaskMode` returns right after spawn — so the worker's honest tokenUsage
 * 0/0/0 stub (Worker Output Contract) was never enriched and stayed 0/0/0 on
 * disk forever. Read-only reuse of result-collector.ts's exported enrichment
 * functions — same resolution order as the sprint path, no behavior change there.
 *
 * No-op (returns `undefined`) when the `.result` file does not exist yet.
 */
export function enrichTaskModeResult(
  projectRoot: string,
  task: Task,
): TaskResult | undefined {
  const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
  const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
  if (!result) return undefined;
  enrichResultTokenUsage(result, task, projectRoot);
  enrichResultCost(result, task, projectRoot);
  persistTaskModeResult(projectRoot, result);
  return result;
}

/**
 * Poll for the task-mode worker's `.result` file and enrich it the moment it
 * appears. Runs detached from `runTaskMode`'s returned promise (spawn is
 * fire-and-forget, so the `.result` is written well after `runTaskMode` already
 * resolved) — callers must NOT await this from `runTaskMode` itself. Bounded by
 * `timeoutMs` and `.unref()`'d so a task that never finishes (or a test that
 * never produces a `.result`) cannot leak a polling loop past process exit.
 */
async function watchAndEnrichTaskModeResult(
  projectRoot: string,
  task: Task,
  timeoutMs: number,
): Promise<void> {
  // Never let this best-effort background watcher surface an unhandled
  // rejection — callers invoke it fire-and-forget (`void watch...(...)`), so
  // any throw here (e.g. a test harness mocking 'node:fs' without
  // existsSync) would otherwise escape as an unhandled promise rejection.
  try {
    const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
    const POLL_MS = 500;
    const deadline = Date.now() + timeoutMs;
    while (!existsSync(resultPath)) {
      if (Date.now() >= deadline) return;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, POLL_MS);
        t.unref?.();
      });
    }
    enrichTaskModeResult(projectRoot, task);
  } catch (err) {
    debugLog('task-mode-runner:watchAndEnrichTaskModeResult', err);
  }
}

/**
 * Canonical application authority for one task across CLI, MCP, task-mode and
 * manual spawn. It does not publish task JSON itself: exact Docker publication
 * belongs to the private admission → RELEASED executor; legacy publication is
 * the same executor's explicit compatibility branch.
 */
export async function executeTaskIngress(
  input: TaskIngressExecutionInput,
): Promise<TaskIngressExecutionResult> {
  const { projectRoot, config, task } = input;
  const preRoutingProjection = inspectTaskArtifactsDeferred(projectRoot, [task]);
  const existingTaskProjectionContentDigest = preRoutingProjection.contentDigests[task.id];
  const executionIdentity = resolveExecutionModelIdentity(task.model, task.provider);
  if (!isModelExecutable(executionIdentity.model, executionIdentity.provider)) {
    throw new DeckentError(
      'MODEL_INACTIVE',
      `Model '${executionIdentity.model}' is not active for provider `
      + `'${executionIdentity.provider}' under the owner model policy`,
    );
  }
  task.model = executionIdentity.model;
  task.provider = executionIdentity.provider;
  const taskCreatedAt = task.createdAt ?? new Date().toISOString();
  task.createdAt = taskCreatedAt;
  const taskContentAtDeclaration = JSON.stringify(task, null, 2);
  const budgetPolicy = task.budgetPolicy ?? applyWorkerExecutionBudgetPolicy(
    [task],
    config.execution_budget,
    task.provider,
  )[0];
  const invocationCreatedAt = new Date().toISOString();
  const taskSnapshotOrigin = existingTaskProjectionContentDigest === undefined
    ? 'ephemeral-memory' as const
    : 'canonical-file' as const;
  const transport = input.transport ?? 'local-runtime';
  const executionBackend = declaredInvocationBackend(task, config);
  const runId = input.executionRunId ?? task.sprintId ?? task.id;
  const tenantId = input.executionTenantId
    ?? task.actor?.tenantId
    ?? resolveTenant(projectRoot).tenantId;
  const opened = (input.openTaskSettlementAuthority ?? openTaskSettlementAuthority)(projectRoot);
  let declaration: TaskExecutionDeclaration;
  try {
    declaration = opened.authority.declareTaskExecution({
      tenantId,
      projectId: opened.projectId,
      taskId: task.id,
      runId,
      provider: executionIdentity.provider,
      model: executionIdentity.model,
      executionBackend,
      transport,
      callId: input.invocationCallId ?? `task-ingress:${transport}:${randomUUID()}`,
      createdAt: invocationCreatedAt,
    });
  } catch (error) {
    opened.close();
    throw error;
  }

  let dispatchAttemptEntered = false;
  let dispatchStarted = false;
  let dispatchEvidenceRef: string | undefined;
  let dispatchStartedAt: string | undefined;
  let dispatchInvocation: TaskIngressInvocationAuthority | undefined;
  const settleKnownZeroWork = async (
    reasonCode: InvocationPreDispatchReasonCode,
    authorityEvidenceRefs: readonly string[] = [],
  ): Promise<TaskSettlementInspection> => opened.authority.settleNotDispatched({
    tenantId,
    projectId: opened.projectId,
    taskId: task.id,
    runId,
    executionBackend,
    rawStatus: String(task.status),
    taskContent: taskContentAtDeclaration,
    taskCreatedAt,
    taskSnapshotOrigin,
    receiptRef: declaration.receiptRef,
    reasonCode,
    ...(authorityEvidenceRefs.length > 0 ? { authorityEvidenceRefs } : {}),
    occurredAt: timestampNotBefore(invocationCreatedAt),
    apply: true,
  });

  try {
    if (budgetPolicy?.state === 'hold') {
      throw new DeckentError(
        'EXECUTION_BUDGET_HOLD',
        `EXECUTION_BUDGET_HOLD:${budgetPolicy.reasonCode}:${budgetPolicy.profileRef}`,
      );
    }

    const backend = config.spawn_backend
      ? SpawnBackendFactory.create({
          backend: config.spawn_backend,
          projectDir: projectRoot,
          dockerImage: config.docker_image,
          dockerTimeoutSeconds: config.docker_timeout,
          dockerMemoryLimit: config.worker_memory_limit,
          dockerHomeTmpfsSize: config.worker_home_tmpfs_size,
          dockerMemorySwap: config.worker_memory_swap,
          dockerKindMemoryLimits: config.worker_memory_limit_by_kind,
        })
      : undefined;
    const registry = createExactNormalDockerExecutionRegistry(projectRoot);
    const taskTimeoutSeconds = Math.max(1, Math.ceil(input.timeoutMs / 1_000));
    const disposition = await executeSpawnTask(
      {
        task,
        taskTimeoutSeconds,
        ...(existingTaskProjectionContentDigest !== undefined
          ? { existingTaskProjectionContentDigest }
          : {}),
      },
      {
        projectRoot,
        sprintFallbackId: runId,
        config,
        spawnOpts: {
          autoApprove: input.autoApprove ?? false,
          ...(backend ? { spawnBackend: backend } : {}),
          ...(input.attendedExecutionApprovalAuthority
            ? { attendedExecutionApprovalAuthority: input.attendedExecutionApprovalAuthority }
            : {}),
          ...(input.providerAuthority ? { providerAuthority: input.providerAuthority } : {}),
        },
        backend,
        routeTask: async (candidate) => {
          if ((config.routing_engine ?? 'v3') !== 'v3') return;
          const { routeSingleTaskV3, mergeForcePreservingSkillIds } =
            await import('./routing-plan-adapter.js');
          const routed = await routeSingleTaskV3(candidate, projectRoot);
          candidate.assignedAgent = routed.agentId;
          candidate.assignedSkills = mergeForcePreservingSkillIds(candidate, routed.skillIds);
        },
        resolveAgentPrompt,
        resolveSkillPrompts,
        buildWriteTargets: candidate => deriveWorkerWriteTargets(candidate.scope),
        exactDockerRegistry: registry,
        onDispatchAttemptBoundary: ({ taskId, backend: attemptedBackend }) => {
          if (taskId !== task.id || dispatchAttemptEntered) {
            throw new DeckentError(
              'TASK_INGRESS_DISPATCH_ATTEMPT_BOUNDARY_MISMATCH',
              `TASK_INGRESS_DISPATCH_ATTEMPT_BOUNDARY_MISMATCH:${task.id}`,
            );
          }
          const actualBackend = normalizeInvocationBackend(attemptedBackend);
          if (executionBackend !== 'unknown' && actualBackend !== executionBackend) {
            throw new DeckentError(
              'TASK_INGRESS_DISPATCH_BACKEND_MISMATCH',
              `TASK_INGRESS_DISPATCH_BACKEND_MISMATCH:${executionBackend}:${actualBackend}`,
            );
          }
          dispatchAttemptEntered = true;
        },
        onDispatchBoundary: async (boundary) => {
          if (boundary.taskId !== task.id || dispatchStarted || !dispatchAttemptEntered) {
            throw new DeckentError(
              'TASK_INGRESS_DISPATCH_BOUNDARY_MISMATCH',
              `TASK_INGRESS_DISPATCH_BOUNDARY_MISMATCH:${task.id}`,
            );
          }
          const actualBackend = normalizeInvocationBackend(boundary.backend);
          if (executionBackend !== 'unknown' && actualBackend !== executionBackend) {
            throw new DeckentError(
              'TASK_INGRESS_DISPATCH_BACKEND_MISMATCH',
              `TASK_INGRESS_DISPATCH_BACKEND_MISMATCH:${executionBackend}:${actualBackend}`,
            );
          }
          dispatchStartedAt = timestampNotBefore(invocationCreatedAt);
          opened.authority.markDispatchStarted({
            tenantId,
            projectId: opened.projectId,
            invocationId: declaration.receiptRef.invocationId,
            attempt: 1,
            executionEvidenceRef: boundary.executionEvidenceRef,
            calledProvider: boundary.provider,
            calledModel: boundary.model,
            occurredAt: dispatchStartedAt,
          });
          dispatchEvidenceRef = boundary.executionEvidenceRef;
          dispatchStarted = true;
          dispatchInvocation = {
            receiptRef: declaration.receiptRef,
            executionBackend: actualBackend,
            transport,
            state: 'dispatch-started',
            executionMode: registry.isExactTask(task.id)
              ? 'normal-docker-exact'
              : 'legacy-non-docker',
            executionEvidenceRef: boundary.executionEvidenceRef,
            dispatchStartedAt,
          };
          await input.onDispatchBoundary?.(boundary, dispatchInvocation);
        },
      },
    );
    if (disposition.kind !== 'spawned') {
      const exactOutcome = disposition.kind === 'not-dispatched'
        || disposition.kind === 'ambiguous'
        ? disposition.exactDispatchOutcome
        : undefined;
      const authorityEvidenceRefs = exactOutcome?.kind === 'not-dispatched'
        ? Object.freeze([
            exactOutcome.zeroWorkReceipt.ref,
            exactOutcome.zeroWorkReceipt.digest,
          ])
        : exactOutcome?.kind === 'ambiguous'
          ? Object.freeze([
              exactOutcome.reconciliationReceipt.ref,
              exactOutcome.reconciliationReceipt.digest,
            ])
          : Object.freeze([] as string[]);
      const settlement = disposition.kind === 'ambiguous' || dispatchStarted
        ? undefined
        : await settleKnownZeroWork(
            dispositionPreDispatchReason(disposition),
            authorityEvidenceRefs,
          );
      const executionMode = disposition.executionMode;
      const executionEvidenceRef = exactOutcome?.kind === 'not-dispatched'
        ? exactOutcome.zeroWorkReceipt.ref
        : exactOutcome?.kind === 'ambiguous'
          ? exactOutcome.reconciliationReceipt.ref
          : undefined;
      return {
        disposition,
        executionMode,
        backend: disposition.executionBackend,
        provider: String(task.provider ?? 'unknown'),
        invocation: {
          receiptRef: declaration.receiptRef,
          executionBackend,
          transport,
          state: settlement?.effectiveStatus === 'NOT_DISPATCHED'
            ? 'not-dispatched'
            : 'reconciliation-required',
          executionMode,
          ...(executionEvidenceRef ? { executionEvidenceRef } : {}),
          ...(authorityEvidenceRefs.length > 0 ? { authorityEvidenceRefs } : {}),
          ...('reasonCode' in disposition && typeof disposition.reasonCode === 'string'
            ? { reasonCode: disposition.reasonCode }
            : {}),
          ...(settlement ? { settlement } : {}),
        },
      };
    }
    if (!dispatchStarted || !dispatchEvidenceRef) {
      throw new DeckentError(
        'TASK_INGRESS_DISPATCH_BOUNDARY_MISSING',
        `TASK_INGRESS_DISPATCH_BOUNDARY_MISSING:${task.id}`,
      );
    }
    const executionMode = disposition.executionMode;
    const invocation = dispatchInvocation ?? {
      receiptRef: declaration.receiptRef,
      executionBackend,
      transport,
      state: 'dispatch-started' as const,
      executionMode,
      executionEvidenceRef: dispatchEvidenceRef,
      ...(dispatchStartedAt ? { dispatchStartedAt } : {}),
    };
    if (executionMode === 'normal-docker-exact') {
      const resultAuthority = await registry.awaitTaskResultAuthority(task.id);
      return {
        disposition,
        executionMode,
        backend: disposition.executionBackend,
        provider: disposition.provider ?? String(task.provider ?? 'unknown'),
        resultAuthority,
        invocation,
      };
    }
    return {
      disposition,
      executionMode,
      backend: disposition.executionBackend,
      provider: disposition.provider ?? String(task.provider ?? 'unknown'),
      invocation,
    };
  } catch (error) {
    const reasonCode = taskIngressCauseCode(error);
    let invocation: TaskIngressInvocationAuthority;
    let settlementFailure: string | undefined;
    if (!dispatchAttemptEntered && !dispatchStarted) {
      let settlement: TaskSettlementInspection | undefined;
      try {
        settlement = await settleKnownZeroWork(
          preDispatchReason(error),
          preDispatchEvidenceRefs(error),
        );
      } catch (settlementError) {
        settlementFailure = taskIngressCauseCode(settlementError);
        debugLog('task-mode-runner:settleKnownZeroWork', settlementError);
      }
      invocation = {
        receiptRef: declaration.receiptRef,
        executionBackend,
        transport,
        state: settlement?.effectiveStatus === 'NOT_DISPATCHED'
          ? 'not-dispatched'
          : 'reconciliation-required',
        executionMode: executionBackend === 'docker'
          ? 'normal-docker-exact'
          : 'legacy-non-docker',
        ...(preDispatchEvidenceRefs(error).length > 0
          ? { authorityEvidenceRefs: preDispatchEvidenceRefs(error) }
          : {}),
        reasonCode,
        ...(settlement ? { settlement } : {}),
      };
    } else {
      invocation = {
        ...(dispatchInvocation ?? {
          receiptRef: declaration.receiptRef,
          executionBackend,
          transport,
          executionMode: executionBackend === 'docker'
            ? 'normal-docker-exact' as const
            : 'legacy-non-docker' as const,
        }),
        state: 'reconciliation-required',
        reasonCode,
      };
    }
    throw attachTaskIngressErrorAuthority(error, {
      schemaVersion: 1,
      reasonCode,
      invocation,
      ...(settlementFailure ? { settlementFailure } : {}),
    });
  } finally {
    opened.close();
  }
}

// ─── Runner ─────────────────────────────────────────────────────────

/**
 * Execute a single task in task mode — bypasses the full sprint lifecycle.
 *
 * Flow:
 * 1. Validate task mode config
 * 2. Build task JSON from description
 * 3. Emit TASK_MODE_START event
 * 4. Spawn worker via multi-provider backend
 * 5. Return task ID + backend info
 */
export async function runTaskMode(
  ctx: TaskModeContext,
  config: ResolvedConfig,
): Promise<TaskModeResult> {
  assertTaskMode(config);

  const projectRoot = ctx.projectRoot ?? process.cwd();
  const scopeDir = ctx.scope?.directories?.[0] ?? '.';

  // 454-003: resolve + validate the model through the canonical registry
  // BEFORE any Task JSON write or spawn — same boundary CLI `deckent run` /
  // MCP `deckent_run` enforce (453-001). An omitted ctx.model resolves from
  // config's canonical default-model resolver (never a literal alias like
  // 'sonnet'); a legacy alias, an unknown ID without a provider, or a
  // provider/model mismatch all throw here (fail-before-disk/spawn).
  const requestedModel = ctx.model ?? resolveDefaultModel(config);
  const identity = resolveExecutionModelIdentity(requestedModel, ctx.provider);
  const model = identity.model;

  // OWNER-MODEL-POLICY-001: refuse an INACTIVE model at the pre-dispatch admission
  // boundary — before any Task JSON write, prompt, routing or provider/backend
  // spawn. Catches both a resolved default and an explicit ctx.model (the
  // resume / replay / autonomous / run / do paths) that names a model the owner
  // has not activated under an explicit-active provider. Typed HOLD; nothing
  // starts. Inert when no owner policy is injected (implicit-active default).
  if (!isModelExecutable(model, identity.provider)) {
    throw new DeckentError(
      'MODEL_INACTIVE',
      `Model '${model}' is not active for provider '${identity.provider}' under the owner `
      + 'model policy (explicit-active); activate it or select an active model before dispatch',
    );
  }

  // Build task — WM-1: unify on the canonical ExecutionRequest contract (sets
  // task.type, resolves provider via config, tags origin='autonomous').
  const taskId = createTaskIngressTaskId();
  const execReq = buildExecutionRequest({
    description: ctx.description,
    model,
    provider: identity.provider,
    scope: { directories: [scopeDir] },
    projectRoot,
    config,
    autoApprove: ctx.autoApprove ?? false,
    origin: 'autonomous',
    budget: ctx.budget,
  });
  const task = resolveToTask(execReq, taskId);

  const execution = await executeTaskIngress({
    projectRoot,
    config,
    task,
    timeoutMs: ctx.timeoutMs ?? 300_000,
    autoApprove: ctx.autoApprove ?? false,
    ...(ctx.attendedExecutionApprovalAuthority
      ? { attendedExecutionApprovalAuthority: ctx.attendedExecutionApprovalAuthority }
      : {}),
    ...(ctx.providerAuthority ? { providerAuthority: ctx.providerAuthority } : {}),
    ...(ctx.executionRunId ? { executionRunId: ctx.executionRunId } : {}),
    ...(ctx.executionTenantId ? { executionTenantId: ctx.executionTenantId } : {}),
    transport: 'local-runtime',
    onDispatchBoundary: (_boundary, invocation) => {
      try {
        eventBus.emit('deckent-event', {
          type: 'TASK_MODE_START',
          taskId,
          style: 'task',
          description: ctx.description,
          model,
          invocationId: invocation.receiptRef.invocationId,
          timestamp: invocation.dispatchStartedAt ?? new Date().toISOString(),
        });
      } catch {
        // Observation failure cannot rewrite dispatch truth.
      }
    },
  });
  if (execution.disposition.kind !== 'spawned') {
    throw new TaskIngressDispositionError(execution);
  }

  // TOK-AUT (357-013): spawn above is fire-and-forget — the worker writes its
  // .result well after this function has already returned. Enrich it in the
  // background (real tokenUsage/cost via result-collector.ts, mirroring the
  // sprint path) so the on-disk .result isn't left at the worker's honest
  // 0/0/0 stub forever. Not awaited — must not delay runTaskMode's return.
  const settlementRef = execution.disposition.legacySettlementRef;
  if (execution.executionMode === 'legacy-non-docker' && !settlementRef) {
    void watchAndEnrichTaskModeResult(projectRoot, task, ctx.timeoutMs ?? 300_000);
  }

  return {
    taskId,
    backend: execution.backend,
    provider: execution.provider,
    projectRoot,
    executionMode: execution.executionMode,
    invocation: execution.invocation,
    ...(settlementRef ? { settlementRef } : {}),
    ...(execution.resultAuthority ? { resultAuthority: execution.resultAuthority } : {}),
  };
}
