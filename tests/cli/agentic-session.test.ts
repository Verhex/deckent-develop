import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock state ──────────────────────────────────────────────────────
// vi.mock factories are hoisted before imports, so shared mutable state must
// be declared with vi.hoisted() so it is available when the factory runs.

const { mockMemoryStoreCtor, getLastInstance, setExistsSyncResult } = vi.hoisted(() => {
  let lastInst: {
    appendChatTurn: ReturnType<typeof vi.fn>;
    getChatHistory: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  } | null = null;

  let existsResult = true;

  function makeInstance(overrides?: Partial<typeof lastInst>) {
    const inst = {
      appendChatTurn: vi.fn(() => 0),
      getChatHistory: vi.fn(() => [] as Array<{ role: string; content: string }>),
      close: vi.fn(),
      ...overrides,
    };
    lastInst = inst;
    return inst;
  }

  const ctor = vi.fn().mockImplementation(() => makeInstance());

  return {
    mockMemoryStoreCtor: ctor,
    getLastInstance: () => lastInst,
    setExistsSyncResult: (v: boolean) => { existsResult = v; },
    _getExistsResult: () => existsResult,
    makeInstance,
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn((..._args: unknown[]) => {
      // Inline check — existsResult captured via closure in hoisted block
      // Since we can't reference `setExistsSyncResult` return here directly,
      // we use a workaround: read from a module-level flag exposed by hoisted.
      // However, the simplest pattern is to just check the fn state each call.
      return true; // default; overridden per-test via existsSyncMock
    }),
  };
});

vi.mock('../../src/core/memory-store.js', () => ({
  MemoryStore: mockMemoryStoreCtor,
}));

import { existsSync } from 'node:fs';
import {
  createSession,
  persistTurn,
  resumeSession,
  buildChatMemoryAdapter,
  DEFAULT_SESSION_RESUME_LIMIT,
} from '../../src/cli/commands/agentic-session.js';

const existsSyncMock = existsSync as unknown as ReturnType<typeof vi.fn>;

function resetMocks() {
  vi.clearAllMocks();
  setExistsSyncResult(true);
  existsSyncMock.mockReturnValue(true);
  // Restore default MemoryStore factory
  mockMemoryStoreCtor.mockImplementation(() => {
    const inst = {
      appendChatTurn: vi.fn(() => 0),
      getChatHistory: vi.fn(() => [] as Array<{ role: string; content: string }>),
      close: vi.fn(),
    };
    (getLastInstance as unknown as { _set: (v: typeof inst) => void });
    // Update lastInst via a side-effectful factory pattern
    return inst;
  });
}

// Simpler: reset lastInst tracking by re-implementing the factory in beforeEach.
// We need the factory to update `lastInst`. Since hoisted gave us the ctor,
// we just re-mock it each time to capture the instance.
beforeEach(() => {
  vi.clearAllMocks();
  existsSyncMock.mockReturnValue(true);
  mockMemoryStoreCtor.mockImplementation(() => {
    return {
      appendChatTurn: vi.fn(() => 0),
      getChatHistory: vi.fn(() => [] as Array<{ role: string; content: string }>),
      close: vi.fn(),
    };
  });
});

// Helper to get the most recently created MemoryStore instance
function lastInstance() {
  const calls = mockMemoryStoreCtor.mock.results;
  if (calls.length === 0) return null;
  return calls[calls.length - 1].value as {
    appendChatTurn: ReturnType<typeof vi.fn>;
    getChatHistory: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
}

// ─── Test 1: persist ──────────────────────────────────────────────────────────

describe('agentic-session — persist', () => {
  it('calls appendChatTurn with correct sessionId, role, and content', () => {
    persistTurn('/project', 'sess-1', 'user', 'hello world');

    expect(lastInstance()).not.toBeNull();
    expect(lastInstance()!.appendChatTurn).toHaveBeenCalledOnce();
    expect(lastInstance()!.appendChatTurn).toHaveBeenCalledWith('sess-1', 'user', 'hello world');
    expect(lastInstance()!.close).toHaveBeenCalledOnce();
  });

  it('is a no-op when DB does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    expect(() => persistTurn('/project', 'sess-2', 'assistant', 'hi')).not.toThrow();
    expect(mockMemoryStoreCtor).not.toHaveBeenCalled();
  });

  it('always closes the store even if appendChatTurn throws', () => {
    const closeSpy = vi.fn();
    mockMemoryStoreCtor.mockImplementationOnce(() => ({
      appendChatTurn: vi.fn(() => { throw new Error('db error'); }),
      getChatHistory: vi.fn(() => []),
      close: closeSpy,
    }));
    expect(() => persistTurn('/project', 'sess-err', 'user', 'crash')).toThrow('db error');
    expect(closeSpy).toHaveBeenCalledOnce();
  });

  it('persists assistant role turns correctly', () => {
    persistTurn('/project', 'sess-assist', 'assistant', 'response text');
    expect(lastInstance()!.appendChatTurn).toHaveBeenCalledWith('sess-assist', 'assistant', 'response text');
  });
});

