// ═══ Notify Registry Tests — Sprint 189 Task 1 ═════════════════════════════
// Validates both registry APIs:
//   - setGlobalNotifyDispatcher / getGlobalNotifyDispatcher (NotifyDispatcher class)
//   - setNotificationDispatcher / getNotificationDispatcher (event-bus emit function)
//
// Ensures notify-registry stays a pure core/ module — no orchestra/ import.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  setGlobalNotifyDispatcher,
  getGlobalNotifyDispatcher,
  clearGlobalNotifyDispatcher,
  setNotificationDispatcher,
  getNotificationDispatcher,
  clearNotificationDispatcher,
  type NotifyBusEvent,
  type NotificationEventDispatcher,
} from '../../src/core/notify-registry.js';
import { NotifyDispatcher } from '../../src/core/notification-dispatcher.js';

describe('notify-registry — NotifyDispatcher pair', () => {
  beforeEach(() => clearGlobalNotifyDispatcher());
  afterEach(() => clearGlobalNotifyDispatcher());

  it('starts unregistered (returns null)', () => {
    expect(getGlobalNotifyDispatcher()).toBeNull();
  });

  it('round-trips a NotifyDispatcher instance', () => {
    const d = new NotifyDispatcher(0);
    setGlobalNotifyDispatcher(d);
    expect(getGlobalNotifyDispatcher()).toBe(d);
  });

  it('clear resets to null', () => {
    setGlobalNotifyDispatcher(new NotifyDispatcher(0));
    clearGlobalNotifyDispatcher();
    expect(getGlobalNotifyDispatcher()).toBeNull();
  });
});

describe('notify-registry — NotificationEventDispatcher pair (ADR-008 inversion)', () => {
  beforeEach(() => clearNotificationDispatcher());
  // Note: do NOT clear in afterEach — event-bus.ts wires the dispatcher at
  // module load time. Tests in other suites depend on it being registered.

  it('starts unregistered (returns null)', () => {
    expect(getNotificationDispatcher()).toBeNull();
  });

  it('round-trips a dispatcher function', () => {
    const captured: NotifyBusEvent[] = [];
    const fn: NotificationEventDispatcher = (evt) => { captured.push(evt); };
    setNotificationDispatcher(fn);
    expect(getNotificationDispatcher()).toBe(fn);
  });

  it('dispatcher receives the full NotifyBusEvent shape', () => {
    const captured: NotifyBusEvent[] = [];
    setNotificationDispatcher((evt) => { captured.push(evt); });

    const sample: NotifyBusEvent = {
      type: 'NOTIFY',
      source: 'brain',
      target: 'user',
      channel: 'DECKENT→USER:NOTIFY',
      payload: { event: 'task-done', sprintId: 'sprint-189' },
      timestamp: '2026-05-22T23:00:00.000Z',
    };
    getNotificationDispatcher()!(sample);

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual(sample);
  });

  it('clear resets to null', () => {
    setNotificationDispatcher(() => {});
    clearNotificationDispatcher();
    expect(getNotificationDispatcher()).toBeNull();
  });

  it('passing null clears the dispatcher', () => {
    setNotificationDispatcher(() => {});
    setNotificationDispatcher(null);
    expect(getNotificationDispatcher()).toBeNull();
  });

  it('keeps notify-registry.ts free of orchestra imports (ADR-008)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/core/notify-registry.ts'),
      'utf-8',
    );
    expect(src).not.toMatch(/from\s+['"]\.\.\/orchestra\//);
    expect(src).not.toMatch(/from\s+['"][^'"]*\/orchestra\//);
  });
});
