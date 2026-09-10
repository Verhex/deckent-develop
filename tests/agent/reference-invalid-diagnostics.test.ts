// 7113-E-DIAGNOSTICS — a rejected child response now says WHY, durably.
//
// The real run (attempt eed7045eabcb, 2026-09-10T01:28Z) lost 4 of 5 sections
// to REFERENCE_OUTPUT_INVALID and the journal recorded only `status: 'invalid'`,
// so the cause could not be determined afterwards. These tests pin the typed
// sub-reason for every seam, prove the outer code and the honest PARTIAL
// disposition are unchanged, and prove no response text is ever persisted.
import { describe, it, expect, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReferenceDigest } from '../../src/agent/reference-digest-runner.js';
import { validateDigestPayload, digestReferenceValue } from '../../src/agent/reference-digest-validation.js';
import { buildReferenceOutline } from '../../src/agent/reference-outline.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { openScratchStore } from '../../src/agent/scratch-checkpoint.js';
import { referenceInvalidReason } from '../../src/agent/reference-digest-runner-types.js';
import { REFERENCE_INVALID_REASONS, ReferenceDigestError } from '../../src/agent/reference-digest-types.js';
import type { ReferenceDigestInput, DigestCitation, DigestRequestRecord } from '../../src/agent/reference-digest-runner-types.js';
import type { ProviderRequest, ProviderEvent, ProviderUsage } from '../../src/agent/provider-tooluse/types.js';

const hash = (x: string | Buffer): string => createHash('sha256').update(x).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const descriptor = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true, provenance: 'configured' as const };

const POLICY = { maxResponseBytes: 8192, maxItems: 30, maxTextBytes: 2000 };
const coverage: DigestCitation[] = [{ sectionId: 's1', byteStart: 0, byteEnd: 100 }];
const goodPayload = {
  claims: [{ text: 'A fact.', citations: [{ sectionId: 's1', byteStart: 0, byteEnd: 10 }] }],
  decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['May omit detail.'],
};

function reasonOf(run: () => unknown): string {
  try { run(); return 'no-throw'; }
  catch (error) {
    if (!(error instanceof ReferenceDigestError)) throw error;
    expect(error.code).toBe('REFERENCE_OUTPUT_INVALID');
    return error.invalidReason ?? 'absent';
  }
}

describe('payload validation sub-reasons', () => {
  it('names the exact contract each malformed response broke', () => {
    expect(reasonOf(() => validateDigestPayload('x'.repeat(POLICY.maxResponseBytes + 1), coverage, POLICY))).toBe('payload-oversize');
    expect(reasonOf(() => validateDigestPayload('not json at all', coverage, POLICY))).toBe('payload-json-parse');
    expect(reasonOf(() => validateDigestPayload(JSON.stringify({ claims: [] }), coverage, POLICY))).toBe('payload-schema-keys');
    expect(reasonOf(() => validateDigestPayload(JSON.stringify({ ...goodPayload, decisions: [''] }), coverage, POLICY))).toBe('payload-string');
    expect(reasonOf(() => validateDigestPayload(JSON.stringify({ ...goodPayload, entities: 'nope' }), coverage, POLICY))).toBe('payload-array');
    expect(reasonOf(() => validateDigestPayload(JSON.stringify({
      ...goodPayload, claims: [{ text: 'A fact.', citations: [{ sectionId: 's1', byteStart: 0, byteEnd: 5000 }] }],
    }), coverage, POLICY))).toBe('payload-citation-range');
    expect(reasonOf(() => validateDigestPayload(JSON.stringify({
      ...goodPayload, claims: [{ text: 'A fact.', citations: [] }],
    }), coverage, POLICY))).toBe('payload-no-citation');
    expect(reasonOf(() => validateDigestPayload(JSON.stringify({ ...goodPayload, claims: [], lossNotes: [] }), coverage, POLICY))).toBe('payload-empty');
    // A valid payload still validates unchanged.
    expect(validateDigestPayload(JSON.stringify(goodPayload), coverage, POLICY).claims).toHaveLength(1);
  });

  it('every declared reason is a distinct member of the typed set', () => {
    expect(new Set(REFERENCE_INVALID_REASONS).size).toBe(REFERENCE_INVALID_REASONS.length);
    for (const reason of REFERENCE_INVALID_REASONS) expect(reason).toMatch(/^(stream|payload)-/);
  });
});

