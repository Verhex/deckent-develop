// src/nervous/detector-registry.ts
//
// DetectorRegistry — 5 nervous system detector'ını yönetir ve çalıştırır.
// Config'e göre hangi detector'ların aktif olduğunu belirler, runAll() ile
// tümünü çağırır, tek bir detector'ın başarısız olması diğerlerini etkilemez.
//
// Sprint 148 Task 8.

import type { DetectorContext, DetectorResult } from '../core/nervous-types.js';
import { StaleWorkerDetector } from './detectors/stale-worker.js';
import { ScopeCollisionMonitor } from './detectors/scope-collision.js';
import { DebtTrendAnalyzer } from './detectors/debt-trend.js';
import { AgentRoutingHealth } from './detectors/agent-routing.js';
import { DirectivesMidSprintProtection } from './detectors/directives-protection.js';

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
