// ─── Outcome Tracker ────────────────────────────────────────────────────────
// Tracks routing outcomes (agent/skill → GO/NO_GO) and generates learning bonuses.
// Data stored in .deckent/routing/ for cross-sprint learning.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { TaskDNA, LearningBonus, IntentType } from '../core/routing-types.js';
import { LEARNING_BONUS_CAP } from '../core/routing-types.js';
import { debugLog } from '../core/utils.js';
import type { LearningConfig } from '../core/decision-config.js';
import { ErrorRegistry } from '../core/errors.js';
import { adaptAgentRuntime, type ResultEntry, type SkillAdaptation } from '../agents/adaptive-agent.js';

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
  routingVersion: 'v2';
  /**
   * Advisory skill add/remove suggestion produced by adaptAgentRuntime
   * over recent ResultEntry history. Never auto-applied — Brain reviews.
   * See ADR-035/037 (advisory metadata) and src/agents/adaptive-agent.ts.
   */
  skillAdaptation?: SkillAdaptation;
}

export interface EntityPerformance {
  totalTasks: number;
  successCount: number; // DONE + GO_WITH_TECH_DEBT
  failCount: number;    // NO_GO
  successRate: number;  // 0.0-1.0
  avgQualityScore: number; // 0-100, incremental average from QualityAssessor
  qualityTaskCount: number; // number of tasks that had a qualityScore (used for correct averaging)
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

// ─── Reclassify Types ───────────────────────────────────────────────────────

/** Minimal audit entry shape (subset of MemoryStore CreateEntryInput). */
export interface ReclassifyAuditEntry {
  id: string;
  type: string;
  title: string;
  content: string;
  sprint_id?: string;
  sprint_num?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/** Structural store contract — MemoryStore satisfies this via its `upsert` method. */
export interface ReclassifyAuditStore {
  upsert(input: ReclassifyAuditEntry, changedBy: string): void;
}

export interface ReclassifyOptions {
  reason?: string;
  memoryStore?: ReclassifyAuditStore;
  /** Identifies the actor for audit-trail history (default: 'cli:agent-reclassify'). */
  changedBy?: string;
}

export interface ReclassifyResult {
  changed: boolean;
  previous: RoutingOutcome['evaluation'];
  current: RoutingOutcome['evaluation'];
  agentId: string | null;
  skillIds: string[];
  auditTrailWritten: boolean;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ROUTING_DIR = '.deckent/routing';
const OUTCOMES_DIR = '.deckent/routing/outcomes';
const LEARNINGS_FILE = '.deckent/routing/learnings.json';

// ─── OutcomeTracker ─────────────────────────────────────────────────────────

export class OutcomeTracker {
  private readonly projectRoot: string;
  private learnings: LearningsData;
  private readonly MIN_SAMPLES_FOR_BONUS: number;
  private readonly RECENT_SPRINT_WINDOW: number;
  private readonly SPRINT_RECENCY_SUCCESS_BONUS: number;
  private readonly SPRINT_RECENCY_FAILURE_PENALTY: number;

  constructor(projectRoot: string, config?: Partial<LearningConfig>) {
    this.projectRoot = projectRoot;
    this.MIN_SAMPLES_FOR_BONUS = config?.minSamplesForBonus ?? 3;
    this.RECENT_SPRINT_WINDOW = config?.recentSprintWindow ?? 3;
    this.SPRINT_RECENCY_SUCCESS_BONUS = config?.sprintRecencySuccessBonus ?? 3;
    this.SPRINT_RECENCY_FAILURE_PENALTY = config?.sprintRecencyFailurePenalty ?? -2;
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
        outcome.qualityScore,
      );
    }

