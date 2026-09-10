// 7113-E D0+D1+D2 — the turn's FIRST validated answer, and where its time went.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReferenceDigest } from '../../src/agent/reference-digest-runner.js';
import { digestReferenceValue } from '../../src/agent/reference-digest-validation.js';
import { buildReferenceOutline } from '../../src/agent/reference-outline.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { openScratchStore } from '../../src/agent/scratch-checkpoint.js';
import { createInterimDeliverableTracker, REFERENCE_INTERIM_INSTRUCTION } from '../../src/agent/interim-deliverable.js';
import { DEFAULT_LARGE_REFERENCE_POLICY, resolveLargeReferencePolicy } from '../../src/core/large-reference-policy.js';
import { ReferenceDigestError } from '../../src/agent/reference-digest-types.js';
import type { ReferenceDigestInput, DigestCitation, ReferenceInterimSkip } from '../../src/agent/reference-digest-runner-types.js';
import type { ProviderRequest, ProviderEvent, ProviderUsage } from '../../src/agent/provider-tooluse/types.js';

const hash = (x: string | Buffer): string => createHash('sha256').update(x).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const descriptor = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true, provenance: 'configured' as const };
const ANSWER = 'The section read so far records three risk rows and one owner decision, each tied to a cited byte range. The reading is still in progress.';

