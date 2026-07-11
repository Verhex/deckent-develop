/**
 * Wire test for the approval TTL-expiry + retention-prune driver
 * (404-004 APPROVAL-EXPIRY-DRIVER, born-631).
 *
 * RED (before this task): `grep -rn "ApprovalExpiryDriver" src/api/server.ts`
 * returned 0 matches — `src/core/approval-expiry-driver.ts` existed with zero
 * production callers. Without a live sweep, `ApprovalStore.prune()` can never
 * clean up a TTL-expired-but-undecided entry: `prune()` only removes entries
 * that already carry a `decision.decidedAt` (approval-store.ts), and that
 * decision file is only ever written by `ApprovalBroker.expire()`. This suite
 * proves: (a) server.ts is now actually wired (composition-pin, source-text
 * grep so a future accidental revert is caught even before running anything),
 * (b) the composed driver is live + unref'd + disposed on close(), and (c) the
 * `approval.expiry_sweep_ms` config triplet (explicit override > config file >
 * hardcoded default) actually drives a real sweep end-to-end.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpServer, type HttpApi } from '../../src/api/server.js';
import type { ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalStore } from '../../src/core/approval-store.js';

function buildExpiredRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'worker', instanceId: 'w-404-004' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-404',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    // Both timestamps are already in the past (only constraint is
    // expiresAt > createdAt) — the request is overdue the instant it is
    // submitted, no fake clock / real-time wait needed to make it eligible.
    createdAt: '2020-01-01T00:00:00.000Z',
    expiresAt: '2020-01-01T00:00:01.000Z',
    ...overrides,
  };
}

let tmpRoot: string;
let api: HttpApi | undefined;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-approval-expiry-wire-'));
});

afterEach(async () => {
  if (api) {
    await api.close();
    api = undefined;
  }
  rmSync(tmpRoot, { recursive: true, force: true });
});

function writeProjectConfig(cfg: Record<string, unknown>): void {
  mkdirSync(join(tmpRoot, '.deckent'), { recursive: true });
  writeFileSync(join(tmpRoot, '.deckent', 'config.json'), JSON.stringify(cfg), 'utf-8');
}

function decisionFilePath(requestId: string): string {
  return join(tmpRoot, '.deckent', 'approvals', `${requestId}.decision.json`);
}

describe('composition-pin: ApprovalExpiryDriver is wired into server.ts (404-004)', () => {
  it('server.ts source constructs, starts, and stops the driver (RED->GREEN grep-proof)', () => {
    const source = readFileSync(join(process.cwd(), 'src/api/server.ts'), 'utf-8');
    expect(source).toMatch(/new ApprovalExpiryDriver\(/);
    expect(source).toMatch(/approvalExpiryDriver\.start\(/);
    expect(source).toMatch(/approvalExpiryDriver\?\.stop\(\)/);
  });
});

describe('server-start creates a live driver (lifecycle)', () => {
  it('driver.running is true immediately after createHttpServer()', () => {
    api = createHttpServer(tmpRoot, { port: 0 });
    expect(api.approvalExpiryDriver?.running).toBe(true);
  });

  it('close() stops the driver — no lingering sweep after shutdown', async () => {
    api = createHttpServer(tmpRoot, { port: 0 });
    const driver = api.approvalExpiryDriver!;
    expect(driver.running).toBe(true);
    await api.close();
    expect(driver.running).toBe(false);
    api = undefined; // already closed — afterEach must not double-close
  });
});

describe('the composed sweep timer does not pin the event loop (ADR-G-013 / MOAT-2)', () => {
  it('the setInterval call driven by approvalExpirySweepMs returns an unref\'d timer', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    // A distinctive interval value lets this test find ITS call among the
    // other setInterval calls createHttpServer makes (e.g. the terminal idle
    // reaper's fixed 30_000ms) without depending on call order.
    const DISTINCTIVE_MS = 987_654;
    api = createHttpServer(tmpRoot, { port: 0, approvalExpirySweepMs: DISTINCTIVE_MS });

    const call = setIntervalSpy.mock.calls.find((c) => c[1] === DISTINCTIVE_MS);
    expect(call).toBeDefined();
    const result = setIntervalSpy.mock.results[setIntervalSpy.mock.calls.indexOf(call!)];
    expect(result?.type).toBe('return');
    const timer = result!.value as NodeJS.Timeout;
    expect(timer.hasRef()).toBe(false);

    setIntervalSpy.mockRestore();
  });
});

describe('approval.expiry_sweep_ms config triplet (explicit > config-file > default)', () => {
  it('config-absent: falls back to the hardcoded default (byte-identical, no regression)', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    api = createHttpServer(tmpRoot, { port: 0 });
    const call = setIntervalSpy.mock.calls.find((c) => c[1] === 60_000);
    expect(call).toBeDefined();
    setIntervalSpy.mockRestore();
  });

  it('approval.expiry_sweep_ms from config.json drives the real interval', () => {
    writeProjectConfig({ approval: { expiry_sweep_ms: 45_000 } });
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    api = createHttpServer(tmpRoot, { port: 0 });
    const call = setIntervalSpy.mock.calls.find((c) => c[1] === 45_000);
    expect(call).toBeDefined();
    setIntervalSpy.mockRestore();
  });

  it('an explicit opts.approvalExpirySweepMs always wins over config.json', () => {
    writeProjectConfig({ approval: { expiry_sweep_ms: 45_000 } });
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    api = createHttpServer(tmpRoot, { port: 0, approvalExpirySweepMs: 12_345 });
    expect(setIntervalSpy.mock.calls.find((c) => c[1] === 12_345)).toBeDefined();
    expect(setIntervalSpy.mock.calls.find((c) => c[1] === 45_000)).toBeUndefined();
    setIntervalSpy.mockRestore();
  });

  it('a non-numeric/invalid approval.expiry_sweep_ms is ignored, falling back to default', () => {
    writeProjectConfig({ approval: { expiry_sweep_ms: 'not-a-number' } });
    const setIntervalSpy = vi.spyOn(global, 'setInterval');
    api = createHttpServer(tmpRoot, { port: 0 });
    expect(setIntervalSpy.mock.calls.find((c) => c[1] === 60_000)).toBeDefined();
    setIntervalSpy.mockRestore();
  });
});

describe('live roundtrip: the composed driver actually sweeps an expired pending', () => {
  it('an already-expired request submitted through api.approvalBroker gets swept to a ttl-expire decision on disk', async () => {
    writeProjectConfig({ approval: { expiry_sweep_ms: 20 } });
    api = createHttpServer(tmpRoot, { port: 0 });

    const broker = api.approvalBroker!;
    broker.submit(buildExpiredRequest('apr-404-004-expired'));

    // Before any tick: nothing has swept it yet — the decision file the
    // driver's expire() would produce does not exist (this is the RED
    // condition this task fixes: without a live driver this stays true
    // forever, and ApprovalStore.prune() can never reclaim the entry).
    expect(existsSync(decisionFilePath('apr-404-004-expired'))).toBe(false);

    // The configured 20ms sweep fires at least once within this window.
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(existsSync(decisionFilePath('apr-404-004-expired'))).toBe(true);
    const decision = JSON.parse(readFileSync(decisionFilePath('apr-404-004-expired'), 'utf-8')) as {
      channel: string;
      decidedBy: string;
    };
    expect(decision.channel).toBe('ttl-expire');
    expect(decision.decidedBy).toBe('system');

    // A fresh, independent ApprovalStore instance (same pattern GET
    // /api/approvals uses) now categorizes the entry as expired.
    const freshStore = new ApprovalStore(tmpRoot);
    const snapshot = freshStore.load();
    expect(snapshot.expired.some((e) => e.request.id === 'apr-404-004-expired')).toBe(true);
    expect(snapshot.pending.some((e) => e.request.id === 'apr-404-004-expired')).toBe(false);
  });

  it('a request submitted directly to disk (not through api.approvalBroker) is left alone — documents the single-broker-instance scope of this wiring', async () => {
    writeProjectConfig({ approval: { expiry_sweep_ms: 20 } });
    api = createHttpServer(tmpRoot, { port: 0 });

    // Bypass api.approvalBroker entirely: a SEPARATE ApprovalBroker instance
    // pointed at the same directory (e.g. simulating a different process).
    const { ApprovalBroker } = await import('../../src/core/approval-broker.js');
    const otherProcessBroker = new ApprovalBroker(tmpRoot);
    otherProcessBroker.submit(buildExpiredRequest('apr-404-004-other-process'));

    await new Promise((resolve) => setTimeout(resolve, 150));

    // ApprovalBroker.expire() only sweeps requests submitted through ITS OWN
    // instance (requestsById is populated solely by submit()) — a request
    // written via a different broker instance is never seen by the server's
    // driver, so no decision file is produced for it. This is pre-existing
    // approval-broker.ts behavior, unrelated to this task's write scope.
    expect(existsSync(decisionFilePath('apr-404-004-other-process'))).toBe(false);
  });
});
