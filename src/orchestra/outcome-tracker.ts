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
  qualityScore?: number; // 0-100 from QualityAssessor
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

/** Per-sprint, per-skill outcome summary */
export interface SkillSprintRecord {
  successCount: number;
  failCount: number;
  avgCoverage: number;
}

export interface LearningsData {
  version: number;
  updatedAt: string;
  totalOutcomes: number;
  agentPerformance: Record<string, EntityPerformance>;
  skillPerformance: Record<string, EntityPerformance>;
  synergyMatrix: SynergyEntry[];
  evolvedRules?: unknown[];
  /** Ordered list of sprint IDs seen (most recent last) */
  recentSprints: string[];
  /** skill ID → sprint ID → per-sprint record */
  skillSprintHistory: Record<string, Record<string, SkillSprintRecord>>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ROUTING_DIR = '.deckent/routing';
const OUTCOMES_DIR = '.deckent/routing/outcomes';
const LEARNINGS_FILE = '.deckent/routing/learnings.json';
const MIN_SAMPLES_FOR_BONUS = 3;
const RECENT_SPRINT_WINDOW = 3;
const SPRINT_RECENCY_SUCCESS_BONUS = 3;
const SPRINT_RECENCY_FAILURE_PENALTY = -2;

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

    // Update skill performance and per-sprint history
    for (const skillId of outcome.skillIds) {
      this.updateEntityPerformance(
        this.learnings.skillPerformance,
        skillId,
        outcome.taskDNA.intent.primary,
        isSuccess,
      );
      this.updateSkillSprintHistory(skillId, outcome.sprintId, isSuccess, outcome.coverage);
    }

