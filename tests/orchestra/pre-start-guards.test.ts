import { describe, it, expect, vi, beforeEach } from 'vitest';

// born-672a GUARD-EXTRACT: target the new module directly (not through
// runPlanPhase) so the guard sequence's order + fail-soft/fail-hard
// semantics are pinned independently of PLAN-phase plumbing.

const mockCheckBuildStaleness = vi.fn();
vi.mock('../../src/orchestra/sprint-phases.js', () => ({
  checkBuildStaleness: (...args: unknown[]) => mockCheckBuildStaleness(...args),
}));

vi.mock('../../src/orchestra/sprint-lifecycle.js', () => ({
  BrainError: class BrainError extends Error {
    public readonly phase?: string;
    constructor(message: string, phase?: string) {
      super(message);
      this.name = 'BrainError';
      this.phase = phase;
    }
  },
}));

const mockCreateSafetyPoint = vi.fn();
const mockSaveSafetyPoint = vi.fn();
const mockIsGitRepo = vi.fn();
const mockCleanOrphanSafetyPoint = vi.fn();
vi.mock('../../src/orchestra/rollback.js', () => ({
  createSafetyPoint: (...args: unknown[]) => mockCreateSafetyPoint(...args),
  saveSafetyPoint: (...args: unknown[]) => mockSaveSafetyPoint(...args),
  isGitRepo: (...args: unknown[]) => mockIsGitRepo(...args),
  cleanOrphanSafetyPoint: (...args: unknown[]) => mockCleanOrphanSafetyPoint(...args),
}));

const mockRunHooks = vi.fn();
const mockRunPreSprintValidation = vi.fn();
vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: (...args: unknown[]) => mockRunHooks(...args),
  runPreSprintValidation: (...args: unknown[]) => mockRunPreSprintValidation(...args),
}));

const mockDebugLog = vi.fn();
vi.mock('../../src/core/utils.js', () => ({
  debugLog: (...args: unknown[]) => mockDebugLog(...args),
}));

import { runPreStartGuards } from '../../src/orchestra/pre-start-guards.js';
import type { ResolvedConfig, Sprint } from '../../src/core/types.js';

const baseConfig = { pre_sprint_tests: false } as unknown as ResolvedConfig;
const baseSprint: Pick<Sprint, 'id' | 'tasks'> = { id: 'sprint-test', tasks: [] };
const fakeSafetyPoint = {
  id: 'sprint-test', branchName: 'deckent-backup-sprint-test',
  commitSha: 'abc123', createdAt: '2026-01-01T00:00:00.000Z', wasClean: true,
};

