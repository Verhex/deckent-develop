// ─── Cross-Sprint Analyzer ───────────────────────────────────────────────────
// Reads outcome-tracker learnings.json to compute agent/skill success trends
// and NO_GO pattern trends across the last N sprints.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LearningsData } from './outcome-tracker.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SprintTrendPoint {
  sprintId: string;
  agentSuccessRates: Record<string, number>;
  skillSuccessRates: Record<string, number>;
  noGoCount: number;
  totalTasks: number;
}

export type TrendDirection = 'improving' | 'deteriorating' | 'stable';

export interface EntityTrend {
  entityId: string;
  direction: TrendDirection;
  firstHalfAvg: number;
  secondHalfAvg: number;
}

export interface TrendSummary {
  agentTrends: EntityTrend[];
  skillTrends: EntityTrend[];
  noGoTrend: TrendDirection;
}

export interface CrossSprintReport {
  sprints: SprintTrendPoint[];
  trends: TrendSummary;
  analyzedSprintCount: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LEARNINGS_FILE = '.deckent/routing/learnings.json';
const OUTCOMES_DIR = '.deckent/routing/outcomes';
const TREND_THRESHOLD = 0.05;

// ─── Pure trend computation ───────────────────────────────────────────────────

/**
 * Compute the trend direction for a series of numeric values.
 * Compares average of first half vs second half.
 */
export function analyzeTrend(values: number[]): TrendDirection {
  if (values.length < 2) return 'stable';
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const diff = avg(secondHalf) - avg(firstHalf);
  if (diff > TREND_THRESHOLD) return 'improving';
  if (diff < -TREND_THRESHOLD) return 'deteriorating';
  return 'stable';
}

// ─── SprintTrendAnalyzer ─────────────────────────────────────────────────────

export class SprintTrendAnalyzer {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Analyze the last `n` sprints from learnings.json.
   * Returns an empty report if data is missing or insufficient.
   */
  analyze(n = 10): CrossSprintReport {
    const learnings = this.loadLearnings();
    if (!learnings) {
      return { sprints: [], trends: this.emptyTrends(), analyzedSprintCount: 0 };
    }

    const sprintIds = learnings.recentSprints.slice(-n);
    if (sprintIds.length === 0) {
      return { sprints: [], trends: this.emptyTrends(), analyzedSprintCount: 0 };
    }

    const points = sprintIds.map(sprintId => this.buildTrendPoint(sprintId, learnings));

    const trends = this.computeTrends(points, learnings);
    return { sprints: points, trends, analyzedSprintCount: sprintIds.length };
  }

  // ─── Private helpers ─────────────────────────────────────────────

  private loadLearnings(): LearningsData | null {
    const path = join(this.projectRoot, LEARNINGS_FILE);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as LearningsData;
    } catch {
      return null;
    }
  }

  private buildTrendPoint(sprintId: string, learnings: LearningsData): SprintTrendPoint {
    // Per-sprint skill success rates from skillSprintHistory
    const skillSuccessRates: Record<string, number> = {};
    for (const [skillId, history] of Object.entries(learnings.skillSprintHistory ?? {})) {
      const record = history[sprintId];
      if (!record) continue;
      const total = record.successCount + record.failCount;
      skillSuccessRates[skillId] = total > 0 ? record.successCount / total : 0;
    }

    // Per-sprint agent success rates from outcomes file
    const agentSuccessRates: Record<string, number> = {};
    let noGoCount = 0;
    let totalTasks = 0;

    const outcomesPath = join(this.projectRoot, OUTCOMES_DIR, `${sprintId}.json`);
    if (existsSync(outcomesPath)) {
      try {
        const outcomes = JSON.parse(readFileSync(outcomesPath, 'utf-8')) as Array<{
          agentId?: string | null;
          evaluation: string;
        }>;
        totalTasks = outcomes.length;
        const agentTotals: Record<string, { success: number; total: number }> = {};
        for (const o of outcomes) {
          if (o.evaluation === 'NO_GO') noGoCount++;
          if (o.agentId && o.agentId !== 'generic') {
            const entry = agentTotals[o.agentId] ?? { success: 0, total: 0 };
            entry.total++;
            if (o.evaluation !== 'NO_GO') entry.success++;
            agentTotals[o.agentId] = entry;
          }
        }
        for (const [agentId, s] of Object.entries(agentTotals)) {
          agentSuccessRates[agentId] = s.total > 0 ? s.success / s.total : 0;
        }
      } catch {
        // corrupt file — leave empty
      }
    }

    return { sprintId, agentSuccessRates, skillSuccessRates, noGoCount, totalTasks };
  }

  private computeTrends(points: SprintTrendPoint[], learnings: LearningsData): TrendSummary {
    // Collect all agent IDs and skill IDs seen across points
    const agentIds = new Set<string>();
    const skillIds = new Set<string>();
    for (const p of points) {
      Object.keys(p.agentSuccessRates).forEach(id => agentIds.add(id));
      Object.keys(p.skillSuccessRates).forEach(id => skillIds.add(id));
    }
    // Also from learnings to include agents with sparse sprint data
    Object.keys(learnings.agentPerformance ?? {}).forEach(id => agentIds.add(id));
    Object.keys(learnings.skillPerformance ?? {}).forEach(id => skillIds.add(id));

    const agentTrends: EntityTrend[] = [];
    for (const agentId of agentIds) {
      const values = points.map(p => p.agentSuccessRates[agentId] ?? 0);
      const direction = analyzeTrend(values);
      const mid = Math.floor(values.length / 2);
      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
      agentTrends.push({
        entityId: agentId,
        direction,
        firstHalfAvg: avg(values.slice(0, mid)),
        secondHalfAvg: avg(values.slice(mid)),
      });
    }

    const skillTrends: EntityTrend[] = [];
    for (const skillId of skillIds) {
      const values = points.map(p => p.skillSuccessRates[skillId] ?? 0);
      const direction = analyzeTrend(values);
      const mid = Math.floor(values.length / 2);
      const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);
      skillTrends.push({
        entityId: skillId,
        direction,
        firstHalfAvg: avg(values.slice(0, mid)),
        secondHalfAvg: avg(values.slice(mid)),
      });
    }

    const noGoValues = points.map(p => (p.totalTasks > 0 ? p.noGoCount / p.totalTasks : 0));
    // For noGoTrend: increasing NO_GO rate is "deteriorating", decreasing is "improving"
    const noGoDirection = analyzeTrend(noGoValues);

    return { agentTrends, skillTrends, noGoTrend: noGoDirection };
  }

  private emptyTrends(): TrendSummary {
    return { agentTrends: [], skillTrends: [], noGoTrend: 'stable' };
  }
}
