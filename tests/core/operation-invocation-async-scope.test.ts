import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  Op,
  operationReference,
} from '../../src/core/operation-catalog/index.js';
import {
  OperationInvocationAsyncScopeError,
  currentOperationInvocationContext,
  requireOperationInvocationContext,
  runWithOperationInvocationContext,
} from '../../src/core/operation-invocation-async-scope.js';
import {
  OperationInvocationContextError,
  createOperationInvocationContext,
  type OperationInvocationContext,
} from '../../src/core/operation-invocation-context.js';
import { createRootOperationIdentity } from '../../src/core/operation-invocation-identity.js';

const CREATED_AT = '2026-08-29T00:00:00.000Z';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function rootContext(suffix: string): OperationInvocationContext {
  return createOperationInvocationContext({
    schemaVersion: 1,
    operation: operationReference(Op.FsWrite, 1),
    identity: createRootOperationIdentity({
      invocationId: `invocation:${suffix}`,
      transactionId: `transaction:${suffix}`,
      operationAttemptId: `operation-attempt:${suffix}`,
      correlationId: `correlation:${suffix}`,
      occurredAt: CREATED_AT,
    }),
    subject: {
      principal: {
        id: `principal-${suffix}`,
        identityClass: 'oidc',
        assurance: 'token-verified',
        provenance: 'api',
        verifiedBy: 'oidc:issuer-a',
        tenantId: `principal-tenant-${suffix}`,
        role: 'operator',
      },
      tenantId: `tenant:${suffix}`,
      projectId: `project:${suffix}`,
      resource: {
        tenantId: `tenant:resource-${suffix}`,
        type: 'repository',
        id: `resource:${suffix}`,
      },
      environmentId: 'environment:production',
      adapterId: 'adapter:filesystem',
      platform: 'linux',
    },
    idempotency: { kind: 'KEYED', key: `idempotency:${suffix}` },
    createdAt: CREATED_AT,
  });
}

function scopeErrorCode(action: () => unknown): OperationInvocationAsyncScopeError['code'] {
  try {
    action();
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(OperationInvocationAsyncScopeError);
    return (error as OperationInvocationAsyncScopeError).code;
  }
  throw new Error('expected operation invocation async-scope error');
}

