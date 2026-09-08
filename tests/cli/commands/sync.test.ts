import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';

vi.mock('node:fs', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:fs')>(),
  lstatSync: vi.fn((p: unknown) => ({ isSymbolicLink: () => false, isDirectory: () => !/\.(md|json)$/i.test(String(p)), isFile: () => /\.(md|json)$/i.test(String(p)) })),
  realpathSync: Object.assign(vi.fn((p: string) => p), { native: vi.fn((p: string) => p) }),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 2, mtimeMs: 0 })),
}));

const mkdirSyncMock = mkdirSync as ReturnType<typeof vi.fn>;

// 7104 SYNC-ASYNC-GIT-CLOSURE: sync.ts no longer imports node:child_process at
// all — every Git call goes through the single `runSyncGitProcess` adapter.
// sync.ts also imports the real `SYNC_GIT_PROBE_TIMEOUT_MS` constant from
// this module, so the mock keeps every other export via importOriginal and
// overrides only the function under test.
vi.mock('../../../src/cli/helpers/sync-git-process.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../src/cli/helpers/sync-git-process.js')>(),
  runSyncGitProcess: vi.fn(),
}));

vi.mock('../../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('../../../src/cli/helpers/cursor-config.js', () => ({
  ensureCursorRules: vi.fn().mockReturnValue('unchanged'),
}));

// B8: writeSyncToMemory records to memory.db (no .brain/MEMORY.md file).
const syncStore = vi.hoisted(() => ({ upserts: [] as Array<Record<string, unknown>> }));
vi.mock('../../../src/core/memory-store.js', () => ({
  MemoryStore: vi.fn(() => ({
    upsert: (input: Record<string, unknown>) => { syncStore.upserts.push(input); },
    close: () => {},
  })),
}));

import { ensureDeckentImport } from '../../../src/core/utils.js';
import { ensureCursorRules } from '../../../src/cli/helpers/cursor-config.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { runSyncGitProcess } from '../../../src/cli/helpers/sync-git-process.js';
import type { SyncGitProcessResult, SyncGitFailureKind } from '../../../src/cli/helpers/sync-git-process.js';
import {
  getLastSprintTimestamp,
  isGitRepo,
  getCommitsSince,
  getChangedFiles,
  probeCommitsSince,
  collectGitChanges,
  writeSyncToMemory,
  formatSyncOutput,
  runSync,
  registerSync,
  syncGeminiAdapter,
  syncCursorAdapter,
  syncCodexAdapter,
  buildHostAdapterSyncMap,
  buildProviderSyncMap,
} from '../../../src/cli/commands/sync.js';
import type { SyncResult } from '../../../src/cli/commands/sync.js';

// ─── Typed helpers for the runSyncGitProcess adapter mock ────────────
// (7104) Every git-touching test dispatches on `options.args[0]` the way
// sync.ts's real call sequence does, and returns one of these two shapes —
// never a bare spawnSync-style return — so the mock matches the adapter's
// actual discriminated-union contract.

function ok(stdout: string): SyncGitProcessResult {
  return { ok: true, stdout, stderr: '', stderrBytesDropped: 0, exitCode: 0, durationMs: 1, pid: 1 };
}

function fail(kind: SyncGitFailureKind, detail: string, exitCode: number | null = 1): SyncGitProcessResult {
  return {
    ok: false,
    kind,
    detail,
    exitCode,
    signal: null,
    stdoutBytes: 0,
    stdoutTruncated: false,
    childExited: true,
    streamsClosed: true,
    treeTerminated: null,
    durationMs: 1,
    pid: 1,
  };
}

// ─── Unit Tests: getLastSprintTimestamp ──────────────────────────────

