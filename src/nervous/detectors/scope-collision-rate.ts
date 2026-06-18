// src/nervous/detectors/scope-collision-rate.ts
//
// ScopeCollisionRateDetector — Auditor'dan sprint başına 10'dan fazla collision
// geliyorsa planner refactor önerisi üretir.
//
// Sprint 151 Task 15 — Nervous System Detector 9/10

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';

/** Sprint başına collision eşiği */
const DEFAULT_COLLISION_THRESHOLD = 10;

/**
 * Scope collision rate'ini izler.
 *
 * Tetikleyici: event-bus veya filesystem kaynağından gelen SCOPE_COLLISION event'leri
 * veya sprint-lifecycle SPRINT_PHASE_CHANGE newPhase=EVALUATE (toplam collision kontrolü)
 *
 * Çalışma mantığı:
 * - Event payload'daki collisionCount değerini kontrol eder
 * - Eşik aşıldığında planner refactor önerisi üretir
 * - EXECUTE fazında aktif — scope collision'lar çalışma sırasında oluşur
 */
export class ScopeCollisionRateDetector {
  readonly detectorId = 'scope-collision-rate';

  constructor(private readonly collisionThreshold = DEFAULT_COLLISION_THRESHOLD) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // İki tetikleyici pattern destekle:
    // 1. SCOPE_COLLISION event'leri (gerçek zamanlı)
    // 2. EVALUATE phase geçişi (toplam kontrol)

    if (ctx.event.type === 'SCOPE_COLLISION') {
      return this.handleCollisionEvent(ctx);
    }

    if (
      ctx.event.source === 'sprint-lifecycle' &&
      ctx.event.type === 'SPRINT_PHASE_CHANGE' &&
      ctx.event.payload['newPhase'] === 'EVALUATE'
    ) {
      return this.handleEvaluatePhase(ctx);
    }

    return null;
  }

  /** Gerçek zamanlı collision event'i — payload'da count kontrolü */
  private handleCollisionEvent(ctx: DetectorContext): DetectorResult | null {
    const count = typeof ctx.event.payload['collisionCount'] === 'number'
      ? ctx.event.payload['collisionCount'] as number
      : typeof ctx.event.payload['totalCollisions'] === 'number'
        ? ctx.event.payload['totalCollisions'] as number
        : undefined;

    if (count === undefined || count < this.collisionThreshold) return null;

    return this.buildResult(count, ctx);
  }

  /** EVALUATE phase'inde toplam collision count kontrolü */
  private handleEvaluatePhase(ctx: DetectorContext): DetectorResult | null {
    const count = typeof ctx.event.payload['sprintCollisionCount'] === 'number'
      ? ctx.event.payload['sprintCollisionCount'] as number
      : undefined;

    if (count === undefined || count < this.collisionThreshold) return null;

    return this.buildResult(count, ctx);
  }

  private buildResult(collisionCount: number, ctx: DetectorContext): DetectorResult {
    const severity = collisionCount > this.collisionThreshold * 2 ? 'critical' : 'warning';

    return {
      risk: 'medium',
      shouldNotify: true,
      severity,
      title: `High scope-collision rate (${collisionCount})`,
      message: `${collisionCount} scope collisions this sprint (threshold ${this.collisionThreshold}) — planner is over-overlapping task scopes; consider a refactor`,
      groupKey: `scope-collision-rate:${ctx.sprintState.sprintId}`,
      suggestedActions: [
        {
          id: 'SCOPE_COLLISION_REORDER',
          label: `${collisionCount} scope collisions detected — consider planner refactor`,
          risk: 'medium' as const,
          payload: {
            collisionCount,
            threshold: this.collisionThreshold,
            sprintId: ctx.sprintState.sprintId,
          },
        },
      ],
      metadata: {
        type: 'scope-collision-rate',
        collisionCount,
        threshold: this.collisionThreshold,
      },
    };
  }
}
