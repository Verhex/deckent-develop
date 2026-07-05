// src/nervous/ask-brain-escalation.ts
//
// AskBrainEscalation (DEFER-002 closure, MASTER-PLAN Sıra-75) — a nervous
// suggestion that keeps coming back rejected/pending past a re-notify
// threshold stops being silently re-notified forever and gets escalated to
// Brain instead: a memory-store `type:'escalation'` record + a
// DECKENT→USER:NOTIFY `human-checkpoint-required` event.
//
// 361-014 (sprint-361) shipped the nervous undo/edit MCP tools half of this
// row; this module closes the remaining askBrain-escalation half. Pure /
// injectable tracker — mirrors the `NervousApprovalBridge` /
// `QuestionApprovalBridge` precedent (approval-bridge.ts,
// orchestra/question-approval-bridge.ts): built against narrow structural
// interfaces (a real MemoryStore / the real `notify()` satisfy them with zero
// adapter glue), deliberately NOT wired into dispatcher.ts / executor.ts here
// — threading this into the live re-notify path is explicit follow-up work,
// outside this task's write scope.

import type { ExecutionRecord } from '../core/nervous-types.js';
import type { CreateEntryInput } from '../core/memory-types.js';
import { notify } from '../core/notify.js';

/** Default re-notify threshold before escalating to Brain (the task's own
 *  example: 3 re-notifies). */
export const DEFAULT_ASK_BRAIN_ESCALATION_THRESHOLD = 3;

/**
 * Narrow memory-store surface this module depends on — satisfied structurally
 * by a real `MemoryStore` (core/memory-store.ts) or a plain test fake, the
 * same DI shape as `NervousApprovalBrokerLike` / `NervousPendingCleanup`
 * (approval-bridge.ts).
 */
export interface AskBrainEscalationStore {
  insert(input: CreateEntryInput): void;
}

/** Notify seam — same call shape as the real `core/notify.js` `notify()`;
 *  injectable so tests never need a live global NotifyDispatcher. */
export type AskBrainNotifyFn = typeof notify;

/** Per-notification display context an escalation record/notice needs. */
export interface AskBrainEscalationContext {
  readonly title: string;
  readonly detectorId?: string;
  readonly sprintId?: string;
  readonly taskId?: string;
}

/** Why the threshold was reached — mirrors the two `ExecutionRecord` shapes
 *  {@link isReNotifySignal} treats as unresolved. */
export type AskBrainEscalationReason = 'rejected' | 'pending';

export interface AskBrainEscalationRecord {
  readonly notificationId: string;
  readonly reNotifyCount: number;
  readonly escalatedAt: string;
  readonly reason: AskBrainEscalationReason;
}

export type AskBrainEscalationOutcome =
  | {
      readonly escalated: false;
      readonly reNotifyCount: number;
      /** True once this id is ALREADY escalated — the caller must stop
       *  scheduling further re-notifies for it (the loop break). */
      readonly shouldStopReNotifying: boolean;
    }
  | {
      readonly escalated: true;
      readonly record: AskBrainEscalationRecord;
      readonly shouldStopReNotifying: true;
    };

export interface AskBrainEscalationOptions {
  /** Re-notify count that triggers escalation. Default {@link DEFAULT_ASK_BRAIN_ESCALATION_THRESHOLD}. */
  readonly threshold?: number;
  /** Clock seam for deterministic tests. Defaults to `() => new Date()`. */
  readonly now?: () => Date;
  /** Notify seam for deterministic tests. Defaults to the real `notify()`. */
  readonly notifyFn?: AskBrainNotifyFn;
}

/**
 * True iff `record` represents an unresolved re-notify signal — a rejected
 * decision or a still-pending outcome. Mirrors `Executor.handleSuggestTimeout`'s
 * own reject shape (`decision:'rejected', outcome:'pending'`, executor.ts) —
 * this is the EXISTING nervous vocabulary, not a new one. Any other
 * decision/outcome (accepted, autonomous, timeout-auto-applied, success,
 * failure) means the suggestion settled, so it is not a re-notify signal.
 */
export function isReNotifySignal(record: Pick<ExecutionRecord, 'decision' | 'outcome'>): boolean {
  return record.decision === 'rejected' || record.outcome === 'pending';
}

/**
 * Tracks re-notify attempts per nervous notification id and escalates to
 * Brain once the threshold is exceeded — instead of re-notifying forever.
 */
