import { createHash, timingSafeEqual } from 'node:crypto';

import { canonicalJson } from './audit-writer.js';
import {
  validateOperationInvocationContext,
  type OperationInvocationContext,
} from './operation-invocation-context.js';

export const OPERATION_INVOCATION_TRANSPORT_SCHEMA_VERSION = 1 as const;
export const OPERATION_INVOCATION_TRANSPORT_MAX_BYTES = 64 * 1024;

const CONTEXT_DIGEST_DOMAIN = 'deckent:operation-invocation-context:v1\0';
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/u;
const ENVELOPE_KEYS = ['schemaVersion', 'contextSha256', 'context'] as const;
const UTF8_ENCODER = new TextEncoder();

export type OperationInvocationTransportErrorCode =
  | 'INVALID_INPUT'
  | 'OVERSIZE'
  | 'INVALID_UTF8'
  | 'INVALID_JSON'
  | 'NON_CANONICAL_BYTES'
  | 'INVALID_ENVELOPE'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_DIGEST'
  | 'DIGEST_MISMATCH'
  | 'CONTEXT_INVALID';

export class OperationInvocationTransportError extends Error {
  constructor(
    public readonly code: OperationInvocationTransportErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'OperationInvocationTransportError';
  }
}

export interface OperationInvocationTransportEnvelopeV1 {
  readonly schemaVersion: typeof OPERATION_INVOCATION_TRANSPORT_SCHEMA_VERSION;
  readonly contextSha256: string;
  readonly context: OperationInvocationContext;
}

function transportError(
  code: OperationInvocationTransportErrorCode,
  message: string,
  cause?: unknown,
): OperationInvocationTransportError {
  return new OperationInvocationTransportError(code, message, cause);
}

function canonicalize(
  value: unknown,
  code: 'NON_CANONICAL_BYTES' | 'CONTEXT_INVALID',
  label: string,
): string {
  try {
    const canonical = canonicalJson(value);
    if (typeof canonical !== 'string') {
      throw new TypeError(`${label} is not a canonical JSON value`);
    }
    return canonical;
  } catch (error: unknown) {
    throw transportError(code, `${label} cannot be represented as canonical JSON`, error);
  }
}

function validateContext(input: unknown): OperationInvocationContext {
  try {
    return validateOperationInvocationContext(input);
  } catch (error: unknown) {
    throw transportError(
      'CONTEXT_INVALID',
      'operation invocation context failed structural or catalog validation',
      error,
    );
  }
}

function contextDigest(canonicalContext: string): string {
  return createHash('sha256')
    .update(CONTEXT_DIGEST_DOMAIN, 'utf8')
    .update(canonicalContext, 'utf8')
    .digest('hex');
}

function exactEnvelope(value: unknown): {
  readonly schemaVersion: unknown;
  readonly contextSha256: unknown;
  readonly context: unknown;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw transportError('INVALID_ENVELOPE', 'operation invocation transport envelope must be a JSON object');
  }
  const source = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(source);
  if (keys.length !== ENVELOPE_KEYS.length
    || keys.some(key => typeof key !== 'string' || !ENVELOPE_KEYS.includes(key as typeof ENVELOPE_KEYS[number]))) {
    throw transportError(
      'INVALID_ENVELOPE',
      'operation invocation transport envelope must contain only schemaVersion, contextSha256, and context',
    );
  }
  const descriptors = Object.getOwnPropertyDescriptors(source);
  for (const key of ENVELOPE_KEYS) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      throw transportError('INVALID_ENVELOPE', `operation invocation transport envelope ${key} must be a data property`);
    }
  }
  return {
    schemaVersion: descriptors.schemaVersion!.value,
    contextSha256: descriptors.contextSha256!.value,
    context: descriptors.context!.value,
  };
}

