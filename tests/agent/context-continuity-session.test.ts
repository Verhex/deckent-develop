import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createAgentSession, type AgentSessionEvent } from '../../src/agent/session.js';
import { createSessionContentStore } from '../../src/agent/tool-result-broker.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import { INTERIM_CONTINUE_INSTRUCTION, INTERIM_DELIVERABLE_INSTRUCTION } from '../../src/agent/interim-deliverable.js';
import type { ProviderAdapter, ProviderEvent, ProviderMessage, ProviderRequest, RequestMeasurement } from '../../src/agent/provider-tooluse/types.js';
import { providerRequestWireUtf8Bytes } from '../../src/agent/context-budget.js';

const roots: string[] = [];
const checkpoint = JSON.stringify({ schemaVersion: 1, objective: 'continue', findings: [], evidenceRefs: [],
  decisions: [], unresolved: [], nextActions: [], inspectedAreas: [], toolResultDigests: [],
  cumulativeCounters: {}, createdAt: '2026-09-09T00:00:00.000Z' });
const drain = async (input: AsyncIterable<AgentSessionEvent>) => { const out: AgentSessionEvent[] = []; for await (const e of input) out.push(e); return out; };
/** 7110 — a MODEL-written checkpoint lands host-stamped: schema v2, host `createdAt`
 *  (the fixture's instant is discarded), host trail + last assistant text, host counters. */
const hostStamped = (model: Record<string, unknown>) => ({
  ...model, schemaVersion: 2, createdAt: expect.any(String), toolTrail: expect.any(Array), lastAssistantText: expect.any(String),
  cumulativeCounters: expect.objectContaining(model.cumulativeCounters as Record<string, number>),
});
/** Every v2 payload carries `toolTrailRef` (null when the trail was empty). */
const isTrailRef = (value: unknown): boolean => value === null || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
/** Resolve a `sha256:<digest>` evidence ref through the session store (never a path). */
const readEvidence = async (store: ReturnType<typeof createSessionContentStore>, ref: string): Promise<Buffer> => {
  expect(ref).toMatch(/^sha256:[a-f0-9]{64}$/);
  const read = await store.readContentRef({ sha256: ref.slice('sha256:'.length), offset: 0, limit: 256 * 1024 });
  if (read.kind !== 'loaded') throw new Error(`evidence ref unreadable: ${read.reasonCode}`);
  expect(read.nextOffset).toBeNull();
  return Buffer.from(read.bytes);
};
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function cwd() { const root = mkdtempSync(join(tmpdir(), 'context-continuity-')); roots.push(root); return root; }
function wireScaledMeasurement(adapter: ProviderAdapter): ProviderAdapter {
  return {
    ...adapter,
    requestMeasurement: {
      measure: async (request) => ({
        inputTokens: Math.ceil(providerRequestWireUtf8Bytes(request) / 4),
        quality: 'exact',
        provenance: 'fixture-wire-scaled',
      }),
    },
  };
}

