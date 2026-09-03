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
import { CRITERION_APPLICABILITY, WORK_ATTRIBUTION_REASON_CODES } from './task-types.js';
import { VERIFICATION_EXECUTION_OUTCOME, projectTestsPassed } from './prompt-compile-plan.js';
import {
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  canonicalTaskAttemptCustodyJson,
  parseTaskAttemptCustodyIdentityV2,
  taskAttemptCustodyDigest,
  type CanonicalJsonBounds,
  type Sha256Digest,
  type TaskAttemptCustodyIdentityV2,
} from './task-attempt-custody-store.js';
import {
  parseTaskAttemptEffectLandingBindingV2,
  type TaskAttemptEffectLandingBindingV2,
} from './execution-effect-persistence-contract.js';

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

const sha256DigestSchema = z.string().regex(/^[a-f0-9]{64}$/);

const nonCompleteWiringEvidenceSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('presence-only'),
    basis: z.enum(['code-presence', 'test-presence', 'static-reachability', 'import-count']),
    evidenceRefs: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    state: z.literal('incomplete'),
    reasonCode: z.enum(['absent', 'unresolved', 'not-executed']),
    evidenceRefs: z.array(z.string().min(1)),
  }),
  z.object({
    state: z.literal('unsupported'),
    reasonCode: z.enum([
      'adapter-unavailable',
      'capability-unavailable',
      'environment-unavailable',
    ]),
    evidenceRefs: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    state: z.literal('contradictory'),
    reasonCode: z.enum(['authority-conflict', 'identity-conflict', 'observation-conflict']),
    evidenceRefs: z.array(z.string().min(1)).min(1),
  }),
]);

/** Worker result evidence cannot structurally encode production completion. */
export const productionWiringResultEvidenceSchema = z.object({
  version: z.literal(1),
  contractDigest: sha256DigestSchema,
  observedBy: z.literal('worker'),
  evidence: nonCompleteWiringEvidenceSchema,
});

/** Run-policy digest echo — a worker can only OBSERVE the policy, never settle it. */
export const runPolicyResultEvidenceSchema = z.object({
  version: z.literal(1),
  observedPolicyDigest: sha256DigestSchema,
  observedBy: z.literal('worker'),
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

const workerWorkClaimSchema = z.object({
  filesChanged: z.array(z.string()),
  linesAdded: z.number().int().nonnegative().nullable(),
  linesRemoved: z.number().int().nonnegative().nullable(),
  mismatch: z.boolean(),
});

const criterionEvidenceSchema = z.object({
  criterionId: z.string().min(1),
  outcome: z.enum(['MET', 'UNMET', 'UNVERIFIED']),
  evidence: z.array(z.string()),
});

/**
 * Digest-bound worker verification ingress preserved by canonical settlement.
 * These fields are consumed by the evaluator's task-authority parity gate; a
 * strict canonical parse must not erase them after host normalization.
 */
const testVerificationSchema = z.object({
  applicability: z.enum(['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE']),
  outcome: z.enum(['PASSED', 'FAILED', 'NOT_EXECUTED']),
  commands: z.array(z.string()),
});

/**
 * born 3324 (524-006): the work-attribution reason code is a TYPED union of the
 * codes this host mints, kept ADDITIVE — a non-empty code minted by a different
 * host revision still parses as a string (legacy carry), an empty one does not.
 */
export const workAttributionReasonCodeSchema = z
  .union([
    z.enum(WORK_ATTRIBUTION_REASON_CODES),
    z.string().min(1),
  ]);

const workAttributionSchema = z.object({
  state: z.enum(['VERIFIED', 'HOLD']),
  attemptId: z.string().min(1),
  baselineRef: z.string().min(1),
  baselineSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  scopeDigest: z.string().regex(/^[a-f0-9]{64}$/),
  reasonCode: workAttributionReasonCodeSchema.optional(),
  claimedOutsideScope: z.array(z.string()).optional(),
});

const preDispatchSettlementSchema = z.object({
  version: z.literal(1),
  state: z.literal('NOT_DISPATCHED'),
  attemptId: z.string().min(1),
  reasonCode: z.string().min(1),
  evidenceRef: z.string().min(1),
});

const promptDeliveryAttributionSchema = z.object({
  state: z.enum(['CURRENT', 'LEGACY_RECEIPT', 'LEGACY_FALLBACK', 'HOLD']),
  reason: z.enum(['missing', 'malformed', 'task-mismatch', 'invalid-digest', 'legacy-version']).optional(),
});

/** Provider-agnostic token accounting (§1.3). `source` records provenance honestly. */
const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  cacheCreationTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative(),
  source: z.enum(['provider-adapter', 'tokenizer-fallback', 'host-runtime-budget']),
});

