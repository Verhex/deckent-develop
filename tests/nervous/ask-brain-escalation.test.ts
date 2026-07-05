// ─── AskBrainEscalation tests (DEFER-002 closure, task 368-005) ─────────────────
// Fake-store + fake-notifyFn unit tests: re-notify threshold -> escalation record
// (type:'escalation') + notify, below-threshold no-op, post-escalation loop break
// (no repeat record/notify for the same id), settled-outcome counter reset, and
// per-id isolation. No sqlite / no live NotifyDispatcher required — both
// dependencies are injected structural fakes (AskBrainEscalationStore, notifyFn).

import { describe, it, expect, vi } from 'vitest';
import type { CreateEntryInput } from '../../src/core/memory-types.js';
import {
  AskBrainEscalationTracker,
  DEFAULT_ASK_BRAIN_ESCALATION_THRESHOLD,
  isReNotifySignal,
  type AskBrainEscalationStore,
} from '../../src/nervous/ask-brain-escalation.js';

const FIXED_NOW = new Date('2026-07-05T12:00:00.000Z');

function makeFakeStore(): AskBrainEscalationStore & { inserted: CreateEntryInput[] } {
  const inserted: CreateEntryInput[] = [];
  return {
    inserted,
    insert(input: CreateEntryInput) {
      inserted.push(input);
    },
  };
}

function rejected(notificationId: string) {
  return { notificationId, decision: 'rejected' as const, outcome: 'pending' as const };
}

function accepted(notificationId: string) {
  return { notificationId, decision: 'accepted' as const, outcome: 'success' as const };
}

describe('isReNotifySignal', () => {
  it('is true for a rejected decision', () => {
    expect(isReNotifySignal({ decision: 'rejected', outcome: 'pending' })).toBe(true);
  });

  it('is true for a still-pending outcome regardless of decision', () => {
    expect(isReNotifySignal({ decision: 'accepted', outcome: 'pending' })).toBe(true);
  });

  it('is false for a settled accepted/success outcome', () => {
    expect(isReNotifySignal({ decision: 'accepted', outcome: 'success' })).toBe(false);
  });

  it('is false for autonomous/success', () => {
    expect(isReNotifySignal({ decision: 'autonomous', outcome: 'success' })).toBe(false);
  });
});

