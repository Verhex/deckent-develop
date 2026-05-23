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
  readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync,
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
  TASKS_DIR, DECKENT_VERSION, DECKENT_DIR,
} from '../core/constants.js';

import { readJsonSafe, debugLog } from '../core/utils.js';
import { getDebtItems } from '../core/debt-store.js';
import { isPidAlive as isPidAliveShared } from '../core/pid-liveness.js';
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

// ─── Honest Result Gate (Sprint 165 Task 1 — Bug X Fix) ─────────
// Single canonical honesty boundary. Applied before evaluateWithRubric
// to downgrade dishonest DONE stubs (linesAdded=0 + testsPassed=false)
// to NO_GO. Used a second time in runRetroPhase to write honest
// sentinels for tasks whose .result is missing, so the legacy
// tryCodeVerifiedDone path in finalizeSprint cannot auto-promote.
import {
  enforceHonestResultGate,
  writeHonestSentinelResult,
  isStubResult,
} from './result-evaluator.js';

// ─── Result Map Helper ──────────────────────────────────────────
import { buildResultsMap } from './result-collector.js';

// ─── Evaluation Audit Trail (Sprint 161 — Task 2) ───────────────
// Per-task forensic record of every Brain evaluation decision. Wire
// is fail-soft: any I/O error during audit write is debugLog'd but
// must not abort the evaluation pipeline.
import {
  writeEvaluationAudit,
  buildDecisionRationale,
  type AuditCriterionScore,
  type AuditDecision,
  type AuditRuleSet,
  type AuditSchemaValidation,
} from './evaluation-audit-trail.js';
import {
  coverageOptional,
  detectTaskType,
  getRubric,
} from './rubric-registry.js';

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

/**
 * Persist a sprint phase + status transition to `.deckent/sprint-state.json`
 * so external observers (auditor, dashboard, recovery) can see the live
 * transition on disk. Sprint 159 forensic: sprint-state.json froze at
 * `phase:SPAWN, status:PLANNING` while real execution progressed
 * EXECUTE→EVALUATE→RETRO→CLEANUP — every transition must now reach disk.
 *
 * Mutates `sprint.phase` and `sprint.status` in place so subsequent reads
 * of the in-memory Sprint reflect the transition. Fail-soft: any I/O error
 * is swallowed via debugLog so an unwritable state file never aborts the
 * Brain's lifecycle.
 *
 * Sprint 161 Task 2 (T-003).
 */
export function persistPhaseTransition(
  projectRoot: string,
  sprint: Sprint,
  phase: SprintPhase,
  status: SprintStatus,
): void {
  try {
    sprint.phase = phase;
    sprint.status = status;
    writeSprintState(projectRoot, sprint);
  } catch (e) {
    debugLog('persistPhaseTransition', e);
  }
}

/**
 * Adapter: map a {@link TaskEvaluation} enum value to the audit-trail's
 * screaming-snake {@link AuditDecision} union. Used only by the
 * runEvaluatePhase wire — keeps adapter logic local to the call site.
 */
function toAuditDecision(evaluation: TaskEvaluation): AuditDecision {
  switch (evaluation) {
    case TaskEvaluation.DONE: return 'DONE';
    case TaskEvaluation.GO_WITH_TECH_DEBT: return 'GO_WITH_TECH_DEBT';
    case TaskEvaluation.NO_GO: return 'NO_GO';
    default: return 'NO_GO';
  }
}

/**
 * Adapter: map a task's rubric-registry TaskType to the audit-trail's
 * screaming-snake {@link AuditRuleSet} union.
 */
function toAuditRuleSet(task: Task): AuditRuleSet {
  switch (detectTaskType(task)) {
    case 'audit': return 'AUDIT';
    case 'document-write': return 'DOC_WRITE';
    default: return 'CODE';
  }
}

/**
 * Adapter: build {@link AuditCriterionScore[]} from an EvaluationResult's
 * rubricScores by joining each score against the task's rubric criteria
 * (for threshold + weight). Unknown criterion names (e.g. the synthetic
 * `schema_validation` row used for schema-fail short-circuits) get
 * zero threshold/weight so they remain visible in the audit record
 * without affecting reconstructed totals.
 */
