// 7113-E-BOUNDED-LENGTH-RECOVERY — a provider-truncated map part is subdivided,
// not repeated at the same scale.
//
// Diagnostic rerun (attempt 17178e06b510, 2026-09-10T01:5xZ): both attempts of
// one part recorded `stream-non-stop` with `stopReason: 'length'` and output
// exactly at the 2048 ceiling, spending 24 621 input tokens to produce nothing.
// These tests pin the new behaviour and every bound around it.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReferenceDigest } from '../../src/agent/reference-digest-runner.js';
import { digestReferenceValue } from '../../src/agent/reference-digest-validation.js';
import { buildReferenceOutline } from '../../src/agent/reference-outline.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { openScratchStore } from '../../src/agent/scratch-checkpoint.js';
import { referenceInvalidReason, partitionDepth, partitionDepthKey } from '../../src/agent/reference-digest-runner-types.js';
import type { ReferenceDigestInput, DigestCitation, DigestRequestRecord } from '../../src/agent/reference-digest-runner-types.js';
import type { ReferenceDigestProgress } from '../../src/agent/reference-digest-types.js';
import type { ProviderRequest, ProviderEvent, ProviderUsage } from '../../src/agent/provider-tooluse/types.js';

const hash = (x: string | Buffer): string => createHash('sha256').update(x).digest('hex');
/** Non-repeating body: two different byte ranges must never be byte-identical,
 *  otherwise a uniqueness assertion would fail on the fixture, not the code. */
const body = (sentences: number): string =>
  Array.from({ length: sentences }, (_, i) => `Sentence ${i} about the plan and its risk column.`).join('\n');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const descriptor = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true, provenance: 'configured' as const };

