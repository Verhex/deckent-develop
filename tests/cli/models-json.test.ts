import { describe, expect, it } from 'vitest';
import type { CatalogLoadResult } from '../../src/core/model-catalog.js';
import type { ModelDefinition } from '../../src/core/model-registry.js';
import type { ProjectModelActivationSnapshot } from '../../src/core/model-activation-store.js';
import { buildModelActivationPolicyJson, buildModelCatalogListJson } from '../../src/cli/commands/models-json.js';

const model = (id: string, provider: 'claude' | 'codex'): ModelDefinition => ({
  id, apiId: id, provider, tier: 'standard', status: 'ga', contextWindow: 100_000,
  costPerMillion: { input: 1, output: 2 },
  capabilities: { streaming: true, toolUse: true, vision: false, codeExecution: false, reasoning: true },
});
const catalog = (models: ModelDefinition[]): CatalogLoadResult => ({
  models, source: 'bundled', fetchedAt: null, ageMs: null, warnings: ['offline-mode: network skipped'],
});
const ready = (): Extract<ProjectModelActivationSnapshot, { state: 'ready' }> => {
  const active = new Set(['codex\u0000known', 'codex\u0000unknown']);
  return {
    state: 'ready', snapshotDigest: 'a'.repeat(64), reasonCode: null,
    activationRecords: [
      { provider: 'codex', modelId: 'known', active: true, actor: 'owner', updatedAt: '2026-01-01T00:00:00.000Z' },
      { provider: 'codex', modelId: 'unknown', active: true, actor: 'owner', updatedAt: '2026-01-01T00:00:00.000Z' },
      { provider: 'claude', modelId: 'blocked', active: false, actor: 'owner', updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
    providerPolicies: [{ provider: 'codex', mode: 'explicit-active', actor: 'owner', updatedAt: '2026-01-01T00:00:00.000Z' }],
    policy: {
      explicitProviders: new Set(['codex']), activeModels: [], snapshotDigest: 'a'.repeat(64),
      providerMode: provider => provider === 'codex' ? 'explicit-active' : 'implicit-active',
      isExecutable: (provider, id) => provider === 'codex' ? active.has(`${provider}\u0000${id}`) : id !== 'blocked',
    },
  };
};

describe('models JSON projections', () => {
  it('builds a deterministic filtered catalog document with a digest', () => {
    const a = buildModelCatalogListJson({ catalog: catalog([model('z', 'codex'), model('a', 'claude')]), offline: true, provider: null });
    const b = buildModelCatalogListJson({ catalog: catalog([model('a', 'claude'), model('z', 'codex')]), offline: true, provider: null });
    expect(a).toEqual(b);
    expect(a).toMatchObject({ schemaVersion: 1, kind: 'model-catalog-list', count: 2, catalogDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('uses code-point ordering and ignores runtime property insertion order in its digest', () => {
    const mixedA = model('Ä', 'codex');
    const mixedB = model('Z', 'codex');
    const reordered = {
      ...mixedA,
      costPerMillion: { output: mixedA.costPerMillion.output, input: mixedA.costPerMillion.input },
      capabilities: { reasoning: true, codeExecution: false, vision: false, toolUse: true, streaming: true },
    } as ModelDefinition;
    const first = buildModelCatalogListJson({ catalog: catalog([mixedA, mixedB]), offline: true, provider: null });
    const second = buildModelCatalogListJson({ catalog: catalog([mixedB, reordered]), offline: true, provider: null });
    expect(first).toEqual(second);
    expect((first.models as Array<{ id: string }>).map((entry) => entry.id)).toEqual(['Z', 'Ä']);
  });

  it('separates catalog-relative permission from unknown active records', () => {
    const result = buildModelActivationPolicyJson({
      snapshot: ready(), catalog: catalog([model('blocked', 'claude'), model('open', 'claude'), model('known', 'codex'), model('other', 'codex')]), offline: true,
    });
    expect(result).toMatchObject({
      kind: 'model-active-set',
      authority: { state: 'ready', recordedActivations: expect.any(Array), providerPolicies: expect.any(Array) },
      ownerPermittedModels: [{ id: 'open' }, { id: 'known' }],
      unknownActiveModels: [{ provider: 'codex', modelId: 'unknown' }],
    });
  });

  it('renders a typed hold without requiring a catalog', () => {
    expect(buildModelActivationPolicyJson({
      snapshot: { state: 'hold', snapshotDigest: 'b'.repeat(64), reasonCode: 'MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE' },
      offline: true,
    })).toEqual({
      schemaVersion: 1, kind: 'model-active-set',
      authority: { state: 'hold', reasonCode: 'MODEL_ACTIVATION_AUTHORITY_UNAVAILABLE', policySnapshotDigest: 'b'.repeat(64) },
      catalog: null, offline: true, ownerPermittedModels: [], unknownActiveModels: [],
    });
  });
});
