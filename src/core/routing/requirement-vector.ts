// ═══ RoutingEngineV3 — RequirementVector Schema + Positional Producer ═══════
// Slice-0 FOUNDATION (sprint-445, Task 445-004). Task-side counterpart to
// CapabilityVector (capability-vector.ts) — the same content/positional/
// numerical axes, spec §2a (.analysis/routing-v3-secenek-b-detay-2026-07-14.md).
//
// This task ships the FULL RequirementVector zod schema (content/positional/
// numerical) but only the POSITIONAL producer. The numerical producer (445-005)
// and the structural content producer (445-006) extend this same file — their
// axis schemas are kept literal to spec §2a here; do not gold-plate ahead of
// their own tasks (e.g. content's `provenance`/`calibratedConfidence` fields
// are 445-006's addition, not introduced here).
//
// `producePositional` is 100% structural: it reads ONLY `task.scope`
// (directories/filesWrite) and vocabulary domain definitions — NEVER
// task.title/description prose — with one deliberate, spec-mandated
// exception: `positional.language`, which reuses routing-engine's TR/EN
// heuristic over title+description. That is the sole prose-derived signal in
// this producer; every other field is provably invariant to title/description
// content (see the negative-pin tests in requirement-positional.test.ts).

import { z } from 'zod';
import type { Task } from '../task-types.js';
import type { DomainDef, WorkType } from './types.js';
import {
  isWorkType,
  isDeliverableType,
  classifyDeliverable,
  DELIVERABLE_TYPES,
  BUILTIN_DOMAINS,
} from './vocabulary-builtin.js';
import { matchGlob } from '../doc-tracking/glob.js';
import { detectHeuristicLanguage } from './language.js';
import { DEFAULT_ROUTING_V3_CONFIG } from './config.js';

// ─── Component schemas (spec §2a) — local refine-based guards, mirroring
// capability-vector.ts's own pattern (workTypeIdSchema/deliverableTypeSchema
// wrap the shared vocabulary-builtin.ts type guards rather than re-deriving
// the closed sets independently). ──────────────────────────────────────────

const workTypeIdSchema = z.string().refine(isWorkType, {
  message:
    'must be one of the 8 closed-core work-types (build, fix, refactor, document, review, configure, migrate, analyze)',
});

const deliverableTypeSchema = z.string().refine(isDeliverableType, {
  message: 'must be one of the 9 closed deliverable types',
});

// ─── content (spec §2a — hybrid: structural producer here (445-006) + LLM
// producer in Slice-2). `provenance`/`calibratedConfidence` are this task's
// additive fields (foreseen by the file header): they record WHICH producer
// built the content and how far to trust it. ──────────────────────────────
export const requirementContentSchema = z
  .object({
    workType: workTypeIdSchema,
    subtype: z.string().min(1).nullable(),
    // `summary`/`semanticTags` are LLM-produced (Slice-2). At
    // `provenance: 'structural'` they are a valid modeled `null`, NOT a stub —
    // the governance/deterministic-mode producer (produceContentStructural)
    // ships without them; `null` is the honest "no LLM ran" state.
    summary: z.string().nullable(),
    semanticTags: z.array(z.string()).nullable(),
    // Which producer built this content: 'structural' (deterministic, scope-only —
    // this task) or 'llm' (Slice-2 content-fit). Drives the confidence tier below
    // and the structural↔LLM cross-check (spec §2a / §3 verifier).
    provenance: z.enum(['structural', 'llm']),
    // Self-assessed confidence in `workType`. Structural provenance is the LOW
    // tier (below an LLM-confirmed match) — see produceContentStructural.
    calibratedConfidence: z.number().min(0).max(1),
  })
  .strict();

// ─── positional (spec §2a — deterministic; this task's producer) ──────────
const domainEvidenceSchema = z
  .object({
    id: z.string().min(1),
    weight: z.number().min(0).max(1),
    // Per task-445-004: names the matched pathPattern itself (not the generic
    // "scope" placeholder shown in the spec §2a illustration) — a concrete,
    // debuggable provenance string.
    evidence: z.string().min(1),
  })
  .strict();

const deliverableRatioSchema = z
  .object({
    type: deliverableTypeSchema,
    ratio: z.number().min(0).max(1),
  })
  .strict();

export const requirementPositionalSchema = z
  .object({
    domains: z.array(domainEvidenceSchema),
    deliverables: z.array(deliverableRatioSchema),
    surfaces: z.array(z.string()),
    needsWrite: z.boolean(),
    language: z.enum(['tr', 'en', 'auto']),
  })
  .strict();

