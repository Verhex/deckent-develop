// ═══ Sprint 383 T-383-008 — born-511 CHAT-SESSION-RECONCILE-SWAP ═══════════
//
// End-of-turn reconciliation in `runTurn` (chat-session.ts) used to detect a
// `resultText`/`assistantText` longer than the streamed `collected` text and
// silently swap `collected` to the longer source WITHOUT streaming the extra
// content. Downstream (chat-native.ts, out of this task's write scope) that
// swapped `collected` becomes the persisted transcript/session-memory entry,
// but the screen only ever showed the original (shorter) streamed text — so
// what got saved silently diverged from what the user watched.
//
// These tests assert the fix's core invariant: everything that ends up in the
// final `done.text` was ALSO yielded as a visible `text` chunk somewhere along
// the way (sum of all `text` chunks === `done.text`) — i.e. the screen and the
// persisted final text can never silently diverge again.
//
// Hermetic (ADR-087): mock spawn only — no real `claude` binary, no spawnSync.

import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';

import {
  createPersistentClaudeSession,
  type PersistentClaudeHandle,
} from '../../src/cli/commands/chat-session.js';
import type { ChatMessage, StreamChunk } from '../../src/cli/commands/chat-native.js';

// ─── Mock spawn (pending-resolver model, mirrors chat-session-stream-collect.test.ts) ──

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
    write(chunk, _enc, cb) { cb(); },
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

const delta = (text: string): string =>
  JSON.stringify({ type: 'content_block_delta', delta: { text } });

const assistantEvent = (text: string): string =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });

const resultEvent = (text: string): string =>
  JSON.stringify({ type: 'result', result: text });

/** Drive one turn to completion, collecting every chunk in order. */
async function driveTurn(lines: string[]): Promise<StreamChunk[]> {
  const mock = makeMock();
  const session = createPersistentClaudeSession({ spawnFn: () => mock.handle });
  const messages: ChatMessage[] = [{ role: 'user', content: 'q' }];
  const chunks: StreamChunk[] = [];
  const drain = (async () => {
    for await (const c of session.stream!(messages)) chunks.push(c);
  })();
  for (const l of lines) mock.pushLine(l);
  mock.closeStream();
  await drain;
  return chunks;
}

describe('chat-session reconciliation — streamed/final consistency (born-511)', () => {
  it('resultText longer than streamed deltas → missing suffix is streamed, screen matches final', async () => {
    const chunks = await driveTurn([
      delta('Merhaba'),
      resultEvent('Merhaba dünya!'), // longer, extends the streamed prefix
    ]);
    const streamedTexts = chunks.filter((c) => c.text).map((c) => c.text as string);
    const doneChunk = chunks.find((c) => c.done);
    expect(doneChunk?.done?.text).toBe('Merhaba dünya!');
    // Invariant: concatenation of everything shown on screen === the persisted final text.
    expect(streamedTexts.join('')).toBe(doneChunk?.done?.text);
    // The extra content must actually have been yielded as a visible chunk, not
    // just silently folded into `done.text`.
    expect(streamedTexts).toEqual(['Merhaba', ' dünya!']);
  });

  it('assistantText longer than streamed deltas → missing suffix is streamed, screen matches final', async () => {
    const chunks = await driveTurn([
      delta('Selam'),
      assistantEvent('Selam, nasılsın?'),
      resultEvent(''), // result carries no text this turn; assistantText is authoritative
    ]);
    const streamedTexts = chunks.filter((c) => c.text).map((c) => c.text as string);
    const doneChunk = chunks.find((c) => c.done);
    expect(doneChunk?.done?.text).toBe('Selam, nasılsın?');
    expect(streamedTexts.join('')).toBe(doneChunk?.done?.text);
    expect(streamedTexts).toEqual(['Selam', ', nasılsın?']);
  });

  it('longer candidate that does NOT extend the streamed text is discarded, not silently swapped', async () => {
    const chunks = await driveTurn([
      delta('Tamamdır, yapıyorum.'),
      // Diverges from the delta text (not a suffix-extension) despite being longer —
      // must be treated as untrustworthy, not silently swapped in as the final text.
      resultEvent('Bambaşka ve daha uzun bir cevap metni burada.'),
    ]);
    const streamedTexts = chunks.filter((c) => c.text).map((c) => c.text as string);
    const doneChunk = chunks.find((c) => c.done);
    // Trust what was already shown — never silently replace it with unseen content.
    expect(doneChunk?.done?.text).toBe('Tamamdır, yapıyorum.');
    expect(streamedTexts.join('')).toBe(doneChunk?.done?.text);
    expect(streamedTexts).toEqual(['Tamamdır, yapıyorum.']);
  });

  it('normal turn: delta sum already equals final text → no extra chunk, behavior unchanged', async () => {
    const chunks = await driveTurn([
      delta('İyi '),
      delta('günler!'),
      resultEvent('İyi günler!'),
    ]);
    const streamedTexts = chunks.filter((c) => c.text).map((c) => c.text as string);
    const doneChunk = chunks.find((c) => c.done);
    expect(streamedTexts).toEqual(['İyi ', 'günler!']);
    expect(doneChunk?.done?.text).toBe('İyi günler!');
    expect(streamedTexts.join('')).toBe(doneChunk?.done?.text);
  });

  it('no deltas at all (result-only) → fallback yields exactly once, no double-yield', async () => {
    const chunks = await driveTurn([
      resultEvent('tek seferde gelen cevap'),
    ]);
    const streamedTexts = chunks.filter((c) => c.text).map((c) => c.text as string);
    const doneChunk = chunks.find((c) => c.done);
    expect(streamedTexts).toEqual(['tek seferde gelen cevap']);
    expect(doneChunk?.done?.text).toBe('tek seferde gelen cevap');
    expect(streamedTexts.join('')).toBe(doneChunk?.done?.text);
  });
});
