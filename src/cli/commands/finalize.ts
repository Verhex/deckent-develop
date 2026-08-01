import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, TaskResult } from '../../core/types.js';
import {
  TaskEvaluation,
  TaskStatus,
  SprintStatus,
  SprintPhase,
} from '../../core/types.js';
import { TASKS_DIR, BRAIN_DIR, DECKENT_DIR } from '../../core/constants.js';
import { finalizeSprint } from '../../orchestra/brain.js';
import { forceAbortSprint } from '../../orchestra/sprint-finalizer.js';
import { evaluateResultSync } from '../../orchestra/sprint-controller.js';
import { loadConfig } from '../../core/config.js';
import { debugLog } from '../../core/utils.js';
import { print, printError } from '../helpers/output.js';
import { killSingle } from './kill.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage } from '../helpers/messages.js';
import { getLangFromConfig } from '../helpers/config-reader.js';
import { readJsonSafe } from '../../core/utils.js';
import { loadReviewState } from './review.js';
import { normalizeTaskResultShape } from '../../core/task-result-schema.js';
import { classifyTaskArtifact } from '../../core/task-artifact-classifier.js';
import { DEFAULT_LIFECYCLE_RECOVERY_CONFIG } from '../../core/config-types.js';
import {
  containSprintRecoveryCoordinator,
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
} from '../../orchestra/sprint-recovery-operation.js';

/**
 * Build a Sprint object and evaluations from .tasks/ directory contents.
 * Reads task JSON files and .result files, evaluates each result.
 * Integrates review state: rejected tasks are evaluated as NO_GO.
 * If sprintFilter is provided, only tasks with that sprintId are included.
 *
 * FINALIZE-ARCHIVE-BLIND fix (Sprint 268): task/result collection is
 * archive-aware — after CLEANUP archives files to
 * `.brain/archive/<sprintId>-tasks/`, a re-finalize used to undercount
 * (sprint-267 live bug: "5/5" instead of "6/6") and treat archived results
 * as missing (→ synthetic NO_GO). Both locations are merged, id-deduped,
 * with `.tasks/` taking priority. The archive dir is only resolvable when
 * the sprint ID is known (via `--sprint` or derivable from `.tasks/`).
 *
 * Exported for tests (Sprint 268).
 */
