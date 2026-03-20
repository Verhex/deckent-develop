import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';

import {
  deepMerge,
  validateConfig,
  resolveEffectiveWorkers,
  validatePartialConfig,
  ConfigValidationError,
  DEFAULT_MODES,
  createDefaultConfig,
  loadConfig,
  getDefaultConfig,
  getDefaultModes,
} from '../../src/core/config.js';
import type { DeckentConfig, ResolvedConfig, SystemProfile } from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeValidConfig(): DeckentConfig {
  return {
    mode: 'max_plan',
    modes: {
      max_plan: {
        max_workers: 4,
        brain_model: 'opus',
        default_model: 'opus',
        haiku_allowed: true,
        usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
        brain_planning: 'auto',
      },
      max5x_plan: {
        max_workers: 5,
        brain_model: 'sonnet',
        default_model: 'opus',
        haiku_allowed: true,
        usage_thresholds: { '5hr': 0.7, weekly: 0.5 },
        brain_planning: 'auto',
      },
      pro_plan: {
        max_workers: 3,
        brain_model: 'sonnet',
        default_model: 'sonnet',
        haiku_allowed: false,
        usage_thresholds: { '5hr': 0.6, weekly: 0.4 },
        brain_planning: 'auto',
      },
      api: {
        max_workers: 10,
        brain_model: 'opus',
        default_model: 'sonnet',
        haiku_allowed: true,
        usage_thresholds: { '5hr': 1.0, weekly: 1.0 },
        budget_per_sprint: 5.0,
        requires: 'ANTHROPIC_API_KEY',
        brain_planning: 'auto',
      },
    },
  };
}

function makeResolvedConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  const base = makeValidConfig();
  return {
    mode: 'max_plan',
    activeModeConfig: base.modes.max_plan,
    modes: base.modes,
    language: 'en',
    projectName: 'test-project',
    projectRoot: '/tmp',
    version: '1.0.0',
    ...overrides,
  };
}

function makeSystemProfile(overrides: Partial<SystemProfile> = {}): SystemProfile {
  return {
    cpuCores: 4,
    totalMemMB: 8192,
    freeMemMB: 4096,
    recommendedMaxWorkers: 3,
    ...overrides,
  };
}

// ─── deepMerge ────────────────────────────────────────────────────────────────