export class AskBrainEscalationTracker {
  private readonly reNotifyCounts = new Map<string, number>();
  private readonly escalatedIds = new Set<string>();
  private readonly threshold: number;
  private readonly now: () => Date;
  private readonly notifyFn: AskBrainNotifyFn;

  constructor(
    private readonly store: AskBrainEscalationStore,
    options: AskBrainEscalationOptions = {},
  ) {
    this.threshold = Math.max(1, options.threshold ?? DEFAULT_ASK_BRAIN_ESCALATION_THRESHOLD);
    this.now = options.now ?? (() => new Date());
    this.notifyFn = options.notifyFn ?? notify;
  }

  /**
   * Feed one execution outcome for a notification.
   *
   * - Already escalated: short-circuits (`escalated:false`,
   *   `shouldStopReNotifying:true`) — the re-notify loop break. The
   *   memory-store record and notify call from the original escalation are
   *   never repeated for the same id.
   * - Not a re-notify signal ({@link isReNotifySignal} false, e.g. accepted):
   *   the suggestion settled — the counter resets to 0.
   * - Re-notify signal, below threshold: counter increments, no escalation.
   * - Re-notify signal, threshold reached: escalates exactly once — writes a
   *   `type:'escalation'` memory-store record, then fires a
   *   `human-checkpoint-required` notify (fail-safe: a notify error never
   *   throws out of this method — the durable record already landed).
   */
  async recordOutcome(
    record: Pick<ExecutionRecord, 'notificationId' | 'decision' | 'outcome'>,
    context: AskBrainEscalationContext,
  ): Promise<AskBrainEscalationOutcome> {
    const id = record.notificationId;

    if (this.escalatedIds.has(id)) {
      return {
        escalated: false,
        reNotifyCount: this.reNotifyCounts.get(id) ?? this.threshold,
        shouldStopReNotifying: true,
      };
    }

    if (!isReNotifySignal(record)) {
      this.reNotifyCounts.delete(id);
      return { escalated: false, reNotifyCount: 0, shouldStopReNotifying: false };
    }

    const reNotifyCount = (this.reNotifyCounts.get(id) ?? 0) + 1;
    this.reNotifyCounts.set(id, reNotifyCount);

    if (reNotifyCount < this.threshold) {
      return { escalated: false, reNotifyCount, shouldStopReNotifying: false };
    }

    this.escalatedIds.add(id);
    const escalationRecord: AskBrainEscalationRecord = {
      notificationId: id,
      reNotifyCount,
      escalatedAt: this.now().toISOString(),
      reason: record.decision === 'rejected' ? 'rejected' : 'pending',
    };

    this.writeEscalationRecord(id, context, escalationRecord);
    await this.sendEscalationNotice(context, escalationRecord);

    return { escalated: true, record: escalationRecord, shouldStopReNotifying: true };
  }

  /** True once `notificationId` has already been escalated — callers can
   *  check this before even building the next re-notify attempt. */
  hasEscalated(notificationId: string): boolean {
    return this.escalatedIds.has(notificationId);
  }

  private writeEscalationRecord(
    notificationId: string,
    context: AskBrainEscalationContext,
    record: AskBrainEscalationRecord,
  ): void {
    this.store.insert({
      id: `escalation-${notificationId}`,
      type: 'escalation',
      title: `Ask-Brain escalation: ${context.title}`,
      content: JSON.stringify({ context, record }),
      source: 'system',
      sprint_id: context.sprintId ?? 'unknown',
      tags: ['nervous', 'ask-brain', record.reason],
      metadata: {
        detectorId: context.detectorId,
        taskId: context.taskId,
        reNotifyCount: record.reNotifyCount,
        reason: record.reason,
      },
      decay_exempt: false,
    });
  }

  private async sendEscalationNotice(
    context: AskBrainEscalationContext,
    record: AskBrainEscalationRecord,
  ): Promise<void> {
    try {
      await this.notifyFn(
        'human-checkpoint-required',
        context.sprintId ?? 'unknown',
        `[Nervous] Ask-Brain escalation: ${context.title}`,
        `Re-notify threshold (${this.threshold}) exceeded (${record.reNotifyCount}x ${record.reason}) — escalated to Brain.`,
        context.detectorId,
      );
    } catch {
      // Fail-safe: notify errors never block escalation bookkeeping (mirrors
      // dispatcher.ts's bridgeToUserNotify) — the memory-store record already landed.
    }
  }
}
