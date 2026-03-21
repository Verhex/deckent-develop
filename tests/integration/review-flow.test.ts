// ─── Integration Test: Review Flow E2E ────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  ReviewActions,
  type ReviewDecision,
  type ReviewState,
} from '../../src/cli/helpers/review-actions.js';
import {
  SelectiveRetry,
  type RetryQueue,
} from '../../src/cli/helpers/selective-retry.js';
import {
  ReviewSummary,
  type ReviewSummaryData,
} from '../../src/cli/helpers/review-summary.js';
import {
  TaskEvaluation,
  TaskStatus,
  type Task,
  type TaskResult,
} from '../../src/core/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────

let tmpRoot: string;

function makeTask(id: string, title: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title,
    description: `Description for ${title}`,
    model: 'opus',
    effort: 'high',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'passes', noGoCriteria: 'fails', techDebtAcceptable: 'partial' },
    status: TaskStatus.DONE,
    ...overrides,
  };
}

function makeResult(taskId: string, overrides?: Partial<TaskResult>): TaskResult {
  return {
    taskId,
    workerId: `worker-${taskId}`,
    filesChanged: [`src/${taskId}.ts`],
    linesAdded: 100,
    linesRemoved: 20,
    testsPassed: true,
    coverage: 85,
    selfAssessment: 'DONE',
    notes: `Completed ${taskId}`,
    ...overrides,
  };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-review-'));
  mkdirSync(join(tmpRoot, '.tasks'), { recursive: true });
  mkdirSync(join(tmpRoot, '.brain', 'reviews'), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* ignore */ }
});

// ═══ Tests ════════════════════════════════════════════════════════════

