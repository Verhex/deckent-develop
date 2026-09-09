// tests/agent/checkpoint-continuity.test.ts
// 7110 TERMINAL-CHECKPOINT-CONTINUITY-001 — session-level proof that a
// checkpoint carries REAL host-derived working state, that a fresh epoch opens
// on it, that model-written checkpoints are host-stamped, and that a
// post-checkpoint byte-identical read-only call is served from the trail
// instead of re-executed (the measured 30-minute restart loop).
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createAgentSession, type AgentSessionDeps, type AgentSessionEvent } from '../../src/agent/session.js';
import { createSessionContentStore } from '../../src/agent/tool-result-broker.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import { toolCallDigest, type CheckpointTrailLabels } from '../../src/agent/checkpoint-trail.js';
import { CONTENT_REF_TOOL_NAME } from '../../src/agent/tools/content-ref-tool.js';
import { estimateTokens } from '../../src/agent/context-budget.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';

const CHECKPOINT_SYSTEM = 'checkpoint-fixture-7110';
const HOST_NOW = new Date('2026-09-09T12:21:46.651Z');
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function tmp(prefix: string): string { const root = mkdtempSync(join(tmpdir(), prefix)); roots.push(root); return root; }
const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
const drain = async (input: AsyncIterable<AgentSessionEvent>): Promise<AgentSessionEvent[]> => {
  const out: AgentSessionEvent[] = []; for await (const e of input) out.push(e); return out;
};

const LABELS: CheckpointTrailLabels = {
  heading: 'TRAIL-HEADING',
  readHint: 'READ-HINT via {tool}',
  statusOk: 'OK-LABEL',
  statusFailed: 'FAILED-LABEL',
  lastAssistantHeading: 'LAST-ASSISTANT-HEADING',
  replayNote: 'REPLAY-NOTE',
  omitted: '{count} OMITTED sha256:{digest} via {tool}',
};

const MODEL_CHECKPOINT = {
  schemaVersion: 1, objective: 'model objective', findings: ['finding-a'], evidenceRefs: [], decisions: ['decision-a'],
  unresolved: [], nextActions: ['next-a'], inspectedAreas: ['area-a'], toolResultDigests: [], cumulativeCounters: { modelSays: 7 },
  // The hallucinated instant from checkpoint #1 of the incident session — the host must discard it.
  createdAt: '2026-09-06T00:00:00Z',
  toolTrail: [],
};

/** Scripted adapter: turn requests consume `turns` in order; checkpoint
 *  requests (system === CHECKPOINT_SYSTEM) consume `checkpoints` in order. */
function scripted(turns: ProviderEvent[][], checkpoints: ProviderEvent[][] = []) {
  const requests: ProviderRequest[] = [];
  const checkpointRequests: ProviderRequest[] = [];
  let turn = 0; let checkpoint = 0;
  const adapter: ProviderAdapter = {
    name: 'scripted-7110',
    async *send(req) {
      if (req.system === CHECKPOINT_SYSTEM) {
        checkpointRequests.push(req);
        for (const e of (checkpoints[checkpoint++] ?? [{ type: 'done' }])) yield e;
        return;
      }
      requests.push(req);
      for (const e of (turns[turn++] ?? [{ type: 'done' }])) yield e;
    },
  };
  return { adapter, requests, checkpointRequests };
}

