import { createHash } from 'node:crypto';
import type { CatalogLoadResult } from '../../core/model-catalog.js';
import type { ModelDefinition } from '../../core/model-registry.js';
import {
  DEFAULT_PROVIDER_POLICY_MODE,
  type ProjectModelActivationSnapshot,
} from '../../core/model-activation-store.js';

const compareModels = (a: ModelDefinition, b: ModelDefinition): number =>
  a.provider === b.provider
    ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    : (a.provider < b.provider ? -1 : 1);

export function modelJson(model: ModelDefinition): Record<string, unknown> {
  return {
    id: model.id,
    apiId: model.apiId,
    provider: model.provider,
    tier: model.tier,
    status: model.status,
    contextWindow: model.contextWindow,
    maxOutputTokens: model.maxOutputTokens ?? null,
    costPerMillion: { input: model.costPerMillion.input, output: model.costPerMillion.output },
    capabilities: {
      streaming: model.capabilities.streaming,
      toolUse: model.capabilities.toolUse,
      vision: model.capabilities.vision,
      codeExecution: model.capabilities.codeExecution,
      reasoning: model.capabilities.reasoning,
    },
    preferredForTier: model.preferredForTier === true,
  };
}

function sortedCatalogModels(models: readonly ModelDefinition[]): ModelDefinition[] {
  return [...models].sort(compareModels);
}

export function modelCatalogDigest(models: readonly ModelDefinition[]): string {
  return createHash('sha256')
    .update(JSON.stringify(sortedCatalogModels(models).map(modelJson)))
    .digest('hex');
}

export function buildModelCatalogListJson(input: {
  catalog: CatalogLoadResult;
  offline: boolean;
  provider: string | null;
}): Record<string, unknown> {
  const models = sortedCatalogModels(input.catalog.models
    .filter((model) => input.provider === null || model.provider === input.provider));
  return {
    schemaVersion: 1,
    kind: 'model-catalog-list',
    source: input.catalog.source,
    fetchedAt: input.catalog.fetchedAt,
    ageMs: input.catalog.ageMs,
    offline: input.offline,
    filter: { provider: input.provider },
    count: models.length,
    catalogDigest: modelCatalogDigest(input.catalog.models),
    models: models.map(modelJson),
    warnings: [...input.catalog.warnings],
  };
}

export function buildModelsJsonError(kind: 'model-catalog-list' | 'model-active-set', code: string): Record<string, unknown> {
  return { schemaVersion: 1, kind, error: { code } };
}

export function buildModelActivationPolicyJson(input: {
  snapshot: ProjectModelActivationSnapshot;
  catalog?: CatalogLoadResult;
  offline: boolean;
}): Record<string, unknown> {
  if (input.snapshot.state === 'hold') {
    return {
      schemaVersion: 1,
      kind: 'model-active-set',
      authority: {
        state: 'hold',
        reasonCode: input.snapshot.reasonCode,
        policySnapshotDigest: input.snapshot.snapshotDigest,
      },
      catalog: null,
      offline: input.offline,
      ownerPermittedModels: [],
      unknownActiveModels: [],
    };
  }
  if (!input.catalog) throw new TypeError('catalog is required for a ready activation snapshot');
  const snapshot = input.snapshot;
  const catalogModels = sortedCatalogModels(input.catalog.models);
  const catalogKeys = new Set(catalogModels.map((model) => `${model.provider}\u0000${model.id}`));
  const permitted = catalogModels.filter((model) => snapshot.policy.isExecutable(model.provider, model.id));
  const unknownActive = snapshot.activationRecords
    .filter((record) => record.active && !catalogKeys.has(`${record.provider}\u0000${record.modelId}`));
  return {
    schemaVersion: 1,
    kind: 'model-active-set',
    authority: {
      state: 'ready',
      policySnapshotDigest: snapshot.snapshotDigest,
      defaultMode: DEFAULT_PROVIDER_POLICY_MODE,
      explicitProviders: [...snapshot.policy.explicitProviders].sort(),
      recordedActivations: snapshot.activationRecords.map((record) => ({ ...record })),
      providerPolicies: snapshot.providerPolicies.map((record) => ({ ...record })),
    },
    catalog: {
      source: input.catalog.source,
      fetchedAt: input.catalog.fetchedAt,
      ageMs: input.catalog.ageMs,
      catalogDigest: modelCatalogDigest(catalogModels),
      warnings: [...input.catalog.warnings],
    },
    offline: input.offline,
    ownerPermittedModels: permitted.map(modelJson),
    unknownActiveModels: unknownActive.map(({ provider, modelId, actor, updatedAt }) => ({ provider, modelId, actor, updatedAt })),
  };
}
