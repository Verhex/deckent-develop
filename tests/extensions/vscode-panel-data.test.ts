// Task 368-007 (CHAT-IDE-DILIM-2): panel-data.ts — sprint-status/task-list adapter
// over RpcBridge. Fake-transport only (mirrors vscode-panel.test.ts's makeBridgeStub
// convention) — no real VS Code host, no real network.

import { describe, it, expect, vi } from 'vitest';
import type { RpcBridge } from '../../src/extensions/vscode/src/rpc-bridge.js';
import {
  loadSprintStatusPanelData,
  loadTaskListPanelData,
  loadSprintTaskPanelData,
} from '../../src/extensions/vscode/src/panel-data.js';

// ─── Bridge stub ────────────────────────────────────────────────────────────────

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

// ─── loadSprintStatusPanelData ──────────────────────────────────────────────────

describe('loadSprintStatusPanelData', () => {
  it('connected: returns run.status data with connection "connected"', async () => {
    const bridge = makeBridgeStub();

    const data = await loadSprintStatusPanelData(bridge, 'r1');

    expect(data).toEqual({
      connection: 'connected',
      status: { runId: 'r1', state: 'running', startedAt: null, finishedAt: null, exitCode: null },
      error: null,
    });
  });

  it('empty-data: skips the call and stays connected/null when runId is omitted', async () => {
    const bridge = makeBridgeStub();

    const data = await loadSprintStatusPanelData(bridge, undefined);

    expect(data).toEqual({ connection: 'connected', status: null, error: null });
    expect(bridge.getRunStatus as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it('disconnected: a transport-kind RpcBridgeError maps to connection "disconnected"', async () => {
    const bridge = makeBridgeStub({
      getRunStatus: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'transport', message: 'ECONNREFUSED' },
      }),
    });

    const data = await loadSprintStatusPanelData(bridge, 'r1');

    expect(data).toEqual({
      connection: 'disconnected',
      status: null,
      error: { kind: 'transport', message: 'ECONNREFUSED' },
    });
  });

  it('connected-with-error: an rpc-kind RpcBridgeError stays connection "connected"', async () => {
    const bridge = makeBridgeStub({
      getRunStatus: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'rpc', error: { code: 'METHOD_NOT_IMPLEMENTED', message: 'no handler' } },
      }),
    });

    const data = await loadSprintStatusPanelData(bridge, 'r1');

    expect(data.connection).toBe('connected');
    expect(data.status).toBeNull();
    expect(data.error).toEqual({ kind: 'rpc', error: { code: 'METHOD_NOT_IMPLEMENTED', message: 'no handler' } });
  });
});

// ─── loadTaskListPanelData ───────────────────────────────────────────────────────

describe('loadTaskListPanelData', () => {
  it('connected: returns the sessions array with connection "connected"', async () => {
    const bridge = makeBridgeStub();

    const data = await loadTaskListPanelData(bridge);

    expect(data).toEqual({
      connection: 'connected',
      tasks: [{ sessionId: 's1', label: 'main', status: 'active', createdAt: 'x', lastActivityAt: 'x' }],
      error: null,
    });
  });

  it('empty-data: an empty sessions array is a valid connected state, not an error', async () => {
    const bridge = makeBridgeStub({
      listSessions: vi.fn().mockResolvedValue({ ok: true, value: { sessions: [] } }),
    });

    const data = await loadTaskListPanelData(bridge);

    expect(data).toEqual({ connection: 'connected', tasks: [], error: null });
  });

  it('disconnected: a transport-kind RpcBridgeError maps to connection "disconnected"', async () => {
    const bridge = makeBridgeStub({
      listSessions: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'transport', message: 'network error', status: undefined },
      }),
    });

    const data = await loadTaskListPanelData(bridge);

    expect(data.connection).toBe('disconnected');
    expect(data.tasks).toBeNull();
    expect(data.error).toEqual({ kind: 'transport', message: 'network error', status: undefined });
  });
});

// ─── loadSprintTaskPanelData ─────────────────────────────────────────────────────

describe('loadSprintTaskPanelData', () => {
  it('binds both sections and stamps fetchedAt from the injected clock', async () => {
    const bridge = makeBridgeStub();

    const data = await loadSprintTaskPanelData(bridge, { runId: 'r1', now: () => '2026-07-05T00:00:00.000Z' });

    expect(data.fetchedAt).toBe('2026-07-05T00:00:00.000Z');
    expect(data.sprintStatus.connection).toBe('connected');
    expect(data.sprintStatus.status).toEqual({
      runId: 'r1',
      state: 'running',
      startedAt: null,
      finishedAt: null,
      exitCode: null,
    });
    expect(data.taskList.connection).toBe('connected');
    expect(data.taskList.tasks).toHaveLength(1);
  });

  it('one section disconnected never blocks or discards the other section', async () => {
    const bridge = makeBridgeStub({
      getRunStatus: vi.fn().mockResolvedValue({
        ok: false,
        error: { kind: 'transport', message: 'timeout' },
      }),
    });

    const data = await loadSprintTaskPanelData(bridge, { runId: 'r1' });

    expect(data.sprintStatus.connection).toBe('disconnected');
    expect(data.sprintStatus.status).toBeNull();
    expect(data.taskList.connection).toBe('connected');
    expect(data.taskList.tasks).toHaveLength(1);
  });

  it('empty-data: runId omitted and an empty session list both surface as connected/empty', async () => {
    const bridge = makeBridgeStub({
      listSessions: vi.fn().mockResolvedValue({ ok: true, value: { sessions: [] } }),
    });

    const data = await loadSprintTaskPanelData(bridge, {});

    expect(data.sprintStatus).toEqual({ connection: 'connected', status: null, error: null });
    expect(data.taskList).toEqual({ connection: 'connected', tasks: [], error: null });
  });
});
