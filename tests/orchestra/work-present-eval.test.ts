// ─── Sprint 272 T-004: exit-without-result kökü (b) — workPresent → VERIFY_AND_COMPLETE ──
//
// Task 272-003 enriched the docker wrapper EXIT-trap to leave an
// `EXIT_WITHOUT_RESULT` marker carrying `workPresent` (git diff on disk),
// diffStat, and the last heartbeat when a worker finishes its work but exits
// before writing `.result` (clean exit-0 on a usage-limit / stream cut).
//
// This task consumes that marker:
//   1. classifyExitWithoutResult — turns the marker into a FIX-routing signal;
//      workPresent:true → VERIFY_AND_COMPLETE, everything else → null.
//   2. buildVerifyAndCompleteGuidance — the ADR-073 FIX prompt enrichment block
//      ("audit + finish partial work + write the missing .result", not restart).
//   3. applyVerifyAndCompleteEnrichment — wires (1)+(2) into the FIX phase by
//      appending the guidance to the fix task's description (idempotent).
//
// Regression guards: workPresent:false markers and ordinary DONE/NO_GO results
// produce no signal and no enrichment → today's crashed-NO_GO behavior.
//
// Hermetic: pure functions only — no file I/O, no docker, no spawn.

import { describe, it, expect } from 'vitest';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, TaskResult } from '../../src/core/types.js';
import {
  classifyExitWithoutResult,
  buildVerifyAndCompleteGuidance,
  VERIFY_AND_COMPLETE,
} from '../../src/orchestra/result-evaluator.js';
import { applyVerifyAndCompleteEnrichment } from '../../src/orchestra/sprint-phases.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A Task-272-003 EXIT_WITHOUT_RESULT marker (additive fields beyond TaskResult). */
function makeExitMarker(overrides: Record<string, unknown> = {}): TaskResult {
  return {
    taskId: 'orig-1',
    workerId: 'docker-orig-1',
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: false,
    coverage: 0,
    selfAssessment: 'NO_GO',
    notes: 'Worker exited without writing result (code=0, source=wrapper). EXIT_WITHOUT_RESULT marker.',
    markerType: 'EXIT_WITHOUT_RESULT',
    workPresent: true,
    diffStat: '3 files changed, 45 insertions(+), 2 deletions(-)',
    lastHbStatus: 'DONE',
    lastHbSequence: 42,
    exitCode: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, provider: 'claude', model: 'opus' },
    ...overrides,
  } as unknown as TaskResult;
}

/** An ordinary, healthy DONE result (no marker fields). */
function makeDoneResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: 'orig-1',
    workerId: 'w-orig-1',
    filesChanged: ['src/core/foo.ts', 'tests/core/foo.test.ts'],
    linesAdded: 80,
    linesRemoved: 5,
    testsPassed: true,
    coverage: 92,
    selfAssessment: 'DONE',
    notes: 'Implemented foo with tests.',
    tokenUsage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, provider: 'claude', model: 'opus' },
    ...overrides,
  };
}

/** A minimal fix task pointing at an original task via fixForTaskId. */
function makeFixTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'orig-1-fix',
    title: 'Fix: original task',
    description: 'Priority fix for NO_GO task orig-1.\n## Original Task\nDo the thing.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'CRITICAL',
    reason: 'priority-fix',
    scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/foo.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'tests pass', noGoCriteria: 'tests fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-272',
    isPriorityFix: true,
    fixForTaskId: 'orig-1',
    createdAt: '2026-06-10T00:00:00.000Z',
    ...overrides,
  } as Task;
}

// ─── 1. classifyExitWithoutResult ──────────────────────────────────────────────

describe('classifyExitWithoutResult', () => {
  it('workPresent:true marker → VERIFY_AND_COMPLETE signal + passthrough fields', () => {
    const sig = classifyExitWithoutResult(makeExitMarker());
    expect(sig.isExitWithoutResult).toBe(true);
    expect(sig.workPresent).toBe(true);
    expect(sig.signal).toBe(VERIFY_AND_COMPLETE);
    expect(sig.diffStat).toBe('3 files changed, 45 insertions(+), 2 deletions(-)');
    expect(sig.lastHbStatus).toBe('DONE');
    expect(sig.lastHbSequence).toBe(42);
  });

  it('workPresent:false marker → no signal (work-absent → today\'s behavior)', () => {
    const sig = classifyExitWithoutResult(
      makeExitMarker({ workPresent: false, diffStat: '', lastHbStatus: 'unknown', lastHbSequence: 0 }),
    );
    expect(sig.isExitWithoutResult).toBe(true);
    expect(sig.workPresent).toBe(false);
    expect(sig.signal).toBeNull();
    expect(sig.diffStat).toBe('');
  });

  it('ordinary DONE result (no markerType) → not an exit-without-result, no signal', () => {
    const sig = classifyExitWithoutResult(makeDoneResult());
    expect(sig.isExitWithoutResult).toBe(false);
    expect(sig.workPresent).toBe(false);
    expect(sig.signal).toBeNull();
    // Missing marker passthrough fields default safely.
    expect(sig.lastHbStatus).toBe('unknown');
    expect(sig.lastHbSequence).toBe(0);
  });

  it('marker missing optional passthrough fields → safe defaults, still signals', () => {
    const sig = classifyExitWithoutResult(
      makeExitMarker({ diffStat: undefined, lastHbStatus: undefined, lastHbSequence: undefined }),
    );
    expect(sig.signal).toBe(VERIFY_AND_COMPLETE);
    expect(sig.diffStat).toBe('');
    expect(sig.lastHbStatus).toBe('unknown');
    expect(sig.lastHbSequence).toBe(0);
  });
});

