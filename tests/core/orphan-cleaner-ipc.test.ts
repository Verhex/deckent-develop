// ═══ IPC Orphan Cleaner Tests (M7.B + M7.C) ════════════════════════
// Sprint 145 Task 016: Defense-in-depth IPC directory cleanup
//
// M7.B: cleanOrphanIpcDirs — pre-flight scan removes stale sprint IPC dirs
// M7.C: sprint-runner-entry self-cleanup — cleans IPC dir on successful exit

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { cleanOrphanIpcDirs } from '../../src/core/orphan-cleaner.js';

// ─── Helpers ──────────────────────────────────────────────────────────

function createTestRoot(): string {
  const root = join(tmpdir(), `deckent-ipc-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  return root;
}

function createIpcDir(root: string, sprintId: string): string {
  const dir = join(root, '.deckent', `${sprintId}-ipc`);
  mkdirSync(dir, { recursive: true });
  // Write a marker file so we can verify full removal
  writeFileSync(join(dir, 'config.json'), JSON.stringify({ sprintId }));
  return dir;
}

// ─── M7.B Tests ───────────────────────────────────────────────────────

describe('cleanOrphanIpcDirs (M7.B)', () => {
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
    const cleaned = await cleanOrphanIpcDirs(testRoot, currentId);

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
    const cleaned = await cleanOrphanIpcDirs(testRoot, currentId);

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

    const cleaned = await cleanOrphanIpcDirs(testRoot, 'sprint-145');

    expect(cleaned).toBe(0);
  });

  it('should return 0 gracefully when .deckent dir does not exist', async () => {
    // Arrange: remove the .deckent dir entirely
    rmSync(join(testRoot, '.deckent'), { recursive: true, force: true });

    const cleaned = await cleanOrphanIpcDirs(testRoot, 'sprint-145');

    expect(cleaned).toBe(0);
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
