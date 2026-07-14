// ─── Decision System Types ─────────────────────────────────────────────────
import type { ModelType, TaskEffort, TaskScope, PatternEntry, ResolvedConfig } from './types.js';
import type { AgentDefinition, AgentPool } from './agent-types.js';
import type { SkillDefinition, ProjectStack } from './skill-types.js';
import type { TaskKind } from './work-model.js';

// ─── Task Type (WM-2 canonical-reconciled) ──────────────────────────────────
// Single source of truth for the decision taxonomy values. Previously the union
// literal and a parallel runtime validation array duplicated the same seven
// members; `TaskType` is now DERIVED from one const tuple (no drift, no
// duplicate array). The decision taxonomy is a faithful projection of the
// canonical `TaskKind` SSOT (src/core/work-model.ts) via the `decisionTypeToKind`
// adapter — see {@link DecisionCanonicalKind} + tests/core/wm2-canonical.test.ts.

const DECISION_TASK_TYPES = ['code', 'test', 'doc', 'security', 'refactor', 'devops', 'config'] as const;

export type TaskType = (typeof DECISION_TASK_TYPES)[number];

/**
 * The canonical {@link TaskKind} a decision {@link TaskType} reconciles to (via
 * work-model `decisionTypeToKind`). Canonical-import anchor — links decision
 * callsites to the one work-model SSOT instead of re-deriving a taxonomy.
 * Compile-time only; erased at runtime.
 */
export type DecisionCanonicalKind = TaskKind;

// ─── Task Analysis ─────────────────────────────────────────────────────────

export interface TaskAnalysis {
  type: TaskType;
  complexity: number;  // 0-10
  keywords: string[];
  scopeWeight: number;
  estimatedDurationMs: number;
}

// ─── Decision Log ──────────────────────────────────────────────────────────

export interface DecisionLogEntry {
  step: number;  // 1-6
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  durationMs: number;
  reasoning: string;
}

// ─── Decision Result ───────────────────────────────────────────────────────

export interface DecisionResult {
  analysis: TaskAnalysis;
  agent: AgentDefinition | null;
  skills: SkillDefinition[];
  model: ModelType;
  effort: TaskEffort;
  scope: TaskScope;
  decisionLog: DecisionLogEntry[];
}

// ─── Decision Context ──────────────────────────────────────────────────────

export interface DecisionContext {
  projectStack: ProjectStack | null;
  agentPool: AgentPool;
  skillPool: Map<string, SkillDefinition>;
  patterns: PatternEntry[];
  config: ResolvedConfig;
}

// ─── Helper Functions ──────────────────────────────────────────────────────

/**
 * Create a default TaskAnalysis with zeroed/empty fields.
 */
export function createDefaultAnalysis(): TaskAnalysis {
  return {
    type: 'code',
    complexity: 0,
    keywords: [],
    scopeWeight: 0,
    estimatedDurationMs: 0,
  };
}

/**
 * Type guard: checks if a string is a valid TaskType.
 */
export function isValidTaskType(type: string): type is TaskType {
  return (DECISION_TASK_TYPES as readonly string[]).includes(type);
}

/**
 * Create a DecisionLogEntry with given step, name, and reasoning.
 * Input/output default to empty objects, durationMs defaults to 0.
 */
export function createDecisionLogEntry(
  step: number,
  name: string,
  reasoning: string,
): DecisionLogEntry {
  return {
    step,
    name,
    input: {},
    output: {},
    durationMs: 0,
    reasoning,
  };
}

// ═══ V3 Decision Pipeline — RoutingDecisionV3 + DecisionStory +
// BrainEscalation + JournalEntryV3 (RoutingEngineV3, sprint-446 Task 446-002) ═
// Typed core + replay-journal schema for routeTaskV3's decision record
// (.analysis/routing-v3-design-spec-2026-07-14.md §4). Lives here — not under
// routing3/ — because this task's write scope is decision-types.ts; the V2
// decision-system types above are UNCHANGED, this section is purely
// additive. The story-RENDERING / journal-writing logic (decision-story.ts)
// is a separate, later Slice-1 task; this file owns only the shapes.
//
// Every schema is `.strict()`; every exported type is `z.infer` (schema is
// the single source of truth, never hand-duplicated as a parallel
// interface). `RoutingDecisionV3` and `JournalEntryV3` are the two SEALED
// record types (design spec: "frozen/readonly; no internal references
// leak.") — each is a `DeepReadonly` view produced only by its `create*()`
// factory, which zod-validates, `structuredClone()`s (severs references to
// caller-owned arrays/objects), then `Object.freeze()`s the full tree.
// `DecisionStory`/`BrainEscalation` stay plain (mutable) `z.infer` types on
// their own — pipeline stages build them incrementally (push story steps /
// eliminated candidates) before the decision is sealed.

