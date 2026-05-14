/**
 * Sprint 168 W2.5 — content-generators sprint-metrics wire (C0d follow-up).
 *
 * C0d shipped `computeSprintMetrics({ startMs, endMs, totalLines, coveredLines })`
 * — a pure helper that guards against:
 *   - durationMs = Math.max(0, endMs - startMs)   (never negative)
 *   - coverageRatio = totalLines > 0 ? n/d : null  (never NaN)
 *
 * BUT the actual CLAUDE.md renderer in content-generators.ts:146-157 still
 * called the raw `Math.floor(metrics.durationMs / 60000)` + naked
 * `coveragePercent.toFixed(1)`, so Sprint 167 NaN%/-1dk leaks remained.
 *
 * This wire test asserts the renderer output for the regression scenarios:
 *   1. metrics.durationMs < 0    → renderer guards to "0dk 0sn" (no negatives)
 *   2. metrics.coveragePercent NaN → renderer emits "N/A" (no "NaN%")
 *   3. Normal case still renders correctly (5min 0s, 95.5%)
 *
 * The wire site is `register({ id: 'sprint-metrics', generate(ctx) {...} })`.
 */
import { describe, it, expect } from 'vitest';
import { findGenerator } from '../../../src/orchestra/managed-docs/content-generators.js';
import { TaskEvaluation } from '../../../src/core/types.js';
import type { DocUpdateContext } from '../../../src/orchestra/doc-updaters/types.js';
import type { ResolvedConfig, Sprint, SprintMetrics } from '../../../src/core/types.js';

function makeCtx(metricsOverrides: Partial<SprintMetrics> = {}): DocUpdateContext {
  const metrics: SprintMetrics = {
    totalTasks: 5,
    completedTasks: 4,
    techDebtTasks: 1,
    noGoTasks: 0,
    durationMs: 300_000, // 5 minutes
    coveragePercent: 95.5,
    noGoRate: 0,
    newDebtCount: 1,
    resolvedDebtCount: 0,
    totalOpenDebt: 3,
    boundaryViolations: 0,
    crossAssignments: 0,
    contextLinesUsed: 0,
    ...metricsOverrides,
  };

  const sprint = {
    id: 'sprint-168',
    number: 168,
    tasks: [],
  } as unknown as Sprint;

  const evaluations = new Map<string, TaskEvaluation>();

  return {
    projectRoot: process.cwd(),
    sprintResult: { sprint, evaluations, metrics },
    config: { auto_docs: { tier1: true, tier2: true, tier3: true } } as ResolvedConfig,
    isInternalProject: false,
  };
}

describe('sprint-metrics generator — wire to computeSprintMetrics guards (Sprint 168 W2.5)', () => {
  it('renders "N/A" instead of "NaN%" when coveragePercent is NaN', () => {
    const ctx = makeCtx({ coveragePercent: NaN });
    const g = findGenerator('Sprint Metrics');
    expect(g).not.toBeNull();
    const out = g!.generate(ctx);

    // Sprint 167 regression: "Coverage: NaN%" appeared in CLAUDE.md after finalize.
    // After wire, the renderer must emit a sentinel ("N/A") when coverage is not finite.
    expect(out).not.toContain('NaN');
    expect(out).toMatch(/Coverage.*N\/A/);
  });

  it('renders non-negative duration when metrics.durationMs is negative', () => {
    // Sprint 167 regression: "Duration: -1dk -1sn"
    const ctx = makeCtx({ durationMs: -1500 });
    const g = findGenerator('Sprint Metrics');
    const out = g!.generate(ctx);

    // Wire guard: Math.max(0, durationMs) before format. No leading '-' allowed.
    expect(out).not.toMatch(/Duration.*-\d/);
    expect(out).toMatch(/Duration.*0dk 0sn/);
  });

  it('renders normal coverage and duration unchanged when inputs are valid', () => {
    const ctx = makeCtx({ durationMs: 5 * 60_000 + 30_000, coveragePercent: 87.25 });
    const g = findGenerator('Sprint Metrics');
    const out = g!.generate(ctx);

    expect(out).toContain('Duration | 5dk 30sn');
    expect(out).toContain('Coverage | 87.3%'); // toFixed(1)
  });

  it('renders "N/A" when coveragePercent is Infinity', () => {
    // Defensive: divide-by-zero edge case can produce Infinity, not just NaN.
    const ctx = makeCtx({ coveragePercent: Infinity });
    const g = findGenerator('Sprint Metrics');
    const out = g!.generate(ctx);
    expect(out).not.toContain('Infinity');
    expect(out).toMatch(/Coverage.*N\/A/);
  });
});
