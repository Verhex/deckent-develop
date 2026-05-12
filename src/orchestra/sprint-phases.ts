// ═══ Sprint Phase Functions ═════════════════════════════════════════
// Extracted from sprint-controller.ts runSprint() — Sprint 072
//
// Each function encapsulates one sprint lifecycle phase, keeping
// runSprint() as a thin orchestration layer.
//
// NOTE: This module and sprint-controller.ts form a safe circular
// dependency. All cross-module references are inside function bodies
// (deferred execution), never at module initialization time.

// ─── Node Builtins ─────────────────────────────────────────────────
import {
  readFileSync, writeFileSync, existsSync, readdirSync, statSync,
} from 'node:fs';
import { join } from 'node:path';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus, AlertLevel,
} from '../core/types.js';

// ─── Core (type imports) ──────────────────────────────────────────
import type {
  Task, TaskResult, Sprint, SprintMetrics,
  ResolvedConfig, SprintSizeRecommendation,
  EvaluationResult,
} from '../core/types.js';

import {
  BRAIN_DIR, TASKS_DIR, DEBT_FILE, DECKENT_VERSION, DECKENT_DIR,
} from '../core/constants.js';

import { readJsonSafe, parseDebtTable, debugLog } from '../core/utils.js';
import type { ProviderAdapter } from '../core/provider.js';
import type { SpawnBackend } from './spawn-backend.js';

// ─── Notify (DECKENT→USER:NOTIFY — Hot Fix H6) ──────────────────
import { notify } from '../core/notify.js';

// ─── Rollback ─────────────────────────────────────────────────────
import type { SafetyPoint } from './rollback.js';
import {
  createSafetyPoint, rollback, getRollbackPolicy,
  recordRollbackInDebt, saveSafetyPoint, deleteSafetyPoint,
  isGitRepo, cleanOrphanSafetyPoint,
} from './rollback.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import {
  runHooks, runCiRegressionCheck, resolveCiGuardianConfig,
  runPreSprintValidation, parseTscErrorFiles,
} from '../core/plugin-hooks.js';
import type {
  BeforeSprintContext, AfterTaskContext,
  CiRegressionCheckResult, CiValidationResult,
} from '../core/plugin-hooks.js';

// ─── Auditor ──────────────────────────────────────────────────────
import {
  updateDashboard, startScanLoop, writeScanToDashboard, runScanCycle,
} from '../monitor/auditor.js';

// ─── Debt Manager ─────────────────────────────────────────────────
import {
  handleEvaluation, handleCrossDependencies, escalateDebt,
  resolveDebt, runDecay,
} from './debt-manager.js';

// ─── Agent/Skill Pools ───────────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { SkillPoolManager } from '../core/skill-pool.js';
import { detectProjectStack } from '../core/stack-detector.js';

// ─── Rich Output ─────────────────────────────────────────────────
import { showSplash } from '../cli/helpers/splash.js';

// ─── Sprint Reporter ─────────────────────────────────────────────
import { calculateMetrics } from './sprint-reporter.js';

// ─── Rubric-Based Evaluation ─────────────────────────────────────
import { evaluateWithRubric } from './result-evaluator.js';

// ─── Result Map Helper ──────────────────────────────────────────
import { buildResultsMap } from './result-collector.js';

// ─── Dependency Cascade / Unblock Wire (Sprint 156 — Task 003) ───
// applyCascadeToSprint + applyUnblockToSprint were exported from
// sprint-spawner but had no runtime caller. Wired here so NO_GO →
// dependents PAUSED and DONE → dependents PENDING actually fire.
import { applyCascadeToSprint, applyUnblockToSprint } from './sprint-spawner.js';
import { writeEvent, getCurrentSprintId } from './event-stream.js';
import type { FailureContext } from './result-evaluator.js';

// ─── Sprint Controller (safe circular — all usages inside function bodies) ──
import {
  BrainError,
  readContext,
  planSprint,
  writeSprintState,
  spawnWorkers,
  buildSpawnRetryHint,
  waitForResults,
  finalizeSprint,
  cleanup,
} from './sprint-controller.js';
import type { RunSprintOptions } from './sprint-controller.js';


// ═══ Local Helpers (duplicated from sprint-controller to avoid circular init-time deps) ══

