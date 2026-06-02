import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';

import {
  createPersistentClaudeSession,
  parseStreamJsonLine,
  parseDeckentToolCalls,
  DECKENT_AGENTIC_SYSTEM_PROMPT,
  defaultPersistentSpawn,
  buildSubscriptionEnv,
  DEFAULT_PERSISTENT_ARGS,
  type PersistentClaudeHandle,
  type PersistentSpawnFn,
} from '../../src/cli/commands/chat-session.js';

// ─── Mock spawn helper ───────────────────────────────────────────────
//
// The mock implements just enough of PersistentClaudeHandle to drive the
// session module from a test: a Writable that captures every stdin write,
// an async-iterable stdout that the test can feed lines into one by one,
// and a kill() that closes both. Tests stay hermetic — no real claude
// binary is touched.

interface MockSpawnControl {
  handle: PersistentClaudeHandle;
  writes: string[];
  readonly killCount: number;
  pushLine(line: string): void;
  closeStream(): void;
}

function makeMockSpawn(): MockSpawnControl {
  const writes: string[] = [];
  let killCountInternal = 0;
  let waitResolver!: (v: { exitCode: number | null }) => void;
  const wait = new Promise<{ exitCode: number | null }>((r) => {
    waitResolver = r;
  });

  let closed = false;
  const lineQueue: string[] = [];
  let pendingResolver: ((line: string | null) => void) | null = null;

  function pushLine(line: string): void {
    if (pendingResolver) {
      const r = pendingResolver;
      pendingResolver = null;
      r(line);
    } else {
      lineQueue.push(line);
    }
  }

  function closeStream(): void {
    if (closed) return;
    closed = true;
    if (pendingResolver) {
      const r = pendingResolver;
      pendingResolver = null;
      r(null);
    }
    waitResolver({ exitCode: 0 });
  }

  const stdin = new Writable({
    write(chunk, _enc, cb) {
      writes.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk));
      cb();
    },
    final(cb) {
      cb();
    },
  });

  const stdoutLines: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next(): Promise<IteratorResult<string>> {
        if (lineQueue.length > 0) {
          return Promise.resolve({ value: lineQueue.shift() as string, done: false });
        }
        if (closed) {
          return Promise.resolve({ value: undefined as unknown as string, done: true });
        }
        return new Promise<IteratorResult<string>>((resolve) => {
          pendingResolver = (line) => {
            if (line === null) {
              resolve({ value: undefined as unknown as string, done: true });
            } else {
              resolve({ value: line, done: false });
            }
          };
        });
      },
    }),
  };

  const handle: PersistentClaudeHandle = {
    stdin,
    stdoutLines,
    wait,
    kill() {
      killCountInternal++;
      closeStream();
    },
  };

  return {
    handle,
    writes,
    get killCount() {
      return killCountInternal;
    },
    pushLine,
    closeStream,
  };
}

// ─── parseStreamJsonLine ─────────────────────────────────────────────

describe('parseStreamJsonLine', () => {
  it('extracts incremental text from content_block_delta events', () => {
    const r = parseStreamJsonLine(
      JSON.stringify({ type: 'content_block_delta', delta: { text: 'hello' } }),
    );
    expect(r.text).toBe('hello');
    expect(r.done).toBe(false);
  });

  it('marks done on result events and surfaces resultText as fallback', () => {
    const r = parseStreamJsonLine(JSON.stringify({ type: 'result', result: 'final answer' }));
    expect(r.done).toBe(true);
    expect(r.resultText).toBe('final answer');
    expect(r.text).toBe('');
  });

  it('returns empty text for unknown / malformed events without throwing', () => {
    expect(parseStreamJsonLine('not json').text).toBe('');
    expect(parseStreamJsonLine('').text).toBe('');
    expect(parseStreamJsonLine(JSON.stringify({ type: 'system', subtype: 'init' })).text).toBe('');
    expect(parseStreamJsonLine(JSON.stringify({ type: 'content_block_delta' })).text).toBe('');
  });

  // Sprint 224 T-224-011 — claude `--include-partial-messages` wraps deltas in a
  // `stream_event` envelope. Without unwrapping, NO incremental token is matched
  // and the reply only arrives via the final `result` (dumped at once = chunky/slow).
  it('unwraps stream_event envelope to extract incremental token deltas', () => {
    const r = parseStreamJsonLine(
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'mer' } },
      }),
    );
    expect(r.text).toBe('mer');
    expect(r.done).toBe(false);
  });

  it('ignores non-delta stream_event envelopes (message_start, etc.)', () => {
    expect(
      parseStreamJsonLine(
        JSON.stringify({ type: 'stream_event', event: { type: 'message_start', message: {} } }),
      ).text,
    ).toBe('');
  });
});

