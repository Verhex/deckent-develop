// tests/cli/repl/interaction-flow.test.ts
// ═══ 7114 TERMINAL-INTERACTION-FLOW-001 — bridge + render seams ═════════════
//
// (1) narration streamed between tool calls reaches the view BEFORE the tool
//     result lands (live, never buffered to turn end); the stream segmenter
//     keeps a newline-less narration line visible as the partial;
// (2) the tool line names the bounded target + elapsed (EN/TR, redacted);
// (3) an Esc/cancel mid-turn keeps the partial narration and closes with
//     "interrupted after N tool calls / M s" (EN/TR);
// (4) the host-enforced interim deliverable renders its typed notice and the
//     `/context` snapshot exposes the counters (EN/TR).
// Hermetic: scripted adapter, tmpdir, fake clock — no provider, no Ink mount.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNativeEngine } from '../../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../../src/cli/repl/native-tool-registry.js';
import { createStreamSegmenter, type Segment } from '../../../src/cli/repl/stream-segmenter.js';
import { formatContextSnapshot, buildContextSlashLabels } from '../../../src/cli/repl/run.js';
import type { ContextSnapshot } from '../../../src/cli/repl/native-agent-bridge.js';
import type { ToolInfo } from '../../../src/cli/repl/app.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';
import { resolveNativeAgentBudget } from '../../../src/core/execution-budget-policy.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../../src/agent/provider-tooluse/types.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'deckent-7114-'));
  roots.push(d);
  writeFileSync(join(d, 'plan.md'), '# plan\n\nrow 1\nrow 2\n');
  return d;
}
function scripted(rounds: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let i = 0;
  return {
    requests,
    adapter: { name: 'scripted', async *send(req) { requests.push(req); for (const e of rounds[i++] ?? [{ type: 'done' }]) yield e; } },
  };
}
function fakeClock(start = 10_000): { now: () => number; advance: (ms: number) => void } {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}
type LogEntry = { kind: 'output'; text: string } | { kind: 'tool'; info: ToolInfo };
function harness(lang: 'en' | 'tr', adapter: ProviderAdapter, extra: Partial<Parameters<typeof createNativeEngine>[0]> = {}) {
  const cwd = sandbox();
  const log: LogEntry[] = [];
  const engine = createNativeEngine({
    adapter, registry: buildNativeToolRegistry({ cwd: () => cwd }), cwd, model: 'm', lang,
    confirm: async () => 'y',
    toolSink: (info) => log.push({ kind: 'tool', info }),
    t: (key) => getMessage(key, lang),
    ...extra,
  });
  const cbs = { output: (text: string) => { log.push({ kind: 'output', text }); }, onTurnEnd: () => {} };
  return { engine, log, cbs, cwd };
}
const LONG = 'Known so far: two rows read. Remaining: the rest of the plan. Next: read the remaining rows and summarise them in a table. '.repeat(2);
const tick = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('narration rendering — live, before the tool result', () => {
  it.each(['en', 'tr'] as const)('%s: a text-delta emitted before a tool call reaches output() before the tool line lands', async (lang) => {
    const s = scripted([
      [{ type: 'text-delta', text: 'Reading the plan to map its sections.' }, { type: 'tool-call', id: 'r1', name: 'deckent_read_file', args: { path: 'plan.md', startLine: 1, endLine: 2 } }, { type: 'done' }],
      [{ type: 'text-delta', text: 'done' }, { type: 'done' }],
    ]);
    const clock = fakeClock();
    const h = harness(lang, s.adapter, { now: clock.now });
    await h.engine('go', h.cbs);
    const narrationAt = h.log.findIndex((e) => e.kind === 'output' && e.text.includes('Reading the plan'));
    const toolAt = h.log.findIndex((e) => e.kind === 'tool');
    expect(narrationAt).toBeGreaterThanOrEqual(0);
    expect(toolAt).toBeGreaterThan(narrationAt);
    // (2) the tool line names the bounded target and the elapsed time
    const tool = (h.log[toolAt] as { kind: 'tool'; info: ToolInfo }).info;
    expect(tool.verb).toBe(getMessage('tool.read_file', lang));
    expect(tool.target).toBe('plan.md:1-2');
    expect(tool.note).toBe(getMessage('native.tool_elapsed', lang).replace('{ms}', '0'));
    expect(tool.failed).toBeUndefined();
  });

  it('the stream segmenter shows a newline-less narration line as the live partial and commits it on flush', () => {
    const segments: Segment[] = [];
    const segmenter = createStreamSegmenter((seg) => segments.push(seg));
    segmenter.feed('Reading the plan to map its sections.');
    expect(segmenter.partial()).toBe('Reading the plan to map its sections.');
    expect(segments).toEqual([]);
    // the tool sink flushes before pushing the tool turn (app.tsx registerToolSink)
    segmenter.flush();
    expect(segments).toEqual([{ kind: 'line', markdown: 'Reading the plan to map its sections.' }]);
    expect(segmenter.partial()).toBe('');
  });

  it('a shell tool line carries the command with credentials redacted and the read-only marker + elapsed', async () => {
    const s = scripted([
      [{ type: 'tool-call', id: 'b1', name: 'deckent_bash', args: { cmd: 'git status --short' } }, { type: 'done' }],
      [{ type: 'text-delta', text: 'ok' }, { type: 'done' }],
    ]);
    const clock = fakeClock();
    const h = harness('en', s.adapter, { now: clock.now, decidePermission: async () => ({ decision: 'hold', reasonCode: 'never' }) });
    await h.engine('status', h.cbs);
    const tool = h.log.find((e): e is { kind: 'tool'; info: ToolInfo } => e.kind === 'tool')!;
    expect(tool.info.target).toBe('git status --short');
    expect(tool.info.note).toContain(getMessage('native.tool_elapsed', 'en').replace('{ms}', '0'));
  });
});

