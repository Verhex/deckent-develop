// ─── Mid-Sprint Adapter ─────────────────────────────────────────────────────
// Real-time rerouting when a task fails during sprint execution.
// If task gets NO_GO, suggests alternative agent/skill for retry.
// Sprint 145: reconcileSpuriousNoGo — recover partial work from TIMEOUT_WITH_WORK / false NO_GO.

import type { Task, TaskResult, EvaluationResult } from '../core/task-types.js';
import type { AgentPool } from '../core/agent-types.js';
import type { SkillDefinition } from '../core/skill-types.js';
import type { RoutingDecision, UserOverride, TaskDNA } from '../core/routing-types.js';
import { routeTaskV2, type RoutingOptions } from '../core/routing-engine.js';
import { enforceModelTierGuard } from '../core/model-tier-guard.js';
import { getModelProvider } from '../core/model-equivalence.js';
import { modelRegistry } from '../core/model-registry.js';
import { coerceNotesToString } from '../core/task-result-schema.js';
import { resolveWithOverflow, type OverflowOptions, type OverflowResolution } from '../core/provider-overflow.js';
import type { RateLimitState } from '../core/token-quota.js';
import type { OutcomeTracker } from './outcome-tracker.js';
import type { ResolvedConfig } from '../core/config-types.js';
import { debugLog } from '../core/utils.js';
import { spawn } from 'node:child_process';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RerouteResult {
  should: boolean;
  reason: string;
  newDecision?: RoutingDecision;
}

// ─── Rate-Limit Failover ─────────────────────────────────────────────────────
// Synthetic RateLimitState that signals quota exhaustion (retryAfter=60).
// Used when no real rate-limit snapshot is available but the worker notes
// contain a 429 / rate-limit string.
const RATE_LIMIT_EXHAUSTED_STATE: RateLimitState = {
  retryAfter: 60,
  requestsLimit: null,
  requestsRemaining: null,
  requestsReset: null,
  inputTokensLimit: null,
  inputTokensRemaining: null,
  inputTokensReset: null,
  outputTokensLimit: null,
  outputTokensRemaining: null,
  outputTokensReset: null,
  tokensLimit: null,
  tokensRemaining: null,
  tokensReset: null,
};

/**
 * Detect whether a task result signals a 429 / rate-limit error.
 * Inspects the free-text notes field written by workers.
 */
export function is429Error(result: TaskResult): boolean {
  // born-484: notes can arrive as an array from provider-CLI workers.
  const msg = coerceNotesToString(result.notes).toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('too many requests') ||
    msg.includes('ratelimit')
  );
}

/**
 * Apply rate-limit failover for a failed task in the FIX phase.
 *
 * When a worker result signals a 429 / quota exhaustion (via notes text or an
 * explicit `rateLimitState`), calls `resolveWithOverflow` to find an
 * equivalent-tier API-provider fallback (e.g. opus@claude-sub → gpt-5@codex-api).
 *
 * Returns the OverflowResolution when an overflow happened, or null when:
 *  - no 429 signal is present in notes AND no rateLimitState is provided, OR
 *  - resolveWithOverflow found no equivalent fallback (no_equivalent / already_api).
 *
 * @param task           The original failed task.
 * @param result         The worker result (notes inspected for 429 pattern).
 * @param rateLimitState Optional real rate-limit snapshot; if absent and notes
 *                       contain a 429 pattern a synthetic EXHAUSTED state is used.
 * @param options        Forwarded to resolveWithOverflow (apiProvider, estimatedTokens).
 */
export function applyRateLimitFailover(
  task: Task,
  result: TaskResult,
  rateLimitState?: RateLimitState | null,
  options?: OverflowOptions,
): OverflowResolution | null {
  const has429 = is429Error(result);
  // No signal at all — skip
  if (!has429 && (rateLimitState == null)) {
    return null;
  }
  // Prefer the real snapshot when provided; fall back to synthetic exhausted state
  const state: RateLimitState = rateLimitState ?? (has429 ? RATE_LIMIT_EXHAUSTED_STATE : null!);

  const resolution = resolveWithOverflow(task, modelRegistry, state, options);
  if (!resolution.overflowed) {
    return null;
  }

  debugLog(
    'mid-sprint-adapter:429-failover',
    `Task ${task.id}: 429 failover ${task.model}@${String(task.provider)} → ${resolution.fallbackModel}@${String(resolution.fallbackProvider)}`,
  );

  return resolution;
}

