// 7113 D — host progress projection: the runner publishes at every REAL
// transition, the numbers come from the durable journal (never from model
// output), and an unknown value is absent rather than zero.
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
import type { ReferenceDigestInput, DigestCitation } from '../../src/agent/reference-digest-runner-types.js';
import type { ReferenceDigestProgress } from '../../src/agent/reference-digest-types.js';
import type { ProviderRequest, ProviderEvent, ProviderUsage } from '../../src/agent/provider-tooluse/types.js';

const hash = (x: string | Buffer): string => createHash('sha256').update(x).digest('hex');
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const descriptor = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true, provenance: 'configured' as const };

function payload(req: ProviderRequest) {
  const data = JSON.parse(req.messages[0]!.content).data;
  const coverage: DigestCitation[] = data.sections ?? data.children.flatMap((c: { coverage: DigestCitation[] }) => c.coverage);
  return { claims: [{ text: 'Source fact', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['Summary may omit detail.'] };
}

async function fixture(text = 'section body line\n'.repeat(40), partBytes = 128) {
  const root = await mkdtemp(join(tmpdir(), 'digest-progress-')); roots.push(root);
  const scratch = openScratchStore({ tenantId: 't', projectId: 'p', sessionId: 's' }, { baseDir: root });
  const store = createSessionToolContentStore({ dir: join(scratch.info.root, 'content') });
  const bytes = Buffer.from(text), scope = { tenantId: 't', projectId: 'p', sessionId: 's', policyDigest: hash('policy') };
  const snapshot = {
    metadata: { schemaVersion: 1 as const, scope, sourceAuthority: 'reference-data' as const, sourceDigest: hash(bytes), bytes: bytes.length, encoding: 'utf-8' as const, createdAt: new Date(0).toISOString(), snapshotRef: 'fixture' },
    async *stream() { for (let i = 0; i < bytes.length; i += 37) yield bytes.subarray(i, i + 37); },
  };
  const outline = await buildReferenceOutline(snapshot, { maxPartBytes: partBytes, maxNodes: 100, maxSourceBytes: 100_000 });
  const progress: ReferenceDigestProgress[] = [];
  const settled = new Map<string, ProviderUsage>();
  let respond: (req: ProviderRequest) => AsyncIterable<ProviderEvent> = async function* (req) {
    yield { type: 'text-delta', text: JSON.stringify(payload(req)) };
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
      finalAnswerReserveTokens: 1024, contextSafetyReserveTokens: 100, concurrencyCap: 1, providerConcurrency: 1, tenantConcurrency: 1, measurementTimeoutMs: 1000 },
    ledger: { async reserve() { return true; }, async settle(id, usage) { settled.set(id, usage); } },
    adapter: {
      name: 'fixture', reasoningControl: () => descriptor,
      structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
      requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture-exact' }; } },
      async *send(req) { yield* respond(req); },
    },
    onDigestProgress: p => { progress.push(p); },
  };
  return { input, progress, settled, sourceBytes: bytes.length, setRespond(fn: typeof respond) { respond = fn; } };
}

describe('7113 D runner progress projection', () => {
  it('publishes every real phase in order and never reports a section total it does not have', async () => {
    const f = await fixture();
    const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('ANSWERING');
    const phases = f.progress.map(p => p.phase);
    expect(phases[0]).toBe('ADMITTING');
    expect(phases).toContain('SNAPSHOTTING');
    expect(phases).toContain('MAPPING');
    expect(phases.at(-1)).toBe('ANSWERING');
    // Order is the durable journal's order, not a UI guess.
    const order = ['ADMITTING', 'SNAPSHOTTING', 'MAPPING', 'REDUCING', 'ANSWERING'];
    const seen = phases.filter((p, i) => i === 0 || p !== phases[i - 1]!);
    expect(seen).toEqual(order.filter(p => seen.includes(p)));
    for (const p of f.progress) {
      expect(p.sourceBytes).toBe(f.sourceBytes);
      expect(p.sections!.total).toBeGreaterThan(0);
      expect(p.sections!.covered).toBeLessThanOrEqual(p.sections!.total);
      expect(p.coveredBytes).toBeLessThanOrEqual(p.sourceBytes);
      expect(p.journalRef).toMatch(/^reference-journal:/);
      expect(p.deadlineRemainingMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts only settled usage and verified requests, never a reserved ceiling', async () => {
    const f = await fixture();
    await runReferenceDigest(f.input);
    const settledInput = [...f.settled.values()].reduce((n, u) => n + u.inputTokens, 0);
    const settledOutput = [...f.settled.values()].reduce((n, u) => n + u.outputTokens, 0);
    const last = f.progress.at(-1)!;
    expect(last.usage).toEqual({ inputTokens: settledInput, outputTokens: settledOutput });
    // Every published usage is a prefix sum of settled records: never larger.
    for (const p of f.progress) {
      expect(p.usage.inputTokens).toBeLessThanOrEqual(settledInput);
      expect(p.usage.outputTokens).toBeLessThanOrEqual(settledOutput);
      expect(p.requests.map + p.requests.reduce).toBeLessThanOrEqual(p.requests.cap);
    }
    // A request that is reserved but has not answered yet is not "verified".
    const beforeFirstNode = f.progress.find(p => p.phase === 'MAPPING')!;
    expect(beforeFirstNode.requests.map).toBe(0);
  });

  it('observed bytes grow while the source is verified, and coverage grows only with verified nodes', async () => {
    const f = await fixture();
    await runReferenceDigest(f.input);
    const observed = f.progress.filter(p => p.phase === 'SNAPSHOTTING').map(p => p.observedBytes ?? 0);
    expect(observed.length).toBeGreaterThan(1);
    expect(observed).toEqual([...observed].sort((a, b) => a - b));
    expect(observed.at(-1)).toBe(f.sourceBytes);
    const covered = f.progress.map(p => p.coveredBytes);
    expect(covered).toEqual([...covered].sort((a, b) => a - b));
    expect(f.progress.at(-1)!.coveredBytes).toBe(f.sourceBytes);
  });

  it('records the typed failure on the terminal projection', async () => {
    const f = await fixture();
    f.setRespond(async function* () { yield { type: 'text-delta', text: 'not json' }; yield { type: 'usage', inputTokens: 100, outputTokens: 5 }; yield { type: 'done', stopReason: 'stop' }; });
    const result = await runReferenceDigest(f.input);
    expect(result.phase).toBe('FAILED');
    const last = f.progress.at(-1)!;
    expect(last.phase).toBe('FAILED');
    expect(last.failure).toBe('REFERENCE_OUTPUT_INVALID');
    expect(last.coveredBytes).toBe(0);
  });

  it('a throwing view never fails the program', async () => {
    const f = await fixture();
    f.input.onDigestProgress = () => { throw new Error('view fault'); };
    await expect(runReferenceDigest(f.input)).resolves.toMatchObject({ phase: 'ANSWERING' });
  });

  it('publishes nothing when no view is listening', async () => {
    const f = await fixture();
    delete f.input.onDigestProgress;
    await expect(runReferenceDigest(f.input)).resolves.toMatchObject({ phase: 'ANSWERING' });
    expect(f.progress).toEqual([]);
  });
});
