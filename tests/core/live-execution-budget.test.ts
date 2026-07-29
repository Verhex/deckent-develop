import { describe, expect, it } from 'vitest';
import {
  LiveExecutionBudgetGuard,
  assertExecutionLandingSupport,
  assertLiveUsageBudgetSupport,
  extractLiveUsageObservation,
  hasLiveUsageCeiling,
} from '../../src/core/live-execution-budget.js';
import { normalizeStreamEvent } from '../../src/core/log-event.js';

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
  it('requests owner-configured landing at 75% while preserving the hard ceiling', () => {
    const guard = new LiveExecutionBudgetGuard(
      { maxTurns: 4 },
      undefined,
      { reserve_ratio: 0.25 },
    );
    expect(guard.observe(claudeBlock('turn-1', { input_tokens: 1 })).state).toBe('within-budget');
    expect(guard.observe(claudeBlock('turn-2', { input_tokens: 1 })).state).toBe('within-budget');
    const landing = guard.observe(claudeBlock('turn-3', { input_tokens: 1 }));
    expect(landing.state).toBe('landing-requested');
    expect(landing.reasons[0]).toContain('turn landing threshold reached (3 >= 3');
    expect(guard.observe(claudeBlock('turn-4', { input_tokens: 1 })).state).toBe('landing-requested');
    expect(guard.observe(claudeBlock('turn-5', { input_tokens: 1 })).state).toBe('exceeded');
  });

  it('rounds a fractional turn reserve upward before another indivisible provider call', () => {
    const guard = new LiveExecutionBudgetGuard(
      { maxTurns: 5 },
      undefined,
      { reserve_ratio: 0.25 },
    );
    expect(guard.observe(claudeBlock('five-turn-1', { input_tokens: 1 })).state).toBe('within-budget');
    expect(guard.observe(claudeBlock('five-turn-2', { input_tokens: 1 })).state).toBe('within-budget');
    const landing = guard.observe(claudeBlock('five-turn-3', { input_tokens: 1 }));
    expect(landing.state).toBe('landing-requested');
    expect(landing.reasons[0]).toContain('turn landing threshold reached (3 >= 3');
    expect(guard.observe(claudeBlock('five-turn-4', {
      input_tokens: 1,
    })).state).toBe('landing-requested');
    expect(guard.observe(claudeBlock('five-turn-5', {
      input_tokens: 1,
    })).state).toBe('landing-requested');
    expect(guard.observe(claudeBlock('five-turn-6', {
      input_tokens: 1,
    })).state).toBe('exceeded');
  });

  it('records applied deltas and neutral consecutive cache-read evidence without duplicate inflation', () => {
    const guard = new LiveExecutionBudgetGuard({ maxCacheReadTokens: 1_000 });
    const first = guard.observe(claudeBlock('cache-1', {
      input_tokens: 2,
      output_tokens: 3,
      cache_read_input_tokens: 100,
    }));
    expect(first.appliedDelta).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      cacheReadTokens: 100,
      cacheCreationTokens: 0,
    });
    expect(first.consecutiveCacheReadEvents).toBe(1);
    const duplicate = guard.observe(claudeBlock('cache-1', {
      input_tokens: 2,
      output_tokens: 3,
      cache_read_input_tokens: 100,
    }, 'tool_use'));
    expect(duplicate.appliedDelta).toBeUndefined();
    expect(duplicate.consecutiveCacheReadEvents).toBe(1);
    expect(guard.observe(claudeBlock('cache-2', {
      cache_read_input_tokens: 200,
    })).consecutiveCacheReadEvents).toBe(2);
    expect(guard.observe(claudeBlock('no-cache', {
      input_tokens: 1,
    })).consecutiveCacheReadEvents).toBe(0);
  });

  it('restores v2 landing and repeated-read evidence without double counting', () => {
    const policy = { reserve_ratio: 0.25 } as const;
    const first = new LiveExecutionBudgetGuard({ maxCacheReadTokens: 200 }, undefined, policy);
    const event = claudeBlock('restore-1', { cache_read_input_tokens: 120 });
    first.observe(event);
    const restored = new LiveExecutionBudgetGuard(
      { maxCacheReadTokens: 200 },
      first.exportState(),
      policy,
    );
    const replay = restored.observe(event);
    expect(replay.state).toBe('within-budget');
    expect(replay.consecutiveCacheReadEvents).toBe(1);
    const landing = restored.observe(claudeBlock('restore-2', { cache_read_input_tokens: 30 }));
    expect(landing.state).toBe('landing-requested');
    expect(landing.counters.cacheReadTokens).toBe(150);
    expect(landing.consecutiveCacheReadEvents).toBe(2);
  });

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

  it('measures and deterministically deduplicates an id-less Codex terminal replay', () => {
    const guard = new LiveExecutionBudgetGuard({ maxTurns: 2, maxTokens: 1_000 });
    const terminal = normalizeStreamEvent({
      type: 'usage',
      providerEventType: 'turn.completed',
      codexEventType: 'turn.completed',
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cached_input_tokens: 30,
      },
    }, 'codex');

    expect(guard.observe(terminal).state).toBe('within-budget');
    const duplicate = guard.observe(terminal);

    expect(duplicate.appliedDelta).toBeUndefined();
    expect(guard.exportState()).toMatchObject({
      measurableEvents: 1,
      counters: {
        turns: 1,
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 30,
        totalTokens: 150,
      },
    });
  });

  it('measures Gemini final-only usageMetadata including cached content', () => {
    const guard = new LiveExecutionBudgetGuard({ maxTurns: 2, maxTokens: 100 });
    const terminal = normalizeStreamEvent({
      response: 'done',
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 3,
        cachedContentTokenCount: 5,
      },
    }, 'gemini');

    expect(guard.observe(terminal).state).toBe('within-budget');
    expect(guard.snapshot().counters).toMatchObject({
      turns: 1,
      inputTokens: 10,
      outputTokens: 3,
      cacheReadTokens: 5,
      totalTokens: 18,
    });
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

  it('rejects missing, empty, and unknown remote budgets before dispatch', () => {
    expect(() => assertLiveUsageBudgetSupport(
      undefined,
      'measured-stream',
      'remote-test',
    )).toThrow('Remote execution budget is required');
    expect(() => assertLiveUsageBudgetSupport(
      {},
      'measured-stream',
      'remote-test',
    )).toThrow('at least one explicit ceiling');
    expect(() => assertLiveUsageBudgetSupport(
      { maxTurns: 2, typoLimit: 1 } as never,
      'measured-stream',
      'remote-test',
    )).toThrow('Unknown execution budget field "typoLimit"');
  });

  it('allows budgetless execution only for an explicitly local executor', () => {
    expect(() => assertLiveUsageBudgetSupport(
      undefined,
      undefined,
      'ollama',
      'local',
    )).not.toThrow();
    expect(() => assertLiveUsageBudgetSupport(
      { maxTurns: 2 },
      undefined,
      'ollama',
      'local',
    )).toThrow('does not declare that capability');
  });

  it('keeps metering and landing capability independent at final admission', () => {
    expect(() => assertExecutionLandingSupport({
      budget: { maxTurns: 4 },
      policy: { reserve_ratio: 0.25, surprise: true } as never,
      mode: 'unattended',
      capability: 'checkpoint-stop',
      executor: 'docker',
    })).toThrow("Unknown field 'execution landing policy.surprise'");
    expect(() => assertExecutionLandingSupport({
      budget: { maxTurns: 4 },
      policy: { reserve_ratio: 0.25 },
      mode: 'unattended',
      capability: 'unsupported',
      executor: 'docker',
    })).toThrow('does not support budget landing');
    expect(() => assertExecutionLandingSupport({
      budget: { maxTurns: 4 },
      policy: { reserve_ratio: 0.25 },
      mode: 'unattended',
      capability: 'checkpoint-stop',
      executor: 'docker',
    })).not.toThrow();
    expect(() => assertExecutionLandingSupport({
      budget: { maxTurns: 4 },
      policy: { reserve_ratio: 0.25, attended_unsupported: 'allow-hard-stop' },
      mode: 'attended',
      capability: 'unsupported',
      executor: 'subprocess',
    })).toThrow('requires an exact final dispatch binding');
    expect(() => assertExecutionLandingSupport({
      budget: { maxTurns: 4 },
      policy: { reserve_ratio: 0.25, attended_unsupported: 'allow-hard-stop' },
      mode: 'attended',
      capability: 'unsupported',
      executor: 'subprocess',
      approvalEvidenceRef: 'approval://owner/decision-1',
    })).toThrow('exact final dispatch binding');
  });
});
