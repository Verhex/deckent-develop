// ═══ Sprint Spawner ════════════════════════════════════════════════
// Extracted from sprint-controller.ts — worker spawn functions:
//   spawnWorkers(), respawnEligibleTasks(), validateTaskDependencies(),
//   routeSprintTasks()

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, AgentStatus,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, Sprint, ResolvedConfig,
  AgentInfo, ProviderName,
} from '../core/types.js';

import { TASKS_DIR } from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { debugLog } from '../core/utils.js';

// ─── Core — config ────────────────────────────────────────────────
import { resolveEffectiveWorkers } from '../core/config.js';

// ─── Token Quota (Sprint 202 Task 202-004 — computeBackoff wire) ──
// `token_throttle_ms` (config.ts default 500) is the inter-worker pacing floor;
// `nextDelayMs` reads it and combines with `computeBackoff` (anthropic-http-
// client.ts) so the dead-code path of Sprint 141 becomes live (Sprint 198 30k
// tpm Tier-1 felaketi önleyici).
import { nextDelayMs, sleep } from '../core/token-quota.js';

/**
 * Read `token_throttle_ms` from a ResolvedConfig via a local cast — the field
 * is attached by `loadConfig`/`mergeConfigs` (config.ts intersection type) but
 * is not yet declared on `ResolvedConfig` itself (config-types.ts is out of
 * Sprint 202 Task 202-004 scope). Inlined here instead of as a helper in
 * config.ts to avoid breaking the many `vi.mock('../../src/core/config.js')`
 * partial mocks that don't enumerate new exports.
 *
 * Defaults to 500 ms (Sprint 198 Tier-1 burst mitigation).
 */
function readTokenThrottleMs(config: ResolvedConfig): number {
  const raw = (config as ResolvedConfig & { token_throttle_ms?: number }).token_throttle_ms;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 500;
  return raw;
}

// ─── Core — system profile ────────────────────────────────────────
import { getSystemProfile } from '../core/system-profile.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import {
  now,
  isTmuxProvider, isAdapterProvider, resolveTaskProvider, getProviderAdapterForTask,
} from './sprint-utils.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';

// ─── Tmux ────────────────────────────────────────────────────────
import { ensureSession, spawnWorker } from './tmux.js';

// ─── Auditor ──────────────────────────────────────────────────────
import { updateDashboard } from '../monitor/auditor.js';

