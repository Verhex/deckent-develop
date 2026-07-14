// ─── Hermetic integration: notify-dedup restart survival (task 437-005) ─────
// End-to-end proof of ApprovalNotifyDedup's disk-persisted notify-state guard —
// the fix for "a bot/REPL restart re-dispatches a card every attached channel
// already saw in a previous run" (approval-notify-dedup.ts module docs). Every
// "restart" is simulated by throwing away in-memory references and constructing
// a brand-new instance against the SAME storeDir — zero shared state, purely
// disk-recovered. A single fixed fake clock drives the broker-integration cases;
// nothing here depends on wall-clock timing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApprovalNotifyDedup } from '../../src/core/approval-notify-dedup.js';
import { ApprovalBroker, type ApprovalRequestInput } from '../../src/core/approval-broker.js';
import { ApprovalRelay, type RelayChannel, type RelayNotification } from '../../src/core/approval-relay.js';

// ─── fixed fake clock ─────────────────────────────────────────────────────────
const CREATED_AT = '2026-07-10T10:00:00.000Z';
const EXPIRES_AT = '2026-07-10T10:15:00.000Z';
const AFTER_EXPIRY = new Date('2026-07-10T10:30:00.000Z');

function buildRequest(id: string, overrides: Partial<ApprovalRequestInput> = {}): ApprovalRequestInput {
  return {
    id,
    requester: { role: 'connector', instanceId: 'telegram-437-005' },
    summary: `approval request ${id}`,
    details: { note: 'test' },
    scopeId: 'sprint-437',
    scope: 'shell-exec',
    risk: 'high',
    policy: 'require-approval',
    defaultAction: 'deny',
    tenantId: 'local',
    userId: 'alperen',
    createdAt: CREATED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

function makeRecordingChannel(): { channel: RelayChannel; sent: RelayNotification[] } {
  const sent: RelayNotification[] = [];
  const channel: RelayChannel = {
    send: (notification) => {
      sent.push(notification);
    },
    onDecision: () => {
      // No test here drives a channel-initiated decision — only
      // broker-originated 'pending'/'decided' events are exercised.
    },
  };
  return { channel, sent };
}

// ─── restart persistence (markNotified / clear) ──────────────────────────────

describe('ApprovalNotifyDedup — restart persistence', () => {
  let projectRoot: string;
  let storeDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'notify-dedup-restart-'));
    storeDir = join(projectRoot, 'approvals');
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('markNotified persists across a simulated restart — a brand-new instance already knows the id', () => {
    const dedup1 = new ApprovalNotifyDedup(projectRoot, { storeDir });
    dedup1.markNotified('apr-restart-1');

    // "restart": zero shared in-memory state, same storeDir.
    const dedup2 = new ApprovalNotifyDedup(projectRoot, { storeDir });
    expect(dedup2.wasNotified('apr-restart-1')).toBe(true);
  });

  it('clear() persists — a restart-simulated instance no longer sees the id', () => {
    const dedup1 = new ApprovalNotifyDedup(projectRoot, { storeDir });
    dedup1.markNotified('apr-clear-1');
    dedup1.clear(['apr-clear-1']);

    const dedup2 = new ApprovalNotifyDedup(projectRoot, { storeDir });
    expect(dedup2.wasNotified('apr-clear-1')).toBe(false);

    const onDisk = JSON.parse(readFileSync(join(storeDir, '.notified.json'), 'utf-8')) as { notifiedIds: string[] };
    expect(onDisk.notifiedIds).not.toContain('apr-clear-1');
  });

  it('markNotified is a no-op re-persist when the id is already marked', () => {
    const dedup = new ApprovalNotifyDedup(projectRoot, { storeDir });
    dedup.markNotified('apr-noop-1');
    const before = readFileSync(join(storeDir, '.notified.json'), 'utf-8');

    dedup.markNotified('apr-noop-1');
    const after = readFileSync(join(storeDir, '.notified.json'), 'utf-8');

    expect(after).toBe(before);
  });
});

// ─── corrupt .notified.json recovery ──────────────────────────────────────────

