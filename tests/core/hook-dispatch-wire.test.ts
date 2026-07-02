// ═══ HOOK-DISPATCH-WIRE — sprint-360 task-16 (fix) ═══════════════════════════
// Wires ToolHookRegistry (sprint-359 task-15, src/core/tool-hooks.ts) into
// dispatchToolCall (src/core/tool-dispatch.ts) as the optional `hooks` seam.
// Covers: seam-less byte-identical behavior, pre-hook veto, pre-hook arg
// transform flowing into confirm/execImpl, post-hook result transform,
// hook-throw isolation, and precedence vs the invalid/unknown_tool short-circuit.

import { describe, it, expect, vi } from 'vitest';
import {
  dispatchToolCall,
  type ToolDispatchPlan,
  type ConfirmFn,
  type ExecImplFn,
} from '../../src/core/tool-dispatch.js';
import { ToolHookRegistry, type PreToolHook, type PostToolHook } from '../../src/core/tool-hooks.js';

function plan(overrides: Partial<ToolDispatchPlan> = {}): ToolDispatchPlan {
  return {
    name: 'deckent_kill',
    status: 'valid',
    risk: 'destructive',
    category: 'lifecycle',
    args: { taskId: '123' },
    ...overrides,
  };
}

describe('dispatchToolCall — hooks seam omitted (byte-identical)', () => {
  it('executed: identical result/telemetry shape to the seam-less call — no hookErrors key', async () => {
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');
    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl });
    expect(result).toEqual({
      status: 'executed',
      result: 'ok',
      telemetry: expect.objectContaining({ status: 'executed', confirmRequired: false }),
    });
    expect(result.telemetry).not.toHaveProperty('hookErrors');
    expect(result).not.toHaveProperty('hookVeto');
  });

  it('denied (fail-closed, no confirm): unaffected by the new seam', async () => {
    const execImpl = vi.fn<ExecImplFn>();
    const result = await dispatchToolCall(plan({ risk: 'destructive' }), { execImpl });
    expect(result.status).toBe('denied');
    expect(result).not.toHaveProperty('hookVeto');
    expect(execImpl).not.toHaveBeenCalled();
  });
});

describe('dispatchToolCall — hooks: pre-hook veto', () => {
  it('vetoes before confirm/execImpl run, denies with a justified hookVeto', async () => {
    const hooks = new ToolHookRegistry();
    hooks.register({
      name: 'guard',
      phase: 'pre',
      match: () => true,
      run: () => ({ veto: true, reason: 'destructive op blocked' }),
    });
    const confirm = vi.fn<ConfirmFn>();
    const execImpl = vi.fn<ExecImplFn>();

    const result = await dispatchToolCall(plan({ risk: 'destructive' }), { confirm, execImpl, hooks });

    expect(result.status).toBe('denied');
    expect(result.hookVeto).toEqual({ hookName: 'guard', reason: 'destructive op blocked' });
    expect(confirm).not.toHaveBeenCalled();
    expect(execImpl).not.toHaveBeenCalled();
    expect(result.telemetry.confirmRequired).toBe(false);
  });

  it('a non-matching pre-hook does not veto — call proceeds to executed', async () => {
    const hooks = new ToolHookRegistry();
    hooks.register({
      name: 'scoped-guard',
      phase: 'pre',
      match: (toolId) => toolId === 'other.tool',
      run: () => ({ veto: true, reason: 'blocked' }),
    });
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ran');

    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(result.status).toBe('executed');
    expect(result.result).toBe('ran');
  });

  it('invalid/unknown_tool short-circuit takes precedence — hooks never run', async () => {
    const hooks = new ToolHookRegistry();
    const run = vi.fn().mockReturnValue({ veto: true, reason: 'should not fire' });
    hooks.register({ name: 'guard', phase: 'pre', match: () => true, run });
    const execImpl = vi.fn<ExecImplFn>();

    const result = await dispatchToolCall(plan({ status: 'invalid' }), { execImpl, hooks });

    expect(result.status).toBe('invalid');
    expect(run).not.toHaveBeenCalled();
    expect(execImpl).not.toHaveBeenCalled();
  });
});

