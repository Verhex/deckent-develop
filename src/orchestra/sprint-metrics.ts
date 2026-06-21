// ─── Sprint Metrics ──────────────────────────────────────────────
// Extracted from sprint-reporter.ts — metric calculation, aggregation, comparison, coverage
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation } from '../core/types.js';
import type {
  TaskResult, Sprint, SprintMetrics, DebtItem, TokenUsage,
} from '../core/types.js';
import {
  BRAIN_DIR, SPRINTS_DIR,
} from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import { buildResultsMap } from './result-collector.js';
import { findBoundaryViolations } from './result-evaluator.js';

// ═══ Internal Helpers ══════════════════════════════════════════════

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (e) {
    debugLog('readFileSafe:readFile', e);
    return '';
  }
}

// ═══ Token Usage ═══════════════════════════════════════════════════

/** Format a token count as a human-readable string (e.g. 15420 → "15.4K") */
export function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/**
 * Build a Token Usage markdown table from task results.
 * Returns empty array if no results contain tokenUsage data.
 */
export function buildTokenUsageSection(
  results: TaskResult[] | undefined,
): string[] {
  if (!results || results.length === 0) return [];

  const withUsage = results.filter((r): r is TaskResult & { tokenUsage: TokenUsage } => !!r.tokenUsage);
  if (withUsage.length === 0) return [];

  const lines: string[] = [];
  lines.push('## Token Usage');
  lines.push('| Task | Model | Input | Output | Cache Read | Total |');
  lines.push('|------|-------|-------|--------|------------|-------|');

  let totalInput = 0;
  let totalOutput = 0;
  let totalCache = 0;

  for (const r of withUsage) {
    const u = r.tokenUsage;
    const input = u.inputTokens;
    const output = u.outputTokens;
    const cache = u.cacheReadTokens ?? 0;
    const total = input + output + cache;
    totalInput += input;
    totalOutput += output;
    totalCache += cache;

    const model = u.model ?? '—';
    lines.push(`| ${r.taskId} | ${model} | ${formatTokenCount(input)} | ${formatTokenCount(output)} | ${formatTokenCount(cache)} | ${formatTokenCount(total)} |`);
  }

  const grandTotal = totalInput + totalOutput + totalCache;
  lines.push(`| **Total** | — | ${formatTokenCount(totalInput)} | ${formatTokenCount(totalOutput)} | ${formatTokenCount(totalCache)} | ${formatTokenCount(grandTotal)} |`);

  return lines;
}

// ═══ Core Metrics ═════════════════════════════════════════════════

/**
 * Calculate sprint metrics from evaluation results and task outputs.
 * Counts completed, tech-debt, and no-go tasks; computes coverage average,
 * no-go rate, duration, and debt statistics.
 * @param sprint - The sprint being measured
 * @param evaluations - Map of task ID to evaluation result
 * @param results - Array of worker task results
 * @param debt - Optional array of debt items for debt counting
 * @returns Computed sprint metrics
 */
export function calculateMetrics(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  debt?: DebtItem[],
): SprintMetrics {
  let completedTasks = 0;
  let techDebtTasks = 0;
  let noGoTasks = 0;

  for (const ev of evaluations.values()) {
    if (ev === TaskEvaluation.DONE) completedTasks++;
    else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) { completedTasks++; techDebtTasks++; }
    else if (ev === TaskEvaluation.NO_GO) noGoTasks++;
  }

  const totalTasks = evaluations.size;
  const coveragePercent = results.length > 0
    ? results.reduce((sum, r) => sum + r.coverage, 0) / results.length
    : 0;
  const noGoRate = totalTasks > 0 ? noGoTasks / totalTasks : 0;

  const startTime = sprint.startedAt ? new Date(sprint.startedAt).getTime() : Date.now();
  const endTime = sprint.completedAt ? new Date(sprint.completedAt).getTime() : Date.now();
  // Sprint 168 W2.5 — C0d wire (BUG-FF): guard against negative duration.
  // Mirrors computeSprintMetrics({ ... }).durationMs from sprint-reporter.ts.
  // Inline to avoid the sprint-reporter ↔ sprint-metrics import cycle.
  const durationMs = Math.max(0, endTime - startTime);

  // boundaryViolations: count tasks whose worker wrote files outside their declared
  // scope. Reuses the canonical per-result detector (findBoundaryViolations) over the
  // REAL filesChanged vs each task's scope — not a hardcoded 0. (R5: feeds the retro +
  // learning loop honest counts; was always 0 → retro unconditionally claimed "no
  // boundary violations" regardless of reality.)
  const taskById = new Map(sprint.tasks.map(t => [t.id, t]));
  let boundaryViolations = 0;
  for (const r of results) {
    const task = taskById.get(r.taskId);
    if (task && findBoundaryViolations(r, task).length > 0) boundaryViolations++;
  }

  return {
    totalTasks,
    completedTasks,
    techDebtTasks,
    noGoTasks,
    durationMs,
    coveragePercent,
    noGoRate,
    newDebtCount: techDebtTasks,
    resolvedDebtCount: debt ? debt.filter(d => d.resolved && d.resolvedInSprintId === sprint.id).length : 0,
    totalOpenDebt: debt ? debt.filter(d => !d.resolved).length : 0,
    boundaryViolations,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
}

