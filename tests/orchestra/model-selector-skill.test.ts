import { describe, it, expect } from 'vitest';
import { resolveTaskModel } from '../../src/orchestra/model-selector.js';
import type { ResolvedConfig, TaskScope, ModelType } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'opus',
      default_model: 'sonnet',
      haiku_allowed: true,
    },
    modes: {} as never,
    language: 'en',
    projectName: 'test',
    projectRoot: '/tmp/test',
    version: '0.1.0',
    ...overrides,
  };
}

function makeScope(dirs: string[], filesWrite: string[] = []): TaskScope {
  return { directories: dirs, filesRead: [], filesWrite };
}

// ─── Layer 4d: Skill Model Preference ────────────────────────────────────────

describe('resolveTaskModel — skillModels parameter (Layer 4d)', () => {
  const config = makeConfig();

  it('upgrades model when skill requires opus', () => {
    // Base score for simple task: single dir = -1 -> haiku
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config,
      undefined, undefined, ['opus'],
    );
    // opus from skill, but Layer 3 does not cap here (src/ scope, not docs/test-only)
    // Layer 1 does not downgrade (max_plan)
    expect(result).toBe('opus');
  });

  it('upgrades from haiku to sonnet when skill requires sonnet', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Tiny fix', 'A small change', scope, config,
      undefined, undefined, ['sonnet'],
    );
    expect(result).toBe('sonnet');
  });

  it('does not downgrade model when skill model is lower', () => {
    // Multi-dir + architectural = opus from base score
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, config,
      undefined, undefined, ['haiku'],
    );
    // Skill wants haiku but base model is opus; skill should not downgrade
    expect(result).toBe('opus');
  });

  it('picks highest among multiple skill models', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Mixed skills task', 'Some description', scope, config,
      undefined, undefined, ['haiku', 'sonnet', 'opus'],
    );
    expect(result).toBe('opus');
  });

  it('undefined skillModels has no effect', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config,
    );
    // Should be haiku (score = -1, haiku_allowed=true)
    expect(result).toBe('haiku');
  });

  it('empty skillModels array has no effect', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config,
      undefined, undefined, [],
    );
    expect(result).toBe('haiku');
  });

  it('skill model upgrade still capped by Layer 3 (docs scope)', () => {
    const scope = makeScope(['docs/']);
    const result = resolveTaskModel(
      'Doc update', 'Write documentation', scope, config,
      undefined, undefined, ['opus'],
    );
    // Layer 4d upgrades to opus, but Layer 3 caps docs scope to sonnet
    expect(result).toBe('sonnet');
  });

  it('skill model upgrade still capped by Layer 1 (pro_plan)', () => {
    const proConfig = makeConfig({ mode: 'pro_plan' });
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Important task', 'Critical implementation', scope, proConfig,
      undefined, undefined, ['opus'],
    );
    // Layer 4d upgrades to opus, but Layer 1 downgrades opus on pro_plan
    expect(result).toBe('sonnet');
  });

  it('forceModel overrides skillModels', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config,
      undefined, 'haiku' as ModelType, ['opus'],
    );
    // forceModel=haiku takes priority (Layer 0)
    expect(result).toBe('haiku');
  });

  it('skill model works with pattern upgrade together', () => {
    const scope = makeScope(['src/core/', 'tests/']);
    const patterns = [
      { pattern: 'file_outside_scope', occurrences: 3, firstDetectedInSprint: 's1', lastDetectedInSprint: 's2', resolved: false },
    ];
    const result = resolveTaskModel(
      'Pattern task', 'Fix boundary violations', scope, config,
      patterns, undefined, ['sonnet'],
    );
    // Pattern upgrade gives opus, skill gives sonnet
    // Pattern upgrade to opus wins (opus > sonnet)
    expect(result).toBe('opus');
  });
});
