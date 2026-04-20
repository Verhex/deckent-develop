// ─── Prompt God Template ────────────────────────────────────────────────────
// Single entry point for building worker prompts.
// Pipeline: classifyTaskType → selectAgent → selectSkills → selectRelevantAdrs
//           → sanitizeScope → renderTemplate → PromptArtifact
//
// Sprint 146 — Task 146-005

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
  const depsBlock = buildDependenciesBlock(task.dependencies, ctx.dependencies);

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

function buildDependenciesBlock(
  taskDeps?: string[],
  ctxDeps?: string[],
): string {
  const deps = taskDeps?.length ? taskDeps : ctxDeps;
  if (!deps || deps.length === 0) return '';

  return `## Dependencies
This task depends on: ${deps.join(', ')}
Ensure dependent tasks are complete before starting.`;
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
- Effort: ${effort}`);

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
