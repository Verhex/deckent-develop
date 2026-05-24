// ═══ Sprint Controller (Thin Orchestration Layer) ══════════════════
// Sprint 136: Slimmed from ~1894 LoC to a thin barrel re-export layer.
// Only runSprint(), waitForResults(), and evaluateResult() remain here.
// All other functions are delegated to sub-modules:
//   sprint-planner.ts    — readContext, planSprint, confirmDraftTasks, cleanupDraftTasks
//   sprint-spawner.ts    — spawnWorkers, respawnEligibleTasks, validateTaskDependencies, routeSprintTasks
//   sprint-lifecycle.ts  — interrupt state, cleanup, pauseSprint, resumeSprint, waitForHumanApproval
//   sprint-finalizer.ts  — finalizeSprint, applyAdaptiveThresholds, runHonestyCheck, etc.
//   ipc-registry.ts      — IPC channel registry
//   result-collector.ts  — waitForResultsImpl, resolveAgentPrompt, resolveSkillPrompts

// ─── Node Builtins ─────────────────────────────────────────────────
import { readFile, stat, writeFile } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Core (value imports) ──────────────────────────────────────────
import {
  TaskEvaluation, SprintPhase,
  SprintStatus, TaskStatus,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskResult, Sprint,
  ResolvedConfig, ProviderName,
} from '../core/types.js';

import { TASKS_DIR } from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { readJsonSafe, debugLog, updateLastSprintId } from '../core/utils.js';

// ─── Core — adaptive timeout defaults (Sprint 192 Task 192-011) ────
import {
  DEFAULT_ADAPTIVE_MULTIPLIER,
  DEFAULT_RUNTIME_EXTENSION_MAX,
} from '../core/config.js';
import type { AdaptiveTimeoutFields } from '../core/config.js';

// ─── Core — provider abstraction ──────────────────────────────────
import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry } from '../core/provider.js';

// ─── Spawn backend abstraction ───────────────────────────────────
import type { SpawnBackend } from './spawn-backend.js';
import { SpawnBackendFactory } from './spawn-backend.js';

// ─── Connector (provider lifecycle) ─────────────────────────────
import type { Connector } from './connector.js';

// ─── Core — sprint lock ───────────────────────────────────────────
import { acquireSprintLock, releaseSprintLock } from '../core/multi-ide.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import {
  now, isDocTask,
  getDefaultProvider,
  writeSprintState, readSprintState, clearSprintState,
} from './sprint-utils.js';

// ─── Rollback (type-only — needed for safetyPoint variable typed in outer scope) ─
import type { SafetyPoint } from './rollback.js';

// ─── Sprint Phases (extracted phase functions) ──────────────────────
import {
  runPlanPhase, runSpawnPhase, runEvaluatePhase,
  runRollbackCheck, runFixPhase, runRetroPhase,
  runCleanupPhase, pollForResultFile,
} from './sprint-phases.js';

// ─── Worker Liveness (Sprint 192 W-INTEGRITY I-2 — pre-synthetic gate) ─
import { checkWorkerLiveness } from './worker-liveness.js';

// ─── Result Collector ─────────────────────────────────────────────
import {
  waitForResults as waitForResultsImpl,
} from './result-collector.js';

// ─── Coverage Validator ───────────────────────────────────────────
import { validateWorkerCoverage } from './coverage-validator.js';

// ─── Baseline Tracker ─────────────────────────────────────────────
import { captureVitestBaseline, writeBaseline } from './baseline-tracker.js';

// ─── PID Manager ─────────────────────────────────────────────────
import {
  writePid, clearPid, writeStateSnapshot,
} from './sprint-pid-manager.js';
import type { SprintStateSnapshot } from './sprint-pid-manager.js';

// ─── Node Builtins (sync I/O for kill-cascade metadata cleanup) ──
import { unlinkSync } from 'node:fs';
import { DECKENT_DIR } from '../core/constants.js';

// ─── Sprint Checkpoint (phase-transition auto-checkpoint) ────────
import { writePhaseCheckpoint, restoreSprintFromCheckpoint } from './sprint-checkpoint.js';

// ─── Event Bus (nervous system lifecycle hooks) ─────────────────
import { eventBus } from './event-bus.js';

// ─── Notify (DECKENT→USER:NOTIFY wire — Hot Fix H6) ─────────────
import { notify } from '../core/notify.js';

// ─── Directives Protection Baseline (Sprint 177 Task 5) ──────────
import { getActiveDirectivesProtection } from '../nervous/observer.js';

// ─── Panic Guard ─────────────────────────────────────────────────
import { PanicGuard } from '../core/panic-guard.js';

// ─── Observability ──────────────────────────────────────────────
import { metric, trace, structuredLog, initObservability, setObservabilitySprintId } from '../core/observability.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { loadPluginHooks } from '../core/plugin-hooks.js';

// ─── Auditor ──────────────────────────────────────────────────────
import { resetDashboard, updateDashboard } from '../monitor/auditor.js';

// ─── Lifecycle (interrupt, cleanup, etc.) ─────────────────────────
import {
  BrainError,
  setActiveSprint, clearActiveSprint, safeDashboardUpdate,
  waitForHumanApproval,
} from './sprint-lifecycle.js';

// ─── IPC Registry ─────────────────────────────────────────────────
import { getChannelRegistry } from './ipc-registry.js';

// ─── Spawner ──────────────────────────────────────────────────────
import {
  routeSprintTasks as routeSprintTasksImpl,
} from './sprint-spawner.js';

// ─── Task Mode Runner ─────────────────────────────────────────────
export { runTaskMode } from './task-mode-runner.js';
export type { TaskModeContext, TaskModeResult } from './task-mode-runner.js';

// ═══ Re-exports — backward compatibility ══════════════════════════
// All symbols previously exported from this file are re-exported
// from their new sub-module homes.

// --- sprint-planner.ts ---
export { readContext, planSprint, confirmDraftTasks, cleanupDraftTasks } from './sprint-planner.js';

// --- sprint-spawner.ts ---
export { spawnWorkers, respawnEligibleTasks, validateTaskDependencies, routeSprintTasks } from './sprint-spawner.js';

