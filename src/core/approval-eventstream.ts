// ─── ApprovalEventStream — multi-client publish stream (APR-EVENTSTREAM) ──────
// Governs: strategic-pivot §11.1 (runtime-wide ApprovalBroker follow-up) + APR-2 +
// ADR-G-020 (authority). Built directly on ApprovalRelay (APR-2, sprint-352 task
// 352-011) via its PUBLIC attachChannel/detachChannel surface only — this module
// owns ZERO relay internals, exactly like the relay owns zero broker internals.
//
// This is the read side: it attaches ONE synthetic `RelayChannel` to the relay
// and fans every `pending` / `cross-decided` notification the relay sends that
// channel out to N independently-filtered subscribing clients. Client-initiated
// decisions (a subscriber resolving an approval) are explicitly OUT of scope —
// terminal/dashboard/API adapters that would wire that up are follow-up work —
// so `onDecision` is registered (the RelayChannel contract requires it) but is
// an intentional no-op; this channel's name therefore never appears as a
// decision's `channel`, so it always observes every cross-decided broadcast.
//
// Design tenets:
//  • Pending cache — every ingested `pending` notification is cached by request
//    id, every `cross-decided` retires it. This is what backs late-join
//    backfill: a client subscribing after requests are already pending gets
//    them immediately, through the SAME bounded/filtered path as live events.
//  • Bounded per-client queue, drop-OLDEST — a lagging/disconnected client
//    never grows its buffer past `maxBuffer`; the oldest unread item is
//    dropped to make room for the newest. A single coalesced `dropped` marker
//    (carrying the count) is delivered on the next read, before normal items
//    resume, so a client always knows it missed something instead of silently
//    replaying a truncated history as if it were complete.
//  • AsyncIterable per client — `subscribe()` returns a pull-based iterable.
//    `unsubscribe()` (or a `for await` loop breaking early, which invokes the
//    iterator's `return()`) closes the queue AND removes it from the stream's
//    client map — no dangling waiter promise, no leaked map entry, no further
//    work done for a closed client on the next relay notification.

import type { ApprovalRequest } from './approval-contract.js';
import type { ApprovalRelay, ChannelDecisionInput, RelayChannel, RelayNotification } from './approval-relay.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Predicate deciding whether a given relay notification reaches a specific
 *  subscriber. Applied identically to live events and late-join backfill. */
export type ApprovalStreamFilter = (notification: RelayNotification) => boolean;

/** Synthesized marker delivered once a client's queue has dropped one or more
 *  events under backpressure — never a per-drop event, always coalesced. */
export interface ApprovalStreamDroppedEvent {
  kind: 'dropped';
  /** Count of events dropped (oldest-first) since this client last read. */
  droppedCount: number;
}

export type ApprovalStreamEvent = RelayNotification | ApprovalStreamDroppedEvent;

export interface ApprovalEventStreamOptions {
  /** Channel name this stream attaches to the relay under. Defaults to
   *  `'event-stream'`. Override only if that name collides with another
   *  channel already attached to the same relay. */
  channelName?: string;
  /** Default bounded-queue capacity for every subscribing client, unless a
   *  client overrides it in `subscribe()`. Defaults to 256. */
  maxBuffer?: number;
}

export interface ApprovalEventStreamSubscribeOptions {
  /** Per-client override of the stream's default `maxBuffer`. */
  maxBuffer?: number;
}

export interface ApprovalEventStreamSubscription {
  clientId: string;
  /** Pull-based, filtered, backfilled, backpressure-bounded event stream. */
  events: AsyncIterable<ApprovalStreamEvent>;
  /** Stop receiving events and release this client's queue. Idempotent. */
  unsubscribe(): void;
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export type ApprovalEventStreamErrorCode = 'APR_STREAM_DUPLICATE_CLIENT';

export class ApprovalEventStreamError extends Error {
  constructor(
    message: string,
    public readonly code: ApprovalEventStreamErrorCode,
  ) {
    super(message);
    this.name = 'ApprovalEventStreamError';
  }
}

// ─── Default constants ─────────────────────────────────────────────────────────

const DEFAULT_CHANNEL_NAME = 'event-stream';
const DEFAULT_MAX_BUFFER = 256;

// ─── Per-client bounded async queue ────────────────────────────────────────────

/** One subscribing client's filtered, bounded, pull-based event queue. Not
 *  exported — an implementation detail of {@link ApprovalEventStream}. */
class ClientQueue {
  readonly clientId: string;
  private readonly filter: ApprovalStreamFilter | undefined;
  private readonly maxBuffer: number;
  private readonly buffer: ApprovalStreamEvent[] = [];
  private droppedCount = 0;
  private waiter: ((result: IteratorResult<ApprovalStreamEvent>) => void) | undefined;
  private closed = false;
  private onClose: (() => void) | undefined;

  constructor(clientId: string, filter: ApprovalStreamFilter | undefined, maxBuffer: number) {
    this.clientId = clientId;
    this.filter = filter;
    this.maxBuffer = maxBuffer;
  }

