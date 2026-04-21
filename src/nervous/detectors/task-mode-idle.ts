// src/nervous/detectors/task-mode-idle.ts
//
// TaskModeIdleDetector — Task mode'da kullanıcı 5dk+ idle kaldığında hatırlatma önerir.
// Balanced preset'e göre low risk → suggest-30m politikası ile METRIC_EMIT action.
//
// Design: Kullanıcı "task" modunda (life assistant) çalışırken uzun süre işlem
// yapılmadığında bir check-in önerisi üretir. Sprint mode'da tamamen devre dışı.
//
// Sprint 149 Task 4

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';

const DEFAULT_IDLE_MS = 300_000; // 5 dakika

/**
 * Task mode için idle detector.
 * Kullanıcı 5dk+ işlem yapmazsa info severity ile METRIC_EMIT öneri üretir.
 *
 * Tetikleyiciler: sadece cron eventi.
 * Sprint mode'da: her zaman null döner (skip).
 *
 * event.payload.lastUserActivity (ISO 8601) kullanılır.
 * Bu alan Observer tarafından cron tick'e eklenir.
 */
export class TaskModeIdleDetector {
  readonly detectorId = 'task-mode-idle';

  /**
   * @param deckentStyle - Aktif deckent stili ('sprint' | 'task'). Registry'den enjekte edilir.
   * @param idleThresholdMs - Idle eşiği (ms). Default: 5 dakika (300_000 ms).
   */
  constructor(
    private readonly deckentStyle: 'sprint' | 'task' = 'sprint',
    private readonly idleThresholdMs: number = DEFAULT_IDLE_MS,
  ) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // Sadece task mode'da aktif
    if (this.deckentStyle !== 'task') return null;

    // Sadece cron kaynaklı event'leri işle
    if (ctx.event.source !== 'cron') return null;

    // Son kullanıcı aktivite zamanını event payload'undan al
    const lastActivityRaw = ctx.event.payload['lastUserActivity'];
    if (typeof lastActivityRaw !== 'string') return null;

    const lastActivityMs = new Date(lastActivityRaw).getTime();
    if (isNaN(lastActivityMs)) return null;

    const idleMs = ctx.now.getTime() - lastActivityMs;
    if (idleMs < this.idleThresholdMs) return null;

    const idleMinutes = Math.floor(idleMs / 60_000);

    return {
      risk: 'low',
      shouldNotify: true,
      severity: 'info',
      groupKey: `task-mode-idle:${idleMinutes}m`,
      suggestedActions: [
        {
          id: 'METRIC_EMIT',
          label: `User idle ${idleMinutes} min — suggest check-in`,
          risk: 'low' as const,
          payload: { idleMs, idleMinutes, mode: 'task' },
        },
      ],
      metadata: { type: 'task-mode-idle', idleMs, idleMinutes },
    };
  }
}
