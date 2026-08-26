// tests/cli/trace-wire.test.ts
// 7089 (NATIVE-SESSION-LEDGER) — this file covers the whole per-turn record
// wiring: the delta cursor that kills the O(n²) trace, the ALWAYS-ON session
// ledger (usage → disk), the lazy system getter, and the bridge seams that feed
// them (recordTurn's unified meta + the hydrateTranscript re-hydration point).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildLedgerRecorder,
  buildTurnRecorder,
  composeTurnRecorders,
  createDeltaCursor,
  type TurnRecordMeta,
} from '../../src/cli/repl/trace-wire.js';
import { readLedgerSession } from '../../src/cli/repl/session-ledger.js';
import { createNativeEngine } from '../../src/cli/repl/native-agent-bridge.js';
import { buildNativeToolRegistry } from '../../src/cli/repl/native-tool-registry.js';
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderMessage,
  ProviderRequest,
} from '../../src/agent/provider-tooluse/types.js';
import { writeFileSync } from "node:fs";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function meta(turnIndex: number, over: Partial<TurnRecordMeta> = {}): TurnRecordMeta {
  return {
    usage: { inputTokens: 10, outputTokens: 2 },
    model: 'test-model',
    provider: 'test-provider',
    turnIndex,
    ...over,
  };
}

function readLines(file: string): Array<Record<string, unknown>> {
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** A transcript that grows by `perTurn` messages each turn — the exact shape
 *  that made the old full-copy recorder quadratic. */
function grown(turns: number, perTurn = 2): ProviderMessage[] {
  const messages: ProviderMessage[] = [];
  for (let t = 0; t < turns; t++) {
    for (let i = 0; i < perTurn; i++) {
      messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `t${t}-m${i}` });
    }
  }
  return messages;
}

