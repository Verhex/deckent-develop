// ─── Worker Output Contract — Result Schema (the spine) ──────────────────────
// Spec: docs/superpowers/specs/2026-06-26-worker-output-contract-observability-design.md §1.2
//
// The versioned, Zod-validated canonical shape every worker `.result` is assembled
// into. `TaskResultV1` is INFERRED from the schema (single source of truth), and is
// re-exported additively from `./types.js` (legacy `TaskResult` in task-types.ts is
// left untouched — existing consumers keep working).
//
// Ownership (§1.1): the orchestrator owns the measurable/provenance fields; the worker
// contributes only the subjective block (selfAssessment, goCriteria, notes); Brain fills
// brainEvaluation*; the Auditor fills auditorValidation. Fields filled downstream are
// optional/nullable/default so a freshly-assembled result still validates.

import { z } from 'zod';

/** Contract version stamped on every `TaskResultV1`. Bump on a breaking shape change. */
export const TASK_RESULT_SCHEMA_VERSION = '1.0';

// ─── Component schemas ───────────────────────────────────────────────────────

/** The three worker self-assessment verdicts (shared with legacy SelfAssessment). */
const selfAssessmentSchema = z.enum(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO']);
const crossVerifyVerdictSchema = z.enum(['confirmed', 'refuted', 'unclear']);
const crossVerifyExecutionSchema = z.object({
  outcome: z.enum(['completed', 'budget-exhausted', 'failed']),
  initialAttemptId: z.string().min(1),
  terminalAttemptId: z.string().min(1),
  reason: z.string().optional(),
  cumulativeUsage: z.object({
    turns: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheCreationTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    maxContextTokens: z.number().int().nonnegative(),
  }).optional(),
});
const crossVerifyEligibilitySchema = z.object({
  reachabilityRef: z.string().min(1),
  limitEvidenceRefs: z.array(z.string().min(1)),
  accountRefHash: z.string().nullable(),
  authMode: z.string().min(1),
  transport: z.string().min(1),
  executionBackend: z.string().min(1),
  executionProfileRef: z.string().min(1),
});
const invocationReceiptRefSchema = z.object({
  schemaVersion: z.literal(1),
  tenantId: z.string().min(1),
  projectId: z.string().min(1),
  invocationId: z.string().min(1),
});

/** Downstream orchestrator evidence; additive and absent before cross-verification. */
export const crossVerifyEvidenceSchema = z.union([
  z.object({
    outcome: crossVerifyVerdictSchema,
    verifier: z.string().min(1),
    verifierModel: z.string().min(1),
    verdict: crossVerifyVerdictSchema,
    reason: z.string(),
    execution: crossVerifyExecutionSchema.optional(),
    eligibility: crossVerifyEligibilitySchema.optional(),
    invocationReceiptRef: invocationReceiptRefSchema.optional(),
    assurance: z.literal('typed-host-adjudicated').optional(),
    adjudicationReceiptRef: z.string().min(1).optional(),
  }),
  z.object({
    outcome: z.literal('unavailable'),
    verifier: z.string().min(1).optional(),
    verifierModel: z.string().min(1).optional(),
    reason: z.string(),
    invocationReceiptRef: invocationReceiptRefSchema.optional(),
    authorityEvidenceRef: z.string().min(1).optional(),
  }),
]);

/** A single git-derived file change (orchestrator-authoritative, §1.2 work output). */
const fileChangeSchema = z.object({
  path: z.string(),
  status: z.enum(['added', 'modified', 'deleted']),
  linesAdded: z.number().int().nonnegative(),
  linesRemoved: z.number().int().nonnegative(),
});

/** A scope boundary violation detected by the orchestrator (`git diff` vs task.scope). */
const boundaryViolationSchema = z.object({
  path: z.string(),
  reason: z.string(),
});

/** Provider-agnostic token accounting (§1.3). `source` records provenance honestly. */
const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  cacheCreationTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative(),
  source: z.enum(['provider-adapter', 'tokenizer-fallback']),
});

/** Cross-provider cost (§1.4). Local/self-hosted → `{ usd: 0, isLocal: true }`. */
const costSchema = z.object({
  usd: z.number().nonnegative(),
  currency: z.literal('USD').default('USD'),
  pricingSource: z.string(),
  isLocal: z.boolean().default(false),
});

