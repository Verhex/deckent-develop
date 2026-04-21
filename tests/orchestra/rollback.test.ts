import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from 'node:fs';

import {
  isCleanWorkingTree,
  getDirtyFiles,
  getCurrentCommitSha,
  getCurrentBranch,
  createSafetyPoint,
  rollback,
  deleteSafetyPoint,
  deleteSafetyPointFile,
  safetyBranchExists,
  getRollbackPolicy,
  recordRollbackInDebt,
  saveSafetyPoint,
  loadSafetyPoint,
  isGitRepo,
  cleanOrphanSafetyPoint,
  type SafetyPoint,
  type RollbackResult,
} from '../../src/orchestra/rollback.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

const mockSpawnSync = vi.mocked(spawnSync);

function makeResult(stdout: string, stderr = '', status = 0): SpawnSyncReturns<string> {
  return { stdout, stderr, status, pid: 1, output: [], signal: null, error: undefined };
}

describe('isCleanWorkingTree', () => {
  it('returns true when git status --porcelain is empty', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    expect(isCleanWorkingTree('/repo')).toBe(true);
  });

  it('returns false when there are uncommitted changes', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts\n M src/bar.ts'));
    expect(isCleanWorkingTree('/repo')).toBe(false);
  });

  it('returns false when git command fails', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not a git repo', 128));
    expect(isCleanWorkingTree('/repo')).toBe(false);
  });

  it('returns true when stdout is only whitespace/newlines', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('   '));
    expect(isCleanWorkingTree('/repo')).toBe(true);
  });
});

describe('getDirtyFiles', () => {
  it('returns empty array when working tree is clean', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    expect(getDirtyFiles('/repo')).toEqual([]);
  });

  it('parses dirty file paths correctly', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts\n M src/bar.ts\n'));
    expect(getDirtyFiles('/repo')).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('handles staged and unstaged changes', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('M  staged.ts\n M unstaged.ts\n'));
    const files = getDirtyFiles('/repo');
    expect(files).toContain('staged.ts');
    expect(files).toContain('unstaged.ts');
  });

  it('returns empty array when git command fails', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'error', 128));
    expect(getDirtyFiles('/repo')).toEqual([]);
  });
});

describe('getCurrentCommitSha', () => {
  it('returns the SHA from git rev-parse HEAD', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('abc1234def5678'));
    expect(getCurrentCommitSha('/repo')).toBe('abc1234def5678');
  });

  it('returns empty string on failure', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'fatal', 128));
    expect(getCurrentCommitSha('/repo')).toBe('');
  });
});

describe('getCurrentBranch', () => {
  it('returns branch name', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('main'));
    expect(getCurrentBranch('/repo')).toBe('main');
  });

  it('returns HEAD on failure', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'error', 128));
    expect(getCurrentBranch('/repo')).toBe('HEAD');
  });
});

describe('createSafetyPoint', () => {
  it('creates a backup branch when working tree is clean', () => {
    // isCleanWorkingTree → clean
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    // getCurrentCommitSha
    mockSpawnSync.mockReturnValueOnce(makeResult('deadbeef1234'));
    // git branch branchName
    mockSpawnSync.mockReturnValueOnce(makeResult(''));

    const point = createSafetyPoint('/repo', 'sprint-001');
    expect(point.branchName).toBe('deckent-backup-sprint-001');
    expect(point.commitSha).toBe('deadbeef1234');
    expect(point.id).toBe('sprint-001');
    expect(point.wasClean).toBe(true);
    expect(point.createdAt).toBeTruthy();
  });

  it('stashes and pops when working tree is dirty', () => {
    // isCleanWorkingTree → dirty
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts'));
    // git stash push
    mockSpawnSync.mockReturnValueOnce(makeResult('Saved'));
    // getCurrentCommitSha
    mockSpawnSync.mockReturnValueOnce(makeResult('cafebabe'));
    // git branch
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    // git stash pop
    mockSpawnSync.mockReturnValueOnce(makeResult(''));

    const point = createSafetyPoint('/repo', 'sprint-002');
    expect(point.wasClean).toBe(false);
    expect(point.commitSha).toBe('cafebabe');
  });

  it('throws when stash pop fails after dirty tree (user-loss guard)', () => {
    // isCleanWorkingTree → dirty
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts'));
    // git stash push
    mockSpawnSync.mockReturnValueOnce(makeResult('Saved'));
    // getCurrentCommitSha
    mockSpawnSync.mockReturnValueOnce(makeResult('cafebabe'));
    // git branch
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    // git stash pop fails
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'conflict', 1));

    expect(() => createSafetyPoint('/repo', 'sprint-002b')).toThrow(
      'Stash pop failed',
    );
  });

  it('throws when stash fails on dirty tree', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts'));
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'stash error', 1));

    expect(() => createSafetyPoint('/repo', 'sprint-003')).toThrow('Failed to stash changes');
  });

  it('throws when getCurrentCommitSha returns empty', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(''));    // clean
    mockSpawnSync.mockReturnValueOnce(makeResult('', '', 128)); // SHA fails

    expect(() => createSafetyPoint('/repo', 'sprint-004')).toThrow(
      'failed to get commit SHA'
    );
  });

  it('force-updates branch if it already exists', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(''));       // clean
    mockSpawnSync.mockReturnValueOnce(makeResult('sha1'));   // SHA
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'already exists', 128)); // branch fails
    mockSpawnSync.mockReturnValueOnce(makeResult(''));       // branch -f succeeds

    const point = createSafetyPoint('/repo', 'sprint-005');
    expect(point.branchName).toBe('deckent-backup-sprint-005');
  });

  it('throws when branch creation and force both fail', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(''));      // clean
    mockSpawnSync.mockReturnValueOnce(makeResult('sha1')); // SHA
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'error', 1)); // branch fails
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'force error', 1)); // -f fails

    expect(() => createSafetyPoint('/repo', 'sprint-006')).toThrow(
      'Failed to create safety branch'
    );
  });

  it('returns SafetyPoint with correct structure', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    mockSpawnSync.mockReturnValueOnce(makeResult('abc123'));
    mockSpawnSync.mockReturnValueOnce(makeResult(''));

    const point = createSafetyPoint('/repo', 'sprint-007');
    expect(point).toMatchObject({
      id: 'sprint-007',
      branchName: 'deckent-backup-sprint-007',
      commitSha: 'abc123',
      wasClean: true,
    });
    expect(typeof point.createdAt).toBe('string');
  });
});

