// tests/agent/reasoning-fix-package-b.test.ts
// ═══ 7108-b — post-landing fix package (Astra boundaries BLOCKS_CURRENT_DONE
// B1/B2/B3 + RELATED R1/R2). Hermetic: injected fetch, scripted adapters,
// fake timers where a deadline is involved, tmpdirs.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createReasoningControlResolver,
  DEFAULT_REASONING_PROBE_TIMEOUT_MS,
  PROBE_ABORTED_REASONING_CONTROL,
  PROBE_TIMEOUT_REASONING_CONTROL,
  probeOpenAICompatReasoningControl,
  UNKNOWN_REASONING_CONTROL,
} from '../../src/core/reasoning-control.js';
import { ModelRegistry } from '../../src/core/model-registry.js';
import {
  classifyTransportFailure,
  isAbortError,
  isTransientTransportFailure,
  ProviderTransportError,
} from '../../src/agent/provider-tooluse/transport-errors.js';
import { createOpenAIAdapter } from '../../src/agent/provider-tooluse/openai.js';
import { runAgentTurn, type LoopDeps } from '../../src/agent/loop.js';
import { Transcript } from '../../src/agent/transcript.js';
import { ToolRegistry } from '../../src/agent/tools/registry.js';
import { SAFE_DEFAULT_POLICY } from '../../src/agent/permission-policy.js';
import { DEFAULT_NATIVE_AGENT_BUDGET, resolveNativeAgentBudget } from '../../src/core/execution-budget-policy.js';
import { createPreambleBudgeter, PreambleBudgetError } from '../../src/agent/preamble-budget.js';
import { planReasoning, planReasoningRaiseFallback } from '../../src/agent/reasoning-control.js';
import type { AgentEvent } from '../../src/agent/events.js';
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from '../../src/agent/provider-tooluse/types.js';
import type { ReasoningControlDescriptor } from '../../src/core/model-registry-types.js';
import { resolveNativeSelection } from '../../src/cli/repl/native-transport.js';