/** Cross-provider cost (§1.4). Local/self-hosted → `{ usd: 0, isLocal: true }`. */
const costSchema = z.object({
  usd: z.number().nonnegative(),
  currency: z.literal('USD').default('USD'),
  referenceUsd: z.number().nonnegative().optional(),
  billingMode: z.enum(['api', 'subscription', 'free_tier', 'local']).optional(),
  pricingSource: z.string(),
  isLocal: z.boolean().default(false),
});

/**
 * Provider-final price/usage evidence. Effective execution auth decides whether
 * its USD-equivalent is billed or reference-only.
 */
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
  applicability: z.enum(['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE'])
    .default(CRITERION_APPLICABILITY.REQUIRED),
  outcome: z.enum(['PASSED', 'FAILED', 'NOT_EXECUTED']).optional(),
}).transform(tests => ({
  ...tests,
  outcome: tests.outcome ?? (tests.failed > 0
    ? VERIFICATION_EXECUTION_OUTCOME.FAILED
    : tests.total > 0
      ? VERIFICATION_EXECUTION_OUTCOME.PASSED
      : VERIFICATION_EXECUTION_OUTCOME.NOT_EXECUTED),
}));

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
  workAttribution: workAttributionSchema.optional(),
  /** Preserved ingress claim; never used as host attribution authority. */
  workerWorkClaim: workerWorkClaimSchema.optional(),
  preDispatchSettlement: preDispatchSettlementSchema.optional(),
  promptDeliveryAttribution: promptDeliveryAttributionSchema.optional(),
  promptCompilePlanId: z.string().min(1).optional(),
  /** Host-authored xverify terminal observation (spawn-backend-docker). The
   *  strict cutover dropped this additive field and every cross-provider
   *  verifier run degraded to framing-invalid (live regression 2026-08-24,
   *  receipts c6d973d6… / d22a59ad… / 34ddfca1…) — same defect class as the
   *  promptCompilePlanId/testVerification/techDebtCriterionIds drops. */
  hostTerminalProjection: z.object({
    version: z.literal(1),
    protocol: z.string().min(1),
    observedBy: z.literal('host'),
    sourceMarker: z.record(z.string(), z.unknown()).optional(),
  }).optional(),

  // resource accounting (orchestrator, provider-agnostic)
  tokenUsage: tokenUsageSchema,
  cost: costSchema,
  providerBilling: providerBillingSchema.optional(),

  // verification (worker-run, orchestrator-captured)
  tests: testsSchema,
  tsc: tscSchema,
  criteriaEvidence: z.array(criterionEvidenceSchema).default([]),
  testVerification: testVerificationSchema.optional(),
  techDebtCriterionIds: z.array(z.string()).default([]),

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
  productionWiringEvidence: productionWiringResultEvidenceSchema.optional(),
  runPolicyEvidence: runPolicyResultEvidenceSchema.optional(),

  // comms (optional)
  handoffNotes: z.string().nullable().default(null),
  sharedNotes: z.array(sharedNoteSchema).default([]),

  // auditor (second layer)
  auditorValidation: auditorValidationSchema.nullable().default(null),
});

/**
 * Required canonical result fields, derived from the executable Zod schema.
 * Documentation generators consume this function instead of maintaining a
 * parallel hand-written field list that can drift from runtime validation.
 */
export function getRequiredTaskResultFields(): string[] {
  return Object.entries(taskResultSchema.shape)
    .filter(([, schema]) => !schema.safeParse(undefined).success)
    .map(([field]) => field)
    .sort();
}

/** The canonical worker-result type — inferred from {@link taskResultSchema}. */
export type TaskResultV1 = z.infer<typeof taskResultSchema>;

// ─── Exact-attempt production result V2 ────────────────────────────────────

/** V1 remains the historical/public compatibility contract; normal Docker custody writes V2. */
export const TASK_RESULT_SCHEMA_VERSION_V2 = '2.0' as const;

