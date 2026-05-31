import { describe, it, expect } from 'vitest';
import {
  shouldThrottle,
  nextDelayMs,
  computeBackoff,
  type RateLimitState,
} from '../../src/core/token-quota.js';

function makeState(overrides: Partial<RateLimitState> = {}): RateLimitState {
  return {
    retryAfter: null,
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
    ...overrides,
  };
}

describe('token-quota', () => {
  describe('shouldThrottle', () => {
    it('returns false when state is null (no API call observed yet)', () => {
      expect(shouldThrottle(null)).toBe(false);
    });

    it('returns true when a 429 retry-after is present', () => {
      const state = makeState({ retryAfter: 12 });
      expect(shouldThrottle(state)).toBe(true);
    });

    it('returns true when RPM is exhausted (< 2 remaining)', () => {
      const state = makeState({
        requestsRemaining: 1,
        requestsReset: new Date(Date.now() + 30_000).toISOString(),
      });
      expect(shouldThrottle(state)).toBe(true);
    });

    it('returns false when there is plenty of quota left', () => {
      const state = makeState({
        requestsRemaining: 500,
        inputTokensRemaining: 500_000,
      });
      expect(shouldThrottle(state)).toBe(false);
    });

    it('returns true when input tokens remaining < estimatedTokens * 1.2', () => {
      const state = makeState({
        inputTokensRemaining: 1_000,
        inputTokensReset: new Date(Date.now() + 60_000).toISOString(),
      });
      // Estimated 10k tokens but only 1k remaining → throttle.
      expect(shouldThrottle(state, 10_000)).toBe(true);
    });
  });

  describe('nextDelayMs', () => {
    it('returns 0 when state is null and throttleFloorMs is 0', () => {
      expect(nextDelayMs(null, 0, 0)).toBe(0);
    });

    it('returns throttleFloorMs when state is null and floor is positive', () => {
      expect(nextDelayMs(null, 0, 500)).toBe(500);
    });

    it('honours retry-after (seconds) over the floor when bigger', () => {
      const state = makeState({ retryAfter: 5 }); // 5_000 ms
      expect(nextDelayMs(state, 0, 500)).toBe(5_000);
    });

    it('returns the floor when state suggests no backoff', () => {
      const state = makeState({
        requestsRemaining: 500,
        inputTokensRemaining: 500_000,
      });
      expect(nextDelayMs(state, 0, 250)).toBe(250);
    });

    it('coerces negative throttleFloorMs to 0', () => {
      expect(nextDelayMs(null, 0, -1000)).toBe(0);
    });
  });

  describe('computeBackoff (re-exported, dead-code wire)', () => {
    it('returns 0 when nothing is exhausted', () => {
      const state = makeState({
        requestsRemaining: 100,
        inputTokensRemaining: 100_000,
      });
      expect(computeBackoff(state, 1_000)).toBe(0);
    });

    it('returns retryAfter on 429', () => {
      const state = makeState({ retryAfter: 7 });
      expect(computeBackoff(state, 0)).toBe(7);
    });
  });
});