describe('getLastSprintTimestamp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Every sprint file now asks the git adapter for its author date before
    // falling back to statSync mtime — default that lookup to a failure so
    // these mtime-focused tests exercise the pre-existing fallback exactly
    // as before 7104 (per-test overrides below still take precedence).
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', 'nonzero_exit: fatal: not a git repository', 128));
  });

  it('returns null when sprints directory does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = await getLastSprintTimestamp('/project');
    expect(result).toBeNull();
  });

  it('returns null when sprints directory is empty', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    const result = await getLastSprintTimestamp('/project');
    expect(result).toBeNull();
  });

  it('returns the latest sprint file by mtime', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['sprint-040.md', 'sprint-042.md', 'sprint-041.md'] as unknown as ReturnType<typeof readdirSync>);

    vi.mocked(statSync).mockImplementation((filePath: unknown) => {
      const p = String(filePath);
      if (p.includes('sprint-040')) return { mtimeMs: 1000 } as ReturnType<typeof statSync>;
      if (p.includes('sprint-041')) return { mtimeMs: 2000 } as ReturnType<typeof statSync>;
      if (p.includes('sprint-042')) return { mtimeMs: 3000 } as ReturnType<typeof statSync>;
      return { mtimeMs: 0 } as ReturnType<typeof statSync>;
    });

    const result = await getLastSprintTimestamp('/project');
    expect(result).not.toBeNull();
    expect(result!.sprintId).toBe('sprint-042');
    expect(result!.timestamp).toBeTruthy();
  });

  it('ignores non-sprint files', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue(['README.md', 'sprint-040.md', 'notes.txt'] as unknown as ReturnType<typeof readdirSync>);
    vi.mocked(statSync).mockReturnValue({ mtimeMs: 5000 } as ReturnType<typeof statSync>);

    const result = await getLastSprintTimestamp('/project');
    expect(result).not.toBeNull();
    expect(result!.sprintId).toBe('sprint-040');
  });
});

// ─── Unit Tests: isGitRepo ──────────────────────────────────────────

describe('isGitRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when inside a git repository', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () => ok('true\n'));
    expect(await isGitRepo('/project')).toBe(true);
  });

  it('returns false when not a git repository', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', 'nonzero_exit: fatal: not a git repository', 128));
    expect(await isGitRepo('/project')).toBe(false);
  });
});

// ─── Unit Tests: getCommitsSince ────────────────────────────────────

describe('getCommitsSince', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns commit lines from git log', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      ok('abc1234 Fix auth\ndef5678 Add crypto\n'));

    const commits = await getCommitsSince('/project', '2026-03-20T00:00:00Z');
    expect(commits).toHaveLength(2);
    expect(commits[0]).toBe('abc1234 Fix auth');
  });

  it('returns empty array when git log fails', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', 'nonzero_exit: error', 1));

    const commits = await getCommitsSince('/project', '2026-03-20T00:00:00Z');
    expect(commits).toHaveLength(0);
  });

  it('returns empty array when no commits found', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () => ok(''));

    const commits = await getCommitsSince('/project', '2026-03-20T00:00:00Z');
    expect(commits).toHaveLength(0);
  });

  it('legacy-compat: matches probeCommitsSince(...).commits ([]) on a git log failure', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', "nonzero_exit: fatal: your current branch 'main' does not have any commits yet", 128));

    expect(await getCommitsSince('/project', '2026-03-20T00:00:00Z')).toEqual(
      (await probeCommitsSince('/project', '2026-03-20T00:00:00Z')).commits,
    );
    expect(await getCommitsSince('/project', '2026-03-20T00:00:00Z')).toEqual([]);
  });
});

// ─── Unit Tests: getChangedFiles ────────────────────────────────────