// --- sprint-lifecycle.ts ---
export {
  BrainError, setActiveSprint, clearActiveSprint, resetInterruptState,
  isInterrupted, interruptActiveSprint, cleanup, pauseSprint, resumeSprint,
  waitForHumanApproval, safeDashboardUpdate,
} from './sprint-lifecycle.js';
export type { PauseState, CheckpointPhase } from './sprint-lifecycle.js';

// --- sprint-utils.ts ---
export {
  isDocTask, isStaleTaskFile, isTmuxProvider,
  resolveDefaultUsageCli, getDefaultProvider, resolveTaskProvider,
  getSubprocessWorkerLogPath, readSubprocessWorkerLog, hasSubprocessWorkerLog,
  writeSprintState, readSprintState, clearSprintState,
  detectOrphanWorkers, buildSpawnRetryHint,
} from './sprint-utils.js';
export type { SprintState } from './sprint-utils.js';

// --- result-collector.ts ---
export { resolveAgentPrompt, resolveSkillPrompts } from './result-collector.js';

// --- ipc-registry.ts ---
export { getChannelRegistry, registerWorkerChannel, unregisterWorkerChannel } from './ipc-registry.js';

// --- sprint-finalizer.ts ---
export { finalizeSprint, applyAdaptiveThresholds, runHonestyCheck, writeRubricDetail, runSelfAuditGate } from './sprint-finalizer.js';
export type { FinalizeSprintOptions, SelfAuditResult } from './sprint-finalizer.js';

// --- parallel-pipeline.ts ---
export { DependencyCycleError } from './parallel-pipeline.js';

// ═══ Sprint 177 Task 177-003 — kill-cascade metadata cleanup ═══════
//
// `deckent kill --all` must leave zero stale metadata behind. Sprint 176
// evidence: after kill, sprint-state.json + {id}-checkpoint.json +
// {id}-gate.json + PID file all lingered for 43 minutes.
//
// Co-located with sprint-controller because these files are written by
// the sprint lifecycle (writeSprintState / writePhaseCheckpoint /
// finalizeSprint's gate writer) and clearPid is already imported here.
//
// Fail-safe: each removal is independently try/catched so a missing or
// permission-locked file never aborts the cascade.
/**
 * Remove all on-disk metadata produced by a sprint's lifecycle.
 *
 * Cleans:
 *   - `.deckent/sprint-state.json`        (global active-sprint marker)
 *   - `.deckent/{sprintId}-checkpoint.json` (phase-transition checkpoint)
 *   - `.deckent/{sprintId}-gate.json`       (self-audit gate result)
 *   - `.deckent/pids/{sprintId}.pid` + `.snapshot.json` (via clearPid)
 *
 * Called by `deckent kill --all` cascade. Idempotent.
 */
export function cleanupSprintMetadata(root: string, sprintId: string): void {
  const dir = join(root, DECKENT_DIR);

  // 1. global sprint-state.json (single file, not per-sprint)
  try {
    const p = join(dir, 'sprint-state.json');
    if (existsSync(p)) unlinkSync(p);
  } catch (e) { debugLog('cleanupSprintMetadata:sprint-state', e); }

  // 2. per-sprint checkpoint
  try {
    const p = join(dir, `${sprintId}-checkpoint.json`);
    if (existsSync(p)) unlinkSync(p);
  } catch (e) { debugLog('cleanupSprintMetadata:checkpoint', e); }

  // 3. per-sprint gate
  try {
    const p = join(dir, `${sprintId}-gate.json`);
    if (existsSync(p)) unlinkSync(p);
  } catch (e) { debugLog('cleanupSprintMetadata:gate', e); }

  // 4. PID + snapshot (delegates to sprint-pid-manager.clearPid)
  try { clearPid(root, sprintId); } catch (e) { debugLog('cleanupSprintMetadata:clearPid', e); }
}

// ═══ Sprint Lifecycle Event Helpers (Nervous System hooks) ════════

/**
 * Emit a sprint lifecycle event via the EventBus.
 * Always fires regardless of nervous system config — subscribers are optional.
 * NervousObserver listens for these as 'sprint-lifecycle' source events.
 */
function emitSprintEvent(
  type: string,
  payload: Record<string, unknown>,
): void {
  try {
    eventBus.emit('deckent-event', {
      type,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Never let event emission break sprint flow
  }
}

function emitPhaseChange(oldPhase: string, newPhase: string, sprintId: string): void {
  emitSprintEvent('SPRINT_PHASE_CHANGE', { oldPhase, newPhase, sprintId });
}

// ═══ Adaptive Timeout Helpers (Sprint 192 Task 192-011 — W-INTEGRITY I-5)
//
// User rule: "zaman sınırlarını daha geniş tutalım". These helpers are the
// single read-point for the two new `TimeoutConfig` knobs introduced in
// config.ts (`adaptive_multiplier`, `runtime_extension_max`). They live on
// the sprint-controller because the controller is already the lifecycle
// authority and is in this task's `scope.filesWrite`; sprint-phases.ts and
// timeout-estimator.ts are out-of-scope here and will wire to these helpers
// in a follow-up.
//
// All three helpers are pure, defensive, and safe to call with `undefined`
// config (returns the documented defaults). They never throw.

function readAdaptive(config?: ResolvedConfig): Partial<AdaptiveTimeoutFields> {
  // ResolvedConfig.timeout is typed as TimeoutConfig (no adaptive fields),
  // but the runtime object carries them when produced by mergeConfigs.
  return (config?.timeout ?? {}) as Partial<AdaptiveTimeoutFields>;
}

/**
 * Resolve the adaptive timeout multiplier for the active config.
 * Falls back to {@link DEFAULT_ADAPTIVE_MULTIPLIER} (1.5) when the config
 * is missing the field or the value is not a finite >= 1 number.
 */
export function getAdaptiveMultiplier(config?: ResolvedConfig): number {
  const v = readAdaptive(config).adaptive_multiplier;
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1.0) {
    return v;
  }
  return DEFAULT_ADAPTIVE_MULTIPLIER;
}

/**
 * Resolve the max number of heartbeat-aware runtime extensions allowed for
 * a single task. Falls back to {@link DEFAULT_RUNTIME_EXTENSION_MAX} (5)
 * when the config is missing the field or the value is invalid.
 *
 * Wire-point for sprint-phases.ts `RUNTIME_EXTENSION_MAX` (currently a hard
 * constant of 3 — to be replaced with a call to this helper).
 */
export function getRuntimeExtensionMax(config?: ResolvedConfig): number {
  const v = readAdaptive(config).runtime_extension_max;
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1) {
    return v;
  }
  return DEFAULT_RUNTIME_EXTENSION_MAX;
}

