import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION = 2 as const;
export const ACCEPTANCE_CONFIRMATION_LEGACY_SCHEMA_VERSION = 1 as const;

const IdentifierSchema = z.string().min(1).max(200)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9._:-]*[A-Za-z0-9])?$/u, 'must be a canonical bounded identifier');
export const AcceptanceConfirmationDigestSchema = z.string()
  .regex(/^[a-f0-9]{64}$/u, 'must be a lowercase SHA-256 digest');
const UtcTimestampSchema = z.string().refine(value => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString() === value;
}, 'must be a canonical UTC timestamp');

export const AcceptanceConfirmationLineageSchema = z.object({
  tenantId: IdentifierSchema,
  projectId: IdentifierSchema,
  sprintId: IdentifierSchema,
  taskId: IdentifierSchema,
  attemptId: IdentifierSchema,
  generation: z.number().int().safe().nonnegative(),
  evaluationDigest: AcceptanceConfirmationDigestSchema,
  resultDigest: AcceptanceConfirmationDigestSchema,
  policyDigest: AcceptanceConfirmationDigestSchema,
  sourceDigest: AcceptanceConfirmationDigestSchema,
}).strict();

export type AcceptanceConfirmationLineage = z.infer<typeof AcceptanceConfirmationLineageSchema>;

export const AcceptanceConfirmationTerminalEventSchema = z.object({
  schemaVersion: z.literal(ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION),
  type: z.literal('ACCEPTANCE_CONFIRMATION_TERMINAL'),
  confirmationId: AcceptanceConfirmationDigestSchema,
  lineage: AcceptanceConfirmationLineageSchema,
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  terminalAt: UtcTimestampSchema,
  eventDigest: AcceptanceConfirmationDigestSchema,
}).strict();

const receiptBase = {
  schemaVersion: z.literal(ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION),
  confirmationId: AcceptanceConfirmationDigestSchema,
  lineage: AcceptanceConfirmationLineageSchema,
  terminalEvent: AcceptanceConfirmationTerminalEventSchema,
  preparedAt: UtcTimestampSchema,
};
export const AcceptanceConfirmationPreparedReceiptSchema = z.object({
  ...receiptBase,
  state: z.literal('PREPARED'),
  receiptDigest: AcceptanceConfirmationDigestSchema,
}).strict();
export const AcceptanceConfirmationAppliedReceiptSchema = z.object({
  ...receiptBase,
  state: z.literal('APPLIED'),
  appliedAt: UtcTimestampSchema,
  preparedReceiptDigest: AcceptanceConfirmationDigestSchema,
  receiptDigest: AcceptanceConfirmationDigestSchema,
}).strict();
export const AcceptanceConfirmationReceiptSchema = z.discriminatedUnion('state', [
  AcceptanceConfirmationPreparedReceiptSchema,
  AcceptanceConfirmationAppliedReceiptSchema,
]);

export type AcceptanceConfirmationTerminalEvent = z.infer<typeof AcceptanceConfirmationTerminalEventSchema>;
export type AcceptanceConfirmationPreparedReceipt = z.infer<typeof AcceptanceConfirmationPreparedReceiptSchema>;
export type AcceptanceConfirmationAppliedReceipt = z.infer<typeof AcceptanceConfirmationAppliedReceiptSchema>;
export type AcceptanceConfirmationReceipt = z.infer<typeof AcceptanceConfirmationReceiptSchema>;

export const ACCEPTANCE_CONFIRMATION_CONFLICT_REASON_CODES = Object.freeze([
  'LINEAGE_INVALID',
  'TERMINAL_EVENT_INVALID',
  'RECEIPT_INVALID',
  'CONFIRMATION_ID_MISMATCH',
  'IDENTITY_MISMATCH',
  'EVALUATION_DIGEST_MISMATCH',
  'RESULT_DIGEST_MISMATCH',
  'POLICY_DIGEST_MISMATCH',
  'SOURCE_DIGEST_MISMATCH',
  'EVENT_DIGEST_MISMATCH',
  'RECEIPT_DIGEST_MISMATCH',
  'STATE_TRANSITION_INVALID',
] as const);
export type AcceptanceConfirmationConflictReasonCode =
  typeof ACCEPTANCE_CONFIRMATION_CONFLICT_REASON_CODES[number];

