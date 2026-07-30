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
  mkdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, TaskEvaluation, SprintPhase,
  SprintStatus, AlertLevel, ALL_PROVIDER_NAMES,
} from '../core/types.js';
import { DeckentError, createExecutionAuthorityError } from '../core/errors.js';

// ─── Core (type imports) ──────────────────────────────────────────
import type {
  Task, TaskResult, Sprint, SprintMetrics,
  ResolvedConfig, SprintSizeRecommendation,
  EvaluationResult, ProviderName,
} from '../core/types.js';

import {
  TASKS_DIR, DECKENT_VERSION, DECKENT_DIR, RUNTIME_DIR,
} from '../core/constants.js';

import { readJsonSafe, debugLog } from '../core/utils.js';
import { getDebtItems } from '../core/debt-store.js';
import { isPidAlive as isPidAliveShared } from '../core/pid-liveness.js';
import type { ProviderAdapter } from '../core/provider.js';
import { ProviderExecutionIngressHoldError } from '../core/provider-execution-ingress-authority.js';
import type { SpawnBackend } from './spawn-backend.js';
import type { ProviderAuthorityRuntimeServiceOpenResult } from '../core/provider-authority-composition.js';
import type { MandatoryCrossVerifyInvocationFactory } from './cross-verify-runner.js';
// born-614 SPRINT-TRACE-WIRE: EVALUATE-sonu worker-transcript + Brain-verdict kaydı.
import { recordSprintWorkerTrace } from './output-collector.js';
import { createOutputCollector } from '../core/output-collector.js';
import { loadWorkerPromptMeta } from '../core/trace-schema.js';
import { isDependencySatisfying } from './scheduler-truth.js';
import { applyWorkerExecutionBudgetPolicy } from '../core/execution-plan-digest.js';

// ─── Notify (DECKENT→USER:NOTIFY — Hot Fix H6) ──────────────────
import { notify } from '../core/notify.js';

// ─── Provider Failure Classifier (Sprint 272 — Task 006, F1-LIM faz-2b) ──
// Pure SSOT discriminating provider-side failures (usage-limit/auth/oom)
// from code failures so the FIX wave can PARK instead of re-running into
// a dead provider limit (269 live lesson).
import {
  summarizeProviderFailures,
  providerLimitFixSkipMessage,
  type ProviderFailureInput,
} from '../core/provider-failure-classifier.js';

// ─── Pre-Start Guards (born-672a GUARD-EXTRACT) — safe circular, see NOTE
// at the top of pre-start-guards.ts (deferred function-body-only usage) ──
import { runPreStartGuards } from './pre-start-guards.js';

// ─── Rollback ─────────────────────────────────────────────────────
import type { SafetyPoint } from './rollback.js';
import {
  rollback, getRollbackPolicy,
  recordRollbackInDebt, deleteSafetyPoint,
} from './rollback.js';

