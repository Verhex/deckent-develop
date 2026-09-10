// tests/agent/checkpoint-trail.test.ts
// 7110 — unit contract of the host-derived checkpoint trail: canonical call
// identity, bounded recorder, replay invalidation, host stamping of a model
// checkpoint, and the v1/v2 payload reader on the real scratch store.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  boundLastAssistantText,
  canonicalToolArgs,
  checkpointCompactionText,
  DEFAULT_CHECKPOINT_TRAIL_LABELS,
  hostStampCheckpoint,
  renderToolTrail,
  resolveTrailEntryBound,
  resolveTrailOpeningBudget,
  toolCallDigest,
  ToolTrailRecorder,
  TRAIL_LAST_ASSISTANT_CHARS,
  TRAIL_OPENING_FALLBACK_TOKENS,
} from '../../src/agent/checkpoint-trail.js';
import { estimateTokens } from '../../src/agent/context-budget.js';
import {
  openScratchStore,
  parseScratchCheckpointPayload,
  SCRATCH_CHECKPOINT_SCHEMA_VERSION,
  type CheckpointToolTrailEntry,
  type ScratchCheckpointPayload,
} from '../../src/agent/scratch-checkpoint.js';
import { DEFAULT_NATIVE_AGENT_BUDGET, resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import type { ContentWriter } from '../../src/agent/tool-result-broker.js';

const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function tmp(): string { const dir = mkdtempSync(join(tmpdir(), '7110-trail-')); dirs.push(dir); return dir; }
function memWriter(): { writer: ContentWriter; written: Map<string, Buffer> } {
  const written = new Map<string, Buffer>();
  return { written, writer: { write(bytes) { const digest = createHash('sha256').update(bytes).digest('hex'); written.set(digest, bytes); return { path: `mem://${digest}`, sha256: digest }; } } };
}
const entry = (n: number): CheckpointToolTrailEntry => ({
  tool: `tool-${n}`, argsDigest: sha(`args-${n}`), argsExcerpt: `{"n":${n}}`, resultRef: sha(`result-${n}`),
  resultBytes: 10, resultExcerpt: `result-${n}`, ok: n % 2 === 0, fullContentRef: null,
});
const v1 = (): ScratchCheckpointPayload => ({
  schemaVersion: 1, objective: 'o', findings: [], evidenceRefs: [], decisions: [], unresolved: [], nextActions: [],
  inspectedAreas: [], toolResultDigests: [], cumulativeCounters: {}, createdAt: '2026-09-09T00:00:00.000Z',
});

describe('canonical call identity', () => {
  it('sorts keys at every nesting level and ignores undefined members', () => {
    expect(canonicalToolArgs({ b: 1, a: { z: [3, { y: 2, x: 1 }], w: null }, u: undefined }))
      .toBe('{"a":{"w":null,"z":[3,{"x":1,"y":2}]},"b":1}');
  });
  it('digests are order-independent yet distinguish nested differences (a top-level-only replacer would not)', () => {
    expect(toolCallDigest('t', { path: 'p', range: { offset: 1, limit: 2 } }))
      .toBe(toolCallDigest('t', { range: { limit: 2, offset: 1 }, path: 'p' }));
    expect(toolCallDigest('t', { path: 'p', range: { offset: 1, limit: 2 } }))
      .not.toBe(toolCallDigest('t', { path: 'p', range: { offset: 2, limit: 1 } }));
    expect(toolCallDigest('t1', {})).not.toBe(toolCallDigest('t2', {}));
  });
  it('B1: the digest separator is a source-level escape — the module is a text file with no raw NUL byte', () => {
    const source = readFileSync(new URL('../../src/agent/checkpoint-trail.ts', import.meta.url));
    expect(source.includes(0)).toBe(false);
    expect(source.toString('utf8')).toContain(".update('\\u0000')");
  });
});

describe('ToolTrailRecorder', () => {
  it('records completed calls with digest refs, bounds retention to the newest N and persists the rendered result', () => {
    const { writer, written } = memWriter();
    const recorder = new ToolTrailRecorder(2, writer);
    for (let n = 1; n <= 3; n++) {
      recorder.propose(`c${n}`, 'read', { n });
      recorder.complete(`c${n}`, true, `out-${n}\nsecond line`);
    }
    expect(recorder.size).toBe(2);
    expect(recorder.entries().map((e) => e.argsExcerpt)).toEqual(['{"n":2}', '{"n":3}']);
    const last = recorder.entries()[1]!;
    expect(last.resultRef).toBe(sha('out-3\nsecond line'));
    expect(written.has(last.resultRef!)).toBe(true);
    expect(last.resultExcerpt).toBe('out-3');
    expect(recorder.find(toolCallDigest('read', { n: 1 }))).toBeUndefined();
    expect(recorder.find(toolCallDigest('read', { n: 3 }))?.output).toBe('out-3\nsecond line');
    // Payload view never leaks the in-memory output.
    expect(Object.keys(recorder.entries()[0]!)).not.toContain('output');
    // The full trail persists to the store by digest (B3: on disk, cited from the opening).
    const ref = recorder.persistTrail();
    expect(ref).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(written.get(ref!)!.toString())).toEqual(recorder.entries());
    expect(new ToolTrailRecorder(4).persistTrail()).toBeNull();
  });

  it('downgrades ok from protocol markers, parses the full-content digest, and survives a failing store honestly', () => {
    const failing: ContentWriter = { write() { throw new Error('disk full'); } };
    const recorder = new ToolTrailRecorder(8, failing);
    const full = sha('the full bytes');
    recorder.propose('c1', 'read', {});
    const record = recorder.complete('c1', true, `preview…\n[deckent] tool-result truncated: 999 bytes (~250 tokens), sha256:${full}; full content at /x/y`);
    expect(record?.resultRef).toBeNull();
    expect(record?.fullContentRef).toBe(full);
    recorder.propose('c2', 'bash', {});
    expect(recorder.complete('c2', true, 'boom\n[exit 2]')?.ok).toBe(false);
    recorder.propose('c3', 'mcp', {});
    expect(recorder.complete('c3', true, '[mcp-error] nope')?.ok).toBe(false);
    expect(recorder.complete('never-proposed', true, 'x')).toBeUndefined();
  });

  it('invalidateReplay keeps history but drops served outputs; discard drops a proposal; reset clears all', () => {
    const recorder = new ToolTrailRecorder(8);
    recorder.propose('c1', 'read', { p: 1 });
    recorder.complete('c1', true, 'r1');
    recorder.invalidateReplay();
    expect(recorder.entries()).toHaveLength(1);
    expect(recorder.find(toolCallDigest('read', { p: 1 }))?.output).toBeNull();
    recorder.propose('c2', 'read', { p: 2 });
    recorder.discard('c2');
    expect(recorder.complete('c2', true, 'r2')).toBeUndefined();
    recorder.reset();
    expect(recorder.size).toBe(0);
  });

  it('bound resolution clamps nonsense into a sane non-zero range and the config default is 64', () => {
    expect(resolveTrailEntryBound(undefined)).toBe(1);
    expect(resolveTrailEntryBound(0)).toBe(1);
    expect(resolveTrailEntryBound(10 ** 9)).toBe(4096);
    expect(resolveTrailEntryBound(64)).toBe(64);
    expect(DEFAULT_NATIVE_AGENT_BUDGET.checkpointReplayCacheEntries).toBe(64);
    expect(resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { checkpointReplayCacheEntries: 8 } } }).checkpointReplayCacheEntries).toBe(8);
    expect(() => resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { checkpointReplayCacheEntries: 0 } } })).toThrow(/positive safe integer/);
  });
});