describe('buildTurnRecorder', () => {
  it('returns undefined when disabled', () => {
    expect(buildTurnRecorder({ enabled: false, dir: tmpdir(), sessionId: 's', system: 'S', model: 'm', now: () => 'T' })).toBeUndefined();
  });

  it('returns a recorder that appends a JSONL example when enabled', () => {
    const dir = tmp('tw-');
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess1', system: 'SYS', model: 'qwen', now: () => 'TS' });
    expect(rec).toBeDefined();
    rec!([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
    const f = join(dir, 'sess1.jsonl');
    expect(existsSync(f)).toBe(true);
    const ex = JSON.parse(readFileSync(f, 'utf-8').trim());
    expect(ex.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(ex.meta).toEqual({ source: 'native-repl', model: 'qwen', ts: 'TS' });
  });

  it('resolves a lazy system getter per write, so a post-open prompt is recorded (not the boot snapshot)', () => {
    const dir = tmp('tw-lazy-');
    let systemPrompt = 'BOOT';
    const rec = buildTurnRecorder({
      enabled: true, dir, sessionId: 'lazy', system: () => systemPrompt, model: 'm', now: () => 'T',
    });
    systemPrompt = 'SCRATCH-AWARE';       // resolved only after the session opened
    rec!(grown(1), meta(0));
    systemPrompt = 'SWITCHED';
    rec!(grown(2), meta(1));
    const lines = readLines(join(dir, 'lazy.jsonl'));
    expect(lines.map((l) => (l['messages'] as Array<{ content: string }>)[0]!.content))
      .toEqual(['SCRATCH-AWARE', 'SWITCHED']);
  });

  it('writes only the DELTA per turn and marks the schema transition', () => {
    const dir = tmp('tw-delta-');
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'd', system: 'SYS', model: 'm', now: () => 'T' });
    rec!(grown(1), meta(0));
    rec!(grown(2), meta(1));
    rec!(grown(3), meta(2));
    const lines = readLines(join(dir, 'd.jsonl'));
    expect(lines).toHaveLength(3);
    // system + this turn's 2 new messages — never the whole transcript again.
    expect(lines.map((l) => (l['messages'] as unknown[]).length)).toEqual([3, 3, 3]);
    expect(lines.map((l) => l['nativeTrace'])).toEqual([
      { v: 1, shape: 'epoch', epoch: 1, turnIndex: 0, provider: 'test-provider' },
      { v: 1, shape: 'delta', epoch: 1, turnIndex: 1, provider: 'test-provider' },
      { v: 1, shape: 'delta', epoch: 1, turnIndex: 2, provider: 'test-provider' },
    ]);
    // Every line still parses as a TrainingExample (messages + meta), so the
    // existing consumers keep reading it unchanged.
    for (const line of lines) {
      expect(Array.isArray(line['messages'])).toBe(true);
      expect((line['meta'] as { source: string }).source).toBe('native-repl');
    }
  });

  it('trace growth is O(N), not O(N²) — 20 turns cost ~20 deltas, not 210 message copies', () => {
    const dir = tmp('tw-on-');
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'big', system: 'S', model: 'm', now: () => 'T' });
    const TURNS = 20;
    for (let t = 1; t <= TURNS; t++) rec!(grown(t), meta(t - 1));
    const lines = readLines(join(dir, 'big.jsonl'));
    const totalMessages = lines.reduce((sum, l) => sum + (l['messages'] as unknown[]).length, 0);
    // Delta strategy: 1 system + 2 delta messages per line = 3N.
    expect(totalMessages).toBe(3 * TURNS);
    // The quadratic baseline would have been sum(1 + 2t) for t=1..N = N² + 2N.
    expect(totalMessages).toBeLessThan(TURNS * TURNS);
  });

  it('a context-epoch compaction is reported as a new epoch record, never a wrong delta', () => {
    const dir = tmp('tw-epoch-');
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'e', system: 'S', model: 'm', now: () => 'T' });
    rec!(grown(3), meta(0));
    rec!(grown(4), meta(1));
    // session.ts compactForContextEpoch replaced the transcript wholesale.
    const compacted: ProviderMessage[] = [
      { role: 'user', content: 'objective' },
      { role: 'user', content: 'checkpoint' },
    ];
    rec!(compacted, meta(2));
    rec!([...compacted, { role: 'assistant', content: 'after' }], meta(3));
    const lines = readLines(join(dir, 'e.jsonl'));
    expect(lines.map((l) => (l['nativeTrace'] as { shape: string; epoch: number })))
      .toEqual([
        { shape: 'epoch', epoch: 1 },
        { shape: 'delta', epoch: 1 },
        { shape: 'epoch', epoch: 2 },
        { shape: 'delta', epoch: 2 },
      ].map((e, i) => ({ v: 1, shape: e.shape, epoch: e.epoch, turnIndex: i, provider: 'test-provider' })));
    // The epoch record carries the whole replacing transcript, so nothing is lost.
    expect((lines[2]!['messages'] as Array<{ content: string }>).map((m) => m.content))
      .toEqual(['S', 'objective', 'checkpoint']);
  });

  it('skips a write when the turn produced no new messages', () => {
    const dir = tmp('tw-empty-');
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'z', system: 'S', model: 'm', now: () => 'T' });
    const messages = grown(1);
    rec!(messages, meta(0));
    rec!(messages, meta(1));
    expect(readLines(join(dir, 'z.jsonl'))).toHaveLength(1);
  });
});

describe('createDeltaCursor', () => {
  it('emits each message exactly once while the transcript extends', () => {
    const next = createDeltaCursor();
    const seen: string[] = [];
    for (let t = 1; t <= 5; t++) seen.push(...next(grown(t)).messages.map((m) => m.content));
    expect(seen).toEqual(grown(5).map((m) => m.content));
  });

  it('returns defensive copies — a caller cannot mutate the source transcript', () => {
    const next = createDeltaCursor();
    const messages = grown(1);
    const delta = next(messages);
    delta.messages[0]!.content = 'MUTATED';
    expect(messages[0]!.content).toBe('t0-m0');
  });
});