describe('rollback', () => {
  const safetyPoint = {
    id: 'sprint-010',
    branchName: 'deckent-backup-sprint-010',
    commitSha: 'abc1234',
    createdAt: '2026-01-01T00:00:00.000Z',
    wasClean: true,
  };

  it('returns success when rollback succeeds', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('deckent-backup-sprint-010')); // verify
    mockSpawnSync.mockReturnValueOnce(makeResult('abc1234'));                    // rev-parse branch
    mockSpawnSync.mockReturnValueOnce(makeResult('HEAD is now at abc1234'));     // reset --hard

    const result = rollback('/repo', safetyPoint);
    expect(result.success).toBe(true);
    expect(result.message).toContain('abc1234');
  });

  it('returns failure when safety branch does not exist', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not found', 128)); // verify fails

    const result = rollback('/repo', safetyPoint);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('returns failure when rev-parse branch fails', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('ok'));             // verify passes
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'error', 1)); // rev-parse fails

    const result = rollback('/repo', safetyPoint);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to resolve safety branch SHA');
  });

  it('returns failure when git reset --hard fails', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('ok'));       // verify
    mockSpawnSync.mockReturnValueOnce(makeResult('abc1234')); // rev-parse
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'reset failed', 1)); // reset fails

    const result = rollback('/repo', safetyPoint);
    expect(result.success).toBe(false);
    expect(result.message).toContain('git reset --hard failed');
  });
});

describe('deleteSafetyPoint', () => {
  const safetyPoint = {
    id: 'sprint-020',
    branchName: 'deckent-backup-sprint-020',
    commitSha: 'deadbeef',
    createdAt: '2026-01-01T00:00:00.000Z',
    wasClean: true,
  };

  it('returns true on successful branch deletion', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('Deleted branch deckent-backup-sprint-020'));
    expect(deleteSafetyPoint('/repo', safetyPoint)).toBe(true);
  });

  it('returns false when branch deletion fails', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not found', 1));
    expect(deleteSafetyPoint('/repo', safetyPoint)).toBe(false);
  });
});

describe('safetyBranchExists', () => {
  it('returns true when branch exists', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('abc1234'));
    expect(safetyBranchExists('/repo', 'sprint-030')).toBe(true);
  });

  it('returns false when branch does not exist', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not found', 128));
    expect(safetyBranchExists('/repo', 'sprint-031')).toBe(false);
  });
});