const custodySha256DigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const custodyArtifactKeySchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,127}$/u);

export const taskResultAttemptCustodyIdentitySchemaV2 = z
  .custom<TaskAttemptCustodyIdentityV2>(
    value => parseTaskAttemptCustodyIdentityV2(value) !== null,
    { message: 'Invalid exact task-attempt custody identity' },
  )
  .transform(value => parseTaskAttemptCustodyIdentityV2(value) as TaskAttemptCustodyIdentityV2);

/** Host-derived binding to the immutable worker-result artifact; never accepted from worker trust. */
export const taskResultAttemptCustodySourceBindingSchemaV2 = z.object({
  version: z.literal(TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION),
  identity: taskResultAttemptCustodyIdentitySchemaV2,
  policyDigest: custodySha256DigestSchema,
  admissionReceiptDigest: custodySha256DigestSchema,
  sourceResult: z.object({
    artifactClass: z.literal('worker-result'),
    artifactKey: custodyArtifactKeySchema,
    artifactReceiptDigest: custodySha256DigestSchema,
    artifactSha256: custodySha256DigestSchema,
    byteLength: z.number().int().nonnegative().safe(),
  }).strict(),
  hostWorkAttribution: z.object({
    artifactClass: z.literal('host-work-attribution'),
    artifactKey: custodyArtifactKeySchema,
    artifactReceiptDigest: custodySha256DigestSchema,
    artifactSha256: custodySha256DigestSchema,
    byteLength: z.number().int().nonnegative().safe(),
  }).strict().optional(),
  effectLanding: z
    .custom<TaskAttemptEffectLandingBindingV2>(
      value => parseTaskAttemptEffectLandingBindingV2(value) !== null,
      { message: 'Invalid exact effect-landing binding' },
    )
    .transform(value => parseTaskAttemptEffectLandingBindingV2(value) as TaskAttemptEffectLandingBindingV2)
    .optional(),
}).strict();

export const taskResultHostPromotionSchemaV2 = z.object({
  version: z.literal(TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION),
  kind: z.literal('task-result-host-promotion'),
  /** Producer identity is a causation marker; T4 must prove its actual authority inputs. */
  authority: z.literal('host-canonical-ingress-assembler'),
  assembledV1Digest: custodySha256DigestSchema,
}).strict();

export const taskResultAttemptCustodyBindingSchemaV2 =
  taskResultAttemptCustodySourceBindingSchemaV2.extend({
    hostPromotion: taskResultHostPromotionSchemaV2,
    effectLanding: z
      .custom<TaskAttemptEffectLandingBindingV2>(
        value => parseTaskAttemptEffectLandingBindingV2(value) !== null,
        { message: 'Invalid exact effect-landing binding' },
      )
      .transform(value => parseTaskAttemptEffectLandingBindingV2(value) as TaskAttemptEffectLandingBindingV2),
    hostWorkAttribution: z.object({
      artifactClass: z.literal('host-work-attribution'),
      artifactKey: custodyArtifactKeySchema,
      artifactReceiptDigest: custodySha256DigestSchema,
      artifactSha256: custodySha256DigestSchema,
      byteLength: z.number().int().nonnegative().safe(),
    }).strict(),
  }).strict();

export type TaskResultAttemptCustodySourceBindingV2 = z.output<
  typeof taskResultAttemptCustodySourceBindingSchemaV2
>;

export type TaskResultAttemptCustodyBindingV2 = z.output<
  typeof taskResultAttemptCustodyBindingSchemaV2
>;

function taskResultHostAssembledV1Digest(
  result: Readonly<Record<string, unknown>>,
  jsonBounds: CanonicalJsonBounds,
): Sha256Digest {
  return taskAttemptCustodyDigest('host-assembled-task-result-v1', result, jsonBounds);
}

function taskResultV2HostAssembledProjection(result: TaskResultV2): Record<string, unknown> {
  const { attemptCustody: _attemptCustody, ...resultFields } = result;
  return { ...resultFields, schemaVersion: TASK_RESULT_SCHEMA_VERSION };
}

/**
 * Additive strict V2 contract. Existing V1 schemas, defaults, parsers and call sites remain
 * untouched. Exact canonical round-trip below rejects every nested default/unknown-field repair.
 */
