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

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import type { Task, ResolvedConfig, TaskResult } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { resolveLiveTraceEnabled } from '../core/config.js';
import { debugLog } from '../core/utils.js';
import {
  assertExecutionLandingSupport,
  assertLiveUsageBudgetSupport,
  hasLiveUsageCeiling,
} from '../core/live-execution-budget.js';
import { getProviderCommandSpec } from '../core/provider-command-spec.js';
import {
  attendedExecutionProjectId,
  type AttendedExecutionApprovalAuthority,
  type AttendedExecutionApprovalExpectedDispatch,
} from '../core/attended-execution-approval.js';
import { createTaskResultSettlementRefForAttempt } from '../core/task-result-settlement.js';
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
import type { SpawnBackend } from './spawn-backend.js';
import { SpawnBackendFactory } from './spawn-backend.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import { bootstrapProviders, orderedRoleProviders } from '../core/provider.js';
import { spawnWorker } from './tmux.js';
import { buildWorkerApprovalGateEnv } from '../agents/worker-approval-env.js';
import { writeEvent, CHANNELS, getCurrentSprintId } from './event-stream.js';
import { metric } from '../core/observability.js';
import { buildWorkerPrompt } from './task-builder.js';
import type { SchedulerDecision } from './scheduler-reducer.js';

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
  resolveAgentPrompt: (projectRoot: string, task: Task) => Promise<string | undefined>;
  resolveSkillPrompts: (projectRoot: string, task: Task) => Promise<Array<{ name: string; content: string }>>;
  /** Caller-specific write-target/allowedTools scope builder (each existing caller keeps its own). */
  buildWriteTargets: (task: Task) => string[];
}

export type SpawnDisposition =
  | { kind: 'spawned'; taskId: string }
  | { kind: 'routing-lineage-missing'; taskId: string; fixForTaskId: string; detail: string }
  | { kind: 'provider-unavailable'; taskId: string; provider: string };