export function buildSprintFromTasks(root: string, sprintFilter?: string): {
  sprintId: string;
  tasks: Task[];
  results: TaskResult[];
  evaluations: Map<string, TaskEvaluation>;
} {
  const tasksDir = join(root, TASKS_DIR);
  const tasks: Task[] = [];
  const results: TaskResult[] = [];
  const evaluations = new Map<string, TaskEvaluation>();

  const readCanonicalTaskArtifact = (dir: string, filename: string): Task | null => {
    try {
      const content = readFileSync(join(dir, filename), 'utf-8');
      const classification = classifyTaskArtifact(filename, content);
      if (classification.kind !== 'task-record') return null;
      const task = JSON.parse(content) as Task;
      return task.id === classification.taskId ? task : null;
    } catch {
      return null;
    }
  };

  const tasksDirExists = existsSync(tasksDir);
  // Without a .tasks/ dir AND without an explicit --sprint filter there is no
  // way to locate the per-sprint archive dir either — nothing to finalize.
  if (!tasksDirExists && !sprintFilter) {
    return { sprintId: 'sprint-unknown', tasks, results, evaluations };
  }

  // Read all task JSON files from .tasks/ (priority location)
  const seenTaskIds = new Set<string>();
  if (tasksDirExists) {
    const taskFiles = readdirSync(tasksDir).filter(f => /^task-[\w-]{1,100}\.json$/u.test(f));
    for (const file of taskFiles) {
      const task = readCanonicalTaskArtifact(tasksDir, file);
      if (task) {
        // If a sprint filter is provided, only include tasks matching that sprint
        if (!sprintFilter || task.sprintId === sprintFilter) {
          tasks.push(task);
          seenTaskIds.add(task.id);
        }
      }
    }
  }

  // Determine sprint ID: use filter if provided, else derive from tasks
  const sprintId = sprintFilter ?? tasks[0]?.sprintId ?? 'sprint-unknown';

  // Merge archived task JSONs (.tasks/ wins on id collision)
  // W7: yeni-düzen önce, eski düz-yerleşim fallback.
  const archiveNewDir = join(root, BRAIN_DIR, 'archive', 'sprints', `${sprintId}-tasks`);
  const archiveTasksDir = existsSync(archiveNewDir) ? archiveNewDir : join(root, BRAIN_DIR, 'archive', `${sprintId}-tasks`);
  const archiveDirExists = sprintId !== 'sprint-unknown' && existsSync(archiveTasksDir);
  if (archiveDirExists) {
    const archivedTaskFiles = readdirSync(archiveTasksDir).filter(f => /^task-[\w-]{1,100}\.json$/u.test(f));
    for (const file of archivedTaskFiles) {
      const task = readCanonicalTaskArtifact(archiveTasksDir, file);
      if (task && !seenTaskIds.has(task.id) && (!sprintFilter || task.sprintId === sprintFilter)) {
        tasks.push(task);
        seenTaskIds.add(task.id);
      }
    }
  }

  // Read all result files (.tasks/ first, then archive — deduped by taskId)
  const seenResultIds = new Set<string>();
  if (tasksDirExists) {
    const resultFiles = readdirSync(tasksDir).filter(f => f.startsWith('task-') && f.endsWith('.result'));
    for (const file of resultFiles) {
      const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(join(tasksDir, file)));
      if (result && seenTaskIds.has(result.taskId)) {
        results.push(result);
        seenResultIds.add(result.taskId);
      }
    }
  }
  if (archiveDirExists) {
    const archivedResultFiles = readdirSync(archiveTasksDir).filter(f => f.startsWith('task-') && f.endsWith('.result'));
    for (const file of archivedResultFiles) {
      const result = normalizeTaskResultShape(readJsonSafe<TaskResult>(join(archiveTasksDir, file)));
      if (result && seenTaskIds.has(result.taskId) && !seenResultIds.has(result.taskId)) {
        results.push(result);
        seenResultIds.add(result.taskId);
      }
    }
  }

  // Load review state to integrate rejected tasks
  const reviewState = loadReviewState(root, sprintId);
  const rejectedTaskIds = new Set<string>();
  if (reviewState) {
    for (const review of reviewState.reviews) {
      if (review.decision === 'rejected') {
        rejectedTaskIds.add(review.taskId);
      }
    }
  }

  // Evaluate each task
  for (const task of tasks) {
    // Review-rejected tasks → NO_GO regardless of result
    if (rejectedTaskIds.has(task.id)) {
      evaluations.set(task.id, TaskEvaluation.NO_GO);
      continue;
    }
    const result = results.find(r => r.taskId === task.id);
    if (result) {
      if (result.cascadeSkipped === true) {
        evaluations.set(task.id, TaskEvaluation.DEFERRED);
        continue;
      }
      // FINALIZE-RECOUNT fix (Sprint 268, 1a): a .result that went through
      // Brain EVALUATE carries the authoritative decision in
      // `evaluationDecision`; crash-recovered/manual results only carry the
      // worker's `selfAssessment` (sprint-267 live bug: the recorded decision
      // was ignored and every task was re-counted as a failed use). Success
      // detection therefore uses `evaluationDecision ?? selfAssessment`
      // (DONE / GO_WITH_TECH_DEBT = success). Re-grading via evaluateResultSync
      // stays as the last resort for results carrying neither (or a
      // non-terminal hint such as TIMEOUT_WITH_WORK).
      const recorded = result.evaluationDecision ?? result.selfAssessment;
      if (recorded === 'DONE' || recorded === 'GO_WITH_TECH_DEBT' || recorded === 'NO_GO') {
        evaluations.set(task.id, recorded as TaskEvaluation);
      } else {
        evaluations.set(task.id, evaluateResultSync(result, task));
      }
    } else {
      // Never-dispatched/repair-parked work has no worker verdict. Finalize
      // must preserve that truth instead of inventing a failed attempt.
      const unexecuted =
        task.status === TaskStatus.DRAFT
        || task.status === TaskStatus.PENDING
        || task.status === TaskStatus.PAUSED;
      evaluations.set(
        task.id,
        unexecuted ? TaskEvaluation.DEFERRED : TaskEvaluation.NO_GO,
      );
    }
  }

  return { sprintId, tasks, results, evaluations };
}

/** Check if a sprint has already been finalized by checking sprint log */
function isSprintAlreadyFinalized(root: string, sprintId: string): boolean {
  const sprintLogPath = join(root, BRAIN_DIR, 'sprints', `${sprintId}.md`);
  return existsSync(sprintLogPath);
}