/** Map EvaluationResult.decision string to TaskEvaluation enum */
function toTaskEvaluation(evalResult: EvaluationResult): TaskEvaluation {
  switch (evalResult.decision) {
    case 'DONE': return TaskEvaluation.DONE;
    case 'GO_WITH_TECH_DEBT': return TaskEvaluation.GO_WITH_TECH_DEBT;
    case 'NO_GO': return TaskEvaluation.NO_GO;
    default: return TaskEvaluation.NO_GO;
  }
}

/**
 * Persist a single task's mutated status (PAUSED/PENDING) back to disk.
 * Sprint 156 Task 003: cascade/unblock writes flow through here so spawn-spawner
 * disk reads + Auditor dashboards reflect the new state.
 */
function persistTaskStatus(projectRoot: string, sprint: Sprint, taskId: string): void {
  try {
    const tasksPath = join(projectRoot, TASKS_DIR);
    const task = sprint.tasks.find(t => t.id === taskId);
    if (!task) return;
    writeFileSync(
      join(tasksPath, `task-${task.id}.json`),
      JSON.stringify(task, null, 2),
      'utf-8',
    );
  } catch (e) { debugLog('persistTaskStatus', e); }
}

/** Build a FailureContext from a TaskResult for cascade classification. */
function buildFailureContext(result: TaskResult): FailureContext {
  return {
    notes: result.notes ?? '',
    selfAssessment: result.selfAssessment,
    resultFilePresent: true,
  };
}

function now(): string {
  return new Date().toISOString();
}

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (e) {
    debugLog('readFileSafe:readFileSync', e);
    return '';
  }
}

/** Write error dashboard state — mirrors sprint-controller's private helper */
function safeDashboardUpdate(
  projectRoot: string,
  sprint: Sprint,
  errorMessage: string,
): void {
  try {
    updateDashboard(projectRoot, {
      sprint: { id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status },
      agents: [],
      progress: { done: 0, active: 0, blocked: 0, total: sprint.tasks.length },
      alerts: [{ level: AlertLevel.WARNING, message: errorMessage, timestamp: now() }],
      updatedAt: now(),
    });
  } catch (e) { debugLog('safeDashboardUpdate:updateDashboard', e); }
}


// ═══ Build Staleness Pre-Flight (Sprint 156 — Task 008) ══════════════
// Pre-flight check: detect when dist/orchestra/sprint-phases.js was rebuilt
// AFTER the previous sprint's sprint-state.json was last written. When this
// happens, runtime behavior may differ from the previously tested build —
// emit SPRINT→USER:BUILD_STALE_WARNING so the user can decide whether to
// re-validate before starting a new sprint.
//
// NO build invocation. Pure mtime read + event emit. Fail-safe: any I/O
// error is swallowed (debugLog only) — never crash sprint start because of
// staleness telemetry.

/** Result of a build-staleness pre-flight check. */
export interface BuildStalenessResult {
  /** true → SPRINT→USER:BUILD_STALE_WARNING was emitted */
  warningEmitted: boolean;
  /** ISO 8601 mtime of dist/orchestra/sprint-phases.js (if readable) */
  distMtime?: string;
  /** ISO 8601 mtime of .deckent/sprint-state.json (if readable) */
  sprintStateMtime?: string;
  /** distMtime - sprintStateMtime in whole seconds (positive = dist newer) */
  ageSeconds?: number;
  /** Reason warning was NOT emitted, when applicable (for telemetry/debug) */
  skipReason?: 'dist-missing' | 'state-missing' | 'not-newer' | 'io-error';
}

/**
 * Pre-flight check: emit SPRINT→USER:BUILD_STALE_WARNING when the compiled
 * dist/orchestra/sprint-phases.js is newer than the previous sprint's
 * .deckent/sprint-state.json. Runs before any sprint-state mutation so the
 * mtime read reflects the PREVIOUS sprint's final state.
 *
 * NO build invocation — pure mtime read + event emit. Fail-safe: any I/O
 * error returns { warningEmitted: false, skipReason: 'io-error' } and does
 * not throw.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID, used for event-stream targeting
 * @returns BuildStalenessResult describing the check outcome
 */
