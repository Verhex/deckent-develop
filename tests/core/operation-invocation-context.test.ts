import { describe, expect, it } from 'vitest';

import {
  Op,
  operationReference,
} from '../../src/core/operation-catalog/index.js';
import {
  OperationInvocationContextError,
  childOperationInvocationContext,
  createOperationInvocationContext,
  newTransactionOperationInvocationContext,
  retryOperationInvocationContext,
  siblingOperationInvocationContext,
  validateOperationInvocationContext,
} from '../../src/core/operation-invocation-context.js';
import {
  createRootOperationIdentity,
} from '../../src/core/operation-invocation-identity.js';

const CREATED_AT = '2026-08-29T00:00:00.000Z';

function rootIdentity() {
  return createRootOperationIdentity({
    invocationId: 'invocation:root-1',
    transactionId: 'transaction:tx-1',
    operationAttemptId: 'operation-attempt:attempt-1',
    correlationId: 'correlation:corr-1',
    occurredAt: CREATED_AT,
  });
}

function subject() {
  return {
    principal: {
      id: 'principal-01',
      identityClass: 'oidc',
      assurance: 'token-verified',
      provenance: 'api',
      verifiedBy: 'oidc:issuer-a',
      tenantId: 'principal-tenant',
      role: 'operator',
    },
    tenantId: 'tenant:invocation',
    projectId: 'project:project-01',
    resource: { tenantId: 'tenant:resource', type: 'repository', id: 'resource:repo-01' },
    environmentId: 'environment:production',
    adapterId: 'adapter:filesystem-01',
    platform: 'linux',
  };
}

