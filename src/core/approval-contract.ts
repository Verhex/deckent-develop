// ─── Approval Contract — ApprovalRequest / ApprovalDecision (APR-CONTRACT) ────
// Foundation type module for the runtime-wide ApprovalBroker (APR-1). Governs:
// strategic-pivot §11.2 + ADR-G-020 (authority). This module defines ONLY the
// versioned contract — no broker, store, or IO. Downstream (APR-STORE, APR-POLICY,
// APR-4 redaction) build on top of these types.
//
// APR-4 redaction-readiness: the raw argument VALUE is never a field on this type —
// only an opaque `rawArgsRef` pointer into wherever the raw value is actually held.
// The top-level schema is `.strict()` so a stray `rawArgs` key on an input object
// fails validation rather than silently passing through.

import { z } from 'zod';
import {
  APPROVAL_LIFECYCLE_BLOCKING_SCOPES,
  APPROVAL_LIFECYCLE_ORIGINS,
  APPROVAL_LIFECYCLE_SLA_STAGES,
  APPROVAL_RISK_TIERS,
} from './config-types.js';
import {
  approvalLifecycleProfileDigest,
  isApprovalRiskTierAtLeast,
  mapLegacyApprovalRisk,
} from './approval-lifecycle-policy.js';

/** Contract version stamped on every ApprovalRequest. Bump on a breaking shape change. */
export const APPROVAL_CONTRACT_V1_VERSION = '1.0' as const;
export const APPROVAL_CONTRACT_V2_VERSION = '2.0' as const;
/** Backward-compatible alias retained for existing v1 producers. */
export const APPROVAL_CONTRACT_VERSION = APPROVAL_CONTRACT_V1_VERSION;

const WINDOWS_RESERVED_DEVICE_RE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

/**
 * Read/lookup compatibility for already-persisted v1 ids. The v1 contract
 * accepted any non-empty string; this schema preserves records that are safe
 * as one filename component (including historical uppercase/Unicode ids)
 * without reopening traversal or cross-platform device-name hazards.
 * New writes MUST use {@link approvalIdSchema} instead.
 */
export const approvalLookupIdSchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (id) => id !== '.'
      && id !== '..'
      && !/[<>:"/\\|?*\u0000-\u001f]/.test(id)
      && !/[. ]$/.test(id),
    'must be a path-safe cross-platform filename component',
  )
  .refine(
    (id) => !WINDOWS_RESERVED_DEVICE_RE.test(id),
    'must not use a Windows reserved device name',
  );

/**
 * Cross-platform opaque identifier used as the approval store filename key.
 * Lowercase ASCII avoids case-fold/Unicode-normalization collisions across
 * POSIX, macOS and Windows; path separators, trailing dots and device names
 * are structurally impossible.
 */
export const approvalIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9_-])?$/, 'must be a lowercase ASCII opaque id')
  .refine(
    (id) => !WINDOWS_RESERVED_DEVICE_RE.test(id),
    'must not use a Windows reserved device name',
  );

// ─── Component schemas ───────────────────────────────────────────────────────

/** Who is asking for approval — the Deckent actor kind (5 values). */
const requesterRoleSchema = z.enum(['brain', 'worker', 'auditor', 'nervous', 'connector']);

/** The requesting actor: its role plus the specific running instance. */
const requesterSchema = z
  .object({
    role: requesterRoleSchema,
    instanceId: z.string().min(1),
  })
  .strict();

/** The 7 action categories an approval can gate. */
const approvalScopeSchema = z.enum([
  'file-read',
  'file-write',
  'shell-exec',
  'git-mutation',
  'network',
  'credential',
  'lifecycle',
]);

/** The 5 risk tiers, `none` (lowest) through `critical` (highest). */
const approvalRiskSchema = z.enum(['none', 'low', 'medium', 'high', 'critical']);

/** The 4 policy verdicts a policy engine can assign to a request. */
const approvalPolicySchema = z.enum(['auto-approve', 'notify', 'require-approval', 'deny']);

