import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import {
  parsePackOutput,
  checkExcludedFiles,
  checkRequiredFiles,
  parseSizeToBytes,
  checkPackageSize,
  runNpmPackDryRun,
  runPackTest,
} from '../../scripts/pack-test.js';

const mockedExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parsePackOutput', () => {
  it('extracts file paths from npm pack output', () => {
    const output = [
      'npm notice === Tarball Contents ===',
      'npm notice 1.2kB  dist/index.js',
      'npm notice 0.5kB  dist/index.d.ts',
      'npm notice 2.0kB  README.md',
      'npm notice === Tarball Details ===',
      'npm notice total files:   3',
      'npm notice unpacked size: 3.7 kB',
    ].join('\n');

    const result = parsePackOutput(output);
    expect(result.files).toContain('dist/index.js');
    expect(result.files).toContain('dist/index.d.ts');
    expect(result.files).toContain('README.md');
  });

  it('extracts total size', () => {
    const output = 'npm notice unpacked size: 123.4 kB\n';
    const result = parsePackOutput(output);
    expect(result.totalSize).toBe('123.4 kB');
  });

  it('returns empty arrays for empty output', () => {
    const result = parsePackOutput('');
    expect(result.files).toEqual([]);
    expect(result.totalSize).toBe('');
  });
});

describe('checkExcludedFiles', () => {
  it('returns all ok when no sensitive files present', () => {
    const files = ['dist/index.js', 'dist/cli/index.js', 'README.md', 'LICENSE', 'package.json'];
    const results = checkExcludedFiles(files);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('detects .brain/ directory in pack', () => {
    const files = ['dist/index.js', '.brain/MEMORY.md'];
    const results = checkExcludedFiles(files);
    const brainCheck = results.find(r => r.name.includes('.brain/'));
    expect(brainCheck?.ok).toBe(false);
    expect(brainCheck?.message).toContain('SENSITIVE');
  });

  it('detects .tasks/ directory in pack', () => {
    const files = ['dist/index.js', '.tasks/task-001.json'];
    const results = checkExcludedFiles(files);
    const tasksCheck = results.find(r => r.name.includes('.tasks/'));
    expect(tasksCheck?.ok).toBe(false);
  });

  it('detects test files in pack', () => {
    const files = ['dist/index.js', 'some.test.ts'];
    const results = checkExcludedFiles(files);
    const testCheck = results.find(r => r.name.includes('test files'));
    expect(testCheck?.ok).toBe(false);
  });

  it('detects .claude/ directory in pack', () => {
    const files = ['dist/index.js', '.claude/settings.json'];
    const results = checkExcludedFiles(files);
    const claudeCheck = results.find(r => r.name.includes('.claude/'));
    expect(claudeCheck?.ok).toBe(false);
  });

  it('detects src/ directory in pack', () => {
    const files = ['dist/index.js', 'src/core/types.ts'];
    const results = checkExcludedFiles(files);
    const srcCheck = results.find(r => r.name.includes('src/'));
    expect(srcCheck?.ok).toBe(false);
  });
});

describe('checkRequiredFiles', () => {
  it('returns all ok when required files present', () => {
    const files = ['dist/index.js', 'dist/cli/index.js', 'README.md', 'LICENSE', 'package.json'];
    const results = checkRequiredFiles(files);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('detects missing README.md', () => {
    const files = ['dist/index.js', 'LICENSE', 'package.json'];
    const results = checkRequiredFiles(files);
    const readmeCheck = results.find(r => r.name.includes('README.md'));
    expect(readmeCheck?.ok).toBe(false);
  });

  it('detects missing LICENSE', () => {
    const files = ['dist/index.js', 'README.md', 'package.json'];
    const results = checkRequiredFiles(files);
    const licenseCheck = results.find(r => r.name.includes('LICENSE'));
    expect(licenseCheck?.ok).toBe(false);
  });

  it('detects missing dist/cli/index.js', () => {
    const files = ['dist/index.js', 'README.md', 'LICENSE', 'package.json'];
    const results = checkRequiredFiles(files);
    const binCheck = results.find(r => r.name.includes('dist/cli/index.js'));
    expect(binCheck?.ok).toBe(false);
  });
});

describe('parseSizeToBytes', () => {
  it('parses kB', () => {
    expect(parseSizeToBytes('123.4 kB')).toBeCloseTo(123.4 * 1024, 0);
  });

  it('parses MB', () => {
    expect(parseSizeToBytes('5.2 MB')).toBeCloseTo(5.2 * 1024 * 1024, 0);
  });

  it('parses B', () => {
    expect(parseSizeToBytes('512 B')).toBe(512);
  });

  it('returns 0 for invalid string', () => {
    expect(parseSizeToBytes('invalid')).toBe(0);
  });
});

describe('checkPackageSize', () => {
  it('returns ok when under limit', () => {
    const result = checkPackageSize('500 kB', 10);
    expect(result.ok).toBe(true);
  });

  it('returns error when over limit', () => {
    const result = checkPackageSize('15 MB', 10);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('exceeds');
  });

  it('handles empty size string', () => {
    const result = checkPackageSize('');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Could not determine');
  });
});

describe('runNpmPackDryRun', () => {
  it('calls npm pack --dry-run', () => {
    mockedExecSync.mockReturnValue('npm notice stuff');
    const result = runNpmPackDryRun('/project');
    expect(mockedExecSync).toHaveBeenCalledWith('npm pack --dry-run 2>&1', expect.objectContaining({ cwd: '/project' }));
    expect(result).toBe('npm notice stuff');
  });
});

describe('runPackTest', () => {
  it('runs full pack test pipeline', () => {
    mockedExecSync.mockReturnValue([
      'npm notice === Tarball Contents ===',
      'npm notice 1.0kB  dist/index.js',
      'npm notice 1.0kB  dist/cli/index.js',
      'npm notice 0.5kB  README.md',
      'npm notice 0.5kB  LICENSE',
      'npm notice 0.5kB  package.json',
      'npm notice === Tarball Details ===',
      'npm notice unpacked size: 3.5 kB',
    ].join('\n'));

    const result = runPackTest('/project');
    expect(result.checks.length).toBeGreaterThan(5);
    expect(result.files.length).toBeGreaterThan(0);
  });
});