function intendedWorkerBackend(
  task: Task,
  provider: ReturnType<typeof resolveTaskProvider>,
  backend: SpawnBackend | undefined,
): string {
  if (task.backend) return task.backend;
  if (isAdapterProvider(provider)) return 'host-adapter';
  if (backend) return backend.name;
  return isTmuxProvider(provider) ? 'tmux' : 'host-adapter';
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
 * MF-2 (Sprint 250) parity: an honest NO_GO `.result` when a host-only
 * provider (codex/gemini/ollama, per `isAdapterProvider`) has no
 * registered/available host adapter at spawn time — reimplemented here
 * (not imported) because sprint-spawner.ts's `writeProviderUnavailableNoGo`
 * is unexported and this module must not import from sprint-spawner.ts.
 */
function writeProviderUnavailableResult(projectRoot: string, task: Task): void {
  const reason =
    `Provider "${task.provider}" requires a host adapter (isAdapterProvider) but none is `
    + `registered/available at spawn time. Refusing to silently degrade to the claude CLI via the `
    + `docker backend. Ensure the provider is available at bootstrap (CLI logged in / daemon reachable) `
    + `so its host adapter is registered.`;
  const result = {
    taskId: task.id,
    workerId: `honestfail-${task.id}`,
    filesChanged: [] as string[],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    selfAssessment: 'NO_GO',
    notes: reason,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      provider: task.provider,
      model: task.model,
    },
  };
  try {
    writeFileSync(
      join(projectRoot, TASKS_DIR, `task-${task.id}.result`),
      JSON.stringify(result, null, 2),
      'utf-8',
    );
  } catch (e) { debugLog('executeSpawnTask:writeProviderUnavailableResult', e); }
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

  // ─── 1. Fix-task routing-lineage inheritance — BEFORE resolution ────────
  const lineage = applyFixRoutingLineage(task, projectRoot, sprintFallbackId);
  if (lineage.missing) {
    const detail = `routing-lineage-missing: ${lineage.detail}`;
    try {
      process.stderr.write(`[scheduler-effects] task ${task.id}: ${detail} — spawn blocked\n`);
    } catch { /* stderr unavailable — non-fatal, debugLog below still records it */ }
    debugLog('executeSpawnTask:routingLineageMissing', `${task.id}: ${detail}`);
    return { kind: 'routing-lineage-missing', taskId: task.id, fixForTaskId: task.fixForTaskId!, detail };
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

  // ─── 3. Prompt / provider / backend / reasoning-effort resolution ───────
  const agentPrompt = await deps.resolveAgentPrompt(projectRoot, task);
  const skillPrompts = await deps.resolveSkillPrompts(projectRoot, task);
  const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts, projectRoot, config);
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
          dockerMemorySwap: config?.worker_memory_swap,
          dockerKindMemoryLimits: config?.worker_memory_limit_by_kind,
          })
      : backend;
  const finalOnlyUsageContainment =
    effectiveBackend?.name === 'docker'
    && getProviderCommandSpec(taskProvider)?.liveUsage === 'final-only'
    && hasLiveUsageCeiling(task.budget)
      ? task.budgetPolicy?.finalOnlyUsage
      : undefined;
  const wantsHostAdapter =
    isAdapterProvider(taskProvider)
    && !task.backend
    && !finalOnlyUsageContainment;
  const reasoningEffort = resolveReasoningEffort(taskProvider, task.modelEffort);
  const excludeDynamicPromptSections = config?.prompt?.exclude_dynamic_system_prompt_sections !== false;
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

  let adapterRouted = wantsHostAdapter ? getProviderAdapterForTask(taskProvider) : null;
  if (wantsHostAdapter && !adapterRouted && config) {
    try {
      await bootstrapProviders(config, projectRoot);
      adapterRouted = getProviderAdapterForTask(taskProvider);
    } catch (e) { debugLog('executeSpawnTask:lazyAdapterRebootstrap', e); }
  }

  // ─── 4. Dispatch — single canonical branch set ───────────────────────────
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
  } else if (wantsHostAdapter) {
    // Host-only provider wanted but no adapter registered — honest NO_GO,
    // never silently degrade to the docker/claude fallback. Spawn blocked.
    writeProviderUnavailableResult(projectRoot, task);
    task.status = TaskStatus.NO_GO;
    persistTask(projectRoot, task);
    return { kind: 'provider-unavailable', taskId: task.id, provider: String(task.provider) };
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
    effectiveBackend.spawn(task.id, model, prompt, {
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
    spawnWorker(task.id, model, prompt, projectRoot, {
      allowedTools,
      autoApprove: spawnOpts?.autoApprove ?? false,
      excludeDynamicPromptSections,
    });
  }

  // ─── 4. Persistence — single site ────────────────────────────────────────
  task.status = TaskStatus.EXECUTING;
  persistTask(projectRoot, task);

  return { kind: 'spawned', taskId: task.id };
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
  writeFileSync(tmpPath, JSON.stringify(result, null, 2), 'utf-8');
  renameSync(tmpPath, filePath);
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
 * `cascadeSkippedTaskIds`) AFTER that persist succeeds. If the `.result`
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
  let checkpointsWritten = 0;

  for (const effect of decision.orderedEffects) {
    if (effect.kind === 'KillWorker') {
      try {
        deps.killWorker(effect.taskId);
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
          continue; // persist failed — task stays PENDING, retryable next tick with the same key
        }
      }
      if (task.status === TaskStatus.PENDING) {
        task.status = TaskStatus.NO_GO;
        persistTask(deps.projectRoot, task);
        cascadeSkippedTaskIds.push(task.id);
      }
      continue;
    }
    if (effect.kind === 'WriteCheckpoint') {
      try {
        if (deps.writeCheckpoint) {
          deps.writeCheckpoint(effect.reason);
          checkpointsWritten++;
        }
      } catch (e) { debugLog('executeSchedulerDecision:writeCheckpoint', e); }
      continue;
    }
    if (effect.kind !== 'SpawnTask') continue; // Blocked/ClearBlocked/EmitMetric — dilim-7 scope

    const task = deps.taskMap.get(effect.taskId);
    if (!task) {
      debugLog('executeSchedulerDecision:missingTask', `SpawnTask effect for unknown task ${effect.taskId}`);
      continue;
    }
    if (deps.assignedTaskIds.has(effect.taskId)) continue; // idempotency (Bug F parity)
    deps.assignedTaskIds.add(effect.taskId);
    try {
      const disposition = await executeSpawnTask({ task }, deps);
      if (disposition.kind === 'spawned') {
        spawnedTaskIds.push(effect.taskId);
      } else {
        deps.assignedTaskIds.delete(effect.taskId);
      }
    } catch (e) {
      debugLog('executeSchedulerDecision:spawn', e);
      deps.assignedTaskIds.delete(effect.taskId);
    }
  }

  return {
    spawnedTaskIds, killedWorkerIds, cascadeSkippedTaskIds, checkpointsWritten,
  };
}
