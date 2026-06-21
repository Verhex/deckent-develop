// ─── Prompt Analytics ────────────────────────────────────────────────────────
// Unified module combining prompt metrics collection and A/B testing.
// Merges prompt-metrics.ts and prompt-ab-test.ts into a single cohesive module.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorRegistry } from '../core/errors.js';
import type { PromptVersion } from './prompt-version.js';

// ─── Types: A/B Testing ─────────────────────────────────────────────

export interface ExperimentResult {
  variant: 'A' | 'B';
  evaluation: string;
  coverage: number;
  sprintId: string;
}

export interface Experiment {
  id: string;
  agentId: string;
  variantA: string;
  variantB: string;
  results: ExperimentResult[];
  status: 'active' | 'completed';
  createdAt: string;
}

export interface ExperimentAnalysis {
  winner: 'A' | 'B' | 'inconclusive';
  confidencePercent: number;
  sampleSize: number;
  aStats: { uses: number; successRate: number; avgCoverage: number };
  bStats: { uses: number; successRate: number; avgCoverage: number };
}

// ─── Types: Metrics ─────────────────────────────────────────────────

export interface PromptMetricsReport {
  agentId: string;
  currentVersion: number;
  totalVersions: number;
  currentSuccessRate: number;
  bestVersion: { version: number; successRate: number };
  worstVersion: { version: number; successRate: number };
  experimentStatus: 'none' | 'active' | 'completed';
  trend: 'improving' | 'declining' | 'stable';
}

// ─── Constants ──────────────────────────────────────────────────────

const EXPERIMENTS_DIR = '.deckent/experiments';
const MIN_SAMPLES_FOR_WINNER = 4;
const TREND_WINDOW = 3;
const TREND_THRESHOLD = 0.05;  // 5% difference to detect a trend

// ─── Helpers ────────────────────────────────────────────────────────

function isSuccess(evaluation: string): boolean {
  return evaluation === 'DONE' || evaluation === 'GO_WITH_TECH_DEBT';
}

