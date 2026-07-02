import { describe, it, expect } from 'vitest';
import {
  ToolHookRegistry,
  type PreToolHook,
  type PostToolHook,
} from '../../src/core/tool-hooks.js';

function matchAll(_toolId: string): boolean {
  return true;
}

describe('ToolHookRegistry', () => {
  // ─── register + instance isolation ─────────────────────────────────────

  describe('instance isolation (no global mutable state)', () => {
    it('two separate registries do not share hooks', async () => {
      const a = new ToolHookRegistry();
      const b = new ToolHookRegistry();
      a.register({ name: 'a-hook', phase: 'pre', match: matchAll, run: () => ({ veto: true, reason: 'nope' }) });

      const outcomeA = await a.runPre('tool.x', {});
      const outcomeB = await b.runPre('tool.x', {});

      expect(outcomeA.vetoed).toBe(true);
      expect(outcomeB.vetoed).toBe(false);
    });
  });

  // ─── pre-hook: veto ─────────────────────────────────────────────────────

  describe('pre-hook veto', () => {
    it('vetoes dispatch with a reason', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'guard',
        phase: 'pre',
        match: matchAll,
        run: () => ({ veto: true, reason: 'destructive op blocked' }),
      });

      const outcome = await registry.runPre('shell.exec', { cmd: 'rm -rf /' });

      expect(outcome.vetoed).toBe(true);
      expect(outcome.vetoReason).toBe('destructive op blocked');
      expect(outcome.vetoedBy).toBe('guard');
    });

    it('short-circuits — a later pre-hook does not run after veto', async () => {
      const registry = new ToolHookRegistry();
      const calls: string[] = [];
      registry.register({
        name: 'first-veto',
        phase: 'pre',
        match: matchAll,
        run: () => { calls.push('first-veto'); return { veto: true, reason: 'stop' }; },
      });
      registry.register({
        name: 'second',
        phase: 'pre',
        match: matchAll,
        run: () => { calls.push('second'); },
      });

      await registry.runPre('tool.x', {});

      expect(calls).toEqual(['first-veto']);
    });

    it('a non-matching hook is not vetoed against', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'scoped-guard',
        phase: 'pre',
        match: (toolId) => toolId === 'shell.exec',
        run: () => ({ veto: true, reason: 'blocked' }),
      });

      const outcome = await registry.runPre('fs.read', { path: '/tmp/x' });

      expect(outcome.vetoed).toBe(false);
    });
  });

  // ─── pre-hook: arg-transform ────────────────────────────────────────────

  describe('pre-hook arg-transform', () => {
    it('replaces args when a hook returns args', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'redactor',
        phase: 'pre',
        match: matchAll,
        run: () => ({ args: { redacted: true } }),
      });

      const outcome = await registry.runPre('tool.x', { secret: 'abc' });

      expect(outcome.args).toEqual({ redacted: true });
      expect(outcome.vetoed).toBe(false);
    });

    it('passes args through unchanged when a hook returns void (observe-only)', async () => {
      const registry = new ToolHookRegistry();
      let observed: unknown;
      registry.register({
        name: 'observer',
        phase: 'pre',
        match: matchAll,
        run: (ctx) => { observed = ctx.args; },
      });

      const outcome = await registry.runPre('tool.x', { a: 1 });

      expect(outcome.args).toEqual({ a: 1 });
      expect(observed).toEqual({ a: 1 });
    });

    it('chains transforms — each hook sees the previous hook\'s transformed args', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'step1',
        phase: 'pre',
        match: matchAll,
        run: (ctx) => ({ args: { ...(ctx.args as Record<string, unknown>), step1: true } }),
      });
      registry.register({
        name: 'step2',
        phase: 'pre',
        match: matchAll,
        run: (ctx) => ({ args: { ...(ctx.args as Record<string, unknown>), step2: true } }),
      });

      const outcome = await registry.runPre('tool.x', { start: true });

      expect(outcome.args).toEqual({ start: true, step1: true, step2: true });
    });

    it('supports async run() implementations', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'async-hook',
        phase: 'pre',
        match: matchAll,
        run: async (ctx) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return { args: { ...(ctx.args as Record<string, unknown>), async: true } };
        },
      });

      const outcome = await registry.runPre('tool.x', {});

      expect(outcome.args).toEqual({ async: true });
    });
  });

  // ─── post-hook: result-transform/observe ───────────────────────────────

  describe('post-hook result-transform/observe', () => {
    it('replaces result when a hook returns result', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'wrapper',
        phase: 'post',
        match: matchAll,
        run: () => ({ result: { wrapped: true } }),
      });

      const outcome = await registry.runPost('tool.x', {}, { raw: 1 });

      expect(outcome.result).toEqual({ wrapped: true });
    });

    it('passes result through unchanged when a hook observes only', async () => {
      const registry = new ToolHookRegistry();
      let observed: unknown;
      registry.register({
        name: 'observer',
        phase: 'post',
        match: matchAll,
        run: (ctx) => { observed = ctx.result; },
      });

      const outcome = await registry.runPost('tool.x', {}, { raw: 1 });

      expect(outcome.result).toEqual({ raw: 1 });
      expect(observed).toEqual({ raw: 1 });
    });

    it('chains transforms across multiple post-hooks in order', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'append-a',
        phase: 'post',
        match: matchAll,
        run: (ctx) => ({ result: `${String(ctx.result)}-a` }),
      });
      registry.register({
        name: 'append-b',
        phase: 'post',
        match: matchAll,
        run: (ctx) => ({ result: `${String(ctx.result)}-b` }),
      });

      const outcome = await registry.runPost('tool.x', {}, 'base');

      expect(outcome.result).toBe('base-a-b');
    });

    it('post-hook context receives the original dispatch args', async () => {
      const registry = new ToolHookRegistry();
      let seenArgs: unknown;
      registry.register({
        name: 'arg-observer',
        phase: 'post',
        match: matchAll,
        run: (ctx) => { seenArgs = ctx.args; },
      });

      await registry.runPost('tool.x', { input: 'v' }, 'out');

      expect(seenArgs).toEqual({ input: 'v' });
    });
  });

  // ─── error isolation ────────────────────────────────────────────────────

  describe('error isolation', () => {
    it('a throwing pre-hook does not kill the pipeline — later hooks still run', async () => {
      const registry = new ToolHookRegistry();
      const calls: string[] = [];
      registry.register({
        name: 'throws',
        phase: 'pre',
        match: matchAll,
        run: () => { throw new Error('boom'); },
      });
      registry.register({
        name: 'survives',
        phase: 'pre',
        match: matchAll,
        run: () => { calls.push('survives'); },
      });

      const outcome = await registry.runPre('tool.x', { a: 1 });

      expect(calls).toEqual(['survives']);
      expect(outcome.vetoed).toBe(false);
      expect(outcome.args).toEqual({ a: 1 });
    });

    it('records the thrown error with hook name, phase, and toolId', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'bad-hook',
        phase: 'pre',
        match: matchAll,
        run: () => { throw new Error('boom'); },
      });

      const outcome = await registry.runPre('shell.exec', {});

      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0]).toMatchObject({
        hookName: 'bad-hook',
        phase: 'pre',
        toolId: 'shell.exec',
      });
      expect((outcome.errors[0]?.error as Error).message).toBe('boom');
    });

    it('a throwing async pre-hook (rejected promise) is isolated the same way', async () => {
      const registry = new ToolHookRegistry();
      registry.register({
        name: 'async-throws',
        phase: 'pre',
        match: matchAll,
        run: async () => { throw new Error('async boom'); },
      });

      const outcome = await registry.runPre('tool.x', {});

      expect(outcome.vetoed).toBe(false);
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0]?.hookName).toBe('async-throws');
    });

    it('a throwing post-hook does not kill the pipeline and is recorded in errors', async () => {
      const registry = new ToolHookRegistry();
      const calls: string[] = [];
      registry.register({
        name: 'post-throws',
        phase: 'post',
        match: matchAll,
        run: () => { throw new Error('post boom'); },
      });
      registry.register({
        name: 'post-survives',
        phase: 'post',
        match: matchAll,
        run: () => { calls.push('post-survives'); },
      });

      const outcome = await registry.runPost('tool.x', {}, 'result-value');

      expect(calls).toEqual(['post-survives']);
      expect(outcome.result).toBe('result-value');
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0]?.phase).toBe('post');
    });

    it('a throwing match() is isolated and treated as non-matching', async () => {
      const registry = new ToolHookRegistry();
      const calls: string[] = [];
      registry.register({
        name: 'bad-match',
        phase: 'pre',
        match: () => { throw new Error('match boom'); },
        run: () => { calls.push('should-not-run'); },
      });

      const outcome = await registry.runPre('tool.x', {});

      expect(calls).toEqual([]);
      expect(outcome.errors).toHaveLength(1);
      expect(outcome.errors[0]?.hookName).toBe('bad-match');
    });
  });

  // ─── deterministic order ────────────────────────────────────────────────

  describe('deterministic order', () => {
    it('pre-hooks run in registration order', async () => {
      const registry = new ToolHookRegistry();
      const order: string[] = [];
      registry.register({ name: 'first', phase: 'pre', match: matchAll, run: () => { order.push('first'); } });
      registry.register({ name: 'second', phase: 'pre', match: matchAll, run: () => { order.push('second'); } });
      registry.register({ name: 'third', phase: 'pre', match: matchAll, run: () => { order.push('third'); } });

      await registry.runPre('tool.x', {});

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('post-hooks run in registration order', async () => {
      const registry = new ToolHookRegistry();
      const order: string[] = [];
      registry.register({ name: 'first', phase: 'post', match: matchAll, run: () => { order.push('first'); } });
      registry.register({ name: 'second', phase: 'post', match: matchAll, run: () => { order.push('second'); } });

      await registry.runPost('tool.x', {}, {});

      expect(order).toEqual(['first', 'second']);
    });

    it('pre and post hooks registered interleaved only run within their own phase, preserving relative order', async () => {
      const registry = new ToolHookRegistry();
      const order: string[] = [];
      const pre: PreToolHook = { name: 'pre-1', phase: 'pre', match: matchAll, run: () => { order.push('pre-1'); } };
      const post: PostToolHook = { name: 'post-1', phase: 'post', match: matchAll, run: () => { order.push('post-1'); } };
      const pre2: PreToolHook = { name: 'pre-2', phase: 'pre', match: matchAll, run: () => { order.push('pre-2'); } };
      const post2: PostToolHook = { name: 'post-2', phase: 'post', match: matchAll, run: () => { order.push('post-2'); } };

      registry.register(pre);
      registry.register(post);
      registry.register(pre2);
      registry.register(post2);

      await registry.runPre('tool.x', {});
      await registry.runPost('tool.x', {}, {});

      expect(order).toEqual(['pre-1', 'pre-2', 'post-1', 'post-2']);
    });
  });

  // ─── toolId matching ────────────────────────────────────────────────────

  describe('toolId matching', () => {
    it('only invokes hooks whose match(toolId) returns true', async () => {
      const registry = new ToolHookRegistry();
      const calls: string[] = [];
      registry.register({
        name: 'shell-only',
        phase: 'pre',
        match: (toolId) => toolId.startsWith('shell.'),
        run: () => { calls.push('shell-only'); },
      });
      registry.register({
        name: 'fs-only',
        phase: 'pre',
        match: (toolId) => toolId.startsWith('fs.'),
        run: () => { calls.push('fs-only'); },
      });

      await registry.runPre('shell.exec', {});

      expect(calls).toEqual(['shell-only']);
    });
  });
});