// ─── Result Collector ─────────────────────────────────────────────
import { resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';

// ─── Task Builder ─────────────────────────────────────────────────
import { buildWorkerPrompt } from './task-builder.js';

// ─── Parallel Pipeline ───────────────────────────────────────────
import { ParallelPipelineManager } from './parallel-pipeline.js';

// ─── Task Router ────────────────────────────────────────────────
import { routeTask } from './task-router.js';

// ─── Observability ──────────────────────────────────────────────
import { metric } from '../core/observability.js';

// ─── Collision Detection (Sprint 138 ADR-035) ──────────────────
import { detectScopeCollisions } from './conflict-resolver.js';
import { writeEvent, CHANNELS, getCurrentSprintId, readSequence } from './event-stream.js';

// ─── Decision Engine (Sprint 168 W2.5 — C0c wire) ──────────────
// Wire: handleScopeCollision() is the pure decision function from C0c RC2.
// Imported directly to avoid the sprint-controller ↔ sprint-spawner import
// cycle that would arise if consultCollisionDecision() (its sprint-controller
// wrapper) were imported here. The BRAIN→SPAWN:BLOCKED emit logic mirrors
// the wrapper inline so callers of consultCollisionDecision (recovery paths)
// remain functional and the spawn pipeline gets the same closure semantics.
import { handleScopeCollision } from './decision-engine.js';
import type { ScopeCollisionPayload } from './decision-engine.js';

// ─── Dependency Scheduler (Sprint 139 Task 028 + 029) ───────────
import {
  buildDependencyGraph,
  enforceWaveDependency,
  applyFailureCascade,
  unblockDependents,
} from './dependency-scheduler.js';

// ─── Sprint Checkpoint (Sprint 138 Long-Running Resume) ─────────
import { writeCheckpoint } from './sprint-checkpoint.js';

// ─── Worker Lifecycle State Machine (Sprint 139 Task 015) ────────
import {
  createWorkerStateMachine,
  getWorkerStateMachine,
  getAllWorkerStates,
  isWorkerStoppable,
  removeWorkerStateMachine,
  type WorkerLifecycleState,
} from '../agents/worker.js';

// ─── Runtime vs Code Discriminator (Sprint 139 Task 024) ─────────
import {
  decideCascadeAction,
  type FailureContext,
  type CascadeDecision,
} from './result-evaluator.js';

// ─── Fresh-Eyes Rotation (Sprint 156 Task 012) ───────────────────
import type { FreshEyesRotationStrategy } from './debt-manager.js';

// ═══ Scope Path Utilities ══════════════════════════════════════════

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

/**
 * Build and normalize the list of write targets for a worker's --allowedTools scope.
 * Applies path normalization rules: trailing slash removal on files, extension-only
 * path rejection, and ADR-013 protected path exclusion.
 *
 * Always prepends `.tasks/` so workers can write heartbeat and result files.
 *
 * @param task - The task whose scope is being resolved
 * @returns Deduplicated, normalized write target paths
 */
export function buildAllowedWriteTargets(task: Pick<Task, 'scope'>): string[] {
  const raw = ['.tasks/', ...task.scope.directories, ...task.scope.filesWrite];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of raw) {
    const normalized = normalizeScopePath(path);
    if (normalized !== null && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

// ═══ Scope Equivalence Normalization (Sprint 169 W3.1) ════════════

/**
 * Normalize a list of scope file paths to canonical form for equivalence-class
 * collision detection. Resolves the following variants to a single canonical key:
 *   - Leading `./` prefix  (`./src/foo.ts` → `src/foo.ts`)
 *   - Repeated slashes     (`src//foo.ts`  → `src/foo.ts`)
 *   - Trailing slash       (`src/foo.ts/`  → `src/foo.ts`)
 * Empty and whitespace-only entries are dropped.
 *
 * Intentionally simpler than normalizeScopePath: no extension-only rejection, no
 * ADR-013 protected-path exclusion — those checks belong to the build-time scope
 * builder. This helper is concerned only with path equivalence for collision detection.
 */
export function normalizeScopeFiles(files: readonly string[]): string[] {
  const result: string[] = [];
  for (const f of files) {
    const trimmed = f.trim();
    if (!trimmed) continue;
    const canonical = trimmed
      .replace(/^\.\//, '')   // strip leading ./
      .replace(/\/+/g, '/')   // collapse repeated slashes
      .replace(/\/$/, '');    // strip trailing slash
    if (canonical) result.push(canonical);
  }
  return result;
}

// ═══ Exported Functions ════════════════════════════════════════════

/**
 * Spawn worker agents for sprint tasks via the configured backend.
 * Respects max_workers limit; excess tasks are returned as a queue.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint containing tasks to execute
 * @param config - Resolved project configuration
 * @param spawnOpts - Optional spawn settings (auto-approve, usage tracker, backend)
 * @returns Array of queued tasks that exceeded the worker limit
 */
export async function spawnWorkers(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
): Promise<Task[]> {
  const backend = spawnOpts?.spawnBackend;

  let needsTmuxSession = false;

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);

  // ─── Plan-Time Collision Detection (Sprint 138 ADR-035) ───────
  // Sprint 168 W2.5 — C0c wire: build a blockedTaskIds set from
  // handleScopeCollision() decisions and emit BRAIN→SPAWN:BLOCKED events.
  // Blocked tasks short-circuit before TASK_ASSIGN below.
  //
  // Sprint 169 W3.1 fix: normalize filesWrite paths before collision detection
  // so equivalence-class variants (./src/foo.ts vs src/foo.ts, double slashes,
  // trailing slash) resolve to the same canonical key and trigger the >=2
  // writer threshold correctly.
  const pendingTasks = sprint.tasks.filter(t => t.status === TaskStatus.PENDING);
  const normalizedPendingTasks = pendingTasks.map(t => ({
    ...t,
    scope: { ...t.scope, filesWrite: normalizeScopeFiles(t.scope.filesWrite) },
  }));
  const collisionResult = detectScopeCollisions(normalizedPendingTasks);
  const blockedTaskIds = new Set<string>();
  if (collisionResult.collisionCount > 0) {
    const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;
    for (const [file, writers] of collisionResult.collisions) {
      writeEvent(
        projectRoot, sprintId, 'auditor', 'brain',
        CHANNELS.SCOPE_COLLISION_DETECTED,
        { taskIds: writers, files: [file], detectedAt: 'plan-time' },
      );
      debugLog('spawnWorkers:collision', `File "${file}" written by tasks: ${writers.join(', ')}`);

      // Sprint 168 W2.5 — consult collision decision (C0c RC2) + emit BLOCKED
      const payload: ScopeCollisionPayload = {
        taskIds: writers,
        files: [file],
        detectedAt: 'plan-time',
      };
      const decision = handleScopeCollision(payload);
      if (decision.action === 'block') {
        for (const id of decision.taskIds) blockedTaskIds.add(id);
        try {
          writeEvent(
            projectRoot, sprintId, 'brain', 'worker',
            CHANNELS.SPAWN_BLOCKED,
            {
              taskIds: decision.taskIds,
              files: payload.files,
              reason: decision.reason,
              detectedAt: payload.detectedAt,
            },
          );
        } catch (e) {
          debugLog('spawnWorkers:writeBlockedEvent', e);
        }
      }
    }
    metric('collision.detected', collisionResult.collisionCount, {
      pairs: String(collisionResult.collidingPairs.length),
    });
  }

  // Dependency pipeline guard: when enabled, only spawn tasks whose dependencies are all DONE
  let activeTasks: Task[];
  let queuedTasks: Task[];
  if (config.dependency_pipeline_enabled) {
    const doneTasks = new Set(
      sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
    );
    const eligibleTasks = sprint.tasks.filter(t => {
      if (t.status !== TaskStatus.PENDING) return false;
      if (!t.dependencies || t.dependencies.length === 0) return true;
      return t.dependencies.every(dep => doneTasks.has(dep));
    });
    activeTasks = eligibleTasks.slice(0, maxWorkers);
    queuedTasks = eligibleTasks.slice(maxWorkers);
  } else {
    activeTasks = sprint.tasks.slice(0, maxWorkers);
    queuedTasks = sprint.tasks.slice(maxWorkers);
  }

  // Pre-check: do any active tasks need tmux?
  if (!backend) {
    needsTmuxSession = activeTasks.some(task => {
      const provider = resolveTaskProvider(task);
      return isTmuxProvider(provider);
    });
    if (needsTmuxSession) {
      ensureSession();
    }
  }

  // Observability: wave start metric
  const waveId = config.dependency_pipeline_enabled ? 'dep-pipeline' : 'legacy';
  metric('wave.start', 0, { wave: waveId, count: String(activeTasks.length) });

  // Sprint 202 Task 202-004 — inter-worker token throttle.
  // Resolved here once so the throttle is consistent across the whole wave.
  const throttleFloorMs = readTokenThrottleMs(config);
  let spawnedThisWave = 0;

  for (const task of activeTasks) {
    // Sprint 168 W2.5 — C0c wire: skip blocked tasks (collision spawn-block).
    // BRAIN→SPAWN:BLOCKED was already emitted above; no TASK_ASSIGN, no spawn.
    if (blockedTaskIds.has(task.id)) {
      debugLog('spawnWorkers:skipBlocked', `Task ${task.id} blocked by scope collision`);
      continue;
    }

    // Sprint 202 Task 202-004 — pace spawns by token_throttle_ms (skip first).
    // No RateLimitState is available at spawn-time (workers own the API call),
    // so we pass `null` and let `nextDelayMs` fall back to the configured floor.
    // computeBackoff will dominate if a future caller supplies a non-null state.
    if (spawnedThisWave > 0 && throttleFloorMs > 0) {
      const delayMs = nextDelayMs(null, 0, throttleFloorMs);
      await sleep(delayMs);
    }

    // Sprint 168 W2.5 — C0c wire: fresh disk read of task.json (RC3).
    // Operator manual patches between PLAN and SPAWN (--resume, recovery,
    // race with Auditor) must be reflected in TASK_ASSIGN. We attempt a
    // fresh read; on missing/corrupt file we fall back to the in-memory
    // task to preserve resilience (fail-safe per ADR-035).
    let freshTask: Task = task;
    try {
      const freshPath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
      const raw = readFileSync(freshPath, 'utf-8');
      freshTask = JSON.parse(raw) as Task;
    } catch (e) {
      debugLog('spawnWorkers:freshTaskRead', e);
    }

    const agentPrompt = await resolveAgentPrompt(projectRoot, task);
    const taskSkillPrompts = await resolveSkillPrompts(projectRoot, task);
    const prompt = buildWorkerPrompt(task, agentPrompt, taskSkillPrompts);
    const model = task.model;
    const writeTargets = buildAllowedWriteTargets(task);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
      : 'Read,Write,Edit,Bash,Glob,Grep';

    const taskProvider = resolveTaskProvider(task);

    // ─── Worker State Machine init (Sprint 139) ─────────────────
    const wid = `w-${task.id}`;
    const sm = createWorkerStateMachine(wid);
    // SPAWNING → STARTING (backend spawn call is about to happen)
    sm.transition('STARTING');

    // ─── TASK_ASSIGN event (Brain → Worker, Protocol 1.0) ────────
    // Emitted before spawn so the event stream records task intent
    // even if the spawn process fails (observable pre-condition state).
    // Sprint 168 W2.5: payload reads scope from freshTask (disk-fresh).
    const sprintIdForAssign = getCurrentSprintId(projectRoot) ?? sprint.id;
    writeEvent(
      projectRoot, sprintIdForAssign, 'brain', 'worker',
      CHANNELS.TASK_ASSIGN,
      {
        taskId: task.id,
        workerId: wid,
        model: task.model,
        agent: freshTask.assignedAgent ?? task.assignedAgent ?? 'generic',
        skills: freshTask.assignedSkills ?? task.assignedSkills ?? [],
        scope: {
          directories: freshTask.scope?.directories ?? task.scope?.directories ?? [],
          filesWrite: freshTask.scope?.filesWrite ?? task.scope?.filesWrite ?? [],
        },
        provider: resolveTaskProvider(task),
      },
    );

    // Single spawn path — NEVER spawn the same task twice.
    //
    // Sprint 234 AS-2 Faz 2: host-HTTP adapter providers (`isAdapterProvider`)
    // bypass any configured backend. The previous priority order let a docker
    // backend silently swallow ollama tasks and route them to the `claude`
    // CLI fallback in `spawn-backend-docker.ts:getProviderBinaryForModel`.
    // Now: if the task's provider is a host-HTTP adapter and its adapter is
    // registered, refresh dynamic model acceptance and use `adapter.spawn`.
    // `refreshSupportedModels` is optional (`?.`) so non-Ollama adapters that
    // do not implement it remain compatible.
    const adapterRouted = isAdapterProvider(taskProvider)
      ? getProviderAdapterForTask(taskProvider)
      : null;
    if (adapterRouted) {
      // `refreshSupportedModels` is optional on the ProviderAdapter contract
      // (OllamaAdapter implements it for `/api/tags` dynamic acceptance; others
      // may not). Structural narrow lets us call it without widening the core
      // interface.
      const refresh = (adapterRouted as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
      if (typeof refresh === 'function') {
        await refresh.call(adapterRouted);
      }
      adapterRouted.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (backend) {
      backend.spawn(task.id, model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (!isTmuxProvider(taskProvider)) {
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        adapter.spawn(task.id, model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
        });
      }
    } else {
      spawnWorker(task.id, model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
      });
    }

    // STARTING → EXECUTING (spawn call succeeded)
    sm.transition('EXECUTING');

    // Emit lifecycle state to event stream
    const sprintIdForEvent = getCurrentSprintId(projectRoot) ?? sprint.id;
    writeEvent(
      projectRoot, sprintIdForEvent, 'worker', 'brain',
      CHANNELS.HEARTBEAT,
      { workerId: wid, taskId: task.id, lifecycleState: sm.state },
    );

    // Update task status to EXECUTING and persist to disk
    task.status = TaskStatus.EXECUTING;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch (e) { debugLog('spawnWorkers:writeTaskFile', e); }

    spawnedThisWave++;
  }

  const agents: AgentInfo[] = activeTasks.map(task => ({
    id: `w-${task.id}`,
    role: 'worker' as const,
    status: AgentStatus.EXECUTING,
    model: task.model,
    tmuxWindow: `w-${task.id}`,
    taskId: task.id,
    currentAction: `Starting [${resolveTaskProvider(task)}]`,
    spawnedAt: now(),
  }));

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents,
    progress: { done: 0, active: activeTasks.length, blocked: 0, total: sprint.tasks.length },
    alerts: [],
    updatedAt: now(),
  });

  return queuedTasks;
}

/**
 * Re-evaluate and spawn tasks that are now eligible because their dependencies are DONE.
 * Called after a task completes (finalizeTaskResult) when dependency_pipeline_enabled is true.
 * Each respawn event can optionally emit a wave.transition metric via the provided callback.
 * @returns Array of newly spawned task IDs
 */
export async function respawnEligibleTasks(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
  onWaveTransition?: (durationMs: number, fromWave: string, toWave: string) => void,
): Promise<string[]> {
  if (!config.dependency_pipeline_enabled) return [];

  const waveStart = Date.now();

  const doneTasks = new Set(
    sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
  );

  // Build dependency graph for enforcement (Sprint 139 Task 028)
  const graph = buildDependencyGraph(sprint.tasks, /* includeCollisions */ true);
  const pendingIds = sprint.tasks
    .filter(t => t.status === TaskStatus.PENDING)
    .map(t => t.id);

  const enforcement = enforceWaveDependency(graph, pendingIds, doneTasks);

  // Emit blocked events to event stream
  const sprintIdForDeps = getCurrentSprintId(projectRoot) ?? sprint.id;
  for (const [blockedId, unresolvedDeps] of enforcement.reasons) {
    writeEvent(
      projectRoot, sprintIdForDeps, 'brain', 'worker',
      'BRAIN→WORKER:DEPENDENCY_BLOCKED',
      { taskId: blockedId, unresolvedDeps, reason: 'dependencies not yet DONE' },
    );
  }

  const nowEligible = sprint.tasks.filter(t => enforcement.eligible.includes(t.id));

  if (nowEligible.length === 0) return [];

  const systemProfile = getSystemProfile();
  const maxWorkers = resolveEffectiveWorkers(config, systemProfile);
  const currentlyExecuting = sprint.tasks.filter(
    t => t.status === TaskStatus.EXECUTING || t.status === TaskStatus.CLAIMED || t.status === TaskStatus.TESTING,
  ).length;
  const slotsAvailable = Math.max(0, maxWorkers - currentlyExecuting);

  const toSpawn = nowEligible.slice(0, slotsAvailable);
  if (toSpawn.length === 0) return [];

  const backend = spawnOpts?.spawnBackend;

  // Sprint 202 Task 202-004 — same inter-worker throttle as spawnWorkers().
  const throttleFloorMs = readTokenThrottleMs(config);
  let spawnedThisWave = 0;

  for (const task of toSpawn) {
    if (spawnedThisWave > 0 && throttleFloorMs > 0) {
      const delayMs = nextDelayMs(null, 0, throttleFloorMs);
      await sleep(delayMs);
    }

    const agentPrompt = await resolveAgentPrompt(projectRoot, task);
    const taskSkillPrompts = await resolveSkillPrompts(projectRoot, task);
    const prompt = buildWorkerPrompt(task, agentPrompt, taskSkillPrompts);
    const writeTargets = buildAllowedWriteTargets(task);
    const allowedTools = writeTargets.length > 0
      ? `Read,Write(${writeTargets.join(',')}),Edit(${writeTargets.join(',')}),Bash,Glob,Grep`
      : 'Read,Write,Edit,Bash,Glob,Grep';

    const taskProvider = resolveTaskProvider(task);

    // Sprint 156 Task 012 — observability for fresh-eyes rotation on fix tasks
    emitRotationMetricIfApplicable(projectRoot, sprint.id, task);

    // Sprint 234 AS-2 Faz 2: same host-HTTP adapter routing as `spawnWorkers`.
    // Wave-2+ respawns must honor the predicate so ollama tasks promoted from
    // PENDING during dependency unblock also reach the host adapter.
    const adapterRouted = isAdapterProvider(taskProvider)
      ? getProviderAdapterForTask(taskProvider)
      : null;
    if (adapterRouted) {
      const refresh = (adapterRouted as { refreshSupportedModels?: () => Promise<void> }).refreshSupportedModels;
      if (typeof refresh === 'function') {
        await refresh.call(adapterRouted);
      }
      adapterRouted.spawn(task.id, task.model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (backend) {
      backend.spawn(task.id, task.model, prompt, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
        projectDir: projectRoot,
      });
    } else if (!isTmuxProvider(taskProvider)) {
      const adapter = getProviderAdapterForTask(taskProvider);
      if (adapter) {
        adapter.spawn(task.id, task.model, prompt, {
          allowedTools,
          autoApprove: spawnOpts?.autoApprove ?? false,
          projectDir: projectRoot,
        });
      }
    } else {
      spawnWorker(task.id, task.model, prompt, projectRoot, {
        allowedTools,
        autoApprove: spawnOpts?.autoApprove ?? false,
      });
    }

    task.status = TaskStatus.EXECUTING;
    try {
      writeFileSync(
        join(projectRoot, TASKS_DIR, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    } catch (e) { debugLog('respawnEligibleTasks:writeTaskFile', e); }

    spawnedThisWave++;
  }

  const waveDuration = Date.now() - waveStart;
  metric('wave.transition', waveDuration, { from_wave: 'dep-wait', to_wave: `wave-${toSpawn.length}` });
  if (onWaveTransition) {
    try {
      onWaveTransition(waveDuration, 'dep-wait', `wave-${toSpawn.length}`);
    } catch (e) { debugLog('respawnEligibleTasks:onWaveTransition', e); }
  }

  // ─── METRIC_EMITTED: wave respawn metrics ────────────────────────
  // Emit a METRIC_EMITTED event so Auditor/Dashboard can track wave progress
  // without polling the file system. Written in parallel with metrics.jsonl.
  const sprintIdForMetric = getCurrentSprintId(projectRoot) ?? sprint.id;
  writeEvent(
    projectRoot, sprintIdForMetric, 'brain', '*',
    CHANNELS.METRIC_EMITTED,
    {
      name: 'wave.respawn',
      value: toSpawn.length,
      durationMs: waveDuration,
      spawnedTaskIds: toSpawn.map(t => t.id),
      totalDone: sprint.tasks.filter(t => t.status === TaskStatus.DONE).length,
      totalPending: sprint.tasks.filter(t => t.status === TaskStatus.PENDING).length,
    },
  );

  // ─── Checkpoint every N completed tasks (Sprint 138 Long-Running Resume) ──
  // Sprint 139 override: sprint_checkpoint_interval=3 (default 5) for higher-risk sprints
  const CHECKPOINT_INTERVAL = config.sprint_checkpoint_interval ?? 5;
  const terminalCount = sprint.tasks.filter(t =>
    t.status === TaskStatus.DONE || t.status === TaskStatus.NO_GO,
  ).length;
  if (terminalCount > 0 && terminalCount % CHECKPOINT_INTERVAL === 0) {
    const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;
    const eventOffset = readSequence(projectRoot, sprintId);
    writeCheckpoint(projectRoot, sprint, eventOffset);
    debugLog('respawnEligibleTasks:checkpoint', `Checkpoint written at ${terminalCount} completed tasks`);
  }

  debugLog('respawnEligibleTasks', `Spawned ${toSpawn.length} newly eligible tasks: ${toSpawn.map(t => t.id).join(', ')}`);
  return toSpawn.map(t => t.id);
}

// ─── Sprint 165 Bug Y — processQueue Stall Fix Helpers ──────────────
// Pure functions used by waitForResults::processQueue to fix the
// Sprint 161/164/165 hayalet-task regression (legacy FIFO stall +
// duplicate spawn). Exported for unit testing.

/**
 * Count tasks currently occupying a worker slot.
 * A task is "executing" if its status is EXECUTING, CLAIMED, or TESTING.
 *
 * Sprint 165 Bug Y fix — used by force re-scan and slot-aware spawn
 * to detect when slots are available without actually killing a worker.
 */
export function countCurrentlyExecuting(sprint: Sprint): number {
  return sprint.tasks.filter(t =>
    t.status === TaskStatus.EXECUTING
    || t.status === TaskStatus.CLAIMED
    || t.status === TaskStatus.TESTING,
  ).length;
}

/**
 * Compute how many worker slots are free right now.
 * Returns max(0, maxWorkers - countCurrentlyExecuting(sprint)).
 *
 * Sprint 165 Bug Y fix — used by force re-scan to decide whether to
 * scan PENDING tasks for spawn.
 */
export function computeSlotsAvailable(sprint: Sprint, maxWorkers: number): number {
  return Math.max(0, maxWorkers - countCurrentlyExecuting(sprint));
}

/**
 * Select PENDING tasks eligible for spawn, respecting dependency_pipeline_enabled.
 * Skips tasks already in assignedTaskIds (idempotency / Bug F guard) and
 * those in collectedIds (already produced a result).
 *
 * - Legacy FIFO mode (`dependency_pipeline_enabled: false`): dependencies are
 *   ignored — all PENDING tasks not in assigned/collected sets are eligible.
 * - Dependency pipeline mode: each PENDING task is eligible only when all
 *   its dependencies are in the done set.
 *
 * The function returns at most `slotsAvailable` tasks, in their natural
 * sprint.tasks ordering (caller decides whether to use FIFO or another order).
 *
 * Sprint 165 Bug Y fix — used by force re-scan path to detect orphan PENDING
 * tasks that the legacy `for (taskId of completedTaskIds)` loop missed.
 */
export function selectEligibleForSpawn(
  sprint: Sprint,
  config: Pick<ResolvedConfig, 'dependency_pipeline_enabled'> | undefined,
  slotsAvailable: number,
  assignedTaskIds: ReadonlySet<string>,
  collectedIds: ReadonlySet<string>,
): Task[] {
  if (slotsAvailable <= 0) return [];

  const depPipelineEnabled = config?.dependency_pipeline_enabled === true;
  const doneIds = new Set(
    sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
  );

  const eligible: Task[] = [];
  for (const task of sprint.tasks) {
    if (eligible.length >= slotsAvailable) break;
    if (task.status !== TaskStatus.PENDING) continue;
    if (assignedTaskIds.has(task.id)) continue;
    if (collectedIds.has(task.id)) continue;
    if (depPipelineEnabled && task.dependencies && task.dependencies.length > 0) {
      const allDone = task.dependencies.every(dep => doneIds.has(dep));
      if (!allDone) continue;
    }
    eligible.push(task);
  }
  return eligible;
}

/**
 * Pop the first eligible task from a FIFO queue, skipping any that are
 * already assigned. Mutates `remainingQueue` (shift).
 *
 * Used by processQueue to drain the queue while enforcing the idempotency
 * guard against duplicate TASK_ASSIGN (Bug F). Returns undefined when the
 * queue is exhausted or no eligible entry remains.
 *
 * Note: we deliberately do NOT skip on `collectedIds`. A task that is in
 * `remainingQueue` has not yet been spawned, so its presence in the
 * collected set indicates a synthetic test scenario or a race that should
 * still drain the slot (preserving the contract of the original
 * `for (taskId of completedTaskIds)` loop in task-queue.test.ts).
 *
 * Sprint 165 Bug Y fix.
 */
export function pickFromQueue(
  remainingQueue: Task[],
  assignedTaskIds: ReadonlySet<string>,
): Task | undefined {
  while (remainingQueue.length > 0) {
    const candidate = remainingQueue.shift();
    if (!candidate) return undefined;
    if (assignedTaskIds.has(candidate.id)) continue;
    return candidate;
  }
  return undefined;
}

/**
 * Validate task dependencies using topological sort.
 * Throws DependencyCycleError (DECKENT_E049) if circular dependencies are detected.
 * @returns ExecutionWave[] for informational purposes
 */
export function validateTaskDependencies(tasks: Task[]): import('./parallel-pipeline.js').ExecutionWave[] {
  const pipeline = new ParallelPipelineManager();
  return pipeline.createPipeline(
    tasks.map(t => ({ id: t.id, dependencies: t.dependencies ?? [] })),
  );
}

/**
 * Route all sprint tasks to providers using the TaskRouter.
 * Sets task.provider, task.assignedAgent, and task.assignedSkills based on routing decisions.
 * Exported for testability — called from runSprint Phase 1.5.
 * @param tasks - Array of tasks to route
 * @param config - Resolved config with skill_routing overrides
 * @param availableProviders - List of available provider names (from Connector or registry)
 */
export function routeSprintTasks(
  tasks: Task[],
  config: ResolvedConfig,
  availableProviders: ProviderName[],
): void {
  for (const task of tasks) {
    const routing = routeTask(task, config, availableProviders);
    task.provider = routing.provider;
    if (routing.agent !== 'generic') task.assignedAgent = routing.agent;
    if (routing.skills.length > 0) task.assignedSkills = routing.skills;
  }
}

// ─── State-Aware Worker Stop (Sprint 139 Task 015) ──────────────

/**
 * Stop a worker only if it's in a stoppable lifecycle state.
 *
 * This prevents the "No such container" race condition from Sprint 138:
 * worker writes DONE → container exits → Brain calls docker stop → container gone → error.
 *
 * @param taskId - Task ID (used to derive worker ID: `w-${taskId}`)
 * @param backend - Spawn backend with kill() method
 * @returns Object with `stopped` flag and the worker's lifecycle state
 */
export function stopWorkerIfStoppable(
  taskId: string,
  backend: SpawnBackend | undefined,
): { stopped: boolean; state: WorkerLifecycleState | 'UNKNOWN' } {
  const wid = `w-${taskId}`;

  if (!isWorkerStoppable(wid)) {
    // getAllWorkerStates().get() returns undefined if worker was already cleaned up
    const existingSm = getAllWorkerStates().get(wid);
    const currentState = existingSm?.state ?? 'UNKNOWN' as const;
    debugLog('stopWorkerIfStoppable:skip', `worker ${wid} in ${currentState} — skip stop`);
    return { stopped: false, state: currentState };
  }

  const sm = getWorkerStateMachine(wid);

  // Transition to ERROR before stopping (worker is being forcefully terminated)
  if (sm.canTransition('ERROR')) {
    sm.transition('ERROR');
  }

  if (backend) {
    backend.kill(taskId);
  }

  // Transition to EXITED after stop
  if (sm.canTransition('EXITED')) {
    sm.transition('EXITED');
  }

  // Cleanup state machine from registry
  removeWorkerStateMachine(wid);

  debugLog('stopWorkerIfStoppable:done', `worker ${wid} stopped and cleaned up`);
  return { stopped: true, state: 'EXITED' };
}

/**
 * Transition a worker's lifecycle state and emit to event stream.
 * Convenience wrapper used by Brain/result-collector when processing worker heartbeats.
 *
 * @param projectRoot - Project root for event stream
 * @param taskId - Task ID
 * @param newState - Target lifecycle state
 * @returns true if transition succeeded, false if invalid
 */
export function transitionWorkerState(
  projectRoot: string,
  taskId: string,
  newState: WorkerLifecycleState,
): boolean {
  const wid = `w-${taskId}`;
  const sm = getWorkerStateMachine(wid);

  if (!sm.canTransition(newState)) {
    debugLog('transitionWorkerState:invalid', `${wid}: ${sm.state} → ${newState} not allowed`);
    return false;
  }

  sm.transition(newState);

  const sprintId = getCurrentSprintId(projectRoot);
  if (sprintId) {
    writeEvent(
      projectRoot, sprintId, 'worker', 'brain',
      CHANNELS.HEARTBEAT,
      { workerId: wid, taskId, lifecycleState: sm.state },
    );
  }

  return true;
}

// ─── Runtime vs Code Discriminator — Cross-Dep Action (Sprint 139 Task 024) ─

/**
 * Evaluate a failed task and emit the correct cross-dependency action to the event stream.
 *
 * This is the entry point for the Runtime vs Code Discriminator in the spawner.
 * Called after a task is evaluated as NO_GO, before deciding whether to:
 *   - Retry the task (RUNTIME / AMBIGUOUS)
 *   - Cascade-block its dependents (CODE)
 *   - Spawn a fix worker (CODE)
 *
 * The classification and decision are emitted to the event stream so the
 * Auditor can observe and Brain can reconcile cascades.
 *
 * @param projectRoot - Project root for event stream writes
 * @param taskId - ID of the failed task
 * @param ctx - Failure context (exitCode, notes, errorOutput, resultFilePresent)
 * @returns CascadeDecision — callers use shouldRetry, shouldCascade, spawnFixWorker
 */
export function evaluateFailureCascade(
  projectRoot: string,
  taskId: string,
  ctx: FailureContext,
): CascadeDecision {
  const decision = decideCascadeAction(taskId, ctx);

  const sprintId = getCurrentSprintId(projectRoot);
  if (sprintId) {
    writeEvent(
      projectRoot, sprintId, 'brain', 'brain',
      CHANNELS.FIX_REQUEST,
      {
        taskId,
        failureCategory: decision.category,
        shouldRetry: decision.shouldRetry,
        shouldCascade: decision.shouldCascade,
        spawnFixWorker: decision.spawnFixWorker,
        reason: decision.reason,
        signals: (ctx.notes ?? '').slice(0, 200),
      },
    );
  }

  debugLog('evaluateFailureCascade', `task ${taskId}: ${decision.category} → retry=${decision.shouldRetry} cascade=${decision.shouldCascade}`);

  return decision;
}

// ─── Cascade Application Wire (Sprint 139 Task 029) ─────────────────────────

/**
 * Apply cascade blocking to a sprint after a task fails.
 *
 * Integrates evaluateFailureCascade (Task 024 discriminator) with
 * applyFailureCascade (Task 029 scheduler). Respects Alperen's Q1 risk-taking:
 *   - CODE failure → cascade block PENDING dependents → PAUSED
 *   - RUNTIME / AMBIGUOUS → no cascade (retry path, no blocking)
 *
 * Each PENDING → PAUSED transition is written to the event stream via
 * SCOPE_COLLISION_DETECTED channel (re-used as blocking signal) so the
 * Auditor can track blocked tasks.
 *
 * @param projectRoot - Project root for event stream writes
 * @param sprint - Sprint with tasks to potentially block
 * @param failedTaskId - Task evaluated as NO_GO
 * @param ctx - Failure context for classification
 * @returns CascadeDecision and list of newly blocked task IDs
 */
export function applyCascadeToSprint(
  projectRoot: string,
  sprint: Sprint,
  failedTaskId: string,
  ctx: FailureContext,
): { decision: CascadeDecision; blockedTaskIds: string[] } {
  const decision = evaluateFailureCascade(projectRoot, failedTaskId, ctx);

  if (!decision.shouldCascade) {
    // RUNTIME or AMBIGUOUS: no cascade, retry path
    return { decision, blockedTaskIds: [] };
  }

  // CODE failure: build graph and cascade-block transitive dependents
  const graph = buildDependencyGraph(sprint.tasks, /* includeCollisions */ false);
  const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;

  const cascadeResult = applyFailureCascade(graph, failedTaskId, sprint.tasks, {
    shouldCascade: decision.shouldCascade,
    failureCategory: decision.category,
    onTransition: (event) => {
      // Write each BLOCKED transition to event stream
      writeEvent(
        projectRoot, sprintId, 'auditor', 'brain',
        CHANNELS.SCOPE_COLLISION_DETECTED, // repurposed as cascade block signal
        {
          transition: event.transition,
          taskId: event.taskId,
          triggerTaskId: event.triggerTaskId,
          failureCategory: event.failureCategory,
          fromStatus: event.fromStatus,
          toStatus: event.toStatus,
          blockedBy: failedTaskId,
        },
      );
    },
  });

  debugLog(
    'applyCascadeToSprint',
    `Cascade applied: ${failedTaskId} (CODE) → ${cascadeResult.totalBlocked} tasks blocked`,
  );

  return { decision, blockedTaskIds: cascadeResult.blockedTaskIds };
}

/**
 * Apply unblocking to a sprint after a previously failed task is resolved.
 *
 * When a fix worker resolves a failed task (status → DONE), PAUSED dependents
 * whose all dependencies are now satisfied are re-enabled (PAUSED → PENDING).
 * Each UNBLOCKED transition is written to the event stream.
 *
 * @param projectRoot - Project root for event stream writes
 * @param sprint - Sprint with tasks to potentially unblock
 * @param resolvedTaskId - Task that was just resolved (DONE)
 * @returns List of task IDs that were unblocked (PAUSED → PENDING)
 */
export function applyUnblockToSprint(
  projectRoot: string,
  sprint: Sprint,
  resolvedTaskId: string,
): string[] {
  const graph = buildDependencyGraph(sprint.tasks, /* includeCollisions */ false);
  const doneTasks = new Set(
    sprint.tasks.filter(t => t.status === TaskStatus.DONE).map(t => t.id),
  );
  const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;

  const unblockResult = unblockDependents(graph, resolvedTaskId, sprint.tasks, doneTasks, (event) => {
    // ─── DEPENDENCY_UNBLOCKED: separate channel from BLOCKED ──────
    // ADR-037: Brain broadcasts unblock events so workers can resume
    // and Auditor can track the full BLOCKED→UNBLOCKED lifecycle.
    writeEvent(
      projectRoot, sprintId, 'brain', 'worker',
      'BRAIN→WORKER:DEPENDENCY_UNBLOCKED',
      {
        transition: event.transition,
        taskId: event.taskId,
        triggerTaskId: event.triggerTaskId,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        unblockedBy: resolvedTaskId,
      },
    );
  });

  debugLog(
    'applyUnblockToSprint',
    `Unblocked ${unblockResult.totalUnblocked} tasks after ${resolvedTaskId} resolved`,
  );

  return unblockResult.unblockedTaskIds;
}

// ─── Fresh-Eyes Rotation Emit (Sprint 156 Task 012) ─────────────────────────

/**
 * Read a fix task's persisted `rotationStrategy` from the task JSON file and
 * emit a METRIC_EMITTED event if present.
 *
 * The strategy is written by `applyFreshEyesRotation` in debt-manager.ts when
 * a NO_GO fix task is created. This helper provides spawn-time observability
 * so dashboards can see *when* rotation actually took effect.
 *
 * Failure of the rotation emit must never break worker spawn — all I/O is
 * try/catch wrapped and logged via debugLog.
 *
 * @param projectRoot - Project root for event stream + task file location
 * @param sprintFallbackId - Sprint ID fallback when getCurrentSprintId returns null
 * @param task - Task being spawned (only fix tasks emit; others are no-ops)
 */
export function emitRotationMetricIfApplicable(
  projectRoot: string,
  sprintFallbackId: string,
  task: Task,
): void {
  if (!task.isPriorityFix) return;
  try {
    const taskFilePath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
    const raw = readFileSafely(taskFilePath);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const strategy = parsed['rotationStrategy'] as FreshEyesRotationStrategy | undefined;
    if (!strategy || !strategy.enabled) return;

    const sprintId = getCurrentSprintId(projectRoot) ?? sprintFallbackId;
    writeEvent(
      projectRoot, sprintId, 'brain', '*',
      CHANNELS.METRIC_EMITTED,
      {
        name: 'fix.rotation.applied',
        value: 1,
        taskId: task.id,
        originalModel: strategy.originalModel,
        rotatedModel: strategy.rotatedModel,
        originalAgent: strategy.originalAgent,
        rotatedAgent: strategy.rotatedAgent,
        addedSkills: strategy.addedSkills,
      },
    );
    metric('fix.rotation.applied', 1, {
      task_id: task.id,
      from_model: strategy.originalModel,
      to_model: strategy.rotatedModel,
      from_agent: strategy.originalAgent,
      to_agent: strategy.rotatedAgent,
    });
  } catch (e) {
    debugLog('emitRotationMetricIfApplicable', e);
  }
}

/** Read a file's contents synchronously, returning null on any I/O error. */
function readFileSafely(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8');
  } catch { return null; }
}

// ─── Re-exports for external consumers ────────────────────────────
export { detectScopeCollisions, buildCollisionAwareWaves } from './conflict-resolver.js';
export type { CollisionResult, CollisionMap } from './conflict-resolver.js';
export type { FailureContext, CascadeDecision, FailureClassification, FailureCategory } from './result-evaluator.js';

// ─── Fresh-Eyes Rotation re-exports (Sprint 156 Task 012) ────────
export {
  applyFreshEyesRotation,
  rotateModelForFix,
  rotateAgentForFix,
} from './debt-manager.js';
export type { FreshEyesRotationStrategy } from './debt-manager.js';

// ─── Dependency Scheduler re-exports (Sprint 139 Task 028 + 029) ──
export {
  buildDependencyGraph,
  enforceWaveDependency,
  cascadeBlockDependents,
  unblockDependents,
  applyFailureCascade,
} from './dependency-scheduler.js';
export type {
  DependencyGraph,
  DependencyWave,
  EnforcementResult,
  CascadeResult,
  UnblockResult,
  CascadeBlockOptions,
  ApplyFailureCascadeResult,
  CascadeTransitionEvent,
  CascadeEventCallback,
} from './dependency-scheduler.js';
