/**
 * Sprint 365 Task 365-006 — GET /api/limits (DASH-LIMITS-CARD).
 *
 * Tests `registerLimitsRoute` / `buildLimitsResponse` directly (unit),
 * following the fake-req/res pattern from tests/api/auth-me-endpoint.test.ts
 * and the EventEmitter fake-spawn pattern from
 * tests/core/limit-preflight.test.ts. The route is NOT wired into server.ts
 * yet (see src/api/limits-endpoint.ts header) so no startTestServer/HTTP
 * round-trip is used here — the handler is exercised directly.
 */
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import http from 'node:http';
import { describe, it, expect } from 'vitest';
import {
  registerLimitsRoute,
  buildLimitsResponse,
  type LimitsResponse,
} from '../../src/api/limits-endpoint.js';
import type {
  SpawnImpl,
  SpawnedProcessLike,
  SubscriptionLimitProbe,
} from '../../src/core/limit-preflight.js';
import { DEFAULT_LIMIT_GATE_THRESHOLDS } from '../../src/core/limit-preflight.js';

// ─── Hermetic spawn mock (mirrors tests/core/limit-preflight.test.ts) ──────

interface CannedResult {
  code?: number | null;
  stdout?: string;
  error?: Error;
}

function makeUsageSpawn(result: CannedResult): SpawnImpl {
  return ((_command: string, _args: string[]) => {
    const child = new EventEmitter() as EventEmitter & SpawnedProcessLike;
    child.stdout = Readable.from([result.stdout ?? '']);
    child.stderr = Readable.from(['']);
    child.kill = () => true;
    process.nextTick(() => {
      if (result.error) {
        child.emit('error', result.error);
      } else {
        child.emit('close', result.code ?? 0, null);
      }
    });
    return child;
  }) as SpawnImpl;
}

// ─── Fake ServerResponse (mirrors tests/api/auth-me-endpoint.test.ts) ──────

function fakeRes(): { res: http.ServerResponse; status: () => number; json: () => unknown } {
  let writtenStatus = 200;
  let writtenBody = '';
  const res = {
    writeHead: (status: number) => {
      writtenStatus = status;
    },
    end: (body: string) => {
      writtenBody = body;
    },
  } as unknown as http.ServerResponse;
  return {
    res,
    status: () => writtenStatus,
    json: () => JSON.parse(writtenBody) as unknown,
  };
}

// ─── Fixtures (mirror tests/core/limit-preflight.test.ts) ─────────────────

const FULL_FIXTURE =
  'Current session: 81% used · resets Jul 2, 8:30pm (Europe/Istanbul)\n' +
  'Current week (all models): 31% used · resets Jul 6, 12:00am (Europe/Istanbul)\n' +
  'Current week (Fable): 26% used · resets Jul 6, 12:00am (Europe/Istanbul)\n';

const NO_FABLE_FIXTURE =
  'Current session: 12% used · resets Jul 2, 8:30pm (Europe/Istanbul)\n' +
  'Current week (all models): 5% used · resets Jul 6, 12:00am (Europe/Istanbul)\n';

// ─── registerLimitsRoute ────────────────────────────────────────────────────

