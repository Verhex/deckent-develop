// ─── ApprovalExpiryDriver tests (APR-EXPIRY-DRIVER, task 354-013) ────────────
// Faithful behavior tests for the lifecycle-safe TTL-sweep + prune driver:
// real ApprovalBroker/ApprovalStore wiring (fake-clock, not mocked methods)
// for tick() correctness, plus a real-timer unref proof (ADR-G-013) and
// fail-soft/idempotency guarantees for start()/stop().
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalExpiryDriver } from '../../src/core/approval-expiry-driver.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalStore } from '../../src/core/approval-store.js';

const CREATED_AT = '2026-07-01T21:00:00.000Z';

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-354-013' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-354',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: '2026-07-01T21:15:00.000Z',
    ...overrides,
  };
}

let projectRoot: string;
let storeDir: string;
let broker: ApprovalBroker;
let store: ApprovalStore;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'approval-expiry-driver-'));
  storeDir = join(projectRoot, 'approvals');
  broker = new ApprovalBroker(projectRoot, { storeDir });
  store = new ApprovalStore(projectRoot, { storeDir });
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

// ─── tick() — real broker/store wiring, fake clock ───────────────────────────

describe('ApprovalExpiryDriver.tick', () => {
  it('TTL-expires a due-pending request via broker.expire, visible in store after tick', () => {
    broker.submit(buildRequest('apr-due', { expiresAt: '2026-07-01T21:10:00.000Z' }));

    let now = new Date('2026-07-01T21:20:00.000Z');
    const driver = new ApprovalExpiryDriver({ broker, store, clock: () => now });

    driver.tick();

    const snapshot = store.load();
    expect(snapshot.expired.map((e) => e.request.id)).toEqual(['apr-due']);
    expect(snapshot.expired[0]!.decision?.channel).toBe('ttl-expire');
  });

  it('leaves a not-yet-due pending request untouched', () => {
    broker.submit(buildRequest('apr-not-due', { expiresAt: '2099-01-01T00:00:00.000Z' }));

    const now = new Date('2026-07-01T21:20:00.000Z');
    const driver = new ApprovalExpiryDriver({ broker, store, clock: () => now });

    driver.tick();

    const snapshot = store.load();
    expect(snapshot.pending.map((e) => e.request.id)).toEqual(['apr-not-due']);
  });

  it('prunes a decided entry older than pruneOlderThanMs', () => {
    const req = broker.submit(buildRequest('apr-old-decided'));
    broker.decide(req.id, {
      decision: 'allow',
      decidedBy: 'a',
      channel: 'cli',
      decidedAt: '2026-06-01T00:00:00.000Z',
    });

    // now = 2026-07-08 → 7-day default retention cutoff = 2026-07-01, well
    // after the 2026-06-01 decidedAt above, so it must be pruned.
    const now = new Date('2026-07-08T00:00:00.000Z');
    const driver = new ApprovalExpiryDriver({ broker, store, clock: () => now });

    driver.tick();

    expect(existsSync(join(storeDir, `${req.id}.request.json`))).toBe(false);
    expect(existsSync(join(storeDir, `${req.id}.decision.json`))).toBe(false);
  });

  it('respects a custom pruneOlderThanMs', () => {
    const req = broker.submit(buildRequest('apr-custom-retention'));
    broker.decide(req.id, {
      decision: 'allow',
      decidedBy: 'a',
      channel: 'cli',
      decidedAt: '2026-07-01T00:00:00.000Z',
    });

    const now = new Date('2026-07-01T01:00:00.000Z');
    const driver = new ApprovalExpiryDriver({
      broker,
      store,
      clock: () => now,
      pruneOlderThanMs: 30 * 60 * 1000, // 30 minutes — decidedAt is 1h old
    });

    driver.tick();

    expect(existsSync(join(storeDir, `${req.id}.request.json`))).toBe(false);
  });

  it('re-indexes the store so a just-expired request is not immediately pruned', () => {
    // decidedAt (== tick's `now`) is fresh, so even though it is now categorized
    // 'expired', the 7-day default retention window means prune() must leave it.
    broker.submit(buildRequest('apr-fresh-expire', { expiresAt: '2026-07-01T21:10:00.000Z' }));

    const now = new Date('2026-07-01T21:20:00.000Z');
    const driver = new ApprovalExpiryDriver({ broker, store, clock: () => now });

    driver.tick();

    expect(existsSync(join(storeDir, 'apr-fresh-expire.request.json'))).toBe(true);
  });

  it('is fail-soft: a throwing broker/store does not throw and reports via onTickError', () => {
    const throwingBroker = {
      expire: () => {
        throw new Error('boom');
      },
    } as unknown as ApprovalBroker;
    const onTickError = vi.fn();

    const driver = new ApprovalExpiryDriver({ broker: throwingBroker, store, onTickError });

    expect(() => driver.tick()).not.toThrow();
    expect(onTickError).toHaveBeenCalledOnce();
    expect(onTickError.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('defaults to console.error when onTickError is not supplied', () => {
    const throwingStore = {
      index: () => {
        throw new Error('index boom');
      },
    } as unknown as ApprovalStore;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const driver = new ApprovalExpiryDriver({ broker, store: throwingStore });
    expect(() => driver.tick()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledOnce();

    errorSpy.mockRestore();
  });
});

// ─── start/stop lifecycle — real timers (ADR-G-013 unref proof) ─────────────

describe('ApprovalExpiryDriver.start/stop', () => {
  it('running is false before start()', () => {
    const driver = new ApprovalExpiryDriver({ broker, store });
    expect(driver.running).toBe(false);
  });

  it('start() creates an unref\'d interval (hasRef === false)', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const driver = new ApprovalExpiryDriver({ broker, store });

    driver.start(60_000);

    expect(driver.running).toBe(true);
    const result = setIntervalSpy.mock.results.at(-1);
    expect(result?.type).toBe('return');
    const timer = result!.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);

    driver.stop();
    setIntervalSpy.mockRestore();
  });

  it('start() is a no-op when already running (single setInterval call)', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    const driver = new ApprovalExpiryDriver({ broker, store });

    driver.start(60_000);
    driver.start(60_000);

    expect(setIntervalSpy).toHaveBeenCalledOnce();

    driver.stop();
    setIntervalSpy.mockRestore();
  });

  it('stop() clears the interval and is idempotent', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const driver = new ApprovalExpiryDriver({ broker, store });

    driver.start(60_000);
    driver.stop();
    expect(driver.running).toBe(false);
    expect(clearIntervalSpy).toHaveBeenCalledOnce();

    // Idempotent — calling again must not throw or clear a second time.
    driver.stop();
    expect(clearIntervalSpy).toHaveBeenCalledOnce();

    clearIntervalSpy.mockRestore();
  });

  it('stop() before any start() is a no-op (does not throw)', () => {
    const driver = new ApprovalExpiryDriver({ broker, store });
    expect(() => driver.stop()).not.toThrow();
    expect(driver.running).toBe(false);
  });

  it('tick() runs periodically once started (fake timers, injected clock)', () => {
    vi.useFakeTimers();
    try {
      broker.submit(buildRequest('apr-periodic', { expiresAt: '2026-07-01T21:10:00.000Z' }));

      const now = new Date('2026-07-01T21:20:00.000Z');
      const driver = new ApprovalExpiryDriver({ broker, store, clock: () => now });

      driver.start(1_000);
      expect(existsSync(join(storeDir, 'apr-periodic.decision.json'))).toBe(false);

      vi.advanceTimersByTime(1_000);

      expect(store.load().expired.map((e) => e.request.id)).toEqual(['apr-periodic']);

      driver.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
