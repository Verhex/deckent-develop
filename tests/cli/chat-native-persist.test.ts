import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import {
  runChatNativeLoop,
  getRecentTurns,
  type ChatNativeOptions,
  type ChatMemoryAdapter,
  type ChatProviderAdapter,
  type McpToolDispatcher,
  type ChatMessage,
} from '../../src/cli/commands/chat-native.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import { appendLedgerTurn } from '../../src/cli/repl/session-ledger.js';
import type { ProviderMessage } from '../../src/agent/provider-tooluse/types.js';

// ─── Helpers ────────────────────────────────────────────────────────

async function* lines(...items: string[]): AsyncIterable<string> {
  for (const item of items) yield item;
}

function stubDispatcher(): McpToolDispatcher {
  return { dispatch: vi.fn(async () => 'ok') };
}

function mockMemory(
  history: Array<{ role: string; content: string }> = [],
): { adapter: ChatMemoryAdapter; appendSpy: ReturnType<typeof vi.fn>; historySpy: ReturnType<typeof vi.fn> } {
  const appendSpy = vi.fn(() => 0);
  const historySpy = vi.fn(() => history);
  const adapter: ChatMemoryAdapter = {
    appendChatTurn: appendSpy,
    getChatHistory: historySpy,
  };
  return { adapter, appendSpy, historySpy };
}

let ledgerRoot: string;
const ledgerCwd = 'chat-native-persist-project';

beforeEach(() => {
  ledgerRoot = mkdtempSync(join(tmpdir(), 'deckent-chat-native-ledger-'));
});

afterEach(() => {
  rmSync(ledgerRoot, { recursive: true, force: true });
});

function baseOpts(
  overrides: Partial<ChatNativeOptions> & Pick<ChatNativeOptions, 'provider' | 'dispatcher' | 'input'>,
): ChatNativeOptions {
  return {
    output: vi.fn(),
    resumeLedgerOptions: { rootDir: ledgerRoot, cwd: ledgerCwd },
    ...overrides,
  };
}

// ─── Test 1: turn persist ────────────────────────────────────────────

describe('chat-native persist — turn persist', () => {
  it('appends user and assistant turns to memory with correct sessionId', async () => {
    const sendSpy = vi.fn(async () => ({ text: 'reply', stopReason: 'end_turn' as const }));
    const provider: ChatProviderAdapter = { send: sendSpy };
    const { adapter, appendSpy } = mockMemory();

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hello'),
      memory: adapter,
      sessionId: 'persist-session-1',
    }));

    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(appendSpy).toHaveBeenNthCalledWith(1, 'persist-session-1', 'user', 'hello');
    expect(appendSpy).toHaveBeenNthCalledWith(2, 'persist-session-1', 'assistant', 'reply');
  });

  it('auto-generates sessionId when not provided and persists with it', async () => {
    const { adapter, appendSpy } = mockMemory();
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'auto', stopReason: 'end_turn' as const })),
    };

    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('test'),
      memory: adapter,
      // no sessionId — auto-generated
    }));

    expect(appendSpy).toHaveBeenCalledTimes(2);
    const [firstCall] = appendSpy.mock.calls;
    // sessionId auto-generated as `chat-<timestamp>` — starts with "chat-"
    expect(firstCall[0]).toMatch(/^chat-\d+/);
    expect(firstCall[1]).toBe('user');
    expect(firstCall[2]).toBe('test');
  });
});

// ─── Test 2: resume yükle ────────────────────────────────────────────