function base(adapter: ProviderAdapter) {
  return { adapter, cwd: cwd(), model: 'fixture-context', registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY,
    ruleStore: { grant() {}, revoke() {}, activeRules: () => [], activeDenies: () => [] },
    nativeBudget: { ...resolveNativeAgentBudget({}), outputReserveTokens: 100, contextSafetyReserveTokens: 100 },
    getContextBudgetTokens: () => 131072,
    scratch: { tenantId: 'test', projectId: 'fixture', sessionId: 'session', checkpointInstruction: 'checkpoint-fixture' },
  };
}
describe('7105 session context continuity', () => {
  it.each([false, true])('takes an epoch before the single overflow retry; repeated refusal=%s', async repeated => {
    let calls = 0, checkpoints = 0;
    const adapter: ProviderAdapter = { name: `overflow-${repeated}`,
      async *send(req) {
        if (req.system === 'checkpoint-fixture') { checkpoints++; yield { type: 'text-delta', text: checkpoint }; yield { type: 'done' }; return; }
        calls++;
        if (calls === 1 || repeated) throw Object.assign(new Error('refused'), { code: 'INPUT_CONTEXT_OVERFLOW' });
        yield { type: 'text-delta', text: 'continued' }; yield { type: 'done' };
      },
    };
    const session = createAgentSession(base(adapter));
    try {
      const events = await drain(session.send('continue original task'));
      expect(calls).toBe(2); expect(checkpoints).toBe(1);
      expect((await session.contextSnapshot()).epoch).toBe(2);
      expect(events.filter(e => e.type === 'error')).toHaveLength(repeated ? 1 : 0);
      expect(events.filter(e => e.type === 'turn-end')).toHaveLength(1);
      expect((await session.contextSnapshot()).lastContextTrigger).toBe('overflow');
    } finally { session.close(); }
  });
  it('persists old tool bodies before deterministic micro-compaction and then summarizes', async () => {
    let normal = 0; let window: number | undefined;
    const stored = new Map<string, Buffer>();
    const requests: ProviderRequest[] = [];
    const adapter: ProviderAdapter = { name: 'micro-compaction',
      requestMeasurement: { async measure(req) { return { inputTokens: Buffer.byteLength(JSON.stringify(req)), provenance: 'fixture-wire-bytes' }; } },
      async *send(req) {
        if (req.system === 'checkpoint-fixture') { requests.push(req); yield { type: 'text-delta', text: checkpoint }; yield { type: 'done' }; return; }
        if (normal++ === 0) yield { type: 'tool-call', id: 'bulk', name: 'bulk', args: {} };
        else yield { type: 'text-delta', text: 'done' };
        yield { type: 'done' };
      },
    };
    const deps = base(adapter);
    deps.registry.register({ name: 'bulk', description: 'fixture', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin',
      approval: () => ({ scope: 'file-read', risk: 'low', scopeId: 'bulk', resource: 'fixture.txt' }),
      handler: async () => ({ ok: false, output: '[exit 9]\n' + 'original-byte-'.repeat(4000) }) });
    const session = createAgentSession({ ...deps, nativeBudget: undefined, getContextBudgetTokens: () => window,
      contentStore: { write(bytes) { const sha256 = createHash('sha256').update(bytes).digest('hex'); stored.set(sha256, bytes); return { path: `content:${sha256}`, sha256 }; } },
    });
    try {
      await drain(session.send('inspect bulk')); window = 1000;
      await drain(session.compactContext());
      expect(stored.size).toBeGreaterThan(0);
      expect([...stored.values()].some(bytes => bytes.toString().includes('original-byte-'))).toBe(true);
      expect((await session.contextSnapshot()).epoch).toBe(2);
      expect(session.transcript().filter(m => m.role === 'tool').every(m => m.content.includes('content:'))).toBe(true);
      expect(requests.every(req => Buffer.byteLength(JSON.stringify(req)) <= window!)).toBe(true);
    } finally { session.close(); }
  });
});


