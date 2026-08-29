import { describe, expect, it } from 'vitest';
import {
  createOperationInvocationIdempotency,
  OperationInvocationIdempotencyError,
} from '../../src/core/operation-invocation-idempotency.js';
import {
  idempotencyKey,
  type IdempotencyKey,
} from '../../src/core/operation-invocation-identity.js';
import {
  Op,
  OperationVersionMismatchError,
  UnknownOperationError,
} from '../../src/core/operation-catalog/index.js';

function binding(operationId: string, version: number, idempotency: unknown): ReturnType<typeof createOperationInvocationIdempotency> {
  return createOperationInvocationIdempotency({
    operation: { operationId, version },
    idempotency: idempotency as never,
  });
}

function errorCode(operation: () => unknown): string {
  try {
    operation();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(OperationInvocationIdempotencyError);
    return (error as OperationInvocationIdempotencyError).code;
  }
  return 'NO_ERROR';
}

describe('operation invocation idempotency', () => {
  it('resolves only exact catalog operation references and preserves catalog error distinctions', () => {
    expect(() => binding('op.no.such.operation', 1, { kind: 'NONE' })).toThrow(UnknownOperationError);
    expect(() => binding(Op.FsRead, 2, { kind: 'NATURAL' })).toThrow(OperationVersionMismatchError);
    expect(binding(Op.FsRead, 1, { kind: 'NATURAL' })).toEqual({
      kind: 'NATURAL', operation: { operationId: Op.FsRead, version: 1, key: 'op.fs.read@1' },
    });
  });

  it('has one immutable exact binding shape for each catalog idempotency class', () => {
    // The catalog currently has no NONE operation; its exact shape is still validated before catalog-class matching.
    expect(errorCode(() => binding(Op.FsRead, 1, { kind: 'NONE', key: 'forbidden' }))).toBe('INVALID_IDEMPOTENCY_INPUT');
    expect(errorCode(() => binding(Op.FsRead, 1, { kind: 'NONE' }))).toBe('IDEMPOTENCY_CLASS_MISMATCH');
    const keyed = binding(Op.FsWrite, 1, { kind: 'KEYED', key: 'idempotency:request-0001' });
    const natural = binding(Op.FsRead, 1, { kind: 'NATURAL' });
    expect(keyed).toEqual({ kind: 'KEYED', key: 'idempotency:request-0001' });
    expect(natural).toEqual({ kind: 'NATURAL', operation: { operationId: Op.FsRead, version: 1, key: 'op.fs.read@1' } });
    expect(Object.isFrozen(keyed)).toBe(true);
    expect(Object.isFrozen(natural)).toBe(true);
    if (natural.kind === 'NATURAL') expect(Object.isFrozen(natural.operation)).toBe(true);
  });

  it('brands only valid keyed authority data and forbids keys for NONE and NATURAL shapes', () => {
    const branded: IdempotencyKey = idempotencyKey('idempotency:request-0002');
    expect(branded).toBe('idempotency:request-0002');
    for (const invalid of ['', ' padded', 'padded ', 'idempotency:line\nbreak', `idempotency:${'x'.repeat(256)}`, null]) {
      expect(errorCode(() => binding(Op.FsWrite, 1, { kind: 'KEYED', key: invalid }))).toBe('INVALID_IDEMPOTENCY_KEY');
    }
    expect(errorCode(() => binding(Op.FsWrite, 1, { kind: 'KEYED', key: 'request' }))).toBe('INVALID_IDEMPOTENCY_KEY');
    expect(errorCode(() => binding(Op.FsRead, 1, { kind: 'NATURAL', key: 'forbidden' }))).toBe('INVALID_IDEMPOTENCY_INPUT');
  });

  it('rejects catalog-class mismatches and arbitrary binding material without policy or effects', () => {
    expect(errorCode(() => binding(Op.FsWrite, 1, { kind: 'NATURAL' }))).toBe('IDEMPOTENCY_CLASS_MISMATCH');
    expect(errorCode(() => binding(Op.FsRead, 1, { kind: 'KEYED', key: 'idempotency:request-0003' }))).toBe('IDEMPOTENCY_CLASS_MISMATCH');
    expect(errorCode(() => binding(Op.FsWrite, 1, { kind: 'UNKNOWN' }))).toBe('INVALID_IDEMPOTENCY_INPUT');
    expect(errorCode(() => binding(Op.FsWrite, 1, { kind: 'KEYED', key: 'idempotency:request-0004', metadata: 'nope' }))).toBe('INVALID_IDEMPOTENCY_INPUT');
    const hiddenMaterial = { kind: 'NATURAL' };
    Object.defineProperty(hiddenMaterial, 'key', { value: 'forbidden' });
    expect(errorCode(() => binding(Op.FsRead, 1, hiddenMaterial))).toBe('INVALID_IDEMPOTENCY_INPUT');

    let getterCalled = false;
    const accessor = { kind: 'KEYED', key: 'idempotency:request-0005' };
    Object.defineProperty(accessor, 'key', {
      enumerable: true,
      get: () => { getterCalled = true; return 'idempotency:request-0005'; },
    });
    expect(errorCode(() => binding(Op.FsWrite, 1, accessor))).toBe('INVALID_IDEMPOTENCY_INPUT');
    expect(getterCalled).toBe(false);
    expect(errorCode(() => binding(Op.FsRead, 1, { kind: 'NATURAL', [Symbol('extra')]: true }))).toBe('INVALID_IDEMPOTENCY_INPUT');
  });
});