// ─── createPersistentClaudeSession — single spawn across turns ──────

describe('createPersistentClaudeSession — single spawn across turns', () => {
  it('spawns exactly once for multiple sends (reuse the same child)', async () => {
    const mock = makeMockSpawn();
    const spawnFn = vi.fn(
      (_b: string, _a: readonly string[], _e: NodeJS.ProcessEnv) => mock.handle,
    ) as unknown as PersistentSpawnFn & ReturnType<typeof vi.fn>;
    const session = createPersistentClaudeSession({ spawnFn });

    expect(session.spawnCount).toBe(0);
    expect(session.isAlive()).toBe(false);

    // Turn 1 — cold start
    const send1 = session.send([{ role: 'user', content: 'merhaba' }]);
    mock.pushLine(JSON.stringify({ type: 'result', result: 'selam!' }));
    const r1 = await send1;

    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(session.spawnCount).toBe(1);
    expect(session.reuseCount).toBe(0);
    expect(r1.text).toBe('selam!');
    expect(session.isAlive()).toBe(true);

    // Turn 2 — MUST reuse the same child, NOT respawn
    const send2 = session.send([{ role: 'user', content: 'naber' }]);
    mock.pushLine(JSON.stringify({ type: 'result', result: 'iyiyim' }));
    const r2 = await send2;

    expect(spawnFn).toHaveBeenCalledTimes(1); // STILL 1 — this is the perf win
    expect(session.spawnCount).toBe(1);
    expect(session.reuseCount).toBe(1);
    expect(r2.text).toBe('iyiyim');
  });

  it('writes valid stream-json user lines for each turn to the SAME stdin', async () => {
    const mock = makeMockSpawn();
    const session = createPersistentClaudeSession({ spawnFn: () => mock.handle });

    const send1 = session.send([{ role: 'user', content: 'one' }]);
    mock.pushLine(JSON.stringify({ type: 'result', result: 'a' }));
    await send1;

    const send2 = session.send([{ role: 'user', content: 'two' }]);
    mock.pushLine(JSON.stringify({ type: 'result', result: 'b' }));
    await send2;

    expect(mock.writes.length).toBe(2);
    for (const w of mock.writes) {
      expect(w.endsWith('\n')).toBe(true);
      const obj = JSON.parse(w);
      expect(obj.type).toBe('user');
      expect(obj.message.role).toBe('user');
      expect(Array.isArray(obj.message.content)).toBe(true);
    }
    expect(JSON.parse(mock.writes[0]!).message.content[0].text).toBe('one');
    expect(JSON.parse(mock.writes[1]!).message.content[0].text).toBe('two');
  });
});

// ─── Lifecycle — :exit kill ──────────────────────────────────────────

describe('createPersistentClaudeSession — lifecycle', () => {
  it('exit() kills the persistent child and marks the session not alive (idempotent)', async () => {
    const mock = makeMockSpawn();
    const session = createPersistentClaudeSession({ spawnFn: () => mock.handle });

    // Force a spawn via an initial send.
    const send = session.send([{ role: 'user', content: 'x' }]);
    mock.pushLine(JSON.stringify({ type: 'result', result: 'ok' }));
    await send;
    expect(session.isAlive()).toBe(true);

    await session.exit();
    expect(session.isAlive()).toBe(false);
    expect(mock.killCount).toBeGreaterThanOrEqual(1);

    // exit() should be safe to call twice — no respawn, no throw.
    await session.exit();
    expect(session.isAlive()).toBe(false);
  });

  it('exit() before any send is a no-op (lazy spawn)', async () => {
    const mock = makeMockSpawn();
    const spawnFn = vi.fn(
      (_b: string, _a: readonly string[], _e: NodeJS.ProcessEnv) => mock.handle,
    ) as unknown as PersistentSpawnFn & ReturnType<typeof vi.fn>;
    const session = createPersistentClaudeSession({ spawnFn });
    await session.exit();
    expect(spawnFn).not.toHaveBeenCalled();
    expect(session.isAlive()).toBe(false);
  });
});