    // Update skill performance and per-sprint history
    for (const skillId of outcome.skillIds) {
      this.updateEntityPerformance(
        this.learnings.skillPerformance,
        skillId,
        outcome.taskDNA.intent.primary,
        isSuccess,
        outcome.qualityScore,
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

    // Advisory: ask adaptive-agent for skill add/remove suggestion based on
    // recent ResultEntry history for this agent. Attached as outcome metadata.
    const adaptation = this.generateSkillAdaptation(outcome);
    if (adaptation) {
      outcome.skillAdaptation = adaptation;
    }

    // Save sprint outcome
    this.saveSprintOutcome(outcome);
    // Save accumulated learnings
    this.saveLearnings();
  }

  /**
   * Build recent ResultEntry[] for this agent from prior sprint outcome files
   * and the current in-flight outcome, then call adaptAgentRuntime to produce
   * a skill add/remove suggestion. Returns undefined for generic/null agents.
   */
  private generateSkillAdaptation(outcome: RoutingOutcome): SkillAdaptation | undefined {
    if (!outcome.agentId || outcome.agentId === 'generic') return undefined;

    const priorSprints = this.learnings.recentSprints.filter(s => s !== outcome.sprintId);
    const windowSprints = priorSprints.slice(-this.RECENT_SPRINT_WINDOW);
    const recentResults: ResultEntry[] = [];

    for (const sprintId of windowSprints) {
      const filePath = join(this.projectRoot, OUTCOMES_DIR, `${sprintId}.json`);
      try {
        if (!existsSync(filePath)) continue;
        const prior = JSON.parse(readFileSync(filePath, 'utf-8')) as RoutingOutcome[];
        for (const o of prior) {
          if (o.agentId === outcome.agentId) {
            recentResults.push({ evaluation: o.evaluation, coverage: o.coverage, sprintId: o.sprintId });
          }
        }
      } catch (err) {
        debugLog('outcome-tracker:adapt-runtime-read', err);
      }
    }

    recentResults.push({
      evaluation: outcome.evaluation,
      coverage: outcome.coverage,
      sprintId: outcome.sprintId,
    });

    const { skillAdaptation } = adaptAgentRuntime(outcome.agentId, '', outcome.skillIds, recentResults);
    return skillAdaptation;
  }

  /**
   * Feed a cross-verify verdict as a ROUTE-1 learning signal on agent + skill performance.
   *
   * Advisory: does NOT change the official evaluation, does NOT bump totalOutcomes (the task
   * was already counted by recordOutcome), and does NOT write a sprint outcome file entry.
   * REFUTED  → negative signal (isSuccess=false) to agent + skill performance + synergy.
   * CONFIRMED → positive signal (isSuccess=true) to agent + skill performance + synergy.
   * unclear  → no-op (honest non-result — no signal injected).
   *
   * ADR-070: purely advisory — no evaluation mutation; Brain/human decides what to do
   * with repeated REFUTED signals (e.g. reroute the next sprint via reclassifyTaskOutcome).
   */
  recordCrossVerifyVerdict(
    agentId: string | null,
    skillIds: string[],
    verdict: 'refuted' | 'confirmed' | 'unclear',
    intent: IntentType = 'implementation',
  ): void {
    if (verdict === 'unclear') return;

    const isSuccess = verdict === 'confirmed';

    if (agentId && agentId !== 'generic') {
      this.updateEntityPerformance(this.learnings.agentPerformance, agentId, intent, isSuccess);
    }
    for (const skillId of skillIds) {
      this.updateEntityPerformance(this.learnings.skillPerformance, skillId, intent, isSuccess);
    }
    // Update synergy for agent+skill pairs (mirrors recordOutcome pattern).
    if (agentId && agentId !== 'generic') {
      for (const skillId of skillIds) {
        this.updateSynergy(`${agentId}+${skillId}`, isSuccess);
      }
    }

    this.learnings.updatedAt = new Date().toISOString();
    this.saveLearnings();
  }

  /**
   * Reclassify the evaluation of a previously recorded outcome.
   *
   * Idempotent: if the new decision matches the current one, returns `changed: false`
   * without touching files or stats. Otherwise, applies a delta to agentPerformance,
   * skillPerformance, skillSprintHistory, and synergyMatrix — totalTasks is NOT bumped
   * (the task was already counted in recordOutcome). The sprint outcome file is
   * mutated in place. If `memoryStore` is provided, an ADR-046 audit-trail retro entry
   * is upserted.
   */
  reclassifyTaskOutcome(
    sprintId: string,
    taskId: string,
    newDecision: RoutingOutcome['evaluation'],
    opts: ReclassifyOptions = {},
  ): ReclassifyResult {
    const outcomesPath = join(this.projectRoot, OUTCOMES_DIR, `${sprintId}.json`);
    if (!existsSync(outcomesPath)) {
      throw ErrorRegistry.createError('DECKENT_E068', {
        message: `No outcomes recorded for sprint ${sprintId}`,
      });
    }

    let outcomes: RoutingOutcome[];
    try {
      outcomes = JSON.parse(readFileSync(outcomesPath, 'utf-8')) as RoutingOutcome[];
    } catch (err) {
      throw ErrorRegistry.createError('DECKENT_E069', {
        message: `Failed to parse outcomes for sprint ${sprintId}: ${(err as Error).message}`,
      });
    }

    const target = outcomes.find(o => o.taskId === taskId);
    if (!target) {
      throw ErrorRegistry.createError('DECKENT_E070', {
        message: `Task ${taskId} not found in ${sprintId}`,
      });
    }

    const previous = target.evaluation;
    const agentId = target.agentId;
    const skillIds = [...target.skillIds];

    if (previous === newDecision) {
      return {
        changed: false,
        previous,
        current: newDecision,
        agentId,
        skillIds,
        auditTrailWritten: false,
      };
    }

    const wasSuccess = previous !== 'NO_GO';
    const isSuccess = newDecision !== 'NO_GO';
    const deltaSuccess = (isSuccess ? 1 : 0) - (wasSuccess ? 1 : 0); // -1, 0, +1

    // Mutate the outcome record in memory (and persist below).
    target.evaluation = newDecision;

    // Persist outcomes file.
    try {
      writeFileSync(outcomesPath, JSON.stringify(outcomes, null, 2), 'utf-8');
    } catch (err) {
      throw ErrorRegistry.createError('DECKENT_E071', {
        message: `Failed to write outcomes for sprint ${sprintId}: ${(err as Error).message}`,
      });
    }

    // Apply delta to agent / skill performance (only when isSuccess actually flipped).
    if (deltaSuccess !== 0) {
      if (agentId && agentId !== 'generic') {
        this.applyPerformanceDelta(
          this.learnings.agentPerformance,
          agentId,
          target.taskDNA.intent.primary,
          deltaSuccess,
        );
      }
      for (const skillId of skillIds) {
        this.applyPerformanceDelta(
          this.learnings.skillPerformance,
          skillId,
          target.taskDNA.intent.primary,
          deltaSuccess,
        );
        this.applySkillSprintHistoryDelta(skillId, sprintId, deltaSuccess);
      }
      // Synergy: agent+skill pairs
      if (agentId && agentId !== 'generic') {
        for (const skillId of skillIds) {
          this.applySynergyDelta(`${agentId}+${skillId}`, deltaSuccess);
        }
      }
      // Synergy: skill+skill pairs (sorted, matches recordOutcome)
      for (let i = 0; i < skillIds.length; i++) {
        for (let j = i + 1; j < skillIds.length; j++) {
          const pair = [skillIds[i], skillIds[j]].sort().join('+');
          this.applySynergyDelta(pair, deltaSuccess);
        }
      }
    }

    this.learnings.updatedAt = new Date().toISOString();
    this.saveLearnings();

    // Audit trail (ADR-046).
    let auditTrailWritten = false;
    if (opts.memoryStore) {
      const sprintNum = parseInt(sprintId.replace(/\D/g, ''), 10) || 0;
      const skillsDisplay = skillIds.length > 0 ? skillIds.join(', ') : '(none)';
      const agentDisplay = agentId ?? '(none)';
      const reasonLine = opts.reason ? `Reason: ${opts.reason}` : 'Reason: (not provided)';
      const content = [
        `Reclassify: ${previous} → ${newDecision}`,
        `Sprint: ${sprintId}`,
        `Task: ${taskId}`,
        `Agent: ${agentDisplay}`,
        `Skills: ${skillsDisplay}`,
        reasonLine,
      ].join('\n');
      opts.memoryStore.upsert(
        {
          id: `reclassify-${sprintId}-${taskId}`,
          type: 'retro',
          title: `Reclassify ${taskId} (${previous} → ${newDecision})`,
          content,
          sprint_id: sprintId,
          sprint_num: sprintNum,
          tags: ['reclassify', 'audit-trail', 'adr-046'],
          metadata: {
            taskId,
            previous,
            current: newDecision,
            agentId,
            skillIds,
            reason: opts.reason ?? null,
          },
        },
        opts.changedBy ?? 'cli:agent-reclassify',
      );
      auditTrailWritten = true;
    }

    return {
      changed: true,
      previous,
      current: newDecision,
      agentId,
      skillIds,
      auditTrailWritten,
    };
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
    const lastSprints = this.learnings.recentSprints.slice(-this.RECENT_SPRINT_WINDOW);
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
      if (total < this.MIN_SAMPLES_FOR_BONUS) continue;

      const recentSuccessRate = successCount / total;

      if (recentSuccessRate === 1) {
        result.set(skillId, this.SPRINT_RECENCY_SUCCESS_BONUS);
      } else if (recentSuccessRate === 0) {
        result.set(skillId, this.SPRINT_RECENCY_FAILURE_PENALTY);
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
    if (perf.totalTasks < this.MIN_SAMPLES_FOR_BONUS) return 0;

    // Check intent-specific data first
    const intentData = perf.byIntent[intent];
    if (intentData && intentData.tasks >= this.MIN_SAMPLES_FOR_BONUS) {
      const delta = intentData.successRate - perf.successRate;
      // Intent-specific performance significantly different from overall
      if (delta > 0.15) return Math.min(Math.round(delta * 10), LEARNING_BONUS_CAP);
      if (delta < -0.15) return Math.max(Math.round(delta * 10), -LEARNING_BONUS_CAP);
    }

    let bonus = 0;

    // Overall performance bonus/penalty
    if (perf.successRate >= 0.9 && perf.totalTasks >= 5) bonus += 1;
    else if (perf.successRate < 0.5 && perf.totalTasks >= 5) bonus += -2;

    // Quality score bonus/penalty (only when quality data exists, i.e. avgQualityScore > 0)
    if (perf.avgQualityScore > 0) {
      if (perf.avgQualityScore >= 80) bonus += 1;
      else if (perf.avgQualityScore < 40) bonus += -1;
    }

    return Math.max(-LEARNING_BONUS_CAP, Math.min(LEARNING_BONUS_CAP, bonus));
  }

  private updateEntityPerformance(
    store: Record<string, EntityPerformance>,
    entityId: string,
    intent: IntentType,
    isSuccess: boolean,
    qualityScore?: number,
  ): void {
    if (!store[entityId]) {
      store[entityId] = {
        totalTasks: 0,
        successCount: 0,
        failCount: 0,
        successRate: 0,
        avgQualityScore: 0,
        qualityTaskCount: 0,
        byIntent: {},
      };
    }

    const perf = store[entityId]!;
    perf.totalTasks++;
    if (isSuccess) perf.successCount++;
    else perf.failCount++;
    perf.successRate = perf.successCount / perf.totalTasks;

    // Incremental average quality score (only over tasks that have a qualityScore)
    if (qualityScore !== undefined) {
      const prevCount = perf.qualityTaskCount;
      perf.qualityTaskCount++;
      perf.avgQualityScore = (perf.avgQualityScore * prevCount + qualityScore) / perf.qualityTaskCount;
    }

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

  /**
   * Delta-apply a success/fail flip to an entity perf record.
   * totalTasks is NOT changed — only success/fail counts move by ±1.
   * @param deltaSuccess +1 for fail→success, -1 for success→fail.
   */
  private applyPerformanceDelta(
    store: Record<string, EntityPerformance>,
    entityId: string,
    intent: IntentType,
    deltaSuccess: number,
  ): void {
    const perf = store[entityId];
    if (!perf) return; // Nothing to delta — record was never created.

    perf.successCount += deltaSuccess;
    perf.failCount -= deltaSuccess;
    if (perf.successCount < 0) perf.successCount = 0;
    if (perf.failCount < 0) perf.failCount = 0;
    perf.successRate = perf.totalTasks > 0 ? perf.successCount / perf.totalTasks : 0;

    const intentPerf = perf.byIntent[intent];
    if (intentPerf && intentPerf.tasks > 0) {
      const prevSuccesses = Math.round(intentPerf.successRate * intentPerf.tasks);
      const newSuccesses = Math.max(0, Math.min(intentPerf.tasks, prevSuccesses + deltaSuccess));
      intentPerf.successRate = newSuccesses / intentPerf.tasks;
    }
  }

  private applySkillSprintHistoryDelta(skillId: string, sprintId: string, deltaSuccess: number): void {
    const history = this.learnings.skillSprintHistory[skillId];
    if (!history) return;
    const record = history[sprintId];
    if (!record) return;
    record.successCount += deltaSuccess;
    record.failCount -= deltaSuccess;
    if (record.successCount < 0) record.successCount = 0;
    if (record.failCount < 0) record.failCount = 0;
    // avgCoverage is unchanged — coverage of the task itself didn't change.
  }

  private applySynergyDelta(pair: string, deltaSuccess: number): void {
    const entry = this.learnings.synergyMatrix.find(e => e.pair === pair);
    if (!entry || entry.tasks === 0) return;
    const prevSuccesses = Math.round(entry.successRate * entry.tasks);
    const newSuccesses = Math.max(0, Math.min(entry.tasks, prevSuccesses + deltaSuccess));
    entry.successRate = newSuccesses / entry.tasks;
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
        const agentPerf = parsed.agentPerformance ?? {};
        const skillPerf = parsed.skillPerformance ?? {};
        // Backfill avgQualityScore and qualityTaskCount for entities loaded from older learnings data
        for (const perf of Object.values(agentPerf)) {
          if (perf.avgQualityScore === undefined) perf.avgQualityScore = 0;
          if (perf.qualityTaskCount === undefined) perf.qualityTaskCount = perf.avgQualityScore > 0 ? perf.totalTasks : 0;
        }
        for (const perf of Object.values(skillPerf)) {
          if (perf.avgQualityScore === undefined) perf.avgQualityScore = 0;
          if (perf.qualityTaskCount === undefined) perf.qualityTaskCount = perf.avgQualityScore > 0 ? perf.totalTasks : 0;
        }
        return {
          recentSprints: [],
          skillSprintHistory: {},
          ...parsed,
          agentPerformance: agentPerf,
          skillPerformance: skillPerf,
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