describe('getChangedFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Stub both git calls getChangedFiles makes: `rev-list --count HEAD`
   * (history depth) then `diff --name-status -M -z HEAD~N HEAD` (the actual
   * comparison). Dispatches on args[0] the way the real two-call sequence
   * does (7104).
   */
  function mockGitCalls(historyDepth: number, diffStdout: string): void {
    vi.mocked(runSyncGitProcess).mockImplementation(async (options) => {
      if (options.args[0] === 'rev-list') return ok(`${historyDepth}\n`);
      return ok(diffStdout);
    });
  }

  it('categorizes modified, added, deleted, and renamed files', async () => {
    mockGitCalls(10, 'M\0src/auth/jwt.ts\0A\0src/utils/crypto.ts\0D\0src/old-auth.ts\0R100\0src/foo.ts\0src/bar.ts\0');

    const changes = await getChangedFiles('/project', 3);
    expect(changes.modified).toEqual(['src/auth/jwt.ts']);
    expect(changes.added).toEqual(['src/utils/crypto.ts']);
    expect(changes.deleted).toEqual(['src/old-auth.ts']);
    expect(changes.renamed).toEqual(['src/bar.ts']);
    expect(changes.detection).toEqual({ mode: 'range', issue: null });

    const diffCall = vi.mocked(runSyncGitProcess).mock.calls.find(call => call[0].args[0] === 'diff');
    expect(diffCall?.[0].args).toEqual(['diff', '--name-status', '-M', '-z', 'HEAD~3', 'HEAD']);
  });

  it('returns empty arrays when commitCount is 0', async () => {
    const changes = await getChangedFiles('/project', 0);
    expect(changes.modified).toEqual([]);
    expect(changes.added).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
    expect(changes.detection).toEqual({ mode: 'range', issue: null });
    expect(runSyncGitProcess).not.toHaveBeenCalled();
  });

  it('returns empty arrays and reports GIT_DIFF_FAILED when git diff fails', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async (options) => {
      if (options.args[0] === 'rev-list') return ok('10\n');
      return fail('nonzero_exit', 'nonzero_exit: error', 1);
    });

    const changes = await getChangedFiles('/project', 2);
    expect(changes.modified).toEqual([]);
    expect(changes.added).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
    expect(changes.detection.mode).toBe('unavailable');
    expect(changes.detection.issue).toEqual({ code: 'GIT_DIFF_FAILED', detail: 'nonzero_exit: error' });
  });

  it('returns empty arrays and reports GIT_REV_LIST_FAILED when the history-depth probe fails', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', 'nonzero_exit: fatal: not a git repository', 128));

    const changes = await getChangedFiles('/project', 2);
    expect(changes.modified).toEqual([]);
    expect(changes.added).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
    expect(changes.detection.mode).toBe('unavailable');
    expect(changes.detection.issue).toEqual({
      code: 'GIT_REV_LIST_FAILED',
      detail: 'nonzero_exit: fatal: not a git repository',
    });
  });

  it('uses ls-tree root enumeration (not a fixed empty-tree diff id) when commitCount reaches history depth', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async (options) => {
      const argv = options.args;
      if (argv[0] === 'rev-list') return ok('2\n');
      if (argv[0] === 'ls-tree') return ok('src/root-file.ts\0README.md\0');
      throw new Error(`unexpected runSyncGitProcess call: ${argv.join(' ')}`);
    });

    const changes = await getChangedFiles('/project', 2);
    expect(changes.detection).toEqual({ mode: 'root-fallback', issue: null });
    expect(changes.added).toEqual(['src/root-file.ts', 'README.md']);
    expect(changes.modified).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);

    const lsTreeCall = vi.mocked(runSyncGitProcess).mock.calls.find(call => call[0].args[0] === 'ls-tree');
    expect(lsTreeCall?.[0].args).toEqual(['ls-tree', '-r', '--name-only', '-z', 'HEAD']);

    const diffCall = vi.mocked(runSyncGitProcess).mock.calls.find(call => call[0].args[0] === 'diff');
    expect(diffCall).toBeUndefined();
  });

  it('returns empty arrays and reports GIT_LS_TREE_FAILED when the root-fallback ls-tree enumeration fails', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async (options) => {
      if (options.args[0] === 'rev-list') return ok('2\n');
      return fail('nonzero_exit', 'nonzero_exit: fatal: not a tree', 128);
    });

    const changes = await getChangedFiles('/project', 2);
    expect(changes.modified).toEqual([]);
    expect(changes.added).toEqual([]);
    expect(changes.deleted).toEqual([]);
    expect(changes.renamed).toEqual([]);
    expect(changes.detection.mode).toBe('unavailable');
    expect(changes.detection.issue).toEqual({ code: 'GIT_LS_TREE_FAILED', detail: 'nonzero_exit: fatal: not a tree' });
  });

  it.each([NaN, 1.5, -1, Infinity])('throws RangeError for commitCount=%p without calling the git adapter', async (value) => {
    await expect(getChangedFiles('/project', value)).rejects.toThrow(RangeError);
    expect(runSyncGitProcess).not.toHaveBeenCalled();
  });
});

// ─── Unit Tests: probeCommitsSince ───────────────────────────────────