describe('checkpoint output continuation contract', () => {
  function scriptedCheckpoint(scripts: readonly (readonly ProviderEvent[])[]) {
    const requests: ProviderRequest[] = [];
    const adapter: ProviderAdapter = {
      name: 'checkpoint-output-continuation',
      async *send(request) {
        expect(request.system).toBe('checkpoint-fixture');
        requests.push(request);
        const script = scripts[requests.length - 1];
        if (!script) throw new Error('unexpected extra checkpoint request');
        for (const event of script) yield event;
      },
    };
    return { adapter, requests };
  }
  const usageEvents = (events: readonly AgentSessionEvent[]) => events.filter(event => event.type === 'usage');

  it('persists byte-exact overlapping JSON fragments only after terminal stop and accounts for both segments', async () => {
    const payload = { ...JSON.parse(checkpoint), objective: 'aaaa' };
    const serialized = JSON.stringify(payload);
    const split = serialized.indexOf('aaaa') + 2;
    const prefix = serialized.slice(0, split);
    const suffix = serialized.slice(split);
    expect(prefix.endsWith('aa') && suffix.startsWith('aa')).toBe(true);
    const { adapter, requests } = scriptedCheckpoint([
      [{ type: 'text-delta', text: prefix }, { type: 'usage', inputTokens: 13, outputTokens: 7 }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: suffix }, { type: 'usage', inputTokens: 17, outputTokens: 11 }, { type: 'done', stopReason: 'stop' }],
    ]);
    const session = createAgentSession(base(adapter));
    try {
      const events = await drain(session.compactContext());
      expect(requests).toHaveLength(2);
      expect(requests[1]?.messages.some(message => message.role === 'assistant' && message.content === prefix)).toBe(true);
      expect(requests.every(request => request.outputCeilingTokens === 100 && request.tools.length === 0)).toBe(true);
      expect(usageEvents(events)).toEqual([{ type: 'usage', inputTokens: 30, outputTokens: 18 }]);
      const latest = session.latestCheckpoint();
      expect(latest.status).toBe('ok');
      if (latest.status !== 'ok') throw new Error('checkpoint did not persist');
      expect(latest.payload).toMatchObject(hostStamped(payload));
      expect(isTrailRef(latest.payload.toolTrailRef)).toBe(true);
      expect(latest.payload.createdAt).not.toBe(payload.createdAt);
      expect(latest.receipt.digest).toBe(createHash('sha256').update(JSON.stringify(latest.payload)).digest('hex'));
      expect(JSON.parse(readFileSync(latest.receipt.path, 'utf8')).payload).toMatchObject(hostStamped(payload));
      const snapshot = await session.contextSnapshot();
      expect(snapshot.epoch).toBe(2);
      expect(snapshot.providerReportedUsage).toEqual({ inputTokens: 30, outputTokens: 18, reports: 2 });
    } finally { session.close(); }
  });

  it('continues hidden-only length output with a complete visible JSON response', async () => {
    const { adapter, requests } = scriptedCheckpoint([
      [{ type: 'reasoning-activity', chars: 800 }, { type: 'usage', inputTokens: 10, outputTokens: 100 }, { type: 'done', stopReason: 'length' }],
      [{ type: 'text-delta', text: checkpoint }, { type: 'usage', inputTokens: 12, outputTokens: 80 }, { type: 'done', stopReason: 'stop' }],
    ]);
    const session = createAgentSession(base(adapter));
    try {
      const events = await drain(session.compactContext());
      expect(requests).toHaveLength(2);
      expect(requests[1]?.messages.some(message => message.role === 'assistant' && message.content === '')).toBe(false);
      expect(session.latestCheckpoint()).toMatchObject({ status: 'ok', payload: hostStamped(JSON.parse(checkpoint)) });
      expect((await session.contextSnapshot()).epoch).toBe(2);
      expect(usageEvents(events)).toEqual([{ type: 'usage', inputTokens: 22, outputTokens: 180 }]);
    } finally { session.close(); }
  });

  it('does not retry malformed JSON from a normal terminal stop', async () => {
    const { adapter, requests } = scriptedCheckpoint([
      [{ type: 'text-delta', text: '{"schemaVersion":' }, { type: 'usage', inputTokens: 3, outputTokens: 2 }, { type: 'done', stopReason: 'stop' }],
    ]);
    const session = createAgentSession(base(adapter));
    try {
      const events = await drain(session.compactContext());
      expect(requests).toHaveLength(1);
      expect(session.latestCheckpoint()).toMatchObject({ status: 'degraded', reasonCode: 'CHECKPOINT_RESPONSE_INVALID_JSON' });
      expect((await session.contextSnapshot()).epoch).toBe(1);
      expect(usageEvents(events)).toEqual([{ type: 'usage', inputTokens: 3, outputTokens: 2 }]);
    } finally { session.close(); }
  });

  it('exhausts at three length-terminated segments without committing an epoch', async () => {
    const { adapter, requests } = scriptedCheckpoint([1, 2, 3].map(() => [
      { type: 'text-delta', text: 'a' }, { type: 'usage', inputTokens: 10, outputTokens: 5 }, { type: 'done', stopReason: 'length' },
    ]));
    const session = createAgentSession(base(adapter));
    try {
      const events = await drain(session.compactContext());
      expect(requests).toHaveLength(3);
      expect(session.latestCheckpoint()).toMatchObject({ status: 'degraded', reasonCode: 'CHECKPOINT_OUTPUT_CONTINUATION_EXHAUSTED' });
      expect((await session.contextSnapshot()).epoch).toBe(1);
      expect(usageEvents(events)).toEqual([{ type: 'usage', inputTokens: 30, outputTokens: 15 }]);
    } finally { session.close(); }
  });

  it('cancels during continuation before a third request and retains observed usage', async () => {
    let cancel = () => {};
    const requests: ProviderRequest[] = [];
    const adapter: ProviderAdapter = { name: 'checkpoint-continuation-cancel', async *send(request) {
      requests.push(request);
      yield { type: 'text-delta', text: 'a' };
      yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
      if (requests.length === 2) cancel();
      yield { type: 'done', stopReason: 'length' };
    } };
    const session = createAgentSession(base(adapter));
    cancel = () => session.cancel();
    try {
      const events = await drain(session.compactContext());
      expect(requests).toHaveLength(2);
      expect(requests[1]?.signal?.aborted).toBe(true);
      expect(session.latestCheckpoint().status).toBe('degraded');
      expect((await session.contextSnapshot()).epoch).toBe(1);
      expect(usageEvents(events)).toEqual([{ type: 'usage', inputTokens: 20, outputTokens: 10 }]);
    } finally { session.close(); }
  });

  it('stops before the next segment when checkpoint usage exhausts the native cumulative budget', async () => {
    const { adapter, requests } = scriptedCheckpoint([
      [{ type: 'text-delta', text: '{' }, { type: 'usage', inputTokens: 10, outputTokens: 25 }, { type: 'done', stopReason: 'length' }],
    ]);
    const deps = base(adapter);
    const session = createAgentSession({ ...deps, nativeBudget: { ...deps.nativeBudget, maxCumulativeTokens: 30 } });
    try {
      const events = await drain(session.compactContext());
      expect(requests).toHaveLength(1);
      expect(session.latestCheckpoint().status).toBe('degraded');
      expect((await session.contextSnapshot()).epoch).toBe(1);
      expect(usageEvents(events)).toEqual([{ type: 'usage', inputTokens: 10, outputTokens: 25 }]);
    } finally { session.close(); }
  });
});


