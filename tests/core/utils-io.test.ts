import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSafe, readJsonSafe } from '../../src/core/utils.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TMP = join(tmpdir(), 'utils-io-test-' + process.pid);

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('readFileSafe', () => {
  it('returns file content for an existing file', () => {
    const file = join(TMP, 'test.txt');
    writeFileSync(file, 'hello world');
    expect(readFileSafe(file)).toBe('hello world');
  });

  it('returns empty string for a non-existent file', () => {
    expect(readFileSafe(join(TMP, 'does-not-exist.txt'))).toBe('');
  });

  it('returns empty string for a directory path', () => {
    expect(readFileSafe(TMP)).toBe('');
  });

  it('returns empty string for an invalid path', () => {
    expect(readFileSafe('/nonexistent/path/file.txt')).toBe('');
  });

  it('returns full multi-line content correctly', () => {
    const file = join(TMP, 'multi.txt');
    const content = 'line1\nline2\nline3';
    writeFileSync(file, content);
    expect(readFileSafe(file)).toBe(content);
  });

  it('returns empty string for empty file', () => {
    const file = join(TMP, 'empty.txt');
    writeFileSync(file, '');
    expect(readFileSafe(file)).toBe('');
  });
});

describe('readJsonSafe', () => {
  it('returns parsed object for a valid JSON file', () => {
    const file = join(TMP, 'data.json');
    writeFileSync(file, JSON.stringify({ key: 'value', num: 42 }));
    expect(readJsonSafe<{ key: string; num: number }>(file)).toEqual({ key: 'value', num: 42 });
  });

  it('returns null for a non-existent file', () => {
    expect(readJsonSafe(join(TMP, 'missing.json'))).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    const file = join(TMP, 'bad.json');
    writeFileSync(file, '{ not valid json }');
    expect(readJsonSafe(file)).toBeNull();
  });

  it('returns null for an empty file', () => {
    const file = join(TMP, 'empty.json');
    writeFileSync(file, '');
    expect(readJsonSafe(file)).toBeNull();
  });

  it('returns parsed array for JSON array file', () => {
    const file = join(TMP, 'arr.json');
    writeFileSync(file, JSON.stringify([1, 2, 3]));
    expect(readJsonSafe<number[]>(file)).toEqual([1, 2, 3]);
  });

  it('preserves nested objects', () => {
    const file = join(TMP, 'nested.json');
    const data = { a: { b: { c: 'deep' } }, arr: [1, 2] };
    writeFileSync(file, JSON.stringify(data));
    expect(readJsonSafe(file)).toEqual(data);
  });

  it('returns null for plain text (non-JSON) file', () => {
    const file = join(TMP, 'text.json');
    writeFileSync(file, 'this is plain text');
    expect(readJsonSafe(file)).toBeNull();
  });

  it('returns null for a directory path', () => {
    expect(readJsonSafe(TMP)).toBeNull();
  });
});