describe('probeCommitsSince', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns commit lines and issue null on success', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () => ok('abc1 one\nabc2 two\n'));

    const probe = await probeCommitsSince('/project', '2026-03-20T00:00:00Z');
    expect(probe.commits).toEqual(['abc1 one', 'abc2 two']);
    expect(probe.issue).toBeNull();
  });

  it('returns commits [] and a typed GIT_LOG_FAILED issue with the adapter detail verbatim on failure', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', "nonzero_exit: fatal: your current branch 'main' does not have any commits yet", 128));

    const probe = await probeCommitsSince('/project', '2026-03-20T00:00:00Z');
    expect(probe.commits).toEqual([]);
    expect(probe.issue).toEqual({
      code: 'GIT_LOG_FAILED',
      detail: "nonzero_exit: fatal: your current branch 'main' does not have any commits yet",
    });
  });

  it('forwards the adapter-supplied "<kind>: exit <status>" detail verbatim when stderr was empty', async () => {
    // The "exit <status>" fallback text is now produced INSIDE the adapter
    // (sync-git-process.ts) when stderr carries no usable line; probeCommitsSince's
    // own job is only to forward `result.detail` verbatim as `issue.detail`
    // (7104) — this asserts exactly that forwarding, independent of how the
    // adapter itself derives the fallback text (covered by its own test file).
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', 'nonzero_exit: exit 1', 1));

    const probe = await probeCommitsSince('/project', '2026-03-20T00:00:00Z');
    expect(probe.commits).toEqual([]);
    expect(probe.issue).toEqual({ code: 'GIT_LOG_FAILED', detail: 'nonzero_exit: exit 1' });
  });
});

// ─── Unit Tests: collectGitChanges ───────────────────────────────────

describe('collectGitChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('short-circuits on a git log failure: commits 0, detection unavailable/GIT_LOG_FAILED, adapter called exactly once (never reaches getChangedFiles)', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', "nonzero_exit: fatal: your current branch 'main' does not have any commits yet", 128));

    const result = await collectGitChanges('/project', '2026-03-20T00:00:00Z');
    expect(result.commits).toBe(0);
    expect(result.modified).toEqual([]);
    expect(result.added).toEqual([]);
    expect(result.deleted).toEqual([]);
    expect(result.renamed).toEqual([]);
    expect(result.detection).toEqual({
      mode: 'unavailable',
      issue: {
        code: 'GIT_LOG_FAILED',
        detail: "nonzero_exit: fatal: your current branch 'main' does not have any commits yet",
      },
    });

    expect(runSyncGitProcess).toHaveBeenCalledTimes(1);
    const call = vi.mocked(runSyncGitProcess).mock.calls[0];
    expect(call?.[0].args[0]).toBe('log');
  });

  it('collects commit count + changed files on success (log, rev-list, diff)', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async (options) => {
      const argv = options.args;
      if (argv[0] === 'log') return ok('a1 c1\na2 c2\na3 c3\n');
      if (argv[0] === 'rev-list') return ok('10\n');
      return ok('M\0a.ts\0');
    });

    const result = await collectGitChanges('/project', '2026-03-20T00:00:00Z');
    expect(result.commits).toBe(3);
    expect(result.modified).toEqual(['a.ts']);
    expect(result.added).toEqual([]);
    expect(result.detection).toEqual({ mode: 'range', issue: null });
  });
});

// ─── Unit Tests: formatSyncOutput ───────────────────────────────────

describe('formatSyncOutput', () => {
  it('shows "No changes" when commits is 0', () => {
    const result: SyncResult = {
      commits: 0,
      sprintId: 'sprint-042',
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      detection: { mode: 'range', issue: null },
    };
    expect(formatSyncOutput(result, 'en')).toBe(getMessage('sync.no_changes', 'en'));
  });

  it('formats full sync output with all change types', () => {
    const result: SyncResult = {
      commits: 3,
      sprintId: 'sprint-042',
      modified: ['src/auth/jwt.ts', 'src/middleware/guard.ts'],
      added: ['src/utils/crypto.ts'],
      deleted: ['src/old-auth.ts'],
      renamed: [],
      detection: { mode: 'range', issue: null },
    };

    const output = formatSyncOutput(result, 'en');
    expect(output).toContain(getMessage('sync.format_synced', 'en', { commits: '3', sprint: getMessage('sync.format_sprint_label', 'en', { n: '042' }) }));
    expect(output).toContain(getMessage('sync.format_modified', 'en', { files: 'src/auth/jwt.ts, src/middleware/guard.ts' }));
    expect(output).toContain(getMessage('sync.format_new', 'en', { files: 'src/utils/crypto.ts' }));
    expect(output).toContain(getMessage('sync.format_deleted', 'en', { files: 'src/old-auth.ts' }));
    expect(output).toContain(getMessage('sync.format_recorded', 'en'));
    expect(output).not.toContain('Renamed');
  });

  it('omits empty categories', () => {
    const result: SyncResult = {
      commits: 1,
      sprintId: 'sprint-041',
      modified: ['README.md'],
      added: [],
      deleted: [],
      renamed: [],
      detection: { mode: 'range', issue: null },
    };

    const output = formatSyncOutput(result, 'en');
    expect(output).toContain(getMessage('sync.format_modified', 'en', { files: 'README.md' }));
    expect(output).not.toContain('New:');
    expect(output).not.toContain('Deleted:');
  });
});

