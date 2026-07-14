import { existsSync, readdirSync, statSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
import { migrateManifestV2toV3 } from '../../core/manifest-migrator.js';
import { BUILTIN_DOMAINS } from '../../core/routing/vocabulary-builtin.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

// ─── Constants ───────────────────────────────────────────────────────

const GEMINI_FILE = 'GEMINI.md';
const CURSOR_RULES_DIR = '.cursor';
const CURSOR_RULES_FILE = join(CURSOR_RULES_DIR, 'rules');
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

export interface SyncResult {
  commits: number;
  sprintId: string | null;
  modified: string[];
  added: string[];
  deleted: string[];
  renamed: string[];
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

  lines.push('  → Recorded to memory.db for next sprint context');

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
 * Sync .cursor/rules — ensure @DECKENT.md reference, creating dir if needed.
 */
export function syncCursorAdapter(root: string, dryRun = false, onError?: (err: AdapterSyncError) => void): boolean {
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
    const err = applyDeckentImport(join(root, CURSOR_RULES_FILE), '.cursor/rules');
    if (err) {
      onError?.(err);
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
}

function emptyAgentCapabilitiesSyncReport(): AgentCapabilitiesSyncReport {
  return { migrated: [], alreadyV3: [], issues: [] };
}

/**
 * V2 -> V3 capabilities dual-carry sync. For each builtin agent manifest under
 * `.deckent/agents/<id>/agent.json` (the shadow copy the runtime actually
 * loads — see agent-pool.ts's loadAgents()) that lacks a `capabilities` block,
 * runs `migrateManifestV2toV3` and writes the result ALONGSIDE the existing
 * `activation.rules` (dual-carry — nothing removed), flagged
 * `capabilitiesProvisional: true`. A manifest that already carries
 * `capabilities`, or whose `source` isn't `'builtin'`, is left byte-untouched.
 *
 * Unlike the 444-005 PROMPT.md shadow sync, this needs no external "builtin
 * source" reference: every input the migrator reads (activation rules,
 * deniedTools, domain, expertise, preferredModel) already lives on the same
 * manifest object being migrated. Never throws: one unreadable/malformed
 * manifest is recorded as a typed issue and the sweep continues.
 */
export function syncAgentCapabilities(root: string, dryRun = false): AgentCapabilitiesSyncReport {
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
        adapterErrors?: AdapterSyncError[];
        agentPromptSync?: AgentPromptSyncReport;
        agentManifestSync?: AgentManifestSyncReport;
        agentCapabilitiesSync?: AgentCapabilitiesSyncReport;
        gitChanges?: SyncResult | null;
        warnings?: string[];
      } = {};
      const warnings: string[] = [];

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
          for (const label of adapterReport.synced) {
            print(`${opts.dryRun ? '[dry-run] ' : ''}${label} synced → @DECKENT.md ensured`);
          }
          for (const err of adapterReport.errors) {
            print(`Warning: ${err.label} skipped (${err.file}) — ${err.reason}`);
          }
          if (!opts.dryRun) {
            print('Sync complete. Existing file contents preserved.');
          }
        }

        // --- Builtin agent PROMPT.md -> .deckent/agents/<id>/ shadow sync (444-005) ---
        const promptSyncReport = syncBuiltinAgentPrompts(root, { dryRun: opts.dryRun });
        output.agentPromptSync = promptSyncReport;

        if (!opts.json) {
          for (const id of promptSyncReport.created) {
            print(`${opts.dryRun ? '[dry-run] ' : ''}Agent prompt created: .deckent/agents/${id}/PROMPT.md`);
          }
          for (const id of promptSyncReport.updated) {
            print(`${opts.dryRun ? '[dry-run] ' : ''}Agent prompt updated: .deckent/agents/${id}/PROMPT.md`);
          }
          for (const conflict of promptSyncReport.conflicts) {
            print(`Warning: agent prompt "${conflict.agentId}" kept as local edit (${conflict.reason})`);
          }
        }

        // --- Builtin agent.json -> shadow three-way sync (446, ROUTING-V3 Slice-1) ---
        // ORDER CONTRACT: three-way manifest sync runs BEFORE the capabilities
        // migrator — provenance-proven shadows adopt the new builtin content
        // (real capability blocks) first, so the migrator below only fills
        // provisional blocks for shadows that STILL lack capabilities
        // (kept-local edits). Never both on the same shadow in one run.
        const manifestSyncReport = syncBuiltinAgentManifests(root, { dryRun: opts.dryRun });
        output.agentManifestSync = manifestSyncReport;

        if (!opts.json) {
          for (const id of manifestSyncReport.created) {
            print(`${opts.dryRun ? '[dry-run] ' : ''}Agent manifest created: .deckent/agents/${id}/agent.json`);
          }
          for (const id of manifestSyncReport.updated) {
            print(`${opts.dryRun ? '[dry-run] ' : ''}Agent manifest updated: .deckent/agents/${id}/agent.json`);
          }
          for (const conflict of manifestSyncReport.conflicts) {
            print(`Warning: agent manifest "${conflict.agentId}" kept as local edit (${conflict.reason})`);
          }
        }

        // --- Builtin agent.json V2->V3 capabilities dual-carry sync (445-011) ---
        const capabilitiesSyncReport = syncAgentCapabilities(root, opts.dryRun);
        output.agentCapabilitiesSync = capabilitiesSyncReport;

        if (!opts.json) {
          for (const id of capabilitiesSyncReport.migrated) {
            print(`${opts.dryRun ? '[dry-run] ' : ''}Agent capabilities migrated: .deckent/agents/${id}/agent.json (provisional v3)`);
          }
          for (const issue of capabilitiesSyncReport.issues) {
            print(`Warning: agent "${issue.agentId}" capabilities migration issue (${issue.code}) — ${issue.message}`);
          }
          print(`Agent capabilities: ${capabilitiesSyncReport.migrated.length} migrated, ${capabilitiesSyncReport.alreadyV3.length} already v3`);
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
          // C) Explicit warning when no previous sprint exists
          const noSprintMsg = 'Warning: No previous sprint found in .brain/sprints/ — run `deckent start` to begin your first sprint.';
          warnings.push(noSprintMsg);
          if (!opts.json) {
            print(noSprintMsg);
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
            if (opts.dryRun) print('[dry-run] Would record to memory.db:');
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
