import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TaskEvaluation } from '../../core/types.js';
import type { TaskResult } from '../../core/types.js';
import type { DocUpdater, DocUpdateContext, DocUpdateResult } from './types.js';

function readPackageVersion(projectRoot: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
    return (pkg as { version?: string }).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface CategoryHints {
  added: string[];
  changed: string[];
  fixed: string[];
}

/**
 * Parse worker-authored `result.notes` for explicit Keep a Changelog category
 * hints. Lines that start with `Added:`, `Changed:`, or `Fixed:` (case
 * insensitive) are routed to the matching section; the rest of the notes are
 * ignored. Multiple hint lines may appear within a single result.
 */
export function parseCategoryHints(notes: string | undefined | null): CategoryHints {
  const hints: CategoryHints = { added: [], changed: [], fixed: [] };
  if (!notes || typeof notes !== 'string') return hints;
  const lines = notes.split(/\r?\n/);
  for (const raw of lines) {
    const match = raw.match(/^\s*(Added|Changed|Fixed)\s*:\s*(.+?)\s*$/i);
    if (!match) continue;
    const category = (match[1] ?? '').toLowerCase();
    const text = (match[2] ?? '').trim();
    if (!text) continue;
    if (category === 'added') hints.added.push(text);
    else if (category === 'changed') hints.changed.push(text);
    else if (category === 'fixed') hints.fixed.push(text);
  }
  return hints;
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function categorizeByTitle(title: string): 'added' | 'fixed' {
  const t = title.toLowerCase();
  return t.includes('fix') || t.includes('bug') ? 'fixed' : 'added';
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
    const { projectRoot, sprintResult, results } = ctx;
    const { sprint, evaluations, metrics } = sprintResult;
    const date = new Date().toISOString().slice(0, 10);
    const version = readPackageVersion(projectRoot);
    const sprintNum = sprint.number;

    const changelogPath = join(projectRoot, 'docs', 'CHANGELOG.md');
    const headerText =
      '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).\n\n';
    const fileExisted = existsSync(changelogPath);
    const existing = fileExisted ? readFileSync(changelogPath, 'utf-8') : headerText;

    const versionTag = `${version}-sprint${String(sprintNum).padStart(2, '0')}`;
    const versionHeader = `## [${versionTag}]`;

    // Idempotency: skip if an entry for this sprint version already exists.
    if (existing.includes(versionHeader)) {
      return {
        file: this.targetFile,
        updated: false,
        reason: 'duplicate_sprint_entry',
      };
    }

    const resultsByTaskId = new Map<string, TaskResult>();
    for (const r of results ?? []) resultsByTaskId.set(r.taskId, r);

    const added: string[] = [];
    const changed: string[] = [];
    const fixed: string[] = [];

    for (const task of sprint.tasks) {
      const ev = evaluations.get(task.id);
      if (ev !== TaskEvaluation.DONE && ev !== TaskEvaluation.GO_WITH_TECH_DEBT) {
        continue; // NO_GO and PENDING tasks are not represented in the changelog.
      }

      const hints = parseCategoryHints(resultsByTaskId.get(task.id)?.notes);
      const hasExplicitHints = hints.added.length + hints.changed.length + hints.fixed.length > 0;

      if (hasExplicitHints) {
        for (const item of hints.added) added.push(`- ${item}`);
        for (const item of hints.changed) changed.push(`- ${item}`);
        for (const item of hints.fixed) fixed.push(`- ${item}`);
        // Tech-debt downgrade still gets a Changed annotation when no explicit
        // Changed hint was provided.
        if (ev === TaskEvaluation.GO_WITH_TECH_DEBT && hints.changed.length === 0) {
          changed.push(`- ${task.title} (completed with tech debt)`);
        }
        continue;
      }

      // Fallback to title heuristic for workers that didn't author hints.
      if (ev === TaskEvaluation.GO_WITH_TECH_DEBT) {
        changed.push(`- ${task.title} (completed with tech debt)`);
        continue;
      }
      const bucket = categorizeByTitle(task.title);
      if (bucket === 'fixed') fixed.push(`- ${task.title}`);
      else added.push(`- ${task.title}`);
    }

    const dedupedAdded = dedupePreserveOrder(added);
    const dedupedChanged = dedupePreserveOrder(changed);
    const dedupedFixed = dedupePreserveOrder(fixed);

    const sections: string[] = [];
    if (dedupedAdded.length > 0) {
      sections.push('### Added\n', ...dedupedAdded.slice(0, 10));
    }
    if (dedupedChanged.length > 0) {
      sections.push('', '### Changed\n', ...dedupedChanged.slice(0, 10));
    }
    if (dedupedFixed.length > 0) {
      sections.push('', '### Fixed\n', ...dedupedFixed.slice(0, 10));
    }

    if (sections.length === 0) {
      sections.push('### Added\n', '- No completed tasks');
    }

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
      reason: fileExisted ? 'updated' : 'created',
    };
  },
};
