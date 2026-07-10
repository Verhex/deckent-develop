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
  ModelType,
} from '../core/types.js';

import {
  BRAIN_DIR, TASKS_DIR, DIRECTIVES_FILE,
  MEMORY_DB_FILE,
} from '../core/constants.js';

// ─── Memory V2 ───────────────────────────────────────────────────
import { MemoryStore } from '../core/memory-store.js';

// ─── Core — utils ─────────────────────────────────────────────────
import { getNextSprintId, readJsonSafe, debugLog } from '../core/utils.js';
import { isUnconditionalRule } from './rule-evolver.js';
import { resolveDebt } from './debt-manager.js';

// ─── Sprint Utilities ─────────────────────────────────────────────
import { readFileSafe, extractGoNogoCriteria, isAdapterProvider } from './sprint-utils.js';
import { modelRegistry, ensureOllamaModelRegistered } from '../core/model-registry.js';

// ─── Core — provider abstraction ──────────────────────────────────
import type { ProviderAdapter } from '../core/provider.js';
import { providerRegistry } from '../core/provider.js';

// ─── Core — skill system ─────────────────────────────────────────
import { detectProjectStack, detectFullStack } from '../core/stack-detector.js';
import { normalizeTechStack, rubricTypeToKind } from '../core/work-model.js';
import { detectTaskType } from './rubric-registry.js';
import { SkillPoolManager } from '../core/skill-pool.js';

// ─── Planner ─────────────────────────────────────────────────────
import { callBrainPlanner, callBrainPlannerWithReason } from './planner.js';
import type { PlannerCallResult, PlannerFailureReason } from './planner.js';

/**
 * Resolve the planner-call function, with a legacy-mock fallback.
 *
 * Older test files (`vi.mock('../../src/orchestra/planner.js', () => ({ callBrainPlanner: vi.fn().mockReturnValue(null) }))`)
 * only provide `callBrainPlanner` in their mock factory. Vitest throws when the
 * test imports `callBrainPlannerWithReason` from such a mocked module ("No
 * callBrainPlannerWithReason export is defined on the mock"). We wrap the
 * access in try/catch so those tests keep working without modifying them
 * (out of scope for task 224-001). On the fallback path we synthesize a
 * `parse_failed` reason from the legacy null return.
 */
function resolveCallBrainPlanner(): (
  ...args: Parameters<typeof callBrainPlannerWithReason>
) => PlannerCallResult {
  let withReasonFn: typeof callBrainPlannerWithReason | undefined;
  try {
    withReasonFn = callBrainPlannerWithReason;
  } catch {
    withReasonFn = undefined;
  }
  if (typeof withReasonFn === 'function') {
    return withReasonFn;
  }
  return (...args): PlannerCallResult => {
    try {
      const r = callBrainPlanner(...args);
      if (r) return { ok: true, data: r };
      return {
        ok: false,
        reason: 'parse_failed' as PlannerFailureReason,
        message: 'AI planner returned null (legacy mock or unexpected fall-through).',
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        reason: 'no_providers' as PlannerFailureReason,
        message,
      };
    }
  };
}

// ─── Auditor ──────────────────────────────────────────────────────
import { detectDeadlocks } from '../monitor/auditor.js';

// ─── Agent Pool & Selection ──────────────────────────────────────
import { AgentPoolManager } from '../core/agent-pool.js';
import { routeTaskV2 } from '../core/routing-engine.js';
import type { UserOverride } from '../core/routing-types.js';
import {
  InMemoryAgentSelectionSink,
  recordAgentSelection,
  summarizeAgentDistribution,
} from '../core/routing-affinity-observability.js';

// ─── Sub-module imports ──────────────────────────────────────────
import { resolveTaskModel, parsePatterns, deduplicatePatterns } from './model-selector.js';
import { createTask, extractScopeFromDirective, parseStructuredDirectives, plannerTaskToParams, normalizeStructuredTaskDependencies } from './task-builder.js';
import { evaluatePromptGate } from './prompt-gate.js';
import type { PromptGateResult } from '../core/prompt-gate-types.js';

// ─── BrainError ──────────────────────────────────────────────────
import { BrainError } from './sprint-lifecycle.js';