export interface AcceptanceConfirmationContractError {
  readonly kind: 'acceptance-confirmation-reject';
  readonly reasonCode: AcceptanceConfirmationConflictReasonCode;
  readonly message: string;
  readonly issues?: readonly string[];
}
export type AcceptanceConfirmationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AcceptanceConfirmationContractError };

function assertJson(value: unknown, seen = new Set<object>()): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return;
    throw new TypeError('canonical JSON contains a non-finite number');
  }
  if (typeof value !== 'object') throw new TypeError('canonical JSON contains a non-JSON value');
  if (seen.has(value)) throw new TypeError('canonical JSON contains a cycle');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError('canonical JSON accepts only plain objects');
  }
  const record = value as Record<string, unknown>;
  if ('toJSON' in record) throw new TypeError('canonical JSON does not invoke toJSON');
  seen.add(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw new TypeError('canonical JSON contains a sparse array');
    value.forEach(entry => assertJson(entry, seen));
  } else {
    Object.values(record).forEach(entry => assertJson(entry, seen));
  }
  seen.delete(value);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) as string;
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort()
    .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

/** Environment-independent UTF-8 JSON bytes: sorted keys, no whitespace, and no host hooks. */
export function canonicalAcceptanceConfirmationJson(value: unknown): string {
  assertJson(value);
  return canonical(value);
}
export function acceptanceConfirmationDigest(value: unknown): string {
  return createHash('sha256').update(canonicalAcceptanceConfirmationJson(value), 'utf8').digest('hex');
}

/** SHA-256 over the supplied bytes, without JSON parsing, normalization, or transcoding. */
export function acceptanceConfirmationExactBytesDigest(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
function issues(error: z.ZodError): readonly string[] {
  return Object.freeze(error.issues.map(issue => issue.path.length ? issue.path.join('.') : '<root>'));
}
function reject(
  reasonCode: AcceptanceConfirmationConflictReasonCode,
  message: string,
  issueList?: readonly string[],
): AcceptanceConfirmationResult<never> {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze({
      kind: 'acceptance-confirmation-reject' as const,
      reasonCode,
      message,
      ...(issueList ? { issues: Object.freeze([...issueList]) } : {}),
    }),
  });
}
function success<T>(value: T): AcceptanceConfirmationResult<T> {
  return Object.freeze({ ok: true as const, value: deepFreeze(value) as T });
}

export function parseAcceptanceConfirmationLineage(
  value: unknown,
): AcceptanceConfirmationResult<AcceptanceConfirmationLineage> {
  const parsed = AcceptanceConfirmationLineageSchema.safeParse(value);
  return parsed.success
    ? success(parsed.data)
    : reject('LINEAGE_INVALID', 'acceptance confirmation lineage is invalid', issues(parsed.error));
}

const LegacyAcceptanceConfirmationLineageSchema = z.object({
  tenantId: IdentifierSchema,
  projectId: IdentifierSchema,
  attemptId: IdentifierSchema,
  generation: z.number().int().safe().nonnegative(),
  resultDigest: AcceptanceConfirmationDigestSchema,
  policyDigest: AcceptanceConfirmationDigestSchema,
  sourceDigest: AcceptanceConfirmationDigestSchema,
}).strict();

const VersionedLineageReadSchema = z.discriminatedUnion('schemaVersion', [
  z.object({ schemaVersion: z.literal(ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION), lineage: AcceptanceConfirmationLineageSchema }).strict(),
  z.object({ schemaVersion: z.literal(ACCEPTANCE_CONFIRMATION_LEGACY_SCHEMA_VERSION), lineage: LegacyAcceptanceConfirmationLineageSchema }).strict(),
]);

export interface AcceptanceConfirmationLegacyBindings {
  readonly sprintId: string;
  readonly taskId: string;
  readonly evaluationDigest: string;
}

/**
 * Read a persisted, explicitly versioned lineage. V1 is read-only migration input:
 * its absent bindings must be supplied by an authority and are never defaulted.
 */
export function readAcceptanceConfirmationLineage(
  value: unknown,
  legacyBindings?: AcceptanceConfirmationLegacyBindings,
): AcceptanceConfirmationResult<AcceptanceConfirmationLineage> {
  const versioned = VersionedLineageReadSchema.safeParse(value);
  if (!versioned.success) {
    return reject('LINEAGE_INVALID', 'versioned acceptance confirmation lineage is invalid', issues(versioned.error));
  }
  if (versioned.data.schemaVersion === ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION) {
    return success(versioned.data.lineage);
  }
  if (legacyBindings === undefined) {
    return reject('LINEAGE_INVALID', 'legacy acceptance confirmation lineage requires explicit full-lineage bindings');
  }
  return parseAcceptanceConfirmationLineage({ ...versioned.data.lineage, ...legacyBindings });
}

