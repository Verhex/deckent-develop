import {
  operationReference,
  type OperationReference,
} from './operation-catalog/index.js';
import {
  OperationIdentityError,
  childOperation as childIdentity,
  newTransactionOperation as newTransactionIdentity,
  operationInvocationInstant,
  retryOperation as retryIdentity,
  siblingOperation as siblingIdentity,
  validateOperationInvocationIdentity,
  type OperationInvocationIdentity,
} from './operation-invocation-identity.js';
import {
  OperationInvocationIdempotencyError,
  createOperationInvocationIdempotency,
  type OperationIdempotencyBinding,
} from './operation-invocation-idempotency.js';
import {
  OperationInvocationSubjectError,
  createOperationInvocationSubject,
  type OperationInvocationSubject,
} from './operation-invocation-subject.js';

export const OPERATION_INVOCATION_CONTEXT_SCHEMA_VERSION = 1 as const;

/** Canonical policy-neutral operation invocation context. */
export interface OperationInvocationContext {
  readonly schemaVersion: typeof OPERATION_INVOCATION_CONTEXT_SCHEMA_VERSION;
  readonly operation: OperationReference;
  readonly identity: OperationInvocationIdentity;
  readonly subject: OperationInvocationSubject;
  readonly idempotency: OperationIdempotencyBinding;
  readonly createdAt: string;
}

export type OperationInvocationContextErrorCode =
  | 'INVALID_CONTEXT'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_JSON_VALUE'
  | 'INVALID_OPERATION'
  | 'INVALID_IDENTITY'
  | 'INVALID_SUBJECT'
  | 'INVALID_IDEMPOTENCY'
  | 'INVALID_CREATED_AT'
  | 'IDENTITY_BINDING_MISMATCH'
  | 'ROOT_CONTEXT_REQUIRED'
  | 'INVALID_TRANSITION_INPUT'
  | 'INVALID_TRANSITION';

/** Stable typed refusal for every malformed or inconsistent context. */
export class OperationInvocationContextError extends Error {
  constructor(
    public readonly code: OperationInvocationContextErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OperationInvocationContextError';
  }
}

function contextError(
  code: OperationInvocationContextErrorCode,
  message: string,
  cause?: unknown,
): OperationInvocationContextError {
  return new OperationInvocationContextError(code, message, cause);
}

