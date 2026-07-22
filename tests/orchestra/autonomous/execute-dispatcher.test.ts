import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeExecuteDispatcher } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import { createDefaultRegistry } from '../../../src/core/capability-broker.js';
import { makeBoundedPool } from '../../../src/orchestra/autonomous/execution-pool.js';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry, BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../../src/core/types.js';
import type { ExecutionPool } from '../../../src/orchestra/autonomous/execution-pool.js';
import type { TaskResultSettlementRefV1 } from '../../../src/core/task-result-settlement.js';

// ─── Shared helpers ──────────────────────────────────────────────────

const taskEntry: BacklogEntry = {
  id: 'e', title: 't', kind: 'task', spec: { description: 'do x', scopeDir: 'src/' },
  policy: 'auto', provider: 'ollama', model: 'qwen3.6:27b', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

const sprintEntry: BacklogEntry = {
  ...taskEntry, id: 'e-sprint', kind: 'sprint', spec: { directivesRef: 'D.md' },
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

describe('execute-dispatcher — capability branch (F8 broker dispatch)', () => {
  it('kind=capability → registry invoked, backlog moves pending→running→done', async () => {
    const backlogPath = seedBacklog(tmpDir, capabilityEntry);
    const registry = createDefaultRegistry(); // echo + fs.read preinstalled
    const runTask = vi.fn();
    const runSprint = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint,
      backlogPath, waitForResult: vi.fn(),
      capabilityRegistry: registry,
    });

    const res = await handler('autonomous.execute', { entry: capabilityEntry });

    expect(res.outcome).toBe('success');
    expect(runTask).not.toHaveBeenCalled();
    expect(runSprint).not.toHaveBeenCalled();
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
      runTask: vi.fn(), runSprint: vi.fn(),
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
      runTask: vi.fn(), runSprint: vi.fn(),
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
      runTask: vi.fn(), runSprint: vi.fn(),
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
      runTask: vi.fn(), runSprint: vi.fn(),
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
    const runSprint = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint,
      backlogPath, waitForResult,
      evaluate: okEval, audit: okAudit, crossVerify: skipXVerify,
    });

    const res = await handler('autonomous.execute', { entry: taskEntry });

    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalledOnce();
    expect(runSprint).not.toHaveBeenCalled();
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
      runTask, runSprint: vi.fn(),
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
      runSprint: vi.fn(),
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

  it('kind=task: selfAssessment=NO_GO → entry failed, outcome=failure', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const runTask = vi.fn().mockResolvedValue({ taskId: 't' });
    const waitForResult = vi.fn().mockResolvedValue(noGoResult);

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint: vi.fn(),
      backlogPath, waitForResult,
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
      runTask, runSprint: vi.fn(),
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
      runTask, runSprint: vi.fn(),
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

  it('kind=sprint success → entry done, outcome=success', async () => {
    const backlogPath = seedBacklog(tmpDir, sprintEntry);
    const runTask = vi.fn();
    const runSprint = vi.fn().mockResolvedValue({});
    const waitForResult = vi.fn();

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask, runSprint,
      backlogPath, waitForResult,
    });

    const res = await handler('autonomous.execute', { entry: sprintEntry });
    expect(res.outcome).toBe('success');
    expect(runSprint).toHaveBeenCalledOnce();
    expect(waitForResult).not.toHaveBeenCalled(); // sprint doesn't use waitForResult

    const bl = loadBacklog(backlogPath);
    const e = bl.entries.find((x) => x.id === 'e-sprint');
    expect(e?.status).toBe('done');
  });

  it('missing entry payload → failure (no silent success)', async () => {
    const backlogPath = seedBacklog(tmpDir, taskEntry);
    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), runSprint: vi.fn(),
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
      runTask, runSprint: vi.fn(),
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
      runTask, runSprint: vi.fn(),
      backlogPath, waitForResult: vi.fn(),
    });
    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('failure');
    expect(res.error).toContain('async-boom');
  });

  it('runSprint rejecting → failure with error, entry becomes failed', async () => {
    const backlogPath = seedBacklog(tmpDir, sprintEntry);
    const runSprint = vi.fn().mockRejectedValue(new Error('sprint-fail'));

    const handler = makeExecuteDispatcher({
      projectRoot: tmpDir, config: {} as never,
      runTask: vi.fn(), runSprint,
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
      runTask, runSprint: vi.fn(),
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
      runTask, runSprint: vi.fn(),
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
      runTask, runSprint: vi.fn(),
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
      runTask, runSprint: vi.fn(),
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
