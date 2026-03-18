import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation } from '../../core/types.js';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

export const changelogUpdater: DocUpdater = {
  name: 'changelog',
  tier: 1,
  internal: false,
  targetFile: 'docs/CHANGELOG.md',

  shouldRun(ctx: DocUpdateContext): boolean {
    return ctx.config.auto_docs?.tier1 !== false;
  },

  run(ctx: DocUpdateContext): DocUpdateResult {
    const { projectRoot, sprintResult } = ctx;
    const { sprint, evaluations, metrics } = sprintResult;
    const date = new Date().toISOString().slice(0, 10);
    const sprintNum = sprint.number;

    const changelogPath = join(projectRoot, 'docs', 'CHANGELOG.md');
    const existing = existsSync(changelogPath)
      ? readFileSync(changelogPath, 'utf-8')
      : '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';

    const highlights: string[] = [];
    for (const task of sprint.tasks) {
      const ev = evaluations.get(task.id);
      if (ev === TaskEvaluation.DONE || ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
        highlights.push(`- **${task.title}**: ${ev}`);
      }
    }
    if (highlights.length === 0) highlights.push('- No completed tasks');

    const newEntry = [
      `## [0.1.0-sprint${String(sprintNum).padStart(2, '0')}] - ${date}`,
      '',
      '### Added',
      '',
      ...highlights.slice(0, 10),
      `- **Tasks**: ${metrics.totalTasks} total, ${metrics.completedTasks} done, ${metrics.techDebtTasks} tech debt, ${metrics.noGoTasks} no-go`,
      '',
    ].join('\n');

    const headerEndIdx = existing.indexOf('\n## ');
    const insertAt = headerEndIdx >= 0 ? headerEndIdx + 1 : existing.length;
    const updated = existing.slice(0, insertAt) + newEntry + existing.slice(insertAt);
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    writeFileSync(changelogPath, updated, 'utf-8');

    return { file: this.targetFile, updated: true, reason: existsSync(changelogPath) ? 'updated' : 'created' };
  },
};