export function checkBuildStaleness(
  projectRoot: string,
  sprintId: string,
): BuildStalenessResult {
  try {
    const distPath = join(projectRoot, 'dist', 'orchestra', 'sprint-phases.js');
    const statePath = join(projectRoot, DECKENT_DIR, 'sprint-state.json');

    if (!existsSync(distPath)) {
      return { warningEmitted: false, skipReason: 'dist-missing' };
    }
    if (!existsSync(statePath)) {
      return { warningEmitted: false, skipReason: 'state-missing' };
    }

    const distStat = statSync(distPath);
    const stateStat = statSync(statePath);
    const distMtime = distStat.mtime.toISOString();
    const sprintStateMtime = stateStat.mtime.toISOString();

    if (distStat.mtimeMs <= stateStat.mtimeMs) {
      return {
        warningEmitted: false,
        distMtime,
        sprintStateMtime,
        ageSeconds: Math.floor((distStat.mtimeMs - stateStat.mtimeMs) / 1000),
        skipReason: 'not-newer',
      };
    }

    const ageSeconds = Math.floor((distStat.mtimeMs - stateStat.mtimeMs) / 1000);
    writeEvent(
      projectRoot,
      sprintId,
      'sprint',
      'user',
      'SPRINT→USER:BUILD_STALE_WARNING',
      { distMtime, sprintStateMtime, ageSeconds },
    );
    return { warningEmitted: true, distMtime, sprintStateMtime, ageSeconds };
  } catch (e) {
    debugLog('checkBuildStaleness', e);
    return { warningEmitted: false, skipReason: 'io-error' };
  }
}


// ═══ Phase Result Types ═══════════════════════════════════════════

export interface PlanPhaseResult {
  sprint: Sprint;
  safetyPoint: SafetyPoint | null;
}

export interface SpawnPhaseResult {
  taskQueue: Task[];
  scanInterval: ReturnType<typeof setInterval> | null;
}


// ═══ Phase 1: PLAN ════════════════════════════════════════════════

/**
 * Run the PLAN phase: read context, check usage, plan sprint, validate CI,
 * run beforeSprint hooks, and create git safety point.
 * @throws {BrainError} When planning or CI validation fails
 */
export async function runPlanPhase(
  projectRoot: string,
  config: ResolvedConfig,
  _opts: RunSprintOptions | undefined,
  _activeProvider: ProviderAdapter | null,
  rollbackEnabled: boolean,
): Promise<PlanPhaseResult> {
  try {
    const context = readContext(projectRoot);
    const recommendation: SprintSizeRecommendation = {
      size: 'full',
      maxWorkers: typeof config.activeModeConfig.max_workers === 'number' ? config.activeModeConfig.max_workers : 4,
      modelConstraint: null,
      reason: 'No usage constraints',
    };
    const sprint = await planSprint(projectRoot, config, context, recommendation);
    sprint.startedAt = now();

    // Sprint 156 Task 008: Pre-flight build-staleness check. Compares
    // dist/orchestra/sprint-phases.js mtime against the previous sprint's
    // .deckent/sprint-state.json mtime. If dist is newer, emits
    // SPRINT→USER:BUILD_STALE_WARNING so the user can re-validate. Runs
    // BEFORE writeSprintState (in runSpawnPhase) so the read reflects the
    // previous sprint's state, not the in-flight one. Fail-safe — never
    // throws.
    try { checkBuildStaleness(projectRoot, sprint.id); }
    catch (e) { debugLog('runPlanPhase:checkBuildStaleness', e); }

    // Show Kraken splash on first sprint start (non-fatal)
    if (sprint.number === 1) {
      try {
        const splash = showSplash(DECKENT_VERSION);
        if (splash) console.log(splash);
      } catch (e) { debugLog('runPlanPhase:showSplash', e); }
    }

    // Run pre-sprint CI validation — may block sprint if tsc/tests fail
    const ciResult: CiValidationResult = runPreSprintValidation(projectRoot, sprint.id);
    if (!ciResult.passed) {
      throw new BrainError(
        ciResult.blockedReason ?? 'CI validation failed — sprint blocked',
        SprintPhase.PLAN,
      );
    }

    // Run beforeSprint hooks after planning (non-fatal)
    try {
      const ctx: BeforeSprintContext = {
        hook: 'beforeSprint',
        sprintId: sprint.id,
        tasks: sprint.tasks,
        config,
        projectRoot,
      };
      await runHooks('beforeSprint', ctx);
    } catch (e) { debugLog('runPlanPhase:beforeSprintHook', e); }

    // Create git safety point after planning but before workers spawn
    let safetyPoint: SafetyPoint | null = null;
    if (rollbackEnabled) {
      // Pre-check: clean up orphan safety points from previous sprints
      try {
        cleanOrphanSafetyPoint(projectRoot, sprint.id);
      } catch (e) { debugLog('runPlanPhase:cleanOrphanSafetyPoint', e); }

      // Pre-check: verify git repo exists
      if (!isGitRepo(projectRoot)) {
        const msg = 'Rollback disabled: not a git repository. Run `git init` or set rollback_policy to "never".';
        debugLog('runPlanPhase:noGitRepo', msg);
        // Visible warning — do not silently disable
        console.warn(`[rollback] ${msg}`);
      } else {
        try {
          safetyPoint = createSafetyPoint(projectRoot, sprint.id);
          saveSafetyPoint(projectRoot, safetyPoint);
        } catch (e) {
          // Stash pop failure (DECKENT_E057) is critical — propagate to abort sprint
          if (e instanceof Error && e.message.includes('Stash pop failed')) {
            throw e;
          }
          debugLog('runPlanPhase:createSafetyPoint', e);
        }
      }
    }

    return { sprint, safetyPoint };
  } catch (err) {
    throw new BrainError(
      `Plan phase failed: ${err instanceof Error ? err.message : String(err)}`,
      SprintPhase.PLAN,
    );
  }
}