// Re-export type so callers can reference the resolution shape
export type { OverflowResolution as RateLimitFailoverResolution };

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
   * Handle 429 / rate-limit failover for a failed task in the FIX phase.
   *
   * Detects rate-limit errors in the task result and delegates to
   * `applyRateLimitFailover` to switch the task to an equivalent-tier API
   * provider (e.g. opus@claude-sub → gpt-5@codex-api).
   *
   * @returns The new overflowed task if failover was applied, null otherwise.
   */
  handleRateLimitFailover(
    task: Task,
    result: TaskResult,
    rateLimitState?: RateLimitState | null,
  ): Task | null {
    const resolution = applyRateLimitFailover(task, result, rateLimitState);
    return resolution ? resolution.task : null;
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

    // MODEL-GUARD: re-routing must NOT leave a code-development task on an
    // economy model (Sprint-283: FIX rerouted a tsx task to haiku + doc-writer).
    // The reroute keeps the plan-time model; re-assert the economy floor here so
    // the floor holds across the FIX path too. An explicit user pin (forceModel)
    // is honored.
    if (task.model) {
      const provider = modelRegistry.has(task.model) ? getModelProvider(task.model) : undefined;
      const guarded = enforceModelTierGuard({
        taskKind: task.type,
        scope: task.scope,
        model: task.model,
        targetProvider: provider,
        explicitOverride: Boolean(task.forceModel),
      });
      if (guarded.upgraded) {
        task.model = guarded.model;
        debugLog('mid-sprint-adapter:tier-guard', `Task ${task.id}: ${guarded.reason}`);
      }
    }

    debugLog(
      'mid-sprint-adapter:apply',
      `Task ${task.id} rerouted → agent=${task.assignedAgent}, skills=[${task.assignedSkills.join(', ')}], model=${task.model}`,
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

/**
 * Options for dependency injection in tests.
 *
 * R8/ADR-087: the subprocess overrides are async. The default runners moved off
 * `spawnSync` (which froze the Brain event loop for up to git10+tsc60+vitest120 ≈
 * 190s during EVALUATE spurious-NO_GO reconciliation) onto async `spawn`. Test
 * stubs may still return a plain value — `await` on a non-Promise is a no-op, so
 * `() => ({ passRatio: 1, passed: true })` and `async () => (...)` both satisfy
 * these signatures.
 */
export interface ReconciliationDeps {
  /** Override for git diff --stat execution */
  getGitDiffStats?: (projectRoot: string, scope: Task['scope']) => { linesChanged: number; filesChanged: string[] } | Promise<{ linesChanged: number; filesChanged: string[] }>;
  /** Override for tsc --noEmit check */
  runTscCheck?: (projectRoot: string) => boolean | Promise<boolean>;
  /** Override for vitest scope check */
  runVitestScopeCheck?: (projectRoot: string, scopeDirs: string[]) => { passRatio: number; passed: boolean } | Promise<{ passRatio: number; passed: boolean }>;
}

/** Captured result of an async subprocess run (mirrors the spawnSync fields these readers consult). */
interface SubprocessRun {
  status: number | null;
  stdout: string;
  /** True when spawn failed or the timeout SIGKILL fired (maps to spawnSync's `error` field). */
  error: boolean;
}

/**
 * Injectable async command runner — replaces `spawnSync` to keep the event loop
 * responsive (R8/ADR-087). Defaults to {@link defaultSubprocessRunner}; tests pass
 * a fake to drive parsing without a real subprocess.
 */
export type SubprocessRunner = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number },
) => Promise<SubprocessRun>;

/**
 * Default runner: async `spawn`. Collects stdout off the stream, enforces the
 * timeout with a SIGKILL timer, and resolves (never rejects) so the callers'
 * fail-safe `{ ...defaults }` behavior is preserved exactly.
 */