function digestMatches(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

/**
 * Validate and encode one structurally valid invocation context as bounded,
 * deterministic canonical UTF-8. The digest binds context bytes only and is
 * integrity evidence, never an authentication, permission, or approval claim.
 */
export function encodeOperationInvocationContext(input: unknown): Uint8Array {
  const context = validateContext(input);
  const canonicalContext = canonicalize(context, 'CONTEXT_INVALID', 'operation invocation context');
  const envelope: OperationInvocationTransportEnvelopeV1 = {
    schemaVersion: OPERATION_INVOCATION_TRANSPORT_SCHEMA_VERSION,
    contextSha256: contextDigest(canonicalContext),
    context,
  };
  const canonicalEnvelope = canonicalize(envelope, 'CONTEXT_INVALID', 'operation invocation transport envelope');
  const bytes = UTF8_ENCODER.encode(canonicalEnvelope);
  if (bytes.byteLength > OPERATION_INVOCATION_TRANSPORT_MAX_BYTES) {
    throw transportError(
      'OVERSIZE',
      `operation invocation transport envelope exceeds ${OPERATION_INVOCATION_TRANSPORT_MAX_BYTES} bytes`,
    );
  }
  return bytes.slice();
}

/**
 * Decode an untrusted cross-boundary envelope. The original bytes themselves
 * must be the sole canonical representation; parsing and reserializing never
 * repairs or legitimizes a non-canonical transport.
 */
export function decodeOperationInvocationContext(input: Uint8Array): OperationInvocationContext {
  if (!(input instanceof Uint8Array) || input.byteLength === 0) {
    throw transportError('INVALID_INPUT', 'operation invocation transport input must be a non-empty Uint8Array');
  }
  if (input.byteLength > OPERATION_INVOCATION_TRANSPORT_MAX_BYTES) {
    throw transportError(
      'OVERSIZE',
      `operation invocation transport input exceeds ${OPERATION_INVOCATION_TRANSPORT_MAX_BYTES} bytes`,
    );
  }

  const original = Uint8Array.from(input);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(original);
  } catch (error: unknown) {
    throw transportError('INVALID_UTF8', 'operation invocation transport input is not valid UTF-8', error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw transportError('INVALID_JSON', 'operation invocation transport input is not valid JSON', error);
  }

  const envelope = exactEnvelope(parsed);
  if (envelope.schemaVersion !== OPERATION_INVOCATION_TRANSPORT_SCHEMA_VERSION) {
    throw transportError(
      'UNSUPPORTED_SCHEMA_VERSION',
      'operation invocation transport schemaVersion must be 1',
    );
  }
  if (typeof envelope.contextSha256 !== 'string' || !LOWERCASE_SHA256.test(envelope.contextSha256)) {
    throw transportError('INVALID_DIGEST', 'contextSha256 must be exactly 64 lowercase hexadecimal characters');
  }

  const canonicalEnvelope = canonicalize(parsed, 'NON_CANONICAL_BYTES', 'operation invocation transport envelope');
  const canonicalEnvelopeBytes = UTF8_ENCODER.encode(canonicalEnvelope);
  if (!Buffer.from(original).equals(Buffer.from(canonicalEnvelopeBytes))) {
    throw transportError(
      'NON_CANONICAL_BYTES',
      'operation invocation transport input is not its exact canonical UTF-8 representation',
    );
  }

  const embeddedCanonicalContext = canonicalize(
    envelope.context,
    'NON_CANONICAL_BYTES',
    'embedded operation invocation context',
  );
  const expectedDigest = contextDigest(embeddedCanonicalContext);
  if (!digestMatches(envelope.contextSha256, expectedDigest)) {
    throw transportError('DIGEST_MISMATCH', 'contextSha256 does not bind the embedded canonical context');
  }

  const context = validateContext(envelope.context);
  const validatedCanonicalContext = canonicalize(
    context,
    'CONTEXT_INVALID',
    'validated operation invocation context',
  );
  if (validatedCanonicalContext !== embeddedCanonicalContext) {
    throw transportError(
      'CONTEXT_INVALID',
      'operation invocation context validation changed its canonical representation',
    );
  }
  return context;
}
