// ─── Promotion Pipeline ─────────────────────────────────────────────────────
// Promotes temp agents/skills to permanent based on performance.
// Demotes permanent ones that underperform.

import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'fs';
import { join } from 'path';
import type { OutcomeTracker, EntityPerformance } from './outcome-tracker.js';
import { ensureAgentPromptMd } from './temp-agent-generator.js';
import type { AgentDefinition } from '../core/agent-types.js';
import { debugLog } from '../core/utils.js';
import { AgentGenealogy } from '../agents/agent-genealogy.js';
import { AgentRetirement } from '../agents/agent-retirement.js';
import type { RetirementStats } from '../agents/agent-retirement.js';

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

// Underperformer demotion: successRate < threshold AND enough task history (OR with maxFailRate)
const UNDERPERFORM_MAX_SUCCESS_RATE = 0.65;
const UNDERPERFORM_MIN_TASKS = 20;

// ─── PromotionPipeline ──────────────────────────────────────────────────────

export class PromotionPipeline {
  private readonly projectRoot: string;
  private readonly promotionCriteria: PromotionCriteria;
  private readonly demotionCriteria: DemotionCriteria;
  private readonly genealogy: AgentGenealogy;
  private readonly retirement: AgentRetirement;

  constructor(
    projectRoot: string,
    promotionCriteria?: Partial<PromotionCriteria>,
    demotionCriteria?: Partial<DemotionCriteria>,
  ) {
    this.projectRoot = projectRoot;
    this.promotionCriteria = { ...DEFAULT_PROMOTION, ...promotionCriteria };
    this.demotionCriteria = { ...DEFAULT_DEMOTION, ...demotionCriteria };
    this.genealogy = new AgentGenealogy(projectRoot);
    this.retirement = new AgentRetirement(projectRoot);
  }

  /**
   * Evaluate all learned entities for promotion (temp → permanent).
   */
  evaluatePromotions(tracker: OutcomeTracker): PromotionResult[] {
    const results: PromotionResult[] = [];
    const learnings = tracker.getLearnings();

    // Check agent promotion (skip built-in agents)
    for (const [agentId, perf] of Object.entries(learnings.agentPerformance)) {
      if (!this.isBuiltIn(agentId, 'agent')) {
        results.push(this.evaluateEntityPromotion(agentId, 'agent', perf));
      }
    }

    // Check skill promotion (skip built-in skills)
    for (const [skillId, perf] of Object.entries(learnings.skillPerformance)) {
      if (!this.isBuiltIn(skillId, 'skill')) {
        results.push(this.evaluateEntityPromotion(skillId, 'skill', perf));
      }
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
      if (this.isBuiltIn(agentId, 'agent')) continue;
      const demotion = this.evaluateEntityDemotion(agentId, 'agent', perf);
      if (demotion) results.push(demotion);
    }

    for (const [skillId, perf] of Object.entries(learnings.skillPerformance)) {
      if (this.isBuiltIn(skillId, 'skill')) continue;
      const demotion = this.evaluateEntityDemotion(skillId, 'skill', perf);
      if (demotion) results.push(demotion);
    }

    return results;
  }

