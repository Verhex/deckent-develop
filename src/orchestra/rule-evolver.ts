// ─── Rule Evolver ───────────────────────────────────────────────────────────
// Generates new activation rules from historical outcome data.
// Rules with confidence >= 0.85 are auto-applied, >= 0.65 are suggested.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ActivationRule, ExclusionRule } from '../core/routing-types.js';
import type { OutcomeTracker, EntityPerformance } from './outcome-tracker.js';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EvolvedRule {
  type: 'activation' | 'exclusion';
  entityId: string;
  entityType: 'agent' | 'skill';
  rule: ActivationRule | ExclusionRule;
  evidence: string;
  confidence: number;    // 0.0-1.0
  status: 'auto-applied' | 'suggested' | 'pending';
  sampleSize: number;
}

export interface EvolutionResult {
  newRules: EvolvedRule[];
  reasoning: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_SAMPLES = 5;
const AUTO_APPLY_CONFIDENCE = 0.85;
const SUGGEST_CONFIDENCE = 0.65;
const HIGH_SUCCESS_THRESHOLD = 0.85;
const LOW_SUCCESS_THRESHOLD = 0.50;
const SIGNIFICANT_DELTA = 0.15;

// ─── RuleEvolver ────────────────────────────────────────────────────────────

const EVOLVED_RULES_FILE = '.deckent/routing/evolved-rules.json';

export class RuleEvolver {
  private readonly tracker: OutcomeTracker;
  private readonly projectRoot: string;

  constructor(tracker: OutcomeTracker, projectRoot?: string) {
    this.tracker = tracker;
    this.projectRoot = projectRoot ?? process.cwd();
  }

  /**
   * Analyze outcomes and generate new activation/exclusion rules.
   */
  evolveRules(): EvolutionResult {
    const learnings = this.tracker.getLearnings();
    const newRules: EvolvedRule[] = [];
    const reasoning: string[] = [];

    // Evolve agent rules
    for (const [agentId, perf] of Object.entries(learnings.agentPerformance)) {
      const agentRules = this.evolveEntityRules(agentId, 'agent', perf);
      newRules.push(...agentRules.rules);
      reasoning.push(...agentRules.reasoning);
    }

    // Evolve skill rules
    for (const [skillId, perf] of Object.entries(learnings.skillPerformance)) {
      const skillRules = this.evolveEntityRules(skillId, 'skill', perf);
      newRules.push(...skillRules.rules);
      reasoning.push(...skillRules.reasoning);
    }

    // Evolve synergy-based rules (creates EvolvedRule objects for skill-skill pairs)
    const synergyRules = this.evolveSynergyRules();
    newRules.push(...synergyRules.rules);
    reasoning.push(...synergyRules.reasoning);

    return { newRules, reasoning };
  }

  private evolveEntityRules(
    entityId: string,
    entityType: 'agent' | 'skill',
    perf: EntityPerformance,
  ): { rules: EvolvedRule[]; reasoning: string[] } {
    const rules: EvolvedRule[] = [];
    const reasoning: string[] = [];

    if (perf.totalTasks < MIN_SAMPLES) return { rules, reasoning };

    // Check each intent for significant deviations
    for (const [intent, intentData] of Object.entries(perf.byIntent)) {
      if (intentData.tasks < MIN_SAMPLES) continue;

      const delta = intentData.successRate - perf.successRate;

      // High success in this intent → new activation rule
      if (intentData.successRate >= HIGH_SUCCESS_THRESHOLD && delta > SIGNIFICANT_DELTA) {
        const confidence = Math.min(0.5 + intentData.tasks * 0.04, 0.95);
        const status = confidence >= AUTO_APPLY_CONFIDENCE ? 'auto-applied' :
                       confidence >= SUGGEST_CONFIDENCE ? 'suggested' : 'pending';

        rules.push({
          type: 'activation',
          entityId,
          entityType,
          rule: {
            name: `evolved-${entityId}-${intent}`,
            when: { 'intent.primary': intent },
            score: Math.round(intentData.successRate * 8),
          } as ActivationRule,
          evidence: `${intentData.tasks} tasks in '${intent}' intent, ${Math.round(intentData.successRate * 100)}% success (overall: ${Math.round(perf.successRate * 100)}%)`,
          confidence,
          status,
          sampleSize: intentData.tasks,
        });

        reasoning.push(`${entityType} '${entityId}': strong in '${intent}' (${Math.round(intentData.successRate * 100)}% vs ${Math.round(perf.successRate * 100)}% overall) → new activation rule`);
      }

      // Low success in this intent → new exclusion rule
      if (intentData.successRate < LOW_SUCCESS_THRESHOLD && delta < -SIGNIFICANT_DELTA) {
        const confidence = Math.min(0.5 + intentData.tasks * 0.04, 0.95);
        const status = confidence >= AUTO_APPLY_CONFIDENCE ? 'auto-applied' :
                       confidence >= SUGGEST_CONFIDENCE ? 'suggested' : 'pending';

        rules.push({
          type: 'exclusion',
          entityId,
          entityType,
          rule: {
            name: `evolved-exclude-${entityId}-${intent}`,
            when: { 'intent.primary': intent },
            reason: `Low success rate (${Math.round(intentData.successRate * 100)}%) in '${intent}' tasks`,
          } as ExclusionRule,
          evidence: `${intentData.tasks} tasks in '${intent}' intent, ${Math.round(intentData.successRate * 100)}% success`,
          confidence,
          status,
          sampleSize: intentData.tasks,
        });

        reasoning.push(`${entityType} '${entityId}': weak in '${intent}' (${Math.round(intentData.successRate * 100)}%) → new exclusion rule`);
      }
    }

    return { rules, reasoning };
  }

