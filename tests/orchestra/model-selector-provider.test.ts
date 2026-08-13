import { describe, it, expect } from 'vitest';
import { resolveTaskModel } from '../../src/orchestra/model-selector.js';
import type { ResolvedConfig, TaskScope, ModelType, ProviderName } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    mode: 'max_plan',
    activeModeConfig: {
      max_workers: 4,
      brain_model: 'claude-opus-4-8',
      default_model: 'claude-sonnet-5',
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

// ─── Backward Compatibility (no provider = claude) ──────────────────────────

describe('resolveTaskModel — provider parameter backward compat', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('floors an auto-selected economy code task to sonnet (MODEL-GUARD)', () => {
    // src/cli/ is a code-development scope; a low score would auto-resolve to
    // haiku (economy), but MODEL-GUARD forbids economy for code → sonnet.
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel('Simple fix', 'A tiny change', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  it('honors forceModel=haiku on a code scope (explicit override)', () => {
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel('Simple fix', 'A tiny change', scope, config, [], 'claude-haiku-4-5-20251001');
    expect(result).toBe('claude-haiku-4-5-20251001');
  });

  it('no provider parameter returns Claude model (sonnet)', () => {
    const scope = makeScope(['src/core/', 'src/cli/']);
    const result = resolveTaskModel('Normal task', 'Some description', scope, config);
    expect(result).toBe('claude-sonnet-5');
  });

  it('no provider parameter returns Claude model (opus)', () => {
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, config, patterns,
    );
    expect(result).toBe('claude-opus-5');
  });

  it('explicit provider=claude returns same as no provider', () => {
    const scope = makeScope(['src/cli/']);
    const withoutProvider = resolveTaskModel('Simple fix', 'A tiny change', scope, config);
    const withProvider = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'claude',
    );
    expect(withProvider).toBe(withoutProvider);
  });
});

// ─── Codex Provider ──────────────────────────────────────────────────────────

describe('resolveTaskModel — codex provider', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('floors an auto-selected economy code task to gpt-4.1 on codex (MODEL-GUARD)', () => {
    // Would auto-resolve to gpt-5-mini (economy) for a code scope; MODEL-GUARD
    // forbids economy for code-development → standard gpt-4.1.
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-5.6-terra');
  });

  it('keeps gpt-5-mini for an auto-selected economy DOC task on codex (economy allowed)', () => {
    // docs/ is exempt from the economy floor. A doc scope auto-resolves through
    // the economy tier on codex (gpt-5-mini) and is NOT upgraded by MODEL-GUARD.
    const scope = makeScope(['docs/'], ['docs/guide.md']);
    const result = resolveTaskModel(
      'Tiny doc', 'A tiny doc note', scope, config, patterns,
      undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-5.6-luna');
  });

  it('medium task resolves to gpt-4.1 (standard tier)', () => {
    const scope = makeScope(['src/core/', 'src/cli/']);
    const result = resolveTaskModel(
      'Normal task', 'Some description', scope, config, patterns,
      undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-5.6-terra');
  });

  it('complex task resolves to gpt-5 (premium tier)', () => {
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, config, patterns,
      undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-5.5');
  });

});

// ─── Gemini Provider ─────────────────────────────────────────────────────────

describe('resolveTaskModel — gemini provider', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('floors an auto-selected economy code task to gemini-2.5-flash (MODEL-GUARD)', () => {
    // Would auto-resolve to gemini-2.0-flash (economy) for a code scope;
    // MODEL-GUARD forbids economy for code-development → standard gemini-2.5-flash.
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.5-flash');
  });

  it('medium task resolves to gemini-2.5-flash (standard tier)', () => {
    const scope = makeScope(['src/core/', 'src/cli/']);
    const result = resolveTaskModel(
      'Normal task', 'Some description', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.5-flash');
  });

  it('complex task resolves to gemini-2.5-pro (premium tier)', () => {
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.5-pro');
  });
});

// ─── forceModel with provider ────────────────────────────────────────────────

describe('resolveTaskModel — forceModel + provider', () => {
  const config = makeConfig();
  const patterns: never[] = [];

  it('forceModel=opus on codex returns opus (adapter provider — forceModel is authoritative)', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'claude-opus-4-8', undefined, 'codex',
    );
    expect(result).toBe('gpt-5.5');
  });

  it('forceModel=sonnet on gemini returns sonnet (adapter provider — forceModel is authoritative)', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'claude-sonnet-5', undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.5-flash');
  });

  it('forceModel=gpt-4.1 on codex returns gpt-4.1 directly (same provider)', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'gpt-4.1', undefined, 'codex',
    );
    expect(result).toBe('gpt-4.1');
  });

  it('forceModel=opus on claude returns opus directly', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'claude-opus-4-8', undefined, 'claude',
    );
    expect(result).toBe('claude-opus-4-8');
  });

  it('forceModel=haiku on gemini returns haiku (adapter provider — forceModel is authoritative)', () => {
    const scope = makeScope(['src/core/']);
    const result = resolveTaskModel(
      'Forced task', 'Forced model', scope, config, patterns,
      'claude-haiku-4-5-20251001', undefined, 'gemini',
    );
    expect(result).toBe('gemini-2.0-flash');
  });
});

// ─── Layer interactions with provider ────────────────────────────────────────

describe('resolveTaskModel — layer interactions with provider', () => {
  it('pro_plan + codex: opus->sonnet(plan filter)->gpt-4.1(codex mapping)', () => {
    const proConfig = makeConfig({ mode: 'pro_plan' });
    const scope = makeScope(['src/core/', 'src/orchestra/']);
    const result = resolveTaskModel(
      'Architect migration refactor', 'Cross-cutting refactor', scope, proConfig,
      undefined, undefined, undefined, 'codex',
    );
    expect(result).toBe('gpt-5.6-terra');
  });

  it('haiku_allowed=false + gemini: haiku->sonnet(filter)->gemini-2.5-flash', () => {
    const config = makeConfig({
      activeModeConfig: {
        max_workers: 4,
        brain_model: 'claude-opus-4-8',
        default_model: 'claude-sonnet-5',
        haiku_allowed: false,
      },
    });
    const patterns: never[] = [];
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, undefined, 'gemini',
    );
    // haiku (score-based) -> sonnet (haiku not allowed) -> gemini-2.5-flash
    expect(result).toBe('gemini-2.5-flash');
  });

  it('doc scope + codex: opus->sonnet(doc cap)->gpt-4.1(codex)', () => {
    const config = makeConfig();
    const patterns: never[] = [];
    const scope = makeScope(['docs/']);
    const result = resolveTaskModel(
      'Write docs', 'Documentation', scope, config, patterns,
      undefined, ['claude-opus-4-8'], 'codex',
    );
    // skill upgrades to opus, Layer 3 caps to sonnet, then codex mapping -> gpt-4.1
    expect(result).toBe('gpt-5.6-terra');
  });

  it('skillModels + provider maps correctly', () => {
    const config = makeConfig();
    const patterns: never[] = [];
    const scope = makeScope(['src/cli/']);
    const result = resolveTaskModel(
      'Simple fix', 'A tiny change', scope, config, patterns,
      undefined, ['claude-opus-4-8'], 'codex',
    );
    // skill upgrades to opus, no caps apply, codex mapping -> gpt-5
    expect(result).toBe('gpt-5.5');
  });
});
