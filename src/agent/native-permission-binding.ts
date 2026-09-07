import { createHash } from 'node:crypto';

import { canonicalJson } from '../core/audit-writer.js';
import { grantPatternFor } from './permission-types.js';
import type { ToolPermissionTier } from './tools/types.js';

const SHA256_HEX = /^[a-f0-9]{64}$/u;
const ARGUMENT_DIGEST_DOMAIN = 'deckent:native-permission-invocation-args:v1\0';
const LIFETIMES = Object.freeze(['once', 'session', 'always'] as const);
const ONCE_LIFETIME = Object.freeze(['once'] as const);
const TIERS = ['silent', 'confirm', 'always'] as const;

export type NativePermissionLifetime = typeof LIFETIMES[number];

export interface NativePermissionInvocation {
  readonly schemaVersion: 1;
  readonly sessionId: string;
  readonly sessionInstanceId: string;
  readonly turnGeneration: number;
  readonly invocationId: string;
  readonly callId: string;
  readonly tool: string;
  readonly invocationArgsDigest: string;
  readonly tier: ToolPermissionTier;
  readonly elevated: boolean;
  readonly nested: boolean;
}

export interface NativePermissionBinding {
  readonly schemaVersion: 1;
  readonly kind: 'native-tool-permission';
  readonly invocation: NativePermissionInvocation;
  readonly requestedLifetime: NativePermissionLifetime;
  readonly grantPattern: string | null;
}

export interface CreateNativePermissionBindingInput {
  readonly sessionId: string;
  readonly sessionInstanceId: string;
  readonly turnGeneration: number;
  readonly invocationId: string;
  readonly callId: string;
  readonly tool: string;
  readonly rawArgs: Record<string, unknown>;
  readonly resource: string;
  readonly tier: ToolPermissionTier;
  readonly elevated: boolean;
  readonly nested: boolean;
  readonly requestedLifetime: NativePermissionLifetime;
}

export type CreateNativePermissionInvocationInput = Omit<
  CreateNativePermissionBindingInput,
  'resource' | 'requestedLifetime'
>;

export type ParseNativePermissionBindingResult =
  | { readonly ok: true; readonly value: NativePermissionBinding }
  | { readonly ok: false; readonly reasonCode: 'INVALID_NATIVE_PERMISSION_BINDING' };

function invalid(): ParseNativePermissionBindingResult {
  return { ok: false, reasonCode: 'INVALID_NATIVE_PERMISSION_BINDING' };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(value: unknown, seen: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('native permission arguments are not JSON-safe');
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new TypeError('native permission arguments are not JSON-safe');
  }
  if (seen.has(value)) throw new TypeError('native permission arguments are not JSON-safe');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError('native permission arguments are not JSON-safe');
      }
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) throw new TypeError('native permission arguments are not JSON-safe');
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError('native permission arguments are not JSON-safe');
        }
        validateJsonValue(descriptor.value, seen);
      }
      if (Reflect.ownKeys(value).length !== value.length + 1) {
        throw new TypeError('native permission arguments are not JSON-safe');
      }
      return;
    }
    if (!isPlainRecord(value)) throw new TypeError('native permission arguments are not JSON-safe');
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new TypeError('native permission arguments are not JSON-safe');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError('native permission arguments are not JSON-safe');
      }
      validateJsonValue(descriptor.value, seen);
    }
  } finally {
    seen.delete(value);
  }
}

/** Hash exact JSON arguments without retaining or returning their raw bytes. */
export function digestNativePermissionArgs(rawArgs: Record<string, unknown>): string {
  if (!isPlainRecord(rawArgs)) throw new TypeError('native permission arguments are not JSON-safe');
  validateJsonValue(rawArgs, new Set());
  return createHash('sha256')
    .update(ARGUMENT_DIGEST_DOMAIN, 'utf8')
    .update(canonicalJson(rawArgs), 'utf8')
    .digest('hex');
}

/** Longer grants are available only for an ordinary confirm-tier invocation. */
export function permittedNativePermissionLifetimes(input: {
  readonly tier: ToolPermissionTier;
  readonly elevated: boolean;
  readonly nested: boolean;
}): readonly NativePermissionLifetime[] {
  return input.tier !== 'always' && !input.elevated && !input.nested
    ? LIFETIMES
    : ONCE_LIFETIME;
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && Reflect.ownKeys(value).length === expected.length
    && actual.every((key, index) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return key === sortedExpected[index]
        && descriptor?.enumerable === true
        && 'value' in descriptor;
    });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createNativePermissionBinding(
  input: CreateNativePermissionBindingInput,
): NativePermissionBinding {
  const invocation = createNativePermissionInvocation(input);
  return bindNativePermissionIntent(invocation, input.requestedLifetime, input.resource);
}

