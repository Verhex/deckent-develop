import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReferenceDigest } from '../../src/agent/reference-digest-runner.js';
import { validateDigestPayload, digestReferenceValue } from '../../src/agent/reference-digest-validation.js';
import { buildReferenceOutline } from '../../src/agent/reference-outline.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { openScratchStore } from '../../src/agent/scratch-checkpoint.js';
import { referenceJournalKey } from '../../src/agent/reference-digest-journal.js';
import type { ReferenceDigestInput, DigestCitation } from '../../src/agent/reference-digest-runner-types.js';
import type { ProviderRequest, ProviderEvent, ProviderUsage } from '../../src/agent/provider-tooluse/types.js';
const hash = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const descriptor = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true, provenance: 'configured' as const };
function payload(req: ProviderRequest) {
  const data = JSON.parse(req.messages[0]!.content).data;
  const coverage: DigestCitation[] = data.sections ?? data.children.flatMap((c: { coverage: DigestCitation[] }) => c.coverage);
  return { claims: [{ text: 'Source fact', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['Summary may omit detail.'] };
}
async function fixture(text = 'α😀\r\n'.repeat(40), partBytes = 128) {
  const root = await mkdtemp(join(tmpdir(), 'digest-runner-')); roots.push(root);
  const scratch = openScratchStore({ tenantId: 't', projectId: 'p', sessionId: 's' }, { baseDir: root });
  const store = createSessionToolContentStore({ dir: join(scratch.info.root, 'content') });
  const bytes = Buffer.from(text), scope = { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') };
  const snapshot = { metadata: { schemaVersion: 1 as const, scope, sourceAuthority: 'reference-data' as const, sourceDigest: hash(bytes), bytes: bytes.length, encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture' }, async *stream() { for (let i = 0; i < bytes.length; i += 37) yield bytes.subarray(i, i + 37); } };
  const outline = await buildReferenceOutline(snapshot, { maxPartBytes: partBytes, maxNodes: 100, maxSourceBytes: 100_000 });
  const calls: ProviderRequest[] = [], settled = new Map<string, ProviderUsage>(), reserved = new Set<string>();
  let respond: (req: ProviderRequest, index: number) => AsyncIterable<ProviderEvent> = async function* (req) {
    yield { type: 'text-delta', text: JSON.stringify(payload(req)) }; yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'done', stopReason: 'stop' };
  };
  const input: ReferenceDigestInput = { snapshot, outline, scratch: scratch.info, contentStore: store,
    identity: { ...scope, schemaVersion: 1, partitionVersion: 1, sourceDigest: hash(bytes), descriptorDigest: digestReferenceValue(descriptor) },
    context: { provider: 'fixture', model: 'fixture', contextWindowTokens: 32000, contextProvenance: 'configured-narrowing' },
    instruction: 'Summarize the reference.',
    policy: { maxSourceBytes: 100_000, maxRequests: 100, maxDepth: 12, maxWallTimeMs: 20_000, maxTotalTokens: 100_000,
      maxMapOutputTokens: 512, maxReduceOutputTokens: 512, maxResponseBytes: 8192, maxItems: 30, maxTextBytes: 2000,
      finalAnswerReserveTokens: 1024, contextSafetyReserveTokens: 100, concurrencyCap: 3, providerConcurrency: 2, tenantConcurrency: 2, measurementTimeoutMs: 1000 },
    ledger: { async reserve(id) { reserved.add(id); return true; }, async settle(id, usage) { if (settled.has(id)) expect(settled.get(id)).toEqual(usage); settled.set(id, usage); } },
    adapter: { name: 'fixture', reasoningControl: () => descriptor, requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture-exact' }; } },
      async *send(req) { calls.push(req); yield* respond(req, calls.length); } },
  };
  return { root, input, calls, settled, reserved, setRespond(fn: typeof respond) { respond = fn; } };
}

describe('7113 B measured digest and durable accounting', () => {
  it('maps all UTF8/CRLF bytes, reduces with tools=[]/off, reserves answer, reopens journal without repeating calls or usage', async () => {
    const f = await fixture(); const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('ANSWERING'); expect(result.missingRanges).toEqual([]); expect(result.rootRef).toMatch(/^[a-f0-9]{64}$/);
    expect(result.requests).toBe(f.input.outline.nodes.length * 2 - 1);
    expect(f.settled.size).toBe(result.requests); expect(f.reserved.size).toBe(result.requests);
    for (const req of f.calls) { expect(req.tools).toEqual([]); expect(req.reasoning).toEqual({ mode: 'off' }); expect(req.outputCeilingTokens).toBe(512); }
    const count = f.calls.length; expect(await runReferenceDigest(f.input)).toEqual(result); expect(f.calls.length).toBe(count); expect(f.settled.size).toBe(count);
  });
  it('retries invalid structured output exactly once and accounts BOTH calls', async () => {
    const f = await fixture('data'); f.setRespond(async function* (req, n) { yield { type: 'text-delta', text: n === 1 ? '{}' : JSON.stringify(payload(req)) }; yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'done' }; });
    const result = await runReferenceDigest(f.input); expect(result.phase).toBe('ANSWERING'); expect(f.calls).toHaveLength(2); expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });
  it.each(['empty', 'oversize', 'foreign-citation', 'tool', 'length', 'reasoning'])('fails %s after one retry without fake coverage', async mode => {
    const f = await fixture('data');
    f.setRespond(async function* (req) {
      const data = payload(req); if (mode === 'foreign-citation') data.claims[0]!.citations[0] = { sectionId: 'forged', byteStart: 0, byteEnd: 1 };
      yield { type: 'text-delta', text: mode === 'empty' ? '' : mode === 'oversize' ? 'x'.repeat(9000) : JSON.stringify(data) };
      if (mode === 'tool') yield { type: 'tool-call', id: 'forged', name: 'bash', args: {} };
      if (mode === 'reasoning') yield { type: 'reasoning-activity', chars: 4 };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'done', stopReason: mode === 'length' ? 'length' : 'stop' };
    });
    const result = await runReferenceDigest(f.input); expect(result.failure).toBe('REFERENCE_OUTPUT_INVALID'); expect(result.coveredRanges).toEqual([]); expect(f.calls).toHaveLength(2);
    await runReferenceDigest(f.input); expect(f.calls).toHaveLength(2);
  });
  it('holds uncertain usage with a durable reservation and never repeats that request on resume', async () => {
    const f = await fixture('data'); f.setRespond(async function* (req) { yield { type: 'text-delta', text: JSON.stringify(payload(req)) }; yield { type: 'done' }; });
    expect((await runReferenceDigest(f.input)).failure).toBe('REFERENCE_USAGE_UNCERTAIN');
    expect((await runReferenceDigest(f.input)).failure).toBe('REFERENCE_USAGE_UNCERTAIN'); expect(f.calls).toHaveLength(1);
  });
  it('settles identical duplicate usage only once and refuses conflicting usage', async () => {
    const f = await fixture('data'); f.setRespond(async function* (req) { yield { type: 'text-delta', text: JSON.stringify(payload(req)) }; yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'done' }; });
    expect((await runReferenceDigest(f.input)).phase).toBe('ANSWERING'); expect(f.settled.size).toBe(1);
    const g = await fixture('data'); g.setRespond(async function* () { yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'usage', inputTokens: 101, outputTokens: 50 }; });
    expect((await runReferenceDigest(g.input)).failure).toBe('REFERENCE_USAGE_UNCERTAIN'); expect(g.calls).toHaveLength(1);
  });
  it('reserves final answer before admitting calls and honors maxRequests/depth/fan-in', async () => {
    const f = await fixture('data'); f.input.policy.maxTotalTokens = 1500;
    expect((await runReferenceDigest(f.input)).failure).toBe('REFERENCE_BUDGET_INSUFFICIENT'); expect(f.calls).toHaveLength(0);
    const g = await fixture(); g.input.policy.maxRequests = g.input.outline.nodes.length;
    const result = await runReferenceDigest(g.input); expect(result.phase).toBe('PARTIAL'); expect(result.failure).toBe('REFERENCE_BUDGET_INSUFFICIENT'); expect(g.calls.length).toBe(g.input.policy.maxRequests);
  });
  it('uses conservative admission without a counter and declines a pair that cannot fit', async () => {
    const f = await fixture(); const { requestMeasurement: _, ...adapter } = f.input.adapter; f.input.adapter = adapter;
    expect((await runReferenceDigest(f.input)).phase).toBe('ANSWERING');
    const g = await fixture(); g.input.context.model = 'pair-unfit'; g.input.context.contextWindowTokens = 1500;
    g.input.adapter = { ...g.input.adapter, requestMeasurement: { async measure(req) { return { inputTokens: JSON.parse(req.messages[0]!.content).purpose === 'reference-reduce' ? 1400 : 100, provenance: 'fixture' }; } } };
    expect((await runReferenceDigest(g.input)).failure).toBe('REFERENCE_BUDGET_INSUFFICIENT'); expect(g.calls.every(r => JSON.parse(r.messages[0]!.content).purpose === 'reference-map')).toBe(true);
  });
  it('measures oversized sections before splitting on UTF8 boundaries and preserves partitions on resume', async () => {
    const f = await fixture('😀'.repeat(100), 1000); f.input.context = { ...f.input.context, model: 'split', contextWindowTokens: 1600 };
    f.input.adapter = { ...f.input.adapter, requestMeasurement: { async measure(req) { const data = JSON.parse(req.messages[0]!.content).data; return { inputTokens: data.source ? Buffer.byteLength(data.source) * 4 : 100, provenance: 'fixture' }; } } };
    const result = await runReferenceDigest(f.input); expect(result.phase).toBe('ANSWERING'); expect(result.coveredRanges.length).toBeGreaterThan(1);
    expect(f.calls.every(r => !r.messages[0]!.content.includes('�'))).toBe(true); const count = f.calls.length;
    await runReferenceDigest(f.input); expect(f.calls.length).toBe(count);
  });
  it('aborts a noncooperative stream at the deadline and never silently retries', async () => {
    const f = await fixture('data'); f.input.policy.maxWallTimeMs = 100;
    f.setRespond(async function* () { await new Promise(() => {}); });
    const start = Date.now(); expect((await runReferenceDigest(f.input)).failure).toBe('REFERENCE_DEADLINE'); expect(Date.now() - start).toBeLessThan(2000); expect(f.calls).toHaveLength(1);
  });
  it('honors pre-abort, descriptor absence, source mismatch and ledger refusal before sending', async () => {
    const f = await fixture('data'); const controller = new AbortController(); controller.abort(); f.input.signal = controller.signal;
    expect((await runReferenceDigest(f.input)).phase).toBe('CANCELLED'); expect(f.calls).toHaveLength(0);
    const g = await fixture('data'); g.input.adapter = { ...g.input.adapter, reasoningControl: () => undefined };
    expect((await runReferenceDigest(g.input)).failure).toBe('REFERENCE_THINKING_CONTROL_UNAVAILABLE'); expect(g.calls).toHaveLength(0);
    const h = await fixture('data'); h.input.ledger.reserve = async () => false;
    expect((await runReferenceDigest(h.input)).failure).toBe('REFERENCE_BUDGET_INSUFFICIENT'); expect(h.calls).toHaveLength(0);
  });
  it('does not claim stored coverage when content persistence fails', async () => {
    const f = await fixture('data'); f.input.contentStore.write = () => { throw new Error('quota'); };
    const result = await runReferenceDigest(f.input); expect(result.phase).toBe('FAILED'); expect(result.coveredRanges).toEqual([]); expect(result.usage.inputTokens).toBe(100);
  });
  it('detects journal tampering and refuses a foreign plan', async () => {
    const f = await fixture('data'); await runReferenceDigest(f.input);
    const dir = join(f.input.scratch.root, `reference-${referenceJournalKey(f.input.identity)}`); const file = join(dir, (await readdir(dir)).sort()[0]!);
    const raw = await readFile(file, 'utf8'); await writeFile(file, raw.replace('ADMITTING', 'COMPLETE'));
    // First record is MAPPING, so corrupt deterministically regardless of phase.
    await writeFile(file, raw.slice(0, -2)); await expect(runReferenceDigest(f.input)).rejects.toMatchObject({ code: 'REFERENCE_STORE_FAILED' });
    const g = await fixture('data'); await runReferenceDigest(g.input); g.input.instruction = 'different';
    await expect(runReferenceDigest(g.input)).rejects.toMatchObject({ code: 'REFERENCE_JOURNAL_MISMATCH' });
  });
  it('bounds concurrent sends by all three ceilings and preserves deterministic coverage with out-of-order completion', async () => {
    const f = await fixture(); let active = 0, peak = 0;
    f.setRespond(async function* (req, n) { active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, n === 1 ? 30 : 2));
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) }; yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'done' }; active--;
    });
    const result = await runReferenceDigest(f.input); expect(result.phase).toBe('ANSWERING'); expect(peak).toBe(2);
    expect(result.coveredRanges.map(c => c.byteStart)).toEqual([...result.coveredRanges.map(c => c.byteStart)].sort((a,b) => a-b));
  });
  it('an external sink crash after settlement can be replayed without double accounting or another provider call', async () => {
    const f = await fixture('data'); let first = true; const sink = f.input.ledger.settle;
    f.input.ledger.settle = async (id, usage) => { await sink(id, usage); if (first) { first = false; throw new Error('crash after sink commit'); } };
    await runReferenceDigest(f.input); expect(f.settled.size).toBe(1);
    const resumed = await runReferenceDigest(f.input); expect(resumed.failure).toBe('REFERENCE_USAGE_UNCERTAIN'); expect(f.calls).toHaveLength(1); expect(f.settled.size).toBe(1);
  });
  it('a second journal writer cannot dispatch a duplicate request', async () => {
    const f = await fixture('data'); const results = await Promise.allSettled([runReferenceDigest(f.input), runReferenceDigest(f.input)]);
    expect(results.some(r => r.status === 'fulfilled' && r.value.phase === 'ANSWERING')).toBe(true);
    expect(f.calls).toHaveLength(1);
  });
  it('refuses changed snapshot bytes before a provider call and reports explicit source failure', async () => {
    const f = await fixture('data'); f.input.snapshot = { ...f.input.snapshot, async *stream() { yield Buffer.from('evil'); } };
    expect((await runReferenceDigest(f.input)).failure).toBe('REFERENCE_SOURCE_CHANGED'); expect(f.calls).toHaveLength(0);
  });
  it('retains completed coverage when a later call loses usage and resume never replays either node', async () => {
    const f = await fixture('abcdef', 4); f.input.policy.concurrencyCap = 1;
    f.setRespond(async function* (req, n) { yield { type: 'text-delta', text: JSON.stringify(payload(req)) }; if (n === 1) yield { type: 'usage', inputTokens: 100, outputTokens: 50 }; yield { type: 'done' }; });
    const result = await runReferenceDigest(f.input); expect(result.phase).toBe('PARTIAL'); expect(result.coveredRanges).toHaveLength(1);
    const resumed = await runReferenceDigest(f.input); expect(resumed.phase).toBe('PARTIAL'); expect(resumed.coveredRanges).toEqual(result.coveredRanges); expect(f.calls).toHaveLength(2);
  });
  it('propagates corrupted node readback and maxDepth exhaustion honestly', async () => {
    const f = await fixture('data'); f.input.contentStore.readContentRef = async () => ({ kind: 'hold', reasonCode: 'CONTENT_DIGEST_MISMATCH' });
    expect((await runReferenceDigest(f.input)).failure).toBe('REFERENCE_STORE_FAILED');
    const g = await fixture(); g.input.policy.maxDepth = 1;
    const result = await runReferenceDigest(g.input); expect(result.failure).toBe('REFERENCE_BUDGET_INSUFFICIENT'); expect(result.phase).toBe('PARTIAL');
  });
  it('includes continuation context but never double-counts it', async () => {
    const f = await fixture('| name | value |\n| --- | --- |\n| a | ' + 'x'.repeat(500) + ' |\n', 128);
    expect((await runReferenceDigest(f.input)).phase).toBe('ANSWERING');
    expect(f.calls.some(r => JSON.parse(r.messages[0]!.content).data.context?.some((c: { text: string }) => c.text.includes('| name | value |')))).toBe(true);
  });
});