/** Content address of every lineage byte; no service-local id or fallback participates. */
export function deriveAcceptanceConfirmationId(lineage: AcceptanceConfirmationLineage): string {
  const parsed = AcceptanceConfirmationLineageSchema.parse(lineage);
  return acceptanceConfirmationDigest({ domain: 'deckent.acceptance-confirmation.v2', lineage: parsed });
}

function withoutEventDigest(
  event: AcceptanceConfirmationTerminalEvent,
): Omit<AcceptanceConfirmationTerminalEvent, 'eventDigest'> {
  const { eventDigest: _eventDigest, ...unsigned } = event;
  return unsigned;
}

export interface CreateAcceptanceConfirmationTerminalEventInput {
  readonly lineage: unknown;
  readonly decision: 'ACCEPTED' | 'REJECTED';
  readonly terminalAt: string;
}
export function createAcceptanceConfirmationTerminalEvent(
  input: CreateAcceptanceConfirmationTerminalEventInput,
): AcceptanceConfirmationResult<AcceptanceConfirmationTerminalEvent> {
  const lineage = parseAcceptanceConfirmationLineage(input.lineage);
  if (!lineage.ok) return lineage;
  const unsigned = {
    schemaVersion: ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION,
    type: 'ACCEPTANCE_CONFIRMATION_TERMINAL' as const,
    confirmationId: deriveAcceptanceConfirmationId(lineage.value),
    lineage: lineage.value,
    decision: input.decision,
    terminalAt: input.terminalAt,
  };
  const parsed = AcceptanceConfirmationTerminalEventSchema.safeParse({
    ...unsigned,
    eventDigest: acceptanceConfirmationDigest(unsigned),
  });
  return parsed.success
    ? success(parsed.data)
    : reject('TERMINAL_EVENT_INVALID', 'acceptance confirmation terminal event is invalid', issues(parsed.error));
}

function conflict(
  actual: AcceptanceConfirmationLineage,
  expected: AcceptanceConfirmationLineage,
): AcceptanceConfirmationConflictReasonCode | null {
  if (actual.tenantId !== expected.tenantId || actual.projectId !== expected.projectId
    || actual.sprintId !== expected.sprintId || actual.taskId !== expected.taskId
    || actual.attemptId !== expected.attemptId || actual.generation !== expected.generation) {
    return 'IDENTITY_MISMATCH';
  }
  if (actual.evaluationDigest !== expected.evaluationDigest) return 'EVALUATION_DIGEST_MISMATCH';
  if (actual.resultDigest !== expected.resultDigest) return 'RESULT_DIGEST_MISMATCH';
  if (actual.policyDigest !== expected.policyDigest) return 'POLICY_DIGEST_MISMATCH';
  if (actual.sourceDigest !== expected.sourceDigest) return 'SOURCE_DIGEST_MISMATCH';
  return null;
}

export function verifyAcceptanceConfirmationTerminalEvent(
  value: unknown,
  expectedLineage?: unknown,
): AcceptanceConfirmationResult<AcceptanceConfirmationTerminalEvent> {
  const parsed = AcceptanceConfirmationTerminalEventSchema.safeParse(value);
  if (!parsed.success) {
    return reject('TERMINAL_EVENT_INVALID', 'acceptance confirmation terminal event is invalid', issues(parsed.error));
  }
  const event = parsed.data;
  if (deriveAcceptanceConfirmationId(event.lineage) !== event.confirmationId) {
    return reject('CONFIRMATION_ID_MISMATCH', 'terminal event confirmation id does not bind its lineage');
  }
  if (acceptanceConfirmationDigest(withoutEventDigest(event)) !== event.eventDigest) {
    return reject('EVENT_DIGEST_MISMATCH', 'terminal event digest does not match canonical event bytes');
  }
  if (expectedLineage !== undefined) {
    const expected = parseAcceptanceConfirmationLineage(expectedLineage);
    if (!expected.ok) return expected;
    const mismatch = conflict(event.lineage, expected.value);
    if (mismatch) return reject(mismatch, 'terminal event lineage does not match expected lineage');
  }
  return success(event);
}

