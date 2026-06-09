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
import { truncateAtParagraph, inferTaskDomains } from './task-builder.js';
import { getDefaultProviderName } from './sprint-utils.js';

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
  /**
   * Minimum ADR relevance score required to include an ADR in the prompt
   * (Sprint 182 PQ-5 / F7). ADRs scoring below this threshold are dropped.
   * When every selected ADR is filtered out the entire mandatory rules block
   * (including its header) is omitted. Defaults to {@link DEFAULT_ADR_MIN_RELEVANCE}
   * when unset. Resolved from `config.prompt.adr_min_relevance` at the call site.
   */
  adrMinRelevance?: number;
}

// ─── Constants ─────────────────────────────────────────────────────────

/** Rough estimate: 1 token ≈ 4 chars for English/mixed text */
const CHARS_PER_TOKEN = 4;

/**
 * Concise, provider-agnostic Karpathy 4-discipline anchor injected into every
 * worker prompt. Replaces the former full `karpathy-discipline.md` document
 * append (~2.1K tokens/worker): the full depth still reaches Claude workers via
 * the `.claude/rules` project context and every worker via the per-skill
 * "Karpathy Notes" sections, so this short anchor preserves the cognitive
 * effect at a fraction of the token cost — uniformly across Claude/Codex/Gemini.
 */
const KARPATHY_ESSENCE = `## Karpathy Discipline
1. **Think before coding** — read the scope + ADRs, plan first, name your assumptions.
2. **Simplicity first** — reuse existing patterns; YAGNI; no premature abstraction.
3. **Surgical changes** — stay inside scope.filesWrite; minimum-diff; preserve existing behavior.
4. **Goal-driven** — map every change to the goCriteria above; assess yourself honestly.`;

/**
 * Default minimum ADR relevance score (Sprint 182 PQ-5 / F7).
 *
 * Threshold below which ADRs are dropped from the worker prompt's mandatory
 * rules block. Lenient (0.3) so that scope-only or keyword-only matches still
 * surface, but the long tail of unrelated ADRs is filtered out. Mirrors
 * `DEFAULT_PROMPT_CONFIG.adr_min_relevance` in `src/core/config.ts`; the two
 * defaults must stay in lockstep so prompt rendering is consistent whether the
 * caller threads the config through or not.
 */
export const DEFAULT_ADR_MIN_RELEVANCE = 0.3;

/**
 * Sentinel sprintId when a task has no sprintId — keeps the key deterministic.
 * @internal
 */
const IDEMPOTENCY_SPRINT_FALLBACK = 'no-sprint';

/**
 * Compute the per-task idempotency key injected into the worker prompt
 * (Sprint 182 PQ-1 / F1).
 *
 * Locked format: `${sprintId}-${taskId}-${retryCount}` — deterministic so
 * two renders of the same task yield the same key (retry-safe external API
 * calls), but task-id-unique so different tasks never collide.
 *
 * `retryCount` is sourced from `task.routingMeta.rerouteCount` (mid-sprint
 * reroute counter — the runtime expression of "retry attempt" in deckent's
 * sprint loop); missing → 0. `sprintId` is required by the contract; when a
 * caller forgets to thread it through, fall back to a sentinel rather than
 * emit `undefined-…` into the key.
 */
