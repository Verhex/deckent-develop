// src/agent/interim-deliverable.ts
// 7114 / 7114-b TERMINAL-INTERACTION-FLOW-001 — host-enforced deliverables
//
// Measured incident (native terminal, 2026-09-09 15:40Z): ~40 tool calls over
// 665 s with NO visible answer; the user interrupted. "Ne durumdasin?" then
// produced a full structured status in 24 s. 7114 injected a host turn when a
// call/time bound was crossed, but it counted ANY accumulated visible text as
// a deliverable, so the narration contract's own one-line preambles kept
// resetting the counters and the bound was never reached (owner run
// 2026-09-09 21:39Z: 28 calls / 1092 s, zero interim answers, session
// chat-2026-09-09T21-39-06-106Z-2ar0mq).
//
// 7114-b makes the host's promise honest:
//   - a DELIVERY is a substantive response that proposes NO tool call: the
//     host's ask forbids a tool call in the answering response, so narration
//     that introduces more work can never pass as an answer, and short lines
//     are never summed into one;
//   - the wall clock runs from the last real delivery, and an in-flight round
//     that crosses it is reported as OVERDUE while it is still streaming (the
//     host cannot preempt a non-cooperative provider stream; it can and does
//     tell the truth about it, and the turn's own wall budget still ends it);
//   - a configured per-turn tool-call ceiling forces one honest answer instead
//     of an unbounded tool spiral;
//   - repeated failures against the SAME target close that line of attack;
//     target identity is exact, so different work never false-positives;
//   - host nudges are finite: after the configured ceiling the host stops
//     asking and leaves the turn to its own budgets.
//
// Pure and clock-injected (fake-clock testable). One instance per turn; the
// session snapshots it for `/context`. No human-facing strings live here.

export interface InterimDeliverablePolicy {
  readonly interimAnswerAfterToolCalls: number;
  readonly interimAnswerAfterMs: number;
  /** Floor for ONE round's visible answer. Text is never summed across rounds. */
  readonly interimAnswerMinChars: number;
  /** Host requests per turn. After this the host stops nudging (never infinite). */
  readonly maxInterimRequestsPerTurn: number;
  /** Tool calls this turn before the host requires a final honest answer. */
  readonly maxToolCallsPerTurn: number;
  /** Consecutive failures against the SAME target before that line is closed. */
  readonly maxConsecutiveFailuresPerTarget: number;
}

export type InterimDeliverableTrigger = 'tool-calls' | 'elapsed';
/** What the host requires next. `final` and `failure-stop` are terminal asks. */
export type InterimDemandKind = 'interim' | 'final' | 'failure-stop';

export interface InterimDemand {
  readonly kind: InterimDemandKind;
  readonly trigger?: InterimDeliverableTrigger;
  readonly toolCallsSinceDeliverable: number;
  readonly elapsedMsSinceDeliverable: number;
  /** failure-stop only: the exact target that failed repeatedly. */
  readonly target?: string;
  readonly attempts?: number;
}

/** Read model for `/context`, the view event and the audit trail. */
export interface InterimDeliverableSnapshot {
  readonly toolCallsSinceDeliverable: number;
  readonly elapsedMsSinceDeliverable: number;
  readonly toolCallsLimit: number;
  readonly elapsedMsLimit: number;
  readonly minChars: number;
  /** Real deliverables this turn: host-requested interim answers and the final one. */
  readonly delivered: number;
  /** Host turns injected this turn (interim + final + failure-stop). */
  readonly requested: number;
  /** Requests still available before the host stops nudging. */
  readonly requestsRemaining: number;
  /** A host request is outstanding and no real answer has landed yet. */
  readonly pending: boolean;
  /** The wall-clock bound passed while a round was still streaming. */
  readonly overdue: boolean;
  /** Tool calls executed this turn against the per-turn ceiling. */
  readonly toolCallsThisTurn: number;
  readonly toolCallsPerTurnLimit: number;
  /** The turn's tool budget is spent; only an answer may follow. */
  readonly toolBudgetExhausted: boolean;
  readonly lastTrigger?: InterimDeliverableTrigger;
  /** Target whose repeated failures closed that line of attack. */
  readonly stoppedTarget?: string;
}

/** What one finished round actually was, as the HOST observed it. */
export type RoundOutcome = 'delivered' | 'narration' | 'silent';

