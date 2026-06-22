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

    // NOTE: the test count is intentionally NOT auto-updated here. The previous
    // implementation wrote `coveragePercent * 10` as the test count — a pure
    // fabrication (88% coverage rendered "880+ tests" while the suite has ~23k),
    // and its blind `/\d+\+?\s+tests?/g` replace also corrupted unrelated prose
    // like the "+5 tests" sprint-log examples. There is no reliable real test
    // count in `metrics` at doc-update time, so the test badge is maintained
    // separately rather than filled with a wrong number (R5: never replace a
    // real source with another literal).

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
