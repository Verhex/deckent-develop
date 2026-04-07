// ─── Sprint Reporting ──────────────────────────────────────────────
// Extracted from brain.ts — retrospective, sprint log, metrics, doc updates
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { TaskEvaluation } from '../core/types.js';
import type {
  TaskResult, Sprint, SprintMetrics, DebtItem, ResolvedConfig,
  SprintResult, PatternEntry,
} from '../core/types.js';
import { TaskStatus } from '../core/types.js';
import {
  BRAIN_DIR, SPRINTS_DIR, ARCHIVE_DIR, MEMORY_FILE, PROJECT_IDENTITY_FILE,
  RETRO_FILE, MEMORY_MAX_LINES, RETRO_MAX_LINES, SPRINT_LOG_MAX_LINES,
  PATTERNS_FILE, DEBT_FILE, DECISIONS_FILE,
} from '../core/constants.js';
import { runAllUpdaters } from './doc-updaters/registry.js';
import type { DocUpdateResult } from './doc-updaters/types.js';
// Side-effect import: registers all updaters
import './doc-updaters/index.js';
import { runManagedDocUpdates } from './managed-docs/managed-doc-runner.js';
import {
  analyzeCiLearnings,
  buildCiLearningsSection,
  writeCiLearnings,
  type CiLearningResult,
} from '../core/ci-learning.js';
import { debugLog } from '../core/utils.js';
import { modelRegistry } from '../core/model-registry.js';

// ═══ Internal Helpers ══════════════════════════════════════════════

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (e) {
    debugLog('readFileSafe:readFile', e);
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
    debugLog('buildAgentPerformance', `task=${task.id} agent=${agentId} ev=${ev} evalMapSize=${evaluations.size} evalKeys=[${[...evaluations.keys()].join(',')}]`);
    if (ev === TaskEvaluation.DONE) data.done += 1;
    else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) { data.done += 1; data.debt += 1; }
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

// ═══ Human-Friendly RETRO Format ═════════════════════════════════

export interface HumanRetroData {
  sprint: Sprint;
  evaluations: Map<string, TaskEvaluation>;
  metrics: SprintMetrics;
  results?: TaskResult[];
  agentRows?: AgentPerformanceRow[];
  skillRows?: SkillPerformanceRow[];
  previousMetrics?: SprintMetrics | null;
  patterns?: PatternEntry[];
  debt?: DebtItem[];
}

/**
 * Format a human-friendly retrospective markdown string.
 * Produces a readable RETRO.md with Summary, Highlights, Issues, Metrics, and Learnings sections.
 */
