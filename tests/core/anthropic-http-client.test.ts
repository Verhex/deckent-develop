import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  countTokens,
  parseRateLimitHeaders,
  computeBackoff,
  timeUntilReset,
  exponentialBackoff,
  AnthropicApiError,
} from '../../src/core/anthropic-http-client.js';

describe('anthropic-http-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseRateLimitHeaders', () => {
    it('parses all 13 rate limit headers', () => {
      const headers = new Headers({
        'retry-after': '30',
        'anthropic-ratelimit-requests-limit': '100',
        'anthropic-ratelimit-requests-remaining': '50',
        'anthropic-ratelimit-requests-reset': '2026-04-15T12:00:00Z',
        'anthropic-ratelimit-input-tokens-limit': '1000000',
        'anthropic-ratelimit-input-tokens-remaining': '500000',
        'anthropic-ratelimit-input-tokens-reset': '2026-04-15T12:05:00Z',
        'anthropic-ratelimit-output-tokens-limit': '200000',
        'anthropic-ratelimit-output-tokens-remaining': '100000',
        'anthropic-ratelimit-output-tokens-reset': '2026-04-15T12:10:00Z',
        'anthropic-ratelimit-tokens-limit': '1200000',
        'anthropic-ratelimit-tokens-remaining': '600000',
        'anthropic-ratelimit-tokens-reset': '2026-04-15T12:15:00Z',
      });

      const state = parseRateLimitHeaders(headers);
      expect(state.retryAfter).toBe(30);
      expect(state.requestsLimit).toBe(100);
      expect(state.requestsRemaining).toBe(50);
      expect(state.inputTokensLimit).toBe(1_000_000);
      expect(state.inputTokensRemaining).toBe(500_000);
      expect(state.outputTokensLimit).toBe(200_000);
      expect(state.tokensLimit).toBe(1_200_000);
    });

    it('handles missing headers (returns null)', () => {
      const headers = new Headers({});
      const state = parseRateLimitHeaders(headers);
      expect(state.retryAfter).toBeNull();
      expect(state.requestsLimit).toBeNull();
      expect(state.inputTokensRemaining).toBeNull();
    });

    it('parses partial headers', () => {
      const headers = new Headers({
        'anthropic-ratelimit-requests-remaining': '5',
      });
      const state = parseRateLimitHeaders(headers);
      expect(state.requestsRemaining).toBe(5);
      expect(state.inputTokensRemaining).toBeNull();
    });
  });

  describe('countTokens', () => {
    it('calls count_tokens endpoint with correct URL and headers', async () => {
      const mockFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'anthropic-ratelimit-requests-remaining': '99' }),
        json: async () => ({ input_tokens: 1234 }),
      }));
      vi.stubGlobal('fetch', mockFetch);

      const result = await countTokens('sk-ant-test', {
        model: 'claude-opus-4-6',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.input_tokens).toBe(1234);
      expect(result.rateLimits.requestsRemaining).toBe(99);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs?.[0]).toContain('/v1/messages/count_tokens');
      expect(callArgs?.[1]?.method).toBe('POST');
      expect(callArgs?.[1]?.headers).toMatchObject({
        'x-api-key': 'sk-ant-test',
        'anthropic-version': '2023-06-01',
      });
    });

    it('throws AnthropicApiError on 429', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers({ 'retry-after': '60' }),
          json: async () => ({ error: 'rate_limited' }),
        })),
      );

      try {
        await countTokens('sk-ant-test', {
          model: 'claude-opus-4-6',
          messages: [{ role: 'user', content: 'Hello' }],
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AnthropicApiError);
        const apiErr = err as AnthropicApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.isRateLimited).toBe(true);
        expect(apiErr.rateLimits?.retryAfter).toBe(60);
      }
    });

    it('throws AnthropicApiError on 500', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          headers: new Headers({}),
          json: async () => ({ error: 'internal_error' }),
        })),
      );

      await expect(
        countTokens('sk-ant-test', {
          model: 'claude-opus-4-6',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(AnthropicApiError);
    });
  });

  describe('computeBackoff', () => {
    it('returns retry-after when present', () => {
      const state = parseRateLimitHeaders(new Headers({ 'retry-after': '45' }));
      expect(computeBackoff(state, 1000)).toBe(45);
    });

    it('returns wait when RPM exhausted', () => {
      const state = parseRateLimitHeaders(
        new Headers({
          'anthropic-ratelimit-requests-remaining': '1',
        }),
      );
      expect(computeBackoff(state, 1000)).toBeGreaterThan(0);
    });

    it('returns wait when ITPM near estimated task size', () => {
      const state = parseRateLimitHeaders(
        new Headers({
          'anthropic-ratelimit-input-tokens-remaining': '500',
        }),
      );
      // Estimated 1000 tokens needed, only 500 remaining — backoff
      expect(computeBackoff(state, 1000)).toBeGreaterThan(0);
    });

    it('returns 0 when plenty of quota remaining', () => {
      const state = parseRateLimitHeaders(
        new Headers({
          'anthropic-ratelimit-requests-remaining': '100',
          'anthropic-ratelimit-input-tokens-remaining': '1000000',
        }),
      );
      expect(computeBackoff(state, 1000)).toBe(0);
    });
  });

  describe('timeUntilReset', () => {
    it('returns seconds until future time', () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const secs = timeUntilReset(future);
      expect(secs).toBeGreaterThan(55);
      expect(secs).toBeLessThanOrEqual(60);
    });

    it('returns 0 for past time', () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      expect(timeUntilReset(past)).toBe(0);
    });

    it('returns 0 for invalid time', () => {
      expect(timeUntilReset('not-a-date')).toBe(0);
    });
  });

  describe('exponentialBackoff', () => {
    it('follows 5s, 20s, 80s, 320s schedule', () => {
      expect(exponentialBackoff(0)).toBe(5);
      expect(exponentialBackoff(1)).toBe(20);
      expect(exponentialBackoff(2)).toBe(80);
      expect(exponentialBackoff(3)).toBe(320);
    });

    it('caps at 600s (10 minutes)', () => {
      expect(exponentialBackoff(10)).toBe(600);
    });

    it('supports custom base', () => {
      expect(exponentialBackoff(0, 2)).toBe(2);
      expect(exponentialBackoff(1, 2)).toBe(8);
    });
  });
});
