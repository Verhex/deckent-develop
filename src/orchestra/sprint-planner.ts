// ═══ Sprint Planner ════════════════════════════════════════════════
// Extracted from sprint-controller.ts — planning functions:
//   readContext(), planSprint(), confirmDraftTasks(), cleanupDraftTasks()

// ─── Node Builtins ─────────────────────────────────────────────────
import {
  readFileSync, existsSync,
  mkdirSync, readdirSync, unlinkSync,
} from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// ─── Core (value imports — enums used at runtime) ──────────────────
import {
  TaskStatus, SprintPhase,
  SprintStatus, DebtPriority,
} from '../core/types.js';

// ─── Core (type imports) ───────────────────────────────────────────
import type {
  Task, TaskScope, Sprint, DebtItem,
  ResolvedConfig,
  BrainContext, SprintSizeRecommendation,
  BrainPlanningMode, PlannerResult, ProviderName,
} from '../core/types.js';

import {
  BRAIN_DIR, TASKS_DIR, DIRECTIVES_FILE,
  MEMORY_DB_FILE,
} from '../core/constants.js';

// ─── Memory V2 ───────────────────────────────────────────────────
import { MemoryStore } from '../core/memory-store.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { getNextSprintId, readJsonSafe, debugLog } from '../core/utils.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import { readFileSafe, extractGoNogoCriteria } from './sprint-utils.js';

// ─── Core — provider abstraction ──────────────────────────────────
import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry } from '../core/provider.js';

// ─── Core — skill system ─────────────────────────────────────────
import { detectProjectStack } from '../core/stack-detector.js';
import { SkillPoolManager } from '../core/skill-pool.js';
import { selectSkills } from '../core/skill-selector.js';

// ─── Planner ─────────────────────────────────────────────────────
import { callBrainPlanner } from './planner.js';

// ─── Auditor ──────────────────────────────────────────────────────
import { detectDeadlocks } from '../monitor/auditor.js';

// ─── Agent Pool & Selection ──────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { selectAgent } from '../core/agent-selector.js';
import { routeTaskV2 } from '../core/routing-engine.js';
import type { UserOverride } from '../core/routing-types.js';

// ─── Sub-module imports ──────────────────────────────────────────
import { resolveTaskModel, parsePatterns, deduplicatePatterns } from './model-selector.js';
import { createTask, extractScopeFromDirective, parseStructuredDirectives, plannerTaskToParams } from './task-builder.js';

// ─── BrainError ──────────────────────────────────────────────────
import { BrainError } from './sprint-lifecycle.js';

// ═══ Exported Functions ════════════════════════════════════════════

/**
 * Read the full brain context from disk: directives, memory, retro, patterns,
 * decisions, debt, existing tasks, git status, and file tree.
 * @param projectRoot - Project root directory
 * @returns Complete brain context for sprint planning
 */