// ═══ Sprint Comparison ═══════════════════════════════════════════

export interface SprintComparison {
  durationChangePct: number;
  noGoRateChange: number;
  testCountDelta: number;
  coverageDelta: number;
  completedTasksDelta: number;
  techDebtTasksDelta: number;
}

/** Compare current metrics against a previous sprint's metrics. */
export function compareWithPreviousSprint(current: SprintMetrics, previous: SprintMetrics): SprintComparison {
  const durationChangePct = previous.durationMs > 0
    ? ((current.durationMs - previous.durationMs) / previous.durationMs) * 100
    : 0;
  return {
    durationChangePct,
    noGoRateChange: current.noGoRate - previous.noGoRate,
    testCountDelta: current.totalTasks - previous.totalTasks,
    coverageDelta: current.coveragePercent - previous.coveragePercent,
    completedTasksDelta: current.completedTasks - previous.completedTasks,
    techDebtTasksDelta: current.techDebtTasks - previous.techDebtTasks,
  };
}

/** Read metrics from a previous sprint log file by parsing the markdown table. */
export function readPreviousSprintMetrics(projectRoot: string, currentSprintId: string): SprintMetrics | null {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsPath)) return null;

  const files = readdirSync(sprintsPath).filter(f => f.endsWith('.md')).sort();
  // Filter out the current sprint and pick the latest previous
  const previousFiles = files.filter(f => !f.includes(currentSprintId));
  if (previousFiles.length === 0) return null;

  const latestFile = previousFiles.at(-1);
  if (!latestFile) return null;
  const content = readFileSafe(join(sprintsPath, latestFile));
  return parseSprintLogMetrics(content);
}

/** Parse metrics from a sprint log markdown table. */
function parseSprintLogMetrics(content: string): SprintMetrics | null {
  const lines = content.split('\n');
  const metricsMap = new Map<string, string>();

  for (const line of lines) {
    if (!line.startsWith('|') || line.startsWith('|---') || line.startsWith('| Metric')) continue;
    const cols = line.split('|').map(c => c.trim()).filter(c => c);
    if (cols.length >= 2 && cols[0] !== undefined && cols[1] !== undefined) {
      metricsMap.set(cols[0], cols[1]);
    }
  }

  if (metricsMap.size === 0) return null;

  const totalTasks = parseInt(metricsMap.get('Total Tasks') ?? '0', 10);
  const completedTasks = parseInt(metricsMap.get('Completed') ?? '0', 10);
  const techDebtTasks = parseInt(metricsMap.get('Tech Debt') ?? '0', 10);
  const noGoTasks = parseInt(metricsMap.get('No-Go') ?? '0', 10);
  const coverageStr = metricsMap.get('Coverage') ?? '0';
  const coveragePercent = parseFloat(coverageStr.replace('%', ''));
  const durationStr = metricsMap.get('Duration') ?? '0';
  const durationMs = parseInt(durationStr.replace('ms', ''), 10);

  if (isNaN(totalTasks) && isNaN(completedTasks)) return null;

  const noGoRate = totalTasks > 0 ? noGoTasks / totalTasks : 0;

  return {
    totalTasks,
    completedTasks,
    techDebtTasks,
    noGoTasks,
    durationMs: isNaN(durationMs) ? 0 : durationMs,
    coveragePercent: isNaN(coveragePercent) ? 0 : coveragePercent,
    noGoRate,
    // Reconstruction defaults: this path parses metrics from a sprint-log .md and has
    // no results/DB, so debt + boundary counts are unavailable here. The LIVE path
    // (calculateMetrics) computes the real boundaryViolations from results × task scope.
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
}

// ═══ Duration Formatting ═══════════════════════════════════════════

/** Format milliseconds into a human-friendly duration string. */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} seconds total`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0
      ? `${minutes} minute${minutes !== 1 ? 's' : ''} ${seconds}s total`
      : `${minutes} minute${minutes !== 1 ? 's' : ''} total`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m total`;
}

