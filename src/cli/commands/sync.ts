import { existsSync, readdirSync, statSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { DECKENT_FILE, DECKENT_DIR, CLAUDE_FILE, AGENTS_FILE, BRAIN_DIR, SPRINTS_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { ensureDeckentImport, debugLog } from '../../core/utils.js';
import { MemoryStore } from '../../core/memory-store.js';
import { syncBuiltinAgentPrompts } from '../../core/agent-prompt-sync.js';
import { syncBuiltinAgentManifests } from '../../core/agent-manifest-sync.js';
import type { AgentManifestSyncReport } from '../../core/agent-manifest-sync.js';
import type { AgentPromptSyncReport } from '../../core/agent-prompt-sync.js';
import {
  syncBuiltinSkillManifests,
  type BuiltinSkillSyncReport,
} from '../../core/skill-pool.js';
import { migrateManifestV2toV3 } from '../../core/manifest-migrator.js';
import { BUILTIN_DOMAINS } from '../../core/routing/vocabulary-builtin.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { ensureCursorRules } from '../helpers/cursor-config.js';
import { cliContractMessage } from '../helpers/message-catalog/cli-run.js';
import {
  initializeWorkspaceArtifacts,
  type WorkspaceArtifactAction,
} from '../../orchestra/workspace-artifacts.js';
import { getWorkspaceArtifactDescriptor } from '../../core/workspace-artifact-contract.js';
import { buildSyncAggregate } from '../helpers/sync-aggregate.js';
import type { SyncCommandOutput, SyncAggregateSummary } from '../helpers/sync-aggregate.js';
import type { SyncChangeDetectionMode, SyncChangeDetectionIssue, SyncChangeDetection } from '../helpers/sync-change-detection.js';

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_FILE = 'GEMINI.md';
const CURSOR_RULES_DIR = '.cursor';
const CURSOR_RULES_FILE = join(CURSOR_RULES_DIR, 'rules', 'deckent.mdc');
const CODEX_DIR = '.codex';
const CODEX_AGENTS_FILE = join(CODEX_DIR, 'AGENTS.md');
const MAX_FILE_LIST = 50;

// Local copy of the shadow agent-manifest location, mirroring the same
// per-module duplication established by agent-pool.ts / agent-prompt-sync.ts
// (each owner of this concept keeps its own small constant rather than a
// shared cross-module import — ADR-D-006 cohesion-based module boundaries).
const AGENTS_DIR = join(DECKENT_DIR, 'agents');
const AGENT_MANIFEST_FILENAME = 'agent.json';

// ─── Types ──────────────────────────────────────────────────────────

/**
 * Change-detection provenance contract — see
 * `../helpers/sync-change-detection.ts` (the single runtime source for the
 * closed mode / issue-code enums). Re-exported here so existing consumers of
 * this module keep importing the types from the producer.
 */
export type {
  SyncChangeDetectionMode,
  SyncChangeDetectionIssueCode,
  SyncChangeDetectionIssue,
  SyncChangeDetection,
} from '../helpers/sync-change-detection.js';

export interface SyncResult {
  commits: number;
  sprintId: string | null;
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
  detection: SyncChangeDetection;
}

/**
 * A single adapter-file sync failure, typed and non-throwing.
 * Collected per-entry so one bad entry (e.g. a path that is a directory,
 * not a file) cannot abort the whole adapter sweep.
 */
export interface AdapterSyncError {
  label: string;
  file: string;
  reason: string;
}

export interface AdapterSyncReport {
  synced: string[];
  errors: AdapterSyncError[];
}

export interface WorkspaceSyncReport {
  changed: string[];
  unchanged: string[];
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

/** Typed result of `probeCommitsSince`: the commit list, or WHY it is unknown. */
export interface SyncCommitProbe {
  /** Oneline commit strings; empty when `issue` is set (unknown, not zero). */
  commits: string[];
  /** `null` on success (a genuinely empty list is a SUCCESSFUL zero). */
  issue: SyncChangeDetectionIssue | null;
}

/**
 * Get git commits since a given ISO timestamp, distinguishing a successful
 * empty result from a failed `git log` (7104): a failure is reported as a
 * typed `GIT_LOG_FAILED` issue and MUST NOT be read as "0 commits" —
 * e.g. an unborn branch (repository with no commits yet) makes `git log`
 * exit 128, and a caller that fed that `0` into `getChangedFiles` would
 * otherwise print a clean "no changes" over an unverified working tree.
 */
export function probeCommitsSince(root: string, since: string): SyncCommitProbe {
  const result = spawnSync('git', ['log', '--oneline', `--since=${since}`], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 10000,
  });
  if (result.status !== 0) {
    return { commits: [], issue: { code: 'GIT_LOG_FAILED', detail: firstStderrLine(result.stderr, result.status) } };
  }
  return { commits: result.stdout.trim().split('\n').filter(line => line.length > 0), issue: null };
}

/**
 * Legacy shape of `probeCommitsSince`: the commit list only, `[]` on failure.
 * Kept for existing consumers of this export — it cannot tell a failed log
 * from zero commits, so NEW callers use `probeCommitsSince` / `collectGitChanges`.
 */
export function getCommitsSince(root: string, since: string): string[] {
  return probeCommitsSince(root, since).commits;
}

/**
 * First line of a git stderr blob, or a status-code fallback when stderr is
 * empty (e.g. the process was killed, or wrote nothing before failing).
 */
function firstStderrLine(stderr: string | null | undefined, status: number | null): string {
  const line = (stderr ?? '').split('\n').find(l => l.trim().length > 0);
  return line ? line.trim() : `exit ${status ?? 'unknown'}`;
}

/**
 * Get changed files for the last N commits and report HOW the comparison
 * was made (or why it could not be trusted) via `detection` — a silent git
 * failure must never be reported as "no changes" (7104):
 * - `commitCount < historyDepth` → `git diff --name-status -M HEAD~N HEAD` ('range').
 * - `commitCount >= historyDepth` → every path present at HEAD via
 *   `git ls-tree -r --name-only HEAD` ('root-fallback'): exactly the diff
 *   against the empty tree (nothing to modify, delete or rename from), but
 *   derived from the repository itself instead of a fixed empty-tree object
 *   id — so it holds for SHA-256 repositories, where the SHA-1 id does not exist.
 * - any git failure → 'unavailable' with a typed issue; lists empty.
 *
 * `commitCount` is the number of commits a SUCCESSFUL `probeCommitsSince`
 * returned (see `collectGitChanges`) — a non-negative safe integer. Any other
 * value is a caller bug and throws (`RangeError`) rather than returning an
 * authoritative-looking empty result.
 */
export function getChangedFiles(root: string, commitCount: number): Pick<SyncResult, 'modified' | 'added' | 'deleted' | 'renamed' | 'detection'> {
  if (!Number.isSafeInteger(commitCount) || commitCount < 0) {
    throw new RangeError(`getChangedFiles: commitCount must be a non-negative safe integer, got ${String(commitCount)}`);
  }

  const modified: string[] = [];
  const added: string[] = [];
  const deleted: string[] = [];
  const renamed: string[] = [];

  if (commitCount === 0) {
    return { modified, added, deleted, renamed, detection: { mode: 'range', issue: null } };
  }

  const revListResult = spawnSync('git', ['rev-list', '--count', 'HEAD'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 10000,
  });

  const historyDepth = revListResult.status === 0 ? parseInt(revListResult.stdout.trim(), 10) : NaN;
  if (revListResult.status !== 0 || !Number.isFinite(historyDepth)) {
    return {
      modified,
      added,
      deleted,
      renamed,
      detection: {
        mode: 'unavailable',
        issue: { code: 'GIT_REV_LIST_FAILED', detail: firstStderrLine(revListResult.stderr, revListResult.status) },
      },
    };
  }

  const attemptedMode: SyncChangeDetectionMode = commitCount >= historyDepth ? 'root-fallback' : 'range';

  if (attemptedMode === 'root-fallback') {
    const lsTreeResult = spawnSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], {
      cwd: root,
      encoding: 'utf-8',
      timeout: 10000,
    });
    if (lsTreeResult.status !== 0) {
      return {
        modified,
        added,
        deleted,
        renamed,
        detection: {
          mode: 'unavailable',
          issue: { code: 'GIT_LS_TREE_FAILED', detail: firstStderrLine(lsTreeResult.stderr, lsTreeResult.status) },
        },
      };
    }
    for (const line of lsTreeResult.stdout.split('\n')) {
      if (line.length > 0) added.push(line);
    }
    return { modified, added, deleted, renamed, detection: { mode: 'root-fallback', issue: null } };
  }

  const diffResult = spawnSync('git', ['diff', '--name-status', '-M', `HEAD~${commitCount}`, 'HEAD'], {
    cwd: root,
    encoding: 'utf-8',
    timeout: 10000,
  });

  if (diffResult.status !== 0) {
    return {
      modified,
      added,
      deleted,
      renamed,
      detection: {
        // The file lists below are empty and not trustworthy — the mode the
        // caller was attempting is irrelevant once the diff itself failed.
        mode: 'unavailable',
        issue: { code: 'GIT_DIFF_FAILED', detail: firstStderrLine(diffResult.stderr, diffResult.status) },
      },
    };
  }

  const lines = diffResult.stdout.trim().split('\n').filter(l => l.length > 0);
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

  return { modified, added, deleted, renamed, detection: { mode: 'range', issue: null } };
}