// ─── Unit Tests: writeSyncToMemory ──────────────────────────────────

describe('writeSyncToMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncStore.upserts = [];
  });

  it('upserts an Out-of-band Changes memory entry', () => {
    vi.mocked(existsSync).mockReturnValue(true); // memory.db present

    const syncResult: SyncResult = {
      commits: 2,
      sprintId: 'sprint-042',
      modified: ['src/foo.ts'],
      added: [],
      deleted: [],
      renamed: [],
      detection: { mode: 'range', issue: null },
    };

    writeSyncToMemory('/project', syncResult);

    expect(syncStore.upserts).toHaveLength(1);
    expect(syncStore.upserts[0]!.type).toBe('memory');
    expect(syncStore.upserts[0]!.id).toBe('sync-out-of-band');
    expect(syncStore.upserts[0]!.content).toContain('## Out-of-band Changes');
  });

  it('records the latest sync (single upserted entry, last wins)', () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const syncResult: SyncResult = {
      commits: 3,
      sprintId: 'sprint-042',
      modified: ['src/new.ts'],
      added: ['src/added.ts'],
      deleted: [],
      renamed: [],
      detection: { mode: 'range', issue: null },
    };

    writeSyncToMemory('/project', syncResult);

    expect(syncStore.upserts).toHaveLength(1);
    expect(syncStore.upserts[0]!.content).toContain('3 commit(s) since Sprint #042');
  });

  it('does nothing when memory.db does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const syncResult: SyncResult = {
      commits: 1,
      sprintId: 'sprint-042',
      modified: [],
      added: [],
      deleted: [],
      renamed: [],
      detection: { mode: 'range', issue: null },
    };

    writeSyncToMemory('/project', syncResult);

    expect(syncStore.upserts).toHaveLength(0);
  });
});

// ─── Unit Tests: runSync ────────────────────────────────────────────

describe('runSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when not a git repo', async () => {
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', 'nonzero_exit: fatal', 128));

    const result = await runSync('/project');
    expect(result).toBeNull();
  });

  it('returns null when no sprint files exist', async () => {
    // First call: isGitRepo
    vi.mocked(runSyncGitProcess).mockImplementation(async () => ok('true\n'));
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await runSync('/project');
    expect(result).toBeNull();
  });
});

// ─── Integration: registerSync command ──────────────────────────────

describe('CLI: deckent sync', () => {
  let program: Command;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    program = new Command();
    program.exitOverride();

    const { registerSync: reg } = await import('../../../src/cli/commands/sync.js');
    reg(program);
  });

  it('errors when DECKENT.md does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(process.exitCode).toBe(1);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('calls ensureDeckentImport for CLAUDE.md and AGENTS.md when DECKENT.md exists', async () => {
    // existsSync: DECKENT.md=true, sprints dir for git detection
    vi.mocked(existsSync).mockReturnValue(true);
    // git rev-parse (isGitRepo) → true
    vi.mocked(runSyncGitProcess).mockImplementation(async () => ok('true\n'));
    vi.mocked(readdirSync).mockReturnValue([]);

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'));
    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
  });

  it('skips adapter sync with --git-only flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(runSyncGitProcess).mockImplementation(async () =>
      fail('nonzero_exit', 'nonzero_exit: fatal', 128));

    await program.parseAsync(['node', 'deckent', 'sync', '--git-only']);

    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('skips git detection with --adapters-only flag', async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    await program.parseAsync(['node', 'deckent', 'sync', '--adapters-only']);

    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'));
    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
    // runSyncGitProcess should NOT be called for git commands (mkdirSync may be called for .cursor)
    // We just verify ensureDeckentImport was called for each adapter
    expect(ensureDeckentImport.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(runSyncGitProcess).not.toHaveBeenCalled();
  });
});

