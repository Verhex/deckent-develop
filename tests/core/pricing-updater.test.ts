import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fetchLiteLLMPricing,
  fetchOpenRouterPricing,
  updatePricing,
  formatUpdateResult,
} from '../../src/core/pricing-updater.js';
import { initCostConfig, loadCostConfig } from '../../src/core/cost-config-loader.js';

describe('pricing-updater', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-pricing-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe('fetchLiteLLMPricing', () => {
    it('fetches and parses LiteLLM JSON', async () => {
      const mockData = {
        'claude-opus-4-6': {
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.000025,
          litellm_provider: 'anthropic',
          mode: 'chat',
          max_input_tokens: 1000000,
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => mockData,
        })),
      );

      const data = await fetchLiteLLMPricing();
      expect(data['claude-opus-4-6']).toBeDefined();
      expect(data['claude-opus-4-6']?.input_cost_per_token).toBe(0.000005);
    });

    it('throws on HTTP error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 500,
          statusText: 'Server Error',
        })),
      );

      await expect(fetchLiteLLMPricing()).rejects.toThrow(/LiteLLM fetch failed: 500/);
    });
  });

  describe('fetchOpenRouterPricing', () => {
    it('fetches and parses OpenRouter models', async () => {
      const mockData = {
        data: [
          {
            id: 'anthropic/claude-opus-4-6',
            name: 'Claude Opus 4.6',
            pricing: { prompt: '0.000005', completion: '0.000025' },
          },
        ],
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => mockData,
        })),
      );

      const models = await fetchOpenRouterPricing();
      expect(models).toHaveLength(1);
      expect(models[0]?.id).toBe('anthropic/claude-opus-4-6');
    });
  });

  describe('updatePricing (dry-run)', () => {
    it('updates from mock LiteLLM data, dry-run preserves file', async () => {
      initCostConfig(tmpDir);

      const mockLiteLLM = {
        'claude-opus-4-6': {
          input_cost_per_token: 0.000006, // DELTA: was 0.000005
          output_cost_per_token: 0.000025,
          cache_read_input_token_cost: 0.0000005,
          litellm_provider: 'anthropic',
          mode: 'chat',
          max_input_tokens: 1000000,
          max_output_tokens: 128000,
          supports_prompt_caching: true,
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('litellm')) {
            return { ok: true, json: async () => mockLiteLLM };
          }
          return { ok: false, status: 404, statusText: 'Not found' };
        }),
      );

      const result = await updatePricing(tmpDir, { dryRun: true, skipValidation: true });
      expect(result.success).toBe(true);
      expect(result.source).toBe('litellm');
      expect(result.modelsUpdated).toBeGreaterThan(0);
      expect(result.deltaReport.length).toBeGreaterThan(0);

      // Dry-run: file should NOT be modified
      const configPath = join(tmpDir, '.deckent', 'cost-config.json');
      const content = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(content.providers.anthropic.models['claude-opus-4-6'].input_cost_per_token).toBe(0.000005);
    });

    it('writes file when not dry-run', async () => {
      initCostConfig(tmpDir);

      const mockLiteLLM = {
        'claude-opus-4-6': {
          input_cost_per_token: 0.000006,
          output_cost_per_token: 0.000025,
          litellm_provider: 'anthropic',
          mode: 'chat',
          max_input_tokens: 1000000,
          max_output_tokens: 128000,
        },
      };

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('litellm')) {
            return { ok: true, json: async () => mockLiteLLM };
          }
          return { ok: false, status: 404, statusText: 'Not found' };
        }),
      );

      const result = await updatePricing(tmpDir, { dryRun: false, skipValidation: true });
      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      const configPath = join(tmpDir, '.deckent', 'cost-config.json');
      const content = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(content.providers.anthropic.models['claude-opus-4-6'].input_cost_per_token).toBe(0.000006);
      expect(content._update_source).toBe('litellm');
    });

    it('preserves user notes and cost_limits across update', async () => {
      initCostConfig(tmpDir);
      // Manually customize
      const configPath = join(tmpDir, '.deckent', 'cost-config.json');
      const existing = JSON.parse(readFileSync(configPath, 'utf-8'));
      existing._user_notes = 'MY PROTECTED NOTE';
      existing.cost_limits.sprint_max_usd = 99;
      writeFileSync(configPath, JSON.stringify(existing));

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('litellm')) {
            return {
              ok: true,
              json: async () => ({
                'claude-opus-4-6': {
                  input_cost_per_token: 0.000005,
                  output_cost_per_token: 0.000025,
                  litellm_provider: 'anthropic',
                  mode: 'chat',
                  max_input_tokens: 1000000,
                },
              }),
            };
          }
          return { ok: false, status: 404 };
        }),
      );

      await updatePricing(tmpDir, { skipValidation: true });

      const content = JSON.parse(readFileSync(configPath, 'utf-8'));
      expect(content._user_notes).toBe('MY PROTECTED NOTE');
      expect(content.cost_limits.sprint_max_usd).toBe(99);
    });

    it('rejects malformed LiteLLM entries (unit safety)', async () => {
      initCostConfig(tmpDir);

      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url.includes('litellm')) {
            return {
              ok: true,
              json: async () => ({
                'claude-opus-4-6': {
                  input_cost_per_token: 5, // WRONG — per-MTok instead of per-token
                  output_cost_per_token: 25,
                  litellm_provider: 'anthropic',
                  mode: 'chat',
                  max_input_tokens: 1000000,
                },
              }),
            };
          }
          return { ok: false, status: 404 };
        }),
      );

      const result = await updatePricing(tmpDir, { dryRun: true, skipValidation: true });
      // Merged config should fail validation
      expect(result.success).toBe(false);
      expect(result.warnings.some((w) => /Unit error/.test(w))).toBe(true);
    });

    it('handles all-sources failure gracefully', async () => {
      initCostConfig(tmpDir);

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('Network down');
        }),
      );

      const result = await updatePricing(tmpDir, { dryRun: true });
      expect(result.success).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('formatUpdateResult', () => {
    it('formats successful result', () => {
      const result = {
        success: true,
        source: 'litellm' as const,
        modelsUpdated: 3,
        modelsAdded: 1,
        modelsUnchanged: 15,
        warnings: [],
        deltaReport: [],
        dryRun: false,
      };
      const output = formatUpdateResult(result);
      expect(output).toContain('✅ success');
      expect(output).toContain('+1 new');
      expect(output).toContain('3 updated');
    });

    it('formats delta report', () => {
      const result = {
        success: true,
        source: 'litellm' as const,
        modelsUpdated: 1,
        modelsAdded: 0,
        modelsUnchanged: 0,
        warnings: [],
        deltaReport: [
          {
            model: 'anthropic/claude-opus-4-6',
            field: 'input_cost_per_token',
            oldValue: 0.000005,
            newValue: 0.000006,
            deltaPercent: 20,
          },
        ],
        dryRun: false,
      };
      const output = formatUpdateResult(result);
      expect(output).toContain('anthropic/claude-opus-4-6');
      expect(output).toContain('+20.0%');
    });

    it('formats dry-run marker', () => {
      const result = {
        success: true,
        source: 'litellm' as const,
        modelsUpdated: 0,
        modelsAdded: 0,
        modelsUnchanged: 5,
        warnings: [],
        deltaReport: [],
        dryRun: true,
      };
      const output = formatUpdateResult(result);
      expect(output).toContain('(dry-run)');
    });
  });
});
