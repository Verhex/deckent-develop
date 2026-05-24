import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeckentError } from '../../src/core/errors.js';
import {
  handleError,
  formatFatalAndExit,
  installFatalHandlers,
  __resetFatalHandlersForTest,
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

// ─── DeckentError handling ──────────────────────────────────────────

describe('handleError — DeckentError', () => {
  it('prints error code and message for DeckentError', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found');
    handleError(err);
    expect(stderrOutput).toContain('DECKENT_E001');
    expect(stderrOutput).toContain('tmux not found');
  });

  it('prints suggestion when available', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found', 'Install tmux');
    handleError(err);
    expect(stderrOutput).toContain('Suggestion:');
    expect(stderrOutput).toContain('Install tmux');
  });

  it('prints docLink when available', () => {
    const err = new DeckentError('DECKENT_E001', 'msg', 'sug', 'https://docs.example.com');
    handleError(err);
    expect(stderrOutput).toContain('Docs:');
    expect(stderrOutput).toContain('https://docs.example.com');
  });

  it('does not print suggestion when not provided', () => {
    const err = new DeckentError('X', 'msg');
    handleError(err);
    expect(stderrOutput).not.toContain('Suggestion:');
  });

  it('prints stack trace in verbose mode', () => {
    const err = new DeckentError('X', 'msg');
    handleError(err, { verbose: true });
    expect(stderrOutput).toContain('at ');
  });

  it('does not print stack trace without verbose', () => {
    const err = new DeckentError('X', 'msg');
    handleError(err);
    // Stack trace lines contain "at " — the output should not have many
    const lines = stderrOutput.split('\n').filter(l => l.includes('    at '));
    expect(lines.length).toBe(0);
  });
});

// ─── Generic Error handling ─────────────────────────────────────────

describe('handleError — generic Error', () => {
  it('prints error message', () => {
    handleError(new Error('something failed'));
    expect(stderrOutput).toContain('something failed');
  });

  it('prints report URL', () => {
    handleError(new Error('fail'));
    expect(stderrOutput).toContain('https://github.com/VerhexIO/deckent/issues');
  });

  it('prints stack in verbose mode', () => {
    handleError(new Error('fail'), { verbose: true });
    expect(stderrOutput).toContain('at ');
  });
});

// ─── Non-Error handling ─────────────────────────────────────────────

describe('handleError — non-Error values', () => {
  it('handles string thrown as error', () => {
    handleError('raw string error');
    expect(stderrOutput).toContain('raw string error');
  });

  it('handles number thrown as error', () => {
    handleError(42);
    expect(stderrOutput).toContain('42');
  });
});

// ─── Fatal handler — formatFatalAndExit ─────────────────────────────

describe('formatFatalAndExit', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let tempCwd: string;
  let originalCwd: string;
  let originalDebug: string | undefined;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempCwd = mkdtempSync(join(tmpdir(), 'deckent-fatal-'));
    process.chdir(tempCwd);
    originalDebug = process.env.DECKENT_DEBUG;
    delete process.env.DECKENT_DEBUG;
    // process.exit is typed as (code?: number) => never. The mock
    // returns undefined to keep the test alive; the cast satisfies
    // the signature without polluting handler logic.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((_code?: number) => undefined) as never);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    process.chdir(originalCwd);
    rmSync(tempCwd, { recursive: true, force: true });
    if (originalDebug === undefined) delete process.env.DECKENT_DEBUG;
    else process.env.DECKENT_DEBUG = originalDebug;
  });

  it('writes FATAL line with error name and message', () => {
    const err = new TypeError('boom');
    formatFatalAndExit(err);
    expect(stderrOutput).toContain('FATAL');
    expect(stderrOutput).toContain('TypeError');
    expect(stderrOutput).toContain('boom');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('includes stack trace when DECKENT_DEBUG=1', () => {
    process.env.DECKENT_DEBUG = '1';
    const err = new Error('explode');
    formatFatalAndExit(err);
    expect(stderrOutput).toContain('explode');
    // err.stack contains lines beginning with "    at "
    expect(stderrOutput).toMatch(/\n\s+at\s/);
  });

  it('omits stack trace when DECKENT_DEBUG unset', () => {
    const err = new Error('quiet');
    formatFatalAndExit(err);
    const stackLines = stderrOutput.split('\n').filter((l) => l.match(/^\s+at\s/));
    expect(stackLines.length).toBe(0);
  });

  it('writes a crash log under .deckent/crashes/', () => {
    formatFatalAndExit(new Error('disk-trace'));
    const crashDir = join(tempCwd, '.deckent', 'crashes');
    expect(existsSync(crashDir)).toBe(true);
    const files = readdirSync(crashDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.log$/);
  });

  it('handles non-Error thrown values', () => {
    formatFatalAndExit('raw fatal string');
    expect(stderrOutput).toContain('FATAL');
    expect(stderrOutput).toContain('NonError');
    expect(stderrOutput).toContain('raw fatal string');
  });
});

// ─── installFatalHandlers — wire / idempotency ──────────────────────

describe('installFatalHandlers', () => {
  beforeEach(() => {
    __resetFatalHandlersForTest();
  });

  afterEach(() => {
    __resetFatalHandlersForTest();
  });

  it('skips installation in vitest environment by default', () => {
    // VITEST=true is set by the test runner.
    const installed = installFatalHandlers();
    expect(installed).toBe(false);
  });

  it('installs handlers when force=true and is idempotent on repeat', () => {
    const before = process.listenerCount('uncaughtException');
    const first = installFatalHandlers({ force: true });
    expect(first).toBe(true);
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
    expect(process.listenerCount('unhandledRejection')).toBeGreaterThanOrEqual(1);

    const second = installFatalHandlers({ force: true });
    expect(second).toBe(false);
    // No additional listener added on second call.
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);
  });

  it('reset helper removes both listeners', () => {
    installFatalHandlers({ force: true });
    const withInstalled = process.listenerCount('uncaughtException');
    __resetFatalHandlersForTest();
    expect(process.listenerCount('uncaughtException')).toBe(withInstalled - 1);
  });
});
