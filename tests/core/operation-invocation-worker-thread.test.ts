import { Worker } from 'node:worker_threads';

import { afterEach, describe, expect, it } from 'vitest';

import {
  Op,
  operationReference,
} from '../../src/core/operation-catalog/index.js';
import {
  currentOperationInvocationContext,
  requireOperationInvocationContext,
  runWithOperationInvocationContext,
} from '../../src/core/operation-invocation-async-scope.js';
import { createOperationInvocationContext } from '../../src/core/operation-invocation-context.js';
import { createRootOperationIdentity } from '../../src/core/operation-invocation-identity.js';
import {
  decodeOperationInvocationContext,
  encodeOperationInvocationContext,
} from '../../src/core/operation-invocation-transport.js';

const CREATED_AT = '2026-08-29T00:00:00.000Z';
const DEFAULT_TIMEOUT_MS = 5_000;
const TERMINATION_TIMEOUT_MS = 2_000;

const TSX_LOADER_URL = new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
const ASYNC_SCOPE_MODULE_URL = new URL(
  '../../src/core/operation-invocation-async-scope.ts',
  import.meta.url,
).href;
const TRANSPORT_MODULE_URL = new URL(
  '../../src/core/operation-invocation-transport.ts',
  import.meta.url,
).href;

type WorkerMode = 'decode' | 'throw' | 'hang' | 'early-exit' | 'malformed-message';
type WorkerHarnessErrorCode = 'WORKER_ERROR' | 'WORKER_EXIT' | 'WORKER_PROTOCOL' | 'WORKER_TIMEOUT';

interface TrackedWorker {
  readonly worker: Worker;
  readonly exit: Promise<number>;
  exitConfirmed: boolean;
  exitCode?: number;
}

const ACTIVE_WORKERS = new Set<TrackedWorker>();

interface WorkerSuccessEvidence {
  readonly kind: 'success';
  readonly beforeState: 'ABSENT';
  readonly afterState: 'ABSENT';
  readonly invocationId: string;
  readonly deeplyFrozen: boolean;
  readonly mutationRejected: boolean;
  readonly inputIndependent: boolean;
  readonly exactBytes: boolean;
}

interface WorkerCodecErrorEvidence {
  readonly kind: 'codec-error';
  readonly errorName: string;
  readonly errorCode: string;
  readonly contextReturned: false;
}

interface WorkerDataProtocolErrorEvidence {
  readonly kind: 'protocol-error';
  readonly errorName: 'WorkerDataProtocolError';
  readonly errorCode: 'INVALID_WORKER_DATA';
  readonly contextReturned: false;
}

type WorkerEvidence =
  | WorkerSuccessEvidence
  | WorkerCodecErrorEvidence
  | WorkerDataProtocolErrorEvidence;

class WorkerHarnessError extends Error {
  constructor(
    readonly code: WorkerHarnessErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'WorkerHarnessError';
  }
}

function context(suffix: string) {
  return createOperationInvocationContext({
    schemaVersion: 1,
    operation: operationReference(Op.FsWrite, 1),
    identity: createRootOperationIdentity({
      invocationId: `invocation:worker-${suffix}`,
      transactionId: `transaction:worker-${suffix}`,
      operationAttemptId: `operation-attempt:worker-${suffix}`,
      correlationId: `correlation:worker-${suffix}`,
      occurredAt: CREATED_AT,
    }),
    subject: {
      principal: {
        id: `principal-worker-${suffix}`,
        identityClass: 'service',
        assurance: 'token-verified',
        provenance: 'api',
        verifiedBy: 'service:worker-proof',
        tenantId: 'principal-tenant-worker-proof',
        role: 'operator',
      },
      tenantId: 'tenant:worker-proof',
      projectId: 'project:worker-proof',
      resource: {
        tenantId: 'tenant:worker-resource',
        type: 'repository',
        id: `resource:worker-${suffix}`,
      },
      environmentId: 'environment:worker-proof',
      adapterId: 'adapter:worker-thread',
      platform: 'linux',
    },
    idempotency: { kind: 'KEYED', key: `idempotency:worker-${suffix}` },
    createdAt: CREATED_AT,
  });
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length
    && actual.every(key => typeof key === 'string' && keys.includes(key));
}