function fixture(opts: { turns: ProviderEvent[][]; checkpoints?: ProviderEvent[][]; checkpointEveryToolCalls?: number; checkpointEveryRounds?: number; readOutput?: string | ((args: Record<string, unknown>) => { ok: boolean; output: string }); contextWindow?: number; measure?: (messages: number) => number }) {
  const cwd = tmp('7110-cwd-');
  const scratchBase = tmp('7110-scratch-');
  const store = createSessionContentStore({ dir: scratchBase });
  const registry = new ToolRegistry();
  const readCalls: Record<string, unknown>[] = [];
  const writeCalls: Record<string, unknown>[] = [];
  const callToolCalls: Record<string, unknown>[] = [];
  registry.register({
    name: 'deckent_read_file', description: 'fixture read', inputSchema: { type: 'object' }, category: 'coding', tier: 'silent', source: 'builtin', replayable: true,
    handler: async (args) => {
      readCalls.push(args);
      if (typeof opts.readOutput === 'function') return opts.readOutput(args);
      return { ok: true, output: opts.readOutput ?? `line-1 of ${String(args['path'])}\nline-2` };
    },
  });
  // The 7106 meta regime: a silent/core ROUTER whose inner call may write.
  registry.register({
    name: 'deckent_call_tool', description: 'fixture router', inputSchema: { type: 'object' }, category: 'orchestration', tier: 'silent', source: 'builtin',
    handler: async (args) => { callToolCalls.push(args); return { ok: true, output: `routed ${String(args['name'])}` }; },
  });
  registry.register({
    name: 'deckent_write_file', description: 'fixture write', inputSchema: { type: 'object' }, category: 'coding', tier: 'confirm', source: 'builtin',
    approval: (args, resource) => ({ scope: 'file-write', risk: 'high', scopeId: 'deckent_write_file', resource }),
    handler: async (args) => { writeCalls.push(args); return { ok: true, output: 'written' }; },
  });
  const { adapter, requests, checkpointRequests } = scripted(opts.turns, opts.checkpoints);
  if (opts.measure) {
    const measure = opts.measure;
    adapter.requestMeasurement = { async measure(req) { return { inputTokens: measure(req.messages.length), provenance: 'fixture-exact' }; } };
  }
  const deps: AgentSessionDeps = {
    adapter, registry, policy: SAFE_DEFAULT_POLICY, cwd, model: 'fixture-model',
    ruleStore: { grant() {}, revoke() {}, activeRules: () => [], activeDenies: () => [] },
    nativeBudget: { ...resolveNativeAgentBudget({}), checkpointEveryToolCalls: opts.checkpointEveryToolCalls ?? 10_000, checkpointEveryRounds: opts.checkpointEveryRounds ?? resolveNativeAgentBudget({}).checkpointEveryRounds },
    scratch: { tenantId: 'tenant', projectId: 'project', sessionId: `s-${Math.random().toString(16).slice(2)}`, checkpointInstruction: CHECKPOINT_SYSTEM, checkpointProjectRoot: cwd },
    contentStore: store,
    checkpointLabels: LABELS,
    now: () => HOST_NOW,
    // A known context authority is what makes the loop broker (and spill) tool results.
    ...(opts.contextWindow !== undefined ? { getContextBudgetTokens: () => opts.contextWindow } : {}),
  };
  const session = createAgentSession(deps);
  return { session, store, requests, checkpointRequests, readCalls, writeCalls, callToolCalls };
}

const READ_A: ProviderEvent[] = [
  { type: 'text-delta', text: 'Reading the plan first.' },
  { type: 'tool-call', id: 'c1', name: 'deckent_read_file', args: { path: 'docs/MASTER-PLAN.md', offset: 1, limit: 200 } },
  { type: 'done' },
];
const READ_A_AGAIN: ProviderEvent[] = [
  { type: 'tool-call', id: 'c2', name: 'deckent_read_file', args: { limit: 200, offset: 1, path: 'docs/MASTER-PLAN.md' } },
  { type: 'done' },
];
const ANSWER: ProviderEvent[] = [{ type: 'text-delta', text: 'final answer' }, { type: 'done' }];

