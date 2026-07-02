// born-460 (task 358-011): `deckent retro` showed "Tech Debt: 0" for a sprint whose closing
// summary reported 5 tech-debt tasks. Reproduced with a sprint-357-archive-shaped fixture
// (disk-verified against .brain/sprints/sprint-357.md + .deckent/runtime/jobs/sprint-357.json,
// both of which independently confirm 12 DONE / 5 GO_WITH_TECH_DEBT / 0 NO_GO for that sprint).
//
// Root cause: `calculateMetrics` already counts `techDebtTasks` from the `evaluations` Map —
// which holds each task's Brain-final verdict (`result.brainEvaluation ?? evaluation`), NOT the
// worker's own `selfAssessment` — so the *source* count was always correct. The bug was purely
// downstream: `formatHumanRetro`'s "## Metrics" table never rendered a "Tech Debt" row, so
// `deckent retro`'s markdown parser (retro-parser.ts `debtMatch`) found nothing and fell back to
// counting literal "GO_WITH_TECH_DEBT" occurrences in the content — a string that never appears
// (the Learnings section renders "completed with tech debt" prose, not the enum literal) —
// yielding 0 regardless of the real count.

import { describe, it, expect } from 'vitest';
import { calculateMetrics } from '../../src/orchestra/sprint-metrics.js';
import { formatHumanRetro } from '../../src/orchestra/sprint-retro-writer.js';
import { TaskEvaluation } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult } from '../../src/core/types.js';

// Mirrors src/cli/commands/retro-parser.ts's debtMatch regex — the read-side consumer of the
// Metrics table row this fix adds. Kept local (not imported) since retro-parser.ts is outside
// this task's write scope; this just proves the render is parse-compatible with it.
const CLI_DEBT_ROW_RE = /\|\s*Tech Debt\s*\|\s*(\d+)\s*\|/i;

function makeTask(id: string): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Task ${id}`,
    model: 'sonnet' as Task['model'],
    effort: 'normal' as Task['effort'],
    priority: 'NORMAL' as Task['priority'],
    reason: 'test',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE' as Task['status'],
  };
}

function makeResult(taskId: string, selfAssessment: TaskResult['selfAssessment']): TaskResult {
  return {
    taskId,
    workerId: `w-${taskId}`,
    filesChanged: [],
    linesAdded: 0,
    linesRemoved: 0,
    testsPassed: true,
    coverage: 0,
    selfAssessment,
    notes: 'test',
  };
}

/** sprint-357-archive-shaped fixture: 17 tasks, 12 DONE / 5 GO_WITH_TECH_DEBT / 0 NO_GO. */
function makeSprint357LikeFixture(): {
  sprint: Sprint;
  evaluations: Map<string, TaskEvaluation>;
  results: TaskResult[];
} {
  const debtIds = new Set(['t-009', 't-010', 't-014', 't-015', 't-017']);
  const ids = Array.from({ length: 17 }, (_, i) => `t-${String(i + 1).padStart(3, '0')}`);

  const tasks = ids.map(makeTask);
  const evaluations = new Map<string, TaskEvaluation>();
  const results: TaskResult[] = [];

  for (const id of ids) {
    const brainEvaluation = debtIds.has(id) ? TaskEvaluation.GO_WITH_TECH_DEBT : TaskEvaluation.DONE;
    evaluations.set(id, brainEvaluation);
    // Forensic parity with the real sprint-357 archive: every worker self-reported DONE
    // (`result.selfAssessment`), yet 5 of these were downgraded to GO_WITH_TECH_DEBT in
    // `evaluations` (Brain's final verdict, `result.brainEvaluation ?? evaluation`). calculateMetrics
    // reads only the `evaluations` Map — never `results[].selfAssessment` — so this divergence
    // proves the count tracks the Brain verdict, not the worker's own claim.
    results.push(makeResult(id, 'DONE'));
  }

  const sprint: Sprint = {
    id: 'sprint-357',
    number: 357,
    status: 'COMPLETED' as Sprint['status'],
    phase: 'CLEANUP' as Sprint['phase'],
    tasks,
    workers: [],
    startedAt: '2026-07-02T06:14:00Z',
    completedAt: '2026-07-02T06:40:00Z',
  };

  return { sprint, evaluations, results };
}

describe('retro tech-debt/no-go counters — sourced from Brain-final verdict (born-460)', () => {
  it('calculateMetrics counts techDebtTasks from the evaluations Map (Brain-final verdict), matching the sprint-357 archive (5 debt, 0 no-go)', () => {
    const { sprint, evaluations, results } = makeSprint357LikeFixture();
    const metrics = calculateMetrics(sprint, evaluations, results);

    expect(metrics.totalTasks).toBe(17);
    expect(metrics.techDebtTasks).toBe(5);
    expect(metrics.noGoTasks).toBe(0);
    // completedTasks merges DONE + GO_WITH_TECH_DEBT (same convention as sprint-log.ts /
    // changelog.ts elsewhere) — 12 pure DONE + 5 GO_WITH_TECH_DEBT = 17.
    expect(metrics.completedTasks).toBe(17);
    expect(metrics.completedTasks - metrics.techDebtTasks).toBe(12);
  });

  it('formatHumanRetro renders a "Tech Debt" row the CLI reader can parse — was previously absent, always yielding 0', () => {
    const { sprint, evaluations, results } = makeSprint357LikeFixture();
    const metrics = calculateMetrics(sprint, evaluations, results);

    const retro = formatHumanRetro({ sprint, evaluations, metrics, results });

    expect(retro).toContain('| Tech Debt | 5 |');

    const match = retro.match(CLI_DEBT_ROW_RE);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBe(5);

    // The reported symptom: the fallback source (literal "GO_WITH_TECH_DEBT" occurrences in the
    // rendered content) never matches, because the Learnings section only ever prints prose
    // ("completed with tech debt"), never the enum literal — this is exactly why the CLI's
    // fallback regex always produced 0 before this row existed.
    expect(retro.match(/GO_WITH_TECH_DEBT/g)).toBeNull();
  });

  it('still renders "Tech Debt | 0" (not omitted) for an all-clean sprint — a missing row is what caused the silent-fallback bug in the first place', () => {
    const { sprint, results } = makeSprint357LikeFixture();
    const cleanEvaluations = new Map<string, TaskEvaluation>(
      sprint.tasks.map(t => [t.id, TaskEvaluation.DONE]),
    );
    const metrics = calculateMetrics(sprint, cleanEvaluations, results);

    expect(metrics.techDebtTasks).toBe(0);

    const retro = formatHumanRetro({ sprint, evaluations: cleanEvaluations, metrics, results });
    expect(retro).toContain('| Tech Debt | 0 |');
  });
});
