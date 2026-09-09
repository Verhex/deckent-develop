// src/agent/interim-deliverable.ts
// ═══ 7114 TERMINAL-INTERACTION-FLOW-001 — host-enforced interim deliverable ═══
//
// Measured incident (native terminal, 2026-09-09 15:40Z): ~40 tool calls over
// 665 s with NO visible text; the user interrupted. "Ne durumdasın?" then
// produced an excellent structured status in 24 s. This tracker reproduces
// that effect WITHOUT the user typing it: it counts tool calls and wall-clock
// time since the last deliverable (a visible assistant text of at least
// `interimAnswerMinChars`), and when either config-resolved bound is crossed
// the loop injects a host turn asking for an interim structured answer, then
// continues autonomously with the counters reset.
//
// Pure and clock-injected (fake-clock testable). One instance per turn; the
// session snapshots it for `/context`. No strings for humans live here.

export interface InterimDeliverablePolicy {
  readonly interimAnswerAfterToolCalls: number;
  readonly interimAnswerAfterMs: number;
  readonly interimAnswerMinChars: number;
}

export type InterimDeliverableTrigger = 'tool-calls' | 'elapsed';

export interface InterimDeliverableRequirement {
  readonly trigger: InterimDeliverableTrigger;
  readonly toolCallsSinceDeliverable: number;
  readonly elapsedMsSinceDeliverable: number;
}

/** Read model for the `/context` surface and the audit trail. */
export interface InterimDeliverableSnapshot {
  readonly toolCallsSinceDeliverable: number;
  readonly elapsedMsSinceDeliverable: number;
  readonly toolCallsLimit: number;
  readonly elapsedMsLimit: number;
  readonly minChars: number;
  /** Deliverables recognized this turn (model-initiated or host-requested). */
  readonly delivered: number;
  /** Host turns injected this turn. */
  readonly requested: number;
  /** A host request is outstanding and the model has not yet delivered. */
  readonly pending: boolean;
  readonly lastTrigger?: InterimDeliverableTrigger;
}

export interface InterimDeliverableTracker {
  /** Visible assistant text of the round that just streamed. */
  observeAssistantText(text: string): void;
  /**
   * Settle the round's visible text against the deliverable floor. `true` when
   * the accumulated text since the last deliverable reached `minChars` — the
   * counters reset and any outstanding host request is satisfied.
   */
  settleRound(): boolean;
  /** Tool calls executed in the round that just ended. */
  observeToolCalls(count: number): void;
  /**
   * Does the host owe a request now? Only when no request is outstanding, or
   * when a full threshold window has elapsed since the outstanding request
   * (so an unresponsive model is nudged again, but never every round).
   */
  evaluate(): InterimDeliverableRequirement | undefined;
  /** Record that the host injected the interim-answer turn. */
  markRequested(trigger: InterimDeliverableTrigger): void;
  /**
   * The continuation nudge is armed exactly once per host request: when the
   * model answers a request with text only (no tool call), the loop appends
   * one "continue" host turn instead of ending the turn. Consumes the arm;
   * any executed tool call after the request disarms it (the model already
   * continued by itself).
   */
  consumeContinuation(): boolean;
  snapshot(): InterimDeliverableSnapshot;
}

export function createInterimDeliverableTracker(
  policy: InterimDeliverablePolicy,
  nowMs: () => number,
): InterimDeliverableTracker {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`interim deliverable policy ${name} must be a positive safe integer`);
    }
  }
  const startedAt = nowMs();
  let anchorAt = startedAt;          // last deliverable (or turn start)
  let toolCalls = 0;                  // since anchor
  let chars = 0;                      // visible chars since anchor
  let delivered = 0;
  let requested = 0;
  let pending = false;
  let continuationArmed = false;
  let lastTrigger: InterimDeliverableTrigger | undefined;
  // Re-arm window while a request is pending: measured from the request.
  let requestAt = startedAt;
  let requestToolCalls = 0;

  const elapsed = (): number => Math.max(0, nowMs() - anchorAt);

  return {
    observeAssistantText(text) {
      chars += text.length;
    },
    settleRound() {
      if (chars < policy.interimAnswerMinChars) return false;
      delivered++;
      anchorAt = nowMs();
      toolCalls = 0;
      chars = 0;
      pending = false;
      return true;
    },
    observeToolCalls(count) {
      if (count <= 0) return;
      toolCalls += count;
      // The model continued on its own after the request (text + tool call in
      // one response, or a later batch) — the continue nudge is moot.
      continuationArmed = false;
    },
    evaluate() {
      const sinceCalls = pending ? toolCalls - requestToolCalls : toolCalls;
      const sinceMs = pending ? Math.max(0, nowMs() - requestAt) : elapsed();
      let trigger: InterimDeliverableTrigger | undefined;
      if (sinceCalls >= policy.interimAnswerAfterToolCalls) trigger = 'tool-calls';
      else if (sinceMs >= policy.interimAnswerAfterMs) trigger = 'elapsed';
      if (trigger === undefined) return undefined;
      return { trigger, toolCallsSinceDeliverable: toolCalls, elapsedMsSinceDeliverable: elapsed() };
    },
    markRequested(trigger) {
      requested++;
      pending = true;
      continuationArmed = true;
      lastTrigger = trigger;
      requestAt = nowMs();
      requestToolCalls = toolCalls;
    },
    consumeContinuation() {
      if (!continuationArmed) return false;
      continuationArmed = false;
      return true;
    },
    snapshot() {
      return Object.freeze({
        toolCallsSinceDeliverable: toolCalls,
        elapsedMsSinceDeliverable: elapsed(),
        toolCallsLimit: policy.interimAnswerAfterToolCalls,
        elapsedMsLimit: policy.interimAnswerAfterMs,
        minChars: policy.interimAnswerMinChars,
        delivered,
        requested,
        pending,
        ...(lastTrigger ? { lastTrigger } : {}),
      });
    },
  };
}

/**
 * Model-facing protocol text for the injected host turns. STRING POLICY: same
 * rule as `identity.ts` `scratchpadSection` and the `[deckent] …` broker
 * markers — protocol, not a localization surface; English on every lang. The
 * user never sees these lines: the view renders the typed
 * `interim-deliverable` event through the catalog instead.
 */
export const INTERIM_DELIVERABLE_INSTRUCTION = [
  '[deckent] Interim deliverable required now.',
  'Answer in the session language with a short structured status: (1) known so far, (2) remaining, (3) next step.',
  'Then continue the task in the same response by calling the next tool. Do not ask for confirmation.',
].join(' ');

export const INTERIM_CONTINUE_INSTRUCTION = [
  '[deckent] Continue the task now without asking for confirmation.',
  'If nothing remains, say so in one line.',
].join(' ');
