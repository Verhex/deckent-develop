import { describe, expect, it } from 'vitest';

import {
  createNativePermissionBinding,
  createNativePermissionInvocation,
  digestNativePermissionArgs,
  bindNativePermissionIntent,
  nativePermissionBindingsEqual,
  parseNativePermissionBinding,
  parseNativePermissionInvocation,
  permittedNativePermissionLifetimes,
  type NativePermissionLifetime,
} from '../../src/agent/native-permission-binding.js';

function input() {
  return {
    sessionId: 'chat-1',
    sessionInstanceId: 'engine-1',
    turnGeneration: 1,
    invocationId: 'invocation-1',
    callId: 'call-1',
    tool: 'deckent_bash',
    rawArgs: { nested: { b: 2, a: ['x', true] }, command: 'printf ok' },
    resource: '/project',
    tier: 'confirm' as const,
    elevated: false,
    nested: false,
    requestedLifetime: 'once' as const,
  };
}

describe('native permission binding', () => {
  it('constructs a frozen strict binding without retaining raw arguments', () => {
    const rawArgs = input().rawArgs;
    const binding = createNativePermissionBinding({ ...input(), rawArgs });
    rawArgs.nested.a[0] = 'mutated';

    expect(binding.requestedLifetime).toBe('once');
    expect(binding.grantPattern).toBeNull();
    expect(binding.invocation.invocationArgsDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(binding)).not.toContain('printf ok');
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(binding.invocation)).toBe(true);
    expect(parseNativePermissionBinding({ nativePermission: binding })).toEqual({ ok: true, value: binding });
  });

  it('hashes nested JSON canonically and domain-separates changed values', () => {
    const left = digestNativePermissionArgs({ z: 1, nested: { b: 2, a: [3, 4] } });
    const reordered = digestNativePermissionArgs({ nested: { a: [3, 4], b: 2 }, z: 1 });
    const changed = digestNativePermissionArgs({ nested: { a: [3, 5], b: 2 }, z: 1 });
    expect(left).toBe(reordered);
    expect(left).not.toBe(changed);
  });

  it.each([
    { bad: { value: undefined }, label: 'undefined' },
    { bad: { value: Number.NaN }, label: 'non-finite' },
    { bad: { value: -0 }, label: 'negative zero' },
    { bad: { value: 1n }, label: 'bigint' },
    { bad: { value: Symbol('private') }, label: 'symbol' },
    { bad: { value: () => 'private' }, label: 'function' },
    { bad: { value: new Date(0) }, label: 'non-plain' },
    { bad: { value: Object.assign(Object.create(null), { toJSON: () => 'private' }) }, label: 'toJSON' },
  ])('rejects $label values without echoing private input', ({ bad }) => {
    expect(() => digestNativePermissionArgs(bad)).toThrow('not JSON-safe');
  });

  it('rejects cycles, accessors and sparse arrays without invoking accessors', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(() => digestNativePermissionArgs(cyclic)).toThrow('not JSON-safe');

    let accessed = false;
    const accessor = {};
    Object.defineProperty(accessor, 'secret', { enumerable: true, get: () => { accessed = true; return 'secret'; } });
    expect(() => digestNativePermissionArgs(accessor)).toThrow('not JSON-safe');
    expect(accessed).toBe(false);

    const hidden = {};
    Object.defineProperty(hidden, 'secret', { enumerable: false, value: 'private' });
    expect(() => digestNativePermissionArgs(hidden)).toThrow('not JSON-safe');

    const sparse = Array(2);
    sparse[1] = 'value';
    expect(() => digestNativePermissionArgs({ sparse })).toThrow('not JSON-safe');

    let arrayAccessed = false;
    const accessorArray: unknown[] = [];
    Object.defineProperty(accessorArray, '0', {
      enumerable: true,
      get: () => { arrayAccessed = true; return 'private'; },
    });
    expect(() => digestNativePermissionArgs({ accessorArray })).toThrow('not JSON-safe');
    expect(arrayAccessed).toBe(false);

    for (const key of ['-1', '0.5', 'Infinity', 'NaN', '4294967295']) {
      const arrayWithExtra = ['safe'] as unknown[] & Record<string, unknown>;
      Object.defineProperty(arrayWithExtra, key, { enumerable: true, value: 'private' });
      expect(() => digestNativePermissionArgs({ arrayWithExtra })).toThrow('not JSON-safe');
    }
    const arrayWithSymbol = ['safe'];
    Object.defineProperty(arrayWithSymbol, Symbol('private'), { enumerable: true, value: 'private' });
    expect(() => digestNativePermissionArgs({ arrayWithSymbol })).toThrow('not JSON-safe');
    const arrayWithHidden = ['safe'];
    Object.defineProperty(arrayWithHidden, 'hidden', { enumerable: false, value: 'private' });
    expect(() => digestNativePermissionArgs({ arrayWithHidden })).toThrow('not JSON-safe');
    let extraGetterCalled = false;
    const arrayWithGetter = ['safe'];
    Object.defineProperty(arrayWithGetter, 'extra', {
      enumerable: true,
      get: () => { extraGetterCalled = true; return 'private'; },
    });
    expect(() => digestNativePermissionArgs({ arrayWithGetter })).toThrow('not JSON-safe');
    expect(extraGetterCalled).toBe(false);
  });

  it('permits longer lifetimes only for ordinary confirm-tier calls', () => {
    const unrestricted = permittedNativePermissionLifetimes({ tier: 'confirm', elevated: false, nested: false });
    const restricted = permittedNativePermissionLifetimes({ tier: 'always', elevated: false, nested: false });
    expect(unrestricted).toEqual(['once', 'session', 'always']);
    expect(permittedNativePermissionLifetimes({ tier: 'silent', elevated: false, nested: false }))
      .toEqual(['once', 'session', 'always']);
    expect(restricted).toEqual(['once']);
    expect(permittedNativePermissionLifetimes({ tier: 'confirm', elevated: true, nested: false })).toEqual(['once']);
    expect(permittedNativePermissionLifetimes({ tier: 'confirm', elevated: false, nested: true })).toEqual(['once']);
    expect(Object.isFrozen(unrestricted)).toBe(true);
    expect(Object.isFrozen(restricted)).toBe(true);
    expect(() => (unrestricted as NativePermissionLifetime[]).splice(0, 1)).toThrow();
    expect(() => (restricted as NativePermissionLifetime[]).push('always')).toThrow();
    expect(permittedNativePermissionLifetimes({ tier: 'always', elevated: false, nested: false })).toEqual(['once']);
  });

  it('uses the existing tool-wide grant pattern for session and always', () => {
    const invocation = createNativePermissionInvocation(input());
    expect(parseNativePermissionInvocation(invocation)).toEqual({ ok: true, value: invocation });
    for (const requestedLifetime of ['session', 'always'] as const) {
      const binding = bindNativePermissionIntent(invocation, requestedLifetime, '/other-resource');
      expect(binding.grantPattern).toBe('**');
      expect(binding.requestedLifetime).toBe(requestedLifetime);
    }
  });

  it('strictly rejects unknown, malformed and forged bindings', () => {
    const valid = createNativePermissionBinding(input());
    const plain = structuredClone(valid) as Record<string, unknown>;
    const invocation = plain['invocation'] as Record<string, unknown>;

    const variants: unknown[] = [
      {},
      { nativePermission: { ...plain, extra: true } },
      { nativePermission: { ...plain, schemaVersion: 2 } },
      { nativePermission: { ...plain, requestedLifetime: 'session', grantPattern: '**', invocation: { ...invocation, tier: 'always' } } },
      { nativePermission: { ...plain, requestedLifetime: 'always', grantPattern: '**', invocation: { ...invocation, elevated: true } } },
      { nativePermission: { ...plain, requestedLifetime: 'session', grantPattern: '**', invocation: { ...invocation, nested: true } } },
      { nativePermission: { ...plain, invocation: { ...invocation, sessionId: ' ' } } },
      { nativePermission: { ...plain, invocation: { ...invocation, turnGeneration: 0 } } },
      { nativePermission: { ...plain, invocation: { ...invocation, invocationArgsDigest: 'private-secret' } } },
    ];
    const accessorEnvelope = {};
    Object.defineProperty(accessorEnvelope, 'nativePermission', {
      enumerable: true,
      get: () => plain,
    });
    variants.push(accessorEnvelope);
    for (const variant of variants) {
      expect(parseNativePermissionBinding(variant)).toEqual({
        ok: false,
        reasonCode: 'INVALID_NATIVE_PERMISSION_BINDING',
      });
    }
  });

  it('compares every invocation and intent field exactly', () => {
    const base = createNativePermissionBinding(input());
    const mutations = [
      { sessionId: 'chat-2' },
      { sessionInstanceId: 'engine-2' },
      { turnGeneration: 2 },
      { invocationId: 'invocation-2' },
      { callId: 'call-2' },
      { tool: 'deckent_read_file' },
    ];
    for (const mutation of mutations) {
      const changed = createNativePermissionBinding({ ...input(), ...mutation });
      expect(nativePermissionBindingsEqual(base, changed)).toBe(false);
    }
    expect(nativePermissionBindingsEqual(
      base,
      createNativePermissionBinding({ ...input(), rawArgs: { ...input().rawArgs, command: 'printf changed' } }),
    )).toBe(false);
    expect(nativePermissionBindingsEqual(
      base,
      createNativePermissionBinding({ ...input(), tier: 'silent' }),
    )).toBe(false);
    expect(nativePermissionBindingsEqual(
      base,
      createNativePermissionBinding({ ...input(), elevated: true }),
    )).toBe(false);
    expect(nativePermissionBindingsEqual(
      base,
      createNativePermissionBinding({ ...input(), nested: true }),
    )).toBe(false);
    expect(nativePermissionBindingsEqual(
      createNativePermissionBinding({ ...input(), requestedLifetime: 'session' }),
      createNativePermissionBinding({ ...input(), requestedLifetime: 'always' }),
    )).toBe(false);
    expect(nativePermissionBindingsEqual(base, createNativePermissionBinding(input()))).toBe(true);
    expect(nativePermissionBindingsEqual(
      base,
      createNativePermissionBinding({
        ...input(),
        rawArgs: { command: 'printf ok', nested: { a: ['x', true], b: 2 } },
      }),
    )).toBe(true);
  });
});
