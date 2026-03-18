import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDefaultConfig,
  getDefaultModes,
  loadConfig,
  validatePartialConfig,
  ConfigValidationError,
} from '../../src/core/config.js';
import { DEFAULT_MODE } from '../../src/core/constants.js';

// Mock fs modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
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
  mockedExistsSync.mockReturnValue(false);
});

afterEach(() => {
  delete process.env['ANTHROPIC_API_KEY'];
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
  it('contains 4 modes: max_plan, max5x_plan, pro_plan, api', () => {
    const modes = getDefaultModes();
    expect(Object.keys(modes)).toEqual(
      expect.arrayContaining(['max_plan', 'max5x_plan', 'pro_plan', 'api']),
    );
    expect(Object.keys(modes)).toHaveLength(4);
  });

  it('max_plan: max_workers=8, brain_model=opus', () => {
    const modes = getDefaultModes();
    expect(modes.max_plan.max_workers).toBe(8);
    expect(modes.max_plan.brain_model).toBe('opus');
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
    expect(config.mode).toBe('max_plan');
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
    expect(config.mode).toBe('pro_plan');
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
    expect(config.mode).toBe('max5x_plan');
  });

  it('deep merges nested mode config', async () => {
    mockedExistsSync.mockImplementation((p) => {
      return String(p).includes('.deckent');
    });
    mockedReadFile.mockResolvedValue(
      JSON.stringify({ modes: { max_plan: { max_workers: 6 } } }),
    );

    const config = await loadConfig('/test/project');
    expect(config.modes.max_plan.max_workers).toBe(6);
    expect(config.modes.max_plan.brain_model).toBe('opus'); // preserved
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

  it('throws descriptive error for malformed JSON', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFile.mockResolvedValue('{ invalid json !!!');

    await expect(loadConfig('/test/project')).rejects.toThrow('Failed to read config file');
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
          max_plan: { ...getDefaultModes().max_plan, brain_planning: value },
          max5x_plan: getDefaultModes().max5x_plan,
          pro_plan: getDefaultModes().pro_plan,
          api: getDefaultModes().api,
        },
      })).not.toThrow();
    }
  });

  it('rejects invalid brain_planning value', () => {
    expect(() => validatePartialConfig({
      modes: {
        max_plan: { ...getDefaultModes().max_plan, brain_planning: 'invalid' as 'auto' },
        max5x_plan: getDefaultModes().max5x_plan,
        pro_plan: getDefaultModes().pro_plan,
        api: getDefaultModes().api,
      },
    })).toThrow(ConfigValidationError);
  });
});

describe('validatePartialConfig', () => {
  it('accepts { mode: "pro_plan" }', () => {
    expect(() => validatePartialConfig({ mode: 'pro_plan' })).not.toThrow();
  });

  it('accepts empty object (merges with defaults)', () => {
    expect(() => validatePartialConfig({})).not.toThrow();
  });

  it('rejects invalid mode', () => {
    expect(() =>
      validatePartialConfig({ mode: 'invalid' as 'max_plan' }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects max_workers=0', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          max_plan: { max_workers: 0 } as never,
          max5x_plan: getDefaultModes().max5x_plan,
          pro_plan: getDefaultModes().pro_plan,
          api: getDefaultModes().api,
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects max_workers=100', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          max_plan: { ...getDefaultModes().max_plan, max_workers: 100 },
          max5x_plan: getDefaultModes().max5x_plan,
          pro_plan: getDefaultModes().pro_plan,
          api: getDefaultModes().api,
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects invalid brain_model', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          max_plan: { ...getDefaultModes().max_plan, brain_model: 'gpt4' as 'opus' },
          max5x_plan: getDefaultModes().max5x_plan,
          pro_plan: getDefaultModes().pro_plan,
          api: getDefaultModes().api,
        },
      }),
    ).toThrow(ConfigValidationError);
  });

  it('rejects threshold 5hr=1.5', () => {
    expect(() =>
      validatePartialConfig({
        modes: {
          max_plan: {
            ...getDefaultModes().max_plan,
            usage_thresholds: { '5hr': 1.5, weekly: 0.6 },
          },
          max5x_plan: getDefaultModes().max5x_plan,
          pro_plan: getDefaultModes().pro_plan,
          api: getDefaultModes().api,
        },
      }),
    ).toThrow(ConfigValidationError);
  });
});
