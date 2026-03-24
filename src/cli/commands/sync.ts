import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE, BRAIN_DIR, SPRINTS_DIR, MEMORY_FILE } from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface SyncResult {
  commits: number;
  sprintId: string | null;
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Detect the latest sprint file's mtime from .brain/sprints/.
 * Returns ISO timestamp string or null if no sprint files exist.
 */
export function getLastSprintTimestamp(root: string): { timestamp: string; sprintId: string } | null {
  const sprintsPath = join(root, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsPath)) return null;

  const files = readdirSync(sprintsPath).filter(f => f.startsWith('sprint-') && f.endsWith('.md'));
  if (files.length === 0) return null;

  let latestMtime = 0;
  let latestFile = '';
  for (const f of files) {
    try {
      const st = statSync(join(sprintsPath, f));
      const mtime = st.mtimeMs;
      if (mtime > latestMtime) {
        latestMtime = mtime;
        latestFile = f;
      }
    } catch {
      // skip unreadable files
    }
  }

  if (!latestFile) return null;

  const sprintId = latestFile.replace('.md', '');
  const timestamp = new Date(latestMtime).toISOString();
  return { timestamp, sprintId };
}

/**
 * Check if the current directory is inside a git repository.
 */
export function isGitRepo(root: string): boolean {
  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 5000,
  });
  return result.status === 0 && result.stdout.trim() === 'true';
}

/**
 * Get git commits since a given ISO timestamp.
 * Returns array of oneline commit strings.
 */
export function getCommitsSince(root: string, since: string): string[] {
  const result = spawnSync('git', ['log', '--oneline', `--since=${since}`], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 10000,
  });
  if (result.status !== 0) return [];
  return result.stdout.trim().split('\n').filter(line => line.length > 0);
}

/**
 * Get changed files from git diff --stat for the last N commits.
 * Categorizes into modified, added, deleted, renamed.
 */
export function getChangedFiles(root: string, commitCount: number): Pick<SyncResult, 'modified' | 'added' | 'deleted' | 'renamed'> {
  const modified: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const renamed: string[] = [];

  if (commitCount <= 0) return { modified, added, deleted, renamed };

  const result = spawnSync('git', ['diff', '--name-status', `HEAD~${commitCount}`, 'HEAD'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 10000,
  });

  if (result.status !== 0) return { modified, added, deleted, renamed };

  const lines = result.stdout.trim().split('\n').filter(l => l.length > 0);
  for (const line of lines) {
    const parts = line.split('\t');
    const status = parts[0]?.charAt(0);
    const filePath = parts[1] ?? '';

    switch (status) {
      case 'A':
        added.push(filePath);
        break;
      case 'D':
        deleted.push(filePath);
        break;
      case 'R':
        renamed.push(parts[2] ?? filePath);
        break;
      case 'M':
      default:
        if (filePath) modified.push(filePath);
        break;
    }
  }

  return { modified, added, deleted, renamed };
}

/**
 * Write sync summary to MEMORY.md under ## Out-of-band Changes section.
 */
export function writeSyncToMemory(root: string, syncResult: SyncResult): void {
  const memoryPath = join(root, BRAIN_DIR, MEMORY_FILE);
  if (!existsSync(memoryPath)) return;

  const content = readFileSync(memoryPath, 'utf-8');

  // Build new section
  const sectionLines: string[] = [];
  sectionLines.push('## Out-of-band Changes');
  const sprintLabel = syncResult.sprintId ? `Sprint #${syncResult.sprintId.replace('sprint-', '')}` : 'last sprint';
  sectionLines.push(`- ${syncResult.commits} commit(s) since ${sprintLabel}`);

  if (syncResult.modified.length > 0) {
    sectionLines.push(`- Modified: ${syncResult.modified.join(', ')}`);
  }
  if (syncResult.added.length > 0) {
    sectionLines.push(`- New: ${syncResult.added.join(', ')}`);
  }
  if (syncResult.deleted.length > 0) {
    sectionLines.push(`- Deleted: ${syncResult.deleted.join(', ')}`);
  }
  if (syncResult.renamed.length > 0) {
    sectionLines.push(`- Renamed: ${syncResult.renamed.join(', ')}`);
  }

  const newSection = sectionLines.join('\n');

  // Replace existing section or append
  const sectionRegex = /## Out-of-band Changes[\s\S]*?(?=\n## |\n*$)/;
  if (sectionRegex.test(content)) {
    const updated = content.replace(sectionRegex, newSection);
    writeFileSync(memoryPath, updated, 'utf-8');
  } else {
    appendFileSync(memoryPath, '\n' + newSection + '\n', 'utf-8');
  }
}