describe('AskBrainEscalationTracker', () => {
  it('does not escalate below the default threshold (3)', async () => {
    const store = makeFakeStore();
    const notifyFn = vi.fn().mockResolvedValue(undefined);
    const tracker = new AskBrainEscalationTracker(store, { now: () => FIXED_NOW, notifyFn });

    const first = await tracker.recordOutcome(rejected('notif-1'), { title: 'Debt reprioritize' });
    const second = await tracker.recordOutcome(rejected('notif-1'), { title: 'Debt reprioritize' });

    expect(first).toEqual({ escalated: false, reNotifyCount: 1, shouldStopReNotifying: false });
    expect(second).toEqual({ escalated: false, reNotifyCount: 2, shouldStopReNotifying: false });
    expect(store.inserted).toHaveLength(0);
    expect(notifyFn).not.toHaveBeenCalled();
    expect(tracker.hasEscalated('notif-1')).toBe(false);
  });

  it('escalates exactly at the threshold — memory-store type:escalation + notify', async () => {
    const store = makeFakeStore();
    const notifyFn = vi.fn().mockResolvedValue(undefined);
    const tracker = new AskBrainEscalationTracker(store, { now: () => FIXED_NOW, notifyFn });

    await tracker.recordOutcome(rejected('notif-2'), { title: 'Shell exec suggestion', sprintId: 'sprint-368', detectorId: 'det-1', taskId: 'task-1' });
    await tracker.recordOutcome(rejected('notif-2'), { title: 'Shell exec suggestion', sprintId: 'sprint-368', detectorId: 'det-1', taskId: 'task-1' });
    const third = await tracker.recordOutcome(rejected('notif-2'), { title: 'Shell exec suggestion', sprintId: 'sprint-368', detectorId: 'det-1', taskId: 'task-1' });

    expect(third.escalated).toBe(true);
    expect(third.shouldStopReNotifying).toBe(true);
    if (third.escalated) {
      expect(third.record).toEqual({
        notificationId: 'notif-2',
        reNotifyCount: 3,
        escalatedAt: FIXED_NOW.toISOString(),
        reason: 'rejected',
      });
    }

    expect(store.inserted).toHaveLength(1);
    expect(store.inserted[0]).toMatchObject({
      id: 'escalation-notif-2',
      type: 'escalation',
      sprint_id: 'sprint-368',
    });
    expect(store.inserted[0]!.tags).toContain('rejected');

    expect(notifyFn).toHaveBeenCalledTimes(1);
    expect(notifyFn).toHaveBeenCalledWith(
      'human-checkpoint-required',
      'sprint-368',
      expect.stringContaining('Shell exec suggestion'),
      expect.stringContaining('3'),
      'det-1',
    );
    expect(tracker.hasEscalated('notif-2')).toBe(true);
  });

  it('breaks the re-notify loop: a 4th call for the same id does not repeat the record/notify', async () => {
    const store = makeFakeStore();
    const notifyFn = vi.fn().mockResolvedValue(undefined);
    const tracker = new AskBrainEscalationTracker(store, { now: () => FIXED_NOW, notifyFn });

    for (let i = 0; i < 3; i++) {
      await tracker.recordOutcome(rejected('notif-3'), { title: 'Loop test' });
    }
    expect(store.inserted).toHaveLength(1);
    expect(notifyFn).toHaveBeenCalledTimes(1);

    const fourth = await tracker.recordOutcome(rejected('notif-3'), { title: 'Loop test' });
    const fifth = await tracker.recordOutcome(rejected('notif-3'), { title: 'Loop test' });

    expect(fourth).toEqual({ escalated: false, reNotifyCount: 3, shouldStopReNotifying: true });
    expect(fifth).toEqual({ escalated: false, reNotifyCount: 3, shouldStopReNotifying: true });
    // Loop break proof: still exactly one record and one notify call ever.
    expect(store.inserted).toHaveLength(1);
    expect(notifyFn).toHaveBeenCalledTimes(1);
  });

  it('resets the counter once a suggestion settles (accepted) — needs the full threshold again', async () => {
    const store = makeFakeStore();
    const notifyFn = vi.fn().mockResolvedValue(undefined);
    const tracker = new AskBrainEscalationTracker(store, { now: () => FIXED_NOW, notifyFn });

    await tracker.recordOutcome(rejected('notif-4'), { title: 'Reset test' });
    await tracker.recordOutcome(rejected('notif-4'), { title: 'Reset test' });
    const settled = await tracker.recordOutcome(accepted('notif-4'), { title: 'Reset test' });
    expect(settled).toEqual({ escalated: false, reNotifyCount: 0, shouldStopReNotifying: false });

    // Two more rejects after the reset should NOT yet escalate (only at count 3 again).
    await tracker.recordOutcome(rejected('notif-4'), { title: 'Reset test' });
    const second = await tracker.recordOutcome(rejected('notif-4'), { title: 'Reset test' });
    expect(second).toEqual({ escalated: false, reNotifyCount: 2, shouldStopReNotifying: false });
    expect(store.inserted).toHaveLength(0);
    expect(notifyFn).not.toHaveBeenCalled();
  });

  it('is fail-safe when notifyFn throws — the memory-store record still lands and no error propagates', async () => {
    const store = makeFakeStore();
    const notifyFn = vi.fn().mockRejectedValue(new Error('dispatcher unavailable'));
    const tracker = new AskBrainEscalationTracker(store, { now: () => FIXED_NOW, notifyFn, threshold: 1 });

    const outcome = await tracker.recordOutcome(rejected('notif-5'), { title: 'Fail-safe test' });

    expect(outcome.escalated).toBe(true);
    expect(store.inserted).toHaveLength(1);
    expect(notifyFn).toHaveBeenCalledTimes(1);
  });

  it('tracks distinct notification ids independently', async () => {
    const store = makeFakeStore();
    const notifyFn = vi.fn().mockResolvedValue(undefined);
    const tracker = new AskBrainEscalationTracker(store, { now: () => FIXED_NOW, notifyFn, threshold: 2 });

    await tracker.recordOutcome(rejected('notif-a'), { title: 'A' });
    const bFirst = await tracker.recordOutcome(rejected('notif-b'), { title: 'B' });
    expect(bFirst).toEqual({ escalated: false, reNotifyCount: 1, shouldStopReNotifying: false });

    const aSecond = await tracker.recordOutcome(rejected('notif-a'), { title: 'A' });
    expect(aSecond.escalated).toBe(true);
    expect(tracker.hasEscalated('notif-a')).toBe(true);
    expect(tracker.hasEscalated('notif-b')).toBe(false);
    expect(store.inserted).toHaveLength(1);
    expect(store.inserted[0]!.id).toBe('escalation-notif-a');
  });

  it('supports a custom threshold override', async () => {
    const store = makeFakeStore();
    const notifyFn = vi.fn().mockResolvedValue(undefined);
    const tracker = new AskBrainEscalationTracker(store, { now: () => FIXED_NOW, notifyFn, threshold: 1 });

    const first = await tracker.recordOutcome(rejected('notif-6'), { title: 'Threshold 1' });
    expect(first.escalated).toBe(true);
  });

  it('exposes the documented default threshold constant', () => {
    expect(DEFAULT_ASK_BRAIN_ESCALATION_THRESHOLD).toBe(3);
  });
});
