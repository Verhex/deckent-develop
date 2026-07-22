// tests/core/provider-overflow-gate.test.ts
// Hermetic unit tests for `decidePreSpawnOverflow` — F1-010, Sprint 333 Task 333-002.
// Uses only literals + a fresh ModelRegistry; no fs, no HOME, no live state.

import { describe, it, expect } from 'vitest';
import {
  decidePreSpawnOverflow,
  type ProviderOverflowConfig,
  type PreSpawnOverflowDecision,
} from '../../src/core/provider-overflow-gate.js';
import { ModelRegistry, BUILTIN_MODELS } from '../../src/core/model-registry.js';
import type { Task } from '../../src/core/task-types.js';
import type { RateLimitState } from '../../src/core/anthropic-http-client.js';

// ─── Fixtures ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'fixture',
    description: 'overflow gate test task',
    model: 'claude-opus-4-8',
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
    provider: 'claude',
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

describe('decidePreSpawnOverflow', () => {
  const registry = new ModelRegistry(BUILTIN_MODELS);

  // ─── (a) flag-off → always null (no overflow) ────────────────────────

  it('(a) flag-off (undefined config) → null, reason=disabled, no advisory', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision: PreSpawnOverflowDecision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA, // even when over-quota...
      providerConfig: undefined,  // ...flag-off wins
      registry,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.overflowModel).toBeNull();
    expect(decision.reason).toBe('disabled');
    expect(decision.advisory).toBeNull();
  });

  it('(a) flag explicitly false → null, reason=disabled', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: { dynamic: false, apiProvider: 'codex' },
      registry,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.reason).toBe('disabled');
  });

  it('(a) flag-off even with over-quota + configured target → no overflow', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const cfg: ProviderOverflowConfig = { apiProvider: 'codex' }; // dynamic undefined
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: cfg,
      registry,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.reason).toBe('disabled');
  });

  // ─── (b) flag-on + rate-limited + configured target → returns target ──

  it('(b) flag-on + over-quota + codex target → overflow opus→gpt-5 on codex', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: { dynamic: true, apiProvider: 'codex' },
      registry,
    });
    expect(decision.reason).toBe('overflow');
    expect(decision.overflowProvider).toBe('codex');
    expect(decision.overflowModel).toBe('gpt-5.5'); // premium-tier equivalent
    expect(decision.advisory).toBeNull();
    // Original task untouched — decision is pure (caller applies the swap).
    expect(task.provider).toBe('claude');
    expect(task.model).toBe('claude-opus-4-8');
    expect(task.authMode).toBe('subscription');
  });

  it('(b) provider-agnostic — gemini target → overflow opus→gemini-2.5-pro', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: { dynamic: true, apiProvider: 'gemini' },
      registry,
    });
    expect(decision.reason).toBe('overflow');
    expect(decision.overflowProvider).toBe('gemini');
    expect(decision.overflowModel).toBe('gemini-2.5-pro');
  });

  // ─── (c) flag-on + rate-limited + NO target → null + honest advisory ──

  it('(c) flag-on + over-quota + NO target → null, reason=no_target, advisory set', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: { dynamic: true }, // no apiProvider
      registry,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.reason).toBe('no_target');
    expect(decision.advisory).toBeTruthy();
    // Honest-fail: NEVER a silent claude fallback.
    expect(decision.advisory).not.toMatch(/overflow to claude/i);
    expect(decision.advisory).toMatch(/refusing to silently degrade/i);
  });

  // ─── (d) flag-on + provider NOT limited → null ───────────────────────

  it('(d) flag-on + under-quota signal → null, reason=no_limit, no advisory', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: NO_THROTTLE,
      providerConfig: { dynamic: true, apiProvider: 'codex' },
      registry,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.reason).toBe('no_limit');
    expect(decision.advisory).toBeNull();
  });

  it('(d) flag-on + null signal (no snapshot yet) → null, reason=no_limit', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: null,
      providerConfig: { dynamic: true, apiProvider: 'codex' },
      registry,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.reason).toBe('no_limit');
  });

  // ─── Extra honest-fail / edge coverage ───────────────────────────────

  it('already-api task → null, reason=already_api (nothing to overflow)', () => {
    const task = makeTask({ model: 'gpt-5.5', provider: 'codex', authMode: 'api' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: { dynamic: true, apiProvider: 'codex' },
      registry,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.reason).toBe('already_api');
    expect(decision.advisory).toBeNull();
  });

  it('over-quota + target with no tier-equivalent → null, reason=no_equivalent + advisory', () => {
    // Registry without any codex models → no equivalent for opus on codex.
    const geminiOnly = new ModelRegistry(
      BUILTIN_MODELS.filter(m => m.provider === 'gemini' || m.provider === 'claude'),
    );
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: { dynamic: true, apiProvider: 'codex' },
      registry: geminiOnly,
    });
    expect(decision.overflowProvider).toBeNull();
    expect(decision.reason).toBe('no_equivalent');
    expect(decision.advisory).toBeTruthy();
    expect(decision.advisory).toMatch(/refusing to silently degrade/i);
  });

  it('uses the default singleton registry when none is injected', () => {
    // No `registry` arg → falls back to modelRegistry; opus→codex still resolves.
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude' });
    const decision = decidePreSpawnOverflow({
      task,
      rateLimitState: OVER_QUOTA,
      providerConfig: { dynamic: true, apiProvider: 'codex' },
    });
    expect(decision.reason).toBe('overflow');
    expect(decision.overflowProvider).toBe('codex');
  });
});
