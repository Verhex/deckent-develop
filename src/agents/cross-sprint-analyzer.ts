// ─── Cross-Sprint Analyzer ──────────────────────────────────────────────────
// Analyzes agent performance across multiple sprints. Reads from .brain/learning/.

import * as fs from 'node:fs';
import * as path from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

export interface SprintEntry {
  sprintId: string;
  evaluation: string;
  coverage: number;
  taskType: string;
  durationMs?: number;
}

export interface CrossSprintReport {
  agentId: string;
  sprintsAnalyzed: number;
  successTrend: number[];
  coverageTrend: number[];
  taskTypeDistribution: Record<string, number>;
  bestTaskType: string;
  worstTaskType: string;
  improvementSuggestions: string[];
}

export interface SprintRange {
  from: string;
  to: string;
}

// ─── Constants ──────────────────────────────────────────────────────

const LEARNING_DIR = '.brain/learning';
const SUCCESS_EVALUATIONS = new Set(['DONE', 'GO_WITH_TECH_DEBT']);
const LOW_SUCCESS_THRESHOLD = 0.5;
const LOW_COVERAGE_THRESHOLD = 60;
const DECLINING_WINDOW = 3;

// ─── CrossSprintAnalyzer ────────────────────────────────────────────

export class CrossSprintAnalyzer {
  constructor(private projectRoot: string) {}

  /**
   * Analyze agent performance across a range of sprints.
   */
  analyze(agentId: string, sprintRange: SprintRange): CrossSprintReport {
    const entries = this._loadEntries(agentId, sprintRange);

    if (entries.length === 0) {
      return this._emptyReport(agentId);
    }

    const sprintIds = this._uniqueSprintIds(entries);
    const successTrend = this._computeSuccessTrend(entries, sprintIds);
    const coverageTrend = this._computeCoverageTrend(entries, sprintIds);
    const taskTypeDistribution = this._computeTaskTypeDistribution(entries);
    const { best, worst } = this._computeBestWorstTaskType(entries);
    const improvementSuggestions = this._generateSuggestions(
      successTrend,
      coverageTrend,
      taskTypeDistribution,
      entries,
    );

    return {
      agentId,
      sprintsAnalyzed: sprintIds.length,
      successTrend,
      coverageTrend,
      taskTypeDistribution,
      bestTaskType: best,
      worstTaskType: worst,
      improvementSuggestions,
    };
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  _loadEntries(agentId: string, range: SprintRange): SprintEntry[] {
    const dir = path.join(this.projectRoot, LEARNING_DIR);
    if (!fs.existsSync(dir)) return [];

    let files: string[];
    try {
      files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch {
      return [];
    }

    const all: SprintEntry[] = [];
    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        if (!Array.isArray(raw)) continue;
        for (const entry of raw) {
          if (entry.agentId === agentId && this._inRange(entry.sprintId, range)) {
            all.push({
              sprintId: entry.sprintId ?? '',
              evaluation: entry.evaluation ?? 'NO_GO',
              coverage: typeof entry.coverage === 'number' ? entry.coverage : 0,
              taskType: entry.taskType ?? 'unknown',
              durationMs: entry.durationMs,
            });
          }
        }
      } catch {
        // skip invalid files
      }
    }

    return all.sort((a, b) => a.sprintId.localeCompare(b.sprintId));
  }

  _inRange(sprintId: string, range: SprintRange): boolean {
    if (!sprintId) return false;
    return sprintId >= range.from && sprintId <= range.to;
  }

  _uniqueSprintIds(entries: SprintEntry[]): string[] {
    return [...new Set(entries.map(e => e.sprintId))].sort();
  }

  _computeSuccessTrend(entries: SprintEntry[], sprintIds: string[]): number[] {
    return sprintIds.map(sid => {
      const sprintEntries = entries.filter(e => e.sprintId === sid);
      if (sprintEntries.length === 0) return 0;
      const successes = sprintEntries.filter(e => SUCCESS_EVALUATIONS.has(e.evaluation)).length;
      return successes / sprintEntries.length;
    });
  }

