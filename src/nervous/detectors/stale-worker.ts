// src/nervous/detectors/stale-worker.ts
//
// StaleWorkerDetector — Sprint 145 T-011 Docker worker exit pattern'i + genel HB staleness.
// 10dk+ heartbeat güncellemesi olmayan worker'ları tespit eder → WORKER_RESPAWN öneri.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md Section 5.1
// Sprint 147 Task 9

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';

// 10 dakika. Bitmiş worker'lar (.result yazmış) snapshot'ın activeWorkers'ından
// zaten elenir (sprint-state-tracker), dolayısıyla bu eşik YALNIZ gerçekten
// asılı kalmış AKTİF bir worker içindir — uzun-soluklu bir tool-call'u erkenden
// "stale" damgalamamak için 3dk→10dk yükseltildi (uyarı gürültüsü azaltma).
// Override: config.nervous_system.detectors.stale_worker.threshold_ms.
const DEFAULT_STALE_MS = 600000;

/**
 * Aktif worker'ların heartbeat'lerini izler.
 * 10dk+ güncelleme yok → WORKER_RESPAWN önerisi (medium risk).
 *
 * Tetikleyiciler: cron tick veya filesystem değişikliği.
 * event-bus kaynağı bu detector tarafından işlenmez.
 */
export class StaleWorkerDetector {
  readonly detectorId = 'stale-worker';

  constructor(private readonly staleThresholdMs = DEFAULT_STALE_MS) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // Sadece cron veya filesystem kaynaklı event'leri işle
    if (ctx.event.source !== 'cron' && ctx.event.source !== 'filesystem') {
      return null;
    }

    // IDLE ve CLEANUP fazlarında aktif worker beklenmez
    const phase = ctx.sprintState.currentPhase;
    if (phase === 'IDLE' || phase === 'CLEANUP') {
      return null;
    }

    // Heartbeat'i stale olan worker'ları filtrele
    const staleWorkers = ctx.sprintState.activeWorkers.filter(w => {
      const lastHbMs = new Date(w.lastHeartbeat).getTime();
      return ctx.now.getTime() - lastHbMs > this.staleThresholdMs;
    });

    if (staleWorkers.length === 0) {
      return null;
    }

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      groupKey: `stale-worker:${staleWorkers.map(w => w.id).join(',')}`,
      suggestedActions: staleWorkers.map(w => ({
        id: 'WORKER_RESPAWN',
        label: `Re-spawn ${w.id} (task ${w.taskId})`,
        risk: 'medium' as const,
        payload: { workerId: w.id, taskId: w.taskId, lastHeartbeat: w.lastHeartbeat },
      })),
      metadata: { type: 'stale-worker', count: staleWorkers.length },
    };
  }
}
