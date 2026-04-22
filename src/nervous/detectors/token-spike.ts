// src/nervous/detectors/token-spike.ts
//
// TokenSpikeDetector — Sprint cost > 2x ortalama veya mutlak eşik aşıldığında
// cost-guard alert üretir. Sprint 140 $42 disaster muhafızı.
//
// Sprint 151 Task 15 — Nervous System Detector 7/10

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Default maliyet eşiği (USD) */
const DEFAULT_COST_THRESHOLD = 50;

/** Token → USD yaklaşık dönüşüm oranları (per 1M token) */
const TOKEN_COST_PER_MILLION: Record<string, { input: number; output: number }> = {
  opus: { input: 15, output: 75 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 0.25, output: 1.25 },
};

/** Default oran (bilinmeyen model için sonnet tahmini) */
const DEFAULT_RATE = { input: 3, output: 15 };

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

    for (const rf of resultFiles) {
      try {
        const data = JSON.parse(
          readFileSync(join(tasksDir, rf), 'utf-8'),
        ) as ResultRecord;

        if (data.tokenUsage) {
          const input = data.tokenUsage.inputTokens ?? 0;
          const output = data.tokenUsage.outputTokens ?? 0;
          const model = data.tokenUsage.model ?? 'sonnet';
          const rates = TOKEN_COST_PER_MILLION[model] ?? DEFAULT_RATE;

          totalInputTokens += input;
          totalOutputTokens += output;
          estimatedCostUsd += (input / 1_000_000) * rates.input
            + (output / 1_000_000) * rates.output;
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
      },
    };
  }
}
