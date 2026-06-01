import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Runs `fn` with `process.env.HOME` pointed at a fresh temp directory.
 * Restores the original HOME and removes the temp dir afterward (try/finally).
 */
export async function withSandboxHome<T>(fn: (homeDir: string) => T | Promise<T>): Promise<T> {
  const originalHome = process.env['HOME'];
  const sandboxDir = mkdtempSync(join(tmpdir(), 'sandbox-home-'));
  process.env['HOME'] = sandboxDir;
  try {
    return await fn(sandboxDir);
  } finally {
    if (originalHome === undefined) {
      delete process.env['HOME'];
    } else {
      process.env['HOME'] = originalHome;
    }
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

/**
 * Returns beforeEach / afterEach hooks that sandbox HOME for a test suite.
 * Usage:
 *   const { beforeEach: sandboxBefore, afterEach: sandboxAfter } = useSandboxHome();
 *   beforeEach(sandboxBefore);
 *   afterEach(sandboxAfter);
 */
export function useSandboxHome(): {
  beforeEach: () => void;
  afterEach: () => void;
  getSandboxDir: () => string;
} {
  let originalHome: string | undefined;
  let sandboxDir = '';

  return {
    beforeEach() {
      originalHome = process.env['HOME'];
      sandboxDir = mkdtempSync(join(tmpdir(), 'sandbox-home-'));
      process.env['HOME'] = sandboxDir;
    },
    afterEach() {
      if (originalHome === undefined) {
        delete process.env['HOME'];
      } else {
        process.env['HOME'] = originalHome;
      }
      if (sandboxDir) {
        rmSync(sandboxDir, { recursive: true, force: true });
        sandboxDir = '';
      }
    },
    getSandboxDir() {
      return sandboxDir;
    },
  };
}
