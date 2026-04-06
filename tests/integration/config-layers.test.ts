/**
 * Integration Test: Config Layers
 *
 * Tests the config layer system:
 * - Global config + project config merge
 * - Project override global
 * - Missing global fallback
 * - Invalid config validation
 * - Config file operations on real filesystem
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeckentConfig } from '../../src/core/types.js';
import {
  loadConfig,
  loadGlobalConfig,
  saveGlobalConfig,
  mergeConfigs,
  validateConfig,
  ConfigValidationError,
  deepMerge,
  createDefaultConfig,
} from '../../src/core/config.js';
import { PROJECT_CONFIG_PATH } from '../../src/core/constants.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'config-layers-test-'));
}

function writeCfg(path: string, cfg: unknown): void {
  const dir = join(path, '..');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

function readCfg(path: string): unknown {
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

// ─── Integration Tests ───────────────────────────────────────────────

describe('Config Layers Integration', () => {
  let globalTempDir: string;
  let projectTempDir: string;
  let originalGlobalConfigPath: string;

  beforeEach(() => {
    globalTempDir = makeTempDir();
    projectTempDir = makeTempDir();
    originalGlobalConfigPath = process.env.DECKENT_GLOBAL_CONFIG ?? '';
  });

  afterEach(() => {
    rmSync(globalTempDir, { recursive: true, force: true });
    rmSync(projectTempDir, { recursive: true, force: true });
    if (originalGlobalConfigPath) {
      process.env.DECKENT_GLOBAL_CONFIG = originalGlobalConfigPath;
    } else {
      delete process.env.DECKENT_GLOBAL_CONFIG;
    }
  });

  describe('Global Config + Project Config Merge', () => {
    it('loads and merges global and project configs in correct order', async () => {
      const globalConfigPath = join(globalTempDir, 'config.json');
      const projectConfigPath = join(projectTempDir, PROJECT_CONFIG_PATH);

      // Create global config
      writeCfg(globalConfigPath, {
        language: 'tr',
        projectName: 'global-project',
        mode: 'pro_plan',
      });

      // Create project config (partial)
      mkdirSync(join(projectTempDir, '.deckent'), { recursive: true });
      writeCfg(projectConfigPath, {
        projectName: 'project-override',
      });

      // Test with mergeConfigs
      const globalConfig = await loadGlobalConfig(globalConfigPath);
      const projectConfig = {
        projectName: 'project-override',
      };

      const result = mergeConfigs(globalConfig, projectConfig as Partial<DeckentConfig>);

      expect(result.language).toBe('tr'); // from global
      expect(result.mode).toBe('pro_plan'); // from global
      expect(result.projectName).toBe('project-override'); // project overrides
    });

    it('applies global config over defaults', async () => {
      const globalConfig = {
        language: 'tr',
        mode: 'pro_plan' as const,
      };

      const result = mergeConfigs(globalConfig as Partial<DeckentConfig>, null);

      expect(result.language).toBe('tr');
      expect(result.mode).toBe('pro_plan');
      expect(result.projectName).toBe('deckent-project'); // default
    });

    it('applies project config when global is missing', async () => {
      const projectConfig = {
        language: 'en',
        projectName: 'my-project',
      };

      const result = mergeConfigs(null, projectConfig as Partial<DeckentConfig>);

      expect(result.language).toBe('en');
      expect(result.projectName).toBe('my-project');
    });
  });

  describe('Project Override Global', () => {
    it('project mode overrides global mode', async () => {
      const globalConfig: Partial<DeckentConfig> = { mode: 'pro_plan' };
      const projectConfig: Partial<DeckentConfig> = { mode: 'max_plan' };

      const result = mergeConfigs(globalConfig, projectConfig);

      expect(result.mode).toBe('max_plan');
    });

    it('project language overrides global language', async () => {
      const globalConfig: Partial<DeckentConfig> = { language: 'tr' };
      const projectConfig: Partial<DeckentConfig> = { language: 'en' };

      const result = mergeConfigs(globalConfig, projectConfig);

      expect(result.language).toBe('en');
    });

    it('project config overrides nested mode settings', () => {
      const globalConfig: Partial<DeckentConfig> = {
        modes: {
          pro_plan: {
            max_workers: 3,
            brain_model: 'sonnet',
            default_model: 'sonnet',
            haiku_allowed: false,
            brain_planning: 'auto',
          },
        } as DeckentConfig['modes'],
      };

      const projectConfig: Partial<DeckentConfig> = {
        modes: {
          pro_plan: {
            max_workers: 5,
            brain_model: 'sonnet',
            default_model: 'sonnet',
            haiku_allowed: false,
            brain_planning: 'auto',
          },
        } as DeckentConfig['modes'],
      };

      const result = mergeConfigs(globalConfig, projectConfig);

      expect(result.modes.pro_plan.max_workers).toBe(5);
    });

    it('project config preserves global settings not specified in project', () => {
      const globalConfig: Partial<DeckentConfig> = {
        language: 'tr',
        projectName: 'global-name',
      };

      const projectConfig: Partial<DeckentConfig> = {
        projectName: 'project-name',
      };

      const result = mergeConfigs(globalConfig, projectConfig);

      expect(result.language).toBe('tr'); // preserved from global
      expect(result.projectName).toBe('project-name'); // overridden
    });
  });

  describe('Missing Global Fallback', () => {
    it('falls back to defaults when global config does not exist', async () => {
      const missingGlobalPath = join(globalTempDir, 'nonexistent', 'config.json');
      const globalConfig = await loadGlobalConfig(missingGlobalPath);

      expect(globalConfig).toBeNull();

      const result = mergeConfigs(globalConfig, null);

      expect(result.mode).toBe('max_plan'); // default
      expect(result.language).toBe('en'); // default
    });

    it('falls back to defaults when project config does not exist', async () => {
      const globalConfig: Partial<DeckentConfig> = { language: 'tr' };
      const result = mergeConfigs(globalConfig, null);

      expect(result.language).toBe('tr');
      expect(result.mode).toBe('max_plan'); // default
    });

    it('uses all defaults when both global and project are null', () => {
      const result = mergeConfigs(null, null);

      expect(result.mode).toBe('max_plan');
      expect(result.language).toBe('en');
      expect(result.projectName).toBe('deckent-project');
      expect(result.activeModeConfig).toBeDefined();
      expect(result.auto_docs).toBeDefined();
    });

    it('provides complete ResolvedConfig with activeModeConfig', () => {
      const result = mergeConfigs(null, null);

      expect(result.activeModeConfig).toBeDefined();
      expect(result.activeModeConfig.max_workers).toBeDefined();
      expect(result.activeModeConfig.brain_model).toBeDefined();
      expect(result.activeModeConfig.default_model).toBeDefined();
    });
  });

  describe('Invalid Config Validation', () => {
    it('throws ConfigValidationError for invalid mode', () => {
      expect(() => {
        const config: Partial<DeckentConfig> = {
          mode: 'invalid_mode' as unknown as DeckentConfig['mode'],
        };
        mergeConfigs(config, null);
      }).toThrow(ConfigValidationError);
    });

    it('throws ConfigValidationError for invalid language', () => {
      expect(() => {
        const config: Partial<DeckentConfig> = {
          language: 'invalid_lang' as unknown as DeckentConfig['language'],
        };
        mergeConfigs(config, null);
      }).toThrow(ConfigValidationError);
    });

    it('throws ConfigValidationError for invalid brain_model in mode config', () => {
      expect(() => {
        const config: Partial<DeckentConfig> = {
          modes: {
            pro_plan: {
              max_workers: 3,
              brain_model: 'invalid' as unknown as DeckentConfig['mode'],
              default_model: 'sonnet',
              haiku_allowed: false,
              brain_planning: 'auto',
            },
          } as DeckentConfig['modes'],
        };
        mergeConfigs(config, null);
      }).toThrow(ConfigValidationError);
    });

    it('throws ConfigValidationError for invalid max_workers', () => {
      expect(() => {
        const config: Partial<DeckentConfig> = {
          modes: {
            pro_plan: {
              max_workers: -1, // Invalid: must be >= 1 or 'auto'
              brain_model: 'sonnet',
              default_model: 'sonnet',
              haiku_allowed: false,
              brain_planning: 'auto',
            },
          } as DeckentConfig['modes'],
        };
        mergeConfigs(config, null);
      }).toThrow(ConfigValidationError);
    });

    it('catches validation errors with detailed error messages', () => {
      try {
        const config: Partial<DeckentConfig> = {
          mode: 'invalid' as unknown as DeckentConfig['mode'],
        };
        mergeConfigs(config, null);
        expect.fail('Should have thrown ConfigValidationError');
      } catch (error) {
        if (error instanceof ConfigValidationError) {
          expect(error.errors).toBeDefined();
          expect(error.errors.length).toBeGreaterThan(0);
          expect(error.message).toContain('Config validation failed');
        } else {
          expect.fail(`Expected ConfigValidationError, got ${error}`);
        }
      }
    });
  });

  describe('Deep Merge Behavior', () => {
    it('deep merges nested mode configs correctly', () => {
      const base = createDefaultConfig();
      const override: Partial<DeckentConfig> = {
        modes: {
          pro_plan: {
            max_workers: 10,
            brain_model: 'opus',
            default_model: 'opus',
            haiku_allowed: true,
            brain_planning: 'ai',
          },
        } as DeckentConfig['modes'],
      };

      const result = deepMerge(base, override);

      expect(result.modes.pro_plan.max_workers).toBe(10);
      expect(result.modes.pro_plan.brain_model).toBe('opus');
      // Other modes should be unchanged
      expect(result.modes.max_plan.max_workers).toBe(8);
    });

    it('preserves non-overridden fields in nested merge', () => {
      const base = createDefaultConfig();
      const override: Partial<DeckentConfig> = {
        language: 'tr',
      };

      const result = deepMerge(base, override);

      expect(result.language).toBe('tr');
      expect(result.mode).toBe(base.mode);
      expect(result.modes).toEqual(base.modes);
    });
  });

  describe('File Operations Integration', () => {
    it('round-trips global config: save and load', async () => {
      const configPath = join(globalTempDir, 'config.json');
      const original: Partial<DeckentConfig> = {
        language: 'tr',
        projectName: 'round-trip-test',
        mode: 'pro_plan',
      };

      await saveGlobalConfig(original, configPath);
      const loaded = await loadGlobalConfig(configPath);

      expect(loaded).toEqual(original);
    });

    it('writes valid JSON with proper formatting', async () => {
      const configPath = join(globalTempDir, 'config.json');
      const config: Partial<DeckentConfig> = {
        language: 'en',
        projectName: 'format-test',
      };

      await saveGlobalConfig(config, configPath);
      const content = readFileSync(configPath, 'utf-8');

      expect(content.endsWith('\n')).toBe(true); // trailing newline
      expect(() => JSON.parse(content)).not.toThrow(); // valid JSON
      expect(content).toContain('"language"'); // formatted
    });

    it('creates parent directories for new config path', async () => {
      const configPath = join(globalTempDir, 'nested', 'deep', 'config.json');
      const config: Partial<DeckentConfig> = { language: 'tr' };

      await saveGlobalConfig(config, configPath);

      expect(existsSync(configPath)).toBe(true);
      const loaded = await loadGlobalConfig(configPath);
      expect((loaded as Partial<DeckentConfig>).language).toBe('tr');
    });
  });

  describe('Edge Cases', () => {
    it('handles empty global and project configs', () => {
      const result = mergeConfigs({}, {});

      expect(result.mode).toBe('max_plan');
      expect(result.language).toBe('en');
      expect(result.activeModeConfig).toBeDefined();
    });

    it('validates after merge (catches invalid merge result)', () => {
      expect(() => {
        const base = createDefaultConfig();
        const invalid = { mode: 'invalid' } as Partial<DeckentConfig>;
        validateConfig(deepMerge(base, invalid));
      }).toThrow(ConfigValidationError);
    });

    it('handles config with undefined fields (skipped in merge)', () => {
      const base: Partial<DeckentConfig> = { language: 'en' };
      const override: Partial<DeckentConfig> = { language: undefined };

      const result = deepMerge(base, override);

      // undefined fields should not override
      expect(result.language).toBe('en');
    });
  });
});
