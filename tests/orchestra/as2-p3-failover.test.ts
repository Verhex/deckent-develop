// AS2-P3: Rate-limit failover FIX-path wire (429/limit→provider-switch)
// Hermetic — no gitignored state, no spawnSync, no network calls.

import { describe, it, expect } from 'vitest';
import {
  is429Error,
  applyRateLimitFailover,
  MidSprintAdapter,
} from '../../src/orchestra/mid-sprint-adapter.js';
import type { Task, TaskResult } from '../../src/core/task-types.js';
import type { RateLimitState } from '../../src/core/token-quota.js';
import { modelRegistry } from '../../src/core/model-registry.js';
import type { AgentPool } from '../../src/core/agent-types.js';
import type { OutcomeTracker } from '../../src/orchestra/outcome-tracker.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-001',
    title: 'Test task',
    description: 'Test',
    model: 'claude-opus-4-8',
    effort: 'normal',
    priority: 'normal',
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: [], noGoCriteria: [] },
    status: 'pending',
    provider: 'claude',
    authMode: 'subscription',
    ...overrides,
  };
}

function makeResult(notes = '', overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'test-001',
    workerId: 'w-001',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes,
    ...overrides,
  };
}

// Explicit 429 RateLimitState with retryAfter=60 — makes shouldThrottle() return true
const EXHAUSTED_STATE: RateLimitState = {
  retryAfter: 60,
  requestsLimit: null,
  requestsRemaining: null,
  requestsReset: null,
  inputTokensLimit: null,
  inputTokensRemaining: null,
  inputTokensReset: null,
  outputTokensLimit: null,
  outputTokensRemaining: null,
  outputTokensReset: null,
  tokensLimit: null,
  tokensRemaining: null,
  tokensReset: null,
};

// Non-exhausted state — shouldThrottle() returns false
const FINE_STATE: RateLimitState = {
  retryAfter: null,
  requestsLimit: 1000,
  requestsRemaining: 500,
  requestsReset: null,
  inputTokensLimit: null,
  inputTokensRemaining: null,
  inputTokensReset: null,
  outputTokensLimit: null,
  outputTokensRemaining: null,
  outputTokensReset: null,
  tokensLimit: null,
  tokensRemaining: null,
  tokensReset: null,
};

function makeAdapter(): MidSprintAdapter {
  const agentPool: AgentPool = new Map();
  const skillPool = new Map();
  const outcomeTracker = { calculateBonuses: () => [] } as unknown as OutcomeTracker;
  return new MidSprintAdapter(agentPool, skillPool, outcomeTracker);
}

// ─── is429Error ───────────────────────────────────────────────────────────────

describe('is429Error', () => {
  it('detects "429" in notes', () => {
    expect(is429Error(makeResult('Error: 429 Too Many Requests'))).toBe(true);
  });

  it('detects "rate limit" (lowercase, space-separated)', () => {
    expect(is429Error(makeResult('API rate limit exceeded, retry later'))).toBe(true);
  });

  it('detects "rate_limit" (underscore)', () => {
    expect(is429Error(makeResult('rate_limit error from provider'))).toBe(true);
  });

  it('detects "too many requests" case-insensitively', () => {
    expect(is429Error(makeResult('Too Many Requests from upstream'))).toBe(true);
  });

  it('detects "ratelimit" (no separator)', () => {
    expect(is429Error(makeResult('ratelimit exceeded for model'))).toBe(true);
  });

  it('returns false for unrelated errors', () => {
    expect(is429Error(makeResult('TypeError: cannot read property x of undefined'))).toBe(false);
  });

  it('returns false for empty notes', () => {
    expect(is429Error(makeResult(''))).toBe(false);
  });
});

// ─── applyRateLimitFailover ───────────────────────────────────────────────────