const roots: string[] = [];
afterEach(() => { vi.useRealTimers(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const cwd = (): string => { const root = mkdtempSync(join(tmpdir(), '7108b-')); roots.push(root); return root; };
async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> { const out: T[] = []; for await (const x of iter) out.push(x); return out; }

const PROPS_OK = JSON.stringify({ default_generation_settings: { n_ctx: 8192 }, chat_template: '{% if enable_thinking %}' });

// ── B1 — probe deadline + abort signal ──────────────────────────────────────

describe('B1 — the /props probe is bounded and abortable', () => {
  it('passes a composed AbortSignal to EVERY fetch even when the caller omits one, and still yields evidence', async () => {
    const observed: Array<AbortSignal | null | undefined> = [];
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      observed.push(init?.signal);
      return new Response(String(url).includes('?model=') ? '{}' : PROPS_OK, { status: String(url).includes('?model=') ? 404 : 200 });
    });
    const descriptor = await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn });
    expect(observed).toHaveLength(2);
    expect(observed.every((s) => s instanceof AbortSignal && !s.aborted)).toBe(true);
    expect(descriptor?.provenance).toBe('server-reported');
  });

  it('deadline fires → typed probe-timeout descriptor (unknown toggle/budget), fetch aborted', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    const fetchFn = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      seen = init?.signal ?? undefined;
      seen?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pending = probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn, timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(60);
    const descriptor = await pending;
    expect(descriptor).toBe(PROBE_TIMEOUT_REASONING_CONTROL);
    expect(descriptor).toMatchObject({ toggle: { kind: 'unknown' }, sharesCompletionBudget: 'unknown', provenance: 'probe-timeout' });
    expect(seen?.aborted).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('caller abort (turn cancelled) → typed probe-aborted descriptor; the default deadline is the measurement bound', async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<typeof fetch>((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      controller.abort();
    }));
    const descriptor = await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn, signal: controller.signal });
    expect(descriptor).toBe(PROBE_ABORTED_REASONING_CONTROL);
    expect(DEFAULT_REASONING_PROBE_TIMEOUT_MS).toBe(2_000);
    expect(DEFAULT_NATIVE_AGENT_BUDGET.reasoningProbeTimeoutMs).toBe(2_000);
    // An already-aborted caller signal never even reaches the network.
    const pre = new AbortController(); pre.abort();
    const never = vi.fn<typeof fetch>();
    expect(await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn: never, signal: pre.signal })).toBe(PROBE_ABORTED_REASONING_CONTROL);
  });

  it('timeout/abort outcomes are returned typed but NEVER cached — the next resolve probes again', async () => {
    const probe = vi.fn<(model: string, signal?: AbortSignal) => Promise<ReasoningControlDescriptor | null>>()
      .mockResolvedValueOnce(PROBE_TIMEOUT_REASONING_CONTROL)
      .mockResolvedValueOnce(PROBE_ABORTED_REASONING_CONTROL)
      .mockResolvedValue({ toggle: { kind: 'none' }, sharesCompletionBudget: true, provenance: 'server-reported' });
    const resolver = createReasoningControlResolver({ registry: new ModelRegistry(), probe });
    const signal = new AbortController().signal;
    expect(await resolver.resolve('m', signal)).toBe(PROBE_TIMEOUT_REASONING_CONTROL);
    expect(await resolver.resolve('m')).toBe(PROBE_ABORTED_REASONING_CONTROL);
    expect(await resolver.resolve('m')).toMatchObject({ provenance: 'server-reported' });
    expect(await resolver.resolve('m')).toMatchObject({ provenance: 'server-reported' });
    expect(probe).toHaveBeenCalledTimes(3);
    expect(probe.mock.calls[0]?.[1]).toBe(signal);
  });

  it('planning treats probe-timeout / probe-aborted exactly like unknown (no ceiling inflation, not toggleable)', () => {
    for (const descriptor of [PROBE_TIMEOUT_REASONING_CONTROL, PROBE_ABORTED_REASONING_CONTROL, UNKNOWN_REASONING_CONTROL]) {
      const plan = planReasoning({ policy: DEFAULT_NATIVE_AGENT_BUDGET.reasoning, descriptor, structured: false, visibleReserveTokens: 4_096 });
      expect(plan.outputCeilingTokens).toBe(4_096);
      expect(plan.toggleable).toBe(false);
    }
  });

  it('config: reasoningProbeTimeoutMs is a positive safe integer, merged over the default', () => {
    expect(resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { reasoningProbeTimeoutMs: 750 } } }).reasoningProbeTimeoutMs).toBe(750);
    expect(() => resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { reasoningProbeTimeoutMs: 0 } } })).toThrow(/reasoningProbeTimeoutMs must be a positive safe integer/);
  });

  it('native-transport threads the turn signal and the config deadline into the local-llm probe', async () => {
    const projectRoot = cwd();
    const observed: Array<AbortSignal | null | undefined> = [];
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const u = String(url);
      if (u.includes('/props')) { observed.push(init?.signal); return new Response(PROPS_OK, { status: 200 }); }
      return new Response('{}', { status: 200 });
    });
    const resolved = resolveNativeSelection({ provider: 'local-llm', model: 'served-id' }, {
      projectRoot, env: {}, fetchFn,
      config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' }, execution_budget: { roles: {}, native_agent: { reasoningProbeTimeoutMs: 123 } } },
    });
    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) return;
    const turn = new AbortController();
    expect(await resolved.adapter.reasoningControl?.('served-id', turn.signal)).toMatchObject({ provenance: 'server-reported' });
    expect(observed).toHaveLength(1);
    expect(observed[0]).toBeInstanceOf(AbortSignal);
    expect(observed[0]?.aborted).toBe(false);

    // A hanging server + a cancelled turn: the composed signal follows the
    // turn's abort and the descriptor is the typed probe-aborted outcome.
    const hanging = vi.fn<typeof fetch>((url, init) => new Promise<Response>((resolve, reject) => {
      if (!String(url).includes('/props')) { resolve(new Response('{}', { status: 200 })); return; }
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const hangingResolved = resolveNativeSelection({ provider: 'local-llm', model: 'served-id' }, {
      projectRoot, env: {}, fetchFn: hanging, config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } },
    });
    if ('error' in hangingResolved) throw new Error(hangingResolved.error);
    const cancelled = new AbortController();
    const pending = hangingResolved.adapter.reasoningControl?.('served-id', cancelled.signal);
    cancelled.abort();
    expect(await pending).toMatchObject({ provenance: 'probe-aborted', toggle: { kind: 'unknown' } });
  });
});

