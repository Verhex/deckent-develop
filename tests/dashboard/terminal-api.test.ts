import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SessionRegistry,
  CommandHistory,
  SessionBuffer,
  createSession,
} from '../../src/dashboard/src/lib/terminal-api.js';
import { getBootstrapToken, createSession as createSession__tsm_013 } from "../../src/dashboard/src/lib/terminal-api.js";

describe('SessionRegistry — multi-session management', () => {
  it('tracks multiple sessions and lists them all', () => {
    const registry = new SessionRegistry();
    registry.add({ id: 's1', kind: 'shell', status: 'running' });
    registry.add({ id: 's2', kind: 'deckent', status: 'running' });
    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((s) => s.id)).toContain('s1');
    expect(registry.list().map((s) => s.id)).toContain('s2');
  });

  it('removes a session by id', () => {
    const registry = new SessionRegistry();
    registry.add({ id: 's3', kind: 'shell', status: 'running' });
    registry.remove('s3');
    expect(registry.list()).toHaveLength(0);
    expect(registry.get('s3')).toBeUndefined();
  });

  it('returns undefined for unknown session id', () => {
    const registry = new SessionRegistry();
    expect(registry.get('unknown')).toBeUndefined();
  });
});

describe('CommandHistory — up/down navigation', () => {
  it('navigates up through history entries', () => {
    const h = new CommandHistory();
    h.push('ls');
    h.push('pwd');
    expect(h.navigate('up')).toBe('pwd');
    expect(h.navigate('up')).toBe('ls');
  });

  it('navigates down back toward current input (returns undefined at bottom)', () => {
    const h = new CommandHistory();
    h.push('echo a');
    h.push('echo b');
    h.navigate('up');
    h.navigate('up');
    expect(h.navigate('down')).toBe('echo b');
    expect(h.navigate('down')).toBeUndefined();
  });

  it('resets cursor after a new push', () => {
    const h = new CommandHistory();
    h.push('cmd1');
    h.navigate('up');
    h.push('cmd2');
    expect(h.navigate('up')).toBe('cmd2');
  });

  it('does not add duplicate consecutive entries', () => {
    const h = new CommandHistory();
    h.push('ls');
    h.push('ls');
    expect(h.getAll()).toHaveLength(1);
  });
});

describe('SessionBuffer — output buffer', () => {
  it('accumulates appended chunks and returns joined string', () => {
    const buf = new SessionBuffer();
    buf.append('s1', 'hello ');
    buf.append('s1', 'world');
    expect(buf.get('s1')).toBe('hello world');
  });

  it('returns empty string for unknown session', () => {
    const buf = new SessionBuffer();
    expect(buf.get('unknown')).toBe('');
  });

  it('clears buffer for a session', () => {
    const buf = new SessionBuffer();
    buf.append('s2', 'data');
    buf.clear('s2');
    expect(buf.get('s2')).toBe('');
  });

  it('keeps sessions isolated from each other', () => {
    const buf = new SessionBuffer();
    buf.append('a', 'aaa');
    buf.append('b', 'bbb');
    buf.clear('a');
    expect(buf.get('a')).toBe('');
    expect(buf.get('b')).toBe('bbb');
  });
});

describe('createSession + SessionRegistry integration', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'new-1', kind: 'shell', status: 'running' }),
    }));
    (window as unknown as Record<string, unknown>).__DECKENT_TERMINAL_TOKEN__ = undefined;
  });

  it('createSession result can be registered in SessionRegistry', async () => {
    const registry = new SessionRegistry();
    const meta = await createSession({ kind: 'shell' });
    registry.add(meta);
    expect(registry.get('new-1')).toEqual({ id: 'new-1', kind: 'shell', status: 'running' });
  });
});

// TSM-013: physically merged from tests/dashboard/terminal/terminal-api.test.ts.
{
describe('terminal-api', () => {
    it('reads the injected bootstrap token', () => {
        (window as unknown as Record<string, unknown>).__DECKENT_TERMINAL_TOKEN__ = 'tok-1';
        expect(getBootstrapToken()).toBe('tok-1');
    });
    it('POSTs a session create', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 's1' }) });
        vi.stubGlobal('fetch', fetchMock);
        const r = await createSession__tsm_013({ kind: 'shell' });
        expect(r.id).toBe('s1');
        expect(fetchMock).toHaveBeenCalledWith('/api/terminal/sessions', expect.objectContaining({ method: 'POST' }));
    });
});
}