describe('renderToolTrail', () => {
  const wide = { budgetTokens: 100_000, trailRef: null };
  it('is empty for an empty trail and deterministic otherwise, with labels injected and the tool name substituted', () => {
    expect(renderToolTrail([], '', DEFAULT_CHECKPOINT_TRAIL_LABELS, 'deckent_read_content_ref', wide)).toBe('');
    const labels = { ...DEFAULT_CHECKPOINT_TRAIL_LABELS, heading: 'H', readHint: 'read with {tool}', statusOk: 'OK', statusFailed: 'KO', lastAssistantHeading: 'LA' };
    const once = renderToolTrail([entry(1), entry(2)], 'last words', labels, 'deckent_read_content_ref', wide);
    expect(once).toBe(renderToolTrail([entry(1), entry(2)], 'last words', labels, 'deckent_read_content_ref', wide));
    expect(once).toContain('[checkpoint-trail] H\n1. tool-1 {"n":1} → KO · 10 bytes · result sha256:');
    expect(once).toContain('2. tool-2 {"n":2} → OK');
    expect(once).toContain('read with deckent_read_content_ref');
    expect(once).toContain('[checkpoint-last-assistant] LA\nlast words');
    expect(once).not.toContain('{tool}');
    expect(once).not.toContain('omitted');
  });
  it('B3: keeps the NEWEST entries inside the token budget and names the omitted count + full-trail digest', () => {
    const entries = Array.from({ length: 64 }, (_, n) => ({ ...entry(n + 1), fullContentRef: sha(`full-${n}`), resultExcerpt: 'x'.repeat(160), argsExcerpt: JSON.stringify({ path: `docs/f-${n}.md`, offset: n * 200, limit: 200 }) }));
    const ref = sha('the-full-trail');
    const rendered = renderToolTrail(entries, 'assistant said '.repeat(200), DEFAULT_CHECKPOINT_TRAIL_LABELS, 'deckent_read_content_ref', { budgetTokens: 400, trailRef: ref });
    expect(estimateTokens(rendered)).toBeLessThanOrEqual(400 + 8);
    expect(rendered).toContain('64. tool-64 ');
    expect(rendered).not.toContain('\n1. tool-1 ');
    const omitted = /(\d+) earlier entries omitted; the full trail is sha256:([a-f0-9]{64})/.exec(rendered);
    expect(omitted).not.toBeNull();
    expect(Number(omitted![1])).toBeGreaterThan(0);
    expect(omitted![2]).toBe(ref);
    expect(rendered).toContain('readable with deckent_read_content_ref');
    // At most ONE digest per line (never 3×64 hex per entry), excerpts bounded.
    for (const line of rendered.split('\n').filter((l) => /^\d+\. tool-/.test(l))) {
      expect((line.match(/[a-f0-9]{64}/g) ?? []).length).toBeLessThanOrEqual(1);
      expect(line.length).toBeLessThan(420);
    }
    // Full trail digest is honest even when unavailable.
    expect(renderToolTrail(entries, '', DEFAULT_CHECKPOINT_TRAIL_LABELS, 't', { budgetTokens: 120, trailRef: null })).toContain('sha256:unavailable');
  });
  it('B3: the opening budget is window-derived, capped at half the transcript reserve, with a fixed fallback', () => {
    expect(resolveTrailOpeningBudget({ windowTokens: 32_768, trailShare: 0.03, transcriptReserveShare: 0.10 })).toBe(983);
    expect(resolveTrailOpeningBudget({ windowTokens: 32_768, trailShare: 0.30, transcriptReserveShare: 0.10 })).toBe(1638);
    expect(resolveTrailOpeningBudget({ windowTokens: undefined, trailShare: 0.03, transcriptReserveShare: 0.10 })).toBe(TRAIL_OPENING_FALLBACK_TOKENS);
    expect(DEFAULT_NATIVE_AGENT_BUDGET.checkpointTrailShareOfContext).toBe(0.03);
    expect(() => resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { checkpointTrailShareOfContext: 1 } } })).toThrow(/ratio strictly between 0 and 1/);
  });
  it('B3: the compaction text is the summary projection — no toolTrail / lastAssistantText JSON, counts + ref instead', () => {
    const payload: ScratchCheckpointPayload = { ...v1(), schemaVersion: 2, toolTrail: [entry(1), entry(2)], lastAssistantText: 'tail', toolTrailRef: sha('t') };
    const text = JSON.parse(checkpointCompactionText(payload));
    expect(text.toolTrail).toBeUndefined();
    expect(text.lastAssistantText).toBeUndefined();
    expect(text).toMatchObject({ schemaVersion: 2, objective: 'o', toolTrailEntries: 2, lastAssistantChars: 4, toolTrailRef: sha('t') });
  });
  it('bounds the last assistant text with an honest digest marker', () => {
    const long = 'a'.repeat(TRAIL_LAST_ASSISTANT_CHARS + 500);
    const bounded = boundLastAssistantText(long);
    expect(bounded.length).toBeLessThan(long.length);
    expect(bounded).toMatch(/…\[bounded: \d+ chars, sha256:[a-f0-9]{16}\]$/);
    expect(boundLastAssistantText('  short  ')).toBe('short');
  });
});

