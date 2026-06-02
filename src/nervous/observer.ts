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
import { watch, type FSWatcher, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import type { ObserverEvent, ObserverEventSource, DetectorContext, SprintStateSnapshot } from '../core/nervous-types.js';
import { eventBus } from '../orchestra/event-bus.js';
import { assertBrainScope } from './runtime-scope-check.js';
import { DetectorRegistry, type DetectorConfig } from './detector-registry.js';

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
/** SprintState sağlayıcı callback tipi */
export type SprintStateProvider = () => SprintStateSnapshot;

/** Varsayılan idle sprint state snapshot */
const IDLE_SPRINT_STATE: SprintStateSnapshot = {
  sprintId: null,
  currentPhase: 'IDLE',
  activeWorkers: [],
  openDebtCount: 0,
  totalTasks: 0,
  completedTasks: 0,
};

/**
 * Sprint 183 W1-1 (P0-1): detector dispatch debounce window.
 * Multiple observer events arriving inside this window collapse to a SINGLE
 * detector cycle. Prevents FS event amplification observed during Sprint 182
 * dogfood (17 task JSON writes triggered 17 detector cycles).
 */
export const DETECTOR_DEBOUNCE_WINDOW_MS = 500;

/**
 * Sprint 183 W1-1 (P0-1): only run detector pipeline during EXECUTE phase.
 * PLAN / SPAWN / EVALUATE / FIX / RETRO / DECAY / CLEANUP / IDLE skip detector
 * cycle (raw 'observe' event still emitted for observability).
 */
const DETECTOR_ACTIVE_PHASE: SprintStateSnapshot['currentPhase'] = 'EXECUTE';

export class NervousObserver extends EventEmitter {
  private readonly fsWatchers: Map<string, FSWatcher> = new Map();
  // Sprint 223 T8: cron uses recursive setTimeout (not setInterval) so the
  // next delay can be re-evaluated each tick — required for idle-throttle.
  private cronTimer: ReturnType<typeof setTimeout> | null = null;
  private _isStarted = false;
  private readonly detectorRegistry: DetectorRegistry | null;

  // Sprint 183 W1-1 (P0-1): debounced detector dispatch state
  private detectorDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private detectorPendingEvent: ObserverEvent | null = null;

  constructor(
    private readonly projectRoot: string,
    private readonly cronIntervalMs: number = 15_000,
    detectorConfig?: DetectorConfig,
    private readonly sprintStateProvider: SprintStateProvider = () => IDLE_SPRINT_STATE,
    // Sprint 223 T8 (resource-optimize): when sprint phase is IDLE, the cron
    // tick interval is multiplied by this factor so a quiescent project does
    // not waste CPU/RAM on observer scan loops. `1` (default) preserves the
    // pre-Sprint-223 behavior; values >1 throttle the IDLE-phase cadence.
    // Wired from config `nervous_system.idle_throttle` (multiplier; 1=off).
    private readonly idleThrottleMultiplier: number = 1,
  ) {
    super();
    assertBrainScope('NervousObserver');
    this.detectorRegistry = detectorConfig !== undefined
      ? new DetectorRegistry(detectorConfig)
      : null;
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

    // Cron timer'ı temizle (Sprint 223 T8: recursive setTimeout → clearTimeout)
    if (this.cronTimer !== null) {
      clearTimeout(this.cronTimer);
      this.cronTimer = null;
    }

    // Sprint 183 W1-1: pending detector dispatch'i iptal et
    if (this.detectorDebounceTimer !== null) {
      clearTimeout(this.detectorDebounceTimer);
      this.detectorDebounceTimer = null;
    }
    this.detectorPendingEvent = null;

    this._isStarted = false;
  }

  // ─── Observe + Detect Pipeline ────────────────────────────────

  /**
   * Bir ObserverEvent emit eder ve gerekli koşullar sağlanırsa detector
   * pipeline'ını debounced olarak tetikler.
   *
   * Sprint 183 W1-1 (P0-1) — iki katman koruma:
   *   1. **Phase guard:** detector cycle yalnızca EXECUTE phase'inde çalışır.
   *      PLAN / SPAWN / EVALUATE vb. fazlarda raw 'observe' event yine emit
   *      edilir (observability korunur) ancak detector pipeline atlanır.
   *   2. **Debounce window:** ardışık observer event'ler 500ms pencereye
   *      düşerse tek detector cycle tetikler — son event ctx'e taşınır.
   */
  private emitObserve(event: ObserverEvent): void {
    this.emit('observe', event);
    this.scheduleDetectorDispatch(event);
  }

  /**
   * Sprint 183 W1-1: phase guard + 500ms debounce ile detector pipeline.
   * Internal — testler tarafından doğrudan çağrılmaz; emitObserve'ten gelir.
   */
  private scheduleDetectorDispatch(event: ObserverEvent): void {
    if (this.detectorRegistry === null) return;

    // Phase guard — EXECUTE dışındaki fazlarda detector pasif.
    // sprintStateProvider runtime'da phase değişimini yansıttığı için
    // her çağrıda taze okunur.
    const sprintState = this.sprintStateProvider();
    if (sprintState.currentPhase !== DETECTOR_ACTIVE_PHASE) return;

    // Debounce: pending event'i güncel olanla değiştir, timer'ı reset et.
    this.detectorPendingEvent = event;
    if (this.detectorDebounceTimer !== null) {
      clearTimeout(this.detectorDebounceTimer);
    }
    const timer = setTimeout(() => {
      this.flushDetectorDispatch();
    }, DETECTOR_DEBOUNCE_WINDOW_MS);
    // Detector dispatch process'i ayakta tutmamalı
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
    this.detectorDebounceTimer = timer;
  }

  /**
   * Debounce window dolduğunda detector pipeline'ını tek seferde çalıştırır.
   * Phase guard tekrar kontrol edilir — debounce penceresi sırasında phase
   * değişmiş olabilir (örn. EXECUTE → EVALUATE geçişi).
   */
  private flushDetectorDispatch(): void {
    this.detectorDebounceTimer = null;
    const event = this.detectorPendingEvent;
    this.detectorPendingEvent = null;
    if (event === null) return;
    if (this.detectorRegistry === null) return;

    const sprintState = this.sprintStateProvider();
    if (sprintState.currentPhase !== DETECTOR_ACTIVE_PHASE) return;

    const ctx: DetectorContext = {
      event,
      sprintState,
      projectRoot: this.projectRoot,
      now: new Date(),
    };

    // Async — hataları yut, observer loop'u bozmaz
    this.detectorRegistry.runAll(ctx).then(results => {
      for (const result of results) {
        this.emit('detection', result, event);
      }
    }).catch(err => {
      console.error('[NervousObserver] DetectorRegistry.runAll failed:', err);
    });
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
    this.emitObserve(event);
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
          this.emitObserve(event);
        });
        this.fsWatchers.set(target, watcher);
      } catch {
        // Path may not exist — skip silently, other watchers still active
      }
    }
  }

  // ─── Cron Tick ─────────────────────────────────────────────────

  /**
   * Sprint 223 T8 (resource-optimize): cron uses a recursive setTimeout so
   * the next tick's delay can be re-evaluated against the current sprint
   * phase. When `idleThrottleMultiplier > 1` AND the sprint phase is IDLE,
   * the next cron tick is delayed by `cronIntervalMs * multiplier`. This
   * drops observer scan-loop frequency to a minimum on idle projects
   * without disabling cron entirely.
   *
   * When the multiplier is 1 (default) the behavior is identical to the
   * pre-Sprint-223 setInterval cadence — preserves backwards compatibility.
   */
  private startCronTick(): void {
    this.scheduleNextCronTick(this.cronIntervalMs);
  }

  /**
   * Compute the next cron interval based on the current sprint phase and
   * the configured idle-throttle multiplier.
   *
   * IDLE phase + multiplier>1 → throttled (cronIntervalMs × multiplier).
   * Any other phase, or multiplier=1 → normal cronIntervalMs.
   */
  private nextCronIntervalMs(): number {
    if (this.idleThrottleMultiplier <= 1) return this.cronIntervalMs;
    const phase = this.sprintStateProvider().currentPhase;
    if (phase === 'IDLE') {
      return this.cronIntervalMs * this.idleThrottleMultiplier;
    }
    return this.cronIntervalMs;
  }

  /**
   * Schedule the next cron tick. After firing, emits a 'cron'/'TICK'
   * ObserverEvent and recursively schedules the next tick with a freshly
   * computed delay (so phase transitions reshape future cadence).
   */
  private scheduleNextCronTick(delayMs: number): void {
    const timer = setTimeout(() => {
      const event = this.buildEvent('cron', 'TICK', {
        intervalMs: delayMs,
      });
      this.emitObserve(event);
      // Recursive: only re-arm while observer is still running.
      if (this._isStarted) {
        this.scheduleNextCronTick(this.nextCronIntervalMs());
      }
    }, delayMs);
    // Cron timer should never keep the process alive.
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
    this.cronTimer = timer;
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

// ═══ DirectivesProtectionDetector — Sprint 177 Task 5 ════════════════════════
//
// Sprint 176 bug: kill+cleanup sonrası auto_restore Sprint 175 content'ini
// Sprint 176'nın üstüne yazdı. Neden: set_directives başarıyla yazdıktan
// sonra baseline hiç güncellenmiyordu.
//
// Fix: updateBaseline() hook — deckent_set_directives + sprint startSprint()
// her ikisi de set_directives başarısından ve sprint başından sonra çağırır.

/** Detector options for directives_protection baseline tracking */
export interface DirectivesProtectionOptions {
  readonly root: string;
  readonly autoRestore: boolean;
}

/**
 * Tracks the "known good" DIRECTIVES.md baseline hash and content.
 * When auto_restore is true and scan() detects a deviation, the file is
 * written back to the baseline content.
 *
 * Module-level singleton pattern: use initDirectivesProtection() to create
 * and getActiveDirectivesProtection() to retrieve.
 */
export class DirectivesProtectionDetector {
  private baselineHash: string | null = null;
  private baselineContent: string | null = null;

  constructor(
    private readonly root: string,
    private readonly autoRestore: boolean,
  ) {
    this.updateBaseline();
  }

  /**
   * Reads the current DIRECTIVES.md and stores it as the new baseline.
   * Call after set_directives succeeds or at sprint start.
   */
  updateBaseline(): void {
    const path = join(this.root, 'DIRECTIVES.md');
    if (existsSync(path)) {
      const content = readFileSync(path, 'utf-8');
      this.baselineContent = content;
      this.baselineHash = this.computeHash(content);
    }
  }

  /** SHA-256 hex hash of the given content string. */
  computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /** Returns the stored baseline hash, or null if no baseline set yet. */
  getBaselineHash(): string | null {
    return this.baselineHash;
  }

  /**
   * Compare current DIRECTIVES.md to baseline.
   * If different and auto_restore is enabled, writes baseline content back.
   */
  scan(): void {
    if (this.baselineContent === null || this.baselineHash === null) return;

    const path = join(this.root, 'DIRECTIVES.md');
    if (!existsSync(path)) {
      if (this.autoRestore) {
        writeFileSync(path, this.baselineContent, 'utf-8');
      }
      return;
    }

    const current = readFileSync(path, 'utf-8');
    if (this.computeHash(current) !== this.baselineHash && this.autoRestore) {
      writeFileSync(path, this.baselineContent, 'utf-8');
    }
  }
}

// ─── Module-level singleton ────────────────────────────────────────────────

let _activeDirectivesDetector: DirectivesProtectionDetector | null = null;

/**
 * Initialize the directives_protection singleton.
 * Replaces any previously active detector. Called at program startup, sprint
 * start, and in tests to scope the detector to a specific project root.
 */
export function initDirectivesProtection(
  opts: DirectivesProtectionOptions,
): DirectivesProtectionDetector {
  _activeDirectivesDetector = new DirectivesProtectionDetector(opts.root, opts.autoRestore);
  return _activeDirectivesDetector;
}

/**
 * Returns the currently active directives_protection detector, or null if
 * none has been initialized.
 */
export function getActiveDirectivesProtection(): DirectivesProtectionDetector | null {
  return _activeDirectivesDetector;
}
