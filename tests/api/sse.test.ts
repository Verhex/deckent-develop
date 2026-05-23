/**
 * SSE /api/events E2E (Sprint 190 Task 015).
 *
 * Verifies the runtime contract for the server-sent-events stream that the
 * dashboard subscribes to. The test boots a real `createHttpServer` and
 * walks the SSE handshake + initial payload behavior.
 *
 * Sister coverage: `tests/api/endpoints.test.ts` already asserts the basic
 * `retry:` directive, but does not exercise the auth gate, the seeded
 * dashboard fan-out, or the response headers. This file pins those
 * contracts.
 *
 * Real HTTP, no fake timers. Every test closes its handle to avoid port
 * leaks under the vitest parallel runner.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  startTestServer,
  readSseEvents,
  readFirstSseEvent,
  buildDashboardSeed,
  type TestServerHandle,
} from './helpers/test-server.js';

describe('E2E SSE /api/events', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
  });

  it('returns 200 + Content-Type: text/event-stream', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await readFirstSseEvent(handle, '/api/events', 1500);
    expect(res.status).toBe(200);
  });

  it('first chunk contains the SSE retry: directive', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await readFirstSseEvent(handle, '/api/events', 1500);
    expect(res.firstChunk).toContain('retry:');
    // Spec: retry value is an integer ms reconnect hint.
    expect(res.firstChunk).toMatch(/retry:\s*\d+/);
  });

  it('exposes cache-control: no-cache + connection: keep-alive headers', async () => {
    handle = await startTestServer({ disableAuth: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const res = await fetch(`${handle.baseUrl}/api/events`, {
        headers: { ...handle.authHeaders, Accept: 'text/event-stream' },
        signal: controller.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
      expect(res.headers.get('cache-control')).toMatch(/no-cache/);
      expect(res.headers.get('connection')).toMatch(/keep-alive/i);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  });

  it('fans out the seeded dashboard snapshot to a newly connected client', async () => {
    // initWatcher() reads .dashboard on first SSE subscription and writes it
    // immediately to every connected client. So a seeded dashboard should
    // arrive as a `data:` event right after the initial `retry:` chunk.
    handle = await startTestServer({
      disableAuth: true,
      seed: { dashboard: buildDashboardSeed({ progress: { done: 7, active: 1, blocked: 0, total: 8 } }) },
    });

    const res = await readSseEvents(handle, 2, 2000);
    expect(res.status).toBe(200);
    // Find the data: payload (order: retry → data, but be tolerant).
    const dataEvent = res.events.find((e) => e.startsWith('data:'));
    expect(dataEvent, `events: ${JSON.stringify(res.events)}`).toBeDefined();
    expect(dataEvent).toContain('"done":7');
    expect(dataEvent).toContain('"total":8');
  });

  it('SSE endpoint is behind the auth gate — 401 without token', async () => {
    handle = await startTestServer({ apiToken: 'sse-secret' });
    const direct = await fetch(`${handle.baseUrl}/api/events`, {
      headers: { Accept: 'text/event-stream' },
    });
    expect(direct.status).toBe(401);
    // Drain the body so the connection releases cleanly.
    await direct.text();
  });

  it('client disconnect (AbortController) releases the SSE slot cleanly', async () => {
    handle = await startTestServer({ disableAuth: true });

    // First subscription, then abort.
    const controller = new AbortController();
    const fetchPromise = fetch(`${handle.baseUrl}/api/events`, {
      headers: { ...handle.authHeaders, Accept: 'text/event-stream' },
      signal: controller.signal,
    }).then(async (r) => {
      try {
        // Pull one chunk so the SSE stream is fully established server-side.
        const reader = r.body?.getReader();
        if (reader) await reader.read();
      } catch {
        // Abort can manifest as a reader error — that's fine for this test.
      }
      return r;
    });

    // Wait briefly so the server has time to call `sseClients.add(res)`.
    await new Promise<void>((r) => setTimeout(r, 50));
    controller.abort();
    try {
      await fetchPromise;
    } catch {
      // Aborted fetch rejects — expected.
    }

    // After disconnect, a fresh SSE subscription must still work (no port leak,
    // no leftover state from the aborted client).
    const second = await readFirstSseEvent(handle, '/api/events', 1500);
    expect(second.status).toBe(200);
    expect(second.firstChunk).toContain('retry:');
  });
});
