// Task 369-004 (CHAT-IDE-DILIM-3): panel-refresh.ts — poll-based live refresh over
// panel-data.ts's loadSprintTaskPanelData, plus a pure task-detail selector over its
// task-list section. Fake-transport bridge stub (mirrors vscode-panel-data.test.ts's
// makeBridgeStub) + fake timers — no real VS Code host, no real network, no real clock.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RpcBridge } from '../../src/extensions/vscode/src/rpc-bridge.js';
import type { TaskListPanelData } from '../../src/extensions/vscode/src/panel-data.js';
import { startPanelRefresh, selectTaskDetail } from '../../src/extensions/vscode/src/panel-refresh.js';

// ─── Bridge stub (same convention as vscode-panel-data.test.ts) ────────────────────

function makeBridgeStub(overrides: Partial<Record<'getRunStatus' | 'listSessions', unknown>> = {}) {
  return {
    getRunStatus: vi.fn().mockResolvedValue({
      ok: true,
      value: { runId: 'r1', state: 'running', startedAt: null, finishedAt: null, exitCode: null },
    }),
    listSessions: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        sessions: [
          { sessionId: 's1', label: 'main', status: 'active', createdAt: 'x', lastActivityAt: 'x' },
        ],
      },
    }),
    ...overrides,
  } as unknown as RpcBridge;
}

// ─── startPanelRefresh — unref (no fake timers needed: direct global spy) ──────────

describe('startPanelRefresh — unref', () => {
  it('calls unref() on the interval timer so it never keeps the process alive', () => {
    const bridge = makeBridgeStub();
    const fakeTimer = { unref: vi.fn(), ref: vi.fn() } as unknown as ReturnType<typeof setInterval>;
    const setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue(fakeTimer);
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval').mockImplementation(() => {});

    const handle = startPanelRefresh(bridge, { intervalMs: 1000 });

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect((fakeTimer as unknown as { unref: ReturnType<typeof vi.fn> }).unref).toHaveBeenCalledTimes(1);

    handle.dispose();
    expect(clearIntervalSpy).toHaveBeenCalledWith(fakeTimer);

    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});

// ─── startPanelRefresh — start/stop/dispose (fake timers) ──────────────────────────

describe('startPanelRefresh — start/stop/dispose', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start: fetches immediately, then again on every interval tick', async () => {
    const bridge = makeBridgeStub();
    const onData = vi.fn();

    const handle = startPanelRefresh(bridge, { intervalMs: 1000, runId: 'r1', onData });

    await vi.advanceTimersByTimeAsync(0);
    expect(onData).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onData).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onData).toHaveBeenCalledTimes(3);

    handle.dispose();
  });

  it('stop: dispose() halts further polling', async () => {
    const bridge = makeBridgeStub();
    const onData = vi.fn();

    const handle = startPanelRefresh(bridge, { intervalMs: 1000, onData });
    await vi.advanceTimersByTimeAsync(0);
    expect(onData).toHaveBeenCalledTimes(1);

    handle.dispose();

    await vi.advanceTimersByTimeAsync(5000);
    expect(onData).toHaveBeenCalledTimes(1);
  });

  it('dispose is idempotent — a second call does not throw or double-clear', async () => {
    const bridge = makeBridgeStub();
    const handle = startPanelRefresh(bridge, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);

    expect(() => {
      handle.dispose();
      handle.dispose();
    }).not.toThrow();
  });

  it('refreshNow: triggers an immediate fetch outside the poll cadence and returns the snapshot', async () => {
    const bridge = makeBridgeStub();
    const onData = vi.fn();
    const handle = startPanelRefresh(bridge, { intervalMs: 100_000, runId: 'r1', onData });
    await vi.advanceTimersByTimeAsync(0);
    onData.mockClear();

    const data = await handle.refreshNow();

    expect(data.taskList.connection).toBe('connected');
    expect(data.taskList.tasks).toHaveLength(1);
    expect(onData).toHaveBeenCalledTimes(1);

    handle.dispose();
  });

  it('honest connection-loss: a poll tick that fails reports disconnected, never reuses stale connected data', async () => {
    const listSessions = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: {
          sessions: [{ sessionId: 's1', label: 'main', status: 'active', createdAt: 'x', lastActivityAt: 'x' }],
        },
      })
      .mockResolvedValueOnce({ ok: false, error: { kind: 'transport', message: 'ECONNRESET' } });
    const bridge = makeBridgeStub({ listSessions });
    const onData = vi.fn();

    const handle = startPanelRefresh(bridge, { intervalMs: 1000, onData });
    await vi.advanceTimersByTimeAsync(0);
    expect(onData.mock.calls[0][0].taskList.connection).toBe('connected');

    await vi.advanceTimersByTimeAsync(1000);
    expect(onData.mock.calls[1][0].taskList.connection).toBe('disconnected');
    expect(onData.mock.calls[1][0].taskList.tasks).toBeNull();
    expect(onData.mock.calls[1][0].taskList.error).toEqual({ kind: 'transport', message: 'ECONNRESET' });

    handle.dispose();
  });

  it('never fires onData after dispose, even for a tick already in flight', async () => {
    let resolveListSessions: (value: unknown) => void = () => {};
    const listSessions = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListSessions = resolve;
        }),
    );
    const bridge = makeBridgeStub({ listSessions });
    const onData = vi.fn();

    const handle = startPanelRefresh(bridge, { intervalMs: 1000, onData });
    handle.dispose();
    resolveListSessions({ ok: true, value: { sessions: [] } });
    await vi.advanceTimersByTimeAsync(0);

    expect(onData).not.toHaveBeenCalled();
  });
});

