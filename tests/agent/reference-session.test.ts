import { it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentSession } from '../../src/agent/session.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { openScopedReferenceSnapshot } from '../../src/cli/repl/run.js';
import { expandAtRefs } from '../../src/cli/repl/at-ref.js';
import { bindNativePermissionIntent } from '../../src/agent/native-permission-binding.js';
import { createResolvedNativeEngine } from '../../src/cli/repl/run.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import { resolveLargeReferencePolicy } from '../../src/core/large-reference-policy.js';
import { resolveScratchRoot } from '../../src/agent/scratch-checkpoint.js';
import { projectSlug } from '../../src/core/project-slug.js';
import type { ProviderRequest, ProviderAdapter } from '../../src/agent/provider-tooluse/types.js';
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

it('largeReference is defaultOFF, strictly validates keys/types/bounds, and is config-resolved', () => {
  expect(resolveNativeAgentBudget({}).largeReference.enabled).toBe(false);
  expect(resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: true, maxRequests: 20 } } } }).largeReference.maxRequests).toBe(20);
  for (const value of [{ enabled: 'true' }, { unknown: 2 }, { maxRequests: 0 }, { maxWallTimeMs: NaN }, { maxReferences: 100 }]) expect(() => resolveLargeReferencePolicy(value)).toThrow();
});

