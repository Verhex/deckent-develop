/**
 * @deprecated Since Sprint 066. Superseded by V2 intent-based routing engine
 * (src/core/routing-engine.ts → routeTaskV2). Kept as reference implementation.
 * V1: keyword-based 6-step pipeline (TaskAnalysis → AgentSelection → SkillSelection
 *   → ModelResolution → EffortResolution → ScopeComputation)
 * V2: intent-based 3-layer engine (Intent Classification → Activation Evaluation → Routing Decision)
 * All 38 tests still pass. Do not delete without ADR update.
 */
// ─── Decision Engine ───────────────────────────────────────────────────────
// @deprecated This module is NOT used in production sprint execution.
// V1 routing uses selectAgent + selectSkills directly in sprint-controller.ts (line 770+).
// V2 routing uses routeTaskV2 from routing-engine.ts (line 690+).
// DecisionOrchestrator is only used by test suites (tests/orchestra/ and tests/integration/).
// This module was an early design pattern that was superseded by V1 selectAgent + V2 routeTaskV2.
// See: sprint-controller.ts line 688-830 for V1/V2 routing logic.
//
// Orchestrates the full decision pipeline: analyze -> agent -> skills -> model -> effort -> scope
import type { Task, TaskEffort } from '../core/types.js';
import type {
  DecisionContext,
  DecisionResult,
  DecisionLogEntry,
  TaskAnalysis,
} from '../core/decision-types.js';
import { createDecisionLogEntry } from '../core/decision-types.js';
import { TaskAnalyzer } from './task-analyzer.js';
import { executeAgentStep } from './decision-steps/agent-step.js';
import { executeScopeStep } from './decision-steps/scope-step.js';
import { selectSkills } from '../core/skill-selector.js';
import { resolveTaskModel } from './model-selector.js';

// ─── Effort Resolution ─────────────────────────────────────────────────────

function resolveEffort(analysis: TaskAnalysis, agentMultiplier: number): TaskEffort {
  const adjusted = analysis.complexity * agentMultiplier;
  if (adjusted >= 7) return 'high';
  if (adjusted >= 4) return 'normal';
  return 'low';
}

// ─── DecisionOrchestrator ──────────────────────────────────────────────────

export class DecisionOrchestrator {
  private context: DecisionContext;
  private analyzer: TaskAnalyzer;

  constructor(context: DecisionContext) {
    this.context = context;
    this.analyzer = new TaskAnalyzer();
  }

  /**
   * Run the full 6-step decision pipeline for a task.
   */
  decide(task: Task): DecisionResult {
    const log: DecisionLogEntry[] = [];

    // Step 1: Analyze task
    const t1Start = Date.now();
    const analysis = this.analyzer.analyze(task);
    const step1 = createDecisionLogEntry(
      1, 'TaskAnalysis',
      `type=${analysis.type}, complexity=${analysis.complexity}`,
    );
    step1.input = { title: task.title, description: task.description };
    step1.output = { type: analysis.type, complexity: analysis.complexity, keywords: analysis.keywords };
    step1.durationMs = Date.now() - t1Start;
    log.push(step1);

    // Step 2: Select agent
    const t2Start = Date.now();
    const agentResult = executeAgentStep(
      analysis,
      this.context.agentPool,
      { title: task.title, description: task.description, scope: task.scope },
    );
    const step2 = createDecisionLogEntry(
      2, 'AgentSelection',
      agentResult.reason,
    );
    step2.input = { taskType: analysis.type, poolSize: this.context.agentPool.size };
    step2.output = { agentId: agentResult.agent?.id ?? null, score: agentResult.score };
    step2.durationMs = Date.now() - t2Start;
    log.push(step2);

    // Step 3: Select skills
    const t3Start = Date.now();
    const skillResult = selectSkills(
      { title: task.title, description: task.description, scope: task.scope },
      this.context.projectStack,
      this.context.skillPool,
      agentResult.agent ? { id: agentResult.agent.id, expertise: agentResult.agent.expertise } : undefined,
      this.context.config.skills?.maxPerTask,
    );
    const step3 = createDecisionLogEntry(
      3, 'SkillSelection',
      `Selected ${skillResult.skills.length} skill(s)${skillResult.truncated ? ' (truncated)' : ''}`,
    );
    step3.input = { poolSize: this.context.skillPool.size, maxPerTask: this.context.config.skills?.maxPerTask ?? 3 };
    step3.output = { skillIds: skillResult.skills.map(s => s.id), truncated: skillResult.truncated };
    step3.durationMs = Date.now() - t3Start;
    log.push(step3);

    // Step 4: Resolve model
    const t4Start = Date.now();
    const skillModels = skillResult.skills
      .map(s => s.model)
      .filter((m): m is NonNullable<typeof m> => m !== undefined);
    const agentModel = agentResult.agent?.preferredModel;
    const allSkillModels = agentModel ? [agentModel, ...skillModels] : skillModels;
    const model = resolveTaskModel(
      task.title,
      task.description,
      task.scope,
      this.context.config,
      this.context.patterns,
      task.forceModel,
      allSkillModels.length > 0 ? allSkillModels : undefined,
    );
    const step4 = createDecisionLogEntry(
      4, 'ModelResolution',
      `Resolved model=${model}`,
    );
    step4.input = { forceModel: task.forceModel ?? null, agentPreference: agentModel ?? null };
    step4.output = { model };
    step4.durationMs = Date.now() - t4Start;
    log.push(step4);

    // Step 5: Resolve effort
    const t5Start = Date.now();
    const effort: TaskEffort = task.forceEffort
      ? task.forceEffort
      : resolveEffort(analysis, agentResult.agent?.effortMultiplier ?? 1.0);
    const step5 = createDecisionLogEntry(
      5, 'EffortResolution',
      `effort=${effort}, complexity=${analysis.complexity}, multiplier=${agentResult.agent?.effortMultiplier ?? 1.0}`,
    );
    step5.input = { complexity: analysis.complexity, agentMultiplier: agentResult.agent?.effortMultiplier ?? 1.0, forceEffort: task.forceEffort ?? null };
    step5.output = { effort };
    step5.durationMs = Date.now() - t5Start;
    log.push(step5);

    // Step 6: Compute scope
    const t6Start = Date.now();
    const mergedScope = executeScopeStep(
      task.scope,
      agentResult.agent,
      skillResult.skills,
    );
    const step6 = createDecisionLogEntry(
      6, 'ScopeComputation',
      `directories=${mergedScope.directories.length}, filesWrite=${mergedScope.filesWrite.length}`,
    );
    step6.input = { taskDirs: task.scope.directories, agentScopes: agentResult.agent?.triggerScopes ?? [] };
    step6.output = { directories: mergedScope.directories, filesWrite: mergedScope.filesWrite };
    step6.durationMs = Date.now() - t6Start;
    log.push(step6);

    return {
      analysis,
      agent: agentResult.agent,
      skills: skillResult.skills,
      model,
      effort,
      scope: mergedScope,
      decisionLog: log,
    };
  }
}
