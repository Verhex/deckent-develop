/**
 * Deterministic operation-invocation identity and causal transition algebra.
 * Every identifier and instant is supplied by the caller; this module has no I/O.
 */

export const OPERATION_IDENTITY_MAX_LENGTH = 256;

interface Brand<Name extends string> {
  readonly __operationIdentityBrand: Name;
}

export type InvocationId = string & Brand<'InvocationId'>;
export type TransactionId = string & Brand<'TransactionId'>;
export type OperationAttemptId = string & Brand<'OperationAttemptId'>;
export type CorrelationId = string & Brand<'CorrelationId'>;
export type IdempotencyKey = string & Brand<'IdempotencyKey'>;

export type OperationIdentityErrorCode =
  | 'IDENTITY_NOT_STRING'
  | 'IDENTITY_EMPTY'
  | 'IDENTITY_PADDED'
  | 'IDENTITY_CONTROL_CHARACTER'
  | 'IDENTITY_TOO_LONG'
  | 'IDENTITY_INVALID_FORMAT'
  | 'IDENTITY_WRONG_NAMESPACE'
  | 'IDENTITY_COLLISION'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_INPUT'
  | 'INVALID_CAUSATION'
  | 'INVALID_RELATION';

export class OperationIdentityError extends Error {
  public readonly code: OperationIdentityErrorCode;

  constructor(code: OperationIdentityErrorCode, message: string) {
    super(message);
    this.name = 'OperationIdentityError';
    this.code = code;
  }
}

type IdentityNamespace = 'invocation' | 'transaction' | 'operation-attempt' | 'correlation' | 'idempotency';

const NAMESPACE_PREFIX: Readonly<Record<IdentityNamespace, string>> = Object.freeze({
  invocation: 'invocation:',
  transaction: 'transaction:',
  'operation-attempt': 'operation-attempt:',
  correlation: 'correlation:',
  idempotency: 'idempotency:',
});
const IDENTITY_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F-\u009F]/;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-](\d{2}):(\d{2}))$/;

function requireExactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OperationIdentityError('INVALID_INPUT', `${label} must be a plain JSON object`);
  }
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw new OperationIdentityError('INVALID_INPUT', `${label} must have exact keys`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw new OperationIdentityError('INVALID_INPUT', `${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function validateIdentity(value: unknown, namespace: IdentityNamespace): string {
  if (typeof value !== 'string') {
    throw new OperationIdentityError('IDENTITY_NOT_STRING', `${namespace} identity must be a string`);
  }
  if (value.length === 0) {
    throw new OperationIdentityError('IDENTITY_EMPTY', `${namespace} identity must not be empty`);
  }
  if (value.trim() !== value) {
    throw new OperationIdentityError('IDENTITY_PADDED', `${namespace} identity must not be padded`);
  }
  if (CONTROL_CHARACTER.test(value)) {
    throw new OperationIdentityError('IDENTITY_CONTROL_CHARACTER', `${namespace} identity must not contain control characters`);
  }
  if (value.length > OPERATION_IDENTITY_MAX_LENGTH) {
    throw new OperationIdentityError('IDENTITY_TOO_LONG', `${namespace} identity exceeds ${OPERATION_IDENTITY_MAX_LENGTH} characters`);
  }
  const prefix = NAMESPACE_PREFIX[namespace];
  if (!value.startsWith(prefix)) {
    const isOtherNamespace = (Object.keys(NAMESPACE_PREFIX) as IdentityNamespace[])
      .some(candidate => value.startsWith(NAMESPACE_PREFIX[candidate]));
    throw new OperationIdentityError(
      isOtherNamespace ? 'IDENTITY_WRONG_NAMESPACE' : 'IDENTITY_INVALID_FORMAT',
      `${namespace} identity must begin with ${prefix}`,
    );
  }
  if (!IDENTITY_VALUE.test(value.slice(prefix.length))) {
    throw new OperationIdentityError('IDENTITY_INVALID_FORMAT', `${namespace} identity has an invalid value`);
  }
  return value;
}

export function invocationId(value: unknown): InvocationId { return validateIdentity(value, 'invocation') as InvocationId; }
export function transactionId(value: unknown): TransactionId { return validateIdentity(value, 'transaction') as TransactionId; }
export function operationAttemptId(value: unknown): OperationAttemptId { return validateIdentity(value, 'operation-attempt') as OperationAttemptId; }
export function correlationId(value: unknown): CorrelationId { return validateIdentity(value, 'correlation') as CorrelationId; }
export function idempotencyKey(value: unknown): IdempotencyKey { return validateIdentity(value, 'idempotency') as IdempotencyKey; }

/** Root causation is null; every non-root cause is an exact tagged operation variant. */
export type Causation = null | Readonly<{
  kind: 'operation';
  invocationId: InvocationId;
  operationAttemptId: OperationAttemptId;
}>;

export const ROOT_CAUSATION: Causation = null;

export interface OperationCausationInput {
  readonly invocationId: unknown;
  readonly operationAttemptId: unknown;
}

export function operationCausation(input: OperationCausationInput): Exclude<Causation, null> {
  const value = requireExactObject(input, ['invocationId', 'operationAttemptId'], 'operation causation');
  return Object.freeze({
    kind: 'operation' as const,
    invocationId: invocationId(value.invocationId),
    operationAttemptId: operationAttemptId(value.operationAttemptId),
  });
}

export type OperationIdentityRelation = 'root' | 'retry' | 'child' | 'sibling' | 'new-transaction';

export interface OperationInvocationIdentity {
  readonly invocationId: InvocationId;
  readonly transactionId: TransactionId;
  readonly operationAttemptId: OperationAttemptId;
  readonly correlationId: CorrelationId;
  readonly causation: Causation;
  readonly relation: OperationIdentityRelation;
  readonly occurredAt: string;
}

export interface RootOperationIdentityInput {
  readonly invocationId: unknown;
  readonly transactionId: unknown;
  readonly operationAttemptId: unknown;
  readonly correlationId: unknown;
  readonly occurredAt: unknown;
}

export function operationInvocationInstant(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new OperationIdentityError('INVALID_TIMESTAMP', 'instant must be a valid, unpadded RFC3339 instant');
  }
  const match = RFC3339_INSTANT.exec(value);
  if (match === null) {
    throw new OperationIdentityError('INVALID_TIMESTAMP', 'instant must be a valid, unpadded RFC3339 instant');
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , zone, zoneHourText, zoneMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const zoneHour = zone === 'Z' ? 0 : Number(zoneHourText);
  const zoneMinute = zone === 'Z' ? 0 : Number(zoneMinuteText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth || hour > 23 || minute > 59
    || second > 59 || zoneHour > 23 || zoneMinute > 59) {
    throw new OperationIdentityError('INVALID_TIMESTAMP', 'instant must be a valid, unpadded RFC3339 instant');
  }
  return value;
}

function assertDistinct(previous: string, next: string, label: string): void {
  if (previous === next) {
    throw new OperationIdentityError('IDENTITY_COLLISION', `${label} must be replaced with a distinct identity`);
  }
}

function freezeIdentity(identity: OperationInvocationIdentity): OperationInvocationIdentity {
  return Object.freeze(identity);
}

const ROOT_KEYS = ['invocationId', 'transactionId', 'operationAttemptId', 'correlationId', 'occurredAt'] as const;
const IDENTITY_KEYS = [...ROOT_KEYS, 'causation', 'relation'] as const;
const RELATIONS = new Set<OperationIdentityRelation>(['root', 'retry', 'child', 'sibling', 'new-transaction']);

export function createRootOperationIdentity(input: RootOperationIdentityInput): OperationInvocationIdentity {
  const value = requireExactObject(input, ROOT_KEYS, 'root identity input');
  return freezeIdentity({
    invocationId: invocationId(value.invocationId),
    transactionId: transactionId(value.transactionId),
    operationAttemptId: operationAttemptId(value.operationAttemptId),
    correlationId: correlationId(value.correlationId),
    causation: ROOT_CAUSATION,
    relation: 'root',
    occurredAt: operationInvocationInstant(value.occurredAt),
  });
}

export function validateOperationInvocationIdentity(value: unknown): OperationInvocationIdentity {
  const source = requireExactObject(value, IDENTITY_KEYS, 'operation identity');
  if (!RELATIONS.has(source.relation as OperationIdentityRelation)) {
    throw new OperationIdentityError('INVALID_RELATION', 'operation identity relation is unsupported');
  }
  const relation = source.relation as OperationIdentityRelation;
  let causation: Causation = ROOT_CAUSATION;
  if (source.causation !== null) {
    const cause = requireExactObject(source.causation, ['kind', 'invocationId', 'operationAttemptId'], 'causation');
    if (cause.kind !== 'operation') {
      throw new OperationIdentityError('INVALID_CAUSATION', 'causation kind must be operation');
    }
    causation = operationCausation({ invocationId: cause.invocationId, operationAttemptId: cause.operationAttemptId });
  }
  if ((relation === 'root') !== (causation === null)) {
    throw new OperationIdentityError('INVALID_CAUSATION', 'only root identity may have null causation');
  }
  const normalized = {
    invocationId: invocationId(source.invocationId),
    transactionId: transactionId(source.transactionId),
    operationAttemptId: operationAttemptId(source.operationAttemptId),
    correlationId: correlationId(source.correlationId),
    causation,
    relation,
    occurredAt: operationInvocationInstant(source.occurredAt),
  };
  if (causation !== null
    && causation.invocationId === normalized.invocationId
    && causation.operationAttemptId === normalized.operationAttemptId) {
    throw new OperationIdentityError('INVALID_CAUSATION', 'operation identity cannot cause itself');
  }
  if (causation !== null && causation.operationAttemptId === normalized.operationAttemptId) {
    throw new OperationIdentityError('INVALID_CAUSATION', 'causation must identify a distinct previous attempt');
  }
  if (causation !== null
    && ((relation === 'retry') !== (causation.invocationId === normalized.invocationId))) {
    throw new OperationIdentityError(
      'INVALID_CAUSATION',
      'retry must retain its invocation while other relations must identify a distinct upstream invocation',
    );
  }
  return freezeIdentity(normalized);
}

export interface RetryOperationInput {
  readonly previous: OperationInvocationIdentity;
  readonly operationAttemptId: unknown;
  readonly occurredAt: unknown;
}

export function retryOperation(input: RetryOperationInput): OperationInvocationIdentity {
  const value = requireExactObject(input, ['previous', 'operationAttemptId', 'occurredAt'], 'retry input');
  const previous = validateOperationInvocationIdentity(value.previous);
  const nextAttempt = operationAttemptId(value.operationAttemptId);
  assertDistinct(previous.operationAttemptId, nextAttempt, 'retry operationAttemptId');
  return freezeIdentity({
    invocationId: previous.invocationId,
    transactionId: previous.transactionId,
    operationAttemptId: nextAttempt,
    correlationId: previous.correlationId,
    causation: operationCausation({
      invocationId: previous.invocationId,
      operationAttemptId: previous.operationAttemptId,
    }),
    relation: 'retry',
    occurredAt: operationInvocationInstant(value.occurredAt),
  });
}

export interface RelatedOperationInput {
  readonly parent: OperationInvocationIdentity;
  readonly invocationId: unknown;
  readonly transactionId: unknown;
  readonly operationAttemptId: unknown;
  readonly correlationId: unknown;
  readonly occurredAt: unknown;
}

function relatedOperation(
  input: RelatedOperationInput,
  relation: 'child' | 'sibling',
): OperationInvocationIdentity {
  const value = requireExactObject(
    input,
    ['parent', 'invocationId', 'transactionId', 'operationAttemptId', 'correlationId', 'occurredAt'],
    `${relation} operation input`,
  );
  const parent = validateOperationInvocationIdentity(value.parent);
  const nextInvocation = invocationId(value.invocationId);
  const nextAttempt = operationAttemptId(value.operationAttemptId);
  const nextTransaction = transactionId(value.transactionId);
  const nextCorrelation = correlationId(value.correlationId);
  assertDistinct(parent.invocationId, nextInvocation, `${relation} invocationId`);
  assertDistinct(parent.operationAttemptId, nextAttempt, `${relation} operationAttemptId`);
  if (nextTransaction !== parent.transactionId || nextCorrelation !== parent.correlationId) {
    throw new OperationIdentityError('INVALID_INPUT', `${relation} operations must retain parent transactionId and correlationId`);
  }
  return freezeIdentity({
    invocationId: nextInvocation,
    transactionId: nextTransaction,
    operationAttemptId: nextAttempt,
    correlationId: nextCorrelation,
    causation: operationCausation({
      invocationId: parent.invocationId,
      operationAttemptId: parent.operationAttemptId,
    }),
    relation,
    occurredAt: operationInvocationInstant(value.occurredAt),
  });
}

export function childOperation(input: RelatedOperationInput): OperationInvocationIdentity {
  return relatedOperation(input, 'child');
}

export function siblingOperation(input: RelatedOperationInput): OperationInvocationIdentity {
  return relatedOperation(input, 'sibling');
}

export interface NewTransactionOperationInput extends RootOperationIdentityInput {
  readonly previous: OperationInvocationIdentity;
}

export function newTransactionOperation(input: NewTransactionOperationInput): OperationInvocationIdentity {
  const value = requireExactObject(input, ['previous', ...ROOT_KEYS], 'new transaction input');
  const previous = validateOperationInvocationIdentity(value.previous);
  const nextInvocation = invocationId(value.invocationId);
  const nextTransaction = transactionId(value.transactionId);
  const nextAttempt = operationAttemptId(value.operationAttemptId);
  assertDistinct(previous.transactionId, nextTransaction, 'new transactionId');
  assertDistinct(previous.invocationId, nextInvocation, 'new invocationId');
  assertDistinct(previous.operationAttemptId, nextAttempt, 'new operationAttemptId');
  return freezeIdentity({
    invocationId: nextInvocation,
    transactionId: nextTransaction,
    operationAttemptId: nextAttempt,
    correlationId: correlationId(value.correlationId),
    causation: operationCausation({
      invocationId: previous.invocationId,
      operationAttemptId: previous.operationAttemptId,
    }),
    relation: 'new-transaction',
    occurredAt: operationInvocationInstant(value.occurredAt),
  });
}
