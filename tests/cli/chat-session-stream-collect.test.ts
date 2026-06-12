// ═══ Sprint 285 T-285-003 — stream-collection robustness matrix ═══════════════
//
// Tests that `runTurn`+`parseStreamJsonLine` collect ALL text-bearing stream-json
// block types and that `parseDeckentToolCalls` sees every tag regardless of:
//   • tag position in the reply (bare, prose-end, prose-mid, inter-tag, code-fence)
//   • which stream event carried the text (delta, assistant, result)
//
// Covers the H2 root cause from T-285-001 (docs/reviews/sprint-285/repl-tool-root-cause.md):
//   H2-A: all-or-nothing resultText fallback (fixed: max-length reconciliation)
//   H2-B: assistant complete-message event ignored (fixed: parseStreamJsonLine now handles it)
//   H2-C: multi-tag undercount when tags split across delta vs assistant (fixed: same)
//
// Hermetic (ADR-087): mock spawn only — no real `claude` binary, no spawnSync.

import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';

import {
  createPersistentClaudeSession,
  parseStreamJsonLine,
  parseDeckentToolCalls,
  DECKENT_AGENTIC_SYSTEM_PROMPT,
  type PersistentClaudeHandle,
  type PersistentSpawnFn,
} from '../../src/cli/commands/chat-session.js';
import type { ChatMessage, ProviderResponse } from '../../src/cli/commands/chat-native.js';

// ─── Mock spawn (pending-resolver model) ────────────────────────────────────

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

// ─── Stream-line builders ───────────────────────────────────────────────────

/** Wrapped incremental token delta (--include-partial-messages envelope). */
const delta = (text: string): string =>
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

/** `assistant` complete-message event with a single text content block. */
const assistant = (text: string): string =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });

/** `assistant` event with multiple text content blocks. */
const assistantMulti = (...parts: string[]): string =>
  JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: parts.map((t) => ({ type: 'text', text: t })),
    },
  });

/** End-of-turn `result` event. */
const result = (text: string): string =>
  JSON.stringify({ type: 'result', subtype: 'success', result: text, usage: { input_tokens: 5, output_tokens: 9 } });

/** A deckent_tool tag string. */
const tag = (name: string, args: Record<string, unknown>): string =>
  `<deckent_tool>${JSON.stringify({ name, args })}</deckent_tool>`;

/** Run one `send` turn against a scripted line sequence. */
async function sendWithLines(lines: string[]): Promise<ProviderResponse> {
  const mock = makeMock();
  const spawnFn = vi.fn(() => mock.handle) as unknown as PersistentSpawnFn;
  const session = createPersistentClaudeSession({ spawnFn });
  const messages: ChatMessage[] = [{ role: 'user', content: 'test' }];
  const p = session.send(messages);
  for (const l of lines) mock.pushLine(l);
  mock.closeStream();
  return p;
}

// ═══════════════════════════════════════════════════════════════════════
// parseStreamJsonLine — unit coverage for new `assistant` event handling
// ═══════════════════════════════════════════════════════════════════════

