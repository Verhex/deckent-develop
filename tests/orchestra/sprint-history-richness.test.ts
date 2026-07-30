// ─── Sprint History Richness ─────────────────────────────────────
// Verifies that retrospective/sprint-log/memory entries capture WHAT a
// sprint delivered (DONE gains), not only its problems (NO_GO / tech debt),
// and that task titles surface in a clean, single-canonical-ID form.
//
// Background: `task.title` embeds the DIRECTIVES slot-id prefix ("NNN-NNN — …"),
// which can differ from the real `task.id` due to auto-debt prepend drift
// (e.g. id=198-006 but title="198-005 — …"). renderTaskLabel strips that
// prefix so labels read cleanly and the canonical id is shown exactly once.
import { describe, it, expect } from 'vitest';
import {
  renderTaskLabel,
  buildSprintEntrySummary,
  buildSprintMemoryContent,
  buildRetroHighlights,
} from '../../src/orchestra/sprint-retro-writer.js';
import { parseTaskOutcomes } from '../../scripts/sprint-retroactive-reclassify.mjs';
import { parseMemoryMd } from '../../src/core/memory-import.js';
import { TaskEvaluation, SprintPhase, SprintStatus } from '../../src/core/types.js';
import type { Sprint, Task, TaskResult, SprintMetrics } from '../../src/core/types.js';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '001',
    title: 'Test Task',
    description: 'A test task',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Test reason',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: 'DONE',
    ...overrides,
  };
}

function makeSprint(overrides: Partial<Sprint> = {}): Sprint {
  return {
    id: 'sprint-001',
    number: 1,
    status: SprintStatus.COMPLETE,
    phase: SprintPhase.RETRO,
    tasks: [makeTask()],
    workers: ['w-001'],
    startedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    completedAt: new Date('2026-01-01T01:00:00.000Z').toISOString(),
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<SprintMetrics> = {}): SprintMetrics {
  return {
    totalTasks: 1, completedTasks: 1, techDebtTasks: 0, noGoTasks: 0,
    durationMs: 100, coveragePercent: 0, noGoRate: 0, newDebtCount: 0,
    resolvedDebtCount: 0, totalOpenDebt: 0, boundaryViolations: 0,
    crossAssignments: 0, contextLinesUsed: 0, ...overrides,
  };
}

function makeResult(overrides: Partial<TaskResult> = {}): TaskResult {
  return {
    taskId: '001', workerId: 'w-001', filesChanged: ['src/foo.ts'],
    linesAdded: 50, linesRemoved: 10, testsPassed: true, coverage: 90,
    selfAssessment: 'DONE', notes: 'Done', ...overrides,
  };
}

describe('renderTaskLabel', () => {
  it('strips a leading "NNN-NNN — " slot-id prefix from the title', () => {
    const task = makeTask({ id: '224-019', title: '224-019 — pinned-input-bar DEFAULT-ON' });
    expect(renderTaskLabel(task)).toBe('pinned-input-bar DEFAULT-ON');
  });

  it('strips the title prefix even when it differs from task.id (auto-debt offset drift)', () => {
    const task = makeTask({ id: '198-006', title: '198-005 — 6-worker × 2g config verify' });
    expect(renderTaskLabel(task)).toBe('6-worker × 2g config verify');
  });

  it('returns the title unchanged when there is no slot-id prefix', () => {
    const task = makeTask({ id: '001', title: 'new sprint' });
    expect(renderTaskLabel(task)).toBe('new sprint');
  });

  it('does not strip a date-like "YYYY-MM-word" token with no spaced separator', () => {
    const task = makeTask({ id: '001', title: '2024-01-report rollup' });
    expect(renderTaskLabel(task)).toBe('2024-01-report rollup');
  });

  it('falls back to the task id when the title is empty', () => {
    const task = makeTask({ id: '042', title: '' });
    expect(renderTaskLabel(task)).toBe('042');
  });
});

describe('buildSprintEntrySummary — Task Outcomes carry clean titles', () => {
  it('appends the clean task label after the decision', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '198-006', title: '198-005 — 6-worker × 2g config verify' })],
    });
    const evals = new Map([['198-006', TaskEvaluation.DONE]]);
    const out = buildSprintEntrySummary(sprint, makeMetrics(), evals);
    expect(out).toContain('- 198-006: DONE — 6-worker × 2g config verify');
    // canonical id appears once on the line (no doubled "198-005" / "198-006")
    expect(out).not.toContain('198-005 —');
  });

  it('stays parser-safe: parseTaskOutcomes reads the enriched line correctly', () => {
    const sprint = makeSprint({
      tasks: [
        makeTask({ id: '210-001', title: '210-001 — wire routing v2' }),
        makeTask({ id: '210-002', title: '210-002 — fix flaky test' }),
      ],
    });
    const evals = new Map([
      ['210-001', TaskEvaluation.DONE],
      ['210-002', TaskEvaluation.NO_GO],
    ]);
    const out = buildSprintEntrySummary(sprint, makeMetrics(), evals);
    const parsed = parseTaskOutcomes(out);
    expect(parsed.get('210-001')).toBe('DONE');
    expect(parsed.get('210-002')).toBe('NO_GO');
  });
});

