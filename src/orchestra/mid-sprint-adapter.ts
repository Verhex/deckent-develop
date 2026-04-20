// ─── Mid-Sprint Adapter ─────────────────────────────────────────────────────
// Real-time rerouting when a task fails during sprint execution.
// If task gets NO_GO, suggests alternative agent/skill for retry.
// Sprint 145: reconcileSpuriousNoGo — recover partial work from TIMEOUT_WITH_WORK / false NO_GO.

import type { Task, TaskResult } from '../core/task-types.js';
import type { AgentPool } from '../core/agent-types.js';
import type { SkillDefinition } from '../core/skill-types.js';
import type { RoutingDecision, UserOverride, TaskDNA } from '../core/routing-types.js';
import { routeTaskV2, type RoutingOptions } from '../core/routing-engine.js';
import type { OutcomeTracker } from './outcome-tracker.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { debugLog } from '../core/utils.js';
import { execSync } from 'node:child_process';

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

    // Confidence threshold: only reroute when at least one dimension has medium+ confidence
    const confidenceOk =
      newDecision.agentConfidence === 'high' || newDecision.agentConfidence === 'medium' ||
      newDecision.skillConfidence === 'high' || newDecision.skillConfidence === 'medium';

    if (!confidenceOk) {
      debugLog('mid-sprint-adapter:shouldReroute', `Skipping reroute for task ${task.id}: insufficient confidence (agent=${newDecision.agentConfidence}, skill=${newDecision.skillConfidence})`);
      return { should: false, reason: 'No confident alternative available' };
    }

    const newAttempts = attempts + 1;
    this.rerouteAttempts.set(task.id, newAttempts);

    // Track reroute count in task routing metadata
    if (!task.routingMeta) task.routingMeta = {};
    task.routingMeta.rerouteCount = newAttempts;

    const reason = `Rerouting: agent ${task.assignedAgent}→${newDecision.agentId}, skills [${(task.assignedSkills ?? []).join(',')}]→[${newDecision.skillIds.join(',')}] (attempt ${newAttempts}/${this.maxReroutesPerTask})`;
    debugLog('mid-sprint-adapter:shouldReroute', reason);

    return { should: true, reason, newDecision };
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

// ─── Spurious NO_GO Reconciliation Helper ──────────────────────────────────
// Sprint 136 T-003: helper written. Sprint 137: "wire live" claimed.
// Sprint 144: dogfood proved dead. Sprint 145: 5th dogfood attempt — wire for real.

/** Result of the reconciliation attempt */
export interface ReconciliationResult {
  /** Final decision after reconciliation */
  decision: 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** Whether the original NO_GO/TIMEOUT_WITH_WORK was reconciled */
  reconciled: boolean;
  /** Human-readable explanation of the reconciliation outcome */
  notes: string;
  /** Git diff stats: number of lines changed */
  linesChanged: number;
  /** Git diff stats: files changed */
  filesChanged: string[];
  /** Whether tsc --noEmit passed */
  tscPassed: boolean;
  /** Vitest pass ratio (0–1), null if not run */
  vitestPassRatio: number | null;
  /** Whether scope compliance passed */
  scopeCompliant: boolean;
}

/** Options for dependency injection in tests */
export interface ReconciliationDeps {
  /** Override for git diff --stat execution */
  getGitDiffStats?: (projectRoot: string, scope: Task['scope']) => { linesChanged: number; filesChanged: string[] };
  /** Override for tsc --noEmit check */
  runTscCheck?: (projectRoot: string) => boolean;
  /** Override for vitest scope check */
  runVitestScopeCheck?: (projectRoot: string, scopeDirs: string[]) => { passRatio: number; passed: boolean };
}

/**
 * Get git diff stats for files within the task scope.
 * Returns lines changed and files changed.
 */
