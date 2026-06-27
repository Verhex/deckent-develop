import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadCostConfig,
  validateCostConfig,
  validateCostUnit,
  findModel,
  listEnabledModels,
  formatCostPerMTok,
  initCostConfig,
  CostConfigError,
} from '../../src/core/cost-config-loader.js';

const VALID_CONFIG = {
  _version: '1.0',
  providers: {
    anthropic: {
      enabled: true,
      billing_modes_supported: ['api', 'subscription'],
      default_billing_mode: 'subscription',
      models: {
        'claude-opus-4-6': {
          input_cost_per_token: 0.000005,
          output_cost_per_token: 0.000025,
          cache_read_input_token_cost: 0.0000005,
          max_input_tokens: 1000000,
          max_output_tokens: 128000,
          supports_prompt_caching: true,
          deckent_tier: 'premium',
          deckent_aliases: ['opus', 'opus-4-6'],
          enabled: true,
        },
      },
    },
  },
  cost_limits: {
    sprint_max_usd: 5.0,
    daily_max_usd: 50.0,
  },
  update_config: {
    sources_priority: ['litellm', 'openrouter', 'bundled'],
  },
};

describe('cost-config-loader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-cost-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('validateCostUnit — Sprint 140 $42 disaster prevention', () => {
    it('accepts valid per-token cost (Opus input)', () => {
      expect(() => validateCostUnit(0.000005, 'input', 'opus')).not.toThrow();
    });

    it('accepts valid per-token cost (Opus output)', () => {
      expect(() => validateCostUnit(0.000025, 'output', 'opus')).not.toThrow();
    });

    it('accepts zero (free tier)', () => {
      expect(() => validateCostUnit(0, 'input', 'gemini-free')).not.toThrow();
    });

    it('rejects per-MTok value (1,000,000× unit error)', () => {
      expect(() => validateCostUnit(5, 'input', 'opus')).toThrow(/Unit error/);
    });

    it('rejects per-MTok value at threshold', () => {
      expect(() => validateCostUnit(0.011, 'input', 'opus')).toThrow(/Unit error/);
    });

    it('rejects negative cost', () => {
      expect(() => validateCostUnit(-0.000001, 'input', 'opus')).toThrow(/Negative cost/);
    });

    it('accepts cost at threshold (0.01)', () => {
      expect(() => validateCostUnit(0.01, 'input', 'opus')).not.toThrow();
    });
  });

  describe('validateCostConfig', () => {
    it('accepts valid config', () => {
      const config = validateCostConfig(VALID_CONFIG);
      expect(config._version).toBe('1.0');
      expect(config.providers.anthropic?.enabled).toBe(true);
    });

    it('rejects missing _version', () => {
      const bad = { ...VALID_CONFIG, _version: undefined };
      expect(() => validateCostConfig(bad)).toThrow(CostConfigError);
    });

    it('rejects missing providers', () => {
      const bad = { ...VALID_CONFIG, providers: undefined };
      expect(() => validateCostConfig(bad)).toThrow(/providers/);
    });

    it('rejects missing cost_limits', () => {
      const bad = { ...VALID_CONFIG, cost_limits: undefined };
      expect(() => validateCostConfig(bad)).toThrow(/cost_limits/);
    });

    it('rejects negative sprint_max_usd', () => {
      const bad = {
        ...VALID_CONFIG,
        cost_limits: { sprint_max_usd: -1, daily_max_usd: 50 },
      };
      expect(() => validateCostConfig(bad)).toThrow(/sprint_max_usd/);
    });

    it('rejects per-MTok pricing (unit safety)', () => {
      const bad = {
        ...VALID_CONFIG,
        providers: {
          anthropic: {
            enabled: true,
            billing_modes_supported: ['api'],
            models: {
              'fake-opus': {
                input_cost_per_token: 5, // WRONG — per-MTok
                output_cost_per_token: 25,
                max_input_tokens: 1000000,
              },
            },
          },
        },
      };
      expect(() => validateCostConfig(bad)).toThrow(/Unit error/);
    });

    it('rejects invalid billing_modes_supported', () => {
      const bad = {
        ...VALID_CONFIG,
        providers: {
          anthropic: {
            enabled: true,
            billing_modes_supported: [],
            models: VALID_CONFIG.providers.anthropic.models,
          },
        },
      };
      expect(() => validateCostConfig(bad)).toThrow(/billing_modes_supported/);
    });
  });

  describe('loadCostConfig', () => {
    it('loads from .deckent/cost-config.json when present', () => {
      const configDir = join(tmpDir, '.deckent');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'cost-config.json'), JSON.stringify(VALID_CONFIG));

      const config = loadCostConfig(tmpDir, { forceReload: true });
      expect(config._version).toBe('1.0');
      expect(config.providers.anthropic?.models['claude-opus-4-6']).toBeDefined();
    });

    it('falls back to bundled baseline when user config missing', () => {
      // tmpDir has no .deckent/cost-config.json — should use baseline
      const config = loadCostConfig(tmpDir, { forceReload: true });
      expect(config._version).toBe('1.0');
      expect(config.providers.anthropic).toBeDefined();
      expect(config.providers.openai).toBeDefined();
      expect(config.providers.google).toBeDefined();
    });

    it('bundled baseline ships ollama as a zero-cost local provider (fresh user sees "(local)") — İŞ4', () => {
      // A fresh `npx deckent` user with no cost-config.json must still get the
      // local-billing label for on-device ollama, not "(subscription)". The
      // baseline seeds it (provider=ollama → 0 fallback still applies for
      // dynamically-pulled tags not listed here).
      const config = loadCostConfig(tmpDir, { forceReload: true });
      const ollama = config.providers.ollama;
      expect(ollama).toBeDefined();
      expect(ollama!.billing_modes_supported).toContain('local');
      expect(ollama!.default_billing_mode).toBe('local');
      // Every seeded model is genuinely zero-cost (on-device, never calls home).
      for (const [id, model] of Object.entries(ollama!.models)) {
        expect(model.input_cost_per_token, `${id} input`).toBe(0);
        expect(model.output_cost_per_token, `${id} output`).toBe(0);
      }
    });

    it('throws CostConfigError on malformed JSON', () => {
      const configDir = join(tmpDir, '.deckent');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'cost-config.json'), '{ invalid json }');

      expect(() => loadCostConfig(tmpDir, { forceReload: true })).toThrow(CostConfigError);
    });
  });

  describe('findModel', () => {
    it('finds model by direct ID', () => {
      const config = validateCostConfig(VALID_CONFIG);
      const found = findModel(config, 'claude-opus-4-6');
      expect(found).toBeDefined();
      expect(found?.provider).toBe('anthropic');
      expect(found?.modelId).toBe('claude-opus-4-6');
    });

    it('finds model by alias', () => {
      const config = validateCostConfig(VALID_CONFIG);
      const found = findModel(config, 'opus');
      expect(found?.modelId).toBe('claude-opus-4-6');
    });

    it('returns null for unknown model', () => {
      const config = validateCostConfig(VALID_CONFIG);
      const found = findModel(config, 'nonexistent-model');
      expect(found).toBeNull();
    });

    it('skips disabled providers', () => {
      const cfg = JSON.parse(JSON.stringify(VALID_CONFIG));
      cfg.providers.anthropic.enabled = false;
      const config = validateCostConfig(cfg);
      const found = findModel(config, 'opus');
      expect(found).toBeNull();
    });
  });

  describe('listEnabledModels', () => {
    it('lists all enabled models', () => {
      const config = validateCostConfig(VALID_CONFIG);
      const list = listEnabledModels(config);
      expect(list).toHaveLength(1);
      expect(list[0]?.modelId).toBe('claude-opus-4-6');
    });

    it('excludes disabled models', () => {
      const cfg = JSON.parse(JSON.stringify(VALID_CONFIG));
      cfg.providers.anthropic.models['claude-opus-4-6'].enabled = false;
      const config = validateCostConfig(cfg);
      const list = listEnabledModels(config);
      expect(list).toHaveLength(0);
    });
  });

  describe('formatCostPerMTok', () => {
    it('formats Opus input cost', () => {
      expect(formatCostPerMTok(0.000005)).toBe('$5.00/MTok');
    });

    it('formats Sonnet output cost', () => {
      expect(formatCostPerMTok(0.000015)).toBe('$15.00/MTok');
    });

    it('formats Haiku cache read cost', () => {
      expect(formatCostPerMTok(0.0000001)).toBe('$0.10/MTok');
    });
  });

  describe('initCostConfig', () => {
    it('creates .deckent/cost-config.json from baseline', () => {
      const result = initCostConfig(tmpDir);
      expect(result.created).toBe(true);
      expect(result.path).toContain('cost-config.json');

      // Re-load and verify
      const config = loadCostConfig(tmpDir, { forceReload: true });
      expect(config.providers.anthropic).toBeDefined();
    });

    it('does not overwrite existing file without force', () => {
      const configDir = join(tmpDir, '.deckent');
      mkdirSync(configDir, { recursive: true });
      const customConfig = { ...VALID_CONFIG, _user_notes: 'my custom notes' };
      writeFileSync(join(configDir, 'cost-config.json'), JSON.stringify(customConfig));

      const result = initCostConfig(tmpDir);
      expect(result.created).toBe(false);
    });

    it('overwrites with force', () => {
      const configDir = join(tmpDir, '.deckent');
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'cost-config.json'), JSON.stringify({ bad: 'data' }));

      const result = initCostConfig(tmpDir, { force: true });
      expect(result.created).toBe(true);

      const config = loadCostConfig(tmpDir, { forceReload: true });
      expect(config.providers.anthropic).toBeDefined();
    });
  });

  describe('Baseline validation (bundled pricing data)', () => {
    it('baseline config passes unit safety for all models', () => {
      const config = loadCostConfig(tmpDir, { forceReload: true });
      expect(config.providers.anthropic?.models['claude-opus-4-8']?.input_cost_per_token).toBe(0.000005);
      expect(config.providers.anthropic?.models['claude-opus-4-8']?.output_cost_per_token).toBe(0.000025);
      // Sonnet 4.6 should be 1M context
      expect(config.providers.anthropic?.models['claude-sonnet-4-6']?.max_input_tokens).toBe(1000000);
      // Haiku 4.5
      expect(config.providers.anthropic?.models['claude-haiku-4-5']?.input_cost_per_token).toBe(0.000001);
    });

    it('baseline has all 3 providers enabled', () => {
      const config = loadCostConfig(tmpDir, { forceReload: true });
      expect(config.providers.anthropic?.enabled).toBe(true);
      expect(config.providers.openai?.enabled).toBe(true);
      expect(config.providers.google?.enabled).toBe(true);
    });

    it('baseline has subscription tracking documented for all providers', () => {
      const config = loadCostConfig(tmpDir, { forceReload: true });
      expect(config.providers.anthropic?.subscription_tracking?.supported).toBe(true);
      expect(config.providers.openai?.subscription_tracking?.supported).toBe(false);
      expect(config.providers.google?.subscription_tracking?.supported).toBe(false);
    });
  });
});