/** Detect tasks that are still in-progress */
export function detectIncompleteTasks(tasks: Task[]): Task[] {
  const activeStatuses = new Set(['EXECUTING', 'CLAIMED', 'TESTING', 'DOCUMENTING']);
  return tasks.filter(t => activeStatuses.has(t.status));
}

/**
 * born-610 STATUS-TRUTH (COMPLETE&active): on a forced finalize, the sprint's
 * live WORKERS must die with the coordinator — pre-610 only the coordinator was
 * terminated, so orphan worker subprocesses kept heartbeating (and writing to
 * the repo) under a COMPLETE-stamped sprint (feedback_finalize_force_orphan_state,
 * the other half of the Sprint-223 family). Best-effort per worker (a window/
 * container already gone is success, not failure); `deps.kill` is a seam so the
 * sweep is testable without tmux. COMPLETE may only be stamped after this sweep.
 */
export function forceKillLiveWorkers(
  incomplete: readonly Task[],
  kill: (taskId: string) => boolean,
): { killed: string[]; failed: string[] } {
  const killed: string[] = [];
  const failed: string[] = [];
  for (const t of incomplete) {
    let ok = false;
    try { ok = kill(t.id); } catch { ok = false; }
    (ok ? killed : failed).push(t.id); // best-effort: sweep continues either way
  }
  return { killed, failed };
}

/** Detect mixed sprint IDs */
export function detectMixedSprints(tasks: Task[]): string[] {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.sprintId) ids.add(t.sprintId);
  }
  return [...ids];
}

