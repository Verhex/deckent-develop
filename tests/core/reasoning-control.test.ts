// tests/core/reasoning-control.test.ts
// ═══ 7108 — descriptor authority: config validation, live /props evidence,
// registry attachment (local-llm), composed resolver precedence + caching, and
// the config-resolved native_agent.reasoning / transportRetry policy.
import { describe, expect, it, vi } from 'vitest';
import {
  assertReasoningControlConfig,
  createReasoningControlResolver,
  isKnownReasoningControl,
  isReasoningToggleable,
  probeOpenAICompatReasoningControl,
  resolveModelReasoningControl,
  UNKNOWN_REASONING_CONTROL,
  validateReasoningControlConfig,
} from '../../src/core/reasoning-control.js';
import { ensureLocalLlmModelRegistered, ModelRegistry } from '../../src/core/model-registry.js';
import {
  DEFAULT_NATIVE_AGENT_BUDGET,
  MAX_NATIVE_TRANSPORT_RETRY,
  resolveNativeAgentBudget,
} from '../../src/core/execution-budget-policy.js';

describe('validateReasoningControlConfig', () => {
  it('accepts the three authored shapes and stamps configured provenance', () => {
    expect(validateReasoningControlConfig({ toggle: 'chat_template_kwargs.enable_thinking', sharesCompletionBudget: true }, 'p'))
      .toEqual({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'configured' });
    expect(validateReasoningControlConfig({ toggle: 'none', sharesCompletionBudget: false }, 'p'))
      .toEqual({ toggle: { kind: 'none' }, sharesCompletionBudget: false, provenance: 'configured' });
    expect(validateReasoningControlConfig({ toggle: { kind: 'reasoning_effort', on: 'medium', off: 'none' }, sharesCompletionBudget: true }, 'p'))
      .toEqual({ toggle: { kind: 'reasoning_effort', on: 'medium', off: 'none' }, sharesCompletionBudget: true, provenance: 'configured' });
    expect(assertReasoningControlConfig({ toggle: 'none', sharesCompletionBudget: true }, 'p')).toEqual({ toggle: 'none', sharesCompletionBudget: true });
  });

  it.each([
    ['not an object', 'x'],
    ['unknown key', { toggle: 'none', sharesCompletionBudget: true, extra: 1 }],
    ['missing sharesCompletionBudget', { toggle: 'none' }],
    ['non-boolean sharesCompletionBudget', { toggle: 'none', sharesCompletionBudget: 'yes' }],
    ['unknown toggle string', { toggle: 'thinking', sharesCompletionBudget: true }],
    ['unknown toggle kind', { toggle: { kind: 'other', on: 'a', off: 'b' }, sharesCompletionBudget: true }],
    ['empty effort value', { toggle: { kind: 'reasoning_effort', on: '', off: 'b' }, sharesCompletionBudget: true }],
    ['identical effort values', { toggle: { kind: 'reasoning_effort', on: 'x', off: 'x' }, sharesCompletionBudget: true }],
    ['unknown effort key', { toggle: { kind: 'reasoning_effort', on: 'a', off: 'b', max: 'c' }, sharesCompletionBudget: true }],
  ])('rejects %s with a typed error naming the path', (_label, value) => {
    expect(() => validateReasoningControlConfig(value, 'local_llm.reasoningControl'))
      .toThrow(expect.objectContaining({ code: 'E_REASONING_CONTROL_CONFIG_INVALID', message: expect.stringContaining('local_llm.reasoningControl') }));
  });

  it('predicates: known vs unknown, toggleable vs not', () => {
    expect(isKnownReasoningControl(UNKNOWN_REASONING_CONTROL)).toBe(false);
    expect(isKnownReasoningControl(undefined)).toBe(false);
    expect(isKnownReasoningControl({ toggle: { kind: 'none' }, sharesCompletionBudget: 'unknown', provenance: 'server-reported' })).toBe(true);
    expect(isReasoningToggleable({ toggle: { kind: 'none' }, sharesCompletionBudget: true, provenance: 'configured' })).toBe(false);
    expect(isReasoningToggleable({ toggle: { kind: 'reasoning_effort', on: 'a', off: 'b' }, sharesCompletionBudget: true, provenance: 'configured' })).toBe(true);
  });
});