function keyedContextInput(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    operation: { ...operationReference(Op.FsWrite, 1) },
    identity: { ...rootIdentity() },
    subject: subject(),
    idempotency: { kind: 'KEYED', key: 'idempotency:request-01' },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function expectCode(action: () => unknown, code: OperationInvocationContextError['code']): void {
  expect(action).toThrow(expect.objectContaining({ code }));
}

describe('operation invocation context schema v1', () => {
  it('binds every required dimension in one exact policy-neutral envelope', () => {
    const context = createOperationInvocationContext(keyedContextInput());
    expect(context).toEqual({
      schemaVersion: 1,
      operation: { operationId: Op.FsWrite, version: 1, key: 'op.fs.write@1' },
      identity: rootIdentity(),
      subject: subject(),
      idempotency: { kind: 'KEYED', key: 'idempotency:request-01' },
      createdAt: CREATED_AT,
    });
    expect(Object.keys(context).sort()).toEqual([
      'createdAt', 'idempotency', 'identity', 'operation', 'schemaVersion', 'subject',
    ]);
    for (const forbidden of ['allow', 'deny', 'approval', 'grant', 'permission', 'effect', 'dispatch', 'metadata']) {
      expect(context).not.toHaveProperty(forbidden);
    }
  });

  it('deep-copies and deeply freezes every nested authority-bearing value', () => {
    const input = keyedContextInput();
    const context = createOperationInvocationContext(input);
    (input.operation as { operationId: string }).operationId = Op.FsRead;
    (input.identity as { invocationId: string }).invocationId = 'invocation:mutated';
    (input.subject.resource as { id: string }).id = 'resource:mutated';
    (input.idempotency as { key: string }).key = 'idempotency:mutated';

    expect(context.operation.operationId).toBe(Op.FsWrite);
    expect(context.identity.invocationId).toBe('invocation:root-1');
    expect(context.subject.resource.id).toBe('resource:repo-01');
    expect(context.idempotency).toEqual({ kind: 'KEYED', key: 'idempotency:request-01' });
    for (const value of [
      context,
      context.operation,
      context.identity,
      context.subject,
      context.subject.principal,
      context.subject.resource,
      context.idempotency,
    ]) expect(Object.isFrozen(value)).toBe(true);
    expect(() => { (context.subject.resource as { id: string }).id = 'resource:changed'; }).toThrow();
  });

  it('round-trips the canonical NATURAL binding and rejects operation drift', () => {
    const operation = operationReference(Op.FsRead, 1);
    const natural = createOperationInvocationContext(keyedContextInput({
      operation: { ...operation },
      idempotency: { kind: 'NATURAL', operation: { ...operation } },
    }));
    expect(natural.idempotency).toEqual({ kind: 'NATURAL', operation });
    if (natural.idempotency.kind === 'NATURAL') {
      expect(Object.isFrozen(natural.idempotency.operation)).toBe(true);
    }
    expect(validateOperationInvocationContext(natural)).toEqual(natural);

    expectCode(() => createOperationInvocationContext(keyedContextInput({
      operation: { ...operation },
      idempotency: { kind: 'NATURAL', operation: operationReference(Op.FsWrite, 1) },
    })), 'INVALID_IDEMPOTENCY');
  });

  it('constructs root, retry, child, sibling, and new-transaction contexts through exact lifecycle APIs', () => {
    const root = createOperationInvocationContext(keyedContextInput());
    const retry = retryOperationInvocationContext({
      previous: root,
      operationAttemptId: 'operation-attempt:retry-1',
      occurredAt: '2026-08-29T00:01:00.000Z',
    });
    const readOperation = operationReference(Op.FsRead, 1);
    const child = childOperationInvocationContext({
      parent: retry,
      invocationId: 'invocation:child-1',
      operationAttemptId: 'operation-attempt:child-1',
      occurredAt: '2026-08-29T00:02:00.000Z',
      operation: readOperation,
      subject: root.subject,
      idempotency: { kind: 'NATURAL', operation: readOperation },
    });
    const sibling = siblingOperationInvocationContext({
      parent: retry,
      invocationId: 'invocation:sibling-1',
      operationAttemptId: 'operation-attempt:sibling-1',
      occurredAt: '2026-08-29T00:03:00.000Z',
      operation: root.operation,
      subject: root.subject,
      idempotency: root.idempotency,
    });
    const next = newTransactionOperationInvocationContext({
      previous: child,
      invocationId: 'invocation:next-1',
      transactionId: 'transaction:tx-2',
      operationAttemptId: 'operation-attempt:next-1',
      correlationId: child.identity.correlationId,
      occurredAt: '2026-08-29T00:04:00.000Z',
      operation: root.operation,
      subject: root.subject,
      idempotency: root.idempotency,
    });

    expect([root, retry, child, sibling, next].map(context => context.identity.relation))
      .toEqual(['root', 'retry', 'child', 'sibling', 'new-transaction']);
    expect(retry.operation).toEqual(root.operation);
    expect(retry.idempotency).toEqual(root.idempotency);
    expect(retry.subject).toEqual(root.subject);
    expect(child.operation).toEqual(readOperation);
    expect(child.idempotency).toEqual({ kind: 'NATURAL', operation: readOperation });
    expect(child.identity.transactionId).toBe(retry.identity.transactionId);
    expect(sibling.identity.correlationId).toBe(retry.identity.correlationId);
    expect(next.identity.causation).toEqual({
      kind: 'operation',
      invocationId: child.identity.invocationId,
      operationAttemptId: child.identity.operationAttemptId,
    });
  });

  it('separates structural transport validation from lifecycle construction authority', () => {
    const root = createOperationInvocationContext(keyedContextInput());
    const retry = retryOperationInvocationContext({
      previous: root,
      operationAttemptId: 'operation-attempt:retry-transport',
      occurredAt: '2026-08-29T00:05:00.000Z',
    });
    const readOperation = operationReference(Op.FsRead, 1);
    const structurallyValidButUnauthorizedTransition = {
      ...retry,
      operation: readOperation,
      idempotency: { kind: 'NATURAL', operation: readOperation },
    };

    const transported = validateOperationInvocationContext(structurallyValidButUnauthorizedTransition);
    expect(transported.identity.relation).toBe('retry');
    expect(transported.operation).toEqual(readOperation);
    expectCode(
      () => createOperationInvocationContext(structurallyValidButUnauthorizedTransition),
      'ROOT_CONTEXT_REQUIRED',
    );
    expectCode(() => retryOperationInvocationContext({
      previous: root,
      operationAttemptId: 'operation-attempt:retry-2',
      occurredAt: '2026-08-29T00:06:00.000Z',
      operation: readOperation,
    } as never), 'INVALID_TRANSITION_INPUT');
    expectCode(() => retryOperationInvocationContext({
      previous: root,
      operationAttemptId: root.identity.operationAttemptId,
      occurredAt: '2026-08-29T00:06:00.000Z',
    }), 'INVALID_TRANSITION');
  });

  it.each([
    ['missing key', (() => { const value = keyedContextInput(); delete (value as { subject?: unknown }).subject; return value; })(), 'INVALID_CONTEXT'],
    ['extra key', { ...keyedContextInput(), approval: 'approved' }, 'INVALID_CONTEXT'],
    ['unsupported schema', keyedContextInput({ schemaVersion: 2 }), 'UNSUPPORTED_SCHEMA_VERSION'],
    ['catalog version drift', keyedContextInput({ operation: { operationId: Op.FsWrite, version: 2, key: 'op.fs.write@2' } }), 'INVALID_OPERATION'],
    ['operation key drift', keyedContextInput({ operation: { operationId: Op.FsWrite, version: 1, key: 'op.fs.read@1' } }), 'INVALID_OPERATION'],
    ['wrong identity namespace', keyedContextInput({ identity: { ...rootIdentity(), invocationId: 'transaction:tx-1' } }), 'INVALID_IDENTITY'],
    ['catalog idempotency mismatch', keyedContextInput({ idempotency: { kind: 'NATURAL', operation: operationReference(Op.FsWrite, 1) } }), 'INVALID_IDEMPOTENCY'],
    ['malformed timestamp', keyedContextInput({ createdAt: '2026-02-30T00:00:00Z' }), 'INVALID_CREATED_AT'],
    ['identity timestamp mismatch', keyedContextInput({ createdAt: '2026-08-29T00:00:01.000Z' }), 'IDENTITY_BINDING_MISMATCH'],
  ] as const)('fails closed for %s', (_label, input, code) => {
    expectCode(() => createOperationInvocationContext(input), code);
  });

  it('rejects cycles, accessors, toJSON, prototypes, symbols, and unsafe numbers before copying', () => {
    const cyclic = keyedContextInput() as Record<string, unknown>;
    cyclic.loop = cyclic;
    expectCode(() => createOperationInvocationContext(cyclic), 'INVALID_JSON_VALUE');

    let getterCalled = false;
    const accessor = keyedContextInput();
    Object.defineProperty(accessor, 'createdAt', {
      enumerable: true,
      get: () => { getterCalled = true; return CREATED_AT; },
    });
    expectCode(() => createOperationInvocationContext(accessor), 'INVALID_JSON_VALUE');
    expect(getterCalled).toBe(false);

    expectCode(() => createOperationInvocationContext(keyedContextInput({
      subject: { ...subject(), toJSON: () => subject() },
    })), 'INVALID_JSON_VALUE');
    expectCode(() => createOperationInvocationContext(Object.assign(Object.create(null), keyedContextInput())), 'INVALID_JSON_VALUE');
    expectCode(() => createOperationInvocationContext({ ...keyedContextInput(), [Symbol('secret')]: true }), 'INVALID_JSON_VALUE');
    expectCode(() => createOperationInvocationContext(keyedContextInput({
      operation: { operationId: Op.FsWrite, version: Number.POSITIVE_INFINITY, key: 'op.fs.write@1' },
    })), 'INVALID_JSON_VALUE');
    expectCode(() => createOperationInvocationContext(keyedContextInput({
      operation: { operationId: Op.FsWrite, version: Number.MAX_SAFE_INTEGER + 1, key: 'op.fs.write@1' },
    })), 'INVALID_JSON_VALUE');
  });
});
