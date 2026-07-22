import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderDefinition, ResolvedConfig } from '../../src/core/config-types.js';

const mockState = vi.hoisted(() => ({
  captures: {
    codex: [] as Array<{ credentialEnvKeys?: readonly string[] }>,
    ollama: [] as Array<{ credentialEnvKeys?: readonly string[] }>,
    openaiCompatible: [] as Array<{ credentialEnvKeys?: readonly string[] }>,
    openrouter: [] as Array<{ credentialEnvKeys?: readonly string[] }>,
  },
  adapter: (name: string) => ({
    name,
    supportedModels: [],
    isAvailable: async () => true,
    spawn: () => undefined,
    kill: () => undefined,
    listWorkers: () => [],
    buildCommand: () => '',
  }),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '', pid: 1, signal: null, output: [] })),
  spawn: vi.fn(),
}));

vi.mock('../../src/core/deck-file.js', () => ({
  loadDeckSecrets: vi.fn(() => ({})),
}));

vi.mock('../../src/providers/ollama.js', () => ({
  createOllamaAdapter: vi.fn((_root: string, opts?: { credentialEnvKeys?: readonly string[] }) => {
    mockState.captures.ollama.push(opts ?? {});
    return mockState.adapter('ollama');
  }),
}));

vi.mock('../../src/providers/codex.js', () => ({
  createCodexAdapter: vi.fn((_root: string, opts?: { credentialEnvKeys?: readonly string[] }) => {
    mockState.captures.codex.push(opts ?? {});
    return mockState.adapter('codex');
  }),
}));

vi.mock('../../src/providers/openai-compatible.js', () => {
  class OpenAICompatibleAdapter {
    readonly name: string;
    readonly supportedModels: readonly string[];

    constructor(config: { name: string; models: readonly string[]; credentialEnvKeys?: readonly string[] }) {
      this.name = config.name;
      this.supportedModels = config.models;
      mockState.captures.openaiCompatible.push(config);
    }

    spawn(): void {}
    kill(): void {}
    listWorkers(): string[] { return []; }
    buildCommand(): string { return ''; }
  }

  return {
    OpenAICompatibleAdapter,
    OPENAI_COMPAT_PRESETS: {
      deepseek: vi.fn(),
      qwen: vi.fn(),
      glm: vi.fn(),
    },
  };
});

vi.mock('../../src/providers/openrouter.js', () => ({
  createOpenRouterAdapter: vi.fn((_root: string, opts?: { credentialEnvKeys?: readonly string[] }) => {
    mockState.captures.openrouter.push(opts ?? {});
    return mockState.adapter('openrouter');
  }),
}));

import { bootstrapProviders, ProviderRegistry } from '../../src/core/provider.js';
import { resolveCrossProviderCredentialKeys } from '../../src/providers/cross-provider-keys.js';

describe('bootstrapProviders — canonical credential scrub key threading', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const registryDefs: ProviderDefinition[] = [
    {
      name: 'my-llm',
      type: 'openai-compatible',
      baseUrl: 'https://api.example.test/v1',
      apiKeyEnv: 'MY_LLM_KEY',
      models: ['my-llm-v1'],
    },
    { name: 'codex-alias', type: 'codex' },
    { name: 'local-alias', type: 'ollama' },
  ];
  const credentialKeys = resolveCrossProviderCredentialKeys({ registry: registryDefs });

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.captures.codex.length = 0;
    mockState.captures.ollama.length = 0;
    mockState.captures.openaiCompatible.length = 0;
    mockState.captures.openrouter.length = 0;
    for (const key of credentialKeys) delete process.env[key];
    globalThis.fetch = vi.fn(async () => new Response('', { status: 503 })) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it('passes the same base+registry key set to Codex, Ollama, OpenAI-compatible and OpenRouter adapters', async () => {
    const config = {
      projectRoot: '/tmp/provider-credential-key-threading',
      auth_mode: 'api',
      brain_provider: undefined,
      worker_provider: undefined,
      fallback_provider: undefined,
      providers: { registry: registryDefs },
      openrouter: { enabled: true },
    } as unknown as ResolvedConfig;

    await bootstrapProviders(config, config.projectRoot, new ProviderRegistry());

    const expected = resolveCrossProviderCredentialKeys({ registry: registryDefs });
    expect(mockState.captures.codex).toHaveLength(1);
    expect(mockState.captures.ollama).toHaveLength(1);
    expect(mockState.captures.openaiCompatible).toHaveLength(1);
    expect(mockState.captures.openrouter).toHaveLength(1);
    expect(mockState.captures.codex[0]?.credentialEnvKeys).toEqual(expected);
    expect(mockState.captures.ollama[0]?.credentialEnvKeys).toEqual(expected);
    expect(mockState.captures.openaiCompatible[0]?.credentialEnvKeys).toEqual(expected);
    expect(mockState.captures.openrouter[0]?.credentialEnvKeys).toEqual(expected);
  });
});