function payloadFor(req: ProviderRequest) {
  const data = JSON.parse(req.messages[0]!.content).data;
  const coverage: DigestCitation[] = data.sections ?? data.children.flatMap((c: { coverage: DigestCitation[] }) => c.coverage);
  return { claims: [{ text: 'Source fact.', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['May omit detail.'] };
}
const sourceOf = (req: ProviderRequest): string => JSON.parse(req.messages[0]!.content).data.source ?? '';

async function fixture(text: string, over: Partial<ReferenceDigestInput['policy']> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'reference-length-')); roots.push(root);
  const scratch = openScratchStore({ tenantId: 't', projectId: 'p', sessionId: 's' }, { baseDir: root });
  const store = createSessionToolContentStore({ dir: join(scratch.info.root, 'content') });
  const bytes = Buffer.from(text);
  const scope = { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') };
  const snapshot = {
    metadata: { schemaVersion: 1 as const, scope, sourceAuthority: 'reference-data' as const, sourceDigest: hash(bytes), bytes: bytes.length, encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture' },
    async *stream() { yield bytes; },
  };
  const outline = await buildReferenceOutline(snapshot, { maxPartBytes: 65_536, maxNodes: 40, maxSourceBytes: 1_000_000 });
  const calls: ProviderRequest[] = [];
  const settled = new Map<string, ProviderUsage>();
  const reserved: string[] = [];
  const progress: ReferenceDigestProgress[] = [];
  let respond: (req: ProviderRequest) => AsyncIterable<ProviderEvent> = async function* (req) {
    yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
    yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
    yield { type: 'done', stopReason: 'stop' };
  };
  const input: ReferenceDigestInput = {
    snapshot, outline, scratch: scratch.info, contentStore: store,
    identity: { ...scope, schemaVersion: 1, partitionVersion: 1, sourceDigest: hash(bytes), descriptorDigest: digestReferenceValue(descriptor) },
    context: { provider: 'fixture', model: 'fixture', contextWindowTokens: 32000, contextProvenance: 'configured-narrowing' },
    instruction: 'Summarize the reference.',
    policy: { maxSourceBytes: 1_000_000, maxRequests: 40, maxDepth: 8, maxWallTimeMs: 20_000, maxTotalTokens: 200_000,
      maxMapOutputTokens: 512, maxReduceOutputTokens: 512, maxResponseBytes: 8192, maxItems: 30, maxTextBytes: 2000,
      finalAnswerReserveTokens: 1024, contextSafetyReserveTokens: 100, concurrencyCap: 1, providerConcurrency: 1, tenantConcurrency: 1, measurementTimeoutMs: 1000, ...over },
    ledger: { async reserve(id) { reserved.push(id); return true; }, async settle(id, usage) { settled.set(id, usage); } },
    adapter: {
      name: 'fixture', reasoningControl: () => descriptor,
      structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
      requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture-exact' }; } },
      async *send(req) { calls.push(req); yield* respond(req); },
    },
    onDigestProgress: (p) => { progress.push(p); },
  };
  return { input, calls, settled, reserved, progress, scratchRoot: scratch.info.root, setRespond(fn: typeof respond) { respond = fn; } };
}

async function journal(scratchRoot: string): Promise<{ requests: DigestRequestRecord[]; partitions: Record<string, DigestCitation[]> }> {
  const dir = (await readdir(scratchRoot)).find((name) => name.startsWith('reference-'))!;
  const entries = (await readdir(join(scratchRoot, dir))).sort();
  const state = JSON.parse(await readFile(join(scratchRoot, dir, entries.at(-1)!), 'utf8')).state as { requests: Record<string, DigestRequestRecord>; mapPartitions: Record<string, DigestCitation[]>; mapPartitionDepths?: Record<string, number> };
  return { requests: Object.values(state.requests), partitions: state.mapPartitions, depths: state.mapPartitionDepths };
}

describe('7113-E bounded length recovery', () => {
  it('splits the truncated part and succeeds on the smaller children (fail before, split success after)', async () => {
    const f = await fixture(body(220));
    let truncateOnce = true;
    f.setRespond(async function* (req) {
      const truncated = truncateOnce && sourceOf(req).length > 4000;
      if (truncated) truncateOnce = false;
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: truncated ? 512 : 50 };
      yield { type: 'done', stopReason: truncated ? 'length' : 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('ANSWERING');
    // Full coverage with no hole and no overlap, from the split children.
    expect(result.missingRanges).toEqual([]);
    const covered = result.coveredRanges.slice().sort((a, b) => a.byteStart - b.byteStart);
    for (let i = 1; i < covered.length; i++) expect(covered[i]!.byteStart).toBe(covered[i - 1]!.byteEnd);
    // The retry was NOT a repeat: no two provider calls carried the same source.
    const sources = f.calls.map(sourceOf);
    expect(new Set(sources).size).toBe(sources.length);
    // The durable plan records the split, so a replay runs the same children.
    const { requests, partitions } = await journal(f.scratchRoot);
    const parts = Object.values(partitions).flat();
    expect(parts.length).toBeGreaterThan(1);
    const invalid = requests.filter((r) => r.status === 'invalid');
    expect(invalid).toHaveLength(1);
    expect(referenceInvalidReason(invalid[0]!)).toBe('stream-non-stop');
    expect(invalid[0]!.diagnostics!.stopReason).toBe('length');
  });

  it('keeps accounting exactly once: the truncated attempt is reserved, settled and never lost', async () => {
    const f = await fixture(body(220));
    let truncateOnce = true;
    f.setRespond(async function* (req) {
      const truncated = truncateOnce && sourceOf(req).length > 4000;
      if (truncated) truncateOnce = false;
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: truncated ? 512 : 50 };
      yield { type: 'done', stopReason: truncated ? 'length' : 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    const { requests } = await journal(f.scratchRoot);
    expect(f.reserved.length).toBe(requests.length);
    expect(new Set(f.reserved).size).toBe(f.reserved.length);
    expect(f.settled.size).toBe(requests.length);
    const total = requests.reduce((sum, r) => ({ i: sum.i + (r.usage?.inputTokens ?? 0), o: sum.o + (r.usage?.outputTokens ?? 0) }), { i: 0, o: 0 });
    expect(result.usage).toEqual({ inputTokens: total.i, outputTokens: total.o });
    // The failed attempt's spend is part of the total, not silently dropped.
    expect(total.o).toBeGreaterThanOrEqual(512);
  });

  it('an indivisible range ends honestly instead of splitting forever', async () => {
    const f = await fixture('x'.repeat(64), { maxDepth: 2 });
    f.setRespond(async function* (req) {
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'length' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.failure).toBe('REFERENCE_OUTPUT_INVALID');
    expect(result.phase).toBe('FAILED');
    expect(result.coveredRanges).toEqual([]);
    // Bounded by the SAME maxDepth ceiling: a handful of calls, not a spiral.
    expect(f.calls.length).toBeLessThanOrEqual(8);
  });

  it('the request budget still terminates the program: no growth to fit the splits', async () => {
    const f = await fixture(body(220), { maxRequests: 3 });
    f.setRespond(async function* (req) {
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'length' };
    });
    const result = await runReferenceDigest(f.input);
    expect(['FAILED', 'PARTIAL']).toContain(result.phase);
    expect(f.calls.length).toBeLessThanOrEqual(3);
  });

  it('a restart replays the recorded split, not the original oversized part', async () => {
    const f = await fixture(body(220));
    let truncateOnce = true;
    f.setRespond(async function* (req) {
      const truncated = truncateOnce && sourceOf(req).length > 4000;
      if (truncated) truncateOnce = false;
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: truncated ? 512 : 50 };
      yield { type: 'done', stopReason: truncated ? 'length' : 'stop' };
    });
    await runReferenceDigest(f.input);
    const first = f.calls.length;
    const resumed = await runReferenceDigest(f.input);
    expect(resumed.phase).toBe('ANSWERING');
    // Completed children are reused: the resume makes no new provider call.
    expect(f.calls.length).toBe(first);
    const { partitions } = await journal(f.scratchRoot);
    const parts = Object.values(partitions).flat().sort((a, b) => a.byteStart - b.byteStart);
    for (let i = 1; i < parts.length; i++) expect(parts[i]!.byteStart).toBe(parts[i - 1]!.byteEnd);
  });

  it('only a confirmed length truncation splits: a schema fault keeps the bounded retry', async () => {
    const f = await fixture(body(110));
    f.setRespond(async function* () {
      yield { type: 'text-delta', text: 'not json' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 20 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.failure).toBe('REFERENCE_OUTPUT_INVALID');
    // Two attempts of the SAME part — the historical bounded retry, unchanged.
    expect(f.calls).toHaveLength(2);
    expect(sourceOf(f.calls[0]!)).toBe(sourceOf(f.calls[1]!));
  });

  it('progress counts every issued child request, not only the verified ones', async () => {
    const f = await fixture(body(110));
    f.setRespond(async function* () {
      yield { type: 'text-delta', text: 'not json' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 20 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input);
    const { requests } = await journal(f.scratchRoot);
    const issuedMaps = requests.filter((r) => r.purpose === 'reference-map').length;
    expect(issuedMaps).toBe(2);
    expect(requests.every((r) => r.status === 'invalid')).toBe(true);
    // The real run reported `0 map · 0 reduce` here while two requests were
    // settled; spend is spend, whatever the outcome.
    const last = f.progress.at(-1)!;
    expect(last.requests.map).toBe(issuedMaps);
    expect(last.requests.reduce).toBe(0);
    // Coverage stays honest: nothing was verified.
    expect(last.coveredBytes).toBe(0);
    expect(last.sections!.covered).toBe(0);
  });
});

describe('7113-E revision — the split ceiling spans restarts', () => {
  it('persists the split depth so a resume cannot halve past maxDepth', async () => {
    // Astra repro 2026-09-10T02:07Z: 64 B / maxDepth 2 reached 16 B on the first
    // run and 4 B on the second, because the durable plan recorded ranges only
    // and the replay re-entered at depth 0.
    const f = await fixture('x'.repeat(64), { maxDepth: 2 });
    f.setRespond(async function* (req) {
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'length' };
    });
    await runReferenceDigest(f.input);
    const first = await journal(f.scratchRoot);
    const smallest = (state: Awaited<ReturnType<typeof journal>>): number =>
      Math.min(...Object.values(state.partitions).flat().map((r) => r.byteEnd - r.byteStart));
    expect(smallest(first)).toBeGreaterThanOrEqual(16);
    await runReferenceDigest(f.input);
    const second = await journal(f.scratchRoot);
    // The ceiling holds across the restart: no deeper split appears.
    expect(smallest(second)).toBe(smallest(first));
    expect(smallest(second)).toBeGreaterThanOrEqual(16);
    // And the depth is actually durable, not re-derived by luck.
    expect(second.depths).toBeDefined();
    expect(Object.values(second.depths!).every((d) => d <= 2)).toBe(true);
  });

  it('derives an honest depth for a journal written before the field existed', () => {
    // A quarter-sized part proves two halvings; nothing is assumed to be zero.
    expect(partitionDepth({ sectionId: 's', byteStart: 0, byteEnd: 25 }, 100, undefined)).toBe(2);
    expect(partitionDepth({ sectionId: 's', byteStart: 0, byteEnd: 50 }, 100, undefined)).toBe(1);
    expect(partitionDepth({ sectionId: 's', byteStart: 0, byteEnd: 100 }, 100, undefined)).toBe(0);
    // A recorded value always wins over the derivation.
    const key = partitionDepthKey({ sectionId: 's', byteStart: 0, byteEnd: 25 });
    expect(partitionDepth({ sectionId: 's', byteStart: 0, byteEnd: 25 }, 100, { [key]: 5 })).toBe(5);
  });

  it('a crash between the invalid record and the partition update replays the split, not the same request', async () => {
    const f = await fixture(body(220), { maxDepth: 4 });
    f.setRespond(async function* (req) {
      const big = sourceOf(req).length > 4000;
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: big ? 512 : 50 };
      yield { type: 'done', stopReason: big ? 'length' : 'stop' };
    });
    await runReferenceDigest(f.input);
    const originalSource = f.calls.map(sourceOf).find((text) => text.length > 4000)!;
    expect(originalSource).toBeDefined();

    // Simulate the crash HONESTLY: the journal is an append-only chain of whole
    // entries, so dropping every entry after the one that recorded the invalid
    // result is exactly "the process died before the partition update". No
    // digest is touched and no state is hand-written.
    const dir = (await readdir(f.scratchRoot)).find((name) => name.startsWith('reference-'))!;
    const entries = (await readdir(join(f.scratchRoot, dir))).sort();
    let cut = -1;
    for (const [index, name] of entries.entries()) {
      const state = JSON.parse(await readFile(join(f.scratchRoot, dir, name), 'utf8')).state as {
        requests: Record<string, DigestRequestRecord>; mapPartitions: Record<string, DigestCitation[]>;
      };
      const hasInvalid = Object.values(state.requests).some((r) => r.status === 'invalid');
      const planStillOriginal = Object.values(state.mapPartitions).every((parts) => parts.length === 1);
      if (hasInvalid && planStillOriginal) { cut = index; break; }
    }
    expect(cut).toBeGreaterThanOrEqual(0);
    for (const name of entries.slice(cut + 1)) await rm(join(f.scratchRoot, dir, name));

    // Resume with an adapter that WOULD succeed on a repeat: if the recorded
    // invalid attempt were simply retried, the original oversized source would
    // appear again and the run would "succeed" on it.
    const resumed = await fixture(body(220), { maxDepth: 4 });
    resumed.input.scratch = f.input.scratch;
    resumed.input.contentStore = f.input.contentStore;
    resumed.setRespond(async function* (req) {
      yield { type: 'text-delta', text: JSON.stringify(payloadFor(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest(resumed.input);
    expect(result.phase).toBe('ANSWERING');
    const resumedSources = resumed.calls.map(sourceOf);
    expect(resumedSources.length).toBeGreaterThan(0);
    expect(resumedSources).not.toContain(originalSource);
    expect(resumedSources.every((text) => text.length < originalSource.length)).toBe(true);
  });
});
