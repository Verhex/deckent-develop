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

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Task, ResolvedConfig } from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import { TASKS_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';

import {
  resolveTaskProvider, isTmuxProvider, isAdapterProvider, getProviderAdapterForTask,
} from './sprint-utils.js';
import type { SpawnBackend } from './spawn-backend.js';
import { SpawnBackendFactory } from './spawn-backend.js';
import { resolveReasoningEffort } from '../core/reasoning-effort.js';
import { bootstrapProviders } from '../core/provider.js';
import { spawnWorker } from './tmux.js';
import { buildWorkerApprovalGateEnv } from '../agents/worker-approval-env.js';
import { writeEvent, CHANNELS, getCurrentSprintId } from './event-stream.js';
import { metric } from '../core/observability.js';
import { buildWorkerPrompt } from './task-builder.js';

// ─── Fix-Task Routing-Field Inheritance ───────────────────────────────────
// Relocated from sprint-spawner.ts `preserveFixTaskRoutingFields` (born-476,
// Sprint 361 Task 361-005) — same field-by-field "copy only if undefined,
// preserve explicit override" semantics — now returning an honest `missing`
// outcome instead of the prior fail-soft no-op when the original task file
// cannot be read/parsed. `preserveFixTaskRoutingFields` itself is left as-is
// in sprint-spawner.ts for spawnWorkers' unrelated call (initial spawn wave
// is not one of the two executors this slice unifies).

type FixRoutingField = 'forceModel' | 'provider' | 'backend' | 'modelEffort';
const FIX_ROUTING_FIELDS: readonly FixRoutingField[] = ['forceModel', 'provider', 'backend', 'modelEffort'];

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

  const taskRecord = task as unknown as Record<FixRoutingField, unknown>;
  const originalRecord = original as unknown as Record<FixRoutingField, unknown>;

  const inherited: Partial<Record<FixRoutingField, unknown>> = {};
  const overridden: Partial<Record<FixRoutingField, { from: unknown; to: unknown }>> = {};

  for (const field of FIX_ROUTING_FIELDS) {
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
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend };
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

  // ─── 2. Prompt / provider / backend / reasoning-effort resolution ───────
  const agentPrompt = await deps.resolveAgentPrompt(projectRoot, task);
  const skillPrompts = await deps.resolveSkillPrompts(projectRoot, task);
  const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts, projectRoot);
  const model = task.model;
  const writeTargets = deps.buildWriteTargets(task);
  const allowedTools = writeTargets.length > 0
    ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
    : 'Read,Write,Edit,Bash,Glob,Grep';

  const taskProvider = resolveTaskProvider(task);
  const wantsHostAdapter = isAdapterProvider(taskProvider) && !task.backend;
  const effectiveBackend: SpawnBackend | undefined =
    task.backend && task.backend !== config?.spawn_backend
      ? SpawnBackendFactory.create({
          backend: task.backend,
          projectDir: projectRoot,
          dockerImage: config?.docker_image,
          dockerTimeoutSeconds: config?.docker_timeout,
          dockerMemoryLimit: config?.worker_memory_limit,
        })
      : backend;
  const reasoningEffort = resolveReasoningEffort(taskProvider, task.modelEffort);
  const excludeDynamicPromptSections = config?.prompt?.exclude_dynamic_system_prompt_sections !== false;

  let adapterRouted = wantsHostAdapter ? getProviderAdapterForTask(taskProvider) : null;
  if (wantsHostAdapter && !adapterRouted && config) {
    try {
      await bootstrapProviders(config, projectRoot);
      adapterRouted = getProviderAdapterForTask(taskProvider);
    } catch (e) { debugLog('executeSpawnTask:lazyAdapterRebootstrap', e); }
  }

  // ─── 3. Dispatch — single canonical branch set ───────────────────────────
  if (adapterRouted) {
    const refresh = (adapterRouted as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
    if (typeof refresh === 'function') await refresh.call(adapterRouted);
    adapterRouted.spawn(task.id, model, prompt, {
      allowedTools,
      autoApprove: spawnOpts?.autoApprove ?? false,
      projectDir: projectRoot,
      reasoningEffort,
      excludeDynamicPromptSections,
      taskTimeoutSeconds,
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
    effectiveBackend.spawn(task.id, model, prompt, {
      allowedTools,
      autoApprove: spawnOpts?.autoApprove ?? false,
      projectDir: projectRoot,
      reasoningEffort,
      excludeDynamicPromptSections,
      taskTimeoutSeconds,
    });
  } else if (!isTmuxProvider(taskProvider)) {
    const adapter = getProviderAdapterForTask(taskProvider);
    if (adapter) {
      adapter.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
        env: buildWorkerApprovalGateEnv(config?.approval?.gate_enabled === true, task.sprintId, task.id),
      });
    }
  } else {
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