  _computeCoverageTrend(entries: SprintEntry[], sprintIds: string[]): number[] {
    return sprintIds.map(sid => {
      const sprintEntries = entries.filter(e => e.sprintId === sid);
      if (sprintEntries.length === 0) return 0;
      const total = sprintEntries.reduce((sum, e) => sum + e.coverage, 0);
      return total / sprintEntries.length;
    });
  }

  _computeTaskTypeDistribution(entries: SprintEntry[]): Record<string, number> {
    const dist: Record<string, number> = {};
    for (const e of entries) {
      dist[e.taskType] = (dist[e.taskType] ?? 0) + 1;
    }
    return dist;
  }

  _computeBestWorstTaskType(entries: SprintEntry[]): { best: string; worst: string } {
    const typeStats = new Map<string, { success: number; total: number }>();

    for (const e of entries) {
      const stat = typeStats.get(e.taskType) ?? { success: 0, total: 0 };
      stat.total += 1;
      if (SUCCESS_EVALUATIONS.has(e.evaluation)) {
        stat.success += 1;
      }
      typeStats.set(e.taskType, stat);
    }

    let best = 'unknown';
    let worst = 'unknown';
    let bestRate = -1;
    let worstRate = 2;

    for (const [type, stat] of typeStats) {
      const rate = stat.total > 0 ? stat.success / stat.total : 0;
      if (rate > bestRate) {
        bestRate = rate;
        best = type;
      }
      if (rate < worstRate) {
        worstRate = rate;
        worst = type;
      }
    }

    return { best, worst };
  }

  _generateSuggestions(
    successTrend: number[],
    coverageTrend: number[],
    _taskTypeDistribution: Record<string, number>,
    entries: SprintEntry[],
  ): string[] {
    const suggestions: string[] = [];

    // Check overall success rate
    if (entries.length > 0) {
      const overallSuccess = entries.filter(e => SUCCESS_EVALUATIONS.has(e.evaluation)).length / entries.length;
      if (overallSuccess < LOW_SUCCESS_THRESHOLD) {
        suggestions.push('Overall success rate is below 50%. Consider reviewing agent prompt or specialization.');
      }
    }

    // Check coverage trend
    if (coverageTrend.length > 0) {
      const avgCoverage = coverageTrend.reduce((s, c) => s + c, 0) / coverageTrend.length;
      if (avgCoverage < LOW_COVERAGE_THRESHOLD) {
        suggestions.push('Average coverage is below 60%. Add test coverage requirements to agent prompt.');
      }
    }

    // Check declining success trend
    if (successTrend.length >= DECLINING_WINDOW) {
      const recent = successTrend.slice(-DECLINING_WINDOW);
      const isDecreasing = recent.every((val, i) => i === 0 || val <= (recent[i - 1] ?? val));
      if (isDecreasing && (recent[recent.length - 1] ?? 0) < (recent[0] ?? 0)) {
        suggestions.push('Success rate is declining over recent sprints. Consider prompt evolution.');
      }
    }

    // Check if single task type dominates
    const typeEntries = Object.entries(_taskTypeDistribution);
    if (typeEntries.length > 1) {
      const totalTasks = typeEntries.reduce((s, [, c]) => s + c, 0);
      const maxType = typeEntries.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (maxType[1] / totalTasks > 0.8) {
        suggestions.push(`Agent is heavily concentrated on "${maxType[0]}" tasks. Consider diversifying.`);
      }
    }

    return suggestions;
  }

  _emptyReport(agentId: string): CrossSprintReport {
    return {
      agentId,
      sprintsAnalyzed: 0,
      successTrend: [],
      coverageTrend: [],
      taskTypeDistribution: {},
      bestTaskType: 'unknown',
      worstTaskType: 'unknown',
      improvementSuggestions: [],
    };
  }
}