describe('durable deterministic checkpoint and compacted tool lineage', () => {
  it('persists the complete transcript before fallback and records the summary failure explicitly', async () => {
    const adapter: ProviderAdapter = { name: 'persisted-fallback', async *send(request) {
      yield { type: 'text-delta', text: request.system === 'checkpoint-fixture' ? '{invalid json' : 'unsummarized evidence from inspection' };
      yield { type: 'done', stopReason: 'stop' };
    } };
    const deps = base(adapter);
    const store = createSessionContentStore({ dir: join(deps.cwd, 'content') });
    const session = createAgentSession({ ...deps, contentStore: store });
    try {
      await drain(session.send('Preserve this original objective'));
      const original = session.transcript();
      const events = await drain(session.compactContext());
      expect(events).toContainEqual({ type: 'notice', code: 'native.checkpoint.deterministic', message: 'native.checkpoint.deterministic' });
      const latest = session.latestCheckpoint();
      expect(latest.status).toBe('ok');
      if (latest.status !== 'ok') throw new Error('fallback checkpoint missing');
      expect(latest.payload.unresolved).toContain('CHECKPOINT_RESPONSE_INVALID_JSON');
      expect(latest.payload.cumulativeCounters.deterministicFallback).toBe(1);
      expect(latest.payload.evidenceRefs).toHaveLength(1);
      const persisted = await readEvidence(store, latest.payload.evidenceRefs[0]!);
      expect(createHash('sha256').update(persisted).digest('hex')).toBe(latest.payload.toolResultDigests[0]);
      expect(JSON.parse(persisted.toString()).map((entry: { message: unknown }) => entry.message)).toEqual(original);
      expect((await session.contextSnapshot()).epoch).toBe(2);
      expect(session.transcript().some(message => message.content.includes(latest.payload.evidenceRefs[0]!))).toBe(true);
    } finally { session.close(); }
  });

  it.each(['digest-mismatch', 'write-failure'] as const)('keeps the old epoch when fallback persistence has %s', async mode => {
    let writes = 0;
    const adapter: ProviderAdapter = { name: `fallback-${mode}`, async *send(request) {
      yield { type: 'text-delta', text: request.system === 'checkpoint-fixture' ? 'malformed response' : 'original evidence' };
      yield { type: 'done', stopReason: 'stop' };
    } };
    const session = createAgentSession({ ...base(adapter), contentStore: { write() {
      writes++;
      if (mode === 'write-failure') throw new Error('fixture write refused');
      return { path: 'unverified-ref', sha256: '0'.repeat(64) };
    } } });
    try {
      await drain(session.send('retain objective'));
      const original = session.transcript();
      const events = await drain(session.compactContext());
      expect(writes).toBe(1);
      expect(events.some(event => event.type === 'notice' && event.code === 'native.checkpoint.deterministic')).toBe(false);
      expect(session.latestCheckpoint()).toMatchObject({ status: 'degraded', reasonCode: 'CHECKPOINT_RESPONSE_INVALID_JSON' });
      expect((await session.contextSnapshot()).epoch).toBe(1);
      expect(session.transcript()).toEqual(original);
    } finally { session.close(); }
  });

  it('shrinks retained large tool bodies to durable paired references even when the model summary succeeds', async () => {
    let normalCalls = 0;
    let window: number | undefined;
    const outputs = new Map([1, 2, 3, 4].map(index => [`result-${index}`, `tool-${index}:` + 'large-evidence-'.repeat(400)]));
    const adapter: ProviderAdapter = { name: 'successful-summary-large-lineage', async *send(request) {
      if (request.system === 'checkpoint-fixture') yield { type: 'text-delta', text: checkpoint };
      else if (normalCalls++ === 0) {
        for (const id of outputs.keys()) yield { type: 'tool-call', id, name: 'inspect', args: { id } };
      } else yield { type: 'text-delta', text: 'inspection complete' };
      yield { type: 'done', stopReason: 'stop' };
    } };
    const deps = base(adapter);
    deps.registry.register({ name: 'inspect', description: 'Read evidence', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin',
      approval: () => ({ scope: 'file-read', risk: 'low', scopeId: 'fixture', resource: 'fixture.txt' }),
      handler: async args => ({ ok: true, output: outputs.get(String(args.id))! }) });
    const store = createSessionContentStore({ dir: join(deps.cwd, 'content') });
    const session = createAgentSession({ ...deps, nativeBudget: undefined, getContextBudgetTokens: () => window, contentStore: store });
    try {
      await drain(session.send('inspect all evidence'));
      expect(session.transcript().filter(message => message.role === 'tool').every(message => Buffer.byteLength(message.content) > 512)).toBe(true);
      window = 131072;
      await drain(session.compactContext());
      expect((await session.contextSnapshot()).epoch).toBe(2);
      const messages = session.transcript();
      const tools = messages.filter(message => message.role === 'tool');
      expect(tools).toHaveLength(4);
      for (const message of tools) {
        expect(Buffer.byteLength(message.content)).toBeLessThanOrEqual(512);
        const ref = /full content at (.+)$/.exec(message.content)?.[1];
        expect(ref).toBeDefined();
        expect(readFileSync(ref!, 'utf8')).toBe(outputs.get(message.toolCallId!));
        expect(messages.some(candidate => candidate.role === 'assistant' && candidate.toolCalls?.some(call => call.id === message.toolCallId))).toBe(true);
      }
      expect(session.latestCheckpoint()).toMatchObject({ status: 'ok', payload: hostStamped(JSON.parse(checkpoint)) });
    } finally { session.close(); }
  });
});


