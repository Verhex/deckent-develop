import { AsyncLocalStorage, createHook } from 'node:async_hooks';
import { types as nodeTypes } from 'node:util';

import {
  validateOperationInvocationContext,
  type OperationInvocationContext,
} from './operation-invocation-context.js';

export type OperationInvocationContextLookup =
  | Readonly<{ readonly state: 'ACTIVE'; readonly context: OperationInvocationContext }>
  | Readonly<{ readonly state: 'ABSENT' }>
  | Readonly<{ readonly state: 'INVALIDATED' }>;

export type OperationInvocationAsyncScopeErrorCode =
  | 'OPERATION_INVOCATION_CONTEXT_ABSENT'
  | 'OPERATION_INVOCATION_CONTEXT_INVALIDATED'
  | 'INVALID_SCOPE_CALLBACK'
  | 'UNOBSERVABLE_SCOPE_PROMISE'
  | 'THENABLE_ADOPTION_CYCLE'
  | 'THENABLE_ADOPTION_LIMIT'
  | 'THENABLE_ADOPTION_UNREPRESENTABLE_VALUE';

/** Stable typed refusal for missing, stale, or malformed async-scope access. */
export class OperationInvocationAsyncScopeError extends Error {
  constructor(
    public readonly code: OperationInvocationAsyncScopeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OperationInvocationAsyncScopeError';
  }
}

interface OperationInvocationScopeFrame {
  readonly context: OperationInvocationContext;
  readonly activeLookup: Extract<OperationInvocationContextLookup, { readonly state: 'ACTIVE' }>;
  readonly observedPromiseAsyncIds: Set<number>;
  observationRetained: boolean;
  state: 'ACTIVE' | 'INVALIDATED';
}

interface PromiseObservation {
  readonly asyncId: number;
  readonly frame: OperationInvocationScopeFrame;
  readonly resource: WeakRef<object>;
  returned: boolean;
}

const ABSENT_LOOKUP = Object.freeze({ state: 'ABSENT' as const });
const INVALIDATED_LOOKUP = Object.freeze({ state: 'INVALIDATED' as const });
const operationInvocationStorage = new AsyncLocalStorage<OperationInvocationScopeFrame>();
const promiseObservations = new Map<number, PromiseObservation>();
let promiseOwners = new WeakMap<object, WeakRef<OperationInvocationScopeFrame>>();
let promiseAsyncIds = new WeakMap<object, number>();
let resolvedPromises = new WeakSet<object>();
let activeObservationCount = 0;
const THENABLE_ADOPTION_SYNC_BATCH = 256;
const THENABLE_ADOPTION_MAX_STEPS = 16_384;

function discardPromiseObservation(observation: PromiseObservation): void {
  promiseObservations.delete(observation.asyncId);
  observation.frame.observedPromiseAsyncIds.delete(observation.asyncId);
}

function releasePromiseObservation(frame: OperationInvocationScopeFrame): void {
  if (!frame.observationRetained) return;
  frame.observationRetained = false;
  activeObservationCount -= 1;
  if (activeObservationCount !== 0) return;

  promiseSettlementHook.disable();
  promiseObservations.clear();
  promiseOwners = new WeakMap<object, WeakRef<OperationInvocationScopeFrame>>();
  promiseAsyncIds = new WeakMap<object, number>();
  resolvedPromises = new WeakSet<object>();
}

function invalidate(frame: OperationInvocationScopeFrame): void {
  if (frame.state === 'INVALIDATED') return;
  frame.state = 'INVALIDATED';

  for (const asyncId of frame.observedPromiseAsyncIds) {
    const observation = promiseObservations.get(asyncId);
    if (observation === undefined) continue;
    const resource = observation.resource.deref();
    if (resource !== undefined) {
      promiseOwners.delete(resource);
      promiseAsyncIds.delete(resource);
      resolvedPromises.delete(resource);
    }
    promiseObservations.delete(asyncId);
  }
  frame.observedPromiseAsyncIds.clear();
  releasePromiseObservation(frame);
}

const promiseSettlementHook = createHook({
  init(asyncId, type, _triggerAsyncId, resource) {
    if (type !== 'PROMISE') return;
    const frame = operationInvocationStorage.getStore();
    if (frame === undefined || frame.state !== 'ACTIVE') return;

    const observation: PromiseObservation = {
      asyncId,
      frame,
      resource: new WeakRef(resource),
      returned: false,
    };
    promiseObservations.set(asyncId, observation);
    promiseOwners.set(resource, new WeakRef(frame));
    promiseAsyncIds.set(resource, asyncId);
    frame.observedPromiseAsyncIds.add(asyncId);
  },
  promiseResolve(asyncId) {
    const observation = promiseObservations.get(asyncId);
    if (observation === undefined) return;
    const resource = observation.resource.deref();
    if (resource !== undefined) resolvedPromises.add(resource);
    if (observation.returned) {
      invalidate(observation.frame);
      return;
    }
    discardPromiseObservation(observation);
  },
  destroy(asyncId) {
    const observation = promiseObservations.get(asyncId);
    if (observation === undefined) return;
    if (observation.returned) {
      invalidate(observation.frame);
      return;
    }
    discardPromiseObservation(observation);
  },
});

