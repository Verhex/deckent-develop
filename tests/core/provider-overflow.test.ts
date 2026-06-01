// tests/core/provider-overflow.test.ts
// Hermetic unit tests for `resolveWithOverflow` — Sprint 215 Task 215-006.
// Uses only literals + a fresh ModelRegistry; no fs, no HOME, no live state.

import { describe, it, expect } from 'vitest';
import {
  resolveWithOverflow,
  type OverflowResolution,
} from '../../src/core/provider-overflow.js';
import { ModelRegistry, BUILTIN_MODELS } from '../../src/core/model-registry.js';
import type { Task } from '../../src/core/task-types.js';
import type { RateLimitState } from '../../src/core/anthropic-http-client.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'fixture',
    description: 'overflow test task',
    model: 'opus',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: {
      goCriteria: '',
      noGoCriteria: '',
      techDebtAcceptable: '',
    },
    status: 'PENDING',
    authMode: 'subscription',
    ...overrides,
  };
}

const NO_THROTTLE: RateLimitState = {
  retryAfter: null,
  requestsLimit: 1000,
  requestsRemaining: 999,
  requestsReset: null,
  inputTokensLimit: 1_000_000,
  inputTokensRemaining: 900_000,
  inputTokensReset: null,
  outputTokensLimit: 200_000,
  outputTokensRemaining: 199_000,
  outputTokensReset: null,
  tokensLimit: 1_200_000,
  tokensRemaining: 1_100_000,
  tokensReset: null,
};

const OVER_QUOTA: RateLimitState = {
  retryAfter: 30, // 429 — guarantees shouldThrottle === true
  requestsLimit: 1000,
  requestsRemaining: 0,
  requestsReset: null,
  inputTokensLimit: 1_000_000,
  inputTokensRemaining: 0,
  inputTokensReset: null,
  outputTokensLimit: 200_000,
  outputTokensRemaining: 0,
  outputTokensReset: null,
  tokensLimit: 1_200_000,
  tokensRemaining: 0,
  tokensReset: null,
};

// ─── Tests ────────────────────────────────────────────────────────────

describe('resolveWithOverflow', () => {
  const registry = new ModelRegistry(BUILTIN_MODELS);

  it('limit-altı subs — no throttle signal → keeps task unchanged', () => {
    const task = makeTask({ model: 'opus', provider: 'claude' });
    const result: OverflowResolution = resolveWithOverflow(
      task,
      registry,
      NO_THROTTLE,
    );

    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('no_signal');
    expect(result.task).toBe(task); // identity preserved
    expect(result.task.authMode).toBe('subscription');
    expect(result.task.model).toBe('opus');
  });

  it('limit-altı with null state → returns no_signal', () => {
    const task = makeTask({ model: 'sonnet', provider: 'claude' });
    const result = resolveWithOverflow(task, registry, null);

    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('no_signal');
    expect(result.task.model).toBe('sonnet');
  });

  it('limit-üstü → falls back to equivalent API model (opus → gpt-5 on codex)', () => {
    const task = makeTask({ model: 'opus', provider: 'claude' });
    const result = resolveWithOverflow(task, registry, OVER_QUOTA);

    expect(result.overflowed).toBe(true);
    expect(result.reason).toBe('overflow');
    expect(result.fallbackProvider).toBe('codex');
    expect(result.fallbackModel).toBe('gpt-5'); // premium tier match
    expect(result.task.model).toBe('gpt-5');
    expect(result.task.provider).toBe('codex');
    expect(result.task.authMode).toBe('api');
    // Original task is unmodified (immutability check)
    expect(task.model).toBe('opus');
    expect(task.authMode).toBe('subscription');
  });

  it('eşdeğer-tier seçim — haiku → gpt-5-mini (economy), sonnet → gpt-4.1 (standard)', () => {
    const haikuTask = makeTask({ model: 'haiku', provider: 'claude' });
    const haikuResult = resolveWithOverflow(haikuTask, registry, OVER_QUOTA);
    expect(haikuResult.overflowed).toBe(true);
    expect(haikuResult.fallbackModel).toBe('gpt-5-mini');
    expect(haikuResult.task.model).toBe('gpt-5-mini');

    const sonnetTask = makeTask({ model: 'sonnet', provider: 'claude' });
    const sonnetResult = resolveWithOverflow(sonnetTask, registry, OVER_QUOTA);
    expect(sonnetResult.overflowed).toBe(true);
    // standard tier on codex — getEquivalent returns first match
    // (could be gpt-4.1 or o4-mini depending on Map insertion order from BUILTIN_MODELS)
    expect(['gpt-4.1', 'o4-mini']).toContain(sonnetResult.fallbackModel);
    expect(sonnetResult.task.provider).toBe('codex');
  });

  it('API yoksa graceful — gemini-only registry → no_equivalent', () => {
    // Registry with only gemini models — no codex equivalent exists
    const geminiOnly = new ModelRegistry(
      BUILTIN_MODELS.filter(m => m.provider === 'gemini' || m.provider === 'claude'),
    );
    const task = makeTask({ model: 'opus', provider: 'claude' });
    const result = resolveWithOverflow(task, geminiOnly, OVER_QUOTA, {
      apiProvider: 'codex', // explicit — but no codex models in this registry
    });

    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('no_equivalent');
    expect(result.task).toBe(task); // unchanged
    expect(result.fallbackModel).toBeUndefined();
  });

  it('already-api task — skips overflow logic (returns already_api)', () => {
    const task = makeTask({
      model: 'gpt-5',
      provider: 'codex',
      authMode: 'api',
    });
    const result = resolveWithOverflow(task, registry, OVER_QUOTA);

    expect(result.overflowed).toBe(false);
    expect(result.reason).toBe('already_api');
    expect(result.task).toBe(task);
  });

  it('honors apiProvider option — overflows to gemini when configured', () => {
    const task = makeTask({ model: 'opus', provider: 'claude' });
    const result = resolveWithOverflow(task, registry, OVER_QUOTA, {
      apiProvider: 'gemini',
    });

    expect(result.overflowed).toBe(true);
    expect(result.fallbackProvider).toBe('gemini');
    expect(result.fallbackModel).toBe('gemini-2.5-pro'); // premium tier on gemini
    expect(result.task.provider).toBe('gemini');
    expect(result.task.authMode).toBe('api');
  });
});
