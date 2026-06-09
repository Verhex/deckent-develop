import { describe, it, expect } from 'vitest';
import {
  resolveReasoningEffort,
  getReasoningEfforts,
  REASONING_EFFORT_BY_PROVIDER,
} from '../../src/core/reasoning-effort.js';

// F1-RE (Sprint 252): model reasoning-effort (depth) — opt-in, provider-validated,
// distinct from task effort (work-size). Flags validated vs installed CLIs.

describe('resolveReasoningEffort', () => {
  it('claude: accepts low/medium/high/xhigh/max (claude --effort values)', () => {
    for (const lvl of ['low', 'medium', 'high', 'xhigh', 'max']) {
      expect(resolveReasoningEffort('claude', lvl)).toBe(lvl);
    }
  });

  it('codex: accepts minimal/low/medium/high (codex model_reasoning_effort)', () => {
    for (const lvl of ['minimal', 'low', 'medium', 'high']) {
      expect(resolveReasoningEffort('codex', lvl)).toBe(lvl);
    }
    // codex does NOT support claude-only xhigh/max
    expect(resolveReasoningEffort('codex', 'xhigh')).toBeUndefined();
    expect(resolveReasoningEffort('codex', 'max')).toBeUndefined();
  });

  it('opt-in only: no requested level → undefined (no flag emitted, CLI default kept)', () => {
    expect(resolveReasoningEffort('claude')).toBeUndefined();
    expect(resolveReasoningEffort('codex', undefined)).toBeUndefined();
  });

  it('unsupported provider (gemini/ollama) → always undefined', () => {
    expect(resolveReasoningEffort('gemini', 'high')).toBeUndefined();
    expect(resolveReasoningEffort('ollama', 'high')).toBeUndefined();
  });

  it('unrecognized level → undefined (ignored, not a broken flag)', () => {
    expect(resolveReasoningEffort('claude', 'turbo')).toBeUndefined();
    expect(resolveReasoningEffort('claude', 'normal')).toBeUndefined(); // task-effort word, NOT a model level
  });
});

describe('getReasoningEfforts', () => {
  it('lists levels per provider; empty for unsupported', () => {
    expect(getReasoningEfforts('claude')).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(getReasoningEfforts('codex')).toEqual(['minimal', 'low', 'medium', 'high']);
    expect(getReasoningEfforts('gemini')).toEqual([]);
    expect(getReasoningEfforts('ollama')).toEqual([]);
  });

  it('REASONING_EFFORT_BY_PROVIDER has no gemini/ollama key (unsupported = absent)', () => {
    expect(REASONING_EFFORT_BY_PROVIDER.gemini).toBeUndefined();
    expect(REASONING_EFFORT_BY_PROVIDER.ollama).toBeUndefined();
  });
});