// ═══ Phase 2: SPAWN ═══════════════════════════════════════════════

/**
 * Run the SPAWN phase: spawn workers (1 retry with diagnostic hints),
 * start auditor scan loop.
 * @throws {BrainError} When spawn fails after retry
 */
export async function runSpawnPhase(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  opts: RunSprintOptions | undefined,
  spawnBackend: SpawnBackend | undefined,
): Promise<SpawnPhaseResult> {
  let scanInterval: ReturnType<typeof setInterval> | null = null;
  let taskQueue: Task[] = [];
  let spawnAttempts = 0;

  while (spawnAttempts < 2) {
    try {
      sprint.phase = SprintPhase.SPAWN;
      writeSprintState(projectRoot, sprint);
      taskQueue = await spawnWorkers(projectRoot, sprint, config, { autoApprove: opts?.autoApprove, spawnBackend });
      sprint.status = SprintStatus.ACTIVE;
      writeSprintState(projectRoot, sprint);
      try {
        // Run the first scan immediately (0ms delay) so dashboard is fresh from the start
        try {
          const firstScan = runScanCycle(projectRoot, sprint.id);
          writeScanToDashboard(projectRoot, {
            id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status,
          }, firstScan);
        } catch (e) { debugLog('runSpawnPhase:firstScan', e); }
        scanInterval = startScanLoop(projectRoot, sprint.id, undefined, (scanResult) => {
          writeScanToDashboard(projectRoot, {
            id: sprint.id, number: sprint.number, phase: sprint.phase, status: sprint.status,
          }, scanResult);
        });
      } catch (e) { debugLog('runSpawnPhase:startScanLoop', e); }
      break;
    } catch (err) {
      spawnAttempts++;
      if (spawnAttempts >= 2) {
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        try { cleanup(projectRoot, sprint); } catch (e) { debugLog('runSpawnPhase:cleanup', e); }
        const hint = buildSpawnRetryHint(err, sprint);
        throw new BrainError(
          `Spawn phase failed after retry: ${err instanceof Error ? err.message : String(err)}. Hint: ${hint}`,
          SprintPhase.SPAWN,
        );
      }
    }
  }

  return { taskQueue, scanInterval };
}


// ═══ Phase 4: EVALUATE ════════════════════════════════════════════

/**
 * Run the EVALUATE phase: evaluate each task result, run CI regression checks,
 * handle debt, and run afterTask hooks.
 * Mutates `sprint` (status, phase) and `evaluations` (Map entries) in place.
 */