  /**
   * Evolve synergy-based rules for skill pairs.
   * Skill+skill synergy → activation rules.
   * Skill+skill conflict → exclusion rules.
   * Agent+skill pairs are logged but do not produce new rules (they inform routing weight instead).
   */
  private evolveSynergyRules(): { rules: EvolvedRule[]; reasoning: string[] } {
    const rules: EvolvedRule[] = [];
    const reasoning: string[] = [];

    for (const entry of this.tracker.getSynergyMatrix()) {
      if (entry.tasks < MIN_SAMPLES) continue;
      const parts = entry.pair.split('+') as [string, string];
      const [partA, partB] = parts;

      if (entry.verdict === 'synergy') {
        reasoning.push(`Synergy detected: ${entry.pair} (${Math.round(entry.successRate * 100)}% over ${entry.tasks} tasks)`);

        // Only create rules for skill-skill synergies (not agent+skill)
        if (!this.isAgentId(partA) && !this.isAgentId(partB)) {
          const confidence = Math.min(0.5 + entry.tasks * 0.04, 0.95);
          const status = confidence >= AUTO_APPLY_CONFIDENCE ? 'auto-applied' :
                         confidence >= SUGGEST_CONFIDENCE ? 'suggested' : 'pending';

          rules.push({
            type: 'activation',
            entityId: partA,
            entityType: 'skill',
            rule: {
              name: `synergy-${partA}-with-${partB}`,
              when: {},
              score: Math.round(entry.successRate * 5),
            } as ActivationRule,
            evidence: `${entry.tasks} co-uses with '${partB}', ${Math.round(entry.successRate * 100)}% success`,
            confidence,
            status,
            sampleSize: entry.tasks,
          });
        }
      }

      if (entry.verdict === 'conflict') {
        reasoning.push(`Conflict detected: ${entry.pair} (${Math.round(entry.successRate * 100)}% over ${entry.tasks} tasks)`);

        // Only create exclusion rules for skill-skill conflicts
        if (!this.isAgentId(partA) && !this.isAgentId(partB)) {
          const confidence = Math.min(0.5 + entry.tasks * 0.04, 0.95);
          const status = confidence >= AUTO_APPLY_CONFIDENCE ? 'auto-applied' :
                         confidence >= SUGGEST_CONFIDENCE ? 'suggested' : 'pending';

          rules.push({
            type: 'exclusion',
            entityId: partA,
            entityType: 'skill',
            rule: {
              name: `conflict-${partA}-with-${partB}`,
              when: {},
              reason: `Conflict with '${partB}' — low success rate (${Math.round(entry.successRate * 100)}%) when co-used`,
            } as ExclusionRule,
            evidence: `${entry.tasks} co-uses with '${partB}', ${Math.round(entry.successRate * 100)}% success`,
            confidence,
            status,
            sampleSize: entry.tasks,
          });
        }
      }
    }

    return { rules, reasoning };
  }

  /**
   * Detect if an entity ID belongs to an agent (vs a skill).
   * Uses the learnings agent performance keys as the source of truth.
   */
  private isAgentId(entityId: string): boolean {
    const learnings = this.tracker.getLearnings();
    return entityId in learnings.agentPerformance;
  }

  /**
   * Persist evolved rules to a standalone JSON file.
   * Merges with existing rules (newer rules for the same name overwrite).
   */
  saveRules(rules: EvolvedRule[]): void {
    if (rules.length === 0) return;
    try {
      const filePath = join(this.projectRoot, EVOLVED_RULES_FILE);
      const dir = join(this.projectRoot, '.deckent', 'routing');
      mkdirSync(dir, { recursive: true });

      // Load existing rules and merge
      let existing: EvolvedRule[] = [];
      if (existsSync(filePath)) {
        try {
          existing = JSON.parse(readFileSync(filePath, 'utf-8'));
        } catch { /* corrupt file — start fresh */ }
      }

      // Merge: newer rules overwrite same-name rules
      const ruleMap = new Map<string, EvolvedRule>();
      for (const r of existing) {
        const key = r.rule && 'name' in r.rule ? (r.rule as ActivationRule).name : `${r.entityId}-${r.type}`;
        if (key) ruleMap.set(key, r);
      }
      for (const r of rules) {
        const key = r.rule && 'name' in r.rule ? (r.rule as ActivationRule).name : `${r.entityId}-${r.type}`;
        if (key) ruleMap.set(key, r);
      }

      writeFileSync(filePath, JSON.stringify([...ruleMap.values()], null, 2), 'utf-8');
      debugLog('rule-evolver:saveRules', `${rules.length} rules saved to ${EVOLVED_RULES_FILE}`);
    } catch (err) {
      debugLog('rule-evolver:saveRules', err);
    }
  }

  /**
   * Load previously persisted evolved rules.
   */
  loadRules(): EvolvedRule[] {
    try {
      const filePath = join(this.projectRoot, EVOLVED_RULES_FILE);
      if (!existsSync(filePath)) return [];
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {
      return [];
    }
  }
}
