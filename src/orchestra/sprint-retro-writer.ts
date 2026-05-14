// ─── Sprint Retro Writer ─────────────────────────────────────────
// Extracted from sprint-reporter.ts — retro generation, learnings, memory, decay
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation, TaskStatus } from '../core/types.js';
import type {
  TaskResult, Sprint, SprintMetrics, DebtItem, PatternEntry,
} from '../core/types.js';
import {
  BRAIN_DIR, MEMORY_FILE, RETRO_FILE, MEMORY_MAX_LINES, RETRO_MAX_LINES,
  MEMORY_DB_FILE,
} from '../core/constants.js';
import { MemoryStore } from '../core/memory-store.js';
import { debugLog } from '../core/utils.js';
import { assessQuality } from './quality-assessor.js';
import {
  formatDuration,
  formatAgentPerformanceTable,
  formatSkillPerformanceTable,
  buildTokenUsageSection,
  buildAgentPerformance,
  buildSkillPerformance,
  calculateSelfHealingRate,
  countFirstTryTasks,
  countSelfHealedTasks,
  countNewTestFiles,
  readPreviousSprintMetrics,
  type AgentPerformanceRow,
  type SkillPerformanceRow,
} from './sprint-metrics.js';

// ═══ Internal Helpers ══════════════════════════════════════════════

function readFileSafe(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (e) {
    debugLog('readFileSafe:readFile', e);
    return '';
  }
}

/** Truncate notes to a reasonable length for display. */
function truncateNotes(notes: string): string {
  const firstLine = notes.split('\n')[0] ?? notes;
  if (firstLine.length > 60) return firstLine.slice(0, 57) + '...';
  return firstLine;
}