describe('ApprovalNotifyDedup — corrupt .notified.json recovery', () => {
  let projectRoot: string;
  let storeDir: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'notify-dedup-corrupt-'));
    storeDir = join(projectRoot, 'approvals');
    mkdirSync(storeDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('recovers to an empty set from a torn (invalid JSON) state file without throwing', () => {
    writeFileSync(join(storeDir, '.notified.json'), '{"version":1,"notifiedIds":[', 'utf-8');

    let dedup: ApprovalNotifyDedup | undefined;
    expect(() => {
      dedup = new ApprovalNotifyDedup(projectRoot, { storeDir });
    }).not.toThrow();
    expect(dedup!.wasNotified('anything')).toBe(false);
  });

  it('recovers to an empty set from a structurally-wrong-shape (valid JSON, wrong version) state file', () => {
    writeFileSync(join(storeDir, '.notified.json'), JSON.stringify({ version: 2, notifiedIds: ['apr-old'] }), 'utf-8');

    const dedup = new ApprovalNotifyDedup(projectRoot, { storeDir });
    expect(dedup.wasNotified('apr-old')).toBe(false);
  });

  it('a subsequent markNotified overwrites a corrupt file with a valid version-1 file and leaves no leftover .tmp', () => {
    writeFileSync(join(storeDir, '.notified.json'), 'not even json', 'utf-8');

    const dedup = new ApprovalNotifyDedup(projectRoot, { storeDir });
    dedup.markNotified('apr-recovered');

    const onDisk = JSON.parse(readFileSync(join(storeDir, '.notified.json'), 'utf-8')) as {
      version: number;
      notifiedIds: string[];
    };
    expect(onDisk).toEqual({ version: 1, notifiedIds: ['apr-recovered'] });

    const tmpFiles = readdirSync(storeDir).filter((f) => f.endsWith('.tmp'));
    expect(tmpFiles).toEqual([]);
  });
});

// ─── integration: ApprovalRelay + ApprovalBroker — the actual restart bug fix ─

describe('ApprovalNotifyDedup + ApprovalRelay — restart does not re-notify', () => {
  let projectRoot: string;
  let storeDir: string;
  let broker: ApprovalBroker;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'notify-dedup-relay-'));
    storeDir = join(projectRoot, 'approvals');
    broker = new ApprovalBroker(projectRoot, { storeDir });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('a restart-simulated dedup+relay does NOT re-dispatch a pending request the previous process already notified', () => {
    const dedup1 = new ApprovalNotifyDedup(projectRoot, { storeDir });
    const relay1 = new ApprovalRelay(broker, dedup1);
    const chan1 = makeRecordingChannel();
    relay1.attachChannel('c1', chan1.channel);

    const submitted = broker.submit(buildRequest('apr-restart-notify', { expiresAt: '2099-01-01T00:00:00.000Z' }));
    expect(chan1.sent).toHaveLength(1);
    expect(dedup1.wasNotified(submitted.id)).toBe(true);

    relay1.dispose(); // simulate process shutdown — detaches ONLY relay1's listeners

    // "restart": brand-new dedup instance loads the persisted notified-set from disk.
    const dedup2 = new ApprovalNotifyDedup(projectRoot, { storeDir });
    const relay2 = new ApprovalRelay(broker, dedup2);
    const chan2 = makeRecordingChannel();
    relay2.attachChannel('c2', chan2.channel);

    // Mirrors approval-store-watch.ts's store-replay re-firing 'pending' for a
    // request still on disk when a watcher/relay attaches after a restart.
    broker.emit('pending', submitted);

    expect(chan2.sent).toEqual([]); // dedup2 already knew this id from disk — no duplicate dispatch
    expect(dedup2.wasNotified(submitted.id)).toBe(true);
  });

  it('broker.expire() (TTL path) clears the dedup record, and the clear survives a simulated restart', () => {
    const dedup1 = new ApprovalNotifyDedup(projectRoot, { storeDir });
    const relay1 = new ApprovalRelay(broker, dedup1);
    const chan1 = makeRecordingChannel();
    relay1.attachChannel('c1', chan1.channel);

    const submitted = broker.submit(buildRequest('apr-expire-clear'));
    expect(dedup1.wasNotified(submitted.id)).toBe(true);

    broker.expire(AFTER_EXPIRY); // TTL sweep -> 'decided' (channel ttl-expire) -> relay clears dedup
    expect(dedup1.wasNotified(submitted.id)).toBe(false);

    const dedup2 = new ApprovalNotifyDedup(projectRoot, { storeDir }); // restart-simulation
    expect(dedup2.wasNotified(submitted.id)).toBe(false); // cleared on disk, not just in memory
  });
});