describe('interrupt semantics — partial narration kept, honest closing line', () => {
  it.each(['en', 'tr'] as const)('%s: cancelTurn mid-stream keeps the streamed text and reports tool calls / seconds', async (lang) => {
    const clock = fakeClock();
    const adapter: ProviderAdapter = {
      name: 'blocking',
      async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
        yield { type: 'text-delta', text: 'partial narration' };
        await new Promise<void>((resolve) => { req.signal?.addEventListener('abort', () => resolve()); });
        throw new DOMException('The operation was aborted', 'AbortError');
      },
    };
    const h = harness(lang, adapter, { now: clock.now });
    const turn = h.engine('go', h.cbs);
    while (!h.log.some((e) => e.kind === 'output' && e.text.includes('partial narration'))) await tick();
    clock.advance(7_400);
    expect(h.engine.cancelTurn!()).toBe(true);
    await turn;
    const text = h.log.filter((e): e is { kind: 'output'; text: string } => e.kind === 'output').map((e) => e.text).join('');
    expect(text.indexOf('partial narration')).toBeGreaterThanOrEqual(0);
    const line = getMessage('native.turn_interrupted', lang).replace('{toolCalls}', '0').replace('{elapsed}', '7');
    expect(text.indexOf(line)).toBeGreaterThan(text.indexOf('partial narration'));
    expect(text).not.toContain('{toolCalls}');
  });

  it('counts the tool calls that ran before the cancel', async () => {
    const clock = fakeClock();
    let round = 0;
    const adapter: ProviderAdapter = {
      name: 'two-round',
      async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
        if (round++ === 0) {
          yield { type: 'text-delta', text: 'Reading first.' };
          yield { type: 'tool-call', id: 'r1', name: 'deckent_read_file', args: { path: 'plan.md' } };
          yield { type: 'done' };
          return;
        }
        yield { type: 'text-delta', text: 'Now the second part' };
        await new Promise<void>((resolve) => { req.signal?.addEventListener('abort', () => resolve()); });
        throw new DOMException('The operation was aborted', 'AbortError');
      },
    };
    const h = harness('en', adapter, { now: clock.now });
    const turn = h.engine('go', h.cbs);
    while (!h.log.some((e) => e.kind === 'output' && e.text.includes('second part'))) await tick();
    clock.advance(12_000);
    h.engine.cancelTurn!();
    await turn;
    const text = h.log.filter((e): e is { kind: 'output'; text: string } => e.kind === 'output').map((e) => e.text).join('');
    expect(text).toContain(getMessage('native.turn_interrupted', 'en').replace('{toolCalls}', '1').replace('{elapsed}', '12'));
    expect(text).toContain('Now the second part');
  });

  it('a turn that ends normally never prints the interrupted line', async () => {
    const s = scripted([[{ type: 'text-delta', text: 'fine' }, { type: 'done' }]]);
    const h = harness('en', s.adapter);
    await h.engine('go', h.cbs);
    const text = h.log.map((e) => (e.kind === 'output' ? e.text : '')).join('');
    expect(text).not.toContain(getMessage('native.turn_interrupted', 'en').split('{')[0]!);
  });
});