describe('chat-native persist — resume yükle', () => {
  it('pre-populates transcript with prior history when resumeLimit > 0', async () => {
    const priorHistory = [
      { role: 'user', content: 'old question' },
      { role: 'assistant', content: 'old answer' },
    ];
    const { adapter, historySpy } = mockMemory(priorHistory);
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'new answer', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('new question'),
      memory: adapter,
      sessionId: 'resume-session',
      resumeLimit: 10,
    }));

    // getChatHistory called with the session id and resumeLimit
    expect(historySpy).toHaveBeenCalledWith('resume-session', 10);

    // Prior history is at the front of the transcript
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'old question' });
    expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'old answer' });
    // New turn follows
    expect(transcript[2]).toMatchObject({ role: 'user', content: 'new question' });
    expect(transcript[3]).toMatchObject({ role: 'assistant', content: 'new answer' });
  });

  it('does not call getChatHistory when resumeLimit is 0 (default)', async () => {
    const { adapter, historySpy } = mockMemory([
      { role: 'user', content: 'should-not-appear' },
    ]);
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'fresh', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hi'),
      memory: adapter,
      sessionId: 'no-resume',
      resumeLimit: 0,
    }));

    expect(historySpy).not.toHaveBeenCalled();
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'hi' });
  });
});

// ─── Test 3: /resume slash (Faz D) ──────────────────────────────────

function mockMemoryWithSessions(
  sessions: Array<{ sessionId: string; turnCount: number; lastAt: string; preview: string }>,
  historyBySession: Record<string, Array<{ role: string; content: string }>>,
): ChatMemoryAdapter {
  return {
    appendChatTurn: vi.fn(() => 0),
    getChatHistory: vi.fn((sid: string) => historyBySession[sid] ?? []),
    listChatSessions: vi.fn(() => sessions),
  };
}

