// tests/agent/context-admission.test.ts
// NT-02 (hard per-request context admission) · NT-07 (boot-time effective
// context) · NT-08 (output ceiling → max_tokens). Hermetic: no fs writes, no
// network — a scripted adapter and an injected fetch are the only I/O seams.
import { describe, it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { RuleStore } from '../../src/agent/permission-store.js';
import {
  validateProviderRequest,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest,
} from '../../src/agent/provider-tooluse/types.js';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import {
  resolveContextBudgetTokens,
  resolveNativeSelection,
  type ResolvedProvider,
} from '../../src/cli/repl/native-transport.js';
import { estimateTokens } from '../../src/agent/context-budget.js';
import type { ResolvedNativeAgentBudget } from '../../src/core/execution-budget-policy.js';

// ── shared fixtures ─────────────────────────────────────────────────────────

/** A tool result far larger than any context under test (~100k estimated tokens). */
const HUGE_OUTPUT = 'x'.repeat(400_000);

function scriptedAdapter(scripts: ProviderEvent[][]): { adapter: ProviderAdapter; requests: ProviderRequest[] } {
  const requests: ProviderRequest[] = [];
  let turn = 0;
  const adapter: ProviderAdapter = {
    name: 'scripted',
    async *send(req: ProviderRequest): AsyncIterable<ProviderEvent> {
      requests.push(req);
      for (const e of scripts[turn++] ?? [{ type: 'done' }]) yield e;
    },
  };
  return { adapter, requests };
}

function memRuleStore(): RuleStore {
  const rules: { tool: string; pattern: string }[] = [];
  return { grant: (r) => rules.push(r), revoke: () => {}, activeRules: () => [...rules], activeDenies: () => [] };
}

/** Small explicit reserves so the FIRST round is comfortably admissible and only
 *  the oversized tool result of round two can trip the gate. */
const TEST_BUDGET: ResolvedNativeAgentBudget = {
  maxModelRounds: 120,
  maxToolCalls: 400,
  maxWallTimeMs: 45 * 60_000,
  maxCumulativeTokens: 2_000_000,
  maxNoProgressRounds: 8,
  checkpointEveryRounds: 20,
  checkpointEveryToolCalls: 60,
  outputReserveTokens: 512,
  contextSafetyReserveTokens: 128,
};

function baseDeps(over: Partial<LoopDeps>): LoopDeps {
  const reg = new ToolRegistry();
  reg.register({
    name: 'bigread', description: 'read a huge file', inputSchema: { type: 'object' }, category: 'coding',
    tier: 'silent', source: 'builtin', handler: async () => ({ ok: true, output: HUGE_OUTPUT }),
  });
  return {
    adapter: scriptedAdapter([[{ type: 'done' }]]).adapter,
    registry: reg, policy: SAFE_DEFAULT_POLICY, ruleStore: memRuleStore(),
    cwd: tmpdir(), model: 'm', getMode: () => 'suggest',
    requestPermission: async () => ({ decision: 'once' }),
    ...over,
  };
}

/** Round 1 calls the huge tool; round 2 (if it is ever admitted) just answers. */
const TOOL_THEN_ANSWER: ProviderEvent[][] = [
  [{ type: 'tool-call', id: 'c1', name: 'bigread', args: {} }, { type: 'done' }],
  [{ type: 'text-delta', text: 'ok' }, { type: 'done' }],
];

async function drain(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

// ── NT-02 ───────────────────────────────────────────────────────────────────

describe('NT-02 per-request context admission', () => {
  it('denies the doomed request typed instead of shipping an oversized body', async () => {
    const { adapter, requests } = scriptedAdapter(TOOL_THEN_ANSWER);
    const evs = await drain(runAgentTurn(
      baseDeps({ adapter, nativeBudget: TEST_BUDGET, getContextBudgetTokens: () => 20_000 }),
      new Transcript(),
      'go',
    ));

    const err = evs.find((e) => e.type === 'error');
    expect(err).toMatchObject({ type: 'error', code: 'native-context.admission-denied' });
    expect(evs[evs.length - 1]).toEqual({ type: 'turn-end' });
    // The oversized second request never reached the adapter, and the one body
    // it DID receive is far inside the effective context.
    expect(requests).toHaveLength(1);
    expect(estimateTokens(JSON.stringify(requests[0]))).toBeLessThan(20_000);
    // The current turn was denied, never silently trimmed: the huge tool result
    // is still in the transcript-shaped request nobody sent.
    expect(JSON.stringify(requests[0])).not.toContain(HUGE_OUTPUT.slice(0, 1_000));
  });

  it('requests ONE budget checkpoint BEFORE denying', async () => {
    const { adapter } = scriptedAdapter(TOOL_THEN_ANSWER);
    const evs = await drain(runAgentTurn(
      baseDeps({ adapter, nativeBudget: TEST_BUDGET, getContextBudgetTokens: () => 20_000 }),
      new Transcript(),
      'go',
    ));

    const checkpoints = evs.filter((e) => e.type === 'budget-checkpoint-request');
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({ reason: 'token-pressure', rounds: 2, toolCalls: 1 });
    const checkpointAt = evs.findIndex((e) => e.type === 'budget-checkpoint-request');
    const errorAt = evs.findIndex((e) => e.type === 'error');
    expect(checkpointAt).toBeGreaterThanOrEqual(0);
    expect(checkpointAt).toBeLessThan(errorAt);
  });

  it('proceeds when the checkpoint consumer compacts the epoch', async () => {
    const { adapter, requests } = scriptedAdapter(TOOL_THEN_ANSWER);
    const transcript = new Transcript();
    const evs: AgentEvent[] = [];
    for await (const e of runAgentTurn(
      baseDeps({ adapter, nativeBudget: TEST_BUDGET, getContextBudgetTokens: () => 20_000 }),
      transcript,
      'go',
    )) {
      evs.push(e);
      // The session layer's epoch-compaction response to the checkpoint request.
      if (e.type === 'budget-checkpoint-request') {
        transcript.replaceForContextEpoch([{ role: 'user', content: 'objective + checkpoint' }], 'epoch-1');
      }
    }

    expect(evs.some((e) => e.type === 'error')).toBe(false);
    expect(requests).toHaveLength(2);
    expect(estimateTokens(JSON.stringify(requests[1]))).toBeLessThan(20_000);
  });

  it('never gates when no effective context is configured (pre-NT-02 behavior)', async () => {
    const { adapter, requests } = scriptedAdapter(TOOL_THEN_ANSWER);
    const evs = await drain(runAgentTurn(
      baseDeps({ adapter, nativeBudget: TEST_BUDGET }),
      new Transcript(),
      'go',
    ));

    expect(evs.some((e) => e.type === 'error')).toBe(false);
    expect(evs.some((e) => e.type === 'budget-checkpoint-request')).toBe(false);
    expect(requests).toHaveLength(2);
  });

  it('admits a request that fits the effective context', async () => {
    const { adapter, requests } = scriptedAdapter([[{ type: 'text-delta', text: 'hi' }, { type: 'done' }]]);
    const evs = await drain(runAgentTurn(
      baseDeps({ adapter, nativeBudget: TEST_BUDGET, getContextBudgetTokens: () => 20_000 }),
      new Transcript(),
      'go',
    ));

    expect(evs.some((e) => e.type === 'error')).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

// ── NT-08 ───────────────────────────────────────────────────────────────────

describe('NT-08 output ceiling', () => {
  it('the loop sets outputCeilingTokens from the resolved native budget', async () => {
    const { adapter, requests } = scriptedAdapter([[{ type: 'text-delta', text: 'hi' }, { type: 'done' }]]);
    await drain(runAgentTurn(baseDeps({ adapter, nativeBudget: TEST_BUDGET }), new Transcript(), 'go'));
    expect(requests[0]?.outputCeilingTokens).toBe(TEST_BUDGET.outputReserveTokens);
  });

  it('omits outputCeilingTokens when no native budget is resolved', async () => {
    const { adapter, requests } = scriptedAdapter([[{ type: 'text-delta', text: 'hi' }, { type: 'done' }]]);
    await drain(runAgentTurn(baseDeps({ adapter }), new Transcript(), 'go'));
    expect(requests[0]).not.toHaveProperty('outputCeilingTokens');
  });

  it('the OpenAI-compatible adapter sends it as max_tokens (and omits it when unset)', async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (_url: unknown, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return {
        ok: true, status: 200,
        body: (async function* () { yield new TextEncoder().encode('data: [DONE]\n\n'); })(),
      };
    }) as unknown as typeof fetch;
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const req: ProviderRequest = {
      system: 'sys', model: 'local-model', messages: [{ role: 'user', content: 'hi' }], tools: [],
    };

    for await (const _e of adapter.send({ ...req, outputCeilingTokens: 4_096 })) { /* drain */ }
    for await (const _e of adapter.send(req)) { /* drain */ }

    expect(bodies[0]?.['max_tokens']).toBe(4_096);
    expect(bodies[1]).not.toHaveProperty('max_tokens');
  });

  it('rejects a present-but-invalid ceiling at the request contract', () => {
    const req: ProviderRequest = { system: 's', model: 'm', messages: [], tools: [] };
    expect(validateProviderRequest({ ...req, outputCeilingTokens: 4_096 })).toBeNull();
    expect(validateProviderRequest({ ...req, outputCeilingTokens: 0 })).toMatch(/outputCeilingTokens/);
    expect(validateProviderRequest({ ...req, outputCeilingTokens: 1.5 })).toMatch(/outputCeilingTokens/);
  });
});

// ── NT-07 ───────────────────────────────────────────────────────────────────

/** Minimal injected fetch for the llama.cpp `/props` probe. `n_ctx: null` means
 *  the server answers but reports nothing; `ok: false` means it cannot answer. */
function propsFetch(n_ctx: number | null, ok = true): typeof globalThis.fetch {
  return (async () => ({
    ok,
    json: async () => (n_ctx === null ? {} : { default_generation_settings: { n_ctx } }),
  })) as unknown as typeof globalThis.fetch;
}

function localLlm(
  config: Record<string, unknown>,
  fetchFn: typeof globalThis.fetch,
): ResolvedProvider {
  const resolved = resolveNativeSelection(
    { provider: 'local-llm', model: null },
    {
      env: {},
      config: { native_model: 'qwen3-coder', local_llm: { endpoint: 'http://127.0.0.1:18080' }, ...config },
      fetchFn,
    },
  );
  if ('error' in resolved) throw new Error(`unexpected resolution error: ${resolved.error}`);
  return resolved;
}

describe('NT-07 boot-time effective context', () => {
  it('resolves min(configured, server-reported) with typed provenance', async () => {
    const resolved = localLlm(
      { local_llm: { endpoint: 'http://127.0.0.1:18080', contextSize: 32_768 } },
      propsFetch(8_192),
    );
    expect(resolved.configuredContextSize).toBe(32_768);

    const context = await resolved.contextStatus?.();
    expect(context?.effectiveContextSize).toBe(8_192);
    expect(context?.provenance).toEqual([
      { source: 'configured', tokens: 32_768, counted: true },
      { source: 'server-reported', tokens: 8_192, counted: true },
      { source: 'model-advertised', tokens: null, counted: false },
    ]);
  });

  it('takes the NARROWEST configured knob (native_context_tokens may narrow)', async () => {
    const resolved = localLlm(
      { local_llm: { endpoint: 'http://127.0.0.1:18080', contextSize: 32_768 }, native_context_tokens: 16_000 },
      propsFetch(8_192),
    );
    expect(resolved.configuredContextSize).toBe(16_000);
    expect((await resolved.contextStatus?.())?.effectiveContextSize).toBe(8_192);
  });

  it('stays honestly config-only when the server does not report', async () => {
    const unreachable = localLlm({ native_context_tokens: 12_000 }, propsFetch(null, false));
    expect(await unreachable.contextStatus?.()).toBeNull();
    expect(resolveContextBudgetTokens('local-llm', { native_context_tokens: 12_000 }, null)).toBe(12_000);

    // Server answers but reports no n_ctx → the configured value stands.
    const silent = localLlm({ native_context_tokens: 12_000 }, propsFetch(null));
    expect((await silent.contextStatus?.())?.effectiveContextSize).toBe(12_000);
  });

  it('lets explicit config narrow but NEVER widen above a known server ceiling', () => {
    expect(resolveContextBudgetTokens('local-llm', { native_context_tokens: 60_000 }, 8_192)).toBe(8_192);
    expect(resolveContextBudgetTokens('local-llm', { native_context_tokens: 4_000 }, 8_192)).toBe(4_000);
    expect(resolveContextBudgetTokens('local-llm', {}, 8_192)).toBe(8_192);
    // Providers with no discoverable server ceiling keep their existing results.
    expect(resolveContextBudgetTokens('claude', { native_context_tokens: 60_000 }, 8_192)).toBe(60_000);
    expect(resolveContextBudgetTokens('ollama', {})).toBe(24_000);
    expect(resolveContextBudgetTokens('claude', {})).toBe(160_000);
  });

  it('uses the model-advertised FULL window; config only narrows (owner directive 2026-08-18)', () => {
    // The registry's advertised window IS the usable ceiling — no self-imposed cap.
    expect(resolveContextBudgetTokens('claude', {}, null, 1_000_000)).toBe(1_000_000);
    // Explicit config narrows below the advertised window…
    expect(resolveContextBudgetTokens('claude', { native_context_tokens: 118_000 }, null, 1_000_000)).toBe(118_000);
    // …but can never widen past it.
    expect(resolveContextBudgetTokens('claude', { native_context_tokens: 2_000_000 }, null, 1_000_000)).toBe(1_000_000);
    // Server-reported and advertised ceilings compose as a minimum (local-llm).
    expect(resolveContextBudgetTokens('local-llm', {}, 131_072, 262_144)).toBe(131_072);
    // A model the registry cannot advertise keeps the last-resort fallback.
    expect(resolveContextBudgetTokens('claude', {}, null, null)).toBe(160_000);
  });
});
