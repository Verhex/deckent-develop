/**
 * REPL streaming tests (Sprint 222 Task 222-002).
 *
 * Verifies that `buildReplProvider().stream()`:
 *   1. Parses claude `--output-format stream-json --verbose` NDJSON lines
 *      and yields ONE delta per assistant event (not one batched chunk).
 *   2. Reconstructs a delta when one event line is split across multiple
 *      spawn chunks (buffered NDJSON parser).
 *   3. Falls back to raw chunk passthrough when stdout is plain text — the
 *      legacy `--print` batch path, preserved so the existing
 *      `streams chunks as they arrive` test in `native-repl-wire.test.ts`
 *      stays green.
 *   4. Handles an empty stream gracefully (no text yields, done still fires).
 *   5. Always emits a terminal `{ done }` chunk with stopReason 'end_turn'
 *      whose text matches the concatenation of all yielded deltas.
 *
 * Hermetic: spawn is fully injected; no real binary, no network. Mirrors the
 * mock pattern in `tests/cli/native-repl-wire.test.ts`.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Hoisted Spies (must precede dynamic import of entry.ts) ───────────

const hoisted = vi.hoisted(() => ({
  parseAsyncMock: vi.fn(async () => undefined),
  hookMock: vi.fn(),
  buildProgramMock: vi.fn(),
  bootstrapMock: vi.fn(async () => undefined),
  handleCliErrorMock: vi.fn(),
  interruptActiveSprintMock: vi.fn(),
  killAllSessionsMock: vi.fn(),
}));

hoisted.buildProgramMock.mockImplementation(() => {
  const fake = {
    hook: hoisted.hookMock,
    parseAsync: hoisted.parseAsyncMock,
  };
  hoisted.hookMock.mockReturnValue(fake);
  return fake;
});

vi.mock('../../src/cli/index.js', () => ({
  buildProgram: hoisted.buildProgramMock,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  handleCliError: hoisted.handleCliErrorMock,
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  interruptActiveSprint: hoisted.interruptActiveSprintMock,
}));

vi.mock('../../src/orchestra/tmux.js', () => ({
  killAllSessions: hoisted.killAllSessionsMock,
}));

vi.mock('../../src/core/model-catalog.js', () => ({
  bootstrapFromCatalog: hoisted.bootstrapMock,
}));

// ─── Types + dynamic import ────────────────────────────────────────────

type ReplProviderName = 'claude' | 'codex' | 'gemini' | 'ollama';

interface ChatMsg { role: string; content: string }
interface ProviderResp { text?: string; stopReason: string }
interface StreamChunk { text?: string; done?: ProviderResp }
interface ChatAdapter {
  send(messages: readonly ChatMsg[]): Promise<ProviderResp>;
  stream?(messages: readonly ChatMsg[]): AsyncIterable<StreamChunk>;
}

type SpawnFn = (
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
) => { chunks: AsyncIterable<string>; wait: Promise<{ exitCode: number | null }> };

let buildReplProvider: (
  name: ReplProviderName,
  opts?: { spawnFn?: SpawnFn; fetchFn?: typeof fetch },
) => ChatAdapter;
let extractClaudeStreamDelta: (line: string) => string | null | undefined;

beforeAll(async () => {
  const entryMod = await import('../../src/cli/entry.js');
  buildReplProvider = entryMod.buildReplProvider as typeof buildReplProvider;
  extractClaudeStreamDelta = entryMod.extractClaudeStreamDelta as typeof extractClaudeStreamDelta;
});

// ─── Helpers ───────────────────────────────────────────────────────────

function fakeSpawn(stdoutChunks: readonly string[]): SpawnFn {
  return (_binary, _args, _env) => ({
    chunks: (async function* () {
      for (const c of stdoutChunks) yield c;
    })(),
    wait: Promise.resolve({ exitCode: 0 }),
  });
}

function asAssistantEvent(text: string): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text }] },
  });
}

async function drainStream(adapter: ChatAdapter): Promise<{
  text: string[];
  chunks: StreamChunk[];
  done: ProviderResp | undefined;
}> {
  const text: string[] = [];
  const chunks: StreamChunk[] = [];
  let done: ProviderResp | undefined;
  for await (const chunk of adapter.stream!([{ role: 'user', content: 'q' }])) {
    chunks.push(chunk);
    if (typeof chunk.text === 'string') text.push(chunk.text);
    if (chunk.done) done = chunk.done;
  }
  return { text, chunks, done };
}

// ─── 1. Multi-chunk NDJSON — per-event deltas yielded incrementally ─────

describe('buildReplProvider.stream() — claude stream-json NDJSON', () => {
  it('yields one delta per assistant event and skips system/result events', async () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init' }) + '\n',
      asAssistantEvent('Hello') + '\n',
      asAssistantEvent(' world') + '\n',
      asAssistantEvent('!') + '\n',
      JSON.stringify({ type: 'result', subtype: 'success', result: 'Hello world!' }) + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual(['Hello', ' world', '!']);
    expect(done?.text).toBe('Hello world!');
    expect(done?.stopReason).toBe('end_turn');
  });

  it('reconstructs a delta when one NDJSON line is split across multiple chunks', async () => {
    const line = asAssistantEvent('streamed-out');
    const half = Math.floor(line.length / 2);
    const adapter = buildReplProvider('claude', {
      spawnFn: fakeSpawn([line.slice(0, half), line.slice(half), '\n']),
    });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual(['streamed-out']);
    expect(done?.text).toBe('streamed-out');
    expect(done?.stopReason).toBe('end_turn');
  });

  it('emits an unparseable NDJSON line as raw text rather than swallowing it', async () => {
    const adapter = buildReplProvider('claude', {
      spawnFn: fakeSpawn(['{not json}\n' + asAssistantEvent('after') + '\n']),
    });
    const { text, done } = await drainStream(adapter);
    expect(text).toContain('{not json}\n');
    expect(text).toContain('after');
    expect(done?.text).toBe('{not json}\nafter');
  });
});

// ─── 2. Raw single-chunk fallback — legacy --print batch mode ───────────

describe('buildReplProvider.stream() — single-chunk raw fallback', () => {
  it('non-JSON stdout streams chunks verbatim (legacy --print batch mode)', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(['plain batched response']) });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual(['plain batched response']);
    expect(done?.text).toBe('plain batched response');
    expect(done?.stopReason).toBe('end_turn');
  });

  it('multi-chunk raw stdout preserves chunk boundaries (no buffering in raw mode)', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(['foo', 'bar', 'baz']) });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual(['foo', 'bar', 'baz']);
    expect(done?.text).toBe('foobarbaz');
  });
});

// ─── 3. Empty stream — done event still fires ───────────────────────────

describe('buildReplProvider.stream() — empty stream', () => {
  it('emits no text but still yields a final done event with empty text', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn([]) });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual([]);
    expect(done).toBeDefined();
    expect(done?.text).toBe('');
    expect(done?.stopReason).toBe('end_turn');
  });

  it('treats empty-string chunks as no-ops (skipped, done still fires)', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(['', '', '']) });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual([]);
    expect(done?.text).toBe('');
    expect(done?.stopReason).toBe('end_turn');
  });
});

// ─── 4. done event invariant ────────────────────────────────────────────

describe('buildReplProvider.stream() — done event invariant', () => {
  it('emits exactly one done chunk and it is the terminal yield', async () => {
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(['a', 'b', 'c']) });
    const { chunks } = await drainStream(adapter);
    const doneIdxList = chunks.map((c, i) => (c.done ? i : -1)).filter((i) => i >= 0);
    expect(doneIdxList).toEqual([chunks.length - 1]);
    expect(chunks[chunks.length - 1]!.done!.stopReason).toBe('end_turn');
  });

  it('done.text equals the concatenation of all yielded text chunks', async () => {
    const lines = [
      asAssistantEvent('alpha') + '\n',
      asAssistantEvent('-beta') + '\n',
      asAssistantEvent('-gamma') + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text, done } = await drainStream(adapter);
    expect(done?.text).toBe(text.join(''));
    expect(done?.text).toBe('alpha-beta-gamma');
  });
});

// ─── 5. extractClaudeStreamDelta unit ───────────────────────────────────

describe('extractClaudeStreamDelta — NDJSON event parser unit', () => {
  it('returns the text delta from an assistant event', () => {
    expect(extractClaudeStreamDelta(asAssistantEvent('hi'))).toBe('hi');
  });

  it('concatenates multiple text parts inside one assistant content array', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'text', text: 'foo' },
        { type: 'tool_use', name: 'noop', input: {} },
        { type: 'text', text: 'bar' },
      ] },
    });
    expect(extractClaudeStreamDelta(line)).toBe('foobar');
  });

  it('returns null for non-text event types (system / result)', () => {
    expect(extractClaudeStreamDelta(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeNull();
    expect(extractClaudeStreamDelta(JSON.stringify({ type: 'result', result: 'x' }))).toBeNull();
  });

  it('returns undefined for non-JSON lines (caller falls back to raw passthrough)', () => {
    expect(extractClaudeStreamDelta('')).toBeUndefined();
    expect(extractClaudeStreamDelta('plain text')).toBeUndefined();
    expect(extractClaudeStreamDelta('{malformed')).toBeUndefined();
  });

  it('returns "" for assistant events that have no text parts (tool_use only) — caller skips empty deltas', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'x', input: {} }] },
    });
    expect(extractClaudeStreamDelta(line)).toBe('');
  });
});
