import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

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
  renameSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  // 7104 SYNC-ASYNC-GIT-CLOSURE: the sync-git-process adapter's default
  // spawnImpl is node:child_process's `spawn` — without an export here the
  // adapter throws "No 'spawn' export is defined on the 'node:child_process'
  // mock" the instant isGitRepo/getLastSprintTimestamp run. The adapter
  // itself is separately mocked below, so this export is never actually
  // invoked; it exists only so the module shape resolves.
  spawn: vi.fn(),
}));

// 7104 SYNC-ASYNC-GIT-CLOSURE: sync.ts's Git chain now goes exclusively
// through this adapter (no more node:child_process spawnSync calls) — mock
// it the same way tests/cli/commands/sync.test.ts does, keeping every other
// export (e.g. SYNC_GIT_PROBE_TIMEOUT_MS) real via importOriginal.
vi.mock('../../src/cli/helpers/sync-git-process.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/cli/helpers/sync-git-process.js')>(),
  runSyncGitProcess: vi.fn(),
}));

vi.mock('node:readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('../../src/core/utils.js', () => ({
  countBrainLines: vi.fn().mockReturnValue(100),
  ensureDeckentImport: vi.fn(),
}));

import { ensureDeckentImport } from '../../src/core/utils.js';
import { runSyncGitProcess } from '../../src/cli/helpers/sync-git-process.js';
import type { SyncGitProcessResult, SyncGitFailureKind } from '../../src/cli/helpers/sync-git-process.js';

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

describe('CLI: deckent sync', () => {
  let program: Command;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.exitCode = undefined;

    program = new Command();
    program.exitOverride();

    const { registerSync } = await import('../../src/cli/commands/sync.js');
    registerSync(program);
  });

  it('errors when DECKENT.md does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(process.exitCode).toBe(1);
    expect(ensureDeckentImport).not.toHaveBeenCalled();
  });

  it('calls ensureDeckentImport for CLAUDE.md and AGENTS.md when DECKENT.md exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(runSyncGitProcess).mockImplementation(async (options) => {
      if (options.args[0] === 'rev-parse') return ok('true\n');
      return fail('nonzero_exit', 'nonzero_exit: fatal: no sprints', 128);
    });

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('CLAUDE.md'));
    expect(ensureDeckentImport).toHaveBeenCalledWith(expect.stringContaining('AGENTS.md'));
  });

  it('does not set error exitCode when DECKENT.md exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readdirSync).mockReturnValue([]);
    vi.mocked(runSyncGitProcess).mockImplementation(async (options) => {
      if (options.args[0] === 'rev-parse') return ok('true\n');
      return fail('nonzero_exit', 'nonzero_exit: fatal: no sprints', 128);
    });

    await program.parseAsync(['node', 'deckent', 'sync']);

    expect(process.exitCode).toBeUndefined();
  });
});
