// ─── Sprint Retro Writer ─────────────────────────────────────────
// Extracted from sprint-reporter.ts — retro generation, learnings, memory, decay
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation, TaskStatus } from '../core/types.js';
import type {
  TaskResult, Sprint, SprintMetrics, DebtItem, PatternEntry,
} from '../core/types.js';
import {
  BRAIN_DIR, MEMORY_DB_FILE,
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

/** Truncate notes to a reasonable length for display. */
function truncateNotes(notes: string): string {
  const firstLine = notes.split('\n')[0] ?? notes;
  if (firstLine.length > 60) return firstLine.slice(0, 57) + '...';
  return firstLine;
}

/**
 * Render a human-readable task label by stripping the leading DIRECTIVES
 * slot-id prefix ("NNN-NNN — …") from the title.
 *
 * `task.title` embeds the plan-slot id, which can differ from the real
 * `task.id` after auto-debt prepend offset drift (e.g. id=198-006 but
 * title="198-005 — …"). We strip the prefix so labels read cleanly and the
 * canonical id is shown exactly once by the caller. A spaced separator is
 * required so date-like tokens ("2024-01-report") are never mistaken for a
 * slot prefix. Falls back to the full title, then the id, when empty.
 */
export function renderTaskLabel(task: { id: string; title: string }): string {
  const title = (task.title ?? '').trim();
  const stripped = title.replace(/^\d+-\d+\s+[—–-]\s+/, '').trim();
  return stripped || title || task.id;
}

/** First sentence (or first line) of a notes blob, capped for compact display. */
function firstSentence(notes: string): string {
  const firstLine = (notes.split('\n')[0] ?? '').trim();
  const dot = firstLine.indexOf('. ');
  const sentence = dot > 0 ? firstLine.slice(0, dot + 1) : firstLine;
  return sentence.length > 100 ? sentence.slice(0, 97) + '...' : sentence;
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

// ═══ Next Sprint Behavior Changes (Sprint 212 Task 7) ════════════
//
// Make F5 evolution visible after each sprint. Renders agent skill mutations
// (212-002 adaptAgentRuntime → RoutingOutcome.skillAdaptation), and accepts
// future genealogy / retirement signals (212-003 / 212-004) via the optional
// inputs on buildNextSprintBehaviorChanges — user feedback: "kazanım hissedemiyorum"
// (evolution happened but was invisible).

/** Shape of a single skill-adaptation row consumed by the retro renderer.
 *  Matches `RoutingOutcome.skillAdaptation` from outcome-tracker (Task 212-002)
 *  without importing the full RoutingOutcome type to avoid coupling. */
export interface SkillAdaptationInput {
  agentId: string;
  suggestAdd: string[];
  suggestRemove: string[];
  reason: string;
}

/** Future-extension placeholder for genealogy entries (Task 212-003). */
export interface GenealogyChangeInput {
  agentId: string;
  parentAgentId?: string;
  mutation?: string;
}

/** Future-extension placeholder for retirement entries (Task 212-004). */
export interface RetirementChangeInput {
  agentId: string;
  reason?: string;
}

/** A single rendered line in the "Next Sprint Behavior Changes" section. */
export interface BehaviorChange {
  category:
    | 'agent-skill-add'
    | 'agent-skill-remove'
    | 'agent-genealogy'
    | 'agent-retirement'
    | 'decision-pattern';
  summary: string;
}

export interface BehaviorChangeInputs {
  skillAdaptations?: SkillAdaptationInput[];
  /** Optional — Task 212-003 wire (degrades gracefully when absent). */
  genealogy?: GenealogyChangeInput[];
  /** Optional — Task 212-004 wire (degrades gracefully when absent). */
  retirements?: RetirementChangeInput[];
}

/**
 * Build the list of nextSprintChanges visible in the retro. Each non-empty
 * suggestion (skill add/remove, genealogy lineage, retirement) becomes one
 * BehaviorChange row. Returns an empty array when nothing to report — caller
 * suppresses the section header in that case (graceful empty).
 */
export function buildNextSprintBehaviorChanges(
  inputs?: BehaviorChangeInputs,
): BehaviorChange[] {
  const changes: BehaviorChange[] = [];
  if (!inputs) return changes;

  for (const adapt of inputs.skillAdaptations ?? []) {
    if (adapt.suggestAdd && adapt.suggestAdd.length > 0) {
      const skillList = adapt.suggestAdd.join(', ');
      const reason = adapt.reason ? ` (${adapt.reason})` : '';
      changes.push({
        category: 'agent-skill-add',
        summary: `${adapt.agentId}: gain skill${adapt.suggestAdd.length !== 1 ? 's' : ''} ${skillList}${reason}`,
      });
    }
    if (adapt.suggestRemove && adapt.suggestRemove.length > 0) {
      const skillList = adapt.suggestRemove.join(', ');
      changes.push({
        category: 'agent-skill-remove',
        summary: `${adapt.agentId}: drop skill${adapt.suggestRemove.length !== 1 ? 's' : ''} ${skillList}`,
      });
    }
  }

  for (const lineage of inputs.genealogy ?? []) {
    const parent = lineage.parentAgentId ? ` from ${lineage.parentAgentId}` : '';
    const mutation = lineage.mutation ? ` — ${lineage.mutation}` : '';
    changes.push({
      category: 'agent-genealogy',
      summary: `${lineage.agentId}: lineage recorded${parent}${mutation}`,
    });
  }

  for (const retire of inputs.retirements ?? []) {
    const reason = retire.reason ? ` (${retire.reason})` : '';
    changes.push({
      category: 'agent-retirement',
      summary: `${retire.agentId}: retired${reason}`,
    });
  }

  return changes;
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
  /** Sprint 212 Task 7: visible evolution per sprint (skill mutations, genealogy, retirement). */
  behaviorChanges?: BehaviorChange[];
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

  // ─── Next Sprint Behavior Changes (Sprint 212 Task 7) ──────────
  // Surfaces F5 evolution outputs (skill mutations from 212-002, genealogy
  // from 212-003, retirement from 212-004) so each sprint shows a visible
  // delta. Section is omitted when no behavior changes are observed.
  const behaviorChanges = data.behaviorChanges ?? [];
  if (behaviorChanges.length > 0) {
    lines.push('## Next Sprint Behavior Changes');
    for (const change of behaviorChanges) {
      lines.push(`- [${change.category}] ${change.summary}`);
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
  evaluations: Map<string, TaskEvaluation>,
  results?: TaskResult[],
  previousMetrics?: SprintMetrics,
): string[] {
  const items: string[] = [];

  // Name the top DONE deliverables so the retro shows WHAT shipped, not just
  // aggregate counters. Capped to keep the Highlights section scannable.
  const DELIVERED_CAP = 5;
  const delivered = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.DONE);
  for (const task of delivered.slice(0, DELIVERED_CAP)) {
    items.push(`Delivered: ${renderTaskLabel(task)}`);
  }

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
 * Build the per-sprint `memory` entry content (the `mem-sprint-NNN` row).
 *
 * Two sections so retrospective reads carry both the problems and the wins:
 *   - problem lines (NO_GO / GO_WITH_TECH_DEBT) — kept first, with worker notes;
 *   - a `## Gains` section naming the DONE deliverables (with the first sentence
 *     of the worker's notes), so all-DONE sprints are no longer near-empty.
 * Each section is capped independently so a DONE-heavy sprint can never crowd
 * out a problem line, and the export stays within the MEMORY line budget.
 */
export function buildSprintMemoryContent(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results?: TaskResult[],
): string {
  const PROBLEM_CAP = 10;
  const GAINS_CAP = 8;
  const lines: string[] = [`## Sprint ${sprint.id} Learnings`];

  // Problems first — NO_GO / tech debt keep priority.
  let problemCount = 0;
  for (const task of sprint.tasks) {
    if (problemCount >= PROBLEM_CAP) break;
    const ev = evaluations.get(task.id);
    if (ev === TaskEvaluation.NO_GO || ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
      const result = results?.find(r => r.taskId === task.id);
      const notes = result?.notes ? ` — ${result.notes.slice(0, 120)}` : '';
      lines.push(`- ${task.title}: ${ev}${notes}`);
      problemCount++;
    }
  }

  // Gains — what the sprint actually delivered.
  const doneTasks = sprint.tasks.filter(t => evaluations.get(t.id) === TaskEvaluation.DONE);
  if (doneTasks.length > 0) {
    lines.push('');
    lines.push('## Gains');
    const shown = doneTasks.slice(0, GAINS_CAP);
    for (const task of shown) {
      const result = results?.find(r => r.taskId === task.id);
      const note = result?.notes ? ` — ${firstSentence(result.notes)}` : '';
      lines.push(`- ${task.id} — ${renderTaskLabel(task)}${note}`);
    }
    if (doneTasks.length > shown.length) {
      lines.push(`- …and ${doneTasks.length - shown.length} more delivered`);
    }
  }

  return lines.join('\n');
}

// ═══ Behavior Changes — Outcomes File Loader (Sprint 212 Task 7) ═
//
// Reads `.deckent/routing/outcomes/<sprintId>.json` (the same file outcome-tracker
// writes via saveSprintOutcome) and extracts every `skillAdaptation` field so the
// retro renderer can surface them as "Next Sprint Behavior Changes". Returns an
// empty array when the file is missing or malformed — degrades gracefully.
export function loadBehaviorChangesFromOutcomes(
  projectRoot: string,
  sprintId: string,
): BehaviorChange[] {
  const outcomesPath = join(projectRoot, '.deckent/routing/outcomes', `${sprintId}.json`);
  if (!existsSync(outcomesPath)) return [];

  try {
    const raw = readFileSync(outcomesPath, 'utf-8');
    const outcomes = JSON.parse(raw) as Array<{ skillAdaptation?: SkillAdaptationInput }>;
    const skillAdaptations: SkillAdaptationInput[] = [];
    for (const o of outcomes) {
      if (o.skillAdaptation) skillAdaptations.push(o.skillAdaptation);
    }
    return buildNextSprintBehaviorChanges({ skillAdaptations });
  } catch (e) {
    debugLog('sprint-retro-writer:loadBehaviorChangesFromOutcomes', e);
    return [];
  }
}

// ═══ Write Retrospective ═════════════════════════════════════════

/**
 * Result of a {@link writeRetrospective} invocation. Surfaces which DB rows
 * landed and which failed so callers (and Sprint 190 carry-over bug RC tests)
 * can detect the "Sprint 189 retro entry not written" pattern without having
 * to query the DB themselves. Previously this was a `void` return — silent
 * DB-write failures masked Sprint 189 carry-over [[project_sprint189_retro_db_missing]].
 */
export interface WriteRetrospectiveResult {
  /** DB write attempted (file write + DB hook reached). */
  dbAttempted: boolean;
  /** `sprint-log-NNN` row upserted. */
  sprintLogWritten: boolean;
  /** `retro-<sprintId>` row upserted. */
  retroWritten: boolean;
  /** `mem-<sprintId>` row inserted (or skipped if pre-existing). */
  memoryWritten: boolean;
  /** Captured error message when the DB step throws; `null` when it succeeds. */
  dbError: string | null;
}

/**
 * Sprint 192 Task 192-005 — close the chronic Sprint 167+ DB-gap.
 *
 * Default writeRetrospective() behavior preserves the legacy clean-skip
 * contract: when `.brain/memory.db` does not exist, the DB hook is a no-op
 * and `dbAttempted=false`. The chronic gap symptom (Sprint 189/190 retro
 * rows never landing) traced back to this exact short-circuit running on
 * environments where finalize ran before any other DB seeding step.
 *
 * `createIfMissing: true` instructs the writer to auto-materialize
 * `.brain/` + `memory.db` before attempting the upserts. sprint-finalizer
 * opts in so the retro row always lands, even on the very first sprint
 * in a fresh project.
 */
export interface WriteRetrospectiveOptions {
  /** Auto-create `.brain/` + `memory.db` when missing (default: false, back-compat). */
  createIfMissing?: boolean;
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
  opts?: WriteRetrospectiveOptions,
): WriteRetrospectiveResult {
  const writeResult: WriteRetrospectiveResult = {
    dbAttempted: false,
    sprintLogWritten: false,
    retroWritten: false,
    memoryWritten: false,
    dbError: null,
  };
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

  // Sprint 212 Task 7: load routing outcomes from disk (written by outcome-tracker
  // via Task 212-002 wire) and extract per-agent skillAdaptation rows so the retro
  // can render "Next Sprint Behavior Changes". Silent no-op when the outcomes
  // file is absent (e.g. first sprint, or test envs without routing wired).
  const behaviorChanges = loadBehaviorChangesFromOutcomes(projectRoot, sprint.id);

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
    behaviorChanges,
  });

  // B8 (Memory V2): the legacy `.brain/RETRO.md` + `.brain/MEMORY.md` file
  // writers (and the RETRO.md archive copy) were removed — the retro and the
  // per-sprint learnings are persisted only to memory.db below. `deckent
  // retro` / MCP `retro` / `deckent explain` read the `retro` entry from the
  // DB; sprint learnings are surfaced via `.brain/exports/memory.md`.

  // Build per-sprint learnings (persisted to the DB `memory` entry below).
  // Problems (NO_GO / tech debt) AND a Gains section for DONE deliverables —
  // see buildSprintMemoryContent.
  const learningContent = buildSprintMemoryContent(sprint, evaluations, results);

  // ─── DB write: sprint + retro + memory entries ──────────────
  // Bug U fix (Sprint 166): also write type='sprint' so each sprint has
  // a queryable entry (Sprint 140+ had only retro/memory rows, no sprint row).
  // Sprint 168 C0a-3 (BUG-DD): ID prefix `sprint-NNN` was non-canonical and
  // did not match the triple-link contract (`sprint-log-NNN`). Switched to
  // canonical `sprint-log-${sprintNum}` per Sprint 143 plan L593 + Sprint
  // 168 plan L1384. Forensic: Sprint 167 finalize emitted `sprint-167`
  // instead of `sprint-log-167`, causing the audit query miss.
  // Sprint 192 Task 192-005: when `opts.createIfMissing` is true, materialize
  // `.brain/memory.db` even when absent — closes the chronic gap
  // ([[project_sprint167_db_gap]]) where finalize would silently skip on
  // fresh projects.
  if (opts?.createIfMissing && !existsSync(dbPath)) {
    mkdirSync(brainPath, { recursive: true });
  }
  if (existsSync(dbPath) || opts?.createIfMissing) {
    writeResult.dbAttempted = true;
    try {
      const store = new MemoryStore(dbPath);
      try {
        const sprintNum = parseInt(sprint.id.replace(/\D/g, ''), 10) || 0;

        // Write/update sprint metadata entry (Bug U fix / BUG-DD canonical ID)
        const sprintSummary = buildSprintEntrySummary(sprint, metrics, evaluations);
        store.upsert({
          id: `sprint-log-${sprintNum}`,
          type: 'sprint',
          title: `Sprint ${sprint.id}`,
          content: sprintSummary,
          source: 'brain',
          sprint_id: sprint.id,
          sprint_num: sprintNum,
          status: 'active',
          tags: ['sprint', sprint.id],
          decay_exempt: true,
        }, 'brain');
        writeResult.sprintLogWritten = true;

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
          decay_exempt: true,
        }, 'brain');
        writeResult.retroWritten = true;

        // Write memory/learning entries (one per sprint, skip if already exists)
        const memId = `mem-${sprint.id}`;
        if (!store.getById(memId)) {
          store.insert({
            id: memId,
            type: 'memory',
            title: `Sprint ${sprint.id} Learnings`,
            content: learningContent,
            source: 'brain',
            sprint_id: sprint.id,
            sprint_num: sprintNum,
            tags: ['learning', sprint.id],
            decay_exempt: true,
          });
          writeResult.memoryWritten = true;
        } else {
          // Pre-existing memory entry is treated as success (idempotent finalize).
          writeResult.memoryWritten = true;
        }
      } finally {
        store.close();
      }
    } catch (e) {
      // RC for Sprint 189 carry-over [[project_sprint189_retro_db_missing]]:
      // the previous silent catch swallowed DB-write failures, leaving the
      // memory.db without sprint/retro/memory rows while the file writes
      // looked successful. Capture the error so callers and tests can detect
      // the divergence; preserve non-fatal semantics (no rethrow — sprint
      // finalize keeps running).
      writeResult.dbError = e instanceof Error ? e.message : String(e);
      debugLog('writeRetrospective:dbWrite', e);
    }
  }

  return writeResult;
}

// ═══ Backfill (Sprint 192 Task 192-005) ════════════════════════════
//
// Chronic gap closure: sprints whose finalize ran before the DB existed
// (Sprint 189/190 [[project_sprint167_db_gap]]) need a manual landing for
// the canonical sprint-log + retro + mem trio. `backfillSprintRetro` is
// the supported API for that — keeps the contract identical to
// `writeRetrospective`'s DB block so the rows shape match what finalize
// would have produced.

export interface BackfillSprintRetroInput {
  /** Canonical sprint ID, e.g. `sprint-189`. */
  sprintId: string;
  /** Retro markdown content to persist as the `retro-<sprintId>` body. */
  retroContent: string;
  /** Optional sprint-log content; defaults to a minimal generated summary. */
  sprintLogContent?: string;
  /** Optional memory content; defaults to a minimal generated learnings stub. */
  memoryContent?: string;
}

/**
 * Manually persist sprint-log + retro + mem rows for a sprint whose
 * finalize never wrote them. Idempotent — second call upserts existing
 * rows. Auto-creates `.brain/memory.db` when missing.
 */
export function backfillSprintRetro(
  projectRoot: string,
  input: BackfillSprintRetroInput,
): WriteRetrospectiveResult {
  const result: WriteRetrospectiveResult = {
    dbAttempted: false,
    sprintLogWritten: false,
    retroWritten: false,
    memoryWritten: false,
    dbError: null,
  };

  const brainPath = join(projectRoot, BRAIN_DIR);
  mkdirSync(brainPath, { recursive: true });
  const dbPath = join(brainPath, MEMORY_DB_FILE);
  const sprintNum = parseInt(input.sprintId.replace(/\D/g, ''), 10) || 0;

  result.dbAttempted = true;
  try {
    const store = new MemoryStore(dbPath);
    try {
      store.upsert({
        id: `sprint-log-${sprintNum}`,
        type: 'sprint',
        title: `Sprint ${input.sprintId}`,
        content: input.sprintLogContent ?? `# ${input.sprintId}\n\n- Backfilled via backfillSprintRetro\n`,
        source: 'brain',
        sprint_id: input.sprintId,
        sprint_num: sprintNum,
        status: 'active',
        tags: ['sprint', input.sprintId, 'backfill'],
        decay_exempt: true,
      }, 'brain');
      result.sprintLogWritten = true;

      store.upsert({
        id: `retro-${input.sprintId}`,
        type: 'retro',
        title: `Sprint ${input.sprintId} Retrospective`,
        content: input.retroContent,
        source: 'brain',
        sprint_id: input.sprintId,
        sprint_num: sprintNum,
        tags: ['retro', input.sprintId, 'backfill'],
        decay_exempt: true,
      }, 'brain');
      result.retroWritten = true;

      const memId = `mem-${input.sprintId}`;
      const existing = store.getById(memId);
      if (existing) {
        if (input.memoryContent !== undefined && existing.content !== input.memoryContent) {
          store.update(memId, { content: input.memoryContent }, 'brain');
        }
        result.memoryWritten = true;
      } else {
        store.insert({
          id: memId,
          type: 'memory',
          title: `Sprint ${input.sprintId} Learnings`,
          content: input.memoryContent ?? `## Sprint ${input.sprintId} Learnings\n- Backfilled via backfillSprintRetro\n`,
          source: 'brain',
          sprint_id: input.sprintId,
          sprint_num: sprintNum,
          tags: ['learning', input.sprintId, 'backfill'],
          decay_exempt: true,
        });
        result.memoryWritten = true;
      }
    } finally {
      store.close();
    }
  } catch (e) {
    result.dbError = e instanceof Error ? e.message : String(e);
    debugLog('backfillSprintRetro', e);
  }

  return result;
}

/**
 * Append a supplementary section to a sprint's `retro` entry in memory.db.
 *
 * B8 (Memory V2): the retrospective lives in the DB (no `.brain/RETRO.md`
 * file). Finalize-time detail sections — rubric scores, adaptive-threshold
 * notes, gate-failure detail, code-verified reconciliation — are appended to
 * the `retro-<sprintId>` entry's content here instead of the legacy file.
 *
 * Idempotent: skips when `marker` is already present in the content. A
 * graceful no-op when the DB or the retro entry is absent.
 *
 * @returns true when the section was appended.
 */
export function appendRetroSection(
  projectRoot: string,
  sprintId: string,
  marker: string,
  section: string,
): boolean {
  const dbPath = join(projectRoot, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return false;
  try {
    const store = new MemoryStore(dbPath);
    try {
      const entry = store.getById(`retro-${sprintId}`);
      if (!entry || entry.content.includes(marker)) return false;
      store.update(entry.id, { content: entry.content + section }, 'brain');
      return true;
    } finally {
      store.close();
    }
  } catch (e) {
    debugLog('appendRetroSection', e);
    return false;
  }
}

/**
 * Build a compact sprint summary stored in the `type='sprint'` entry content.
 * Sprint 166 Bug U fix — gives downstream consumers (memory-query, summary
 * export) a single row per sprint with at-a-glance metrics.
 */
export function buildSprintEntrySummary(
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
      // `- id: EV — clean-title` — the title is parser-safe (parseTaskOutcomes
      // anchors on id + decision and tolerates a trailing label).
      lines.push(`- ${task.id}: ${ev} — ${renderTaskLabel(task)}`);
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
