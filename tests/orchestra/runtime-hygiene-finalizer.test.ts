import { describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from '../../src/core/types.js';
import type { RuntimeHygieneApplyResult } from '../../src/core/runtime-hygiene.js';

const { mockReconcileRuntimeHygiene } = vi.hoisted(() => ({
  mockReconcileRuntimeHygiene: vi.fn(),
}));
vi.mock('../../src/core/runtime-hygiene.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/runtime-hygiene.js')>();
  return { ...actual, reconcileRuntimeHygiene: mockReconcileRuntimeHygiene };
});

import {
  FinalizerRuntimeHygieneHoldError,
  runConfiguredRuntimeHygieneAfterFinalize,
} from '../../src/orchestra/sprint-finalizer.js';

function config(overrides: { enabled?: boolean; applyOnFinalize?: boolean } = {}): ResolvedConfig {
  return {
    runtime_artifact_retention: {
      enabled: overrides.enabled ?? true,
      apply_on_finalize: overrides.applyOnFinalize ?? true,
      archive_path: '.deckent/archive/configured-runtime/',
      families: {
        runtime: { max_age_days: 9, max_count: 37, max_size_mb: 41 },
        recent: { max_age_days: 4, max_count: 17, max_size_mb: 19 },
      },
    },
  } as ResolvedConfig;
}

function result(status: 'complete' | 'partial' = 'complete'): RuntimeHygieneApplyResult {
  return {
    receiptPath: '.deckent/archive/configured-runtime/receipts/digest.json',
    receiptState: 'published',
    receipt: {
      kind: 'deckent.runtime-hygiene-receipt', version: 1, planDigest: 'digest', status,
      counters: {} as RuntimeHygieneApplyResult['receipt']['counters'],
      outcomes: status === 'partial'
        ? [{ family: 'jobs', attempted: 1, retired: 0, retiredBytes: 0, failures: ['job:held'] }]
        : [],
    },
  };
}

describe('finalizer runtime hygiene wiring', () => {
  it('is default-off and never invokes destructive hygiene without both opt-ins', () => {
    expect(runConfiguredRuntimeHygieneAfterFinalize('/project', 'sprint-625', config({ enabled: false }), {
      receiptCleanupEligible: true, archiveVerified: true,
    })).toEqual({ state: 'skipped', reason: 'disabled' });
    expect(runConfiguredRuntimeHygieneAfterFinalize('/project', 'sprint-625', config({ applyOnFinalize: false }), {
      receiptCleanupEligible: true, archiveVerified: true,
    })).toEqual({ state: 'skipped', reason: 'disabled' });
    expect(mockReconcileRuntimeHygiene).not.toHaveBeenCalled();
  });

  it('never runs before terminal receipt eligibility and archive verification', () => {
    const resolved = config();
    expect(runConfiguredRuntimeHygieneAfterFinalize('/project', 'sprint-625', resolved, {
      receiptCleanupEligible: false, archiveVerified: true,
    })).toEqual({ state: 'skipped', reason: 'not-terminal' });
    expect(runConfiguredRuntimeHygieneAfterFinalize('/project', 'sprint-625', resolved, {
      receiptCleanupEligible: true, archiveVerified: false,
    })).toEqual({ state: 'skipped', reason: 'not-terminal' });
    expect(mockReconcileRuntimeHygiene).not.toHaveBeenCalled();
  });

  it('retains resolved windows and writes configurable output below the configured archive root', () => {
    mockReconcileRuntimeHygiene.mockReturnValueOnce(result());
    const applied = runConfiguredRuntimeHygieneAfterFinalize('/project', 'sprint-625', config(), {
      receiptCleanupEligible: true, archiveVerified: true,
    });
    expect(applied.state).toBe('applied');
    expect(mockReconcileRuntimeHygiene).toHaveBeenCalledWith('/project', {
      apply: true, sprintIds: ['sprint-625'], currentSprintIds: [],
      jobBounds: { max_age_days: 9, max_count: 37, max_size_mb: 41 },
      flow: { staleAfterMs: 777_600_000, archiveRoot: '.deckent/archive/configured-runtime/run-flows' },
      logs: { maxAgeDays: 9, archiveRoot: '.deckent/archive/configured-runtime/logs' },
      receiptRoot: '.deckent/archive/configured-runtime/receipts',
    });
    expect(JSON.stringify(mockReconcileRuntimeHygiene.mock.calls[0])).not.toContain('.tasks/archive');
  });

  it('surfaces partial receipts and thrown failures as typed HOLD evidence', () => {
    mockReconcileRuntimeHygiene.mockReturnValueOnce(result('partial'));
    expect(() => runConfiguredRuntimeHygieneAfterFinalize('/project', 'sprint-625', config(), {
      receiptCleanupEligible: true, archiveVerified: true,
    })).toThrowError(expect.objectContaining({
      name: 'FinalizerRuntimeHygieneHoldError', code: 'RUNTIME_HYGIENE_FINALIZER_HOLD',
      reasonCode: 'RUNTIME_HYGIENE_PARTIAL',
      evidence: expect.objectContaining({ receiptPath: expect.stringContaining('/receipts/') }),
    }));

    const failure = new Error('inventory bound exceeded');
    mockReconcileRuntimeHygiene.mockImplementationOnce(() => { throw failure; });
    try {
      runConfiguredRuntimeHygieneAfterFinalize('/project', 'sprint-625', config(), {
        receiptCleanupEligible: true, archiveVerified: true,
      });
      expect.unreachable('expected typed HOLD');
    } catch (error) {
      expect(error).toBeInstanceOf(FinalizerRuntimeHygieneHoldError);
      expect((error as FinalizerRuntimeHygieneHoldError).reasonCode).toBe('RUNTIME_HYGIENE_EXECUTION_FAILED');
      expect((error as Error).cause).toBe(failure);
    }
  });
});
