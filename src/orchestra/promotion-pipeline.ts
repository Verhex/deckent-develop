// ─── Promotion Pipeline ─────────────────────────────────────────────────────
// Promotes temp agents/skills to permanent based on performance.
// Demotes permanent ones that underperform.

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'fs';
import { join } from 'path';
import type { OutcomeTracker, EntityPerformance } from './outcome-tracker.js';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromotionCriteria {
  minTasks: number;        // default 8
  minSuccessRate: number;  // default 0.85
  minSprints: number;      // default 3 (approximated from task count)
}

export interface DemotionCriteria {
  maxFailRate: number;     // default 0.50
  minTasks: number;        // default 5
  unusedSprints: number;   // default 5 (if not used in N sprints → demote)
}

export interface PromotionResult {
  entityId: string;
  entityType: 'agent' | 'skill';
  action: 'promote' | 'demote' | 'wait';
  reason: string;
  performance?: EntityPerformance;
}

const DEFAULT_PROMOTION: PromotionCriteria = { minTasks: 8, minSuccessRate: 0.85, minSprints: 3 };
const DEFAULT_DEMOTION: DemotionCriteria = { maxFailRate: 0.50, minTasks: 5, unusedSprints: 5 };

// ─── PromotionPipeline ──────────────────────────────────────────────────────

export class PromotionPipeline {
  private readonly projectRoot: string;
  private readonly promotionCriteria: PromotionCriteria;
  private readonly demotionCriteria: DemotionCriteria;

  constructor(
    projectRoot: string,
    promotionCriteria?: Partial<PromotionCriteria>,
    demotionCriteria?: Partial<DemotionCriteria>,
  ) {
    this.projectRoot = projectRoot;
    this.promotionCriteria = { ...DEFAULT_PROMOTION, ...promotionCriteria };
    this.demotionCriteria = { ...DEFAULT_DEMOTION, ...demotionCriteria };
  }

  /**
   * Evaluate all learned entities for promotion (temp → permanent).
   */
  evaluatePromotions(tracker: OutcomeTracker): PromotionResult[] {
    const results: PromotionResult[] = [];
    const learnings = tracker.getLearnings();

    // Check agent promotion
    for (const [agentId, perf] of Object.entries(learnings.agentPerformance)) {
      results.push(this.evaluateEntityPromotion(agentId, 'agent', perf));
    }

    // Check skill promotion
    for (const [skillId, perf] of Object.entries(learnings.skillPerformance)) {
      results.push(this.evaluateEntityPromotion(skillId, 'skill', perf));
    }

    return results;
  }

  /**
   * Evaluate all permanent entities for demotion.
   */
  evaluateDemotions(tracker: OutcomeTracker): PromotionResult[] {
    const results: PromotionResult[] = [];
    const learnings = tracker.getLearnings();

    for (const [agentId, perf] of Object.entries(learnings.agentPerformance)) {
      const demotion = this.evaluateEntityDemotion(agentId, 'agent', perf);
      if (demotion) results.push(demotion);
    }

    for (const [skillId, perf] of Object.entries(learnings.skillPerformance)) {
      const demotion = this.evaluateEntityDemotion(skillId, 'skill', perf);
      if (demotion) results.push(demotion);
    }

    return results;
  }

  /**
   * Execute a promotion — move from temp to permanent location.
   */
  promote(entityId: string, entityType: 'agent' | 'skill'): boolean {
    try {
      const tempDir = entityType === 'agent'
        ? join(this.projectRoot, '.tasks', 'agents')
        : join(this.projectRoot, '.tasks', 'skills');

      const permDir = entityType === 'agent'
        ? join(this.projectRoot, '.deckent', 'agents', entityId)
        : join(this.projectRoot, '.deckent', 'skills', entityId);

      // Find the temp entity directory
      const tempEntityDir = findTempEntityDir(tempDir, entityId);
      if (!tempEntityDir) {
        debugLog('promotion-pipeline:promote', `Temp ${entityType} '${entityId}' not found`);
        return false;
      }

      // Copy to permanent location
      mkdirSync(permDir, { recursive: true });
      cpSync(tempEntityDir, permDir, { recursive: true });

      debugLog('promotion-pipeline:promote', `${entityType} '${entityId}' promoted to ${permDir}`);
      return true;
    } catch (err) {
      debugLog('promotion-pipeline:promote', err);
      return false;
    }
  }

  /**
   * Execute a demotion — disable the entity.
   */
  demote(entityId: string, entityType: 'agent' | 'skill'): boolean {
    try {
      const manifestFile = entityType === 'agent'
        ? join(this.projectRoot, '.deckent', 'agents', entityId, 'agent.json')
        : join(this.projectRoot, '.deckent', 'skills', entityId, 'manifest.json');

      if (!existsSync(manifestFile)) {
        debugLog('promotion-pipeline:demote', `${entityType} '${entityId}' manifest not found`);
        return false;
      }

      const raw = JSON.parse(readFileSync(manifestFile, 'utf-8'));
      raw.enabled = false;
      raw._demotedAt = new Date().toISOString();
      writeFileSync(manifestFile, JSON.stringify(raw, null, 2), 'utf-8');

      debugLog('promotion-pipeline:demote', `${entityType} '${entityId}' demoted (disabled)`);
      return true;
    } catch (err) {
      debugLog('promotion-pipeline:demote', err);
      return false;
    }
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private evaluateEntityPromotion(
    entityId: string,
    entityType: 'agent' | 'skill',
    perf: EntityPerformance,
  ): PromotionResult {
    const c = this.promotionCriteria;

    if (perf.totalTasks < c.minTasks) {
      return {
        entityId, entityType, action: 'wait',
        reason: `Needs ${c.minTasks - perf.totalTasks} more tasks (${perf.totalTasks}/${c.minTasks})`,
        performance: perf,
      };
    }

    if (perf.successRate < c.minSuccessRate) {
      return {
        entityId, entityType, action: 'wait',
        reason: `Success rate ${Math.round(perf.successRate * 100)}% < ${Math.round(c.minSuccessRate * 100)}% required`,
        performance: perf,
      };
    }

    return {
      entityId, entityType, action: 'promote',
      reason: `${perf.totalTasks} tasks, ${Math.round(perf.successRate * 100)}% success — meets promotion criteria`,
      performance: perf,
    };
  }

  private evaluateEntityDemotion(
    entityId: string,
    entityType: 'agent' | 'skill',
    perf: EntityPerformance,
  ): PromotionResult | null {
    const c = this.demotionCriteria;

    if (perf.totalTasks < c.minTasks) return null;

    const failRate = 1 - perf.successRate;
    if (failRate >= c.maxFailRate) {
      return {
        entityId, entityType, action: 'demote',
        reason: `Fail rate ${Math.round(failRate * 100)}% >= ${Math.round(c.maxFailRate * 100)}% threshold (${perf.totalTasks} tasks)`,
        performance: perf,
      };
    }

    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function findTempEntityDir(tempBaseDir: string, entityId: string): string | null {
  if (!existsSync(tempBaseDir)) return null;
  try {
    const { readdirSync } = require('fs');
    const entries = readdirSync(tempBaseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.includes(entityId)) {
        return join(tempBaseDir, entry.name);
      }
    }
  } catch {
    // ignore
  }
  return null;
}
