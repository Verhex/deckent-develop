// ═══ Sprint 285 T-285-004 — çoklu tool-sonucu geri-beslemesi ══════════════════
//
// Verifies that `turnInput` collects ALL consecutive trailing tool messages from
// the transcript and feeds them to the model in a single block.  When only one
// tool message is present the existing single-result format is preserved exactly
// (backward-compat).
//
// Root cause fixed: `turnInput` previously only inspected `messages[N-1]` (the
// last message) — N-1 tool results were silently dropped when N tools ran in a
// single turn.
//
// Hermetic (ADR-087): mock spawn only — no real `claude` binary, no spawnSync.

import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';

import {
  createPersistentClaudeSession,
  type PersistentClaudeHandle,
  type PersistentSpawnFn,
} from '../../src/cli/commands/chat-session.js';
import type { ChatMessage } from '../../src/cli/commands/chat-native.js';

// ─── Mock spawn (pending-resolver model) ────────────────────────────────────

interface MockControl {
  handle: PersistentClaudeHandle;
  writes: string[];
  pushLine(line: string): void;
  closeStream(): void;
}

function makeMock(): MockControl {
  const writes: string[] = [];
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
    write(chunk, _enc, cb) {
      writes.push(Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : String(chunk));
      cb();
    },
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
  return { handle, writes, pushLine, closeStream };
}

/** Extract the `text` field that turnInput produced from the first stdin write. */
function extractTurnText(writes: string[]): string {
  const raw = writes[0];
  if (!raw) return '';
  const parsed = JSON.parse(raw) as { message?: { content?: Array<{ type: string; text?: string }> } };
  return parsed.message?.content?.[0]?.text ?? '';
}

/** Run a single send() turn and return the written turnInput text. */
async function runSendAndGetTurnText(messages: ChatMessage[]): Promise<string> {
  const mock = makeMock();
  const spawnFn = vi.fn(() => mock.handle) as unknown as PersistentSpawnFn;
  const session = createPersistentClaudeSession({ spawnFn });
  const p = session.send(messages);
  mock.pushLine(JSON.stringify({ type: 'result', result: 'ok' }));
  mock.closeStream();
  await p;
  return extractTurnText(mock.writes);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('turnInput — multiple tool results fed back to model', () => {
  // Kanıt test: 3-tool-sonuçlu transcript'te turnInput çıktısı 3 sonucu da içerir
  it('3 consecutive tool messages → all 3 results present in combined block', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'run 3 actions' },
      { role: 'tool', content: 'result-one', toolUseId: 'tool-0' },
      { role: 'tool', content: 'result-two', toolUseId: 'tool-1' },
      { role: 'tool', content: 'result-three', toolUseId: 'tool-2' },
    ];
    const text = await runSendAndGetTurnText(messages);

    expect(text).toContain('result-one');
    expect(text).toContain('result-two');
    expect(text).toContain('result-three');
    expect(text).toContain('[deckent tool sonuçları]');
    expect(text).toContain('Kullanıcıya kısaca sonuçları bildir.');
  });

  it('order preserved: [1/N], [2/N], [3/N] labels appear in sequence', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'run tools' },
      { role: 'tool', content: 'FIRST', toolUseId: 'tool-0' },
      { role: 'tool', content: 'SECOND', toolUseId: 'tool-1' },
      { role: 'tool', content: 'THIRD', toolUseId: 'tool-2' },
    ];
    const text = await runSendAndGetTurnText(messages);

    expect(text).toContain('[1/3]');
    expect(text).toContain('[2/3]');
    expect(text).toContain('[3/3]');

    const i1 = text.indexOf('FIRST');
    const i2 = text.indexOf('SECOND');
    const i3 = text.indexOf('THIRD');
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBeGreaterThanOrEqual(0);
    expect(i3).toBeGreaterThanOrEqual(0);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
  });

  it('toolUseId included as label for each result entry', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'two tools' },
      { role: 'tool', content: 'file written', toolUseId: 'tool-0' },
      { role: 'tool', content: 'cmd ran', toolUseId: 'tool-1' },
    ];
    const text = await runSendAndGetTurnText(messages);

    expect(text).toContain('tool-0');
    expect(text).toContain('tool-1');
  });
});

describe('turnInput — single tool result backward-compat', () => {
  it('single tool message → exact existing format preserved (bit-for-bit)', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'write a.md' },
      { role: 'tool', content: '[deckent] yazıldı: a.md', toolUseId: 'tool-0' },
    ];
    const text = await runSendAndGetTurnText(messages);

    // Must match the EXACT original format from the old single-tool branch.
    expect(text).toBe(
      '[deckent tool sonucu]\n[deckent] yazıldı: a.md\n\nKullanıcıya kısaca sonucu bildir.',
    );
    // Must NOT use the multi-result format header.
    expect(text).not.toContain('[deckent tool sonuçları]');
  });

  it('single tool message does not include [1/1] order label', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'single action' },
      { role: 'tool', content: 'done', toolUseId: 'tool-0' },
    ];
    const text = await runSendAndGetTurnText(messages);
    expect(text).not.toContain('[1/1]');
  });
});

describe('turnInput — non-tool last message falls back to user text', () => {
  it('pure user message → falls back to last user text content', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hello world' },
    ];
    const text = await runSendAndGetTurnText(messages);
    expect(text).toBe('hello world');
  });

  it('user+assistant transcript → extracts last user text', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'first message' },
      { role: 'assistant', content: 'first reply' },
      { role: 'user', content: 'second message' },
    ];
    const text = await runSendAndGetTurnText(messages);
    expect(text).toBe('second message');
  });
});