export const taskResultSchemaV2 = z.object({
  ...taskResultSchema.shape,
  schemaVersion: z.literal(TASK_RESULT_SCHEMA_VERSION_V2),
  attempt: z.number().int().positive(),
  attemptCustody: taskResultAttemptCustodyBindingSchemaV2,
}).strict();

export type TaskResultV2 = z.output<typeof taskResultSchemaV2>;

export type ValidateProductionTaskResultV2 =
  | { readonly ok: true; readonly value: TaskResultV2 }
  | { readonly ok: false; readonly errors: readonly string[] };

function taskResultV2Errors(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

/** Strict parse: no unknown stripping, default insertion, shape repair or non-canonical bytes. */
export function validateProductionTaskResultV2(
  value: unknown,
  jsonBounds: CanonicalJsonBounds,
): ValidateProductionTaskResultV2 {
  let inputBytes: Uint8Array;
  try {
    inputBytes = canonicalTaskAttemptCustodyJson(value, jsonBounds);
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : '(root): invalid canonical V2 result'],
    };
  }
  const parsed = taskResultSchemaV2.safeParse(value);
  if (!parsed.success) return { ok: false, errors: taskResultV2Errors(parsed.error) };
  if (parsed.data.taskId !== parsed.data.attemptCustody.identity.taskId) {
    return { ok: false, errors: ['taskId: custody identity mismatch'] };
  }
  const effectLanding = parsed.data.attemptCustody.effectLanding;
  const hostWorkAttribution = parsed.data.attemptCustody.hostWorkAttribution;
  if (
    effectLanding.identity.projectId !== parsed.data.attemptCustody.identity.projectId
    || effectLanding.identity.taskId !== parsed.data.attemptCustody.identity.taskId
    || effectLanding.identity.attemptId !== parsed.data.attemptCustody.identity.attemptId
    || effectLanding.identity.generation !== parsed.data.attemptCustody.identity.generation
    || effectLanding.admissionReceiptDigest
      !== parsed.data.attemptCustody.admissionReceiptDigest
    || effectLanding.custodyPolicyDigest !== parsed.data.attemptCustody.policyDigest
    || hostWorkAttribution.artifactKey
      !== `host-work-${parsed.data.attemptCustody.identity.attemptId}`
  ) {
    return {
      ok: false,
      errors: ['attemptCustody.effectLanding: exact attempt authority mismatch'],
    };
  }
  const hostAssembledProjection = taskResultV2HostAssembledProjection(parsed.data);
  if (
    parsed.data.attemptCustody.hostPromotion.assembledV1Digest
      !== taskResultHostAssembledV1Digest(hostAssembledProjection, jsonBounds)
  ) {
    return { ok: false, errors: ['attemptCustody.hostPromotion: assembled V1 digest mismatch'] };
  }
  try {
    const parsedBytes = canonicalTaskAttemptCustodyJson(parsed.data, jsonBounds);
    if (!Buffer.from(inputBytes).equals(Buffer.from(parsedBytes))) {
      return { ok: false, errors: ['(root): non-canonical or repaired V2 result'] };
    }
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : '(root): invalid canonical V2 result'],
    };
  }
  return { ok: true, value: parsed.data };
}

export interface CreateProductionTaskResultV2Input {
  readonly result: Readonly<Record<string, unknown>>;
  readonly attemptCustody: TaskResultAttemptCustodySourceBindingV2;
  readonly jsonBounds: CanonicalJsonBounds;
}

