// src/nervous/detector-registry.ts
//
// DetectorRegistry — 11 nervous system detector'ını yönetir ve çalıştırır.
// Config'e göre hangi detector'ların aktif olduğunu belirler, runAll() ile
// tümünü çağırır, tek bir detector'ın başarısız olması diğerlerini etkilemez.
//
// Sprint 148 Task 8 (6 detector) + Sprint 151 Task 15 (5 yeni detector).

import type { DetectorContext, DetectorResult } from '../core/nervous-types.js';
import { StaleWorkerDetector } from './detectors/stale-worker.js';
import { ScopeCollisionMonitor } from './detectors/scope-collision.js';
import { DebtTrendAnalyzer } from './detectors/debt-trend.js';
import { AgentRoutingHealth } from './detectors/agent-routing.js';
import { DirectivesMidSprintProtection } from './detectors/directives-protection.js';
import { TaskModeIdleDetector } from './detectors/task-mode-idle.js';
import { BuildFailureRecurrenceDetector } from './detectors/build-failure-recurrence.js';
import { TokenSpikeDetector } from './detectors/token-spike.js';
import { AgentRoutingAnomalyDetector } from './detectors/agent-routing-anomaly.js';
import { ScopeCollisionRateDetector } from './detectors/scope-collision-rate.js';
import { NotificationDeliveryHealthDetector } from './detectors/notification-delivery-health.js';

// ─── Config Types ─────────────────────────────────────────────────────────────

/** Her detector için ayrı konfigürasyon */
export interface DetectorConfig {
  readonly stale_worker?: {
    readonly enabled: boolean;
    readonly threshold_ms?: number;
  };
  readonly scope_collision?: {
    readonly enabled: boolean;
  };
  readonly debt_trend?: {
    readonly enabled: boolean;
    readonly threshold_rate?: number;
  };
  readonly agent_routing?: {
    readonly enabled: boolean;
    readonly anomaly_threshold?: number;
  };
  readonly directives_protection?: {
    readonly enabled: boolean;
  };
  readonly task_mode_idle?: {
    readonly enabled: boolean;
    readonly idle_threshold_ms?: number;
    readonly deckent_style?: 'sprint' | 'task';
  };
  readonly build_failure_recurrence?: {
    readonly enabled: boolean;
    readonly recurrence_threshold?: number;
  };
  readonly token_spike?: {
    readonly enabled: boolean;
    readonly cost_threshold?: number;
  };
  readonly agent_routing_anomaly?: {
    readonly enabled: boolean;
    readonly anomaly_threshold?: number;
  };
  readonly scope_collision_rate?: {
    readonly enabled: boolean;
    readonly collision_threshold?: number;
  };
  readonly notification_delivery_health?: {
    readonly enabled: boolean;
    readonly failure_rate_threshold?: number;
  };
}

// ─── IDetector Interface ──────────────────────────────────────────────────────

/**
 * Tüm detector'ların uygulaması gereken arayüz.
 * Detector'lar context'e bakarak belirli event'lere tepki verir,
 * ilgisiz event için null döner.
 */
export interface IDetector {
  readonly detectorId: string;
  detect(ctx: DetectorContext): DetectorResult | null;
}

// ─── DetectorRegistry ─────────────────────────────────────────────────────────

/**
 * Aktif detector'ları tutar ve tek tek çalıştırır.
 * Bir detector başarısız olursa hata loglanır ama diğerleri çalışmaya devam eder.
 *
 * Usage:
 *   const registry = new DetectorRegistry(config.detectors);
 *   const results = await registry.runAll(ctx);
 */
export class DetectorRegistry {
  private readonly active: IDetector[] = [];

  constructor(config: DetectorConfig = {}) {
    if (config.stale_worker?.enabled) {
      this.active.push(
        new StaleWorkerDetector(config.stale_worker.threshold_ms),
      );
    }
    if (config.scope_collision?.enabled) {
      this.active.push(new ScopeCollisionMonitor());
    }
    if (config.debt_trend?.enabled) {
      this.active.push(
        new DebtTrendAnalyzer(config.debt_trend.threshold_rate),
      );
    }
    if (config.agent_routing?.enabled) {
      this.active.push(
        new AgentRoutingHealth(config.agent_routing.anomaly_threshold),
      );
    }
    if (config.directives_protection?.enabled) {
      this.active.push(new DirectivesMidSprintProtection());
    }
    if (config.task_mode_idle?.enabled) {
      this.active.push(
        new TaskModeIdleDetector(
          config.task_mode_idle.deckent_style ?? 'sprint',
          config.task_mode_idle.idle_threshold_ms,
        ),
      );
    }
    if (config.build_failure_recurrence?.enabled) {
      this.active.push(
        new BuildFailureRecurrenceDetector(
          config.build_failure_recurrence.recurrence_threshold,
        ),
      );
    }
    if (config.token_spike?.enabled) {
      this.active.push(
        new TokenSpikeDetector(config.token_spike.cost_threshold),
      );
    }
    if (config.agent_routing_anomaly?.enabled) {
      this.active.push(
        new AgentRoutingAnomalyDetector(
          config.agent_routing_anomaly.anomaly_threshold,
        ),
      );
    }
    if (config.scope_collision_rate?.enabled) {
      this.active.push(
        new ScopeCollisionRateDetector(
          config.scope_collision_rate.collision_threshold,
        ),
      );
    }
    if (config.notification_delivery_health?.enabled) {
      this.active.push(
        new NotificationDeliveryHealthDetector(
          config.notification_delivery_health.failure_rate_threshold,
        ),
      );
    }
  }

  /**
   * Tüm aktif detector'ları verilen context ile çalıştırır.
   * DetectorResult dönen sonuçlar (null olmayanlar) toplanarak döner.
   * Bir detector exception fırlatırsa loglanır, diğerleri etkilenmez.
   */
  async runAll(ctx: DetectorContext): Promise<DetectorResult[]> {
    const results: DetectorResult[] = [];
    for (const detector of this.active) {
      try {
        const result = detector.detect(ctx);
        if (result !== null) {
          results.push(result);
        }
      } catch (err) {
        // Detector başarısız oldu — nervous loop kırılmamalı
        console.error(`[DetectorRegistry] Detector ${detector.detectorId} failed:`, err);
      }
    }
    return results;
  }

  /** Aktif detector sayısı */
  get activeCount(): number {
    return this.active.length;
  }

  /** Aktif detector ID'lerinin listesi */
  get detectorIds(): string[] {
    return this.active.map(d => d.detectorId);
  }
}
