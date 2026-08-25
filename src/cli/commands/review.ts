import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, TaskResult } from '../../core/types.js';
import { TASKS_DIR, BRAIN_DIR } from '../../core/constants.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { readAuthoritativeTaskResult } from '../../orchestra/task-result-authority.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { cliContractMessage } from '../helpers/message-catalog/cli-run.js';

// ─── Types ──────────────────────────────────────────────────────────

export type ReviewDecision = 'approved' | 'rejected' | 'retry' | 'pending';

export interface TaskReview {
  taskId: string;
  decision: ReviewDecision;
  reason?: string;
  reviewedAt?: string;
}

export interface ReviewState {
  sprintId: string;
  reviews: TaskReview[];
  createdAt: string;
  updatedAt: string;
}

export type ReviewSettlementReferenceView =
  | { kind: 'valid'; taskId: string; attemptId: string }
  | { kind: 'missing' }
  | { kind: 'corrupt' }
  | { kind: 'legacy' };

export interface ReviewTaskView {
  taskId: string;
  status: string;
  decision: ReviewDecision;
  assessment: TaskResult['selfAssessment'] | null;
  settlementReference: ReviewSettlementReferenceView;
}

export interface ReviewViewModel extends ReviewState {
  tasks: ReviewTaskView[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function getReviewPath(root: string, sprintId: string): string {
  return join(root, TASKS_DIR, `review-${sprintId}.json`);
}

function getPersistentReviewPath(root: string, sprintId: string): string {
  return join(root, BRAIN_DIR, 'reviews', `review-${sprintId}.json`);
}

export function loadReviewState(root: string, sprintId: string): ReviewState | null {
  // Try persistent path first, then tasks dir
  for (const path of [getPersistentReviewPath(root, sprintId), getReviewPath(root, sprintId)]) {
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf-8')) as ReviewState;
    } catch {
      // Try next
    }
  }
  return null;
}

export function saveReviewState(root: string, state: ReviewState): void {
  // Save to both locations: .tasks/ for active use, .brain/reviews/ for persistence
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) {
    mkdirSync(tasksDir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  const json = JSON.stringify(state, null, 2) + '\n';
  writeFileSync(getReviewPath(root, state.sprintId), json);

  // Persistent copy in .brain/reviews/
  const reviewsDir = join(root, BRAIN_DIR, 'reviews');
  if (!existsSync(reviewsDir)) {
    mkdirSync(reviewsDir, { recursive: true });
  }
  writeFileSync(getPersistentReviewPath(root, state.sprintId), json);
}

function loadTasks(root: string): Task[] {
  const tasksDir = join(root, TASKS_DIR);
  if (!existsSync(tasksDir)) return [];
  const files = readdirSync(tasksDir).filter(
    (f) => f.startsWith('task-') && f.endsWith('.json'),
  );
  const tasks: Task[] = [];
  for (const f of files) {
    try {
      tasks.push(JSON.parse(readFileSync(join(tasksDir, f), 'utf-8')) as Task);
    } catch {
      // Skip malformed
    }
  }
  return tasks;
}

function loadResult(root: string, taskId: string): TaskResult | null {
  return readAuthoritativeTaskResult<TaskResult>(root, taskId).result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reduces a host settlement reference to the only identifiers valid in the
 * reviewed task's scope. Unknown fields (including tenant/project/run data)
 * are deliberately never copied to the CLI view.
 */
export function toReviewSettlementReference(
  value: unknown,
  taskId: string,
): ReviewSettlementReferenceView {
  if (value === null || value === undefined) return { kind: 'missing' };
  if (!isRecord(value)) return { kind: 'corrupt' };

  if (value['version'] !== 1) {
    return value['version'] === undefined || typeof value['version'] === 'number'
      ? { kind: 'legacy' }
      : { kind: 'corrupt' };
  }

  const referencedTaskId = value['taskId'];
  const attemptId = value['attemptId'];
  if (
    typeof referencedTaskId !== 'string'
    || referencedTaskId !== taskId
    || typeof attemptId !== 'string'
    || attemptId.length === 0
  ) {
    return { kind: 'corrupt' };
  }
  return { kind: 'valid', taskId: referencedTaskId, attemptId };
}

export function buildReviewViewModel(
  root: string,
  tasks: Task[],
  state: ReviewState,
): ReviewViewModel {
  const reviews = new Map(state.reviews.map((review) => [review.taskId, review]));
  return {
    ...state,
    tasks: tasks.map((task) => {
      const review = reviews.get(task.id);
      try {
        const authority = readAuthoritativeTaskResult<TaskResult>(root, task.id);
        return {
          taskId: task.id,
          status: task.status,
          decision: review?.decision ?? 'pending',
          assessment: authority.result?.selfAssessment ?? null,
          settlementReference: toReviewSettlementReference(authority.settlementRef, task.id),
        };
      } catch {
        // A malformed/unreadable reference is a typed read-side condition. It
        // must not turn review into a stack trace or trigger repair writes.
        return {
          taskId: task.id,
          status: task.status,
          decision: review?.decision ?? 'pending',
          assessment: null,
          settlementReference: { kind: 'corrupt' },
        };
      }
    }),
  };
}

function detectSprintId(tasks: Task[]): string {
  for (const t of tasks) {
    if (t.sprintId) return t.sprintId;
  }
  return 'unknown';
}

/** Detect mixed sprint IDs in tasks */
export function detectMixedSprints(tasks: Task[]): string[] {
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.sprintId) ids.add(t.sprintId);
  }
  return [...ids];
}

function autoReviewTask(result: TaskResult | null): ReviewDecision {
  if (!result) return 'pending';
  if (result.selfAssessment === 'NO_GO') return 'rejected';
  if (result.selfAssessment === 'DONE' && result.testsPassed) return 'approved';
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT' && result.testsPassed) return 'approved';
  // DONE or GO_WITH_TECH_DEBT but tests failed → retry
  if (!result.testsPassed) return 'retry';
  return 'retry';
}

async function interactiveReview(state: ReviewState, root: string, tasks: Task[]): Promise<void> {
  // Dynamic import to avoid requiring prompt module in non-interactive contexts
  const { promptSelect } = await import('../helpers/prompt.js');

  for (const review of state.reviews) {
    if (review.decision !== 'pending') continue;
    const task = tasks.find(t => t.id === review.taskId);
    const result = loadResult(root, review.taskId);

    const info = [
      `Task ${review.taskId}: ${task?.title ?? 'Unknown'}`,
      `  Status: ${task?.status ?? '-'}`,
      `  Assessment: ${result?.selfAssessment ?? 'No result'}`,
      `  Tests: ${result?.testsPassed ? 'PASSED' : result ? 'FAILED' : '-'}`,
    ].join('\n');
    print(info);

    const decision = await promptSelect<ReviewDecision>('Decision:', [
      { label: 'Approve', value: 'approved' },
      { label: 'Reject', value: 'rejected' },
      { label: 'Retry', value: 'retry' },
      { label: 'Skip (pending)', value: 'pending' },
    ]);

    review.decision = decision;
    review.reviewedAt = new Date().toISOString();
    if (decision === 'rejected') {
      review.reason = 'Manually rejected';
    } else if (decision === 'retry') {
      review.reason = 'Marked for retry';
    }
  }
}

async function handleRetryRespawn(state: ReviewState, root: string): Promise<void> {
  const retryTasks = state.reviews.filter(r => r.decision === 'retry');
  if (retryTasks.length === 0) return;

  for (const review of retryTasks) {
    const taskPath = join(root, TASKS_DIR, `task-${review.taskId}.json`);
    if (!existsSync(taskPath)) continue;
    try {
      const task = JSON.parse(readFileSync(taskPath, 'utf-8')) as Task;
      // Kill existing worker if any
      try {
        const { killWorker } = await import('../../orchestra/tmux.js');
        killWorker(review.taskId);
      } catch {
        // Non-fatal: worker may not be running
      }
      // Reset task to PENDING for respawn
      task.status = 'PENDING' as Task['status'];
      writeFileSync(taskPath, JSON.stringify(task, null, 2) + '\n');
      // Remove old result if exists
      const resultPath = join(root, TASKS_DIR, `task-${review.taskId}.result`);
      if (existsSync(resultPath)) {
        const { unlinkSync } = await import('node:fs');
        unlinkSync(resultPath);
      }
      print(`Task ${review.taskId} reset to PENDING for retry.`);
    } catch {
      // Non-fatal
    }
  }
}

// ─── Registration ───────────────────────────────────────────────────

export function registerReview(program: Command): void {
  const helpLang = getLanguage(undefined);
  program
    .command('review')
    .description(getMessage('cli.review.desc', getLanguage(undefined)))
    .option('--auto', cliContractMessage('cliContract.review.opt.auto', helpLang))
    .option('--json', cliContractMessage('cliContract.review.opt.json', helpLang))
    .option('--approve-all', cliContractMessage('cliContract.review.opt.approve_all', helpLang))
    .option('--reject-all', cliContractMessage('cliContract.review.opt.reject_all', helpLang))
    .action(async (opts: { auto?: boolean; json?: boolean; approveAll?: boolean; rejectAll?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const tasks = loadTasks(root);
        /**
         * Under `--json` stdout is reserved for the review-state document; warnings
         * and completion lines go to stderr instead of framing that document.
         */
        const notice = (line: string): void => {
          if (opts.json) process.stderr.write(`${line}\n`);
          else print(line);
        };

        if (tasks.length === 0) {
          notice('No tasks found. Run a sprint first.');
          return;
        }

        const sprintId = detectSprintId(tasks);

        // Mixed sprint detection
        const sprintIds = detectMixedSprints(tasks);
        if (sprintIds.length > 1) {
          notice(`Warning: Mixed sprint IDs detected: ${sprintIds.join(', ')}. Using ${sprintId}.`);
        }

        let state = loadReviewState(root, sprintId);

        if (!state) {
          state = {
            sprintId,
            reviews: tasks.map((t) => ({
              taskId: t.id,
              decision: 'pending' as ReviewDecision,
            })),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
        }

        // --json without modification flags: show current state and return
        if (opts.json && !opts.auto && !opts.approveAll && !opts.rejectAll) {
          print(JSON.stringify(buildReviewViewModel(root, tasks, state), null, 2));
          return;
        }

        if (opts.approveAll) {
          for (const review of state.reviews) {
            if (review.decision === 'pending') {
              review.decision = 'approved';
              review.reason = 'Bulk approved via --approve-all';
              review.reviewedAt = new Date().toISOString();
            }
          }
          saveReviewState(root, state);
          notice(`All pending tasks approved for sprint ${sprintId}.`);
        } else if (opts.rejectAll) {
          for (const review of state.reviews) {
            if (review.decision === 'pending') {
              review.decision = 'rejected';
              review.reason = 'Bulk rejected via --reject-all';
              review.reviewedAt = new Date().toISOString();
            }
          }
          saveReviewState(root, state);
          notice(`All pending tasks rejected for sprint ${sprintId}.`);
        } else if (opts.auto) {
          for (const review of state.reviews) {
            if (review.decision === 'pending') {
              const result = loadResult(root, review.taskId);
              review.decision = autoReviewTask(result);
              review.reviewedAt = new Date().toISOString();
              if (review.decision === 'rejected') {
                review.reason = result?.selfAssessment === 'NO_GO'
                  ? 'Auto-rejected: NO_GO assessment'
                  : 'Auto-rejected: tests failed';
              } else if (review.decision === 'retry') {
                review.reason = 'Auto-retry: tests failed';
              }
            }
          }
          saveReviewState(root, state);
          // Handle retry respawn
          await handleRetryRespawn(state, root);
          notice(`Auto-review complete for sprint ${sprintId}.`);
        } else {
          // Interactive review
          await interactiveReview(state, root, tasks);
          saveReviewState(root, state);
          // Handle retry respawn
          await handleRetryRespawn(state, root);
        }

        if (opts.json) {
          print(JSON.stringify(state, null, 2));
          return;
        }

        const headers = ['Task', 'Status', 'Decision', 'Assessment', 'Reason'];
        const rows = state.reviews.map((r) => {
          const task = tasks.find((t) => t.id === r.taskId);
          const result = loadResult(root, r.taskId);
          return [
            r.taskId,
            task?.status ?? '-',
            r.decision,
            result?.selfAssessment ?? '-',
            r.reason ?? '-',
          ];
        });
        print(formatTable(headers, rows));

        const approved = state.reviews.filter((r) => r.decision === 'approved').length;
        const rejected = state.reviews.filter((r) => r.decision === 'rejected').length;
        const pending = state.reviews.filter((r) => r.decision === 'pending').length;
        const retryCount = state.reviews.filter((r) => r.decision === 'retry').length;
        print(`\nSummary: ${approved} approved, ${rejected} rejected, ${retryCount} retry, ${pending} pending`);
      } catch (error) {
        printError(error);
        process.exitCode = 1;
      }
    });
}