describe('7113 B strict payload authority', () => {
  it.each(['sourceDigest', 'nodeId', 'coverage', 'createdAt', '__proto__'])('rejects model-owned %s', key => {
    const value = { claims: [], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['bounded'], [key]: 'forged' };
    expect(() => validateDigestPayload(JSON.stringify(value), [], { maxResponseBytes: 10000, maxItems: 10, maxTextBytes: 100 })).toThrow();
  });
  it('rejects ranges outside child union, blank values, unknown nested keys and excessive arrays', () => {
    const valid = { claims: [{ text: 'fact', citations: [{ sectionId: 'a', byteStart: 0, byteEnd: 5 }] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: [] };
    const limits = { maxResponseBytes: 10000, maxItems: 10, maxTextBytes: 100 };
    expect(() => validateDigestPayload(JSON.stringify(valid), [{ sectionId: 'a', byteStart: 1, byteEnd: 5 }], limits)).toThrow();
    expect(() => validateDigestPayload(JSON.stringify({ ...valid, decisions: [' '] }), [], limits)).toThrow();
    expect(() => validateDigestPayload(JSON.stringify({ ...valid, claims: [{ ...valid.claims[0], extra: true }] }), [], limits)).toThrow();
    expect(() => validateDigestPayload(JSON.stringify({ ...valid, entities: Array(11).fill('x') }), [], limits)).toThrow();
  });
});
