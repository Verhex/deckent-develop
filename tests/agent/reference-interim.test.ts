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
import { REFERENCE_INTERIM_INSTRUCTION } from '../../src/agent/interim-deliverable.js';
import { getMessage } from '../../src/cli/helpers/messages.js';
import type {
  ReferenceDigestInput, DigestCitation, ReferenceInterimSkip,
} from '../../src/agent/reference-digest-runner-types.js';
import type { ProviderRequest, ProviderEvent, ProviderUsage } from '../../src/agent/provider-tooluse/types.js';

const hash = (x: string | Buffer): string => createHash('sha256').update(x).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const descriptor = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true, provenance: 'configured' as const };
const ANSWER = 'The plan names three risks and one owner decision. The reading is still in progress; this is partial.';

function payload(req: ProviderRequest): unknown {
  const data = JSON.parse(req.messages[0]!.content).data;
  const coverage: DigestCitation[] = data.sections ?? data.children.flatMap((c: { coverage: DigestCitation[] }) => c.coverage);
  return { claims: [{ text: 'Source fact', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['partial'] };
}

/** A 2-node source, so a real answer is possible while mapping is unfinished. */
async function fixture(options: { claims?: boolean[]; interim?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'interim-')); roots.push(root);
  const scratch = openScratchStore({ tenantId: 't', projectId: 'p', sessionId: 's' }, { baseDir: root });
  const store = createSessionToolContentStore({ dir: join(scratch.info.root, 'content') });
  const bytes = Buffer.from('reference body line.\n'.repeat(24));
  const scope = { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') };
  const snapshot = {
    metadata: { schemaVersion: 1 as const, scope, sourceAuthority: 'reference-data' as const, sourceDigest: hash(bytes),
      bytes: bytes.length, encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture' },
    async *stream() { yield bytes; },
  };
  const outline = await buildReferenceOutline(snapshot, { maxPartBytes: 256, maxNodes: 100, maxSourceBytes: 100_000 });
  const calls: ProviderRequest[] = [], settled = new Map<string, ProviderUsage>(), reserved: string[] = [];
  const delivered: { text: string; usage: ProviderUsage; requestId: string; coveredBytes: number; sourceBytes: number }[] = [];
  const skips: ReferenceInterimSkip[] = [];
  const claims = [...(options.claims ?? [true, false, false, false, false, false])];
  let respond: (req: ProviderRequest, index: number) => AsyncIterable<ProviderEvent> = async function* (req) {
    if (req.purpose === 'reference-interim') {
      yield { type: 'text-delta', text: ANSWER };
    } else {
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
    }
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
    ledger: { async reserve(id) { reserved.push(id); return true; }, async settle(id, usage) { settled.set(id, usage); } },
    adapter: {
      name: 'fixture', reasoningControl: () => descriptor,
      structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
      requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture-exact' }; } },
      async *send(req) { calls.push(req); yield* respond(req, calls.length); },
    },
    ...(options.interim === false ? {} : { interim: {
      instruction: REFERENCE_INTERIM_INSTRUCTION,
      outputCeilingTokens: 512,
      claim: () => claims.shift() ?? false,
      deliver: async (d) => { delivered.push({ ...d, usage: d.usage }); },
      skipped: (reason) => { skips.push(reason); },
    } }),
  };
  return { root, input, calls, settled, reserved, delivered, skips,
    setRespond(fn: typeof respond) { respond = fn; } };
}

describe('7113-E B-2 real interim answer during a reference program', () => {
  it('answers from the FIRST verified node, before mapping is finished', async () => {
    const f = await fixture();
    const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('ANSWERING');
    expect(f.delivered).toHaveLength(1);
    expect(f.delivered[0]!.text).toBe(ANSWER);

    const order = f.calls.map((c) => c.purpose);
    const interimAt = order.indexOf('reference-interim');
    expect(interimAt).toBeGreaterThan(-1);
    // The proof that it is INTERIM: map work continues after it.
    expect(order.slice(interimAt + 1)).toContain('reference-map');
    // Coverage is reported honestly as partial at that moment.
    expect(f.delivered[0]!.coveredBytes).toBeGreaterThan(0);
    expect(f.delivered[0]!.coveredBytes).toBeLessThan(f.delivered[0]!.sourceBytes);
  });

  it('carries only validated evidence, no tools and no reasoning', async () => {
    const f = await fixture();
    await runReferenceDigest(f.input);
    const req = f.calls.find((c) => c.purpose === 'reference-interim')!;
    expect(req.tools).toEqual([]);
    expect(req.reasoning).toEqual({ mode: 'off' });
    expect(req.system).toBe(REFERENCE_INTERIM_INSTRUCTION);
    const body = JSON.parse(req.messages[0]!.content);
    expect(Object.keys(body.data).sort()).toEqual(['coverage', 'payload', 'sourceBytes']);
    // The raw source never reaches this request.
    expect(req.messages[0]!.content).not.toContain('reference body line.');
    // A prose answer is not a digest payload: no schema is imposed on it.
    expect(req.structuredOutput).toBeUndefined();
  });

  it('bills through the same ledger exactly once and keeps the request counted', async () => {
    const f = await fixture();
    const result = await runReferenceDigest(f.input);
    const requestId = f.delivered[0]!.requestId;
    expect(f.reserved.filter((id) => id === requestId)).toHaveLength(1);
    expect(f.settled.get(requestId)).toMatchObject({ inputTokens: 100, outputTokens: 50 });
    // Every dispatched request is in the program's own total.
    expect(result.requests).toBe(f.calls.length);
    expect(result.usage.inputTokens).toBe(100 * f.calls.length);
  });

  it('produces NOTHING when there is no verified node yet', async () => {
    const f = await fixture();
    f.setRespond(async function* () {
      yield { type: 'text-delta', text: 'not json' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.phase).not.toBe('ANSWERING');
    expect(f.delivered).toHaveLength(0);
    expect(f.calls.some((c) => c.purpose === 'reference-interim')).toBe(false);
  });

  it('refuses honestly when the remaining budget cannot admit another call', async () => {
    const f = await fixture();
    // Coverage work still fits; ONE more call with this ceiling does not.
    f.input.interim = { ...f.input.interim!, outputCeilingTokens: 90_000 };
    await runReferenceDigest(f.input).catch(() => undefined);
    expect(f.delivered).toHaveLength(0);
    expect(f.skips).toContain('budget-refused');
    expect(f.calls.some((c) => c.purpose === 'reference-interim')).toBe(false);
  });

  it('never counts an empty answer as a delivery, and still settles its usage', async () => {
    const f = await fixture();
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') yield { type: 'text-delta', text: '   ' };
      else yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input);
    expect(f.delivered).toHaveLength(0);
    expect(f.skips).toContain('empty-answer');
    // Spend that really happened is never lost.
    expect([...f.settled.values()].length).toBe(f.calls.length);
  });

  it('leaves an unconfirmed reservation unknown: not settled, not zeroed, and never re-billed', async () => {
    const f = await fixture();
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') { yield { type: 'text-delta', text: ANSWER }; yield { type: 'done', stopReason: 'stop' }; return; }
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input);
    const interimIds = f.reserved.filter((id) => !f.settled.has(id));
    expect(interimIds).toHaveLength(1);
    expect(f.skips).toContain('unconfirmed-reservation');
    expect(f.delivered).toHaveLength(0);

    // Restart: the SAME request is never billed twice, and the hold stays typed.
    // (A DIFFERENT node may legitimately open a new opportunity; identity, not
    // a raw count, is the invariant.)
    const heldId = interimIds[0]!;
    const resumed = await fixtureResume(f);
    expect(resumed.skips).toContain('unconfirmed-reservation');
    expect(f.reserved.filter((id) => id === heldId)).toHaveLength(1);
    expect(f.settled.has(heldId)).toBe(false);
    // The resumed run still finishes its reading: a held interim never kills it.
    expect(resumed.phase).toBe('ANSWERING');
  });

  it('does not deliver after the turn was cancelled', async () => {
    const controller = new AbortController();
    const f = await fixture();
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') { controller.abort(); }
      if (req.purpose === 'reference-interim') yield { type: 'text-delta', text: ANSWER };
      else yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest({ ...f.input, signal: controller.signal, userSignal: controller.signal }).catch(() => undefined);
    expect(f.delivered).toHaveLength(0);
  });

  it('is inert when the host offers no interim capability', async () => {
    const f = await fixture({ interim: false });
    const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('ANSWERING');
    expect(f.calls.some((c) => c.purpose === 'reference-interim')).toBe(false);
    expect(f.delivered).toHaveLength(0);
  });

  it('counts the interim request on its OWN line, never as coverage work', async () => {
    const f = await fixture();
    let last: { map: number; reduce: number; interim: number; cap: number } | undefined;
    await runReferenceDigest({ ...f.input, onDigestProgress: (p) => { last = { ...p.requests }; } });
    expect(last!.interim).toBe(1);
    expect(last!.map + last!.reduce).toBe(f.calls.length - 1);
  });

  it('gives every typed skip reason a bilingual sentence', () => {
    const reasons: ReferenceInterimSkip[] = ['not-due', 'budget-refused', 'unconfirmed-reservation',
      'empty-answer', 'stopped', 'invalid-answer', 'seam-closed'];
    for (const lang of ['en', 'tr']) {
      const line = `native.reference.interim-skipped`;
      expect(getMessage(line, lang)).not.toBe(line);
      for (const reason of reasons) {
        const key = `native.reference.interim-skip.${reason}`;
        expect(getMessage(key, lang), key).not.toBe(key);
      }
    }
  });
});

/** Re-run the SAME program over the retained journal, counting new interim calls. */
async function fixtureResume(f: Awaited<ReturnType<typeof fixture>>): Promise<{ phase: string; skips: ReferenceInterimSkip[] }> {
  const skips: ReferenceInterimSkip[] = [];
  const claims = [true, true, true];
  const result = await runReferenceDigest({
    ...f.input,
    interim: { ...f.input.interim!, claim: () => claims.shift() ?? false, skipped: (r) => { skips.push(r); } },
  }).catch(() => ({ phase: 'FAILED' as const }));
  return { phase: result.phase, skips };
}

describe('7113-E B-2 deadline is not a user cancellation', () => {
  it('records its OWN exhaustion as a deadline, not as the user cancelling', async () => {
    const f = await fixture();
    // The caller composes its program deadline into the turn signal, exactly as
    // the session does. The user never aborted anything.
    const userSignal = new AbortController().signal;
    const composed = AbortSignal.any([userSignal, AbortSignal.timeout(20)]);
    f.setRespond(async function* (req) {
      await new Promise((r) => setTimeout(r, 60));
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest({ ...f.input, signal: composed, userSignal });
    expect(result.failure).toBe('REFERENCE_DEADLINE');
    expect(result.phase).not.toBe('CANCELLED');
  });

  it('still records a REAL user abort as cancelled', async () => {
    const f = await fixture();
    const controller = new AbortController();
    f.setRespond(async function* (req) {
      controller.abort();
      await new Promise((r) => setTimeout(r, 10));
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const composed = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
    const result = await runReferenceDigest({ ...f.input, signal: composed, userSignal: controller.signal });
    expect(result.failure).toBe('REFERENCE_CANCELLED');
    expect(result.phase).toBe('CANCELLED');
  });
});

describe('7113-E B-2 rev2 — the response is validated, not trusted', () => {
  /** Every breach the coverage seam rejects must be rejected here too. */
  const breaches: { name: string; stream: (t: string) => ProviderEvent[]; expect: 'invalid-answer' | 'unconfirmed-reservation' }[] = [
    { name: 'a tool call', expect: 'invalid-answer',
      stream: (t) => [{ type: 'text-delta', text: t }, { type: 'tool-call', id: 'x', name: 'bash', args: {} },
        { type: 'usage', inputTokens: 100, outputTokens: 50 }, { type: 'done', stopReason: 'stop' }] },
    { name: 'hidden reasoning', expect: 'invalid-answer',
      stream: (t) => [{ type: 'text-delta', text: t }, { type: 'reasoning-activity', chars: 12 },
        { type: 'usage', inputTokens: 100, outputTokens: 50 }, { type: 'done', stopReason: 'stop' }] },
    { name: 'a truncated finish', expect: 'invalid-answer',
      stream: (t) => [{ type: 'text-delta', text: t },
        { type: 'usage', inputTokens: 100, outputTokens: 50 }, { type: 'done', stopReason: 'length' }] },
    { name: 'reported output past the ceiling', expect: 'invalid-answer',
      stream: (t) => [{ type: 'text-delta', text: t },
        { type: 'usage', inputTokens: 100, outputTokens: 513 }, { type: 'done', stopReason: 'stop' }] },
    { name: 'reported input past the measurement', expect: 'invalid-answer',
      stream: (t) => [{ type: 'text-delta', text: t },
        { type: 'usage', inputTokens: 101, outputTokens: 50 }, { type: 'done', stopReason: 'stop' }] },
    { name: 'conflicting usage reports', expect: 'unconfirmed-reservation',
      stream: (t) => [{ type: 'text-delta', text: t },
        { type: 'usage', inputTokens: 100, outputTokens: 50 }, { type: 'usage', inputTokens: 101, outputTokens: 51 },
        { type: 'done', stopReason: 'stop' }] },
    { name: 'no finish event at all', expect: 'invalid-answer',
      stream: (t) => [{ type: 'text-delta', text: t }, { type: 'usage', inputTokens: 100, outputTokens: 50 }] },
  ];

  it.each(breaches)('refuses to deliver on $name', async ({ stream, expect: reason }) => {
    const f = await fixture();
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') { for (const e of stream(ANSWER)) yield e; return; }
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input);
    expect(f.delivered).toHaveLength(0);
    expect(f.skips).toContain(reason);
  });

  it('rejects an oversize answer instead of quietly cutting it', async () => {
    const f = await fixture();
    // The map payloads stay well inside the bound; only the ANSWER exceeds it.
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') {
        yield { type: 'text-delta', text: 'x'.repeat(f.input.policy.maxResponseBytes + 1000) };
        yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
        yield { type: 'done', stopReason: 'stop' };
        return;
      }
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input).catch(() => undefined);
    expect(f.delivered).toHaveLength(0);
    expect(f.skips).toContain('invalid-answer');
  });

  it('closes the seam after a breach instead of retrying it silently', async () => {
    const f = await fixture({ claims: [true, true, true, true] });
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') {
        yield { type: 'text-delta', text: ANSWER };
        yield { type: 'tool-call', id: 'x', name: 'bash', args: {} };
        yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
        yield { type: 'done', stopReason: 'stop' };
        return;
      }
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input);
    // Exactly ONE interim call was spent; the next opportunity is typed-refused.
    expect(f.calls.filter((c) => c.purpose === 'reference-interim')).toHaveLength(1);
    expect(f.skips).toContain('seam-closed');
    expect(f.delivered).toHaveLength(0);
  });

  it('keeps a real confirmed spend even when the answer is refused', async () => {
    const f = await fixture();
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') {
        yield { type: 'text-delta', text: ANSWER };
        yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
        yield { type: 'done', stopReason: 'length' };
        return;
      }
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input);
    expect(f.settled.size).toBe(f.calls.length);
  });

  it('carries an unresolved reservation to the RESULT, whatever happens later', async () => {
    const f = await fixture({ claims: [true, false, false, false, false] });
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') {
        yield { type: 'text-delta', text: ANSWER };
        yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
        yield { type: 'usage', inputTokens: 101, outputTokens: 51 };
        yield { type: 'done', stopReason: 'stop' };
        return;
      }
      yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    // The reading itself finished...
    expect(result.phase).toBe('ANSWERING');
    // ...but the cost truth is NOT closed, and says so.
    expect(result.unresolvedInterimUsage).toHaveLength(1);
    expect(f.settled.has(result.unresolvedInterimUsage![0]!)).toBe(false);
  });
});

