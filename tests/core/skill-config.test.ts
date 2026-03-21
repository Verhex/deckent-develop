import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  ConfigValidationError,
  createDefaultConfig,
} from '../../src/core/config.js';
import type { DeckentConfig, SkillConfig } from '../../src/core/types.js';

// ─── Helper: build a valid config with skills override ──────────────────────

function buildConfigWithSkills(skills?: Partial<SkillConfig> | unknown): DeckentConfig {
  const config = createDefaultConfig();
  (config as Record<string, unknown>).skills = skills;
  return config;
}

// ─── Skills config validation ───────────────────────────────────────────────

describe('validateConfig — skills config', () => {
  it('accepts config without skills (undefined)', () => {
    const config = createDefaultConfig();
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts valid skills config with all fields', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 3,
      autoDetectStack: true,
      preferredSkills: ['typescript', 'vitest'],
    });
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts skills.enabled = false', () => {
    const config = buildConfigWithSkills({
      enabled: false,
      maxPerTask: 3,
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('rejects non-boolean skills.enabled', () => {
    const config = buildConfigWithSkills({
      enabled: 'yes',
      maxPerTask: 3,
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors).toContainEqual(expect.stringContaining('skills.enabled'));
    }
  });

  it('rejects skills.maxPerTask below 1', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 0,
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors).toContainEqual(expect.stringContaining('skills.maxPerTask'));
    }
  });

  it('rejects skills.maxPerTask above 10', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 11,
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors).toContainEqual(expect.stringContaining('skills.maxPerTask'));
    }
  });

  it('rejects non-number skills.maxPerTask', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 'three',
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors).toContainEqual(expect.stringContaining('skills.maxPerTask'));
    }
  });

  it('accepts skills.maxPerTask at boundaries (1 and 10)', () => {
    const config1 = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 1,
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config1)).not.toThrow();

    const config10 = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 10,
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config10)).not.toThrow();
  });

  it('rejects non-boolean skills.autoDetectStack', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 3,
      autoDetectStack: 'yes',
      preferredSkills: [],
    });
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors).toContainEqual(expect.stringContaining('skills.autoDetectStack'));
    }
  });

  it('rejects non-array skills.preferredSkills', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 3,
      autoDetectStack: true,
      preferredSkills: 'typescript',
    });
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors).toContainEqual(expect.stringContaining('skills.preferredSkills'));
    }
  });

  it('rejects non-string items in skills.preferredSkills', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 3,
      autoDetectStack: true,
      preferredSkills: [123, 'valid'],
    });
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      const err = e as ConfigValidationError;
      expect(err.errors).toContainEqual(expect.stringContaining('skills.preferredSkills'));
    }
  });

  it('accepts empty preferredSkills array', () => {
    const config = buildConfigWithSkills({
      enabled: true,
      maxPerTask: 3,
      autoDetectStack: true,
      preferredSkills: [],
    });
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts partial skills config (only enabled)', () => {
    const config = buildConfigWithSkills({ enabled: true });
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts partial skills config (only maxPerTask)', () => {
    const config = buildConfigWithSkills({ maxPerTask: 5 });
    expect(() => validateConfig(config)).not.toThrow();
  });
});
