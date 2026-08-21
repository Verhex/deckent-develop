// ─── Worker-Prompt Tier Segmentation ───────────────────────────────────────
// Provider-agnostic worker-prompt compiler — Spec Pillar 1+2+6 (Sprint 330, 330-019).
//
// Classifies the segments of a compiled worker prompt into THREE cache tiers so a
// provider-agnostic prompt cache can key on the byte-stable prefix and only the
// volatile tail varies per task:
//
//   T0  global    — byte-identical across EVERY tenant, project and task
//                   (worker-contract, verify-steps incl. verify-precedence, Karpathy).
//   T1  project   — byte-identical for a given (tenant, project, task-class)
//                   (persona / skills / operative ADRs).
//   T2  volatile  — the per-task tail that legitimately changes every spawn
//                   (task body, scope, goNogo, heartbeat/result paths, comms…).
//
// The module is intentionally PURE and dependency-free (no import of
// prompt-god-template) so the dependency direction stays one-way
// (prompt-god-template → prompt-segmentation) per ADR-008.

// ─── Tiers ──────────────────────────────────────────────────────────────────

/** The three provider-agnostic prompt-cache tiers (T0 leads, T2 is the volatile tail). */
export type PromptTier = 'T0' | 'T1' | 'T2';

/**
 * Canonical kinds a compiled worker prompt is segmented into. The string union is
 * closed for the kinds the compiler emits today; {@link classifyTier} still
 * accepts an arbitrary `string` (forward-compatible) and maps the unknown kind to
 * the most conservative tier (T2 — never poison the shared prefix).
 */
export type PromptSegmentKind =
  // ── T0: global, no tenant/task variance ──
  | 'worker-contract'
  | 'verify-steps'
  | 'verify-precedence'
  | 'npm-advisory'
  | 'karpathy'
  // ── T1: tenant-project, stable per task-class ──
  | 'skills'
  | 'persona'
  | 'adr'
  // ── T2: volatile per-task tail ──
  | 'task'
  | 'what-to-do'
  | 'heartbeat'
  | 'result-contract'
  | 'smoke'
  | 'scope'
  | 'goNogo'
  | 'deps'
  | 'shared'
  | 'handoff'
  | 'comms';

/** One tier-tagged slice of a compiled worker prompt. */
export interface PromptSegment {
  /** Cache tier this segment belongs to. */
  readonly tier: PromptTier;
  /** Stable identifier of the segment kind. */
  readonly kind: PromptSegmentKind | string;
  /** Rendered content (already provider-agnostic markdown). */
  readonly content: string;
}

/**
 * Single source of truth for kind → tier classification.
 *
 * Classification is by **byte-variance**, not by semantic role: a section that
 * embeds `task.id` (heartbeat / what-to-do / result-contract) is T2 even though it
 * reads like global boilerplate, because it differs byte-for-byte per task and
 * would otherwise poison the shared cache prefix.
 */
const TIER_BY_KIND: Readonly<Record<PromptSegmentKind, PromptTier>> = {
  'worker-contract': 'T0',
  'verify-steps': 'T0',
  'verify-precedence': 'T0',
  'npm-advisory': 'T0',
  karpathy: 'T0',
  skills: 'T1',
  persona: 'T1',
  adr: 'T1',
  task: 'T2',
  'what-to-do': 'T2',
  heartbeat: 'T2',
  'result-contract': 'T2',
  smoke: 'T2',
  scope: 'T2',
  goNogo: 'T2',
  deps: 'T2',
  shared: 'T2',
  handoff: 'T2',
  comms: 'T2',
};

/** Tier assigned to an unrecognized kind — the most conservative (volatile) tier. */
export const DEFAULT_TIER: PromptTier = 'T2';

/**
 * Classify a segment kind into its cache tier. Unknown kinds fall back to
 * {@link DEFAULT_TIER} (T2) so a not-yet-registered section can never silently
 * land in the shared prefix and corrupt a cross-task cache hit.
 */
export function classifyTier(kind: string): PromptTier {
  return (TIER_BY_KIND as Record<string, PromptTier | undefined>)[kind] ?? DEFAULT_TIER;
}

// ─── Tier grouping & reorder ──────────────────────────────────────────────────

/** Stable ordering rank per tier — lower leads (T0 first, T2 last). */
const TIER_RANK: Readonly<Record<PromptTier, number>> = { T0: 0, T1: 1, T2: 2 };

/** Separator used when concatenating segment contents (mirrors the compiler join). */
export const SEGMENT_SEPARATOR = '\n\n';

/** Default for the leading-T0 reorder feature — OFF (experimental, opt-in only). */
export const DEFAULT_LEADING_T0_REORDER = false;

/** Segments grouped by tier, original within-tier order preserved. */
export interface TieredSegments {
  readonly T0: PromptSegment[];
  readonly T1: PromptSegment[];
  readonly T2: PromptSegment[];
}

/**
 * Partition segments into their tiers, preserving the original within-tier order.
 * Pure — never mutates the input.
 */
