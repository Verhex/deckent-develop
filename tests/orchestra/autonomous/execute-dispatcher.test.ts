import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeExecuteDispatcher } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import { makeBoundedPool } from '../../../src/orchestra/autonomous/execution-pool.js';
import { loadBacklog } from '../../../src/orchestra/autonomous/backlog.js';
import type { BacklogEntry, BacklogFile } from '../../../src/orchestra/autonomous/backlog-types.js';
import type { TaskResult } from '../../../src/core/types.js';
import type { ExecutionPool } from '../../../src/orchestra/autonomous/execution-pool.js';

// ─── Shared helpers ──────────────────────────────────────────────────

const taskEntry: BacklogEntry = {
  id: 'e', title: 't', kind: 'task', spec: { description: 'do x', scopeDir: 'src/' },
  policy: 'auto', provider: 'ollama', model: 'qwen3.6:27b', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

const sprintEntry: BacklogEntry = {
  ...taskEntry, id: 'e-sprint', kind: 'sprint', spec: { directivesRef: 'D.md' },
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
