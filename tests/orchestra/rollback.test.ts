import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

import {
  isCleanWorkingTree,
  getDirtyFiles,
  getCurrentCommitSha,
  getCurrentBranch,
  createSafetyPoint,
  rollback,
  deleteSafetyPoint,
  safetyBranchExists,
  getRollbackPolicy,
} from '../../src/orchestra/rollback.js';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

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

  it('throws when stash fails on dirty tree', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts'));
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'stash error', 1));

    expect(() => createSafetyPoint('/repo', 'sprint-003')).toThrow('Failed to stash changes');
  });

  it('throws when getCurrentCommitSha returns empty', () => {
    mockSpawnSync.mockReturnValueOnce(makeResult(''));    // clean
    mockSpawnSync.mockReturnValueOnce(makeResult('', '', 128)); // SHA fails

    expect(() => createSafetyPoint('/repo', 'sprint-004')).toThrow(
      'Failed to get current commit SHA'
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
