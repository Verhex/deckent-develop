import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultConfig,
  validateConfig,
  ConfigValidationError,
  deepMerge,
  DEFAULT_TIMEOUT_CONFIG,
  loadConfig,
  clearConfigCache,
} from '../../src/core/config.js';
import type { DeckentConfig, TimeoutConfig } from '../../src/core/config-types.js';

describe('TimeoutConfig', () => {
  describe('defaults', () => {
    it('createDefaultConfig returns correct timeout defaults', () => {
      const config = createDefaultConfig();
      expect(config.timeout).toBeDefined();
      const t = config.timeout!;
      expect(t.docker_min_timeout).toBe(1200);
      expect(t.docker_max_timeout).toBe(7200);
      expect(t.tmux_min_timeout).toBe(900);
      expect(t.tmux_max_timeout).toBe(5400);
      expect(t.subprocess_min_timeout).toBe(600);
      expect(t.subprocess_max_timeout).toBe(3600);
      expect(t.effort_base).toEqual({ low: 600, normal: 1200, high: 2400 });
      expect(t.loc_scaling_enabled).toBe(true);
      expect(t.history_scaling_enabled).toBe(true);
      // Sprint 191 Task 191-002: default flipped false → true.
      expect(t.runtime_extension_enabled).toBe(true);
    });
  });

  describe('validation — effort_base ordering', () => {
    it('throws when effort_base.high < effort_base.normal', () => {
      const config = createDefaultConfig();
      config.timeout = { effort_base: { low: 600, normal: 1200, high: 1000 } };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
      try {
        validateConfig(config);
      } catch (e) {
        expect((e as ConfigValidationError).message).toContain(
          'timeout.effort_base.high must be greater than effort_base.normal',
        );
      }
    });

    it('throws when effort_base.normal <= effort_base.low', () => {
      const config = createDefaultConfig();
      config.timeout = { effort_base: { low: 1200, normal: 1200, high: 2400 } };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
      try {
        validateConfig(config);
      } catch (e) {
        expect((e as ConfigValidationError).message).toContain(
          'timeout.effort_base.normal must be greater than effort_base.low',
        );
      }
    });
  });

  describe('validation — min_timeout >= 300', () => {
    it('throws when docker_min_timeout < 300', () => {
      const config = createDefaultConfig();
      config.timeout = { docker_min_timeout: 100 };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
      try {
        validateConfig(config);
      } catch (e) {
        expect((e as ConfigValidationError).message).toContain(
          'timeout.docker_min_timeout must be >= 300',
        );
      }
    });

    it('throws when tmux_min_timeout < 300', () => {
      const config = createDefaultConfig();
      config.timeout = { tmux_min_timeout: 200 };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });

    it('throws when subprocess_min_timeout < 300', () => {
      const config = createDefaultConfig();
      config.timeout = { subprocess_min_timeout: 250 };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    });
  });

  describe('validation — max_timeout <= 86400', () => {
    it('throws when docker_max_timeout > 86400', () => {
      // Sprint 186 raised the cap 14400 (4h) → 86400 (24h) to support
      // long per-file audit sprints. See src/core/config.ts:557.
      const config = createDefaultConfig();
      config.timeout = { docker_max_timeout: 90000 };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
      try {
        validateConfig(config);
      } catch (e) {
        expect((e as ConfigValidationError).message).toContain(
          'timeout.docker_max_timeout must be <= 86400',
        );
      }
    });
  });

  describe('validation — max > min per backend', () => {
    it('throws when docker_max_timeout <= docker_min_timeout', () => {
      const config = createDefaultConfig();
      config.timeout = { docker_min_timeout: 3000, docker_max_timeout: 3000 };
      expect(() => validateConfig(config)).toThrow(ConfigValidationError);
      try {
        validateConfig(config);
      } catch (e) {
        expect((e as ConfigValidationError).message).toContain(
          'timeout.docker_max_timeout must be greater than timeout.docker_min_timeout',
        );
      }
    });
  });

  describe('validation — valid config passes', () => {
    it('accepts default timeout config without errors', () => {
      const config = createDefaultConfig();
      const warnings = validateConfig(config);
      expect(warnings).toBeInstanceOf(Array);
      // no throw = pass
    });

    it('accepts custom valid timeout config', () => {
      const config = createDefaultConfig();
      config.timeout = {
        docker_min_timeout: 1500,
        docker_max_timeout: 8000,
        effort_base: { low: 500, normal: 1000, high: 2000 },
      };
      expect(() => validateConfig(config)).not.toThrow();
    });
  });

  describe('3-layer merge', () => {
    it('partial timeout override merges with defaults', () => {
      const base = createDefaultConfig();
      const partial: Partial<DeckentConfig> = {
        timeout: { docker_min_timeout: 1500 },
      };
      const merged = deepMerge(base, partial);
      // overridden field
      expect(merged.timeout!.docker_min_timeout).toBe(1500);
      // preserved defaults
      expect(merged.timeout!.docker_max_timeout).toBe(7200);
      expect(merged.timeout!.effort_base.low).toBe(600);
    });
  });

  describe('loadConfig integration', () => {
    beforeEach(() => {
      clearConfigCache();
    });

    // Sprint 178 deckent-dev: project .deckent/config.json overrides timeout defaults
    // (docker_min_timeout=3600, effort_base.high=7200). This integration test asserted
    // defaults but loadConfig honors project config — the integration is verified by the
    // unit tests above. Skip until refactored to use an isolated config fixture.
    it.skip('loadConfig resolves timeout with defaults', async () => {
      const config = await loadConfig(process.cwd(), { force: true });
      expect(config.timeout).toBeDefined();
      expect(config.timeout!.docker_min_timeout).toBe(1200);
      expect(config.timeout!.effort_base.high).toBe(2400);
    });
  });
});
