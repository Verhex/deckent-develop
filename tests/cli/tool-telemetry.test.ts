// ═══ Sprint 285 T-285-005 — parsed-vs-executed telemetry counter ═══════════
//
// Verifies that `parseDeckentToolCallsFull` tracks malformed tags and that
// `runTurn` surfaces a visible i18n warning when malformed > 0 (the previously
// silent-skip now emits a user-facing message).
//
// Hermetic (ADR-087): mock spawn only — no real `claude` binary, no spawnSync.

import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';

import {
  createPersistentClaudeSession,
  parseDeckentToolCallsFull,
  type PersistentClaudeHandle,
  type PersistentSpawnFn,
} from '../../src/cli/commands/chat-session.js';
import type { ChatMessage } from '../../src/cli/commands/chat-native.js';

// ─── Mock handle (pending-resolver model — ADR-087 hermetic) ────────────────

interface MockControl {
  handle: PersistentClaudeHandle;
  pushLine(line: string): void;
  closeStream(): void;
}

function makeMock(): MockControl {
  let waitResolver!: (v: { exitCode: number | null }) => void;
  const wait = new Promise<{ exitCode: number | null }>((r) => { waitResolver = r; });
  let closed = false;
  const queue: string[] = [];
  let pending: ((l: string | null) => void) | null = null;

  function pushLine(line: string): void {
    if (pending) { const r = pending; pending = null; r(line); }
    else queue.push(line);
  }
  function closeStream(): void {
    if (closed) return;
    closed = true;
    if (pending) { const r = pending; pending = null; r(null); }
    waitResolver({ exitCode: 0 });
  }

  const stdin = new Writable({
    write(_chunk, _enc, cb) { cb(); },
    final(cb) { cb(); },
  });
  const stdoutLines: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next(): Promise<IteratorResult<string>> {
        if (queue.length > 0) return Promise.resolve({ value: queue.shift() as string, done: false });
        if (closed) return Promise.resolve({ value: undefined as unknown as string, done: true });
        return new Promise<IteratorResult<string>>((resolve) => {
          pending = (l) => l === null
            ? resolve({ value: undefined as unknown as string, done: true })
            : resolve({ value: l, done: false });
        });
      },
    }),
  };
  const handle: PersistentClaudeHandle = { stdin, stdoutLines, wait, kill() { closeStream(); } };
  return { handle, pushLine, closeStream };
}

/** Drain session.stream() and return all text chunks concatenated. */
async function streamText(resultText: string, messages?: ChatMessage[]): Promise<string> {
  const mock = makeMock();
  const spawnFn = vi.fn(() => mock.handle) as unknown as PersistentSpawnFn;
  const session = createPersistentClaudeSession({ spawnFn });

  // Pre-queue the mock response before starting the stream.
  // runTurn writes to stdin (captured) then calls it.next() → finds line in queue.
  mock.pushLine(JSON.stringify({ type: 'result', result: resultText }));

  const msgs = messages ?? [{ role: 'user' as const, content: 'test' }];
  const collected: string[] = [];
  for await (const chunk of session.stream(msgs)) {
    if (chunk.text) collected.push(chunk.text);
  }
  return collected.join('');
}

// ─── parseDeckentToolCallsFull unit tests ─────────────────────────────────

describe('parseDeckentToolCallsFull — telemetry counters', () => {
  it('valid tags: tagCount = calls.length, malformedCount = 0', () => {
    const text =
      '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"echo hi"}}</deckent_tool>' +
      '<deckent_tool>{"name":"deckent_write_file","args":{"path":"/tmp/x","content":"y"}}</deckent_tool>';
    const { calls, tagCount, malformedCount } = parseDeckentToolCallsFull(text);
    expect(calls).toHaveLength(2);
    expect(tagCount).toBe(2);
    expect(malformedCount).toBe(0);
  });

  it('malformed JSON body: malformedCount = 1, tagCount = 2', () => {
    const text =
      '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"echo ok"}}</deckent_tool>' +
      '<deckent_tool>NOT VALID JSON</deckent_tool>';
    const { calls, tagCount, malformedCount } = parseDeckentToolCallsFull(text);
    expect(calls).toHaveLength(1);
    expect(malformedCount).toBe(1);
    expect(tagCount).toBe(2);
  });

  it('missing name field: malformedCount incremented', () => {
    const text = '<deckent_tool>{"args":{"cmd":"echo"}}</deckent_tool>';
    const { calls, malformedCount } = parseDeckentToolCallsFull(text);
    expect(calls).toHaveLength(0);
    expect(malformedCount).toBe(1);
  });

  it('empty body: malformedCount incremented', () => {
    const text = '<deckent_tool>   </deckent_tool>';
    const { malformedCount } = parseDeckentToolCallsFull(text);
    expect(malformedCount).toBe(1);
  });
});

// ─── runTurn warning emission tests ─────────────────────────────────────────

describe('runTurn — telemetry warning emission', () => {
  it('counter-silent: no warning when all tags are valid', async () => {
    const response =
      '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"echo hi"}}</deckent_tool>';
    const text = await streamText(response);
    expect(text).not.toContain('[deckent] warning');
    expect(text).not.toContain('[deckent] uyarı');
    expect(text).not.toContain('malformed');
  });

  it('mismatch-warning: 1 valid + 1 malformed → warning with correct counts', async () => {
    const response =
      '<deckent_tool>{"name":"deckent_bash","args":{"cmd":"echo ok"}}</deckent_tool>' +
      '<deckent_tool>NOT VALID JSON</deckent_tool>';
    const text = await streamText(response);
    // Warning must appear (EN or TR key)
    expect(text).toMatch(/\[deckent\] (warning|uyarı)/);
    // found = 2 (1 valid + 1 malformed)
    expect(text).toContain('2');
    // executed = 1
    expect(text).toContain('1');
  });

  it('malformed-warning: all tags malformed → warning, 0 executed', async () => {
    const response = '<deckent_tool>INVALID BODY</deckent_tool>';
    const text = await streamText(response);
    expect(text).toMatch(/\[deckent\] (warning|uyarı)/);
    // malformed = 1, executed = 0
    expect(text).toMatch(/0 (executed|yürütüldü)/);
  });

  it('no warning with plain text reply (no tags)', async () => {
    const response = 'This is a normal reply without any tool calls.';
    const text = await streamText(response);
    expect(text).not.toContain('[deckent] warning');
    expect(text).not.toContain('[deckent] uyarı');
  });
});
