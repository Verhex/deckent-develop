import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import { modelRegistry } from '../../src/core/model-registry.js';
import type { ModelTier } from '../../src/core/model-registry-types.js';

type PricingRow = { deckent_tier?: ModelTier };
type PricingDocument = {
  providers: Record<string, { models: Record<string, PricingRow> }>;
};

function readPricingDocument(relativePath: string): PricingDocument {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8')) as PricingDocument;
}

function findPricingRow(document: PricingDocument, modelId: string): PricingRow | undefined {
  return Object.values(document.providers)
    .map(provider => provider.models[modelId])
    .find((row): row is PricingRow => row !== undefined);
}

describe('model registry pricing invariant', () => {
  const baseline = readPricingDocument('../../src/core/pricing-data-baseline.json');
  const projectCostConfig = readPricingDocument('../../.deckent/cost-config.json');

  it('keeps every mutually priced registry model tier-aligned across all three sources', () => {
    const matchedModels = modelRegistry.getAllModels().filter(model =>
      findPricingRow(baseline, model.id) !== undefined
      && findPricingRow(projectCostConfig, model.id) !== undefined,
    );

    expect(matchedModels.length).toBeGreaterThanOrEqual(9);
    const mismatches = matchedModels.flatMap(model => {
      const baselineTier = findPricingRow(baseline, model.id)?.deckent_tier;
      const projectTier = findPricingRow(projectCostConfig, model.id)?.deckent_tier;
      return baselineTier === model.tier && projectTier === model.tier
        ? []
        : [`${model.id}: registry=${model.tier}, baseline=${baselineTier}, project=${projectTier}`];
    });

    expect(mismatches).toEqual([]);
  });

  it('keeps exactly one preferred Codex model in each preferred tier', () => {
    const preferredByTier = new Map<ModelTier, string[]>();
    for (const model of modelRegistry.getByProvider('codex')) {
      if (model.preferredForTier !== true) continue;
      preferredByTier.set(model.tier, [...(preferredByTier.get(model.tier) ?? []), model.id]);
    }

    expect(preferredByTier.get('premium')).toEqual(['gpt-5.5']);
    expect(preferredByTier.get('premium_plus')).toEqual(['gpt-5.6-sol']);
  });

  it('resolves Codex premium and premium_plus through their explicit preferences', () => {
    expect(modelRegistry.getByProviderAndTier('codex', 'premium')?.id).toBe('gpt-5.5');
    expect(modelRegistry.getByProviderAndTier('codex', 'premium_plus')?.id).toBe('gpt-5.6-sol');
  });
});
