/**
 * Wire test for GET /api/limits + GET /api/evaluate-health (371-002
 * SERVER-WIRE-ENDPOINTS). Both handlers already have their own unit-tested
 * behavior (tests/api/limits-endpoint.test.ts, tests/api/evaluate-health-endpoint.test.ts)
 * -- this test only proves server.ts's route-dispatch chain actually reaches
 * them, mirroring tests/api/approval-history-wire.test.ts (the
 * registerApprovalHistoryRoute precedent this task's server.ts diff mirrors).
 *
 * The two register functions are mocked (tests/api/kill-all-endpoint.test.ts
 * precedent for mocking a server.ts dependency) rather than exercised for
 * real: registerLimitsRoute's production call site shells out to the real
 * `claude` binary by default (no server.ts-level spawn-injection seam is in
 * this task's scope), so a live round-trip would be non-hermetic. Mocking
 * isolates this test to one concern -- did server.ts wire the route --
 * leaving the endpoints' own behavior to their existing suites.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ServerResponse } from 'node:http';

vi.mock('../../src/api/limits-endpoint.js', () => ({
  registerLimitsRoute: vi.fn(async (url: string, res: ServerResponse) => {
    if (url !== '/api/limits') return false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mocked: 'limits' }));
    return true;
  }),
}));

vi.mock('../../src/api/evaluate-health-endpoint.js', () => ({
  registerEvaluateHealthRoute: vi.fn((url: string, res: ServerResponse, projectRoot: string) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (pathname !== '/api/evaluate-health') return false;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ mocked: 'evaluate-health', projectRoot }));
    return true;
  }),
}));

import { startTestServer, call, type TestServerHandle } from './test-server-helper.js';
import { registerLimitsRoute } from '../../src/api/limits-endpoint.js';
import { registerEvaluateHealthRoute } from '../../src/api/evaluate-health-endpoint.js';

const mockRegisterLimitsRoute = vi.mocked(registerLimitsRoute);
const mockRegisterEvaluateHealthRoute = vi.mocked(registerEvaluateHealthRoute);

const TOKEN = 'server-endpoint-wire-371-002';

describe('server.ts route-dispatch wiring: /api/limits + /api/evaluate-health', () => {
  let handle: TestServerHandle | null = null;

  beforeEach(async () => {
    mockRegisterLimitsRoute.mockClear();
    mockRegisterEvaluateHealthRoute.mockClear();
    handle = await startTestServer({ apiToken: TOKEN });
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = null;
    }
  });

  it('GET /api/limits dispatches to registerLimitsRoute', async () => {
    const res = await call(handle!, '/api/limits');
    expect(mockRegisterLimitsRoute).toHaveBeenCalledTimes(1);
    expect(mockRegisterLimitsRoute.mock.calls[0]![0]).toBe('/api/limits');
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ mocked: 'limits' });
  });

  it('GET /api/evaluate-health[?n=] dispatches to registerEvaluateHealthRoute with projectRoot', async () => {
    const res = await call(handle!, '/api/evaluate-health?n=5');
    expect(mockRegisterEvaluateHealthRoute).toHaveBeenCalledTimes(1);
    const callArgs = mockRegisterEvaluateHealthRoute.mock.calls[0]!;
    expect(callArgs[0]).toBe('/api/evaluate-health?n=5');
    expect(callArgs[2]).toBe(handle!.projectRoot);
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ mocked: 'evaluate-health', projectRoot: handle!.projectRoot });
  });

  it('fails closed: 401 without a valid auth token for both new routes (auth middleware chain preserved)', async () => {
    const limitsRes = await fetch(`${handle!.baseUrl}/api/limits`);
    expect(limitsRes.status).toBe(401);
    const healthRes = await fetch(`${handle!.baseUrl}/api/evaluate-health`);
    expect(healthRes.status).toBe(401);
    expect(mockRegisterLimitsRoute).not.toHaveBeenCalled();
    expect(mockRegisterEvaluateHealthRoute).not.toHaveBeenCalled();
  });
});