/**
 * The 4 resolutions an approval can settle on. Shared, single canonical vocabulary
 * for both `ApprovalRequest.defaultAction` (what happens on timeout/no-response) and
 * `ApprovalDecision.decision` (what a human/policy actually chose) — one enum, not two
 * near-duplicates.
 */
const approvalActionSchema = z.enum(['allow', 'deny', 'defer', 'escalate']);

/**
 * Additive honest-closure marker — the machine-readable reason a decision was
 * produced by a SYSTEM-driven closure rather than a human/policy choice. Today the
 * only such closure is a TTL sweep (`'expired'`); the enum is the extension point
 * for future system closures. Carried as an OPTIONAL field on ApprovalDecision so
 * every human/policy decision and every pre-existing (older-format) decision file
 * — which omit it — still validate unchanged.
 */
const closureReasonSchema = z.enum(['expired']);

/** Project-wide ISO 8601 UTC convention (`new Date().toISOString()` output). */
const isoDateTimeSchema = z.string().datetime();
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/u, 'must be a lowercase SHA-256 digest');

// ─── ApprovalRequest ──────────────────────────────────────────────────────────

const approvalRequestBaseShape = {
    requester: requesterSchema,
    /** Short, human-readable one-liner (e.g. for a terminal approval card). */
    summary: z.string().min(1).max(200),
    /** Full, structured detail for the dashboard/detail view. */
    details: z.record(z.string(), z.unknown()),
    scopeId: z.string().min(1),
    scope: approvalScopeSchema,
    risk: approvalRiskSchema,
    policy: approvalPolicySchema,
    defaultAction: approvalActionSchema,
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    createdAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema,
    /** Redacted/safe-to-display args, present only when the action carries args. */
};

const approvalRequestNewWriteArgsShape = {
  /** Redacted/safe-to-display args, present only when the action carries args. */
  maskedArgs: z.record(z.string(), z.unknown()).nullable().default(null),
  /** Opaque pointer to the raw args held out-of-band — never the raw value itself. */
  rawArgsRef: z.string().min(1).nullable().default(null),
};

const approvalRequestStoredArgsShape = {
  /** Stored-source compatibility: no defaults are injected while reading signed v1 bytes. */
  maskedArgs: z.record(z.string(), z.unknown()).nullable().optional(),
  rawArgsRef: z.string().min(1).nullable().optional(),
};

const approvalSourceSchema = z.object({
  contractVersion: z.enum([APPROVAL_CONTRACT_V1_VERSION, APPROVAL_CONTRACT_V2_VERSION]),
  requestDigest: sha256HexSchema,
  reference: z.string().min(1),
}).strict();

const lifecycleDurationSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const approvalLifecycleProfileSchema = z.object({
  ttlMs: lifecycleDurationSchema,
  slaMs: z.tuple([lifecycleDurationSchema, lifecycleDurationSchema, lifecycleDurationSchema]),
  riskTier: z.enum(APPROVAL_RISK_TIERS),
  timeoutDisposition: z.enum([
    'request-default',
    'park-alert',
    'park-undecidable',
    'deny-expire',
  ]),
  blocking: z.enum(APPROVAL_LIFECYCLE_BLOCKING_SCOPES),
}).strict().superRefine((profile, ctx) => {
  if (!(profile.slaMs[0] < profile.slaMs[1] && profile.slaMs[1] < profile.slaMs[2])) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['slaMs'],
      message: 'slaMs must be strictly increasing',
    });
  }
  if (profile.slaMs[2] >= profile.ttlMs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['slaMs'],
      message: 'slaMs entries must be earlier than ttlMs',
    });
  }
});

const approvalLifecycleV2Shape = {
  origin: z.enum(APPROVAL_LIFECYCLE_ORIGINS),
  riskTier: z.enum(APPROVAL_RISK_TIERS),
  blocking: z.enum(APPROVAL_LIFECYCLE_BLOCKING_SCOPES),
  /** Embedded per-origin bytes make the authored snapshot reconstructible after restart. */
  lifecycleProfile: approvalLifecycleProfileSchema,
  /** Canonical digest of `schemaVersion + origin + lifecycleProfile`. */
  policySnapshotDigest: sha256HexSchema,
  source: approvalSourceSchema,
  lifecycleGeneration: z.string().min(1).max(128),
  slaStage: z.enum(APPROVAL_LIFECYCLE_SLA_STAGES),
};

