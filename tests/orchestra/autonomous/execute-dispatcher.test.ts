import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeExecuteDispatcher } from '../../../src/orchestra/autonomous/execute-dispatcher.js';

// Hermeticity guard (MASTER 3356).
//
// A dispatch that reaches the production defaults calls
// `crossVerifyBacklogResult` → `runCrossVerify`, i.e. the real cross-verification
// path that resolves a provider. This suite stayed offline only because its
// fixture config happens to resolve as "unavailable" — an accident, not a
// contract: a config default change or an ambient credential would turn a unit
// test into a live provider call. Failing loudly here keeps that impossible for
// every test in this file, present and future, without changing what any of them
// asserts. A test that genuinely wants the path must inject its own seam.
vi.mock('../../../src/orchestra/cross-verify-runner.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/orchestra/cross-verify-runner.js')>()),
  runCrossVerify: vi.fn(() => {
    throw new Error(
      'HERMETICITY_GUARD: this suite reached the live cross-verify path. '
      + 'Inject a deterministic `crossVerify` seam into makeExecuteDispatcher instead.',
    );
  }),
}));
import { createDefaultRegistry } from '../../../src/core/capability-broker.js';
import { makeBoundedPool } from '../../../src/orchestra/autonomous/execution-pool.js';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry, BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../../src/core/types.js';
import type { ExecutionPool } from '../../../src/orchestra/autonomous/execution-pool.js';
import type { TaskResultSettlementRefV1 } from '../../../src/core/task-result-settlement.js';
import { TaskIngressDispositionError } from '../../../src/orchestra/task-mode-runner.js';
import type { ExactAcceptedTaskResultAuthorityMetadata } from '../../../src/orchestra/task-result-authority.js';

// ─── Shared helpers ──────────────────────────────────────────────────