/**
 * Apply the adaptive multiplier to a base timeout (in seconds). Returns
 * `round(baseSeconds * multiplier)`. A non-positive `baseSeconds` (e.g.
 * `0` meaning "disabled") is returned unchanged so callers can opt out
 * with a sentinel.
 */
export function applyAdaptiveTimeout(
  baseSeconds: number,
  config?: ResolvedConfig,
): number {
  if (!Number.isFinite(baseSeconds) || baseSeconds <= 0) return baseSeconds;
  const multiplier = getAdaptiveMultiplier(config);
  return Math.round(baseSeconds * multiplier);
}

// ═══ Sprint 168 C0c — Plan↔Spawn Integration Helpers ══════════════
//
// Sprint 167 cascade root layer: the spawn pipeline operated on the in-memory
// plan-state object, never re-reading task.json from disk. Any manual patch
// applied between PLAN and SPAWN (recovery, --resume, race with Auditor) was
// invisible to TASK_ASSIGN payload. Combined with the missing collision
// subscriber (RC2) the pipeline emitted stale assignments that triggered the
// Sprint 167 Cluster C bug chain.
//
// Two helpers are exported here so the spawn pipeline (sprint-spawner) and
// recovery paths can consult them deterministically:
//   * readTaskJsonFresh — always disk read, no in-memory cache (RC3)
//   * consultCollisionDecision — wrap handleScopeCollision + emit
//     BRAIN→SPAWN:BLOCKED structured event (RC2)
//
// Both functions are fail-safe under standard sprint-controller convention.

import { handleScopeCollision } from './decision-engine.js';
import type { ScopeCollisionPayload, SpawnDecision } from './decision-engine.js';
import { writeEvent, CHANNELS, getCurrentSprintId } from './event-stream.js';

// ═══ Nervous System Wire (Sprint 180 W3-1, NERVOUS-TODO §11.2 Step D) ══
//
// `runSprint()` instantiates the nervous system at the top of its body and
// disposes it in a `finally` block, so a single sprint's pipeline owns the
// observer's lifetime. Default-off respect: when
// `config.nervous_system.enabled` is false (or undefined) the bootstrap
// returns `null` and no wire happens — the historical no-op behaviour is
// preserved exactly.
//
// Bootstrap module is loaded via *dynamic* import wrapped in try/catch so
// runSprint() continues to function even if `src/nervous/bootstrap.ts` is
// not present yet (W1-2 deliverable can land asynchronously to W3-1).

/**
 * Handle returned by `initNervousSystemForSprint()` — owns the observer
 * lifecycle. `dispose()` is idempotent and fail-safe.
 */
export interface NervousSystemHandle {
  dispose: () => void;
}

/**
 * Shape of the optional `src/nervous/bootstrap.ts` module (W1-2).
 * Resolved at runtime; absent module yields `null`.
 */
interface NervousBootstrapModule {
  createNervousSystemIfEnabled: (
    config: ResolvedConfig,
    projectRoot: string,
    sprintStateProvider: () => unknown,
  ) => NervousSystemHandle | null;
}

/**
 * Defensive dynamic import of the nervous bootstrap module.
 *
 * Returns `null` when:
 *   - module file is not present (W1-2 not landed yet)
 *   - module loaded but `createNervousSystemIfEnabled` export is missing
 *   - dynamic import throws for any other reason
 *
 * Module path stored in a variable so the TypeScript compiler does not
 * resolve it at build time — runtime ESM resolver loads it on demand.
 */
export async function loadNervousBootstrap(): Promise<NervousBootstrapModule | null> {
  try {
    const modulePath = '../nervous/bootstrap.js';
    const mod = (await import(modulePath)) as Partial<NervousBootstrapModule>;
    if (typeof mod.createNervousSystemIfEnabled !== 'function') return null;
    return mod as NervousBootstrapModule;
  } catch (e) {
    debugLog('loadNervousBootstrap', e);
    return null;
  }
}

/**
 * Late-binding fetch for `getSprintStateSnapshot` from
 * `sprint-state-tracker.ts` (W1-1 deliverable). Same defensive contract
 * as `loadNervousBootstrap` — returns a fallback that yields `null` when
 * the tracker module is not yet available.
 */
async function loadSprintStateProvider(projectRoot: string): Promise<() => unknown> {
  try {
    const modulePath = './sprint-state-tracker.js';
    const mod = (await import(modulePath)) as {
      getSprintStateSnapshot?: (root: string) => unknown;
    };
    if (typeof mod.getSprintStateSnapshot === 'function') {
      const fn = mod.getSprintStateSnapshot;
      // Bind projectRoot — observer calls sprintStateProvider() with no args.
      // Without this wrapper getSprintStateSnapshot(undefined) crashes at
      // join(undefined, ...) in readSprintState. Sprint 180 W3-1 wire bug,
      // discovered Sprint 182 dogfood 2026-05-21.
      return () => fn(projectRoot);
    }
  } catch (e) {
    debugLog('loadSprintStateProvider', e);
  }
  return () => null;
}

/**
 * Initialise the nervous system for a sprint.
 *
 * Wire contract (NERVOUS-TODO §11.2 Step D):
 *   - `config.nervous_system?.enabled !== true` → return `null` (default-off respect)
 *   - bootstrap module missing → return `null`
 *   - bootstrap returns `null` (its own default-off check) → return `null`
 *   - otherwise → return handle whose `dispose()` is wired to observer
 *     teardown
 *
 * Fail-safe: any exception during bootstrap call is logged and treated as
 * "nervous not active" so runSprint never aborts on a meta-orchestrator
 * fault.
 */