describe('7110 deterministic checkpoint carries the host tool trail', () => {
  it('writes a v2 payload with the trail, digest refs (never a path) and a host-stamped createdAt when the model summary is missing', async () => {
    const f = fixture({ turns: [READ_A, ANSWER], checkpoints: [[{ type: 'done' }]] });
    try {
      await drain(f.session.send('@docs/MASTER-PLAN.md dokümanını oku ve analiz et'));
      expect(f.readCalls).toHaveLength(1);
      const events = await drain(f.session.compactContext());
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.deterministic')).toBe(true);
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.saved')).toBe(true);
      const latest = f.session.latestCheckpoint();
      expect(latest.status).toBe('ok');
      if (latest.status !== 'ok') throw new Error('unreachable');
      const payload = latest.payload;
      expect(payload.schemaVersion).toBe(2);
      expect(payload.createdAt).toBe(HOST_NOW.toISOString());
      expect(payload.unresolved).toEqual(['CHECKPOINT_RESPONSE_INVALID_JSON']);
      // Evidence is a digest, never a content-store path.
      expect(payload.evidenceRefs).toHaveLength(1);
      expect(payload.evidenceRefs[0]).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(JSON.stringify(payload)).not.toContain('tool-content');
      expect(JSON.stringify(payload)).not.toContain('content-');
      // The trail is the real working state of the turn.
      expect(payload.toolTrail).toHaveLength(1);
      const entry = payload.toolTrail![0]!;
      expect(entry.tool).toBe('deckent_read_file');
      expect(entry.argsDigest).toBe(toolCallDigest('deckent_read_file', { path: 'docs/MASTER-PLAN.md', offset: 1, limit: 200 }));
      expect(entry.argsExcerpt).toBe('{"limit":200,"offset":1,"path":"docs/MASTER-PLAN.md"}');
      expect(entry.ok).toBe(true);
      const output = 'line-1 of docs/MASTER-PLAN.md\nline-2';
      expect(entry.resultRef).toBe(sha(output));
      expect(entry.resultBytes).toBe(Buffer.byteLength(output));
      expect(entry.resultExcerpt).toBe('line-1 of docs/MASTER-PLAN.md');
      expect(entry.fullContentRef).toBeNull();
      expect(payload.lastAssistantText).toBe('final answer');
      expect(payload.cumulativeCounters).toMatchObject({ deterministicFallback: 1, trailEntries: 1 });
      // The cited result is readable by digest through the session store — the E005 path is gone.
      const read = await f.store.readContentRef({ sha256: entry.resultRef!, offset: 0, limit: 1024 });
      expect(read.kind).toBe('loaded');
      if (read.kind === 'loaded') expect(Buffer.from(read.bytes).toString('utf8')).toBe(output);
    } finally { f.session.close(); }
  });

  it('opens the next epoch on the rendered trail with injected labels and the content-ref tool name', async () => {
    const f = fixture({ turns: [READ_A, ANSWER], checkpoints: [[{ type: 'done' }]] });
    try {
      await drain(f.session.send('analyze the plan'));
      await drain(f.session.compactContext());
      const opening = f.session.transcript()[0]!.content;
      expect(opening.startsWith('analyze the plan')).toBe(true);
      expect(opening).toContain('[checkpoint-trail] TRAIL-HEADING');
      expect(opening).toContain('1. deckent_read_file {"limit":200,"offset":1,"path":"docs/MASTER-PLAN.md"} → OK-LABEL');
      expect(opening).toContain(`result sha256:${sha('line-1 of docs/MASTER-PLAN.md\nline-2')}`);
      expect(opening).toContain(`READ-HINT via ${CONTENT_REF_TOOL_NAME}`);
      expect(opening).toContain('[checkpoint-last-assistant] LAST-ASSISTANT-HEADING\nfinal answer');
      expect(opening).not.toContain('tool-content');
      // The second message is the checkpoint SUMMARY projection (B3): counts + digest ref, never the trail JSON.
      const compaction = JSON.parse(f.session.transcript()[1]!.content);
      expect(compaction).toMatchObject({ schemaVersion: 2, toolTrailEntries: 1, lastAssistantChars: 'final answer'.length });
      expect(compaction.toolTrail).toBeUndefined();
      expect(compaction.lastAssistantText).toBeUndefined();
      expect(compaction.toolTrailRef).toMatch(/^[a-f0-9]{64}$/);
      // The on-disk checkpoint keeps the full trail and the same ref.
      const latest = f.session.latestCheckpoint();
      if (latest.status !== 'ok') throw new Error('unreachable');
      expect(latest.payload.toolTrail).toHaveLength(1);
      expect(latest.payload.toolTrailRef).toBe(compaction.toolTrailRef);
      const full = await f.store.readContentRef({ sha256: compaction.toolTrailRef, offset: 0, limit: 65_536 });
      if (full.kind !== 'loaded') throw new Error(full.reasonCode);
      expect(JSON.parse(Buffer.from(full.bytes).toString())).toEqual(latest.payload.toolTrail);
    } finally { f.session.close(); }
  });

  it('records a spilled result with its full-content digest so the whole file stays reachable by digest', async () => {
    const big = 'x'.repeat(200_000);
    const f = fixture({ turns: [READ_A, ANSWER], checkpoints: [[{ type: 'done' }]], readOutput: big, contextWindow: 131_072 });
    try {
      await drain(f.session.send('read big'));
      await drain(f.session.compactContext());
      const latest = f.session.latestCheckpoint();
      if (latest.status !== 'ok') throw new Error(`checkpoint ${latest.status}`);
      const entry = latest.payload.toolTrail![0]!;
      // The model saw a bounded envelope (preview + truncation marker), the trail
      // cites BOTH the envelope and the full bytes by digest.
      expect(entry.resultBytes).toBeLessThan(big.length);
      expect(entry.fullContentRef).toBe(sha(big));
      const full = await f.store.readContentRef({ sha256: entry.fullContentRef!, offset: 199_990, limit: 64 });
      expect(full).toMatchObject({ kind: 'loaded', totalBytes: 200_000, nextOffset: null });
    } finally { f.session.close(); }
  });
});