export async function runEvaluatePhase(
  projectRoot: string,
  sprint: Sprint,
  results: TaskResult[],
  evaluations: Map<string, TaskEvaluation>,
  _coverageThreshold = 90,
): Promise<void> {
  try {
    sprint.status = SprintStatus.EVALUATING;
    sprint.phase = SprintPhase.EVALUATE;
    const resultsMap = buildResultsMap(results);
    const collectedIds = new Set(results.map(r => r.taskId));
    debugLog('runEvaluatePhase:start', `totalTasks=${sprint.tasks.length} collectedResults=${results.length} collectedIds=[${[...collectedIds].join(',')}]`);

    // Resolve CI guardian config once for all tasks
    const ciGuardianConfig = resolveCiGuardianConfig(projectRoot);

    for (const task of sprint.tasks) {
      if (collectedIds.has(task.id)) {
        const result = resultsMap.get(task.id);
        if (!result) continue; // narrowed: collectedIds contains task.id
        const rubricResult = evaluateWithRubric(result, task);
        let evaluation = toTaskEvaluation(rubricResult);

        // CI regression check: run after initial evaluation (non-fatal)
        let ciCheckResult: CiRegressionCheckResult | undefined;
        if (ciGuardianConfig.enabled && evaluation !== TaskEvaluation.NO_GO) {
          try {
            ciCheckResult = runCiRegressionCheck(projectRoot, result, ciGuardianConfig);
            if (ciCheckResult.regressionDetected) {
              // tsc failure + block_on_tsc_fail → task-specific downgrade
              // Only downgrade if this task's changed files overlap with tsc error files
              if (!ciCheckResult.tscPassed && ciGuardianConfig.block_on_tsc_fail) {
                const tscErrorFiles = parseTscErrorFiles(ciCheckResult.tscOutput);
                const taskFiles = new Set(result.filesChanged);
                const hasOverlap = tscErrorFiles.some(f => taskFiles.has(f));
                if (hasOverlap) {
                  evaluation = TaskEvaluation.NO_GO;
                }
              }
              // targeted test failure + block_on_test_fail → downgrade to NO_GO
              if (!ciCheckResult.targetedTestsPassed && ciGuardianConfig.block_on_test_fail) {
                evaluation = TaskEvaluation.NO_GO;
              }
              // If not downgraded to NO_GO, at least mark as tech debt
              if (evaluation !== TaskEvaluation.NO_GO && evaluation === TaskEvaluation.DONE) {
                evaluation = TaskEvaluation.GO_WITH_TECH_DEBT;
              }
              // Annotate result with regression info
              (result as TaskResult & { regressionDetected?: boolean }).regressionDetected = true;
              (result as TaskResult & { ciAlerts?: string[] }).ciAlerts = ciCheckResult.alerts;
            }
          } catch (e) {
            debugLog('runEvaluatePhase:ciRegressionCheck', e);
          }
        }

        debugLog('runEvaluatePhase:task', `task=${task.id} selfAssessment=${result.selfAssessment} evaluation=${evaluation} testsPassed=${result.testsPassed}`);
        handleEvaluation(projectRoot, task, evaluation, result);
        evaluations.set(task.id, evaluation);

        // DECKENT→USER:NOTIFY (Hot Fix H6) — task-done / task-no-go, fail-safe
        try {
          if (evaluation === TaskEvaluation.DONE) {
            void notify(
              'task-done',
              sprint.id,
              `Task ${task.id} tamamlandı`,
              (result.notes ?? '').slice(0, 100) || `${task.title ?? task.id} DONE`,
            );
          } else if (evaluation === TaskEvaluation.NO_GO) {
            void notify(
              'task-no-go',
              sprint.id,
              `Task ${task.id} başarısız`,
              (result.notes ?? '').slice(0, 100) || `${task.title ?? task.id} NO_GO`,
            );
          }
        } catch (e) { debugLog('runEvaluatePhase:notify', e); }

        // Run afterTask hooks (non-fatal)
        try {
          await runHooks('afterTask', {
            hook: 'afterTask',
            task,
            result,
            projectRoot,
          } satisfies AfterTaskContext);
        } catch (e) { debugLog('runEvaluatePhase:afterTaskHook', e); }
        if (evaluation === TaskEvaluation.DONE || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
          if (task.isPriorityFix && task.fixForTaskId) {
            resolveDebt(projectRoot, `debt-${task.fixForTaskId}`, sprint.id);
          }
          resolveDebt(projectRoot, `debt-${task.id}`, sprint.id);
        }
      } else {
        const syntheticResult: TaskResult = {
          taskId: task.id,
          workerId: task.assignedWorker ?? 'unknown',
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          notes: 'Timeout - no result received',
        };
        debugLog('runEvaluatePhase:timeout', `task=${task.id} — no result collected, marking NO_GO (timeout/missing)`);
        handleEvaluation(projectRoot, task, TaskEvaluation.NO_GO, syntheticResult);
        evaluations.set(task.id, TaskEvaluation.NO_GO);
        // DECKENT→USER:NOTIFY (Hot Fix H6) — timeout/missing NO_GO
        try {
          void notify(
            'task-no-go',
            sprint.id,
            `Task ${task.id} başarısız (timeout)`,
            'Worker sonucu üretmedi (timeout/missing)',
          );
        } catch (e) { debugLog('runEvaluatePhase:notify:timeout', e); }
        // Run afterTask hooks for timeout tasks too (non-fatal)
        try {
          await runHooks('afterTask', {
            hook: 'afterTask',
            task,
            result: syntheticResult,
            projectRoot,
          } satisfies AfterTaskContext);
        } catch (e) { debugLog('runEvaluatePhase:afterTaskHookTimeout', e); }
      }
    }
    debugLog('runEvaluatePhase:done', `evaluations.size=${evaluations.size} keys=[${[...evaluations.keys()].join(',')}]`);

    // ─── Sprint 156 Task 003: Cascade NO_GO → dependents PAUSED ──────
    // For each task that ended up NO_GO with a real result file, classify
    // the failure and (if CODE) cascade-block PENDING dependents → PAUSED.
    // Per-transition events are already emitted from inside
    // applyCascadeToSprint; here we additionally fire a single
    // BRAIN→*:DEPENDENCY_CASCADE_APPLIED summary event so listeners can
    // observe aggregate cascade outcomes.
    //
    // Timeout NO_GOs (no result file present) are skipped: they are
    // downstream effects rather than root failures, and applyCascadeToSprint
    // would classify them as RUNTIME (no cascade) anyway — emitting an
    // empty cascade event for them just adds noise.
    try {
      const sprintId = getCurrentSprintId(projectRoot) ?? sprint.id;
      const resultsMapForCascade = buildResultsMap(results);
      for (const [taskId, evaluation] of evaluations.entries()) {
        if (evaluation !== TaskEvaluation.NO_GO) continue;
        const result = resultsMapForCascade.get(taskId);
        if (!result) continue; // skip timeout NO_GOs — root failures only
        const failureCtx: FailureContext = buildFailureContext(result);
        try {
          const { decision, blockedTaskIds } = applyCascadeToSprint(
            projectRoot, sprint, taskId, failureCtx,
          );
          // Persist any PENDING → PAUSED status mutations to disk
          for (const blockedId of blockedTaskIds) {
            persistTaskStatus(projectRoot, sprint, blockedId);
          }
          // Summary event — broadcast even when no tasks were blocked so
          // observers can correlate failure decisions with their effect.
          writeEvent(
            projectRoot, sprintId, 'brain', '*',
            'BRAIN→*:DEPENDENCY_CASCADE_APPLIED',
            {
              failedTaskId: taskId,
              shouldCascade: decision.shouldCascade,
              failureCategory: decision.category,
              blockedTaskIds,
              totalBlocked: blockedTaskIds.length,
            },
          );
        } catch (e) { debugLog('runEvaluatePhase:applyCascade', e); }
      }
    } catch (e) { debugLog('runEvaluatePhase:cascadeWire', e); }
  } catch (err) {
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
  }
}


