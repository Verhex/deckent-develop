import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatFatalAndExit } from '../../src/cli/helpers/error-handler.js';

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

// ─── formatFatalAndExit — secret redaction ──────────────────────────

describe('formatFatalAndExit — secret redaction', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tempCwd: string;
  let originalCwd: string;
  let originalDebug: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempCwd = mkdtempSync(join(tmpdir(), 'deckent-fatal-redact-'));
    process.chdir(tempCwd);
    originalDebug = process.env.DECKENT_DEBUG;
    process.env.DECKENT_DEBUG = '1'; // force stack to be written to stderr too
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.chdir(originalCwd);
    rmSync(tempCwd, { recursive: true, force: true });
    if (originalDebug === undefined) delete process.env.DECKENT_DEBUG;
    else process.env.DECKENT_DEBUG = originalDebug;
  });

  function readCrashLog(): string {
    const crashDir = join(tempCwd, '.deckent', 'crashes');
    const files = readdirSync(crashDir);
    expect(files.length).toBe(1);
    return readFileSync(join(crashDir, files[0]), 'utf8');
  }

  it('redacts an sk-... API key from message and stack in stderr and crash-log', () => {
    const secret = 'sk-live-abcdefghijklmnopqrstuvwxyz0123456789';
    const err = new Error(`request failed with key ${secret}`);
    err.stack = `Error: request failed with key ${secret}\n    at somewhere (${secret})`;

    formatFatalAndExit(err);

    expect(stderrOutput).not.toContain(secret);
    expect(stderrOutput).toContain('request failed with key');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const log = readCrashLog();
    expect(log).not.toContain(secret);
    expect(log).toContain('request failed with key');
  });

  it('redacts a Bearer token from message and stack in stderr and crash-log', () => {
    const token = 'abc123def456verysecrettoken';
    const err = new Error(`auth failed: Bearer ${token}`);
    err.stack = `Error: auth failed: Bearer ${token}\n    at handler (auth.ts:1:1)`;

    formatFatalAndExit(err);

    expect(stderrOutput).not.toContain(token);
    expect(stderrOutput).toContain('auth failed:');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const log = readCrashLog();
    expect(log).not.toContain(token);
    expect(log).toContain('auth failed:');
  });

  it('redacts an API_KEY=... assignment from message and stack in stderr and crash-log', () => {
    const err = new Error('config error: API_KEY=secret1234567890 is invalid');
    err.stack = 'Error: config error: API_KEY=secret1234567890 is invalid\n    at loadConfig (config.ts:9:1)';

    formatFatalAndExit(err);

    expect(stderrOutput).not.toContain('API_KEY=secret1234567890');
    expect(stderrOutput).toContain('config error:');
    expect(stderrOutput).toContain('is invalid');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const log = readCrashLog();
    expect(log).not.toContain('API_KEY=secret1234567890');
    expect(log).toContain('config error:');
  });

  it('preserves ordinary non-sensitive error text unchanged', () => {
    const err = new Error('disk full: cannot write to /tmp/foo');
    err.stack = 'Error: disk full: cannot write to /tmp/foo\n    at writeFile (fs.ts:1:1)';

    formatFatalAndExit(err);

    expect(stderrOutput).toContain('disk full: cannot write to /tmp/foo');
    expect(exitSpy).toHaveBeenCalledWith(1);

    const log = readCrashLog();
    expect(log).toContain('disk full: cannot write to /tmp/foo');
  });

  it('keeps exit code and crash-log path unchanged', () => {
    formatFatalAndExit(new Error('plain failure'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    const crashDir = join(tempCwd, '.deckent', 'crashes');
    const files = readdirSync(crashDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.log$/);
  });
});