describe('7110 model-written checkpoints are host-stamped and cannot shrink the trail', () => {
  it('overwrites the model createdAt, keeps the summary fields and installs the host trail', async () => {
    const f = fixture({ turns: [READ_A, ANSWER], checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]] });
    try {
      await drain(f.session.send('analyze'));
      const events = await drain(f.session.compactContext());
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.deterministic')).toBe(false);
      const latest = f.session.latestCheckpoint();
      if (latest.status !== 'ok') throw new Error(`checkpoint ${latest.status}`);
      expect(latest.payload.createdAt).toBe(HOST_NOW.toISOString());
      expect(latest.payload.createdAt).not.toBe(MODEL_CHECKPOINT.createdAt);
      expect(latest.payload.schemaVersion).toBe(2);
      expect(latest.payload.findings).toEqual(['finding-a']);
      expect(latest.payload.decisions).toEqual(['decision-a']);
      expect(latest.payload.objective).toBe('model objective');
      expect(latest.payload.toolTrail).toHaveLength(1);
      expect(latest.payload.toolTrail![0]!.tool).toBe('deckent_read_file');
      expect(latest.payload.lastAssistantText).toBe('final answer');
      expect(latest.payload.cumulativeCounters).toMatchObject({ modelSays: 7, trailEntries: 1 });
      // The checkpoint request no longer asks the model for a timestamp.
      expect(f.checkpointRequests[0]!.system).toBe(CHECKPOINT_SYSTEM);
    } finally { f.session.close(); }
  });

  it('a malformed model summary (non-string array) falls back to the deterministic checkpoint, never a half-valid write', async () => {
    const bad = { ...MODEL_CHECKPOINT, findings: [{ not: 'a string' }] };
    const f = fixture({ turns: [READ_A, ANSWER], checkpoints: [[{ type: 'text-delta', text: JSON.stringify(bad) }, { type: 'done' }]] });
    try {
      await drain(f.session.send('analyze'));
      const events = await drain(f.session.compactContext());
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.deterministic')).toBe(true);
      const latest = f.session.latestCheckpoint();
      if (latest.status !== 'ok') throw new Error(`checkpoint ${latest.status}`);
      expect(latest.payload.unresolved).toEqual(['CHECKPOINT_PAYLOAD_INVALID']);
      expect(latest.payload.toolTrail).toHaveLength(1);
    } finally { f.session.close(); }
  });
});