describe('host-enforced interim deliverable — engine + /context', () => {
  const budget = resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { progressNoteEveryToolCalls: 2, interimAnswerAfterToolCalls: 2 } } as never });

  it.each(['en', 'tr'] as const)('%s: two silent reads → typed notice rendered, model answers, /context shows the counters', async (lang) => {
    const s = scripted([
      [
        { type: 'tool-call', id: 'a', name: 'deckent_read_file', args: { path: 'plan.md', startLine: 1, endLine: 1 } },
        { type: 'tool-call', id: 'b', name: 'deckent_read_file', args: { path: 'plan.md', startLine: 2, endLine: 2 } },
        { type: 'done' },
      ],
      [{ type: 'text-delta', text: LONG }, { type: 'done' }],
      [{ type: 'text-delta', text: 'nothing remains' }, { type: 'done' }],
    ]);
    const clock = fakeClock();
    const h = harness(lang, s.adapter, { now: clock.now, nativeBudget: budget });
    await h.engine('analyse the plan', h.cbs);
    const text = h.log.filter((e): e is { kind: 'output'; text: string } => e.kind === 'output').map((e) => e.text).join('');
    const notice = getMessage('native.interim_deliverable_required', lang).replace('{toolCalls}', '2').replace('{elapsed}', '0');
    expect(text).toContain(notice);
    expect(text.indexOf(LONG)).toBeGreaterThan(text.indexOf(notice));
    expect(text).toContain('nothing remains');
    expect(s.requests).toHaveLength(3);
    const snapshot = await h.engine.contextSnapshot!();
    expect(snapshot.interimDeliverable).toMatchObject({ toolCallsLimit: 2, elapsedMsLimit: 90_000, minChars: 200, delivered: 1, requested: 1, pending: false, lastTrigger: 'tool-calls' });
    const rendered = formatContextSnapshot(snapshot, buildContextSlashLabels((k) => getMessage(k, lang)));
    expect(rendered).toContain(getMessage('native-context.slash.interim_deliverable', lang)
      .replace('{calls}', '0').replace('{callsLimit}', '2').replace('{elapsed}', '0').replace('{elapsedLimit}', '90')
      .replace('{delivered}', '1').replace('{requested}', '1'));
    expect(rendered).not.toContain(getMessage('native-context.slash.interim_deliverable_pending', lang));
  });

  it('fires on the wall-clock bound through the injected engine clock', async () => {
    const clock = fakeClock();
    const slowBudget = resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { interimAnswerAfterMs: 30_000 } } as never });
    let round = 0;
    const adapter: ProviderAdapter = {
      name: 'slow',
      async *send(): AsyncIterable<ProviderEvent> {
        round++;
        if (round === 1) { clock.advance(31_000); yield { type: 'tool-call', id: 'a', name: 'deckent_read_file', args: { path: 'plan.md' } }; yield { type: 'done' }; return; }
        if (round === 2) { yield { type: 'text-delta', text: LONG }; yield { type: 'done' }; return; }
        yield { type: 'text-delta', text: 'end' }; yield { type: 'done' };
      },
    };
    const h = harness('en', adapter, { now: clock.now, nativeBudget: slowBudget });
    await h.engine('go', h.cbs);
    const text = h.log.filter((e): e is { kind: 'output'; text: string } => e.kind === 'output').map((e) => e.text).join('');
    expect(text).toContain(getMessage('native.interim_deliverable_required', 'en').replace('{toolCalls}', '1').replace('{elapsed}', '31'));
    expect((await h.engine.contextSnapshot!()).interimDeliverable?.lastTrigger).toBe('elapsed');
  });

  it('/context renders the pending line while a host request is outstanding', () => {
    const snapshot: ContextSnapshot = {
      window: 1000, measuredInputTokens: 10, epoch: 1, messages: 3, preambleMessages: 0, checkpoint: 'empty', refreshPlanned: false, highWaterRatio: 0.8,
      interimDeliverable: { toolCallsSinceDeliverable: 14, elapsedMsSinceDeliverable: 95_400, toolCallsLimit: 12, elapsedMsLimit: 90_000, minChars: 200, delivered: 0, requested: 1, pending: true, lastTrigger: 'tool-calls' },
    };
    for (const lang of ['en', 'tr'] as const) {
      const rendered = formatContextSnapshot(snapshot, buildContextSlashLabels((k) => getMessage(k, lang)));
      expect(rendered).toContain(getMessage('native-context.slash.interim_deliverable_pending', lang));
      expect(rendered).toContain('14/12');
      expect(rendered).toContain('95/90');
    }
  });

  it('every 7114 catalog row exists in en and tr', () => {
    for (const key of [
      'native.tool_elapsed', 'native.interim_deliverable_required', 'native.turn_interrupted',
      'native-context.slash.interim_deliverable', 'native-context.slash.interim_deliverable_pending',
    ]) {
      expect(getMessageLanguages(key)).toEqual(expect.arrayContaining(['en', 'tr']));
      // '{ms} ms' is unit-only and legitimately identical in both languages
      if (key !== 'native.tool_elapsed') expect(getMessage(key, 'en')).not.toBe(getMessage(key, 'tr'));
    }
  });
});