// ─── Notify + Progress ───────────────────────────────────────────
import { notify } from '../core/notify.js';
import { emitProgress } from '../core/event-stream.js';

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
            // born-603: surface the FULL note (`content`), not the 80-char-sliced
            // `title` — injectCriticalDebtTasks pattern-matches honest no-op
            // fix-wave echoes against this text, and a truncated title can cut
            // the no-defect marker off before the match. `title` is a
            // defensive fallback only (content is always set by debt-manager.ts).
            description: d.content || d.title,
            originTaskId: meta.originTaskId ?? '',
            originSprintId: meta.originSprintId ?? d.sprint_id ?? '',
            priority: (d.priority?.toUpperCase() ?? 'NORMAL') as DebtPriority,
            sprintsOpen: meta.sprintsOpen ?? 0,
            resolved: false,
            resolvedInSprintId: undefined,
            createdAt: d.created_at,
            // Sprint 179 W1-1: surface class + originScope to injectCriticalDebtTasks
            class: meta.class,
            originScope: meta.originScope,
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
  options?: { mode?: BrainPlanningMode; asDraft?: boolean; dryRun?: boolean; acknowledgePromptGate?: boolean },
): Promise<Sprint> {
  const sprintId = getNextSprintId(projectRoot);
  // G-series plan-time prompt-gate result (persona/decision-space); computed after
  // routing inside the pool try-block, attached to the returned Sprint below.
  let promptGate: PromptGateResult | undefined;
  emitProgress({ phase: 'PLAN', root: projectRoot });
  const defaultModel = recommendation.modelConstraint ?? config.activeModeConfig.default_model;
  let planMode = options?.mode ?? config.activeModeConfig.brain_planning ?? 'auto';
  const initialStatus = options?.asDraft ? TaskStatus.DRAFT : TaskStatus.PENDING;

  // Sprint 238 İŞ1: Per-task `- Provider:`/`- Model:` directives are deterministic
  // routing decisions that must be honored EXACTLY. AI planning cannot guarantee a
  // 1:1 directive→task mapping (it may split/merge tasks), so whenever DIRECTIVES
  // carry explicit provider/model overrides we route to structured planning in any
  // mode — extending the existing auto→structured fallback (count-mismatch) below.
  const parsedDirectives = parseStructuredDirectives(context.directives);
  if (planMode !== 'structured' && parsedDirectives.some(t => t.provider || t.forceModel)) {
    if (planMode === 'ai') {
      void notify(
        'phase-change', sprintId,
        '[Brain] plan:structured-override',
        'Per-task provider/model overrides present in DIRECTIVES — using structured planning to honor them exactly (AI planning cannot guarantee exact routing).',
      );
    }
    planMode = 'structured';
  }

  const tasks: Task[] = [];
  let seq = 1;
  let plannerResult: PlannerResult | null = null;
  let usedMode: string = 'structured';

  // CRITICAL debt -> priority fix tasks (Sprint 179 W1-1)
  const injected = injectCriticalDebtTasks(context.debt, sprintId, defaultModel, seq, initialStatus);
  tasks.push(...injected.tasks);
  seq = injected.nextSeq;

  // 365-001: honest-closure debts (verified-no-result / timeout-partial) are
  // intentionally NOT re-injected as fix tasks — but the skip signal was
  // previously discarded, leaving those rows `active` to re-inject/re-evaluate
  // every sprint forever (a permanent no-op pile-up). Resolving them here makes
  // a skip a genuine closure. resolveDebt is idempotent + fail-soft (no-op when
  // there is no DB / the row is already resolved), so this is safe to run every plan.
  // NOTE (born-603): `injected.skippedNoop` (heuristic honest-noop-echo class)
  // is deliberately NOT looped/resolved here — see DebtInjectionResult doc.
  for (const skippedDebtId of injected.skipped) {
    resolveDebt(projectRoot, skippedDebtId, sprintId);
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

    // brain_plan_timeout_ms: optional ResolvedConfig override (Sprint 224 — task
     // 224-001). Read via index-access so we do not need to extend config-types
     // until a follow-up sprint formalises the field. Defaults to BRAIN_PLAN_TIMEOUT_MS.
    const planTimeout =
      (config as unknown as { brain_plan_timeout_ms?: number }).brain_plan_timeout_ms
      ?? config.ai_planner_timeout
      ?? undefined;

    const plannerCallFn = resolveCallBrainPlanner();
    const callResult: PlannerCallResult = plannerCallFn(
      context,
      recommendation,
      brainModel,
      config.projectName,
      brainAdapter,
      planTimeout,
      worstCombinations,
    );

    if (callResult.ok) {
      plannerResult = callResult.data;
      const directiveTaskCount = parsedDirectives.length;
      if (planMode === 'auto' && directiveTaskCount > 0 && plannerResult.tasks.length < directiveTaskCount) {
        void notify(
          'progress', sprintId,
          '[Brain] plan:task-count-low',
          `AI planner returned ${plannerResult.tasks.length} tasks, but directives contain ${directiveTaskCount}. Falling back to structured mode.`,
        );
        plannerResult = null;
        usedMode = 'fallback';
      } else if (planMode === 'auto' && directiveTaskCount > 0 && plannerResult.tasks.length > directiveTaskCount * 2) {
        void notify(
          'progress', sprintId,
          '[Brain] plan:task-count-high',
          `AI planner returned ${plannerResult.tasks.length} tasks (>2x of ${directiveTaskCount}). Falling back to structured mode.`,
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
      // Strict ai-mode: surface the actual failure reason + message so the user
      // sees *why* (spawn_failed / timeout / parse_failed / no_providers / …)
      // instead of a generic "failed" message. structured moda düşülmedi (mode=ai).
      throw new BrainError(
        `AI planner failed (provider=${brainProviderName ?? 'unknown'}, reason=${callResult.reason}). ` +
        `${callResult.message} structured moda düşülmedi (mode=ai).`,
        SprintPhase.PLAN,
      );
    } else {
      // auto mode + AI failure: surface via notify so operator/MCP/AI can see it.
      void notify(
        'phase-change', sprintId,
        '[Brain] plan:ai-failed',
        `AI planner failed (provider=${brainProviderName ?? 'unknown'}, reason=${callResult.reason}): ${callResult.message} — falling back to structured mode.`,
      );
      usedMode = 'fallback';
    }
  }

  // Structured fallback (mode === 'structured' || AI fail + auto)
  if (!plannerResult && (planMode === 'structured' || planMode === 'auto')) {
    const structuredTasks = parsedDirectives;
    const directiveSources: Array<{ title: string; description: string; scope: TaskScope; provider?: import('../core/types.js').ProviderName; forceModel?: import('../core/types.js').ModelType; forceEffort?: import('../core/types.js').TaskEffort; testTarget?: string; forceAgent?: string; forceSkills?: string[]; excludeAgent?: string[]; excludeSkills?: string[]; priority?: import('../core/types.js').TaskPriority; dependencies?: string[]; authMode?: 'subscription' | 'api'; backend?: 'docker' | 'tmux' | 'subprocess'; modelEffort?: string; smoke?: { command: string; expect: string } }> =
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

    // WM-7: resolve the project tech stack ONCE so each task's GO/NO-GO criteria
    // are kind × stack aware — a doc task isn't judged by a build, and a code
    // task is judged against ITS stack's exact build/test commands (never `tsc`
    // on a Go/Python/C++ project). detectFullStack adds the resolved commands;
    // unknown stack → 'generic' (deriver stays neutral). (WM-7 E4)
    const wm7Stack = detectFullStack(projectRoot);
    const wm7StackKind = normalizeTechStack(wm7Stack?.language);
    // sprint-399 G6a: carry `typecheck` through so criteria-deriver can prefer it over
    // `build` (a bare `npx tsc` in a DoD is a mid-sprint dist-emit instruction — N5).
    const wm7Commands = {
      build: wm7Stack?.commands?.build,
      test: wm7Stack?.commands?.test,
      typecheck: wm7Stack?.commands?.typecheck,
    };

    for (const src of directiveSources) {
      // Sprint 236: register locally-pulled ollama tags BEFORE model resolution
      // (resolveTaskModel → registry lookups) so a `- Model: <tag>` not in the
      // static catalog doesn't throw "Unknown model". Adapter-providers only.
      if (src.provider && isAdapterProvider(src.provider) && src.forceModel && !modelRegistry.has(src.forceModel)) {
        ensureOllamaModelRegistered(src.forceModel);
      }

      // born-479 (362-002 MODEL-DROP-FIX): a `- Model:` directive is a
      // deterministic user override and MUST win outright. Previously
      // `resolvedModel` ran forceModel through
      // `recommendation.modelConstraint ?? resolveTaskModel(...)` — when the
      // directive had no explicit `- Provider:` line (e.g. sprint-361's
      // `- Model: gpt-5` + `- Backend: subprocess`, no Provider line),
      // resolveTaskModel defaulted the target provider to the registry
      // default ('claude'), found gpt-5 unavailable there, and silently
      // rewrote it to the claude tier-equivalent ('opus') — while
      // task-router later (correctly) re-inferred provider='codex' from the
      // still-intact forceModel, leaving a written task JSON with a
      // mismatched model/provider pair (task.model='opus', task.provider=
      // 'codex'). forceModel now always resolves verbatim, independent of
      // provider presence/mismatch and of recommendation.modelConstraint
      // (which only ever constrains auto-selected, non-forced models). An
      // honest WARN fires when the model is not registered anywhere in the
      // catalog at all (adapter-provider tags are always accepted — Sprint
      // 236 pass-through contract); the override is preserved either way —
      // silent substitution is never acceptable.
      let resolvedModel: ModelType;
      if (src.forceModel) {
        resolvedModel = src.forceModel;
        const isAdapterPassthrough = !!(src.provider && isAdapterProvider(src.provider));
        if (!isAdapterPassthrough && !modelRegistry.has(src.forceModel)) {
          void notify(
            'progress', sprintId,
            '[Brain] plan:model-override-unknown',
            `Directive "- Model: ${src.forceModel}" for task "${src.title}" is not in the model catalog — preserving the override as-is (no silent fallback). Verify the model id.`,
          );
        }
      } else {
        resolvedModel = recommendation.modelConstraint ??
          resolveTaskModel(src.title, src.description, src.scope, config, parsedPatterns, undefined, undefined, src.provider);
      }
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
        provider: src.provider,
        dependencies: src.dependencies ?? [],
        goNogo: extractGoNogoCriteria(src.description, src.testTarget, {
          kind: rubricTypeToKind(detectTaskType({ scope: src.scope } as Task)),
          stack: wm7StackKind,
          commands: wm7Commands,
        }),
        sprintId,
        initialStatus,
        forceModel: src.forceModel,
        forceEffort: src.forceEffort,
        forceAgent: src.forceAgent,
        forceSkills: src.forceSkills,
        excludeAgent: src.excludeAgent,
        excludeSkills: src.excludeSkills,
        authMode: src.authMode,
        backend: src.backend,
        modelEffort: src.modelEffort,
        // PLAN-W1 Bug 1: thread the parsed Tier-1 Smoke: directive into the task
        // so it lands in the written `.tasks/task-*.json` (previously dropped here,
        // leaving the post-sprint proof-of-function gate with no command to run).
        smoke: src.smoke,
      }, seq++));
    }
  }

  // born-465 wire (359-001's honest debt, CC-paid): resolve every dependency
  // ref (title-prefix / "Task N" / index) to a concrete slot-id IN the written
  // task JSON, so all three runtime layers (wave-enforcement, scheduler graph,
  // continuous-dispatch gate) see the same ids. Unresolvable refs WARN+drop
  // (or throw under dependency_ref_strict) per the 358-010 loud contract.
  normalizeStructuredTaskDependencies(tasks);

  // Deadlock check
  const deadlocks = detectDeadlocks(tasks);
  if (deadlocks.length > 0) {
    throw new BrainError(
      `Circular dependencies detected: ${deadlocks[0]?.detail ?? 'unknown'}`,
      SprintPhase.PLAN,
    );
  }

  // D) Safeguard: warn if AI planner produced >2x the directive task count
  const directiveTaskCountForGuard = parsedDirectives.length;
  if (directiveTaskCountForGuard > 0 && tasks.length > directiveTaskCountForGuard * 2) {
    void notify(
      'progress', sprintId,
      '[Brain] plan:task-overflow',
      `Warning: ${tasks.length} tasks planned but directives only contain ${directiveTaskCountForGuard} tasks (>2x). Review the plan for excessive task generation.`,
    );
  }

  // ─── Routing: V2 intent-based engine (routeTaskV2) ────────────────────────
  // V1 (keyword-based DecisionOrchestrator) was removed by ROUTE-V1-PURGE
  // (ADR-G-006); config validation accepts only 'v2', so the former
  // `if (routingVersion === 'v2')` guard was permanently true and was
  // collapsed here (ROUTE-V1-DEADBRANCH-COLLAPSE). routeTaskV2's returned
  // `decision.routingVersion` and the routing-meta stamp below are both
  // `'v2'` (ROUTING-VERSION-LABEL, ADR-G-006 P2 — reconciled).
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
        // Lean-A: never inject a legacy/stale unconditional (`when: {}`) rule — it
        // matches every task and reintroduces the synergy/conflict runaway.
        if (isUnconditionalRule(evolved.rule as { when?: Record<string, unknown> })) {
          debugLog(
            'planSprint:evolved-rules',
            `Skipped unconditional (empty-when) rule '${(evolved.rule as { name?: string }).name ?? evolved.entityId}'`,
          );
          continue;
        }
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

    // ADR-075 routing-balance gate (343-007): accumulate per-task agent
    // selections so the affinity distribution can be measured BEFORE the flag
    // is defaulted on. In-memory, non-blocking, never throws.
    const affinitySink = new InMemoryAgentSelectionSink();
    const skillAgentAffinity = config.routing?.skill_agent_affinity ?? false;

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
          // ADR-075 (343-007): thread the skill→agent affinity flag. Default-off →
          // option is false → byte-identical routing (engine already guards on it).
          skillAgentAffinity,
          sprintId,
          taskId: task.id,
          projectRoot,
        });

        task.assignedAgent = decision.agentId ?? 'generic';
        task.assignedSkills = decision.skillIds;

        // Routing-balance observability — the affinity reasoning line is emitted
        // only for the WINNING agent that actually received the bonus, so its
        // presence is a faithful per-task "affinity influenced this choice" signal.
        recordAgentSelection(affinitySink, {
          taskId: task.id,
          agentId: task.assignedAgent,
          affinityApplied: decision.reasoning.some((r) => r.includes('skill-affinity:')),
        });
        task.routingMeta = {
          taskDNA: decision.taskDNA,
          confidence: decision.agentConfidence,
          routingVersion: 'v2',
          ...(decision.overrideWarnings && decision.overrideWarnings.length > 0
            ? { overrideWarnings: decision.overrideWarnings }
            : {}),
        };

        if (decision.overrideWarnings && decision.overrideWarnings.length > 0) {
          for (const w of decision.overrideWarnings) {
            debugLog('planSprint:override-warning', `[${task.id}] ${w}`);
          }
        }

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
        // Observability: surface routeTaskV2's skill scoring rationale (why these
        // skills won / whether the floor fired) so the live plan path is debuggable
        // without re-deriving it in isolation. Dev-only (DECKENT_DEBUG).
        debugLog(
          'planSprint:routing-v2-skills',
          `Task ${task.id} skill reasoning: ` +
          decision.reasoning
            .filter(r => /skill|floor|budget|bonus|threshold|mismatch|excluded/i.test(r))
            .join(' | '),
        );
      } catch (taskErr) {
        debugLog('planSprint:routing-v2', `V2 routing failed for task ${task.id}: ${taskErr}`);
      }
    }

    // ADR-075 routing-balance gate (343-007): surface the agent-distribution
    // snapshot (counts per agent + % affinity-influenced) for the dogfood
    // measurement that must precede any default-on. Dev-only (DECKENT_DEBUG).
    debugLog(
      'planSprint:routing-affinity',
      `affinity=${skillAgentAffinity} distribution: ${JSON.stringify(summarizeAgentDistribution(affinitySink.records))}`,
    );

    // G-series plan-time prompt-gate (G1a persona + G1d decision-space + G1c premise):
    // flag every finalized task's (persona × intent) fit, goCriteria decision-shape, and
    // stale "X is missing" premises — source-agnostic (forceAgent AND router picks).
    // Surfaced by the caller (deckent plan / MCP); blocks on BLOCK unless acknowledged.
    // sprint-399 scope-contract lints: give the gate the real tracked-file set
    // (fail-soft — a git failure just skips the two scope lints, never blocks).
    let gateTrackedFiles: string[] | undefined;
    {
      const ls = spawnSync('git', ['ls-files'], {
        cwd: projectRoot, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024, timeout: 5000,
      });
      if (ls.status === 0 && typeof ls.stdout === 'string') {
        gateTrackedFiles = ls.stdout.split('\n').filter(Boolean);
      }
    }
    promptGate = evaluatePromptGate({
      tasks,
      agentPool: pool,
      acknowledgePromptGate: options?.acknowledgePromptGate,
      trackedFiles: gateTrackedFiles,
      // G1c: bounded, fail-soft repo probe — count tracked files containing a symbol.
      // spawnSync git-grep exits 1 on no-match (→ status !== 0 → 0), so a missing symbol
      // or any error never invents a finding.
      probeRepo: (symbol: string): number => {
        if (!symbol || symbol.length < 4) return 0;
        const r = spawnSync('git', ['grep', '-I', '-l', '-F', '--', symbol], {
          cwd: projectRoot, encoding: 'utf-8', timeout: 2000,
        });
        if (r.status !== 0 || typeof r.stdout !== 'string') return 0;
        return r.stdout.split('\n').filter(Boolean).length;
      },
    });
    if (promptGate.findings.length > 0) {
      debugLog(
        'planSprint:prompt-gate',
        `${promptGate.findings.length} finding(s), ${promptGate.blockers.length} blocker(s), ok=${promptGate.ok}`,
      );
    }
  } catch (poolErr) {
    debugLog('planSprint:routing-v2', `V2 routing pool loading failed: ${poolErr}`);
  }

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

    // Sprint 179 W1-2 — re-plan orphan cleanup. Tasks rewritten above; remove
    // stale `task-{sprintNum}-NNN.json` siblings whose id slipped out of the
    // new plan (cross-sprint files left intact).
    const newTaskIds = new Set(tasks.map(t => t.id));
    const orphans = cleanupOrphanTaskFiles(projectRoot, sprintId, newTaskIds);
    if (orphans.length > 0) {
      debugLog('planSprint:orphan-cleanup', `Removed ${orphans.length} orphan task file(s) for ${sprintId}`);
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
    promptGate,
  };
}