describe('Review Flow Integration', () => {
  const SPRINT_ID = 'sprint-032';
  const TASKS = [
    makeTask('032-001', 'Provider interface'),
    makeTask('032-002', 'Subprocess backend'),
    makeTask('032-003', 'Coverage validator'),
    makeTask('032-004', 'Usage tracker', { status: TaskStatus.DONE }),
    makeTask('032-005', 'Rollback mechanism', { status: TaskStatus.NO_GO }),
  ];

  const EVALUATIONS = new Map<string, TaskEvaluation>([
    ['032-001', TaskEvaluation.DONE],
    ['032-002', TaskEvaluation.DONE],
    ['032-003', TaskEvaluation.DONE],
    ['032-004', TaskEvaluation.GO_WITH_TECH_DEBT],
    ['032-005', TaskEvaluation.NO_GO],
  ]);

  // ─── ReviewActions: approve/reject ───────────────────────────────

  describe('ReviewActions', () => {
    it('creates review state when none exists', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      const state = actions.loadState(SPRINT_ID);
      expect(state.sprintId).toBe(SPRINT_ID);
      expect(state.entries).toEqual([]);
    });

    it('approves a task and persists to disk', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.approveTask('032-001', SPRINT_ID);

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-001')).toBe('approved');
    });

    it('rejects a task with reason', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.rejectTask('032-005', SPRINT_ID, 'Scope violation detected');

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-005')).toBe('rejected');

      // Verify reason persisted
      const state = actions.loadState(SPRINT_ID);
      const entry = state.entries.find((e) => e.taskId === '032-005');
      expect(entry!.reason).toBe('Scope violation detected');
    });

    it('updates existing entry on re-review', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.rejectTask('032-003', SPRINT_ID, 'First review');
      actions.approveTask('032-003', SPRINT_ID);

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-003')).toBe('approved');
    });

    it('retrieves single task review status', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.approveTask('032-001', SPRINT_ID);

      const entry = actions.getReviewStatus('032-001', SPRINT_ID);
      expect(entry).toBeTruthy();
      expect(entry!.decision).toBe('approved');

      const missing = actions.getReviewStatus('032-999', SPRINT_ID);
      expect(missing).toBeNull();
    });

    it('isReviewComplete returns false when entries are pending', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      // Create state with one pending entry
      const state: ReviewState = {
        sprintId: SPRINT_ID,
        entries: [
          { taskId: '032-001', decision: 'approved', reviewedAt: new Date().toISOString() },
          { taskId: '032-002', decision: 'pending' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      actions.saveState(state);

      expect(actions.isReviewComplete(SPRINT_ID)).toBe(false);
    });

    it('isReviewComplete returns true when all reviewed', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.approveTask('032-001', SPRINT_ID);
      actions.approveTask('032-002', SPRINT_ID);
      actions.rejectTask('032-003', SPRINT_ID, 'bad');

      expect(actions.isReviewComplete(SPRINT_ID)).toBe(true);
    });

    it('isReviewComplete returns false for empty state', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      expect(actions.isReviewComplete(SPRINT_ID)).toBe(false);
    });

    it('persists state as JSON file', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.approveTask('032-001', SPRINT_ID);

      const filePath = join(tasksDir, `review-${SPRINT_ID}.json`);
      expect(existsSync(filePath)).toBe(true);

      const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
      expect(raw.sprintId).toBe(SPRINT_ID);
      expect(raw.entries).toHaveLength(1);
    });
  });

  // ─── Full review workflow: approve DONE, approve TECH_DEBT, reject+retry NO_GO

  describe('Full review workflow', () => {
    it('approves 3 DONE tasks', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.approveTask('032-001', SPRINT_ID);
      actions.approveTask('032-002', SPRINT_ID);
      actions.approveTask('032-003', SPRINT_ID);

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-001')).toBe('approved');
      expect(status.get('032-002')).toBe('approved');
      expect(status.get('032-003')).toBe('approved');
    });

    it('approves TECH_DEBT task', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      actions.approveTask('032-004', SPRINT_ID);

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-004')).toBe('approved');
    });

    it('rejects and queues NO_GO task for retry', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);
      const retry = new SelectiveRetry(tasksDir);

      // Reject the NO_GO task
      actions.rejectTask('032-005', SPRINT_ID, 'All tests failed');

      // Queue for retry
      retry.queueForRetry(['032-005'], SPRINT_ID);

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-005')).toBe('rejected');

      const queue = retry.getRetryQueue(SPRINT_ID);
      expect(queue).toBeTruthy();
      expect(queue!.taskIds).toContain('032-005');
    });

    it('completes full workflow: approve all + reject NO_GO + review complete', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      // Approve DONE tasks
      actions.approveTask('032-001', SPRINT_ID);
      actions.approveTask('032-002', SPRINT_ID);
      actions.approveTask('032-003', SPRINT_ID);

      // Approve TECH_DEBT task
      actions.approveTask('032-004', SPRINT_ID);

      // Reject NO_GO task
      actions.rejectTask('032-005', SPRINT_ID, 'Scope violation');

      // All reviewed
      expect(actions.isReviewComplete(SPRINT_ID)).toBe(true);

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.size).toBe(5);

      let approved = 0;
      let rejected = 0;
      for (const decision of status.values()) {
        if (decision === 'approved') approved++;
        if (decision === 'rejected') rejected++;
      }
      expect(approved).toBe(4);
      expect(rejected).toBe(1);
    });
  });

  // ─── SelectiveRetry ──────────────────────────────────────────────

  describe('SelectiveRetry', () => {
    it('queues tasks for retry', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const retry = new SelectiveRetry(tasksDir);

      retry.queueForRetry(['032-005'], SPRINT_ID);

      const queue = retry.getRetryQueue(SPRINT_ID);
      expect(queue).toBeTruthy();
      expect(queue!.sprintId).toBe(SPRINT_ID);
      expect(queue!.taskIds).toEqual(['032-005']);
    });

    it('generates retry directives from original tasks', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const retry = new SelectiveRetry(tasksDir);

      const directives = retry.generateRetryDirectives(['032-005'], TASKS);

      expect(directives).toContain('Retry Sprint');
      expect(directives).toContain('Rollback mechanism (retry)');
      expect(directives).toContain('Task 1');
      expect(directives).toContain('opus');
    });

    it('generates directives for multiple retry tasks', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const retry = new SelectiveRetry(tasksDir);

      const directives = retry.generateRetryDirectives(['032-004', '032-005'], TASKS);

      expect(directives).toContain('Task 1');
      expect(directives).toContain('Task 2');
      expect(directives).toContain('Usage tracker (retry)');
      expect(directives).toContain('Rollback mechanism (retry)');
    });

    it('handles unknown task IDs gracefully', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const retry = new SelectiveRetry(tasksDir);

      const directives = retry.generateRetryDirectives(['unknown-999'], TASKS);

      expect(directives).toContain('Retry task unknown-999');
    });

    it('clears retry queue', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const retry = new SelectiveRetry(tasksDir);

      retry.queueForRetry(['032-005'], SPRINT_ID);
      expect(retry.getRetryQueue(SPRINT_ID)).toBeTruthy();

      retry.clearRetryQueue(SPRINT_ID);
      expect(retry.getRetryQueue(SPRINT_ID)).toBeNull();
    });

    it('returns null for non-existent retry queue', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const retry = new SelectiveRetry(tasksDir);

      expect(retry.getRetryQueue('sprint-nonexistent')).toBeNull();
    });
  });

  // ─── ReviewSummary ───────────────────────────────────────────────

  describe('ReviewSummary', () => {
    it('generates correct summary counts', () => {
      const summaryGen = new ReviewSummary();
      const reviewStatus = new Map<string, ReviewDecision>([
        ['032-001', 'approved'],
        ['032-002', 'approved'],
        ['032-003', 'approved'],
        ['032-004', 'approved'],
        ['032-005', 'rejected'],
      ]);

      const summary = summaryGen.generate(SPRINT_ID, reviewStatus, undefined, ['032-005']);

      expect(summary.sprintId).toBe(SPRINT_ID);
      expect(summary.totalReviewed).toBe(5);
      expect(summary.approvedCount).toBe(4);
      expect(summary.rejectedCount).toBe(1);
      expect(summary.pendingCount).toBe(0);
      expect(summary.retryQueuedCount).toBe(1);
    });

    it('includes rejected tasks with reasons', () => {
      const summaryGen = new ReviewSummary();
      const reviewStatus = new Map<string, ReviewDecision>([
        ['032-001', 'approved'],
        ['032-005', 'rejected'],
      ]);
      const reasons = new Map([['032-005', 'Scope violation']]);

      const summary = summaryGen.generate(SPRINT_ID, reviewStatus, reasons);

      expect(summary.rejectedTasks).toHaveLength(1);
      expect(summary.rejectedTasks[0]!.taskId).toBe('032-005');
      expect(summary.rejectedTasks[0]!.reason).toBe('Scope violation');
    });

    it('includes pending tasks in count', () => {
      const summaryGen = new ReviewSummary();
      const reviewStatus = new Map<string, ReviewDecision>([
        ['032-001', 'approved'],
        ['032-002', 'pending'],
        ['032-003', 'pending'],
      ]);

      const summary = summaryGen.generate(SPRINT_ID, reviewStatus);
      expect(summary.pendingCount).toBe(2);
      expect(summary.approvedCount).toBe(1);
    });

    it('formats summary as human-readable string', () => {
      const summaryGen = new ReviewSummary();
      const data: ReviewSummaryData = {
        sprintId: SPRINT_ID,
        totalReviewed: 5,
        approvedCount: 4,
        rejectedCount: 1,
        pendingCount: 0,
        retryQueuedCount: 1,
        rejectedTasks: [{ taskId: '032-005', reason: 'Scope violation' }],
        retryTasks: ['032-005'],
      };

      const output = summaryGen.formatReviewSummary(data);

      expect(output).toContain('Review Summary');
      expect(output).toContain('Approved: 4');
      expect(output).toContain('Rejected: 1');
      expect(output).toContain('032-005');
      expect(output).toContain('Scope violation');
      expect(output).toContain('Retry queued');
    });

    it('handles empty review summary', () => {
      const summaryGen = new ReviewSummary();
      const summary = summaryGen.generate(SPRINT_ID, new Map());

      expect(summary.totalReviewed).toBe(0);
      expect(summary.approvedCount).toBe(0);
      expect(summary.rejectedCount).toBe(0);
    });
  });

  // ─── writeReviewReport ───────────────────────────────────────────

  describe('writeReviewReport', () => {
    it('writes review report to .brain/reviews/', () => {
      const summaryGen = new ReviewSummary();
      const data: ReviewSummaryData = {
        sprintId: SPRINT_ID,
        totalReviewed: 5,
        approvedCount: 4,
        rejectedCount: 1,
        pendingCount: 0,
        retryQueuedCount: 1,
        rejectedTasks: [{ taskId: '032-005', reason: 'Test failures' }],
        retryTasks: ['032-005'],
      };

      const outputPath = join(tmpRoot, '.brain', 'reviews', `${SPRINT_ID}-review.md`);
      summaryGen.writeReviewReport(data, outputPath);

      expect(existsSync(outputPath)).toBe(true);
      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('# Review Report');
      expect(content).toContain(SPRINT_ID);
      expect(content).toContain('Approved: 4');
      expect(content).toContain('Rejected: 1');
      expect(content).toContain('032-005');
      expect(content).toContain('Test failures');
    });

    it('creates directory structure if missing', () => {
      const summaryGen = new ReviewSummary();
      const data: ReviewSummaryData = {
        sprintId: SPRINT_ID,
        totalReviewed: 1,
        approvedCount: 1,
        rejectedCount: 0,
        pendingCount: 0,
        retryQueuedCount: 0,
        rejectedTasks: [],
        retryTasks: [],
      };

      const deepPath = join(tmpRoot, 'deep', 'nested', 'reviews', `${SPRINT_ID}-review.md`);
      summaryGen.writeReviewReport(data, deepPath);

      expect(existsSync(deepPath)).toBe(true);
    });

    it('report includes retry queue section', () => {
      const summaryGen = new ReviewSummary();
      const data: ReviewSummaryData = {
        sprintId: SPRINT_ID,
        totalReviewed: 3,
        approvedCount: 1,
        rejectedCount: 2,
        pendingCount: 0,
        retryQueuedCount: 2,
        rejectedTasks: [
          { taskId: '032-004', reason: 'Coverage low' },
          { taskId: '032-005', reason: 'Tests failed' },
        ],
        retryTasks: ['032-004', '032-005'],
      };

      const outputPath = join(tmpRoot, '.brain', 'reviews', `${SPRINT_ID}-review.md`);
      summaryGen.writeReviewReport(data, outputPath);

      const content = readFileSync(outputPath, 'utf-8');
      expect(content).toContain('Retry Queue');
      expect(content).toContain('032-004');
      expect(content).toContain('032-005');
    });
  });

  // ─── Auto mode ───────────────────────────────────────────────────

  describe('Auto mode: approve DONE, retry NO_GO', () => {
    it('auto-approves all DONE and TECH_DEBT tasks', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);

      // Simulate auto mode
      for (const [taskId, evaluation] of EVALUATIONS) {
        if (evaluation === TaskEvaluation.DONE || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
          actions.approveTask(taskId, SPRINT_ID);
        }
      }

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-001')).toBe('approved');
      expect(status.get('032-002')).toBe('approved');
      expect(status.get('032-003')).toBe('approved');
      expect(status.get('032-004')).toBe('approved');
      expect(status.has('032-005')).toBe(false); // NO_GO not yet reviewed
    });

    it('auto-rejects and retries all NO_GO tasks', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);
      const retry = new SelectiveRetry(tasksDir);

      const noGoTaskIds: string[] = [];
      for (const [taskId, evaluation] of EVALUATIONS) {
        if (evaluation === TaskEvaluation.NO_GO) {
          actions.rejectTask(taskId, SPRINT_ID, 'Auto-rejected: NO_GO');
          noGoTaskIds.push(taskId);
        }
      }

      retry.queueForRetry(noGoTaskIds, SPRINT_ID);

      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.get('032-005')).toBe('rejected');

      const queue = retry.getRetryQueue(SPRINT_ID);
      expect(queue!.taskIds).toEqual(['032-005']);
    });

    it('full auto mode: approve DONE + TECH_DEBT, reject + retry NO_GO', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);
      const retry = new SelectiveRetry(tasksDir);
      const summaryGen = new ReviewSummary();

      const noGoTaskIds: string[] = [];

      // Auto-review all tasks
      for (const [taskId, evaluation] of EVALUATIONS) {
        if (evaluation === TaskEvaluation.DONE || evaluation === TaskEvaluation.GO_WITH_TECH_DEBT) {
          actions.approveTask(taskId, SPRINT_ID);
        } else if (evaluation === TaskEvaluation.NO_GO) {
          actions.rejectTask(taskId, SPRINT_ID, 'Auto-rejected: NO_GO');
          noGoTaskIds.push(taskId);
        }
      }

      // Queue NO_GO tasks for retry
      if (noGoTaskIds.length > 0) {
        retry.queueForRetry(noGoTaskIds, SPRINT_ID);
      }

      // Verify review is complete
      expect(actions.isReviewComplete(SPRINT_ID)).toBe(true);

      // Generate summary
      const reviewStatus = actions.getAllReviewStatuses(SPRINT_ID);
      const reasons = new Map<string, string>();
      const state = actions.loadState(SPRINT_ID);
      for (const entry of state.entries) {
        if (entry.reason) {
          reasons.set(entry.taskId, entry.reason);
        }
      }

      const summary = summaryGen.generate(SPRINT_ID, reviewStatus, reasons, noGoTaskIds);
      expect(summary.approvedCount).toBe(4);
      expect(summary.rejectedCount).toBe(1);
      expect(summary.retryQueuedCount).toBe(1);

      // Generate retry directives
      const directives = retry.generateRetryDirectives(noGoTaskIds, TASKS);
      expect(directives).toContain('Rollback mechanism (retry)');

      // Write review report
      const reportPath = join(tmpRoot, '.brain', 'reviews', `${SPRINT_ID}-review.md`);
      summaryGen.writeReviewReport(summary, reportPath);
      expect(existsSync(reportPath)).toBe(true);
    });
  });

  // ─── Full E2E: Sprint -> Review -> Retry ─────────────────────────

  describe('Full E2E: sprint results -> review -> summary -> retry directives -> report', () => {
    it('simulates complete review lifecycle', () => {
      const tasksDir = join(tmpRoot, '.tasks');
      const actions = new ReviewActions(tasksDir);
      const retry = new SelectiveRetry(tasksDir);
      const summaryGen = new ReviewSummary();

      // Step 1: Sprint with 5 tasks completed (3 DONE, 1 TECH_DEBT, 1 NO_GO)
      // (Evaluations already defined above)

      // Step 2: Create review state
      const initialState = actions.loadState(SPRINT_ID);
      expect(initialState.entries).toEqual([]);

      // Step 3: Approve 3 DONE tasks
      actions.approveTask('032-001', SPRINT_ID);
      actions.approveTask('032-002', SPRINT_ID);
      actions.approveTask('032-003', SPRINT_ID);

      // Step 4: Approve TECH_DEBT task
      actions.approveTask('032-004', SPRINT_ID);

      // Step 5: Reject + retry NO_GO task
      actions.rejectTask('032-005', SPRINT_ID, 'All tests failed, scope issues');

      // Step 6: getReviewStatus -> map with statuses
      const status = actions.getAllReviewStatuses(SPRINT_ID);
      expect(status.size).toBe(5);
      expect(status.get('032-001')).toBe('approved');
      expect(status.get('032-002')).toBe('approved');
      expect(status.get('032-003')).toBe('approved');
      expect(status.get('032-004')).toBe('approved');
      expect(status.get('032-005')).toBe('rejected');

      // Step 7: isReviewComplete -> true
      expect(actions.isReviewComplete(SPRINT_ID)).toBe(true);

      // Step 8: Generate retry directives
      retry.queueForRetry(['032-005'], SPRINT_ID);
      const directives = retry.generateRetryDirectives(['032-005'], TASKS);
      expect(directives).toContain('DIRECTIVES');
      expect(directives).toContain('Retry Sprint');
      expect(directives).toContain('Rollback mechanism (retry)');
      expect(directives).toContain('opus');

      // Step 9: ReviewSummary -> counts correct
      const reasons = new Map([['032-005', 'All tests failed, scope issues']]);
      const summary = summaryGen.generate(SPRINT_ID, status, reasons, ['032-005']);
      expect(summary.totalReviewed).toBe(5);
      expect(summary.approvedCount).toBe(4);
      expect(summary.rejectedCount).toBe(1);
      expect(summary.pendingCount).toBe(0);
      expect(summary.retryQueuedCount).toBe(1);
      expect(summary.rejectedTasks[0]!.reason).toBe('All tests failed, scope issues');

      // Step 10: writeReviewReport to .brain/reviews/
      const reportPath = join(tmpRoot, '.brain', 'reviews', `${SPRINT_ID}-review.md`);
      summaryGen.writeReviewReport(summary, reportPath);
      expect(existsSync(reportPath)).toBe(true);

      const reportContent = readFileSync(reportPath, 'utf-8');
      expect(reportContent).toContain('# Review Report');
      expect(reportContent).toContain('Approved: 4');
      expect(reportContent).toContain('Rejected: 1');
      expect(reportContent).toContain('032-005');
      expect(reportContent).toContain('All tests failed, scope issues');
      expect(reportContent).toContain('Retry Queue');

      // Verify formatted summary output
      const formattedSummary = summaryGen.formatReviewSummary(summary);
      expect(formattedSummary).toContain('Review Summary');
      expect(formattedSummary).toContain('Approved: 4');
      expect(formattedSummary).toContain('Rejected: 1');

      // Step 11: Retry queue persisted
      const queue = retry.getRetryQueue(SPRINT_ID);
      expect(queue!.taskIds).toEqual(['032-005']);
    });
  });
});
