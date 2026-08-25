// src/nervous/detectors/notification-delivery-health.ts
//
// NotificationDeliveryHealthDetector — Nervous bridge sağlığını izler.
// adapter.send() başarısızlık oranı yüksekse "nervous bridge broken" alert üretir.
//
// Sprint 151 Task 15 — Nervous System Detector 10/10
//
// 671-007: the payload-counter signal above is blind to the durable
// owner-notification outbox — a record can be enqueued and never delivered
// (nor acknowledged) without ever moving notificationsSent/notificationsFailed.
// This detector now ALSO measures the age of the oldest pending durable-outbox
// record (via readPendingOwnerNotifications, which already subtracts
// acknowledged receipts) and raises a warning when it exceeds the configured
// pending-age threshold. This is an ADDITIONAL signal — the payload-counter
// path above is unmodified and still fires on its own.

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readPendingOwnerNotifications } from '../../connectors/notification-delivery.js';
import { getLoadedConfig } from '../../core/config.js';

/** Başarısızlık oranı eşiği (%50) */
const DEFAULT_FAILURE_RATE_THRESHOLD = 0.50;

/** Minimum gönderim sayısı — çok az gönderimde istatistik anlamsız */
const MIN_DELIVERIES_FOR_CHECK = 3;

/**
 * Resolves the durable owner-notification outbox pending-age threshold (ms)
 * for an exact project root. The production default reads the already
 * resolved config snapshot — `nervous_system.detectors
 * .notification_delivery_health.pending_age_threshold_ms` (authored by the
 * config-authority task 671-001) — never a literal in this file. `undefined`
 * means "no resolved config snapshot available yet"; the durable-outbox check
 * is then skipped for that invocation while the payload-counter signal above
 * remains fully unaffected.
 */
export type PendingAgeThresholdResolver = (projectRoot: string) => number | undefined;

const resolvePendingAgeThresholdFromConfig: PendingAgeThresholdResolver = (projectRoot) =>
  getLoadedConfig(projectRoot)?.nervous_system?.detectors?.notification_delivery_health?.pending_age_threshold_ms;

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
 *
 * Ayrıca (671-007): cron tetiklemelerinde, payload sayaç kontrolü alert
 * üretmediyse, durable owner-notification outbox'taki en eski bekleyen
 * kaydın yaşı configured pending-age threshold'ı aşıyorsa warning alert
 * üretir.
 */
export class NotificationDeliveryHealthDetector {
  readonly detectorId = 'notification-delivery-health';

  constructor(
    private readonly failureRateThreshold = DEFAULT_FAILURE_RATE_THRESHOLD,
    private readonly resolvePendingAgeThresholdMs: PendingAgeThresholdResolver = resolvePendingAgeThresholdFromConfig,
  ) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // İki tetikleyici pattern:
    // 1. cron — periyodik kontrol (payload'da istatistik + durable outbox yaşı)
    // 2. NOTIFICATION_DELIVERY event — her gönderim sonrası

    if (ctx.event.source === 'cron') {
      const cronResult = this.handleCronCheck(ctx);
      if (cronResult) return cronResult;
      return this.handleOutboxAgeCheck(ctx);
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
      title: `Nervous bridge degraded (${pct}% failures)`,
      message: `${failed}/${sent} notification deliveries failed (${pct}%) — operators may not be receiving alerts; repair the bridge`,
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

  /**
   * Durable owner-notification outbox check (671-007). Reads pending records
   * via readPendingOwnerNotifications — which already subtracts acknowledged
   * receipts, so acked records never count as pending here — and raises a
   * warning when the oldest pending record's age exceeds the resolved-config
   * threshold. No threshold available → skip (never a literal fallback).
   */
  private handleOutboxAgeCheck(ctx: DetectorContext): DetectorResult | null {
    const thresholdMs = this.resolvePendingAgeThresholdMs(ctx.projectRoot);
    if (thresholdMs === undefined) return null;

    const pending = readPendingOwnerNotifications(ctx.projectRoot);
    if (pending.length === 0) return null;

    const nowMs = ctx.now.getTime();
    let oldestAgeMs = -1;
    let oldestId = '';
    for (const notification of pending) {
      const createdAtMs = Date.parse(notification.createdAt);
      if (Number.isNaN(createdAtMs)) continue;
      const ageMs = nowMs - createdAtMs;
      if (ageMs > oldestAgeMs) {
        oldestAgeMs = ageMs;
        oldestId = notification.id;
      }
    }

    if (oldestAgeMs <= thresholdMs) return null;

    return this.buildOutboxResult(oldestAgeMs, pending.length, oldestId, ctx);
  }

  private buildOutboxResult(
    oldestAgeMs: number,
    pendingCount: number,
    oldestId: string,
    ctx: DetectorContext,
  ): DetectorResult {
    const ageSeconds = Math.round(oldestAgeMs / 1000);

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      title: `Owner-notification outbox stranded (${pendingCount} pending)`,
      message: `Oldest pending owner notification is ${ageSeconds}s old and has not been delivered or acknowledged — the durable outbox may be stuck; check the bot-daemon drain loop`,
      groupKey: `notification-delivery-health:outbox:${ctx.sprintState.sprintId}`,
      suggestedActions: [
        {
          id: 'NOTIFICATION_BRIDGE_REPAIR',
          label: `Owner-notification outbox stranded: oldest pending record ${ageSeconds}s old (${pendingCount} pending)`,
          risk: 'medium' as const,
          payload: {
            oldestPendingId: oldestId,
            oldestPendingAgeMs: oldestAgeMs,
            pendingCount,
          },
        },
      ],
      metadata: {
        type: 'notification-delivery-health',
        signal: 'durable-outbox',
        oldestPendingAgeMs: oldestAgeMs,
        pendingCount,
      },
    };
  }
}
