import { describe, it, expect } from 'vitest';
import type { DeckentConfig, ResolvedConfig } from '../../src/core/config-types.js';
import {
  validateConfig,
  createDefaultConfig,
  ConfigValidationError,
  DEFAULT_PROMPT_CONFIG,
  deepMerge,
} from '../../src/core/config.js';

// ─── prompt.persona_render (443-002, U4) ─────────────────────────────────────
// Mirrors the existing prompt.adr_render knob (config.ts ~line 1097) exactly:
// same validation shape, same default-resolution shape.

describe('DeckentConfig — prompt.persona_render', () => {
  it('is optional and undefined when not set', () => {
    const config: Partial<DeckentConfig> = {};
    expect(config.prompt?.persona_render).toBeUndefined();
  });

  it('accepts persona_render: "full"', () => {
    const config: Partial<DeckentConfig> = { prompt: { persona_render: 'full' } };
    expect(config.prompt?.persona_render).toBe('full');
  });

  it('accepts persona_render: "guidance"', () => {
    const config: Partial<DeckentConfig> = { prompt: { persona_render: 'guidance' } };
    expect(config.prompt?.persona_render).toBe('guidance');
  });

  it('ResolvedConfig accepts persona_render', () => {
    const resolved: Partial<ResolvedConfig> = { prompt: { persona_render: 'guidance' } };
    expect(resolved.prompt?.persona_render).toBe('guidance');
  });
});

describe('createDefaultConfig — prompt.persona_render default', () => {
  it('defaults to "full" (byte-identical legacy render)', () => {
    const config = createDefaultConfig();
    expect(config.prompt?.persona_render).toBe('full');
  });

  it('DEFAULT_PROMPT_CONFIG pins persona_render to "full"', () => {
    expect(DEFAULT_PROMPT_CONFIG.persona_render).toBe('full');
  });
});

describe('validateConfig — prompt.persona_render', () => {
  it('accepts "full" without errors', () => {
    const config = createDefaultConfig();
    config.prompt = { ...config.prompt, persona_render: 'full' };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts "guidance" without errors', () => {
    const config = createDefaultConfig();
    config.prompt = { ...config.prompt, persona_render: 'guidance' };
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('accepts absent persona_render without errors (default resolution applies)', () => {
    const config = createDefaultConfig();
    delete config.prompt?.persona_render;
    expect(() => validateConfig(config)).not.toThrow();
  });

  it('throws a typed ConfigValidationError for an invalid value', () => {
    const config = createDefaultConfig();
    (config.prompt as Record<string, unknown>) = {
      ...config.prompt,
      persona_render: 'summary',
    };
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    try {
      validateConfig(config);
    } catch (e) {
      expect((e as ConfigValidationError).errors).toContainEqual(
        expect.stringContaining(
          "Invalid value 'summary' for field 'prompt.persona_render'. Valid: full, guidance.",
        ),
      );
    }
  });
});

describe('prompt.persona_render — three-layer merge resolution', () => {
  // loadConfig resolves default -> global -> project by deepMerge'ing each
  // layer's `prompt` partial over DEFAULT_PROMPT_CONFIG (config.ts ~line 1893).
  // This exercises that same deepMerge contract directly, mirroring how
  // adr_render's merge behavior is implicitly covered by the generic
  // DEFAULT_PROMPT_CONFIG deepMerge pattern.

  it('a project-layer override merges over defaults, leaving siblings untouched', () => {
    const projectOverride = { persona_render: 'guidance' as const };
    const resolved = deepMerge(DEFAULT_PROMPT_CONFIG, projectOverride);
    expect(resolved.persona_render).toBe('guidance');
    expect(resolved.adr_render).toBe('full');
    expect(resolved.adr_min_relevance).toBe(0.3);
  });

  it('an absent override resolves to the "full" default', () => {
    const resolved = deepMerge(DEFAULT_PROMPT_CONFIG, {});
    expect(resolved.persona_render).toBe('full');
  });

  it('a global-then-project two-step merge lets project win', () => {
    const globalLayer = { persona_render: 'guidance' as const };
    const projectLayer = { persona_render: 'full' as const };
    const afterGlobal = deepMerge(DEFAULT_PROMPT_CONFIG, globalLayer);
    const afterProject = deepMerge(afterGlobal, projectLayer);
    expect(afterProject.persona_render).toBe('full');
  });
});
