// src/nervous/detectors/dead-event-stream.ts
//
// DeadEventStreamDetector — Sprint event stream'i izler.
// Threshold süre (default 10dk) boyunca yeni event yoksa + aktif worker varsa
// severity:critical alarm üretir → muhtemel stall sinyali.
//
// Sprint 148'de reserve_for:"sprint-148" ile devre dışı bırakıldı.
// Sprint 165 Bug W fix: aktif edildi (ADR-040 Nervous System).

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { RECENT_WORKS_DIR } from '../../core/constants.js';

const DEFAULT_THRESHOLD_MS = 600_000; // 10 dakika

/**
 * Sprint event stream'in sessizliğini izler.
 *
 * Mantık:
 *   - Sadece cron source event'leri işle (periyodik kontrol)
 *   - Sprint IDLE/CLEANUP/RETRO/DECAY fazlarında pasif (aktif worker beklenmez)
 *   - Aktif worker yok → alarm yok (normal idle)
 *   - Son event timestamp > threshold_ms önce + aktif worker var → CRITICAL alarm
 *   - Sprint events dosyası yoksa → ilk event yazılmamış, erken faz → alarm yok
 */
export class DeadEventStreamDetector {
  readonly detectorId = 'dead-event-stream';

  constructor(private readonly thresholdMs = DEFAULT_THRESHOLD_MS) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // Sadece cron tetikleyicisini işle
    if (ctx.event.source !== 'cron') {
      return null;
    }

    const { sprintState, projectRoot, now } = ctx;

    // Detector'ın pasif olduğu fazlar
    const inactivePhases = new Set(['IDLE', 'CLEANUP', 'RETRO', 'DECAY']);
    if (inactivePhases.has(sprintState.currentPhase)) {
      return null;
    }

    // Sprint ID yoksa izleyecek stream yok
    if (!sprintState.sprintId) {
      return null;
    }

    // Aktif worker yoksa alarm verme (normal boş durum)
    if (sprintState.activeWorkers.length === 0) {
      return null;
    }

    // Sprint events dosyasının son event timestamp'ini oku
    const lastEventMs = readLastEventTimestamp(projectRoot, sprintState.sprintId);

    // Events dosyası henüz oluşturulmadıysa (spawn öncesi) alarm yok
    if (lastEventMs === null) {
      return null;
    }

    const silenceMs = now.getTime() - lastEventMs;

    if (silenceMs < this.thresholdMs) {
      return null;
    }

    const silenceMinutes = Math.floor(silenceMs / 60_000);

    return {
      risk: 'high',
      shouldNotify: true,
      severity: 'critical',
      groupKey: `dead-event-stream:${sprintState.sprintId}`,
      suggestedActions: [
        {
          id: 'INVESTIGATE_STALL',
          label: `Sprint event stream silent for ${silenceMinutes} minutes — investigate stall`,
          risk: 'medium' as const,
          payload: {
            sprintId: sprintState.sprintId,
            silenceMs,
            activeWorkerCount: sprintState.activeWorkers.length,
            activeWorkerIds: sprintState.activeWorkers.map(w => w.id),
            lastEventMs,
          },
        },
        {
          id: 'FORCE_EVALUATE',
          label: 'Force sprint evaluation now',
          risk: 'medium' as const,
          payload: { sprintId: sprintState.sprintId },
        },
        {
          id: 'KILL_WORKERS',
          label: `Kill ${sprintState.activeWorkers.length} stalled worker(s)`,
          risk: 'high' as const,
          payload: {
            sprintId: sprintState.sprintId,
            workerIds: sprintState.activeWorkers.map(w => w.id),
          },
        },
      ],
      metadata: {
        type: 'dead-event-stream',
        detector: 'dead_event_stream',
        message: `Sprint event stream silent for ${silenceMinutes} minutes — possible stall`,
        silenceMs,
        thresholdMs: this.thresholdMs,
        activeWorkerCount: sprintState.activeWorkers.length,
      },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sprint JSONL event stream dosyasından son event'in timestamp'ini okur.
 * Dosya yoksa veya boşsa null döner (fail-safe).
 */
function readLastEventTimestamp(
  projectRoot: string,
  sprintId: string,
): number | null {
  const filePath = join(projectRoot, RECENT_WORKS_DIR, `${sprintId}-events.jsonl`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);

    if (lines.length === 0) {
      return null;
    }

    // Son geçerli event'i bul (sondan başa tara)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const event = JSON.parse(lines[i]!) as { timestamp?: string };
        if (event.timestamp) {
          const ms = new Date(event.timestamp).getTime();
          if (!isNaN(ms)) {
            return ms;
          }
        }
      } catch {
        // Bozuk satır — bir öncekine geç
      }
    }

    return null;
  } catch {
    return null;
  }
}