// ─── Partial Promotion (PROMOTE-W1b) ─────────────────────────────
import { attemptPartialPromotion } from './result-promoter.js';
import { revertFilesToHead } from '../agents/worker-rollback.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import {
  runHooks, runCiRegressionCheck, resolveCiGuardianConfig,
  parseTscErrorFiles,
} from '../core/plugin-hooks.js';
import type {
  AfterTaskContext,
  CiRegressionCheckResult,
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
import { resolveDebtChain } from './debt-chain.js';
import {
  resolveFixAncestorIds,
  resolveFixAttemptDepth,
  selectPendingFixTasks,
} from '../core/task-lineage.js';

// ─── Agent/Skill Pools ───────────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { SkillPoolManager } from '../core/skill-pool.js';
import { detectProjectStack } from '../core/stack-detector.js';

// ─── Rich Output ─────────────────────────────────────────────────
import { showSplashIfEnabled } from '../cli/helpers/splash.js';

// ─── Sprint Reporter ─────────────────────────────────────────────
import { calculateMetrics } from './sprint-reporter.js';

// ─── Rubric-Based Evaluation ─────────────────────────────────────
import { evaluateWithRubric, reconcileEvaluationSpuriousNoGo, applyTechDebtDowngrade, reconstructFromDurableEvidence } from './result-evaluator.js';

// ─── Honest Result Gate (Sprint 165 Task 1 — Bug X Fix) ─────────
// Single canonical honesty boundary. Applied before evaluateWithRubric
// to downgrade dishonest DONE stubs (linesAdded=0 + testsPassed=false)
// to NO_GO. Used a second time in runRetroPhase to write honest
// sentinels for tasks whose .result is missing, so the legacy
// tryCodeVerifiedDone path in finalizeSprint cannot auto-promote.
import {
  enforceHonestResultGate,
  writeHonestSentinelResult,
  isConfirmedStub,
} from './result-evaluator.js';

// ─── NOT_DISPATCHED Classification (Sprint 351 Task 351-008 — MOAT-3) ────
// Disk-evidence-based split between "dispatch never happened" and a real
// worker crash/timeout — see result-evaluator.ts for the full rationale.
import {
  classifyMissingResultDispatch,
  gatherDispatchTraceEvidence,
  classifyFixPhaseTasks,
  archivedResultExists,
} from './result-evaluator.js';

// ─── Verify-and-Complete FIX Signal (Sprint 272 — Task 272-004) ──────
// Consumes the Task-272-003 EXIT_WITHOUT_RESULT marker: when work is present
// on disk, the FIX prompt is reframed to audit-and-finish the partial work
// rather than restart from scratch (ADR-073 FIX prompt enrichment).
import {
  classifyExitWithoutResult,
  buildVerifyAndCompleteGuidance,
} from './result-evaluator.js';

// ─── Result Map Helper ──────────────────────────────────────────
import { buildResultsMap } from './result-collector.js';
import {
  assertTaskResultAuthoritiesReady,
  readAuthoritativeTaskResult,
  readRuntimeBudgetEvaluationAuthority,
} from './task-result-authority.js';

// ─── Overlap Detection (Sprint 324 — Task 324-004) ───────────────
import { ResultMerger } from './result-merger.js';

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
import { applyCascadeToSprint, applyUnblockToSprint, respawnEligibleTasks } from './sprint-spawner.js';
import { writeEvent, getCurrentSprintId, readEvents, SCOPE_INSUFFICIENT_CHANNEL } from './event-stream.js';
import { verifyProofOfFunction } from './proof-of-function.js';
import { checkWorkerLiveness } from './worker-liveness.js';
import type { FailureContext } from './result-evaluator.js';

// ─── Tool Inventory Probe (born-670a WIRE-PROBE) ──────────────────
import { probeToolInventory, formatToolInventory } from './worker-verify-tool.js';
import type { ToolInventory } from './worker-verify-tool.js';

// ─── Disk-Verify Gate (Sprint 199 199-001 — Synthetic NO_GO Kaynak 6) ──
// Mirrors the pattern at result-collector.ts:513-583 (Sprint 195 195-001).
import {
  verifyDiskAgainstClaim,
  DISK_VS_CLAIM_MISMATCH_CHANNEL,
  type DiskVerifyResult,
  type VerifyDiskOptions,
} from './disk-verify.js';

// ─── Cross-Verify Advisory Wire (Sprint 276 — XVER-1 Task 276-007) ──
// Best-effort cross-provider adversarial verification of high-stakes DONE/
// GO_WITH_TECH_DEBT tasks. Config-gated default-OFF (config.cross_verify.enabled);
// when disabled the wire below never calls runCrossVerify, so behavior is unchanged.
import { runCrossVerify } from './cross-verify-runner.js';

// ─── EVALUATE-phase enforcement gates (DECKENT-TRIAGE A14 + A9, Sprint 343) ──
// READ-only consumers of two existing-but-unconsumed enforcement primitives,
// both flag-gated default-off (config.gate.*). computeVerifyDelta reads the
// worker's task-start verify-delta baseline; enforceAdrCompliance scans changed
// files for ADR-006/008/010 violations (fails OPEN on internal error).
import { computeVerifyDelta } from '../agents/worker-lifecycle.js';
import { enforceAdrCompliance } from './authority-enforcer.js';

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
import { normalizeTaskResultShape } from '../core/task-result-schema.js';


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
 * born-484 armor: a rubric fault on ONE result (live case: codex worker's
 * array-shaped `notes` → TypeError in isVerificationTask) used to escape
 * whichever per-task loop called it — the EVALUATE loop closed a sprint
 * "0/0" while every worker had delivered. A single malformed result must
 * never truncate the loop it's evaluated in.
 *
 * 369-001 RUBRIC-ARMOR-COMPLETE: single source for every `evaluateWithRubric`
 * call site in this module (main EVALUATE, extension-hit late-result,
 * alive-grace-result, FIX-phase re-eval, NOT_DISPATCHED re-dispatch re-eval,
 * POSTFIX-PENDING-SCAN re-eval) — previously only the main EVALUATE site had
 * this armor; the other five had bare calls that could still truncate their
 * loop on the same class of fault.
 *
 * 455-002: the fallback used to hardcode `totalScore: 0` and cap the verdict
 * at GO_WITH_TECH_DEBT regardless of the worker's actual evidence — turning a
 * genuinely honest DONE+tests result into a fabricated "rubric total 0"
 * reason (missing rubric evidence is UNKNOWN, never a scored zero). It now
 * delegates to `reconstructFromDurableEvidence`, which re-derives a real
 * score from the durable, always-computable criteria (correctness/
 * test_coverage/scope_compliance/documentation) and applies the same
 * concrete-failure vetoes the primary rubric path enforces (schema
 * violation, worker self-NO_GO, testsPassed=false, scope violation) — a
 * clean DONE is possible, but only when durable evidence actually earns it.
 *
 * @internal Exported for unit testing of the fault-recovery path.
 */
export async function safeRubricReconcile(
  projectRoot: string,
  sprintIdFallback: string,
  task: Task,
  result: TaskResult,
): Promise<EvaluationResult> {
  try {
    return await reconcileEvaluationSpuriousNoGo(
      evaluateWithRubric(result, task, undefined, projectRoot), result, task, projectRoot);
  } catch (rubricErr) {
    const msg = rubricErr instanceof Error ? rubricErr.message : String(rubricErr);
    debugLog('safeRubricReconcile:fault', `task=${task.id} — ${msg}`);
    const reconstruction = reconstructFromDurableEvidence(result, task, msg);
    try {
      const sidFault = getCurrentSprintId(projectRoot) ?? sprintIdFallback;
      writeEvent(
        projectRoot, sidFault, 'brain', 'auditor',
        'BRAIN→AUDITOR:EVALUATION_FAULT',
        {
          taskId: task.id,
          error: msg,
          selfAssessment: result.selfAssessment,
          fallbackDecision: reconstruction.decision,
          reconstructedTotalScore: reconstruction.totalScore,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (e) { debugLog('safeRubricReconcile:fault-event', e); }
    const faultNote =
      `[evaluation-fault recovery] rubric evaluation threw (${msg}) — reconstructed from durable ` +
      `evidence (worker claim=${String(result.selfAssessment)}, testsPassed=${String(result.testsPassed)}) ` +
      `→ ${reconstruction.decision}`;
    result.notes = result.notes ? `${result.notes}\n${faultNote}` : faultNote;
    return reconstruction;
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
 * Sprint 199 199-001 — Synthetic NO_GO Kaynak 6 gate.
 *
 * Before runEvaluatePhase converts a missing `.result` into a synthetic
 * NO_GO, verify whether the worker actually produced code on disk. If yes,
 * enrich the result with disk findings and signal the caller to set
 * `task.status = MANUAL_REVIEW_REQUIRED` + emit
 * `BRAIN→AUDITOR:DISK_VS_CLAIM_MISMATCH`. If no, return the base result
 * unchanged (legacy NO_GO behavior preserved).
 *
 * Mirrors result-collector.ts:513-583. Verifier is injectable via `opts`
 * so unit tests can run without git or filesystem state.
 *
 * @internal Exported for unit tests of the gate semantics.
 */
export function gateSyntheticTimeoutResult(
  projectRoot: string,
  task: Task,
  baseResult: TaskResult,
  cause: string,
  opts?: VerifyDiskOptions,
): { result: TaskResult; diskVerify: DiskVerifyResult; reclassified: boolean } {
  const diskVerify = verifyDiskAgainstClaim(projectRoot, task.scope, opts);
  if (!diskVerify.hasDiskEvidence) {
    return { result: baseResult, diskVerify, reclassified: false };
  }
  const enrichedNotes =
    `${baseResult.notes ?? ''}; disk-verify found evidence ` +
    `(linesAdded=${diskVerify.linesAdded}, untrackedFiles=${diskVerify.untrackedFiles.length}, cause=${cause}). ` +
    `Status reclassified as MANUAL_REVIEW_REQUIRED — see sprint events.`;
  return {
    result: {
      ...baseResult,
      filesChanged: diskVerify.untrackedFiles,
      linesAdded: diskVerify.linesAdded,
      notes: enrichedNotes,
    },
    diskVerify,
    reclassified: true,
  };
}

// ═══ Pre-Dispatch Trigger Guard (Sprint 192 — Task 192-009 — W-INTEGRITY I-3) ══
// Sprint 191 RC: runEvaluatePhase Wave-3 task'lar dispatch olmadan
// tetiklendi. Premature evaluation hem evaluations Map'i kirletiyor hem de
// cascade'i yanlış tetikliyor. Bu kapı: en az bir task hâlâ pre-dispatch ise
// EVALUATE'e girme — log + event emit + return. Bayrak (enforceDispatchGate)
// opt-in: yalnız sprint-controller production yolundan true geçer; mevcut
// testler default false ile geriye-uyumlu kalır.

/**
 * Test seam: is a task "dispatched"? Returns true when ANY of the following
 * dispatch signals are present:
 *   • a `.result` file exists for it (caller already collected),
 *   • the caller marked it explicitly DEFERRED,
 *   • its in-memory `assignedWorker` is set,
 *   • its on-disk task.json has `assignedWorker` set,
 *   • a `.hb` heartbeat file exists on disk,
 *   • its status is past PENDING/DRAFT
 *     (CLAIMED/EXECUTING/TESTING/DOCUMENTING/DONE/NO_GO/PAUSED).
 *
 * Pure with respect to side effects (disk reads only; never mutates). Fail-
 * safe: any I/O error is debugLog'd and the task is treated as dispatched so
 * a transient FS issue cannot block evaluation indefinitely.
 *
 * @internal Exported for unit testing of the entry-guard semantics.
 */
export function isTaskDispatched(
  projectRoot: string,
  task: Task,
  collectedIds: ReadonlySet<string>,
  deferredIds: ReadonlySet<string>,
): boolean {
  if (collectedIds.has(task.id)) return true;
  if (deferredIds.has(task.id)) return true;
  if (typeof task.assignedWorker === 'string' && task.assignedWorker.length > 0) return true;
  if (
    task.status === TaskStatus.CLAIMED ||
    task.status === TaskStatus.EXECUTING ||
    task.status === TaskStatus.TESTING ||
    task.status === TaskStatus.DOCUMENTING ||
    task.status === TaskStatus.DONE ||
    task.status === TaskStatus.NO_GO ||
    // born-610: MRR is settled (terminally classified) — omitting it made an
    // MRR task read as "not yet dispatched" at the EVALUATE boundary (4th
    // divergence of the pre-610 multi-truth family).
    task.status === TaskStatus.MANUAL_REVIEW_REQUIRED ||
    task.status === TaskStatus.PAUSED
  ) {
    return true;
  }
  try {
    const hbPath = join(projectRoot, TASKS_DIR, `task-${task.id}.hb`);
    if (existsSync(hbPath)) return true;
  } catch (e) { debugLog('isTaskDispatched:hb', e); }
  try {
    const freshPath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
    if (existsSync(freshPath)) {
      const raw = readFileSync(freshPath, 'utf-8');
      const fresh = JSON.parse(raw) as Partial<Task>;
      if (typeof fresh.assignedWorker === 'string' && fresh.assignedWorker.length > 0) return true;
      if (
        fresh.status !== undefined &&
        fresh.status !== TaskStatus.DRAFT &&
        fresh.status !== TaskStatus.PENDING
      ) {
        return true;
      }
    }
  } catch (e) { debugLog('isTaskDispatched:fresh', e); }
  return false;
}

/**
 * Returns the IDs of tasks that are not yet dispatched and not explicitly
 * deferred. {@link runEvaluatePhase} uses this list (when its entry-guard is
 * enforced) to early-return rather than fire premature evaluations on Wave-N
 * tasks the dispatcher has not reached. Order matches `sprint.tasks` for
 * deterministic debug logs.
 *
 * @internal Exported for unit testing.
 */
export function findUndispatchedTaskIds(
  projectRoot: string,
  sprint: Sprint,
  results: readonly TaskResult[],
  deferredIds?: ReadonlySet<string>,
): string[] {
  const collectedIds = new Set(results.map(r => r.taskId));
  const deferred = deferredIds ?? new Set<string>();
  const undispatched: string[] = [];
  for (const task of sprint.tasks) {
    if (!isTaskDispatched(projectRoot, task, collectedIds, deferred)) {
      undispatched.push(task.id);
    }
  }
  return undispatched;
}

/**
 * IDs of tasks whose dependencies are ALL satisfied (DONE, aggregate-aware via
 * `fixForTaskId`) yet which were never dispatched — not collected, no
 * heartbeat, no assigned worker, still PENDING. These are the Sprint 271-013
 * race victims: a task whose final blocking dependency landed too late for the
 * dispatcher to pick it up before the collection-done check, about to take a
 * synthetic NO_GO for work that never ran.
 *
 * Distinct from {@link findUndispatchedTaskIds}: this is dependency-aware (only
 * READY tasks count) and deliberately IGNORES the deferred shortcut — a
 * deferred task whose deps are now DONE is exactly the bug, not a legitimately
 * skipped one. `result-collector.waitForResults` now dispatches these before
 * returning; this helper is the EVALUATE-boundary diagnostic for the residual
 * case (e.g. a spawn error left a ready task genuinely undispatchable). Control
 * flow is unchanged. Pure (disk reads via {@link isTaskDispatched}, never
 * mutates).
 *
 * @internal Exported for unit testing.
 */
export function findReadyUndispatchedTaskIds(
  projectRoot: string,
  sprint: Sprint,
  results: readonly TaskResult[],
): string[] {
  const collectedIds = new Set(results.map(r => r.taskId));
  const doneIds = new Set<string>();
  for (const t of sprint.tasks) {
    if (!isDependencySatisfying(t.status)) continue; // born-610 single truth
    doneIds.add(t.id);
    if (t.fixForTaskId) doneIds.add(t.fixForTaskId);
  }
  const noDeferred: ReadonlySet<string> = new Set();
  const out: string[] = [];
  for (const task of sprint.tasks) {
    if (!task.dependencies || task.dependencies.length === 0) continue;
    if (!task.dependencies.every(dep => doneIds.has(dep))) continue;
    if (isTaskDispatched(projectRoot, task, collectedIds, noDeferred)) continue;
    out.push(task.id);
  }
  return out;
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
 * TEL-W1 (Sprint 303): Build the Brain-owned evaluation reason string.
 * When NO_GO was driven by a concrete veto (honest-gate violation or
 * concrete test failure), the cause is appended so observers can distinguish
 * "raise the rubric score" from "fix the actual boundary/test violation".
 * Falls back to the rubric-score-only format when no concrete veto reason exists.
 *
 * @internal Exported for unit testing only.
 */
export function buildBrainEvaluationReason(
  rubricScore: number,
  evaluation: TaskEvaluation,
  verdictLabel: string,
  gated: { honest: boolean; violation?: string },
  result: Pick<TaskResult, 'testsPassed' | 'selfAssessment'>,
  authorityCause?: string,
): string {
  if (evaluation === TaskEvaluation.NO_GO) {
    let vetoReason: string | undefined;
    if (authorityCause) {
      vetoReason = authorityCause;
    } else if (!gated.honest && gated.violation) {
      vetoReason = gated.violation;
    } else if (result.testsPassed === false) {
      vetoReason = 'concrete_test_failed';
    } else if (result.selfAssessment === 'NO_GO') {
      vetoReason = 'worker_self_no_go';
    }
    if (vetoReason) {
      return `rubric total ${rubricScore} → NO_GO (cause: ${vetoReason})`;
    }
  }
  return `rubric total ${rubricScore} → ${verdictLabel}`;
}

/**
 * Sprint 207 P1-2 (forensic Sprint 206): persist Brain's verdict back to a
 * task's `.result` file. Until this existed the Brain decision lived only in
 * the audit ledger (`.deckent/runtime/evaluations/*.json`); inspecting a `.result`
 * showed the worker's self-claim ("DONE") with no trace of WHY a FIX was
 * spawned — the exact observability gap that made the Sprint 206 false-FIX
 * cascade hard to see. `brainEvaluation` + `brainEvaluationReason` are
 * Brain-owned fields written alongside (never overwriting) the worker's
 * selfAssessment; every other result field is preserved byte-for-byte.
 *
 * MF-5 (Sprint 331 — Task 331-014): extracted verbatim from the inline
 * EVALUATE-phase block so the FIX phase can mirror the SAME enrichment shape,
 * closing the `-fix.result` format-inconsistency (a fix-result previously
 * carried no Brain verdict). The shared function guarantees the two phases
 * produce an identical block rather than copy-paste drifting. `rubricScores`
 * stay intentionally audit-only (written separately to `.deckent/runtime/evaluations/`
 * via {@link writeEvaluationAudit}) and are deliberately NOT mirrored here.
 *
 * Fail-soft & non-blocking: a missing `.result` is a silent no-op; any
 * read/write error is debugLog'd and never aborts the caller (EVALUATE or FIX).
 *
 * @internal Exported for unit testing only.
 */
export function persistBrainVerdict(
  projectRoot: string,
  taskId: string,
  evaluation: TaskEvaluation,
  rubricScore: number,
  gated: { honest: boolean; violation?: string },
  result: Pick<TaskResult, 'testsPassed' | 'selfAssessment'>,
  authorityCause?: string,
): void {
  try {
    const resultPath = join(projectRoot, '.tasks', `task-${taskId}.result`);
    if (existsSync(resultPath)) {
      const persisted = readJsonSafe<TaskResult & { brainEvaluation?: string; brainEvaluationReason?: string }>(resultPath);
      if (persisted) {
        const verdictLabel = toAuditDecision(evaluation);
        persisted.brainEvaluation = verdictLabel;
        persisted.brainEvaluationReason = buildBrainEvaluationReason(
          rubricScore, evaluation, verdictLabel, gated, result, authorityCause,
        );
        writeFileSync(resultPath, JSON.stringify(persisted, null, 2) + '\n', 'utf-8');
      }
    }
  } catch (e) { debugLog('persistBrainVerdict', e); }
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

/**
 * 352-003 (EVAL-AUDIT-REVIVE): single forensic-audit write path shared by
 * every EVALUATE-phase branch that reaches a task-evaluation decision.
 *
 * RC (disk-verify, git-trail): the inline writeEvaluationAudit block
 * (formerly duplicated only at the collectedIds.has(task.id) top-of-loop
 * site) was never reached by the three alternate branches inside
 * runEvaluatePhase that also call handleEvaluation + evaluations.set —
 * extension-hit (late .result during the runtime-extension poll window),
 * alive-grace-hit (late .result during the 60s liveness grace-poll), and
 * the timeout/synthetic-NO_GO branch (no .result ever collected). The
 * first two HAVE a rubric result; the third does not. Both shapes must
 * still produce a decision + rationale record — this function is the
 * single call site all four branches now share.
 *
 * `rubricResult` omitted → rubric'siz path: criterionScores=[], totalScore=0,
 * schemaValidation flags the missing `.result` explicitly (not a passing
 * schema — there was never a result to validate). `rationaleOverride` lets
 * the rubric'siz caller supply a human-readable cause (e.g. liveness status)
 * instead of the rubric-derived rationale, which would otherwise degenerate
 * to "0 criteria, 0 passed" and lose the actual reason.
 *
 * Fail-soft: any audit-write error is debugLog'd but must not abort the
 * EVALUATE loop — mirrors every other best-effort block in this phase.
 */
export function writeTaskEvaluationAudit(
  projectRoot: string,
  sprintId: string,
  task: Task,
  evaluation: TaskEvaluation,
  rubricResult?: EvaluationResult,
  rationaleOverride?: string,
): void {
  try {
    const rubricScores = rubricResult?.rubricScores ?? [];
    const totalScore = rubricResult?.totalScore ?? 0;
    const auditCriteria = toAuditCriterionScores(task, rubricScores);
    const auditSchema = rubricResult
      ? toAuditSchemaValidation(task, rubricScores)
      : { valid: false, missingFields: ['result'], coverageRelaxed: false };
    const auditDecision = toAuditDecision(evaluation);
    const rationale = rationaleOverride ?? buildDecisionRationale(
      auditDecision, totalScore, auditCriteria, auditSchema,
    );
    writeEvaluationAudit(projectRoot, sprintId, task.id, 1, {
      ruleSet: toAuditRuleSet(task),
      schemaValidation: auditSchema,
      criterionScores: auditCriteria,
      totalScore,
      decision: auditDecision,
      decisionRationale: rationale,
    });
  } catch (e) { debugLog('writeTaskEvaluationAudit', e); }
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


// ═══ Tool Inventory Probe (born-670a WIRE-PROBE) ═══════════════════
//
// probeToolInventory (worker-verify-tool.ts, TT555 waste-class d) probes the
// host's PATH for a fixed tool whitelist. This wire runs it ONCE at sprint
// start (inside runPlanPhase, below) and persists the formatted one-line
// result to disk so prompt-god-template's buildEnvProbeBlock
// (SprintContext.toolInventory) can render real per-host data instead of
// staying permanently empty (its state before born-670a).
//
// File-based hand-off, mirroring baseline-tracker.ts's writeBaseline/
// readBaseline pair (WP-14's `preExistingFailures`): the per-task prompt is
// compiled by a different caller (task-builder.ts buildWorkerPrompt) than
// the one that probes (this PLAN phase, which runs once per sprint, not
// once per task) — a disk file is the hand-off, not in-memory threading.
//
// Fail-soft by contract (born-670a goCriteria): a probe error must never
// abort sprint start. probeToolInventory's own defaultToolExists already
// resolves false on a spawn error rather than throwing, but the wrapper
// below catches defensively too — no file is written on error, so
// readToolInventory() returns undefined and buildEnvProbeBlock renders ''
// exactly like today.

// ─── 429-011 HYG: runtime-artifact home + dual-read ─────────────────
// The original born-670a path (`.deckent/<sprintId>-tool-inventory.txt`)
// lived flat at the .deckent root, accumulated forever (no cleanup), and
// was never covered by .gitignore (confirmed via `git status` /
// `git check-ignore` — a real per-sprint file leak). Moved to the same
// runtime purpose-folder as JOBS_DIR/DECISIONS_LOG_DIR/EVALUATIONS_DIR
// (core/constants.ts RUNTIME_DIR) and wired into runCleanupPhase below.
const TOOL_INVENTORY_DIR = join(RUNTIME_DIR, 'tool-inventory');

/** Resolve the per-sprint tool-inventory file path (new, canonical home). */
export function toolInventoryPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, TOOL_INVENTORY_DIR, `${sprintId}.txt`);
}

/**
 * Resolve the pre-429-011 flat-root path. Read-only fallback for one
 * version — a sprint whose PLAN phase ran under the old code already has
 * its inventory at this path; {@link readToolInventory} falls back to it so
 * such a sprint doesn't lose its env-probe block mid-flight. Never written
 * to by new code. Candidate for removal once no in-flight sprint predates
 * this change.
 */
function legacyToolInventoryPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-tool-inventory.txt`);
}

/** Persist an already-formatted one-line inventory (e.g. `python3=yes docker=no rg=yes`) to disk. */
export function writeToolInventory(projectRoot: string, sprintId: string, inventoryLine: string): void {
  const dir = join(projectRoot, TOOL_INVENTORY_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(toolInventoryPath(projectRoot, sprintId), inventoryLine, 'utf-8');
}

/**
 * Read back the one-line inventory a prior {@link writeToolInventory} call
 * persisted for this sprint. Tries the new runtime-artifact path first,
 * then falls back to the pre-429-011 flat-root path (dual-read — see
 * {@link legacyToolInventoryPath}). Returns undefined when neither exists or
 * is blank (no probe ran this sprint, or it failed) — a caller (e.g.
 * task-builder.ts buildWorkerPrompt) passes this straight through to
 * SprintContext.toolInventory; undefined there means buildEnvProbeBlock
 * renders '' exactly like today.
 */
export function readToolInventory(projectRoot: string, sprintId: string): string | undefined {
  const filePath = existsSync(toolInventoryPath(projectRoot, sprintId))
    ? toolInventoryPath(projectRoot, sprintId)
    : legacyToolInventoryPath(projectRoot, sprintId);
  if (!existsSync(filePath)) return undefined;
  try {
    const raw = readFileSync(filePath, 'utf-8').trim();
    return raw.length > 0 ? raw : undefined;
  } catch (e) {
    debugLog('readToolInventory', e);
    return undefined;
  }
}

/**
 * Remove this sprint's tool-inventory artifact(s) — both the new
 * runtime-artifact path and the pre-429-011 legacy flat-root path, if
 * present. Scoped to exactly one sprintId (never a wildcard/cross-sprint
 * sweep), so it can only ever remove the completing sprint's own file —
 * a concurrently-running sprint's inventory is untouched. Fail-soft, each
 * removal independently try/catched (mirrors cleanupSprintMetadata's style
 * in sprint-controller.ts). Called from runCleanupPhase (Phase 8), which
 * only runs at genuine sprint completion.
 */
export function cleanupToolInventory(projectRoot: string, sprintId: string): void {
  try {
    const p = toolInventoryPath(projectRoot, sprintId);
    if (existsSync(p)) unlinkSync(p);
  } catch (e) { debugLog('cleanupToolInventory:new', e); }

  try {
    const p = legacyToolInventoryPath(projectRoot, sprintId);
    if (existsSync(p)) unlinkSync(p);
  } catch (e) { debugLog('cleanupToolInventory:legacy', e); }
}

/**
 * Probe the host once and persist the formatted inventory for this sprint.
 * Fail-soft: any error (probe rejection, disk I/O) is swallowed — never
 * throws, never leaves a partial/corrupt file. `probe` is injectable so
 * callers (and tests) can supply a fixed inventory instead of hitting the
 * real PATH — defaults to the real {@link probeToolInventory}.
 */
export async function probeAndPersistToolInventory(
  projectRoot: string,
  sprintId: string,
  probe: () => Promise<ToolInventory> = () => probeToolInventory(),
): Promise<void> {
  try {
    const inventory = await probe();
    writeToolInventory(projectRoot, sprintId, formatToolInventory(inventory));
  } catch (e) {
    debugLog('probeAndPersistToolInventory', e);
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

    // born-670a WIRE-PROBE: probe the host's tool inventory ONCE at sprint
    // start (see the Tool Inventory Probe section above) so the worker
    // prompt's env-probe block can render real data. Fail-soft — double-
    // wrapped per this phase's established defense-in-depth convention
    // (every other side-effecting step below is independently guarded too).
    try {
      await probeAndPersistToolInventory(projectRoot, sprint.id);
    } catch (e) { debugLog('runPlanPhase:toolInventory', e); }

    // Show Kraken splash on first sprint start (non-fatal)
    if (sprint.number === 1) {
      try {
        const splash = showSplashIfEnabled(config, DECKENT_VERSION);
        if (splash) console.log(splash);
      } catch (e) { debugLog('runPlanPhase:showSplash', e); }
    }

    // born-672a GUARD-EXTRACT: build-staleness pre-flight, pre-spawn CI/tsc
    // gate, beforeSprint hooks, and the git rollback safety point — bundled
    // into pre-start-guards.ts (born-672b will run the same sequence from
    // the exact-snapshot start path). Order/fail-soft-vs-hard semantics are
    // bit-exact with the pre-extraction inline blocks.
    const { safetyPoint } = await runPreStartGuards(projectRoot, sprint, config, rollbackEnabled);

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
      taskQueue = await spawnWorkers(projectRoot, sprint, config, {
        autoApprove: opts?.autoApprove,
        spawnBackend,
        attendedExecutionApprovalAuthority: opts?.attendedExecutionApprovalAuthority,
        providerAuthority: opts?.providerAuthority,
        ...(opts?.exactPlanAuthority
          ? { exactPlanAuthority: opts.exactPlanAuthority }
          : {}),
      });
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
        // MOAT-2 (ADR-G-013): unref the SPRINT's dashboard scan loop so it cannot
        // pin the coordinator's event loop past sprint completion (e.g. a throw
        // during EXECUTE that skips runCleanupPhase's clearInterval). unref here at
        // the sprint call-site ONLY — startScanLoop stays ref'd for the standalone
        // `deckent audit` daemon, whose scan loop IS its reason to stay alive.
        scanInterval?.unref?.();
      } catch (e) { debugLog('runSpawnPhase:startScanLoop', e); }
      break;
    } catch (err) {
      if (err instanceof ProviderExecutionIngressHoldError) {
        if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
        throw err;
      }
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

// ═══ Runtime Timeout Extension (Sprint 191 — Task 191-002) ═════════
// Heartbeat-aware extension decision used by runEvaluatePhase before
// declaring a synthetic NO_GO for a missing .result file.
//
// Wire contract (DIRECTIVES Sprint 191 Task 191-002):
//   • Default ON (config.timeout.runtime_extension_enabled = true).
//   • Heartbeat fresher than 90s → eligible.
//   • Per-task hard cap of 3 extensions → +5min each → +15min total.
//   • State is held in a caller-provided Map so re-entry preserves
//     counters across evaluate cycles (FIX-phase parallel/retry callers
//     would otherwise reset the counter every loop).

/** Hard cap on runtime extensions per task (matches DIRECTIVES Task 191-002). */
export const RUNTIME_EXTENSION_MAX = 3;
/** Default per-extension grant in milliseconds (DIRECTIVES: +5 minutes). */
export const RUNTIME_EXTENSION_MS = 5 * 60 * 1000;
/** Default heartbeat freshness threshold in seconds (DIRECTIVES: last 90s). */
export const RUNTIME_EXTENSION_HEARTBEAT_FRESH_S = 90;

/** Map keyed by `${sprintId}::${taskId}` → extension count consumed. */
export type ExtensionStateMap = Map<string, number>;

/**
 * Decision payload returned by {@link evaluateRuntimeExtension}.
 */
export interface RuntimeExtensionDecision {
  /** True when caller should grant an extension instead of declaring NO_GO. */
  granted: boolean;
  /** Diagnostic reason — always present, useful for debugLog + events. */
  reason:
    | 'disabled'
    | 'no_heartbeat'
    | 'invalid_heartbeat'
    | 'stale_heartbeat'
    | 'cap_reached'
    | 'granted';
  /** Number of extensions consumed so far (after this call) when granted. */
  extensionCount: number;
  /** Time budget for this extension in ms (only when granted). */
  extensionMs: number;
}

/**
 * Decide whether a timed-out task should receive a runtime extension based
 * on (a) the project's `runtime_extension_enabled` flag, (b) heartbeat
 * freshness and (c) the per-task extension counter.
 *
 * Pure with respect to disk only at the heartbeat file — never mutates
 * results or task state. The `state` Map is mutated in place when an
 * extension is granted so the counter advances across calls.
 *
 * @param projectRoot     project root (heartbeat lives in `.tasks/`)
 * @param sprintId        sprint id used to namespace the state key
 * @param taskId          task id to evaluate
 * @param config          resolved config (timeout.runtime_extension_enabled checked)
 * @param state           caller-owned counter map (idempotent across re-entry)
 * @param now             clock injection for tests (default Date.now)
 */
export function evaluateRuntimeExtension(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  config: ResolvedConfig | undefined,
  state: ExtensionStateMap,
  now: () => number = Date.now,
): RuntimeExtensionDecision {
  const enabled = config?.timeout?.runtime_extension_enabled === true;
  const key = `${sprintId}::${taskId}`;
  const used = state.get(key) ?? 0;

  if (!enabled) {
    return { granted: false, reason: 'disabled', extensionCount: used, extensionMs: 0 };
  }
  if (used >= RUNTIME_EXTENSION_MAX) {
    return { granted: false, reason: 'cap_reached', extensionCount: used, extensionMs: 0 };
  }

  const hbPath = join(projectRoot, TASKS_DIR, `task-${taskId}.hb`);
  if (!existsSync(hbPath)) {
    return { granted: false, reason: 'no_heartbeat', extensionCount: used, extensionMs: 0 };
  }

  let timestamp: string | undefined;
  try {
    const raw = readFileSync(hbPath, 'utf-8');
    const hb = JSON.parse(raw) as { timestamp?: string };
    timestamp = hb.timestamp;
  } catch (e) {
    debugLog('evaluateRuntimeExtension:parseHeartbeat', e);
    return { granted: false, reason: 'invalid_heartbeat', extensionCount: used, extensionMs: 0 };
  }

  if (!timestamp) {
    return { granted: false, reason: 'invalid_heartbeat', extensionCount: used, extensionMs: 0 };
  }

  const hbMs = new Date(timestamp).getTime();
  if (!Number.isFinite(hbMs)) {
    return { granted: false, reason: 'invalid_heartbeat', extensionCount: used, extensionMs: 0 };
  }
  const ageSeconds = (now() - hbMs) / 1000;
  if (ageSeconds > RUNTIME_EXTENSION_HEARTBEAT_FRESH_S) {
    return { granted: false, reason: 'stale_heartbeat', extensionCount: used, extensionMs: 0 };
  }

  const nextCount = used + 1;
  state.set(key, nextCount);
  return {
    granted: true,
    reason: 'granted',
    extensionCount: nextCount,
    extensionMs: RUNTIME_EXTENSION_MS,
  };
}

/**
 * Poll for a `.result` file with a bounded budget. Returns true if the
 * file appears (and is parseable) within `budgetMs`, false on timeout.
 *
 * Used by {@link runEvaluatePhase} when an extension is granted — gives the
 * still-progressing worker a chance to write its result before the synthetic
 * NO_GO fires. Missing/invalid legacy files remain pollable; corrupt Docker
 * authority or an invalid immutable settlement payload fails loudly instead
 * of being converted into a synthetic result.
 */
export async function pollForResultFile(
  projectRoot: string,
  taskId: string,
  budgetMs: number,
  pollIntervalMs = 5_000,
): Promise<TaskResult | null> {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const authority = readAuthoritativeTaskResult<TaskResult>(projectRoot, taskId);
    const parsed = normalizeTaskResultShape(authority.result);
    if (authority.state === 'settled' && !parsed) {
      throw new Error(`Invalid host-owned Docker result settlement payload for task ${taskId}`);
    }
    if (parsed) return parsed;
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  // Final check after the loop's last sleep — covers the case where the
  // result lands exactly on the deadline boundary.
  const authority = readAuthoritativeTaskResult<TaskResult>(projectRoot, taskId);
  const parsed = normalizeTaskResultShape(authority.result);
  if (authority.state === 'settled' && !parsed) {
    throw new Error(`Invalid host-owned Docker result settlement payload for task ${taskId}`);
  }
  if (parsed) return parsed;
  if (authority.state === 'pending-settlement') {
    throw createExecutionAuthorityError(
      `Result poll deadline HOLD for task ${taskId}: Docker settlement is pending`,
    );
  }
  return null;
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
  config?: ResolvedConfig,
  extensionState?: ExtensionStateMap,
  deferredTaskIds?: ReadonlySet<string>,
  options?: {
    enforceDispatchGate?: boolean;
    providerAuthority?: ProviderAuthorityRuntimeServiceOpenResult;
    crossVerifyInvocationFactory?: MandatoryCrossVerifyInvocationFactory;
  },
): Promise<void> {
  // ─── Idempotency Guard (Sprint 157 Task 002) ───────────────────
  // Acquire PID-bound lock; if a live evaluation is already running
  // for this sprint, second call is a NO_OP.
  if (!tryAcquireEvaluateLock(projectRoot, sprint.id)) {
    debugLog('runEvaluatePhase:noop', `lock held — sprint=${sprint.id} pid=${process.pid}`);
    return;
  }
  // Sprint 191 Task 191-002: caller-supplied counter so the per-task
  // extension cap survives FIX-phase re-entry; default to a fresh map
  // (legacy callers without extension state behave as before).
  const extState: ExtensionStateMap = extensionState ?? new Map();
  // When the caller does not supply config (legacy sprint-controller
  // call site), lazy-load it from disk so the runtime-extension wire
  // is active by default. Fail-soft: any load error falls back to
  // pre-Sprint-191 behavior (no extension, synthetic NO_GO on timeout).
  let resolvedConfig: ResolvedConfig | undefined = config;
  if (!resolvedConfig) {
    try {
      const { loadConfig } = await import('../core/config.js');
      resolvedConfig = await loadConfig(projectRoot);
    } catch (e) {
      debugLog('runEvaluatePhase:loadConfig', e);
    }
  }
  const initialFixPolicy = {
    allowPriorityFixCreation:
      resolvedConfig?.fix_phase_enabled !== false
      && (resolvedConfig?.max_fix_retries ?? 2) > 0,
  };
  try {
    assertTaskResultAuthoritiesReady(
      projectRoot,
      sprint.tasks.map(task => task.id),
      'evaluate-entry',
    );

    // ─── Pre-Dispatch Trigger Guard (Sprint 192 — Task 192-009 — W-INTEGRITY I-3) ──
    // Memory: Sprint 191 RC — runEvaluatePhase Wave-N task'lar dispatch
    // olmadan tetiklendi → boş evaluations + bozuk cascade. Bayrak opt-in:
    // sprint-controller production yolundan true geçer; mevcut testler
    // ve recovery path'leri default false ile geriye uyumlu kalır. Guard
    // tetiklenirse phase EXECUTE'da kalır (persistPhaseTransition yapılmaz)
    // ve sonraki çağrı yine deneyebilir (finally lock release eder).
    if (options?.enforceDispatchGate === true) {
      // Sprint 272 Task 272-002 — dispatch/EVALUATE race diagnostic. A task
      // whose deps are all DONE but which reached EVALUATE undispatched is the
      // Sprint 271-013 victim. result-collector.waitForResults now dispatches
      // these before returning; this fail-soft event surfaces the residual
      // case (e.g. a spawn error left it genuinely undispatchable) for the
      // auditor/forensics. No control-flow change — evaluation proceeds via the
      // existing undispatched path below.
      const readyUndispatched = findReadyUndispatchedTaskIds(projectRoot, sprint, results);
      if (readyUndispatched.length > 0) {
        try {
          const sidForReady = getCurrentSprintId(projectRoot) ?? sprint.id;
          writeEvent(
            projectRoot, sidForReady, 'brain', 'auditor',
            'BRAIN→AUDITOR:READY_TASK_UNDISPATCHED',
            {
              sprintId: sprint.id,
              taskIds: readyUndispatched,
              totalTasks: sprint.tasks.length,
              collectedResults: results.length,
              timestamp: new Date().toISOString(),
            },
          );
        } catch (e) { debugLog('runEvaluatePhase:readyUndispatched-event', e); }
      }

      const undispatched = findUndispatchedTaskIds(
        projectRoot, sprint, results, deferredTaskIds,
      );
      if (undispatched.length > 0) {
        debugLog(
          'runEvaluatePhase:premature',
          `premature EVALUATE — waiting for dispatch — undispatched=[${undispatched.join(',')}]`,
        );
        try {
          const sidForGate = getCurrentSprintId(projectRoot) ?? sprint.id;
          writeEvent(
            projectRoot, sidForGate, 'brain', 'auditor',
            'BRAIN→AUDITOR:EVALUATE_PREMATURE',
            {
              sprintId: sprint.id,
              undispatchedTaskIds: undispatched,
              totalTasks: sprint.tasks.length,
              collectedResults: results.length,
              deferredCount: deferredTaskIds?.size ?? 0,
              timestamp: new Date().toISOString(),
            },
          );
        } catch (e) { debugLog('runEvaluatePhase:premature-event', e); }
        return;
      }
    }

    // Sprint 161 Task 2 (T-003): EVALUATE entry — phase reaches disk so
    // observers see the EXECUTE→EVALUATE transition. Previously sprint-
    // state.json froze on SPAWN through to CLEANUP (Sprint 159 forensic).
    persistPhaseTransition(projectRoot, sprint, SprintPhase.EVALUATE, SprintStatus.EVALUATING);
    const resultsMap = buildResultsMap(results);
    const collectedIds = new Set(results.map(r => r.taskId));
    debugLog('runEvaluatePhase:start', `totalTasks=${sprint.tasks.length} collectedResults=${results.length} collectedIds=[${[...collectedIds].join(',')}]`);

    // Resolve CI guardian config once for all tasks
    const ciGuardianConfig = resolveCiGuardianConfig(projectRoot);

    // XVER-SPRINT-WIRE (MASTER-PLAN 659): the owner's `verifier_priority` IS an
    // explicit verifier selection — the sprint-side counterpart of the CLI's
    // `--verifier`. It is deliberately NOT registry enumeration: an unauthored
    // list keeps the runner's fail-closed `verifier-eligibility-evidence-missing`
    // skip. It is a selection, not live reachability — an unreachable provider
    // still fails honestly at spawn, after zero fabricated evidence.
    const ownerVerifierSelection = config?.cross_verify?.verifier_priority
      ?.map(provider => provider.trim())
      .filter((provider): provider is ProviderName =>
        (ALL_PROVIDER_NAMES as readonly string[]).includes(provider));
    // Each dispatch is a billed provider call; the owner ceiling bounds one
    // sprint's exposure (canary = 1). Absent = no ceiling.
    const maxVerificationsPerSprint = config?.cross_verify?.max_verifications_per_sprint;
    let verificationsDispatched = 0;

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
          // MF-8 (Sprint 252): pass disk-evidence so the gate doesn't flip a
          // real deliverable to NO_GO when `linesAdded` under-reports (untracked
          // files from docker/host-adapter workers — git numstat returns 0).
          // Best-effort; a fault falls through to the no-disk-evidence path.
          let diskVerify: DiskVerifyResult | undefined;
          try {
            diskVerify = verifyDiskAgainstClaim(projectRoot, task.scope);
          } catch (e) {
            debugLog('runEvaluatePhase:honestGate:diskVerify:fault', e);
          }
          gated = typeof enforceHonestResultGate === 'function'
            ? enforceHonestResultGate(rawResult, task, diskVerify)
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

        const runtimeBudgetAuthority = readRuntimeBudgetEvaluationAuthority(
          projectRoot,
          task.id,
        );

        // Sprint 191 P191-1: pass projectRoot so OOM-killed / partial-result
        // workers can be reconciled via reconcileSpuriousNoGo (git diff fallback).
        // 369-001: fault-armor (born-484) extracted to safeRubricReconcile —
        // single source shared by every evaluateWithRubric call site in this
        // module (see helper doc comment). Exact host runtime-budget authority
        // skips that recovery probe: immutable containment is not a spurious
        // worker NO_GO and must not spend more host work trying to promote it.
        const rubricResult: EvaluationResult = runtimeBudgetAuthority
          ? evaluateWithRubric(result, task, undefined, projectRoot)
          : await safeRubricReconcile(projectRoot, sprint.id, task, result);
        let evaluation = runtimeBudgetAuthority
          ? TaskEvaluation.NO_GO
          : toTaskEvaluation(rubricResult);

        // PROMOTE-W1b: flag-gated partial promotion (default-off).
        // Runs BEFORE the honest-gate lock so genuine rubric-NO_GO+isPartialPromotable
        // results can be salvaged; the lock below overrides for dishonest stubs.
        {
          type ConfigWithPP = ResolvedConfig & { partial_promotion_enabled?: boolean };
          const ppEnabled = (config as ConfigWithPP | undefined)?.partial_promotion_enabled === true;
          if (
            ppEnabled &&
            evaluation === TaskEvaluation.NO_GO &&
            rubricResult.isPartialPromotable === true &&
            gated.honest &&
            !runtimeBudgetAuthority
          ) {
            try {
              const ppResult = await attemptPartialPromotion(projectRoot, task, result, rubricResult);
              if (ppResult.promoted) {
                // in-scope commit
                try {
                  execFileSync('git', ['add', '--', ...ppResult.inScopeFiles], {
                    cwd: projectRoot, stdio: ['ignore', 'ignore', 'pipe'],
                  });
                  execFileSync('git', ['commit', '-m',
                    `partial-promotion: task-${task.id} in-scope work salvaged [PROMOTE-W1b]`], {
                    cwd: projectRoot, stdio: ['ignore', 'ignore', 'pipe'],
                  });
                } catch (e) {
                  debugLog('runEvaluatePhase:partialPromotion:commit', e);
                }
                // out-of-scope revert
                if (ppResult.droppedFiles.length > 0) {
                  try {
                    revertFilesToHead(projectRoot, ppResult.droppedFiles);
                  } catch (e) {
                    debugLog('runEvaluatePhase:partialPromotion:revert', e);
                  }
                }
                // upgrade verdict
                evaluation = TaskEvaluation.GO_WITH_TECH_DEBT;
                // emit BRAIN→AUDITOR event
                try {
                  const sidForPP = getCurrentSprintId(projectRoot) ?? sprint.id;
                  writeEvent(
                    projectRoot, sidForPP, 'brain', 'auditor',
                    'BRAIN→AUDITOR:PARTIAL_PROMOTION_APPLIED',
                    {
                      taskId: task.id,
                      inScopeFiles: ppResult.inScopeFiles,
                      droppedFiles: ppResult.droppedFiles,
                      originalVerdict: 'NO_GO',
                      upgradedVerdict: 'GO_WITH_TECH_DEBT',
                      timestamp: new Date().toISOString(),
                    },
                  );
                } catch (e) {
                  debugLog('runEvaluatePhase:partialPromotion:event', e);
                }
              }
            } catch (e) {
              debugLog('runEvaluatePhase:partialPromotion', e);
            }
          }
        }

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

        // Proof-of-Function gate (ADR-079): a Tier-1 (user-surface) task that has
        // survived as DONE must prove its `Smoke:` command actually runs host-side.
        // verifyProofOfFunction is inert for Tier-0 / no-smoke / non-DONE; a failing
        // smoke downgrades DONE → GO_WITH_TECH_DEBT (it certifies wiring, not UX) and
        // emits a PROOF_OF_FUNCTION_MISMATCH event for the Auditor. Was unwired —
        // verifyProofOfFunction had zero production callers, so the Tier-1 gate never fired.
        if (evaluation === TaskEvaluation.DONE) {
          try {
            const proofGate = await verifyProofOfFunction(task, projectRoot, result, rubricResult);
            if (proofGate.status === 'failed') {
              evaluation = TaskEvaluation.GO_WITH_TECH_DEBT;
              try {
                const sidForPoF = getCurrentSprintId(projectRoot) ?? sprint.id;
                writeEvent(
                  projectRoot, sidForPoF, 'brain', 'auditor',
                  'BRAIN→AUDITOR:PROOF_OF_FUNCTION_MISMATCH',
                  {
                    taskId: task.id,
                    command: proofGate.command,
                    evidence: proofGate.evidence,
                    reason: proofGate.reason ?? proofGate.evidence,
                    originalVerdict: 'DONE',
                    upgradedVerdict: 'GO_WITH_TECH_DEBT',
                    timestamp: new Date().toISOString(),
                  },
                );
              } catch (e) { debugLog('runEvaluatePhase:proofOfFunction:event', e); }
            }
          } catch (e) { debugLog('runEvaluatePhase:proofOfFunction', e); }
        }

        // SCOPE-W1b: brain-side SCOPE_INSUFFICIENT consumer + scope-expand (flag-gated default-off).
        // Reads WORKER→BRAIN:SCOPE_INSUFFICIENT events for the current sprint, finds events
        // matching this task, and when the flag is on: expands task.scope.filesWrite so the
        // FIX task inherits the larger scope. diff-salvage: annotates result.notes with the
        // previous run's filesChanged so the FIX prompt carries context.
        {
          type ConfigWithSAE = ResolvedConfig & { scope_auto_expand_enabled?: boolean };
          const saeEnabled = (config as ConfigWithSAE | undefined)?.scope_auto_expand_enabled === true;
          if (saeEnabled) {
            try {
              const sidForSAE = getCurrentSprintId(projectRoot) ?? sprint.id;
              const scopeInsEvents = readEvents(projectRoot, sidForSAE, { channel: SCOPE_INSUFFICIENT_CHANNEL });
              const taskScopeEvents = scopeInsEvents.filter(e => {
                const p = e.payload as { taskId?: string } | undefined;
                return p?.taskId === task.id;
              });
              if (taskScopeEvents.length > 0) {
                const addedPaths: string[] = [];
                for (const ev of taskScopeEvents) {
                  const p = ev.payload as { attemptedPath?: string } | undefined;
                  if (p?.attemptedPath && !task.scope.filesWrite.includes(p.attemptedPath)) {
                    task.scope.filesWrite.push(p.attemptedPath);
                    addedPaths.push(p.attemptedPath);
                  }
                }
                if (addedPaths.length > 0) {
                  // Persist expanded scope to disk so the FIX task inherits it.
                  try {
                    const taskPath = join(projectRoot, TASKS_DIR, `task-${task.id}.json`);
                    if (existsSync(taskPath)) {
                      const taskJson = readJsonSafe<Task>(taskPath);
                      if (taskJson) {
                        taskJson.scope.filesWrite = task.scope.filesWrite;
                        writeFileSync(taskPath, JSON.stringify(taskJson, null, 2) + '\n', 'utf-8');
                      }
                    }
                  } catch (e) { debugLog('runEvaluatePhase:scopeAutoExpand:persist', e); }
                  // diff-salvage: annotate result.notes so the FIX prompt carries prev-changed context.
                  if (result.filesChanged?.length) {
                    const salvage = `[scope-expand] prev-changed: ${result.filesChanged.join(', ')}`;
                    result.notes = result.notes ? `${result.notes}\n${salvage}` : salvage;
                  }
                  // Emit BRAIN→AUDITOR:SCOPE_AUTO_EXPANDED event.
                  try {
                    writeEvent(
                      projectRoot, sidForSAE, 'brain', 'auditor',
                      'BRAIN→AUDITOR:SCOPE_AUTO_EXPANDED',
                      {
                        taskId: task.id,
                        addedPaths,
                        prevFilesChanged: result.filesChanged ?? [],
                        timestamp: new Date().toISOString(),
                      },
                    );
                  } catch (e) { debugLog('runEvaluatePhase:scopeAutoExpand:event', e); }
                  debugLog('runEvaluatePhase:scopeAutoExpand', `task=${task.id} addedPaths=${addedPaths.join(',')}`);
                }
              }
            } catch (e) {
              debugLog('runEvaluatePhase:scopeAutoExpand', e);
            }
          }
        }

        // ─── Cross-Verify — typed host adjudication + fail-closed enforcement ──
        // Runs BEFORE the evaluation is committed (handleEvaluation / evaluations.set)
        // so flag-gated enforcement can downgrade a REFUTED DONE/GO_WITH_TECH_DEBT to
        // NO_GO and let the STANDARD NO_GO path (debt + FIX routing + notify) act on
        // it — instead of trying to reverse a committed DONE after the fact. A
        // high-stakes pass is re-verified by a DIFFERENT provider. Provider output
        // is evidence only; the runner returns the host-owned disposition. When
        // mandatory enforcement is enabled, REFUTED, UNCLEAR, unavailable,
        // ceiling exhaustion and runtime faults all fail closed into the standard
        // NO_GO/FIX path. Legacy advisory mode remains isolated behind the flag.
        const mandatoryCrossVerify =
          resolvedConfig?.cross_verify?.enforce_refuted === true;
        const verificationCeilingReached = maxVerificationsPerSprint !== undefined
          && verificationsDispatched >= maxVerificationsPerSprint;
        if (
          resolvedConfig?.cross_verify?.enabled === true &&
          (evaluation === TaskEvaluation.DONE || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT)
        ) {
          if (verificationCeilingReached) {
            // Honest, visible stop — never a silent truncation of coverage.
            debugLog(
              'runEvaluatePhase:crossVerify-ceiling',
              `task=${task.id} skipped: sprint verification ceiling ${maxVerificationsPerSprint} reached`,
            );
            if (mandatoryCrossVerify) {
              evaluation = TaskEvaluation.NO_GO;
              const ceilingNote = [
                '[cross-verify:mandatory-hold]',
                'outcome=unavailable',
                'reason=xverify_mandatory_sprint_ceiling_reached',
              ].join(' ');
              result.notes = result.notes
                ? `${result.notes}\n${ceilingNote}`
                : ceilingNote;
            }
          } else {
          verificationsDispatched += 1;
          try {
            const xvResult = await runCrossVerify(
              projectRoot,
              task,
              result,
              evaluation,
              resolvedConfig,
              {
                ...(ownerVerifierSelection && ownerVerifierSelection.length > 0
                  ? { availableProviders: ownerVerifierSelection }
                  : {}),
                ...(options?.crossVerifyInvocationFactory
                  ? { mandatoryInvocationFactory: options.crossVerifyInvocationFactory }
                  : {}),
              },
            );
            if (xvResult.validatedAdjudicationReceipt) {
              try {
                const { OutcomeTracker } = await import('./outcome-tracker.js');
                new OutcomeTracker(projectRoot).recordValidatedCrossVerifyVerdict(
                  result.agentId ?? task.assignedAgent ?? null,
                  result.skillIds ?? task.assignedSkills ?? [],
                  xvResult.validatedAdjudicationReceipt,
                );
              } catch (e) {
                // Learning must never invent a signal. A rejected learning receipt
                // does not replace the already-authoritative evaluation disposition.
                debugLog('runEvaluatePhase:crossVerify-learning-receipt', e);
              }
            }
            if (xvResult.outcome === 'unavailable') {
              try {
                const sidXv = getCurrentSprintId(projectRoot) ?? sprint.id;
                writeEvent(
                  projectRoot, sidXv, 'brain', 'auditor',
                  'BRAIN→AUDITOR:CROSS_VERIFY_UNAVAILABLE',
                  {
                    taskId: task.id,
                    reason: xvResult.skippedReason,
                    evidencePersisted: xvResult.evidencePersisted ?? false,
                    evaluation: toAuditDecision(evaluation),
                    timestamp: new Date().toISOString(),
                  },
                );
              } catch (e) { debugLog('runEvaluatePhase:crossVerify-unavailable-event', e); }
            }
            if (xvResult.ran && xvResult.refuted) {
              try {
                const sidXv = getCurrentSprintId(projectRoot) ?? sprint.id;
                writeEvent(
                  projectRoot, sidXv, 'brain', 'auditor',
                  xvResult.blocked
                    ? 'BRAIN→AUDITOR:CROSS_VERIFY_ENFORCED_NO_GO'
                    : 'BRAIN→AUDITOR:CROSS_VERIFY_REFUTED',
                  {
                    taskId: task.id,
                    verifier: xvResult.advisory?.verifier,
                    verifierModel: xvResult.advisory?.verifierModel,
                    evidencePersisted: xvResult.evidencePersisted ?? false,
                    reason: xvResult.advisory?.reason,
                    evaluation: toAuditDecision(evaluation),
                    enforced: xvResult.blocked,
                    timestamp: new Date().toISOString(),
                  },
                );
              } catch (e) { debugLog('runEvaluatePhase:crossVerify-event', e); }
            }
            // Host disposition owns the mandatory decision; the boolean remains
            // only a compatibility projection for existing evaluation plumbing.
            if (xvResult.blocked) {
              debugLog(
                'runEvaluatePhase:crossVerify-enforce',
                `task=${task.id} outcome=${xvResult.outcome} → NO_GO (enforce_refuted)`,
              );
              evaluation = TaskEvaluation.NO_GO;
              const enfNote = [
                '[cross-verify:enforced-no-go]',
                `outcome=${xvResult.outcome}`,
                `verifier=${xvResult.advisory?.verifier ?? 'none'}`,
                `reason=${xvResult.advisory?.reason ?? xvResult.skippedReason ?? 'unknown'}`,
              ].join(' ');
              result.notes = result.notes ? `${result.notes}\n${enfNote}` : enfNote;
            }
          } catch (e) {
            debugLog('runEvaluatePhase:crossVerify', e);
            if (mandatoryCrossVerify) {
              evaluation = TaskEvaluation.NO_GO;
              const detail = e instanceof Error ? e.message : String(e);
              const failureNote = [
                '[cross-verify:mandatory-hold]',
                'outcome=unavailable',
                `reason=xverify_runtime_fault:${detail}`,
              ].join(' ');
              result.notes = result.notes
                ? `${result.notes}\n${failureNote}`
                : failureNote;
            }
          }
          }
        }

        // ─── EVALUATE-phase enforcement gates (DECKENT-TRIAGE A14 + A9) ─────────
        // Two flag-gated, default-off gates wiring existing-but-unconsumed
        // enforcement primitives into this per-task loop. Both are byte-for-byte
        // no-ops when their flag is unset/absent. Each is wrapped in try/catch so
        // a gate fault logs + falls through (never drops the EVALUATE loop),
        // mirroring the gates above.

        // (A14) verify-delta downgrade — a DONE that survived rubric scoring is
        // re-checked against the worker's task-start verify-delta baseline. When
        // the delivered files-changed delta fell short, applyTechDebtDowngrade
        // downgrades DONE → GO_WITH_TECH_DEBT (or severe < 0.5 → NO_GO). No
        // baseline on disk → computeVerifyDelta returns null → unchanged.
        if (
          resolvedConfig?.gate?.verify_delta_downgrade === true &&
          evaluation === TaskEvaluation.DONE
        ) {
          try {
            const filesChangedActual = result.filesChanged?.length ?? 0;
            const testFailActual = result.testsPassed === false ? 1 : 0;
            const expectedFilesChangedCount = task.scope?.filesWrite?.length;
            const vd = computeVerifyDelta(
              projectRoot, task.id, filesChangedActual, testFailActual, expectedFilesChangedCount,
            );
            if (vd) {
              const downgrade = applyTechDebtDowngrade('DONE', result, vd.completionRatio);
              if (downgrade.downgraded) {
                evaluation = downgrade.decision === 'NO_GO'
                  ? TaskEvaluation.NO_GO
                  : TaskEvaluation.GO_WITH_TECH_DEBT;
                try {
                  const sidVd = getCurrentSprintId(projectRoot) ?? sprint.id;
                  writeEvent(
                    projectRoot, sidVd, 'brain', 'auditor',
                    'BRAIN→AUDITOR:TECH_DEBT_DOWNGRADE',
                    {
                      taskId: task.id,
                      completionRatio: downgrade.completionRatio,
                      reason: downgrade.reason,
                      originalVerdict: 'DONE',
                      upgradedVerdict: downgrade.decision,
                      timestamp: new Date().toISOString(),
                    },
                  );
                } catch (e) { debugLog('runEvaluatePhase:verifyDeltaDowngrade:event', e); }
                const vdNote = `[verify-delta downgrade] ${downgrade.reason ?? ''}`.trim();
                result.notes = result.notes ? `${result.notes}\n${vdNote}` : vdNote;
                debugLog('runEvaluatePhase:verifyDeltaDowngrade',
                  `task=${task.id} DONE→${evaluation} (${downgrade.reason ?? ''})`);
              }
            }
          } catch (e) { debugLog('runEvaluatePhase:verifyDeltaDowngrade', e); }
        }

        // (A9) ADR-compliance — scan the worker's changed files for ADR-006/008/010
        // violations. A failing verdict downgrades the task to NO_GO with the
        // violation reason so the standard FIX path triggers. enforceAdrCompliance
        // fails OPEN internally (returns pass:true on any enforcer error); the
        // outer try/catch preserves that fail-open even if the call itself throws,
        // so an enforcer bug can never block all tasks.
        if (resolvedConfig?.gate?.enforce_adr_compliance === true) {
          try {
            const sidAdr = getCurrentSprintId(projectRoot) ?? sprint.id;
            const adrVerdict = enforceAdrCompliance(
              projectRoot, sidAdr, task.id, result.filesChanged ?? [],
            );
            if (adrVerdict.pass === false) {
              evaluation = TaskEvaluation.NO_GO;
              const reason = adrVerdict.violations
                .map(v => `${v.adrId}: ${v.description}`)
                .join('; ');
              const adrNote = `[ADR-compliance ENFORCED NO_GO] ${reason}`.trim();
              result.notes = result.notes ? `${result.notes}\n${adrNote}` : adrNote;
              debugLog('runEvaluatePhase:adrCompliance',
                `task=${task.id} → NO_GO (${adrVerdict.violations.length} violation(s))`);
            }
          } catch (e) { debugLog('runEvaluatePhase:adrCompliance', e); }
        }

        // M4-044: final terminal lock immediately before persistence. Every
        // intermediate policy above is downgrade-only today, but this guard
        // keeps future promotion gates from silently outranking immutable host
        // settlement + exact-attempt runtime-budget evidence.
        if (runtimeBudgetAuthority) {
          evaluation = TaskEvaluation.NO_GO;
        }
        const runtimeBudgetAuthorityReason = runtimeBudgetAuthority
          ? `host_runtime_budget_exhausted:${runtimeBudgetAuthority.settlementRef.attemptId}`
          : undefined;

        debugLog('runEvaluatePhase:task', `task=${task.id} selfAssessment=${result.selfAssessment} evaluation=${evaluation} testsPassed=${result.testsPassed}`);
        handleEvaluation(projectRoot, task, evaluation, result, initialFixPolicy);
        evaluations.set(task.id, evaluation);

        // Sprint 207 P1-2 (forensic Sprint 206): persist Brain's verdict back to the
        // .result file so a .result shows WHY a FIX was spawned, not just the worker's
        // self-claim. Shared with the FIX phase via persistBrainVerdict (MF-5,
        // Sprint 331) so both phases write the identical brainEvaluation block.
        persistBrainVerdict(
          projectRoot,
          task.id,
          evaluation,
          rubricResult.totalScore,
          gated,
          result,
          runtimeBudgetAuthorityReason,
        );

        // Sprint 161 Task 2 (T-003): per-task forensic audit record.
        // Joins the rubric outcome with the task's rubric definition
        // (for threshold + weight) and writes a JSON file under
        // .deckent/runtime/evaluations/<sprintId>/<taskId>-attempt-1.json.
        // 352-003: shared writer — see writeTaskEvaluationAudit doc comment
        // for why this can no longer be an inline block local to this branch.
        writeTaskEvaluationAudit(
          projectRoot,
          sprint.id,
          task,
          evaluation,
          rubricResult,
          runtimeBudgetAuthorityReason,
        );

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
            // 365-001: resolve the WHOLE fix lineage, not just the immediate parent.
            // A fix-of-a-fix completing via EVALUATE (not FIX) previously resolved only
            // `debt-<fixForTaskId>`, leaving the origin/ancestor debts `active` to
            // re-inject every sprint — the same bug the FIX phase already fixed
            // (runFixPhase). Both phases now share resolveDebtChain (single source of
            // truth; idempotent + cycle-guarded) so they can never drift again.
            resolveDebtChain(projectRoot, task.id, task.fixForTaskId, sprint.id);
          }
          resolveDebt(projectRoot, `debt-${task.id}`, sprint.id);
        }
      } else {
        // A dependency descendant parked by EXECUTE is intentionally
        // result-less until its failed lineage has exhausted FIX/XFIX.
        // Treating it as a worker failure here would create a phantom fix,
        // double-count the logical task, and poison routing statistics.
        if (task.status === TaskStatus.PAUSED) {
          evaluations.set(task.id, TaskEvaluation.DEFERRED);
          debugLog(
            'runEvaluatePhase:dependency-repair-deferred',
            `task=${task.id} parked behind repairable dependency — deferred to FIX unblock`,
          );
          try {
            const sidDeferred = getCurrentSprintId(projectRoot) ?? sprint.id;
            writeEvent(
              projectRoot,
              sidDeferred,
              'brain',
              'worker',
              'BRAIN→WORKER:DEPENDENCY_REPAIR_DEFERRED',
              { taskId: task.id, dependencies: task.dependencies ?? [] },
            );
          } catch (e) { debugLog('runEvaluatePhase:dependencyDeferredEvent', e); }
          continue;
        }

        // ─── Explicit DEFERRED skip (Sprint 192 — Task 192-009 — W-INTEGRITY I-3) ──
        // Caller has signalled this task was never dispatched and should
        // not be force-NO_GO'd here — let retro (192-010 enum surface)
        // report it. No synthetic result, no evaluation entry (contract
        // covered by evaluate-trigger-gate.test.ts, out of this task's
        // write scope — left byte-for-byte unchanged; Sprint 351 351-008's
        // NOT_DISPATCHED classification is wired at the liveness-check and
        // retro pre-finalize sites below/downstream instead, which cover
        // the same "dispatch never happened" scenario this task targets).
        if (deferredTaskIds?.has(task.id)) {
          debugLog(
            'runEvaluatePhase:deferred-skip',
            `task=${task.id} explicitly deferred — bypassing synthetic NO_GO`,
          );
          continue;
        }

        // ─── Runtime Extension Attempt (Sprint 191 — Task 191-002) ──
        // Before declaring a synthetic NO_GO for a missing .result,
        // consult the heartbeat-aware extension policy. When granted,
        // poll for the .result for up to `extensionMs` so a still-
        // progressing worker can complete. Falls through to NO_GO when
        // the extension is denied or the poll budget expires.
        const extDecision = evaluateRuntimeExtension(
          projectRoot, sprint.id, task.id, resolvedConfig, extState,
        );
        if (extDecision.granted) {
          debugLog(
            'runEvaluatePhase:extension',
            `task=${task.id} grant=#${extDecision.extensionCount}/${RUNTIME_EXTENSION_MAX} budget=${extDecision.extensionMs}ms`,
          );
          try {
            const sidForExt = getCurrentSprintId(projectRoot) ?? sprint.id;
            writeEvent(
              projectRoot, sidForExt, 'brain', 'worker',
              'BRAIN→WORKER:TIMEOUT_EXTEND',
              {
                taskId: task.id,
                extensionCount: extDecision.extensionCount,
                extensionMs: extDecision.extensionMs,
                reason: extDecision.reason,
              },
            );
          } catch (e) { debugLog('runEvaluatePhase:ext-event', e); }

          const lateResult = await pollForResultFile(
            projectRoot, task.id, extDecision.extensionMs,
          );
          if (lateResult) {
            // Late .result landed — push it into the collected pool so the
            // normal evaluate path runs for this task. Mutate the local
            // `results` array and resultsMap so downstream phases see it.
            results.push(lateResult);
            resultsMap.set(task.id, lateResult);
            collectedIds.add(task.id);
            debugLog(
              'runEvaluatePhase:extension-hit',
              `task=${task.id} produced .result during extension window`,
            );
            const rubricResult = await safeRubricReconcile(projectRoot, sprint.id, task, lateResult);
            const evaluation = toTaskEvaluation(rubricResult);
            handleEvaluation(projectRoot, task, evaluation, lateResult, initialFixPolicy);
            evaluations.set(task.id, evaluation);
            writeTaskEvaluationAudit(projectRoot, sprint.id, task, evaluation, rubricResult);
            continue;
          }
          debugLog(
            'runEvaluatePhase:extension-miss',
            `task=${task.id} no .result after ${extDecision.extensionMs}ms — declaring NO_GO`,
          );
        } else {
          debugLog(
            'runEvaluatePhase:extension-denied',
            `task=${task.id} reason=${extDecision.reason} used=${extDecision.extensionCount}`,
          );
        }

        // ─── Sprint 191 hotfix — pre-Sprint 192 W-INTEGRITY ─────────────
        // Memory: [[feedback_no_synthetic_results]] — sentetik veri ile NO_GO yasak.
        // Consult 5-layer worker liveness BEFORE writing synthetic NO_GO:
        //   - never-spawned (max_workers saturation / wave-barrier hold)
        //       → NOT_DISPATCHED (Sprint 351 351-008 — MOAT-3). No fix-task
        //         generated; re-dispatch candidate, not a worker failure.
        //   - alive (docker/hb/log fresh) → 60s grace poll; if result lands
        //         evaluate normally, else fall through with honest label.
        //   - dead (no signal) → disk-evidence check (351-008): if NEITHER
        //         .hb NOR .log ever touched disk, this is also a dispatch
        //         gap (e.g. assignedWorker was stamped at plan time but the
        //         container spawn itself failed) → NOT_DISPATCHED. Any
        //         trace of a started worker → genuine synthetic NO_GO with
        //         liveness tag (unchanged existing behavior).
        const liveness = checkWorkerLiveness(task, projectRoot);
        if (liveness.status === 'never-spawned') {
          debugLog(
            'runEvaluatePhase:never-dispatched',
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
              },
            );
          } catch (e) { debugLog('runEvaluatePhase:nd-event', e); }
          evaluations.set(task.id, TaskEvaluation.NOT_DISPATCHED);
          continue;
        }
        if (liveness.status === 'dead') {
          const dispatchEvidence = gatherDispatchTraceEvidence(projectRoot, task.id);
          if (classifyMissingResultDispatch(dispatchEvidence) === 'NOT_DISPATCHED') {
            debugLog(
              'runEvaluatePhase:not-dispatched-disk-evidence',
              `task=${task.id} liveness=dead but no .hb/.log trace on disk — classifying NOT_DISPATCHED`,
            );
            try {
              const sidNd2 = getCurrentSprintId(projectRoot) ?? sprint.id;
              writeEvent(
                projectRoot, sidNd2, 'brain', 'worker',
                'BRAIN→WORKER:NEVER_DISPATCHED',
                {
                  taskId: task.id,
                  reason: 'no .result/.hb/.log trace on disk despite assignedWorker set — spawn-fail',
                  signals: liveness.signals,
                  source: 'disk-evidence',
                },
              );
            } catch (e) { debugLog('runEvaluatePhase:nd2-event', e); }
            evaluations.set(task.id, TaskEvaluation.NOT_DISPATCHED);
            continue;
          }
        }
        if (liveness.status === 'alive') {
          debugLog(
            'runEvaluatePhase:alive-grace',
            `task=${task.id} ${liveness.reason} — granting 60s grace poll`,
          );
          const graceResult = await pollForResultFile(projectRoot, task.id, 60_000);
          if (graceResult) {
            results.push(graceResult);
            resultsMap.set(task.id, graceResult);
            collectedIds.add(task.id);
            debugLog(
              'runEvaluatePhase:alive-grace-hit',
              `task=${task.id} produced .result during grace window`,
            );
            const graceRubric = await safeRubricReconcile(projectRoot, sprint.id, task, graceResult);
            const graceEval = toTaskEvaluation(graceRubric);
            handleEvaluation(projectRoot, task, graceEval, graceResult, initialFixPolicy);
            evaluations.set(task.id, graceEval);
            writeTaskEvaluationAudit(projectRoot, sprint.id, task, graceEval, graceRubric);
            continue;
          }
          debugLog(
            'runEvaluatePhase:alive-grace-miss',
            `task=${task.id} no .result after grace 60s — falling through to NO_GO with honest label`,
          );
        }

        const baseSynthetic: TaskResult = {
          taskId: task.id,
          workerId: task.assignedWorker ?? 'unknown',
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'NO_GO',
          notes: extDecision.granted
            ? `Timeout - no result received (extension #${extDecision.extensionCount} expired after ${extDecision.extensionMs}ms); liveness=${liveness.status}`
            : `Timeout - no result received (extension denied: ${extDecision.reason}); liveness=${liveness.status}`,
        };

        // Sprint 199 199-001 — Synthetic NO_GO Kaynak 6 gate.
        // Verify disk before writing synthetic NO_GO. If worker produced
        // code, reclassify as MANUAL_REVIEW_REQUIRED so an operator can
        // triage on-disk work instead of losing it to a false NO_GO.
        const gated = gateSyntheticTimeoutResult(
          projectRoot, task, baseSynthetic, 'evaluate-no-result',
        );
        const syntheticResult = gated.result;
        debugLog('runEvaluatePhase:timeout', `task=${task.id} — no result collected, marking NO_GO (timeout/missing) liveness=${liveness.status} reclassified=${gated.reclassified}`);
        handleEvaluation(
          projectRoot,
          task,
          TaskEvaluation.NO_GO,
          syntheticResult,
          initialFixPolicy,
        );
        evaluations.set(task.id, TaskEvaluation.NO_GO);
        // 352-003 (EVAL-AUDIT-REVIVE): no .result was ever collected, so no
        // rubric ever ran — the "rubric'siz" path. writeTaskEvaluationAudit
        // still writes a decision + rationale record (no rubricResult arg),
        // so the forensic ledger has no silent gap for timeout NO_GOs.
        writeTaskEvaluationAudit(
          projectRoot, sprint.id, task, TaskEvaluation.NO_GO, undefined,
          `${syntheticResult.notes ?? 'no result collected'}${gated.reclassified ? ' (reclassified=MANUAL_REVIEW_REQUIRED)' : ''}`,
        );
        if (gated.reclassified) {
          task.status = TaskStatus.MANUAL_REVIEW_REQUIRED;
          try {
            const sidGate = getCurrentSprintId(projectRoot) ?? sprint.id;
            writeEvent(
              projectRoot, sidGate, 'brain', 'auditor',
              DISK_VS_CLAIM_MISMATCH_CHANNEL,
              {
                taskId: task.id,
                linesAdded: gated.diskVerify.linesAdded,
                untrackedFiles: gated.diskVerify.untrackedFiles,
                cause: 'evaluate-no-result',
                emittedAt: new Date().toISOString(),
              },
            );
          } catch (e) { debugLog('runEvaluatePhase:diskGateEmit', e); }
        }
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

    // ─── born-614 SPRINT-TRACE-WIRE (TRN-P0 sprint-yarısı) ─────────────
    // Record each evaluated task's worker transcript + FINAL Brain verdict to
    // `.deckent/traces/sprint-worker.jsonl` (SP-2 fine-tune pipeline format).
    // Runs AFTER every verdict settles (post-loop): the label must be Brain's
    // evaluation, never the worker's self-claim (result-evaluator: "Brain makes
    // the final call"). Default-OFF (`training_trace.enabled`), fail-soft —
    // a trace fault never drops EVALUATE (ADR-G-009). Tasks without a collected
    // result (NOT_DISPATCHED / timeout-synthetic) have no transcript to record.
    try {
      if (config?.training_trace?.enabled === true) {
        const traceCollector = createOutputCollector(projectRoot);
        for (const [traceTaskId, verdict] of evaluations) {
          const traceResult = resultsMap.get(traceTaskId);
          if (!traceResult) continue;
          const traceTask = sprint.tasks.find(t => t.id === traceTaskId);
          recordSprintWorkerTrace({
            enabled: true,
            projectRoot,
            collector: traceCollector,
            meta: {
              taskId: traceTaskId,
              sprintId: sprint.id,
              agent: traceTask?.assignedAgent ?? 'generic',
              model: traceTask?.model ?? 'unknown',
              selfAssessment: verdict,
              workerSelfAssessment: traceResult.selfAssessment,
              ts: new Date().toISOString(),
              // TT552 (TRACE-V2): emit the schema-v2 projection, injecting the
              // worker's REAL prompt from the .tasks archive (original attempt →
              // non-`-fix` prompt file). Missing prompt → v2 'no-prompt' quarantine.
              traceV2: true,
              ...loadWorkerPromptMeta(join(projectRoot, TASKS_DIR), traceTaskId, { preferFix: false }),
            },
          });
        }
      }
    } catch (e) { debugLog('runEvaluatePhase:sprintTrace', e); }

    // ─── Post-Execution Overlap Check (Sprint 324 — Task 324-004) ──────
    // After all workers complete: detect files actually changed by >1 worker.
    // Different from pre-spawn detectScopeCollisions — this checks real-overlap
    // from .result filesChanged data. Best-effort: fault never drops EVALUATE.
    try {
      const overlapInput = results
        .filter(r => r.filesChanged && r.filesChanged.length > 0)
        .map(r => ({ taskId: r.taskId, filesChanged: r.filesChanged }));
      if (overlapInput.length >= 2) {
        const overlaps = new ResultMerger().detectOverlaps(overlapInput);
        if (overlaps.length > 0) {
          const sidForOverlap = getCurrentSprintId(projectRoot) ?? sprint.id;
          writeEvent(
            projectRoot, sidForOverlap, 'brain', 'auditor',
            'BRAIN→AUDITOR:WORKER_OVERLAP',
            {
              sprintId: sprint.id,
              overlaps,
              totalOverlappingFiles: overlaps.length,
              timestamp: new Date().toISOString(),
            },
          );
        }
      }
    } catch (e) { debugLog('runEvaluatePhase:workerOverlapCheck', e); }

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
    if (err instanceof DeckentError && err.code === 'DECKENT_E077') throw err;
    // EVALUATE-ERROR-SURFACE (born-484, sprints 365/366 live case — sibling of
    // the born-453 EXECUTE surface in sprint-controller): this catch used to
    // swallow a mid-EVALUATE throw into a dashboard line only. The sprint then
    // closed with a TRUNCATED evaluations map ("0/0" while all workers had
    // delivered) and nothing told the operator. Keep the fail-soft (do not
    // crash the sprint), but SURFACE: stderr + notify + event + debugLog, and
    // record the abort on the sprint object so downstream phases/summary can
    // qualify their counts.
    const msg = err instanceof Error ? err.message : String(err);
    debugLog('runEvaluatePhase:aborted', `${msg}${err instanceof Error && err.stack ? `\n${err.stack}` : ''}`);
    process.stderr.write(`[evaluate] runEvaluatePhase threw — EVALUATE aborted early with ${evaluations.size}/${sprint.tasks.length} evaluations: ${msg}\n`);
    try {
      void notify('progress', sprint.id, 'EVALUATE aborted early', `${msg} (${evaluations.size}/${sprint.tasks.length} evaluated)`);
    } catch { /* fail-safe */ }
    try {
      const sidAbort = getCurrentSprintId(projectRoot) ?? sprint.id;
      writeEvent(
        projectRoot, sidAbort, 'brain', 'auditor',
        'BRAIN→AUDITOR:EVALUATE_ABORTED',
        {
          sprintId: sprint.id,
          error: msg,
          evaluated: evaluations.size,
          totalTasks: sprint.tasks.length,
          timestamp: new Date().toISOString(),
        },
      );
    } catch (e) { debugLog('runEvaluatePhase:aborted-event', e); }
    (sprint as Sprint & { evaluateAborted?: string }).evaluateAborted = msg;
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${msg}`);
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
  lineage?: {
    rootTaskId: string;
    logicalAttempt: number;
  },
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
    if (originalReconciled && (lineage?.rootTaskId ?? fixTask.fixForTaskId)) {
      writeEvaluationAudit(
        projectRoot,
        sprintId,
        lineage?.rootTaskId ?? fixTask.fixForTaskId!,
        lineage?.logicalAttempt ?? 2,
        payload,
      );
    }
  } catch (e) { debugLog('recordFixEvaluationAudit', e); }
}

/**
 * Sprint 272 T-004: enrich fix-task prompts with verify-and-complete guidance.
 *
 * For each fix task whose original task left a Task-272-003
 * `EXIT_WITHOUT_RESULT` marker with work on disk (`workPresent:true`), append
 * the audit-and-finish guidance to `fixTask.description` so the fix worker
 * verifies-and-completes the partial work rather than restarting from scratch
 * (ADR-073). Idempotent — a description already carrying the guidance is left
 * untouched. workPresent:false / ordinary NO_GO originals get no enrichment, so
 * today's crashed-NO_GO behavior is preserved.
 *
 * Pure mutation (no I/O) so it is unit-testable; `runFixPhase` persists the
 * enriched task JSONs separately.
 *
 * @returns the ids of the fix tasks whose description was enriched.
 */
export function applyVerifyAndCompleteEnrichment(
  fixTasks: Task[],
  results: TaskResult[],
): string[] {
  const enriched: string[] = [];
  const resultsMap = buildResultsMap(results);
  for (const fixTask of fixTasks) {
    if (!fixTask.fixForTaskId) continue;
    const originalResult = resultsMap.get(fixTask.fixForTaskId);
    if (!originalResult) continue;
    const guidance = buildVerifyAndCompleteGuidance(classifyExitWithoutResult(originalResult));
    if (guidance.length === 0) continue;
    const current = fixTask.description ?? '';
    if (current.includes('VERIFY_AND_COMPLETE')) continue; // already enriched — idempotent
    fixTask.description = current.length > 0 ? `${current}\n\n${guidance}` : guidance;
    enriched.push(fixTask.id);
  }
  return enriched;
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
): Promise<FixPhaseFailureOutcome | undefined> {
  try {
    // Sprint 161 Task 2 (T-003): FIX entry — phase reaches disk so
    // observers see the EVALUATE→FIX transition.
    persistPhaseTransition(projectRoot, sprint, SprintPhase.FIX, SprintStatus.FIXING);
    const maxFixRetries =
      config.fix_phase_enabled === false
        ? 0
        : Math.max(0, Math.floor(config.max_fix_retries ?? 2));

    // ─── FIX-PHASE TRACE-WIRE (TT551 / 416-003) ──────────────────────────
    // runEvaluatePhase records only the attempt-1 verdict (this file, ~L2106).
    // The FIX phase — where the highest-value SFT signal lives (the NO_GO→FIX
    // error/fix PAIR, plus every INTERMEDIATE NO_GO fix-verdict) — recorded
    // NOTHING, so the sprint-worker corpus was success-biased (0 NO_GO labels).
    // Mirror the EVALUATE post-verdict wire: each fix-worker result is recorded
    // as its OWN entry, labeled APART from the original attempt via additive
    // meta (purpose/attempt/retryOf/verdict). Single recorder API
    // (recordSprintWorkerTrace); this closure only DRY-shares the three FIX
    // call-sites (main wave / re-dispatch / post-fix scan) — it is NOT a second
    // recorder. Default-OFF (`training_trace.enabled`), fail-soft (ADR-G-009):
    // a trace fault never drops FIX.
    const fixTraceEnabled = config?.training_trace?.enabled === true;
    const fixTraceCollector = fixTraceEnabled ? createOutputCollector(projectRoot) : undefined;
    const recordFixWorkerTrace = (
      traceTask: Task,
      traceResult: TaskResult,
      verdict: TaskEvaluation,
      purpose: 'original' | 'fix' | 'xfix',
      attempt: number,
      retryOf: string | undefined,
    ): void => {
      if (!fixTraceEnabled || !fixTraceCollector) return;
      try {
        recordSprintWorkerTrace({
          enabled: true,
          projectRoot,
          collector: fixTraceCollector,
          meta: {
            taskId: traceTask.id,
            sprintId: sprint.id,
            agent: traceTask.assignedAgent ?? 'generic',
            model: traceTask.model ?? 'unknown',
            selfAssessment: verdict,                    // Brain verdict = outcome label (mirror EVALUATE)
            workerSelfAssessment: traceResult.selfAssessment,
            verdict,                                    // explicit FIX-phase verdict (NO_GO included)
            purpose,
            attempt,
            ...(retryOf !== undefined ? { retryOf } : {}),
            ts: new Date().toISOString(),
            // TT552 (TRACE-V2): v2 projection with the fix-worker's REAL prompt
            // (a fix/xfix attempt → prefer the `-fix` prompt file, not the
            // original, to avoid injecting the wrong prompt onto a retry trace).
            traceV2: true,
            ...loadWorkerPromptMeta(join(projectRoot, TASKS_DIR), traceTask.id, { preferFix: purpose !== 'original' }),
          },
        });
      } catch (e) { debugLog('runFixPhase:sprintTrace', e); }
    };

    // ─── Provider-Limit FIX Guard (Sprint 272 — Task 006, F1-LIM faz-2b) ──
    // 269 live lesson: when the provider usage-limit was exhausted EVERY
    // worker exited-without-result, and the FIX wave re-ran into the SAME
    // dead limit, burning a whole retry wave of tokens for nothing. Before
    // spawning any fix worker, classify the NO_GO failures; if ≥50% look
    // like a provider usage-limit, SKIP the FIX wave and emit an honest
    // i18n notice (defer until the limit resets). A single/sparse limit
    // stays below threshold → existing FIX behavior is preserved. Whole
    // guard is fail-safe: any error falls through to the normal FIX path.
    try {
      const guardResultsMap = buildResultsMap(results);
      const noGoInputs: ProviderFailureInput[] = [];
      for (const [taskId, ev] of evaluations) {
        if (ev !== TaskEvaluation.NO_GO) continue;
        const r = guardResultsMap.get(taskId);
        // producedWork: a worker that changed files / added lines clearly RAN on the
        // provider, so it cannot be a provider usage-limit (sprint-324: a KES task whose
        // notes named the "rate-limiter" module it deleted was mis-flagged as a provider
        // rate-limit, skipping the whole FIX wave). Without this signal the classifier
        // pattern-matches the worker's task-SUBJECT text and parks legitimate FIX work.
        const producedWork = (r?.filesChanged?.length ?? 0) > 0 || (r?.linesAdded ?? 0) > 0;
        noGoInputs.push({ resultNotes: r?.notes, producedWork });
      }
      // summarizeProviderFailures runs classifyProviderFailure() over each
      // NO_GO input and aggregates the usage-limit ratio + skip verdict.
      const failureSummary = summarizeProviderFailures(noGoInputs);
      if (failureSummary.skipFix) {
        debugLog(
          'runFixPhase:provider-limit-skip',
          `usageLimit=${failureSummary.usageLimit}/${failureSummary.total} ` +
          `ratio=${failureSummary.usageLimitRatio.toFixed(2)} → FIX skipped`,
        );
        const lang = config.language ?? 'en';
        const msg = providerLimitFixSkipMessage(lang);
        try {
          const sidForGuard = getCurrentSprintId(projectRoot) ?? sprint.id;
          writeEvent(
            projectRoot, sidForGuard, 'brain', 'user',
            'BRAIN→USER:FIX_SKIPPED_PROVIDER_LIMIT',
            {
              usageLimit: failureSummary.usageLimit,
              total: failureSummary.total,
              ratio: failureSummary.usageLimitRatio,
              timestamp: new Date().toISOString(),
            },
          );
        } catch (e) { debugLog('runFixPhase:provider-limit-event', e); }
        try {
          void notify('human-checkpoint-required', sprint.id, msg.title, msg.summary);
        } catch (e) { debugLog('runFixPhase:provider-limit-notify', e); }
        console.warn(`[fix] ${msg.summary}`);
        return;
      }
    } catch (e) { debugLog('runFixPhase:providerLimitGuard', e); }

    // ─── NOT_DISPATCHED Re-Dispatch-Candidate Classification ────────────
    // (Sprint 351 351-008 — MOAT-3) NOT_DISPATCHED tasks never had a worker
    // attempt, so routing them through the standard NO_GO blame-fix pipeline
    // (handleEvaluation → a "-fix" task framed as "Task X evaluated as
    // NO_GO") would falsely accuse a worker that never ran. They already
    // never reach handleEvaluation (the EVALUATE-phase branches above
    // `continue` before that call) so no blame-fix task exists for them —
    // this block only makes that exclusion observable: a distinct event +
    // an explicit re-dispatch-candidate classification, instead of a silent
    // gap in the FIX wave. handleCrossDependencies below is unaffected — it
    // filters strictly on `=== TaskEvaluation.NO_GO`, so NOT_DISPATCHED
    // tasks were already correctly excluded from cross-dependency fixes.
    try {
      const { reDispatchCandidateTaskIds } = classifyFixPhaseTasks(evaluations);
      if (reDispatchCandidateTaskIds.length > 0) {
        debugLog(
          'runFixPhase:reDispatchCandidates',
          `taskIds=[${reDispatchCandidateTaskIds.join(',')}] — NOT_DISPATCHED, not routed through blame-fix`,
        );
        const sidForRd = getCurrentSprintId(projectRoot) ?? sprint.id;
        writeEvent(
          projectRoot, sidForRd, 'brain', 'worker',
          'BRAIN→WORKER:RE_DISPATCH_CANDIDATES',
          {
            taskIds: reDispatchCandidateTaskIds,
            total: reDispatchCandidateTaskIds.length,
            reason: 'NOT_DISPATCHED — dispatch never happened, not a worker failure',
            timestamp: new Date().toISOString(),
          },
        );
      }
    } catch (e) { debugLog('runFixPhase:reDispatchCandidates', e); }

    if (maxFixRetries > 0) {
      handleCrossDependencies(projectRoot, sprint, evaluations);
    }

    const tasksPath = join(projectRoot, TASKS_DIR);
    const attemptedFixIds = new Set<string>();

    // Each loop consumes one admitted FIX round. A NO_GO fix can mint its
    // `-fix` child through handleEvaluation; the next scan picks that child up
    // in the SAME run. The attempted-id guard makes stale PENDING reads
    // idempotent and the depth gate enforces max_fix_retries per lineage.
    for (let fixRound = 1; fixRound <= maxFixRetries; fixRound += 1) {
      const allSprintTasksById = new Map(
        sprint.tasks.map(task => [task.id, task]),
      );
      if (existsSync(tasksPath)) {
        for (const file of readdirSync(tasksPath).filter(f => f.startsWith('task-') && f.endsWith('.json'))) {
          const task = readJsonSafe<Task>(join(tasksPath, file));
          // Explicit foreign ownership is rejected. Missing sprintId remains a
          // compatibility seam for pre-namespace FIX JSONs; lineage/root
          // membership and the current sprint object still bound selection.
          if (task && (task.sprintId === undefined || task.sprintId === sprint.id)) {
            allSprintTasksById.set(task.id, task);
          }
        }
      }
      const allSprintTasks = [...allSprintTasksById.values()];
      const taskIndex = new Map(allSprintTasks.map(task => [task.id, task]));
      const currentRootIds = new Set(
        sprint.tasks.filter(task => !task.isPriorityFix).map(task => task.id),
      );
      const fixTasks = [...selectPendingFixTasks(
        allSprintTasks,
        maxFixRetries,
        attemptedFixIds,
      )].filter(task =>
        resolveFixAncestorIds(task, taskIndex).some(ancestorId =>
          currentRootIds.has(ancestorId),
        ),
      );
      if (fixTasks.length === 0) break;
      for (const task of fixTasks) attemptedFixIds.add(task.id);

      // Dynamic FIX tasks are born after plan approval. Re-evaluate every one
      // against the same owner-authored worker policy before prompt creation or
      // provider dispatch, then persist that exact policy snapshot.
      const fixBudgetPolicies = applyWorkerExecutionBudgetPolicy(
        fixTasks,
        config.execution_budget,
        config.worker_provider,
      );
      for (let index = 0; index < fixTasks.length; index += 1) {
        const fixTask = fixTasks[index]!;
        writeFileSync(
          join(tasksPath, `task-${fixTask.id}.json`),
          JSON.stringify(fixTask, null, 2),
          'utf-8',
        );
        const policy = fixBudgetPolicies[index];
        if (policy?.state === 'hold') {
          throw createExecutionAuthorityError(
            `FIX_EXECUTION_BUDGET_HOLD:${fixTask.id}:${policy.reasonCode ?? 'unknown'}:${policy.profileRef}`,
          );
        }
      }

      // ─── Verify-and-Complete FIX Enrichment (Sprint 272 — Task 272-004) ──
      // Reframe the fix prompt for tasks whose original worker left an
      // EXIT_WITHOUT_RESULT marker with work on disk: audit-and-finish the
      // partial work + write the missing .result, NOT restart from scratch.
      // Runs BEFORE the v2 reroute (which re-persists the same task object) so
      // both routing versions carry the enriched description. Fail-safe: any
      // I/O error falls through to the normal FIX path.
      try {
        const enrichedIds = applyVerifyAndCompleteEnrichment(fixTasks, results);
        for (const enrichedId of enrichedIds) {
          const ft = fixTasks.find(t => t.id === enrichedId);
          if (ft) {
            writeFileSync(join(tasksPath, `task-${ft.id}.json`), JSON.stringify(ft, null, 2), 'utf-8');
          }
        }
        if (enrichedIds.length > 0) {
          debugLog('runFixPhase:verifyAndComplete', `enriched ${enrichedIds.length} fix prompt(s): ${enrichedIds.join(', ')}`);
        }
      } catch (e) { debugLog('runFixPhase:verifyAndComplete', e); }

      // V3: reroute FIX tasks with fresh-eyes exclusions through MidSprintAdapter.
      if (routingVersionForFix === 'v3') {
        try {
          const { MidSprintAdapter } = await import('./mid-sprint-adapter.js');
          const fixAgentPool = new AgentPoolManager(projectRoot);
          const fixPool = fixAgentPool.loadAgents();
          const fixSkillPool = new SkillPoolManager(projectRoot);
          const fixSkills = fixSkillPool.loadSkills();
          const { OutcomeTracker } = await import('./outcome-tracker.js');
          const fixTracker = new OutcomeTracker(projectRoot);
          const fixStack = detectProjectStack(projectRoot);
          const adapter = new MidSprintAdapter(fixPool, fixSkills, fixTracker, fixStack, config, projectRoot);
          const fixResultsMap = buildResultsMap(results);

          for (const fixTask of fixTasks) {
            if (fixTask.fixForTaskId) {
              // Find the original failed task's result via O(1) Map lookup
              const originalResult = fixResultsMap.get(fixTask.fixForTaskId);
              if (originalResult) {
                const rerouteResult = await adapter.shouldReroute(fixTask, originalResult);
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
      await spawnWorkers(projectRoot, fixSprint, config, {
        autoApprove: opts?.autoApprove,
        spawnBackend,
        attendedExecutionApprovalAuthority: opts?.attendedExecutionApprovalAuthority,
        providerAuthority: opts?.providerAuthority,
      });
      // Sprint 154 audit A4.F2: 600s yetersiz (Sprint 152 opus FIX worker timeout cascade kanıt) → 1800s.
      const fixPhaseTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
        ?? opts?.fixPhaseTimeoutMs
        ?? 1_800_000;
      const fixResults = await waitForResults(
        projectRoot,
        fixSprint,
        fixPhaseTimeout,
        undefined,
        {
          spawnBackend,
          attendedExecutionApprovalAuthority: opts?.attendedExecutionApprovalAuthority,
          providerAuthority: opts?.providerAuthority,
        },
        config,
      );
      const tasksById = new Map(allSprintTasks.map(task => [task.id, task]));
      const sprintIdForUnblock = getCurrentSprintId(projectRoot) ?? sprint.id;
      for (const fixTask of fixTasks) {
        const fixResult = fixResults.find(r => r.taskId === fixTask.id);
        if (fixResult) {
          // Sprint 191 P191-1: projectRoot for spurious NO_GO reconcile (fix-task too)
          const fixRubricResult = await safeRubricReconcile(projectRoot, sprint.id, fixTask, fixResult);
          const fixEval = toTaskEvaluation(fixRubricResult);
          const fixAttempt = resolveFixAttemptDepth(fixTask, tasksById);
          handleEvaluation(
            projectRoot,
            fixTask,
            fixEval,
            fixResult,
            { allowPriorityFixCreation: fixAttempt < maxFixRetries },
          );
          evaluations.set(fixTask.id, fixEval);
          if (!results.some(result => result.taskId === fixResult.taskId)) {
            results.push(fixResult);
          }

          // TT551: record the fix attempt as its OWN trace entry,
          // labeled apart from the original via retryOf=fixForTaskId. This is
          // the must-have wire: when fixEval is NO_GO the intermediate NO_GO
          // verdict — previously never recorded — reaches the corpus.
          recordFixWorkerTrace(
            fixTask,
            fixResult,
            fixEval,
            'fix',
            fixAttempt + 1,
            fixTask.fixForTaskId,
          );

          // MF-5 (Sprint 331 — Task 331-014): mirror the EVALUATE-phase
          // brain-verdict enrichment onto the `-fix.result` file so a fix-result
          // carries the same brainEvaluation block as the main .result
          // (result-format consistency — previously the FIX path wrote none).
          // FIX has no honest-gate, so pass honest:true; the NO_GO veto cause
          // (if any) still derives from fixResult.testsPassed / selfAssessment.
          // persistBrainVerdict is fail-soft → non-blocking for the FIX phase.
          persistBrainVerdict(
            projectRoot, fixTask.id, fixEval, fixRubricResult.totalScore,
            { honest: true }, fixResult,
          );
          if (
            (fixEval === TaskEvaluation.DONE || fixEval === TaskEvaluation.GO_WITH_TECH_DEBT) &&
            fixTask.fixForTaskId
          ) {
            // 362-001-fix: resolve the debt this fix chain was spawned to clear,
            // walking the fixForTaskId chain to its ROOT — not just the immediate
            // parent. A DIRECT fix (fixForTaskId → origin task) is the original
            // single call. But a FIX-OF-A-FIX (this task's fixForTaskId points at
            // another fix task that went NO_GO) breaks the link: NO_GO never mints
            // a debt row via recordDebtEntry, so `debt-<parentFixId>` does not
            // exist and resolving only it is a silent no-op — the origin debt the
            // chain exists to clear (e.g. debt-357-015-fix) stays `active` forever
            // and re-injects every sprint. Walk up to the root; resolveDebt is
            // idempotent (no-op on a missing / already-resolved row) so resolving
            // the whole chain is safe, and a `seen` set bounds the walk against a
            // malformed self / cyclic fixForTaskId. Degrades to the prior single-
            // resolve when the ancestor task file is absent (ancestorId → undefined).
            //
            // 363-001-fix: the gate now mirrors the main-loop EVALUATE-phase gate
            // (line ~1787: `DONE || GO_WITH_TECH_DEBT`). The prior DONE-only gate
            // was the true root-cause of the multi-sprint debt pile-up: a fix task
            // that lands GWTD (the common outcome — core delivered, minor residual)
            // skipped the chain-walk entirely, yet handleEvaluation still mints a
            // fresh `debt-<fixTaskId>` row for the residual. The ancestor chain
            // (incl. the root debt) therefore never resolved and re-injected every
            // sprint — an ever-growing pile. Widening to GWTD collapses the lineage
            // to a SINGLE rolling debt: a GWTD fix DID deliver the core, its residual
            // is tracked by the freshly-minted debt-<fixTaskId>, so the stale
            // ancestor rows are safe to resolve. NO_GO is still excluded (a NO_GO
            // fix delivered nothing, so its ancestors must stay open).
            // 365-001: walk delegated to resolveDebtChain (src/orchestra/debt-chain.ts)
            // — the single definition now shared with the EVALUATE-phase gate above,
            // so the two paths can never diverge again (they were hand-re-synced twice).
            resolveDebtChain(projectRoot, fixTask.id, fixTask.fixForTaskId, sprint.id);
          }
          // A successful attempt resolves the WHOLE logical lineage. A
          // fix-of-a-fix is attempt 3 of the root task, not a second task whose
          // success leaves the original NO_GO projection behind.
          const ancestorIds = resolveFixAncestorIds(fixTask, tasksById);
          const originalReconciled =
            fixEval !== TaskEvaluation.NO_GO && ancestorIds.length > 0;
          if (originalReconciled) {
            // Project the resolved verdict onto the logical root only. Keep
            // intermediate attempt verdicts intact (NO_GO remains NO_GO) so
            // attempt analytics and training traces do not rewrite history.
            evaluations.set(ancestorIds.at(-1)!, fixEval);
          }

          // Sprint 171 Bug B: persist FIX re-evaluation to forensic ledger
          // (runEvaluatePhase wrote only attempt-1; FIX decisions were
          // invisible → false post-mortem "never reconciled"). Use sprint.id
          // so attempt-2 is a sibling of EVALUATE's attempt-1.
          recordFixEvaluationAudit(
            projectRoot, sprint.id, fixTask, fixRubricResult, fixEval,
            originalReconciled,
            ancestorIds.length > 0
              ? {
                  rootTaskId: ancestorIds.at(-1)!,
                  logicalAttempt: fixAttempt + 1,
                }
              : undefined,
          );

          // ─── Sprint 156 Task 003: Unblock dependents on fix DONE ────
          // When a fix worker resolves a previously-failed task, flip the
          // original task's status to DONE in-memory so unblockDependents'
          // doneTasks set picks it up, then re-enable PAUSED dependents
          // whose dependencies are all satisfied.
          if (
            fixEval !== TaskEvaluation.NO_GO &&
            ancestorIds.length > 0
          ) {
            const rootTaskId = ancestorIds.at(-1)!;
            const originalTask = sprint.tasks.find(t => t.id === rootTaskId);
            if (originalTask && originalTask.status !== TaskStatus.DONE) {
              originalTask.status = TaskStatus.DONE;
              persistTaskStatus(projectRoot, sprint, originalTask.id);
            }
            try {
              const unblockedTaskIds = applyUnblockToSprint(
                projectRoot, sprint, rootTaskId,
              );
              for (const unblockedId of unblockedTaskIds) {
                persistTaskStatus(projectRoot, sprint, unblockedId);
              }
              writeEvent(
                projectRoot, sprintIdForUnblock, 'brain', '*',
                'BRAIN→*:DEPENDENCY_UNBLOCK_APPLIED',
                {
                  resolvedTaskId: rootTaskId,
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

    // ─── NOT_DISPATCHED Re-Dispatch Execution (Sprint 354 354-010 — MOAT-3 FIX-half) ──
    // 351-008 built the classification above (reDispatchCandidateTaskIds, kept OUT
    // of the NO_GO blame-fix pipeline). This block actually re-queues each
    // candidate's ORIGINAL task for one honest re-dispatch attempt — never a
    // synthetic "-fix" task, since no worker ever ran to blame. Capped at exactly
    // ONE round via a disk marker (`.tasks/task-{id}.redispatch-attempted`,
    // written BEFORE the attempt so even a crash mid-round burns the budget, not
    // just a successful dispatch) — so a resumed/re-entrant FIX phase can never
    // retry the same task a second time (no infinite loop). A task whose marker
    // already exists stays honestly NOT_DISPATCHED; its one round is spent.
    // Deliberately isolated at the very end of the phase (after escalateDebt) so
    // it can never reorder or interfere with the existing NO_GO fix wave above.
    try {
      const { reDispatchCandidateTaskIds } = classifyFixPhaseTasks(evaluations);
      if (reDispatchCandidateTaskIds.length > 0) {
        const eligible: Task[] = [];
        let exhausted = 0;
        for (const taskId of reDispatchCandidateTaskIds) {
          const markerPath = join(tasksPath, `task-${taskId}.redispatch-attempted`);
          if (existsSync(markerPath)) {
            exhausted += 1;
            continue;
          }
          const originalTask = sprint.tasks.find(t => t.id === taskId);
          if (originalTask) eligible.push(originalTask);
        }

        let succeeded = 0;
        let failed = 0;
        let stillNotDispatched = 0;

        if (eligible.length > 0) {
          for (const t of eligible) {
            try {
              writeFileSync(
                join(tasksPath, `task-${t.id}.redispatch-attempted`),
                new Date().toISOString(),
                'utf-8',
              );
            } catch (e) { debugLog('runFixPhase:reDispatch:marker', e); }
            t.status = TaskStatus.PENDING;
            persistTaskStatus(projectRoot, sprint, t.id);
          }

          const reDispatchSprint: Sprint = {
            ...sprint,
            tasks: eligible,
            workers: eligible.map(t => `w-${t.id}`),
          };
          const reDispatchTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
            ?? opts?.fixPhaseTimeoutMs
            ?? 1_800_000;
          await spawnWorkers(projectRoot, reDispatchSprint, config, {
            autoApprove: opts?.autoApprove,
            spawnBackend,
            attendedExecutionApprovalAuthority: opts?.attendedExecutionApprovalAuthority,
            providerAuthority: opts?.providerAuthority,
          });
          const reDispatchResults = await waitForResults(
            projectRoot,
            reDispatchSprint,
            reDispatchTimeout,
            undefined,
            {
              spawnBackend,
              attendedExecutionApprovalAuthority: opts?.attendedExecutionApprovalAuthority,
              providerAuthority: opts?.providerAuthority,
            },
            config,
          );

          for (const rTask of eligible) {
            const rResult = reDispatchResults.find(r => r.taskId === rTask.id);
            if (!rResult) {
              // Second attempt also produced no result. Disk-evidence check one
              // more time (same classifier the EVALUATE phase uses): no .hb/.log
              // trace → the retry budget is exhausted, stays honestly
              // NOT_DISPATCHED (no third attempt). A trace this round means a
              // worker actually ran and crashed — a real NO_GO, not a dispatch gap.
              const evidence = gatherDispatchTraceEvidence(projectRoot, rTask.id);
              if (classifyMissingResultDispatch(evidence) === 'NOT_DISPATCHED') {
                stillNotDispatched += 1;
                evaluations.set(rTask.id, TaskEvaluation.NOT_DISPATCHED);
              } else {
                failed += 1;
                const syntheticResult: TaskResult = {
                  taskId: rTask.id,
                  workerId: rTask.assignedWorker ?? 'unknown',
                  filesChanged: [],
                  linesAdded: 0,
                  linesRemoved: 0,
                  testsPassed: false,
                  coverage: 0,
                  selfAssessment: 'NO_GO',
                  notes: 'Re-dispatch attempt produced no result (worker crashed/timed out) — dispatch itself ran this round.',
                };
                handleEvaluation(projectRoot, rTask, TaskEvaluation.NO_GO, syntheticResult);
                evaluations.set(rTask.id, TaskEvaluation.NO_GO);
              }
              continue;
            }
            const rRubricResult = await safeRubricReconcile(projectRoot, sprint.id, rTask, rResult);
            const rEval = toTaskEvaluation(rRubricResult);
            handleEvaluation(projectRoot, rTask, rEval, rResult);
            evaluations.set(rTask.id, rEval);
            // TT551: a NOT_DISPATCHED task re-run is the ORIGINAL work-item's
            // 2nd honest attempt (no fix task, so retryOf stays undefined).
            recordFixWorkerTrace(rTask, rResult, rEval, 'original', 2, undefined);
            if (rEval === TaskEvaluation.NO_GO) failed += 1; else succeeded += 1;
          }
        }

        // Separate summary counter (goCriteria: "summary'de ayrı sayaç") — always
        // emitted whenever there was at least one re-dispatch CANDIDATE, even when
        // every candidate was `exhausted` (marker already spent, none `eligible`).
        // Reporting only on a non-empty dispatch would silently drop the exhausted
        // count from every observable surface. Kept as a forensic event (matches
        // RE_DISPATCH_CANDIDATES style above) rather than a sprint-reporter.ts
        // field change (out of write scope).
        try {
          const sidForRd = getCurrentSprintId(projectRoot) ?? sprint.id;
          writeEvent(
            projectRoot, sidForRd, 'brain', 'worker',
            'BRAIN→WORKER:RE_DISPATCH_RESULT',
            {
              attempted: eligible.length,
              succeeded,
              failed,
              stillNotDispatched,
              exhausted,
              timestamp: new Date().toISOString(),
            },
          );
        } catch (e) { debugLog('runFixPhase:reDispatchResult:event', e); }
      }
    } catch (e) {
      if (e instanceof ProviderExecutionIngressHoldError) throw e;
      debugLog('runFixPhase:reDispatchExecution', e);
    }

    // ─── POSTFIX-PENDING-SCAN (Sprint 361 361-004 — born-475) ────────────
    // 360 live lesson: tasks 003/008 whose parent tasks were already DONE
    // were never spawned — a stall window swallowed the per-completion
    // respawnEligibleTasks call (result-collector.ts normally invokes it
    // after every finalizeTaskResult), leaving a PENDING+dependency-
    // eligible task with no dispatch attempt ever made. This is a single
    // safety-net wave drain at the very end of FIX: reuse respawnEligibleTasks
    // (the SAME wave mechanism spawnWorkers/EVALUATE use elsewhere — no new
    // scheduler), spawn whatever it finds still-eligible, and wait for those
    // results. If nothing is eligible this is a no-op — behavior stays
    // byte-identical to before this block existed. Re-scan after every
    // completed wave so a root→consumer→verifier chain drains in the same
    // lifecycle. The loop is structurally bounded by the number of original
    // tasks; each successful iteration must dispatch at least one previously
    // PENDING/PAUSED id.
    try {
      for (let postFixWave = 1; postFixWave <= sprint.tasks.length; postFixWave++) {
        const postFixSpawnedIds = await respawnEligibleTasks(
        projectRoot,
        sprint,
        config,
        {
          autoApprove: opts?.autoApprove,
          spawnBackend,
          attendedExecutionApprovalAuthority: opts?.attendedExecutionApprovalAuthority,
          providerAuthority: opts?.providerAuthority,
        },
        );
        if (postFixSpawnedIds.length === 0) break;
        {
        debugLog(
          'runFixPhase:postFixPendingScan',
          `spawned ${postFixSpawnedIds.length} previously-stalled eligible task(s): ${postFixSpawnedIds.join(', ')}`,
        );
        const postFixTasks = sprint.tasks.filter(t => postFixSpawnedIds.includes(t.id));
        const postFixSprint: Sprint = {
          ...sprint,
          tasks: postFixTasks,
          workers: postFixTasks.map(t => `w-${t.id}`),
        };
        const postFixTimeout = (config as unknown as Record<string, unknown>).fix_phase_timeout as number | undefined
          ?? opts?.fixPhaseTimeoutMs
          ?? 1_800_000;
        const postFixResults = await waitForResults(
          projectRoot,
          postFixSprint,
          postFixTimeout,
          undefined,
          {
            spawnBackend,
            attendedExecutionApprovalAuthority: opts?.attendedExecutionApprovalAuthority,
            providerAuthority: opts?.providerAuthority,
          },
          config,
        );

        let succeeded = 0;
        let failed = 0;
        for (const pTask of postFixTasks) {
          const pResult = postFixResults.find(r => r.taskId === pTask.id);
          if (!pResult) continue;
          const pRubricResult = await safeRubricReconcile(projectRoot, sprint.id, pTask, pResult);
          const pEval = toTaskEvaluation(pRubricResult);
          handleEvaluation(projectRoot, pTask, pEval, pResult);
          evaluations.set(pTask.id, pEval);
          persistBrainVerdict(
            projectRoot, pTask.id, pEval, pRubricResult.totalScore, { honest: true }, pResult,
          );
          // TT551: a stalled task rescued by the post-fix scan — 'fix' when it
          // carries a fixForTaskId, else the ORIGINAL's first real attempt.
          recordFixWorkerTrace(
            pTask, pResult, pEval,
            pTask.fixForTaskId ? 'fix' : 'original',
            pTask.fixForTaskId ? 2 : 1,
            pTask.fixForTaskId,
          );
          if (pEval === TaskEvaluation.NO_GO) failed += 1; else succeeded += 1;
        }

        const sidForPostFix = getCurrentSprintId(projectRoot) ?? sprint.id;
        writeEvent(
          projectRoot, sidForPostFix, 'brain', 'worker',
          'BRAIN→WORKER:POSTFIX_PENDING_SCAN',
          {
            wave: postFixWave,
            spawned: postFixSpawnedIds.length,
            taskIds: postFixSpawnedIds,
            succeeded,
            failed,
            timestamp: new Date().toISOString(),
          },
        );
        }
      }
    } catch (e) {
      if (e instanceof ProviderExecutionIngressHoldError) throw e;
      debugLog('runFixPhase:postFixPendingScan', e);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const taskIdMatch = /FIX_EXECUTION_BUDGET_HOLD:([^:]+):/.exec(message);
    const code = err instanceof ProviderExecutionIngressHoldError
      ? err.code
      : err instanceof DeckentError
        ? err.code
        : 'FIX_PHASE_FAILED';
    safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${message}`);
    return {
      failed: true,
      code,
      message,
      ...(taskIdMatch?.[1] ? { taskId: taskIdMatch[1] } : {}),
    };
  }
}