// ── B2 — raised ceiling must be re-prepared + re-admitted ────────────────────

describe('B2 — a raised reasoning ceiling re-runs the preamble authority', () => {
  const REASONING_ONLY: ProviderEvent[] = [{ type: 'reasoning-activity', chars: 500 }, { type: 'done', stopReason: 'length' }];
  const ANSWER: ProviderEvent[] = [{ type: 'text-delta', text: 'answer' }, { type: 'done', stopReason: 'stop' }];
  const NONE_SHARED: ReasoningControlDescriptor = { toggle: { kind: 'none' }, sharesCompletionBudget: true, provenance: 'server-reported' };

  // Each fixture is its own wire model: the measurement cache in
  // agent/context-budget.ts is keyed by provider/model/window/request digest.
  let fixtures = 0;
  function fixture(input: { preambleTokens: number; descriptor?: ReasoningControlDescriptor; mode?: 'auto' | 'on' | 'off'; window?: number }) {
    const requests: ProviderRequest[] = [];
    const model = `fixture-${++fixtures}-${input.preambleTokens}`;
    const adapter: ProviderAdapter = {
      name: 'fixture',
      reasoningControl: async () => input.descriptor ?? NONE_SHARED,
      requestMeasurement: { measure: async () => ({ inputTokens: input.preambleTokens, provenance: 'fixture-exact' }) },
      async *send(request) { requests.push(request); for (const e of requests.length === 1 ? REASONING_ONLY : ANSWER) yield e; },
    };
    const registry = new ToolRegistry();
    const nativeBudget = { ...DEFAULT_NATIVE_AGENT_BUDGET, reasoning: { ...DEFAULT_NATIVE_AGENT_BUDGET.reasoning, mode: input.mode ?? 'on' as const } };
    const preambleBudgeter = createPreambleBudgeter({
      share: nativeBudget.maxPreambleShareOfContext, transcriptReserveShare: nativeBudget.minTranscriptShareOfContext, registry,
    });
    const deps: LoopDeps = {
      adapter, registry, policy: SAFE_DEFAULT_POLICY, ruleStore: { grant() {}, revoke() {}, activeRules: () => [], activeDenies: () => [] },
      cwd: cwd(), model, lang: 'en', nativeBudget, preambleBudgeter, getContextBudgetTokens: () => input.window ?? 32_768,
      getMode: () => 'suggest', issuePermission: () => { throw new Error('unexpected'); },
      requestPermission: async () => ({ decision: 'hold', reasonCode: 'unexpected' }), validatePermission: () => false, claimPermissionEffect: () => false,
    };
    return { deps, requests, preambleBudgeter };
  }

  it("Astra's scenario: window 32768, preamble 8000, ceiling 12288 → raised 20480 (hard limit 6963 < 8000) ⇒ typed hold, ONE request", async () => {
    const { deps, requests, preambleBudgeter } = fixture({ preambleTokens: 8_000 });
    const events = await collect<AgentEvent>(runAgentTurn(deps, new Transcript(), 'go'));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.outputCeilingTokens).toBe(12_288);
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', action: 'hold', classification: 'EMPTY_VISIBLE_AFTER_REASONING' }));
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: 'native.reasoning_exhausted.retry-unadmissible', vars: { ceiling: '12288', raised: '20480', reasoningTokens: '125' },
    });
    expect(events[events.length - 1]).toEqual({ type: 'turn-end' });
    // The preamble authority was consulted against the RAISED ceiling and reported exhaustion.
    expect(preambleBudgeter.snapshot()).toMatchObject({ hardLimit: 6_963, status: 'exhausted' });
    expect(events.some((e) => e.type === 'notice' && e.code === 'native.reasoning_exhausted_output_ceiling')).toBe(false);
  });

  it('a preamble that still fits the raised hard limit is re-prepared and the retry ships with the raised ceiling', async () => {
    const { deps, requests, preambleBudgeter } = fixture({ preambleTokens: 4_000 });
    const events = await collect<AgentEvent>(runAgentTurn(deps, new Transcript(), 'go'));
    expect(requests).toHaveLength(2);
    expect(requests[1]?.outputCeilingTokens).toBe(20_480);
    expect(preambleBudgeter.snapshot()).toMatchObject({ hardLimit: 6_963 });
    expect(events).toContainEqual(expect.objectContaining({ type: 'generation-recovery', action: 'retry-raised-ceiling' }));
    expect(events.filter((e) => e.type === 'text-delta')).toEqual([{ type: 'text-delta', text: 'answer' }]);
  });

  it('a PreambleBudgetError from the raised-ceiling prepare is the typed hold; unrelated prepare faults still propagate', async () => {
    const { deps, requests } = fixture({ preambleTokens: 4_000 });
    let calls = 0;
    deps.preambleBudgeter = {
      snapshot: () => undefined, observeToolResult: () => {},
      prepare: async (input) => { calls++; if (calls > 1) throw new PreambleBudgetError(); return { system: `s-${input.outputCeilingTokens}`, tools: input.tools }; },
    };
    const events = await collect<AgentEvent>(runAgentTurn(deps, new Transcript(), 'go'));
    expect(requests).toHaveLength(1);
    expect(requests[0]?.system).toBe('s-12288');
    expect(events.find((e) => e.type === 'error')).toMatchObject({ code: 'native.reasoning_exhausted.retry-unadmissible' });

    const faulty = fixture({ preambleTokens: 4_000 });
    const fault = new Error('unrelated prepare fault');
    let faultyCalls = 0;
    faulty.deps.preambleBudgeter = {
      snapshot: () => undefined, observeToolResult: () => {},
      prepare: async (input) => { faultyCalls++; if (faultyCalls > 1) throw fault; return { system: 's', tools: input.tools }; },
    };
    await expect(collect(runAgentTurn(faulty.deps, new Transcript(), 'go'))).rejects.toBe(fault);
  });

  it('the raise fallback: only auto + toggleable + thinking requested may switch reasoning off; forced on / off-ignored hold', () => {
    const toggleable: ReasoningControlDescriptor = { toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'server-reported' };
    const policy = DEFAULT_NATIVE_AGENT_BUDGET.reasoning;
    const auto = planReasoning({ policy, descriptor: toggleable, structured: false, visibleReserveTokens: 4_096 });
    expect(planReasoningRaiseFallback(auto, policy)).toBe('retry-reasoning-off');
    expect(planReasoningRaiseFallback(planReasoning({ policy: { ...policy, mode: 'on' }, descriptor: toggleable, structured: false, visibleReserveTokens: 4_096 }), { ...policy, mode: 'on' })).toBe('none');
    expect(planReasoningRaiseFallback(planReasoning({ policy: { ...policy, mode: 'off' }, descriptor: toggleable, structured: false, visibleReserveTokens: 4_096 }), { ...policy, mode: 'off' })).toBe('none');
    expect(planReasoningRaiseFallback(planReasoning({ policy, descriptor: NONE_SHARED, structured: false, visibleReserveTokens: 4_096 }), policy)).toBe('none');
    expect(planReasoningRaiseFallback(auto, undefined)).toBe('none');
  });
});