/**
 * Format milliseconds into a compact short duration string.
 * Examples: 45000 → "45s", 1874000 → "31m 14s", 5400000 → "1h 30m"
 */
export function formatDurationShort(ms: number | undefined): string {
  if (ms === undefined || ms <= 0) return '';
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// ═══ Task Counting Helpers ═══════════════════════════════════════

export interface SelfHealingRate {
  percent: number;
  healed: number;
  attempted: number;
}

/** Calculate the self-healing rate from task results with feedbackLoop data. */
export function calculateSelfHealingRate(results?: TaskResult[]): SelfHealingRate | null {
  if (!results || results.length === 0) return null;

  let attempted = 0;
  let healed = 0;

  for (const r of results) {
    const fl = r.feedbackLoop;
    if (!fl) continue;
    const hadRetries = fl.tscAttempts > 1 || fl.testAttempts > 1;
    if (hadRetries) {
      attempted++;
      if (r.selfAssessment === 'DONE' || r.selfAssessment === 'GO_WITH_TECH_DEBT') {
        healed++;
      }
    }
  }

  if (attempted === 0) return null;

  return {
    percent: Math.round((healed / attempted) * 100),
    healed,
    attempted,
  };
}

/** Count tasks that completed without any retries. */
export function countFirstTryTasks(results?: TaskResult[]): number {
  if (!results) return 0;
  return results.filter(r => {
    if (r.selfAssessment === 'NO_GO') return false;
    const fl = r.feedbackLoop;
    if (!fl) return r.selfAssessment === 'DONE' || r.selfAssessment === 'GO_WITH_TECH_DEBT';
    return fl.tscAttempts <= 1 && fl.testAttempts <= 1;
  }).length;
}

/** Count new test files across all task results. */
export function countNewTestFiles(results?: TaskResult[]): number {
  if (!results) return 0;
  const testFiles = new Set<string>();
  for (const r of results) {
    for (const f of r.filesChanged) {
      if (f.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
        testFiles.add(f);
      }
    }
  }
  return testFiles.size;
}

/** Count tasks that needed retries but still succeeded. */
export function countSelfHealedTasks(results?: TaskResult[]): number {
  if (!results) return 0;
  return results.filter(r => {
    if (r.selfAssessment === 'NO_GO') return false;
    const fl = r.feedbackLoop;
    if (!fl) return false;
    return fl.tscAttempts > 1 || fl.testAttempts > 1;
  }).length;
}

// ═══ Agent Performance ════════════════════════════════════════════

export interface AgentPerformanceRow {
  agent: string;
  tasks: number;
  done: number;
  debt: number;
  noGo: number;
  avgCoverage: number;
}

/**
 * Build agent performance data from sprint tasks, evaluations, and results.
 * agentMap: Map<taskId, agentId> — if not provided, uses task.assignedAgent.
 */
export function buildAgentPerformance(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  agentMap?: Map<string, string>,
): AgentPerformanceRow[] {
  const agentData = new Map<string, { tasks: number; done: number; debt: number; noGo: number; coverageSum: number; coverageCount: number }>();
  const resultsMap = buildResultsMap(results);

  for (const task of sprint.tasks) {
    const agentId = agentMap?.get(task.id) ?? task.assignedAgent ?? 'generic';
    if (!agentData.has(agentId)) {
      agentData.set(agentId, { tasks: 0, done: 0, debt: 0, noGo: 0, coverageSum: 0, coverageCount: 0 });
    }
    const data = agentData.get(agentId); // narrowed: set() called above
    if (!data) continue;
    data.tasks += 1;

    const ev = evaluations.get(task.id);
    debugLog('buildAgentPerformance', `task=${task.id} agent=${agentId} ev=${ev} evalMapSize=${evaluations.size} evalKeys=[${[...evaluations.keys()].join(',')}]`);
    if (ev === TaskEvaluation.DONE) data.done += 1;
    else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) { data.done += 1; data.debt += 1; }
    else if (ev === TaskEvaluation.NO_GO) data.noGo += 1;

    const result = resultsMap.get(task.id);
    if (result && typeof result.coverage === 'number') {
      data.coverageSum += result.coverage;
      data.coverageCount += 1;
    }
  }

  const rows: AgentPerformanceRow[] = [];
  for (const [agent, data] of agentData) {
    rows.push({
      agent,
      tasks: data.tasks,
      done: data.done,
      debt: data.debt,
      noGo: data.noGo,
      avgCoverage: data.coverageCount > 0 ? Math.round(data.coverageSum / data.coverageCount) : 0,
    });
  }
  // Sort by tasks count descending; alphabetical tiebreak for deterministic ordering
  return rows.sort((a, b) => b.tasks - a.tasks || a.agent.localeCompare(b.agent));
}