describe('empty-visible checkpoint uses durable fallback without another provider call', () => {
  it('persists the full transcript after one hidden-only length response and retains its reported usage', async () => {
    const checkpointRequests: ProviderRequest[] = [];
    const adapter: ProviderAdapter = { name: 'empty-visible-durable-fallback', async *send(request) {
      if (request.system === 'checkpoint-fixture') {
        checkpointRequests.push(request);
        if (checkpointRequests.length > 1) throw new Error('checkpoint must not request another hidden-only generation');
        yield { type: 'reasoning-activity', chars: 16000 };
        yield { type: 'usage', inputTokens: 213, outputTokens: 4096 };
        yield { type: 'done', stopReason: 'length' };
      } else {
        yield { type: 'text-delta', text: 'Inspection evidence to retain exactly' };
        yield { type: 'done', stopReason: 'stop' };
      }
    } };
    const deps = base(adapter);
    const store = createSessionContentStore({ dir: join(deps.cwd, 'empty-visible-content') });
    const session = createAgentSession({ ...deps, nativeBudget: { ...deps.nativeBudget, outputReserveTokens: 4096 }, contentStore: store });
    try {
      await drain(session.send('Keep the original investigation objective'));
      const original = session.transcript();
      const events = await drain(session.compactContext());
      expect(checkpointRequests).toHaveLength(1);
      expect(checkpointRequests[0]?.outputCeilingTokens).toBe(4096);
      expect(events.filter(event => event.type === 'usage')).toEqual([{ type: 'usage', inputTokens: 213, outputTokens: 4096 }]);
      expect(events).toContainEqual({ type: 'notice', code: 'native.checkpoint.deterministic', message: 'native.checkpoint.deterministic' });
      const latest = session.latestCheckpoint();
      expect(latest.status).toBe('ok');
      if (latest.status !== 'ok') throw new Error('durable fallback checkpoint missing');
      expect(latest.payload.unresolved).toContain('CHECKPOINT_RESPONSE_MISSING');
      const bytes = await readEvidence(store, latest.payload.evidenceRefs[0]!);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(latest.payload.toolResultDigests[0]);
      expect(JSON.parse(bytes.toString()).map((entry: { message: unknown }) => entry.message)).toEqual(original);
      const snapshot = await session.contextSnapshot();
      expect(snapshot.epoch).toBe(2);
      expect(snapshot.providerReportedUsage).toEqual({ inputTokens: 213, outputTokens: 4096, reports: 1 });
    } finally { session.close(); }
  });
});


