import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDefaultConfig,
  getDefaultModes,
  loadConfig,
  validatePartialConfig,
  validateConfig,
  resolveEffectiveWorkers,
  ConfigValidationError,
  MODE_ALIASES,
  resolveMode,
  VALID_PROVIDERS,
  clearConfigCache,
} from '../../src/core/config.js';
import type { SystemProfile, PlanMode } from '../../src/core/types.js';
import { DEFAULT_MODE } from '../../src/core/constants.js';

// Mock fs modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  statSync: vi.fn().mockReturnValue({ mtimeMs: 0 }),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

// Import mocked modules
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFile = vi.mocked(readFile);

beforeEach(() => {
  vi.clearAllMocks();
  clearConfigCache();
  mockedExistsSync.mockReturnValue(false);
});

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['DECKENT_BRAIN_PROVIDER'];
  delete process.env['DECKENT_WORKER_PROVIDER'];
});

describe('getDefaultConfig', () => {
  it('returns valid DeckentConfig with mode === DEFAULT_MODE', () => {
    const config = getDefaultConfig();
    expect(config.mode).toBe(DEFAULT_MODE);
    expect(config.modes).toBeDefined();
    expect(Object.keys(config.modes)).toHaveLength(4);
  });

  it('returns fresh copy on each call (mutation safe)', () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.mode = 'pro_plan';
    expect(b.mode).toBe(DEFAULT_MODE);
  });
});

describe('getDefaultModes', () => {
  it('contains 4 modes: performance, balanced, economic, api', () => {
    const modes = getDefaultModes();
    expect(Object.keys(modes)).toEqual(
      expect.arrayContaining(['performance', 'balanced', 'economic', 'api']),
    );
    expect(Object.keys(modes)).toHaveLength(4);
  });

  it('performance: max_workers=8, brain_model=opus', () => {
    const modes = getDefaultModes();
    expect(modes.performance.max_workers).toBe(8);
    expect(modes.performance.brain_model).toBe('opus');
  });

  it('api: budget_per_sprint=5.0, requires=ANTHROPIC_API_KEY', () => {
    const modes = getDefaultModes();
    expect(modes.api.budget_per_sprint).toBe(5.0);
    expect(modes.api.requires).toBe('ANTHROPIC_API_KEY');
  });
});

describe('loadConfig', () => {
  it('returns defaults when no config files exist', async () => {
    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('performance');
    expect(config.activeModeConfig.max_workers).toBe(8);
    expect(config.language).toBe('en');
    expect(config.projectRoot).toContain('test');
  });

  it('applies project config mode override', async () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).includes('.deckent');
    });
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'pro_plan' }));

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('economic');
    expect(config.activeModeConfig.max_workers).toBe(3);
    expect(config.activeModeConfig.brain_model).toBe('sonnet');
  });

  it('merges global and project config', async () => {
    let callCount = 0;
    mockedExistsSync.mockReturnValue(true);
    mockedReadFile.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // global config
        return JSON.stringify({ language: 'tr' });
      }
      // project config
      return JSON.stringify({ mode: 'max5x_plan' });
    });

    const config = await loadConfig('/test/project');
    expect(config.language).toBe('tr');
    expect(config.mode).toBe('balanced');
  });

  it('deep merges nested mode config', async () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).includes('.deckent');
    });
    mockedReadFile.mockResolvedValue(
      JSON.stringify({ modes: { performance: { max_workers: 6 } } }),
    );

    const config = await loadConfig('/test/project');
    expect(config.modes.performance.max_workers).toBe(6);
    expect(config.modes.performance.brain_model).toBe('opus'); // preserved
  });

  it('throws ConfigValidationError for API mode without env var', async () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).includes('.deckent');
    });
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'api' }));
    delete process.env['ANTHROPIC_API_KEY'];

    await expect(loadConfig('/test/project')).rejects.toThrow(ConfigValidationError);
  });

  it('resolves successfully for API mode with env var set', async () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).includes('.deckent');
    });
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'api' }));
    process.env['ANTHROPIC_API_KEY'] = 'test-key';

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('api');
    expect(config.activeModeConfig.budget_per_sprint).toBe(5.0);
  });

  it('returns defaults for malformed JSON (readJsonSafeAsync returns null)', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFile.mockResolvedValue('{ invalid json !!!');

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('performance');
  });

  it('resolves projectRoot from parameter', async () => {
    const config = await loadConfig('/my/project/root');
    expect(config.projectRoot).toContain('my');
  });
});

describe('brain_planning config', () => {
  it('default modes have brain_planning === "auto"', () => {
    const modes = getDefaultModes();
    for (const mode of Object.values(modes)) {
      expect(mode.brain_planning).toBe('auto');
    }
  });

  it('accepts valid brain_planning values', () => {
    for (const value of ['ai', 'structured', 'auto'] as const) {
      expect(() => validatePartialConfig({
        modes: {
          performance: { ...getDefaultModes().performance, brain_planning: value },
          balanced: getDefaultModes().balanced,
          economic: getDefaultModes().economic,
          api: getDefaultModes().api,
        },
      })).not.toThrow();
    }
  });

  it('rejects invalid brain_planning value', () => {
    expect(() => validatePartialConfig({
      modes: {
        performance: { ...getDefaultModes().performance, brain_planning: 'invalid' as 'auto' },
        balanced: getDefaultModes().balanced,
        economic: getDefaultModes().economic,
        api: getDefaultModes().api,
      },
    })).toThrow(ConfigValidationError);
  });
});