function parseWorkerEvidence(message: unknown): WorkerEvidence {
  if (message === null || typeof message !== 'object' || Array.isArray(message)
    || Object.getPrototypeOf(message) !== Object.prototype) {
    throw new TypeError('worker evidence must be a plain object');
  }
  const source = message as Record<string, unknown>;
  if (source.kind === 'success') {
    if (!hasExactKeys(source, [
      'kind', 'beforeState', 'afterState', 'invocationId', 'deeplyFrozen',
      'mutationRejected', 'inputIndependent', 'exactBytes',
    ])
      || source.beforeState !== 'ABSENT'
      || source.afterState !== 'ABSENT'
      || typeof source.invocationId !== 'string'
      || source.invocationId.length === 0
      || typeof source.deeplyFrozen !== 'boolean'
      || typeof source.mutationRejected !== 'boolean'
      || typeof source.inputIndependent !== 'boolean'
      || typeof source.exactBytes !== 'boolean') {
      throw new TypeError('worker success evidence is malformed');
    }
    return source as unknown as WorkerSuccessEvidence;
  }
  if (source.kind === 'codec-error') {
    if (!hasExactKeys(source, ['kind', 'errorName', 'errorCode', 'contextReturned'])
      || typeof source.errorName !== 'string'
      || typeof source.errorCode !== 'string'
      || source.contextReturned !== false) {
      throw new TypeError('worker codec-error evidence is malformed');
    }
    return source as unknown as WorkerCodecErrorEvidence;
  }
  if (source.kind === 'protocol-error') {
    if (!hasExactKeys(source, ['kind', 'errorName', 'errorCode', 'contextReturned'])
      || source.errorName !== 'WorkerDataProtocolError'
      || source.errorCode !== 'INVALID_WORKER_DATA'
      || source.contextReturned !== false) {
      throw new TypeError('worker protocol-error evidence is malformed');
    }
    return source as unknown as WorkerDataProtocolErrorEvidence;
  }
  throw new TypeError('worker evidence kind is unsupported');
}

function trackWorker(worker: Worker): TrackedWorker {
  let acknowledgeExit!: (code: number) => void;
  const exit = new Promise<number>(resolve => { acknowledgeExit = resolve; });
  const tracked: TrackedWorker = { worker, exit, exitConfirmed: false };
  ACTIVE_WORKERS.add(tracked);
  worker.once('exit', (code) => {
    tracked.exitCode = code;
    tracked.exitConfirmed = true;
    ACTIVE_WORKERS.delete(tracked);
    acknowledgeExit(code);
  });
  return tracked;
}

function withDeadline<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds);
    void promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

async function terminateAndConfirmExit(tracked: TrackedWorker): Promise<number> {
  let termination: Promise<number>;
  try {
    termination = tracked.worker.terminate();
  } catch (error: unknown) {
    throw new WorkerHarnessError('WORKER_TIMEOUT', 'worker termination threw before exit acknowledgement', error);
  }
  const [, exitCode] = await withDeadline(
    Promise.all([termination, tracked.exit]),
    TERMINATION_TIMEOUT_MS,
    'worker termination acknowledgement',
  );
  if (!tracked.exitConfirmed || tracked.exitCode !== exitCode) {
    throw new WorkerHarnessError('WORKER_TIMEOUT', 'worker termination lacked an exact exit acknowledgement');
  }
  return exitCode;
}

function workerSource(mode: WorkerMode): string {
  return `
import { parentPort, workerData } from 'node:worker_threads';
import { currentOperationInvocationContext } from ${JSON.stringify(ASYNC_SCOPE_MODULE_URL)};
import {
  OperationInvocationTransportError,
  decodeOperationInvocationContext,
  encodeOperationInvocationContext,
} from ${JSON.stringify(TRANSPORT_MODULE_URL)};

const mode = ${JSON.stringify(mode)};
if (parentPort === null) throw new Error('worker parent port is unavailable');

if (mode === 'throw') throw new Error('worker-thread-test-sentinel');
if (mode === 'early-exit') process.exit(23);
if (mode === 'malformed-message') {
  parentPort.postMessage({ kind: 'success', exactBytes: 'not-a-boolean' });
} else if (mode === 'hang') {
  setInterval(() => undefined, 1_000);
} else {
  const beforeState = currentOperationInvocationContext().state;
  if (!(workerData instanceof Uint8Array)) {
    parentPort.postMessage({
      kind: 'protocol-error',
      errorName: 'WorkerDataProtocolError',
      errorCode: 'INVALID_WORKER_DATA',
      contextReturned: false,
    });
  } else {
    const inputBytes = Uint8Array.from(workerData);
    const originalBytes = Uint8Array.from(inputBytes);

    const byteEqual = (left, right) => (
      left.byteLength === right.byteLength && left.every((value, index) => value === right[index])
    );
    const deeplyFrozen = (value) => {
      if (value === null || typeof value !== 'object') return true;
      if (!Object.isFrozen(value)) return false;
      return Reflect.ownKeys(value).every((key) => deeplyFrozen(value[key]));
    };

    try {
      const decoded = decodeOperationInvocationContext(inputBytes);
      const frozen = deeplyFrozen(decoded);
      const resourceId = decoded.subject.resource.id;
      let mutationRejected = false;
      try {
        decoded.subject.resource.id = 'resource:mutated';
      } catch {
        mutationRejected = true;
      }

      if (inputBytes.byteLength > 0) inputBytes[0] ^= 0xff;
      const reencoded = encodeOperationInvocationContext(decoded);
      parentPort.postMessage({
        kind: 'success',
        beforeState,
        afterState: currentOperationInvocationContext().state,
        invocationId: decoded.identity.invocationId,
        deeplyFrozen: frozen,
        mutationRejected: mutationRejected && decoded.subject.resource.id === resourceId,
        inputIndependent: decoded.subject.resource.id === resourceId && byteEqual(reencoded, originalBytes),
        exactBytes: byteEqual(reencoded, originalBytes),
      });
    } catch (error) {
      parentPort.postMessage({
        kind: 'codec-error',
        errorName: error instanceof Error ? error.name : typeof error,
        errorCode: error instanceof OperationInvocationTransportError ? error.code : 'UNEXPECTED',
        contextReturned: false,
      });
    }
  }
}
`;
}