describe('getRollbackPolicy', () => {
  it('returns "auto" when all evaluations are NO_GO', () => {
    expect(getRollbackPolicy(['NO_GO', 'NO_GO', 'NO_GO'])).toBe('auto');
  });

  it('returns "ask" when some evaluations are NO_GO', () => {
    expect(getRollbackPolicy(['DONE', 'NO_GO', 'DONE'])).toBe('ask');
  });

  it('returns "never" when all evaluations are DONE', () => {
    expect(getRollbackPolicy(['DONE', 'DONE'])).toBe('never');
  });

  it('returns "never" when all are GO_WITH_TECH_DEBT', () => {
    expect(getRollbackPolicy(['GO_WITH_TECH_DEBT', 'GO_WITH_TECH_DEBT'])).toBe('never');
  });

  it('returns "ask" for mixed DONE + NO_GO', () => {
    expect(getRollbackPolicy(['DONE', 'GO_WITH_TECH_DEBT', 'NO_GO'])).toBe('ask');
  });

  it('returns "never" for empty evaluations', () => {
    expect(getRollbackPolicy([])).toBe('never');
  });

  it('returns "auto" for single NO_GO', () => {
    expect(getRollbackPolicy(['NO_GO'])).toBe('auto');
  });

  it('returns "never" for single DONE', () => {
    expect(getRollbackPolicy(['DONE'])).toBe('never');
  });
});

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockAppendFileSync = vi.mocked(appendFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockRmSync = vi.mocked(rmSync);

describe('recordRollbackInDebt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates DEBT.md with header when file does not exist', () => {
    mockExistsSync.mockReturnValueOnce(true);   // brainPath exists
    mockExistsSync.mockReturnValueOnce(false);  // debtPath does not exist

    const result: RollbackResult = { success: true, message: 'Rolled back to abc' };
    recordRollbackInDebt('/repo', 'sprint-050', result);

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const written = mockWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('| id | description |');
    expect(written).toContain('rollback-sprint-050');
    expect(written).toContain('SUCCESS');
  });

  it('appends to existing DEBT.md', () => {
    mockExistsSync.mockReturnValueOnce(true);  // brainPath exists
    mockExistsSync.mockReturnValueOnce(true);  // debtPath exists

    const result: RollbackResult = { success: false, message: 'Branch not found' };
    recordRollbackInDebt('/repo', 'sprint-051', result);

    expect(mockAppendFileSync).toHaveBeenCalledOnce();
    const appended = mockAppendFileSync.mock.calls[0][1] as string;
    expect(appended).toContain('rollback-sprint-051');
    expect(appended).toContain('FAILED');
    expect(appended).toContain('Branch not found');
  });

  it('creates .brain/ directory if it does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);  // brainPath does not exist
    mockExistsSync.mockReturnValueOnce(false);  // debtPath does not exist

    const result: RollbackResult = { success: true, message: 'ok' };
    recordRollbackInDebt('/repo', 'sprint-052', result);

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('.brain'), { recursive: true });
  });

  it('does not throw when fs operations fail', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockExistsSync.mockReturnValueOnce(true);
    mockAppendFileSync.mockImplementationOnce(() => { throw new Error('disk full'); });

    expect(() => {
      recordRollbackInDebt('/repo', 'sprint-053', { success: true, message: 'ok' });
    }).not.toThrow();
  });
});

describe('saveSafetyPoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const point: SafetyPoint = {
    id: 'sprint-060',
    branchName: 'deckent-backup-sprint-060',
    commitSha: 'abc123',
    createdAt: '2026-01-01T00:00:00.000Z',
    wasClean: true,
  };

  it('writes safety point JSON to .deckent/safety-point.json', () => {
    mockExistsSync.mockReturnValueOnce(true); // .deckent dir exists

    saveSafetyPoint('/repo', point);

    expect(mockWriteFileSync).toHaveBeenCalledOnce();
    const [path, content] = mockWriteFileSync.mock.calls[0];
    expect(path).toContain('safety-point.json');
    const parsed = JSON.parse(content as string);
    expect(parsed.id).toBe('sprint-060');
    expect(parsed.branchName).toBe('deckent-backup-sprint-060');
    expect(parsed.commitSha).toBe('abc123');
  });

  it('creates .deckent directory if it does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false); // .deckent dir does not exist

    saveSafetyPoint('/repo', point);

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('.deckent'), { recursive: true });
  });

  it('does not throw on write failure', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockWriteFileSync.mockImplementationOnce(() => { throw new Error('permission denied'); });

    expect(() => saveSafetyPoint('/repo', point)).not.toThrow();
  });
});

describe('loadSafetyPoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns SafetyPoint when file exists and is valid JSON', () => {
    const data: SafetyPoint = {
      id: 'sprint-070',
      branchName: 'deckent-backup-sprint-070',
      commitSha: 'deadbeef',
      createdAt: '2026-01-01T00:00:00.000Z',
      wasClean: false,
    };
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(data));

    const result = loadSafetyPoint('/repo');
    expect(result).toEqual(data);
  });

  it('returns null when file does not exist', () => {
    mockExistsSync.mockReturnValueOnce(false);

    expect(loadSafetyPoint('/repo')).toBeNull();
  });

  it('returns null when file contains invalid JSON', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValueOnce('not json at all');

    expect(loadSafetyPoint('/repo')).toBeNull();
  });

  it('returns null when readFileSync throws', () => {
    mockExistsSync.mockReturnValueOnce(true);
    mockReadFileSync.mockImplementationOnce(() => { throw new Error('ENOENT'); });

    expect(loadSafetyPoint('/repo')).toBeNull();
  });
});