function retainPromiseObservation(frame: OperationInvocationScopeFrame): void {
  activeObservationCount += 1;
  frame.observationRetained = true;
  if (activeObservationCount === 1) promiseSettlementHook.enable();
}

function trackReturnedNativePromise(
  frame: OperationInvocationScopeFrame,
  promise: object,
): boolean {
  const owner = promiseOwners.get(promise)?.deref();
  if (owner !== frame) return false;

  if (resolvedPromises.has(promise)) {
    promiseOwners.delete(promise);
    promiseAsyncIds.delete(promise);
    resolvedPromises.delete(promise);
    invalidate(frame);
    return true;
  }

  const asyncId = promiseAsyncIds.get(promise);
  const observation = asyncId === undefined ? undefined : promiseObservations.get(asyncId);
  if (observation === undefined || observation.frame !== frame) return false;
  observation.returned = true;
  return true;
}

function followAdoptedPromise(
  promise: object,
  resolve: (value: unknown) => void,
  reject: (reason: unknown) => void,
): void {
  try {
    Reflect.apply(Promise.prototype.then, promise, [resolve, reject]);
  } catch (error: unknown) {
    reject(error);
  }
}

function hasThenAccessor(value: object): boolean {
  const visited = new WeakSet<object>();
  let current: object | null = value;
  while (current !== null) {
    if (nodeTypes.isProxy(current)) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const descriptor = Object.getOwnPropertyDescriptor(current, 'then');
    if (descriptor !== undefined) return !('value' in descriptor);
    current = Object.getPrototypeOf(current) as object | null;
  }
  return false;
}

interface ThenableAdoption {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

function createThenableAdoption(
  target: Promise<unknown>,
  initialThenable: object,
  initialThen: (...args: unknown[]) => unknown,
  settleTarget: (value: unknown) => void,
  rejectTarget: (reason: unknown) => void,
): ThenableAdoption {
  const seen = new WeakSet<object>();
  const capturedThen = new WeakMap<object, (...args: unknown[]) => unknown>();
  capturedThen.set(initialThenable, initialThen);
  let complete = false;
  let pumping = false;
  let pumpScheduled = false;
  let hasPendingValue = false;
  let pendingValue: unknown;
  let adoptionSteps = 0;

  const reject = (reason: unknown): void => {
    if (complete) return;
    complete = true;
    hasPendingValue = false;
    rejectTarget(reason);
  };

  const pump = (): void => {
    if (complete || pumping) return;
    pumping = true;
    let synchronousSteps = 0;
    try {
      while (hasPendingValue && !complete) {
        const value = pendingValue;
        hasPendingValue = false;
        if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
          complete = true;
          settleTarget(value);
          return;
        }
        if (value === target || seen.has(value)) {
          reject(new OperationInvocationAsyncScopeError(
            'THENABLE_ADOPTION_CYCLE',
            'operation invocation scope thenable adoption contains a cycle',
          ));
          return;
        }

        adoptionSteps += 1;
        if (adoptionSteps > THENABLE_ADOPTION_MAX_STEPS) {
          reject(new OperationInvocationAsyncScopeError(
            'THENABLE_ADOPTION_LIMIT',
            `operation invocation scope thenable adoption exceeds ${THENABLE_ADOPTION_MAX_STEPS} steps`,
          ));
          return;
        }
        seen.add(value);

        if (nodeTypes.isPromise(value)) {
          followAdoptedPromise(value, resolve, reject);
          return;
        }

        let then = capturedThen.get(value);
        if (then === undefined) {
          let candidate: unknown;
          let accessorPresent: boolean;
          try {
            accessorPresent = hasThenAccessor(value);
            candidate = Reflect.get(value, 'then');
          } catch (error: unknown) {
            reject(error);
            return;
          }
          if (typeof candidate !== 'function') {
            if (accessorPresent) {
              reject(new OperationInvocationAsyncScopeError(
                'THENABLE_ADOPTION_UNREPRESENTABLE_VALUE',
                'operation invocation scope refuses a nested value with a non-callable then accessor',
              ));
              return;
            }
            complete = true;
            settleTarget(value);
            return;
          }
          then = candidate as (...args: unknown[]) => unknown;
        }

        let called = false;
        let synchronous = true;
        let synchronousOutcome:
          | Readonly<{ readonly kind: 'resolve'; readonly value: unknown }>
          | Readonly<{ readonly kind: 'reject'; readonly reason: unknown }>
          | undefined;
        const resolveOnce = (nextValue: unknown): void => {
          if (called) return;
          called = true;
          if (synchronous) synchronousOutcome = { kind: 'resolve', value: nextValue };
          else resolve(nextValue);
        };
        const rejectOnce = (reason: unknown): void => {
          if (called) return;
          called = true;
          if (synchronous) synchronousOutcome = { kind: 'reject', reason };
          else reject(reason);
        };
        try {
          Reflect.apply(then, value, [resolveOnce, rejectOnce]);
        } catch (error: unknown) {
          rejectOnce(error);
        }
        synchronous = false;

        if (synchronousOutcome?.kind === 'reject') {
          reject(synchronousOutcome.reason);
          return;
        }
        if (synchronousOutcome?.kind !== 'resolve') return;
        pendingValue = synchronousOutcome.value;
        hasPendingValue = true;
        synchronousSteps += 1;
        if (synchronousSteps >= THENABLE_ADOPTION_SYNC_BATCH) {
          pumpScheduled = true;
          queueMicrotask(() => {
            pumpScheduled = false;
            pump();
          });
          return;
        }
      }
    } finally {
      pumping = false;
    }
  };