function withExpiryOrder<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((val: { createdAt: string; expiresAt: string }, ctx) => {
    if (Date.parse(val.expiresAt) <= Date.parse(val.createdAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt must be after createdAt',
      });
    }
  }) as unknown as T;
}

function buildApprovalRequestV1Schema(idSchema: z.ZodType<string>, stored: boolean) {
  return withExpiryOrder(z.object({
    id: idSchema,
    version: stored
      ? z.literal(APPROVAL_CONTRACT_V1_VERSION).optional()
      : z.literal(APPROVAL_CONTRACT_V1_VERSION).default(APPROVAL_CONTRACT_V1_VERSION),
    ...approvalRequestBaseShape,
    ...(stored ? approvalRequestStoredArgsShape : approvalRequestNewWriteArgsShape),
  }).strict());
}

function buildApprovalRequestV2Schema(idSchema: z.ZodType<string>, stored: boolean) {
  return withExpiryOrder(z.object({
    id: idSchema,
    version: z.literal(APPROVAL_CONTRACT_V2_VERSION),
    ...approvalRequestBaseShape,
    ...(stored ? approvalRequestStoredArgsShape : approvalRequestNewWriteArgsShape),
    ...approvalLifecycleV2Shape,
  }).strict()).superRefine((value, ctx) => {
    if (value.blocking !== value.lifecycleProfile.blocking) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blocking'],
        message: 'blocking must match the embedded lifecycleProfile',
      });
    }
    if (!isApprovalRiskTierAtLeast(value.riskTier, value.lifecycleProfile.riskTier)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['riskTier'],
        message: 'riskTier may not be lower than the embedded lifecycleProfile floor',
      });
    }
    if (!isApprovalRiskTierAtLeast(value.riskTier, mapLegacyApprovalRisk(value.risk))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['riskTier'],
        message: 'riskTier may not be lower than the canonical legacy risk mapping',
      });
    }
    if (Date.parse(value.expiresAt) > Date.parse(value.createdAt) + value.lifecycleProfile.ttlMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt may not exceed the embedded lifecycleProfile ttlMs ceiling',
      });
    }
    const expected = approvalLifecycleProfileDigest(value.origin, value.lifecycleProfile);
    if (value.policySnapshotDigest !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['policySnapshotDigest'],
        message: 'must match the embedded origin lifecycleProfile digest',
      });
    }
  });
}

/** Explicit per-version schemas for producers and migration code. */
export const approvalRequestV1Schema = buildApprovalRequestV1Schema(approvalIdSchema, false);
export const approvalRequestV2Schema = buildApprovalRequestV2Schema(approvalIdSchema, false);

/** Canonical versioned new-write schema. Omitted version remains the exact v1 compatibility path. */
export const approvalRequestSchema = z.union([approvalRequestV2Schema, approvalRequestV1Schema]);

/** Persisted reader: v1 defaults remain absent so signed source bytes keep their exact digest. */
const storedApprovalRequestV1Schema = buildApprovalRequestV1Schema(approvalLookupIdSchema, true);
const storedApprovalRequestV2Schema = buildApprovalRequestV2Schema(approvalLookupIdSchema, true);

export type ApprovalRequestV1 = z.infer<typeof storedApprovalRequestV1Schema>;
export type ApprovalRequestV2 = z.infer<typeof approvalRequestV2Schema>;
/** Versioned canonical request. A stored v1 may intentionally omit formerly defaulted fields. */
export type ApprovalRequest = ApprovalRequestV1 | ApprovalRequestV2;

// ─── ApprovalDecision ─────────────────────────────────────────────────────────

/**
 * Host-attested authority carried by a human decision. It contains only
 * irreversible digests and opaque authority references — never a bearer/session
 * secret. Optional at the outer decision boundary for v1 read compatibility;
 * security-sensitive consumers explicitly require and validate it.
 */
export const approvalDecisionAuthorizationSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('live-session'),
    requestDigest: sha256HexSchema,
    commandDigest: sha256HexSchema,
    idempotencyKeyHash: sha256HexSchema,
    actorId: z.string().min(1),
    tenantId: z.string().min(1),
    role: z.string().min(1).nullable(),
    sessionRefHash: sha256HexSchema,
    authorityRef: z.string().min(1),
    authenticatedAt: isoDateTimeSchema,
    authExpiresAt: isoDateTimeSchema,
    integrityKeyId: z.string().min(1),
    integrityMac: sha256HexSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Date.parse(value.authExpiresAt) <= Date.parse(value.authenticatedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['authExpiresAt'],
        message: 'authExpiresAt must be after authenticatedAt',
      });
    }
  });

export type ApprovalDecisionAuthorization = z.infer<typeof approvalDecisionAuthorizationSchema>;

const approvalDecisionShape = {
    decision: approvalActionSchema,
    decidedBy: z.string().min(1),
    /** Which surface resolved it (terminal/dashboard/api/slack/...). Free-form —
     *  new approval clients must not require a contract migration. */
    channel: z.string().min(1),
    decidedAt: isoDateTimeSchema,
    reason: z.string().default(''),
    /** Optional structured marker for a system-driven closure (e.g. a TTL sweep
     *  writes `'expired'`). Absent on human/policy decisions and on older-format
     *  decision files — never `.default()`ed, so it is only ever present when a
     *  system closure explicitly stamped it. See {@link closureReasonSchema}. */
    closureReason: closureReasonSchema.optional(),
    /** Additive v1 compatibility: legacy/system decisions omit this. A Goal-v2
     *  allow is never authority unless this envelope passes host validation. */
    authorization: approvalDecisionAuthorizationSchema.optional(),
};

function buildApprovalDecisionSchema(idSchema: z.ZodType<string>) {
  return z.object({ requestId: idSchema, ...approvalDecisionShape }).strict();
}

/** Canonical new-write schema. */
export const approvalDecisionSchema = buildApprovalDecisionSchema(approvalIdSchema);

/** Safe v1 persisted-reader schema; only valid when bound to a durable request. */
const storedApprovalDecisionSchema = buildApprovalDecisionSchema(approvalLookupIdSchema);

/** The canonical approval-decision type — inferred from {@link approvalDecisionSchema}. */
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

/** Permanent retirement evidence. The embedded decision remains available to
 * restart/external waiters after active request/decision files are pruned. */
export const approvalTombstoneSchema = z
  .object({
    version: z.literal(1),
    id: approvalLookupIdSchema,
    retiredAt: isoDateTimeSchema,
    decision: storedApprovalDecisionSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.id !== value.decision.requestId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['decision', 'requestId'],
        message: 'must match tombstone id',
      });
    }
  });

export type ApprovalTombstone = z.infer<typeof approvalTombstoneSchema>;

// ─── Derived types + enum value-arrays (for downstream consumers) ───────────

export type RequesterRole = z.infer<typeof requesterRoleSchema>;
export type Requester = z.infer<typeof requesterSchema>;
export type ApprovalScope = z.infer<typeof approvalScopeSchema>;
export type ApprovalRisk = z.infer<typeof approvalRiskSchema>;
export type ApprovalPolicy = z.infer<typeof approvalPolicySchema>;
export type ApprovalAction = z.infer<typeof approvalActionSchema>;
export type ClosureReason = z.infer<typeof closureReasonSchema>;

export const ALL_REQUESTER_ROLES = requesterRoleSchema.options;
export const ALL_APPROVAL_SCOPES = approvalScopeSchema.options;
export const ALL_APPROVAL_RISKS = approvalRiskSchema.options;
export const ALL_APPROVAL_POLICIES = approvalPolicySchema.options;
export const ALL_APPROVAL_ACTIONS = approvalActionSchema.options;
export const ALL_CLOSURE_REASONS = closureReasonSchema.options;

// ─── Validators (non-throwing, discriminated result) ─────────────────────────

