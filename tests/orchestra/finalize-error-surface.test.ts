// ═══ FINALIZE-ERROR-SURFACE (Task 349-002) ══════════════════════════════
// Governing: ADR-G-025 (Process Resilience, Recovery & Live Observability).
//
// Live-verified defect: when `finalizeSprint` throws inside `runRetroPhase`
// (sprint-348 hit "database is locked" there), the catch block only called
// `safeDashboardUpdate` and returned `undefined` — the failure never reached
// stderr or the notify pipeline, and the caller had no way to distinguish a
// lost finalize from a real success.
//
// This suite asserts the fix: (a) the error reaches stderr AND the notify
// sink, (b) the phase result carries a `finalizeFailed: true` marker,
// (c) the sprint does not crash (fail-soft preserved — no re-throw), and
// (d) the happy path (finalizeSprint resolves) is unaffected (regression).
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SprintPhase, SprintStatus, type TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, TaskResult, ResolvedConfig, SprintMetrics } from '../../src/core/types.js';

// ─── Mock the collaborators runRetroPhase touches ─────────────────────────

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn().mockReturnValue(null),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/core/notify.js', () => ({
  notify: vi.fn().mockResolvedValue(undefined),
}));

// Same seam as tests/orchestra/phase-transition-observability.test.ts —
// `finalizeSprint` is re-exported by sprint-controller.js from
// sprint-finalizer.ts; mocking it here lets us inject a throw without
// exercising the real finalize pipeline.
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {
    constructor(msg: string, public phase: string) { super(msg); }
  },
  readContext: vi.fn(),
  planSprint: vi.fn(),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn(),
  buildSpawnRetryHint: vi.fn(),
  waitForResults: vi.fn(),
  finalizeSprint: vi.fn(),
  cleanup: vi.fn(),
}));

// ─── Imports of the module(s) under test happen AFTER the mocks register ──

import { finalizeSprint } from '../../src/orchestra/sprint-controller.js';
import { notify } from '../../src/core/notify.js';
import { runRetroPhase, type RetroPhaseFailure } from '../../src/orchestra/sprint-phases.js';

const mockedFinalizeSprint = vi.mocked(finalizeSprint);
const mockedNotify = vi.mocked(notify);

// ─── Test helpers ──────────────────────────────────────────────────────────

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-349-002-test',
    number: 349,
    status: SprintStatus.EVALUATING,
    phase: SprintPhase.EVALUATE,
    tasks: [],
    workers: [],
    startedAt: '2026-07-01T20:00:00.000Z',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    language: 'en',
    ...overrides,
  } as unknown as ResolvedConfig;
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 0,
    completedTasks: 0,
    techDebtTasks: 0,
    noGoTasks: 0,
    durationMs: 1000,
    coveragePercent: 100,
    noGoRate: 0,
    newDebtCount: 0,
    resolvedDebtCount: 0,
    totalOpenDebt: 0,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...overrides,
  };
}

function isRetroPhaseFailure(v: unknown): v is RetroPhaseFailure {
  return !!v && typeof v === 'object' && (v as RetroPhaseFailure).finalizeFailed === true;
}

// ─── Suite ──────────────────────────────────────────────────────────────

describe('Task 349-002 — FINALIZE-ERROR-SURFACE (runRetroPhase catch path)', () => {
  let root: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'deckent-finalize-error-'));
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });

  it('regression: finalizeSprint success still returns metrics, no notify/stderr noise', async () => {
    const metrics = makeMetrics({ totalTasks: 3, completedTasks: 3 });
    mockedFinalizeSprint.mockResolvedValue(metrics);

    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>();
    const result = await runRetroPhase(root, sprint, evaluations, [], makeConfig());

    expect(result).toEqual(metrics);
    expect(isRetroPhaseFailure(result)).toBe(false);
    expect(mockedNotify).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('a throwing finalizeSprint reaches stderr, fires notify, and returns the finalizeFailed marker (no re-throw)', async () => {
    mockedFinalizeSprint.mockRejectedValue(new Error('database is locked'));

    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>();

    // Fail-soft: the call must resolve, never reject.
    const result = await runRetroPhase(root, sprint, evaluations, [], makeConfig());

    // (a) error reaches stderr
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0]?.[0]).toEqual(expect.stringContaining('database is locked'));

    // (a) error reaches the notify sink — critical priority ('human-checkpoint-required')
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    const [event, sprintId, title, summary, details] = mockedNotify.mock.calls[0]!;
    expect(event).toBe('human-checkpoint-required');
    expect(sprintId).toBe(sprint.id);
    expect(title).toEqual(expect.stringContaining('finalize'));
    expect(summary).toEqual(expect.stringContaining('database is locked'));
    expect(details).toBe('database is locked');

    // (b) the phase result carries the finalize-failed marker
    expect(isRetroPhaseFailure(result)).toBe(true);
    expect(result).toEqual({ finalizeFailed: true, error: 'database is locked' } satisfies RetroPhaseFailure);
  });

  it('localizes the notice for config.language "tr" (i18n-first — not hardcoded to one language)', async () => {
    mockedFinalizeSprint.mockRejectedValue(new Error('database is locked'));

    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>();
    await runRetroPhase(root, sprint, evaluations, [], makeConfig({ language: 'tr' }));

    expect(mockedNotify).toHaveBeenCalledTimes(1);
    const [, , title, summary] = mockedNotify.mock.calls[0]!;
    // Turkish notice — distinct copy from the English default, not a raw passthrough.
    expect(title).toEqual(expect.stringContaining('başarısız'));
    expect(summary).toEqual(expect.stringContaining('finalizeSprint'));
  });

  it('a non-Error throw (e.g. a rejected string) is still surfaced without crashing', async () => {
    mockedFinalizeSprint.mockRejectedValue('boom' as unknown as Error);

    const sprint = makeSprint();
    const evaluations = new Map<string, TaskEvaluation>();
    const result = await runRetroPhase(root, sprint, evaluations, [], makeConfig());

    expect(isRetroPhaseFailure(result)).toBe(true);
    expect((result as RetroPhaseFailure).error).toBe('boom');
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });
});