describe('deepMerge', () => {
  it('merges flat objects — override wins', () => {
    const base = { a: 1, b: 2 };
    const override = { b: 99, c: 3 };
    const result = deepMerge(base, override);
    expect(result).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('deeply merges nested objects', () => {
    const base = { outer: { x: 1, y: 2 }, z: 'keep' };
    const override = { outer: { y: 99 } };
    const result = deepMerge(base, override);
    expect(result).toEqual({ outer: { x: 1, y: 99 }, z: 'keep' });
  });

  it('replaces arrays — does NOT deep-merge them', () => {
    const base = { arr: [1, 2, 3] };
    const override = { arr: [4, 5] };
    const result = deepMerge(base, override);
    expect(result.arr).toEqual([4, 5]);
  });

  it('ignores undefined override values', () => {
    const base = { a: 'original', b: 'keep' };
    const override: Partial<typeof base> = { a: undefined };
    const result = deepMerge(base, override);
    expect(result.a).toBe('original');
    expect(result.b).toBe('keep');
  });

  it('handles null values in override', () => {
    // null is not a plain object, so it replaces
    const base = { nested: { x: 1 } };
    const override = { nested: null as unknown as { x: number } };
    const result = deepMerge(base, override);
    expect(result.nested).toBeNull();
  });

  it('does not mutate the base object', () => {
    const base = { count: 1 };
    const override = { count: 2 };
    deepMerge(base, override);
    expect(base.count).toBe(1);
  });

  it('handles empty override', () => {
    const base = { a: 1 };
    const result = deepMerge(base, {});
    expect(result).toEqual({ a: 1 });
  });

  it('handles deeply nested three-level merge', () => {
    const base = { l1: { l2: { l3: 'base', keep: true } } };
    const override = { l1: { l2: { l3: 'override' } } };
    const result = deepMerge(base, override);
    expect(result.l1.l2.l3).toBe('override');
    expect(result.l1.l2.keep).toBe(true);
  });
});

// ─── validateConfig ───────────────────────────────────────────────────────────

describe('validateConfig', () => {
  it('returns empty warnings array for a valid config', () => {
    const config = makeValidConfig();
    const warnings = validateConfig(config);
    expect(warnings).toEqual([]);
  });

  it('throws ConfigValidationError for invalid mode', () => {
    const config = makeValidConfig();
    (config as unknown as Record<string, unknown>).mode = 'super_plan';
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow(/Invalid mode/);
  });

  it('throws for invalid language', () => {
    const config = makeValidConfig();
    config.language = 'de';
    expect(() => validateConfig(config)).toThrow(/Invalid language/);
  });

  it('throws when a mode config is missing', () => {
    const config = makeValidConfig();
    delete (config.modes as Record<string, unknown>)['pro_plan'];
    expect(() => validateConfig(config)).toThrow(/Missing mode config/);
  });

  it('throws for invalid brain_model', () => {
    const config = makeValidConfig();
    (config.modes.max_plan as unknown as Record<string, unknown>).brain_model = 'gpt4';
    expect(() => validateConfig(config)).toThrow(/brain_model must be one of/);
  });

  it('throws for invalid default_model', () => {
    const config = makeValidConfig();
    (config.modes.max_plan as unknown as Record<string, unknown>).default_model = 'turbo';
    expect(() => validateConfig(config)).toThrow(/default_model must be one of/);
  });

  it('throws for max_workers out of range', () => {
    const config = makeValidConfig();
    config.modes.max_plan.max_workers = 0;
    expect(() => validateConfig(config)).toThrow(/max_workers must be a number between 1 and 100/);
  });

  it('throws for max_workers > 100', () => {
    const config = makeValidConfig();
    config.modes.max_plan.max_workers = 101;
    expect(() => validateConfig(config)).toThrow(/max_workers must be a number between 1 and 100/);
  });

  it('accepts max_workers = "auto"', () => {
    const config = makeValidConfig();
    config.modes.max_plan.max_workers = 'auto';
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('returns warning (not error) when max_workers >= 20', () => {
    const config = makeValidConfig();
    config.modes.max_plan.max_workers = 25;
    const warnings = validateConfig(config);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/high worker count/);
  });

  it('throws for invalid usage_thresholds.5hr value', () => {
    const config = makeValidConfig();
    config.modes.max_plan.usage_thresholds['5hr'] = 1.5;
    expect(() => validateConfig(config)).toThrow(/usage_thresholds.5hr/);
  });

  it('throws for invalid usage_thresholds.weekly value', () => {
    const config = makeValidConfig();
    config.modes.max_plan.usage_thresholds.weekly = -0.1;
    expect(() => validateConfig(config)).toThrow(/usage_thresholds.weekly/);
  });

  it('throws for invalid brain_planning value', () => {
    const config = makeValidConfig();
    (config.modes.max_plan as unknown as Record<string, unknown>).brain_planning = 'magic';
    expect(() => validateConfig(config)).toThrow(/brain_planning must be one of/);
  });

  it('throws for non-boolean haiku_allowed', () => {
    const config = makeValidConfig();
    (config.modes.max_plan as unknown as Record<string, unknown>).haiku_allowed = 'yes';
    expect(() => validateConfig(config)).toThrow(/haiku_allowed must be a boolean/);
  });

  it('throws for api mode budget_per_sprint <= 0', () => {
    const config = makeValidConfig();
    config.modes.api.budget_per_sprint = -1;
    expect(() => validateConfig(config)).toThrow(/budget_per_sprint must be a positive number/);
  });

  it('collects multiple errors and throws once', () => {
    const config = makeValidConfig();
    (config as unknown as Record<string, unknown>).mode = 'bad_mode';
    config.modes.max_plan.max_workers = 0;
    try {
      validateConfig(config);
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigValidationError);
      expect((e as ConfigValidationError).errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ─── resolveEffectiveWorkers ──────────────────────────────────────────────────

describe('resolveEffectiveWorkers', () => {
  it('returns configured number when max_workers is a number', () => {
    const resolved = makeResolvedConfig();
    resolved.activeModeConfig.max_workers = 5;
    const profile = makeSystemProfile({ recommendedMaxWorkers: 8 });
    expect(resolveEffectiveWorkers(resolved, profile)).toBe(5);
  });

  it('uses systemProfile.recommendedMaxWorkers when max_workers = "auto"', () => {
    const resolved = makeResolvedConfig();
    resolved.activeModeConfig.max_workers = 'auto';
    const profile = makeSystemProfile({ recommendedMaxWorkers: 4 });
    expect(resolveEffectiveWorkers(resolved, profile)).toBe(4);
  });

  it('caps auto workers by planLimit when provided', () => {
    const resolved = makeResolvedConfig();
    resolved.activeModeConfig.max_workers = 'auto';
    const profile = makeSystemProfile({ recommendedMaxWorkers: 10 });
    expect(resolveEffectiveWorkers(resolved, profile, 3)).toBe(3);
  });

  it('does not cap when recommendedMaxWorkers is less than planLimit', () => {
    const resolved = makeResolvedConfig();
    resolved.activeModeConfig.max_workers = 'auto';
    const profile = makeSystemProfile({ recommendedMaxWorkers: 2 });
    expect(resolveEffectiveWorkers(resolved, profile, 10)).toBe(2);
  });

  it('ignores planLimit when max_workers is a numeric value', () => {
    const resolved = makeResolvedConfig();
    resolved.activeModeConfig.max_workers = 7;
    const profile = makeSystemProfile({ recommendedMaxWorkers: 10 });
    // planLimit is ignored for numeric values
    expect(resolveEffectiveWorkers(resolved, profile, 2)).toBe(7);
  });
});

// ─── loadConfig ───────────────────────────────────────────────────────────────

describe('loadConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'deckent-config-test-'));
    // Create .deckent/ directory inside tmp
    mkdirSync(join(tmpDir, '.deckent'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.mode).toBe('max_plan');
    expect(config.language).toBe('en');
    expect(config.projectName).toBe('deckent-project');
  });

  it('merges a partial project config over defaults', async () => {
    const projectConfigPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(projectConfigPath, JSON.stringify({ mode: 'pro_plan' }));
    const config = await loadConfig(tmpDir);
    expect(config.mode).toBe('pro_plan');
  });

  it('throws when the config file contains malformed JSON', async () => {
    const projectConfigPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(projectConfigPath, '{ invalid json ===');
    await expect(loadConfig(tmpDir)).rejects.toThrow(/Failed to read config file/);
  });

  it('includes projectRoot in the resolved config', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.projectRoot).toBe(tmpDir);
  });

  it('throws ConfigValidationError when api mode lacks ANTHROPIC_API_KEY', async () => {
    const projectConfigPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(projectConfigPath, JSON.stringify({ mode: 'api' }));
    const oldEnv = process.env['ANTHROPIC_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
    try {
      await expect(loadConfig(tmpDir)).rejects.toThrow(ConfigValidationError);
    } finally {
      if (oldEnv !== undefined) process.env['ANTHROPIC_API_KEY'] = oldEnv;
    }
  });

  it('accepts api mode when ANTHROPIC_API_KEY is set', async () => {
    const projectConfigPath = join(tmpDir, '.deckent', 'config.json');
    writeFileSync(projectConfigPath, JSON.stringify({ mode: 'api' }));
    process.env['ANTHROPIC_API_KEY'] = 'test-key';
    try {
      const config = await loadConfig(tmpDir);
      expect(config.mode).toBe('api');
    } finally {
      delete process.env['ANTHROPIC_API_KEY'];
    }
  });

  it('sets auto_docs defaults when not provided', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.auto_docs).toBeDefined();
    expect(config.auto_docs?.tier1).toBe(true);
  });
});

// ─── validatePartialConfig ────────────────────────────────────────────────────

describe('validatePartialConfig', () => {
  it('does not throw for an empty partial config', () => {
    expect(() => validatePartialConfig({})).not.toThrow();
  });

  it('does not throw for a valid partial mode override', () => {
    expect(() => validatePartialConfig({ mode: 'pro_plan' })).not.toThrow();
  });

  it('throws for an invalid mode in partial config', () => {
    expect(() =>
      validatePartialConfig({ mode: 'not_a_mode' as unknown as 'max_plan' }),
    ).toThrow(ConfigValidationError);
  });

  it('throws for invalid language in partial config', () => {
    expect(() => validatePartialConfig({ language: 'zz' })).toThrow(ConfigValidationError);
  });

  it('accepts valid language codes', () => {
    expect(() => validatePartialConfig({ language: 'tr' })).not.toThrow();
    expect(() => validatePartialConfig({ language: 'en' })).not.toThrow();
  });
});

// ─── ConfigValidationError ────────────────────────────────────────────────────

describe('ConfigValidationError', () => {
  it('has the correct name property', () => {
    const err = new ConfigValidationError(['some error']);
    expect(err.name).toBe('ConfigValidationError');
  });

  it('includes all errors in the message', () => {
    const errors = ['error one', 'error two', 'error three'];
    const err = new ConfigValidationError(errors);
    expect(err.message).toContain('error one');
    expect(err.message).toContain('error two');
    expect(err.message).toContain('error three');
  });

  it('exposes errors array on the instance', () => {
    const errors = ['field missing', 'bad value'];
    const err = new ConfigValidationError(errors);
    expect(err.errors).toEqual(errors);
  });

  it('is instanceof Error', () => {
    const err = new ConfigValidationError(['x']);
    expect(err).toBeInstanceOf(Error);
  });

  it('message starts with descriptive prefix', () => {
    const err = new ConfigValidationError(['x']);
    expect(err.message).toMatch(/Config validation failed/);
  });
});

// ─── createDefaultConfig / getDefaultConfig / getDefaultModes ─────────────────

describe('createDefaultConfig', () => {
  it('returns a config with default mode', () => {
    const config = createDefaultConfig();
    expect(config.mode).toBe('max_plan');
  });

  it('returns a config with all four modes defined', () => {
    const config = createDefaultConfig();
    expect(Object.keys(config.modes)).toEqual(
      expect.arrayContaining(['max_plan', 'max5x_plan', 'pro_plan', 'api']),
    );
  });

  it('returns a deep clone — mutating result does not affect DEFAULT_MODES', () => {
    const config = createDefaultConfig();
    config.modes.max_plan.max_workers = 999;
    expect(DEFAULT_MODES.max_plan.max_workers).not.toBe(999);
  });

  it('getDefaultConfig returns same shape as createDefaultConfig', () => {
    expect(getDefaultConfig()).toEqual(createDefaultConfig());
  });

  it('getDefaultModes returns all four plan modes', () => {
    const modes = getDefaultModes();
    expect(modes).toHaveProperty('max_plan');
    expect(modes).toHaveProperty('api');
  });
});
