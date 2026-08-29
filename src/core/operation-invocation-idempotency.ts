import {
  operationReference,
  resolveOperationReference,
  type OperationReference,
  type OperationReferenceInput,
} from './operation-catalog/index.js';
import {
  OperationIdentityError,
  idempotencyKey,
  type IdempotencyKey,
} from './operation-invocation-identity.js';

export interface NoneIdempotencyBindingInput {
  readonly kind: 'NONE';
}

export interface KeyedIdempotencyBindingInput {
  readonly kind: 'KEYED';
  readonly key: unknown;
}

export interface NaturalIdempotencyBindingInput {
  readonly kind: 'NATURAL';
}

export type OperationIdempotencyBindingInput =
  | NoneIdempotencyBindingInput
  | KeyedIdempotencyBindingInput
  | NaturalIdempotencyBindingInput;

export interface OperationInvocationIdempotencyInput {
  readonly operation: OperationReferenceInput;
  readonly idempotency: OperationIdempotencyBindingInput;
}

export interface NoneIdempotencyBinding {
  readonly kind: 'NONE';
}

export interface KeyedIdempotencyBinding {
  readonly kind: 'KEYED';
  readonly key: IdempotencyKey;
}

/**
 * Natural idempotency is bound solely to the exact resolved catalog operation.
 * It intentionally admits no caller-controlled key or metadata.
 */
export interface NaturalIdempotencyBinding {
  readonly kind: 'NATURAL';
  readonly operation: OperationReference;
}

export type OperationIdempotencyBinding =
  | NoneIdempotencyBinding
  | KeyedIdempotencyBinding
  | NaturalIdempotencyBinding;

export type OperationInvocationIdempotencyErrorCode =
  | 'INVALID_IDEMPOTENCY_INPUT'
  | 'INVALID_IDEMPOTENCY_KEY'
  | 'IDEMPOTENCY_CLASS_MISMATCH';

export class OperationInvocationIdempotencyError extends Error {
  constructor(
    public readonly code: OperationInvocationIdempotencyErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OperationInvocationIdempotencyError';
  }
}

function idempotencyError(
  code: OperationInvocationIdempotencyErrorCode,
  message: string,
): OperationInvocationIdempotencyError {
  return new OperationInvocationIdempotencyError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every(key => {
      if (typeof key !== 'string' || !keys.includes(key)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && descriptor.enumerable && 'value' in descriptor;
    });
}

function readOwnData(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
    throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', `idempotency ${key} must be a data property`);
  }
  return descriptor.value;
}

function parseIdempotencyKey(value: unknown): IdempotencyKey {
  try {
    return idempotencyKey(value);
  } catch (error: unknown) {
    if (!(error instanceof OperationIdentityError)) throw error;
    throw idempotencyError(
      'INVALID_IDEMPOTENCY_KEY',
      `idempotency key failed canonical identity validation: ${error.code}`,
    );
  }
}

function parseBinding(value: unknown): OperationIdempotencyBindingInput {
  if (!isRecord(value) || !Object.hasOwn(value, 'kind')) {
    throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', 'idempotency binding must be an exact object with a kind');
  }
  const kind = readOwnData(value, 'kind');
  if (kind === 'NONE' || kind === 'NATURAL') {
    if (!hasExactKeys(value, ['kind'])) {
      throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', `idempotency ${kind} binding forbids additional material`);
    }
    return { kind };
  }
  if (kind === 'KEYED') {
    if (!hasExactKeys(value, ['kind', 'key'])) {
      throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', 'idempotency KEYED binding requires only kind and key');
    }
    return { kind, key: readOwnData(value, 'key') };
  }
  throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', 'idempotency kind must be NONE, KEYED, or NATURAL');
}

/**
 * Resolves only the supplied operationId@version through the canonical catalog
 * and returns that entry's one authorized idempotency binding. This validator
 * performs no storage, deduplication, dispatch, permission, approval, or effect.
 */
export function createOperationInvocationIdempotency(
  input: OperationInvocationIdempotencyInput,
): OperationIdempotencyBinding {
  if (!isRecord(input) || !hasExactKeys(input, ['operation', 'idempotency'])) {
    throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', 'idempotency input requires only operation and idempotency');
  }
  const operationInput = readOwnData(input, 'operation');
  if (!isRecord(operationInput) || !hasExactKeys(operationInput, ['operationId', 'version'])) {
    throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', 'operation requires only operationId and version');
  }
  const operationId = readOwnData(operationInput, 'operationId');
  const version = readOwnData(operationInput, 'version');
  if (typeof operationId !== 'string' || typeof version !== 'number' || !Number.isInteger(version)) {
    throw idempotencyError('INVALID_IDEMPOTENCY_INPUT', 'operationId must be a string and version an integer');
  }

  const operation = resolveOperationReference({ operationId, version });
  const binding = parseBinding(readOwnData(input, 'idempotency'));
  if (binding.kind !== operation.idempotency) {
    throw idempotencyError(
      'IDEMPOTENCY_CLASS_MISMATCH',
      `operation '${operation.id}@${operation.version}' requires ${operation.idempotency} idempotency, received ${binding.kind}`,
    );
  }

  switch (binding.kind) {
    case 'NONE':
      return Object.freeze({ kind: 'NONE' });
    case 'KEYED':
      return Object.freeze({ kind: 'KEYED', key: parseIdempotencyKey(binding.key) });
    case 'NATURAL':
      return Object.freeze({
        kind: 'NATURAL',
        operation: operationReference(operation.id, operation.version),
      });
  }
}