describe('parseStreamJsonLine — assistant event', () => {
  it('extracts text from assistant complete-message event into assistantText', () => {
    const r = parseStreamJsonLine(
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } }),
    );
    expect(r.text).toBe('');
    expect(r.done).toBe(false);
    expect(r.assistantText).toBe('hello');
  });

  it('joins multiple text content blocks from assistant event', () => {
    const r = parseStreamJsonLine(
      JSON.stringify({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'part-a' }, { type: 'text', text: 'part-b' }] },
      }),
    );
    expect(r.assistantText).toBe('part-apart-b');
  });

  it('skips non-text content blocks (tool_use, image) in assistant event', () => {
    const r = parseStreamJsonLine(
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'x', name: 'foo', input: {} },
            { type: 'text', text: 'only this' },
          ],
        },
      }),
    );
    expect(r.assistantText).toBe('only this');
  });

  it('returns empty when assistant event has no text content blocks', () => {
    const r = parseStreamJsonLine(
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'f', input: {} }] } }),
    );
    expect(r.text).toBe('');
    expect(r.assistantText).toBeUndefined();
    expect(r.done).toBe(false);
  });

  it('returns empty for assistant event with malformed message structure', () => {
    const r = parseStreamJsonLine(JSON.stringify({ type: 'assistant', message: null }));
    expect(r.text).toBe('');
    expect(r.done).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Stream-collection matrix — 10 cases covering tag-position × stream-type
// ═══════════════════════════════════════════════════════════════════════

describe('stream-collection matrix — tag position × stream type', () => {
  // ─── 1. bare-tag × single-delta ────────────────────────────────────
  it('(1) bare tag in single delta → tool_use dispatched', async () => {
    const t = tag('deckent_bash', { cmd: 'ls' });
    const res = await sendWithLines([
      delta(t),
      result(t),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0]!.name).toBe('deckent_bash');
  });

  // ─── 2. bare-tag × multi-delta ─────────────────────────────────────
  it('(2) bare tag split across multiple deltas → tool_use dispatched', async () => {
    const t = tag('deckent_write_file', { path: 'a.md', content: 'hi' });
    // Split tag across two deltas (first half, second half)
    const mid = Math.floor(t.length / 2);
    const full = t;
    const res = await sendWithLines([
      delta(t.slice(0, mid)),
      delta(t.slice(mid)),
      result(full),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  // ─── 3. prose-end-tag × result-only (H2-A base) ────────────────────
  // Tag arrives only in the `result` event (no deltas at all).
  it('(3) tag only in result event, no deltas → tool_use dispatched', async () => {
    const full = 'Dosyayı oluşturuyorum: ' + tag('deckent_write_file', { path: 'b.md', content: 'x' });
    const res = await sendWithLines([
      result(full),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  // ─── 4. prose-end-tag × prose-in-delta + tag-in-result (H2-A fix) ──
  // Prose streams as deltas; the tag only arrives in `resultText`. The old
  // all-or-nothing gate dropped `resultText` because `collected` was non-empty.
  it('(4) prose in deltas + tag only in result → tool_use dispatched (H2-A)', async () => {
    const prose = 'Şu komutu çalıştırıyorum: ';
    const full = prose + tag('deckent_bash', { cmd: 'pwd' });
    const res = await sendWithLines([
      delta(prose),
      result(full),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
    expect((res.toolCalls![0]!.args as { cmd: string }).cmd).toBe('pwd');
  });

  // ─── 5. prose-mid-tag × single-delta ───────────────────────────────
  it('(5) tag in middle of prose, single delta → tool_use dispatched', async () => {
    const full = 'İlk ' + tag('deckent_bash', { cmd: 'whoami' }) + ' ardından devam';
    const res = await sendWithLines([
      delta(full),
      result(full),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  // ─── 6. prose-mid-tag × multi-delta ────────────────────────────────
  it('(6) tag in middle of prose, surrounding prose split across deltas → tool_use', async () => {
    const t = tag('deckent_bash', { cmd: 'ls' });
    const full = 'Önce ' + t + ' sonra devam';
    const res = await sendWithLines([
      delta('Önce '),
      delta(t),
      delta(' sonra devam'),
      result(full),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  // ─── 7. inter-tag-prose × assistant-event-only (H2-B fix) ──────────
  // Two tags with prose between them, arriving ONLY in the `assistant` complete-
  // message event. The `result` text is empty. Old code ignored assistant events.
  it('(7) two tags in assistant event, result empty → both tags dispatched (H2-B)', async () => {
    const full =
      'İlk komut: ' + tag('deckent_bash', { cmd: 'pwd' }) +
      ' İkinci komut: ' + tag('deckent_bash', { cmd: 'ls' });
    const res = await sendWithLines([
      assistant(full),
      result(''),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(2);
  });

  // ─── 8. multi-tag split delta+assistant (H2-C fix) ─────────────────
  // tag-1 streams as a delta; tag-2 + tag-3 arrive only in the assistant event.
  // Old code: `collected` only had tag-1 → 1 toolCall. Fixed: 3 toolCalls.
  it('(8) tag-1 in delta, tag-2+3 in assistant event → all 3 dispatched (H2-C)', async () => {
    const t1 = tag('deckent_bash', { cmd: 'pwd' });
    const t2 = tag('deckent_bash', { cmd: 'ls' });
    const t3 = tag('deckent_bash', { cmd: 'whoami' });
    const full = 'Üç komut: ' + t1 + ' ' + t2 + ' ' + t3;
    const res = await sendWithLines([
      delta('Üç komut: ' + t1),
      assistant(full),
      result(full),
    ]);
    expect(res.toolCalls).toHaveLength(3);
    const cmds = (res.toolCalls ?? []).map((c) => (c.args as { cmd: string }).cmd);
    expect(cmds).toEqual(['pwd', 'ls', 'whoami']);
  });

  // ─── 9. code-fence-tag × single-delta ──────────────────────────────
  it('(9) tag inside code fence, single delta → tool_use dispatched', async () => {
    const t = tag('deckent_write_file', { path: 'test.ts', content: 'export {}' });
    const full = 'Şu dosyayı oluştur:\n```\n' + t + '\n```';
    const res = await sendWithLines([
      delta(full),
      result(full),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
    expect((res.toolCalls![0]!.args as { path: string }).path).toBe('test.ts');
  });

  // ─── 10. code-fence-tag × prose-delta + result authority ───────────
  // Prose + code fence streams as delta; tag inside the fence only in result.
  it('(10) code fence prose in deltas, tag only in result → tool_use dispatched', async () => {
    const t = tag('deckent_bash', { cmd: 'npm test' });
    const proseAndFence = 'Testi çalıştırıyorum:\n```\n';
    const full = proseAndFence + t + '\n```';
    const res = await sendWithLines([
      delta(proseAndFence),
      result(full),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
    expect((res.toolCalls![0]!.args as { cmd: string }).cmd).toBe('npm test');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Additional robustness cases
// ═══════════════════════════════════════════════════════════════════════

describe('stream-collection — additional robustness', () => {
  it('backward-compat: no-delta result-only still yields text and correct done', async () => {
    const mock = makeMock();
    const session = createPersistentClaudeSession({ spawnFn: () => mock.handle });
    const texts: string[] = [];
    const drain = (async () => {
      for await (const c of session.stream!([{ role: 'user', content: 'q' }])) {
        if (c.text) texts.push(c.text);
        if (c.done) return c.done.text;
      }
      return '';
    })();
    mock.pushLine(result('just the answer'));
    mock.closeStream();
    const doneText = await drain;
    expect(texts).toEqual(['just the answer']);
    expect(doneText).toBe('just the answer');
  });

  it('three-tag reply with result as authority (result longer than delta-sum)', async () => {
    const t1 = tag('deckent_bash', { cmd: 'a' });
    const t2 = tag('deckent_bash', { cmd: 'b' });
    const t3 = tag('deckent_bash', { cmd: 'c' });
    const full = t1 + ' ' + t2 + ' ' + t3;
    // Only t1 streams as delta; t2 + t3 only in result
    const res = await sendWithLines([
      delta(t1 + ' '),
      result(full),
    ]);
    expect(res.toolCalls).toHaveLength(3);
  });

  it('assistant event with multiple text parts accumulates all into assistantText', async () => {
    const t = tag('deckent_bash', { cmd: 'echo hi' });
    // assistant event with 2 content blocks: prose + tag
    const res = await sendWithLines([
      assistantMulti('Şu komutu çalıştırıyorum: ', t),
      result(''),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  it('end_turn reply (no tags) stays end_turn after reconciliation', async () => {
    const res = await sendWithLines([
      delta('Merhaba! '),
      delta('Nasıl yardımcı olabilirim?'),
      result('Merhaba! Nasıl yardımcı olabilirim?'),
    ]);
    expect(res.stopReason).toBe('end_turn');
    expect(res.toolCalls).toBeUndefined();
    expect(res.text).toBe('Merhaba! Nasıl yardımcı olabilirim?');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// System prompt — "AÇIKLAMA YAPMA" removed
// ═══════════════════════════════════════════════════════════════════════

describe('DECKENT_AGENTIC_SYSTEM_PROMPT — softened constraint', () => {
  it('does not contain "AÇIKLAMA YAPMA" (kırılganlık-semptomu kaldırıldı)', () => {
    expect(DECKENT_AGENTIC_SYSTEM_PROMPT).not.toContain('AÇIKLAMA YAPMA');
  });

  it('still instructs model to produce deckent_tool tags', () => {
    expect(DECKENT_AGENTIC_SYSTEM_PROMPT).toContain('deckent_tool');
  });

  it('still lists valid tools', () => {
    expect(DECKENT_AGENTIC_SYSTEM_PROMPT).toContain('deckent_write_file');
    expect(DECKENT_AGENTIC_SYSTEM_PROMPT).toContain('deckent_bash');
  });
});