function executeWorkerData(
  workerData: unknown,
  mode: WorkerMode = 'decode',
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WorkerEvidence> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      const sourceUrl = new URL(`data:text/javascript;charset=utf-8,${encodeURIComponent(workerSource(mode))}`);
      worker = new Worker(sourceUrl, {
        execArgv: ['--import', TSX_LOADER_URL],
        workerData,
      });
    } catch (error: unknown) {
      reject(new WorkerHarnessError('WORKER_ERROR', 'worker construction failed', error));
      return;
    }

    const tracked = trackWorker(worker);
    let evidence: WorkerEvidence | undefined;
    let protocolError: unknown;
    let workerError: unknown;
    let settled = false;
    let timedOut = false;

    const finish = (outcome: Readonly<{ value?: WorkerEvidence; error?: WorkerHarnessError }>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outcome.error !== undefined) reject(outcome.error);
      else resolve(outcome.value!);
    };

    worker.on('message', (message: unknown) => {
      if (evidence !== undefined) {
        protocolError = new Error('worker emitted more than one evidence message');
        return;
      }
      try {
        evidence = parseWorkerEvidence(message);
      } catch (error: unknown) {
        protocolError = error;
      }
    });
    worker.once('messageerror', (error: unknown) => {
      protocolError = error;
    });
    worker.once('error', (error: unknown) => {
      workerError = error;
    });
    void tracked.exit.then((code) => {
      if (timedOut) return;
      if (workerError !== undefined) {
        finish({ error: new WorkerHarnessError('WORKER_ERROR', 'worker emitted an uncaught error', workerError) });
        return;
      }
      if (protocolError !== undefined) {
        finish({ error: new WorkerHarnessError('WORKER_PROTOCOL', 'worker evidence protocol failed', protocolError) });
        return;
      }
      if (code !== 0) {
        finish({ error: new WorkerHarnessError('WORKER_EXIT', `worker exited with code ${code}`) });
        return;
      }
      if (evidence === undefined) {
        finish({ error: new WorkerHarnessError('WORKER_PROTOCOL', 'worker exited without evidence') });
        return;
      }
      finish({ value: evidence });
    });

    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      void terminateAndConfirmExit(tracked).then(
        () => finish({ error: new WorkerHarnessError('WORKER_TIMEOUT', 'worker exceeded its bounded deadline') }),
        error => finish({ error: new WorkerHarnessError('WORKER_TIMEOUT', 'timed-out worker termination failed', error) }),
      );
    }, timeoutMs);
  });
}