function toAuditCriterionScores(
  task: Task,
  rubricScores: { criterion: string; score: number; passed: boolean; reason: string }[],
): AuditCriterionScore[] {
  const rubric = getRubric(task);
  const byName = new Map(rubric.criteria.map(c => [c.name, c]));
  return rubricScores.map(rs => {
    const def = byName.get(rs.criterion);
    return {
      name: rs.criterion,
      score: rs.score,
      threshold: def?.threshold ?? 0,
      weight: def?.weight ?? 0,
      passed: rs.passed,
      reason: rs.reason,
    };
  });
}

/**
 * Adapter: infer {@link AuditSchemaValidation} from an EvaluationResult.
 * evaluateWithRubric() short-circuits to a synthetic
 * `[{criterion:'schema_validation', passed:false, ...}]` when schema
 * validation rejects the result; otherwise the result reflects rubric
 * scoring on valid input. `coverageRelaxed` is true for non-code task
 * types per the rubric-registry.
 */
function toAuditSchemaValidation(
  task: Task,
  rubricScores: { criterion: string; passed: boolean; reason: string }[],
): AuditSchemaValidation {
  const coverageRelaxed = coverageOptional(task);
  const schemaRow = rubricScores.find(rs => rs.criterion === 'schema_validation');
  if (schemaRow && !schemaRow.passed) {
    // The reason payload may carry "missing fields: a, b" or similar
    // free-form text. Extract a best-effort missingFields list — if the
    // pattern is absent, fall back to the raw reason as a single token.
    const match = /missing\s+fields?:?\s*([^.]+)/i.exec(schemaRow.reason);
    const captured = match?.[1];
    const missingFields = captured
      ? captured.split(/[,\s]+/).map(s => s.trim()).filter(Boolean)
      : [schemaRow.reason.trim() || 'schema_validation'];
    return { valid: false, missingFields, coverageRelaxed };
  }
  return { valid: true, missingFields: [], coverageRelaxed };
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

    // Sprint 161 Task 2 (T-003): emit PLAN/PLANNING transition to disk so
    // external observers (CLI status, recovery) see the live phase from
    // the moment planning starts. Fail-soft: never throws.
    persistPhaseTransition(projectRoot, sprint, SprintPhase.PLAN, SprintStatus.PLANNING);

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
      // Sprint 161 Task 2 (T-003): SPAWN entry — phase reflects on disk
      // immediately so observers can distinguish PLAN→SPAWN transition
      // before workers are spawned. Status remains whatever planSprint
      // emitted (PLANNING) until ACTIVE flips after a successful spawn.
      persistPhaseTransition(projectRoot, sprint, SprintPhase.SPAWN, sprint.status);
      taskQueue = await spawnWorkers(projectRoot, sprint, config, { autoApprove: opts?.autoApprove, spawnBackend });
      // Spawn succeeded — promote to ACTIVE and re-persist.
      persistPhaseTransition(projectRoot, sprint, SprintPhase.SPAWN, SprintStatus.ACTIVE);
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
        // Sprint 156 Task 4 follow-up (Sprint 157 hot fix, 2026-05-12):
        // Spawn-fail path: pass 'spawn-fail' so cleanup preserves task .json/.plan/.hb
        // and .prompt-*/.worker-*.sh tmpfiles for post-mortem. Default 'sprint-end'
        // would archive prompts/worker scripts AND unlink TASK_FILE_EXTENSIONS, which
        // destroyed Sprint 158 forensic evidence (.tasks/ wiped on lock conflict).
        try { cleanup(projectRoot, sprint, undefined, 'spawn-fail'); } catch (e) { debugLog('runSpawnPhase:cleanup', e); }
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


// ═══ Phase 4: EVALUATE — Idempotency Guard (Sprint 157 — Task 002) ══
// Mutex/idempotency for runEvaluatePhase. Two known race triggers:
//   1. fix_phase_timeout batch: parallel/retry callers may re-enter
//      evaluation pipeline before the first call's evaluations Map
//      mutations and side-effects (handleEvaluation, cascade events,
//      afterTask hooks) complete.
//   2. Reconcile/resume path: a resumed sprint may invoke
//      runEvaluatePhase a second time on already-evaluated tasks.
// Both surface as duplicate handleEvaluation debt-table writes and
// duplicate BRAIN→*:DEPENDENCY_CASCADE_APPLIED events (Sprint 156
// dogfood evidence).
//
// Strategy: PID-bound lock file at
// `.deckent/<sprintId>-evaluate-lock`. Second concurrent call sees the
// live lock and early-returns as NO_OP. Stale locks (process gone) are
// reclaimed automatically. Fail-safe: any lock I/O error falls through
// rather than blocking evaluation.

interface EvaluateLockPayload {
  pid: number;
  startedAt: string;
  sprintId: string;
}

/** Resolve the evaluate-lock file path for a sprint. */
function evaluateLockPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-evaluate-lock`);
}

/**
 * Returns true if a process with `pid` is alive.
 *
 * Delegates to the shared {@link isPidAliveShared} helper (Sprint 178 Task 4).
 * On Linux the shared helper uses /proc lookup (deterministic, no errno
 * ambiguity); on other platforms it falls back to `process.kill(pid, 0)`
 * with EPERM→alive. The fail-safe "unknown errno → alive" branch from the
 * previous local copy is no longer needed: /proc/<pid> existence is a
 * sufficient liveness oracle on Linux, and the kill(0) path here only
 * fires on darwin/win32, where unexpected errno codes are vanishingly rare.
 */
function isPidAlive(pid: number): boolean {
  return isPidAliveShared(pid);
}

/**
 * Attempt to acquire the evaluate lock for the given sprint.
 * Returns true on success (caller proceeds), false if a live lock from
 * another in-flight call exists (caller must NO_OP early-return).
 *
 * Stale locks (whose PID is no longer alive) are reclaimed.
 * Same-PID re-entry returns false to prevent recursion within the same
 * process.
 *
 * Fail-safe: any I/O error falls through to `true` so transient
 * filesystem problems do not block legitimate evaluation runs.
 */
function tryAcquireEvaluateLock(projectRoot: string, sprintId: string): boolean {
  const lockPath = evaluateLockPath(projectRoot, sprintId);
  try {
    if (existsSync(lockPath)) {
      let payload: EvaluateLockPayload | null = null;
      try {
        payload = JSON.parse(readFileSync(lockPath, 'utf-8')) as EvaluateLockPayload;
      } catch (e) {
        debugLog('tryAcquireEvaluateLock:parse', e);
      }
      if (payload && typeof payload.pid === 'number') {
        if (payload.pid === process.pid) {
          // Same-PID re-entry — second call within the same process is a NO_OP.
          return false;
        }
        if (isPidAlive(payload.pid)) {
          // Live lock held by another process — second call is a NO_OP.
          return false;
        }
        // Stale lock — owner process is gone. Reclaim by overwriting.
        debugLog('tryAcquireEvaluateLock:reclaim-stale', `pid=${payload.pid} dead`);
      }
    }
    const newPayload: EvaluateLockPayload = {
      pid: process.pid,
      startedAt: now(),
      sprintId,
    };
    writeFileSync(lockPath, JSON.stringify(newPayload), 'utf-8');
    return true;
  } catch (e) {
    debugLog('tryAcquireEvaluateLock', e);
    // Fail-safe: if we can't manage the lock file, allow evaluation.
    return true;
  }
}

/**
 * Release the evaluate lock for the given sprint. Fail-safe: any I/O
 * error is swallowed (debugLog only) — a stuck lock will be reclaimed
 * by the next call's stale-PID check.
 */
function releaseEvaluateLock(projectRoot: string, sprintId: string): void {
  const lockPath = evaluateLockPath(projectRoot, sprintId);
  try {
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  } catch (e) { debugLog('releaseEvaluateLock', e); }
}

/**
 * Run the EVALUATE phase: evaluate each task result, run CI regression checks,
 * handle debt, and run afterTask hooks.
 * Mutates `sprint` (status, phase) and `evaluations` (Map entries) in place.
 *
 * Sprint 157 Task 002 — Dual-Evaluator Race Close (Bug X):
 * Idempotency guard via PID-bound lock file
 * `.deckent/<sprintId>-evaluate-lock`. If a live evaluation is already
 * in flight for this sprint (different PID OR same PID re-entry),
 * subsequent calls early-return as NO_OP — the evaluations Map and
 * side-effects (handleEvaluation, cascade events, afterTask hooks) run
 * exactly once per sprint per process boundary.
 */
export async function runEvaluatePhase(
  projectRoot: string,
  sprint: Sprint,
  results: TaskResult[],
  evaluations: Map<string, TaskEvaluation>,
  _coverageThreshold = 90,
): Promise<void> {
  // ─── Idempotency Guard (Sprint 157 Task 002) ───────────────────
  // Acquire PID-bound lock; if a live evaluation is already running
  // for this sprint, second call is a NO_OP.
  if (!tryAcquireEvaluateLock(projectRoot, sprint.id)) {
    debugLog('runEvaluatePhase:noop', `lock held — sprint=${sprint.id} pid=${process.pid}`);
    return;
  }
  try {
    // Sprint 161 Task 2 (T-003): EVALUATE entry — phase reaches disk so
    // observers see the EXECUTE→EVALUATE transition. Previously sprint-
    // state.json froze on SPAWN through to CLEANUP (Sprint 159 forensic).
    persistPhaseTransition(projectRoot, sprint, SprintPhase.EVALUATE, SprintStatus.EVALUATING);
    const resultsMap = buildResultsMap(results);
    const collectedIds = new Set(results.map(r => r.taskId));
    debugLog('runEvaluatePhase:start', `totalTasks=${sprint.tasks.length} collectedResults=${results.length} collectedIds=[${[...collectedIds].join(',')}]`);

    // Resolve CI guardian config once for all tasks
    const ciGuardianConfig = resolveCiGuardianConfig(projectRoot);

    for (const task of sprint.tasks) {
      if (collectedIds.has(task.id)) {
        const rawResult = resultsMap.get(task.id);
        if (!rawResult) continue; // narrowed: collectedIds contains task.id

        // ── Honest Result Gate (Sprint 165 Task 1 — Bug X) ────────
        // Downgrade dishonest DONE stubs BEFORE rubric scoring so the
        // Sprint 156-011 / Sprint 164 CODE_VERIFIED_DONE pattern cannot
        // produce false-DONE evaluations. enforceHonestResultGate is a
        // pure function — returns the original on honest results.
        //
        // Wrapped in try/catch so partial mocks of result-evaluator.js
        // (test contexts that stub only evaluateWithRubric) cannot abort
        // the EVALUATE loop. Gate faults log + treat-as-honest fallback.
        let gated: { result: TaskResult; honest: boolean; violation?: string };
        try {
          gated = typeof enforceHonestResultGate === 'function'
            ? enforceHonestResultGate(rawResult, task)
            : { result: rawResult, honest: true };
        } catch (e) {
          debugLog('runEvaluatePhase:honestGate:fault', e);
          gated = { result: rawResult, honest: true };
        }
        const result = gated.result;
        if (!gated.honest) {
          // Emit a stub-write audit event so observers (Auditor, dashboard,
          // CI gates) can correlate this downgrade with the originating
          // task. ADR-035: BRAIN→AUDITOR:STUB_WRITE_DETECTED broadcast.
          try {
            const sidForGate = getCurrentSprintId(projectRoot) ?? sprint.id;
            writeEvent(
              projectRoot, sidForGate, 'brain', 'auditor',
              'BRAIN→AUDITOR:STUB_WRITE_DETECTED',
              {
                taskId: task.id,
                violation: gated.violation,
                originalSelfAssessment: rawResult.selfAssessment,
                linesAdded: rawResult.linesAdded ?? 0,
                testsPassed: rawResult.testsPassed === true,
                timestamp: new Date().toISOString(),
              },
            );
          } catch (e) { debugLog('runEvaluatePhase:stub-write-event', e); }
          // Overwrite the .result file on disk with the gated NO_GO copy
          // so finalizeSprint's tryCodeVerifiedDone cannot re-promote it.
          try {
            const resultPath = join(projectRoot, '.tasks', `task-${task.id}.result`);
            writeFileSync(resultPath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
          } catch (e) { debugLog('runEvaluatePhase:gated-write', e); }
          debugLog('runEvaluatePhase:honestGate', `task=${task.id} violation=${gated.violation} → forced NO_GO`);
        }

        // Sprint 191 P191-1: pass projectRoot so OOM-killed / partial-result
        // workers can be reconciled via reconcileSpuriousNoGo (git diff fallback).
        const rubricResult = evaluateWithRubric(result, task, undefined, projectRoot);
        let evaluation = toTaskEvaluation(rubricResult);
        // Sprint 165 Task 1: ensure honest-gate violations cannot be re-promoted
        // by the rubric reconciler (reconcileRubricNoGo can override NO_GO
        // when concrete rubric scores look good — for stub results this would
        // re-introduce the bug). Lock to NO_GO when violation was detected.
        if (!gated.honest) {
          evaluation = TaskEvaluation.NO_GO;
        }

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

        // Sprint 161 Task 2 (T-003): per-task forensic audit record.
        // Joins the rubric outcome with the task's rubric definition
        // (for threshold + weight) and writes a JSON file under
        // .deckent/evaluations/<sprintId>/<taskId>-attempt-1.json.
        // Fail-soft: any audit-write error is debugLog'd but must not
        // abort the evaluation pipeline.
        try {
          const auditCriteria = toAuditCriterionScores(task, rubricResult.rubricScores);
          const auditSchema = toAuditSchemaValidation(task, rubricResult.rubricScores);
          const auditDecision = toAuditDecision(evaluation);
          const rationale = buildDecisionRationale(
            auditDecision, rubricResult.totalScore, auditCriteria, auditSchema,
          );
          writeEvaluationAudit(projectRoot, sprint.id, task.id, 1, {
            ruleSet: toAuditRuleSet(task),
            schemaValidation: auditSchema,
            criterionScores: auditCriteria,
            totalScore: rubricResult.totalScore,
            decision: auditDecision,
            decisionRationale: rationale,
          });
        } catch (e) { debugLog('runEvaluatePhase:writeEvaluationAudit', e); }

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
  } finally {
    // Release idempotency lock so a future legitimate runEvaluatePhase
    // call (e.g., post-FIX re-evaluation in a separate orchestration
    // pass) is not blocked by a stale lock file. Stale-PID reclaim is
    // the safety net if this branch is skipped due to a hard crash.
    releaseEvaluateLock(projectRoot, sprint.id);
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
 * Sprint 171 Bug B: persist the FIX-phase re-evaluation to the forensic
 * evaluation audit trail.
 *
 * RC: runFixPhase re-evaluates fix tasks (evaluateWithRubric +
 * handleEvaluation) and updates the in-memory `evaluations` Map, but
 * `writeEvaluationAudit` was ONLY called from runEvaluatePhase (hardcoded
 * attempt=1). FIX decisions were therefore invisible in the ledger — a
 * post-mortem reading `<original>-attempt-1.json=NO_GO` falsely concludes
 * "never reconciled" even when the retro shows DONE (Sprint 171 171-014).
 *
 * Writes:
 *   - `<fixTask.id>-attempt-1.json`         (the fix task's own record)
 *   - `<fixForTaskId>-attempt-2.json`       (only when the original is
 *                                            reconciled, so the ledger is
 *                                            self-consistent with the retro)
 *
 * Fail-soft: any audit-write error is debugLog'd, never aborts FIX.
 * Mirrors the runEvaluatePhase audit-write (this file, EVALUATE phase).
 */
export function recordFixEvaluationAudit(
  projectRoot: string,
  sprintId: string,
  fixTask: Task,
  fixRubricResult: EvaluationResult,
  fixEval: TaskEvaluation,
  originalReconciled: boolean,
): void {
  try {
    const auditCriteria = toAuditCriterionScores(fixTask, fixRubricResult.rubricScores);
    const auditSchema = toAuditSchemaValidation(fixTask, fixRubricResult.rubricScores);
    const auditDecision = toAuditDecision(fixEval);
    const rationale = buildDecisionRationale(
      auditDecision, fixRubricResult.totalScore, auditCriteria, auditSchema,
    );
    const payload = {
      ruleSet: toAuditRuleSet(fixTask),
      schemaValidation: auditSchema,
      criterionScores: auditCriteria,
      totalScore: fixRubricResult.totalScore,
      decision: auditDecision,
      decisionRationale: rationale,
    };
    writeEvaluationAudit(projectRoot, sprintId, fixTask.id, 1, payload);
    if (originalReconciled && fixTask.fixForTaskId) {
      writeEvaluationAudit(projectRoot, sprintId, fixTask.fixForTaskId, 2, payload);
    }
  } catch (e) { debugLog('recordFixEvaluationAudit', e); }
}

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
    // Sprint 161 Task 2 (T-003): FIX entry — phase reaches disk so
    // observers see the EVALUATE→FIX transition.
    persistPhaseTransition(projectRoot, sprint, SprintPhase.FIX, SprintStatus.FIXING);
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
      const fixResults = await waitForResults(projectRoot, fixSprint, fixPhaseTimeout, undefined, { spawnBackend }, config);
      const sprintIdForUnblock = getCurrentSprintId(projectRoot) ?? sprint.id;
      for (const fixTask of fixTasks) {
        const fixResult = fixResults.find(r => r.taskId === fixTask.id);
        if (fixResult) {
          // Sprint 191 P191-1: projectRoot for spurious NO_GO reconcile (fix-task too)
          const fixRubricResult = evaluateWithRubric(fixResult, fixTask, undefined, projectRoot);
          const fixEval = toTaskEvaluation(fixRubricResult);
          handleEvaluation(projectRoot, fixTask, fixEval, fixResult);
          evaluations.set(fixTask.id, fixEval);
          if (fixEval === TaskEvaluation.DONE && fixTask.fixForTaskId) {
            resolveDebt(projectRoot, `debt-${fixTask.fixForTaskId}`, sprint.id);
          }
          // Update original task evaluation if fix succeeded
          const originalReconciled =
            !!fixTask.fixForTaskId &&
            fixEval !== TaskEvaluation.NO_GO &&
            evaluations.has(fixTask.fixForTaskId);
          if (originalReconciled && fixTask.fixForTaskId) {
            evaluations.set(fixTask.fixForTaskId, fixEval);
          }

          // Sprint 171 Bug B: persist FIX re-evaluation to forensic ledger
          // (runEvaluatePhase wrote only attempt-1; FIX decisions were
          // invisible → false post-mortem "never reconciled"). Use sprint.id
          // so attempt-2 is a sibling of EVALUATE's attempt-1.
          recordFixEvaluationAudit(
            projectRoot, sprint.id, fixTask, fixRubricResult, fixEval,
            originalReconciled,
          );

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

      // ── Pre-Finalize Honest-Sentinel Pass (Sprint 165 Task 1 — Bug X) ──
      // BEFORE finalizeSprint runs (which calls tryCodeVerifiedDone +
      // writeCodeVerifiedResult for any NO_GO task with missing .result OR
      // Docker-auto-NO_GO notes), pre-write honest NO_GO sentinels for any
      // task that lacks a .result file. The sentinel's notes deliberately
      // omit the Docker auto-pattern phrase so tryCodeVerifiedDone returns
      // NOT_TRIGGERED for these tasks — the buggy auto-promote codepath
      // is starved of inputs. Also rewrites any existing stub-shaped
      // .result file with an honest NO_GO so the downstream promotion
      // cannot run on second-chance reads.
      //
      // Pass is wrapped in try/catch and the inner helpers are typeof-
      // guarded so partial mocks of result-evaluator.js (test contexts
      // that stub only the rubric scorer) cannot abort RETRO.
      try {
        const haveSentinel = typeof writeHonestSentinelResult === 'function';
        const haveStubCheck = typeof isStubResult === 'function';
        if (haveSentinel || haveStubCheck) {
          const tasksDir = join(projectRoot, TASKS_DIR);
          for (const task of sprint.tasks) {
            const resultPath = join(tasksDir, `task-${task.id}.result`);
            const exists = existsSync(resultPath);
            if (!exists) {
              if (haveSentinel) {
                writeHonestSentinelResult(
                  projectRoot, task.id, [], 'worker-crashed-no-result',
                );
                evaluations.set(task.id, TaskEvaluation.NO_GO);
              }
              continue;
            }
            // Existing .result — check for stub shape and rewrite if dishonest
            try {
              const raw = readFileSync(resultPath, 'utf-8');
              const parsed = JSON.parse(raw) as TaskResult;
              if (haveStubCheck && isStubResult(parsed)) {
                debugLog('runRetroPhase:preFinalize', `Rewriting stub .result for task ${task.id}`);
                if (haveSentinel) {
                  writeHonestSentinelResult(
                    projectRoot, task.id, parsed.filesChanged ?? [], 'dishonest-done-stub',
                  );
                }
                evaluations.set(task.id, TaskEvaluation.NO_GO);
              }
            } catch (e) {
              debugLog('runRetroPhase:preFinalize:parse', `task=${task.id} ${e}`);
            }
          }
        }
      } catch (e) {
        debugLog('runRetroPhase:preFinalize', e);
      }

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
      const freshDebt = getDebtItems(projectRoot);
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