/** Typed, provider/backend-neutral FIX failure returned to the lifecycle owner. */
export interface FixPhaseFailureOutcome {
  readonly failed: true;
  readonly code: string;
  readonly message: string;
  readonly taskId?: string;
}


// ═══ Phase 6+7: RETRO + DECAY ═════════════════════════════════════

/**
 * Returned by {@link runRetroPhase} when `finalizeSprint` throws. Fail-soft is
 * preserved (the sprint does not crash) but the failure is no longer silently
 * swallowed into an `undefined` return — callers can check `finalizeFailed`
 * instead of rendering an unqualified "Complete!" (ADR-G-025, 349-002).
 */
export interface RetroPhaseFailure {
  finalizeFailed: true;
  error: string;
}

/**
 * Build the localized, honest user notice shown when `finalizeSprint` throws
 * inside the RETRO phase (i18n-FIRST: en+tr).
 *
 * Co-located here rather than in `src/cli/helpers/messages.ts` because that
 * file is outside this task's write-scope — same constraint documented at
 * `providerLimitFixSkipMessage` in provider-failure-classifier.ts (ADR-D-004
 * ORCH-W1: orchestra/ → cli/ is a tracked import-direction inversion).
 */
function finalizeFailedMessage(
  lang: string,
  errorMessage: string,
): { title: string; summary: string } {
  const isTr = lang === 'tr';
  return isTr
    ? {
        title: 'Sprint kapanışı (finalize) başarısız',
        summary:
          `RETRO fazında finalizeSprint hata verdi — retro/memory/export/arşiv adımları ` +
          `tamamlanmamış olabilir: ${errorMessage}`,
      }
    : {
        title: 'Sprint finalize failed',
        summary:
          `finalizeSprint threw during the RETRO phase — retro/memory/export/archive ` +
          `steps may be incomplete: ${errorMessage}`,
      };
}

