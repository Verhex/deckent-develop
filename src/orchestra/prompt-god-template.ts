// ─── Prompt God Template ────────────────────────────────────────────────────
// Single entry point for building worker prompts.
// Pipeline: classifyTaskType → selectAgent → selectSkills → selectRelevantAdrs
//           → sanitizeScope → renderSegments → (optional leading-T0 reorder) → PromptArtifact
//
// Sprint 146 — Task 146-005 · tier segmentation Sprint 330 — Task 330-019

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Task, TaskScope } from '../core/task-types.js';
import type { MemoryEntryV2 } from '../core/memory-types.js';
import { selectRelevantAdrs, buildAdrPromptSection } from './adr-selector.js';
import { sanitizeScope } from './scope-sanitizer.js';
import { truncateAtParagraph, inferTaskDomains } from './task-builder.js';
import { getDefaultProviderName } from './sprint-utils.js';
import {
  reorderLeadingT0,
  DEFAULT_LEADING_T0_REORDER,
  SEGMENT_SEPARATOR,
  type PromptTier,
  type PromptSegment,
  type PromptSegmentKind,
} from './prompt-segmentation.js';

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
 * A compiled worker prompt plus its tier-tagged segmentation (Sprint 330 330-019).
 *
 * Superset of {@link PromptArtifact}: `segments` carries the ordered T0/T1/T2
 * {@link PromptSegment}s the prompt was assembled from, so the provider-agnostic
 * prompt cache can key on the byte-stable prefix while only the volatile tail
 * varies. `prompt` is exactly `segments.map(s => s.content).join('\n\n')`.
 */
export interface SegmentedPrompt {
  prompt: string;
  segments: PromptSegment[];
  metadata: PromptArtifact['metadata'];
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
  /**
   * Notes other workers shared via SharedMemory (Sprint 278 COMM-1 / 278-003).
   *
   * Populated by the caller ONLY when `worker_comms.enabled && inject_shared`;
   * the gating lives at the call site (task-builder), so when this is undefined
   * or empty the rendered prompt is byte-for-byte identical to the pre-COMM-1
   * output. Rendered by {@link buildSharedContextBlock} into a block appended at
   * the very END of the prompt (most task-specific region) so the shared
   * Skills→Agent→ADR cache prefix is never split (F1-TOK lesson).
   */
  sharedContext?: SharedContextEntry[];
  /**
   * Executed upstream handoffs targeting this task (Sprint 278 COMM-1 / 278-004).
   *
   * Populated by the caller ONLY when `worker_comms.enabled && inject_handoffs`;
   * the gating lives at the call site (task-builder), so when this is undefined
   * or empty the rendered prompt is byte-for-byte identical to the pre-COMM-1
   * output. Rendered by {@link buildHandoffBlock} into a block appended at the
   * very END of the prompt (next to the Shared Context block, most task-specific
   * region) so the shared Skills→Agent→ADR cache prefix is never split.
   */
  upstreamHandoffs?: UpstreamHandoffEntry[];
  /**
   * Whether `worker_comms.enabled` is true for this sprint (Sprint 278 COMM-1 / 278-006).
   *
   * When true, the worker prompt receives a short instruction block explaining
   * how to populate `sharedNotes` and `handoffNotes` in the `.result` file.
   * Set by the caller (task-builder) from `config.worker_comms?.enabled`.
   * When absent or false the instruction block is omitted entirely — the
   * rendered prompt is byte-for-byte identical to the pre-COMM-1 output.
   * Rendered by {@link buildWorkerCommsInstructionBlock} and appended at the
   * very END of the prompt (after sharedBlock and handoffBlock) so the shared
   * Skills→Agent→ADR cache prefix is never split (F1-TOK lesson).
   */
  workerCommsEnabled?: boolean;
  /**
   * Live count of pre-existing test failures at THIS sprint's baseline (WP-14).
   *
   * Sourced by the caller (task-builder `buildWorkerPrompt`) from the sprint
   * baseline snapshot (`readBaseline(projectRoot, sprintId).fail`, written by the
   * sprint controller at sprint start). Feeds the CRITICAL VERIFY STEPS note so
   * the worker is told the REAL pre-existing-failure count instead of a stale
   * hardcoded "~67" (ADR-070 zero-hardcode): a green suite that still cites "~67"
   * lets a worker dismiss failures it actually introduced. `undefined` when no
   * baseline was captured → the note warns generically without inventing a count.
   */
  preExistingFailures?: number;
  /**
   * Leading-T0 cache reorder (Sprint 330 330-019 — provider-agnostic prompt cache).
   *
   * EXPERIMENTAL, default-OFF ({@link DEFAULT_LEADING_T0_REORDER}). When true the
   * compiled prompt is reassembled so the global (T0) then project (T1) tiers lead
   * contiguously — maximising the byte-stable prefix a provider cache can share
   * across tasks. When false/undefined the production assembly order (skills first,
   * per the F1-TOK cache-prefix lesson) is preserved byte-for-byte, so the
   * prompt-determinism guard stays green. Wire from a config flag at the call site;
   * never blind-default-on (CLAUDE.md quality bar: risky reorder is flag-gated).
   */
  leadingT0Reorder?: boolean;
}