/**
 * Format agent performance as a markdown table.
 */
export function formatAgentPerformanceTable(rows: AgentPerformanceRow[]): string[] {
  if (rows.length === 0) return [];
  const lines: string[] = [
    '',
    '## Agent Performance',
    '| Agent | Tasks | Done | Debt | NoGo | Avg Coverage |',
    '|-------|-------|------|------|------|-------------|',
  ];
  for (const row of rows) {
    lines.push(`| ${row.agent} | ${row.tasks} | ${row.done} | ${row.debt} | ${row.noGo} | ${row.avgCoverage}% |`);
  }
  return lines;
}

// ═══ Skill Performance ════════════════════════════════════════════

export interface SkillPerformanceRow {
  skill: string;
  tasks: number;
  done: number;
  debt: number;
  noGo: number;
  avgCoverage: number;
}

/**
 * Build skill performance data from sprint tasks, evaluations, and a skillMap.
 * skillMap: Map<taskId, skillId[]> — maps tasks to the skills used.
 */
export function buildSkillPerformance(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  skillMap?: Map<string, string[]>,
  results?: TaskResult[],
): SkillPerformanceRow[] {
  // Check if there is any skill data available — either from skillMap or from task.assignedSkills
  const hasSkillMap = skillMap && skillMap.size > 0;
  const hasTaskSkills = sprint.tasks.some(t => t.assignedSkills && t.assignedSkills.length > 0);
  if (!hasSkillMap && !hasTaskSkills) return [];

  const skillData = new Map<string, { tasks: number; done: number; debt: number; noGo: number; coverageSum: number; coverageCount: number }>();

  for (const task of sprint.tasks) {
    const skillIds = skillMap?.get(task.id) ?? task.assignedSkills ?? [];
    for (const skillId of skillIds) {
      if (!skillData.has(skillId)) {
        skillData.set(skillId, { tasks: 0, done: 0, debt: 0, noGo: 0, coverageSum: 0, coverageCount: 0 });
      }
      const data = skillData.get(skillId); // narrowed: set() called above
      if (!data) continue;
      data.tasks += 1;

      const ev = evaluations.get(task.id);
      if (ev === TaskEvaluation.DONE) data.done += 1;
      else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) { data.done += 1; data.debt += 1; }
      else if (ev === TaskEvaluation.NO_GO) data.noGo += 1;

      const result = results?.find(r => r.taskId === task.id);
      if (result && typeof result.coverage === 'number') {
        data.coverageSum += result.coverage;
        data.coverageCount += 1;
      }
    }
  }

  const rows: SkillPerformanceRow[] = [];
  for (const [skill, data] of skillData) {
    rows.push({
      skill,
      tasks: data.tasks,
      done: data.done,
      debt: data.debt,
      noGo: data.noGo,
      avgCoverage: data.coverageCount > 0 ? Math.round(data.coverageSum / data.coverageCount) : 0,
    });
  }
  return rows.sort((a, b) => b.tasks - a.tasks);
}

/**
 * Format skill performance as a markdown table.
 */
export function formatSkillPerformanceTable(rows: SkillPerformanceRow[]): string[] {
  if (rows.length === 0) return [];
  const lines: string[] = [
    '',
    '## Skill Performance',
    '| Skill | Tasks | Done | Debt | NoGo | Avg Coverage |',
    '|-------|-------|------|------|------|-------------|',
  ];
  for (const row of rows) {
    lines.push(`| ${row.skill} | ${row.tasks} | ${row.done} | ${row.debt} | ${row.noGo} | ${row.avgCoverage}% |`);
  }
  return lines;
}