    // Track sprint order (unique, ordered)
    if (!this.learnings.recentSprints.includes(outcome.sprintId)) {
      this.learnings.recentSprints.push(outcome.sprintId);
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
   * Returns bonuses for agents and skills based on historical performance
   * and sprint recency (last 3 sprints: success → +3, failure → -2).
   */
  calculateBonuses(taskDNA: TaskDNA): LearningBonus[] {
    const intent = taskDNA.intent.primary;
    const bonusMap = new Map<string, number>();

    // Agent bonuses (overall performance)
    for (const [agentId, perf] of Object.entries(this.learnings.agentPerformance)) {
      const bonus = this.computeBonus(perf, intent);
      if (bonus !== 0) bonusMap.set(agentId, (bonusMap.get(agentId) ?? 0) + bonus);
    }

    // Skill bonuses (overall performance)
    for (const [skillId, perf] of Object.entries(this.learnings.skillPerformance)) {
      const bonus = this.computeBonus(perf, intent);
      if (bonus !== 0) bonusMap.set(skillId, (bonusMap.get(skillId) ?? 0) + bonus);
    }

    // Skill sprint recency bonuses (more aggressive: +3/-2 based on last 3 sprints)
    const recencyBonuses = this.calculateSprintRecencyBonuses();
    for (const [skillId, recencyBonus] of recencyBonuses) {
      const combined = (bonusMap.get(skillId) ?? 0) + recencyBonus;
      bonusMap.set(skillId, Math.max(-LEARNING_BONUS_CAP, Math.min(LEARNING_BONUS_CAP, combined)));
    }

    // Emit final bonus list
    const bonuses: LearningBonus[] = [];
    for (const [entityId, bonus] of bonusMap) {
      if (bonus !== 0) bonuses.push({ entityId, bonus, source: 'learnings' });
    }

    return bonuses;
  }

  /**
   * Calculate sprint recency bonuses for skills.
   * Looks at the last RECENT_SPRINT_WINDOW sprints and applies:
   * - All successful → +SPRINT_RECENCY_SUCCESS_BONUS (+3)
   * - All failed     → SPRINT_RECENCY_FAILURE_PENALTY (-2)
   * - Mostly success (≥75%) → +1
   * - Mostly failed (<35%)  → -1
   * - Mixed (35-75%)        → 0 (neutral)
   */
  calculateSprintRecencyBonuses(): Map<string, number> {
    const result = new Map<string, number>();
    const lastSprints = this.learnings.recentSprints.slice(-RECENT_SPRINT_WINDOW);
    // Need at least 2 sprints and 3+ total outcomes to compute meaningful recency
    if (lastSprints.length < 2) return result;

    for (const [skillId, sprintHistory] of Object.entries(this.learnings.skillSprintHistory)) {
      let successCount = 0;
      let failCount = 0;

      for (const sprintId of lastSprints) {
        const record = sprintHistory[sprintId];
        if (!record) continue;
        successCount += record.successCount;
        failCount += record.failCount;
      }

      const total = successCount + failCount;
      if (total < MIN_SAMPLES_FOR_BONUS) continue;

      const recentSuccessRate = successCount / total;

      if (recentSuccessRate === 1) {
        result.set(skillId, SPRINT_RECENCY_SUCCESS_BONUS);
      } else if (recentSuccessRate === 0) {
        result.set(skillId, SPRINT_RECENCY_FAILURE_PENALTY);
      } else if (recentSuccessRate >= 0.75) {
        result.set(skillId, 1);
      } else if (recentSuccessRate < 0.35) {
        result.set(skillId, -1);
      }
      // Mixed (0.35–0.75) → no bonus
    }

    return result;
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

  /**
   * Return the worst-performing agent+skill combinations from the last 5 sprints.
   * Reads sprint outcome files from .deckent/routing/outcomes/ and aggregates
   * success/fail rates per (agentId, skillId) pair.
   *
   * Format: "- agent:bug-fixer + skill:testing-expert → %30 başarı (10 task)"
   *
   * Called by callBrainPlanner() via worstCombinations param to inject GECMIS SONUCLAR
   * block into the AI planner prompt so the planner avoids historically poor combos.
   *
   * @param limit - Max number of lines to return (default 5)
   */
  getWorstCombinations(limit: number = 5): string {
    const last5Sprints = this.learnings.recentSprints.slice(-5);
    if (last5Sprints.length === 0) return '';

    const combMap = new Map<string, { agentId: string; skillId: string; success: number; fail: number }>();

    for (const sprintId of last5Sprints) {
      const filePath = join(this.projectRoot, OUTCOMES_DIR, `${sprintId}.json`);
      let outcomes: RoutingOutcome[] = [];
      try {
        if (existsSync(filePath)) {
          outcomes = JSON.parse(readFileSync(filePath, 'utf-8')) as RoutingOutcome[];
        }
      } catch (err) {
        debugLog('outcome-tracker:getWorstCombinations', err);
        continue;
      }

      for (const outcome of outcomes) {
        if (!outcome.agentId || outcome.agentId === 'generic') continue;
        const isSuccess = outcome.evaluation !== 'NO_GO';

        for (const skillId of outcome.skillIds) {
          const key = `${outcome.agentId}+${skillId}`;
          const existing = combMap.get(key) ?? { agentId: outcome.agentId, skillId, success: 0, fail: 0 };
          if (isSuccess) existing.success++;
          else existing.fail++;
          combMap.set(key, existing);
        }
      }
    }

    if (combMap.size === 0) return '';

    const MIN_COMB_SAMPLES = 3;
    const sorted = [...combMap.values()]
      .filter(c => c.success + c.fail >= MIN_COMB_SAMPLES)
      .sort((a, b) => {
        const rateA = a.success / (a.success + a.fail);
        const rateB = b.success / (b.success + b.fail);
        return rateA - rateB;
      });

    if (sorted.length === 0) return '';

    return sorted
      .slice(0, limit)
      .map(c => {
        const total = c.success + c.fail;
        const rate = Math.round((c.success / total) * 100);
        return `- agent:${c.agentId} + skill:${c.skillId} → %${rate} başarı (${total} task)`;
      })
      .join('\n');
  }

  /**
   * Save evolved rules to learnings data.
   */
  saveEvolvedRules(rules: unknown[]): void {
    this.learnings.evolvedRules = rules;
    this.learnings.updatedAt = new Date().toISOString();
    this.saveLearnings();
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

  private updateSkillSprintHistory(
    skillId: string,
    sprintId: string,
    isSuccess: boolean,
    coverage: number,
  ): void {
    if (!this.learnings.skillSprintHistory[skillId]) {
      this.learnings.skillSprintHistory[skillId] = {};
    }
    const history = this.learnings.skillSprintHistory[skillId]!;
    if (!history[sprintId]) {
      history[sprintId] = { successCount: 0, failCount: 0, avgCoverage: 0 };
    }
    const record = history[sprintId]!;
    const prevTotal = record.successCount + record.failCount;
    if (isSuccess) record.successCount++;
    else record.failCount++;
    // Incremental average coverage
    const newTotal = record.successCount + record.failCount;
    record.avgCoverage = (record.avgCoverage * prevTotal + coverage) / newTotal;
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
        const parsed = JSON.parse(raw) as Partial<LearningsData>;
        // Backfill fields added in later versions (backward compatibility)
        return {
          recentSprints: [],
          skillSprintHistory: {},
          ...parsed,
          agentPerformance: parsed.agentPerformance ?? {},
          skillPerformance: parsed.skillPerformance ?? {},
          synergyMatrix: parsed.synergyMatrix ?? [],
        } as LearningsData;
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
      recentSprints: [],
      skillSprintHistory: {},
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