/**
 * A single inter-worker shared-context entry (Sprint 278 COMM-1 / 278-003).
 * Sourced from a {@link SharedMemory} write performed by another worker:
 * `key`/`writerId` come from the store, `value` is the stringified payload.
 */
export interface SharedContextEntry {
  /** SharedMemory key the upstream worker wrote under. */
  key: string;
  /** Task id of the worker that wrote the entry. */
  writerId: string;
  /** Stringified shared value. */
  value: string;
}

/**
 * A single executed upstream handoff targeting this task (Sprint 278 COMM-1 / 278-004).
 * Sourced from a {@link HandoffProtocol} `ready` handoff whose `toTaskId` is the
 * current task. Decoupled from the `Handoff` shape on purpose (same precedent as
 * {@link SharedContextEntry} vs SharedMemory) so this module stays free of
 * orchestra cross-imports.
 */
export interface UpstreamHandoffEntry {
  /** Task id of the upstream worker that produced the handoff. */
  fromTaskId: string;
  /** Artifact paths carried by the handoff (relative to project root). */
  artifacts: string[];
  /** Free-text message from the upstream worker (Task 5 `handoffNotes`), if any. */
  notes?: string;
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
  const { prompt, metadata } = buildTaskPromptSegmented(task, ctx);
  return { prompt, metadata };
}

/**
 * Build the worker prompt AND its tier-tagged segmentation (Sprint 330 330-019).
 *
 * Identical pipeline to {@link buildTaskPrompt}, but returns the ordered
 * {@link PromptSegment}[] alongside the rendered prompt so the provider-agnostic
 * prompt cache (and the determinism / protected-set guards) can reason about the
 * T0/T1/T2 tiers. When `ctx.leadingT0Reorder` is set the segments are reassembled
 * leading-T0 for a longer shared cache prefix; otherwise the production assembly
 * order (skills first) is preserved byte-for-byte — `buildTaskPrompt` therefore
 * stays byte-identical to its pre-330-019 output on the default path.
 */