function executeWorker(
  wireBytes: Uint8Array,
  mode: WorkerMode = 'decode',
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WorkerEvidence> {
  return executeWorkerData(Uint8Array.from(wireBytes), mode, timeoutMs);
}

function tamperCanonicalContext(wireBytes: Uint8Array): Uint8Array {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(wireBytes);
  const tampered = text.replace('resource:worker-tamper', 'resource:worker-xamper');
  if (tampered === text) throw new Error('tamper fixture marker was not found');
  return new TextEncoder().encode(tampered);
}

afterEach(async () => {
  const survivors = [...ACTIVE_WORKERS];
  const cleanup = await Promise.allSettled(survivors.map(terminateAndConfirmExit));
  expect(cleanup.filter(outcome => outcome.status === 'rejected')).toEqual([]);
  expect(survivors.every(worker => worker.exitConfirmed)).toBe(true);
  expect(ACTIVE_WORKERS.size).toBe(0);
});

describe('operation invocation worker-thread transport and isolation proof', () => {
  it('starts without inherited ALS while its parent scope stays active during byte-only reconstruction', async () => {
    const parent = context('active-parent');
    const source = context('single');
    const evidence = await runWithOperationInvocationContext(parent, async () => {
      expect(currentOperationInvocationContext()).toMatchObject({ state: 'ACTIVE', context: parent });
      expect(requireOperationInvocationContext()).toEqual(parent);
      const workerResult = await executeWorker(encodeOperationInvocationContext(source));
      expect(requireOperationInvocationContext()).toEqual(parent);
      return workerResult;
    });

    expect(evidence).toEqual({
      kind: 'success',
      beforeState: 'ABSENT',
      afterState: 'ABSENT',
      invocationId: source.identity.invocationId,
      deeplyFrozen: true,
      mutationRejected: true,
      inputIndependent: true,
      exactBytes: true,
    });
    expect(currentOperationInvocationContext()).toEqual({ state: 'ABSENT' });
    expect(ACTIVE_WORKERS.size).toBe(0);
  });

  it('isolates distinct codec inputs across concurrent workers without cross-talk', async () => {
    const sources = ['alpha', 'beta', 'gamma', 'delta'].map(context);
    const results = await Promise.all(sources.map(source => (
      executeWorker(encodeOperationInvocationContext(source))
    )));

    expect(results.map(result => result.kind)).toEqual(['success', 'success', 'success', 'success']);
    expect(results.map(result => result.kind === 'success' ? result.invocationId : 'unexpected'))
      .toEqual(sources.map(source => source.identity.invocationId));
    expect(new Set(results.map(result => result.kind === 'success' ? result.invocationId : 'unexpected')).size)
      .toBe(sources.length);
    for (const result of results) {
      expect(result).toMatchObject({
        beforeState: 'ABSENT',
        afterState: 'ABSENT',
        deeplyFrozen: true,
        mutationRejected: true,
        inputIndependent: true,
        exactBytes: true,
      });
    }
    expect(ACTIVE_WORKERS.size).toBe(0);
  });

  it('fails tampered codec bytes with a typed transport error and returns no context', async () => {
    const wireBytes = encodeOperationInvocationContext(context('tamper'));
    const evidence = await executeWorker(tamperCanonicalContext(wireBytes));

    expect(evidence).toEqual({
      kind: 'codec-error',
      errorName: 'OperationInvocationTransportError',
      errorCode: 'DIGEST_MISMATCH',
      contextReturned: false,
    });
    expect(ACTIVE_WORKERS.size).toBe(0);
  });

  it('rejects malformed workerData and malformed evidence protocol without accepting context', async () => {
    const wireBytes = encodeOperationInvocationContext(context('malformed-protocol'));
    const malformedInput = await executeWorkerData({ bytes: Array.from(wireBytes) });
    expect(malformedInput).toEqual({
      kind: 'protocol-error',
      errorName: 'WorkerDataProtocolError',
      errorCode: 'INVALID_WORKER_DATA',
      contextReturned: false,
    });
    expect(ACTIVE_WORKERS.size).toBe(0);

    await expect(executeWorker(wireBytes, 'malformed-message')).rejects.toMatchObject({
      name: 'WorkerHarnessError',
      code: 'WORKER_PROTOCOL',
    });
    expect(ACTIVE_WORKERS.size).toBe(0);
  });

  it('waits for uncaught-error and early-exit workers to close before rejecting once', async () => {
    const wireBytes = encodeOperationInvocationContext(context('terminal-error'));
    await expect(executeWorker(wireBytes, 'throw')).rejects.toMatchObject({
      name: 'WorkerHarnessError',
      code: 'WORKER_ERROR',
    });
    expect(ACTIVE_WORKERS.size).toBe(0);

    await expect(executeWorker(wireBytes, 'early-exit')).rejects.toMatchObject({
      name: 'WorkerHarnessError',
      code: 'WORKER_EXIT',
    });
    expect(ACTIVE_WORKERS.size).toBe(0);
  });

  it('awaits termination of a timed-out worker and leaves no live worker', async () => {
    const wireBytes = encodeOperationInvocationContext(context('timeout'));
    await expect(executeWorker(wireBytes, 'hang', 500)).rejects.toMatchObject({
      name: 'WorkerHarnessError',
      code: 'WORKER_TIMEOUT',
    });
    expect(ACTIVE_WORKERS.size).toBe(0);
  });
});
