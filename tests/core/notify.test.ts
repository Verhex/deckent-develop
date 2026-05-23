// ═══ Notify Tests — Sprint 189 Task 1 (ADR-008 inversion) ═══════════════════
// Validates that core/notify.ts:
//   1. Has zero orchestra/ imports (grep-level static guard for ADR-008).
//   2. Routes events through the injected dispatcher (no direct eventBus call).
//   3. Preserves the DECKENT→USER:NOTIFY payload wire shape.
//   4. Is fail-safe when no event dispatcher has been registered.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notify } from '../../src/core/notify.js';
import {
  setNotificationDispatcher,
  clearNotificationDispatcher,
  getNotificationDispatcher,
  clearGlobalNotifyDispatcher,
  type NotifyBusEvent,
} from '../../src/core/notify-registry.js';

describe('notify — ADR-008 static guard', () => {
  it('src/core/notify.ts does not import from orchestra/', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/core/notify.ts'),
      'utf-8',
    );
    // Direct relative import to orchestra
    expect(src).not.toMatch(/from\s+['"]\.\.\/orchestra\//);
    // Any path containing /orchestra/
    expect(src).not.toMatch(/from\s+['"][^'"]*\/orchestra\//);
    // Bare orchestra alias (defensive)
    expect(src).not.toMatch(/from\s+['"]orchestra(?:\/|['"])/);
  });
});

describe('notify — dispatcher injection wire', () => {
  let previousDispatcher: ReturnType<typeof getNotificationDispatcher>;

  beforeEach(() => {
    // Snapshot whatever orchestra/event-bus.ts wired at module load so we can
    // restore it for other test files that depend on the bus emission.
    previousDispatcher = getNotificationDispatcher();
    clearNotificationDispatcher();
    clearGlobalNotifyDispatcher();
  });

  afterEach(() => {
    setNotificationDispatcher(previousDispatcher);
    clearGlobalNotifyDispatcher();
  });

  it('invokes the registered dispatcher with the NOTIFY payload', async () => {
    const captured: NotifyBusEvent[] = [];
    setNotificationDispatcher((evt) => { captured.push(evt); });

    await notify('task-done', 'sprint-189', 'Title', 'summary', 'extra details');

    expect(captured).toHaveLength(1);
    const evt = captured[0]!;
    expect(evt.type).toBe('NOTIFY');
    expect(evt.source).toBe('brain');
    expect(evt.target).toBe('user');
    expect(evt.channel).toBe('DECKENT→USER:NOTIFY');
    expect(typeof evt.timestamp).toBe('string');
    expect(evt.payload).toMatchObject({
      event: 'task-done',
      sprintId: 'sprint-189',
      title: 'Title',
      summary: 'summary',
    });
  });

  it('event payload shape stays identical for every NotificationEventName', async () => {
    const captured: NotifyBusEvent[] = [];
    setNotificationDispatcher((evt) => { captured.push(evt); });

    const names = [
      'sprint-started',
      'task-done',
      'task-no-go',
      'sprint-finalized',
      'human-checkpoint-required',
    ] as const;

    for (const name of names) {
      await notify(name, 'sprint-189', `t-${name}`, `s-${name}`);
    }

    expect(captured).toHaveLength(names.length);
    for (let i = 0; i < captured.length; i++) {
      const evt = captured[i]!;
      const name = names[i]!;
      expect(evt.type).toBe('NOTIFY');
      expect(evt.source).toBe('brain');
      expect(evt.target).toBe('user');
      expect(evt.channel).toBe('DECKENT→USER:NOTIFY');
      expect(evt.payload).toBeTypeOf('object');
      expect(evt.payload['event']).toBe(name);
      expect(evt.payload['sprintId']).toBe('sprint-189');
      expect(typeof evt.timestamp).toBe('string');
      // timestamp is ISO 8601
      expect(new Date(evt.timestamp).toString()).not.toBe('Invalid Date');
    }
  });

  it('is fail-safe (no throw) when no event dispatcher is registered', async () => {
    clearNotificationDispatcher();
    expect(getNotificationDispatcher()).toBeNull();

    await expect(
      notify('sprint-started', 'sprint-189', 'no-bus', 'should not throw'),
    ).resolves.toBeUndefined();
  });

  it('swallows dispatcher errors without throwing', async () => {
    setNotificationDispatcher(() => {
      throw new Error('boom');
    });

    await expect(
      notify('task-no-go', 'sprint-189', 'will not throw', 'boom test'),
    ).resolves.toBeUndefined();
  });
});
