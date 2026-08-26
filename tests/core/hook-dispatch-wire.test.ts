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
// ═══ Notify Wire Tests — Hot Fix H6 ══════════════════════════════════════════
// Validates the DECKENT→USER:NOTIFY runtime wire introduced in Sprint 150.
// - event-stream emit on every notify() call
// - fail-safe when dispatcher not initialized
// - all 5 NotificationEventName handled
// - priority mapping via createNotification
// - parent-TTY env detection logic (CliNotificationAdapter)
// - nervous bridge fires notify()
import { beforeEach, afterEach } from "vitest";
import { notify } from "../../src/core/notify.js";
import { NotifyDispatcher, createNotification, type Notification, type NotificationAdapter, type NotificationEventName } from "../../src/core/notification-dispatcher.js";
import { setGlobalNotifyDispatcher, getGlobalNotifyDispatcher, clearGlobalNotifyDispatcher } from "../../src/core/notify-registry.js";
import { CliNotificationAdapter } from "../../src/core/notify-adapters/cli-adapter.js";
import { eventBus } from "../../src/orchestra/event-bus.js";

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

// WIRE-024: physically merged from tests/core/notify-wire.test.ts.
{
// ─── Test Adapter (collects everything dispatched) ─────────────
class CollectorAdapter implements NotificationAdapter {
    readonly name = 'collector';
    readonly sent: Notification[] = [];
    isAvailable(): boolean { return true; }
    async send(n: Notification): Promise<void> { this.sent.push(n); }
}

describe('notify-wire (Hot Fix H6)', () => {
    beforeEach(() => {
        clearGlobalNotifyDispatcher();
    });
    afterEach(() => {
        clearGlobalNotifyDispatcher();
    });
    it('emits DECKENT→USER:NOTIFY on event-bus when called', async () => {
        const captured: unknown[] = [];
        const handler = (evt: unknown): void => {
            captured.push(evt);
        };
        eventBus.on('deckent-event', handler);
        try {
            await notify('sprint-started', 'sprint-150', 'Test başladı', 'basic summary');
        }
        finally {
            eventBus.off('deckent-event', handler);
        }
        // Must have emitted at least one event with channel DECKENT→USER:NOTIFY
        const notifyEvents = captured.filter((e) => {
            const obj = e as Record<string, unknown>;
            return obj.type === 'NOTIFY' && obj.channel === 'DECKENT→USER:NOTIFY';
        });
        expect(notifyEvents.length).toBeGreaterThanOrEqual(1);
    });
    it('is a no-op (fail-safe) when globalNotifyDispatcher is not initialized', async () => {
        expect(getGlobalNotifyDispatcher()).toBeNull();
        // Must not throw
        await expect(notify('task-done', 'sprint-150', 'Task 1', 'done')).resolves.toBeUndefined();
    });
    it('dispatches to all registered adapters when dispatcher is initialized', async () => {
        const dispatcher = new NotifyDispatcher(0); // no throttle for test
        const collector = new CollectorAdapter();
        dispatcher.addAdapter(collector);
        setGlobalNotifyDispatcher(dispatcher);
        await notify('sprint-started', 'sprint-150', 'Başladı', 'summary');
        expect(collector.sent.length).toBe(1);
        expect(collector.sent[0]!.event).toBe('sprint-started');
        expect(collector.sent[0]!.sprintId).toBe('sprint-150');
    });
    it('handles all 5 NotificationEventName values', async () => {
        const dispatcher = new NotifyDispatcher(0);
        const collector = new CollectorAdapter();
        dispatcher.addAdapter(collector);
        setGlobalNotifyDispatcher(dispatcher);
        const events: NotificationEventName[] = [
            'sprint-started',
            'task-done',
            'task-no-go',
            'sprint-finalized',
            'human-checkpoint-required',
        ];
        for (const ev of events) {
            await notify(ev, 'sprint-150', `Title ${ev}`, `Summary ${ev}`);
        }
        expect(collector.sent.length).toBe(5);
        const gotEvents = collector.sent.map(n => n.event);
        expect(gotEvents).toEqual(events);
    });
    it('assigns correct priority via createNotification mapping', () => {
        expect(createNotification('sprint-started', 's-1', 't', 'm').priority).toBe('info');
        expect(createNotification('task-done', 's-1', 't', 'm').priority).toBe('info');
        expect(createNotification('task-no-go', 's-1', 't', 'm').priority).toBe('warning');
        expect(createNotification('sprint-finalized', 's-1', 't', 'm').priority).toBe('info');
        expect(createNotification('human-checkpoint-required', 's-1', 't', 'm').priority).toBe('critical');
    });
    it('CliNotificationAdapter uses parent-PID path when DECKENT_PARENT_PID is set', () => {
        const originalPid = process.env['DECKENT_PARENT_PID'];
        try {
            // Own PID is always alive and /proc/<pid>/fd/1 exists on Linux
            process.env['DECKENT_PARENT_PID'] = String(process.pid);
            const adapter = new CliNotificationAdapter();
            // On Linux /proc/self/fd/1 exists; elsewhere this falls through to TTY check
            // Either way, isAvailable() must return a boolean (not throw)
            const avail = adapter.isAvailable();
            expect(typeof avail).toBe('boolean');
        }
        finally {
            if (originalPid === undefined)
                delete process.env['DECKENT_PARENT_PID'];
            else
                process.env['DECKENT_PARENT_PID'] = originalPid;
        }
    });
    it('nervous dispatcher fires notify() via bridgeToUserNotify', async () => {
        // Install a dispatcher; nervous bridge will dispatch to it.
        const dispatcher = new NotifyDispatcher(0);
        const collector = new CollectorAdapter();
        dispatcher.addAdapter(collector);
        setGlobalNotifyDispatcher(dispatcher);
        // Import NervousDispatcher after setting global (avoids top-of-file import order)
        const { NervousDispatcher } = await import("../../src/nervous/dispatcher.js");
        const nerv = new NervousDispatcher({ mode: 'balanced', enabled: true } as any, process.cwd(), {
            fileAdapter: { push: async () => true }, // suppress real file write
            cliAdapter: { push: async () => true },
            mcpAdapter: { push: async () => true },
            isMcpActive: () => false,
            isTtyAvailable: () => false,
        });
        await nerv.dispatch({
            id: 'nerv-test-1',
            type: 'test',
            title: 'Test risk',
            message: 'something happened',
            severity: 'critical',
            createdAt: new Date().toISOString(),
            detectorId: 'test-detector',
            actions: [],
            timeoutMs: null,
            sprintId: 'sprint-150',
        });
        // Give the fire-and-forget bridge microtask time to complete
        await new Promise((r) => setTimeout(r, 10));
        // Bridge must have fired at least one notification to the global dispatcher
        expect(collector.sent.length).toBeGreaterThanOrEqual(1);
        expect(collector.sent[0]!.sprintId).toBe('sprint-150');
        expect(collector.sent[0]!.title).toContain('[Nervous]');
    });
    it('throttles non-critical notifications (respects 1s min-interval)', async () => {
        const dispatcher = new NotifyDispatcher(1000);
        const collector = new CollectorAdapter();
        dispatcher.addAdapter(collector);
        setGlobalNotifyDispatcher(dispatcher);
        // Three back-to-back info notifications: first wins immediately, rest queue
        await notify('task-done', 'sprint-150', 'a', 'a');
        await notify('task-done', 'sprint-150', 'b', 'b');
        await notify('task-done', 'sprint-150', 'c', 'c');
        // First one sent now; others queued
        expect(collector.sent.length).toBe(1);
    });
    it('dispatches critical notifications immediately (bypasses throttle)', async () => {
        const dispatcher = new NotifyDispatcher(60000); // huge throttle
        const collector = new CollectorAdapter();
        dispatcher.addAdapter(collector);
        setGlobalNotifyDispatcher(dispatcher);
        await notify('human-checkpoint-required', 'sprint-150', 'Onay', 'approve?');
        await notify('human-checkpoint-required', 'sprint-150', 'Onay 2', 'approve 2?');
        // Both critical: both bypass throttle
        expect(collector.sent.length).toBe(2);
    });
});
}
