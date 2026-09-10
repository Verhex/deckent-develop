// 7113 D — the session delivers digest progress WHILE the program runs (not as
// an end-of-run batch), exposes it on /context, and never leaves an abandoned
// program running unowned.
import { it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentSession } from '../../src/agent/session.js';
import { createSessionToolContentStore } from '../../src/agent/session-tool-content.js';
import { openScopedReferenceSnapshot } from '../../src/cli/repl/run.js';
import { expandAtRefs } from '../../src/cli/repl/at-ref.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import { resolveScratchRoot } from '../../src/agent/scratch-checkpoint.js';
import { projectSlug } from '../../src/core/project-slug.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderRequest, ProviderAdapter } from '../../src/agent/provider-tooluse/types.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture(options: { enabled?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'reference-progress-')); roots.push(root);
  const scope = { tenantId: 'test', projectId: 'project', sessionId: 'session', slug: projectSlug(root) };
  const layout = resolveScratchRoot(scope); roots.push(layout.sessionRoot);
  const store = createSessionToolContentStore({ dir: layout.root });
  const registry = new ToolRegistry();
  registry.register({ name: 'deckent_read_file', description: 'Read', category: 'coding', tier: 'silent', source: 'builtin',
    approval: args => ({ scope: 'file-read', risk: 'low', scopeId: 'deckent_read_file', resource: String(args.path) }),
    inputSchema: { type: 'object' }, handler: async () => ({ ok: true, output: '' }) });
  const requests: ProviderRequest[] = [];
  let gate: (() => void) | undefined;
  let held: Promise<void> | undefined;
  const adapter: ProviderAdapter = {
    name: 'fixture-reference-progress',
    reasoningControl: () => ({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'configured' }),
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
        if (held) { await held; held = undefined; }
        const data = JSON.parse(req.messages[0]!.content).data;
        const coverage = data.sections ?? data.children.flatMap((c: { coverage: unknown[] }) => c.coverage);
        yield { type: 'text-delta', text: JSON.stringify({ claims: [{ text: 'Fact', citations: [coverage[0]] }], decisions: [], entities: [], openQuestions: [], contradictions: [], lossNotes: ['May omit detail.'] }) };
      } else yield { type: 'text-delta', text: 'Final answer' };
      yield { type: 'usage', inputTokens: 100, outputTokens: 30 };
      yield { type: 'done', stopReason: 'stop' };
    },
  };
  const session = createAgentSession({
    adapter, registry, policy: SAFE_DEFAULT_POLICY,
    ruleStore: { grant() {}, revoke() {}, activeRules: () => [], activeDenies: () => [] },
    cwd: root, model: 'fixture-reference-progress', getContextBudgetTokens: () => 32768,
    nativeBudget: resolveNativeAgentBudget({ policy: { native_agent: { largeReference: { enabled: options.enabled !== false } } } }),
    scratch: { ...scope, checkpointInstruction: 'Checkpoint', checkpointProjectRoot: root }, contentStore: store,
    referenceCapability: {
      snapshot: (path, snapshotScope, signal, authorizeRead) => openScopedReferenceSnapshot({ resolveCwd: () => root, path, scope: snapshotScope, signal, authorizeRead, store, maxBytes: 1_000_000, maxWallTimeMs: 10_000 }),
      inline: (raw, contents) => { const expansion = expandAtRefs(raw, p => contents.get(p) ?? null); return { prompt: expansion.prompt, references: expansion.refs.map(r => ({ path: r.path, digest: r.digest, bytes: r.bytes, excerpt: '', ok: r.ok, truncated: r.truncated })) }; },
    },
  });
  await writeFile(join(root, 'large.md'), 'Large source line.\n'.repeat(3000));
  return {
    root, session, requests,
    hold() { held = new Promise<void>(resolve => { gate = resolve; }); },
    release() { gate?.(); gate = undefined; },
    turn: () => session.send({ rawIntent: 'Analyze @large.md', expandedPayload: 'Analyze @large.md', references: [], referenceRequests: ['large.md'] }),
  };
}

it('delivers progress events while the digest program is still running', async () => {
  const f = await fixture();
  f.hold();
  const seen: AgentEvent[] = [];
  const iterator = f.turn()[Symbol.asyncIterator]();
  // Drain until the program is parked INSIDE its first child call. Reaching the
  // MAPPING projection while that call is in flight is only possible if the
  // events are delivered as they happen, not collected at the end.
  let mapping;
  for (;;) {
    const next = await iterator.next();
    if (next.done) break;
    seen.push(next.value);
    if (next.value.type === 'reference-progress' && next.value.progress.phase === 'MAPPING') { mapping = next.value.progress; break; }
  }
  expect(mapping).toBeDefined();
  // The source is fully verified, the first child call is on the wire, and no
  // verified map node exists yet — a mid-program projection, not a summary.
  expect(mapping!.observedBytes).toBe(mapping!.sourceBytes);
  expect(mapping!.requests.map).toBe(0);
  expect(mapping!.coveredBytes).toBe(0);
  // Nothing has been answered yet: every request so far is a child call, so
  // this projection reached the consumer mid-program.
  expect(f.requests.every(r => r.purpose)).toBe(true);
  expect(seen[0]!.type).toBe('reference-progress');
  expect(seen.some(e => e.type === 'turn-end')).toBe(false);
  f.release();
  for (;;) { const next = await iterator.next(); if (next.done) break; seen.push(next.value); }
  const phases = seen.filter(e => e.type === 'reference-progress').map(e => e.progress.phase);
  expect(phases[0]).toBe('ADMITTING');
  expect(phases.at(-1)).toBe('COMPLETE');
  f.session.close();
});

it('publishes the retained digest cost and the source path on /context', async () => {
  const f = await fixture();
  for await (const _ of f.turn()) { /* drain */ }
  const snapshot = await f.session.contextSnapshot();
  const progress = snapshot.referenceProgress!;
  expect(progress.phase).toBe('COMPLETE');
  expect(progress.sourcePath).toBe('large.md');
  expect(progress.sourceBytes).toBe('Large source line.\n'.repeat(3000).length);
  expect(progress.retained!.digestTokens).toBeGreaterThan(0);
  expect(progress.retained!.windowTokens).toBe(32768);
  expect(progress.retained!.capTokens).toBeGreaterThan(0);
  expect(progress.usage.inputTokens).toBeGreaterThan(0);
  expect(progress.journalRef).toMatch(/^reference-journal:/);
  f.session.close();
});

it('an abandoned turn stops the digest program instead of leaving it running', async () => {
  const f = await fixture();
  f.hold();
  const iterator = f.turn()[Symbol.asyncIterator]();
  let first;
  do { first = await iterator.next(); } while (!first.done && first.value.type !== 'reference-progress');
  const requestsAtAbandon = f.requests.length;
  // The consumer walks away mid-program (Esc, a thrown view, a closed stream).
  await iterator.return!(undefined);
  f.release();
  await new Promise(resolve => setTimeout(resolve, 50));
  expect(f.requests.length).toBe(requestsAtAbandon);
  f.session.close();
});

it('emits no progress at all when large references are disabled', async () => {
  const f = await fixture({ enabled: false });
  const seen: AgentEvent[] = [];
  for await (const ev of f.turn()) seen.push(ev);
  expect(seen.some(e => e.type === 'reference-progress')).toBe(false);
  const snapshot = await f.session.contextSnapshot();
  expect(snapshot.referenceProgress).toBeUndefined();
  f.session.close();
});
