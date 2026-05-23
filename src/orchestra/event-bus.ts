// ═══ EventBus Abstraction ═══════════════════════════════════════════
// In-process pub/sub layer on top of the JSONL event stream.
// Sprint 145 — Task 145-003
//
// Design:
//   - publish(): emit DeckentEvent to in-process subscribers
//   - subscribe(): filtered listener (sprintId + channels), returns unsubscribe
//   - tail(): read last N events from JSONL file (backfill for new subscribers)
//   - watchFile(): cross-process event detection via fs.watch
//   - Singleton export: eventBus

import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { watch, existsSync, type FSWatcher, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import type { DeckentEvent, ChannelCode } from './event-stream.js';
import { DECKENT_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';
import {
  setNotificationDispatcher,
  type NotifyBusEvent,
} from '../core/notify-registry.js';

// ─── Types ───────────────────────────────────────────────────────

/** Event wrapper that includes sprintId context (not part of DeckentEvent wire format). */
export interface BusEvent {
  sprintId: string;
  event: DeckentEvent;
}

export type SubscriberFn = (event: DeckentEvent) => void | Promise<void>;

interface Subscription {
  sprintId: string;
  channels: ChannelCode[] | undefined;
  fn: SubscriberFn;
}

// ─── Path Helper ────────────────────────────────────────────────

function eventsFilePath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, `${sprintId}-events.jsonl`);
}

// ─── EventBus Class ─────────────────────────────────────────────

/**
 * In-process event bus that wraps Node.js EventEmitter.
 * Provides filtered subscriptions and JSONL file tailing.
 *
 * Usage:
 *   eventBus.subscribe('sprint-145', [CHANNELS.NOTIFY], (event) => { ... });
 *   eventBus.publish(event);  // called automatically by writeEvent()
 */
export class EventBus extends EventEmitter {
  private subscriptions = new Map<number, Subscription>();
  private nextSubId = 1;
  private watchers = new Map<string, FSWatcher>();
  private watcherOffsets = new Map<string, number>();

  constructor() {
    super();
    // Prevent MaxListeners warnings for high subscriber counts
    this.setMaxListeners(100);
  }

  /**
   * Publish an event to all matching in-process subscribers.
   * Never throws — exceptions in subscriber handlers are swallowed.
   *
   * @param event - The DeckentEvent to publish
   * @param sprintId - Sprint context for filtering (passed by writeEvent)
   */
  publish(event: DeckentEvent, sprintId?: string): void {
    for (const [, sub] of this.subscriptions) {
      // Filter: sprintId mismatch → skip
      if (sprintId && sub.sprintId !== '*' && sub.sprintId !== sprintId) {
        continue;
      }

      // Filter: channels array provided and event.channel not in list → skip
      if (sub.channels && sub.channels.length > 0) {
        if (!sub.channels.includes(event.channel as ChannelCode)) {
          continue;
        }
      }

      try {
        const result = sub.fn(event);
        // If subscriber returns a promise, swallow rejection
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((err) => {
            debugLog('event-bus:publish', `Subscriber error (async): ${err}`);
          });
        }
      } catch (err) {
        // Sync error — swallow to protect event stream flow
        debugLog('event-bus:publish', `Subscriber error (sync): ${err}`);
      }
    }

