/**
 * Rate limiter E2E (Sprint 190 Task 015).
 *
 * Exercises the token-bucket rate limiter that wraps every `/api/*` route
 * inside `createHttpServer`. Sister coverage to
 * `tests/api/rate-limiter.test.ts` (unit tests against the `RateLimiter`
 * class directly) — this file verifies the runtime wire-up: that exceeding
 * the bucket triggers a real 429 response, that the limiter scopes only to
 * `/api/*` routes, and that `rateLimit: 0` disables the limiter entirely.
 *
 * Real HTTP only: no `node:fs` mocks, no fake timers. Cleanup is mandatory
 * (`afterEach`) to avoid port leaks under vitest's parallel runner.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  startTestServer,
  call,
  fireMany,
  type TestServerHandle,
} from './helpers/test-server.js';

describe('E2E rate-limit gate', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('allows requests up to the configured maxRequests', async () => {
    handle = await startTestServer({ disableAuth: true, rateLimit: 5 });
    const responses = await fireMany(handle, '/api/status', 5);
    for (const [i, res] of responses.entries()) {
      expect(res.status, `request ${i + 1}`).toBe(200);
    }
  });

  it('returns 429 with JSON error body on the bucket-overflow request', async () => {
    handle = await startTestServer({ disableAuth: true, rateLimit: 3 });
    // Burn the bucket.
    await fireMany(handle, '/api/status', 3);

    // 4th request crosses the bucket boundary.
    const limited = await call(handle, '/api/status');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('content-type')).toMatch(/application\/json/);
    const body = limited.json<{ error: string }>();
    expect(body.error).toMatch(/too many/i);
  });

  it('keeps blocking subsequent requests after the first 429 (sticky in same window)', async () => {
    handle = await startTestServer({ disableAuth: true, rateLimit: 2 });
    await fireMany(handle, '/api/status', 2);

    const first = await call(handle, '/api/status');
    const second = await call(handle, '/api/status');
    expect(first.status).toBe(429);
    expect(second.status).toBe(429);
  });

  it('rate-limiter only scopes /api/* routes — /health stays open', async () => {
    handle = await startTestServer({ disableAuth: true, rateLimit: 1 });
    // First /api/* request consumes the bucket.
    expect((await call(handle, '/api/status')).status).toBe(200);
    // Second /api/* request is blocked.
    expect((await call(handle, '/api/status')).status).toBe(429);

    // /health (no /api prefix) is never counted, even after blocking.
    const health = await call(handle, '/health');
    expect(health.status).toBe(200);
    const second = await call(handle, '/health');
    expect(second.status).toBe(200);
  });

  it('rateLimit: 0 disables the limiter entirely', async () => {
    handle = await startTestServer({ disableAuth: true, rateLimit: 0 });
    // Issue many requests — none should be blocked.
    const responses = await fireMany(handle, '/api/status', 10);
    for (const [i, res] of responses.entries()) {
      expect(res.status, `request ${i + 1}`).toBe(200);
    }
  });

  it('429 response carries strict security headers (no leaks)', async () => {
    handle = await startTestServer({ disableAuth: true, rateLimit: 1 });
    await call(handle, '/api/status');
    const limited = await call(handle, '/api/status');
    expect(limited.status).toBe(429);
    expect(limited.headers.get('x-content-type-options')).toBe('nosniff');
    expect(limited.headers.get('x-frame-options')).toBe('DENY');
  });
});
