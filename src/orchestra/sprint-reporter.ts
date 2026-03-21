// ─── Sprint Reporting ──────────────────────────────────────────────
// Extracted from brain.ts — retrospective, sprint log, metrics, doc updates
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation } from '../core/types.js';
import type {
  TaskResult, Sprint, SprintMetrics, DebtItem, ResolvedConfig,
  SprintResult,
} from '../core/types.js';
import {
  BRAIN_DIR, SPRINTS_DIR, MEMORY_FILE,
  RETRO_FILE, MEMORY_MAX_LINES, RETRO_MAX_LINES, SPRINT_LOG_MAX_LINES,
} from '../core/constants.js';
import { runAllUpdaters } from './doc-updaters/registry.js';
import type { DocUpdateResult } from './doc-updaters/types.js';
import type { UsageTracker } from '../core/usage-tracker.js';
// Side-effect import: registers all updaters
import './doc-updaters/index.js';

// ═══ Internal Helpers ══════════════════════════════════════════════

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** Header-preserving memory trim: keep first HEADER_LINES lines, trim middle, keep recent entries */
const MEMORY_HEADER_LINES = 10;

export function trimMemoryWithHeader(lines: string[], maxLines: number): string {
  if (lines.length <= maxLines) return lines.join('\n');
  const headerEnd = Math.min(MEMORY_HEADER_LINES, maxLines);
  const header = lines.slice(0, headerEnd);
  const remaining = lines.slice(headerEnd);
  const keepFromEnd = maxLines - headerEnd;
  const tail = remaining.slice(remaining.length - keepFromEnd);
  return [...header, ...tail].join('\n');
}

// ═══ Exported Functions ════════════════════════════════════════════

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

  for (const task of sprint.tasks) {
    const agentId = agentMap?.get(task.id) ?? task.assignedAgent ?? 'generic';
    if (!agentData.has(agentId)) {
      agentData.set(agentId, { tasks: 0, done: 0, debt: 0, noGo: 0, coverageSum: 0, coverageCount: 0 });
    }
    const data = agentData.get(agentId)!;
    data.tasks += 1;

    const ev = evaluations.get(task.id);
    if (ev === TaskEvaluation.DONE) data.done += 1;
    else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) data.debt += 1;
    else if (ev === TaskEvaluation.NO_GO) data.noGo += 1;

    const result = results.find(r => r.taskId === task.id);
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
  return rows.sort((a, b) => b.tasks - a.tasks);
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

// 12. writeRetrospective
export function writeRetrospective(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  metrics: SprintMetrics,
  usageTracker?: UsageTracker,
  agentMap?: Map<string, string>,
): void {
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });

  // Write RETRO.md (overwrite)
  const retroLines: string[] = [
    `# Sprint ${sprint.id} Retrospective`, '',
    '## Metrics',
    `- Tasks: ${metrics.totalTasks} total, ${metrics.completedTasks} done, ${metrics.techDebtTasks} debt, ${metrics.noGoTasks} no-go`,
    `- Coverage: ${metrics.coveragePercent.toFixed(1)}%`,
    `- No-Go Rate: ${metrics.noGoRate.toFixed(1)}%`,
    `- Duration: ${metrics.durationMs}ms`, '',
    '## Results',
  ];
  for (const task of sprint.tasks) {
    retroLines.push(`- ${task.id}: ${task.title} -> ${evaluations.get(task.id) ?? 'UNKNOWN'}`);
  }

  // Add comparison section if previous sprint exists
  const previousMetrics = readPreviousSprintMetrics(projectRoot, sprint.id);
  if (previousMetrics) {
    const cmp = compareWithPreviousSprint(metrics, previousMetrics);
    retroLines.push('', '## Comparison with Previous Sprint');
    const durationSign = cmp.durationChangePct >= 0 ? '+' : '';
    retroLines.push(`- Duration: ${durationSign}${cmp.durationChangePct.toFixed(1)}%`);
    const noGoSign = cmp.noGoRateChange >= 0 ? '+' : '';
    retroLines.push(`- No-Go Rate: ${noGoSign}${cmp.noGoRateChange.toFixed(1)}pp`);
    const covSign = cmp.coverageDelta >= 0 ? '+' : '';
    retroLines.push(`- Coverage: ${covSign}${cmp.coverageDelta.toFixed(1)}pp`);
  }

  // Add usage summary if tracker provided
  if (usageTracker) {
    try {
      const sprintUsage = usageTracker.getSprintUsage(sprint.id);
      retroLines.push('', '## Usage');
      retroLines.push(`- Total Calls: ${sprintUsage.totalCalls}`);
      retroLines.push(`- Total Tokens (est): ${sprintUsage.totalTokens}`);
      for (const mb of sprintUsage.modelBreakdown) {
        retroLines.push(`  - ${mb.model}: ${mb.calls} calls, ${mb.tokens} tokens`);
      }
    } catch { /* non-fatal — usage data may not be available */ }
  }

  // Add agent performance section
  try {
    // Use calculateMetrics results array — we need TaskResult[] but don't have it here.
    // Build from evaluations + sprint tasks instead.
    const perfRows = buildAgentPerformance(sprint, evaluations, [], agentMap);
    if (perfRows.length > 0) {
      retroLines.push(...formatAgentPerformanceTable(perfRows));
    }
  } catch { /* non-fatal */ }

  writeFileSync(
    join(brainPath, RETRO_FILE),
    retroLines.slice(0, RETRO_MAX_LINES).join('\n'),
    'utf-8',
  );

  // Append to MEMORY.md
  const memoryPath = join(brainPath, MEMORY_FILE);
  const existingMemory = readFileSafe(memoryPath);
  const learnings: string[] = [`## Sprint ${sprint.id} Learnings`];
  for (const task of sprint.tasks) {
    const ev = evaluations.get(task.id);
    if (ev === TaskEvaluation.NO_GO || ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
      learnings.push(`- ${task.title}: ${ev}`);
    }
    if (learnings.length >= 11) break; // header + max 10
  }
  const newMemory = existingMemory
    ? existingMemory + '\n' + learnings.join('\n')
    : learnings.join('\n');
  const memoryLines = newMemory.split('\n');
  const trimmed = trimMemoryWithHeader(memoryLines, MEMORY_MAX_LINES);
  writeFileSync(memoryPath, trimmed, 'utf-8');
}

