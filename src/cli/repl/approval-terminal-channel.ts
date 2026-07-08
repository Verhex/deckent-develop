// ─── ApprovalTerminalChannel — Relay↔EventStream↔ApprovalCard bridge (APR-TERM-CHANNEL) ─
// Governs: strategic-pivot §11.1 (runtime-wide ApprovalBroker follow-up) + ADR-G-020
// (authority). Built directly on ApprovalRelay (APR-2) + ApprovalEventStream
// (APR-EVENTSTREAM) via their PUBLIC surfaces only — this module owns ZERO relay or
// eventstream internals.
//
// Pure bridge — deliberately does NOT touch app.tsx or approval-card.tsx (that wiring
// is follow-up work). It only produces the two pieces ApprovalCard's props already
// expect (`events` + `onDecide`), sourced from a real relay/eventstream pair:
//
//  • Read path (relay-pending -> eventstream-publish -> card-queue enqueue seam):
//    subscribes ONE client to the given ApprovalEventStream and exposes that
//    subscription's `events` AsyncIterable verbatim. ApprovalCard's own existing
//    ingest loop (createApprovalCardQueue) is the consumer — this module owns no
//    queue of its own, so there is no second, duplicate copy of pending-request state.
//  • Write path (card-decision -> relay.onDecision): attaches a write-only
//    RelayChannel to the relay — the mirror image of ApprovalEventStream's read-only
//    channel (whose `onDecision` is a no-op; here `send` is the no-op, since the read
//    side already flows through the eventstream subscription above). `onDecision`'s
//    handler is registered synchronously inside `relay.attachChannel`, so `decide()` is
//    always wired to it before this factory returns.

import type { ApprovalDecisionInput } from '../../core/approval-broker.js';
import type { ApprovalEventStream, ApprovalStreamEvent, ApprovalStreamFilter } from '../../core/approval-eventstream.js';
import type { ApprovalRelay, ChannelDecisionInput, RelayChannel } from '../../core/approval-relay.js';

export interface ApprovalTerminalChannelOptions {
  /** Relay channel name this bridge attaches under, AND (unless `clientId` overrides
   *  it) the eventstream client id it subscribes as. Defaults to `'terminal'`. */
  channelName?: string;
  /** Eventstream client id override, when `channelName` collides with another
   *  subscriber. Defaults to `channelName`. */
  clientId?: string;
  /** Forwarded verbatim to `ApprovalEventStream.subscribe`. */
  filter?: ApprovalStreamFilter;
}

export interface ApprovalTerminalChannel {
  /** Pass straight through to `ApprovalCardProps.events`. */
  events: AsyncIterable<ApprovalStreamEvent>;
  /** Pass straight through to `ApprovalCardProps.onDecide` — same signature. Routes
   *  the decision through the relay's `terminal` channel (the relay supplies the real
   *  `channel` name; any `channel` field on `input` is ignored). */
  decide(id: string, input: ApprovalDecisionInput): void;
  /** Unsubscribe from the eventstream and detach the relay channel. */
  dispose(): void;
}

/**
 * Wire ONE terminal-surface bridge between `relay` and `eventStream` (APR-TERM-CHANNEL).
 * `eventStream` must already be attached to `relay` (its normal construction contract) —
 * this factory only subscribes a client to it; it never constructs or attaches an
 * eventstream itself.
 */
export function createApprovalTerminalChannel(
  relay: ApprovalRelay,
  eventStream: ApprovalEventStream,
  options: ApprovalTerminalChannelOptions = {},
): ApprovalTerminalChannel {
  const channelName = options.channelName ?? 'terminal';
  const clientId = options.clientId ?? channelName;

  // attachChannel first: in the common (default-name) case a duplicate collides on
  // this SAME name for both the relay channel and the eventstream client id, so
  // failing here — before subscribing — never leaves a dangling subscription behind.
  let decisionHandler: ((input: ChannelDecisionInput) => void) | null = null;
  const channel: RelayChannel = {
    send: () => {
      // Read side flows through the eventstream subscription below — a deliberate
      // no-op, mirroring ApprovalEventStream's own read-only channel's onDecision no-op.
    },
    onDecision: (handler) => {
      decisionHandler = handler;
    },
  };
  relay.attachChannel(channelName, channel);

  const subscription = eventStream.subscribe(clientId, options.filter);

  const decide = (id: string, input: ApprovalDecisionInput): void => {
    // Disposed (or, unreachable in practice, pre-attach) — no live handler to
    // route through; a no-op rather than a throw keeps a late/racing caller safe.
    if (!decisionHandler) return;
    const { channel: _channel, ...rest } = input;
    decisionHandler({ ...rest, requestId: id });
  };

  const dispose = (): void => {
    subscription.unsubscribe();
    relay.detachChannel(channelName);
    // Drop the reference to the relay's registered handler closure so post-dispose
    // decide() calls are a no-op instead of silently still routing through the
    // (now-detached) relay channel — otherwise this is a dangling-handler leak.
    decisionHandler = null;
  };

  return { events: subscription.events, decide, dispose };
}