const defaultSubprocessRunner: SubprocessRunner = (cmd, args, { cwd, timeoutMs }) =>
  new Promise((resolve) => {
    let stdout = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      debugLog('mid-sprint-adapter:spawn', e);
      resolve({ status: null, stdout: '', error: true });
      return;
    }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.on('error', (e) => { clearTimeout(timer); debugLog('mid-sprint-adapter:spawn', e); resolve({ status: null, stdout, error: true }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ status: code, stdout, error: timedOut }); });
  });

/**
 * Get git diff stats for files within the task scope.
 * Returns lines changed and files changed.
 */
export async function defaultGetGitDiffStats(
  projectRoot: string,
  scope: Task['scope'],
  runner: SubprocessRunner = defaultSubprocessRunner,
): Promise<{ linesChanged: number; filesChanged: string[] }> {
  try {
    const dirs = scope?.directories ?? [];
    // ADR-006: array-form spawn, no shell — dirs are pathspecs after `--`,
    // never interpolated into a command string.
    const args = ['diff', '--stat', 'HEAD'];
    if (dirs.length > 0) args.push('--', ...dirs);
    const res = await runner('git', args, { cwd: projectRoot, timeoutMs: 10_000 });
    if (res.error || res.status !== 0 || typeof res.stdout !== 'string') {
      return { linesChanged: 0, filesChanged: [] };
    }
    const output = res.stdout;

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
export async function defaultRunTscCheck(
  projectRoot: string,
  runner: SubprocessRunner = defaultSubprocessRunner,
): Promise<boolean> {
  try {
    // ADR-006: array-form spawn, no shell. Static args (no task input).
    const res = await runner('npx', ['tsc', '--noEmit'], { cwd: projectRoot, timeoutMs: 60_000 });
    return !res.error && res.status === 0;
  } catch {
    return false;
  }
}

/**
 * Run vitest for scope-specific files and return pass ratio.
 */
export async function defaultRunVitestScopeCheck(
  projectRoot: string,
  scopeDirs: string[],
  runner: SubprocessRunner = defaultSubprocessRunner,
): Promise<{ passRatio: number; passed: boolean }> {
  try {
    // Build test path patterns from scope directories
    const testPatterns = scopeDirs
      .filter(d => d.startsWith('src/') || d.startsWith('tests/'))
      .map(d => d.startsWith('tests/') ? d : d.replace(/^src\//, 'tests/'));

    if (testPatterns.length === 0) {
      return { passRatio: 1, passed: true };
    }

    // ADR-006: array-form spawn, no shell — testPatterns are argv items.
    const res = await runner('npx', ['vitest', 'run', '--reporter=json', ...testPatterns], { cwd: projectRoot, timeoutMs: 120_000 });
    if (res.error || res.status !== 0 || typeof res.stdout !== 'string') {
      // vitest exits non-zero on test failures — preserve prior fail behavior
      return { passRatio: 0, passed: false };
    }
    const output = res.stdout;

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
export async function reconcileSpuriousNoGo(
  result: TaskResult,
  task: Task,
  projectRoot: string,
  deps?: ReconciliationDeps,
): Promise<ReconciliationResult> {
  const getGitDiff = deps?.getGitDiffStats ?? defaultGetGitDiffStats;
  const runTsc = deps?.runTscCheck ?? defaultRunTscCheck;
  const runVitest = deps?.runVitestScopeCheck ?? defaultRunVitestScopeCheck;

  // Step 1: Check git diff — is there meaningful work?
  const diffStats = await getGitDiff(projectRoot, task.scope);

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
  const tscPassed = await runTsc(projectRoot);
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
  const vitestResult = await runVitest(projectRoot, scopeDirs);
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

// ─── Rubric-Based Spurious NO_GO Reconciliation (Sprint 163 T-001) ─────────
// Sprint 145 wrote reconcileSpuriousNoGo (git/tsc/vitest heuristic) and wired
// it into the deprecated evaluateResult. Sprint 162 162-003 forensic proved
// the active path is evaluateWithRubric — same regression class, different
// pipeline, no wire. This sibling helper is pure (no subprocess) so it can
// run inline inside evaluateWithRubric for every NO_GO without cost.

/** Reasons we may keep or override a NO_GO decision after rubric evaluation. */
export type RubricReconciliationReason =
  | 'not_no_go'
  | 'worker_self_no_go'
  | 'concrete_test_failed'
  | 'concrete_scope_violation'
  | 'rubric_threshold_not_met'
  | 'unsupported_self_assessment'
  | 'heuristic_no_go_overridden';

/** Result of the rubric-based reconciliation attempt. */
export interface RubricReconciliationResult {
  /** Final decision after reconciliation. */
  decision: 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';
  /** True when the original rubric NO_GO was salvaged away from NO_GO. The
   *  heuristic (worker-signal) path caps at GO_WITH_TECH_DEBT — never a clean DONE
   *  — because the gating signals are worker-self-reported (fabricatable). */
  reconciled: boolean;
  /** Machine-readable reason code for the decision. */
  reason: RubricReconciliationReason;
  /** Human-readable explanation. */
  notes: string;
  /** Average rubric score across all criteria (0–100). */
  rubricAverage: number;
  /** Worker-reported coverage (0–100). */
  coverage: number;
}

/** Reconciliation thresholds — exported so tests and callers stay aligned. */
export const RUBRIC_RECONCILIATION_THRESHOLDS = {
  /** Minimum rubric average required to override a heuristic NO_GO. */
  rubricAverage: 85,
  /** Minimum worker-reported coverage required to override a heuristic NO_GO. */
  coverage: 80,
  /** Below this scope_compliance score the failure is treated as concrete. */
  scopeCompliance: 90,
} as const;

function getRubricScore(rubricResult: EvaluationResult, criterion: string): number | undefined {
  return rubricResult.rubricScores.find(s => s.criterion === criterion)?.score;
}

function computeRubricAverage(rubricResult: EvaluationResult): number {
  const scores = rubricResult.rubricScores;
  if (scores.length === 0) return 0;
  const sum = scores.reduce((acc, s) => acc + s.score, 0);
  return Math.round((sum / scores.length) * 100) / 100;
}

/**
 * Reconcile a rubric-based NO_GO using the Sprint 163 decision matrix.
 *
 * Decision matrix (only NO_GO inputs are inspected — DONE / GO_WITH_TECH_DEBT
 * pass through unchanged):
 *
 * | Worker selfAssessment | Concrete signal                | Result            |
 * | --------------------- | ------------------------------ | ----------------- |
 * | NO_GO                 | (any)                          | preserve NO_GO    |
 * | DONE                  | testsPassed === false          | preserve NO_GO    |
 * | DONE                  | scope_compliance < 90          | preserve NO_GO    |
 * | DONE                  | rubric avg ≥ 85 ∧ coverage ≥ 80 | override → DONE  |
 * | DONE                  | rubric avg < 85 or cov < 80    | preserve NO_GO    |
 * | GO_WITH_TECH_DEBT     | (any)                          | preserve NO_GO    |
 *
 * `testsPassed === true` is implicit for the override path because correctness
 * is part of the rubric. `scope_compliance` is treated as a concrete signal
 * (RBAC enforcement, per ADR-037) and is never overridden.
 *
 * @param result        - Worker-reported task result (selfAssessment, coverage, testsPassed)
 * @param rubricResult  - Output of evaluateWithRubric (decision + per-criterion scores)
 */
export function reconcileRubricNoGo(
  result: TaskResult,
  rubricResult: EvaluationResult,
): RubricReconciliationResult {
  const rubricAverage = computeRubricAverage(rubricResult);
  const coverage = typeof result.coverage === 'number' ? result.coverage : 0;

  // Pass-through: non-NO_GO decisions are not reconcilable.
  if (rubricResult.decision !== 'NO_GO') {
    return {
      decision: rubricResult.decision,
      reconciled: false,
      reason: 'not_no_go',
      notes: `Rubric decision ${rubricResult.decision} — reconciliation skipped`,
      rubricAverage,
      coverage,
    };
  }

  // Worker self NO_GO is always priority — never overridden.
  if (result.selfAssessment === 'NO_GO') {
    return {
      decision: 'NO_GO',
      reconciled: false,
      reason: 'worker_self_no_go',
      notes: 'Worker self-assessed NO_GO — preserved (worker priority over Brain heuristic)',
      rubricAverage,
      coverage,
    };
  }

  // Only DONE selfAssessment may trigger override. GO_WITH_TECH_DEBT and any
  // unexpected string keep the rubric NO_GO.
  if (result.selfAssessment !== 'DONE') {
    return {
      decision: 'NO_GO',
      reconciled: false,
      reason: 'unsupported_self_assessment',
      notes: `Worker selfAssessment=${result.selfAssessment} — only DONE may trigger override; NO_GO preserved`,
      rubricAverage,
      coverage,
    };
  }

  // Concrete failure: tests genuinely failed → NO_GO stands (test_failed).
  if (result.testsPassed === false) {
    return {
      decision: 'NO_GO',
      reconciled: false,
      reason: 'concrete_test_failed',
      notes: 'Concrete failure: testsPassed=false — NO_GO preserved (test_failed)',
      rubricAverage,
      coverage,
    };
  }

  // Concrete failure: scope_compliance below threshold → NO_GO stands.
  // RBAC (ADR-037) enforcement; never overridden by worker selfAssessment.
  const scopeScore = getRubricScore(rubricResult, 'scope_compliance');
  if (scopeScore !== undefined && scopeScore < RUBRIC_RECONCILIATION_THRESHOLDS.scopeCompliance) {
    return {
      decision: 'NO_GO',
      reconciled: false,
      reason: 'concrete_scope_violation',
      notes: `Concrete failure: scope_compliance=${scopeScore} < ${RUBRIC_RECONCILIATION_THRESHOLDS.scopeCompliance} — NO_GO preserved (scope_violation, ADR-037)`,
      rubricAverage,
      coverage,
    };
  }

  // Heuristic salvage: worker DONE + tests pass + rubric average + coverage clear.
  // The signals that gate this (worker selfAssessment, testsPassed, result.coverage)
  // are all WORKER-self-reported and therefore fabricatable. A heuristic Brain-NO_GO
  // salvage must NOT mint a clean DONE on unverified data (the false-DONE the audit
  // flagged): it caps at GO_WITH_TECH_DEBT — identical to reconcileSpuriousNoGo, which
  // does REAL tsc+vitest verification and likewise never promotes past tech-debt. The
  // genuinely-good Sprint-162 162-003 regression class is still recovered (not lost as
  // NO_GO), just acknowledged as tech-debt pending real proof.
  if (
    rubricAverage >= RUBRIC_RECONCILIATION_THRESHOLDS.rubricAverage &&
    coverage >= RUBRIC_RECONCILIATION_THRESHOLDS.coverage
  ) {
    debugLog(
      'reconcile:rubric-nogo',
      `Spurious NO_GO salvaged → GO_WITH_TECH_DEBT (rubric avg=${rubricAverage}, worker-coverage=${coverage})`,
    );
    return {
      decision: 'GO_WITH_TECH_DEBT',
      reconciled: true,
      reason: 'heuristic_no_go_overridden',
      notes: `Spurious NO_GO salvaged → GO_WITH_TECH_DEBT: worker selfAssessment=DONE, testsPassed=true, rubric avg ${rubricAverage} ≥ ${RUBRIC_RECONCILIATION_THRESHOLDS.rubricAverage}, coverage ${coverage}% ≥ ${RUBRIC_RECONCILIATION_THRESHOLDS.coverage}%${scopeScore !== undefined ? `, scope_compliance=${scopeScore}` : ''} — worker-reported signals are unverified, so capped at tech-debt (not a clean DONE) per reconcileSpuriousNoGo parity`,
      rubricAverage,
      coverage,
    };
  }

  // Threshold not met — keep rubric NO_GO.
  return {
    decision: 'NO_GO',
    reconciled: false,
    reason: 'rubric_threshold_not_met',
    notes: `Worker DONE but rubric avg=${rubricAverage} (need ≥${RUBRIC_RECONCILIATION_THRESHOLDS.rubricAverage}) or coverage=${coverage}% (need ≥${RUBRIC_RECONCILIATION_THRESHOLDS.coverage}%) — NO_GO preserved`,
    rubricAverage,
    coverage,
  };
}
