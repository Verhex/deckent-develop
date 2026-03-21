import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  checkGitClean,
  runTscBuild,
  runTests,
  runPackCheck,
  readVersion,
  bumpVersion,
  writeVersion,
  createGitTag,
  runNpmPublish,
  isValidBumpType,
  runPublish,
} from '../../scripts/publish.js';

const mockedExecSync = vi.mocked(execSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkGitClean', () => {
  it('returns ok when working tree is clean', () => {
    mockedExecSync.mockReturnValue('');
    const result = checkGitClean('/project');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('clean');
  });

  it('returns error when uncommitted changes exist', () => {
    mockedExecSync.mockReturnValue(' M src/core/types.ts\n?? newfile.ts\n');
    const result = checkGitClean('/project');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Uncommitted');
  });

  it('returns error when git status fails', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('not a git repo'); });
    const result = checkGitClean('/project');
    expect(result.ok).toBe(false);
  });
});

describe('runTscBuild', () => {
  it('returns ok when build succeeds', () => {
    mockedExecSync.mockReturnValue('');
    const result = runTscBuild('/project');
    expect(result.ok).toBe(true);
  });

  it('returns error when build fails', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('TS2304'); });
    const result = runTscBuild('/project');
    expect(result.ok).toBe(false);
  });
});

describe('runTests', () => {
  it('returns ok when tests pass', () => {
    mockedExecSync.mockReturnValue('');
    const result = runTests('/project');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('passed');
  });

  it('returns error when tests fail', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('FAIL'); });
    const result = runTests('/project');
    expect(result.ok).toBe(false);
  });
});

describe('runPackCheck', () => {
  it('returns ok when required files in pack output', () => {
    mockedExecSync.mockReturnValue('dist/index.js\nREADME.md\nLICENSE\n');
    const result = runPackCheck('/project');
    expect(result.ok).toBe(true);
  });

  it('returns error when required file missing from pack', () => {
    mockedExecSync.mockReturnValue('dist/index.js\n');
    const result = runPackCheck('/project');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Missing');
  });
});

describe('bumpVersion', () => {
  it('bumps patch version', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
  });

  it('bumps minor version and resets patch', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });

  it('bumps major version and resets minor/patch', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });

  it('handles 0.x.x versions', () => {
    expect(bumpVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(bumpVersion('0.1.0', 'minor')).toBe('0.2.0');
    expect(bumpVersion('0.1.0', 'major')).toBe('1.0.0');
  });

  it('throws on invalid version format', () => {
    expect(() => bumpVersion('invalid', 'patch')).toThrow('Invalid version format');
  });
});

describe('readVersion', () => {
  it('reads version from package.json', () => {
    mockedReadFileSync.mockReturnValue('{"version": "1.2.3"}');
    expect(readVersion('/project')).toBe('1.2.3');
  });
});

describe('writeVersion', () => {
  it('writes new version to package.json', () => {
    mockedReadFileSync.mockReturnValue('{"version": "1.2.3"}');
    const result = writeVersion('/project', '1.3.0');
    expect(result.ok).toBe(true);
    expect(mockedWriteFileSync).toHaveBeenCalled();
    const writtenContent = mockedWriteFileSync.mock.calls[0]![1] as string;
    expect(writtenContent).toContain('"version": "1.3.0"');
  });
});

describe('isValidBumpType', () => {
  it('accepts major, minor, patch', () => {
    expect(isValidBumpType('major')).toBe(true);
    expect(isValidBumpType('minor')).toBe(true);
    expect(isValidBumpType('patch')).toBe(true);
  });

  it('rejects invalid types', () => {
    expect(isValidBumpType('invalid')).toBe(false);
    expect(isValidBumpType('')).toBe(false);
  });
});

describe('runNpmPublish', () => {
  it('runs dry-run by default', () => {
    mockedExecSync.mockReturnValue('');
    const result = runNpmPublish('/project');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('Dry run');
    expect(mockedExecSync).toHaveBeenCalledWith('npm publish --dry-run', expect.anything());
  });

  it('runs real publish when forReal', () => {
    mockedExecSync.mockReturnValue('');
    const result = runNpmPublish('/project', false);
    expect(result.message).toContain('Published');
    expect(mockedExecSync).toHaveBeenCalledWith('npm publish', expect.anything());
  });
});

describe('createGitTag', () => {
  it('creates commit and tag', () => {
    mockedExecSync.mockReturnValue('');
    const result = createGitTag('/project', '1.3.0');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('v1.3.0');
    expect(mockedExecSync).toHaveBeenCalledTimes(3); // add, commit, tag
  });

  it('returns error when git fails', () => {
    mockedExecSync.mockImplementation(() => { throw new Error('git error'); });
    const result = createGitTag('/project', '1.3.0');
    expect(result.ok).toBe(false);
  });
});

describe('runPublish', () => {
  it('stops early if git is not clean', () => {
    mockedExecSync.mockReturnValue(' M dirty.ts\n');
    const result = runPublish('/project', { bumpType: 'patch' });
    expect(result.ok).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]!.name).toBe('git clean');
  });

  it('skips tests when skipTests is true', () => {
    // Clean git
    mockedExecSync.mockImplementation((cmd: any) => {
      const cmdStr = String(cmd);
      if (cmdStr.includes('status')) return '';
      if (cmdStr.includes('pack')) return 'dist/index.js\nREADME.md\nLICENSE\n';
      return '';
    });
    mockedReadFileSync.mockReturnValue('{"version": "0.1.0"}');

    const result = runPublish('/project', { bumpType: 'patch', skipTests: true });
    const testStep = result.steps.find(s => s.name === 'vitest');
    expect(testStep?.skipped).toBe(true);
  });
});
