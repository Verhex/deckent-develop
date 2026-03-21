import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation } from '../../core/types.js';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

function readPackageVersion(projectRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    return (pkg as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

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
    const version = readPackageVersion(projectRoot);
    const sprintNum = sprint.number;

    const changelogPath = join(projectRoot, 'docs', 'CHANGELOG.md');
    const headerText =
      '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).\n\n';
    const existing = existsSync(changelogPath)
      ? readFileSync(changelogPath, 'utf-8')
      : headerText;

    const added: string[] = [];
    const changed: string[] = [];
    const fixed: string[] = [];

    for (const task of sprint.tasks) {
      const ev = evaluations.get(task.id);
      if (ev === TaskEvaluation.DONE) {
        // Categorize: titles containing "fix" go to Fixed, rest to Added
        const titleLower = task.title.toLowerCase();
        if (titleLower.includes('fix') || titleLower.includes('bug')) {
          fixed.push(`- ${task.title}`);
        } else {
          added.push(`- ${task.title}`);
        }
      } else if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
        changed.push(`- ${task.title} (completed with tech debt)`);
      }
      // NO_GO tasks are not included
    }

    const sections: string[] = [];
    if (added.length > 0) {
      sections.push('### Added\n', ...added.slice(0, 10));
    }
    if (changed.length > 0) {
      sections.push('', '### Changed\n', ...changed.slice(0, 10));
    }
    if (fixed.length > 0) {
      sections.push('', '### Fixed\n', ...fixed.slice(0, 10));
    }

    if (sections.length === 0) {
      sections.push('### Added\n', '- No completed tasks');
    }

    const versionTag = `${version}-sprint${String(sprintNum).padStart(2, '0')}`;
    const taskSummary = `\n\n_Tasks: ${metrics.totalTasks} total, ${metrics.completedTasks} done, ${metrics.techDebtTasks} tech debt, ${metrics.noGoTasks} no-go_`;

    const newEntry = [`## [${versionTag}] - ${date}\n`, ...sections, taskSummary, ''].join('\n');

    const headerEndIdx = existing.indexOf('\n## ');
    const insertAt = headerEndIdx >= 0 ? headerEndIdx + 1 : existing.length;
    const updated = existing.slice(0, insertAt) + newEntry + '\n' + existing.slice(insertAt);
    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    writeFileSync(changelogPath, updated, 'utf-8');

    return {
      file: this.targetFile,
      updated: true,
      reason: existsSync(changelogPath) ? 'updated' : 'created',
    };
  },
};