describe('buildLedgerRecorder — usage reaches disk', () => {
  it('appends one ledger row per turn with the turn usage, and totals replay', () => {
    const rootDir = tmp('lr-root-');
    const cwd = tmp('lr-cwd-');
    const record = buildLedgerRecorder({ sessionId: 'led-1', cwd, rootDir, now: () => '2026-08-18T00:00:00.000Z' });
    record(grown(1), meta(0, { usage: { inputTokens: 11, outputTokens: 3 } }));
    record(grown(2), meta(1, { usage: { inputTokens: 7, outputTokens: 5 } }));
    record(grown(3), meta(2, { usage: null }));

    const session = readLedgerSession('led-1', { cwd, rootDir });
    expect(session.turnCount).toBe(3);
    expect(session.lastModel).toBe('test-model');
    expect(session.totals.inputTokens).toBe(18);
    expect(session.totals.outputTokens).toBe(8);
    // Full fidelity: replaying the deltas reconstructs the transcript verbatim.
    expect(session.messages.map((m) => m.content)).toEqual(grown(3).map((m) => m.content));
  });

  it('stores only the delta per row — the ledger is O(N), not O(N²)', () => {
    const rootDir = tmp('lr-o-n-');
    const cwd = tmp('lr-o-n-cwd-');
    const record = buildLedgerRecorder({ sessionId: 'led-2', cwd, rootDir, now: () => '2026-08-18T00:00:00.000Z' });
    const TURNS = 12;
    for (let t = 1; t <= TURNS; t++) record(grown(t), meta(t - 1));
    const session = readLedgerSession('led-2', { cwd, rootDir });
    expect(session.turnCount).toBe(TURNS);
    expect(session.messages).toHaveLength(2 * TURNS);
  });

  it('fails soft — an unwritable root never throws out of the recorder', () => {
    const record = buildLedgerRecorder({
      sessionId: 'led-3',
      cwd: tmp('lr-soft-'),
      rootDir: join(tmp('lr-soft-root-'), 'not-a-dir', 'nested'),
      now: () => '2026-08-18T00:00:00.000Z',
    });
    expect(() => record(grown(1), meta(0))).not.toThrow();
  });
});

describe('composeTurnRecorders — the ledger is never gated on the training-trace flag', () => {
  it('writes the ledger even when the training trace is disabled (buildTurnRecorder → undefined)', () => {
    const rootDir = tmp('cmp-root-');
    const cwd = tmp('cmp-cwd-');
    const traceDir = tmp('cmp-trace-');
    const traceRecorder = buildTurnRecorder({
      enabled: false, dir: traceDir, sessionId: 'off', system: 'S', model: 'm', now: () => 'T',
    });
    expect(traceRecorder).toBeUndefined();
    const recordTurn = composeTurnRecorders(
      buildLedgerRecorder({ sessionId: 'off', cwd, rootDir, now: () => '2026-08-18T00:00:00.000Z' }),
      traceRecorder,
    );
    expect(recordTurn).toBeDefined();
    recordTurn!(grown(1), meta(0, { usage: { inputTokens: 4, outputTokens: 1 } }));

    expect(readLedgerSession('off', { cwd, rootDir }).totals.inputTokens).toBe(4);
    expect(existsSync(join(traceDir, 'off.jsonl'))).toBe(false);   // trace stayed silent
  });

  it('fans one call out to every active recorder', () => {
    const rootDir = tmp('cmp2-root-');
    const cwd = tmp('cmp2-cwd-');
    const traceDir = tmp('cmp2-trace-');
    const recordTurn = composeTurnRecorders(
      buildLedgerRecorder({ sessionId: 'both', cwd, rootDir, now: () => '2026-08-18T00:00:00.000Z' }),
      buildTurnRecorder({ enabled: true, dir: traceDir, sessionId: 'both', system: 'S', model: 'm', now: () => 'T' }),
    );
    recordTurn!(grown(1), meta(0));
    expect(readLedgerSession('both', { cwd, rootDir }).turnCount).toBe(1);
    expect(readLines(join(traceDir, 'both.jsonl'))).toHaveLength(1);
  });

  it('returns undefined when nothing is active', () => {
    expect(composeTurnRecorders(undefined, undefined)).toBeUndefined();
  });
});

// ─── Bridge seams (7089) ────────────────────────────────────────────────────
// tests/cli/native-agent-bridge.test.ts is outside this task's write authority,
// so the two NEW bridge seams are proven here, next to the recorders they feed.

function scripted(scripts: ProviderEvent[][], seen?: ProviderRequest[]): ProviderAdapter {
  let turn = 0;
  return {
    name: 'mock',
    async *send(req: ProviderRequest) {
      seen?.push(req);
      for (const e of (scripts[turn++] ?? [{ type: 'done' }])) yield e;
    },
  };
}