  /** Registered once by the owning stream to remove this client from its map
   *  when the queue closes, however that closing happens (explicit unsubscribe
   *  or an early `for await` break invoking the iterator's `return()`). */
  setOnClose(handler: () => void): void {
    this.onClose = handler;
  }

  /** Enqueue a notification for this client, applying its filter (if any) and
   *  drop-oldest backpressure. A no-op once the queue is closed. */
  push(notification: RelayNotification): void {
    if (this.closed) return;
    if (this.filter && !this.filter(notification)) return;
    if (this.buffer.length >= this.maxBuffer) {
      this.buffer.shift();
      this.droppedCount += 1;
    }
    this.buffer.push(notification);
    this.settleWaiter();
  }

  next(): Promise<IteratorResult<ApprovalStreamEvent>> {
    const item = this.dequeue();
    if (item !== undefined) {
      return Promise.resolve({ value: item, done: false });
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  /** Idempotent. Drains buffered state, wakes any parked reader with
   *  `done: true`, and notifies the owning stream to drop this client. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer.length = 0;
    this.droppedCount = 0;
    const waiter = this.waiter;
    this.waiter = undefined;
    if (waiter) waiter({ value: undefined, done: true });
    this.onClose?.();
  }

  /** A coalesced `dropped` marker (if any drops are pending) always takes
   *  priority over the next buffered item — delivered exactly once per
   *  drop-run, then normal items resume. */
  private dequeue(): ApprovalStreamEvent | undefined {
    if (this.droppedCount > 0) {
      const dropped: ApprovalStreamDroppedEvent = { kind: 'dropped', droppedCount: this.droppedCount };
      this.droppedCount = 0;
      return dropped;
    }
    return this.buffer.shift();
  }

  private settleWaiter(): void {
    if (!this.waiter) return;
    const item = this.dequeue();
    if (item === undefined) return;
    const waiter = this.waiter;
    this.waiter = undefined;
    waiter({ value: item, done: false });
  }
}

function toAsyncIterable(queue: ClientQueue): AsyncIterable<ApprovalStreamEvent> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<ApprovalStreamEvent> {
      return {
        next: () => queue.next(),
        return: () => {
          queue.close();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

// ─── ApprovalEventStream ────────────────────────────────────────────────────────

/**
 * Multi-client publish stream over ONE {@link ApprovalRelay} (APR-EVENTSTREAM).
 * Attaches a single synthetic channel to the relay and fans its notifications
 * out to N independently-filtered, independently-buffered subscribing clients.
 */
export class ApprovalEventStream {
  private readonly relay: ApprovalRelay;
  private readonly channelName: string;
  private readonly defaultMaxBuffer: number;
  private readonly clients = new Map<string, ClientQueue>();
  private readonly pendingById = new Map<string, ApprovalRequest>();
  private disposed = false;

  constructor(relay: ApprovalRelay, opts: ApprovalEventStreamOptions = {}) {
    this.relay = relay;
    this.channelName = opts.channelName ?? DEFAULT_CHANNEL_NAME;
    this.defaultMaxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER;

    const channel: RelayChannel = {
      send: (notification) => this.ingest(notification),
      onDecision: (_handler: (input: ChannelDecisionInput) => void) => {
        // Read-only publish stream: no client-initiated decisions in this task
        // (terminal/dashboard/API adapters that decide are explicit follow-up).
      },
    };
    this.relay.attachChannel(this.channelName, channel);
  }

  /** Currently subscribed client ids, in subscribe order. */
  get clientIds(): string[] {
    return [...this.clients.keys()];
  }

  /**
   * Subscribe `clientId` to this stream. Immediately backfills every
   * currently-pending request this stream has observed (filtered like any
   * live event), then continues with live `pending`/`cross-decided`
   * notifications. Throws {@link ApprovalEventStreamError} on a duplicate
   * `clientId`.
   */
  subscribe(
    clientId: string,
    filter?: ApprovalStreamFilter,
    opts: ApprovalEventStreamSubscribeOptions = {},
  ): ApprovalEventStreamSubscription {
    if (this.clients.has(clientId)) {
      throw new ApprovalEventStreamError(`client already subscribed: ${clientId}`, 'APR_STREAM_DUPLICATE_CLIENT');
    }
    const queue = new ClientQueue(clientId, filter, opts.maxBuffer ?? this.defaultMaxBuffer);
    queue.setOnClose(() => this.clients.delete(clientId));
    this.clients.set(clientId, queue);

    for (const request of this.pendingById.values()) {
      queue.push({ kind: 'pending', request });
    }

    return {
      clientId,
      events: toAsyncIterable(queue),
      unsubscribe: () => queue.close(),
    };
  }

  /** Detach from the relay (via its public `detachChannel`) and close every
   *  still-open client queue. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.relay.detachChannel(this.channelName);
    for (const queue of [...this.clients.values()]) queue.close();
    this.pendingById.clear();
  }

  private ingest(notification: RelayNotification): void {
    if (notification.kind === 'pending') {
      this.pendingById.set(notification.request.id, notification.request);
    } else {
      this.pendingById.delete(notification.request.id);
    }
    for (const queue of this.clients.values()) {
      queue.push(notification);
    }
  }
}
