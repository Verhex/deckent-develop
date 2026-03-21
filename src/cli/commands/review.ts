import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Command } from 'commander';
import type { Task, TaskResult } from '../../core/types.js';
import { TASKS_DIR } from '../../core/constants.js';
import { print, printError, formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

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

// ─── Helpers ────────────────────────────────────────────────────────

function getReviewPath(root: string, sprintId: string): string {
  return join(root, TASKS_DIR, `review-${sprintId}.json`);
}

export function loadReviewState(root: string, sprintId: string): ReviewState | null {
  const path = getReviewPath(root, sprintId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as ReviewState;
  } catch {
    return null;
  }
}

export function saveReviewState(root: string, state: ReviewState): void {
  const dir = join(root, TASKS_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  writeFileSync(getReviewPath(root, state.sprintId), JSON.stringify(state, null, 2) + '\n');
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
  const resultPath = join(root, TASKS_DIR, `task-${taskId}.result`);
  if (!existsSync(resultPath)) return null;
  try {
    return JSON.parse(readFileSync(resultPath, 'utf-8')) as TaskResult;
  } catch {
    return null;
  }
}

function detectSprintId(tasks: Task[]): string {
  for (const t of tasks) {
    if (t.sprintId) return t.sprintId;
  }
  return 'unknown';
}

function autoReviewTask(result: TaskResult | null): ReviewDecision {
  if (!result) return 'pending';
  if (result.selfAssessment === 'DONE' && result.testsPassed) return 'approved';
  if (result.selfAssessment === 'NO_GO') return 'rejected';
  if (result.selfAssessment === 'GO_WITH_TECH_DEBT' && result.testsPassed) return 'approved';
  return 'retry';
}

// ─── Registration ───────────────────────────────────────────────────

export function registerReview(program: Command): void {
  program
    .command('review')
    .description('Review sprint tasks with evaluations')
    .option('--auto', 'Auto-approve/reject based on task results')
    .option('--json', 'Output review state as JSON')
    .action((opts: { auto?: boolean; json?: boolean }) => {
      try {
        const root = resolveProjectRoot();
        const tasks = loadTasks(root);

        if (tasks.length === 0) {
          print('No tasks found. Run a sprint first.');
          return;
        }

        const sprintId = detectSprintId(tasks);
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

        if (opts.auto) {
          for (const review of state.reviews) {
            if (review.decision === 'pending') {
              const result = loadResult(root, review.taskId);
              review.decision = autoReviewTask(result);
              review.reviewedAt = new Date().toISOString();
              if (review.decision === 'rejected') {
                review.reason = result?.selfAssessment === 'NO_GO'
                  ? 'Auto-rejected: NO_GO assessment'
                  : 'Auto-rejected: tests failed';
              }
            }
          }
          saveReviewState(root, state);
          print(`Auto-review complete for sprint ${sprintId}.`);
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
