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

async function fixture(options: { enabled?: boolean; interimUsage?: 'conflicting' } = {}) {
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
        yield { type: 'text-delta', text: 'Partial reading so far, still in progress. '.repeat(8) };
        yield { type: 'usage', inputTokens: 100, outputTokens: 30 };
        // Two contradicting reports: the usage can never be reconciled.
        if (options.interimUsage === 'conflicting') yield { type: 'usage', inputTokens: 101, outputTokens: 31 };
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
    nativeBudget: resolveNativeAgentBudget({ policy: { native_agent: {
      // The cadence must be reachable inside a hermetic run.
      interimAnswerAfterMs: 1,
      largeReference: { enabled: options.enabled !== false } } } }),
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

// 7113-E B-2 rev2 — enqueueing an event is NOT delivering it. If the consumer
// abandons the turn before the drain loop yields the interim answer, nothing
// reached the user and nothing may be counted.
it('does not count an interim answer the consumer never received', async () => {
  const f = await fixture();
  const events: AgentEvent[] = [];
  const iterator = f.turn()[Symbol.asyncIterator]();
  // Take exactly one event, then abandon the turn.
  const first = await iterator.next();
  if (!first.done) events.push(first.value);
  await iterator.return?.(undefined as never);
  const snapshot = await f.session.contextSnapshot();
  expect(snapshot?.interimDeliverable?.delivered ?? 0).toBe(0);
  // And no assistant text was handed over either.
  expect(events.filter((e) => e.type === 'text-delta')).toHaveLength(0);
});

// 7113-E B-2 rev3 — the hold must reach the CALLER, not just the runner result.
// A field nobody reads is decoration; this asserts the production chain:
// runner result → reference-session consumer → session notice + /context.
it('carries an unreconciled interim cost to the session as an OPEN hold', async () => {
  const f = await fixture({ interimUsage: 'conflicting' });
  const events: AgentEvent[] = [];
  for await (const event of f.turn()) events.push(event);

  const notice = events.find((e) => e.type === 'notice' && e.code === 'native.reference.usage-hold');
  expect(notice, 'the user is told the cost did not settle').toBeDefined();

  const snapshot = await f.session.contextSnapshot();
  // One hold per unreconciled attempt; the invariant is that every id reported
  // is real and none of them was settled, not a particular count.
  const held = snapshot?.referenceUsageHold?.requestIds ?? [];
  expect(held.length).toBeGreaterThanOrEqual(1);
  expect(snapshot?.referenceProgress?.unresolvedInterimUsage ?? []).toEqual(held);
  // The reading itself is still usable; only the settlement claim is withheld.
});