export function createNativePermissionInvocation(
  input: CreateNativePermissionInvocationInput,
): NativePermissionInvocation {
  const candidate = {
    schemaVersion: 1,
    sessionId: input.sessionId,
    sessionInstanceId: input.sessionInstanceId,
    turnGeneration: input.turnGeneration,
    invocationId: input.invocationId,
    callId: input.callId,
    tool: input.tool,
    invocationArgsDigest: digestNativePermissionArgs(input.rawArgs),
    tier: input.tier,
    elevated: input.elevated,
    nested: input.nested,
  };
  const parsed = parseNativePermissionInvocation(candidate);
  if (!parsed.ok) throw new TypeError(parsed.reasonCode);
  return parsed.value;
}

export function bindNativePermissionIntent(
  invocation: NativePermissionInvocation,
  requestedLifetime: NativePermissionLifetime,
  resource: string,
): NativePermissionBinding {
  const candidate = {
    schemaVersion: 1,
    kind: 'native-tool-permission',
    invocation,
    requestedLifetime,
    grantPattern: requestedLifetime === 'once'
      ? null
      : grantPatternFor(invocation.tool, resource, requestedLifetime),
  };
  const parsed = parseNativePermissionBinding({ nativePermission: candidate });
  if (!parsed.ok) throw new TypeError(parsed.reasonCode);
  return parsed.value;
}

export type ParseNativePermissionInvocationResult =
  | { readonly ok: true; readonly value: NativePermissionInvocation }
  | { readonly ok: false; readonly reasonCode: 'INVALID_NATIVE_PERMISSION_BINDING' };

export function parseNativePermissionInvocation(value: unknown): ParseNativePermissionInvocationResult {
  const parsed = parseNativePermissionBinding({
    nativePermission: {
      schemaVersion: 1,
      kind: 'native-tool-permission',
      invocation: value,
      requestedLifetime: 'once',
      grantPattern: null,
    },
  });
  return parsed.ok ? { ok: true, value: parsed.value.invocation } : parsed;
}

export function parseNativePermissionBinding(details: unknown): ParseNativePermissionBindingResult {
  if (!isPlainRecord(details) || !hasExactKeys(details, ['nativePermission'])) return invalid();
  const binding = details['nativePermission'];
  if (!isPlainRecord(binding)
    || !hasExactKeys(binding, ['schemaVersion', 'kind', 'invocation', 'requestedLifetime', 'grantPattern'])
    || binding['schemaVersion'] !== 1
    || binding['kind'] !== 'native-tool-permission') return invalid();

  const invocation = binding['invocation'];
  if (!isPlainRecord(invocation)
    || !hasExactKeys(invocation, [
      'schemaVersion', 'sessionId', 'sessionInstanceId', 'turnGeneration', 'invocationId',
      'callId', 'tool', 'invocationArgsDigest', 'tier', 'elevated', 'nested',
    ])
    || invocation['schemaVersion'] !== 1
    || !nonBlank(invocation['sessionId'])
    || !nonBlank(invocation['sessionInstanceId'])
    || !Number.isSafeInteger(invocation['turnGeneration'])
    || (invocation['turnGeneration'] as number) <= 0
    || !nonBlank(invocation['invocationId'])
    || !nonBlank(invocation['callId'])
    || !nonBlank(invocation['tool'])
    || typeof invocation['invocationArgsDigest'] !== 'string'
    || !SHA256_HEX.test(invocation['invocationArgsDigest'])
    || !TIERS.includes(invocation['tier'] as ToolPermissionTier)
    || typeof invocation['elevated'] !== 'boolean'
    || typeof invocation['nested'] !== 'boolean'
    || !LIFETIMES.includes(binding['requestedLifetime'] as NativePermissionLifetime)) return invalid();

  const requestedLifetime = binding['requestedLifetime'] as NativePermissionLifetime;
  const permitted = permittedNativePermissionLifetimes({
    tier: invocation['tier'] as ToolPermissionTier,
    elevated: invocation['elevated'],
    nested: invocation['nested'],
  });
  if (!permitted.includes(requestedLifetime)) return invalid();
  if (requestedLifetime === 'once') {
    if (binding['grantPattern'] !== null) return invalid();
  } else if (binding['grantPattern'] !== '**') {
    return invalid();
  }

  const value: NativePermissionBinding = {
    schemaVersion: 1,
    kind: 'native-tool-permission',
    invocation: {
      schemaVersion: 1,
      sessionId: invocation['sessionId'],
      sessionInstanceId: invocation['sessionInstanceId'],
      turnGeneration: invocation['turnGeneration'] as number,
      invocationId: invocation['invocationId'],
      callId: invocation['callId'],
      tool: invocation['tool'],
      invocationArgsDigest: invocation['invocationArgsDigest'],
      tier: invocation['tier'] as ToolPermissionTier,
      elevated: invocation['elevated'],
      nested: invocation['nested'],
    },
    requestedLifetime,
    grantPattern: binding['grantPattern'] as string | null,
  };
  return { ok: true, value: deepFreeze(value) };
}

export function nativePermissionBindingsEqual(
  left: NativePermissionBinding,
  right: NativePermissionBinding,
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
