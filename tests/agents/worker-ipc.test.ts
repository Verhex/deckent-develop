/**
 * tests/agents/worker-ipc.test.ts — WorkerChannel IPC tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import {
  WorkerChannel,
  WorkerSideChannel,
  ChannelRegistry,
  isIPCMessage,
} from '../../src/agents/worker-ipc.js';
import type { IPCMessage, IPCMessageType } from '../../src/agents/worker-ipc.js';

// ─── Mock ChildProcess ─────────────────────────────────────────────────────────

function makeMockProc(hasSend = true): ChildProcess & { _emit: (msg: unknown) => void } {
  const emitter = new EventEmitter() as ChildProcess & { _emit: (msg: unknown) => void };
  if (hasSend) {
    emitter.send = vi.fn().mockReturnValue(true) as unknown as ChildProcess['send'];
  }
  emitter._emit = (msg: unknown) => emitter.emit('message', msg);
  return emitter;
}

// ─── isIPCMessage ─────────────────────────────────────────────────────────────

describe('isIPCMessage', () => {
  it('returns true for a valid IPCMessage', () => {
    const msg: IPCMessage = {
      type: 'HEARTBEAT',
      taskId: 'test-001',
      timestamp: new Date().toISOString(),
    };
    expect(isIPCMessage(msg)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isIPCMessage(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isIPCMessage('string')).toBe(false);
    expect(isIPCMessage(42)).toBe(false);
  });

  it('returns false if type is missing', () => {
    expect(isIPCMessage({ taskId: 'x', timestamp: 't' })).toBe(false);
  });

  it('returns false if taskId is missing', () => {
    expect(isIPCMessage({ type: 'HEARTBEAT', timestamp: 't' })).toBe(false);
  });

  it('returns false if timestamp is missing', () => {
    expect(isIPCMessage({ type: 'HEARTBEAT', taskId: 'x' })).toBe(false);
  });

  it('returns true with optional payload', () => {
    expect(isIPCMessage({ type: 'STATUS_RESPONSE', taskId: 'x', timestamp: 't', payload: { status: 'ok' } })).toBe(true);
  });
});

// ─── WorkerChannel ─────────────────────────────────────────────────────────────

describe('WorkerChannel', () => {
  let proc: ChildProcess & { _emit: (msg: unknown) => void };
  let channel: WorkerChannel;

  beforeEach(() => {
    proc = makeMockProc();
    channel = new WorkerChannel(proc, 'task-001');
  });

  afterEach(() => {
    channel.close();
  });

  it('creates a channel with supportsIPC = true when proc.send exists', () => {
    expect(channel.supportsIPC()).toBe(true);
  });

  it('creates a channel with supportsIPC = false when proc has no send', () => {
    const noIpcProc = makeMockProc(false);
    const ch = new WorkerChannel(noIpcProc, 'task-002');
    expect(ch.supportsIPC()).toBe(false);
    ch.close();
  });

  it('send() calls proc.send with correct IPCMessage shape', () => {
    channel.send('HEARTBEAT', { status: 'EXECUTING' });
    expect(proc.send).toHaveBeenCalledOnce();
    const [msg] = (proc.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg.type).toBe('HEARTBEAT');
    expect(msg.taskId).toBe('task-001');
    expect(msg.payload).toEqual({ status: 'EXECUTING' });
    expect(typeof msg.timestamp).toBe('string');
  });

  it('send() returns false after channel is closed', () => {
    channel.close();
    const result = channel.send('PAUSE');
    expect(result).toBe(false);
  });

  it('send() returns false when proc has no send function', () => {
    const noIpcProc = makeMockProc(false);
    const ch = new WorkerChannel(noIpcProc, 'task-003');
    expect(ch.send('KILL')).toBe(false);
    ch.close();
  });

  it('onMessage() registers handler and dispatches incoming messages', () => {
    const handler = vi.fn();
    channel.onMessage('HEARTBEAT', handler);

    const msg: IPCMessage = { type: 'HEARTBEAT', taskId: 'task-001', timestamp: new Date().toISOString(), payload: { status: 'ok' } };
    proc._emit(msg);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it('does not dispatch messages with wrong taskId', () => {
    const handler = vi.fn();
    channel.onMessage('HEARTBEAT', handler);

    const msg: IPCMessage = { type: 'HEARTBEAT', taskId: 'other-task', timestamp: new Date().toISOString() };
    proc._emit(msg);

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not dispatch non-IPC shaped messages', () => {
    const handler = vi.fn();
    channel.onMessage('HEARTBEAT', handler);

    proc._emit({ foo: 'bar' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('multiple handlers for the same type are all called', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    channel.onMessage('STATUS_RESPONSE', h1);
    channel.onMessage('STATUS_RESPONSE', h2);

    const msg: IPCMessage = { type: 'STATUS_RESPONSE', taskId: 'task-001', timestamp: new Date().toISOString() };
    proc._emit(msg);

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('handlers for different types do not cross-fire', () => {
    const heartbeatHandler = vi.fn();
    const pauseHandler = vi.fn();
    channel.onMessage('HEARTBEAT', heartbeatHandler);
    channel.onMessage('PAUSE', pauseHandler);

    const hbMsg: IPCMessage = { type: 'HEARTBEAT', taskId: 'task-001', timestamp: new Date().toISOString() };
    proc._emit(hbMsg);

    expect(heartbeatHandler).toHaveBeenCalledOnce();
    expect(pauseHandler).not.toHaveBeenCalled();
  });

  it('close() removes listeners and marks channel closed', () => {
    expect(channel.isClosed()).toBe(false);
    channel.close();
    expect(channel.isClosed()).toBe(true);
  });

  it('close() is idempotent (calling twice is safe)', () => {
    channel.close();
    expect(() => channel.close()).not.toThrow();
  });

  it('sendHeartbeat() sends HEARTBEAT message', () => {
    channel.sendHeartbeat({ status: 'TESTING', filesChangedCount: 5 });
    expect(proc.send).toHaveBeenCalledOnce();
    const [msg] = (proc.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg.type).toBe('HEARTBEAT');
    expect(msg.payload).toMatchObject({ status: 'TESTING', filesChangedCount: 5 });
  });

  it('requestStatus() sends STATUS_REQUEST message', () => {
    channel.requestStatus();
    expect(proc.send).toHaveBeenCalledOnce();
    const [msg] = (proc.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg.type).toBe('STATUS_REQUEST');
  });

  it('pause() sends PAUSE message', () => {
    channel.pause();
    const [msg] = (proc.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg.type).toBe('PAUSE');
  });

  it('resume() sends RESUME message', () => {
    channel.resume();
    const [msg] = (proc.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg.type).toBe('RESUME');
  });

  it('kill() sends KILL message', () => {
    channel.kill();
    const [msg] = (proc.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(msg.type).toBe('KILL');
  });

  it('after close(), no handlers are dispatched', () => {
    const handler = vi.fn();
    channel.onMessage('HEARTBEAT', handler);
    channel.close();

    const msg: IPCMessage = { type: 'HEARTBEAT', taskId: 'task-001', timestamp: new Date().toISOString() };
    // Even if the proc emits after close, handler should not be registered anymore
    // (listeners removed in close)
    proc._emit(msg);

    expect(handler).not.toHaveBeenCalled();
  });

  it('handler errors are swallowed (channel stays stable)', () => {
    channel.onMessage('KILL', () => { throw new Error('handler error'); });

    const msg: IPCMessage = { type: 'KILL', taskId: 'task-001', timestamp: new Date().toISOString() };
    expect(() => proc._emit(msg)).not.toThrow();
  });
});

// ─── ChannelRegistry ──────────────────────────────────────────────────────────

describe('ChannelRegistry', () => {
  let registry: ChannelRegistry;

  beforeEach(() => {
    registry = new ChannelRegistry();
  });

  afterEach(() => {
    registry.closeAll();
  });

  function makeChannel(taskId: string): WorkerChannel {
    const proc = makeMockProc();
    return new WorkerChannel(proc, taskId);
  }

  it('register() and get() work correctly', () => {
    const ch = makeChannel('t-001');
    registry.register('t-001', ch);
    expect(registry.get('t-001')).toBe(ch);
    ch.close();
  });

  it('has() returns true for registered taskId', () => {
    const ch = makeChannel('t-002');
    registry.register('t-002', ch);
    expect(registry.has('t-002')).toBe(true);
    ch.close();
  });

  it('has() returns false for unknown taskId', () => {
    expect(registry.has('nonexistent')).toBe(false);
  });

  it('get() returns undefined for unknown taskId', () => {
    expect(registry.get('unknown')).toBeUndefined();
  });

  it('remove() closes and removes the channel', () => {
    const ch = makeChannel('t-003');
    registry.register('t-003', ch);
    const removed = registry.remove('t-003');
    expect(removed).toBe(true);
    expect(registry.has('t-003')).toBe(false);
    expect(ch.isClosed()).toBe(true);
  });

  it('remove() returns false for unknown taskId', () => {
    expect(registry.remove('nonexistent')).toBe(false);
  });

  it('closeAll() closes all channels and clears registry', () => {
    const ch1 = makeChannel('t-004');
    const ch2 = makeChannel('t-005');
    registry.register('t-004', ch1);
    registry.register('t-005', ch2);

    registry.closeAll();

    expect(registry.size()).toBe(0);
    expect(ch1.isClosed()).toBe(true);
    expect(ch2.isClosed()).toBe(true);
  });

  it('listTaskIds() returns all registered taskIds', () => {
    const ch1 = makeChannel('task-a');
    const ch2 = makeChannel('task-b');
    registry.register('task-a', ch1);
    registry.register('task-b', ch2);

    const ids = registry.listTaskIds();
    expect(ids).toContain('task-a');
    expect(ids).toContain('task-b');
    expect(ids).toHaveLength(2);
  });

  it('size() returns correct count', () => {
    expect(registry.size()).toBe(0);
    const ch = makeChannel('t-x');
    registry.register('t-x', ch);
    expect(registry.size()).toBe(1);
  });
});

// ─── WorkerSideChannel ────────────────────────────────────────────────────────

describe('WorkerSideChannel', () => {
  it('supportsIPC() returns false when process.send is not a function', () => {
    // In test environment, process.send is typically undefined
    const originalSend = process.send;
    // @ts-expect-error — temporarily remove
    delete process.send;

    const ch = new WorkerSideChannel('task-w-001');
    expect(ch.supportsIPC()).toBe(false);
    ch.close();

    process.send = originalSend;
  });

  it('send() returns false when process.send is not available', () => {
    const originalSend = process.send;
    // @ts-expect-error
    delete process.send;

    const ch = new WorkerSideChannel('task-w-002');
    expect(ch.send('HEARTBEAT', { status: 'ok' })).toBe(false);
    ch.close();

    process.send = originalSend;
  });

  it('send() returns false when channel is closed', () => {
    const ch = new WorkerSideChannel('task-w-003');
    ch.close();
    expect(ch.send('RESUME')).toBe(false);
  });

  it('isClosed() returns false before close', () => {
    const ch = new WorkerSideChannel('task-w-004');
    expect(ch.isClosed()).toBe(false);
    ch.close();
  });

  it('isClosed() returns true after close', () => {
    const ch = new WorkerSideChannel('task-w-005');
    ch.close();
    expect(ch.isClosed()).toBe(true);
  });

  it('close() is idempotent', () => {
    const ch = new WorkerSideChannel('task-w-006');
    ch.close();
    expect(() => ch.close()).not.toThrow();
  });

  it('onMessage() registers handlers that fire on emitter message events', () => {
    const emitter = new EventEmitter();
    const ch = new WorkerSideChannel('task-w-007', emitter);
    const handler = vi.fn();
    ch.onMessage('PAUSE', handler);

    const msg: IPCMessage = { type: 'PAUSE', taskId: 'task-w-007', timestamp: new Date().toISOString() };
    emitter.emit('message', msg);

    expect(handler).toHaveBeenCalledWith(msg);
    ch.close();
  });

  it('does not dispatch messages with wrong taskId', () => {
    const emitter = new EventEmitter();
    const ch = new WorkerSideChannel('task-w-008', emitter);
    const handler = vi.fn();
    ch.onMessage('RESUME', handler);

    const msg: IPCMessage = { type: 'RESUME', taskId: 'other-task', timestamp: new Date().toISOString() };
    emitter.emit('message', msg);

    expect(handler).not.toHaveBeenCalled();
    ch.close();
  });

  it('send() with mocked process.send sends correct message shape', () => {
    const mockSend = vi.fn().mockReturnValue(true);
    process.send = mockSend as unknown as typeof process.send;

    const ch = new WorkerSideChannel('task-w-009');
    ch.send('STATUS_RESPONSE', { status: 'DONE' });

    expect(mockSend).toHaveBeenCalledOnce();
    const [msg] = mockSend.mock.calls[0];
    expect(msg.type).toBe('STATUS_RESPONSE');
    expect(msg.taskId).toBe('task-w-009');
    expect(msg.payload).toEqual({ status: 'DONE' });

    ch.close();
    // @ts-expect-error
    delete process.send;
  });
});
