// ─── ApprovalRelay — multi-channel approval notification/decision relay (APR-2) ─
// Governs: strategic-pivot §11.1 (runtime-wide ApprovalBroker follow-up) + APR-2 +
// ADR-G-020 (authority). Built directly on ApprovalBroker (APR-1, sprint-351 task
// 351-005) — this module owns ZERO broker internals; it only subscribes to the
// broker's public 'pending'/'decided' events and calls its public decide() surface.
// Channel adapters (telegram/terminal/dashboard/...) are explicitly OUT of scope
// here — this is the channel-agnostic relay core. A "channel" is any object
// satisfying {@link RelayChannel}: `send()` to push a notification OUT to that
// surface, `onDecision()` to register the handler the relay calls when THAT
// channel resolves a pending request.
//
// Design tenets:
//  • Fan-out on 'pending' — every attached channel receives every pending
//    request, always carrying `maskedArgs` (never the raw value — the
//    ApprovalRequest contract itself has no raw-args field, only an opaque
//    `rawArgsRef` pointer, so this invariant holds by construction).
//  • Cross-broadcast on 'decided' — whichever channel resolved a request (or
//    none, e.g. TTL-expire/CLI/dashboard-direct), every OTHER attached channel
//    is told "resolved via <channel>" so no surface is left showing a stale
//    pending card.
//  • ONE decided-listener drives cross-broadcast for EVERY decision path —
//    relay-mediated (a channel's onDecision -> broker.decide), TTL sweep
//    (broker.expire), or a foreign process (broker.checkForExternalDecisions)
//    — because all of them settle through the SAME broker 'decided' event.
//  • A channel error (send throws/rejects, or a decide() race loses to another
//    channel) is caught and reported via the 'channel-error' event — it NEVER
//    kills the relay or blocks the other channels.

import { EventEmitter } from 'node:events';
import type { ApprovalBroker, ApprovalDecisionInput } from './approval-broker.js';
import type { ApprovalDecision, ApprovalRequest } from './approval-contract.js';

// ─── Channel contract ─────────────────────────────────────────────────────────

/** What a channel reports when its surface resolves a pending request — same
 *  shape as {@link ApprovalDecisionInput} minus `channel` (the relay supplies
 *  that from the attached channel's own name) plus the `requestId` it decided. */
export type ChannelDecisionInput = Omit<ApprovalDecisionInput, 'channel'> & {
  requestId: string;
};

export interface RelayPendingNotification {
  kind: 'pending';
  request: ApprovalRequest;
}

export interface RelayCrossDecidedNotification {
  kind: 'cross-decided';
  request: ApprovalRequest;
  decision: ApprovalDecision;
  /** Human-readable one-liner, e.g. "terminal kanalında karar verildi". */
  message: string;
}

export type RelayNotification = RelayPendingNotification | RelayCrossDecidedNotification;

/**
 * A channel adapter's contract with the relay. Real adapters (telegram,
 * terminal, dashboard, ...) are follow-up work — this module depends only on
 * this shape, never a concrete transport.
 */
export interface RelayChannel {
  /** Push a notification out to this channel's surface. May be async; a
   *  throw/rejection is caught by the relay and reported, never fatal. */
  send(notification: RelayNotification): void | Promise<void>;
  /** Called once, at attach time, with the handler this channel MUST invoke
   *  whenever its surface resolves a pending request (e.g. a Telegram button
   *  press or a terminal keypress decoded into a decision). */
  onDecision(handler: (input: ChannelDecisionInput) => void): void;
}