export function computeIdempotencyKey(task: Task): string {
  const sprintId = task.sprintId ?? IDEMPOTENCY_SPRINT_FALLBACK;
  const retryCount = task.routingMeta?.rerouteCount ?? 0;
  return `${sprintId}-${task.id}-${retryCount}`;
}

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
  // F2 (Sprint 182 PQ-2): full skill content, no truncation, no effort-based clipping.
  const skillBlock = buildSkillBlock(ctx.skillPrompts, skillNames);

  // ── 3. ADR Block (topN=3, relevance-scored) ─────────────────────────
  // Sprint 182 PQ-5 (F7): threshold-based filtering. ADRs below
  // `ctx.adrMinRelevance` (default DEFAULT_ADR_MIN_RELEVANCE) are dropped, and
  // if zero ADRs survive the entire block — header included — is omitted.
  const adrBlock = buildAdrBlock(
    task,
    ctx.allAdrs,
    adrIds,
    ctx.adrMinRelevance ?? DEFAULT_ADR_MIN_RELEVANCE,
  );

  // ── 4. Scope Rules (sanitized) ──────────────────────────────────────
  const scopeBlock = buildScopeBlock(task.scope, scopeWarnings);

  // ── 5. Dependencies Block ───────────────────────────────────────────
  const depsBlock = buildDependenciesBlock(task.dependencies, ctx.dependencies, ctx.tasksDir);

  // ── 6. Render final prompt ──────────────────────────────────────────
  // Sprint 182 PQ-1 (F1): compute deterministic idempotency key once per render
  // so the template can interpolate the resolved value instead of leaking the
  // literal `${IDEMPOTENCY_KEY}` placeholder to the worker.
  const idempotencyKey = computeIdempotencyKey(task);
  const prompt = renderTemplate({
    agentBlock,
    skillBlock,
    adrBlock,
    scopeBlock,
    depsBlock,
    task,
    effort,
    idempotencyKey,
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
  // The task itself is rendered later under the "## Your Task" header; do not
  // emit a dangling "=== Task ===" header here (it would sit above the Skills/
  // ADR blocks with no body and mislead the worker about where the task is).
  return `=== Agent: ${agentId} ===\n${agentPrompt}`;
}

// ─── Skill Block Builder ───────────────────────────────────────────────

/**
 * Build the skill prompt section. Full SKILL.md content for every assigned
 * skill — no truncation, no effort-based clipping, no skip on overflow.
 *
 * Sprint 182 PQ-2 (F2): per `feedback_prompt_completeness_over_brevity` anchor,
 * skill content is injected verbatim. The previous EFFORT_TOKEN_MAP /
 * `truncateAtParagraph` / `sectionMax` break logic was removed.
 */
function buildSkillBlock(
  skillPrompts: Array<{ name: string; content: string }> | undefined,
  outNames: string[],
): string {
  if (!skillPrompts || skillPrompts.length === 0) return '';

  const header = '=== Skills ===';
  const parts: string[] = [header];

  for (const sp of skillPrompts) {
    parts.push(`--- ${sp.name} ---\n${sp.content}`);
    outNames.push(sp.name);
  }

  // Only emit if we have at least one skill
  if (parts.length <= 1) return '';
  return parts.join('\n') + '\n';
}

// ─── ADR Block Builder ─────────────────────────────────────────────────

/**
 * Build the ADR prompt section. Full ADR content for every selected ADR —
 * no length-based summary fallback, no outer safety cap.
 *
 * Sprint 182 PQ-2 (F3): per `feedback_prompt_completeness_over_brevity` anchor,
 * mandatory ADR content is injected verbatim. The previous
 * `ADR_SUMMARY_THRESHOLD` switch and `ADR_SECTION_MAX = 6000` cap (with the
 * "(ADR content truncated for prompt size)" marker) were removed; mode is
 * always `'full'`.
 *
 * Sprint 182 PQ-5 (F7): `minScore` filters out low-relevance ADRs after the
 * top-N selection. When the threshold drops every candidate, the entire block
 * — including the `=== Mandatory Architecture Rules (ADR) ===` header — is
 * omitted so the worker is not handed a stranded empty section.
 */
function buildAdrBlock(
  task: Task,
  allAdrs: MemoryEntryV2[] | undefined,
  outIds: string[],
  minScore: number,
): string {
  if (!allAdrs || allAdrs.length === 0) return '';

  const ranked = selectRelevantAdrs(task, allAdrs, 3);
  // F7: drop ADRs whose relevance score falls below the configured threshold.
  // `selectRelevantAdrs` already filters strict-positive scores, so we apply
  // the threshold on top of that without re-running scoring.
  const filtered = minScore > 0 ? ranked.filter(r => r.score >= minScore) : ranked;
  if (filtered.length === 0) return '';

  for (const r of filtered) outIds.push(r.adrId);

  const content = buildAdrPromptSection(filtered, 'full', allAdrs);
  if (!content) return '';

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

  // Sprint 182 PQ-4 (F5): when DIRECTIVES omits an explicit `Files:` list,
  // fall back to an inferred formulation that names the assigned directories
  // instead of the vague "(determined by your task scope)" sentinel. The
  // worker now knows it may write anywhere within those directories.
  let scopeFiles: string;
  if (sanitized.filesWrite.length > 0) {
    scopeFiles = sanitized.filesWrite.map(f => `  - ${f}`).join('\n');
  } else if (scope.directories.length > 0) {
    const dirList = scope.directories.join(', ');
    scopeFiles = `  - (no explicit Files list — you may write to any file within the directories above: ${dirList})`;
  } else {
    scopeFiles = '  - (determined by your task scope)';
  }

  return `## Scope Rules
You may ONLY modify files in these directories:
${scopeDirs}

You may ONLY write to these files:
${scopeFiles}

DO NOT touch files outside your scope — the auditor will flag violations.

When writing host-facing config (hooks in \`.claude/settings.json\`, scripts in \`package.json\`, CI workflows), NEVER hard-code your container working directory (e.g. \`/workspace/...\`). That path does not exist on the user's host machine and will break at runtime. Use a portable form instead: \`$CLAUDE_PROJECT_DIR/...\`, a path relative to the project root, or a bare command resolved via PATH.`;
}

// ─── Dependencies Block Builder ────────────────────────────────────────

/** Max chars of dependency `notes` embedded into the prompt — keeps worker context bounded. */
const DEPENDENCY_NOTES_MAX_CHARS = 500;

/**
 * Maximum char count for a single dependency digest entry, header included
 * (Sprint 183 W1-3).
 *
 * Sprint 182 dogfood produced an 11-task dep chain — every predecessor digest
 * fed back into downstream prompts, and a few entries with hundreds of
 * `filesChanged` ballooned the prompt past the worker context budget, causing
 * the "Worker exited without writing result (exitCode=0)" pattern documented
 * in `docs/audits/sprint-183/worker-timeout-rc.md`.
 *
 * 2000 chars is a compromise: large enough to keep a reasonable diff summary
 * (~30 filenames + truncated notes) but small enough that 10+ deps cannot
 * cumulatively exceed the worker's safe context budget (10 × 2000 = 20K).
 */
export const DEPENDENCY_ENTRY_MAX_CHARS = 2000;

/** Suffix appended when a dependency entry is truncated for size. */
const DEPENDENCY_TRUNCATION_MARKER = '\n  - (dependency digest truncated for prompt size)';

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

  return capDependencyEntry(lines.join('\n'));
}