export async function initNervousSystemForSprint(
  config: ResolvedConfig,
  projectRoot: string,
  bootstrapLoader: () => Promise<NervousBootstrapModule | null> = loadNervousBootstrap,
  sprintStateProviderLoader: (root: string) => Promise<() => unknown> = loadSprintStateProvider,
): Promise<NervousSystemHandle | null> {
  if (config.nervous_system?.enabled !== true) return null;

  const bootstrap = await bootstrapLoader();
  if (!bootstrap) return null;

  try {
    const sprintStateProvider = await sprintStateProviderLoader(projectRoot);
    return bootstrap.createNervousSystemIfEnabled(config, projectRoot, sprintStateProvider);
  } catch (e) {
    debugLog('initNervousSystemForSprint', e);
    return null;
  }
}

/**
 * Dispose the nervous system handle. No-op when `handle` is `null`.
 * Wrapped in try/catch so a dispose failure cannot mask the sprint's
 * own return value or exception.
 */
export function disposeNervousSystem(handle: NervousSystemHandle | null): void {
  if (!handle) return;
  try {
    handle.dispose();
  } catch (e) {
    debugLog('disposeNervousSystem', e);
  }
}

/**
 * Sprint 168 C0c RC3 — always-fresh disk read of task.json.
 *
 * No in-memory cache; every call hits the filesystem. Used by spawn pipeline
 * (TASK_ASSIGN flow) and recovery paths to detect manual patches between
 * PLAN and SPAWN phases.
 *
 * @throws Error when task.json file not found at expected path.
 */