// ═══ Rollback Check ═══════════════════════════════════════════════

/**
 * Check if rollback should be triggered (all tasks NO_GO → auto rollback).
 * Clean up safety branch if no rollback was needed.
 * Mutates `sprint` (rolledBack, rollbackResult) in place.
 */
export function runRollbackCheck(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  rollbackEnabled: boolean,
  safetyPoint: SafetyPoint | null,
): void {
  // Rollback check: if rollback is enabled and all tasks are NO_GO, trigger rollback
  if (rollbackEnabled && safetyPoint && evaluations.size > 0) {
    try {
      // safe: TaskEvaluation enum values are exactly 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO'
      const evalValues = [...evaluations.values()].map(e => e as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO');
      const policy = getRollbackPolicy(evalValues);
      if (policy === 'auto') {
        // All tasks NO_GO -- automatically rollback
        const rollbackResult = rollback(projectRoot, safetyPoint);
        recordRollbackInDebt(projectRoot, sprint.id, rollbackResult);
        sprint.rolledBack = true;
        sprint.rollbackResult = rollbackResult.message;
      }
    } catch (e) { debugLog('runRollbackCheck:rollback', e); }
  }

  // After successful sprint (no rollback or partial success): clean up safety branch
  if (rollbackEnabled && safetyPoint && !sprint.rolledBack) {
    try { deleteSafetyPoint(projectRoot, safetyPoint); } catch (e) { debugLog('runRollbackCheck:deleteSafetyPoint', e); }
  }
}


// ═══ Phase 5: FIX ═════════════════════════════════════════════════

/**
 * Run the FIX phase: handle cross-dependencies, reroute fix tasks (V2),
 * spawn fix workers, evaluate fix results.
 * Mutates `sprint` (status, phase) in place.
 */
export async function runFixPhase(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  config: ResolvedConfig,
  opts: RunSprintOptions | undefined,
  routingVersionForFix: string,
  spawnBackend: SpawnBackend | undefined,
): Promise<void> {
  try {
    sprint.status = SprintStatus.FIXING;
    sprint.phase = SprintPhase.FIX;
    handleCrossDependencies(projectRoot, sprint, evaluations);

    const fixTasks: Task[] = [];
    const tasksPath = join(projectRoot, TASKS_DIR);
    if (existsSync(tasksPath)) {
      for (const file of readdirSync(tasksPath).filter(f => f.startsWith('task-') && f.endsWith('.json'))) {
        const task = readJsonSafe<Task>(join(tasksPath, file));
        if (task?.isPriorityFix && task.status === TaskStatus.PENDING) fixTasks.push(task);
      }
    }

    if (fixTasks.length > 0) {
      // V2: Reroute fix tasks with MidSprintAdapter (exclude failed agent/skills)
      if (routingVersionForFix === 'v2') {
        try {
          const { MidSprintAdapter } = await import('./mid-sprint-adapter.js');
          const fixAgentPool = new AgentPoolManager(projectRoot);
          const fixPool = fixAgentPool.loadAgents();
          const fixSkillPool = new SkillPoolManager(projectRoot);
          const fixSkills = fixSkillPool.loadSkills();
          const { OutcomeTracker } = await import('./outcome-tracker.js');
          const fixTracker = new OutcomeTracker(projectRoot);
          const fixStack = detectProjectStack(projectRoot);
          const adapter = new MidSprintAdapter(fixPool, fixSkills, fixTracker, fixStack, config);
          const fixResultsMap = buildResultsMap(results);

          for (const fixTask of fixTasks) {
            if (fixTask.fixForTaskId) {
              // Find the original failed task's result via O(1) Map lookup
              const originalResult = fixResultsMap.get(fixTask.fixForTaskId);
              if (originalResult) {
                const rerouteResult = adapter.shouldReroute(fixTask, originalResult);
                if (rerouteResult.should && rerouteResult.newDecision) {
                  adapter.applyReroute(fixTask, rerouteResult.newDecision);
                  // Persist rerouted task
                  writeFileSync(join(tasksPath, `task-${fixTask.id}.json`), JSON.stringify(fixTask, null, 2), 'utf-8');
                }
              }
            }
          }
        } catch (e) { debugLog('runFixPhase:midSprintAdapter', e); }
      }

      const fixSprint: Sprint = { ...sprint, tasks: fixTasks, workers: fixTasks.map(t => `w-${t.id}`) };
      await spawnWorkers(projectRoot, fixSprint, config, { autoApprove: opts?.autoApprove, spawnBackend });
      // Sprint 154 audit A4.F2: 600s yetersiz (Sprint 152 opus FIX worker timeout cascade kanıt) → 1800s.
      const fixPhaseTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
        ?? opts?.fixPhaseTimeoutMs
        ?? 1_800_000;
      const fixResults = await waitForResults(projectRoot, fixSprint, fixPhaseTimeout, undefined, { spawnBackend });
      const sprintIdForUnblock = getCurrentSprintId(projectRoot) ?? sprint.id;
      for (const fixTask of fixTasks) {
        const fixResult = fixResults.find(r => r.taskId === fixTask.id);
        if (fixResult) {
          const fixRubricResult = evaluateWithRubric(fixResult, fixTask);
          const fixEval = toTaskEvaluation(fixRubricResult);
          handleEvaluation(projectRoot, fixTask, fixEval, fixResult);
          evaluations.set(fixTask.id, fixEval);
          if (fixEval === TaskEvaluation.DONE && fixTask.fixForTaskId) {
            resolveDebt(projectRoot, `debt-${fixTask.fixForTaskId}`, sprint.id);
          }
          // Update original task evaluation if fix succeeded
          if (fixTask.fixForTaskId && fixEval !== TaskEvaluation.NO_GO && evaluations.has(fixTask.fixForTaskId)) {
            evaluations.set(fixTask.fixForTaskId, fixEval);
          }

          // ─── Sprint 156 Task 003: Unblock dependents on fix DONE ────
          // When a fix worker resolves a previously-failed task, flip the
          // original task's status to DONE in-memory so unblockDependents'
          // doneTasks set picks it up, then re-enable PAUSED dependents
          // whose dependencies are all satisfied.
          if (
            fixEval !== TaskEvaluation.NO_GO &&
            fixTask.fixForTaskId
          ) {
            const originalTask = sprint.tasks.find(t => t.id === fixTask.fixForTaskId);
            if (originalTask && originalTask.status !== TaskStatus.DONE) {
              originalTask.status = TaskStatus.DONE;
              persistTaskStatus(projectRoot, sprint, originalTask.id);
            }
            try {
              const unblockedTaskIds = applyUnblockToSprint(
                projectRoot, sprint, fixTask.fixForTaskId,
              );
              for (const unblockedId of unblockedTaskIds) {
                persistTaskStatus(projectRoot, sprint, unblockedId);
              }
              writeEvent(
                projectRoot, sprintIdForUnblock, 'brain', '*',
                'BRAIN→*:DEPENDENCY_UNBLOCK_APPLIED',
                {
                  resolvedTaskId: fixTask.fixForTaskId,
                  fixTaskId: fixTask.id,
                  unblockedTaskIds,
                  totalUnblocked: unblockedTaskIds.length,
                },
              );
            } catch (e) { debugLog('runFixPhase:applyUnblock', e); }
          }
        }
      }
    }
    escalateDebt(projectRoot);
  } catch (err) {
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
  }
}


// ═══ Phase 6+7: RETRO + DECAY ═════════════════════════════════════

/**
 * Run the RETRO phase (includes DECAY via finalizeSprint).
 * In test mode, only calculates metrics without writing retro/memory files.
 * Mutates `sprint` (status, phase, metrics) in place.
 * @returns Computed sprint metrics, or undefined if calculation failed
 */
export async function runRetroPhase(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  config: ResolvedConfig,
  testMode?: boolean,
): Promise<SprintMetrics | undefined> {
  if (!testMode) {
    try {
      sprint.status = SprintStatus.RETROSPECTIVE;
      sprint.phase = SprintPhase.RETRO;
      // Dynamic import to avoid circular dep at module level
      const { regenerateRules } = await import('../core/rule-generator.js');
      return await finalizeSprint(projectRoot, sprint, evaluations, results, {
        config,
        onRuleRegen: async (root: string): Promise<void> => { await regenerateRules(root); },
      });
    } catch (err) {
      safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  } else {
    try {
      const freshDebt = parseDebtTable(readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE)) ?? '');
      const metrics = calculateMetrics(sprint, evaluations, results, freshDebt);
      sprint.metrics = metrics;
      return metrics;
    } catch (e) {
      debugLog('runRetroPhase:calculateMetrics', e);
      return undefined;
    }
  }
}


