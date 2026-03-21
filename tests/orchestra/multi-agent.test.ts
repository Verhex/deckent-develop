import { describe, it, expect, vi, beforeEach } from 'vitest';
import { definePipeline, runPipeline } from '../../src/orchestra/multi-agent.js';
import type { PipelineStep, PipelineExecutor } from '../../src/orchestra/multi-agent.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';
import { SharedContext } from '../../src/agents/shared-context.js';

// ─── Mock node:fs for SharedContext ──────────────────────────────────────
vi.mock('node:fs', () => {
  const store = new Map<string, string>();
  return {
    readFileSync: vi.fn((path: string) => {
      if (!store.has(path)) throw new Error('ENOENT');
      return store.get(path)!;
    }),
    writeFileSync: vi.fn((path: string, data: string) => {
      store.set(path, data);
    }),
    existsSync: vi.fn((path: string) => store.has(path)),
    renameSync: vi.fn((from: string, to: string) => {
      const data = store.get(from);
      if (data !== undefined) {
        store.set(to, data);
        store.delete(from);
      }
    }),
    unlinkSync: vi.fn((path: string) => {
      store.delete(path);
    }),
    mkdirSync: vi.fn(),
  };
});

import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';

const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedExistsSync = vi.mocked(existsSync);
const mockedRenameSync = vi.mocked(renameSync);
const mockedUnlinkSync = vi.mocked(unlinkSync);

let fileStore: Map<string, string>;

