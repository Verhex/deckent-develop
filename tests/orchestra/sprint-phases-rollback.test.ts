import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies before importing the module under test
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
    readdirSync: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../src/core/utils.js', () => ({
  readJsonSafe: vi.fn(),
  parseDebtTable: vi.fn().mockReturnValue([]),
  debugLog: vi.fn(),
}));

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true }),
  parseTscErrorFiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn().mockReturnValue(null),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: vi.fn().mockReturnValue([]) })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: vi.fn().mockReturnValue([]) })),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn().mockReturnValue(''),
}));

vi.mock('../../src/orchestra/sprint-reporter.js', () => ({
  calculateMetrics: vi.fn(),
}));

vi.mock('../../src/orchestra/result-evaluator.js', () => ({
  evaluateWithRubric: vi.fn(),
}));

vi.mock('../../src/orchestra/result-collector.js', () => ({
  buildResultsMap: vi.fn().mockReturnValue(new Map()),
}));

vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {
    constructor(msg: string, public phase: string) { super(msg); }
  },
  readContext: vi.fn().mockReturnValue({ memory: '', retro: '', patterns: '', debt: '' }),
  planSprint: vi.fn().mockResolvedValue({
    id: 'sprint-test',
    number: 2,
    tasks: [],
    workers: [],
    phase: 'PLAN',
    status: 'PLANNING',
    startedAt: '',
  }),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn().mockResolvedValue([]),
  buildSpawnRetryHint: vi.fn().mockReturnValue(''),
  waitForResults: vi.fn().mockResolvedValue([]),
  finalizeSprint: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import type { SpawnSyncReturns } from 'node:child_process';
import { runPlanPhase } from '../../src/orchestra/sprint-phases.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const mockSpawnSync = vi.mocked(spawnSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockRmSync = vi.mocked(rmSync);

function makeResult(stdout: string, stderr = '', status = 0): SpawnSyncReturns<string> {
  return { stdout, stderr, status, pid: 1, output: [], signal: null, error: undefined };
}

const baseConfig = {
  activeModeConfig: { max_workers: 4 },
  rollback_policy: 'auto',
} as unknown as ResolvedConfig;

describe('runPlanPhase — rollback integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cleans orphan safety point from previous sprint before creating new one', async () => {
    // cleanOrphanSafetyPoint: loadSafetyPoint finds stale file
    const staleData = JSON.stringify({
      id: 'sprint-old',
      branchName: 'deckent-backup-sprint-old',
      commitSha: 'abc',
      createdAt: '2026-01-01T00:00:00.000Z',
      wasClean: true,
    });
    mockExistsSync
      .mockReturnValueOnce(true)   // loadSafetyPoint → file exists (orphan check)
      .mockReturnValueOnce(true);  // .deckent dir exists (saveSafetyPoint)
    mockReadFileSync.mockReturnValueOnce(staleData);

    // safetyBranchExists for orphan → not found
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not found', 128));
    // isGitRepo → yes
    mockSpawnSync.mockReturnValueOnce(makeResult('.git'));
    // isCleanWorkingTree → clean
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    // getCurrentCommitSha
    mockSpawnSync.mockReturnValueOnce(makeResult('newsha'));
    // git branch
    mockSpawnSync.mockReturnValueOnce(makeResult(''));

    const result = await runPlanPhase('/repo', baseConfig, undefined, null, true);
    expect(result.safetyPoint).not.toBeNull();
    expect(result.safetyPoint?.commitSha).toBe('newsha');
    // Orphan JSON should have been cleaned
    expect(mockRmSync).toHaveBeenCalled();
  });

  it('warns and skips safety point when not in a git repo', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // cleanOrphanSafetyPoint: no file
    mockExistsSync.mockReturnValueOnce(false);
    // isGitRepo → no
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'not a git repo', 128));

    const result = await runPlanPhase('/repo', baseConfig, undefined, null, true);
    expect(result.safetyPoint).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a git repository'),
    );
    warnSpy.mockRestore();
  });

  it('propagates stash pop failure as a hard error (BULGU 3)', async () => {
    // cleanOrphanSafetyPoint: no file
    mockExistsSync.mockReturnValueOnce(false);
    // isGitRepo → yes
    mockSpawnSync.mockReturnValueOnce(makeResult('.git'));
    // isCleanWorkingTree → dirty
    mockSpawnSync.mockReturnValueOnce(makeResult(' M src/foo.ts'));
    // git stash push → success
    mockSpawnSync.mockReturnValueOnce(makeResult('Saved'));
    // getCurrentCommitSha
    mockSpawnSync.mockReturnValueOnce(makeResult('sha1'));
    // git branch → success
    mockSpawnSync.mockReturnValueOnce(makeResult(''));
    // git stash pop → fail
    mockSpawnSync.mockReturnValueOnce(makeResult('', 'CONFLICT', 1));

    await expect(
      runPlanPhase('/repo', baseConfig, undefined, null, true),
    ).rejects.toThrow(/Stash pop failed|Plan phase failed/);
  });
});
