import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

export const sprintLogUpdater: DocUpdater = {
  name: 'sprint-log',
  tier: 1,
  internal: false,
  targetFile: 'docs/SPRINT-LOG.md',

  shouldRun(ctx: DocUpdateContext): boolean {
    return ctx.config.auto_docs?.tier1 !== false;
  },

  run(ctx: DocUpdateContext): DocUpdateResult {
    const { projectRoot, sprintResult } = ctx;
    const { sprint, evaluations, metrics } = sprintResult;
    const date = new Date().toISOString().slice(0, 10);
    const sprintNum = sprint.number;

    const sprintLogPath = join(projectRoot, 'docs', 'SPRINT-LOG.md');
    const existing = existsSync(sprintLogPath)
      ? readFileSync(sprintLogPath, 'utf-8')
      : '# Sprint Log\n\n---\n\n';

    const taskLines: string[] = [];
    for (const task of sprint.tasks) {
      const ev = evaluations.get(task.id) ?? task.status;
      taskLines.push(`- ${task.id}: ${task.title} (${ev})`);
    }

    const newSection = [
      `## Sprint ${sprintNum} — ${sprint.id}`,
      '',
      `**Status:** ${sprint.status}`,
      `**Date:** ${date}`,
      `**Duration:** ${Math.round(metrics.durationMs / 1000)}s`,
      '',
      '### Results',
      '',
      '| Metric | Value |',
      '|--------|-------|',
      `| Total Tasks | ${metrics.totalTasks} |`,
      `| Completed | ${metrics.completedTasks} |`,
      `| Tech Debt | ${metrics.techDebtTasks} |`,
      `| No-Go | ${metrics.noGoTasks} |`,
      `| Coverage | ${metrics.coveragePercent.toFixed(1)}% |`,
      `| Duration | ${metrics.durationMs}ms |`,
      '',
      '### Tasks',
      '',
      ...taskLines,
      '',
      '---',
      '',
    ].join('\n');

    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    writeFileSync(sprintLogPath, existing + newSection, 'utf-8');

    return { file: this.targetFile, updated: true, reason: 'updated' };
  },
};
