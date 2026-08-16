import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: vi.fn().mockReturnValue(false),
  statSync: vi.fn().mockReturnValue({ mtimeMs: 0 }),
}));

vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readFile: vi.fn(),
}));

import { clearConfigCache, loadConfig } from '../../src/core/config.js';
import { OpenAICompatibleAdapter } from '../../src/providers/openai-compatible.js';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OpenAICompatibleAdapter local no-auth contract', () => {
  afterEach(() => {
    clearConfigCache();
    vi.restoreAllMocks();
  });

  it('sends no Authorization header and never requires or synthesizes a key', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({
      choices: [{ message: { content: 'local response' } }],
      model: 'Qwen3.8-27B',
    }));
    const adapter = new OpenAICompatibleAdapter({
      name: 'local-llm',
      baseURL: 'http://127.0.0.1:8080/v1',
      authMode: 'none',
      executionCostClass: 'local',
      models: ['Qwen3.8-27B'],
      fetchImpl,
    });

    await expect(adapter.send([{ role: 'user', content: 'hello' }], 'Qwen3.8-27B'))
      .resolves.toMatchObject({ content: 'local response' });

    const init = fetchImpl.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(adapter.apiKeyEnv).toBe('');
    expect(adapter.executionCostClass).toBe('local');
  });

  it('parses live identity and health responses and uses them for availability', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return response({ data: [{ id: 'Qwen3.8-27B', owned_by: 'llamacpp' }] });
      }
      if (url.endsWith('/health')) return response({ status: 'ok' });
      throw new Error(`unexpected URL: ${url}`);
    });
    const adapter = new OpenAICompatibleAdapter({
      name: 'local-llm',
      baseURL: 'http://127.0.0.1:8080/v1',
      authMode: 'local',
      models: ['Qwen3.8-27B'],
      fetchImpl,
    });

    await expect(adapter.fetchIdentity()).resolves.toEqual(['Qwen3.8-27B']);
    await expect(adapter.probeHealth()).resolves.toBe(true);
    await expect(adapter.isAvailable()).resolves.toBe(true);
    await expect(adapter.diagnoseAvailability()).resolves.toMatchObject({
      available: true,
      authMethod: 'none',
      authStatus: 'ok',
      models: ['Qwen3.8-27B'],
    });
    for (const [, init] of fetchImpl.mock.calls) {
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    }
  });

  it('keeps the keyless local provider after loadConfig resolution', async () => {
    const config = await loadConfig('/hermetic/local-llm-project', { force: true });
    const local = config.providers?.registry?.find(provider => provider.name === 'local-llm');
    expect(local).toEqual({
      name: 'local-llm',
      type: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKeyEnv: '',
      authMode: 'none',
      executionCostClass: 'local',
      models: ['Qwen3.8-27B'],
    });
  });
});