export function buildTaskPromptSegmented(task: Task, ctx: SprintContext): SegmentedPrompt {
  const effort = ctx.effort ?? 'medium';
  const agentId = ctx.agentId ?? task.assignedAgent ?? 'generic';
  const skillNames: string[] = [];
  const adrIds: string[] = [];
  const scopeWarnings: string[] = [];

  // ── 1. Agent Block ──────────────────────────────────────────────────
  const agentBlock = buildAgentBlock(agentId, ctx.agentPrompt);

  // ── 2. Skill Block ──────────────────────────────────────────────────
  // F2 (Sprint 182 PQ-2): full skill content, no truncation, no effort-based clipping.
  // WP-17: drop any skill whose name matches the assigned agent (e.g. api-builder
  // exists as BOTH a vertical agent and a horizontal skill). The agent persona is
  // the authoritative one for the task; injecting the same-named skill on top just
  // double-spends tokens on ~40% overlapping content. Non-colliding skills stay.
  const dedupedSkillPrompts = dedupeAgentNamedSkills(ctx.skillPrompts, agentId);
  const skillBlock = buildSkillBlock(dedupedSkillPrompts, skillNames);

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
  // PROMPT-W1 (d): decide once which optional boilerplate this task needs.
  const boilerplate = conditionalBoilerplate(task);
  const scopeBlock = buildScopeBlock(task.scope, scopeWarnings, boilerplate.hostConfig);

  // ── 5. Dependencies Block ───────────────────────────────────────────
  const depsBlock = buildDependenciesBlock(task.dependencies, ctx.dependencies, ctx.tasksDir);

  // ── 5b. Shared Context Block (Sprint 278 COMM-1 / 278-003) ──────────
  // Caller (task-builder) populates ctx.sharedContext ONLY when
  // worker_comms.enabled && inject_shared; empty/undefined → '' (no block).
  const sharedBlock = buildSharedContextBlock(ctx.sharedContext);

  // ── 5c. Upstream Handoff Block (Sprint 278 COMM-1 / 278-004) ────────
  // Caller (task-builder) populates ctx.upstreamHandoffs ONLY when
  // worker_comms.enabled && inject_handoffs; empty/undefined → '' (no block).
  const handoffBlock = buildHandoffBlock(ctx.upstreamHandoffs);

  // ── 5d. Worker Comms Instruction Block (Sprint 278 COMM-1 / 278-006) ─
  // Emitted ONLY when worker_comms.enabled — tells workers how to write
  // sharedNotes/handoffNotes to their .result. Without this instruction
  // workers never know these fields exist (Tasks 1-5 path stays empty).
  const commsInstructionBlock = buildWorkerCommsInstructionBlock(ctx.workerCommsEnabled);

  // ── 6. Render final prompt ──────────────────────────────────────────
  // Sprint 182 PQ-1 (F1): compute deterministic idempotency key once per render
  // so the template can interpolate the resolved value instead of leaking the
  // literal `${IDEMPOTENCY_KEY}` placeholder to the worker.
  const idempotencyKey = computeIdempotencyKey(task);
  const defaultOrder = renderSegments({
    agentBlock,
    skillBlock,
    adrBlock,
    scopeBlock,
    depsBlock,
    sharedBlock,
    handoffBlock,
    commsInstructionBlock,
    task,
    effort,
    idempotencyKey,
    emitIdempotency: boilerplate.idempotency,
    preExistingFailures: ctx.preExistingFailures,
  });

  // Leading-T0 reorder (default-OFF): regroup tiers (T0→T1→T2) for the longest
  // shareable cache prefix. OFF → production order preserved byte-for-byte, so the
  // prompt-determinism guard (skills-first block order) stays green.
  const reorder = ctx.leadingT0Reorder ?? DEFAULT_LEADING_T0_REORDER;
  const segments = reorder ? reorderLeadingT0(defaultOrder) : defaultOrder;
  const prompt = segments.map(s => s.content).join(SEGMENT_SEPARATOR);

  const charCount = prompt.length;
  const estimatedTokens = Math.ceil(charCount / CHARS_PER_TOKEN);

  return {
    prompt,
    segments,
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
 * Drop any skill whose name matches the assigned agent (WP-17, case-insensitive).
 *
 * Several capabilities exist as BOTH a vertical agent and a horizontal skill of
 * the same id (api-builder, devops-engineer, …). When such an agent is assigned,
 * the agent PROMPT.md already carries the persona; re-injecting the same-named
 * SKILL.md duplicates ~40% of the content for no signal. Returns the input
 * untouched (same reference semantics for the empty/no-collision case) so the
 * byte-for-byte prompt is preserved whenever nothing collides.
 */
function dedupeAgentNamedSkills(
  skillPrompts: Array<{ name: string; content: string }> | undefined,
  agentId: string,
): Array<{ name: string; content: string }> | undefined {
  if (!skillPrompts || skillPrompts.length === 0) return skillPrompts;
  if (!agentId || agentId === 'generic') return skillPrompts;
  const agentKey = agentId.toLowerCase();
  const filtered = skillPrompts.filter(sp => sp.name.toLowerCase() !== agentKey);
  return filtered.length === skillPrompts.length ? skillPrompts : filtered;
}

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

  // PROMPT-W1 (a): scope-gate ADR bodies for code-development tasks so that
  // ADRs not intersecting the task scope render as a condensed head+summary+
  // pointer instead of their full amendment-log body. Other task kinds (and
  // tasks with no `type`) keep the full render → backward-safe.
  const scopeGated = task.type === 'code-development';
  const content = buildAdrPromptSection(filtered, 'full', allAdrs, 'full', scopeGated);
  if (!content) return '';

  return `=== Mandatory Architecture Rules (ADR) ===\nAll accepted ADRs below are mandatory constraints. Violating an accepted ADR requires a NO_GO result + ADR amendment proposal.\n\n${content}\n`;
}

// ─── Smoke Note Builder (WP-16) ────────────────────────────────────────

/**
 * Render the Tier-1 Proof-of-Function smoke-context note (WP-16).
 *
 * A `Smoke:` directive names a real-binary command Brain runs ON THE HOST (with
 * a real auth token) AFTER the task completes — it is Brain's gate, not the
 * worker's. Without this note workers ran the smoke inside their sandbox, hit a
 * missing host binary / unbindable port / absent token, and self-reported NO_GO
 * even though the host smoke passed (284-006: container FAIL, host PASS 153ms).
 *
 * Returns '' when the task has no smoke directive so the section is omitted
 * entirely (byte-for-byte identical prompt for non-Tier-1 tasks).
 */
export function buildSmokeNote(smoke?: { command: string; expect: string }): string {
  if (!smoke || !smoke.command) return '';
  const expect = smoke.expect ? ` → expect \`${smoke.expect}\`` : '';
  return `## Proof-of-Function Smoke (Tier-1)
A \`Smoke:\` proof command is attached to this task: \`${smoke.command}\`${expect}.
This host-smoke is run by Brain ON THE HOST after your task completes (with a real auth token) — it is Brain's gate, NOT yours. You do NOT need to run it inside your container. If the command fails inside your sandbox (missing host binary, unbindable port, or absent token), that is EXPECTED — do NOT mark NO_GO for a sandbox smoke failure. Make your code changes land and your targeted tests pass; Brain runs the real smoke host-side.`;
}

// ─── Conditional Boilerplate Gating (PROMPT-W1 d) ──────────────────────

/**
 * Path hints that mark a task as touching HOST-FACING config — the only place
 * the no-hardcode-`/workspace` portability note is relevant. A pure `src/**`
 * refactor never writes these, so it should not carry the note.
 */
const HOST_CONFIG_PATH_HINTS = [
  '.claude/', '.github/', '.gitlab', '.husky', '.deckent/', 'scripts/',
  'package.json', 'tsconfig', 'dockerfile', 'docker-compose',
  '.yml', '.yaml', '.toml',
];

/** True when any scope path looks like host-facing config (case-insensitive). */
function touchesHostConfig(scope: TaskScope | undefined): boolean {
  const paths = [...(scope?.filesWrite ?? []), ...(scope?.directories ?? [])];
  return paths.some(p => {
    const n = p.toLowerCase();
    return HOST_CONFIG_PATH_HINTS.some(h => n.includes(h));
  });
}

/** Which optional boilerplate blocks a task actually needs (PROMPT-W1 d). */
interface ConditionalBoilerplate {
  /** Idempotency Key section — only meaningful when the task may call external APIs. */
  idempotency: boolean;
  /** Host-config portability note — only meaningful when scope touches host-facing config. */
  hostConfig: boolean;
}

/**
 * Decide which optional boilerplate blocks to emit for a task (PROMPT-W1 d).
 *
 * Two blocks are pure noise for a pure-refactor / no-API task and are gated off:
 *  - the **Idempotency Key** section (retry safety for EXTERNAL API calls); and
 *  - the **host-config** portability note (no-hardcode-`/workspace`).
 *
 * Gating is conservative so the common case is unchanged: a task with no `type`
 * keeps the Idempotency block (the F1 idempotency tests pin its presence for
 * no-type tasks); only a positively-identified `refactor` kind drops it. The
 * host-config note is emitted only when the scope actually touches host-facing
 * config — independent of the API noise — so a CI/workflow task still gets it.
 */
export function conditionalBoilerplate(task: Task): ConditionalBoilerplate {
  const isPureRefactor = task.type === 'refactor';
  return {
    idempotency: !isPureRefactor,
    hostConfig: !isPureRefactor && touchesHostConfig(task.scope),
  };
}

// ─── Scope Block Builder ───────────────────────────────────────────────

export function buildScopeBlock(scope: TaskScope, outWarnings: string[], emitHostConfigNote: boolean): string {
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

  // PROMPT-W1 (d): the host-config portability note is only relevant when the
  // task actually writes host-facing config; a pure src/** refactor skips it.
  const hostConfigNote = emitHostConfigNote
    ? `\n\nWhen writing host-facing config (hooks in \`.claude/settings.json\`, scripts in \`package.json\`, CI workflows), NEVER hard-code your container working directory (e.g. \`/workspace/...\`). That path does not exist on the user's host machine and will break at runtime. Use a portable form instead: \`$CLAUDE_PROJECT_DIR/...\`, a path relative to the project root, or a bare command resolved via PATH.`
    : '';

  // PCOMP-W1 (single write authority — sprint-348-005 prompt analysis): the old
  // template printed TWO conflicting authorities ("ONLY modify in these
  // directories" [7 dirs] vs "ONLY write to these files" [2 files]) — ambiguous
  // for both the worker and the auditor. Canonical rule: when an explicit
  // filesWrite list exists it is the SOLE write authority and the directory list
  // is READ/context scope only; the directory-fallback wording applies only when
  // no Files: list was declared (PQ-4 F5 behaviour preserved).
  if (sanitized.filesWrite.length > 0) {
    return `## Scope Rules
READ/context scope — you may read these directories to understand the code:
${scopeDirs}

WRITE authority (canonical — the ONLY files you may create or modify):
${scopeFiles}

A directory appearing in the read scope does NOT grant write permission there — the write list above is the single authority, and the auditor flags any write outside it. If a change seems needed in a file you cannot write, note it in your .result \`notes\` instead of editing it.${hostConfigNote}`;
  }

  return `## Scope Rules
You may ONLY modify files in these directories:
${scopeDirs}

You may ONLY write to these files:
${scopeFiles}

DO NOT touch files outside your scope — the auditor will flag violations.${hostConfigNote}`;
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

// ─── Shared Context Block Builder (Sprint 278 COMM-1 / 278-003) ────────

/**
 * Render the "Shared Context (other workers)" block from SharedMemory entries.
 *
 * Bridges the dormant {@link SharedMemory} primitive into the worker prompt:
 * notes another worker wrote during the sprint become visible context for the
 * current worker. Returns '' when there is nothing to inject so the caller can
 * skip the section entirely (no stranded empty header).
 *
 * Determinism: entries are sorted by `key` with a stable lexicographic
 * comparator (matching `SharedMemory.listKeys()`'s default sort), so the same
 * set of entries renders byte-for-byte identically regardless of input order —
 * keeping the prompt-determinism guard (Sprint 273) green.
 *
 * KRİTİK (F1-TOK / cache-prefix): the caller appends this block at the very END
 * of the prompt (the most task-specific region), so the shared Skills→Agent→ADR
 * cache prefix is never split.
 *
 * @param entries Shared-context entries, or undefined/empty when comms is off.
 * @returns The rendered block, or '' when there is nothing to render.
 */
export function buildSharedContextBlock(entries: SharedContextEntry[] | undefined): string {
  if (!entries || entries.length === 0) return '';
  const sorted = [...entries].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  const lines = sorted.map(e => `- ${e.key} (by ${e.writerId}): ${e.value}`);
  return `=== Shared Context (other workers) ===\n${lines.join('\n')}`;
}

// ─── Upstream Handoff Block Builder (Sprint 278 COMM-1 / 278-004) ───────

/**
 * Render the "Upstream Handoffs" block from executed handoffs targeting this task.
 *
 * Bridges the already-created sprint-controller handoffs (`createHandoff` /
 * `executeHandoff`) into the downstream worker prompt: artifact paths the
 * upstream task produced plus its free-text {@link UpstreamHandoffEntry.notes}
 * message (Task 5 `handoffNotes`) become visible context. Returns '' when there
 * is nothing to inject so the caller can skip the section entirely (no stranded
 * empty header).
 *
 * Determinism: the caller passes entries pre-sorted by handoff id
 * (`HandoffProtocol.listHandoffs()` sorts via `localeCompare`), so the rendered
 * block is order-stable and the prompt-determinism guard (Sprint 273) stays green.
 *
 * KRİTİK (F1-TOK / cache-prefix): the caller appends this block at the very END
 * of the prompt (next to the Shared Context block), so the shared
 * Skills→Agent→ADR cache prefix is never split.
 *
 * @param handoffs Executed upstream handoffs, or undefined/empty when comms is off.
 * @returns The rendered block, or '' when there is nothing to render.
 */
export function buildHandoffBlock(handoffs: UpstreamHandoffEntry[] | undefined): string {
  if (!handoffs || handoffs.length === 0) return '';
  const lines = handoffs.map(h => {
    const artifacts = `artifacts [${h.artifacts.join(', ')}]`;
    const note = h.notes ? `, note: ${h.notes}` : '';
    return `- from ${h.fromTaskId}: ${artifacts}${note}`;
  });
  return `=== Upstream Handoffs ===\n${lines.join('\n')}`;
}

// ─── Worker Comms Instruction Block Builder (Sprint 278 COMM-1 / 278-006) ──

/**
 * Render the worker communications instruction block.
 *
 * Emitted ONLY when `worker_comms.enabled` so workers learn how to populate
 * `sharedNotes` and `handoffNotes` in their `.result` file. Without this block
 * the worker has no indication these fields exist and the Tasks 1-5 sharing
 * pipeline stays empty.
 *
 * Content is English (worker prompt standard). Appended at the very END of the
 * prompt (after sharedBlock and handoffBlock) so it never splits the shared
 * Skills→Agent→ADR cache prefix (F1-TOK lesson).
 *
 * @param enabled Whether `config.worker_comms?.enabled` is true.
 * @returns The rendered instruction block, or '' when disabled/absent.
 */
export function buildWorkerCommsInstructionBlock(enabled?: boolean): string {
  if (!enabled) return '';
  return `=== Worker Communications ===
You may share structured notes with other workers in this sprint:
- Add \`sharedNotes: [{ key: string, value: string }]\` to your \`.result\` for structured notes other workers can read.
- Add \`handoffNotes: string\` to your \`.result\` to send a free-text message to dependent tasks.
Both fields are optional. Only populate them when you have meaningful cross-worker context to share.`;
}

// ─── Definition-of-Done Checklist (WP-19) ──────────────────────────────

/**
 * Split a goCriteria string into top-level clauses, paren-aware (PROMPT-W1 c).
 *
 * The previous naive `/[;\n]+/` split broke a single criterion apart whenever it
 * contained a `;` or newline INSIDE brackets — e.g. `Run tests (unit; e2e)` was
 * counted as two items, inflating the checklist denominator ("wrong 6/6"). This
 * walks the string tracking bracket depth (`()`, `[]`, `{}`) and splits ONLY on a
 * top-level `;` or newline (depth 0). Separators nested inside brackets — and any
 * internal newline within a bracketed clause — are preserved verbatim.
 */
function parenAwareSplit(goCriteria: string): string[] {
  const items: string[] = [];
  let parenDepth = 0;
  let buf = '';
  for (const ch of goCriteria) {
    if (ch === '(' || ch === '[' || ch === '{') {
      parenDepth++;
      buf += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (parenDepth > 0) parenDepth--;
      buf += ch;
    } else if ((ch === ';' || ch === '\n') && parenDepth === 0) {
      // Top-level separator → end the current clause (empty clauses are dropped
      // by the caller's length filter, matching the old `+` collapse semantics).
      items.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.length > 0) items.push(buf);
  return items;
}

/**
 * Build the goCriteria-derived self-assessment checklist (WP-19).
 *
 * Splits the task's `goCriteria` into discrete clauses (on `;` / newlines) and
 * renders one `- [ ]` checklist item per clause plus an N/N→DONE verdict rubric.
 * This replaces the subjective "<80% → GO_WITH_TECH_DEBT / <50% → NO_GO" guidance:
 * a worker maps its verdict to ticked boxes (objective) instead of guessing a
 * completion percentage. Falls back to a clause-free rubric when goCriteria is
 * empty so the section is never stranded.
 */
export function buildDodChecklist(goCriteria?: string): string {
  const items = parenAwareSplit(goCriteria ?? '')
    .map(s => s.trim().replace(/^[-*]\s*/, ''))
    .filter(s => s.length > 0);

  if (items.length === 0) {
    return `Assess yourself honestly against the goCriteria above. "Code written" ≠ "DONE": core criteria met with a minor gap → GO_WITH_TECH_DEBT (name the gap); a critical criterion unmet → NO_GO (explain).`;
  }

  const checklist = items.map(i => `- [ ] ${i}`).join('\n');
  const n = items.length;
  return `Self-assessment rubric — "Code written" ≠ "DONE". Tick each Definition-of-Done item only when you verified it WITH EVIDENCE:
${checklist}
Verdict: all ${n}/${n} ticked → DONE | core items ticked, a minor item open → GO_WITH_TECH_DEBT (name the open item) | a critical item unticked → NO_GO (explain which and why).`;
}

// ─── Template Renderer ─────────────────────────────────────────────────

interface RenderInput {
  agentBlock: string;
  skillBlock: string;
  adrBlock: string;
  scopeBlock: string;
  depsBlock: string;
  /** Shared-context block (Sprint 278 COMM-1 / 278-003) — appended LAST when non-empty. */
  sharedBlock: string;
  /** Upstream-handoff block (Sprint 278 COMM-1 / 278-004) — appended LAST when non-empty. */
  handoffBlock: string;
  /** Worker comms instruction block (Sprint 278 COMM-1 / 278-006) — appended LAST when non-empty. */
  commsInstructionBlock: string;
  task: Task;
  effort: string;
  /**
   * Pre-computed idempotency key threaded by {@link buildTaskPrompt}. Inlined
   * directly into the rendered "## Idempotency Key" section — Sprint 182 PQ-1
   * (F1) replaced the previous literal `${IDEMPOTENCY_KEY}` placeholder that
   * was reaching workers verbatim because no shell expansion happened.
   */
  idempotencyKey: string;
  /**
   * PROMPT-W1 (d): whether to emit the Idempotency Key section. False for
   * pure-refactor / no-API tasks where external-API retry safety is irrelevant.
   */
  emitIdempotency: boolean;
  /** Live pre-existing test-failure count at the sprint baseline (WP-14); undefined when uncaptured. */
  preExistingFailures?: number;
}

/**
 * Persona/task verify-precedence override note (PROMPT-W1 b) — a PROTECTED T0
 * worker-safety invariant (Sprint 330 330-019).
 *
 * Agent personas (e.g. bug-fixer) carry a "run the FULL suite / all existing
 * tests must pass / always write a regression test" mandate. For a targeted
 * deckent task that conflicts with the task's own CRITICAL VERIFY STEPS
 * (targeted-only; pre-existing unrelated failures ≠ NO_GO). This note makes the
 * task's verify-steps the single authority so a worker does not false-NO_GO on a
 * persona full-suite mandate.
 *
 * UNCONDITIONAL / PROTECTED: the note is emitted for EVERY verification path that
 * actually runs tests — the default (no-arg) call and any non-doc mode both emit
 * it, so it can never be silently gated out of a worker prompt, and the
 * prompt-protected-set diff test locks its wording against rewording/dropping.
 *
 * The single exception is `verificationMode === 'doc'`: a doc-only task runs NO
 * tests and its VERIFY STEPS block already says "DO NOT run the test suite", so
 * the "defer to the targeted-only TEST guidance" note would actively contradict it
 * — that path returns '' (pinned by prompt-w1). Doc-suppression is semantic, not a
 * general gate: every test-running path always emits.
 */
export function buildVerifyPrecedenceNote(verificationMode: 'targeted' | 'doc' = 'targeted'): string {
  if (verificationMode === 'doc') return '';
  return `> Verify-precedence (this task overrides your persona): the CRITICAL VERIFY STEPS above are the single authority on how to verify THIS task. Where your agent persona or a skill says "run the full test suite", "all existing tests must pass (zero regressions)", or "always write a regression test", defer to the targeted-only guidance above — run only the test file(s) covering the module(s) you changed, and treat pre-existing unrelated failures as NOT a NO_GO.
> Result-precedence (PCOMP-W6): your ONLY output contract is the .result file format defined below. Where your persona defines a different output/report format (severity-graded finding reports, audit checklists, threat-model writeups), that format applies — at most — to prose INSIDE the \`notes\` field; it never replaces or restructures the result schema, and it never turns an implementation task into a review report.`;
}

/**
 * Build the Definition-of-Done (goCriteria) block — a PROTECTED element the
 * compiler must reproduce byte-for-byte (Sprint 330 330-019).
 *
 * Extracted verbatim from the former inline render in {@link renderSegments} so it
 * can be rendered once and reused by the prompt-protected-set diff test. Leading
 * and trailing newlines are part of the contract (the block is concatenated
 * directly onto the task preamble); the output is byte-identical to the prior
 * inline expression. Empty when the task carries no goCriteria.
 */
export function buildDodBlock(goNogo?: { goCriteria?: string; noGoCriteria?: string }): string {
  if (!goNogo?.goCriteria) return '';
  const noGo = goNogo.noGoCriteria ? `\nNO-GO if: ${goNogo.noGoCriteria}` : '';
  return `\n## Definition of Done (goCriteria — your work is judged against this)\n${goNogo.goCriteria}${noGo}\n`;
}

/**
 * Build the "pre-existing failures" guidance for the CRITICAL VERIFY STEPS
 * block from the live sprint baseline (WP-14). Replaces the stale hardcoded
 * "~67 pre-existing failures" sentence with the real measured count so the
 * worker can trust it (ADR-070 zero-hardcode):
 *   - count > 0  → cite the measured count; pre-existing failures are not the worker's fault.
 *   - count === 0 → the suite was green at baseline; any failure is likely the worker's own.
 *   - undefined   → no baseline captured; warn generically without inventing a number.
 */
export function buildPreExistingFailuresNote(preExistingFailures?: number): string {
  const tail =
    'Base your self-assessment on (a) `tsc --noEmit` clean + (b) the targeted test file(s) for the module(s) you changed passing.';
  if (preExistingFailures === undefined) {
    return `The Full test suite may contain pre-existing unrelated failures (stale model-id expectations, env-dependent provider/ollama tests) that were not measured for this sprint. A genuinely pre-existing failure unrelated to your change MUST NOT cause a NO_GO — but do NOT assume the suite is green. ${tail}`;
  }
  if (preExistingFailures <= 0) {
    return `The Full test suite was green at this sprint's baseline (0 pre-existing failures). Any failure you see in your targeted file(s) is therefore most likely yours — fix it, do not dismiss it as pre-existing. ${tail}`;
  }
  return `The Full test suite has ${preExistingFailures} pre-existing unrelated failures, measured at this sprint's baseline (stale model-id expectations, env-dependent provider/ollama tests). These pre-existing failures MUST NOT cause a NO_GO — they are not your responsibility. ${tail}`;
}

function renderSegments(input: RenderInput): PromptSegment[] {
  const { agentBlock, skillBlock, adrBlock, scopeBlock, depsBlock, sharedBlock, handoffBlock, commsInstructionBlock, task, effort, idempotencyKey, emitIdempotency, preExistingFailures } = input;

  // Tier-tagged assembly (Sprint 330 330-019). Push order below IS the default
  // production order — `buildTaskPromptSegmented` joins these contents with
  // SEGMENT_SEPARATOR, so the default-path output is byte-for-byte identical to the
  // pre-330-019 `sections.join('\n\n')`. The {@link PromptTier} tags drive the
  // optional (default-OFF) leading-T0 cache reorder and the protected-set guard.
  const segments: PromptSegment[] = [];
  const push = (tier: PromptTier, kind: PromptSegmentKind, content: string): void => {
    segments.push({ tier, kind, content });
  };

  // Conditionally emit non-empty sections only (skip filler empty headers).
  // Sprint 273 (F1-TOK fix #5): Skills FIRST, then Agent — skill blocks are
  // byte-identical across tasks while the agent block varies per task, so the
  // most-shared content must lead for a shareable provider cache prefix.
  // (273-008 changed the template docs; this is the actual assembly order —
  // locked by tests/orchestra/prompt-determinism.test.ts block-order test.)
  // Skills / persona / operative ADRs are the T1 (tenant-project) tier.
  if (skillBlock) push('T1', 'skills', skillBlock);
  if (agentBlock) push('T1', 'persona', agentBlock);
  if (adrBlock) push('T1', 'adr', adrBlock);

  // Main worker preamble
  // Sprint 182 PQ-4 (F6): title and description live on separate lines/paragraphs.
  // The previous "${id}: ${title} — ${description}" form duplicated the title
  // when description started with the title and collapsed markdown structure
  // (lists, bold) into a single line. Now: id + title on one line, description
  // as its own paragraph so markdown survives rendering.
  // PROMPT-W1 (d): the Idempotency Key section is only emitted when the task may
  // make external API calls (gated off for pure-refactor / no-API tasks).
  const dodBlock = buildDodBlock(task.goNogo);
  const idempotencyBlock = emitIdempotency
    ? `\n## Idempotency Key\n${idempotencyKey}\nUse this key for external API calls (Idempotency-Key header) to make retries safe.`
    : '';
  // The global worker-contract preamble (T0) and the per-task body (T2) are split
  // at the existing blank-line boundary: joined with SEGMENT_SEPARATOR they are
  // byte-identical to the former single block, but the split lets the T0 contract
  // lead in the reordered cache layout without dragging the volatile task body.
  push('T0', 'worker-contract', `You are a Deckent worker agent.
See .deckent/workspace/WORKER-GUIDE.md for heartbeat format, result format, and error handling rules.`);
  push('T2', 'task', `## Your Task
${task.id}: ${task.title}

${task.description}

- Model: ${task.model}
- Effort: ${effort}
${dodBlock}${idempotencyBlock}`);

  // What to do (embeds task.id in the plan/result paths → volatile T2)
  push('T2', 'what-to-do', `## What To Do
1. Read the task scope carefully — understand what files you may touch
2. Write your execution plan to .tasks/task-${task.id}.plan BEFORE coding — outline your approach, files to modify, and expected changes
3. Write the code changes described above
4. Doc-impact: if your change makes any doc/ADR text stale, do NOT edit docs outside your write authority — add a \`docImpact:\` line to your .result \`notes\` naming the doc + what became stale (the orchestrator turns these into follow-up tasks). Only edit a doc that is explicitly IN your write list.
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
  // PROMPT-W1 (b): a doc-only task verifies by reading its file back; every other
  // task verifies via targeted tests, which is also the mode whose guidance must
  // take precedence over a persona's conflicting full-suite test-mandate.
  const verificationMode: 'targeted' | 'doc' = isDocOnlyTask ? 'doc' : 'targeted';
  if (isDocOnlyTask) {
    push('T0', 'verify-steps', `## VERIFY STEPS (doc-only task — DO NOT run the test suite)
This is a Tier-0 documentation task: there is no source code to type-check or test. DO NOT run \`npm test\` / \`vitest\` / the project test suite — it is large, unrelated to your file, slow, and produces spurious failures that do NOT reflect your work.
1. Read your file back from disk (the path in your scope) and confirm its content satisfies the goCriteria above.
2. You MAY run a fast doc/markdown lint if one exists, but a passing test suite is NOT required and NOT expected.
Mark selfAssessment = "DONE" when the file exists and matches the goCriteria. Use "GO_WITH_TECH_DEBT" only if the content is genuinely partial; use "NO_GO" only if you could not create the file at all. Do NOT mark NO_GO because an unrelated test suite failed.`);
  } else {
    push('T0', 'verify-steps', `## CRITICAL VERIFY STEPS (DO NOT SKIP)
You MUST run the project's type check and TARGETED tests before marking your task as done.
Check the project's TOOLS.md or package.json scripts to find the right commands.

1. **Type check / static analysis** — fix ALL errors (max 3 attempts)
   Examples: \`tsc --noEmit\` (TypeScript), \`mypy\` (Python), \`go vet ./...\` (Go), \`cargo check\` (Rust)
2. **TARGETED test file(s) only** — run ONLY the test file(s) that cover the module(s) you changed (max 3 attempts)
   Example: \`npx vitest run tests/orchestra/my-module.test.ts\` — do NOT run the Full test suite (\`npx vitest run\` without args).
   ${buildPreExistingFailuresNote(preExistingFailures)}

If BOTH pass → selfAssessment = "DONE"
If minor issues remain → selfAssessment = "GO_WITH_TECH_DEBT" with details in notes
If Bash tool is unavailable → report in notes, selfAssessment = "GO_WITH_TECH_DEBT"
If targeted tests fail after 3 attempts → selfAssessment = "NO_GO" with error details
${buildVerifyPrecedenceNote(verificationMode)}`);
  }

  // Smoke note (WP-16) — Tier-1 Proof-of-Function context. Emitted next to the
  // VERIFY STEPS (its natural home) only when the task carries a Smoke: directive.
  const smokeNote = buildSmokeNote(task.smoke);
  if (smokeNote) push('T2', 'smoke', smokeNote);

  // Scope block — PROTECTED (auditor boundary contract); volatile per task (T2).
  push('T2', 'scope', scopeBlock);

  // Dependencies (only if non-empty)
  if (depsBlock) push('T2', 'deps', depsBlock);

  // Heartbeat — WP-18 (DASH-RT-1 complement): the worker must keep currentAction
  // fresh so the dashboard shows live progress instead of a stuck "Starting…".
  push('T2', 'heartbeat', `## Heartbeat
Create .tasks/task-${task.id}.hb BEFORE starting work with workerId "w-${task.id}", status "EXECUTING".
Update periodically: increment sequence, refresh timestamp via new Date().toISOString() (UTC ISO 8601).
At EVERY significant step, also update the \`currentAction\` field to a short human-readable phrase (e.g. "planning", "editing src/x.ts", "running targeted tests", "writing result") — this drives the live dashboard view, so a stale currentAction reads as a stuck worker.`);

  // Result + self-assessment — single authority section. Folds the former
  // separate "## Result File" and "## Honest Self-Assessment" sections so the
  // result/verdict instructions are stated once instead of 4×.
  // Sprint 202 Task 202-003: registry default before the absolute 'claude' floor
  // so prompts emitted in pure-Ollama configs don't hard-code 'claude' into
  // worker token-usage instructions.
  const provider = task.provider ?? getDefaultProviderName();
  push('T2', 'result-contract', `## Result & Self-Assessment
Write .tasks/task-${task.id}.result with: taskId, filesChanged, testsPassed, selfAssessment ("DONE"|"GO_WITH_TECH_DEBT"|"NO_GO"), notes, and tokenUsage { "inputTokens": 0, "outputTokens": 0, "cacheReadTokens": 0, "provider": "${provider}", "model": "${task.model}" }. Set provider/model as shown (you know these); leave inputTokens, outputTokens and cacheReadTokens at 0 — do NOT estimate them. An LLM cannot count its own token usage, so any guess only adds noise: the orchestrator fills the real token counts server-side after you finish. tokenUsage is optional — if you omit it the orchestrator still fills it.
${buildDodChecklist(task.goNogo?.goCriteria)}
CRITICAL: never exit without writing the .result file — even on failure, write selfAssessment "NO_GO" with error details. A missing result file stalls the entire sprint.`);

  // Karpathy 4-discipline cognitive anchor (concise, provider-agnostic) — global T0.
  push('T0', 'karpathy', KARPATHY_ESSENCE);

  // Shared Context (Sprint 278 COMM-1 / 278-003) — appended LAST, after every
  // shared/structural section, so this per-spawn-variable block sits in the most
  // task-specific region and never splits the Skills→Agent→ADR cache prefix
  // (F1-TOK lesson). Empty when worker_comms is off → byte-for-byte legacy prompt.
  if (sharedBlock) push('T2', 'shared', sharedBlock);

  // Upstream Handoffs (Sprint 278 COMM-1 / 278-004) — appended next to the Shared
  // Context block in the same prompt-END region (same cache-prefix rationale).
  // Empty when worker_comms is off / inject_handoffs disabled → unchanged prompt.
  if (handoffBlock) push('T2', 'handoff', handoffBlock);

  // Worker Comms Instruction (Sprint 278 COMM-1 / 278-006) — appended LAST so
  // workers know how to populate sharedNotes/handoffNotes. Without this block
  // workers never discover these optional fields exist (Tasks 1-5 path stays
  // empty). Empty when worker_comms is off → byte-for-byte legacy prompt.
  if (commsInstructionBlock) push('T2', 'comms', commsInstructionBlock);

  return segments;
}