describe('createNativeEngine — recordTurn meta + hydrateTranscript (7089)', () => {
  it('carries the turn usage, live model/provider and turn index into recordTurn', async () => {
    const adapter = scripted([
      [{ type: 'text-delta', text: 'a' }, { type: 'usage', inputTokens: 5, outputTokens: 2 }, { type: 'done' }],
      [{ type: 'text-delta', text: 'b' }, { type: 'usage', inputTokens: 4, outputTokens: 1 }, { type: 'done' }],
    ]);
    const seenMeta: TurnRecordMeta[] = [];
    const stats: Array<{ inputTokens: number; outputTokens: number }> = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'boot-model', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      getModel: () => 'live-model',
      getProvider: () => 'live-provider',
      recordTurn: (_messages, m) => seenMeta.push(m),
    });
    await engine('one', { output: () => {}, onTurnEnd: (s) => stats.push(s) });
    await engine('two', { output: () => {}, onTurnEnd: (s) => stats.push(s) });

    expect(seenMeta).toEqual([
      { usage: { inputTokens: 5, outputTokens: 2 }, model: 'live-model', provider: 'live-provider', turnIndex: 0 },
      { usage: { inputTokens: 4, outputTokens: 1 }, model: 'live-model', provider: 'live-provider', turnIndex: 1 },
    ]);
    // The SAME counters the view rendered — one seam, no drift.
    expect(stats).toEqual(seenMeta.map((m) => m.usage));
  });

  it('falls back to an honest sentinel provider when no resolver is supplied', async () => {
    const adapter = scripted([[{ type: 'done' }]]);
    const seenMeta: TurnRecordMeta[] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      recordTurn: (_messages, m) => seenMeta.push(m),
    });
    await engine('hi', { output: () => {}, onTurnEnd: () => {} });
    expect(seenMeta[0]!.provider).toBe('unknown');
    expect(seenMeta[0]!.model).toBe('m');
  });

  it('the usage → ledger disk chain is end-to-end: engine turn → JSONL row', async () => {
    const rootDir = tmp('e2e-root-');
    const cwd = tmp('e2e-cwd-');
    const adapter = scripted([[{ type: 'text-delta', text: 'yo' }, { type: 'usage', inputTokens: 9, outputTokens: 4 }, { type: 'done' }]]);
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      getProvider: () => 'ledger-provider',
      recordTurn: buildLedgerRecorder({ sessionId: 'e2e', cwd, rootDir, now: () => '2026-08-18T00:00:00.000Z' }),
    });
    await engine('hello', { output: () => {}, onTurnEnd: () => {} });

    const session = readLedgerSession('e2e', { cwd, rootDir });
    expect(session.turnCount).toBe(1);
    expect(session.totals).toEqual({ inputTokens: 9, outputTokens: 4, cacheReadTokens: 0, cacheCreationTokens: 0 });
    expect(session.messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'yo' },
    ]);
  });

  it('hydrateTranscript loads a prior transcript VERBATIM ahead of the live turn', async () => {
    const requests: ProviderRequest[] = [];
    const adapter = scripted([[{ type: 'text-delta', text: 'ok' }, { type: 'done' }]], requests);
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    expect(engine.hydrateTranscript).toBeDefined();
    const prior: ProviderMessage[] = [
      { role: 'user', content: 'previous question' },
      { role: 'assistant', content: 'previous answer' },
    ];
    engine.hydrateTranscript!(prior);
    await engine('next question', { output: () => {}, onTurnEnd: () => {} });

    expect(requests[0]!.messages.map((m) => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'previous question' },
      { role: 'assistant', content: 'previous answer' },
      { role: 'user', content: 'next question' },
    ]);
  });

  it('hydrated history is not re-recorded — only this session\'s own turn reaches the recorder', async () => {
    const adapter = scripted([[{ type: 'text-delta', text: 'ok' }, { type: 'done' }]]);
    const recorded: ProviderMessage[][] = [];
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
      recordTurn: (messages) => recorded.push(messages),
    });
    engine.hydrateTranscript!([{ role: 'user', content: 'already on disk' }]);
    await engine('fresh', { output: () => {}, onTurnEnd: () => {} });
    expect(recorded[0]!.map((m) => m.content)).toEqual(['fresh', 'ok']);
  });

  it('an empty hydration leaves the request untouched', async () => {
    const requests: ProviderRequest[] = [];
    const adapter = scripted([[{ type: 'done' }]], requests);
    const engine = createNativeEngine({
      adapter, registry: buildNativeToolRegistry({ cwd: () => tmpdir() }), cwd: tmpdir(), model: 'm', lang: 'en',
      confirm: async () => 'y', toolSink: () => {},
    });
    engine.hydrateTranscript!([]);
    await engine('solo', { output: () => {}, onTurnEnd: () => {} });
    expect(requests[0]!.messages.map((m) => m.content)).toEqual(['solo']);
  });
});

