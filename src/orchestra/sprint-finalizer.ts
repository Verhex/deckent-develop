// ═══ Sprint Finalizer ══════════════════════════════════════════════
// Extracted from sprint-controller.ts — handles post-sprint finalization:
//   finalizeSprint(), applyAdaptiveThresholds(), hook stubs for Task 13/14/15

// ─── Node Builtins ─────────────────────────────────────────────────
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync,
} from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports) ──────────────────────────────────────────
import {
  TaskEvaluation, SprintStatus, SprintPhase,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  TaskResult, Sprint, SprintMetrics,
  ResolvedConfig,
} from '../core/types.js';

import type { TaskDNA } from '../core/routing-types.js';

import {
  BRAIN_DIR, JOBS_DIR, DASHBOARD_FILE, RECENT_WORKS_DIR,
} from '../core/constants.js';

import { runRetention } from '../core/sprint-file-retention.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { updateLastSprintId, debugLog } from '../core/utils.js';
import { getDebtItems } from '../core/debt-store.js';

// ─── Sprint Reporter ──────────────────────────────────────────────
import {
  writeRetrospective, appendRetroSection, writeSprintLog, calculateMetrics,
  updateProjectDocs,
  buildAgentPerformance, archiveDirectives, archiveOrphanTasks,
  buildSprintLimitBurnRow,
} from './sprint-reporter.js';

// ─── Sprint Docs Updater (direct — cleanTasksArchive not re-exported via sprint-reporter) ──
import { cleanTasksArchive } from './sprint-docs-updater.js';

// ─── Result Evaluator ─────────────────────────────────────────────
import {
  getRecentSprintStats,
  GO_WITH_GATE_FAILURE,
} from './result-evaluator.js';

// ─── Auditor (code verification — migrated Sprint 138) ────────────
import {
  tryCodeVerifiedDone,
  writeCodeVerifiedResult,
} from '../monitor/auditor.js';

// ─── Baseline Tracker ─────────────────────────────────────────────
import {
  parseVitestOutput, readBaseline, containsHonestyTrigger,
  captureVitestBaseline,
} from './baseline-tracker.js';

// ─── Result Collector ─────────────────────────────────────────────
import { buildResultsMap } from './result-collector.js';

// ─── Debt Manager ─────────────────────────────────────────────────
import { runDecay, auditBrainBudget } from './debt-manager.js';
import { runDocTrackingSync } from '../core/doc-tracking/sync.js';

// ─── Observability ────────────────────────────────────────────────
import { generateLoadReport, initObservability } from '../core/observability.js';
import { rotateMetricsFile } from '../core/observability-rotation.js';
import type { ObservabilityRotationConfig } from '../core/observability-rotation.js';

// ─── Agent/Skill Pool ─────────────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { SkillPoolManager } from '../core/skill-pool.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { runHooks } from '../core/plugin-hooks.js';
import type { AfterSprintContext } from '../core/plugin-hooks.js';

// ─── Rich Output ──────────────────────────────────────────────────
import { formatRichSprintSummary } from '../cli/helpers/sprint-summary-rich.js';

// ─── Event Stream (Brain event hooks — Sprint 139 Task 042) ───────
import { writeEvent, CHANNELS, getCurrentSprintId } from './event-stream.js';

// ─── Post-Finalize Hooks (Sprint 143 Task 10) ─────────────────────
import { runPostFinalizeHooks } from '../core/identity-generator.js';
import type { PostFinalizeHookResult } from '../core/identity-generator.js';

// ─── Export-wipe guard (Sprint 227 task 227-002) ──────────────────
// runMemoryExport (identity-generator.ts) overwrites .brain/exports/*.md
// unconditionally; in sprint-226 this wiped decisions.md from 8518 to 2 lines
// while the DB still held 75 ADRs. We bypass runMemoryExport and call the
// guarded writer here instead — it refuses to overwrite when the render
// collapses to the "no entries" marker while the DB has entries.
import { writeGuardedExports } from '../core/memory-export.js';
import { MemoryStore } from '../core/memory-store.js';
import { MEMORY_DB_FILE } from '../core/constants.js';

// ─── Task Restoration / Auto-Archive Guard (Sprint 143 Task 13) ───
import { createPreArchiveSnapshot, classifyTaskFiles } from './task-restoration.js';

// ─── Notify (DECKENT→USER:NOTIFY — Hot Fix H6) ────────────────────
import { notify } from '../core/notify.js';

// ─── Sprint State + PID cleanup (Sprint 223 Task 013) ─────────────
// Mark sprint-state.json as terminal (COMPLETE/COMPLETE) and remove
// `.deckent/pids/<id>.pid` + `.snapshot.json` so the next `deckent start`
// no longer detects this sprint as an orphan and does not re-resume it
// in the FIX phase.
import { writeSprintState, readSprintState, SPRINT_STATE_FILE } from './sprint-utils.js';
import { clearPid } from './sprint-pid-manager.js';

// ─── Checkpoint cleanup (Sprint 272 272-001 — GHOST-FINALIZE) ─────
// Terminal-state finalize must purge `.deckent/<id>-checkpoint.json` +
// `-checkpoint-seq` so the next `deckent start` cannot read a stale
// checkpoint and run a phantom 0/0 "complete" restore that exits before
// the new sprint starts. Covers normal completion AND `finalize --force`.
import { cleanupCheckpointFiles } from './sprint-checkpoint.js';


// ═══ Types ════════════════════════════════════════════════════════

/**
 * Options for finalizeSprint.
 */
export interface FinalizeSprintOptions {
  /** Skip decay phase */
  skipDecay?: boolean;
  /** Skip plugin hooks */
  skipHooks?: boolean;
  /** Resolved config (used for updateProjectDocs) */
  config?: ResolvedConfig;
  /** Skip post-finalize memory export */
  skipMemoryExport?: boolean;
  /** Skip post-finalize identity regeneration */
  skipIdentityRegen?: boolean;
  /** Rule regeneration callback (Task 11 hook point) */
  onRuleRegen?: (projectRoot: string) => void | Promise<void>;
}


// ═══ Hook Stubs (Task 13 / Task 14 / Task 15 will fill these) ═══

/**
 * Run honesty check against pre-sprint baseline.
 * Stub — Task 5 (baseline-tracker) will implement comparison logic.
 * @returns Number of honesty violations detected (0 = clean)
 */
export async function runHonestyCheck(
  _projectRoot: string,
  _sprintId: string,
  _results: TaskResult[],
): Promise<number> {
  // Stub: returns 0 violations (no-op until Task 5 integrates)
  return 0;
}

/**
 * Append rubric score detail to the sprint's `retro` entry in memory.db.
 * Adds a "### Rubric Scores" section. B8: writes to the DB retro entry —
 * the legacy `.brain/RETRO.md` file is no longer produced.
 * @returns true if detail was written, false if no rubric data available
 */
export async function writeRubricDetail(
  projectRoot: string,
  sprintId: string,
  results: TaskResult[],
  _evaluations: Map<string, TaskEvaluation>,
): Promise<boolean> {
  // Only proceed if at least one result has rubric scores
  const scoredResults = results.filter(r => r.rubricScores && Object.keys(r.rubricScores).length > 0);
  if (scoredResults.length === 0) return false;

  // Build the rubric table rows
  const tableLines: string[] = [];
  tableLines.push('');
  tableLines.push(`### Rubric Scores`);
  tableLines.push('| Task | Correctness | Coverage | Scope | Docs | Avg |');
  tableLines.push('|------|-------------|----------|-------|------|-----|');

  const avgScores: number[] = [];

  for (const result of scoredResults) {
    const rs = result.rubricScores!;
    const fmt = (v: number | undefined): string => v !== undefined ? `${v}` : 'N/A';
    const correctness = rs.correctness;
    const coverage = rs.test_coverage;
    const scope = rs.scope_compliance;
    const docs = rs.documentation;

    const defined = [correctness, coverage, scope, docs].filter((v): v is number => v !== undefined);
    const avg = defined.length > 0 ? Math.round(defined.reduce((a, b) => a + b, 0) / defined.length) : undefined;
    if (avg !== undefined) avgScores.push(avg);

    tableLines.push(`| ${result.taskId} | ${fmt(correctness)} | ${fmt(coverage)} | ${fmt(scope)} | ${fmt(docs)} | ${avg !== undefined ? avg : 'N/A'} |`);
  }

  if (avgScores.length > 0) {
    const overallAvg = Math.round(avgScores.reduce((a, b) => a + b, 0) / avgScores.length);
    tableLines.push(`| **Sprint Avg** | — | — | — | — | **${overallAvg}** |`);
  }

  return appendRetroSection(projectRoot, sprintId, '### Rubric Scores', tableLines.join('\n') + '\n');
}

/**
 * Self-audit gate: run tsc + vitest + honesty + observability checks.
 * Implemented by Task 14 (Brain Self-Audit Gate).
 *
 * Gate steps:
 * 1. `npx tsc --noEmit` (timeout 90s)
 * 2. `npx vitest run` (timeout 300s) + baseline delta
 * 3. Honesty violation count from task results
 * 4. `.deckent/metrics.jsonl` existence + line count
 *
 * Overall gate = PASS if tsc + vitest + honesty all pass.
 * metrics.jsonl missing → WARNING only, not gate failure.
 */
export interface SelfAuditResult {
  tsc: { status: 'PASS' | 'FAIL'; errors: string[] };
  vitest: { status: 'PASS' | 'FAIL'; delta: { files: number; pass: number; fail: number; skipped: number } };
  honesty: { violations: number; flaggedTasks: string[] };
  observability: { metricsJsonlExists: boolean; lineCount: number };
  overallGate: 'PASS' | 'GATE_FAILURE';
}

/**
 * Options for dependency injection in runSelfAuditGate.
 * Allows tests to override shell commands and filesystem access.
 */
