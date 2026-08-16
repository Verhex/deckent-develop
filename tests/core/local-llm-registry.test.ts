import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
}));

import { DeckentError } from '../../src/core/errors.js';
import {
  LOCAL_LLM_HEALTH_FRESHNESS_MS,
  ModelRegistry,
  ensureLocalLlmModelRegistered,
} from '../../src/core/model-registry.js';
import {
  LocalProviderHoldError,
  ProviderRegistry,
  bootstrapProviders,
  resolveOpenAICompatCandidates,
  resolveProviderWithFallback,
  type ProviderAdapter,
} from '../../src/core/provider.js';
import type { ModelType, ProviderName } from '../../src/core/types.js';

const MODEL_ID = 'Qwen3.8-27B';
const LOCAL_PROVIDER = 'local-llm' as ProviderName;

const OWNER_FACTS = {
  tier: 'standard',
  contextWindow: 262_144,
  capabilities: {
    streaming: true,
    toolUse: true,
    vision: false,
    codeExecution: false,
    reasoning: true,
  },
} as const;

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-local-llm-'));
  tempRoots.push(root);
  return root;
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function adapter(name: string, available: boolean, executionCostClass?: 'remote' | 'local'): ProviderAdapter {
  return {
    name,
    supportedModels: [MODEL_ID as ModelType],
    executionCostClass,
    spawn: vi.fn(),
    kill: vi.fn(),
    listWorkers: vi.fn().mockReturnValue([]),
    isAvailable: vi.fn().mockResolvedValue(available),
    buildCommand: vi.fn().mockReturnValue('unused'),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('local-llm registry identity', () => {
  it('registers a fresh healthy local identity at zero cost without claiming ollama', () => {
    const registry = new ModelRegistry([]);
    const nowMs = 1_000_000;

    ensureLocalLlmModelRegistered(MODEL_ID, OWNER_FACTS, {
      modelIds: [MODEL_ID],
      healthy: true,
      checkedAtMs: nowMs,
    }, registry, nowMs);

    expect(registry.get(MODEL_ID)).toMatchObject({
      id: MODEL_ID,
      apiId: MODEL_ID,
      provider: 'local-llm',
      tier: 'standard',
      contextWindow: 262_144,
      costPerMillion: { input: 0, output: 0 },
      status: 'ga',
      capabilities: { toolUse: true, reasoning: true },
    });
    expect(registry.getByProvider('ollama')).toEqual([]);
  });

  it('holds stale, unhealthy, or identity-mismatched endpoint evidence', () => {
    const registry = new ModelRegistry([]);
    const nowMs = 1_000_000;
    const evidence = { modelIds: [MODEL_ID], healthy: true, checkedAtMs: nowMs };

    expect(() => ensureLocalLlmModelRegistered(
      MODEL_ID,
      OWNER_FACTS,
      { ...evidence, checkedAtMs: nowMs - LOCAL_LLM_HEALTH_FRESHNESS_MS - 1 },
      registry,
      nowMs,
    )).toThrowError(expect.objectContaining({ code: 'E_LOCAL_PROVIDER_HEALTH_HOLD' }));
    expect(() => ensureLocalLlmModelRegistered(
      MODEL_ID,
      OWNER_FACTS,
      { ...evidence, healthy: false },
      registry,
      nowMs,
    )).toThrowError(expect.objectContaining({ code: 'E_LOCAL_PROVIDER_HEALTH_HOLD' }));
    expect(() => ensureLocalLlmModelRegistered(
      MODEL_ID,
      OWNER_FACTS,
      { ...evidence, modelIds: ['other-model'] },
      registry,
      nowMs,
    )).toThrowError(expect.objectContaining({ code: 'E_LOCAL_PROVIDER_HEALTH_HOLD' }));
  });

  it('admits explicit local ownership parametrically and holds local-to-cloud equivalence', () => {
    const registry = new ModelRegistry([]);
    ensureLocalLlmModelRegistered(MODEL_ID, OWNER_FACTS, {
      modelIds: [MODEL_ID],
      healthy: true,
      checkedAtMs: 100,
    }, registry, 100);

    expect(() => registry.getEquivalent(MODEL_ID, 'codex')).toThrowError(
      expect.objectContaining<Partial<DeckentError>>({ code: 'E_LOCAL_PROVIDER_FALLBACK_HOLD' }),
    );
  });
});

describe('local-llm provider bootstrap and dispatch', () => {
  it('retains a keyless candidate and bootstraps auth/cost metadata after live health and identity', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'http://127.0.0.1:8080/v1/health') return response({ status: 'ok' });
      if (url === 'http://127.0.0.1:8080/v1/models') {
        return response({ data: [{ id: MODEL_ID, owned_by: 'llamacpp' }] });
      }
      if (url.includes(':11434/api/tags')) return response({}, 503);
      throw new Error(`unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', fetchImpl);

    const definition = {
      name: 'local-llm',
      type: 'openai-compatible' as const,
      baseUrl: 'http://127.0.0.1:8080/v1',
      apiKeyEnv: '',
      authMode: 'none' as const,
      executionCostClass: 'local' as const,
      models: [MODEL_ID],
    };
    expect(resolveOpenAICompatCandidates([definition])).toContainEqual(expect.objectContaining({
      name: 'local-llm',
      apiKeyEnv: '',
      authMode: 'none',
      executionCostClass: 'local',
    }));

    const providers = new ProviderRegistry();
    const models = new ModelRegistry([]);
    const result = await bootstrapProviders({
      projectRoot: tempRoot(),
      brain_provider: LOCAL_PROVIDER,
      worker_provider: LOCAL_PROVIDER,
      auth_mode: 'subscription',
      providers: { registry: [definition] },
    }, undefined, providers, { mr: models });

    expect(result.registered).toContain(LOCAL_PROVIDER);
    const local = providers.getProvider('local-llm') as ProviderAdapter & {
      authMode: string;
      apiKeyEnv: string;
    };
    expect(local).toMatchObject({
      name: 'local-llm',
      authMode: 'none',
      apiKeyEnv: '',
      executionCostClass: 'local',
    });
    expect(models.get(MODEL_ID)?.provider).toBe('local-llm');
    await result.modelAutoDetectPromise;
  });

  it('freshly probes a local primary and holds before consulting a cloud fallback', async () => {
    const providers = new ProviderRegistry();
    const local = adapter('local-llm', false, 'local');
    const cloud = adapter('codex', true, 'remote');
    providers.registerProvider(local);
    providers.registerProvider(cloud);

    await expect(resolveProviderWithFallback(
      LOCAL_PROVIDER,
      MODEL_ID as ModelType,
      { fallback_provider: 'codex' },
      providers,
    )).rejects.toMatchObject({
      name: 'LocalProviderHoldError',
      code: 'E_LOCAL_PROVIDER_HOLD',
      disposition: 'HOLD',
      reasonCode: 'endpoint-unhealthy',
    } satisfies Partial<LocalProviderHoldError>);
    expect(local.isAvailable).toHaveBeenCalledOnce();
    expect(cloud.isAvailable).not.toHaveBeenCalled();
  });
});
