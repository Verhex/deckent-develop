// ═══ Post-Sprint Smoke Runner (Sprint 182 Task 182-006 / W2-3) ════════
//
// Verify task pattern redesign.
//
// Problem (Sprint 181 forensik): verify task'lar sprint döngüsü içinde diğer
// task'larla aynı wave'de spawn olduğunda race oluyordu — W1 LAND etmeden
// W2 verify çalıştı → boş verify → GO_WITH_TECH_DEBT (181-003).
//
// Çözüm: Verify task'ları sprint COMPLETE phase'inden SONRA, ayrı bir
// "post-sprint smoke" katmanında çalıştır. Bu katman:
//   1. Verify task'ları title heuristic'i ile classify eder.
//   2. Tüm non-verify (primary) task DONE/GO_WITH_TECH_DEBT olduğunda fire eder.
//   3. Primary task'ların upstream deliverable'larını disk + result map'inden
//      aggregate eder ve smoke runner'a görünür kılar.
//
// Saf fonksiyonlar + dependency injection (smoke runner callback) — finalizeSprint
// içine kolayca entegre edilebilir, test edilebilir, side-effect izoledir.
//
// ADR alignment:
//   • ADR-035 (Verification Protocol) — verify pipeline post-sprint kanal
//   • ADR-045 (Wave-Based Execution) — bu katman dependency_pipeline_enabled=false
//     iken bile ordering garantisi sağlar (W1→W2 deterministik smoke order)
//   • ADR-047 (Manuel Subagent Dispatch) — pattern Brain'in manuel gate'ini
//     kod düzeyinde tamamlar.