export interface RelayChannelErrorInfo {
  channel: string;
  error: unknown;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ApprovalRelayErrorCode = 'APR_RELAY_DUPLICATE_CHANNEL';

export class ApprovalRelayError extends Error {
  constructor(
    message: string,
    public readonly code: ApprovalRelayErrorCode,
  ) {
    super(message);
    this.name = 'ApprovalRelayError';
  }
}

// ─── Typed EventEmitter surface ───────────────────────────────────────────────

export interface ApprovalRelay {
  /** A channel's send/decide path threw or rejected — never fatal, always reported here. */
  on(event: 'channel-error', listener: (info: RelayChannelErrorInfo) => void): this;
  once(event: 'channel-error', listener: (info: RelayChannelErrorInfo) => void): this;
  off(event: 'channel-error', listener: (info: RelayChannelErrorInfo) => void): this;
  emit(event: 'channel-error', info: RelayChannelErrorInfo): boolean;
}

/**
 * Multi-channel approval relay (APR-2 core). Wraps ONE {@link ApprovalBroker}
 * and fans its 'pending'/'decided' events out to N attached channels, and
 * routes a channel-originated decision back into the broker's public
 * `decide()` — without ever touching broker internals.
 */
export class ApprovalRelay extends EventEmitter {
  private readonly broker: ApprovalBroker;
  private readonly channels = new Map<string, RelayChannel>();
  private readonly handlePending: (request: ApprovalRequest) => void;
  private readonly handleDecided: (decision: ApprovalDecision, request: ApprovalRequest | undefined) => void;

  constructor(broker: ApprovalBroker) {
    super();
    this.broker = broker;
    this.handlePending = (request) => {
      this.dispatch(undefined, { kind: 'pending', request });
    };
    this.handleDecided = (decision, request) => {
      // No locally-known request (foreign-only broker instance) — nothing to
      // render a cross-broadcast card from; skip rather than notify with a gap.
      if (!request) return;
      this.dispatch(decision.channel, {
        kind: 'cross-decided',
        request,
        decision,
        message: `${decision.channel} kanalında karar verildi`,
      });
    };
    this.broker.on('pending', this.handlePending);
    this.broker.on('decided', this.handleDecided);
  }

  /** Currently attached channel names, in attach order. */
  get channelNames(): string[] {
    return [...this.channels.keys()];
  }

  /**
   * Attach a channel under `name`. Registers this channel's `onDecision`
   * handler so any decision it reports is routed through `broker.decide()`
   * with `channel: name`. Throws {@link ApprovalRelayError} on a duplicate name.
   */
  attachChannel(name: string, channel: RelayChannel): void {
    if (this.channels.has(name)) {
      throw new ApprovalRelayError(`channel already attached: ${name}`, 'APR_RELAY_DUPLICATE_CHANNEL');
    }
    this.channels.set(name, channel);
    channel.onDecision((input) => this.handleChannelDecision(name, input));
  }

  /** Detach a previously attached channel. Returns whether one was removed. */
  detachChannel(name: string): boolean {
    return this.channels.delete(name);
  }

  /** Stop listening to the broker. Attached channels are left as-is —
   *  call {@link detachChannel} first if they must also be torn down. */
  dispose(): void {
    this.broker.off('pending', this.handlePending);
    this.broker.off('decided', this.handleDecided);
  }

  // ─── internals ──────────────────────────────────────────────────────────

  private handleChannelDecision(channelName: string, input: ChannelDecisionInput): void {
    const { requestId, ...decisionInput } = input;
    try {
      this.broker.decide(requestId, { ...decisionInput, channel: channelName });
    } catch (error) {
      this.reportChannelError(channelName, error);
    }
  }

  /** Fan a notification out to every attached channel except `excludeChannel`. */
  private dispatch(excludeChannel: string | undefined, notification: RelayNotification): void {
    for (const [name, channel] of this.channels) {
      if (name === excludeChannel) continue;
      try {
        const result = channel.send(notification);
        if (result instanceof Promise) {
          result.catch((error: unknown) => this.reportChannelError(name, error));
        }
      } catch (error) {
        this.reportChannelError(name, error);
      }
    }
  }

  private reportChannelError(channel: string, error: unknown): void {
    this.emit('channel-error', { channel, error });
  }
}