describe('runPreStartGuards (born-672a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPreSprintValidation.mockReturnValue({ passed: true });
    mockRunHooks.mockResolvedValue(undefined);
    mockIsGitRepo.mockReturnValue(true);
    mockCleanOrphanSafetyPoint.mockReturnValue(false);
    mockCreateSafetyPoint.mockReturnValue(fakeSafetyPoint);
  });

  it('runs all four guards in order: staleness → CI gate → hooks → safety point', async () => {
    const order: string[] = [];
    mockCheckBuildStaleness.mockImplementation(() => { order.push('staleness'); });
    mockRunPreSprintValidation.mockImplementation(() => { order.push('ci-gate'); return { passed: true }; });
    mockRunHooks.mockImplementation(async () => { order.push('hooks'); });
    mockCreateSafetyPoint.mockImplementation(() => { order.push('safety-point'); return fakeSafetyPoint; });

    const result = await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(order).toEqual(['staleness', 'ci-gate', 'hooks', 'safety-point']);
    expect(result.safetyPoint).toEqual(fakeSafetyPoint);
  });

  it('checkBuildStaleness failure is fail-soft — remaining guards still run', async () => {
    mockCheckBuildStaleness.mockImplementation(() => { throw new Error('mtime read failed'); });

    const result = await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(mockDebugLog).toHaveBeenCalledWith('runPreStartGuards:checkBuildStaleness', expect.any(Error));
    expect(mockRunPreSprintValidation).toHaveBeenCalled();
    expect(mockRunHooks).toHaveBeenCalled();
    expect(result.safetyPoint).toEqual(fakeSafetyPoint);
  });

  it('CI/tsc gate failure throws BrainError and short-circuits hooks + safety point', async () => {
    mockRunPreSprintValidation.mockReturnValue({ passed: false, blockedReason: 'tsc failed: 3 errors' });

    await expect(runPreStartGuards('/repo', baseSprint, baseConfig, true))
      .rejects.toThrow('tsc failed: 3 errors');

    expect(mockRunHooks).not.toHaveBeenCalled();
    expect(mockCreateSafetyPoint).not.toHaveBeenCalled();
  });

  it('CI/tsc gate failure without blockedReason falls back to a default message', async () => {
    mockRunPreSprintValidation.mockReturnValue({ passed: false });

    await expect(runPreStartGuards('/repo', baseSprint, baseConfig, true))
      .rejects.toThrow('CI validation failed — sprint blocked');
  });

  it('beforeSprint hook failure is fail-soft — safety point still created', async () => {
    mockRunHooks.mockRejectedValue(new Error('hook exploded'));

    const result = await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(mockDebugLog).toHaveBeenCalledWith('runPreStartGuards:beforeSprintHook', expect.any(Error));
    expect(result.safetyPoint).toEqual(fakeSafetyPoint);
  });

  it('passes sprintId/tasks/config/projectRoot through to the beforeSprint hook context', async () => {
    const sprint: Pick<Sprint, 'id' | 'tasks'> = { id: 'sprint-xyz', tasks: [] };
    await runPreStartGuards('/repo', sprint, baseConfig, true);

    expect(mockRunHooks).toHaveBeenCalledWith('beforeSprint', {
      hook: 'beforeSprint',
      sprintId: 'sprint-xyz',
      tasks: sprint.tasks,
      config: baseConfig,
      projectRoot: '/repo',
    });
  });

  it('non-stash-pop safety-point failure is fail-soft — returns null safetyPoint, no throw', async () => {
    mockCreateSafetyPoint.mockImplementation(() => { throw new Error('git branch failed'); });

    const result = await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(result.safetyPoint).toBeNull();
    expect(mockDebugLog).toHaveBeenCalledWith('runPreStartGuards:createSafetyPoint', expect.any(Error));
  });

  it('stash-pop failure propagates as a hard error', async () => {
    mockCreateSafetyPoint.mockImplementation(() => { throw new Error('Stash pop failed: CONFLICT'); });

    await expect(runPreStartGuards('/repo', baseSprint, baseConfig, true))
      .rejects.toThrow('Stash pop failed: CONFLICT');
  });

  it('rollbackEnabled=false skips the entire safety-point guard', async () => {
    const result = await runPreStartGuards('/repo', baseSprint, baseConfig, false);

    expect(result.safetyPoint).toBeNull();
    expect(mockCleanOrphanSafetyPoint).not.toHaveBeenCalled();
    expect(mockIsGitRepo).not.toHaveBeenCalled();
    expect(mockCreateSafetyPoint).not.toHaveBeenCalled();
  });

  it('warns and skips safety-point creation when not in a git repo', async () => {
    mockIsGitRepo.mockReturnValue(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(result.safetyPoint).toBeNull();
    expect(mockCreateSafetyPoint).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not a git repository'));
    warnSpy.mockRestore();
  });

  it('cleans orphan safety points before checking the git repo', async () => {
    await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(mockCleanOrphanSafetyPoint).toHaveBeenCalledWith('/repo', 'sprint-test');
  });

  it('cleanOrphanSafetyPoint failure is fail-soft — safety point still created', async () => {
    mockCleanOrphanSafetyPoint.mockImplementation(() => { throw new Error('disk error'); });

    const result = await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(mockDebugLog).toHaveBeenCalledWith('runPreStartGuards:cleanOrphanSafetyPoint', expect.any(Error));
    expect(result.safetyPoint).toEqual(fakeSafetyPoint);
  });

  it('passes pre_sprint_tests=true through as no override (full validation)', async () => {
    const config = { pre_sprint_tests: true } as unknown as ResolvedConfig;
    await runPreStartGuards('/repo', baseSprint, config, true);

    expect(mockRunPreSprintValidation).toHaveBeenCalledWith('/repo', 'sprint-test', undefined);
  });

  it('passes pre_sprint_tests=false through as track_test_count override', async () => {
    await runPreStartGuards('/repo', baseSprint, baseConfig, true);

    expect(mockRunPreSprintValidation).toHaveBeenCalledWith('/repo', 'sprint-test', { track_test_count: false });
  });
});
