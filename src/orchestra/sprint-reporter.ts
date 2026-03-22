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
  BRAIN_DIR, SPRINTS_DIR, MEMORY_FILE, PROJECT_IDENTITY_FILE,
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

/**
 * Trim memory content to maxLines while preserving the header section.
 * Keeps the first MEMORY_HEADER_LINES lines as header and fills the rest from the end.
 * @param lines - Array of lines from MEMORY.md
 * @param maxLines - Maximum number of lines to keep
 * @returns Trimmed content as a single string
 */
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
    const data = agentData.get(agentId); // narrowed: set() called above
    if (!data) continue;
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

// ═══ Skill Performance ════════════════════════════════════════════

export interface SkillPerformanceRow {
  skill: string;
  tasks: number;
  done: number;
  debt: number;
  noGo: number;
}

/**
 * Build skill performance data from sprint tasks, evaluations, and a skillMap.
 * skillMap: Map<taskId, skillId[]> — maps tasks to the skills used.
 */
export function buildSkillPerformance(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  skillMap?: Map<string, string[]>,
): SkillPerformanceRow[] {
  if (!skillMap || skillMap.size === 0) return [];

  const skillData = new Map<string, { tasks: number; done: number; debt: number; noGo: number }>();

  for (const task of sprint.tasks) {
    const skillIds = skillMap.get(task.id) ?? task.assignedSkills ?? [];
    for (const skillId of skillIds) {
      if (!skillData.has(skillId)) {
        skillData.set(skillId, { tasks: 0, done: 0, debt: 0, noGo: 0 });
      }
      const data = skillData.get(skillId); // narrowed: set() called above
      if (!data) continue;
      data.tasks += 1;

      const ev = evaluations.get(task.id);
      if (ev === TaskEvaluation.DONE) data.done += 1;
      else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) data.debt += 1;
      else if (ev === TaskEvaluation.NO_GO) data.noGo += 1;
    }
  }

  const rows: SkillPerformanceRow[] = [];
  for (const [skill, data] of skillData) {
    rows.push({ skill, tasks: data.tasks, done: data.done, debt: data.debt, noGo: data.noGo });
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
    '| Skill | Tasks | Done | Debt | NoGo |',
    '|-------|-------|------|------|------|',
  ];
  for (const row of rows) {
    lines.push(`| ${row.skill} | ${row.tasks} | ${row.done} | ${row.debt} | ${row.noGo} |`);
  }
  return lines;
}

/**
 * Write the sprint retrospective to RETRO.md and append learnings to MEMORY.md.
 * Includes metrics summary, per-task results, comparison with previous sprint,
 * usage report, agent performance, and skill performance sections.
 * @param projectRoot - Project root directory
 * @param sprint - The completed sprint
 * @param evaluations - Map of task ID to evaluation result
 * @param metrics - Calculated sprint metrics
 * @param usageTracker - Optional usage tracker for cost/token reporting
 * @param agentMap - Optional map of task ID to agent ID
 * @param skillMap - Optional map of task ID to skill ID array
 */
