import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSafe, readJsonSafe, readJsonSafeAsync, parseSprintNumber } from '../../src/core/utils.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), 'utils-shared-test-' + process.pid);

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// --- readFileSafe ---

describe('readFileSafe', () => {
  it('returns content when file exists', () => {
    const file = join(TMP, 'exists.txt');
    writeFileSync(file, 'hello world');
    expect(readFileSafe(file)).toBe('hello world');
  });

  it('returns empty string when file does not exist', () => {
    expect(readFileSafe(join(TMP, 'missing.txt'))).toBe('');
  });

  it('returns empty string for an existing empty file', () => {
    const file = join(TMP, 'empty.txt');
    writeFileSync(file, '');
    expect(readFileSafe(file)).toBe('');
  });

  it('returns empty string for a directory path', () => {
    // reading a directory throws, should return empty string
    expect(readFileSafe(TMP)).toBe('');
  });

  it('returns full multi-line content', () => {
    const file = join(TMP, 'multi.txt');
    const content = 'line1\nline2\nline3';
    writeFileSync(file, content);
    expect(readFileSafe(file)).toBe(content);
  });

  it('returns empty string for invalid path', () => {
    expect(readFileSafe('/nonexistent/deep/path/file.txt')).toBe('');
  });
});

// --- readJsonSafe ---

describe('readJsonSafe', () => {
  it('returns parsed object when file has valid JSON', () => {
    const file = join(TMP, 'valid.json');
    writeFileSync(file, JSON.stringify({ key: 'value' }));
    expect(readJsonSafe(file)).toEqual({ key: 'value' });
  });

  it('returns null when file does not exist', () => {
    expect(readJsonSafe(join(TMP, 'missing.json'))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const file = join(TMP, 'bad.json');
    writeFileSync(file, '{ not valid }');
    expect(readJsonSafe(file)).toBeNull();
  });

  it('returns null for a directory path', () => {
    expect(readJsonSafe(TMP)).toBeNull();
  });
});

// --- readJsonSafeAsync ---

describe('readJsonSafeAsync', () => {
  it('returns parsed object when file has valid JSON', async () => {
    const file = join(TMP, 'valid-async.json');
    writeFileSync(file, JSON.stringify({ value: 42 }));
    expect(await readJsonSafeAsync(file)).toEqual({ value: 42 });
  });

  it('returns null when file does not exist', async () => {
    expect(await readJsonSafeAsync(join(TMP, 'missing.json'))).toBeNull();
  });

  it('returns null for malformed JSON', async () => {
    const file = join(TMP, 'bad-async.json');
    writeFileSync(file, '{ broken }');
    expect(await readJsonSafeAsync(file)).toBeNull();
  });
});

// --- parseSprintNumber ---

describe('parseSprintNumber', () => {
  it('parses sprint-021 to 21', () => {
    expect(parseSprintNumber('sprint-021')).toBe(21);
  });

  it('parses sprint-001 to 1', () => {
    expect(parseSprintNumber('sprint-001')).toBe(1);
  });

  it('returns 0 for unrecognized format', () => {
    expect(parseSprintNumber('unknown')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(parseSprintNumber('')).toBe(0);
  });

  it('parses sprint-100 to 100', () => {
    expect(parseSprintNumber('sprint-100')).toBe(100);
  });
});