// ─── numerical (spec §2a — deterministic; producer lands in 445-005) ───────
export const requirementNumericalSchema = z
  .object({
    estimatedSize: z.enum(['trivial', 'small', 'medium', 'large', 'epic']),
    fileCount: z.number().int().nonnegative(),
    moduleCount: z.number().int().nonnegative(),
    // Mirrors TaskEffort (task-types.ts) — passthrough-compatible with task.effort.
    effortClass: z.enum(['low', 'normal', 'high']),
    riskClass: z.enum(['low', 'medium', 'high']),
  })
  .strict();

// ─── RequirementVector (spec §2a — the task-side vector) ──────────────────
export const requirementVectorSchema = z
  .object({
    content: requirementContentSchema,
    positional: requirementPositionalSchema,
    numerical: requirementNumericalSchema,
  })
  .strict();

export type RequirementContent = z.infer<typeof requirementContentSchema>;
export type RequirementPositional = z.infer<typeof requirementPositionalSchema>;
export type RequirementNumerical = z.infer<typeof requirementNumericalSchema>;
export type RequirementVector = z.infer<typeof requirementVectorSchema>;

// ─── producePositional() ───────────────────────────────────────────────────

/**
 * The minimal shape `producePositional` needs from a loaded vocabulary —
 * a `VocabularyRegistry` (vocabulary.ts) satisfies this structurally, and
 * tests can pass a bare `{ domains: [...] }` fixture without constructing
 * the full registry envelope (mergeReport etc).
 */
export interface RequirementVocabularySource {
  readonly domains: readonly DomainDef[];
}

/** First pathPattern (in domain-declared order) that matches `path`, or undefined. */
function firstMatchingPattern(path: string, domain: DomainDef): string | undefined {
  return domain.pathPatterns.find((pattern) => matchGlob(path, pattern));
}

/**
 * Produce the `positional` axis of a task's RequirementVector (spec §2a).
 * Deterministic, pure, fs-free: reads only `task.scope` and the supplied
 * vocabulary domain definitions.
 *
 * - `domains`: every vocabulary domain with at least one matching path across
 *   `scope.directories` + `scope.filesWrite`. `weight` is the share of
 *   `scope.filesWrite` entries matching that domain's `pathPatterns` (0 when
 *   `filesWrite` is empty — directory-only evidence, no confirmed write share
 *   yet). `evidence` names the matched pattern, preferring a filesWrite match
 *   over a directories-only match.
 * - `deliverables`: `classifyDeliverable` ratio over `scope.filesWrite`,
 *   in `DELIVERABLE_TYPES` canonical order, omitting zero-count types.
 * - `surfaces`: de-duped union of `.surfaces` across the domains found above.
 * - `needsWrite`: `scope.filesWrite` is non-empty.
 * - `language`: `detectHeuristicLanguage` (routing-engine.ts, reused via
 *   import — genuinely exported, not modified) over `title + description`;
 *   its `'unknown'` maps to `'auto'` (spec §2a's `tr|en|auto` vocabulary).
 */
export function producePositional(task: Task, vocabulary: RequirementVocabularySource): RequirementPositional {
  const filesWrite = task.scope.filesWrite;
  const evidencePaths = [...task.scope.directories, ...filesWrite];
  const totalWrites = filesWrite.length;

  const domains: RequirementPositional['domains'] = [];
  for (const domain of vocabulary.domains) {
    const writeMatchPattern = filesWrite
      .map((f) => firstMatchingPattern(f, domain))
      .find((p): p is string => p !== undefined);
    const evidencePattern =
      writeMatchPattern ??
      evidencePaths.map((p) => firstMatchingPattern(p, domain)).find((p): p is string => p !== undefined);
    if (evidencePattern === undefined) continue;

    const matchedWritesCount = filesWrite.filter((f) =>
      domain.pathPatterns.some((pattern) => matchGlob(f, pattern)),
    ).length;
    const weight = totalWrites > 0 ? matchedWritesCount / totalWrites : 0;
    domains.push({ id: domain.id, weight, evidence: evidencePattern });
  }

  const deliverableCounts = new Map<string, number>();
  for (const file of filesWrite) {
    const type = classifyDeliverable(file);
    deliverableCounts.set(type, (deliverableCounts.get(type) ?? 0) + 1);
  }
  const deliverables: RequirementPositional['deliverables'] = DELIVERABLE_TYPES.filter(
    (type) => (deliverableCounts.get(type) ?? 0) > 0,
  ).map((type) => ({ type, ratio: (deliverableCounts.get(type) ?? 0) / totalWrites }));

  const matchedDomainIds = new Set(domains.map((d) => d.id));
  const surfaces = Array.from(
    new Set(vocabulary.domains.filter((d) => matchedDomainIds.has(d.id)).flatMap((d) => d.surfaces)),
  );

  const languageSignal = detectHeuristicLanguage(`${task.title} ${task.description}`);
  const language = languageSignal === 'unknown' ? 'auto' : languageSignal;

  return {
    domains,
    deliverables,
    surfaces,
    needsWrite: filesWrite.length > 0,
    language,
  };
}