async function fixture(tier: 'silent' | 'confirm' = 'silent') {
  const root = await mkdtemp(join(tmpdir(), 'reference-session-')); roots.push(root);
  const scope = { tenantId: 'test', projectId: 'project', sessionId: 'session', slug: projectSlug(root) };
  // The production session owns the same canonical scratch directory as its content store.
  const layout = resolveScratchRoot(scope); roots.push(layout.sessionRoot);
  const store = createSessionToolContentStore({ dir: layout.root });
  const registry = new ToolRegistry();
  registry.register({ name: 'deckent_read_file', description: 'Read', category: 'coding', tier, source: 'builtin',
    approval: args => ({ scope: 'file-read', risk: 'low', scopeId: 'deckent_read_file', resource: String(args.path) }),
    inputSchema: { type: 'object' }, handler: async () => ({ ok: true, output: '' }) });
  const requests: ProviderRequest[] = [];
  const adapter: ProviderAdapter = { name: 'fixture-reference-session', reasoningControl: () => ({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'configured' }),
    structuredOutputControl: () => ({ toggle: { kind: 'openai.response_format.json_schema' as const }, provenance: 'configured' as const }),
    requestMeasurement: { async measure() { return { inputTokens: 100, provenance: 'fixture' }; } },
    async *send(req) {
      requests.push(req);
      if (req.purpose === 'reference-interim') {
        // 7113-E D1 — a real interim answer is PROSE, not a digest payload.
        yield { type: 'text-delta', text: 'Partial reading so far; still in progress.' };
        yield { type: 'usage', inputTokens: 100, outputTokens: 30 };
        yield { type: 'done', stopReason: 'stop' };
        return;
      }
      if (req.purpose) {
        const data = JSON.parse(req.messages[0]!.content).data;
        const coverage = data.sections ?? data.children.flatMap((c: { coverage: unknown[] }) => c.coverage);
        yield { type: 'text-delta', text: JSON.stringify({ claims: [{ text: 'Fact', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['May omit detail.'] }) };
      } else yield { type: 'text-delta', text: 'Final answer' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 30 }; yield { type: 'done', stopReason: 'stop' };
    } };
  let deny = false;
  const create = (activeStore = store) => createAgentSession({ adapter, registry, policy: SAFE_DEFAULT_POLICY,
    ruleStore: { grant() {}, revoke() {}, activeRules: () => [], activeDenies: () => deny ? [{ tool: 'deckent_read_file', pattern: '*' }] : [] },
    cwd: root, model: 'fixture-reference-session', getContextBudgetTokens: () => 32768,
    nativeBudget: resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: true } } } }),
    scratch: { ...scope, checkpointInstruction: 'Checkpoint', checkpointProjectRoot: root }, contentStore: activeStore,
    referenceCapability: {
      snapshot: (path, scope, signal, authorizeRead) => openScopedReferenceSnapshot({ resolveCwd: () => root, path, scope, signal, authorizeRead, store: activeStore, maxBytes: 1_000_000, maxWallTimeMs: 10000 }),
      inline: (raw, contents) => { const expansion = expandAtRefs(raw, p => contents.get(p) ?? null); return { prompt: expansion.prompt, references: expansion.refs.map(r => ({ path: r.path, digest: r.digest, bytes: r.bytes, excerpt: '', ok: r.ok, truncated: r.truncated })) }; },
    },
  });
  return { root, layout, store, requests, create, adapter, registry, scope, setDeny: () => { deny = true; } };
}
it('keeps the small-reference payload byte-identical and never invokes the digest runner', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'small.md'), 'Small 😀'); const session = f.create();
  const events = []; for await (const ev of session.send({ rawIntent: '@small.md', expandedPayload: '@small.md', references: [], referenceRequests: ['small.md'] })) events.push(ev);
  expect(events.some(e => e.type === 'error')).toBe(false); expect(f.requests).toHaveLength(1);
  expect(f.requests[0]!.messages.at(-1)!.content).toBe(expandAtRefs('@small.md', () => 'Small 😀').prompt);
  session.close();
});
it('wires large references to measured child calls and returns only digests to the parent with exact total usage', async () => {
  const f = await fixture(); const text = 'Large source line.\n'.repeat(3000); await writeFile(join(f.root, 'large.md'), text); const session = f.create();
  const events = []; for await (const ev of session.send({ rawIntent: 'Analyze @large.md', expandedPayload: 'Analyze @large.md', references: [], referenceRequests: ['large.md'] })) events.push(ev);
  expect(events.filter(e => e.type === 'error')).toEqual([]);
  expect(f.requests.some(r => r.purpose === 'reference-map')).toBe(true);
  expect(f.requests.at(-1)!.purpose).toBeUndefined(); expect(f.requests.at(-1)!.messages.at(-1)!.content).toContain('[verified-reference-digests]');
  expect(session.transcript().some(m => m.content.includes(text))).toBe(false);
  const snapshot = await session.contextSnapshot();
  expect(snapshot.providerReportedUsage!.inputTokens).toBe(f.requests.length * 100);
  expect(snapshot.referenceDigest?.phase).toBe('ANSWERING');
  const count = f.requests.length;
  for await (const _ of session.send({ rawIntent: 'Analyze @large.md', expandedPayload: 'Analyze @large.md', references: [], referenceRequests: ['large.md'] })) { /* drain */ }
  expect(f.requests.length).toBe(count + 1);
  for await (const _ of session.send({ rawIntent: 'Different question @large.md', expandedPayload: 'Different question @large.md', references: [], referenceRequests: ['large.md'] })) { /* drain */ }
  expect(f.requests.length).toBeGreaterThan(count + 2); session.close();
});
it('denies a reference under the normal read policy before any provider call', async () => {
  const f = await fixture(); f.setDeny(); await writeFile(join(f.root, 'f'), 'data'); const session = f.create(); const events = [];
  for await (const ev of session.send({ rawIntent: '@f', expandedPayload: '@f', references: [], referenceRequests: ['f'] })) events.push(ev);
  expect(events.some(e => e.type === 'error')).toBe(true); expect(f.requests).toHaveLength(0); session.close();
});

it('reopens a fresh session/store over retained scratch and resumes completed digest nodes without repeating child calls', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'large.md'), 'Source line.\n'.repeat(4000));
  const turn = { rawIntent: 'Analyze @large.md', expandedPayload: 'Analyze @large.md', references: [], referenceRequests: ['large.md'] };
  const first = f.create(); for await (const _ of first.send(turn)) { /* drain */ }
  const before = f.requests.length; first.close({ keepForRecoveryMs: 60000 });
  const freshStore = createSessionToolContentStore({ dir: f.layout.root }); const second = f.create(freshStore);
  const events = []; for await (const event of second.send(turn)) events.push(event);
  expect(events.filter(e => e.type === 'error')).toEqual([]); expect(f.requests.length).toBe(before + 1);
  expect((await second.contextSnapshot()).providerReportedUsage!.inputTokens).toBe(f.requests.length * 100);
  second.close();
});

