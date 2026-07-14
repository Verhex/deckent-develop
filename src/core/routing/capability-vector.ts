// ═══ RoutingEngineV3 — Agent CapabilityVector Schema (agent.json-v3) ═════════
// Slice-0 FOUNDATION (sprint-445). The zod contract for the `capabilities`
// block of an agent.json-v3 manifest — content / positional / numerical axes,
// mirroring the TaskRequirement shape (spec §2a) so both sides of the
// matching pipeline share one vocabulary (spec §2b).
//
// Source of truth: .analysis/routing-v3-secenek-b-detay-2026-07-14.md §2b.
// V2's `activation.rules` dies with this manifest generation; migration is a
// separate concern (`deckent sync`), out of scope here.

import { z } from 'zod';
import type { ModelTier } from '../model-registry-types.js';
import { isWorkType, isDeliverableType } from './vocabulary-builtin.js';

// ─── Version ──────────────────────────────────────────────────────────────
/** The single supported `capabilities` schema generation. A version bump is a
 *  superseding schema, not a union member here. */
export const CAPABILITIES_VERSION = 3 as const;

// ─── Component schemas ────────────────────────────────────────────────────

/** Proficiency grading (spec §2b) — shared by content.workTypes and positional.domains. */
const proficiencySchema = z.enum(['primary', 'secondary', 'able', 'never']);

/** Closed-core work-type id, reusing the Slice-0 vocabulary guard (never re-derived here). */
const workTypeIdSchema = z.string().refine(isWorkType, {
  message: 'must be one of the 8 closed-core work-types (build, fix, refactor, document, review, configure, migrate, analyze)',
});

/** Closed deliverable-type id, reusing the Slice-0 vocabulary guard. */
const deliverableTypeSchema = z.string().refine(isDeliverableType, {
  message: 'must be one of the 9 closed deliverable types',
});

/** Reuse the model-registry's own cost-tier taxonomy instead of inventing a parallel one. */
const COST_TIERS: readonly ModelTier[] = ['economy', 'standard', 'premium', 'premium_plus'];
const costTierSchema = z.enum(COST_TIERS as [ModelTier, ...ModelTier[]]);

const workTypeEntrySchema = z
  .object({
    type: workTypeIdSchema,
    proficiency: proficiencySchema,
  })
  .strict();

const domainEntrySchema = z
  .object({
    // '*' (open-list wildcard, expert agent) or an open-set domain-registry id.
    id: z.string().min(1),
    proficiency: proficiencySchema,
  })
  .strict();

const contentSchema = z
  .object({
    workTypes: z.array(workTypeEntrySchema),
    expertise: z.array(z.string()),
    personaSlices: z.array(z.string()),
  })
  .strict();

const positionalSchema = z
  .object({
    domains: z.array(domainEntrySchema),
    surfaces: z.array(z.string()),
    writeAuthority: z.boolean(),
    role: z.string().min(1),
    deliverables: z.array(deliverableTypeSchema),
  })
  .strict();

const numericalSchema = z
  .object({
    // Never literal-checked against the model-registry here (zero-hardcode) — the real
    // id-existence check runs at LOAD time, in whichever layer owns the registry singleton.
    preferredModel: z.string().min(1).optional(),
    costTier: costTierSchema,
    maxParallel: z.number().int().positive().nullable(),
  })
  .strict();

// ─── CapabilityVector (spec §2b) ──────────────────────────────────────────
// `.strict()` at every level — most importantly here at the top — is the mechanism
// behind "outcome-stats NEVER in manifest": an unrecognized `stats` key (or any other
// stray key) fails validation instead of silently passing through.
export const capabilityVectorSchema = z
  .object({
    capabilitiesVersion: z.literal(CAPABILITIES_VERSION),
    content: contentSchema,
    positional: positionalSchema,
    numerical: numericalSchema,
  })
  .strict();

export type CapabilityVector = z.infer<typeof capabilityVectorSchema>;

// ─── validateCapabilities() — typed issues list (lint/doctor reuse) ───────

/** One structured, machine-consumable validation failure. */
export interface CapabilityValidationIssue {
  /** Dot-path to the offending field (e.g. "positional.domains[0].proficiency"), or "(root)". */
  readonly path: string;
  /** Human-readable failure description. */
  readonly message: string;
  /** The underlying zod issue code (e.g. "invalid_enum_value", "unrecognized_keys"). */
  readonly code: string;
}

export type ValidateCapabilitiesResult =
  | { readonly ok: true; readonly value: CapabilityVector }
  | { readonly ok: false; readonly issues: readonly CapabilityValidationIssue[] };