export function registerFinalize(program: Command): void {
  program
    .command('finalize')
    .description(getMessage('finalize.description', 'en'))
    .option('--sprint <id>', getMessage('finalize.sprint_option', 'en'))
    .option('--skip-decay', getMessage('finalize.skip_decay_option', 'en'))
    .option('--skip-hooks', getMessage('finalize.skip_hooks_option', 'en'))
    .option('--force', getMessage('finalize.force_option', 'en'))
    .action(async (opts: { sprint?: string; skipDecay?: boolean; skipHooks?: boolean; force?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLangFromConfig(root);

      try {
        const { sprintId, tasks, results, evaluations } = buildSprintFromTasks(root, opts.sprint);

        if (tasks.length === 0) {
          print(getMessage('finalize.no_tasks', lang));
          return;
        }
        const config = await loadConfig(root);
        const terminationPolicy =
          config.lifecycle_recovery ?? DEFAULT_LIFECYCLE_RECOVERY_CONFIG;
        // (G) Mixed sprint detection
        const sprintIds = detectMixedSprints(tasks);
        if (sprintIds.length > 1) {
          print(getMessage('finalize.mixed_sprints', lang, {
            sprintIds: sprintIds.join(', '),
            sprintId,
          }));
        }

        // (F) Completion guard — reject if tasks still in-progress
        const incomplete = detectIncompleteTasks(tasks);
        if (incomplete.length > 0 && !opts.force) {
          const ids = incomplete.map(t => t.id).join(', ');
          print(getMessage('finalize.incomplete_tasks', lang, {
            count: String(incomplete.length),
            ids,
          }));
          return;
        } else if (incomplete.length > 0) {
          print(getMessage('finalize.force_incomplete_tasks', lang, {
            count: String(incomplete.length),
          }));
          // born-610: kill the sprint's live WORKERS too — COMPLETE may not be
          // stamped while worker subprocesses are alive (COMPLETE&active truth).
          try {
            const sweep = forceKillLiveWorkers(incomplete, (id) => killSingle(root, id, lang));
            if (sweep.killed.length > 0) {
              print(getMessage('finalize.workers_terminated', lang, {
                count: String(sweep.killed.length),
                ids: sweep.killed.join(', '),
              }));
            }
            if (sweep.failed.length > 0) {
              throw new Error(getMessage('finalize.workers_termination_failed', lang, {
                count: String(sweep.failed.length),
                ids: sweep.failed.join(', '),
              }));
            }
          } catch (error) {
            debugLog('finalize:forceWorkerSweep', error);
            throw error;
          }
        }

        // (H) Duplicate finalize protection
        if (isSprintAlreadyFinalized(root, sprintId) && !opts.force) {
          print(getMessage('finalize.already_finalized', lang, { sprintId }));
          return;
        }

        // FINALIZE Duration fix (Sprint 268): the CLI-built sprint object had
        // no startedAt, so calculateMetrics fell back to Date.now() for the
        // start time and wrote Duration=0ms (sprint-267 live bug). Recover
        // the real start from .deckent/sprint-state.json (only when it
        // belongs to THIS sprint), falling back to the coordinator PID
        // record. When neither exists, startedAt stays undefined and the
        // job summary honestly reports the duration as 'unknown'.
        let startedAt: string | undefined;
        const sprintState = readJsonSafe<{
          sprintId?: string;
          startedAt?: string;
          phase?: SprintPhase;
        }>(
          join(root, DECKENT_DIR, 'sprint-state.json'),
        );
        if (sprintState?.startedAt && sprintState.sprintId === sprintId) {
          startedAt = sprintState.startedAt;
        } else {
          const pidRecord = readJsonSafe<{ sprintId?: string; startedAt?: string }>(
            join(root, DECKENT_DIR, 'pids', `${sprintId}.pid`),
          );
          if (pidRecord?.startedAt) startedAt = pidRecord.startedAt;
        }

        const sprint = {
          id: sprintId,
          number: parseInt(sprintId.replace('sprint-', ''), 10) || 0,
          status: opts.force ? SprintStatus.ABORTED : SprintStatus.COMPLETE,
          phase: opts.force
            ? sprintState?.sprintId === sprintId
              ? sprintState.phase ?? SprintPhase.TRANSITION
              : SprintPhase.TRANSITION
            : SprintPhase.COMPLETE,
          tasks,
          workers: tasks.map(t => `w-${t.id}`),
          startedAt,
          completedAt: new Date().toISOString(),
        };

        // Normal finalization may run inside the coordinator itself; in that
        // one case containment reports `self` and the coordinator retires its
        // PID authority in finalizeSprint. An external normal finalizer must
        // still prove coordinator death before terminal publication.
        if (!opts.force) {
          const identity = readSprintRecoverySettlementIdentity(root, sprintId);
          const containment = await containSprintRecoveryCoordinator(root, sprintId, {
            expectedIdentity: identity,
            terminationPolicy,
            allowSelf: true,
          });
          if (containment.action === 'terminated') {
            print(getMessage('finalize.coordinator_terminated', lang, {
              pid: String(containment.pid),
              escalation: containment.escalation,
            }));
          }
        }

        // Recovery owns coordinator containment, identity validation, receipt
        // handling, and settlement. It must run before finalizeSprint so a
        // typed HOLD cannot produce a false terminal finalize result.
        if (opts.force) {
          const identity = readSprintRecoverySettlementIdentity(root, sprintId);
          await runSprintRecoveryOperation(root, sprintId, {
            skipAudit: true,
            intent: 'FINALIZE_CONTAINMENT',
            approval: {
              approvalRef: 'cli:force-finalize',
              idempotencyKey:
                `cli:force-finalize:${sprintId}:${identity.generation}:${identity.fenceToken}`,
              identity,
            },
            terminationPolicy,
          });
          const settlement = forceAbortSprint(root, sprint, evaluations, results, {
            defaultAuthMode: config.auth_mode,
            runId: sprintId,
            coordinatorGeneration: Math.max(1, identity.generation),
          });
          const metrics = settlement.terminalTruth.logicalMetrics;
          print(getMessage('finalize.aborted', lang, {
            sprintId,
            total: String(metrics.totalTasks),
            done: String(metrics.completedTasks),
            unresolved: String(Math.max(0, metrics.totalTasks - metrics.completedTasks)),
          }));
          return;
        }

        // Bug N fix (Sprint 166-T2): wire onRuleRegen to regenerateRules so manual
        // finalize regenerates .claude/rules/*.md just like the Brain-driven path
        // in sprint-phases.ts:1238. Dynamic import to avoid pulling MemoryStore /
        // better-sqlite3 into the CLI cold path.
        const { regenerateRules } = await import('../../core/rule-generator.js');

        const metrics = await finalizeSprint(root, sprint, evaluations, results, {
          skipDecay: opts.skipDecay,
          skipHooks: opts.skipHooks,
          config,
          onRuleRegen: async (projectRoot: string): Promise<void> => {
            await regenerateRules(projectRoot);
          },
        });

        print(getMessage('finalize.complete', lang, {
          sprintId,
          total: String(metrics.totalTasks),
          done: String(metrics.completedTasks),
          debt: String(metrics.techDebtTasks),
          noGo: String(metrics.noGoTasks),
        }));
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
