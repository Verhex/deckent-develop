// src/nervous/detectors/notification-delivery-health.ts
//
// NotificationDeliveryHealthDetector — Nervous bridge sağlığını izler.
// adapter.send() başarısızlık oranı yüksekse "nervous bridge broken" alert üretir.
//
// Sprint 151 Task 15 — Nervous System Detector 10/10

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';

/** Başarısızlık oranı eşiği (%50) */
const DEFAULT_FAILURE_RATE_THRESHOLD = 0.50;

/** Minimum gönderim sayısı — çok az gönderimde istatistik anlamsız */
const MIN_DELIVERIES_FOR_CHECK = 3;

/**
 * Notification delivery sağlığını izler.
 *
 * Tetikleyici: cron event'leri — periyodik sağlık kontrolü
 *
 * Event payload'dan beklenen alanlar:
 * - notificationsSent: toplam gönderim denemesi
 * - notificationsFailed: başarısız gönderimler
 *
 * Alternatif: NOTIFICATION_DELIVERY event tipi
 *
 * Başarısızlık oranı > %50 ise "nervous bridge broken" alert üretir.
 */
export class NotificationDeliveryHealthDetector {
  readonly detectorId = 'notification-delivery-health';

  constructor(private readonly failureRateThreshold = DEFAULT_FAILURE_RATE_THRESHOLD) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // İki tetikleyici pattern:
    // 1. cron — periyodik kontrol (payload'da istatistik)
    // 2. NOTIFICATION_DELIVERY event — her gönderim sonrası

    if (ctx.event.source === 'cron') {
      return this.handleCronCheck(ctx);
    }

    if (ctx.event.type === 'NOTIFICATION_DELIVERY') {
      return this.handleDeliveryEvent(ctx);
    }

    return null;
  }

  /** Cron bazlı periyodik kontrol */
  private handleCronCheck(ctx: DetectorContext): DetectorResult | null {
    const sent = typeof ctx.event.payload['notificationsSent'] === 'number'
      ? ctx.event.payload['notificationsSent'] as number
      : undefined;
    const failed = typeof ctx.event.payload['notificationsFailed'] === 'number'
      ? ctx.event.payload['notificationsFailed'] as number
      : undefined;

    if (sent === undefined || failed === undefined) return null;
    if (sent < MIN_DELIVERIES_FOR_CHECK) return null;

    const failureRate = failed / sent;
    if (failureRate < this.failureRateThreshold) return null;

    return this.buildResult(sent, failed, failureRate, ctx);
  }

  /** Tek gönderim sonrası kontrol */
  private handleDeliveryEvent(ctx: DetectorContext): DetectorResult | null {
    const success = ctx.event.payload['success'];
    const totalSent = typeof ctx.event.payload['totalSent'] === 'number'
      ? ctx.event.payload['totalSent'] as number
      : undefined;
    const totalFailed = typeof ctx.event.payload['totalFailed'] === 'number'
      ? ctx.event.payload['totalFailed'] as number
      : undefined;

    // Tek başarısız gönderim ama yeterli veri varsa
    if (success === false && totalSent !== undefined && totalFailed !== undefined) {
      if (totalSent < MIN_DELIVERIES_FOR_CHECK) return null;
      const failureRate = totalFailed / totalSent;
      if (failureRate < this.failureRateThreshold) return null;
      return this.buildResult(totalSent, totalFailed, failureRate, ctx);
    }

    return null;
  }

  private buildResult(
    sent: number,
    failed: number,
    failureRate: number,
    ctx: DetectorContext,
  ): DetectorResult {
    const pct = (failureRate * 100).toFixed(0);
    const severity = failureRate >= 0.80 ? 'critical' : 'warning';

    return {
      risk: severity === 'critical' ? 'high' : 'medium',
      shouldNotify: true,
      severity,
      groupKey: `notification-delivery-health:${ctx.sprintState.sprintId}`,
      suggestedActions: [
        {
          id: 'NOTIFICATION_BRIDGE_REPAIR',
          label: `Nervous bridge degraded: ${failed}/${sent} notifications failed (${pct}%)`,
          risk: severity === 'critical' ? 'high' as const : 'medium' as const,
          payload: {
            sent,
            failed,
            failureRate: Math.round(failureRate * 100) / 100,
          },
        },
      ],
      metadata: {
        type: 'notification-delivery-health',
        sent,
        failed,
        failureRate: Math.round(failureRate * 100) / 100,
      },
    };
  }
}
