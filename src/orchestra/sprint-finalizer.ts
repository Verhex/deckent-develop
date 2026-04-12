// ═══ Sprint Finalizer ══════════════════════════════════════════════
// Extracted from sprint-controller.ts — handles post-sprint finalization:
//   finalizeSprint(), applyAdaptiveThresholds(), hook stubs for Task 13/14/15

// ─── Node Builtins ─────────────────────────────────────────────────
import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, readdirSync,
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports) ──────────────────────────────────────────
import {
  TaskEvaluation,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  TaskResult, Sprint, SprintMetrics,
  ResolvedConfig,
} from '../core/types.js';

import type { TaskDNA } from '../core/routing-types.js';

import {
  BRAIN_DIR, SPRINTS_DIR,
  DEBT_FILE, JOBS_DIR,
} from '../core/constants.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { parseDebtTable, updateLastSprintId, debugLog } from '../core/utils.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import { readFileSafe } from './sprint-utils.js';

// ─── Sprint Reporter ──────────────────────────────────────────────
import {
  writeRetrospective, writeSprintLog, calculateMetrics,
  updateProjectDocs, updateProjectIdentity,
  buildAgentPerformance, archiveDirectives,
} from './sprint-reporter.js';

// ─── Result Evaluator ─────────────────────────────────────────────
import { getRecentSprintStats, GO_WITH_GATE_FAILURE } from './result-evaluator.js';

// ─── Baseline Tracker ─────────────────────────────────────────────
import {
  parseVitestOutput, readBaseline, containsHonestyTrigger,
  captureVitestBaseline,
} from './baseline-tracker.js';

// ─── Result Collector ─────────────────────────────────────────────
import { buildResultsMap } from './result-collector.js';

// ─── Debt Manager ─────────────────────────────────────────────────
import { runDecay, auditBrainBudget } from './debt-manager.js';

// ─── Agent/Skill Pool ─────────────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { SkillPoolManager } from '../core/skill-pool.js';

// ─── Plugin Hooks ─────────────────────────────────────────────────
import { runHooks } from '../core/plugin-hooks.js';
import type { AfterSprintContext } from '../core/plugin-hooks.js';

// ─── Rich Output ──────────────────────────────────────────────────
import { formatRichSprintSummary } from '../cli/helpers/sprint-summary-rich.js';


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
 * Write rubric score detail to RETRO.md.
 * Appends a "### Rubric Scores" section to the existing RETRO.md.
 * @returns true if detail was written, false if no rubric data available
 */