// ═══ Sprint Number Extraction ═══════════════════════════════════════

/**
 * Extract sprint number from sprint ID string (e.g., "sprint-042" → 42).
 */
export function extractSprintNumber(sprintId: string): number | null {
  const match = sprintId.match(/sprint-0*(\d+)/);
  if (!match) return null;
  return parseInt(match[1] ?? '0', 10);
}

// ═══ Brain Self-Learning ═══════════════════════════════════════════

export interface ConfigSuggestion {
  field: string;
  currentValue: unknown;
  suggestedValue: unknown;
  reason: string;
}

/**
 * Analyze sprint result and generate config improvement suggestions.
 */
export function generateConfigSuggestions(sprintResult: { metrics: SprintMetrics }): ConfigSuggestion[] {
  const suggestions: ConfigSuggestion[] = [];
  const { metrics } = sprintResult;

  if (metrics.noGoRate > 0.5) {
    suggestions.push({
      field: 'brain_planning',
      currentValue: 'structured',
      suggestedValue: 'ai',
      reason: `NO_GO rate ${(metrics.noGoRate * 100).toFixed(0)}% > 50% — AI planning may produce better task breakdowns`,
    });
  }

  if (metrics.coveragePercent < 40) {
    suggestions.push({
      field: 'active_skills',
      currentValue: [],
      suggestedValue: ['test-writer'],
      reason: `Coverage ${metrics.coveragePercent.toFixed(0)}% < 40% — enable testing skill to improve coverage`,
    });
  }

  const ONE_HOUR_MS = 3_600_000;
  if (metrics.durationMs > ONE_HOUR_MS) {
    suggestions.push({
      field: 'max_workers',
      currentValue: 3,
      suggestedValue: 5,
      reason: `Sprint duration ${formatDuration(metrics.durationMs)} > 1h — increase max_workers to parallelize`,
    });
  }

  return suggestions;
}

/**
 * Detect files that appear in NO_GO tasks across 3+ sprints.
 */
export function detectRecurringFileErrors(_projectRoot: string, sprintResults: { sprint: Sprint; evaluations: Map<string, TaskEvaluation> }[]): string[] {
  const last3 = sprintResults.slice(-3);
  if (last3.length < 3) return [];

  // Map: filePath → Set<sprintId>
  const fileSprintMap = new Map<string, Set<string>>();

  for (const sr of last3) {
    const sprintId = sr.sprint.id;
    for (const task of sr.sprint.tasks) {
      const evalResult = sr.evaluations.get(task.id);
      if (evalResult !== TaskEvaluation.NO_GO) continue;

      const files = [
        ...task.scope.directories,
        ...task.scope.filesWrite,
      ];
      for (const f of files) {
        if (!fileSprintMap.has(f)) fileSprintMap.set(f, new Set());
        fileSprintMap.get(f)!.add(sprintId);
      }
    }
  }

  const recurring: string[] = [];
  for (const [filePath, sprints] of fileSprintMap) {
    if (sprints.size >= 3) recurring.push(filePath);
  }

  return recurring.sort();
}

/**
 * Build a markdown "Brain Insights" block for sprint reports.
 */
export function buildBrainInsights(
  sprintResult: { metrics: SprintMetrics },
  configSuggestions: ConfigSuggestion[],
  recurringFiles: string[],
): string {
  const { metrics } = sprintResult;
  const lines: string[] = [];

  lines.push('### Brain Insights');
  lines.push('');
  lines.push(`- **Sprint Score:** ${metrics.completedTasks}/${metrics.totalTasks} tasks completed (${(metrics.noGoRate * 100).toFixed(0)}% NO_GO rate)`);
  lines.push(`- **Coverage:** ${metrics.coveragePercent.toFixed(0)}%`);
  lines.push(`- **Duration:** ${formatDuration(metrics.durationMs)}`);

  if (configSuggestions.length > 0) {
    lines.push('');
    lines.push('**Config Suggestions:**');
    for (const s of configSuggestions) {
      lines.push(`- \`${s.field}\`: ${s.reason}`);
    }
  }

  if (recurringFiles.length > 0) {
    lines.push('');
    lines.push(`**Recurring Problem Files (${recurringFiles.length}):** ${recurringFiles.join(', ')}`);
  }

  return lines.join('\n');
}
