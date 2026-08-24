import { existsSync, statSync, writeFileSync, watch as fsWatch } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type {
  Task,
  ModelType,
  ProviderName,
  TaskResult,
  TaskExecutionBudgetPolicySnapshot,
} from '../../core/types.js';
import { readTask } from '../../agents/worker.js';
import { ensureSession, spawnWorker } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { DeckentError } from '../../core/errors.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { TaskStatus, getProviderForModel } from '../../core/task-types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { readJsonSafe, debugLog } from '../../core/utils.js';
import { buildWorkerPrompt } from '../../orchestra/task-builder.js';
import { resolveAgentPrompt, resolveSkillPrompts } from '../../orchestra/sprint-controller.js';
import { SpawnBackendError, SpawnBackendFactory, type HostTerminalResultContractV1 } from '../../orchestra/spawn-backend.js';
import { isAdapterProvider, getProviderAdapterForTask } from '../../orchestra/sprint-utils.js';
import { getProviderCommandSpec } from '../../core/provider-command-spec.js';
import type { FinalOnlyUsageAuthorization } from '../../core/execution-budget-policy.js';
import {
  FinalOnlyUsageContainmentHoldError,
  requireFinalOnlyUsageContainment,
} from '../../core/final-only-usage-containment.js';
import { ensureOllamaModelRegistered } from '../../core/model-registry.js';
import { registerOpenRouterModelFromCache } from '../../core/openrouter-models.js';
import { resolveReasoningEffort } from '../../core/reasoning-effort.js';
import { normalizeTaskResultShape } from '../../core/task-result-schema.js';
import type { ExecutionBudget } from '../../core/work-model.js';
import {
  assertExecutionBudgetShape,
  assertExecutionLandingSupport,
  assertLiveUsageBudgetSupport,
} from '../../core/live-execution-budget.js';
import type { ExecutionLandingPolicyConfig } from '../../core/config-types.js';
import type { ExecutionAdmissionMode } from '../../core/execution-admission.js';
import {
  attendedExecutionProjectId,
  type AttendedExecutionApprovalAuthority,
  type AttendedExecutionApprovalExpectedDispatch,
} from '../../core/attended-execution-approval.js';
import {
  assertAttendedExecutionProposalMaterial,
  createAttendedExecutionProposalMaterialFromTask,
  type AttendedExecutionProposalMaterial,
  type AttendedExecutionProposalReference,
} from '../../core/attended-execution-proposal.js';
import { resolveHostExecutionBudget } from '../../orchestra/runtime-budget-monitor.js';
import { resolveProviderExecutionCostClass } from '../../core/provider-execution-profile.js';
import {
  createTaskResultSettlementRef,
  createTaskResultSettlementRefForAttempt,
  writeTaskResultSettlementAttemptAtomic,
  type TaskResultSettlementRefV1,
} from '../../core/task-result-settlement.js';
import {
  ExecutionLockError,
  withExecutionLock,
} from '../../core/file-lock.js';
import { openTaskSettlementProjection } from '../../core/task-settlement-authority.js';
import { resolveTenant } from '../../core/tenant-context.js';
import { finalizeTaskStatusFromSettlement } from '../../orchestra/task-settlement-projection.js';

export { finalizeTaskStatusFromSettlement } from '../../orchestra/task-settlement-projection.js';

/**
 * Build a comma-separated allowedTools string from a task's scope.
 * Returns the standard tool set (Read, Write, Edit, Bash, Glob, Grep) when the
 * task has any scoped directories or write-files. Returns undefined when the
 * scope is completely unrestricted (no dirs, no write-files) so the worker
 * retains full tool access.
 */
export function buildAllowedToolsFromScope(task: Task): string | undefined {
  const hasDirs = task.scope.directories.length > 0;
  const hasFiles = task.scope.filesWrite.length > 0;
  if (!hasDirs && !hasFiles) return undefined;
  return 'Read,Write,Edit,Bash,Glob,Grep';
}

/**
 * Last fail-closed boundary before a provider process/container is created.
 * Callers persist their dispatch authority here; throwing aborts the spawn.
 */
export interface WorkerDispatchBoundary {
  readonly taskId: string;
  readonly provider: ProviderName;
  readonly model: string;
  readonly backend: string;
  readonly executionEvidenceRef: string;
  readonly settlementRef?: TaskResultSettlementRefV1;
}

export type WorkerExecutionRoute =
  | 'host-adapter'
  | 'docker'
  | 'tmux'
  | 'subprocess'
  | 'unknown';

export type TaskExecutionFenceActor = 'dispatch' | 'settlement';

