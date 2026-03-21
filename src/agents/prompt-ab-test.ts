// ─── Prompt A/B Testing ─────────────────────────────────────────────────────
// Enables controlled experiments between two prompt variants for an agent.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ──────────────────────────────────────────────────────────

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

// ─── Constants ──────────────────────────────────────────────────────

const EXPERIMENTS_DIR = '.deckent/experiments';
const MIN_SAMPLES_FOR_WINNER = 4;

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
      throw new Error(`Agent "${agentId}" already has an active experiment: ${existing.id}`);
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
   * Random 50/50 assignment.
   */
  assignVariant(_experimentId: string): 'A' | 'B' {
    return Math.random() < 0.5 ? 'A' : 'B';
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
      throw new Error(`Experiment not found: ${experimentId}`);
    }
    if (experiment.status !== 'active') {
      throw new Error(`Experiment ${experimentId} is not active`);
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
      throw new Error(`Experiment not found: ${experimentId}`);
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
      throw new Error(`Experiment not found: ${experimentId}`);
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