export function readContext(projectRoot: string): BrainContext {
  const brainPath = join(projectRoot, BRAIN_DIR);
  const dbPath = join(brainPath, MEMORY_DB_FILE);

  // Directives always from file (not in DB)
  const directives = readFileSafe(join(projectRoot, DIRECTIVES_FILE));

  // Try DB-first for brain context
  let memory = '';
  let retro = '';
  let patterns = '';
  let decisions = '';
  let projectIdentity: string | undefined;
  let debt: DebtItem[] = [];

  if (existsSync(dbPath)) {
    try {
      const store = new MemoryStore(dbPath);
      try {
        // Memory: concat all memory entries as markdown
        const memEntries = store.getByType('memory');
        memory = memEntries.map(e => `## ${e.title}\n${e.content}`).join('\n\n');

        // Retro: latest retro entry
        const retroEntries = store.getByType('retro');
        retro = retroEntries.length > 0 ? retroEntries[0]!.content : '';

        // Patterns: all active patterns as JSON string (backward compat)
        const patternEntries = store.getByType('pattern');
        patterns = patternEntries.length > 0
          ? JSON.stringify(patternEntries.map(p => ({ pattern: p.title, resolved: p.status === 'resolved' })))
          : '';

        // Decisions: concat all accepted ADRs
        const adrEntries = store.getByType('adr').filter(a => a.status === 'accepted');
        decisions = adrEntries.map(a => `## ${a.id}: ${a.title}\n\n**Status:** ${a.status}\n\n${a.content}`).join('\n\n---\n\n');

        // Project Identity
        const idEntry = store.getByType('identity');
        projectIdentity = idEntry.length > 0 ? idEntry[0]!.content : undefined;

        // Debt: convert DB entries to DebtItem[]
        const debtEntries = store.getByType('debt').filter(d => d.status !== 'resolved');
        debt = debtEntries.map(d => {
          const meta = JSON.parse(d.metadata || '{}');
          return {
            id: d.id,
            description: d.title,
            originTaskId: meta.originTaskId ?? '',
            originSprintId: meta.originSprintId ?? d.sprint_id ?? '',
            priority: (d.priority?.toUpperCase() ?? 'NORMAL') as DebtPriority,
            sprintsOpen: meta.sprintsOpen ?? 0,
            resolved: false,
            resolvedInSprintId: undefined,
            createdAt: d.created_at,
          };
        });
      } finally {
        store.close();
      }
    } catch {
      // DB error — fall through to V1
    }
  }

  // If DB didn't populate (no DB or error), fields remain as empty strings/arrays

  // Existing tasks + git status (unchanged)
  const existingTasks: Task[] = [];
  const tasksDir = join(projectRoot, TASKS_DIR);
  if (existsSync(tasksDir)) {
    const files = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.json'));
    for (const file of files) {
      const task = readJsonSafe<Task>(join(tasksDir, file));
      if (task) existingTasks.push(task);
    }
  }

  const gitResult = spawnSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf-8' });
  const gitStatus = gitResult.status === 0 ? (gitResult.stdout ?? '') : '';

  const treeResult = spawnSync('git', ['ls-files'], { cwd: projectRoot, encoding: 'utf-8' });
  const fileTree = treeResult.status === 0
    ? (treeResult.stdout ?? '').split('\n').filter(Boolean)
    : [];

  return { directives, memory, retro, debt, patterns, decisions, projectIdentity, existingTasks, projectState: { gitStatus, fileTree } };
}

/**
 * Plan a new sprint by creating task definitions from directives.
 * Handles critical debt priority fixes, AI planner with structured fallback,
 * deadlock detection, agent selection, and skill assignment.
 * @param projectRoot - Project root directory
 * @param config - Resolved project configuration
 * @param context - Brain context with directives, memory, debt, etc.
 * @param recommendation - Sprint size recommendation
 * @param options - Optional planning mode, draft flag, and usage metrics
 * @returns The planned sprint with all tasks
 * @throws {BrainError} When AI planner fails in 'ai' mode or circular dependencies detected
 */