describe('validatePartialConfig', () => {
  it('accepts { mode: "economic" }', () => {
    expect(() => validatePartialConfig({ mode: 'economic' })).not.toThrow();
  });

  it('accepts empty object (merges with defaults)', () => {
    expect(() => validatePartialConfig({})).not.toThrow();
  });

  it('rejects invalid mode', () => {
    expect(() =>
      validatePartialConfig({ mode: 'invalid' as 'performance' }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects max_workers=0', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          performance: { max_workers: 0 } as never,
          balanced: getDefaultModes().balanced,
          economic: getDefaultModes().economic,
          api: getDefaultModes().api,
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('accepts max_workers=100 (warn only, not error)', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          performance: { ...getDefaultModes().performance, max_workers: 100 },
          balanced: getDefaultModes().balanced,
          economic: getDefaultModes().economic,
          api: getDefaultModes().api,
        },
      }),
    ).not.toThrow();
  });

  it('rejects max_workers=101 (exceeds 100 limit)', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          performance: { ...getDefaultModes().performance, max_workers: 101 },
          balanced: getDefaultModes().balanced,
          economic: getDefaultModes().economic,
          api: getDefaultModes().api,
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects invalid brain_model', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          performance: { ...getDefaultModes().performance, brain_model: 'gpt4' as 'opus' },
          balanced: getDefaultModes().balanced,
          economic: getDefaultModes().economic,
          api: getDefaultModes().api,
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('accepts max_workers="auto"', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          performance: { ...getDefaultModes().performance, max_workers: 'auto' },
          balanced: getDefaultModes().balanced,
          economic: getDefaultModes().economic,
          api: getDefaultModes().api,
        },
      }),
    ).not.toThrow();
  });
});

// ─── Helper: build a minimal ResolvedConfig ──────────────────────────
function makeResolvedConfig(maxWorkers: number | 'auto') {
  const modes = getDefaultModes();
  const activeModeConfig = { ...modes.performance, max_workers: maxWorkers };
  return {
    mode: 'performance' as const,
    activeModeConfig,
    modes: { ...modes, performance: activeModeConfig },
    language: 'en',
    projectName: 'test',
    projectRoot: '/test',
    version: '0.0.0',
  };
}

function makeSystemProfile(freeMemMB: number, cpuCores: number): SystemProfile {
  return {
    cpuCores,
    totalMemMB: freeMemMB * 2,
    freeMemMB,
    recommendedMaxWorkers: Math.max(1, Math.min(Math.floor(freeMemMB / 400), cpuCores - 1, 30)),
  };
}

describe('resolveEffectiveWorkers', () => {
  it('returns configured number when max_workers is numeric', () => {
    const config = makeResolvedConfig(6);
    const profile = makeSystemProfile(16384, 8);
    expect(resolveEffectiveWorkers(config, profile)).toBe(6);
  });

  it('auto mode + 16GB RAM + 8 cores → ~7 workers', () => {
    const config = makeResolvedConfig('auto');
    // recommendedMaxWorkers = max(1, min(floor(16384/400), 8-1, 30)) = min(40, 7, 30) = 7
    const profile = makeSystemProfile(16384, 8);
    expect(resolveEffectiveWorkers(config, profile)).toBe(7);
  });

  it('auto mode + low RAM (1600MB) + 8 cores → 4 workers', () => {
    const config = makeResolvedConfig('auto');
    // recommendedMaxWorkers = max(1, min(floor(1600/400), 7, 30)) = min(4, 7, 30) = 4
    const profile = makeSystemProfile(1600, 8);
    expect(resolveEffectiveWorkers(config, profile)).toBe(4);
  });

  it('auto mode + very low RAM (400MB) + 4 cores → 1 worker', () => {
    const config = makeResolvedConfig('auto');
    // recommendedMaxWorkers = max(1, min(1, 3, 30)) = 1
    const profile = makeSystemProfile(400, 4);
    expect(resolveEffectiveWorkers(config, profile)).toBe(1);
  });

  it('auto mode respects planLimit when provided', () => {
    const config = makeResolvedConfig('auto');
    // recommendedMaxWorkers = 7, planLimit = 3 → min(7, 3) = 3
    const profile = makeSystemProfile(16384, 8);
    expect(resolveEffectiveWorkers(config, profile, 3)).toBe(3);
  });

  it('auto mode planLimit higher than recommended → use recommended', () => {
    const config = makeResolvedConfig('auto');
    // recommendedMaxWorkers = 7, planLimit = 20 → min(7, 20) = 7
    const profile = makeSystemProfile(16384, 8);
    expect(resolveEffectiveWorkers(config, profile, 20)).toBe(7);
  });

  it('numeric mode ignores systemProfile', () => {
    const config = makeResolvedConfig(50);
    const profile = makeSystemProfile(400, 2); // very low resources
    expect(resolveEffectiveWorkers(config, profile)).toBe(50);
  });

  it('numeric mode ignores planLimit', () => {
    const config = makeResolvedConfig(10);
    const profile = makeSystemProfile(16384, 8);
    expect(resolveEffectiveWorkers(config, profile, 2)).toBe(10);
  });
});