describe('7113-E B-2 rev4 — an owed answer does not wait for the NEXT success', () => {
  it('answers at the boundary after a failed map, using the node already in hand', async () => {
    // The measured 90 s shape, with a controlled clock instead of real time:
    //   node 1 and node 2 land BEFORE the cadence (claim -> false),
    //   the next map completes and is LENGTH-INVALID (no new node),
    //   the answer is owed from that moment on.
    // Before rev4 nothing re-evaluated, and the reading hit its deadline with a
    // usable answer sitting unused.
    const f = await fixture({ claims: [] });
    let due = false;
    const order: string[] = [];
    f.input.interim = {
      ...f.input.interim!,
      claim: () => due,
      deliver: async (d) => { order.push('interim'); f.delivered.push({ ...d }); },
    };
    let mapCompletions = 0;
    f.setRespond(async function* (req) {
      if (req.purpose === 'reference-interim') { yield { type: 'text-delta', text: ANSWER }; }
      else {
        mapCompletions += 1;
        order.push(`map:${mapCompletions}`);
        if (mapCompletions === 3) {
          // Past the threshold now, and this step produces NO new node.
          due = true;
          yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
          yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
          yield { type: 'done', stopReason: 'length' };
          return;
        }
        yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
      }
      yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input).catch(() => undefined);

    expect(f.delivered, 'the answer already in hand was offered').toHaveLength(1);
    const interimAt = order.indexOf('interim');
    expect(interimAt).toBeGreaterThan(order.indexOf('map:3'));
    // ...and it went out BEFORE the next coverage request was bought.
    expect(order.slice(interimAt)).toContain('map:4');
    // It used validated evidence, not the failed step.
    const req = f.calls.find((c) => c.purpose === 'reference-interim')!;
    expect(JSON.parse(req.messages[0]!.content).data.payload).toBeDefined();
  });

  it('never runs beside another provider call and never interrupts one', async () => {
    const f = await fixture({ claims: [] });
    let due = false, inFlight = 0, maxParallel = 0;
    f.input.interim = { ...f.input.interim!, claim: () => due };
    let maps = 0;
    f.setRespond(async function* (req) {
      inFlight += 1; maxParallel = Math.max(maxParallel, inFlight);
      try {
        if (req.purpose !== 'reference-interim') { maps += 1; if (maps >= 2) due = true; }
        yield { type: 'text-delta', text: req.purpose === 'reference-interim' ? ANSWER : JSON.stringify(payload(req)) };
        await new Promise((r) => setTimeout(r, 5));
        yield { type: 'usage', inputTokens: 100, outputTokens: 50 };
        yield { type: 'done', stopReason: 'stop' };
      } finally { inFlight -= 1; }
    });
    await runReferenceDigest(f.input).catch(() => undefined);
    expect(f.calls.some((c) => c.purpose === 'reference-interim')).toBe(true);
    expect(maxParallel, 'one slot, never shared').toBe(1);
  });
});