describe('7110 restart-loop guard', () => {
  it('serves a post-checkpoint byte-identical read-only call from the trail and never re-executes it', async () => {
    const f = fixture({
      turns: [READ_A, READ_A_AGAIN, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      checkpointEveryToolCalls: 1,
    });
    try {
      const events = await drain(f.session.send('analyze the plan'));
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.saved')).toBe(true);
      // Executed exactly once: the second, key-reordered but byte-identical call was answered from the trail.
      expect(f.readCalls).toHaveLength(1);
      const results = events.filter((e): e is Extract<AgentSessionEvent, { type: 'tool-result' }> => e.type === 'tool-result');
      expect(results).toHaveLength(2);
      expect(results[0]!.code).toBeUndefined();
      expect(results[1]!.code).toBe('native.checkpoint.replay-served');
      expect(results[1]!.ok).toBe(true);
      expect(results[1]!.output).toBe(`${results[0]!.output}\n[deckent] REPLAY-NOTE`);
      const noticeIndex = events.findIndex((e) => e.type === 'notice' && e.code === 'native.checkpoint.replay-served');
      expect(noticeIndex).toBeGreaterThan(events.indexOf(results[1]!));
      // The replayed result rides the transcript like any other tool result (no orphaned tool_use).
      const toolMessages = f.session.transcript().filter((m) => m.role === 'tool');
      expect(toolMessages.some((m) => m.toolCallId === 'c2' && m.content.includes('REPLAY-NOTE'))).toBe(true);
      // The replayed call still counts as a model tool call for the cadence
      // budget (checkpointEveryToolCalls=1 → a second epoch after it).
      expect((await f.session.contextSnapshot()).epoch).toBeGreaterThanOrEqual(2);
    } finally { f.session.close(); }
  });

  it('is armed only by a checkpoint: identical calls BEFORE any checkpoint still execute', async () => {
    const f = fixture({ turns: [READ_A, READ_A_AGAIN, ANSWER] });
    try {
      const events = await drain(f.session.send('analyze'));
      expect(f.readCalls).toHaveLength(2);
      expect(events.some((e) => e.type === 'tool-result' && e.code === 'native.checkpoint.replay-served')).toBe(false);
    } finally { f.session.close(); }
  });

  it('a side-effecting call after the checkpoint invalidates replay — a later identical read runs for real', async () => {
    const WRITE: ProviderEvent[] = [{ type: 'tool-call', id: 'w1', name: 'deckent_write_file', args: { path: 'docs/MASTER-PLAN.md', content: 'changed' } }, { type: 'done' }];
    const f = fixture({
      turns: [READ_A, WRITE, READ_A_AGAIN, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      checkpointEveryToolCalls: 1,
    });
    try {
      f.session.setApprovalMode('full-auto');
      const events = await drain(f.session.send('edit then re-read'));
      expect(f.writeCalls).toHaveLength(1);
      expect(f.readCalls).toHaveLength(2);
      expect(events.some((e) => e.type === 'tool-result' && e.code === 'native.checkpoint.replay-served')).toBe(false);
    } finally { f.session.close(); }
  });

  it('a different call after the checkpoint executes normally (the guard matches bytes, not tools)', async () => {
    const READ_B: ProviderEvent[] = [{ type: 'tool-call', id: 'c3', name: 'deckent_read_file', args: { path: 'docs/MASTER-PLAN.md', offset: 201, limit: 200 } }, { type: 'done' }];
    const f = fixture({
      turns: [READ_A, READ_B, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      checkpointEveryToolCalls: 1,
    });
    try {
      await drain(f.session.send('continue reading'));
      expect(f.readCalls).toHaveLength(2);
      expect(f.readCalls[1]).toEqual({ path: 'docs/MASTER-PLAN.md', offset: 201, limit: 200 });
    } finally { f.session.close(); }
  });

  it('B2: a byte-identical deckent_call_tool(write) after the checkpoint is EXECUTED, never served — silent tier is not purity', async () => {
    const ROUTE_WRITE: ProviderEvent[] = [{ type: 'tool-call', id: 'r1', name: 'deckent_call_tool', args: { name: 'deckent_write_file', args: { path: 'docs/MASTER-PLAN.md', content: 'v2' } } }, { type: 'done' }];
    const ROUTE_WRITE_AGAIN: ProviderEvent[] = [{ type: 'tool-call', id: 'r2', name: 'deckent_call_tool', args: { args: { content: 'v2', path: 'docs/MASTER-PLAN.md' }, name: 'deckent_write_file' } }, { type: 'done' }];
    const f = fixture({
      turns: [ROUTE_WRITE, ROUTE_WRITE_AGAIN, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      checkpointEveryToolCalls: 1,
    });
    try {
      const events = await drain(f.session.send('write twice through the router'));
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.saved')).toBe(true);
      expect(f.callToolCalls).toHaveLength(2);
      expect(events.some((e) => e.type === 'tool-result' && e.code === 'native.checkpoint.replay-served')).toBe(false);
    } finally { f.session.close(); }
  });

  it('B2: a write routed through deckent_call_tool invalidates earlier read replays (no stale read-after-write)', async () => {
    const ROUTE_WRITE: ProviderEvent[] = [{ type: 'tool-call', id: 'r1', name: 'deckent_call_tool', args: { name: 'deckent_write_file', args: { path: 'docs/MASTER-PLAN.md', content: 'changed' } } }, { type: 'done' }];
    const f = fixture({
      turns: [READ_A, ROUTE_WRITE, READ_A_AGAIN, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      checkpointEveryToolCalls: 1,
    });
    try {
      const events = await drain(f.session.send('read, route a write, re-read'));
      expect(f.callToolCalls).toHaveLength(1);
      expect(f.readCalls).toHaveLength(2);
      expect(events.some((e) => e.type === 'tool-result' && e.code === 'native.checkpoint.replay-served')).toBe(false);
    } finally { f.session.close(); }
  });

  it('B2: an ok:false record (denied / error) is never replayed — the identical call runs again after the checkpoint', async () => {
    let attempt = 0;
    const f = fixture({
      turns: [READ_A, READ_A_AGAIN, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      checkpointEveryToolCalls: 1,
      readOutput: () => (attempt++ === 0 ? { ok: false, output: '[mcp-error] deckent_read_file: DECKENT_E005 path escapes scope' } : { ok: true, output: 'now readable' }),
    });
    try {
      const events = await drain(f.session.send('retry a refused read'));
      expect(f.readCalls).toHaveLength(2);
      const results = events.filter((e): e is Extract<AgentSessionEvent, { type: 'tool-result' }> => e.type === 'tool-result');
      expect(results.map((r) => r.ok)).toEqual([false, true]);
      expect(results.some((r) => r.code === 'native.checkpoint.replay-served')).toBe(false);
      const latest = f.session.latestCheckpoint();
      if (latest.status !== 'ok') throw new Error(latest.status);
      expect(latest.payload.toolTrail![0]).toMatchObject({ tool: 'deckent_read_file', ok: false });
    } finally { f.session.close(); }
  });

  it('the trail is per turn: a new user turn starts empty and disarmed', async () => {
    const f = fixture({
      turns: [READ_A, ANSWER, READ_A_AGAIN, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
    });
    try {
      await drain(f.session.send('turn one'));
      await drain(f.session.compactContext());
      const events = await drain(f.session.send('turn two'));
      expect(f.readCalls).toHaveLength(2);
      expect(events.some((e) => e.type === 'tool-result' && e.code === 'native.checkpoint.replay-served')).toBe(false);
    } finally { f.session.close(); }
  });
});

describe('7110 B3 — window-bounded opening, on-disk trail, once-per-turn pressure guard', () => {
  it('a 64-entry cadence checkpoint on a 32k window renders a bounded opening (newest entries + omission line) and never trips the high-water', async () => {
    const WINDOW = 32_768;
    const reads: ProviderEvent[][] = Array.from({ length: 64 }, (_, n) => [
      { type: 'tool-call', id: `c${n}`, name: 'deckent_read_file', args: { path: 'docs/MASTER-PLAN.md', offset: n * 200 + 1, limit: 200 } },
      { type: 'done' },
    ]);
    const f = fixture({
      turns: [...reads, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      checkpointEveryToolCalls: 64,
      checkpointEveryRounds: 10_000,
      contextWindow: WINDOW,
      readOutput: (args) => ({ ok: true, output: `| row ${String(args['offset'])} | ${'cell '.repeat(6)}|` }),
    });
    try {
      const events = await drain(f.session.send('@docs/MASTER-PLAN.md dokümanını oku ve analiz et'));
      expect(events.some((e) => e.type === 'error')).toBe(false);
      expect(f.readCalls).toHaveLength(64);
      // Every checkpoint request the loop raised (a measured token-pressure
      // epoch as the transcript grew, then the tool-call cadence at 64) became
      // exactly one epoch, and no request ever fired back-to-back without new
      // tool activity in between — the opening never re-triggered pressure.
      const requests = events.filter((e) => e.type === 'budget-checkpoint-request');
      expect(requests.length).toBeGreaterThanOrEqual(1);
      expect(f.checkpointRequests).toHaveLength(requests.length);
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.pressure-suppressed')).toBe(false);
      let sinceCheckpoint = 1;
      for (const e of events) {
        if (e.type === 'tool-result') sinceCheckpoint++;
        if (e.type === 'budget-checkpoint-request') { expect(sinceCheckpoint).toBeGreaterThan(0); sinceCheckpoint = 0; }
      }
      const snapshot = await f.session.contextSnapshot();
      expect(snapshot.epoch).toBe(1 + requests.length);
      expect(snapshot.lastContextTrigger).toBe('cadence');
      const opening = f.session.transcript()[0]!.content;
      const bound = Math.floor(WINDOW * 0.03);
      expect(estimateTokens(opening)).toBeLessThanOrEqual(bound + estimateTokens('@docs/MASTER-PLAN.md dokümanını oku ve analiz et') + 8);
      expect(opening).toContain('64. deckent_read_file ');
      expect(opening).not.toContain('\n1. deckent_read_file ');
      const omitted = /(\d+) OMITTED sha256:([a-f0-9]{64}) via deckent_read_content_ref/u.exec(opening);
      expect(omitted).not.toBeNull();
      expect(Number(omitted![1])).toBeGreaterThan(0);
      // The compaction message carries the projection, not the trail; the whole preamble stays far below the 75% high-water.
      const compaction = JSON.parse(f.session.transcript()[1]!.content);
      expect(compaction.toolTrail).toBeUndefined();
      expect(compaction).toMatchObject({ toolTrailEntries: 64, toolTrailRef: omitted![2] });
      const preambleTokens = f.session.transcript().slice(0, snapshot.preambleMessages).reduce((n, m) => n + estimateTokens(m.content), 0);
      expect(preambleTokens).toBeLessThan(WINDOW * 0.75 * 0.25);
      // The full 64-entry trail is on disk and readable by digest.
      const latest = f.session.latestCheckpoint();
      if (latest.status !== 'ok') throw new Error(latest.status);
      expect(latest.payload.toolTrail).toHaveLength(64);
      const full = await f.store.readContentRef({ sha256: omitted![2]!, offset: 0, limit: 256 * 1024 });
      expect(full.kind).toBe('loaded');
      if (full.kind === 'loaded') expect(JSON.parse(Buffer.from(full.bytes).toString())).toHaveLength(64);
    } finally { f.session.close(); }
  });

  it('a pressure request with nothing new since the epoch is suppressed (typed notice) instead of re-checkpointing the same opening', async () => {
    const f = fixture({
      turns: [READ_A, ANSWER],
      checkpoints: [[{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }], [{ type: 'text-delta', text: JSON.stringify(MODEL_CHECKPOINT) }, { type: 'done' }]],
      contextWindow: 32_768,
      // Over the high-water once the first tool result exists; over the window from then on — the
      // incident shape where a host-stamped opening alone re-triggers pressure.
      measure: (messages) => (messages >= 3 ? 40_000 : 1_000),
    });
    try {
      const events = await drain(f.session.send('pressure loop'));
      expect(f.checkpointRequests).toHaveLength(1);
      expect(events.some((e) => e.type === 'notice' && e.code === 'native.checkpoint.pressure-suppressed')).toBe(true);
      expect((await f.session.contextSnapshot()).epoch).toBe(2);
      // Honest terminal outcome, not a loop: the request still does not fit and the turn ends typed.
      expect(events.some((e) => e.type === 'error' && e.code === 'native-context.admission-denied')).toBe(true);
      expect(events.filter((e) => e.type === 'turn-end')).toHaveLength(1);
    } finally { f.session.close(); }
  });
});
