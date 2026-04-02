// ─── Mid-Sprint Adapter ─────────────────────────────────────────────────────
// Real-time rerouting when a task fails during sprint execution.
// If task gets NO_GO, suggests alternative agent/skill for retry.

import type { Task, TaskResult } from '../core/task-types.js';
import type { AgentPool } from '../core/agent-types.js';
import type { SkillDefinition } from '../core/skill-types.js';
import type { RoutingDecision, UserOverride, TaskDNA } from '../core/routing-types.js';
import { routeTaskV2, type RoutingOptions } from '../core/routing-engine.js';
import type { OutcomeTracker } from './outcome-tracker.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { debugLog } from '../core/utils.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RerouteResult {
  should: boolean;
  reason: string;
  newDecision?: RoutingDecision;
}

// ─── MidSprintAdapter ───────────────────────────────────────────────────────

export class MidSprintAdapter {
  private readonly agentPool: AgentPool;
  private readonly skillPool: Map<string, SkillDefinition>;
  private readonly outcomeTracker: OutcomeTracker;
  private readonly projectStack: { language: string; framework: string; dependencies: string[] } | null;
  private readonly rerouteAttempts = new Map<string, number>(); // taskId → attempt count
  private readonly maxReroutesPerTask: number;
  private readonly rerouteOnTechDebt: boolean;

  constructor(
    agentPool: AgentPool,
    skillPool: Map<string, SkillDefinition>,
    outcomeTracker: OutcomeTracker,
    projectStack?: { language: string; framework: string; dependencies: string[] } | null,
    config?: Pick<ResolvedConfig, 'max_reroutes' | 'reroute_on_tech_debt'>,
  ) {
    this.agentPool = agentPool;
    this.skillPool = skillPool;
    this.outcomeTracker = outcomeTracker;
    this.projectStack = projectStack ?? null;
    this.maxReroutesPerTask = config?.max_reroutes ?? 3;
    this.rerouteOnTechDebt = config?.reroute_on_tech_debt ?? false;
  }

  /**
   * Check if rerouting is advisable for a failed task.
   */
  shouldReroute(task: Task, result: TaskResult): RerouteResult {
    // Reroute NO_GO tasks, and optionally GO_WITH_TECH_DEBT tasks
    if (result.selfAssessment === 'GO_WITH_TECH_DEBT' && !this.rerouteOnTechDebt) {
      return { should: false, reason: 'Task has tech debt but reroute_on_tech_debt is disabled' };
    }
    if (result.selfAssessment !== 'NO_GO' && result.selfAssessment !== 'GO_WITH_TECH_DEBT') {
      return { should: false, reason: 'Task did not fail (not NO_GO or GO_WITH_TECH_DEBT)' };
    }

    // Check reroute attempt limit
    const attempts = this.rerouteAttempts.get(task.id) ?? 0;
    if (attempts >= this.maxReroutesPerTask) {
      return { should: false, reason: `Max reroutes (${this.maxReroutesPerTask}) reached for task ${task.id}` };
    }

    // Attempt reroute with failed agent/skills excluded
    const newDecision = this.suggestReroute(task);
    if (!newDecision) {
      return { should: false, reason: 'No alternative routing found' };
    }

    // Only reroute if the new decision is meaningfully different
    const isDifferent =
      newDecision.agentId !== task.assignedAgent ||
      !arraysEqual(newDecision.skillIds, task.assignedSkills ?? []);

    if (!isDifferent) {
      return { should: false, reason: 'Alternative routing is same as original' };
    }

    // Only reroute if we have reasonable confidence
    if (newDecision.agentConfidence === 'uncertain' && newDecision.skillConfidence === 'uncertain') {
      return { should: false, reason: 'No confident alternative available' };
    }

    this.rerouteAttempts.set(task.id, attempts + 1);

    return {
      should: true,
      reason: `Rerouting: agent ${task.assignedAgent}→${newDecision.agentId}, skills [${(task.assignedSkills ?? []).join(',')}]→[${newDecision.skillIds.join(',')}]`,
      newDecision,
    };
  }

  /**
   * Suggest an alternative routing for a failed task.
   * Excludes the previously failed agent and skills.
   */
  suggestReroute(task: Task): RoutingDecision | null {
    try {
      // Build exclusions from failed assignment
      const overrides: UserOverride[] = [];

      const excludeAgents: string[] = [];
      const excludeSkills: string[] = [];

      // Exclude the failed agent
      if (task.assignedAgent && task.assignedAgent !== 'generic') {
        excludeAgents.push(task.assignedAgent);
      }

      // Exclude failed skills
      if (task.assignedSkills && task.assignedSkills.length > 0) {
        excludeSkills.push(...task.assignedSkills);
      }

      // Also include any existing user overrides
      if (task.excludeSkills) excludeSkills.push(...task.excludeSkills);
      if (task.excludeAgent) excludeAgents.push(...task.excludeAgent);

      overrides.push({
        source: 'task-directive',
        excludeAgents,
        excludeSkills,
        priority: 3,
      });

      // Get learning bonuses for this task's DNA
      const routingMeta = task.routingMeta;
      const learningData = routingMeta?.taskDNA
        ? this.outcomeTracker.calculateBonuses(routingMeta.taskDNA as TaskDNA)
        : [];

      const options: RoutingOptions = {
        projectStack: this.projectStack,
        overrides,
        learningData,
      };

      return routeTaskV2(task, this.agentPool, this.skillPool, options);
    } catch (err) {
      debugLog('mid-sprint-adapter:reroute', err);
      return null;
    }
  }

  /**
   * Apply a reroute decision to a task (mutates task in place).
   */
  applyReroute(task: Task, decision: RoutingDecision): void {
    task.assignedAgent = decision.agentId ?? 'generic';
    task.assignedSkills = decision.skillIds;
    task.routingMeta = {
      taskDNA: decision.taskDNA,
      confidence: decision.agentConfidence,
      routingVersion: 'v2',
    };

    debugLog(
      'mid-sprint-adapter:apply',
      `Task ${task.id} rerouted → agent=${task.assignedAgent}, skills=[${task.assignedSkills.join(', ')}]`,
    );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted1 = [...a].sort();
  const sorted2 = [...b].sort();
  return sorted1.every((v, i) => v === sorted2[i]);
}
