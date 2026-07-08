/**
 * Sprint 388 Task 388-007 (born-547, ENTRY-NDJSON-FALLBACK).
 *
 * The claude `--output-format stream-json` protocol has no distinct top-level
 * `error` event: a failed turn (overloaded / rate-limited / max-turns / API
 * error) is reported as a `result` event — the SAME top-level `type` as a
 * successful one — carrying `is_error: true`. Before this fix,
 * `extractClaudeStreamDelta` treated every non-`assistant` type uniformly
 * (`null` → caller skips silently), so a FAILED turn's `result` event vanished
 * exactly like a successful one's: no fallback branch distinguished "harmless
 * system/result chatter" from "the CLI just reported this turn failed".
 *
 * This suite verifies:
 *   1. A `result` event with `is_error: true` is now surfaced as an explicit
 *      error notice instead of being silently dropped/crashing.
 *   2. Every existing non-assistant code path (successful `result`, `system`,
 *      malformed JSON, assistant deltas) is BYTE-IDENTICAL to before — the
 *      new branch is additive only, `extractClaudeStreamDelta` itself and the
 *      assistant-delta path are untouched (nogo: "assistant-yolunu değiştirme").
 *
 * Hermetic: spawn is fully injected; no real binary, no network. Mirrors the
 * mock pattern in `tests/cli/repl-streaming.test.ts` / `native-repl-wire.test.ts`.
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
let extractClaudeStreamErrorText: (line: string) => string | undefined;

beforeAll(async () => {
  const entryMod = await import('../../src/cli/entry.js');
  buildReplProvider = entryMod.buildReplProvider as typeof buildReplProvider;
  extractClaudeStreamDelta = entryMod.extractClaudeStreamDelta as typeof extractClaudeStreamDelta;
  extractClaudeStreamErrorText = entryMod.extractClaudeStreamErrorText as typeof extractClaudeStreamErrorText;
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

// ─── 1. Failed result event (is_error: true) is surfaced, not dropped ───

describe('buildReplProvider.stream() — non-assistant NDJSON fallback (born-547)', () => {
  it('surfaces a failed result event (is_error: true) instead of silently dropping it', async () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init' }) + '\n',
      asAssistantEvent('partial reply') + '\n',
      JSON.stringify({
        type: 'result',
        subtype: 'error_during_execution',
        is_error: true,
        result: 'overloaded_error: the API is temporarily overloaded',
      }) + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text, done } = await drainStream(adapter);
    expect(text).toContain('partial reply');
    const errorLine = text.find((t) => t.includes('[claude stream-json error]'));
    expect(errorLine).toBeDefined();
    expect(errorLine).toContain('overloaded_error: the API is temporarily overloaded');
    expect(done?.text).toContain('overloaded_error');
  });

  it('falls back to subtype when the failed result has no result text', async () => {
    const lines = [
      JSON.stringify({ type: 'result', subtype: 'error_max_turns', is_error: true }) + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text } = await drainStream(adapter);
    const errorLine = text.find((t) => t.includes('[claude stream-json error]'));
    expect(errorLine).toContain('error_max_turns');
  });

  it('never crashes/throws on a failed result event mid-stream', async () => {
    const lines = [
      asAssistantEvent('before') + '\n',
      JSON.stringify({ type: 'result', is_error: true }) + '\n',
      asAssistantEvent('after') + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    await expect(drainStream(adapter)).resolves.not.toThrow();
    const { text } = await drainStream(adapter);
    expect(text).toContain('before');
    expect(text).toContain('after');
  });

  // ─── Regression guards: every pre-existing non-assistant path is unchanged ──

  it('regression: a successful result event is still silently skipped (unchanged)', async () => {
    const lines = [
      asAssistantEvent('Hello') + '\n',
      JSON.stringify({ type: 'result', subtype: 'success', result: 'Hello' }) + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual(['Hello']);
    expect(done?.text).toBe('Hello');
  });

  it('regression: a result event with is_error: false is treated as successful (unchanged)', async () => {
    const lines = [
      asAssistantEvent('Hi') + '\n',
      JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'Hi' }) + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text } = await drainStream(adapter);
    expect(text).toEqual(['Hi']);
    expect(text.some((t) => t.includes('[claude stream-json error]'))).toBe(false);
  });

  it('regression: system events are still silently skipped (unchanged)', async () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init' }) + '\n',
      asAssistantEvent('reply') + '\n',
    ];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text } = await drainStream(adapter);
    expect(text).toEqual(['reply']);
  });

  it('regression: malformed JSON lines still fall back to raw passthrough (unchanged)', async () => {
    const adapter = buildReplProvider('claude', {
      spawnFn: fakeSpawn(['{not json}\n' + asAssistantEvent('after') + '\n']),
    });
    const { text, done } = await drainStream(adapter);
    expect(text).toContain('{not json}\n');
    expect(text).toContain('after');
    expect(done?.text).toBe('{not json}\nafter');
  });

  it('regression: assistant deltas are yielded exactly as before, unaffected by the new branch', async () => {
    const lines = [asAssistantEvent('foo') + '\n', asAssistantEvent('bar') + '\n'];
    const adapter = buildReplProvider('claude', { spawnFn: fakeSpawn(lines) });
    const { text, done } = await drainStream(adapter);
    expect(text).toEqual(['foo', 'bar']);
    expect(done?.text).toBe('foobar');
  });

  it('surfaces a failed result event even when split across chunks with no trailing newline', async () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: 'boom' });
    const half = Math.floor(line.length / 2);
    const adapter = buildReplProvider('claude', {
      spawnFn: fakeSpawn([line.slice(0, half), line.slice(half)]),
    });
    const { text } = await drainStream(adapter);
    const errorLine = text.find((t) => t.includes('[claude stream-json error]'));
    expect(errorLine).toContain('boom');
  });
});

// ─── 2. extractClaudeStreamErrorText unit ───────────────────────────────

describe('extractClaudeStreamErrorText — non-assistant NDJSON error parser unit', () => {
  it('extracts the result text from a failed result event', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: 'rate_limit_error' });
    expect(extractClaudeStreamErrorText(line)).toBe('rate_limit_error');
  });

  it('falls back to subtype when result text is absent', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, subtype: 'error_max_turns' });
    expect(extractClaudeStreamErrorText(line)).toBe('error_max_turns');
  });

  it('falls back to a generic message when neither result nor subtype is present', () => {
    const line = JSON.stringify({ type: 'result', is_error: true });
    expect(extractClaudeStreamErrorText(line)).toBe('claude stream-json result: is_error=true');
  });

  it('returns undefined for a successful result event', () => {
    expect(extractClaudeStreamErrorText(JSON.stringify({ type: 'result', subtype: 'success', result: 'x' })))
      .toBeUndefined();
  });

  it('returns undefined for a result event with is_error: false', () => {
    expect(extractClaudeStreamErrorText(JSON.stringify({ type: 'result', is_error: false })))
      .toBeUndefined();
  });

  it('returns undefined for a result event missing the is_error field entirely', () => {
    expect(extractClaudeStreamErrorText(JSON.stringify({ type: 'result' }))).toBeUndefined();
  });

  it('returns undefined for non-result event types (system / assistant)', () => {
    expect(extractClaudeStreamErrorText(JSON.stringify({ type: 'system', subtype: 'init' }))).toBeUndefined();
    expect(extractClaudeStreamErrorText(asAssistantEvent('hi'))).toBeUndefined();
  });

  it('returns undefined for non-JSON / empty / malformed lines (never throws)', () => {
    expect(extractClaudeStreamErrorText('')).toBeUndefined();
    expect(extractClaudeStreamErrorText('plain text')).toBeUndefined();
    expect(extractClaudeStreamErrorText('{malformed')).toBeUndefined();
    expect(extractClaudeStreamErrorText('null')).toBeUndefined();
    expect(extractClaudeStreamErrorText('42')).toBeUndefined();
  });

  it('does not affect extractClaudeStreamDelta — both parsers agree the line is non-assistant', () => {
    const line = JSON.stringify({ type: 'result', is_error: true, result: 'x' });
    expect(extractClaudeStreamErrorText(line)).toBe('x');
    expect(extractClaudeStreamDelta(line)).toBeNull();
  });
});