function generateId(): string {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── PromptABTester ─────────────────────────────────────────────────

export class PromptABTester {
  constructor(private projectRoot: string) {}

  /**
   * Create a new A/B experiment for an agent.
   * Only one active experiment per agent at a time.
   */
  createExperiment(agentId: string, variantA: string, variantB: string): Experiment {
    // Check for existing active experiment
    const existing = this.getActiveExperiment(agentId);
    if (existing) {
      throw ErrorRegistry.createError('DECKENT_E064', { message: `Agent "${agentId}" already has an active experiment: ${existing.id}` });
    }

    const experiment: Experiment = {
      id: generateId(),
      agentId,
      variantA,
      variantB,
      results: [],
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    this._saveExperiment(experiment);
    return experiment;
  }

  /**
   * Get the currently active experiment for an agent.
   * Returns null if no active experiment exists.
   */
  getActiveExperiment(agentId: string): Experiment | null {
    const experiments = this._loadExperiments(agentId);
    return experiments.find(e => e.status === 'active') ?? null;
  }

  /**
   * Get an experiment by ID.
   */
  getExperiment(experimentId: string): Experiment | null {
    const agentDirs = this._listAgentDirs();
    for (const agentId of agentDirs) {
      const experiments = this._loadExperiments(agentId);
      const found = experiments.find(e => e.id === experimentId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Assign a variant (A or B) for the next run.
   * Uses balanced assignment: returns the under-represented variant.
   * Falls back to random 50/50 when experiment is not found or counts are equal.
   */
  assignVariant(experimentId: string): 'A' | 'B' {
    const experiment = this.getExperiment(experimentId);
    if (!experiment) {
      return Math.random() < 0.5 ? 'A' : 'B';
    }
    const aCount = experiment.results.filter(r => r.variant === 'A').length;
    const bCount = experiment.results.filter(r => r.variant === 'B').length;
    if (aCount === bCount) {
      return Math.random() < 0.5 ? 'A' : 'B';
    }
    return aCount < bCount ? 'A' : 'B';
  }

  /**
   * Record a result for an experiment.
   */
  recordResult(
    experimentId: string,
    variant: 'A' | 'B',
    evaluation: string,
    coverage: number,
    sprintId: string,
  ): void {
    const experiment = this.getExperiment(experimentId);
    if (!experiment) {
      throw ErrorRegistry.createError('DECKENT_E065', { message: `Experiment not found: ${experimentId}` });
    }
    if (experiment.status !== 'active') {
      throw ErrorRegistry.createError('DECKENT_E066', { message: `Experiment ${experimentId} is not active` });
    }

    experiment.results.push({ variant, evaluation, coverage, sprintId });
    this._saveExperiment(experiment);
  }

  /**
   * Analyze an experiment's results.
   * Requires minimum 4 total samples before declaring a winner.
   */
  analyzeExperiment(experimentId: string): ExperimentAnalysis {
    const experiment = this.getExperiment(experimentId);
    if (!experiment) {
      throw ErrorRegistry.createError('DECKENT_E065', { message: `Experiment not found: ${experimentId}` });
    }

    const aResults = experiment.results.filter(r => r.variant === 'A');
    const bResults = experiment.results.filter(r => r.variant === 'B');

    const aStats = this._computeStats(aResults);
    const bStats = this._computeStats(bResults);

    const sampleSize = experiment.results.length;

    // Not enough data
    if (sampleSize < MIN_SAMPLES_FOR_WINNER || aResults.length === 0 || bResults.length === 0) {
      return {
        winner: 'inconclusive',
        confidencePercent: 0,
        sampleSize,
        aStats,
        bStats,
      };
    }

    // Determine winner based on combined score (success rate * 0.7 + coverage * 0.3)
    const aScore = aStats.successRate * 0.7 + (aStats.avgCoverage / 100) * 0.3;
    const bScore = bStats.successRate * 0.7 + (bStats.avgCoverage / 100) * 0.3;

    const diff = Math.abs(aScore - bScore);
    const confidencePercent = Math.min(100, Math.round(diff * 100 * Math.sqrt(sampleSize)));

    let winner: 'A' | 'B' | 'inconclusive';
    if (diff < 0.05) {
      winner = 'inconclusive';
    } else if (aScore > bScore) {
      winner = 'A';
    } else {
      winner = 'B';
    }

    return {
      winner,
      confidencePercent,
      sampleSize,
      aStats,
      bStats,
    };
  }

  /**
   * Complete an experiment (mark as completed).
   */
  completeExperiment(experimentId: string): void {
    const experiment = this.getExperiment(experimentId);
    if (!experiment) {
      throw ErrorRegistry.createError('DECKENT_E065', { message: `Experiment not found: ${experimentId}` });
    }
    experiment.status = 'completed';
    this._saveExperiment(experiment);
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private _computeStats(results: ExperimentResult[]): {
    uses: number;
    successRate: number;
    avgCoverage: number;
  } {
    if (results.length === 0) {
      return { uses: 0, successRate: 0, avgCoverage: 0 };
    }
    const successCount = results.filter(r => isSuccess(r.evaluation)).length;
    const totalCoverage = results.reduce((sum, r) => sum + r.coverage, 0);
    return {
      uses: results.length,
      successRate: successCount / results.length,
      avgCoverage: totalCoverage / results.length,
    };
  }

  private _experimentDir(agentId: string): string {
    return join(this.projectRoot, EXPERIMENTS_DIR, agentId);
  }

  private _experimentFilePath(experiment: Experiment): string {
    return join(this._experimentDir(experiment.agentId), `${experiment.id}.json`);
  }

  private _saveExperiment(experiment: Experiment): void {
    const dir = this._experimentDir(experiment.agentId);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      this._experimentFilePath(experiment),
      JSON.stringify(experiment, null, 2) + '\n',
      'utf-8',
    );
  }

  private _loadExperiments(agentId: string): Experiment[] {
    const dir = this._experimentDir(agentId);
    if (!existsSync(dir)) return [];
    const experiments: Experiment[] = [];
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = readFileSync(join(dir, file), 'utf-8');
          const parsed = JSON.parse(content) as Experiment;
          if (parsed.id && parsed.agentId) {
            experiments.push(parsed);
          }
        } catch {
          // Skip malformed files
        }
      }
    } catch {
      // Directory read error
    }
    return experiments;
  }

  private _listAgentDirs(): string[] {
    const baseDir = join(this.projectRoot, EXPERIMENTS_DIR);
    if (!existsSync(baseDir)) return [];
    try {
      return readdirSync(baseDir);
    } catch {
      return [];
    }
  }
}

// ─── PromptMetrics ──────────────────────────────────────────────────

export class PromptMetrics {
  /**
   * Collect metrics for an agent from its prompt versions and experiment.
   */
  collectMetrics(
    agentId: string,
    versions: PromptVersion[],
    experiment?: Experiment,
  ): PromptMetricsReport {
    const totalVersions = versions.length;

    // Current version is the highest version number
    const sorted = [...versions].sort((a, b) => a.version - b.version);
    const currentVersion = sorted.length > 0 ? (sorted.at(-1) ?? null) : null;
    const currentVersionNum = currentVersion?.version ?? 0;
    const currentSuccessRate = currentVersion?.stats.successRate ?? 0;

    // Best and worst versions
    const best = this._findBest(sorted);
    const worst = this._findWorst(sorted);

    // Experiment status
    let experimentStatus: 'none' | 'active' | 'completed' = 'none';
    if (experiment) {
      experimentStatus = experiment.status;
    }

    // Trend from last TREND_WINDOW versions
    const trend = this._calculateTrend(sorted);

    return {
      agentId,
      currentVersion: currentVersionNum,
      totalVersions,
      currentSuccessRate,
      bestVersion: best,
      worstVersion: worst,
      experimentStatus,
      trend,
    };
  }

  /**
   * Format a metrics report into a human-readable string.
   */
  formatMetricsReport(report: PromptMetricsReport): string {
    const lines: string[] = [];
    lines.push(`Prompt Metrics for agent: ${report.agentId}`);
    lines.push(`  Current version: v${report.currentVersion}`);
    lines.push(`  Total versions: ${report.totalVersions}`);
    lines.push(`  Current success rate: ${(report.currentSuccessRate * 100).toFixed(1)}%`);
    lines.push(`  Best version: v${report.bestVersion.version} (${(report.bestVersion.successRate * 100).toFixed(1)}%)`);
    lines.push(`  Worst version: v${report.worstVersion.version} (${(report.worstVersion.successRate * 100).toFixed(1)}%)`);
    lines.push(`  Experiment: ${report.experimentStatus}`);
    lines.push(`  Trend: ${report.trend}`);
    return lines.join('\n');
  }

  // ─── Internal ──────────────────────────────────────────────────────

  private _findBest(versions: PromptVersion[]): { version: number; successRate: number } {
    if (versions.length === 0) {
      return { version: 0, successRate: 0 };
    }
    let best = versions[0]; // length > 0 guarantees defined
    if (!best) return { version: 0, successRate: 0 };
    for (const v of versions) {
      if (v.stats.successRate > best.stats.successRate) {
        best = v;
      } else if (
        v.stats.successRate === best.stats.successRate &&
        v.stats.uses > best.stats.uses
      ) {
        best = v;
      }
    }
    return { version: best.version, successRate: best.stats.successRate };
  }

  private _findWorst(versions: PromptVersion[]): { version: number; successRate: number } {
    if (versions.length === 0) {
      return { version: 0, successRate: 0 };
    }
    let worst = versions[0]; // length > 0 guarantees defined
    if (!worst) return { version: 0, successRate: 0 };
    for (const v of versions) {
      if (v.stats.successRate < worst.stats.successRate) {
        worst = v;
      }
    }
    return { version: worst.version, successRate: worst.stats.successRate };
  }

  private _calculateTrend(versions: PromptVersion[]): 'improving' | 'declining' | 'stable' {
    if (versions.length < 2) return 'stable';

    const recent = versions.slice(-TREND_WINDOW);
    if (recent.length < 2) return 'stable';

    // Compare first and last in the window
    const first = recent[0];
    const last = recent.at(-1);
    if (!first || !last) return 'stable';

    const diff = last.stats.successRate - first.stats.successRate;

    if (diff > TREND_THRESHOLD) return 'improving';
    if (diff < -TREND_THRESHOLD) return 'declining';
    return 'stable';
  }
}

// ─── PromptAnalytics (unified class) ────────────────────────────────

/**
 * Unified analytics class combining A/B testing and metrics collection.
 * Provides a single entry point for all prompt performance analysis.
 */
export class PromptAnalytics {
  private abTester: PromptABTester;
  private metrics: PromptMetrics;

  constructor(projectRoot: string) {
    this.abTester = new PromptABTester(projectRoot);
    this.metrics = new PromptMetrics();
  }

  // ─── A/B Testing delegations ─────────────────────────────────────

  createExperiment(agentId: string, variantA: string, variantB: string): Experiment {
    return this.abTester.createExperiment(agentId, variantA, variantB);
  }

  getActiveExperiment(agentId: string): Experiment | null {
    return this.abTester.getActiveExperiment(agentId);
  }

  getExperiment(experimentId: string): Experiment | null {
    return this.abTester.getExperiment(experimentId);
  }

  assignVariant(experimentId: string): 'A' | 'B' {
    return this.abTester.assignVariant(experimentId);
  }

  recordResult(
    experimentId: string,
    variant: 'A' | 'B',
    evaluation: string,
    coverage: number,
    sprintId: string,
  ): void {
    return this.abTester.recordResult(experimentId, variant, evaluation, coverage, sprintId);
  }

  analyzeExperiment(experimentId: string): ExperimentAnalysis {
    return this.abTester.analyzeExperiment(experimentId);
  }

  completeExperiment(experimentId: string): void {
    return this.abTester.completeExperiment(experimentId);
  }

  // ─── Metrics delegations ─────────────────────────────────────────

  collectMetrics(
    agentId: string,
    versions: PromptVersion[],
    experiment?: Experiment,
  ): PromptMetricsReport {
    return this.metrics.collectMetrics(agentId, versions, experiment);
  }

  formatMetricsReport(report: PromptMetricsReport): string {
    return this.metrics.formatMetricsReport(report);
  }

  /**
   * Collect metrics for an agent, automatically fetching the active experiment.
   * Convenience method that combines both A/B testing and metrics.
   */
  collectMetricsWithExperiment(agentId: string, versions: PromptVersion[]): PromptMetricsReport {
    const experiment = this.getActiveExperiment(agentId) ?? undefined;
    return this.metrics.collectMetrics(agentId, versions, experiment);
  }
}