// ─── produceNumerical() ────────────────────────────────────────────────────

// riskClass "config"/"migration" signal: reuses classifyDeliverable's own
// closed rule table (vocabulary-builtin.ts) rather than re-deriving path
// literals here — a filesWrite entry it classifies as one of these two
// DeliverableTypes is treated as an inherently risky write (config drift,
// schema/data migration).
const RISK_DELIVERABLE_TYPES: ReadonlySet<string> = new Set(['config', 'migration']);

// riskClass "security-domain" signal: the domain id is a semantic category
// key (like `domain.id` elsewhere in this file), NOT a path literal — which
// PATHS satisfy it comes entirely from the supplied vocabulary's
// `pathPatterns` via `firstMatchingPattern`/`matchGlob`, so a fixture
// vocabulary that renames its 'security' domain's pathPatterns changes the
// result (see the requirement-numerical pin test).
const RISK_DOMAIN_IDS: ReadonlySet<string> = new Set(['security']);

/** True when any `filesWrite` entry is a risky deliverable or matches a risk-domain pattern. */
function hasRiskyWrite(filesWrite: readonly string[], vocabulary: RequirementVocabularySource): boolean {
  if (filesWrite.some((file) => RISK_DELIVERABLE_TYPES.has(classifyDeliverable(file)))) {
    return true;
  }
  const riskDomains = vocabulary.domains.filter((domain) => RISK_DOMAIN_IDS.has(domain.id));
  return filesWrite.some((file) => riskDomains.some((domain) => firstMatchingPattern(file, domain) !== undefined));
}

/**
 * Produce the `numerical` axis of a task's RequirementVector (spec §2a).
 * Deterministic, pure, fs-free: reads only `task.scope`/`task.effort` and
 * the supplied vocabulary.
 *
 * - `fileCount`/`moduleCount`/`estimatedSize`: mirror `analyzeComplexity()`
 *   (src/core/intent-classifier.ts, V2 intent-classifier complexity block) —
 *   same fileCount (`scope.filesWrite.length`) and moduleCount (unique
 *   top-level segment of each `scope.directories` entry after stripping a
 *   leading `src|tests|test|lib` prefix — the "top-level src subdir")
 *   definitions, and the same 5-tier threshold table. Copied rather than
 *   imported so routing3 stays independent of the V2 intent-classifier;
 *   keep the two threshold tables in sync by hand if V2's ever change.
 * - `effortClass`: `task.effort` passthrough, defaulting to `'normal'`.
 * - `riskClass`: `'high'` when `hasRiskyWrite` matches (config/migration
 *   deliverable or a security-domain vocabulary pattern); otherwise `'low'`
 *   for a trivial/small `estimatedSize`, `'medium'` for medium/large/epic.
 * - `vocabulary` defaults to the builtin domain base so real call sites can
 *   invoke `produceNumerical(task)`; tests inject a fixture vocabulary to
 *   pin riskClass's vocabulary-driven (not hardcoded) derivation.
 */