// ─── Test 2: resume ───────────────────────────────────────────────────────────

describe('agentic-session — resume', () => {
  it('calls getChatHistory with sessionId and default limit', () => {
    resumeSession('/project', 'sess-resume');

    expect(lastInstance()).not.toBeNull();
    expect(lastInstance()!.getChatHistory).toHaveBeenCalledWith('sess-resume', DEFAULT_SESSION_RESUME_LIMIT);
    expect(lastInstance()!.close).toHaveBeenCalledOnce();
  });

  it('passes custom limit through to getChatHistory', () => {
    resumeSession('/project', 'sess-custom', 5);
    expect(lastInstance()!.getChatHistory).toHaveBeenCalledWith('sess-custom', 5);
  });

  it('returns empty array when DB does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    const result = resumeSession('/project', 'sess-nofile');
    expect(result).toEqual([]);
    expect(mockMemoryStoreCtor).not.toHaveBeenCalled();
  });

  it('returns the history from getChatHistory', () => {
    const history = [
      { role: 'user', content: 'prior question' },
      { role: 'assistant', content: 'prior answer' },
    ];
    mockMemoryStoreCtor.mockImplementationOnce(() => ({
      appendChatTurn: vi.fn(() => 0),
      getChatHistory: vi.fn(() => history),
      close: vi.fn(),
    }));

    const result = resumeSession('/project', 'sess-with-data', 10);
    expect(result).toEqual(history);
  });
});

// ─── Test 3: createSession ────────────────────────────────────────────────────

describe('agentic-session — createSession', () => {
  it('returns the provided sessionId unchanged', () => {
    expect(createSession('my-session-id')).toBe('my-session-id');
  });

  it('generates a unique id when no sessionId is provided', () => {
    const id1 = createSession();
    const id2 = createSession();
    expect(id1).toMatch(/^agentic-\d+/);
    expect(id2).toMatch(/^agentic-\d+/);
    expect(id1).not.toBe(id2);
  });

  it('generates a unique id when empty string is provided', () => {
    expect(createSession('')).toMatch(/^agentic-\d+/);
  });

  it('generates a unique id when whitespace-only string is provided', () => {
    expect(createSession('   ')).toMatch(/^agentic-\d+/);
  });
});

// ─── Test 4: buildChatMemoryAdapter ──────────────────────────────────────────

describe('agentic-session — buildChatMemoryAdapter', () => {
  it('appendChatTurn wires through to persistTurn (calls MemoryStore.appendChatTurn)', () => {
    const adapter = buildChatMemoryAdapter('/project');
    adapter.appendChatTurn('adapter-sess', 'user', 'test message');

    expect(lastInstance()).not.toBeNull();
    expect(lastInstance()!.appendChatTurn).toHaveBeenCalledWith('adapter-sess', 'user', 'test message');
  });

  it('getChatHistory wires through to resumeSession (calls MemoryStore.getChatHistory)', () => {
    const expected = [{ role: 'user', content: 'cached' }];
    mockMemoryStoreCtor.mockImplementationOnce(() => ({
      appendChatTurn: vi.fn(() => 0),
      getChatHistory: vi.fn(() => expected),
      close: vi.fn(),
    }));

    const adapter = buildChatMemoryAdapter('/project');
    const result = adapter.getChatHistory('adapter-sess', 5);
    expect(result).toEqual(expected);
  });

  it('appendChatTurn is a no-op when DB does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    const adapter = buildChatMemoryAdapter('/project');
    expect(() => adapter.appendChatTurn('sess', 'user', 'msg')).not.toThrow();
    expect(mockMemoryStoreCtor).not.toHaveBeenCalled();
  });

  it('getChatHistory returns [] when DB does not exist', () => {
    existsSyncMock.mockReturnValue(false);
    const adapter = buildChatMemoryAdapter('/no-db');
    const result = adapter.getChatHistory('sess');
    expect(result).toEqual([]);
    expect(mockMemoryStoreCtor).not.toHaveBeenCalled();
  });
});
