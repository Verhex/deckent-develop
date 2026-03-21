// ─── Review Summary ─────────────────────────────────────────────────
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReviewDecision } from './review-actions.js';

export interface ReviewSummaryData {
  sprintId: string;
  totalReviewed: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  retryQueuedCount: number;
  rejectedTasks: Array<{ taskId: string; reason?: string }>;
  retryTasks: string[];
}

export class ReviewSummary {
  generate(
    sprintId: string,
    reviewStatus: Map<string, ReviewDecision>,
    rejectionReasons?: Map<string, string>,
    retryTaskIds?: string[],
  ): ReviewSummaryData {
    let approvedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    let retryCount = 0;
    const rejectedTasks: Array<{ taskId: string; reason?: string }> = [];

    for (const [taskId, decision] of reviewStatus) {
      if (decision === 'approved') approvedCount++;
      else if (decision === 'rejected') {
        rejectedCount++;
        rejectedTasks.push({
          taskId,
          reason: rejectionReasons?.get(taskId),
        });
      } else if (decision === 'retry') {
        retryCount++;
      } else {
        pendingCount++;
      }
    }

    const effectiveRetryIds = retryTaskIds ?? [];
    const effectiveRetryCount = effectiveRetryIds.length > 0 ? effectiveRetryIds.length : retryCount;

    return {
      sprintId,
      totalReviewed: reviewStatus.size,
      approvedCount,
      rejectedCount,
      pendingCount,
      retryQueuedCount: effectiveRetryCount,
      rejectedTasks,
      retryTasks: effectiveRetryIds.length > 0
        ? effectiveRetryIds
        : [...reviewStatus.entries()]
            .filter(([_, d]) => d === 'retry')
            .map(([id]) => id),
    };
  }

  formatReviewSummary(summary: ReviewSummaryData): string {
    const lines: string[] = [];
    lines.push(`Review Summary for ${summary.sprintId}:`);
    lines.push('');
    lines.push(`  Total reviewed: ${summary.totalReviewed}`);
    lines.push(`  Approved: ${summary.approvedCount}`);
    lines.push(`  Rejected: ${summary.rejectedCount}`);
    lines.push(`  Pending: ${summary.pendingCount}`);
    lines.push(`  Queued for retry: ${summary.retryQueuedCount}`);

    if (summary.rejectedTasks.length > 0) {
      lines.push('');
      lines.push('Rejected tasks:');
      for (const task of summary.rejectedTasks) {
        const reason = task.reason ? ` - ${task.reason}` : '';
        lines.push(`  ${task.taskId}${reason}`);
      }
    }

    if (summary.retryTasks.length > 0) {
      lines.push('');
      lines.push('Retry queued:');
      for (const taskId of summary.retryTasks) {
        lines.push(`  ${taskId}`);
      }
    }

    return lines.join('\n');
  }

  writeReviewReport(summary: ReviewSummaryData, outputPath: string): void {
    const lines: string[] = [];
    lines.push(`# Review Report: ${summary.sprintId}`);
    lines.push('');
    lines.push('## Summary');
    lines.push(`- Total reviewed: ${summary.totalReviewed}`);
    lines.push(`- Approved: ${summary.approvedCount}`);
    lines.push(`- Rejected: ${summary.rejectedCount}`);
    lines.push(`- Pending: ${summary.pendingCount}`);
    lines.push(`- Retry queued: ${summary.retryQueuedCount}`);

    if (summary.rejectedTasks.length > 0) {
      lines.push('');
      lines.push('## Rejected Tasks');
      for (const task of summary.rejectedTasks) {
        const reason = task.reason ? `: ${task.reason}` : '';
        lines.push(`- ${task.taskId}${reason}`);
      }
    }

    if (summary.retryTasks.length > 0) {
      lines.push('');
      lines.push('## Retry Queue');
      for (const taskId of summary.retryTasks) {
        lines.push(`- ${taskId}`);
      }
    }

    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  }
}