/**
 * The full git provenance step of a sync: commit count since `since` PLUS the
 * changed-file lists, as ONE typed record. A failed `git log` short-circuits
 * to `commits: 0` + `detection: unavailable / GIT_LOG_FAILED` — it never
 * reaches `getChangedFiles`, so a failure can never masquerade as the
 * successful-zero early return there (7104).
 */
export function collectGitChanges(root: string, since: string): Omit<SyncResult, 'sprintId'> {
  const probe = probeCommitsSince(root, since);
  if (probe.issue) {
    return {
      commits: 0,
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      detection: { mode: 'unavailable', issue: probe.issue },
    };
  }
  return { commits: probe.commits.length, ...getChangedFiles(root, probe.commits.length) };
}

/**
 * Truncate a file list to MAX_FILE_LIST with "and N more..." suffix.
 */
export function truncateFileList(files: string[], lang: string = getLanguage()): string {
  if (files.length <= MAX_FILE_LIST) return files.join(', ');
  const shown = files.slice(0, MAX_FILE_LIST);
  const remaining = files.length - MAX_FILE_LIST;
  return `${shown.join(', ')}${getMessage('sync.format_more', lang, { remaining: String(remaining) })}`;
}

/**
 * Whether `path` currently exists as a directory. Any stat failure (path
 * missing, or an unstubbed mock in tests) is treated as "not a directory" so
 * the caller falls through to its normal (pre-existing) behavior.
 */