// ─── selectTaskDetail ───────────────────────────────────────────────────────────────

describe('selectTaskDetail', () => {
  it('found: returns the matching session status; agent/model/resultSummary are always null', () => {
    const taskList: TaskListPanelData = {
      connection: 'connected',
      tasks: [{ sessionId: 's1', label: 'main', status: 'active', createdAt: 'x', lastActivityAt: 'x' }],
      error: null,
    };

    const detail = selectTaskDetail('s1', taskList);

    expect(detail).toEqual({
      taskId: 's1',
      connection: 'connected',
      found: true,
      status: 'active',
      agent: null,
      model: null,
      resultSummary: null,
      error: null,
    });
  });

  it('not-found: an unmatched taskId reports found:false + status null, connection still forwarded', () => {
    const taskList: TaskListPanelData = { connection: 'connected', tasks: [], error: null };

    const detail = selectTaskDetail('missing', taskList);

    expect(detail).toEqual({
      taskId: 'missing',
      connection: 'connected',
      found: false,
      status: null,
      agent: null,
      model: null,
      resultSummary: null,
      error: null,
    });
  });

  it('disconnected: a transport error on the task-list section is forwarded honestly, not masked as not-found', () => {
    const taskList: TaskListPanelData = {
      connection: 'disconnected',
      tasks: null,
      error: { kind: 'transport', message: 'ECONNREFUSED' },
    };

    const detail = selectTaskDetail('s1', taskList);

    expect(detail).toEqual({
      taskId: 's1',
      connection: 'disconnected',
      found: false,
      status: null,
      agent: null,
      model: null,
      resultSummary: null,
      error: { kind: 'transport', message: 'ECONNREFUSED' },
    });
  });

  it('connected-with-rpc-error: an rpc-kind error on the task-list section is forwarded, connection stays "connected"', () => {
    const taskList: TaskListPanelData = {
      connection: 'connected',
      tasks: null,
      error: { kind: 'rpc', error: { code: 'METHOD_NOT_IMPLEMENTED', message: 'no handler' } },
    };

    const detail = selectTaskDetail('s1', taskList);

    expect(detail.connection).toBe('connected');
    expect(detail.found).toBe(false);
    expect(detail.error).toEqual({ kind: 'rpc', error: { code: 'METHOD_NOT_IMPLEMENTED', message: 'no handler' } });
  });
});
