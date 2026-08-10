import { describe, expect, it } from 'vitest';
import type { ResolvedConfig, TaskScope } from '../../src/core/types.js';
import { resolveTaskModel } from '../../src/orchestra/model-selector.js';

function makeScope(): TaskScope {
  return { directories: ['src/core/'], filesRead: [], filesWrite: [] };
}

function makeConfig(
  activeModeConfig: ResolvedConfig['activeModeConfig'],
): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig,
    modes: {} as ResolvedConfig['modes'],
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
  };
}

describe('resolveTaskModel minimum tier enforcement', () => {
  it('uses min_tier when it is present, regardless of haiku_allowed', () => {
    const model = resolveTaskModel(
      'Add utility',
      'Simple utility function',
      makeScope(),
      makeConfig({
        max_workers: 4,
        brain_model: 'claude-opus-4-8',
        default_model: 'claude-sonnet-5',
        haiku_allowed: true,
        min_tier: 'premium',
      }),
    );

    expect(model).toBe('claude-opus-5');
  });

  it('retains the haiku_allowed fallback when min_tier is absent', () => {
    const model = resolveTaskModel(
      'Add utility',
      'Simple utility function',
      makeScope(),
      makeConfig({
        max_workers: 4,
        brain_model: 'claude-opus-4-8',
        default_model: 'claude-sonnet-5',
        haiku_allowed: false,
      }),
    );

    expect(model).toBe('claude-sonnet-5');
  });
});
