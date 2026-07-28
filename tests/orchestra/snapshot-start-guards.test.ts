// ═══ Sprint 427 Task 427-019 — GUARD-WIRE (born-672b) ═══════════════
//
// Pins the fix for 426-001's honest security regression: `runSprint`'s
// `opts.preplannedSprint` (TERM-FLOW-UNIFY Sprint-4, flag-on) branch used to
// skip the 4 pre-start guards (build-staleness, CI/tsc gate, beforeSprint
// hooks, git rollback safety point) along with `planSprint()` — only
// planning was ever meant to be skipped. `resolvePlanPhaseResult` (extracted
// from `runSprint`'s Fresh Path, sprint-controller.ts) is the wiring under
// test here.
//
// `runPreStartGuards`'s own guard-sequence semantics (order, fail-soft vs
// fail-hard per guard) are already pinned by 427-018's
// tests/orchestra/pre-start-guards.test.ts — fully mocked here so this file
// stays a pure wiring/contract test. `runPlanPhase` is spied (not replaced
// wholesale — `importOriginal` keeps every other sprint-phases.js export
// real) so the flag-off delegation can be asserted without exercising its
// heavy real implementation (readContext/planSprint/disk I/O).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunPlanPhase = vi.fn();
vi.mock('../../src/orchestra/sprint-phases.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/orchestra/sprint-phases.js')>();
  return {
    ...actual,
    runPlanPhase: (...args: unknown[]) => mockRunPlanPhase(...args),
  };
});

const mockRunPreStartGuards = vi.fn();
vi.mock('../../src/orchestra/pre-start-guards.js', () => ({
  runPreStartGuards: (...args: unknown[]) => mockRunPreStartGuards(...args),
}));

import {
  resolvePlanPhaseResult,
  runExactPlanAdmissionHooks,
} from '../../src/orchestra/sprint-controller.js';
import { BrainError } from '../../src/orchestra/sprint-lifecycle.js';
import { SprintPhase } from '../../src/core/types.js';
import type { ResolvedConfig, Sprint } from '../../src/core/types.js';

const baseConfig = { pre_sprint_tests: false } as unknown as ResolvedConfig;

function makePreplannedSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-flow-9',
    number: 9,
    tasks: [],
    status: 'PLANNING',
    phase: SprintPhase.PLAN,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as Sprint;
}

const fakeSafetyPoint = {
  id: 'sprint-flow-9', branchName: 'deckent-backup-sprint-flow-9',
  commitSha: 'abc123', createdAt: '2026-01-01T00:00:00.000Z', wasClean: true,
};

describe('exact plan admission hooks', () => {
  it('materializes before publishing exact execution admission', async () => {
    const order: string[] = [];
    await runExactPlanAdmissionHooks(makePreplannedSprint(), {
      exactPlanAuthority: {
        flowId: 'flow-exact',
        revision: 1,
        planDigest: 'digest-exact',
      },
      onExactPlanMaterialize: () => {
        order.push('materialized');
      },
      onExecutionAdmitted: () => {
        order.push('admitted');
      },
    });

    expect(order).toEqual(['materialized', 'admitted']);
  });

  it('does not publish admission when exact materialization fails', async () => {
    const admitted = vi.fn();
    await expect(runExactPlanAdmissionHooks(makePreplannedSprint(), {
      exactPlanAuthority: {
        flowId: 'flow-exact',
        revision: 1,
        planDigest: 'digest-exact',
      },
      onExactPlanMaterialize: () => {
        throw new Error('materialization failed');
      },
      onExecutionAdmitted: admitted,
    })).rejects.toThrow('materialization failed');

    expect(admitted).not.toHaveBeenCalled();
  });
});