async function fixture(respond: (req: ProviderRequest) => AsyncIterable<ProviderEvent>) {
  const root = await mkdtemp(join(tmpdir(), 'reference-diag-')); roots.push(root);
  const scratch = openScratchStore({ tenantId: 't', projectId: 'p', sessionId: 's' }, { baseDir: root });
  const store = createSessionToolContentStore({ dir: join(scratch.info.root, 'content') });
  const bytes = Buffer.from('section body line\n'.repeat(20));
  const scope = { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') };
  const snapshot = {
    metadata: { schemaVersion: 1 as const, scope, sourceAuthority: 'reference-data' as const, sourceDigest: hash(bytes), bytes: bytes.length, encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture' },
    async *stream() { yield bytes; },
  };
  const outline = await buildReferenceOutline(snapshot, { maxPartBytes: 4096, maxNodes: 20, maxSourceBytes: 100_000 });
  const settled = new Map<string, ProviderUsage>();
  const input: ReferenceDigestInput = {
    snapshot, outline, scratch: scratch.info, contentStore: store,
    identity: { ...scope, schemaVersion: 1, partitionVersion: 1, sourceDigest: hash(bytes), descriptorDigest: digestReferenceValue(descriptor) },
    context: { provider: 'fixture', model: 'fixture', contextWindowTokens: 32000, contextProvenance: 'configured-narrowing' },
    instruction: 'Summarize the reference.',
    policy: { maxSourceBytes: 100_000, maxRequests: 20, maxDepth: 8, maxWallTimeMs: 20_000, maxTotalTokens: 100_000,
      maxMapOutputTokens: 512, maxReduceOutputTokens: 512, maxResponseBytes: 8192, maxItems: 30, maxTextBytes: 2000,
      finalAnswerReserveTokens: 1024, contextSafetyReserveTokens: 100, concurrencyCap: 1, providerConcurrency: 1, tenantConcurrency: 1, measurementTimeoutMs: 1000 },
    ledger: { async reserve() { return true; }, async settle(id, usage) { settled.set(id, usage); } },
    adapter: {
      name: 'fixture', reasoningControl: () => descriptor,
      structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
      requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture-exact' }; } },
      async *send(req) { yield* respond(req); },
    },
  };
  return { root, input, scratchRoot: scratch.info.root, settled };
}

async function journalRecords(scratchRoot: string): Promise<DigestRequestRecord[]> {
  const dir = (await readdir(scratchRoot)).find((name) => name.startsWith('reference-'))!;
  const entries = (await readdir(join(scratchRoot, dir))).sort();
  const last = JSON.parse(await readFile(join(scratchRoot, dir, entries.at(-1)!), 'utf8')) as { state: { requests: Record<string, DigestRequestRecord> } };
  return Object.values(last.state.requests);
}

describe('runner records the sub-reason durably', () => {
  it('a schema-invalid response is recorded as payload-json-parse with sizes and digests, never text', async () => {
    const secret = 'THE MODEL SAID SOMETHING PRIVATE';
    const f = await fixture(async function* () {
      yield { type: 'text-delta', text: secret };
      yield { type: 'usage', inputTokens: 100, outputTokens: 5 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('FAILED');
    expect(result.failure).toBe('REFERENCE_OUTPUT_INVALID');
    const invalid = (await journalRecords(f.scratchRoot)).filter((r) => r.status === 'invalid');
    expect(invalid.length).toBeGreaterThan(0);
    for (const record of invalid) {
      expect(referenceInvalidReason(record)).toBe('payload-json-parse');
      expect(record.diagnostics!.responseBytes).toBe(Buffer.byteLength(secret));
      expect(record.diagnostics!.retainedBytes).toBe(Buffer.byteLength(secret));
      expect(record.diagnostics!.responseSha256).toBe(hash(secret));
      expect(record.diagnostics!.stopReason).toBe('stop');
    }
    // The response text itself is nowhere in the durable journal.
    const dir = (await readdir(f.scratchRoot)).find((name) => name.startsWith('reference-'))!;
    for (const entry of await readdir(join(f.scratchRoot, dir))) {
      expect(await readFile(join(f.scratchRoot, dir, entry), 'utf8')).not.toContain(secret);
    }
  });

  it('a stream that stops for another reason is recorded as stream-non-stop, not as a payload fault', async () => {
    const f = await fixture(async function* () {
      yield { type: 'text-delta', text: JSON.stringify(goodPayload) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 5 };
      yield { type: 'done', stopReason: 'length' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.failure).toBe('REFERENCE_OUTPUT_INVALID');
    const invalid = (await journalRecords(f.scratchRoot)).filter((r) => r.status === 'invalid');
    for (const record of invalid) {
      expect(referenceInvalidReason(record)).toBe('stream-non-stop');
      expect(record.diagnostics!.stopReason).toBe('length');
    }
  });

  it('a stream that never completes is recorded as stream-missing-done', async () => {
    const f = await fixture(async function* () {
      yield { type: 'text-delta', text: JSON.stringify(goodPayload) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 5 };
    });
    await runReferenceDigest(f.input);
    const invalid = (await journalRecords(f.scratchRoot)).filter((r) => r.status === 'invalid');
    for (const record of invalid) expect(referenceInvalidReason(record)).toBe('stream-missing-done');
  });

  it('an oversize stream keeps the FULL-stream digest apart from the retained slice', async () => {
    const big = 'y'.repeat(9000); // > maxResponseBytes (8192)
    const f = await fixture(async function* () {
      yield { type: 'text-delta', text: big };
      yield { type: 'usage', inputTokens: 100, outputTokens: 5 };
      yield { type: 'done', stopReason: 'stop' };
    });
    await runReferenceDigest(f.input);
    const record = (await journalRecords(f.scratchRoot)).find((r) => r.status === 'invalid')!;
    expect(referenceInvalidReason(record)).toBe('stream-oversize');
    expect(record.diagnostics!.responseBytes).toBe(9000);
    // Nothing was retained past the cap, and the digest is of the WHOLE stream.
    expect(record.diagnostics!.retainedBytes).toBe(0);
    expect(record.diagnostics!.responseSha256).toBe(hash(big));
  });

  it('a valid response keeps its record clean: no diagnostics on success', async () => {
    const f = await fixture(async function* (req) {
      const data = JSON.parse(req.messages[0]!.content).data;
      const cov: DigestCitation[] = data.sections ?? data.children.flatMap((c: { coverage: DigestCitation[] }) => c.coverage);
      yield { type: 'text-delta', text: JSON.stringify({ ...goodPayload, claims: [{ text: 'A fact.', citations: [cov[0]] }] }) };
      yield { type: 'usage', inputTokens: 100, outputTokens: 5 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('ANSWERING');
    for (const record of await journalRecords(f.scratchRoot)) {
      expect(record.status).toBe('received');
      expect(record.diagnostics).toBeUndefined();
      expect(referenceInvalidReason(record)).toBe('unknown');
    }
  });

  it('a record written before this version reads back as unknown, never as a guess', () => {
    const legacy = { nodeId: 'n', attempt: 0, purpose: 'reference-map' as const, outputCeilingTokens: 2048, status: 'invalid' as const,
      measurement: { inputTokens: 10, quality: 'exact' as const, provenance: 'x', requestDigest: 'd', identity: { provider: 'p', model: 'm', contextWindowTokens: 1, contextProvenance: 'configured-narrowing' as const } } };
    expect(referenceInvalidReason(legacy)).toBe('unknown');
  });

  it('usage accounting and the bounded retry are untouched by the new record', async () => {
    let calls = 0;
    const f = await fixture(async function* () {
      calls++;
      yield { type: 'text-delta', text: 'still not json' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 7 };
      yield { type: 'done', stopReason: 'stop' };
    });
    const result = await runReferenceDigest(f.input);
    expect(result.failure).toBe('REFERENCE_OUTPUT_INVALID');
    // Exactly two attempts for the failing node, each settled exactly once.
    expect(calls).toBe(2);
    expect(f.settled.size).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 14 });
  });
});