// ─── 2. buildVerifyAndCompleteGuidance ─────────────────────────────────────────

describe('buildVerifyAndCompleteGuidance', () => {
  it('VERIFY_AND_COMPLETE signal → audit-and-finish framing with passthrough diagnostics', () => {
    const guidance = buildVerifyAndCompleteGuidance(classifyExitWithoutResult(makeExitMarker()));
    expect(guidance).toContain('VERIFY_AND_COMPLETE');
    expect(guidance).toContain('Do NOT restart from scratch');
    expect(guidance).toContain('Write the missing');
    expect(guidance).toContain('.result');
    // passthrough diagnostics surfaced for the fix worker
    expect(guidance).toContain('3 files changed, 45 insertions(+), 2 deletions(-)');
    expect(guidance).toContain('seq 42');
  });

  it('no signal (workPresent:false) → empty string, caller leaves prompt unchanged', () => {
    const guidance = buildVerifyAndCompleteGuidance(
      classifyExitWithoutResult(makeExitMarker({ workPresent: false })),
    );
    expect(guidance).toBe('');
  });

  it('ordinary DONE result → empty guidance (regression: healthy results untouched)', () => {
    const guidance = buildVerifyAndCompleteGuidance(classifyExitWithoutResult(makeDoneResult()));
    expect(guidance).toBe('');
  });

  it('signal without diffStat → falls back to a generic "changes detected" phrase', () => {
    const guidance = buildVerifyAndCompleteGuidance(
      classifyExitWithoutResult(makeExitMarker({ diffStat: '' })),
    );
    expect(guidance).toContain('changes detected on disk');
  });
});

// ─── 3. applyVerifyAndCompleteEnrichment (FIX-phase wire) ───────────────────────

describe('applyVerifyAndCompleteEnrichment', () => {
  it('workPresent partial original → fix prompt gains verify-and-complete framing', () => {
    const fixTask = makeFixTask();
    const before = fixTask.description;
    const enriched = applyVerifyAndCompleteEnrichment([fixTask], [makeExitMarker()]);

    expect(enriched).toEqual(['orig-1-fix']);
    expect(fixTask.description).toContain(before); // original guidance preserved
    expect(fixTask.description).toContain('VERIFY_AND_COMPLETE');
    expect(fixTask.description).toContain('Do NOT restart from scratch');
  });

  it('is idempotent — a second pass does not double-append', () => {
    const fixTask = makeFixTask();
    applyVerifyAndCompleteEnrichment([fixTask], [makeExitMarker()]);
    const afterFirst = fixTask.description;
    const enrichedAgain = applyVerifyAndCompleteEnrichment([fixTask], [makeExitMarker()]);

    expect(enrichedAgain).toEqual([]); // nothing newly enriched
    expect(fixTask.description).toBe(afterFirst);
    // exactly one occurrence of the marker heading
    const occurrences = fixTask.description.split('## VERIFY_AND_COMPLETE').length - 1;
    expect(occurrences).toBe(1);
  });

  it('workPresent:false original → no enrichment (regression-safe)', () => {
    const fixTask = makeFixTask();
    const before = fixTask.description;
    const enriched = applyVerifyAndCompleteEnrichment(
      [fixTask], [makeExitMarker({ workPresent: false })],
    );
    expect(enriched).toEqual([]);
    expect(fixTask.description).toBe(before);
  });

  it('ordinary DONE original → no enrichment (real DONE results unaffected)', () => {
    const fixTask = makeFixTask();
    const before = fixTask.description;
    const enriched = applyVerifyAndCompleteEnrichment([fixTask], [makeDoneResult()]);
    expect(enriched).toEqual([]);
    expect(fixTask.description).toBe(before);
  });

  it('fix task with no matching original result → skipped, no crash', () => {
    const fixTask = makeFixTask({ fixForTaskId: 'does-not-exist' });
    const before = fixTask.description;
    const enriched = applyVerifyAndCompleteEnrichment([fixTask], [makeExitMarker()]);
    expect(enriched).toEqual([]);
    expect(fixTask.description).toBe(before);
  });
});