describe('chat-native — /resume slash', () => {
  it('/resume (no arg) lists recent sessions', async () => {
    const out: string[] = [];
    const adapter = mockMemoryWithSessions(
      [{ sessionId: 's1', turnCount: 3, lastAt: '2026-06-03T10:00:00Z', preview: 'deploy help' }],
      {},
    );
    await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) },
      dispatcher: stubDispatcher(),
      input: lines('/resume'),
      output: (l) => out.push(l),
      memory: adapter,
      lang: 'en',
    }));
    expect(out.join('\n')).toContain('1. deploy help');
  });

  it('/resume <n> loads that session into the transcript and switches it', async () => {
    const out: string[] = [];
    const adapter = mockMemoryWithSessions(
      [{ sessionId: 'sX', turnCount: 2, lastAt: '2026-06-03T10:00:00Z', preview: 'first q' }],
      { sX: [{ role: 'user', content: 'first q' }, { role: 'assistant', content: 'first a' }] },
    );
    const appendSpy = adapter.appendChatTurn as ReturnType<typeof vi.fn>;
    const transcript = await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: 'reply', stopReason: 'end_turn' as const })) },
      dispatcher: stubDispatcher(),
      input: lines('/resume', '/resume 1', 'continue please'),
      output: (l) => out.push(l),
      memory: adapter,
      lang: 'en',
    }));
    // Resumed history is at the front of the transcript (model context restored)
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'first q' });
    expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'first a' });
    // New turn appended to the RESUMED session id (sX), not the auto session
    const userAppend = appendSpy.mock.calls.find((c) => c[1] === 'user' && c[2] === 'continue please');
    expect(userAppend?.[0]).toBe('sX');
  });

  it('reports only a successful memory-backed resume through the optional App callback', async () => {
    const resumed: string[] = [];
    const adapter = mockMemoryWithSessions(
      [{ sessionId: 'sX', turnCount: 2, lastAt: '2026-06-03T10:00:00Z', preview: 'first q' }],
      { sX: [{ role: 'user', content: 'old' }] },
    );
    await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) },
      dispatcher: stubDispatcher(),
      input: lines('/resume', '/resume 1'),
      output: vi.fn(),
      memory: adapter,
      onSessionResumed: (id) => resumed.push(id),
    }));
    expect(resumed).toEqual(['sX']);
  });

  it('does not change the App identity callback for missing memory or a failed resume', async () => {
    const resumed = vi.fn();
    await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) },
      dispatcher: stubDispatcher(),
      input: lines('/resume missing'),
      output: vi.fn(),
      memory: mockMemoryWithSessions([], {}),
      onSessionResumed: resumed,
    }));
    expect(resumed).not.toHaveBeenCalled();
  });

  it('restores a strict ledger before legacy memory, preserves tool linkage, and keeps numeric picker precedence', async () => {
    const output: string[] = [];
    const resumed = vi.fn();
    const picked: ProviderMessage[] = [
      { role: 'user', content: 'ledger question' },
      { role: 'assistant', content: 'ledger tool request', toolCalls: [{ id: 'tool-1', name: 'deckent_status', args: {} }] },
      { role: 'tool', content: 'ledger tool result', toolCallId: 'tool-1' },
    ];
    appendLedgerTurn({
      rootDir: ledgerRoot, cwd: ledgerCwd, sessionId: 'picked', turnIndex: 0,
      ts: '2026-09-07T00:00:00.000Z', provider: 'fixture', model: 'fixture', messagesDelta: picked, usage: null,
    });
    // A ledger named "1" must never override the memory picker selection.
    appendLedgerTurn({
      rootDir: ledgerRoot, cwd: ledgerCwd, sessionId: '1', turnIndex: 0,
      ts: '2026-09-07T00:01:00.000Z', provider: 'fixture', model: 'fixture',
      messagesDelta: [{ role: 'user', content: 'wrong numeric ledger' }], usage: null,
    });
    const adapter = mockMemoryWithSessions(
      [{ sessionId: 'picked', turnCount: 3, lastAt: '2026-09-07T00:00:00Z', preview: 'ledger question' }],
      { picked: [{ role: 'user', content: 'legacy shadow must not win' }] },
    );
    const history = adapter.getChatHistory as ReturnType<typeof vi.fn>;

    const transcript = await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) },
      dispatcher: stubDispatcher(), input: lines('/resume 1'), output: (line) => output.push(line),
      memory: adapter, onSessionResumed: resumed,
    }));

    expect(resumed).toHaveBeenCalledWith('picked');
    expect(history).not.toHaveBeenCalled();
    expect(transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'tool', content: 'ledger tool result', toolUseId: 'tool-1' }),
    ]));
    expect(transcript).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ content: 'wrong numeric ledger' }),
    ]));
    expect(output.join('\n')).toContain('ledger question');
  });

  it('restores an exact literal ledger beyond the five recent memory rows', async () => {
    const resumed = vi.fn();
    appendLedgerTurn({
      rootDir: ledgerRoot, cwd: ledgerCwd, sessionId: 'sprint-7099', turnIndex: 0,
      ts: '2026-09-07T00:00:00.000Z', provider: 'fixture', model: 'fixture',
      messagesDelta: [{ role: 'user', content: 'older literal ledger' }], usage: null,
    });
    const sessions = Array.from({ length: 5 }, (_, index) => ({
      sessionId: `recent-${index}`, turnCount: 1, lastAt: `2026-09-07T00:0${index}:00Z`, preview: `recent ${index}`,
    }));
    const transcript = await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) }, dispatcher: stubDispatcher(),
      input: lines('/resume sprint-7099'), memory: mockMemoryWithSessions(sessions, {}), onSessionResumed: resumed,
    }));
    expect(resumed).toHaveBeenCalledWith('sprint-7099');
    expect(transcript).toEqual(expect.arrayContaining([expect.objectContaining({ content: 'older literal ledger' })]));
  });

  it('treats an empty or malformed present ledger as unavailable instead of falling back', async () => {
    const outputs: string[] = [];
    appendLedgerTurn({
      rootDir: ledgerRoot, cwd: ledgerCwd, sessionId: 'empty-ledger', turnIndex: 0,
      ts: '2026-09-07T00:00:00.000Z', provider: 'fixture', model: 'fixture', messagesDelta: [], usage: null,
    });
    const adapter = mockMemoryWithSessions([], {
      'empty-ledger': [{ role: 'user', content: 'must not be restored' }],
    });
    await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) }, dispatcher: stubDispatcher(),
      input: lines('/resume empty-ledger'), output: (line) => outputs.push(line), memory: adapter,
    }));
    expect(outputs.join('\n')).toBe(getMessage('tui.resume_picker_failed', 'en', { id: 'empty-ledger' }));
    expect(adapter.getChatHistory).not.toHaveBeenCalled();
  });

  it('appends caller-owned local chat context to /status without interpreting run output', async () => {
    const out: string[] = [];
    const dispatcher: McpToolDispatcher = { dispatch: vi.fn(async () => 'run truth: unavailable') };
    await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) },
      dispatcher,
      input: lines('/status'),
      output: (line) => out.push(line),
      localStatusDetail: () => 'local active chat context: chat-memory-123',
    }));
    expect(out).toEqual(['run truth: unavailable\nlocal active chat context: chat-memory-123']);
    expect(dispatcher.dispatch).toHaveBeenCalledWith('deckent_status', { root: '.' });
  });

  it('/resume <bad> reports not-found', async () => {
    const out: string[] = [];
    await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) },
      dispatcher: stubDispatcher(),
      input: lines('/resume nope-id'),
      output: (l) => out.push(l),
      memory: mockMemoryWithSessions([], {}),
      lang: 'en',
    }));
    expect(out.join('\n')).toMatch(/no turns found/i);
  });

  it('/resume with no memory adapter reports memory unavailable', async () => {
    const out: string[] = [];
    await runChatNativeLoop(baseOpts({
      provider: { send: vi.fn(async () => ({ text: '', stopReason: 'end_turn' as const })) },
      dispatcher: stubDispatcher(),
      input: lines('/resume'),
      output: (l) => out.push(l),
      lang: 'en',
    }));
    expect(out.join('\n')).toMatch(/memory store is not available/i);
  });
});