describe('hostStampCheckpoint', () => {
  it('retains host-verified reference evidence even when the model omits it', () => {
    const ref = `sha256:${sha('source')}`;
    const stamped = hostStampCheckpoint({ objective: 'continue', findings: [], evidenceRefs: [], decisions: [], unresolved: [], nextActions: [], inspectedAreas: [], toolResultDigests: [], cumulativeCounters: {} },
      { objective: 'host', toolTrail: [], toolTrailRef: null, lastAssistantText: '', createdAt: new Date().toISOString(), counters: {}, evidenceRefs: [ref] });
    expect(stamped?.evidenceRefs).toEqual([ref]);
  });

  const host = { objective: 'host objective', toolTrail: [entry(1), entry(2)], toolTrailRef: sha('trail'), lastAssistantText: 'la', createdAt: '2026-09-09T12:00:00.000Z', counters: { toolCalls: 2 } };
  it('host-stamps createdAt, installs the host trail over any model-authored one and merges counters (host wins)', () => {
    const stamped = hostStampCheckpoint({
      schemaVersion: 1, objective: 'model', findings: ['f'], evidenceRefs: [], decisions: [], unresolved: [], nextActions: [],
      inspectedAreas: [], toolResultDigests: [], createdAt: '2026-09-06T00:00:00Z',
      toolTrail: [entry(9)], lastAssistantText: 'model-authored', cumulativeCounters: { toolCalls: 99, modelSays: 1 },
    }, host);
    expect(stamped).toBeDefined();
    expect(stamped!.schemaVersion).toBe(SCRATCH_CHECKPOINT_SCHEMA_VERSION);
    expect(stamped!.createdAt).toBe(host.createdAt);
    expect(stamped!.toolTrail).toEqual(host.toolTrail);
    expect(stamped!.toolTrailRef).toBe(sha('trail'));
    expect(stamped!.lastAssistantText).toBe('la');
    expect(stamped!.findings).toEqual(['f']);
    expect(stamped!.decisions).toEqual([]);
    expect(stamped!.objective).toBe('model');
    expect(stamped!.cumulativeCounters).toEqual({ modelSays: 1, toolCalls: 2 });
  });
  it('falls back to the host objective on a blank one and rejects any malformed or missing summary field (fail-closed)', () => {
    const complete = { objective: 'o', findings: [], evidenceRefs: [], decisions: [], unresolved: [], nextActions: [], inspectedAreas: [], toolResultDigests: [], cumulativeCounters: {} };
    expect(hostStampCheckpoint(complete, host)).toBeDefined();
    expect(hostStampCheckpoint({ ...complete, objective: '   ' }, host)?.objective).toBe('host objective');
    expect(hostStampCheckpoint({ ...complete, objective: 7 }, host)).toBeUndefined();
    expect(hostStampCheckpoint({ ...complete, findings: 'not-an-array' }, host)).toBeUndefined();
    expect(hostStampCheckpoint({ ...complete, findings: [1] }, host)).toBeUndefined();
    const { nextActions: _missing, ...withoutArray } = complete;
    expect(hostStampCheckpoint(withoutArray, host)).toBeUndefined();
    expect(hostStampCheckpoint({ ...complete, cumulativeCounters: { n: -1 } }, host)).toBeUndefined();
    expect(hostStampCheckpoint({ ...complete, cumulativeCounters: [] }, host)).toBeUndefined();
    expect(hostStampCheckpoint({ ...complete, cumulativeCounters: undefined }, host)).toBeUndefined();
    expect(hostStampCheckpoint({ schemaVersion: 1 }, host)).toBeUndefined();
    expect(hostStampCheckpoint('prose', host)).toBeUndefined();
    expect(hostStampCheckpoint(null, host)).toBeUndefined();
  });
});