describe('registerLimitsRoute', () => {
  it('returns false (unhandled) for a non-matching URL', async () => {
    const { res } = fakeRes();
    const handled = await registerLimitsRoute('/api/other', res);
    expect(handled).toBe(false);
  });

  it('GET /api/limits returns 200 with 3 windows for a full probe', async () => {
    const { res, status, json } = fakeRes();
    const spawnImpl = makeUsageSpawn({ code: 0, stdout: FULL_FIXTURE });

    const handled = await registerLimitsRoute('/api/limits', res, { spawnImpl });

    expect(handled).toBe(true);
    expect(status()).toBe(200);
    const body = json() as LimitsResponse;
    expect(body.unavailable).toBe(false);
    expect(body.windows).toHaveLength(3);
    expect(body.windows.map((w) => w.name)).toEqual(['session', 'week_all', 'week_fable']);
    expect(body.windows[0]?.pct).toBe(81);
    expect(body.windows[0]?.resetAt).toEqual({ text: 'Jul 2, 8:30pm', timezone: 'Europe/Istanbul' });
  });

  it('omits the week_fable window when the probe has no Fable line', async () => {
    const { res, json } = fakeRes();
    const spawnImpl = makeUsageSpawn({ code: 0, stdout: NO_FABLE_FIXTURE });

    await registerLimitsRoute('/api/limits', res, { spawnImpl });

    const body = json() as LimitsResponse;
    expect(body.unavailable).toBe(false);
    expect(body.windows).toHaveLength(2);
    expect(body.windows.map((w) => w.name)).toEqual(['session', 'week_all']);
  });

  it('returns { unavailable: true, windows: [] } with HTTP 200 (never 500) when the probe spawn fails', async () => {
    const { res, status, json } = fakeRes();
    const spawnImpl = makeUsageSpawn({ error: new Error('spawn claude ENOENT') });

    await registerLimitsRoute('/api/limits', res, { spawnImpl });

    expect(status()).toBe(200);
    const body = json() as LimitsResponse;
    expect(body.unavailable).toBe(true);
    expect(body.windows).toHaveLength(0);
    expect(typeof body.reason).toBe('string');
  });

  it('returns { unavailable: true, windows: [] } when the CLI output is unparseable', async () => {
    const { res, json } = fakeRes();
    const spawnImpl = makeUsageSpawn({ code: 0, stdout: 'Usage information has moved, see docs.\n' });

    await registerLimitsRoute('/api/limits', res, { spawnImpl });

    const body = json() as LimitsResponse;
    expect(body.unavailable).toBe(true);
    expect(body.windows).toEqual([]);
  });
});

// ─── buildLimitsResponse — verdict boundaries ──────────────────────────────

function makeProbe(overrides: Partial<SubscriptionLimitProbe>): SubscriptionLimitProbe {
  return {
    unavailable: false,
    sessionPct: 0,
    sessionResetAt: null,
    weekAllPct: 0,
    weekAllResetAt: null,
    raw: '',
    ...overrides,
  };
}

describe('buildLimitsResponse — per-window verdict via DEFAULT_LIMIT_GATE_THRESHOLDS', () => {
  it('verdict is "ok" below the warn threshold', () => {
    const probe = makeProbe({ sessionPct: DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct - 1 });
    const result = buildLimitsResponse(probe);
    expect(result.windows[0]?.verdict).toBe('ok');
  });

  it('verdict is "warn" at the warn threshold boundary', () => {
    const probe = makeProbe({ sessionPct: DEFAULT_LIMIT_GATE_THRESHOLDS.warnPct });
    const result = buildLimitsResponse(probe);
    expect(result.windows[0]?.verdict).toBe('warn');
  });

  it('verdict is "block" at the block threshold boundary', () => {
    const probe = makeProbe({ sessionPct: DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct });
    const result = buildLimitsResponse(probe);
    expect(result.windows[0]?.verdict).toBe('block');
  });

  it('week_fable reuses week_all resetAt (probe has no separate Fable reset field)', () => {
    const resetAt = { text: 'Jul 6, 12:00am', timezone: 'Europe/Istanbul' };
    const probe = makeProbe({ weekAllResetAt: resetAt, weekFablePct: 42 });
    const result = buildLimitsResponse(probe);
    const fable = result.windows.find((w) => w.name === 'week_fable');
    expect(fable?.resetAt).toEqual(resetAt);
  });

  it('unavailable probe formats to { unavailable: true, reason, windows: [] }', () => {
    const result = buildLimitsResponse({ unavailable: true, reason: 'CLI output changed', raw: '' });
    expect(result).toEqual({ unavailable: true, reason: 'CLI output changed', windows: [] });
  });
});
