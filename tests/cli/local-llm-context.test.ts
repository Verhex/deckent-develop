import { describe, expect, it, vi } from 'vitest';
import { deriveEffectiveContext, derivePromptBudget } from '../../src/agent/context-budget.js';
import { getLocalLlmStatus } from '../../src/cli/commands/local-llm.js';
import {
  formatNativeProviderStatus,
  resolveContextBudgetTokens,
  resolveNativeSelection,
} from '../../src/cli/repl/native-transport.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

const config = {
  local_llm: {
    serverBinary: '/bin/llama-server', modelArtifact: '/models/a.gguf', endpoint: 'http://127.0.0.1:8080/v1',
    host: '127.0.0.1', port: 8080, contextSize: 131_072, modelAlias: 'configured-model',
  },
};

describe('effective local-llm context', () => {
  it('takes the minimum known value and reports every provenance signal', () => {
    expect(deriveEffectiveContext({
      configuredContextSize: 131_072, serverReportedContext: 65_536, modelAdvertisedContext: 98_304,
    })).toEqual({
      effectiveContextSize: 65_536,
      provenance: [
        { source: 'configured', tokens: 131_072, counted: true },
        { source: 'server-reported', tokens: 65_536, counted: true },
        { source: 'model-advertised', tokens: 98_304, counted: true },
      ],
    });
  });

  it('keeps the configured ceiling when optional metadata is absent and says so', () => {
    const result = deriveEffectiveContext({
      configuredContextSize: 32_768, serverReportedContext: null, modelAdvertisedContext: null,
    });
    expect(result.effectiveContextSize).toBe(32_768);
    expect(result.provenance).toContainEqual({ source: 'server-reported', tokens: null, counted: false });
    expect(result.provenance).toContainEqual({ source: 'model-advertised', tokens: null, counted: false });
  });

  it('subtracts system, serialized tools, output reserve, and safety reserve visibly', () => {
    const breakdown = derivePromptBudget({
      contextTokens: 1_000, systemPrompt: 'abcd', toolSchemas: [],
      outputReserveTokens: 200, contextSafetyReserveTokens: 100,
    });
    expect(breakdown).toEqual({
      contextTokens: 1_000, systemPromptTokens: 1, toolSchemaTokens: 1,
      outputReserveTokens: 200, contextSafetyReserveTokens: 100, promptBudgetTokens: 698,
    });
  });

  it('reports status mismatch and restart-required in both languages', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/health')) return new Response('{}', { status: 200 });
      if (url.endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'configured-model' }] }), { status: 200 });
      return new Response(JSON.stringify({ default_generation_settings: { n_ctx: 65_536 } }), { status: 200 });
    });
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: 'configured-model' }, { env: {}, config, fetchFn },
    );
    if ('error' in resolved) throw new Error(resolved.error);
    const en = await formatNativeProviderStatus(resolved, 'en');
    const tr = await formatNativeProviderStatus(resolved, 'tr');
    expect(en).toContain('restart required');
    expect(tr).toContain('yeniden başlatma gerekli');
    expect(resolveContextBudgetTokens('local-llm', {}, 65_536)).toBe(65_536);
    expect(resolveContextBudgetTokens('local-llm', { native_context_tokens: 8_000 }, 65_536)).toBe(8_000);
  });

  it('never fabricates an effective value when the live server is unavailable', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    const status = await getLocalLlmStatus({ loadConfigFn: async () => config, resolveProjectRootFn: () => '/project', fetchFn });
    expect(status.effectiveContext).toBeNull();
    expect(status.configuredContextSize).toBe(131_072);
    expect(getMessage('native.context.unavailable', 'en')).toContain('unavailable');
    expect(getMessage('native.context.unavailable', 'tr')).not.toBe(getMessage('native.context.unavailable', 'en'));
  });

  it('renders unavailable context even when model identity discovery is also unreachable', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: 'configured-model' }, { env: {}, config, fetchFn },
    );
    if ('error' in resolved) throw new Error(resolved.error);
    const output = await formatNativeProviderStatus(resolved, 'en');
    expect(output).toContain('model identity');
    expect(output).toContain('effective unavailable');
    expect(output).not.toMatch(/effective \d/);
  });
});