describe('checkpoint payload schema v2 (backward-compatible reader)', () => {
  it('accepts v1, requires a well-formed trail for v2 and rejects half-migrated shapes', () => {
    expect(parseScratchCheckpointPayload(v1())).toBeDefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 2 })).toBeUndefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 2, toolTrail: [], lastAssistantText: '' })).toBeDefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 2, toolTrail: [entry(1)], lastAssistantText: 'x' })).toBeDefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 2, toolTrail: [{ ...entry(1), resultRef: '/tmp/path' }], lastAssistantText: 'x' })).toBeUndefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 2, toolTrail: [{ ...entry(1), ok: 'yes' }], lastAssistantText: 'x' })).toBeUndefined();
    expect(parseScratchCheckpointPayload({ ...v1(), toolTrail: [] })).toBeUndefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 2, toolTrail: [], lastAssistantText: '', toolTrailRef: null })).toBeDefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 2, toolTrail: [], lastAssistantText: '', toolTrailRef: '/tmp/x' })).toBeUndefined();
    expect(parseScratchCheckpointPayload({ ...v1(), toolTrailRef: null })).toBeUndefined();
    expect(parseScratchCheckpointPayload({ ...v1(), schemaVersion: 3 })).toBeUndefined();
  });
  it('round-trips a v2 payload through the real scratch store and still reads a v1 lineage', () => {
    const store = openScratchStore({ tenantId: 't', projectId: 'p', sessionId: 's', slug: 'slug' }, { baseDir: tmp() });
    try {
      store.writeCheckpoint(v1());
      expect(store.readLatestCheckpoint()).toMatchObject({ status: 'ok', payload: { schemaVersion: 1 } });
      const v2: ScratchCheckpointPayload = { ...v1(), schemaVersion: 2, toolTrail: [entry(1)], lastAssistantText: 'tail' };
      store.writeCheckpoint(v2);
      const latest = store.readLatestCheckpoint();
      expect(latest.status).toBe('ok');
      if (latest.status === 'ok') expect(latest.payload).toEqual(v2);
      expect(() => store.writeCheckpoint({ ...v2, toolTrail: [{ ...entry(1), argsDigest: 'nope' }] })).toThrow('invalid checkpoint payload');
    } finally { store.close({ policy: 'delete' }); }
  });
});