/**
 * A single router-level override warning (F8, Sprint 182 —
 * forceAgent/forceSkills semantic-mismatch advisory), tagged with the task it
 * belongs to.
 */
export interface OverrideWarningEntry {
  taskId: string;
  message: string;
}

/**
 * born-595 (395-005): flatten each task's `routingMeta.overrideWarnings` into a
 * flat, task-id-tagged list for surfacing at the `deckent plan` CLI surface.
 *
 * `overrideWarnings` are already produced by `routeTaskV2` / the routing loop
 * above (attached to `task.routingMeta.overrideWarnings`) — this is a read-only
 * projection over that existing data, not a new source of warnings. Task order
 * and per-task warning order are preserved.
 * @param tasks - Sprint tasks (post-routing, i.e. `sprint.tasks`)
 * @returns Flattened `{ taskId, message }` entries, in task/warning order
 */
export function collectOverrideWarnings(tasks: Task[]): OverrideWarningEntry[] {
  const entries: OverrideWarningEntry[] = [];
  for (const task of tasks) {
    const warnings = task.routingMeta?.overrideWarnings;
    if (!warnings || warnings.length === 0) continue;
    for (const message of warnings) {
      entries.push({ taskId: task.id, message });
    }
  }
  return entries;
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
 * Remove stale `.tasks/task-{sprintNum}-NNN.json` files that belong to the
 * given sprint but are not part of the freshly-planned task ID set.
 *
 * Sprint 179 W1-2 — when Brain re-plans a sprint (e.g. after auto-debt
 * injection shifts the id-slot allocation), task files from the previous
 * plan attempt could linger on disk and confuse downstream tooling (the
 * Auditor would otherwise see ghost workers). This helper deletes them.
 *
 * Cross-sprint isolation: files whose filename prefix does not match the
 * current sprint number are NEVER touched, so co-resident sprint archives
 * remain safe. Sibling files (`.hb`, `.result`, `.plan`) are ignored — this
 * helper only scans `task-*.json`.
 *
 * @param projectRoot Project root directory containing `.tasks/`.
 * @param sprintId Sprint identifier (e.g. `sprint-179`). Sprint number is
 *   derived from the trailing numeric segment.
 * @param newTaskIds Set of task IDs that survived the latest plan; files
 *   whose parsed `task.id` is absent from this set are removed.
 * @param opts.dryRun When true, return the would-be removal list without
 *   touching disk.
 * @returns Absolute paths of the (would-be) removed task files.
 */
export function cleanupOrphanTaskFiles(
  projectRoot: string,
  sprintId: string,
  newTaskIds: Set<string>,
  opts?: { dryRun?: boolean },
): string[] {
  const tasksPath = join(projectRoot, TASKS_DIR);
  if (!existsSync(tasksPath)) return [];

  const sprintNum = sprintId.replace(/^sprint-/, '');
  if (!sprintNum) return [];
  const sprintPrefix = `task-${sprintNum}-`;

  const removed: string[] = [];
  const files = readdirSync(tasksPath).filter(
    f => f.startsWith(sprintPrefix) && f.endsWith('.json'),
  );

  for (const file of files) {
    const filePath = join(tasksPath, file);
    let taskId: string | undefined;
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const task = JSON.parse(raw);
      taskId = typeof task?.id === 'string' ? task.id : undefined;
    } catch (e) {
      debugLog('cleanupOrphanTaskFiles:parseTaskFile', e);
      continue;
    }
    if (!taskId || newTaskIds.has(taskId)) continue;

    removed.push(filePath);
    if (!opts?.dryRun) {
      try {
        unlinkSync(filePath);
      } catch (e) {
        debugLog('cleanupOrphanTaskFiles:unlink', e);
      }
    }
  }

  return removed;
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

// ═══ Sprint 179 W1-1 — Auto-debt scope inheritance + verified-no-result skip ═══

/**
 * Result of injecting CRITICAL debt items into the sprint as priority fix tasks.
 */
export interface DebtInjectionResult {
  /** Newly created Task objects ready to be added to the sprint. */
  tasks: Task[];
  /** Next available sequence number after injection (callers continue from here). */
  nextSeq: number;
  /** Debt IDs that were intentionally skipped (e.g. verified-no-result). */
  skipped: string[];
  /**
   * born-603: debt IDs skipped as an "honest no-op fix-wave echo" (heuristic
   * text-pattern classification — see {@link isHonestNoopFixWaveEcho}).
   * Deliberately kept SEPARATE from `skipped`: `planSprint()` resolves every
   * id in `skipped` via `resolveDebt` (permanent closure), but this
   * classification is a text-pattern guess, not a verified structural class
   * — a false positive here must stay OPEN and get re-evaluated next sprint,
   * not close real debt forever. Count this array's length for reporting.
   */
  skippedNoop: string[];
}

/**
 * Build the broad legacy fallback scope used when a debt item carries no
 * `originScope` (e.g. older debt rows persisted before Sprint 179 W1-1).
 */
function legacyFallbackScope(): TaskScope {
  return { directories: ['src/'], filesRead: [], filesWrite: ['src/'] };
}

// born-603 (396-003): a fix-wave task (`<id>-fix` / `<id>-xfix`) that
// investigated and found nothing wrong still produces a GO_WITH_TECH_DEBT /
// NO_GO ledger row (recordDebtEntry has no "no-defect" DebtClass yet — that
// producer-side fix is tracked separately, out of this task's scope).
// sprint-395 saw such a row re-injected as a fresh CRITICAL "Priority fix for
// critical debt item" task, which just spawns another no-op investigation
// worker that reports the same "no defect" finding — an infinite low-value
// loop. Conjunctive on purpose: an origin-suffix match alone would ALSO skip
// real fix-wave defects (silently dropping actionable debt); a content match
// alone would ALSO skip ordinary (non-fix-wave) debt whose note happens to
// mention "no defect" about something unrelated. Both signals together
// narrow this to the exact sprint-395 shape.
const FIX_WAVE_ORIGIN_RE = /-(fix|xfix)$/;
const NO_DEFECT_NOTE_RE = /no defect|no source change|no code change/i;

/**
 * True when `item` is an honest no-op echo from a fix-wave task: the origin
 * task id is itself a priority-fix (`-fix`/`-xfix`), AND the debt note says
 * no defect/source/code change was found. See {@link FIX_WAVE_ORIGIN_RE}.
 */
function isHonestNoopFixWaveEcho(item: DebtItem): boolean {
  return FIX_WAVE_ORIGIN_RE.test(item.originTaskId) && NO_DEFECT_NOTE_RE.test(item.description);
}

/**
 * Translate CRITICAL debt items into priority fix tasks for the next sprint.
 *
 * Sprint 179 W1-1 behaviour:
 *  - `class === 'verified-no-result'` → skip (honest closure, no work needed).
 *  - `class === 'timeout-partial'` → skip (Sprint 364): a killed-worker partial
 *    diff already accepted into the tree — no described defect, so a forced fix
 *    task only spawns a no-op worker that re-injects every sprint.
 *  - born-603 (Sprint 396): honest no-op fix-wave echo (see
 *    {@link isHonestNoopFixWaveEcho}) → skip WITHOUT resolving (tracked in
 *    `skippedNoop`, not `skipped` — see {@link DebtInjectionResult}).
 *  - `originScope` present → inherit `directories` + `filesWrite`; `filesRead`
 *    mirrors `directories` so the worker can read the area it must write to.
 *  - `originScope` absent → broad legacy fallback `src/` (matches behaviour
 *    expected of pre-W1-1 debt rows so they still get a fix attempt).
 */
export function injectCriticalDebtTasks(
  debt: DebtItem[],
  sprintId: string,
  defaultModel: ModelType,
  startingSeq: number,
  initialStatus: TaskStatus,
): DebtInjectionResult {
  const tasks: Task[] = [];
  const skipped: string[] = [];
  const skippedNoop: string[] = [];
  let seq = startingSeq;

  for (const item of debt) {
    if (item.priority !== DebtPriority.CRITICAL || item.resolved) continue;

    // Honest closure: verified-no-result debts have no follow-up work, and
    // timeout-partial debts (Sprint 364) record a killed-worker event whose
    // partial diff reconciliation already accepted into the tree — neither has a
    // described code defect, so injecting a CRITICAL fix task only spawns a
    // no-op worker that flails and re-injects every sprint.
    if (item.class === 'verified-no-result' || item.class === 'timeout-partial') {
      skipped.push(item.id);
      continue;
    }

    // born-603: honest no-op fix-wave echo — a heuristic (text-pattern)
    // classification, not a verified structural class, so it goes into
    // `skippedNoop` (never resolved) instead of `skipped` (permanently
    // resolved by planSprint's caller loop).
    if (isHonestNoopFixWaveEcho(item)) {
      skippedNoop.push(item.id);
      continue;
    }

    const hasOriginScope = !!item.originScope
      && (item.originScope.directories.length > 0 || item.originScope.filesWrite.length > 0);

    const scope: TaskScope = hasOriginScope
      ? {
          directories: [...item.originScope!.directories],
          filesRead: [...item.originScope!.directories],
          filesWrite: [...item.originScope!.filesWrite],
        }
      : legacyFallbackScope();

    const scopeNote = hasOriginScope
      ? `Origin scope inherited (directories=[${scope.directories.join(', ')}], filesWrite=[${scope.filesWrite.join(', ')}]).`
      : 'No origin scope on debt — broad legacy fallback (src/) applied.';

    // born-603: `item.description` now carries the full debt note (mapper
    // change in readContext) rather than an 80-char-sliced title, so keep the
    // task TITLE compact (it previously was, de-facto, via the DB's title
    // slice) while the task DESCRIPTION carries the full note verbatim
    // instead of the old generic "Priority fix for critical debt item X"
    // placeholder — the worker sees exactly what was previously found.
    const titleNote = item.description.length > 100
      ? `${item.description.slice(0, 100)}…`
      : item.description;

    tasks.push(createTask({
      title: `Fix debt: ${titleNote}`,
      description: `${item.description}\n\n${scopeNote}`,
      model: defaultModel,
      effort: 'high',
      priority: 'CRITICAL',
      reason: `Critical debt open for ${item.sprintsOpen} sprints`,
      scope,
      dependencies: [],
      goNogo: { goCriteria: 'Debt resolved', noGoCriteria: 'Debt still present', techDebtAcceptable: '' },
      sprintId,
      isPriorityFix: true,
      fixForTaskId: item.originTaskId,
      initialStatus,
    }, seq++));
  }

  return { tasks, nextSeq: seq, skipped, skippedNoop };
}
