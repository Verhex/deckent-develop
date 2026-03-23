import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readFileSafe,
  readJsonSafe,
  readJsonSafeAsync,
  updateLastSprintId,
  countBrainLines,
} from '../../src/core/utils.js';

const TMP = join(tmpdir(), 'utils-debug-test-' + process.pid);

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  delete process.env['DECKENT_DEBUG'];
  vi.restoreAllMocks();
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  delete process.env['DECKENT_DEBUG'];
});

describe('readFileSafe — silent catch behavior', () => {
  it('returns empty string when file does not exist (no stderr output)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = readFileSafe(join(TMP, 'nonexistent.txt'));
    expect(result).toBe('');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns empty string for directory path (no stderr output)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = readFileSafe(TMP);
    expect(result).toBe('');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('reads file successfully without error', () => {
    const file = join(TMP, 'ok.txt');
    writeFileSync(file, 'hello');
    expect(readFileSafe(file)).toBe('hello');
  });
});

describe('readJsonSafe — silent catch behavior', () => {
  it('returns null for missing file (no stderr output)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = readJsonSafe(join(TMP, 'nonexistent.json'));
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns null for malformed JSON (no stderr output)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const file = join(TMP, 'bad.json');
    writeFileSync(file, '{ not valid json }');
    const result = readJsonSafe(file);
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('parses valid JSON successfully', () => {
    const file = join(TMP, 'valid.json');
    writeFileSync(file, JSON.stringify({ ok: true }));
    expect(readJsonSafe<{ ok: boolean }>(file)).toEqual({ ok: true });
  });
});

describe('readJsonSafeAsync — silent catch behavior', () => {
  it('returns null for missing file (no stderr output)', async () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = await readJsonSafeAsync(join(TMP, 'async-missing.json'));
    expect(result).toBeNull();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('returns null for malformed JSON', async () => {
    const file = join(TMP, 'async-bad.json');
    writeFileSync(file, '{ broken }');
    const result = await readJsonSafeAsync(file);
    expect(result).toBeNull();
  });

  it('parses valid JSON successfully', async () => {
    const file = join(TMP, 'async-valid.json');
    writeFileSync(file, JSON.stringify({ value: 42 }));
    const result = await readJsonSafeAsync<{ value: number }>(file);
    expect(result).toEqual({ value: 42 });
  });
});

describe('updateLastSprintId — silent catch behavior', () => {
  it('does not throw when path is invalid', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(() => updateLastSprintId('/nonexistent/path', 'sprint-001')).not.toThrow();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('writes config successfully when path and deckent dir are valid', () => {
    const deckentDir = join(TMP, '.deckent');
    mkdirSync(deckentDir, { recursive: true });
    updateLastSprintId(TMP, 'sprint-042');
    const config = readJsonSafe<Record<string, unknown>>(join(deckentDir, 'config.json'));
    expect(config).not.toBeNull();
    expect(config?.last_sprint_id).toBe('sprint-042');
  });
});

describe('countBrainLines — fallback behavior', () => {
  it('returns 0 when .brain/ does not exist', () => {
    expect(countBrainLines(TMP)).toBe(0);
  });

  it('counts lines in .brain/ files', () => {
    const brainDir = join(TMP, '.brain');
    mkdirSync(brainDir, { recursive: true });
    writeFileSync(join(brainDir, 'MEMORY.md'), 'line1\nline2\nline3');
    const lines = countBrainLines(TMP);
    expect(lines).toBe(3);
  });

  it('skips subdirectories gracefully (no stderr when debug off)', () => {
    const brainDir = join(TMP, '.brain');
    const subDir = join(brainDir, 'subdir');
    mkdirSync(subDir, { recursive: true });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const lines = countBrainLines(TMP);
    expect(lines).toBe(0);
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});