export function formatHumanRetro(data: HumanRetroData): string {
  const { sprint, evaluations, metrics, results, previousMetrics } = data;
  const lines: string[] = [];

  // ─── Title ─────────────────────────────────────────────────────
  lines.push(`# Sprint ${sprint.id} Retrospective`);
  lines.push('');

  // ─── Summary ───────────────────────────────────────────────────
  lines.push('## Summary');
  const durationStr = formatDuration(metrics.durationMs);
  const healingRate = calculateSelfHealingRate(results);
  let summaryLine = `Completed ${metrics.completedTasks}/${metrics.totalTasks} tasks`;
  if (durationStr) summaryLine += ` in ${durationStr.replace(' total', '')}`;
  summaryLine += '.';
  if (healingRate !== null) {
    summaryLine += ` Self-healing rate: ${healingRate.percent}%.`;
  }
  lines.push(summaryLine);
  lines.push('');

  // ─── Highlights ────────────────────────────────────────────────
  const highlights = buildRetroHighlights(sprint, evaluations, results, previousMetrics ?? undefined);
  if (highlights.length > 0) {
    lines.push('## Highlights');
    for (const h of highlights) {
      lines.push(`- ${h}`);
    }
    lines.push('');
  }

  // ─── Issues ────────────────────────────────────────────────────
  const issues = buildRetroIssues(sprint, evaluations, results);
  if (issues.length > 0) {
    lines.push('## Issues');
    for (const issue of issues) {
      lines.push(`- ${issue}`);
    }
    lines.push('');
  }

  // ─── Metrics Table ─────────────────────────────────────────────
  lines.push('## Metrics');
  lines.push('| What | Value |');
  lines.push('|------|-------|');
  lines.push(`| Tasks completed | ${metrics.completedTasks}/${metrics.totalTasks} |`);
  if (healingRate !== null) {
    lines.push(`| Self-healed | ${healingRate.healed} task${healingRate.healed !== 1 ? 's' : ''} |`);
  }
  if (results && results.length > 0) {
    const newTestFiles = countNewTestFiles(results);
    if (newTestFiles > 0) {
      lines.push(`| New test files | ${newTestFiles} |`);
    }
    const totalAdded = results.reduce((sum, r) => sum + (r.linesAdded ?? 0), 0);
    const totalRemoved = results.reduce((sum, r) => sum + (r.linesRemoved ?? 0), 0);
    if (totalAdded > 0 || totalRemoved > 0) {
      lines.push(`| Code changes | +${totalAdded} / -${totalRemoved} |`);
    }
  }
  if (durationStr) {
    lines.push(`| Sprint time | ${durationStr.replace(' total', '')} |`);
  }
  if (metrics.totalTasks > 0) {
    const noGoPercent = Math.round(metrics.noGoRate);
    lines.push(`| NO_GO rate | ${noGoPercent}% (${metrics.noGoTasks}/${metrics.totalTasks}) |`);
  }
  if (metrics.coveragePercent > 0) {
    lines.push(`| Coverage | ${metrics.coveragePercent.toFixed(1)}% |`);
  }
  lines.push('');

  // ─── Agent Performance ─────────────────────────────────────────
  if (data.agentRows && data.agentRows.length > 0) {
    lines.push(...formatAgentPerformanceTable(data.agentRows));
    lines.push('');
  }

  // ─── Skill Performance ─────────────────────────────────────────
  if (data.skillRows && data.skillRows.length > 0) {
    lines.push(...formatSkillPerformanceTable(data.skillRows));
    lines.push('');
  }

  // ─── Learnings ─────────────────────────────────────────────────
  const learnings = buildRetroLearnings(sprint, evaluations, results, data.patterns, data.debt);
  if (learnings.length > 0) {
    lines.push('## Learnings');
    for (const l of learnings) {
      lines.push(`- ${l}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Build highlight items for retro — things that went well. */
export function buildRetroHighlights(
  sprint: Sprint,
  _evaluations: Map<string, TaskEvaluation>,
  results?: TaskResult[],
  previousMetrics?: SprintMetrics,
): string[] {
  const items: string[] = [];

  const firstTry = countFirstTryTasks(results);
  if (firstTry > 0) {
    items.push(`${firstTry} task${firstTry !== 1 ? 's' : ''} completed on first try`);
  }

  const selfHealed = countSelfHealedTasks(results);
  if (selfHealed > 0) {
    items.push(`${selfHealed} task${selfHealed !== 1 ? 's' : ''} self-healed (auto-fixed errors)`);
  }

  if (sprint.metrics && sprint.metrics.boundaryViolations === 0) {
    items.push('No boundary violations detected');
  }

  // Compare with previous sprint improvements
  if (previousMetrics && sprint.metrics) {
    if (sprint.metrics.noGoRate < previousMetrics.noGoRate) {
      items.push(`NO_GO rate improved from ${previousMetrics.noGoRate.toFixed(0)}% to ${sprint.metrics.noGoRate.toFixed(0)}%`);
    }
  }

  return items;
}

/** Build issue items for retro — things that need attention. */
export function buildRetroIssues(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results?: TaskResult[],
): string[] {
  const items: string[] = [];

  // NO_GO tasks
  for (const task of sprint.tasks) {
    const ev = evaluations.get(task.id);
    if (ev === TaskEvaluation.NO_GO) {
      const result = results?.find(r => r.taskId === task.id);
      const reason = result?.notes ? ` — ${truncateNotes(result.notes)}` : '';
      items.push(`Task ${task.id} (${task.title}) failed${reason}`);
    }
  }

  // Tasks with many retries
  if (results) {
    for (const r of results) {
      const fl = r.feedbackLoop;
      if (fl && (fl.tscAttempts > 2 || fl.testAttempts > 2) && r.selfAssessment !== 'NO_GO') {
        const task = sprint.tasks.find(t => t.id === r.taskId);
        const name = task ? task.title : r.taskId;
        items.push(`Task ${r.taskId} (${name}) needed multiple retries`);
      }
    }
  }

  // Boundary violations
  if (sprint.metrics && sprint.metrics.boundaryViolations > 0) {
    items.push(`${sprint.metrics.boundaryViolations} boundary violation${sprint.metrics.boundaryViolations !== 1 ? 's' : ''} detected`);
  }

  return items;
}

/** Build learning items for retro — actionable takeaways. */
export function buildRetroLearnings(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results?: TaskResult[],
  patterns?: PatternEntry[],
  debt?: DebtItem[],
): string[] {
  const items: string[] = [];

  // NO_GO and tech debt tasks generate learnings — include worker notes when available
  for (const task of sprint.tasks) {
    const ev = evaluations.get(task.id);
    const result = results?.find(r => r.taskId === task.id);
    const notesSuffix = result?.notes ? ` — ${result.notes.slice(0, 150)}` : '';
    if (ev === TaskEvaluation.NO_GO) {
      items.push(`${task.title}: failed${notesSuffix || ' — investigate root cause'}`);
    } else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
      items.push(`${task.title}: completed with tech debt${notesSuffix || ' — schedule cleanup'}`);
    }
    if (items.length >= 10) break;
  }

  // Self-healing insights
  if (results) {
    const healingRate = calculateSelfHealingRate(results);
    if (healingRate && healingRate.percent < 50 && healingRate.attempted > 0) {
      items.push('Low self-healing rate — consider improving worker verification prompts');
    }
  }

  // Recurring patterns generate learnings
  if (patterns && patterns.length > 0) {
    const recurring = patterns.filter(p => !p.resolved && p.occurrences >= 2);
    for (const p of recurring.slice(0, 3)) {
      if (items.length >= 12) break;
      items.push(`Recurring pattern (${p.occurrences}x): ${p.pattern}`);
    }
  }

  // Open high-priority debt generates learnings
  if (debt && debt.length > 0) {
    const openHighDebt = debt.filter(d => !d.resolved && (d.priority === 'HIGH' || d.priority === 'CRITICAL'));
    for (const d of openHighDebt.slice(0, 3)) {
      if (items.length >= 12) break;
      items.push(`Open ${d.priority} debt: ${d.description}`);
    }
  }

  return items;
}

/**
 * Write the sprint retrospective to RETRO.md and append learnings to MEMORY.md.
 * Includes metrics summary, per-task results, comparison with previous sprint,
 * usage report, agent performance, and skill performance sections.
 * @param projectRoot - Project root directory
 * @param sprint - The completed sprint
 * @param evaluations - Map of task ID to evaluation result
 * @param metrics - Calculated sprint metrics
 * @param agentMap - Optional map of task ID to agent ID
 * @param skillMap - Optional map of task ID to skill ID array
 */
export function writeRetrospective(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  metrics: SprintMetrics,
  agentMap?: Map<string, string>,
  skillMap?: Map<string, string[]>,
  results?: TaskResult[],
): void {
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });

  // Build agent/skill performance data
  let agentRows: AgentPerformanceRow[] = [];
  try {
    agentRows = buildAgentPerformance(sprint, evaluations, results ?? [], agentMap);
  } catch (e) { debugLog('writeRetrospective:buildAgentPerformance', e); }

  let skillRows: SkillPerformanceRow[] = [];
  try {
    skillRows = buildSkillPerformance(sprint, evaluations, skillMap, results);
  } catch (e) { debugLog('writeRetrospective:buildSkillPerformance', e); }

  // Read previous sprint metrics for comparison
  const previousMetrics = readPreviousSprintMetrics(projectRoot, sprint.id);

  // Read patterns and debt for learnings
  let patterns: PatternEntry[] = [];
  try {
    const patternsRaw = readFileSafe(join(brainPath, PATTERNS_FILE));
    if (patternsRaw) patterns = JSON.parse(patternsRaw);
  } catch (e) { debugLog('writeRetrospective:parsePatterns', e); }

  let debt: DebtItem[] = [];
  try {
    const debtRaw = readFileSafe(join(brainPath, DEBT_FILE));
    if (debtRaw) debt = JSON.parse(debtRaw);
  } catch (e) { debugLog('writeRetrospective:parseDebt', e); }

  // Generate human-friendly RETRO content
  const retroContent = formatHumanRetro({
    sprint,
    evaluations,
    metrics,
    results,
    agentRows,
    skillRows,
    previousMetrics,
    patterns,
    debt,
  });

  // Truncate to max lines
  const retroLines = retroContent.split('\n');
  const retroPath = join(brainPath, RETRO_FILE);

  // (E) Archive existing RETRO.md before overwriting
  if (existsSync(retroPath)) {
    try {
      const archiveDir = join(brainPath, 'archive');
      mkdirSync(archiveDir, { recursive: true });
      const archivePath = join(archiveDir, `retro-${sprint.id}.md`);
      if (!existsSync(archivePath)) {
        copyFileSync(retroPath, archivePath);
      }
    } catch (e) { debugLog('writeRetrospective:archiveRetro', e); }
  }

  writeFileSync(
    retroPath,
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
      // (D) Include result.notes for richer learnings
      const result = results?.find(r => r.taskId === task.id);
      const notes = result?.notes ? ` — ${result.notes.slice(0, 120)}` : '';
      learnings.push(`- ${task.title}: ${ev}${notes}`);
    }
    if (learnings.length >= 11) break; // header + max 10
  }
  const sprintHeader = `## Sprint ${sprint.id} Learnings`;
  const alreadyHasLearnings = existingMemory?.includes(sprintHeader);
  const newMemory = alreadyHasLearnings
    ? existingMemory // Skip — already has this sprint's learnings
    : existingMemory
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
export function writeSprintLog(projectRoot: string, sprint: Sprint, metrics: SprintMetrics, evaluations?: Map<string, TaskEvaluation>, results?: TaskResult[]): void {
  const sprintsPath = join(projectRoot, BRAIN_DIR, SPRINTS_DIR);
  mkdirSync(sprintsPath, { recursive: true });

  // Collect agent/skill info from tasks
  const agentSet = new Set<string>();
  const skillSet = new Set<string>();
  let totalFilesChanged = 0;
  for (const task of sprint.tasks) {
    if (task.assignedAgent && task.assignedAgent !== 'generic') agentSet.add(task.assignedAgent);
    for (const s of task.assignedSkills ?? []) skillSet.add(s);
    const result = results?.find(r => r.taskId === task.id);
    if (result?.filesChanged) totalFilesChanged += result.filesChanged.length;
  }

  const agentsStr = agentSet.size > 0 ? [...agentSet].join(', ') : '-';
  const skillsStr = skillSet.size > 0 ? [...skillSet].join(', ') : '-';

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
    `| Duration | ${metrics.durationMs}ms |`,
    `| Files Changed | ${totalFilesChanged || '-'} |`, '',
    '## Agents',
    `Agents: ${agentsStr}`,
    `Skills: ${skillsStr}`, '',
    '## Tasks',
    '| Task | Agent | Skills | Status |',
    '|------|-------|--------|--------|',
  ];
  for (const task of sprint.tasks) {
    const evalResult = evaluations?.get(task.id);
    const statusStr = evalResult ?? task.status;
    const agentStr = task.assignedAgent ?? 'generic';
    const skillsStr = (task.assignedSkills ?? []).length > 0
      ? (task.assignedSkills ?? []).join(', ')
      : '-';
    lines.push(`| ${task.id}: ${task.title} | ${agentStr} | ${skillsStr} | ${statusStr} |`);
  }

  // Add ## Notes section for all tasks that have result notes
  const tasksWithNotes = sprint.tasks.filter(task => {
    const result = results?.find(r => r.taskId === task.id);
    return result?.notes;
  });
  if (tasksWithNotes.length > 0) {
    lines.push('', '## Notes');
    for (const task of tasksWithNotes) {
      const result = results?.find(r => r.taskId === task.id);
      const notes = (result?.notes ?? '').slice(0, 150);
      lines.push(`- ${task.id} (${task.title}): ${notes}`);
    }
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
    mode: 'performance',
    activeModeConfig: {
      max_workers: 8,
      brain_model: (modelRegistry.getByProviderAndTier('claude', 'premium')?.id ?? 'opus') as ResolvedConfig['activeModeConfig']['brain_model'],
      default_model: (modelRegistry.getByProviderAndTier('claude', 'premium')?.id ?? 'opus') as ResolvedConfig['activeModeConfig']['default_model'],
      haiku_allowed: true,
      brain_planning: 'auto',
    },
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: isInternalProject ? 'deckent' : 'deckent-project',
    projectRoot,
    version: '0.0.0',
    auto_docs: { tier1: true, tier2: true, tier3: false },
    coverage_threshold: 90,
    max_reroutes: 3,
    reroute_on_tech_debt: false,
    adaptive_thresholds: false,
    agent_min_score: 5,
    adaptive_config: { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    sprint_timeout_minutes: 0,
  };
  const ctx = { projectRoot, sprintResult, config: resolvedConfig, isInternalProject };
  const builtinResults = runAllUpdaters(ctx);
  // Run user-defined managed doc updates (non-fatal)
  try {
    const managedResults = runManagedDocUpdates(ctx);
    return [...builtinResults, ...managedResults];
  } catch (e) {
    debugLog('updateProjectDocs:managedDocs', e);
    return builtinResults;
  }
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
 * Count real test cases by scanning test files for it()/test() calls.
 * Returns the total number of test cases found in tests/ directory.
 */
export function countProjectTestCases(projectRoot: string): number {
  const testsDir = join(projectRoot, 'tests');
  if (!existsSync(testsDir)) return 0;

  let totalTests = 0;
  const testPattern = /\b(?:it|test)\s*\(/g;

  function scanDir(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.match(/\.(test|spec)\.(ts|tsx|js|jsx)$/)) {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const matches = content.match(testPattern);
            if (matches) totalTests += matches.length;
          } catch (e) { debugLog('countTestsInProject:readFile', e); }
        }
      }
    } catch (e) { debugLog('countTestsInProject:readdirSync', e); }
  }

  scanDir(testsDir);
  return totalTests;
}

/**
 * Parse statement coverage percentage from coverage/clover.xml if it exists.
 * Returns the coverage percentage (0-100), or null if unavailable.
 */
export function parseCoverageFromClover(projectRoot: string): number | null {
  const cloverPath = join(projectRoot, 'coverage', 'clover.xml');
  if (!existsSync(cloverPath)) return null;

  try {
    const xml = readFileSync(cloverPath, 'utf-8');
    // Find the project-level <metrics> element (first one after <project>)
    const projectMetrics = xml.match(/<project[^>]*>[\s\S]*?<metrics\s([^/]*?)\/>/);
    if (!projectMetrics) return null;

    const attrs = projectMetrics[1] ?? '';
    const statementsMatch = attrs.match(/statements="(\d+)"/);
    const coveredMatch = attrs.match(/coveredstatements="(\d+)"/);
    if (!statementsMatch || !coveredMatch) return null;

    const total = parseInt(statementsMatch[1] ?? '0', 10);
    const covered = parseInt(coveredMatch[1] ?? '0', 10);
    if (total === 0) return 0;

    return (covered / total) * 100;
  } catch (e) {
    debugLog('parseCoverageFromClover:parse', e);
    return null;
  }
}

/**
 * Extract sprint number from sprint ID string (e.g., "sprint-042" → 42).
 */
export function extractSprintNumber(sprintId: string): number | null {
  const match = sprintId.match(/sprint-0*(\d+)/);
  if (!match) return null;
  return parseInt(match[1] ?? '0', 10);
}

/**
 * Read the previous "Completed Tasks" value from PROJECT-IDENTITY.md.
 */
function readPreviousCompletedTasks(content: string): number {
  const match = content.match(/- Completed Tasks:\s*(\d+)/);
  if (!match) return 0;
  return parseInt(match[1] ?? '0', 10);
}

/**
 * Read the previous "Coverage" value from PROJECT-IDENTITY.md content.
 * Returns the percentage (0-100), or null if not found.
 */
function readPreviousCoverage(content: string): number | null {
  const match = content.match(/- Coverage:\s*([\d.]+)%/);
  if (!match) return null;
  const value = parseFloat(match[1] ?? '0');
  return isNaN(value) ? null : value;
}

/**
 * Get test count from vitest --reporter=json output.
 * Returns numTotalTests or null if vitest fails/times out.
 */
export function getTestCountFromVitest(projectRoot: string): number | null {
  try {
    // Skip if no package.json — vitest won't work without a project
    if (!existsSync(join(projectRoot, 'package.json'))) return null;
    const result = spawnSync('npx', ['vitest', 'run', '--reporter=json'], {
      cwd: projectRoot,
      timeout: 30_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0 && result.status !== 1) return null;
    const output = result.stdout ?? '';
    // vitest JSON output may have non-JSON preamble; find the JSON object
    const jsonStart = output.indexOf('{');
    if (jsonStart === -1) return null;
    const parsed = JSON.parse(output.slice(jsonStart)) as { numTotalTests?: number };
    if (typeof parsed.numTotalTests === 'number' && parsed.numTotalTests > 0) {
      return parsed.numTotalTests;
    }
    return null;
  } catch (e) {
    debugLog('getTestCountFromVitest:parseJSON', e);
    return null;
  }
}

/**
 * Get coverage percentage from vitest --coverage text output.
 * Parses "All files" line from the text summary. Returns percentage or null.
 */
export function getCoverageFromVitest(projectRoot: string): number | null {
  try {
    // Skip if no package.json — vitest won't work without a project
    if (!existsSync(join(projectRoot, 'package.json'))) return null;
    const result = spawnSync('npx', ['vitest', 'run', '--coverage', '--reporter=default'], {
      cwd: projectRoot,
      timeout: 60_000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0 && result.status !== 1) return null;
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    // Look for "All files" line in coverage table: "All files  |  85.5 | ..."
    const allFilesMatch = output.match(/All files[^|]*\|\s*([\d.]+)/);
    if (!allFilesMatch) return null;
    const value = parseFloat(allFilesMatch[1] ?? '0');
    return isNaN(value) ? null : value;
  } catch (e) {
    debugLog('getCoverageFromVitest:parse', e);
    return null;
  }
}

/**
 * Read the previous "Test Count" value from PROJECT-IDENTITY.md content.
 */
export function readPreviousTestCount(content: string): number | null {
  const match = content.match(/- Test Count:\s*(\d+)/);
  if (!match) return null;
  const value = parseInt(match[1] ?? '0', 10);
  return value > 0 ? value : null;
}

/**
 * Update the "Current State" section of PROJECT-IDENTITY.md after each sprint.
 * Preserves all other sections. Creates the file with defaults if missing.
 *
 * Test count fallback chain: vitest JSON → previous value → regex scan
 * Coverage fallback chain: vitest --coverage → clover.xml → previous value → metrics → 0
 * Total sprints: sprint ID number → parameter → 1
 * Completed tasks: cumulative (previous + current)
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

  // Test count fallback chain:
  // 1. vitest --reporter=json (accurate runtime count)
  // 2. Previous PROJECT-IDENTITY.md value (preserve existing)
  // 3. Regex scan of test files (last resort)
  const vitestTestCount = getTestCountFromVitest(projectRoot);
  const previousTestCount = readPreviousTestCount(content);
  const realTestCount = vitestTestCount ?? previousTestCount ?? countProjectTestCases(projectRoot);

  // Coverage fallback chain:
  // 1. vitest --coverage text summary
  // 2. clover.xml (real coverage data)
  // 3. Previous PROJECT-IDENTITY.md value (preserve existing)
  // 4. Sprint metrics coveragePercent (worker self-assessment)
  // 5. Default to 0
  const vitestCoverage = getCoverageFromVitest(projectRoot);
  const realCoverage = vitestCoverage ?? parseCoverageFromClover(projectRoot);
  const previousCoverage = readPreviousCoverage(content);
  const coverageValue =
    (realCoverage !== null && realCoverage > 0) ? realCoverage :
    (previousCoverage !== null && previousCoverage > 0) ? previousCoverage :
    (metrics.coveragePercent > 0) ? metrics.coveragePercent :
    0;

  // Total sprints: prefer sprint ID number, fallback to parameter
  const sprintNumber = extractSprintNumber(sprintId);
  const resolvedTotalSprints = sprintNumber ?? totalSprints ?? 1;

  // Completed tasks: accumulate from previous value + current sprint
  const previousCompleted = readPreviousCompletedTasks(content);
  const cumulativeCompleted = previousCompleted + metrics.completedTasks;

  // If file doesn't exist, create a minimal one
  if (!content) {
    const dirName = projectRoot.split(/[\\/]/).pop() ?? 'unknown';
    content = generateProjectIdentity({
      projectName: dirName,
      sprintId,
      totalSprints: resolvedTotalSprints,
      testCount: realTestCount,
    });
    writeFileSync(filePath, content, 'utf-8');
    return;
  }

  // Update the "Current State" section
  const lines = content.split('\n');
  const newLines: string[] = [];
  let inCurrentState = false;
  let replacedCurrentState = false;

  const stateLines = buildCurrentStateLines(
    realTestCount, coverageValue, sprintId, resolvedTotalSprints, cumulativeCompleted, metrics.noGoRate,
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line === '## Current State') {
      inCurrentState = true;
      replacedCurrentState = true;
      newLines.push('## Current State');
      newLines.push(...stateLines);
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
    newLines.push(...stateLines);
    newLines.push('');
  }

  writeFileSync(filePath, newLines.join('\n'), 'utf-8');
}

/** Build the lines for the "Current State" section. */
function buildCurrentStateLines(
  testCount: number,
  coveragePercent: number,
  sprintId: string,
  totalSprints: number,
  completedTasks: number,
  noGoRate: number,
): string[] {
  const lines = [
    `- Test Count: ${testCount}`,
    `- Coverage: ${coveragePercent.toFixed(1)}%`,
  ];
  if (coveragePercent === 0) {
    lines.push('- Coverage Note: coverage not measured');
  }
  lines.push(
    `- Last Sprint: ${sprintId}`,
    `- Total Sprints: ${totalSprints}`,
    `- Completed Tasks: ${completedTasks}`,
    `- No-Go Rate: ${noGoRate.toFixed(1)}%`,
  );
  return lines;
}

// ═══ Human-Friendly Sprint Complete ══════════════════════════════

export interface SprintCompleteData {
  sprint: Sprint;
  results?: TaskResult[];
}

/**
 * Format a human-friendly sprint completion summary.
 * No JSON, no technical jargon — a human reads this and knows exactly what happened.
 */
export function formatHumanSprintComplete(data: SprintCompleteData): string {
  const { sprint, results } = data;
  const m = sprint.metrics;
  const lines: string[] = [];

  // ─── Title ─────────────────────────────────────────────────────
  lines.push(`Sprint ${sprint.number.toString().padStart(3, '0')} Complete!`);
  lines.push('');

  // ─── Results summary ──────────────────────────────────────────
  if (m) {
    const succeeded = m.completedTasks;
    const needsAttention = m.noGoTasks;
    const attentionNote = needsAttention > 0
      ? `, ${needsAttention} need${needsAttention === 1 ? 's' : ''} attention`
      : '';
    lines.push(`Results: ${succeeded}/${m.totalTasks} tasks succeeded${attentionNote}`);
  } else {
    lines.push(`Results: ${sprint.tasks.length} tasks`);
  }

  // ─── Time ─────────────────────────────────────────────────────
  const durationStr = formatDuration(m?.durationMs);
  if (durationStr) {
    lines.push(`Time: ${durationStr}`);
  }

  // ─── Code stats from results ──────────────────────────────────
  if (results && results.length > 0) {
    const totalAdded = results.reduce((sum, r) => sum + (r.linesAdded ?? 0), 0);
    const totalRemoved = results.reduce((sum, r) => sum + (r.linesRemoved ?? 0), 0);
    if (totalAdded > 0 || totalRemoved > 0) {
      lines.push(`Code: +${totalAdded} lines added, -${totalRemoved} removed`);
    }
  }

  lines.push('');

  // ─── What went well ───────────────────────────────────────────
  const wentWell = buildWhatWentWell(sprint, results);
  if (wentWell.length > 0) {
    lines.push('What went well:');
    for (const item of wentWell) {
      lines.push(`  ✓ ${item}`);
    }
    lines.push('');
  }

  // ─── What needs attention ─────────────────────────────────────
  const needsAttention = buildWhatNeedsAttention(sprint, results);
  if (needsAttention.length > 0) {
    lines.push('What needs attention:');
    for (const item of needsAttention) {
      lines.push(`  ⚠ ${item}`);
    }
    lines.push('');
  }

  // ─── Self-healing rate ────────────────────────────────────────
  const healingRate = calculateSelfHealingRate(results);
  if (healingRate !== null) {
    lines.push(`Self-healing rate: ${healingRate.percent}% (${healingRate.healed}/${healingRate.attempted} retries succeeded)`);
    lines.push('');
  }

  // ─── Next steps ───────────────────────────────────────────────
  lines.push('Next steps:');
  lines.push('  → Run `deckent retro` for detailed retrospective');
  if (m && m.totalOpenDebt > 0) {
    lines.push('  → Run `deckent status --debt` to see tech debt');
  }
  lines.push('  → Ready for next sprint');

  return lines.join('\n');
}

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

/** Build "What went well" items from sprint data. */
export function buildWhatWentWell(sprint: Sprint, results?: TaskResult[]): string[] {
  const items: string[] = [];

  // Count tasks that completed on first try (no retries)
  const firstTryCount = countFirstTryTasks(results);
  if (firstTryCount > 0) {
    items.push(`${firstTryCount} task${firstTryCount !== 1 ? 's' : ''} completed on first try`);
  }

  // Count self-healed tasks (had retries but still succeeded)
  const selfHealedCount = countSelfHealedTasks(results);
  if (selfHealedCount > 0) {
    items.push(`${selfHealedCount} task${selfHealedCount !== 1 ? 's' : ''} self-healed (fixed their own errors)`);
  }

  // Check boundary violations
  if (sprint.metrics && sprint.metrics.boundaryViolations === 0) {
    items.push('No boundary violations');
  }

  return items;
}

/** Build "What needs attention" items from sprint data. */
export function buildWhatNeedsAttention(sprint: Sprint, results?: TaskResult[]): string[] {
  const items: string[] = [];

  // Find NO_GO tasks
  const noGoTasks = sprint.tasks.filter(t => t.status === TaskStatus.NO_GO);
  for (const task of noGoTasks) {
    const result = results?.find(r => r.taskId === task.id);
    const reason = result?.notes ? `: ${truncateNotes(result.notes)}` : '';
    items.push(`Task ${task.id} (${task.title}) — NO_GO${reason}`);
  }

  // Find tasks with many retries
  if (results) {
    for (const result of results) {
      const fl = result.feedbackLoop;
      if (fl && (fl.tscAttempts > 2 || fl.testAttempts > 2) && result.selfAssessment !== 'NO_GO') {
        const task = sprint.tasks.find(t => t.id === result.taskId);
        const name = task ? task.title : result.taskId;
        const totalRetries = (fl.tscAttempts - 1) + (fl.testAttempts - 1);
        items.push(`Task ${result.taskId} (${name}) had ${totalRetries} retries — may need attention`);
      }
    }
  }

  return items;
}

/** Truncate notes to a reasonable length for display. */
function truncateNotes(notes: string): string {
  const firstLine = notes.split('\n')[0] ?? notes;
  if (firstLine.length > 60) return firstLine.slice(0, 57) + '...';
  return firstLine;
}

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

// ═══ DEBT.md Auto-Resolve ════════════════════════════════════════

/**
 * Auto-resolve DEBT.md entries for tasks that were fixed during the FIX phase.
 * A task is "fixed" if it was NO_GO in initial evaluation but became DONE/GO_WITH_TECH_DEBT after FIX.
 * @param projectRoot - Project root directory
 * @param sprint - Current sprint object
 * @param evaluations - Map of task ID to final evaluation result
 */
export function autoResolveDebt(
  projectRoot: string,
  sprint: { id: string; tasks: Array<{ id: string; isPriorityFix?: boolean; fixForTaskId?: string }> },
  evaluations: Map<string, string>,
): number {
  const debtPath = join(projectRoot, BRAIN_DIR, DEBT_FILE);
  if (!existsSync(debtPath)) return 0;

  const content = readFileSync(debtPath, 'utf-8');
  if (!content.trim()) return 0;

  // Collect fix task IDs that resolved successfully
  const resolvedTaskIds = new Set<string>();
  for (const task of sprint.tasks) {
    if (!task.isPriorityFix || !task.fixForTaskId) continue;
    const ev = evaluations.get(task.id);
    if (ev === 'DONE' || ev === TaskEvaluation.DONE) {
      resolvedTaskIds.add(task.fixForTaskId);
    }
  }

  if (resolvedTaskIds.size === 0) return 0;

  // Process DEBT.md line by line
  const lines = content.split('\n');
  let resolvedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Match markdown table rows: | ... | taskId | ... | resolved | ...
    // Also match lines that contain a task ID reference
    for (const taskId of resolvedTaskIds) {
      if (line.includes(taskId) && !line.includes('resolved=true') && !line.includes('✅')) {
        // Mark as resolved by appending resolution info
        lines[i] = line.replace(/\|\s*$/, `| resolved=${sprint.id} |`)
          .replace(/resolved\s*=\s*false/, `resolved=true`)
          .replace(/\bfalse\b(?=[^|]*$)/, `true (${sprint.id})`);
        // If the line didn't have a resolved column pattern, append marker
        if (!lines[i]!.includes(sprint.id)) {
          lines[i] = `${line} <!-- resolved in ${sprint.id} -->`;
        }
        resolvedCount++;
      }
    }
  }

  if (resolvedCount > 0) {
    writeFileSync(debtPath, lines.join('\n'), 'utf-8');
  }

  return resolvedCount;
}

// ═══ DECISIONS.md Auto-Draft ADR ═════════════════════════════════

/**
 * Auto-draft ADR entries for new modules detected in the sprint.
 * Scans git diff for new directories under src/ and drafts a PROPOSED ADR for each.
 * @param projectRoot - Project root directory
 * @param sprintId - Current sprint ID (e.g., "sprint-044")
 */
export function autoDraftDecisions(
  projectRoot: string,
  sprintId: string,
): number {
  // Get list of added files from git
  let diffOutput: string;
  try {
    diffOutput = execSync('git diff --name-status HEAD~1', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch (e) {
    debugLog('countNewModules:gitDiff', e);
    return 0;
  }

  if (!diffOutput.trim()) return 0;

  // Parse added files under src/
  const addedFiles: string[] = [];
  for (const line of diffOutput.split('\n')) {
    const match = line.match(/^A\t(.+)$/);
    if (match && match[1]?.startsWith('src/')) {
      addedFiles.push(match[1]);
    }
  }

  if (addedFiles.length === 0) return 0;

  // Extract unique directories from added files
  const newDirs = new Set<string>();
  for (const filePath of addedFiles) {
    const parts = filePath.split('/');
    // We care about directories like src/foo/ — at least 2 segments before the file
    if (parts.length >= 3) {
      const dir = parts.slice(0, -1).join('/');
      newDirs.add(dir);
    }
  }

  if (newDirs.size === 0) return 0;

  // Filter out directories that already existed (have files other than the newly added ones)
  const trulyNewDirs: string[] = [];
  for (const dir of newDirs) {
    const fullDir = join(projectRoot, dir);
    if (!existsSync(fullDir)) continue;
    try {
      const entries = readdirSync(fullDir);
      // A directory is "new" if ALL its files are in our addedFiles list
      const dirPrefix = dir + '/';
      const allNew = entries.every(entry => {
        const entryPath = dirPrefix + entry;
        return addedFiles.includes(entryPath);
      });
      if (allNew && entries.length > 0) {
        trulyNewDirs.push(dir);
      }
    } catch (e) {
      debugLog('countNewModules:readdirSync', e);
      continue;
    }
  }

  if (trulyNewDirs.length === 0) return 0;

  // Read existing DECISIONS.md to determine next ADR number
  const decisionsPath = join(projectRoot, BRAIN_DIR, DECISIONS_FILE);
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });

  let existingContent = '';
  if (existsSync(decisionsPath)) {
    existingContent = readFileSync(decisionsPath, 'utf-8');
  }

  // Count existing ADRs to determine next number
  const adrMatches = existingContent.match(/## ADR-(\d+)/g) ?? [];
  let maxAdr = 0;
  for (const m of adrMatches) {
    const numMatch = m.match(/ADR-(\d+)/);
    if (numMatch && numMatch[1]) {
      const num = parseInt(numMatch[1], 10);
      if (num > maxAdr) maxAdr = num;
    }
  }

  // Extract sprint number for display
  const sprintNum = extractSprintNumber(sprintId) ?? sprintId;

  // Draft new ADR entries
  const newEntries: string[] = [];
  let adrCount = 0;

  for (const dir of trulyNewDirs) {
    const dirName = dir.split('/').pop() ?? dir;
    const adrNumber = String(maxAdr + adrCount + 1).padStart(3, '0');
    newEntries.push('');
    newEntries.push(`## ADR-${adrNumber}: ${dirName} (Draft — Sprint #${sprintNum})`);
    newEntries.push(`**Status:** PROPOSED`);
    newEntries.push(`**Context:** New module added in Sprint #${sprintNum}`);
    newEntries.push(`**Decision:** [To be documented]`);
    adrCount++;
  }

  if (adrCount > 0) {
    const finalContent = existingContent.trimEnd() + '\n' + newEntries.join('\n') + '\n';
    writeFileSync(decisionsPath, finalContent, 'utf-8');
  }

  return adrCount;
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
export function generateConfigSuggestions(sprintResult: SprintResult): ConfigSuggestion[] {
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
export function detectRecurringFileErrors(_projectRoot: string, sprintResults: SprintResult[]): string[] {
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
 * Add recurring error files as patterns to .brain/PATTERNS.md.
 * Returns the number of new patterns added.
 */
export function addRecurringPatternsToFile(projectRoot: string, recurringFiles: string[]): number {
  if (recurringFiles.length === 0) return 0;

  const patternsPath = join(projectRoot, BRAIN_DIR, PATTERNS_FILE);
  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });

  let data: { active: PatternEntry[]; resolved: PatternEntry[] } = { active: [], resolved: [] };
  if (existsSync(patternsPath)) {
    try {
      data = JSON.parse(readFileSync(patternsPath, 'utf-8'));
    } catch (e) {
      debugLog('appendPatterns:parsePatterns', e);
    }
  }
  if (!Array.isArray(data.active)) data.active = [];
  if (!Array.isArray(data.resolved)) data.resolved = [];

  const existingPatterns = new Set([
    ...data.active.map(p => p.pattern),
    ...data.resolved.map(p => p.pattern),
  ]);

  let added = 0;
  for (const filePath of recurringFiles) {
    const patternName = `recurring_error_${filePath.replace(/[/.]/g, '_')}`;
    if (existingPatterns.has(patternName)) continue;

    data.active.push({
      pattern: patternName,
      occurrences: 3,
      firstDetectedInSprint: 'auto-detected',
      lastDetectedInSprint: 'auto-detected',
      resolved: false,
    });
    added++;
  }

  if (added > 0) {
    writeFileSync(patternsPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  }

  return added;
}

/**
 * Build a markdown "Brain Insights" block for sprint reports.
 */
export function buildBrainInsights(
  sprintResult: SprintResult,
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

// ═══ CI Health RETRO Integration ══════════════════════════════════

/** A single CI trend data point from a sprint CI report */
export interface CiTrendEntry {
  sprintId: string;
  testCount: number;
  testFailed: number;
  coverage: number;
  tscPassed: boolean;
  timestamp: string;
}

/** CI trend analysis across multiple sprints */
export interface CiTrend {
  entries: CiTrendEntry[];
  testCountTrend: 'increasing' | 'decreasing' | 'stable';
  coverageTrend: 'increasing' | 'decreasing' | 'stable';
  totalRegressions: number;
}

/**
 * Read CI reports from the last N sprints and build trend data.
 * Reports are read from .brain/ci-report-*.json files.
 */
export function readCiReportTrend(projectRoot: string, maxSprints = 5): CiTrend {
  const brainDir = join(projectRoot, BRAIN_DIR);
  const empty: CiTrend = { entries: [], testCountTrend: 'stable', coverageTrend: 'stable', totalRegressions: 0 };
  if (!existsSync(brainDir)) return empty;

  let reportFiles: string[];
  try {
    reportFiles = readdirSync(brainDir)
      .filter(f => f.startsWith('ci-report-') && f.endsWith('.json'))
      .sort()
      .slice(-maxSprints);
  } catch (e) {
    debugLog('getCiTrend:readdirSync', e);
    return empty;
  }

  const entries: CiTrendEntry[] = [];
  for (const file of reportFiles) {
    try {
      const raw = readFileSync(join(brainDir, file), 'utf-8');
      const report = JSON.parse(raw) as {
        sprintId?: string;
        result?: { testCount?: number; testFailed?: number; coverage?: number };
        tscPassed?: boolean;
        timestamp?: string;
      };
      if (!report.sprintId || !report.result) continue;
      entries.push({
        sprintId: report.sprintId,
        testCount: report.result.testCount ?? 0,
        testFailed: report.result.testFailed ?? 0,
        coverage: report.result.coverage ?? 0,
        tscPassed: report.tscPassed ?? true,
        timestamp: report.timestamp ?? '',
      });
    } catch (e) { debugLog('getCiHistory:parseCiReport', e); }
  }

  const totalRegressions = entries.reduce((sum, e) => sum + e.testFailed, 0);

  if (entries.length < 2) {
    return { entries, testCountTrend: 'stable', coverageTrend: 'stable', totalRegressions };
  }

  const first = entries[0]!;
  const last = entries[entries.length - 1]!;

  const testDelta = last.testCount - first.testCount;
  const testCountTrend: CiTrend['testCountTrend'] =
    testDelta > 0 ? 'increasing' : testDelta < 0 ? 'decreasing' : 'stable';

  const coverageDelta = last.coverage - first.coverage;
  const coverageTrend: CiTrend['coverageTrend'] =
    coverageDelta > 0.5 ? 'increasing' : coverageDelta < -0.5 ? 'decreasing' : 'stable';

  return { entries, testCountTrend, coverageTrend, totalRegressions };
}

/**
 * Format a CI Health section for inclusion in RETRO.md.
 * Returns markdown lines including the "## CI Health" header and table.
 * Returns an empty array if report is null.
 */
export function formatCiHealthSection(report: {
  tscPassed: boolean;
  result: { testCount: number; testPassed: number; testFailed: number; coverage: number };
  delta: { newTests: number; regressions: number; coverageDelta: number };
  buildPassed: boolean;
} | null): string[] {
  if (!report) return [];

  const coverageSign = report.delta.coverageDelta >= 0 ? '+' : '';
  const coverageStr = `${report.result.coverage.toFixed(1)}% (${coverageSign}${report.delta.coverageDelta.toFixed(1)}%)`;
  const regressionLabel = report.delta.regressions === 0
    ? '0 regressions'
    : `${report.delta.regressions} regression${report.delta.regressions !== 1 ? 's' : ''}`;

  return [
    '',
    '## CI Health',
    '| What | Value |',
    '|------|-------|',
    `| tsc --noEmit | ${report.tscPassed ? 'PASS' : 'FAIL'} |`,
    `| Tests | ${report.result.testPassed}/${report.result.testCount} (${regressionLabel}) |`,
    `| New tests | +${report.delta.newTests} |`,
    `| Coverage | ${coverageStr} |`,
    `| Build | ${report.buildPassed ? 'PASS' : 'FAIL'} |`,
  ];
}

/**
 * Append a CI Health section to the existing RETRO.md file.
 * Reads the CI report for sprintId and appends a formatted markdown table.
 * Idempotent — skips if section already exists, retro file missing, or report not found.
 */
export function appendCiHealthToRetro(projectRoot: string, sprintId: string): void {
  const retroPath = join(projectRoot, BRAIN_DIR, RETRO_FILE);
  if (!existsSync(retroPath)) return;

  const reportPath = join(projectRoot, BRAIN_DIR, `ci-report-${sprintId}.json`);
  if (!existsSync(reportPath)) return;

  let report: {
    tscPassed: boolean;
    result: { testCount: number; testPassed: number; testFailed: number; coverage: number };
    delta: { newTests: number; regressions: number; coverageDelta: number };
    buildPassed: boolean;
  } | null = null;

  try {
    report = JSON.parse(readFileSync(reportPath, 'utf-8'));
  } catch (e) {
    debugLog('appendCiHealthSection:readReport', e);
    return;
  }

  const ciSection = formatCiHealthSection(report);
  if (ciSection.length === 0) return;

  const existing = readFileSync(retroPath, 'utf-8');
  if (existing.includes('## CI Health')) return; // Already has CI section

  const combined = existing.trimEnd() + '\n' + ciSection.join('\n') + '\n';
  const retroLines = combined.split('\n');
  writeFileSync(
    retroPath,
    retroLines.slice(0, RETRO_MAX_LINES).join('\n'),
    'utf-8',
  );
}

// ═══ CI Learning Integration ══════════════════════════════════════════════

/**
 * Run CI learning analysis and append CI Learnings section to MEMORY.md.
 * Called during sprint retrospective to capture cross-sprint CI insights.
 *
 * 1. Reads last N sprint CI reports
 * 2. Detects failure patterns
 * 3. Generates suggestions and config recommendations
 * 4. Writes ci-learnings.json to .brain/
 * 5. Appends CI Learnings section to MEMORY.md (idempotent)
 *
 * Non-fatal — errors are logged to stderr but never abort the sprint.
 */
export function runCiLearningAnalysis(projectRoot: string, maxSprints = 5): CiLearningResult | null {
  try {
    const result = analyzeCiLearnings(projectRoot, maxSprints);

    // Write analysis results to .brain/ci-learnings.json
    writeCiLearnings(projectRoot, result);

    // Append CI Learnings section to MEMORY.md
    if (result.reports.length > 0) {
      appendCiLearningsToMemory(projectRoot, result);
    }

    return result;
  } catch (err) {
    process.stderr.write(
      `[ci-learning] Analysis failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return null;
  }
}

/**
 * Append CI Learnings section to MEMORY.md.
 * Replaces existing "## CI Learnings" section if present.
 * Idempotent — safe to call multiple times.
 */
export function appendCiLearningsToMemory(projectRoot: string, result: CiLearningResult): void {
  const memoryPath = join(projectRoot, BRAIN_DIR, MEMORY_FILE);
  if (!existsSync(memoryPath)) return;

  const ciSection = buildCiLearningsSection(result.reports, result.patterns);
  if (!ciSection) return;

  const existing = readFileSync(memoryPath, 'utf-8');

  // Replace existing CI Learnings section
  const ciLearningsHeader = '## CI Learnings';
  if (existing.includes(ciLearningsHeader)) {
    // Find the section and replace it
    const headerIdx = existing.indexOf(ciLearningsHeader);
    const beforeSection = existing.slice(0, headerIdx);

    // Find end of section (next ## or end of file)
    const afterHeaderStart = headerIdx + ciLearningsHeader.length;
    const nextSectionMatch = existing.slice(afterHeaderStart).match(/\n## /);
    const afterSection = nextSectionMatch
      ? existing.slice(afterHeaderStart + (nextSectionMatch.index ?? existing.length))
      : '';

    const newContent = beforeSection.trimEnd() + '\n' + ciSection + '\n' + afterSection.trimStart();
    const lines = newContent.split('\n');
    const trimmed = trimMemoryWithHeader(lines, MEMORY_MAX_LINES);
    writeFileSync(memoryPath, trimmed, 'utf-8');
    return;
  }

  // Append at end
  const newContent = existing.trimEnd() + '\n' + ciSection + '\n';
  const lines = newContent.split('\n');
  const trimmed = trimMemoryWithHeader(lines, MEMORY_MAX_LINES);
  writeFileSync(memoryPath, trimmed, 'utf-8');
}

// Re-export CI learning types for consumers
export type { CiLearningResult } from '../core/ci-learning.js';

// ═══ Sprint File Collection ══════════════════════════════════════════

/** Extract sprint number from filename for numeric sorting */
function sprintFileNumber(filename: string): number {
  const m = filename.match(/sprint-(\d+)/);
  return m ? parseInt(m[1] ?? '0', 10) : 0;
}

/**
 * Collect sprint log files from both sprints/ and archive/ directories.
 * Returns entries sorted numerically by sprint number, deduped (sprints/ takes precedence).
 */
export function collectSprintFiles(root: string): Array<{ file: string; dir: string }> {
  const sprintsDir = join(root, BRAIN_DIR, SPRINTS_DIR);
  const archiveDir = join(root, BRAIN_DIR, ARCHIVE_DIR);

  const collected: Array<{ file: string; dir: string }> = [];
  const seen = new Set<string>();

  if (existsSync(sprintsDir)) {
    const files = readdirSync(sprintsDir).filter((f) => f.startsWith('sprint-') && f.endsWith('.md'));
    for (const f of files) {
      collected.push({ file: f, dir: sprintsDir });
      seen.add(f);
    }
  }

  if (existsSync(archiveDir)) {
    const files = readdirSync(archiveDir).filter((f) => f.startsWith('sprint-') && f.endsWith('.md'));
    for (const f of files) {
      if (!seen.has(f)) {
        collected.push({ file: f, dir: archiveDir });
      }
    }
  }

  collected.sort((a, b) => sprintFileNumber(a.file) - sprintFileNumber(b.file));
  return collected;
}
