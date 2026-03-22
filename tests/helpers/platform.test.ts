import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, rmdirSync } from 'fs';
import { isWindows, isWSL, isUnixOnly, createTempDir, skipOnWindows, itUnix } from './platform.js';

describe('platform detection', () => {
  it('isWindows reflects process.platform', () => {
    expect(isWindows).toBe(process.platform === 'win32');
  });

  it('isUnixOnly is the opposite of isWindows', () => {
    expect(isUnixOnly).toBe(!isWindows);
  });

  it('isWSL is a boolean', () => {
    expect(typeof isWSL).toBe('boolean');
  });

  it('isWSL is false on Windows native', () => {
    if (isWindows) {
      expect(isWSL).toBe(false);
    }
  });

  it('isWSL is false on macOS', () => {
    if (process.platform === 'darwin') {
      expect(isWSL).toBe(false);
    }
  });

  it('exactly one of isWindows/isUnixOnly is true', () => {
    expect(isWindows !== isUnixOnly).toBe(true);
  });
});

describe('skipOnWindows', () => {
  it('skipOnWindows does not throw', () => {
    expect(() => skipOnWindows(() => {})).not.toThrow();
  });

  it('skipOnWindows calls fn on non-Windows platforms', () => {
    if (!isWindows) {
      let called = false;
      skipOnWindows(() => { called = true; });
      expect(called).toBe(true);
    }
  });

  it('skipOnWindows does NOT call fn on Windows', () => {
    if (isWindows) {
      let called = false;
      skipOnWindows(() => { called = true; });
      expect(called).toBe(false);
    }
  });
});

describe('itUnix', () => {
  it('itUnix returns a callable test function', () => {
    expect(typeof itUnix(it)).toBe('function');
  });
});

describe('createTempDir', () => {
  const created: string[] = [];

  afterEach(() => {
    for (const dir of created) {
      try {
        rmdirSync(dir);
      } catch {
        // already removed or not empty — ignore
      }
    }
    created.length = 0;
  });

  it('creates a directory that exists', () => {
    const dir = createTempDir('test');
    created.push(dir);
    expect(existsSync(dir)).toBe(true);
  });

  it('returns an absolute path', () => {
    const dir = createTempDir('deckent');
    created.push(dir);
    expect(dir.startsWith('/') || /^[A-Z]:\\/i.test(dir)).toBe(true);
  });

  it('prefix appears in the directory name', () => {
    const dir = createTempDir('mypfx');
    created.push(dir);
    expect(dir).toContain('mypfx');
  });

  it('each call creates a unique directory', () => {
    const dir1 = createTempDir('unique');
    const dir2 = createTempDir('unique');
    created.push(dir1, dir2);
    expect(dir1).not.toBe(dir2);
  });

  it('handles special characters in prefix safely', () => {
    const dir = createTempDir('my/prefix:with?bad*chars');
    created.push(dir);
    expect(existsSync(dir)).toBe(true);
  });
});