  /**
   * Execute a promotion — move from temp to permanent location.
   *
   * For agents this searches in two locations (in priority order):
   *  1. `.tasks/agents/` — sprint-scoped temp agents
   *  2. `.deckent/agents/temp-{id}/` — persistent temp agents from pool
   *
   * On promotion the directory is renamed (persistent) or copied (sprint-scoped)
   * to `.deckent/agents/{id}/` and the `source` field is updated to 'user'.
   */
  promote(entityId: string, entityType: 'agent' | 'skill'): boolean {
    try {
      // Guard: skip built-in/permanent entities — they don't need promotion
      if (this.isBuiltIn(entityId, entityType)) {
        return false;
      }

      // For agents, also check persistent temp pool (.deckent/agents/temp-{id}/)
      if (entityType === 'agent') {
        const persistentTempDir = join(this.projectRoot, '.deckent', 'agents', `temp-${entityId}`);
        const permDir = join(this.projectRoot, '.deckent', 'agents', entityId);

        if (existsSync(persistentTempDir)) {
          // Read, update source, write to new location
          const manifestFile = join(persistentTempDir, 'agent.json');
          if (existsSync(manifestFile)) {
            mkdirSync(permDir, { recursive: true });
            cpSync(persistentTempDir, permDir, { recursive: true });
            // Update source field in the promoted copy
            try {
              const raw = JSON.parse(readFileSync(join(permDir, 'agent.json'), 'utf-8'));
              raw.source = 'user';
              raw.id = entityId;
              raw._promotedAt = new Date().toISOString();
              writeFileSync(join(permDir, 'agent.json'), JSON.stringify(raw, null, 2), 'utf-8');
              // Promotion gate: guarantee PROMPT.md exists on the promoted
              // agent. If the temp directory was missing one (Sprint 190
              // regression), render it from the template before the agent
              // goes live.
              ensurePromotedAgentPrompt(this.projectRoot, raw, entityId);
            } catch { /* non-fatal — manifest update failed */ }
            try { this.genealogy.registerAgent(entityId, null, 'promoted to permanent'); } catch { /* non-fatal */ }
            debugLog('promotion-pipeline:promote', `agent '${entityId}' promoted from persistent temp pool`);
            return true;
          }
        }
      }

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

      // Promotion gate for agents only — ensure PROMPT.md is present after
      // the copy so the promoted agent never hits the degraded fallback.
      if (entityType === 'agent') {
        try {
          const raw = JSON.parse(readFileSync(join(permDir, 'agent.json'), 'utf-8'));
          ensurePromotedAgentPrompt(this.projectRoot, raw, entityId);
        } catch { /* non-fatal — agent.json missing or unreadable */ }
        try { this.genealogy.registerAgent(entityId, null, 'promoted to permanent'); } catch { /* non-fatal */ }
      }

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
      // Guard: never demote built-in/permanent entities
      if (this.isBuiltIn(entityId, entityType)) {
        return false;
      }

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

      if (entityType === 'agent') {
        try { this.genealogy.removeAgent(entityId); } catch { /* non-fatal */ }
        // Evaluate for full retirement beyond simple disable
        const agentStats = typeof raw.stats === 'object' && raw.stats !== null
          ? (raw.stats as Record<string, unknown>)
          : {};
        const retirementStats: RetirementStats = {
          successRate: typeof agentStats.successRate === 'number' ? agentStats.successRate : 0,
          totalUses: typeof agentStats.totalUses === 'number' ? agentStats.totalUses : 0,
          sprintsParticipated: typeof agentStats.sprintsParticipated === 'number' ? agentStats.sprintsParticipated : 0,
        };
        const agentSource = (raw.source === 'builtin' || raw.source === 'user' || raw.source === 'learned')
          ? (raw.source as 'builtin' | 'user' | 'learned')
          : 'user';
        const retirementEval = this.retirement.evaluateForRetirement(entityId, retirementStats, agentSource);
        if (retirementEval.shouldRetire) {
          const retireReason = `Demotion-retirement: ${retirementEval.reasons.join('; ')}`;
          try { this.retirement.retire(entityId, retireReason); } catch { /* non-fatal */ }
        }
      }

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

  /**
   * Check if an entity is built-in (permanent) by reading its manifest source field.
   * Built-in entities must never be promoted or demoted.
   */
  private isBuiltIn(entityId: string, entityType: 'agent' | 'skill'): boolean {
    try {
      const manifestFile = entityType === 'agent'
        ? join(this.projectRoot, '.deckent', 'agents', entityId, 'agent.json')
        : join(this.projectRoot, '.deckent', 'skills', entityId, 'manifest.json');
      if (!existsSync(manifestFile)) return false;
      const raw = JSON.parse(readFileSync(manifestFile, 'utf-8'));
      return raw.source === 'builtin';
    } catch {
      return false;
    }
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

    // Underperformer check: successRate < 65% over >= 20 tasks triggers demotion even when below maxFailRate
    if (perf.successRate < UNDERPERFORM_MAX_SUCCESS_RATE && perf.totalTasks >= UNDERPERFORM_MIN_TASKS) {
      return {
        entityId, entityType, action: 'demote',
        reason: `Underperformer: success rate ${Math.round(perf.successRate * 100)}% < ${Math.round(UNDERPERFORM_MAX_SUCCESS_RATE * 100)}% over ${perf.totalTasks} tasks`,
        performance: perf,
      };
    }

    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Idempotent: ensure the promoted agent has a PROMPT.md file. Used as the
 * promotion gate so an agent never goes live without one — closes the
 * Sprint 190 "PROMPT.md missing — degraded fallback" warning chain.
 *
 * `raw` is the parsed agent.json contents. Only the fields needed by
 * renderAgentPromptMd are read (name, description, expertise).
 */
function ensurePromotedAgentPrompt(
  projectRoot: string,
  raw: Record<string, unknown>,
  entityId: string,
): void {
  const agent: Pick<AgentDefinition, 'id' | 'name' | 'description' | 'expertise'> = {
    id: entityId,
    name: typeof raw['name'] === 'string' ? (raw['name'] as string) : entityId,
    description: typeof raw['description'] === 'string' ? (raw['description'] as string) : '',
    expertise: Array.isArray(raw['expertise'])
      ? (raw['expertise'] as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  };
  try {
    ensureAgentPromptMd(projectRoot, agent);
  } catch (err) {
    // Non-fatal: PROMPT.md generation must never block promotion.
    debugLog('promotion-pipeline:ensurePromotedAgentPrompt', err);
  }
}

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
  } catch (e) {
    debugLog('findTempDir:readdirSync', e);
  }
  return null;
}
