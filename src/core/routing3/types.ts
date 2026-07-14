// ═══ RoutingEngineV3 — Core Vocabulary Types ══════════════════════════
// Slice-0 FOUNDATION (sprint-445). The closed-core type surface for the
// vector-selection routing engine: work-types, proficiency, deliverable
// types, the domain schema, subtype grammar, and the typed-error family.
//
// Source of truth: .analysis/routing-v3-secenek-b-detay-2026-07-14.md §1a/§1b/§1c.
// Language is EN by design — this vocabulary is model-surface (it feeds the
// LLM content-fit axis), NOT user-facing CLI output, so it is not routed
// through getMessage (§6 i18n applies to lint/doctor/story rendering only).

import { DeckentError } from '../errors.js';

// ─── Work Types (CLOSED set — spec §1a) ──────────────────────────────
// Closed by design: learning-cells and verifier lints require stable
// semantics. An open work-type is a new catch-all seed. Customization
// happens through SUBTYPE (see parseSubtype), never by growing this union.
// There is deliberately NO 'test' work-type — test-writing is part of the
// build/fix/refactor DoD, and test-dominance is a verifier attribute only.
export type WorkType =
  | 'build'
  | 'fix'
  | 'refactor'
  | 'document'
  | 'review'
  | 'configure'
  | 'migrate'
  | 'analyze';

/** A single closed-core work-type definition (kernel semantics — spec §1a). */
export interface WorkTypeDef {
  /** The work-type identifier (member of the closed WorkType union). */
  readonly type: WorkType;
  /** One-sentence contract: what this work-type does. */
  readonly contract: string;
  /** The definition-of-done signature this work-type must satisfy. */
  readonly dodSignature: string;
  /** Illustrative in-category task phrasings (feeds the content-fit axis). */
  readonly examples: readonly string[];
}

// ─── Proficiency (capability-vector grading — spec §2b) ──────────────
/** How well a capability serves a work-type or domain. */
export type Proficiency = 'primary' | 'secondary' | 'able' | 'never';

// ─── Deliverable Types (CLOSED set — spec §1c) ───────────────────────
// The positional-evidence vocabulary. Derived deterministically from a
// task's filesWrite; a closed set so the verifier's deliverable⊆capability
// invariant stays stable.
export type DeliverableType =
  | 'code-src'
  | 'code-test'
  | 'doc'
  | 'config'
  | 'workflow'
  | 'manifest'
  | 'script'
  | 'migration'
  | 'asset';

// ─── Domain Definition (schema only — spec §1b) ──────────────────────
// The OPEN-set domain registry entry shape. Entries themselves are added in
// Task 2 (builtin base) and derived per-project by `deckent analyze`; this
// task defines the schema only.
export interface DomainDef {
  /** Stable domain id (e.g. 'i18n', 'connectors/messaging'). */
  readonly id: string;
  /** Alternate names / multilingual aliases used for recognition. */
  readonly aliases: readonly string[];
  /** Glob path patterns whose match is positional evidence of this domain. */
  readonly pathPatterns: readonly string[];
  /** Package / stack markers that evidence this domain (e.g. 'i18next'). */
  readonly stackMarkers: readonly string[];
  /** Human/LLM-readable description used by the content-fit axis. */
  readonly description: string;
  /** Optional surface binding (e.g. 'cli', 'api', 'frontend'). */
  readonly surfaces: readonly string[];
  /** Optional policy hook: roles that exclusively own this domain. */
  readonly exclusiveRoles: readonly string[];
}

// ─── Subtype grammar (customization — spec §1a) ──────────────────────
/**
 * Result of parsing a `parent:subtype` work-type string. Learning and lint
 * roll up to `parent`; `subtype` is null when the input is a bare parent
 * work-type (the rollup form).
 */
export interface ParsedSubtype {
  /** The closed-core parent work-type (learning/lint rollup key). */
  readonly parent: WorkType;
  /** Free-text subtype, or null when the input is a bare parent (rollup). */
  readonly subtype: string | null;
}

// ─── Typed errors (DeckentError family) ──────────────────────────────
// Semantic string codes (not DECKENT_Exxx registry codes): the errors.ts
// registry is a separate module; routing3 owns its own vocabulary errors,
// mirroring the OutputCollectorError pattern (semantic code, no registry row).

/** Thrown when a string is not a valid closed-core work-type. */
export class InvalidWorkTypeError extends DeckentError {
  /** The offending token that failed work-type validation. */
  public readonly value: string;
  constructor(value: string, detail?: string) {
    super(
      'ROUTING3_INVALID_WORK_TYPE',
      `Invalid work-type: ${JSON.stringify(value)}${detail ? ` (${detail})` : ''}`,
      'Use one of the 8 closed-core work-types: build, fix, refactor, document, review, configure, migrate, analyze. The work-type union is closed — customize via a "parent:subtype" string instead.',
    );
    this.name = 'InvalidWorkTypeError';
    this.value = value;
  }
}

/** Thrown when a `parent:subtype` string has a malformed subtype segment. */
export class InvalidSubtypeError extends DeckentError {
  /** The offending subtype string that failed grammar validation. */
  public readonly value: string;
  constructor(value: string, detail?: string) {
    super(
      'ROUTING3_INVALID_SUBTYPE',
      `Invalid subtype grammar: ${JSON.stringify(value)}${detail ? ` (${detail})` : ''}`,
      'Subtype grammar is "parent:subtype" (e.g. "review:compliance"). The parent must be a closed-core work-type and the subtype after ":" must be non-empty. Use the bare parent (e.g. "review") for the rollup form.',
    );
    this.name = 'InvalidSubtypeError';
    this.value = value;
  }
}
