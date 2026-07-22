// src/nervous/detectors/token-spike.ts
//
// TokenSpikeDetector — Sprint cost > 2x ortalama veya mutlak eşik aşıldığında
// cost-guard alert üretir. Sprint 140 $42 disaster muhafızı.
//
// Sprint 151 Task 15 — Nervous System Detector 7/10

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { modelRegistry, getLegacyModelMigration } from '../../core/model-registry.js';

/** Default maliyet eşiği (USD) */
const DEFAULT_COST_THRESHOLD = 50;

/**
 * Resolve a result's model text to its CANONICAL registry pricing (per-MTok
 * `costPerMillion`), or `null` when the model is unknown — never a silent named
 * default. Prices come from the model-registry (the canonical per-model source),
 * so a stale hardcoded per-alias rate can no longer drift from the live catalog.
 *
 * Reading historical `.result` files is a HISTORICAL EVIDENCE lookup, so legacy
 * alias text (`opus`/`sonnet`/`haiku`) is recognized ONLY through the explicit
 * non-dispatch compatibility boundary (`getLegacyModelMigration`): that path only
 * prices past evidence, it never routes or dispatches. An unknown model is reported
 * as unpriced (`unpricedModelCount`), never charged at a named model's rate.
 */
function resolveModelPricing(
  model: string | undefined,
): { input: number; output: number } | null {
  if (!model) return null;
  const direct = modelRegistry.get(model);
  if (direct) return direct.costPerMillion;
  // Non-dispatch historical compat: map a legacy alias to its canonical id, then price.
  const migrated = getLegacyModelMigration(model);
  if (migrated) {
    const def = modelRegistry.get(migrated);
    if (def) return def.costPerMillion;
  }
  return null;
}

interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  model?: string;
}

interface ResultRecord {
  tokenUsage?: TokenUsage;
}

/**
 * Sprint token/cost spike'larını tespit eder.
 *
 * Tetikleyici: sprint-lifecycle SPRINT_PHASE_CHANGE newPhase=RETRO
 * (tüm result'lar yazılmış, toplam cost hesaplanabilir)
 *
 * Çalışma mantığı:
 * 1. .tasks/*.result dosyalarından tokenUsage topla
 * 2. Tahmini USD cost hesapla
 * 3. Configurable threshold ($50 default) veya event payload'daki average ile karşılaştır
 * 4. Threshold aşıldıysa cost-guard warning/critical üret
 */
export class TokenSpikeDetector {
  readonly detectorId = 'token-spike';

  constructor(private readonly costThreshold = DEFAULT_COST_THRESHOLD) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // RETRO fazında tetikle — tüm result'lar hazır
    if (ctx.event.source !== 'sprint-lifecycle') return null;
    if (
      ctx.event.type !== 'SPRINT_PHASE_CHANGE' ||
      ctx.event.payload['newPhase'] !== 'RETRO'
    ) {
      return null;
    }

    const tasksDir = join(ctx.projectRoot, '.tasks');
    if (!existsSync(tasksDir)) return null;

    // ─── Token usage topla ───────────────────────────────────────────────
    const resultFiles = readdirSync(tasksDir).filter(
      f => f.startsWith('task-') && f.endsWith('.result'),
    );

    if (resultFiles.length === 0) return null;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let estimatedCostUsd = 0;
    let unpricedModelCount = 0;

    for (const rf of resultFiles) {
      try {
        const data = JSON.parse(
          readFileSync(join(tasksDir, rf), 'utf-8'),
        ) as ResultRecord;

        if (data.tokenUsage) {
          const input = data.tokenUsage.inputTokens ?? 0;
          const output = data.tokenUsage.outputTokens ?? 0;

          totalInputTokens += input;
          totalOutputTokens += output;

          const pricing = resolveModelPricing(data.tokenUsage.model);
          if (pricing) {
            estimatedCostUsd += (input / 1_000_000) * pricing.input
              + (output / 1_000_000) * pricing.output;
          } else {
            // Unknown model → visibly unavailable, NOT priced at a named default.
            unpricedModelCount += 1;
          }
        }
      } catch {
        // Corrupt result — skip
      }
    }

    // ─── Average comparison (payload'dan gelirse) ────────────────────────
    const avgCost = typeof ctx.event.payload['averageCostUsd'] === 'number'
      ? ctx.event.payload['averageCostUsd'] as number
      : undefined;

    const isAboveThreshold = estimatedCostUsd > this.costThreshold;
    const isAboveAverage = avgCost !== undefined && estimatedCostUsd > avgCost * 2;

    if (!isAboveThreshold && !isAboveAverage) return null;

    const severity = estimatedCostUsd > this.costThreshold * 2 ? 'critical' : 'warning';

    return {
      risk: severity === 'critical' ? 'high' : 'medium',
      shouldNotify: true,
      severity,
      title: `Token cost spike $${estimatedCostUsd.toFixed(2)}`,
      message: `Estimated sprint cost $${estimatedCostUsd.toFixed(2)} ${isAboveThreshold ? `exceeds the $${this.costThreshold} threshold` : `is >2x the $${avgCost} average`} — review token usage`,
      groupKey: `token-spike:${ctx.sprintState.sprintId}`,
      suggestedActions: [
        {
          id: 'COST_OVER_THRESHOLD',
          label: `Sprint cost $${estimatedCostUsd.toFixed(2)} exceeds threshold $${this.costThreshold}`,
          risk: severity === 'critical' ? 'high' as const : 'medium' as const,
          payload: {
            estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
            threshold: this.costThreshold,
            totalInputTokens,
            totalOutputTokens,
            averageCost: avgCost,
          },
        },
      ],
      metadata: {
        type: 'token-spike',
        estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
        totalInputTokens,
        totalOutputTokens,
        taskCount: resultFiles.length,
        // Models we could not price (unknown to the registry) — surfaced so an
        // unknown model is visibly unavailable, never silently priced as a default.
        unpricedModelCount,
      },
    };
  }
}
