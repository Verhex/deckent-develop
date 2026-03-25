import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { DECKENT_FILE, CLAUDE_FILE, AGENTS_FILE, BRAIN_DIR, SPRINTS_DIR, MEMORY_FILE } from '../../core/constants.js';
import { ensureDeckentImport } from '../../core/utils.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_FILE = 'GEMINI.md';
const CURSOR_RULES_DIR = '.cursor';
const CURSOR_RULES_FILE = join(CURSOR_RULES_DIR, 'rules');
const CODEX_DIR = '.codex';
const CODEX_AGENTS_FILE = join(CODEX_DIR, 'AGENTS.md');
const MAX_FILE_LIST = 50;

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
 * Get git commit date for a file using `git log -1 --format=%aI`.
 * Falls back to mtime if git unavailable.
 */
export function getFileGitDate(root: string, filePath: string): number {
  try {
    const result = spawnSync('git', ['log', '-1', '--format=%aI', '--', filePath], {
      cwd: root,
      encoding: 'utf-8',
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      const ts = new Date(result.stdout.trim()).getTime();
      if (!isNaN(ts)) return ts;
    }
  } catch {
    // fall through to mtime
  }
  try {
    return statSync(join(root, filePath)).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Detect the latest sprint file's commit date from .brain/sprints/.
 * Uses `git log -1 --format=%aI` for accuracy, falls back to mtime.
 * Returns ISO timestamp string or null if no sprint files exist.
 */
export function getLastSprintTimestamp(root: string): { timestamp: string; sprintId: string } | null {
  const sprintsPath = join(root, BRAIN_DIR, SPRINTS_DIR);
  if (!existsSync(sprintsPath)) return null;

  const files = readdirSync(sprintsPath).filter(f => f.startsWith('sprint-') && f.endsWith('.md'));
  if (files.length === 0) return null;

  let latestMs = 0;
  let latestFile = '';
  for (const f of files) {
    let ms = 0;
    // Try git commit date first
    try {
      const gitResult = spawnSync('git', ['log', '-1', '--format=%aI', '--', join(BRAIN_DIR, SPRINTS_DIR, f)], {
        cwd: root,
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (gitResult && gitResult.status === 0 && gitResult.stdout?.trim()) {
        const ts = new Date(gitResult.stdout.trim()).getTime();
        if (!isNaN(ts)) ms = ts;
      }
    } catch {
      // ignore git errors
    }
    // Fall back to mtime
    if (!ms) {
      try {
        ms = statSync(join(sprintsPath, f)).mtimeMs;
      } catch {
        // skip unreadable files
        continue;
      }
    }
    if (ms > latestMs) {
      latestMs = ms;
      latestFile = f;
    }
  }

  if (!latestFile) return null;

  const sprintId = latestFile.replace('.md', '');
  const timestamp = new Date(latestMs).toISOString();
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
 * Truncate a file list to MAX_FILE_LIST with "and N more..." suffix.
 */
export function truncateFileList(files: string[]): string {
  if (files.length <= MAX_FILE_LIST) return files.join(', ');
  const shown = files.slice(0, MAX_FILE_LIST);
  const remaining = files.length - MAX_FILE_LIST;
  return `${shown.join(', ')}, and ${remaining} more...`;
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
    sectionLines.push(`- Modified: ${truncateFileList(syncResult.modified)}`);
  }
  if (syncResult.added.length > 0) {
    sectionLines.push(`- New: ${truncateFileList(syncResult.added)}`);
  }
  if (syncResult.deleted.length > 0) {
    sectionLines.push(`- Deleted: ${truncateFileList(syncResult.deleted)}`);
  }
  if (syncResult.renamed.length > 0) {
    sectionLines.push(`- Renamed: ${truncateFileList(syncResult.renamed)}`);
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
    lines.push(`  Modified: ${truncateFileList(syncResult.modified)}`);
  }
  if (syncResult.added.length > 0) {
    lines.push(`  New: ${truncateFileList(syncResult.added)}`);
  }
  if (syncResult.deleted.length > 0) {
    lines.push(`  Deleted: ${truncateFileList(syncResult.deleted)}`);
  }
  if (syncResult.renamed.length > 0) {
    lines.push(`  Renamed: ${truncateFileList(syncResult.renamed)}`);
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

/**
 * Sync GEMINI.md — ensure @DECKENT.md reference.
 */
export function syncGeminiAdapter(root: string, dryRun = false): boolean {
  const filePath = join(root, GEMINI_FILE);
  if (!dryRun) {
    ensureDeckentImport(filePath);
  }
  return true;
}

/**
 * Sync .cursor/rules — ensure @DECKENT.md reference, creating dir if needed.
 */
export function syncCursorAdapter(root: string, dryRun = false): boolean {
  const dirPath = join(root, CURSOR_RULES_DIR);
  if (!existsSync(dirPath)) {
    if (dryRun) return true; // would create
    try {
      mkdirSync(dirPath, { recursive: true });
    } catch {
      return false;
    }
  }
  if (!dryRun) {
    ensureDeckentImport(join(root, CURSOR_RULES_FILE));
  }
  return true;
}

/**
 * Sync Codex config: creates .codex/AGENTS.md with @DECKENT.md reference
 * if .codex/ directory exists. Format mirrors AGENTS.md pattern.
 */
export function syncCodexAdapter(root: string, dryRun = false): boolean {
  const codexDir = join(root, CODEX_DIR);
  if (!existsSync(codexDir)) {
    return false; // .codex/ not present — skip silently
  }
  if (!dryRun) {
    ensureDeckentImport(join(root, CODEX_AGENTS_FILE));
  }
  return true;
}

/**
 * Build provider-specific config entries for sync output.
 * Returns a map of provider → { file, synced }.
 */
export function buildProviderSyncMap(root: string, dryRun = false): Record<string, { file: string; synced: boolean }> {
  return {
    claude: {
      file: CLAUDE_FILE,
      synced: (() => {
        if (!dryRun) ensureDeckentImport(join(root, CLAUDE_FILE));
        return true;
      })(),
    },
    codex: {
      file: CODEX_AGENTS_FILE,
      synced: syncCodexAdapter(root, dryRun),
    },
    gemini: {
      file: GEMINI_FILE,
      synced: syncGeminiAdapter(root, dryRun),
    },
    cursor: {
      file: CURSOR_RULES_FILE,
      synced: syncCursorAdapter(root, dryRun),
    },
  };
}

/**
 * Sync adapter files: CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules, .codex/AGENTS.md
 */
export function syncAdapterFiles(root: string, dryRun = false): string[] {
  const synced: string[] = [];

  // Core adapter files always synced
  const coreFiles = [
    { file: CLAUDE_FILE, label: 'CLAUDE.md' },
    { file: AGENTS_FILE, label: 'AGENTS.md' },
  ];

  for (const { file, label } of coreFiles) {
    if (!dryRun) {
      ensureDeckentImport(join(root, file));
    }
    synced.push(label);
  }

  // GEMINI.md
  if (syncGeminiAdapter(root, dryRun)) {
    synced.push('GEMINI.md');
  }

  // .cursor/rules — create dir if needed
  if (syncCursorAdapter(root, dryRun)) {
    synced.push('.cursor/rules');
  }

  // .codex/AGENTS.md — only if .codex/ dir exists
  if (syncCodexAdapter(root, dryRun)) {
    synced.push('.codex/AGENTS.md');
  }

  return synced;
}

// ─── Command Registration ───────────────────────────────────────────

export function registerSync(program: Command): void {
  program
    .command('sync')
    .description('Sync adapter files and detect out-of-band changes since last sprint')
    .option('--git-only', 'Only detect git changes (skip adapter file sync)')
    .option('--adapters-only', 'Only sync adapter files (skip git change detection)')
    .option('--dry-run', 'Preview changes without writing anything')
    .option('--json', 'Output result as JSON')
    .action((opts: { gitOnly?: boolean; adaptersOnly?: boolean; dryRun?: boolean; json?: boolean }) => {
      const root = resolveProjectRoot();

      const output: {
        adaptersSynced?: string[];
        gitChanges?: SyncResult | null;
        warnings?: string[];
      } = {};
      const warnings: string[] = [];

      // --- Adapter file sync ---
      if (!opts.gitOnly) {
        if (!existsSync(join(root, DECKENT_FILE))) {
          if (opts.json) {
            console.log(JSON.stringify({ error: 'DECKENT.md not found. Run deckent init first.' }));
          } else {
            printError(new Error('DECKENT.md not found. Run deckent init first.'));
          }
          process.exitCode = 1;
          return;
        }

        const synced = syncAdapterFiles(root, opts.dryRun);
        output.adaptersSynced = synced;

        if (!opts.json) {
          for (const label of synced) {
            print(`${opts.dryRun ? '[dry-run] ' : ''}${label} synced → @DECKENT.md ensured`);
          }
          if (!opts.dryRun) {
            print('Sync complete. Existing file contents preserved.');
          }
        }
      }

      // --- Git-based change detection ---
      if (!opts.adaptersOnly) {
        if (!isGitRepo(root)) {
          warnings.push('Not a git repository — skipping change detection.');
          if (!opts.json) {
            print('Warning: Not a git repository — skipping change detection.');
          }
          if (opts.json) {
            output.warnings = warnings;
            console.log(JSON.stringify(output, null, 2));
          }
          return;
        }

        const lastSprint = getLastSprintTimestamp(root);
        if (!lastSprint) {
          warnings.push('No previous sprint found in .brain/sprints/ — skipping change detection.');
          if (!opts.json) {
            print('No previous sprint found in .brain/sprints/ — skipping change detection.');
          }
          if (opts.json) {
            output.warnings = warnings;
            console.log(JSON.stringify(output, null, 2));
          }
          return;
        }

        const commits = getCommitsSince(root, lastSprint.timestamp);
        const changes = getChangedFiles(root, commits.length);

        const syncResult: SyncResult = {
          commits: commits.length,
          sprintId: lastSprint.sprintId,
          ...changes,
        };

        output.gitChanges = syncResult;

        if (syncResult.commits === 0) {
          if (!opts.json) print('No changes since last sprint');
        } else {
          if (!opts.dryRun) {
            writeSyncToMemory(root, syncResult);
          }
          if (!opts.json) {
            print('');
            if (opts.dryRun) print('[dry-run] Would write to MEMORY.md:');
            print(formatSyncOutput(syncResult));
          }
        }
      }

      if (opts.json) {
        if (warnings.length > 0) output.warnings = warnings;
        console.log(JSON.stringify(output, null, 2));
      }
    });
}
