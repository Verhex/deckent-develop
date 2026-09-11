import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CODEX_PARITY_MODELS,
  ModelRegistry,
  registerCodexParityModels,
} from '../../src/core/model-registry.js';
import { getDefaultConfig, validateConfig } from '../../src/core/config.js';
import { CATALOG_URL, getBundledCatalog, loadCatalog } from '../../src/core/model-catalog.js';
import {
  ModelActivationStore,
  resolveProjectModelExecutionAuthority,
} from '../../src/core/model-activation-store.js';
import { findModel, validateCostConfig } from '../../src/core/cost-config-loader.js';
import { getProviderCommandSpec } from '../../src/core/provider-command-spec.js';
import { resolveReasoningEffort } from '../../src/core/reasoning-effort.js';
import { buildExactDockerProviderInvocation } from '../../src/orchestra/spawn-backend-docker.js';

// Catalog and invocation construction proofs only: no provider process,
// subscription entitlement, actual usage, landing, or settlement is asserted.
describe('gpt-6-astra exact catalog admission', () => {
  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'deckent-astra-catalog-'));
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('ships exact official metadata without aliases or changing tier defaults', () => {
    const registry = new ModelRegistry();
    expect(CODEX_PARITY_MODELS.filter(model => model.id === 'gpt-6-astra')).toHaveLength(1);
    expect(registry.get('gpt-6-astra')).toEqual({
      id: 'gpt-6-astra',
      apiId: 'gpt-6-astra',
      provider: 'codex',
      tier: 'premium_plus',
      contextWindow: 1_050_000,
      costPerMillion: { input: 10, output: 50, cacheReadInput: 1 },
      pricingEvidenceRef: 'https://developers.openai.com/api/docs/pricing',
      capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: true },
      status: 'ga',
      maxOutputTokens: 128_000,
    });
    expect(registry.resolveApiId('gpt-6-astra')).toBe('gpt-6-astra');
    expect(registry.get('astra')).toBeUndefined();
    expect(registry.get('gpt-6')).toBeUndefined();
    expect(registry.getByProviderAndTier('codex', 'premium_plus')?.id).toBe('gpt-5.6-sol');
    expect(registry.getByProviderAndTier('codex', 'premium')?.id).toBe('gpt-5.5');
    expect(registry.getByProviderAndTier('codex', 'standard')?.id).toBe('gpt-5.6-terra');
    expect(registry.getByProviderAndTier('codex', 'economy')?.id).toBe('gpt-5.6-luna');
  });

  it('accepts the exact configured performance Brain without changing the native model', () => {
    const config = getDefaultConfig();
    config.native_provider = 'local-llm';
    config.native_model = 'fixture-local-model';
    config.modes.performance.brain_model = 'gpt-6-astra';
    expect(() => validateConfig(config)).not.toThrow();
    expect(config.native_provider).toBe('local-llm');
    expect(config.native_model).toBe('fixture-local-model');
    config.modes.performance.brain_model = 'gpt-6-unregistered';
    expect(() => validateConfig(config)).toThrow(/brain_model/);
  });

  it('stays unique through repeated parity registration', () => {
    const registry = new ModelRegistry();
    registerCodexParityModels(registry);
    registerCodexParityModels(registry);
    expect(registry.getByProvider('codex').filter(model => model.id === 'gpt-6-astra')).toHaveLength(1);
  });

  it('survives offline catalog loading without network or ambient cache', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const catalog = await loadCatalog({
      offline: true,
      cachePath: join(projectRoot, 'models-catalog.json'),
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(catalog.source).toBe('bundled');
    expect(catalog.models.filter(model => model.id === 'gpt-6-astra')).toHaveLength(1);
    expect(catalog.models.find(model => model.id === 'gpt-6-astra'))
      .toEqual(getBundledCatalog().find(model => model.id === 'gpt-6-astra'));
  });

  it('requires explicit owner activation under explicit-active policy', () => {
    const store = new ModelActivationStore(projectRoot);
    try {
      store.setProviderPolicy('codex', 'explicit-active', 'test-owner');
      store.setActivation('codex', 'gpt-5.6-sol', true, 'test-owner');
      const before = resolveProjectModelExecutionAuthority(projectRoot, 'codex', 'gpt-6-astra');
      expect(before.state).toBe('ready');
      expect(before.executable).toBe(false);
      store.setActivation('codex', 'gpt-6-astra', true, 'test-owner');
      const after = resolveProjectModelExecutionAuthority(projectRoot, 'codex', 'gpt-6-astra');
      expect(after.state).toBe('ready');
      expect(after.executable).toBe(true);
      expect(after.snapshotDigest).not.toBe(before.snapshotDigest);
      expect(resolveProjectModelExecutionAuthority(projectRoot, 'codex', 'gpt-5.6-sol').executable)
        .toBe(true);
    } finally {
      store.close();
    }
  });

  it('preserves the canonical model when a cached external catalog omits Astra', async () => {
    const cachePath = join(projectRoot, 'models-catalog.json');
    const now = 1_788_566_400_000;
    await writeFile(cachePath, JSON.stringify({
      fetchedAt: now,
      url: CATALOG_URL,
      payload: {
        version: 'test-snapshot',
        models: [{
          id: 'catalog-fixture-model',
          provider: 'openai',
          tier: 'standard',
          costPerMillion: { input: 2, output: 4 },
        }],
      },
    }), 'utf8');
    const fetchImpl = vi.fn<typeof fetch>();
    const catalog = await loadCatalog({ cachePath, now: () => now, fetchImpl });
    expect(catalog.source).toBe('cache');
    expect(fetchImpl).not.toHaveBeenCalled();
    const registry = new ModelRegistry(catalog.models);
    expect(registry.resolveApiId('gpt-6-astra')).toBe('gpt-6-astra');
    expect(registry.getByProviderAndTier('codex', 'premium_plus')?.id).toBe('gpt-5.6-sol');
  });

  it('keeps existing implicit-active behavior when no activation store exists', () => {
    const authority = resolveProjectModelExecutionAuthority(projectRoot, 'codex', 'gpt-6-astra');
    expect(authority.state).toBe('ready');
    expect(authority.providerMode).toBe('implicit-active');
    expect(authority.executable).toBe(true);
  });

  it('ships per-token short-context pricing and documents the long-context limitation', async () => {
    // Read source explicitly: an older dist copy must not certify this change.
    const raw = await readFile(new URL('../../src/core/pricing-data-baseline.json', import.meta.url), 'utf8');
    const config = validateCostConfig(JSON.parse(raw));
    const pricing = config.providers.openai?.models['gpt-6-astra'];
    expect(pricing).toMatchObject({
      input_cost_per_token: 0.00001,
      output_cost_per_token: 0.00005,
      cache_read_input_token_cost: 0.000001,
      cache_creation_input_token_cost: 0.0000125,
      max_input_tokens: 922_000,
      max_output_tokens: 128_000,
      deckent_tier: 'premium_plus',
      _source: 'openai-official-pricing',
      _verified_at: '2026-09-11',
    });
    expect(pricing?.deckent_aliases).toBeUndefined();
    expect(pricing?._notes).toContain('does not represent this context-tiered tariff');
    expect(findModel(config, 'gpt-6-astra')?.modelId).toBe('gpt-6-astra');
    expect(findModel(config, 'astra')).toBeNull();
  });

  it('constructs exact Docker Codex argv with the exact model and supported high effort', () => {
    const registry = new ModelRegistry();
    const spec = getProviderCommandSpec('codex');
    expect(spec).not.toBeNull();
    if (!spec) throw new Error('Missing canonical Codex provider command specification');
    const invocation = buildExactDockerProviderInvocation(spec, registry.resolveApiId('gpt-6-astra'), {
      reasoningEffort: resolveReasoningEffort('codex', 'high'),
    });
    expect(invocation.binary).toBe('codex');
    expect(invocation.args[invocation.args.indexOf('--model') + 1]).toBe('gpt-6-astra');
    expect(invocation.args.filter(arg => arg === 'gpt-6-astra')).toHaveLength(1);
    expect(invocation.args).toContain('model_reasoning_effort=high');
  });
});