describe('applyRateLimitFailover', () => {
  it('returns null when no 429 signal and no rateLimitState', () => {
    const task = makeTask();
    const result = makeResult('Some other error — scope violation');
    expect(applyRateLimitFailover(task, result)).toBeNull();
  });

  it('returns null when task is already api authMode (no overflow needed)', () => {
    const task = makeTask({ authMode: 'api', model: 'gpt-5.5', provider: 'codex' });
    const result = makeResult('429 rate limit exceeded');
    // resolveWithOverflow returns reason='already_api' → applyRateLimitFailover returns null
    expect(applyRateLimitFailover(task, result)).toBeNull();
  });

  it('returns null when non-exhausted rateLimitState provided (no throttle signal)', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude', authMode: 'subscription' });
    // notes have no 429; rateLimitState has plenty remaining → shouldThrottle=false
    const result = makeResult('Worker ran out of time');
    expect(applyRateLimitFailover(task, result, FINE_STATE)).toBeNull();
  });

  it('opus-sub → gpt-5-api: detects 429 in notes and overflows to codex', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude', authMode: 'subscription' });
    const result = makeResult('Error 429: rate limit exceeded on claude.ai');

    const resolution = applyRateLimitFailover(task, result);

    expect(resolution).not.toBeNull();
    expect(resolution!.overflowed).toBe(true);
    expect(resolution!.reason).toBe('overflow');
    expect(resolution!.task.authMode).toBe('api');
    expect(resolution!.task.provider).toBe('codex');
    // opus is premium tier → codex equivalent premium = gpt-5
    expect(resolution!.fallbackModel).toBe('gpt-5.5');
    expect(resolution!.fallbackProvider).toBe('codex');
  });

  it('uses provided exhausted rateLimitState to trigger failover without 429 in notes', () => {
    const task = makeTask({ model: 'claude-sonnet-5', provider: 'claude', authMode: 'subscription' });
    const result = makeResult('Some generic failure message'); // no '429' text

    const resolution = applyRateLimitFailover(task, result, EXHAUSTED_STATE);

    expect(resolution).not.toBeNull();
    expect(resolution!.overflowed).toBe(true);
    expect(resolution!.task.authMode).toBe('api');
    expect(resolution!.task.provider).toBe('codex');
  });

  it('returned fallback model is in the model registry and same tier as original', () => {
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude', authMode: 'subscription' });
    const result = makeResult('429 Too Many Requests');

    const resolution = applyRateLimitFailover(task, result);

    expect(resolution?.fallbackModel).toBeTruthy();
    // Both opus (claude) and gpt-5 (codex) are premium tier
    expect(modelRegistry.getTier('claude-opus-4-8')).toBe('premium');
    expect(modelRegistry.getTier(resolution!.fallbackModel!)).toBe('premium');
  });

  it('overflowed task preserves all non-provider fields from original', () => {
    const task = makeTask({
      model: 'claude-opus-4-8',
      provider: 'claude',
      authMode: 'subscription',
      title: 'Important Task',
      description: 'Do something important',
    });
    const result = makeResult('429 rate limit');

    const resolution = applyRateLimitFailover(task, result);

    expect(resolution!.task.id).toBe(task.id);
    expect(resolution!.task.title).toBe(task.title);
    expect(resolution!.task.description).toBe(task.description);
    expect(resolution!.task.scope).toBe(task.scope);
  });
});

// ─── MidSprintAdapter.handleRateLimitFailover ────────────────────────────────

describe('MidSprintAdapter.handleRateLimitFailover', () => {
  it('returns new task when 429 detected in result notes', () => {
    const adapter = makeAdapter();
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude', authMode: 'subscription' });
    const result = makeResult('429 rate limit hit, retry after 60 seconds');

    const newTask = adapter.handleRateLimitFailover(task, result);

    expect(newTask).not.toBeNull();
    expect(newTask!.provider).toBe('codex');
    expect(newTask!.authMode).toBe('api');
    expect(newTask!.model).toBe('gpt-5.5');
  });

  it('returns null when no 429 detected in notes', () => {
    const adapter = makeAdapter();
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude', authMode: 'subscription' });
    const result = makeResult('Task failed due to scope violation');

    expect(adapter.handleRateLimitFailover(task, result)).toBeNull();
  });

  it('uses explicit exhausted rateLimitState when notes have no 429', () => {
    const adapter = makeAdapter();
    const task = makeTask({ model: 'claude-opus-4-8', provider: 'claude', authMode: 'subscription' });
    const result = makeResult('Worker failed unexpectedly');

    const newTask = adapter.handleRateLimitFailover(task, result, EXHAUSTED_STATE);

    expect(newTask).not.toBeNull();
    expect(newTask!.provider).toBe('codex');
    expect(newTask!.authMode).toBe('api');
  });

  it('returns null when task is already on api authMode', () => {
    const adapter = makeAdapter();
    const task = makeTask({ model: 'gpt-5.5', provider: 'codex', authMode: 'api' });
    const result = makeResult('429 rate limit exceeded');

    // already_api → resolveWithOverflow returns overflowed=false → handleRateLimitFailover=null
    expect(adapter.handleRateLimitFailover(task, result)).toBeNull();
  });
});