/** Shared zod-error → typed-issues mapping, reused by every validate*() in this module. */
function toValidationIssues(error: z.ZodError): CapabilityValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Validate an unknown value as a `capabilities` (agent.json-v3) block. Never throws — returns
 * a discriminated result so lint/doctor tooling can render every failure, not just the first.
 */
export function validateCapabilities(input: unknown): ValidateCapabilitiesResult {
  const parsed = capabilityVectorSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return { ok: false, issues: toValidationIssues(parsed.error) };
}

// ─── hasTestCapability() — universal test-capability rule (Alperen decision) ──
/**
 * Every write-authority agent implicitly carries code-test capability — there is no
 * `'test'` work-type and no dedicated test field on the manifest (spec §2b). This is the
 * single, non-duplicated source of that rule; callers must not re-derive it inline.
 */
export function hasTestCapability(cap: Pick<CapabilityVector, 'positional'>): boolean {
  return cap.positional.writeAuthority === true;
}

// ─── SkillProfile (spec §2b) ───────────────────────────────────────────────
// "Skill'ler aynı şemanın skill-profilini taşır (workTypes+domains+expertise) → agent+
// skill+persona-slice TEK eşleşme-uzayında" — skills reuse the exact agent entry shapes
// (workTypeEntrySchema / domainEntrySchema / deliverableTypeSchema) so matchSpace() below
// can return a structurally identical shape for either input. Skills carry no
// writeAuthority/role — they are knowledge, not actors — and no numerical block; there is
// no skill counterpart to an agent's costTier/preferredModel/maxParallel.

/** The single supported `skillProfile` schema generation. */
export const SKILL_PROFILE_VERSION = 3 as const;

export const skillProfileSchema = z
  .object({
    profileVersion: z.literal(SKILL_PROFILE_VERSION),
    workTypes: z.array(workTypeEntrySchema),
    domains: z.array(domainEntrySchema),
    expertise: z.array(z.string()),
    deliverables: z.array(deliverableTypeSchema),
    // Cost signal carried straight through from the skill manifest — routing3 does not
    // interpret or weigh it here; the future matching pipeline decides how to use it.
    tokenCost: z.number().nonnegative().optional(),
  })
  .strict();

export type SkillProfile = z.infer<typeof skillProfileSchema>;

export type ValidateSkillProfileResult =
  | { readonly ok: true; readonly value: SkillProfile }
  | { readonly ok: false; readonly issues: readonly CapabilityValidationIssue[] };

/**
 * Validate an unknown value as a `skillProfile` block. Never throws — mirrors
 * validateCapabilities()'s discriminated-result shape so callers can treat agent and
 * skill validation uniformly.
 */
export function validateSkillProfile(input: unknown): ValidateSkillProfileResult {
  const parsed = skillProfileSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return { ok: false, issues: toValidationIssues(parsed.error) };
}

// ─── matchSpace() — the one matching space (spec §2b) ─────────────────────

export type WorkTypeEntry = z.infer<typeof workTypeEntrySchema>;
export type DomainEntry = z.infer<typeof domainEntrySchema>;
export type DeliverableType = z.infer<typeof deliverableTypeSchema>;

/**
 * The common axes shape the future matching pipeline consumes (spec §2b: agent + skill +
 * persona-slice in ONE matching space). Built only by `matchSpace()` below so agent-derived
 * and skill-derived instances stay structurally identical — never hand-assemble this shape
 * elsewhere.
 */
export interface MatchSpace {
  readonly workTypes: readonly WorkTypeEntry[];
  readonly domains: readonly DomainEntry[];
  readonly expertise: readonly string[];
  readonly deliverables: readonly DeliverableType[];
}

/**
 * Normalize an agent CapabilityVector or a SkillProfile into the shared MatchSpace shape.
 * Discriminates on `capabilitiesVersion` (agent-only literal key) vs. everything else
 * (SkillProfile) — the two schemas are `.strict()`, so the keys are mutually exclusive.
 */
export function matchSpace(input: CapabilityVector | SkillProfile): MatchSpace {
  if ('capabilitiesVersion' in input) {
    return {
      workTypes: input.content.workTypes,
      domains: input.positional.domains,
      expertise: input.content.expertise,
      deliverables: input.positional.deliverables,
    };
  }
  return {
    workTypes: input.workTypes,
    domains: input.domains,
    expertise: input.expertise,
    deliverables: input.deliverables,
  };
}
