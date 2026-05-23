// ─── CLI models command tests (Sprint 190 190-011) ─────────────────────────
// Tests: list output format, provider filter, refresh cache invalidate

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => ({
  loadCatalog: vi.fn(),
  print: vi.fn(),
  printError: vi.fn(),
}));

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('../../src/core/model-catalog.js', () => ({
  loadCatalog: hoisted.loadCatalog,
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: hoisted.print,
  printError: hoisted.printError,
  color: (_code: string, text: string) => text,
}));

// ─── Static imports (after mocks) ──────────────────────────────────────────

import {
  registerModels,
  renderModelsTable,
  findModel,
  sourceBadge,
  colorTier,
} from '../../src/cli/commands/models.js';
import type { ModelDefinition } from '../../src/core/model-registry.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const MODEL_OPUS: ModelDefinition = {
  id: 'opus',
  apiId: 'claude-opus-4-6',
  provider: 'claude',
  tier: 'premium',
  contextWindow: 1_000_000,
  costPerMillion: { input: 15, output: 75 },
  capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
  status: 'ga',
};

const MODEL_SONNET: ModelDefinition = {
  id: 'sonnet',
  apiId: 'claude-sonnet-4-6',
  provider: 'claude',
  tier: 'standard',
  contextWindow: 200_000,
  costPerMillion: { input: 3, output: 15 },
  capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
  status: 'ga',
};

const MODEL_GPT5: ModelDefinition = {
  id: 'gpt-5',
  apiId: 'gpt-5',
  provider: 'codex',
  tier: 'premium',
  contextWindow: 1_000_000,
  costPerMillion: { input: 5, output: 15 },
  capabilities: { streaming: true, toolUse: true, vision: true, codeExecution: true, reasoning: false },
  status: 'ga',
};

const CATALOG_RESULT = {
  models: [MODEL_OPUS, MODEL_SONNET, MODEL_GPT5],
  source: 'bundled' as const,
  fetchedAt: null,
  ageMs: null,
  warnings: [],
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function resetMocks(): void {
  hoisted.loadCatalog.mockReset();
  hoisted.print.mockReset();
  hoisted.printError.mockReset();
}

async function runModelsCommand(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerModels(program);
  // args = ['list', ...] → pass 'models list ...' to the root program
  await program.parseAsync(['node', 'deckent', 'models', ...args]);
}

// ─── Unit helpers ──────────────────────────────────────────────────────────

describe('renderModelsTable', () => {
  it('renders header + separator + rows for each model', () => {
    const table = renderModelsTable([MODEL_OPUS, MODEL_SONNET]);
    expect(table).toContain('ID');
    expect(table).toContain('PROVIDER');
    expect(table).toContain('TIER');
    expect(table).toContain('opus');
    expect(table).toContain('sonnet');
  });

  it('returns a "No models found" message when list is empty', () => {
    const result = renderModelsTable([]);
    expect(result).toContain('No models found');
  });
});

describe('findModel', () => {
  it('finds a model by id', () => {
    const found = findModel([MODEL_OPUS, MODEL_SONNET], 'opus');
    expect(found).toBe(MODEL_OPUS);
  });

  it('finds a model by apiId', () => {
    const found = findModel([MODEL_OPUS, MODEL_SONNET], 'claude-sonnet-4-6');
    expect(found).toBe(MODEL_SONNET);
  });

  it('returns undefined when model is not found', () => {
    const found = findModel([MODEL_OPUS], 'nonexistent-model');
    expect(found).toBeUndefined();
  });
});

describe('sourceBadge', () => {
  it('labels remote source as "live"', () => {
    expect(sourceBadge('remote')).toContain('live');
  });

  it('labels cache source as "cached"', () => {
    expect(sourceBadge('cache')).toContain('cached');
  });

  it('labels bundled source as "bundled"', () => {
    expect(sourceBadge('bundled')).toContain('bundled');
  });
});

describe('colorTier', () => {
  it('returns a padded tier label', () => {
    const result = colorTier('premium');
    expect(result).toContain('premium');
  });

  it('handles premium_plus tier', () => {
    const result = colorTier('premium_plus');
    expect(result).toContain('premium+');
  });
});

// ─── Command tests ─────────────────────────────────────────────────────────

describe('deckent models list', () => {
  beforeEach(resetMocks);

  it('lists all models when no provider filter is given', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    await runModelsCommand(['list']);

    expect(hoisted.loadCatalog).toHaveBeenCalledWith({ offline: undefined });
    const printed = hoisted.print.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('opus');
    expect(printed).toContain('sonnet');
    expect(printed).toContain('gpt-5');
  });

  it('filters models by provider when --provider is specified', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    await runModelsCommand(['list', '--provider', 'claude']);

    const printed = hoisted.print.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('opus');
    expect(printed).toContain('sonnet');
    expect(printed).not.toContain('gpt-5');
  });

  it('shows a "no models" message when provider filter matches nothing', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    await runModelsCommand(['list', '--provider', 'ollama']);

    const printed = hoisted.print.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('No models found');
  });

  it('shows warnings when catalog has non-fatal issues', async () => {
    hoisted.loadCatalog.mockResolvedValue({
      ...CATALOG_RESULT,
      warnings: ['remote-fetch-failed: network error'],
    });

    await runModelsCommand(['list']);

    const printed = hoisted.print.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('remote-fetch-failed');
  });

  it('reports error and sets exit code on catalog failure', async () => {
    hoisted.loadCatalog.mockRejectedValue(new Error('disk full'));

    await runModelsCommand(['list']);

    expect(hoisted.printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

describe('deckent models refresh', () => {
  beforeEach(resetMocks);

  it('calls loadCatalog with forceRefresh: true', async () => {
    hoisted.loadCatalog.mockResolvedValue({
      ...CATALOG_RESULT,
      source: 'remote' as const,
      fetchedAt: Date.now(),
    });

    await runModelsCommand(['refresh']);

    expect(hoisted.loadCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
  });

  it('prints model count and source badge after refresh', async () => {
    const now = Date.now();
    hoisted.loadCatalog.mockResolvedValue({
      ...CATALOG_RESULT,
      source: 'remote' as const,
      fetchedAt: now,
    });

    await runModelsCommand(['refresh']);

    const printed = hoisted.print.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('3');
    expect(printed).toContain('live');
  });

  it('reports error when refresh fails', async () => {
    hoisted.loadCatalog.mockRejectedValue(new Error('timeout'));

    await runModelsCommand(['refresh']);

    expect(hoisted.printError).toHaveBeenCalled();
    process.exitCode = 0;
  });
});

describe('deckent models tier', () => {
  beforeEach(resetMocks);

  it('prints tier info for a known model', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    await runModelsCommand(['tier', 'opus']);

    const printed = hoisted.print.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('opus');
    expect(printed).toContain('premium');
    expect(printed).toContain('claude');
  });

  it('reports error and sets exit code when model is not found', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    await runModelsCommand(['tier', 'nonexistent']);

    expect(hoisted.printError).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });

  it('looks up a model by apiId', async () => {
    hoisted.loadCatalog.mockResolvedValue(CATALOG_RESULT);

    await runModelsCommand(['tier', 'claude-opus-4-6']);

    const printed = hoisted.print.mock.calls.map((c: unknown[]) => c[0] as string).join('\n');
    expect(printed).toContain('opus');
  });
});
