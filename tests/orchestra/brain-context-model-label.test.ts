import { describe, it, expect } from 'vitest';
import { ModelRegistry, type ModelDefinition } from '../../src/core/model-registry.js';

// We test resolveModelLabel and formatHistoryContext by importing them directly.
// NOTE: brain-context imports modelRegistry singleton — we stub it by replacing
// the singleton's internals via a test-only ModelRegistry instance passed through
// the exported helper. Since resolveModelLabel is a thin wrapper around the
// singleton we verify its contract here with the real singleton (which has the
// 13 built-in models).
import { resolveModelLabel, formatHistoryContext } from '../../src/orchestra/brain-context.js';
import type { SprintHistoryData } from '../../src/orchestra/brain-context.js';

// ─── 1. Label from live registry ─────────────────────────────────────────────

describe('resolveModelLabel — label canlı registry', () => {
  it('returns provider/apiId for known claude model (opus)', () => {
    const label = resolveModelLabel('opus');
    // opus should resolve to 'claude/claude-opus-4-8' (or whatever the live apiId is)
    expect(label).toMatch(/^claude\//);
    expect(label).not.toBe('opus'); // must not be raw alias
  });

  it('returns provider/apiId for known claude model (sonnet)', () => {
    const label = resolveModelLabel('sonnet');
    expect(label).toMatch(/^claude\//);
    expect(label).toContain('sonnet');
  });

  it('returns provider/apiId for known codex model (gpt-4.1)', () => {
    const label = resolveModelLabel('gpt-4.1');
    expect(label).toMatch(/^codex\//);
  });

  it('returns provider/apiId for known gemini model (gemini-2.5-pro)', () => {
    const label = resolveModelLabel('gemini-2.5-pro');
    expect(label).toMatch(/^gemini\//);
  });
});

// ─── 2. Unknown model graceful fallback ──────────────────────────────────────

describe('resolveModelLabel — bilinmeyen model graceful', () => {
  it('returns the original id when model is not in registry', () => {
    const label = resolveModelLabel('unknown-future-model-xyz');
    expect(label).toBe('unknown-future-model-xyz');
  });

  it('does not throw for empty string', () => {
    expect(() => resolveModelLabel('')).not.toThrow();
    expect(resolveModelLabel('')).toBe('');
  });
});

// ─── 3. Tier doğru ───────────────────────────────────────────────────────────

describe('registry tier doğruluğu — tier doğru', () => {
  it('opus is premium tier in registry', () => {
    const registry = new ModelRegistry();
    expect(registry.get('opus')?.tier).toBe('premium');
  });

  it('haiku is economy tier in registry', () => {
    const registry = new ModelRegistry();
    expect(registry.get('haiku')?.tier).toBe('economy');
  });

  it('sonnet is standard tier in registry', () => {
    const registry = new ModelRegistry();
    expect(registry.get('sonnet')?.tier).toBe('standard');
  });
});

// ─── 4. Provider prefix in formatHistoryContext output ───────────────────────

describe('formatHistoryContext — provider prefix', () => {
  it('model distribution shows provider/ prefix for known model', () => {
    const history: SprintHistoryData = {
      taskTypes: {},
      models: { opus: 4 },
      successRate: 1.0,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('claude/');
  });

  it('model distribution shows codex/ prefix for codex model', () => {
    const history: SprintHistoryData = {
      taskTypes: {},
      models: { 'gpt-4.1': 2 },
      successRate: 0.8,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('codex/');
  });

  it('unknown model is displayed without crash and appears in output', () => {
    const history: SprintHistoryData = {
      taskTypes: {},
      models: { 'mystery-model': 3 },
      successRate: 0.5,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('mystery-model:3');
    expect(result).toContain('Models:');
  });

  it('mixed known and unknown models all appear', () => {
    const history: SprintHistoryData = {
      taskTypes: { feature: 2 },
      models: { opus: 3, 'legacy-model': 1 },
      successRate: 0.9,
      noGoPatterns: [],
    };
    const result = formatHistoryContext(history);
    expect(result).toContain('claude/');
    expect(result).toContain('legacy-model');
    expect(result).toContain('Models:');
  });
});
