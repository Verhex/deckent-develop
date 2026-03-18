// ─── Sprint Reporting ──────────────────────────────────────────────
// Extracted from brain.ts — retrospective, sprint log, metrics, doc updates
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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

// 12. writeRetrospective
export function writeRetrospective(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  metrics: SprintMetrics,
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
