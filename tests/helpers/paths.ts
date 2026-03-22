import { strictEqual } from 'assert';

/**
 * Converts all backslashes to forward slashes and normalizes repeated slashes.
 * Handles Windows UNC paths by preserving leading double-slash.
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Converts a path to Unix-style forward slashes.
 * Equivalent to normalizePath but explicitly named for clarity.
 */
export function toUnixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Asserts that two paths are equal after normalization.
 * Both paths are normalized to forward slashes before comparison.
 */
export function assertPathEquals(actual: string, expected: string): void {
  const normalizedActual = normalizePath(actual);
  const normalizedExpected = normalizePath(expected);
  strictEqual(
    normalizedActual,
    normalizedExpected,
    `Path mismatch:\n  actual:   ${normalizedActual}\n  expected: ${normalizedExpected}`,
  );
}

/**
 * Joins path segments using forward slashes regardless of platform.
 */
export function joinUnix(...segments: string[]): string {
  return segments.map((s) => normalizePath(s)).join('/').replace(/\/+/g, '/');
}