    // Also emit the raw 'event' event for direct EventEmitter listeners
    try {
      this.emit('event', event);
    } catch {
      // swallow
    }
  }

  /**
   * Subscribe to events with sprintId and channel filtering.
   *
   * @param sprintId - Sprint to subscribe to (e.g. 'sprint-145') or '*' for all
   * @param channels - Channel codes to filter on, or undefined for all channels
   * @param fn - Subscriber callback
   * @returns Unsubscribe function
   */
  subscribe(
    sprintId: string,
    channels: ChannelCode[] | undefined,
    fn: SubscriberFn,
  ): () => void {
    const subId = this.nextSubId++;
    this.subscriptions.set(subId, { sprintId, channels, fn });

    return () => {
      this.subscriptions.delete(subId);
    };
  }

  /**
   * Read the last N events from the sprint's JSONL event file.
   * Returns empty array if file doesn't exist or is empty.
   *
   * @param projectRoot - Project root directory
   * @param sprintId - Sprint identifier
   * @param n - Number of recent events to return
   */
  async tail(projectRoot: string, sprintId: string, n: number): Promise<DeckentEvent[]> {
    const filePath = eventsFilePath(projectRoot, sprintId);

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);

      // Take last N lines
      const lastLines = lines.slice(-n);
      const events: DeckentEvent[] = [];

      for (const line of lastLines) {
        try {
          const event = JSON.parse(line) as DeckentEvent;
          events.push(event);
        } catch {
          // Skip malformed lines
          debugLog('event-bus:tail', `Skipping malformed line: ${line.slice(0, 80)}`);
        }
      }

      return events;
    } catch {
      // File doesn't exist or read error → empty array
      return [];
    }
  }

  /**
   * Watch the sprint's JSONL file for new events (cross-process).
   * New lines are parsed and published to in-process subscribers.
   *
   * @param projectRoot - Project root directory
   * @param sprintId - Sprint identifier
   * @returns FSWatcher instance
   */
  watchFile(projectRoot: string, sprintId: string): FSWatcher {
    const filePath = eventsFilePath(projectRoot, sprintId);
    const watchKey = `${projectRoot}:${sprintId}`;

    // Clean up existing watcher for this sprint
    const existing = this.watchers.get(watchKey);
    if (existing) {
      existing.close();
    }

    // Track current file size for incremental reads
    let currentOffset = 0;
    try {
      if (existsSync(filePath)) {
        currentOffset = statSync(filePath).size;
      }
    } catch {
      // ignore
    }
    this.watcherOffsets.set(watchKey, currentOffset);

    const watcher = watch(filePath, { persistent: false }, (_eventType) => {
      try {
        const stat = statSync(filePath);
        const prevOffset = this.watcherOffsets.get(watchKey) ?? 0;

        if (stat.size <= prevOffset) return; // No new data

        // Read only new bytes
        const fd = openSync(filePath, 'r');
        const buffer = Buffer.alloc(stat.size - prevOffset);
        readSync(fd, buffer, 0, buffer.length, prevOffset);
        closeSync(fd);

        this.watcherOffsets.set(watchKey, stat.size);

        const newContent = buffer.toString('utf-8');
        const lines = newContent.split('\n').filter(l => l.trim().length > 0);

        for (const line of lines) {
          try {
            const event = JSON.parse(line) as DeckentEvent;
            this.publish(event);
          } catch {
            // Skip malformed
          }
        }
      } catch (err) {
        debugLog('event-bus:watchFile', `Watch read error: ${err}`);
      }
    });

    this.watchers.set(watchKey, watcher);
    return watcher;
  }

  /**
   * Close all active file watchers.
   */
  unwatchAll(): void {
    for (const [key, watcher] of this.watchers) {
      try {
        watcher.close();
      } catch {
        // ignore cleanup errors
      }
      this.watchers.delete(key);
    }
    this.watcherOffsets.clear();
  }

  /**
   * Get the count of active subscriptions (for diagnostics).
   */
  get subscriberCount(): number {
    return this.subscriptions.size;
  }
}

// ─── Singleton ──────────────────────────────────────────────────

export const eventBus = new EventBus();

// ─── ADR-008 Dependency Inversion Wire ──────────────────────────
// core/notify.ts must not import orchestra/. Instead we register an emit
// function here at module load; notify.ts reads it via getNotificationDispatcher().
// Direction stays orchestra → core (allowed). Side effect is idempotent.
setNotificationDispatcher((evt: NotifyBusEvent) => {
  eventBus.emit('deckent-event', evt);
});
