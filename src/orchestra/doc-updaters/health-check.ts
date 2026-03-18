import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

export const healthCheckUpdater: DocUpdater = {
  name: 'health-check',
  tier: 2,
  internal: true,
  targetFile: 'docs/HEALTH-CHECK.md',

  shouldRun(ctx: DocUpdateContext): boolean {
    if (ctx.config.auto_docs?.tier2 === false) return false;
    if (!ctx.isInternalProject) return false;
    return existsSync(join(ctx.projectRoot, 'docs', 'HEALTH-CHECK.md'));
  },

  run(ctx: DocUpdateContext): DocUpdateResult {
    const { projectRoot, sprintResult } = ctx;
    const { sprint, metrics } = sprintResult;
    const healthCheckPath = join(projectRoot, 'docs', 'HEALTH-CHECK.md');

    if (!existsSync(healthCheckPath)) {
      return { file: this.targetFile, updated: false, reason: 'skipped_not_found' };
    }

    let content = readFileSync(healthCheckPath, 'utf-8');
    const original = content;
    const date = new Date().toISOString().slice(0, 10);

    // Update metric table rows
    content = content.replace(
      /\| Tests \| \d+ \|/g,
      `| Tests | ${metrics.totalTasks} |`,
    );
    content = content.replace(
      /\| Sprints \| \d+ \|/g,
      `| Sprints | ${sprint.number} |`,
    );

    // Update "Post-Sprint N" header
    content = content.replace(
      /Post-Sprint \d+/g,
      `Post-Sprint ${sprint.number}`,
    );

    // Update last audit date
    content = content.replace(
      /Last audit:.*\*/,
      `Last audit: ${date}*`,
    );

    if (content === original) {
      return { file: this.targetFile, updated: false, reason: 'skipped_no_changes' };
    }

    writeFileSync(healthCheckPath, content, 'utf-8');
    return { file: this.targetFile, updated: true, reason: 'updated' };
  },
};