export interface SelfAuditGateOptions {
  /** Override tsc execution (for testing) */
  runTsc?: (projectRoot: string) => { status: number; stdout: string; stderr: string };
  /** Override vitest execution (for testing) */
  runVitest?: (projectRoot: string) => { status: number; stdout: string; stderr: string };
  /** Override honesty check results (for testing) */
  honestyResults?: Array<{ taskId: string; violation: boolean }>;
  /** Override metrics.jsonl path check (for testing) */
  metricsJsonlPath?: string;
}

export async function runSelfAuditGate(
  sprintId: string,
  projectRoot?: string,
  options?: SelfAuditGateOptions,
): Promise<SelfAuditResult> {
  const root = projectRoot ?? process.cwd();

  // ── Step 1: tsc --noEmit (timeout 90s) ──────────────────────────
  let tscResult: SelfAuditResult['tsc'];
  try {
    const tscRun = options?.runTsc
      ? options.runTsc(root)
      : spawnSync('npx', ['tsc', '--noEmit'], {
          cwd: root,
          timeout: 30_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
        });

    if (tscRun.status === 0) {
      tscResult = { status: 'PASS', errors: [] };
    } else {
      const output = ((tscRun.stdout ?? '') + (tscRun.stderr ?? '')).trim();
      const errors = output
        .split('\n')
        .filter(line => line.includes('error TS'))
        .slice(0, 20);
      tscResult = { status: 'FAIL', errors };
    }
  } catch (e) {
    tscResult = { status: 'FAIL', errors: [`tsc execution failed: ${e}`] };
  }
  debugLog('runSelfAuditGate:tsc', `status=${tscResult.status} errors=${tscResult.errors.length}`);

  // ── Step 2: vitest run (timeout 300s) + baseline delta ──────────
  let vitestResult: SelfAuditResult['vitest'];
  try {
    const vitestRun = options?.runVitest
      ? options.runVitest(root)
      : spawnSync('npx', ['vitest', 'run', '--reporter=basic'], {
          cwd: root,
          timeout: 120_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
        });

    const vitestOutput = ((vitestRun.stdout ?? '') + (vitestRun.stderr ?? '')).trim();
    const current = parseVitestOutput(vitestOutput);

    // Read pre-sprint baseline for delta calculation
    const baseline = readBaseline(root, sprintId);

    if (vitestRun.status === 0 || (current && current.fail === 0)) {
      const delta = baseline && current
        ? {
            files: current.files - baseline.files,
            pass: current.pass - baseline.pass,
            fail: current.fail - baseline.fail,
            skipped: current.skipped - baseline.skipped,
          }
        : { files: 0, pass: 0, fail: 0, skipped: 0 };
      vitestResult = { status: 'PASS', delta };
    } else {
      const delta = baseline && current
        ? {
            files: current.files - baseline.files,
            pass: current.pass - baseline.pass,
            fail: current.fail - baseline.fail,
            skipped: current.skipped - baseline.skipped,
          }
        : { files: 0, pass: 0, fail: current?.fail ?? 0, skipped: 0 };
      vitestResult = { status: 'FAIL', delta };
    }
  } catch (e) {
    vitestResult = { status: 'FAIL', delta: { files: 0, pass: 0, fail: 0, skipped: 0 } };
    debugLog('runSelfAuditGate:vitest', `execution failed: ${e}`);
  }
  debugLog('runSelfAuditGate:vitest', `status=${vitestResult.status} delta.fail=${vitestResult.delta.fail}`);

  // ── Step 3: Honesty violations ──────────────────────────────────
  let honestyResult: SelfAuditResult['honesty'];
  if (options?.honestyResults) {
    const violations = options.honestyResults.filter(r => r.violation);
    honestyResult = {
      violations: violations.length,
      flaggedTasks: violations.map(r => r.taskId),
    };
  } else {
    const flaggedTasks: string[] = [];
    try {
      const tasksDir = join(root, '.tasks');
      // Async readdir — Sprint 139 async migration
      const tasksDirFiles = await fsPromises.readdir(tasksDir).catch(() => [] as string[]);
      const resultFiles = tasksDirFiles.filter(f => f.endsWith('.result'));
      for (const file of resultFiles) {
        try {
          // Async readFile — Sprint 139 async migration
          const raw = await fsPromises.readFile(join(tasksDir, file), 'utf-8');
          const result = JSON.parse(raw) as { taskId?: string; notes?: string };
          if (result.notes && containsHonestyTrigger(result.notes)) {
            const taskBaseline = readBaseline(root, sprintId);
            if (taskBaseline) {
              const currentCapture = await captureVitestBaseline(root, 180_000);
              if (currentCapture && currentCapture.fail > taskBaseline.fail) {
                flaggedTasks.push(result.taskId ?? file);
              }
            }
          }
        } catch { /* skip unparseable result files */ }
      }
    } catch (e) {
      debugLog('runSelfAuditGate:honesty', `scan failed: ${e}`);
    }
    honestyResult = {
      violations: flaggedTasks.length,
      flaggedTasks,
    };
  }
  debugLog('runSelfAuditGate:honesty', `violations=${honestyResult.violations}`);

  // ── Step 4: Observability — metrics.jsonl check (async) ─────────
  const metricsPath = options?.metricsJsonlPath ?? join(root, '.deckent', 'metrics.jsonl');
  let observabilityResult: SelfAuditResult['observability'];
  // Async readFile — Sprint 139 async migration (replaces existsSync + readFileSync)
  try {
    const content = await fsPromises.readFile(metricsPath, 'utf-8');
    const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;
    observabilityResult = { metricsJsonlExists: true, lineCount };
  } catch {
    observabilityResult = { metricsJsonlExists: false, lineCount: 0 };
    debugLog('runSelfAuditGate:observability', 'WARNING: metrics.jsonl not found');
  }

  // ── Overall Gate Decision ───────────────────────────────────────
  const overallGate: 'PASS' | 'GATE_FAILURE' =
    tscResult.status === 'FAIL' ||
    vitestResult.status === 'FAIL' ||
    honestyResult.violations > 0
      ? 'GATE_FAILURE'
      : 'PASS';

  debugLog('runSelfAuditGate', `overallGate=${overallGate} sprint=${sprintId}`);

  return {
    tsc: tscResult,
    vitest: vitestResult,
    honesty: honestyResult,
    observability: observabilityResult,
    overallGate,
  };
}


// ═══ Gate Status Propagation ══════════════════════════════════════

/**
 * Apply self-audit gate result to sprint status.
 * If gate fails (GATE_FAILURE), overrides currentStatus with GO_WITH_GATE_FAILURE.
 * PASS and WARNING gates leave status unchanged.
 */
export function applyGateStatus(currentStatus: string, gate: Pick<SelfAuditResult, 'overallGate'>): string {
  if (gate.overallGate === 'GATE_FAILURE') {
    return GO_WITH_GATE_FAILURE;
  }
  return currentStatus;
}


// ═══ Adaptive Thresholds ══════════════════════════════════════════

/**
 * Pure helper for the coverage aspirational auto-learn step (Sprint 179 W2-4).
 *
 * Returns the new aspirational coverage target given the current target,
 * the immutable hard floor, and recent avg coverage. The hard floor is
 * never mutated — the result is always clamped at `>= hardFloor`.
 *
 * Lowering rule (mirrors pre-split behavior): when avg coverage drops
 * below 70 and is positive, lower aspirational to round(avg). Otherwise
 * no change. The clamp prevents the EVALUATE gate from ever sliding
 * below `hardFloor`.
 */
export function computeAdjustedAspirational(input: {
  currentAspirational: number;
  hardFloor: number;
  avgCoverage: number;
}): { newAspirational: number; changed: boolean } {
  const { currentAspirational, hardFloor, avgCoverage } = input;
  if (avgCoverage <= 0 || avgCoverage >= 70) {
    return { newAspirational: currentAspirational, changed: false };
  }
  const proposed = Math.round(avgCoverage);
  const clamped = Math.max(proposed, hardFloor);
  return {
    newAspirational: clamped,
    changed: clamped !== currentAspirational,
  };
}

/**
 * Auto-adjust agent_min_score and coverage_aspirational based on recent sprint stats.
 * Reads .brain/sprints/ files, computes NO_GO rate and avg coverage,
 * then writes updated values to .deckent/config.json and appends a note to RETRO.md.
 *
 * Rules:
 * - NO_GO rate > no_go_threshold → agent_min_score decremented (min 1)
 * - NO_GO rate < 10% → agent_min_score incremented (max 10)
 * - avg coverage < 70% → coverage_aspirational lowered to avg (clamped at coverage_hard_floor)
 * - coverage_hard_floor is immutable; auto-learn never touches it
 * - Requires min_samples sprints before any adjustment
 */
