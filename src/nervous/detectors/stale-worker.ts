// src/nervous/detectors/stale-worker.ts
//
// StaleWorkerDetector — Sprint 145 T-011 Docker worker exit pattern'i + genel HB staleness.
// 10dk+ heartbeat güncellemesi olmayan worker'ları tespit eder → WORKER_RESPAWN öneri.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md Section 5.1
// Sprint 147 Task 9

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { DEFAULT_HEARTBEAT_TIMEOUT_MS } from '../../core/config.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

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

function readTaskScope(projectRoot: string, taskId: string): { filesWrite: string[] } {
  if (!projectRoot) return { filesWrite: [] };
  const taskFile = join(projectRoot, '.tasks', `task-${taskId}.json`);
  if (!existsSync(taskFile)) return { filesWrite: [] };
  try {
    const raw = readFileSync(taskFile, 'utf-8');
    const parsed = JSON.parse(raw) as { scope?: { filesWrite?: string[] } };
    return { filesWrite: parsed.scope?.filesWrite ?? [] };
  } catch {
    return { filesWrite: [] };
  }
}

function countUniqueDirs(filesWrite: string[]): number {
  if (filesWrite.length === 0) return 0;
  return new Set(filesWrite.map(f => dirname(f))).size;
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

  constructor(private readonly staleThresholdMs = DEFAULT_HEARTBEAT_TIMEOUT_MS) {}

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

    // Heartbeat'i stale olan worker'ları filtrele (per-scope adaptive threshold)
    const staleWorkers = ctx.sprintState.activeWorkers.filter(w => {
      const lastHbMs = new Date(w.lastHeartbeat).getTime();
      const scope = readTaskScope(ctx.projectRoot, w.taskId);
      const dirCount = countUniqueDirs(scope.filesWrite);
      const threshold = computeAdaptiveThreshold(this.staleThresholdMs, scope.filesWrite.length, dirCount);
      return ctx.now.getTime() - lastHbMs > threshold;
    });

    if (staleWorkers.length === 0) {
      return null;
    }

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      title: `Stale worker${staleWorkers.length > 1 ? `s (${staleWorkers.length})` : ` ${staleWorkers[0]!.id}`}`,
      message: `Heartbeat stale >${Math.round(this.staleThresholdMs / 60000)}min — respawn proposed for ${staleWorkers.map(w => w.id).join(', ')}`,
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