describe('large completed batch survives an automatic context epoch', () => {
  it('retains all 24 paired small references and does not execute the batch a second time', async () => {
    const ids = Array.from({ length: 24 }, (_, index) => `inspection-${index}`);
    const outputs = new Map(ids.map(id => [id, `${id}:`.padEnd(900, 'x')]));
    const normalRequests: ProviderRequest[] = [];
    let checkpointCalls = 0;
    let handlerCalls = 0;
    const completedCheckpoint = JSON.stringify({ ...JSON.parse(checkpoint),
      findings: ['All 24 inspections completed'], nextActions: ['Report the findings without rerunning inspections'],
    });
    const adapter: ProviderAdapter = wireScaledMeasurement({
      name: 'large-completed-batch-lineage',
      async *send(request) {
        if (request.system === 'checkpoint-fixture') {
          checkpointCalls++;
          yield { type: 'text-delta', text: completedCheckpoint };
          yield { type: 'done', stopReason: 'stop' };
          return;
        }
        normalRequests.push(request);
        const paired = request.messages.filter(message => message.role === 'tool');
        // Reproduce the incident's retry behavior if the checkpoint loses the
        // completed group; assertions below must catch the resulting 48 calls.
        if (normalRequests.length === 1 || (normalRequests.length === 2 && paired.length !== 24)) {
          for (const id of ids) yield { type: 'tool-call', id, name: 'inspect', args: { id } };
        } else yield { type: 'text-delta', text: 'All inspections are complete; reporting findings.' };
        yield { type: 'done', stopReason: 'stop' };
      },
    });
    const deps = base(adapter);
    deps.registry.register({ name: 'inspect', description: 'Read the next evidence item', inputSchema: { type: 'object' },
      category: 'coding', tier: 'silent', source: 'builtin',
      approval: () => ({ scope: 'file-read', risk: 'low', scopeId: 'fixture', resource: 'fixture.txt' }),
      handler: async args => { handlerCalls++; return { ok: true, output: outputs.get(String(args.id))! }; },
    });
    const store = createSessionContentStore({ dir: join(deps.cwd, 'large-batch-content') });
    const session = createAgentSession({
      ...deps,
      nativeBudget: resolveNativeAgentBudget({}),
      contentStore: store,
      // Wire-scaled window: 24 brokered ~512 B refs exceed the ~1843-token retained
      // high-water (12288 × 0.20 × 0.75) yet the resumed request still admits (<12288).
      getContextBudgetTokens: () => 12_288,
    });
    try {
      const events = await drain(session.send('Inspect the 24 items once, then report findings'));
      expect(events.some(event => event.type === 'error')).toBe(false);
      expect(handlerCalls).toBe(24);
      expect(checkpointCalls).toBe(1);
      // 7114 — a 24-call silent batch is exactly the measured incident shape:
      // after the batch the host injects the interim-deliverable turn (request
      // 2 carries it), the fixture answers with text only, so ONE continue
      // host turn follows (request 3) and the turn ends. Still no re-execution.
      expect(normalRequests).toHaveLength(3);
      expect(normalRequests[1]!.messages.at(-1)).toEqual({ role: 'user', content: INTERIM_DELIVERABLE_INSTRUCTION });
      expect(normalRequests[2]!.messages.at(-1)).toEqual({ role: 'user', content: INTERIM_CONTINUE_INSTRUCTION });
      expect((await session.contextSnapshot()).epoch).toBe(2);
      expect((await session.contextSnapshot()).interimDeliverable).toMatchObject({ requested: 1, lastTrigger: 'tool-calls' });
      const resumed = normalRequests[1]!.messages;
      const owners = resumed.filter(message => message.role === 'assistant' && message.toolCalls?.length);
      expect(owners).toHaveLength(1);
      expect(owners[0]!.toolCalls!.map(call => call.id)).toEqual(ids);
      const results = resumed.filter(message => message.role === 'tool');
      expect(results.map(message => message.toolCallId)).toEqual(ids);
      for (const result of results) {
        expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(512);
        const ref = /full content at (.+)$/.exec(result.content)?.[1];
        expect(ref).toBeDefined();
        expect(readFileSync(ref!, 'utf8')).toBe(outputs.get(result.toolCallId!));
      }
      expect(session.latestCheckpoint()).toMatchObject({ status: 'ok', payload: hostStamped(JSON.parse(completedCheckpoint)) });
    } finally { session.close(); }
  });
});