/** Host-only promotion from an already canonical result plus a verified custody binding. */
export function createProductionTaskResultV2(
  input: CreateProductionTaskResultV2Input,
): TaskResultV2 {
  try {
    canonicalTaskAttemptCustodyJson(input.result, input.jsonBounds);
  } catch (error) {
    throw new AssemblerError(
      'Production TaskResultV2 source result must be canonical data',
      [],
      [error instanceof Error ? error.message : 'source result is not canonical data'],
    );
  }
  if (Object.prototype.hasOwnProperty.call(input.result, 'attemptCustody')) {
    throw new AssemblerError(
      'Production TaskResultV2 custody binding must be supplied by the host',
      [],
      ['attemptCustody: worker-supplied custody binding is forbidden'],
    );
  }
  if (
    !Object.prototype.hasOwnProperty.call(input.result, 'attempt')
    || input.result.schemaVersion !== TASK_RESULT_SCHEMA_VERSION
  ) {
    throw new AssemblerError(
      'Production TaskResultV2 requires an explicit canonical V1 source result',
      [],
      ['schemaVersion/attempt: missing or non-canonical source result'],
    );
  }
  const sourceBinding = taskResultAttemptCustodySourceBindingSchemaV2.safeParse(
    input.attemptCustody,
  );
  if (!sourceBinding.success) {
    throw new AssemblerError(
      'Production TaskResultV2 source custody binding validation failed',
      [],
      taskResultV2Errors(sourceBinding.error),
    );
  }
  const candidate = {
    ...input.result,
    schemaVersion: TASK_RESULT_SCHEMA_VERSION_V2,
    attemptCustody: {
      ...sourceBinding.data,
      hostPromotion: {
        version: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-result-host-promotion' as const,
        authority: 'host-canonical-ingress-assembler' as const,
        assembledV1Digest: taskResultHostAssembledV1Digest(input.result, input.jsonBounds),
      },
    },
  };
  const validated = validateProductionTaskResultV2(candidate, input.jsonBounds);
  if (!validated.ok) {
    throw new AssemblerError(
      `Production TaskResultV2 validation failed: ${validated.errors.join('; ')}`,
      [],
      [...validated.errors],
    );
  }
  return validated.value;
}

export function taskResultV2Digest(
  result: TaskResultV2,
  jsonBounds: CanonicalJsonBounds,
): Sha256Digest {
  const validated = validateProductionTaskResultV2(result, jsonBounds);
  if (!validated.ok) {
    throw new AssemblerError(
      `Invalid Production TaskResultV2 digest input: ${validated.errors.join('; ')}`,
      [],
      [...validated.errors],
    );
  }
  return taskAttemptCustodyDigest('task-result', validated.value, jsonBounds);
}

/**
 * Human-first canonical field order for `.result` files on disk (owner
 * decision 2026-08-25): identity → verdict → narrative → evidence → change →
 * timing → assignment plumbing → cost. Parsers are key-order-insensitive, so
 * this affects only readability; historical files are never rewritten (their
 * bytes may be pinned by receipts). Fields not listed here are appended after
 * the ordered block in their original insertion order, so additive schema
 * growth degrades to "readable prefix + tail" instead of breaking.
 */
export const TASK_RESULT_FIELD_ORDER: readonly string[] = [
  // kimlik
  'schemaVersion', 'taskId', 'sprintId', 'attempt', 'attemptId', 'attemptCustody', 'isPriorityFix', 'fixForTaskId',
  // verdict
  'selfAssessment', 'brainEvaluation', 'brainEvaluationReason', 'totalScore', 'rubricScores', 'honestGate',
  // anlatı
  'notes', 'handoffNotes', 'sharedNotes',
  // kanıt
  'goCriteria', 'criteriaEvidence', 'techDebtCriterionIds', 'tests', 'testsPassed', 'testCommands',
  'testVerification', 'tsc', 'coverage', 'crossVerify', 'xverifyTaskSettlement', 'auditorValidation',
  'diskVerified', 'boundaryViolations', 'productionWiringEvidence', 'runPolicyEvidence',
  // değişim
  'filesChanged', 'linesAdded', 'linesRemoved', 'totalLinesAdded', 'totalLinesRemoved',
  // zamanlama
  'spawnedAt', 'startedAt', 'completedAt', 'durationMs',
  // atama / tesisat
  'workerId', 'agent', 'agentId', 'skills', 'skillIds', 'provider', 'model', 'modelEffort',
  'backend', 'status', 'workAttribution', 'workerWorkClaim', 'preDispatchSettlement',
  'promptDeliveryAttribution', 'promptCompilePlanId', 'hostTerminalProjection',
  // maliyet
  'tokenUsage', 'cost', 'providerBilling',
];

/** Return a copy of `result` with keys in {@link TASK_RESULT_FIELD_ORDER}; unknown keys keep their original relative order at the end. */
export function canonicalizeTaskResultFieldOrder<T extends object>(result: T): T {
  const source = result as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of TASK_RESULT_FIELD_ORDER) {
    if (key in source) ordered[key] = source[key];
  }
  for (const key of Object.keys(source)) {
    if (!(key in ordered)) ordered[key] = source[key];
  }
  return ordered as T;
}