/**
 * Sprint 183 W1-3: enforce {@link DEPENDENCY_ENTRY_MAX_CHARS} per entry.
 *
 * When an entry exceeds the cap (long `filesChanged` list with hundreds of
 * paths is the dominant overflow source — `notes` already get a 500-char
 * paragraph cap), truncate at a UTF-8-safe slice boundary and append
 * {@link DEPENDENCY_TRUNCATION_MARKER} so the worker can tell the digest is
 * partial.
 *
 * The cap is applied after assembly so all three potential lines (header,
 * files, notes) share the budget — a single oversized line cannot push the
 * total past the bound.
 */
function capDependencyEntry(entry: string): string {
  if (entry.length <= DEPENDENCY_ENTRY_MAX_CHARS) return entry;
  const budget = DEPENDENCY_ENTRY_MAX_CHARS - DEPENDENCY_TRUNCATION_MARKER.length;
  if (budget <= 0) return entry.slice(0, DEPENDENCY_ENTRY_MAX_CHARS);
  return entry.slice(0, budget) + DEPENDENCY_TRUNCATION_MARKER;
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
  /**
   * Pre-computed idempotency key threaded by {@link buildTaskPrompt}. Inlined
   * directly into the rendered "## Idempotency Key" section — Sprint 182 PQ-1
   * (F1) replaced the previous literal `${IDEMPOTENCY_KEY}` placeholder that
   * was reaching workers verbatim because no shell expansion happened.
   */
  idempotencyKey: string;
}

