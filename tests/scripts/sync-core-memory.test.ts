import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDirs(prefix: string) {
  const base = join(tmpdir(), `sync-mem-test-${prefix}-${Date.now()}`);
  const userDir = join(base, 'user');
  const coreDir = join(base, 'core');
  mkdirSync(userDir, { recursive: true });
  mkdirSync(coreDir, { recursive: true });
  return { base, userDir, coreDir };
}

function runSync(args: string[], env: Record<string, string> = {}) {
  return spawnSync('node', [join(process.cwd(), 'scripts/sync-core-memory.mjs'), ...args], {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
  });
}

function writeEntry(dir: string, name: string, content: string) {
  writeFileSync(join(dir, name), content, 'utf-8');
}

function readEntry(dir: string, name: string): string | null {
  const p = join(dir, name);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8');
}

function setMtime(path: string, msSinceEpoch: number) {
  const t = new Date(msSinceEpoch);
  utimesSync(path, t, t);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('sync-core-memory --backup', () => {
  let dirs: ReturnType<typeof makeTempDirs>;

  beforeEach(() => { dirs = makeTempDirs('backup'); });
  afterEach(() => { rmSync(dirs.base, { recursive: true, force: true }); });

  it('(a) copies user entries to core on backup', () => {
    writeEntry(dirs.userDir, 'note_a.md', '# Note A\nContent A');
    writeEntry(dirs.userDir, 'note_b.md', '# Note B\nContent B');

    const result = runSync(['--backup'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(result.status).toBe(0);
    expect(readEntry(dirs.coreDir, 'note_a.md')).toBe('# Note A\nContent A');
    expect(readEntry(dirs.coreDir, 'note_b.md')).toBe('# Note B\nContent B');
    expect(result.stdout).toContain('Synced 2 entries');
  });

  it('skips identical files on backup (idempotent)', () => {
    writeEntry(dirs.userDir, 'note_a.md', '# Same content');
    writeEntry(dirs.coreDir, 'note_a.md', '# Same content');

    const result = runSync(['--backup'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Synced 0 entries');
    expect(result.stdout).toContain('1 unchanged');
  });
});

describe('sync-core-memory --restore', () => {
  let dirs: ReturnType<typeof makeTempDirs>;

  beforeEach(() => { dirs = makeTempDirs('restore'); });
  afterEach(() => { rmSync(dirs.base, { recursive: true, force: true }); });

  it('(b) restores core entries to user dir', () => {
    writeEntry(dirs.coreDir, 'feedback_a.md', '# Feedback A');
    writeEntry(dirs.coreDir, 'feedback_b.md', '# Feedback B');

    const result = runSync(['--restore'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(result.status).toBe(0);
    expect(readEntry(dirs.userDir, 'feedback_a.md')).toBe('# Feedback A');
    expect(readEntry(dirs.userDir, 'feedback_b.md')).toBe('# Feedback B');
    expect(result.stdout).toContain('Synced 2 entries');
  });

  it('(c) idempotent re-run reports no changes', () => {
    writeEntry(dirs.coreDir, 'feedback_a.md', '# Feedback A');
    writeEntry(dirs.userDir, 'feedback_a.md', '# Feedback A');

    const result = runSync(['--restore'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('All entries present');
    expect(result.stdout).toContain('Synced 0 entries');
  });

  it('(e) warns about user-only entries not in core', () => {
    writeEntry(dirs.coreDir, 'core_only.md', '# Core entry');
    writeEntry(dirs.userDir, 'user_only.md', '# User only');

    const result = runSync(['--restore'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('WARN');
    expect(result.stdout).toContain('user_only.md');
  });
});

describe('sync-core-memory --bidirectional', () => {
  let dirs: ReturnType<typeof makeTempDirs>;

  beforeEach(() => { dirs = makeTempDirs('bidir'); });
  afterEach(() => { rmSync(dirs.base, { recursive: true, force: true }); });

  it('(d) newer-wins: user newer → updates core', () => {
    writeEntry(dirs.userDir, 'shared.md', 'User version');
    writeEntry(dirs.coreDir, 'shared.md', 'Core version');

    // Make user file newer
    const now = Date.now();
    setMtime(join(dirs.coreDir, 'shared.md'), now - 5000);
    setMtime(join(dirs.userDir, 'shared.md'), now);

    const result = runSync(['--bidirectional'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(result.status).toBe(0);
    expect(readEntry(dirs.coreDir, 'shared.md')).toBe('User version');
    expect(result.stdout).toContain('user newer');
  });

  it('(d) newer-wins: core newer → updates user', () => {
    writeEntry(dirs.userDir, 'shared.md', 'User version');
    writeEntry(dirs.coreDir, 'shared.md', 'Core version');

    const now = Date.now();
    setMtime(join(dirs.userDir, 'shared.md'), now - 5000);
    setMtime(join(dirs.coreDir, 'shared.md'), now);

    const result = runSync(['--bidirectional'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(result.status).toBe(0);
    expect(readEntry(dirs.userDir, 'shared.md')).toBe('Core version');
    expect(result.stdout).toContain('core newer');
  });
});

describe('sync-core-memory --dry-run', () => {
  let dirs: ReturnType<typeof makeTempDirs>;

  beforeEach(() => { dirs = makeTempDirs('dryrun'); });
  afterEach(() => { rmSync(dirs.base, { recursive: true, force: true }); });

  it('dry-run does not write files', () => {
    writeEntry(dirs.userDir, 'note.md', '# Note');

    runSync(['--backup', '--dry-run'], {
      DECKENT_USER_MEMORY_PATH: dirs.userDir,
      DECKENT_CORE_MEMORY_PATH: dirs.coreDir,
    });

    expect(existsSync(join(dirs.coreDir, 'note.md'))).toBe(false);
  });
});
