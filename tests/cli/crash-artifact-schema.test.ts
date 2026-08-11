import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CRASH_ARTIFACT_SCHEMA_VERSION,
  buildCrashArtifact,
  sanitizeCommandArgv,
  computeProjectRootDigest,
  resolveDeckentVersion,
  crashArtifactFileName,
  writeCrashArtifactAtomic,
  formatFatalAndExit,
  type CrashArtifactV1,
} from '../../src/cli/helpers/error-handler.js';

// ─── Capture stderr ─────────────────────────────────────────────────

let stderrOutput: string;
let originalWrite: typeof process.stderr.write;

beforeEach(() => {
  stderrOutput = '';
  originalWrite = process.stderr.write;
  process.stderr.write = vi.fn((chunk: unknown) => {
    stderrOutput += String(chunk);
    return true;
  }) as unknown as typeof process.stderr.write;
});

afterEach(() => {
  process.stderr.write = originalWrite;
});

// ─── Schema shape ────────────────────────────────────────────────────

describe('buildCrashArtifact — schema shape', () => {
  it('produces every required field with the correct type', () => {
    const artifact = buildCrashArtifact({
      name: 'TypeError',
      message: 'boom',
      stack: 'TypeError: boom\n    at x (y.ts:1:1)',
      cwd: '/tmp/some-project',
      argv: ['node', 'cli.js', 'run'],
    });

    expect(artifact.schemaVersion).toBe(CRASH_ARTIFACT_SCHEMA_VERSION);
    expect(artifact.schemaVersion).toBe(1);
    expect(() => new Date(artifact.timestamp).toISOString()).not.toThrow();
    expect(new Date(artifact.timestamp).toISOString()).toBe(artifact.timestamp);
    expect(typeof artifact.pid).toBe('number');
    expect(artifact.pid).toBe(process.pid);
    expect(typeof artifact.command).toBe('string');
    expect(typeof artifact.deckentVersion).toBe('string');
    expect(typeof artifact.projectRootDigest).toBe('string');
    expect(artifact.name).toBe('TypeError');
    expect(artifact.message).toBe('boom');
    expect(artifact.stack).toBe('TypeError: boom\n    at x (y.ts:1:1)');
  });

  it('stack is null (not undefined) when no stack is available', () => {
    const artifact = buildCrashArtifact({
      name: 'NonError',
      message: 'raw fatal string',
      cwd: '/tmp/some-project',
      argv: ['node', 'cli.js'],
    });
    expect(artifact.stack).toBeNull();
  });
});