function renderTemplate(input: RenderInput): string {
  const { agentBlock, skillBlock, adrBlock, scopeBlock, depsBlock, task, effort, idempotencyKey } = input;

  // Conditionally emit non-empty sections only (skip filler empty headers)
  const sections: string[] = [];

  if (agentBlock) sections.push(agentBlock);
  if (skillBlock) sections.push(skillBlock);
  if (adrBlock) sections.push(adrBlock);

  // Main worker preamble
  // Sprint 182 PQ-4 (F6): title and description live on separate lines/paragraphs.
  // The previous "${id}: ${title} — ${description}" form duplicated the title
  // when description started with the title and collapsed markdown structure
  // (lists, bold) into a single line. Now: id + title on one line, description
  // as its own paragraph so markdown survives rendering.
  sections.push(`You are a Deckent worker agent.
See .deckent/workspace/WORKER-GUIDE.md for heartbeat format, result format, and error handling rules.

## Your Task
${task.id}: ${task.title}

${task.description}

- Model: ${task.model}
- Effort: ${effort}
${task.goNogo?.goCriteria ? `\n## Definition of Done (goCriteria — your work is judged against this)\n${task.goNogo.goCriteria}${task.goNogo.noGoCriteria ? `\nNO-GO if: ${task.goNogo.noGoCriteria}` : ''}\n` : ''}
## Idempotency Key
${idempotencyKey}
Use this key for external API calls (Idempotency-Key header) to make retries safe.`);

  // What to do
  sections.push(`## What To Do
1. Read the task scope carefully — understand what files you may touch
2. Write your execution plan to .tasks/task-${task.id}.plan BEFORE coding — outline your approach, files to modify, and expected changes
3. Write the code changes described above
4. Document: update relevant docs if your changes affect them
5. Report: write your result file to .tasks/task-${task.id}.result`);

  // Verify steps — Sprint 250 MF-1: Tier-0 doc-only tasks must NOT run the full
  // test suite. The prompt previously told EVERY worker to run the project test
  // suite; shell-capable external CLIs (codex/gemini) obeyed and ran the full
  // 17k-test deckent suite on a doc-only task, which collapsed under their
  // sandbox (EROFS ~/.codex, EPERM, API-endpoint timeouts) → false NO_GO +
  // timeout despite a correct doc. Brain already exempts doc tasks at evaluation
  // (result-evaluator isDocTask→DONE); the prompt must match. Doc-only = every
  // inferred scope domain is 'doc' (reuses inferTaskDomains; cycle-safe).
  const taskDomains = inferTaskDomains(
    task.scope?.filesWrite ?? [],
    task.scope?.directories ?? [],
  );
  const isDocOnlyTask = taskDomains.length > 0 && taskDomains.every(d => d === 'doc');
  if (isDocOnlyTask) {
    sections.push(`## VERIFY STEPS (doc-only task — DO NOT run the test suite)
This is a Tier-0 documentation task: there is no source code to type-check or test. DO NOT run \`npm test\` / \`vitest\` / the project test suite — it is large, unrelated to your file, slow, and produces spurious failures that do NOT reflect your work.
1. Read your file back from disk (the path in your scope) and confirm its content satisfies the goCriteria above.
2. You MAY run a fast doc/markdown lint if one exists, but a passing test suite is NOT required and NOT expected.
Mark selfAssessment = "DONE" when the file exists and matches the goCriteria. Use "GO_WITH_TECH_DEBT" only if the content is genuinely partial; use "NO_GO" only if you could not create the file at all. Do NOT mark NO_GO because an unrelated test suite failed.`);
  } else {
    sections.push(`## CRITICAL VERIFY STEPS (DO NOT SKIP)
You MUST run the project's type check and test suite before marking your task as done.
Check the project's TOOLS.md or package.json scripts to find the right commands.

1. **Type check / static analysis** — fix ALL errors (max 3 attempts)
   Examples: \`tsc --noEmit\` (TypeScript), \`mypy\` (Python), \`go vet ./...\` (Go), \`cargo check\` (Rust)
2. **Full test suite** — fix ALL failures (max 3 attempts)
   Examples: \`npx vitest run\` / \`jest\` (Node.js), \`pytest\` (Python), \`go test ./...\` (Go), \`cargo test\` (Rust)

If BOTH pass → selfAssessment = "DONE"
If minor issues remain → selfAssessment = "GO_WITH_TECH_DEBT" with details in notes
If Bash tool is unavailable → report in notes, selfAssessment = "GO_WITH_TECH_DEBT"
If tests fail after 3 attempts → selfAssessment = "NO_GO" with error details`);
  }

  // Scope block
  sections.push(scopeBlock);

  // Dependencies (only if non-empty)
  if (depsBlock) sections.push(depsBlock);

  // Heartbeat
  sections.push(`## Heartbeat
Create .tasks/task-${task.id}.hb BEFORE starting work with workerId "w-${task.id}", status "EXECUTING".
Update periodically: increment sequence, refresh timestamp via new Date().toISOString() (UTC ISO 8601).`);

  // Result + self-assessment — single authority section. Folds the former
  // separate "## Result File" and "## Honest Self-Assessment" sections so the
  // result/verdict instructions are stated once instead of 4×.
  // Sprint 202 Task 202-003: registry default before the absolute 'claude' floor
  // so prompts emitted in pure-Ollama configs don't hard-code 'claude' into
  // worker token-usage instructions.
  const provider = task.provider ?? getDefaultProviderName();
  sections.push(`## Result & Self-Assessment
Write .tasks/task-${task.id}.result with: taskId, filesChanged, testsPassed, selfAssessment ("DONE"|"GO_WITH_TECH_DEBT"|"NO_GO"), notes, and tokenUsage with ALL four fields { "inputTokens": <number>, "outputTokens": <number>, "cacheReadTokens": <number>, "provider": "${provider}", "model": "${task.model}" } (provider/model hardcoded as shown; a missing tokenUsage is rejected as NO_GO).
Assess yourself honestly against the goCriteria above: compare the baseline state to the end state and judge how much you ACTUALLY completed. "Code written" ≠ "DONE". <80% → GO_WITH_TECH_DEBT (name the gap); <50% → NO_GO (explain).
CRITICAL: never exit without writing the .result file — even on failure, write selfAssessment "NO_GO" with error details. A missing result file stalls the entire sprint.`);

  // Karpathy 4-discipline cognitive anchor (concise, provider-agnostic).
  sections.push(KARPATHY_ESSENCE);

  return sections.join('\n\n');
}