// ── B3 / R1 / R2 — abort priority, transient allowlist, configured count ─────

describe('B3 — an AbortError anywhere in the cause chain is an abort, never retried', () => {
  const REQ: ProviderRequest = { system: 's', model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [], transportRetry: { attempts: 3, backoffMs: 0 } };

  it('isAbortError: nested Error/DOMException AbortError and abort codes at any depth', () => {
    const nested = new TypeError('fetch failed', { cause: new Error('wrapped', { cause: Object.assign(new Error('c'), { name: 'AbortError' }) }) });
    expect(isAbortError(nested)).toBe(true);
    expect(isAbortError(new TypeError('fetch failed', { cause: new DOMException('cancelled', 'AbortError') }))).toBe(true);
    expect(isAbortError(new TypeError('fetch failed', { cause: new Error('x', { cause: Object.assign(new Error('y'), { code: 'UND_ERR_ABORTED' }) }) }))).toBe(true);
    expect(isAbortError(new TypeError('fetch failed', { cause: Object.assign(new Error('r'), { code: 'ECONNRESET' }) }))).toBe(false);
    expect(classifyTransportFailure(nested, 'connect')).toMatchObject({ class: 'abort', transient: false });
  });

  it('adapter: nested abort → one fetch, rethrown as the caller\'s own abort (Astra boundary)', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    const error = new TypeError('fetch failed', { cause: new Error('wrapped', { cause: abort }) });
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(error);
    const adapter = createOpenAIAdapter({ baseUrl: 'http://fixture.invalid/v1', fetchImpl });
    await expect(collect(adapter.send(REQ))).rejects.toBe(error);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('R1 — explicit transient allowlist; TLS / DNS / unknown are permanent', () => {
  const REQ: ProviderRequest = { system: 's', model: 'm', messages: [{ role: 'user', content: 'hi' }], tools: [], transportRetry: { attempts: 2, backoffMs: 0 } };
  const coded = (code: string) => new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });

  it.each(['ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'EAI_AGAIN'])('%s is transient (connect phase only)', (code) => {
    const failure = classifyTransportFailure(coded(code), 'connect');
    expect(failure.transient).toBe(true);
    expect(isTransientTransportFailure(failure, 'connect')).toBe(true);
    expect(isTransientTransportFailure(failure, 'stream')).toBe(false);
  });

  it.each(['ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED', 'SELF_SIGNED_CERT_IN_CHAIN', 'ENOTFOUND', 'EHOSTUNREACH', 'UND_ERR_HEADERS_TIMEOUT', 'SOMETHING_NEW'])(
    '%s is permanent: one fetch, typed error with noRetryReason=permanent', async (code) => {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(coded(code));
      const adapter = createOpenAIAdapter({ baseUrl: 'https://fixture.invalid/v1', fetchImpl });
      await expect(collect(adapter.send(REQ))).rejects.toSatisfy((err: unknown) =>
        err instanceof ProviderTransportError && err.attempts === 1 && err.retryBudget === 2 && err.noRetryReason === 'permanent'
        && err.failure.transient === false && err.failure.code === code && /not retried \(permanent\)/.test(err.message));
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

  it('a code-less `fetch failed` is unknown → permanent (no speculative retry)', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('fetch failed'));
    const adapter = createOpenAIAdapter({ baseUrl: 'http://fixture.invalid/v1', fetchImpl });
    await expect(collect(adapter.send(REQ))).rejects.toSatisfy((err: unknown) => err instanceof ProviderTransportError && err.noRetryReason === 'permanent');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('R2 — the user-facing outcome reflects the CONFIGURED retry count', () => {
  function deps(adapter: ProviderAdapter, transportRetry: number): LoopDeps {
    return {
      adapter, registry: new ToolRegistry(), policy: SAFE_DEFAULT_POLICY,
      ruleStore: { grant: () => {}, revoke: () => {}, activeRules: () => [], activeDenies: () => [] },
      cwd: '/tmp', model: 'm', getMode: () => 'suggest',
      nativeBudget: { ...DEFAULT_NATIVE_AGENT_BUDGET, transportRetry, transportRetryBackoffMs: 1 },
      issuePermission: () => { throw new Error('unexpected'); },
      requestPermission: async () => ({ decision: 'hold', reasonCode: 'unexpected' }),
      validatePermission: () => false, claimPermissionEffect: () => false,
    };
  }
  const reset = () => new TypeError('fetch failed', { cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', syscall: 'read' }) });

  it.each([0, 2, 3])('transportRetry=%i → fetch count and error vars/code follow the configuration', async (configured) => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(reset());
    const adapter = createOpenAIAdapter({ baseUrl: 'http://x/v1', fetchImpl });
    const events = await collect<AgentEvent>(runAgentTurn(deps(adapter, configured), new Transcript(), 'go'));
    expect(fetchImpl).toHaveBeenCalledTimes(1 + configured);
    expect(events.find((e) => e.type === 'error')).toMatchObject({
      code: configured === 0 ? 'native.transport-failure.not-authorized' : 'native.transport-failure',
      vars: { code: 'ECONNRESET', retries: String(configured), configured: String(configured) },
    });
  });

  it('error message names the configured count, never "once"', () => {
    const failure = classifyTransportFailure(reset(), 'connect');
    expect(new ProviderTransportError('openai-compatible', 'connect', failure, 3, 2).message).toContain('— retried 2× of 2 configured');
    expect(new ProviderTransportError('openai-compatible', 'connect', failure, 1, 0).message).toContain('— not retried (transportRetry=0)');
    expect(new ProviderTransportError('openai-compatible', 'stream', failure, 1, 3).message).toContain('— not retried (stream-phase)');
    expect(new ProviderTransportError('openai-compatible', 'connect', failure, 1, 0).noRetryReason).toBe('not-authorized');
  });
});