beforeEach(() => {
  vi.clearAllMocks();
  fileStore = new Map();

  mockedReadFileSync.mockImplementation((path: any) => {
    const p = String(path);
    if (!fileStore.has(p)) throw new Error('ENOENT');
    return fileStore.get(p)! as any;
  });
  mockedWriteFileSync.mockImplementation((path: any, data: any) => {
    fileStore.set(String(path), String(data));
  });
  mockedExistsSync.mockImplementation((path: any) => {
    return fileStore.has(String(path)) as any;
  });
  mockedRenameSync.mockImplementation((from: any, to: any) => {
    const data = fileStore.get(String(from));
    if (data !== undefined) {
      fileStore.set(String(to), data);
      fileStore.delete(String(from));
    }
  });
  mockedUnlinkSync.mockImplementation((path: any) => {
    fileStore.delete(String(path));
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '029-001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

// ─── definePipeline ─────────────────────────────────────────────────────

describe('definePipeline', () => {
  it('returns valid pipeline with single step', () => {
    const steps: PipelineStep[] = [{ agentId: 'a1', phase: 'plan' }];
    const result = definePipeline(steps);
    expect(result).toEqual(steps);
  });

  it('returns valid pipeline with multiple steps', () => {
    const steps: PipelineStep[] = [
      { agentId: 'a1', phase: 'plan' },
      { agentId: 'a2', phase: 'implement' },
      { agentId: 'a3', phase: 'review' },
    ];
    const result = definePipeline(steps);
    expect(result).toHaveLength(3);
  });

  it('throws on empty steps', () => {
    expect(() => definePipeline([])).toThrow('at least 1 step');
  });

  it('throws on duplicate phases', () => {
    const steps: PipelineStep[] = [
      { agentId: 'a1', phase: 'plan' },
      { agentId: 'a2', phase: 'plan' },
    ];
    expect(() => definePipeline(steps)).toThrow('duplicate phase');
  });

  it('throws on empty agentId', () => {
    const steps: PipelineStep[] = [{ agentId: '', phase: 'plan' }];
    expect(() => definePipeline(steps)).toThrow('invalid agentId');
  });

  it('throws on empty phase', () => {
    const steps: PipelineStep[] = [{ agentId: 'a1', phase: '' }];
    expect(() => definePipeline(steps)).toThrow('invalid phase');
  });

  it('allows same agent in different phases', () => {
    const steps: PipelineStep[] = [
      { agentId: 'a1', phase: 'plan' },
      { agentId: 'a1', phase: 'review' },
    ];
    const result = definePipeline(steps);
    expect(result).toHaveLength(2);
  });
});

// ─── runPipeline ─────────────────────────────────────────────────────────

describe('runPipeline', () => {
  it('runs all steps when all succeed', async () => {
    const steps = definePipeline([
      { agentId: 'a1', phase: 'plan' },
      { agentId: 'a2', phase: 'implement' },
    ]);
    const task = makeTask();
    const ctx = new SharedContext('/project');
    const executor: PipelineExecutor = async () => ({ status: 'done', output: 'ok' });

    const result = await runPipeline(steps, task, ctx, executor);
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].status).toBe('done');
    expect(result.steps[1].status).toBe('done');
  });

  it('aborts on first failure', async () => {
    const steps = definePipeline([
      { agentId: 'a1', phase: 'plan' },
      { agentId: 'a2', phase: 'implement' },
      { agentId: 'a3', phase: 'review' },
    ]);
    const task = makeTask();
    const ctx = new SharedContext('/project');
    let callCount = 0;
    const executor: PipelineExecutor = async (step) => {
      callCount++;
      if (step.phase === 'implement') return { status: 'failed', output: 'error' };
      return { status: 'done', output: 'ok' };
    };

    const result = await runPipeline(steps, task, ctx, executor);
    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(2); // plan succeeded, implement failed, review not reached
    expect(callCount).toBe(2);
  });

  it('captures step outputs', async () => {
    const steps = definePipeline([{ agentId: 'a1', phase: 'plan' }]);
    const task = makeTask();
    const ctx = new SharedContext('/project');
    const executor: PipelineExecutor = async () => ({ status: 'done', output: 'detailed output' });

    const result = await runPipeline(steps, task, ctx, executor);
    expect(result.steps[0].output).toBe('detailed output');
  });

  it('writes step output to shared context', async () => {
    const steps = definePipeline([{ agentId: 'a1', phase: 'plan' }]);
    const task = makeTask();
    const ctx = new SharedContext('/project');
    const executor: PipelineExecutor = async () => ({ status: 'done', output: 'plan result' });

    await runPipeline(steps, task, ctx, executor);
    const entry = ctx.read('pipeline:plan');
    expect(entry).toBeDefined();
    expect(entry!.value).toEqual({ status: 'done', output: 'plan result' });
  });

  it('handles executor throwing an error', async () => {
    const steps = definePipeline([{ agentId: 'a1', phase: 'plan' }]);
    const task = makeTask();
    const ctx = new SharedContext('/project');
    const executor: PipelineExecutor = async () => { throw new Error('crash'); };

    const result = await runPipeline(steps, task, ctx, executor);
    expect(result.success).toBe(false);
    expect(result.steps[0].status).toBe('failed');
    expect(result.steps[0].output).toBe('crash');
  });

  it('records correct agentId and phase for each step', async () => {
    const steps = definePipeline([
      { agentId: 'writer', phase: 'write' },
      { agentId: 'reviewer', phase: 'review' },
    ]);
    const task = makeTask();
    const ctx = new SharedContext('/project');
    const executor: PipelineExecutor = async () => ({ status: 'done' });

    const result = await runPipeline(steps, task, ctx, executor);
    expect(result.steps[0].agentId).toBe('writer');
    expect(result.steps[0].phase).toBe('write');
    expect(result.steps[1].agentId).toBe('reviewer');
    expect(result.steps[1].phase).toBe('review');
  });

  it('handles single-step pipeline', async () => {
    const steps = definePipeline([{ agentId: 'solo', phase: 'execute' }]);
    const task = makeTask();
    const ctx = new SharedContext('/project');
    const executor: PipelineExecutor = async () => ({ status: 'done', output: 'solo done' });

    const result = await runPipeline(steps, task, ctx, executor);
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
  });

  it('passes task to executor', async () => {
    const steps = definePipeline([{ agentId: 'a1', phase: 'plan' }]);
    const task = makeTask({ id: 'special-task' });
    const ctx = new SharedContext('/project');
    let receivedTaskId = '';
    const executor: PipelineExecutor = async (_step, t) => {
      receivedTaskId = t.id;
      return { status: 'done' };
    };

    await runPipeline(steps, task, ctx, executor);
    expect(receivedTaskId).toBe('special-task');
  });
});