// ═══ Phase 7: DECAY (standalone) ══════════════════════════════════

/**
 * Run the DECAY phase independently (memory trimming).
 * Normally called as part of finalizeSprint, but available standalone
 * for direct invocation.
 */
export function runDecayPhase(projectRoot: string, sprintId: string): void {
  try {
    runDecay(projectRoot, sprintId);
  } catch (e) { debugLog('runDecayPhase:runDecay', e); }
}


// ═══ Phase 8: CLEANUP ═════════════════════════════════════════════

/**
 * Run the CLEANUP phase: clear scan interval, clean up task files and locks.
 * Supports delayed cleanup via config.cleanup_delay_ms.
 * @returns null (scan interval is always cleared)
 */
export function runCleanupPhase(
  projectRoot: string,
  sprint: Sprint,
  config: ResolvedConfig,
  opts: RunSprintOptions | undefined,
  scanInterval: ReturnType<typeof setInterval> | null,
  spawnBackend: SpawnBackend | undefined,
): null {
  // Clear scan interval
  if (scanInterval) { clearInterval(scanInterval); }

  if (!opts?.skipCleanup) {
    const delayMs = (config as unknown as Record<string, unknown>).cleanup_delay_ms as number | undefined;
    const cleanupDelay = typeof delayMs === 'number' && delayMs > 0 ? delayMs : 0;
    if (cleanupDelay > 0) {
      debugLog('[Brain]', `Cleanup delayed ${cleanupDelay}ms — .tasks/ files remain readable`);
      const _sprint = sprint;
      const _spawnBackend = spawnBackend;
      setTimeout(() => {
        try { cleanup(projectRoot, _sprint, _spawnBackend); } catch (e) { debugLog('runCleanupPhase:cleanupDelayed', e); }
      }, cleanupDelay);
    } else {
      try {
        cleanup(projectRoot, sprint, spawnBackend);
      } catch (err) {
        safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return null;
}