export function produceNumerical(
  task: Task,
  vocabulary: RequirementVocabularySource = { domains: BUILTIN_DOMAINS },
): RequirementNumerical {
  const filesWrite = task.scope.filesWrite;
  const fileCount = filesWrite.length;

  const modules = new Set<string>();
  for (const dir of task.scope.directories) {
    const cleaned = dir.replace(/^(src|tests|test|lib)\//, '');
    const topModule = cleaned.split('/')[0];
    if (topModule) modules.add(topModule);
  }
  const moduleCount = modules.size;

  // Thresholds copied verbatim from analyzeComplexity() (intent-classifier.ts).
  let estimatedSize: RequirementNumerical['estimatedSize'];
  if (fileCount <= 1 && moduleCount <= 1) {
    estimatedSize = 'trivial';
  } else if (fileCount <= 2 && moduleCount <= 1) {
    estimatedSize = 'small';
  } else if (fileCount <= 5 && moduleCount <= 2) {
    estimatedSize = 'medium';
  } else if (fileCount <= 10 || moduleCount <= 3) {
    estimatedSize = 'large';
  } else {
    estimatedSize = 'epic';
  }

  const effortClass = task.effort ?? 'normal';

  const riskClass: RequirementNumerical['riskClass'] = hasRiskyWrite(filesWrite, vocabulary)
    ? 'high'
    : estimatedSize === 'trivial' || estimatedSize === 'small'
      ? 'low'
      : 'medium';

  return { fileCount, moduleCount, estimatedSize, effortClass, riskClass };
}

// ─── produceContentStructural() ────────────────────────────────────────────

// Deliverable → work-type inference (spec §2a governance/deterministic mode).
// A CLOSED-SET → CLOSED-SET map (DeliverableType → WorkType), NOT a keyword table
// over prose: the dominant deliverable of a task's `filesWrite` is *structural*
// evidence of its work-type. Only the deliverables whose sole honest reading is a
// specific non-code work-type are mapped; code-src/code-test/manifest/script/asset
// carry no such signal (the task producing them may be build/fix/refactor —
// indistinguishable without the LLM content axis) and fall through to 'build'.
// This producer NEVER reads `task.title`/`task.description`, so the two hard
// word-inference bans (the token 'test'; an agent display-name in prose) hold by
// construction (spec §3 word-inference bans).
const DELIVERABLE_WORK_TYPE: ReadonlyMap<string, WorkType> = new Map<string, WorkType>([
  ['doc', 'document'],
  ['config', 'configure'],
  ['workflow', 'configure'],
  ['migration', 'migrate'],
]);

/** The max-ratio deliverable type, or undefined when there are none. Ties break
 *  by canonical `DELIVERABLE_TYPES` order — the array `producePositional` emits is
 *  already in that order, so the first-seen maximum wins. The tie-break is
 *  deterministic (replayable) and acceptable at this LOW-confidence structural
 *  tier: an exact-ratio ambiguity is exactly what the LLM content axis refines
 *  in Slice-2. */
function dominantDeliverable(deliverables: RequirementPositional['deliverables']): string | undefined {
  let best: { type: string; ratio: number } | undefined;
  for (const deliverable of deliverables) {
    if (best === undefined || deliverable.ratio > best.ratio) best = deliverable;
  }
  return best?.type;
}

/** Derive `workType` from STRUCTURAL evidence only (scope + deliverable ratios). */
function deriveStructuralWorkType(task: Task, positional: RequirementPositional): WorkType {
  if (!positional.needsWrite) {
    // Zero-write scope: an investigation (reads to produce information, writes
    // nothing) is the only work-type with a structural signature here. `review`
    // is indistinguishable from `analyze` without the LLM content axis, so among
    // the two only `analyze` is claimed; a zero-read scope carries no signal → build.
    return task.scope.filesRead.length > 0 ? 'analyze' : 'build';
  }
  const dominant = dominantDeliverable(positional.deliverables);
  if (dominant === undefined) return 'build';
  return DELIVERABLE_WORK_TYPE.get(dominant) ?? 'build';
}

/**
 * Produce the `content` axis of a task's RequirementVector at STRUCTURAL
 * provenance (spec §2a) — the governance/deterministic-mode backbone: the system
 * ships on exactly this producer when the AI content stage is off (spec §4
 * governance-mode). Deterministic, pure, fs-free: reads ONLY `task.scope.filesRead`
 * and the already-computed `positional` axis (deliverable ratios + `needsWrite`);
 * NEVER `task.title`/`task.description`. That prose-blindness is the mechanism
 * behind the two hard word-inference bans — the token 'test' and an agent
 * display-name in prose are structurally incapable of altering the output.
 *
 * `workType` (structural evidence only):
 *  - zero `filesWrite` + read-heavy scope (≥1 `filesRead`) → 'analyze'.
 *  - zero `filesWrite` + no reads → 'build' (no structural signal).
 *  - otherwise the dominant (max-ratio) deliverable drives it via the closed
 *    `DELIVERABLE_WORK_TYPE` map (doc→document · config/workflow→configure ·
 *    migration→migrate); an unmapped dominant deliverable → 'build'.
 *
 * `summary`/`semanticTags` are left `null` — a valid modeled state at this
 * provenance (the LLM producer fills them in Slice-2), not a stub.
 * `calibratedConfidence` is the structural-provenance confidence tier, sourced
 * from `routing_v3` config (`structuralConfidence`) rather than a magic literal;
 * the param default lets real call sites invoke `produceContentStructural(task,
 * positional)` while tests inject a value to pin the from-config derivation.
 */
export function produceContentStructural(
  task: Task,
  positional: RequirementPositional,
  structuralConfidence: number = DEFAULT_ROUTING_V3_CONFIG.structuralConfidence,
): RequirementContent {
  return {
    workType: deriveStructuralWorkType(task, positional),
    subtype: null,
    summary: null,
    semanticTags: null,
    provenance: 'structural',
    calibratedConfidence: structuralConfidence,
  };
}