export function writeRetrospective(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  metrics: SprintMetrics,
  usageTracker?: UsageTracker,
  agentMap?: Map<string, string>,
  skillMap?: Map<string, string[]>,
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

  // Add skill performance section
  try {
    const skillRows = buildSkillPerformance(sprint, evaluations, skillMap);
    if (skillRows.length > 0) {
      retroLines.push(...formatSkillPerformanceTable(skillRows));
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

/**
 * Write a sprint log markdown file to .brain/sprints/{sprintId}.md.
 * Contains a metrics table and per-task status listing.
 * @param projectRoot - Project root directory
 * @param sprint - The completed sprint
 * @param metrics - Calculated sprint metrics
 * @param evaluations - Optional map of task ID to evaluation result
 */
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

/**
 * Run all registered document updaters after sprint completion.
 * Uses the doc-updaters registry to automatically update project documentation
 * based on sprint results and configuration.
 * @param projectRoot - Project root directory
 * @param sprintResult - Sprint result containing sprint, evaluations, and metrics
 * @param config - Optional resolved config; defaults are created if not provided
 * @returns Array of document update results from each updater
 */
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

// ═══ Project Identity ═════════════════════════════════════════════

export interface ProjectIdentityInfo {
  projectName: string;
  description?: string;
  testCount?: number;
  fileCount?: number;
  lineCount?: number;
  sprintId: string;
  totalSprints?: number;
  mode?: string;
  brainModel?: string;
  defaultModel?: string;
  maxWorkers?: number;
  framework?: string;
  language?: string;
  testFramework?: string;
  buildTool?: string;
  moduleMap?: Record<string, string>;
}

/**
 * Generate the initial PROJECT-IDENTITY.md content.
 * Called during `deckent init` to create the permanent project memory file.
 * @param info - Project identity information
 * @returns Markdown content for PROJECT-IDENTITY.md
 */
export function generateProjectIdentity(info: ProjectIdentityInfo): string {
  const lines: string[] = [
    '# Project Identity',
    '',
    '## What Is This Project',
    `- Name: ${info.projectName}`,
  ];
  if (info.description) {
    lines.push(`- Description: ${info.description}`);
  }
  lines.push('');

  lines.push('## Architecture');
  if (info.language) lines.push(`- Language: ${info.language}`);
  if (info.framework) lines.push(`- Framework: ${info.framework}`);
  if (info.testFramework) lines.push(`- Test Framework: ${info.testFramework}`);
  if (info.buildTool) lines.push(`- Build Tool: ${info.buildTool}`);
  lines.push('');

  lines.push('## Current State');
  if (info.testCount !== undefined) lines.push(`- Test Count: ${info.testCount}`);
  if (info.fileCount !== undefined) lines.push(`- File Count: ${info.fileCount}`);
  if (info.lineCount !== undefined) lines.push(`- Line Count: ${info.lineCount}`);
  lines.push(`- Last Sprint: ${info.sprintId}`);
  if (info.totalSprints !== undefined) lines.push(`- Total Sprints: ${info.totalSprints}`);
  lines.push('');

  lines.push('## Active Configuration');
  if (info.mode) lines.push(`- Mode: ${info.mode}`);
  if (info.brainModel) lines.push(`- Brain Model: ${info.brainModel}`);
  if (info.defaultModel) lines.push(`- Default Model: ${info.defaultModel}`);
  if (info.maxWorkers !== undefined) lines.push(`- Max Workers: ${info.maxWorkers}`);
  lines.push('');

  lines.push('## Key Rules');
  lines.push('- See .brain/DECISIONS.md for architecture decision records');
  lines.push('');

  lines.push('## Module Map');
  if (info.moduleMap && Object.keys(info.moduleMap).length > 0) {
    for (const [dir, purpose] of Object.entries(info.moduleMap)) {
      lines.push(`- ${dir}: ${purpose}`);
    }
  } else {
    lines.push('- (auto-populated after first sprint)');
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Update the "Current State" section of PROJECT-IDENTITY.md after each sprint.
 * Preserves all other sections. Creates the file with defaults if missing.
 * @param projectRoot - Project root directory
 * @param sprintId - Completed sprint ID
 * @param metrics - Sprint metrics for updating state
 * @param totalSprints - Total number of sprints run so far
 */
export function updateProjectIdentity(
  projectRoot: string,
  sprintId: string,
  metrics: SprintMetrics,
  totalSprints?: number,
): void {
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });
  const filePath = join(brainPath, PROJECT_IDENTITY_FILE);

  let content = readFileSafe(filePath);

  // If file doesn't exist, create a minimal one
  if (!content) {
    const dirName = projectRoot.split(/[\\/]/).pop() ?? 'unknown';
    content = generateProjectIdentity({
      projectName: dirName,
      sprintId,
      totalSprints: totalSprints ?? 1,
    });
    writeFileSync(filePath, content, 'utf-8');
    return;
  }

  // Update the "Current State" section
  const lines = content.split('\n');
  const newLines: string[] = [];
  let inCurrentState = false;
  let replacedCurrentState = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line === '## Current State') {
      inCurrentState = true;
      replacedCurrentState = true;
      newLines.push('## Current State');
      newLines.push(`- Test Count: ${metrics.totalTasks}`);
      newLines.push(`- Coverage: ${metrics.coveragePercent.toFixed(1)}%`);
      newLines.push(`- Last Sprint: ${sprintId}`);
      if (totalSprints !== undefined) newLines.push(`- Total Sprints: ${totalSprints}`);
      newLines.push(`- Completed Tasks: ${metrics.completedTasks}`);
      newLines.push(`- No-Go Rate: ${metrics.noGoRate.toFixed(1)}%`);
      continue;
    }

    if (inCurrentState) {
      // Skip old current state content until next section
      if (line.startsWith('## ')) {
        inCurrentState = false;
        newLines.push('');
        newLines.push(line);
      }
      continue;
    }

    newLines.push(line);
  }

  if (!replacedCurrentState) {
    // Section didn't exist, append it
    newLines.push('');
    newLines.push('## Current State');
    newLines.push(`- Test Count: ${metrics.totalTasks}`);
    newLines.push(`- Coverage: ${metrics.coveragePercent.toFixed(1)}%`);
    newLines.push(`- Last Sprint: ${sprintId}`);
    if (totalSprints !== undefined) newLines.push(`- Total Sprints: ${totalSprints}`);
    newLines.push(`- Completed Tasks: ${metrics.completedTasks}`);
    newLines.push(`- No-Go Rate: ${metrics.noGoRate.toFixed(1)}%`);
    newLines.push('');
  }

  writeFileSync(filePath, newLines.join('\n'), 'utf-8');
}