// 13. writeSprintLog
export function writeSprintLog(projectRoot: string, sprint: Sprint, metrics: SprintMetrics, evaluations?: Map<string, TaskEvaluation>): void {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  mkdirSync(sprintsPath, { recursive: true });

  const lines: string[] = [
    `# ${sprint.id}`, '',
    '## Metrics',
    '| Metric | Value |',
    '|--------|-------|',
    `| Total Tasks | ${metrics.totalTasks} |`,
    `| Completed | ${metrics.completedTasks} |`,
    `| Tech Debt | ${metrics.techDebtTasks} |`,
    `| No-Go | ${metrics.noGoTasks} |`,
    `| Coverage | ${metrics.coveragePercent.toFixed(1)}% |`,
    `| Duration | ${metrics.durationMs}ms |`, '',
    '## Tasks',
  ];
  for (const task of sprint.tasks) {
    const evalResult = evaluations?.get(task.id);
    const statusStr = evalResult ?? task.status;
    lines.push(`- ${task.id}: ${task.title} (${statusStr})`);
  }
  writeFileSync(
    join(sprintsPath, `${sprint.id}.md`),
    lines.slice(0, SPRINT_LOG_MAX_LINES).join('\n'),
    'utf-8',
  );
}

// 14. calculateMetrics (pure)
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
  const noGoRate = totalTasks > 0 ? (noGoTasks / totalTasks) * 100 : 0;

  const startTime = sprint.startedAt ? new Date(sprint.startedAt).getTime() : Date.now();
  const endTime = sprint.completedAt ? new Date(sprint.completedAt).getTime() : Date.now();

  return {
    totalTasks,
    completedTasks,
    techDebtTasks,
    noGoTasks,
    durationMs: endTime - startTime,
    coveragePercent,
    noGoRate,
    newDebtCount: techDebtTasks,
    resolvedDebtCount: debt ? debt.filter(d => d.resolved && d.resolvedInSprintId === sprint.id).length : 0,
    totalOpenDebt: debt ? debt.filter(d => !d.resolved).length : 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
}

// 16c. updateProjectDocs — registry-based auto-update after sprint completion
export function updateProjectDocs(projectRoot: string, sprintResult: SprintResult, config?: ResolvedConfig): DocUpdateResult[] {
  const isInternalProject = existsSync(join(projectRoot, 'DECKENT-MASTER-BLUEPRINT.md'));
  const resolvedConfig: ResolvedConfig = config ?? {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 8,
      brain_model: 'opus',
      default_model: 'opus',
      haiku_allowed: true,
      usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
      brain_planning: 'auto',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: isInternalProject ? 'deckent' : 'deckent-project',
    projectRoot,
    version: '0.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
  };
  const ctx = { projectRoot, sprintResult, config: resolvedConfig, isInternalProject };
  return runAllUpdaters(ctx);
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

  const latestFile = previousFiles[previousFiles.length - 1]!;
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
    if (cols.length >= 2) {
      metricsMap.set(cols[0]!, cols[1]!);
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

  const noGoRate = totalTasks > 0 ? (noGoTasks / totalTasks) * 100 : 0;

  return {
    totalTasks,
    completedTasks,
    techDebtTasks,
    noGoTasks,
    durationMs: isNaN(durationMs) ? 0 : durationMs,
    coveragePercent: isNaN(coveragePercent) ? 0 : coveragePercent,
    noGoRate,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
  };
}
