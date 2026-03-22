/**
 * Tests for catch block behavior in utils.ts.
 * All catch blocks are currently silent (no logging).
 * Fallback return values must remain unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
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
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  stderrSpy.mockRestore();
  // Restore original env state
  if (originalEnv === undefined) {
    delete process.env['DECKENT_DEBUG'];
  } else {
    process.env['DECKENT_DEBUG'] = originalEnv;
  }
});

// --- readFileSafe ---

describe('readFileSafe — catch behavior', () => {
  it('returns empty string on missing file without stderr output', () => {
    const result = readFileSafe(join(TMP, 'nonexistent.txt'));
    expect(result).toBe('');
    expect(stderrSpy).not.toHaveBeenCalled();
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

describe('readJsonSafe — catch behavior', () => {
  it('returns null on missing file without stderr output', () => {
    const result = readJsonSafe(join(TMP, 'missing.json'));
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns null on malformed JSON without stderr output', () => {
    const file = join(TMP, 'bad.json');
    writeFileSync(file, '{ not valid }');
    const result = readJsonSafe(file);
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
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

describe('readJsonSafeAsync — catch behavior', () => {
  it('returns null on missing file without stderr output', async () => {
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

describe('updateLastSprintId — catch behavior', () => {
  it('does not throw or write to stderr when write fails', () => {
    updateLastSprintId('/nonexistent/path', 'sprint-099');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('writes config successfully when path is valid', () => {
    const deckentDir = join(TMP, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    updateLastSprintId(TMP, 'sprint-042');
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