export async function planSprint(
  projectRoot: string,
  config: ResolvedConfig,
  context: BrainContext,
  recommendation: SprintSizeRecommendation,
  options?: { mode?: BrainPlanningMode; asDraft?: boolean; dryRun?: boolean },
): Promise<Sprint> {
  const sprintId = getNextSprintId(projectRoot);
  const defaultModel = recommendation.modelConstraint ?? config.activeModeConfig.default_model;
  const planMode = options?.mode ?? config.activeModeConfig.brain_planning ?? 'auto';
  const initialStatus = options?.asDraft ? TaskStatus.DRAFT : TaskStatus.PENDING;

  const tasks: Task[] = [];
  let seq = 1;
  let plannerResult: PlannerResult | null = null;
  let usedMode: string = 'structured';

  // CRITICAL debt -> priority fix tasks
  const criticalDebt = context.debt.filter(d => d.priority === DebtPriority.CRITICAL && !d.resolved);
  for (const debt of criticalDebt) {
    tasks.push(createTask({
      title: `Fix debt: ${debt.description}`,
      description: `Priority fix for critical debt item ${debt.id}`,
      model: defaultModel,
      effort: 'high',
      priority: 'CRITICAL',
      reason: `Critical debt open for ${debt.sprintsOpen} sprints`,
      scope: { directories: [], filesRead: [], filesWrite: [] },
      dependencies: [],
      goNogo: { goCriteria: 'Debt resolved', noGoCriteria: 'Debt still present', techDebtAcceptable: '' },
      sprintId,
      isPriorityFix: true,
      fixForTaskId: debt.originTaskId,
      initialStatus,
    }, seq++));
  }

  // AI planner attempt
  if (planMode === 'ai' || planMode === 'auto') {
    // Resolve brain provider adapter — no hardcoded fallback to any specific provider.
    // Uses config.brain_provider if set, then registry default.
    let brainAdapter: ProviderAdapter | undefined;
    let brainProviderName: ProviderName | undefined = config.brain_provider;
    try {
      if (brainProviderName && providerRegistry.hasProvider(brainProviderName)) {
        brainAdapter = providerRegistry.getProvider(brainProviderName);
      } else {
        brainAdapter = providerRegistry.getDefault();
        brainProviderName = brainAdapter.name as ProviderName;
      }
    } catch (e) {
      debugLog('planSprint:resolveProvider', e);
      // No providers registered — planner will throw a clear error via resolveAdapter()
    }

    // Map brain_model through provider-aware model selector
    const brainModel = resolveTaskModel(
      'sprint-planning', 'AI planner invocation',
      { directories: [], filesRead: [], filesWrite: [] },
      config,
      undefined, config.activeModeConfig.brain_model,
      undefined, brainProviderName,
    );

    // Fetch worst agent+skill combinations from OutcomeTracker to inject into planner prompt
    let worstCombinations: string | undefined;
    try {
      const { OutcomeTracker: OT } = await import('./outcome-tracker.js');
      const ot = new OT(projectRoot);
      const worst = ot.getWorstCombinations(5);
      if (worst) worstCombinations = worst;
    } catch (e) {
      debugLog('planSprint:worstCombinations', e);
    }

    plannerResult = callBrainPlanner(
      context,
      recommendation,
      brainModel,
      config.projectName,
      brainAdapter,
      undefined,
      worstCombinations,
    );

    if (plannerResult) {
      const directiveTaskCount = parseStructuredDirectives(context.directives).length;
      if (planMode === 'auto' && directiveTaskCount > 0 && plannerResult.tasks.length < directiveTaskCount) {
        console.error(
          `[Brain] AI planner returned ${plannerResult.tasks.length} tasks, ` +
          `but directives contain ${directiveTaskCount}. Falling back to structured mode.`,
        );
        plannerResult = null;
        usedMode = 'fallback';
      } else if (planMode === 'auto' && directiveTaskCount > 0 && plannerResult.tasks.length > directiveTaskCount * 2) {
        console.error(
          `[Brain] AI planner returned ${plannerResult.tasks.length} tasks (>2x of ${directiveTaskCount}). ` +
          `Falling back to structured mode.`,
        );
        plannerResult = null;
        usedMode = 'fallback';
      } else {
        usedMode = 'ai';
        for (const pt of plannerResult.tasks) {
          tasks.push(createTask(
            plannerTaskToParams(pt, sprintId, defaultModel, initialStatus),
            seq++,
          ));
        }
      }
    } else if (planMode === 'ai') {
      throw new BrainError('AI planner failed', SprintPhase.PLAN);
    } else {
      usedMode = 'fallback';
    }
  }

  // Structured fallback (mode === 'structured' || AI fail + auto)
  if (!plannerResult && (planMode === 'structured' || planMode === 'auto')) {
    const structuredTasks = parseStructuredDirectives(context.directives);
    const directiveSources: Array<{ title: string; description: string; scope: TaskScope; forceModel?: import('../core/types.js').ModelType; forceEffort?: import('../core/types.js').TaskEffort; testTarget?: string; forceAgent?: string; forceSkills?: string[]; excludeAgent?: string[]; excludeSkills?: string[]; priority?: import('../core/types.js').TaskPriority; dependencies?: string[] }> =
      structuredTasks.length > 0
        ? structuredTasks
        : context.directives
            .split('\n')
            .map(l => l.trim())
            .filter(l => l && !l.startsWith('#'))
            .map(l => l.replace(/^-\s+/, ''))
            .filter(Boolean)
            .map(line => ({ title: line, description: line, scope: extractScopeFromDirective(line) }));

    // Parse and deduplicate patterns from context for model selection
    const patternsRaw = typeof context.patterns === 'string' ? context.patterns : '';
    const parsedPatterns = deduplicatePatterns(parsePatterns(patternsRaw));

    for (const src of directiveSources) {
      const resolvedModel = recommendation.modelConstraint ??
        resolveTaskModel(src.title, src.description, src.scope, config, parsedPatterns, src.forceModel);
      const resolvedEffort = src.forceEffort ?? 'normal';
      tasks.push(createTask({
        title: src.title,
        description: src.description,
        model: resolvedModel,
        effort: resolvedEffort,
        priority: src.priority ?? 'NORMAL',
        reason: src.forceModel
          ? `Directive (model: ${resolvedModel} -- user override)`
          : `Directive (model: ${resolvedModel} -- resolved from scope/complexity/plan)`,
        scope: src.scope,
        dependencies: src.dependencies ?? [],
        goNogo: extractGoNogoCriteria(src.description, src.testTarget),
        sprintId,
        initialStatus,
        forceModel: src.forceModel,
        forceEffort: src.forceEffort,
        forceAgent: src.forceAgent,
        forceSkills: src.forceSkills,
        excludeAgent: src.excludeAgent,
        excludeSkills: src.excludeSkills,
      }, seq++));
    }
  }

  // Deadlock check
  const deadlocks = detectDeadlocks(tasks);
  if (deadlocks.length > 0) {
    throw new BrainError(
      `Circular dependencies detected: ${deadlocks[0]?.detail ?? 'unknown'}`,
      SprintPhase.PLAN,
    );
  }

  // D) Safeguard: warn if AI planner produced >2x the directive task count
  const directiveTaskCountForGuard = parseStructuredDirectives(context.directives).length;
  if (directiveTaskCountForGuard > 0 && tasks.length > directiveTaskCountForGuard * 2) {
    console.error(
      `[Brain] Warning: ${tasks.length} tasks planned but directives only contain ${directiveTaskCountForGuard} tasks (>2x). ` +
      `Review the plan for excessive task generation.`,
    );
  }

  // ─── Routing: V2 (intent-based) or V1 (keyword-based) ─────────────────────
  const routingVersion = config.routing_engine ?? 'v1';

  if (routingVersion === 'v2') {
    // V2: Unified intent-based routing via routeTaskV2
    try {
      const agentPool = new AgentPoolManager(projectRoot);
      const pool = agentPool.loadAgents();
      const projectStackV2 = detectProjectStack(projectRoot);
      const skillPoolV2 = new SkillPoolManager(projectRoot);
      const skillsV2 = skillPoolV2.loadSkills();

      // Load learning bonuses from previous sprints
      let learningData: import('../core/routing-types.js').LearningBonus[] = [];
      try {
        const { OutcomeTracker } = await import('./outcome-tracker.js');
        const tracker = new OutcomeTracker(projectRoot);
        const { classifyIntent } = await import('../core/intent-classifier.js');
        if (tasks.length > 0) {
          const sampleDNA = classifyIntent(tasks[0]!);
          learningData = tracker.calculateBonuses(sampleDNA);
          debugLog('planSprint:learning-bonuses', `Loaded ${learningData.length} learning bonuses from previous sprints`);
        }
      } catch (e) {
        debugLog('planSprint:learning-bonuses:No learning data available (first sprint or missing learnings.json)', e);
      }

      // Generate project conventions temp skill
      try {
        const { generateProjectConventionsSkill } = await import('./temp-skill-generator.js');
        if (projectStackV2) {
          const conventionsSkill = generateProjectConventionsSkill(projectStackV2);
          skillsV2.set(conventionsSkill.id, conventionsSkill);
          debugLog('planSprint:temp-skill', `Generated project-conventions skill for ${projectStackV2.language}`);
        }
      } catch (e) { debugLog('planSprint:generateProjectConventionsSkill', e); }

      // Generate and persist project-specific temp agents (V2 only)
      try {
        const { generateTempAgents } = await import('./temp-skill-generator.js');
        if (projectStackV2) {
          const tempAgents = generateTempAgents(projectStackV2);
          for (const tempAgent of tempAgents) {
            agentPool.saveTempAgentToPool(tempAgent);
            pool.set(tempAgent.id.startsWith('temp-') ? tempAgent.id : `temp-${tempAgent.id}`, tempAgent);
            debugLog('planSprint:temp-agent', `Generated temp agent: ${tempAgent.id} for ${projectStackV2.language}/${projectStackV2.framework}`);
          }
        }
      } catch (e) { debugLog('planSprint:generateTempAgents', e); }

      // Inject evolved rules into agent/skill activation configs (in-memory only)
      try {
        const { OutcomeTracker: OT } = await import('./outcome-tracker.js');
        const ot = new OT(projectRoot);
        const allLearnings = ot.getLearnings();
        const evolvedRules = (allLearnings.evolvedRules ?? []) as import('./rule-evolver.js').EvolvedRule[];
        const autoApplied = evolvedRules.filter(r => r.status === 'auto-applied');
        let injectedCount = 0;

        for (const evolved of autoApplied) {
          if (evolved.entityType === 'agent') {
            const agent = pool.get(evolved.entityId);
            if (!agent) continue;
            if (!agent.activation) {
              agent.activation = { rules: [], exclude: [], minScore: 0 };
            }
            if (evolved.type === 'activation') {
              const rule = evolved.rule as import('../core/routing-types.js').ActivationRule;
              const hasDuplicate = agent.activation.rules.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                agent.activation.rules.push(rule);
                injectedCount++;
              }
            } else if (evolved.type === 'exclusion') {
              const rule = evolved.rule as import('../core/routing-types.js').ExclusionRule;
              const hasDuplicate = agent.activation.exclude.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                agent.activation.exclude.push(rule);
                injectedCount++;
              }
            }
          } else if (evolved.entityType === 'skill') {
            const skill = skillsV2.get(evolved.entityId);
            if (!skill) continue;
            if (!skill.activation) {
              skill.activation = { rules: [], exclude: [], minScore: 0 };
            }
            if (evolved.type === 'activation') {
              const rule = evolved.rule as import('../core/routing-types.js').ActivationRule;
              const hasDuplicate = skill.activation.rules.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                skill.activation.rules.push(rule);
                injectedCount++;
              }
            } else if (evolved.type === 'exclusion') {
              const rule = evolved.rule as import('../core/routing-types.js').ExclusionRule;
              const hasDuplicate = skill.activation.exclude.some(r => r.name && rule.name && r.name === rule.name);
              if (!hasDuplicate) {
                skill.activation.exclude.push(rule);
                injectedCount++;
              }
            }
          }
        }

        if (injectedCount > 0) {
          debugLog('planSprint:evolved-rules', `Injected ${injectedCount} auto-applied evolved rules into activation configs`);
        }
      } catch (e) {
        debugLog('planSprint:evolved-rules', e);
      }

      for (const task of tasks) {
        try {
          const overrides: UserOverride[] = [];
          if (task.forceAgent || task.forceSkills || task.excludeSkills || task.excludeAgent) {
            overrides.push({
              source: 'task-directive',
              forceAgent: task.forceAgent,
              forceSkills: task.forceSkills,
              excludeSkills: task.excludeSkills,
              excludeAgents: task.excludeAgent,
              priority: 3,
            });
          }

          const decision = routeTaskV2(task, pool, skillsV2, {
            projectStack: projectStackV2,
            overrides,
            learningData,
            config: { ...config.routing_config, agentMinScore: config.agent_min_score },
            sprintId,
            taskId: task.id,
            projectRoot,
          });

          task.assignedAgent = decision.agentId ?? 'generic';
          task.assignedSkills = decision.skillIds;
          task.routingMeta = {
            taskDNA: decision.taskDNA,
            confidence: decision.agentConfidence,
            routingVersion: 'v2',
          };

          // Persist decision trail via DecisionLogger — only for v2 routing with meaningful steps
          try {
            const { DecisionLogger, filterMeaningfulSteps } = await import('./decision-logger.js');
            const decisionLogger = new DecisionLogger(projectRoot);
            const allEntries = decision.reasoning.map((r, i) => ({
              step: i + 1,
              name: `routing-step-${i + 1}`,
              input: {
                taskId: task.id,
                title: task.title,
                scope: task.scope.directories,
                intent: decision.taskDNA.intent.primary,
              } as Record<string, unknown>,
              output: {
                agent: decision.agentId ?? 'generic',
                skills: decision.skillIds,
                confidence: decision.agentConfidence,
              } as Record<string, unknown>,
              durationMs: 0,
              reasoning: r,
            }));
            const meaningful = filterMeaningfulSteps(allEntries);
            // Only write log if there are meaningful steps
            if (meaningful.length > 0) {
              decisionLogger.log(sprintId, task.id, meaningful);
            }
          } catch (logErr) {
            debugLog('planSprint:decision-trail', logErr);
          }

          debugLog(
            'planSprint:routing-v2',
            `Task ${task.id} → agent=${task.assignedAgent}, skills=[${task.assignedSkills.join(', ')}], ` +
            `confidence=${decision.agentConfidence}, intent=${decision.taskDNA.intent.primary}`,
          );
        } catch (taskErr) {
          debugLog('planSprint:routing-v2', `V2 routing failed for task ${task.id}: ${taskErr}`);
        }
      }
    } catch (poolErr) {
      debugLog('planSprint:routing-v2', `V2 routing pool loading failed: ${poolErr}`);
    }
  } else {

  // V1: Agent selection (non-fatal -- if pool fails, continue with generic workers)
  try {
    const agentPool = new AgentPoolManager(projectRoot);
    const pool = agentPool.loadAgents();
    for (const task of tasks) {
      try {
        // If DIRECTIVES specified Agent: override, use it directly
        if (task.forceAgent) {
          task.assignedAgent = task.forceAgent;
          debugLog(
            'planSprint:agent-selection',
            `Task ${task.id} → forceAgent=${task.forceAgent} (DIRECTIVES override)`,
          );
        } else {
          const result = selectAgent(task, pool);
          task.assignedAgent = result.agent?.id ?? 'generic';
          if (result.agent?.preferredModel && !task.forceModel) {
            task.model = result.agent.preferredModel;
          }
          debugLog(
            'planSprint:agent-selection',
            `Task ${task.id} → agent=${task.assignedAgent}, score=${result.score}, reason=${result.reason}`,
          );
        }
      } catch (taskErr) {
        debugLog('planSprint:agent-selection', `Agent selection failed for task ${task.id}: ${taskErr}`);
      }
    }
  } catch (poolErr) {
    debugLog('planSprint:agent-pool', `Agent pool loading failed: ${poolErr}`);
  }

  // Skill selection (non-fatal -- if skill modules fail, continue without skills)
  try {
    const projectStack = detectProjectStack(projectRoot);
    const skillPool = new SkillPoolManager(projectRoot);
    const skills = skillPool.loadSkills();

    if (skills.size > 0) {
      for (const task of tasks) {
        try {
          if (task.forceSkills && task.forceSkills.length > 0) {
            task.assignedSkills = task.forceSkills;
            debugLog(
              'planSprint:skill-selection',
              `Task ${task.id} → forceSkills=[${task.forceSkills.join(', ')}] (DIRECTIVES override)`,
            );
          } else {
            const agentInfo = task.assignedAgent && task.assignedAgent !== 'generic'
              ? { id: task.assignedAgent, expertise: [] as string[] }
              : undefined;
            const result = selectSkills(task, projectStack, skills, agentInfo);
            if (result.skills.length > 0) {
              task.assignedSkills = result.skills.map(s => s.id);
            }
            debugLog(
              'planSprint:skill-selection',
              `Task ${task.id} → skills=[${(task.assignedSkills ?? []).join(', ')}]`,
            );
          }
        } catch (taskErr) {
          debugLog('planSprint:skill-selection', `Skill selection failed for task ${task.id}: ${taskErr}`);
        }
      }
    }
  } catch (poolErr) {
    debugLog('planSprint:skill-pool', `Skill pool loading failed: ${poolErr}`);
  }

  } // end V1 else block

  // Write task files (skip in dry-run mode)
  if (!options?.dryRun) {
    const tasksPath = join(projectRoot, TASKS_DIR);
    mkdirSync(tasksPath, { recursive: true });
    for (const task of tasks) {
      debugLog(
        'planSprint:task-write',
        `Writing ${task.id}: assignedAgent=${task.assignedAgent ?? 'undefined'}, assignedSkills=[${(task.assignedSkills ?? []).join(', ')}]`,
      );
      await writeFile(join(tasksPath, `task-${task.id}.json`), JSON.stringify(task, null, 2), 'utf-8');
    }
  }

  return {
    id: sprintId,
    number: parseInt(sprintId.replace('sprint-', ''), 10),
    status: SprintStatus.PLANNING,
    phase: SprintPhase.PLAN,
    tasks,
    workers: tasks.map(t => `w-${t.id}`),
    reasoning: plannerResult?.reasoning,
    planningMode: usedMode,
  };
}

