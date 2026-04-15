import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CliNotificationAdapter } from '../../../src/core/notify-adapters/cli-adapter.js';
import type { Notification } from '../../../src/core/notification-dispatcher.js';

// ─── Test Helpers ────────────────────────────────────────────────

function makeNotification(priority: 'critical' | 'warning' | 'info' = 'info'): Notification {
  return {
    priority,
    event: 'task-done',
    title: 'Task 001 Done',
    summary: 'Tests pass',
    sprintId: 'sprint-139',
    timestamp: '2026-04-15T10:00:00.000Z',
  };
}

describe('CliNotificationAdapter', () => {
  let adapter: CliNotificationAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    adapter = new CliNotificationAdapter();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('has correct adapter name', () => {
    expect(adapter.name).toBe('cli-parent-tty');
  });

  it('isAvailable returns true when stderr is TTY', () => {
    delete process.env['DECKENT_PARENT_PID'];
    const original = process.stderr.isTTY;
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    try {
      expect(adapter.isAvailable()).toBe(true);
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', { value: original, configurable: true });
    }
  });

  it('isAvailable returns false when no TTY and no parent PID', () => {
    delete process.env['DECKENT_PARENT_PID'];
    const original = process.stderr.isTTY;
    Object.defineProperty(process.stderr, 'isTTY', { value: undefined, configurable: true });
    try {
      expect(adapter.isAvailable()).toBe(false);
    } finally {
      Object.defineProperty(process.stderr, 'isTTY', { value: original, configurable: true });
    }
  });

  it('send writes to stderr as fallback when no parent PID', async () => {
    delete process.env['DECKENT_PARENT_PID'];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await adapter.send(makeNotification('warning'));

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain('⚠️');
    expect(output).toContain('[deckent]');
    expect(output).toContain('Task 001 Done');
    expect(output).toContain('Tests pass');
  });

  it('send includes correct emoji for critical', async () => {
    delete process.env['DECKENT_PARENT_PID'];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await adapter.send(makeNotification('critical'));

    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain('🚨');
  });

  it('send includes correct emoji for info', async () => {
    delete process.env['DECKENT_PARENT_PID'];
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await adapter.send(makeNotification('info'));

    const output = writeSpy.mock.calls[0]![0] as string;
    expect(output).toContain('ℹ️');
  });

  it('isAvailable returns false for invalid parent PID path', () => {
    process.env['DECKENT_PARENT_PID'] = '99999999';
    // /proc/99999999/fd/1 should not exist
    expect(adapter.isAvailable()).toBe(false);
  });
});
