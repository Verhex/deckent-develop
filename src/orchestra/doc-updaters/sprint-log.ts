import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

export type SprintLogTerminalStatus = 'COMPLETE' | 'ABORTED';

function replaceSprintSections(existing: string, heading: string, newSection: string): string {
  const headingPattern = /^## Sprint \d+ — .*$/gm;
  const sectionStarts = [...existing.matchAll(headingPattern)].map((match) => ({
    heading: match[0],
    index: match.index,
  }));
  const matchingIndexes = sectionStarts
    .map((section, index) => section.heading === heading ? index : -1)
    .filter((index) => index >= 0);

  if (matchingIndexes.length === 0) {
    const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    return `${existing}${separator}${newSection}`;
  }

  let updated = existing.slice(0, sectionStarts[0]!.index);
  let replacementWritten = false;
  for (const [index, section] of sectionStarts.entries()) {
    const end = sectionStarts[index + 1]?.index ?? existing.length;
    if (section.heading !== heading) {
      updated += existing.slice(section.index, end);
    } else if (!replacementWritten) {
      updated += newSection;
      replacementWritten = true;
    }
  }
  return updated;
}

function atomicWrite(path: string, content: string): void {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporaryPath, content, 'utf-8');
    renameSync(temporaryPath, path);
  } catch (error) {
    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

export function upsertSprintLog(
  ctx: DocUpdateContext,
  terminalStatus: SprintLogTerminalStatus,
): DocUpdateResult {
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

  const heading = `## Sprint ${sprintNum} — ${sprint.id}`;
  const newSection = [
    heading,
    '',
    `**Status:** ${terminalStatus}`,
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
  atomicWrite(sprintLogPath, replaceSprintSections(existing, heading, newSection));

  return { file: sprintLogUpdater.targetFile, updated: true, reason: 'updated' };
}

export const sprintLogUpdater: DocUpdater = {
  name: 'sprint-log',
  tier: 1,
  internal: false,
  targetFile: 'docs/SPRINT-LOG.md',

  shouldRun(ctx: DocUpdateContext): boolean {
    return ctx.config.auto_docs?.tier1 !== false;
  },

  run(ctx: DocUpdateContext): DocUpdateResult {
    if (ctx.sprintResult.sprint.status !== 'COMPLETE' && ctx.sprintResult.sprint.status !== 'ABORTED') {
      return { file: this.targetFile, updated: false, reason: 'terminal-status-required' };
    }
    return upsertSprintLog(ctx, ctx.sprintResult.sprint.status);
  },
};
