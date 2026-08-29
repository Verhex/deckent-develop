import { describe, expect, it } from 'vitest';

import {
  Op,
  operationReference,
  type OperationReference,
} from '../../src/core/operation-catalog/index.js';
import {
  currentOperationInvocationContext,
  requireOperationInvocationContext,
  runWithOperationInvocationContext,
} from '../../src/core/operation-invocation-async-scope.js';
import {
  OperationInvocationContextError,
  childOperationInvocationContext,
  createOperationInvocationContext,
  newTransactionOperationInvocationContext,
  retryOperationInvocationContext,
  siblingOperationInvocationContext,
  validateOperationInvocationContext,
  type OperationInvocationContext,
  type OperationInvocationContextErrorCode,
} from '../../src/core/operation-invocation-context.js';
import {
  createOperationInvocationIdempotency,
  type OperationIdempotencyBinding,
} from '../../src/core/operation-invocation-idempotency.js';
import { createRootOperationIdentity } from '../../src/core/operation-invocation-identity.js';
import {
  createOperationInvocationSubject,
  type OperationInvocationSubject,
} from '../../src/core/operation-invocation-subject.js';
import {
  OperationInvocationTransportError,
  decodeOperationInvocationContext,
  encodeOperationInvocationContext,
} from '../../src/core/operation-invocation-transport.js';
import type { GlobalScopePlatform } from '../../src/core/global-scope-resolver.js';

const INSTANTS = Object.freeze({
  root: '2026-08-29T00:00:00.000Z',
  retry: '2026-08-29T00:01:00.000Z',
  child: '2026-08-29T00:02:00.000Z',
  sibling: '2026-08-29T00:03:00.000Z',
  newTransaction: '2026-08-29T03:04:00.000+03:00',
});