import { z } from 'zod';
import { DeckentError } from './errors.js';
import { capabilityVectorSchema } from './routing/capability-vector.js';
import { requirementVectorSchema } from './routing/requirement-vector.js';

// ─── DeepReadonly (local — no shared one exists in the codebase; zod 3.25
// has no built-in `.readonly()`) ────────────────────────────────────────────
type DeepReadonly<T> = T extends readonly (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Recursively Object.freeze a plain-object/array tree (mirrors routing3/vocabulary.ts's own deepFreeze). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Shared zod-error -> single-line detail string, mirrors routing3/config.ts's own formatting. */
function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

// ─── AxisScoresV3 (shared shape — mirrors routing3/config.ts's weights) ─────
export const axisScoresV3Schema = z
  .object({
    content: z.number().min(0).max(1),
    positional: z.number().min(0).max(1),
    numerical: z.number().min(0).max(1),
  })
  .strict();

export type AxisScoresV3 = z.infer<typeof axisScoresV3Schema>;

// ─── DecisionStory (spec §4 — the human-readable "why", built incrementally
// across the 5 pipeline stages: elimination -> content-fit -> verifier ->
// numerical ranking -> decision. `stage`/`outcome` are open strings — the
// canonical stage names are match-pipeline.ts's concern (a later task),
// not fixed here). ───────────────────────────────────────────────────────
export const decisionStepSchema = z
  .object({
    stage: z.string().min(1),
    outcome: z.string().min(1),
    detail: z.string().min(1),
  })
  .strict();

export type DecisionStep = z.infer<typeof decisionStepSchema>;

export const eliminatedCandidateSchema = z
  .object({
    agentId: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export type EliminatedCandidate = z.infer<typeof eliminatedCandidateSchema>;

export const decisionStorySchema = z
  .object({
    summary: z.string().min(1),
    steps: z.array(decisionStepSchema),
    eliminated: z.array(eliminatedCandidateSchema),
  })
  .strict();

export type DecisionStory = z.infer<typeof decisionStorySchema>;

// ─── BrainEscalation (spec §3 edge policies — tie / low-confidence /
// catalog-gap / conflict; ownership-invariant + LLM-disagreement escalate
// to Brain, never a silent fallback). ───────────────────────────────────────
export const BRAIN_ESCALATION_REASONS = ['tie', 'low-confidence', 'catalog-gap', 'conflict'] as const;
export const brainEscalationReasonSchema = z.enum(BRAIN_ESCALATION_REASONS);
export type BrainEscalationReason = (typeof BRAIN_ESCALATION_REASONS)[number];

export const brainEscalationCandidateSchema = z
  .object({
    agentId: z.string().min(1),
    finalScore: z.number().min(0).max(1),
    axisScores: axisScoresV3Schema,
  })
  .strict();

export type BrainEscalationCandidate = z.infer<typeof brainEscalationCandidateSchema>;

export const brainEscalationSchema = z
  .object({
    reason: brainEscalationReasonSchema,
    candidates: z.array(brainEscalationCandidateSchema),
    evidence: z.string().min(1),
  })
  .strict();

export type BrainEscalation = z.infer<typeof brainEscalationSchema>;

// ─── RoutingDecisionV3 (spec §4 — the sealed decision record returned by
// routeTaskV3). `provenance` records which stage produced the winning
// content-fit signal: 'deterministic' (governance mode / structural-only)
// or 'ai' (content-fit LLM stage ran). ──────────────────────────────────────
export const ROUTING_DECISION_V3_PROVENANCES = ['deterministic', 'ai'] as const;
export const routingDecisionV3ProvenanceSchema = z.enum(ROUTING_DECISION_V3_PROVENANCES);
export type RoutingDecisionV3Provenance = (typeof ROUTING_DECISION_V3_PROVENANCES)[number];

export const routingDecisionV3Schema = z
  .object({
    agentId: z.string().min(1),
    skillIds: z.array(z.string().min(1)),
    personaSlices: z.array(z.string().min(1)),
    // Zero-hardcode (ADR-G-036): no model-id literal check here, mirrors
    // capability-vector.ts's own `numerical.preferredModel` — the real
    // id-existence check runs at LOAD time against the model-registry.
    modelPreference: z.string().min(1),
    effortClass: z.enum(['low', 'normal', 'high']),
    axisScores: axisScoresV3Schema,
    finalScore: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    provenance: routingDecisionV3ProvenanceSchema,
    story: decisionStorySchema,
    escalation: brainEscalationSchema.optional(),
  })
  .strict();

export type RoutingDecisionV3Input = z.infer<typeof routingDecisionV3Schema>;

/** The sealed, deep-readonly decision record — construct only via {@link createRoutingDecisionV3}. */
export type RoutingDecisionV3 = DeepReadonly<RoutingDecisionV3Input>;

/** Thrown when a value fails `routingDecisionV3Schema` validation. */
export class InvalidRoutingDecisionV3Error extends DeckentError {
  constructor(detail: string) {
    super(
      'ROUTING3_INVALID_DECISION',
      `Invalid RoutingDecisionV3: ${detail}`,
      'Check the shape against RoutingDecisionV3Input (core/decision-types.ts) — every field is required except `escalation`.',
    );
    this.name = 'InvalidRoutingDecisionV3Error';
  }
}

/**
 * Validate and seal a `RoutingDecisionV3` — zod-validates `input`, then
 * `structuredClone()`s (severs references to caller-owned arrays/objects —
 * "no internal references leak") and deep-freezes the result before
 * returning. Throws {@link InvalidRoutingDecisionV3Error} on invalid input.
 * The ONLY sanctioned way to produce a `RoutingDecisionV3` — never
 * hand-assemble the frozen shape elsewhere.
 */
export function createRoutingDecisionV3(input: unknown): RoutingDecisionV3 {
  const parsed = routingDecisionV3Schema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidRoutingDecisionV3Error(formatZodIssues(parsed.error));
  }
  return deepFreeze(structuredClone(parsed.data)) as RoutingDecisionV3;
}

// ─── JournalEntryV3 (spec §4 — append-only replay journal. Captures the
// task's RequirementVector plus, per candidate, its CapabilityVector
// snapshot ("both vectors") and per-candidate stage outcomes, so the
// deterministic stages (elimination/verifier/ranking) replay from the
// journal WITHOUT re-running any AI call — the AI stage's own output is
// already folded into `decision` verbatim.) ─────────────────────────────────
export const JOURNAL_ENTRY_V3_SCHEMA_VERSION = 1 as const;

export const journalCandidateOutcomeSchema = z
  .object({
    agentId: z.string().min(1),
    capabilityVector: capabilityVectorSchema,
    steps: z.array(decisionStepSchema),
  })
  .strict();

export type JournalCandidateOutcome = z.infer<typeof journalCandidateOutcomeSchema>;

export const journalEntryV3Schema = z
  .object({
    schemaVersion: z.literal(JOURNAL_ENTRY_V3_SCHEMA_VERSION),
    taskId: z.string().min(1),
    requirementVector: requirementVectorSchema,
    candidateOutcomes: z.array(journalCandidateOutcomeSchema),
    decision: routingDecisionV3Schema,
    configSnapshotHash: z.string().min(1),
  })
  .strict();

export type JournalEntryV3Input = z.infer<typeof journalEntryV3Schema>;

/** The sealed, deep-readonly journal record — construct only via {@link createJournalEntryV3}. */
export type JournalEntryV3 = DeepReadonly<JournalEntryV3Input>;

/** Thrown when a value fails `journalEntryV3Schema` validation. */
export class InvalidJournalEntryV3Error extends DeckentError {
  constructor(detail: string) {
    super(
      'ROUTING3_INVALID_JOURNAL_ENTRY',
      `Invalid JournalEntryV3: ${detail}`,
      'Check the shape against JournalEntryV3Input (core/decision-types.ts) — schemaVersion must be exactly 1.',
    );
    this.name = 'InvalidJournalEntryV3Error';
  }
}

/**
 * Validate and seal a `JournalEntryV3` — same safeParse -> structuredClone ->
 * deepFreeze pattern as {@link createRoutingDecisionV3}. Throws
 * {@link InvalidJournalEntryV3Error} on invalid input. The ONLY sanctioned
 * way to produce a `JournalEntryV3` — journal writers append the frozen
 * result verbatim (spec: "journal append-only").
 */
export function createJournalEntryV3(input: unknown): JournalEntryV3 {
  const parsed = journalEntryV3Schema.safeParse(input);
  if (!parsed.success) {
    throw new InvalidJournalEntryV3Error(formatZodIssues(parsed.error));
  }
  return deepFreeze(structuredClone(parsed.data)) as JournalEntryV3;
}
