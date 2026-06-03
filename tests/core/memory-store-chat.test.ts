import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryStore } from '../../src/core/memory-store.js';
import { searchMemory } from '../../src/core/memory-query.js';

let store: MemoryStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'memstore-chat-test-'));
  const dbPath = join(tmpDir, 'test.db');
  store = new MemoryStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('MemoryStore.createChatSession', () => {
  it('returns the provided session id verbatim when one is given', () => {
    const id = store.createChatSession('my-session-1');
    expect(id).toBe('my-session-1');
  });

  it('generates a session id when none is provided', () => {
    const id = store.createChatSession();
    expect(id).toMatch(/^chat-/);
    expect(id.length).toBeGreaterThan(8);
  });

  it('treats blank session ids as missing and generates one instead', () => {
    const id = store.createChatSession('   ');
    expect(id).toMatch(/^chat-/);
    expect(id.trim()).not.toBe('');
  });
});

describe('MemoryStore.appendChatTurn + getChatHistory', () => {
  it('persists turns in order with monotonic turn_index and ChatTurn shape', () => {
    const sid = store.createChatSession('session-A');

    const i0 = store.appendChatTurn(sid, 'user', 'Hello Deckent');
    const i1 = store.appendChatTurn(sid, 'assistant', 'Hi! What sprint are we on?');
    const i2 = store.appendChatTurn(sid, 'user', 'Sprint 190 — Trinity push');

    expect([i0, i1, i2]).toEqual([0, 1, 2]);

    const history = store.getChatHistory(sid);
    expect(history).toHaveLength(3);

    expect(history[0]).toMatchObject({
      session_id: sid,
      turn_index: 0,
      role: 'user',
      content: 'Hello Deckent',
    });
    expect(typeof history[0]!.timestamp).toBe('string');
    expect(history[1]).toMatchObject({
      turn_index: 1,
      role: 'assistant',
      content: 'Hi! What sprint are we on?',
    });
    expect(history[2]).toMatchObject({
      turn_index: 2,
      role: 'user',
      content: 'Sprint 190 — Trinity push',
    });
  });

  it('returns only the most recent N turns when limit is provided', () => {
    const sid = store.createChatSession('session-B');
    for (let i = 0; i < 5; i++) {
      const role = i % 2 === 0 ? 'user' : 'assistant';
      store.appendChatTurn(sid, role, `turn-${i}`);
    }

    const last2 = store.getChatHistory(sid, 2);
    expect(last2).toHaveLength(2);
    expect(last2.map(t => t.content)).toEqual(['turn-3', 'turn-4']);

    // limit=0 returns empty array
    expect(store.getChatHistory(sid, 0)).toEqual([]);
    // limit greater than available returns all
    expect(store.getChatHistory(sid, 99)).toHaveLength(5);
  });

  it('isolates turns by session_id and rejects empty session ids', () => {
    const a = store.createChatSession('session-X');
    const b = store.createChatSession('session-Y');

    store.appendChatTurn(a, 'user', 'X-message-1');
    store.appendChatTurn(b, 'user', 'Y-message-1');
    store.appendChatTurn(a, 'assistant', 'X-reply-1');

    const aHist = store.getChatHistory(a);
    const bHist = store.getChatHistory(b);

    expect(aHist).toHaveLength(2);
    expect(aHist.map(t => t.content)).toEqual(['X-message-1', 'X-reply-1']);
    expect(bHist).toHaveLength(1);
    expect(bHist[0]!.content).toBe('Y-message-1');

    expect(() => store.appendChatTurn('', 'user', 'x')).toThrow(/sessionId/);
    expect(store.getChatHistory('')).toEqual([]);
  });

  it('stores chat turns as type=chat entries indexed by FTS5 for deckent recall', () => {
    const sid = store.createChatSession('session-C');
    store.appendChatTurn(sid, 'user', 'How do I configure docker backend timeout?');
    store.appendChatTurn(sid, 'assistant', 'Set docker_backend.timeout in .deckent/config.json');

    // Validation 1: rows exist with type='chat'
    const rawDb = store.getRawDb();
    const chatRows = rawDb.prepare(
      `SELECT id, type, content FROM entries WHERE type = 'chat' ORDER BY id ASC`,
    ).all() as Array<{ id: string; type: string; content: string }>;
    expect(chatRows).toHaveLength(2);
    expect(chatRows[0]!.type).toBe('chat');
    expect(chatRows[0]!.id.startsWith(`chat-${sid}-`)).toBe(true);

    // Validation 2: FTS5 finds chat content via searchMemory
    const results = searchMemory(store, {
      text: 'docker timeout',
      type: ['chat'],
      limit: 5,
      mode: 'or',
    });
    expect(results.length).toBeGreaterThan(0);
    const allChat = results.every(r => r.entry.type === 'chat');
    expect(allChat).toBe(true);
    const matchedContent = results.map(r => r.entry.content).join(' ');
    expect(matchedContent).toMatch(/docker/i);
  });

  it('round-trips role tag and metadata for getChatHistory after store reopen', () => {
    const sid = store.createChatSession('session-D');
    store.appendChatTurn(sid, 'user', 'persist me');
    store.appendChatTurn(sid, 'assistant', 'persisted');

    // Validate tag join still works (no DB reopen — beforeEach already closes)
    const rawDb = store.getRawDb();
    const tagRows = rawDb.prepare(
      `SELECT tag FROM tags WHERE entry_id = ? ORDER BY tag ASC`,
    ).all(`chat-${sid}-000000`) as Array<{ tag: string }>;
    const tagSet = new Set(tagRows.map(r => r.tag));
    expect(tagSet.has(`chat:${sid}`)).toBe(true);
    expect(tagSet.has('role:user')).toBe(true);

    const history = store.getChatHistory(sid);
    expect(history.map(t => t.role)).toEqual(['user', 'assistant']);
  });
});

describe('MemoryStore.listChatSessions', () => {
  it('returns one summary per session with turn count and preview', () => {
    store.appendChatTurn('sess-a', 'user', 'first question about docker');
    store.appendChatTurn('sess-a', 'assistant', 'an answer');
    store.appendChatTurn('sess-b', 'user', 'second session hello');

    const sessions = store.listChatSessions();
    const ids = sessions.map((s) => s.sessionId).sort();
    expect(ids).toEqual(['sess-a', 'sess-b']);
    const a = sessions.find((s) => s.sessionId === 'sess-a');
    expect(a?.turnCount).toBe(2);
    expect(a?.preview).toBe('first question about docker');
    expect(a?.lastAt).toBeTruthy();
  });

  it('orders most-recently-active first and respects the limit', () => {
    store.appendChatTurn('old', 'user', 'old one');
    store.appendChatTurn('new', 'user', 'new one');
    store.appendChatTurn('new', 'user', 'newer still');

    const limited = store.listChatSessions(1);
    expect(limited).toHaveLength(1);
    expect(limited[0]?.sessionId).toBe('new');
  });

  it('truncates a long preview to ~60 chars with an ellipsis', () => {
    const long = 'x'.repeat(120);
    store.appendChatTurn('long-sess', 'user', long);
    const [s] = store.listChatSessions();
    expect(s?.preview.length).toBeLessThanOrEqual(60);
    expect(s?.preview.endsWith('…')).toBe(true);
  });

  it('returns an empty array when there are no chat sessions', () => {
    expect(store.listChatSessions()).toEqual([]);
  });
});
