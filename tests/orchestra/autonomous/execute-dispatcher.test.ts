import { describe, it, expect, vi } from 'vitest';
import { makeExecuteDispatcher } from '../../../src/orchestra/autonomous/execute-dispatcher.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

const taskEntry: BacklogEntry = {
  id: 'e', title: 't', kind: 'task', spec: { description: 'do x', scopeDir: 'src/' },
  policy: 'auto', provider: 'ollama', model: 'qwen3.6:27b', trigger: { type: 'one-off' },
  status: 'pending', lastRun: null, lastResult: null,
};

describe('execute-dispatcher', () => {
  it('kind=task → runTask invoked with entry provider/model, returns success', async () => {
    const runTask = vi.fn().mockReturnValue({ ok: true });
    const runSprint = vi.fn();
    const handler = makeExecuteDispatcher({ projectRoot: '/p', config: {} as never, runTask, runSprint });
    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('success');
    expect(runTask).toHaveBeenCalledOnce();
    expect(runSprint).not.toHaveBeenCalled();
    const ctx = runTask.mock.calls[0]![0];
    expect(ctx.model).toBe('qwen3.6:27b');
  });

  it('kind=sprint → runSprint invoked', async () => {
    const runTask = vi.fn();
    const runSprint = vi.fn().mockResolvedValue({});
    const handler = makeExecuteDispatcher({ projectRoot: '/p', config: {} as never, runTask, runSprint });
    const res = await handler('autonomous.execute', { entry: { ...taskEntry, kind: 'sprint', spec: { directivesRef: 'D.md' } } });
    expect(res.outcome).toBe('success');
    expect(runSprint).toHaveBeenCalledOnce();
  });

  it('missing entry payload → failure (no silent success)', async () => {
    const handler = makeExecuteDispatcher({ projectRoot: '/p', config: {} as never, runTask: vi.fn(), runSprint: vi.fn() });
    const res = await handler('autonomous.execute', {});
    expect(res.outcome).toBe('failure');
    expect(res.error).toMatch(/entry/);
  });

  it('runTask throwing → failure with error', async () => {
    const runTask = vi.fn(() => { throw new Error('boom'); });
    const handler = makeExecuteDispatcher({ projectRoot: '/p', config: {} as never, runTask, runSprint: vi.fn() });
    const res = await handler('autonomous.execute', { entry: taskEntry });
    expect(res.outcome).toBe('failure');
    expect(res.error).toContain('boom');
  });

  it('AUTONOMOUS_EXECUTE_ACTION constant is exported and stable', async () => {
    const mod = await import('../../../src/orchestra/autonomous/execute-dispatcher.js');
    expect(mod.AUTONOMOUS_EXECUTE_ACTION).toBe('autonomous.execute');
  });
});
