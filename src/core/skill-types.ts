// ─── Skill System Types ─────────────────────────────────────────────────────
import type { ModelType } from './types.js';
import type { ActivationConfig } from './routing-types.js';
import { validateSkillProfile } from './routing/capability-vector.js';
import type { SkillProfile, CapabilityValidationIssue } from './routing/capability-vector.js';

// ─── Skill Category ─────────────────────────────────────────────────────────

export type SkillCategory = 'language' | 'framework' | 'tool' | 'domain' | 'workflow';

// ─── Stack Detection Rule ───────────────────────────────────────────────────

export interface StackDetectionRule {
  files: string[];         // file patterns to check existence
  dependencies: string[];  // package.json deps to check
  commands: string[];      // CLI commands to check
}

// ─── Prompt Injection Config ────────────────────────────────────────────────

export interface PromptInjectionConfig {
  position: 'prepend' | 'append' | 'section';
  maxTokens: number;  // default 1500
}

// ─── Skill Stats ────────────────────────────────────────────────────────────

export interface SkillStats {
  totalUses: number;
  successCount: number;    // explicit count of successful uses
  successRate: number;     // 0.0-1.0
  avgCoverage: number;     // 0-100
  lastUsedInSprint: string;
}

// ─── Skill Definition ───────────────────────────────────────────────────────

export interface SkillDefinition {
  /** ROUTING-V3 skill matching profile (capability-vector.ts SkillProfile shape);
   *  optional — profile-less skills are simply not V3 candidates. */
  profile?: unknown;
  id: string;
  name: string;
  version: string;
  description: string;
  entrypoint: string;       // SKILL.md path
  category: SkillCategory;
  triggers: string[];
  stackDetection: StackDetectionRule;
  composableWith: string[];
  priority: number;         // higher = selected first
  promptInjection: PromptInjectionConfig;
  model?: ModelType;
  enabled: boolean;
  stats: SkillStats;
  /** Manifest version: 1 (v1 triggers), 2 (v2 activation rules) */
  manifestVersion?: 1 | 2;
  /** V2 activation rules — if present, used instead of triggers */
  activation?: ActivationConfig;
}

// ─── V3 Profile State — carried as data, never decided (521-005) ────────────
//
// follow-up-works/skill-catalog-authority-design-2026-08-11.md §3.5 + OWNER
// DECISIONS D5/D6 (2026-08-11, Alperen). The catalog REPORTS whether a skill
// carries a usable V3 routing profile; it does not repair one, does not map a
// legacy `activation` block onto one, and does not hide the skills that lack
// one. Deriving a canonical profile (and any legacy-activation bridge) is row
// 7121's authority — D6.
//
// The measured symptom this closes: 30 of 31 project skills carry no profile,
// so `routing-plan-adapter.ts` silently drops them as V3 candidates while every
// surface still presents them as available. `profileState` makes that fact
// readable instead of invisible.

/**
 * The three states a skill's V3 routing profile can be in.
 *
 * `absent` means the manifest carries no `profile` key at all; anything present
 * that {@link validateSkillProfile} rejects is `present-invalid`. The design's
 * fourth value (`unresolved`, for a legacy V2-activation skill awaiting an
 * owner-approved mapping) is deliberately NOT minted here: partitioning the
 * `absent` set on activation grounds is a reconciliation decision, and that is
 * row 7121's (D6).
 */
export type SkillProfileState = 'present-valid' | 'present-invalid' | 'absent';

/** The derived profile fact for one skill — state plus the evidence behind it. */
export interface SkillProfileStatus {
  /** Named `profileState` (not `state`) so a catalog row can carry it beside the
   *  disposition's own `state` without either shadowing the other — design §3.5
   *  spells this field `routing.profileState`. */
  profileState: SkillProfileState;
  /** The validated profile when `state === 'present-valid'`, otherwise null. */
  profile: SkillProfile | null;
  /** Validator issues — non-empty only when `state === 'present-invalid'`. */
  issues: readonly CapabilityValidationIssue[];
}

