import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

export const readmeMetricsUpdater: DocUpdater = {
  name: 'readme-metrics',
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

    // Update test count: "N+ tests" or "N tests"
    if (metrics.coveragePercent > 0) {
      content = content.replace(
        /\d+\+?\s+tests?/g,
        `${Math.round(metrics.coveragePercent * 10)}+ tests`,
      );
    }

    // Update coverage: "N% coverage" or "N.N% coverage"
    if (metrics.coveragePercent > 0) {
      content = content.replace(
        /\d+\.?\d*%\s+coverage/g,
        `${metrics.coveragePercent.toFixed(1)}% coverage`,
      );
    }

    if (content === original) {
      return { file: this.targetFile, updated: false, reason: 'skipped_no_changes' };
    }

    writeFileSync(readmePath, content, 'utf-8');
    return { file: this.targetFile, updated: true, reason: 'updated' };
  },
};