// WIRE-019: physically merged from tests/cli/trn2-repl-trace-wire.test.ts.
{
const dirs: string[] = [];

afterEach(() => { for (const d of dirs.splice(0))
    rmSync(d, { recursive: true, force: true }); });

describe('buildTurnRecorder — TRN-2 redaction + fail-soft', () => {
    it('redacts a secret found in message content before writing the trace', () => {
        const dir = mkdtempSync(join(tmpdir(), 'trn2-red-'));
        dirs.push(dir);
        const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess-red', system: 'SYS', model: 'm', now: () => 'T' });
        expect(rec).toBeDefined();
        const secret = `sk-${'a'.repeat(24)}`;
        rec!([{ role: 'user', content: `my key is ${secret}` }]);
        const raw = readFileSync(join(dir, 'sess-red.jsonl'), 'utf-8');
        expect(raw).not.toContain(secret);
        expect(raw).toContain('[REDACTED]');
    });
    it('redacts a secret found inside tool-call arguments before writing the trace', () => {
        const dir = mkdtempSync(join(tmpdir(), 'trn2-red-tc-'));
        dirs.push(dir);
        const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess-tc', system: 'SYS', model: 'm', now: () => 'T' });
        const secret = `ghp_${'B'.repeat(24)}`;
        rec!([{ role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'run', args: { token: secret } }] }]);
        const raw = readFileSync(join(dir, 'sess-tc.jsonl'), 'utf-8');
        expect(raw).not.toContain(secret);
        expect(raw).toContain('[REDACTED]');
    });
    it('leaves ordinary (non-sensitive) content untouched', () => {
        const dir = mkdtempSync(join(tmpdir(), 'trn2-plain-'));
        dirs.push(dir);
        const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess-plain', system: 'SYS', model: 'm', now: () => 'T' });
        rec!([{ role: 'user', content: 'hello there' }, { role: 'assistant', content: 'general kenobi' }]);
        const ex = JSON.parse(readFileSync(join(dir, 'sess-plain.jsonl'), 'utf-8').trim());
        expect(ex.messages[1].content).toBe('hello there');
        expect(ex.messages[2].content).toBe('general kenobi');
    });
    it('fails soft — a write error inside the recorder never throws out of the closure', () => {
        const tmp = mkdtempSync(join(tmpdir(), 'trn2-blk-'));
        dirs.push(tmp);
        const blockerFile = join(tmp, 'not-a-dir');
        writeFileSync(blockerFile, 'x'); // a FILE, not a dir — mkdirSync(dirname(...)) below hits ENOTDIR
        const badDir = join(blockerFile, 'nested');
        const rec = buildTurnRecorder({ enabled: true, dir: badDir, sessionId: 's', system: 'SYS', model: 'm', now: () => 'T' });
        expect(rec).toBeDefined();
        expect(() => rec!([{ role: 'user', content: 'hi' }])).not.toThrow();
        expect(existsSync(join(badDir, 's.jsonl'))).toBe(false);
    });
    it('redacts a secret that first appears in a later DELTA record (7089 delta strategy)', () => {
        const dir = mkdtempSync(join(tmpdir(), 'trn2-red-delta-'));
        dirs.push(dir);
        const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess-delta', system: 'SYS', model: 'm', now: () => 'T' });
        const secret = `sk-${'c'.repeat(24)}`;
        const turn1 = [{ role: 'user' as const, content: 'harmless' }];
        rec!(turn1);
        rec!([...turn1, { role: 'assistant', content: `here: ${secret}` }]);
        const raw = readFileSync(join(dir, 'sess-delta.jsonl'), 'utf-8');
        expect(raw).not.toContain(secret);
        expect(raw).toContain('[REDACTED]');
        // The second line is a delta: it carries the system message + the ONE new
        // message, never a re-copy of turn 1 (the O(n²) that 7089 killed).
        const lines = raw.split('\n').filter((l) => l.trim().length > 0);
        expect(lines).toHaveLength(2);
        const second = JSON.parse(lines[1]!);
        expect(second.messages).toHaveLength(2);
        expect(second.nativeTrace).toMatchObject({ v: 1, shape: 'delta' });
    });
    it('flag OFF stays byte-identical — no recorder, no writes', () => {
        const dir = mkdtempSync(join(tmpdir(), 'trn2-off-'));
        dirs.push(dir);
        const rec = buildTurnRecorder({ enabled: false, dir, sessionId: 'sess-off', system: 'SYS', model: 'm', now: () => 'T' });
        expect(rec).toBeUndefined();
        expect(existsSync(join(dir, 'sess-off.jsonl'))).toBe(false);
    });
});
}
