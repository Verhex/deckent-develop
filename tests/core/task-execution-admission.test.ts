import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  fsyncSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  acquireProjectMaintenanceLock,
  checkExecutionLock,
  releaseExecutionLock,
} from '../../src/core/file-lock.js';
import {
  __taskExecutionAdmissionHeartbeatDiagnosticsForTests,
  executeTaskExecutionAdmission,
  executeTaskExecutionAdmissionSync,
  type TaskExecutionAdmissionSyncHooks,
} from '../../src/core/task-execution-admission.js';

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-task-admission-'));
  roots.push(root);
  mkdirSync(join(root, '.locks'), { recursive: true });
  return root;
}

function durableWrite(path: string, value: string): void {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, value, 'utf8');
  const fd = openSync(temporary, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}

function recoveryHooks(root: string, taskId: string, refCount = 1): {
  persistRecoveryIntent(
    context: {
      readonly taskId: string;
      readonly fencingToken: {
        readonly epoch: string;
        readonly counter: number;
        readonly nonce: string;
      };
    },
  ): readonly string[];
  verifyRecoveryIntent(
    evidenceRefs: readonly string[],
    context: {
      readonly taskId: string;
      readonly fencingToken: {
        readonly epoch: string;
        readonly counter: number;
        readonly nonce: string;
      };
    },
  ): boolean;
} {
  const path = join(root, '.locks', `${taskId}.admission-recovery.json`);
  const ref = `admission-recovery-journal:${createHash('sha256')
    .update(path)
    .digest('hex')}`;
  const refs = Object.freeze([
    ref,
    ...(refCount === 2 ? [`${ref}:replica`] : []),
  ]);
  const persistRecoveryIntent = (
    context: {
      readonly taskId: string;
      readonly fencingToken: {
        readonly epoch: string;
        readonly counter: number;
        readonly nonce: string;
      };
    },
  ): readonly string[] => {
    const payload = JSON.stringify({
      schemaVersion: 1,
      taskId: context.taskId,
      fencingToken: context.fencingToken,
      dispatchIdempotencyKey: `worker-execution:${context.taskId}`,
      evidenceRefs: refs,
    });
    durableWrite(path, payload);
    return refs;
  };
  return {
    persistRecoveryIntent,
    verifyRecoveryIntent: (evidenceRefs, context) => {
      try {
        const persisted = JSON.parse(readFileSync(path, 'utf8')) as {
          taskId?: unknown;
          fencingToken?: unknown;
          evidenceRefs?: unknown;
          dispatchIdempotencyKey?: unknown;
        };
        return JSON.stringify(evidenceRefs) === JSON.stringify(refs)
          && persisted.taskId === context.taskId
          && JSON.stringify(persisted.fencingToken)
            === JSON.stringify(context.fencingToken)
          && JSON.stringify(persisted.evidenceRefs) === JSON.stringify(refs)
          && persisted.dispatchIdempotencyKey
            === `worker-execution:${context.taskId}`;
      } catch {
        return false;
      }
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const crashFixtureRoot =
  process.env['DECKENT_TASK_ADMISSION_CRASH_FIXTURE_ROOT'];
if (crashFixtureRoot) {
  describe('task admission child-process fixtures', () => {
    it('__hard_crash_after_dispatch_receipt__', () => {
      const taskId = 'hard-crash-after-dispatch';
      const dispatchPath = join(
        crashFixtureRoot,
        '.locks',
        `${taskId}.dispatch`,
      );
      executeTaskExecutionAdmissionSync(
        {
          projectRoot: crashFixtureRoot,
          taskId,
          boundaryEvidenceRefs: ['request:hard-crash'],
        },
        {
          ...recoveryHooks(crashFixtureRoot, taskId),
          revalidate: () => ({
            decision: 'dispatch',
            evidenceRefs: ['task-snapshot:pending'],
          }),
          persistPrepared: () => ['task-projection:prepared'],
          dispatch: () => ({ dispatchId: 'hard-crash-dispatch' }),
          persistDispatched: value => {
            durableWrite(dispatchPath, JSON.stringify(value));
            return ['dispatch-receipt:hard-crash-dispatch'];
          },
          verifyDispatched: () => {
            const reallyExit = (
              process as NodeJS.Process & {
                readonly reallyExit?: (code?: number) => never;
              }
            ).reallyExit;
            if (!reallyExit) {
              throw new Error('process.reallyExit is unavailable');
            }
            reallyExit.call(process, 73);
          },
        },
      );
      throw new Error('hard-crash fixture unexpectedly returned');
    });
  });
}

describe('task execution admission', () => {
  it('orders durable boundary preparation before the sole sync dispatch', () => {
    const root = fixtureRoot();
    const order: string[] = [];

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'sync-success',
        boundaryEvidenceRefs: ['request:sync-success'],
      },
      {
        ...recoveryHooks(root, 'sync-success'),
        revalidate: () => {
          order.push('revalidate');
          return {
            decision: 'dispatch',
            evidenceRefs: ['task-snapshot:pending'],
          };
        },
        persistPrepared: context => {
          context.assertAuthority();
          order.push('prepare');
          expect(checkExecutionLock(root, 'sync-success').state)
            .toBe('quarantined');
          return ['task-projection:executing'];
        },
        dispatch: context => {
          context.assertAuthority();
          order.push('dispatch');
          return { backend: 'test', dispatchId: 'dispatch-1' };
        },
        persistDispatched: value => {
          order.push('persist-dispatched');
          return [`dispatch:${value.dispatchId}`];
        },
        verifyDispatched: () => true,
      },
    );

    expect(outcome.state).toBe('dispatched');
    expect(order).toEqual([
      'revalidate',
      'prepare',
      'dispatch',
      'persist-dispatched',
    ]);
    expect(checkExecutionLock(root, 'sync-success')).toEqual({
      state: 'absent',
    });
  });

  it('adopts an already-dispatched execution without calling process hooks', () => {
    const root = fixtureRoot();
    const adoptedPath = join(root, '.locks', 'adopt-existing.dispatch');
    durableWrite(adoptedPath, 'existing-1');
    let processCalls = 0;

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'adopt-existing',
        boundaryEvidenceRefs: ['request:adopt-existing'],
      },
      {
        ...recoveryHooks(root, 'adopt-existing'),
        revalidate: () => ({
          decision: 'adopt',
          value: { dispatchId: 'existing-1' },
          evidenceRefs: ['dispatch-receipt:existing-1'],
        }),
        persistPrepared: () => {
          throw new Error('must not prepare an adopted execution');
        },
        dispatch: () => {
          processCalls += 1;
          return { dispatchId: 'duplicate' };
        },
        persistDispatched: () => {
          throw new Error('must not persist an adopted execution');
        },
        verifyDispatched: () => {
          throw new Error('must not verify an adopted execution');
        },
        verifyAdopted: (value, evidenceRefs) =>
          readFileSync(adoptedPath, 'utf8') === value.dispatchId
          && evidenceRefs.includes('dispatch-receipt:existing-1'),
      },
    );

    expect(outcome).toMatchObject({
      state: 'adopted',
      processState: 'adopted',
      value: { dispatchId: 'existing-1' },
    });
    expect(processCalls).toBe(0);
    expect(checkExecutionLock(root, 'adopt-existing')).toEqual({
      state: 'absent',
    });
  });

  it('replays from caller-verified durable evidence without a second process', () => {
    const root = fixtureRoot();
    const dispatchPath = join(root, '.locks', 'durable-adoption.dispatch.json');
    let processCalls = 0;
    const readDispatchId = (): string | undefined => {
      try {
        const parsed = JSON.parse(readFileSync(dispatchPath, 'utf8')) as {
          dispatchId?: unknown;
        };
        return typeof parsed.dispatchId === 'string'
          ? parsed.dispatchId
          : undefined;
      } catch {
        return undefined;
      }
    };
    const hooks = {
      ...recoveryHooks(root, 'durable-adoption'),
      revalidate: () => {
        const durableDispatchId = readDispatchId();
        return durableDispatchId
          ? {
          decision: 'adopt' as const,
          value: { dispatchId: durableDispatchId },
          evidenceRefs: [`dispatch-receipt:${durableDispatchId}`],
          }
          : {
            decision: 'dispatch' as const,
            evidenceRefs: ['task-snapshot:pending'],
          };
      },
      persistPrepared: () => ['task-projection:executing'],
      dispatch: () => {
        processCalls += 1;
        return { dispatchId: `durable-${processCalls}` };
      },
      persistDispatched: (value: { dispatchId: string }) => {
        durableWrite(
          dispatchPath,
          JSON.stringify({ dispatchId: value.dispatchId }),
        );
        return [`dispatch-receipt:${value.dispatchId}`];
      },
      verifyDispatched: (value: { dispatchId: string }) =>
        readDispatchId() === value.dispatchId,
      verifyAdopted: (value: { dispatchId: string }, evidenceRefs: readonly string[]) =>
        readDispatchId() === value.dispatchId
        && evidenceRefs.includes(`dispatch-receipt:${value.dispatchId}`),
    };
    const request = {
      projectRoot: root,
      taskId: 'durable-adoption',
      boundaryEvidenceRefs: ['request:durable-adoption'],
    };

    const first = executeTaskExecutionAdmissionSync(request, hooks);
    const replay = executeTaskExecutionAdmissionSync(request, hooks);

    expect(first).toMatchObject({
      state: 'dispatched',
      value: { dispatchId: 'durable-1' },
    });
    expect(replay).toMatchObject({
      state: 'adopted',
      value: { dispatchId: 'durable-1' },
    });
    expect(processCalls).toBe(1);
  });

  it('leaves a recovery-locatable in-flight boundary after a real process crash', async () => {
    const root = fixtureRoot();
    const taskId = 'hard-crash-after-dispatch';
    const child = spawn(
      process.execPath,
      [
        join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        'tests/core/task-execution-admission.test.ts',
        '--reporter=dot',
        '-t',
        '__hard_crash_after_dispatch_receipt__',
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DECKENT_TASK_ADMISSION_CRASH_FIXTURE_ROOT: root,
        },
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stderr = '';
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', chunk => {
      if (stderr.length < 8_192) stderr += String(chunk);
    });
    const exit = await new Promise<{
      readonly code: number | null;
      readonly signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    expect(
      exit.code !== 0 || exit.signal !== null,
      `fixture terminated normally\n${stderr}`,
    ).toBe(true);

    const inspected = checkExecutionLock(root, taskId);
    expect(inspected).toMatchObject({
      state: 'quarantined',
      quarantine: {
        state: 'in-flight',
      },
    });
    if (inspected.state !== 'quarantined') {
      throw new Error('expected durable in-flight boundary');
    }
    expect(inspected.quarantine.evidenceRefs.some(
      ref => ref.startsWith('admission-recovery-journal:'),
    )).toBe(true);
    expect(JSON.parse(readFileSync(
      join(root, '.locks', `${taskId}.dispatch`),
      'utf8',
    ))).toEqual({ dispatchId: 'hard-crash-dispatch' });

    let duplicateProcessCalls = 0;
    const retry = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId,
        boundaryEvidenceRefs: ['request:hard-crash:retry'],
      },
      {
        ...recoveryHooks(root, taskId),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: () => ['prepared:duplicate'],
        dispatch: () => {
          duplicateProcessCalls += 1;
          return { dispatchId: 'duplicate' };
        },
        persistDispatched: () => ['dispatch:duplicate'],
        verifyDispatched: () => true,
      },
    );
    expect(retry).toMatchObject({
      state: 'in-flight',
      phase: 'acquire',
      processState: 'possibly-started',
    });
    expect(duplicateProcessCalls).toBe(0);
  }, 30_000);

  it('creates zero processes and retains quarantine when preparation fails', () => {
    const root = fixtureRoot();
    let processCalls = 0;

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'prepare-failure',
        boundaryEvidenceRefs: ['request:prepare-failure'],
      },
      {
        ...recoveryHooks(root, 'prepare-failure'),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: () => {
          throw Object.assign(new Error('fixture'), {
            code: 'E_FIXTURE_PREPARE_FAILED',
          });
        },
        dispatch: () => {
          processCalls += 1;
          return 'unexpected';
        },
        persistDispatched: () => ['unexpected:evidence'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'prepare',
      processState: 'not-started',
      detailCode: 'E_FIXTURE_PREPARE_FAILED',
      quarantine: {
        state: 'quarantined',
        reason: 'authority-uncertain',
      },
    });
    expect(processCalls).toBe(0);
    expect(checkExecutionLock(root, 'prepare-failure').state)
      .toBe('quarantined');
  });

  it('never turns a throwing process callback into an ordinary retry', () => {
    const root = fixtureRoot();

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'dispatch-failure',
        boundaryEvidenceRefs: ['request:dispatch-failure'],
      },
      {
        ...recoveryHooks(root, 'dispatch-failure'),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: () => ['task-projection:executing'],
        dispatch: () => {
          throw Object.assign(new Error('fixture'), {
            code: 'E_FIXTURE_DISPATCH_FAILED',
          });
        },
        persistDispatched: () => ['unexpected:evidence'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'dispatch',
      processState: 'possibly-started',
      detailCode: 'E_FIXTURE_DISPATCH_FAILED',
    });
    expect(checkExecutionLock(root, 'dispatch-failure').state)
      .toBe('quarantined');
  });

  it('quarantines a returned dispatch when its durable projection fails', () => {
    const root = fixtureRoot();

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'post-dispatch-failure',
        boundaryEvidenceRefs: ['request:post-dispatch-failure'],
      },
      {
        ...recoveryHooks(root, 'post-dispatch-failure'),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: () => ['task-projection:executing'],
        dispatch: () => ({ dispatchId: 'returned-1' }),
        persistDispatched: () => {
          throw Object.assign(new Error('fixture'), {
            code: 'E_FIXTURE_DISPATCH_PROJECTION_FAILED',
          });
        },
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'persist-dispatched',
      processState: 'dispatch-returned',
      detailCode: 'E_FIXTURE_DISPATCH_PROJECTION_FAILED',
    });
  });

  it('refuses completion without durable dispatch evidence and blocks retry', () => {
    const root = fixtureRoot();
    let processCalls = 0;
    const hooks = {
      ...recoveryHooks(root, 'empty-dispatch-evidence'),
      revalidate: () => ({
        decision: 'dispatch' as const,
        evidenceRefs: ['task-snapshot:pending'],
      }),
      persistPrepared: () => ['task-projection:executing'],
      dispatch: () => {
        processCalls += 1;
        return { dispatchId: `dispatch-${processCalls}` };
      },
      persistDispatched: () => [],
      verifyDispatched: () => true,
    };

    const first = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'empty-dispatch-evidence',
        boundaryEvidenceRefs: ['request:empty-dispatch-evidence'],
      },
      hooks,
    );
    const retry = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'empty-dispatch-evidence',
        boundaryEvidenceRefs: ['request:empty-dispatch-evidence:retry'],
      },
      hooks,
    );

    expect(first).toMatchObject({
      state: 'quarantined',
      phase: 'persist-dispatched',
      processState: 'dispatch-returned',
      detailCode: 'E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_INVALID',
    });
    expect(retry).toMatchObject({
      state: 'quarantined',
      phase: 'acquire',
      processState: 'possibly-started',
      detailCode: 'execution-lock:quarantined',
    });
    expect(processCalls).toBe(1);
  });

  it('requires the caller to re-read and verify durable dispatch evidence', () => {
    const root = fixtureRoot();

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'unverified-dispatch-evidence',
        boundaryEvidenceRefs: ['request:unverified-dispatch-evidence'],
      },
      {
        ...recoveryHooks(root, 'unverified-dispatch-evidence'),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: () => ['task-projection:executing'],
        dispatch: () => ({ dispatchId: 'dispatch-unverified' }),
        persistDispatched: () => ['dispatch-receipt:unverified'],
        verifyDispatched: () => false,
      },
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'verify-dispatched',
      processState: 'dispatch-returned',
      detailCode: 'E_TASK_EXECUTION_ADMISSION_DISPATCH_EVIDENCE_UNVERIFIED',
    });
  });

  it('reserves one bounded evidence slot for a post-boundary failure', () => {
    const root = fixtureRoot();
    const boundaryEvidenceRefs = Array.from(
      { length: 8 },
      (_, index) => `boundary:${index}`,
    );

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'failure-evidence-slot',
        boundaryEvidenceRefs,
      },
      {
        ...recoveryHooks(root, 'failure-evidence-slot'),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending', 'dispatch-contract:v1'],
        }),
        persistPrepared: () => ['task-projection:executing'],
        dispatch: () => {
          throw Object.assign(new Error('fixture'), {
            code: 'E_FIXTURE_BOUNDARY_FAILURE',
          });
        },
        persistDispatched: () => ['unexpected:evidence'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      detailCode: 'E_FIXTURE_BOUNDARY_FAILURE',
      quarantine: {
        state: 'quarantined',
      },
    });
    if (outcome.state !== 'quarantined') {
      throw new Error('expected quarantined outcome');
    }
    expect(outcome.quarantine.evidenceRefs).toHaveLength(12);
  });

  it('admits the maximum reserved evidence shape and completes with 16 refs', () => {
    const root = fixtureRoot();
    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'maximum-success-evidence',
        boundaryEvidenceRefs: Array.from(
          { length: 8 },
          (_, index) => `request:${index}`,
        ),
      },
      {
        ...recoveryHooks(root, 'maximum-success-evidence', 2),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['revalidation:0', 'revalidation:1'],
        }),
        persistPrepared: () => ['prepared:0', 'prepared:1'],
        dispatch: () => ({ dispatchId: 'maximum-success' }),
        persistDispatched: () => ['dispatched:0', 'dispatched:1'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'dispatched',
      projectionCleanup: 'completed',
    });
    if (outcome.state !== 'dispatched') {
      throw new Error('expected dispatched outcome');
    }
    expect(outcome.evidenceRefs).toHaveLength(16);
  });

  it('rejects request evidence over the reserved count before any process hook', () => {
    const root = fixtureRoot();
    let recoveryCalls = 0;
    let processCalls = 0;
    const recovery = recoveryHooks(root, 'request-evidence-overflow');
    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'request-evidence-overflow',
        boundaryEvidenceRefs: Array.from(
          { length: 9 },
          (_, index) => `request:${index}`,
        ),
      },
      {
        ...recovery,
        persistRecoveryIntent: context => {
          recoveryCalls += 1;
          return recovery.persistRecoveryIntent(context);
        },
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: [],
        }),
        persistPrepared: () => ['prepared:never'],
        dispatch: () => {
          processCalls += 1;
          return 'never';
        },
        persistDispatched: () => ['dispatched:never'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'held',
      phase: 'acquire',
      processState: 'not-started',
      detailCode: 'E_TASK_EXECUTION_ADMISSION_BOUNDARY_EVIDENCE_INVALID',
    });
    expect(recoveryCalls).toBe(0);
    expect(processCalls).toBe(0);
  });

  it('rejects empty adoption evidence without calling recovery or process hooks', () => {
    const root = fixtureRoot();
    let recoveryCalls = 0;
    let processCalls = 0;
    const recovery = recoveryHooks(root, 'empty-adoption-evidence');
    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'empty-adoption-evidence',
        boundaryEvidenceRefs: ['request:empty-adoption-evidence'],
      },
      {
        ...recovery,
        revalidate: () => ({
          decision: 'adopt',
          value: { dispatchId: 'unproven' },
          evidenceRefs: [],
        }),
        persistRecoveryIntent: context => {
          recoveryCalls += 1;
          return recovery.persistRecoveryIntent(context);
        },
        verifyAdopted: () => true,
        persistPrepared: () => ['prepared:never'],
        dispatch: () => {
          processCalls += 1;
          return { dispatchId: 'never' };
        },
        persistDispatched: () => ['dispatched:never'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'held',
      phase: 'revalidate',
      processState: 'not-started',
      detailCode: 'E_TASK_EXECUTION_ADMISSION_REVALIDATION_EVIDENCE_INVALID',
    });
    expect(recoveryCalls).toBe(0);
    expect(processCalls).toBe(0);
  });

  it('rejects a thenable from the sync process hook and quarantines it', () => {
    const root = fixtureRoot();
    const hooks = {
      ...recoveryHooks(root, 'sync-thenable'),
      revalidate: () => ({
        decision: 'dispatch' as const,
        evidenceRefs: ['task-snapshot:pending'],
      }),
      persistPrepared: () => ['task-projection:executing'],
      dispatch: () => Promise.resolve('async-dispatch'),
      persistDispatched: () => ['unexpected:evidence'],
      verifyDispatched: () => true,
    } as unknown as TaskExecutionAdmissionSyncHooks<string>;

    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'sync-thenable',
        boundaryEvidenceRefs: ['request:sync-thenable'],
      },
      hooks,
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'dispatch',
      processState: 'possibly-started',
      detailCode: 'E_TASK_EXECUTION_ADMISSION_SYNC_THENABLE',
    });
  });

  it('consumes a rejected Promise returned by a sync hook before quarantining', async () => {
    const root = fixtureRoot();
    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId: 'sync-rejected-thenable',
        boundaryEvidenceRefs: ['request:sync-rejected-thenable'],
      },
      {
        ...recoveryHooks(root, 'sync-rejected-thenable'),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: () => ['task-projection:executing'],
        dispatch: () => Promise.reject(Object.assign(new Error('fixture'), {
          code: 'E_FIXTURE_REJECTED_THENABLE',
        })),
        persistDispatched: () => ['unexpected:evidence'],
        verifyDispatched: () => true,
      } as unknown as TaskExecutionAdmissionSyncHooks<string>,
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'dispatch',
      processState: 'possibly-started',
      detailCode: 'E_TASK_EXECUTION_ADMISSION_SYNC_THENABLE',
    });
    await new Promise<void>(resolve => setImmediate(resolve));
  });

  it('uses an immutable request snapshot when caller-owned input mutates', () => {
    const root = fixtureRoot();
    const boundaryEvidenceRefs = ['request:immutable'];
    const lockOptions = {
      leaseDurationMs: 30_000,
      heartbeatIntervalMs: 10_000,
    };
    const request = {
      projectRoot: root,
      taskId: 'immutable-request',
      boundaryEvidenceRefs,
      lockOptions,
    };
    const outcome = executeTaskExecutionAdmissionSync(
      request,
      {
        ...recoveryHooks(root, 'immutable-request'),
        revalidate: () => {
          request.projectRoot = join(root, 'replacement-root');
          request.taskId = 'mutated-task';
          boundaryEvidenceRefs.push('request:mutated');
          lockOptions.leaseDurationMs = 1;
          return {
            decision: 'dispatch',
            evidenceRefs: ['task-snapshot:pending'],
          };
        },
        persistPrepared: context => {
          expect(context.taskId).toBe('immutable-request');
          return ['task-projection:executing'];
        },
        dispatch: context => {
          expect(context.taskId).toBe('immutable-request');
          return { dispatchId: 'immutable-request' };
        },
        persistDispatched: () => ['dispatch-receipt:immutable-request'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome.state).toBe('dispatched');
    expect(checkExecutionLock(root, 'immutable-request')).toEqual({
      state: 'absent',
    });
  });

  it('surfaces terminal projection cleanup uncertainty as dispatched', () => {
    const root = fixtureRoot();
    const taskId = 'completion-projection-uncertain';
    const projectionPath = join(
      root,
      '.locks',
      `${createHash('sha256').update(taskId).digest('hex')}.executionlock`,
    );
    const outcome = executeTaskExecutionAdmissionSync(
      {
        projectRoot: root,
        taskId,
        boundaryEvidenceRefs: ['request:completion-projection-uncertain'],
        lockOptions: {
          terminalCommitObserver: () => {
            unlinkSync(projectionPath);
            mkdirSync(projectionPath);
          },
        },
      },
      {
        ...recoveryHooks(root, taskId),
        revalidate: () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: () => ['task-projection:executing'],
        dispatch: () => ({ dispatchId: 'completion-uncertain' }),
        persistDispatched: () => ['dispatch-receipt:completion-uncertain'],
        verifyDispatched: () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'dispatched',
      projectionCleanup: 'uncertain',
    });
    expect(checkExecutionLock(root, taskId).state).toBe('malformed');
  });

  it('reports project maintenance as a pre-process hold', () => {
    const root = fixtureRoot();
    const maintenance = acquireProjectMaintenanceLock(root);
    try {
      const outcome = executeTaskExecutionAdmissionSync(
        {
          projectRoot: root,
          taskId: 'maintenance-held',
          boundaryEvidenceRefs: ['request:maintenance-held'],
        },
        {
          ...recoveryHooks(root, 'maintenance-held'),
          revalidate: () => ({
            decision: 'dispatch',
            evidenceRefs: [],
          }),
          persistPrepared: () => ['unexpected:prepare'],
          dispatch: () => 'unexpected',
          persistDispatched: () => ['unexpected:dispatch'],
          verifyDispatched: () => true,
        },
      );

      expect(outcome).toMatchObject({
        state: 'held',
        phase: 'acquire',
        processState: 'not-started',
        detailCode: 'execution-lock:maintenance-held',
      });
    } finally {
      releaseExecutionLock(
        root,
        maintenance.taskId,
        maintenance.ownerId,
      );
    }
  });

  it('supports async preparation and dispatch under one heartbeat authority', async () => {
    const root = fixtureRoot();
    const order: string[] = [];

    const outcome = await executeTaskExecutionAdmission(
      {
        projectRoot: root,
        taskId: 'async-success',
        boundaryEvidenceRefs: ['request:async-success'],
        lockOptions: {
          leaseDurationMs: 1_000,
          heartbeatIntervalMs: 100,
        },
      },
      {
        ...recoveryHooks(root, 'async-success'),
        revalidate: async () => {
          await Promise.resolve();
          order.push('revalidate');
          return {
            decision: 'dispatch',
            evidenceRefs: ['task-snapshot:pending'],
          };
        },
        persistPrepared: async context => {
          await Promise.resolve();
          context.assertAuthority();
          order.push('prepare');
          return ['task-projection:executing'];
        },
        dispatch: async context => {
          await Promise.resolve();
          context.assertAuthority();
          order.push('dispatch');
          return { dispatchId: 'async-1' };
        },
        persistDispatched: async value => {
          await Promise.resolve();
          order.push('persist-dispatched');
          return [`dispatch:${value.dispatchId}`];
        },
        verifyDispatched: async () => {
          await Promise.resolve();
          return true;
        },
      },
    );

    expect(outcome.state).toBe('dispatched');
    expect(order).toEqual([
      'revalidate',
      'prepare',
      'dispatch',
      'persist-dispatched',
    ]);
    expect(checkExecutionLock(root, 'async-success')).toEqual({
      state: 'absent',
    });
  });

  it('shares one heap-scheduled timer across concurrent async admissions', async () => {
    const root = fixtureRoot();
    const concurrency = 64;
    let prepared = 0;
    let resolveAllPrepared!: () => void;
    const allPrepared = new Promise<void>(resolve => {
      resolveAllPrepared = resolve;
    });
    let releasePrepared!: () => void;
    const preparedBarrier = new Promise<void>(resolve => {
      releasePrepared = resolve;
    });

    const runs = Array.from({ length: concurrency }, (_, index) => {
      const taskId = `concurrent-${index}`;
      return executeTaskExecutionAdmission(
        {
          projectRoot: root,
          taskId,
          boundaryEvidenceRefs: [`request:${taskId}`],
          lockOptions: {
            leaseDurationMs: 3_000,
            heartbeatIntervalMs: 500,
          },
        },
        {
          ...recoveryHooks(root, taskId),
          revalidate: async () => ({
            decision: 'dispatch',
            evidenceRefs: [`task-snapshot:${taskId}`],
          }),
          persistPrepared: async () => {
            prepared += 1;
            if (prepared === concurrency) resolveAllPrepared();
            await preparedBarrier;
            return [`task-projection:${taskId}`];
          },
          dispatch: async () => ({ dispatchId: taskId }),
          persistDispatched: async () => [`dispatch-receipt:${taskId}`],
          verifyDispatched: async value => value.dispatchId === taskId,
        },
      );
    });

    await allPrepared;
    expect(__taskExecutionAdmissionHeartbeatDiagnosticsForTests()).toMatchObject({
      activeEntries: concurrency,
      heapEntries: concurrency,
      timerScheduled: true,
    });
    releasePrepared();
    const outcomes = await Promise.all(runs);
    expect(outcomes.every(outcome => outcome.state === 'dispatched')).toBe(true);
    expect(__taskExecutionAdmissionHeartbeatDiagnosticsForTests()).toEqual({
      activeEntries: 0,
      heapEntries: 0,
      timerScheduled: false,
    });
  }, 30_000);

  it('removes a stopped heap root and rebinds the sole timer to the next admission', async () => {
    const root = fixtureRoot();
    const createControlledRun = (taskId: string) => {
      let markPrepared!: () => void;
      const prepared = new Promise<void>(resolve => {
        markPrepared = resolve;
      });
      let releasePrepared!: () => void;
      const barrier = new Promise<void>(resolve => {
        releasePrepared = resolve;
      });
      const run = executeTaskExecutionAdmission(
        {
          projectRoot: root,
          taskId,
          boundaryEvidenceRefs: [`request:${taskId}`],
          lockOptions: {
            leaseDurationMs: 9_000,
            heartbeatIntervalMs: 3_000,
          },
        },
        {
          ...recoveryHooks(root, taskId),
          revalidate: async () => ({
            decision: 'dispatch',
            evidenceRefs: [`task-snapshot:${taskId}`],
          }),
          persistPrepared: async () => {
            markPrepared();
            await barrier;
            return [`task-projection:${taskId}`];
          },
          dispatch: async () => ({ dispatchId: taskId }),
          persistDispatched: async () => [`dispatch-receipt:${taskId}`],
          verifyDispatched: async value => value.dispatchId === taskId,
        },
      );
      return { taskId, run, prepared, releasePrepared };
    };

    const first = createControlledRun('timer-rebind-first');
    await first.prepared;
    const firstDue =
      __taskExecutionAdmissionHeartbeatDiagnosticsForTests().nextDueMs;
    expect(firstDue).toBeTypeOf('number');

    const second = createControlledRun('timer-rebind-second');
    await second.prepared;
    const both =
      __taskExecutionAdmissionHeartbeatDiagnosticsForTests();
    expect(both).toMatchObject({
      activeEntries: 2,
      heapEntries: 2,
      timerScheduled: true,
      scheduledForMs: both.nextDueMs,
    });

    const earliest = both.nextDueMs === firstDue ? first : second;
    const remaining = earliest === first ? second : first;
    earliest.releasePrepared();
    expect((await earliest.run).state).toBe('dispatched');

    const rebound =
      __taskExecutionAdmissionHeartbeatDiagnosticsForTests();
    expect(rebound).toMatchObject({
      activeEntries: 1,
      heapEntries: 1,
      timerScheduled: true,
      scheduledForMs: rebound.nextDueMs,
    });

    remaining.releasePrepared();
    expect((await remaining.run).state).toBe('dispatched');
    expect(__taskExecutionAdmissionHeartbeatDiagnosticsForTests()).toEqual({
      activeEntries: 0,
      heapEntries: 0,
      timerScheduled: false,
    });
  });

  it('verifies async adoption from durable evidence without starting heartbeat work', async () => {
    const root = fixtureRoot();
    const taskId = 'async-adoption';
    const dispatchPath = join(root, '.locks', `${taskId}.dispatch`);
    durableWrite(dispatchPath, 'existing-async');
    let processCalls = 0;
    let recoveryCalls = 0;
    const recovery = recoveryHooks(root, taskId);

    const outcome = await executeTaskExecutionAdmission(
      {
        projectRoot: root,
        taskId,
        boundaryEvidenceRefs: [`request:${taskId}`],
      },
      {
        ...recovery,
        revalidate: async () => ({
          decision: 'adopt',
          value: { dispatchId: readFileSync(dispatchPath, 'utf8') },
          evidenceRefs: ['dispatch-receipt:existing-async'],
        }),
        verifyAdopted: async value =>
          readFileSync(dispatchPath, 'utf8') === value.dispatchId,
        persistRecoveryIntent: context => {
          recoveryCalls += 1;
          return recovery.persistRecoveryIntent(context);
        },
        persistPrepared: async () => ['prepared:never'],
        dispatch: async () => {
          processCalls += 1;
          return { dispatchId: 'duplicate' };
        },
        persistDispatched: async () => ['dispatch:never'],
        verifyDispatched: async () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'adopted',
      value: { dispatchId: 'existing-async' },
    });
    expect(processCalls).toBe(0);
    expect(recoveryCalls).toBe(0);
    expect(__taskExecutionAdmissionHeartbeatDiagnosticsForTests()).toEqual({
      activeEntries: 0,
      heapEntries: 0,
      timerScheduled: false,
    });
  });

  it('settles async adoption against an immutable revalidation evidence snapshot', async () => {
    const root = fixtureRoot();
    const taskId = 'async-adoption-snapshot';
    const mutableEvidence = ['dispatch-receipt:original'];

    const outcome = await executeTaskExecutionAdmission(
      {
        projectRoot: root,
        taskId,
        boundaryEvidenceRefs: [`request:${taskId}`],
      },
      {
        ...recoveryHooks(root, taskId),
        revalidate: async () => ({
          decision: 'adopt',
          value: { dispatchId: 'original' },
          evidenceRefs: mutableEvidence,
        }),
        verifyAdopted: async (_value, evidenceRefs) => {
          mutableEvidence[0] = 'dispatch-receipt:mutated-after-verify';
          await Promise.resolve();
          return evidenceRefs.includes('dispatch-receipt:original');
        },
        persistPrepared: async () => ['prepared:never'],
        dispatch: async () => ({ dispatchId: 'duplicate' }),
        persistDispatched: async () => ['dispatch:never'],
        verifyDispatched: async () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'adopted',
      evidenceRefs: [
        'dispatch-receipt:original',
        `request:${taskId}`,
      ],
    });
    expect(outcome.evidenceRefs).not.toContain(
      'dispatch-receipt:mutated-after-verify',
    );
  });

  it('does not adopt after heartbeat authority fails during verification', async () => {
    const root = fixtureRoot();
    const taskId = 'async-adoption-heartbeat-fault';
    let publishCalls = 0;
    let markVerificationStarted!: () => void;
    const verificationStarted = new Promise<void>(resolve => {
      markVerificationStarted = resolve;
    });
    let finishVerification!: () => void;
    const verificationBarrier = new Promise<void>(resolve => {
      finishVerification = resolve;
    });
    const projectionPath = join(
      root,
      '.locks',
      `${createHash('sha256').update(taskId).digest('hex')}.executionlock`,
    );

    vi.useFakeTimers();
    try {
      const outcomePromise = executeTaskExecutionAdmission(
        {
          projectRoot: root,
          taskId,
          boundaryEvidenceRefs: [`request:${taskId}`],
          lockOptions: {
            leaseDurationMs: 200,
            heartbeatIntervalMs: 20,
            projectionPublisher: (_projectRoot, lock) => {
              publishCalls += 1;
              durableWrite(projectionPath, JSON.stringify(lock));
              if (publishCalls >= 2) {
                throw Object.assign(new Error('fixture'), {
                  code: 'E_FIXTURE_ADOPTION_HEARTBEAT_FAULT',
                });
              }
            },
          },
        },
        {
          ...recoveryHooks(root, taskId),
          revalidate: async () => ({
            decision: 'adopt',
            value: { dispatchId: 'existing' },
            evidenceRefs: ['dispatch-receipt:existing'],
          }),
          verifyAdopted: async () => {
            markVerificationStarted();
            await verificationBarrier;
            return true;
          },
          persistPrepared: async () => ['prepared:never'],
          dispatch: async () => ({ dispatchId: 'duplicate' }),
          persistDispatched: async () => ['dispatch:never'],
          verifyDispatched: async () => true,
        },
      );
      await verificationStarted;
      await vi.advanceTimersByTimeAsync(60);
      finishVerification();
      const outcome = await outcomePromise;

      expect(publishCalls).toBeGreaterThanOrEqual(2);
      expect(outcome).toMatchObject({
        state: 'held',
        phase: 'revalidate',
        processState: 'not-started',
      });
      expect(checkExecutionLock(root, taskId)).toEqual({ state: 'absent' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('refreshes a post-commit renewal handle before quarantining heartbeat fault', async () => {
    const root = fixtureRoot();
    const taskId = 'heartbeat-projection-fault';
    let publishCalls = 0;
    const projectionPath = join(
      root,
      '.locks',
      `${createHash('sha256').update(taskId).digest('hex')}.executionlock`,
    );

    const outcome = await executeTaskExecutionAdmission(
      {
        projectRoot: root,
        taskId,
        boundaryEvidenceRefs: ['request:heartbeat-projection-fault'],
        lockOptions: {
          leaseDurationMs: 200,
          heartbeatIntervalMs: 20,
          projectionPublisher: (_projectRoot, lock) => {
            publishCalls += 1;
            writeFileSync(projectionPath, JSON.stringify(lock), 'utf8');
            if (publishCalls >= 3) {
              throw Object.assign(new Error('fixture'), {
                code: 'E_FIXTURE_PROJECTION_AFTER_COMMIT',
              });
            }
          },
        },
      },
      {
        ...recoveryHooks(root, taskId),
        revalidate: async () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: async () => {
          await new Promise(resolve => setTimeout(resolve, 60));
          return ['task-projection:executing'];
        },
        dispatch: async () => ({ dispatchId: 'must-not-run' }),
        persistDispatched: async () => ['dispatch-receipt:must-not-run'],
        verifyDispatched: async () => true,
      },
    );

    expect(publishCalls).toBeGreaterThanOrEqual(3);
    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'prepare',
      processState: 'not-started',
      quarantine: {
        state: 'quarantined',
        reason: 'heartbeat-fault',
      },
    });
    expect(checkExecutionLock(root, taskId).state).toBe('quarantined');
  });

  it('records heartbeat failure even when the renewal seam throws undefined', async () => {
    const root = fixtureRoot();
    const taskId = 'heartbeat-throws-undefined';
    let publishCalls = 0;
    const projectionPath = join(
      root,
      '.locks',
      `${createHash('sha256').update(taskId).digest('hex')}.executionlock`,
    );

    const outcome = await executeTaskExecutionAdmission(
      {
        projectRoot: root,
        taskId,
        boundaryEvidenceRefs: ['request:heartbeat-throws-undefined'],
        lockOptions: {
          leaseDurationMs: 200,
          heartbeatIntervalMs: 20,
          projectionPublisher: (_projectRoot, lock) => {
            publishCalls += 1;
            writeFileSync(projectionPath, JSON.stringify(lock), 'utf8');
            if (publishCalls >= 3) throw undefined;
          },
        },
      },
      {
        ...recoveryHooks(root, taskId),
        revalidate: async () => ({
          decision: 'dispatch',
          evidenceRefs: ['task-snapshot:pending'],
        }),
        persistPrepared: async () => {
          await new Promise(resolve => setTimeout(resolve, 60));
          return ['task-projection:executing'];
        },
        dispatch: async () => ({ dispatchId: 'must-not-run' }),
        persistDispatched: async () => ['dispatch-receipt:must-not-run'],
        verifyDispatched: async () => true,
      },
    );

    expect(outcome).toMatchObject({
      state: 'quarantined',
      phase: 'prepare',
      processState: 'not-started',
      quarantine: {
        state: 'quarantined',
        reason: 'heartbeat-fault',
      },
    });
    expect(checkExecutionLock(root, taskId).state).toBe('quarantined');
  });
});