export function readTaskJsonFresh(projectRoot: string, taskId: string): Task {
  const path = join(projectRoot, TASKS_DIR, `task-${taskId}.json`);
  if (!existsSync(path)) {
    throw new Error(`task.json not found: ${path}`);
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as Task;
}

/**
 * Sprint 168 C0c RC2 — wire-layer consult for scope collision decisions.
 *
 * Calls the pure decision function from decision-engine.ts, then — when the
 * decision is 'block' — emits a BRAIN→SPAWN:BLOCKED structured event via
 * the event stream so observers (Auditor dashboard, history replay) see the
 * blocked spawn.
 *
 * The spawn pipeline checks the returned action and, on 'block', skips the
 * TASK_ASSIGN emit + worker spawn for the listed tasks.
 *
 * Fail-safe: event stream write failures do not throw.
 */
export function consultCollisionDecision(
  projectRoot: string,
  sprintId: string,
  payload: ScopeCollisionPayload,
): SpawnDecision {
  const decision = handleScopeCollision(payload);
  if (decision.action === 'block') {
    try {
      writeEvent(
        projectRoot,
        sprintId,
        'brain',
        'worker',
        CHANNELS.SPAWN_BLOCKED,
        {
          taskIds: decision.taskIds,
          files: payload.files,
          reason: decision.reason,
          detectedAt: payload.detectedAt,
        },
      );
    } catch (e) {
      debugLog('consultCollisionDecision:writeEvent', e);
    }
  }
  return decision;
}

// ═══ RunSprintOptions ═════════════════════════════════════════════

export interface RunSprintOptions {
  autoApprove?: boolean;
  sandboxMode?: boolean;
  testMode?: boolean;
  skipCleanup?: boolean;
  timeoutMs?: number;
  /** Fix phase timeout in milliseconds (default: 10 minutes) */
  fixPhaseTimeoutMs?: number;
  /** Optional SpawnBackend override -- defaults to SpawnBackendFactory.create() */
  spawnBackend?: SpawnBackend;
  /** Optional ProviderAdapter override */
  provider?: ProviderAdapter;
  /**
   * Enable git rollback safety mechanism.
   * When true (default): creates a safety branch before PLAN phase and
   * offers rollback when all tasks result in NO_GO.
   * When false: disables rollback entirely.
   */
  rollback?: boolean;
  /** Optional Connector instance — when provided, router uses connector.getAvailableProviders() */
  connector?: Connector;
}

// ═══ Core Functions (kept in this file) ═══════════════════════════

/**
 * Wait for task result files to appear on disk using fs.watch with fallback polling.
 * Supports queued task execution: as workers finish, queued tasks are spawned.
 * Delegates to result-collector.ts (extracted Phase 3).
 */
export async function waitForResults(
  projectRoot: string,
  sprint: Sprint,
  timeoutMs?: number,
  queue?: Task[],
  spawnOpts?: { autoApprove?: boolean; spawnBackend?: SpawnBackend },
  config?: ResolvedConfig,
): Promise<TaskResult[]> {
  return trace('wait_results', () =>
    waitForResultsImpl(projectRoot, sprint, timeoutMs, queue, spawnOpts, getChannelRegistry(), config),
  );
}

/**
 * Evaluate a worker's task result and return DONE, GO_WITH_TECH_DEBT, or NO_GO.
 * Checks self-assessment, test results, doc-task status, and coverage threshold (90%).
 */
export function evaluateResult(result: TaskResult, task: Task, vitestJsonOutput?: string, coverageThreshold = 90): TaskEvaluation {
  const evalStart = Date.now();
  try {
  if (result.selfAssessment === 'NO_GO') return TaskEvaluation.NO_GO;
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT') return TaskEvaluation.GO_WITH_TECH_DEBT;
  if (!result.testsPassed) return TaskEvaluation.NO_GO;
  if (isDocTask(task)) return TaskEvaluation.DONE;

  // Coverage validation: if vitest JSON output provided, validate reported vs actual
  if (vitestJsonOutput !== undefined) {
    const coverageCheck = validateWorkerCoverage({
      reportedCoverage: result.coverage,
      vitestJsonOutput,
      taskScope: { directories: task.scope?.directories ?? [] },
    });
    if (coverageCheck && coverageCheck.level === 'WARNING') {
      return TaskEvaluation.GO_WITH_TECH_DEBT;
    }
  }

  if (result.coverage < coverageThreshold) return TaskEvaluation.GO_WITH_TECH_DEBT;
  return TaskEvaluation.DONE;
  } finally {
    metric('eval.duration_ms', Date.now() - evalStart, { taskId: task.id });
  }
}

/**
 * Execute a full sprint lifecycle: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP.
 * Supports human checkpoints, configurable timeout, and provider routing.
 */
export async function runSprint(
  projectRoot: string,
  config: ResolvedConfig,
  opts?: RunSprintOptions,
): Promise<Sprint> {
  // Mode guard: task mode cannot use sprint lifecycle
  if (config.deckent_style === 'task') {
    throw new BrainError(
      'Sprint mode required for runSprint. Use runTaskMode for task style. ' +
      'Set deckent_style=sprint or run `deckent mode sprint`.',
      SprintPhase.PLAN,
    );
  }

  const routingVersionForFix = config.routing_engine ?? 'v1';

  const spawnBackend: SpawnBackend | undefined = opts?.spawnBackend
    ?? (config.spawn_backend
      ? SpawnBackendFactory.create({
          backend: config.spawn_backend,
          projectDir: projectRoot,
          dockerImage: config.docker_image,
          dockerTimeoutSeconds: config.docker_timeout,
        })
      : undefined);

  const activeProvider: ProviderAdapter | null = opts?.provider ?? getDefaultProvider();
  const rollbackEnabled = opts?.rollback !== false;

  initObservability(projectRoot);
  structuredLog('info', 'Sprint starting', { sprintPhase: 'INIT' });

  try {
    await loadPluginHooks(projectRoot);
  } catch (e) { debugLog('runSprint:loadPluginHooks', e); }

  // Sprint Lock
  const sprintLockId = `sprint-${Date.now()}`;
  const lockAcquired = acquireSprintLock(projectRoot, sprintLockId);
  if (!lockAcquired) {
    throw new BrainError(
      'Another sprint is already running in this project. Use --force or wait for the active sprint to complete.',
      SprintPhase.PLAN,
    );
  }

  // ═══ Nervous System Wire (Sprint 180 W3-1, NERVOUS-TODO §11.2 Step D) ══
  // Lives for the duration of this sprint; disposed in the finally block
  // below regardless of how runSprint exits (success, abort, throw).
  // Default-off respect: returns null when `nervous_system.enabled !== true`.
  const nervous = await initNervousSystemForSprint(config, projectRoot);

  try {
  // ═══ State Recovery on Brain Restart (Sprint 162 — Task T-004) ════
  // Pair with T-002 (checkpoint loop) and T-001 (exception handler).
  // If the previous Brain process left a sprint-state.json behind,
  // attempt to restore from the latest checkpoint. Fail-soft: any error
  // falls through to the normal PLAN path.
  let isResumeEvaluate = false;
  let recoveredSprint: Sprint | null = null;
  const resumeResults: TaskResult[] = [];
  try {
    const prevState = readSprintState(projectRoot);
    const prevSprintId = prevState?.sprintId;
    if (prevSprintId) {
      const recovery = restoreSprintFromCheckpoint(projectRoot, prevSprintId);
      if (recovery.restored) {
        if (recovery.action === 'complete') {
          emitSprintEvent('SPRINT_RESUME_COMPLETE', { sprintId: prevSprintId });
          const completed = recovery.restoredSprint!;
          completed.completedAt = now();
          releaseSprintLock(projectRoot);
          clearActiveSprint();
          clearSprintState(projectRoot);
          return completed;
        }
        if (recovery.action === 'resume-evaluate') {
          emitSprintEvent('SPRINT_RESUME', {
            sprintId: prevSprintId,
            staleWithResult: recovery.staleTasksWithResult,
            staleMarkedNoGo: recovery.staleTasksMarkedNoGo,
          });
          isResumeEvaluate = true;
          recoveredSprint = recovery.restoredSprint ?? null;
          if (recoveredSprint) {
            for (const t of recoveredSprint.tasks) {
              const resPath = join(projectRoot, TASKS_DIR, `task-${t.id}.result`);
              const r = readJsonSafe<TaskResult>(resPath);
              if (r) resumeResults.push(r);
            }
          }
        }
      }
    }
  } catch (e) { debugLog('runSprint:stateRecovery', e); }

  // ─── Outer-scope variables (shared between fresh and resume paths) ──
  let sprint: Sprint;
  let safetyPoint: SafetyPoint | null = null;
  let scanInterval: ReturnType<typeof setInterval> | null = null;
  let snapshotInterval: ReturnType<typeof setInterval> | null = null;
  let results: TaskResult[] = [];
  let beforeExitHandler: (() => void) | null = null;

  if (isResumeEvaluate && recoveredSprint) {
    // ─── Resume Path: skip PLAN/SPAWN/EXECUTE, jump to EVALUATE ─────
    sprint = recoveredSprint;
    setObservabilitySprintId(sprint.id, { perSprintFile: true });
    setActiveSprint(projectRoot, sprint, spawnBackend);
    try { writePid(projectRoot, sprint.id); } catch (e) { debugLog('runSprint:writePid', e); }
    writeSprintState(projectRoot, sprint);
    results = resumeResults;
  } else {
    // ─── Fresh Path: PLAN → SPAWN → EXECUTE ─────────────────────────
    // Phase 1: PLAN
    const planResult = await runPlanPhase(
      projectRoot, config, opts, activeProvider, rollbackEnabled,
    );
    sprint = planResult.sprint;
    safetyPoint = planResult.safetyPoint;

    // Set sprint ID for observability tagging (sprintId available after plan phase)
    setObservabilitySprintId(sprint.id, { perSprintFile: true });

    // Human Checkpoint: PLAN
    if (config.human_checkpoints?.includes('plan')) {
      const taskSummary = `${sprint.tasks.length} task planlandı: ${sprint.tasks.map(t => t.title).join(', ')}`;
      const approved = await waitForHumanApproval(projectRoot, sprint.id, 'plan', taskSummary);
      if (!approved) {
        sprint.status = SprintStatus.ABORTED;
        sprint.completedAt = now();
        clearActiveSprint();
        releaseSprintLock(projectRoot);
        clearSprintState(projectRoot);
        return sprint;
      }
    }

    setActiveSprint(projectRoot, sprint, spawnBackend);

    // PID + Snapshot Setup
    try { writePid(projectRoot, sprint.id); } catch (e) { debugLog('runSprint:writePid', e); }

    const writePeriodicSnapshot = async (): Promise<void> => {
      try {
        const snap: SprintStateSnapshot = {
          sprintId: sprint.id,
          pid: process.pid,
          startedAt: sprint.startedAt ?? new Date().toISOString(),
          currentWave: 0,
          taskStatuses: Object.fromEntries(sprint.tasks.map(t => [t.id, t.status])),
          metricsJsonlSize: 0,
          lastHeartbeat: new Date().toISOString(),
        };
        try {
          const metricsPath = join(projectRoot, '.deckent', 'metrics.jsonl');
          try {
            const metricsContent = await readFile(metricsPath, 'utf-8');
            snap.metricsJsonlSize = metricsContent.split('\n').filter(Boolean).length;
          } catch { /* file doesn't exist or not readable — non-fatal */ }
        } catch { /* non-fatal */ }
        writeStateSnapshot(projectRoot, sprint.id, snap);
      } catch (e) { debugLog('runSprint:writeStateSnapshot', e); }
    };

    void writePeriodicSnapshot();
    snapshotInterval = setInterval(() => void writePeriodicSnapshot(), 30_000);

    beforeExitHandler = (): void => {
      try { void writePeriodicSnapshot(); } catch { /* best effort */ }
      try { clearPid(projectRoot, sprint.id); } catch { /* best effort */ }
    };
    process.on('beforeExit', beforeExitHandler);

    // Phase 1.5: Route tasks to providers
    try {
      const connector = opts?.connector;
      const availableProviders = connector
        ? connector.getAvailableProviders()
        : providerRegistry.listProviders() as ProviderName[];
      routeSprintTasksImpl(sprint.tasks, config, availableProviders);
    } catch (e) { debugLog('runSprint:routeSprintTasks', e); }

    try { updateLastSprintId(projectRoot, sprint.id); } catch (e) { debugLog('runSprint:updateLastSprintId', e); }
    try { resetDashboard(projectRoot, sprint.id, sprint.tasks.length); } catch (e) { debugLog('runSprint:resetDashboard', e); }
    writeSprintState(projectRoot, sprint);

    // Phase 1.9: Capture pre-sprint test baseline
    try {
      const captured = captureVitestBaseline(projectRoot);
      if (captured) writeBaseline(projectRoot, sprint.id, captured);
    } catch (e) { debugLog('runSprint:baseline', e); }

    // Phase-transition checkpoint: PLAN complete
    try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:plan', e); }

    // Nervous System: PLAN→SPAWN + SPRINT_STARTED
    emitPhaseChange(SprintPhase.PLAN, SprintPhase.SPAWN, sprint.id);
    emitSprintEvent('SPRINT_STARTED', { sprintId: sprint.id, taskCount: sprint.tasks.length });

    // Refresh directives_protection baseline so auto_restore uses current DIRECTIVES.md.
    // Sprint 177 fix: prevents restoring a stale sprint's directives on sprint boundary.
    try { getActiveDirectivesProtection()?.updateBaseline(); } catch (e) { debugLog('runSprint:directivesBaseline', e); }

    // DECKENT→USER:NOTIFY (Hot Fix H6) — fire-and-forget, fail-safe
    try {
      void notify(
        'sprint-started',
        sprint.id,
        `Sprint ${sprint.id} başladı`,
        `${sprint.tasks.length} task planlandı`,
      );
    } catch (e) { debugLog('runSprint:notify:sprint-started', e); }

    // Phase 2: SPAWN
    const { taskQueue, scanInterval: initialScanInterval } = await runSpawnPhase(
      projectRoot, sprint, config, opts, spawnBackend,
    );
    scanInterval = initialScanInterval;

    // ─── Sprint 192 Task 192-009 — Dispatch loop assignedWorker wire ───
    // W-INTEGRITY I-3: spawn-spawner sets task.status=EXECUTING + persists
    // to disk, but the in-memory task.assignedWorker stays undefined until
    // the worker claims on disk. Mirror w-<id> in-memory for dispatched
    // tasks (status=EXECUTING and NOT in the deferred-queue list) so
    // worker-liveness L1 signal and the EVALUATE entry guard see consistent
    // state even before the worker's claim-write lands.
    try {
      const queuedSet = new Set(taskQueue.map(t => t.id));
      for (const task of sprint.tasks) {
        if (queuedSet.has(task.id)) continue;
        if (task.status === TaskStatus.EXECUTING && !task.assignedWorker) {
          task.assignedWorker = `w-${task.id}`;
        }
      }
    } catch (e) { debugLog('runSprint:wireAssignedWorker', e); }

    // Phase-transition checkpoint: SPAWN complete
    try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:spawn', e); }

    // Nervous System: SPAWN→EXECUTE
    emitPhaseChange(SprintPhase.SPAWN, SprintPhase.EXECUTE, sprint.id);

    // Phase 3: EXECUTE
    try {
      sprint.phase = SprintPhase.EXECUTE;
      writeSprintState(projectRoot, sprint);
      results = await waitForResults(projectRoot, sprint, opts?.timeoutMs, taskQueue, { autoApprove: opts?.autoApprove, spawnBackend }, config);
    } catch (err) {
      safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Post-collect sweep
    try {
      const preGraceCollectedIds = new Set(results.map(r => r.taskId));
      for (const task of sprint.tasks) {
        if (preGraceCollectedIds.has(task.id)) continue;
        const latePath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
        const lateExists = await stat(latePath).then(() => true, () => false);
        if (lateExists) {
          const lateResult = readJsonSafe<TaskResult>(latePath);
          if (lateResult) results.push(lateResult);
        }
      }
    } catch (e) { debugLog('postCollect:main', e); }

    // Grace period (async file checks — Sprint 136 async I/O migration)
    try {
      const collectedIds = new Set(results.map(r => r.taskId));
      const staleWorkers: Task[] = [];
      for (const t of sprint.tasks) {
        if (collectedIds.has(t.id)) continue;
        const hbPath = join(projectRoot, TASKS_DIR, `task-${t.id}.hb`);
        const resultPath = join(projectRoot, TASKS_DIR, `task-${t.id}.result`);
        const [hbExists, resExists] = await Promise.all([
          stat(hbPath).then(() => true, () => false),
          stat(resultPath).then(() => true, () => false),
        ]);
        if (hbExists && !resExists) staleWorkers.push(t);
      }

      if (staleWorkers.length > 0) {
        const GRACE_PERIOD_MS = 5 * 60 * 1000;
        await new Promise(resolve => setTimeout(resolve, GRACE_PERIOD_MS));

        for (const task of staleWorkers) {
          const resultPath = join(projectRoot, TASKS_DIR, `task-${task.id}.result`);
          const resultExists = await stat(resultPath).then(() => true, () => false);
          if (resultExists) {
            const lateResult = readJsonSafe<TaskResult>(resultPath);
            if (lateResult) results.push(lateResult);
          } else {
            // ─── Sprint 192 Task 192-001 — W-INTEGRITY I-2 ────────────
            // Memory: [[feedback_no_synthetic_results]] — sentetik NO_GO yasak.
            // Sprint 191 hotfix sprint-phases.ts:1120 pattern'i; iki
            // sprint-controller grace-kill bloğunu (cleanup + recover path)
            // 5-layer worker liveness check ile öne kapısı.
            //   never-spawned → SKIP synthetic; NEVER_DISPATCHED event;
            //                   continue (task DEFERRED'a kalır, kill atılmaz).
            //   alive         → 60s grace poll; result lands → evaluate,
            //                   else fall through with `liveness=alive` tag.
            //   dead          → genuine timeout, synthetic NO_GO ile devam,
            //                   notes'a `liveness=dead` ekle.
            const liveness = checkWorkerLiveness(task, projectRoot);
            if (liveness.status === 'never-spawned') {
              debugLog(
                'graceKill:never-dispatched',
                `task=${task.id} reason=${liveness.reason}`,
              );
              try {
                const sidNd = getCurrentSprintId(projectRoot) ?? sprint.id;
                writeEvent(
                  projectRoot, sidNd, 'brain', 'worker',
                  'BRAIN→WORKER:NEVER_DISPATCHED',
                  {
                    taskId: task.id,
                    reason: liveness.reason,
                    signals: liveness.signals,
                    source: 'grace-kill',
                  },
                );
              } catch (e) { debugLog('graceKill:nd-event', e); }
              continue;
            }
            if (liveness.status === 'alive') {
              debugLog(
                'graceKill:alive-grace',
                `task=${task.id} ${liveness.reason} — granting 60s grace poll`,
              );
              const graceResult = await pollForResultFile(projectRoot, task.id, 60_000);
              if (graceResult) {
                debugLog(
                  'graceKill:alive-grace-hit',
                  `task=${task.id} produced .result during grace window`,
                );
                results.push(graceResult);
                continue;
              }
              debugLog(
                'graceKill:alive-grace-miss',
                `task=${task.id} no .result after grace 60s — falling through with liveness=alive label`,
              );
            }

            // Panic Guard: require user approval before killing workers
            const panicGuard = new PanicGuard(projectRoot);
            const decision = panicGuard.evaluate(
              task.id,
              task.assignedWorker ?? `w-${task.id}`,
              sprint.id,
              'grace_period_timeout',
              undefined, // no force/userExplicit — default BLOCK
              'Worker had heartbeat but failed to write result within grace period',
            );

            if (decision === 'BLOCK') {
              debugLog('graceKill:panicGuard', `Kill blocked for task ${task.id} — user approval required`);
              const syntheticResult: TaskResult = {
                // checkWorkerLiveness gate applied above — liveness=${liveness.status}
                taskId: task.id,
                workerId: task.assignedWorker ?? `w-${task.id}`,
                filesChanged: [],
                linesAdded: 0,
                linesRemoved: 0,
                testsPassed: false,
                coverage: 0,
                selfAssessment: 'NO_GO',
                notes: `Worker had heartbeat but failed to write result within grace period — kill blocked by panic guard (user approval required); liveness=${liveness.status}`,
              };
              try {
                await writeFile(resultPath, JSON.stringify(syntheticResult, null, 2), 'utf-8');
              } catch (e) { debugLog('graceKill:writeResult', e); }
              results.push(syntheticResult);
            } else {
              try {
                if (spawnBackend) spawnBackend.kill(task.id);
                else {
                  const { killWorker: kw } = await import('./tmux.js');
                  kw(task.id);
                }
              } catch (e) { debugLog('graceKill:killWorker', e); }

              const syntheticResult: TaskResult = {
                // checkWorkerLiveness gate applied above — liveness=${liveness.status}
                taskId: task.id,
                workerId: task.assignedWorker ?? `w-${task.id}`,
                filesChanged: [],
                linesAdded: 0,
                linesRemoved: 0,
                testsPassed: false,
                coverage: 0,
                selfAssessment: 'NO_GO',
                notes: `Worker had heartbeat but failed to write result within grace period — killed (user-explicit override); liveness=${liveness.status}`,
              };
              try {
                await writeFile(resultPath, JSON.stringify(syntheticResult, null, 2), 'utf-8');
              } catch (e) { debugLog('graceKill:writeResult', e); }
              results.push(syntheticResult);
            }
          }
        }
      }
    } catch (e) { debugLog('graceKill:main', e); }

    // Phase-transition checkpoint: EXECUTE complete
    try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:execute', e); }

    // Nervous System: EXECUTE→EVALUATE
    emitPhaseChange(SprintPhase.EXECUTE, SprintPhase.EVALUATE, sprint.id);
  }

  // Phase 4: EVALUATE
  // Sprint 179 W2-4: EVALUATE gates on the immutable hard floor, not the
  // adaptive aspirational target. Finalizer auto-learn may lower
  // `coverage_aspirational` over time; the gate must not slide with it.
  const evaluations = new Map<string, TaskEvaluation>();

  // ─── Sprint 192 Task 192-009 — Dispatcher deadline → DEFERRED set ───
  // W-INTEGRITY I-3: by the time waitForResults returns, the dispatcher has
  // exhausted its wait window (effort×2-3x via existing timeout config).
  // Any task with no .result AND no .hb AND no assignedWorker AND still
  // PENDING/DRAFT was never reached — mark DEFERRED so the EVALUATE entry
  // guard proceeds rather than blocking the sprint on a wave that will
  // never fire. Fail-safe: any I/O issue collapses to "no deferred".
  const deferredTaskIds = new Set<string>();
  try {
    const collectedResultIds = new Set(results.map(r => r.taskId));
    for (const t of sprint.tasks) {
      if (collectedResultIds.has(t.id)) continue;
      const resultPath = join(projectRoot, TASKS_DIR, `task-${t.id}.result`);
      if (existsSync(resultPath)) continue;
      const hbPath = join(projectRoot, TASKS_DIR, `task-${t.id}.hb`);
      const hasHb = existsSync(hbPath);
      const hasWorker = typeof t.assignedWorker === 'string' && t.assignedWorker.length > 0;
      const isPrePending = t.status === TaskStatus.PENDING || t.status === TaskStatus.DRAFT;
      if (!hasHb && !hasWorker && isPrePending) {
        deferredTaskIds.add(t.id);
      }
    }
    if (deferredTaskIds.size > 0) {
      try {
        const sidForDef = getCurrentSprintId(projectRoot) ?? sprint.id;
        writeEvent(
          projectRoot, sidForDef, 'brain', 'worker',
          'BRAIN→WORKER:DISPATCH_DEADLINE_EXCEEDED',
          {
            taskIds: [...deferredTaskIds],
            reason: 'never-dispatched-after-wait',
            totalTasks: sprint.tasks.length,
            collectedResults: results.length,
            timestamp: new Date().toISOString(),
          },
        );
      } catch (e) { debugLog('runSprint:dispatchDeferredEvent', e); }
    }
  } catch (e) { debugLog('runSprint:computeDeferred', e); }

  await runEvaluatePhase(
    projectRoot, sprint, results, evaluations, config.coverage_hard_floor,
    undefined, undefined, deferredTaskIds, { enforceDispatchGate: true },
  );

  // Honesty Check Metrics
  {
    const HONESTY_PATTERNS = [/pre-existing/i, /unrelated/i];
    for (const r of results) {
      if (r.notes && HONESTY_PATTERNS.some(p => p.test(r.notes))) {
        metric('honesty.check', 1, { taskId: r.taskId });
      }
    }
  }

  runRollbackCheck(projectRoot, sprint, evaluations, rollbackEnabled, safetyPoint);

  // Human Checkpoint: EVALUATE
  if (config.human_checkpoints?.includes('evaluate')) {
    const goCount = [...evaluations.values()].filter(e => e === TaskEvaluation.DONE).length;
    const noGoCount = [...evaluations.values()].filter(e => e === TaskEvaluation.NO_GO).length;
    const debtCount = [...evaluations.values()].filter(e => e === TaskEvaluation.GO_WITH_TECH_DEBT).length;
    const evalSummary = `Değerlendirme: ${goCount} GO, ${debtCount} TECH_DEBT, ${noGoCount} NO_GO — toplam ${evaluations.size} task`;
    const approved = await waitForHumanApproval(projectRoot, sprint.id, 'evaluate', evalSummary);
    if (!approved) {
      sprint.status = SprintStatus.ABORTED;
      sprint.completedAt = now();
      clearActiveSprint();
      releaseSprintLock(projectRoot);
      clearSprintState(projectRoot);
      return sprint;
    }
  }

  // Human Checkpoint: FIX
  if (config.human_checkpoints?.includes('fix')) {
    const noGoTasks = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.NO_GO);
    if (noGoTasks.length > 0) {
      const fixSummary = `Fix fazı başlayacak: ${noGoTasks.length} NO_GO task — ${noGoTasks.map(t => t.title).join(', ')}`;
      const approved = await waitForHumanApproval(projectRoot, sprint.id, 'fix', fixSummary);
      if (!approved) {
        sprint.status = SprintStatus.ABORTED;
        sprint.completedAt = now();
        clearActiveSprint();
        releaseSprintLock(projectRoot);
        clearSprintState(projectRoot);
        return sprint;
      }
    }
  }

  // Phase-transition checkpoint: EVALUATE complete
  try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:evaluate', e); }

  // Nervous System: EVALUATE→FIX
  emitPhaseChange(SprintPhase.EVALUATE, SprintPhase.FIX, sprint.id);

  // Phase 5: FIX
  await runFixPhase(projectRoot, sprint, evaluations, results, config, opts, routingVersionForFix, spawnBackend);

  // Phase-transition checkpoint: FIX complete
  try { writePhaseCheckpoint(projectRoot, sprint, sprint.phase); } catch (e) { debugLog('runSprint:checkpoint:fix', e); }

  // Nervous System: FIX→RETRO
  emitPhaseChange(SprintPhase.FIX, SprintPhase.RETRO, sprint.id);

  // Phase 6+7: RETRO + DECAY
  await runRetroPhase(projectRoot, sprint, evaluations, results, config, opts?.testMode);

  // Nervous System: RETRO complete + RETRO→CLEANUP
  emitSprintEvent('SPRINT_RETRO_COMPLETE', { sprintId: sprint.id });
  emitPhaseChange(SprintPhase.RETRO, SprintPhase.DECAY, sprint.id);

  // Phase 8: CLEANUP
  scanInterval = runCleanupPhase(projectRoot, sprint, config, opts, scanInterval, spawnBackend);

  // Nervous System: CLEANUP→COMPLETE
  emitPhaseChange(SprintPhase.DECAY, SprintPhase.COMPLETE, sprint.id);

  sprint.status = SprintStatus.COMPLETE;
  sprint.phase = SprintPhase.COMPLETE;
  sprint.completedAt = now();

  // Nervous System: SPRINT_COMPLETED
  emitSprintEvent('SPRINT_COMPLETED', { sprintId: sprint.id });

  releaseSprintLock(projectRoot);
  clearActiveSprint();
  clearSprintState(projectRoot);

  // PID Cleanup
  if (snapshotInterval) clearInterval(snapshotInterval);
  if (beforeExitHandler) process.removeListener('beforeExit', beforeExitHandler);
  try { clearPid(projectRoot, sprint.id); } catch { /* non-fatal */ }

  updateDashboard(projectRoot, {
    sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
    agents: [],
    progress: { done: sprint.tasks.length, active: 0, blocked: 0, total: sprint.tasks.length },
    alerts: [],
    updatedAt: now(),
  });

  return sprint;
  } finally {
    // Sprint 180 W3-1: nervous system lives in sprint scope — tear down on
    // every exit path (success, BrainError, human-checkpoint abort, throw).
    disposeNervousSystem(nervous);
  }
}
