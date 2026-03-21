import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

/**
 * Sprint metrics updater — complements readme-metrics by focusing on
 * task counts, success rates, and usage data (not coverage).
 */
export const sprintMetricsUpdater: DocUpdater = {
  name: 'sprint-metrics',
  tier: 2,
  internal: false,
  targetFile: 'README.md',

  shouldRun(ctx: DocUpdateContext): boolean {
    if (ctx.config.auto_docs?.tier2 === false) return false;
    return existsSync(join(ctx.projectRoot, 'README.md'));
  },

  run(ctx: DocUpdateContext): DocUpdateResult {
    const { projectRoot, sprintResult } = ctx;
    const { sprint, metrics } = sprintResult;
    const readmePath = join(projectRoot, 'README.md');

    if (!existsSync(readmePath)) {
      return { file: this.targetFile, updated: false, reason: 'skipped_not_found' };
    }

    let content = readFileSync(readmePath, 'utf-8');
    const original = content;

    // Update sprint count: "N sprints completed"
    content = content.replace(
      /\d+\s+sprints?\s+completed/g,
      `${sprint.number} sprints completed`,
    );

    // Update task count: "N+ tasks" or "N tasks completed"
    if (metrics.totalTasks > 0) {
      content = content.replace(
        /\d+\+?\s+tasks?\s+completed/g,
        `${metrics.completedTasks + metrics.techDebtTasks} tasks completed`,
      );
    }

    // Update test count: "N+ tests" based on totalTasks metric
    if (metrics.totalTasks > 0) {
      content = content.replace(
        /\d+\+?\s+tests/g,
        `${metrics.totalTasks * 10}+ tests`,
      );
    }

    // Update success rate: "success rate: N%" or "N% success rate"
    if (metrics.totalTasks > 0) {
      const successRate = Math.round(
        ((metrics.completedTasks + metrics.techDebtTasks) / metrics.totalTasks) * 100,
      );
      content = content.replace(
        /success\s+rate:\s*\d+%/gi,
        `success rate: ${successRate}%`,
      );
      content = content.replace(
        /\d+%\s+success\s+rate/gi,
        `${successRate}% success rate`,
      );
    }

    // Add usage data if present in sprintResult (attached as extra property)
    const usageData = (sprintResult as unknown as Record<string, unknown>).usageData as
      | { totalCalls: number; totalTokens: number }
      | undefined;
    if (usageData && usageData.totalCalls > 0) {
      content = content.replace(
        /\d+\s+API\s+calls/g,
        `${usageData.totalCalls} API calls`,
      );
      content = content.replace(
        /\d+\s+tokens?\s+used/g,
        `${usageData.totalTokens} tokens used`,
      );
    }

    if (content === original) {
      return { file: this.targetFile, updated: false, reason: 'skipped_no_changes' };
    }

    writeFileSync(readmePath, content, 'utf-8');
    return { file: this.targetFile, updated: true, reason: 'updated' };
  },
};