describe('buildSprintMemoryContent — captures gains, not only problems', () => {
  const sprint = makeSprint({
    tasks: [
      makeTask({ id: '224-019', title: '224-019 — pinned-input-bar DEFAULT-ON' }),
      makeTask({ id: '224-015', title: '224-015 — AI plan-mode honest fallback' }),
      makeTask({ id: '224-099', title: '224-099 — broken thing' }),
    ],
  });
  const evals = new Map([
    ['224-019', TaskEvaluation.DONE],
    ['224-015', TaskEvaluation.GO_WITH_TECH_DEBT],
    ['224-099', TaskEvaluation.NO_GO],
  ]);
  const results = [
    makeResult({ taskId: '224-019', notes: 'Pinned bar now default-on. PTY-verified.' }),
    makeResult({ taskId: '224-015', selfAssessment: 'GO_WITH_TECH_DEBT', notes: 'discriminant union fallback' }),
    makeResult({ taskId: '224-099', selfAssessment: 'NO_GO', notes: 'tests failed' }),
  ];

  it('keeps the sprint learnings header', () => {
    const out = buildSprintMemoryContent(sprint, evals, results);
    expect(out).toContain('## Sprint sprint-001 Learnings');
  });

  it('lists NO_GO and tech-debt tasks as problems', () => {
    const out = buildSprintMemoryContent(sprint, evals, results);
    expect(out).toContain('NO_GO');
    expect(out).toContain('GO_WITH_TECH_DEBT');
    expect(out).toContain('tests failed');
  });

  it('adds a Gains section naming DONE deliverables with their notes', () => {
    const out = buildSprintMemoryContent(sprint, evals, results);
    expect(out).toContain('## Gains');
    expect(out).toContain('224-019 — pinned-input-bar DEFAULT-ON');
    expect(out).toContain('Pinned bar now default-on');
  });

  it('orders problems before gains', () => {
    const out = buildSprintMemoryContent(sprint, evals, results);
    expect(out.indexOf('## Gains')).toBeGreaterThan(out.indexOf('broken thing'));
  });

  it('falls back to the task id when the title is missing — never "- undefined:"', () => {
    // Runtime task JSON can arrive without a title (observed in exported
    // learnings as "- undefined: NO_GO" lines, e.g. sprint-463/473).
    const titleless = makeSprint({
      tasks: [{ ...makeTask({ id: '463-001' }), title: undefined as unknown as string }],
    });
    const e = new Map([['463-001', TaskEvaluation.NO_GO]]);
    const out = buildSprintMemoryContent(titleless, e);
    expect(out).toContain('- 463-001: NO_GO');
    expect(out).not.toContain('undefined');
  });

  it('produces a non-empty Gains section even when all tasks are DONE', () => {
    const allDone = makeSprint({
      tasks: [makeTask({ id: 'a1', title: 'a1 — alpha' }), makeTask({ id: 'b2', title: 'b2 — beta' })],
    });
    const e = new Map([['a1', TaskEvaluation.DONE], ['b2', TaskEvaluation.DONE]]);
    const out = buildSprintMemoryContent(allDone, e);
    expect(out).toContain('## Gains');
    expect(out).toContain('alpha');
    expect(out).toContain('beta');
    expect(out).not.toContain('NO_GO');
  });

  it('caps the Gains list and summarizes the remainder', () => {
    const many = makeSprint({
      tasks: Array.from({ length: 12 }, (_, i) =>
        makeTask({ id: `t${i}`, title: `t${i} — gain ${i}` })),
    });
    const e = new Map(many.tasks.map(t => [t.id, TaskEvaluation.DONE] as const));
    const out = buildSprintMemoryContent(many, e);
    const gainLines = out.split('\n').filter(l => /^- t\d+ —/.test(l));
    expect(gainLines.length).toBeLessThanOrEqual(8);
    expect(out).toMatch(/and \d+ more delivered/);
  });
});

