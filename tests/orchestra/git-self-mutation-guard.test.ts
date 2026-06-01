/**
 * tests/orchestra/git-self-mutation-guard.test.ts
 *
 * ADR-039: Verifies that createSafetyPoint and rollback are no-ops when
 * running inside the deckent-dev dogfood tree (self-project guard).
 * Sprint 218-013: git self-mutation guard.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

// ─── Mocks ────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

// Control self-project detection
const mockDetectDeckentRepo = vi.fn<(root: string) => boolean>();
vi.mock('../../src/orchestra/self-modifying-detector.js', () => ({
  detectDeckentRepo: (root: string) => mockDetectDeckentRepo(root),
  clearDetectionCache: vi.fn(),
  isSelfModifying: vi.fn().mockReturnValue(false),
  isSelfModifyingSprint: vi.fn().mockReturnValue(false),
  DECKENT_SOURCE_PATTERNS: [],
}));

vi.mock('../../src/core/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/utils.js')>();
  return { ...actual, debugLog: vi.fn() };
});

vi.mock('../../src/core/errors.js', () => ({
  ErrorRegistry: {
    createError: vi.fn((code: string, ctx?: unknown) => new Error(`${code}: ${JSON.stringify(ctx)}`)),
  },
}));

vi.mock('../../src/core/debt-store.js', () => ({
  recordRollbackDebt: vi.fn(),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────

import { createSafetyPoint, rollback } from '../../src/orchestra/rollback.js';
import { debugLog } from '../../src/core/utils.js';

const mockSpawnSync = vi.mocked(spawnSync);

function makeGitResult(stdout: string, status = 0): SpawnSyncReturns<string> {
  return { stdout, stderr: '', status, pid: 1, output: [], signal: null, error: undefined };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('git-self-mutation-guard — createSafetyPoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('self-project: createSafetyPoint is a no-op (no git stash, no backup branch)', () => {
    mockDetectDeckentRepo.mockReturnValue(true);
    // getCurrentCommitSha calls git rev-parse HEAD
    mockSpawnSync.mockReturnValue(makeGitResult('abc123def456'));

    const result = createSafetyPoint('/workspace', 'sprint-218');

    // Should return a valid SafetyPoint with the sprint id
    expect(result.id).toBe('sprint-218');
    expect(result.branchName).toBe('deckent-backup-sprint-218');
    // spawnSync should only have been called for getCurrentCommitSha (rev-parse HEAD)
    // NOT for 'stash push' or 'branch'
    const stashCalls = mockSpawnSync.mock.calls.filter(c => c[1]?.includes('stash'));
    const branchCalls = mockSpawnSync.mock.calls.filter(c => c[1]?.includes('branch'));
    expect(stashCalls).toHaveLength(0);
    expect(branchCalls).toHaveLength(0);
  });

  it('self-project: createSafetyPoint emits breadcrumb log', () => {
    mockDetectDeckentRepo.mockReturnValue(true);
    mockSpawnSync.mockReturnValue(makeGitResult('abc123'));

    createSafetyPoint('/workspace', 'sprint-218');

    const debugLogMock = vi.mocked(debugLog);
    expect(debugLogMock).toHaveBeenCalledWith(
      'rollback',
      expect.stringContaining('self-project'),
    );
  });

  it('user-project: createSafetyPoint runs normally (creates branch)', () => {
    mockDetectDeckentRepo.mockReturnValue(false);
    // isCleanWorkingTree: status --porcelain → empty (clean)
    mockSpawnSync
      .mockReturnValueOnce(makeGitResult(''))           // status --porcelain (clean)
      .mockReturnValueOnce(makeGitResult('deadbeef'))   // rev-parse HEAD
      .mockReturnValueOnce(makeGitResult('', 0));       // branch deckent-backup-...

    const result = createSafetyPoint('/tmp/user-project', 'sprint-001');

    expect(result.id).toBe('sprint-001');
    // Branch creation was attempted
    const branchCalls = mockSpawnSync.mock.calls.filter(c => c[1]?.includes('branch'));
    expect(branchCalls.length).toBeGreaterThan(0);
  });
});

describe('git-self-mutation-guard — rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const safetyPoint = {
    id: 'sprint-218',
    branchName: 'deckent-backup-sprint-218',
    commitSha: 'abc123',
    createdAt: new Date().toISOString(),
    wasClean: true,
  };

  it('self-project: rollback is a no-op (git reset --hard NOT called)', () => {
    mockDetectDeckentRepo.mockReturnValue(true);

    const result = rollback('/workspace', safetyPoint);

    // Should succeed without calling git
    expect(result.success).toBe(true);
    expect(result.message).toContain('self-project');
    // No git calls at all
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });

  it('self-project: rollback returns breadcrumb message', () => {
    mockDetectDeckentRepo.mockReturnValue(true);

    const result = rollback('/workspace', safetyPoint);

    expect(result.message).toBe('[rollback] self-project — git mutation skipped');
  });

  it('user-project: rollback calls git reset --hard', () => {
    mockDetectDeckentRepo.mockReturnValue(false);
    // rev-parse --verify branchName
    mockSpawnSync
      .mockReturnValueOnce(makeGitResult('abc123'))    // rev-parse --verify
      .mockReturnValueOnce(makeGitResult('abc123'))    // rev-parse branch
      .mockReturnValueOnce(makeGitResult('', 0));      // reset --hard

    const result = rollback('/tmp/user-project', safetyPoint);

    expect(result.success).toBe(true);
    const resetCalls = mockSpawnSync.mock.calls.filter(c => c[1]?.includes('reset'));
    expect(resetCalls.length).toBeGreaterThan(0);
    expect(resetCalls[0][1]).toContain('--hard');
  });
});