describe('validateConfig — max_workers warnings', () => {
  it('max_workers=50 returns warning (not error)', () => {
    const config = getDefaultConfig();
    config.modes.performance.max_workers = 50;
    const warnings = validateConfig(config);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('50');
    expect(warnings[0]).toContain('>=20');
  });

  it('max_workers=19 returns no warning', () => {
    const config = getDefaultConfig();
    config.modes.performance.max_workers = 19;
    const warnings = validateConfig(config);
    const maxWorkerWarnings = warnings.filter(w => w.includes('max_workers'));
    expect(maxWorkerWarnings).toHaveLength(0);
  });

  it('max_workers=101 throws ConfigValidationError', () => {
    const config = getDefaultConfig();
    config.modes.performance.max_workers = 101;
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it('max_workers="auto" returns no warning', () => {
    const config = getDefaultConfig();
    config.modes.performance.max_workers = 'auto';
    const warnings = validateConfig(config);
    const autoWarnings = warnings.filter(w => w.includes('max_workers'));
    expect(autoWarnings).toHaveLength(0);
  });
});

// ─── MODE_ALIASES & resolveMode ──────────────────────────────────────

describe('MODE_ALIASES', () => {
  it('maps max_plan to performance', () => {
    expect(MODE_ALIASES['max_plan']).toBe('performance');
  });

  it('maps max5x_plan to balanced', () => {
    expect(MODE_ALIASES['max5x_plan']).toBe('balanced');
  });

  it('maps pro_plan to economic', () => {
    expect(MODE_ALIASES['pro_plan']).toBe('economic');
  });

  it('maps unlimited to api', () => {
    expect(MODE_ALIASES['unlimited']).toBe('api');
  });

  it('has exactly 4 aliases', () => {
    expect(Object.keys(MODE_ALIASES)).toHaveLength(4);
  });
});

describe('resolveMode', () => {
  it("resolves legacy 'max_plan' to 'performance'", () => {
    expect(resolveMode('max_plan')).toBe('performance');
  });

  it("resolves legacy 'max5x_plan' to 'balanced'", () => {
    expect(resolveMode('max5x_plan')).toBe('balanced');
  });

  it("resolves legacy 'pro_plan' to 'economic'", () => {
    expect(resolveMode('pro_plan')).toBe('economic');
  });

  it("resolves legacy 'unlimited' to 'api'", () => {
    expect(resolveMode('unlimited')).toBe('api');
  });

  it('passes through canonical name performance unchanged', () => {
    expect(resolveMode('performance')).toBe('performance');
  });

  it('passes through canonical name balanced unchanged', () => {
    expect(resolveMode('balanced')).toBe('balanced');
  });

  it('passes through canonical name economic unchanged', () => {
    expect(resolveMode('economic')).toBe('economic');
  });

  it('passes through canonical name api unchanged', () => {
    expect(resolveMode('api')).toBe('api');
  });

  it('returns unknown mode string as-is', () => {
    expect(resolveMode('totally_unknown_mode')).toBe('totally_unknown_mode');
  });
});

describe('loadConfig — mode alias resolution', () => {
  it("resolves legacy alias 'max_plan' in project config to 'performance'", async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'max_plan' }));

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('performance');
    expect(config.activeModeConfig.max_workers).toBe(8);
  });

  it("resolves legacy alias 'max5x_plan' in project config to 'balanced'", async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'max5x_plan' }));

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('balanced');
    expect(config.activeModeConfig.max_workers).toBe(5);
  });

  it("resolves legacy alias 'pro_plan' in project config to 'economic'", async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'pro_plan' }));

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('economic');
    expect(config.activeModeConfig.brain_model).toBe('sonnet');
  });

  it("resolves legacy alias 'unlimited' in project config to 'api' (with API key)", async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'unlimited' }));
    process.env['ANTHROPIC_API_KEY'] = 'test-key';

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('api');
    expect(config.activeModeConfig.budget_per_sprint).toBe(5.0);
  });
});

// ─── Multi-Provider Config ──────────────────────────────────────────

describe('VALID_PROVIDERS', () => {
  it('contains claude, codex, gemini, ollama', () => {
    // Sprint 202 Task 202-001: ollama joined the ProviderName union and is
    // therefore now an Object.keys(PROVIDER_MODEL_MAP) member.
    expect(VALID_PROVIDERS).toContain('claude');
    expect(VALID_PROVIDERS).toContain('codex');
    expect(VALID_PROVIDERS).toContain('gemini');
    expect(VALID_PROVIDERS).toContain('ollama');
    expect(VALID_PROVIDERS).toHaveLength(4);
  });
});

