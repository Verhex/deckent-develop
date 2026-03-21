import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  verifyTscBuild,
  verifyDistFiles,
  verifyBinShebangs,
  verifyDistSize,
  checkCircularDeps,
  runBuildVerify,
} from '../../scripts/build-verify.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedStatSync = vi.mocked(statSync);
const mockedExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyTscBuild', () => {
  it('returns ok when tsc succeeds', () => {
    mockedExecSync.mockReturnValue('');
    const result = verifyTscBuild('/project');
    expect(result.ok).toBe(true);
    expect(result.severity).toBe('info');
  });

  it('returns error when tsc fails', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('TS2304'); });
    const result = verifyTscBuild('/project');
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
  });
});

describe('verifyDistFiles', () => {
  it('returns ok for all files that exist', () => {
    mockedExistsSync.mockReturnValue(true);
    const results = verifyDistFiles('/project', ['index.js', 'index.d.ts']);
    expect(results.every(r => r.ok)).toBe(true);
  });

  it('returns error for missing files', () => {
    mockedExistsSync.mockReturnValue(false);
    const results = verifyDistFiles('/project', ['index.js']);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.severity).toBe('error');
  });

  it('uses default required files when none specified', () => {
    mockedExistsSync.mockReturnValue(true);
    const results = verifyDistFiles('/project');
    expect(results.length).toBeGreaterThanOrEqual(4);
  });
});

describe('verifyBinShebangs', () => {
  it('returns ok when shebang present', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('#!/usr/bin/env node\nconsole.log("hi");');
    const results = verifyBinShebangs('/project', ['dist/cli/index.js']);
    expect(results[0]!.ok).toBe(true);
  });

  it('returns error when shebang missing', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('console.log("hi");');
    const results = verifyBinShebangs('/project', ['dist/cli/index.js']);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.message).toContain('shebang');
  });

  it('returns error when file not found', () => {
    mockedExistsSync.mockReturnValue(false);
    const results = verifyBinShebangs('/project', ['dist/cli/index.js']);
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.message).toContain('not found');
  });

  it('checks default bin files when none specified', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('#!/usr/bin/env node\n');
    const results = verifyBinShebangs('/project');
    expect(results.length).toBe(2);
  });
});

describe('verifyDistSize', () => {
  it('returns ok when size is under limit', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      { name: 'index.js', isFile: () => true, isDirectory: () => false },
    ] as any);
    mockedStatSync.mockReturnValue({ size: 1024 } as any);
    const result = verifyDistSize('/project', 50);
    expect(result.ok).toBe(true);
    expect(result.severity).toBe('info');
  });

  it('returns warning when size exceeds limit', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      { name: 'big.js', isFile: () => true, isDirectory: () => false },
    ] as any);
    mockedStatSync.mockReturnValue({ size: 60 * 1024 * 1024 } as any);
    const result = verifyDistSize('/project', 50);
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('warning');
  });

  it('returns error when dist/ not found', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = verifyDistSize('/project');
    expect(result.ok).toBe(false);
    expect(result.severity).toBe('error');
  });
});

describe('checkCircularDeps', () => {
  it('returns error when dist/ not found', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = checkCircularDeps('/project');
    expect(result.ok).toBe(false);
  });

  it('returns ok when no cycles found', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      { name: 'a.js', isFile: () => true, isDirectory: () => false },
      { name: 'b.js', isFile: () => true, isDirectory: () => false },
    ] as any);
    mockedReadFileSync.mockImplementation((path: any) => {
      if (String(path).endsWith('a.js')) return 'import { x } from \'./b.js\';';
      return 'export const x = 1;';
    });
    const result = checkCircularDeps('/project');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('No circular');
  });

  it('handles empty dist directory', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([] as any);
    const result = checkCircularDeps('/project');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('0 files');
  });
});

describe('runBuildVerify', () => {
  it('aggregates all checks into result', () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue('#!/usr/bin/env node\n');
    mockedReaddirSync.mockReturnValue([] as any);
    mockedStatSync.mockReturnValue({ size: 100 } as any);

    const result = runBuildVerify('/project');
    expect(result.checks.length).toBeGreaterThan(3);
    expect(typeof result.ok).toBe('boolean');
  });

  it('returns ok=false when error-severity check fails', () => {
    mockedExistsSync.mockReturnValue(false);
    const result = runBuildVerify('/project');
    expect(result.ok).toBe(false);
  });
});