it('asks once for a scoped source and honors revocation before capture', async () => {
  for (const revoke of [false, true]) {
    const f = await fixture('confirm'); await writeFile(join(f.root, 'large.md'), 'Source line.\n'.repeat(4000));
    const session = f.create(); const events = []; let asks = 0;
    for await (const event of session.send({ rawIntent: '@large.md', expandedPayload: '@large.md', references: [], referenceRequests: ['large.md'] })) {
      events.push(event);
      if (event.type === 'permission-request') {
        asks++; if (revoke) f.setDeny();
        session.respondPermission(event, { decision: 'once', binding: bindNativePermissionIntent(event.invocation, 'once', event.resource) });
      }
    }
    expect(asks).toBe(1);
    expect(events.some(e => e.type === 'error')).toBe(revoke);
    expect(f.requests.length > 0).toBe(!revoke); session.close();
  }
});
it('config factory and hydrated bridge isolate child contexts while retaining parent history', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'large.md'), 'Source line.\n'.repeat(4000));
  const engine = createResolvedNativeEngine({ execution_budget: { native_agent: { largeReference: { enabled: true } } } }, {
    adapter: f.adapter, registry: f.registry, cwd: f.root, model: 'fixture-reference-session', lang: 'en', confirm: async () => 'n', toolSink: () => {},
    getContextBudgetTokens: () => 32768, scratch: { ...f.scope, checkpointProjectRoot: f.root }, contentStore: f.store,
  });
  engine.hydrateTranscript!([{ role: 'user', content: 'Prior private conversation' }]);
  const raw = 'Analyze @large.md';
  await engine(raw, { output: () => {}, onTurnEnd: () => {} }, { rawIntent: raw, expandedPayload: raw, references: [], referenceRequests: ['large.md'] });
  expect(f.requests.some(r => r.purpose)).toBe(true);
  expect(f.requests.filter(r => r.purpose).every(r => r.messages.length === 1 && !JSON.stringify(r.messages).includes('Prior private conversation'))).toBe(true);
  expect(f.requests.at(-1)!.messages[0]!.content).toBe('Prior private conversation'); engine.close!();
});

it('cancels a reference during measured admission without dispatching a child request', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'large.md'), 'Source line.\n'.repeat(4000)); const session = f.create();
  const measure = f.adapter.requestMeasurement!.measure;
  f.adapter.requestMeasurement!.measure = async (request, signal) => {
    if (request.purpose === 'reference-map') session.cancel();
    return measure(request, signal);
  };
  const raw = 'Cancellation admission unique @large.md';
  const events = []; for await (const event of session.send({ rawIntent: raw, expandedPayload: raw, references: [], referenceRequests: ['large.md'] })) events.push(event);
  expect(events.some(e => e.type === 'error')).toBe(true); expect(f.requests).toHaveLength(0); session.close();
});
it('persists ordinary round counters AFTER their usage event alongside digest counters', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'large.md'), 'Source line.\n'.repeat(4000)); const session = f.create();
  for await (const _ of session.send({ rawIntent: '@large.md', expandedPayload: '@large.md', references: [], referenceRequests: ['large.md'] })) { /* drain */ }
  const file = JSON.parse(await readFile(join(f.layout.root, 'reference-native-usage.json'), 'utf8'));
  const projection = JSON.parse(file.payload).projection;
  expect(projection.cumulativeTokens).toBe(f.requests.length * 130); expect(projection.lastInputTokens).toBe(100);
  expect(projection.rounds).toBe(f.requests.length); session.close();
});

it('a real session checkpoint retains host source and digest refs when summarization cannot produce JSON', async () => {
  const f = await fixture(); await writeFile(join(f.root, 'large.md'), 'Source line.\n'.repeat(4000)); const session = f.create();
  for await (const _ of session.send({ rawIntent: 'Checkpoint proof @large.md', expandedPayload: 'Checkpoint proof @large.md', references: [], referenceRequests: ['large.md'] })) { /* drain */ }
  const digest = (await session.contextSnapshot()).referenceDigest!.rootRef!;
  session.renewBudgetEpoch();
  for await (const _ of session.send('Continue')) { /* drain */ }
  const directory = join(f.root, '.deckent', 'runtime', 'sessions', f.scope.sessionId, 'checkpoints');
  const names = await readdir(directory); const records = await Promise.all(names.filter(n => n.endsWith('.json')).map(async n => JSON.parse(await readFile(join(directory, n), 'utf8'))));
  expect(records.some(r => r.payload.evidenceRefs.includes(`sha256:${digest}`))).toBe(true);
  expect((await f.store.readContentRef({ sha256: digest, offset: 0, limit: 65536 })).kind).toBe('loaded'); session.close();
});
