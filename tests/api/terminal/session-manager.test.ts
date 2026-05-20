import { describe, it, expect, vi } from 'vitest';
import { PtySessionManager } from '../../../src/api/terminal/session-manager.js';
import type { SessionBackend, BackendHandle } from '../../../src/api/terminal/session-backend.js';

function fakeBackend() {
  let onDataCb: (d: string) => void = () => {};
  let onExitCb: (c: number) => void = () => {};
  const handle: BackendHandle = { write: vi.fn(), resize: vi.fn(), kill: vi.fn() };
  const be: SessionBackend = {
    spawn: (_s, onData, onExit) => {
      onDataCb = onData;
      onExitCb = onExit;
      return handle;
    },
  };
  return { be, handle, emit: (d: string) => onDataCb(d), exit: (c: number) => onExitCb(c) };
}

describe('PtySessionManager', () => {
  it('creates a session and buffers output (bounded ring)', () => {
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 8, idleTimeoutMs: 0 });
    const s = m.create({ kind: 'shell' });
    f.emit('ABCDEFGHIJ'); // 10 bytes into an 8-byte ring
    expect(m.replay(s.id)).toBe('CDEFGHIJ'); // last 8 bytes only
  });

  it('detach does NOT kill; kill is explicit', () => {
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 1024, idleTimeoutMs: 0 });
    const s = m.create({ kind: 'shell' });
    m.detach(s.id);
    expect(f.handle.kill).not.toHaveBeenCalled();
    m.kill(s.id);
    expect(f.handle.kill).toHaveBeenCalledOnce();
  });

  it('enforces maxSessions', () => {
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 16, idleTimeoutMs: 0, maxSessions: 1 });
    m.create({ kind: 'shell' });
    expect(() => m.create({ kind: 'shell' })).toThrow(/max/i);
  });

  it('idle reaper kills idle shell but exempts deckent kind', () => {
    vi.useFakeTimers();
    const f = fakeBackend();
    const m = new PtySessionManager(f.be, { scrollbackBytes: 16, idleTimeoutMs: 1000 });
    const shell = m.create({ kind: 'shell' });
    const dk = m.create({ kind: 'deckent' });
    vi.advanceTimersByTime(1500);
    m.reapIdle();
    expect(m.get(shell.id)).toBeUndefined();
    expect(m.get(dk.id)).toBeDefined();
    vi.useRealTimers();
  });
});
