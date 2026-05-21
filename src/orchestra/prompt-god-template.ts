// ─── Prompt God Template ────────────────────────────────────────────────────
// Single entry point for building worker prompts.
// Pipeline: classifyTaskType → selectAgent → selectSkills → selectRelevantAdrs
//           → sanitizeScope → renderTemplate → PromptArtifact
//
// Sprint 146 — Task 146-005

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Task, TaskScope } from '../core/task-types.js';
import type { MemoryEntryV2 } from '../core/memory-types.js';
import { selectRelevantAdrs, buildAdrPromptSection } from './adr-selector.js';
import { sanitizeScope } from './scope-sanitizer.js';
import { truncateAtParagraph } from './task-builder.js';

// ─── Public Types ──────────────────────────────────────────────────────

export interface PromptArtifact {
  prompt: string;
  metadata: {
    agent: string;
    skills: string[];
    adrIds: string[];
    scopeWarnings: string[];
    charCount: number;
    estimatedTokens: number;
  };
}

/**
 * Minimal sprint context needed for prompt generation.
 * Callers construct this from their available data.
 */
export interface SprintContext {
  /** Agent prompt content (full PROMPT.md text) */
  agentPrompt?: string;
  /** Agent ID assigned to this task */
  agentId?: string;
  /** Skill prompts to inject */
  skillPrompts?: Array<{ name: string; content: string }>;
  /** All accepted ADR entries from memory store */
  allAdrs?: MemoryEntryV2[];
  /** Worker effort level */
  effort?: 'max' | 'high' | 'medium' | 'low';
  /** Dependencies info (task IDs this task depends on) */
  dependencies?: string[];
  /** Directory containing `.tasks/` result files (defaults to `<cwd>/.tasks`). Used for enriching dependency block. */
  tasksDir?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────

/** Rough estimate: 1 token ≈ 4 chars for English/mixed text */
const CHARS_PER_TOKEN = 4;

/** Maximum chars threshold for switching ADR mode to summary */
const ADR_SUMMARY_THRESHOLD = 3000;

/** Effort → max tokens per skill */
const EFFORT_TOKEN_MAP: Record<string, number> = {
  max: 2500, high: 2500, medium: 1500, normal: 1500, low: 1000,
};

// ─── Main API ──────────────────────────────────────────────────────────

/**
 * Build the complete worker prompt for a task.
 *
 * Single entry point that replaces inline prompt rendering.
 * Pipeline: classifyTaskType → build agent block → build skill block →
 *           selectRelevantAdrs (topN=3) → sanitizeScope → render template.
 */
export function buildTaskPrompt(task: Task, ctx: SprintContext): PromptArtifact {
  const effort = ctx.effort ?? 'medium';
  const agentId = ctx.agentId ?? task.assignedAgent ?? 'generic';
  const skillNames: string[] = [];
  const adrIds: string[] = [];
  const scopeWarnings: string[] = [];

  // ── 1. Agent Block ──────────────────────────────────────────────────
  const agentBlock = buildAgentBlock(agentId, ctx.agentPrompt);

  // ── 2. Skill Block ──────────────────────────────────────────────────
  const skillBlock = buildSkillBlock(ctx.skillPrompts, effort, skillNames);

  // ── 3. ADR Block (topN=3, relevance-scored) ─────────────────────────
  const adrBlock = buildAdrBlock(task, ctx.allAdrs, adrIds);

  // ── 4. Scope Rules (sanitized) ──────────────────────────────────────
  const scopeBlock = buildScopeBlock(task.scope, scopeWarnings);

  // ── 5. Dependencies Block ───────────────────────────────────────────
  const depsBlock = buildDependenciesBlock(task.dependencies, ctx.dependencies, ctx.tasksDir);

  // ── 6. Render final prompt ──────────────────────────────────────────
  const prompt = renderTemplate({
    agentBlock,
    skillBlock,
    adrBlock,
    scopeBlock,
    depsBlock,
    task,
    effort,
  });

  const charCount = prompt.length;
  const estimatedTokens = Math.ceil(charCount / CHARS_PER_TOKEN);

  return {
    prompt,
    metadata: {
      agent: agentId,
      skills: skillNames,
      adrIds,
      scopeWarnings,
      charCount,
      estimatedTokens,
    },
  };
}

// ─── Agent Block Builder ───────────────────────────────────────────────

function buildAgentBlock(agentId: string, agentPrompt?: string): string {
  if (!agentPrompt) return '';
  return `=== Agent: ${agentId} ===\n${agentPrompt}\n\n=== Task ===\n`;
}

// ─── Skill Block Builder ───────────────────────────────────────────────

function buildSkillBlock(
  skillPrompts: Array<{ name: string; content: string }> | undefined,
  effort: string,
  outNames: string[],
): string {
  if (!skillPrompts || skillPrompts.length === 0) return '';

  const perItemMax = EFFORT_TOKEN_MAP[effort] ?? 1500;
  const sectionMax = Math.round(perItemMax * 2.67);

  const header = '=== Skills ===';
  const parts: string[] = [header];
  let totalLen = header.length;

  for (const sp of skillPrompts) {
    const truncated = truncateAtParagraph(sp.content, perItemMax);
    const entry = `--- ${sp.name} ---\n${truncated}`;
    if (totalLen + entry.length + 1 > sectionMax) break;
    parts.push(entry);
    totalLen += entry.length + 1;
    outNames.push(sp.name);
  }

  // Only emit if we have at least one skill
  if (parts.length <= 1) return '';
  return parts.join('\n') + '\n';
}

// ─── ADR Block Builder ─────────────────────────────────────────────────

function buildAdrBlock(
  task: Task,
  allAdrs: MemoryEntryV2[] | undefined,
  outIds: string[],
): string {
  if (!allAdrs || allAdrs.length === 0) return '';

  const ranked = selectRelevantAdrs(task, allAdrs, 3);
  if (ranked.length === 0) return '';

  for (const r of ranked) outIds.push(r.adrId);

  // Determine mode: if any selected ADR's content > threshold, use summary
  const hasLongAdr = ranked.some(r => {
    const entry = allAdrs.find(a => a.id === r.adrId);
    return entry?.content && entry.content.length > ADR_SUMMARY_THRESHOLD;
  });
  const mode: 'full' | 'summary' = hasLongAdr ? 'summary' : 'full';

  let content = buildAdrPromptSection(ranked, mode, allAdrs);
  if (!content) return '';

  // Safety cap: truncate if ADR section exceeds reasonable limit
  const ADR_SECTION_MAX = 6000;
  if (content.length > ADR_SECTION_MAX) {
    content = content.slice(0, ADR_SECTION_MAX) + '\n\n(ADR content truncated for prompt size)';
  }

  return `=== Mandatory Architecture Rules (ADR) ===\nAll accepted ADRs below are mandatory constraints. Violating an accepted ADR requires a NO_GO result + ADR amendment proposal.\n\n${content}\n`;
}

// ─── Scope Block Builder ───────────────────────────────────────────────

function buildScopeBlock(scope: TaskScope, outWarnings: string[]): string {
  // Sanitize filesWrite
  const sanitized = sanitizeScope(scope.filesWrite);
  for (const w of sanitized.warnings) outWarnings.push(w);
  for (const r of sanitized.rejected) outWarnings.push(`Rejected path: ${r}`);

  const scopeDirs = scope.directories.length > 0
    ? scope.directories.map(d => `  - ${d}`).join('\n')
    : '  - (no directory restriction)';

  const scopeFiles = sanitized.filesWrite.length > 0
    ? sanitized.filesWrite.map(f => `  - ${f}`).join('\n')
    : '  - (determined by your task scope)';

  return `## Scope Rules
You may ONLY modify files in these directories:
${scopeDirs}

You may ONLY write to these files:
${scopeFiles}

DO NOT touch files outside your scope — the auditor will flag violations.`;
}

// ─── Dependencies Block Builder ────────────────────────────────────────

/** Max chars of dependency `notes` embedded into the prompt — keeps worker context bounded. */
const DEPENDENCY_NOTES_MAX_CHARS = 500;

/** Subset of `.tasks/task-{id}.result` fields the dependency block embeds. */
interface DependencyResultDigest {
  selfAssessment?: string;
  filesChanged?: string[];
  linesAdded?: number;
  linesRemoved?: number;
  notes?: string;
  /**
   * When set, this digest represents a fix-retry whose target is the named
   * task. Sprint 179 W0-1 (Bug A): downstream prompts must surface both the
   * original NO_GO digest *and* the latest fix DONE digest so the worker
   * understands which artifact is current.
   */
  originalTaskId?: string;
}

/**
 * In-memory dependency digest for {@link buildDependenciesBlock} object-form.
 * Verdict is the worker self-assessment (or evaluator verdict if known).
 *
 * Sprint 179 W0-1 (Bug A): introduced so test/runtime call sites can pass
 * pre-collected results without round-tripping through `.tasks/*.result`.
 */
export interface DependencyResultEntry {
  verdict: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  filesChanged?: string[];
  linesAdded?: number;
  linesRemoved?: number;
  notes?: string;
  originalTaskId?: string;
}

/** Object-form arguments for {@link buildDependenciesBlock} (Sprint 179 W0-1). */
export interface BuildDependenciesBlockInput {
  currentTaskId?: string;
  deps: string[];
  results: ReadonlyMap<string, DependencyResultEntry>;
}

const VERDICT_RANK_DIGEST: Record<DependencyResultEntry['verdict'], number> = {
  NO_GO: 0,
  GO_WITH_TECH_DEBT: 1,
  DONE: 2,
};

function entryToDigest(entry: DependencyResultEntry): DependencyResultDigest {
  return {
    selfAssessment: entry.verdict,
    filesChanged: entry.filesChanged,
    linesAdded: entry.linesAdded,
    linesRemoved: entry.linesRemoved,
    notes: entry.notes,
    originalTaskId: entry.originalTaskId,
  };
}

/**
 * Read and shape a previously-completed dependency's `.result` file.
 * Returns null when the file does not exist or cannot be parsed — callers render
 * a "Pending" placeholder in that case.
 */
function readDependencyResult(depId: string, tasksDir: string): DependencyResultDigest | null {
  const filePath = join(tasksDir, `task-${depId}.result`);
  if (!existsSync(filePath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  return {
    selfAssessment: typeof obj.selfAssessment === 'string' ? obj.selfAssessment : undefined,
    filesChanged: Array.isArray(obj.filesChanged)
      ? obj.filesChanged.filter((f): f is string => typeof f === 'string')
      : undefined,
    linesAdded: typeof obj.linesAdded === 'number' ? obj.linesAdded : undefined,
    linesRemoved: typeof obj.linesRemoved === 'number' ? obj.linesRemoved : undefined,
    notes: typeof obj.notes === 'string' ? obj.notes : undefined,
  };
}

/**
 * Format a single dependency entry. Header is `## Dependency {id} ({status})`,
 * body lines: `- Files: …` and `- Notes: …`. When `result` is null, body is the
 * literal `Pending (not yet complete)` sentinel so downstream consumers can match it.
 */
function formatDependencyEntry(depId: string, result: DependencyResultDigest | null): string {
  if (!result) {
    return `## Dependency ${depId} (Pending)\nPending (not yet complete)`;
  }
  const status = result.selfAssessment ?? 'UNKNOWN';
  const lines: string[] = [`## Dependency ${depId} (${status})`];

  if (result.filesChanged && result.filesChanged.length > 0) {
    const filesList = result.filesChanged.join(', ');
    const added = result.linesAdded;
    const removed = result.linesRemoved;
    const hasDelta = (typeof added === 'number' && added > 0) || (typeof removed === 'number' && removed > 0);
    if (hasDelta) {
      lines.push(`- Files: ${filesList} (+${added ?? 0}/-${removed ?? 0})`);
    } else {
      lines.push(`- Files: ${filesList}`);
    }
  }

  if (result.notes) {
    const notesText = truncateAtParagraph(result.notes, DEPENDENCY_NOTES_MAX_CHARS);
    lines.push(`- Notes: ${notesText}`);
  }

  return lines.join('\n');
}

export function buildDependenciesBlock(input: BuildDependenciesBlockInput): string;
export function buildDependenciesBlock(
  taskDeps?: string[],
  ctxDeps?: string[],
  tasksDir?: string,
): string;
export function buildDependenciesBlock(
  arg1?: string[] | BuildDependenciesBlockInput,
  ctxDeps?: string[],
  tasksDir?: string,
): string {
  // ── Object-form (Sprint 179 W0-1): aggregate-aware in-memory results ─
  if (arg1 && !Array.isArray(arg1) && typeof arg1 === 'object') {
    const { deps, results } = arg1;
    if (!deps || deps.length === 0) return '';
    const entries = deps.map(depId => formatAggregateEntry(depId, results));
    return `## Dependencies
This task depends on: ${deps.join(', ')}
Ensure dependent tasks are complete before starting.

${entries.join('\n\n')}`;
  }

  // ── Legacy disk-based form (backward compatible) ────────────────────
  const taskDeps = arg1 as string[] | undefined;
  const deps = taskDeps?.length ? taskDeps : ctxDeps;
  if (!deps || deps.length === 0) return '';

  const resolvedDir = tasksDir ?? join(process.cwd(), '.tasks');
  const entries = deps.map(depId => formatDependencyEntry(depId, readDependencyResult(depId, resolvedDir)));

  return `## Dependencies
This task depends on: ${deps.join(', ')}
Ensure dependent tasks are complete before starting.

${entries.join('\n\n')}`;
}

/**
 * Sprint 179 W0-1 (Bug A): format a dependency that may have an original
 * record and zero-or-more fix retries. Emits header with aggregate verdict
 * then individual sub-entries (Original / Fix:{id}) so the worker sees the
 * full trajectory.
 */
function formatAggregateEntry(
  depId: string,
  results: ReadonlyMap<string, DependencyResultEntry>,
): string {
  const original = results.get(depId);
  const fixes: Array<{ id: string; entry: DependencyResultEntry }> = [];
  for (const [id, entry] of results) {
    if (entry.originalTaskId === depId) fixes.push({ id, entry });
  }

  if (!original && fixes.length === 0) {
    return `## Dependency ${depId} (Pending)\nPending (not yet complete)`;
  }

  let aggregate: DependencyResultEntry['verdict'] = original?.verdict ?? 'NO_GO';
  for (const { entry } of fixes) {
    if (VERDICT_RANK_DIGEST[entry.verdict] > VERDICT_RANK_DIGEST[aggregate]) {
      aggregate = entry.verdict;
    }
  }

  const lines: string[] = [`## Dependency ${depId} (aggregate: ${aggregate})`];
  if (original) {
    lines.push(`### Original ${depId} (${original.verdict})`);
    const body = formatDependencyEntry(depId, entryToDigest(original))
      .split('\n')
      .slice(1) // drop the synthetic "## Dependency …" header
      .join('\n');
    if (body) lines.push(body);
  }
  for (const { id, entry } of fixes) {
    lines.push(`### Fix ${id} (${entry.verdict})`);
    const body = formatDependencyEntry(id, entryToDigest(entry))
      .split('\n')
      .slice(1)
      .join('\n');
    if (body) lines.push(body);
  }
  return lines.join('\n');
}

// ─── Template Renderer ─────────────────────────────────────────────────

interface RenderInput {
  agentBlock: string;
  skillBlock: string;
  adrBlock: string;
  scopeBlock: string;
  depsBlock: string;
  task: Task;
  effort: string;
}

function renderTemplate(input: RenderInput): string {
  const { agentBlock, skillBlock, adrBlock, scopeBlock, depsBlock, task, effort } = input;

  // Conditionally emit non-empty sections only (skip filler empty headers)
  const sections: string[] = [];

  if (agentBlock) sections.push(agentBlock);
  if (skillBlock) sections.push(skillBlock);
  if (adrBlock) sections.push(adrBlock);

  // Main worker preamble
  sections.push(`You are a Deckent worker agent.
See .deckent/workspace/WORKER-GUIDE.md for heartbeat format, result format, and error handling rules.

## Your Task
${task.id}: ${task.title} — ${task.description}
- Model: ${task.model}
- Effort: ${effort}

## Idempotency Key
\${IDEMPOTENCY_KEY}
Use this key for external API calls (Idempotency-Key header) to make retries safe.`);

  // What to do
  sections.push(`## What To Do
1. Read the task scope carefully — understand what files you may touch
2. Write your execution plan to .tasks/task-${task.id}.plan BEFORE coding — outline your approach, files to modify, and expected changes
3. Write the code changes described above
4. Document: update relevant docs if your changes affect them
5. Report: write your result file to .tasks/task-${task.id}.result`);

  // Verify steps
  sections.push(`## CRITICAL VERIFY STEPS (DO NOT SKIP)
You MUST run these commands before marking your task as done:

1. \`tsc --noEmit\` — fix ALL type errors (max 3 attempts)
2. \`npx vitest run\` — fix ALL test failures (max 3 attempts)

If BOTH pass → selfAssessment = "DONE"
If minor issues remain → selfAssessment = "GO_WITH_TECH_DEBT" with details in notes
If Bash tool is unavailable → report in notes, selfAssessment = "GO_WITH_TECH_DEBT"
If tests fail after 3 attempts → selfAssessment = "NO_GO" with error details`);

  // Scope block
  sections.push(scopeBlock);

  // Dependencies (only if non-empty)
  if (depsBlock) sections.push(depsBlock);

  // Heartbeat
  sections.push(`## Heartbeat
Create .tasks/task-${task.id}.hb BEFORE starting work with workerId "w-${task.id}", status "EXECUTING".
Update periodically: increment sequence, refresh timestamp via new Date().toISOString() (UTC ISO 8601).`);

  // Result file + token usage
  const provider = task.provider ?? 'claude';
  sections.push(`## Result File
Write to: .tasks/task-${task.id}.result with taskId, filesChanged, testsPassed, selfAssessment ("DONE"|"GO_WITH_TECH_DEBT"|"NO_GO"), notes.
MUST include tokenUsage with ALL four fields: { "inputTokens": <number>, "outputTokens": <number>, "cacheReadTokens": <number>, "provider": "${provider}", "model": "${task.model}" }.
  - inputTokens: your best estimate of prompt/input tokens consumed (REQUIRED — use 0 only if truly unknown)
  - outputTokens: your best estimate of completion/output tokens produced (REQUIRED — use 0 only if truly unknown)
  - cacheReadTokens: cache read tokens if applicable (optional, default 0)
  - provider: MUST be "${provider}" (hardcoded for this task)
  - model: MUST be "${task.model}" (hardcoded for this task)
Sprint 140 will reject results with missing tokenUsage as NO_GO. Partial tokenUsage (missing provider/model) generates warnings in Sprint 139.
The result file is REQUIRED — without it your work cannot be evaluated.

CRITICAL: You MUST write a .result file before exiting. Even if tests fail, write selfAssessment: "NO_GO" with error details. Never exit without writing .tasks/task-${task.id}.result — a missing result file causes the entire sprint to stall.`);

  // Honest self-assessment
  sections.push(`## Honest Self-Assessment Required
Before writing .result with selfAssessment: DONE, you MUST verify:
1. Baseline state: what was the test/code state before your work?
2. End state: what is it now?
3. Delta: how much of the task did you ACTUALLY complete?

If <80%, write GO_WITH_TECH_DEBT with specific gap.
If <50%, write NO_GO with explanation.
"DONE" means functional outcome matches task spec fully.
"Code written" ≠ "DONE".`);

  return sections.join('\n\n');
}
