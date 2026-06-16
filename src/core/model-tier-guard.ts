// ─── Model Tier Guard (MODEL-GUARD) ──────────────────────────────────────────
// Structural floor: an economy-tier model (haiku family — haiku, gpt-5-mini,
// gpt-4.1-mini, gemini-2.0-flash) may ONLY run a `document-write` / `audit`
// task. A `code-development` task (anything that can touch source — .tsx/.ts/.css,
// including in-code i18n string work) is FORBIDDEN for economy-tier UNLESS the
// user explicitly pinned the model (DIRECTIVES `- Model:` / forceModel).
//
// Live proof (Sprint-283): the FIX-router misrouted a tsx-i18n task to haiku +
// doc-writer; CC caught it pre-spawn. This guard holds the floor in THREE places:
//   (1) routing/planner model selection (model-selector.resolveTaskModel)
//   (2) the FIX / mid-sprint reroute path (mid-sprint-adapter.applyReroute)
//   (3) planner DEFAULTs (sprint-planner via resolveTaskModel)
// so a code task can never default to an economy model.
//
// This is a string-free mechanism module: `reason` is an English diagnostic
// log string (mirrors the existing `reason:` strings in task-router.ts /
// model-selector.ts), never a user-facing UI label — so no i18n binding here.

import type { ModelType, ProviderName, TaskScope } from './types.js';
import { getModelTier, getModelForProviderTier } from './model-equivalence.js';
import { modelRegistry } from './model-registry.js';

// ─── Kind helpers ────────────────────────────────────────────────────────────

/**
 * Task kinds (canonical TaskKind ∪ rubric TaskType) that are EXEMPT from the
 * economy floor — pure narrative/analysis output, no source code, so a cheap
 * model is appropriate. Everything else is treated as code-bearing.
 */
const ECONOMY_ALLOWED_KINDS: ReadonlySet<string> = new Set([
  // rubric TaskType
  'document-write',
  'audit',
  // canonical TaskKind
  'documentation',
]);

/**
 * True when the given task-kind string may run on an economy-tier model.
 * Only pure doc/audit kinds qualify; every other kind is code-bearing.
 */
export function isEconomyAllowedForKind(kind: string): boolean {
  return ECONOMY_ALLOWED_KINDS.has(kind);
}

/**
 * True when the given task-kind string denotes code-bearing work (anything that
 * may touch source files). The inverse of {@link isEconomyAllowedForKind}.
 */
export function isCodeKindString(kind: string): boolean {
  return !ECONOMY_ALLOWED_KINDS.has(kind);
}

// ─── Guard result ────────────────────────────────────────────────────────────

export interface ModelTierGuardResult {
  /** The (possibly upgraded) model the caller should use. */
  model: ModelType;
  /** True when the guard upgraded an economy model to standard. */
  upgraded: boolean;
  /** The model the caller passed in (unchanged copy for diagnostics). */
  originalModel: ModelType;
  /** True when an explicit user override was honored despite the economy floor. */
  overrideHonored: boolean;
  /** English diagnostic log string (mechanism-level, not a UI label). */
  reason: string;
}

export interface ModelTierGuardInput {
  /** The model the upstream selector chose (e.g. 'haiku', 'gpt-5-mini'). */
  model: ModelType;
  /** Canonical TaskKind or rubric TaskType string (e.g. 'code-development'). */
  taskKind?: string;
  /** Task scope — used to derive the kind when `taskKind` is not supplied. */
  scope?: TaskScope;
  /** Provider the model belongs to — picks a provider-appropriate standard model. */
  targetProvider?: ProviderName;
  /** True when the user explicitly pinned this model (DIRECTIVES `- Model:` / forceModel). */
  explicitOverride?: boolean;
}

/** Look up a model's tier from the registry; null when the id is unknown (ollama tag). */
function tierOf(model: ModelType): 'economy' | 'standard' | 'premium' | 'premium_plus' | null {
  if (!modelRegistry.has(model)) return null;
  try {
    return getModelTier(model);
  } catch {
    return null;
  }
}