function defaultGetGitDiffStats(projectRoot: string, scope: Task['scope']): { linesChanged: number; filesChanged: string[] } {
  try {
    const dirs = scope?.directories ?? [];
    const pathArgs = dirs.length > 0 ? ` -- ${dirs.join(' ')}` : '';
    const output = execSync(`git diff --stat HEAD${pathArgs}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 10_000,
    });

    const lines = output.trim().split('\n');
    const filesChanged: string[] = [];
    let linesChanged = 0;

    for (const line of lines) {
      // Match lines like: src/file.ts | 42 ++++----
      const fileMatch = line.match(/^\s*(.+?)\s+\|\s+(\d+)/);
      if (fileMatch && fileMatch[1] && fileMatch[2]) {
        filesChanged.push(fileMatch[1].trim());
        linesChanged += parseInt(fileMatch[2], 10);
      }
    }

    return { linesChanged, filesChanged };
  } catch {
    return { linesChanged: 0, filesChanged: [] };
  }
}

/**
 * Run tsc --noEmit and return whether it passed.
 */
function defaultRunTscCheck(projectRoot: string): boolean {
  try {
    execSync('npx tsc --noEmit', {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 60_000,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run vitest for scope-specific files and return pass ratio.
 */
function defaultRunVitestScopeCheck(projectRoot: string, scopeDirs: string[]): { passRatio: number; passed: boolean } {
  try {
    // Build test path patterns from scope directories
    const testPatterns = scopeDirs
      .filter(d => d.startsWith('src/') || d.startsWith('tests/'))
      .map(d => d.startsWith('tests/') ? d : d.replace(/^src\//, 'tests/'));

    if (testPatterns.length === 0) {
      return { passRatio: 1, passed: true };
    }

    const output = execSync(`npx vitest run --reporter=json ${testPatterns.join(' ')}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: 'pipe',
    });

    const jsonMatch = output.match(/\{[\s\S]*"numPassedTests"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { numPassedTests: number; numTotalTests: number };
      const total = parsed.numTotalTests || 1;
      const ratio = parsed.numPassedTests / total;
      return { passRatio: ratio, passed: ratio >= 0.5 };
    }
    return { passRatio: 0, passed: false };
  } catch {
    // vitest exits with non-zero on test failures — try to parse output
    return { passRatio: 0, passed: false };
  }
}

/**
 * Check scope compliance: all changed files must be within the task scope.
 */
function checkScopeCompliance(filesChanged: string[], scope: Task['scope']): boolean {
  if (filesChanged.length === 0) return true;
  const dirs = scope?.directories ?? [];
  const writeFiles = scope?.filesWrite ?? [];

  for (const file of filesChanged) {
    const inDir = dirs.some(d => file.startsWith(d));
    const inWrite = writeFiles.some(w => file === w);
    if (!inDir && !inWrite) return false;
  }
  return true;
}

/**
 * Reconcile a spurious NO_GO or TIMEOUT_WITH_WORK result.
 *
 * Pipeline:
 * 1. git diff --stat → check if meaningful work exists
 * 2. Scope-compliance → filesChanged ⊂ task.scope
 * 3. tsc --noEmit → syntax/type check passes
 * 4. vitest scope → test pass ratio >= 50%
 *
 * If steps 1+2+3 PASS and step 4 is partial PASS (>50%):
 *   → GO_WITH_TECH_DEBT with notes explaining gaps
 *
 * @param result - The task result with NO_GO or TIMEOUT_WITH_WORK
 * @param task - The task definition (for scope info)
 * @param projectRoot - Project root path
 * @param deps - Optional dependency injection for testing
 */
