// ─── Outcome Tracker ────────────────────────────────────────────────────────
// Tracks routing outcomes (agent/skill → GO/NO_GO) and generates learning bonuses.
// Data stored in .deckent/routing/ for cross-sprint learning.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { TaskDNA, LearningBonus, IntentType } from '../core/routing-types.js';
import { LEARNING_BONUS_CAP } from '../core/routing-types.js';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RoutingOutcome {
  taskId: string;
  sprintId: string;
  taskDNA: TaskDNA;
  agentId: string | null;
  skillIds: string[];
  evaluation: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  coverage: number;
  routingVersion: 'v1' | 'v2';
}

export interface EntityPerformance {
  totalTasks: number;
  successCount: number; // DONE + GO_WITH_TECH_DEBT
  failCount: number;    // NO_GO
  successRate: number;  // 0.0-1.0
  byIntent: Record<string, { tasks: number; successRate: number }>;
}

export interface SynergyEntry {
  pair: string;         // "agentId+skillId" or "skillA+skillB"
  tasks: number;
  successRate: number;
  verdict: 'synergy' | 'neutral' | 'redundant' | 'conflict';
}

export interface LearningsData {
  version: number;
  updatedAt: string;
  totalOutcomes: number;
  agentPerformance: Record<string, EntityPerformance>;
  skillPerformance: Record<string, EntityPerformance>;
  synergyMatrix: SynergyEntry[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ROUTING_DIR = '.deckent/routing';
const OUTCOMES_DIR = '.deckent/routing/outcomes';
const LEARNINGS_FILE = '.deckent/routing/learnings.json';
const MIN_SAMPLES_FOR_BONUS = 3;

// ─── OutcomeTracker ─────────────────────────────────────────────────────────

export class OutcomeTracker {
  private readonly projectRoot: string;
  private learnings: LearningsData;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.learnings = this.loadLearnings();
  }

  /**
   * Record a routing outcome after task evaluation.
   */
  recordOutcome(outcome: RoutingOutcome): void {
    const isSuccess = outcome.evaluation !== 'NO_GO';

    // Update agent performance
    if (outcome.agentId && outcome.agentId !== 'generic') {
      this.updateEntityPerformance(
        this.learnings.agentPerformance,
        outcome.agentId,
        outcome.taskDNA.intent.primary,
        isSuccess,
      );
    }

    // Update skill performance
    for (const skillId of outcome.skillIds) {
      this.updateEntityPerformance(
        this.learnings.skillPerformance,
        skillId,
        outcome.taskDNA.intent.primary,
        isSuccess,
      );
    }

    // Update synergy matrix (agent+skill pairs)
    if (outcome.agentId && outcome.agentId !== 'generic') {
      for (const skillId of outcome.skillIds) {
        this.updateSynergy(`${outcome.agentId}+${skillId}`, isSuccess);
      }
    }

    // Update synergy for skill+skill pairs
    for (let i = 0; i < outcome.skillIds.length; i++) {
      for (let j = i + 1; j < outcome.skillIds.length; j++) {
        const pair = [outcome.skillIds[i], outcome.skillIds[j]].sort().join('+');
        this.updateSynergy(pair, isSuccess);
      }
    }

    this.learnings.totalOutcomes++;
    this.learnings.updatedAt = new Date().toISOString();

    // Save sprint outcome
    this.saveSprintOutcome(outcome);
    // Save accumulated learnings
    this.saveLearnings();
  }

  /**
   * Calculate learning bonuses for routing decisions.
   * Returns bonuses for agents and skills based on historical performance.
   */
  calculateBonuses(taskDNA: TaskDNA): LearningBonus[] {
    const bonuses: LearningBonus[] = [];
    const intent = taskDNA.intent.primary;

    // Agent bonuses
    for (const [agentId, perf] of Object.entries(this.learnings.agentPerformance)) {
      const bonus = this.computeBonus(perf, intent);
      if (bonus !== 0) {
        bonuses.push({ entityId: agentId, bonus, source: 'learnings' });
      }
    }

    // Skill bonuses
    for (const [skillId, perf] of Object.entries(this.learnings.skillPerformance)) {
      const bonus = this.computeBonus(perf, intent);
      if (bonus !== 0) {
        bonuses.push({ entityId: skillId, bonus, source: 'learnings' });
      }
    }

    return bonuses;
  }

  /**
   * Get synergy matrix — which agent+skill combos work best.
   */
  getSynergyMatrix(): SynergyEntry[] {
    return [...this.learnings.synergyMatrix];
  }

  /**
   * Get learnings data (for reporting/debugging).
   */
  getLearnings(): Readonly<LearningsData> {
    return this.learnings;
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private computeBonus(perf: EntityPerformance, intent: IntentType): number {
    // Need minimum samples for any bonus
    if (perf.totalTasks < MIN_SAMPLES_FOR_BONUS) return 0;

    // Check intent-specific data first
    const intentData = perf.byIntent[intent];
    if (intentData && intentData.tasks >= MIN_SAMPLES_FOR_BONUS) {
      const delta = intentData.successRate - perf.successRate;
      // Intent-specific performance significantly different from overall
      if (delta > 0.15) return Math.min(Math.round(delta * 10), LEARNING_BONUS_CAP);
      if (delta < -0.15) return Math.max(Math.round(delta * 10), -LEARNING_BONUS_CAP);
    }

    // Overall performance bonus/penalty
    if (perf.successRate >= 0.9 && perf.totalTasks >= 5) return 1;
    if (perf.successRate < 0.5 && perf.totalTasks >= 5) return -2;

    return 0;
  }

  private updateEntityPerformance(
    store: Record<string, EntityPerformance>,
    entityId: string,
    intent: IntentType,
    isSuccess: boolean,
  ): void {
    if (!store[entityId]) {
      store[entityId] = {
        totalTasks: 0,
        successCount: 0,
        failCount: 0,
        successRate: 0,
        byIntent: {},
      };
    }

    const perf = store[entityId]!;
    perf.totalTasks++;
    if (isSuccess) perf.successCount++;
    else perf.failCount++;
    perf.successRate = perf.successCount / perf.totalTasks;

    // Update intent-specific
    if (!perf.byIntent[intent]) {
      perf.byIntent[intent] = { tasks: 0, successRate: 0 };
    }
    const intentPerf = perf.byIntent[intent]!;
    intentPerf.tasks++;
    const intentSuccesses = Math.round(intentPerf.successRate * (intentPerf.tasks - 1)) + (isSuccess ? 1 : 0);
    intentPerf.successRate = intentSuccesses / intentPerf.tasks;
  }

  private updateSynergy(pair: string, isSuccess: boolean): void {
    let entry = this.learnings.synergyMatrix.find(e => e.pair === pair);
    if (!entry) {
      entry = { pair, tasks: 0, successRate: 0, verdict: 'neutral' };
      this.learnings.synergyMatrix.push(entry);
    }

    entry.tasks++;
    const successes = Math.round(entry.successRate * (entry.tasks - 1)) + (isSuccess ? 1 : 0);
    entry.successRate = successes / entry.tasks;

    // Update verdict
    if (entry.tasks >= 3) {
      if (entry.successRate >= 0.85) entry.verdict = 'synergy';
      else if (entry.successRate < 0.5) entry.verdict = 'conflict';
      else entry.verdict = 'neutral';
    }
  }

  private loadLearnings(): LearningsData {
    const filePath = join(this.projectRoot, LEARNINGS_FILE);
    try {
      if (existsSync(filePath)) {
        const raw = readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as LearningsData;
      }
    } catch (err) {
      debugLog('outcome-tracker:load', err);
    }

    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalOutcomes: 0,
      agentPerformance: {},
      skillPerformance: {},
      synergyMatrix: [],
    };
  }

  private saveLearnings(): void {
    const dir = join(this.projectRoot, ROUTING_DIR);
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(this.projectRoot, LEARNINGS_FILE), JSON.stringify(this.learnings, null, 2), 'utf-8');
    } catch (err) {
      debugLog('outcome-tracker:save', err);
    }
  }

  private saveSprintOutcome(outcome: RoutingOutcome): void {
    const dir = join(this.projectRoot, OUTCOMES_DIR);
    try {
      mkdirSync(dir, { recursive: true });
      const filePath = join(dir, `${outcome.sprintId}.json`);
      let outcomes: RoutingOutcome[] = [];
      if (existsSync(filePath)) {
        outcomes = JSON.parse(readFileSync(filePath, 'utf-8'));
      }
      outcomes.push(outcome);
      writeFileSync(filePath, JSON.stringify(outcomes, null, 2), 'utf-8');
    } catch (err) {
      debugLog('outcome-tracker:save-sprint', err);
    }
  }
}
