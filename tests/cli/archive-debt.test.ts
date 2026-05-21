import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { DEBT_TABLE_HEADER } from '../../src/core/constants.js';

// Sprint 178 Task 4 mock-hygiene fix:
// Use `importOriginal` factory so unmocked fs APIs (e.g. realpathSync.native,
// promises.*, constants) still resolve to the real module. The previous
// inline factory shadowed the entire 'node:fs' export surface, which caused
// adjacent test modules under CI=true parallel workers to observe a
// half-populated 'node:fs' depending on import order — flaking the suite
// asymmetrically across local vs. CI runs.
//
// Sprint 182 W1-1 mock-hygiene reinforcement: explicitly re-export the
// node:fs sync surfaces that `src/core/config.ts` reaches for during the
// self-healing/recovery branch (renameSync, copyFileSync). CI run
// 26212167619 surfaced `[deckent] Config recovery failed: [vitest] No
// "renameSync" export is defined on the "node:fs" mock` — the
// `...actual` spread does not always resolve transitively under CI=true
// parallel workers (Node 26 + vitest interop), so config recovery threw
// before cleanup and bled into adjacent suites. Listing the methods
// explicitly makes the mock CI-stable regardless of importOriginal
// resolution timing.
//
// Sprint 183 W2-1 sweep (mock-hygiene completion): the Sprint 182 partial
// fix landed renameSync/copyFileSync/unlinkSync/rmSync/readdirSync but the
// worker timed out before sweeping the remaining sync surface. This
// extension explicitly pass-throughs every node:fs *Sync method reached
// transitively by archive-debt code paths under CI=true (config.ts,
// event-stream.ts, file-lock.ts, heartbeat-daemon.ts, sprint-controller.ts,
// pid-liveness.ts, sprint-state-tracker.ts, et al.). Non-Sync surfaces
// (watch/watchFile/createReadStream/promises/constants) plus class
// constructors (Dirent/Stats) continue to resolve via the leading
// `...actual` spread — the explicit list below is a redundant safety net
// against the spread's known CI=true unreliability, not a replacement.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    // ── Test-controlled stubs (mocked behavior) ────────────────────
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    statSync: vi.fn(),
    // ── Sprint 182 W1-1 explicit pass-through (config-recovery surface)
    renameSync: actual.renameSync,
    copyFileSync: actual.copyFileSync,
    unlinkSync: actual.unlinkSync,
    rmSync: actual.rmSync,
    readdirSync: actual.readdirSync,
    // ── Sprint 183 W2-1 sweep: remaining sync surface used elsewhere
    // in the src/ tree that may load transitively under CI=true parallel
    // workers. Keep explicit even when `...actual` would suffice — the
    // redundancy is the entire point of this guard.
    rmdirSync: actual.rmdirSync,
    cpSync: actual.cpSync,
    accessSync: actual.accessSync,
    lstatSync: actual.lstatSync,
    realpathSync: actual.realpathSync,
    readlinkSync: actual.readlinkSync,
    chmodSync: actual.chmodSync,
    chownSync: actual.chownSync,
    linkSync: actual.linkSync,
    symlinkSync: actual.symlinkSync,
    truncateSync: actual.truncateSync,
    ftruncateSync: actual.ftruncateSync,
    utimesSync: actual.utimesSync,
    futimesSync: actual.futimesSync,
    openSync: actual.openSync,
    closeSync: actual.closeSync,
    readSync: actual.readSync,
    writeSync: actual.writeSync,
    fsyncSync: actual.fsyncSync,
    fdatasyncSync: actual.fdatasyncSync,
    fstatSync: actual.fstatSync,
    mkdtempSync: actual.mkdtempSync,
    opendirSync: actual.opendirSync,
    // ── Non-Sync helpers the codebase still reaches synchronously
    constants: actual.constants,
  };
});

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, statSync } from 'node:fs';
import { registerArchiveDebt } from '../../src/cli/commands/archive-debt.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockAppendFileSync = vi.mocked(appendFileSync);
const mockStatSync = vi.mocked(statSync);

function buildDebtContent(rows: string[]): string {
  const separator = '|----|-------------|------|--------|----------|------|----------|----------|---------|';
  return [DEBT_TABLE_HEADER, separator, ...rows].join('\n');
}

let stdoutData: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;

function captureOutput(): void {
  stdoutData = [];
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((data) => {
    stdoutData.push(String(data));
    return true;
  });
}

function restoreOutput(): void {
  stdoutSpy?.mockRestore();
}

async function runCommand(): Promise<string> {
  const program = new Command();
  program.exitOverride();
  registerArchiveDebt(program);
  try {
    await program.parseAsync(['node', 'test', 'archive-debt']);
  } catch (err) {
    if (err instanceof Error && err.message.includes('commander.')) {
      // expected
    }
  }
  return stdoutData.join('');
}

describe('archive-debt command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captureOutput();
    // Default statSync mock — archive file is small enough (under 1MB rotation limit)
    mockStatSync.mockReturnValue({ size: 100 } as ReturnType<typeof statSync>);
  });

  afterEach(() => {
    restoreOutput();
  });

  it('prints no resolved items when DEBT.md does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const output = await runCommand();
    expect(output).toContain('No resolved debt items to archive.');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  // NOTE: 4 tests removed (2026-04-17, Sprint 143 cleanup). The archive-debt
  // command migrated to Memory V2 — it now reads debt entries from SQLite
  // (MemoryStore.getByType('debt')) and calls store.upsert() to mark items as
  // resolved, instead of reading/writing .brain/DEBT.md through node:fs. The
  // fs-based mock setup in these tests is never exercised, so the command
  // returns counts from the real project database instead. Removed tests:
  // "prints no resolved items when all items are unresolved", "archives
  // resolved items and keeps unresolved", "archives all items when all are
  // resolved", "skips malformed rows with fewer than 9 columns". Kept tests
  // still exercise branches that short-circuit before the DB read (no DEBT.md
  // path, mkdir path). Sprint 144 debt: rewrite suite with a MemoryStore
  // harness using a tmpdir-backed SQLite DB.

  it('creates archive directory if it does not exist', async () => {
    const content = buildDebtContent([
      '| debt-001 | Resolved | 001 | sprint-001 | NORMAL | 0 | true | sprint-002 | 2026-01-01 |',
    ]);
    mockExistsSync.mockImplementation((p: unknown) => {
      if (String(p).includes('DEBT-ARCHIVE')) return false;
      return true;
    });
    mockReadFileSync.mockReturnValue(content);

    await runCommand();

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('archive'),
      { recursive: true },
    );
  });
});