describe('operation invocation async scope', () => {
  it('reports frozen explicit absence and a distinct required-context error', () => {
    const lookup = currentOperationInvocationContext();
    expect(lookup).toEqual({ state: 'ABSENT' });
    expect(Object.isFrozen(lookup)).toBe(true);
    expect(scopeErrorCode(() => requireOperationInvocationContext()))
      .toBe('OPERATION_INVOCATION_CONTEXT_ABSENT');
  });

  it('validates context and callback before entering storage', () => {
    let called = false;
    const spoof = { ...rootContext('spoof'), schemaVersion: 2 };
    expect(() => runWithOperationInvocationContext(spoof, () => { called = true; }))
      .toThrowError(OperationInvocationContextError);
    expect(called).toBe(false);
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });

    expect(scopeErrorCode(() => runWithOperationInvocationContext(
      rootContext('invalid-callback'),
      null as never,
    ))).toBe('INVALID_SCOPE_CALLBACK');
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('preserves synchronous return and throw semantics, then restores absence', () => {
    const context = rootContext('sync');
    const marker = Object.freeze({ value: 'sync-result' });
    const result = runWithOperationInvocationContext(context, () => {
      const lookup = currentOperationInvocationContext();
      expect(lookup.state).toBe('ACTIVE');
      if (lookup.state === 'ACTIVE') {
        expect(lookup.context).toEqual(context);
        expect(Object.isFrozen(lookup)).toBe(true);
        expect(Object.isFrozen(lookup.context)).toBe(true);
      }
      expect(requireOperationInvocationContext()).toEqual(context);
      return marker;
    });
    expectTypeOf(result).toEqualTypeOf<typeof marker>();
    expect(result).toBe(marker);
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });

    const sentinel = new Error('sync-sentinel');
    expect(() => runWithOperationInvocationContext(context, () => { throw sentinel; })).toThrow(sentinel);
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('preserves asynchronous resolution and rejection across awaited work', async () => {
    const context = rootContext('async');
    const ready = deferred<void>();
    const release = deferred<void>();
    const detachedObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const running = runWithOperationInvocationContext(context, async () => {
      expect(requireOperationInvocationContext()).toEqual(context);
      ready.resolve(undefined);
      await release.promise;
      expect(requireOperationInvocationContext()).toEqual(context);
      queueMicrotask(() => detachedObservation.resolve(currentOperationInvocationContext()));
      return 'async-result';
    });
    expectTypeOf(running).toEqualTypeOf<Promise<string>>();
    await ready.promise;
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
    release.resolve(undefined);
    await expect(running).resolves.toBe('async-result');
    expect(await detachedObservation.promise).toEqual({ state: 'INVALIDATED' });
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });

    const sentinel = new Error('async-sentinel');
    const rejected = runWithOperationInvocationContext(context, async () => {
      await Promise.resolve();
      expect(requireOperationInvocationContext()).toEqual(context);
      throw sentinel;
    });
    await expect(rejected).rejects.toBe(sentinel);
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('refuses native promises created outside observation whether settled or pending', async () => {
    const context = rootContext('external-native');
    const alreadySettled = Promise.resolve('external-result');
    await alreadySettled;
    const queuedObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const nextTickObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();

    const externalResult = runWithOperationInvocationContext(context, () => {
      queueMicrotask(() => queuedObservation.resolve(currentOperationInvocationContext()));
      process.nextTick(() => nextTickObservation.resolve(currentOperationInvocationContext()));
      return alreadySettled;
    });
    expect(externalResult).not.toBe(alreadySettled);
    await expect(externalResult).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'UNOBSERVABLE_SCOPE_PROMISE',
    });
    expect(await queuedObservation.promise).toEqual({ state: 'INVALIDATED' });
    expect(await nextTickObservation.promise).toEqual({ state: 'INVALIDATED' });

    const pending = deferred<string>();
    const pendingQueuedObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const pendingNextTickObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const pendingResult = runWithOperationInvocationContext(context, () => {
      queueMicrotask(() => pendingQueuedObservation.resolve(currentOperationInvocationContext()));
      process.nextTick(() => pendingNextTickObservation.resolve(currentOperationInvocationContext()));
      return pending.promise;
    });
    await expect(pendingResult).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'UNOBSERVABLE_SCOPE_PROMISE',
    });
    expect(await pendingQueuedObservation.promise).toEqual({ state: 'INVALIDATED' });
    expect(await pendingNextTickObservation.promise).toEqual({ state: 'INVALIDATED' });
    pending.resolve('external-pending-result');
    await expect(pending.promise).resolves.toBe('external-pending-result');
  });

  it('invalidates queued continuations for an observed already-settled native promise', async () => {
    const context = rootContext('observed-native');
    const insideQueuedObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const insideNextTickObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const insideResult = runWithOperationInvocationContext(context, () => {
      queueMicrotask(() => insideQueuedObservation.resolve(currentOperationInvocationContext()));
      process.nextTick(() => insideNextTickObservation.resolve(currentOperationInvocationContext()));
      return Promise.resolve('inside-result');
    });
    await expect(insideResult).resolves.toBe('inside-result');
    expect(await insideQueuedObservation.promise).toEqual({ state: 'INVALIDATED' });
    expect(await insideNextTickObservation.promise).toEqual({ state: 'INVALIDATED' });
  });

  it('rejects target, self, and mutual thenable cycles with bounded typed settlement', async () => {
    const context = rootContext('thenable-cycle');
    const detachedGate = deferred<void>();
    let detached!: Promise<ReturnType<typeof currentOperationInvocationContext>>;
    let resolveWithTarget!: (value: unknown) => void;
    const targetCycle = {
      then(resolve: (value: unknown) => void): void {
        resolveWithTarget = resolve;
        detached = (async () => {
          await detachedGate.promise;
          return currentOperationInvocationContext();
        })();
      },
    } as unknown as PromiseLike<string>;
    const targetResult = runWithOperationInvocationContext(context, () => targetCycle);
    resolveWithTarget(targetResult);
    await expect(targetResult).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_CYCLE',
    });
    detachedGate.resolve(undefined);
    expect(await detached).toEqual({ state: 'INVALIDATED' });

    let selfCycle!: PromiseLike<string>;
    selfCycle = {
      then(resolve: (value: unknown) => void): void { resolve(selfCycle); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => selfCycle)).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_CYCLE',
    });

    let leftReads = 0;
    let rightReads = 0;
    const left: Record<string, unknown> = {};
    const right: Record<string, unknown> = {};
    Object.defineProperty(left, 'then', {
      configurable: true,
      get() {
        leftReads += 1;
        return (resolve: (value: unknown) => void) => resolve(right);
      },
    });
    Object.defineProperty(right, 'then', {
      configurable: true,
      get() {
        rightReads += 1;
        return (resolve: (value: unknown) => void) => resolve(left);
      },
    });
    await expect(runWithOperationInvocationContext(
      context,
      () => left as unknown as PromiseLike<string>,
    )).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_CYCLE',
    });
    expect(leftReads).toBe(1);
    expect(rightReads).toBe(1);
  });

  it('reads each hostile then getter once and propagates a getter throw', async () => {
    const context = rootContext('thenable-getter');
    let rootLeafReads = 0;
    const rootLeaf: Record<string, unknown> = {};
    Object.defineProperty(rootLeaf, 'then', {
      get() {
        rootLeafReads += 1;
        return null;
      },
    });
    expect(runWithOperationInvocationContext(context, () => rootLeaf)).toBe(rootLeaf);
    expect(rootLeafReads).toBe(1);

    let changingReads = 0;
    const changing: Record<string, unknown> = {};
    Object.defineProperty(changing, 'then', {
      configurable: true,
      get() {
        changingReads += 1;
        if (changingReads > 1) throw new Error('then getter was read twice');
        return (resolve: (value: string) => void) => resolve('getter-result');
      },
    });
    const changingRoot = {
      then(resolve: (value: unknown) => void): void { resolve(changing); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => changingRoot))
      .resolves.toBe('getter-result');
    expect(changingReads).toBe(1);

    let nonCallableReads = 0;
    const nonCallable: Record<string, unknown> = {};
    Object.defineProperty(nonCallable, 'then', {
      get() {
        nonCallableReads += 1;
        return 42;
      },
    });
    const nonCallableRoot = {
      then(resolve: (value: unknown) => void): void { resolve(nonCallable); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => nonCallableRoot)).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_UNREPRESENTABLE_VALUE',
    });
    expect(nonCallableReads).toBe(1);

    let changingLeafReads = 0;
    const getterSideEffects: string[] = [];
    const changingLeaf: Record<string, unknown> = {};
    Object.defineProperty(changingLeaf, 'then', {
      get() {
        changingLeafReads += 1;
        getterSideEffects.push(`read-${changingLeafReads}`);
        return changingLeafReads === 1
          ? false
          : (resolve: (value: string) => void) => resolve('must-not-run');
      },
    });
    const changingLeafRoot = {
      then(resolve: (value: unknown) => void): void { resolve(changingLeaf); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => changingLeafRoot)).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_UNREPRESENTABLE_VALUE',
    });
    expect(changingLeafReads).toBe(1);
    expect(getterSideEffects).toEqual(['read-1']);

    const thrown = new Error('then-getter-sentinel');
    let throwingReads = 0;
    const throwing: Record<string, unknown> = {};
    Object.defineProperty(throwing, 'then', {
      get(): never {
        throwingReads += 1;
        throw thrown;
      },
    });
    const throwingRoot = {
      then(resolve: (value: unknown) => void): void { resolve(throwing); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => throwingRoot)).rejects.toBe(thrown);
    expect(throwingReads).toBe(1);
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('inspects Proxy-backed then values exactly once without triggering introspection traps', async () => {
    const context = rootContext('thenable-proxy');
    let transparentGets = 0;
    const transparent = new Proxy<Record<string, unknown>>({}, {
      get(_target, key) {
        if (key !== 'then') return undefined;
        transparentGets += 1;
        if (transparentGets > 1) throw new Error('transparent proxy then was read twice');
        return false;
      },
      getOwnPropertyDescriptor(): never {
        throw new Error('transparent proxy descriptor trap must not run');
      },
      getPrototypeOf(): never {
        throw new Error('transparent proxy prototype trap must not run');
      },
    });
    const transparentRoot = {
      then(resolve: (value: unknown) => void): void { resolve(transparent); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => transparentRoot)).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_UNREPRESENTABLE_VALUE',
    });
    expect(transparentGets).toBe(1);

    let inheritedGets = 0;
    const proxyPrototype = new Proxy<Record<string, unknown>>({}, {
      get(_target, key) {
        if (key !== 'then') return undefined;
        inheritedGets += 1;
        if (inheritedGets > 1) throw new Error('proxy prototype then was read twice');
        return null;
      },
      getOwnPropertyDescriptor(): never {
        throw new Error('proxy prototype descriptor trap must not run');
      },
      getPrototypeOf(): never {
        throw new Error('proxy prototype traversal trap must not run');
      },
    });
    const inherited = Object.create(proxyPrototype) as Record<string, unknown>;
    const inheritedRoot = {
      then(resolve: (value: unknown) => void): void { resolve(inherited); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => inheritedRoot)).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_UNREPRESENTABLE_VALUE',
    });
    expect(inheritedGets).toBe(1);

    let callableGets = 0;
    const callable = new Proxy<Record<string, unknown>>({}, {
      get(_target, key) {
        if (key !== 'then') return undefined;
        callableGets += 1;
        if (callableGets > 1) throw new Error('callable proxy then was read twice');
        return (resolve: (value: string) => void) => resolve('proxy-callable-result');
      },
      getOwnPropertyDescriptor(): never {
        throw new Error('callable proxy descriptor trap must not run');
      },
      getPrototypeOf(): never {
        throw new Error('callable proxy prototype trap must not run');
      },
    });
    const callableRoot = {
      then(resolve: (value: unknown) => void): void { resolve(callable); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => callableRoot))
      .resolves.toBe('proxy-callable-result');
    expect(callableGets).toBe(1);

    const thrown = new Error('proxy-get-sentinel');
    let throwingGets = 0;
    const throwing = new Proxy<Record<string, unknown>>({}, {
      get(_target, key): unknown {
        if (key !== 'then') return undefined;
        throwingGets += 1;
        throw thrown;
      },
      getOwnPropertyDescriptor(): never {
        throw new Error('throwing proxy descriptor trap must not run');
      },
      getPrototypeOf(): never {
        throw new Error('throwing proxy prototype trap must not run');
      },
    });
    const throwingRoot = {
      then(resolve: (value: unknown) => void): void { resolve(throwing); },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => throwingRoot)).rejects.toBe(thrown);
    expect(throwingGets).toBe(1);
  });

  it('adopts a deep finite synchronous chain without recursion and bounds an endless chain', async () => {
    const context = rootContext('thenable-depth');
    const depth = 4_096;
    const nodes = Array.from({ length: depth }, () => ({} as Record<string, unknown>));
    let getterReads = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      const next = index + 1 === nodes.length ? 'deep-result' : nodes[index + 1]!;
      Object.defineProperty(nodes[index]!, 'then', {
        get() {
          getterReads += 1;
          return (resolve: (value: unknown) => void) => resolve(next);
        },
      });
    }
    await expect(runWithOperationInvocationContext(
      context,
      () => nodes[0] as unknown as PromiseLike<string>,
    )).resolves.toBe('deep-result');
    expect(getterReads).toBe(depth);

    let endlessSteps = 0;
    const endless = (): PromiseLike<never> => ({
      then(resolve: (value: unknown) => void): void {
        endlessSteps += 1;
        resolve(endless());
      },
    }) as unknown as PromiseLike<never>;
    await expect(runWithOperationInvocationContext(context, endless)).rejects.toMatchObject({
      name: 'OperationInvocationAsyncScopeError',
      code: 'THENABLE_ADOPTION_LIMIT',
    });
    expect(endlessSteps).toBeGreaterThan(depth);
    expect(endlessSteps).toBeLessThan(20_000);
  });

  it('restores an active outer scope after nested success and rejection', async () => {
    const outer = rootContext('outer');
    const inner = rootContext('inner');
    await runWithOperationInvocationContext(outer, async () => {
      expect(requireOperationInvocationContext()).toEqual(outer);
      await runWithOperationInvocationContext(inner, async () => {
        await Promise.resolve();
        expect(requireOperationInvocationContext()).toEqual(inner);
      });
      expect(requireOperationInvocationContext()).toEqual(outer);

      const sentinel = new Error('inner-sentinel');
      await expect(runWithOperationInvocationContext(inner, async () => {
        expect(requireOperationInvocationContext()).toEqual(inner);
        throw sentinel;
      })).rejects.toBe(sentinel);
      expect(requireOperationInvocationContext()).toEqual(outer);
    });
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('isolates concurrent scopes while their settlements interleave', async () => {
    const left = rootContext('concurrent-left');
    const right = rootContext('concurrent-right');
    const leftReady = deferred<void>();
    const rightReady = deferred<void>();
    const releaseLeft = deferred<void>();
    const releaseRight = deferred<void>();

    const leftRun = runWithOperationInvocationContext(left, async () => {
      expect(requireOperationInvocationContext()).toEqual(left);
      leftReady.resolve(undefined);
      await releaseLeft.promise;
      expect(requireOperationInvocationContext()).toEqual(left);
      return 'left';
    });
    const rightRun = runWithOperationInvocationContext(right, async () => {
      expect(requireOperationInvocationContext()).toEqual(right);
      rightReady.resolve(undefined);
      await releaseRight.promise;
      expect(requireOperationInvocationContext()).toEqual(right);
      return 'right';
    });

    await Promise.all([leftReady.promise, rightReady.promise]);
    releaseLeft.resolve(undefined);
    await expect(leftRun).resolves.toBe('left');
    releaseRight.resolve(undefined);
    await expect(rightRun).resolves.toBe('right');
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('invalidates detached continuations after success or rejection without exposing context', async () => {
    const successful = rootContext('detached-success');
    const timerObservation = new Promise<{
      readonly lookup: ReturnType<typeof currentOperationInvocationContext>;
      readonly requiredCode: OperationInvocationAsyncScopeError['code'];
    }>((resolve) => {
      runWithOperationInvocationContext(successful, () => {
        setImmediate(() => {
          resolve({
            lookup: currentOperationInvocationContext(),
            requiredCode: scopeErrorCode(() => requireOperationInvocationContext()),
          });
        });
      });
    });
    const timerResult = await timerObservation;
    expect(timerResult.lookup).toEqual({ state: 'INVALIDATED' });
    expect(timerResult.lookup).not.toHaveProperty('context');
    expect(Object.isFrozen(timerResult.lookup)).toBe(true);
    expect(timerResult.requiredCode).toBe('OPERATION_INVOCATION_CONTEXT_INVALIDATED');

    const rejectedContext = rootContext('detached-rejection');
    const detachedGate = deferred<void>();
    let detached!: Promise<ReturnType<typeof currentOperationInvocationContext>>;
    const sentinel = new Error('detached-rejection-sentinel');
    const rejected = runWithOperationInvocationContext(rejectedContext, async () => {
      detached = (async () => {
        await detachedGate.promise;
        return currentOperationInvocationContext();
      })();
      throw sentinel;
    });
    await expect(rejected).rejects.toBe(sentinel);
    detachedGate.resolve(undefined);
    const rejectedLookup = await detached;
    expect(rejectedLookup).toEqual({ state: 'INVALIDATED' });
    expect(rejectedLookup).not.toHaveProperty('context');
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });

  it('assimilates hostile thenables once and invalidates after their terminal result', async () => {
    const context = rootContext('thenable');
    const queuedObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const nextTickObservation = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const lateError = new Error('late-rejection');
    const thenable = {
      then(resolve: (value: string) => void, reject: (reason: unknown) => void): void {
        expect(requireOperationInvocationContext()).toEqual(context);
        queueMicrotask(() => queuedObservation.resolve(currentOperationInvocationContext()));
        process.nextTick(() => nextTickObservation.resolve(currentOperationInvocationContext()));
        resolve('first-result');
        reject(lateError);
        resolve('second-result');
      },
    } as unknown as PromiseLike<string>;

    const result = runWithOperationInvocationContext(context, () => thenable);
    expectTypeOf(result).toEqualTypeOf<Promise<string>>();
    await expect(result).resolves.toBe('first-result');
    expect(await queuedObservation.promise).toEqual({ state: 'INVALIDATED' });
    expect(await nextTickObservation.promise).toEqual({ state: 'INVALIDATED' });

    const adopted = deferred<string>();
    const activeDuringAdoption = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const detachedGate = deferred<void>();
    const afterAdoptionQueued = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    const afterAdoptionNextTick = deferred<ReturnType<typeof currentOperationInvocationContext>>();
    let detachedTask!: Promise<void>;
    const adoptingThenable = {
      then(resolve: (value: Promise<string>) => void): void {
        expect(requireOperationInvocationContext()).toEqual(context);
        resolve(adopted.promise);
        queueMicrotask(() => activeDuringAdoption.resolve(currentOperationInvocationContext()));
        detachedTask = (async () => {
          await detachedGate.promise;
          queueMicrotask(() => afterAdoptionQueued.resolve(currentOperationInvocationContext()));
          process.nextTick(() => afterAdoptionNextTick.resolve(currentOperationInvocationContext()));
        })();
      },
    } as unknown as PromiseLike<string>;

    const adoptedResult = runWithOperationInvocationContext(context, () => adoptingThenable);
    const adoptionLookup = await activeDuringAdoption.promise;
    expect(adoptionLookup.state).toBe('ACTIVE');
    if (adoptionLookup.state === 'ACTIVE') expect(adoptionLookup.context).toEqual(context);
    adopted.resolve('adopted-result');
    await expect(adoptedResult).resolves.toBe('adopted-result');
    detachedGate.resolve(undefined);
    await detachedTask;
    expect(await afterAdoptionQueued.promise).toEqual({ state: 'INVALIDATED' });
    expect(await afterAdoptionNextTick.promise).toEqual({ state: 'INVALIDATED' });

    const thrown = new Error('thenable-threw');
    const throwingThenable = {
      then(): void { throw thrown; },
    } as unknown as PromiseLike<string>;
    await expect(runWithOperationInvocationContext(context, () => throwingThenable)).rejects.toBe(thrown);
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
  });
});