/**
 * Serialize the final dispatch boundary against legacy task reconciliation.
 * The dedicated leased execution-lock namespace is isolated from worker and
 * spawn cleanup, while its unique owner prevents same-task re-entry.
 */
export async function withTaskExecutionFence<T>(
  projectRoot: string,
  taskId: string,
  actor: TaskExecutionFenceActor,
  operation: () => Promise<T> | T,
): Promise<T> {
  try {
    return await withExecutionLock(
      projectRoot,
      taskId,
      actor,
      () => operation(),
    );
  } catch (error) {
    if (error instanceof ExecutionLockError) {
      throw new Error(getMessage(
        'task.execution_fence_conflict',
        getLanguage(undefined),
        { taskId },
      ));
    }
    throw error;
  }
}

export interface SpawnWorkerMultiProviderOptions {
  autoApprove?: boolean;
  allowedTools?: string;
  availableTools?: string;
  isolatedContext?: boolean;
  spawnBackend?: string;
  dockerImage?: string;
  dockerTimeout?: number;
  provider?: string;
  modelEffort?: string;
  executionBudget?: ExecutionBudget;
  executionLandingPolicy?: ExecutionLandingPolicyConfig;
  executionBudgetProfileRef?: string;
  executionBudgetPolicyDigest?: string;
  executionAdmissionMode?: ExecutionAdmissionMode;
  executionApprovalEvidenceRef?: string;
  executionApprovalProposal?: AttendedExecutionProposalReference;
  executionApprovalMaterial?: AttendedExecutionProposalMaterial;
  attendedExecutionApprovalAuthority?: AttendedExecutionApprovalAuthority;
  executionTenantId?: string;
  executionRunId?: string;
  /** Exact open invocation permitted to cross the dispatch boundary. */
  executionInvocationId?: string;
  hostTerminalResultContract?: HostTerminalResultContractV1;
  /** Non-task ingress grant (for example XVerify); task surfaces use the canonical snapshot below. */
  finalOnlyUsageContainment?: FinalOnlyUsageAuthorization;
  /** Presence marks a task ingress; null is an explicit missing-snapshot fail-closed input. */
  taskBudgetPolicy?: Readonly<TaskExecutionBudgetPolicySnapshot> | null;
  /** Persist dispatch authority immediately before the first external spawn side effect. */
  onDispatchBoundary?: (boundary: WorkerDispatchBoundary) => void | Promise<void>;
}

/**
 * Side-effect-free mirror of the live branch order below. Read-only settlement
 * surfaces consume this same resolver instead of guessing which backend a task
 * would have reached.
 */
export function resolveWorkerExecutionRoute(
  provider: ProviderName,
  input: {
    readonly spawnBackend?: string;
    readonly requiresImmutableSettlement?: boolean;
    readonly platform?: NodeJS.Platform;
  } = {},
): WorkerExecutionRoute {
  const requiresImmutableSettlement = input.requiresImmutableSettlement === true;
  const adapter = isAdapterProvider(provider);
  const containerRoutableAdapter = input.spawnBackend !== undefined
    && getProviderCommandSpec(provider) !== null;
  if (adapter && !requiresImmutableSettlement) return 'host-adapter';
  if (adapter && requiresImmutableSettlement && !containerRoutableAdapter) return 'unknown';
  if (input.spawnBackend) {
    if (input.spawnBackend === 'auto') {
      return (input.platform ?? process.platform) === 'win32' ? 'subprocess' : 'docker';
    }
    return input.spawnBackend === 'docker'
      || input.spawnBackend === 'tmux'
      || input.spawnBackend === 'subprocess'
      ? input.spawnBackend
      : 'unknown';
  }
  return provider === 'claude' ? 'tmux' : 'subprocess';
}

/**
 * Spawn a worker using the appropriate backend.
 *
 * Backend selection priority:
 * 0. Host-HTTP adapter providers (e.g. ollama) → host adapter spawn (BEFORE any config backend)
 * 1. config.spawn_backend (user preference — docker/tmux/subprocess/auto)
 * 2. Provider-based fallback: Claude → tmux, Codex/Gemini → subprocess
 *
 * Async because ollama's refreshSupportedModels() must resolve before spawn()
 * is called (dynamicModelsCache must be populated for isSupportedModel to accept
 * custom tags like qwen3.6:27b). Mirrors sprint-spawner.ts's adapterRouted logic.
 * ADR-066/077/027 — autonomous↔ollama execution gap fix, 2026-06-08.
 */
