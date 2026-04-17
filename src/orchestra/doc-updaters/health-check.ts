import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

const HEALTH_DOC_PATH = 'docs/reference/health-check.md';

export const healthCheckUpdater: DocUpdater = {
  name: 'health-check',
  tier: 2,
  internal: true,
  targetFile: HEALTH_DOC_PATH,

  shouldRun(ctx: DocUpdateContext): boolean {
    if (ctx.config.auto_docs?.tier2 === false) return false;
    if (!ctx.isInternalProject) return false;
    return true;
  },

  run(ctx: DocUpdateContext): DocUpdateResult {
    const { projectRoot, sprintResult } = ctx;
    const { sprint, metrics } = sprintResult;
    const healthCheckPath = join(projectRoot, HEALTH_DOC_PATH);
    const date = new Date().toISOString().slice(0, 10);

    if (!existsSync(healthCheckPath)) {
      const dir = dirname(healthCheckPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const initial = [
        `# Deckent Health Check — Post-Sprint ${sprint.number}`,
        '',
        `*Last audit: ${date}*`,
        '',
        '| Metric | Value |',
        '|--------|-------|',
        `| Tests | ${metrics.totalTasks} |`,
        `| Sprints | ${sprint.number} |`,
        '',
      ].join('\n');
      writeFileSync(healthCheckPath, initial, 'utf-8');
      return { file: this.targetFile, updated: true, reason: 'created' };
    }

    let content = readFileSync(healthCheckPath, 'utf-8');
    const original = content;

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
