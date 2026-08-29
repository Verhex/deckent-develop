import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  OperationIdentityError,
  childOperation,
  correlationId,
  createRootOperationIdentity,
  idempotencyKey,
  invocationId,
  newTransactionOperation,
  operationAttemptId,
  operationCausation,
  retryOperation,
  siblingOperation,
  transactionId,
  validateOperationInvocationIdentity,
  type CorrelationId,
  type IdempotencyKey,
  type InvocationId,
  type OperationAttemptId,
  type TransactionId,
} from '../../src/core/operation-invocation-identity.js';

const rootInput = {
  invocationId: 'invocation:root-1',
  transactionId: 'transaction:tx-1',
  operationAttemptId: 'operation-attempt:attempt-1',
  correlationId: 'correlation:corr-1',
  occurredAt: '2026-08-29T00:00:00.000Z',
};

function expectCode(action: () => unknown, code: OperationIdentityError['code']): void {
  expect(action).toThrow(expect.objectContaining({ code }));
}

describe('operation invocation identities', () => {
  it('validates caller-supplied namespace-distinct brands including the sole idempotency key', () => {
    const invocation: InvocationId = invocationId('invocation:root-1');
    const transaction: TransactionId = transactionId('transaction:tx-1');
    const attempt: OperationAttemptId = operationAttemptId('operation-attempt:attempt-1');
    const correlation: CorrelationId = correlationId('correlation:corr-1');
    const idempotency: IdempotencyKey = idempotencyKey('idempotency:key-1');
    expect([invocation, transaction, attempt, correlation, idempotency]).toEqual([
      'invocation:root-1', 'transaction:tx-1', 'operation-attempt:attempt-1',
      'correlation:corr-1', 'idempotency:key-1',
    ]);
    expectTypeOf(invocation).not.toEqualTypeOf<TransactionId>();
    expectTypeOf(idempotency).not.toEqualTypeOf<InvocationId>();
    expectCode(() => transactionId('invocation:root-1'), 'IDENTITY_WRONG_NAMESPACE');
    expectCode(() => idempotencyKey('request-1'), 'IDENTITY_INVALID_FORMAT');
  });

  it('rejects malformed, padded, C0/C1 control-bearing and oversized values without repair', () => {
    expectCode(() => createRootOperationIdentity({ ...rootInput, invocationId: ' invocation:root-1' }), 'IDENTITY_PADDED');
    expectCode(() => createRootOperationIdentity({ ...rootInput, invocationId: 'invocation:root\u0000' }), 'IDENTITY_CONTROL_CHARACTER');
    expectCode(() => idempotencyKey('idempotency:key\u0085'), 'IDENTITY_CONTROL_CHARACTER');
    expectCode(() => createRootOperationIdentity({ ...rootInput, invocationId: `invocation:${'x'.repeat(256)}` }), 'IDENTITY_TOO_LONG');
    expectCode(() => createRootOperationIdentity({ ...rootInput, occurredAt: '2026-02-30T00:00:00Z' }), 'INVALID_TIMESTAMP');
    expect(createRootOperationIdentity({ ...rootInput, occurredAt: '0000-02-29T00:00:00Z' }).occurredAt)
      .toBe('0000-02-29T00:00:00Z');
  });

  it('makes root causation null and rejects self-causation or ambiguous relation data', () => {
    const root = createRootOperationIdentity(rootInput);
    expect(root).toMatchObject({ relation: 'root', causation: null });
    const cause = operationCausation({ invocationId: root.invocationId, operationAttemptId: root.operationAttemptId });
    expect(cause).toEqual({
      kind: 'operation', invocationId: root.invocationId, operationAttemptId: root.operationAttemptId,
    });
    expectCode(() => validateOperationInvocationIdentity({ ...root, relation: 'retry', causation: null }), 'INVALID_CAUSATION');
    expectCode(() => validateOperationInvocationIdentity({ ...root, relation: 'retry', causation: cause }), 'INVALID_CAUSATION');
    expectCode(() => validateOperationInvocationIdentity({
      ...root,
      relation: 'child',
      operationAttemptId: 'operation-attempt:attempt-2',
      causation: { ...cause, invocationId: root.invocationId },
    }), 'INVALID_CAUSATION');
    expectCode(() => validateOperationInvocationIdentity({ ...root, relation: 'other' }), 'INVALID_RELATION');
  });

  it('retry replaces only the attempt and points at the exact previous attempt', () => {
    const root = createRootOperationIdentity(rootInput);
    const retry = retryOperation({
      previous: root,
      operationAttemptId: 'operation-attempt:attempt-2',
      occurredAt: '2026-08-29T00:01:00.000Z',
    });
    expect(retry).toEqual({
      ...root,
      operationAttemptId: 'operation-attempt:attempt-2',
      causation: operationCausation({
        invocationId: root.invocationId,
        operationAttemptId: root.operationAttemptId,
      }),
      relation: 'retry',
      occurredAt: '2026-08-29T00:01:00.000Z',
    });
    expectCode(() => retryOperation({
      previous: root,
      operationAttemptId: root.operationAttemptId,
      occurredAt: root.occurredAt,
    }), 'IDENTITY_COLLISION');
  });

  it('distinguishes child and sibling while retaining transaction and correlation lineage', () => {
    const root = createRootOperationIdentity(rootInput);
    for (const [relation, createRelated] of [
      ['child', childOperation],
      ['sibling', siblingOperation],
    ] as const) {
      const related = createRelated({
        parent: root,
        invocationId: `invocation:${relation}-1`,
        transactionId: root.transactionId,
        operationAttemptId: `operation-attempt:${relation}-1`,
        correlationId: root.correlationId,
        occurredAt: '2026-08-29T00:01:00.000Z',
      });
      expect(related).toMatchObject({
        relation,
        transactionId: root.transactionId,
        correlationId: root.correlationId,
        causation: operationCausation({
          invocationId: root.invocationId,
          operationAttemptId: root.operationAttemptId,
        }),
      });
    }
  });

  it('new transaction replaces exact identities, preserves prior causation, and accepts explicit same or new correlation', () => {
    const root = createRootOperationIdentity(rootInput);
    const sameCorrelation = newTransactionOperation({
      previous: root,
      invocationId: 'invocation:root-2',
      transactionId: 'transaction:tx-2',
      operationAttemptId: 'operation-attempt:attempt-2',
      correlationId: root.correlationId,
      occurredAt: '2026-08-29T00:02:00.000Z',
    });
    const newCorrelation = newTransactionOperation({
      previous: sameCorrelation,
      invocationId: 'invocation:root-3',
      transactionId: 'transaction:tx-3',
      operationAttemptId: 'operation-attempt:attempt-3',
      correlationId: 'correlation:corr-2',
      occurredAt: '2026-08-29T00:03:00.000Z',
    });
    expect(sameCorrelation).toMatchObject({
      relation: 'new-transaction',
      correlationId: root.correlationId,
      causation: operationCausation({
        invocationId: root.invocationId,
        operationAttemptId: root.operationAttemptId,
      }),
    });
    expect(newCorrelation.correlationId).toBe('correlation:corr-2');
    expectCode(() => newTransactionOperation({
      ...rootInput,
      previous: root,
      transactionId: root.transactionId,
    }), 'IDENTITY_COLLISION');
  });

  it('rejects accessors, symbols, non-enumerable expected fields, prototypes, and extras', () => {
    let getterCalled = false;
    const accessor = { ...rootInput } as Record<string, unknown>;
    Object.defineProperty(accessor, 'invocationId', {
      enumerable: true,
      get: () => { getterCalled = true; return rootInput.invocationId; },
    });
    expectCode(() => createRootOperationIdentity(accessor as never), 'INVALID_INPUT');
    expect(getterCalled).toBe(false);

    const hidden = { ...rootInput };
    Object.defineProperty(hidden, 'extra', { value: true });
    expectCode(() => createRootOperationIdentity(hidden), 'INVALID_INPUT');
    expectCode(() => createRootOperationIdentity({ ...rootInput, [Symbol('extra')]: true }), 'INVALID_INPUT');
    expectCode(() => createRootOperationIdentity(Object.assign(Object.create(null), rootInput)), 'INVALID_INPUT');
  });
});
