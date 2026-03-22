/**
 * platform-tags.test.ts
 *
 * Verifies that Unix-only test files contain the required describe.skipIf
 * guards so that they are skipped on Windows without manual intervention.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const UNIX_ONLY_FILES = [
  'tests/orchestra/tmux.test.ts',
  'tests/orchestra/tmux-edge.test.ts',
  'tests/scripts/scripts.test.ts',
];

describe('Platform-conditional test tags', () => {
  it('PLATFORM.md exists and documents platform categories', () => {
    const platformDoc = path.join(ROOT, 'tests', 'PLATFORM.md');
    expect(fs.existsSync(platformDoc)).toBe(true);

    const content = fs.readFileSync(platformDoc, 'utf-8');
    expect(content).toContain('Unix-Only');
    expect(content).toContain('All-Platforms');
    expect(content).toContain('describe.skipIf');
  });

  it.each(UNIX_ONLY_FILES)('%s declares isWindows flag', (relPath) => {
    const fullPath = path.join(ROOT, relPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain("process.platform === 'win32'");
  });

  it.each(UNIX_ONLY_FILES)('%s uses describe.skipIf at least once', (relPath) => {
    const fullPath = path.join(ROOT, relPath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    expect(content).toContain('describe.skipIf(isWindows)');
  });

  it('tmux.test.ts skipIf wraps every top-level describe', () => {
    const fullPath = path.join(ROOT, 'tests/orchestra/tmux.test.ts');
    const content = fs.readFileSync(fullPath, 'utf-8');

    // Every describe( should be preceded by skipIf — plain describe( not inside
    // a skipIf block must not appear at top level.
    const plainDescribeCount = (content.match(/^describe\(/gm) ?? []).length;
    expect(plainDescribeCount).toBe(0);
  });

  it('tmux-edge.test.ts skipIf wraps every top-level describe', () => {
    const fullPath = path.join(ROOT, 'tests/orchestra/tmux-edge.test.ts');
    const content = fs.readFileSync(fullPath, 'utf-8');

    const plainDescribeCount = (content.match(/^describe\(/gm) ?? []).length;
    expect(plainDescribeCount).toBe(0);
  });

  it('scripts.test.ts skipIf wraps the top-level OSS Scripts describe', () => {
    const fullPath = path.join(ROOT, 'tests/scripts/scripts.test.ts');
    const content = fs.readFileSync(fullPath, 'utf-8');

    // The outer describe should use skipIf
    expect(content).toContain("describe.skipIf(isWindows)('OSS Scripts'");
  });

  it('current platform is not Windows (skipIf should NOT skip on this host)', () => {
    // This test runs on Linux/macOS CI — ensure skipIf evaluates to false so
    // all Unix-only tests are actually executed.
    expect(process.platform).not.toBe('win32');
  });
});