function payload(req: ProviderRequest): unknown {
  const data = JSON.parse(req.messages[0]!.content).data;
  const coverage: DigestCitation[] = data.sections ?? data.children.flatMap((c: { coverage: DigestCitation[] }) => c.coverage);
  return { claims: [{ text: 'Source fact', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['partial'] };
}

async function fixture(options: { firstPartBytes?: number; claims?: () => boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'first-answer-')); roots.push(root);
  const scratch = openScratchStore({ tenantId: 't', projectId: 'p', sessionId: 's' }, { baseDir: root });
  const store = createSessionToolContentStore({ dir: join(scratch.info.root, 'content') });
  const bytes = Buffer.from('reference body line.\n'.repeat(200));
  const scope = { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') };
  const snapshot = {
    metadata: { schemaVersion: 1 as const, scope, sourceAuthority: 'reference-data' as const, sourceDigest: hash(bytes),
      bytes: bytes.length, encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture' },
    async *stream() { yield bytes; },
  };
  const outline = await buildReferenceOutline(snapshot, {
    maxPartBytes: 2048, maxNodes: 100, maxSourceBytes: 100_000,
    ...(options.firstPartBytes !== undefined ? { firstPartBytes: options.firstPartBytes } : {}),
  });
  const calls: ProviderRequest[] = [], settled = new Map<string, ProviderUsage>();
  const delivered: unknown[] = []; const skips: ReferenceInterimSkip[] = [];
  let respond: (req: ProviderRequest) => AsyncIterable<ProviderEvent> = async function* (req) {
    yield { type: 'text-delta', text: req.purpose === 'reference-interim' ? ANSWER : JSON.stringify(payload(req)) };
    yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
    yield { type: 'done', stopReason: 'stop' };
  };
  const input: ReferenceDigestInput = {
    snapshot, outline, scratch: scratch.info, contentStore: store,
    identity: { ...scope, schemaVersion: 1, partitionVersion: 1, sourceDigest: hash(bytes), descriptorDigest: digestReferenceValue(descriptor) },
    context: { provider: 'fixture', model: 'fixture', contextWindowTokens: 32000, contextProvenance: 'configured-narrowing' },
    instruction: 'Summarize the reference.',
    policy: { maxSourceBytes: 100_000, maxRequests: 100, maxDepth: 12, maxWallTimeMs: 20_000, maxTotalTokens: 100_000,
      maxMapOutputTokens: 512, maxReduceOutputTokens: 512, maxResponseBytes: 8192, maxItems: 30, maxTextBytes: 2000,
      finalAnswerReserveTokens: 1024, contextSafetyReserveTokens: 100, concurrencyCap: 1, providerConcurrency: 1,
      tenantConcurrency: 1, measurementTimeoutMs: 1000 },
    ledger: { async reserve() { return true; }, async settle(id, usage) { settled.set(id, usage); } },
    adapter: {
      name: 'fixture', reasoningControl: () => descriptor,
      structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
      requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture-exact' }; } },
      async *send(req) { calls.push(req); yield* respond(req); },
    },
    interim: {
      instruction: REFERENCE_INTERIM_INSTRUCTION, outputCeilingTokens: 512,
      claim: options.claims ?? (() => true),
      deliver: async (d) => { delivered.push(d); },
      skipped: (r) => { skips.push(r); },
    },
  };
  return { root, input, calls, settled, delivered, skips, scratch, setRespond(fn: typeof respond) { respond = fn; } };
}


type JournalRow = { purpose: string; timing?: Record<string, number | string> };
async function journalDir(f: { scratch: { info: { root: string } } }): Promise<string> {
  const { readdir } = await import('node:fs/promises');
  const name = (await readdir(f.scratch.info.root)).find((d) => d.startsWith('reference-'))!;
  return join(f.scratch.info.root, name);
}
async function readJournal(f: { scratch: { info: { root: string } } }): Promise<Record<string, JournalRow>> {
  const { readdir, readFile } = await import('node:fs/promises');
  const dir = await journalDir(f);
  const names = (await readdir(dir)).filter((n) => /^\d{10}\.json$/.test(n)).sort();
  const last = JSON.parse(await readFile(join(dir, names.at(-1)!), 'utf8')) as { state: { requests: Record<string, JournalRow> } };
  return last.state.requests;
}
/** Rewrite the journal chain without any `timing`, as a pre-D0 run would have. */
async function stripTiming(f: { scratch: { info: { root: string } } }): Promise<void> {
  const { readdir, readFile, writeFile } = await import('node:fs/promises');
  const { createHash: sha } = await import('node:crypto');
  const dir = await journalDir(f);
  const names = (await readdir(dir)).filter((n) => /^\d{10}\.json$/.test(n)).sort();
  let previous: string | null = null;
  for (const name of names) {
    const envelope = JSON.parse(await readFile(join(dir, name), 'utf8')) as { state: { requests: Record<string, JournalRow> } };
    for (const row of Object.values(envelope.state.requests)) delete row.timing;
    const digest = sha('sha256').update(JSON.stringify([previous, envelope.state])).digest('hex');
    await writeFile(join(dir, name), JSON.stringify({ previous, state: envelope.state, digest }));
    previous = digest;
  }
}

describe('D0 — where the time actually went', () => {
  it('records each phase separately, with an epoch stamp and a run identity', async () => {
    const f = await fixture();
    await runReferenceDigest(f.input);
    const rows = Object.values(await readJournal(f)).filter((r) => r.timing);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const t = row.timing!;
      // Evidence stamp is a real wall-clock instant.
      expect(typeof t['startedAtEpochMs']).toBe('number');
      expect(t['startedAtEpochMs'] as number).toBeGreaterThan(1_700_000_000_000);
      // Durations come from the monotonic clock and are separated by phase.
      expect(typeof t['processId']).toBe('string');
      for (const phase of ['measureMs', 'reserveMs', 'streamMs', 'settleMs']) {
        expect(t[phase], phase).toBeTypeOf('number');
        expect(t[phase] as number, phase).toBeGreaterThanOrEqual(0);
      }
    }
    // One run measured them all, so no reader can subtract across processes.
    expect(new Set(rows.map((r) => r.timing!['processId'])).size).toBe(1);
  });

  it('keeps what an INTERRUPTED request really measured, and invents no total', async () => {
    const f = await fixture();
    // One text event, then the stream dies. The reservation and the first byte
    // are real; the phases that never finished must simply be absent.
    f.setRespond(async function* () {
      yield { type: 'text-delta', text: 'partial' };
      await new Promise((r) => setTimeout(r, 5));
      throw new Error('transport died');
    });
    await runReferenceDigest(f.input).catch(() => undefined);
    const rows = Object.values(await readJournal(f)).filter((r) => r.timing);
    const cut = rows.find((r) => r.timing!['status'] === 'interrupted');
    expect(cut, 'the interrupted request is still in the record').toBeDefined();
    const t = cut!.timing!;
    expect(t['endedReason']).toBe('stream-failed');
    // Measured up to the interruption...
    expect(t['measureMs']).toBeTypeOf('number');
    expect(t['reserveMs'], 'the reservation really completed').toBeTypeOf('number');
    expect(t['firstByteMs'], 'the first byte really arrived').toBeTypeOf('number');
    expect(t['interruptedAfterMs'] as number).toBeGreaterThanOrEqual(0);
    // ...and NOT invented for phases that never finished.
    expect(t['streamMs']).toBeUndefined();
    expect(t['settleMs']).toBeUndefined();
    expect(t['deliverMs']).toBeUndefined();
  });

  it('replays a legacy journal as UNKNOWN instead of filling zeros', async () => {
    const f = await fixture();
    await runReferenceDigest(f.input);
    // Strip the timing from the durable record, exactly as a pre-D0 run left
    // it, then resume over that journal and read it back.
    await stripTiming(f);
    const resumed = await runReferenceDigest(f.input);
    expect(resumed.phase).toBe('ANSWERING');
    const rows = Object.values(await readJournal(f));
    const legacy = rows.filter((r) => !r.timing);
    expect(legacy.length, 'the stripped records stayed legacy').toBeGreaterThan(0);
    for (const row of legacy) {
      expect(row.timing).toBeUndefined();
      expect(JSON.stringify(row)).not.toContain('"measureMs":0');
      expect(JSON.stringify(row)).not.toContain('"streamMs":0');
    }
  });

  it('reports the consumer hand-off as its own phase, not as request time', async () => {
    const f = await fixture();
    f.input.interim = { ...f.input.interim!, deliver: async () => { await new Promise((r) => setTimeout(r, 25)); } };
    await runReferenceDigest(f.input);
    const interim = Object.values(await readJournal(f)).find((r) => r.purpose === 'reference-interim');
    expect(interim?.timing?.['deliverMs']).toBeGreaterThanOrEqual(20);
    // The hand-off is NOT folded into the stream time.
    expect(interim!.timing!['streamMs']).toBeLessThan(interim!.timing!['deliverMs']!);
  });
});

describe('D1 — the turn says something before the cadence could', () => {
  const policy = { interimAnswerAfterToolCalls: 12, interimAnswerAfterMs: 90_000, interimAnswerMinChars: 10,
    maxInterimRequestsPerTurn: 3, maxToolCallsPerTurn: 40, maxConsecutiveFailuresPerTarget: 3 };

  it('is due only while the turn has delivered nothing, and only within the finite allowance', () => {
    let now = 0;
    const tracker = createInterimDeliverableTracker(policy, () => now);
    // The cadence itself says nothing is owed yet.
    expect(tracker.evaluate()).toBeUndefined();
    // ...but the turn has not spoken at all, and that is a separate question.
    expect(tracker.firstAnswerDue()).toBe(true);
    tracker.markRequested({ kind: 'interim', trigger: 'elapsed', toolCallsSinceDeliverable: 0, elapsedMsSinceDeliverable: 0 });
    tracker.settleRound({ text: ANSWER, toolCalls: 0 });
    expect(tracker.snapshot().delivered).toBe(1);
    // Once the turn HAS spoken, the cadence is the only authority again.
    expect(tracker.firstAnswerDue()).toBe(false);
  });

  it('a failing first attempt neither silences the turn nor escapes the ceiling', () => {
    let now = 0;
    const tracker = createInterimDeliverableTracker(policy, () => now);
    let asks = 0;
    // Every attempt fails to produce an answer; eligibility must persist (the
    // turn is still silent) but the finite allowance must still end it.
    while (tracker.firstAnswerDue()) {
      asks += 1;
      tracker.markRequested({ kind: 'interim', trigger: 'elapsed', toolCallsSinceDeliverable: 0, elapsedMsSinceDeliverable: 0 });
      tracker.settleRound({ text: '', toolCalls: 0 });
      expect(asks).toBeLessThanOrEqual(policy.maxInterimRequestsPerTurn);
    }
    expect(asks).toBe(policy.maxInterimRequestsPerTurn);
    expect(tracker.snapshot().delivered).toBe(0);
    expect(tracker.snapshot().requestsRemaining).toBe(0);
  });
});

describe('D2 — the first part is smaller, the coverage is not', () => {
  it('keeps coverage gapless, non-overlapping and complete', async () => {
    const uniform = await fixture();
    const shaped = await fixture({ firstPartBytes: 256 });
    const ranges = (o: typeof shaped.input.outline) => o.nodes.map((n) => ({ byteStart: n.byteStart, byteEnd: n.byteEnd }));
    for (const outline of [uniform.input.outline, shaped.input.outline]) {
      const rs = [...ranges(outline)].sort((a, b) => a.byteStart - b.byteStart);
      let cursor = 0;
      for (const r of rs) { expect(r.byteStart).toBe(cursor); cursor = r.byteEnd; }
      expect(cursor).toBe(outline.sourceBytes);
    }
    // The first part really is smaller, and the rest keep the ordinary size.
    const first = [...ranges(shaped.input.outline)].sort((a, b) => a.byteStart - b.byteStart)[0]!;
    expect(first.byteEnd - first.byteStart).toBeLessThanOrEqual(256);
    const uniformFirst = [...ranges(uniform.input.outline)].sort((a, b) => a.byteStart - b.byteStart)[0]!;
    expect(uniformFirst.byteEnd - uniformFirst.byteStart).toBeGreaterThan(256);
    // Same source, same identity: nothing about custody changed.
    expect(shaped.input.outline.sourceDigest).toBe(uniform.input.outline.sourceDigest);
    expect(shaped.input.outline.sourceBytes).toBe(uniform.input.outline.sourceBytes);
  });

  it('produces the first validated node from fewer source bytes', async () => {
    const shaped = await fixture({ firstPartBytes: 256 });
    await runReferenceDigest(shaped.input);
    const firstCall = shaped.calls.find((c) => c.purpose === 'reference-map')!;
    const sections = JSON.parse(firstCall.messages[0]!.content).data.sections as DigestCitation[];
    const bytes = sections.reduce((n, r) => n + (r.byteEnd - r.byteStart), 0);
    expect(bytes).toBeLessThanOrEqual(256);
  });

  it('is declared, validated and defaulted through the existing policy chain', () => {
    expect(DEFAULT_LARGE_REFERENCE_POLICY.firstPartBytes).toBe(32 * 1024);
    expect(resolveLargeReferencePolicy({ firstPartBytes: 4096 }).firstPartBytes).toBe(4096);
    expect(() => resolveLargeReferencePolicy({ firstPartBytes: 0 })).toThrow();
    expect(() => resolveLargeReferencePolicy({ firstPartBytes: 1.5 })).toThrow();
    // 1..3 used to pass admission and fail only inside the outline; one floor now.
    for (const bytes of [1, 2, 3]) {
      expect(() => resolveLargeReferencePolicy({ firstPartBytes: bytes }), String(bytes)).toThrow(/at least 4 bytes/);
    }
    expect(resolveLargeReferencePolicy({ firstPartBytes: 4 }).firstPartBytes).toBe(4);
    // The feature itself stays OFF by default.
    expect(DEFAULT_LARGE_REFERENCE_POLICY.enabled).toBe(false);
  });

  it('refuses an unusable first-part size instead of silently ignoring it', async () => {
    const f = await fixture();
    await expect(buildReferenceOutline(f.input.snapshot, {
      maxPartBytes: 2048, maxNodes: 100, maxSourceBytes: 100_000, firstPartBytes: 2,
    })).rejects.toBeInstanceOf(ReferenceDigestError);
  });
});
