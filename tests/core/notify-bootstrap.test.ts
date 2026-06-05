// WIRE-001 (MASTER-PLAN §4G) — backend-agnostic NotifyDispatcher bootstrap.
// Proves the wire that pure-CLI `deckent start` and the detached sprint-runner
// now use: after bootstrapNotifyDispatcher(), a notify() call is actually
// delivered to the registered adapters + the .deckent/notify-log.jsonl audit file.
//
// Hermetic: all file I/O under os.tmpdir(); process-globals (the dispatcher and
// DECKENT_PARENT_PID) are saved and restored so no state leaks to other tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  bootstrapNotifyDispatcher,
  NOTIFY_LOG_FILE,
} from '../../src/core/notify-bootstrap.js';
import {
  getGlobalNotifyDispatcher,
  clearGlobalNotifyDispatcher,
  clearNotificationDispatcher,
} from '../../src/core/notify-registry.js';
import { notify } from '../../src/core/notify.js';
import type {
  Notification,
  NotificationAdapter,
} from '../../src/core/notification-dispatcher.js';

/** Recording adapter — captures every notification it receives. */
class RecordingAdapter implements NotificationAdapter {
  readonly name = 'recording-test';
  readonly received: Notification[] = [];
  isAvailable(): boolean {
    return true;
  }
  async send(notification: Notification): Promise<void> {
    this.received.push(notification);
  }
}

describe('bootstrapNotifyDispatcher (WIRE-001)', () => {
  let root: string;
  let parentPidBefore: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-notify-boot-'));
    parentPidBefore = process.env['DECKENT_PARENT_PID'];
  });

  afterEach(() => {
    clearGlobalNotifyDispatcher();
    clearNotificationDispatcher();
    if (parentPidBefore === undefined) {
      delete process.env['DECKENT_PARENT_PID'];
    } else {
      process.env['DECKENT_PARENT_PID'] = parentPidBefore;
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('registers the dispatcher as the process-global instance', () => {
    const dispatcher = bootstrapNotifyDispatcher({ projectRoot: root });
    expect(getGlobalNotifyDispatcher()).toBe(dispatcher);
  });

  it('wires CLI + file adapters by default (2), and appends extras in between', () => {
    const base = bootstrapNotifyDispatcher({ projectRoot: root });
    expect(base.adapterCount).toBe(2); // CLI + file

    clearGlobalNotifyDispatcher();

    const extra = new RecordingAdapter();
    const withExtra = bootstrapNotifyDispatcher({
      projectRoot: root,
      extraAdapters: [extra],
    });
    expect(withExtra.adapterCount).toBe(3); // CLI + extra + file
  });

  it('sets DECKENT_PARENT_PID when unset and never overrides an inherited value', () => {
    delete process.env['DECKENT_PARENT_PID'];
    bootstrapNotifyDispatcher({ projectRoot: root });
    expect(process.env['DECKENT_PARENT_PID']).toBe(String(process.ppid));

    clearGlobalNotifyDispatcher();
    process.env['DECKENT_PARENT_PID'] = '424242';
    bootstrapNotifyDispatcher({ projectRoot: root });
    expect(process.env['DECKENT_PARENT_PID']).toBe('424242');
  });

  it('delivers a notify() through the registered extra adapter AND the file log', async () => {
    const extra = new RecordingAdapter();
    bootstrapNotifyDispatcher({ projectRoot: root, extraAdapters: [extra] });

    // 'human-checkpoint-required' is critical → sendNow() immediately, awaited
    // (no throttle queue), so the assertion below is deterministic, not racy.
    await notify(
      'human-checkpoint-required',
      'sprint-test',
      'Onay gerekiyor',
      'Checkpoint plan onay bekliyor',
    );

    // Extra adapter received the in-memory notification
    expect(extra.received).toHaveLength(1);
    expect(extra.received[0]?.event).toBe('human-checkpoint-required');
    expect(extra.received[0]?.priority).toBe('critical');

    // File adapter persisted the audit line
    const logPath = join(root, '.deckent', NOTIFY_LOG_FILE);
    expect(existsSync(logPath)).toBe(true);
    const contents = readFileSync(logPath, 'utf-8');
    expect(contents).toContain('human-checkpoint-required');
    expect(contents).toContain('Onay gerekiyor');
  });

  it('is fail-safe: notify() is a no-op (no throw) once the dispatcher is cleared', async () => {
    bootstrapNotifyDispatcher({ projectRoot: root });
    clearGlobalNotifyDispatcher();
    await expect(
      notify('task-done', 'sprint-test', 'Bitti', 'task DONE'),
    ).resolves.toBeUndefined();
  });
});