import { existsSync, statSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

import type {
  Sprint,
  Task,
  TaskResult,
} from '../core/types.js';
import { TaskEvaluation } from '../core/types.js';

// ─── Public Types ─────────────────────────────────────────────────────

/** A task identified as a "verify" task by classification heuristics. */
export interface VerifyTaskCandidate {
  taskId: string;
  title: string;
  /** Why the classifier flagged this task (kanıt). */
  reason: string;
}

/** Result of running a single verify task's smoke check. */
export interface SmokeTaskResult {
  taskId: string;
  passed: boolean;
  output: string;
  /** Upstream files the smoke runner observed on disk. */
  filesObserved: string[];
}

/** Aggregate result of the post-sprint smoke phase. */
export interface PostSprintSmokeResult {
  /** Whether the smoke runner fired (i.e. trigger gate passed). */
  triggered: boolean;
  /** Human-readable explanation — useful for retro logs and CLI output. */
  reason: string;
  /** True iff every NON-verify task reached DONE / GO_WITH_TECH_DEBT. */
  primaryTasksAllPassed: boolean;
  /** Per-verify-task smoke result (empty when not triggered). */
  verifyTasks: SmokeTaskResult[];
  /** Files produced by upstream (non-verify) tasks, deduplicated. */
  upstreamDeliverables: string[];
}

/** Smoke-runner callback signature — injected for testability. */
export type SmokeRunnerFn = (
  task: Task,
  projectRoot: string,
  upstreamDeliverables: string[],
) => Promise<SmokeTaskResult>;

export interface PostSprintSmokeOptions {
  /** Explicit verify-task IDs. If omitted, classifyVerifyTasks(sprint) is used. */
  verifyTaskIds?: string[];
  /** Custom smoke runner (defaults to a stub that marks every verify task passed). */
  smokeRunner?: SmokeRunnerFn;
}

// ─── Verify-Task Classification ───────────────────────────────────────

/**
 * Title patterns that mark a task as a verify task.
 * Tight regex set — avoids false positives like "verification of X feature"
 * being mistaken for a smoke-runner candidate when X is actually code work.
 * Heuristic must remain conservative: when uncertain, treat as primary.
 */
const VERIFY_TITLE_PATTERNS: ReadonlyArray<RegExp> = [
  /\bverify\b/i,
  /\bsmoke\b/i,
  /\bparity\s+verify\b/i,
  /\bsweep\s+.*\bverify\b/i,
];

/** Title fragments that ALWAYS exclude a task from verify classification. */
const NON_VERIFY_EXCLUSIONS: ReadonlyArray<RegExp> = [
  // "Wire verify" tasks are still implementation tasks even though they
  // contain the word — they create the verify infrastructure, not run it.
  /\bwire\s+verify\b/i,
];

/**
 * Classify which sprint tasks are verify tasks based on title heuristics.
 *
 * Pure function — no I/O. Stable ordering matches `sprint.tasks` order
 * so callers can rely on it for retro logs.
 */
export function classifyVerifyTasks(sprint: Sprint): VerifyTaskCandidate[] {
  const out: VerifyTaskCandidate[] = [];
  for (const task of sprint.tasks) {
    if (NON_VERIFY_EXCLUSIONS.some(rx => rx.test(task.title))) continue;
    const match = VERIFY_TITLE_PATTERNS.find(rx => rx.test(task.title));
    if (!match) continue;
    out.push({
      taskId: task.id,
      title: task.title,
      reason: `title matches /${match.source}/${match.flags}`,
    });
  }
  return out;
}

// ─── Trigger Gate ─────────────────────────────────────────────────────

/**
 * Decide whether the post-sprint smoke runner should fire.
 *
 * Rules:
 *   • Trigger requires every non-verify task in `sprint.tasks` to have an
 *     evaluation of DONE or GO_WITH_TECH_DEBT.
 *   • A single NO_GO (or missing) primary evaluation blocks the trigger.
 *   • Sprints with zero verify tasks return `triggered=false` with a
 *     descriptive reason (no-op, not an error).
 */
export function shouldTriggerPostSprintSmoke(
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  verifyTaskIds: string[],
): { triggered: boolean; reason: string; primaryTasksAllPassed: boolean } {
  const verifySet = new Set(verifyTaskIds);
  const primaries = sprint.tasks.filter(t => !verifySet.has(t.id));

  if (verifyTaskIds.length === 0) {
    return {
      triggered: false,
      reason: 'no verify tasks classified in this sprint',
      primaryTasksAllPassed: primaries.every(p => isPassing(evaluations.get(p.id))),
    };
  }

  const failing: string[] = [];
  const missing: string[] = [];
  for (const primary of primaries) {
    const evaluation = evaluations.get(primary.id);
    if (evaluation === undefined) { missing.push(primary.id); continue; }
    if (!isPassing(evaluation)) failing.push(primary.id);
  }

  const primaryTasksAllPassed = failing.length === 0 && missing.length === 0;

  if (!primaryTasksAllPassed) {
    const parts: string[] = [];
    if (failing.length) parts.push(`primary task(s) NO_GO: ${failing.join(', ')}`);
    if (missing.length) parts.push(`primary task(s) without evaluation: ${missing.join(', ')}`);
    return {
      triggered: false,
      reason: `Skipping post-sprint smoke — ${parts.join('; ')}`,
      primaryTasksAllPassed: false,
    };
  }

  return {
    triggered: true,
    reason: `All ${primaries.length} primary task(s) passed; running ${verifyTaskIds.length} verify task(s)`,
    primaryTasksAllPassed: true,
  };
}

function isPassing(evaluation: TaskEvaluation | undefined): boolean {
  return evaluation === TaskEvaluation.DONE || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT;
}

// ─── Upstream Deliverable Aggregation ─────────────────────────────────

/**
 * Collect the files produced by non-verify task results that exist on disk.
 *
 * Sprint 181 lesson: a verify task that fires inside the sprint wave may see
 * an empty or in-progress upstream directory. Running this aggregation only
 * AFTER the sprint COMPLETE phase guarantees that every `filesChanged` entry
 * from primary results has been flushed to disk (or marked missing — which is
 * itself useful signal for the smoke runner).
 */
export function collectUpstreamDeliverables(
  projectRoot: string,
  sprint: Sprint,
  results: TaskResult[],
  verifyTaskIds: string[],
): string[] {
  const verifySet = new Set(verifyTaskIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const result of results) {
    if (verifySet.has(result.taskId)) continue;
    // Sanity: result must belong to a task in this sprint
    if (!sprint.tasks.some(t => t.id === result.taskId)) continue;
    for (const file of result.filesChanged ?? []) {
      const absPath = isAbsolute(file) ? file : join(projectRoot, file);
      if (!existsSync(absPath)) continue;
      try {
        // Skip directories — only real files count as deliverables
        if (!statSync(absPath).isFile()) continue;
      } catch { continue; }
      if (seen.has(file)) continue;
      seen.add(file);
      out.push(file);
    }
  }
  return out;
}

// ─── Main Runner ──────────────────────────────────────────────────────

const defaultSmokeRunner: SmokeRunnerFn = async (task) => ({
  taskId: task.id,
  passed: true,
  output: 'default smoke runner (no-op stub)',
  filesObserved: [],
});

/**
 * Run verify tasks AFTER the sprint COMPLETE phase, gated on all primary
 * tasks reaching DONE / GO_WITH_TECH_DEBT.
 *
 * Contract:
 *   • Never throws — failures captured in `verifyTasks[i].passed=false`.
 *   • Pure with respect to sprint state — does not mutate `sprint`,
 *     `evaluations`, or `results`.
 *   • `smokeRunner` is the injection point — production wiring runs the
 *     verify task's actual command/check; tests inject a stub.
 *
 * Why a separate phase (not a wave inside the sprint)?
 *   `dependency_pipeline_enabled` defaults to false in deckent-dev (ADR-047)
 *   and Sprint 182 deliberately does NOT flip it. Routing verify work through
 *   this post-sprint helper preserves the manual-gate policy while removing
 *   the Sprint 181 race that produced an empty W2-1 verify result.
 */
export async function runPostSprintSmoke(
  projectRoot: string,
  sprint: Sprint,
  evaluations: Map<string, TaskEvaluation>,
  results: TaskResult[],
  opts: PostSprintSmokeOptions = {},
): Promise<PostSprintSmokeResult> {
  const verifyTaskIds = opts.verifyTaskIds ?? classifyVerifyTasks(sprint).map(v => v.taskId);
  const gate = shouldTriggerPostSprintSmoke(sprint, evaluations, verifyTaskIds);

  if (!gate.triggered) {
    return {
      triggered: false,
      reason: gate.reason,
      primaryTasksAllPassed: gate.primaryTasksAllPassed,
      verifyTasks: [],
      upstreamDeliverables: [],
    };
  }

  const upstreamDeliverables = collectUpstreamDeliverables(
    projectRoot,
    sprint,
    results,
    verifyTaskIds,
  );

  const smokeRunner = opts.smokeRunner ?? defaultSmokeRunner;
  const verifyTaskMap = new Map(sprint.tasks.map(t => [t.id, t]));

  const verifyTasks: SmokeTaskResult[] = [];
  for (const taskId of verifyTaskIds) {
    const task = verifyTaskMap.get(taskId);
    if (!task) {
      verifyTasks.push({
        taskId,
        passed: false,
        output: `verify task '${taskId}' not found in sprint.tasks`,
        filesObserved: [],
      });
      continue;
    }
    try {
      const result = await smokeRunner(task, projectRoot, upstreamDeliverables);
      verifyTasks.push(result);
    } catch (err) {
      verifyTasks.push({
        taskId,
        passed: false,
        output: `smoke runner threw: ${(err as Error)?.message ?? String(err)}`,
        filesObserved: [],
      });
    }
  }

  return {
    triggered: true,
    reason: gate.reason,
    primaryTasksAllPassed: true,
    verifyTasks,
    upstreamDeliverables,
  };
}