export interface InterimDeliverableTracker {
  /**
   * Settle the round that just finished. `text` is the visible assistant text
   * of THIS round; `toolCalls` is how many calls it proposed. A delivery is a
   * substantive response that proposes NO tool call — the one boundary the host
   * can actually observe. A long reply that still carries a tool call is
   * narration, whether or not a host request was outstanding.
   */
  settleRound(input: { readonly text: string; readonly toolCalls: number }): RoundOutcome;
  /** Tool calls executed in the round that just ended. */
  observeToolCalls(count: number): void;
  /** One executed tool result, for the same-target failure guard. */
  observeToolOutcome(input: { readonly tool: string; readonly target: string; readonly ok: boolean }): void;
  /** The wall-clock bound passed while a round is still in flight. */
  markOverdue(): boolean;
  /** Milliseconds until the wall-clock bound, or 0 when it has passed. */
  msUntilDue(): number;
  /** What the host owes now, if anything. */
  evaluate(): InterimDemand | undefined;
  /**
   * 7113-E D1 — is the turn's FIRST real answer owed right now?
   *
   * The cadence answers "has it been long enough since the LAST delivery"; with
   * no delivery yet there is nothing to measure from, so a long reading could
   * produce its first word only after the full interval (measured: 90 s). This
   * is the separate question — "has this turn said anything at all?" — and it
   * is deliberately NOT a cadence change: the caller must still have real,
   * validated material, and every request it authorizes is charged to the SAME
   * finite per-turn allowance, so it can never widen the budget.
   */
  firstAnswerDue(): boolean;
  /** Record that the host injected the demand's turn. */
  markRequested(demand: InterimDemand): void;
  /**
   * The continuation nudge is armed exactly once per interim request: when the
   * model answers with text only, the loop appends one "continue" host turn
   * instead of ending the turn. A final/failure-stop demand never arms it:
   * those asks end the turn honestly.
   */
  consumeContinuation(): boolean;
  /** True once the turn's tool budget is spent: the loop must refuse new calls. */
  isToolBudgetExhausted(): boolean;
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
  let anchorAt = startedAt;            // last REAL delivery (or turn start)
  let toolCalls = 0;                    // since the anchor
  let toolCallsThisTurn = 0;            // against the per-turn ceiling
  let delivered = 0;
  let requested = 0;
  let pending = false;
  let overdue = false;
  let continuationArmed = false;
  let lastTrigger: InterimDeliverableTrigger | undefined;
  let stoppedTarget: string | undefined;
  let finalDemanded = false;
  // Re-arm window while a request is outstanding: measured from the request.
  let requestAt = startedAt;
  let requestToolCalls = 0;
  // Same-target failure guard: exact identity, consecutive failures only.
  let failingTarget: string | undefined;
  let failingAttempts = 0;
  let pendingFailureStop: { target: string; attempts: number } | undefined;

  const elapsed = (): number => Math.max(0, nowMs() - anchorAt);
  const resetToDelivery = (): void => {
    delivered++;
    anchorAt = nowMs();
    toolCalls = 0;
    pending = false;
    overdue = false;
  };

  return {
    settleRound({ text, toolCalls: proposed }) {
      // The host cannot read intent, so the boundary is STRUCTURAL: an answer is
      // a substantive response that proposes NO tool call. Anything that carries
      // a tool call is narration introducing more work — including a long reply
      // to an outstanding host request, which is exactly how the measured
      // spiral kept "answering" while never answering (Astra repro
      // 2026-09-10T00:27Z). The host's ask therefore forbids a tool call in the
      // same response, and the continue nudge resumes the work afterwards.
      const substantive = text.trim().length >= policy.interimAnswerMinChars;
      if (substantive && proposed === 0) {
        resetToDelivery();
        return 'delivered';
      }
      return text.trim().length > 0 ? 'narration' : 'silent';
    },
    observeToolCalls(count) {
      if (count <= 0) return;
      toolCalls += count;
      toolCallsThisTurn += count;
      // The model continued on its own after the request: the nudge is moot.
      continuationArmed = false;
    },
    observeToolOutcome({ tool, target, ok }) {
      const identity = `${tool} ${target}`;
      if (ok) {
        if (failingTarget === identity) { failingTarget = undefined; failingAttempts = 0; }
        return;
      }
      if (failingTarget !== identity) { failingTarget = identity; failingAttempts = 0; }
      failingAttempts++;
      if (failingAttempts >= policy.maxConsecutiveFailuresPerTarget && stoppedTarget !== identity) {
        pendingFailureStop = { target: identity, attempts: failingAttempts };
      }
    },
    markOverdue() {
      if (overdue) return false;
      overdue = true;
      return true;
    },
    msUntilDue() {
      const since = pending ? Math.max(0, nowMs() - requestAt) : elapsed();
      return Math.max(0, policy.interimAnswerAfterMs - since);
    },
    evaluate() {
      const base = { toolCallsSinceDeliverable: toolCalls, elapsedMsSinceDeliverable: elapsed() };
      // A closed line of attack is the most urgent honest ask.
      if (pendingFailureStop) {
        return { kind: 'failure-stop', ...base, target: pendingFailureStop.target, attempts: pendingFailureStop.attempts };
      }
      // The turn's tool budget is spent: one honest answer, asked exactly once.
      if (toolCallsThisTurn >= policy.maxToolCallsPerTurn && !finalDemanded) {
        return { kind: 'final', ...base };
      }
      // Finite nudging: after the ceiling the turn's own budgets take over.
      if (requested >= policy.maxInterimRequestsPerTurn) return undefined;
      const sinceCalls = pending ? toolCalls - requestToolCalls : toolCalls;
      const sinceMs = pending ? Math.max(0, nowMs() - requestAt) : elapsed();
      const trigger: InterimDeliverableTrigger | undefined = sinceCalls >= policy.interimAnswerAfterToolCalls
        ? 'tool-calls'
        : sinceMs >= policy.interimAnswerAfterMs ? 'elapsed' : undefined;
      if (trigger === undefined) return undefined;
      return { kind: 'interim', trigger, ...base };
    },
    firstAnswerDue() {
      // Nothing delivered yet, and the finite ask budget still has room.
      return delivered === 0 && requested < policy.maxInterimRequestsPerTurn;
    },
    markRequested(demand) {
      requested++;
      pending = true;
      overdue = false;
      requestAt = nowMs();
      requestToolCalls = toolCalls;
      if (demand.kind === 'interim') {
        continuationArmed = true;
        lastTrigger = demand.trigger;
        return;
      }
      // A terminal ask never arms a "keep going" nudge.
      continuationArmed = false;
      if (demand.kind === 'final') finalDemanded = true;
      if (demand.kind === 'failure-stop' && demand.target !== undefined) {
        stoppedTarget = demand.target;
        pendingFailureStop = undefined;
        failingTarget = undefined;
        failingAttempts = 0;
      }
    },
    consumeContinuation() {
      if (!continuationArmed) return false;
      continuationArmed = false;
      return true;
    },
    isToolBudgetExhausted() {
      return toolCallsThisTurn >= policy.maxToolCallsPerTurn;
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
        requestsRemaining: Math.max(0, policy.maxInterimRequestsPerTurn - requested),
        pending,
        overdue,
        toolCallsThisTurn,
        toolCallsPerTurnLimit: policy.maxToolCallsPerTurn,
        toolBudgetExhausted: toolCallsThisTurn >= policy.maxToolCallsPerTurn,
        ...(lastTrigger ? { lastTrigger } : {}),
        ...(stoppedTarget ? { stoppedTarget } : {}),
      });
    },
  };
}

