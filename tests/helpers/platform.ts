import { existsSync, readFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { TestAPI } from 'vitest';

export const isWindows = process.platform === 'win32';

export const isWSL =
  process.platform === 'linux' &&
  existsSync('/proc/version') &&
  readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft');

export const isUnixOnly = !isWindows;

/**
 * Returns it.skip when running on Windows, otherwise returns the test function.
 * Usage: skipOnWindows(() => { it('unix test', () => { ... }); })
 */
export function skipOnWindows(fn: () => void): void {
  if (isWindows) {
    return;
  }
  fn();
}

/**
 * Wraps a vitest `it` so that it is skipped on Windows.
 * Usage: itUnix(it)('description', () => { ... })
 */
export function itUnix(itFn: TestAPI): TestAPI {
  if (isWindows) {
    return itFn.skip as unknown as TestAPI;
  }
  return itFn;
}

/**
 * Creates a temporary directory with a platform-safe prefix.
 * The directory is created under the OS temp dir.
 * Returns the absolute path to the created directory.
 */
export function createTempDir(prefix: string): string {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_');
  return mkdtempSync(join(tmpdir(), `${safePrefix}-`));
}