// Source-code directory prefixes — mirrors rubric-registry.isSourceCodeDir so the
// scope-shape classifier stays consistent without a cross-layer (orchestra) import
// (ADR-008: core must not depend on orchestra).
const SOURCE_CODE_PREFIXES = ['src/', 'src\\', 'tests/', 'tests\\', 'lib/', 'lib\\'];

function hasSourceDir(scope: TaskScope): boolean {
  return (scope.directories ?? []).some(d =>
    d === 'src' || d === 'tests' || d === 'lib' ||
    SOURCE_CODE_PREFIXES.some(p => d.startsWith(p)),
  );
}

/**
 * Classify a task kind from scope shape (i18n-neutral, gaming-proof) — mirrors
 * orchestra/rubric-registry.detectTaskType but kept core-local to avoid an
 * orchestra import. audit > document-write > code-development (first match wins).
 */
function kindFromScope(scope: TaskScope): string {
  const writes = scope.filesWrite ?? [];
  // audit: exactly one docs/audits/*.md file, no source dirs
  if (writes.length === 1 && writes[0]?.startsWith('docs/audits/') && writes[0]?.endsWith('.md') && !hasSourceDir(scope)) {
    return 'audit';
  }
  // document-write: non-empty, every file docs/*.md (not docs/audits/), no source dirs
  if (writes.length > 0 && !hasSourceDir(scope) &&
      writes.every(f => f.startsWith('docs/') && f.endsWith('.md') && !f.startsWith('docs/audits/'))) {
    return 'document-write';
  }
  return 'code-development';
}

/** Resolve the kind from explicit `taskKind` or by classifying `scope` shape. */
function resolveKind(input: ModelTierGuardInput): string {
  if (input.taskKind) return input.taskKind;
  if (input.scope) return kindFromScope(input.scope);
  // No kind signal at all → assume code-bearing (fail-closed: guard applies).
  return 'code-development';
}

/**
 * Enforce the economy-tier floor for code-development tasks.
 *
 * - Economy model + code-bearing kind + NO explicit override → upgrade to the
 *   provider-appropriate STANDARD model (haiku→sonnet, gpt-5-mini→gpt-4.1,
 *   gemini-2.0-flash→gemini-2.5-flash).
 * - Economy model + doc/audit kind → allowed, unchanged.
 * - Explicit override → honored (kept), but flagged in the result for logging.
 * - Standard/premium/premium_plus model, or an unknown/ollama tag → unchanged.
 *
 * Pure + deterministic; never throws. Provider-agnostic via the model registry.
 */
export function enforceModelTierGuard(input: ModelTierGuardInput): ModelTierGuardResult {
  const originalModel = input.model;
  const tier = tierOf(originalModel);

  // Only economy-tier models can violate the floor. Unknown tags (null) and
  // standard/premium/premium_plus pass through untouched.
  if (tier !== 'economy') {
    return {
      model: originalModel,
      upgraded: false,
      originalModel,
      overrideHonored: false,
      reason: tier === null
        ? `Model '${originalModel}' has no registry tier — guard skipped`
        : `Model '${originalModel}' is ${tier}-tier — economy floor not applicable`,
    };
  }

  const kind = resolveKind(input);

  // Doc/audit kinds may use an economy model.
  if (isEconomyAllowedForKind(kind)) {
    return {
      model: originalModel,
      upgraded: false,
      originalModel,
      overrideHonored: false,
      reason: `Economy model '${originalModel}' allowed for ${kind} task`,
    };
  }

  // Code-bearing kind + economy model. Honor an explicit user override.
  if (input.explicitOverride) {
    return {
      model: originalModel,
      upgraded: false,
      originalModel,
      overrideHonored: true,
      reason: `Economy model '${originalModel}' on ${kind} task kept by explicit user override (MODEL-GUARD honored)`,
    };
  }

  // Upgrade to the provider-appropriate standard model.
  const provider: ProviderName = input.targetProvider ?? modelRegistry.get(originalModel)?.provider as ProviderName ?? 'claude';
  const upgraded = getModelForProviderTier(provider, 'standard') ?? 'sonnet';

  return {
    model: upgraded,
    upgraded: true,
    originalModel,
    overrideHonored: false,
    reason: `Economy model '${originalModel}' forbidden for ${kind} task — upgraded to standard '${upgraded}' (MODEL-GUARD)`,
  };
}