export async function spawnWorkerMultiProvider(
  taskId: string,
  model: string,
  prompt: string,
  root: string,
  opts: SpawnWorkerMultiProviderOptions,
): Promise<{ backend: string; provider: ProviderName; settlementRef?: TaskResultSettlementRefV1 }> {
  // Leadership-free ingress recovery shared by run/do/autonomous/task-mode.
  // It can close only dispatched attempts whose exact Docker container is
  // authoritatively absent; it never adopts/stops live containers, resumes
  // continuations, or touches prepare-without-dispatch races.
  const recoveryBackend = SpawnBackendFactory.create({
    backend: 'docker',
    projectDir: root,
    dockerImage: opts.dockerImage,
    dockerTimeoutSeconds: opts.dockerTimeout,
  });
  await recoveryBackend.reconcilePendingAttempts?.({ mode: 'terminal-only' });

  return withTaskExecutionFence(root, taskId, 'dispatch', () => {
    assertTaskDispatchSettlementOpen(
      root,
      taskId,
      opts.executionTenantId ?? 'local',
      opts.executionInvocationId,
    );
    return spawnWorkerMultiProviderUnderFence(taskId, model, prompt, root, opts);
  });
}

function assertTaskDispatchSettlementOpen(
  projectRoot: string,
  taskId: string,
  tenantId: string,
  executionInvocationId?: string,
): void {
  const taskPath = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  let rawStatus = 'UNKNOWN';
  if (existsSync(taskPath)) {
    const task = readJsonSafe<{ id?: unknown; status?: unknown }>(taskPath);
    if (task?.id !== taskId || typeof task.status !== 'string') {
      throw new DeckentError(
        'E_TASK_EXECUTION_SNAPSHOT_INVALID',
        getMessage('task.execution_snapshot_invalid', getLanguage(undefined), { taskId }),
      );
    }
    rawStatus = task.status;
  }
  const opened = openTaskSettlementProjection(projectRoot);
  try {
    const projection = opened.projectTaskExecutionState(taskId, rawStatus, tenantId);
    if (projection.effectiveStatus === 'NOT_DISPATCHED') {
      throw new DeckentError(
        'E_TASK_EXECUTION_ALREADY_SETTLED',
        getMessage('task.execution_already_settled', getLanguage(undefined), { taskId }),
      );
    }
    const ownsOpenReceipt = projection.reasonCode === 'open-receipt'
      && projection.receiptRef?.invocationId === executionInvocationId;
    if (
      projection.reasonCode === 'ambiguous-receipts'
      || (projection.reasonCode === 'open-receipt' && !ownsOpenReceipt)
      || projection.reasonCode === 'projected'
    ) {
      throw new DeckentError(
        'E_TASK_EXECUTION_AUTHORITY_CONFLICT',
        getMessage('task.execution_authority_conflict', getLanguage(undefined), {
          taskId,
          reasonCode: projection.reasonCode,
        }),
      );
    }
  } finally {
    opened.close();
  }
}