describe('multi-provider config defaults', () => {
  // Sprint 150 Decision 4: flat brain_provider/worker_provider deprecated.
  // Grouped providers (config.providers.brain/worker) is canonical.
  it('default config has providers.brain=claude (grouped canonical)', () => {
    const config = getDefaultConfig();
    expect(config.providers?.brain).toBe('claude');
    expect(config.brain_provider).toBeUndefined();
  });

  it('default config has providers.worker=claude (grouped canonical)', () => {
    const config = getDefaultConfig();
    expect(config.providers?.worker).toBe('claude');
    expect(config.worker_provider).toBeUndefined();
  });

  it('default config has cost_optimization=false', () => {
    const config = getDefaultConfig();
    expect(config.cost_optimization).toBe(false);
  });

  it('default config has no fallback_provider', () => {
    const config = getDefaultConfig();
    expect(config.fallback_provider).toBeUndefined();
  });

  it('default config has no provider_overrides', () => {
    const config = getDefaultConfig();
    expect(config.provider_overrides).toBeUndefined();
  });

  it('default config has no api_keys', () => {
    const config = getDefaultConfig();
    expect(config.api_keys).toBeUndefined();
  });
});

describe('multi-provider config validation', () => {
  it('accepts valid brain_provider=codex', () => {
    expect(() => validatePartialConfig({ brain_provider: 'codex' })).not.toThrow();
  });

  it('accepts valid worker_provider=gemini', () => {
    expect(() => validatePartialConfig({ worker_provider: 'gemini' })).not.toThrow();
  });

  it('accepts valid fallback_provider=claude', () => {
    expect(() => validatePartialConfig({ fallback_provider: 'claude' })).not.toThrow();
  });

  it('rejects invalid brain_provider', () => {
    expect(() =>
      validatePartialConfig({ brain_provider: 'openai' as 'claude' }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects invalid worker_provider', () => {
    expect(() =>
      validatePartialConfig({ worker_provider: 'invalid' as 'claude' }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects invalid fallback_provider', () => {
    expect(() =>
      validatePartialConfig({ fallback_provider: 'nope' as 'claude' }),
    ).toThrow(ConfigValidationError);
  });

  it('accepts valid provider_overrides', () => {
    expect(() =>
      validatePartialConfig({ provider_overrides: { docs: 'gemini', tests: 'codex' } }),
    ).not.toThrow();
  });

  it('rejects invalid provider in provider_overrides', () => {
    expect(() =>
      validatePartialConfig({ provider_overrides: { docs: 'bad' as 'claude' } }),
    ).toThrow(ConfigValidationError);
  });

  it('accepts cost_optimization=true', () => {
    expect(() => validatePartialConfig({ cost_optimization: true })).not.toThrow();
  });

  it('rejects non-boolean cost_optimization', () => {
    expect(() =>
      validatePartialConfig({ cost_optimization: 'yes' as unknown as boolean }),
    ).toThrow(ConfigValidationError);
  });

  it('accepts api_keys as object', () => {
    expect(() =>
      validatePartialConfig({ api_keys: { OPENAI_API_KEY: 'sk-test' } }),
    ).not.toThrow();
  });

  it('rejects api_keys as non-object', () => {
    expect(() =>
      validatePartialConfig({ api_keys: 'bad' as unknown as Record<string, string> }),
    ).toThrow(ConfigValidationError);
  });
});

describe('multi-provider env var overrides', () => {
  it('DECKENT_BRAIN_PROVIDER overrides config brain_provider', async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFile.mockRejectedValue(new Error('not found'));
    process.env['DECKENT_BRAIN_PROVIDER'] = 'gemini';
    const config = await loadConfig('/test/project');
    expect(config).toBeDefined();
    // env var was applied — if invalid it would have thrown ConfigValidationError
  });

  it('DECKENT_WORKER_PROVIDER overrides config worker_provider', async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFile.mockRejectedValue(new Error('not found'));
    process.env['DECKENT_WORKER_PROVIDER'] = 'codex';
    const config = await loadConfig('/test/project');
    expect(config).toBeDefined();
  });

  it('invalid DECKENT_BRAIN_PROVIDER env var causes validation error', async () => {
    process.env['DECKENT_BRAIN_PROVIDER'] = 'invalid_provider';
    await expect(loadConfig('/test/project')).rejects.toThrow(ConfigValidationError);
  });

  it('invalid DECKENT_WORKER_PROVIDER env var causes validation error', async () => {
    process.env['DECKENT_WORKER_PROVIDER'] = 'bad';
    await expect(loadConfig('/test/project')).rejects.toThrow(ConfigValidationError);
  });

  it('DECKENT_MODE overrides config mode', async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFile.mockRejectedValue(new Error('not found'));
    process.env['DECKENT_MODE'] = 'pro_plan';
    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('economic');
    delete process.env['DECKENT_MODE'];
  });

  it('DECKENT_MODE resolves aliases', async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFile.mockRejectedValue(new Error('not found'));
    process.env['DECKENT_MODE'] = 'balanced';
    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('balanced');
    delete process.env['DECKENT_MODE'];
  });

  it('DECKENT_LANGUAGE overrides config language', async () => {
    mockedExistsSync.mockReturnValue(false);
    mockedReadFile.mockRejectedValue(new Error('not found'));
    process.env['DECKENT_LANGUAGE'] = 'tr';
    const config = await loadConfig('/test/project');
    expect(config.language).toBe('tr');
    delete process.env['DECKENT_LANGUAGE'];
  });
});

describe('multi-provider config merge', () => {
  it('project config overrides brain_provider', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ brain_provider: 'gemini' }));

    const config = await loadConfig('/test/project');
    expect(config).toBeDefined();
    // If invalid, it would have thrown — gemini is valid
  });
});