/** Provider-final billing evidence. This is authoritative; `cost` may be a local estimate. */
const providerBillingSchema = z.object({
  source: z.literal('provider-envelope'),
  provider: z.string().min(1),
  currency: z.literal('USD'),
  providerReportedUsd: z.number().nonnegative(),
  modelUsage: z.record(z.string(), z.object({
    inputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    cacheReadTokens: z.number().nonnegative().optional(),
    cacheCreationTokens: z.number().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
    contextWindow: z.number().nonnegative().optional(),
  })),
  capturedAt: z.string(),
  reconciliation: z.object({
    localEstimateUsd: z.number().nonnegative(),
    providerReportedUsd: z.number().nonnegative(),
    absoluteVarianceUsd: z.number().nonnegative(),
    relativeVariance: z.number().nonnegative(),
    threshold: z.number().nonnegative(),
    state: z.enum(['matched', 'variance']),
  }).optional(),
});

/** Verification — test outcome (worker-run, orchestrator-captured). */
const testsSchema = z.object({
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  coverage: z.number().min(0).max(100).nullable().default(null),
  command: z.string().nullable().default(null),
  orchestratorVerified: z.boolean().default(false),
});

/** Verification — TypeScript compile outcome. */
const tscSchema = z.object({
  clean: z.boolean(),
  errors: z.number().int().nonnegative(),
});

/** A single go-criterion verdict the worker reports against its definition-of-done. */
const goCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  met: z.boolean(),
  evidence: z.string().nullable().default(null),
});

/** Honesty signal raised on a worker claim/authoritative-source conflict (§1.5). */
const honestGateSchema = z.object({
  flagged: z.boolean().default(false),
  violation: z.string().nullable().default(null),
});

/** A structural note written to SharedMemory (worker-comms, opt-in). */
const sharedNoteSchema = z.object({
  key: z.string(),
  value: z.string(),
});

/** Auditor second-layer validation record (event-driven, finding-lifecycle). */
const auditorValidationSchema = z.object({
  status: z.enum(['OK', 'INCOMPLETE']),
  checkedAt: z.string(),
  missingFields: z.array(z.string()).default([]),
  findingId: z.string().nullable().default(null),
  resolved: z.boolean().default(true),
});

// ─── Top-level result schema (spec §1.2) ─────────────────────────────────────

/**
 * The canonical, versioned worker-result contract. `TaskResultV1` is inferred from
 * this — do not hand-maintain a parallel interface.
 *
 * Required (surfaced in `missingFields` when absent): taskId, workerId, provider, model,
 * filesChanged, totalLinesAdded, totalLinesRemoved, tokenUsage, cost, tests, tsc,
 * selfAssessment. Everything filled downstream (Brain/Auditor/comms) is optional or
 * defaulted so a freshly-assembled result validates before evaluation.
 */
export const taskResultSchema = z.object({
  schemaVersion: z.literal(TASK_RESULT_SCHEMA_VERSION).default(TASK_RESULT_SCHEMA_VERSION),

  // identity / provenance
  taskId: z.string().min(1),
  sprintId: z.string().optional(),
  workerId: z.string(),
  provider: z.string(),
  model: z.string(),
  modelEffort: z.string().optional(),
  agent: z.string().nullable().default(null),
  skills: z.array(z.string()).default([]),
  attempt: z.number().int().positive().default(1),
  isPriorityFix: z.boolean().default(false),
  fixForTaskId: z.string().nullable().default(null),

  // timing (orchestrator)
  spawnedAt: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationMs: z.number().int().nonnegative().optional(),

  // work output (orchestrator, git-authoritative)
  filesChanged: z.array(fileChangeSchema),
  totalLinesAdded: z.number().int().nonnegative(),
  totalLinesRemoved: z.number().int().nonnegative(),
  diskVerified: z.boolean().default(false),
  boundaryViolations: z.array(boundaryViolationSchema).default([]),

  // resource accounting (orchestrator, provider-agnostic)
  tokenUsage: tokenUsageSchema,
  cost: costSchema,
  providerBilling: providerBillingSchema.optional(),

  // verification (worker-run, orchestrator-captured)
  tests: testsSchema,
  tsc: tscSchema,

  // assessment (worker + brain)
  selfAssessment: selfAssessmentSchema,
  goCriteria: z.array(goCriterionSchema).default([]),
  notes: z.string().default(''),
  brainEvaluation: selfAssessmentSchema.nullable().default(null),
  brainEvaluationReason: z.string().nullable().default(null),
  rubricScores: z.record(z.string(), z.number()).nullable().default(null),
  totalScore: z.number().nullable().default(null),
  honestGate: honestGateSchema.default({ flagged: false, violation: null }),
  crossVerify: crossVerifyEvidenceSchema.optional(),

  // comms (optional)
  handoffNotes: z.string().nullable().default(null),
  sharedNotes: z.array(sharedNoteSchema).default([]),

  // auditor (second layer)
  auditorValidation: auditorValidationSchema.nullable().default(null),
});