describe('resolveDeckentVersion / computeProjectRootDigest', () => {
  it('resolves a real semver-ish deckent version, never throwing', () => {
    const version = resolveDeckentVersion();
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  it('digest is deterministic for the same root and differs for different roots', () => {
    const a1 = computeProjectRootDigest('/tmp/project-a');
    const a2 = computeProjectRootDigest('/tmp/project-a');
    const b = computeProjectRootDigest('/tmp/project-b');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    expect(a1).not.toContain('/tmp/project-a');
    expect(a1).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ─── Redaction ───────────────────────────────────────────────────────

describe('sanitizeCommandArgv — redaction', () => {
  it('redacts an sk-... API key embedded in a single argv element', () => {
    const secret = 'sk-live-abcdefghijklmnopqrstuvwxyz0123456789';
    const command = sanitizeCommandArgv(['node', 'cli.js', `--key=${secret}`]);
    expect(command).not.toContain(secret);
  });

  it('redacts a password= assignment split by the normal CLI --flag value convention', () => {
    const command = sanitizeCommandArgv(['node', 'cli.js', 'password=hunter2verysecret']);
    expect(command).not.toContain('hunter2verysecret');
  });

  it('preserves non-sensitive argv content', () => {
    const command = sanitizeCommandArgv(['node', 'cli.js', 'start', '--verbose']);
    expect(command).toContain('cli.js');
    expect(command).toContain('start');
    expect(command).toContain('--verbose');
  });

  it('buildCrashArtifact never leaks a secret through the command field', () => {
    const secret = 'sk-live-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    const artifact = buildCrashArtifact({
      name: 'Error',
      message: 'redacted already',
      cwd: '/tmp/proj',
      argv: ['node', 'cli.js', `--token=${secret}`],
    });
    expect(artifact.command).not.toContain(secret);
    expect(JSON.stringify(artifact)).not.toContain(secret);
  });
});

// ─── Collision-freedom ───────────────────────────────────────────────

describe('crashArtifactFileName — collision-freedom', () => {
  it('produces unique filenames for the same pid under a frozen clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    try {
      const names = new Set<string>();
      for (let i = 0; i < 100; i++) {
        names.add(crashArtifactFileName(4242));
      }
      expect(names.size).toBe(100);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the .log suffix for backward-compatible readers', () => {
    const name = crashArtifactFileName(1);
    expect(name).toMatch(/\.log$/);
  });

  it('embeds the pid in the filename', () => {
    const name = crashArtifactFileName(99999);
    expect(name).toContain('-99999-');
  });
});

// ─── Atomicity + least-privilege mode ────────────────────────────────

describe('writeCrashArtifactAtomic', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'deckent-crash-atomic-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes valid JSON round-tripping the artifact, with no leftover temp file', () => {
    const artifact: CrashArtifactV1 = {
      schemaVersion: 1,
      timestamp: new Date(0).toISOString(),
      pid: 1234,
      command: 'node cli.js run',
      deckentVersion: '1.0.0-beta.1',
      projectRootDigest: 'abcdef0123456789',
      name: 'Error',
      message: 'boom',
      stack: null,
    };
    const fileName = 'test-artifact.log';
    writeCrashArtifactAtomic(tempDir, fileName, artifact);

    const entries = readdirSync(tempDir);
    expect(entries).toEqual([fileName]);

    const parsed = JSON.parse(readFileSync(join(tempDir, fileName), 'utf8')) as CrashArtifactV1;
    expect(parsed).toEqual(artifact);
  });

  it('uses least-privilege file mode (owner read/write only)', () => {
    const artifact: CrashArtifactV1 = {
      schemaVersion: 1,
      timestamp: new Date(0).toISOString(),
      pid: 1,
      command: 'node cli.js',
      deckentVersion: 'unknown',
      projectRootDigest: '0000000000000000',
      name: 'Error',
      message: 'x',
      stack: null,
    };
    const fileName = 'mode-check.log';
    writeCrashArtifactAtomic(tempDir, fileName, artifact);

    const mode = statSync(join(tempDir, fileName)).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});

// ─── Never-mask property ─────────────────────────────────────────────

describe('formatFatalAndExit — never masks the original fatal', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tempCwd: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempCwd = mkdtempSync(join(tmpdir(), 'deckent-fatal-nevermask-'));
    process.chdir(tempCwd);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.chdir(originalCwd);
    rmSync(tempCwd, { recursive: true, force: true });
  });

  it('still prints FATAL and exits(1) when the crash directory cannot be created', () => {
    // Pre-create `.deckent` as a plain FILE so mkdirSync('.deckent/crashes', {recursive:true})
    // is forced to throw (ENOTDIR) inside the artifact-writing try/catch.
    writeFileSync(join(tempCwd, '.deckent'), 'not a directory');

    expect(() => formatFatalAndExit(new Error('write-blocked'))).not.toThrow();

    expect(stderrOutput).toContain('FATAL');
    expect(stderrOutput).toContain('write-blocked');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ─── End-to-end integration ──────────────────────────────────────────

describe('formatFatalAndExit — writes a schema-versioned crash artifact', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tempCwd: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempCwd = mkdtempSync(join(tmpdir(), 'deckent-fatal-schema-'));
    process.chdir(tempCwd);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.chdir(originalCwd);
    rmSync(tempCwd, { recursive: true, force: true });
  });

  it('produces exactly one .log file with a valid CrashArtifactV1 body', () => {
    formatFatalAndExit(new TypeError('integration-boom'));

    const crashDir = join(tempCwd, '.deckent', 'crashes');
    const files = readdirSync(crashDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.log$/);

    const artifact = JSON.parse(readFileSync(join(crashDir, files[0]), 'utf8')) as CrashArtifactV1;
    expect(artifact.schemaVersion).toBe(CRASH_ARTIFACT_SCHEMA_VERSION);
    expect(artifact.name).toBe('TypeError');
    expect(artifact.message).toBe('integration-boom');
    expect(artifact.pid).toBe(process.pid);
    expect(typeof artifact.projectRootDigest).toBe('string');
    expect(typeof artifact.deckentVersion).toBe('string');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('two fatals in the same process never collide on filename', () => {
    formatFatalAndExit(new Error('first'));
    formatFatalAndExit(new Error('second'));

    const crashDir = join(tempCwd, '.deckent', 'crashes');
    const files = readdirSync(crashDir);
    expect(files.length).toBe(2);
    expect(new Set(files).size).toBe(2);
  });
});
