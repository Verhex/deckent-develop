import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { withSandboxHome, useSandboxHome } from './sandbox-home.js';

describe('withSandboxHome', () => {
  it('sets HOME to a directory inside tmpdir', async () => {
    await withSandboxHome((homeDir) => {
      expect(process.env['HOME']).toBe(homeDir);
      expect(homeDir.startsWith(tmpdir())).toBe(true);
    });
  });

  it('restores original HOME after fn completes', async () => {
    const original = process.env['HOME'];
    await withSandboxHome(() => {
      expect(process.env['HOME']).not.toBe(original);
    });
    expect(process.env['HOME']).toBe(original);
  });

  it('cleans up the temp dir after fn completes', async () => {
    let capturedDir = '';
    await withSandboxHome((homeDir) => {
      capturedDir = homeDir;
      expect(existsSync(capturedDir)).toBe(true);
    });
    expect(existsSync(capturedDir)).toBe(false);
  });

  it('restores HOME even when fn throws', async () => {
    const original = process.env['HOME'];
    await expect(
      withSandboxHome(() => {
        throw new Error('deliberate failure');
      }),
    ).rejects.toThrow('deliberate failure');
    expect(process.env['HOME']).toBe(original);
  });

  it('nested calls each get their own sandbox and are independent', async () => {
    const outer = process.env['HOME'];
    await withSandboxHome(async (outerDir) => {
      expect(process.env['HOME']).toBe(outerDir);
      await withSandboxHome((innerDir) => {
        expect(innerDir).not.toBe(outerDir);
        expect(process.env['HOME']).toBe(innerDir);
      });
      // after inner cleanup, outer sandbox is restored
      expect(process.env['HOME']).toBe(outerDir);
    });
    expect(process.env['HOME']).toBe(outer);
  });

  it('does not write anything to the project root', async () => {
    const projectRoot = process.cwd();
    await withSandboxHome((homeDir) => {
      expect(homeDir).not.toBe(projectRoot);
      expect(homeDir.startsWith(projectRoot)).toBe(false);
    });
  });
});

describe('useSandboxHome', () => {
  const sandbox = useSandboxHome();

  beforeEach(sandbox.beforeEach);
  afterEach(sandbox.afterEach);

  it('sets HOME to a tmpdir-based path in beforeEach', () => {
    const home = process.env['HOME'] ?? '';
    expect(home.startsWith(tmpdir())).toBe(true);
  });

  it('getSandboxDir returns the current sandbox directory', () => {
    const dir = sandbox.getSandboxDir();
    expect(existsSync(dir)).toBe(true);
    expect(process.env['HOME']).toBe(dir);
  });

  it('sandbox dir is writable (can create a file inside)', () => {
    const dir = sandbox.getSandboxDir();
    const testFile = `${dir}/.testfile`;
    expect(() => writeFileSync(testFile, 'hello')).not.toThrow();
    expect(existsSync(testFile)).toBe(true);
  });
});