async function spawnWorkerMultiProviderUnderFence(
  taskId: string,
  model: string,
  prompt: string,
  root: string,
  opts: SpawnWorkerMultiProviderOptions,
): Promise<{ backend: string; provider: ProviderName; settlementRef?: TaskResultSettlementRefV1 }> {
  const executionBudget = resolveHostExecutionBudget(root, taskId, opts.executionBudget);

  const attendedExpectedDispatch = (
    provider: string,
    backend: string,
  ): AttendedExecutionApprovalExpectedDispatch | undefined => {
    if (!executionBudget
      || !opts.executionLandingPolicy
      || !opts.executionBudgetProfileRef
      || !opts.executionBudgetPolicyDigest
      || !opts.executionApprovalProposal
      || !opts.executionApprovalMaterial) {
      return undefined;
    }
    assertAttendedExecutionProposalMaterial(
      opts.executionApprovalMaterial,
      opts.executionApprovalProposal,
    );
    return {
      ...opts.executionApprovalProposal,
      tenantId: opts.executionTenantId ?? 'local',
      projectId: attendedExecutionProjectId(root),
      runId: opts.executionRunId ?? taskId,
      taskId,
      provider,
      model,
      backend,
      budget: executionBudget,
      policy: {
        profileRef: opts.executionBudgetProfileRef,
        policyDigest: opts.executionBudgetPolicyDigest,
        landing: opts.executionLandingPolicy,
      },
    };
  };

  // Resolve provider from registry. Dynamic ollama tags (e.g. qwen3.6:27b) are not in
  // the static registry at process start — the sprint path calls ensureOllamaModelRegistered
  // at plan-time, but the autonomous kind=task path and deckent run do not. When the caller
  // passes opts.provider='ollama' (autonomous dispatcher forwards entry.provider), pre-register
  // the tag before getProviderForModel so it resolves to 'ollama' instead of throwing
  // UnknownModelError. Only ollama tags auto-register here; genuinely-unknown cloud models
  // still throw (real-bug signal preserved).
  if (opts.provider === 'ollama') {
    ensureOllamaModelRegistered(model);
  }
  // OPENROUTER-PROVIDER (row 477): same on-demand registration contract as the
  // ollama branch above — OpenRouter ids are catalog-driven, never in the static
  // registry, so `getProviderForModel` below would throw UnknownModelError first.
  // Shared seam with run.ts/MCP-run/autonomous (`registerOpenRouterModelFromCache`):
  // registers from the VERIFIED probe cache only. Cache miss → no registration →
  // downstream lookup fails honestly; an unprobed model must never be silently
  // priced as free (remedy: `deckent openrouter-probe`).
  if (opts.provider === 'openrouter') {
    registerOpenRouterModelFromCache(root, model);
  }
  const provider = getProviderForModel(model as ModelType);
  const registeredAdapter = getProviderAdapterForTask(provider);
  // Admission happens before provider bootstrap/session/backend creation. A
  // budgetless remote one-shot must produce exactly zero external side effects.
  assertExecutionBudgetShape(
    executionBudget,
    provider,
    resolveProviderExecutionCostClass(provider, registeredAdapter?.executionCostClass),
  );

  // F1-RE (268-003): resolve the model reasoning-effort ONCE for the resolved
  // provider — same SSOT + opt-in semantics as the sprint path
  // (sprint-spawner.ts:511). Invalid/unsupported level → undefined → no flag
  // emitted (CLI default kept). Previously the manual paths (deckent spawn /
  // deckent run) silently dropped task.modelEffort.
  const reasoningEffort = resolveReasoningEffort(provider, opts.modelEffort);

  const providerCommand = getProviderCommandSpec(provider);
  // Resolve the configured backend before routing an adapter: a final-only
  // provider with a live ceiling is allowed only through Docker containment.
  const configuredBackend = opts.taskBudgetPolicy !== undefined && opts.spawnBackend
    ? SpawnBackendFactory.create({
      backend: opts.spawnBackend as 'docker' | 'tmux' | 'subprocess' | 'auto',
      projectDir: root,
      dockerImage: opts.dockerImage,
      dockerTimeoutSeconds: opts.dockerTimeout,
    })
    : undefined;
  const taskFinalOnlyUsageContainment = opts.taskBudgetPolicy !== undefined
    ? requireFinalOnlyUsageContainment({
      role: 'worker',
      provider,
      providerCommand,
      executor: configuredBackend?.name === 'docker'
        ? { executor: 'docker', finalOnlyUsageContainment: 'wall-clock' }
        : undefined,
      budget: executionBudget,
      budgetPolicy: opts.taskBudgetPolicy,
    })
    : undefined;
  const finalOnlyUsageContainment = taskFinalOnlyUsageContainment
    ?? opts.finalOnlyUsageContainment;
  const requiresFinalOnlyContainment = taskFinalOnlyUsageContainment !== undefined;

  // Host-HTTP adapter providers (e.g. ollama) run via their host adapter
  // (agentic-worker-entry on localhost:11434), NOT a docker/tmux/subprocess backend —
  // even when config.spawn_backend is set. Mirrors sprint-spawner.ts's adapterRouted
  // routing so `deckent run` + the autonomous engine's kind=task path reach the
  // ollama worker correctly.
  //
  // refreshSupportedModels() is awaited (not fire-and-forget) because OllamaAdapter.spawn()
  // calls isSupportedModel() synchronously — dynamicModelsCache must be populated before
  // spawn() is invoked, otherwise custom tags (qwen3.6:27b) that are not in the static
  // catalog are rejected with ProviderError. The race is deterministic: without await,
  // spawn() executes in the same tick as the unresolved refresh promise.
  //
  // XVERIFY-CODEX: a host terminal result protocol requires immutable settlement,
  // which the host adapter cannot produce. An adapter provider that ALSO owns a
  // container command spec (codex, gemini) is therefore routed to the configured
  // settlement-capable backend instead of its host adapter — the same route the
  // Docker backend already resolves a binary for. Host-only providers (ollama,
  // openrouter) have no container binary authority (`getProviderCommandSpec` →
  // null) and keep failing honestly here, before any provider work.
  const containerRoutableAdapter = opts.spawnBackend !== undefined
    && providerCommand !== null;
  if (isAdapterProvider(provider) && opts.hostTerminalResultContract && !containerRoutableAdapter) {
    throw new SpawnBackendError(
      `Host terminal result protocol ${opts.hostTerminalResultContract.protocol} requires an immutable-settlement backend; host-adapter does not provide one.`,
      'host-adapter',
    );
  }
  if (isAdapterProvider(provider) && !opts.hostTerminalResultContract && !requiresFinalOnlyContainment) {
    let adapter = getProviderAdapterForTask(provider);
    // OPENROUTER-PROVIDER (row 477): lazy re-bootstrap, mirroring
    // sprint-spawner.ts's `wantsHostAdapter && !adapterRouted` recovery. Unlike the
    // sprint path, `deckent run` / autonomous kind=task never call
    // `bootstrapProviders` at all, so the registry is EMPTY here and every
    // host-adapter provider silently fell through to the docker backend — which
    // then honest-fails ("no ProviderCommandSpec"). Registering on demand is what
    // makes `--provider openrouter` (and `--provider ollama`) actually reach its
    // adapter from this entry point. Idempotent + best-effort: on fault we keep
    // null and fall through to the pre-existing backend path.
    if (!adapter) {
      try {
        const { bootstrapProviders } = await import('../../core/provider.js');
        const cfg = await loadConfig(root);
        await bootstrapProviders(cfg, root);
        adapter = getProviderAdapterForTask(provider);
      } catch {
        // keep null — fall through to the backend path below
      }
    }
    if (adapter) {
      assertLiveUsageBudgetSupport(
        executionBudget,
        adapter.liveUsageBudgetSupport,
        adapter.name,
        resolveProviderExecutionCostClass(provider, adapter.executionCostClass),
      );
      const refresh = (adapter as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
      if (typeof refresh === 'function') {
        await refresh.call(adapter);
      }
      assertExecutionLandingSupport({
        budget: executionBudget,
        policy: opts.executionLandingPolicy,
        mode: opts.executionAdmissionMode,
        capability: adapter.executionLandingCapability,
        executor: adapter.name,
        approvalEvidenceRef: opts.executionApprovalEvidenceRef,
        approvalAuthority: opts.attendedExecutionApprovalAuthority,
        approvalExpectedDispatch: attendedExpectedDispatch(provider, 'host-adapter'),
        executionCostClass: resolveProviderExecutionCostClass(provider, adapter.executionCostClass),
      });
      await opts.onDispatchBoundary?.({
        taskId,
        provider,
        model,
        backend: 'host-adapter',
        executionEvidenceRef: `worker-dispatch-boundary:host-adapter:${taskId}`,
      });
      adapter.spawn(taskId, model as ModelType, prompt, {
        allowedTools: opts.allowedTools,
        autoApprove: opts.autoApprove ?? false,
        projectDir: root,
        reasoningEffort,
        executionBudget,
        executionLandingPolicy: opts.executionLandingPolicy,
        executionAdmissionMode: opts.executionAdmissionMode,
        executionApprovalEvidenceRef: opts.executionApprovalEvidenceRef,
      });
      return { backend: 'host-adapter', provider };
    }
    // No adapter registered for this provider — fall through to config-backend path
  }

  // If config specifies a backend, use SpawnBackendFactory for all providers
  if (opts.spawnBackend) {
    const backend = configuredBackend ?? SpawnBackendFactory.create({
      backend: opts.spawnBackend as 'docker' | 'tmux' | 'subprocess' | 'auto',
      projectDir: root,
      dockerImage: opts.dockerImage,
      dockerTimeoutSeconds: opts.dockerTimeout,
    });
    if (opts.hostTerminalResultContract && backend.name !== 'docker') {
      throw new SpawnBackendError(
        `Host terminal result protocol ${opts.hostTerminalResultContract.protocol} requires Docker settlement; resolved backend was ${backend.name}.`,
        backend.name,
      );
    }
    assertLiveUsageBudgetSupport(
      executionBudget,
      backend.liveUsageBudgetSupport,
      backend.name,
    );
    const approvalGrant = assertExecutionLandingSupport({
      budget: executionBudget,
      policy: opts.executionLandingPolicy,
      mode: opts.executionAdmissionMode,
      capability: backend.executionLandingCapability,
      executor: backend.name,
      approvalEvidenceRef: opts.executionApprovalEvidenceRef,
      approvalAuthority: opts.attendedExecutionApprovalAuthority,
      approvalExpectedDispatch: attendedExpectedDispatch(provider, backend.name),
    });
    const settlementRef = backend.name === 'docker'
      ? approvalGrant
        ? createTaskResultSettlementRefForAttempt(
          root,
          taskId,
          approvalGrant.receipt.binding.attemptId,
        )
        : createTaskResultSettlementRef(root, taskId)
      : undefined;
    await opts.onDispatchBoundary?.({
      taskId,
      provider,
      model,
      backend: backend.name,
      executionEvidenceRef: settlementRef
        ? `task-result-settlement-attempt:${settlementRef.attemptId}`
        : `worker-dispatch-boundary:${backend.name}:${taskId}`,
      ...(settlementRef ? { settlementRef } : {}),
    });
    if (settlementRef) {
      // The invocation dispatch receipt is the final authority boundary. Only
      // after it succeeds may the backend attempt become durable; therefore a
      // rejected callback leaves neither a provider process nor a false pending
      // backend-attempt artifact that would block NOT_DISPATCHED settlement.
      writeTaskResultSettlementAttemptAtomic(settlementRef);
    }
    backend.spawn(taskId, model as ModelType, prompt, {
      autoApprove: opts.autoApprove ?? false,
      projectDir: root,
      allowedTools: opts.allowedTools,
      availableTools: opts.availableTools,
      isolatedContext: opts.isolatedContext,
      reasoningEffort,
      executionBudget,
      executionLandingPolicy: opts.executionLandingPolicy,
      executionAdmissionMode: opts.executionAdmissionMode,
      executionApprovalEvidenceRef: opts.executionApprovalEvidenceRef,
      executionApprovalGrant: approvalGrant,
      executionApprovalExpectedDispatch: attendedExpectedDispatch(provider, backend.name),
      settlementRef,
      hostTerminalResultContract: opts.hostTerminalResultContract,
      finalOnlyUsageContainment,
    });
    return {
      backend: backend.name,
      provider,
      ...(settlementRef ? { settlementRef } : {}),
    };
  }

  // No config override → provider-based fallback
  if (opts.hostTerminalResultContract) {
    throw new SpawnBackendError(
      `Host terminal result protocol ${opts.hostTerminalResultContract.protocol} requires an explicit immutable-settlement backend.`,
      provider === 'claude' ? 'tmux' : 'subprocess',
    );
  }
  if (provider === 'claude') {
    assertLiveUsageBudgetSupport(executionBudget, undefined, 'tmux');
    assertExecutionLandingSupport({
      budget: executionBudget,
      policy: opts.executionLandingPolicy,
      mode: opts.executionAdmissionMode,
      capability: 'unsupported',
      executor: 'tmux',
      approvalEvidenceRef: opts.executionApprovalEvidenceRef,
      approvalAuthority: opts.attendedExecutionApprovalAuthority,
      approvalExpectedDispatch: attendedExpectedDispatch(provider, 'tmux'),
    });
    await opts.onDispatchBoundary?.({
      taskId,
      provider,
      model,
      backend: 'tmux',
      executionEvidenceRef: `worker-dispatch-boundary:tmux:${taskId}`,
    });
    ensureSession();
    spawnWorker(taskId, model as ModelType, prompt, root, {
      autoApprove: opts.autoApprove ?? false,
      allowedTools: opts.allowedTools,
      reasoningEffort,
    });
    return { backend: 'tmux', provider };
  }

  // Codex/Gemini → subprocess backend
  const backend = SpawnBackendFactory.create({
    backend: 'subprocess',
    projectDir: root,
  });
  assertLiveUsageBudgetSupport(
    executionBudget,
    backend.liveUsageBudgetSupport,
    backend.name,
  );
  assertExecutionLandingSupport({
    budget: executionBudget,
    policy: opts.executionLandingPolicy,
    mode: opts.executionAdmissionMode,
    capability: backend.executionLandingCapability,
    executor: backend.name,
    approvalEvidenceRef: opts.executionApprovalEvidenceRef,
    approvalAuthority: opts.attendedExecutionApprovalAuthority,
    approvalExpectedDispatch: attendedExpectedDispatch(provider, backend.name),
  });
  await opts.onDispatchBoundary?.({
    taskId,
    provider,
    model,
    backend: backend.name,
    executionEvidenceRef: `worker-dispatch-boundary:${backend.name}:${taskId}`,
  });
  backend.spawn(taskId, model as ModelType, prompt, {
    autoApprove: opts.autoApprove ?? false,
    projectDir: root,
    allowedTools: opts.allowedTools,
    reasoningEffort,
    executionBudget,
    executionLandingPolicy: opts.executionLandingPolicy,
    executionAdmissionMode: opts.executionAdmissionMode,
    executionApprovalEvidenceRef: opts.executionApprovalEvidenceRef,
  });
  return { backend: 'subprocess', provider };
}

/**
 * Finalize the task JSON `status` from the worker's `.result` file (268-003).
 *
 * Manual `deckent spawn` previously left the task JSON at EXECUTING/CLAIMED after
 * the worker wrote its `.result` — a second spawn could then run a duplicate
 * worker (267-004 live evidence). Derives status from `selfAssessment` with the
 * same mapping as the sprint path's applyStatusMutation (ADR-045 §1,
 * result-collector.ts): DONE / GO_WITH_TECH_DEBT → DONE, NO_GO → NO_GO.
 *
 * @returns the finalized TaskStatus, or null when the result file is missing,
 *          malformed, or carries an unknown selfAssessment (task JSON untouched).
 */
export function finalizeTaskStatusFromResult(root: string, taskId: string): TaskStatus | null {
  const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);
  if (!existsSync(resultPath)) return null;
  const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(resultPath));
  if (!result) return null;

  const assessment = result.selfAssessment;
  const status =
    assessment === 'DONE' || assessment === 'GO_WITH_TECH_DEBT' ? TaskStatus.DONE
    : assessment === 'NO_GO' ? TaskStatus.NO_GO
    : null;
  if (status === null) return null;

  const taskPath = join(root, TASKS_DIR, `task-${taskId}.json`);
  try {
    const task = readTask(root, taskId);
    task.status = status;
    writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');
    return status;
  } catch (e) {
    debugLog('spawn:finalizeTaskStatus', e);
    return null;
  }
}