// ─── Unit Tests: syncGeminiAdapter ──────────────────────────────────

describe('syncGeminiAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls ensureDeckentImport on GEMINI.md', () => {
    syncGeminiAdapter('/project');
    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('GEMINI.md'));
  });

  it('skips ensureDeckentImport in dry-run mode', () => {
    syncGeminiAdapter('/project', true);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('always returns true', () => {
    expect(syncGeminiAdapter('/project', true)).toBe(true);
    expect(syncGeminiAdapter('/project', false)).toBe(true);
  });
});

// ─── Unit Tests: syncCursorAdapter ──────────────────────────────────

describe('syncCursorAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ensures the canonical Cursor rules file when rules dir exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    syncCursorAdapter('/project');
    expect(ensureCursorRules).toHaveBeenCalledWith('/project/.cursor/rules/deckent.mdc');
  });

  it('creates .cursor/rules and syncs when dir does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockImplementation(() => undefined);
    const result = syncCursorAdapter('/project');
    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('.cursor'), { recursive: true });
    expect(ensureCursorRules).toHaveBeenCalledWith('/project/.cursor/rules/deckent.mdc');
    expect(result).toBe(true);
  });

  it('returns false when mkdirSync throws', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(mkdirSync).mockImplementation(() => { throw new Error('Permission denied'); });
    const result = syncCursorAdapter('/project');
    expect(result).toBe(false);
    expect(ensureCursorRules).not.toHaveBeenCalled();
  });

  it('skips rules mutation in dry-run mode even when dir exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    syncCursorAdapter('/project', true);
    expect(ensureCursorRules).not.toHaveBeenCalled();
  });

  it('returns true in dry-run when dir does not exist (would create)', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = syncCursorAdapter('/project', true);
    expect(result).toBe(true);
    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });
});

// ─── Unit Tests: syncCodexAdapter ───────────────────────────────────

describe('syncCodexAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when .codex/ dir does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = syncCodexAdapter('/project');
    expect(result).toBe(false);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('calls ensureDeckentImport on .codex/AGENTS.md when dir exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    syncCodexAdapter('/project');
    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('.codex'));
  });

  it('skips ensureDeckentImport in dry-run mode', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    syncCodexAdapter('/project', true);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('returns true when .codex/ exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(syncCodexAdapter('/project', true)).toBe(true);
  });
});

// ─── Unit Tests: buildHostAdapterSyncMap ────────────────────────────

describe('buildHostAdapterSyncMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns map with claude and gemini always synced', () => {
    vi.mocked(existsSync).mockReturnValue(true); // .cursor dir + .codex dir exist
    const map = buildHostAdapterSyncMap('/project', true);
    expect(map.claude.synced).toBe(true);
    expect(map.gemini.synced).toBe(true);
    expect(map.claude.file).toBe('CLAUDE.md');
    expect(map.gemini.file).toBe('GEMINI.md');
  });

  it('includes codex as not synced when .codex dir does not exist', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const map = buildHostAdapterSyncMap('/project', true);
    expect(map.codex.synced).toBe(false);
  });

  it('includes codex as synced when .codex dir exists', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const map = buildHostAdapterSyncMap('/project', true);
    expect(map.codex.synced).toBe(true);
  });

  it('reports cursor sync status', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const map = buildHostAdapterSyncMap('/project', true);
    expect(map.cursor).toBeDefined();
    expect(map.cursor.file).toBe('.cursor/rules/deckent.mdc');
    expect(typeof map.cursor.synced).toBe('boolean');
  });

  it('calls ensureDeckentImport for each provider when not dry-run', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    buildHostAdapterSyncMap('/project', false);
    // CLAUDE.md + GEMINI.md + .codex/AGENTS.md use markdown imports.
    expect(vi.mocked(ensureDeckentImport).mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(ensureCursorRules).toHaveBeenCalledWith('/project/.cursor/rules/deckent.mdc');
  });

  it('keeps the deprecated provider-named alias behavior-compatible', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    expect(buildProviderSyncMap('/project', true)).toEqual(
      buildHostAdapterSyncMap('/project', true),
    );
  });
});
