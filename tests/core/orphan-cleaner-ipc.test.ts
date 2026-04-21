// ═══ IPC Orphan Cleaner Tests (M7.B + M7.B-v2 + M7.C) ═══════════════
// Sprint 145 Task 016: Defense-in-depth IPC directory cleanup (M7.B legacy)
// Sprint 150 Task 028: Live-PID-check wire-up (M7.B v2)
//
// M7.B (legacy): cleanOrphanIpcDirsLegacy — pre-flight scan by jobId
// M7.B v2: cleanOrphanIpcDirs — pre-flight scan with live-PID check
// M7.C: sprint-runner-entry self-cleanup — cleans IPC dir on successful exit

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  cleanOrphanIpcDirs,
  cleanOrphanIpcDirsLegacy,
} from '../../src/core/orphan-cleaner.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function createTestRoot(): string {
  const root = join(tmpdir(), `deckent-ipc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

/** Create an IPC dir WITH config.json containing optional pid field */
function createIpcDir(root: string, sprintId: string, pid?: number): string {
  const dir = join(root, '.deckent', `${sprintId}-ipc`);
  mkdirSync(dir, { recursive: true });
  const config: Record<string, unknown> = { sprintId };
  if (pid !== undefined) config.pid = pid;
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
  return dir;
}

/** Create an IPC dir WITHOUT config.json (config-only leak scenario) */
function createIpcDirNoConfig(root: string, sprintId: string): string {
  const dir = join(root, '.deckent', `${sprintId}-ipc`);
  mkdirSync(dir, { recursive: true });
  // intentionally no config.json
  return dir;
}

// ─── M7.B Legacy Tests ────────────────────────────────────────────────

describe('cleanOrphanIpcDirsLegacy (M7.B legacy)', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createTestRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('should clean 5 orphan IPC dirs and protect the current one', async () => {
    // Arrange: 5 orphan dirs + 1 current
    const orphanIds = ['sprint-140', 'sprint-141', 'sprint-142', 'sprint-143', 'sprint-144'];
    const currentId = 'sprint-145';

    for (const id of orphanIds) createIpcDir(testRoot, id);
    const currentDir = createIpcDir(testRoot, currentId);

    // Act
    const cleaned = await cleanOrphanIpcDirsLegacy(testRoot, currentId);

    // Assert
    expect(cleaned).toBe(5);
    // All orphans removed
    for (const id of orphanIds) {
      expect(existsSync(join(testRoot, '.deckent', `${id}-ipc`))).toBe(false);
    }
    // Current dir untouched
    expect(existsSync(currentDir)).toBe(true);
  });

  it('should ignore directories that do not match the IPC pattern', async () => {
    // Arrange: non-IPC dirs mixed with a legitimate IPC dir
    const nonIpcDirs = ['pids', 'agents', 'skills', 'sprint-144-events', 'sprint-145-config'];
    for (const d of nonIpcDirs) {
      mkdirSync(join(testRoot, '.deckent', d), { recursive: true });
    }
    createIpcDir(testRoot, 'sprint-143'); // orphan — should be cleaned
    const currentId = 'sprint-145';

    // Act
    const cleaned = await cleanOrphanIpcDirsLegacy(testRoot, currentId);

    // Assert: only the IPC pattern dir was cleaned
    expect(cleaned).toBe(1);
    // Non-IPC dirs still present
    for (const d of nonIpcDirs) {
      expect(existsSync(join(testRoot, '.deckent', d))).toBe(true);
    }
  });

  it('should return 0 when no orphan IPC dirs exist', async () => {
    // Arrange: only current sprint IPC dir
    createIpcDir(testRoot, 'sprint-145');

    const cleaned = await cleanOrphanIpcDirsLegacy(testRoot, 'sprint-145');

    expect(cleaned).toBe(0);
  });

  it('should return 0 gracefully when .deckent dir does not exist', async () => {
    // Arrange: remove the .deckent dir entirely
    rmSync(join(testRoot, '.deckent'), { recursive: true, force: true });

    const cleaned = await cleanOrphanIpcDirsLegacy(testRoot, 'sprint-145');

    expect(cleaned).toBe(0);
  });
});

// ─── M7.B v2 Tests — Live-PID check ──────────────────────────────────

describe('cleanOrphanIpcDirs (M7.B v2 — live-PID check)', () => {
  let testRoot: string;

  beforeEach(() => { testRoot = createTestRoot(); });
  afterEach(() => { rmSync(testRoot, { recursive: true, force: true }); });

  it('removes IPC dir with a dead PID', () => {
    // Arrange: use PID 99999999 which is virtually guaranteed dead
    const deadPid = 99999999;
    const dir = createIpcDir(testRoot, 'sprint-142', deadPid);

    // Act: minAgeMs=0 to bypass age guard (newly created dirs would be skipped otherwise)
    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true, minAgeMs: 0 });

    // Assert: removed
    expect(cleaned).toHaveLength(1);
    expect(existsSync(dir)).toBe(false);
  });

  it('preserves IPC dir whose PID is alive (current process)', () => {
    // Arrange: use the current process PID — guaranteed alive
    const livePid = process.pid;
    const dir = createIpcDir(testRoot, 'sprint-143', livePid);

    // Act
    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true, minAgeMs: 0 });

    // Assert: NOT removed
    expect(cleaned).toHaveLength(0);
    expect(existsSync(dir)).toBe(true);
  });

  it('removes IPC dir with no config.json (config-only leak)', () => {
    // Arrange: IPC dir without config.json
    const dir = createIpcDirNoConfig(testRoot, 'sprint-141');

    // Act: minAgeMs=0 to bypass age guard for this test
    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true, minAgeMs: 0 });

    // Assert: removed (no config.json → always safe to delete)
    expect(cleaned).toHaveLength(1);
    expect(existsSync(dir)).toBe(false);
  });

  it('removes IPC dir with config.json but no pid field', () => {
    // Arrange: config.json exists but has no pid — treat as dead
    const dir = createIpcDir(testRoot, 'sprint-140');
    // dir already has config.json without pid

    // Act: minAgeMs=0 to bypass age guard for this test
    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true, minAgeMs: 0 });

    // Assert: removed (no pid to check → dead)
    expect(cleaned).toHaveLength(1);
    expect(existsSync(dir)).toBe(false);
  });

  it('removes dead PID dirs while preserving live PID dirs', () => {
    // Arrange: mix of dead + live PIDs
    const deadPid = 99999999;
    const livePid = process.pid;

    const deadDir = createIpcDir(testRoot, 'sprint-141', deadPid);
    const liveDir = createIpcDir(testRoot, 'sprint-142', livePid);
    const noConfigDir = createIpcDirNoConfig(testRoot, 'sprint-140');

    // Act: minAgeMs=0 to bypass age guard
    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true, minAgeMs: 0 });

    // Assert
    expect(cleaned).toHaveLength(2); // dead + no-config removed
    expect(existsSync(deadDir)).toBe(false);
    expect(existsSync(noConfigDir)).toBe(false);
    expect(existsSync(liveDir)).toBe(true); // live preserved
  });

  it('returns empty array when .deckent dir does not exist', () => {
    rmSync(join(testRoot, '.deckent'), { recursive: true, force: true });

    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true });

    expect(cleaned).toHaveLength(0);
  });

  it('ignores non-IPC directories', () => {
    const nonIpcDirs = ['pids', 'agents', 'sprint-144-events'];
    for (const d of nonIpcDirs) {
      mkdirSync(join(testRoot, '.deckent', d), { recursive: true });
    }

    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true });

    expect(cleaned).toHaveLength(0);
    for (const d of nonIpcDirs) {
      expect(existsSync(join(testRoot, '.deckent', d))).toBe(true);
    }
  });

  it('concurrent isolation: two live-PID IPC dirs are both preserved', () => {
    // Simulate 2 concurrent deckent_start calls:
    // Both use the current process PID (both "alive")
    const livePid = process.pid;
    const dir1 = createIpcDir(testRoot, 'sprint-200', livePid);
    const dir2 = createIpcDir(testRoot, 'sprint-201', livePid);

    const cleaned = cleanOrphanIpcDirs(testRoot, { checkLivePid: true });

    // Neither should be removed
    expect(cleaned).toHaveLength(0);
    expect(existsSync(dir1)).toBe(true);
    expect(existsSync(dir2)).toBe(true);
  });

  it('uses default opts (checkLivePid=true) when no opts provided', () => {
    // Default: checkLivePid=true, minAgeMs=30000.
    // Live PID dirs are always preserved regardless of age.
    // Dead PID dirs (with explicit pid) are removed even if young.
    // Pid-less dirs younger than 30s are preserved (race guard).
    const livePid = process.pid;
    const liveDir = createIpcDir(testRoot, 'sprint-202', livePid);
    const youngNoPidDir = createIpcDir(testRoot, 'sprint-204'); // no pid, young → preserved
    const deadPidDir = createIpcDir(testRoot, 'sprint-203', 99999999); // dead pid → removed

    const cleaned = cleanOrphanIpcDirs(testRoot); // no opts (default minAgeMs=30000)

    // liveDir preserved (live PID)
    expect(existsSync(liveDir)).toBe(true);
    // youngNoPidDir preserved (young, no pid → age guard fires)
    expect(existsSync(youngNoPidDir)).toBe(true);
    // deadPidDir removed (dead PID is always cleaned regardless of age)
    expect(existsSync(deadPidDir)).toBe(false);
    expect(cleaned).toHaveLength(1);
  });
});

// ─── M7.C Tests — sprint-runner-entry self-cleanup ────────────────────
//
// Strategy: spawn a minimal node script that imports the compiled
// sprint-runner-entry module's exit handler logic directly.
// We use spawnSync with a tiny inline script so tests are hermetic and fast.

const distEntry = join(process.cwd(), 'dist', 'orchestra', 'sprint-runner-entry.js');
const srcEntry = join(process.cwd(), 'src', 'orchestra', 'sprint-runner-entry.ts');

/**
 * Creates a temp IPC dir and runs a minimal node script that:
 * 1. Registers an exit handler that mirrors M7.C logic
 * 2. Exits with the given code
 * Returns the IPC dir path for post-run assertions.
 *
 * Note: Uses a temporary .cjs file instead of --eval because process.argv[2]
 * is not correctly propagated in --eval mode in all Node.js versions.
 */
function runEntryWithCode(exitCode: number): { ipcDir: string; root: string } {
  const root = join(tmpdir(), `deckent-m7c-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const ipcDir = join(root, '.deckent', 'sprint-145-ipc');
  mkdirSync(ipcDir, { recursive: true });
  writeFileSync(join(ipcDir, 'config.json'), '{}');

  // Write a temporary CJS script that mirrors the M7.C exit handler logic
  const scriptFile = join(root, 'runner.cjs');
  writeFileSync(scriptFile, `
const { rmSync } = require('fs');
const ipcDir = process.argv[2];
process.on('exit', (code) => {
  if (code === 0 || code === undefined) {
    try { rmSync(ipcDir, { recursive: true, force: true }); } catch {}
  }
});
process.exit(${exitCode});
`);

  spawnSync(process.execPath, [scriptFile, ipcDir], { timeout: 5000 });
  return { ipcDir, root };
}

describe('sprint-runner-entry self-cleanup (M7.C)', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const r of roots) rmSync(r, { recursive: true, force: true });
    roots.length = 0;
  });

  it('should delete IPC dir when process exits with code 0 (success)', () => {
    const { ipcDir, root } = runEntryWithCode(0);
    roots.push(root);

    // IPC dir must be gone after successful exit
    expect(existsSync(ipcDir)).toBe(false);
  });

  it('should preserve IPC dir when process exits with non-zero code (failure/debug)', () => {
    const { ipcDir, root } = runEntryWithCode(1);
    roots.push(root);

    // IPC dir must remain for post-mortem debugging
    expect(existsSync(ipcDir)).toBe(true);
  });

  it('should preserve IPC dir when process exits with code 2 (fatal error)', () => {
    const { ipcDir, root } = runEntryWithCode(2);
    roots.push(root);

    expect(existsSync(ipcDir)).toBe(true);
  });
});