describe('resolvePlanPhaseResult (born-672b GUARD-WIRE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunPreStartGuards.mockResolvedValue({ safetyPoint: fakeSafetyPoint });
  });

  describe('flag-on: opts.preplannedSprint set', () => {
    it('runs the 4 guards via runPreStartGuards instead of runPlanPhase', async () => {
      const sprint = makePreplannedSprint();

      const result = await resolvePlanPhaseResult(
        '/repo', baseConfig, { preplannedSprint: sprint }, null, true,
      );

      expect(mockRunPreStartGuards).toHaveBeenCalledTimes(1);
      expect(mockRunPreStartGuards).toHaveBeenCalledWith('/repo', sprint, baseConfig, true);
      expect(mockRunPlanPhase).not.toHaveBeenCalled();
      expect(result.sprint).toBe(sprint);
      expect(result.safetyPoint).toEqual(fakeSafetyPoint);
    });

    it('threads rollbackEnabled=false through to runPreStartGuards', async () => {
      const sprint = makePreplannedSprint();
      mockRunPreStartGuards.mockResolvedValue({ safetyPoint: null });

      await resolvePlanPhaseResult('/repo', baseConfig, { preplannedSprint: sprint }, null, false);

      expect(mockRunPreStartGuards).toHaveBeenCalledWith('/repo', sprint, baseConfig, false);
    });

    it('sets sprint.startedAt when absent', async () => {
      const sprint = makePreplannedSprint({ startedAt: undefined });

      const result = await resolvePlanPhaseResult(
        '/repo', baseConfig, { preplannedSprint: sprint }, null, true,
      );

      expect(result.sprint.startedAt).toBeDefined();
      expect(() => new Date(result.sprint.startedAt as string)).not.toThrow();
    });

    it('preserves an existing sprint.startedAt (does not overwrite)', async () => {
      const sprint = makePreplannedSprint({ startedAt: '2025-06-01T00:00:00.000Z' });

      const result = await resolvePlanPhaseResult(
        '/repo', baseConfig, { preplannedSprint: sprint }, null, true,
      );

      expect(result.sprint.startedAt).toBe('2025-06-01T00:00:00.000Z');
    });

    it('wraps a BrainError thrown by the CI/tsc gate as "Plan phase failed: ..." (SprintPhase.PLAN)', async () => {
      const sprint = makePreplannedSprint();
      mockRunPreStartGuards.mockRejectedValue(
        new BrainError('tsc failed: 3 errors', SprintPhase.PLAN),
      );

      await expect(
        resolvePlanPhaseResult('/repo', baseConfig, { preplannedSprint: sprint }, null, true),
      ).rejects.toMatchObject({
        name: 'BrainError',
        message: 'Plan phase failed: tsc failed: 3 errors',
        phase: SprintPhase.PLAN,
      });
    });

    it('wraps a plain Error thrown by a stash-pop conflict the same way', async () => {
      const sprint = makePreplannedSprint();
      mockRunPreStartGuards.mockRejectedValue(new Error('Stash pop failed: CONFLICT'));

      await expect(
        resolvePlanPhaseResult('/repo', baseConfig, { preplannedSprint: sprint }, null, true),
      ).rejects.toMatchObject({
        name: 'BrainError',
        message: 'Plan phase failed: Stash pop failed: CONFLICT',
        phase: SprintPhase.PLAN,
      });
    });
  });

  describe('flag-off: opts.preplannedSprint absent — bit-exact delegation', () => {
    it('delegates straight to runPlanPhase with the same 5 args, unchanged', async () => {
      const plannedSprint = makePreplannedSprint({ id: 'sprint-fresh-1' });
      mockRunPlanPhase.mockResolvedValue({ sprint: plannedSprint, safetyPoint: fakeSafetyPoint });
      const opts = { autoApprove: true };
      const activeProvider = { name: 'claude' } as never;

      const result = await resolvePlanPhaseResult('/repo', baseConfig, opts, activeProvider, true);

      expect(mockRunPlanPhase).toHaveBeenCalledTimes(1);
      expect(mockRunPlanPhase).toHaveBeenCalledWith('/repo', baseConfig, opts, activeProvider, true);
      expect(mockRunPreStartGuards).not.toHaveBeenCalled();
      expect(result).toEqual({ sprint: plannedSprint, safetyPoint: fakeSafetyPoint });
    });

    it('delegates to runPlanPhase when opts is undefined', async () => {
      const plannedSprint = makePreplannedSprint({ id: 'sprint-fresh-2' });
      mockRunPlanPhase.mockResolvedValue({ sprint: plannedSprint, safetyPoint: null });

      const result = await resolvePlanPhaseResult('/repo', baseConfig, undefined, null, true);

      expect(mockRunPlanPhase).toHaveBeenCalledWith('/repo', baseConfig, undefined, null, true);
      expect(mockRunPreStartGuards).not.toHaveBeenCalled();
      expect(result.sprint).toBe(plannedSprint);
    });

    it('propagates a runPlanPhase rejection unchanged (no double-wrapping)', async () => {
      const err = new BrainError('Plan phase failed: tsc failed: 1 error', SprintPhase.PLAN);
      mockRunPlanPhase.mockRejectedValue(err);

      await expect(
        resolvePlanPhaseResult('/repo', baseConfig, undefined, null, true),
      ).rejects.toBe(err);
    });
  });
});
