// ═══ Sprint 285 T-285-001 — REPL tool-protocol root-cause repros ═════════════
//
// Instrumented failing-repros for the three hypotheses behind the 2026-06-12
// dogfood findings (docs/reviews/sprint-285/repl-tool-root-cause.md):
//   H1 — Ink confirm single-slot collapse (src/cli/repl/app.tsx)
//   H2 — stream-collection block loss   (src/cli/commands/chat-session.ts)
//   H3 — turnInput single-result loss   (src/cli/commands/chat-session.ts)
//
// Diagnosis task — the fixes themselves are T2 (H1), T3 (H2), T4 (H3), T5
// (telemetry). The H2/H3 repros were originally pinned with `it.fails` (282-001
// pattern) so the suite stayed green while the bug still existed. Those fixes
// have now LANDED in src (chat-session.ts reconciliation :515-524 + `assistant`
// event :362-379 → T3; `turnInput` multi-result :464-488 → T4; FIFO confirm
// queue app.tsx createConfirmQueue → T2), so the bodies pass. Per the design's
// own signal ("body passes → it.fails turns red → remove the pin"), the four
// pins were CONVERTED to plain green `it` regression guards that now assert the
// FIXED behaviour. See docs/reviews/sprint-285/repl-tool-root-cause.md (Closure).
//
// Hermetic (ADR-087): no real `claude` binary, no spawnSync, tmp-free — the
// persistent session is driven by an injected mock spawn (the exact
// pending-resolver pattern from tests/cli/chat-session-persistent.test.ts) and
// the Ink confirm path is modeled in-process (ink-testing-library is not a
// project dependency, so app.tsx cannot be rendered; the task asks for a
// mock-ConfirmTrigger repro, which this is).

import { describe, it, expect, vi } from 'vitest';
import { Writable } from 'node:stream';

import {
  createPersistentClaudeSession,
  parseDeckentToolCalls,
  type PersistentClaudeHandle,
  type PersistentSpawnFn,
} from '../../src/cli/commands/chat-session.js';
import type { ChatMessage, ProviderResponse } from '../../src/cli/commands/chat-native.js';

// ─── Mock spawn (pending-resolver model — see chat-session-persistent.test.ts) ─

interface MockSpawnControl {
  handle: PersistentClaudeHandle;
  writes: string[];
  pushLine(line: string): void;
  closeStream(): void;
}

function makeMockSpawn(): MockSpawnControl {
  const writes: string[] = [];
  let waitResolver!: (v: { exitCode: number | null }) => void;
  const wait = new Promise<{ exitCode: number | null }>((r) => { waitResolver = r; });

  let closed = false;
  const lineQueue: string[] = [];
  let pendingResolver: ((line: string | null) => void) | null = null;

  function pushLine(line: string): void {
    if (pendingResolver) { const r = pendingResolver; pendingResolver = null; r(line); }
    else lineQueue.push(line);
  }
  function closeStream(): void {
    if (closed) return;
    closed = true;
    if (pendingResolver) { const r = pendingResolver; pendingResolver = null; r(null); }
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
        if (lineQueue.length > 0) {
          return Promise.resolve({ value: lineQueue.shift() as string, done: false });
        }
        if (closed) {
          return Promise.resolve({ value: undefined as unknown as string, done: true });
        }
        return new Promise<IteratorResult<string>>((resolve) => {
          pendingResolver = (line) =>
            line === null
              ? resolve({ value: undefined as unknown as string, done: true })
              : resolve({ value: line, done: false });
        });
      },
    }),
  };

  const handle: PersistentClaudeHandle = {
    stdin,
    stdoutLines,
    wait,
    kill() { closeStream(); },
  };
  return { handle, writes, pushLine, closeStream };
}

// ─── stream-json line fixtures ───────────────────────────────────────────────

/** A wrapped incremental token delta (claude `--include-partial-messages`). */
const deltaLine = (text: string): string =>
  JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text } } });

/** The top-level `assistant` complete-message event (full content array). */
const assistantLine = (text: string): string =>
  JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });

/** The end-of-turn `result` event (carries the full aggregated text). */
const resultLine = (text: string): string =>
  JSON.stringify({ type: 'result', subtype: 'success', result: text, usage: { input_tokens: 5, output_tokens: 9 } });

const tag = (name: string, args: Record<string, unknown>): string =>
  `<deckent_tool>${JSON.stringify({ name, args })}</deckent_tool>`;

/** Run one `send` turn against a scripted line sequence; return the final response. */
async function sendWithLines(messages: ChatMessage[], lines: string[]): Promise<ProviderResponse> {
  const mock = makeMockSpawn();
  const spawnFn = vi.fn(() => mock.handle) as unknown as PersistentSpawnFn;
  const session = createPersistentClaudeSession({ spawnFn });
  const p = session.send(messages);
  for (const l of lines) mock.pushLine(l);
  mock.closeStream();
  return p;
}

// ═════════════════════════════════════════════════════════════════════════════
// Parser anchor — proves the parser itself is CORRECT (not the suspect).
// ═════════════════════════════════════════════════════════════════════════════

describe('anchor — parseDeckentToolCalls is position-independent + multi-tag', () => {
  it('finds ALL tags regardless of surrounding prose (matchAll, /gi)', () => {
    const text =
      'Önce şunu açıklayayım, sonra üç komut çalıştıracağım. ' +
      tag('deckent_bash', { cmd: 'pwd' }) +
      ' arada biraz daha açıklama ' +
      tag('deckent_bash', { cmd: 'ls' }) +
      ' ve son olarak ' +
      tag('deckent_bash', { cmd: 'whoami' });
    const calls = parseDeckentToolCalls(text);
    expect(calls.map((c) => c.name)).toEqual(['deckent_bash', 'deckent_bash', 'deckent_bash']);
    expect((calls[0]!.args as { cmd: string }).cmd).toBe('pwd');
    expect((calls[2]!.args as { cmd: string }).cmd).toBe('whoami');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H1 — Ink confirm single-slot. MODEL of the OLD app.tsx single-resolver ref +
// run.tsx askConfirm, driven the way the engine (chat-native.ts:815 for…of await)
// drives it. The real fix LANDED in app.tsx (T2: createConfirmQueue FIFO queue);
// these model the sequential-safe behaviour and the concurrent fragility it removed.
// ═════════════════════════════════════════════════════════════════════════════

type Answer = 'y' | 'a' | 'n';

/** Faithful model of app.tsx: ONE resolver slot, overwritten on each trigger. */
function makeSingleSlotConfirm() {
  let slot: ((a: Answer) => void) | null = null;
  const shown: string[] = [];
  // app.tsx:196-200 — registerConfirm sets confirmResolve.current = resolve.
  const trigger = (summary: string): Promise<Answer> =>
    new Promise<Answer>((resolve) => { slot = resolve; shown.push(summary); });
  // app.tsx:341-346 — useInput reads + clears the single slot.
  const answer = (a: Answer): void => { const r = slot; slot = null; r?.(a); };
  return { trigger, answer, shown, hasPending: (): boolean => slot !== null };
}

const waitFor = async (cond: () => boolean, tries = 100): Promise<void> => {
  for (let i = 0; i < tries; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error('waitFor: condition never became true');
};

describe('H1 — Ink confirm single-slot (model of app.tsx)', () => {
  it('SEQUENTIAL dispatch (engine for…of await): all 3 confirms reach the user', async () => {
    const c = makeSingleSlotConfirm();
    // run.tsx askConfirm (simplified to the confirm path only).
    const askConfirm = async (summary: string): Promise<boolean> => (await c.trigger(summary)) !== 'n';
    const results: boolean[] = [];
    // Engine: `for (const call of toolCalls) { await dispatcher.dispatch(...) }`.
    const dispatchAll = (async () => {
      for (const cmd of ['cmd-0', 'cmd-1', 'cmd-2']) results.push(await askConfirm(cmd));
    })();
    // A "user" answering each modal as it appears, one at a time.
    for (let i = 0; i < 3; i++) { await waitFor(() => c.hasPending()); c.answer('y'); }
    await dispatchAll;
    // Sequential awaiting protects the single slot → every confirm was shown.
    expect(c.shown).toEqual(['cmd-0', 'cmd-1', 'cmd-2']);
    expect(results).toEqual([true, true, true]);
  });

  it('CONCURRENT confirms: the 2nd overwrites the 1st resolver → 1st is orphaned', async () => {
    const c = makeSingleSlotConfirm();
    const askConfirm = async (summary: string): Promise<boolean> => (await c.trigger(summary)) !== 'n';
    // Two confirms triggered WITHOUT awaiting between them (the latent risk the
    // FIFO queue removed): trigger('a') sets slot=resolveA, trigger('b') OVERWRITES
    // slot=resolveB. A single keypress can now only ever resolve resolveB.
    const p1 = askConfirm('cmd-a');
    const p2 = askConfirm('cmd-b');
    expect(c.shown).toEqual(['cmd-a', 'cmd-b']);
    c.answer('y'); // resolves p2 (the surviving slot); p1's resolver was dropped.
    await expect(p2).resolves.toBe(true);
    // p1 never settles — orphaned. This is the single-slot fragility T2 fixed
    // with a FIFO confirm queue (now landed in app.tsx createConfirmQueue).
    const raced = await Promise.race([
      p1.then(() => 'settled' as const),
      new Promise<'orphaned'>((r) => setTimeout(() => r('orphaned'), 25)),
    ]);
    expect(raced).toBe('orphaned');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H2 — stream-collection robustness (chat-session.ts runTurn:490-546 +
// parseStreamJsonLine:332-403). DIAGNOSIS: `collected` used to sum only
// content_block_delta text; the `assistant` complete-message event was ignored
// and the `result` fallback was all-or-nothing (`collected.length===0` gate).
// FIX (T3, LANDED): parseStreamJsonLine now extracts `assistantText` (:362-379)
// and runTurn reconciles to the longest of delta/result/assistant (:515-524).
// These four cases assert the fix holds (regression guards), not the old bug.
// ═════════════════════════════════════════════════════════════════════════════

describe('H2 — stream-collection block loss', () => {
  const user: ChatMessage[] = [{ role: 'user', content: 'üç komut çalıştır' }];

  it('CONTROL: tag streamed as a content_block_delta → found (happy path)', async () => {
    const res = await sendWithLines(user, [
      deltaLine('Şu komutu çalıştırıyorum: ' + tag('deckent_bash', { cmd: 'ls' })),
      resultLine('Şu komutu çalıştırıyorum: ' + tag('deckent_bash', { cmd: 'ls' })),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  // collected gets the prose delta (non-empty); the tag lives only in the later
  // `result` text. Pre-fix the all-or-nothing fallback dropped it; post-fix
  // runTurn reconciles to the longest source (:515-524) so the tag is dispatched.
  it('H2-A: tag carried only in the `result` event is still dispatched (reconciled)', async () => {
    const res = await sendWithLines(user, [
      deltaLine('Tamam, şimdi şu komutu çalıştırıyorum: '), // prose only — no tag
      resultLine('Tamam, şimdi şu komutu çalıştırıyorum: ' + tag('deckent_bash', { cmd: 'ls' })),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  // No deltas at all; the tag arrives in the top-level `assistant` complete
  // message event (result text empty). Pre-fix that event was unrecognised;
  // post-fix parseStreamJsonLine extracts `assistantText` (:362-379) and runTurn
  // reconciles it into `collected` (:524), so the tag is dispatched.
  it('H2-B: tag carried only in the `assistant` complete-message event is dispatched', async () => {
    const res = await sendWithLines(user, [
      assistantLine('İşte istediğin komut: ' + tag('deckent_bash', { cmd: 'whoami' })),
      resultLine(''),
    ]);
    expect(res.stopReason).toBe('tool_use');
    expect(res.toolCalls).toHaveLength(1);
  });

  // Multi-tag: tag-1 streams as a delta, tag-2 + tag-3 only appear in the
  // assistant event. Pre-fix only the delta-borne tag survived (3 → 1 undercount,
  // the dogfood "only one of N tags runs" finding); post-fix runTurn reconciles
  // to the longest source so all three tags are found.
  it('H2-C: tags split across delta + assistant blocks → all 3 found (no undercount)', async () => {
    const full =
      'Üç komut: ' + tag('deckent_bash', { cmd: 'pwd' }) +
      ' ' + tag('deckent_bash', { cmd: 'ls' }) +
      ' ' + tag('deckent_bash', { cmd: 'whoami' });
    const res = await sendWithLines(user, [
      deltaLine('Üç komut: ' + tag('deckent_bash', { cmd: 'pwd' })), // only tag-1 streams
      assistantLine(full), // tag-2 + tag-3 live here (ignored)
      resultLine(full),
    ]);
    expect(res.toolCalls).toHaveLength(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// H3 — turnInput multi-result feedback (chat-session.ts:464-488). When N tool
// results are pushed in one hop (chat-native.ts:815-821 pushes one `tool` message
// per call), turnInput used to read ONLY messages[len-1] → the model saw just the
// last result. FIX (T4, LANDED): turnInput now walks back over the whole trailing
// tool-message run and feeds all of them in one labelled block. Single-tool
// formatting is preserved bit-for-bit (the CONTROL guard below).
// ═════════════════════════════════════════════════════════════════════════════

describe('H3 — turnInput multi-result feedback loss', () => {
  /** Pull the user-text the session actually wrote to the model this turn. */
  async function capturedPrompt(messages: ChatMessage[]): Promise<string> {
    const mock = makeMockSpawn();
    const session = createPersistentClaudeSession({ spawnFn: () => mock.handle });
    const p = session.send(messages);
    mock.pushLine(resultLine('ok'));
    mock.closeStream();
    await p;
    const line = mock.writes[0] ?? '{}';
    return JSON.parse(line).message?.content?.[0]?.text ?? '';
  }

  it('CONTROL: a single tool result is fed back to the model (regression guard)', async () => {
    const prompt = await capturedPrompt([
      { role: 'user', content: 'a.md yaz' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'tool-0', name: 'deckent_write_file', args: {} }] },
      { role: 'tool', content: '[deckent] yazıldı: a.md', toolUseId: 'tool-0' },
    ]);
    expect(prompt).toContain('deckent tool sonucu');
    expect(prompt).toContain('[deckent] yazıldı: a.md');
  });

  // Three tools ran in one hop → three trailing `tool` messages. Pre-fix turnInput
  // sent only the LAST so the model never saw results #1/#2; post-fix it collects
  // the whole trailing run, so all three reach the model.
  it('H3: 3 trailing tool results → all three reach the model', async () => {
    const prompt = await capturedPrompt([
      { role: 'user', content: 'üç komut çalıştır' },
      {
        role: 'assistant', content: '',
        toolCalls: [
          { id: 'tool-0', name: 'deckent_bash', args: { cmd: 'pwd' } },
          { id: 'tool-1', name: 'deckent_bash', args: { cmd: 'ls' } },
          { id: 'tool-2', name: 'deckent_bash', args: { cmd: 'whoami' } },
        ],
      },
      { role: 'tool', content: 'RESULT_PWD=/workspace', toolUseId: 'tool-0' },
      { role: 'tool', content: 'RESULT_LS=app.tsx run.tsx', toolUseId: 'tool-1' },
      { role: 'tool', content: 'RESULT_WHOAMI=deckent', toolUseId: 'tool-2' },
    ]);
    expect(prompt).toContain('RESULT_PWD=/workspace');
    expect(prompt).toContain('RESULT_LS=app.tsx run.tsx');
    expect(prompt).toContain('RESULT_WHOAMI=deckent');
  });
});
