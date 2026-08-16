import { describe, expect, it, vi } from 'vitest';
import { formatNativeProviderStatus, resolveNativeSelection } from '../../src/cli/repl/native-transport.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('native local-llm transport', () => {
  it('resolves the canonical local_llm authority returned by loadConfig', () => {
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: 'Qwen3.8-27B' },
      { env: {}, config: { local_llm: { endpoint: 'http://127.0.0.1:8080/v1' } } },
    );
    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) return;
    expect(resolved.providerName).toBe('local-llm');
    expect(resolved.adapter.name).toBe('local-llm');
    expect(resolved.model).toBe('Qwen3.8-27B');
  });

  it('resolves the real streaming tool dispatcher under the local-llm identity and surfaces health', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: 'Qwen3.8-27B' },
      { env: {}, config: { providers: { 'local-llm': { baseUrl: 'http://127.0.0.1:8080/v1' } } }, fetchFn },
    );
    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) return;
    expect(resolved.providerName).toBe('local-llm');
    expect(resolved.providerName).not.toBe('openai');
    expect(resolved.adapter.name).toBe('local-llm');
    expect(typeof resolved.adapter.send).toBe('function');
    expect(resolved.model).toBe('Qwen3.8-27B');
    await expect(resolved.endpointHealth?.()).resolves.toEqual({ endpoint: 'http://127.0.0.1:8080/v1', healthy: true });
    expect(fetchFn).toHaveBeenCalledWith('http://127.0.0.1:8080/health');
    await expect(formatNativeProviderStatus(resolved, 'en')).resolves.toBe('Provider: local-llm · Model: Qwen3.8-27B · Endpoint: healthy');
    await expect(formatNativeProviderStatus(resolved, 'tr')).resolves.toBe('Sağlayıcı: local-llm · Model: Qwen3.8-27B · Endpoint: sağlıklı');
    expect(getMessage('native.provider_status', 'en')).not.toBe('native.provider_status');
  });

  it('never treats an OpenAI base URL as local-llm selection authority', () => {
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: 'Qwen3.8-27B' },
      { env: {}, config: { openai_base_url: 'http://127.0.0.1:8080/v1' } },
    );
    expect(resolved).toMatchObject({ errorCode: 'missing-local-llm-endpoint', provider: 'local-llm' });
  });

  it('reports an unhealthy endpoint without changing provider identity', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }));
    const resolved = resolveNativeSelection(
      { provider: 'local-llm', model: null },
      { env: {}, config: { providers: { 'local-llm': { endpoint: 'http://local.test/v1' } } }, fetchFn },
    );
    expect(resolved).not.toHaveProperty('error');
    if ('error' in resolved) return;
    expect(resolved.providerName).toBe('local-llm');
    await expect(formatNativeProviderStatus(resolved, 'en')).resolves.toContain('Endpoint: unhealthy');
  });
});