describe('probeOpenAICompatReasoningControl (llama.cpp /props evidence)', () => {
  const props = (chatTemplate: string | undefined, llamaCpp = true) => JSON.stringify({
    ...(llamaCpp ? { default_generation_settings: { n_ctx: 131072 } } : {}),
    ...(chatTemplate !== undefined ? { chat_template: chatTemplate } : {}),
  });

  it('a template that reads enable_thinking → template toggle, budget shared, server-reported; probes the model-scoped props at the SERVER ROOT', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (url) => new Response(
      String(url).includes('props?model=') ? props('{% if enable_thinking %}<think>{% endif %}') : '{}', { status: 200 }));
    const descriptor = await probeOpenAICompatReasoningControl({ endpoint: 'http://127.0.0.1:8080/v1', model: 'served-id', fetchFn });
    expect(descriptor).toEqual({ toggle: { kind: 'chat_template_kwargs.enable_thinking' }, sharesCompletionBudget: true, provenance: 'server-reported' });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('http://127.0.0.1:8080/props?model=served-id');
  });

  it('router returns nothing model-scoped → falls back to the bare /props; a template without the switch is toggle none', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).includes('?model=')
      ? new Response('{}', { status: 404 })
      : new Response(props('{{ messages }}'), { status: 200 }));
    const descriptor = await probeOpenAICompatReasoningControl({ endpoint: 'http://127.0.0.1:8080/v1', model: 'm', fetchFn });
    expect(descriptor).toEqual({ toggle: { kind: 'none' }, sharesCompletionBudget: true, provenance: 'server-reported' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('no template but a llama.cpp witness → toggle unknown, budget shared', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(props(undefined), { status: 200 }));
    expect(await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn }))
      .toEqual({ toggle: { kind: 'unknown' }, sharesCompletionBudget: true, provenance: 'server-reported' });
  });

  it('unreachable, non-JSON or shapeless server → null (caller keeps unknown, uncached)', async () => {
    expect(await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn: vi.fn<typeof fetch>().mockRejectedValue(new Error('down')) })).toBeNull();
    expect(await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 200 })) })).toBeNull();
    expect(await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 })) })).toBeNull();
    expect(await probeOpenAICompatReasoningControl({ endpoint: 'http://h:1/v1', model: 'm', fetchFn: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 })) })).toBeNull();
  });
});

describe('registry attachment (ensureLocalLlmModelRegistered)', () => {
  const facts = { tier: 'standard' as const, contextWindow: 131_072, capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: true } };
  const evidence = (now: number) => ({ modelIds: ['served-id'], healthy: true, checkedAtMs: now });

  it('registers the honest unknown descriptor when no facts are supplied, and upgrades in place when evidence arrives', () => {
    const registry = new ModelRegistry();
    const now = 1_000_000;
    ensureLocalLlmModelRegistered('served-id', facts, evidence(now), registry, now);
    expect(registry.get('served-id')?.reasoningControl).toEqual(UNKNOWN_REASONING_CONTROL);
    expect(resolveModelReasoningControl('served-id', registry)).toEqual(UNKNOWN_REASONING_CONTROL);

    const proven = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true as const, provenance: 'server-reported' as const };
    ensureLocalLlmModelRegistered('served-id', { ...facts, reasoningControl: proven }, evidence(now), registry, now);
    expect(registry.get('served-id')?.reasoningControl).toEqual(proven);

    // Known evidence is never downgraded by a later unknown registration.
    ensureLocalLlmModelRegistered('served-id', facts, evidence(now), registry, now);
    expect(registry.get('served-id')?.reasoningControl).toEqual(proven);
    expect(resolveModelReasoningControl('absent-id', registry)).toBe(UNKNOWN_REASONING_CONTROL);
  });
});