export function segmentByTier(segments: readonly PromptSegment[]): TieredSegments {
  const T0: PromptSegment[] = [];
  const T1: PromptSegment[] = [];
  const T2: PromptSegment[] = [];
  for (const seg of segments) {
    if (seg.tier === 'T0') T0.push(seg);
    else if (seg.tier === 'T1') T1.push(seg);
    else T2.push(seg);
  }
  return { T0, T1, T2 };
}

/**
 * Reorder segments so the cacheable tiers lead: all T0, then all T1, then all T2,
 * preserving the original within-tier order (stable). Pure — returns a new array,
 * never mutates the input.
 *
 * This is the assembly used when the (default-OFF) leading-T0 reorder flag is set:
 * it groups the global + project prefix contiguously so a provider cache can share
 * the longest possible prefix across tasks. The default compiler order (skills
 * first, per the F1-TOK cache-prefix lesson) is left untouched when the flag is off.
 */
export function reorderLeadingT0(segments: readonly PromptSegment[]): PromptSegment[] {
  // Decorate-sort-undecorate keeps the sort explicitly stable regardless of engine.
  return segments
    .map((seg, index) => ({ seg, index }))
    .sort((a, b) => {
      const byTier = TIER_RANK[a.seg.tier] - TIER_RANK[b.seg.tier];
      return byTier !== 0 ? byTier : a.index - b.index;
    })
    .map(({ seg }) => seg);
}

/**
 * Compute the per-(tenant, task-class) byte-stable cache prefix: the concatenation
 * of every non-volatile (T0 global + T1 project) segment, in leading-T0 order.
 *
 * For two tasks of the SAME (tenant, project, task-class) this is byte-identical —
 * all variation lives in the excluded T2 tail. Mirrors the join the compiler uses
 * so the returned string is exactly the prefix a reordered prompt would carry.
 */
export function computeStablePrefix(segments: readonly PromptSegment[]): string {
  const { T0, T1 } = segmentByTier(segments);
  return [...T0, ...T1].map(s => s.content).join(SEGMENT_SEPARATOR);
}

// ─── Protected set ────────────────────────────────────────────────────────────

/**
 * The protected set — the worker-safety invariants the compiler must reproduce
 * byte-for-byte and may never reword, summarize or drop:
 *  - `scope`            the scope-rules block (auditor boundary contract),
 *  - `goNogo`           the Definition-of-Done block (judged-against criteria),
 *  - `verify-precedence` the persona/task verify-precedence override note.
 * Cross-tier on purpose (scope/goNogo are T2, verify-precedence is T0): "protected"
 * is orthogonal to "cacheable".
 */
export const PROTECTED_KINDS = ['scope', 'goNogo', 'verify-precedence'] as const;
export type ProtectedKind = (typeof PROTECTED_KINDS)[number];

/** Source (authoritative) renderings of each protected element, for diff-equality. */
export interface ProtectedSetSources {
  readonly scope: string;
  readonly goNogo: string;
  readonly verifyPrecedence: string;
}

/**
 * Return the protected kinds whose authoritative SOURCE text is NOT present
 * byte-for-byte in the compiled prompt — i.e. the compiler reworded or dropped
 * them. An empty array means the whole protected set survived compilation intact.
 *
 * Inclusion (not slicing) is used deliberately: each protected element is rendered
 * once by its source builder and embedded verbatim, so a verbatim substring match
 * is the exact "diff-equal with source" contract without fragile header parsing.
 */
export function findUnprotected(prompt: string, sources: ProtectedSetSources): ProtectedKind[] {
  const missing: ProtectedKind[] = [];
  if (!prompt.includes(sources.scope)) missing.push('scope');
  if (!prompt.includes(sources.goNogo)) missing.push('goNogo');
  if (!prompt.includes(sources.verifyPrecedence)) missing.push('verify-precedence');
  return missing;
}

/**
 * Filter the segments down to the protected kinds present as standalone segments.
 * Note: `goNogo` and `verify-precedence` are embedded inside larger segments in the
 * current compiler (so this returns only the standalone ones, e.g. `scope`); the
 * authoritative whole-set check is {@link findUnprotected} against the compiled
 * prompt string.
 */
export function extractProtectedSegments(segments: readonly PromptSegment[]): PromptSegment[] {
  const protectedSet = new Set<string>(PROTECTED_KINDS);
  return segments.filter(s => protectedSet.has(s.kind));
}

// ─── Cache key ────────────────────────────────────────────────────────────────

/**
 * Build the deterministic per-(tenant, task-class) cache key for the stable prefix.
 * Caller supplies a tenant identifier and a task-class discriminator (e.g. the
 * task `type` plus assigned agent); the key is what a provider-agnostic cache keys
 * its shared prefix entry on.
 */
export function stablePrefixKey(tenantId: string, taskClass: string): string {
  return `${tenantId}::${taskClass}`;
}

/**
 * Tenant identifier used when a caller supplies none (593-002).
 *
 * Single-tenant local/dev runs have no tenant to key on, but the cache key must
 * still be total and deterministic — the compiler
 * (`prompt-god-template.buildTaskPromptSegmented`) falls back to this sentinel so
 * an unset tenant can never produce `undefined::<class>` keys that silently
 * collide with, or fragment against, a real tenant's prefix entry.
 */
export const DEFAULT_PROMPT_TENANT_ID = 'local';
