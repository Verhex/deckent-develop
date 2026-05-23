/**
 * Subfolder E2E helper for Sprint 190 Task 015 — rate-limit / auth / SSE.
 *
 * This thin facade re-exports the canonical helpers from
 * `../test-server-helper.ts` and adds two convenience utilities specifically
 * tailored to the new test files:
 *
 *   - `readSseEvents(handle, count, timeoutMs)` reads N delimited SSE events
 *     instead of just the first chunk.
 *   - `fireMany(handle, path, n, init?)` fires N sequential requests, which
 *     is the cleanest way to exercise the token-bucket rate limiter without
 *     racing the event loop.
 *
 * Keeping these in a small file avoids touching the legacy
 * `test-server-helper.ts` (which lives outside this fix-task's write scope).
 */

export {
  startTestServer,
  call,
  readFirstSseEvent,
  buildDashboardSeed,
  buildSprintMarkdown,
  pathExists,
  type TestServerHandle,
  type TestServerOptions,
  type SeedData,
  type FetchResult,
} from '../test-server-helper.js';

import type { TestServerHandle, FetchResult } from '../test-server-helper.js';
import { call } from '../test-server-helper.js';

/**
 * Read up to `count` SSE events from a stream, then close the connection.
 *
 * Each entry in the returned array corresponds to one SSE event (everything
 * before the blank-line delimiter). Useful when a test wants to confirm both
 * the initial `retry:` directive and a subsequent `data:` payload.
 */
export async function readSseEvents(
  handle: TestServerHandle,
  count: number,
  timeoutMs = 2000,
  path = '/api/events',
): Promise<{ status: number; events: string[]; headers: Headers }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${handle.baseUrl}${path}`, {
      headers: { ...handle.authHeaders, Accept: 'text/event-stream' },
      signal: controller.signal,
    });

    if (!res.body) {
      return { status: res.status, events: [], headers: res.headers };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const events: string[] = [];

    while (events.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // SSE events are separated by a blank line (\n\n).
      let delim = buf.indexOf('\n\n');
      while (delim !== -1 && events.length < count) {
        events.push(buf.slice(0, delim));
        buf = buf.slice(delim + 2);
        delim = buf.indexOf('\n\n');
      }
    }

    return { status: res.status, events, headers: res.headers };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/**
 * Fire `n` sequential requests against `path` and collect responses.
 *
 * Sequential (not Promise.all) so the rate-limiter sees a deterministic
 * arrival order — the n-th request must be the one that crosses the bucket
 * boundary. Parallel firing can flake when two requests interleave inside
 * the limiter's `check()` call.
 */
export async function fireMany(
  handle: TestServerHandle,
  path: string,
  n: number,
  init: RequestInit = {},
): Promise<FetchResult[]> {
  const out: FetchResult[] = [];
  for (let i = 0; i < n; i++) {
    out.push(await call(handle, path, init));
  }
  return out;
}
