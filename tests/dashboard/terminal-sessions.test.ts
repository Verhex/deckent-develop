// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MultiSessionManager,
  copyToClipboard,
  getClipboardText,
} from '../../src/dashboard/src/lib/terminal-sessions.js';

// ---------------------------------------------------------------------------
// MultiSessionManager — multiSession open / switch
// ---------------------------------------------------------------------------
describe('MultiSessionManager — session open and switch', () => {
  let mgr: MultiSessionManager;

  beforeEach(() => {
    mgr = new MultiSessionManager();
  });

  it('openSession registers the session and sets it as active', () => {
    mgr.openSession({ id: 'a', kind: 'shell', status: 'running' });
    expect(mgr.listSessions()).toHaveLength(1);
    expect(mgr.getActiveSessionId()).toBe('a');
    expect(mgr.getActiveSession()?.id).toBe('a');
  });

  it('opening multiple sessions tracks all and last becomes active', () => {
    mgr.openSession({ id: 'a', kind: 'shell', status: 'running' });
    mgr.openSession({ id: 'b', kind: 'deckent', status: 'running' });
    expect(mgr.listSessions()).toHaveLength(2);
    expect(mgr.getActiveSessionId()).toBe('b');
  });

  it('switchSession changes the active session', () => {
    mgr.openSession({ id: 'a', kind: 'shell', status: 'running' });
    mgr.openSession({ id: 'b', kind: 'deckent', status: 'running' });
    const ok = mgr.switchSession('a');
    expect(ok).toBe(true);
    expect(mgr.getActiveSessionId()).toBe('a');
  });

  it('switchSession returns false for unknown id and does not change active', () => {
    mgr.openSession({ id: 'a', kind: 'shell', status: 'running' });
    const ok = mgr.switchSession('nonexistent');
    expect(ok).toBe(false);
    expect(mgr.getActiveSessionId()).toBe('a');
  });

  it('closeSession removes the session and falls back to remaining', () => {
    mgr.openSession({ id: 'a', kind: 'shell', status: 'running' });
    mgr.openSession({ id: 'b', kind: 'deckent', status: 'running' });
    mgr.switchSession('b');
    mgr.closeSession('b');
    expect(mgr.listSessions()).toHaveLength(1);
    // falls back to remaining session
    expect(mgr.getActiveSessionId()).toBe('a');
  });

  it('closeSession sets active to null when no sessions remain', () => {
    mgr.openSession({ id: 'x', kind: 'shell', status: 'running' });
    mgr.closeSession('x');
    expect(mgr.listSessions()).toHaveLength(0);
    expect(mgr.getActiveSessionId()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Command history — ring buffer navigation
// ---------------------------------------------------------------------------
describe('MultiSessionManager — history navigation', () => {
  let mgr: MultiSessionManager;

  beforeEach(() => {
    mgr = new MultiSessionManager();
    mgr.openSession({ id: 's1', kind: 'shell', status: 'running' });
  });

  it('pushCommand + navigateHistory up returns most recent first', () => {
    mgr.pushCommand('ls');
    mgr.pushCommand('pwd');
    expect(mgr.navigateHistory('up', 's1')).toBe('pwd');
    expect(mgr.navigateHistory('up', 's1')).toBe('ls');
  });

  it('navigateHistory down returns towards current (undefined at bottom)', () => {
    mgr.pushCommand('echo a');
    mgr.pushCommand('echo b');
    mgr.navigateHistory('up', 's1');
    mgr.navigateHistory('up', 's1');
    expect(mgr.navigateHistory('down', 's1')).toBe('echo b');
    expect(mgr.navigateHistory('down', 's1')).toBeUndefined();
  });

  it('history is isolated per session', () => {
    mgr.openSession({ id: 's2', kind: 'deckent', status: 'running' });
    mgr.pushCommand('ls', 's1');
    mgr.pushCommand('help', 's2');
    expect(mgr.navigateHistory('up', 's1')).toBe('ls');
    expect(mgr.navigateHistory('up', 's2')).toBe('help');
  });

  it('navigateHistory uses active session when no id given', () => {
    mgr.pushCommand('whoami');
    expect(mgr.navigateHistory('up')).toBe('whoami');
  });

  it('pushCommand with no active session is a no-op', () => {
    const empty = new MultiSessionManager();
    // Should not throw
    expect(() => empty.pushCommand('cmd')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Output buffer
// ---------------------------------------------------------------------------
describe('MultiSessionManager — buffer append/get/clear', () => {
  let mgr: MultiSessionManager;

  beforeEach(() => {
    mgr = new MultiSessionManager();
    mgr.openSession({ id: 'b1', kind: 'shell', status: 'running' });
  });

  it('appendToBuffer accumulates chunks and getBufferContent returns joined output', () => {
    mgr.appendToBuffer('b1', 'hello ');
    mgr.appendToBuffer('b1', 'world');
    expect(mgr.getBufferContent('b1')).toBe('hello world');
  });

  it('getBufferContent returns empty string for unknown session', () => {
    expect(mgr.getBufferContent('nope')).toBe('');
  });

  it('clearBuffer empties the accumulated output', () => {
    mgr.appendToBuffer('b1', 'some data');
    mgr.clearBuffer('b1');
    expect(mgr.getBufferContent('b1')).toBe('');
  });

  it('buffers are isolated between sessions', () => {
    mgr.openSession({ id: 'b2', kind: 'deckent', status: 'running' });
    mgr.appendToBuffer('b1', 'aaaa');
    mgr.appendToBuffer('b2', 'bbbb');
    mgr.clearBuffer('b1');
    expect(mgr.getBufferContent('b1')).toBe('');
    expect(mgr.getBufferContent('b2')).toBe('bbbb');
  });
});

// ---------------------------------------------------------------------------
// Clipboard helpers
// ---------------------------------------------------------------------------
describe('copyToClipboard + getClipboardText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copyToClipboard writes text and returns true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText, readText: vi.fn() } });

    const result = await copyToClipboard('hello terminal');
    expect(writeText).toHaveBeenCalledWith('hello terminal');
    expect(result).toBe(true);
  });

  it('copyToClipboard returns false when clipboard API throws', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const result = await copyToClipboard('text');
    expect(result).toBe(false);
  });

  it('getClipboardText returns clipboard content on success', async () => {
    const readText = vi.fn().mockResolvedValue('pasted text');
    vi.stubGlobal('navigator', { clipboard: { readText, writeText: vi.fn() } });

    const text = await getClipboardText();
    expect(text).toBe('pasted text');
  });

  it('getClipboardText returns undefined when clipboard API throws', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const text = await getClipboardText();
    expect(text).toBeUndefined();
  });
});
