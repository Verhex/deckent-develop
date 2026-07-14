// ─── RoutingEngineV3 — decision, story, escalation and journal types ─────────
// Slice-1 DETERMINISTIC ENGINE (hand-coded, Brain 2026-07-14 — sprint-446 cascade
// salvage). Spec: .analysis/routing-v3-design-spec-2026-07-14.md §4 + detail §2/§3.
//
// Everything here is a PURE data contract: no fs, no Date.now(), no randomness —
// timestamps and ids are supplied by callers so decisions replay bit-identically
// from the journal (spec §5 determinism proof).

import { z } from 'zod';
import { requirementVectorSchema } from './requirement-vector.js';
import type { RequirementVector } from './requirement-vector.js';

// ─── Axis scores ─────────────────────────────────────────────────────────────

/** Per-axis normalized score with human-debuggable evidence. */
export const axisScoreSchema = z
  .object({
    score: z.number().min(0).max(1),
    /** Concrete provenance strings ("workType build→primary", "domain i18n 0.8×primary"). */
    evidence: z.array(z.string()),
  })
  .strict();

export type AxisScore = z.infer<typeof axisScoreSchema>;

export const axisScoresSchema = z
  .object({
    content: axisScoreSchema,
    positional: axisScoreSchema,
    numerical: axisScoreSchema,
  })
  .strict();

export type AxisScores = z.infer<typeof axisScoresSchema>;

// ─── Elimination ─────────────────────────────────────────────────────────────

/** Typed reasons a candidate is removed before scoring (stage-1). */
export const eliminationReasonSchema = z.enum([
  'write-authority-missing',
  'work-type-never',
  'role-contradiction',
  'deliverable-uncovered',
  'policy-denied',
]);

export type EliminationReason = z.infer<typeof eliminationReasonSchema>;

export const eliminatedCandidateSchema = z
  .object({
    entityId: z.string().min(1),
    kind: z.enum(['agent', 'skill']),
    reason: eliminationReasonSchema,
    /** Human-debuggable one-liner ("needsWrite but writeAuthority=false"). */
    detail: z.string(),
  })
  .strict();

export type EliminatedCandidate = z.infer<typeof eliminatedCandidateSchema>;

// ─── Decision story (WORKER-LIVE-LOG-ready — MASTER-PLAN #582 contract) ──────

export const storyStepSchema = z
  .object({
    stage: z.enum(['vectorize', 'eliminate', 'content-fit', 'verify', 'rank', 'decide']),
    /** Short-form line, ≤80 chars — the live-feed row (click-through shows `detail`). */
    line: z.string().max(80),
    /** i18n message key for CLI/desktop rendering (params in `detail`). */
    messageKey: z.string().min(1),
    detail: z.record(z.string(), z.unknown()),
  })
  .strict();

export type StoryStep = z.infer<typeof storyStepSchema>;

export const decisionStorySchema = z
  .object({
    /** One-sentence WHY: winner + the decisive axis. */
    summary: z.string(),
    steps: z.array(storyStepSchema),
    eliminated: z.array(eliminatedCandidateSchema),
  })
  .strict();

export type DecisionStory = z.infer<typeof decisionStorySchema>;

// ─── Brain escalation (brainstorm decision-5: tie/indecision → Brain) ────────

export const escalationReasonSchema = z.enum([
  'tie',
  'low-confidence',
  'catalog-gap',
  'conflict',
  'policy-escalate',
]);

export type EscalationReason = z.infer<typeof escalationReasonSchema>;

export const brainEscalationSchema = z
  .object({
    reason: escalationReasonSchema,
    candidates: z.array(
      z
        .object({
          agentId: z.string().min(1),
          finalScore: z.number().min(0).max(1),
          axisScores: axisScoresSchema,
        })
        .strict(),
    ),
    /** Evidence payload for the Brain prompt (policy id, gap cell, conflict pair…). */
    evidence: z.record(z.string(), z.unknown()),
  })
  .strict();

export type BrainEscalation = z.infer<typeof brainEscalationSchema>;

// ─── RoutingDecisionV3 ───────────────────────────────────────────────────────

export const scoredCandidateSchema = z
  .object({
    agentId: z.string().min(1),
    finalScore: z.number().min(0).max(1),
    axisScores: axisScoresSchema,
  })
  .strict();

export type ScoredCandidate = z.infer<typeof scoredCandidateSchema>;

export const routingDecisionV3Schema = z
  .object({
    agentId: z.string().min(1),
    skillIds: z.array(z.string()),
    personaSlices: z.array(z.string()),
    /** Model PREFERENCE (registry id validated at load, never a literal check here). */
    modelPreference: z.string().nullable(),
    effortClass: z.enum(['low', 'normal', 'high']),
    axisScores: axisScoresSchema,
    finalScore: z.number().min(0).max(1),
    /** Calibrated 0-1 (stage-rank formula) — honest in deterministic mode. */
    confidence: z.number().min(0).max(1),
    provenance: z.enum(['deterministic', 'ai']),
    story: decisionStorySchema,
    /** Ordered runner-up list (Brain-escalation + lint reuse). */
    ranked: z.array(scoredCandidateSchema),
    escalation: brainEscalationSchema.nullable(),
  })
  .strict();

export type RoutingDecisionV3 = z.infer<typeof routingDecisionV3Schema>;

// ─── Journal entry (replayable — spec §5) ────────────────────────────────────

export const JOURNAL_SCHEMA_VERSION = 1 as const;

export const journalEntryV3Schema = z
  .object({
    schemaVersion: z.literal(JOURNAL_SCHEMA_VERSION),
    taskId: z.string().min(1),
    sprintId: z.string().nullable(),
    /** Caller-supplied ISO timestamp (never produced in decision math). */
    recordedAt: z.string().min(1),
    requirement: requirementVectorSchema,
    /** sha1 over the resolved routing_v3 config — replay guards config drift. */
    configHash: z.string().min(1),
    /** Frozen candidate capability snapshot the pipeline saw (id → capability). */
    catalog: z.record(z.string(), z.unknown()),
    decision: routingDecisionV3Schema,
  })
  .strict();

export type JournalEntryV3 = z.infer<typeof journalEntryV3Schema>;

// ─── Deep-freeze helper (no-mutable-leak contract) ───────────────────────────

/** Recursively freeze a decision-shaped object graph (arrays + plain objects). */
export function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Validate + freeze a RoutingDecisionV3 (factory used by the orchestrator). */
export function finalizeDecision(input: RoutingDecisionV3): Readonly<RoutingDecisionV3> {
  return deepFreeze(routingDecisionV3Schema.parse(input));
}

/** Convenience re-export so pipeline modules import one hub. */
export type { RequirementVector };