export async function applyAdaptiveThresholds(projectRoot: string, config: ResolvedConfig, sprintId?: string): Promise<void> {
  const ac = config.adaptive_config;
  const stats = await getRecentSprintStats(projectRoot, ac.coverage_lookback);

  if (stats.sprintCount < ac.min_samples) {
    debugLog('applyAdaptiveThresholds', `Not enough sprints (${stats.sprintCount}/${ac.min_samples}) — skipping`);
    return;
  }

  const changes: string[] = [];
  const configPath = join(projectRoot, '.deckent', 'config.json');
  // Async config read — Sprint 139 async migration
  const rawCfg: Record<string, unknown> = await (async () => {
    try {
      return JSON.parse(await fsPromises.readFile(configPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  // Adjust agent_min_score based on NO_GO rate
  const currentScore = config.agent_min_score;
  let newScore = currentScore;
  if (stats.avgNoGoRate > ac.no_go_threshold && currentScore > 1) {
    newScore = currentScore - 1;
  } else if (stats.avgNoGoRate < 0.1 && currentScore < 10) {
    newScore = currentScore + 1;
  }
  if (newScore !== currentScore) {
    rawCfg['agent_min_score'] = newScore;
    changes.push(`agent_min_score ${currentScore} => ${newScore} (NO_GO rate: ${(stats.avgNoGoRate * 100).toFixed(1)}%)`);
    debugLog('applyAdaptiveThresholds', changes.at(-1));
  }

  // Adjust coverage_aspirational based on avg coverage — Sprint 179 W2-4.
  // The hard floor (immutable EVALUATE gate) is never written; the helper
  // clamps the new aspirational to `>= hard_floor`.
  // Defensive defaults: config-types marks both fields optional on
  // ResolvedConfig and instructs consumers to `?? <default>` (50 / 90).
  const currentAspirational = config.coverage_aspirational ?? 90;
  const hardFloor = config.coverage_hard_floor ?? 50;
  const adjustment = computeAdjustedAspirational({
    currentAspirational,
    hardFloor,
    avgCoverage: stats.avgCoverage,
  });
  if (adjustment.changed) {
    rawCfg['coverage_aspirational'] = adjustment.newAspirational;
    // Mirror to the legacy field so unmigrated consumers stay in sync.
    rawCfg['coverage_threshold'] = adjustment.newAspirational;
    changes.push(
      `coverage_aspirational ${currentAspirational} => ${adjustment.newAspirational} ` +
      `(avg coverage: ${stats.avgCoverage.toFixed(1)}%, hard_floor: ${hardFloor})`,
    );
    debugLog('applyAdaptiveThresholds', changes.at(-1));
  }

  if (changes.length === 0) return;

  // Async write updated config — Sprint 139 async migration
  await fsPromises.writeFile(configPath, JSON.stringify(rawCfg, null, 2) + '\n');

  // Append adaptive-threshold notes to the sprint retro entry — B8 (DB-first).
  if (sprintId) {
    const adaptiveSection = '\n### Adaptive Threshold Changes\n'
      + changes.map(c => `- Adaptive: ${c}`).join('\n') + '\n';
    appendRetroSection(projectRoot, sprintId, '### Adaptive Threshold Changes', adaptiveSection);
  }
}


// ═══ Budgeted Decay (mode-independent) ════════════════════════════

/**
 * CORE-UNIFORMITY (slice 2): mode-independent budgeted brain-memory decay.
 *
 * Extracted from finalizeSprint so BOTH the sprint lifecycle AND the autonomous
 * per-item lifecycle (execute-dispatcher's `postItemLifecycle`) share a single
 * decay path — sprint-coupling resolved. Audits the brain budget; when OVER it
 * forces a decay, otherwise runs the normal (budget-gated) decay.
 *
 * Self-contained + fail-safe: never throws (errors are debug-logged and swallowed),
 * so callers can invoke it inline without guarding. Behavior is identical to the
 * former inline finalizeSprint block; only the debug label differs.
 *
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint id (used for retention-window math in runDecay)
 * @param opts.memoryBudget - Brain memory budget in entries/lines (default 900)
 * @param opts.decaySprints - Retention window; MUST be the caller's
 *   `config.decay_after_sprints` (default 20). Dropping it regresses the Sprint 232
 *   memory-loss bug (runDecay silently falls back to a hardcoded 8).
 */
export function runBudgetedDecay(
  projectRoot: string,
  sprintId: string,
  opts?: { memoryBudget?: number; decaySprints?: number },
): void {
  try {
    const memBudget = opts?.memoryBudget ?? 900;
    const decayAfterSprints = opts?.decaySprints;
    const budgetAudit = auditBrainBudget(projectRoot, memBudget);
    if (budgetAudit.status === 'OVER') {
      debugLog('runBudgetedDecay', `Brain budget OVER: ${budgetAudit.decayableLines} decayable lines > ${memBudget} budget (${budgetAudit.permanentLines} permanent exempt, decay_after_sprints=${decayAfterSprints ?? 'default'})`);
      runDecay(projectRoot, sprintId, { force: true, memoryBudget: memBudget, decaySprints: decayAfterSprints });
    } else {
      runDecay(projectRoot, sprintId, { memoryBudget: memBudget, decaySprints: decayAfterSprints });
    }
  } catch (e) { debugLog('runBudgetedDecay', e); }
}

/**
 * ADR-090 doc-tracking sync hook. Gated on config.doc_tracking.sync_on_finalize
 * (default OFF — no surprise overhead). DB-only (no front-matter writes).
 * Fail-safe: any error is swallowed (debugLog) so it can never break finalize.
 */
export async function maybeRunDocTrackingSync(
  projectRoot: string,
  config: { doc_tracking?: { sync_on_finalize?: boolean } } | undefined,
): Promise<{ ran: boolean; count?: number }> {
  if (config?.doc_tracking?.sync_on_finalize !== true) return { ran: false };
  try {
    const { count } = await runDocTrackingSync(projectRoot);
    return { ran: true, count };
  } catch (e) {
    debugLog('finalizeSprint:docTrackingSync', e);
    return { ran: true };
  }
}


// ═══ Finalize Sprint ══════════════════════════════════════════════

/**
 * Run ALL post-sprint finalization actions. This function is idempotent-safe:
 * calling it multiple times with the same data won't corrupt state (MEMORY.md
 * may get duplicate entries if sprint learnings already exist, but trimming
 * keeps it within budget).
 *
 * Actions performed:
 * 1. Calculate metrics from evaluations + results
 * 2. Write sprint log to .brain/sprints/sprint-NNN.md
 * 3. Update MEMORY.md with sprint learnings (trimMemoryWithHeader)
 * 4. Write RETRO.md (writeRetrospective)
 * 5. (Legacy removed) Identity file write dropped in Memory V2 — identity is now DB-first,
 *    surfaced via managed .deckent/workspace/IDENTITY.md (ADR-046, B6).
 * 6. Update last_sprint_id in .deckent/config.json
 * 7. Run decay if over budget
 * 8. Run afterSprint plugin hooks
 * 9. Update project docs (doc-updaters registry)
 *
 * @param projectRoot - Project root directory
 * @param sprint - The completed sprint (must have tasks populated)
 * @param evaluations - Map of task ID to evaluation result
 * @param results - Array of worker task results
 * @param opts - Optional finalization settings
 * @returns The computed sprint metrics
 */
export async function finalizeSprint(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  opts?: FinalizeSprintOptions,
): Promise<SprintMetrics> {
  // Ensure observability is initialized (idempotent — safe to call multiple times)
  initObservability(projectRoot);

  // ─── SPRINT_PHASE_CHANGE: EXECUTE → EVALUATE ────────────────────
  // Brain broadcasts faz geçişini event stream'e yazar.
  // Tüm consumer'lar (auditor, dashboard, CLI) bu event'i okuyarak
  // sprint'in EVALUATE fazına girdiğini anlar (ADR-035 broadcast kanalı).
  const sprintIdForEvents = getCurrentSprintId(projectRoot) ?? sprint.id;
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.SPRINT_PHASE_CHANGE,
    { fromPhase: 'EXECUTE', toPhase: 'EVALUATE', sprintId: sprint.id, timestamp: new Date().toISOString() },
  );

  // Build O(1) lookup index from results array — eliminates O(n²) linear scans
  const resultsMap = buildResultsMap(results);

  // 0. Code-aware evaluation reconciliation (Sprint 136)
  // Check NO_GO tasks for the "Docker worker exited without writing result" pattern
  // and physically verify code on disk before finalizing the evaluation.
  const codeVerifiedTasks: string[] = [];
  for (const [taskId, evaluation] of evaluations) {
    if (evaluation !== TaskEvaluation.NO_GO) continue;
    try {
      const verifyResult = await tryCodeVerifiedDone(taskId, projectRoot);
      if (verifyResult.triggered && verifyResult.verified) {
        // Rewrite the evaluation to DONE
        evaluations.set(taskId, TaskEvaluation.DONE);
        // Write a proper result file
        await writeCodeVerifiedResult(taskId, projectRoot, verifyResult);
        // Update results array with synthetic result
        const existingIdx = results.findIndex(r => r.taskId === taskId);
        const syntheticResult = {
          taskId,
          workerId: 'brain-reconcile',
          filesChanged: verifyResult.verifiedFiles,
          linesAdded: 0,
          linesRemoved: 0,
          testsPassed: false,
          coverage: 0,
          selfAssessment: 'DONE' as const,
          notes: verifyResult.reason,
        };
        if (existingIdx >= 0) {
          results[existingIdx] = syntheticResult;
        } else {
          results.push(syntheticResult);
        }
        // Update resultsMap
        resultsMap.set(taskId, syntheticResult);
        codeVerifiedTasks.push(taskId);
        debugLog('finalizeSprint:codeReconcile', `Task ${taskId} reconciled to CODE_VERIFIED_DONE`);
      }
    } catch (e) {
      debugLog('finalizeSprint:codeReconcile', `Reconciliation failed for ${taskId}: ${e}`);
    }
  }
  if (codeVerifiedTasks.length > 0) {
    debugLog('finalizeSprint:codeReconcile', `${codeVerifiedTasks.length} tasks reconciled: ${codeVerifiedTasks.join(', ')}`);
  }

  // 1. Calculate metrics — tech debt is read DB-first (Task #4d).
  const freshDebt = getDebtItems(projectRoot);
  const metrics = calculateMetrics(sprint, evaluations, results, freshDebt);
  sprint.metrics = metrics;

  // ─── METRIC_EMITTED: sprint summary metrics ──────────────────────
  // Emitted in parallel with metrics.jsonl so Auditor and Dashboard
  // get structured metric data without parsing the JSONL file.
  // ADR-035: BRAIN→*:METRIC_EMITTED is a broadcast channel.
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.METRIC_EMITTED,
    {
      name: 'sprint.summary',
      sprintId: sprint.id,
      totalTasks: metrics.totalTasks,
      completedTasks: metrics.completedTasks,
      techDebtTasks: metrics.techDebtTasks,
      noGoTasks: metrics.noGoTasks,
      durationMs: metrics.durationMs,
      coveragePercent: metrics.coveragePercent,
    },
  );

  // 2. Write sprint log
  try {
    writeSprintLog(projectRoot, sprint, metrics, evaluations);
  } catch (e) { debugLog('finalizeSprint:writeSprintLog', e); }

  // ─── SPRINT_PHASE_CHANGE: EVALUATE → RETRO ──────────────────────
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.SPRINT_PHASE_CHANGE,
    { fromPhase: 'EVALUATE', toPhase: 'RETRO', sprintId: sprint.id, timestamp: new Date().toISOString() },
  );

  // 3 + 4. Write RETRO.md and update MEMORY.md (writeRetrospective does both)
  // ─── ADR-046 Step 5 — retroWriter (dual write contract) ─────────
  // Sprint 168 C0a-3 (BUG-DD + BUG-EE): writeRetrospective MUST emit
  // both DB rows (`sprint-log-NNN`, `retro-sprint-NNN`, `mem-sprint-NNN`)
  // and `.brain/RETRO.md` in a single invocation. Pinned by
  // tests/orchestra/retro-dual-write.test.ts. Do NOT split the call
  // (Sprint 167 regression — DB+FS came out of sync when the wire was
  // partial). Unconditional invocation per ADR-046 §"Mimari Prensipler".
  debugLog('finalizeSprint:preRetro', `evaluations.size=${evaluations.size} keys=[${[...evaluations.keys()].join(',')}]`);
  let sprintLogPersisted = false;
  try {
    // Build skillMap from tasks for Skill Performance table in RETRO.md
    const skillMap = new Map<string, string[]>();
    for (const task of sprint.tasks) {
      if (task.assignedSkills && task.assignedSkills.length > 0) {
        skillMap.set(task.id, task.assignedSkills);
      }
    }
    // Sprint 192 Task 192-005: opt into createIfMissing so the chronic
    // Sprint 167+ DB-gap [[project_sprint167_db_gap]] cannot recur — even
    // a first-ever sprint on a fresh project now lands sprint-log + retro
    // + mem rows.
    const retroWriteResult = writeRetrospective(
      projectRoot, sprint, evaluations, metrics,
      undefined,
      skillMap.size > 0 ? skillMap : undefined,
      results,
      { createIfMissing: true },
    );
    sprintLogPersisted = retroWriteResult.sprintLogWritten;
    // Sprint 190 carry-over [[project_sprint189_retro_db_missing]]:
    // surface DB-write outcome so silent failures (Sprint 189 retro entry
    // missing while patterns landed) cannot recur unnoticed. Non-fatal.
    if (retroWriteResult.dbError) {
      debugLog('finalizeSprint:writeRetrospective:dbWrite',
        `Retro DB write failed for ${sprint.id} — ${retroWriteResult.dbError}`);
    } else if (retroWriteResult.dbAttempted &&
        (!retroWriteResult.sprintLogWritten || !retroWriteResult.retroWritten || !retroWriteResult.memoryWritten)) {
      debugLog('finalizeSprint:writeRetrospective:dbPartial',
        `Retro DB write partial for ${sprint.id} — sprintLog=${retroWriteResult.sprintLogWritten} ` +
        `retro=${retroWriteResult.retroWritten} memory=${retroWriteResult.memoryWritten}`);
    } else {
      debugLog('finalizeSprint:writeRetrospective:dbOk',
        `Retro DB rows persisted for ${sprint.id}`);
    }

    // Append Code-Verified DONE section to the retro entry — B8 (DB-first).
    if (codeVerifiedTasks.length > 0) {
      const section = [
        '',
        '### Code-Verified DONE',
        `${codeVerifiedTasks.length} task(s) reconciled via physical code verification:`,
        ...codeVerifiedTasks.map(id => `- ${id}: Code physically verified despite missing .result (docker HB shutdown pattern)`),
        '',
      ].join('\n');
      appendRetroSection(projectRoot, sprint.id, '### Code-Verified DONE', section);
    }
  } catch (e) { debugLog('finalizeSprint:writeRetrospective', e); }

  // ─── F1-TOK 273-004 retro wire — "Limit burn" row ────────────────
  // buildLimitBurnRow shipped + tested in Sprint 273 but was never called
  // from the retro path (0-caller dormant; found in the 2026-06-11
  // calibration analysis). Best-effort: ledger/transcript errors must
  // never block finalize.
  try {
    const limitBurnRow = await buildSprintLimitBurnRow(projectRoot, sprint.id, sprint.tasks.length);
    if (limitBurnRow) {
      const section = ['', '### Limit Burn', '', limitBurnRow, ''].join('\n');
      appendRetroSection(projectRoot, sprint.id, '### Limit Burn', section);
    }
  } catch (e) { debugLog('finalizeSprint:limitBurnRow', e); }

  // Sprint 198 198-002 defensive fallback — guarantees a sprint-log DB
  // row even when writeRetrospective threw or its own try/catch returned
  // with sprintLogWritten=false. Closes the chronic finalize bug
  // surfaced in Sprint 197 197-002 (sprint-log-194 + sprint-log-196
  // missing). Minimal payload (sprintId + totalTasks + durationMs) is
  // enough for downstream retroactive reclassify to land a Task
  // Outcomes section in a future pass; full content is preferred but
  // optional. Silent failures are forbidden — log the error explicitly.
  if (!sprintLogPersisted) {
    try {
      const { MemoryStore } = await import('../core/memory-store.js');
      const { MEMORY_DB_FILE } = await import('../core/constants.js');
      const memDbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
      if (existsSync(memDbPath)) {
        const store = new MemoryStore(memDbPath);
        try {
          store.upsertSprintLog(sprint.id, {
            totalTasks: metrics?.totalTasks,
            durationMs: metrics?.durationMs,
            extraTags: ['defensive-fallback'],
          });
          sprintLogPersisted = true;
          debugLog('finalizeSprint:sprintLogFallback',
            `Defensive sprint-log row written for ${sprint.id}`);
        } finally {
          store.close();
        }
      } else {
        debugLog('finalizeSprint:sprintLogFallback',
          `memory.db missing at ${memDbPath} — fallback skipped`);
      }
    } catch (e) {
      debugLog('finalizeSprint:sprintLogFallback',
        `Defensive sprint-log write failed for ${sprint.id} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5. Legacy identity-file write dropped — Memory V2, B6.
  // Identity is DB-first: the memory.db `identity` entry is the source of
  // truth, surfaced via the managed .deckent/workspace/IDENTITY.md doc.

  // 5b. Triple-link: sprint-log → memory → retro (depends_on chain)
  try {
    const { MemoryStore } = await import('../core/memory-store.js');
    const { MEMORY_DB_FILE } = await import('../core/constants.js');
    const memDbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
    if (existsSync(memDbPath)) {
      const memStore = new MemoryStore(memDbPath);
      try {
        const sprintLogId = `sprint-log-${sprint.id}`;
        const memoryId = `memory-${sprint.id}`;
        const retroId = `retro-${sprint.id}`;

        // sprint-log depends_on memory, memory depends_on retro
        memStore.insertRelation(sprintLogId, memoryId, 'depends_on');
        memStore.insertRelation(memoryId, retroId, 'depends_on');
        // retro references sprint-log (circular awareness)
        memStore.insertRelation(retroId, sprintLogId, 'references');

        debugLog('finalizeSprint:tripleLink', `Triple-link created for ${sprint.id}`);
      } finally {
        memStore.close();
      }
    }
  } catch (e) { debugLog('finalizeSprint:tripleLink', e); }

  // 6. Update last_sprint_id in config
  try {
    updateLastSprintId(projectRoot, sprint.id);
  } catch (e) { debugLog('finalizeSprint:updateLastSprintId', e); }

  // 7. Run decay if over budget (uses auditBrainBudget for decayable-only accounting)
  // Sprint 232 PRIMARY fix: pass config.decay_after_sprints to runDecay so the
  // user-configured retention window (default 20) is honored. Previously the
  // option was dropped and runDecay fell back to a hardcoded 8 — too aggressive,
  // causing memory-loss across sprint-226/231 dogfood.
  if (!opts?.skipDecay) {
    // CORE-UNIFORMITY (slice 2): decay now flows through the mode-independent
    // runBudgetedDecay helper (shared with the autonomous per-item lifecycle).
    // Behavior unchanged — same audit → force/normal branching as before.
    runBudgetedDecay(projectRoot, sprint.id, {
      memoryBudget: opts?.config?.memory_budget ?? 900,
      decaySprints: opts?.config?.decay_after_sprints,
    });
  }

  // 7b. ADR-090 doc-tracking sync (gated, fail-safe — never breaks finalize)
  debugLog('finalizeSprint:breadcrumb', 'doc-tracking sync hook — entering');
  try {
    const dtRes = await maybeRunDocTrackingSync(projectRoot, opts?.config);
    if (dtRes.ran) debugLog('finalizeSprint:docTrackingSync', `synced ${dtRes.count ?? '?'} docs`);
  } catch (e) { debugLog('finalizeSprint:docTrackingSync', e); }

  // 8. Run afterSprint plugin hooks
  if (!opts?.skipHooks) {
    try {
      const ctx: AfterSprintContext = {
        hook: 'afterSprint',
        sprint,
        projectRoot,
      };
      await runHooks('afterSprint', ctx);
    } catch (e) { debugLog('finalizeSprint:afterSprintHook', e); }
  }

  // 8b. Update agent/skill stats
  const routingVersion = (opts?.config as Record<string, unknown> | undefined)?.['routing_engine'] as string | undefined;

  if (routingVersion !== 'v2') {
    // V1: Write stats directly to agent.json and skill manifest files (legacy behavior)
    try {
      const poolManager = new AgentPoolManager(projectRoot);
      const skillPoolManager = new SkillPoolManager(projectRoot);

      // FINALIZE-RECOUNT guard (Sprint 268, 1b): updateAgentStats /
      // updateSkillStats stamp stats.lastUsedInSprint = sprint.id on first
      // record, so an entity already carrying this sprint's stamp was
      // recorded by an EARLIER finalize of the SAME sprint (re-finalize via
      // `finalize --force`) and must not be double-counted (sprint-267 live
      // bug: uses+N, success+0). Snapshot the markers BEFORE the update loop:
      // an agent/skill serving multiple tasks in THIS run stamps itself on
      // its first task, and the pre-scan keeps its remaining tasks counting.
      const agentsAlreadyRecorded = new Set<string>();
      const skillsAlreadyRecorded = new Set<string>();
      for (const task of sprint.tasks) {
        const aId = task.assignedAgent;
        if (aId && !agentsAlreadyRecorded.has(aId)
            && poolManager.getAgent(aId)?.stats?.lastUsedInSprint === sprint.id) {
          agentsAlreadyRecorded.add(aId);
        }
        for (const sId of task.assignedSkills ?? []) {
          if (!skillsAlreadyRecorded.has(sId)
              && skillPoolManager.getSkill(sId)?.stats?.lastUsedInSprint === sprint.id) {
            skillsAlreadyRecorded.add(sId);
          }
        }
      }
      if (agentsAlreadyRecorded.size > 0 || skillsAlreadyRecorded.size > 0) {
        debugLog('finalizeSprint:updateAgentSkillStats',
          `Re-finalize of ${sprint.id} — skipping already-recorded stats for ` +
          `${agentsAlreadyRecorded.size} agent(s), ${skillsAlreadyRecorded.size} skill(s)`);
      }

      for (const task of sprint.tasks) {
        const evaluation = evaluations.get(task.id);
        if (!evaluation) continue;
        // Sprint 192 Task 192-010: DEFERRED tasks were never dispatched —
        // agent stats must not be updated (worker did not execute).
        if (evaluation === TaskEvaluation.DEFERRED) continue;
        const taskResult = resultsMap.get(task.id);
        const coverage = taskResult?.coverage ?? 0;

        // Update agent stats
        const agentId = task.assignedAgent;
        if (agentId && !agentsAlreadyRecorded.has(agentId)) {
          poolManager.updateAgentStats(agentId, evaluation, coverage, sprint.id);
        }

        // Update skill stats
        if (task.assignedSkills) {
          for (const skillId of task.assignedSkills) {
            if (skillsAlreadyRecorded.has(skillId)) continue;
            skillPoolManager.updateSkillStats(skillId, evaluation, coverage, sprint.id);
          }
        }
      }
    } catch (e) { debugLog('finalizeSprint:updateAgentSkillStats', e); }
  } else {
    // V2: Record outcomes to learnings.json (single source of truth)
    // Agent.json manifests are NOT touched — stats live in learnings.json only
    try {
      const { OutcomeTracker } = await import('./outcome-tracker.js');
      const { assessQuality } = await import('./quality-assessor.js');
      const tracker = new OutcomeTracker(projectRoot);

      // FINALIZE-RECOUNT guard (Sprint 268, 1b): recordOutcome appends
      // sprint.id to learnings.recentSprints on the first record and that
      // list is append-only — its presence is a durable "stats already
      // recorded for this sprint" marker. A re-finalize (`finalize --force`
      // on an already-finalized sprint) must NOT re-record: the sprint-267
      // live bug re-counted every task (uses+N) while archived results read
      // as missing/NO_GO (success+0). Corrections to a recorded sprint go
      // through tracker.reclassifyTaskOutcome instead of double-recording.
      // The downstream steps (rule evolution, manifest sync, promotions)
      // still run — they derive from accumulated learnings and are
      // idempotent on unchanged data.
      const statsAlreadyRecorded = tracker.getLearnings().recentSprints.includes(sprint.id);
      if (statsAlreadyRecorded) {
        debugLog('finalizeSprint:routing-outcomes',
          `Stats already recorded for ${sprint.id} — skipping re-record (idempotent re-finalize)`);
      } else {
        for (const task of sprint.tasks) {
          const evaluation = evaluations.get(task.id);
          if (!evaluation) continue;
          const taskResult = resultsMap.get(task.id);

          // Quality assessment — multi-dimensional scoring beyond GO/NO_GO
          let qualityScore: number | undefined;
          if (taskResult) {
            try {
              const quality = assessQuality(task, taskResult, evaluation as unknown as string);
              qualityScore = quality.overall;
            } catch (e) { debugLog('finalizeSprint:assessQuality', e); }
          }

          tracker.recordOutcome({
            taskId: task.id,
            sprintId: sprint.id,
            taskDNA: (task.routingMeta?.taskDNA ?? { intent: { primary: 'unknown', secondary: [], confidence: 0 }, domains: [], operations: [], complexity: { fileCount: 0, moduleCount: 0, crossCutting: false, estimatedSize: 'small' }, scope: { writeRatio: {}, primaryWriteTarget: '', testWriteRatio: 0 } }) as TaskDNA,
            agentId: task.assignedAgent ?? null,
            skillIds: task.assignedSkills ?? [],
            evaluation: evaluation as unknown as 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO',
            coverage: taskResult?.coverage ?? 0,
            qualityScore,
            routingVersion: 'v2',
          });
        }
        debugLog('finalizeSprint:routing-outcomes', `Recorded ${sprint.tasks.length} routing outcomes to learnings.json`);
      }

      // 8d. Evolve routing rules from accumulated data
      try {
        const { RuleEvolver } = await import('./rule-evolver.js');
        const evolver = new RuleEvolver(tracker, projectRoot);
        const evolution = evolver.evolveRules();
        if (evolution.newRules.length > 0) {
          debugLog('finalizeSprint:rule-evolution', `${evolution.newRules.length} new rules evolved`);
          // Persist evolved rules in learnings AND standalone file
          tracker.saveEvolvedRules(evolution.newRules);
          evolver.saveRules(evolution.newRules);
        }
      } catch (e) { debugLog('finalizeSprint:ruleEvolution', e); }

      // 8d2. Sync V2 learnings → agent.json / manifest.json (so Dashboard/CLI see real stats)
      try {
        const poolManager = new AgentPoolManager(projectRoot);
        const skillPoolManager = new SkillPoolManager(projectRoot);
        const learnings = tracker.getLearnings();

        for (const [agentId, perf] of Object.entries(learnings.agentPerformance)) {
          // Compute average coverage from task results for this agent
          const agentTasks = sprint.tasks.filter(t => t.assignedAgent === agentId);
          let avgCov = 0;
          if (agentTasks.length > 0) {
            const totalCov = agentTasks.reduce((sum, t) => {
              const r = resultsMap.get(t.id);
              return sum + (r?.coverage ?? 0);
            }, 0);
            avgCov = totalCov / agentTasks.length;
          }

          // Build cumulative stats from learnings performance data
          const agent = poolManager.getAgent(agentId);
          if (agent) {
            const stats = agent.stats ?? { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' };
            stats.totalUses = perf.totalTasks;
            stats.successRate = perf.successRate;
            // Blend historical avg coverage with current sprint coverage
            if (avgCov > 0 && agentTasks.length > 0) {
              const prevTotal = stats.totalUses - agentTasks.length;
              stats.avgCoverage = prevTotal > 0
                ? ((stats.avgCoverage * prevTotal) + (avgCov * agentTasks.length)) / stats.totalUses
                : avgCov;
            }
            stats.lastUsedInSprint = sprint.id;
            agent.stats = stats;
            poolManager.saveAgent(agent);
          }
        }

        for (const [skillId, perf] of Object.entries(learnings.skillPerformance)) {
          const skill = skillPoolManager.getSkill(skillId);
          if (skill) {
            const stats = skill.stats ?? { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '', successCount: 0 };
            stats.totalUses = perf.totalTasks;
            stats.successRate = perf.successRate;
            stats.successCount = perf.successCount;
            stats.lastUsedInSprint = sprint.id;
            skill.stats = stats;
            skillPoolManager.saveSkill(skill);
          }
        }

        debugLog('finalizeSprint:syncStatsToManifests', `Synced ${Object.keys(learnings.agentPerformance).length} agents, ${Object.keys(learnings.skillPerformance).length} skills to manifest files`);
      } catch (e) { debugLog('finalizeSprint:syncStatsToManifests', e); }

      // 8e. Evaluate promotions/demotions
      try {
        const { PromotionPipeline } = await import('./promotion-pipeline.js');
        const pipeline = new PromotionPipeline(projectRoot);
        const promotions = pipeline.evaluatePromotions(tracker);
        const demotions = pipeline.evaluateDemotions(tracker);
        for (const p of promotions.filter(r => r.action === 'promote')) {
          debugLog('finalizeSprint:promotion', `${p.entityType} '${p.entityId}': ${p.reason}`);
          try {
            pipeline.promote(p.entityId, p.entityType);
          } catch (promoteErr) {
            debugLog('finalizeSprint:promotion', `Failed to promote ${p.entityType} '${p.entityId}': ${promoteErr}`);
          }
        }
        for (const d of demotions.filter(r => r.action === 'demote')) {
          debugLog('finalizeSprint:demotion', `${d.entityType} '${d.entityId}': ${d.reason}`);
          try {
            pipeline.demote(d.entityId, d.entityType);
          } catch (demoteErr) {
            debugLog('finalizeSprint:demotion', `Failed to demote ${d.entityType} '${d.entityId}': ${demoteErr}`);
          }
        }
      } catch (e) { debugLog('finalizeSprint:promotionDemotion', e); }
    } catch (err) {
      debugLog('finalizeSprint:v2-learning', `V2 learning pipeline failed: ${err}`);
    }
  }

  // 9. Update project docs
  if (opts?.config) {
    try {
      updateProjectDocs(projectRoot, { sprint, evaluations, metrics }, opts.config, results);
    } catch (e) { debugLog('finalizeSprint:updateProjectDocs', e); }
  }

  // 10. Rich output (non-fatal — sprint completes even if formatting fails)
  debugLog('finalizeSprint:breadcrumb', 'Step 10 (richOutput) — entering');
  try {
    const gitDiff = spawnSync('git', ['diff', '--stat', 'HEAD~1'], { encoding: 'utf-8', cwd: projectRoot }).stdout;
    // output_mode lives on DeckentConfig (raw), not ResolvedConfig — access via cast
    const rawConfig = opts?.config as Record<string, unknown> | undefined;
    const outputMode = (rawConfig?.['output_mode'] as string) ?? 'normal';
    const richInput = { id: sprint.id, number: sprint.number, tasks: sprint.tasks.map(t => ({ id: t.id, title: t.title })), metrics: sprint.metrics ? { ...sprint.metrics } : undefined };
    // Build agent performance data for the performance table
    const agentRows = buildAgentPerformance(sprint, evaluations, results);
    const agentPerf = agentRows.map(row => ({
      agentId: row.agent,
      totalTasks: row.tasks,
      doneTasks: row.done,
      successRate: row.tasks > 0 ? Math.round((row.done / row.tasks) * 100) : 0,
    }));
    // Extract learnings from evaluation results (task notes from results)
    const learnings = results
      .filter(r => r.notes && r.notes.trim().length > 0)
      .map(r => r.notes as string)
      .slice(0, 5);
    const richOutput = formatRichSprintSummary(
      richInput,
      evaluations,
      { gitDiff, agentPerf, learnings, outputMode: outputMode as 'quiet' | 'normal' | 'verbose' },
    );
    if (richOutput) console.log(richOutput);
  } catch (e) { debugLog('finalizeSprint:richOutput', e); }

  // 10b. Self-audit gate: run tsc + vitest + honesty checks, propagate status
  debugLog('finalizeSprint:breadcrumb', 'Step 10b (selfAuditGate) — entering');
  let gateResult: SelfAuditResult | null = null;
  try {
    gateResult = await runSelfAuditGate(sprint.id, projectRoot);
    debugLog('finalizeSprint:selfAuditGate', `Gate completed: overallGate=${gateResult.overallGate}`);
    const currentStatus = sprint.status ?? '';
    const newStatus = applyGateStatus(currentStatus, gateResult);
    if (newStatus !== currentStatus) {
      sprint.status = newStatus as Sprint['status'];
      debugLog('finalizeSprint:selfAuditGate', `Status updated: ${currentStatus} → ${newStatus}`);
    }
  } catch (e) {
    debugLog('finalizeSprint:selfAuditGate', `Gate check failed (will write fallback gate.json): ${e}`);
    // Produce a fallback gate result so gate.json is always written
    gateResult = {
      tsc: { status: 'FAIL', errors: [`Gate execution failed: ${e}`] },
      vitest: { status: 'FAIL', delta: { files: 0, pass: 0, fail: 0, skipped: 0 } },
      honesty: { violations: 0, flaggedTasks: [] },
      observability: { metricsJsonlExists: false, lineCount: 0 },
      overallGate: 'GATE_FAILURE',
    };
  }
  // Write gate.json to .deckent/recently-works/ — ALWAYS (even on gate failure or fallback).
  // Canonical location since the Sprint 150 de-scatter (gate/seq/events/pre-archive all live
  // under recently-works, managed by sprint-file-retention). Matches the `deckent audit`
  // CLI + MCP writers; the legacy `.deckent/` root path was outside retention (files piled up
  // un-pruned and invisible to listSprintFiles).
  try {
    const recentWorksDir = join(projectRoot, RECENT_WORKS_DIR);
    await fsPromises.mkdir(recentWorksDir, { recursive: true });
    const gatePath = join(recentWorksDir, `${sprint.id}-gate.json`);
    await fsPromises.writeFile(gatePath, JSON.stringify(gateResult, null, 2));
    debugLog('finalizeSprint:selfAuditGate', `Gate result written to ${gatePath} overallGate=${gateResult.overallGate}`);

    // ─── GATE_COMPUTED event (ADR-035 — AUDITOR→BRAIN:GATE_COMPUTED) ───
    // Brain emits on behalf of the self-audit gate (finalizeSprint is in-process auditor role).
    // Event stream source is 'auditor' to match ADR-037 authority matrix.
    writeEvent(
      projectRoot, sprintIdForEvents, 'auditor', 'brain',
      CHANNELS.GATE_COMPUTED,
      {
        sprintId: sprint.id,
        overallGate: gateResult.overallGate,
        tscStatus: gateResult.tsc.status,
        vitestFail: gateResult.vitest.delta.fail,
        vitestPass: gateResult.vitest.delta.pass,
        honestyViolations: gateResult.honesty.violations,
        observabilityOk: gateResult.observability.metricsJsonlExists,
      },
    );
  } catch (writeErr) {
    debugLog('finalizeSprint:selfAuditGate', `WARNING: Failed to write gate.json: ${writeErr}`);
  }
  // Append Gate Failure section to the retro entry if the gate failed — B8.
  if (gateResult.overallGate === 'GATE_FAILURE') {
    const errors: string[] = [];
    if (gateResult.tsc.status === 'FAIL') errors.push(...gateResult.tsc.errors.slice(0, 5));
    if (gateResult.vitest.status === 'FAIL') errors.push(`vitest: ${gateResult.vitest.delta.fail} failing tests`);
    if (gateResult.honesty.violations > 0) errors.push(`honesty violations: ${gateResult.honesty.flaggedTasks.join(', ')}`);
    const gateSection = [
      '',
      '### Gate Failure',
      `Self-audit gate failed for sprint ${sprint.id}. Status: ${GO_WITH_GATE_FAILURE}.`,
      '',
      ...errors.map(e => `- ${e}`),
    ].join('\n') + '\n';
    appendRetroSection(projectRoot, sprint.id, '### Gate Failure', gateSection);
  }

  // 10c. Generate load-test-report.md from metrics.jsonl (Sprint 135 N6 — Task 5)
  debugLog('finalizeSprint:breadcrumb', 'Step 10c (loadReport) — entering');
  try {
    const reportDir = join(projectRoot, 'docs', 'audits', sprint.id);
    await fsPromises.mkdir(reportDir, { recursive: true });
    const reportPath = join(reportDir, 'load-test-report.md');
    const report = await generateLoadReport(projectRoot);
    await fsPromises.writeFile(reportPath, report);
    debugLog('finalizeSprint:loadReport', `Load test report written to ${reportPath}`);

    // ─── LOAD_REPORT_WRITTEN event (ADR-035 — AUDITOR→BRAIN:LOAD_REPORT_WRITTEN) ─
    // Emitted after the report is successfully written to disk so consumers
    // know the file is ready to read without polling.
    writeEvent(
      projectRoot, sprintIdForEvents, 'auditor', 'brain',
      CHANNELS.LOAD_REPORT_WRITTEN,
      { sprintId: sprint.id, reportPath, timestamp: new Date().toISOString() },
    );
  } catch (e) { debugLog('finalizeSprint:loadReport', `WARNING: load_report_generation_failed: ${e}`); }

  debugLog('finalizeSprint:breadcrumb', 'Step 10c (loadReport) — done');

  // 10c2. Rotate metrics file (Sprint 150 T-030)
  debugLog('finalizeSprint:breadcrumb', 'Step 10c2 (metricsRotation) — entering');
  try {
    const rotationConfig: Partial<ObservabilityRotationConfig> = {
      ...(opts?.config?.observability?.rotation ?? {}),
    };
    const rotationResult = rotateMetricsFile(projectRoot, sprint.id, rotationConfig);
    if (rotationResult.rotated) {
      debugLog('finalizeSprint:metricsRotation',
        `Rotated ${rotationResult.originalSizeBytes} bytes → ${rotationResult.archivePath} ` +
        `(${rotationResult.archivedSizeBytes} bytes gzipped), pruned ${rotationResult.pruned.length} old archives`);
    }
  } catch (e) { debugLog('finalizeSprint:metricsRotation', `WARNING: metrics rotation failed: ${e}`); }
  debugLog('finalizeSprint:breadcrumb', 'Step 10c2 (metricsRotation) — done');

  // 10d. Regenerate features manifest (Sprint 150 Task 029 — Feature Manifest Canlılaştırma)
  debugLog('finalizeSprint:breadcrumb', 'Step 10d (featuresManifest) — entering');
  try {
    const syncScript = join(projectRoot, 'scripts', 'sync-manifest.mjs');
    if (existsSync(syncScript)) {
      const syncResult = spawnSync('node', [syncScript, '--root', projectRoot], {
        encoding: 'utf-8',
        timeout: 30000,
        cwd: projectRoot,
      });
      debugLog('finalizeSprint:featuresManifest', `Sync exit=${syncResult.status}: ${(syncResult.stdout || '').trim()}`);
    }
  } catch (e) { debugLog('finalizeSprint:featuresManifest', `WARNING: features manifest sync failed: ${e}`); }

  // 11. Adaptive thresholds: auto-adjust agent_min_score + coverage_threshold based on recent sprints
  if (opts?.config?.adaptive_thresholds) {
    try {
      await applyAdaptiveThresholds(projectRoot, opts.config, sprint.id);
    } catch (err) {
      debugLog('finalizeSprint:adaptive', `Adaptive threshold update failed: ${err}`);
    }
  }

  // 12. Archive DIRECTIVES.md — always archive copy; PRESERVE working DIRECTIVES.md by default.
  //
  // Sprint 168 C0a-4 (BUG-CC fix, Alperen Pre-Flight Step 16 Option B):
  //   - auto_archive_directives config flag default flipped: true → FALSE
  //   - Default: DIRECTIVES.md is PRESERVED (archive copy still always written)
  //   - Opt-in: `auto_archive_directives: true` restores legacy placeholder-overwrite
  //
  // Rationale: Sprint 167 BUG-CC live evidence — placeholder overwrite =
  // catastrophic sprint context loss. Conservative default (preserve) safer.
  // See ADR-046 Amendment (Sprint 168 C0a-4).
  debugLog('finalizeSprint:breadcrumb', 'Step 12 (archiveDirectives) — entering');
  try {
    const rawCfg = opts?.config as Record<string, unknown> | undefined;
    const autoArchive = rawCfg?.['auto_archive_directives'] ?? false;
    archiveDirectives(projectRoot, sprint.id, 'CLEANUP', { autoArchive: autoArchive === true });
  } catch (e) { debugLog('finalizeSprint:archiveDirectives', e); }

  // 12b. Archive orphan task files from .tasks/ to .brain/archive/sprint-NNN-tasks/
  // Guard: create pre-archive snapshot + preserve active (PENDING/EXECUTING) tasks
  debugLog('finalizeSprint:breadcrumb', 'Step 12b (archiveOrphanTasks) — entering');
  try {
    // Step 12b-i: Create pre-archive snapshot for rollback safety
    const snapshot = createPreArchiveSnapshot(projectRoot, sprint.id);
    if (snapshot) {
      debugLog('finalizeSprint:preArchiveSnapshot', `Snapshot created: ${snapshot.fileCount} files, hash=${snapshot.hash.slice(0, 12)}...`);
    }

    // Step 12b-ii: Classify tasks by status — only archive terminal (DONE/NO_GO)
    const tasksDir = join(projectRoot, '.tasks');
    const sprintMatch = sprint.id.match(/sprint-(\d+)/);
    if (existsSync(tasksDir) && sprintMatch) {
      const prefix = `task-${sprintMatch[1]}-`;
      const allFiles = readdirSync(tasksDir);
      const sprintFiles = allFiles.filter(f => f.startsWith(prefix));
      const { preserved } = classifyTaskFiles(tasksDir, prefix, sprintFiles);

      if (preserved.length > 0) {
        debugLog('finalizeSprint:archiveGuard', `Preserving ${preserved.length} active task files: ${preserved.slice(0, 5).join(', ')}${preserved.length > 5 ? '...' : ''}`);
      }
    }

    // Step 12b-iii: Archive only completed tasks (archiveOrphanTasks archives all — we accept this for now
    // since the snapshot provides rollback capability)
    const count = archiveOrphanTasks(projectRoot, sprint.id);
    debugLog('finalizeSprint:archiveOrphanTasks', `Archived ${count} orphan task files`);
  } catch (e) { debugLog('finalizeSprint:archiveOrphanTasks', e); }

  // 12c. Apply .tasks/archive/ retention policy — remove archives beyond retention limit
  debugLog('finalizeSprint:breadcrumb', 'Step 12c (cleanTasksArchive) — entering');
  try {
    const removed = cleanTasksArchive(projectRoot);
    debugLog('finalizeSprint:cleanTasksArchive', `Removed ${removed} old .tasks/archive/ dirs`);
  } catch (e) { debugLog('finalizeSprint:cleanTasksArchive', e); }

  // 12d. Sprint file retention — clean counters, migrate forensic files, enforce keep_last_n + size_cap
  debugLog('finalizeSprint:breadcrumb', 'Step 12d (sprintFileRetention) — entering');
  try {
    // Read retention config from project config if available
    let retentionConfig: Record<string, unknown> = {};
    try {
      const cfgPath = join(projectRoot, '.deckent', 'config.json');
      if (existsSync(cfgPath)) {
        const raw = JSON.parse(readFileSync(cfgPath, 'utf-8'));
        if (raw?.sprint_file_retention) retentionConfig = raw.sprint_file_retention;
      }
    } catch { /* use defaults */ }

    const retentionResult = runRetention(projectRoot, sprint.id, retentionConfig);
    debugLog('finalizeSprint:sprintFileRetention',
      `Retention complete: archived=${retentionResult.archived.length}, countersDeleted=${retentionResult.countersDeleted.length}, forensicMoved=${retentionResult.forensicMoved.length}, bytesFreed=${retentionResult.bytesFreed}`);
  } catch (e) { debugLog('finalizeSprint:sprintFileRetention', e); }

  // 13. Write job completion summary to .deckent/runtime/jobs/ for MCP polling and CLI notification
  debugLog('finalizeSprint:breadcrumb', 'Step 13 (jobSummary) — entering');
  try {
    const jobsDir = join(projectRoot, JOBS_DIR);
    mkdirSync(jobsDir, { recursive: true });

    // Build agent breakdown
    const agentBreakdown: Record<string, number> = {};
    for (const task of sprint.tasks) {
      const agent = task.assignedAgent ?? 'generic';
      agentBreakdown[agent] = (agentBreakdown[agent] ?? 0) + 1;
    }
    const agentParts = Object.entries(agentBreakdown).map(([a, c]) => `${a}(${c})`).join(', ');

    // Format duration — Sprint 268 FINALIZE fix: without a recoverable
    // startedAt the computed durationMs is a meaningless ~0 (calculateMetrics
    // falls back to Date.now() for the start). Report 'unknown' honestly
    // instead of a fake "0sn" (sprint-267 live finding: Duration=0ms).
    const durationMs = metrics.durationMs;
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    const durationStr = !sprint.startedAt
      ? 'unknown'
      : mins > 0 ? `${mins}dk ${secs}sn` : `${secs}sn`;

    // completedTasks already includes TECH_DEBT (see calculateMetrics), so use it directly
    const donePure = metrics.completedTasks - metrics.techDebtTasks;
    const summary = `Sprint ${sprint.id} tamamlandı (${durationStr}) — ${metrics.completedTasks}/${metrics.totalTasks} task başarılı: ${donePure} DONE, ${metrics.techDebtTasks} TECH_DEBT, ${metrics.noGoTasks} NO_GO | Agent: ${agentParts}`;

    // Build rich evaluations with per-task details from results
    const richEvaluations: Record<string, {
      evaluation: string;
      title: string;
      agent: string;
      skills: string[];
      reason: string;
      filesChanged: string[];
      linesAdded: number;
      linesRemoved: number;
      testsPassed: boolean;
      coverage: number;
      selfAssessment: string;
      techDebtDetail: string;
    }> = {};
    for (const [taskId, evaluation] of evaluations) {
      const taskResult = resultsMap.get(taskId);
      const task = sprint.tasks.find(t => t.id === taskId);
      const isTechDebt = evaluation === TaskEvaluation.GO_WITH_TECH_DEBT;
      richEvaluations[taskId] = {
        evaluation,
        title: task?.title ?? '',
        agent: task?.assignedAgent ?? 'generic',
        skills: task?.assignedSkills ?? [],
        reason: taskResult?.notes ?? '',
        filesChanged: taskResult?.filesChanged ?? [],
        linesAdded: taskResult?.linesAdded ?? 0,
        linesRemoved: taskResult?.linesRemoved ?? 0,
        testsPassed: taskResult?.testsPassed ?? false,
        coverage: taskResult?.coverage ?? 0,
        selfAssessment: taskResult?.selfAssessment ?? evaluation,
        techDebtDetail: isTechDebt ? (taskResult?.notes ?? '') : '',
      };
    }

    const jobFile = join(jobsDir, `${sprint.id}.json`);
    const jobData = {
      status: 'COMPLETE',
      sprintId: sprint.id,
      summary,
      completedAt: new Date().toISOString(),
      metrics: {
        totalTasks: metrics.totalTasks,
        done: donePure,
        techDebt: metrics.techDebtTasks,
        noGo: metrics.noGoTasks,
        duration: durationStr,
        durationMs: metrics.durationMs,
      },
      agentBreakdown,
      evaluations: richEvaluations,
    };
    writeFileSync(jobFile, JSON.stringify(jobData, null, 2) + '\n');
    debugLog('finalizeSprint:jobSummary', `Job summary written to ${jobFile}`);
  } catch (e) { debugLog('finalizeSprint:jobSummary', e); }

  // 14. Post-finalize hook chain (Sprint 143 Task 10)
  // Order: (1) memory export → (2) identity regen → (3) adr insert → (4) rule regen hook
  // ADR-046 Step Ordering Contract; ruleRegen MUST observe ADRs inserted by adrInsert.
  // Changelog and sprint-log are already handled by doc-updaters registry in step 9.
  debugLog('finalizeSprint:breadcrumb', 'Step 14 (postFinalizeHooks) — entering');
  let postFinalizeResult: PostFinalizeHookResult | null = null;
  try {
    // ── Step 4 ruleRegen invocation (Sprint 168 C0a-2) ─────────────
    // Sprint 167 T3 HIGH regression: when sprint-finalizer.ts was called
    // without an explicit `onRuleRegen` callback, Step 4 was silently
    // skipped, leaving `.claude/rules/brain.md` Active ADR Constraints
    // stale (44/50 ADRs). The fix here provides a default callback that
    // invokes `regenerateRules(projectRoot)` — which queries
    // `store.getByType('adr')` against the post-Step-3 memory.db and
    // re-renders rules for all 4 provider dirs (claude / codex / gemini
    // / cursor). Callers passing their own `opts.onRuleRegen` (e.g. tests
    // or override paths) bypass the default. ADR-046 Step 4 contract.
    let resolvedOnRuleRegen = opts?.onRuleRegen;
    if (!resolvedOnRuleRegen) {
      resolvedOnRuleRegen = async (root: string): Promise<void> => {
        const { regenerateRules } = await import('../core/rule-generator.js');
        await regenerateRules(root);
      };
    }

    postFinalizeResult = await runPostFinalizeHooks({
      projectRoot,
      sprintId: sprint.id,
      metrics: {
        sprintId: sprint.id,
        totalTasks: metrics.totalTasks,
        completedTasks: metrics.completedTasks,
        techDebtTasks: metrics.techDebtTasks,
        noGoTasks: metrics.noGoTasks,
        coveragePercent: metrics.coveragePercent,
        durationMs: metrics.durationMs,
      },
      onRuleRegen: resolvedOnRuleRegen,
      // Sprint 227 task 227-002: always skip the unsafe runMemoryExport.
      // We do the export ourselves via writeGuardedExports below so the
      // sanity guard runs on every finalize cycle, not just opted-in callers.
      skipMemoryExport: true,
      skipIdentityRegen: opts?.skipIdentityRegen,
    });

    // Sprint 227 task 227-002 — guarded export.
    // Runs AFTER runPostFinalizeHooks so post-Step-3 ADR inserts are
    // reflected in the rendered .md files. Caller can still opt out via
    // opts.skipMemoryExport (preserves prior semantics).
    if (!opts?.skipMemoryExport) {
      try {
        const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
        if (existsSync(dbPath)) {
          const exportsDir = join(projectRoot, BRAIN_DIR, 'exports');
          const store = new MemoryStore(dbPath);
          try {
            const guarded = writeGuardedExports(store, exportsDir);
            debugLog('finalizeSprint:writeGuardedExports',
              `written=${guarded.written.length} skipped=${guarded.skipped.length} ` +
              `warnings=${guarded.warnings.length}`);
            for (const w of guarded.warnings) {
              debugLog('finalizeSprint:writeGuardedExports:warn', w);
            }
            // Reflect the guarded run onto postFinalizeResult.memoryExport so
            // downstream consumers see a non-null result (the caller-visible
            // contract did not change).
            postFinalizeResult.memoryExport = {
              success: guarded.warnings.length === 0,
              filesWritten: guarded.written,
              errors: guarded.warnings,
            };
          } finally {
            store.close();
          }
        }
      } catch (e) {
        debugLog('finalizeSprint:writeGuardedExports', `guarded export failed: ${e}`);
      }
    }
    debugLog('finalizeSprint:postFinalizeHooks',
      `memExport=${postFinalizeResult.memoryExport?.filesWritten.length ?? 'skipped'} ` +
      `identity=${postFinalizeResult.identityRegen?.reason ?? 'skipped'} ` +
      `adrInsert=${postFinalizeResult.adrInsert
        ? `inserted=${postFinalizeResult.adrInsert.inserted}/updated=${postFinalizeResult.adrInsert.updated}/skipped=${postFinalizeResult.adrInsert.skipped}`
        : 'skipped'} ` +
      `ruleRegen=${postFinalizeResult.ruleRegenCalled} ` +
      `errors=${postFinalizeResult.errors.length}`);
  } catch (e) {
    debugLog('finalizeSprint:postFinalizeHooks', `Post-finalize hooks failed: ${e}`);
  }

  // ─── SPRINT_PHASE_CHANGE: RETRO → CLEANUP ───────────────────────
  // Final phase transition — sprint lifecycle complete.
  // Consumer: auditor marks sprint as finalized, dashboard shows COMPLETE.
  writeEvent(
    projectRoot, sprintIdForEvents, 'brain', '*',
    CHANNELS.SPRINT_PHASE_CHANGE,
    { fromPhase: 'RETRO', toPhase: 'CLEANUP', sprintId: sprint.id, timestamp: new Date().toISOString() },
  );

  // DECKENT→USER:NOTIFY (Hot Fix H6) — sprint-finalized, fail-safe
  try {
    const done = metrics.completedTasks ?? 0;
    const total = metrics.totalTasks ?? sprint.tasks.length;
    const noGo = metrics.noGoTasks ?? 0;
    const debt = metrics.techDebtTasks ?? 0;
    void notify(
      'sprint-finalized',
      sprint.id,
      `Sprint ${sprint.id} kapandı`,
      `${done}/${total} DONE, ${debt} TECH_DEBT, ${noGo} NO_GO`,
    );
  } catch (e) { debugLog('finalizeSprint:notify:sprint-finalized', e); }

  // 15. Terminal sprint-state + PID/snapshot cleanup (Sprint 223 Task 013)
  debugLog('finalizeSprint:breadcrumb', 'Step 15 (terminalStateCleanup) — entering');
  persistFinalSprintState(projectRoot, sprint);
  debugLog('finalizeSprint:breadcrumb', 'Step 15 (terminalStateCleanup) — done');

  // 16. Write terminal .dashboard snapshot so /api/status is never stale (DASH-UX-2)
  debugLog('finalizeSprint:breadcrumb', 'Step 16 (terminalDashboardSnapshot) — entering');
  try {
    writeTerminalDashboardSnapshot(projectRoot, sprint, metrics);
  } catch (e) { debugLog('finalizeSprint:terminalDashboard', e); }
  debugLog('finalizeSprint:breadcrumb', 'Step 16 (terminalDashboardSnapshot) — done');

  return metrics;
}

/**
 * Sprint 223 Task 013 — finalize sprint-state COMPLETED + pids cleanup.
 *
 * Root cause (Sprint 222→223 transition): `deckent finalize --force` wrote
 * RETRO / MEMORY / config but left `.deckent/sprint-state.json` at
 * `status:ACTIVE, phase:EXECUTE` and the dead `.deckent/pids/<id>.pid` in
 * place. The next `deckent start` then either reported the sprint as an
 * orphan (PID dead) or wrongly resumed the finished sprint in FIX, blocking
 * the next sprint from launching.
 *
 * Fix: stamp the sprint as `SprintStatus.COMPLETE` / `SprintPhase.COMPLETE`,
 * overwrite `.deckent/sprint-state.json` only when it already exists (so
 * fresh checkouts don't gain a phantom state file), then drop the PID +
 * snapshot files via `clearPid` (which is itself idempotent on missing
 * files). Both steps are wrapped in non-fatal try/catch — finalize must
 * never crash because of a stale tmp file.
 */
export function persistFinalSprintState(projectRoot: string, sprint: Sprint): void {
  try {
    sprint.status = SprintStatus.COMPLETE;
    sprint.phase = SprintPhase.COMPLETE;
    sprint.completedAt = sprint.completedAt ?? new Date().toISOString();
    const statePath = join(projectRoot, SPRINT_STATE_FILE);
    if (existsSync(statePath)) {
      // Sprint 268 guard: only stamp the state file when it belongs to THIS
      // sprint — `finalize --force` for an older sprint must not overwrite a
      // different (possibly live) sprint's state as COMPLETE. A state file
      // without a sprintId (legacy/corrupt) is still stamped, preserving the
      // Sprint 223 cleanup behavior.
      const existing = readSprintState(projectRoot);
      if (!existing?.sprintId || existing.sprintId === sprint.id) {
        writeSprintState(projectRoot, sprint);
      } else {
        debugLog('persistFinalSprintState:skip',
          `sprint-state.json belongs to ${existing.sprintId}, not ${sprint.id} — leaving untouched`);
      }
    }
  } catch (e) { debugLog('persistFinalSprintState:writeSprintState', e); }
  try {
    clearPid(projectRoot, sprint.id);
  } catch (e) { debugLog('persistFinalSprintState:clearPid', e); }
  // GHOST-FINALIZE fix (Sprint 272 272-001): purge this sprint's checkpoint
  // artifacts so the next `deckent start` cannot read a stale checkpoint and
  // run a phantom 0/0 "complete" restore. cleanupCheckpointFiles is itself
  // idempotent + fail-safe; the wrapping try/catch is belt-and-suspenders so
  // finalize never crashes on a locked/missing file.
  try {
    cleanupCheckpointFiles(projectRoot, sprint.id);
  } catch (e) { debugLog('persistFinalSprintState:cleanupCheckpointFiles', e); }
}

/**
 * Sprint 282 Task 005 — TERMINAL dashboard snapshot (DASH-UX-2).
 *
 * After sprint finalize, the `.dashboard` file is left at the last auditor
 * scan state (e.g. "EXECUTE 80% 8/10").  The next `/api/status` call returns
 * this stale snapshot as if the sprint is still running.
 *
 * Fix: overwrite `.dashboard` with a TERMINAL snapshot containing
 *   sprint.phase = COMPLETE, sprint.status = COMPLETE,
 *   agents = [], progress = final values, alerts = [].
 * The file is always overwritten (idempotent — same data on re-finalize).
 * Non-fatal: wrapped in the caller's try/catch (Step 16 in finalizeSprint).
 */
export function writeTerminalDashboardSnapshot(
  projectRoot: string,
  sprint: Sprint,
  metrics: SprintMetrics,
): void {
  const dashPath = join(projectRoot, DASHBOARD_FILE);
  const snapshot = {
    sprint: {
      id: sprint.id,
      number: sprint.number,
      phase: SprintPhase.COMPLETE,
      status: SprintStatus.COMPLETE,
    },
    agents: [],
    progress: {
      done: metrics.completedTasks,
      active: 0,
      blocked: 0,
      total: metrics.totalTasks,
    },
    alerts: [],
    updatedAt: new Date().toISOString(),
    completedAt: sprint.completedAt ?? new Date().toISOString(),
  };
  writeFileSync(dashPath, JSON.stringify(snapshot, null, 2), 'utf-8');
  debugLog('writeTerminalDashboardSnapshot', `terminal snapshot written for ${sprint.id}`);
}
