// src/nervous/observer.ts
//
// Nervous System Observer — 4 event source unified pipeline.
// Observer algıladığı her event'i ObserverEvent formatına dönüştürür
// ve 'observe' event'i olarak emit eder.
//
// Sources:
//   1. event-bus  — Sprint 145 EventBus (DeckentEvent → ObserverEvent)
//   2. filesystem — fs.watch on .tasks/, .brain/, DIRECTIVES.md, .deckent/
//   3. cron       — configurable interval tick (default 15s)
//   4. sprint-lifecycle — event-bus üzerinden gelen SPRINT_PHASE_CHANGE vb.
//
// Sprint 147 Task 4.

import { EventEmitter } from 'node:events';
import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ObserverEvent, ObserverEventSource } from '../core/nervous-types.js';
import { eventBus } from '../orchestra/event-bus.js';

// ─── Sprint Lifecycle Event Types ──────────────────────────────────

/**
 * EventBus üzerinden gelen DeckentEvent.type değerlerinden sprint-lifecycle
 * kaynağına yönlendirilecek olanlar. Bunlar Observer tarafından
 * source='sprint-lifecycle' olarak etiketlenir.
 */
const SPRINT_LIFECYCLE_TYPES: ReadonlySet<string> = new Set([
  'SPRINT_PHASE_CHANGE',
  'SPRINT_STARTED',
  'SPRINT_COMPLETED',
  'SPRINT_RETRO_COMPLETE',
]);

// ─── FS Watch Targets ──────────────────────────────────────────────

/**
 * Observer'ın izleyeceği dosya/dizin hedefleri.
 * Sprint 145+146 pattern'i: .tasks/, .brain/, DIRECTIVES.md, .deckent/
 */
const FS_WATCH_TARGETS: readonly string[] = [
  '.tasks',
  '.brain',
  'DIRECTIVES.md',
  '.deckent',
];

// ─── NervousObserver ───────────────────────────────────────────────

/**
 * Nervous System giriş noktası — tüm event source'ları tek 'observe' event'ine
 * birleştiren observer.
 *
 * Usage:
 *   const observer = new NervousObserver('/path/to/project');
 *   observer.on('observe', (event: ObserverEvent) => { ... });
 *   observer.start();
 *   // ... later
 *   observer.stop();
 */
export class NervousObserver extends EventEmitter {
  private readonly fsWatchers: Map<string, FSWatcher> = new Map();
  private cronTimer: ReturnType<typeof setInterval> | null = null;
  private _isStarted = false;

  constructor(
    private readonly projectRoot: string,
    private readonly cronIntervalMs: number = 15_000,
  ) {
    super();
  }

  /** Observer çalışıyor mu */
  get isStarted(): boolean {
    return this._isStarted;
  }

  /**
   * Tüm event source'ları başlat.
   * İdempotent — birden fazla çağrı no-op.
   */
  start(): void {
    if (this._isStarted) return;

    this.subscribeEventBus();
    this.startFilesystemWatchers();
    this.startCronTick();
    this._isStarted = true;
  }

  /**
   * Tüm event source'ları durdur ve temizle.
   * İdempotent — çalışmıyorken çağrı no-op.
   */
  stop(): void {
    if (!this._isStarted) return;

    // EventBus listener'ı kaldır
    eventBus.off('event', this.onEventBusEvent);

    // FS watcher'ları kapat
    for (const w of this.fsWatchers.values()) {
      try {
        w.close();
      } catch {
        // Cleanup error — ignore
      }
    }
    this.fsWatchers.clear();

    // Cron timer'ı temizle
    if (this.cronTimer !== null) {
      clearInterval(this.cronTimer);
      this.cronTimer = null;
    }

    this._isStarted = false;
  }

  // ─── EventBus Integration ──────────────────────────────────────

  private subscribeEventBus(): void {
    eventBus.on('event', this.onEventBusEvent);
  }

  /**
   * EventBus 'event' listener. DeckentEvent'i ObserverEvent'e çevirir.
   * Sprint-lifecycle event'leri ayrı source ile etiketlenir.
   */
  private readonly onEventBusEvent = (deckentEvent: Record<string, unknown>): void => {
    const eventType = String(deckentEvent.type ?? deckentEvent.channel ?? 'UNKNOWN');

    // Sprint lifecycle event'lerini ayrı source'a yönlendir
    const source: ObserverEventSource = SPRINT_LIFECYCLE_TYPES.has(eventType)
      ? 'sprint-lifecycle'
      : 'event-bus';

    const event = this.buildEvent(source, eventType, deckentEvent);
    this.emit('observe', event);
  };

  // ─── Filesystem Watchers ───────────────────────────────────────

  private startFilesystemWatchers(): void {
    for (const target of FS_WATCH_TARGETS) {
      const fullPath = join(this.projectRoot, target);
      try {
        const watcher = watch(fullPath, { recursive: true }, (eventType, filename) => {
          const event = this.buildEvent('filesystem', 'FILE_CHANGE', {
            eventType,
            filename: filename ?? undefined,
            path: `${target}/${filename ?? ''}`,
          });
          this.emit('observe', event);
        });
        this.fsWatchers.set(target, watcher);
      } catch {
        // Path may not exist — skip silently, other watchers still active
      }
    }
  }

  // ─── Cron Tick ─────────────────────────────────────────────────

  private startCronTick(): void {
    this.cronTimer = setInterval(() => {
      const event = this.buildEvent('cron', 'TICK', {
        intervalMs: this.cronIntervalMs,
      });
      this.emit('observe', event);
    }, this.cronIntervalMs);

    // Timer should not keep process alive
    if (this.cronTimer && typeof this.cronTimer === 'object' && 'unref' in this.cronTimer) {
      this.cronTimer.unref();
    }
  }

  // ─── Event Builder ─────────────────────────────────────────────

  private buildEvent(
    source: ObserverEventSource,
    type: string,
    payload: Record<string, unknown>,
  ): ObserverEvent {
    return {
      id: randomUUID(),
      source,
      type,
      timestamp: new Date().toISOString(),
      payload,
      sprintId: typeof payload.sprintId === 'string' ? payload.sprintId : undefined,
      taskId: typeof payload.taskId === 'string' ? payload.taskId : undefined,
    };
  }
}