/**
 * The single derivation of {@link SkillProfileState} — every surface reads this
 * one function rather than re-testing `profile` on its own. Validity is
 * delegated to {@link validateSkillProfile}, the same validator
 * `src/orchestra/routing-plan-adapter.ts` already uses to admit V3 candidates,
 * so state and real routability can never drift apart.
 */
export function deriveSkillProfileState(
  definition: Pick<SkillDefinition, 'profile'>,
): SkillProfileStatus {
  const raw = definition.profile;
  if (raw === undefined || raw === null) {
    return { profileState: 'absent', profile: null, issues: [] };
  }
  const validation = validateSkillProfile(raw);
  return validation.ok
    ? { profileState: 'present-valid', profile: validation.value, issues: [] }
    : { profileState: 'present-invalid', profile: null, issues: validation.issues };
}

/**
 * What a surface should render for one catalog row — OWNER DECISION D5
 * (installed-but-unroutable is a visible label, not a hidden entry).
 *
 * `withdrawn` is the quarantined/retired tombstone the read model already masks
 * fail-closed; `installed-unroutable` is the D5 case that used to be invisible.
 */
export type SkillCatalogVisibility = 'routable' | 'installed-unroutable' | 'withdrawn';

/** {@link SkillProfileStatus} plus the two facts derived from it (design §3.5). */
export interface SkillRoutingState extends SkillProfileStatus {
  /** Derived, never authored: an active disposition AND a valid profile. */
  routable: boolean;
  /** D5 label — an unroutable skill stays listed, honestly marked. */
  visibility: SkillCatalogVisibility;
}

/**
 * Derive the routing state of one resolved catalog row.
 *
 * The parameter is structural on purpose: an `EffectiveSkill` from
 * `resolveSkillCatalog()` satisfies it as-is, so this consumes the single read
 * model without importing `skill-pool.ts` back into the leaf type module.
 * `masked` is taken from the resolver rather than re-derived from the
 * disposition state — the resolver owns that fail-closed decision.
 */
export function deriveSkillRoutingState(record: {
  readonly definition: Pick<SkillDefinition, 'profile'>;
  readonly disposition: { readonly state: string };
  readonly masked: boolean;
}): SkillRoutingState {
  const status = deriveSkillProfileState(record.definition);
  const routable =
    !record.masked && record.disposition.state === 'active' && status.profileState === 'present-valid';
  return {
    ...status,
    routable,
    visibility: record.masked ? 'withdrawn' : routable ? 'routable' : 'installed-unroutable',
  };
}

// ─── Project Stack ──────────────────────────────────────────────────────────

export interface ProjectStack {
  language: string;
  framework: string;
  dependencies: string[];
  buildTool: string;
  testFramework: string;
  detectedAt: string;
  detectedLanguages?: string[];
  subProjects?: string[];
}

// ─── Skill Selection Result ─────────────────────────────────────────────────

export interface SkillSelectionResult {
  skills: SkillDefinition[];
  scores: Map<string, number>;
  truncated: boolean;  // true if capped at max skills
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Create default skill stats with zeroed counters.
 */
export function createDefaultSkillStats(): SkillStats {
  return {
    totalUses: 0,
    successCount: 0,
    successRate: 0,
    avgCoverage: 0,
    lastUsedInSprint: '',
  };
}

/**
 * Create a SkillDefinition with sensible defaults.
 * Requires at minimum `id` and `name`.
 */
export function createSkillDefinition(
  partial: Partial<SkillDefinition> & { id: string; name: string },
): SkillDefinition {
  return {
    version: '0.1.0',
    description: '',
    entrypoint: 'SKILL.md',
    category: 'tool',
    triggers: [],
    stackDetection: { files: [], dependencies: [], commands: [] },
    composableWith: [],
    priority: 0,
    promptInjection: { position: 'append', maxTokens: 1500 },
    enabled: true,
    stats: createDefaultSkillStats(),
    ...partial,
  };
}