export async function writeRubricDetail(
  projectRoot: string,
  _sprintId: string,
  results: TaskResult[],
  _evaluations: Map<string, TaskEvaluation>,
): Promise<boolean> {
  // Only proceed if at least one result has rubric scores
  const scoredResults = results.filter(r => r.rubricScores && Object.keys(r.rubricScores).length > 0);
  if (scoredResults.length === 0) return false;

  const retroPath = join(projectRoot, BRAIN_DIR, 'RETRO.md');
  const existing = existsSync(retroPath) ? readFileSync(retroPath, 'utf-8') : '';

  // Avoid duplicate injection
  if (existing.includes('### Rubric Scores')) return false;

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

  try {
    writeFileSync(retroPath, existing + tableLines.join('\n') + '\n', 'utf-8');
    return true;
  } catch (e) {
    debugLog('writeRubricDetail:write', e);
    return false;
  }
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
          timeout: 90_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
          shell: true,
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
          timeout: 300_000,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf-8',
          shell: true,
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
      if (existsSync(tasksDir)) {
        const resultFiles = readdirSync(tasksDir).filter(f => f.endsWith('.result'));
        for (const file of resultFiles) {
          try {
            const raw = readFileSync(join(tasksDir, file), 'utf-8');
            const result = JSON.parse(raw) as { taskId?: string; notes?: string };
            if (result.notes && containsHonestyTrigger(result.notes)) {
              const taskBaseline = readBaseline(root, sprintId);
              if (taskBaseline) {
                const currentCapture = captureVitestBaseline(root, 180_000);
                if (currentCapture && currentCapture.fail > taskBaseline.fail) {
                  flaggedTasks.push(result.taskId ?? file);
                }
              }
            }
          } catch { /* skip unparseable result files */ }
        }
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

  // ── Step 4: Observability — metrics.jsonl check ─────────────────
  const metricsPath = options?.metricsJsonlPath ?? join(root, '.deckent', 'metrics.jsonl');
  let observabilityResult: SelfAuditResult['observability'];
  if (existsSync(metricsPath)) {
    try {
      const content = readFileSync(metricsPath, 'utf-8');
      const lineCount = content.split('\n').filter(l => l.trim().length > 0).length;
      observabilityResult = { metricsJsonlExists: true, lineCount };
    } catch {
      observabilityResult = { metricsJsonlExists: true, lineCount: 0 };
    }
  } else {
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
 * Auto-adjust agent_min_score and coverage_threshold based on recent sprint stats.
 * Reads .brain/sprints/ files, computes NO_GO rate and avg coverage,
 * then writes updated values to .deckent/config.json and appends a note to RETRO.md.
 *
 * Rules:
 * - NO_GO rate > no_go_threshold → agent_min_score decremented (min 1)
 * - NO_GO rate < 10% → agent_min_score incremented (max 10)
 * - avg coverage < 70% → coverage_threshold lowered to avg
 * - Requires min_samples sprints before any adjustment
 */
export function applyAdaptiveThresholds(projectRoot: string, config: ResolvedConfig): void {
  const ac = config.adaptive_config;
  const stats = getRecentSprintStats(projectRoot, ac.coverage_lookback);

  if (stats.sprintCount < ac.min_samples) {
    debugLog('applyAdaptiveThresholds', `Not enough sprints (${stats.sprintCount}/${ac.min_samples}) — skipping`);
    return;
  }

  const changes: string[] = [];
  const configPath = join(projectRoot, '.deckent', 'config.json');
  const rawCfg: Record<string, unknown> = (() => {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
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

  // Adjust coverage_threshold based on avg coverage
  const currentCoverage = config.coverage_threshold;
  if (stats.avgCoverage < 70 && stats.avgCoverage > 0) {
    const newCoverage = Math.round(stats.avgCoverage);
    if (newCoverage !== currentCoverage) {
      rawCfg['coverage_threshold'] = newCoverage;
      changes.push(`coverage_threshold ${currentCoverage} => ${newCoverage} (avg coverage: ${stats.avgCoverage.toFixed(1)}%)`);
      debugLog('applyAdaptiveThresholds', changes.at(-1));
    }
  }

  if (changes.length === 0) return;

  // Write updated config
  writeFileSync(configPath, JSON.stringify(rawCfg, null, 2) + '\n');

  // Append adaptive notes to RETRO.md
  try {
    const retroPath = join(projectRoot, BRAIN_DIR, 'RETRO.md');
    const retroContent = readFileSafe(retroPath) ?? '';
    const adaptiveLines = changes.map(c => `- Adaptive: ${c}`).join('\n') + '\n';
    writeFileSync(retroPath, retroContent + adaptiveLines);
  } catch (e) { debugLog('applyAdaptiveThresholds:retroAppend', e); }
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
 * 5. Update PROJECT-IDENTITY.md "Current State" section
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
  // Build O(1) lookup index from results array — eliminates O(n²) linear scans
  const resultsMap = buildResultsMap(results);

  // 1. Calculate metrics
  const freshDebt = parseDebtTable(readFileSafe(join(projectRoot, BRAIN_DIR, DEBT_FILE)) ?? '');
  const metrics = calculateMetrics(sprint, evaluations, results, freshDebt);
  sprint.metrics = metrics;

  // 2. Write sprint log
  try {
    writeSprintLog(projectRoot, sprint, metrics, evaluations);
  } catch (e) { debugLog('finalizeSprint:writeSprintLog', e); }

  // 3 + 4. Write RETRO.md and update MEMORY.md (writeRetrospective does both)
  debugLog('finalizeSprint:preRetro', `evaluations.size=${evaluations.size} keys=[${[...evaluations.keys()].join(',')}]`);
  try {
    // Build skillMap from tasks for Skill Performance table in RETRO.md
    const skillMap = new Map<string, string[]>();
    for (const task of sprint.tasks) {
      if (task.assignedSkills && task.assignedSkills.length > 0) {
        skillMap.set(task.id, task.assignedSkills);
      }
    }
    writeRetrospective(projectRoot, sprint, evaluations, metrics, undefined, skillMap.size > 0 ? skillMap : undefined, results);
  } catch (e) { debugLog('finalizeSprint:writeRetrospective', e); }

  // 5. Update PROJECT-IDENTITY.md
  try {
    // Count total sprints from .brain/sprints/ directory
    const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
    let totalSprints = 1;
    try {
      if (existsSync(sprintsPath)) {
        totalSprints = readdirSync(sprintsPath).filter(f => f.endsWith('.md')).length;
      }
    } catch (e) { debugLog('finalizeSprint:countSprints', e); }
    updateProjectIdentity(projectRoot, sprint.id, metrics, totalSprints);
  } catch (e) { debugLog('finalizeSprint:updateProjectIdentity', e); }

  // 6. Update last_sprint_id in config
  try {
    updateLastSprintId(projectRoot, sprint.id);
  } catch (e) { debugLog('finalizeSprint:updateLastSprintId', e); }

  // 7. Run decay if over budget (uses auditBrainBudget for decayable-only accounting)
  if (!opts?.skipDecay) {
    try {
      const memBudget = opts?.config?.memory_budget ?? 900;
      const budgetAudit = auditBrainBudget(projectRoot, memBudget);
      if (budgetAudit.status === 'OVER') {
        debugLog('finalizeSprint:runDecay', `Brain budget OVER: ${budgetAudit.decayableLines} decayable lines > ${memBudget} budget (${budgetAudit.permanentLines} permanent exempt)`);
        runDecay(projectRoot, sprint.id, { force: true, memoryBudget: memBudget });
      } else {
        runDecay(projectRoot, sprint.id, { memoryBudget: memBudget });
      }
    } catch (e) { debugLog('finalizeSprint:runDecay', e); }
  }

  // 8. Run afterSprint plugin hooks
  if (!opts?.skipHooks) {
    try {
      await runHooks('afterSprint', {
        hook: 'afterSprint',
        sprint,
        projectRoot,
      } satisfies AfterSprintContext);
    } catch (e) { debugLog('finalizeSprint:afterSprintHook', e); }
  }

  // 8b. Update agent/skill stats
  const routingVersion = (opts?.config as Record<string, unknown> | undefined)?.['routing_engine'] as string | undefined;

  if (routingVersion !== 'v2') {
    // V1: Write stats directly to agent.json and skill manifest files (legacy behavior)
    try {
      const poolManager = new AgentPoolManager(projectRoot);
      const skillPoolManager = new SkillPoolManager(projectRoot);
      for (const task of sprint.tasks) {
        const evaluation = evaluations.get(task.id);
        if (!evaluation) continue;
        const taskResult = resultsMap.get(task.id);
        const coverage = taskResult?.coverage ?? 0;

        // Update agent stats
        const agentId = task.assignedAgent;
        if (agentId) {
          poolManager.updateAgentStats(agentId, evaluation, coverage, sprint.id);
        }

        // Update skill stats
        if (task.assignedSkills) {
          for (const skillId of task.assignedSkills) {
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
      updateProjectDocs(projectRoot, { sprint, evaluations, metrics }, opts.config);
    } catch (e) { debugLog('finalizeSprint:updateProjectDocs', e); }
  }

  // 10. Rich output (non-fatal — sprint completes even if formatting fails)
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
  try {
    const gateResult = await runSelfAuditGate(sprint.id, projectRoot);
    const currentStatus = sprint.status ?? '';
    const newStatus = applyGateStatus(currentStatus, gateResult);
    if (newStatus !== currentStatus) {
      sprint.status = newStatus as Sprint['status'];
      debugLog('finalizeSprint:selfAuditGate', `Status updated: ${currentStatus} → ${newStatus}`);
    }
    // Append Gate Failure section to RETRO.md if gate failed
    if (gateResult.overallGate === 'GATE_FAILURE') {
      try {
        const retroPath = join(projectRoot, BRAIN_DIR, 'RETRO.md');
        const existing = existsSync(retroPath) ? readFileSync(retroPath, 'utf-8') : '';
        if (!existing.includes('### Gate Failure')) {
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
          writeFileSync(retroPath, existing + gateSection, 'utf-8');
        }
      } catch (e) { debugLog('finalizeSprint:gateRetroAppend', e); }
    }
  } catch (e) { debugLog('finalizeSprint:selfAuditGate', `Gate check failed: ${e}`); }

  // 11. Adaptive thresholds: auto-adjust agent_min_score + coverage_threshold based on recent sprints
  if (opts?.config?.adaptive_thresholds) {
    try {
      applyAdaptiveThresholds(projectRoot, opts.config);
    } catch (err) {
      debugLog('finalizeSprint:adaptive', `Adaptive threshold update failed: ${err}`);
    }
  }

  // 12. Archive DIRECTIVES.md (auto_archive_directives config flag, default true)
  try {
    const rawCfg = opts?.config as Record<string, unknown> | undefined;
    const autoArchive = rawCfg?.['auto_archive_directives'] ?? true;
    if (autoArchive) {
      archiveDirectives(projectRoot, sprint.id);
    } else {
      debugLog('finalizeSprint:archiveDirectives', 'Skipped — auto_archive_directives=false');
    }
  } catch (e) { debugLog('finalizeSprint:archiveDirectives', e); }

  // 13. Write job completion summary to .deckent/jobs/ for MCP polling and CLI notification
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

    // Format duration
    const durationMs = metrics.durationMs;
    const mins = Math.floor(durationMs / 60000);
    const secs = Math.floor((durationMs % 60000) / 1000);
    const durationStr = mins > 0 ? `${mins}dk ${secs}sn` : `${secs}sn`;

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

  return metrics;
}
