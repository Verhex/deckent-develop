import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createDefaultConfig,
  validateConfig,
  loadConfig,
  clearConfigCache,
  mergeConfigs,
  ConfigValidationError,
} from '../../src/core/config.js';

describe('deckent_style config key', () => {
  beforeEach(() => {
    clearConfigCache();
    delete process.env['DECKENT_STYLE'];
  });

  afterEach(() => {
    clearConfigCache();
    delete process.env['DECKENT_STYLE'];
  });

  it('default config has deckent_style === "sprint"', () => {
    const config = createDefaultConfig();
    expect(config.deckent_style).toBe('sprint');
  });

  it('global config deckent_style: "task" overrides default via mergeConfigs', () => {
    const resolved = mergeConfigs({ deckent_style: 'task' }, null);
    expect(resolved.deckent_style).toBe('task');
  });

  it('project config "task" override wins over global "sprint" (3-layer merge)', () => {
    const resolved = mergeConfigs(
      { deckent_style: 'sprint' },
      { deckent_style: 'task' },
    );
    expect(resolved.deckent_style).toBe('task');
  });

  it('invalid value "turbo" throws ConfigValidationError', () => {
    const config = createDefaultConfig();
    (config as any).deckent_style = 'turbo';
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e: any) {
      expect(e.message).toContain('deckent_style');
      expect(e.message).toContain('turbo');
    }
  });

  it('DECKENT_STYLE=task env var overrides config', async () => {
    process.env['DECKENT_STYLE'] = 'task';
    const resolved = await loadConfig(process.cwd(), { force: true });
    expect(resolved.deckent_style).toBe('task');
  });

  it('type union is strict — only sprint and task are valid', () => {
    const config = createDefaultConfig();
    // Valid values should pass validation
    config.deckent_style = 'sprint';
    expect(() => validateConfig(config)).not.toThrow();
    config.deckent_style = 'task';
    expect(() => validateConfig(config)).not.toThrow();
    // undefined is also valid (uses default)
    config.deckent_style = undefined;
    expect(() => validateConfig(config)).not.toThrow();
  });
});
