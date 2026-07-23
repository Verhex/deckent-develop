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

/** Contract version stamped on every ApprovalRequest. Bump on a breaking shape change. */
export const APPROVAL_CONTRACT_VERSION = '1.0';

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

const approvalRequestShape = {
    version: z.literal(APPROVAL_CONTRACT_VERSION).default(APPROVAL_CONTRACT_VERSION),
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
    maskedArgs: z.record(z.string(), z.unknown()).nullable().default(null),
    /** Opaque pointer to the raw args held out-of-band — never the raw value itself. */
    rawArgsRef: z.string().min(1).nullable().default(null),
};

function buildApprovalRequestSchema(idSchema: z.ZodType<string>) {
  return z.object({ id: idSchema, ...approvalRequestShape }).strict().superRefine((val, ctx) => {
    if (Date.parse(val.expiresAt) <= Date.parse(val.createdAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt must be after createdAt',
      });
    }
  });
}

/** Canonical new-write schema. */
export const approvalRequestSchema = buildApprovalRequestSchema(approvalIdSchema);

/** Safe v1 persisted-reader schema; never use to authorize a new request id. */
const storedApprovalRequestSchema = buildApprovalRequestSchema(approvalLookupIdSchema);

/** The canonical approval-request type — inferred from {@link approvalRequestSchema}. */
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;

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

/** Validate an unknown object against {@link approvalRequestSchema}. Never throws. */
export function validateApprovalRequest(obj: unknown): ValidateApprovalRequestResult {
  const parsed = approvalRequestSchema.safeParse(obj);
  if (parsed.success) return { ok: true, value: parsed.data };
  const { missingFields, errors } = collectIssues(parsed.error.issues);
  return { ok: false, missingFields, errors };
}

/** Read an existing v1 record without permitting its legacy id on new writes. */
export function validateStoredApprovalRequest(obj: unknown): ValidateApprovalRequestResult {
  const parsed = storedApprovalRequestSchema.safeParse(obj);
  if (parsed.success) return { ok: true, value: parsed.data };
  const { missingFields, errors } = collectIssues(parsed.error.issues);
  return { ok: false, missingFields, errors };
}

/** Type guard — true iff `obj` validates against {@link approvalRequestSchema}. */
export function isApprovalRequest(obj: unknown): obj is ApprovalRequest {
  return approvalRequestSchema.safeParse(obj).success;
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