const RESOURCE_BY_PLATFORM: Readonly<Record<GlobalScopePlatform, string>> = Object.freeze({
  darwin: 'resource:/Users/alperen/Calisma/repo',
  linux: 'resource:/srv/uretim/repo',
  win32: 'resource:C:\\Work\\Istanbul\\repo',
  wsl: 'resource:/mnt/c/Users/Alperen/repo',
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}

interface Lifecycle {
  readonly root: OperationInvocationContext;
  readonly retry: OperationInvocationContext;
  readonly child: OperationInvocationContext;
  readonly sibling: OperationInvocationContext;
  readonly newTransaction: OperationInvocationContext;
  readonly contexts: readonly OperationInvocationContext[];
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function subject(platform: GlobalScopePlatform, suffix: string): OperationInvocationSubject {
  return createOperationInvocationSubject({
    principal: {
      id: `principal-conformance-${suffix}`,
      identityClass: 'oidc',
      assurance: 'token-verified',
      provenance: 'api',
      verifiedBy: 'oidc:conformance-issuer',
      tenantId: `principal-tenant-${suffix}`,
      role: 'operator',
    },
    tenantId: `tenant:${suffix}`,
    projectId: `project:${suffix}`,
    resource: {
      tenantId: `tenant:resource-${suffix}`,
      type: 'repository',
      id: RESOURCE_BY_PLATFORM[platform],
    },
    environmentId: `environment:${suffix}`,
    adapterId: `adapter:${platform}-${suffix}`,
    platform,
  });
}

function idempotency(
  operation: OperationReference,
  input: Readonly<{ readonly kind: 'KEYED'; readonly key: string }> | Readonly<{ readonly kind: 'NATURAL' }>,
): OperationIdempotencyBinding {
  return createOperationInvocationIdempotency({
    operation: { operationId: operation.operationId, version: operation.version },
    idempotency: input,
  });
}

function lifecycle(): Lifecycle {
  const writeOperation = operationReference(Op.FsWrite, 1);
  const readOperation = operationReference(Op.FsRead, 1);
  const rootSubject = subject('darwin', 'root');
  const rootIdempotency = idempotency(writeOperation, {
    kind: 'KEYED',
    key: 'idempotency:conformance-root',
  });
  const root = createOperationInvocationContext({
    schemaVersion: 1,
    operation: writeOperation,
    identity: createRootOperationIdentity({
      invocationId: 'invocation:conformance-root',
      transactionId: 'transaction:conformance-root',
      operationAttemptId: 'operation-attempt:conformance-root',
      correlationId: 'correlation:conformance-root',
      occurredAt: INSTANTS.root,
    }),
    subject: rootSubject,
    idempotency: rootIdempotency,
    createdAt: INSTANTS.root,
  });
  const retry = retryOperationInvocationContext({
    previous: root,
    operationAttemptId: 'operation-attempt:conformance-retry',
    occurredAt: INSTANTS.retry,
  });
  const child = childOperationInvocationContext({
    parent: retry,
    invocationId: 'invocation:conformance-child',
    operationAttemptId: 'operation-attempt:conformance-child',
    occurredAt: INSTANTS.child,
    operation: readOperation,
    subject: subject('linux', 'child'),
    idempotency: idempotency(readOperation, { kind: 'NATURAL' }),
  });
  const sibling = siblingOperationInvocationContext({
    parent: retry,
    invocationId: 'invocation:conformance-sibling',
    operationAttemptId: 'operation-attempt:conformance-sibling',
    occurredAt: INSTANTS.sibling,
    operation: writeOperation,
    subject: subject('win32', 'sibling'),
    idempotency: idempotency(writeOperation, {
      kind: 'KEYED',
      key: 'idempotency:conformance-sibling',
    }),
  });
  const newTransaction = newTransactionOperationInvocationContext({
    previous: sibling,
    invocationId: 'invocation:conformance-new-transaction',
    transactionId: 'transaction:conformance-new-transaction',
    operationAttemptId: 'operation-attempt:conformance-new-transaction',
    correlationId: 'correlation:conformance-new-transaction',
    occurredAt: INSTANTS.newTransaction,
    operation: readOperation,
    subject: subject('wsl', 'new-transaction'),
    idempotency: idempotency(readOperation, { kind: 'NATURAL' }),
  });
  return {
    root,
    retry,
    child,
    sibling,
    newTransaction,
    contexts: Object.freeze([root, retry, child, sibling, newTransaction]),
  };
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) expectDeeplyFrozen(nested);
}

function expectContextError(input: unknown, code?: OperationInvocationContextErrorCode): void {
  try {
    validateOperationInvocationContext(input);
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(OperationInvocationContextError);
    if (code !== undefined) expect((error as OperationInvocationContextError).code).toBe(code);
    return;
  }
  throw new Error('expected operation invocation context refusal');
}

function allObjectKeys(value: unknown, keys = new Set<string>()): ReadonlySet<string> {
  if (value === null || typeof value !== 'object') return keys;
  for (const key of Object.keys(value)) {
    keys.add(key);
    allObjectKeys((value as Record<string, unknown>)[key], keys);
  }
  return keys;
}

describe('operation invocation public conformance fan-in', () => {
  it('composes root, retry, child, sibling, and new-transaction retain/replace invariants', () => {
    const flow = lifecycle();

    expect(flow.root.identity).toMatchObject({ relation: 'root', causation: null });
    expect(flow.retry.operation).toEqual(flow.root.operation);
    expect(flow.retry.subject).toEqual(flow.root.subject);
    expect(flow.retry.idempotency).toEqual(flow.root.idempotency);
    expect(flow.retry.identity).toMatchObject({
      relation: 'retry',
      invocationId: flow.root.identity.invocationId,
      transactionId: flow.root.identity.transactionId,
      correlationId: flow.root.identity.correlationId,
      causation: {
        kind: 'operation',
        invocationId: flow.root.identity.invocationId,
        operationAttemptId: flow.root.identity.operationAttemptId,
      },
    });
    expect(flow.retry.identity.operationAttemptId).not.toBe(flow.root.identity.operationAttemptId);

    for (const related of [flow.child, flow.sibling]) {
      expect(related.identity.transactionId).toBe(flow.retry.identity.transactionId);
      expect(related.identity.correlationId).toBe(flow.retry.identity.correlationId);
      expect(related.identity.invocationId).not.toBe(flow.retry.identity.invocationId);
      expect(related.identity.operationAttemptId).not.toBe(flow.retry.identity.operationAttemptId);
      expect(related.identity.causation).toEqual({
        kind: 'operation',
        invocationId: flow.retry.identity.invocationId,
        operationAttemptId: flow.retry.identity.operationAttemptId,
      });
    }
    expect(flow.child.identity.relation).toBe('child');
    expect(flow.sibling.identity.relation).toBe('sibling');
    expect(flow.child.idempotency).toEqual({ kind: 'NATURAL', operation: flow.child.operation });
    expect(flow.sibling.idempotency).toEqual({
      kind: 'KEYED',
      key: 'idempotency:conformance-sibling',
    });

    expect(flow.newTransaction.identity).toMatchObject({
      relation: 'new-transaction',
      causation: {
        kind: 'operation',
        invocationId: flow.sibling.identity.invocationId,
        operationAttemptId: flow.sibling.identity.operationAttemptId,
      },
      correlationId: 'correlation:conformance-new-transaction',
    });
    expect(flow.newTransaction.identity.invocationId).not.toBe(flow.sibling.identity.invocationId);
    expect(flow.newTransaction.identity.transactionId).not.toBe(flow.sibling.identity.transactionId);
    expect(flow.newTransaction.identity.operationAttemptId)
      .not.toBe(flow.sibling.identity.operationAttemptId);
    expect([flow.root, flow.child, flow.sibling, flow.newTransaction].map(value => value.subject.platform))
      .toEqual(['darwin', 'linux', 'win32', 'wsl']);
  });

  it('round-trips every lifecycle context with exact bytes, digest, immutability, and subject facts', () => {
    const flow = lifecycle();
    const digests: string[] = [];

    for (const source of flow.contexts) {
      const first = encodeOperationInvocationContext(source);
      const second = encodeOperationInvocationContext(source);
      const envelope = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(first)) as {
        readonly contextSha256: string;
      };
      const decoded = decodeOperationInvocationContext(first);

      expect(first).toEqual(second);
      expect(encodeOperationInvocationContext(decoded)).toEqual(first);
      expect(decoded).toEqual(source);
      expect(decoded.subject.principal).toEqual(source.subject.principal);
      expect(decoded.subject.resource).toEqual(source.subject.resource);
      expect(decoded.createdAt).toBe(source.identity.occurredAt);
      expect(envelope.contextSha256).toMatch(/^[a-f0-9]{64}$/u);
      expectDeeplyFrozen(decoded);
      digests.push(envelope.contextSha256);
    }
    expect(new Set(digests).size).toBe(flow.contexts.length);
  });

  it('composes validated transported contexts through nested, concurrent, and settled async scopes', async () => {
    const flow = lifecycle();
    const decodedRoot = decodeOperationInvocationContext(encodeOperationInvocationContext(flow.root));
    const decodedChild = decodeOperationInvocationContext(encodeOperationInvocationContext(flow.child));
    const decodedSibling = decodeOperationInvocationContext(encodeOperationInvocationContext(flow.sibling));
    const decodedNewTransaction = decodeOperationInvocationContext(
      encodeOperationInvocationContext(flow.newTransaction),
    );

    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
    await runWithOperationInvocationContext(decodedRoot, async () => {
      expect(requireOperationInvocationContext()).toEqual(decodedRoot);
      await runWithOperationInvocationContext(decodedChild, async () => {
        await Promise.resolve();
        expect(requireOperationInvocationContext()).toEqual(decodedChild);
      });
      expect(requireOperationInvocationContext()).toEqual(decodedRoot);
    });

    const leftReady = deferred<void>();
    const rightReady = deferred<void>();
    const release = deferred<void>();
    const left = runWithOperationInvocationContext(decodedSibling, async () => {
      leftReady.resolve(undefined);
      await release.promise;
      return requireOperationInvocationContext().identity.invocationId;
    });
    const right = runWithOperationInvocationContext(decodedNewTransaction, async () => {
      rightReady.resolve(undefined);
      await release.promise;
      return requireOperationInvocationContext().identity.invocationId;
    });
    await Promise.all([leftReady.promise, rightReady.promise]);
    release.resolve(undefined);
    await expect(Promise.all([left, right])).resolves.toEqual([
      decodedSibling.identity.invocationId,
      decodedNewTransaction.identity.invocationId,
    ]);

    const detachedGate = deferred<void>();
    let detached!: Promise<ReturnType<typeof currentOperationInvocationContext>>;
    await runWithOperationInvocationContext(decodedRoot, async () => {
      detached = (async () => {
        await detachedGate.promise;
        return currentOperationInvocationContext();
      })();
    });
    detachedGate.resolve(undefined);
    expect(await detached).toEqual({ state: 'INVALIDATED' });
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('rejects cross-contract catalog, idempotency, identity, schema, and JSON adversaries', () => {
    const root = lifecycle().root;
    const valid = plain(root) as Record<string, unknown>;
    const { createdAt: _createdAt, ...missingCreatedAt } = plain(root);
    const selfCausationIdentity = {
      ...plain(root.identity),
      relation: 'retry',
      causation: {
        kind: 'operation',
        invocationId: root.identity.invocationId,
        operationAttemptId: root.identity.operationAttemptId,
      },
    };
    const cases: ReadonlyArray<readonly [string, unknown, OperationInvocationContextErrorCode]> = [
      ['unsupported schema', { ...valid, schemaVersion: 2 }, 'UNSUPPORTED_SCHEMA_VERSION'],
      ['unknown operation', {
        ...valid,
        operation: { operationId: 'op.unknown', version: 1, key: 'op.unknown@1' },
      }, 'INVALID_OPERATION'],
      ['catalog version drift', {
        ...valid,
        operation: { operationId: Op.FsWrite, version: 2, key: `${Op.FsWrite}@2` },
      }, 'INVALID_OPERATION'],
      ['operation/idempotency mismatch', {
        ...valid,
        operation: operationReference(Op.FsRead, 1),
      }, 'INVALID_IDEMPOTENCY'],
      ['createdAt identity mismatch', {
        ...valid,
        createdAt: INSTANTS.retry,
      }, 'IDENTITY_BINDING_MISMATCH'],
      ['self causation', { ...valid, identity: selfCausationIdentity }, 'INVALID_IDENTITY'],
      ['wrong identity namespace', {
        ...valid,
        identity: { ...plain(root.identity), invocationId: root.identity.transactionId },
      }, 'INVALID_IDENTITY'],
      ['extra schema key', { ...valid, extra: true }, 'INVALID_CONTEXT'],
      ['missing schema key', missingCreatedAt, 'INVALID_CONTEXT'],
      ['unsafe number', { ...valid, schemaVersion: Number.MAX_SAFE_INTEGER + 1 }, 'INVALID_JSON_VALUE'],
      ['nonfinite number', { ...valid, schemaVersion: Number.POSITIVE_INFINITY }, 'INVALID_JSON_VALUE'],
    ];
    for (const [_label, input, code] of cases) expectContextError(input, code);

    const cyclic = plain(root) as Record<string, unknown>;
    const cyclicSubject = cyclic.subject as Record<string, unknown>;
    cyclicSubject.cycle = cyclicSubject;
    expectContextError(cyclic, 'INVALID_JSON_VALUE');

    let getterCalled = false;
    const accessor = plain(root) as Record<string, unknown>;
    Object.defineProperty(accessor, 'createdAt', {
      enumerable: true,
      get: () => { getterCalled = true; return INSTANTS.root; },
    });
    expectContextError(accessor, 'INVALID_JSON_VALUE');
    expect(getterCalled).toBe(false);

    const withToJson = { ...plain(root), toJSON: () => plain(root) };
    expectContextError(withToJson, 'INVALID_JSON_VALUE');
    expectContextError(Object.assign(Object.create(null), plain(root)), 'INVALID_JSON_VALUE');
    expectContextError({ ...plain(root), [Symbol('secret')]: true }, 'INVALID_JSON_VALUE');
    const hidden = plain(root);
    Object.defineProperty(hidden, 'hidden', { value: true });
    expectContextError(hidden, 'INVALID_JSON_VALUE');

    const catalogSpoof = {
      ...plain(root),
      operation: { operationId: Op.FsWrite, version: 2, key: `${Op.FsWrite}@2` },
    };
    expect(() => encodeOperationInvocationContext(catalogSpoof)).toThrowError(expect.objectContaining({
      name: 'OperationInvocationTransportError',
      code: 'CONTEXT_INVALID',
    } satisfies Partial<OperationInvocationTransportError>));
  });

  it('keeps permission, approval, enforcement, dispatch, effect, and secret outcomes unrepresentable', () => {
    const flow = lifecycle();
    const forbidden = [
      'permission',
      'approval',
      'grant',
      'enforcement',
      'authorityMode',
      'dispatch',
      'effect',
      'receipt',
      'secret',
      'metadata',
    ] as const;

    for (const key of forbidden) {
      const rootExtra = { ...plain(flow.root), [key]: 'forbidden' };
      const subjectExtra = {
        ...plain(flow.root),
        subject: { ...plain(flow.root.subject), [key]: 'forbidden' },
      };
      const identityExtra = {
        ...plain(flow.root),
        identity: { ...plain(flow.root.identity), [key]: 'forbidden' },
      };
      const idempotencyExtra = {
        ...plain(flow.root),
        idempotency: { ...plain(flow.root.idempotency), [key]: 'forbidden' },
      };
      for (const hostile of [rootExtra, subjectExtra, identityExtra, idempotencyExtra]) {
        expectContextError(hostile);
      }
    }

    for (const source of flow.contexts) {
      const decoded = decodeOperationInvocationContext(encodeOperationInvocationContext(source));
      const outputKeys = allObjectKeys(decoded);
      for (const key of forbidden) expect(outputKeys.has(key)).toBe(false);
    }
  });
});
