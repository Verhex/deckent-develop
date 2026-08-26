import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeckentError, ErrorRegistry } from '../../../src/core/errors.js';
import { handleError } from '../../../src/cli/helpers/error-handler.js';
import { afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeckentError as DeckentError__tsm_005 } from "../../../src/core/errors.js";
import { handleError as handleError__tsm_005, formatFatalAndExit, installFatalHandlers, __resetFatalHandlersForTest } from "../../../src/cli/helpers/error-handler.js";

describe('handleError', () => {
  let stderrOutput: string;

  beforeEach(() => {
    stderrOutput = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stderrOutput += String(chunk);
      return true;
    });
  });

  it('handles DeckentError with human context (noColor)', () => {
    const err = ErrorRegistry.createError('DECKENT_E003');
    handleError(err, { noColor: true });
    expect(stderrOutput).toContain('Error: no DIRECTIVES.md [DECKENT_E003]');
    expect(stderrOutput).toContain('What happened:');
    expect(stderrOutput).toContain('Why:');
    expect(stderrOutput).toContain('How to fix:');
  });

  it('handles DeckentError with color (default)', () => {
    const err = ErrorRegistry.createError('DECKENT_E001');
    handleError(err);
    // Color codes should be present
    expect(stderrOutput).toContain('\x1b[31m');
    expect(stderrOutput).toContain('tmux');
  });

  it('handles DeckentError without human context (legacy format)', () => {
    const err = new DeckentError('DECKENT_TEST', 'test message', 'test suggestion');
    handleError(err, { noColor: true });
    expect(stderrOutput).toContain('[DECKENT_TEST]');
    expect(stderrOutput).toContain('test message');
    expect(stderrOutput).toContain('Suggestion: test suggestion');
  });

  it('handles DeckentError legacy format with docLink', () => {
    const err = new DeckentError('X', 'msg', 'sug', 'https://docs.example.com');
    handleError(err, { noColor: true });
    expect(stderrOutput).toContain('Docs: https://docs.example.com');
  });

  it('handles generic Error', () => {
    handleError(new Error('something broke'));
    expect(stderrOutput).toContain('Error: something broke');
    expect(stderrOutput).toContain('Report:');
  });

  it('handles non-Error values', () => {
    handleError('string error');
    expect(stderrOutput).toContain('Error: string error');
  });

  it('shows stack trace when verbose', () => {
    const err = ErrorRegistry.createError('DECKENT_E001');
    handleError(err, { verbose: true, noColor: true });
    expect(stderrOutput).toContain('at ');
  });

  it('does not show stack when not verbose', () => {
    const err = ErrorRegistry.createError('DECKENT_E001');
    handleError(err, { noColor: true });
    // Stack traces contain 'at ' followed by function name
    const lines = stderrOutput.split('\n');
    const stackLines = lines.filter(l => l.trim().startsWith('at '));
    expect(stackLines.length).toBe(0);
  });
});

// TSM-005: physically merged from tests/cli/error-handler.test.ts.
{
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
        const err = new DeckentError__tsm_005('DECKENT_E001', 'tmux not found');
        handleError__tsm_005(err);
        expect(stderrOutput).toContain('DECKENT_E001');
        expect(stderrOutput).toContain('tmux not found');
    });
    it('prints suggestion when available', () => {
        const err = new DeckentError__tsm_005('DECKENT_E001', 'tmux not found', 'Install tmux');
        handleError__tsm_005(err);
        expect(stderrOutput).toContain('Suggestion:');
        expect(stderrOutput).toContain('Install tmux');
    });
    it('prints docLink when available', () => {
        const err = new DeckentError__tsm_005('DECKENT_E001', 'msg', 'sug', 'https://docs.example.com');
        handleError__tsm_005(err);
        expect(stderrOutput).toContain('Docs:');
        expect(stderrOutput).toContain('https://docs.example.com');
    });
    it('does not print suggestion when not provided', () => {
        const err = new DeckentError__tsm_005('X', 'msg');
        handleError__tsm_005(err);
        expect(stderrOutput).not.toContain('Suggestion:');
    });
    it('prints stack trace in verbose mode', () => {
        const err = new DeckentError__tsm_005('X', 'msg');
        handleError__tsm_005(err, { verbose: true });
        expect(stderrOutput).toContain('at ');
    });
    it('does not print stack trace without verbose', () => {
        const err = new DeckentError__tsm_005('X', 'msg');
        handleError__tsm_005(err);
        // Stack trace lines contain "at " — the output should not have many
        const lines = stderrOutput.split('\n').filter(l => l.includes('    at '));
        expect(lines.length).toBe(0);
    });
});

// ─── Generic Error handling ─────────────────────────────────────────
describe('handleError — generic Error', () => {
    it('prints error message', () => {
        handleError__tsm_005(new Error('something failed'));
        expect(stderrOutput).toContain('something failed');
    });
    it('prints report URL', () => {
        handleError__tsm_005(new Error('fail'));
        expect(stderrOutput).toContain('https://github.com/VerhexIO/deckent/issues');
    });
    it('prints stack in verbose mode', () => {
        handleError__tsm_005(new Error('fail'), { verbose: true });
        expect(stderrOutput).toContain('at ');
    });
});

// ─── Non-Error handling ─────────────────────────────────────────────
describe('handleError — non-Error values', () => {
    it('handles string thrown as error', () => {
        handleError__tsm_005('raw string error');
        expect(stderrOutput).toContain('raw string error');
    });
    it('handles number thrown as error', () => {
        handleError__tsm_005(42);
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
        if (originalDebug === undefined)
            delete process.env.DECKENT_DEBUG;
        else
            process.env.DECKENT_DEBUG = originalDebug;
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
}