function collectIssues(issues: z.ZodIssue[]): { missingFields: string[]; errors: string[] } {
  const missingFields: string[] = [];
  const errors: string[] = [];
  for (const issue of issues) {
    const fieldPath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    // Zod signals a missing required key with an invalid_type issue whose received
    // value is the literal 'undefined'. That — not a value-shape error — is "missing".
    const received = (issue as { received?: unknown }).received;
    if (issue.code === 'invalid_type' && received === 'undefined') {
      if (!missingFields.includes(fieldPath)) missingFields.push(fieldPath);
    }
    errors.push(`${fieldPath}: ${issue.message}`);
  }
  return { missingFields, errors };
}

export interface ValidateApprovalRequestOk {
  ok: true;
  value: ApprovalRequest;
}
export interface ValidateApprovalRequestErr {
  ok: false;
  missingFields: string[];
  errors: string[];
}
export type ValidateApprovalRequestResult = ValidateApprovalRequestOk | ValidateApprovalRequestErr;

function requestVersionOf(obj: unknown): unknown {
  return obj !== null && typeof obj === 'object' && !Array.isArray(obj)
    ? (obj as Record<string, unknown>)['version']
    : undefined;
}

/** Validate an unknown object against {@link approvalRequestSchema}. Never throws. */
export function validateApprovalRequest(obj: unknown): ValidateApprovalRequestResult {
  const schema = requestVersionOf(obj) === APPROVAL_CONTRACT_V2_VERSION
    ? approvalRequestV2Schema
    : approvalRequestV1Schema;
  const parsed = schema.safeParse(obj);
  if (parsed.success) return { ok: true, value: parsed.data as ApprovalRequest };
  const { missingFields, errors } = collectIssues(parsed.error.issues);
  return { ok: false, missingFields, errors };
}

/** Read an existing v1 record without permitting its legacy id on new writes. */
export function validateStoredApprovalRequest(obj: unknown): ValidateApprovalRequestResult {
  const schema = requestVersionOf(obj) === APPROVAL_CONTRACT_V2_VERSION
    ? storedApprovalRequestV2Schema
    : storedApprovalRequestV1Schema;
  const parsed = schema.safeParse(obj);
  if (parsed.success) return { ok: true, value: parsed.data as ApprovalRequest };
  const { missingFields, errors } = collectIssues(parsed.error.issues);
  return { ok: false, missingFields, errors };
}

/** Type guard — true iff `obj` validates against {@link approvalRequestSchema}. */
export function isApprovalRequest(obj: unknown): obj is ApprovalRequest {
  return (requestVersionOf(obj) === APPROVAL_CONTRACT_V2_VERSION
    ? approvalRequestV2Schema
    : approvalRequestV1Schema).safeParse(obj).success;
}

export interface ValidateApprovalDecisionOk {
  ok: true;
  value: ApprovalDecision;
}
export interface ValidateApprovalDecisionErr {
  ok: false;
  missingFields: string[];
  errors: string[];
}
export type ValidateApprovalDecisionResult = ValidateApprovalDecisionOk | ValidateApprovalDecisionErr;

/** Validate an unknown object against {@link approvalDecisionSchema}. Never throws. */
export function validateApprovalDecision(obj: unknown): ValidateApprovalDecisionResult {
  const parsed = approvalDecisionSchema.safeParse(obj);
  if (parsed.success) return { ok: true, value: parsed.data };
  const { missingFields, errors } = collectIssues(parsed.error.issues);
  return { ok: false, missingFields, errors };
}

/** Read/settle a v1 decision only after its durable request has been found. */
export function validateStoredApprovalDecision(obj: unknown): ValidateApprovalDecisionResult {
  const parsed = storedApprovalDecisionSchema.safeParse(obj);
  if (parsed.success) return { ok: true, value: parsed.data };
  const { missingFields, errors } = collectIssues(parsed.error.issues);
  return { ok: false, missingFields, errors };
}

/** Type guard — true iff `obj` validates against {@link approvalDecisionSchema}. */
export function isApprovalDecision(obj: unknown): obj is ApprovalDecision {
  return approvalDecisionSchema.safeParse(obj).success;
}