export function reconcileSpuriousNoGo(
  result: TaskResult,
  task: Task,
  projectRoot: string,
  deps?: ReconciliationDeps,
): ReconciliationResult {
  const getGitDiff = deps?.getGitDiffStats ?? defaultGetGitDiffStats;
  const runTsc = deps?.runTscCheck ?? defaultRunTscCheck;
  const runVitest = deps?.runVitestScopeCheck ?? defaultRunVitestScopeCheck;

  // Step 1: Check git diff — is there meaningful work?
  const diffStats = getGitDiff(projectRoot, task.scope);

  if (diffStats.linesChanged === 0 || diffStats.filesChanged.length === 0) {
    debugLog('reconcile:spurious-nogo', `Task ${task.id}: no git diff — cannot reconcile`);
    return {
      decision: 'NO_GO',
      reconciled: false,
      notes: 'No file changes detected — NO_GO stands',
      linesChanged: 0,
      filesChanged: [],
      tscPassed: false,
      vitestPassRatio: null,
      scopeCompliant: true,
    };
  }

  // Step 2: Scope compliance
  const scopeCompliant = checkScopeCompliance(diffStats.filesChanged, task.scope);
  if (!scopeCompliant) {
    debugLog('reconcile:spurious-nogo', `Task ${task.id}: scope violation — files outside allowed scope`);
    return {
      decision: 'NO_GO',
      reconciled: false,
      notes: `Scope violation: changed files outside task scope (${diffStats.filesChanged.join(', ')}) — RBAC alert`,
      linesChanged: diffStats.linesChanged,
      filesChanged: diffStats.filesChanged,
      tscPassed: false,
      vitestPassRatio: null,
      scopeCompliant: false,
    };
  }

  // Step 3: tsc --noEmit
  const tscPassed = runTsc(projectRoot);
  if (!tscPassed) {
    debugLog('reconcile:spurious-nogo', `Task ${task.id}: tsc --noEmit failed — cannot reconcile`);
    return {
      decision: 'NO_GO',
      reconciled: false,
      notes: 'tsc --noEmit failed — type errors present, NO_GO stands',
      linesChanged: diffStats.linesChanged,
      filesChanged: diffStats.filesChanged,
      tscPassed: false,
      vitestPassRatio: null,
      scopeCompliant: true,
    };
  }

  // Step 4: vitest scope check
  const scopeDirs = task.scope?.directories ?? [];
  const vitestResult = runVitest(projectRoot, scopeDirs);
  const vitestPassRatio = vitestResult.passRatio;

  // Decision: 1+2+3 PASS, 4 partial PASS (>50%) → GO_WITH_TECH_DEBT
  if (vitestResult.passed) {
    const gapNotes: string[] = [];
    if (vitestPassRatio < 1) {
      gapNotes.push(`vitest pass ratio ${Math.round(vitestPassRatio * 100)}% (< 100%)`);
    }
    if (result.notes) {
      gapNotes.push(`original notes: ${result.notes}`);
    }

    const reconcileNotes = `Spurious NO_GO reconciled: ${diffStats.linesChanged} lines changed across ${diffStats.filesChanged.length} files, tsc PASS, vitest ${Math.round(vitestPassRatio * 100)}% pass. ${gapNotes.join('; ')}`;

    debugLog('reconcile:spurious-nogo', `Task ${task.id}: reconciled → GO_WITH_TECH_DEBT`);

    return {
      decision: 'GO_WITH_TECH_DEBT',
      reconciled: true,
      notes: reconcileNotes,
      linesChanged: diffStats.linesChanged,
      filesChanged: diffStats.filesChanged,
      tscPassed: true,
      vitestPassRatio,
      scopeCompliant: true,
    };
  }

  // vitest < 50% pass → NO_GO
  debugLog('reconcile:spurious-nogo', `Task ${task.id}: vitest ${Math.round(vitestPassRatio * 100)}% < 50% — NO_GO`);
  return {
    decision: 'NO_GO',
    reconciled: false,
    notes: `vitest pass ratio ${Math.round(vitestPassRatio * 100)}% < 50% — insufficient test coverage for reconciliation`,
    linesChanged: diffStats.linesChanged,
    filesChanged: diffStats.filesChanged,
    tscPassed: true,
    vitestPassRatio,
    scopeCompliant: true,
  };
}
