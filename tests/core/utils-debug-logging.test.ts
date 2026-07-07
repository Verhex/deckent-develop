/**
 * Tests for debugLog() helper and catch block debug logging in utils.ts.
 * When DECKENT_DEBUG is set, catch blocks log to stderr via debugLog().
 * When DECKENT_DEBUG is unset, catch blocks remain silent.
 * Fallback return values are always preserved regardless of debug state.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  debugLog,
  readFileSafe,
  readJsonSafe,
  readJsonSafeAsync,
  updateLastSprintId,
} from '../../src/core/utils.js';

const TMP = join(tmpdir(), 'utils-debug-logging-test-' + process.pid);

let stderrSpy: MockInstance;
const originalEnv = process.env['DECKENT_DEBUG'];

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  delete process.env['DECKENT_DEBUG'];
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  stderrSpy.mockRestore();
  if (originalEnv === undefined) {
    delete process.env['DECKENT_DEBUG'];
  } else {
    process.env['DECKENT_DEBUG'] = originalEnv;
  }
});

// --- debugLog ---

describe('debugLog', () => {
  it('does nothing when DECKENT_DEBUG is not set', () => {
    debugLog('test', new Error('fail'));
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('writes to stderr when DECKENT_DEBUG is set', () => {
    process.env['DECKENT_DEBUG'] = '1';
    debugLog('myContext', new Error('something broke'));
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('[deckent:debug]');
    expect(output).toContain('myContext');
    expect(output).toContain('something broke');
  });

  it('handles string errors', () => {
    process.env['DECKENT_DEBUG'] = '1';
    debugLog('ctx', 'string error');
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('string error');
  });

  it('handles non-Error objects', () => {
    process.env['DECKENT_DEBUG'] = '1';
    debugLog('ctx', { code: 'ENOENT' });
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('[object Object]');
  });

  it('handles null/undefined errors', () => {
    process.env['DECKENT_DEBUG'] = '1';
    debugLog('ctx', null);
    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('null');
  });

  it('format includes newline', () => {
    process.env['DECKENT_DEBUG'] = '1';
    debugLog('ctx', 'msg');
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toMatch(/\n$/);
  });
});

// --- readFileSafe ---

describe('readFileSafe — debug logging', () => {
  it('returns empty string on missing file without stderr when debug off', () => {
    const result = readFileSafe(join(TMP, 'nonexistent.txt'));
    expect(result).toBe('');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('logs to stderr on missing file when DECKENT_DEBUG is set', () => {
    process.env['DECKENT_DEBUG'] = '1';
    const result = readFileSafe(join(TMP, 'nonexistent.txt'));
    expect(result).toBe('');
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('readFileSafe');
  });

  it('returns empty string (fallback) regardless of DECKENT_DEBUG state', () => {
    process.env['DECKENT_DEBUG'] = '1';
    expect(readFileSafe('/nonexistent/deeply/nested/file.txt')).toBe('');
    delete process.env['DECKENT_DEBUG'];
    expect(readFileSafe('/nonexistent/deeply/nested/file.txt')).toBe('');
  });

  it('reads successfully when file exists', () => {
    const file = join(TMP, 'ok.txt');
    writeFileSync(file, 'hello');
    const result = readFileSafe(file);
    expect(result).toBe('hello');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns empty string when reading a directory path (throws EISDIR)', () => {
    const result = readFileSafe(TMP);
    expect(result).toBe('');
  });
});

// --- readJsonSafe ---

describe('readJsonSafe — debug logging', () => {
  it('returns null on missing file without stderr when debug off', () => {
    const result = readJsonSafe(join(TMP, 'missing.json'));
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('stays SILENT on missing file even when DECKENT_DEBUG is set (W7: expected soft-miss)', () => {
    // Contract flip (2026-07-07): callers probe optional state with readJsonSafe
    // constantly; logging ENOENT flooded ERRORS.md's rolling window and rotated
    // real forensic entries out (born-484 lesson). Missing file = silent null.
    process.env['DECKENT_DEBUG'] = '1';
    const result = readJsonSafe(join(TMP, 'missing.json'));
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('still logs UNEXPECTED failures (malformed JSON) when DECKENT_DEBUG is set', () => {
    process.env['DECKENT_DEBUG'] = '1';
    const file = join(TMP, 'bad-logged.json');
    writeFileSync(file, '{ not valid }');
    expect(readJsonSafe(file)).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
    expect(stderrSpy.mock.calls[0]?.[0] as string).toContain('readJsonSafe');
  });

  it('returns null on malformed JSON without stderr when debug off', () => {
    const file = join(TMP, 'bad.json');
    writeFileSync(file, '{ not valid }');
    const result = readJsonSafe(file);
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('logs to stderr on malformed JSON when DECKENT_DEBUG is set', () => {
    process.env['DECKENT_DEBUG'] = '1';
    const file = join(TMP, 'bad2.json');
    writeFileSync(file, '{ not valid }');
    const result = readJsonSafe(file);
    expect(result).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('returns null (fallback) on error regardless of DECKENT_DEBUG state', () => {
    process.env['DECKENT_DEBUG'] = '1';
    expect(readJsonSafe('/nonexistent/path.json')).toBeNull();
    delete process.env['DECKENT_DEBUG'];
    expect(readJsonSafe('/nonexistent/path.json')).toBeNull();
  });

  it('parses successfully when JSON is valid', () => {
    const file = join(TMP, 'valid.json');
    writeFileSync(file, JSON.stringify({ ok: true }));
    const result = readJsonSafe<{ ok: boolean }>(file);
    expect(result).toEqual({ ok: true });
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

// --- readJsonSafeAsync ---

describe('readJsonSafeAsync — debug logging', () => {
  it('returns null on missing file without stderr when debug off', async () => {
    const result = await readJsonSafeAsync(join(TMP, 'async-missing.json'));
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('stays SILENT on missing file even when DECKENT_DEBUG is set (W7: expected soft-miss)', async () => {
    process.env['DECKENT_DEBUG'] = '1';
    const result = await readJsonSafeAsync(join(TMP, 'async-missing.json'));
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns null on malformed JSON', async () => {
    const file = join(TMP, 'async-bad.json');
    writeFileSync(file, '{ broken }');
    const result = await readJsonSafeAsync(file);
    expect(result).toBeNull();
  });

  it('returns null (fallback) on error regardless of DECKENT_DEBUG state', async () => {
    process.env['DECKENT_DEBUG'] = '1';
    expect(await readJsonSafeAsync('/nonexistent/async.json')).toBeNull();
    delete process.env['DECKENT_DEBUG'];
    expect(await readJsonSafeAsync('/nonexistent/async.json')).toBeNull();
  });

  it('parses successfully when JSON is valid', async () => {
    const file = join(TMP, 'async-valid.json');
    writeFileSync(file, JSON.stringify({ value: 42 }));
    const result = await readJsonSafeAsync<{ value: number }>(file);
    expect(result).toEqual({ value: 42 });
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

// --- updateLastSprintId ---

describe('updateLastSprintId — debug logging', () => {
  it('does not throw or write to stderr when write fails (debug off)', () => {
    updateLastSprintId('/nonexistent/path', 'sprint-099');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('logs to stderr when write fails and DECKENT_DEBUG is set', () => {
    process.env['DECKENT_DEBUG'] = '1';
    updateLastSprintId('/nonexistent/path', 'sprint-099');
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[0]?.[0] as string;
    expect(output).toContain('[deckent:debug]');
  });

  it('writes config successfully when path is valid', () => {
    const deckentDir = join(TMP, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    updateLastSprintId(TMP, 'sprint-042');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