// ═══ Memory Trimming ═════════════════════════════════════════════

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

  // ─── Token Usage ──────────────────────────────────────────────
  const tokenLines = buildTokenUsageSection(results);
  if (tokenLines.length > 0) {
    lines.push(...tokenLines);
    lines.push('');
  }

  // ─── Rubric Scores ────────────────────────────────────────────────
  const rubricSection = formatRubricScoresSection(sprint, results);
  if (rubricSection.length > 0) {
    lines.push(...rubricSection);
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

// ═══ Quality Dimensions Section (formerly Rubric Scores) ════════

/**
 * Format a quality dimensions table for RETRO.md using Quality Assessor scores.
 * Sprint 146: Uses assessQuality() dimensions as the canonical scoring system.
 * Falls back to deprecated rubricScores for backward compatibility with old results.
 */
export function formatRubricScoresSection(
  sprint: Sprint,
  results?: TaskResult[],
): string[] {
  if (!results || results.length === 0) return [];

  const lines: string[] = [];
  const sprintLabel = sprint.id;
  lines.push(`### Quality Dimensions (${sprintLabel})`);
  lines.push('| Task | Correctness | Coverage | Scope Adherence | Completeness | Overall |');
  lines.push('|------|-------------|----------|-----------------|--------------|---------|');

  const overallScores: number[] = [];

  for (const result of results) {
    const task = sprint.tasks.find(t => t.id === result.taskId);
    if (!task) continue;

    const label = `${result.taskId} — ${task.title.slice(0, 30)}`;

    // Compute Quality Assessor dimensions inline
    const evaluation = result.evaluationDecision ?? result.selfAssessment ?? 'DONE';
    const score = assessQuality(task, result, evaluation);

    const d = score.dimensions;
    overallScores.push(score.overall);

    lines.push(`| ${label} | ${d.correctness} | ${d.coverage} | ${d.scopeAdherence} | ${d.completeness} | ${score.overall} |`);
  }

  if (overallScores.length === 0) return [];

  // Overall sprint average
  const overallAvg = Math.round(overallScores.reduce((a, b) => a + b, 0) / overallScores.length);
  lines.push(`| **Sprint Avg** | — | — | — | — | **${overallAvg}** |`);

  return lines;
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

// ═══ Write Retrospective ═════════════════════════════════════════

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

  // Read patterns and debt for learnings (DB-first)
  let patterns: PatternEntry[] = [];
  let debt: DebtItem[] = [];
  const dbPath = join(brainPath, MEMORY_DB_FILE);
  if (existsSync(dbPath)) {
    try {
      const store = new MemoryStore(dbPath);
      try {
        const patternEntries = store.getByType('pattern');
        patterns = patternEntries.map(p => ({
          pattern: p.title,
          occurrences: (JSON.parse(p.metadata || '{}') as Record<string, unknown>).occurrences as number ?? 1,
          firstDetectedInSprint: p.sprint_id ?? '',
          lastDetectedInSprint: p.sprint_id ?? '',
          resolved: p.status === 'resolved',
        }));
        const debtEntries = store.getByType('debt').filter(d => d.status !== 'resolved');
        debt = debtEntries.map(d => {
          const meta = JSON.parse(d.metadata || '{}') as Record<string, unknown>;
          return {
            id: d.id,
            description: d.title,
            originTaskId: (meta.originTaskId as string) ?? '',
            originSprintId: (meta.originSprintId as string) ?? d.sprint_id ?? '',
            priority: (d.priority?.toUpperCase() ?? 'NORMAL') as DebtItem['priority'],
            sprintsOpen: (meta.sprintsOpen as number) ?? 0,
            resolved: false,
            createdAt: d.created_at,
          };
        });
      } finally { store.close(); }
    } catch (e) { debugLog('writeRetrospective:readFromDB', e); }
  }

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

  // ─── DB dual-write: sprint + retro + memory entries ─────────
  // Bug U fix (Sprint 166): also write type='sprint' so each sprint has
  // a queryable entry (Sprint 140+ had only retro/memory rows, no sprint row).
  if (existsSync(dbPath)) {
    try {
      const store = new MemoryStore(dbPath);
      try {
        const sprintNum = parseInt(sprint.id.replace(/\D/g, ''), 10) || 0;

        // Write/update sprint metadata entry (Bug U fix)
        const sprintSummary = buildSprintEntrySummary(sprint, metrics, evaluations);
        store.upsert({
          id: `sprint-${sprintNum}`,
          type: 'sprint',
          title: `Sprint ${sprint.id}`,
          content: sprintSummary,
          source: 'brain',
          sprint_id: sprint.id,
          sprint_num: sprintNum,
          status: 'active',
          tags: ['sprint', sprint.id],
        }, 'brain');

        // Write/update retro entry
        store.upsert({
          id: `retro-${sprint.id}`,
          type: 'retro',
          title: `Sprint ${sprint.id} Retrospective`,
          content: retroContent,
          source: 'brain',
          sprint_id: sprint.id,
          sprint_num: sprintNum,
          tags: ['retro', sprint.id],
        }, 'brain');

        // Write memory/learning entries (one per sprint, skip if already exists)
        const memId = `mem-${sprint.id}`;
        if (!store.getById(memId)) {
          const learningContent = learnings.join('\n');
          store.insert({
            id: memId,
            type: 'memory',
            title: `Sprint ${sprint.id} Learnings`,
            content: learningContent,
            source: 'brain',
            sprint_id: sprint.id,
            sprint_num: sprintNum,
            tags: ['learning', sprint.id],
          });
        }
      } finally {
        store.close();
      }
    } catch {
      // DB write failure is non-fatal — file write already succeeded
    }
  }
}

/**
 * Build a compact sprint summary stored in the `type='sprint'` entry content.
 * Sprint 166 Bug U fix — gives downstream consumers (memory-query, summary
 * export) a single row per sprint with at-a-glance metrics.
 */
function buildSprintEntrySummary(
  sprint: Sprint,
  metrics: SprintMetrics,
  evaluations: Map<string, TaskEvaluation>,
): string {
  const lines: string[] = [];
  lines.push(`# ${sprint.id}`);
  lines.push('');
  lines.push(`- Total tasks: ${metrics.totalTasks}`);
  lines.push(`- Completed: ${metrics.completedTasks}`);
  lines.push(`- NO_GO: ${metrics.noGoTasks}`);
  if (typeof metrics.coveragePercent === 'number') {
    lines.push(`- Coverage: ${metrics.coveragePercent.toFixed(1)}%`);
  }
  if (typeof metrics.durationMs === 'number') {
    lines.push(`- Duration: ${metrics.durationMs}ms`);
  }

  // Per-task evaluation roll-up (compact)
  if (sprint.tasks.length > 0) {
    lines.push('');
    lines.push('## Task Outcomes');
    for (const task of sprint.tasks) {
      const ev: string = evaluations.get(task.id) ?? 'PENDING';
      lines.push(`- ${task.id}: ${ev}`);
    }
  }

  return lines.join('\n');
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

// Re-export types that consumers need from sprint-metrics
export type { AgentPerformanceRow, SkillPerformanceRow, SelfHealingRate } from './sprint-metrics.js';