export interface PrepareAcceptanceConfirmationReceiptInput {
  readonly terminalEvent: unknown;
  readonly preparedAt: string;
  readonly expectedLineage?: unknown;
}
export function prepareAcceptanceConfirmationReceipt(
  input: PrepareAcceptanceConfirmationReceiptInput,
): AcceptanceConfirmationResult<AcceptanceConfirmationPreparedReceipt> {
  const event = verifyAcceptanceConfirmationTerminalEvent(input.terminalEvent, input.expectedLineage);
  if (!event.ok) return event;
  const unsigned = {
    schemaVersion: ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION,
    state: 'PREPARED' as const,
    confirmationId: event.value.confirmationId,
    lineage: event.value.lineage,
    terminalEvent: event.value,
    preparedAt: input.preparedAt,
  };
  const parsed = AcceptanceConfirmationPreparedReceiptSchema.safeParse({
    ...unsigned,
    receiptDigest: acceptanceConfirmationDigest(unsigned),
  });
  return parsed.success
    ? success(parsed.data)
    : reject('RECEIPT_INVALID', 'prepared acceptance confirmation receipt is invalid', issues(parsed.error));
}

export interface ApplyAcceptanceConfirmationReceiptInput {
  readonly preparedReceipt: unknown;
  readonly appliedAt: string;
  readonly expectedLineage?: unknown;
}
export function applyAcceptanceConfirmationReceipt(
  input: ApplyAcceptanceConfirmationReceiptInput,
): AcceptanceConfirmationResult<AcceptanceConfirmationAppliedReceipt> {
  const prepared = validateAcceptanceConfirmationReceipt(input.preparedReceipt, input.expectedLineage);
  if (!prepared.ok) return prepared;
  if (prepared.value.state !== 'PREPARED') {
    return reject('STATE_TRANSITION_INVALID', 'only a PREPARED receipt can transition to APPLIED');
  }
  if (!UtcTimestampSchema.safeParse(input.appliedAt).success) {
    return reject('RECEIPT_INVALID', 'applied receipt timestamp is invalid', ['appliedAt']);
  }
  if (Date.parse(input.appliedAt) < Date.parse(prepared.value.preparedAt)) {
    return reject('STATE_TRANSITION_INVALID', 'appliedAt precedes preparedAt');
  }
  const unsigned = {
    schemaVersion: ACCEPTANCE_CONFIRMATION_SCHEMA_VERSION,
    state: 'APPLIED' as const,
    confirmationId: prepared.value.confirmationId,
    lineage: prepared.value.lineage,
    terminalEvent: prepared.value.terminalEvent,
    preparedAt: prepared.value.preparedAt,
    appliedAt: input.appliedAt,
    preparedReceiptDigest: prepared.value.receiptDigest,
  };
  const parsed = AcceptanceConfirmationAppliedReceiptSchema.safeParse({
    ...unsigned,
    receiptDigest: acceptanceConfirmationDigest(unsigned),
  });
  return parsed.success
    ? success(parsed.data)
    : reject('RECEIPT_INVALID', 'applied acceptance confirmation receipt is invalid', issues(parsed.error));
}

export function validateAcceptanceConfirmationReceipt(
  value: unknown,
  expectedLineage?: unknown,
): AcceptanceConfirmationResult<AcceptanceConfirmationReceipt> {
  const parsed = AcceptanceConfirmationReceiptSchema.safeParse(value);
  if (!parsed.success) {
    return reject('RECEIPT_INVALID', 'acceptance confirmation receipt is invalid', issues(parsed.error));
  }
  const receipt = parsed.data;
  const event = verifyAcceptanceConfirmationTerminalEvent(receipt.terminalEvent, receipt.lineage);
  if (!event.ok) return event;
  if (receipt.confirmationId !== event.value.confirmationId) {
    return reject('CONFIRMATION_ID_MISMATCH', 'receipt confirmation id does not match terminal event');
  }
  if (expectedLineage !== undefined) {
    const expected = parseAcceptanceConfirmationLineage(expectedLineage);
    if (!expected.ok) return expected;
    const mismatch = conflict(receipt.lineage, expected.value);
    if (mismatch) return reject(mismatch, 'receipt lineage does not match expected lineage');
  }
  const { receiptDigest, ...unsigned } = receipt;
  if (acceptanceConfirmationDigest(unsigned) !== receiptDigest) {
    return reject('RECEIPT_DIGEST_MISMATCH', 'receipt digest does not match canonical receipt bytes');
  }
  return success(receipt);
}
