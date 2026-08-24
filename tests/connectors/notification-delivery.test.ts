import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deliverPendingOwnerNotifications,
  enqueueOwnerNotification,
  NOTIFICATION_OUTBOX_FILE,
  NOTIFICATION_RUNTIME_DIRECTORY,
  readPendingOwnerNotifications,
} from '../../src/connectors/notification-delivery.js';
import { pollOwnerNotifications } from '../../src/connectors/bot-commands.js';

const roots: string[] = [];

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'notification-delivery-'));
  roots.push(value);
  return value;
}

afterEach(() => {
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