/**
 * Model-facing protocol text for the injected host turns. STRING POLICY: same
 * rule as `identity.ts` `scratchpadSection` and the `[deckent] ...` broker
 * markers: protocol, not a localization surface; English on every lang, and
 * each one tells the model to answer in the SESSION language. The user never
 * sees these lines: the view renders the typed `interim-deliverable` event
 * through the catalog instead.
 */
export const INTERIM_DELIVERABLE_INSTRUCTION = [
  '[deckent] Interim deliverable required now.',
  'Answer in the session language with a short structured status: (1) known so far, (2) remaining, (3) next step.',
  'This is the answer the user reads, not a preamble for the next tool call.',
  'Do NOT call a tool in this response — the answer must stand alone.',
  'You will be told to continue immediately afterwards; do not ask for confirmation.',
].join(' ');

export const INTERIM_CONTINUE_INSTRUCTION = [
  '[deckent] Continue the task now without asking for confirmation.',
  'If nothing remains, say so in one line.',
].join(' ');

/** The per-turn tool ceiling is spent: answer honestly with what is in hand. */
/**
 * 7113-E B-2 — the ask for a real interim answer DURING a long reference
 * program. The model is given exactly one verified digest payload and the byte
 * ranges it is bound to; it may not go past them, and it must say that the
 * reading is still in progress. No tool call is possible here (tools=[]).
 */
export const REFERENCE_INTERIM_INSTRUCTION = [
  'You are answering DURING an ongoing reading of a large source.',
  'Use ONLY the supplied verified digest payload and its citations; you have no other access.',
  'Write 1-3 short sentences of substance for the user, then state plainly that the reading is still in progress and this is partial.',
  'Do not invent content beyond the payload, do not restate the schema, do not describe your process, and do not promise what you will do next.',
].join(' ');

export const INTERIM_FINAL_INSTRUCTION = [
  '[deckent] The tool budget for this turn is spent; no further tool calls will run.',
  'Answer in the session language now with what you actually have: (1) findings and their evidence,',
  '(2) what is still unknown, (3) the exact next step you would take.',
  'Do not claim the task is complete if it is not.',
].join(' ');

/** Repeated failures against one exact target: close that line, keep the turn honest. */
export const INTERIM_FAILURE_STOP_INSTRUCTION = [
  '[deckent] Repeated attempts against the same target failed and that line of attack is now closed.',
  'Do not retry it. Answer in the session language with what you already know, say plainly what could not be done,',
  'and either continue with a genuinely different approach or state the next step for the user.',
].join(' ');

/** Typed result for a call refused after the turn's tool budget was spent. */
export const TOOL_BUDGET_EXHAUSTED_RESULT = '[deckent] tool budget for this turn is exhausted; answer with what you have';