/** The single serializer every flat `task-*.result` disk write must go through. */
export function serializeTaskResultForDisk(result: object): string {
  return JSON.stringify(canonicalizeTaskResultFieldOrder(result), null, 2);
}

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
 * consumers assume. Applied at every result-ingest call site so provider-CLI
 * shape drift cannot turn real work into a parser-level NO_GO.
 *
 * Some CLIs emitted `testsPassed` as the list of commands they ran. Preserve
 * those commands in `testCommands` and recover the boolean from the worker's
 * explicit assessment: NO_GO means false; DONE/GO_WITH_TECH_DEBT means true.
 * This does not elevate the final verdict — Brain still applies disk, scope,
 * rubric, and honesty gates — it only restores the intended scalar claim.
 * Returns a detached working copy and passes `null` through so it composes
 * with `readJsonSafe`'s miss contract. Exact custody readers deliberately
 * freeze verified authority objects; normalization must never mutate that
 * durable evidence (or any other caller-owned result).
 */
export function normalizeTaskResultShape<T extends { notes?: unknown }>(result: T | null): T | null {
  if (result === null || typeof result !== 'object') return result;
  const normalized = structuredClone(result) as T;
  const record = normalized as Record<string, unknown>;
  const coerced = coerceNotesToString(record['notes']);
  if (coerced !== record['notes']) {
    record['notes'] = coerced;
  }
  const explicit = record['testVerification'];
  if (explicit !== null && typeof explicit === 'object') {
    const verification = explicit as Record<string, unknown>;
    const applicability = verification['applicability'];
    const outcome = verification['outcome'];
    const commands = verification['commands'];
    if (
      Object.values(CRITERION_APPLICABILITY).includes(applicability as never)
      && Object.values(VERIFICATION_EXECUTION_OUTCOME).includes(outcome as never)
      && Array.isArray(commands)
      && commands.every(command => typeof command === 'string')
    ) {
      record['testCommands'] = [...commands];
      record['testsPassed'] = projectTestsPassed({ outcome: outcome as 'PASSED' | 'FAILED' | 'NOT_EXECUTED' });
      return normalized;
    }
  }

  const legacy = record['testsPassed'];
  const commands = Array.isArray(legacy) && legacy.every(command => typeof command === 'string')
    ? [...legacy]
    : [];
  const outcome = typeof legacy === 'boolean'
    ? legacy ? VERIFICATION_EXECUTION_OUTCOME.PASSED : VERIFICATION_EXECUTION_OUTCOME.FAILED
    : VERIFICATION_EXECUTION_OUTCOME.NOT_EXECUTED;
  record['testVerification'] = {
    applicability: CRITERION_APPLICABILITY.REQUIRED,
    outcome,
    commands,
  };
  record['testCommands'] = commands;
  record['testsPassed'] = projectTestsPassed({ outcome });
  return normalized;
}

// ─── Shared result shapes (spec §1.2) ────────────────────────────────────────
// Moved from orchestra/result-assembler so layer-clean ingress consumers can
// type against the schema without importing orchestra (ADR-G-041 boundary).

/** A git-derived per-file change (spec §1.2 `filesChanged[]` entry). */
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Normalize a result's `filesChanged` to plain path strings. Canonical
 * TaskResultV1 carries FileChange OBJECTS while legacy results carried
 * strings; consumers doing bare string ops on the entries killed EXECUTE/
 * EVALUATE for whole runs (live sprint-661/664/665 TypeError family:
 * "relPath.replace / file.startsWith is not a function"). Every filesChanged
 * consumer MUST iterate this projection, never the raw list.
 */
export function normalizeChangedPaths(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const entry of list) {
    const path = typeof entry === 'string'
      ? entry
      : typeof (entry as { path?: unknown } | null)?.path === 'string'
        ? (entry as { path: string }).path
        : '';
    if (path.length > 0) out.push(path);
  }
  return out;
}

/** Thrown when an assembled result fails canonical schema validation. */
export class AssemblerError extends Error {
  constructor(
    message: string,
    public readonly missingFields: string[],
    public readonly errors: string[],
  ) {
    super(message);
    this.name = 'AssemblerError';
  }
}