export function registerSpawn(program: Command): void {
  program
    .command('spawn <taskId>')
    // NOTE: with the docker backend this command BLOCKS until the worker
    // container exits — DockerSpawnBackend.monitorContainer keeps a `docker wait`
    // child alive, so the CLI process only returns once the worker is finished.
    // tmux/subprocess spawns remain fire-and-forget.
    .description(getMessage('cli.spawn.desc', getLanguage(undefined)))
    .option('--force', 'Force respawn even if task is DONE or NO_GO')
    .option('--auto-approve', 'Enable auto-approve mode for the worker')
    .action(async (taskId: string, opts: { force?: boolean; autoApprove?: boolean }) => {
      const root = resolveProjectRoot();
      let lang = getLanguage(undefined);

      try {
        const task = readTask(root, taskId);
        const config = await loadConfig(root).catch(() => ({ language: 'en' }));
        lang = (config as Record<string, unknown>).language as string ?? 'en';

        // Status checks
        if (task.status === TaskStatus.EXECUTING) {
          printError(`Task ${taskId} is already running. Kill first with \`deckent kill ${taskId}\`.`);
          process.exitCode = 1;
          return;
        }

        if ((task.status === TaskStatus.DONE || task.status === TaskStatus.NO_GO) && !opts.force) {
          printError(`Task ${taskId} already ${task.status}. Use --force to respawn.`);
          process.exitCode = 1;
          return;
        }

        // Build rich prompt
        const agentPrompt = await resolveAgentPrompt(root, task);
        const skillPrompts = await resolveSkillPrompts(root, task);
        const prompt = buildWorkerPrompt(
          task,
          agentPrompt,
          skillPrompts,
          root,
          'prompt' in config ? config : undefined,
        );

        // Derive scope-based allowedTools for boundary enforcement
        const allowedTools = buildAllowedToolsFromScope(task);

        // Stale-result guard for the post-spawn finalize below: a pre-existing
        // .result (e.g. --force respawn of a DONE/NO_GO task) must not be read
        // as the NEW run's outcome — only a result created/modified after this
        // point finalizes the task status.
        const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);
        let preSpawnResultMtime: number | null = null;
        try { preSpawnResultMtime = statSync(resultPath).mtimeMs; } catch { /* no prior result */ }

        // Spawn via config-aware backend (respects spawn_backend setting).
        // Docker backend: this call starts the container and the process then
        // stays alive until the container exits (`docker wait` monitor) — i.e.
        // `deckent spawn` is BLOCKING on docker. tmux/subprocess: fire-and-forget.
        const cfgAny = config as { spawn_backend?: string; docker_image?: string; docker_timeout?: number };
        const { backend, provider, settlementRef } = await spawnWorkerMultiProvider(taskId, task.model, prompt, root, {
          autoApprove: opts.autoApprove ?? false,
          allowedTools,
          spawnBackend: cfgAny.spawn_backend,
          dockerImage: cfgAny.docker_image,
          dockerTimeout: cfgAny.docker_timeout,
          // F1-RE (268-003): forward the task's reasoning-depth override so the
          // manual spawn path emits the provider flag like the sprint path does.
          modelEffort: task.modelEffort,
          executionBudget: task.budget,
          executionLandingPolicy: task.budgetPolicy?.landingPolicy,
          executionBudgetProfileRef: task.budgetPolicy?.profileRef,
          executionBudgetPolicyDigest: task.budgetPolicy?.policyDigest,
          executionAdmissionMode: task.budgetPolicy?.admissionMode,
          executionApprovalEvidenceRef: task.budgetPolicy?.approvalEvidenceRef,
          executionApprovalProposal: task.budgetPolicy?.approvalProposal,
          executionApprovalMaterial: createAttendedExecutionProposalMaterialFromTask(
            task as unknown as Record<string, unknown>,
            prompt,
          ),
          // OPENROUTER-PROVIDER (row 477): forward the task's OWN provider. Without
          // it the on-demand registration branches in spawnWorkerMultiProvider
          // (`opts.provider === 'ollama' | 'openrouter'`) never fired on this path,
          // so `deckent spawn <taskId>` threw UnknownModelError for any dynamic id
          // — ollama tags included. Unlike `deckent run`, this path never calls
          // `resolveExecutionModelIdentity`, so nothing else registers the model here.
          provider: task.provider,
          taskBudgetPolicy: task.budgetPolicy ?? null,
          executionTenantId: resolveTenant(root, {
            ...(task.actor?.tenantId ? { tenantId: task.actor.tenantId } : {}),
          }).tenantId,
        });

        print(getMessage('spawn.worker_spawned', lang, { taskId, model: task.model }));
        print(`  Backend: ${backend}`);
        print(`  Provider: ${provider}`);

        // Show scope info
        if (task.scope.directories.length > 0) {
          print(`  Scope dirs: ${task.scope.directories.join(', ')}`);
        }
        if (task.scope.filesWrite.length > 0) {
          print(`  Write files: ${task.scope.filesWrite.join(', ')}`);
        }

        // 268-003 completion finalize: when the worker's .result appears, derive
        // the task JSON status from selfAssessment so a later spawn cannot run a
        // duplicate worker against a stale EXECUTING/CLAIMED status (267-004).
        // A result is only honored when it is NEW relative to the pre-spawn
        // snapshot (mtime guard above).
        const isNewResult = (): boolean => {
          try {
            const mtime = statSync(resultPath).mtimeMs;
            return preSpawnResultMtime === null || mtime !== preSpawnResultMtime;
          } catch {
            return false;
          }
        };
        const tryFinalize = (): boolean => {
          const finalized = settlementRef
            ? finalizeTaskStatusFromSettlement(root, taskId, settlementRef)
            : isNewResult()
              ? finalizeTaskStatusFromResult(root, taskId)
              : null;
          if (finalized !== null) {
            print(`  Task status finalized: ${finalized}`);
            return true;
          }
          return false;
        };

        // Blocking backends (docker) may have completed already — finalize now.
        const finalizedImmediately = tryFinalize();
        if (!finalizedImmediately && settlementRef) {
          // The receipt lives in host-global state, outside the worker-mounted
          // project tree. Poll the exact attempt reference; raw result writes,
          // stale attempts and heartbeat transitions are deliberately ignored.
          const deadline = Date.now() + ((cfgAny.docker_timeout ?? 1200) * 1000) + 30_000;
          const timer = setInterval(() => {
            if (tryFinalize() || Date.now() >= deadline) clearInterval(timer);
          }, 100);
          timer.unref?.();
        } else if (!finalizedImmediately && !settlementRef) {
          // Fire-and-forget backends: watch for the result WITHOUT keeping the
          // process alive (persistent: false). If the process stays alive anyway
          // (docker's `docker wait` monitor), the watcher fires on completion;
          // if the CLI exits first (tmux/subprocess), behavior is unchanged.
          try {
            const watcher = fsWatch(join(root, TASKS_DIR), { persistent: false }, (_event, filename) => {
              if (filename === `task-${taskId}.result` && tryFinalize()) {
                watcher.close();
              }
            });
            watcher.on('error', () => watcher.close());
          } catch (e) {
            debugLog('spawn:resultWatch', e);
          }
        }
      } catch (error) {
        printError(error instanceof FinalOnlyUsageContainmentHoldError
          ? getMessage('spawn.final_only_containment_hold', lang, { reasonCode: error.reasonCode })
          : error);
        process.exitCode = 1;
      }
    });
}