function assertJsonOnly(value: unknown, path: string, ancestors: WeakSet<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw contextError('INVALID_JSON_VALUE', `${path} contains a non-finite or unsafe number`);
    }
    return;
  }
  if (typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw contextError('INVALID_JSON_VALUE', `${path} must contain only plain JSON object values`);
  }
  if (ancestors.has(value)) {
    throw contextError('INVALID_JSON_VALUE', `${path} contains a cycle`);
  }
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw contextError('INVALID_JSON_VALUE', `${path} contains a symbol key`);
      }
      if (key === 'toJSON') {
        throw contextError('INVALID_JSON_VALUE', `${path}.toJSON is not permitted`);
      }
      const descriptor = descriptors[key];
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        throw contextError('INVALID_JSON_VALUE', `${path}.${key} must be an enumerable data property`);
      }
      assertJsonOnly(descriptor.value, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function exactObject(
  value: unknown,
  keys: readonly string[],
  path: string,
  code: OperationInvocationContextErrorCode,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw contextError(code, `${path} must be a plain JSON object`);
  }
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length
    || actual.some(key => typeof key !== 'string' || !keys.includes(key))) {
    throw contextError(code, `${path} must contain exact keys: ${keys.join(',')}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw contextError(code, `${path}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function normalizeOperation(value: unknown): OperationReference {
  const source = exactObject(value, ['operationId', 'version', 'key'], 'context.operation', 'INVALID_OPERATION');
  if (typeof source.operationId !== 'string' || !Number.isSafeInteger(source.version)) {
    throw contextError('INVALID_OPERATION', 'context.operation requires a string operationId and safe integer version');
  }
  try {
    const canonical = operationReference(source.operationId, source.version as number);
    if (source.key !== canonical.key) {
      throw contextError('INVALID_OPERATION', 'context.operation.key does not match exact operationId@version');
    }
    return canonical;
  } catch (error: unknown) {
    if (error instanceof OperationInvocationContextError) throw error;
    throw contextError('INVALID_OPERATION', 'context.operation does not resolve exactly in the canonical catalog', error);
  }
}

function sameOperation(left: OperationReference, right: OperationReference): boolean {
  return left.operationId === right.operationId
    && left.version === right.version
    && left.key === right.key;
}

function normalizeIdempotency(
  value: unknown,
  operation: OperationReference,
): OperationIdempotencyBinding {
  const discriminant = exactObjectByDiscriminant(value);
  try {
    if (discriminant.kind === 'NONE') {
      return createOperationInvocationIdempotency({
        operation: { operationId: operation.operationId, version: operation.version },
        idempotency: { kind: 'NONE' },
      });
    }
    if (discriminant.kind === 'KEYED') {
      return createOperationInvocationIdempotency({
        operation: { operationId: operation.operationId, version: operation.version },
        idempotency: { kind: 'KEYED', key: discriminant.source.key },
      });
    }
    const naturalOperation = normalizeOperation(discriminant.source.operation);
    if (!sameOperation(operation, naturalOperation)) {
      throw contextError('INVALID_IDEMPOTENCY', 'NATURAL idempotency must bind the context operation exactly');
    }
    return createOperationInvocationIdempotency({
      operation: { operationId: operation.operationId, version: operation.version },
      idempotency: { kind: 'NATURAL' },
    });
  } catch (error: unknown) {
    if (error instanceof OperationInvocationContextError) throw error;
    if (error instanceof OperationInvocationIdempotencyError || error instanceof Error) {
      throw contextError('INVALID_IDEMPOTENCY', 'context.idempotency is inconsistent with the canonical operation', error);
    }
    throw error;
  }
}

type IdempotencyDiscriminant =
  | { readonly kind: 'NONE'; readonly source: Record<string, unknown> }
  | { readonly kind: 'KEYED'; readonly source: Record<string, unknown> }
  | { readonly kind: 'NATURAL'; readonly source: Record<string, unknown> };

function exactObjectByDiscriminant(value: unknown): IdempotencyDiscriminant {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw contextError('INVALID_IDEMPOTENCY', 'context.idempotency must be an exact object');
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
  if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
    throw contextError('INVALID_IDEMPOTENCY', 'context.idempotency.kind must be an enumerable data property');
  }
  if (descriptor.value === 'NONE') {
    return { kind: 'NONE', source: exactObject(value, ['kind'], 'context.idempotency', 'INVALID_IDEMPOTENCY') };
  }
  if (descriptor.value === 'KEYED') {
    return { kind: 'KEYED', source: exactObject(value, ['kind', 'key'], 'context.idempotency', 'INVALID_IDEMPOTENCY') };
  }
  if (descriptor.value === 'NATURAL') {
    return { kind: 'NATURAL', source: exactObject(value, ['kind', 'operation'], 'context.idempotency', 'INVALID_IDEMPOTENCY') };
  }
  throw contextError('INVALID_IDEMPOTENCY', 'context.idempotency.kind must be NONE, KEYED, or NATURAL');
}

/**
 * Structurally validate an untrusted or transported schema-v1 record and return
 * a detached frozen copy. This proves shape and catalog consistency only; it is
 * deliberately not authority to construct a lifecycle transition.
 */
export function validateOperationInvocationContext(input: unknown): OperationInvocationContext {
  assertJsonOnly(input, 'context', new WeakSet<object>());
  const source = exactObject(
    input,
    ['schemaVersion', 'operation', 'identity', 'subject', 'idempotency', 'createdAt'],
    'context',
    'INVALID_CONTEXT',
  );
  if (source.schemaVersion !== OPERATION_INVOCATION_CONTEXT_SCHEMA_VERSION) {
    throw contextError('UNSUPPORTED_SCHEMA_VERSION', 'operation invocation context schemaVersion must be 1');
  }

  const operation = normalizeOperation(source.operation);
  let identity: OperationInvocationIdentity;
  try {
    identity = validateOperationInvocationIdentity(source.identity);
  } catch (error: unknown) {
    if (!(error instanceof OperationIdentityError)) throw error;
    throw contextError('INVALID_IDENTITY', `context.identity failed validation: ${error.code}`, error);
  }
  let subject: OperationInvocationSubject;
  try {
    subject = createOperationInvocationSubject(source.subject);
  } catch (error: unknown) {
    if (!(error instanceof OperationInvocationSubjectError)) throw error;
    throw contextError('INVALID_SUBJECT', `context.subject failed validation: ${error.code}`, error);
  }

  let createdAt: string;
  try {
    createdAt = operationInvocationInstant(source.createdAt);
  } catch (error: unknown) {
    if (!(error instanceof OperationIdentityError)) throw error;
    throw contextError('INVALID_CREATED_AT', 'context.createdAt must be an exact RFC3339 instant', error);
  }
  if (createdAt !== identity.occurredAt) {
    throw contextError(
      'IDENTITY_BINDING_MISMATCH',
      'context.createdAt must exactly equal identity.occurredAt',
    );
  }

  return Object.freeze({
    schemaVersion: OPERATION_INVOCATION_CONTEXT_SCHEMA_VERSION,
    operation,
    identity,
    subject,
    idempotency: normalizeIdempotency(source.idempotency, operation),
    createdAt,
  });
}

/**
 * Construct the lifecycle root. Non-root transported records must use the
 * explicitly structural {@link validateOperationInvocationContext} API.
 */
export function createOperationInvocationContext(input: unknown): OperationInvocationContext {
  const context = validateOperationInvocationContext(input);
  if (context.identity.relation !== 'root') {
    throw contextError(
      'ROOT_CONTEXT_REQUIRED',
      'createOperationInvocationContext constructs only root lifecycle contexts',
    );
  }
  return context;
}

export interface RetryOperationInvocationContextInput {
  readonly previous: OperationInvocationContext;
  readonly operationAttemptId: unknown;
  readonly occurredAt: unknown;
}

export interface RelatedOperationInvocationContextInput {
  readonly parent: OperationInvocationContext;
  readonly invocationId: unknown;
  readonly operationAttemptId: unknown;
  readonly occurredAt: unknown;
  readonly operation: OperationReference;
  readonly subject: OperationInvocationSubject;
  readonly idempotency: OperationIdempotencyBinding;
}

export interface NewTransactionOperationInvocationContextInput {
  readonly previous: OperationInvocationContext;
  readonly invocationId: unknown;
  readonly transactionId: unknown;
  readonly operationAttemptId: unknown;
  readonly correlationId: unknown;
  readonly occurredAt: unknown;
  readonly operation: OperationReference;
  readonly subject: OperationInvocationSubject;
  readonly idempotency: OperationIdempotencyBinding;
}

function exactTransitionInput(
  input: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  try {
    assertJsonOnly(input, label, new WeakSet<object>());
  } catch (error: unknown) {
    if (!(error instanceof OperationInvocationContextError)) throw error;
    throw contextError('INVALID_TRANSITION_INPUT', `${label} is not strict JSON data`, error);
  }
  return exactObject(input, keys, label, 'INVALID_TRANSITION_INPUT');
}

function previousContext(value: unknown, label: string): OperationInvocationContext {
  try {
    return validateOperationInvocationContext(value);
  } catch (error: unknown) {
    if (!(error instanceof OperationInvocationContextError)) throw error;
    throw contextError('INVALID_TRANSITION_INPUT', `${label} must be a structurally valid previous context`, error);
  }
}

function transitionIdentity(
  create: () => OperationInvocationIdentity,
  label: string,
): OperationInvocationIdentity {
  try {
    return create();
  } catch (error: unknown) {
    if (!(error instanceof OperationIdentityError)) throw error;
    throw contextError('INVALID_TRANSITION', `${label} identity transition failed: ${error.code}`, error);
  }
}

function composeTransitionContext(
  identity: OperationInvocationIdentity,
  operation: unknown,
  subject: unknown,
  idempotency: unknown,
): OperationInvocationContext {
  return validateOperationInvocationContext({
    schemaVersion: OPERATION_INVOCATION_CONTEXT_SCHEMA_VERSION,
    operation,
    identity,
    subject,
    idempotency,
    createdAt: identity.occurredAt,
  });
}

/**
 * Authoritatively derive a retry. The caller supplies only the new attempt and
 * instant; operation, idempotency, subject, invocation, transaction, and
 * correlation are retained from the validated previous context.
 */
export function retryOperationInvocationContext(
  input: RetryOperationInvocationContextInput,
): OperationInvocationContext {
  const source = exactTransitionInput(
    input,
    ['previous', 'operationAttemptId', 'occurredAt'],
    'retry context input',
  );
  const previous = previousContext(source.previous, 'retry.previous');
  const identity = transitionIdentity(() => retryIdentity({
    previous: previous.identity,
    operationAttemptId: source.operationAttemptId,
    occurredAt: source.occurredAt,
  }), 'retry');
  return composeTransitionContext(
    identity,
    previous.operation,
    previous.subject,
    previous.idempotency,
  );
}

function relatedOperationInvocationContext(
  input: RelatedOperationInvocationContextInput,
  relation: 'child' | 'sibling',
): OperationInvocationContext {
  const source = exactTransitionInput(
    input,
    ['parent', 'invocationId', 'operationAttemptId', 'occurredAt', 'operation', 'subject', 'idempotency'],
    `${relation} context input`,
  );
  const parent = previousContext(source.parent, `${relation}.parent`);
  const createIdentity = relation === 'child' ? childIdentity : siblingIdentity;
  const identity = transitionIdentity(() => createIdentity({
    parent: parent.identity,
    invocationId: source.invocationId,
    transactionId: parent.identity.transactionId,
    operationAttemptId: source.operationAttemptId,
    correlationId: parent.identity.correlationId,
    occurredAt: source.occurredAt,
  }), relation);
  return composeTransitionContext(identity, source.operation, source.subject, source.idempotency);
}

/** Construct an exact child operation under a validated parent context. */
export function childOperationInvocationContext(
  input: RelatedOperationInvocationContextInput,
): OperationInvocationContext {
  return relatedOperationInvocationContext(input, 'child');
}

/** Construct an exact sibling operation related to a validated parent context. */
export function siblingOperationInvocationContext(
  input: RelatedOperationInvocationContextInput,
): OperationInvocationContext {
  return relatedOperationInvocationContext(input, 'sibling');
}

/** Construct a new transaction with explicit same-or-new correlation. */
export function newTransactionOperationInvocationContext(
  input: NewTransactionOperationInvocationContextInput,
): OperationInvocationContext {
  const source = exactTransitionInput(
    input,
    [
      'previous', 'invocationId', 'transactionId', 'operationAttemptId', 'correlationId',
      'occurredAt', 'operation', 'subject', 'idempotency',
    ],
    'new transaction context input',
  );
  const previous = previousContext(source.previous, 'new-transaction.previous');
  const identity = transitionIdentity(() => newTransactionIdentity({
    previous: previous.identity,
    invocationId: source.invocationId,
    transactionId: source.transactionId,
    operationAttemptId: source.operationAttemptId,
    correlationId: source.correlationId,
    occurredAt: source.occurredAt,
  }), 'new-transaction');
  return composeTransitionContext(identity, source.operation, source.subject, source.idempotency);
}
