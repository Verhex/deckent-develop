// src/nervous/detectors/stale-worker.ts
//
// StaleWorkerDetector — exact-attempt host-dead verdict → WORKER_RESPAWN proposal.
// Worker-authored activity is identity/UI context only, never liveness evidence.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md Section 5.1
// Sprint 147 Task 9

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { DEFAULT_HEARTBEAT_TIMEOUT_MS } from '../../core/config.js';
import type { HostPrimaryLiveness } from '../../core/monitoring-types.js';

/**
 * Per-scope adaptive threshold hesaplama.
 * Büyük-scope worker'a false-stale-kill azaltmak için daha uzun tolerans verir.
 * Formula: min(base × (1 + 0.02×files + 0.03×dirs), base×2)
 */
export function computeAdaptiveThreshold(
  base: number,
  filesWriteCount: number,
  dirCount: number,
): number {
  return Math.min(base * (1 + 0.02 * filesWriteCount + 0.03 * dirCount), base * 2);
}


/**
 * Aktif worker'ların heartbeat'lerini izler.
 * config.heartbeat_timeout ms+ güncelleme yok → WORKER_RESPAWN önerisi (medium risk).
 * SSOT: config.heartbeat_timeout (default 120s) → DEFAULT_HEARTBEAT_TIMEOUT_MS.
 * Override: config.nervous_system.detectors.stale_worker.threshold_ms.
 *
 * Tetikleyiciler: cron tick veya filesystem değişikliği.
 * event-bus kaynağı bu detector tarafından işlenmez.
 */
export class StaleWorkerDetector {
  readonly detectorId = 'stale-worker';

  /**
   * One exact host-dead observation produces one notification. A later host
   * sequence is a new observation and may produce a new notification.
   */
  private readonly notifiedEpisodes = new Set<string>();

  constructor(staleThresholdMs = DEFAULT_HEARTBEAT_TIMEOUT_MS) {
    // Retain the public constructor shape while host authority replaces age.
    void staleThresholdMs;
  }

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

    // Activity is presentation-only. Respawn admission is based solely on the
    // exact-attempt host authority projected by sprint-state-tracker.
    const staleWorkers = ctx.sprintState.activeWorkers.filter(w => {
      const liveness = (w as typeof w & { liveness?: HostPrimaryLiveness }).liveness;
      if (!liveness || liveness.state !== 'dead') return false;
      const episode = `${w.id}\u0000${w.taskId}\u0000${liveness.attemptId}\u0000${liveness.hostSequence}`;
      if (this.notifiedEpisodes.has(episode)) return false;
      this.notifiedEpisodes.add(episode);
      return true;
    });

    if (staleWorkers.length === 0) {
      return null;
    }

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      title: `Stale worker${staleWorkers.length > 1 ? `s (${staleWorkers.length})` : ` ${staleWorkers[0]!.id}`}`,
      message: `Host reports exact worker attempt dead — respawn proposed for ${staleWorkers.map(w => w.id).join(', ')}`,
      groupKey: `stale-worker:${staleWorkers.map(w => w.id).join(',')}`,
      suggestedActions: staleWorkers.map(w => ({
        id: 'WORKER_RESPAWN',
        label: `Re-spawn ${w.id} (task ${w.taskId})`,
        risk: 'medium' as const,
        payload: { workerId: w.id, taskId: w.taskId, lastHeartbeat: w.lastHeartbeat, staleCount: staleWorkers.length },
      })),
      metadata: { type: 'stale-worker', count: staleWorkers.length },
    };
  }

  /**
   * Predicate: WORKER_RESPAWN'ın timeout-auto-proceed'de güvenli olup olmadığını kontrol eder.
   * tek-stale (count=1) → ok; ≥3-stale (cascade) → veto (human onayı gerekli).
   */
  canAutoApply(payload: Record<string, unknown>): { ok: boolean; reason: string } {
    const staleCount = typeof payload['staleCount'] === 'number' ? payload['staleCount'] : 1;
    if (staleCount >= 3) {
      return { ok: false, reason: `cascade respawn (${staleCount} stale workers) — human approval required` };
    }
    return { ok: true, reason: 'single stale worker — safe to auto-respawn' };
  }
}