describe('deleteSafetyPoint — JSON cleanup (BULGU 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const safetyPoint: SafetyPoint = {
    id: 'sprint-080',
    branchName: 'deckent-backup-sprint-080',
    commitSha: 'abc123',
    createdAt: '2026-01-01T00:00:00.000Z',
    wasClean: true,
  };

  it('deletes both git branch AND JSON file on success', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('Deleted branch'));

    const result = deleteSafetyPoint('/repo', safetyPoint);
    expect(result).toBe(true);
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining('safety-point.json'),
      { force: true },
    );
  });

  it('deletes JSON file even when branch deletion fails', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not found', 1));

    const result = deleteSafetyPoint('/repo', safetyPoint);
    expect(result).toBe(false);
    // JSON file should still be cleaned up
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining('safety-point.json'),
      { force: true },
    );
  });
});

describe('deleteSafetyPointFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls rmSync with force: true', () => {
    deleteSafetyPointFile('/repo');
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining('safety-point.json'),
      { force: true },
    );
  });

  it('does not throw when rmSync fails', () => {
    mockRmSync.mockImplementationOnce(() => { throw new Error('EPERM'); });
    expect(() => deleteSafetyPointFile('/repo')).not.toThrow();
  });
});

describe('isGitRepo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when git rev-parse --git-dir succeeds', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('.git'));
    expect(isGitRepo('/repo')).toBe(true);
  });

  it('returns false when not a git repository', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not a git repo', 128));
    expect(isGitRepo('/repo')).toBe(false);
  });
});

describe('cleanOrphanSafetyPoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false when no safety point file exists', () => {
    mockExistsSync.mockReturnValueOnce(false); // loadSafetyPoint → file not found

    expect(cleanOrphanSafetyPoint('/repo', 'sprint-100')).toBe(false);
  });

  it('returns false when safety point belongs to current sprint (live preservation)', () => {
    const data: SafetyPoint = {
      id: 'sprint-100',
      branchName: 'deckent-backup-sprint-100',
      commitSha: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      wasClean: true,
    };
    mockExistsSync.mockReturnValueOnce(true); // loadSafetyPoint → file exists
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(data));

    expect(cleanOrphanSafetyPoint('/repo', 'sprint-100')).toBe(false);
    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it('cleans orphan when safety point belongs to a different sprint (stale detection)', () => {
    const data: SafetyPoint = {
      id: 'sprint-099',
      branchName: 'deckent-backup-sprint-099',
      commitSha: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      wasClean: true,
    };
    mockExistsSync.mockReturnValueOnce(true); // loadSafetyPoint → file exists
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(data));
    // safetyBranchExists → branch does not exist
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not found', 128));

    expect(cleanOrphanSafetyPoint('/repo', 'sprint-100')).toBe(true);
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining('safety-point.json'),
      { force: true },
    );
  });

  it('cleans orphan branch when it still exists', () => {
    const data: SafetyPoint = {
      id: 'sprint-098',
      branchName: 'deckent-backup-sprint-098',
      commitSha: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      wasClean: true,
    };
    mockExistsSync.mockReturnValueOnce(true); // loadSafetyPoint → file exists
    mockReadFileSync.mockReturnValueOnce(JSON.stringify(data));
    // safetyBranchExists → branch exists (orphan)
    mockSpawnSync.mockReturnValueOnce(makeResult('abc'));
    // git branch -D (cleanup)
    mockSpawnSync.mockReturnValueOnce(makeResult('Deleted'));

    expect(cleanOrphanSafetyPoint('/repo', 'sprint-100')).toBe(true);
    expect(mockRmSync).toHaveBeenCalled();
  });
});

describe('createSafetyPoint — stash pop fail throws with recovery instructions', () => {
  it('error message includes git stash recovery instructions', () => {
    // isCleanWorkingTree → dirty
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts'));
    // git stash push
    mockSpawnSync.mockReturnValueOnce(makeResult('Saved'));
    // getCurrentCommitSha
    mockSpawnSync.mockReturnValueOnce(makeResult('cafebabe'));
    // git branch
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    // git stash pop fails
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'CONFLICT', 1));

    expect(() => createSafetyPoint('/repo', 'sprint-recovery')).toThrow(
      /git stash list/,
    );
  });
});