/** The canonical worker-result type — inferred from {@link taskResultSchema}. */
export type TaskResultV1 = z.infer<typeof taskResultSchema>;

// ─── Validator (non-throwing) ────────────────────────────────────────────────

/** Successful validation — `value` is the parsed, defaulted result. */
export interface ValidateTaskResultOk {
  ok: true;
  value: TaskResultV1;
}

/** Failed validation — `missingFields` lists absent required keys, `errors` all issues. */
export interface ValidateTaskResultErr {
  ok: false;
  missingFields: string[];
  errors: string[];
}

export type ValidateTaskResult = ValidateTaskResultOk | ValidateTaskResultErr;

/**
 * Validate an unknown object against the result contract. **Never throws** — returns a
 * discriminated result. On failure, `missingFields` holds the dotted paths of absent
 * required keys (Zod's `received === 'undefined'` signal) and `errors` holds a
 * human-readable `"<path>: <message>"` line for every issue (missing or invalid).
 */
export function validateTaskResult(obj: unknown): ValidateTaskResult {
  const parsed = taskResultSchema.safeParse(obj);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }

  const missingFields: string[] = [];
  const errors: string[] = [];
  for (const issue of parsed.error.issues) {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    // Zod signals a missing required key with an invalid_type issue whose received
    // value is the literal 'undefined'. That — not a value-shape error — is "missing".
    const received = (issue as { received?: unknown }).received;
    if (issue.code === 'invalid_type' && received === 'undefined') {
      if (!missingFields.includes(fieldPath)) missingFields.push(fieldPath);
    }
    errors.push(`${fieldPath}: ${issue.message}`);
  }
  return { ok: false, missingFields, errors };
}

// ─── Legacy-shape boundary normalizer (born-484) ─────────────────────────────
//
// Live case (sprints 365/366, 2026-07-03): the first real codex-CLI worker
// results carried `notes` as a STRING ARRAY while the legacy `TaskResult`
// contract says `notes: string`. Downstream string ops
// (`(result.notes ?? '').toLowerCase()`) threw TypeError and truncated the
// EVALUATE loop. Different provider CLIs will keep producing slightly drifted
// shapes — the honest response is to NORMALIZE at the disk-read boundary
// (the work is real; only the field shape drifted), not to reject the result.
// Strict rejection is the future `TaskResultV1` gate's job, applied at
// assembly time where the worker can still be asked to fix its output.

/**
 * Collapse any worker-produced `notes` value to the contractual string shape.
 * Arrays join with newlines (the live codex shape); objects JSON-stringify;
 * null/undefined collapse to ''. Never throws.
 */
export function coerceNotesToString(notes: unknown): string {
  if (typeof notes === 'string') return notes;
  if (notes == null) return '';
  if (Array.isArray(notes)) {
    return notes
      .map(n => (typeof n === 'string' ? n : safeJsonStringify(n)))
      .join('\n');
  }
  return safeJsonStringify(notes);
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Normalize a legacy `TaskResult` freshly read from disk to the shapes its
 * consumers assume. Applied at every `readJsonSafe<TaskResult>` call site so a
 * provider-CLI shape drift can never reach the evaluator/collector string ops.
 * Mutates in place (results are plain parsed JSON) and passes `null` through
 * so it composes with `readJsonSafe`'s miss contract.
 */
export function normalizeTaskResultShape<T extends { notes?: unknown }>(result: T | null): T | null {
  if (result === null || typeof result !== 'object') return result;
  const coerced = coerceNotesToString((result as { notes?: unknown }).notes);
  if (coerced !== (result as { notes?: unknown }).notes) {
    (result as { notes: string }).notes = coerced;
  }
  return result;
}