describe('createReasoningControlResolver — precedence and caching', () => {
  const configured = validateReasoningControlConfig({ toggle: 'none', sharesCompletionBudget: false }, 'p');
  const probed = { toggle: { kind: 'chat_template_kwargs.enable_thinking' as const }, sharesCompletionBudget: true as const, provenance: 'server-reported' as const };

  it('configured wins over everything; a known registry entry wins over the probe', async () => {
    const registry = new ModelRegistry();
    const now = 5_000_000;
    ensureLocalLlmModelRegistered('m', { tier: 'standard', contextWindow: 10, capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: true }, reasoningControl: probed },
      { modelIds: ['m'], healthy: true, checkedAtMs: now }, registry, now);
    const probe = vi.fn(async () => probed);
    expect(await createReasoningControlResolver({ configured, registry, probe }).resolve('m')).toBe(configured);
    expect(await createReasoningControlResolver({ registry, probe }).resolve('m')).toEqual(probed);
    expect(probe).not.toHaveBeenCalled();
  });

  it('probe is memoized on success and retried after a null/failed probe', async () => {
    const registry = new ModelRegistry();
    const probe = vi.fn<(model: string) => Promise<typeof probed | null>>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(probed);
    const resolver = createReasoningControlResolver({ registry, probe });
    expect(await resolver.resolve('m')).toBe(UNKNOWN_REASONING_CONTROL);
    expect(await resolver.resolve('m')).toBe(UNKNOWN_REASONING_CONTROL);
    expect(await resolver.resolve('m')).toEqual(probed);
    expect(await resolver.resolve('m')).toEqual(probed);
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it('no probe and nothing known → unknown', async () => {
    expect(await createReasoningControlResolver({ registry: new ModelRegistry() }).resolve('m')).toBe(UNKNOWN_REASONING_CONTROL);
  });
});

describe('execution_budget.native_agent — reasoning + transportRetry config', () => {
  it('defaults: auto mode with explicit budgets, one transport retry, bounded backoff', () => {
    expect(DEFAULT_NATIVE_AGENT_BUDGET.reasoning).toEqual({ mode: 'auto', budgetTokens: 8_192, exhaustedRetryBudgetTokens: 16_384 });
    expect(DEFAULT_NATIVE_AGENT_BUDGET.transportRetry).toBe(1);
    expect(DEFAULT_NATIVE_AGENT_BUDGET.transportRetryBackoffMs).toBe(250);
    expect(resolveNativeAgentBudget({})).toEqual(DEFAULT_NATIVE_AGENT_BUDGET);
  });

  it('merges authored reasoning fields independently over the defaults', () => {
    const merged = resolveNativeAgentBudget({ policy: { roles: {}, native_agent: { reasoning: { mode: 'off', budgetTokens: 1_024 }, transportRetry: 0, transportRetryBackoffMs: 10 } } });
    expect(merged.reasoning).toEqual({ mode: 'off', budgetTokens: 1_024, exhaustedRetryBudgetTokens: 16_384 });
    expect(merged.transportRetry).toBe(0);
    expect(merged.transportRetryBackoffMs).toBe(10);
    expect(merged.outputReserveTokens).toBe(DEFAULT_NATIVE_AGENT_BUDGET.outputReserveTokens);
  });

  it.each([
    ['reasoning not an object', { reasoning: 'auto' }, /reasoning must be an object/],
    ['unknown reasoning key', { reasoning: { budget: 1 } }, /reasoning/],
    ['bad mode', { reasoning: { mode: 'maybe' } }, /reasoning.mode/],
    ['zero budget', { reasoning: { budgetTokens: 0 } }, /budgetTokens must be a positive safe integer/],
    ['fractional retry budget', { reasoning: { exhaustedRetryBudgetTokens: 1.5 } }, /exhaustedRetryBudgetTokens/],
    ['retry budget below budget', { reasoning: { budgetTokens: 4_000, exhaustedRetryBudgetTokens: 3_000 } }, /must be >= budgetTokens/],
    ['negative transportRetry', { transportRetry: -1 }, /transportRetry must be an integer between 0 and/],
    ['transportRetry above the cap', { transportRetry: MAX_NATIVE_TRANSPORT_RETRY + 1 }, /transportRetry/],
    ['zero backoff', { transportRetryBackoffMs: 0 }, /transportRetryBackoffMs must be a positive safe integer/],
  ])('rejects %s loudly', (_label, native_agent, pattern) => {
    expect(() => resolveNativeAgentBudget({ policy: { roles: {}, native_agent: native_agent as never } })).toThrow(pattern);
  });
});
