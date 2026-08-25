import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deliverPendingOwnerNotifications,
  enqueueOwnerNotification,
  NOTIFICATION_OUTBOX_FILE,
  NOTIFICATION_RECEIPTS_FILE,
  NOTIFICATION_RUNTIME_DIRECTORY,
  readPendingOwnerNotifications,
} from '../../src/connectors/notification-delivery.js';
import { pollOwnerNotifications } from '../../src/connectors/bot-commands.js';
import { startOwnerNotificationDrain } from '../../src/connectors/bot-daemon.js';
import type { ResolvedConfig } from '../../src/core/config-types.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'notification-delivery-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('durable owner notification delivery', () => {
  it('keeps append-only events pending while the bot is offline', () => {
    const projectRoot = root();
    enqueueOwnerNotification(projectRoot, {
      id: 'event-1', kind: 'sprint-started', sprintId: 's-1',
      title: 'Run started', message: 'Work is underway', lang: 'en',
    });
    enqueueOwnerNotification(projectRoot, {
      id: 'event-2', kind: 'no-go', sprintId: 's-1',
      title: 'NO_GO', message: 'Repair required', lang: 'tr',
    });

    expect(readPendingOwnerNotifications(projectRoot).map((event) => event.id))
      .toEqual(['event-1', 'event-2']);
    const bytes = readFileSync(
      join(projectRoot, NOTIFICATION_RUNTIME_DIRECTORY, NOTIFICATION_OUTBOX_FILE),
      'utf8',
    );
    expect(bytes.trim().split('\n')).toHaveLength(2);
    expect(bytes).not.toContain('chat_id');
    expect(bytes).not.toContain('token');
  });

  it('acknowledges after send and does not redeliver acknowledged ids', async () => {
    const projectRoot = root();
    enqueueOwnerNotification(projectRoot, {
      id: 'stable-id', kind: 'terminal', sprintId: 's-2',
      title: 'Final', message: 'DONE', lang: 'en',
    });
    const sendMessage = vi.fn(async () => undefined);

    await expect(pollOwnerNotifications(projectRoot, { sendMessage })).resolves.toEqual({
      delivered: 1, pending: 0,
    });
    await expect(deliverPendingOwnerNotifications(projectRoot, { sendMessage })).resolves.toEqual({
      delivered: 0, pending: 0,
    });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(sendMessage).toHaveBeenCalledWith('Final\nDONE', 'stable-id');
  });

  it('retries one transient failure with the same idempotency key', async () => {
    const projectRoot = root();
    enqueueOwnerNotification(projectRoot, {
      id: 'retry-id', kind: 'approval-requested', sprintId: 's-3',
      title: 'Approval', message: 'Please decide', lang: 'en',
    });
    const transient = Object.assign(new Error('rate limited'), { status: 429 });
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(async () => undefined);

    await expect(deliverPendingOwnerNotifications(
      projectRoot, { sendMessage }, { sleep, backoffMs: 10 },
    )).resolves.toEqual({ delivered: 1, pending: 0 });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls.map((call) => call[1])).toEqual(['retry-id', 'retry-id']);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('does not retry client errors and leaves the ordered suffix pending', async () => {
    const projectRoot = root();
    for (const id of ['first', 'second']) {
      enqueueOwnerNotification(projectRoot, {
        id, kind: 'fix-started', sprintId: 's-4', title: id, message: 'fix', lang: 'tr',
      });
    }
    const sendMessage = vi.fn(async () => {
      throw Object.assign(new Error('bad request'), { status: 400 });
    });

    await expect(deliverPendingOwnerNotifications(projectRoot, { sendMessage })).resolves.toEqual({
      delivered: 0, pending: 2,
    });
    expect(sendMessage).toHaveBeenCalledOnce();
    expect(readPendingOwnerNotifications(projectRoot)).toHaveLength(2);
  });
});

// ─── 671-004: the bot-daemon drains the durable outbox on a cadence ───────
//
// Hermetic: tmpdir root, injected config + transport seams, fake timers. No real
// network, no real config load, no spawned process.

describe('bot-daemon owner-notification outbox drain', () => {
  function config(overrides: Record<string, unknown> = {}): ResolvedConfig {
    return {
      notify_outbox_drain_interval_ms: 1_234,
      notify_connectors: {
        telegram: { enabled: true, token: 'tok-1234', chat_id: '99' },
      },
      ...overrides,
    } as unknown as ResolvedConfig;
  }

  function stranded(projectRoot: string): void {
    // Mirrors the two pause records stranded in the outbox since 24 August.
    enqueueOwnerNotification(projectRoot, {
      id: 'pause-1', kind: 'paused', sprintId: 's-671',
      title: 'Sprint paused', message: 'Awaiting owner', lang: 'en',
    });
    enqueueOwnerNotification(projectRoot, {
      id: 'pause-2', kind: 'paused', sprintId: 's-671',
      title: 'Sprint paused', message: 'Awaiting owner', lang: 'tr',
    });
  }

  function receipts(projectRoot: string): string[] {
    try {
      return readFileSync(
        join(projectRoot, NOTIFICATION_RUNTIME_DIRECTORY, NOTIFICATION_RECEIPTS_FILE),
        'utf8',
      ).trim().split('\n').filter(Boolean)
        .map((line) => (JSON.parse(line) as { notificationId: string }).notificationId);
    } catch {
      return [];
    }
  }

  it('delivers the pending records and writes the ack receipt in one tick', async () => {
    const projectRoot = root();
    stranded(projectRoot);
    const sendMessage = vi.fn(async () => undefined);
    const log = vi.fn();

    const handle = await startOwnerNotificationDrain(projectRoot, {
      readConfig: async () => config(),
      resolveTransport: async () => ({ sendMessage }),
      log,
    });
    try {
      // Cadence comes from the resolved config field, not a literal.
      expect(handle.intervalMs).toBe(1_234);
      expect(handle.isRunning()).toBe(true);

      await expect(handle.tick()).resolves.toEqual({
        status: 'drained', delivered: 2, pending: 0,
      });
      expect(sendMessage.mock.calls.map((call) => call[1])).toEqual(['pause-1', 'pause-2']);
      expect(receipts(projectRoot)).toEqual(['pause-1', 'pause-2']);
      expect(readPendingOwnerNotifications(projectRoot)).toEqual([]);
    } finally {
      await handle.stop();
    }
    expect(handle.isRunning()).toBe(false);
  });

  it('fires the drain on the configured interval and never after stop', async () => {
    vi.useFakeTimers();
    const projectRoot = root();
    stranded(projectRoot);
    const sendMessage = vi.fn(async () => undefined);

    const handle = await startOwnerNotificationDrain(projectRoot, {
      readConfig: async () => config({ notify_outbox_drain_interval_ms: 500 }),
      resolveTransport: async () => ({ sendMessage }),
      log: vi.fn(),
    });
    expect(handle.intervalMs).toBe(500);

    await vi.advanceTimersByTimeAsync(500);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(receipts(projectRoot)).toEqual(['pause-1', 'pause-2']);

    await handle.stop();
    expect(handle.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('skips with a typed log and never sends when the bot is disabled', async () => {
    const projectRoot = root();
    stranded(projectRoot);
    const resolveTransport = vi.fn(async () => ({ sendMessage: vi.fn() }));
    const log = vi.fn();

    const handle = await startOwnerNotificationDrain(projectRoot, {
      readConfig: async () => config({
        notify_connectors: { telegram: { enabled: false, token: 'tok', chat_id: '99' } },
      }),
      resolveTransport,
      log,
    });
    try {
      await expect(handle.tick()).resolves.toEqual({
        status: 'skipped', reason: 'bot-disabled',
      });
      // No transport is even constructed, so no partial send is possible.
      expect(resolveTransport).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        'bot-daemon:notify-outbox-drain',
        { event: 'skipped', reason: 'bot-disabled' },
      );
      expect(receipts(projectRoot)).toEqual([]);
      expect(readPendingOwnerNotifications(projectRoot)).toHaveLength(2);
    } finally {
      await handle.stop();
    }
  });

  it('skips with a typed log when no connector is configured', async () => {
    const projectRoot = root();
    stranded(projectRoot);
    const resolveTransport = vi.fn(async () => ({ sendMessage: vi.fn() }));
    const log = vi.fn();

    const handle = await startOwnerNotificationDrain(projectRoot, {
      readConfig: async () => config({ notify_connectors: undefined }),
      resolveTransport,
      log,
    });
    try {
      await expect(handle.tick()).resolves.toEqual({
        status: 'skipped', reason: 'connector-unconfigured',
      });
      expect(resolveTransport).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        'bot-daemon:notify-outbox-drain',
        { event: 'skipped', reason: 'connector-unconfigured' },
      );
      expect(receipts(projectRoot)).toEqual([]);
    } finally {
      await handle.stop();
    }
  });

  it('leaves the record pending — and writes no receipt — when the send fails', async () => {
    const projectRoot = root();
    stranded(projectRoot);
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('bad request'), { status: 400 }))
      .mockResolvedValue(undefined);

    const handle = await startOwnerNotificationDrain(projectRoot, {
      readConfig: async () => config(),
      resolveTransport: async () => ({ sendMessage }),
      log: vi.fn(),
    });
    try {
      await expect(handle.tick()).resolves.toEqual({
        status: 'drained', delivered: 0, pending: 2,
      });
      expect(receipts(projectRoot)).toEqual([]);
      expect(readPendingOwnerNotifications(projectRoot)).toHaveLength(2);

      // The next tick retries naturally — no bespoke retry state machine.
      await expect(handle.tick()).resolves.toEqual({
        status: 'drained', delivered: 2, pending: 0,
      });
      expect(receipts(projectRoot)).toEqual(['pause-1', 'pause-2']);
    } finally {
      await handle.stop();
    }
  });
});