function isDirectoryPath(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Non-throwing wrapper around `ensureDeckentImport`. Guards against a
 * directory occupying the expected file path (e.g. `.cursor/rules` is a
 * directory of `.mdc` files in real-world Cursor projects, not a single
 * file — the live EISDIR repro) and against any other read/write failure,
 * returning a typed error instead of letting either kind abort the caller's
 * sweep.
 */
function applyDeckentImport(filePath: string, label: string): AdapterSyncError | null {
  if (isDirectoryPath(filePath)) {
    return { label, file: filePath, reason: 'Path exists as a directory, expected a file' };
  }
  try {
    ensureDeckentImport(filePath);
    return null;
  } catch (e) {
    return { label, file: filePath, reason: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * B) Tolerant MEMORY.md section replacement.
 * Replaces a named section without depending on brittle regex lookaheads.
 */
export function replaceMemorySection(content: string, sectionHeading: string, newSectionContent: string): string {
  const lines = content.split('\n');
  // Escape special regex characters in the heading
  const escapedHeading = sectionHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingPattern = new RegExp(`^#{1,3}\\s+${escapedHeading}\\s*$`, 'i');

  let sectionStart = -1;
  let sectionEnd = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (headingPattern.test(lines[i] ?? '')) {
      sectionStart = i;
      const headingLevel = ((lines[i] ?? '').match(/^(#{1,3})/)?.[1]?.length) ?? 2;
      for (let j = i + 1; j < lines.length; j++) {
        const nextMatch = (lines[j] ?? '').match(/^(#{1,3})\s/);
        if (nextMatch && ((nextMatch[1]?.length) ?? 99) <= headingLevel) {
          sectionEnd = j;
          break;
        }
      }
      break;
    }
  }

  const newLines = newSectionContent.split('\n');
  if (sectionStart >= 0) {
    lines.splice(sectionStart, sectionEnd - sectionStart, ...newLines);
  } else {
    if (lines[lines.length - 1] !== '') lines.push('');
    lines.push(...newLines);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * Record the sync summary as the Memory V2 `Out-of-band Changes` entry.
 *
 * B8 (Memory V2): writes to memory.db (`type='memory'`) instead of the legacy
 * `.brain/MEMORY.md` file. Upserts a single `sync-out-of-band` entry — the
 * latest sync overwrites it, mirroring the old "## Out-of-band Changes"
 * section-replace behaviour. A missing DB is a graceful no-op.
 */
export function writeSyncToMemory(root: string, syncResult: SyncResult): void {
  const dbPath = join(root, BRAIN_DIR, MEMORY_DB_FILE);
  if (!existsSync(dbPath)) return;

  const sectionLines: string[] = ['## Out-of-band Changes'];
  const sprintLabel = syncResult.sprintId ? `Sprint #${syncResult.sprintId.replace('sprint-', '')}` : 'last sprint';
  sectionLines.push(`- ${syncResult.commits} commit(s) since ${sprintLabel}`);

  // F1 (7104): this record is a persisted, English-only machine-read record in
  // memory.db, not a user surface — pin to 'en' so a DECKENT_LANGUAGE=tr shell
  // can never mix languages into the stored record.
  if (syncResult.modified.length > 0) {
    sectionLines.push(`- Modified: ${truncateFileList(syncResult.modified, 'en')}`);
  }
  if (syncResult.added.length > 0) {
    sectionLines.push(`- New: ${truncateFileList(syncResult.added, 'en')}`);
  }
  if (syncResult.deleted.length > 0) {
    sectionLines.push(`- Deleted: ${truncateFileList(syncResult.deleted, 'en')}`);
  }
  if (syncResult.renamed.length > 0) {
    sectionLines.push(`- Renamed: ${truncateFileList(syncResult.renamed, 'en')}`);
  }

  try {
    const store = new MemoryStore(dbPath);
    try {
      store.upsert({
        id: 'sync-out-of-band',
        type: 'memory',
        title: 'Out-of-band Changes',
        content: sectionLines.join('\n'),
        source: 'system',
        sprint_id: syncResult.sprintId ?? undefined,
        tags: ['sync', 'out-of-band', 'memory'],
      }, 'sync');
    } finally {
      store.close();
    }
  } catch (e) {
    debugLog('writeSyncToMemory', e);
  }
}

/**
 * Format sync result for terminal output.
 */
export function formatSyncOutput(syncResult: SyncResult, lang: string = getLanguage()): string {
  if (syncResult.commits === 0) {
    return getMessage('sync.no_changes', lang);
  }

  const lines: string[] = [];
  const sprintLabel = syncResult.sprintId
    ? getMessage('sync.format_sprint_label', lang, { n: syncResult.sprintId.replace('sprint-', '') })
    : getMessage('sync.format_last_sprint', lang);

  lines.push(getMessage('sync.format_synced', lang, { commits: String(syncResult.commits), sprint: sprintLabel }));

  if (syncResult.modified.length > 0) {
    lines.push(getMessage('sync.format_modified', lang, { files: truncateFileList(syncResult.modified, lang) }));
  }
  if (syncResult.added.length > 0) {
    lines.push(getMessage('sync.format_new', lang, { files: truncateFileList(syncResult.added, lang) }));
  }
  if (syncResult.deleted.length > 0) {
    lines.push(getMessage('sync.format_deleted', lang, { files: truncateFileList(syncResult.deleted, lang) }));
  }
  if (syncResult.renamed.length > 0) {
    lines.push(getMessage('sync.format_renamed', lang, { files: truncateFileList(syncResult.renamed, lang) }));
  }

  lines.push(getMessage('sync.format_recorded', lang));

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

  return {
    sprintId: lastSprint.sprintId,
    ...collectGitChanges(root, lastSprint.timestamp),
  };
}

/**
 * Sync GEMINI.md — ensure @DECKENT.md reference.
 */
export function syncGeminiAdapter(root: string, dryRun = false, onError?: (err: AdapterSyncError) => void): boolean {
  const filePath = join(root, GEMINI_FILE);
  if (!dryRun) {
    const err = applyDeckentImport(filePath, 'GEMINI.md');
    if (err) {
      onError?.(err);
      return false;
    }
  }
  return true;
}

/**
 * Sync .cursor/rules/deckent.mdc — ensure @DECKENT.md reference without
 * replacing owner-authored Cursor rules.
 */
export function syncCursorAdapter(root: string, dryRun = false, onError?: (err: AdapterSyncError) => void): boolean {
  const dirPath = join(root, CURSOR_RULES_DIR, 'rules');
  if (!existsSync(dirPath)) {
    if (dryRun) return true; // would create
    try {
      mkdirSync(dirPath, { recursive: true });
    } catch {
      return false;
    }
  }
  if (!dryRun) {
    try {
      ensureCursorRules(join(root, CURSOR_RULES_FILE));
    } catch (cause) {
      onError?.({
        label: '.cursor/rules/deckent.mdc',
        file: join(root, CURSOR_RULES_FILE),
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return false;
    }
  }
  return true;
}

/**
 * Sync Codex config: creates .codex/AGENTS.md with @DECKENT.md reference
 * if .codex/ directory exists. Format mirrors AGENTS.md pattern.
 */
export function syncCodexAdapter(root: string, dryRun = false, onError?: (err: AdapterSyncError) => void): boolean {
  const codexDir = join(root, CODEX_DIR);
  if (!existsSync(codexDir)) {
    return false; // .codex/ not present — skip silently
  }
  if (!dryRun) {
    const err = applyDeckentImport(join(root, CODEX_AGENTS_FILE), '.codex/AGENTS.md');
    if (err) {
      onError?.(err);
      return false;
    }
  }
  return true;
}

/**
 * Build host-adapter entries for sync output.
 * The keys identify supported host surfaces, not execution providers.
 */
export function buildHostAdapterSyncMap(root: string, dryRun = false): Record<string, { file: string; synced: boolean }> {
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
 * @deprecated Compatibility alias. Use buildHostAdapterSyncMap: Cursor and
 * similar integrations are host adapters, not execution providers.
 */
export const buildProviderSyncMap = buildHostAdapterSyncMap;

/**
 * Sync adapter files: CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules, .codex/AGENTS.md
 * Per-entry failures (e.g. a path that is a directory, not a file) are typed,
 * collected, and never abort the sweep — see `syncAdapterFilesWithReport`.
 */
export function syncAdapterFiles(root: string, dryRun = false): string[] {
  return syncAdapterFilesWithReport(root, dryRun).synced;
}

/**
 * Same sweep as `syncAdapterFiles`, but returns which entries failed and why
 * instead of silently dropping that information. Never throws: a directory
 * occupying an adapter file's path (the live EISDIR repro) or any other
 * read/write failure becomes a typed `AdapterSyncError`, not an aborted sweep.
 */
export function syncAdapterFilesWithReport(root: string, dryRun = false): AdapterSyncReport {
  const synced: string[] = [];
  const errors: AdapterSyncError[] = [];
  const collect = (err: AdapterSyncError) => errors.push(err);

  // Core adapter files always synced
  const coreFiles = [
    { file: CLAUDE_FILE, label: 'CLAUDE.md' },
    { file: AGENTS_FILE, label: 'AGENTS.md' },
  ];

  for (const { file, label } of coreFiles) {
    if (!dryRun) {
      const err = applyDeckentImport(join(root, file), label);
      if (err) {
        collect(err);
        continue;
      }
    }
    synced.push(label);
  }

  // GEMINI.md
  if (syncGeminiAdapter(root, dryRun, collect)) {
    synced.push('GEMINI.md');
  }

  // .cursor/rules — create dir if needed
  if (syncCursorAdapter(root, dryRun, collect)) {
    synced.push('.cursor/rules');
  }

  // .codex/AGENTS.md — only if .codex/ dir exists
  if (syncCodexAdapter(root, dryRun, collect)) {
    synced.push('.codex/AGENTS.md');
  }

  return { synced, errors };
}

// ─── Agent Capabilities Migration Sync (445-011) ────────────────────

/**
 * One migration issue surfaced for a single agent id (the migrator's own
 * `ManifestMigrationIssue.manifestId` is replaced with the shadow directory
 * name here, so callers can correlate without re-parsing the manifest).
 */
export interface AgentCapabilitiesMigrationIssue {
  agentId: string;
  code: string;
  message: string;
}

export interface AgentCapabilitiesSyncReport {
  /** Agent ids whose manifest was migrated to carry a provisional v3 `capabilities` block. */
  migrated: string[];
  /** Agent ids that already carried `capabilities` — left byte-untouched. */
  alreadyV3: string[];
  /** Non-fatal problems encountered while migrating (never aborts the sweep). */
  issues: AgentCapabilitiesMigrationIssue[];
  /**
   * Agent ids skipped because the manifest sync kept the shadow local
   * (missing baseline or local edit); left byte-untouched.
   */
  protected: string[];
}

function emptyAgentCapabilitiesSyncReport(): AgentCapabilitiesSyncReport {
  return { migrated: [], alreadyV3: [], issues: [], protected: [] };
}

/**
 * Options for {@link syncAgentCapabilities}. The legacy plain-`boolean`
 * `dryRun` call form (predates F1/7104) is still accepted directly by the
 * function for source compatibility with existing callers/tests — this
 * object form is additive, not a breaking replacement.
 */
export interface AgentCapabilitiesSyncOptions {
  /** When true, compute the report but never write to disk. */
  dryRun?: boolean;
  /**
   * Agent ids the manifest sync (`syncBuiltinAgentManifests`) reported as
   * kept-local (kind `'missing-baseline'` or `'local-edit'`). These shadows
   * are unverifiable/user-owned — skipped before this function ever reads
   * or migrates them (F1: they must never be silently overwritten here).
   */
  protectedAgentIds?: readonly string[];
}

/**
 * V2 -> V3 capabilities dual-carry sync. For each builtin agent manifest under
 * `.deckent/agents/<id>/agent.json` (the shadow copy the runtime actually
 * loads — see agent-pool.ts's loadAgents()) that lacks a `capabilities` block,
 * runs `migrateManifestV2toV3` and writes the result ALONGSIDE the existing
 * `activation.rules` (dual-carry — nothing removed), flagged
 * `capabilitiesProvisional: true`. A manifest that already carries
 * `capabilities`, or whose `source` isn't `'builtin'`, is left byte-untouched.
 * A manifest whose agent id is in `protectedAgentIds` is skipped entirely
 * (F1: the preceding three-way manifest sync already determined this shadow
 * is locally owned/unverifiable and must not be touched here either).
 *
 * Unlike the 444-005 PROMPT.md shadow sync, this needs no external "builtin
 * source" reference: every input the migrator reads (activation rules,
 * deniedTools, domain, expertise, preferredModel) already lives on the same
 * manifest object being migrated. Never throws: one unreadable/malformed
 * manifest is recorded as a typed issue and the sweep continues.
 */
export function syncAgentCapabilities(
  root: string,
  opts: boolean | AgentCapabilitiesSyncOptions = false,
): AgentCapabilitiesSyncReport {
  const resolved: AgentCapabilitiesSyncOptions = typeof opts === 'boolean' ? { dryRun: opts } : opts;
  const dryRun = resolved.dryRun ?? false;
  const protectedSet = new Set(resolved.protectedAgentIds ?? []);
  const report = emptyAgentCapabilitiesSyncReport();
  const agentsDir = join(root, AGENTS_DIR);
  if (!existsSync(agentsDir)) return report;

  let entries: Dirent[];
  try {
    entries = readdirSync(agentsDir, { withFileTypes: true }) as unknown as Dirent[];
  } catch {
    return report;
  }
  if (!Array.isArray(entries)) return report;

  for (const entry of entries) {
    if (!entry.isDirectory || !entry.isDirectory()) continue;
    const agentId = entry.name;
    if (agentId === 'archive') continue;

    // F1: shadows the manifest sync kept local (missing baseline or a real
    // local edit) are unverifiable/user-owned — never read or migrated here.
    if (protectedSet.has(agentId)) {
      report.protected.push(agentId);
      continue;
    }

    const manifestPath = join(agentsDir, agentId, AGENT_MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) continue;

    let raw: string;
    try {
      raw = readFileSync(manifestPath, 'utf8');
    } catch (e) {
      report.issues.push({ agentId, code: 'read-error', message: e instanceof Error ? e.message : String(e) });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      report.issues.push({ agentId, code: 'invalid-json', message: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      report.issues.push({ agentId, code: 'invalid-manifest', message: 'agent.json is not an object' });
      continue;
    }
    const manifest = parsed as Record<string, unknown>;

    if (manifest.source !== 'builtin') continue;

    if (manifest.capabilities && typeof manifest.capabilities === 'object') {
      report.alreadyV3.push(agentId);
      continue;
    }

    const { capabilities, issues } = migrateManifestV2toV3(manifest, BUILTIN_DOMAINS);
    for (const issue of issues) {
      report.issues.push({ agentId, code: issue.code, message: issue.message });
    }

    const migratedManifest = { ...manifest, capabilities, capabilitiesProvisional: true };
    if (!dryRun) {
      writeFileSync(manifestPath, JSON.stringify(migratedManifest, null, 2) + '\n', 'utf8');
    }
    report.migrated.push(agentId);
  }

  return report;
}

// ─── Managed Workspace Artifact Sync (697-002) ─────────────────────

const MANAGED_WORKSPACE_IDS = ['tools', 'boot', 'worker-guide'] as const;
const PRESERVED_WORKSPACE_IDS = ['identity', 'stats-snapshot'] as const;

interface FileSnapshot {
  path: string;
  content: string | null;
}

function snapshotWorkspaceFiles(root: string, includeManaged: boolean): FileSnapshot[] {
  const ids = includeManaged
    ? [...PRESERVED_WORKSPACE_IDS, ...MANAGED_WORKSPACE_IDS]
    : [...PRESERVED_WORKSPACE_IDS];
  return ids.map((id) => {
    const path = join(root, getWorkspaceArtifactDescriptor(id).path);
    return { path, content: existsSync(path) ? readFileSync(path, 'utf8') : null };
  });
}

function restoreWorkspaceFiles(snapshots: FileSnapshot[]): void {
  for (const snapshot of snapshots) {
    if (snapshot.content === null) {
      rmSync(snapshot.path, { force: true });
    } else if (!existsSync(snapshot.path) || readFileSync(snapshot.path, 'utf8') !== snapshot.content) {
      writeFileSync(snapshot.path, snapshot.content, 'utf8');
    }
  }
}

function readWorkspaceConfig(root: string): { projectName: string; language: string } {
  try {
    const value = JSON.parse(readFileSync(join(root, DECKENT_DIR, 'config.json'), 'utf8')) as {
      projectName?: unknown;
      language?: unknown;
    };
    return {
      projectName: typeof value.projectName === 'string' ? value.projectName : root.split(/[\\/]/).pop() ?? 'project',
      language: typeof value.language === 'string' ? value.language : getLanguage(),
    };
  } catch {
    return { projectName: root.split(/[\\/]/).pop() ?? 'project', language: getLanguage() };
  }
}

/** Regenerate only registry-owned workspace sections; user/snapshot artifacts stay byte-identical. */
export function syncWorkspaceArtifacts(root: string, dryRun = false): WorkspaceSyncReport {
  // A project without an initialized workspace (no .deckent dir) has nothing to
  // regenerate — report empty instead of throwing from the renderer's realpath
  // canonicalization. Init, not sync, owns first-time materialization.
  if (!existsSync(join(root, DECKENT_DIR))) {
    return { changed: [], unchanged: [] };
  }
  const snapshots = snapshotWorkspaceFiles(root, dryRun);
  const config = readWorkspaceConfig(root);
  let actions: WorkspaceArtifactAction[] = [];
  try {
    actions = initializeWorkspaceArtifacts({
      projectRoot: root,
      projectName: config.projectName,
      language: config.language,
    }).actions;
  } finally {
    restoreWorkspaceFiles(snapshots);
  }

  const managed = actions.filter((action) =>
    (MANAGED_WORKSPACE_IDS as readonly string[]).includes(action.id));
  return {
    changed: managed.filter((action) => action.action !== 'unchanged').map((action) => action.path),
    unchanged: managed.filter((action) => action.action === 'unchanged').map((action) => action.path),
  };
}

// ─── Command Registration ───────────────────────────────────────────

export function registerSync(program: Command): void {
  const helpLang = getLanguage(undefined);
  program
    .command('sync')
    .description(getMessage('cli.sync.desc', getLanguage(undefined)))
    .option('--git-only', cliContractMessage('cliContract.sync.opt.git_only', helpLang))
    .option('--adapters-only', cliContractMessage('cliContract.sync.opt.adapters_only', helpLang))
    .option('--dry-run', cliContractMessage('cliContract.sync.opt.dry_run', helpLang))
    .option('--json', cliContractMessage('cliContract.sync.opt.json', helpLang))
    .action((opts: { gitOnly?: boolean; adaptersOnly?: boolean; dryRun?: boolean; json?: boolean }) => {
      const root = resolveProjectRoot();
      const lang = getLanguage();

      const output: SyncCommandOutput & { summary?: SyncAggregateSummary } = {};
      const warnings: string[] = [];

      // 7104 SYNC-PROVENANCE-TRUTH-001: the aggregate (`output.summary`) is the
      // single source of truth for every count this action reports, in both
      // --json and text mode. `emitJson` stamps it onto `output` immediately
      // before the one-and-only JSON stdout write; `printAggregateSummary`
      // derives the same numbers for the human-readable one-line footer. Both
      // helpers close over the same mutable `output`, so whichever fields the
      // action has populated so far are always what gets summarized.
      const emitJson = (): void => {
        output.summary = buildSyncAggregate(output);
        console.log(JSON.stringify(output));
      };

      const printAggregateSummary = (): void => {
        const summary = buildSyncAggregate(output);
        print(getMessage('sync.aggregate_summary', lang, {
          adapters: String(summary.adapters.synced),
          skills: String(summary.skills.created + summary.skills.updated),
          commits: String(summary.git ? summary.git.commits : 0),
          conflicts: String(summary.conflicts.length),
          missing: String(summary.missingBaseline.count),
        }));
      };

      // --- Adapter file sync ---
      if (!opts.gitOnly) {
        if (!existsSync(join(root, DECKENT_FILE))) {
          const deckentNotFoundMsg = getMessage('sync.deckent_not_found', getLanguage());
          if (opts.json) {
            console.log(JSON.stringify({ error: deckentNotFoundMsg }));
          } else {
            printError(new Error(deckentNotFoundMsg));
          }
          process.exitCode = 1;
          return;
        }

        const adapterReport = syncAdapterFilesWithReport(root, opts.dryRun);
        output.adaptersSynced = adapterReport.synced;
        if (adapterReport.errors.length > 0) {
          output.adapterErrors = adapterReport.errors;
        }

        if (!opts.json) {
          const prefix = opts.dryRun ? getMessage('sync.dry_run_prefix', lang) : '';
          for (const label of adapterReport.synced) {
            print(getMessage('sync.adapter_synced', lang, { prefix, label }));
          }
          for (const err of adapterReport.errors) {
            print(getMessage('sync.adapter_skipped', lang, { label: err.label, file: err.file, reason: err.reason }));
          }
          if (!opts.dryRun) {
            print(getMessage('sync.complete', lang));
          }
        }

        // --- Builtin agent PROMPT.md -> .deckent/agents/<id>/ shadow sync (444-005) ---
        const promptSyncReport: AgentPromptSyncReport = syncBuiltinAgentPrompts(root, { dryRun: opts.dryRun });
        output.agentPromptSync = promptSyncReport;

        if (!opts.json) {
          const prefix = opts.dryRun ? getMessage('sync.dry_run_prefix', lang) : '';
          for (const id of promptSyncReport.created) {
            print(getMessage('sync.agent_prompt_created', lang, { prefix, id }));
          }
          for (const id of promptSyncReport.updated) {
            print(getMessage('sync.agent_prompt_updated', lang, { prefix, id }));
          }
          // 7104: only a real three-way conflict ('local-edit') is presented as
          // a per-item Conflict line — 'missing-baseline' entries (unverifiable
          // provenance, not necessarily a local edit) are summarized once below,
          // right before the git-changes section, never printed per item here.
          for (const conflict of promptSyncReport.conflicts) {
            if (conflict.kind !== 'local-edit') continue;
            print(getMessage('sync.conflict_local_edit', lang, {
              scope: getMessage('sync.scope_prompt', lang),
              id: conflict.agentId,
              path: conflict.shadowPath,
            }));
          }
        }

        // --- Builtin agent.json -> shadow three-way sync (446, ROUTING-V3 Slice-1) ---
        // ORDER CONTRACT: three-way manifest sync runs BEFORE the capabilities
        // migrator — provenance-proven shadows adopt the new builtin content
        // (real capability blocks) first, so the migrator below only fills
        // provisional blocks for shadows that STILL lack capabilities
        // (kept-local edits). Never both on the same shadow in one run.
        const manifestSyncReport: AgentManifestSyncReport = syncBuiltinAgentManifests(root, { dryRun: opts.dryRun });
        output.agentManifestSync = manifestSyncReport;

        if (!opts.json) {
          const prefix = opts.dryRun ? getMessage('sync.dry_run_prefix', lang) : '';
          for (const id of manifestSyncReport.created) {
            print(getMessage('sync.agent_manifest_created', lang, { prefix, id }));
          }
          for (const id of manifestSyncReport.updated) {
            print(getMessage('sync.agent_manifest_updated', lang, { prefix, id }));
          }
          // 7104: same local-edit-only presentation rule as the prompt sync above.
          for (const conflict of manifestSyncReport.conflicts) {
            if (conflict.kind !== 'local-edit') continue;
            print(getMessage('sync.conflict_local_edit', lang, {
              scope: getMessage('sync.scope_manifest', lang),
              id: conflict.agentId,
              path: conflict.shadowPath,
            }));
          }
        }

        // --- Builtin agent.json V2->V3 capabilities dual-carry sync (445-011) ---
        // F1 (7104): shadows the manifest sync above kept local (kind
        // 'missing-baseline' or 'local-edit') are unverifiable/user-owned —
        // carried forward as protectedAgentIds so the capabilities migrator
        // never reads or rewrites them either.
        const protectedAgentIds = [...new Set([
          ...manifestSyncReport.keptLocal,
          ...manifestSyncReport.conflicts.map((c) => c.agentId),
        ])].sort();
        const capabilitiesSyncReport = syncAgentCapabilities(root, { dryRun: opts.dryRun, protectedAgentIds });
        output.agentCapabilitiesSync = capabilitiesSyncReport;

        if (!opts.json) {
          const prefix = opts.dryRun ? getMessage('sync.dry_run_prefix', lang) : '';
          for (const id of capabilitiesSyncReport.migrated) {
            print(getMessage('sync.capabilities_migrated', lang, { prefix, id }));
          }
          for (const issue of capabilitiesSyncReport.issues) {
            print(getMessage('sync.capabilities_issue', lang, { id: issue.agentId, code: issue.code, message: issue.message }));
          }
          print(getMessage('sync.capabilities_summary', lang, {
            migrated: String(capabilitiesSyncReport.migrated.length),
            alreadyV3: String(capabilitiesSyncReport.alreadyV3.length),
          }));
          if (capabilitiesSyncReport.protected.length > 0) {
            print(getMessage('sync.capabilities_protected', lang, {
              count: String(capabilitiesSyncReport.protected.length),
              // readdirSync enumeration order is not guaranteed stable across
              // platforms/filesystems — sort so this line's content is
              // deterministic regardless of host (Law 2: every environment).
              ids: [...capabilitiesSyncReport.protected].sort().join(', '),
            }));
          }
        }

        // --- Builtin skill definition -> v2-derived shadow manifest sync ---
        const skillSyncReport: BuiltinSkillSyncReport = syncBuiltinSkillManifests(root, { dryRun: opts.dryRun });
        output.skillManifestSync = skillSyncReport;
        if (!opts.json) {
          for (const id of skillSyncReport.created) {
            print(getMessage('sync.skill_manifest_created', getLanguage(), {
              prefix: opts.dryRun ? getMessage('sync.dry_run_prefix', getLanguage()) : '', id,
            }));
          }
          for (const id of skillSyncReport.updated) {
            print(getMessage('sync.skill_manifest_updated', getLanguage(), {
              prefix: opts.dryRun ? getMessage('sync.dry_run_prefix', getLanguage()) : '', id,
            }));
          }
          for (const id of skillSyncReport.keptLocal) {
            print(getMessage('sync.skill_manifest_kept_local', getLanguage(), { id }));
          }
          for (const issue of skillSyncReport.issues) {
            print(getMessage('sync.skill_manifest_issue', getLanguage(), {
              id: issue.skillId, reason: issue.reason,
            }));
          }
          print(getMessage('sync.skill_manifest_summary', getLanguage(), {
            changed: String(skillSyncReport.created.length + skillSyncReport.updated.length),
            unchanged: String(skillSyncReport.unchanged.length),
          }));
        }

        const workspaceSyncReport = syncWorkspaceArtifacts(root, opts.dryRun);
        output.workspaceSync = workspaceSyncReport;
        if (!opts.json) {
          for (const path of workspaceSyncReport.changed) {
            print(getMessage('sync.workspace_updated', getLanguage(), {
              prefix: opts.dryRun ? getMessage('sync.dry_run_prefix', getLanguage()) : '',
              path,
            }));
          }
          print(getMessage('sync.workspace_summary', getLanguage(), {
            changed: String(workspaceSyncReport.changed.length),
            unchanged: String(workspaceSyncReport.unchanged.length),
          }));
        }
      }

      // 7104: one summary line for every shadow kept as-is because it has no
      // recorded sync baseline (unverifiable provenance, NOT a conflict —
      // see agent-sync-conflict.ts). Printed once here, after both the prompt
      // and manifest sections above and before the git-changes section below,
      // never per-item. A `--git-only` run never populates agentPromptSync /
      // agentManifestSync, so the aggregate's count is 0 and nothing prints.
      if (!opts.json) {
        const preGitSummary = buildSyncAggregate(output);
        if (preGitSummary.missingBaseline.count > 0) {
          print(getMessage('sync.missing_baseline_summary', lang, {
            count: String(preGitSummary.missingBaseline.count),
            ids: preGitSummary.missingBaseline.agentIds.join(', '),
          }));
        }
      }

      // --- Git-based change detection ---
      if (!opts.adaptersOnly) {
        if (!isGitRepo(root)) {
          const notGitRepoMsg = getMessage('sync.not_git_repo', lang);
          warnings.push(notGitRepoMsg);
          if (opts.json) {
            output.warnings = warnings;
            emitJson();
          } else {
            print(notGitRepoMsg);
            printAggregateSummary();
          }
          return;
        }

        const lastSprint = getLastSprintTimestamp(root);
        if (!lastSprint) {
          // C) Explicit warning when no previous sprint exists
          const noSprintMsg = getMessage('sync.no_previous_sprint', lang);
          warnings.push(noSprintMsg);
          if (opts.json) {
            output.warnings = warnings;
            emitJson();
          } else {
            print(noSprintMsg);
            printAggregateSummary();
          }
          return;
        }

        const syncResult: SyncResult = {
          sprintId: lastSprint.sprintId,
          ...collectGitChanges(root, lastSprint.timestamp),
        };

        output.gitChanges = syncResult;

        if (syncResult.detection.issue) {
          // Git failed at some step: the commit count and/or the file lists
          // are UNKNOWN, not zero. Never print "no changes", and never persist
          // an unverified record to memory — the typed issue is the output.
          if (!opts.json) {
            print('');
            print(getMessage('sync.git_change_detection_unavailable', lang, {
              code: syncResult.detection.issue.code,
              detail: syncResult.detection.issue.detail,
            }));
            if (syncResult.commits > 0) print(formatSyncOutput(syncResult, lang));
          }
        } else if (syncResult.commits === 0) {
          if (!opts.json) print(getMessage('sync.no_changes', lang));
        } else {
          if (!opts.dryRun) {
            writeSyncToMemory(root, syncResult);
          }
          if (!opts.json) {
            print('');
            if (opts.dryRun) print(getMessage('sync.dry_run_memory', lang));
            if (syncResult.detection.mode === 'root-fallback') {
              print(getMessage('sync.git_change_detection_root_fallback', lang));
            }
            print(formatSyncOutput(syncResult, lang));
          }
        }
      }

      if (opts.json) {
        if (warnings.length > 0) output.warnings = warnings;
        emitJson();
      } else {
        printAggregateSummary();
      }
    });
}