// ─── stream() round-trip ─────────────────────────────────────────────

describe('createPersistentClaudeSession — stream() round-trip', () => {
  it('yields incremental delta chunks then a final done chunk', async () => {
    const mock = makeMockSpawn();
    const session = createPersistentClaudeSession({ spawnFn: () => mock.handle });

    const chunks: Array<{ text?: string; done?: { text: string } }> = [];
    const consume = (async () => {
      // stream() is optional on ChatProviderAdapter — guarded ! since we provide it.
      for await (const c of session.stream!([{ role: 'user', content: 'q' }])) {
        chunks.push({ text: c.text, done: c.done ? { text: c.done.text } : undefined });
      }
    })();

    mock.pushLine(JSON.stringify({ type: 'content_block_delta', delta: { text: 'foo' } }));
    mock.pushLine(JSON.stringify({ type: 'content_block_delta', delta: { text: 'bar' } }));
    mock.pushLine(JSON.stringify({ type: 'result', result: 'foobar' }));

    await consume;

    const texts = chunks.filter((c) => c.text).map((c) => c.text);
    expect(texts).toEqual(['foo', 'bar']);
    const doneChunk = chunks.find((c) => c.done);
    expect(doneChunk).toBeDefined();
    expect(doneChunk?.done?.text).toBe('foobar');
  });

  it('falls back to resultText when no deltas arrived (single end_turn line)', async () => {
    const mock = makeMockSpawn();
    const session = createPersistentClaudeSession({ spawnFn: () => mock.handle });

    const collect = (async () => {
      const out: string[] = [];
      let done: string | undefined;
      for await (const c of session.stream!([{ role: 'user', content: 'q' }])) {
        if (c.text) out.push(c.text);
        if (c.done) done = c.done.text;
      }
      return { out, done };
    })();

    mock.pushLine(JSON.stringify({ type: 'result', result: 'just the answer' }));
    const { out, done } = await collect;
    expect(out).toEqual(['just the answer']);
    expect(done).toBe('just the answer');
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────

describe('chat-session — helpers', () => {
  it('buildSubscriptionEnv strips API-key vars but keeps the rest', () => {
    const env = buildSubscriptionEnv({
      ANTHROPIC_API_KEY: 'sk-x',
      DECKENT_CLAUDE_API_KEY: 'sk-y',
      OTHER: 'keep',
    });
    expect(env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(env['DECKENT_CLAUDE_API_KEY']).toBeUndefined();
    expect(env['OTHER']).toBe('keep');
  });

  it('DEFAULT_PERSISTENT_ARGS opts the CLI into persistent stream-json mode', () => {
    expect(DEFAULT_PERSISTENT_ARGS).toContain('--print');
    expect(DEFAULT_PERSISTENT_ARGS).toContain('--input-format');
    expect(DEFAULT_PERSISTENT_ARGS).toContain('--output-format');
    expect(DEFAULT_PERSISTENT_ARGS).toContain('stream-json');
    expect(DEFAULT_PERSISTENT_ARGS).toContain('--include-partial-messages');
  });

  it('defaultPersistentSpawn returns the expected handle shape (structural smoke)', () => {
    // Use `true` (POSIX) — exits immediately. We only assert on the handle shape,
    // not stdout content. Matches the pattern in tests/cli/chat-native-provider.test.ts.
    const h = defaultPersistentSpawn('true', [], { ...process.env });
    expect(h.stdin).toBeDefined();
    expect(typeof h.stdoutLines[Symbol.asyncIterator]).toBe('function');
    expect(h.wait).toBeInstanceOf(Promise);
    expect(typeof h.kill).toBe('function');
    h.kill();
  });
});

// ─── Agentic tool-use brain (Sprint 224 T-224-005/006) ──────────────

describe('parseDeckentToolCalls', () => {
  it('parses a single <deckent_tool> directive into a ToolCall', () => {
    const calls = parseDeckentToolCalls(
      '<deckent_tool>{"name":"deckent_write_file","args":{"path":"a.md","content":"hi"}}</deckent_tool>',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('deckent_write_file');
    expect(calls[0]?.args).toEqual({ path: 'a.md', content: 'hi' });
    expect(calls[0]?.id).toBe('tool-0');
  });

  it('parses multiple directives with positional ids', () => {
    const calls = parseDeckentToolCalls(
      '<deckent_tool>{"name":"deckent_read_file","args":{"path":"a"}}</deckent_tool> ' +
        '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"ls"}}</deckent_tool>',
    );
    expect(calls.map((c) => c.name)).toEqual(['deckent_read_file', 'deckent_bash']);
    expect(calls.map((c) => c.id)).toEqual(['tool-0', 'tool-1']);
  });

  it('skips malformed JSON tags and returns [] for plain prose', () => {
    expect(parseDeckentToolCalls('<deckent_tool>not json</deckent_tool>')).toEqual([]);
    expect(parseDeckentToolCalls('sadece normal bir cevap')).toEqual([]);
    expect(parseDeckentToolCalls('')).toEqual([]);
  });
});

describe('createPersistentClaudeSession — agentic tool_use', () => {
  it('surfaces <deckent_tool> reply as stopReason:tool_use + toolCalls', async () => {
    const mock = makeMockSpawn();
    const spawnFn = vi.fn(() => mock.handle) as unknown as PersistentSpawnFn;
    const session = createPersistentClaudeSession({ spawnFn });

    const chunks: Array<{ text?: string; done?: { stopReason: string; toolCalls?: unknown[] } }> = [];
    const drain = (async () => {
      for await (const c of session.stream([{ role: 'user', content: 'a.md yaz' }])) chunks.push(c);
    })();
    mock.pushLine(
      JSON.stringify({
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { text: '<deckent_tool>{"name":"deckent_write_file","args":{"path":"a.md","content":"x"}}</deckent_tool>' } },
      }),
    );
    mock.pushLine(JSON.stringify({ type: 'result', result: '' }));
    mock.closeStream();
    await drain;

    const done = chunks.find((c) => c.done)?.done;
    expect(done?.stopReason).toBe('tool_use');
    expect(done?.toolCalls?.[0]).toMatchObject({ name: 'deckent_write_file' });
  });

  it('feeds a tool result back as a user turn (so the model replies, not re-loops)', async () => {
    const mock = makeMockSpawn();
    const spawnFn = vi.fn(() => mock.handle) as unknown as PersistentSpawnFn;
    const session = createPersistentClaudeSession({ spawnFn });

    const drain = (async () => {
      for await (const _c of session.stream([
        { role: 'user', content: 'a.md yaz' },
        { role: 'tool', content: '[deckent] yazıldı: a.md', toolUseId: 'tool-0' },
      ])) { /* consume */ }
    })();
    mock.pushLine(JSON.stringify({ type: 'result', result: 'Tamam, a.md oluşturuldu.' }));
    mock.closeStream();
    await drain;

    // The stdin write for this turn must carry the tool result (not the original prompt).
    expect(mock.writes.join('')).toContain('deckent tool sonucu');
  });

  it('passes the agentic system prompt via --append-system-prompt when set', () => {
    const mock = makeMockSpawn();
    const spawnFn = vi.fn(() => mock.handle) as unknown as PersistentSpawnFn & ReturnType<typeof vi.fn>;
    const session = createPersistentClaudeSession({ spawnFn, systemPrompt: DECKENT_AGENTIC_SYSTEM_PROMPT });
    // Trigger lazy spawn.
    void session.stream([{ role: 'user', content: 'selam' }]).next();
    const args = (spawnFn.mock.calls[0]?.[1] ?? []) as string[];
    expect(args).toContain('--append-system-prompt');
    expect(args).toContain(DECKENT_AGENTIC_SYSTEM_PROMPT);
  });
});
