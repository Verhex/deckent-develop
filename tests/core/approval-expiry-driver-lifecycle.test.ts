import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalExpiryDriver } from '../../src/core/approval-expiry-driver.js';
import { ApprovalStore } from '../../src/core/approval-store.js';

const roots: string[] = [];

afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function request(id: string): ApprovalRequestInput {
  return {
    id, requester: { role: 'worker', instanceId: 'worker-1' }, summary: 'expiry driver request',
    details: {}, scopeId: 'scope-1', scope: 'shell-exec', risk: 'critical',
    policy: 'require-approval', defaultAction: 'allow', tenantId: 'tenant-1', userId: 'user-1',
    createdAt: '2026-08-21T12:00:00.000Z', expiresAt: '2026-08-21T12:01:00.000Z',
  };
}

describe('ApprovalExpiryDriver lifecycle closure', () => {
  it('runs a startup sweep, emits the durable receipt and never repeats it on a no-op tick', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-expiry-driver-lifecycle-'));
    roots.push(root);
    const storeDir = join(root, 'approvals');
    const now = new Date('2026-08-21T12:01:00.000Z');
    const broker = new ApprovalBroker(root, { storeDir, clock: () => now });
    const store = new ApprovalStore(root, { storeDir, clock: () => now });
    broker.submit(request('driver-startup'));
    const received = vi.fn();
    const driver = new ApprovalExpiryDriver({ broker, store, clock: () => now, onTimeoutReceipt: received });

    driver.start(60_000);
    expect(received).toHaveBeenCalledOnce();
    expect(received).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'driver-startup', actor: 'system:expiry', action: 'deny', replayAllowed: false,
    }));
    expect(driver.tick()).toEqual([]);
    expect(received).toHaveBeenCalledOnce();
    driver.stop();
  });

  it('redelivers a durable timeout receipt once after process restart for idempotent settle-back', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-expiry-driver-restart-'));
    roots.push(root);
    const storeDir = join(root, 'approvals');
    const now = new Date('2026-08-21T12:01:00.000Z');
    const broker = new ApprovalBroker(root, { storeDir, clock: () => now });
    const store = new ApprovalStore(root, { storeDir, clock: () => now });
    broker.submit(request('driver-restart'));
    const firstDelivery = vi.fn();
    const first = new ApprovalExpiryDriver({ broker, store, clock: () => now, onTimeoutReceipt: firstDelivery });
    first.tick();
    expect(firstDelivery).toHaveBeenCalledOnce();

    const restartedDelivery = vi.fn();
    const restarted = new ApprovalExpiryDriver({
      broker: new ApprovalBroker(root, { storeDir, clock: () => now }),
      store: new ApprovalStore(root, { storeDir, clock: () => now }),
      clock: () => now,
      onTimeoutReceipt: restartedDelivery,
    });
    restarted.tick();
    restarted.tick();
    expect(restartedDelivery).toHaveBeenCalledOnce();
    expect(restartedDelivery).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'driver-restart' }));
  });

  it('runs async legacy-origin sweep at startup and exposes graceful in-flight settlement', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-expiry-driver-legacy-'));
    roots.push(root);
    const storeDir = join(root, 'approvals');
    const now = new Date('2026-08-21T12:01:00.000Z');
    const legacySweep = vi.fn(async (observedAt: Date) => {
      await Promise.resolve();
      expect(observedAt).toEqual(now);
    });
    const driver = new ApprovalExpiryDriver({
      broker: new ApprovalBroker(root, { storeDir, clock: () => now }),
      store: new ApprovalStore(root, { storeDir, clock: () => now }),
      clock: () => now,
      onLegacyLifecycleSweep: legacySweep,
    });

    driver.start(60_000);
    await driver.settleInFlight();
    expect(legacySweep).toHaveBeenCalledOnce();
    driver.stop();
  });
});
