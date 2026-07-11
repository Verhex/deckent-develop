import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createDeckTemplate,
  DECK_FILE_NAME,
  type SpawnedAclProcessLike,
  type SpawnImpl,
} from '../../src/core/deck-file.js';
import { writeDeckSecurityFiles } from '../../src/cli/commands/init-steps.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `deckent-deck-lifecycle-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── createDeckTemplate — DECK-OVERWRITE-GUARD (SEC-01) ──────────────────────
//
// RED-first: before the fix, createDeckTemplate() unconditionally
// writeFileSync'd the empty template over ANY existing .deck (including a
// live one full of user API keys) and never set a file mode (default umask,
// typically 0644 — world-readable). This suite proves both are closed.

describe('createDeckTemplate — secret lifecycle (SEC-01 / ADR-G-005 DECK-OVERWRITE-GUARD)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('never overwrites an existing .deck — content stays byte-identical (regression: pre-fix this erased live secrets on re-init)', () => {
    const deckPath = join(tempDir, DECK_FILE_NAME);
    const sentinel = 'DECKENT_CLAUDE_API_KEY=sk-live-sentinel-do-not-erase\n# user comment\nDECKENT_WEBHOOK_URL=https://example.com/hook\n';
    writeFileSync(deckPath, sentinel, 'utf-8');

    createDeckTemplate(tempDir);

    expect(readFileSync(deckPath, 'utf-8')).toBe(sentinel);
  });

  it('is a true no-op on repeat calls once the file exists — content never drifts across multiple re-inits', () => {
    const deckPath = join(tempDir, DECK_FILE_NAME);
    const sentinel = 'DECKENT_OPENAI_API_KEY=sk-openai-sentinel\n';
    writeFileSync(deckPath, sentinel, 'utf-8');

    createDeckTemplate(tempDir);
    createDeckTemplate(tempDir);
    createDeckTemplate(tempDir);

    expect(readFileSync(deckPath, 'utf-8')).toBe(sentinel);
  });

  it('creating a brand-new .deck sets owner-only 0600 permissions (POSIX; regression: pre-fix mode was unset → umask default, typically 0644)', () => {
    if (process.platform === 'win32') return; // POSIX-only permission bits
    const deckPath = join(tempDir, DECK_FILE_NAME);

    createDeckTemplate(tempDir);

    const mode = statSync(deckPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('re-asserts 0600 via chmodSync after the write, closing the umask gap even under a permissive process umask', () => {
    if (process.platform === 'win32') return;
    const originalUmask = process.umask(0o000); // widest possible umask — worst case
    try {
      const deckPath = join(tempDir, DECK_FILE_NAME);
      createDeckTemplate(tempDir);
      expect(statSync(deckPath).mode & 0o777).toBe(0o600);
    } finally {
      process.umask(originalUmask);
    }
  });

  it('writes atomically — no leftover .deck.tmp survives a successful create, and content is fully formed', () => {
    const deckPath = join(tempDir, DECK_FILE_NAME);

    createDeckTemplate(tempDir);

    expect(existsSync(`${deckPath}.tmp`)).toBe(false);
    expect(existsSync(deckPath)).toBe(true);
    const content = readFileSync(deckPath, 'utf-8');
    expect(content).toContain('DECKENT_CLAUDE_API_KEY=');
  });
});

// ─── createDeckTemplate — Windows ACL branch (injected platform + spawn) ─────

describe('createDeckTemplate — Windows ACL branch (injected platform + SpawnImpl)', () => {
  let tempDir: string;
  let prevUsername: string | undefined;

  beforeEach(() => {
    tempDir = makeTempDir();
    prevUsername = process.env['USERNAME'];
    process.env['USERNAME'] = 'TestUser';
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    if (prevUsername === undefined) delete process.env['USERNAME'];
    else process.env['USERNAME'] = prevUsername;
  });

  function makeFakeSpawn(behavior: (child: EventEmitter & SpawnedAclProcessLike) => void): {
    spawnImpl: SpawnImpl;
    calls: { command: string; args: string[] }[];
  } {
    const calls: { command: string; args: string[] }[] = [];
    const spawnImpl: SpawnImpl = (command, args) => {
      calls.push({ command, args });
      const child = new EventEmitter() as EventEmitter & SpawnedAclProcessLike;
      child.stderr = null;
      process.nextTick(() => behavior(child));
      return child;
    };
    return { spawnImpl, calls };
  }

  it('invokes icacls with /inheritance:r /grant:r <user>:F on the created file when platform is win32', () => {
    const { spawnImpl, calls } = makeFakeSpawn((child) => child.emit('close', 0));

    createDeckTemplate(tempDir, { platform: 'win32', spawnImpl });

    const deckPath = join(tempDir, DECK_FILE_NAME);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('icacls');
    expect(calls[0]?.args).toEqual([deckPath, '/inheritance:r', '/grant:r', 'TestUser:F']);
    // The file itself is still created via the normal atomic-write path.
    expect(existsSync(deckPath)).toBe(true);
  });

  it('does not throw when icacls exits non-zero — degrades honestly with a stderr warning, file still created', async () => {
    const { spawnImpl } = makeFakeSpawn((child) => {
      child.stderr = new EventEmitter() as unknown as SpawnedAclProcessLike['stderr'];
      (child.stderr as unknown as EventEmitter).emit('data', Buffer.from('Access is denied.'));
      child.emit('close', 1);
    });
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => createDeckTemplate(tempDir, { platform: 'win32', spawnImpl })).not.toThrow();
    await new Promise((resolve) => process.nextTick(resolve));
    await new Promise((resolve) => process.nextTick(resolve));

    expect(existsSync(join(tempDir, DECK_FILE_NAME))).toBe(true);
    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.some((c) => String(c[0]).includes('icacls'));
    expect(warned).toBe(true);

    warnSpy.mockRestore();
  });

  it('does not throw when spawn emits an error event (e.g. icacls not on PATH) — degrades honestly', async () => {
    const { spawnImpl } = makeFakeSpawn((child) => child.emit('error', new Error('ENOENT: icacls not found')));
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => createDeckTemplate(tempDir, { platform: 'win32', spawnImpl })).not.toThrow();
    await new Promise((resolve) => process.nextTick(resolve));
    await new Promise((resolve) => process.nextTick(resolve));

    expect(existsSync(join(tempDir, DECK_FILE_NAME))).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('warns and skips the icacls attempt entirely when USERNAME is unset', () => {
    delete process.env['USERNAME'];
    const { spawnImpl, calls } = makeFakeSpawn((child) => child.emit('close', 0));
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    createDeckTemplate(tempDir, { platform: 'win32', spawnImpl });

    expect(calls).toHaveLength(0);
    expect(existsSync(join(tempDir, DECK_FILE_NAME))).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('skips the icacls attempt entirely (no spawn call) once the .deck already exists (no-op-if-exists applies before the platform branch)', () => {
    const deckPath = join(tempDir, DECK_FILE_NAME);
    writeFileSync(deckPath, 'DECKENT_CLAUDE_API_KEY=sentinel\n', 'utf-8');
    const { spawnImpl, calls } = makeFakeSpawn((child) => child.emit('close', 0));

    createDeckTemplate(tempDir, { platform: 'win32', spawnImpl });

    expect(calls).toHaveLength(0);
    expect(readFileSync(deckPath, 'utf-8')).toBe('DECKENT_CLAUDE_API_KEY=sentinel\n');
  });
});

// ─── writeDeckSecurityFiles — non-fatal warn (init-steps.ts) ─────────────────

describe('writeDeckSecurityFiles — non-fatal stderr warn', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not throw and warns to stderr when the target path cannot be written (e.g. .deck is a directory)', () => {
    // Force createDeckTemplate's writeFileSync to fail: make DECKENT_DIR-equivalent
    // root itself a path where mkdirSync will fail because a file occupies it.
    const blockedRoot = join(tempDir, 'blocked-root');
    writeFileSync(blockedRoot, 'not a directory', 'utf-8'); // mkdirSync(blockedRoot) will throw EEXIST/ENOTDIR

    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    expect(() => writeDeckSecurityFiles(blockedRoot)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.some((c) => String(c[0]).toLowerCase().includes('warn'));
    expect(warned).toBe(true);

    warnSpy.mockRestore();
  });

  it('creates .deck + .gitignore normally with no warning on the happy path', () => {
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    writeDeckSecurityFiles(tempDir);

    expect(existsSync(join(tempDir, DECK_FILE_NAME))).toBe(true);
    expect(existsSync(join(tempDir, '.gitignore'))).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