describe('mem content survives the export → import DB rebuild', () => {
  // memory.md is the git-tracked export that parseMemoryMd reads back to
  // rebuild memory.db. The new `## Gains` sub-header must not break section
  // slicing (which keys on `## Sprint NNN Learnings`) nor bleed across sprints.
  it('preserves ## Gains and keeps adjacent sprints separate', () => {
    const s215 = makeSprint({
      id: 'sprint-215',
      tasks: [
        makeTask({ id: '215-001', title: '215-001 — 8-provider fleet' }),
        makeTask({ id: '215-099', title: '215-099 — broken' }),
      ],
    });
    const e215 = new Map([['215-001', TaskEvaluation.DONE], ['215-099', TaskEvaluation.NO_GO]]);
    const s216 = makeSprint({
      id: 'sprint-216',
      tasks: [makeTask({ id: '216-001', title: '216-001 — serve token mint' })],
    });
    const e216 = new Map([['216-001', TaskEvaluation.DONE]]);

    // Concatenate two sprint sections the way the memory.md export lays them out.
    const md = [
      '# Sprint Learnings (auto-generated)', '',
      buildSprintMemoryContent(s216, e216), '',
      buildSprintMemoryContent(s215, e215, [
        makeResult({ taskId: '215-001', notes: 'DeepSeek+Qwen+GLM registered.' }),
      ]),
    ].join('\n');

    const parsed = parseMemoryMd(md);
    const m215 = parsed.find(p => p.sprint_num === 215)!;
    const m216 = parsed.find(p => p.sprint_num === 216)!;
    expect(m215.content).toContain('## Gains');
    expect(m215.content).toContain('215-001 — 8-provider fleet');
    expect(m215.content).toContain('DeepSeek+Qwen+GLM registered');
    expect(m215.content).toContain('NO_GO');
    expect(m216.content).not.toContain('8-provider fleet');
    expect(m215.content).not.toContain('serve token mint');
  });
});

describe('buildRetroHighlights — names delivered work', () => {
  it('lists Delivered lines for DONE tasks using clean labels', () => {
    const sprint = makeSprint({
      tasks: [makeTask({ id: '224-019', title: '224-019 — pinned-input-bar DEFAULT-ON' })],
    });
    const evals = new Map([['224-019', TaskEvaluation.DONE]]);
    const highlights = buildRetroHighlights(sprint, evals);
    expect(highlights).toContainEqual('Delivered: pinned-input-bar DEFAULT-ON');
  });

  it('caps Delivered lines at 5', () => {
    const sprint = makeSprint({
      tasks: Array.from({ length: 9 }, (_, i) => makeTask({ id: `t${i}`, title: `t${i} — gain ${i}` })),
    });
    const evals = new Map(sprint.tasks.map(t => [t.id, TaskEvaluation.DONE] as const));
    const highlights = buildRetroHighlights(sprint, evals);
    const delivered = highlights.filter(h => h.startsWith('Delivered:'));
    expect(delivered).toHaveLength(5);
  });
});