  const resolve = (value: unknown): void => {
    if (complete) return;
    pendingValue = value;
    hasPendingValue = true;
    if (!pumping && !pumpScheduled) pump();
  };

  return { resolve, reject };
}

function assimilateThenable(
  frame: OperationInvocationScopeFrame,
  value: object,
  then: (...args: unknown[]) => unknown,
): Promise<unknown> {
  let resolveTarget!: (result: unknown) => void;
  let rejectTarget!: (reason: unknown) => void;
  const target = new Promise<unknown>((resolve, reject) => {
    resolveTarget = resolve;
    rejectTarget = reject;
  });
  if (!trackReturnedNativePromise(frame, target)) {
    invalidate(frame);
    return Promise.reject(new OperationInvocationAsyncScopeError(
      'UNOBSERVABLE_SCOPE_PROMISE',
      'operation invocation scope could not observe its assimilation promise',
    ));
  }

  const adoption = createThenableAdoption(target, value, then, resolveTarget, rejectTarget);
  adoption.resolve(value);
  return target;
}

/**
 * Inspect the current in-process operation scope without fabricating a fallback.
 * Detached continuations retain only an INVALIDATED frame after callback settlement.
 */
export function currentOperationInvocationContext(): OperationInvocationContextLookup {
  const frame = operationInvocationStorage.getStore();
  if (frame === undefined) return ABSENT_LOOKUP;
  return frame.state === 'ACTIVE' ? frame.activeLookup : INVALIDATED_LOOKUP;
}

/** Require a currently active context, distinguishing absence from stale capture. */
export function requireOperationInvocationContext(): OperationInvocationContext {
  const lookup = currentOperationInvocationContext();
  if (lookup.state === 'ACTIVE') return lookup.context;
  if (lookup.state === 'INVALIDATED') {
    throw new OperationInvocationAsyncScopeError(
      'OPERATION_INVOCATION_CONTEXT_INVALIDATED',
      'operation invocation context scope has already settled',
    );
  }
  throw new OperationInvocationAsyncScopeError(
    'OPERATION_INVOCATION_CONTEXT_ABSENT',
    'operation invocation context is absent from the current async scope',
  );
}

export function runWithOperationInvocationContext<T>(
  input: unknown,
  callback: () => PromiseLike<T>,
): Promise<T>;
export function runWithOperationInvocationContext<T>(
  input: unknown,
  callback: () => T,
): T;
/**
 * Run one callback inside a lifetime-bounded operation context. Validation and
 * deep freezing complete before the private frame enters AsyncLocalStorage.
 * This carrier is process-local and makes no process/thread transport claim.
 */
export function runWithOperationInvocationContext(
  input: unknown,
  callback: unknown,
): unknown {
  const context = validateOperationInvocationContext(input);
  if (typeof callback !== 'function') {
    throw new OperationInvocationAsyncScopeError(
      'INVALID_SCOPE_CALLBACK',
      'operation invocation scope callback must be a function',
    );
  }

  const frame: OperationInvocationScopeFrame = {
    context,
    activeLookup: Object.freeze({ state: 'ACTIVE', context }),
    observedPromiseAsyncIds: new Set(),
    observationRetained: false,
    state: 'ACTIVE',
  };
  retainPromiseObservation(frame);

  return operationInvocationStorage.run(frame, () => {
    let result: unknown;
    try {
      result = callback();
    } catch (error: unknown) {
      invalidate(frame);
      throw error;
    }

    if (nodeTypes.isPromise(result)) {
      if (trackReturnedNativePromise(frame, result)) return result;
      invalidate(frame);
      return Promise.reject(new OperationInvocationAsyncScopeError(
        'UNOBSERVABLE_SCOPE_PROMISE',
        'operation invocation scope refuses a native promise created outside its observation',
      ));
    }

    if (result !== null && (typeof result === 'object' || typeof result === 'function')) {
      let then: unknown;
      try {
        then = Reflect.get(result, 'then');
      } catch (error: unknown) {
        invalidate(frame);
        return Promise.reject(error);
      }
      if (typeof then === 'function') {
        return assimilateThenable(frame, result, then as (...args: unknown[]) => unknown);
      }
    }

    invalidate(frame);
    return result;
  });
}