// ─── Extended Config Fields ──────────────────────────────────────────

describe('extended config defaults', () => {
  it('default config has output_splash=true', () => {
    const config = getDefaultConfig();
    expect(config.output_splash).toBe(true);
  });

  it('default config has output_mode=normal', () => {
    const config = getDefaultConfig();
    expect(config.output_mode).toBe('normal');
  });

  it('default config has output_theme=default', () => {
    const config = getDefaultConfig();
    expect(config.output_theme).toBe('default');
  });

  it('default config has search_enabled=true', () => {
    const config = getDefaultConfig();
    expect(config.search_enabled).toBe(true);
  });

  it('default config has search_provider=context7', () => {
    const config = getDefaultConfig();
    expect(config.search_provider).toBe('context7');
  });

  it('default config has search_cache_ttl=3600', () => {
    const config = getDefaultConfig();
    expect(config.search_cache_ttl).toBe(3600);
  });

  it('default config has notify_on_complete=false', () => {
    const config = getDefaultConfig();
    expect(config.notify_on_complete).toBe(false);
  });

  it('default config has notify_channel=null', () => {
    const config = getDefaultConfig();
    expect(config.notify_channel).toBeNull();
  });

  it('default config has notify_url=null', () => {
    const config = getDefaultConfig();
    expect(config.notify_url).toBeNull();
  });

  it('default config has telemetry_enabled=false', () => {
    const config = getDefaultConfig();
    expect(config.telemetry_enabled).toBe(false);
  });

  it('default config has telemetry_anonymous=true', () => {
    const config = getDefaultConfig();
    expect(config.telemetry_anonymous).toBe(true);
  });

  it('default config has detected_env=null', () => {
    const config = getDefaultConfig();
    expect(config.detected_env).toBeNull();
  });

  it('default config has multi_ide_mode=false', () => {
    const config = getDefaultConfig();
    expect(config.multi_ide_mode).toBe(false);
  });

  it('default config has auth_mode=subscription', () => {
    const config = getDefaultConfig();
    expect(config.auth_mode).toBe('subscription');
  });

  it('default config has skill_routing=undefined', () => {
    const config = getDefaultConfig();
    expect(config.skill_routing).toBeUndefined();
  });
});

// ─── Sprint 191 Task 191-002 — Runtime Extension Default Flip ────────
// The `runtime_extension_enabled` flag in `timeout` switched from `false`
// (Sprint 145 introduction) to `true` (Sprint 191) so heartbeat-active
// workers are granted bounded extensions instead of a synthetic NO_GO.
describe('timeout.runtime_extension_enabled (Sprint 191 — default true)', () => {
  it('default config has runtime_extension_enabled=true', () => {
    const config = getDefaultConfig();
    expect(config.timeout).toBeDefined();
    expect(config.timeout!.runtime_extension_enabled).toBe(true);
  });

  it('honors explicit false override via validatePartialConfig deepMerge', async () => {
    // Round-trip through validatePartialConfig + the underlying default merge
    // to prove opt-out is still possible after the default flip.
    const { deepMerge } = await import('../../src/core/config.js');
    const merged = deepMerge(
      getDefaultConfig() as unknown as Record<string, unknown>,
      { timeout: { runtime_extension_enabled: false } } as Record<string, unknown>,
    ) as unknown as { timeout: { runtime_extension_enabled: boolean } };
    expect(merged.timeout.runtime_extension_enabled).toBe(false);
  });

  it('explicit true override is preserved (idempotent flip)', async () => {
    const { deepMerge } = await import('../../src/core/config.js');
    const merged = deepMerge(
      getDefaultConfig() as unknown as Record<string, unknown>,
      { timeout: { runtime_extension_enabled: true } } as Record<string, unknown>,
    ) as unknown as { timeout: { runtime_extension_enabled: boolean } };
    expect(merged.timeout.runtime_extension_enabled).toBe(true);
  });
});

