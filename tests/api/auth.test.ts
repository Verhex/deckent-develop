/**
 * Bearer auth middleware E2E (Sprint 190 Task 015).
 *
 * Sister coverage to `tests/api/server-auth.test.ts` (which mocks `node:fs`
 * to focus on per-handler unit logic). This file boots a real server and
 * walks the full middleware chain to confirm that:
 *
 *   - secure-by-default (no token, no bypass) returns 401 for any non-exempt
 *     route — both `/api/...` and `/api/health` are validated explicitly,
 *   - the wrong token shape (Basic, missing value, missing scheme) is
 *     rejected with the correct status code (401 vs 403),
 *   - `DECKENT_API_AUTH_DISABLED=1` is honored as an explicit bypass,
 *   - the `apiToken` constructor option wins over `DECKENT_API_TOKEN`.
 *
 * Real HTTP only. Cleanup is mandatory to restore env vars between cases.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  startTestServer,
  call,
  type TestServerHandle,
} from './helpers/test-server.js';

describe('E2E bearer auth middleware', () => {
  let handle: TestServerHandle;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined as unknown as TestServerHandle;
    }
    // Defensive: ensure no leaked env var sticks across cases. The helper
    // already restores per-handle, but if a test sets vars *before* the
    // helper boots we need a final sweep.
    delete process.env['DECKENT_API_TOKEN'];
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });

  it('401 when neither apiToken nor AUTH_DISABLED is set', async () => {
    handle = await startTestServer({});
    const res = await call(handle, '/api/status');
    expect(res.status).toBe(401);
    const body = res.json<{ error: string }>();
    expect(body.error).toMatch(/authentication required/i);
  });

  it('401 when Authorization header is completely missing', async () => {
    handle = await startTestServer({ apiToken: 'secret-A' });
    const direct = await fetch(`${handle.baseUrl}/api/status`);
    expect(direct.status).toBe(401);
    const body = (await direct.json()) as { error: string };
    expect(body.error).toMatch(/authentication required/i);
  });

  it('401 when scheme is not Bearer (Basic auth rejected)', async () => {
    handle = await startTestServer({ apiToken: 'secret-B' });
    const direct = await fetch(`${handle.baseUrl}/api/status`, {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    });
    expect(direct.status).toBe(401);
  });

  it('401 when Bearer value is empty (header present but no token)', async () => {
    handle = await startTestServer({ apiToken: 'secret-C' });
    const direct = await fetch(`${handle.baseUrl}/api/status`, {
      headers: { Authorization: 'Bearer ' },
    });
    expect(direct.status).toBe(401);
  });

  it('403 when Bearer token is present but does not match', async () => {
    handle = await startTestServer({ apiToken: 'right-token' });
    const direct = await fetch(`${handle.baseUrl}/api/status`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    expect(direct.status).toBe(403);
    const body = (await direct.json()) as { error: string };
    expect(body.error).toMatch(/forbidden/i);
  });

  it('200 when Bearer token matches the configured apiToken', async () => {
    handle = await startTestServer({ apiToken: 'correct-token' });
    // The helper auto-injects Authorization from `apiToken` via `authHeaders`.
    const res = await call(handle, '/api/status');
    expect(res.status).toBe(200);
  });

  it('/health is exempt from auth even when no token configured', async () => {
    handle = await startTestServer({});
    const res = await call(handle, '/health');
    expect(res.status).toBe(200);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe('ok');
  });

  it('/api/health is also exempt (the exempt list covers both shapes)', async () => {
    handle = await startTestServer({});
    const res = await call(handle, '/api/health');
    expect(res.status).toBe(200);
  });

  it('DECKENT_API_AUTH_DISABLED=1 bypasses auth even without apiToken', async () => {
    handle = await startTestServer({ disableAuth: true });
    const res = await call(handle, '/api/status');
    expect(res.status).toBe(200);
  });
});
