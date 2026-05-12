import { describe, it, expect } from 'vitest';
import { createDefaultConfig, getDefaultConfig } from '../../src/core/config.js';
import type { ResolvedConfig } from '../../src/core/types.js';

/**
 * Sprint 156 Task 2: dependency_pipeline_enabled default flip regression guard.
 *
 * The field is declared on ResolvedConfig (config-types.ts) but is set by
 * createDefaultConfig() through a local intersection alias (DeckentConfigWithPipeline).
 * If a future refactor reverts the default to false/undefined, this test fails
 * immediately, preventing a regression of the dependency pipeline being silently
 * disabled across all projects.
 */
describe('createDefaultConfig — Sprint 156 dependency pipeline default flip', () => {
  it('dependency_pipeline_enabled is true by default', () => {
    const cfg = getDefaultConfig() as ResolvedConfig;
    expect(cfg.dependency_pipeline_enabled).toBe(true);
  });

  it('createDefaultConfig() and getDefaultConfig() return the same default value', () => {
    const a = createDefaultConfig() as ResolvedConfig;
    const b = getDefaultConfig() as ResolvedConfig;
    expect(a.dependency_pipeline_enabled).toBe(true);
    expect(b.dependency_pipeline_enabled).toBe(true);
    expect(a.dependency_pipeline_enabled).toBe(b.dependency_pipeline_enabled);
  });

  it('returns a fresh object each call (no shared reference)', () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    expect(a).not.toBe(b);
    // Mutating one must not affect the other — guards against accidental
    // singleton return that would let one test poison another.
    (a as ResolvedConfig).dependency_pipeline_enabled = false;
    expect((b as ResolvedConfig).dependency_pipeline_enabled).toBe(true);
  });
});