/**
 * Transition all DRAFT tasks in a sprint to PENDING status and persist changes.
 * @param projectRoot - Project root directory
 * @param sprint - Sprint whose draft tasks should be confirmed
 */
export async function confirmDraftTasks(projectRoot: string, sprint: Sprint): Promise<void> {
  const tasksPath = join(projectRoot, TASKS_DIR);
  for (const task of sprint.tasks) {
    if (task.status === TaskStatus.DRAFT) {
      task.status = TaskStatus.PENDING;
      await writeFile(
        join(tasksPath, `task-${task.id}.json`),
        JSON.stringify(task, null, 2),
        'utf-8',
      );
    }
  }
}

/**
 * Remove existing DRAFT task files from .tasks/ directory.
 * Called before planning to ensure idempotency — re-running `deckent plan`
 * cleans up stale drafts from a previous plan.
 * @param projectRoot - Project root directory
 */
export function cleanupDraftTasks(projectRoot: string): void {
  const tasksPath = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksPath)) return;
  const files = readdirSync(tasksPath).filter(f => f.startsWith('task-') && f.endsWith('.json'));
  for (const file of files) {
    const filePath = join(tasksPath, file);
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const task = JSON.parse(raw);
      if (task.status === TaskStatus.DRAFT) {
        unlinkSync(filePath);
      }
    } catch (e) {
      debugLog('cleanupDraftTasks:parseTaskFile', e);
    }
  }
}