// ─── Test 3: boş history ─────────────────────────────────────────────

describe('chat-native persist — boş history', () => {
  it('handles empty getChatHistory gracefully — fresh session starts with no prior turns', async () => {
    const { adapter, appendSpy } = mockMemory([]);
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'hello back', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('hello'),
      memory: adapter,
      sessionId: 'empty-history',
      resumeLimit: 5,
    }));

    // No pre-populated turns — starts fresh
    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'hello' });
    expect(transcript[1]).toMatchObject({ role: 'assistant', content: 'hello back' });
    expect(appendSpy).toHaveBeenCalledTimes(2);
  });

  it('works without memory adapter at all — no-op, backward compatible', async () => {
    const provider: ChatProviderAdapter = {
      send: vi.fn(async () => ({ text: 'no-mem', stopReason: 'end_turn' as const })),
    };

    const transcript = await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('ping'),
      // no memory option
    }));

    expect(transcript).toHaveLength(2);
    expect(transcript[0]).toMatchObject({ role: 'user', content: 'ping' });
  });
});

// ─── Test 4: window truncate ─────────────────────────────────────────

describe('chat-native persist — window truncate', () => {
  it('only sends last N turns to provider when contextWindowSize is set', async () => {
    const sentMessages: ChatMessage[][] = [];
    const provider: ChatProviderAdapter = {
      send: vi.fn(async (msgs) => {
        sentMessages.push([...msgs]);
        return { text: 'ok', stopReason: 'end_turn' as const };
      }),
    };
    const { adapter } = mockMemory([]);

    // Send 3 turns but contextWindowSize = 2 → provider only ever sees 2 msgs at most
    await runChatNativeLoop(baseOpts({
      provider,
      dispatcher: stubDispatcher(),
      input: lines('msg1', 'msg2', 'msg3'),
      memory: adapter,
      sessionId: 'window-session',
      contextWindowSize: 2,
    }));

    // Each provider.send call receives at most 2 messages
    for (const sent of sentMessages) {
      expect(sent.length).toBeLessThanOrEqual(2);
    }
  });

  it('getRecentTurns returns full transcript when contextWindowSize exceeds length', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
    ];
    expect(getRecentTurns(msgs, 10)).toEqual(msgs);
    expect(getRecentTurns(msgs, undefined)).toEqual(msgs);
  });

  it('getRecentTurns slices to last N when transcript is longer than window', () => {
    const msgs: ChatMessage[] = [
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
      { role: 'assistant', content: '4' },
    ];
    const result = getRecentTurns(msgs, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ content: '3' });
    expect(result[1]).toMatchObject({ content: '4' });
  });
});