const taskEntry: BacklogEntry = {
  id: 'e', title: 't', kind: 'task', spec: { description: 'do x', scopeDir: 'src/' },
  policy: 'auto', provider: 'ollama', model: 'qwen3.6:27b', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

const sprintEntry: BacklogEntry = {
  ...taskEntry, id: 'e-sprint', kind: 'sprint', spec: { directivesRef: 'D.md' },
};

const processEntry: BacklogEntry = {
  ...taskEntry, id: 'e-process', kind: 'process',
  spec: { description: 'run bounded process' },
};

const capabilityEntry: BacklogEntry = {
  ...taskEntry, id: 'e-cap', kind: 'capability', provider: undefined, model: undefined,
  spec: { capabilityTarget: { capability: 'echo', args: { ping: 'pong' } } },
};

/** Write a minimal backlog file containing the given entry and return its path. */
function seedBacklog(dir: string, entry: BacklogEntry): string {
  const bl: BacklogFile = { _version: '1.0', entries: [entry] };
  const path = join(dir, 'backlog.json');
  writeFileSync(path, JSON.stringify(bl, null, 2), 'utf-8');
  return path;
}

const doneResult: TaskResult = {
  taskId: 't', selfAssessment: 'DONE', testsPassed: true,
  filesChanged: [], notes: '', linesAdded: 0, linesRemoved: 0,
};

const noGoResult: TaskResult = {
  taskId: 't', selfAssessment: 'NO_GO', testsPassed: false,
  filesChanged: [], notes: '', linesAdded: 0, linesRemoved: 0,
};

function exactAcceptedAuthorityFor(
  taskId: string,
): ExactAcceptedTaskResultAuthorityMetadata {
  const digest = `sha256:${'a'.repeat(64)}` as const;
  const identity = Object.freeze({
    schemaVersion: 2 as const,
    backend: 'docker' as const,
    projectRootSha256: 'b'.repeat(64),
    projectId: 'fixture-project',
    taskId,
    attemptId: `attempt-${taskId}`,
    generation: 1,
  });
  return Object.freeze({
    executionMode: 'normal-docker' as const,
    identity,
    admissionReceiptDigest: digest,
    acceptedResultRef: Object.freeze({
      schemaVersion: 2 as const,
      kind: 'task-accepted-result-v2-ref' as const,
      identity,
      artifactKey: 'primary',
      artifactReceiptDigest: digest,
    }),
    acceptedResultChainDigest: digest,
    resultDigest: digest,
  });
}

// CORE-UNIFORMITY (slice 1): the task branch now runs the real Brain-Eval kernel,
// which schema-rejects the minimal fixtures above. These deterministic stubs keep the
// task-branch wiring tests hermetic (they assert dispatch/status flow, not the kernel).
const okEval = () => ({ decision: 'DONE' as const, quality: 100, reconciled: false, reason: 'ok' });
const okAudit = async () => ({ boundary: 'clean' as const, adr: 'ok' as const, functional: 'pass' as const });
const skipXVerify = async () => ({ ran: false });

const settlementRef = (taskId: string): TaskResultSettlementRefV1 => ({
  schemaVersion: 1,
  taskId,
  backend: 'docker',
  projectRootSha256: 'a'.repeat(64),
  attemptId: '00000000-0000-4000-8000-000000000001',
});

function taskIngressDispositionError(
  taskId: string,
  state: 'not-dispatched' | 'reconciliation-required',
): TaskIngressDispositionError {
  const ambiguous = state === 'reconciliation-required';
  const reasonCode = ambiguous
    ? 'EXACT_DISPATCH_OUTCOME_AMBIGUOUS'
    : 'EXACT_PROVIDER_START_NOT_PROVEN';
  return new TaskIngressDispositionError({
    disposition: ambiguous
      ? {
          kind: 'ambiguous',
          taskId,
          reasonCode,
          executionMode: 'normal-docker-exact',
          executionBackend: 'docker',
        }
      : {
          kind: 'not-dispatched',
          taskId,
          reasonCode,
          executionMode: 'normal-docker-exact',
          executionBackend: 'docker',
        },
    executionMode: 'normal-docker-exact',
    backend: 'docker',
    provider: 'claude',
    invocation: {
      receiptRef: {
        schemaVersion: 1,
        invocationId: `${ambiguous ? 'reconcile' : 'zero'}:${taskId}`,
        tenantId: 'local',
        projectId: 'test',
      },
      executionBackend: 'docker',
      transport: 'local-runtime',
      state,
      executionMode: 'normal-docker-exact',
      reasonCode,
      authorityEvidenceRefs: [
        `${ambiguous ? 'reconciliation' : 'zero-work'}-receipt:${taskId}`,
        `sha256:${ambiguous ? 'd'.repeat(64) : 'c'.repeat(64)}`,
      ],
    },
  });
}

// ─── Tmpdir management ───────────────────────────────────────────────

let tmpDir: string;
beforeEach(() => {
  tmpDir = join(tmpdir(), `exec-disp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
});
afterEach(() => {
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('hermeticity guard', () => {
  // Proves the guard is wired: without it, a dispatch that falls through to the
  // production defaults would call the real cross-verification path instead of
  // failing the test. The guard is only worth having if it actually fires.
  it('fails loudly when the live cross-verify path is reached', async () => {
    const { crossVerifyBacklogResult } = await import(
      '../../../src/orchestra/autonomous/backlog-eval.js'
    );
    await expect(
      crossVerifyBacklogResult(
        taskEntry, { taskId: 't' } as never, tmpDir, undefined,
        { decision: 'NO_GO', quality: 0, reconciled: false, reason: 'x' } as never,
      ),
    ).rejects.toThrow('HERMETICITY_GUARD');
  });
});

describe('execute-dispatcher — provider authority admission', () => {
  it.each([
    ['task', taskEntry],
    ['sprint', sprintEntry],
    ['process', processEntry],
  ] as const)('parks kind=%s before JIT or dispatch with durable HOLD provenance', async (_kind, entry) => {
    const planned = { ...entry, planned: true, summary: 'bounded work' };
    const backlogPath = seedBacklog(tmpDir, planned);
    const runTask = vi.fn();
    const executeSprint = vi.fn();
    const waitForResult = vi.fn();
    const jitComplete = vi.fn();
    const hold = {
      schemaVersion: 1 as const,
      executionId: entry.id,
      tenantId: 'local',
      projectId: null,
      reasonCode: 'candidate_authority_unavailable',
      authorityEvidenceRefs: ['provider-authority:root', 'provider-execution-ingress:request'],
      heldAt: '2026-07-25T00:00:00.000Z',
    };
    const admitProviderExecution = vi.fn().mockResolvedValue({
      decision: 'hold',
      hold,
    });

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask,
      executeSprint,
      backlogPath,
      waitForResult,
      jitComplete,
      admitProviderExecution,
    });

    const result = await handler('autonomous.execute', { entry: planned });

    expect(result).toEqual({
      outcome: 'failure',
      error: 'provider-authority: candidate_authority_unavailable',
    });
    expect(admitProviderExecution).toHaveBeenCalledOnce();
    expect(admitProviderExecution).toHaveBeenCalledWith(planned);
    expect(jitComplete).not.toHaveBeenCalled();
    expect(runTask).not.toHaveBeenCalled();
    expect(executeSprint).not.toHaveBeenCalled();
    expect(waitForResult).not.toHaveBeenCalled();
    expect(loadBacklog(backlogPath).entries[0]).toMatchObject({
      status: 'parked',
      lastResult: {
        ok: false,
        reason: 'provider-authority: candidate_authority_unavailable',
        providerAuthorityHold: hold,
      },
    });
  });

  it('keeps provider-free capability execution outside the provider admission gate', async () => {
    const backlogPath = seedBacklog(tmpDir, capabilityEntry);
    const admitProviderExecution = vi.fn();
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn(),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult: vi.fn(),
      capabilityRegistry: createDefaultRegistry(),
      admitProviderExecution,
      runBudgetedDecay: vi.fn(),
    });

    expect((await handler('autonomous.execute', { entry: capabilityEntry })).outcome).toBe('success');
    expect(admitProviderExecution).not.toHaveBeenCalled();
    expect(loadBacklog(backlogPath).entries[0]?.status).toBe('done');
  });

  it('fails loudly before JIT/dispatch when canonical admission rejects the identity', async () => {
    const planned = { ...taskEntry, planned: true, summary: 'bounded work' };
    const backlogPath = seedBacklog(tmpDir, planned);
    const runTask = vi.fn();
    const executeSprint = vi.fn();
    const jitComplete = vi.fn();
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask,
      executeSprint,
      backlogPath,
      waitForResult: vi.fn(),
      jitComplete,
      admitProviderExecution: () => {
        throw new Error('E_PROVIDER_MODEL_MISMATCH');
      },
    });

    const result = await handler('autonomous.execute', { entry: planned });

    expect(result.outcome).toBe('failure');
    expect(result.error).toContain('provider-authority-admission-error');
    expect(result.error).toContain('E_PROVIDER_MODEL_MISMATCH');
    expect(jitComplete).not.toHaveBeenCalled();
    expect(runTask).not.toHaveBeenCalled();
    expect(executeSprint).not.toHaveBeenCalled();
    expect(loadBacklog(backlogPath).entries[0]).toMatchObject({
      status: 'failed',
      lastResult: {
        ok: false,
        reason: expect.stringContaining('E_PROVIDER_MODEL_MISMATCH'),
      },
    });
  });
});

describe('execute-dispatcher — capability branch (F8 broker dispatch)', () => {
  it('kind=capability → registry invoked, backlog moves pending→running→done', async () => {
    const backlogPath = seedBacklog(tmpDir, capabilityEntry);
    const registry = createDefaultRegistry(); // echo + fs.read preinstalled
    const runTask = vi.fn();
    const executeSprint = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint,
      backlogPath, waitForResult: vi.fn(),
      capabilityRegistry: registry,
    });

    const res = await handler('autonomous.execute', { entry: capabilityEntry });

    expect(res.outcome).toBe('success');
    expect(runTask).not.toHaveBeenCalled();
    expect(executeSprint).not.toHaveBeenCalled();
    const e = loadBacklog(backlogPath).entries.find((x) => x.id === 'e-cap');
    expect(e?.status).toBe('done');
    expect(e?.lastResult?.ok).toBe(true);
    expect(e?.lastResult?.reason).toMatch(/echo/);
  });

  it('kind=capability: unknown verb → CAPABILITY_NOT_FOUND, entry failed', async () => {
    const entry: BacklogEntry = {
      ...capabilityEntry, id: 'e-cap-miss',
      spec: { capabilityTarget: { capability: 'erp.read' } },
    };
    const backlogPath = seedBacklog(tmpDir, entry);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
      capabilityRegistry: createDefaultRegistry(),
    });

    const res = await handler('autonomous.execute', { entry });

    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/CAPABILITY_NOT_FOUND/);
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('failed');
  });

  it('kind=capability without a wired registry → failure with a clear reason', async () => {
    const backlogPath = seedBacklog(tmpDir, capabilityEntry);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
    });

    const res = await handler('autonomous.execute', { entry: capabilityEntry });

    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/registry/i);
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('failed');
  });

  it('kind=capability with a missing capabilityTarget in the PAYLOAD → failure (defensive)', async () => {
    // Intake validation forbids a target-less capability entry ON DISK; the
    // defensive branch guards the payload-borne copy (trigger payload may
    // drift from disk state). Seed a valid disk entry, send a broken payload.
    const backlogPath = seedBacklog(tmpDir, capabilityEntry);
    const broken = { ...capabilityEntry, spec: {} } as BacklogEntry;
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
      capabilityRegistry: createDefaultRegistry(),
    });

    const res = await handler('autonomous.execute', { entry: broken });

    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/capabilityTarget/);
    expect(loadBacklog(backlogPath).entries[0]!.status).toBe('failed');
  });

  it('kind=capability passes projectRoot + tenant-derived actor into the invocation context', async () => {
    const entry: BacklogEntry = { ...capabilityEntry, id: 'e-cap-ctx', tenant: 'acme' };
    const backlogPath = seedBacklog(tmpDir, entry);
    const registry = createDefaultRegistry();
    let seenCtx: unknown;
    registry.register('ctx.probe', {
      requiredCapability: 'mcp-tool',
      invoke: (_args, ctx) => { seenCtx = ctx; return {}; },
    });
    entry.spec = { capabilityTarget: { capability: 'ctx.probe' } };

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
      capabilityRegistry: registry,
    });
    await handler('autonomous.execute', { entry });

    expect(seenCtx).toMatchObject({ projectRoot: tmpDir, actor: { id: 'system', tenantId: 'acme' } });
  });
});

describe('execute-dispatcher', () => {
  it('kind=task → runTask invoked with entry provider/model, backlog moves pending→running→done', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);
    const executeSprint = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint,
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalledOnce();
    expect(executeSprint).not.toHaveBeenCalled();
    const ctx = runTask.mock.calls[0]![0];
    expect(ctx.model).toBe('qwen3.6:27b');
    expect(ctx.provider).toBe('ollama');

    // Gap B: backlog entry ends in 'done' with lastResult
    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'e');
    expect(e?.status).toBe('done');
    expect(e?.lastResult?.ok).toBe(true);
  });

  it('kind=task: waitForResult→null (timeout) → entry becomes failed, outcome=failure', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(null); // timeout

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });

    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/timeout/);

    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'e');
    expect(e?.status).toBe('failed');
    expect(e?.lastResult?.ok).toBe(false);
  });

  it('threads the exact Docker settlement authority into result waiting', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const ref = settlementRef('t');
    const waitForResult = vi.fn().mockResolvedValue(doneResult);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn().mockResolvedValue({ taskId: 't', settlementRef: ref }),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult,
      evaluate: okEval,
      audit: okAudit,
      crossVerify: skipXVerify,
    });

    expect((await handler('autonomous.execute', { entry: taskEntry })).outcome).toBe('success');
    expect(waitForResult).toHaveBeenCalledWith(
      tmpDir,
      't',
      600_000,
      { settlementRef: ref },
    );
  });

  it('uses exact accepted-result authority without polling the public result projection', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const waitForResult = vi.fn();
    const exactAcceptedAuthority = exactAcceptedAuthorityFor('t-exact');
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn().mockResolvedValue({
        taskId: 't-exact',
        executionMode: 'normal-docker-exact',
        resultAuthority: {
          state: 'exact-accepted',
          result: Object.freeze({
            ...doneResult,
            taskId: 't-exact',
            exactAcceptedResultAuthority: exactAcceptedAuthority,
          }),
          settlementRef: null,
          rawResultPath: join(tmpDir, '.tasks', 'task-t-exact.result'),
          exactAcceptedAuthority,
        },
      }),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult,
      evaluate: okEval,
      audit: okAudit,
      crossVerify: skipXVerify,
    });

    expect((await handler('autonomous.execute', { entry: taskEntry })).outcome).toBe('success');
    expect(waitForResult).not.toHaveBeenCalled();
    expect(loadBacklog(backlogPath).entries.find((x) => x.id === 'e')?.status).toBe('done');
  });

  it('rejects a metadata-less exact accepted projection without polling public bytes', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const waitForResult = vi.fn().mockResolvedValue(doneResult);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn().mockResolvedValue({
        taskId: 't-exact-unbound',
        executionMode: 'normal-docker-exact',
        resultAuthority: {
          state: 'exact-accepted',
          result: { ...doneResult, taskId: 't-exact-unbound' },
          settlementRef: null,
          rawResultPath: join(tmpDir, '.tasks', 'task-t-exact-unbound.result'),
        },
      }),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult,
    });

    const outcome = await handler('autonomous.execute', { entry: taskEntry });
    expect(outcome.outcome).toBe('failure');
    expect(outcome.error).toContain('projection-or-identity-mismatch');
    expect(waitForResult).not.toHaveBeenCalled();
  });

  it('fails closed when exact accepted-result authority is unavailable', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const waitForResult = vi.fn().mockResolvedValue(doneResult);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn().mockResolvedValue({
        taskId: 't-exact-hold',
        executionMode: 'normal-docker-exact',
        resultAuthority: {
          state: 'authority-hold',
          result: null,
          settlementRef: null,
          rawResultPath: join(tmpDir, '.tasks', 'task-t-exact-hold.result'),
          holdReason: 'ACCEPTED_RESULT_RECEIPT_MISSING',
        },
      }),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult,
    });

    const outcome = await handler('autonomous.execute', { entry: taskEntry });
    expect(outcome.outcome).toBe('failure');
    expect(outcome.error).toContain('EXACT_RESULT_AUTHORITY_HOLD:authority-hold');
    expect(waitForResult).not.toHaveBeenCalled();
    expect(loadBacklog(backlogPath).entries.find((x) => x.id === 'e')?.status).toBe('failed');
  });

  it('kind=task: selfAssessment=NO_GO → entry failed, outcome=failure', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(noGoResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: () => ({ decision: 'NO_GO', quality: 0, reconciled: false, reason: 'worker failed' }),
      audit: okAudit,
      crossVerify: skipXVerify,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('failure');

    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'e');
    expect(e?.status).toBe('failed');
  });

  it('kind=task: GO_WITH_TECH_DEBT → success (mirrors run.ts:320)', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue({
      ...doneResult, selfAssessment: 'GO_WITH_TECH_DEBT',
    });

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: () => ({ decision: 'GO_WITH_TECH_DEBT', quality: 80, reconciled: false, reason: 'tech debt' }),
      audit: okAudit, crossVerify: skipXVerify,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('success');

    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((x) => x.id === 'e')?.status).toBe('done');
  });

  it('kind=task: runTask returns no taskId → failure (cannot track completion)', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({}); // no taskId field
    const waitForResult = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/no taskId/);
    // waitForResult must NOT be called (no id to wait on)
    expect(waitForResult).not.toHaveBeenCalled();

    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((x) => x.id === 'e')?.status).toBe('failed');
  });

  it('persists proven zero-work ingress evidence as failed without calling the result waiter', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const waitForResult = vi.fn();
    const error = taskIngressDispositionError('t-zero', 'not-dispatched');
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn().mockRejectedValue(error),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult,
    });

    const outcome = await handler('autonomous.execute', { entry: taskEntry });
    const persisted = loadBacklog(backlogPath).entries.find((x) => x.id === 'e');

    expect(error.code).toBe('TASK_INGRESS_NOT_DISPATCHED');
    expect(outcome.outcome).toBe('failure');
    expect(waitForResult).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({
      status: 'failed',
      lastResult: {
        taskIngressDisposition: {
          state: 'not-dispatched',
          reasonCode: 'EXACT_PROVIDER_START_NOT_PROVEN',
          receiptRef: { invocationId: 'zero:t-zero' },
          authorityEvidenceRefs: expect.arrayContaining([
            expect.stringContaining('zero-work-receipt:t-zero'),
          ]),
        },
      },
    });
  });

  it('parks process execution with durable reconciliation evidence instead of generic failure', async () => {
    const entry: BacklogEntry = {
      ...processEntry,
      spec: { steps: [{ description: 'exact child' }] } as BacklogEntry['spec'],
    };
    const backlogPath = seedBacklog(tmpDir, entry);
    const waitForResult = vi.fn();
    const runBudgetedDecay = vi.fn();
    const error = taskIngressDispositionError('t-ambiguous', 'reconciliation-required');
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn().mockRejectedValue(error),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult,
      runBudgetedDecay,
    });

    const outcome = await handler('autonomous.execute', { entry });
    const persisted = loadBacklog(backlogPath).entries.find((x) => x.id === entry.id);

    expect(error.code).toBe('TASK_INGRESS_RECONCILIATION_REQUIRED');
    expect(outcome.outcome).toBe('failure');
    expect(outcome.error).toContain('TASK_INGRESS_RECONCILIATION_REQUIRED');
    expect(waitForResult).not.toHaveBeenCalled();
    expect(runBudgetedDecay).not.toHaveBeenCalled();
    expect(persisted).toMatchObject({
      status: 'parked',
      lastResult: {
        taskIngressDisposition: {
          state: 'reconciliation-required',
          reasonCode: 'EXACT_DISPATCH_OUTCOME_AMBIGUOUS',
          receiptRef: { invocationId: 'reconcile:t-ambiguous' },
          authorityEvidenceRefs: expect.arrayContaining([
            expect.stringContaining('reconciliation-receipt:t-ambiguous'),
          ]),
        },
      },
    });
  });

  it('returns a typed durability HOLD and emits no parked claim when backlog publication fails', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runBudgetedDecay = vi.fn();
    const flowStep = vi.fn();
    const error = taskIngressDispositionError('t-write-failure', 'reconciliation-required');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn().mockImplementation(async () => {
        rmSync(backlogPath);
        throw error;
      }),
      executeSprint: vi.fn(),
      backlogPath,
      waitForResult: vi.fn(),
      runBudgetedDecay,
      flow: { step: flowStep },
    });

    try {
      const outcome = await handler('autonomous.execute', { entry: taskEntry });

      expect(outcome).toMatchObject({
        outcome: 'failure',
        error: expect.stringContaining('AUTONOMOUS_TASK_INGRESS_DISPOSITION_DURABILITY_HOLD'),
      });
      expect(outcome.error).toContain('receipt=reconcile:t-write-failure');
      expect(flowStep).not.toHaveBeenCalledWith('parked', expect.anything(), expect.anything());
      expect(runBudgetedDecay).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('kind=sprint success → entry done, outcome=success', async () => {
    const backlogPath = seedBacklog(tmpDir, sprintEntry);
    const runTask = vi.fn();
    const exactRef = {
      schemaVersion: 1 as const,
      flowId: 'flow-sprint',
      revision: 1,
      planDigest: 'a'.repeat(64),
    };
    const executeSprint = vi.fn().mockResolvedValue({
      status: 'settled',
      exactRef,
      attempt: {},
      handle: { flowId: exactRef.flowId, jobId: 'job-1', logRef: 'job-1' },
      settlement: {
        state: 'COMPLETED',
        code: 'SPRINT_COMPLETE',
        settledAt: '2026-07-28T00:00:00.000Z',
      },
    });
    const waitForResult = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint,
      backlogPath, waitForResult,
    });

    const res = await handler('autonomous.execute', { entry: sprintEntry });
    expect(res.outcome).toBe('success');
    expect(executeSprint).toHaveBeenCalledOnce();
    expect(executeSprint).toHaveBeenCalledWith(expect.objectContaining({
      projectRoot: tmpDir,
      executionMode: 'in-process',
      source: expect.objectContaining({
        kind: 'unplanned',
        ingress: expect.objectContaining({
          kind: 'autonomous',
          id: 'e-sprint',
          directives: 'D.md',
        }),
      }),
      lineage: expect.objectContaining({
        tenantId: 'local',
        actor: { id: 'autonomous-engine', tenantId: 'local' },
        origin: 'autonomous',
        correlationId: 'autonomous:local:e-sprint',
        idempotencyKey: 'autonomous:local:e-sprint:exact-plan-v1',
        authorization: { kind: 'approved-actor' },
      }),
    }));
    expect(waitForResult).not.toHaveBeenCalled(); // sprint doesn't use waitForResult

    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'e-sprint');
    expect(e?.status).toBe('done');
    expect(e?.spec).toEqual({ exactPlanRef: exactRef });
  });

  it('persists an authored exact ref and parks while digest-bound approval is pending', async () => {
    const backlogPath = seedBacklog(tmpDir, sprintEntry);
    const exactRef = {
      schemaVersion: 1 as const,
      flowId: 'flow-awaiting',
      revision: 1,
      planDigest: 'b'.repeat(64),
    };
    const executeSprint = vi.fn().mockResolvedValue({
      status: 'awaiting-approval',
      exactRef,
      reasonCode: 'EXACT_PLAN_APPROVAL_REQUIRED',
    });
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir,
      config: {} as never,
      runTask: vi.fn(),
      executeSprint,
      backlogPath,
      waitForResult: vi.fn(),
    });

    const result = await handler('autonomous.execute', { entry: sprintEntry });

    expect(result).toEqual({
      outcome: 'failure',
      error: 'EXACT_PLAN_APPROVAL_REQUIRED',
    });
    expect(loadBacklog(backlogPath).entries[0]).toMatchObject({
      status: 'parked',
      spec: { exactPlanRef: exactRef },
      lastResult: { ok: false, reason: 'EXACT_PLAN_APPROVAL_REQUIRED' },
    });
  });

  it('missing entry payload → failure (no silent success)', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
    });
    const res = await handler('autonomous.execute', {});
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/entry/);
  });

  it('runTask throwing → outcome=failure, entry becomes failed', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn(() => { throw new Error('boom'); });

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
    });
    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('failure');
    expect(res.error).toContain('boom');

    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((x) => x.id === 'e')?.status).toBe('failed');
  });

  it('runTask returning rejected promise → outcome=failure (async rejection caught)', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockRejectedValue(new Error('async-boom'));

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
    });
    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('failure');
    expect(res.error).toContain('async-boom');
  });

  it('executeSprint rejecting → failure with error, entry becomes failed', async () => {
    const backlogPath = seedBacklog(tmpDir, sprintEntry);
    const executeSprint = vi.fn().mockRejectedValue(new Error('sprint-fail'));

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), executeSprint,
      backlogPath, waitForResult: vi.fn(),
    });
    const res = await handler('autonomous.execute', { entry: sprintEntry });
    expect(res.outcome).toBe('failure');
    expect(res.error).toContain('sprint-fail');

    const bl = loadBacklog(backlogPath);
    expect(bl.entries.find((x) => x.id === 'e-sprint')?.status).toBe('failed');
  });

  it('falls back to entry.title when spec.description is absent', async () => {
    const entryNoDesc: BacklogEntry = { ...taskEntry, id: 'e-nd', spec: { scopeDir: '.' } };
    const backlogPath = seedBacklog(tmpDir, entryNoDesc);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
    });
    await handler('autonomous.execute', { entry: entryNoDesc });
    expect(runTask.mock.calls[0]![0].description).toBe('t');
  });

  it('AUTONOMOUS_EXECUTE_ACTION constant is exported and stable', async () => {
    const mod = await import('../../../src/orchestra/autonomous/execute-dispatcher.js');
    expect(mod.AUTONOMOUS_EXECUTE_ACTION).toBe('autonomous.execute');
  });

  it('resultTimeoutMs is forwarded to waitForResult', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      resultTimeoutMs: 42_000,
    });
    await handler('autonomous.execute', { entry: taskEntry });
    expect(waitForResult).toHaveBeenCalledWith(tmpDir, 't', 42_000);
  });

  // ── pool integration tests ────────────────────────────────────────────

  it('pool.submit is called when pool is provided', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    const mockPool: ExecutionPool = { submit: vi.fn((job) => job()) };

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
      pool: mockPool,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('success');
    expect((mockPool.submit as ReturnType<typeof vi.fn>)).toHaveBeenCalledOnce();
    expect(runTask).toHaveBeenCalledOnce();
  });

  it('no pool → direct execution (serial fallback, backward-safe)', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(doneResult);

    // No pool provided — must behave exactly like before
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, executeSprint: vi.fn(),
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalledOnce();
  });
});

// ── makeBoundedPool unit tests ────────────────────────────────────────

describe('makeBoundedPool', () => {
  it('maxConcurrency=1 runs jobs serially (one at a time)', async () => {
    const pool = makeBoundedPool(1);
    const order: number[] = [];
    let resolve1!: () => void;
    const blocker = new Promise<void>((res) => { resolve1 = res; });

    const j1 = pool.submit(async () => { await blocker; order.push(1); });
    const j2 = pool.submit(async () => { order.push(2); });

    // j1 is in-flight, j2 is queued; order is empty so far
    expect(order).toEqual([]);
    resolve1();
    await Promise.all([j1, j2]);
    expect(order).toEqual([1, 2]);
  });

  it('maxConcurrency=2 allows two jobs to run in parallel', async () => {
    const pool = makeBoundedPool(2);
    const started: number[] = [];
    let resolve1!: () => void;
    let resolve2!: () => void;

    const p1 = new Promise<void>((res) => { resolve1 = res; });
    const p2 = new Promise<void>((res) => { resolve2 = res; });

    const j1 = pool.submit(async () => { started.push(1); await p1; });
    const j2 = pool.submit(async () => { started.push(2); await p2; });
    // Both should have started immediately (both within the concurrency limit)
    await Promise.resolve(); // flush microtasks
    expect(started).toContain(1);
    expect(started).toContain(2);

    resolve1();
    resolve2();
    await Promise.all([j1, j2]);
  });

  it('caps in-flight at maxConcurrency — third job waits for a slot', async () => {
    const pool = makeBoundedPool(2);
    const started: number[] = [];
    const resolvers: Array<() => void> = [];

    const jobs = [1, 2, 3].map((n) =>
      pool.submit(async () => {
        started.push(n);
        await new Promise<void>((res) => { resolvers[n - 1] = res; });
      }),
    );

    // Allow microtasks to settle so jobs 1+2 can start
    await Promise.resolve();
    await Promise.resolve();

    // Only jobs 1 and 2 should have started; job 3 is queued
    expect(started).toContain(1);
    expect(started).toContain(2);
    expect(started).not.toContain(3);

    // Free one slot — job 3 should now start
    resolvers[0]!();
    await jobs[0];
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toContain(3);

    resolvers[1]!();
    resolvers[2]!();
    await Promise.all(jobs);
  });

  it('error in one job propagates to its promise but does not block subsequent jobs', async () => {
    const pool = makeBoundedPool(1);
    const j1 = pool.submit(async () => { throw new Error('oops'); });
    const j2 = pool.submit(async () => 42);

    await expect(j1).rejects.toThrow('oops');
    await expect(j2).resolves.toBe(42);
  });
});