describe('dispatchToolCall — hooks: pre-hook arg transform', () => {
  it('transformed args flow into the confirm() context', async () => {
    const hooks = new ToolHookRegistry();
    hooks.register({
      name: 'redactor',
      phase: 'pre',
      match: () => true,
      run: () => ({ args: { redacted: true } }),
    });
    const confirm = vi.fn<ConfirmFn>().mockResolvedValue('allow');
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');

    await dispatchToolCall(plan({ risk: 'destructive' }), { confirm, execImpl, hooks });

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ args: { redacted: true } }),
    );
  });

  it('transformed args flow into execImpl', async () => {
    const hooks = new ToolHookRegistry();
    hooks.register({
      name: 'add-field',
      phase: 'pre',
      match: () => true,
      run: (ctx) => ({ args: { ...(ctx.args as Record<string, unknown>), injected: true } }),
    });
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');

    await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(execImpl).toHaveBeenCalledWith({ name: 'deckent_kill', args: { taskId: '123', injected: true } });
  });

  it('observe-only pre-hook (returns void) leaves args unchanged', async () => {
    const hooks = new ToolHookRegistry();
    hooks.register({ name: 'observer', phase: 'pre', match: () => true, run: () => {} });
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');

    await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(execImpl).toHaveBeenCalledWith({ name: 'deckent_kill', args: { taskId: '123' } });
  });
});

describe('dispatchToolCall — hooks: post-hook result transform', () => {
  it('transformed result replaces execImpl output on the returned DispatchResult', async () => {
    const hooks = new ToolHookRegistry();
    hooks.register({
      name: 'wrapper',
      phase: 'post',
      match: () => true,
      run: () => ({ result: { wrapped: true } }),
    });
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue({ raw: 1 });

    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(result.status).toBe('executed');
    expect(result.result).toEqual({ wrapped: true });
  });

  it('post-hook receives the (possibly pre-hook-transformed) args and the execImpl result', async () => {
    const hooks = new ToolHookRegistry();
    let seenArgs: unknown;
    let seenResult: unknown;
    hooks.register({
      name: 'pre-transform',
      phase: 'pre',
      match: () => true,
      run: () => ({ args: { transformed: true } }),
    });
    hooks.register({
      name: 'post-observer',
      phase: 'post',
      match: () => true,
      run: (ctx) => { seenArgs = ctx.args; seenResult = ctx.result; },
    });
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('raw-result');

    await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(seenArgs).toEqual({ transformed: true });
    expect(seenResult).toBe('raw-result');
  });

  it('post-hook does not run when execImpl throws — status stays error', async () => {
    const hooks = new ToolHookRegistry();
    const run = vi.fn();
    hooks.register({ name: 'post-observer', phase: 'post', match: () => true, run });
    const execImpl = vi.fn<ExecImplFn>().mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(result.status).toBe('error');
    expect(run).not.toHaveBeenCalled();
  });

  it('post-hook does not run when the call is denied', async () => {
    const hooks = new ToolHookRegistry();
    const run = vi.fn();
    hooks.register({ name: 'post-observer', phase: 'post', match: () => true, run });
    const confirm = vi.fn<ConfirmFn>().mockResolvedValue('deny');
    const execImpl = vi.fn<ExecImplFn>();

    const result = await dispatchToolCall(plan({ risk: 'destructive' }), { confirm, execImpl, hooks });

    expect(result.status).toBe('denied');
    expect(run).not.toHaveBeenCalled();
  });
});

describe('dispatchToolCall — hooks: throw isolation', () => {
  it('a throwing pre-hook is isolated — dispatch still proceeds, error recorded in telemetry.hookErrors', async () => {
    const hooks = new ToolHookRegistry();
    const preHook: PreToolHook = {
      name: 'bad-pre',
      phase: 'pre',
      match: () => true,
      run: () => { throw new Error('pre boom'); },
    };
    hooks.register(preHook);
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');

    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(result.status).toBe('executed');
    expect(execImpl).toHaveBeenCalled();
    expect(result.telemetry.hookErrors).toHaveLength(1);
    expect(result.telemetry.hookErrors?.[0]).toMatchObject({ hookName: 'bad-pre', phase: 'pre' });
  });

  it('a throwing post-hook is isolated — dispatch still reports executed with the original result', async () => {
    const hooks = new ToolHookRegistry();
    const postHook: PostToolHook = {
      name: 'bad-post',
      phase: 'post',
      match: () => true,
      run: () => { throw new Error('post boom'); },
    };
    hooks.register(postHook);
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('untouched');

    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(result.status).toBe('executed');
    expect(result.result).toBe('untouched');
    expect(result.telemetry.hookErrors).toHaveLength(1);
    expect(result.telemetry.hookErrors?.[0]).toMatchObject({ hookName: 'bad-post', phase: 'post' });
  });

  it('a rejected async pre-hook is isolated the same way', async () => {
    const hooks = new ToolHookRegistry();
    hooks.register({
      name: 'async-bad-pre',
      phase: 'pre',
      match: () => true,
      run: async () => { throw new Error('async pre boom'); },
    });
    const execImpl = vi.fn<ExecImplFn>().mockResolvedValue('ok');

    const result = await dispatchToolCall(plan({ risk: 'safe' }), { execImpl, hooks });

    expect(result.status).toBe('executed');
    expect(result.telemetry.hookErrors).toHaveLength(1);
  });
});
