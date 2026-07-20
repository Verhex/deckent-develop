import { describe, expect, it } from 'vitest';
import {
  LiveExecutionBudgetGuard,
  assertLiveUsageBudgetSupport,
  extractLiveUsageObservation,
  hasLiveUsageCeiling,
} from '../../src/core/live-execution-budget.js';

function claudeBlock(id: string, usage: Record<string, number>, blockType = 'text') {
  return {
    type: blockType === 'tool_use' ? 'tool_use' as const : 'text' as const,
    content: {
      type: 'assistant',
      message: {
        id,
        usage,
        content: [{ type: blockType }],
      },
      request_id: `req-${id}`,
    },
  };
}

describe('LiveExecutionBudgetGuard', () => {
  it('deduplicates repeated Claude blocks by provider message id', () => {
    const guard = new LiveExecutionBudgetGuard({ maxTurns: 1, maxCacheReadTokens: 100 });
    const usage = {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_input_tokens: 70,
      cache_creation_input_tokens: 5,
    };
    expect(guard.observe(claudeBlock('msg-1', usage)).state).toBe('within-budget');
    expect(guard.observe(claudeBlock('msg-1', usage, 'tool_use')).state).toBe('within-budget');
    expect(guard.snapshot().counters).toMatchObject({ turns: 1, cacheReadTokens: 70, totalTokens: 87 });
  });

  it('trips close to Sprint-455 call 32 without repeated-block inflation', () => {
    const guard = new LiveExecutionBudgetGuard({ maxCacheReadTokens: 5_000_000 });
    let trippedAt = 0;
    for (let turn = 1; turn <= 40; turn++) {
      const event = claudeBlock(`msg-${turn}`, {
        input_tokens: 1_000,
        output_tokens: 500,
        cache_read_input_tokens: 160_000,
        cache_creation_input_tokens: 2_000,
      });
      guard.observe(event);
      const duplicate = guard.observe(claudeBlock(`msg-${turn}`, event.content.message.usage, 'tool_use'));
      if (!trippedAt && duplicate.state === 'exceeded') trippedAt = turn;
    }
    expect(trippedAt).toBe(32);
    expect(guard.snapshot().counters.turns).toBe(40);
    expect(guard.snapshot().counters.cacheReadTokens).toBe(6_400_000);
  });

  it('reconciles a final cumulative result as a snapshot instead of double-counting', () => {
    const guard = new LiveExecutionBudgetGuard({ maxTokens: 1_000 });
    guard.observe(claudeBlock('msg-1', {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 200,
      cache_creation_input_tokens: 25,
    }));
    guard.observe({
      type: 'usage',
      content: {
        type: 'result',
        request_id: 'final-1',
        num_turns: 3,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 200,
          cache_creation_input_tokens: 25,
        },
      },
    });
    expect(guard.snapshot().counters).toMatchObject({ turns: 3, totalTokens: 375, maxContextTokens: 325 });
  });

  it('tracks per-call context separately from cumulative usage', () => {
    const guard = new LiveExecutionBudgetGuard({ maxContextTokens: 100 });
    const decision = guard.observe(claudeBlock('msg-1', {
      input_tokens: 10,
      output_tokens: 1,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 20,
    }));
    expect(decision.state).toBe('exceeded');
    expect(decision.counters.maxContextTokens).toBe(110);
  });

  it('refuses usage without a stable provider call identity', () => {
    expect(extractLiveUsageObservation({
      type: 'usage',
      content: { usage: { input_tokens: 10, output_tokens: 1 } },
    })).toBeNull();
  });

  it('does not use a session id as an incremental call dedupe identity', () => {
    expect(extractLiveUsageObservation({
      type: 'usage',
      content: { session_id: 'session-1', usage: { input_tokens: 10 } },
    })).toBeNull();
  });

  it('keeps maxContextTokens unknown for cumulative-only evidence', () => {
    const guard = new LiveExecutionBudgetGuard({ maxContextTokens: 100 });
    const decision = guard.observe({
      type: 'usage',
      content: {
        type: 'result',
        session_id: 'session-final',
        usage: { input_tokens: 50, output_tokens: 10 },
      },
    });
    expect(decision.state).toBe('unmeasurable');
    expect(decision.reasons).toContain('per-call context token evidence unavailable from cumulative-only usage');
  });

  it('replays a host-stamped canonical LogEvent without trusting arbitrary nesting', () => {
    const guard = new LiveExecutionBudgetGuard({ maxCacheReadTokens: 10 });
    const assistant = claudeBlock('msg-replay', { cache_read_input_tokens: 11 });
    const replayed = guard.observe({
      type: 'text',
      content: {
        ts: '2026-07-20T12:00:00.000Z',
        seq: 7,
        type: assistant.type,
        content: assistant.content,
      },
    });
    expect(replayed.state).toBe('exceeded');
    const untrusted = new LiveExecutionBudgetGuard({ maxCacheReadTokens: 10 });
    expect(untrusted.observe({
      type: 'text',
      content: { content: assistant.content },
    }).state).toBe('unmeasurable');
  });

  it('does not claim maxUsd alone is enforceable before final billing', () => {
    expect(hasLiveUsageCeiling({ maxUsd: 1 })).toBe(false);
    expect(hasLiveUsageCeiling({ maxTurns: 10 })).toBe(true);
  });

  it('rejects maxUsd before dispatch until immutable live pricing is supported', () => {
    expect(() => assertLiveUsageBudgetSupport(
      { maxUsd: 1 },
      'measured-stream',
      'test-executor',
    )).toThrow('Spawn blocked before provider work');
  });
});