/**
 * Run the RETRO phase (includes DECAY via finalizeSprint).
 * In test mode, only calculates metrics without writing retro/memory files.
 * Mutates `sprint` (status, phase, metrics) in place.
 * @param flowId - SURF-0.4 (Task 432-004): optional upstream run-flow
 *   correlation id (`RunSprintOptions.flowId`, 432-001). Additive only —
 *   forwarded verbatim to `finalizeSprint`'s `FinalizeSprintOptions.flowId`
 *   (432-003) so it lands on the sprint completion record. Absent for every
 *   caller that does not pass it, so this is a zero-behavior-change addition.
 * @returns Computed sprint metrics; a {@link RetroPhaseFailure} marker if
 *   `finalizeSprint` threw (fail-soft — not re-thrown); or undefined if
 *   metrics calculation failed in test mode.
 */
export async function runRetroPhase(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  config: ResolvedConfig,
  testMode?: boolean,
  flowId?: string,
): Promise<SprintMetrics | RetroPhaseFailure | undefined> {
  if (!testMode) {
    assertTaskResultAuthoritiesReady(
      projectRoot,
      sprint.tasks.map(task => task.id),
      'retro-entry',
    );
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
        const haveStubCheck = typeof isConfirmedStub === 'function';
        if (haveSentinel || haveStubCheck) {
          for (const task of sprint.tasks) {
            const authority = readAuthoritativeTaskResult<TaskResult>(projectRoot, task.id);
            const persistedResult = authority.result;
            if (!persistedResult) {
              // Sprint 351 351-008 (MOAT-3) — THE production bug this task
              // fixes: this pass previously clobbered EVERY missing-result
              // task to a "worker-crashed-no-result" NO_GO sentinel,
              // regardless of whether a worker was ever dispatched at all —
              // bypassing the EVALUATE-phase liveness nuance entirely
              // (sprint-347/348 live incident). Apply the same disk-evidence
              // check here: no .result + no .hb + no .log → NOT_DISPATCHED,
              // never a lying NO_GO. Archived tasks (already finalized once)
              // are excluded from either path — absence there is archiving,
              // not a crash or a dispatch gap.
              if (!archivedResultExists(projectRoot, task.id)) {
                const dispatchEvidence = gatherDispatchTraceEvidence(projectRoot, task.id);
                if (classifyMissingResultDispatch(dispatchEvidence) === 'NOT_DISPATCHED') {
                  debugLog(
                    'runRetroPhase:preFinalize:not-dispatched',
                    `task=${task.id} — no .result/.hb/.log trace on disk, classifying NOT_DISPATCHED (not a crash)`,
                  );
                  evaluations.set(task.id, TaskEvaluation.NOT_DISPATCHED);
                  continue;
                }
              }
              if (haveSentinel) {
                writeHonestSentinelResult(
                  projectRoot, task.id, [], 'worker-crashed-no-result',
                );
                evaluations.set(task.id, TaskEvaluation.NO_GO);
              }
              continue;
            }
            // Existing authoritative result — check for stub shape and rewrite
            // the raw projection if dishonest. For Docker tasks this reads the
            // immutable closed host settlement, never contradictory raw output.
            try {
              const parsed = persistedResult;
              // B-STUB / B-DOCKER-RACE / B-SENTINEL-CLOBBER (Sprint 318): isConfirmedStub
              // adds the MF-8 disk-evidence override the retro-phase caller previously
              // bypassed — a result is only flipped if it matches the stub shape AND has
              // no on-disk evidence (git numstat + untracked). Pure refactors (rename/
              // re-export/delete → linesAdded:0) and docker workers (untracked → numstat 0)
              // leave real disk changes → honest, NOT flagged. 318-003 (a rename) was
              // wrongly downgraded + sentinel-clobbered here. Fail-open preserves the
              // legacy synthetic NO_GO when git is unavailable.
              if (haveStubCheck && isConfirmedStub(parsed, task.scope, projectRoot)) {
                debugLog('runRetroPhase:preFinalize', `Rewriting confirmed-stub .result for task ${task.id} (no disk evidence)`);
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
        flowId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${message}`);

      // ADR-G-025 / 349-002 — a finalize failure must be SURFACED, not just
      // logged to the dashboard: (1) stderr, (2) the notify pipeline,
      // (3) a returned marker so a caller never renders an unqualified
      // "Complete!" over a lost retro/memory/export/archive. Fail-soft is
      // preserved — no re-throw.
      const lang = config.language ?? 'en';
      const msg = finalizeFailedMessage(lang, message);
      console.error(`[retro] ${msg.summary}`);
      try {
        void notify('human-checkpoint-required', sprint.id, msg.title, msg.summary, message);
      } catch (e) { debugLog('runRetroPhase:finalizeFailed:notify', e); }

      return { finalizeFailed: true, error: message };
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
        try { cleanupToolInventory(projectRoot, _sprint.id); } catch (e) { debugLog('runCleanupPhase:cleanupToolInventoryDelayed', e); }
      }, cleanupDelay);
    } else {
      try {
        cleanup(projectRoot, sprint, spawnBackend);
      } catch (err) {
        safeDashboardUpdate(projectRoot, sprint, `Phase ${sprint.phase} error: ${err instanceof Error ? err.message : String(err)}`);
      }
      try { cleanupToolInventory(projectRoot, sprint.id); } catch (e) { debugLog('runCleanupPhase:cleanupToolInventory', e); }
    }
  }

  return null;
}

// ═══ Mid-Sprint Cost Guard (Sprint 279 WK-cost) ══════════════════════════════
// Opt-in (config.cost_guard.enabled === true, default-off). Periodically checks
// the limit-ledger during EXECUTE phase and signals dispatch-stop when the sprint
// has consumed >= max_limit_cost_usd. Best-effort: ledger errors never fail the
// sprint.

/** Injectable options for {@link checkMidSprintCostGuard} — used in hermetic tests. */
export interface CostGuardOpts {
  /**
   * Injectable cost getter — returns current sprint limit-equivalent cost in USD.
   * When omitted, calls parseTranscriptUsage + limitCost({ root: projectRoot }).
   * Override in tests to return a deterministic cost without real transcript I/O.
   */
  getLimitCost?: (projectRoot: string) => Promise<number>;
}

/**
 * Check whether the mid-sprint cost guard should stop new task dispatch.
 *
 * Returns `{ shouldStopDispatch: false }` when:
 *   - `config.cost_guard.enabled !== true` (disabled → no-op)
 *   - `max_limit_cost_usd` is absent or <= 0
 *   - The ledger call throws or returns 0 (best-effort)
 *   - Current cost is below the threshold
 *
 * Returns `{ shouldStopDispatch: true }` when `currentCostUsd >= max_limit_cost_usd`.
 * Also writes an audit event and emits a notify signal on first threshold crossing.
 *
 * @internal Exported for unit tests.
 */
export async function checkMidSprintCostGuard(
  projectRoot: string,
  sprintId: string,
  config: ResolvedConfig,
  opts?: CostGuardOpts,
): Promise<{ shouldStopDispatch: boolean; currentCostUsd: number }> {
  // Guard: disabled → no-op
  if (config.cost_guard?.enabled !== true) {
    return { shouldStopDispatch: false, currentCostUsd: 0 };
  }
  const maxCost = config.cost_guard.max_limit_cost_usd;
  if (typeof maxCost !== 'number' || maxCost <= 0) {
    return { shouldStopDispatch: false, currentCostUsd: 0 };
  }

  // Best-effort: any ledger error returns a safe no-op result
  let currentCostUsd = 0;
  try {
    if (opts?.getLimitCost) {
      currentCostUsd = await opts.getLimitCost(projectRoot);
    } else {
      // Dynamic import to avoid top-level circular dep risk; fail-safe on error.
      // Fixed 2026-06-11: the original default read the PROJECT root as the
      // transcripts root (always zero records) and passed an empty price map
      // (always $0) — the guard could never trip. Now: parse the global CC
      // transcripts dir, scope records to this sprint's tasks via the
      // session→task map, and price with the project's cost-config.
      const { parseTranscriptUsage, limitCost } = await import('../core/limit-ledger.js');
      const { buildTranscriptTaskMap, filterTaskMapToSprint } = await import('../core/limit-ledger-report.js');
      const { buildLedgerPrices } = await import('../core/cost-config-loader.js');
      const records = await parseTranscriptUsage({});
      const sprintMap = filterTaskMapToSprint(await buildTranscriptTaskMap({}), sprintId);
      const sprintRecords = records.filter((r) => sprintMap[r.sessionFile] !== undefined);
      currentCostUsd = limitCost(sprintRecords, buildLedgerPrices(projectRoot));
    }
  } catch (e) {
    debugLog('costGuard:getLimitCost', e);
    return { shouldStopDispatch: false, currentCostUsd: 0 };
  }

  if (currentCostUsd >= maxCost) {
    const msg =
      `Sprint ${sprintId}: limit-cost $${currentCostUsd.toFixed(4)} >= threshold ` +
      `$${maxCost.toFixed(4)} — stopping new task dispatch (cost_guard)`;
    debugLog('costGuard:abort', msg);
    try {
      writeEvent(projectRoot, sprintId, 'brain', 'auditor', 'COST_GUARD_ABORT', {
        currentCostUsd,
        maxCostUsd: maxCost,
        emittedAt: new Date().toISOString(),
      });
    } catch (e) { debugLog('costGuard:writeEvent', e); }
    return { shouldStopDispatch: true, currentCostUsd };
  }

  return { shouldStopDispatch: false, currentCostUsd };
}

/** Handle returned by {@link createCostGuardMonitor}. */
export interface CostGuardMonitor {
  /** Start the periodic cost check interval. No-op if already started. */
  start(): void;
  /** Stop the periodic interval. */
  stop(): void;
  /** True after the first tick that exceeded the cost threshold. */
  shouldStopDispatch(): boolean;
}

/**
 * Create a periodic cost guard monitor for the duration of the EXECUTE phase.
 *
 * Default interval: 60 seconds. Opt-in via `config.cost_guard.enabled === true`.
 * When disabled, returns a no-op monitor that never sets the dispatch-stop flag.
 *
 * Pattern mirrors {@link createResourceMonitor} from resource-monitor.ts.
 *
 * @internal Exported for unit tests.
 */
export function createCostGuardMonitor(
  projectRoot: string,
  sprintId: string,
  config: ResolvedConfig,
  opts?: CostGuardOpts & { intervalMs?: number },
): CostGuardMonitor {
  let stopDispatch = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const intervalMs = opts?.intervalMs ?? 60_000;

  function start(): void {
    if (timer !== null) return;
    if (config.cost_guard?.enabled !== true) return;
    timer = setInterval(() => {
      checkMidSprintCostGuard(projectRoot, sprintId, config, opts).then((result) => {
        if (result.shouldStopDispatch) {
          stopDispatch = true;
        }
      }).catch((e) => { debugLog('costGuardMonitor:tick', e); });
    }, intervalMs);
  }

  function stop(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    shouldStopDispatch: () => stopDispatch,
  };
}