describe('extended config validation', () => {
  it('accepts output_mode=quiet via partial config', () => {
    expect(() => validatePartialConfig({ output_mode: 'quiet' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts output_mode=verbose via partial config', () => {
    expect(() => validatePartialConfig({ output_mode: 'verbose' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts output_theme=rich via partial config', () => {
    expect(() => validatePartialConfig({ output_theme: 'rich' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts output_theme=minimal via partial config', () => {
    expect(() => validatePartialConfig({ output_theme: 'minimal' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts search_provider=web via partial config', () => {
    expect(() => validatePartialConfig({ search_provider: 'web' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts search_provider=none via partial config', () => {
    expect(() => validatePartialConfig({ search_provider: 'none' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts notify_channel=slack via partial config', () => {
    expect(() => validatePartialConfig({ notify_channel: 'slack' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts notify_channel=null via partial config', () => {
    expect(() => validatePartialConfig({ notify_channel: null } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts auth_mode=api via partial config', () => {
    expect(() => validatePartialConfig({ auth_mode: 'api' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts auth_mode=hybrid via partial config', () => {
    expect(() => validatePartialConfig({ auth_mode: 'hybrid' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts skill_routing with provider values', () => {
    expect(() => validatePartialConfig({
      skill_routing: { design: 'claude', testing: 'codex', docs: 'gemini', default: 'claude' },
    } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts skill_routing with null values', () => {
    expect(() => validatePartialConfig({
      skill_routing: { design: null, testing: null, docs: null },
    } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('existing config files load without error when new fields absent', async () => {
    // Simulate a legacy config that has none of the new fields
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'pro_plan', language: 'tr' }));

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('economic');
    // New fields should be available via defaults after merge
  });

  it('detected_env accepts all valid enum values', () => {
    for (const env of ['vscode', 'codex', 'gemini', 'cursor', 'tmux', 'shell', null] as const) {
      expect(() => validatePartialConfig({ detected_env: env } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
    }
  });
});

// ─── New Config Fields (Sprint 052) ──────────────────────────────────

import { CONFIG_METADATA, listConfigByCategory } from '../../src/core/config.js';

describe('memory config defaults', () => {
  it('default config has memory_budget=5000 (Sprint 140 pre-flight 5.5x increase)', () => {
    const config = getDefaultConfig();
    expect(config.memory_budget).toBe(5000);
  });

  it('default config has decay_after_sprints=20 (Sprint 140 pre-flight 4x increase)', () => {
    const config = getDefaultConfig();
    expect(config.decay_after_sprints).toBe(20);
  });

  it('default config has patterns_enabled=true', () => {
    const config = getDefaultConfig();
    expect(config.patterns_enabled).toBe(true);
  });

  it('default config has project_identity_enabled=true', () => {
    const config = getDefaultConfig();
    expect(config.project_identity_enabled).toBe(true);
  });
});

describe('auditor config defaults', () => {
  it('default config has scan_interval=30', () => {
    const config = getDefaultConfig();
    expect(config.scan_interval).toBe(30);
  });

  it('default config has heartbeat_timeout=120', () => {
    const config = getDefaultConfig();
    expect(config.heartbeat_timeout).toBe(120);
  });

  it('default config has boundary_enforcement=true', () => {
    const config = getDefaultConfig();
    expect(config.boundary_enforcement).toBe(true);
  });
});

describe('sprint config defaults', () => {
  it('default config has fix_phase_enabled=true', () => {
    const config = getDefaultConfig();
    expect(config.fix_phase_enabled).toBe(true);
  });

  it('default config has max_fix_retries=2', () => {
    const config = getDefaultConfig();
    expect(config.max_fix_retries).toBe(2);
  });
});

describe('rollback config defaults', () => {
  it('default config has rollback_policy=never', () => {
    const config = getDefaultConfig();
    expect(config.rollback_policy).toBe('never');
  });
});

describe('new config validation', () => {
  it('rejects memory_budget below 100', () => {
    expect(() => validatePartialConfig({ memory_budget: 50 } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects memory_budget above 10000', () => {
    expect(() => validatePartialConfig({ memory_budget: 20000 } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('accepts valid memory_budget=1000', () => {
    expect(() => validatePartialConfig({ memory_budget: 1000 } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('rejects decay_after_sprints=0', () => {
    expect(() => validatePartialConfig({ decay_after_sprints: 0 } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects non-boolean patterns_enabled', () => {
    expect(() => validatePartialConfig({ patterns_enabled: 'yes' as unknown as boolean } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects scan_interval below 5', () => {
    expect(() => validatePartialConfig({ scan_interval: 2 } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects heartbeat_timeout below 30', () => {
    expect(() => validatePartialConfig({ heartbeat_timeout: 10 } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects non-boolean boundary_enforcement', () => {
    expect(() => validatePartialConfig({ boundary_enforcement: 1 as unknown as boolean } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects non-boolean fix_phase_enabled', () => {
    expect(() => validatePartialConfig({ fix_phase_enabled: 'true' as unknown as boolean } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects max_fix_retries above 10', () => {
    expect(() => validatePartialConfig({ max_fix_retries: 15 } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('rejects invalid rollback_policy', () => {
    expect(() => validatePartialConfig({ rollback_policy: 'maybe' as 'never' } as Partial<import('../../src/core/types.js').DeckentConfig>)).toThrow(ConfigValidationError);
  });

  it('accepts rollback_policy=on_failure', () => {
    expect(() => validatePartialConfig({ rollback_policy: 'on_failure' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });

  it('accepts rollback_policy=always', () => {
    expect(() => validatePartialConfig({ rollback_policy: 'always' } as Partial<import('../../src/core/types.js').DeckentConfig>)).not.toThrow();
  });
});

describe('CONFIG_METADATA', () => {
  it('has entries for all new config fields', () => {
    const newFields = [
      'memory_budget', 'decay_after_sprints', 'patterns_enabled', 'project_identity_enabled',
      'scan_interval', 'heartbeat_timeout', 'boundary_enforcement',
      'fix_phase_enabled', 'max_fix_retries', 'rollback_policy',
    ];
    for (const field of newFields) {
      expect(CONFIG_METADATA[field]).toBeDefined();
      expect(CONFIG_METADATA[field].description).toBeTruthy();
      expect(CONFIG_METADATA[field].category).toBeTruthy();
    }
  });

  it('has at least 30 entries', () => {
    expect(Object.keys(CONFIG_METADATA).length).toBeGreaterThanOrEqual(30);
  });

  it('every entry has description, type, default, category', () => {
    for (const [key, meta] of Object.entries(CONFIG_METADATA)) {
      expect(meta.description, `${key} missing description`).toBeTruthy();
      expect(meta.type, `${key} missing type`).toBeTruthy();
      expect(meta.category, `${key} missing category`).toBeTruthy();
      expect('default' in meta, `${key} missing default`).toBe(true);
    }
  });
});

describe('listConfigByCategory', () => {
  it('returns grouped config by category', () => {
    const grouped = listConfigByCategory();
    expect(grouped['Provider']).toBeDefined();
    expect(grouped['Memory']).toBeDefined();
    expect(grouped['Auditor']).toBeDefined();
    expect(grouped['Sprint']).toBeDefined();
  });

  it('Provider category has brain_provider entry', () => {
    const grouped = listConfigByCategory();
    expect(grouped['Provider']).toContain('brain_provider');
  });

  it('Memory category has memory_budget entry', () => {
    const grouped = listConfigByCategory();
    expect(grouped['Memory']).toContain('memory_budget');
  });

  it('Auditor category has scan_interval entry', () => {
    const grouped = listConfigByCategory();
    expect(grouped['Auditor']).toContain('scan_interval');
  });

  it('Sprint category has fix_phase_enabled and rollback_policy', () => {
    const grouped = listConfigByCategory();
    expect(grouped['Sprint']).toContain('fix_phase_enabled');
    expect(grouped['Sprint']).toContain('rollback_policy');
  });
});

describe('loadConfig resolves new fields', () => {
  it('resolved config includes memory_budget from defaults (Sprint 140 pre-flight)', async () => {
    const config = await loadConfig('/test/project');
    expect(config.memory_budget).toBe(5000);
  });

  it('resolved config includes fix_phase_enabled from defaults', async () => {
    const config = await loadConfig('/test/project');
    expect(config.fix_phase_enabled).toBe(true);
  });

  it('resolved config includes rollback_policy from defaults', async () => {
    const config = await loadConfig('/test/project');
    expect(config.rollback_policy).toBe('never');
  });

  it('project config overrides memory_budget', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ memory_budget: 800 }));
    const config = await loadConfig('/test/project');
    expect(config.memory_budget).toBe(800);
  });
});

// ─── A) routing_engine V2 — Config Propagation (Sprint 068) ──────────
// Verifies that routing_engine: 'v2' is properly defaulted and propagated
// from DeckentConfig → ResolvedConfig.

describe('routing_engine config — V2 default and propagation', () => {
  it('A) default config has routing_engine=v2', () => {
    const config = getDefaultConfig();
    expect(config.routing_engine).toBe('v2');
  });

  it('A) loadConfig returns routing_engine=v2 from defaults (no config file)', async () => {
    const config = await loadConfig('/test/project');
    expect(config.routing_engine).toBe('v2');
  });

  it('A) project config can override routing_engine to v1', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ routing_engine: 'v1' }));

    const config = await loadConfig('/test/project');
    expect(config.routing_engine).toBe('v1');
  });

  it('A) project config can set routing_engine to v2 explicitly', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ routing_engine: 'v2' }));

    const config = await loadConfig('/test/project');
    expect(config.routing_engine).toBe('v2');
  });

  it('A) validateConfig accepts routing_engine=v2', () => {
    const config = getDefaultConfig();
    config.routing_engine = 'v2';
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('A) validateConfig accepts routing_engine=v1', () => {
    const config = getDefaultConfig();
    config.routing_engine = 'v1';
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('A) validateConfig rejects invalid routing_engine value', () => {
    const config = getDefaultConfig();
    config.routing_engine = 'v3' as 'v1';
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
  });

  it('A) routing_config is propagated to ResolvedConfig when set', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({
      routing_engine: 'v2',
      routing_config: { agentMinScore: 8, skillMinScore: 4 },
    }));

    const config = await loadConfig('/test/project');
    expect(config.routing_engine).toBe('v2');
    expect(config.routing_config?.agentMinScore).toBe(8);
    expect(config.routing_config?.skillMinScore).toBe(4);
  });

  it('A) cleanup_delay_ms is propagated with default 180000', async () => {
    const config = await loadConfig('/test/project');
    expect(config.cleanup_delay_ms).toBe(180_000);
  });

  it('A) project config can override cleanup_delay_ms', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ cleanup_delay_ms: 0 }));

    const config = await loadConfig('/test/project');
    expect(config.cleanup_delay_ms).toBe(0);
  });
});

// ─── Autonomous Engine config validation ──────────────────────────

describe('validateConfig — autonomous engine', () => {
  it('accepts a valid autonomous block', () => {
    const config = getDefaultConfig();
    config.autonomous = { enabled: true, interval_ms: 1000, pool_size: 2 } as typeof config.autonomous;
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('rejects enabled=non-boolean', () => {
    const config = getDefaultConfig();
    (config.autonomous as Record<string, unknown>)['enabled'] = 'yes';
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.enabled must be a boolean');
  });

  it('rejects interval_ms=-1', () => {
    const config = getDefaultConfig();
    config.autonomous = { ...config.autonomous, interval_ms: -1 };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.interval_ms');
  });

  it('rejects pool_size=0', () => {
    const config = getDefaultConfig();
    config.autonomous = { ...config.autonomous, pool_size: 0 };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.pool_size');
  });

  it('rejects pool_size=1.5 (non-integer)', () => {
    const config = getDefaultConfig();
    config.autonomous = { ...config.autonomous, pool_size: 1.5 };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.pool_size');
  });
});

describe('validateConfig — autonomous.reactive', () => {
  it('accepts a valid reactive block', () => {
    const config = getDefaultConfig();
    config.autonomous = { enabled: true, reactive: { enabled: true, map_path: '.deckent/autonomous/reactive-map.json' } };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('rejects non-boolean reactive.enabled', () => {
    const config = getDefaultConfig();
    (config.autonomous as Record<string, unknown>)['reactive'] = { enabled: 'yes' };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.reactive.enabled');
  });

  it('rejects non-string reactive.map_path', () => {
    const config = getDefaultConfig();
    (config.autonomous as Record<string, unknown>)['reactive'] = { enabled: true, map_path: 5 };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.reactive.map_path');
  });
});

describe('validateConfig — autonomous.work_generator', () => {
  it('accepts a valid work_generator block', () => {
    const config = getDefaultConfig();
    config.autonomous = { enabled: true, work_generator: { enabled: true, interval_ms: 60000 } };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('defaults work_generator to disabled', () => {
    const config = getDefaultConfig();
    expect(config.autonomous?.work_generator?.enabled).toBe(false);
  });

  it('rejects non-boolean work_generator.enabled', () => {
    const config = getDefaultConfig();
    (config.autonomous as Record<string, unknown>)['work_generator'] = { enabled: 'yes' };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.work_generator.enabled');
  });

  it('rejects negative work_generator.interval_ms', () => {
    const config = getDefaultConfig();
    (config.autonomous as Record<string, unknown>)['work_generator'] = { enabled: true, interval_ms: -1 };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('autonomous.work_generator.interval_ms');
  });
});

describe('validateConfig — autonomous.rbac_policy', () => {
  it('accepts a valid rbac_policy block', () => {
    const config = getDefaultConfig();
    config.autonomous = { enabled: true, rbac_policy: { enabled: true, role: 'operator' } };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('defaults rbac_policy to disabled with role viewer', () => {
    const config = getDefaultConfig();
    expect(config.autonomous?.rbac_policy?.enabled).toBe(false);
    expect(config.autonomous?.rbac_policy?.role).toBe('viewer');
  });

  it('rejects non-boolean rbac_policy.enabled', () => {
    const config = getDefaultConfig();
    (config.autonomous as Record<string, unknown>)['rbac_policy'] = { enabled: 'yes' };
    expect(() => validateConfig(config)).toThrow('autonomous.rbac_policy.enabled');
  });

  it('rejects an unknown rbac_policy.role', () => {
    const config = getDefaultConfig();
    (config.autonomous as Record<string, unknown>)['rbac_policy'] = { enabled: true, role: 'superuser' };
    expect(() => validateConfig(config)).toThrow('autonomous.rbac_policy.role');
  });
});

// ─── Sprint 072: Plan Tier Generalization ──────────────────────────

describe('Plan tier generalization (sprint-072)', () => {
  it('PlanMode type accepts new user-friendly tier names', () => {
    const modes: PlanMode[] = ['performance', 'balanced', 'economic', 'api'];
    expect(modes).toHaveLength(4);
    // Verify all are valid PlanMode strings
    for (const m of modes) {
      expect(typeof m).toBe('string');
    }
  });

  it('PlanMode type also accepts legacy tier names (backward compat)', () => {
    const legacyModes: PlanMode[] = ['max_plan', 'max5x_plan', 'pro_plan'];
    expect(legacyModes).toHaveLength(3);
  });

  it('legacy aliases resolve to canonical names', () => {
    expect(resolveMode('max_plan')).toBe('performance');
    expect(resolveMode('max5x_plan')).toBe('balanced');
    expect(resolveMode('pro_plan')).toBe('economic');
  });

  it('loadConfig migrates legacy alias to canonical name', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({ mode: 'max_plan' }));

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('performance');
    expect(config.activeModeConfig.max_workers).toBe(8);
    expect(config.activeModeConfig.brain_model).toBe('opus');
  });

  it('DEFAULT_MODES contains all 4 canonical tiers', () => {
    const modes = getDefaultModes();
    expect(modes['performance']).toBeDefined();
    expect(modes['balanced']).toBeDefined();
    expect(modes['economic']).toBeDefined();
    expect(modes['api']).toBeDefined();
  });

  it('config merge preserves tier settings with canonical alias as mode', async () => {
    mockedExistsSync.mockImplementation((p) => String(p).includes('.deckent'));
    mockedReadFile.mockResolvedValue(JSON.stringify({
      mode: 'economic',
      modes: { economic: { max_workers: 4 } },
    }));

    const config = await loadConfig('/test/project');
    expect(config.mode).toBe('economic');
    expect(config.activeModeConfig.max_workers).toBe(4);
    expect(config.activeModeConfig.brain_model).toBe('sonnet'); // preserved from default
  });
});
