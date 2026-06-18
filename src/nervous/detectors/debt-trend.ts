// src/nervous/detectors/debt-trend.ts
//
// DebtTrendAnalyzer — Son N sprint ortalaması > %15 debt rate → DEBT_REPRIORITIZE.
// MemoryStore.getByType('memory') ile son sprint learnings okur.
//
// Design spec: docs/superpowers/specs/2026-04-20-deckent-nervous-system-design.md Section 5.4
// Sprint 147 Task 11

import type { DetectorContext, DetectorResult } from '../../core/nervous-types.js';
import { MemoryStore } from '../../core/memory-store.js';
import type { MemoryEntryV2 } from '../../core/memory-types.js';

/**
 * Son N sprint'in ortalama debt rate'ini hesaplar.
 * Oran threshold'u aşarsa DEBT_REPRIORITIZE önerisinde bulunur.
 *
 * Tetikleyici: sprint-lifecycle source + SPRINT_RETRO_COMPLETE event tipi.
 */
export class DebtTrendAnalyzer {
  readonly detectorId = 'debt-trend';

  constructor(
    private readonly thresholdRate = 0.15,
    private readonly windowSize = 3,
  ) {}

  detect(ctx: DetectorContext): DetectorResult | null {
    // Sadece sprint-lifecycle kaynağından SPRINT_RETRO_COMPLETE event'ini işle
    if (ctx.event.source !== 'sprint-lifecycle') return null;
    if (ctx.event.type !== 'SPRINT_RETRO_COMPLETE') return null;

    const currentSprintNum = parseSprintNum(ctx.sprintState.sprintId);
    if (currentSprintNum === null) return null;

    // MemoryStore'dan tüm 'memory' tipli kayıtları al
    // MemoryStore constructor dbPath bekler — projectRoot/.brain/memory.db
    const dbPath = `${ctx.projectRoot}/.brain/memory.db`;
    const store = new MemoryStore(dbPath);
    const allMemories = store.getByType('memory');

    // Son windowSize sprint'in kayıtlarını filtrele
    // currentSprintNum dahil, windowSize kadar geriye git
    const minSprintNum = currentSprintNum - this.windowSize;
    const recentSprints = allMemories
      .filter(m => m.sprint_num >= minSprintNum && m.sprint_num < currentSprintNum)
      .sort((a, b) => b.sprint_num - a.sprint_num)
      .slice(0, this.windowSize);

    if (recentSprints.length < this.windowSize) {
      return null; // Yeterli veri yok
    }

    // Her sprint için debt rate hesapla
    const avgDebtRate = recentSprints.reduce((sum, s) => {
      const meta = parseMetadata(s);
      const totalTasks = (meta['totalTasks'] as number | undefined) ?? 1;
      const debtCount = (meta['debtCount'] as number | undefined) ?? 0;
      return sum + (debtCount / Math.max(totalTasks, 1));
    }, 0) / this.windowSize;

    if (avgDebtRate < this.thresholdRate) return null;

    return {
      risk: 'medium',
      shouldNotify: true,
      severity: 'warning',
      title: `Debt trend rising (${(avgDebtRate * 100).toFixed(1)}%)`,
      message: `Avg tech-debt rate over last ${this.windowSize} sprints is ${(avgDebtRate * 100).toFixed(1)}%, above the ${(this.thresholdRate * 100).toFixed(0)}% threshold — re-prioritize next sprint`,
      groupKey: `debt-trend:${ctx.sprintState.sprintId}`,
      suggestedActions: [
        {
          id: 'DEBT_REPRIORITIZE',
          label: `Debt trending up (${(avgDebtRate * 100).toFixed(1)}%), re-prioritize next sprint`,
          risk: 'medium' as const,
          payload: {
            avgDebtRate,
            windowSize: this.windowSize,
            sprints: recentSprints.map(s => s.sprint_id),
          },
        },
      ],
      metadata: {
        type: 'debt-trend',
        avgDebtRate,
        threshold: this.thresholdRate,
      },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sprint ID'den sprint numarasını çıkarır.
 * "sprint-147" → 147, null → null
 */
function parseSprintNum(sprintId: string | null): number | null {
  if (!sprintId) return null;
  const match = sprintId.match(/sprint-(\d+)/);
  if (!match || !match[1]) return null;
  const num = parseInt(match[1], 10);
  return isNaN(num) ? null : num;
}

/**
 * MemoryEntryV2.metadata (JSON string) → Record<string, unknown>
 * Parse hatası durumunda boş nesne döner.
 */
function parseMetadata(entry: MemoryEntryV2): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(entry.metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