/**
 * Format sync result for terminal output.
 */
export function formatSyncOutput(syncResult: SyncResult): string {
  const lines: string[] = [];
  const sprintLabel = syncResult.sprintId ? `Sprint #${syncResult.sprintId.replace('sprint-', '')}` : 'last sprint';

  if (syncResult.commits === 0) {
    return 'No changes since last sprint';
  }

  lines.push(`Synced: ${syncResult.commits} commit(s) since ${sprintLabel}`);

  if (syncResult.modified.length > 0) {
    lines.push(`  Modified: ${syncResult.modified.join(', ')}`);
  }
  if (syncResult.added.length > 0) {
    lines.push(`  New: ${syncResult.added.join(', ')}`);
  }
  if (syncResult.deleted.length > 0) {
    lines.push(`  Deleted: ${syncResult.deleted.join(', ')}`);
  }
  if (syncResult.renamed.length > 0) {
    lines.push(`  Renamed: ${syncResult.renamed.join(', ')}`);
  }

  lines.push('  → Added to MEMORY.md for next sprint context');

  return lines.join('\n');
}

/**
 * Run the full sync: detect out-of-band changes since last sprint.
 * Returns SyncResult or null if sync cannot be performed.
 */
export function runSync(root: string): SyncResult | null {
  if (!isGitRepo(root)) {
    return null; // caller handles warning
  }

  const lastSprint = getLastSprintTimestamp(root);
  if (!lastSprint) {
    return null; // caller handles info message
  }

  const commits = getCommitsSince(root, lastSprint.timestamp);
  const changes = getChangedFiles(root, commits.length);

  return {
    commits: commits.length,
    sprintId: lastSprint.sprintId,
    ...changes,
  };
}

// ─── Command Registration ───────────────────────────────────────────

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Sync adapter files and detect out-of-band changes since last sprint')
    .option('--git-only', 'Only detect git changes (skip adapter file sync)')
    .option('--adapters-only', 'Only sync adapter files (skip git change detection)')
    .action((opts: { gitOnly?: boolean; adaptersOnly?: boolean }) => {
      const root = resolveProjectRoot();

      // --- Adapter file sync (original behavior) ---
      if (!opts.gitOnly) {
        if (!existsSync(join(root, DECKENT_FILE))) {
          printError(new Error('DECKENT.md not found. Run deckent init first.'));
          process.exitCode = 1;
          return;
        }

        ensureDeckentImport(join(root, CLAUDE_FILE));
        print('CLAUDE.md synced → @DECKENT.md ensured');

        ensureDeckentImport(join(root, AGENTS_FILE));
        print('AGENTS.md synced → @DECKENT.md ensured');

        print('Sync complete. Existing file contents preserved.');
      }

      // --- Git-based change detection ---
      if (!opts.adaptersOnly) {
        if (!isGitRepo(root)) {
          print('Warning: Not a git repository — skipping change detection.');
          return;
        }

        const lastSprint = getLastSprintTimestamp(root);
        if (!lastSprint) {
          print('No previous sprint found in .brain/sprints/ — skipping change detection.');
          return;
        }

        const commits = getCommitsSince(root, lastSprint.timestamp);
        const changes = getChangedFiles(root, commits.length);

        const syncResult: SyncResult = {
          commits: commits.length,
          sprintId: lastSprint.sprintId,
          ...changes,
        };

        if (syncResult.commits === 0) {
          print('No changes since last sprint');
          return;
        }

        writeSyncToMemory(root, syncResult);
        print('');
        print(formatSyncOutput(syncResult));
      }
    });
}
